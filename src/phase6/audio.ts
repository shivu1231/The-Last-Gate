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
  private jet: GainNode | null = null; private jetFilter: BiquadFilterNode | null = null;
  private hum: GainNode | null = null; private air: GainNode | null = null; private calm: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private near: GainNode | null = null; private nextBeat = 0;
  private unsubscribeMute: (() => void) | null = null;

  private syncMute = () => {
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(sfx.getMuted() ? 0 : .5, this.ctx.currentTime, .025);
  };

  unlock() {
    if (this.ctx) { void this.ctx.resume().catch(() => undefined); return; }
    try {
      const c = new AudioContext(); this.ctx = c;
      this.master = c.createGain(); this.master.gain.value = sfx.getMuted() ? 0 : .5; this.master.connect(c.destination);
      this.unsubscribeMute = sfx.subscribe(this.syncMute);
      const buf = c.createBuffer(1, c.sampleRate * 3, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      const loop = (filter: BiquadFilterNode, gain: GainNode) => { const src = c.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(filter); filter.connect(gain); gain.connect(this.master!); src.start(); };
      // Jets: band-limited roar.
      this.jet = c.createGain(); this.jet.gain.value = 0; this.jetFilter = c.createBiquadFilter(); this.jetFilter.type = 'bandpass'; this.jetFilter.frequency.value = 520; this.jetFilter.Q.value = .5; loop(this.jetFilter, this.jet);
      // City air, and the quiet water on the other side.
      this.air = c.createGain(); this.air.gain.value = .05; const airF = c.createBiquadFilter(); airF.type = 'lowpass'; airF.frequency.value = 380; loop(airF, this.air);
      // Home (tracker S-08): soft harbour water that swells and falls, under a slow warm chord, instead of a flat hiss.
      this.calm = c.createGain(); this.calm.gain.value = 0;
      const waves = c.createGain(), waveF = c.createBiquadFilter(); waveF.type = 'lowpass'; waveF.frequency.value = 520; waveF.Q.value = .2;
      waves.gain.value = .55; loop(waveF, waves); waves.disconnect(); waves.connect(this.calm);
      const swell = c.createOscillator(), swellDepth = c.createGain(); swell.frequency.value = .11; swellDepth.gain.value = .4; swell.connect(swellDepth); swellDepth.connect(waves.gain); swell.start();
      const pad = c.createGain(), padF = c.createBiquadFilter(); padF.type = 'lowpass'; padF.frequency.value = 900; pad.gain.value = .5; padF.connect(pad); pad.connect(this.calm);
      for (const [f, v] of [[146.83, .3], [220, .22], [277.18, .14], [329.63, .1]] as const) {
        const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), depth = c.createGain();
        o.type = 'triangle'; o.frequency.value = f; g.gain.value = v; lfo.frequency.value = .05 + f / 4000; depth.gain.value = v * .45;
        lfo.connect(depth); depth.connect(g.gain); o.connect(g); g.connect(padF); o.start(); lfo.start();
      }
      this.calm.connect(this.master);
      // The frame's hum: two close low tones beating slowly.
      this.hum = c.createGain(); this.hum.gain.value = 0; this.hum.connect(this.master);
      for (const f of [55, 55.7, 110.4]) { const o = c.createOscillator(); o.frequency.value = f; const g = c.createGain(); g.gain.value = f > 100 ? .25 : .5; o.connect(g); g.connect(this.hum); o.start(); }
      // Him, close: a low growling servo drone, filtered saw with a slow wobble.
      this.near = c.createGain(); this.near.gain.value = 0; const nearF = c.createBiquadFilter(); nearF.type = 'lowpass'; nearF.frequency.value = 260; nearF.connect(this.near); this.near.connect(this.master);
      for (const f of [41, 61.5]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const lfo = c.createOscillator(), depth = c.createGain(); lfo.frequency.value = .7 + f / 100; depth.gain.value = 1.6; lfo.connect(depth); depth.connect(o.frequency); o.connect(nearF); o.start(); lfo.start(); }
    } catch { this.dispose(); }
  }

  /** Continuous layers, set every frame (smoothed). */
  set(s: { jet: number; sputter: number; hum: number; air: number; calm: number; dread?: number; near?: number }) {
    const c = this.ctx; if (!c || !this.jet || !this.hum || !this.air || !this.calm || !this.jetFilter) return;
    const now = c.currentTime;
    const gate = s.sputter > 0 && Math.random() < .35 ? .1 : 1;
    this.jet.gain.setTargetAtTime(s.jet * .55 * gate, now, s.sputter > 0 ? .02 : .12);
    this.jetFilter.frequency.setTargetAtTime(380 + s.jet * 600, now, .2);
    this.hum.gain.setTargetAtTime(s.hum * .16, now, .4);
    this.air.gain.setTargetAtTime(s.air * .06, now, .8);
    this.calm.gain.setTargetAtTime(s.calm * .11, now, 1.8);
    this.near?.gain.setTargetAtTime((s.near ?? 0) * .22, now, .25);
    // Heartbeat: lub-dub, quicker and louder as the dread rises.
    const dread = s.dread ?? 0;
    if (dread > .05 && now >= this.nextBeat) {
      const level = .25 + dread * .55;
      this.tone('sine', 62, 38, .16, level * .6); this.tone('sine', 58, 36, .14, level * .42, .17);
      this.nextBeat = now + 60 / (72 + dread * 84);
    } else if (dread <= .05) this.nextBeat = now;
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, level: number, at = 0, attack = .005) {
    const c = this.ctx; if (!c || !this.master) return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(level, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + .05);
  }
  private burst(freq: number, q: number, dur: number, level: number, type: BiquadFilterType = 'bandpass', at = 0) {
    const c = this.ctx; if (!c || !this.master || !this.noise) return;
    const t = c.currentTime + at, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t, Math.random()); src.stop(t + dur + .05);
  }

  click() { this.burst(4200, 2, .035, .5, 'highpass'); this.tone('square', 2400, 1800, .03, .05); this.burst(900, 4, .06, .15, 'bandpass', .012); }
  snap() { this.burst(2600, 1.5, .05, .55, 'highpass'); this.tone('triangle', 900, 500, .06, .06); }
  step(level: number) { this.tone('sine', 70, 34, .35, .5 * level); this.burst(160, .8, .18, .4 * level, 'lowpass'); }
  impact() { this.tone('sine', 62, 22, 1.6, .9); this.burst(220, .6, 1.4, .9, 'lowpass'); this.burst(1600, .7, .5, .25, 'bandpass', .02); this.tone('sawtooth', 48, 30, .5, .12); }
  ignite() { this.burst(300, .5, .7, .35, 'lowpass'); this.tone('sawtooth', 80, 160, .6, .05); }
  seat() { this.tone('sine', 520, 760, .25, .12); this.burst(3000, 2, .03, .3, 'highpass'); }
  contact() { this.burst(5200, 3, .08, .25, 'highpass'); this.tone('sine', 660, 990, .18, .06); }
  /** The gate trying and failing: a rising hum that catches, then drops out. */
  falter() { this.tone('sine', 90, 340, .7, .07); this.tone('sawtooth', 340, 60, .5, .03, .7); this.burst(700, .5, .9, .2, 'lowpass', .6); }
  bloom() { this.burst(400, .4, 2.6, .35, 'lowpass'); [392, 494, 587, 784].forEach((f, i) => this.tone('sine', f, f * 1.002, 2.4, .05, i * .14, .4)); }
  /** Hiro's footfall on paving: a scuff, heavier and sharper when he runs. */
  footstep(side: -1 | 1, speed: number) { const run = Math.min(1, speed / 4.5); this.burst(side > 0 ? 520 : 470, .9, .07 + run * .04, .08 + run * .12, 'lowpass'); this.burst(2400, 1.2, .025, .02 + run * .05, 'bandpass', .01); }
  /** A swing that misses: air torn past the ear. */
  whoosh() { const c = this.ctx; if (!c || !this.master || !this.noise) return; const t = c.currentTime, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); src.buffer = this.noise; f.type = 'bandpass'; f.Q.value = 1.4; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2200, t + .18); f.frequency.exponentialRampToValueAtTime(500, t + .42); g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.55, t + .12); g.gain.exponentialRampToValueAtTime(.0001, t + .45); src.connect(f); f.connect(g); g.connect(this.master); src.start(t, Math.random()); src.stop(t + .5); }
  /** Concrete coming down: a thud, grit, and a few skittering bits after. */
  crash(level = 1) { this.tone('sine', 80, 30, .7, .6 * level); this.burst(260, .6, .8, .7 * level, 'lowpass'); this.burst(1800, .8, .35, .25 * level, 'bandpass', .02); [.12, .2, .31].forEach(d => this.burst(3200, 2, .05, .1 * level, 'highpass', d)); }
  /** His arm motors driving a swing. */
  servo() { this.tone('sawtooth', 140, 420, .35, .05); this.tone('square', 70, 210, .35, .025); }
  /** The crossing: a swell that rises through the surface and tears. */
  warp() { this.burst(500, .4, 1.6, .35, 'lowpass'); this.tone('sine', 110, 880, 1.2, .08, 0, .5); this.tone('triangle', 220, 1760, 1, .03, .15, .4); this.burst(4000, 1, .4, .15, 'highpass', .9); }
  /** His boot chime: four soft rising notes. */
  chime() { [659.3, 830.6, 987.8, 1318.5].forEach((f, i) => { this.tone('triangle', f, f, 1.6, .09, i * .16, .02); this.tone('sine', f * 2, f * 2, 1.1, .025, i * .16, .02); }); }

  dispose() {
    this.unsubscribeMute?.(); this.unsubscribeMute = null;
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close().catch(() => undefined);
    this.ctx = null; this.master = null;
  }
}
