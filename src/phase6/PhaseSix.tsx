import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { reducedMotion } from '../config/experience';
import { World, EMERGE, CLUE_AT, CLUE_END, type RunState } from './World';
import { PhaseSixAudio } from './audio';
import {
  FadeIn,
  RegulatorToggle,
  OutputMeter,
  DragHand,
  RingTask,
  Panel,
  HiroLine,
  type Row,
} from './ui';
import { ROUTE_LENGTH, ringLive } from './street';
import {
  useP6,
  begin,
  go,
  skipBeat,
  now,
  setOf,
  isInsert,
  atLeast,
  type Stage,
} from './store';
import { type PhaseSixStep } from './entry';
import { SoundToggle } from '../audio/SoundToggle';
import './phase-six.css';
import { EndCard } from './EndCard';
import { AdaptiveDpr } from '../performance/AdaptiveDpr';
import { SceneCurtain } from '../presentation/SceneCurtain';

/**
 * Phase 6, through Hiro's eyes. The combat chip brings Baymax back up at the relay. Hiro's
 * regulator holds him to 35%, which only buys time: Hiro runs for the old portal site and brings
 * its frame back. He won't leave Baymax, so he lets him come at full power and cuts him back to 35%
 * mid-air. Powered, the gate tries and folds shut: its reader has locked onto something, and Hiro
 * can't tell what. When Baymax falls and his bay opens, the combat chip and the reader beat in the
 * same rhythm: the chip, from this side, is the signal the gate's reader is tuned to. Hiro pulls it, the reader
 * lets go, and the reader reads the transit log Baymax's own combat chip recorded on the crossing.
 * The frame opens onto where that signal went, and Hiro hauls him through. On the other side he
 * puts the healthcare chip back.
 *
 * The page stays out of the way: one small panel for the moment, readings rather than sentences.
 */

/** Re-renders on a timer while a stage runs, for UI that appears partway through it. */
function useStageTime(stage: Stage) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(
      () => tick((xPosition) => xPosition + 1),
      200,
    );
    return () => window.clearInterval(id);
  }, [stage]);
  return now() - useP6.getState().since;
}

/**
 * Compose the final pursuit, portal, hauling and restoration stages.
 */
export function PhaseSix({ initial }: { initial: PhaseSixStep }) {
  const [dpr, setDpr] = useState(1);
  useState(() => {
    begin(initial);
    return 0;
  });
  const audio = useMemo(() => new PhaseSixAudio(), []);
  useEffect(() => () => audio.dispose(), [audio]);
  const state = useP6();
  const easedProgress = useStageTime(state.stage);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const onLoadError = useCallback(
    () => setLoadError('This scene could not be loaded.'),
    [],
  );
  // Tell the chapter cover (presentation/chapterTransition) the scene is drawn and it can lift.
  const onReady = useCallback(() => {
    // Tracker S-05: the wake (his fly-in) starts when the scene is actually shown, not while it loads.
    if (useP6.getState().stage === 'wake') useP6.setState({ since: now() });
    setReady(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        window.dispatchEvent(new Event('lastgate:scene-ready')),
      ),
    );
  }, []);
  const grab = useRef<HTMLDivElement>(null),
    drop = useRef<HTMLDivElement>(null);
  const hints = useMemo(() => ({ grab, drop }), []);
  const warp = useRef<SVGFEDisplacementMapElement>(null),
    world = useRef<HTMLDivElement>(null),
    hurt = useRef<HTMLDivElement>(null),
    crossingCover = useRef<HTMLDivElement>(null);
  const fx = useMemo(() => ({ warp, world, hurt, crossingCover }), []);
  const run = useRef<RunState>({
    p: 0,
    speed: 0,
    forward: false,
    pointer: new THREE.Vector2(),
    impulse: 0,
    gap: 8,
    dread: 0,
    hiro: [0, 0],
    bay: [0, 0],
    misses: 0,
  });
  const [live, setLive] = useState({
    p: 0,
    gap: 8,
    dread: 0,
    hiro: [0, 0] as [number, number],
    bay: [0, 0] as [number, number],
    misses: 0,
  });
  const [moved, setMoved] = useState(false);
  const set = setOf(state.stage);

  // Sound starts with the first gesture.
  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [audio]);

  // The pointer is where Hiro looks (a little, everywhere; a lot on the run). The page reads the live numbers.
  useEffect(() => {
    const state2 = run.current;
    const move = (ev: PointerEvent) =>
      state2.pointer.set(
        (ev.clientX / innerWidth - 0.5) * 2,
        (ev.clientY / innerHeight - 0.5) * 2,
      );
    const tick = window.setInterval(
      () =>
        setLive({
          p: state2.p,
          gap: state2.gap,
          dread: state2.dread,
          hiro: [...state2.hiro],
          bay: [...state2.bay],
          misses: state2.misses,
        }),
      200,
    );
    window.addEventListener('pointermove', move);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener('pointermove', move);
    };
  }, []);

  // Development: Ctrl+M skips to the next beat (and keeps the earlier phases' handler out of it).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const skip = (event: KeyboardEvent) => {
      if (
        !event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        event.metaKey ||
        event.code !== 'KeyM'
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      skipBeat();
    };
    window.addEventListener('keydown', skip, true);
    return () => window.removeEventListener('keydown', skip, true);
  }, []);

  // The run: hold W, Space, the up arrow or the mouse; scroll for a step.
  useEffect(() => {
    if (state.stage !== 'escape') return;
    const state2 = run.current,
      fwd = ['KeyW', 'ArrowUp', 'Space'];
    const down = (ev: KeyboardEvent) => {
      if (fwd.includes(ev.code) && !ev.ctrlKey) {
        ev.preventDefault();
        state2.forward = true;
        setMoved(true);
      }
    };
    const up = (ev: KeyboardEvent) => {
      if (fwd.includes(ev.code)) state2.forward = false;
    };
    const wheel = (ev: WheelEvent) => {
      ev.preventDefault();
      if (ev.deltaY > 0) {
        state2.impulse = Math.min(1.4, state2.impulse + 0.45);
        setMoved(true);
      }
    };
    const press = (ev: PointerEvent) => {
      if (ev.button === 0 && !(ev.target as HTMLElement).closest('button')) {
        state2.forward = true;
        setMoved(true);
      }
    };
    const release = () => {
      state2.forward = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('pointerdown', press);
    window.addEventListener('pointerup', release);
    window.addEventListener('blur', release);
    return () => {
      state2.forward = false;
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('wheel', wheel);
      window.removeEventListener('pointerdown', press);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('blur', release);
    };
  }, [state.stage]);

  const insert = isInsert(state.stage);
  const toggle = (next: Stage) => () => {
    audio.unlock();
    go(next);
  };
  const replay = () => {
    // A fresh document resets all six chapter stores and releases their scenes/audio.
    const url = new URL(window.location.href);
    for (const key of ['phase2', 'recovery', 'phase4', 'phase5', 'phase6'])
      url.searchParams.delete(key);
    url.hash = '';
    window.location.assign(url.href);
  };
  const metres = Math.max(0, Math.round((1 - live.p) * ROUTE_LENGTH + 14));
  const pulled = state.chip === 'out' ? now() - state.pulledAt : 0;
  const fetched = state.care === 'hand' ? now() - state.fetchAt : 99;
  const homeUi = state.stage !== 'home' || easedProgress > EMERGE + 1.2;

  const st = state.stage;

  // ---- Hiro's line for the moment.
  const line =
    st === 'wake' && easedProgress > 6.2
      ? 'Baymax? Hey, buddy. It’s me.'
      : st === 'limited' && easedProgress > 9.8
          ? 'The trace went to the old gate. That’s where it ends.'
          : st === 'escape' && state.caught
            ? 'No, no—'
            : st === 'escape' && live.p > 0.06 && live.dread > 0.75
              ? 'Don’t look back. Don’t look back.'
              : st === 'escape' && live.p < 0.2
                ? 'Go, go, go.'
                : st === 'powered' && easedProgress > 0.7 && easedProgress < 2.4
                  ? 'Come on…'
                  : st === 'powered' && easedProgress >= 2.4
                    ? 'It tried. Something’s still missing.'
                    : (st === 'choice' || st === 'switchOff') &&
                        easedProgress > 0.5
                      ? 'I’m not leaving you again.'
                      : st === 'flyin' && easedProgress > 2.4
                        ? 'Wait for it.'
                        : st === 'faceoff' && easedProgress > 0.4
                          ? 'I’m right here. Come on.'
                          : st === 'carry' &&
                              state.chip !== 'out' &&
                              easedProgress > CLUE_AT + 0.3 &&
                              easedProgress < CLUE_END
                            ? 'The chip…'
                            : st === 'carry' &&
                                state.chip !== 'out' &&
                                easedProgress >= CLUE_END
                              ? 'It’s reading his combat chip. That’s all it can hear.'
                              : st === 'carry' &&
                                  state.chip === 'out' &&
                                  pulled > 0.6 &&
                                  pulled < 3.4
                                ? 'It let go.'
                                : st === 'carry' &&
                                    state.chip === 'out' &&
                                    pulled >= 3.4 &&
                                    state.cart !== 'slot'
                                  ? 'It needs somewhere to go. Where his healthcare chip went.'
                                  : // The payoff to the Phase 1 FLIGHT LOG line: the chip logs every
                                    // flight, so it carries the crossing the reader rebuilds the way home from.
                                    (st === 'carry' && state.cart === 'slot') ||
                                      (st === 'bloom' && easedProgress <= 2)
                                    ? 'Every flight logged… even the crossing.'
                                  : st === 'bloom' &&
                                      easedProgress > 2 &&
                                      easedProgress < 6
                                    ? 'There you are.'
                                    : st === 'bloom' && easedProgress > 8.6
                                      ? 'Come on. We’re going home.'
                                      : st === 'home' &&
                                          easedProgress > 1.4 &&
                                          easedProgress < EMERGE
                                        ? 'Almost. Almost.'
                                        : st === 'home' &&
                                            easedProgress > EMERGE + 2.4 &&
                                            state.care === 'ground'
                                          ? 'That green light… over by the bin?'
                                          : st === 'home' &&
                                              state.care === 'hand' &&
                                              fetched < 3.4
                                            ? 'It crossed all that way… to land in a bin.'
                                            : null;

  // ---- What each panel reads.
  const anyLive = ringLive(state.angles).some((xPosition) => xPosition >= 1);
  const gateRows = (
    control: Row,
    gate: Row = ['Gate', 'Locked', 'red'],
  ): Row[] => [
    ['Power', 'Online', 'ok'],
    ['Field', 'Ready', 'cyan'],
    gate,
    control,
  ];
  const drag = (text: string) => (
    <span className="p6-withhand">
      <DragHand />
      {text}
    </span>
  );
  const style = { '--dread': live.dread.toFixed(2) } as CSSProperties;

  return (
    <main
      className={`p6 p6-set-${set} p6-stage-${st} ${insert ? 'p6-insert' : ''}`}
      style={style}
      aria-label="Baymax wakes again"
    >
      <SoundToggle />
      <div className="p6-world" ref={world}>
        <Canvas
          dpr={dpr}
          camera={{ fov: 62, near: 0.02, far: 900, position: [2, 2, 2] }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <AdaptiveDpr onChange={setDpr} />
          <World
            audio={audio}
            hints={hints}
            fx={fx}
            run={run}
            onReady={onReady}
            onError={onLoadError}
          />
        </Canvas>
      </div>
      <svg className="p6-filters" aria-hidden="true" width="0" height="0">
        <filter id="p6-warp" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.018 0.03"
            numOctaves="2"
            seed="4"
          >
            <animate
              attributeName="baseFrequency"
              dur="1.2s"
              values="0.018 0.03;0.026 0.02;0.018 0.03"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap
            ref={warp}
            in="SourceGraphic"
            scale="0"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>
      <div className="p6-grade" aria-hidden="true" />
      <div className="p6-dread" aria-hidden="true" />
      <div className="p6-hurt" ref={hurt} aria-hidden="true" />
      <div
        className="p6-crossing-cover"
        ref={crossingCover}
        aria-hidden="true"
      />

      <header className="p6-top"></header>

      {/* Drag targets, placed over the 3D each frame. */}
      <div ref={grab} className="p6-hint p6-hint-grab" aria-hidden="true">
        <i />
      </div>
      <div ref={drop} className="p6-hint p6-hint-drop" aria-hidden="true">
        <i />
      </div>

      {ready && homeUi && (
        <div className="p6-side" role="status">
          {/* 1 · Wake: the regulator, on standby. */}
          {((st === 'wake' && easedProgress > 4) || st === 'switchOn1') && (
            <Panel
              id="wake"
              label="Power regulator"
              tone="red"
              rows={[
                [
                  'Status',
                  state.regulator ? 'Active' : 'Standby',
                  state.regulator ? 'orange' : '',
                ],
                [
                  'Baymax output',
                  state.regulator ? '35%' : '100%',
                  state.regulator ? 'orange' : 'red',
                ],
                ['Limit when active', '35%'],
              ]}
            >
              <RegulatorToggle
                action="on"
                busy={insert}
                onPress={toggle('switchOn1')}
              />
            </Panel>
          )}

          {/* 2 · Held to 35%: the cap as readings, then the way out. */}
          {st === 'limited' && easedProgress <= 9.6 && (
            <Panel
              id="limited"
              label="Power regulator"
              rows={[
                ['Status', 'Active', 'orange'],
                ['Thrusters', 'Restricted'],
                ['Motor output', 'Restricted'],
                ['Combat power', 'Restricted'],
              ]}
            >
              <OutputMeter value={35} />
            </Panel>
          )}
          {st === 'limited' && easedProgress > 9.6 && (
            <Panel
              id="buys-time"
              label="Power regulator"
              rows={[
                ['Baymax', 'Slowed · still coming', 'red'],
                ['Trace', 'Old gate site'],
                ['Last fix', 'Crossed the boundary', 'orange'],
              ]}
            >
              <button className="p6-btn" onClick={toggle('escape')}>
                Run for the gate <i>→</i>
              </button>
            </Panel>
          )}

          {/* 3 · The run. */}
          {st === 'escape' && !state.caught && (
            <Panel
              id="run"
              label="Old gate site"
              rows={[
                ['Distance', `${metres} m`, 'orange'],
                ['Baymax', 'Following', 'red'],
              ]}
            />
          )}
          {st === 'escape' && state.caught && (
            <Panel
              id="caught"
              label="Baymax"
              tone="red"
              title="He caught you."
              rows={[
                ['Regulator', 'Active · 35%'],
                ['Distance left', `${metres} m`],
              ]}
            >
              <button
                className="p6-btn"
                onClick={() => {
                  audio.unlock();
                  useP6.setState({ caught: false });
                  go('escape');
                }}
              >
                Try the run again <i>→</i>
              </button>
            </Panel>
          )}

          {/* 4 · The gate: power it. It tries, and folds shut. */}
          {st === 'gate' && (
            <Panel
              id="gate"
              label="The Last Gate"
              tone="cyan"
              title="Restore portal power"
              rows={[
                [
                  'Power',
                  anyLive ? 'Partial' : 'Offline',
                  anyLive ? 'orange' : '',
                ],
                ['Field', 'Unstable'],
                ['Gate', 'Closed'],
              ]}
            >
              <RingTask audio={audio} />
            </Panel>
          )}
          {st === 'powered' && (
            <Panel
              id={easedProgress < 2.4 ? 'powered' : 'locked'}
              label="The Last Gate"
              tone="cyan"
              rows={
                easedProgress < 2.4
                  ? gateRows(
                      ['Control input', '…', 'dim'],
                      ['Gate', 'Opening', 'cyan'],
                    )
                  : gateRows(['Missing input', 'Unknown', 'red'])
              }
            />
          )}

          {/* 5 · The choice. */}
          {((st === 'choice' && easedProgress > 1.6) || st === 'switchOff') && (
            <Panel
              id="choice"
              label="Power regulator"
              tone="red"
              rows={[
                [
                  'Status',
                  state.regulator ? 'Active' : 'Off',
                  state.regulator ? 'orange' : 'red',
                ],
                ['Output limit', state.regulator ? '35%' : 'None'],
              ]}
            >
              <RegulatorToggle
                action="off"
                busy={insert}
                onPress={toggle('switchOff')}
              />
            </Panel>
          )}

          {/* 6 · He comes. A range reading, not a countdown. */}
          {(st === 'flyin' || st === 'faceoff' || st === 'switchOn2') && (
            <Panel
              id="range"
              label="Power regulator"
              tone="red"
              rows={[
                [
                  'Status',
                  state.regulator ? 'Active' : 'Off',
                  state.regulator ? 'orange' : 'red',
                ],
                ['Thrusters', state.regulator ? 'Cut' : 'Full', 'red'],
                [
                  'Range',
                  st === 'flyin' ? 'Out of range' : 'In range',
                  st === 'flyin' ? 'dim' : 'orange',
                ],
              ]}
            >
              <RegulatorToggle
                action="on"
                busy={insert}
                disabled={st === 'flyin'}
                note={st === 'flyin' ? 'Out of range' : undefined}
                onPress={toggle('switchOn2')}
              />
            </Panel>
          )}

          {/* 7 · The chip and the reader beat together. Pull it; then give the gate somewhere to go. */}
          {st === 'carry' && state.chip !== 'out' && easedProgress > 2 && (
            <Panel
              id={easedProgress > CLUE_END ? 'chip' : 'signal'}
              label="The Last Gate"
              tone="cyan"
              title={
                easedProgress > CLUE_END ? 'Pull the combat chip' : undefined
              }
              rows={gateRows(
                easedProgress > CLUE_END
                  ? ['Reader', 'Tuned to his combat chip', 'red']
                  : ['Reader', 'Signal close by', 'red'],
              )}
              action={
                easedProgress > CLUE_END
                  ? drag('Drag it up out of his chest.')
                  : undefined
              }
            />
          )}
          {st === 'carry' && state.chip === 'out' && pulled > 1 && (
            <Panel
              id={pulled > 3.6 ? 'cart' : 'clear'}
              label="The Last Gate"
              tone="cyan"
              title={pulled > 3.6 ? 'Seat the combat chip' : undefined}
              rows={
                pulled > 3.6
                  ? state.cart === 'slot'
                    ? [
                        ['Source', 'Baymax combat chip', 'red'],
                        ['Transit log', 'Found', 'orange'],
                        ['Boundary signature', 'Matched', 'cyan'],
                        ['Return vector', 'Reconstructing', 'cyan'],
                      ]
                    : [
                        ['Reader', 'Ready', 'cyan'],
                        ['Route signature', 'None on record', 'red'],
                        ['Combat chip', 'Removed · logged his crossing', 'orange'],
                      ]
                  : gateRows(['Reader', 'Clear', 'cyan'])
              }
              action={
                pulled > 3.6 && state.cart !== 'slot'
                  ? drag('Insert the red combat chip into the reader.')
                  : undefined
              }
            />
          )}
          {st === 'bloom' && easedProgress > 1.2 && easedProgress < 7.4 && (
            <Panel
              id="bloom"
              label="The Last Gate"
              tone="cyan"
              rows={[
                ['Source', 'Baymax combat chip', 'cyan'],
                ['Return vector', 'Reconstructed', 'ok'],
                ['Gate', 'Open', 'cyan'],
                ['Field', 'Stable', 'ok'],
              ]}
            />
          )}

          {/* 8 · Home. */}
          {st === 'home' && easedProgress > EMERGE + 2.4 && (
            <Panel
              id="home"
              label="Baymax"
              title="His healthcare chip"
              rows={[
                [
                  'Healthcare chip',
                  state.care === 'ground' ? 'In a litter bin' : 'In your hand',
                  'ok',
                ],
                [
                  'Chest bay',
                  state.care === 'open' ? 'Open' : 'Closed',
                  state.care === 'open' ? 'cyan' : 'dim',
                ],
                ['Combat chip', 'Removed', 'dim'],
              ]}
              action={drag(
                state.care === 'open'
                  ? 'Guide the chip into the socket, or hold E.'
                  : state.homeStep === 'toBin'
                    ? 'Hold W or scroll to walk over to the bin.'
                    : state.homeStep === 'atBin'
                      ? 'Click and hold the chip, or hold E, to take it.'
                      : state.homeStep === 'back'
                        ? 'Hold W or scroll to walk back to him.'
                        : state.homeStep === 'atBaymax'
                          ? 'Click and hold his chest, or hold E, to open the bay.'
                          : 'Look around with the mouse.',
              )}
            />
          )}
          {st === 'seated' && (
            <Panel
              id="seated"
              label="Baymax"
              rows={[
                ['Healthcare chip', 'Seated', 'ok'],
                ['Chest bay', 'Open'],
              ]}
            >
              <button className="p6-btn" onClick={toggle('boot')}>
                Close the bay <i>→</i>
              </button>
            </Panel>
          )}
          {st === 'boot' && easedProgress > 2.2 && easedProgress < 15 && (
            <Panel
              id="boot"
              label="Baymax"
              rows={[
                ['Healthcare', 'Online', 'ok'],
                ['Combat', 'Removed', 'dim'],
                ['System', 'Stable', 'ok'],
              ]}
            />
          )}
        </div>
      )}

      {ready && st === 'boot' && state.homeStep === 'bump' && (
        <FadeIn className="p6-hint-line" delay={0.4}>
          He's holding out his fist · <kbd>E</kbd> or click to bump it
        </FadeIn>
      )}
      {ready && st === 'boot' && state.homeStep === 'rail' && (
        <FadeIn className="p6-hint-line" delay={0.8}>
          Hold <kbd>W</kbd> or scroll to walk to the rail with him
        </FadeIn>
      )}
      {ready && st === 'escape' && !moved && (
        <FadeIn className="p6-hint-line" delay={0.6}>
          Hold <kbd>W</kbd> or the mouse to run · move the mouse to look
        </FadeIn>
      )}
      {ready && st === 'escape' && (
        <p className="sr-only">
          Hold W, Space or the mouse button to run along the street, or scroll
          to step. Move the pointer to look around.
        </p>
      )}
      {ready && line && <HiroLine text={line} />}
      {ready && st !== 'escape' && st !== 'end' && homeUi && (
        <p className="p6-controls">
          <span>Mouse</span> look around
          {state.stage === 'carry' || state.stage === 'home' ? (
            <>
              {' '}
              <i /> <span>Drag</span> the lit piece
            </>
          ) : null}
        </p>
      )}

      {st === 'end' && <EndCard onReplay={replay} />}
      <div className="p6-veil" key={`veil-${set}`} aria-hidden="true" />
      <SceneCurtain ready={ready} error={loadError} />
      {reducedMotion && (
        <span className="sr-only">
          Reduced motion is on: camera shake and long fades are off.
        </span>
      )}
    </main>
  );
}
