// scratch3_pose/index.js
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');

// ---- MediaPipe singletons (lazy-loaded) ----
let _vision = null; // module with {FilesetResolver, PoseLandmarker}
let _pose = null;   // PoseLandmarker instance

// ---- Keypoint indices (MediaPipe Pose 33) ----
const PARTS = {
  nose: 0,
  left_eye_inner: 1, left_eye: 2, left_eye_outer: 3,
  right_eye_inner: 4, right_eye: 5, right_eye_outer: 6,
  left_ear: 7, right_ear: 8,
  mouth_left: 9, mouth_right: 10,
  left_shoulder: 11, right_shoulder: 12,
  left_elbow: 13, right_elbow: 14,
  left_wrist: 15, right_wrist: 16,
  left_pinky: 17, right_pinky: 18,
  left_index: 19, right_index: 20,
  left_thumb: 21, right_thumb: 22,
  left_hip: 23, right_hip: 24,
  left_knee: 25, right_knee: 26,
  left_ankle: 27, right_ankle: 28,
  left_heel: 29, right_heel: 30,
  left_foot_index: 31, right_foot_index: 32
};

class Scratch3Pose {
  constructor (runtime) {
    if (!runtime) throw new Error('Scratch3Pose: runtime missing');
    this.runtime = runtime;

    // state
    this._video = null;
    this._running = false;
    this._targetFPS = 15;
    this._lastTick = 0;
    this._drawOverlay = false;
    this._poses = []; // array of 33 keypoints for the first pose
    this._usesScratchVideo = false;


    // stage mapping (Scratch stage ~ 480x360, (0,0) center)
    this._stageW = 480;
    this._stageH = 360;

    if (this.runtime && typeof this.runtime.on === 'function') {
      this.runtime.on('PROJECT_RUN_START', () => this._kick());
      this.runtime.on('PROJECT_RUN_STOP',  () => this._stop());
    }
  }

  getInfo () {
    return {
      id: 'pose', // MUST match extensionId in GUI tile
      name: 'Pose',
      blocks: [
        {
          opcode: 'start',
          blockType: BlockType.COMMAND,
          text: 'start pose detection (FPS [FPS])',
          arguments: { FPS: { type: ArgumentType.NUMBER, defaultValue: 15 } }
        },
        { opcode: 'stop', blockType: BlockType.COMMAND, text: 'stop pose detection' },
        {
          opcode: 'draw',
          blockType: BlockType.COMMAND,
          text: 'draw skeleton [ONOFF]',
          arguments: { ONOFF: { type: ArgumentType.STRING, menu: 'onoff', defaultValue: 'on' } }
        },

        { opcode: 'count', blockType: BlockType.REPORTER, text: 'bodies detected' },

        { opcode: 'getX', blockType: BlockType.REPORTER, text: '[POINT] x',
          arguments: { POINT: { type: ArgumentType.STRING, menu: 'partmenu', defaultValue: 'nose' } } },
        { opcode: 'getY', blockType: BlockType.REPORTER, text: '[POINT] y',
          arguments: { POINT: { type: ArgumentType.STRING, menu: 'partmenu', defaultValue: 'nose' } } },
        { opcode: 'getV', blockType: BlockType.REPORTER, text: '[POINT] visibility',
          arguments: { POINT: { type: ArgumentType.STRING, menu: 'partmenu', defaultValue: 'nose' } } },

        { opcode: 'poseLeftUp',  blockType: BlockType.BOOLEAN, text: 'pose: left hand up' },
        { opcode: 'poseRightUp', blockType: BlockType.BOOLEAN, text: 'pose: right hand up' },
        { opcode: 'poseBothUp',  blockType: BlockType.BOOLEAN, text: 'pose: both hands up' },
        { opcode: 'poseHoriz',   blockType: BlockType.BOOLEAN, text: 'pose: hands horizontal' },
        { opcode: 'poseLevel',   blockType: BlockType.BOOLEAN, text: 'pose: hands level' },
        { opcode: 'poseNearHead',blockType: BlockType.BOOLEAN, text: 'pose: hands near head' }
      ],
      menus: {
        onoff: { items: ['on', 'off'] },
        partmenu: { items: Object.keys(PARTS) }
      }
    };
  }

  // ----------------- Blocks -----------------

  async start (args) {
    const fps = Number(args?.FPS) || 15;
    this._targetFPS = Math.max(1, Math.min(60, fps));
    await this._ensureReady();
    this._running = true;
    this._kick();
  }

  async stop () {
    this._running = false;
    await this._shutdownVision();
    await this._releaseCamera();
    this._emitOverlay(true);
  }

  async turnCameraOff () {
    await this.stop();
  }

  // stop () { this._stop(); }

  draw (args) {
    const v = String(args?.ONOFF || 'on').toLowerCase();
    this._drawOverlay = (v === 'on' || v === 'true' || v === '1');
    if (!this._drawOverlay) this._emitOverlay(true);
  }

  count () {
    return this._poses.length ? 1 : 0; // reporting 1 pose (extend to multi-pose if needed)
  }

  getX (args) { const p = this._getPartXY(args?.POINT); return p ? p.x : ''; }
  getY (args) { const p = this._getPartXY(args?.POINT); return p ? p.y : ''; }
  getV (args) { const p = this._getPartXY(args?.POINT); return (p && typeof p.visibility === 'number') ? p.visibility : ''; }

  poseLeftUp ()  { const o = this._partsAsObj(); return o && this._above(o.left_wrist,  o.left_shoulder); }
  poseRightUp () { const o = this._partsAsObj(); return o && this._above(o.right_wrist, o.right_shoulder); }
  poseBothUp ()  { const o = this._partsAsObj(); return o && this._above(o.left_wrist,  o.left_shoulder) && this._above(o.right_wrist, o.right_shoulder); }
  poseHoriz ()   { const o = this._partsAsObj(); return o && this._nearHoriz(o.left_wrist, o.right_wrist); }
  poseLevel ()   { const o = this._partsAsObj(); return o && this._level(o.left_wrist, o.right_wrist); }
  poseNearHead (){ const o = this._partsAsObj(); return o && (this._nearY(o.left_wrist, o.nose) || this._nearY(o.right_wrist, o.nose)); }

  // ----------------- Loop -----------------

  async _kick () {
    if (!this._running) return;
    const now = performance.now();
    const minDelta = 1000 / (this._targetFPS || 15);
    const elapsed = now - this._lastTick;
    if (elapsed < minDelta) {
      setTimeout(() => this._kick(), (minDelta - elapsed) | 0);
      return;
    }
    this._lastTick = now;

    try {
      const video = await this._ensureVideo();
      if (_pose && video?.videoWidth) {
        const res = await _pose.detectForVideo(video, now);
        const poses = res?.landmarks || res?.poseLandmarks || [];
        this._poses = poses[0] || []; // first pose only for now

        if (this._drawOverlay) this._emitOverlay(false);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[scratch3_pose] detect error:', e);
    }

    setTimeout(() => this._kick(), 0);
  }

  _stop () {
    this._running = false;
    this._emitOverlay(true);
  }

  // ----------------- Init & I/O -----------------

  async _ensureReady () {
    if (_vision && _pose) return;

    // Build an absolute URL for the bundle and tell webpack to ignore it.
    const origin =
      (typeof window !== 'undefined' && window.location && window.location.origin)
        ? window.location.origin : '';
    const bundleURL = `${origin}/static/mediapipe/vision/vision_bundle.mjs`;

    if (!_vision) {
      // IMPORTANT: webpackIgnore keeps this as a runtime-only import (no bundling)
      // eslint-disable-next-line no-unused-expressions
      _vision = await import(/* webpackIgnore: true */ bundleURL);
    }
    const { FilesetResolver, PoseLandmarker } = _vision;

    // WASM base folder (served by GUI dev server / production build)
    const wasmBase = `${origin}/static/mediapipe/vision/wasm`;
    const fileset = await FilesetResolver.forVisionTasks(wasmBase);

    // Model file path (ensure it exists under static/.../models/)
    const modelPath = `${origin}/static/mediapipe/vision/models/pose_landmarker_lite.task`;
    _pose = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelPath, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: false
    });

    await this._ensureVideo();
  }

  async _ensureVideo () {
    if (this._video) return this._video;

    const videoDevice = this.runtime?.ioDevices?.video;
    if (videoDevice && videoDevice.provider) {
      await videoDevice.enableVideo(); // prompts if needed
      this._video = videoDevice.provider.video;
      this._usesScratchVideo = true;
      return this._video;
    }

    // Fallback: hidden <video> element with getUserMedia
    const el = document.createElement('video');
    el.autoplay = true; el.playsInline = true; el.muted = true;
    el.width = 640; el.height = 480; el.style.display = 'none';
    document.body.appendChild(el);
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    el.srcObject = stream; await el.play();
    this._video = el;
    this._usesScratchVideo = false;
    return el;
  }
 // NEW: cleanly stop MediaPipe
  async _shutdownVision () {
    try {
      if (_pose && typeof _pose.close === 'function') {
        await _pose.close();                      // frees WASM resources
      }
    } catch (e) {
      // ignore
    }
    _pose = null;
  }
   // NEW: release camera depending on source
  async _releaseCamera () {
    const videoDevice = this.runtime?.ioDevices?.video;

    if (this._usesScratchVideo) {
      try {
        if (videoDevice && typeof videoDevice.disableVideo === 'function') {
          await videoDevice.disableVideo();       // turns off shared camera stream
        }
        // ensure provider video has no stream attached
        if (videoDevice?.provider?.video) {
          videoDevice.provider.video.srcObject = null;
        }
      } catch (e) { /* ignore */ }
    } else if (this._video) {
      try {
        const stream = this._video.srcObject;
        if (stream) stream.getTracks().forEach(t => t.stop());
      } catch (e) { /* ignore */ }
      try {
        this._video.srcObject = null;
        if (this._video.parentNode) this._video.parentNode.removeChild(this._video);
      } catch (e) { /* ignore */ }
    }

    this._video = null;
    this._usesScratchVideo = false;
  }

  // ----------------- Overlay & utils -----------------

  _getPartXY (name) {
    const idx = PARTS[String(name)];
    const pose = this._poses;
    if (idx == null || !pose || !pose[idx]) return null;

    // MediaPipe gives normalized [0..1]; convert to stage px with (0,0) at center
    const kp = pose[idx];

    // const x = (kp.x - 0.5) * this._stageW;
    // const y = (0.5 - kp.y) * this._stageH;
    // return { x, y, visibility: kp.visibility };
    // Detect if Scratch's camera preview is mirrored (many builds default to true)
  const videoIO = this.runtime && this.runtime.ioDevices && this.runtime.ioDevices.video;
  const isMirrored =
    !!(videoIO && (videoIO.mirror || (videoIO.provider && videoIO.provider.mirror)));

  // Map to Scratch stage (centered, X right is +, Y up is +)
  const nx = kp.x - 0.5;                // [-0.5, +0.5], left->right
  const x  = (isMirrored ? -nx : nx) * this._stageW;   // flip X if preview is mirrored
  const y  = (0.5 - kp.y) * this._stageH;              // flip Y from top-left to center-up

  return { x, y, visibility: kp.visibility };
  }

  _emitOverlay (clearOnly = false) {
    const lines = [];
    const P = n => this._getPartXY(n);
    const C = (a, b) => { const A = P(a), B = P(b); if (A && B) lines.push([A.x, A.y, B.x, B.y]); };

    if (!clearOnly) {
      // arms
      C('left_shoulder', 'left_elbow');   C('left_elbow', 'left_wrist');
      C('right_shoulder','right_elbow');  C('right_elbow','right_wrist');
      // torso & legs
      C('left_shoulder', 'left_hip');     C('right_shoulder','right_hip');
      C('left_hip', 'left_knee');         C('left_knee', 'left_ankle');
      C('right_hip', 'right_knee');       C('right_knee','right_ankle');
      // bridges
      C('left_shoulder','right_shoulder'); C('left_hip','right_hip');
    }
    this.runtime.emit('POSE_OVERLAY', { lines, clear: !this._drawOverlay || clearOnly });
  }

  _above (a, b) { return a && b && a.y < b.y; }
  _nearHoriz (a, b) { return a && b && Math.abs(a.y - b.y) < 25 && Math.abs(a.x - b.x) > 60; }
  _level (a, b) { return a && b && Math.abs(a.y - b.y) < 15; }
  _nearY (a, b) { return a && b && Math.abs(a.y - b.y) < 30; }

  _partsAsObj () {
    const o = {};
    for (const k of Object.keys(PARTS)) o[k] = this._getPartXY(k);
    return o.left_shoulder ? o : null;
  }
}

/**
 * Compatibility export:
 *  - If the VM expects a CLASS (like many built-ins), it can `require(...)` and `new` it with runtime.
 *  - If the VM expects a FACTORY, it can call `require(...)(runtime)` to get an INSTANCE,
 *    or `require(... )()` to get the CLASS and `new` it later. We support both.
 */
function exported(arg) {
  if (arg && (typeof arg === 'object' || typeof arg === 'function')) {
    return new Scratch3Pose(arg);   // called as a factory with runtime
  }
  return Scratch3Pose;              // called with no args: return the constructor
}
module.exports = exported;
module.exports.Scratch3Pose = Scratch3Pose;
