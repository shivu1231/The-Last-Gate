import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { usePhaseTwoEntry } from './entry';
import { useRecovery } from '../recovery/state';
import { useSceneState } from '../state/SceneStateManager';
import { LoadingBaymax } from '../presentation/LoadingBaymax';
const Recovery = lazy(() => import('../recovery/Recovery').then(module => ({default: module.Recovery})));

const PhaseTwo = lazy(()=>import('./PhaseTwoExperience').then(module=>({default:module.PhaseTwoExperience})));

export function PhaseTwoHost({children}:{children:ReactNode}) {
  const recovering = useRecovery(s => s.active);
  const phase = useSceneState(s => s.phase), [prepared, setPrepared] = useState(false);
  useEffect(() => { if (['awakening', 'approaching', 'discovery', 'chip-held', 'booting'].includes(phase)) setPrepared(true); }, [phase]);
  // Compile once early in Phase 1: from the awakening, while his eyes are still shut, so the compile
  // pause lands on a dark screen instead of the walk up to Baymax (tracker R-01). Demand mode does not render hidden frames.
  // Keep this exact Canvas alive across the handoff; discard the outgoing scene instead.
  return <>
    {!recovering && <LegacyHost>{children}</LegacyHost>}
    {(recovering || prepared) && <div inert={!recovering} aria-hidden={!recovering} style={{ position: 'fixed', inset: 0, visibility: recovering ? 'visible' : 'hidden', pointerEvents: recovering ? 'auto' : 'none' }}>
      <Suspense fallback={<LoadingBaymax overlay />}><Recovery active={recovering} /></Suspense>
    </div>}
  </>;
}
function LegacyHost({children}:{children:ReactNode}) {
  const {active,entry,session}=usePhaseTwoEntry();
  return active ? <Suspense fallback={<LoadingBaymax overlay />}><PhaseTwo key={session} entry={entry}/></Suspense> : children;
}
