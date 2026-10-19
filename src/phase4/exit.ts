/**
 * Where Bay 6 leads once Hiro has the power regulator. The next phase registers itself here, so
 * Phase 4 never imports it. Without one (the phase4 branch on its own), the bay ends on the find.
 */
export type DistrictExit = { label: string; go: () => void; prepare?: () => Promise<unknown> };

let exit: DistrictExit | null = null;
export function registerDistrictExit(next: DistrictExit) { exit = next; }
export function districtExit() { return exit; }
