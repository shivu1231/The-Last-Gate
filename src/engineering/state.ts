import { create } from 'zustand';

/** The five systems Hiro can inspect on the board. */
export type SystemId = 'power' | 'motor' | 'thrusters' | 'sensors' | 'chip';
export type ViewMode = 'exterior' | 'internal' | 'isolate';
export const SYSTEMS: SystemId[] = ['power', 'motor', 'thrusters', 'sensors', 'chip'];

/** Where the left-shoulder actuator locked when its feed was cut, in degrees off its index. */
export const ACTUATOR_JAM = 38;
/** The thruster control plug's key starts this far off the socket key. */
export const PLUG_START = 120;

type Board = {
  selected: SystemId | null;
  mode: ViewMode;
  /** Viewer zoom multiplier on the orbit distance. */
  zoom: number;
  assessment: boolean;
  rerouted: boolean;
  plugAngle: number;
  plugSeated: boolean;
  actuatorAngle: number;
  actuatorReset: boolean;
  sensorsTested: boolean;
  bayOpen: boolean;
};

export const initialBoard = (): Board => ({
  selected: null, mode: 'exterior', zoom: 1, assessment: false,
  rerouted: false, plugAngle: PLUG_START, plugSeated: false,
  actuatorAngle: ACTUATOR_JAM, actuatorReset: false, sensorsTested: false, bayOpen: false,
});

export const useBoard = create<Board>(initialBoard);
if (import.meta.env.DEV) (window as Window & { __lastGateBoard?: typeof useBoard }).__lastGateBoard = useBoard;

export const repairsDone = (b: Board) => [b.rerouted, b.plugSeated, b.actuatorReset].filter(Boolean).length;
export const assessmentComplete = (b: Board) => repairsDone(b) === 3 && b.sensorsTested && b.bayOpen;

/** Hotspot buttons register here; the 3D scene moves them over their system every frame. */
export const hotspotElements = new Map<SystemId, HTMLElement>();
