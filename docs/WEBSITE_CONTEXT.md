# The Last Gate — Developer Info

## What the website is

A first-person, cinematic Big Hero 6 fan experience. Hiro returns for Baymax after a portal crossing, restores his damaged systems, limits a hostile combat program, follows the missing healthcare chip's signal, and brings Baymax home. The implementation is React/TypeScript and JavaScript over Three.js/React Three Fiber. Zustand stores drive discrete interaction stages; authored per-frame motion and GSAP handle the choreography. Sound is synthesized through Web Audio.

## Complete playable flow

1. **Opening and return.** Hiro wakes in the portal dimension and reaches San Fransokyo. Baymax has not followed. Hiro turns back, sees the unstable portal, and deliberately returns. The opening portal, wind, particles, light and camera direction support this decision.
2. **Combat chip and fight.** Hiro approaches the silent white Baymax, picks up the red combat chip, opens the shared chest bay and seats it. The same closed body changes to its red/purple combat finish. The combat program wakes. A near pass, a charged three-shot ranged miss and a heavy landing carry the fight through the existing street. The fracture pulls both characters away.
3. **Recovery and engineering.** Baymax rests semi-reclined against broken service debris. Approaching and inspecting him retains the live model's world transform. The engineering board exposes power, joint, thruster and sensor hardware. Repairs and chip information establish that Hiro needs a way to hold the combat program back.
4. **City walk and Bay 6.** Hiro follows the route through the damaged city and enters the service bay. Inspecting equipment, restoring the relevant feed, opening the storage case and retrieving the regulator happen through existing interactive panels and world objects. Bay 6 has its own scrolling/responsive layout.
5. **Fitting and telemetry.** The same regulator lifts from its staging position, aligns with Baymax's chest mount, seats mechanically and connects its feed. No Hiro model is added to this fitting shot. The output test reaches 35%, but the combat program remains active. At the relay, Hiro restores power, reconnects the signal path, removes interference, aligns the receiver and saves the last transmission. The healthcare chip crossed the portal boundary.
6. **Pursuit, portal and home.** Baymax enters at readable distance. The regulator remote provides the temporary limit while Hiro collects the trace, runs from Baymax and restores the portal power rings. At the old portal, disabling the limit restores Baymax's output; re-enabling it in flight causes a weighted loss of thrust and road impact. Hiro removes the actual combat chip and inserts that same object into the reader. He drags Baymax through the gate. The San Fransokyo side includes the waterfront, water, railing and city context. Retrieving and seating the green healthcare chip restores Baymax's gentler white state. The end card summarizes the journey and offers replay. Individual technical names have been removed from this ending at the user's request; the school/team credit remains.

The standalone Phase 2 fracture/afterimage implementation is retained for development and legacy entries. The normal opening currently hands off to the recovery journey; the legacy afterimage is not an extra mandatory chapter in that route.

## Source responsibilities

| Folder/file        | Responsibility                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `src/main.tsx`     | App boundary, lazy chapter hosts, opening-to-recovery handoff and development entry handling.                |
| `src/core`         | Shared experience profiles, lifecycle ownership, interaction locks, runtime bridge and developer statistics. |
| `src/config`       | Experience settings, opening durations and authored lines.                                                   |
| `src/state`        | Opening chapter/phase state and interaction graph.                                                           |
| `src/systems`      | Asset loading, opening camera/actor sequence services, geometry helpers and zoom.                            |
| `src/performance`  | Shared resources/disposal, scheduling, quality profiles, frame governor and adaptive render scale.           |
| `src/audio`        | Audio mixes, generated effects, ambient beds and the sound toggle.                                           |
| `src/transitions`  | Covered cinematic transitions and the opening blink.                                                         |
| `src/characters`   | Canonical Baymax, shared chest access, chips, Hiro, regulator, remote, hands and mounts.                     |
| `src/environment`  | Opening dimension, harbour, skyline, portals and shared city dressing.                                       |
| `src/effects`      | Post-processing, scene distortion and cinematic signal state.                                                |
| `src/experience`   | Opening scene composition, input, state progression and camera/actor integration.                            |
| `src/recovery`     | Semi-reclined Baymax, the arrival district and continuous approach/inspection scene.                         |
| `src/engineering`  | Internal hardware, repairs, board controls and engineering exit registration.                                |
| `src/phase2`       | Legacy fracture/afterimage stages and shared scene construction utilities.                                   |
| `src/phase4`       | City walk, Bay 6 scene, inspection panels, textures and regulator construction.                              |
| `src/phase5`       | Regulator fitting/test and the five telemetry relay tasks.                                                   |
| `src/phase6`       | Baymax return, pursuit, power rings, airborne cutoff, chips, hauling, home and ending.                       |
| `src/presentation` | Loading portrait, scene readiness, chapter covers, camera shots, surfaces and presentation styles.           |
| `src/ui`           | Shared task rails, failure UI, theme and global layout.                                                      |
| `src/debug`        | Development-only tools and scene auditing.                                                                   |
| `scripts`          | Source-model export, complete GLB collection export and deterministic refinement checks.                     |
| `public/models`    | The source shell and retained legacy asset/credit files.                                                     |
| `dist`             | Generated production website; rebuild rather than manually editing bundled code.                             |

## Model and interaction invariants

- Current combat and healthcare Baymax use the same closed source shell and live hierarchy. Combat colouring/material response changes on that geometry; a second red body must not be layered over it.
- The shared chip bay is used throughout. Inspecting or opening it changes the actual actor, not a separate viewer model.
- The regulator is the Bay 6 procedural unit. Its mount, supports and connector follow the live chest transform.
- The remote is a separate handheld controller; it is not a replacement regulator.
- The combat card moves from dock to hand to reader. The telemetry capture is a separate relay record.
- Recovery, standing, flight, landing and dragging have authored ground/contact handling. Do not replace these with an unconstrained world transform or an untested physics simulation.
- Camera rails and projection checks protect the silhouette, feet and camera/building clearance. Keep viewport-dependent presentation intact.
- Materials can use shader patches and generated canvas textures. Preserve shader uniform/varying names, object lookup names, CSS selectors, data attributes, event names and storage keys unless every consumer is deliberately migrated.

## Runtime and ownership

The opening has its own chapter/phase store. Later hosts use separate chapter stores and small entry/exit registries. `RuntimeBridge` mirrors opening state into the shared experience flow for camera modes, audio and preparation. These systems are related but are not interchangeable state machines.

`SceneScope` owns timers, listeners, animation handles and temporary resources; cleanup happens in reverse registration order. Assets and shared GPU resources use explicit ownership to avoid disposal by another scene. Preserve these lifetimes during cleanup/refactoring.

Scene loading is covered until the renderer signals readiness. The common ASCII Baymax is the loading presentation. Chapter changes wait for `lastgate:scene-ready`, then reveal through the existing fade. A timer must not expose an unfinished renderer.

Adaptive DPR trades resolution for responsiveness using existing frame-rate thresholds and recovery headroom. Its timing and thresholds are gameplay/presentation behavior, not formatting opportunities.

## Controls and development entries

Opening instructions explain walking/sprinting with W, Space, mouse hold or scroll. E can guide the chip interactions. Later engineering, telemetry, remote, dragging and reader interactions expose their own controls. The sound toggle persists through the experience.

Development-only entries include:

- `?phase1=fight`
- `?recovery=journey`
- `?phase4=walk`, `bay`, `box`, `found`
- `?phase5=limiter`, `facility`
- `?phase6=wake`, `escape`, `gate`, `drop`, `portal`, `home`

Production starts the normal experience and does not enable these development jumps.

## Build and verification

```sh
npm ci
npm run dev
npm run check
npm run build
npm run preview
node scripts/later-refinement-check.mjs
node scripts/later-refinement-check.mjs scripts/opening-refinement-check.ts
npm run models
```

The default development/preview port is 4173. An occupied port requires an explicit alternative when starting Vite. `node server.mjs` serves the compiled `dist/` website without installing dependencies.

The model export writes portable GLBs, embedded textures, a manifest and validator results. These are static scene/rig snapshots. Shader effects, portal render targets, particles, camera direction and gameplay animation remain in source code; they are not advertised as embedded GLB animation clips.

The refinement checks cover geometry/contact, recovery framing, regulator mounts, camera routes, effect expiry, DPR logic and opening framing/cadence at multiple aspects and simulated frame rates. A successful build or CPU check alone does not prove GPU performance parity on every device.
