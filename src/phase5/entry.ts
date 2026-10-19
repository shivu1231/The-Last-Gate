import { create } from 'zustand';

/** Phase 5: fit and test the limiter at Baymax's bay, then trace the healthcare chip at the telemetry facility. */
export type PhaseFiveStep = 'limiter' | 'facility';

const param = import.meta.env.DEV ? new URLSearchParams(location.search).get('phase5') : null;
const devStep: PhaseFiveStep | null = param === 'facility' ? 'facility' : param ? 'limiter' : null;

type PhaseFiveEntry = { active: boolean; step: PhaseFiveStep; run: number };
export const usePhaseFiveEntry = create<PhaseFiveEntry>(() => ({ active: !!devStep, step: devStep ?? 'limiter', run: 0 }));

/** From the district: carry the finished limiter back to Baymax. */
export function enterPhaseFive(): void {
  usePhaseFiveEntry.setState(state => ({ active: true, step: 'limiter', run: state.run + 1 }));
}
