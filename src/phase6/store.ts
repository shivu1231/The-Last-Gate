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
 * seats that same card in the gate reader (cart: hand → held → slot). The relay capture stays loaded.
 */
export type Stage =
  | 'wake' | 'switchOn1' | 'limited' | 'escape' | 'gate' | 'powered' | 'choice' | 'switchOff' | 'flyin'
  | 'faceoff' | 'switchOn2' | 'drop' | 'carry' | 'bloom' | 'home' | 'seated' | 'boot' | 'end';

const ORDER: Stage[] = ['wake', 'switchOn1', 'limited', 'escape', 'gate', 'powered', 'choice', 'switchOff', 'flyin', 'faceoff', 'switchOn2', 'drop', 'carry', 'bloom', 'home', 'seated', 'boot', 'end'];
/** Where each of the eight beats (and the end card) starts: what Ctrl+M jumps between. */
const BEATS: Stage[] = ['wake', 'limited', 'escape', 'gate', 'choice', 'faceoff', 'carry', 'home', 'end'];
const ENTRY: Record<PhaseSixStep, Stage> = { wake: 'wake', escape: 'escape', gate: 'gate', drop: 'faceoff', portal: 'carry', home: 'home' };

export type SetName = 'relay' | 'street' | 'home';
export const setOf = (s: Stage): SetName => ORDER.indexOf(s) <= ORDER.indexOf('limited') ? 'relay' : ORDER.indexOf(s) < ORDER.indexOf('home') ? 'street' : 'home';
export const after = (s: Stage, than: Stage) => ORDER.indexOf(s) > ORDER.indexOf(than);
export const atLeast = (s: Stage, than: Stage) => ORDER.indexOf(s) >= ORDER.indexOf(than);
export const isInsert = (s: Stage) => s === 'switchOn1' || s === 'switchOff' || s === 'switchOn2';
export const now = () => performance.now() / 1000;

/** The three ring segments start well off; the solved angles are only implied by the contacts. */
export const START_ANGLES = [215, 40, 300];

type State = {
  stage: Stage; since: number;
  regulator: boolean; angles: number[];
  chip: 'bay' | 'held' | 'out'; cart: 'hand' | 'held' | 'slot'; care: 'ground' | 'fetch' | 'hand' | 'open' | 'seated';
  /** When Hiro set off for the bin with the healthcare chip in it (care: 'fetch'). */
  fetchAt: number;
  /** When the combat chip came out (Hiro then walks to the gate's reader). */
  pulledAt: number;
  /** Hiro has taken the RX/06 capture out of the relay's recorder. */
  took: boolean;
  /** On the run, Baymax got to him: the run stops and offers a retry. */
  caught: boolean;
};
const regulatorFor = (s: Stage) => (atLeast(s, 'limited') && !atLeast(s, 'flyin')) || atLeast(s, 'drop');

function stateFor(stage: Stage): State {
  return {
    stage, since: now(), regulator: regulatorFor(stage),
    angles: atLeast(stage, 'powered') ? [0, 140, 240] : [...START_ANGLES],
    chip: atLeast(stage, 'bloom') ? 'out' : 'bay',
    cart: atLeast(stage, 'bloom') ? 'slot' : 'hand',
    pulledAt: 0, took: atLeast(stage, 'escape'), caught: false,
    care: atLeast(stage, 'seated') ? 'seated' : 'ground', fetchAt: 0,
  };
}

export const useP6 = create<State>(() => stateFor('wake'));
// Development only: lets tooling jump between stages (window.__lastGateP6.getState().go('drop')).
if (import.meta.env.DEV) (window as Window & { __lastGateP6?: unknown }).__lastGateP6 = { store: useP6, go: (s: Stage) => useP6.setState(stateFor(s)) };

export const begin = (from: PhaseSixStep) => useP6.setState(stateFor(ENTRY[from]));
/** Moves the story on. Keeps the regulator and puzzle state the player has built. */
export const go = (stage: Stage) => useP6.setState({ stage, since: now() });
export const elapsed = () => now() - useP6.getState().since;
/** Ctrl+M: straight to the start of the next beat, with everything before it done. */
export function skipBeat() {
  const i = ORDER.indexOf(useP6.getState().stage);
  const next = BEATS.find(b => ORDER.indexOf(b) > i);
  if (next) useP6.setState(stateFor(next));
}
