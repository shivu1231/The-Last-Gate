import * as T from 'three';

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
const SOLID = 0, LATE = 1, MAIN = 2;

type Pair = { src: T.Light; copy: T.Light };

const isLit = (m: T.Material) => !!((m as T.MeshStandardMaterial).isMeshStandardMaterial || (m as T.MeshLambertMaterial).isMeshLambertMaterial || (m as T.MeshPhongMaterial).isMeshPhongMaterial || (m as T.MeshToonMaterial).isMeshToonMaterial);
const materialsOf = (o: T.Object3D): T.Material[] => { const m = (o as T.Mesh).material; return !m ? [] : Array.isArray(m) ? m : [m]; };

/** World-space boxes of every lit mesh under `root`: the surfaces a light could change. */
function litBoxes(root: T.Object3D) {
  root.updateMatrixWorld(true);
  const boxes: T.Box3[] = [];
  root.traverse(o => {
    const mesh = o as T.Mesh;
    if (!mesh.isMesh || !materialsOf(mesh).some(isLit)) return;
    const inst = mesh as T.InstancedMesh;
    if (inst.isInstancedMesh) { inst.computeBoundingBox(); boxes.push(inst.boundingBox!.clone().applyMatrix4(mesh.matrixWorld)); return; }
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    boxes.push(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));
  });
  return boxes;
}

/** Whether `light` can add anything to the surfaces in `boxes` (2 m slack for things that drift). */
function reaches(light: T.Light, boxes: T.Box3[]) {
  const ranged = light as T.PointLight;
  if (!(ranged.isPointLight || (light as T.SpotLight).isSpotLight) || !(ranged.distance > 0)) return true;
  const s = new T.Sphere(light.getWorldPosition(new T.Vector3()), ranged.distance + 2);
  return boxes.some(b => b.intersectsSphere(s));
}

function copyOf(src: T.Light): T.Light | null {
  if ((src as T.HemisphereLight).isHemisphereLight) return new T.HemisphereLight();
  if ((src as T.DirectionalLight).isDirectionalLight) return new T.DirectionalLight();
  if ((src as T.SpotLight).isSpotLight) return new T.SpotLight();
  if ((src as T.PointLight).isPointLight) return new T.PointLight();
  if ((src as T.AmbientLight).isAmbientLight) return new T.AmbientLight();
  return null;
}

/** Copies are parented to an identity group at the scene root, so local = world. */
function sync({ src, copy }: Pair) {
  copy.color.copy(src.color); copy.intensity = src.intensity;
  src.getWorldPosition(copy.position);
  if ((src as T.HemisphereLight).isHemisphereLight) (copy as T.HemisphereLight).groundColor.copy((src as T.HemisphereLight).groundColor);
  const aimed = src as T.DirectionalLight & T.SpotLight, out = copy as T.DirectionalLight & T.SpotLight;
  if (aimed.target) aimed.target.getWorldPosition(out.target.position);
  if ((src as T.PointLight).isPointLight || aimed.isSpotLight) { out.distance = aimed.distance; out.decay = aimed.decay; }
  if (aimed.isSpotLight) { out.angle = aimed.angle; out.penumbra = aimed.penumbra; }
}

export function createBayRender(scene: T.Scene, bay: T.Object3D, city: T.Object3D) {
  const cityScene = new T.Scene(); cityScene.name = 'bay-6-city';
  scene.add(bay); cityScene.add(city);

  // Each side gets copies of the other side's lights that reach it; shadows stay with the hall.
  const pairs: Pair[] = [], hallCopies = new T.Group(), cityCopies = new T.Group();
  hallCopies.name = 'city-lights-in-hall'; cityCopies.name = 'hall-lights-in-city';
  const bridge = (from: T.Object3D, boxes: T.Box3[], into: T.Group) => from.traverse(o => {
    const src = o as T.Light; if (!src.isLight || !reaches(src, boxes)) return;
    const copy = copyOf(src); if (!copy) return;
    copy.castShadow = false; into.add(copy);
    const target = (copy as T.DirectionalLight).target; if (target) into.add(target);
    const pair = { src, copy }; sync(pair); pairs.push(pair);
  });
  const hallBoxes = litBoxes(bay), cityBoxes = litBoxes(city);
  bridge(city, hallBoxes, hallCopies); bridge(bay, cityBoxes, cityCopies);
  scene.add(hallCopies); cityScene.add(cityCopies);

  // Sort the hall into passes. Every hall light is on all of them, so each pass sees the same light set.
  // Only big occluders (the merged set dressing) go through the depth pass: the small live props, the
  // case parts and the regulator hide next to nothing and would only double their draw calls.
  bay.updateMatrixWorld(true);
  const scale = new T.Vector3();
  bay.traverse(o => {
    const ms = materialsOf(o), g = (o as T.Mesh).geometry;
    if ((o as T.Light).isLight) o.layers.enableAll();
    else if (ms.some(m => m.transparent)) o.layers.set(LATE);
    else if (ms.some(m => !m.depthWrite)) o.layers.set(MAIN);
    else if (g) { if (!g.boundingSphere) g.computeBoundingSphere(); o.getWorldScale(scale); if (g.boundingSphere!.radius * Math.max(scale.x, scale.y, scale.z) < 1.5) o.layers.set(MAIN); }
  });
  hallCopies.traverse(o => o.layers.enableAll());

  const depthOnly = new T.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  let shownFrames = 0; const unculled: T.Object3D[] = [];
  /** The city shares the hall's fog and reflections (both part of each program, so set before compiling). */
  const share = () => { cityScene.fog = scene.fog; cityScene.environment = scene.environment; cityScene.environmentIntensity = scene.environmentIntensity; };

  return {
    cityScene,
    /**
     * Compiles both scenes (and the depth pass) together, then uploads every texture, so nothing
     * waits on a first upload when the camera turns toward it. Resolves when all of it is done.
     */
    compile(gl: T.WebGLRenderer, camera: T.Camera) {
      share();
      const probe = new T.Mesh(new T.PlaneGeometry(), depthOnly); scene.add(probe);
      const ready = Promise.all([gl.compileAsync(scene, camera), gl.compileAsync(cityScene, camera)]);
      scene.remove(probe); probe.geometry.dispose();
      return ready.then(() => {
        const textures = new Set<T.Texture>();
        for (const root of [bay, city]) root.traverse(o => { for (const m of materialsOf(o)) for (const v of Object.values(m)) if ((v as T.Texture)?.isTexture) textures.add(v as T.Texture); });
        textures.forEach(t => gl.initTexture(t));
      });
    },
    /** Draws the frame. `shadows`: a shadow caster moved since the last frame. */
    render(gl: T.WebGLRenderer, camera: T.Camera, shadows: boolean) {
      for (const p of pairs) sync(p);
      share();
      gl.info.autoReset = false; gl.info.reset();
      gl.shadowMap.autoUpdate = false;
      // The first frames after the hall appears (still under the loading cover) draw shadows
      // whatever moved, and draw everything, in view or not, so every mesh has been through the GPU once.
      if (!bay.visible) shownFrames = 0;
      const warm = bay.visible && shownFrames++ < 3;
      if (shadows || warm) gl.shadowMap.needsUpdate = true;
      if (warm) for (const root of [scene, cityScene]) root.traverse(o => { if (o.frustumCulled) { o.frustumCulled = false; unculled.push(o); } });
      const background = scene.background, autoClear = gl.autoClear, mask = camera.layers.mask;
      // 1. Clear, shadows, and the hall's depth.
      camera.layers.set(SOLID); scene.overrideMaterial = depthOnly;
      gl.render(scene, camera);
      scene.overrideMaterial = null; scene.background = null; scene.matrixWorldAutoUpdate = false; gl.autoClear = false;
      // 2. The hall, shaded once per pixel. 3. The city, behind it. 4. Glass, haze, shafts and dust over both.
      camera.layers.enable(MAIN); gl.render(scene, camera);
      gl.render(cityScene, camera);
      camera.layers.set(LATE); gl.render(scene, camera);
      camera.layers.mask = mask; scene.background = background; scene.matrixWorldAutoUpdate = true; gl.autoClear = autoClear;
      for (const o of unculled) o.frustumCulled = true;
      unculled.length = 0;
    },
    dispose(gl: T.WebGLRenderer) {
      scene.remove(bay, hallCopies); cityScene.remove(city, cityCopies);
      depthOnly.dispose(); gl.info.autoReset = true; gl.shadowMap.autoUpdate = true;
    },
  };
}

export type BayRender = ReturnType<typeof createBayRender>;
