import type { Object3D } from 'three';

/**
 * Mutable renderer diagnostics polled by the developer HUD.
 * Keeping these outside React state avoids a component render on every frame.
 */
export const runtimeStats = {
  fps: 60,
  frameMs: 16.7,
  drawCalls: 0,
  triangles: 0,
  textures: 0,
  geometries: 0,
  programs: 0,
  frameTasks: 0,
};

/**
 * Optional inspection handles populated only in development or presentation mode.
 */
export const debugHandles: {
  scene: Object3D | null;
  transitions: {
    still(type: string, cover: number, beat?: string): void;
    cancel(): void;
  } | null;
} = { scene: null, transitions: null };
