import * as T from 'three';

/** The combat finish uses the original closed body and its live joints. No duplicate shells. */
export type ArmourJoints = {
  armL?: T.Quaternion; armR?: T.Quaternion; legL?: T.Quaternion; legR?: T.Quaternion;
  head?: T.Quaternion; elbowL?: number; elbowR?: number; kneeL?: number; kneeR?: number;
};
type Options = { shell: T.Group; eye?: T.Material; hole?: () => T.Vector3 | null };

export async function createArmouredBaymax({ shell }: Options) {
  const body = shell.getObjectByName('inflatable-body') as T.Mesh;
  const head = shell.getObjectByName('dormant-head') ?? shell;
  const skin = new T.Color('#f6f8fa'), red = new T.Color('#a91e2b'), purple = new T.Color('#563580');
  const blend = { value: 0 };
  const surfaces: { mesh: T.Mesh; original: T.Material; material: T.MeshPhysicalMaterial }[] = [];
  const parts: T.Mesh[] = [];
  shell.traverse(o => {
    if (o instanceof T.Mesh && o.material instanceof T.MeshPhysicalMaterial && o.material.name === 'inflatable' &&
      (/^(inflatable-body|back-shell|shoulder-|upper-arm-|forearm-|hand-|finger-|thigh-|boot-)/.test(o.name) || o.parent === head || o.name === 'bay-collar')) parts.push(o);
  });
  for (const mesh of parts) {
    const original = mesh.material as T.MeshPhysicalMaterial, material = original.clone();
    const kind = mesh === body ? 'torso' : mesh.parent === head ? 'head' : /^(hand-|finger-)/.test(mesh.name) ? 'hand' : 'red';
    const compile = original.onBeforeCompile;
    material.userData.combatSurface = true;
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(original, shader, renderer);
      Object.assign(shader.uniforms, { uCombatFinish: blend, uCombatRed: { value: red }, uCombatPurple: { value: purple }, uNormalSkin: { value: skin } });
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCombatLocal;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvCombatLocal=position;');
      let paint = 'vec3 combatPaint=uCombatRed;';
      if (kind === 'hand') paint = 'vec3 combatPaint=uCombatPurple;';
      if (kind === 'torso') paint += `
        vec2 panel=vec2(vCombatLocal.x/.84,(vCombatLocal.y-1.30)/.57);
        float edge=max(max(abs(panel.x),abs(panel.y)),(abs(panel.x)+abs(panel.y))*.71);
        float front=smoothstep(.20,.45,vCombatLocal.z);
        float inset=(1.-smoothstep(.96,1.,edge))*front;
        combatPaint=mix(combatPaint,uCombatPurple,inset);
        float seam=(1.-smoothstep(.012,.027,abs(edge-1.)))*front;
        combatPaint=mix(combatPaint,uCombatRed*.46,seam);
      `;
      if (kind === 'head') paint += `
        vec2 face=vec2(vCombatLocal.x/.86,(vCombatLocal.y-.015)/.65);
        float mask=(1.-smoothstep(.96,1.,length(face)))*smoothstep(.45,.58,vCombatLocal.z);
        combatPaint=mix(combatPaint,uNormalSkin,mask);
      `;
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCombatLocal;uniform float uCombatFinish;uniform vec3 uCombatRed,uCombatPurple,uNormalSkin;')
        .replace('#include <color_fragment>', `#include <color_fragment>\n${paint}\ndiffuseColor.rgb=mix(diffuseColor.rgb,combatPaint,uCombatFinish);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.66,uCombatFinish);');
    };
    material.customProgramCacheKey = () => `${original.customProgramCacheKey()}-canonical-composite-${kind}`;
    mesh.material = material;
    surfaces.push({ mesh, original, material });
  }
  const normal = new T.Vector3(), up = new T.Vector3(), x = new T.Vector3(), z = new T.Vector3();
  const ray = new T.Raycaster();
  const api = {
    root: shell,
    isSingleRig: true as const,
    joints: { hipY: .55, hipZ: .28, shoulderY: 2.42 },
    drive(_j: ArmourJoints) {},
    updateChestHole(_radius?: number) {},
    chestSpot(lateral = 0, higher = 0) {
      shell.updateWorldMatrix(true, true);
      const origin = shell.localToWorld(new T.Vector3(lateral, 1.80 + higher, 3));
      normal.set(0, 0, 1).transformDirection(shell.matrixWorld);
      ray.set(origin, normal.clone().negate());
      const hit = ray.intersectObject(body, false)[0];
      const n = hit?.face ? hit.face.normal.clone().transformDirection(body.matrixWorld) : normal.clone();
      if (n.dot(normal) < 0) n.negate();
      return { point: hit?.point.clone() ?? shell.localToWorld(new T.Vector3(lateral, 1.80 + higher, .7)), normal: n, bone: shell as T.Object3D };
    },
    chestFrame(lateral: number, higher: number) {
      const spot = api.chestSpot(lateral, higher);
      up.set(0, 1, 0).transformDirection(shell.matrixWorld);
      x.copy(up).addScaledVector(spot.normal, -up.dot(spot.normal)).normalize();
      z.crossVectors(x, spot.normal).normalize();
      return { point: spot.point, x: x.clone(), n: spot.normal, z: z.clone(), bone: shell as T.Object3D };
    },
    mountOnChest(obj: T.Object3D, lateral: number, higher: number) {
      const frame = api.chestFrame(lateral, higher);
      const world = new T.Matrix4().makeBasis(frame.z, frame.x, frame.n)
        .setPosition(frame.point.clone().addScaledVector(frame.n, .16 * obj.getWorldScale(new T.Vector3()).x)).scale(obj.getWorldScale(new T.Vector3()));
      shell.add(obj);
      new T.Matrix4().copy(shell.matrixWorld).invert().multiply(world).decompose(obj.position, obj.quaternion, obj.scale);
    },
    seatOnPlate(_obj: T.Object3D, _lateral: number, _higher: number, _rim: number, _grow = 1) { return () => {}; },
    headWorld(out = new T.Vector3()) { return head.getWorldPosition(out); },
    footLow() {
      shell.updateMatrixWorld(true);
      let low = Infinity;
      for (const part of parts.filter(m => m.name.startsWith('boot-'))) low = Math.min(low, new T.Box3().setFromObject(part).min.y);
      return low;
    },
    covers(_k: number) { return false; },
    set(k: number) {
      blend.value = T.MathUtils.smoothstep(k, 0, 1);
      for (const { material } of surfaces) {
        material.roughness = T.MathUtils.lerp(.79, .57, blend.value);
        material.metalness = .12 * blend.value;
        material.clearcoat = .02; material.sheen = .3 * (1 - blend.value);
      }
    },
    dispose() { for (const { mesh, original, material } of surfaces) { mesh.material = original; material.dispose(); } },
  };
  api.set(0);
  return api;
}
export type ArmouredBaymax = Awaited<ReturnType<typeof createArmouredBaymax>>;
export function mountArmour(_armour: ArmouredBaymax, _white: T.Object3D, _hip: { y: number; z: number }, _shoulderY: number) { return 1; }
