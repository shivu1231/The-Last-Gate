import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ACESFilmicToneMapping, PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { useCanvasBudget } from '../performance/CanvasBudget';

/** Shared Phase 1 material response; a small studio reflection, with amortized shadow work. */
export function SceneQuality({ ready = true, prepare, onReady, onError, manageDpr = true }: { ready?: boolean; prepare?: () => Promise<void>; onReady?: () => void; onError?: () => void; manageDpr?: boolean }) {
  const { gl, scene, camera } = useThree();
  const sinceShadow = useRef(1);
  const frameAudit = useRef({ warm: 0, seconds: 0, frames: 0, maxFrame: 0, sent: false });
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const debug = window as Window & { __lastGateScene?: { gl: typeof gl; scene: typeof scene; camera: typeof camera } };
    const current = { gl, scene, camera }; debug.__lastGateScene = current;
    return () => { if (debug.__lastGateScene === current) delete debug.__lastGateScene; };
  }, [gl, scene, camera]);
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl), room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, .04);
    scene.environment = environment.texture; scene.environmentIntensity = .55;
    gl.toneMapping = ACESFilmicToneMapping; gl.toneMappingExposure = 1.02;
    gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true;
    room.dispose(); pmrem.dispose();
    return () => { scene.environment = null; environment.dispose(); };
  }, [gl, scene]);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const frame = requestAnimationFrame(() => {
      gl.compileAsync(scene, camera).then(() => alive ? prepare?.() : undefined).then(() => {
        if (!alive) return;
        gl.shadowMap.needsUpdate = true;
        onReady?.(); window.dispatchEvent(new Event('lastgate:scene-ready'));
      }).catch(() => { if (alive) { if (onError) onError(); else { onReady?.(); window.dispatchEvent(new Event('lastgate:scene-ready')); } } });
    });
    return () => { alive = false; cancelAnimationFrame(frame); };
  }, [ready, gl, scene, camera, prepare, onReady, onError]);
  useFrame((_, dt) => {
    if (import.meta.env.DEV && ready && document.visibilityState === 'visible') {
      const audit = frameAudit.current; audit.warm += dt;
      if (audit.warm > 3 && !audit.sent) {
        audit.seconds += dt; audit.frames++; audit.maxFrame = Math.max(audit.maxFrame, dt);
        if (audit.seconds >= 10) { audit.sent = true; console.info('lastgate-frame-audit', JSON.stringify({ route: location.search, fps: Number((audit.frames / audit.seconds).toFixed(1)), longestFrameMs: Math.round(audit.maxFrame * 1000), calls: gl.info.render.calls, triangles: gl.info.render.triangles, dpr: gl.getPixelRatio() })); }
      }
    }
    sinceShadow.current += dt;
    if (sinceShadow.current > .16) { gl.shadowMap.needsUpdate = true; sinceShadow.current = 0; }
  });
  return manageDpr ? <CanvasBudget ready={ready} /> : null;
}

function CanvasBudget({ ready }: { ready: boolean }) { useCanvasBudget(ready); return null; }
