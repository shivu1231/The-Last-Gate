import { enterRecovery } from '../recovery/state';
export type EntryStage = 'fracture' | 'afterimage';
/**
 * Retained legacy fracture/afterimage stage identifier.
 */
export type PhaseTwoStage = EntryStage;
/**
 * Current state of the retained Phase 2 runtime.
 */
export type PhaseTwoSnapshot = Readonly<{
  stage: PhaseTwoStage;
  model: number;
  stored: boolean;
  scanning: boolean;
  message: string;
  caption: string;
  action: string;
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
  private snapshot: PhaseTwoSnapshot;

  constructor(entry: EntryStage = 'fracture') {
    const recorded = entry === 'afterimage';
    this.snapshot = {
      stage: entry,
      model: 0,
      stored: false,
      scanning: false,
      message: '',
      caption: '',
      action: '',
    };
    // Entering directly at afterimage still requires the scan before the trace exists.
    void recorded;
    this.refresh();
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;

  private patch(patch: Partial<PhaseTwoSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private enter(stage: PhaseTwoStage) {
    this.stageTime = 0;
    this.focusTime = 0;
    this.focused = false;
    this.recording = false;
    this.patch({ stage, message: '', caption: '', action: '' });
    this.refresh();
  }
  private refresh() {
    const state = this.snapshot;
    if (state.stage === 'afterimage')
      this.patch({
        action: state.stored
          ? 'FOLLOW THE TRACE  /  E'
          : 'FOCUS ON THE STILL LINE  /  E TO SCAN',
      });
  }
  /** Scan the still line, then follow the stored trace through the portal to Baymax. */
  act() {
    const state = this.snapshot;
    if (state.stage !== 'afterimage') return;
    if (state.stored) enterRecovery();
    else if (!state.scanning) {
      this.scanTime = 0;
      this.patch({ scanning: true, action: 'RECORDING LOCAL STABILITY...' });
    }
  }
  step(delta: number) {
    if (this.paused) return;
    const deltaSeconds = Math.min(Math.max(delta, 0), 0.05);
    this.time += deltaSeconds;
    this.stageTime += deltaSeconds;
    const state = this.snapshot,
      timeSeconds = this.stageTime;
    if (state.stage === 'fracture' && timeSeconds >= 8)
      this.enter('afterimage');
    if (state.stage === 'afterimage') {
      if (this.focused && !state.scanning && !state.stored) {
        this.focusTime += deltaSeconds;
        if (this.focusTime > 0.9) this.act();
      } else if (!this.focused) this.focusTime = 0;
      if (state.scanning && !state.stored) {
        this.scanTime += deltaSeconds;
        if (this.scanTime >= 3.2)
          this.patch({
            stored: true,
            scanning: false,
            model: 9,
            message: 'AFTERIMAGE TRACE STORED',
            caption: 'He is mapping the dimension.',
            action: 'FOLLOW THE TRACE  /  E',
          });
      }
    }
  }
  dispose() {
    this.listeners.clear();
  }
}
