import { create } from 'zustand';

export type Chapter =
  | 'BOOT'
  | 'AWAKE'
  | 'ESCAPE'
  | 'THE_SHELL'
  | 'RED_WAKE'
  | 'THE_FRACTURE';
export type Phase =
  | 'loading'
  // The escape attempt: Hiro comes to on the far side, tries to leave, turns back for Baymax,
  // is hurt crossing back, and only then truly wakes (the blink) to face the dimension.
  | 'portal-sighted'
  | 'call-baymax'
  | 'to-portal'
  | 'through-portal'
  | 'sf-arrival'
  | 'sf-turnback'
  | 'back-decision'
  | 'back-through'
  | 'reentry'
  | 'awakening'
  | 'approaching'
  | 'discovery'
  | 'inspected'
  | 'chip-focus'
  | 'chip-reaching'
  | 'chip-held'
  | 'chest-focus'
  | 'panel-opening'
  | 'socket-ready'
  | 'inserting'
  | 'silence'
  | 'booting'
  | 'diagnostic'
  | 'corrupting'
  | 'threat'
  | 'ignition'
  | 'chase'
  | 'fracture'
  | 'pulled'
  | 'handoff';
export type Speaker = 'HIRO' | 'BAYMAX';
const next: Partial<Record<Phase, Phase>> = {
  'portal-sighted': 'call-baymax',
  'call-baymax': 'to-portal',
  'to-portal': 'through-portal',
  'through-portal': 'sf-arrival',
  'sf-arrival': 'sf-turnback',
  'sf-turnback': 'back-decision',
  'back-decision': 'back-through',
  'back-through': 'reentry',
  reentry: 'awakening',
  discovery: 'inspected',
  inspected: 'chip-focus',
  'chip-focus': 'chip-reaching',
  'chip-reaching': 'chip-held',
  'chip-held': 'chest-focus',
  'chest-focus': 'panel-opening',
  'panel-opening': 'socket-ready',
  'socket-ready': 'inserting',
  inserting: 'silence',
  silence: 'booting',
  booting: 'diagnostic',
  diagnostic: 'corrupting',
  corrupting: 'threat',
  threat: 'ignition',
  ignition: 'chase',
  chase: 'fracture',
  fracture: 'pulled',
  pulled: 'handoff',
};
const ESCAPE_PHASES: Phase[] = [
  'portal-sighted',
  'call-baymax',
  'to-portal',
  'through-portal',
  'sf-arrival',
  'sf-turnback',
  'back-decision',
  'back-through',
  'reentry',
];
const chapterOf = (phase: Phase, current: Chapter): Chapter =>
  ESCAPE_PHASES.includes(phase)
    ? 'ESCAPE'
    : phase === 'awakening' || phase === 'approaching'
      ? 'AWAKE'
      : [
            'booting',
            'diagnostic',
            'corrupting',
            'threat',
            'ignition',
            'chase',
          ].includes(phase)
        ? 'RED_WAKE'
        : ['fracture', 'pulled', 'handoff'].includes(phase)
          ? 'THE_FRACTURE'
          : current;
/** Phases where the player commits by holding (pointer on the focus, or E / Space). */
export const HOLD_PHASES: Phase[] = ['chip-focus', 'chest-focus'];
/** Phases where the player walks forward along an authored line (scroll / hold / W). */
export const WALK_PHASES: Phase[] = ['approaching'];
type ExperienceState = {
  chapter: Chapter;
  phase: Phase;
  targetProgress: number;
  subtitle: string;
  speaker: Speaker;
  sound: boolean;
  error: string | null;
  replay: number;
  started: boolean;
  ready: () => void;
  finishAwakening: () => void;
  move: (amount: number) => void;
  arrive: () => void;
  inspect: () => void;
  interact: () => void;
  advance: (from: Phase) => void;
  restart: () => void;
  say: (text: string, speaker?: Speaker) => void;
  toggleSound: () => void;
};
export const useSceneState = create<ExperienceState>((set, get) => ({
  chapter: 'BOOT',
  phase: 'loading',
  targetProgress: 0,
  subtitle: '',
  speaker: 'HIRO',
  sound: true,
  error: null,
  replay: 0,
  started: false,
  // Hiro comes to on the far side of the gate; the way home is still open, and still closing.
  ready: () =>
    set({
      chapter: 'ESCAPE',
      phase: 'portal-sighted',
      subtitle: 'The portal — it’s still open.',
      speaker: 'HIRO',
      started: true,
    }),
  // The blink now plays on the hurt re-entry: he wakes to the dimension, Baymax a shape in the dark.
  finishAwakening: () => {
    if (get().phase === 'awakening')
      set({
        chapter: 'AWAKE',
        phase: 'approaching',
        subtitle: 'Baymax… where are you?',
        speaker: 'HIRO',
      });
  },
  move: (amount) => {
    if (WALK_PHASES.includes(get().phase))
      set({
        targetProgress: Math.max(0, Math.min(1, get().targetProgress + amount)),
      });
  },
  arrive: () => {
    const point = get().phase;
    if (point === 'to-portal')
      set({
        phase: 'through-portal',
        chapter: 'ESCAPE',
        subtitle: '',
        targetProgress: 0,
      });
    else if (point === 'approaching')
      set({
        chapter: 'THE_SHELL',
        phase: 'discovery',
        subtitle: 'Baymax. You’re here.',
        speaker: 'HIRO',
      });
  },
  inspect: () => {
    if (get().phase === 'discovery') get().advance('discovery');
  },
  interact: () => {
    const point = get().phase;
    if (['discovery', ...HOLD_PHASES, 'socket-ready'].includes(point))
      get().advance(point);
  },
  advance: (from) => {
    const to = next[from];
    if (get().phase !== from || !to) return;
    set({
      phase: to,
      chapter: chapterOf(to, get().chapter),
      subtitle: '',
      speaker: 'HIRO',
      targetProgress: to === 'approaching' ? 0 : get().targetProgress,
    });
  },
  restart: () =>
    set({
      chapter: 'ESCAPE',
      phase: 'portal-sighted',
      targetProgress: 0,
      subtitle: 'The portal — it’s still open.',
      speaker: 'HIRO',
      replay: get().replay + 1,
    }),
  say: (subtitle, speaker = 'HIRO') => set({ subtitle, speaker }),
  toggleSound: () => set({ sound: !get().sound }),
}));
// Development only: lets the director's console jump between beats while tuning.
if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
  (window as unknown as { __lattice: typeof useSceneState }).__lattice =
    useSceneState;
