import type { Phase } from '../state/SceneStateManager';

/**
 * Nodes and timing for one opening atmospheric layer.
 */
type AudioLayer = { gain: GainNode; level: number };
const smooth = (inputValue: number, startValue: number, endValue: number) => {
  const xPosition = Math.max(
    0,
    Math.min(1, (inputValue - startValue) / (endValue - startValue)),
  );
  return xPosition * xPosition * (3 - 2 * xPosition);
};

/**
 * Original, synthesized sound only. Silence is used as deliberately as noise: continuous
 * layers are mixed per phase, one-shots are authored to the frame they belong to.
 */
import { audioEngine } from './AudioMix';

/**
 * Schedules the opening atmospheric layers and responds to its authored state changes.
 */
export class AudioDirector {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private ears: BiquadFilterNode | null = null;
  private world: GainNode | null = null;
  private pressure: GainNode | null = null;
  private breath: GainNode | null = null;
  private layers: Record<
    'hum' | 'red' | 'thrust' | 'corridor' | 'align' | 'ring',
    AudioLayer
  > | null = null;
  private alignOsc: OscillatorNode | null = null;
  private redLfo: GainNode | null = null;
  private corridorOsc: OscillatorNode[] = [];
  private noise: AudioBuffer | null = null;
  private nextEvent = 9;
  private enabled = false;
  private lastMix = 0;
  private nextTick = 0;
  async setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (enabled && !this.ctx) this.create();
    if (!this.ctx || !this.master) return;
    if (enabled) await this.ctx.resume();
    this.master.gain.setTargetAtTime(
      enabled ? 0.34 : 0,
      this.ctx.currentTime,
      0.25,
    );
  }
  private create() {
    // Shared context + mix bus (AudioMix): narrative snapshots, silence beats and cleanup apply here too.
    const audioContext = audioEngine.ensure();
    if (!audioContext) throw new Error('Web Audio unavailable');
    this.ctx = audioContext;
    this.master = audioContext.createGain();
    this.master.gain.value = 0;
    const comp = audioContext.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    this.ears = audioContext.createBiquadFilter();
    this.ears.type = 'lowpass';
    this.ears.frequency.value = 20000;
    this.bus = audioContext.createGain();
    this.bus.connect(this.ears);
    this.ears.connect(comp);
    comp.connect(this.master);
    this.master.connect(audioEngine.bus('LEGACY')!);
    const buffer = audioContext.createBuffer(
        1,
        audioContext.sampleRate * 6,
        audioContext.sampleRate,
      ),
      data = buffer.getChannelData(0);
    let last = 0;
    for (let index = 0; index < data.length; index++) {
      last = (last + 0.025 * (Math.random() * 2 - 1)) / 1.025;
      data[index] = last * 3.5;
    }
    const white = audioContext.createBuffer(
        1,
        audioContext.sampleRate * 2,
        audioContext.sampleRate,
      ),
      width = white.getChannelData(0);
    for (let index2 = 0; index2 < width.length; index2++)
      width[index2] = Math.random() * 2 - 1;
    this.noise = white;
    const loop = (buf: AudioBuffer) => {
      const state = audioContext.createBufferSource();
      state.buffer = buf;
      state.loop = true;
      state.start();
      return state;
    };
    // Portal air.
    const wind = loop(buffer),
      filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 430;
    this.world = audioContext.createGain();
    this.world.gain.value = 0.19;
    wind.connect(filter);
    filter.connect(this.world);
    this.world.connect(this.bus);
    // Hiro's breathing: band-limited air, gently modulated.
    const breathSource = loop(buffer),
      breathFilter = audioContext.createBiquadFilter();
    breathFilter.type = 'bandpass';
    breathFilter.frequency.value = 560;
    breathFilter.Q.value = 0.6;
    this.breath = audioContext.createGain();
    this.breath.gain.value = 0.055;
    breathSource.connect(breathFilter);
    breathFilter.connect(this.breath);
    this.breath.connect(this.bus);
    const breathLfo = audioContext.createOscillator(),
      breathDepth = audioContext.createGain();
    breathLfo.frequency.value = 0.18;
    breathDepth.gain.value = 0.045;
    breathLfo.connect(breathDepth);
    breathDepth.connect(this.breath.gain);
    breathLfo.start();
    this.pressure = audioContext.createGain();
    this.pressure.gain.value = 0.012;
    this.pressure.connect(this.bus);
    for (const frequencyHz of [42, 63.07, 84.02]) {
      const options = audioContext.createOscillator(),
        group = audioContext.createGain();
      options.frequency.value = frequencyHz;
      group.gain.value = 0.6;
      options.connect(group);
      group.connect(this.pressure);
      options.start();
    }
    const layer = (): AudioLayer => {
      const group2 = audioContext.createGain();
      group2.gain.value = 0;
      group2.connect(this.bus!);
      return { gain: group2, level: 0 };
    };
    const value = {
      hum: layer(),
      red: layer(),
      thrust: layer(),
      corridor: layer(),
      align: layer(),
      ring: layer(),
    };
    this.layers = value;
    // Baymax's internal life: two soft partials, the higher one barely there.
    for (const [callback, group3] of [
      [110, 0.6],
      [220.4, 0.18],
      [329.9, 0.05],
    ] as const) {
      const options2 = audioContext.createOscillator(),
        value2 = audioContext.createGain();
      options2.frequency.value = callback;
      value2.gain.value = group3;
      options2.connect(value2);
      value2.connect(value.hum.gain);
      options2.start();
    }
    // Corrupted system hum: detuned saws, low-passed, with a slow targeting tremolo.
    const redFilter = audioContext.createBiquadFilter();
    redFilter.type = 'lowpass';
    redFilter.frequency.value = 380;
    redFilter.Q.value = 4;
    redFilter.connect(value.red.gain);
    this.redLfo = audioContext.createGain();
    this.redLfo.gain.value = 0.5;
    for (const frequencyHz2 of [55, 55.6, 82.5]) {
      const options3 = audioContext.createOscillator();
      options3.type = 'sawtooth';
      options3.frequency.value = frequencyHz2;
      const value3 = audioContext.createGain();
      value3.gain.value = 0.22;
      options3.connect(value3);
      value3.connect(this.redLfo);
      options3.start();
    }
    this.redLfo.connect(redFilter);
    const trem = audioContext.createOscillator(),
      tremDepth = audioContext.createGain();
    trem.frequency.value = 3.2;
    tremDepth.gain.value = 0.25;
    trem.connect(tremDepth);
    tremDepth.connect(this.redLfo.gain);
    trem.start();
    // Thrusters: band noise for the jet, low noise for the body of it.
    const jet = loop(white),
      jetBand = audioContext.createBiquadFilter();
    jetBand.type = 'bandpass';
    jetBand.frequency.value = 1100;
    jetBand.Q.value = 0.7;
    jet.connect(jetBand);
    jetBand.connect(value.thrust.gain);
    const body = loop(buffer),
      bodyLow = audioContext.createBiquadFilter();
    bodyLow.type = 'lowpass';
    bodyLow.frequency.value = 160;
    const bodyGain = audioContext.createGain();
    bodyGain.gain.value = 3;
    body.connect(bodyLow);
    bodyLow.connect(bodyGain);
    bodyGain.connect(value.thrust.gain);
    // The corridor: partials that drift against each other, and a thin shimmer above.
    for (const [callback2, group4] of [
      [36.7, 0.5],
      [55.1, 0.35],
      [73.6, 0.22],
      [146.9, 0.07],
    ] as const) {
      const options4 = audioContext.createOscillator(),
        value4 = audioContext.createGain();
      options4.frequency.value = callback2;
      value4.gain.value = group4;
      options4.connect(value4);
      value4.connect(value.corridor.gain);
      options4.start();
      this.corridorOsc.push(options4);
    }
    const shimmer = loop(white),
      hp = audioContext.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6500;
    const sg = audioContext.createGain();
    sg.gain.value = 0.05;
    shimmer.connect(hp);
    hp.connect(sg);
    sg.connect(value.corridor.gain);
    // Alignment tone and post-blast tinnitus.
    this.alignOsc = audioContext.createOscillator();
    this.alignOsc.frequency.value = 440;
    this.alignOsc.connect(value.align.gain);
    this.alignOsc.start();
    const ring = audioContext.createOscillator();
    ring.frequency.value = 3720;
    ring.connect(value.ring.gain);
    ring.start();
  }
  private set(layer: AudioLayer, level: number, time = 0.4) {
    if (!this.ctx || Math.abs(layer.level - level) < 0.0004) return;
    layer.level = level;
    layer.gain.gain.setTargetAtTime(level, this.ctx.currentTime, time);
  }

  /** Called each frame; the mix only updates at ~15 Hz. */
  update(
    progress: number,
    phase: Phase,
    phaseTime: number,
    signals: {
      red: number;
      alignment: number;
      corridor: number;
      collapse: number;
      thrust: number;
    },
  ) {
    if (
      !this.ctx ||
      !this.world ||
      !this.pressure ||
      !this.enabled ||
      !this.layers ||
      !this.breath
    )
      return;
    const audioContext = this.ctx,
      startTimeSeconds = audioContext.currentTime,
      value = this.layers;
    if (startTimeSeconds - this.lastMix > 0.066) {
      this.lastMix = startTimeSeconds;
      const shell = [
        'discovery',
        'inspected',
        'chip-focus',
        'chip-reaching',
        'chip-held',
        'chest-focus',
        'panel-opening',
        'socket-ready',
        'inserting',
      ].includes(phase);
      const silent = phase === 'silence';
      const violent = ['ignition', 'chase', 'fracture', 'pulled'].includes(
        phase,
      );
      // World air recedes as Hiro gets close; it returns, rawer, once the city starts breaking.
      const air = silent
        ? 0.012
        : shell
          ? 0.19 * (1 - progress * 0.88) * 0.7
          : violent
            ? 0.16
            : phase === 'handoff'
              ? 0.02
              : 0.19 * (1 - progress * 0.88);
      this.world.gain.setTargetAtTime(
        air,
        startTimeSeconds,
        silent ? 0.15 : 0.6,
      );
      const press = silent
        ? 0.004
        : phase === 'threat'
          ? 0.004
          : violent
            ? 0.02
            : 0.011 + progress * 0.011;
      this.pressure.gain.setTargetAtTime(press, startTimeSeconds, 0.8);
      this.breath.gain.setTargetAtTime(
        silent
          ? 0.12
          : phase === 'threat'
            ? 0.1
            : violent
              ? 0.13
              : shell
                ? 0.07
                : 0.055,
        startTimeSeconds,
        0.5,
      );
      const hum =
        phase === 'panel-opening'
          ? smooth(phaseTime, 1.4, 3) * 0.01
          : ['socket-ready', 'inserting'].includes(phase)
            ? 0.012
            : phase === 'silence'
              ? 0.002
              : phase === 'booting'
                ? 0.004 + smooth(phaseTime, 1.2, 3) * 0.016
                : phase === 'diagnostic'
                  ? 0.014
                  : phase === 'corrupting'
                    ? 0.014 * (1 - signals.red)
                    : 0;
      this.set(value.hum, hum, 0.5);
      this.set(
        value.red,
        phase === 'corrupting'
          ? signals.red * 0.05
          : phase === 'threat'
            ? 0.06
            : violent && phase !== 'pulled'
              ? 0.035
              : 0,
        phase === 'threat' ? 0.2 : 0.8,
      );
      this.set(
        value.thrust,
        signals.thrust * 0.08 * (phase === 'pulled' ? 0.3 : 1),
        0.15,
      );
      this.set(
        value.corridor,
        phase === 'fracture'
          ? signals.corridor * 0.09
          : phase === 'pulled'
            ? 0.11
            : phase === 'handoff'
              ? 0.05
              : 0,
        0.6,
      );
      this.set(
        value.align,
        phase === 'socket-ready' ? Math.pow(signals.alignment, 1.5) * 0.012 : 0,
        0.08,
      );
      if (this.alignOsc)
        this.alignOsc.frequency.setTargetAtTime(
          440 + signals.alignment * 220,
          startTimeSeconds,
          0.06,
        );
      if (this.redLfo)
        this.redLfo.gain.setTargetAtTime(
          0.35 + signals.red * 0.4,
          startTimeSeconds,
          0.4,
        );
      // Tonal collapse: the corridor partials sag as Hiro is taken through.
      if (phase === 'pulled')
        this.corridorOsc.forEach((options, index) =>
          options.detune.setTargetAtTime(
            -smooth(phaseTime, 1, 4.6) * (700 + index * 150),
            startTimeSeconds,
            0.3,
          ),
        );
      else
        this.corridorOsc.forEach((options) =>
          options.detune.setTargetAtTime(0, startTimeSeconds, 0.5),
        );
      this.set(value.ring, Math.max(0, value.ring.level * 0.94 - 0.0002), 0.05);
    }
    // Targeting logic: ticks that accelerate as corruption takes hold.
    if (
      phase === 'corrupting' &&
      signals.red > 0.25 &&
      startTimeSeconds > this.nextTick
    ) {
      this.nextTick =
        startTimeSeconds + Math.max(0.14, 0.9 - signals.red * 0.8);
      this.tone('sine', 2400, 2300, 0.04, 0.004 * signals.red);
    }
    if (
      !['silence', 'threat'].includes(phase) &&
      startTimeSeconds > this.nextEvent
    ) {
      this.nextEvent = startTimeSeconds + 13.5;
      const tick = progress > 0.8;
      this.tone(
        'triangle',
        tick ? 1300 : 83,
        tick ? 900 : 57,
        tick ? 0.1 : 2.5,
        tick ? 0.002 : 0.005,
        tick ? 0.005 : 0.35,
      );
    }
  }
  updateProgress(progress: number) {
    this.update(progress, 'approaching', 0, {
      red: 0,
      alignment: 0,
      corridor: 0,
      collapse: 0,
      thrust: 0,
    });
  }

  // ------------------------------------------------------------------ primitives
  private out(pan = 0) {
    if (!this.ctx || !this.bus) return null;
    const point = this.ctx.createStereoPanner();
    point.pan.value = Math.max(-1, Math.min(1, pan));
    point.connect(this.bus);
    return point;
  }
  private tone(
    type: OscillatorType,
    scalarValue: number,
    scalarValue2: number,
    durationSeconds: number,
    gain: number,
    attack = 0.01,
    delay = 0,
    pan = 0,
  ) {
    if (!this.ctx || !this.enabled) return;
    const audioContext = this.ctx,
      startTimeSeconds = audioContext.currentTime + delay,
      options = audioContext.createOscillator(),
      group = audioContext.createGain(),
      dest = this.out(pan);
    if (!dest) return;
    options.type = type;
    options.frequency.setValueAtTime(scalarValue, startTimeSeconds);
    options.frequency.exponentialRampToValueAtTime(
      Math.max(1, scalarValue2),
      startTimeSeconds + durationSeconds,
    );
    group.gain.setValueAtTime(0.0001, startTimeSeconds);
    group.gain.linearRampToValueAtTime(gain, startTimeSeconds + attack);
    group.gain.exponentialRampToValueAtTime(
      0.0001,
      startTimeSeconds + durationSeconds,
    );
    options.connect(group);
    group.connect(dest);
    options.start(startTimeSeconds);
    options.stop(startTimeSeconds + durationSeconds + 0.05);
  }
  private burst(
    kind: BiquadFilterType,
    scalarValue: number,
    scalarValue2: number,
    durationSeconds: number,
    gain: number,
    { q: resonance = 1, attack = 0.004, delay = 0, pan = 0 } = {},
  ) {
    if (!this.ctx || !this.enabled || !this.noise) return;
    const audioContext = this.ctx,
      startTimeSeconds = audioContext.currentTime + delay,
      state = audioContext.createBufferSource(),
      callback = audioContext.createBiquadFilter(),
      group = audioContext.createGain(),
      dest = this.out(pan);
    if (!dest) return;
    state.buffer = this.noise;
    state.playbackRate.value = 0.8 + Math.random() * 0.4;
    callback.type = kind;
    callback.Q.value = resonance;
    callback.frequency.setValueAtTime(scalarValue, startTimeSeconds);
    callback.frequency.exponentialRampToValueAtTime(
      Math.max(20, scalarValue2),
      startTimeSeconds + durationSeconds,
    );
    group.gain.setValueAtTime(0.0001, startTimeSeconds);
    group.gain.linearRampToValueAtTime(gain, startTimeSeconds + attack);
    group.gain.exponentialRampToValueAtTime(
      0.0001,
      startTimeSeconds + durationSeconds,
    );
    state.connect(callback);
    callback.connect(group);
    group.connect(dest);
    state.start(startTimeSeconds, Math.random() * 1.2);
    state.stop(startTimeSeconds + durationSeconds + 0.05);
  }
  private click(delay = 0, gain = 0.05, frequencyHz = 3200, pan = 0) {
    this.burst('bandpass', frequencyHz, frequencyHz * 0.8, 0.018, gain, {
      q: 3,
      attack: 0.001,
      delay,
      pan,
    });
  }

  // ------------------------------------------------------------------ authored cues
  failedLink() {
    this.tone('sine', 320, 130, 0.5, 0.04, 0.01);
  }
  shellCue(
    kind:
      | 'grip'
      | 'lift'
      | 'inspect'
      | 'latch'
      | 'release'
      | 'servo'
      | 'present'
      | 'magnet'
      | 'lock'
      | 'seal'
      | 'boot'
      | 'chime'
      | 'line'
      | 'fault'
      | 'wrong'
      | 'lock-on',
  ) {
    if (!this.ctx || !this.enabled) return;
    switch (kind) {
      case 'grip':
        this.click(0, 0.03, 2400);
        this.tone('sine', 90, 70, 0.25, 0.02);
        break;
      case 'lift':
        this.click(0, 0.04, 4200);
        this.tone('triangle', 170, 260, 0.5, 0.012, 0.05);
        this.burst('bandpass', 800, 2600, 0.6, 0.012, { q: 0.8, attack: 0.15 });
        break;
      case 'inspect':
        this.tone('sine', 60, 60, 0.6, 0.006, 0.08);
        this.tone('sine', 1880, 1820, 0.18, 0.003, 0.005, 0.3);
        break;
      case 'latch':
        this.click(0, 0.06, 2600);
        this.click(0.13, 0.05, 2300);
        this.tone('sine', 92, 64, 0.28, 0.03, 0.004, 0.02);
        break;
      case 'release':
        this.burst('bandpass', 4200, 1400, 0.55, 0.022, {
          q: 1.4,
          attack: 0.02,
        });
        this.tone('sine', 140, 110, 0.2, 0.012);
        break;
      case 'servo':
        for (const [depth, callback] of [
          [0, 150],
          [0.35, 175],
          [0.7, 165],
        ] as const) {
          this.tone(
            'sawtooth',
            callback,
            callback * 1.28,
            0.5,
            0.0035,
            0.08,
            depth,
          );
          this.tone(
            'sine',
            callback * 2,
            callback * 2.4,
            0.45,
            0.004,
            0.06,
            depth,
          );
        }
        break;
      case 'present':
        this.tone('sine', 220, 330, 0.9, 0.008, 0.3);
        this.click(0.88, 0.03, 3400);
        break;
      case 'magnet':
        this.burst('lowpass', 600, 180, 0.5, 0.02, { q: 0.7, attack: 0.12 });
        this.tone('sine', 330, 440, 0.35, 0.006, 0.1);
        break;
      case 'lock':
        this.click(0, 0.09, 3000);
        this.click(0.012, 0.05, 5200);
        this.tone('sine', 70, 42, 0.35, 0.06, 0.003);
        this.tone('sine', 1320, 1320, 0.6, 0.007, 0.004, 0.04);
        break;
      case 'seal':
        this.tone('sawtooth', 190, 140, 0.9, 0.003, 0.08);
        this.burst('bandpass', 1800, 600, 0.5, 0.012, {
          q: 1,
          attack: 0.05,
          delay: 0.9,
        });
        this.tone('sine', 95, 70, 0.3, 0.02, 0.004, 1.1);
        break;
      case 'boot':
        this.tone('sine', 110, 220, 1.8, 0.016, 0.6);
        this.tone('sine', 165, 330, 1.8, 0.008, 0.7, 0.1);
        break;
      // A soft, rising three-note wake: familiar warmth, never a quotation.
      case 'chime':
        [523.3, 659.3, 784].forEach((frequencyHz, index) => {
          this.tone(
            'sine',
            frequencyHz,
            frequencyHz,
            1.4,
            0.016,
            0.03,
            index * 0.17,
          );
          this.tone(
            'sine',
            frequencyHz * 2,
            frequencyHz * 2,
            0.7,
            0.003,
            0.02,
            index * 0.17,
          );
        });
        break;
      case 'line':
        this.tone('sine', 1250, 1250, 0.07, 0.006, 0.004);
        break;
      case 'fault':
        this.tone('sine', 330, 311, 0.4, 0.012, 0.006);
        this.tone('sine', 349, 330, 0.4, 0.008, 0.006);
        break;
      // The wake chime bent out of tune: hope going wrong.
      case 'wrong':
        [784, 740, 698].forEach((frequencyHz, index) =>
          this.tone(
            'sine',
            frequencyHz,
            frequencyHz * 0.94,
            1.1,
            0.012,
            0.03,
            index * 0.22,
          ),
        );
        break;
      case 'lock-on':
        this.tone('sine', 46, 34, 2.6, 0.11, 0.01);
        this.tone('sawtooth', 98, 92, 1.4, 0.01, 0.02);
        this.tone('sine', 2300, 2300, 0.09, 0.008, 0.003);
        this.tone('sine', 2300, 2300, 0.09, 0.008, 0.003, 0.11);
        break;
    }
  }
  /**
   * Tracker S-03: his systems coming up, as sound. A relay and a supply whine climbing at power-on,
   * then a flutter of self-test blips before the wake chime.
   */
  power() {
    if (!this.ctx || !this.enabled) return;
    this.click(0, 0.07, 1800);
    this.tone('sine', 52, 38, 0.5, 0.04, 0.004);
    this.tone('triangle', 90, 1400, 1.2, 0.005, 0.5, 0.05);
    this.tone('sine', 4200, 7600, 1.3, 0.0016, 0.9, 0.05);
    this.burst('bandpass', 300, 3200, 1, 0.008, { q: 2, attack: 0.6 });
    [1568, 2093, 1760, 2349, 1976, 2637, 2093].forEach((frequencyHz, index) =>
      this.tone(
        'square',
        frequencyHz,
        frequencyHz,
        0.035,
        0.0018,
        0.002,
        1.15 + index * 0.075 + (index > 3 ? 0.08 : 0),
        index % 2 ? 0.25 : -0.25,
      ),
    );
  }
  /**
   * Data chatter for as long as a diagnostic line resolves on screen, then its verdict: a bright
   * double blip for OK, a sour two-tone for a fault, and a hard alarm for the combat system.
   */
  dataLine(kind: 'ok' | 'fault' | 'red', duration: number) {
    if (!this.ctx || !this.enabled) return;
    let seed =
      Math.round(duration * 997) +
      (kind === 'red' ? 3 : kind === 'fault' ? 2 : 1);
    const random = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let depth = 0; depth < duration; depth += 0.034 + random() * 0.03) {
      const frequencyHz =
        kind === 'red' ? 900 + random() * 900 : 1700 + random() * 1900;
      this.tone(
        kind === 'red' ? 'square' : 'sine',
        frequencyHz,
        frequencyHz * 0.93,
        0.022,
        kind === 'red' ? 0.0012 : 0.0022,
        0.002,
        depth,
        (random() - 0.5) * 0.5,
      );
    }
    const end = duration + 0.04;
    if (kind === 'ok') {
      this.tone('sine', 1320, 1320, 0.08, 0.006, 0.004, end);
      this.tone('sine', 1760, 1760, 0.16, 0.006, 0.004, end + 0.09);
    } else if (kind === 'fault') {
      this.click(end, 0.03, 1200);
      this.tone('triangle', 392, 370, 0.4, 0.011, 0.006, end);
      this.tone('triangle', 415, 392, 0.4, 0.008, 0.006, end);
    } else {
      // COMBAT SYSTEM ACTIVE: a three-pulse two-tone alarm with a growl under it.
      for (let index = 0; index < 3; index++) {
        this.tone('square', 988, 988, 0.1, 0.0042, 0.004, end + index * 0.18);
        this.tone(
          'square',
          740,
          740,
          0.1,
          0.0038,
          0.004,
          end + index * 0.18 + 0.09,
        );
      }
      this.tone('sawtooth', 62, 55, 0.9, 0.012, 0.02, end);
      this.burst('bandpass', 1800, 900, 0.45, 0.012, {
        q: 3,
        attack: 0.01,
        delay: end,
      });
    }
  }
  /** Tracker S-02: rubble from the crossing landing round Hiro, and chunks that whip past his head. */
  rubble(pan = 0, near = 0.6) {
    if (!this.ctx || !this.enabled) return;
    this.tone('sine', 78, 40, 0.3, 0.05 * near, 0.004, 0, pan * 0.5);
    this.burst('lowpass', 1100, 200, 0.4, 0.05 * near, { attack: 0.003, pan });
    for (let index = 0; index < 4; index++)
      this.burst(
        'bandpass',
        1400 + Math.random() * 2200,
        800,
        0.05,
        0.014 * near,
        {
          q: 4,
          delay: 0.05 + Math.random() * 0.35,
          pan: pan + (Math.random() - 0.5) * 0.5,
        },
      );
  }
  whiz(pan = 0) {
    if (!this.ctx || !this.enabled) return;
    this.burst('bandpass', 500, 2600, 0.3, 0.035, {
      q: 1.6,
      attack: 0.22,
      pan,
    });
    this.burst('bandpass', 2600, 700, 0.25, 0.025, {
      q: 1.6,
      attack: 0.01,
      delay: 0.3,
      pan: pan * 1.4,
    });
  }
  /** Spool and charge build; discharge cracks; impacts carry boom, debris and, if torn, the tear. */
  charge(pan = 0) {
    this.tone('sawtooth', 180, 1600, 1.1, 0.008, 0.6, 0, pan);
    this.tone('sine', 360, 2200, 1.1, 0.006, 0.6, 0, pan);
  }
  spool() {
    this.tone('sawtooth', 55, 220, 1.4, 0.014, 0.9);
    this.burst('bandpass', 300, 1600, 1.6, 0.03, { q: 0.6, attack: 1.2 });
  }
  discharge(pan = 0) {
    this.burst('highpass', 2400, 900, 0.18, 0.09, { attack: 0.002, pan });
    this.tone('square', 880, 90, 0.22, 0.02, 0.002, 0, pan);
  }
  impact(power: number, tear: boolean, pan = 0, near = 1) {
    if (!this.ctx || !this.enabled || !this.ears || !this.layers) return;
    const scalarValue = Math.min(1.4, power) * (0.45 + near * 0.55);
    this.tone('sine', 62, 26, 1.8, 0.22 * scalarValue, 0.004, 0, pan * 0.5);
    this.burst('lowpass', 900, 90, 1.6, 0.18 * scalarValue, {
      q: 0.7,
      attack: 0.003,
      pan: pan * 0.6,
    });
    this.burst('highpass', 3000, 1200, 0.12, 0.07 * scalarValue, {
      attack: 0.001,
      pan,
    });
    for (let index = 0; index < 7; index++)
      this.burst(
        'bandpass',
        1800 + Math.random() * 2400,
        900,
        0.06,
        0.02 * scalarValue,
        {
          q: 4,
          delay: 0.25 + Math.random() * 1.2,
          pan: pan + (Math.random() - 0.5) * 0.6,
        },
      );
    this.burst('lowpass', 400, 120, 2.6, 0.05 * scalarValue, {
      attack: 0.3,
      delay: 0.2,
    });
    if (tear) {
      // Reality tearing: a rising band of noise that refuses to resolve, with a glassy ring.
      this.burst('bandpass', 260, 2900, 1.5, 0.05 * scalarValue, {
        q: 6,
        attack: 0.5,
        pan,
      });
      this.tone('sine', 1975, 1580, 1.8, 0.008 * scalarValue, 0.4, 0.1, pan);
      this.tone('sine', 2093, 1661, 1.8, 0.006 * scalarValue, 0.4, 0.12, -pan);
    }
    if (power * near > 0.7) {
      // Ears: the world dulls and rings, then comes back.
      const startTimeSeconds = this.ctx.currentTime;
      this.ears.frequency.cancelScheduledValues(startTimeSeconds);
      this.ears.frequency.setValueAtTime(700, startTimeSeconds + 0.02);
      this.ears.frequency.exponentialRampToValueAtTime(
        20000,
        startTimeSeconds + 2.4,
      );
      this.layers.ring.level = 0.006 * power;
      this.layers.ring.gain.gain.setTargetAtTime(
        this.layers.ring.level,
        startTimeSeconds,
        0.02,
      );
    }
  }
  /** Doppler pass for the overhead swoop, panned across the head. */
  flyby() {
    if (!this.ctx || !this.enabled || !this.noise) return;
    const audioContext = this.ctx,
      startTimeSeconds = audioContext.currentTime,
      state = audioContext.createBufferSource(),
      callback = audioContext.createBiquadFilter(),
      group = audioContext.createGain(),
      point = audioContext.createStereoPanner();
    state.buffer = this.noise;
    state.loop = true;
    callback.type = 'bandpass';
    callback.Q.value = 0.9;
    callback.frequency.setValueAtTime(1900, startTimeSeconds);
    callback.frequency.exponentialRampToValueAtTime(
      420,
      startTimeSeconds + 1.9,
    );
    group.gain.setValueAtTime(0.0001, startTimeSeconds);
    group.gain.exponentialRampToValueAtTime(0.16, startTimeSeconds + 0.75);
    group.gain.exponentialRampToValueAtTime(0.0001, startTimeSeconds + 2.2);
    point.pan.setValueAtTime(0.7, startTimeSeconds);
    point.pan.linearRampToValueAtTime(-0.7, startTimeSeconds + 1.6);
    state.connect(callback);
    callback.connect(group);
    group.connect(point);
    point.connect(this.bus!);
    state.start(startTimeSeconds);
    state.stop(startTimeSeconds + 2.3);
    this.tone('sine', 80, 38, 1.6, 0.08, 0.5);
  }
  rupture() {
    this.tone('sine', 41, 22, 4.5, 0.16, 0.8);
    this.burst('bandpass', 180, 3800, 4, 0.06, { q: 2, attack: 2.5 });
  }
  whiteout() {
    this.tone('sine', 220, 880, 1.6, 0.02, 1.2);
    this.burst('highpass', 1200, 9000, 1.8, 0.05, { attack: 1.4 });
  }
  arrival() {
    [293.7, 440, 587.3].forEach((frequencyHz, index) =>
      this.tone(
        'sine',
        frequencyHz,
        frequencyHz,
        5,
        0.008,
        2,
        0.4 + index * 0.3,
      ),
    );
  }
  dispose() {
    this.master?.disconnect();
    this.ctx = null;
    this.master = null;
  }
}
