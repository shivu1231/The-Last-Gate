import { experience } from './ExperienceFlow';
import { useSceneState, type Chapter, type Phase } from '../state/SceneStateManager';

// Checkpoints for the chapters built so far, registered once at module load (not inside a
// component effect, so remounts / hot reloads can't drop them). Each one resets the run the
// same way the viewer's own replay does, then lands on the chapter's first authored beat.
// ExperienceFlow plays a cover transition around the whole change.

let resetRun: () => void = () => useSceneState.getState().restart();
/** ExperienceDirector hands over its full replay reset (camera pointer, held inputs, store). */
export function setRunReset(reset: () => void) { resetRun = reset; return () => { resetRun = () => useSceneState.getState().restart(); }; }

const nextTick = (ms = 60) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function freshRun(then?: () => void) {
  resetRun();
  if (!then) return;
  // Let the awakening mount, then skip it through the same input a viewer uses.
  await nextTick();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
  then();
}
const land = (chapter: Chapter, phase: Phase) => () =>
  useSceneState.setState({ chapter, phase, targetProgress: 1, subtitle: '', speaker: 'HIRO' });

let registered = false;
export function registerLegacyCheckpoints() {
  if (registered) return;
  registered = true;
  experience.registerCheckpoint('AWAKE', () => freshRun());
  experience.registerCheckpoint('SHELL', () => freshRun(() => useSceneState.getState().move(1)));
  // Chip already seated; Baymax's boot is the first beat of RED_WAKE.
  experience.registerCheckpoint('RED_WAKE', () => freshRun(land('RED_WAKE', 'booting')));
  // Chase is over; the seam tears open.
  experience.registerCheckpoint('FRACTURE', () => freshRun(land('THE_FRACTURE', 'fracture')));
}
registerLegacyCheckpoints();
