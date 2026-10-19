import { registerDistrictExit } from '../phase4/exit';
import { enterPhaseFive } from './entry';
import { transitionChapter } from '../presentation/chapterTransition';

// Phase 5 plugs into the end of the Phase 4 district: the regulator Hiro just found goes to Baymax.
// Importing this module once is the whole integration.
registerDistrictExit({
  label: 'FIT THE REGULATOR TO BAYMAX',
  go: () => transitionChapter(enterPhaseFive, true),
  prepare: () => import('./PhaseFive'),
});

export { PhaseFiveHost } from './PhaseFiveHost';
