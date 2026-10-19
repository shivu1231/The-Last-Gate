import { useEffect, useState, type CSSProperties } from 'react';
import { experience, useExperienceFlow } from '../core/ExperienceFlow';
import { CHECKPOINTS } from '../core/ExperienceStates';
import { debugHandles, runtimeStats } from '../core/runtimeStats';
import { auditScene } from './SceneAudit';
import { useSceneState } from '../state/SceneStateManager';
import { useQuality } from '../performance/Quality';
import { audioEngine } from '../audio/AudioMix';
import { cameraRig } from '../systems/CameraRig';
import { TRANSITION_TYPES } from '../transitions/CinematicTransitions';

// Development / presentation-only tooling. This module is code-split and only
// imported when import.meta.env.DEV or VITE_PRESENTATION=1 (see ProductionLayer).
//
//   Alt+Shift+F   performance HUD           Alt+Shift+R   restart current checkpoint
//   Alt+Shift+N   next checkpoint           Alt+Shift+0   restart whole experience
//   Alt+Shift+1…9, -, =   jump to checkpoint N (AWAKE, SHELL, RED_WAKE, …)
//   Alt+Shift+Q   toggle HIGH / BALANCED    Alt+Shift+T   preview next transition (dev only)
//   Alt+Shift+S   test shake impulse (dev only)
//   Alt+Shift+A   scene performance audit → console (also window.__latticeDev.audit())
// Nothing is visible until a shortcut is used; ?hud opens the HUD on load.

const DIGITS = [
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9',
  'Minus',
  'Equal',
];

/**
 * Render the development-only controls for checkpoints and scene diagnostics.
 */
export default function DevTools() {
  const [hud, setHud] = useState(() =>
    new URLSearchParams(location.search).has('hud'),
  );
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let transitionIndex = 0,
      noticeTimer = 0;
    const say = (text: string) => {
      setNotice(text);
      clearTimeout(noticeTimer);
      noticeTimer = window.setTimeout(() => setNotice(''), 1800);
    };
    const jump = async (state: (typeof CHECKPOINTS)[number]) => {
      const ok = await experience.jumpTo(state);
      say(ok ? `→ ${state}` : `${state} not in this build`);
    };
    const key = (event: KeyboardEvent) => {
      if (
        !event.altKey ||
        !event.shiftKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.repeat
      )
        return;
      const code = event.code;
      const digit = DIGITS.indexOf(code);
      let handled = true;
      if (code === 'KeyF') setHud((value) => !value);
      else if (code === 'KeyR') {
        say('restart checkpoint');
        void experience.restartCheckpoint();
      } else if (code === 'Digit0') {
        say('restart experience');
        void experience.restartExperience();
      } else if (code === 'KeyN')
        void experience
          .nextCheckpoint()
          .then((ok) =>
            say(ok ? 'next checkpoint' : 'no later checkpoint available'),
          );
      else if (digit >= 0 && digit < CHECKPOINTS.length)
        void jump(CHECKPOINTS[digit]);
      else if (code === 'KeyQ') {
        const state = useQuality.getState();
        state.set(
          state.name === 'HIGH'
            ? 'BALANCED'
            : state.name === 'BALANCED'
              ? 'LOW'
              : 'HIGH',
        );
        say(`quality ${useQuality.getState().name}`);
      } else if (code === 'KeyT' && import.meta.env.DEV) {
        const type =
          TRANSITION_TYPES[transitionIndex++ % TRANSITION_TYPES.length];
        say(`transition ${type}`);
        // Preview only: replays the current state through the transition.
        void experience.transitionTo(experience.state, type, { force: true });
      } else if (code === 'KeyA') {
        const report = (
          window as unknown as { __latticeDev: { audit(): unknown } }
        ).__latticeDev.audit();
        say(report ? 'audit → console' : 'scene not ready');
      } else if (code === 'KeyS' && import.meta.env.DEV) {
        cameraRig.shake('impact', 0.8);
        say('shake: impact');
      } else handled = false;
      if (handled) event.preventDefault();
    };
    const audit = () => {
      const scene = debugHandles.scene;
      if (!scene) return null;
      const report = auditScene(scene);
      console.info('[lattice] scene audit', report);
      return report;
    };
    (window as unknown as { __latticeDev?: unknown }).__latticeDev = {
      audit,
      experience,
      quality: useQuality,
      audio: audioEngine,
      camera: cameraRig,
      stats: runtimeStats,
      get transitions() {
        return debugHandles.transitions;
      },
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      clearTimeout(noticeTimer);
      delete (window as unknown as { __latticeDev?: unknown }).__latticeDev;
    };
  }, []);

  return (
    <>
      {hud && <Hud />}
      {notice && (
        <div
          style={{ ...panel, top: 'auto', bottom: 16, left: 16, right: 'auto' }}
        >
          {notice}
        </div>
      )}
    </>
  );
}

/**
 * Poll runtime statistics for the development overlay without subscribing at frame rate.
 */
function Hud() {
  const flow = useExperienceFlow();
  const legacy = useSceneState((state) => state.phase);
  const quality = useQuality((state) => state.name),
    dpr = useQuality((state) => state.dpr),
    auto = useQuality((state) => state.auto);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((count) => count + 1), 250);
    return () => clearInterval(id);
  }, []);
  const scaleFactor = runtimeStats,
    slow = scaleFactor.frameMs > 18;
  return (
    <div style={panel} aria-hidden="true">
      <b style={{ color: slow ? '#e07a5f' : '#9fd5b5' }}>
        {scaleFactor.fps.toFixed(0)} FPS
      </b>{' '}
      {scaleFactor.frameMs.toFixed(1)}ms
      <br />
      draw {scaleFactor.drawCalls} · tris{' '}
      {(scaleFactor.triangles / 1000).toFixed(0)}k<br />
      tex {scaleFactor.textures} · geo {scaleFactor.geometries} · prog{' '}
      {scaleFactor.programs}
      <br />
      state {flow.state}
      {flow.transition
        ? ` → ${flow.transition.to} [${flow.transition.type} ${flow.transition.beat}]`
        : ''}
      <br />
      phase {legacy} · cam {cameraRig.mode}
      <br />
      mix {audioEngine.currentMix} · loops {audioEngine.activeLoops.length}
      <br />
      quality {quality}
      {auto ? ' (auto)' : ''} · dpr {dpr.toFixed(2)} · tasks{' '}
      {scaleFactor.frameTasks}
    </div>
  );
}

const panel: CSSProperties = {
  position: 'fixed',
  top: 16,
  right: 16,
  zIndex: 40,
  pointerEvents: 'none',
  font: '11px/1.55 "IBM Plex Mono", ui-monospace, monospace',
  color: '#cfd8d0',
  background: 'rgba(4,8,10,.72)',
  padding: '8px 10px',
  borderRadius: 4,
  letterSpacing: '.02em',
};
