import { create } from 'zustand';

/** Phase 6 entry points: the six places the dev shortcut can open (?phase6=wake … home). */
export type PhaseSixStep =
  | 'wake'
  | 'escape'
  | 'gate'
  | 'drop'
  | 'portal'
  | 'home';
const STEPS: PhaseSixStep[] = [
  'wake',
  'escape',
  'gate',
  'drop',
  'portal',
  'home',
];

const param = import.meta.env.DEV
  ? new URLSearchParams(location.search).get('phase6')
  : null;
const devStep: PhaseSixStep | null = param
  ? (STEPS as string[]).includes(param)
    ? (param as PhaseSixStep)
    : 'wake'
  : null;

type PhaseSixEntry = { active: boolean; step: PhaseSixStep; run: number };
export const usePhaseSixEntry = create<PhaseSixEntry>(() => ({
  active: !!devStep,
  step: devStep ?? 'wake',
  run: 0,
}));

/** From the relay: the chip's signal crossed the boundary, so Hiro goes after it. */
export function enterPhaseSix(): void {
  usePhaseSixEntry.setState((state) => ({
    active: true,
    step: 'wake',
    run: state.run + 1,
  }));
}
