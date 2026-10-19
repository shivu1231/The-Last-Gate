/**
 * Where the board leads once the assessment is complete. The next phase registers itself here,
 * so the board never imports it. Without one (the phase3 branch on its own), the board ends on
 * its assessment.
 */
export type EngineeringExit = {
  label: string;
  go: () => void;
  prepare?: () => Promise<unknown>;
};

let exit: EngineeringExit | null = null;
/**
 * Register the chapter action used after engineering repairs are complete.
 */
export function registerEngineeringExit(next: EngineeringExit) {
  exit = next;
}
/**
 * Read the currently registered engineering exit action.
 */
export function engineeringExit() {
  return exit;
}
