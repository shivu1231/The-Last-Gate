import { lazy, Suspense, type ReactNode } from 'react';
import { usePhaseFiveEntry } from './entry';

import { LoadingBaymax } from '../presentation/LoadingBaymax';

const PhaseFive = lazy(() => import('./PhaseFive').then(module => ({ default: module.PhaseFive })));

/** Phase 5 takes over once Hiro leaves the district with the limiter; earlier phases render until then. */
export function PhaseFiveHost({ children }: { children: ReactNode }) {
  const { active, step, run } = usePhaseFiveEntry();
  if (!active) return children;
  return <Suspense fallback={<LoadingBaymax overlay />}><PhaseFive key={run} initial={step} /></Suspense>;
}
