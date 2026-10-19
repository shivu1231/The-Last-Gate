import * as THREE from 'three';
/**
 * Build reusable geometry helpers and the opening material palette for a scene.
 */
export function createGeometryKit(scene) {
  let seed = 71;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const randomBetween = (startValue, endValue) =>
    startValue + random() * (endValue - startValue);
  const materials = {
    concrete: new THREE.MeshStandardMaterial({
      color: '#677384',
      roughness: 0.94,
    }),
    edge: new THREE.MeshStandardMaterial({ color: '#354156', roughness: 1 }),
    dark: new THREE.MeshStandardMaterial({ color: '#101925', roughness: 0.82 }),
    metal: new THREE.MeshStandardMaterial({
      color: '#626c7c',
      roughness: 0.66,
      metalness: 0.5,
    }),
    white: new THREE.MeshStandardMaterial({
      color: '#f6f8fa',
      roughness: 0.58,
      metalness: 0,
    }),
    seam: new THREE.MeshStandardMaterial({ color: '#b2bbb2', roughness: 0.7 }),
    black: new THREE.MeshStandardMaterial({
      color: '#131a1b',
      roughness: 0.45,
    }),
    armor: new THREE.MeshPhysicalMaterial({
      color: '#4b1918',
      roughness: 0.32,
      metalness: 0.52,
      clearcoat: 0.32,
      clearcoatRoughness: 0.38,
    }),
    light: new THREE.MeshBasicMaterial({ color: '#c5dfd7' }),
    red: new THREE.MeshStandardMaterial({
      color: '#a52b24',
      emissive: '#e62915',
      emissiveIntensity: 1.4,
      roughness: 0.32,
      metalness: 0.45,
    }),
  };
  materials.white.name = 'inflatable';
  materials.armor.name = 'armor';
  materials.seam.name = 'seam';
  function mesh(
    geometry,
    material,
    xPosition = 0,
    yPosition = 0,
    zPosition = 0,
    parent = scene,
  ) {
    const mesh2 = new THREE.Mesh(geometry, material);
    mesh2.position.set(xPosition, yPosition, zPosition);
    mesh2.castShadow = true;
    mesh2.receiveShadow = true;
    parent.add(mesh2);
    return mesh2;
  }
  const boxGeometries = new Map();
  function box(
    width,
    height,
    depth,
    material,
    xPosition,
    yPosition,
    zPosition,
    parent,
  ) {
    const key = `${width}/${height}/${depth}`;
    if (!boxGeometries.has(key))
      boxGeometries.set(key, new THREE.BoxGeometry(width, height, depth));
    return mesh(
      boxGeometries.get(key),
      material,
      xPosition,
      yPosition,
      zPosition,
      parent,
    );
  }
  const sphereGeo = new THREE.SphereGeometry(1, 40, 28);
  function ellipsoid(
    scaleX,
    scaleY,
    scaleZ,
    material,
    xPosition,
    yPosition,
    zPosition,
    parent,
  ) {
    const mesh2 = mesh(
      sphereGeo,
      material,
      xPosition,
      yPosition,
      zPosition,
      parent,
    );
    mesh2.scale.set(scaleX, scaleY, scaleZ);
    return mesh2;
  }
  function cylinderBetween(
    firstEntry,
    secondEntry,
    result,
    material,
    parent = scene,
  ) {
    const direction = new THREE.Vector3().subVectors(secondEntry, firstEntry);
    const mesh2 = mesh(
      new THREE.CylinderGeometry(result, result, direction.length(), 9),
      material,
      0,
      0,
      0,
      parent,
    );
    mesh2.position.copy(firstEntry).add(secondEntry).multiplyScalar(0.5);
    mesh2.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    );
    return mesh2;
  }

  return {
    mesh,
    box,
    ellipsoid,
    cylinderBetween,
    materials,
    random,
    rand: randomBetween,
  };
}
