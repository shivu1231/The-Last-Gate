import { lazy, Suspense, type ReactNode } from 'react';
import { usePhaseSixEntry } from './entry';

import { LoadingBaymax } from '../presentation/LoadingBaymax';

const PhaseSix = lazy(() =>
  import('./PhaseSix').then((module) => ({ default: module.PhaseSix })),
);

/** Phase 6 takes over once Hiro goes after the signal; earlier phases render until then. */
export function PhaseSixHost({ children }: { children: ReactNode }) {
  const { active, step, run } = usePhaseSixEntry();
  if (!active) return children;
  return (
    <Suspense fallback={<LoadingBaymax overlay />}>
      <PhaseSix key={run} initial={step} />
    </Suspense>
  );
}
