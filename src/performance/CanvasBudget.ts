import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

/** Adapt only the GPU buffer; authored geometry and native-resolution DOM stay intact. */
export function useCanvasBudget(ready=true, maxPixels=5_000_000) {
  const {gl,size,viewport,setDpr}=useThree();const initial=useRef(viewport.initialDpr);
  const sampling=useRef({warmup:0,time:0,frames:0,headroom:0,ceiling:initial.current,floor:.58});
  useEffect(()=>{const s=sampling.current;s.ceiling=Math.min(initial.current,Math.sqrt(maxPixels/Math.max(1,size.width*size.height)));s.floor=Math.min(s.ceiling,Math.max(.58,s.ceiling*.7));s.warmup=s.time=s.frames=s.headroom=0;setDpr(s.ceiling);},[size.width,size.height,setDpr,maxPixels]);
  useFrame((_,dt)=>{if(!ready)return;const s=sampling.current;s.warmup+=dt;if(s.warmup<1||dt>.15)return;s.time+=dt;s.frames++;if(s.time<1.4||s.frames<16)return;const average=s.time*1000/s.frames,current=gl.getPixelRatio();if(average>31&&current>s.floor+.025){setDpr(Math.max(s.floor,current*Math.sqrt(25/average)*.94));s.headroom=0;}else if(average<19&&current<s.ceiling-.025){s.headroom+=s.time;if(s.headroom>8){setDpr(Math.min(s.ceiling,current+.04));s.headroom=0;}}else s.headroom=0;s.time=0;s.frames=0;});
}
