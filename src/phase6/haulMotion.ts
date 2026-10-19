const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const k = clamp(x); return k * k * k * (k * (k * 6 - 15) + 10); };

/** Brace, pull, settle: no instantaneous starts or rubber-band reversal of the load. */
export function haulProgress(progress: number, pulls: number) {
  const x = clamp(progress) * pulls, whole = Math.floor(x), phase = x - whole;
  return Math.min(1, (whole + smooth((phase - .18) / .54)) / pulls);
}
export function haulEffort(progress: number, pulls: number) {
  if (progress <= 0 || progress >= 1) return 0;
  const phase = (progress * pulls) % 1;
  return smooth(phase / .18) * (1 - smooth((phase - .72) / .28));
}
