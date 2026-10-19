import { Vector3 } from 'three';

/**
 * Data contract used by regulator fitting and telemetry.
 */
export type FacilityShot = {
  p: [number, number, number];
  l: [number, number, number];
  duration: number;
};
export const FACILITY_SHOTS = {
  power: [
    [1.1, 1.8, 3.3],
    [7.6, 1.6, 0.65],
  ],
  patch: [
    [2.2, 1.8, 4.6],
    [7.8, 1.7, 2.6],
  ],
  spectrum: [
    [-0.9, 1.75, 1.7],
    [0, 1.4, -1.95],
  ],
  // Look up the open face from the apron. The previous high oblique view crossed
  // a neighboring roof and hid half the reflector behind it.
  dish: [
    [1.6, 8.5, -19.2],
    [1.6, 7.1, -13.1],
  ],
  trace: [
    [0, 1.42, -0.35],
    [0, 1.24, -2],
  ],
  // Match the next chapter's eye position outside the broken rear wall. The roof must
  // never sit between Hiro and Baymax's aerial entrance.
  done: [
    [5, 1.56, -8.8],
    [0.6, 1.8, -11.5],
  ],
} as const;

/** Both directions pass below the rear lintel. Exterior moves stay east of the receiver tower. */
export function facilityCameraRoute(
  from: Vector3,
  key: keyof typeof FACILITY_SHOTS,
): FacilityShot[] {
  const outside = from.z < -7.2 || from.y > 5;
  const destinationOutside = key === 'dish' || key === 'done';
  const inside: FacilityShot = {
    p: [1.4, 2.7, -5.4],
    l: [1.6, 3.4, -10],
    duration: 0.75,
  };
  const doorway: FacilityShot = {
    p: [1.4, 3.4, -8.8],
    l: [1.6, 5, -14],
    duration: 0.7,
  };
  const clearance: FacilityShot = {
    p: [7.2, 4.2, -10.6],
    l: [1.6, 6.7, -14],
    duration: 0.8,
  };
  const route: FacilityShot[] = [];
  if (!outside && destinationOutside) route.push(inside, doorway, clearance);
  if (outside && !destinationOutside) route.push(clearance, doorway, inside);
  const [point, entry] = FACILITY_SHOTS[key];
  route.push({
    p: [...point],
    l: [...entry],
    duration: key === 'done' ? 2.3 : key === 'trace' ? 1.5 : 1.65,
  });
  return route;
}
