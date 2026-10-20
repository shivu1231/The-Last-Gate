import { useEffect, useRef, useState } from 'react';
import { engineeringExit } from './exit';
import {
  ACTUATOR_JAM,
  assessmentComplete,
  hotspotElements,
  repairsDone,
  SYSTEMS,
  useBoard,
  type SystemId,
  type ViewMode,
} from './state';
import { sfx, useSfxBed } from '../audio/sfx';
import './board.css';

/**
 * Existing engineering system-status category.
 */
type SystemStatus = {
  label: string;
  tone: 'ok' | 'warn' | 'fault' | 'red' | 'done';
};
const NAMES: Record<SystemId, string> = {
  power: 'Power system',
  motor: 'Motor system',
  thrusters: 'Thrusters',
  sensors: 'Sensors',
  chip: 'Chip bay',
};
const SUBS: Record<SystemId, string> = {
  power: 'Cell · buses',
  motor: 'Joint actuators',
  thrusters: 'Back unit · control line',
  sensors: 'Head sensor board',
  chip: 'Program core',
};

/**
 * Resolve the existing engineering status label for a system.
 */
function statusOf(
  system: SystemId,
  state: ReturnType<typeof useBoard.getState>,
): SystemStatus {
  switch (system) {
    case 'power':
      return state.rerouted
        ? { label: 'REROUTED', tone: 'done' }
        : { label: 'DAMAGED · REPAIRABLE', tone: 'warn' };
    case 'motor':
      return state.actuatorReset
        ? { label: 'MOVEMENT AVAILABLE', tone: 'done' }
        : { label: 'PARTIALLY FUNCTIONAL', tone: 'warn' };
    case 'thrusters':
      return state.plugSeated
        ? { label: 'CONTROL RESTORED', tone: 'done' }
        : { label: 'PARTIALLY DAMAGED', tone: 'warn' };
    case 'sensors':
      return state.sensorsTested
        ? { label: 'USABLE · TESTED', tone: 'done' }
        : { label: 'STILL USABLE', tone: 'ok' };
    case 'chip':
      return state.bayOpen
        ? { label: 'HEALTHCARE ABSENT', tone: 'red' }
        : { label: 'NOT INSPECTED', tone: 'fault' };
  }
}

/** The last repair's result stays on screen this long before the assessment replaces it. */
const LAST_REPAIR_HOLD_MS = 2600;
/** Assessment entry (1 s) plus a readable hold before its continue action unlocks. */
const SUMMARY_READ_MS = 4500;

/**
 * Render the engineering overview, system inspection and repair controls.
 */
export function BoardOverlay() {
  const state = useBoard();
  const complete = assessmentComplete(state);
  useEffect(() => {
    if (complete)
      void engineeringExit()
        ?.prepare?.()
        .catch(() => {});
  }, [complete]);
  const [summary, setSummary] = useState(false);
  // The assessment is the chapter's reveal. Its way out unlocks only once the panel has finished
  // entering (1 s) and held still long enough to read (3.5 s); leaving fires once.
  const [readable, setReadable] = useState(false);
  const leaving = useRef(false);
  useEffect(() => {
    if (!summary) {
      setReadable(false);
      return;
    }
    const hold = window.setTimeout(() => setReadable(true), SUMMARY_READ_MS);
    return () => window.clearTimeout(hold);
  }, [summary]);
  useSfxBed('board');
  useEffect(() => {
    if (!complete) return;
    const timeSeconds = window.setTimeout(() => {
      sfx.play('sting.complete');
      useBoard.setState({
        selected: null,
        mode: 'exterior',
        zoom: 1,
        assessment: true,
      });
      setSummary(true);
    }, LAST_REPAIR_HOLD_MS);
    return () => window.clearTimeout(timeSeconds);
  }, [complete]);
  // Internal systems open in INTERNAL view so there is something to see; leaving a system drops ISOLATE.
  const select = (system: SystemId | null) => {
    sfx.play('move.whoosh', { gain: 0.6 });
    useBoard.setState((state2) => ({
      selected: system,
      mode:
        system && system !== 'chip' && state2.mode === 'exterior'
          ? 'internal'
          : !system && state2.mode === 'isolate'
            ? 'internal'
            : state2.mode,
    }));
  };
  const setMode = (mode: ViewMode) => {
    sfx.play(mode === 'exterior' ? 'ui.back' : 'ui.open');
    useBoard.setState({ mode });
  };
  const exit = engineeringExit();

  return (
    <div className={`board ${summary ? 'board-summary-open' : ''}`}>
      <div className="board-modes" role="radiogroup" aria-label="View mode">
        {(['exterior', 'internal', 'isolate'] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            role="radio"
            aria-checked={state.mode === mode}
            disabled={mode === 'isolate' && !state.selected}
            onClick={() => setMode(mode)}
          >
            {mode.toUpperCase()}
          </button>
        ))}
      </div>

      <nav className="board-rail" aria-label="Baymax systems">
        <p className="board-kicker">
          BAYMAX <span>ENGINEERING BOARD</span>
        </p>
        {SYSTEMS.map((system) => {
          const st = statusOf(system, state);
          return (
            <button
              key={system}
              aria-pressed={state.selected === system}
              onClick={() => select(state.selected === system ? null : system)}
            >
              <b>{NAMES[system]}</b>
              <small>{SUBS[system]}</small>
              <em className={`tone-${st.tone}`}>{st.label}</em>
            </button>
          );
        })}
        <div className="board-progress">
          <span>PHYSICAL REPAIRS</span>
          <b>{repairsDone(state)} / 3</b>
        </div>
      </nav>

      {SYSTEMS.map((system) => (
        <button
          key={system}
          ref={(el) => {
            if (el) hotspotElements.set(system, el);
            else hotspotElements.delete(system);
          }}
          className={`board-hotspot tone-${statusOf(system, state).tone} ${state.selected === system ? 'active' : ''}`}
          onClick={() => select(system)}
          aria-label={`Inspect ${NAMES[system]}`}
        >
          <i />
          <span>{NAMES[system]}</span>
        </button>
      ))}

      <aside className="board-inspector" aria-live="polite">
        {!state.selected ? (
          <Overview />
        ) : (
          <>
            <button className="board-back" onClick={() => select(null)}>
              ← ALL SYSTEMS
            </button>
            <p className="board-kicker">
              {SUBS[state.selected]}{' '}
              <span className={`tone-${statusOf(state.selected, state).tone}`}>
                {statusOf(state.selected, state).label}
              </span>
            </p>
            <h2>{NAMES[state.selected]}</h2>
            {state.selected === 'power' && <PowerTask />}
            {state.selected === 'motor' && <ActuatorTask />}
            {state.selected === 'thrusters' && <PlugTask />}
            {state.selected === 'sensors' && <SensorTask />}
            {state.selected === 'chip' && <ChipTask />}
          </>
        )}
      </aside>

      <footer className="board-status" aria-label="Assessment">
        <span>
          BODY{' '}
          <b className={repairsDone(state) === 3 ? 'tone-done' : 'tone-warn'}>
            {repairsDone(state) === 3 ? 'PARTIALLY RESTORED' : 'DAMAGED'}
          </b>
        </span>
        <span>
          MOVEMENT{' '}
          <b className={state.actuatorReset ? 'tone-done' : 'tone-warn'}>
            {state.actuatorReset ? 'AVAILABLE' : 'RESTRICTED'}
          </b>
        </span>
        <span>
          COMBAT SYSTEM <b className="tone-red">ACTIVE</b>
        </span>
        <span>
          HEALTHCARE SYSTEM{' '}
          <b className={state.bayOpen ? 'tone-red' : 'tone-fault'}>
            {state.bayOpen ? 'ABSENT' : 'UNKNOWN'}
          </b>
        </span>
      </footer>
      <p className="board-hint" aria-hidden="true">
        DRAG TO ROTATE · SCROLL TO ZOOM · SELECT A SYSTEM
      </p>

      {summary && (
        <section
          className="board-summary"
          role="dialog"
          aria-labelledby="board-summary-title"
        >
          <p className="board-kicker">
            ASSESSMENT COMPLETE <span>3 / 3 REPAIRS</span>
          </p>
          <ol className="board-summary-steps">
            <li>Power rerouted round the damaged bus</li>
            <li>Thruster control plug reseated</li>
            <li>Shoulder actuator reset</li>
            <li>Head sensors tested</li>
            <li className="is-red">
              Chip bay: combat slot on override, healthcare slot empty
            </li>
          </ol>
          <h2 id="board-summary-title">
            He can move again.
            <br />
            <em>The healthcare chip is missing.</em>
          </h2>
          <dl>
            <div>
              <dt>BODY</dt>
              <dd className="tone-done">PARTIALLY RESTORED</dd>
              <dd className="board-summary-note">
                Power, thrusters and shoulder fixed. The armour is still
                cracked.
              </dd>
            </div>
            <div>
              <dt>MOVEMENT</dt>
              <dd className="tone-done">AVAILABLE</dd>
              <dd className="board-summary-note">
                He can stand, walk and lift again.
              </dd>
            </div>
            <div>
              <dt>COMBAT SYSTEM</dt>
              <dd className="tone-red">ACTIVE</dd>
              <dd className="board-summary-note">
                The combat chip is in, locked on override.
              </dd>
            </div>
            <div>
              <dt>HEALTHCARE SYSTEM</dt>
              <dd className="tone-red">ABSENT</dd>
              <dd className="board-summary-note">
                His slot is empty. The chip isn't in him.
              </dd>
            </div>
          </dl>
          <p className="board-question">
            If the healthcare program can't be restored, how does Hiro stay
            close to him safely?
          </p>
          <div className="board-summary-actions">
            <button
              className="board-secondary"
              onClick={() => {
                useBoard.setState({ assessment: false });
                setSummary(false);
              }}
            >
              BACK TO THE BOARD
            </button>
            {exit && (
              <button
                className="board-primary"
                disabled={!readable}
                aria-disabled={!readable}
                onClick={() => {
                  if (!readable || leaving.current) return;
                  leaving.current = true;
                  exit.go();
                }}
              >
                {exit.label} <i>→</i>
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Render the current system-status overview and inspection choices.
 */
function Overview() {
  return (
    <>
      <p className="board-kicker">
        BAYMAX <span>UNRESPONSIVE</span>
      </p>
      <h2>Find the fault.</h2>
      <p className="board-body">
        His body took the impact. Start with the power feed, then check what
        still responds. Each reading comes from the system you inspect.
      </p>
      <ol className="board-steps">
        <li>Select a system from the list or on Baymax.</li>
        <li>
          Use <b>INTERNAL</b> to see through the shell, <b>ISOLATE</b> to see
          one system alone.
        </li>
        <li>Three systems need hands-on repair. Two only need inspecting.</li>
      </ol>
    </>
  );
}

/** Reroute power: pick a path from the cell to the left-shoulder actuator over intact, rated lines. */
const NODES = {
  cell: { x: 40, y: 100, label: 'CELL' },
  chest: { x: 150, y: 50, label: 'CHEST JN' },
  aux: { x: 150, y: 160, label: 'SPINE AUX' },
  head: { x: 250, y: 30, label: 'HEAD LINE' },
  shoulder: { x: 290, y: 110, label: 'L-SHOULDER' },
} as const;
/**
 * Connection node used by the engineering power task.
 */
type CircuitNodeId = keyof typeof NODES;
const EDGES: {
  a: CircuitNodeId;
  b: CircuitNodeId;
  amps: number;
  severed?: boolean;
}[] = [
  { a: 'cell', b: 'chest', amps: 60 },
  { a: 'chest', b: 'shoulder', amps: 60, severed: true },
  { a: 'cell', b: 'aux', amps: 40 },
  { a: 'aux', b: 'shoulder', amps: 40 },
  { a: 'chest', b: 'head', amps: 5 },
  { a: 'head', b: 'shoulder', amps: 5 },
];
const NEED = 30;
/**
 * Render the power repair controls for the active chapter.
 */
function PowerTask() {
  const rerouted = useBoard((state) => state.rerouted);
  const [path, setPath] = useState<CircuitNodeId[]>(['cell']);
  const [note, setNote] = useState(
    'Start at the cell. Choose the next junction.',
  );
  const edge = (firstEntry: CircuitNodeId, secondEntry: CircuitNodeId) =>
    EDGES.find(
      (easedProgress) =>
        (easedProgress.a === firstEntry && easedProgress.b === secondEntry) ||
        (easedProgress.a === secondEntry && easedProgress.b === firstEntry),
    );
  const pick = (id: CircuitNodeId) => {
    if (rerouted) return;
    const last = path[path.length - 1],
      easedProgress = edge(last, id);
    if (!easedProgress || path.includes(id)) {
      sfx.play('ui.deny');
      setNote(`${NODES[id].label} isn't wired to ${NODES[last].label}.`);
      return;
    }
    if (easedProgress.severed) {
      sfx.play('elec.arc');
      setNote(
        `${NODES[last].label} → ${NODES[id].label} is the severed run. It can't carry anything.`,
      );
      return;
    }
    const next = [...path, id];
    if (id !== 'shoulder') {
      sfx.play('elec.crackle');
      setPath(next);
      setNote(`${NODES[id].label} selected. Rated ${easedProgress.amps} A.`);
      return;
    }
    const weakest = Math.min(
      ...next.slice(1).map((node, index) => edge(next[index], node)!.amps),
    );
    if (weakest < NEED) {
      sfx.play('power.down');
      setPath(['cell']);
      setNote(
        `That route is rated ${weakest} A. The actuator draws ${NEED} A. Choose another.`,
      );
      return;
    }
    setPath(next);
    setNote(
      `Feed rerouted through ${next
        .slice(1, -1)
        .map((node) => NODES[node].label)
        .join(' → ')}. ${weakest} A available.`,
    );
    sfx.play('elec.zap');
    sfx.play('power.whine-up', { delay: 0.2 });
    useBoard.setState({ rerouted: true });
  };
  const onPath = (firstEntry: CircuitNodeId, secondEntry: CircuitNodeId) =>
    path.some(
      (node, index) =>
        index > 0 &&
        ((path[index - 1] === firstEntry && node === secondEntry) ||
          (path[index - 1] === secondEntry && node === firstEntry)),
    );
  return (
    <>
      <ul className="board-findings">
        <li>Main cell holds charge. Five of six buses are intact.</li>
        <li className="warn">
          The left-shoulder bus is severed where the armour split. That actuator
          has no feed.
        </li>
      </ul>
      <div className="board-task">
        <p className="board-kicker">
          REPAIR <span>REROUTE POWER</span>
        </p>
        <svg
          className="power-map"
          viewBox="0 0 330 200"
          role="group"
          aria-label="Power routing schematic"
        >
          {EDGES.map((easedProgress) => (
            <g key={`${easedProgress.a}-${easedProgress.b}`}>
              <line
                x1={NODES[easedProgress.a].x}
                y1={NODES[easedProgress.a].y}
                x2={NODES[easedProgress.b].x}
                y2={NODES[easedProgress.b].y}
                className={
                  easedProgress.severed
                    ? 'severed'
                    : onPath(easedProgress.a, easedProgress.b)
                      ? 'live'
                      : ''
                }
              />
              <text
                x={(NODES[easedProgress.a].x + NODES[easedProgress.b].x) / 2}
                y={
                  (NODES[easedProgress.a].y + NODES[easedProgress.b].y) / 2 - 5
                }
              >
                {easedProgress.severed ? 'SEVERED' : `${easedProgress.amps} A`}
              </text>
            </g>
          ))}
          {(Object.keys(NODES) as CircuitNodeId[]).map((id) => (
            <g
              key={id}
              className={`node ${path.includes(id) ? 'on' : ''}`}
              onClick={() => pick(id)}
              role="button"
              tabIndex={0}
              aria-label={NODES[id].label}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  pick(id);
                }
              }}
            >
              <circle
                cx={NODES[id].x}
                cy={NODES[id].y}
                r={id === 'shoulder' ? 13 : 10}
              />
              <text x={NODES[id].x} y={NODES[id].y + 26}>
                {NODES[id].label}
              </text>
            </g>
          ))}
        </svg>
        <p className="board-note" role="status">
          {note}
        </p>
        {!rerouted && path.length > 1 && (
          <button
            className="board-secondary"
            onClick={() => {
              setPath(['cell']);
              setNote('Start at the cell. Choose the next junction.');
            }}
          >
            CLEAR ROUTE
          </button>
        )}
        <small className="board-spec">
          ACTUATOR DRAW {NEED} A · ROUTE MUST AVOID THE SEVERED RUN
        </small>
      </div>
    </>
  );
}

/** Reset actuator: once powered, jog the locked actuator back to its index and set it. */
function ActuatorTask() {
  const { rerouted, actuatorAngle, actuatorReset } = useBoard();
  const onIndex = Math.abs(actuatorAngle) <= 1;
  return (
    <>
      <ul className="board-findings">
        <li>Right shoulder and both hips respond to test pulses.</li>
        <li className="warn">
          The left shoulder lost its feed mid-stroke and locked {ACTUATOR_JAM}°
          off its index. The arm can't be driven until it's reset.
        </li>
      </ul>
      <div className="board-task">
        <p className="board-kicker">
          REPAIR <span>RESET ACTUATOR</span>
        </p>
        {!rerouted ? (
          <p className="board-note warn">
            NO FEED. Restore power to the left shoulder first (Power system).
          </p>
        ) : (
          <>
            <div
              className="actuator-dial"
              style={{ ['--angle' as string]: `${actuatorAngle}deg` }}
            >
              <i className="needle" />
              <i className="index" />
              <b>
                {actuatorAngle > 0 ? '+' : ''}
                {actuatorAngle.toFixed(0)}°
              </b>
            </div>
            <label className="board-slider">
              JOG ACTUATOR
              <input
                type="range"
                min={-10}
                max={45}
                step={1}
                value={actuatorAngle}
                disabled={actuatorReset}
                aria-label="Actuator angle"
                onChange={(event) => {
                  sfx.play('mech.ratchet', {
                    pitch: 1 + Number(event.target.value) / 120,
                  });
                  useBoard.setState({
                    actuatorAngle: Number(event.target.value),
                  });
                }}
              />
            </label>
            <p className="board-note" role="status">
              {actuatorReset
                ? 'Index set. The arm can be driven again.'
                : onIndex
                  ? 'On the index mark. Set it.'
                  : 'Jog the actuator back to its index mark (0°).'}
            </p>
            <button
              className="board-primary"
              disabled={!onIndex || actuatorReset}
              onClick={() => {
                sfx.play('mech.index-set');
                sfx.play('servo.groan', { delay: 0.25 });
                useBoard.setState({ actuatorReset: true, actuatorAngle: 0 });
              }}
            >
              {actuatorReset ? 'INDEX SET ✓' : 'SET INDEX'}
            </button>
          </>
        )}
      </div>
    </>
  );
}

/** Reconnect the thruster control line: turn the plug until its key meets the socket's, then seat it. */
function PlugTask() {
  const { plugAngle, plugSeated } = useBoard();
  const aligned = plugAngle % 360 === 0;
  const [hold, setHold] = useState(0);
  const timer = useRef<number | null>(null);
  const turn = (deg: number) => {
    sfx.play('mech.plug-turn');
    useBoard.setState({ plugAngle: (((plugAngle + deg) % 360) + 360) % 360 });
  };
  const start = () => {
    if (plugSeated || timer.current) return;
    const began = performance.now();
    sfx.play('mech.plug-push');
    timer.current = window.setInterval(() => {
      const blendFactor = Math.min(1, (performance.now() - began) / 800);
      setHold(blendFactor);
      if (blendFactor >= 1) {
        if (aligned) {
          sfx.play('mech.plug-seat');
          sfx.play('power.whine-up', { gain: 0.5, delay: 0.3 });
          useBoard.setState({ plugSeated: true });
        } else sfx.play('ui.deny');
        stop();
      }
    }, 30);
  };
  const stop = () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    setHold(0);
  };
  useEffect(
    () => () => {
      if (timer.current) window.clearInterval(timer.current);
    },
    [],
  );
  return (
    <>
      <ul className="board-findings">
        <li className="warn">
          The nozzle liner is cracked. Lift will stay weak whatever is done
          here.
        </li>
        <li className="warn">
          The control-line plug was shaken half out of its socket. The unit
          isn't receiving commands.
        </li>
      </ul>
      <div className="board-task">
        <p className="board-kicker">
          REPAIR <span>RECONNECT CONTROL LINE</span>
        </p>
        <div className="plug-view">
          <div className="plug-socket">
            <i />
          </div>
          <div
            className="plug"
            style={{ transform: `rotate(${plugAngle}deg)` }}
          >
            <i />
          </div>
        </div>
        <div className="plug-controls">
          <button
            className="board-secondary"
            disabled={plugSeated}
            onClick={() => turn(-30)}
            aria-label="Turn plug left"
          >
            ⟲ 30°
          </button>
          <span className={aligned ? 'tone-done' : ''}>
            {aligned
              ? 'KEY ALIGNED'
              : `KEY OFF BY ${Math.min(plugAngle, 360 - plugAngle)}°`}
          </span>
          <button
            className="board-secondary"
            disabled={plugSeated}
            onClick={() => turn(30)}
            aria-label="Turn plug right"
          >
            30° ⟳
          </button>
        </div>
        <button
          className="board-primary board-hold"
          disabled={plugSeated}
          style={{ ['--hold' as string]: hold }}
          onPointerDown={start}
          onPointerUp={stop}
          onPointerLeave={stop}
          onKeyDown={(event) => {
            if ((event.key === 'Enter' || event.key === ' ') && !event.repeat)
              start();
          }}
          onKeyUp={stop}
        >
          {plugSeated
            ? 'PLUG SEATED ✓'
            : hold > 0 && !aligned
              ? 'KEY BLOCKED'
              : 'HOLD TO SEAT PLUG'}
        </button>
        <p className="board-note" role="status">
          {plugSeated
            ? 'Control line live. The thruster answers, at reduced output.'
            : aligned
              ? 'Press and hold to push the plug home.'
              : 'Turn the plug until its key lines up with the socket.'}
        </p>
      </div>
    </>
  );
}

/**
 * Render the sensor repair controls and their existing calibration feedback.
 */
function SensorTask() {
  const tested = useBoard((state) => state.sensorsTested);
  const [running, setRunning] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const run = () => {
    if (running) return;
    setRunning(true);
    sfx.play('sensor.scan');
    timer.current = window.setTimeout(() => {
      setRunning(false);
      sfx.play('sensor.ping');
      useBoard.setState({ sensorsTested: true });
    }, 1500);
  };
  return (
    <>
      <ul className="board-findings">
        <li>
          The head board is intact. It took the least damage of anything in him.
        </li>
      </ul>
      <div className="board-task">
        <p className="board-kicker">
          CHECK <span>SELF-TEST</span>
        </p>
        {tested ? (
          <dl className="board-readings">
            <div>
              <dt>OPTICAL</dt>
              <dd className="tone-done">NOMINAL</dd>
            </div>
            <div>
              <dt>DEPTH</dt>
              <dd className="tone-warn">72%</dd>
            </div>
            <div>
              <dt>CONTACT</dt>
              <dd className="tone-done">NOMINAL</dd>
            </div>
            <div>
              <dt>THERMAL</dt>
              <dd className="tone-done">NOMINAL</dd>
            </div>
          </dl>
        ) : (
          <button className="board-primary" disabled={running} onClick={run}>
            {running ? 'TESTING…' : 'RUN SELF-TEST'}
          </button>
        )}
        {tested && (
          <p className="board-note">Still usable. Nothing to repair here.</p>
        )}
      </div>
    </>
  );
}

/**
 * Render the existing chip inspection and diagnostic details.
 */
function ChipTask() {
  const open = useBoard((state) => state.bayOpen);
  return (
    <>
      <ul className="board-findings">
        <li>
          Behaviour lives in the chip bay. This is the part that decides who
          Baymax is.
        </li>
      </ul>
      <div className="board-task">
        <p className="board-kicker">
          CHECK <span>PROGRAM CORE</span>
        </p>
        {!open ? (
          <button
            className="board-primary"
            onClick={() => {
              sfx.play('sting.empty', { delay: 0.5 });
              useBoard.setState({ bayOpen: true });
            }}
          >
            SCAN THE CHIP BAY
          </button>
        ) : (
          <>
            <dl className="board-readings">
              <div>
                <dt>COMBAT CHIP</dt>
                <dd className="tone-red">SEATED · ACTIVE</dd>
              </div>
              <div>
                <dt>FLIGHT / NAV LOG</dt>
                <dd>CONTINUOUS · 1 BOUNDARY CROSSING</dd>
              </div>
              <div>
                <dt>COMBAT SLOT</dt>
                <dd className="tone-red">OVERRIDE · WON'T RELEASE</dd>
              </div>
              <div>
                <dt>HEALTHCARE CHIP</dt>
                <dd className="tone-red">ABSENT</dd>
              </div>
            </dl>
            <p className="board-note warn">
              Slot override: the combat program holds its own latch, so that
              chip won't come out here. The healthcare slot is empty. The body
              can be fixed; Baymax himself can't.
            </p>
          </>
        )}
      </div>
    </>
  );
}
