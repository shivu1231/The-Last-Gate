import * as THREE from 'three';
import type { SystemId, ViewMode } from './state';

/**
 * Baymax's internal hardware, built in the shell's own (upright) frame and parented to it, so it
 * lies wherever he lies. Only what the board needs to show and repair: the power cell and its
 * buses, the joint actuators, the thruster unit with its control plug, and the head sensor board.
 * Every material is transparent from the start so switching views never recompiles a shader.
 */

/** Local (upright) anchor of each system: where the camera and its hotspot go. */
export const LOCAL_ANCHORS: Record<Exclude<SystemId, 'chip'>, THREE.Vector3> = {
  power: new THREE.Vector3(0, 1.25, -0.12),
  motor: new THREE.Vector3(-1.02, 2.26, 0.02),
  thrusters: new THREE.Vector3(0, 1.95, -0.72),
  sensors: new THREE.Vector3(0, 2.95, 0.26),
};
const SHOULDER_L = new THREE.Vector3(-1.02, 2.26, 0.02);

type SystemMaterials = {
  body: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  copper: THREE.MeshStandardMaterial;
};

/**
 * Create the engineering hardware material groups used for internal inspection.
 */
function materials(): SystemMaterials {
  const make = (color: string, metalness: number, roughness: number) =>
    new THREE.MeshStandardMaterial({
      color,
      metalness,
      roughness,
      transparent: true,
      emissive: '#4fd2ff',
      emissiveIntensity: 0,
    });
  return {
    body: make('#9aa7ae', 0.72, 0.34),
    dark: make('#1f292f', 0.4, 0.55),
    copper: make('#c27a45', 1, 0.32),
  };
}

/** Places an object and returns it (three's `position` is read-only, so it can't be assigned). */
const at = <O extends THREE.Object3D>(
  object: O,
  xPosition: number,
  yPosition: number,
  zPosition: number,
) => {
  object.position.set(xPosition, yPosition, zPosition);
  return object;
};

/**
 * Build engineering cable geometry along the supplied control points.
 */
function tube(
  points: [number, number, number][],
  radius: number,
  material: THREE.Material,
) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((points2) => new THREE.Vector3(...points2)),
  );
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, 40, radius, 8, false),
    material,
  );
}

/**
 * Build inspectable power, actuator, thruster and sensor assemblies in the shell frame.
 */
export function createInternals(shell: THREE.Group) {
  const root = new THREE.Group();
  root.name = 'baymax-internals';
  shell.add(root);
  const material2 = {
    power: materials(),
    motor: materials(),
    thrusters: materials(),
    sensors: materials(),
  };
  const parts: Record<Exclude<SystemId, 'chip'>, THREE.Object3D[]> = {
    power: [],
    motor: [],
    thrusters: [],
    sensors: [],
  };
  const add = (system: keyof typeof parts, object: THREE.Object3D) => {
    root.add(object);
    parts[system].push(object);
    return object;
  };

  // ---- Power: the cell, its buses, the severed left-shoulder run and the auxiliary reroute.
  const material3 = material2.power;
  const cell = new THREE.Group();
  cell.position.copy(LOCAL_ANCHORS.power);
  cell.add(
    new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.56, 0.28), material3.body),
  );
  for (const yPosition of [-0.16, 0, 0.16])
    cell.add(
      at(
        new THREE.Mesh(
          new THREE.BoxGeometry(0.45, 0.035, 0.29),
          material3.dark,
        ),
        0,
        yPosition,
        0,
      ),
    );
  for (const xPosition of [-0.12, 0.12])
    cell.add(
      at(
        new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.035, 0.08, 12),
          material3.copper,
        ),
        xPosition,
        0.31,
        0,
      ),
    );
  // A scorched corner where the shell took the blast.
  const scorch = new THREE.MeshBasicMaterial({
    color: '#ff7a2e',
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  cell.add(
    at(
      new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.1), scorch),
      0.16,
      -0.22,
      0.145,
    ),
  );
  add('power', cell);
  const entries: [number, number, number] = [0, 1.55, -0.12];
  for (const target of [
    [1, 2.2, 0],
    [0.53, 0.62, 0.25],
    [-0.53, 0.62, 0.25],
    [0, 1.9, -0.6],
    [0, 2.75, 0.05],
    [0.42, 2, 0.42],
  ] as [number, number, number][]) {
    const mid: [number, number, number] = [
      (entries[0] + target[0]) * 0.5,
      (entries[1] + target[1]) * 0.5 + 0.12,
      (entries[2] + target[2]) * 0.5 - 0.08,
    ];
    add('power', tube([entries, mid, target], 0.018, material3.copper));
  }
  // The severed run to the left shoulder: two ends and a gap that still arcs.
  const severedCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(...entries),
    new THREE.Vector3(-0.5, 2.02, -0.02),
    new THREE.Vector3(-1, 2.2, 0),
  ]);
  const severedA = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(severedCurve.getPoints(20).slice(0, 11)),
      16,
      0.018,
      8,
      false,
    ),
    material3.copper,
  );
  const severedB = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(severedCurve.getPoints(20).slice(14)),
      10,
      0.018,
      8,
      false,
    ),
    material3.copper,
  );
  add('power', severedA);
  add('power', severedB);
  const sparkTex = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const drawingContext = canvas.getContext('2d')!;
    const group = drawingContext.createRadialGradient(32, 32, 0, 32, 32, 32);
    group.addColorStop(0, 'rgba(255,255,255,1)');
    group.addColorStop(0.3, 'rgba(255,200,120,.6)');
    group.addColorStop(1, 'rgba(255,120,40,0)');
    drawingContext.fillStyle = group;
    drawingContext.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  })();
  const spark = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: sparkTex,
      color: '#ffb36a',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  spark.position.copy(severedCurve.getPoint(0.62));
  spark.scale.setScalar(0.16);
  add('power', spark);
  // The auxiliary spine bus Hiro reroutes through. Hidden until the route is chosen.
  const rerouteMat = new THREE.MeshStandardMaterial({
    color: '#7fd8ff',
    emissive: '#3fc8ff',
    emissiveIntensity: 1.4,
    metalness: 0.6,
    roughness: 0.3,
    transparent: true,
  });
  const reroute = tube(
    [
      entries,
      [0, 0.95, -0.3],
      [-0.45, 1.35, -0.32],
      [-0.85, 1.95, -0.12],
      [-1, 2.2, 0],
    ],
    0.022,
    rerouteMat,
  );
  reroute.visible = false;
  add('power', reroute);

  // ---- Motor: shoulder and hip actuators. The left shoulder is the jammed one.
  const material4 = material2.motor;
  const jamMat = new THREE.MeshStandardMaterial({
    color: '#b07a3a',
    emissive: '#ff8a2a',
    emissiveIntensity: 0.7,
    metalness: 0.6,
    roughness: 0.35,
    transparent: true,
  });
  const actuator = (
    points: [number, number, number],
    material: THREE.Material,
  ) => {
    const group = new THREE.Group();
    group.position.set(...points);
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.24, 20),
      material,
    );
    body.rotation.z = Math.PI / 2;
    group.add(body);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.28, 16),
      material4.dark,
    );
    cap.rotation.z = Math.PI / 2;
    group.add(cap);
    // Index ring: a notch shows where "home" is.
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.125, 0.012, 8, 32),
      material4.copper,
    );
    ring.rotation.y = Math.PI / 2;
    group.add(ring);
    return add('motor', group);
  };
  actuator([1.02, 2.26, 0.02], material4.body);
  actuator([0.53, 0.55, 0.28], material4.body);
  actuator([-0.53, 0.55, 0.28], material4.body);
  const jammed = actuator(
    [SHOULDER_L.x, SHOULDER_L.y, SHOULDER_L.z],
    jamMat,
  ) as THREE.Group;

  // ---- Thrusters: the back unit, a cracked liner, and the half-seated control plug.
  const material5 = material2.thrusters;
  const unit = new THREE.Group();
  unit.position.copy(LOCAL_ANCHORS.thrusters);
  const housing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.22, 0.34, 24),
    material5.body,
  );
  housing.rotation.x = Math.PI / 2;
  unit.add(housing);
  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.2, 0.22, 24, 1, true),
    material5.dark,
  );
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.z = -0.27;
  unit.add(nozzle);
  const crack = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.2, 0.01),
    new THREE.MeshBasicMaterial({ color: '#ff9150', transparent: true }),
  );
  crack.position.set(0.13, 0.03, -0.29);
  crack.rotation.z = 0.5;
  unit.add(crack);
  const socket = new THREE.Mesh(
    new THREE.TorusGeometry(0.055, 0.012, 8, 24),
    material5.copper,
  );
  socket.position.set(0.24, 0.15, 0.02);
  unit.add(socket);
  const plug = new THREE.Group();
  plug.position.set(0.24, 0.15, 0.13);
  plug.add(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.1, 16).rotateX(Math.PI / 2),
      material5.dark,
    ),
  );
  const key = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.03, 0.1),
    material5.copper,
  );
  key.position.y = 0.05;
  plug.add(key);
  const lead = tube(
    [
      [0.24, 0.15, 0.18],
      [0.32, 0.3, 0.26],
      [0.1, 0.4, 0.3],
    ],
    0.012,
    material5.dark,
  );
  unit.add(lead);
  unit.add(plug);
  add('thrusters', unit);

  // ---- Sensors: the head board behind the eyes, still running.
  const material6 = material2.sensors;
  const board = new THREE.Group();
  board.position
    .copy(LOCAL_ANCHORS.sensors)
    .add(new THREE.Vector3(0, 0, -0.12));
  board.add(
    new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.05), material6.dark),
  );
  for (const xPosition2 of [-0.13, 0, 0.13])
    board.add(
      at(
        new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.03, 0.05, 16).rotateX(Math.PI / 2),
          material6.body,
        ),
        xPosition2,
        0,
        0.045,
      ),
    );
  add('sensors', board);

  // ---- Left arm articulation: the arm hangs where the actuator locked.
  const armL = new THREE.Group();
  armL.name = 'arm-left';
  armL.position.copy(SHOULDER_L);
  shell.add(armL);
  shell.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  shell.traverse((sceneObject) => {
    if (
      sceneObject instanceof THREE.Mesh &&
      !root.getObjectById(sceneObject.id)
    )
      meshes.push(sceneObject);
  });
  for (const material7 of meshes) {
    const position = material7.position,
      scaleX = -position.x;
    const upper =
        Math.abs(scaleX - 1.12) < 0.06 && Math.abs(position.y - 1.7) < 0.06,
      fore =
        Math.abs(scaleX - 1.23) < 0.06 && Math.abs(position.y - 0.82) < 0.06;
    const hand =
        Math.abs(scaleX - 1.25) < 0.06 && Math.abs(position.y - 0.35) < 0.06,
      finger =
        scaleX > 1 &&
        scaleX < 1.5 &&
        Math.abs(position.y - 0.29) < 0.03 &&
        position.z > 0.7;
    if (upper || fore || hand || finger) armL.attach(material7);
  }
  const allMats = [
    ...Object.values(material2).flatMap((material) => [
      material.body,
      material.dark,
      material.copper,
    ]),
    jamMat,
    rerouteMat,
  ];
  const systemMats: Record<
    keyof typeof material2,
    THREE.MeshStandardMaterial[]
  > = {
    power: [material3.body, material3.dark, material3.copper, rerouteMat],
    motor: [material4.body, material4.dark, material4.copper, jamMat],
    thrusters: [material5.body, material5.dark, material5.copper],
    sensors: [material6.body, material6.dark, material6.copper],
  };
  let reveal = 0;

  return {
    root,
    anchorWorld(system: Exclude<SystemId, 'chip'>, out: THREE.Vector3) {
      return out.copy(LOCAL_ANCHORS[system]).applyMatrix4(shell.matrixWorld);
    },
    update(
      time: number,
      deltaSeconds: number,
      scaleFactor: {
        mode: ViewMode;
        selected: SystemId | null;
        rerouted: boolean;
        plugAngle: number;
        plugSeated: boolean;
        actuatorAngle: number;
        actuatorReset: boolean;
      },
    ) {
      const blendFactor = 1 - Math.exp(-deltaSeconds * 5);
      reveal +=
        ((scaleFactor.mode === 'exterior' ? 0 : 1) - reveal) * blendFactor;
      root.visible = reveal > 0.02;
      for (const [system, list] of Object.entries(systemMats) as [
        keyof typeof material2,
        THREE.MeshStandardMaterial[],
      ][]) {
        const focus = scaleFactor.selected === system;
        const dim =
          scaleFactor.mode === 'isolate' && scaleFactor.selected && !focus
            ? 0.12
            : 1;
        const pulse = focus ? 0.35 + 0.25 * Math.sin(time * 3.2) : 0;
        for (const material of list) {
          if (material === rerouteMat || material === jamMat) {
            material.opacity = reveal * dim;
            continue;
          }
          material.opacity = reveal * dim;
          material.emissiveIntensity = pulse;
          material.depthWrite = material.opacity > 0.95;
        }
      }
      // Power: the gap arcs until the reroute carries the feed around it.
      reroute.visible = scaleFactor.rerouted;
      rerouteMat.emissiveIntensity = 1 + 0.6 * Math.sin(time * 6);
      spark.visible = !scaleFactor.rerouted && reveal > 0.1;
      spark.material.opacity =
        (Math.sin(time * 37) * Math.sin(time * 23) > 0.1 ? 1 : 0.15) * reveal;
      // Motor: the jammed actuator glows amber until it is back on its index.
      jamMat.emissiveIntensity = scaleFactor.actuatorReset
        ? 0
        : 0.5 + 0.3 * Math.sin(time * 4);
      jamMat.color.set(scaleFactor.actuatorReset ? '#9aa7ae' : '#b07a3a');
      const target = -THREE.MathUtils.degToRad(scaleFactor.actuatorAngle);
      armL.rotation.z +=
        (target - armL.rotation.z) * (1 - Math.exp(-deltaSeconds * 8));
      jammed.rotation.x = -THREE.MathUtils.degToRad(scaleFactor.actuatorAngle);
      // Thrusters: the plug turns with its key and seats into the socket.
      plug.rotation.z = THREE.MathUtils.degToRad(scaleFactor.plugAngle);
      plug.position.z +=
        ((scaleFactor.plugSeated ? 0.04 : 0.13) - plug.position.z) *
        (1 - Math.exp(-deltaSeconds * 6));
      (crack.material as THREE.MeshBasicMaterial).opacity = reveal;
      scorch.opacity = 0.8 * reveal;
    },
    dispose() {
      root.traverse((sceneObject) => {
        if ((sceneObject as THREE.Mesh).geometry)
          (sceneObject as THREE.Mesh).geometry.dispose();
      });
      allMats.forEach((material) => material.dispose());
      scorch.dispose();
      sparkTex.dispose();
      spark.material.dispose();
      (crack.material as THREE.Material).dispose();
      root.removeFromParent();
    },
    /** Shell materials (skin, armour) for the view modes; the internals and bay are excluded. */
    shellMaterials(exclude: THREE.Object3D[]) {
      const set = new Set<THREE.Material>();
      shell.traverse((sceneObject) => {
        if (!(sceneObject instanceof THREE.Mesh)) return;
        for (
          let sceneObject2: THREE.Object3D | null = sceneObject;
          sceneObject2;
          sceneObject2 = sceneObject2.parent
        )
          if (sceneObject2 === root || exclude.includes(sceneObject2)) return;
        (Array.isArray(sceneObject.material)
          ? sceneObject.material
          : [sceneObject.material]
        ).forEach((mesh) => set.add(mesh));
      });
      return [...set];
    },
  };
}
export type Internals = ReturnType<typeof createInternals>;
