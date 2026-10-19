import type { Object3D } from 'three';

// Mutable per-frame diagnostics. Written by RuntimeBridge, read (polled) by the dev HUD.
// Never React state: nothing re-renders at frame rate.
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

/** Dev/presentation-only handle for the scene audit. Stays null in normal production. */
export const debugHandles: { scene: Object3D | null; transitions: { still(type: string, cover: number, beat?: string): void; cancel(): void } | null } = { scene: null, transitions: null };
