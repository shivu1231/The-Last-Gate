import { useEffect, useRef } from 'react';
import { audioEngine, type Bus } from './AudioMix';
import { useSceneState } from '../state/SceneStateManager';

/**
 * Named, synthesized sound effects on top of the AudioMix buses. No audio files: every sound is
 * built from oscillators and a few small generated noise buffers.
 *
 *   sfx.play('mech.latch', { at: [x, y, z] })   one-shot, optionally positional (see sfx.listener)
 *   sfx.bed('bay')                              keyed ambience loop; a second call returns the same bed
 *   useSfxBed('harbour', active)                React: bed for as long as the component wants it
 *   useUiSfx(active)                            React: subtle hover/click on every button in the page
 *
 * Nothing makes sound (or creates the AudioContext) before the first click or key press. Mute is
 * global and remembered, and it follows the opening's SOUND toggle: switching that (useSceneState.sound)
 * mutes or unmutes sfx too. Its default OFF state is not a mute; sfx never writes the opening's store.
 * The full list of names, and where each one plays, is in SFX_NAMES / BED_NAMES below.
 */

export type Vec3 = readonly [number, number, number] | { x: number; y: number; z: number };
export type PlayOptions = {
  /** Linear gain multiplier on the sound's own level (default 1). */
  gain?: number;
  /** Stereo position, -1 left … 1 right. Ignored when `at` is given. */
  pan?: number;
  /** World position; pan and distance falloff come from the listener set with sfx.listener(). */
  at?: Vec3;
  /** Distance (m) at which the sound is at full level when positional (default 2.5). */
  near?: number;
  /** Pitch multiplier (default 1, with a little random variation per sound). */
  pitch?: number;
  /** Start this many seconds from now. */
  delay?: number;
};
export type BedHandle = { readonly name: string; stop(fade?: number): void; setGain(value: number, fade?: number): void; place(at: Vec3, near?: number): void };

// ------------------------------------------------------------------ voice primitives

type Voice = {
  ctx: AudioContext; t: number; pitch: number;
  /** Oscillator with an exponential pitch glide and a short attack, exponential decay. */
  tone(o: { type?: OscillatorType; f: number; to?: number; dur: number; gain: number; attack?: number; at?: number; detune?: number; out?: AudioNode }): void;
  /** Filtered noise burst. */
  noise(o: { filter?: BiquadFilterType; f: number; to?: number; q?: number; dur: number; gain: number; attack?: number; at?: number; brown?: boolean; out?: AudioNode }): void;
  /** A tiny metallic tick. */
  click(o?: { f?: number; gain?: number; at?: number; out?: AudioNode }): void;
  out: AudioNode;
};
type Recipe = (v: Voice) => void;
type Def = { bus: Bus; gain?: number; minGap?: number; vary?: number; recipe: Recipe };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Every one-shot, by name. Names are namespaced so other chapters can reuse them. */
const DEFS = {
  // ── UI (UI bus): soft, short, never louder than the world.
  'ui.hover': { bus: 'UI', gain: .5, minGap: .045, recipe: v => { v.tone({ type: 'sine', f: 2300, to: 2500, dur: .05, gain: .012, attack: .004 }); } },
  'ui.click': { bus: 'UI', minGap: .03, recipe: v => { v.click({ f: 3400, gain: .05 }); v.tone({ type: 'triangle', f: 1250, to: 900, dur: .06, gain: .018, attack: .002 }); } },
  'ui.confirm': { bus: 'UI', recipe: v => { v.tone({ type: 'sine', f: 880, dur: .14, gain: .03, attack: .005 }); v.tone({ type: 'sine', f: 1318.5, dur: .22, gain: .028, attack: .005, at: .07 }); } },
  'ui.back': { bus: 'UI', recipe: v => { v.tone({ type: 'triangle', f: 900, to: 620, dur: .12, gain: .02, attack: .004 }); } },
  'ui.deny': { bus: 'UI', minGap: .12, recipe: v => { v.tone({ type: 'square', f: 196, dur: .09, gain: .012, attack: .003 }); v.tone({ type: 'square', f: 185, dur: .12, gain: .012, attack: .003, at: .1 }); } },
  'ui.toggle': { bus: 'UI', recipe: v => { v.click({ f: 2600, gain: .06 }); v.click({ f: 4200, gain: .03, at: .018 }); } },
  'ui.tick': { bus: 'UI', minGap: .03, recipe: v => { v.click({ f: 5200, gain: .025 }); } },
  'ui.open': { bus: 'UI', recipe: v => { v.noise({ filter: 'bandpass', f: 900, to: 3800, q: 1.2, dur: .22, gain: .018, attack: .06 }); } },

  // ── Movement.
  'step.concrete': { bus: 'CHARACTER', gain: .9, minGap: .12, vary: .12, recipe: v => {
    v.noise({ filter: 'lowpass', f: 900 * v.pitch, to: 160, q: .8, dur: .11, gain: .1, attack: .003, brown: true });
    v.noise({ filter: 'bandpass', f: 2600 * v.pitch, to: 1800, q: 1.4, dur: .06, gain: .022, attack: .002, at: .012 });
  } },
  'step.grit': { bus: 'CHARACTER', gain: .9, minGap: .12, vary: .15, recipe: v => {
    v.noise({ filter: 'lowpass', f: 800 * v.pitch, to: 150, q: .8, dur: .12, gain: .09, attack: .003, brown: true });
    for (let i = 0; i < 4; i++) v.noise({ filter: 'bandpass', f: rand(3000, 6000), q: 5, dur: .02, gain: .012, attack: .001, at: .02 + i * rand(.01, .025) });
  } },
  'step.metal': { bus: 'CHARACTER', minGap: .12, vary: .1, recipe: v => {
    v.noise({ filter: 'lowpass', f: 1100, to: 200, dur: .1, gain: .08, attack: .002, brown: true });
    v.tone({ type: 'triangle', f: 410 * v.pitch, to: 380, dur: .18, gain: .012, attack: .002 });
    v.tone({ type: 'sine', f: 1130 * v.pitch, dur: .12, gain: .005, attack: .002 });
  } },
  'move.whoosh': { bus: 'CHARACTER', minGap: .5, recipe: v => { v.noise({ filter: 'bandpass', f: 380, to: 900, q: .7, dur: .7, gain: .025, attack: .25, brown: true }); } },
  'move.duck': { bus: 'CHARACTER', minGap: 2, recipe: v => {
    v.noise({ filter: 'lowpass', f: 600, to: 200, dur: .5, gain: .05, attack: .12, brown: true });
    v.tone({ type: 'triangle', f: 92, to: 78, dur: 1.2, gain: .02, attack: .1, at: .1 });
    v.tone({ type: 'sine', f: 760, to: 740, dur: 1.4, gain: .004, attack: .2, at: .1 });
  } },

  // ── Electrical.
  'elec.crackle': { bus: 'MECHANICAL', minGap: .04, recipe: v => {
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) v.noise({ filter: 'highpass', f: rand(1800, 4200), q: .7, dur: rand(.006, .02), gain: rand(.03, .09), attack: .0008, at: i * rand(.008, .05) });
    v.tone({ type: 'sawtooth', f: 120, dur: .05, gain: .01, attack: .002 });
  } },
  'elec.zap': { bus: 'MECHANICAL', recipe: v => {
    v.noise({ filter: 'highpass', f: 2600, to: 900, dur: .16, gain: .09, attack: .001 });
    v.tone({ type: 'square', f: 1400, to: 120, dur: .2, gain: .02, attack: .001 });
    v.tone({ type: 'sawtooth', f: 100, to: 120, dur: .5, gain: .02, attack: .02, at: .12 });
    v.tone({ type: 'sine', f: 420, to: 640, dur: .6, gain: .01, attack: .2, at: .15 });
  } },
  'elec.arc': { bus: 'MECHANICAL', minGap: .25, recipe: v => {
    v.noise({ filter: 'bandpass', f: 3200, to: 1400, q: 1.5, dur: .3, gain: .07, attack: .002 });
    for (let i = 0; i < 6; i++) v.noise({ filter: 'highpass', f: 2500, dur: .012, gain: .06, attack: .001, at: rand(0, .25) });
    v.tone({ type: 'sawtooth', f: 100, dur: .3, gain: .015, attack: .004 });
  } },
  'power.whine-up': { bus: 'MECHANICAL', recipe: v => {
    v.tone({ type: 'sine', f: 220, to: 1760, dur: 1.4, gain: .018, attack: .6 });
    v.tone({ type: 'sawtooth', f: 110, to: 880, dur: 1.4, gain: .004, attack: .7 });
    v.tone({ type: 'sine', f: 1760, dur: .7, gain: .006, attack: .05, at: 1.25 });
  } },
  'power.down': { bus: 'MECHANICAL', recipe: v => { v.tone({ type: 'sine', f: 900, to: 90, dur: 1.2, gain: .016, attack: .01 }); v.tone({ type: 'sawtooth', f: 240, to: 40, dur: 1, gain: .004, attack: .01 }); } },
  'power.strain': { bus: 'MECHANICAL', recipe: v => {
    // Baymax driven against the limit: a hum that climbs, beats against itself and stops short.
    for (const [f, d] of [[55, 0], [55.7, 0], [110, 6]] as const) v.tone({ type: 'sawtooth', f, to: f * 1.9, dur: 4.6, gain: .012, attack: 2.4, detune: d, out: lowpass(v, 520) });
    v.tone({ type: 'sine', f: 330, to: 620, dur: 4.4, gain: .007, attack: 2.6 });
    v.noise({ filter: 'bandpass', f: 220, to: 900, q: 2.5, dur: 4.4, gain: .03, attack: 3, brown: true });
  } },

  // ── Mechanical.
  'mech.crate-scrape': { bus: 'MECHANICAL', minGap: .15, vary: .1, recipe: v => {
    v.noise({ filter: 'bandpass', f: 420 * v.pitch, to: 260, q: 2, dur: .7, gain: .07, attack: .06, brown: true });
    v.noise({ filter: 'bandpass', f: 1900 * v.pitch, to: 1300, q: 4, dur: .55, gain: .015, attack: .05 });
    for (let i = 0; i < 5; i++) v.noise({ filter: 'bandpass', f: rand(700, 1400), q: 6, dur: .03, gain: .025, attack: .002, at: rand(.05, .6) });
  } },
  'mech.crate-thud': { bus: 'IMPACT', minGap: .08, vary: .12, recipe: v => {
    v.tone({ type: 'sine', f: 120 * v.pitch, to: 48, dur: .3, gain: .12, attack: .003 });
    v.noise({ filter: 'lowpass', f: 1200, to: 180, dur: .2, gain: .1, attack: .002, brown: true });
    v.noise({ filter: 'bandpass', f: 600 * v.pitch, q: 3, dur: .12, gain: .03, attack: .002 });
  } },
  'mech.tarp': { bus: 'MECHANICAL', recipe: v => { v.noise({ filter: 'bandpass', f: 1400, to: 700, q: .8, dur: .8, gain: .05, attack: .08 }); v.noise({ filter: 'highpass', f: 3500, dur: .4, gain: .015, attack: .05, at: .2 }); } },
  'mech.latch': { bus: 'MECHANICAL', vary: .06, recipe: v => {
    v.click({ f: 2800 * v.pitch, gain: .1 }); v.click({ f: 4600 * v.pitch, gain: .06, at: .01 });
    v.tone({ type: 'triangle', f: 760 * v.pitch, to: 620, dur: .09, gain: .02, attack: .001 });
    v.click({ f: 2200, gain: .07, at: .09 }); v.tone({ type: 'sine', f: 140, to: 90, dur: .12, gain: .05, attack: .002, at: .09 });
  } },
  'mech.lid-creak': { bus: 'MECHANICAL', recipe: v => {
    // A hinge that hasn't moved in a while: a slow, wobbling saw through a resonant band.
    const band = bandpass(v, 900, 9);
    v.tone({ type: 'sawtooth', f: 38, to: 62, dur: 1.1, gain: .05, attack: .15, out: band });
    v.tone({ type: 'sawtooth', f: 61, to: 44, dur: .9, gain: .03, attack: .12, at: .45, out: band });
    v.noise({ filter: 'lowpass', f: 500, to: 180, dur: .5, gain: .05, attack: .01, at: 1.2, brown: true });
    v.tone({ type: 'sine', f: 110, to: 70, dur: .3, gain: .05, attack: .004, at: 1.25 });
  } },
  'mech.lift': { bus: 'MECHANICAL', recipe: v => {
    v.noise({ filter: 'bandpass', f: 900, to: 1600, q: .9, dur: .4, gain: .03, attack: .05 });
    v.tone({ type: 'triangle', f: 330, to: 300, dur: .5, gain: .01, attack: .01 });
    // The charge lead pulling out.
    v.click({ f: 1800, gain: .08, at: .35 }); v.noise({ filter: 'highpass', f: 2800, dur: .05, gain: .05, attack: .001, at: .36 });
  } },
  'mech.plug-turn': { bus: 'MECHANICAL', vary: .08, recipe: v => { v.click({ f: 3000 * v.pitch, gain: .05 }); v.noise({ filter: 'bandpass', f: 1800, q: 3, dur: .08, gain: .015, attack: .01 }); v.click({ f: 2400 * v.pitch, gain: .04, at: .07 }); } },
  'mech.plug-push': { bus: 'MECHANICAL', recipe: v => { v.noise({ filter: 'bandpass', f: 500, to: 900, q: 1.5, dur: .8, gain: .03, attack: .5, brown: true }); } },
  'mech.plug-seat': { bus: 'MECHANICAL', recipe: v => {
    v.tone({ type: 'sine', f: 90, to: 46, dur: .3, gain: .12, attack: .002 });
    v.click({ f: 2600, gain: .12 }); v.click({ f: 5200, gain: .06, at: .008 });
    v.tone({ type: 'sine', f: 1320, dur: .5, gain: .008, attack: .004, at: .05 });
  } },
  'mech.ratchet': { bus: 'MECHANICAL', minGap: .028, vary: .05, recipe: v => { v.click({ f: 3800 * v.pitch, gain: .045 }); v.tone({ type: 'triangle', f: 520 * v.pitch, to: 460, dur: .04, gain: .01, attack: .001 }); } },
  'mech.index-set': { bus: 'MECHANICAL', recipe: v => {
    v.click({ f: 2200, gain: .1 }); v.tone({ type: 'sine', f: 70, to: 42, dur: .35, gain: .1, attack: .003 });
    v.tone({ type: 'sawtooth', f: 160, to: 210, dur: .45, gain: .006, attack: .06, at: .1, out: lowpass(v, 900) });
  } },
  'mech.clunk': { bus: 'IMPACT', recipe: v => {
    v.tone({ type: 'sine', f: 75, to: 36, dur: .45, gain: .16, attack: .003 });
    v.noise({ filter: 'lowpass', f: 1400, to: 150, dur: .3, gain: .12, attack: .002, brown: true });
    v.click({ f: 1900, gain: .1, at: .01 }); v.tone({ type: 'triangle', f: 640, to: 600, dur: .4, gain: .012, attack: .002, at: .01 });
  } },
  'mech.cable-plug': { bus: 'MECHANICAL', recipe: v => {
    v.noise({ filter: 'bandpass', f: 1200, to: 2400, q: 2, dur: .12, gain: .03, attack: .04 });
    v.click({ f: 2900, gain: .11, at: .12 }); v.click({ f: 1700, gain: .07, at: .135 });
    v.tone({ type: 'sine', f: 1046.5, dur: .25, gain: .01, attack: .004, at: .2 });
  } },
  'chip.hiss': { bus: 'MECHANICAL', recipe: v => {
    // Chest bay: seal release, pneumatic hiss, the panel travelling, then its stop.
    v.click({ f: 2400, gain: .07 }); v.noise({ filter: 'highpass', f: 3800, to: 2200, dur: 1.1, gain: .06, attack: .02 });
    v.noise({ filter: 'bandpass', f: 5200, to: 1400, q: 1.4, dur: .9, gain: .03, attack: .04 });
    v.tone({ type: 'sawtooth', f: 140, to: 180, dur: 1.2, gain: .006, attack: .2, at: .2, out: lowpass(v, 700) });
    v.tone({ type: 'sine', f: 85, to: 60, dur: .3, gain: .06, attack: .003, at: 1.35 });
  } },
  'sensor.ping': { bus: 'MECHANICAL', recipe: v => {
    v.tone({ type: 'sine', f: 1568, dur: .5, gain: .025, attack: .003 });
    v.tone({ type: 'sine', f: 1568, dur: .4, gain: .008, attack: .003, at: .18 });
    v.tone({ type: 'sine', f: 3136, dur: .2, gain: .004, attack: .003 });
  } },
  'sensor.scan': { bus: 'MECHANICAL', recipe: v => {
    for (let i = 0; i < 6; i++) v.tone({ type: 'sine', f: 900 + i * 180, dur: .07, gain: .012, attack: .003, at: i * .22 });
    v.noise({ filter: 'bandpass', f: 1200, to: 4000, q: 4, dur: 1.4, gain: .012, attack: .3 });
  } },
  'servo.whir': { bus: 'CHARACTER', vary: .08, minGap: .2, recipe: v => {
    v.tone({ type: 'sawtooth', f: 180 * v.pitch, to: 240 * v.pitch, dur: .45, gain: .008, attack: .06, out: lowpass(v, 1400) });
    v.tone({ type: 'sine', f: 360 * v.pitch, to: 470 * v.pitch, dur: .4, gain: .006, attack: .05 });
  } },
  'servo.groan': { bus: 'CHARACTER', vary: .06, minGap: .6, recipe: v => {
    // Baymax's heavy joints taking load: low saws grinding through a moving band.
    const band = bandpass(v, 260, 3);
    v.tone({ type: 'sawtooth', f: 46 * v.pitch, to: 63 * v.pitch, dur: 1.4, gain: .08, attack: .25, out: band });
    v.tone({ type: 'sawtooth', f: 69 * v.pitch, to: 58 * v.pitch, dur: 1.2, gain: .05, attack: .3, at: .15, out: band });
    v.tone({ type: 'sine', f: 140 * v.pitch, to: 175 * v.pitch, dur: 1, gain: .01, attack: .2, at: .1 });
    v.noise({ filter: 'lowpass', f: 300, dur: 1.2, gain: .03, attack: .3, brown: true });
  } },
  'baymax.eyes': { bus: 'CHARACTER', recipe: v => {
    v.tone({ type: 'sine', f: 110, to: 220, dur: 1.2, gain: .02, attack: .4 });
    v.tone({ type: 'sawtooth', f: 55, to: 56, dur: 1.6, gain: .01, attack: .5, out: lowpass(v, 400) });
    v.tone({ type: 'sine', f: 2200, dur: .08, gain: .008, attack: .003, at: 1 }); v.tone({ type: 'sine', f: 2200, dur: .08, gain: .008, attack: .003, at: 1.12 });
  } },
  'baymax.target': { bus: 'CHARACTER', recipe: v => {
    // Combat program acquiring Hiro: a tightening tick over a low drop.
    for (let i = 0; i < 4; i++) v.tone({ type: 'sine', f: 2400, dur: .05, gain: .01, attack: .002, at: i * (.22 - i * .04) });
    v.tone({ type: 'sine', f: 52, to: 38, dur: 1.6, gain: .07, attack: .02, at: .5 });
  } },

  // ── Relay console (Phase 5).
  'relay.breaker': { bus: 'MECHANICAL', vary: .06, recipe: v => {
    v.click({ f: 2000 * v.pitch, gain: .12 }); v.noise({ filter: 'bandpass', f: 1300 * v.pitch, q: 2, dur: .05, gain: .06, attack: .001 });
    v.tone({ type: 'sine', f: 180 * v.pitch, to: 110, dur: .08, gain: .04, attack: .001 });
  } },
  'relay.main': { bus: 'MECHANICAL', recipe: v => {
    v.click({ f: 1600, gain: .14 }); v.tone({ type: 'sine', f: 64, to: 38, dur: .5, gain: .14, attack: .002 });
    v.noise({ filter: 'lowpass', f: 1800, to: 200, dur: .25, gain: .1, attack: .001, brown: true });
    v.tone({ type: 'sawtooth', f: 50, to: 100, dur: 1.4, gain: .02, attack: .4, at: .15, out: lowpass(v, 600) });
    v.tone({ type: 'sine', f: 440, to: 1320, dur: 1.2, gain: .008, attack: .5, at: .2 });
  } },
  'relay.trip': { bus: 'MECHANICAL', recipe: v => {
    v.click({ f: 1800, gain: .12 }); v.noise({ filter: 'highpass', f: 2400, dur: .08, gain: .08, attack: .001 });
    v.tone({ type: 'sawtooth', f: 120, to: 40, dur: .6, gain: .03, attack: .002, at: .03, out: lowpass(v, 800) });
    v.click({ f: 1400, gain: .1, at: .22 });
  } },
  'relay.patch': { bus: 'MECHANICAL', vary: .05, recipe: v => {
    v.noise({ filter: 'bandpass', f: 2200, to: 3200, q: 3, dur: .07, gain: .03, attack: .02 });
    v.click({ f: 3100 * v.pitch, gain: .1, at: .07 }); v.tone({ type: 'sine', f: 140, to: 90, dur: .1, gain: .05, attack: .002, at: .07 });
    v.noise({ filter: 'bandpass', f: 600, to: 3000, q: 1, dur: .25, gain: .01, attack: .1, at: .12 });
  } },
  'relay.pick': { bus: 'UI', recipe: v => { v.click({ f: 2600, gain: .06 }); v.tone({ type: 'sine', f: 740, dur: .08, gain: .012, attack: .003 }); } },
  'signal.sweep': { bus: 'MECHANICAL', minGap: .06, recipe: v => {
    const f = 300 + v.pitch * 900;
    v.tone({ type: 'sine', f, to: f * 1.12, dur: .09, gain: .008, attack: .01 });
    v.noise({ filter: 'bandpass', f: f * 2, q: 12, dur: .1, gain: .02, attack: .01 });
  } },
  'signal.lock': { bus: 'MECHANICAL', recipe: v => { v.tone({ type: 'sine', f: 660, dur: .5, gain: .02, attack: .005 }); v.tone({ type: 'sine', f: 990, dur: .6, gain: .016, attack: .005, at: .08 }); v.click({ f: 2600, gain: .06 }); } },
  'dish.motor': { bus: 'MECHANICAL', minGap: .07, vary: .04, recipe: v => {
    v.tone({ type: 'sawtooth', f: 95 * v.pitch, to: 105 * v.pitch, dur: .16, gain: .02, attack: .02, out: lowpass(v, 900) });
    v.tone({ type: 'square', f: 380 * v.pitch, dur: .14, gain: .003, attack: .02 });
    v.click({ f: 4200, gain: .015, at: .13 });
  } },
  'dish.lock': { bus: 'MECHANICAL', recipe: v => { v.tone({ type: 'sawtooth', f: 110, to: 60, dur: .4, gain: .03, attack: .01, out: lowpass(v, 700) }); v.click({ f: 2000, gain: .12, at: .35 }); v.tone({ type: 'sine', f: 70, to: 45, dur: .3, gain: .1, attack: .003, at: .35 }); v.tone({ type: 'sine', f: 1318.5, dur: .7, gain: .012, attack: .004, at: .45 }); } },
  'trace.blip': { bus: 'UI', recipe: v => { const f = 880 * v.pitch; v.tone({ type: 'sine', f, dur: .16, gain: .03, attack: .003 }); v.tone({ type: 'sine', f: f * 2, dur: .08, gain: .008, attack: .003, at: .02 }); } },
  'trace.extrapolate': { bus: 'UI', recipe: v => { v.tone({ type: 'sine', f: 440, to: 1760, dur: 2.2, gain: .016, attack: .3 }); v.noise({ filter: 'bandpass', f: 800, to: 5000, q: 6, dur: 2.2, gain: .012, attack: 1 }); } },
  'sting.boundary': { bus: 'PORTAL', recipe: v => {
    // The track crosses the portal boundary and doesn't come back: a hollow drop, a ring that bends flat.
    v.tone({ type: 'sine', f: 49, to: 31, dur: 4, gain: .14, attack: .02 });
    v.noise({ filter: 'bandpass', f: 2600, to: 240, q: 4, dur: 2.6, gain: .04, attack: .01 });
    for (const [f, d] of [[587.3, 0], [880, .12], [1174.7, .24]] as const) v.tone({ type: 'sine', f, to: f * .94, dur: 3.2, gain: .014, attack: .02, at: d });
    v.tone({ type: 'sine', f: 1975, to: 1580, dur: 3, gain: .004, attack: .4, at: .3 });
  } },
  'sting.found': { bus: 'UI', recipe: v => { [523.3, 659.3, 784].forEach((f, i) => v.tone({ type: 'sine', f, dur: 1.2, gain: .016, attack: .02, at: i * .12 })); v.tone({ type: 'sine', f: 1046.5, dur: 1.4, gain: .006, attack: .04, at: .36 }); } },
  'sting.empty': { bus: 'CHARACTER', recipe: v => { v.tone({ type: 'sine', f: 392, to: 370, dur: 2.2, gain: .016, attack: .05 }); v.tone({ type: 'sine', f: 466.2, to: 440, dur: 2.2, gain: .012, attack: .05, at: .25 }); v.tone({ type: 'sine', f: 58, dur: 2, gain: .04, attack: .2 }); } },
  'sting.complete': { bus: 'UI', recipe: v => { [392, 523.3, 659.3, 784].forEach((f, i) => v.tone({ type: 'triangle', f, dur: 1, gain: .012, attack: .01, at: i * .09 })); } },
  'world.debris': { bus: 'AMBIENCE', minGap: .3, vary: .2, recipe: v => {
    for (let i = 0; i < 5; i++) v.noise({ filter: 'bandpass', f: rand(600, 2400), q: 3, dur: .05, gain: .015, attack: .002, at: i * rand(.05, .2) });
    v.tone({ type: 'sine', f: 70, to: 40, dur: .5, gain: .02, attack: .01 });
  } },
} satisfies Record<string, Def>;

export type SfxName = keyof typeof DEFS;
export const SFX_NAMES = Object.keys(DEFS) as SfxName[];

const lowpass = (v: Voice, f: number) => { const n = v.ctx.createBiquadFilter(); n.type = 'lowpass'; n.frequency.value = f; n.connect(v.out); return n; };
const bandpass = (v: Voice, f: number, q: number) => { const n = v.ctx.createBiquadFilter(); n.type = 'bandpass'; n.frequency.value = f; n.Q.value = q; n.connect(v.out); return n; };

// ------------------------------------------------------------------ beds

type BedParts = { stop: () => void };
type BedRecipe = (ctx: AudioContext, out: GainNode, k: BedKit) => BedParts;
type BedKit = {
  loopNoise(o: { brown?: boolean; filter: BiquadFilterType; f: number; q?: number; gain: number; out?: AudioNode }): { filter: BiquadFilterNode; gain: GainNode };
  osc(o: { type?: OscillatorType; f: number; gain: number; out?: AudioNode }): { osc: OscillatorNode; gain: GainNode };
  /** Slow LFO onto a param, `depth` around its current value. */
  lfo(param: AudioParam, rate: number, depth: number): void;
  /** Random one-shot events into the bed while it runs. */
  every(min: number, max: number, fn: (v: Voice) => void): void;
};

const BEDS = {
  // Phase 2: wind off the bay, water slapping the harbour wall, a far buoy bell and old metal.
  harbour: { bus: 'AMBIENCE', recipe: (_c, _o, k) => {
    const wind = k.loopNoise({ brown: true, filter: 'lowpass', f: 420, gain: .32 }); k.lfo(wind.filter.frequency, .07, 180); k.lfo(wind.gain.gain, .11, .12);
    const gust = k.loopNoise({ filter: 'bandpass', f: 900, q: 1.2, gain: .012 }); k.lfo(gust.gain.gain, .05, .011); k.lfo(gust.filter.frequency, .09, 350);
    const water = k.loopNoise({ brown: true, filter: 'bandpass', f: 520, q: .9, gain: .12 }); k.lfo(water.gain.gain, .43, .1); k.lfo(water.filter.frequency, .29, 160);
    const lap = k.loopNoise({ filter: 'bandpass', f: 1600, q: 1.5, gain: .008 }); k.lfo(lap.gain.gain, .61, .007);
    k.every(5, 11, v => { for (let i = 0; i < 2; i++) v.noise({ filter: 'bandpass', f: rand(500, 900), q: 1.2, dur: rand(.5, .9), gain: .035, attack: .12, at: i * rand(.3, .6), brown: true }); });
    k.every(12, 22, v => { const f = rand(380, 420); for (const [m, g] of [[1, .008], [2.76, .004], [5.4, .002]] as const) v.tone({ type: 'sine', f: f * m, dur: 3.5, gain: g, attack: .005 }); });
    k.every(14, 26, v => { const band = bandpass(v, rand(500, 900), 8); v.tone({ type: 'sawtooth', f: rand(30, 45), to: rand(50, 70), dur: rand(1, 1.8), gain: .02, attack: .3, out: band }); });
    return { stop: () => undefined };
  } },
  // Baymax's combat program idling under the shell: low, red, patient.
  'combat-hum': { bus: 'CHARACTER', recipe: (c, out, k) => {
    const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 340; filter.Q.value = 3; filter.connect(out);
    for (const f of [55, 55.4, 82.6]) k.osc({ type: 'sawtooth', f, gain: .025, out: filter });
    k.lfo(filter.frequency, .3, 90);
    k.every(3, 6, v => v.tone({ type: 'sine', f: 2350, dur: .05, gain: .002, attack: .003 }));
    return { stop: () => undefined };
  } },
  // Phase 3: the board on the apron. Mains hum from the rig, a thin electronics whine, data chatter.
  board: { bus: 'MECHANICAL', recipe: (_c, _o, k) => {
    k.osc({ type: 'sine', f: 60, gain: .02 }); k.osc({ type: 'sine', f: 120, gain: .012 }); k.osc({ type: 'triangle', f: 180, gain: .003 });
    const whine = k.osc({ type: 'sine', f: 7200, gain: .0012 }); k.lfo(whine.osc.frequency, .2, 30);
    const fan = k.loopNoise({ filter: 'bandpass', f: 1400, q: .7, gain: .012 }); k.lfo(fan.gain.gain, .17, .003);
    k.every(1.2, 3.5, v => { const n = 1 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) v.tone({ type: 'sine', f: rand(1800, 3600), dur: .04, gain: .003, attack: .002, at: i * .07 }); });
    return { stop: () => undefined };
  } },
  // Phase 4 walk: gusting street wind, a far city rumble, things settling in the rubble.
  street: { bus: 'AMBIENCE', recipe: (_c, _o, k) => {
    const wind = k.loopNoise({ brown: true, filter: 'lowpass', f: 600, gain: .3 }); k.lfo(wind.filter.frequency, .09, 300); k.lfo(wind.gain.gain, .13, .16);
    const whistle = k.loopNoise({ filter: 'bandpass', f: 1250, q: 9, gain: .01 }); k.lfo(whistle.gain.gain, .07, .009); k.lfo(whistle.filter.frequency, .05, 200);
    const rumble = k.loopNoise({ brown: true, filter: 'lowpass', f: 90, gain: .25 }); k.lfo(rumble.gain.gain, .03, .08);
    k.every(6, 14, v => { for (let i = 0; i < 4; i++) v.noise({ filter: 'bandpass', f: rand(700, 2400), q: 3, dur: .05, gain: .012, attack: .002, at: i * rand(.06, .22) }); });
    k.every(16, 30, v => { v.tone({ type: 'sine', f: 60, to: 34, dur: 2.5, gain: .03, attack: .05 }); v.noise({ filter: 'lowpass', f: 400, to: 90, dur: 2, gain: .04, attack: .1, brown: true }); });
    return { stop: () => undefined };
  } },
  // The live service cable: a buzzing feed with crackle. Place it with handle.place().
  'cable-live': { bus: 'MECHANICAL', recipe: (c, out, k) => {
    const band = c.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 300; band.Q.value = 1.4; band.connect(out);
    k.osc({ type: 'sawtooth', f: 100, gain: .05, out: band }); k.osc({ type: 'square', f: 200.6, gain: .012, out: band });
    k.lfo(band.frequency, 2.3, 60);
    k.every(.25, 1.6, v => { const n = 1 + Math.floor(Math.random() * 4); for (let i = 0; i < n; i++) v.noise({ filter: 'highpass', f: rand(2000, 4500), dur: rand(.005, .018), gain: rand(.02, .06), attack: .0008, at: i * rand(.01, .05) }); });
    return { stop: () => undefined };
  } },
  // Phase 4 bay: fluorescent hum, the hall's room tone, distant drips, a tube that ticks.
  bay: { bus: 'AMBIENCE', recipe: (c, out, k) => {
    const ballast = c.createBiquadFilter(); ballast.type = 'lowpass'; ballast.frequency.value = 900; ballast.connect(out);
    k.osc({ type: 'square', f: 120, gain: .012, out: ballast }); k.osc({ type: 'sine', f: 240, gain: .006 });
    const buzz = k.loopNoise({ filter: 'bandpass', f: 3600, q: 6, gain: .004 }); k.lfo(buzz.gain.gain, .4, .0015);
    const room = k.loopNoise({ brown: true, filter: 'lowpass', f: 260, gain: .14 }); k.lfo(room.gain.gain, .05, .03);
    const outside = k.loopNoise({ brown: true, filter: 'lowpass', f: 160, gain: .08 }); k.lfo(outside.gain.gain, .08, .05);
    k.every(1.8, 5, v => {
      const f = rand(1300, 2200), pan = v.ctx.createStereoPanner(); pan.pan.value = rand(-.8, .8); pan.connect(v.out);
      v.tone({ type: 'sine', f, to: f * .55, dur: .09, gain: .012, attack: .002, out: pan });
      v.tone({ type: 'sine', f: f * .9, to: f * .5, dur: .12, gain: .003, attack: .002, at: .16, out: pan });
    });
    k.every(7, 18, v => { for (let i = 0; i < 3; i++) { v.noise({ filter: 'bandpass', f: 3400, q: 3, dur: .03, gain: .01, attack: .002, at: i * .05 }); v.tone({ type: 'square', f: 120, dur: .04, gain: .006, attack: .002, at: i * .05 }); } });
    return { stop: () => undefined };
  } },
  // Phase 5 relay, on its emergency battery: wind through the broken wall, an inverter whine.
  relay: { bus: 'AMBIENCE', recipe: (_c, _o, k) => {
    const wind = k.loopNoise({ brown: true, filter: 'lowpass', f: 500, gain: .2 }); k.lfo(wind.filter.frequency, .08, 220); k.lfo(wind.gain.gain, .12, .1);
    k.osc({ type: 'sine', f: 4100, gain: .0012 });
    k.every(9, 20, v => { v.click({ f: 1800, gain: .03 }); v.click({ f: 1500, gain: .02, at: .11 }); });
    return { stop: () => undefined };
  } },
  // …and once the main is closed: mains buzz, server fans, relays chattering.
  'relay-power': { bus: 'MECHANICAL', recipe: (c, out, k) => {
    const band = c.createBiquadFilter(); band.type = 'lowpass'; band.frequency.value = 700; band.connect(out);
    k.osc({ type: 'sawtooth', f: 50, gain: .02, out: band }); k.osc({ type: 'sawtooth', f: 100.3, gain: .01, out: band });
    const fans = k.loopNoise({ filter: 'bandpass', f: 1800, q: .6, gain: .02 }); k.lfo(fans.filter.frequency, .3, 80);
    k.osc({ type: 'sine', f: 240, gain: .003 });
    k.every(2, 6, v => { const n = 1 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) v.click({ f: rand(1600, 2600), gain: .02, at: i * rand(.06, .14) }); });
    return { stop: () => undefined };
  } },
} satisfies Record<string, { bus: Bus; recipe: BedRecipe }>;
export type BedName = keyof typeof BEDS;
export const BED_NAMES = Object.keys(BEDS) as BedName[];

// ------------------------------------------------------------------ engine

const MUTE_KEY = 'lastgate.sfx.muted';
const readMuted = () => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } };

class Sfx {
  private outs = new Map<Bus, GainNode>();
  private white: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;
  private last = new Map<string, number>();
  private beds = new Map<string, { handle: BedHandle; owner: string | null; begin: () => void }>();
  private pending = new Set<() => void>();
  private listeners = new Set<() => void>();
  private ear = { x: 0, y: 0, z: 0, rx: 1, ry: 0, rz: 0, set: false };
  private started = false;
  private isMuted = readMuted();

  get muted() { return this.isMuted; }

  /** Mute or unmute every sfx sound (beds fade, one-shots stop being scheduled). */
  setMuted(muted: boolean) {
    if (muted === this.isMuted) return;
    this.isMuted = muted;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* storage blocked */ }
    const ctx = audioEngine.context;
    if (ctx) for (const g of this.outs.values()) g.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, .08);
    this.listeners.forEach(fn => fn());
  }
  toggleMute() { this.setMuted(!this.isMuted); }
  subscribe = (fn: () => void) => { this.init(); this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getMuted = () => this.isMuted;

  /** Where the ears are, for positional sounds: call each frame with the scene camera. */
  listener(camera: { matrixWorld: { elements: ArrayLike<number> } }) {
    const e = camera.matrixWorld.elements;
    this.ear.x = e[12]; this.ear.y = e[13]; this.ear.z = e[14]; this.ear.rx = e[0]; this.ear.ry = e[1]; this.ear.rz = e[2]; this.ear.set = true;
  }

  /** Fire a named one-shot. Silent no-op before the first gesture, while muted or while hidden. */
  play(name: SfxName, options: PlayOptions = {}) {
    this.init();
    const def: Def = DEFS[name]; if (!def) return;
    const ctx = this.live(); if (!ctx || this.isMuted) return;
    const now = ctx.currentTime;
    if (def.minGap && now - (this.last.get(name) ?? -1) < def.minGap) return;
    this.last.set(name, now);
    const out = this.out(def.bus); if (!out) return;
    const { pan, gain } = this.spatial(options);
    if (gain < .002) return;
    const level = ctx.createGain(), panner = ctx.createStereoPanner();
    level.gain.value = (def.gain ?? 1) * (options.gain ?? 1) * gain; panner.pan.value = pan;
    level.connect(panner); panner.connect(out);
    const vary = def.vary ?? .03;
    const voice = this.voice(ctx, level, now + (options.delay ?? 0), (options.pitch ?? 1) * (1 + rand(-vary, vary)));
    try { def.recipe(voice); } catch { /* a bad recipe must never break gameplay */ }
    window.setTimeout(() => { level.disconnect(); panner.disconnect(); }, ((options.delay ?? 0) + voice.end + .3) * 1000);
  }

  /** Start (or return) a keyed ambience bed. `owner` lets a scene stop all of its beds at once. */
  bed(name: BedName, options: { gain?: number; fade?: number; owner?: string; at?: Vec3; near?: number } = {}): BedHandle {
    this.init();
    const existing = this.beds.get(name);
    if (existing) { existing.owner = options.owner ?? existing.owner; existing.handle.setGain(options.gain ?? 1, options.fade ?? 1.5); return existing.handle; }
    const recipe: { bus: Bus; recipe: BedRecipe } = BEDS[name]; if (!recipe) throw new Error(`unknown bed ${String(name)}`);
    // Outside the opening, nobody sets a narrative mix: give the buses their recovery levels.
    if (audioEngine.currentMix === 'SILENT') audioEngine.applyMix('SHELL', .8);
    let level = options.gain ?? 1, place = 1, pan = 0, stopped = false;
    let gain: GainNode | null = null, panner: StereoPannerNode | null = null, parts: BedParts | null = null;
    const nodes: AudioNode[] = [], timers: number[] = [];
    const begin = () => {
      this.pending.delete(begin);
      const ctx = this.live(), bus = ctx && this.out(recipe.bus);
      if (stopped || !ctx || !bus) { if (!stopped) this.pending.add(begin); return; }
      gain = ctx.createGain(); gain.gain.value = 0; panner = ctx.createStereoPanner(); panner.pan.value = pan;
      gain.connect(panner); panner.connect(bus);
      gain.gain.setTargetAtTime(level * place, ctx.currentTime, Math.max(.01, (options.fade ?? 2) / 3));
      parts = recipe.recipe(ctx, gain, this.kit(ctx, gain, nodes, timers));
    };
    const handle: BedHandle = {
      name,
      setGain: (value, fade = .6) => { level = value; const ctx = audioEngine.context; if (ctx && gain) gain.gain.setTargetAtTime(level * place, ctx.currentTime, Math.max(.01, fade / 3)); },
      place: (at, near = 3) => {
        const s = this.spatial({ at, near }); place = s.gain; pan = s.pan;
        const ctx = audioEngine.context; if (!ctx || !gain || !panner) return;
        gain.gain.setTargetAtTime(level * place, ctx.currentTime, .12); panner.pan.setTargetAtTime(pan, ctx.currentTime, .12);
      },
      stop: (fade = 1.2) => {
        if (stopped) return; stopped = true;
        this.pending.delete(begin);
        if (this.beds.get(name)?.handle === handle) this.beds.delete(name);
        timers.forEach(clearInterval); timers.length = 0;
        const ctx = audioEngine.context, g = gain;
        if (!ctx || !g) return;
        g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setValueAtTime(g.gain.value, ctx.currentTime); g.gain.linearRampToValueAtTime(0, ctx.currentTime + fade);
        window.setTimeout(() => {
          parts?.stop();
          for (const n of nodes) { try { (n as AudioScheduledSourceNode).stop?.(); } catch { /* never started */ } n.disconnect(); }
          g.disconnect(); panner?.disconnect();
        }, fade * 1000 + 80);
      },
    };
    if (options.at) handle.place(options.at, options.near);
    this.beds.set(name, { handle, owner: options.owner ?? null, begin });
    begin();
    return handle;
  }
  /** Move a running bed (pan and distance falloff from the listener); no-op if it isn't running. */
  placeBed(name: BedName, at: Vec3, near?: number) { this.beds.get(name)?.handle.place(at, near); }
  stopBed(name: BedName, fade?: number) { this.beds.get(name)?.handle.stop(fade); }
  stopOwner(owner: string, fade?: number) { for (const b of [...this.beds.values()]) if (b.owner === owner) b.handle.stop(fade); }
  get activeBeds() { return [...this.beds.keys()]; }

  // ---------------------------------------------------------------- internals

  /** One-time wiring: gesture unlock, and following the opening's SOUND toggle. */
  private init() {
    if (this.started) return; this.started = true;
    audioEngine.unlockOnFirstGesture();
    const unlock = () => {
      window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true);
      const ctx = audioEngine.ensure();
      if (ctx?.state === 'suspended') void ctx.resume().catch(() => undefined);
      for (const begin of [...this.pending]) begin();
    };
    window.addEventListener('pointerdown', unlock, true); window.addEventListener('keydown', unlock, true);
    // Beds that asked while the tab was hidden start when it comes back.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') for (const begin of [...this.pending]) begin(); });
    useSceneState.subscribe((s, prev) => { if (s.sound !== prev.sound) this.setMuted(!s.sound); });
  }

  /** The shared context, only once a gesture has happened and while the page is visible. */
  private live(): AudioContext | null {
    const ctx = audioEngine.context ?? (this.gestured() ? audioEngine.ensure() : null);
    if (!ctx || document.visibilityState === 'hidden') return null;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return ctx.state === 'closed' ? null : ctx;
  }
  private gestured() {
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    return activation ? activation.hasBeenActive : false;
  }

  private out(bus: Bus): GainNode | null {
    let g = this.outs.get(bus);
    if (g) return g;
    const ctx = audioEngine.context, target = audioEngine.bus(bus);
    if (!ctx || !target) return null;
    g = ctx.createGain(); g.gain.value = this.isMuted ? 0 : 1; g.connect(target); this.outs.set(bus, g);
    return g;
  }

  private spatial(o: PlayOptions) {
    if (!o.at || !this.ear.set) return { pan: o.pan ?? 0, gain: 1 };
    const p = Array.isArray(o.at) ? { x: o.at[0], y: o.at[1], z: o.at[2] } : o.at as { x: number; y: number; z: number };
    const dx = p.x - this.ear.x, dy = p.y - this.ear.y, dz = p.z - this.ear.z, d = Math.hypot(dx, dy, dz), near = o.near ?? 2.5;
    const side = d > .001 ? (dx * this.ear.rx + dy * this.ear.ry + dz * this.ear.rz) / d : 0;
    return { pan: Math.max(-.85, Math.min(.85, side * .85)), gain: d <= near ? 1 : Math.pow(near / d, 1.3) };
  }

  private buffers(ctx: AudioContext) {
    if (!this.white || this.white.sampleRate !== ctx.sampleRate) {
      const n = ctx.sampleRate * 2;
      this.white = ctx.createBuffer(1, n, ctx.sampleRate); const w = this.white.getChannelData(0);
      for (let i = 0; i < n; i++) w[i] = Math.random() * 2 - 1;
      this.brown = ctx.createBuffer(1, n * 2, ctx.sampleRate); const b = this.brown.getChannelData(0); let last = 0;
      for (let i = 0; i < n * 2; i++) { last = (last + .02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    }
    return { white: this.white, brown: this.brown! };
  }

  private voice(ctx: AudioContext, out: AudioNode, t: number, pitch: number): Voice & { end: number } {
    const { white, brown } = this.buffers(ctx);
    const v: Voice & { end: number } = {
      ctx, t, pitch, out, end: 0,
      tone: ({ type = 'sine', f, to, dur, gain, attack = .01, at = 0, detune = 0, out: dest = out }) => {
        const s = t + at, o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.detune.value = detune; o.frequency.setValueAtTime(f, s); if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), s + dur);
        g.gain.setValueAtTime(.0001, s); g.gain.linearRampToValueAtTime(gain, s + attack); g.gain.exponentialRampToValueAtTime(.0001, s + Math.max(dur, attack + .01));
        o.connect(g); g.connect(dest); o.start(s); o.stop(s + dur + .05);
        o.onended = () => { o.disconnect(); g.disconnect(); };
        v.end = Math.max(v.end, at + dur);
      },
      noise: ({ filter = 'bandpass', f, to, q = 1, dur, gain, attack = .004, at = 0, brown: useBrown = false, out: dest = out }) => {
        const s = t + at, src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(), buf = useBrown ? brown : white;
        src.buffer = buf; src.playbackRate.value = .85 + Math.random() * .3;
        fl.type = filter; fl.Q.value = q; fl.frequency.setValueAtTime(f, s); if (to) fl.frequency.exponentialRampToValueAtTime(Math.max(20, to), s + dur);
        g.gain.setValueAtTime(.0001, s); g.gain.linearRampToValueAtTime(gain, s + attack); g.gain.exponentialRampToValueAtTime(.0001, s + Math.max(dur, attack + .01));
        src.connect(fl); fl.connect(g); g.connect(dest);
        src.start(s, Math.random() * (buf.duration - Math.min(buf.duration - .01, dur + .1))); src.stop(s + dur + .05);
        src.onended = () => { src.disconnect(); fl.disconnect(); g.disconnect(); };
        v.end = Math.max(v.end, at + dur);
      },
      click: ({ f = 3200, gain = .05, at = 0, out: dest = out } = {}) => v.noise({ filter: 'bandpass', f, to: f * .8, q: 3, dur: .018, gain, attack: .001, at, out: dest }),
    };
    return v;
  }

  private kit(ctx: AudioContext, out: GainNode, nodes: AudioNode[], timers: number[]): BedKit {
    const { white, brown } = this.buffers(ctx);
    return {
      loopNoise: ({ brown: useBrown = false, filter, f, q = 1, gain, out: dest = out }) => {
        const src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
        src.buffer = useBrown ? brown : white; src.loop = true; src.playbackRate.value = .9 + Math.random() * .2;
        fl.type = filter; fl.frequency.value = f; fl.Q.value = q; g.gain.value = gain;
        src.connect(fl); fl.connect(g); g.connect(dest); src.start(ctx.currentTime, Math.random() * src.buffer.duration);
        nodes.push(src, fl, g); return { filter: fl, gain: g };
      },
      osc: ({ type = 'sine', f, gain, out: dest = out }) => {
        const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f; g.gain.value = gain;
        o.connect(g); g.connect(dest); o.start(); nodes.push(o, g); return { osc: o, gain: g };
      },
      lfo: (param, rate, depth) => {
        const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = rate * (.85 + Math.random() * .3); g.gain.value = depth;
        o.connect(g); g.connect(param); o.start(ctx.currentTime + Math.random() * 2); nodes.push(o, g);
      },
      every: (min, max, fn) => {
        let next = 0;
        const tick = () => {
          if (ctx.currentTime < next || document.visibilityState === 'hidden') return;
          next = ctx.currentTime + rand(min, max);
          try { fn(this.voice(ctx, out, ctx.currentTime + .02, 1 + rand(-.05, .05))); } catch { /* keep the bed alive */ }
        };
        next = ctx.currentTime + rand(min * .3, max);
        timers.push(window.setInterval(tick, 120));
      },
    };
  }
}

export const sfx = new Sfx();
if (import.meta.env.DEV) (window as Window & { __lastGateSfx?: Sfx }).__lastGateSfx = sfx;

// ------------------------------------------------------------------ React helpers

/** Keep a bed running while `active`. Returns a ref to its handle (for setGain / place). */
export function useSfxBed(name: BedName, active = true, gain = 1) {
  const handle = useRef<BedHandle | null>(null);
  useEffect(() => {
    if (!active) return;
    const h = sfx.bed(name, { gain }); handle.current = h;
    return () => { h.stop(); if (handle.current === h) handle.current = null; };
  }, [name, active]);
  useEffect(() => { handle.current?.setGain(gain, 1); }, [gain]);
  return handle;
}

/**
 * Subtle hover and click on every enabled button while `active`. Elements (or an ancestor) with
 * data-sfx="none" are skipped; data-sfx="<name>" plays that sound on click instead of ui.click.
 */
export function useUiSfx(active = true) {
  useEffect(() => {
    if (!active) return;
    let hovered: Element | null = null;
    const target = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('button, [role="button"], [role="radio"], a[href]');
      if (!el || (el as HTMLButtonElement).disabled || el.closest('[data-sfx="none"], [inert]')) return null;
      return el;
    };
    const over = (e: PointerEvent) => { const el = target(e); if (el && el !== hovered) sfx.play('ui.hover'); hovered = el; };
    const click = (e: MouseEvent) => {
      const el = target(e); if (!el) return;
      const named = el.closest('[data-sfx]')?.getAttribute('data-sfx');
      sfx.play(named && named in DEFS ? named as SfxName : 'ui.click');
    };
    document.addEventListener('pointerover', over, true); document.addEventListener('click', click, true);
    return () => { document.removeEventListener('pointerover', over, true); document.removeEventListener('click', click, true); };
  }, [active]);
}

/** Closest point on a polyline (for placing a bed along a cable). Writes into `out`. */
export function nearestOnPath(points: readonly (readonly [number, number, number])[], x: number, y: number, z: number, out: [number, number, number]) {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const len = abx * abx + aby * aby + abz * abz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * abx + (y - a[1]) * aby + (z - a[2]) * abz) / len));
    const px = a[0] + abx * t, py = a[1] + aby * t, pz = a[2] + abz * t, d = (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
    if (d < best) { best = d; out[0] = px; out[1] = py; out[2] = pz; }
  }
  return out;
}
