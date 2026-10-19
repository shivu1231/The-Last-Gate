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

## Not yet done / candidates

- Smooth exposure/fog transitions between chapters (each Canvas sets its own exposure today).
- Per-chapter exposure via `SceneQuality` (all later chapters share 1.02).
- Shadow bias/frustum audit per chapter; FPS measurement at DPR 1 / 1.5 / 2 on the RTX 3050.
- Home lawn still reads slightly bright under the city-side fill.
- Recovery engineering view could not be framed in the narrow preview pane; check at 1920×1080.
