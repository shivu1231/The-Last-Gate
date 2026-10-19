import type { ComponentType } from 'react';
import type { ArmouredBaymax } from '../characters/SolidArmour';
import type { Camera, Group, Scene, WebGLRenderer } from 'three';
import type { ChestBay } from '../characters/ChestBay';
import type { District } from './district';

/** INSPECT BAYMAX hands on the live harbour and character, preserving the camera and Canvas. */
export type JourneyWorld = {
  baymax: Group;
  bay: ChestBay;
  district: District;
  armoured?: ArmouredBaymax;
};

/**
 * The engineering scene takes ownership of the existing harbour camera; its Overlay is DOM.
 * Without a registered journey, the approach ends on Baymax.
 */
export type JourneyExtension = {
  Scene: ComponentType<{ world: JourneyWorld }>;
  Overlay: ComponentType;
  prepare?: (
    world: JourneyWorld,
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
  ) => Promise<void>;
  disposePrepared?: (world: JourneyWorld) => void;
};

let extension: JourneyExtension | null = null;
/**
 * Register engineering extensions against the continuous recovery world.
 */
export function registerJourney(next: JourneyExtension) {
  extension = next;
}
/**
 * Read the registered recovery/engineering scene extension.
 */
export function journeyExtension() {
  return extension;
}
