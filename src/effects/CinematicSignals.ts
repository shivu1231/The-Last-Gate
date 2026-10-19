// Shared, allocation-free channel from transitions / story beats to the renderer and camera.
// Values are additive offsets that writers must return to 0; readers never mutate them.
export const cinematicSignals = {
  /** Added to tone-mapping exposure (PORTAL_OVEREXPOSURE drives this up). */
  exposure: 0,
  /** Chromatic / dimensional instability added to the grade pass. */
  instability: 0,
  /** Extra depth-of-field blur 0..1 (DEPTH_COLLAPSE, FOG_PASS). */
  blur: 0,
  /** Degrees added to the camera FOV for push/pull kicks. */
  fov: 0,
};
export type CinematicSignals = typeof cinematicSignals;

export function resetSignals() {
  cinematicSignals.exposure = 0; cinematicSignals.instability = 0; cinematicSignals.blur = 0; cinematicSignals.fov = 0;
}
