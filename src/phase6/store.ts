import { create } from 'zustand';
import type { PhaseSixStep } from './entry';

/**
 * Phase 6's story as a list of stages. Every animation reads the stage and the time since it
 * began, so any stage can be entered cold (dev shortcuts, Ctrl+M) and look right.
 *
 *   1 wake → switchOn1 · 2 limited · 3 escape · 4 gate → powered · 5 choice → switchOff → flyin
 *   6 faceoff → switchOn2 → drop · 7 carry → bloom · 8 home → seated → boot → end
 *
 * In carry Hiro pulls the combat chip out of the open bay (chip: bay → held → out), then plays the
 * seats that same card in the gate reader (cart: hand → held → slot). The card carries Baymax's own
 * transit log from his crossing; the reader matches its boundary signature and rebuilds the return
 * vector. The relay gave Hiro information only (the trace ends at the old portal site), never an item.
 */
export type Stage =
  | 'wake'
  | 'switchOn1'
  | 'limited'
  | 'escape'
  | 'gate'
  | 'powered'
  | 'choice'
  | 'switchOff'
  | 'flyin'
  | 'faceoff'
  | 'switchOn2'
  | 'drop'
  | 'carry'
  | 'bloom'
  | 'home'
  | 'seated'
  | 'boot'
  | 'end';

const ORDER: Stage[] = [
  'wake',
  'switchOn1',
  'limited',
  'escape',
  'gate',
  'powered',
  'choice',
  'switchOff',
  'flyin',
  'faceoff',
  'switchOn2',
  'drop',
  'carry',
  'bloom',
  'home',
  'seated',
  'boot',
  'end',
];
/** Where each of the eight beats (and the end card) starts: what Ctrl+M jumps between. */
const BEATS: Stage[] = [
  'wake',
  'limited',
  'escape',
  'gate',
  'choice',
  'faceoff',
  'carry',
  'home',
  'end',
];
const ENTRY: Record<PhaseSixStep, Stage> = {
  wake: 'wake',
  escape: 'escape',
  gate: 'gate',
  drop: 'faceoff',
  portal: 'carry',
  home: 'home',
};

/**
 * Environment set selected by the final chapter.
 */
export type WorldSetName = 'relay' | 'street' | 'home';
export const setOf = (state: Stage): WorldSetName =>
  ORDER.indexOf(state) <= ORDER.indexOf('limited')
    ? 'relay'
    : ORDER.indexOf(state) < ORDER.indexOf('home')
      ? 'street'
      : 'home';
export const after = (state: Stage, than: Stage) =>
  ORDER.indexOf(state) > ORDER.indexOf(than);
export const atLeast = (state: Stage, than: Stage) =>
  ORDER.indexOf(state) >= ORDER.indexOf(than);
export const isInsert = (state: Stage) =>
  state === 'switchOn1' || state === 'switchOff' || state === 'switchOn2';
export const now = () => performance.now() / 1000;

/** The three ring segments start well off; the solved angles are only implied by the contacts. */
export const START_ANGLES = [215, 40, 300];

/**
 * The home beat, seen through Hiro's eyes: kneeling as they arrive, walking to the bin, at it,
 * walking back, kneeling at Baymax, watching the boot, waiting on the fist bump, after it, walking
 * to the rail, at the rail.
 */
export type HomeStep =
  | 'arrive'
  | 'toBin'
  | 'atBin'
  | 'back'
  | 'atBaymax'
  | 'boot'
  | 'bump'
  | 'bumped'
  | 'rail'
  | 'atRail';

/**
 * Shared state for the final pursuit, portal and home sequence.
 */
type PhaseSixState = {
  stage: Stage;
  since: number;
  regulator: boolean;
  angles: number[];
  chip: 'bay' | 'held' | 'out';
  cart: 'hand' | 'held' | 'slot';
  care: 'ground' | 'hand' | 'open' | 'seated';
  /** When Hiro took the healthcare chip out of the bin (care: 'hand'). */
  fetchAt: number;
  /** Where the first-person home beat has got to, for its prompts (World sets it as it changes). */
  homeStep: HomeStep;
  /** When the player bumped Baymax's fist (0 = not yet); the boot waits on his raised fist till then. */
  bumpAt: number;
  /** When the combat chip came out (Hiro then walks to the gate's reader). */
  pulledAt: number;
  /** Phase 5 decoded the healthcare chip's last transmission: outbound, last fixed at the old portal site. */
  portalTraceKnown: boolean;
  /** Baymax's combat chip holds his onboard transit log from the crossing (data on the one physical card). */
  hasPortalTransitLog: boolean;
  /** On the run, Baymax got to him: the run stops and offers a retry. */
  caught: boolean;
};
const regulatorFor = (state: Stage) =>
  (atLeast(state, 'limited') && !atLeast(state, 'flyin')) ||
  atLeast(state, 'drop');

/**
 * Compute the existing state for result for the final pursuit and restoration.
 */
function stateFor(stage: Stage): PhaseSixState {
  return {
    stage,
    since: now(),
    regulator: regulatorFor(stage),
    angles: atLeast(stage, 'powered') ? [0, 140, 240] : [...START_ANGLES],
    chip: atLeast(stage, 'bloom') ? 'out' : 'bay',
    cart: atLeast(stage, 'bloom') ? 'slot' : 'hand',
    pulledAt: 0,
    portalTraceKnown: true,
    hasPortalTransitLog: true,
    caught: false,
    care: atLeast(stage, 'seated') ? 'seated' : 'ground',
    fetchAt: 0,
    homeStep: 'arrive',
    bumpAt: 0,
  };
}

export const useP6 = create<PhaseSixState>(() => stateFor('wake'));
// Development only: lets tooling jump between stages (window.__lastGateP6.getState().go('drop')).
if (import.meta.env.DEV)
  (window as Window & { __lastGateP6?: unknown }).__lastGateP6 = {
    store: useP6,
    go: (state: Stage) => useP6.setState(stateFor(state)),
  };

export const begin = (from: PhaseSixStep) =>
  useP6.setState(stateFor(ENTRY[from]));
/** Moves the story on. Keeps the regulator and puzzle state the player has built. */
export const go = (stage: Stage) => useP6.setState({ stage, since: now() });
export const elapsed = () => now() - useP6.getState().since;
/** Ctrl+M: straight to the start of the next beat, with everything before it done. */
export function skipBeat() {
  const index = ORDER.indexOf(useP6.getState().stage);
  const next = BEATS.find((secondEntry) => ORDER.indexOf(secondEntry) > index);
  if (next) useP6.setState(stateFor(next));
}
