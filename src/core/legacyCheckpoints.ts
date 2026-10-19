import { experience } from './ExperienceFlow';
import {
  useSceneState,
  type Chapter,
  type Phase,
} from '../state/SceneStateManager';

// Checkpoints for the chapters built so far, registered once at module load (not inside a
// component effect, so remounts / hot reloads can't drop them). Each one resets the run the
// same way the viewer's own replay does, then lands on the chapter's first authored beat.
// ExperienceFlow plays a cover transition around the whole change.

let resetRun: () => void = () => useSceneState.getState().restart();
/**
 * Install the opening director's complete replay reset.
 * @returns A callback that restores the default chapter-store restart.
 */
export function setRunReset(reset: () => void) {
  resetRun = reset;
  return () => {
    resetRun = () => useSceneState.getState().restart();
  };
}

/**
 * Allow the awakening component to mount before dispatching its normal skip input.
 * @param delayMs - Existing mount delay in milliseconds.
 */
const waitForAwakeningMount = (delayMs = 60) =>
  new Promise<void>((resolve) => setTimeout(resolve, delayMs));
/**
 * Reset the run, optionally skip awakening, then enter the requested authored beat.
 */
async function restartAtOpeningBeat(afterAwakening?: () => void) {
  resetRun();
  if (!afterAwakening) return;
  // Let the awakening mount, then skip it through the same input a viewer uses.
  await waitForAwakeningMount();
  window.dispatchEvent(
    new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }),
  );
  afterAwakening();
}

/**
 * Create a callback that restores the chapter store at the supplied beat.
 */
const createCheckpointEntry = (chapter: Chapter, phase: Phase) => () =>
  useSceneState.setState({
    chapter,
    phase,
    targetProgress: 1,
    subtitle: '',
    speaker: 'HIRO',
  });

let checkpointsRegistered = false;
/**
 * Register chapter checkpoint handlers once at module initialization.
 */
export function registerLegacyCheckpoints() {
  if (checkpointsRegistered) return;
  checkpointsRegistered = true;
  experience.registerCheckpoint('AWAKE', () => restartAtOpeningBeat());
  experience.registerCheckpoint('SHELL', () =>
    restartAtOpeningBeat(() => useSceneState.getState().move(1)),
  );
  // Chip already seated; Baymax's boot is the first beat of RED_WAKE.
  experience.registerCheckpoint('RED_WAKE', () =>
    restartAtOpeningBeat(createCheckpointEntry('RED_WAKE', 'booting')),
  );
  // Chase is over; the seam tears open.
  experience.registerCheckpoint('FRACTURE', () =>
    restartAtOpeningBeat(createCheckpointEntry('THE_FRACTURE', 'fracture')),
  );
}
registerLegacyCheckpoints();
