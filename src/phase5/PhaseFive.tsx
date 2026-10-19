import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as T from 'three';
import { create } from 'zustand';
import { createBay, type Bay } from './bay';
import { createFacility } from './facility';
import { FACILITY_SHOTS, facilityCameraRoute } from './cameraRoute';
import { createFirstPersonHands } from '../characters/RegulatorController';
import type { PhaseFiveStep } from './entry';
import { phaseFiveExit } from './exit';
import { reducedMotion } from '../config/experience';
import { ZoomController } from '../systems/ZoomController';
import { SceneQuality } from '../presentation/SceneQuality';
import { CameraShot } from '../presentation/CameraShot';
import { transitionChapter } from '../presentation/chapterTransition';
import { sfx, useSfxBed, useUiSfx } from '../audio/sfx';
import { SoundToggle } from '../audio/SoundToggle';
import './phase-five.css';
import { AdaptiveDpr } from '../performance/AdaptiveDpr';
import { SceneCurtain } from '../presentation/SceneCurtain';

/**
 * Phase 5. The limiter goes onto Baymax and is tested: he comes back up, still hostile, held to
 * 35%. With that window, Hiro goes deeper into the city to a telemetry relay and repairs it far
 * enough to read the healthcare chip's last transmission, which crossed the portal boundary.
 */

type Stage = 'fit' | 'fitting' | 'test' | 'testing' | 'held' | 'transit' | 'facility' | 'found';
type Task = 'power' | 'patch' | 'spectrum' | 'dish' | 'trace';
const TASKS: Task[] = ['power', 'patch', 'spectrum', 'dish', 'trace'];
const TASK_NAMES: Record<Task, string> = { power: 'Restore console power', patch: 'Reconnect the signal path', spectrum: 'Remove interference', dish: 'Calibrate the receiver', trace: 'Read the last transmission' };
const CIRCUITS = [
  { id: 'console', label: 'CONSOLES', amps: 12, need: true },
  { id: 'receiver', label: 'RECEIVER', amps: 18, need: true },
  { id: 'lights', label: 'LIGHTING', amps: 15, need: false },
  { id: 'hvac', label: 'HVAC', amps: 22, need: false },
] as const;
const BATTERY = 40, TARGET_AZ = 212, TARGET_EL = 38;

type State = {
  stage: Stage; task: number; fitted: number; power: number;
  breakers: boolean[]; powered: boolean; leads: number; snr: number; az: number; el: number; traced: boolean; fixes: number;
};
const initial = (from: PhaseFiveStep): State => ({
  stage: from === 'facility' ? 'facility' : 'fit', task: 0, fitted: 0, power: 0,
  breakers: [false, false, true, true], powered: false, leads: 0, snr: -8, az: 140, el: 15, traced: false, fixes: 0,
});
const useP5 = create<State>(() => initial('limiter'));
// Development only: lets tooling jump between beats (window.__lastGateP5.setState({...})).
if (import.meta.env.DEV) (window as Window & { __lastGateP5?: typeof useP5 }).__lastGateP5 = useP5;
const strengthOf = (az: number, el: number) => {
  const daz = ((az - TARGET_AZ + 540) % 360) - 180, del = el - TARGET_EL;
  return 100 * Math.exp(-((daz / 22) ** 2) - ((del / 11) ** 2));
};

/** Every state change that makes a sound: the fitting, the power-up and the relay console. */
function phaseFiveSounds(s: State, p: State) {
  if (s.stage !== p.stage) {
    if (s.stage === 'fitting') { sfx.play('mech.lift'); sfx.play('mech.clunk', { delay: 2.7 }); sfx.play('mech.cable-plug', { delay: 4.1 }); }
    if (s.stage === 'testing') { sfx.play('power.whine-up'); sfx.play('baymax.eyes', { delay: .5 }); sfx.play('power.strain', { delay: .3 }); sfx.play('servo.groan', { delay: 1.4 }); sfx.play('servo.groan', { delay: 3, pitch: 1.12 }); }
    if (s.stage === 'held') { sfx.play('servo.groan', { gain: .7, pitch: .9 }); sfx.play('mech.clunk', { gain: .4, delay: .5 }); }
    if (s.stage === 'transit') sfx.play('move.whoosh');
  }
  if (s.power > .55 && p.power <= .55) sfx.play('baymax.target');
  s.breakers.forEach((on, i) => { if (on !== p.breakers[i]) sfx.play('relay.breaker', { pitch: on ? 1 + i * .04 : .85 }); });
  if (s.powered && !p.powered) sfx.play('relay.main');
  if (s.leads > p.leads) sfx.play('relay.patch');
  if (s.az !== p.az || s.el !== p.el) sfx.play('dish.motor', { pitch: .85 + s.el / 160 });
  if (s.fixes > p.fixes) sfx.play('trace.blip', { pitch: 1 + s.fixes * .12 });
  if (s.traced && !p.traced) { sfx.play('trace.extrapolate'); sfx.play('sting.boundary', { delay: 2 }); }
  if (s.task > p.task) sfx.play('ui.confirm');
}

// ------------------------------------------------------------------ 3D

/** Shifts the 3D view right so its centre sits in the space beside the left panel, not under it. */
function useCentreBesidePanel() {
  const { camera, gl } = useThree();
  const stage = useP5(s => s.stage);
  useEffect(() => {
    const panel = document.querySelector('.p5-panel');
    const measure = () => {
      const shift = panel && gl.domElement.clientWidth > 720 ? Math.round(panel.getBoundingClientRect().right / 2) : 0;
      const w = gl.domElement.clientWidth, h = gl.domElement.clientHeight;
      (camera as T.PerspectiveCamera).setViewOffset(w + shift * 2, h, 0, 0, w, h);
    };
    const observer = new ResizeObserver(measure); observer.observe(gl.domElement); if (panel) observer.observe(panel); measure();
    return () => { observer.disconnect(); (camera as T.PerspectiveCamera).clearViewOffset(); };
  }, [camera, gl, stage]);
}

function BayScene({ onReady, onError }: { onReady: () => void; onError: () => void }) {
  const { scene, camera, gl } = useThree();
  const zoom = useMemo(() => new ZoomController({ min: .82, max: 1.2, step: .01 }, 1), []);
  useEffect(() => { const off = zoom.bind(gl.domElement); zoom.setEnabled(true); return () => { off(); zoom.dispose(); }; }, [gl, zoom]);
  const [bay, setBay] = useState<Bay | null>(null);
  const rig = useMemo(() => new CameraShot(), []);
  const pos = useMemo(() => new T.Vector3(), []), focus = useMemo(() => new T.Vector3(), []);
  const motion = useRef({ fitted: 0, power: 0, since: 0, pressed: false, clicked: false, inInsert: false, back: new T.Vector3(), backQ: new T.Quaternion() });
  // Hiro's own regulator remote: POWER HIM UP is his thumb on it, seen close, before the load comes on.
  const hands = useMemo(createFirstPersonHands, []);
  useEffect(() => { const parent = camera.parent; scene.add(camera); camera.add(hands.root); hands.root.visible = false; return () => { hands.dispose(); if (parent) parent.add(camera); else camera.removeFromParent(); }; }, [scene, camera, hands]);
  useCentreBesidePanel();
  useEffect(() => {
    let alive = true, made: Bay | null = null;
    createBay().then(b => {
      if (!alive) { b.dispose(); return; }
      made = b; scene.add(b.district.group);
      const front = new T.Vector3(0, 0, 1).applyQuaternion(b.model.quaternion);
      pos.copy(b.body).addScaledVector(front, 9.8); pos.y = b.body.y + 3.6;
      focus.copy(b.body).setY(b.body.y + .3); camera.position.copy(pos); camera.lookAt(focus);
      setBay(b);
    }).catch(onError);
    return () => { alive = false; if (made) { scene.remove(made.district.group); made.dispose(); } };
  }, [scene, camera, pos, focus, onError]);
  useFrame(({ clock, pointer }, delta) => {
    if (!bay) return;
    const dt = Math.min(delta, .05), s = useP5.getState(), t = clock.elapsedTime;
    // The unit is carried over and seated while FIT runs; POWER drives him up against the limit.
    const m = motion.current;
    m.fitted = s.stage === 'fitting' ? (reducedMotion ? 1 : Math.min(1, m.fitted + dt / 4.8)) : s.stage === 'fit' ? 0 : 1;
    if (s.stage === 'testing' && !m.pressed) {
      m.pressed = true; m.clicked = reducedMotion; m.inInsert = !reducedMotion;
      m.back.copy(camera.position); m.backQ.copy(camera.quaternion);
      if (!reducedMotion) hands.press(() => { sfx.play('ui.toggle'); m.clicked = true; }, () => { m.inInsert = false; });
    }
    if (s.stage !== 'testing') { m.pressed = false; m.inInsert = false; }
    hands.root.visible = s.stage === 'testing';
    hands.update(t, dt, { walk: 0, gait: 0, raise: m.inInsert ? 1 : .1, reach: 0 });
    m.power = s.stage === 'testing' ? (m.clicked ? Math.min(1, m.power + (reducedMotion ? 1 : dt / 4.5)) : 0) : ['held', 'transit'].includes(s.stage) ? 1 : 0;
    m.since += dt;
    if (['fitting', 'testing'].includes(s.stage) && (m.since > .1 || m.fitted === 1 && s.fitted !== 1 || m.power === 1 && s.power !== 1)) {
      m.since = 0; useP5.setState({ fitted: m.fitted, power: m.power });
    }
    bay.update(t, dt, { fitted: m.fitted, power: m.power, held: s.stage === 'held' });
    // Stay on the chest-facing side of the semi-reclined pose. The old side-on shot projected
    // his whole body into a horizontal stack and made the correctly seated regulator look upright.
    const b = bay.body, close = s.stage === 'testing' || s.stage === 'held' ? 1 : 0;
    const distance = zoom.update(dt, reducedMotion ? 20 : 7);
    const front = new T.Vector3(0, 0, 1).applyQuaternion(bay.model.quaternion).normalize();
    pos.copy(b).addScaledVector(front, (9.8 - close * .45) * distance).addScaledVector(bay.side, 1.1 * close);
    pos.y = b.y + 3.6 - close * .2;
    focus.copy(b).setY(b.y + .3);
    rig.update(camera, close ? 'test' : 'fit', pos, focus, dt, 1.65);
    camera.rotateY(pointer.x * .008); camera.rotateX(pointer.y * .005);
  });
  return <SceneQuality ready={!!bay} manageDpr={false} onReady={onReady} onError={onError} />;
}

function FacilityScene({ onReady, onError }: { onReady: () => void; onError: () => void }) {
  const { scene, camera, size } = useThree();
  const facility = useMemo(createFacility, []);
  const rig = useMemo(() => new CameraShot(), []);
  const pos = useMemo(() => new T.Vector3(), []), focus = useMemo(() => new T.Vector3(), []);
  const route = useRef<{ key: string; leg: number; shots: { p: [number, number, number]; l: [number, number, number]; duration: number }[] }>({ key: '', leg: 0, shots: [] });
  useCentreBesidePanel();
  useEffect(() => {
    scene.add(facility.root); camera.position.set(...FACILITY_SHOTS.power[0]); camera.lookAt(new T.Vector3(...FACILITY_SHOTS.power[1]));
    return () => { scene.remove(facility.root); facility.dispose(); };
  }, [scene, camera, facility]);
  useFrame(({ clock, pointer }, delta) => {
    const dt = Math.min(delta, .05), s = useP5.getState();
    facility.update(clock.elapsedTime, dt, { powered: s.powered, leads: s.leads, snr: s.snr, az: s.az, el: s.el, strength: strengthOf(s.az, s.el), traced: s.traced, breakers: s.breakers, traceCount: s.fixes, readout: s.stage === 'found' || TASKS[s.task] === 'trace' }, camera);
    const key = s.stage === 'found' ? 'done' : TASKS[s.task] ?? 'done';
    const [p, l] = FACILITY_SHOTS[key];
    const r = route.current;
    if (r.key !== key) {
      r.key = key; r.leg = 0; r.shots = facilityCameraRoute(camera.position, key);
    }
    const shot = r.shots[r.leg]; pos.set(...shot.p); focus.set(...shot.l);
    if (rig.update(camera, `${key}/${r.leg}`, pos, focus, dt, shot.duration) && r.leg < r.shots.length - 1) r.leg++;
    camera.rotateY(pointer.x * .01); camera.rotateX(pointer.y * .006);
  });
  return <>
    <color attach="background" args={['#081320']} />
    <fog attach="fog" args={['#14293b', 14, 150]} />
    <SceneQuality manageDpr={false} onReady={onReady} onError={onError} />
  </>;
}

// ------------------------------------------------------------------ console tasks

function PowerTask({ done }: { done: () => void }) {
  const breakers = useP5(s => s.breakers);
  const [note, setNote] = useState('The relay is running on its emergency battery. Something tripped the main breaker.');
  const load = CIRCUITS.reduce((sum, c, i) => sum + (breakers[i] ? c.amps : 0), 0);
  const flip = (i: number) => useP5.setState(st => ({ breakers: st.breakers.map((b, j) => j === i ? !b : b) }));
  const close = () => {
    if (load > BATTERY) { sfx.play('relay.trip'); setNote(`Tripped again: ${load} A on a ${BATTERY} A battery.`); return; }
    const missing = CIRCUITS.filter((c, i) => c.need && !breakers[i]).map(c => c.label.toLowerCase());
    if (missing.length) { sfx.play('ui.deny'); setNote(`The main holds, but there's no feed to the ${missing.join(' or the ')}.`); return; }
    useP5.setState({ powered: true }); setNote('Main closed. Consoles and receiver are live.'); done();
  };
  return <>
    <p className="p5-body">Four circuits share one {BATTERY} A battery. The consoles and the receiver are what matter.</p>
    <div className="p5-breakers">{CIRCUITS.map((c, i) => <button key={c.id} aria-pressed={breakers[i]} onClick={() => flip(i)}>
      <i className={breakers[i] ? 'on' : ''} /><b>{c.label}</b><span>{c.amps} A</span>
    </button>)}</div>
    <div className={`p5-meter ${load > BATTERY ? 'over' : ''}`}><span>LOAD</span><b>{load} / {BATTERY} A</b><i style={{ width: `${Math.min(100, load / BATTERY * 100)}%` }} /></div>
    <button className="p5-primary" onClick={close}>CLOSE MAIN BREAKER</button>
    <p className="p5-note" role="status">{note}</p>
  </>;
}

const OUTS = [{ id: 'dish', label: 'DISH FEED', type: 'RF · 12 GHz' }, { id: 'lna', label: 'LNA OUT', type: 'IF · 1.2 GHz' }, { id: 'filter', label: 'FILTER OUT', type: 'BASEBAND' }];
const INS = [{ id: 'decoder', label: 'DECODER IN', type: 'BASEBAND' }, { id: 'lnaIn', label: 'LNA IN', type: 'RF · 12 GHz' }, { id: 'filterIn', label: 'FILTER IN', type: 'IF · 1.2 GHz' }];
function PatchTask({ done }: { done: () => void }) {
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState('The leads were torn out of the patch panel. Pick an output, then the input it feeds.');
  const connect = (inId: string) => {
    if (!picked) { sfx.play('ui.deny'); setNote('Pick an output first.'); return; }
    const out = OUTS.find(o => o.id === picked)!, inp = INS.find(i => i.id === inId)!;
    if (Object.values(pairs).includes(inId)) { sfx.play('ui.deny'); setNote(`${inp.label} is already patched.`); return; }
    if (out.type !== inp.type) { sfx.play('ui.deny'); setNote(`${inp.label} takes ${inp.type}. ${out.label} carries ${out.type}.`); setPicked(null); return; }
    const next = { ...pairs, [out.id]: inId }; setPairs(next); setPicked(null);
    useP5.setState({ leads: Object.keys(next).length });
    if (Object.keys(next).length === 3) { setNote('Dish → amplifier → filter → decoder. The chain is whole.'); done(); }
    else setNote(`${out.label} → ${inp.label}. Patched.`);
  };
  const y = (i: number) => 26 + i * 52;
  return <>
    <div className="p5-patch-wrap">
      <svg className="p5-patch" viewBox="0 0 300 160" aria-hidden="true">
        {OUTS.map((o, i) => pairs[o.id] && <line key={o.id} x1={86} y1={y(i)} x2={214} y2={y(INS.findIndex(n => n.id === pairs[o.id]))} />)}
      </svg>
      <div className="p5-patchgrid">
        <div>{OUTS.map(o => <button key={o.id} aria-pressed={picked === o.id} disabled={!!pairs[o.id]} data-sfx="relay.pick" onClick={() => setPicked(o.id)}><b>{o.label}</b><span>{o.type}</span></button>)}</div>
        <div>{INS.map(i => <button key={i.id} disabled={Object.values(pairs).includes(i.id)} onClick={() => connect(i.id)}><b>{i.label}</b><span>{i.type}</span></button>)}</div>
      </div>
    </div>
    <p className="p5-note" role="status">{note}</p>
  </>;
}

const PEAKS = [28, 81], CARRIER = 63;
const cover = (notch: number, f: number) => Math.exp(-(((notch - f) / 3) ** 2));
function snrFor(n: [number, number]) {
  return -8 + 10 * Math.max(cover(n[0], PEAKS[0]), cover(n[1], PEAKS[0])) + 10 * Math.max(cover(n[0], PEAKS[1]), cover(n[1], PEAKS[1])) - 25 * Math.max(cover(n[0], CARRIER), cover(n[1], CARRIER));
}
function SpectrumTask({ done }: { done: () => void }) {
  const [notches, setNotches] = useState<[number, number]>([10, 45]);
  const snr = snrFor(notches);
  useEffect(() => { useP5.setState({ snr }); }, [snr]);
  const path = useMemo(() => {
    let d = '';
    for (let f = 0; f <= 100; f += .5) {
      let a = 8 + 3 * Math.sin(f * 1.7) * Math.sin(f * .37) + 18 * Math.exp(-(((f - CARRIER) / 1.6) ** 2)) + 58 * Math.exp(-(((f - PEAKS[0]) / 2.6) ** 2)) + 50 * Math.exp(-(((f - PEAKS[1]) / 3.2) ** 2));
      a *= (1 - .94 * cover(notches[0], f)) * (1 - .94 * cover(notches[1], f));
      d += `${f === 0 ? 'M' : 'L'}${f * 3},${130 - a * 1.6}`;
    }
    return d;
  }, [notches]);
  const ok = snr >= 9;
  return <>
    <p className="p5-body">Something under the portal hum is repeating. Two notch filters can cut the hum, but not the signal itself.</p>
    <svg className="p5-spectrum" viewBox="0 0 300 140" role="img" aria-label="Receiver spectrum">
      <path d={path} />
      {notches.map((n, i) => <line key={i} x1={n * 3} x2={n * 3} y1={6} y2={134} className="notch" />)}
      <text x={4} y={136}>0</text><text x={270} y={136}>100 MHz</text>
    </svg>
    {notches.map((n, i) => <label key={i} className="p5-slider">NOTCH {i + 1} <output>{n.toFixed(1)}</output>
      <input type="range" min={0} max={100} step={.5} value={n} aria-label={`Notch ${i + 1} frequency`}
        onChange={e => { sfx.play('signal.sweep', { pitch: Number(e.target.value) / 100 }); setNotches(i === 0 ? [Number(e.target.value), notches[1]] : [notches[0], Number(e.target.value)]); }} />
    </label>)}
    <div className={`p5-meter ${ok ? 'good' : ''}`}><span>SIGNAL / NOISE</span><b>{snr.toFixed(1)} dB</b><i style={{ width: `${Math.max(0, Math.min(100, (snr + 10) / 25 * 100))}%` }} /></div>
    <button className="p5-primary" disabled={!ok} data-sfx="signal.lock" onClick={done}>{ok ? 'LOCK FILTERS' : 'NEED 9 dB TO DECODE'}</button>
    <p className="p5-note" role="status">{snr < -15 ? 'That notch is on the signal. It went with the hum.' : ok ? 'The carrier stands clear of the noise.' : 'Put each notch on a hum peak.'}</p>
  </>;
}

function DishTask({ done }: { done: () => void }) {
  const { az, el } = useP5();
  const strength = strengthOf(az, el), ok = strength >= 90;
  const azDelta = ((TARGET_AZ - az + 540) % 360) - 180;
  const adjust = (axis: 'az' | 'el', amount: number) => useP5.setState(s => axis === 'az' ? { az: (s.az + amount + 360) % 360 } : { el: T.MathUtils.clamp(s.el + amount, 0, 80) });
  return <>
    <p className="p5-body">The recording points southwest, above the roofline. Sweep toward that sector, then use 1° adjustments to peak the return.</p>
    <div className="p5-bearing" aria-label="Recorded bearing sector"><span>RECORDED SECTOR</span><b>SW / 200–225°</b><span>ROOFLINE</span><b>30–45° UP</b></div>
    <label className="p5-slider">AZIMUTH <output>{az}°</output><input type="range" min={0} max={359} value={az} aria-label="Dish azimuth" onChange={e => useP5.setState({ az: Number(e.target.value) })} /></label>
    <div className="p5-fine"><button aria-label="Decrease azimuth by one degree" onClick={() => adjust('az', -1)}>− 1°</button><span>{Math.abs(azDelta) < 3 ? 'BEARING CENTRED' : azDelta > 0 ? '↻ TURN CLOCKWISE' : '↺ TURN COUNTERCLOCKWISE'}</span><button aria-label="Increase azimuth by one degree" onClick={() => adjust('az', 1)}>+ 1°</button></div>
    <label className="p5-slider">ELEVATION <output>{el}°</output><input type="range" min={0} max={80} value={el} aria-label="Dish elevation" onChange={e => useP5.setState({ el: Number(e.target.value) })} /></label>
    <div className="p5-fine"><button aria-label="Decrease elevation by one degree" onClick={() => adjust('el', -1)}>− 1°</button><span>{Math.abs(el - TARGET_EL) < 2 ? 'ELEVATION CENTRED' : el < TARGET_EL ? '↑ RAISE THE DISH' : '↓ LOWER THE DISH'}</span><button aria-label="Increase elevation by one degree" onClick={() => adjust('el', 1)}>+ 1°</button></div>
    <div className={`p5-meter ${ok ? 'good' : ''}`}><span>RETURN</span><b>{strength.toFixed(0)}%</b><i style={{ width: `${strength}%` }} /></div>
    <button className="p5-primary" disabled={!ok} data-sfx="dish.lock" onClick={done}>{ok ? 'LOCK RECEIVER' : 'PEAK THE RETURN (90%+)'}</button>
    <p className="p5-note" role="status">{ok ? 'Return peaked. Lock this bearing to read the recording.' : strength > 40 ? 'Signal acquired. Fine-tune both axes.' : 'Follow the bearing guidance to acquire the signal.'}</p>
    <button className="p5-reset" onClick={() => useP5.setState({ az: 140, el: 15 })}>RESET CALIBRATION</button>
  </>;
}

function TraceTask({ done }: { done: () => void }) {
  const traced = useP5(s => s.traced);
  const [note, setNote] = useState('The receiver has it. The middle screen shows where the healthcare chip’s signal went.');
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const save = () => { if (useP5.getState().traced) return; useP5.setState({ traced: true, fixes: 4 }); setNote('Saved to RX/06. It isn’t in this city; the trace ends at the old portal site.'); timer.current = window.setTimeout(done, 2600); };
  return <>
    <p className="p5-body">The chip’s last transmission, on the console screen.</p>
    <dl className="p5-readout"><div><dt>HEADING</dt><dd>OUTBOUND</dd></div><div><dt>LOCAL SIGNAL</dt><dd>NONE</dd></div><div><dt>LAST FIX</dt><dd>OLD PORTAL SITE</dd></div></dl>
    {!traced && <button className="p5-primary" onClick={save}>SAVE IT TO RX/06</button>}
    <p className="p5-note" role="status">{note}</p>
  </>;
}

// ------------------------------------------------------------------ page

export function PhaseFive({ initial: from }: { initial: PhaseFiveStep }) {
  const [dpr, setDpr] = useState(1);
  useState(() => { useP5.setState(initial(from)); return 0; });
  const s = useP5();
  const sceneKey = ['fit', 'fitting', 'test', 'testing', 'held', 'transit'].includes(s.stage) ? 'bay' : 'facility';
  const [readyScene, setReadyScene] = useState('');
  const [loadError, setLoadError] = useState('');
  const onReady = useCallback(() => setReadyScene(sceneKey), [sceneKey]);
  const onLoadError = useCallback(() => setLoadError('This scene could not be loaded.'), []);
  useEffect(() => useP5.subscribe(phaseFiveSounds), []);
  const atBayNow = ['fit', 'fitting', 'test', 'testing', 'held'].includes(s.stage);
  useSfxBed('harbour', atBayNow || s.stage === 'transit'); useSfxBed('combat-hum', atBayNow && s.power > .2, .9);
  useSfxBed('relay', !atBayNow && s.stage !== 'transit'); useSfxBed('relay-power', s.powered && !atBayNow); useUiSfx();
  const advancing = useRef(false), advanceTimer = useRef<number | null>(null);
  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); }, []);
  // Warm up whatever comes next once the trace is found.
  useEffect(() => { if (s.stage === 'found') void phaseFiveExit()?.prepare?.().catch(() => {}); }, [s.stage]);
  const advanceTask = () => {
    if (advancing.current) return;
    advancing.current = true;
    advanceTimer.current = window.setTimeout(() => {
      const next = useP5.getState().task + 1;
      useP5.setState(next >= TASKS.length ? { stage: 'found' } : { task: next });
      advancing.current = false;
    }, 900);
  };

  useEffect(() => {
    if (s.stage === 'fitting' && s.fitted >= 1) useP5.setState({ stage: 'test' });
    if (s.stage === 'testing' && s.power >= 1) { const t = window.setTimeout(() => useP5.setState({ stage: 'held' }), 900); return () => window.clearTimeout(t); }
    if (s.stage === 'transit') transitionChapter(() => useP5.setState({ stage: 'facility' }), true);
  }, [s.stage, s.fitted, s.power]);

  const atBay = ['fit', 'fitting', 'test', 'testing', 'held'].includes(s.stage);
  const motor = Math.round(35 * Math.min(1, s.power * 1.3)), target = s.power > .55;
  const task = TASKS[s.task];
  return <main className={`p5 p5-stage-${s.stage}`} aria-label="Limiter test and telemetry trace">
    <div className="p5-world">
      <Canvas shadows={false} dpr={dpr} camera={{ fov: 46, near: .1, far: 400, position: [0, 3, 8] }} gl={{ antialias: true, powerPreference: 'high-performance' }}><AdaptiveDpr onChange={setDpr} />
        {atBay || s.stage === 'transit' ? <BayScene onReady={onReady} onError={onLoadError} /> : <FacilityScene onReady={onReady} onError={onLoadError} />}
      </Canvas>
    </div>
    <div className="p5-grade" aria-hidden="true" />
    <SoundToggle />
    <SceneCurtain ready={readyScene === sceneKey} error={loadError} />

    {atBay && <aside className="p5-panel p5-bay-panel" aria-live="polite">
      {(s.stage === 'fit' || s.stage === 'fitting') && <>
        <p className="p5-kicker">BACK AT THE BAY <span>01 / 02</span></p>
        <h1>Fit the regulator.</h1>
        <p className="p5-body">The regulator seats on his chest mount, then its feed connects to the service bay.</p>
        <button className="p5-primary" disabled={s.stage === 'fitting'} onClick={() => useP5.setState({ stage: 'fitting' })}>{s.stage === 'fitting' ? 'SEATING…' : 'FIT THE REGULATOR'}</button>
      </>}
      {(s.stage === 'test' || s.stage === 'testing' || s.stage === 'held') && <>
        <p className="p5-kicker">OUTPUT TEST <span>02 / 02</span></p>
        <h1>{s.stage === 'held' ? <>It holds.<br /><em>He doesn&apos;t stop.</em></> : 'Power him up.'}</h1>
        <p className="p5-body">{s.stage === 'held'
          ? 'Slow enough to stay out of reach. He is still running the combat program and still looking for Hiro. The limiter bought time, not control.'
          : 'If the limit holds, he can move, but only so far and so fast. Stand clear.'}</p>
        <dl className="p5-readout">
          <div><dt>MOTOR OUTPUT</dt><dd><i className="ghost" /><i style={{ width: `${motor}%` }} /><b>{motor}%</b></dd></div>
          <div><dt>THRUSTER OUTPUT</dt><dd><i className="ghost" /><i style={{ width: `${motor}%` }} /><b>{motor}%</b></dd></div>
          <div><dt>COMBAT PROGRAM</dt><dd className="tone-red">{s.power > .2 ? 'ACTIVE' : '—'}</dd></div>
          <div><dt>TARGET</dt><dd className="tone-red">{target ? 'HIRO HAMADA' : '—'}</dd></div>
          <div><dt>SAFE WINDOW</dt><dd className="tone-warm">{s.stage === 'held' ? 'TEMPORARY' : '—'}</dd></div>
        </dl>
        {s.stage === 'test' && <button className="p5-primary" onClick={() => useP5.setState({ stage: 'testing' })}>POWER HIM UP</button>}
        {s.stage === 'held' && <button className="p5-primary" onClick={() => useP5.setState({ stage: 'transit' })}>HEAD DEEPER INTO THE CITY <i>→</i></button>}
      </>}
    </aside>}


    {(s.stage === 'facility' || s.stage === 'found') && <>
      {s.stage === 'facility' && <aside className="p5-panel p5-console" aria-live="polite">
        <p className="p5-kicker">TELEMETRY RELAY <span>{String(s.task + 1).padStart(2, '0')} / 05</span></p>
        <ol className="p5-steps">{TASKS.map((t, i) => <li key={t} className={i < s.task ? 'done' : i === s.task ? 'active' : ''}>{TASK_NAMES[t]}</li>)}</ol>
        {s.stage === 'facility' && <>
          <h1>{TASK_NAMES[task]}</h1>
          {task === 'power' && <PowerTask key="power" done={advanceTask} />}
          {task === 'patch' && <PatchTask key="patch" done={advanceTask} />}
          {task === 'spectrum' && <SpectrumTask key="spectrum" done={advanceTask} />}
          {task === 'dish' && <DishTask key="dish" done={advanceTask} />}
          {task === 'trace' && <TraceTask key="trace" done={advanceTask} />}
        </>}
      </aside>}
      {s.stage === 'found' && <aside className="p5-panel p5-end" role="dialog" aria-labelledby="p5-found-title">
        <p className="p5-kicker">TRACE COMPLETE <span>05 / 05</span></p>
        <ol className="p5-steps">{TASKS.map(t => <li key={t} className="done">{TASK_NAMES[t]}</li>)}</ol>
        <h1 id="p5-found-title">Signal crossed the boundary.</h1>
        <p className="p5-body">The healthcare chip’s last transmission climbed out of the city and went straight through the portal. Nothing here is answering.</p>
        <dl className="p5-readout">
          <div><dt>LAST FIX</dt><dd>T−2 MIN · 400 M UP</dd></div>
          <div><dt>HEADING</dt><dd>PORTAL BOUNDARY</dd></div>
          <div><dt>LOCAL SIGNAL</dt><dd>NONE</dd></div>
          <div><dt>HEALTHCARE CHIP</dt><dd className="tone-red">NOT IN THIS CITY</dd></div>
        </dl>
        <p className="p5-note">Wherever it went, Hiro has to follow. The limiter is holding Baymax, for now.</p>
        {phaseFiveExit() && <button className="p5-primary" onClick={phaseFiveExit()!.go}>{phaseFiveExit()!.label} <i>→</i></button>}
      </aside>}
    </>}
  </main>;
}
