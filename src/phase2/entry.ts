import { create } from 'zustand';
import type { EntryStage } from './model';

const devStage = import.meta.env.DEV ? new URLSearchParams(location.search).get('phase2') : null;
const entries:EntryStage[] = ['fracture','afterimage'];
const initial = entries.includes(devStage as EntryStage) ? devStage as EntryStage : null;

/** The only Phase I -> Phase II integration call. No Phase I state is read or changed. */
export function enterFracturePhase():void {
  usePhaseTwoEntry.setState(state=>({active:true,entry:'fracture',session:state.session+1}));
}

export const usePhaseTwoEntry = create<{active:boolean;entry:EntryStage;session:number}>(()=>({active:!!initial,entry:initial||'fracture',session:0}));
