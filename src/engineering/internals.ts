import * as T from 'three';
import type { SystemId, ViewMode } from './state';

/**
 * Baymax's internal hardware, built in the shell's own (upright) frame and parented to it, so it
 * lies wherever he lies. Only what the board needs to show and repair: the power cell and its
 * buses, the joint actuators, the thruster unit with its control plug, and the head sensor board.
 * Every material is transparent from the start so switching views never recompiles a shader.
 */

/** Local (upright) anchor of each system: where the camera and its hotspot go. */
export const LOCAL_ANCHORS: Record<Exclude<SystemId, 'chip'>, T.Vector3> = {
  power: new T.Vector3(0, 1.25, -.12),
  motor: new T.Vector3(-1.02, 2.26, .02),
  thrusters: new T.Vector3(0, 1.95, -.72),
  sensors: new T.Vector3(0, 2.95, .26),
};
const SHOULDER_L = new T.Vector3(-1.02, 2.26, .02);

type SystemMaterials = { body: T.MeshStandardMaterial; dark: T.MeshStandardMaterial; copper: T.MeshStandardMaterial };

function materials(): SystemMaterials {
  const make = (color: string, metalness: number, roughness: number) =>
    new T.MeshStandardMaterial({ color, metalness, roughness, transparent: true, emissive: '#4fd2ff', emissiveIntensity: 0 });
  return { body: make('#9aa7ae', .72, .34), dark: make('#1f292f', .4, .55), copper: make('#c27a45', 1, .32) };
}

/** Places an object and returns it (three's `position` is read-only, so it can't be assigned). */
const at = <O extends T.Object3D>(object: O, x: number, y: number, z: number) => { object.position.set(x, y, z); return object; };

function tube(points: [number, number, number][], radius: number, material: T.Material) {
  const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
  return new T.Mesh(new T.TubeGeometry(curve, 40, radius, 8, false), material);
}

export function createInternals(shell: T.Group) {
  const root = new T.Group(); root.name = 'baymax-internals'; shell.add(root);
  const mats = { power: materials(), motor: materials(), thrusters: materials(), sensors: materials() };
  const parts: Record<Exclude<SystemId, 'chip'>, T.Object3D[]> = { power: [], motor: [], thrusters: [], sensors: [] };
  const add = (system: keyof typeof parts, object: T.Object3D) => { root.add(object); parts[system].push(object); return object; };

  // ---- Power: the cell, its buses, the severed left-shoulder run and the auxiliary reroute.
  const P = mats.power;
  const cell = new T.Group(); cell.position.copy(LOCAL_ANCHORS.power);
  cell.add(new T.Mesh(new T.BoxGeometry(.44, .56, .28), P.body));
  for (const y of [-.16, 0, .16]) cell.add(at(new T.Mesh(new T.BoxGeometry(.45, .035, .29), P.dark), 0, y, 0));
  for (const x of [-.12, .12]) cell.add(at(new T.Mesh(new T.CylinderGeometry(.035, .035, .08, 12), P.copper), x, .31, 0));
  // A scorched corner where the shell took the blast.
  const scorch = new T.MeshBasicMaterial({ color: '#ff7a2e', transparent: true, opacity: .8, depthWrite: false, blending: T.AdditiveBlending });
  cell.add(at(new T.Mesh(new T.PlaneGeometry(.14, .1), scorch), .16, -.22, .145));
  add('power', cell);
  const C: [number, number, number] = [0, 1.55, -.12];
  for (const target of [[1, 2.2, 0], [.53, .62, .25], [-.53, .62, .25], [0, 1.9, -.6], [0, 2.75, .05], [.42, 2, .42]] as [number, number, number][]) {
    const mid: [number, number, number] = [(C[0] + target[0]) * .5, (C[1] + target[1]) * .5 + .12, (C[2] + target[2]) * .5 - .08];
    add('power', tube([C, mid, target], .018, P.copper));
  }
  // The severed run to the left shoulder: two ends and a gap that still arcs.
  const severedCurve = new T.CatmullRomCurve3([new T.Vector3(...C), new T.Vector3(-.5, 2.02, -.02), new T.Vector3(-1, 2.2, 0)]);
  const severedA = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(severedCurve.getPoints(20).slice(0, 11)), 16, .018, 8, false), P.copper);
  const severedB = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(severedCurve.getPoints(20).slice(14)), 10, .018, 8, false), P.copper);
  add('power', severedA); add('power', severedB);
  const sparkTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!;
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.3, 'rgba(255,200,120,.6)'); g.addColorStop(1, 'rgba(255,120,40,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c);
  })();
  const spark = new T.Sprite(new T.SpriteMaterial({ map: sparkTex, color: '#ffb36a', transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
  spark.position.copy(severedCurve.getPoint(.62)); spark.scale.setScalar(.16); add('power', spark);
  // The auxiliary spine bus Hiro reroutes through. Hidden until the route is chosen.
  const rerouteMat = new T.MeshStandardMaterial({ color: '#7fd8ff', emissive: '#3fc8ff', emissiveIntensity: 1.4, metalness: .6, roughness: .3, transparent: true });
  const reroute = tube([C, [0, .95, -.3], [-.45, 1.35, -.32], [-.85, 1.95, -.12], [-1, 2.2, 0]], .022, rerouteMat);
  reroute.visible = false; add('power', reroute);

  // ---- Motor: shoulder and hip actuators. The left shoulder is the jammed one.
  const M = mats.motor;
  const jamMat = new T.MeshStandardMaterial({ color: '#b07a3a', emissive: '#ff8a2a', emissiveIntensity: .7, metalness: .6, roughness: .35, transparent: true });
  const actuator = (p: [number, number, number], material: T.Material) => {
    const g = new T.Group(); g.position.set(...p);
    const body = new T.Mesh(new T.CylinderGeometry(.12, .12, .24, 20), material); body.rotation.z = Math.PI / 2; g.add(body);
    const cap = new T.Mesh(new T.CylinderGeometry(.075, .075, .28, 16), M.dark); cap.rotation.z = Math.PI / 2; g.add(cap);
    // Index ring: a notch shows where "home" is.
    const ring = new T.Mesh(new T.TorusGeometry(.125, .012, 8, 32), M.copper); ring.rotation.y = Math.PI / 2; g.add(ring);
    return add('motor', g);
  };
  actuator([1.02, 2.26, .02], M.body);
  actuator([.53, .55, .28], M.body);
  actuator([-.53, .55, .28], M.body);
  const jammed = actuator([SHOULDER_L.x, SHOULDER_L.y, SHOULDER_L.z], jamMat) as T.Group;

  // ---- Thrusters: the back unit, a cracked liner, and the half-seated control plug.
  const H = mats.thrusters;
  const unit = new T.Group(); unit.position.copy(LOCAL_ANCHORS.thrusters);
  const housing = new T.Mesh(new T.CylinderGeometry(.19, .22, .34, 24), H.body); housing.rotation.x = Math.PI / 2; unit.add(housing);
  const nozzle = new T.Mesh(new T.CylinderGeometry(.13, .2, .22, 24, 1, true), H.dark); nozzle.rotation.x = Math.PI / 2; nozzle.position.z = -.27; unit.add(nozzle);
  const crack = new T.Mesh(new T.BoxGeometry(.012, .2, .01), new T.MeshBasicMaterial({ color: '#ff9150', transparent: true }));
  crack.position.set(.13, .03, -.29); crack.rotation.z = .5; unit.add(crack);
  const socket = new T.Mesh(new T.TorusGeometry(.055, .012, 8, 24), H.copper); socket.position.set(.24, .15, .02); unit.add(socket);
  const plug = new T.Group(); plug.position.set(.24, .15, .13);
  plug.add(new T.Mesh(new T.CylinderGeometry(.045, .045, .1, 16).rotateX(Math.PI / 2), H.dark));
  const key = new T.Mesh(new T.BoxGeometry(.02, .03, .1), H.copper); key.position.y = .05; plug.add(key);
  const lead = tube([[.24, .15, .18], [.32, .3, .26], [.1, .4, .3]], .012, H.dark); unit.add(lead);
  unit.add(plug); add('thrusters', unit);

  // ---- Sensors: the head board behind the eyes, still running.
  const S = mats.sensors;
  const board = new T.Group(); board.position.copy(LOCAL_ANCHORS.sensors).add(new T.Vector3(0, 0, -.12));
  board.add(new T.Mesh(new T.BoxGeometry(.42, .12, .05), S.dark));
  for (const x of [-.13, 0, .13]) board.add(at(new T.Mesh(new T.CylinderGeometry(.03, .03, .05, 16).rotateX(Math.PI / 2), S.body), x, 0, .045));
  add('sensors', board);

  // ---- Left arm articulation: the arm hangs where the actuator locked.
  const armL = new T.Group(); armL.name = 'arm-left'; armL.position.copy(SHOULDER_L); shell.add(armL); shell.updateMatrixWorld(true);
  const meshes: T.Mesh[] = []; shell.traverse(o => { if (o instanceof T.Mesh && !root.getObjectById(o.id)) meshes.push(o); });
  for (const m of meshes) {
    const p = m.position, sx = -p.x;
    const upper = Math.abs(sx - 1.12) < .06 && Math.abs(p.y - 1.7) < .06, fore = Math.abs(sx - 1.23) < .06 && Math.abs(p.y - .82) < .06;
    const hand = Math.abs(sx - 1.25) < .06 && Math.abs(p.y - .35) < .06, finger = sx > 1 && sx < 1.5 && Math.abs(p.y - .29) < .03 && p.z > .7;
    if (upper || fore || hand || finger) armL.attach(m);
  }
  const allMats = [...Object.values(mats).flatMap(m => [m.body, m.dark, m.copper]), jamMat, rerouteMat];
  const systemMats: Record<keyof typeof mats, T.MeshStandardMaterial[]> = {
    power: [P.body, P.dark, P.copper, rerouteMat], motor: [M.body, M.dark, M.copper, jamMat], thrusters: [H.body, H.dark, H.copper], sensors: [S.body, S.dark, S.copper],
  };
  let reveal = 0;

  return {
    root,
    anchorWorld(system: Exclude<SystemId, 'chip'>, out: T.Vector3) { return out.copy(LOCAL_ANCHORS[system]).applyMatrix4(shell.matrixWorld); },
    update(time: number, dt: number, s: { mode: ViewMode; selected: SystemId | null; rerouted: boolean; plugAngle: number; plugSeated: boolean; actuatorAngle: number; actuatorReset: boolean }) {
      const k = 1 - Math.exp(-dt * 5);
      reveal += ((s.mode === 'exterior' ? 0 : 1) - reveal) * k;
      root.visible = reveal > .02;
      for (const [system, list] of Object.entries(systemMats) as [keyof typeof mats, T.MeshStandardMaterial[]][]) {
        const focus = s.selected === system;
        const dim = s.mode === 'isolate' && s.selected && !focus ? .12 : 1;
        const pulse = focus ? .35 + .25 * Math.sin(time * 3.2) : 0;
        for (const m of list) {
          if (m === rerouteMat || m === jamMat) { m.opacity = reveal * dim; continue; }
          m.opacity = reveal * dim; m.emissiveIntensity = pulse; m.depthWrite = m.opacity > .95;
        }
      }
      // Power: the gap arcs until the reroute carries the feed around it.
      reroute.visible = s.rerouted;
      rerouteMat.emissiveIntensity = 1 + .6 * Math.sin(time * 6);
      spark.visible = !s.rerouted && reveal > .1;
      spark.material.opacity = (Math.sin(time * 37) * Math.sin(time * 23) > .1 ? 1 : .15) * reveal;
      // Motor: the jammed actuator glows amber until it is back on its index.
      jamMat.emissiveIntensity = s.actuatorReset ? 0 : .5 + .3 * Math.sin(time * 4);
      jamMat.color.set(s.actuatorReset ? '#9aa7ae' : '#b07a3a');
      const target = -T.MathUtils.degToRad(s.actuatorAngle);
      armL.rotation.z += (target - armL.rotation.z) * (1 - Math.exp(-dt * 8));
      jammed.rotation.x = -T.MathUtils.degToRad(s.actuatorAngle);
      // Thrusters: the plug turns with its key and seats into the socket.
      plug.rotation.z = T.MathUtils.degToRad(s.plugAngle);
      plug.position.z += ((s.plugSeated ? .04 : .13) - plug.position.z) * (1 - Math.exp(-dt * 6));
      (crack.material as T.MeshBasicMaterial).opacity = reveal;
      scorch.opacity = .8 * reveal;
    },
    dispose() {
      root.traverse(o => { if ((o as T.Mesh).geometry) (o as T.Mesh).geometry.dispose(); });
      allMats.forEach(m => m.dispose()); scorch.dispose(); sparkTex.dispose(); spark.material.dispose();
      (crack.material as T.Material).dispose();
      root.removeFromParent();
    },
    /** Shell materials (skin, armour) for the view modes; the internals and bay are excluded. */
    shellMaterials(exclude: T.Object3D[]) {
      const set = new Set<T.Material>();
      shell.traverse(o => {
        if (!(o instanceof T.Mesh)) return;
        for (let p: T.Object3D | null = o; p; p = p.parent) if (p === root || exclude.includes(p)) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => set.add(m));
      });
      return [...set];
    },
  };
}
export type Internals = ReturnType<typeof createInternals>;
