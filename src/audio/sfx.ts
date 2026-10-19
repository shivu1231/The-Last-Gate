import { useEffect, useRef } from 'react';
import { audioEngine, type AudioBus } from './AudioMix';
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

export type SoundPosition =
  | readonly [number, number, number]
  | { x: number; y: number; z: number };
/**
 * Optional gain, pan, position and scheduling controls for a named effect.
 */
export type PlayOptions = {
  /** Linear gain multiplier on the sound's own level (default 1). */
  gain?: number;
  /** Stereo position, -1 left … 1 right. Ignored when `at` is given. */
  pan?: number;
  /** World position; pan and distance falloff come from the listener set with sfx.listener(). */
  at?: SoundPosition;
  /** Distance (m) at which the sound is at full level when positional (default 2.5). */
  near?: number;
  /** Pitch multiplier (default 1, with a little random variation per sound). */
  pitch?: number;
  /** Start this many seconds from now. */
  delay?: number;
};
/**
 * Controls for an ambient sound bed.
 */
export type BedHandle = {
  readonly name: string;
  stop(fade?: number): void;
  setGain(value: number, fade?: number): void;
  place(at: SoundPosition, near?: number): void;
};

// ------------------------------------------------------------------ voice primitives

/**
 * Synthesizer context and primitive tone/noise/click operations for a recipe.
 */
type SynthVoice = {
  ctx: AudioContext;
  t: number;
  pitch: number;
  /** Oscillator with an exponential pitch glide and a short attack, exponential decay. */
  tone(offset: {
    type?: OscillatorType;
    f: number;
    to?: number;
    dur: number;
    gain: number;
    attack?: number;
    at?: number;
    detune?: number;
    out?: AudioNode;
  }): void;
  /** Filtered noise burst. */
  noise(offset: {
    filter?: BiquadFilterType;
    f: number;
    to?: number;
    q?: number;
    dur: number;
    gain: number;
    attack?: number;
    at?: number;
    brown?: boolean;
    out?: AudioNode;
  }): void;
  /** A tiny metallic tick. */
  click(offset?: {
    f?: number;
    gain?: number;
    at?: number;
    out?: AudioNode;
  }): void;
  out: AudioNode;
};
/**
 * Synthesizer instructions for one named effect.
 */
type SoundRecipe = (value: SynthVoice) => void;
/**
 * Bus routing, gain and replay policy for a sound recipe.
 */
type SoundDefinition = {
  bus: AudioBus;
  gain?: number;
  minGap?: number;
  vary?: number;
  recipe: SoundRecipe;
};

const randomBetween = (startValue: number, endValue: number) =>
  startValue + Math.random() * (endValue - startValue);

/** Every one-shot, by name. Names are namespaced so other chapters can reuse them. */
const DEFS = {
  // ── UI (UI bus): soft, short, never louder than the world.
  'ui.hover': {
    bus: 'UI',
    gain: 0.5,
    minGap: 0.045,
    recipe: (voice) => {
      voice.tone({
        type: 'sine',
        f: 2300,
        to: 2500,
        dur: 0.05,
        gain: 0.012,
        attack: 0.004,
      });
    },
  },
  'ui.click': {
    bus: 'UI',
    minGap: 0.03,
    recipe: (voice) => {
      voice.click({ f: 3400, gain: 0.05 });
      voice.tone({
        type: 'triangle',
        f: 1250,
        to: 900,
        dur: 0.06,
        gain: 0.018,
        attack: 0.002,
      });
    },
  },
  'ui.confirm': {
    bus: 'UI',
    recipe: (voice) => {
      voice.tone({
        type: 'sine',
        f: 880,
        dur: 0.14,
        gain: 0.03,
        attack: 0.005,
      });
      voice.tone({
        type: 'sine',
        f: 1318.5,
        dur: 0.22,
        gain: 0.028,
        attack: 0.005,
        at: 0.07,
      });
    },
  },
  'ui.back': {
    bus: 'UI',
    recipe: (voice) => {
      voice.tone({
        type: 'triangle',
        f: 900,
        to: 620,
        dur: 0.12,
        gain: 0.02,
        attack: 0.004,
      });
    },
  },
  'ui.deny': {
    bus: 'UI',
    minGap: 0.12,
    recipe: (voice) => {
      voice.tone({
        type: 'square',
        f: 196,
        dur: 0.09,
        gain: 0.012,
        attack: 0.003,
      });
      voice.tone({
        type: 'square',
        f: 185,
        dur: 0.12,
        gain: 0.012,
        attack: 0.003,
        at: 0.1,
      });
    },
  },
  'ui.toggle': {
    bus: 'UI',
    recipe: (voice) => {
      voice.click({ f: 2600, gain: 0.06 });
      voice.click({ f: 4200, gain: 0.03, at: 0.018 });
    },
  },
  'ui.tick': {
    bus: 'UI',
    minGap: 0.03,
    recipe: (voice) => {
      voice.click({ f: 5200, gain: 0.025 });
    },
  },
  'ui.open': {
    bus: 'UI',
    recipe: (voice) => {
      voice.noise({
        filter: 'bandpass',
        f: 900,
        to: 3800,
        q: 1.2,
        dur: 0.22,
        gain: 0.018,
        attack: 0.06,
      });
    },
  },

  // ── Movement.
  'step.concrete': {
    bus: 'CHARACTER',
    gain: 0.9,
    minGap: 0.12,
    vary: 0.12,
    recipe: (voice) => {
      voice.noise({
        filter: 'lowpass',
        f: 900 * voice.pitch,
        to: 160,
        q: 0.8,
        dur: 0.11,
        gain: 0.1,
        attack: 0.003,
        brown: true,
      });
      voice.noise({
        filter: 'bandpass',
        f: 2600 * voice.pitch,
        to: 1800,
        q: 1.4,
        dur: 0.06,
        gain: 0.022,
        attack: 0.002,
        at: 0.012,
      });
    },
  },
  'step.grit': {
    bus: 'CHARACTER',
    gain: 0.9,
    minGap: 0.12,
    vary: 0.15,
    recipe: (voice) => {
      voice.noise({
        filter: 'lowpass',
        f: 800 * voice.pitch,
        to: 150,
        q: 0.8,
        dur: 0.12,
        gain: 0.09,
        attack: 0.003,
        brown: true,
      });
      for (let index = 0; index < 4; index++)
        voice.noise({
          filter: 'bandpass',
          f: randomBetween(3000, 6000),
          q: 5,
          dur: 0.02,
          gain: 0.012,
          attack: 0.001,
          at: 0.02 + index * randomBetween(0.01, 0.025),
        });
    },
  },
  'step.metal': {
    bus: 'CHARACTER',
    minGap: 0.12,
    vary: 0.1,
    recipe: (voice) => {
      voice.noise({
        filter: 'lowpass',
        f: 1100,
        to: 200,
        dur: 0.1,
        gain: 0.08,
        attack: 0.002,
        brown: true,
      });
      voice.tone({
        type: 'triangle',
        f: 410 * voice.pitch,
        to: 380,
        dur: 0.18,
        gain: 0.012,
        attack: 0.002,
      });
      voice.tone({
        type: 'sine',
        f: 1130 * voice.pitch,
        dur: 0.12,
        gain: 0.005,
        attack: 0.002,
      });
    },
  },
  'move.whoosh': {
    bus: 'CHARACTER',
    minGap: 0.5,
    recipe: (voice) => {
      voice.noise({
        filter: 'bandpass',
        f: 380,
        to: 900,
        q: 0.7,
        dur: 0.7,
        gain: 0.025,
        attack: 0.25,
        brown: true,
      });
    },
  },
  'move.duck': {
    bus: 'CHARACTER',
    minGap: 2,
    recipe: (voice) => {
      voice.noise({
        filter: 'lowpass',
        f: 600,
        to: 200,
        dur: 0.5,
        gain: 0.05,
        attack: 0.12,
        brown: true,
      });
      voice.tone({
        type: 'triangle',
        f: 92,
        to: 78,
        dur: 1.2,
        gain: 0.02,
        attack: 0.1,
        at: 0.1,
      });
      voice.tone({
        type: 'sine',
        f: 760,
        to: 740,
        dur: 1.4,
        gain: 0.004,
        attack: 0.2,
        at: 0.1,
      });
    },
  },

  // ── Electrical.
  'elec.crackle': {
    bus: 'MECHANICAL',
    minGap: 0.04,
    recipe: (voice) => {
      const count = 2 + Math.floor(Math.random() * 4);
      for (let index = 0; index < count; index++)
        voice.noise({
          filter: 'highpass',
          f: randomBetween(1800, 4200),
          q: 0.7,
          dur: randomBetween(0.006, 0.02),
          gain: randomBetween(0.03, 0.09),
          attack: 0.0008,
          at: index * randomBetween(0.008, 0.05),
        });
      voice.tone({
        type: 'sawtooth',
        f: 120,
        dur: 0.05,
        gain: 0.01,
        attack: 0.002,
      });
    },
  },
  'elec.zap': {
    bus: 'MECHANICAL',
    recipe: (voice) => {
      voice.noise({
        filter: 'highpass',
        f: 2600,
        to: 900,
        dur: 0.16,
        gain: 0.09,
        attack: 0.001,
      });
      voice.tone({
        type: 'square',
        f: 1400,
        to: 120,
        dur: 0.2,
        gain: 0.02,
        attack: 0.001,
      });
      voice.tone({
        type: 'sawtooth',
        f: 100,
        to: 120,
        dur: 0.5,
        gain: 0.02,
        attack: 0.02,
        at: 0.12,
      });
      voice.tone({
        type: 'sine',
        f: 420,
        to: 640,
        dur: 0.6,
        gain: 0.01,
        attack: 0.2,
        at: 0.15,
      });
    },
  },
  'elec.arc': {
    bus: 'MECHANICAL',
    minGap: 0.25,
    recipe: (voice) => {
      voice.noise({
        filter: 'bandpass',
        f: 3200,
        to: 1400,
        q: 1.5,
        dur: 0.3,
        gain: 0.07,
        attack: 0.002,
      });
      for (let index = 0; index < 6; index++)
        voice.noise({
          filter: 'highpass',
          f: 2500,
          dur: 0.012,
          gain: 0.06,
          attack: 0.001,
          at: randomBetween(0, 0.25),
        });
      voice.tone({
        type: 'sawtooth',
        f: 100,
        dur: 0.3,
        gain: 0.015,
        attack: 0.004,
      });
    },
  },
  'power.whine-up': {
    bus: 'MECHANICAL',
    recipe: (voice) => {
      voice.tone({
        type: 'sine',
        f: 220,
        to: 1760,
        dur: 1.4,
        gain: 0.018,
        attack: 0.6,
      });
      voice.tone({
        type: 'sawtooth',
        f: 110,
        to: 880,
        dur: 1.4,
        gain: 0.004,
        attack: 0.7,
      });
      voice.tone({
        type: 'sine',
        f: 1760,
        dur: 0.7,
        gain: 0.006,
        attack: 0.05,
        at: 1.25,
      });
    },
  },
  'power.down': {
    bus: 'MECHANICAL',
    recipe: (voice) => {
      voice.tone({
        type: 'sine',
        f: 900,
        to: 90,
        dur: 1.2,
        gain: 0.016,
        attack: 0.01,
      });
      voice.tone({
        type: 'sawtooth',
        f: 240,
        to: 40,
        dur: 1,
        gain: 0.004,
        attack: 0.01,
      });
    },
  },
  'power.strain': {
    bus: 'MECHANICAL',
    recipe: (voice) => {
      // Baymax driven against the limit: a hum that climbs, beats against itself and stops short.
      for (const [callback, depth] of [
        [55, 0],
        [55.7, 0],
        [110, 6],
      ] as const)
        voice.tone({
          type: 'sawtooth',
          f: callback,
          to: callback * 1.9,
          dur: 4.6,
          gain: 0.012,
          attack: 2.4,
          detune: depth,
          out: lowpass(voice, 520),
        });
      voice.tone({
        type: 'sine',
        f: 330,
        to: 620,
        dur: 4.4,
        gain: 0.007,
        attack: 2.6,
      });
      voice.noise({
        filter: 'bandpass',
        f: 220,
        to: 900,
        q: 2.5,
        dur: 4.4,
        gain: 0.03,
        attack: 3,
        brown: true,
      });
    },
  },

  // ── Mechanical.
  'mech.crate-scrape': {
    bus: 'MECHANICAL',
    minGap: 0.15,
    vary: 0.1,
    recipe: (voice) => {
      voice.noise({
        filter: 'bandpass',
        f: 420 * voice.pitch,
        to: 260,
        q: 2,
        dur: 0.7,
        gain: 0.07,
        attack: 0.06,
        brown: true,
      });
      voice.noise({
        filter: 'bandpass',
        f: 1900 * voice.pitch,
        to: 1300,
        q: 4,
        dur: 0.55,
        gain: 0.015,
        attack: 0.05,
      });
      for (let index = 0; index < 5; index++)
        voice.noise({
          filter: 'bandpass',
          f: randomBetween(700, 1400),
          q: 6,
          dur: 0.03,
          gain: 0.025,
          attack: 0.002,
          at: randomBetween(0.05, 0.6),
        });
    },
  },
  'mech.crate-thud': {
    bus: 'IMPACT',
    minGap: 0.08,
    vary: 0.12,
    recipe: (voice) => {
      voice.tone({
        type: 'sine',
        f: 120 * voice.pitch,
        to: 48,
        dur: 0.3,
        gain: 0.12,
        attack: 0.003,
      });
      voice.noise({
        filter: 'lowpass',
        f: 1200,
        to: 180,
        dur: 0.2,
        gain: 0.1,
        attack: 0.002,
        brown: true,
      });
      voice.noise({
        filter: 'bandpass',
        f: 600 * voice.pitch,
        q: 3,
        dur: 0.12,
        gain: 0.03,
        attack: 0.002,
      });
    },
  },
  'mech.tarp': {
    bus: 'MECHANICAL',
    recipe: (voice) => {
      voice.noise({
        filter: 'bandpass',
        f: 1400,
        to: 700,
        q: 0.8,
        dur: 0.8,
        gain: 0.05,
        attack: 0.08,
      });
      voice.noise({
        filter: 'highpass',
        f: 3500,
        dur: 0.4,
        gain: 0.015,
        attack: 0.05,
        at: 0.2,
      });
    },
  },
  'mech.latch': {
    bus: 'MECHANICAL',
    vary: 0.06,
    recipe: (voice) => {
      voice.click({ f: 2800 * voice.pitch, gain: 0.1 });
      voice.click({ f: 4600 * voice.pitch, gain: 0.06, at: 0.01 });
      voice.tone({
        type: 'triangle',
        f: 760 * voice.pitch,
        to: 620,
        dur: 0.09,
        gain: 0.02,
        attack: 0.001,
      });
      voice.click({ f: 2200, gain: 0.07, at: 0.09 });
      voice.tone({
        type: 'sine',
        f: 140,
        to: 90,
        dur: 0.12,
        gain: 0.05,
        attack: 0.002,
        at: 0.09,
      });
    },
  },
  'mech.lid-creak': {
    bus: 'MECHANICAL',
    recipe: (voice) => {
      // A hinge that hasn't moved in a while: a slow, wobbling saw through a resonant band.
      const band = bandpass(voice, 900, 9);
      voice.tone({
        type: 'sawtooth',
        f: 38,
        to: 62,
        dur: 1.1,
        gain: 0.05,
        attack: 0.15,
        out: band,
      });
      voice.tone({
        type: 'sawtooth',
        f: 61,
        to: 44,
        dur: 0.9,
        gain: 0.03,
        attack: 0.12,
        at: 0.45,
        out: band,
      });
      voice.noise({
        filter: 'lowpass',
        f: 500,
        to: 180,
        dur: 0.5,
        gain: 0.05,
        attack: 0.01,
        at: 1.2,
        brown: true,
      });
      voice.tone({
        type: 'sine',
        f: 110,
        to: 70,
        dur: 0.3,
        gain: 0.05,
        attack: 0.004,
        at: 1.25,
      });
    },
  },
  'mech.lift': {
    bus: 'MECHANICAL',
    recipe: (voice) => {
      voice.noise({
        filter: 'bandpass',
        f: 900,
        to: 1600,
        q: 0.9,
        dur: 0.4,
        gain: 0.03,
        attack: 0.05,
      });
      voice.tone({
        type: 'triangle',
        f: 330,
        to: 300,
        dur: 0.5,
        gain: 0.01,
        attack: 0.01,
      });
      // The charge lead pulling out.
      voice.click({ f: 1800, gain: 0.08, at: 0.35 });
      voice.noise({
        filter: 'highpass',
        f: 2800,
        dur: 0.05,
        gain: 0.05,
        attack: 0.001,
        at: 0.36,
      });
    },
  },
  'mech.plug-turn': {
    bus: 'MECHANICAL',
    vary: 0.08,
    recipe: (voice) => {
      voice.click({ f: 3000 * voice.pitch, gain: 0.05 });
      voice.noise({
        filter: 'bandpass',
        f: 1800,
        q: 3,
        dur: 0.08,
        gain: 0.015,
        attack: 0.01,
      });
      voice.click({ f: 2400 * voice.pitch, gain: 0.04, at: 0.07 });
    },
  },
  'mech.plug-push': {
    bus: 'MECHANICAL',
    recipe: (voice) => {
      voice.noise({
        filter: 'bandpass',
        f: 500,
        to: 900,
        q: 1.5,
        dur: 0.8,
        gain: 0.03,
        attack: 0.5,
        brown: true,
      });
    },
  },
  'mech.plug-seat': {
    bus: 'MECHANICAL',
    recipe: (voice) => {
      voice.tone({
        type: 'sine',
        f: 90,
        to: 46,
        dur: 0.3,
        gain: 0.12,
        attack: 0.002,
      });
      voice.click({ f: 2600, gain: 0.12 });
      voice.click({ f: 5200, gain: 0.06, at: 0.008 });
      voice.tone({
        type: 'sine',
        f: 1320,
        dur: 0.5,
        gain: 0.008,
        attack: 0.004,
        at: 0.05,
      });
    },
  },
  'mech.ratchet': {
    bus: 'MECHANICAL',
    minGap: 0.028,
    vary: 0.05,
    recipe: (voice) => {
      voice.click({ f: 3800 * voice.pitch, gain: 0.045 });
      voice.tone({
        type: 'triangle',
        f: 520 * voice.pitch,
        to: 460,
        dur: 0.04,
        gain: 0.01,
        attack: 0.001,
      });
    },
  },
  'mech.index-set': {
    bus: 'MECHANICAL',
    recipe: (voice) => {
      voice.click({ f: 2200, gain: 0.1 });
      voice.tone({
        type: 'sine',
        f: 70,
        to: 42,
        dur: 0.35,
        gain: 0.1,
        attack: 0.003,
      });
      voice.tone({
        type: 'sawtooth',
        f: 160,
        to: 210,
        dur: 0.45,
        gain: 0.006,
        attack: 0.06,
        at: 0.1,
        out: lowpass(voice, 900),
      });
    },
  },
  'mech.clunk': {
    bus: 'IMPACT',
    recipe: (voice) => {
      voice.tone({
        type: 'sine',
        f: 75,
        to: 36,
        dur: 0.45,
        gain: 0.16,
        attack: 0.003,
      });
      voice.noise({
        filter: 'lowpass',
        f: 1400,
        to: 150,
        dur: 0.3,
        gain: 0.12,
        attack: 0.002,
        brown: true,
      });
      voice.click({ f: 1900, gain: 0.1, at: 0.01 });
      voice.tone({
        type: 'triangle',
        f: 640,
        to: 600,
        dur: 0.4,
        gain: 0.012,
        attack: 0.002,
        at: 0.01,
      });
    },
  },
  'mech.cable-plug': {
    bus: 'MECHANICAL',
    recipe: (voice) => {
      voice.noise({
        filter: 'bandpass',
        f: 1200,
        to: 2400,
        q: 2,
        dur: 0.12,
        gain: 0.03,
        attack: 0.04,
      });
      voice.click({ f: 2900, gain: 0.11, at: 0.12 });
      voice.click({ f: 1700, gain: 0.07, at: 0.135 });
      voice.tone({
        type: 'sine',
        f: 1046.5,
        dur: 0.25,
        gain: 0.01,
        attack: 0.004,
        at: 0.2,
      });
    },
  },
  'chip.hiss': {
    bus: 'MECHANICAL',
    recipe: (voice) => {
      // Chest bay: seal release, pneumatic hiss, the panel travelling, then its stop.
      voice.click({ f: 2400, gain: 0.07 });
      voice.noise({
        filter: 'highpass',
        f: 3800,
        to: 2200,
        dur: 1.1,
        gain: 0.06,
        attack: 0.02,
      });
      voice.noise({
        filter: 'bandpass',
        f: 5200,
        to: 1400,
        q: 1.4,
        dur: 0.9,
        gain: 0.03,
        attack: 0.04,
      });
      voice.tone({
        type: 'sawtooth',
        f: 140,
        to: 180,
        dur: 1.2,
        gain: 0.006,
        attack: 0.2,
        at: 0.2,
        out: lowpass(voice, 700),
      });
      voice.tone({
        type: 'sine',
        f: 85,
        to: 60,
        dur: 0.3,
        gain: 0.06,
        attack: 0.003,
        at: 1.35,
      });
    },
  },
  'sensor.ping': {
    bus: 'MECHANICAL',
    recipe: (voice) => {
      voice.tone({
        type: 'sine',
        f: 1568,
        dur: 0.5,
        gain: 0.025,
        attack: 0.003,
      });
      voice.tone({
        type: 'sine',
        f: 1568,
        dur: 0.4,
        gain: 0.008,
        attack: 0.003,
        at: 0.18,
      });
      voice.tone({
        type: 'sine',
        f: 3136,
        dur: 0.2,
        gain: 0.004,
        attack: 0.003,
      });
    },
  },
  'sensor.scan': {
    bus: 'MECHANICAL',
    recipe: (voice) => {
      for (let index = 0; index < 6; index++)
        voice.tone({
          type: 'sine',
          f: 900 + index * 180,
          dur: 0.07,
          gain: 0.012,
          attack: 0.003,
          at: index * 0.22,
        });
      voice.noise({
        filter: 'bandpass',
        f: 1200,
        to: 4000,
        q: 4,
        dur: 1.4,
        gain: 0.012,
        attack: 0.3,
      });
    },
  },
  'servo.whir': {
    bus: 'CHARACTER',
    vary: 0.08,
    minGap: 0.2,
    recipe: (voice) => {
      voice.tone({
        type: 'sawtooth',
        f: 180 * voice.pitch,
        to: 240 * voice.pitch,
        dur: 0.45,
        gain: 0.008,
        attack: 0.06,
        out: lowpass(voice, 1400),
      });
      voice.tone({
        type: 'sine',
        f: 360 * voice.pitch,
        to: 470 * voice.pitch,
        dur: 0.4,
        gain: 0.006,
        attack: 0.05,
      });
    },
  },
  'servo.groan': {
    bus: 'CHARACTER',
    vary: 0.06,
    minGap: 0.6,
    recipe: (voice) => {
      // Baymax's heavy joints taking load: low saws grinding through a moving band.
      const band = bandpass(voice, 260, 3);
      voice.tone({
        type: 'sawtooth',
        f: 46 * voice.pitch,
        to: 63 * voice.pitch,
        dur: 1.4,
        gain: 0.08,
        attack: 0.25,
        out: band,
      });
      voice.tone({
        type: 'sawtooth',
        f: 69 * voice.pitch,
        to: 58 * voice.pitch,
        dur: 1.2,
        gain: 0.05,
        attack: 0.3,
        at: 0.15,
        out: band,
      });
      voice.tone({
        type: 'sine',
        f: 140 * voice.pitch,
        to: 175 * voice.pitch,
        dur: 1,
        gain: 0.01,
        attack: 0.2,
        at: 0.1,
      });
      voice.noise({
        filter: 'lowpass',
        f: 300,
        dur: 1.2,
        gain: 0.03,
        attack: 0.3,
        brown: true,
      });
    },
  },
  'baymax.eyes': {
    bus: 'CHARACTER',
    recipe: (voice) => {
      voice.tone({
        type: 'sine',
        f: 110,
        to: 220,
        dur: 1.2,
        gain: 0.02,
        attack: 0.4,
      });
      voice.tone({
        type: 'sawtooth',
        f: 55,
        to: 56,
        dur: 1.6,
        gain: 0.01,
        attack: 0.5,
        out: lowpass(voice, 400),
      });
      voice.tone({
        type: 'sine',
        f: 2200,
        dur: 0.08,
        gain: 0.008,
        attack: 0.003,
        at: 1,
      });
      voice.tone({
        type: 'sine',
        f: 2200,
        dur: 0.08,
        gain: 0.008,
        attack: 0.003,
        at: 1.12,
      });
    },
  },
  'baymax.target': {
    bus: 'CHARACTER',
    recipe: (voice) => {
      // Combat program acquiring Hiro: a tightening tick over a low drop.
      for (let index = 0; index < 4; index++)
        voice.tone({
          type: 'sine',
          f: 2400,
          dur: 0.05,
          gain: 0.01,
          attack: 0.002,
          at: index * (0.22 - index * 0.04),
        });
      voice.tone({
        type: 'sine',
        f: 52,
        to: 38,
        dur: 1.6,
        gain: 0.07,
        attack: 0.02,
        at: 0.5,
      });
    },
  },

  // ── Relay console (Phase 5).
  'relay.breaker': {
    bus: 'MECHANICAL',
    vary: 0.06,
    recipe: (voice) => {
      voice.click({ f: 2000 * voice.pitch, gain: 0.12 });
      voice.noise({
        filter: 'bandpass',
        f: 1300 * voice.pitch,
        q: 2,
        dur: 0.05,
        gain: 0.06,
        attack: 0.001,
      });
      voice.tone({
        type: 'sine',
        f: 180 * voice.pitch,
        to: 110,
        dur: 0.08,
        gain: 0.04,
        attack: 0.001,
      });
    },
  },
  'relay.main': {
    bus: 'MECHANICAL',
    recipe: (voice) => {
      voice.click({ f: 1600, gain: 0.14 });
      voice.tone({
        type: 'sine',
        f: 64,
        to: 38,
        dur: 0.5,
        gain: 0.14,
        attack: 0.002,
      });
      voice.noise({
        filter: 'lowpass',
        f: 1800,
        to: 200,
        dur: 0.25,
        gain: 0.1,
        attack: 0.001,
        brown: true,
      });
      voice.tone({
        type: 'sawtooth',
        f: 50,
        to: 100,
        dur: 1.4,
        gain: 0.02,
        attack: 0.4,
        at: 0.15,
        out: lowpass(voice, 600),
      });
      voice.tone({
        type: 'sine',
        f: 440,
        to: 1320,
        dur: 1.2,
        gain: 0.008,
        attack: 0.5,
        at: 0.2,
      });
    },
  },
  'relay.trip': {
    bus: 'MECHANICAL',
    recipe: (voice) => {
      voice.click({ f: 1800, gain: 0.12 });
      voice.noise({
        filter: 'highpass',
        f: 2400,
        dur: 0.08,
        gain: 0.08,
        attack: 0.001,
      });
      voice.tone({
        type: 'sawtooth',
        f: 120,
        to: 40,
        dur: 0.6,
        gain: 0.03,
        attack: 0.002,
        at: 0.03,
        out: lowpass(voice, 800),
      });
      voice.click({ f: 1400, gain: 0.1, at: 0.22 });
    },
  },
  'relay.patch': {
    bus: 'MECHANICAL',
    vary: 0.05,
    recipe: (voice) => {
      voice.noise({
        filter: 'bandpass',
        f: 2200,
        to: 3200,
        q: 3,
        dur: 0.07,
        gain: 0.03,
        attack: 0.02,
      });
      voice.click({ f: 3100 * voice.pitch, gain: 0.1, at: 0.07 });
      voice.tone({
        type: 'sine',
        f: 140,
        to: 90,
        dur: 0.1,
        gain: 0.05,
        attack: 0.002,
        at: 0.07,
      });
      voice.noise({
        filter: 'bandpass',
        f: 600,
        to: 3000,
        q: 1,
        dur: 0.25,
        gain: 0.01,
        attack: 0.1,
        at: 0.12,
      });
    },
  },
  'relay.pick': {
    bus: 'UI',
    recipe: (voice) => {
      voice.click({ f: 2600, gain: 0.06 });
      voice.tone({
        type: 'sine',
        f: 740,
        dur: 0.08,
        gain: 0.012,
        attack: 0.003,
      });
    },
  },
  'signal.sweep': {
    bus: 'MECHANICAL',
    minGap: 0.06,
    recipe: (voice) => {
      const frequencyHz = 300 + voice.pitch * 900;
      voice.tone({
        type: 'sine',
        f: frequencyHz,
        to: frequencyHz * 1.12,
        dur: 0.09,
        gain: 0.008,
        attack: 0.01,
      });
      voice.noise({
        filter: 'bandpass',
        f: frequencyHz * 2,
        q: 12,
        dur: 0.1,
        gain: 0.02,
        attack: 0.01,
      });
    },
  },
  'signal.lock': {
    bus: 'MECHANICAL',
    recipe: (voice) => {
      voice.tone({ type: 'sine', f: 660, dur: 0.5, gain: 0.02, attack: 0.005 });
      voice.tone({
        type: 'sine',
        f: 990,
        dur: 0.6,
        gain: 0.016,
        attack: 0.005,
        at: 0.08,
      });
      voice.click({ f: 2600, gain: 0.06 });
    },
  },
  'dish.motor': {
    bus: 'MECHANICAL',
    minGap: 0.07,
    vary: 0.04,
    recipe: (voice) => {
      voice.tone({
        type: 'sawtooth',
        f: 95 * voice.pitch,
        to: 105 * voice.pitch,
        dur: 0.16,
        gain: 0.02,
        attack: 0.02,
        out: lowpass(voice, 900),
      });
      voice.tone({
        type: 'square',
        f: 380 * voice.pitch,
        dur: 0.14,
        gain: 0.003,
        attack: 0.02,
      });
      voice.click({ f: 4200, gain: 0.015, at: 0.13 });
    },
  },
  'dish.lock': {
    bus: 'MECHANICAL',
    recipe: (voice) => {
      voice.tone({
        type: 'sawtooth',
        f: 110,
        to: 60,
        dur: 0.4,
        gain: 0.03,
        attack: 0.01,
        out: lowpass(voice, 700),
      });
      voice.click({ f: 2000, gain: 0.12, at: 0.35 });
      voice.tone({
        type: 'sine',
        f: 70,
        to: 45,
        dur: 0.3,
        gain: 0.1,
        attack: 0.003,
        at: 0.35,
      });
      voice.tone({
        type: 'sine',
        f: 1318.5,
        dur: 0.7,
        gain: 0.012,
        attack: 0.004,
        at: 0.45,
      });
    },
  },
  'trace.blip': {
    bus: 'UI',
    recipe: (voice) => {
      const frequencyHz = 880 * voice.pitch;
      voice.tone({
        type: 'sine',
        f: frequencyHz,
        dur: 0.16,
        gain: 0.03,
        attack: 0.003,
      });
      voice.tone({
        type: 'sine',
        f: frequencyHz * 2,
        dur: 0.08,
        gain: 0.008,
        attack: 0.003,
        at: 0.02,
      });
    },
  },
  'trace.extrapolate': {
    bus: 'UI',
    recipe: (voice) => {
      voice.tone({
        type: 'sine',
        f: 440,
        to: 1760,
        dur: 2.2,
        gain: 0.016,
        attack: 0.3,
      });
      voice.noise({
        filter: 'bandpass',
        f: 800,
        to: 5000,
        q: 6,
        dur: 2.2,
        gain: 0.012,
        attack: 1,
      });
    },
  },
  'sting.boundary': {
    bus: 'PORTAL',
    recipe: (voice) => {
      // The track crosses the portal boundary and doesn't come back: a hollow drop, a ring that bends flat.
      voice.tone({
        type: 'sine',
        f: 49,
        to: 31,
        dur: 4,
        gain: 0.14,
        attack: 0.02,
      });
      voice.noise({
        filter: 'bandpass',
        f: 2600,
        to: 240,
        q: 4,
        dur: 2.6,
        gain: 0.04,
        attack: 0.01,
      });
      for (const [callback, depth] of [
        [587.3, 0],
        [880, 0.12],
        [1174.7, 0.24],
      ] as const)
        voice.tone({
          type: 'sine',
          f: callback,
          to: callback * 0.94,
          dur: 3.2,
          gain: 0.014,
          attack: 0.02,
          at: depth,
        });
      voice.tone({
        type: 'sine',
        f: 1975,
        to: 1580,
        dur: 3,
        gain: 0.004,
        attack: 0.4,
        at: 0.3,
      });
    },
  },
  'sting.found': {
    bus: 'UI',
    recipe: (voice) => {
      [523.3, 659.3, 784].forEach((frequencyHz, index) =>
        voice.tone({
          type: 'sine',
          f: frequencyHz,
          dur: 1.2,
          gain: 0.016,
          attack: 0.02,
          at: index * 0.12,
        }),
      );
      voice.tone({
        type: 'sine',
        f: 1046.5,
        dur: 1.4,
        gain: 0.006,
        attack: 0.04,
        at: 0.36,
      });
    },
  },
  'sting.empty': {
    bus: 'CHARACTER',
    recipe: (voice) => {
      voice.tone({
        type: 'sine',
        f: 392,
        to: 370,
        dur: 2.2,
        gain: 0.016,
        attack: 0.05,
      });
      voice.tone({
        type: 'sine',
        f: 466.2,
        to: 440,
        dur: 2.2,
        gain: 0.012,
        attack: 0.05,
        at: 0.25,
      });
      voice.tone({ type: 'sine', f: 58, dur: 2, gain: 0.04, attack: 0.2 });
    },
  },
  'sting.complete': {
    bus: 'UI',
    recipe: (voice) => {
      [392, 523.3, 659.3, 784].forEach((frequencyHz, index) =>
        voice.tone({
          type: 'triangle',
          f: frequencyHz,
          dur: 1,
          gain: 0.012,
          attack: 0.01,
          at: index * 0.09,
        }),
      );
    },
  },
  'world.debris': {
    bus: 'AMBIENCE',
    minGap: 0.3,
    vary: 0.2,
    recipe: (voice) => {
      for (let index = 0; index < 5; index++)
        voice.noise({
          filter: 'bandpass',
          f: randomBetween(600, 2400),
          q: 3,
          dur: 0.05,
          gain: 0.015,
          attack: 0.002,
          at: index * randomBetween(0.05, 0.2),
        });
      voice.tone({
        type: 'sine',
        f: 70,
        to: 40,
        dur: 0.5,
        gain: 0.02,
        attack: 0.01,
      });
    },
  },
} satisfies Record<string, SoundDefinition>;

/**
 * Registered one-shot sound-effect identifier.
 */
export type SfxName = keyof typeof DEFS;
export const SFX_NAMES = Object.keys(DEFS) as SfxName[];

const lowpass = (value: SynthVoice, frequencyHz: number) => {
  const node = value.ctx.createBiquadFilter();
  node.type = 'lowpass';
  node.frequency.value = frequencyHz;
  node.connect(value.out);
  return node;
};
const bandpass = (
  value: SynthVoice,
  frequencyHz: number,
  resonance: number,
) => {
  const node = value.ctx.createBiquadFilter();
  node.type = 'bandpass';
  node.frequency.value = frequencyHz;
  node.Q.value = resonance;
  node.connect(value.out);
  return node;
};

// ------------------------------------------------------------------ beds

/**
 * Owned nodes used by an ambient bed.
 */
type AmbientBedParts = { stop: () => void };
/**
 * Synthesizer instructions used to construct an ambient bed.
 */
type AmbientBedRecipe = (
  audioContext: AudioContext,
  out: GainNode,
  key: AmbientBedKit,
) => AmbientBedParts;
/**
 * Shared primitives supplied to ambient bed recipes.
 */
type AmbientBedKit = {
  loopNoise(offset: {
    brown?: boolean;
    filter: BiquadFilterType;
    f: number;
    q?: number;
    gain: number;
    out?: AudioNode;
  }): { filter: BiquadFilterNode; gain: GainNode };
  osc(offset: {
    type?: OscillatorType;
    f: number;
    gain: number;
    out?: AudioNode;
  }): { osc: OscillatorNode; gain: GainNode };
  /** Slow LFO onto a param, `depth` around its current value. */
  lfo(param: AudioParam, rate: number, depth: number): void;
  /** Random one-shot events into the bed while it runs. */
  every(min: number, max: number, fn: (value: SynthVoice) => void): void;
};

const BEDS = {
  // Phase 2: wind off the bay, water slapping the harbour wall, a far buoy bell and old metal.
  harbour: {
    bus: 'AMBIENCE',
    recipe: (_c, _o, key) => {
      const wind = key.loopNoise({
        brown: true,
        filter: 'lowpass',
        f: 420,
        gain: 0.32,
      });
      key.lfo(wind.filter.frequency, 0.07, 180);
      key.lfo(wind.gain.gain, 0.11, 0.12);
      const gust = key.loopNoise({
        filter: 'bandpass',
        f: 900,
        q: 1.2,
        gain: 0.012,
      });
      key.lfo(gust.gain.gain, 0.05, 0.011);
      key.lfo(gust.filter.frequency, 0.09, 350);
      const water = key.loopNoise({
        brown: true,
        filter: 'bandpass',
        f: 520,
        q: 0.9,
        gain: 0.12,
      });
      key.lfo(water.gain.gain, 0.43, 0.1);
      key.lfo(water.filter.frequency, 0.29, 160);
      const lap = key.loopNoise({
        filter: 'bandpass',
        f: 1600,
        q: 1.5,
        gain: 0.008,
      });
      key.lfo(lap.gain.gain, 0.61, 0.007);
      key.every(5, 11, (voice) => {
        for (let index = 0; index < 2; index++)
          voice.noise({
            filter: 'bandpass',
            f: randomBetween(500, 900),
            q: 1.2,
            dur: randomBetween(0.5, 0.9),
            gain: 0.035,
            attack: 0.12,
            at: index * randomBetween(0.3, 0.6),
            brown: true,
          });
      });
      key.every(12, 22, (voice) => {
        const frequencyHz = randomBetween(380, 420);
        for (const [mesh, group] of [
          [1, 0.008],
          [2.76, 0.004],
          [5.4, 0.002],
        ] as const)
          voice.tone({
            type: 'sine',
            f: frequencyHz * mesh,
            dur: 3.5,
            gain: group,
            attack: 0.005,
          });
      });
      key.every(14, 26, (voice) => {
        const band = bandpass(voice, randomBetween(500, 900), 8);
        voice.tone({
          type: 'sawtooth',
          f: randomBetween(30, 45),
          to: randomBetween(50, 70),
          dur: randomBetween(1, 1.8),
          gain: 0.02,
          attack: 0.3,
          out: band,
        });
      });
      return { stop: () => undefined };
    },
  },
  // Baymax's combat program idling under the shell: low, red, patient.
  'combat-hum': {
    bus: 'CHARACTER',
    recipe: (audioContext, out, key) => {
      const filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 340;
      filter.Q.value = 3;
      filter.connect(out);
      for (const frequencyHz of [55, 55.4, 82.6])
        key.osc({ type: 'sawtooth', f: frequencyHz, gain: 0.025, out: filter });
      key.lfo(filter.frequency, 0.3, 90);
      key.every(3, 6, (voice) =>
        voice.tone({
          type: 'sine',
          f: 2350,
          dur: 0.05,
          gain: 0.002,
          attack: 0.003,
        }),
      );
      return { stop: () => undefined };
    },
  },
  // Phase 3: the board on the apron. Mains hum from the rig, a thin electronics whine, data chatter.
  board: {
    bus: 'MECHANICAL',
    recipe: (_c, _o, key) => {
      key.osc({ type: 'sine', f: 60, gain: 0.02 });
      key.osc({ type: 'sine', f: 120, gain: 0.012 });
      key.osc({ type: 'triangle', f: 180, gain: 0.003 });
      const whine = key.osc({ type: 'sine', f: 7200, gain: 0.0012 });
      key.lfo(whine.osc.frequency, 0.2, 30);
      const fan = key.loopNoise({
        filter: 'bandpass',
        f: 1400,
        q: 0.7,
        gain: 0.012,
      });
      key.lfo(fan.gain.gain, 0.17, 0.003);
      key.every(1.2, 3.5, (voice) => {
        const count = 1 + Math.floor(Math.random() * 3);
        for (let index = 0; index < count; index++)
          voice.tone({
            type: 'sine',
            f: randomBetween(1800, 3600),
            dur: 0.04,
            gain: 0.003,
            attack: 0.002,
            at: index * 0.07,
          });
      });
      return { stop: () => undefined };
    },
  },
  // Phase 4 walk: gusting street wind, a far city rumble, things settling in the rubble.
  street: {
    bus: 'AMBIENCE',
    recipe: (_c, _o, key) => {
      const wind = key.loopNoise({
        brown: true,
        filter: 'lowpass',
        f: 600,
        gain: 0.3,
      });
      key.lfo(wind.filter.frequency, 0.09, 300);
      key.lfo(wind.gain.gain, 0.13, 0.16);
      const whistle = key.loopNoise({
        filter: 'bandpass',
        f: 1250,
        q: 9,
        gain: 0.01,
      });
      key.lfo(whistle.gain.gain, 0.07, 0.009);
      key.lfo(whistle.filter.frequency, 0.05, 200);
      const rumble = key.loopNoise({
        brown: true,
        filter: 'lowpass',
        f: 90,
        gain: 0.25,
      });
      key.lfo(rumble.gain.gain, 0.03, 0.08);
      key.every(6, 14, (voice) => {
        for (let index = 0; index < 4; index++)
          voice.noise({
            filter: 'bandpass',
            f: randomBetween(700, 2400),
            q: 3,
            dur: 0.05,
            gain: 0.012,
            attack: 0.002,
            at: index * randomBetween(0.06, 0.22),
          });
      });
      key.every(16, 30, (voice) => {
        voice.tone({
          type: 'sine',
          f: 60,
          to: 34,
          dur: 2.5,
          gain: 0.03,
          attack: 0.05,
        });
        voice.noise({
          filter: 'lowpass',
          f: 400,
          to: 90,
          dur: 2,
          gain: 0.04,
          attack: 0.1,
          brown: true,
        });
      });
      return { stop: () => undefined };
    },
  },
  // The live service cable: a buzzing feed with crackle. Place it with handle.place().
  'cable-live': {
    bus: 'MECHANICAL',
    recipe: (audioContext, out, key) => {
      const band = audioContext.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 300;
      band.Q.value = 1.4;
      band.connect(out);
      key.osc({ type: 'sawtooth', f: 100, gain: 0.05, out: band });
      key.osc({ type: 'square', f: 200.6, gain: 0.012, out: band });
      key.lfo(band.frequency, 2.3, 60);
      key.every(0.25, 1.6, (voice) => {
        const count = 1 + Math.floor(Math.random() * 4);
        for (let index = 0; index < count; index++)
          voice.noise({
            filter: 'highpass',
            f: randomBetween(2000, 4500),
            dur: randomBetween(0.005, 0.018),
            gain: randomBetween(0.02, 0.06),
            attack: 0.0008,
            at: index * randomBetween(0.01, 0.05),
          });
      });
      return { stop: () => undefined };
    },
  },
  // Phase 4 bay: fluorescent hum, the hall's room tone, distant drips, a tube that ticks.
  bay: {
    bus: 'AMBIENCE',
    recipe: (audioContext, out, key) => {
      const ballast = audioContext.createBiquadFilter();
      ballast.type = 'lowpass';
      ballast.frequency.value = 900;
      ballast.connect(out);
      key.osc({ type: 'square', f: 120, gain: 0.012, out: ballast });
      key.osc({ type: 'sine', f: 240, gain: 0.006 });
      const buzz = key.loopNoise({
        filter: 'bandpass',
        f: 3600,
        q: 6,
        gain: 0.004,
      });
      key.lfo(buzz.gain.gain, 0.4, 0.0015);
      const room = key.loopNoise({
        brown: true,
        filter: 'lowpass',
        f: 260,
        gain: 0.14,
      });
      key.lfo(room.gain.gain, 0.05, 0.03);
      const outside = key.loopNoise({
        brown: true,
        filter: 'lowpass',
        f: 160,
        gain: 0.08,
      });
      key.lfo(outside.gain.gain, 0.08, 0.05);
      key.every(1.8, 5, (voice) => {
        const frequencyHz = randomBetween(1300, 2200),
          pan = voice.ctx.createStereoPanner();
        pan.pan.value = randomBetween(-0.8, 0.8);
        pan.connect(voice.out);
        voice.tone({
          type: 'sine',
          f: frequencyHz,
          to: frequencyHz * 0.55,
          dur: 0.09,
          gain: 0.012,
          attack: 0.002,
          out: pan,
        });
        voice.tone({
          type: 'sine',
          f: frequencyHz * 0.9,
          to: frequencyHz * 0.5,
          dur: 0.12,
          gain: 0.003,
          attack: 0.002,
          at: 0.16,
          out: pan,
        });
      });
      key.every(7, 18, (voice) => {
        for (let index = 0; index < 3; index++) {
          voice.noise({
            filter: 'bandpass',
            f: 3400,
            q: 3,
            dur: 0.03,
            gain: 0.01,
            attack: 0.002,
            at: index * 0.05,
          });
          voice.tone({
            type: 'square',
            f: 120,
            dur: 0.04,
            gain: 0.006,
            attack: 0.002,
            at: index * 0.05,
          });
        }
      });
      return { stop: () => undefined };
    },
  },
  // Phase 5 relay, on its emergency battery: wind through the broken wall, an inverter whine.
  relay: {
    bus: 'AMBIENCE',
    recipe: (_c, _o, key) => {
      const wind = key.loopNoise({
        brown: true,
        filter: 'lowpass',
        f: 500,
        gain: 0.2,
      });
      key.lfo(wind.filter.frequency, 0.08, 220);
      key.lfo(wind.gain.gain, 0.12, 0.1);
      key.osc({ type: 'sine', f: 4100, gain: 0.0012 });
      key.every(9, 20, (voice) => {
        voice.click({ f: 1800, gain: 0.03 });
        voice.click({ f: 1500, gain: 0.02, at: 0.11 });
      });
      return { stop: () => undefined };
    },
  },
  // …and once the main is closed: mains buzz, server fans, relays chattering.
  'relay-power': {
    bus: 'MECHANICAL',
    recipe: (audioContext, out, key) => {
      const band = audioContext.createBiquadFilter();
      band.type = 'lowpass';
      band.frequency.value = 700;
      band.connect(out);
      key.osc({ type: 'sawtooth', f: 50, gain: 0.02, out: band });
      key.osc({ type: 'sawtooth', f: 100.3, gain: 0.01, out: band });
      const fans = key.loopNoise({
        filter: 'bandpass',
        f: 1800,
        q: 0.6,
        gain: 0.02,
      });
      key.lfo(fans.filter.frequency, 0.3, 80);
      key.osc({ type: 'sine', f: 240, gain: 0.003 });
      key.every(2, 6, (voice) => {
        const count = 1 + Math.floor(Math.random() * 3);
        for (let index = 0; index < count; index++)
          voice.click({
            f: randomBetween(1600, 2600),
            gain: 0.02,
            at: index * randomBetween(0.06, 0.14),
          });
      });
      return { stop: () => undefined };
    },
  },
} satisfies Record<string, { bus: AudioBus; recipe: AmbientBedRecipe }>;
/**
 * Registered ambient-bed identifier.
 */
export type BedName = keyof typeof BEDS;
export const BED_NAMES = Object.keys(BEDS) as BedName[];

// ------------------------------------------------------------------ engine

const MUTE_KEY = 'lastgate.sfx.muted';
const readMuted = () => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * Plays named synthesized effects and ambient beds through the shared audio engine.
 */
class Sfx {
  private outs = new Map<AudioBus, GainNode>();
  private white: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;
  private last = new Map<string, number>();
  private beds = new Map<
    string,
    { handle: BedHandle; owner: string | null; begin: () => void }
  >();
  private pending = new Set<() => void>();
  private listeners = new Set<() => void>();
  private ear = { x: 0, y: 0, z: 0, rx: 1, ry: 0, rz: 0, set: false };
  private started = false;
  private isMuted = readMuted();

  get muted() {
    return this.isMuted;
  }

  /** Mute or unmute every sfx sound (beds fade, one-shots stop being scheduled). */
  setMuted(muted: boolean) {
    if (muted === this.isMuted) return;
    this.isMuted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      /* storage blocked */
    }
    const audioContext = audioEngine.context;
    if (audioContext)
      for (const group of this.outs.values())
        group.gain.setTargetAtTime(
          muted ? 0 : 1,
          audioContext.currentTime,
          0.08,
        );
    this.listeners.forEach((fn) => fn());
  }
  toggleMute() {
    this.setMuted(!this.isMuted);
  }
  subscribe = (fn: () => void) => {
    this.init();
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getMuted = () => this.isMuted;

  /** Where the ears are, for positional sounds: call each frame with the scene camera. */
  listener(camera: { matrixWorld: { elements: ArrayLike<number> } }) {
    const easedProgress = camera.matrixWorld.elements;
    this.ear.x = easedProgress[12];
    this.ear.y = easedProgress[13];
    this.ear.z = easedProgress[14];
    this.ear.rx = easedProgress[0];
    this.ear.ry = easedProgress[1];
    this.ear.rz = easedProgress[2];
    this.ear.set = true;
  }

  /** Fire a named one-shot. Silent no-op before the first gesture, while muted or while hidden. */
  play(name: SfxName, options: PlayOptions = {}) {
    this.init();
    const def: SoundDefinition = DEFS[name];
    if (!def) return;
    const audioContext = this.live();
    if (!audioContext || this.isMuted) return;
    const now = audioContext.currentTime;
    if (def.minGap && now - (this.last.get(name) ?? -1) < def.minGap) return;
    this.last.set(name, now);
    const out = this.out(def.bus);
    if (!out) return;
    const { pan, gain } = this.spatial(options);
    if (gain < 0.002) return;
    const level = audioContext.createGain(),
      panner = audioContext.createStereoPanner();
    level.gain.value = (def.gain ?? 1) * (options.gain ?? 1) * gain;
    panner.pan.value = pan;
    level.connect(panner);
    panner.connect(out);
    const vary = def.vary ?? 0.03;
    const voice = this.voice(
      audioContext,
      level,
      now + (options.delay ?? 0),
      (options.pitch ?? 1) * (1 + randomBetween(-vary, vary)),
    );
    try {
      def.recipe(voice);
    } catch {
      /* a bad recipe must never break gameplay */
    }
    window.setTimeout(
      () => {
        level.disconnect();
        panner.disconnect();
      },
      ((options.delay ?? 0) + voice.end + 0.3) * 1000,
    );
  }

  /** Start (or return) a keyed ambience bed. `owner` lets a scene stop all of its beds at once. */
  bed(
    name: BedName,
    options: {
      gain?: number;
      fade?: number;
      owner?: string;
      at?: SoundPosition;
      near?: number;
    } = {},
  ): BedHandle {
    this.init();
    const existing = this.beds.get(name);
    if (existing) {
      existing.owner = options.owner ?? existing.owner;
      existing.handle.setGain(options.gain ?? 1, options.fade ?? 1.5);
      return existing.handle;
    }
    const recipe: { bus: AudioBus; recipe: AmbientBedRecipe } = BEDS[name];
    if (!recipe) throw new Error(`unknown bed ${String(name)}`);
    // Outside the opening, nobody sets a narrative mix: give the buses their recovery levels.
    if (audioEngine.currentMix === 'SILENT') audioEngine.applyMix('SHELL', 0.8);
    let level = options.gain ?? 1,
      place = 1,
      pan = 0,
      stopped = false;
    let gain: GainNode | null = null,
      panner: StereoPannerNode | null = null,
      parts: AmbientBedParts | null = null;
    const nodes: AudioNode[] = [],
      timers: number[] = [];
    const begin = () => {
      this.pending.delete(begin);
      const audioContext = this.live(),
        bus = audioContext && this.out(recipe.bus);
      if (stopped || !audioContext || !bus) {
        if (!stopped) this.pending.add(begin);
        return;
      }
      gain = audioContext.createGain();
      gain.gain.value = 0;
      panner = audioContext.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner);
      panner.connect(bus);
      gain.gain.setTargetAtTime(
        level * place,
        audioContext.currentTime,
        Math.max(0.01, (options.fade ?? 2) / 3),
      );
      parts = recipe.recipe(
        audioContext,
        gain,
        this.kit(audioContext, gain, nodes, timers),
      );
    };
    const handle: BedHandle = {
      name,
      setGain: (value, fade = 0.6) => {
        level = value;
        const audioContext = audioEngine.context;
        if (audioContext && gain)
          gain.gain.setTargetAtTime(
            level * place,
            audioContext.currentTime,
            Math.max(0.01, fade / 3),
          );
      },
      place: (at, near = 3) => {
        const scaleFactor = this.spatial({ at, near });
        place = scaleFactor.gain;
        pan = scaleFactor.pan;
        const audioContext = audioEngine.context;
        if (!audioContext || !gain || !panner) return;
        gain.gain.setTargetAtTime(
          level * place,
          audioContext.currentTime,
          0.12,
        );
        panner.pan.setTargetAtTime(pan, audioContext.currentTime, 0.12);
      },
      stop: (fade = 1.2) => {
        if (stopped) return;
        stopped = true;
        this.pending.delete(begin);
        if (this.beds.get(name)?.handle === handle) this.beds.delete(name);
        timers.forEach(clearInterval);
        timers.length = 0;
        const audioContext = audioEngine.context,
          group = gain;
        if (!audioContext || !group) return;
        group.gain.cancelScheduledValues(audioContext.currentTime);
        group.gain.setValueAtTime(group.gain.value, audioContext.currentTime);
        group.gain.linearRampToValueAtTime(0, audioContext.currentTime + fade);
        window.setTimeout(
          () => {
            parts?.stop();
            for (const node of nodes) {
              try {
                (node as AudioScheduledSourceNode).stop?.();
              } catch {
                /* never started */
              }
              node.disconnect();
            }
            group.disconnect();
            panner?.disconnect();
          },
          fade * 1000 + 80,
        );
      },
    };
    if (options.at) handle.place(options.at, options.near);
    this.beds.set(name, { handle, owner: options.owner ?? null, begin });
    begin();
    return handle;
  }
  /** Move a running bed (pan and distance falloff from the listener); no-op if it isn't running. */
  placeBed(name: BedName, at: SoundPosition, near?: number) {
    this.beds.get(name)?.handle.place(at, near);
  }
  stopBed(name: BedName, fade?: number) {
    this.beds.get(name)?.handle.stop(fade);
  }
  stopOwner(owner: string, fade?: number) {
    for (const textValue of [...this.beds.values()])
      if (textValue.owner === owner) textValue.handle.stop(fade);
  }
  get activeBeds() {
    return [...this.beds.keys()];
  }

  // ---------------------------------------------------------------- internals

  /** One-time wiring: gesture unlock, and following the opening's SOUND toggle. */
  private init() {
    if (this.started) return;
    this.started = true;
    audioEngine.unlockOnFirstGesture();
    const unlock = () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      const audioContext = audioEngine.ensure();
      if (audioContext?.state === 'suspended')
        void audioContext.resume().catch(() => undefined);
      for (const begin of [...this.pending]) begin();
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    // Beds that asked while the tab was hidden start when it comes back.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible')
        for (const begin of [...this.pending]) begin();
    });
    useSceneState.subscribe((state, state2) => {
      if (state.sound !== state2.sound) this.setMuted(!state.sound);
    });
  }

  /** The shared context, only once a gesture has happened and while the page is visible. */
  private live(): AudioContext | null {
    const audioContext =
      audioEngine.context ?? (this.gestured() ? audioEngine.ensure() : null);
    if (!audioContext || document.visibilityState === 'hidden') return null;
    if (audioContext.state === 'suspended')
      void audioContext.resume().catch(() => undefined);
    return audioContext.state === 'closed' ? null : audioContext;
  }
  private gestured() {
    const activation = (
      navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }
    ).userActivation;
    return activation ? activation.hasBeenActive : false;
  }

  private out(bus: AudioBus): GainNode | null {
    let group = this.outs.get(bus);
    if (group) return group;
    const audioContext = audioEngine.context,
      target = audioEngine.bus(bus);
    if (!audioContext || !target) return null;
    group = audioContext.createGain();
    group.gain.value = this.isMuted ? 0 : 1;
    group.connect(target);
    this.outs.set(bus, group);
    return group;
  }

  private spatial(options: PlayOptions) {
    if (!options.at || !this.ear.set) return { pan: options.pan ?? 0, gain: 1 };
    const point = Array.isArray(options.at)
      ? { x: options.at[0], y: options.at[1], z: options.at[2] }
      : (options.at as { x: number; y: number; z: number });
    const deltaX = point.x - this.ear.x,
      deltaY = point.y - this.ear.y,
      deltaZ = point.z - this.ear.z,
      depth = Math.hypot(deltaX, deltaY, deltaZ),
      near = options.near ?? 2.5;
    const side =
      depth > 0.001
        ? (deltaX * this.ear.rx + deltaY * this.ear.ry + deltaZ * this.ear.rz) /
          depth
        : 0;
    return {
      pan: Math.max(-0.85, Math.min(0.85, side * 0.85)),
      gain: depth <= near ? 1 : Math.pow(near / depth, 1.3),
    };
  }

  private buffers(audioContext: AudioContext) {
    if (!this.white || this.white.sampleRate !== audioContext.sampleRate) {
      const count = audioContext.sampleRate * 2;
      this.white = audioContext.createBuffer(1, count, audioContext.sampleRate);
      const width = this.white.getChannelData(0);
      for (let index = 0; index < count; index++)
        width[index] = Math.random() * 2 - 1;
      this.brown = audioContext.createBuffer(
        1,
        count * 2,
        audioContext.sampleRate,
      );
      const secondEntry = this.brown.getChannelData(0);
      let last = 0;
      for (let index2 = 0; index2 < count * 2; index2++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        secondEntry[index2] = last * 3.5;
      }
    }
    return { white: this.white, brown: this.brown! };
  }

  private voice(
    audioContext: AudioContext,
    out: AudioNode,
    startTimeSeconds: number,
    pitch: number,
  ): SynthVoice & { end: number } {
    const { white, brown } = this.buffers(audioContext);
    const voice: SynthVoice & { end: number } = {
      ctx: audioContext,
      t: startTimeSeconds,
      pitch,
      out,
      end: 0,
      tone: ({
        type = 'sine',
        f: frequencyHz,
        to,
        dur: durationSeconds,
        gain,
        attack = 0.01,
        at = 0,
        detune = 0,
        out: dest = out,
      }) => {
        const scaleFactor = startTimeSeconds + at,
          options = audioContext.createOscillator(),
          group = audioContext.createGain();
        options.type = type;
        options.detune.value = detune;
        options.frequency.setValueAtTime(frequencyHz, scaleFactor);
        if (to)
          options.frequency.exponentialRampToValueAtTime(
            Math.max(1, to),
            scaleFactor + durationSeconds,
          );
        group.gain.setValueAtTime(0.0001, scaleFactor);
        group.gain.linearRampToValueAtTime(gain, scaleFactor + attack);
        group.gain.exponentialRampToValueAtTime(
          0.0001,
          scaleFactor + Math.max(durationSeconds, attack + 0.01),
        );
        options.connect(group);
        group.connect(dest);
        options.start(scaleFactor);
        options.stop(scaleFactor + durationSeconds + 0.05);
        options.onended = () => {
          options.disconnect();
          group.disconnect();
        };
        voice.end = Math.max(voice.end, at + durationSeconds);
      },
      noise: ({
        filter = 'bandpass',
        f: frequencyHz,
        to,
        q: resonance = 1,
        dur: durationSeconds,
        gain,
        attack = 0.004,
        at = 0,
        brown: useBrown = false,
        out: dest = out,
      }) => {
        const scaleFactor = startTimeSeconds + at,
          src = audioContext.createBufferSource(),
          fl = audioContext.createBiquadFilter(),
          group = audioContext.createGain(),
          buf = useBrown ? brown : white;
        src.buffer = buf;
        src.playbackRate.value = 0.85 + Math.random() * 0.3;
        fl.type = filter;
        fl.Q.value = resonance;
        fl.frequency.setValueAtTime(frequencyHz, scaleFactor);
        if (to)
          fl.frequency.exponentialRampToValueAtTime(
            Math.max(20, to),
            scaleFactor + durationSeconds,
          );
        group.gain.setValueAtTime(0.0001, scaleFactor);
        group.gain.linearRampToValueAtTime(gain, scaleFactor + attack);
        group.gain.exponentialRampToValueAtTime(
          0.0001,
          scaleFactor + Math.max(durationSeconds, attack + 0.01),
        );
        src.connect(fl);
        fl.connect(group);
        group.connect(dest);
        src.start(
          scaleFactor,
          Math.random() *
            (buf.duration -
              Math.min(buf.duration - 0.01, durationSeconds + 0.1)),
        );
        src.stop(scaleFactor + durationSeconds + 0.05);
        src.onended = () => {
          src.disconnect();
          fl.disconnect();
          group.disconnect();
        };
        voice.end = Math.max(voice.end, at + durationSeconds);
      },
      click: ({
        f: frequencyHz = 3200,
        gain = 0.05,
        at = 0,
        out: dest = out,
      } = {}) =>
        voice.noise({
          filter: 'bandpass',
          f: frequencyHz,
          to: frequencyHz * 0.8,
          q: 3,
          dur: 0.018,
          gain,
          attack: 0.001,
          at,
          out: dest,
        }),
    };
    return voice;
  }

  private kit(
    audioContext: AudioContext,
    out: GainNode,
    nodes: AudioNode[],
    timers: number[],
  ): AmbientBedKit {
    const { white, brown } = this.buffers(audioContext);
    return {
      loopNoise: ({
        brown: useBrown = false,
        filter,
        f: frequencyHz,
        q: resonance = 1,
        gain,
        out: dest = out,
      }) => {
        const src = audioContext.createBufferSource(),
          fl = audioContext.createBiquadFilter(),
          group = audioContext.createGain();
        src.buffer = useBrown ? brown : white;
        src.loop = true;
        src.playbackRate.value = 0.9 + Math.random() * 0.2;
        fl.type = filter;
        fl.frequency.value = frequencyHz;
        fl.Q.value = resonance;
        group.gain.value = gain;
        src.connect(fl);
        fl.connect(group);
        group.connect(dest);
        src.start(
          audioContext.currentTime,
          Math.random() * src.buffer.duration,
        );
        nodes.push(src, fl, group);
        return { filter: fl, gain: group };
      },
      osc: ({ type = 'sine', f: frequencyHz, gain, out: dest = out }) => {
        const options = audioContext.createOscillator(),
          group = audioContext.createGain();
        options.type = type;
        options.frequency.value = frequencyHz;
        group.gain.value = gain;
        options.connect(group);
        group.connect(dest);
        options.start();
        nodes.push(options, group);
        return { osc: options, gain: group };
      },
      lfo: (param, rate, depth) => {
        const options = audioContext.createOscillator(),
          group = audioContext.createGain();
        options.frequency.value = rate * (0.85 + Math.random() * 0.3);
        group.gain.value = depth;
        options.connect(group);
        group.connect(param);
        options.start(audioContext.currentTime + Math.random() * 2);
        nodes.push(options, group);
      },
      every: (min, max, fn) => {
        let next = 0;
        const tick = () => {
          if (
            audioContext.currentTime < next ||
            document.visibilityState === 'hidden'
          )
            return;
          next = audioContext.currentTime + randomBetween(min, max);
          try {
            fn(
              this.voice(
                audioContext,
                out,
                audioContext.currentTime + 0.02,
                1 + randomBetween(-0.05, 0.05),
              ),
            );
          } catch {
            /* keep the bed alive */
          }
        };
        next = audioContext.currentTime + randomBetween(min * 0.3, max);
        timers.push(window.setInterval(tick, 120));
      },
    };
  }
}

export const sfx = new Sfx();
if (import.meta.env.DEV)
  (window as Window & { __lastGateSfx?: Sfx }).__lastGateSfx = sfx;

// ------------------------------------------------------------------ React helpers

/** Keep a bed running while `active`. Returns a ref to its handle (for setGain / place). */
export function useSfxBed(name: BedName, active = true, gain = 1) {
  const handle = useRef<BedHandle | null>(null);
  useEffect(() => {
    if (!active) return;
    const height = sfx.bed(name, { gain });
    handle.current = height;
    return () => {
      height.stop();
      if (handle.current === height) handle.current = null;
    };
  }, [name, active]);
  useEffect(() => {
    handle.current?.setGain(gain, 1);
  }, [gain]);
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
    const target = (event: Event) => {
      const el = (event.target as Element | null)?.closest?.(
        'button, [role="button"], [role="radio"], a[href]',
      );
      if (
        !el ||
        (el as HTMLButtonElement).disabled ||
        el.closest('[data-sfx="none"], [inert]')
      )
        return null;
      return el;
    };
    const over = (event: PointerEvent) => {
      const el = target(event);
      if (el && el !== hovered) sfx.play('ui.hover');
      hovered = el;
    };
    const click = (event: MouseEvent) => {
      const el = target(event);
      if (!el) return;
      const named = el.closest('[data-sfx]')?.getAttribute('data-sfx');
      sfx.play(named && named in DEFS ? (named as SfxName) : 'ui.click');
    };
    document.addEventListener('pointerover', over, true);
    document.addEventListener('click', click, true);
    return () => {
      document.removeEventListener('pointerover', over, true);
      document.removeEventListener('click', click, true);
    };
  }, [active]);
}

/** Closest point on a polyline (for placing a bed along a cable). Writes into `out`. */
export function nearestOnPath(
  points: readonly (readonly [number, number, number])[],
  xPosition: number,
  yPosition: number,
  zPosition: number,
  out: [number, number, number],
) {
  let best = Infinity;
  for (let index = 0; index < points.length - 1; index++) {
    const firstValue = points[index],
      secondValue = points[index + 1],
      abx = secondValue[0] - firstValue[0],
      aby = secondValue[1] - firstValue[1],
      abz = secondValue[2] - firstValue[2];
    const len = abx * abx + aby * aby + abz * abz || 1;
    const startTimeSeconds = Math.max(
      0,
      Math.min(
        1,
        ((xPosition - firstValue[0]) * abx +
          (yPosition - firstValue[1]) * aby +
          (zPosition - firstValue[2]) * abz) /
          len,
      ),
    );
    const px = firstValue[0] + abx * startTimeSeconds,
      py = firstValue[1] + aby * startTimeSeconds,
      pz = firstValue[2] + abz * startTimeSeconds,
      depth =
        (px - xPosition) ** 2 + (py - yPosition) ** 2 + (pz - zPosition) ** 2;
    if (depth < best) {
      best = depth;
      out[0] = px;
      out[1] = py;
      out[2] = pz;
    }
  }
  return out;
}
