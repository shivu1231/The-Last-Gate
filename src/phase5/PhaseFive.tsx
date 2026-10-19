import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
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

type Stage =
  | 'fit'
  | 'fitting'
  | 'test'
  | 'testing'
  | 'held'
  | 'transit'
  | 'facility'
  | 'found';
/**
 * Ordered telemetry repair/calibration task identifier.
 */
type TelemetryTask = 'power' | 'patch' | 'spectrum' | 'dish' | 'trace';
const TASKS: TelemetryTask[] = ['power', 'patch', 'spectrum', 'dish', 'trace'];
const TASK_NAMES: Record<TelemetryTask, string> = {
  power: 'Restore console power',
  patch: 'Reconnect the signal path',
  spectrum: 'Remove interference',
  dish: 'Calibrate the receiver',
  trace: 'Read the last transmission',
};
const CIRCUITS = [
  { id: 'console', label: 'CONSOLES', amps: 12, need: true },
  { id: 'receiver', label: 'RECEIVER', amps: 18, need: true },
  { id: 'lights', label: 'LIGHTING', amps: 15, need: false },
  { id: 'hvac', label: 'HVAC', amps: 22, need: false },
] as const;
const BATTERY = 40,
  TARGET_AZ = 212,
  TARGET_EL = 38;

/**
 * Regulator-test and telemetry-relay state consumed by the chapter.
 */
type TelemetryState = {
  stage: Stage;
  task: number;
  fitted: number;
  power: number;
  breakers: boolean[];
  powered: boolean;
  leads: number;
  snr: number;
  az: number;
  el: number;
  traced: boolean;
  fixes: number;
};
const initial = (from: PhaseFiveStep): TelemetryState => ({
  stage: from === 'facility' ? 'facility' : 'fit',
  task: 0,
  fitted: 0,
  power: 0,
  breakers: [false, false, true, true],
  powered: false,
  leads: 0,
  snr: -8,
  az: 140,
  el: 15,
  traced: false,
  fixes: 0,
});
const useP5 = create<TelemetryState>(() => initial('limiter'));
// Development only: lets tooling jump between beats (window.__lastGateP5.setState({...})).
if (import.meta.env.DEV)
  (window as Window & { __lastGateP5?: typeof useP5 }).__lastGateP5 = useP5;
const strengthOf = (az: number, el: number) => {
  const daz = ((az - TARGET_AZ + 540) % 360) - 180,
    del = el - TARGET_EL;
  return 100 * Math.exp(-((daz / 22) ** 2) - (del / 11) ** 2);
};

/** Every state change that makes a sound: the fitting, the power-up and the relay console. */
function phaseFiveSounds(state: TelemetryState, state2: TelemetryState) {
  if (state.stage !== state2.stage) {
    if (state.stage === 'fitting') {
      sfx.play('mech.lift');
      sfx.play('mech.clunk', { delay: 2.7 });
      sfx.play('mech.cable-plug', { delay: 4.1 });
    }
    if (state.stage === 'testing') {
      sfx.play('power.whine-up');
      sfx.play('baymax.eyes', { delay: 0.5 });
      sfx.play('power.strain', { delay: 0.3 });
      sfx.play('servo.groan', { delay: 1.4 });
      sfx.play('servo.groan', { delay: 3, pitch: 1.12 });
    }
    if (state.stage === 'held') {
      sfx.play('servo.groan', { gain: 0.7, pitch: 0.9 });
      sfx.play('mech.clunk', { gain: 0.4, delay: 0.5 });
    }
    if (state.stage === 'transit') sfx.play('move.whoosh');
  }
  if (state.power > 0.55 && state2.power <= 0.55) sfx.play('baymax.target');
  state.breakers.forEach((on, index) => {
    if (on !== state2.breakers[index])
      sfx.play('relay.breaker', { pitch: on ? 1 + index * 0.04 : 0.85 });
  });
  if (state.powered && !state2.powered) sfx.play('relay.main');
  if (state.leads > state2.leads) sfx.play('relay.patch');
  if (state.az !== state2.az || state.el !== state2.el)
    sfx.play('dish.motor', { pitch: 0.85 + state.el / 160 });
  if (state.fixes > state2.fixes)
    sfx.play('trace.blip', { pitch: 1 + state.fixes * 0.12 });
  if (state.traced && !state2.traced) {
    sfx.play('trace.extrapolate');
    sfx.play('sting.boundary', { delay: 2 });
  }
  if (state.task > state2.task) sfx.play('ui.confirm');
}

// ------------------------------------------------------------------ 3D

/** Shifts the 3D view right so its centre sits in the space beside the left panel, not under it. */
function useCentreBesidePanel() {
  const { camera, gl } = useThree();
  const stage = useP5((state) => state.stage);
  useEffect(() => {
    const panel = document.querySelector('.p5-panel');
    const measure = () => {
      const shift =
        panel && gl.domElement.clientWidth > 720
          ? Math.round(panel.getBoundingClientRect().right / 2)
          : 0;
      const width = gl.domElement.clientWidth,
        height = gl.domElement.clientHeight;
      (camera as THREE.PerspectiveCamera).setViewOffset(
        width + shift * 2,
        height,
        0,
        0,
        width,
        height,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(gl.domElement);
    if (panel) observer.observe(panel);
    measure();
    return () => {
      observer.disconnect();
      (camera as THREE.PerspectiveCamera).clearViewOffset();
    };
  }, [camera, gl, stage]);
}

/**
 * Mount the regulator-fitting world and its existing camera/animation sequence.
 */
function BayScene({
  onReady,
  onError,
}: {
  onReady: () => void;
  onError: () => void;
}) {
  const { scene, camera, gl } = useThree();
  const zoom = useMemo(
    () => new ZoomController({ min: 0.82, max: 1.2, step: 0.01 }, 1),
    [],
  );
  useEffect(() => {
    const off = zoom.bind(gl.domElement);
    zoom.setEnabled(true);
    return () => {
      off();
      zoom.dispose();
    };
  }, [gl, zoom]);
  const [bay, setBay] = useState<Bay | null>(null);
  const rig = useMemo(() => new CameraShot(), []);
  const position = useMemo(() => new THREE.Vector3(), []),
    focus = useMemo(() => new THREE.Vector3(), []);
  const motion = useRef({
    fitted: 0,
    power: 0,
    since: 0,
    pressed: false,
    clicked: false,
    inInsert: false,
    back: new THREE.Vector3(),
    backQ: new THREE.Quaternion(),
  });
  // Hiro's own regulator remote: POWER HIM UP is his thumb on it, seen close, before the load comes on.
  const hands = useMemo(createFirstPersonHands, []);
  useEffect(() => {
    const parent = camera.parent;
    scene.add(camera);
    camera.add(hands.root);
    hands.root.visible = false;
    return () => {
      hands.dispose();
      if (parent) parent.add(camera);
      else camera.removeFromParent();
    };
  }, [scene, camera, hands]);
  useCentreBesidePanel();
  useEffect(() => {
    let alive = true,
      made: Bay | null = null;
    createBay()
      .then((endPoint) => {
        if (!alive) {
          endPoint.dispose();
          return;
        }
        made = endPoint;
        scene.add(endPoint.district.group);
        const front = new THREE.Vector3(0, 0, 1).applyQuaternion(
          endPoint.model.quaternion,
        );
        position.copy(endPoint.body).addScaledVector(front, 9.8);
        position.y = endPoint.body.y + 3.6;
        focus.copy(endPoint.body).setY(endPoint.body.y + 0.3);
        camera.position.copy(position);
        camera.lookAt(focus);
        setBay(endPoint);
      })
      .catch(onError);
    return () => {
      alive = false;
      if (made) {
        scene.remove(made.district.group);
        made.dispose();
      }
    };
  }, [scene, camera, position, focus, onError]);
  useFrame(({ clock, pointer }, delta) => {
    if (!bay) return;
    const deltaSeconds = Math.min(delta, 0.05),
      state = useP5.getState(),
      elapsedSeconds = clock.elapsedTime;
    // The unit is carried over and seated while FIT runs; POWER drives him up against the limit.
    const vector = motion.current;
    vector.fitted =
      state.stage === 'fitting'
        ? reducedMotion
          ? 1
          : Math.min(1, vector.fitted + deltaSeconds / 4.8)
        : state.stage === 'fit'
          ? 0
          : 1;
    if (state.stage === 'testing' && !vector.pressed) {
      vector.pressed = true;
      vector.clicked = reducedMotion;
      vector.inInsert = !reducedMotion;
      vector.back.copy(camera.position);
      vector.backQ.copy(camera.quaternion);
      if (!reducedMotion)
        hands.press(
          () => {
            sfx.play('ui.toggle');
            vector.clicked = true;
          },
          () => {
            vector.inInsert = false;
          },
        );
    }
    if (state.stage !== 'testing') {
      vector.pressed = false;
      vector.inInsert = false;
    }
    hands.root.visible = state.stage === 'testing';
    hands.update(elapsedSeconds, deltaSeconds, {
      walk: 0,
      gait: 0,
      raise: vector.inInsert ? 1 : 0.1,
      reach: 0,
    });
    vector.power =
      state.stage === 'testing'
        ? vector.clicked
          ? Math.min(1, vector.power + (reducedMotion ? 1 : deltaSeconds / 4.5))
          : 0
        : ['held', 'transit'].includes(state.stage)
          ? 1
          : 0;
    vector.since += deltaSeconds;
    if (
      ['fitting', 'testing'].includes(state.stage) &&
      (vector.since > 0.1 ||
        (vector.fitted === 1 && state.fitted !== 1) ||
        (vector.power === 1 && state.power !== 1))
    ) {
      vector.since = 0;
      useP5.setState({ fitted: vector.fitted, power: vector.power });
    }
    bay.update(elapsedSeconds, deltaSeconds, {
      fitted: vector.fitted,
      power: vector.power,
      held: state.stage === 'held',
    });
    // Stay on the chest-facing side of the semi-reclined pose. The old side-on shot projected
    // his whole body into a horizontal stack and made the correctly seated regulator look upright.
    const endPoint = bay.body,
      close = state.stage === 'testing' || state.stage === 'held' ? 1 : 0;
    const distance = zoom.update(deltaSeconds, reducedMotion ? 20 : 7);
    const front = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(bay.model.quaternion)
      .normalize();
    position
      .copy(endPoint)
      .addScaledVector(front, (9.8 - close * 0.45) * distance)
      .addScaledVector(bay.side, 1.1 * close);
    position.y = endPoint.y + 3.6 - close * 0.2;
    focus.copy(endPoint).setY(endPoint.y + 0.3);
    rig.update(
      camera,
      close ? 'test' : 'fit',
      position,
      focus,
      deltaSeconds,
      1.65,
    );
    camera.rotateY(pointer.x * 0.008);
    camera.rotateX(pointer.y * 0.005);
  });
  return (
    <SceneQuality
      ready={!!bay}
      exposure={1}
      manageDpr={false}
      onReady={onReady}
      onError={onError}
    />
  );
}

/**
 * Mount the telemetry world and its authored console/receiver camera route.
 */
function FacilityScene({
  onReady,
  onError,
}: {
  onReady: () => void;
  onError: () => void;
}) {
  const { scene, camera, size } = useThree();
  const facility = useMemo(createFacility, []);
  const rig = useMemo(() => new CameraShot(), []);
  const position = useMemo(() => new THREE.Vector3(), []),
    focus = useMemo(() => new THREE.Vector3(), []);
  const route = useRef<{
    key: string;
    leg: number;
    shots: {
      p: [number, number, number];
      l: [number, number, number];
      duration: number;
    }[];
  }>({ key: '', leg: 0, shots: [] });
  useCentreBesidePanel();
  useEffect(() => {
    scene.add(facility.root);
    camera.position.set(...FACILITY_SHOTS.power[0]);
    camera.lookAt(new THREE.Vector3(...FACILITY_SHOTS.power[1]));
    return () => {
      scene.remove(facility.root);
      facility.dispose();
    };
  }, [scene, camera, facility]);
  useFrame(({ clock, pointer }, delta) => {
    const deltaSeconds = Math.min(delta, 0.05),
      state = useP5.getState();
    facility.update(
      clock.elapsedTime,
      deltaSeconds,
      {
        powered: state.powered,
        leads: state.leads,
        snr: state.snr,
        az: state.az,
        el: state.el,
        strength: strengthOf(state.az, state.el),
        traced: state.traced,
        breakers: state.breakers,
        traceCount: state.fixes,
        readout: state.stage === 'found' || TASKS[state.task] === 'trace',
      },
      camera,
    );
    const key =
      state.stage === 'found' ? 'done' : (TASKS[state.task] ?? 'done');
    const [point, entry] = FACILITY_SHOTS[key];
    const radius = route.current;
    if (radius.key !== key) {
      radius.key = key;
      radius.leg = 0;
      radius.shots = facilityCameraRoute(camera.position, key);
    }
    const shot = radius.shots[radius.leg];
    position.set(...shot.p);
    focus.set(...shot.l);
    if (
      rig.update(
        camera,
        `${key}/${radius.leg}`,
        position,
        focus,
        deltaSeconds,
        shot.duration,
      ) &&
      radius.leg < radius.shots.length - 1
    )
      radius.leg++;
    camera.rotateY(pointer.x * 0.01);
    camera.rotateX(pointer.y * 0.006);
  });
  return (
    <>
      <color attach="background" args={['#081320']} />
      <fog attach="fog" args={['#14293b', 14, 150]} />
      <SceneQuality
        exposure={0.98}
        manageDpr={false}
        onReady={onReady}
        onError={onError}
      />
    </>
  );
}

// ------------------------------------------------------------------ console tasks

/**
 * Render the power repair controls for the active chapter.
 */
function PowerTask({ done }: { done: () => void }) {
  const breakers = useP5((state) => state.breakers);
  const [note, setNote] = useState(
    'The relay is running on its emergency battery. Something tripped the main breaker.',
  );
  const load = CIRCUITS.reduce(
    (sum, context, index) => sum + (breakers[index] ? context.amps : 0),
    0,
  );
  const flip = (index: number) =>
    useP5.setState((st) => ({
      breakers: st.breakers.map((secondEntry, segmentIndex) =>
        segmentIndex === index ? !secondEntry : secondEntry,
      ),
    }));
  const close = () => {
    if (load > BATTERY) {
      sfx.play('relay.trip');
      setNote(`Tripped again: ${load} A on a ${BATTERY} A battery.`);
      return;
    }
    const missing = CIRCUITS.filter(
      (context, index) => context.need && !breakers[index],
    ).map((context) => context.label.toLowerCase());
    if (missing.length) {
      sfx.play('ui.deny');
      setNote(
        `The main holds, but there's no feed to the ${missing.join(' or the ')}.`,
      );
      return;
    }
    useP5.setState({ powered: true });
    setNote('Main closed. Consoles and receiver are live.');
    done();
  };
  return (
    <>
      <p className="p5-body">
        Four circuits share one {BATTERY} A battery. The consoles and the
        receiver are what matter.
      </p>
      <div className="p5-breakers">
        {CIRCUITS.map((context, index) => (
          <button
            key={context.id}
            aria-pressed={breakers[index]}
            onClick={() => flip(index)}
          >
            <i className={breakers[index] ? 'on' : ''} />
            <b>{context.label}</b>
            <span>{context.amps} A</span>
          </button>
        ))}
      </div>
      <div className={`p5-meter ${load > BATTERY ? 'over' : ''}`}>
        <span>LOAD</span>
        <b>
          {load} / {BATTERY} A
        </b>
        <i style={{ width: `${Math.min(100, (load / BATTERY) * 100)}%` }} />
      </div>
      <button className="p5-primary" onClick={close}>
        CLOSE MAIN BREAKER
      </button>
      <p className="p5-note" role="status">
        {note}
      </p>
    </>
  );
}

const OUTS = [
  { id: 'dish', label: 'DISH FEED', type: 'RF · 12 GHz' },
  { id: 'lna', label: 'LNA OUT', type: 'IF · 1.2 GHz' },
  { id: 'filter', label: 'FILTER OUT', type: 'BASEBAND' },
];
const INS = [
  { id: 'decoder', label: 'DECODER IN', type: 'BASEBAND' },
  { id: 'lnaIn', label: 'LNA IN', type: 'RF · 12 GHz' },
  { id: 'filterIn', label: 'FILTER IN', type: 'IF · 1.2 GHz' },
];
/**
 * Render the relay output/input patching interaction.
 */
function PatchTask({ done }: { done: () => void }) {
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState(
    'The leads were torn out of the patch panel. Pick an output, then the input it feeds.',
  );
  const connect = (inId: string) => {
    if (!picked) {
      sfx.play('ui.deny');
      setNote('Pick an output first.');
      return;
    }
    const out = OUTS.find((textValue) => textValue.id === picked)!,
      inp = INS.find((index) => index.id === inId)!;
    if (Object.values(pairs).includes(inId)) {
      sfx.play('ui.deny');
      setNote(`${inp.label} is already patched.`);
      return;
    }
    if (out.type !== inp.type) {
      sfx.play('ui.deny');
      setNote(
        `${inp.label} takes ${inp.type}. ${out.label} carries ${out.type}.`,
      );
      setPicked(null);
      return;
    }
    const next = { ...pairs, [out.id]: inId };
    setPairs(next);
    setPicked(null);
    useP5.setState({ leads: Object.keys(next).length });
    if (Object.keys(next).length === 3) {
      setNote('Dish → amplifier → filter → decoder. The chain is whole.');
      done();
    } else setNote(`${out.label} → ${inp.label}. Patched.`);
  };
  const yPosition = (index: number) => 26 + index * 52;
  return (
    <>
      <div className="p5-patch-wrap">
        <svg className="p5-patch" viewBox="0 0 300 160" aria-hidden="true">
          {OUTS.map(
            (textValue, index) =>
              pairs[textValue.id] && (
                <line
                  key={textValue.id}
                  x1={86}
                  y1={yPosition(index)}
                  x2={214}
                  y2={yPosition(
                    INS.findIndex((name) => name.id === pairs[textValue.id]),
                  )}
                />
              ),
          )}
        </svg>
        <div className="p5-patchgrid">
          <div>
            {OUTS.map((textValue) => (
              <button
                key={textValue.id}
                aria-pressed={picked === textValue.id}
                disabled={!!pairs[textValue.id]}
                data-sfx="relay.pick"
                onClick={() => setPicked(textValue.id)}
              >
                <b>{textValue.label}</b>
                <span>{textValue.type}</span>
              </button>
            ))}
          </div>
          <div>
            {INS.map((index) => (
              <button
                key={index.id}
                disabled={Object.values(pairs).includes(index.id)}
                onClick={() => connect(index.id)}
              >
                <b>{index.label}</b>
                <span>{index.type}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="p5-note" role="status">
        {note}
      </p>
    </>
  );
}

const PEAKS = [28, 81],
  CARRIER = 63;
const cover = (notch: number, factor: number) =>
  Math.exp(-(((notch - factor) / 3) ** 2));
/**
 * Calculate the existing signal-to-noise value from the two filter notches.
 */
function snrFor(entries: [number, number]) {
  return (
    -8 +
    10 * Math.max(cover(entries[0], PEAKS[0]), cover(entries[1], PEAKS[0])) +
    10 * Math.max(cover(entries[0], PEAKS[1]), cover(entries[1], PEAKS[1])) -
    25 * Math.max(cover(entries[0], CARRIER), cover(entries[1], CARRIER))
  );
}
/**
 * Render the notch-filter controls and signal-to-noise feedback.
 */
function SpectrumTask({ done }: { done: () => void }) {
  const [notches, setNotches] = useState<[number, number]>([10, 45]);
  const snr = snrFor(notches);
  useEffect(() => {
    useP5.setState({ snr });
  }, [snr]);
  const path = useMemo(() => {
    let depth = '';
    for (let factor = 0; factor <= 100; factor += 0.5) {
      let firstValue =
        8 +
        3 * Math.sin(factor * 1.7) * Math.sin(factor * 0.37) +
        18 * Math.exp(-(((factor - CARRIER) / 1.6) ** 2)) +
        58 * Math.exp(-(((factor - PEAKS[0]) / 2.6) ** 2)) +
        50 * Math.exp(-(((factor - PEAKS[1]) / 3.2) ** 2));
      firstValue *=
        (1 - 0.94 * cover(notches[0], factor)) *
        (1 - 0.94 * cover(notches[1], factor));
      depth += `${factor === 0 ? 'M' : 'L'}${factor * 3},${130 - firstValue * 1.6}`;
    }
    return depth;
  }, [notches]);
  const ok = snr >= 9;
  return (
    <>
      <p className="p5-body">
        Something under the portal hum is repeating. Two notch filters can cut
        the hum, but not the signal itself.
      </p>
      <svg
        className="p5-spectrum"
        viewBox="0 0 300 140"
        role="img"
        aria-label="Receiver spectrum"
      >
        <path d={path} />
        {notches.map((count, index) => (
          <line
            key={index}
            x1={count * 3}
            x2={count * 3}
            y1={6}
            y2={134}
            className="notch"
          />
        ))}
        <text x={4} y={136}>
          0
        </text>
        <text x={270} y={136}>
          100 MHz
        </text>
      </svg>
      {notches.map((count, index) => (
        <label key={index} className="p5-slider">
          NOTCH {index + 1} <output>{count.toFixed(1)}</output>
          <input
            type="range"
            min={0}
            max={100}
            step={0.5}
            value={count}
            aria-label={`Notch ${index + 1} frequency`}
            onChange={(event) => {
              sfx.play('signal.sweep', {
                pitch: Number(event.target.value) / 100,
              });
              setNotches(
                index === 0
                  ? [Number(event.target.value), notches[1]]
                  : [notches[0], Number(event.target.value)],
              );
            }}
          />
        </label>
      ))}
      <div className={`p5-meter ${ok ? 'good' : ''}`}>
        <span>SIGNAL / NOISE</span>
        <b>{snr.toFixed(1)} dB</b>
        <i
          style={{
            width: `${Math.max(0, Math.min(100, ((snr + 10) / 25) * 100))}%`,
          }}
        />
      </div>
      <button
        className="p5-primary"
        disabled={!ok}
        data-sfx="signal.lock"
        onClick={done}
      >
        {ok ? 'LOCK FILTERS' : 'NEED 9 dB TO DECODE'}
      </button>
      <p className="p5-note" role="status">
        {snr < -15
          ? 'That notch is on the signal. It went with the hum.'
          : ok
            ? 'The carrier stands clear of the noise.'
            : 'Put each notch on a hum peak.'}
      </p>
    </>
  );
}

/**
 * Render the receiver bearing/elevation calibration controls.
 */
function DishTask({ done }: { done: () => void }) {
  const { az, el } = useP5();
  const strength = strengthOf(az, el),
    ok = strength >= 90;
  const azDelta = ((TARGET_AZ - az + 540) % 360) - 180;
  const adjust = (axis: 'az' | 'el', amount: number) =>
    useP5.setState((state) =>
      axis === 'az'
        ? { az: (state.az + amount + 360) % 360 }
        : { el: THREE.MathUtils.clamp(state.el + amount, 0, 80) },
    );
  return (
    <>
      <p className="p5-body">
        The recording points southwest, above the roofline. Sweep toward that
        sector, then use 1° adjustments to peak the return.
      </p>
      <div className="p5-bearing" aria-label="Recorded bearing sector">
        <span>RECORDED SECTOR</span>
        <b>SW / 200–225°</b>
        <span>ROOFLINE</span>
        <b>30–45° UP</b>
      </div>
      <label className="p5-slider">
        AZIMUTH <output>{az}°</output>
        <input
          type="range"
          min={0}
          max={359}
          value={az}
          aria-label="Dish azimuth"
          onChange={(event) =>
            useP5.setState({ az: Number(event.target.value) })
          }
        />
      </label>
      <div className="p5-fine">
        <button
          aria-label="Decrease azimuth by one degree"
          onClick={() => adjust('az', -1)}
        >
          − 1°
        </button>
        <span>
          {Math.abs(azDelta) < 3
            ? 'BEARING CENTRED'
            : azDelta > 0
              ? '↻ TURN CLOCKWISE'
              : '↺ TURN COUNTERCLOCKWISE'}
        </span>
        <button
          aria-label="Increase azimuth by one degree"
          onClick={() => adjust('az', 1)}
        >
          + 1°
        </button>
      </div>
      <label className="p5-slider">
        ELEVATION <output>{el}°</output>
        <input
          type="range"
          min={0}
          max={80}
          value={el}
          aria-label="Dish elevation"
          onChange={(event) =>
            useP5.setState({ el: Number(event.target.value) })
          }
        />
      </label>
      <div className="p5-fine">
        <button
          aria-label="Decrease elevation by one degree"
          onClick={() => adjust('el', -1)}
        >
          − 1°
        </button>
        <span>
          {Math.abs(el - TARGET_EL) < 2
            ? 'ELEVATION CENTRED'
            : el < TARGET_EL
              ? '↑ RAISE THE DISH'
              : '↓ LOWER THE DISH'}
        </span>
        <button
          aria-label="Increase elevation by one degree"
          onClick={() => adjust('el', 1)}
        >
          + 1°
        </button>
      </div>
      <div className={`p5-meter ${ok ? 'good' : ''}`}>
        <span>RETURN</span>
        <b>{strength.toFixed(0)}%</b>
        <i style={{ width: `${strength}%` }} />
      </div>
      <button
        className="p5-primary"
        disabled={!ok}
        data-sfx="dish.lock"
        onClick={done}
      >
        {ok ? 'LOCK RECEIVER' : 'PEAK THE RETURN (90%+)'}
      </button>
      <p className="p5-note" role="status">
        {ok
          ? 'Return peaked. Lock this bearing to read the recording.'
          : strength > 40
            ? 'Signal acquired. Fine-tune both axes.'
            : 'Follow the bearing guidance to acquire the signal.'}
      </p>
      <button
        className="p5-reset"
        onClick={() => useP5.setState({ az: 140, el: 15 })}
      >
        RESET CALIBRATION
      </button>
    </>
  );
}

/**
 * Render the recorded transmission. Decoding it is information only: nothing is taken away.
 */
function TraceTask({ done }: { done: () => void }) {
  const traced = useP5((state) => state.traced);
  const [note, setNote] = useState(
    'The receiver has it. The middle screen shows where the healthcare chip’s signal went.',
  );
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const decode = () => {
    if (useP5.getState().traced) return;
    useP5.setState({ traced: true, fixes: 4 });
    setNote(
      'Decoded. It isn’t in this city: the signal crossed the boundary at the old portal site.',
    );
    timer.current = window.setTimeout(done, 2600);
  };
  return (
    <>
      <p className="p5-body">
        The chip’s last transmission, on the console screen.
      </p>
      <dl className="p5-readout">
        <div>
          <dt>HEADING</dt>
          <dd>OUTBOUND</dd>
        </div>
        <div>
          <dt>LOCAL SIGNAL</dt>
          <dd>NONE</dd>
        </div>
        <div>
          <dt>LAST FIX</dt>
          <dd>OLD PORTAL SITE</dd>
        </div>
      </dl>
      {!traced && (
        <button className="p5-primary" onClick={decode}>
          DECODE THE LAST FIX
        </button>
      )}
      <p className="p5-note" role="status">
        {note}
      </p>
    </>
  );
}

// ------------------------------------------------------------------ page

/**
 * Compose regulator fitting, the output test and the telemetry relay tasks.
 */
export function PhaseFive({ initial: from }: { initial: PhaseFiveStep }) {
  const [dpr, setDpr] = useState(1);
  useState(() => {
    useP5.setState(initial(from));
    return 0;
  });
  const state = useP5();
  const sceneKey = [
    'fit',
    'fitting',
    'test',
    'testing',
    'held',
    'transit',
  ].includes(state.stage)
    ? 'bay'
    : 'facility';
  const [readyScene, setReadyScene] = useState('');
  const [loadError, setLoadError] = useState('');
  const onReady = useCallback(() => setReadyScene(sceneKey), [sceneKey]);
  const onLoadError = useCallback(
    () => setLoadError('This scene could not be loaded.'),
    [],
  );
  useEffect(() => useP5.subscribe(phaseFiveSounds), []);
  const atBayNow = ['fit', 'fitting', 'test', 'testing', 'held'].includes(
    state.stage,
  );
  useSfxBed('harbour', atBayNow || state.stage === 'transit');
  useSfxBed('combat-hum', atBayNow && state.power > 0.2, 0.9);
  useSfxBed('relay', !atBayNow && state.stage !== 'transit');
  useSfxBed('relay-power', state.powered && !atBayNow);
  useUiSfx();
  const advancing = useRef(false),
    advanceTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    [],
  );
  // Prepare the next chapter during telemetry so following the signal needs less covered work.
  useEffect(() => {
    if (state.stage === 'facility' || state.stage === 'found')
      void phaseFiveExit()
        ?.prepare?.()
        .catch(() => {});
  }, [state.stage]);
  const advanceTask = () => {
    if (advancing.current) return;
    advancing.current = true;
    advanceTimer.current = window.setTimeout(() => {
      const next = useP5.getState().task + 1;
      useP5.setState(
        next >= TASKS.length ? { stage: 'found' } : { task: next },
      );
      advancing.current = false;
    }, 900);
  };

  useEffect(() => {
    if (state.stage === 'fitting' && state.fitted >= 1)
      useP5.setState({ stage: 'test' });
    if (state.stage === 'testing' && state.power >= 1) {
      const timeSeconds = window.setTimeout(
        () => useP5.setState({ stage: 'held' }),
        900,
      );
      return () => window.clearTimeout(timeSeconds);
    }
    if (state.stage === 'transit')
      transitionChapter(() => useP5.setState({ stage: 'facility' }), true);
  }, [state.stage, state.fitted, state.power]);

  const atBay = ['fit', 'fitting', 'test', 'testing', 'held'].includes(
    state.stage,
  );
  const motor = Math.round(35 * Math.min(1, state.power * 1.3)),
    target = state.power > 0.55;
  const task = TASKS[state.task];
  return (
    <main
      className={`p5 p5-stage-${state.stage}`}
      aria-label="Limiter test and telemetry trace"
    >
      <div className="p5-world">
        <Canvas
          shadows={false}
          dpr={dpr}
          camera={{ fov: 46, near: 0.1, far: 400, position: [0, 3, 8] }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <AdaptiveDpr onChange={setDpr} />
          {atBay || state.stage === 'transit' ? (
            <BayScene onReady={onReady} onError={onLoadError} />
          ) : (
            <FacilityScene onReady={onReady} onError={onLoadError} />
          )}
        </Canvas>
      </div>
      <div className="p5-grade" aria-hidden="true" />
      <SoundToggle />
      <SceneCurtain ready={readyScene === sceneKey} error={loadError} />

      {atBay && (
        <aside className="p5-panel p5-bay-panel" aria-live="polite">
          {(state.stage === 'fit' || state.stage === 'fitting') && (
            <>
              <p className="p5-kicker">
                BACK AT THE BAY <span>01 / 02</span>
              </p>
              <h1>Fit the regulator.</h1>
              <p className="p5-body">
                The regulator seats on his chest mount, then its feed connects
                to the service bay.
              </p>
              <button
                className="p5-primary"
                disabled={state.stage === 'fitting'}
                onClick={() => useP5.setState({ stage: 'fitting' })}
              >
                {state.stage === 'fitting' ? 'SEATING…' : 'FIT THE REGULATOR'}
              </button>
            </>
          )}
          {(state.stage === 'test' ||
            state.stage === 'testing' ||
            state.stage === 'held') && (
            <>
              <p className="p5-kicker">
                OUTPUT TEST <span>02 / 02</span>
              </p>
              <h1>
                {state.stage === 'held' ? (
                  <>
                    It holds.
                    <br />
                    <em>He doesn&apos;t stop.</em>
                  </>
                ) : (
                  'Power him up.'
                )}
              </h1>
              <p className="p5-body">
                {state.stage === 'held'
                  ? 'Slow enough to stay out of reach. He is still running the combat program and still looking for Hiro. The limiter bought time, not control.'
                  : 'If the limit holds, he can move, but only so far and so fast. Stand clear.'}
              </p>
              <dl className="p5-readout">
                <div>
                  <dt>MOTOR OUTPUT</dt>
                  <dd>
                    <i className="ghost" />
                    <i style={{ width: `${motor}%` }} />
                    <b>{motor}%</b>
                  </dd>
                </div>
                <div>
                  <dt>THRUSTER OUTPUT</dt>
                  <dd>
                    <i className="ghost" />
                    <i style={{ width: `${motor}%` }} />
                    <b>{motor}%</b>
                  </dd>
                </div>
                <div>
                  <dt>COMBAT PROGRAM</dt>
                  <dd className="tone-red">
                    {state.power > 0.2 ? 'ACTIVE' : '—'}
                  </dd>
                </div>
                <div>
                  <dt>TARGET</dt>
                  <dd className="tone-red">{target ? 'HIRO HAMADA' : '—'}</dd>
                </div>
                <div>
                  <dt>SAFE WINDOW</dt>
                  <dd className="tone-warm">
                    {state.stage === 'held' ? 'TEMPORARY' : '—'}
                  </dd>
                </div>
              </dl>
              {state.stage === 'test' && (
                <button
                  className="p5-primary"
                  onClick={() => useP5.setState({ stage: 'testing' })}
                >
                  POWER HIM UP
                </button>
              )}
              {state.stage === 'held' && (
                <button
                  className="p5-primary"
                  onClick={() => useP5.setState({ stage: 'transit' })}
                >
                  HEAD DEEPER INTO THE CITY <i>→</i>
                </button>
              )}
            </>
          )}
        </aside>
      )}

      {(state.stage === 'facility' || state.stage === 'found') && (
        <>
          {state.stage === 'facility' && (
            <aside className="p5-panel p5-console" aria-live="polite">
              <p className="p5-kicker">
                TELEMETRY RELAY{' '}
                <span>{String(state.task + 1).padStart(2, '0')} / 05</span>
              </p>
              <ol className="p5-steps">
                {TASKS.map((timeSeconds, index) => (
                  <li
                    key={timeSeconds}
                    className={
                      index < state.task
                        ? 'done'
                        : index === state.task
                          ? 'active'
                          : ''
                    }
                  >
                    {TASK_NAMES[timeSeconds]}
                  </li>
                ))}
              </ol>
              {state.stage === 'facility' && (
                <>
                  <h1>{TASK_NAMES[task]}</h1>
                  {task === 'power' && (
                    <PowerTask key="power" done={advanceTask} />
                  )}
                  {task === 'patch' && (
                    <PatchTask key="patch" done={advanceTask} />
                  )}
                  {task === 'spectrum' && (
                    <SpectrumTask key="spectrum" done={advanceTask} />
                  )}
                  {task === 'dish' && (
                    <DishTask key="dish" done={advanceTask} />
                  )}
                  {task === 'trace' && (
                    <TraceTask key="trace" done={advanceTask} />
                  )}
                </>
              )}
            </aside>
          )}
          {state.stage === 'found' && (
            <aside
              className="p5-panel p5-end"
              role="dialog"
              aria-labelledby="p5-found-title"
            >
              <p className="p5-kicker">
                TRACE COMPLETE <span>05 / 05</span>
              </p>
              <ol className="p5-steps">
                {TASKS.map((timeSeconds) => (
                  <li key={timeSeconds} className="done">
                    {TASK_NAMES[timeSeconds]}
                  </li>
                ))}
              </ol>
              <h1 id="p5-found-title">Signal crossed the boundary.</h1>
              <p className="p5-body">
                The healthcare chip’s last transmission climbed out of the city
                and went straight through the portal. Nothing here is answering.
              </p>
              <dl className="p5-readout">
                <div>
                  <dt>LAST FIX</dt>
                  <dd>T−2 MIN · 400 M UP</dd>
                </div>
                <div>
                  <dt>HEADING</dt>
                  <dd>PORTAL BOUNDARY</dd>
                </div>
                <div>
                  <dt>LOCAL SIGNAL</dt>
                  <dd>NONE</dd>
                </div>
                <div>
                  <dt>HEALTHCARE CHIP</dt>
                  <dd className="tone-red">NOT IN THIS CITY</dd>
                </div>
              </dl>
              <p className="p5-note">
                Wherever it went, Hiro has to follow. The limiter is holding
                Baymax, for now.
              </p>
              {phaseFiveExit() && (
                <button className="p5-primary" onClick={phaseFiveExit()!.go}>
                  {phaseFiveExit()!.label} <i>→</i>
                </button>
              )}
            </aside>
          )}
        </>
      )}
    </main>
  );
}
