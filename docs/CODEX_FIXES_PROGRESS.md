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

All commits: `npx tsc --noEmit` clean; `npm run build` succeeds; `scripts/later-refinement-check.mjs` (later + opening) pass.

## Not visually verified (the preview pane was hidden, so frames did not render)

- 04: chip close-up in the opening (`?phase1=fight` is past it; play from `/` to the chip insert) and the Phase 6 pull/reader.
- 07: watch the ignition beat (`?phase1=fight`) for the wall and facing; the chase beats (`overhead`, `rooftop`, `final`) were not changed and may still need facing work.
- 09: play Phase 5 trace → Phase 6 `limited` → run → gate → carry → reader → bloom end to end.
- 02: complete the board in `?recovery=journey`.

## Remaining

- **03 (rest):** Phase 1 in-world HUD (top-left LOCATION / EXIT SIGNAL readout, subtitles, hold markers) still uses cool grey/cyan; move it to the same tokens (`src/ui/experience.css`, `src/experience/*`). Check hover/active/disabled/focus-visible.
- **06 Typography:** `src/presentation/later-refinement.css:52` forces `--lg-display/--lg-body` to Segoe UI inside `.walk/.bay/.p5/.p6`, which undoes the Space Grotesk/Manrope/IBM Plex Mono system in `src/ui/theme.css`. Decide one display + one mono pair, remove the override, and check for layout shift. Fonts load from Google Fonts (`theme.css`, `experience.css` also loads DM Sans).
- **05 Final background:** home set (`src/phase6/home.ts`, skyline `src/environment/SanFransokyoSkyline.ts`): flat lawn, sparse props. Add curb/paving transitions, planters, street furniture and better trees, instanced and without moving interaction anchors (`HOME_BAYMAX`, `CARE_CHIP_AT`, bin, gate).
- **08 Phase 0 city:** `src/environment/HarbourCity.ts` + skyline; replace boxy silhouettes with modular facade depth, keep the portal view unobstructed.
- Final regression run Phase 0 → 8 at 1920×1080.
