import { create } from 'zustand';
import { experience } from '../core/ExperienceFlow';

/** Phase 2: harbour arrival, player-controlled approach, then physical inspection. */
export type RecoveryStage = 'arrive' | 'approach' | 'inspect' | 'journey';

export const useRecovery = create<{ active: boolean }>(() => ({ active: false }));

/** The Phase 1 -> Phase 2 handoff: the displacement drops Hiro in another part of the city. */
export function enterRecovery() {
  if (useRecovery.getState().active) return;
  experience.observe('BAYMAX_RECOVERY');
  useRecovery.setState({ active: true });
}
