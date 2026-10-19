import { lazy, Suspense, type ReactNode } from 'react';
import { useDistrictEntry } from './entry';

import { LoadingBaymax } from '../presentation/LoadingBaymax';

const Walk = lazy(() =>
  import('./Walk').then((module) => ({ default: module.Walk })),
);
const ServiceBay = lazy(() =>
  import('./ServiceBay').then((module) => ({ default: module.ServiceBay })),
);

/** Phase 4 takes over the page once Hiro leaves the board; earlier phases render until then. */
export function DistrictHost({ children }: { children: ReactNode }) {
  const { active, step, start, run } = useDistrictEntry();
  if (!active) return children;
  return (
    <Suspense fallback={<LoadingBaymax overlay />}>
      {step === 'walk' ? (
        <Walk key={`walk-${run}`} />
      ) : (
        <ServiceBay key={`bay-${run}`} start={start} />
      )}
    </Suspense>
  );
}
