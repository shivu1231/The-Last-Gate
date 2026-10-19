import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Box3,
  MathUtils,
  type Material,
  type Mesh,
  type Object3D,
  Raycaster,
  Vector3,
} from 'three';
import type { JourneyWorld } from '../recovery/journey';
import { reducedMotion } from '../config/experience';
import { claimInternals, muteDistantLights } from './preload';
import { hotspotElements, SYSTEMS, useBoard, type SystemId } from './state';

const SHELL_OPACITY = { exterior: 1, internal: 0.13, isolate: 0.06 } as const;
/** How often (s) the board re-checks what stands between the camera and Baymax. */
const OCCLUDER_INTERVAL = 0.2;

/**
 * The board's 3D half. It takes over the landing's camera with an orbit around the same Baymax,
 * builds his internals once, drives the view modes and the chest bay, and pins each hotspot
 * button over its system. All interaction state lives in the board store; nothing here owns UI.
 */
export function BoardScene({ world }: { world: JourneyWorld }) {
  const { camera, gl } = useThree();
  const assessment = useBoard((state) => state.assessment);
  const internals = useMemo(() => claimInternals(world), [world]);
  const shellMats = useMemo(() => {
    const list = internals.shellMaterials([world.bay.root]) as (Material & {
      opacity: number;
    })[];
    // Exterior stays in the opaque pass, so hidden layers do not shade through the whole body.
    list.forEach((material) => {
      material.forceSinglePass = true;
    });
    return list;
  }, [internals, world]);
  const originalTransparency = useMemo(
    () =>
      new Map(shellMats.map((material) => [material, material.transparent])),
    [shellMats],
  );
  const bounds = useMemo(() => new Box3().setFromObject(world.baymax), [world]);
  const body = useMemo(() => bounds.getCenter(new Vector3()), [bounds]);
  const corners = useMemo(
    () =>
      [0, 1].flatMap((xPosition) =>
        [0, 1].flatMap((yPosition) =>
          [0, 1].map((zPosition) =>
            new Vector3(
              xPosition ? bounds.max.x : bounds.min.x,
              yPosition ? bounds.max.y : bounds.min.y,
              zPosition ? bounds.max.z : bounds.min.z,
            ).sub(body),
          ),
        ),
      ),
    [bounds, body],
  );
  const eyeAxis = useMemo(() => new Vector3(), []),
    rightAxis = useMemo(() => new Vector3(), []),
    upAxis = useMemo(() => new Vector3(), []);
  // `home` is the overview angle: side-on from the lane, looking down on his chest. Dragging takes over.
  const orbit = useRef({
    az: 0,
    el: 0.6,
    dist: 5,
    ready: false,
    homeAz: 0,
    homeEl: 0.92,
    user: false,
  });
  const target = useRef(new Vector3()),
    desired = useRef(new Vector3()),
    scratchVector = useRef(new Vector3()),
    projected = useRef(new Vector3());
  const opacity = useRef(1),
    bayOpen = useRef(0);
  // Props that can block the view: everything the district built except the ground (it never occludes).
  const occluders = useMemo(() => {
    const list: Object3D[] = [],
      box = new Box3();
    world.district.props.traverse((sceneObject) => {
      if (
        (sceneObject as Mesh).isMesh &&
        box.setFromObject(sceneObject).max.y > -0.4
      )
        list.push(sceneObject);
    });
    return list;
  }, [world]);
  const hidden = useRef(new Set<Object3D>()),
    ray = useMemo(() => new Raycaster(), []),
    sinceCheck = useRef(0);
  const layout = useRef({ railRight: 0, panelLeft: 0, width: 0, height: 0 });
  const selected = useRef<SystemId | null>(null),
    zoomSmooth = useRef(1);

  useEffect(() => muteDistantLights(world), [world]);

  useEffect(() => {
    const rail = document.querySelector(
        assessment ? '.board-summary' : '.board-rail',
      ),
      panel = assessment ? null : document.querySelector('.board-inspector');
    const measure = () => {
      const width = gl.domElement.clientWidth,
        height = gl.domElement.clientHeight;
      const left =
          (rail?.getBoundingClientRect().right ?? 0) + (assessment ? 28 : 0),
        right = panel?.getBoundingClientRect().left ?? width - 28;
      layout.current = {
        railRight: left,
        panelLeft: right,
        width: width,
        height: height,
      };
      const offset = Math.round((left + right - width) / 2),
        shift = Math.abs(offset);
      const cam = camera as unknown as {
        setViewOffset: (
          fw: number,
          fh: number,
          xPosition: number,
          yPosition: number,
          width2: number,
          height2: number,
        ) => void;
      };
      cam.setViewOffset(
        width + shift * 2,
        height,
        offset < 0 ? shift * 2 : 0,
        0,
        width,
        height,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(gl.domElement);
    if (rail) observer.observe(rail);
    if (panel) observer.observe(panel);
    measure();
    return () => observer.disconnect();
  }, [camera, gl, assessment]);

  useEffect(
    () => () => {
      internals.dispose();
      world.bay.root.visible = true;
      shellMats.forEach((material) => {
        material.opacity = 1;
        material.depthWrite = true;
        material.transparent = originalTransparency.get(material) ?? false;
        material.needsUpdate = true;
      });
      hidden.current.forEach((sceneObject) => {
        sceneObject.visible = true;
      });
      hidden.current.clear();
      if ('clearViewOffset' in camera)
        (
          camera as unknown as { clearViewOffset: () => void }
        ).clearViewOffset();
    },
    [internals, shellMats, originalTransparency, camera],
  );

  // Orbit input: drag on the world rotates, the wheel zooms. Panels sit above and keep their own input.
  useEffect(() => {
    const el = gl.domElement;
    let drag: { x: number; y: number } | null = null;
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      drag = { x: event.clientX, y: event.clientY };
      el.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!drag || useBoard.getState().assessment) return;
      const offset = orbit.current;
      offset.user = true;
      offset.az -= (event.clientX - drag.x) * 0.006;
      offset.el = MathUtils.clamp(
        offset.el + (event.clientY - drag.y) * 0.004,
        0.22,
        1.35,
      );
      drag = { x: event.clientX, y: event.clientY };
    };
    const up = () => {
      drag = null;
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (useBoard.getState().assessment) return;
      const zoom = MathUtils.clamp(
        useBoard.getState().zoom * (1 + Math.sign(event.deltaY) * 0.1),
        0.5,
        1.3,
      );
      useBoard.setState({ zoom });
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [gl]);

  const anchor = (system: SystemId, out: Vector3) =>
    system === 'chip'
      ? out.copy(world.bay.dockWorld())
      : internals.anchorWorld(system, out);

  useFrame(({ clock }, delta) => {
    const deltaSeconds = Math.min(delta, 0.05),
      time = clock.elapsedTime,
      state = useBoard.getState(),
      offset = orbit.current;
    world.baymax.updateMatrixWorld();
    // Start the orbit exactly where the landing camera is, so START JOURNEY is one continuous move.
    if (!offset.ready) {
      scratchVector.current.copy(camera.position).sub(body);
      offset.az = Math.atan2(scratchVector.current.x, scratchVector.current.z);
      offset.dist = scratchVector.current.length();
      offset.el = Math.asin(
        MathUtils.clamp(scratchVector.current.y / offset.dist, -1, 1),
      );
      target.current.copy(body);
      offset.ready = true;
      // Body axis from hips to head; the overview looks across it from the lane side.
      internals.anchorWorld('sensors', scratchVector.current);
      const axis = scratchVector.current.sub(body);
      let px = -axis.z,
        pz = axis.x;
      if (px > 0) {
        px = -px;
        pz = -pz;
      }
      offset.homeAz = Math.atan2(px, pz);
    }
    if (selected.current !== state.selected || state.assessment) {
      selected.current = state.selected;
      offset.user = false;
    }
    if (!offset.user) {
      offset.az +=
        Math.atan2(
          Math.sin(offset.homeAz - offset.az),
          Math.cos(offset.homeAz - offset.az),
        ) * (reducedMotion ? 1 : 1 - Math.exp(-1.6 * deltaSeconds));
      offset.el +=
        (offset.homeEl - offset.el) *
        (reducedMotion ? 1 : 1 - Math.exp(-1.6 * deltaSeconds));
    }
    if (state.selected) anchor(state.selected, desired.current);
    else desired.current.copy(body);
    const callback = (length: number) =>
      reducedMotion ? 1 : 1 - Math.exp(-length * deltaSeconds);
    target.current.lerp(desired.current, callback(2.6));
    let overviewDistance = 6.7;
    if (!state.selected) {
      const { width, height, railRight, panelLeft } = layout.current;
      const tanV =
        Math.tan(
          MathUtils.degToRad((camera as unknown as { fov: number }).fov / 2),
        ) * 0.82;
      const tanH =
        (tanV * Math.max(220, panelLeft - railRight)) / Math.max(1, height);
      eyeAxis.set(
        Math.sin(offset.az) * Math.cos(offset.el),
        Math.sin(offset.el),
        Math.cos(offset.az) * Math.cos(offset.el),
      );
      rightAxis.set(Math.cos(offset.az), 0, -Math.sin(offset.az));
      upAxis.crossVectors(eyeAxis, rightAxis);
      if (width)
        for (const corner of corners)
          overviewDistance = Math.max(
            overviewDistance,
            Math.abs(corner.dot(rightAxis)) / tanH + corner.dot(eyeAxis),
            Math.abs(corner.dot(upAxis)) / tanV + corner.dot(eyeAxis),
          );
    }
    // Damp the wheel's zoom so it eases instead of stepping.
    zoomSmooth.current = MathUtils.damp(
      zoomSmooth.current,
      state.zoom,
      reducedMotion ? 20 : 8,
      deltaSeconds,
    );
    const dist =
      (state.selected
        ? state.selected === 'chip'
          ? 2.2
          : 3.5
        : overviewDistance) * zoomSmooth.current;
    offset.dist += (dist - offset.dist) * callback(2.2);
    camera.position.set(
      target.current.x +
        Math.sin(offset.az) * Math.cos(offset.el) * offset.dist,
      target.current.y + Math.sin(offset.el) * offset.dist,
      target.current.z +
        Math.cos(offset.az) * Math.cos(offset.el) * offset.dist,
    );
    camera.lookAt(target.current);

    // Keep Baymax in the free space between the systems rail and the inspector, not under a panel.
    const {
      width: width2,
      height: height2,
      railRight,
      panelLeft,
    } = layout.current;

    // Anything standing between the camera and Baymax is set aside while it's in the way.
    sinceCheck.current += deltaSeconds;
    if (sinceCheck.current > OCCLUDER_INTERVAL) {
      sinceCheck.current = 0;
      scratchVector.current.subVectors(camera.position, target.current);
      const reach = scratchVector.current.length();
      ray.set(target.current, scratchVector.current.normalize());
      ray.far = reach;
      const blocking = new Set(
        ray.intersectObjects(occluders, false).map((hit) => hit.object),
      );
      // A second ray from his body catches walls the target ray misses when a system is selected.
      scratchVector.current.subVectors(camera.position, body);
      const reachBody = scratchVector.current.length();
      ray.set(body, scratchVector.current.normalize());
      ray.far = reachBody;
      ray
        .intersectObjects(occluders, false)
        .forEach((hit) => blocking.add(hit.object));
      hidden.current.forEach((sceneObject) => {
        if (!blocking.has(sceneObject)) {
          sceneObject.visible = true;
          hidden.current.delete(sceneObject);
        }
      });
      blocking.forEach((sceneObject) => {
        sceneObject.visible = false;
        hidden.current.add(sceneObject);
      });
    }

    // View modes: the shell fades so the internals read; isolate fades it further.
    opacity.current +=
      (SHELL_OPACITY[state.mode] - opacity.current) * callback(5);
    for (const material of shellMats) {
      const transparent = opacity.current < 0.995;
      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.needsUpdate = true;
      }
      material.opacity = transparent ? opacity.current : 1;
      material.depthWrite = opacity.current > 0.98;
    }
    internals.update(time, deltaSeconds, state);
    // Seen through the shell the solid bay reads as a disc stuck in his body (tracker R-02): in the
    // internal and isolate views it shows only while the chip bay itself is selected.
    world.bay.root.visible =
      state.mode === 'exterior' || state.selected === 'chip';

    // The chest bay stays shut here (tracker Q-03): its seam only glows while Hiro reads the chips.
    bayOpen.current +=
      ((state.bayOpen && !state.assessment ? 1 : 0) - bayOpen.current) *
      (reducedMotion ? 1 : Math.min(1, deltaSeconds * 1.3));
    world.bay.update({
      t: time,
      open: 0,
      seated: 1,
      red: 0.9,
      seamGlow: 0.12 + 0.3 * bayOpen.current,
    });

    // Hotspots follow their systems on screen; hidden behind the camera or under a panel.
    for (const system of SYSTEMS) {
      const el = hotspotElements.get(system);
      if (!el) continue;
      projected.current
        .copy(anchor(system, scratchVector.current))
        .project(camera);
      const xPosition = (projected.current.x * 0.5 + 0.5) * width2,
        yPosition = (-projected.current.y * 0.5 + 0.5) * height2;
      const visible =
        projected.current.z < 1 &&
        xPosition > railRight + 12 &&
        xPosition < panelLeft - 12;
      el.style.transform = `translate(${xPosition}px,${yPosition}px) translate(-50%,-50%)`;
      el.style.visibility = visible ? 'visible' : 'hidden';
    }
  });

  // A soft work light over the apron: Baymax reads first, the street falls back.
  return null;
}
