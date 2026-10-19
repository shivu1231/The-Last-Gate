import type { PhaseTwoDirector } from './model';

/** Quiet procedural pressure, breathing and event sounds; no music or network assets. */
export class PhaseTwoAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private pressure: GainNode | null = null;
  private breath: GainNode | null = null;
  private threat: GainNode | null = null;
  private nodes: AudioNode[] = [];
  private last = '';
  private enabled = false;
  async setEnabled(enabled: boolean) {
    if (enabled && !this.context) {
      this.context = new AudioContext();
      const audioContext = this.context;
      const master = audioContext.createGain();
      master.gain.value = 0;
      master.connect(audioContext.destination);
      this.master = master;
      const tone = (frequency: number, value: number) => {
        const oscillator = audioContext.createOscillator(),
          gain = audioContext.createGain();
        oscillator.frequency.value = frequency;
        gain.gain.value = value;
        oscillator.connect(gain).connect(master);
        oscillator.start();
        this.nodes.push(oscillator, gain);
        return gain;
      };
      this.pressure = tone(37, 0.018);
      tone(39.3, 0.009);
      this.threat = tone(74, 0);
      const buffer = audioContext.createBuffer(
          1,
          audioContext.sampleRate * 4,
          audioContext.sampleRate,
        ),
        data = buffer.getChannelData(0);
      for (let index = 0; index < data.length; index++)
        data[index] = (Math.random() * 2 - 1) * 0.28;
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 560;
      const breath = audioContext.createGain();
      breath.gain.value = 0;
      source.connect(filter).connect(breath).connect(master);
      source.start();
      this.breath = breath;
      this.nodes.push(source, filter, breath);
    }
    if (enabled) await this.context?.resume();
    this.enabled = enabled;
    this.master?.gain.setTargetAtTime(
      enabled ? 0.46 : 0,
      this.context!.currentTime,
      0.3,
    );
  }
  private cue(frequency: number, duration: number, gain: number, pan = 0) {
    if (!this.enabled || !this.context || !this.master) return;
    const audioContext = this.context,
      now = audioContext.currentTime;
    const tone = audioContext.createOscillator(),
      volume = audioContext.createGain(),
      spatial = audioContext.createStereoPanner();
    tone.frequency.setValueAtTime(frequency, now);
    tone.frequency.exponentialRampToValueAtTime(
      Math.max(20, frequency * 0.24),
      now + duration,
    );
    volume.gain.setValueAtTime(0, now);
    volume.gain.linearRampToValueAtTime(gain, now + 0.025);
    volume.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    spatial.pan.value = pan;
    tone.connect(volume).connect(spatial).connect(this.master);
    tone.start();
    tone.stop(now + duration);
    tone.onended = () => {
      tone.disconnect();
      volume.disconnect();
      spatial.disconnect();
    };
  }
  update(director: PhaseTwoDirector) {
    if (!this.context || !this.enabled) return;
    const state = director.getSnapshot(),
      now = this.context.currentTime;
    const quiet = state.stage === 'fracture' && director.stageTime < 2;
    this.pressure?.gain.setTargetAtTime(quiet ? 0.002 : 0.019, now, 0.6);
    this.breath?.gain.setTargetAtTime(
      quiet
        ? 0
        : Math.pow(Math.max(0, Math.sin(director.time * 1.3)), 4) * 0.035,
      now,
      0.18,
    );
    this.threat?.gain.setTargetAtTime(0.001, now, 0.5);
    const key = `${state.stage}/${state.stored}/${state.scanning}`;
    if (key !== this.last) {
      if (state.stored) this.cue(920, 0.35, 0.012, -0.2);
      this.last = key;
    }
  }
  dispose() {
    this.master?.gain.setValueAtTime(0, this.context!.currentTime);
    this.nodes.forEach((node) => {
      if (
        node instanceof OscillatorNode ||
        node instanceof AudioBufferSourceNode
      )
        node.stop();
      node.disconnect();
    });
    this.nodes = [];
    void this.context?.close();
    this.context = null;
  }
}
