# Lighting rework — progress

Art-directed re-light of the existing scenes. No geometry, story, UI, camera or interaction changes.
Renderer stays ACES filmic with sRGB output; bloom threshold (1.65) already keeps white armour/UI from blooming.

## Done

| Location | Change | File |
| --- | --- | --- |
| Corrupted city (opening/fight) | Cool-neutral moon key and front fill, lower sky fill, trimmed near fill, 2048 shadow map | `src/environment/PortalDimension.js` |
| Recovery / fitting district | Lower fill, neutral key, softer practicals, unshadowed fracture rim behind Baymax | `src/recovery/district.ts` |
| Regulator fitting | Work light neutral-warm and lower so PR-6 holds focus | `src/phase5/bay.ts` |
| City walk | Lower sky fill; bay-door practicals are the brightest pocket and lead the route | `src/phase4/Walk.tsx` |
| Bay 6 | Overhead fixture shifted to neutral white only (layout protected) | `src/phase4/bayScene.ts` |
| Telemetry | Cool-neutral rig; service practical neutral and dims ~35% on the signal reveal | `src/phase5/facility.ts` |
| Pursuit street | Hemi 1.3 → 0.74, stronger cool key, new back-rim; per-frame chase targets updated | `src/phase6/World.tsx` |
| Old portal site | Darkest set: almost dead at `gate`, partial return from `powered` | `src/phase6/World.tsx` |
| Portal (both sides) | Interior/light cool white-cyan with restrained violet | `src/phase6/street.ts`, `src/phase6/home.ts` |
| Thrusters | Light ignites instantly, decays over ~0.2 s when output is cut | `src/phase6/baymax.ts` |
| Home / final | Orange-purple sunset → cool dusk sky, neutral water/fog, warm-neutral lamps | `src/phase6/home.ts` |
| Skyline (opening + home) | Salmon haze/sun tint → neutral dusk | `src/environment/SanFransokyoSkyline.ts` |

Verified: `npm run build`, `node scripts/later-refinement-check.mjs` (all pass), and visual checks of
fight, fitting, Bay 6, telemetry, pursuit, portal site, opening portal and home in the dev server.

| Exposure | `SceneQuality` takes a per-chapter exposure, eases in after the reveal and damps on set changes (walk/fitting/pursuit 1.0, telemetry 0.98, home 1.03) | `src/presentation/SceneQuality.tsx` + callers |
| Contact (pursuit/home) | Soft footprint under Baymax on the shadowless sets, fading with height | `src/phase6/World.tsx` |
| Recovery shadows | Depth bias -0.0005 → -0.0002 plus normalBias 0.02 for tighter contact | `src/recovery/district.ts` |
| Home lawn | Sky fill 0.78 → 0.66, city-side fill trimmed | `src/phase6/home.ts` |

Shadow audit: opening key 2048 with small bias + normalBias (sound); Bay 6 moon 2048 (unchanged);
recovery key tightened as above; pursuit/home have no shadow map by design (contact blob instead).

## Not verified / candidates

- Real FPS: the preview pane ran as a background page (rAF throttled), so the dev frame audit's FPS
  figures were meaningless. Draw calls stayed ~450–540 and the rework added one draw call and no
  shadow passes. Measure on the RTX 3050 at DPR 1 / 1.5 / 2 in a focused browser window.
- Contact blob verified on the home lawn; the street chase/landing uses the same code with the
  street floor function but was not watched live.
- Recovery engineering view could not be framed in the narrow preview pane; check at 1920×1080.
