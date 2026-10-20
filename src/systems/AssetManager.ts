import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TextureLoader, SRGBColorSpace, type Group, type Texture } from 'three';
import { MODEL_URL } from '../config/experience';
import type { ExperienceState } from '../core/ExperienceStates';
import { audioEngine } from '../audio/AudioMix';

// Load once, share everywhere, never crash on decorative assets.
//  - required assets reject (the caller shows the in-world failure state)
//  - optional assets resolve to null and the chapter continues without them
//  - per-state manifests let the flow warm the NEXT chapter during the current one
//    (ExperienceStates.STATE_PROFILES[state].preload), so there is no big startup download.

/**
 * Asset category understood by the shared asset loader.
 */
type AssetKind = 'gltf' | 'texture' | 'audio';
/**
 * Load/cache metadata for an asset.
 */
export type AssetEntry = { url: string; kind: AssetKind; optional?: boolean };

const MANIFEST: Partial<Record<ExperienceState, AssetEntry[]>> = {
  AWAKE: [{ url: MODEL_URL, kind: 'gltf' }],
};

class AssetManager {
  private baymax: Promise<Group> | null = null;
  private baymaxTemplate: Group | null = null;
  private cache = new Map<string, Promise<unknown>>();
  private gltf = new GLTFLoader();
  private textures = new TextureLoader();
  readonly failed = new Set<string>();

  loadBaymax(): Promise<Group> {
    this.baymax ??= this.gltf
      .loadAsync(MODEL_URL)
      .then((gltf) => {
        gltf.scene.traverse((object) => {
          if ('isMesh' in object) {
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });
        this.baymaxTemplate = gltf.scene.clone(true);
        return gltf.scene;
      })
      .catch((error) => {
        this.baymax = null;
        throw error;
      });
    return this.baymax;
  }

  /** A fresh pose of the same cached asset, independent of cinematic articulation. */
  async cloneBaymax(): Promise<Group> {
    await this.loadBaymax();
    return this.baymaxTemplate!.clone(true);
  }

  /** Phase branches declare what their chapter needs (one call at module load). */
  declare(state: ExperienceState, entries: AssetEntry[]) {
    const list = MANIFEST[state] ?? (MANIFEST[state] = []);
    for (const entry of entries)
      if (!list.some((event) => event.url === entry.url)) list.push(entry);
  }

  load<T = unknown>(entry: AssetEntry): Promise<T | null> {
    // Baymax has its own shadow setup; reuse that promise so the GLB is fetched once.
    if (entry.url === MODEL_URL && entry.kind === 'gltf')
      return this.loadBaymax().then(
        (group) => group as T,
        (error) => {
          if (entry.optional) return null;
          throw error;
        },
      );
    let pending = this.cache.get(entry.url) as Promise<T | null> | undefined;
    if (pending) return pending;
    const source: Promise<unknown> =
      entry.kind === 'gltf'
        ? this.gltf.loadAsync(entry.url).then((group) => group.scene)
        : entry.kind === 'texture'
          ? this.textures.loadAsync(entry.url).then((texture: Texture) => {
              texture.colorSpace = SRGBColorSpace;
              return texture;
            })
          : audioEngine.load(entry.url);
    pending = source
      .then((value) => value as T)
      .catch((error) => {
        this.cache.delete(entry.url);
        this.failed.add(entry.url);
        if (!entry.optional) throw error;
        if (import.meta.env.DEV)
          console.warn(`[lattice] optional asset skipped: ${entry.url}`);
        return null;
      });
    this.cache.set(entry.url, pending);
    return pending;
  }
  get<T = unknown>(url: string, kind: AssetKind = 'gltf', optional = true) {
    return this.load<T>({ url, kind, optional });
  }

  /** Warm a chapter's manifest in the background. Never rejects. */
  preload(state: ExperienceState) {
    const entries = MANIFEST[state] ?? [];
    return Promise.all(
      entries.map((entry) =>
        this.load({ ...entry, optional: true }).catch(() => null),
      ),
    ).then(() => undefined);
  }
}
export const assets = new AssetManager();
