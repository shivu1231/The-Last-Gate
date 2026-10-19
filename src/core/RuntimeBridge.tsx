import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { experience, useExperienceFlow } from './ExperienceFlow';
import { STATE_PROFILES, resolveLegacyState, type ExperienceState } from './ExperienceStates';
import { debugHandles, runtimeStats } from './runtimeStats';
import { useSceneState } from '../state/SceneStateManager';
import { cameraRig } from '../systems/CameraRig';
import { audioEngine } from '../audio/AudioMix';
import { assets } from '../systems/AssetManager';
import { frames } from '../performance/FrameScheduler';
import { frameGovernor } from '../performance/FrameGovernor';
import { applyRenderPolicy } from '../performance/RenderPolicy';
import { useQuality } from '../performance/Quality';
import { CinematicTransitions } from '../transitions/CinematicTransitions';
import './legacyCheckpoints';

// Mount once inside <Canvas>. Connects the global systems to the running scene:
//  - mirrors the chapter/phase store into the master ExperienceFlow
//  - per state: camera mode, audio mix crossfade, predictive preloading, render policy
//  - one frame hook for the shared scheduler, governor and diagnostics
// It runs at useFrame priority 0, i.e. before the scene's own render callback.

export function RuntimeBridge() {
  const gl = useThree(s => s.gl), scene = useThree(s => s.scene);

  useEffect(() => {
    gl.info.autoReset = false; // count every composer pass in the frame, reset manually below
    const host = gl.domElement.closest('.experience') as HTMLElement | null;
    const transitions = new CinematicTransitions(host ?? document.body);
    experience.setTransitionPlayer(transitions);
    if (import.meta.env.DEV || import.meta.env.VITE_PRESENTATION === '1') { debugHandles.scene = scene; debugHandles.transitions = transitions as never; }
    const releaseGesture = audioEngine.unlockOnFirstGesture();

    let policyTimer = 0;
    const policy = () => { clearTimeout(policyTimer); policyTimer = window.setTimeout(() => applyRenderPolicy(scene, gl, useQuality.getState().preset), 0); };

    const onState = (state: ExperienceState) => {
      const profile = STATE_PROFILES[state];
      cameraRig.setMode(profile.camera);
      audioEngine.applyMix(profile.mix);
      frameGovernor.settle();
      policy();
      // Use the current chapter to quietly load the next ones.
      for (const next of profile.preload) { void assets.preload(next); void experience.prepare(next); }
    };
    const offState = experience.on(onState);
    onState(experience.state);

    // Legacy chapters drive the store directly; reflect them as master states.
    const sync = () => { const s = useSceneState.getState(); experience.observe(resolveLegacyState(s.chapter, s.phase)); };
    const offLegacy = useSceneState.subscribe(sync); sync();

    // Restarts reset every guard and the camera's motivated shake.
    const offRun = useExperienceFlow.subscribe((s, prev) => {
      document.documentElement.classList.toggle('is-transitioning', s.transition !== null);
      if (s.run !== prev.run) cameraRig.reset();
    });
    const offQuality = useQuality.subscribe(policy);

    return () => {
      offState(); offLegacy(); offRun(); offQuality();
      clearTimeout(policyTimer);
      window.removeEventListener('pointerdown', releaseGesture, true); window.removeEventListener('keydown', releaseGesture, true);
      experience.setTransitionPlayer(null); transitions.dispose();
      document.documentElement.classList.remove('is-transitioning');
      gl.info.autoReset = true;
      debugHandles.scene = null; debugHandles.transitions = null;
    };
  }, [gl, scene]);

  useFrame((_, delta) => {
    const info = gl.info;
    runtimeStats.drawCalls = info.render.calls;
    runtimeStats.triangles = info.render.triangles;
    runtimeStats.textures = info.memory.textures;
    runtimeStats.geometries = info.memory.geometries;
    runtimeStats.programs = info.programs?.length ?? 0;
    info.reset();
    const dt = Math.min(delta, .25);
    frameGovernor.sample(delta, experience.transitioning);
    runtimeStats.frameMs = frameGovernor.frameTime * 1000;
    runtimeStats.fps = 1 / Math.max(frameGovernor.frameTime, .001);
    runtimeStats.frameTasks = frames.size;
    frames.tick(dt);
    experience.update(dt);
  }, 0);

  return null;
}
