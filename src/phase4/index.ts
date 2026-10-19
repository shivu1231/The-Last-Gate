import { registerEngineeringExit } from '../engineering/exit';
import { enterDistrictWalk } from './entry';
import { transitionChapter } from '../presentation/chapterTransition';

// Phase 4 plugs into the end of the Phase 3 board: the assessment's answer is to go and find
// something that can hold him back. Importing this module once is the whole integration.
registerEngineeringExit({
  label: 'FIND A WAY TO HOLD HIM BACK',
  go: () => transitionChapter(enterDistrictWalk, true),
  prepare: () => import('./Walk'),
});

export { DistrictHost } from './DistrictHost';
