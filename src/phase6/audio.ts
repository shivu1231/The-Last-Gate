/**
 * Phase 6 sound, all synthesized: the switch click, his jets (and their stutter under the limit),
 * heavy footfalls, the fall, the frame's hum, the gate opening, and the boot chime. It starts on
 * the first gesture and closes with the phase.
 *
 * The chase has its own layers: Hiro's footsteps, a heartbeat that quickens as Baymax closes, a low
 * servo drone that grows with his nearness, falling debris, near-miss swings and the warp of the
 * crossing. Each is one method, so a shared sound engine can take any of them over later.
 */
import { sfx } from '../audio/sfx';

export class PhaseSixAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private jet: GainNode | null = null;
  private jetFilter: BiquadFilterNode | null = null;
  private hum: GainNode | null = null;
  private air: GainNode | null = null;
  private calm: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private near: GainNode | null = null;
  private nextBeat = 0;
  private unsubscribeMute: (() => void) | null = null;

  private syncMute = () => {
    if (this.ctx && this.master)
      this.master.gain.setTargetAtTime(
        sfx.getMuted() ? 0 : 0.5,
        this.ctx.currentTime,
        0.025,
      );
  };

  unlock() {
    if (this.ctx) {
      void this.ctx.resume().catch(() => undefined);
      return;
    }
    try {
      const audioContext = new AudioContext();
      this.ctx = audioContext;
      this.master = audioContext.createGain();
      this.master.gain.value = sfx.getMuted() ? 0 : 0.5;
      this.master.connect(audioContext.destination);
      this.unsubscribeMute = sfx.subscribe(this.syncMute);
      const buf = audioContext.createBuffer(
          1,
          audioContext.sampleRate * 3,
          audioContext.sampleRate,
        ),
        depth2 = buf.getChannelData(0);
      for (let index = 0; index < depth2.length; index++)
        depth2[index] = Math.random() * 2 - 1;
      this.noise = buf;
      const loop = (filter: BiquadFilterNode, gain: GainNode) => {
        const src = audioContext.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.master!);
        src.start();
      };
      // Jets: band-limited roar.
      this.jet = audioContext.createGain();
      this.jet.gain.value = 0;
      this.jetFilter = audioContext.createBiquadFilter();
      this.jetFilter.type = 'bandpass';
      this.jetFilter.frequency.value = 520;
      this.jetFilter.Q.value = 0.5;
      loop(this.jetFilter, this.jet);
      // City air, and the quiet water on the other side.
      this.air = audioContext.createGain();
      this.air.gain.value = 0.05;
      const airF = audioContext.createBiquadFilter();
      airF.type = 'lowpass';
      airF.frequency.value = 380;
      loop(airF, this.air);
      // Home (tracker S-08): soft harbour water that swells and falls, under a slow warm chord, instead of a flat hiss.
      this.calm = audioContext.createGain();
      this.calm.gain.value = 0;
      const waves = audioContext.createGain(),
        waveF = audioContext.createBiquadFilter();
      waveF.type = 'lowpass';
      waveF.frequency.value = 520;
      waveF.Q.value = 0.2;
      waves.gain.value = 0.55;
      loop(waveF, waves);
      waves.disconnect();
      waves.connect(this.calm);
      const swell = audioContext.createOscillator(),
        swellDepth = audioContext.createGain();
      swell.frequency.value = 0.11;
      swellDepth.gain.value = 0.4;
      swell.connect(swellDepth);
      swellDepth.connect(waves.gain);
      swell.start();
      const pad = audioContext.createGain(),
        padF = audioContext.createBiquadFilter();
      padF.type = 'lowpass';
      padF.frequency.value = 900;
      pad.gain.value = 0.5;
      padF.connect(pad);
      pad.connect(this.calm);
      for (const [callback, value] of [
        [146.83, 0.3],
        [220, 0.22],
        [277.18, 0.14],
        [329.63, 0.1],
      ] as const) {
        const options = audioContext.createOscillator(),
          group = audioContext.createGain(),
          lfo = audioContext.createOscillator(),
          depth = audioContext.createGain();
        options.type = 'triangle';
        options.frequency.value = callback;
        group.gain.value = value;
        lfo.frequency.value = 0.05 + callback / 4000;
        depth.gain.value = value * 0.45;
        lfo.connect(depth);
        depth.connect(group.gain);
        options.connect(group);
        group.connect(padF);
        options.start();
        lfo.start();
      }
      this.calm.connect(this.master);
      // The frame's hum: two close low tones beating slowly.
      this.hum = audioContext.createGain();
      this.hum.gain.value = 0;
      this.hum.connect(this.master);
      for (const factor of [55, 55.7, 110.4]) {
        const options2 = audioContext.createOscillator();
        options2.frequency.value = factor;
        const group2 = audioContext.createGain();
        group2.gain.value = factor > 100 ? 0.25 : 0.5;
        options2.connect(group2);
        group2.connect(this.hum);
        options2.start();
      }
      // Him, close: a low growling servo drone, filtered saw with a slow wobble.
      this.near = audioContext.createGain();
      this.near.gain.value = 0;
      const nearF = audioContext.createBiquadFilter();
      nearF.type = 'lowpass';
      nearF.frequency.value = 260;
      nearF.connect(this.near);
      this.near.connect(this.master);
      for (const factor2 of [41, 61.5]) {
        const options3 = audioContext.createOscillator();
        options3.type = 'sawtooth';
        options3.frequency.value = factor2;
        const lfo = audioContext.createOscillator(),
          depth = audioContext.createGain();
        lfo.frequency.value = 0.7 + factor2 / 100;
        depth.gain.value = 1.6;
        lfo.connect(depth);
        depth.connect(options3.frequency);
        options3.connect(nearF);
        options3.start();
        lfo.start();
      }
    } catch {
      this.dispose();
    }
  }

  /** Continuous layers, set every frame (smoothed). */
  set(scaleFactor: {
    jet: number;
    sputter: number;
    hum: number;
    air: number;
    calm: number;
    dread?: number;
    near?: number;
  }) {
    const audioContext = this.ctx;
    if (
      !audioContext ||
      !this.jet ||
      !this.hum ||
      !this.air ||
      !this.calm ||
      !this.jetFilter
    )
      return;
    const now = audioContext.currentTime;
    const gate = scaleFactor.sputter > 0 && Math.random() < 0.35 ? 0.1 : 1;
    this.jet.gain.setTargetAtTime(
      scaleFactor.jet * 0.55 * gate,
      now,
      scaleFactor.sputter > 0 ? 0.02 : 0.12,
    );
    this.jetFilter.frequency.setTargetAtTime(
      380 + scaleFactor.jet * 600,
      now,
      0.2,
    );
    this.hum.gain.setTargetAtTime(scaleFactor.hum * 0.16, now, 0.4);
    this.air.gain.setTargetAtTime(scaleFactor.air * 0.06, now, 0.8);
    this.calm.gain.setTargetAtTime(scaleFactor.calm * 0.11, now, 1.8);
    this.near?.gain.setTargetAtTime((scaleFactor.near ?? 0) * 0.22, now, 0.25);
    // Heartbeat: lub-dub, quicker and louder as the dread rises.
    const dread = scaleFactor.dread ?? 0;
    if (dread > 0.05 && now >= this.nextBeat) {
      const level = 0.25 + dread * 0.55;
      this.tone('sine', 62, 38, 0.16, level * 0.6);
      this.tone('sine', 58, 36, 0.14, level * 0.42, 0.17);
      this.nextBeat = now + 60 / (72 + dread * 84);
    } else if (dread <= 0.05) this.nextBeat = now;
  }

  private tone(
    type: OscillatorType,
    scalarValue: number,
    scalarValue2: number,
    durationSeconds: number,
    level: number,
    at = 0,
    attack = 0.005,
  ) {
    const audioContext = this.ctx;
    if (!audioContext || !this.master) return;
    const timeSeconds = audioContext.currentTime + at,
      options = audioContext.createOscillator(),
      group = audioContext.createGain();
    options.type = type;
    options.frequency.setValueAtTime(scalarValue, timeSeconds);
    options.frequency.exponentialRampToValueAtTime(
      Math.max(1, scalarValue2),
      timeSeconds + durationSeconds,
    );
    group.gain.setValueAtTime(0.0001, timeSeconds);
    group.gain.linearRampToValueAtTime(level, timeSeconds + attack);
    group.gain.exponentialRampToValueAtTime(
      0.0001,
      timeSeconds + durationSeconds,
    );
    options.connect(group);
    group.connect(this.master);
    options.start(timeSeconds);
    options.stop(timeSeconds + durationSeconds + 0.05);
  }
  private burst(
    frequencyHz: number,
    resonance: number,
    durationSeconds: number,
    level: number,
    type: BiquadFilterType = 'bandpass',
    at = 0,
  ) {
    const audioContext = this.ctx;
    if (!audioContext || !this.master || !this.noise) return;
    const timeSeconds = audioContext.currentTime + at,
      src = audioContext.createBufferSource(),
      callback = audioContext.createBiquadFilter(),
      group = audioContext.createGain();
    src.buffer = this.noise;
    callback.type = type;
    callback.frequency.value = frequencyHz;
    callback.Q.value = resonance;
    group.gain.setValueAtTime(level, timeSeconds);
    group.gain.exponentialRampToValueAtTime(
      0.0001,
      timeSeconds + durationSeconds,
    );
    src.connect(callback);
    callback.connect(group);
    group.connect(this.master);
    src.start(timeSeconds, Math.random());
    src.stop(timeSeconds + durationSeconds + 0.05);
  }

  click() {
    this.burst(4200, 2, 0.035, 0.5, 'highpass');
    this.tone('square', 2400, 1800, 0.03, 0.05);
    this.burst(900, 4, 0.06, 0.15, 'bandpass', 0.012);
  }
  snap() {
    this.burst(2600, 1.5, 0.05, 0.55, 'highpass');
    this.tone('triangle', 900, 500, 0.06, 0.06);
  }
  step(level: number) {
    this.tone('sine', 70, 34, 0.35, 0.5 * level);
    this.burst(160, 0.8, 0.18, 0.4 * level, 'lowpass');
  }
  impact() {
    this.tone('sine', 62, 22, 1.6, 0.9);
    this.burst(220, 0.6, 1.4, 0.9, 'lowpass');
    this.burst(1600, 0.7, 0.5, 0.25, 'bandpass', 0.02);
    this.tone('sawtooth', 48, 30, 0.5, 0.12);
  }
  ignite() {
    this.burst(300, 0.5, 0.7, 0.35, 'lowpass');
    this.tone('sawtooth', 80, 160, 0.6, 0.05);
  }
  seat() {
    this.tone('sine', 520, 760, 0.25, 0.12);
    this.burst(3000, 2, 0.03, 0.3, 'highpass');
  }
  /** Fist bump: a soft knock of knuckles on vinyl, then Baymax's little falling ba-la-la-la. */
  bump() {
    this.tone('sine', 140, 70, 0.16, 0.22);
    this.burst(700, 1.2, 0.07, 0.22, 'lowpass');
    [880, 784, 698, 587].forEach((hz, index) =>
      this.tone('triangle', hz, hz * 0.97, 0.11, 0.05, 0.28 + index * 0.12),
    );
  }
  contact() {
    this.burst(5200, 3, 0.08, 0.25, 'highpass');
    this.tone('sine', 660, 990, 0.18, 0.06);
  }
  /** The gate trying and failing: a rising hum that catches, then drops out. */
  falter() {
    this.tone('sine', 90, 340, 0.7, 0.07);
    this.tone('sawtooth', 340, 60, 0.5, 0.03, 0.7);
    this.burst(700, 0.5, 0.9, 0.2, 'lowpass', 0.6);
  }
  bloom() {
    this.burst(400, 0.4, 2.6, 0.35, 'lowpass');
    [392, 494, 587, 784].forEach((factor, index) =>
      this.tone('sine', factor, factor * 1.002, 2.4, 0.05, index * 0.14, 0.4),
    );
  }
  /** Hiro's footfall on paving: a scuff, heavier and sharper when he runs. */
  footstep(side: -1 | 1, speed: number) {
    const run = Math.min(1, speed / 4.5);
    this.burst(
      side > 0 ? 520 : 470,
      0.9,
      0.07 + run * 0.04,
      0.08 + run * 0.12,
      'lowpass',
    );
    this.burst(2400, 1.2, 0.025, 0.02 + run * 0.05, 'bandpass', 0.01);
  }
  /** A swing that misses: air torn past the ear. */
  whoosh() {
    const audioContext = this.ctx;
    if (!audioContext || !this.master || !this.noise) return;
    const timeSeconds = audioContext.currentTime,
      src = audioContext.createBufferSource(),
      callback = audioContext.createBiquadFilter(),
      group = audioContext.createGain();
    src.buffer = this.noise;
    callback.type = 'bandpass';
    callback.Q.value = 1.4;
    callback.frequency.setValueAtTime(300, timeSeconds);
    callback.frequency.exponentialRampToValueAtTime(2200, timeSeconds + 0.18);
    callback.frequency.exponentialRampToValueAtTime(500, timeSeconds + 0.42);
    group.gain.setValueAtTime(0.0001, timeSeconds);
    group.gain.linearRampToValueAtTime(0.55, timeSeconds + 0.12);
    group.gain.exponentialRampToValueAtTime(0.0001, timeSeconds + 0.45);
    src.connect(callback);
    callback.connect(group);
    group.connect(this.master);
    src.start(timeSeconds, Math.random());
    src.stop(timeSeconds + 0.5);
  }
  /** Concrete coming down: a thud, grit, and a few skittering bits after. */
  crash(level = 1) {
    this.tone('sine', 80, 30, 0.7, 0.6 * level);
    this.burst(260, 0.6, 0.8, 0.7 * level, 'lowpass');
    this.burst(1800, 0.8, 0.35, 0.25 * level, 'bandpass', 0.02);
    [0.12, 0.2, 0.31].forEach((depth) =>
      this.burst(3200, 2, 0.05, 0.1 * level, 'highpass', depth),
    );
  }
  /** His arm motors driving a swing. */
  servo() {
    this.tone('sawtooth', 140, 420, 0.35, 0.05);
    this.tone('square', 70, 210, 0.35, 0.025);
  }
  /** The crossing: a swell that rises through the surface and tears. */
  warp() {
    this.burst(500, 0.4, 1.6, 0.35, 'lowpass');
    this.tone('sine', 110, 880, 1.2, 0.08, 0, 0.5);
    this.tone('triangle', 220, 1760, 1, 0.03, 0.15, 0.4);
    this.burst(4000, 1, 0.4, 0.15, 'highpass', 0.9);
  }
  /** His boot chime: four soft rising notes. */
  chime() {
    [659.3, 830.6, 987.8, 1318.5].forEach((factor, index) => {
      this.tone('triangle', factor, factor, 1.6, 0.09, index * 0.16, 0.02);
      this.tone('sine', factor * 2, factor * 2, 1.1, 0.025, index * 0.16, 0.02);
    });
  }

  dispose() {
    this.unsubscribeMute?.();
    this.unsubscribeMute = null;
    if (this.ctx && this.ctx.state !== 'closed')
      void this.ctx.close().catch(() => undefined);
    this.ctx = null;
    this.master = null;
  }
}
