import * as THREE from 'three';
import { assets } from '../src/systems/AssetManager';
import { BaymaxController } from '../src/characters/BaymaxController';
import {
  CameraDirector,
  type ShotContext,
} from '../src/systems/CameraDirector';
import {
  PULL_CONTACT_POSITION,
  SequenceDirector,
} from '../src/systems/SequenceDirector';
import { useSceneState, type Phase } from '../src/state/SceneStateManager';
import { SHELL_DURATIONS } from '../src/config/shell';
const shell = await assets.cloneBaymax(),
  actor = new BaymaxController(shell);
await actor.prepareSuit();
const seq = new SequenceDirector(),
  director = new CameraDirector(),
  camera = new THREE.PerspectiveCamera(54, 16 / 9, 0.1, 500);
camera.position.set(2, 2.5, -7);
camera.lookAt(2.7, 1.8, -12);
camera.updateMatrixWorld();
const context: ShotContext = {
  chest: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  chip: new THREE.Vector3(),
  baymax: new THREE.Vector3(),
  head: new THREE.Vector3(),
};
const snapshots: unknown[] = [];
let time = 0;
const vector = new THREE.Vector3(),
  box = new THREE.Box3();
const sampled = new Set<string>();
let checkedFrames = 0,
  peakStep = 0,
  impactClearance = Infinity,
  minMeshCameraDistance = Infinity,
  deltaSeconds = 1 / 60,
  sprinting = true;
const previous = new THREE.Vector3();
let hasPrevious = false;
const strikes: number[][] = [],
  cadence: unknown[] = [];
let attacks = 0;
seq.on((event) => {
  if (
    event.type === 'flyby' ||
    event.type === 'discharge' ||
    (event.type === 'impact' &&
      (seq.beat === 'final' || seq.beat === 'overhead'))
  )
    attacks++;
  if (event.type === 'impact' && seq.beat === 'rooftop') {
    const screen = event.position.clone().project(camera);
    strikes.push(screen.toArray());
    if (Math.abs(screen.x) > 0.95 || Math.abs(screen.y) > 0.95 || screen.z > 1)
      throw new Error('Ranged miss is outside the camera');
  }
});
/**
 * Measure the actor's projected mesh bounds for the opening regression check.
 */
function visibleBounds() {
  box.makeEmpty();
  shell.traverseVisible((sceneObject) => {
    if (
      sceneObject instanceof THREE.Mesh &&
      !Array.isArray(sceneObject.material) &&
      sceneObject.material.name === 'inflatable'
    )
      for (
        let index2 = 0;
        index2 < sceneObject.geometry.attributes.position.count;
        index2++
      ) {
        sceneObject
          .getVertexPosition(index2, vector)
          .applyMatrix4(sceneObject.matrixWorld);
        minMeshCameraDistance = Math.min(
          minMeshCameraDistance,
          vector.distanceTo(camera.position),
        );
        vector.project(camera);
        box.expandByPoint(vector);
      }
  });
}
seq.on((event) => {
  if (event.type === 'impact' && seq.beat === 'final') {
    shell.updateMatrixWorld(true);
    let low = Infinity;
    shell.traverseVisible((sceneObject) => {
      if (
        sceneObject instanceof THREE.Mesh &&
        !Array.isArray(sceneObject.material) &&
        !sceneObject.material.transparent &&
        sceneObject.parent?.name.startsWith('ankle-')
      )
        for (
          let index2 = 0;
          index2 < sceneObject.geometry.attributes.position.count;
          index2++
        ) {
          sceneObject
            .getVertexPosition(index2, vector)
            .applyMatrix4(sceneObject.matrixWorld);
          low = Math.min(low, vector.y);
        }
    });
    impactClearance = Math.abs(low + 0.14);
  }
});
/**
 * Advance one deterministic refinement-check frame through the real scene services.
 */
function frame(phase: Phase) {
  time += deltaSeconds;
  seq.sprint = sprinting;
  seq.update(deltaSeconds);
  actor.chestFrame(context.chest, context.normal);
  context.baymax.copy(shell.position);
  actor.headFocus(context.head);
  director.update(camera, deltaSeconds, 1280, 720, seq, context);
  actor.update(time, deltaSeconds, false, phase, seq, camera.position);
  shell.updateMatrixWorld(true);
  camera.updateMatrixWorld();
  if (
    phase === 'ignition' &&
    seq.phaseTime > 0.7 &&
    Math.round(seq.phaseTime * 60) % 6 === 0
  ) {
    visibleBounds();
    if (box.min.y < -0.98 || box.max.y > 0.98)
      throw new Error(
        `Launch crops Baymax at ${seq.phaseTime.toFixed(2)}: ${box.min.y}/${box.max.y}`,
      );
  }
  if (hasPrevious && phase === 'chase')
    peakStep = Math.max(
      peakStep,
      shell.position.distanceTo(previous) / deltaSeconds,
    );
  previous.copy(shell.position);
  hasPrevious = true;
  if (
    phase === 'chase' &&
    seq.beat &&
    seq.beatTime > 0.4 &&
    seq.beatTime <
      {
        silhouette: 1.6,
        overhead: 2.2,
        rooftop: 2.5,
        final: 3.1,
        'tear-pass': 0,
        launch: 0,
      }[seq.beat] &&
    Math.round(seq.beatTime * 60) % 6 === 0
  ) {
    visibleBounds();
    checkedFrames++;
    if (
      box.min.x < -0.98 ||
      box.max.x > 0.98 ||
      box.min.y < -0.98 ||
      box.max.y > 0.98 ||
      box.max.z >= 1
    )
      throw new Error(
        `Clipped ${seq.beat} at ${seq.beatTime.toFixed(2)}: ${box.min.toArray()} / ${box.max.toArray()}`,
      );
  }
  if (
    phase === 'chase' &&
    seq.beat &&
    !sampled.has(seq.beat) &&
    seq.beatTime >
      (seq.beat === 'rooftop' ? 1.43 : seq.beat === 'final' ? 2.28 : 0.65)
  ) {
    visibleBounds();
    snapshots.push({
      aspect: camera.aspect,
      beat: seq.beat,
      time: seq.beatTime,
      min: box.min.toArray(),
      max: box.max.toArray(),
      distance: camera.position.distanceTo(shell.position),
    });
    sampled.add(seq.beat);
  }
}
for (const [index, aspect] of [
  16 / 9,
  690 / 668,
  16 / 9,
  690 / 668,
].entries()) {
  deltaSeconds = index < 2 ? 1 / 60 : 1 / 30;
  sprinting = index < 2;
  attacks = 0;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  sampled.clear();
  useSceneState.setState({
    phase: 'ignition',
    chapter: 'RED_WAKE',
    replay: index,
  });
  for (
    let index3 = 0;
    index3 < Math.ceil(SHELL_DURATIONS.ignition! / deltaSeconds);
    index3++
  )
    frame('ignition');
  useSceneState.setState({ phase: 'chase' });
  let frames = 0;
  for (
    ;
    frames < Math.ceil(16 / deltaSeconds) &&
    useSceneState.getState().phase === 'chase';
    frames++
  )
    frame('chase');
  if (sampled.size !== 4) throw new Error('Missing flight beat');
  if (attacks !== 5)
    throw new Error(`Expected five attack contacts, received ${attacks}`);
  if (frames * deltaSeconds > 12.5)
    throw new Error('Fight stalls while waiting for input');
  cadence.push({
    aspect,
    fps: 1 / deltaSeconds,
    sprinting,
    seconds: frames * deltaSeconds,
    attacks,
  });
}
for (const shot of snapshots as {
  beat: string;
  min: number[];
  max: number[];
  distance: number;
}[]) {
  if (
    shot.min[0] < -0.93 ||
    shot.max[0] > 0.93 ||
    shot.min[1] < -0.93 ||
    shot.max[1] > 0.93 ||
    shot.max[2] >= 1
  )
    throw new Error(`Baymax leaves frame at ${shot.beat}`);
  if (shot.distance < 2) throw new Error(`Camera collision at ${shot.beat}`);
}
if (sampled.size !== 4)
  throw new Error('An authored flight beat was not exercised');
if (peakStep > 28) throw new Error(`Abrupt movement speed ${peakStep}`);
if (minMeshCameraDistance < 1)
  throw new Error(
    `A body surface collides with the camera: ${minMeshCameraDistance}`,
  );
if (impactClearance > 0.04)
  throw new Error(`Impact before sole contact: ${impactClearance}`);
deltaSeconds = 1 / 60;
useSceneState.setState({ phase: 'fracture', chapter: 'THE_FRACTURE' });
for (let index4 = 0; index4 < 336; index4++) frame('fracture');
useSceneState.setState({ phase: 'pulled' });
for (let index5 = 0; index5 < 87; index5++) frame('pulled');
const shoulderContact = shell
  .localToWorld(new THREE.Vector3(1.02, 2.26, 0.02))
  .distanceTo(PULL_CONTACT_POSITION);
if (shoulderContact > 0.55)
  throw new Error(`Displacement sparks miss shoulder: ${shoulderContact}`);
console.log(
  JSON.stringify(
    {
      cadence,
      openingShots: snapshots,
      checkedFrames,
      peakSpeed: peakStep,
      minMeshCameraDistance,
      impactClearance,
      strikes,
      shoulderContact,
      framing: 'all four beats retain head and feet',
      cameraCollision: 'clear',
    },
    null,
    2,
  ),
);
actor.dispose();
