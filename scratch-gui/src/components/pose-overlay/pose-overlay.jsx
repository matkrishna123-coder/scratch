// pose-overlay.jsx
import React, {useEffect, useRef} from 'react';
export default function PoseOverlay({runtime}) {
  const ref = useRef(null);
  useEffect(()=>{
    const onOverlay = ({lines, clear})=>{
      const c = ref.current; if(!c) return;
      const ctx = c.getContext('2d');
      if (clear) { ctx.clearRect(0,0,c.width,c.height); return; }
      ctx.clearRect(0,0,c.width,c.height);
      ctx.lineWidth = 2; ctx.strokeStyle = '#00a';
      lines.forEach(([x1,y1,x2,y2])=>{
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      });
    };
    runtime.on('POSE_OVERLAY', onOverlay);
    return ()=>runtime.off('POSE_OVERLAY', onOverlay);
  }, [runtime]);
  return <canvas ref={ref} width={480} height={360} style={{position:'absolute', left:0, top:0, pointerEvents:'none'}} />;
}
