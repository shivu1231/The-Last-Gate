import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

/** Adapt only the GPU buffer; authored geometry and native-resolution DOM stay intact. */
export function useCanvasBudget(ready = true, maxPixels = 5_000_000) {
  const { gl, size, viewport, setDpr } = useThree();
  const initial = useRef(viewport.initialDpr);
  const sampling = useRef({
    warmup: 0,
    time: 0,
    frames: 0,
    headroom: 0,
    ceiling: initial.current,
    floor: 0.58,
  });
  useEffect(() => {
    const scaleFactor = sampling.current;
    scaleFactor.ceiling = Math.min(
      initial.current,
      Math.sqrt(maxPixels / Math.max(1, size.width * size.height)),
    );
    scaleFactor.floor = Math.min(
      scaleFactor.ceiling,
      Math.max(0.58, scaleFactor.ceiling * 0.7),
    );
    scaleFactor.warmup =
      scaleFactor.time =
      scaleFactor.frames =
      scaleFactor.headroom =
        0;
    setDpr(scaleFactor.ceiling);
  }, [size.width, size.height, setDpr, maxPixels]);
  useFrame((_, deltaSeconds) => {
    if (!ready) return;
    const scaleFactor = sampling.current;
    scaleFactor.warmup += deltaSeconds;
    if (scaleFactor.warmup < 1 || deltaSeconds > 0.15) return;
    scaleFactor.time += deltaSeconds;
    scaleFactor.frames++;
    if (scaleFactor.time < 1.4 || scaleFactor.frames < 16) return;
    const average = (scaleFactor.time * 1000) / scaleFactor.frames,
      current = gl.getPixelRatio();
    if (average > 31 && current > scaleFactor.floor + 0.025) {
      setDpr(
        Math.max(scaleFactor.floor, current * Math.sqrt(25 / average) * 0.94),
      );
      scaleFactor.headroom = 0;
    } else if (average < 19 && current < scaleFactor.ceiling - 0.025) {
      scaleFactor.headroom += scaleFactor.time;
      if (scaleFactor.headroom > 8) {
        setDpr(Math.min(scaleFactor.ceiling, current + 0.04));
        scaleFactor.headroom = 0;
      }
    } else scaleFactor.headroom = 0;
    scaleFactor.time = 0;
    scaleFactor.frames = 0;
  });
}
