# Codex fix sheet — progress (handoff)

Source: `THE_LAST_GATE_DEEP_CODEX_FIXES.docx` (9 issues). Each fixed issue is its own commit.

## Done

| # | Issue | What changed | Commit |
| --- | --- | --- | --- |
| 09 | Telemetry cartridge vs combat-chip key | Phase 5 "SAVE IT TO RX/06" → "DECODE THE LAST FIX" (information only). Phase 6 "Take the capture" step, recorder cartridge visual, hint, gaze and `took` gate removed; the run opens straight after the 35% beat. Store has `portalTraceKnown` and `hasPortalTransitLog`. Reader panel: SOURCE: BAYMAX COMBAT CHIP / TRANSIT LOG: FOUND / BOUNDARY SIGNATURE: MATCHED / RETURN VECTOR: RECONSTRUCTED. `createCartridge` is kept only as the invisible camera-side drag anchor (never shown). | `dd586dd` |
| 02 | Assessment UI too quick | Last repair result holds 2.6 s before the assessment; the assessment's continue action unlocks after 1 s entry + 3.5 s read and fires once (`engineering/BoardOverlay.tsx`). | `29d5201` |
| 01 | End credits "VR" | VR = upcoming virtual reality edition. "Extras coming soon." → orange mono **VR** mark with a short rule + soft-white line; end-card `::selection` uses the project orange. | `091279f` |
| 04 | Combat chip clips into chest | Root cause: Phase 1 chip was world-space 1:1 while the dock is scaled with the 0.79 shell, so the card overran its keyed frame. Chip now uses `LATER_BAYMAX_SCALE` (same as the Phase 6 card) and the shared dock-space seat `CHIP_SEAT_Z` (`characters/RedChip.js`). | `d74375d` |
| 07 | Fight wall clip + facing | Ignition: Baymax fully squares up to Hiro (damped yaw) and holds it while rising; lift rises first and drifts back later so legs/thrusters clear the low street wall. Same end pose as the chase start. Opening refinement check passes. | `5c8837b` |
| 03 | Phase 1 / landing colour system (partial) | Landing title (`presentation/opening-title.css`) uses `--lg-dusk` orange for eyebrow/rule/control chips, soft-white paper text and the shared font tokens. | `4c5212d` |
| 03 | Phase 1 HUD (partial) | Suit readout values and subtitle speaker labels use the project orange; labels soft-white; Baymax's speaker label stays restrained red (`src/ui/experience.css`). | `4d94d98` |
| 03 | Phase 1 HUD (rest) | Every remaining sage/cyan literal in `src/ui/experience.css` now reads `--hud-*` tokens (soft-white ink/text/dim/faint, `--hud-accent` = project orange, `--hud-red` restrained). Orange on keys, `//` dividers, filled hold arc, fault values, LAST GATE mark, focus outline; threat/fault lines stay red with a softer glow; Baymax's speaker label unchanged. Hover/focus-visible turn the marker dot orange, pressed buttons dim, the failure button underline goes orange on hover. WebGL colours untouched. | `a999678` |
| 06 | Typography | Two voices: Space Grotesk (display + UI copy, `--lg-body` = `--lg-display`) and IBM Plex Mono (`--lg-mono`). DM Sans, Manrope and the Segoe UI override in `later-refinement.css` are gone; all stylesheets use the tokens. Fonts load once from `index.html` (preconnect + stylesheet) instead of CSS `@import`s; `main.tsx` mounts after the four faces load (1.5 s cap), so no fallback-face paint/reflow. `main.tsx` imports `ui/theme.css` first so the tokens exist everywhere. | `7c7e86c` |
| 05 | Final home background | `src/phase6/homeDressing.ts` (called from `createHome`): kerbs, sidewalks, street with tram rails and trolley wires, lamps, tram stop, hydrants, planters, bollards; a row of painted houses (bay windows, cornices, shops, a few tiled eaves) across the street; a waterfront block with a tiered hip roof to the west; park and street trees; promenade/sea wall continuing past the lawn; stepped hills inland. Lawn and paving textured; cherry tree trunk forks. Story area (Baymax, Hiro, bin, gate, benches) and the end shot over the rail untouched. 18 instanced draws + 8 wire lines (~5% of ~514 calls), no new lights. | `dc42fa0` |
| 08 | Phase 0 city | `src/environment/HarbourCity.ts`: towers get piers proud of the face, sills (authored blocks), a setback tier above 38 m and one of three roofs (lit penthouse / two-tier hipped tile cap / water tank + plant + mast). Waterfront row: tiled eaves, roof units, low quay pilings, a ferry-building clock tower, a sagging power line. Water gets faint warm reflection columns under the far shore. All new pieces are past the bridge (z ≥ 85), so the portal and turn-back view are unobstructed; merged per material (~5 more draws). | `0025ad3` |

All commits: `npx tsc --noEmit` clean; `npm run build` succeeds; `scripts/later-refinement-check.mjs` (later + opening) pass.

## Follow-ups after the fix sheet

| Change | What | Commit |
| --- | --- | --- |
| Flight-log lore | Canon: the combat chip logs every flight; it logged Baymax's inbound crossing before the game. Planted in the Phase 1 diagnostic (`FLIGHT LOG · RECORDING`, `src/config/shell.ts`), the board's chip bay (`FLIGHT / NAV LOG: CONTINUOUS · 1 BOUNDARY CROSSING`), and paid off at the reader ("Every flight logged… even the crossing.", `src/phase6/PhaseSix.tsx`). | `4783fb2` |
| Surface textures | `src/presentation/WorldSurfaces.ts`: canvas siding/stucco/stone/slabs/tile/bark/leaves/wood and `worldMapped()` (world-space planar sampling, instancing-aware). Used on the home set and the opening city. Home set also gets ridge roofs and an apartment row behind the houses. | `d0a9f88` |
| Dialogue audit | Fixed "The combat chip is still in you." (it lies on the street) and "Where… am I?" after a deliberate return. Canon written at the top of `docs/HIRO_DIALOGUE.md`. | `f08869a` |

## Verification (this pass)

Checked at 1920×1080 in a second dev server on the side branch (port 4174):
- 05: `?phase6=home` home shot, boot shot (`window.__lastGateP6.go('boot')`) and the end shot over the rail. The boot shot now has the street and houses behind Baymax and Hiro; the end shot is unchanged.
- 08: portal-sighted view, SF arrival and the turn-back (drive it from the console: `const {useSceneState:s}=await import('/src/state/SceneStateManager.ts'); s.setState({phase:'to-portal'})`, then call `s.getState().move(0.3)` on a loop).
- 06: all four faces report loaded before mount (`document.fonts`).

Not visually verified: the Phase 1 HUD states (03) across a full opening play-through, and the earlier items below.

## Not visually verified (from the previous pass)

- 04: chip close-up in the opening (`?phase1=fight` is past it; play from `/` to the chip insert) and the Phase 6 pull/reader.
- 07: watch the ignition beat (`?phase1=fight`) for the wall and facing; the chase beats (`overhead`, `rooftop`, `final`) were not changed and may still need facing work.
- 09: play Phase 5 trace → Phase 6 `limited` → run → gate → carry → reader → bloom end to end.
- 02: complete the board in `?recovery=journey`.

## Remaining

- Final regression run Phase 0 → 8 at 1920×1080, including the Phase 1 HUD states (hover/focus/pressed on the marker, skip, replay) and a long-copy check where Space Grotesk replaced DM Sans (it sets slightly wider).
