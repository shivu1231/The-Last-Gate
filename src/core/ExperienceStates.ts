// Master narrative state definition for the whole experience.
// Every chapter of every phase branch maps onto exactly one of these states.
// This file is pure data: no scene imports, no side effects, safe for every branch to read.

export const EXPERIENCE_STATES = [
  'BOOT', 'AWAKE', 'SHELL', 'CHIP', 'BOOT_FAILURE', 'RED_WAKE', 'FRACTURE',
  'AFTERIMAGE', 'BAYMAX_RECOVERY',
] as const;
export type ExperienceState = typeof EXPERIENCE_STATES[number];

// Internal recovery points. Never rendered as navigation.
export const CHECKPOINTS: readonly ExperienceState[] = [
  'AWAKE', 'SHELL', 'RED_WAKE', 'FRACTURE', 'BAYMAX_RECOVERY',
];

export type TransitionType =
  | 'CUT' | 'BLINK' | 'RED_SCAN' | 'DEBRIS_OCCLUSION' | 'MICROBOT_SWARM' | 'DIMENSION_FOLD'
  | 'PORTAL_OVEREXPOSURE' | 'FOG_PASS' | 'DEPTH_COLLAPSE' | 'CAMERA_OCCLUSION';

export type CameraMode =
  | 'RECOVERY' | 'EXPLORATION' | 'INTERACTION' | 'CHASE' | 'OBSERVATION' | 'WEIGHTLESS' | 'FINAL_RUN' | 'HOME';

export type AudioMixName =
  | 'SILENT' | 'AWAKE' | 'SHELL' | 'CHIP' | 'BOOT' | 'CORRUPTION' | 'CHASE' | 'FRACTURE';

export type StateProfile = {
  camera: CameraMode;
  mix: AudioMixName;
  /** Default way INTO this state. Each is used once or twice across the arc, never everywhere. */
  enterWith: TransitionType;
  /** States whose assets should be warmed while this one plays. */
  preload: ExperienceState[];
};

export const STATE_PROFILES: Record<ExperienceState, StateProfile> = {
  BOOT:         { camera: 'RECOVERY',    mix: 'SILENT',       enterWith: 'CUT',                 preload: ['AWAKE'] },
  AWAKE:        { camera: 'RECOVERY',    mix: 'AWAKE',        enterWith: 'BLINK',               preload: ['SHELL', 'CHIP'] },
  SHELL:        { camera: 'EXPLORATION', mix: 'SHELL',        enterWith: 'CUT',                 preload: ['CHIP', 'BOOT_FAILURE'] },
  CHIP:         { camera: 'INTERACTION', mix: 'CHIP',         enterWith: 'CUT',                 preload: ['RED_WAKE'] },
  BOOT_FAILURE: { camera: 'OBSERVATION', mix: 'BOOT',         enterWith: 'CUT',                 preload: ['RED_WAKE'] },
  RED_WAKE:     { camera: 'CHASE',       mix: 'CORRUPTION',   enterWith: 'RED_SCAN',            preload: ['FRACTURE'] },
  FRACTURE:     { camera: 'OBSERVATION', mix: 'FRACTURE',     enterWith: 'DEBRIS_OCCLUSION',    preload: ['AFTERIMAGE'] },
  AFTERIMAGE:   { camera: 'WEIGHTLESS',  mix: 'FRACTURE',     enterWith: 'DIMENSION_FOLD',      preload: ['BAYMAX_RECOVERY'] },
  BAYMAX_RECOVERY: { camera: 'INTERACTION', mix: 'SHELL', enterWith: 'PORTAL_OVEREXPOSURE', preload: [] },
};

export const stateIndex = (state: ExperienceState) => EXPERIENCE_STATES.indexOf(state);
export const isCheckpoint = (state: ExperienceState) => CHECKPOINTS.includes(state);

export function nextCheckpoint(from: ExperienceState): ExperienceState | null {
  const index = stateIndex(from);
  return CHECKPOINTS.find(state => stateIndex(state) > index) ?? null;
}
export function checkpointFor(state: ExperienceState): ExperienceState {
  const index = stateIndex(state);
  let found: ExperienceState = 'AWAKE';
  for (const checkpoint of CHECKPOINTS) if (stateIndex(checkpoint) <= index) found = checkpoint;
  return found;
}

// Bridge from the existing chapter/phase store to master states.
// Phase branches add their phases here (one line each) instead of touching the director.
const PHASE_STATE: Record<string, ExperienceState> = {
  loading: 'BOOT', awakening: 'AWAKE', approaching: 'AWAKE', discovery: 'SHELL', inspected: 'SHELL',
  'chip-focus': 'CHIP', 'chip-reaching': 'CHIP', 'chip-held': 'CHIP', 'chest-focus': 'CHIP', 'panel-opening': 'CHIP',
  'socket-ready': 'CHIP', inserting: 'CHIP', sealing: 'CHIP',
  silence: 'BOOT_FAILURE', booting: 'BOOT_FAILURE', diagnostic: 'BOOT_FAILURE',
  corrupting: 'RED_WAKE', threat: 'RED_WAKE', corrupted: 'RED_WAKE', ignition: 'RED_WAKE', chase: 'RED_WAKE',
  fracture: 'FRACTURE', pulled: 'FRACTURE', handoff: 'FRACTURE',
};
const CHAPTER_STATE: Record<string, ExperienceState> = {
  BOOT: 'BOOT', AWAKE: 'AWAKE', THE_SHELL: 'SHELL', RED_WAKE: 'RED_WAKE', THE_FRACTURE: 'FRACTURE',
};
export function registerPhaseStates(map: Record<string, ExperienceState>) { Object.assign(PHASE_STATE, map); }
export function resolveLegacyState(chapter: string, phase: string): ExperienceState {
  return PHASE_STATE[phase] ?? CHAPTER_STATE[chapter] ?? (EXPERIENCE_STATES.includes(chapter as ExperienceState) ? chapter as ExperienceState : 'BOOT');
}
