const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');

class Scratch3Face {
  constructor(runtime) {
    this.runtime = runtime;

    // State
    this._cameraOn = false;
    this._detections = [];                  // [{x,y,w,h, landmarks:[{x,y},...]}]
    this._facesCountCached = 0;

    // Simple recognition DB
    this._db = Object.create(null);
    this._threshold = 0.85;
    this._targetFPS = 15;

    // MediaPipe landmarker & frame info
    this._landmarker = null;
    this._frameW = 0;
    this._frameH = 0;

    // Overlay flags
    this._drawBoxes = false;
    this._drawLandmarks = false;

    // Tick state
    this._lastTick = 0;
    this._loopStarted = false;

    // Start/stop hooks
    runtime.on('PROJECT_RUN_START', () => this._kickLoop('PROJECT_RUN_START'));
    runtime.on('PROJECT_RUN_STOP',  () => { this._emitOverlay(true); });
  }

  // ---------------- Overlay toggles ----------------
  drawBoxes({ONOFF}) {
    this._drawBoxes = String(ONOFF).toLowerCase() === 'on';
    if (!this._drawBoxes && !this._drawLandmarks) this._emitOverlay(true);
  }
  drawLandmarks({ONOFF}) {
    this._drawLandmarks = String(ONOFF).toLowerCase() === 'on';
    if (!this._drawBoxes && !this._drawLandmarks) this._emitOverlay(true);
  }

  // ---------------- Model loading ----------------
  async _ensureModels() {
    if (this._landmarker) return;

    const base = this._assetBase(); // '/static/assets/face/' (http) or 'static/assets/face/' (file)
    const tasksUrl = new URL(
      'tasks-vision.js',
      base.startsWith('/') ? (window.location.origin + base)
                           : (window.location.href.replace(/[^/]*$/, '') + base)
    ).toString();

    let tasks;
    try {
      tasks = await import(/* webpackIgnore: true */ tasksUrl);
    } catch (e) {
      console.error('[face] tasks load failed', e, 'url:', tasksUrl);
      throw e;
    }

    const {FilesetResolver, FaceLandmarker} = tasks;
    const files = await FilesetResolver.forVisionTasks(base + 'wasm/');

    this._landmarker = await FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: base + 'models/face_landmarker.task' },
      runningMode: 'IMAGE',
      numFaces: 5,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrices: false
    });
    console.log('[face] landmarker ready');
  }

  _assetBase() {
    const isHttp = /^https?:/i.test(window.location.href);
    return isHttp ? '/static/assets/face/' : 'static/assets/face/';
  }

  // Try to get a canvas from the VM video device; fall back to <video>
  _getFrame(size = 320) {
    const v = this.runtime?.ioDevices?.video;
    if (!v) return null;

    // Canvas path (preferred)
    try {
      const c = v.getFrame({format: 'canvas', width: size, height: size});
      if (c && typeof c.getContext === 'function') return c; // HTMLCanvasElement
    } catch (_) {}

    // Some builds return canvas without specifying format
    try {
      const c = v.getFrame({width: size, height: size});
      if (c && typeof c.getContext === 'function') return c;
    } catch (_) {}

    // Fallback: underlying <video>
    const vid = v.provider && v.provider.video;
    if (vid && vid.readyState >= 2) return vid; // HTMLVideoElement

    return null;
  }

  // ---------------- Detection per tick ----------------
  async _detectOnce() {
    await this._ensureModels();

    const frame = this._getFrame(320);
    if (!frame) {
      // Camera not ready yet; clear overlay once
      this._detections = [];
      this._facesCountCached = 0;
      this._emitOverlay(true);
      return;
    }

    // Normalize to a canvas source for the landmarker
    let sourceCanvas = null;
    if (typeof frame.getContext === 'function') {
      // Already a canvas
      sourceCanvas = frame;
    } else {
      // Likely a <video> element; draw it into a work canvas
      if (!this._canvas) {
        this._canvas = document.createElement('canvas');
        this._ctx = this._canvas.getContext('2d');
      }
      const w = frame.videoWidth  || frame.naturalWidth  || frame.width  || 320;
      const h = frame.videoHeight || frame.naturalHeight || frame.height || 320;
      if (this._canvas.width !== w || this._canvas.height !== h) {
        this._canvas.width = w; this._canvas.height = h;
        console.log('[face] work canvas created', w, h);
      }
      this._ctx.drawImage(frame, 0, 0, this._canvas.width, this._canvas.height);
      sourceCanvas = this._canvas;
    }

    // Detect landmarks
    const res = this._landmarker.detect(sourceCanvas);
    const W = sourceCanvas.width, H = sourceCanvas.height;
    this._frameW = W; this._frameH = H;

    const faces = res?.faceLandmarks || [];
    this._detections = faces.map(lm => {
      // lm points are normalized [0..1]; convert to pixels
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      const px = lm.map(p => {
        const x = p.x * W, y = p.y * H;
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
        return {x, y};
      });
      return {
        x: Math.round(minx),
        y: Math.round(miny),
        w: Math.round(maxx - minx),
        h: Math.round(maxy - miny),
        landmarks: px
      };
    });

    this._facesCountCached = this._detections.length;
    this._emitOverlay();
  }

  // ---------------- Landmark embedding ----------------
  _getKeyIdxs() { return [33,263,133,362,1,4,61,291,13,14,10,152,234,454]; }

  _embedFromLandmarks(lm) {
    if (!lm || lm.length < 468) return null;

    const idxs = this._getKeyIdxs();
    const R_outer = lm[33], L_outer = lm[263];
    const cx = (R_outer.x + L_outer.x) / 2;
    const cy = (R_outer.y + L_outer.y) / 2;
    const eyeDist = Math.hypot(L_outer.x - R_outer.x, L_outer.y - R_outer.y) || 1;

    const vec = [];
    for (const i of idxs) {
      const p = lm[i];
      vec.push((p.x - cx) / eyeDist, (p.y - cy) / eyeDist);
    }
    const mouthL = lm[61], mouthR = lm[291];
    const nose  = lm[1],   chin   = lm[152];
    const eyeInR = lm[133], eyeInL = lm[362];
    vec.push(
      Math.hypot(mouthR.x - mouthL.x, mouthR.y - mouthL.y) / eyeDist,
      Math.hypot(chin.x - nose.x,     chin.y - nose.y)     / eyeDist,
      Math.hypot(eyeInL.x - eyeInR.x, eyeInL.y - eyeInR.y) / eyeDist
    );

    // L2-normalize
    let norm = 0; for (const v of vec) norm += v*v;
    norm = Math.sqrt(norm) || 1;
    for (let i=0;i<vec.length;i++) vec[i] /= norm;

    return new Float32Array(vec);
  }

  // ---------------- Tick loop (always schedules) ----------------
  _tickLoop() {
    const loop = async () => {
      const now = performance.now();
      const interval = 1000 / this._targetFPS;

      // Only *process* when camera is on, but keep scheduling regardless
      if (now - this._lastTick >= interval && this._cameraOn) {
        try { await this._detectOnce(); } catch (e) { console.error('[face] detect error', e); }
        this._lastTick = now;
      }

      // Keep the loop alive even if the green flag isn't running
      if (typeof window !== 'undefined') window.requestAnimationFrame(loop);
      else setTimeout(loop, 30);
    };
    loop();
  }

  _kickLoop(source) {
    if (this._loopStarted) return;
    this._loopStarted = true;
    console.log('[face] tick loop start from', source);
    this._tickLoop();
  }

  // ---------------- Overlay emit ----------------
  _emitOverlay(forceClear = false) {
    if (!this.runtime || (!this._drawBoxes && !this._drawLandmarks && !forceClear)) return;
    const payload = {
      src: 'face',
      boxes: forceClear ? [] :
        (this._drawBoxes ? this._detections.map(d => ({x:d.x, y:d.y, w:d.w, h:d.h})) : []),
      landmarks: forceClear ? [] :
        (this._drawLandmarks ? this._detections.map(d =>
          (d.landmarks || []).map(p => ({x: Math.round(p.x), y: Math.round(p.y)}))
        ) : []),
      frameWidth: this._frameW || 0,
      frameHeight: this._frameH || 0,
      ts: Date.now()
    };
    this.runtime.emit('FACE_OVERLAY', payload);
  }

  // ---------------- Scratch surface ----------------
  getInfo() {
    return {
      id: 'face',
      name: 'Face Blocks',
      color1: '#6A5ACD',
      color2: '#4E3CC6',
      blocks: [
        { opcode: 'startCamera', blockType: BlockType.COMMAND, text: 'start camera' },
        { opcode: 'stopCamera',  blockType: BlockType.COMMAND, text: 'stop camera' },
        { opcode: 'cameraReady', blockType: BlockType.BOOLEAN, text: 'camera ready?' },

        { opcode: 'facesCount',  blockType: BlockType.REPORTER, text: 'faces count' },
        { opcode: 'faceDetected',blockType: BlockType.BOOLEAN,  text: 'face [INDEX] detected?', arguments: { INDEX:{type:ArgumentType.NUMBER, defaultValue:1} } },
        { opcode: 'faceX',       blockType: BlockType.REPORTER, text: 'face [INDEX] x', arguments:{ INDEX:{type:ArgumentType.NUMBER, defaultValue:1} } },
        { opcode: 'faceY',       blockType: BlockType.REPORTER, text: 'face [INDEX] y', arguments:{ INDEX:{type:ArgumentType.NUMBER, defaultValue:1} } },
        { opcode: 'faceW',       blockType: BlockType.REPORTER, text: 'face [INDEX] width', arguments:{ INDEX:{type:ArgumentType.NUMBER, defaultValue:1} } },
        { opcode: 'faceH',       blockType: BlockType.REPORTER, text: 'face [INDEX] height', arguments:{ INDEX:{type:ArgumentType.NUMBER, defaultValue:1} } },

        { opcode: 'drawBoxes',     blockType: BlockType.COMMAND,  text: 'draw boxes [ONOFF]', arguments: { ONOFF:{type:ArgumentType.STRING, defaultValue:'on'} } },
        { opcode: 'drawLandmarks', blockType: BlockType.COMMAND,  text: 'draw landmarks [ONOFF]', arguments: { ONOFF:{type:ArgumentType.STRING, defaultValue:'off'} } },

        { opcode: 'trainFace',   blockType: BlockType.COMMAND,  text: 'train face [INDEX] as [LABEL]', arguments:{
            INDEX:{type:ArgumentType.NUMBER, defaultValue:1}, LABEL:{type:ArgumentType.STRING, defaultValue:'Alice'}
        }},
        { opcode: 'recognizeAs', blockType: BlockType.BOOLEAN,  text: 'recognize face [INDEX] as [LABEL]?', arguments:{
            INDEX:{type:ArgumentType.NUMBER, defaultValue:1}, LABEL:{type:ArgumentType.STRING, defaultValue:'Alice'}
        }}
      ]
    };
  }

  // ---------------- Opcodes ----------------
  startCamera() {
    console.log('[face] startCamera called');
    this.runtime.ioDevices.video.enableVideo();
    this._cameraOn = true;
    this._kickLoop('startCamera');
    // Optional warm-up clear
    setTimeout(() => this._emitOverlay(true), 100);
  }

  stopCamera() {
    this.runtime.ioDevices.video.disableVideo();
    this._cameraOn = false;
    this._emitOverlay(true);
  }

  cameraReady() { return !!this._cameraOn; }

  facesCount() { return this._facesCountCached || 0; }
  faceDetected({INDEX}) { const i = Math.max(1, Math.floor(INDEX)) - 1; return !!this._detections[i]; }
  faceX({INDEX}) { const d = this._detections[Math.max(1, Math.floor(INDEX)) - 1]; return d ? d.x : 0; }
  faceY({INDEX}) { const d = this._detections[Math.max(1, Math.floor(INDEX)) - 1]; return d ? d.y : 0; }
  faceW({INDEX}) { const d = this._detections[Math.max(1, Math.floor(INDEX)) - 1]; return d ? d.w : 0; }
  faceH({INDEX}) { const d = this._detections[Math.max(1, Math.floor(INDEX)) - 1]; return d ? d.h : 0; }

  async trainFace({INDEX, LABEL}) {
    const d = this._detections[Math.max(1, Math.floor(INDEX)) - 1];
    if (!d || !LABEL) return;
    const emb = this._embedFromLandmarks(d.landmarks);
    if (!emb) return;
    (this._db[LABEL] ||= []).push(emb);
  }

  async recognizeAs({INDEX, LABEL}) {
    const d = this._detections[Math.max(1, Math.floor(INDEX)) - 1];
    const arr = this._db[LABEL];
    if (!d || !arr || arr.length === 0) return false;
    const emb = this._embedFromLandmarks(d.landmarks);
    if (!emb) return false;

    // cosine similarity
    let best = -1;
    for (const v of arr) {
      let dot=0, na=0, nb=0;
      for (let i=0;i<v.length;i++){ dot+=v[i]*emb[i]; na+=v[i]*v[i]; nb+=emb[i]*emb[i]; }
      const cos = dot / (Math.sqrt(na)*Math.sqrt(nb) + 1e-9);
      if (cos > best) best = cos;
    }
    return best >= (this._threshold || 0.85);
  }
}

module.exports = Scratch3Face;
