import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { experience, useExperienceFlow } from './ExperienceFlow';
import {
  STATE_PROFILES,
  resolveLegacyState,
  type ExperienceState,
} from './ExperienceStates';
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

/**
 * Connect shared lifecycle, camera, audio and rendering services to the active canvas.
 * Runs at frame priority zero, before the scene's own render callback.
 */
export function RuntimeBridge() {
  const renderer = useThree((state) => state.gl),
    scene = useThree((state) => state.scene);

  useEffect(() => {
    renderer.info.autoReset = false; // count every composer pass in the frame, reset manually below
    const experienceHost = renderer.domElement.closest(
      '.experience',
    ) as HTMLElement | null;
    const cinematicTransitions = new CinematicTransitions(
      experienceHost ?? document.body,
    );
    experience.setTransitionPlayer(cinematicTransitions);
    if (import.meta.env.DEV || import.meta.env.VITE_PRESENTATION === '1') {
      debugHandles.scene = scene;
      debugHandles.transitions = cinematicTransitions as never;
    }
    const unlockAudioOnGesture = audioEngine.unlockOnFirstGesture();

    let renderPolicyTimerId = 0;
    // Coalesce state and quality notifications before touching renderer resources.
    const scheduleRenderPolicy = () => {
      clearTimeout(renderPolicyTimerId);
      renderPolicyTimerId = window.setTimeout(
        () => applyRenderPolicy(scene, renderer, useQuality.getState().preset),
        0,
      );
    };

    const applyStateProfile = (state: ExperienceState) => {
      const profile = STATE_PROFILES[state];
      cameraRig.setMode(profile.camera);
      audioEngine.applyMix(profile.mix);
      frameGovernor.settle();
      scheduleRenderPolicy();
      // Use the current chapter to quietly load the next ones.
      for (const preloadState of profile.preload) {
        void assets.preload(preloadState);
        void experience.prepare(preloadState);
      }
    };
    const unsubscribeFromExperienceState = experience.on(applyStateProfile);
    applyStateProfile(experience.state);

    // Legacy chapters drive the store directly; reflect them as master states.
    const syncLegacyState = () => {
      const state = useSceneState.getState();
      experience.observe(resolveLegacyState(state.chapter, state.phase));
    };
    const unsubscribeFromLegacyState = useSceneState.subscribe(syncLegacyState);
    syncLegacyState();

    // Restarts reset every guard and the camera's motivated shake.
    const unsubscribeFromFlow = useExperienceFlow.subscribe(
      (state, previousState) => {
        document.documentElement.classList.toggle(
          'is-transitioning',
          state.transition !== null,
        );
        if (state.run !== previousState.run) cameraRig.reset();
      },
    );
    const unsubscribeFromQuality = useQuality.subscribe(scheduleRenderPolicy);

    return () => {
      unsubscribeFromExperienceState();
      unsubscribeFromLegacyState();
      unsubscribeFromFlow();
      unsubscribeFromQuality();
      clearTimeout(renderPolicyTimerId);
      window.removeEventListener('pointerdown', unlockAudioOnGesture, true);
      window.removeEventListener('keydown', unlockAudioOnGesture, true);
      experience.setTransitionPlayer(null);
      cinematicTransitions.dispose();
      document.documentElement.classList.remove('is-transitioning');
      renderer.info.autoReset = true;
      debugHandles.scene = null;
      debugHandles.transitions = null;
    };
  }, [renderer, scene]);

  useFrame((_, frameDeltaSeconds) => {
    const rendererInfo = renderer.info;
    runtimeStats.drawCalls = rendererInfo.render.calls;
    runtimeStats.triangles = rendererInfo.render.triangles;
    runtimeStats.textures = rendererInfo.memory.textures;
    runtimeStats.geometries = rendererInfo.memory.geometries;
    runtimeStats.programs = rendererInfo.programs?.length ?? 0;
    rendererInfo.reset();

    // Clamp simulation work after a stalled frame while the governor sees the raw interval.
    const deltaSeconds = Math.min(frameDeltaSeconds, 0.25);
    frameGovernor.sample(frameDeltaSeconds, experience.transitioning);
    runtimeStats.frameMs = frameGovernor.frameTime * 1000;
    runtimeStats.fps = 1 / Math.max(frameGovernor.frameTime, 0.001);
    runtimeStats.frameTasks = frames.size;
    frames.tick(deltaSeconds);
    experience.update(deltaSeconds);
  }, 0);

  return null;
}
