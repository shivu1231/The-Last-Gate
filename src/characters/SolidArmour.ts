import * as THREE from 'three';

/** The combat finish uses the original closed body and its live joints. No duplicate shells. */
export type ArmourJoints = {
  armL?: THREE.Quaternion;
  armR?: THREE.Quaternion;
  legL?: THREE.Quaternion;
  legR?: THREE.Quaternion;
  head?: THREE.Quaternion;
  elbowL?: number;
  elbowR?: number;
  kneeL?: number;
  kneeR?: number;
};
/**
 * Existing shell and chest/eye inputs for the shared combat finish.
 */
type SolidArmourOptions = {
  shell: THREE.Group;
  eye?: THREE.Material;
  hole?: () => THREE.Vector3 | null;
};

/**
 * Apply the combat presentation and expose the joint/chest mounting contract.
 */
export async function createArmouredBaymax({ shell }: SolidArmourOptions) {
  const body = shell.getObjectByName('inflatable-body') as THREE.Mesh;
  const head = shell.getObjectByName('dormant-head') ?? shell;
  const skin = new THREE.Color('#f6f8fa'),
    red = new THREE.Color('#a91e2b'),
    purple = new THREE.Color('#563580');
  const blend = { value: 0 };
  const surfaces: {
    mesh: THREE.Mesh;
    original: THREE.Material;
    material: THREE.MeshPhysicalMaterial;
  }[] = [];
  const parts: THREE.Mesh[] = [];
  shell.traverse((sceneObject) => {
    if (
      sceneObject instanceof THREE.Mesh &&
      sceneObject.material instanceof THREE.MeshPhysicalMaterial &&
      sceneObject.material.name === 'inflatable' &&
      (/^(inflatable-body|back-shell|shoulder-|upper-arm-|forearm-|hand-|finger-|thigh-|boot-)/.test(
        sceneObject.name,
      ) ||
        sceneObject.parent === head ||
        sceneObject.name === 'bay-collar')
    )
      parts.push(sceneObject);
  });
  for (const mesh of parts) {
    const original = mesh.material as THREE.MeshPhysicalMaterial,
      material = original.clone();
    const kind =
      mesh === body
        ? 'torso'
        : mesh.parent === head
          ? 'head'
          : /^(hand-|finger-)/.test(mesh.name)
            ? 'hand'
            : 'red';
    const compile = original.onBeforeCompile;
    material.userData.combatSurface = true;
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(original, shader, renderer);
      Object.assign(shader.uniforms, {
        uCombatFinish: blend,
        uCombatRed: { value: red },
        uCombatPurple: { value: purple },
        uNormalSkin: { value: skin },
      });
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vCombatLocal;',
        )
        .replace(
          '#include <project_vertex>',
          '#include <project_vertex>\nvCombatLocal=position;',
        );
      let paint = 'vec3 combatPaint=uCombatRed;';
      if (kind === 'hand') paint = 'vec3 combatPaint=uCombatPurple;';
      if (kind === 'torso')
        paint += `
        vec2 panel=vec2(vCombatLocal.x/.84,(vCombatLocal.y-1.30)/.57);
        float edge=max(max(abs(panel.x),abs(panel.y)),(abs(panel.x)+abs(panel.y))*.71);
        float front=smoothstep(.20,.45,vCombatLocal.z);
        float inset=(1.-smoothstep(.96,1.,edge))*front;
        combatPaint=mix(combatPaint,uCombatPurple,inset);
        float seam=(1.-smoothstep(.012,.027,abs(edge-1.)))*front;
        combatPaint=mix(combatPaint,uCombatRed*.46,seam);
      `;
      if (kind === 'head')
        paint += `
        vec2 face=vec2(vCombatLocal.x/.86,(vCombatLocal.y-.015)/.65);
        float mask=(1.-smoothstep(.96,1.,length(face)))*smoothstep(.45,.58,vCombatLocal.z);
        combatPaint=mix(combatPaint,uNormalSkin,mask);
      `;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vCombatLocal;uniform float uCombatFinish;uniform vec3 uCombatRed,uCombatPurple,uNormalSkin;',
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>\n${paint}\ndiffuseColor.rgb=mix(diffuseColor.rgb,combatPaint,uCombatFinish);`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.66,uCombatFinish);',
        );
    };
    material.customProgramCacheKey = () =>
      `${original.customProgramCacheKey()}-canonical-composite-${kind}`;
    mesh.material = material;
    surfaces.push({ mesh, original, material });
  }
  const normal = new THREE.Vector3(),
    up = new THREE.Vector3(),
    xPosition = new THREE.Vector3(),
    zPosition = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const api = {
    root: shell,
    isSingleRig: true as const,
    joints: { hipY: 0.55, hipZ: 0.28, shoulderY: 2.42 },
    drive(_j: ArmourJoints) {},
    updateChestHole(_radius?: number) {},
    chestSpot(lateral = 0, higher = 0) {
      shell.updateWorldMatrix(true, true);
      const origin = shell.localToWorld(
        new THREE.Vector3(lateral, 1.8 + higher, 3),
      );
      normal.set(0, 0, 1).transformDirection(shell.matrixWorld);
      ray.set(origin, normal.clone().negate());
      const hit = ray.intersectObject(body, false)[0];
      const normalVector = hit?.face
        ? hit.face.normal.clone().transformDirection(body.matrixWorld)
        : normal.clone();
      if (normalVector.dot(normal) < 0) normalVector.negate();
      return {
        point:
          hit?.point.clone() ??
          shell.localToWorld(new THREE.Vector3(lateral, 1.8 + higher, 0.7)),
        normal: normalVector,
        bone: shell as THREE.Object3D,
      };
    },
    chestFrame(lateral: number, higher: number) {
      const spot = api.chestSpot(lateral, higher);
      up.set(0, 1, 0).transformDirection(shell.matrixWorld);
      xPosition
        .copy(up)
        .addScaledVector(spot.normal, -up.dot(spot.normal))
        .normalize();
      zPosition.crossVectors(xPosition, spot.normal).normalize();
      return {
        point: spot.point,
        x: xPosition.clone(),
        n: spot.normal,
        z: zPosition.clone(),
        bone: shell as THREE.Object3D,
      };
    },
    mountOnChest(obj: THREE.Object3D, lateral: number, higher: number) {
      const frame = api.chestFrame(lateral, higher);
      const world = new THREE.Matrix4()
        .makeBasis(frame.z, frame.x, frame.n)
        .setPosition(
          frame.point
            .clone()
            .addScaledVector(
              frame.n,
              0.16 * obj.getWorldScale(new THREE.Vector3()).x,
            ),
        )
        .scale(obj.getWorldScale(new THREE.Vector3()));
      shell.add(obj);
      new THREE.Matrix4()
        .copy(shell.matrixWorld)
        .invert()
        .multiply(world)
        .decompose(obj.position, obj.quaternion, obj.scale);
    },
    seatOnPlate(
      _obj: THREE.Object3D,
      _lateral: number,
      _higher: number,
      _rim: number,
      _grow = 1,
    ) {
      return () => {};
    },
    headWorld(out = new THREE.Vector3()) {
      return head.getWorldPosition(out);
    },
    footLow() {
      shell.updateMatrixWorld(true);
      let low = Infinity;
      for (const part of parts.filter((material2) =>
        material2.name.startsWith('boot-'),
      ))
        low = Math.min(low, new THREE.Box3().setFromObject(part).min.y);
      return low;
    },
    covers(_k: number) {
      return false;
    },
    set(blendFactor: number) {
      blend.value = THREE.MathUtils.smoothstep(blendFactor, 0, 1);
      for (const { material } of surfaces) {
        material.roughness = THREE.MathUtils.lerp(0.79, 0.57, blend.value);
        material.metalness = 0.12 * blend.value;
        material.clearcoat = 0.02;
        material.sheen = 0.3 * (1 - blend.value);
      }
    },
    dispose() {
      for (const { mesh, original, material } of surfaces) {
        mesh.material = original;
        material.dispose();
      }
    },
  };
  api.set(0);
  return api;
}
export type ArmouredBaymax = Awaited<ReturnType<typeof createArmouredBaymax>>;
/**
 * Attach the combat presentation on the shared rig.
 */
export function mountArmour(
  _armour: ArmouredBaymax,
  _white: THREE.Object3D,
  _hip: { y: number; z: number },
  _shoulderY: number,
) {
  return 1;
}
