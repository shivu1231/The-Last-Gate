import type { Phase } from '../state/SceneStateManager';
/** Authored beat lengths in seconds. Interactive phases (chip-focus, chest-focus, socket-ready, chase) have none. */
export const SHELL_DURATIONS:Partial<Record<Phase,number>> = {
  // Escape attempt (to-portal is interactive, so it has no fixed length).
  'portal-sighted':3.4,'call-baymax':3.2,'to-portal':4.4,'through-portal':2,'sf-arrival':4,'sf-turnback':4.6,'back-decision':2.8,'back-through':2.2,reentry:4.6,
  inspected:3.2,'chip-reaching':2.1,'chip-held':2.7,'panel-opening':4.6,inserting:1.55,
  silence:2.4,booting:5.6,diagnostic:6.6,corrupting:4.8,threat:4.9,ignition:3.6,
  fracture:5.6,pulled:4.8
};
/** Tiny in-world readouts beside the focus point. Never instructions; the world teaches. */
export const SHELL_ACTIONS:Partial<Record<Phase,{label:string;description:string}>> = {
  discovery:{label:'Baymax…?',description:'Check Baymax for a response'},
  'chip-focus':{label:'TAKE THE CHIP',description:'Press and hold to pick up the red chip'},
  'chest-focus':{label:'OPEN CHIP BAY',description:'Press and hold to release Baymax’s chest access'},
  'socket-ready':{label:'',description:'Guide the chip into the keyed socket, or hold E'}
};
/** Seconds a hold must last before it commits. */
export const HOLD_TIME=.8;
export const DIAGNOSTIC_LINES:{key:string;value:string;tone:'ok'|'fault'|'red'}[] = [
  {key:'CORE SYSTEMS',value:'ONLINE',tone:'ok'},
  {key:'HEALTHCARE DIRECTIVE',value:'MISSING',tone:'fault'},
  {key:'PATIENT PROTOCOL',value:'NOT FOUND',tone:'fault'},
  {key:'CARE SYSTEM',value:'UNAVAILABLE',tone:'fault'},
  {key:'COMBAT SYSTEM',value:'ACTIVE',tone:'red'}
];
