// Master narrative state definition for the whole experience.
// Every chapter of every phase branch maps onto exactly one of these states.
// This file is pure data: no scene imports, no side effects, safe for every branch to read.

/**
 * Narrative state order used for checkpoint comparisons and chapter bridging.
 */
export const EXPERIENCE_STATES = [
  'BOOT',
  'AWAKE',
  'SHELL',
  'CHIP',
  'BOOT_FAILURE',
  'RED_WAKE',
  'FRACTURE',
  'AFTERIMAGE',
  'BAYMAX_RECOVERY',
] as const;
/**
 * A supported master narrative state.
 */
export type ExperienceState = (typeof EXPERIENCE_STATES)[number];

// Internal recovery points. Never rendered as navigation.
/**
 * Internal restart points in narrative order; these are not visible navigation.
 */
export const CHECKPOINTS: readonly ExperienceState[] = [
  'AWAKE',
  'SHELL',
  'RED_WAKE',
  'FRACTURE',
  'BAYMAX_RECOVERY',
];

/**
 * Named cover effects understood by the cinematic transition driver.
 */
export type TransitionType =
  | 'CUT'
  | 'BLINK'
  | 'RED_SCAN'
  | 'DEBRIS_OCCLUSION'
  | 'MICROBOT_SWARM'
  | 'DIMENSION_FOLD'
  | 'PORTAL_OVEREXPOSURE'
  | 'FOG_PASS'
  | 'DEPTH_COLLAPSE'
  | 'CAMERA_OCCLUSION';

/**
 * Camera behaviors selected by a narrative state profile.
 */
export type CameraMode =
  | 'RECOVERY'
  | 'EXPLORATION'
  | 'INTERACTION'
  | 'CHASE'
  | 'OBSERVATION'
  | 'WEIGHTLESS'
  | 'FINAL_RUN'
  | 'HOME';

/**
 * Audio mixes selected by a narrative state profile.
 */
export type AudioMixName =
  | 'SILENT'
  | 'AWAKE'
  | 'SHELL'
  | 'CHIP'
  | 'BOOT'
  | 'CORRUPTION'
  | 'CHASE'
  | 'FRACTURE';

/**
 * Camera, audio and preload policy applied when entering a master state.
 */
export type StateProfile = {
  camera: CameraMode;
  mix: AudioMixName;
  /** Default way INTO this state. Each is used once or twice across the arc, never everywhere. */
  enterWith: TransitionType;
  /** States whose assets should be warmed while this one plays. */
  preload: ExperienceState[];
};

/**
 * Shared presentation policy for each master state.
 */
export const STATE_PROFILES: Record<ExperienceState, StateProfile> = {
  BOOT: {
    camera: 'RECOVERY',
    mix: 'SILENT',
    enterWith: 'CUT',
    preload: ['AWAKE'],
  },
  AWAKE: {
    camera: 'RECOVERY',
    mix: 'AWAKE',
    enterWith: 'BLINK',
    preload: ['SHELL', 'CHIP'],
  },
  SHELL: {
    camera: 'EXPLORATION',
    mix: 'SHELL',
    enterWith: 'CUT',
    preload: ['CHIP', 'BOOT_FAILURE'],
  },
  CHIP: {
    camera: 'INTERACTION',
    mix: 'CHIP',
    enterWith: 'CUT',
    preload: ['RED_WAKE'],
  },
  BOOT_FAILURE: {
    camera: 'OBSERVATION',
    mix: 'BOOT',
    enterWith: 'CUT',
    preload: ['RED_WAKE'],
  },
  RED_WAKE: {
    camera: 'CHASE',
    mix: 'CORRUPTION',
    enterWith: 'RED_SCAN',
    preload: ['FRACTURE'],
  },
  FRACTURE: {
    camera: 'OBSERVATION',
    mix: 'FRACTURE',
    enterWith: 'DEBRIS_OCCLUSION',
    preload: ['AFTERIMAGE'],
  },
  AFTERIMAGE: {
    camera: 'WEIGHTLESS',
    mix: 'FRACTURE',
    enterWith: 'DIMENSION_FOLD',
    preload: ['BAYMAX_RECOVERY'],
  },
  BAYMAX_RECOVERY: {
    camera: 'INTERACTION',
    mix: 'SHELL',
    enterWith: 'PORTAL_OVEREXPOSURE',
    preload: [],
  },
};

/**
 * Return the narrative position of a master state.
 */
export const stateIndex = (state: ExperienceState) =>
  EXPERIENCE_STATES.indexOf(state);
/**
 * Check whether a state is an authored restart point.
 */
export const isCheckpoint = (state: ExperienceState) =>
  CHECKPOINTS.includes(state);

/**
 * Find the first checkpoint that occurs after the supplied state.
 * @returns The next checkpoint, or null at the end of the sequence.
 */
export function nextCheckpoint(
  currentState: ExperienceState,
): ExperienceState | null {
  const currentStateIndex = stateIndex(currentState);
  return (
    CHECKPOINTS.find((state) => stateIndex(state) > currentStateIndex) ?? null
  );
}

/**
 * Find the most recent checkpoint at or before a state.
 * The opening awakening remains the fallback before the first checkpoint.
 */
export function checkpointFor(state: ExperienceState): ExperienceState {
  const currentStateIndex = stateIndex(state);
  let checkpointState: ExperienceState = 'AWAKE';
  for (const checkpoint of CHECKPOINTS)
    if (stateIndex(checkpoint) <= currentStateIndex)
      checkpointState = checkpoint;
  return checkpointState;
}

// Bridge from the existing chapter/phase store to master states.
// Phase branches add their phases here (one line each) instead of touching the director.
const STATE_BY_PHASE: Record<string, ExperienceState> = {
  loading: 'BOOT',
  awakening: 'AWAKE',
  approaching: 'AWAKE',
  discovery: 'SHELL',
  inspected: 'SHELL',
  'chip-focus': 'CHIP',
  'chip-reaching': 'CHIP',
  'chip-held': 'CHIP',
  'chest-focus': 'CHIP',
  'panel-opening': 'CHIP',
  'socket-ready': 'CHIP',
  inserting: 'CHIP',
  sealing: 'CHIP',
  silence: 'BOOT_FAILURE',
  booting: 'BOOT_FAILURE',
  diagnostic: 'BOOT_FAILURE',
  corrupting: 'RED_WAKE',
  threat: 'RED_WAKE',
  corrupted: 'RED_WAKE',
  ignition: 'RED_WAKE',
  chase: 'RED_WAKE',
  fracture: 'FRACTURE',
  pulled: 'FRACTURE',
  handoff: 'FRACTURE',
};

const STATE_BY_CHAPTER: Record<string, ExperienceState> = {
  BOOT: 'BOOT',
  AWAKE: 'AWAKE',
  THE_SHELL: 'SHELL',
  RED_WAKE: 'RED_WAKE',
  THE_FRACTURE: 'FRACTURE',
};

/**
 * Extend the legacy phase mapping without importing chapter scene implementations.
 */
export function registerPhaseStates(
  phaseStates: Record<string, ExperienceState>,
) {
  Object.assign(STATE_BY_PHASE, phaseStates);
}

/**
 * Resolve a legacy phase first, then its chapter, then a valid master state.
 * Unrecognized chapter and phase pairs fall back to BOOT.
 */
export function resolveLegacyState(
  chapter: string,
  phase: string,
): ExperienceState {
  return (
    STATE_BY_PHASE[phase] ??
    STATE_BY_CHAPTER[chapter] ??
    (EXPERIENCE_STATES.includes(chapter as ExperienceState)
      ? (chapter as ExperienceState)
      : 'BOOT')
  );
}
