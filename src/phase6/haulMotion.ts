const clamp = (xPosition: number) => Math.max(0, Math.min(1, xPosition));
const smooth = (xPosition: number) => {
  const blendFactor = clamp(xPosition);
  return (
    blendFactor *
    blendFactor *
    blendFactor *
    (blendFactor * (blendFactor * 6 - 15) + 10)
  );
};

/** Brace, pull, settle: no instantaneous starts or rubber-band reversal of the load. */
export function haulProgress(progress: number, pulls: number) {
  const xPosition = clamp(progress) * pulls,
    whole = Math.floor(xPosition),
    phase = xPosition - whole;
  return Math.min(1, (whole + smooth((phase - 0.18) / 0.54)) / pulls);
}
export function haulEffort(progress: number, pulls: number) {
  if (progress <= 0 || progress >= 1) return 0;
  const phase = (progress * pulls) % 1;
  return smooth(phase / 0.18) * (1 - smooth((phase - 0.72) / 0.28));
}
