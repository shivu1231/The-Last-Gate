/**
 * Where the telemetry trace leads once the healthcare chip's last signal is found. The next phase
 * registers itself here, so Phase 5 never imports it. Without one (the phase5 branch on its own),
 * the phase ends on its discovery.
 */
export type PhaseFiveExit = {
  label: string;
  go: () => void;
  prepare?: () => Promise<unknown>;
};

let exit: PhaseFiveExit | null = null;
/**
 * Register the handoff from the telemetry result to the final chapter.
 */
export function registerPhaseFiveExit(next: PhaseFiveExit) {
  exit = next;
}
/**
 * Read the currently registered telemetry exit action.
 */
export function phaseFiveExit() {
  return exit;
}
