import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ACESFilmicToneMapping, PerspectiveCamera, SRGBColorSpace } from 'three';
import { PhaseTwoDirector, type EntryStage } from './model';
import { PhaseTwoRuntime } from './PhaseTwoRuntime';
import { PhaseTwoAudio } from './PhaseTwoAudio';

import { experience } from '../core/ExperienceFlow';
import './phase-two.css';


function PhaseScene({ director, audio }: { director: PhaseTwoDirector; audio: PhaseTwoAudio }) {
  const { gl, scene, camera, size, setDpr } = useThree();
  const runtime = useRef<PhaseTwoRuntime | null>(null);
  useEffect(() => {
    runtime.current = new PhaseTwoRuntime(gl, scene, camera as PerspectiveCamera, director, audio, setDpr);
    if (import.meta.env.DEV) (window as Window & { __latticePhaseII?: unknown }).__latticePhaseII = { director, gl };
    return () => { runtime.current?.dispose(); runtime.current = null; if (import.meta.env.DEV) delete (window as Window & { __latticePhaseII?: unknown }).__latticePhaseII; };
  }, [gl, scene, camera, director, audio, setDpr]);
  useEffect(() => { runtime.current?.resize(size.width, size.height); }, [size]);
  useFrame((_, dt) => runtime.current?.update(dt), 1);
  return null;
}

export function PhaseTwoExperience({ entry }: { entry: EntryStage }) {
  const director = useMemo(() => new PhaseTwoDirector(entry), [entry]);
  const audio = useMemo(() => new PhaseTwoAudio(), []);
  const snapshot = useSyncExternalStore(director.subscribe, director.getSnapshot);
  useEffect(() => {
    if (snapshot.stage === 'fracture') experience.observe('FRACTURE');
    if (snapshot.stage === 'afterimage') experience.observe('AFTERIMAGE');
  }, [snapshot.stage]);
  const [sound, setSound] = useState(false), [audioError, setAudioError] = useState(false), [error, setError] = useState('');
  useEffect(() => () => { audio.dispose(); director.dispose(); }, [audio, director]);
  const toggleSound = async () => { try { await audio.setEnabled(!sound); setSound(!sound); setAudioError(false); } catch { setAudioError(true); } };
  return <main className={`phase-two p2-${snapshot.stage}`} aria-label="Last Gate: Afterimage">
    <div className="p2-world"><Canvas dpr={1} camera={{ fov: 51, near: .08, far: 340, position: [0, 2.1, 10] }} gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace }} onCreated={({ gl }) => { gl.info.autoReset = false; gl.domElement.setAttribute('aria-label', 'Interactive dimensional environment'); gl.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); setError('The graphics context was lost. Reload to restore the dimension.'); }); }}><PhaseScene director={director} audio={audio} /></Canvas></div>
    <div className="p2-bars" aria-hidden="true" />
    <button className="p2-audio" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? 'Mute dimensional ambience' : 'Enable dimensional ambience'}><span className={sound ? 'p2-wave enabled' : 'p2-wave'} aria-hidden="true"><i /><i /><i /><i /></span>{audioError ? 'AUDIO UNAVAILABLE' : sound ? 'SOUND ON' : 'SOUND OFF'}</button>
    <div className="p2-subtitle" role="status" aria-live="polite">{snapshot.caption && <p key={snapshot.caption}><small>HIRO</small>{snapshot.caption}</p>}</div><div className="p2-telemetry" key={snapshot.message} aria-live="polite">{snapshot.message}</div>
    {snapshot.action && <button className="p2-action" onClick={() => director.act()} onPointerDown={() => { director.recording = true; }} onPointerUp={() => { director.recording = false; }} onPointerLeave={() => { director.recording = false; }}>{snapshot.action}</button>}

    {error && <div className="p2-error"><p>{error}</p><button onClick={() => location.reload()}>RECONNECT</button></div>}
    <p className="sr-only">Focus on the still line or press E to scan. Follow the trace to return to the city.</p>
  </main>;
}
