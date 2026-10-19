import type { AudioMixName } from '../core/ExperienceStates';

// One AudioContext, one mix. Every sound in the experience goes through a category bus:
//
//   source → bus (AMBIENCE/CHARACTER/…) → mix → silence duck → master → speakers
//
// Scenes never create their own AudioContext or keep loops alive across chapters:
// loops are keyed (no duplicates can accumulate) and owned (stopped on scene cleanup).

export const BUSES = ['AMBIENCE', 'CHARACTER', 'MECHANICAL', 'PORTAL', 'IMPACT', 'MICROBOT', 'UI', 'MUSIC', 'LEGACY'] as const;
export type Bus = typeof BUSES[number];

type Levels = Partial<Record<Bus, number>>;
// Narrative mix snapshots. Missing buses default to 1. Silence is a feature: FRACTURE,
// MUSIC stays at 0 unless a chapter asks for it.
export const MIX_SNAPSHOTS: Record<AudioMixName, Levels> = {
  SILENT:       { AMBIENCE: 0, CHARACTER: 0, MECHANICAL: 0, PORTAL: 0, IMPACT: 0, MICROBOT: 0, MUSIC: 0, LEGACY: 0 },
  AWAKE:        { AMBIENCE: .9, CHARACTER: 1, MECHANICAL: .5, PORTAL: .55, IMPACT: .6, MICROBOT: 0, MUSIC: 0 },
  SHELL:        { AMBIENCE: .55, CHARACTER: .9, MECHANICAL: .9, PORTAL: .35, IMPACT: .6, MICROBOT: 0, MUSIC: 0 },
  CHIP:         { AMBIENCE: .35, CHARACTER: .8, MECHANICAL: 1, PORTAL: .25, IMPACT: .5, MICROBOT: 0, MUSIC: 0 },
  BOOT:         { AMBIENCE: .2, CHARACTER: .6, MECHANICAL: 1, PORTAL: .2, IMPACT: .5, MICROBOT: 0, MUSIC: 0 },
  CORRUPTION:   { AMBIENCE: .45, CHARACTER: .8, MECHANICAL: 1, PORTAL: .8, IMPACT: .9, MICROBOT: 0, MUSIC: 0 },
  CHASE:        { AMBIENCE: .7, CHARACTER: .9, MECHANICAL: .9, PORTAL: .8, IMPACT: 1, MICROBOT: .4, MUSIC: 0 },
  FRACTURE:     { AMBIENCE: .18, CHARACTER: .7, MECHANICAL: .3, PORTAL: .35, IMPACT: .5, MICROBOT: .2, MUSIC: 0 },
};

export type SoundHandle = { readonly id: string; stop(fade?: number): void; setGain(value: number, fade?: number): void };
type LoopEntry = { handle: SoundHandle; owner: string | null };

const MASTER_LEVEL = 1;

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private duck: GainNode | null = null;
  private buses = new Map<Bus, GainNode>();
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private loops = new Map<string, LoopEntry>();
  private mix: AudioMixName = 'SILENT';
  private wasRunning = false;
  private unavailable = false;
  private silenceToken = 0;
  private decoder: OfflineAudioContext | null = null;
  private deferred = new Set<() => void>();
  private gestured = false;

  get context() { return this.ctx; }
  get currentMix() { return this.mix; }

  /** Lazily create the single shared context. Returns null if Web Audio is unavailable. */
  ensure(): AudioContext | null {
    if (this.ctx || this.unavailable) return this.ctx;
    // Never create the live context before a user gesture: browsers would log autoplay warnings.
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    this.gestured ||= activation ? activation.hasBeenActive : true;
    if (!this.gestured) return null;
    try {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.master = ctx.createGain(); this.master.gain.value = MASTER_LEVEL; this.master.connect(ctx.destination);
      this.duck = ctx.createGain(); this.duck.connect(this.master);
      for (const name of BUSES) { const gain = ctx.createGain(); gain.connect(this.duck); this.buses.set(name, gain); }
      this.applyMix(this.mix, 0);
      document.addEventListener('visibilitychange', this.onVisibility);
    } catch { this.unavailable = true; }
    if (this.ctx) for (const begin of [...this.deferred]) begin();
    return this.ctx;
  }

  /** Create + resume inside the first natural gesture (autoplay policy) — no modal needed. */
  unlockOnFirstGesture() {
    const unlock = () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      this.gestured = true;
      const ctx = this.ensure();
      if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    return unlock;
  }

  /** Input node for a category. Legacy directors connect their master to bus('LEGACY'). */
  bus(name: Bus): AudioNode | null { this.ensure(); return this.buses.get(name) ?? null; }

  /** Crossfade every bus to a narrative snapshot. */
  applyMix(name: AudioMixName, seconds = 2.4) {
    this.mix = name;
    if (!this.ctx) return;
    const levels = MIX_SNAPSHOTS[name], t = this.ctx.currentTime, tc = Math.max(.001, seconds / 3);
    for (const [bus, gain] of this.buses) {
      const fallback = bus === 'LEGACY' ? 1 : bus === 'MUSIC' ? 0 : 1;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setTargetAtTime(levels[bus] ?? fallback, t, tc);
    }
  }

  /**
   * Critical silence beat: everything except UI dips to near silence, then returns.
   * Overlapping calls extend the silence instead of stacking.
   */
  silence(holdSeconds = 1.6, { fadeOut = .35, fadeIn = 1.8, floor = .04 } = {}) {
    if (!this.ctx || !this.duck) return;
    const token = ++this.silenceToken, t = this.ctx.currentTime, gain = this.duck.gain;
    gain.cancelScheduledValues(t); gain.setValueAtTime(gain.value, t);
    gain.linearRampToValueAtTime(floor, t + fadeOut);
    setTimeout(() => {
      if (token !== this.silenceToken || !this.ctx) return;
      const now = this.ctx.currentTime; gain.cancelScheduledValues(now); gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(1, now + fadeIn);
    }, (fadeOut + holdSeconds) * 1000);
  }

  /** Fetch + decode a compressed (ogg/m4a/mp3) file once. Missing files resolve to null. */
  load(url: string): Promise<AudioBuffer | null> {
    let pending = this.buffers.get(url);
    if (!pending) {
      pending = fetch(url).then(response => { if (!response.ok) throw new Error(`${response.status}`); return response.arrayBuffer(); })
        // Decode without creating the live context before a gesture (avoids autoplay warnings).
        .then(data => (this.ctx ?? (this.decoder ??= new OfflineAudioContext(2, 1, 48000))).decodeAudioData(data))
        .catch(error => { if (import.meta.env.DEV) console.warn(`[lattice] audio ${url} unavailable`, error); return null; });
      this.buffers.set(url, pending);
    }
    return pending;
  }

  /**
   * Keyed loop. Asking for the same id twice returns the running loop instead of
   * starting a duplicate. `source` is a URL or a node factory (synthesized beds).
   */
  loop(id: string, source: string | ((ctx: AudioContext) => AudioScheduledSourceNode | AudioNode), options: { bus?: Bus; gain?: number; fadeIn?: number; owner?: string } = {}): SoundHandle {
    const existing = this.loops.get(id);
    if (existing) { existing.owner = options.owner ?? existing.owner; return existing.handle; }
    const { bus = 'AMBIENCE', gain: level = 1, fadeIn = 2, owner = null } = options;
    let ctx: AudioContext | null = null, gain: GainNode | null = null, node: AudioNode | null = null, stopped = false;
    // Before the first gesture there is no live context yet: start as soon as there is one.
    const begin = () => {
      this.deferred.delete(begin);
      ctx = this.ctx; const out = this.buses.get(bus);
      if (stopped || !ctx || !out) return;
      const live = ctx, g = live.createGain(); gain = g;
      g.gain.value = 0; g.connect(out);
      g.gain.setTargetAtTime(level, live.currentTime, Math.max(.001, fadeIn / 3));
      const start = (created: AudioNode) => {
        if (stopped) return;
        node = created; created.connect(g);
        if ('start' in created) { try { (created as AudioScheduledSourceNode).start(); } catch { /* already started */ } }
      };
      if (typeof source === 'string') void this.load(source).then(buffer => {
        if (!buffer || stopped) return;
        const player = live.createBufferSource(); player.buffer = buffer; player.loop = true; start(player);
      });
      else start(source(live));
    };
    const handle: SoundHandle = {
      id,
      setGain: (value, fade = .5) => { if (ctx && gain) gain.gain.setTargetAtTime(value, ctx.currentTime, Math.max(.001, fade / 3)); },
      stop: (fade = 1.2) => {
        if (stopped) return; stopped = true;
        this.deferred.delete(begin);
        if (this.loops.get(id)?.handle === handle) this.loops.delete(id);
        const live = ctx, g = gain as GainNode | null;
        if (!live || !g) return;
        const t = live.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade);
        setTimeout(() => {
          const n = node as AudioNode | null;
          try { if (n && 'stop' in n) (n as AudioScheduledSourceNode).stop(); } catch { /* not started */ }
          n?.disconnect(); g.disconnect();
        }, fade * 1000 + 60);
      },
    };
    this.loops.set(id, { handle, owner });
    if (this.ensure()) begin(); else this.deferred.add(begin);
    return handle;
  }

  /** Fire-and-forget sample. Missing file → silent no-op. */
  async oneShot(url: string, options: { bus?: Bus; gain?: number; pan?: number; rate?: number } = {}) {
    const ctx = this.ensure(), buffer = await this.load(url), out = this.buses.get(options.bus ?? 'IMPACT');
    if (!ctx || !buffer || !out || ctx.state !== 'running') return;
    const player = ctx.createBufferSource(), gain = ctx.createGain(), pan = ctx.createStereoPanner();
    player.buffer = buffer; player.playbackRate.value = options.rate ?? 1;
    gain.gain.value = options.gain ?? 1; pan.pan.value = options.pan ?? 0;
    player.connect(gain); gain.connect(pan); pan.connect(out);
    player.onended = () => { player.disconnect(); gain.disconnect(); pan.disconnect(); };
    player.start();
  }

  /** Stop every loop owned by a scene (called from scene cleanup). */
  stopOwner(owner: string, fade = 1.5) { for (const { handle, owner: o } of [...this.loops.values()]) if (o === owner) handle.stop(fade); }
  stopAll(fade = .6) { for (const { handle } of [...this.loops.values()]) handle.stop(fade); }
  get activeLoops() { return [...this.loops.keys()]; }

  private onVisibility = () => {
    if (!this.ctx) return;
    if (document.visibilityState === 'hidden') { this.wasRunning = this.ctx.state === 'running'; if (this.wasRunning) void this.ctx.suspend(); }
    else if (this.wasRunning) void this.ctx.resume().catch(() => undefined);
  };
}

export const audioEngine = new AudioEngine();
