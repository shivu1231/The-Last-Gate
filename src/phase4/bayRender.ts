import * as THREE from 'three';

/**
 * Bay 6 draws in four passes so every pixel pays only for what lands on it.
 *
 * - The displaced city behind the back wall brings eleven lights. Inside the hall only its
 *   hemisphere and directional lights reach (its point lights hang 50 m out with ~24 m reach), yet
 *   every hall pixel used to evaluate all of them. The city now renders as its own scene with its
 *   own lights; each side gets a copy of whichever of the other side's lights actually reach it.
 * - The hall is merged into one mesh per material, so front-to-back sorting can't stop hidden
 *   surfaces being shaded. A depth-only pass first means each pixel is shaded once.
 *
 * Depth is shared by every pass, so the city still shows only through the windows and the glass,
 * haze and light shafts still lie over it. The picture is the same as one combined render.
 */

/**
 * Layers: big opaque hall surfaces (depth pass + shaded pass), the hall's transparent surfaces (last),
 * and opaque things that skip the depth pass (small props, and the sky card, which writes no depth).
 */
const SOLID = 0,
  LATE = 1,
  MAIN = 2;

/**
 * Original light and its copy used by the separate bay rendering passes.
 */
type LightCopyPair = { src: THREE.Light; copy: THREE.Light };

const isLit = (material: THREE.Material) =>
  !!(
    (material as THREE.MeshStandardMaterial).isMeshStandardMaterial ||
    (material as THREE.MeshLambertMaterial).isMeshLambertMaterial ||
    (material as THREE.MeshPhongMaterial).isMeshPhongMaterial ||
    (material as THREE.MeshToonMaterial).isMeshToonMaterial
  );
const materialsOf = (sceneObject: THREE.Object3D): THREE.Material[] => {
  const material = (sceneObject as THREE.Mesh).material;
  return !material ? [] : Array.isArray(material) ? material : [material];
};

/** World-space boxes of every lit mesh under `root`: the surfaces a light could change. */
function litBoxes(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const boxes: THREE.Box3[] = [];
  root.traverse((sceneObject) => {
    const mesh = sceneObject as THREE.Mesh;
    if (!mesh.isMesh || !materialsOf(mesh).some(isLit)) return;
    const inst = mesh as THREE.InstancedMesh;
    if (inst.isInstancedMesh) {
      inst.computeBoundingBox();
      boxes.push(inst.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));
      return;
    }
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    boxes.push(
      mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld),
    );
  });
  return boxes;
}

/** Whether `light` can add anything to the surfaces in `boxes` (2 m slack for things that drift). */
function reaches(light: THREE.Light, boxes: THREE.Box3[]) {
  const ranged = light as THREE.PointLight;
  if (
    !(ranged.isPointLight || (light as THREE.SpotLight).isSpotLight) ||
    !(ranged.distance > 0)
  )
    return true;
  const scaleVector = new THREE.Sphere(
    light.getWorldPosition(new THREE.Vector3()),
    ranged.distance + 2,
  );
  return boxes.some((secondEntry) => secondEntry.intersectsSphere(scaleVector));
}

/**
 * Clone a reaching light for the multi-pass bay renderer.
 */
function copyOf(src: THREE.Light): THREE.Light | null {
  if ((src as THREE.HemisphereLight).isHemisphereLight)
    return new THREE.HemisphereLight();
  if ((src as THREE.DirectionalLight).isDirectionalLight)
    return new THREE.DirectionalLight();
  if ((src as THREE.SpotLight).isSpotLight) return new THREE.SpotLight();
  if ((src as THREE.PointLight).isPointLight) return new THREE.PointLight();
  if ((src as THREE.AmbientLight).isAmbientLight)
    return new THREE.AmbientLight();
  return null;
}

/** Copies are parented to an identity group at the scene root, so local = world. */
function sync({ src, copy }: LightCopyPair) {
  copy.color.copy(src.color);
  copy.intensity = src.intensity;
  src.getWorldPosition(copy.position);
  if ((src as THREE.HemisphereLight).isHemisphereLight)
    (copy as THREE.HemisphereLight).groundColor.copy(
      (src as THREE.HemisphereLight).groundColor,
    );
  const aimed = src as THREE.DirectionalLight & THREE.SpotLight,
    out = copy as THREE.DirectionalLight & THREE.SpotLight;
  if (aimed.target) aimed.target.getWorldPosition(out.target.position);
  if ((src as THREE.PointLight).isPointLight || aimed.isSpotLight) {
    out.distance = aimed.distance;
    out.decay = aimed.decay;
  }
  if (aimed.isSpotLight) {
    out.angle = aimed.angle;
    out.penumbra = aimed.penumbra;
  }
}

/**
 * Create the bay depth, opaque and transparent rendering passes.
 */
export function createBayRender(
  scene: THREE.Scene,
  bay: THREE.Object3D,
  city: THREE.Object3D,
) {
  const cityScene = new THREE.Scene();
  cityScene.name = 'bay-6-city';
  scene.add(bay);
  cityScene.add(city);

  // Each side gets copies of the other side's lights that reach it; shadows stay with the hall.
  const pairs: LightCopyPair[] = [],
    hallCopies = new THREE.Group(),
    cityCopies = new THREE.Group();
  hallCopies.name = 'city-lights-in-hall';
  cityCopies.name = 'hall-lights-in-city';
  const bridge = (
    from: THREE.Object3D,
    boxes: THREE.Box3[],
    into: THREE.Group,
  ) =>
    from.traverse((sceneObject) => {
      const src = sceneObject as THREE.Light;
      if (!src.isLight || !reaches(src, boxes)) return;
      const copy = copyOf(src);
      if (!copy) return;
      copy.castShadow = false;
      into.add(copy);
      const target = (copy as THREE.DirectionalLight).target;
      if (target) into.add(target);
      const pair = { src, copy };
      sync(pair);
      pairs.push(pair);
    });
  const hallBoxes = litBoxes(bay),
    cityBoxes = litBoxes(city);
  bridge(city, hallBoxes, hallCopies);
  bridge(bay, cityBoxes, cityCopies);
  scene.add(hallCopies);
  cityScene.add(cityCopies);

  // Sort the hall into passes. Every hall light is on all of them, so each pass sees the same light set.
  // Only big occluders (the merged set dressing) go through the depth pass: the small live props, the
  // case parts and the regulator hide next to nothing and would only double their draw calls.
  bay.updateMatrixWorld(true);
  const scale = new THREE.Vector3();
  bay.traverse((sceneObject) => {
    const material = materialsOf(sceneObject),
      geometry = (sceneObject as THREE.Mesh).geometry;
    if ((sceneObject as THREE.Light).isLight) sceneObject.layers.enableAll();
    else if (material.some((material2) => material2.transparent))
      sceneObject.layers.set(LATE);
    else if (material.some((material2) => !material2.depthWrite))
      sceneObject.layers.set(MAIN);
    else if (geometry) {
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      sceneObject.getWorldScale(scale);
      if (
        geometry.boundingSphere!.radius * Math.max(scale.x, scale.y, scale.z) <
        1.5
      )
        sceneObject.layers.set(MAIN);
    }
  });
  hallCopies.traverse((sceneObject) => sceneObject.layers.enableAll());

  const depthOnly = new THREE.MeshBasicMaterial({
    colorWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  let shownFrames = 0;
  const unculled: THREE.Object3D[] = [];
  /** The city shares the hall's fog and reflections (both part of each program, so set before compiling). */
  const share = () => {
    cityScene.fog = scene.fog;
    cityScene.environment = scene.environment;
    cityScene.environmentIntensity = scene.environmentIntensity;
  };

  return {
    cityScene,
    /**
     * Compiles both scenes (and the depth pass) together, then uploads every texture, so nothing
     * waits on a first upload when the camera turns toward it. Resolves when all of it is done.
     */
    compile(gl: THREE.WebGLRenderer, camera: THREE.Camera) {
      share();
      const probe = new THREE.Mesh(new THREE.PlaneGeometry(), depthOnly);
      scene.add(probe);
      const ready = Promise.all([
        gl.compileAsync(scene, camera),
        gl.compileAsync(cityScene, camera),
      ]);
      scene.remove(probe);
      probe.geometry.dispose();
      return ready.then(() => {
        const textures = new Set<THREE.Texture>();
        for (const root of [bay, city])
          root.traverse((sceneObject) => {
            for (const material of materialsOf(sceneObject))
              for (const value of Object.values(material))
                if ((value as THREE.Texture)?.isTexture)
                  textures.add(value as THREE.Texture);
          });
        textures.forEach((texture) => gl.initTexture(texture));
      });
    },
    /** Draws the frame. `shadows`: a shadow caster moved since the last frame. */
    render(gl: THREE.WebGLRenderer, camera: THREE.Camera, shadows: boolean) {
      for (const material of pairs) sync(material);
      share();
      gl.info.autoReset = false;
      gl.info.reset();
      gl.shadowMap.autoUpdate = false;
      // The first frames after the hall appears (still under the loading cover) draw shadows
      // whatever moved, and draw everything, in view or not, so every mesh has been through the GPU once.
      if (!bay.visible) shownFrames = 0;
      const warm = bay.visible && shownFrames++ < 3;
      if (shadows || warm) gl.shadowMap.needsUpdate = true;
      if (warm)
        for (const root of [scene, cityScene])
          root.traverse((sceneObject) => {
            if (sceneObject.frustumCulled) {
              sceneObject.frustumCulled = false;
              unculled.push(sceneObject);
            }
          });
      const background = scene.background,
        autoClear = gl.autoClear,
        mask = camera.layers.mask;
      // 1. Clear, shadows, and the hall's depth.
      camera.layers.set(SOLID);
      scene.overrideMaterial = depthOnly;
      gl.render(scene, camera);
      scene.overrideMaterial = null;
      scene.background = null;
      scene.matrixWorldAutoUpdate = false;
      gl.autoClear = false;
      // 2. The hall, shaded once per pixel. 3. The city, behind it. 4. Glass, haze, shafts and dust over both.
      camera.layers.enable(MAIN);
      gl.render(scene, camera);
      gl.render(cityScene, camera);
      camera.layers.set(LATE);
      gl.render(scene, camera);
      camera.layers.mask = mask;
      scene.background = background;
      scene.matrixWorldAutoUpdate = true;
      gl.autoClear = autoClear;
      for (const sceneObject2 of unculled) sceneObject2.frustumCulled = true;
      unculled.length = 0;
    },
    dispose(gl: THREE.WebGLRenderer) {
      scene.remove(bay, hallCopies);
      cityScene.remove(city, cityCopies);
      depthOnly.dispose();
      gl.info.autoReset = true;
      gl.shadowMap.autoUpdate = true;
    },
  };
}

export type BayRender = ReturnType<typeof createBayRender>;
