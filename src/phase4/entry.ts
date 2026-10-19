import { create } from 'zustand';

/** Phase 4 has two steps: the walk from Baymax to Bay 6, then the service bay itself. */
export type DistrictStep = 'walk' | 'bay';
/** Where the bay opens: walking in from the gate, at the uncovered case, or with the regulator found. */
export type BayStart = 'enter' | 'box' | 'found';

// Dev shortcuts: ?phase4=walk | bay | box | found (district is the old name for bay).
const param = import.meta.env.DEV
  ? new URLSearchParams(location.search).get('phase4')
  : null;
const dev: { step: DistrictStep; start: BayStart } | null =
  param === 'walk'
    ? { step: 'walk', start: 'enter' }
    : param === 'bay' || param === 'district'
      ? { step: 'bay', start: 'enter' }
      : param === 'box' || param === 'found'
        ? { step: 'bay', start: param }
        : null;

/**
 * Data contract used by Bay 6 and its city approach.
 */
type DistrictEntry = {
  active: boolean;
  step: DistrictStep;
  start: BayStart;
  run: number;
};
export const useDistrictEntry = create<DistrictEntry>(() => ({
  active: !!dev,
  step: dev?.step ?? 'walk',
  start: dev?.start ?? 'enter',
  run: 0,
}));

/** From the engineering board: leave Baymax and follow the service current to Bay 6. */
export function enterDistrictWalk(): void {
  useDistrictEntry.setState((state) => ({
    active: true,
    step: 'walk',
    start: 'enter',
    run: state.run + 1,
  }));
}

/** Through the gate and into the bay (end of the walk, or a replay). */
export function enterServiceBay(start: BayStart = 'enter'): void {
  useDistrictEntry.setState((state) => ({
    active: true,
    step: 'bay',
    start,
    run: state.run + 1,
  }));
}
