// scratch3_pose/index.js
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const formatMessage = require('format-message');

// Lazy-load MediaPipe Tasks (bundled or CDN)
let _vision = null;
let _pose = null;

const PARTS = {
  nose: 0, left_eye: 2, right_eye: 5, left_ear: 7, right_ear: 8,
  left_shoulder: 11, right_shoulder: 12, left_elbow: 13, right_elbow: 14,
  left_wrist: 15, right_wrist: 16, left_hip: 23, right_hip: 24,
  left_knee: 25, right_knee: 26, left_ankle: 27, right_ankle: 28, leftHeel: 29, rightHeel: 30,
  leftFootIndex: 31, rightFootIndex: 32
};

class Scratch3Pose {
  constructor(runtime) {
      if (!runtime) throw new Error('Scratch3Pose: runtime missing');
    this.runtime = runtime;

    this._video = null;
    this._running = false;
    this._targetFPS = 15;
    this._lastTs = 0;

    this._drawOverlay = false;
    this._poses = []; // [{landmarks:[{x,y,z,visibility}], worldLandmarks:[], ...}]

    // Stage size for mapping
    this._stageW = 480; this._stageH = 360;

    runtime.on('PROJECT_RUN_START', () => this._kick()  && this._kick());
    runtime.on('PROJECT_RUN_STOP',  () => { this._running = false; this._emitOverlay(true); });
  }

  getInfo() {
    return {
      id: 'pose',
      name: formatMessage({default: 'Body Parts'}),
      blocks: [
        {opcode:'start', blockType:BlockType.COMMAND, text:'start body detection (FPS [FPS])',
          arguments:{FPS:{type:ArgumentType.NUMBER, defaultValue:15}}},
        {opcode:'stop',  blockType:BlockType.COMMAND, text:'stop body detection'},
        {opcode:'draw',  blockType:BlockType.COMMAND, text:'draw skeleton [ONOFF]',
          arguments:{ONOFF:{type:ArgumentType.STRING, menu:'onoff', defaultValue:'on'}}},

        {opcode:'count', blockType:BlockType.REPORTER, text:'bodies detected'},

        {opcode:'getX', blockType:BlockType.REPORTER, text:'[WHICH] X of [PART]',
          arguments:{WHICH:{type:ArgumentType.STRING, menu:'which', defaultValue:'first'},
                     PART:{type:ArgumentType.STRING, menu:'parts', defaultValue:'left_wrist'}}},
        {opcode:'getY', blockType:BlockType.REPORTER, text:'[WHICH] Y of [PART]',
          arguments:{WHICH:{type:ArgumentType.STRING, menu:'which', defaultValue:'first'},
                     PART:{type:ArgumentType.STRING, menu:'parts', defaultValue:'left_wrist'}}},
        {opcode:'getVis', blockType:BlockType.REPORTER, text:'visibility of [PART]',
          arguments:{PART:{type:ArgumentType.STRING, menu:'parts', defaultValue:'left_wrist'}}},

        {opcode:'angleABC', blockType:BlockType.REPORTER,
          text:'angle [A]-[B]-[C]',
          arguments:{A:{type:ArgumentType.STRING, menu:'parts', defaultValue:'left_shoulder'},
                     B:{type:ArgumentType.STRING, menu:'parts', defaultValue:'left_elbow'},
                     C:{type:ArgumentType.STRING, menu:'parts', defaultValue:'left_wrist'}}},

        {opcode:'dist', blockType:BlockType.REPORTER,
          text:'distance [P1] to [P2]',
          arguments:{P1:{type:ArgumentType.STRING, menu:'parts', defaultValue:'left_wrist'},
                     P2:{type:ArgumentType.STRING, menu:'parts', defaultValue:'right_wrist'}}},

        {opcode:'isPose', blockType:BlockType.BOOLEAN, text:'is pose [POSE] ?',
          arguments:{POSE:{type:ArgumentType.STRING, menu:'poses', defaultValue:'Hands Up'}}}
      ],
      menus: {
        onoff: [{text:'on', value:'on'},{text:'off', value:'off'}],
        which: [{text:'first', value:'first'}], // extend to multi-body if needed
        parts: Object.keys(PARTS).map(k => ({text:k.replace(/_/g,' '), value:k})),
        poses: ['Hands Up','T-Pose','Tree'].map(p => ({text:p, value:p}))
      }
    };
  }

  async _ensureModel() {
    if (_pose) return;
    // If bundling, import from node_modules; if CDN, use dynamic import('.../vision_bundle.mjs')
    const vision = await import(/* webpackIgnore: true */ 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.11/vision_bundle.mjs');
    _vision = await vision.FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.11/wasm'
    );
    _pose = await vision.PoseLandmarker.createFromOptions(_vision, {
      baseOptions: { modelAssetPath: '/static/mediapipe/vision/models/pose_landmarker_lite.task' },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.4,
      minPosePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4
    });
  }

  async start(args) {
    this._targetFPS = Math.max(5, Math.min(60, Number(args.FPS)||15));
    await this._ensureModel();
    // Reuse Scratch video device if available:
    const video = await this._getVideo();
    if (!video) return;
    this._running = true;
  }
  stop() { this._running = false; }

  draw({ONOFF}) { this._drawOverlay = String(ONOFF).toLowerCase()==='on'; }

  count() { return this._poses.length|0; }

  getX({WHICH, PART}) { return this._getPartXY(PART)?.x ?? 0; }
  getY({WHICH, PART}) { return this._getPartXY(PART)?.y ?? 0; }
  getVis({PART}) { return this._getPart(PART)?.visibility ?? 0; }

  angleABC({A,B,C}) {
    const a=this._getPartXY(A), b=this._getPartXY(B), c=this._getPartXY(C);
    if(!a||!b||!c) return 0;
    const ab=[a.x-b.x,a.y-b.y], cb=[c.x-b.x,c.y-b.y];
    const dot = ab[0]*cb[0]+ab[1]*cb[1];
    const m1 = Math.hypot(...ab), m2 = Math.hypot(...cb);
    if(!m1||!m2) return 0;
    return Math.round((Math.acos(Math.max(-1,Math.min(1,dot/(m1*m2))))*180/Math.PI)*10)/10;
  }

  dist({P1,P2}) {
    const a=this._getPartXY(P1), b=this._getPartXY(P2);
    if(!a||!b) return 0;
    return Math.round(Math.hypot(a.x-b.x, a.y-b.y));
  }

  isPose({POSE}) {
    // Simple heuristics good for kids’ activities
    const L = this._partsAsObj();
    if (!L) return false;
    switch(POSE){
      case 'Hands Up':
        return this._above(L.left_wrist, L.left_shoulder) && this._above(L.right_wrist, L.right_shoulder);
      case 'T-Pose':
        return this._nearHoriz(L.left_wrist, L.left_shoulder) && this._nearHoriz(L.right_wrist, L.right_shoulder)
               && this._level(L.left_shoulder, L.right_shoulder);
      case 'Tree':
        // one ankle near other knee height
        return this._nearY(L.left_ankle, L.right_knee) || this._nearY(L.right_ankle, L.left_knee);
      default: return false;
    }
  }

  // ---------- loop ----------
  async _kick() {
    this._lastTs = 0;
    const loop = async (ts)=>{
      if (!this._running) return;
      if (!this._lastTs || (ts - this._lastTs) >= (1000/this._targetFPS)) {
        await this._tick();
        this._lastTs = ts;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  async _tick() {
    const video = await this._getVideo();
    if (!video || !_pose) return;
    const r = _pose.detectForVideo(video, performance.now());
    this._poses = (r && r.landmarks && r.landmarks.length) ? [{landmarks:r.landmarks[0]}] : [];
    this._emitOverlay(false);
  }

  async _getVideo() {
    // Try Scratch video-sensing if present
    const vs = this.runtime.ioDevices && this.runtime.ioDevices.video;
    if (vs && vs.provider && vs.provider.video) {
      return vs.provider.video; // HTMLVideoElement
    }
    // Fallback: create our own
    if (!this._video) {
      this._video = document.createElement('video');
      this._video.autoplay = true; this._video.playsInline = true; this._video.muted = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({video:true, audio:false});
        this._video.srcObject = stream;
        await this._video.play();
      } catch(e) {
        console.warn('camera error', e);
        return null;
      }
    }
    return this._video;
  }

  _getPart(partName) {
    const idx = PARTS[partName];
    if (idx==null) return null;
    const pose = this._poses[0];
    if (!pose) return null;
    return pose.landmarks[idx] || null;
  }
  _getPartXY(partName) {
    const p = this._getPart(partName);
    if (!p) return null;
    // Landmarks are normalized (0..1) in video space; map to stage
    const x = Math.round(p.x * this._stageW);
    const y = Math.round(p.y * this._stageH);
    return {x, y};
  }

  _emitOverlay(clearOnly) {
    if (!this._drawOverlay && !clearOnly) return;
    // Emit a simple array of lines to draw: [[x1,y1,x2,y2], ...]
    const pose = this._poses[0];
    const lines = [];
    if (pose && this._drawOverlay) {
      const C = (a,b)=>{ const pa=this._getPartXY(a), pb=this._getPartXY(b); if(pa&&pb) lines.push([pa.x,pa.y,pb.x,pb.y]); };
      // A light skeleton (shoulders->elbows->wrists, hips->knees->ankles)
      ['left','right'].forEach(side=>{
        C(`${side}_shoulder`,`${side}_elbow`); C(`${side}_elbow`,`${side}_wrist`);
        C(`${side}_hip`,`${side}_knee`); C(`${side}_knee`,`${side}_ankle`);
      });
      C('left_shoulder','right_shoulder'); C('left_hip','right_hip');
    }
    this.runtime.emit('POSE_OVERLAY', {lines, clear: !this._drawOverlay || clearOnly});
  }

  // helpers for boolean poses
  _above(a,b){ return a && b && a.y < b.y; }
  _nearHoriz(a,b){ return a && b && Math.abs(a.y-b.y) < 25 && Math.abs(a.x-b.x) > 60; }
  _level(a,b){ return a && b && Math.abs(a.y-b.y) < 15; }
  _nearY(a,b){ return a && b && Math.abs(a.y-b.y) < 30; }

  _partsAsObj() {
    const o = {};
    for (const k of Object.keys(PARTS)) { o[k] = this._getPartXY(k); }
    return o.left_shoulder ? o : null;
  }
}

module.exports = Scratch3Pose;
