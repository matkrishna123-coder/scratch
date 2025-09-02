import React, {useEffect, useRef, useState} from 'react';
import PropTypes from 'prop-types';
import {createPortal} from 'react-dom';
import './face-overlay.css';

const FaceOverlay = ({vm}) => {
  const ref = useRef(null);
  const [host, setHost] = useState(null);

  // Find the right DOM host (Scratch's overlay container)
  useEffect(() => {
    if (!vm) return;
    const stageCanvas = vm?.renderer?.canvas;
    if (!stageCanvas) return;

    // Walk up to the stage root then pick its overlay sibling
    let el = stageCanvas.parentElement;
    while (el && !/stage_stage_y/.test(el.className)) el = el.parentElement;
    const overlays = el?.nextElementSibling && /stage_stage-overlays_/.test(el.nextElementSibling.className)
      ? el.nextElementSibling
      : null;

    setHost(overlays || stageCanvas.parentElement);
  }, [vm]);

  useEffect(() => {
    if (!vm || !host) return;
    const overlay = ref.current;
    const ctx = overlay.getContext('2d');

    // Size overlay to match Stage canvas exactly (CSS px with HiDPI backing)
    const resizeToStage = () => {
      const stageCanvas = vm?.renderer?.canvas;
      if (!stageCanvas) return;
      const r = stageCanvas.getBoundingClientRect();
      const pr = host.getBoundingClientRect();

      const left = Math.floor(r.left - pr.left);
      const top  = Math.floor(r.top  - pr.top);
      const w = Math.floor(r.width);
      const h = Math.floor(r.height);

      overlay.style.left = `${left}px`;
      overlay.style.top  = `${top}px`;
      overlay.style.width = `${w}px`;
      overlay.style.height = `${h}px`;

      const ratio = window.devicePixelRatio || 1;
      const bw = Math.max(1, Math.round(w * ratio));
      const bh = Math.max(1, Math.round(h * ratio));
      if (overlay.width !== bw || overlay.height !== bh) {
        overlay.width = bw;
        overlay.height = bh;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      }
    };

    const draw = payload => {
      const {boxes = [], landmarks = [], frameWidth, frameHeight} = payload || {};
      resizeToStage();
      const w = overlay.clientWidth, h = overlay.clientHeight;
      ctx.clearRect(0, 0, w, h);
      if (!frameWidth || !frameHeight || !w || !h) return;

      const sx = w / frameWidth;
      const sy = h / frameHeight;

      // Boxes
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,255,0,0.95)';
      for (const b of boxes) {
        ctx.strokeRect(b.x * sx, b.y * sy, b.w * sx, b.h * sy);
      }

      // Landmarks
      ctx.fillStyle = 'rgba(0,255,0,0.95)';
      for (const face of landmarks) {
        if (!face) continue;
        for (const p of face) {
          ctx.beginPath();
          ctx.arc(p.x * sx, p.y * sy, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    // Subscribe to the SAME runtime bus as the Stage
    const handler = p => draw(p);
    vm.runtime.on('FACE_OVERLAY', handler);

    // Track size changes
    const ro = window.ResizeObserver ? new ResizeObserver(resizeToStage) : null;
    window.addEventListener('resize', resizeToStage);
    vm?.renderer?.canvas && ro?.observe(vm.renderer.canvas);
    resizeToStage();

    // ---- DEBUG HOOKS (helpful in Console) ----
    // - __faceOverlay: { vm, emit(payload), draw(payload) }
    //   So you don't rely on window.vm being the same instance.
    window.__faceOverlay = {
      vm,
      emit: payload => vm.runtime.emit('FACE_OVERLAY', payload),
      draw
    };

    return () => {
      vm.runtime.off('FACE_OVERLAY', handler);
      window.removeEventListener('resize', resizeToStage);
      ro?.disconnect();
      if (window.__faceOverlay?.vm === vm) delete window.__faceOverlay;
    };
  }, [vm, host]);

  const canvas = <canvas className="faceOverlayCanvas" ref={ref} />;
  return host ? createPortal(canvas, host) : canvas;
};

FaceOverlay.propTypes = { vm: PropTypes.object };
export default FaceOverlay;
