import { create } from 'zustand';

// Desktop-only quality presets. HIGH is the presentation look; BALANCED and LOW keep the
// same identity on weaker GPUs (integrated graphics) by trimming resolution and the
// passes that re-render the whole scene (ambient occlusion, depth of field).

export type QualityName = 'HIGH' | 'BALANCED' | 'LOW';
export const QUALITY_ORDER: QualityName[] = ['HIGH', 'BALANCED', 'LOW'];
export type QualityPreset = {
  /** Upper bound for renderer pixel ratio. Never blindly devicePixelRatio = 2. */
  dprCap: number;
  /** Lowest render scale allowed. Only LOW drops under 1: a soft image beats a stuttering one. */
  dprMin: number;
  /** Multiplier for particle / microbot / debris counts. */
  density: number;
  shadowMapSize: number;
  /** AO render-target scale and sample count (0 samples switches the AO pass off). */
  aoScale: number;
  aoSamples: number;
  bloom: number;
  dof: boolean;
  /** Fraction of fog / mist layers to keep. */
  fogLayers: number;
  /** Max anisotropy for hero textures. */
  anisotropy: number;
};

export const QUALITY_PRESETS: Record<QualityName, QualityPreset> = {
  HIGH: {
    dprCap: 1.5,
    dprMin: 1,
    density: 1,
    shadowMapSize: 2048,
    aoScale: 0.6,
    aoSamples: 12,
    bloom: 1,
    dof: true,
    fogLayers: 1,
    anisotropy: 8,
  },
  BALANCED: {
    dprCap: 1.1,
    dprMin: 1,
    density: 0.6,
    shadowMapSize: 1024,
    aoScale: 0.4,
    aoSamples: 6,
    bloom: 0.7,
    dof: true,
    fogLayers: 0.65,
    anisotropy: 4,
  },
  LOW: {
    dprCap: 0.85,
    dprMin: 0.7,
    density: 0.45,
    shadowMapSize: 1024,
    aoScale: 0.4,
    aoSamples: 0,
    bloom: 0.6,
    dof: false,
    fogLayers: 0.5,
    anisotropy: 2,
  },
};

/** Keeps the full-screen pixel count near 1080p-at-1.5x regardless of monitor. */
export function pixelRatioFor(
  preset: QualityPreset,
  width = innerWidth,
  height = innerHeight,
  device = window.devicePixelRatio || 1,
) {
  const budget = 1920 * 1080 * preset.dprCap * preset.dprCap;
  const byBudget = Math.sqrt(budget / Math.max(1, width * height));
  // HIGH/BALANCED never go below 1 (under-sampling softens more than it saves); LOW may.
  return Math.max(
    preset.dprMin,
    Math.min(Math.max(device, preset.dprMin), preset.dprCap, byBudget),
  );
}

/** Integrated and software GPUs start a tier down instead of stuttering until the governor reacts. */
function gpuTier(): QualityName {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(
      info ? gl!.getParameter(info.UNMASKED_RENDERER_WEBGL) : '',
    );
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    if (/swiftshader|llvmpipe|software|microsoft basic/i.test(renderer))
      return 'LOW';
    if (/intel|uhd|iris|mali|adreno|powervr/i.test(renderer)) return 'BALANCED';
  } catch {
    /* unknown GPU: assume capable */
  }
  return 'HIGH';
}

/**
 * Resolve the initial quality tier from the URL and device policy.
 */
function initialQuality(): QualityName {
  const forced = (
    new URLSearchParams(location.search).get('quality') ??
    import.meta.env.VITE_QUALITY ??
    ''
  ).toUpperCase();
  if ((QUALITY_ORDER as string[]).includes(forced))
    return forced as QualityName;
  try {
    const saved = sessionStorage.getItem('lattice.quality');
    if ((QUALITY_ORDER as string[]).includes(saved ?? ''))
      return saved as QualityName;
  } catch {
    /* storage blocked */
  }
  return gpuTier();
}

type QualityState = {
  name: QualityName;
  preset: QualityPreset;
  dpr: number;
  auto: boolean;
  set: (name: QualityName, auto?: boolean) => void;
};
export const useQuality = create<QualityState>((set, get) => {
  const name = initialQuality();
  return {
    name,
    preset: QUALITY_PRESETS[name],
    dpr: pixelRatioFor(QUALITY_PRESETS[name]),
    auto: false,
    set: (next, auto = false) => {
      if (next === get().name) return;
      // Only a deliberate choice persists; an automatic fallback is re-evaluated on reload.
      if (!auto)
        try {
          sessionStorage.setItem('lattice.quality', next);
        } catch {
          /* storage blocked */
        }
      set({
        name: next,
        preset: QUALITY_PRESETS[next],
        dpr: pixelRatioFor(QUALITY_PRESETS[next]),
        auto,
      });
    },
  };
});
export const quality = () => useQuality.getState().preset;

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    const state = useQuality.getState(),
      dpr = pixelRatioFor(state.preset);
    if (Math.abs(dpr - state.dpr) > 0.01) useQuality.setState({ dpr });
  });
}
