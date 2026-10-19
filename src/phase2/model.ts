import { enterRecovery } from '../recovery/state';
export type EntryStage = 'fracture' | 'afterimage';
export type Stage = EntryStage;
export type Snapshot = Readonly<{
  stage: Stage; model: number; stored: boolean; scanning: boolean;
  message: string; caption: string; action: string;
}>;

/** One authored clock and discrete notifications. No frame-rate React updates. */
export class PhaseTwoDirector {
  time = 0;
  stageTime = 0;
  scanTime = 0;
  focusTime = 0;
  focused = false;
  recording = false;
  paused = false;
  private listeners = new Set<() => void>();
  private snapshot: Snapshot;

  constructor(entry: EntryStage = 'fracture') {
    const recorded = entry === 'afterimage';
    this.snapshot = {
      stage: entry, model: 0, stored: false, scanning: false,
      message: '', caption: '', action: '',
    };
    // Entering directly at afterimage still requires the scan before the trace exists.
    void recorded;
    this.refresh();
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getSnapshot = () => this.snapshot;

  private patch(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach(listener => listener());
  }
  private enter(stage: Stage) {
    this.stageTime = 0;
    this.focusTime = 0;
    this.focused = false;
    this.recording = false;
    this.patch({ stage, message: '', caption: '', action: '' });
    this.refresh();
  }
  private refresh() {
    const s = this.snapshot;
    if (s.stage === 'afterimage') this.patch({
      action: s.stored ? 'FOLLOW THE TRACE  /  E' : 'FOCUS ON THE STILL LINE  /  E TO SCAN',
    });
  }
  /** Scan the still line, then follow the stored trace through the portal to Baymax. */
  act() {
    const s = this.snapshot;
    if (s.stage !== 'afterimage') return;
    if (s.stored) enterRecovery();
    else if (!s.scanning) {
      this.scanTime = 0;
      this.patch({ scanning: true, action: 'RECORDING LOCAL STABILITY...' });
    }
  }
  step(delta: number) {
    if (this.paused) return;
    const dt = Math.min(Math.max(delta, 0), .05);
    this.time += dt;
    this.stageTime += dt;
    const s = this.snapshot, t = this.stageTime;
    if (s.stage === 'fracture' && t >= 8) this.enter('afterimage');
    if (s.stage === 'afterimage') {
      if (this.focused && !s.scanning && !s.stored) {
        this.focusTime += dt;
        if (this.focusTime > .9) this.act();
      } else if (!this.focused) this.focusTime = 0;
      if (s.scanning && !s.stored) {
        this.scanTime += dt;
        if (this.scanTime >= 3.2) this.patch({
          stored: true, scanning: false, model: 9, message: 'AFTERIMAGE TRACE STORED',
          caption: 'He is mapping the dimension.', action: 'FOLLOW THE TRACE  /  E',
        });
      }
    }
  }
  dispose() { this.listeners.clear(); }
}
