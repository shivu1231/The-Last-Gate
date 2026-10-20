import { OpeningTitle } from '../presentation/OpeningTitle';
import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from '@react-three/fiber';
import {
  ACESFilmicToneMapping,
  Color,
  DodecahedronGeometry,
  DynamicDrawUsage,
  Euler,
  FogExp2,
  Group,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CinematicPost } from '../effects/CinematicPost';
import { createPortalDimension } from '../environment/PortalDimension.js';
import { createRuptureSet } from '../environment/RuptureSet.js';
import { createSanFransokyo } from '../environment/HarbourCity';
import { createPortalGate, portalWorldMask } from '../environment/RiftGate';
import { useCanvasBudget } from '../performance/CanvasBudget';
import { assets } from '../systems/AssetManager';
import {
  CameraDirector,
  REENTRY_Z,
  ZOOM_PHASES,
  type ShotContext,
} from '../systems/CameraDirector';
import {
  SequenceDirector,
  type SequenceEvent,
} from '../systems/SequenceDirector';
import { BaymaxController } from '../characters/BaymaxController';
import { pinLights } from '../systems/lightPins';
import { ChipController } from '../characters/ChipController';
import { AudioDirector } from '../audio/AudioDirector';
import { TransitionDirector } from '../transitions/TransitionDirector';
import {
  HOLD_PHASES,
  useSceneState,
  type Phase,
} from '../state/SceneStateManager';
import { reducedMotion } from '../config/experience';
import { cameraRig } from '../systems/CameraRig';
import {
  DIAGNOSTIC_LINES,
  SHELL_ACTIONS,
  SHELL_DURATIONS,
} from '../config/shell';
import { RuntimeBridge } from '../core/RuntimeBridge';
import { experience } from '../core/ExperienceFlow';
import { setRunReset } from '../core/legacyCheckpoints';
import { ProductionLayer } from '../core/ProductionLayer';
import { useQuality } from '../performance/Quality';
import { LoadingBaymax } from '../presentation/LoadingBaymax';

/**
 * Contain opening-scene rendering failures and present the fallback.
 */
class RenderBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? <Failure /> : this.props.children;
  }
}
function Failure() {
  return (
    <div className="failure">
      <p>The connection was lost.</p>
      <span>This chapter needs WebGL in a recent browser.</span>
      <button onClick={() => location.reload()}>RECONNECT ↗</button>
    </div>
  );
}

const MARKER_PHASES: Phase[] = ['discovery', 'chip-focus', 'chest-focus'];
const STREET_BG = new Color('#101c31'),
  CORRIDOR_BG = new Color('#061420'),
  STREET_FOG = new Color('#253e59'),
  CORRIDOR_FOG = new Color('#123349');
const SF_BG = new Color('#0d1b30'),
  SF_FOG = new Color('#1b3450');
const INTRO_PORTAL: Phase[] = [
  'portal-sighted',
  'call-baymax',
  'to-portal',
  'through-portal',
  'sf-arrival',
  'sf-turnback',
  'back-decision',
  'back-through',
];
const FRAME_TIMED: Phase[] = [...INTRO_PORTAL, 'reentry'];
const PORTAL_CLOSE: Partial<Record<Phase, number>> = {
  'portal-sighted': 0.1,
  'call-baymax': 0.16,
  'to-portal': 0.24,
  'through-portal': 0.3,
  'sf-arrival': 0.42,
  'sf-turnback': 0.66,
  'back-decision': 0.74,
  'back-through': 0.95,
  reentry: 0.95,
};
/** Seconds into the hurt re-entry when the gate behind Hiro collapses (he has turned to look by then). */
const SEAL_AT = 1.45;
/** Tracker N-01: on the hurt re-entry, a chunk of debris tumbles in and hits Hiro: that is what knocks him out. */
const ROCK_AT = 2.95,
  ROCK_FROM = 2.35;

/**
 * Tracker S-02: the rock is one piece of a shower. Chunks and grit thrown through the ring with
 * Hiro (the tail of back-through), rubble falling round where he lands, then ejecta from the gate
 * as it implodes, a couple of near misses, and finally the rock. Two instanced draws sharing the
 * rock's geometry; the clock runs from -0.8 s (back-through) through the re-entry. Positions
 * are laid out round where he lands (REENTRY_Z) and the ring (z 24).
 */
const HIDDEN = new Matrix4().makeScale(0, 0, 0),
  TINT = new Color();
type DebrisPiece = {
  at: number;
  p: Vector3;
  v: Vector3;
  spin: Vector3;
  scale: Vector3;
  tint: number;
  pos: Vector3;
  vel: Vector3;
  rot: Euler;
  live: boolean;
  rest: boolean;
};
const DEBRIS_G = 12;
/**
 * Build the opening debris pool and its per-piece motion state.
 */
function createDebris(geometry: DodecahedronGeometry) {
  let seed = 11;
  const random = (firstValue: number, secondValue: number) => {
    seed = (seed * 16807) % 2147483647;
    return firstValue + ((secondValue - firstValue) * (seed - 1)) / 2147483646;
  };
  const piece = (
    at: number,
    point: Vector3,
    vector: Vector3,
    size: number,
    squash = 0.25,
  ): DebrisPiece => ({
    at,
    p: point,
    v: vector,
    spin: new Vector3(random(-9, 9), random(-7, 7), random(-9, 9)),
    scale: new Vector3(
      size * random(1 - squash, 1 + squash),
      size * random(1 - squash, 1),
      size * random(1 - squash, 1 + squash),
    ),
    tint: random(0.7, 1.25),
    pos: new Vector3(),
    vel: new Vector3(),
    rot: new Euler(random(0, 6), random(0, 6), random(0, 6)),
    live: false,
    rest: false,
  });
  // Launched from p so it reaches `to` after `time` seconds under gravity.
  const aimed = (
    at: number,
    point: Vector3,
    to: Vector3,
    time: number,
    size: number,
    squash?: number,
  ) =>
    piece(
      at,
      point,
      new Vector3(
        (to.x - point.x) / time,
        (to.y - point.y) / time + 0.5 * DEBRIS_G * time,
        (to.z - point.z) / time,
      ),
      size,
      squash,
    );
  const chunks: DebrisPiece[] = [],
    grit: DebrisPiece[] = [],
    value = REENTRY_Z;
  // Thrown through the ring with him: ahead of the lens, receding and dropping toward Baymax.
  for (let index = 0; index < 4; index++)
    chunks.push(
      piece(
        random(-0.75, -0.35),
        new Vector3(
          random(-2.6, 1.8),
          random(3, 4.8),
          value + random(0.6, 3.1),
        ),
        new Vector3(random(-1, 1), random(-0.6, 1.2), random(-13, -9)),
        random(0.5, 0.95),
      ),
    );
  for (let index2 = 0; index2 < 8; index2++)
    grit.push(
      piece(
        random(-0.7, -0.2),
        new Vector3(
          random(-2.4, 1.6),
          random(2.6, 4.6),
          value + random(1.1, 3.6),
        ),
        new Vector3(random(-1.5, 1.5), random(-1, 1.5), random(-15, -10)),
        random(0.12, 0.24),
        0.4,
      ),
    );
  // Rubble already coming down round the landing spot.
  for (let index3 = 0; index3 < 4; index3++)
    chunks.push(
      piece(
        random(0.05, 0.6),
        new Vector3(
          random(-3.5, 2.5),
          random(5, 7.5),
          value + random(-5.9, -1.9),
        ),
        new Vector3(random(-0.8, 0.8), random(-2, 0), random(-1.5, 1)),
        random(0.3, 0.75),
      ),
    );
  // His own landing throws up grit in front of him.
  for (let index4 = 0; index4 < 16; index4++)
    grit.push(
      piece(
        random(0, 0.15),
        new Vector3(-1.2 + random(-1.4, 1.2), 0.05, value + random(-2.8, -0.6)),
        new Vector3(random(-1.5, 1.5), random(2, 4.5), random(-1.5, 0.8)),
        random(0.1, 0.2),
        0.4,
      ),
    );
  // The gate implodes (SEAL_AT) and spits out what's left of the crossing, toward and past him.
  for (let index5 = 0; index5 < 6; index5++)
    chunks.push(
      aimed(
        1.5 + index5 * 0.26 + random(0, 0.15),
        new Vector3(random(-3, 3), random(2.5, 5.5), random(22.5, 23.8)),
        new Vector3(random(-5.5, 3.5), 0, value + random(-3.4, 3.6)),
        random(0.8, 1.2),
        random(0.35, 1.1),
      ),
    );
  for (let index6 = 0; index6 < 16; index6++)
    grit.push(
      aimed(
        random(1.6, 3),
        new Vector3(random(-2.5, 2.5), random(2, 5), random(22, 23.8)),
        new Vector3(random(-5, 4), 0, value + random(-4.4, 4.6)),
        random(0.6, 0.9),
        random(0.12, 0.24),
        0.4,
      ),
    );
  // Two near misses either side of his head, just before the one that doesn't miss.
  chunks.push(
    aimed(
      1.45,
      new Vector3(1.6, 4.6, 23.4),
      new Vector3(-0.05, 1.1, value),
      0.9,
      0.55,
    ),
  );
  chunks.push(
    aimed(
      1.8,
      new Vector3(-3.2, 5.2, 23.5),
      new Vector3(-2.5, 0.9, value - 0.2),
      0.85,
      0.45,
    ),
  );
  const material = new MeshStandardMaterial({
    color: '#5f6b6c',
    roughness: 0.95,
    flatShading: true,
  });
  const build = (list: DebrisPiece[]) => {
    const mesh = new InstancedMesh(geometry, material, list.length);
    mesh.frustumCulled = false;
    mesh.visible = false;
    list.forEach((point, index7) => {
      mesh.setMatrixAt(index7, HIDDEN);
      mesh.setColorAt(index7, TINT.setScalar(point.tint));
    });
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    return mesh;
  };
  const chunkMesh = build(chunks),
    gritMesh = build(grit),
    meshes = [chunkMesh, gritMesh];
  const rotationQuaternion = new Quaternion(),
    transformMatrix = new Matrix4();
  let last = -Infinity;
  const step = (
    list: DebrisPiece[],
    mesh: InstancedMesh,
    clock: number,
    deltaSeconds: number,
  ) => {
    list.forEach((point, index7) => {
      if (clock < point.at) {
        if (point.live) {
          point.live = false;
          mesh.setMatrixAt(index7, HIDDEN);
        }
        return;
      }
      if (!point.live) {
        point.live = true;
        point.rest = false;
        point.pos.copy(point.p).addScaledVector(point.v, clock - point.at);
        point.vel.copy(point.v);
      } else if (!point.rest) {
        point.vel.y -= DEBRIS_G * deltaSeconds;
        point.pos.addScaledVector(point.vel, deltaSeconds);
        point.rot.x += point.spin.x * deltaSeconds;
        point.rot.y += point.spin.y * deltaSeconds;
        point.rot.z += point.spin.z * deltaSeconds;
        const floor = point.scale.y * 0.3;
        // One heavy bounce on the road, then it stays where it fell.
        if (point.pos.y < floor) {
          point.pos.y = floor;
          if (point.vel.y < -2.5) {
            point.vel.y *= -0.28;
            point.vel.x *= 0.45;
            point.vel.z *= 0.45;
            point.spin.multiplyScalar(0.5);
          } else point.rest = true;
        }
      }
      mesh.setMatrixAt(
        index7,
        transformMatrix.compose(
          point.pos,
          rotationQuaternion.setFromEuler(point.rot),
          point.scale,
        ),
      );
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  return {
    meshes,
    /** clock: seconds into the re-entry (negative for the end of back-through), or null when off. */
    update(clock: number | null, deltaSeconds: number) {
      if (clock === null || clock < -0.8) {
        if (chunkMesh.visible) {
          meshes.forEach((material2) => (material2.visible = false));
          [...chunks, ...grit].forEach((point) => (point.live = false));
          last = -Infinity;
        }
        return;
      }
      if (clock < last)
        [...chunks, ...grit].forEach((point) => (point.live = false));
      last = clock;
      meshes.forEach((material2) => (material2.visible = true));
      step(chunks, chunkMesh, clock, deltaSeconds);
      step(grit, gritMesh, clock, deltaSeconds);
    },
    dispose() {
      meshes.forEach((material2) => material2.dispose());
      material.dispose();
    },
  };
}

type SceneProps = {
  director: CameraDirector;
  seq: SequenceDirector;
  marker: React.RefObject<HTMLButtonElement | null>;
  readout: React.RefObject<HTMLDivElement | null>;
  audio: AudioDirector;
};
/**
 * Mount and advance the opening world, actor, camera and interaction services.
 */
function AwakeScene({ director, seq, marker, readout, audio }: SceneProps) {
  const { camera, gl, size, scene } = useThree();
  const advance = useThree((state) => state.advance);
  const environment = useMemo(() => createPortalDimension(), []);
  const rupture = useMemo(() => createRuptureSet(environment), [environment]);
  const sf = useMemo(() => createSanFransokyo(), []);
  const gate = useMemo(() => createPortalGate(24), []);
  const chip = useMemo(() => new ChipController(), []);
  const post = useMemo(
    () => new CinematicPost(gl, scene, camera as PerspectiveCamera),
    [gl, scene, camera],
  );
  // Development only: lets tooling pump frames when the browser throttles requestAnimationFrame.
  useEffect(() => {
    if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
      (
        window as unknown as { __lattiseFrame: (timeSeconds?: number) => void }
      ).__lattiseFrame = (timeSeconds?: number) =>
        advance(timeSeconds ?? performance.now());
      (window as unknown as { __lattiseDebug: unknown }).__lattiseDebug = {
        post,
        scene,
        gl,
        camera,
        environment,
        rupture,
        seq,
      };
    }
  }, [advance, post, scene, gl, camera, environment, rupture, seq]);
  const baymax = useRef<BaymaxController | null>(null);
  const [shell, setShell] = useState<Group | null>(null);
  useCanvasBudget(!!shell, 3_800_000);
  // Tracker T-01: a quality-tier change resizes the canvas from inside the frame loop, right before
  // the frame is drawn. Resizing from a React commit cleared the canvas and the bare page showed
  // through for a frame (the black flicker); useCanvasBudget already adjusts the ratio in-frame.
  const setDpr = useThree((state) => state.setDpr),
    qualityDpr = useRef(useQuality.getState().dpr),
    appliedDpr = useRef(qualityDpr.current);
  useEffect(
    () =>
      useQuality.subscribe((state) => {
        qualityDpr.current = state.dpr;
      }),
    [],
  );
  useFrame(() => {
    if (qualityDpr.current !== appliedDpr.current) {
      appliedDpr.current = qualityDpr.current;
      setDpr(qualityDpr.current);
    }
  });
  const worldMasks = useMemo(
    () => ({
      city: portalWorldMask(sf.group),
      dimension: portalWorldMask(environment.group),
      rupture: portalWorldMask(rupture.root),
      chip: portalWorldMask(chip.group),
    }),
    [sf, environment, rupture, chip],
  );
  const shellMask = useMemo(
    () => (shell ? portalWorldMask(shell) : null),
    [shell],
  );
  useEffect(
    () => () => {
      Object.values(worldMasks).forEach((mask) => mask.dispose());
      shellMask?.dispose();
    },
    [worldMasks, shellMask],
  );
  const pins = useRef<ReturnType<typeof pinLights> | null>(null);
  useEffect(
    () => () => {
      pins.current?.dispose();
      pins.current = null;
    },
    [],
  );
  const elapsed = useRef(0),
    replay = useRef(0),
    magnetCue = useRef(false),
    sealCue = useRef(false);
  const phaseT = useRef(0),
    prevPhaseRef = useRef<string>('');
  const rock = useMemo(() => {
    const mesh = new Mesh(
      new DodecahedronGeometry(0.34, 0),
      new MeshStandardMaterial({
        color: '#5f6b6c',
        roughness: 0.95,
        flatShading: true,
      }),
    );
    mesh.visible = false;
    mesh.scale.set(1, 0.8, 1.15);
    return mesh;
  }, []);
  const rockFwd = useMemo(() => new Vector3(), []),
    rockSide = useMemo(() => new Vector3(), []);
  const debris = useMemo(
    () => createDebris(rock.geometry as DodecahedronGeometry),
    [rock],
  );
  useEffect(() => {
    scene.add(rock, ...debris.meshes);
    return () => {
      scene.remove(rock, ...debris.meshes);
      debris.dispose();
      rock.geometry.dispose();
      (rock.material as MeshStandardMaterial).dispose();
    };
  }, [scene, rock, debris]);
  const context2 = useMemo<ShotContext>(
    () => ({
      chest: new Vector3(3, 1.97, -11.3),
      normal: new Vector3(0, 0, 1),
      chip: new Vector3(),
      baymax: new Vector3(2.7, 0, -12),
      head: new Vector3(2.72, 2.98, -11.6),
    }),
    [],
  );
  const projection = useMemo(() => new Vector3(), []);
  useEffect(() => {
    let active = true;
    assets
      .loadBaymax()
      .then((model) => {
        if (!active) return;
        baymax.current = new BaymaxController(model);
        setShell(model);
      })
      .catch(() =>
        useSceneState.setState({
          error: 'Could not load Baymax’s shell. Check your connection.',
        }),
      );
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    post.resize(size.width, size.height);
  }, [post, size]);
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl),
      room = new RoomEnvironment(),
      env = pmrem.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.28;
    room.dispose();
    pmrem.dispose();
    return () => {
      scene.environment = null;
      env.dispose();
      post.dispose();
      environment.dispose();
      sf.dispose();
      gate.dispose();
    };
  }, [gl, scene, post]);
  useEffect(() => {
    if (!shell) return;
    // Compile every program the sequence will ever need while the boot screen still covers it,
    // so no blast, tear or corridor stalls the frame the first time it appears.
    let active = true;
    // Compile the linear composer variants, rather than the default framebuffer variants.
    // The armoured suit is parsed and mounted first, so its programs compile with the rest; the
    // reentry rock and its debris shower are shown for the compile too (tracker Q-02, S-02).
    const compiled = (baymax.current?.prepareSuit() ?? Promise.resolve()).then(
      () => {
        // Every light stays counted from here on, so phase changes never recompile (tracker R-01).
        pins.current ??= pinLights(scene);
        pins.current.before();
        const previousTarget = gl.getRenderTarget();
        gl.setRenderTarget(post.composer.readBuffer);
        rock.visible = true;
        debris.meshes.forEach((material) => (material.visible = true));
        const sceneObject = gl.compileAsync(scene, camera);
        rock.visible = false;
        debris.meshes.forEach((material) => (material.visible = false));
        gl.setRenderTarget(previousTarget);
        pins.current.after();
        return sceneObject;
      },
    );
    void compiled
      .then(async () => {
        if (!active) return;
        const lens = camera as PerspectiveCamera,
          position = lens.position.clone(),
          rotation = lens.quaternion.clone(),
          fov = lens.fov;
        const cityVisible = sf.group.visible,
          gateVisible = gate.group.visible,
          dimensionVisible = environment.group.visible,
          close = gate.closeAmount;
        const opening = post.fx.opening,
          aperture = post.fx.aperture,
          exposure = gl.toneMappingExposure;
        const bg = scene.background as Color | null,
          fog = scene.fog as FogExp2 | null;
        const background = bg?.clone(),
          fogColor = fog?.color.clone(),
          fogDensity = fog?.density;
        const phase = useSceneState.getState().phase,
          intro = INTRO_PORTAL.includes(phase),
          inCity = intro && position.z > 24;
        const masks = (
          city: 'inside' | 'outside' | 'none',
          dimension: 'inside' | 'outside' | 'none',
        ) => {
          worldMasks.city.set(city);
          worldMasks.dimension.set(dimension);
          worldMasks.rupture.set(dimension);
          worldMasks.chip.set(dimension);
          shellMask?.set(dimension);
        };
        const portalPose = () => {
          masks('inside', 'outside');
          bg?.copy(STREET_BG);
          if (fog) {
            fog.color.copy(STREET_FOG);
            fog.density = 0.015;
          }
          lens.position.set(-0.6, 2.3, 10.6);
          lens.lookAt(0, 4.2, 24);
          lens.fov = 50;
          lens.updateProjectionMatrix();
          lens.updateMatrixWorld();
          post.fx.opening = true;
          post.fx.aperture = -1;
          pins.current?.before();
          post.render(0, 1, 0, 14);
          pins.current?.after();
        };
        try {
          sf.group.visible = true;
          gate.group.visible = true;
          environment.group.visible = true;
          gate.setClose(PORTAL_CLOSE['portal-sighted'] ?? 0.1);
          gate.update(elapsed.current, 0);
          sf.update(elapsed.current);
          // Warm the actual stencil-bound portal before playback, rather than an unmasked city.
          portalPose();
          // Real draws upload hero buffers/textures and prepare shadow, normal and depth passes.
          lens.position.set(2.34, 2.16, -8.7);
          lens.lookAt(2.8, 2.5, -11.65);
          lens.fov = 41;
          lens.updateProjectionMatrix();
          lens.updateMatrixWorld();
          post.fx.opening = false;
          post.fx.aperture = 0.0001;
          pins.current?.before();
          post.render(0, 1, 0.6, 4);
          pins.current?.after();
          masks('outside', 'inside');
          bg?.copy(SF_BG);
          if (fog) {
            fog.color.copy(SF_FOG);
            fog.density = 0.004;
          }
          lens.position.set(0, 2.8, 29);
          lens.lookAt(0, 15, 110);
          lens.fov = 54;
          lens.updateProjectionMatrix();
          lens.updateMatrixWorld();
          post.fx.opening = true;
          post.fx.aperture = -1;
          pins.current?.before();
          post.render(0, 1, 0, 80);
          pins.current?.after();
          // Leave the opening image in the canvas while the covered scene state is restored.
          portalPose();
        } finally {
          lens.position.copy(position);
          lens.quaternion.copy(rotation);
          lens.fov = fov;
          lens.updateProjectionMatrix();
          lens.updateMatrixWorld();
          sf.group.visible = cityVisible;
          gate.group.visible = gateVisible;
          environment.group.visible = dimensionVisible;
          gate.setClose(close);
          gate.update(elapsed.current, 0);
          masks(
            intro ? (inCity ? 'outside' : 'inside') : 'none',
            intro ? (inCity ? 'inside' : 'outside') : 'none',
          );
          if (bg && background) bg.copy(background);
          if (fog && fogColor) {
            fog.color.copy(fogColor);
            fog.density = fogDensity!;
          }
          post.fx.opening = opening;
          post.fx.aperture = aperture;
          gl.toneMappingExposure = exposure;
        }
        // Keep the boot cover until queued warm-up draws have actually finished on the GPU.
        const context = gl.getContext() as WebGL2RenderingContext,
          fence = context.fenceSync(context.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (fence) {
          context.flush();
          await new Promise<void>((resolve) => {
            const start = performance.now();
            const poll = () => {
              const status = context.clientWaitSync(fence, 0, 0);
              if (
                status === context.TIMEOUT_EXPIRED &&
                performance.now() - start < 10000
              ) {
                setTimeout(poll, 16);
                return;
              }
              context.deleteSync(fence);
              resolve();
            };
            poll();
          });
        }
        if (active) {
          useSceneState.getState().ready();
          // Authoring shortcut follows the real director, actor and effects; production always starts at the portal.
          if (
            import.meta.env.DEV &&
            new URLSearchParams(location.search).get('phase1') === 'fight'
          )
            useSceneState.setState({ phase: 'ignition', chapter: 'RED_WAKE' });
        }
      })
      .catch(() => {
        if (active)
          useSceneState.setState({
            error: 'Could not prepare the scene. Reload to try again.',
          });
      });
    return () => {
      active = false;
    };
  }, [
    shell,
    shellMask,
    gl,
    scene,
    camera,
    post,
    sf,
    gate,
    environment,
    worldMasks,
    rock,
    debris,
  ]);
  useEffect(
    () =>
      seq.on((event: SequenceEvent) => {
        rupture.onEvent(event, seq, camera as PerspectiveCamera);
        const pan = (point: Vector3) => {
          projection.copy(point).project(camera);
          return Math.max(-1, Math.min(1, projection.x * 0.8));
        };
        if (event.type === 'charge') audio.charge(pan(event.position));
        if (event.type === 'discharge') audio.discharge(pan(event.from));
        if (event.type === 'impact')
          audio.impact(
            event.power,
            event.tear,
            pan(event.position),
            Math.min(1, 7 / camera.position.distanceTo(event.position)),
          );
        if (event.type === 'beat' && event.beat === 'overhead')
          setTimeout(() => audio.flyby(), 250);
        if (event.type === 'beat' && event.beat === 'silhouette')
          useSceneState.getState().say('That’s not him.');
        if (event.type === 'beat' && event.beat === 'final')
          useSceneState.getState().say('He’s tearing it apart—');
      }),
    [seq, rupture, audio, camera, projection],
  );
  useFrame((_, delta) => {
    const deltaSeconds = Math.min(delta, 0.25);
    elapsed.current += deltaSeconds;
    const timeSeconds = elapsed.current;
    if (useSceneState.getState().phase !== prevPhaseRef.current) {
      prevPhaseRef.current = useSceneState.getState().phase;
      phaseT.current = 0;
    }
    phaseT.current += deltaSeconds;
    // The portal run is timed by the frames it animates on, so a slow frame can't cut it short (tracker Q-02).
    {
      const point = useSceneState.getState().phase,
        depth = SHELL_DURATIONS[point];
      if (depth && FRAME_TIMED.includes(point) && phaseT.current >= depth)
        useSceneState.getState().advance(point);
    }
    const state = useSceneState.getState(),
      phase = state.phase;
    if (state.replay !== replay.current) {
      replay.current = state.replay;
      rupture.reset();
      gate.reset();
    }
    seq.update(deltaSeconds);
    const endPoint = baymax.current;
    if (endPoint) {
      endPoint.chestFrame(context2.chest, context2.normal);
      context2.baymax.copy(endPoint.shell.position);
      context2.head
        .copy(endPoint.shell.position)
        .add(
          projection.set(0.05, 2.98, 0.25).applyEuler(endPoint.shell.rotation),
        );
      endPoint.headFocus(context2.head);
    }
    context2.chip.copy(chip.group.children[0].position);
    director.update(
      camera as PerspectiveCamera,
      deltaSeconds,
      size.width,
      size.height,
      seq,
      context2,
    );
    const introPortal = INTRO_PORTAL.includes(phase),
      inSF = introPortal && camera.position.z > 24;
    // The gate stays in the world through the hurt re-entry, until it has sealed behind him.
    if (phase === 'reentry' && phaseT.current >= SEAL_AT && !gate.sealed) {
      if (!sealCue.current) {
        sealCue.current = true;
        gate.seal();
        audio.charge(0);
      }
    }
    if (phase !== 'reentry') sealCue.current = false;
    if (INTRO_PORTAL.includes(phase) && gate.sealed) gate.reset();
    const gateLive = introPortal || (phase === 'reentry' && !gate.sealed);
    if (!inSF)
      environment.update(
        timeSeconds,
        deltaSeconds,
        reducedMotion,
        director.visualProgress,
        phase,
        seq,
        ['chase', 'fracture', 'pulled'].includes(phase)
          ? camera.position
          : null,
      );
    endPoint?.update(
      timeSeconds,
      deltaSeconds,
      reducedMotion,
      phase,
      seq,
      camera.position,
    );
    chip.update(
      timeSeconds,
      deltaSeconds,
      reducedMotion,
      phase,
      seq,
      camera as PerspectiveCamera,
      endPoint,
    );
    rupture.update(
      timeSeconds,
      deltaSeconds,
      seq,
      phase,
      camera as PerspectiveCamera,
    );
    if (
      phase === 'socket-ready' &&
      seq.alignment > 0.35 &&
      !magnetCue.current
    ) {
      magnetCue.current = true;
      audio.shellCue('magnet');
    }
    if (phase !== 'socket-ready') magnetCue.current = false;
    audio.update(director.visualProgress, phase, seq.phaseTime, {
      red: seq.red,
      alignment: seq.alignment,
      corridor: seq.corridor,
      collapse: seq.collapse,
      thrust: ['ignition', 'chase', 'fracture'].includes(phase)
        ? phase === 'ignition'
          ? Math.min(1, Math.max(0, (seq.phaseTime - 1.9) * 2))
          : 1
        : 0,
    });
    // Through the seam the city falls away; only the corridor remains.
    // The escape attempt: the gate and the normal world appear while Hiro tries to leave, and the
    // gate slowly irises shut. Both are hidden again once he commits to Baymax (the approach).
    gate.group.visible = gateLive;
    sf.group.visible = gateLive;
    gate.setShown(gateLive);
    gate.setTension(
      phase === 'sf-turnback'
        ? MathUtils.smoothstep(phaseT.current, 0.8, 3.4)
        : phase === 'back-decision' || phase === 'back-through'
          ? 1
          : 0,
    );
    gate.update(
      timeSeconds,
      deltaSeconds,
      gateLive ? (PORTAL_CLOSE[phase] ?? 0) : 0,
    );
    if (gateLive) sf.update(timeSeconds);
    if (gate.imploded) {
      cameraRig.shake('portal', 0.9);
      seq.shake = Math.max(seq.shake, 0.45);
      audio.impact(0.85, false, 0, 0.75);
    }
    worldMasks.city.set(gateLive ? (inSF ? 'outside' : 'inside') : 'none');
    const dimensionMask = gateLive ? (inSF ? 'inside' : 'outside') : 'none';
    worldMasks.dimension.set(dimensionMask);
    worldMasks.rupture.set(dimensionMask);
    worldMasks.chip.set(dimensionMask);
    shellMask?.set(dimensionMask);
    const inside = phase === 'handoff';
    environment.group.visible = !inside;
    const bg = scene.background as Color | null,
      fog = scene.fog as FogExp2 | null;
    if (bg) bg.copy(inside ? CORRIDOR_BG : inSF ? SF_BG : STREET_BG);
    if (fog) {
      fog.color.copy(inside ? CORRIDOR_FOG : inSF ? SF_FOG : STREET_FOG);
      fog.density = inside
        ? 0.012
        : inSF
          ? 0.004
          : 0.015 + director.visualProgress * 0.006 + seq.collapse * 0.01;
    }
    // UI anchors are projected from the world, never fixed to the screen.
    if (marker.current) {
      const focus =
        phase === 'chip-focus'
          ? context2.chip
          : phase === 'chest-focus'
            ? context2.chest
            : projection.set(3.12, 2.06, -11.28);
      projection.copy(focus).project(camera);
      marker.current.style.transform = `translate(${(projection.x * 0.5 + 0.5) * size.width}px,${(-projection.y * 0.5 + 0.5) * size.height}px) translate(-50%,-50%)`;
      marker.current.style.setProperty('--hold', seq.holdProgress.toFixed(3));
    }
    if (readout.current) {
      projection
        .copy(context2.head)
        .add(context2.normal.clone().multiplyScalar(0.2))
        .project(camera);
      // Beside the head, past its silhouette, so the text never sits on white.
      readout.current.style.left = `${Math.min(0.74, projection.x * 0.5 + 0.5 + 0.16) * size.width}px`;
      readout.current.style.top = `${Math.max(0.18, -projection.y * 0.5 + 0.5 + 0.02) * size.height}px`;
    }
    const fx = post.fx;
    fx.opening = introPortal || phase === 'reentry' || phase === 'loading';
    fx.action = ['ignition', 'chase', 'fracture', 'pulled'].includes(phase);
    fx.warp = seq.warp;
    fx.center.copy(seq.warpCenter);
    fx.flash = seq.flash;
    fx.white = seq.whiteout;
    fx.red = seq.red * (phase === 'handoff' ? 0 : 0.8);
    fx.time = timeSeconds;
    fx.cyan =
      phase === 'fracture'
        ? seq.corridor * 0.45
        : phase === 'pulled'
          ? 0.6
          : phase === 'handoff'
            ? 0.35
            : 0;
    fx.chroma =
      seq.warp * 0.8 +
      (phase === 'pulled' ? seq.collapse : 0) +
      (phase === 'threat' ? 0.12 : 0);
    fx.aperture = ['chip-focus', 'chip-reaching', 'chip-held'].includes(phase)
      ? 0.00042
      : [
            'chest-focus',
            'panel-opening',
            'socket-ready',
            'inserting',
            'silence',
          ].includes(phase)
        ? 0.0003
        : ['booting', 'diagnostic', 'corrupting', 'threat'].includes(phase)
          ? 0.00018
          : ['discovery', 'inspected'].includes(phase)
            ? 0.00016
            : 0;
    // Hurt crossing back: a hard red hit, chromatic tear, fading as he goes still before the blink.
    if (phase === 'reentry') {
      const rt = phaseT.current;
      fx.flash = Math.max(fx.flash, 0.28 * Math.exp(-rt * 6));
      fx.red = Math.max(fx.red, 0.68 * Math.exp(-rt * 1.8));
      fx.chroma = Math.max(fx.chroma, 0.14 * Math.exp(-rt * 2.3));
      // The rock: in from the side, tumbling, and into his face; a white hit, a tear, then black.
      if (rt > ROCK_FROM && rt < ROCK_AT + 0.04) {
        const blendFactor = Math.min(
          1,
          (rt - ROCK_FROM) / (ROCK_AT - ROCK_FROM),
        );
        camera.getWorldDirection(rockFwd);
        rockSide.crossVectors(rockFwd, camera.up).normalize();
        rock.position
          .copy(camera.position)
          .addScaledVector(rockSide, 5.5 * (1 - blendFactor))
          .addScaledVector(
            camera.up,
            2.4 * (1 - blendFactor) * (1 - blendFactor),
          )
          .addScaledVector(rockFwd, 0.3 + 5.5 * (1 - blendFactor));
        rock.rotation.x += deltaSeconds * 9;
        rock.rotation.z += deltaSeconds * 6;
        rock.visible = true;
      } else rock.visible = false;
      if (rt >= ROCK_AT) {
        const height = Math.exp(-(rt - ROCK_AT) * 8);
        fx.flash = Math.max(fx.flash, 0.85 * height);
        fx.chroma = Math.max(fx.chroma, 0.4 * height);
      }
    } else rock.visible = false;
    debris.update(
      phase === 'reentry'
        ? phaseT.current
        : phase === 'back-through'
          ? phaseT.current - (SHELL_DURATIONS['back-through'] ?? 2.2)
          : null,
      deltaSeconds,
    );
    // The seal: a white implosion flash and a brief chromatic tear.
    if (gate.flash > 0) {
      fx.flash = Math.max(fx.flash, gate.flash * 0.45);
      fx.chroma = Math.max(fx.chroma, gate.flash * 0.3);
    }
    gl.domElement.dataset.phase = phase;
    gl.domElement.dataset.progress = director.visualProgress.toFixed(3);
    gl.domElement.dataset.chase = seq.chase.toFixed(3);
    pins.current?.before();
    post.render(
      deltaSeconds,
      director.wake,
      director.visualProgress,
      director.focusDistance,
    );
    pins.current?.after();
    gl.domElement.dataset.drawCalls = String(gl.info.render.calls);
  }, 1);
  const check = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (useSceneState.getState().phase === 'discovery')
      useSceneState.getState().interact();
  };
  return (
    <>
      <color attach="background" args={['#101c31']} />
      <fogExp2 attach="fog" args={['#253e59', 0.015]} />
      <primitive object={environment.group} />
      <primitive object={sf.group} />
      <primitive object={gate.group} />
      <primitive object={gate.lights} />
      <primitive object={rupture.root} />
      <primitive object={chip.group} />
      {shell && (
        <primitive
          object={shell}
          onClick={check}
          onPointerOver={() => {
            if (useSceneState.getState().phase === 'discovery')
              gl.domElement.style.cursor = 'crosshair';
          }}
          onPointerOut={() => {
            gl.domElement.style.cursor = 'default';
          }}
        />
      )}
    </>
  );
}

/** Authored per-phase moments: sound one-shots and Hiro's few words. */
const PHASE_CUES: Partial<
  Record<Phase, [number, (audio: AudioDirector) => void][]>
> = {
  'chip-reaching': [
    [0, (firstEntry) => firstEntry.shellCue('grip')],
    [0.25, (firstEntry) => firstEntry.shellCue('lift')],
  ],
  'chip-held': [[0.2, (firstEntry) => firstEntry.shellCue('inspect')]],
  'panel-opening': [
    [0.45, (firstEntry) => firstEntry.shellCue('latch')],
    [0.75, (firstEntry) => firstEntry.shellCue('release')],
    [1.2, (firstEntry) => firstEntry.shellCue('servo')],
    [2.55, (firstEntry) => firstEntry.shellCue('present')],
  ],
  inserting: [[1.04, (firstEntry) => firstEntry.shellCue('lock')]],
  booting: [
    [0.2, (firstEntry) => firstEntry.shellCue('seal')],
    [0.95, (firstEntry) => firstEntry.power()],
    [1.3, (firstEntry) => firstEntry.shellCue('boot')],
    [3.5, (firstEntry) => firstEntry.shellCue('chime')],
  ],
  // The bent chime follows the combat-system alarm (dataLine) rather than sounding over it.
  diagnostic: [[5.45, (firstEntry) => firstEntry.shellCue('wrong')]],
  threat: [[1.7, (firstEntry) => firstEntry.shellCue('lock-on')]],
  ignition: [[1.9, (firstEntry) => firstEntry.spool()]],
  fracture: [[0, (firstEntry) => firstEntry.rupture()]],
  pulled: [[3.1, (firstEntry) => firstEntry.whiteout()]],
  // Rubble from the crossing lands round him and two chunks whip past (S-02) before the rock connects.
  reentry: [
    [0, (firstEntry) => firstEntry.impact(1, true, 0, 1)],
    [0.12, (firstEntry) => firstEntry.impact(0.6, false, -0.2, 1)],
    [0.35, (firstEntry) => firstEntry.rubble(-0.2, 0.6)],
    [0.62, (firstEntry) => firstEntry.rubble(0.35, 0.4)],
    [2.13, (firstEntry) => firstEntry.whiz(-0.5)],
    [2.43, (firstEntry) => firstEntry.whiz(0.5)],
    [2.7, (firstEntry) => firstEntry.rubble(0.2, 0.45)],
    [2.95, (firstEntry) => firstEntry.impact(1.3, true, 0.4, 1)],
  ],
  handoff: [[1.2, (firstEntry) => firstEntry.arrival()]],
};
const PHASE_LINES: Partial<
  Record<Phase, [number, string, ('HIRO' | 'BAYMAX')?][]>
> = {
  'call-baymax': [
    [0.3, 'Baymax! Come on — we have to go!'],
    [2.4, 'The portal’s closing!'],
  ],
  'sf-arrival': [[1.3, 'I made it… San Fransokyo.']],
  'sf-turnback': [
    [0.5, 'Baymax? …Baymax!'],
    [2.9, 'He’s not moving.'],
  ],
  'back-decision': [[0.4, 'I’m not leaving you.']],
  'back-through': [[0.2, 'Hold on—']],
  reentry: [[1.5, 'No— the way home…']],
  'chip-focus': [[1.4, 'Your combat chip… it came loose.']],
  'socket-ready': [
    [0.6, 'Healthcare chip is gone… but I can get you running.'],
  ],
  booting: [[4.3, 'Baymax—come on.']],
  threat: [[3.4, 'The combat chip is taking over.']],
  ignition: [[0.35, 'No—stay with me!']],
  fracture: [[2.6, 'We’re going home, Baymax!']],
};
const LINE_TIMES = [0.5, 1.3, 2.05, 2.8, 3.55, 4.55];
const SCRAMBLE = '▚▞░▒/\\#*+=_';

/**
 * Render one diagnostic readout line.
 */
function DiagnosticLine({ text, delay }: { text: string; delay: number }) {
  // Reconstructed, not typed: glyphs resolve from noise left to right.
  const [shown, setShown] = useState('');
  useEffect(() => {
    let frame = 0;
    const start = performance.now() + delay * 1000;
    const id = setInterval(() => {
      const timeSeconds = (performance.now() - start) / 1000;
      if (timeSeconds < 0) return;
      const resolved = Math.floor(timeSeconds * 38);
      setShown(
        text
          .split('')
          .map((colorValue, index) =>
            index < resolved || colorValue === ' '
              ? colorValue
              : index < resolved + 4
                ? SCRAMBLE[(index + frame) % SCRAMBLE.length]
                : '',
          )
          .join(''),
      );
      frame++;
      if (resolved >= text.length + 4) clearInterval(id);
    }, 33);
    return () => clearInterval(id);
  }, [text, delay]);
  return <>{shown}</>;
}

/**
 * Compose the opening experience, authored interaction state and cinematic presentation.
 */
export function ExperienceDirector() {
  const phase = useSceneState((state) => state.phase),
    chapter = useSceneState((state) => state.chapter),
    replay = useSceneState((state) => state.replay);
  const subtitle = useSceneState((state) => state.subtitle),
    speaker = useSceneState((state) => state.speaker),
    sound = useSceneState((state) => state.sound),
    error = useSceneState((state) => state.error);
  const [audioError, setAudioError] = useState(false),
    [linkVisible, setLinkVisible] = useState(false),
    [audioHint, setAudioHint] = useState(true);
  const aperture = useRef<HTMLDivElement>(null),
    marker = useRef<HTMLButtonElement>(null),
    readout = useRef<HTMLDivElement>(null);
  const [idleHint, setIdleHint] = useState(false),
    [runHint, setRunHint] = useState(false);
  const pressedAt = useRef(0),
    firstScroll = useRef(true),
    scrollGuard = useRef(0),
    idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    sprintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const camera = useMemo(() => new CameraDirector(), []),
    transitions = useMemo(() => new TransitionDirector(), []),
    audio = useMemo(() => new AudioDirector(), []),
    seq = useMemo(() => new SequenceDirector(), []);

  useEffect(() => {
    if (!aperture.current) return;
    // The blink now plays on the hurt re-entry; the escape opens on open eyes.
    if (phase === 'awakening') {
      firstScroll.current = true;
      transitions.awaken(aperture.current);
    } else if (phase === 'portal-sighted') transitions.open(aperture.current);
  }, [phase, replay, transitions]);
  useEffect(() => {
    useSceneState.setState({
      chapter: 'BOOT',
      phase: 'loading',
      targetProgress: 0,
      subtitle: '',
      error: null,
      sound: false,
    });
  }, []);
  useEffect(() => {
    setIdleHint(false);
    setRunHint(false);
    if (phase === 'approaching')
      idleTimer.current = setTimeout(() => setIdleHint(true), 6500);
    if (phase === 'chase')
      idleTimer.current = setTimeout(() => {
        if (performance.now() / 1000 - seq.lastInput > 2.4) setRunHint(true);
      }, 3200);
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [phase, seq]);
  useEffect(() => {
    const duration = SHELL_DURATIONS[phase];
    if (!duration || FRAME_TIMED.includes(phase)) return;
    const timer = setTimeout(
      () => useSceneState.getState().advance(phase),
      (duration * 1000) / (reducedMotion && phase === 'silence' ? 2 : 1),
    );
    return () => clearTimeout(timer);
  }, [phase, replay]);
  useEffect(() => {
    const timers = [
      ...(PHASE_CUES[phase] ?? []).map(([at, cue]) =>
        setTimeout(() => cue(audio), at * 1000),
      ),
      ...(PHASE_LINES[phase] ?? []).map(([at, text, who]) =>
        setTimeout(
          () => useSceneState.getState().say(text, who ?? 'HIRO'),
          at * 1000,
        ),
      ),
    ];
    // Each line chatters while its key and value resolve (38 glyphs a second, value .35 s behind), then sounds its verdict.
    if (phase === 'diagnostic')
      LINE_TIMES.forEach((at, index) => {
        const line = DIAGNOSTIC_LINES[index];
        timers.push(
          setTimeout(
            () =>
              audio.dataLine(
                line.tone,
                Math.max(
                  (line.key.length + 4) / 38,
                  0.35 + (line.value.length + 4) / 38,
                ),
              ),
            at * 1000,
          ),
        );
      });
    return () => timers.forEach(clearTimeout);
  }, [phase, audio, replay]);
  useEffect(() => {
    if (!subtitle) return;
    const timer = setTimeout(() => {
      if (useSceneState.getState().subtitle === subtitle)
        useSceneState.getState().say('');
    }, 3400);
    return () => clearTimeout(timer);
  }, [subtitle]);
  useEffect(() => {
    setLinkVisible(false);
    if (phase !== 'inspected') return;
    audio.failedLink();
    const timer = setTimeout(() => setLinkVisible(true), 2600);
    return () => clearTimeout(timer);
  }, [phase, audio]);
  useEffect(() => {
    const timer = setTimeout(() => setAudioHint(false), 16000);
    return () => clearTimeout(timer);
  }, []);
  useEffect(
    () => () => {
      transitions.dispose();
      audio.dispose();
    },
    [transitions, audio],
  );

  const skip = () => {
    camera.skipAwakening();
    if (aperture.current) transitions.skip(aperture.current);
  };
  const restart = () => {
    camera.resetPointer();
    seq.pointerDown = false;
    seq.keyHold = false;
    useSceneState.getState().restart();
  };
  // Replays go through the experience flow: one lock-guarded blink covers the reset.
  const replayRun = () => {
    void experience.jumpTo('AWAKE');
  };
  useEffect(() => setRunReset(restart), [camera, seq]);
  useEffect(() => {
    const input = () => {
      setIdleHint(false);
      setRunHint(false);
      seq.lastInput = performance.now() / 1000;
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
    const sprintPulse = () => {
      seq.sprint = true;
      if (sprintTimer.current) clearTimeout(sprintTimer.current);
      sprintTimer.current = setTimeout(() => {
        seq.sprint = false;
      }, 380);
    };
    const wheel = (event: WheelEvent) => {
      // Nothing in the opening scrolls: the wheel never reaches the page (or a pinch, the browser zoom).
      if (event.cancelable) event.preventDefault();
      const point = useSceneState.getState().phase;
      if (point === 'chase') {
        event.preventDefault();
        if (event.deltaY > 0) {
          input();
          sprintPulse();
        }
        return;
      }
      // Handling the chip: the wheel zooms (forward = closer).
      if (camera.zoomable) {
        event.preventDefault();
        input();
        camera.zoomBy(
          -Math.sign(event.deltaY) *
            Math.min(0.35, Math.abs(event.deltaY) * 0.0022),
        );
        return;
      }
      if (point !== 'approaching') return;
      event.preventDefault();
      input();
      if (firstScroll.current && event.deltaY > 0) {
        firstScroll.current = false;
        scrollGuard.current = performance.now() + 450;
        useSceneState.getState().move(0.065);
        return;
      }
      if (performance.now() < scrollGuard.current) return;
      useSceneState
        .getState()
        .move(Math.max(-0.022, Math.min(0.034, event.deltaY * 0.00024)));
    };
    const holdKeys = ['KeyE', 'Space', 'Enter'],
      runKeys = ['Space', 'ArrowUp', 'KeyW'],
      zoomIn = ['Equal', 'NumpadAdd'],
      zoomOut = ['Minus', 'NumpadSubtract'];
    const down = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const point = useSceneState.getState().phase;
      if (event.code === 'KeyR') {
        if (!event.repeat) replayRun();
        return;
      }
      if (event.code === 'Escape' && point === 'awakening') skip();
      if (event.code === 'KeyE' && point === 'discovery')
        useSceneState.getState().inspect();
      if (zoomIn.includes(event.code) && camera.zoomable) {
        event.preventDefault();
        camera.zoomBy(0.25);
      }
      if (zoomOut.includes(event.code) && camera.zoomable) {
        event.preventDefault();
        camera.zoomBy(-0.25);
      }
      if (
        ['KeyA', 'ArrowLeft'].includes(event.code) &&
        point === 'approaching'
      ) {
        event.preventDefault();
        input();
        camera.strafeInput = -1;
      }
      if (
        ['KeyD', 'ArrowRight'].includes(event.code) &&
        point === 'approaching'
      ) {
        event.preventDefault();
        input();
        camera.strafeInput = 1;
      }
      if (runKeys.includes(event.code) && point === 'approaching') {
        event.preventDefault();
        input();
        camera.holding = true;
      }
      if (runKeys.includes(event.code) && point === 'chase') {
        event.preventDefault();
        input();
        seq.sprint = true;
      }
      // Holds work from the keyboard too: E, Space or Enter commit the chip, the seam and the dock.
      if (
        holdKeys.includes(event.code) &&
        ([...HOLD_PHASES, 'socket-ready'] as Phase[]).includes(point)
      ) {
        event.preventDefault();
        if (!seq.keyHold) pressedAt.current = performance.now();
        seq.keyHold = true;
      }
    };
    const up = (event: KeyboardEvent) => {
      if (runKeys.includes(event.code)) {
        camera.holding = false;
        seq.sprint = false;
      }
      if (['KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight'].includes(event.code))
        camera.strafeInput = 0;
      if (holdKeys.includes(event.code)) {
        if (seq.keyHold) latch();
        seq.keyHold = false;
      }
    };
    const move = (event: PointerEvent) => {
      camera.pointer = {
        x: (event.clientX / innerWidth - 0.5) * 2,
        y: (event.clientY / innerHeight - 0.5) * 2,
      };
      seq.pointer.set(
        (event.clientX / innerWidth) * 2 - 1,
        -(event.clientY / innerHeight) * 2 + 1,
      );
    };
    const press = (event: PointerEvent) => {
      if (
        event.button !== 0 ||
        (event.target as HTMLElement).closest('button:not(.shell-interaction)')
      )
        return;
      const point = useSceneState.getState().phase;
      if (
        ([...HOLD_PHASES, 'socket-ready', 'chase'] as Phase[]).includes(point)
      ) {
        seq.pointerDown = true;
        pressedAt.current = performance.now();
        input();
      }
    };
    // A quick click on the chip or the seam is read as intent, not as a failed hold.
    const latch = () => {
      if (
        HOLD_PHASES.includes(useSceneState.getState().phase) &&
        performance.now() - pressedAt.current < 400
      )
        seq.latch = true;
    };
    const release = () => {
      if (seq.pointerDown) latch();
      camera.holding = false;
      seq.pointerDown = false;
    };
    const blur = () => {
      release();
      seq.keyHold = false;
      seq.sprint = false;
      camera.strafeInput = 0;
    };
    window.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', press);
    window.addEventListener('blur', blur);
    window.addEventListener('pointerup', release);
    return () => {
      window.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', press);
      window.removeEventListener('blur', blur);
      window.removeEventListener('pointerup', release);
    };
  }, [camera, transitions, seq]);

  const toggleSound = async () => {
    const enabled = !sound;
    try {
      await audio.setEnabled(enabled);
      useSceneState.getState().toggleSound();
      setAudioError(false);
      setAudioHint(false);
    } catch {
      setAudioError(true);
    }
  };
  // Tracker T-01: built once. Every re-render of <Canvas> re-applies its dpr prop, which undid
  // useCanvasBudget's ratio and resized (cleared) the canvas outside the frame loop on each
  // subtitle or phase change: a black flicker. The ratio is owned in-frame by AwakeScene instead.
  const world = useMemo(
    () => (
      <div className="world">
        <RenderBoundary>
          <Canvas
            camera={{
              fov: 50,
              near: 0.05,
              far: 360,
              position: [-0.6, 2.3, 10.6],
            }}
            dpr={useQuality.getState().dpr}
            shadows
            gl={{
              antialias: false,
              stencil: true,
              powerPreference: 'high-performance',
              toneMapping: ACESFilmicToneMapping,
              outputColorSpace: SRGBColorSpace,
            }}
            onCreated={({ gl, camera }) => {
              gl.toneMappingExposure = 1.12;
              camera.lookAt(0, 4.2, 24);
            }}
            fallback={<span aria-hidden="true" />}
          >
            <AwakeScene
              director={camera}
              seq={seq}
              marker={marker}
              readout={readout}
              audio={audio}
            />
            <RuntimeBridge />
          </Canvas>
        </RenderBoundary>
      </div>
    ),
    [camera, seq, audio],
  );
  const action = SHELL_ACTIONS[phase];
  const diagnosticVisible = [
    'diagnostic',
    'corrupting',
    'threat',
    'ignition',
  ].includes(phase);
  return (
    <main
      className={`experience phase-${phase}`}
      aria-label="LAST GATE: Hiro’s vision inside the portal dimension"
    >
      {world}
      <OpeningTitle phase={phase} />
      <div className="lens-vignette" aria-hidden="true" />
      <div className="film-grain" aria-hidden="true" />
      <div className="organic-blink" ref={aperture} aria-hidden="true">
        <i className="blink-lid blink-top" />
        <i className="blink-lid blink-bottom" />
      </div>
      <div className="arrival-flash" aria-hidden="true" />
      {/* He watches the gate seal first; only then does he black out. */}
      <div
        className={`knockout ${phase === 'reentry' ? 'on' : ''}`}
        style={{
          transitionDelay:
            phase === 'reentry' && !reducedMotion ? '3.02s' : '0s',
          transitionDuration: phase === 'reentry' ? '.15s' : undefined,
        }}
        aria-hidden="true"
      />
      <LoadingBaymax overlay ready={chapter !== 'BOOT'} />
      <button
        className="sound"
        onClick={toggleSound}
        aria-label={
          sound ? 'Mute atmospheric sound' : 'Enable atmospheric sound'
        }
        aria-pressed={sound}
      >
        <span className={`wave ${sound ? 'active' : ''}`} aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span>
          {audioError ? 'UNAVAILABLE' : sound ? 'SOUND ON' : 'SOUND OFF'}
        </span>
      </button>
      {audioHint && !sound && (
        <span className="audio-hint">HEADPHONES RECOMMENDED</span>
      )}
      <div className="suit-readout" aria-label="Suit location status">
        <span>
          LOCATION <b>UNRESOLVED</b>
        </span>
        <span>
          EXIT SIGNAL <b>— — —</b>
        </span>
        <i>PERSONAL LINK / OFFLINE</i>
      </div>
      <div className="subtitle" role="status" aria-live="polite">
        {subtitle && (
          <p key={subtitle} className={speaker === 'BAYMAX' ? 'baymax' : ''}>
            <span>{speaker}</span>
            {subtitle}
          </p>
        )}
      </div>
      {phase === 'awakening' && (
        <button className="skip" onClick={skip}>
          SKIP AWAKENING <span>ESC</span>
        </button>
      )}
      {phase === 'approaching' && idleHint && (
        <button
          className="approach"
          onClick={() => {
            setIdleHint(false);
            useSceneState.getState().move(0.065);
          }}
          aria-label="Move closer to Baymax"
        >
          MOVE <span>//</span> SCROLL
        </button>
      )}
      {phase === 'chase' && runHint && (
        <div className="run-hint" aria-hidden="true">
          RUN <span>//</span> HOLD · SCROLL
        </div>
      )}
      <button
        ref={marker}
        className={`shell-interaction ${phase === 'discovery' ? '' : 'shell-action'}`}
        hidden={!MARKER_PHASES.includes(phase)}
        onPointerDown={(event) => {
          if (phase === 'discovery') {
            event.stopPropagation();
            useSceneState.getState().interact();
          }
        }}
        onKeyDown={(event) => {
          if (
            phase === 'discovery' &&
            (event.key === 'Enter' || event.key === ' ')
          ) {
            event.preventDefault();
            useSceneState.getState().interact();
          }
        }}
        aria-label={action?.description || 'Check Baymax for a response'}
      >
        <span className="interaction-ring">
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <circle className="hold-track" cx="20" cy="20" r="18" />
            <circle className="hold-fill" cx="20" cy="20" r="18" />
          </svg>
        </span>
        <span className="interaction-label">
          {action?.label || 'CHECK RESPONSE'}{' '}
          <small>{phase === 'discovery' ? 'E' : 'CLICK + HOLD'}</small>
        </span>
      </button>
      <div
        ref={readout}
        className={`diagnostic ${diagnosticVisible ? 'visible' : ''}`}
        aria-live="polite"
      >
        {diagnosticVisible &&
          phase !== 'threat' &&
          phase !== 'ignition' &&
          DIAGNOSTIC_LINES.map((line, index) => (
            <p
              key={line.key}
              className={`tone-${line.tone}`}
              style={{ animationDelay: `${LINE_TIMES[index]}s` }}
            >
              <span>
                <DiagnosticLine text={line.key} delay={LINE_TIMES[index]} />
              </span>
              <i />
              <b>
                <DiagnosticLine
                  text={line.value}
                  delay={LINE_TIMES[index] + 0.35}
                />
              </b>
            </p>
          ))}
        {(phase === 'threat' || phase === 'ignition') && (
          <p className="threat-line">
            <span>
              <DiagnosticLine text="PRIMARY THREAT" delay={1.65} />
            </span>
            <i />
            <b>
              <DiagnosticLine text="HIRO HAMADA" delay={2.05} />
            </b>
          </p>
        )}
      </div>
      {phase === 'inspected' && (
        <div
          className={`failed-link ${linkVisible ? 'visible' : ''}`}
          aria-live="polite"
        >
          <span className="fault-dot" /> BAYMAX <span>NO RESPONSE</span>
        </div>
      )}
      <div className="signature" aria-hidden="true">
        LAST GATE
      </div>
      {ZOOM_PHASES.includes(phase) && (
        <div className="zoom-hint" aria-hidden="true">
          SCROLL <span>//</span> ZOOM
        </div>
      )}
      {phase === 'inspected' && linkVisible && (
        <button className="replay" onClick={replayRun}>
          REPLAY OPENING <span>R ↶</span>
        </button>
      )}
      {phase === 'handoff' && (
        <div className="handoff" role="status">
          <p>Baymax…</p>
        </div>
      )}
      {error && (
        <div className="failure">
          <p>{error}</p>
          <button onClick={() => location.reload()}>RECONNECT ↗</button>
        </div>
      )}
      <ProductionLayer />
      <p className="sr-only">
        The opening starts automatically. Press Escape to skip awakening.
        Scroll, hold Space, W, or Arrow Up, or use the move closer button to
        approach Baymax. Select Baymax or press E to check for a response. Then
        press and hold the mouse, or hold E, Space or Enter, to pick up the red
        chip and to release Baymax’s chest access. Move the pointer to guide the
        chip into the socket, or hold E to guide it automatically. When Baymax
        attacks, Hiro runs on his own; hold the mouse, Space, W or Arrow Up, or
        scroll, to sprint. Press A or D, or the left and right arrows, to step
        sideways on the approach. While handling the chip, scroll or press plus
        and minus to zoom. Press R to replay.
      </p>
    </main>
  );
}
