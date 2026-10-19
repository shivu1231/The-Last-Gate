import { registerPhaseFiveExit } from '../phase5/exit';
import { enterPhaseSix } from './entry';
import { transitionChapter } from '../presentation/chapterTransition';

// Phase 6 plugs into the end of the Phase 5 trace: the chip's signal left the city, so Hiro follows
// it. Importing this module once is the whole integration.
registerPhaseFiveExit({
  label: 'GO AFTER THE SIGNAL',
  go: () => transitionChapter(enterPhaseSix, true),
  prepare: () => import('./PhaseSix'),
});

export { PhaseSixHost } from './PhaseSixHost';
