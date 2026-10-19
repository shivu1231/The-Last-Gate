import * as THREE from 'three';

/**
 * Add the opening city details that provide scale, depth and motion cues.
 */
export function createCinematicDetails(
  scene,
  { mesh, box, materials, rand: randomBetween, building, mistTexture },
) {
  const animatedRoots = [],
    haze = [];
  // Close framing: a loose cable and fragments cross a different plane from the street.
  const cableRoot = new THREE.Group();
  scene.add(cableRoot);
  cableRoot.position.set(-2.9, 4.8, 2.4);
  animatedRoots.push(cableRoot);
  const cableCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.2, 4, -1),
    new THREE.Vector3(0.1, 1.5, 0),
    new THREE.Vector3(0.65, -1.2, 0.4),
    new THREE.Vector3(0.2, -2.8, 0.15),
  ]);
  const cable = mesh(
    new THREE.TubeGeometry(cableCurve, 36, 0.021, 7, false),
    materials.dark,
    0,
    0,
    0,
    cableRoot,
  );
  cable.castShadow = false;
  const shardGeo = new THREE.BufferGeometry();
  shardGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-0.4, -0.2, 0, 0.32, -0.1, 0.03, 0.12, 0.53, 0],
      3,
    ),
  );
  shardGeo.computeVertexNormals();
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#818f8e',
    roughness: 0.24,
    metalness: 0.14,
    transparent: true,
    opacity: 0.29,
    side: THREE.DoubleSide,
    envMapIntensity: 0.7,
  });
  const shards = new THREE.InstancedMesh(shardGeo, glass, 3);
  scene.add(shards);
  const shardStates = [],
    dummy = new THREE.Object3D();
  for (let index = 0; index < 3; index++) {
    const position = new THREE.Vector3(
      randomBetween(-4.5, 4.5),
      randomBetween(0.7, 4.7),
      randomBetween(-2, 6),
    );
    const state = randomBetween(0.15, 0.5);
    shardStates.push({
      pos: position,
      scale: state,
      phase: randomBetween(0, 6.3),
    });
    dummy.position.copy(position);
    dummy.scale.setScalar(state);
    dummy.rotation.set(
      randomBetween(0, 1),
      randomBetween(0, 1),
      randomBetween(0, 2),
    );
    dummy.updateMatrix();
    shards.setMatrixAt(index, dummy.matrix);
  }
  const nearPositions = new Float32Array(190 * 3);
  for (let index2 = 0; index2 < 190; index2++) {
    nearPositions[index2 * 3] = randomBetween(-6, 6);
    nearPositions[index2 * 3 + 1] = randomBetween(0.2, 6);
    nearPositions[index2 * 3 + 2] = randomBetween(-14, 10);
  }
  const nearGeo = new THREE.BufferGeometry();
  nearGeo.setAttribute('position', new THREE.BufferAttribute(nearPositions, 3));
  const nearDust = new THREE.Points(
    nearGeo,
    new THREE.PointsMaterial({
      map: mistTexture,
      color: '#b6b8a8',
      size: 0.024,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    }),
  );
  scene.add(nearDust);
  // Four precise anomalies remain legible as city infrastructure.
  const upper = building(-17.7, 17.5, -22, 5.8, 8, 6, Math.PI / 2 - 0.08);
  animatedRoots.push(upper);
  const verticalRoad = new THREE.Group();
  scene.add(verticalRoad);
  verticalRoad.position.set(-12, 13, -61);
  verticalRoad.rotation.set(1.37, 0.15, -0.11);
  box(7, 0.6, 25, materials.concrete, 0, 0, 0, verticalRoad);
  for (let index3 = 0; index3 < 6; index3++)
    box(
      0.13,
      0.02,
      1.1,
      materials.metal,
      0,
      0.31,
      -10 + index3 * 3.4,
      verticalRoad,
    );
  box(9, 1.3, 2, materials.edge, -6, 5, -44).rotation.set(0.09, 0.1, -0.07);
  box(9, 1.3, 2, materials.edge, -5.4, 6.5, -45).rotation.set(
    -0.07,
    -0.1,
    0.06,
  );
  const detached = new THREE.Group();
  scene.add(detached);
  detached.position.set(-9.1, 7.5, -33);
  detached.rotation.z = 0.22;
  animatedRoots.push(detached);
  for (let index4 = 0; index4 < 6; index4++)
    box(0.53, 0.95, 0.04, materials.dark, (index4 - 2.5) * 0.9, 0, 0, detached);
  // Extreme-distance masses read through the fog instead of ending at an empty sky.
  const farMat = new THREE.MeshStandardMaterial({
    color: '#303e59',
    roughness: 1,
  });
  const massA = box(22, 62, 19, farMat, -36, 20, -123);
  massA.rotation.z = 0.19;
  massA.castShadow = false;
  const massB = box(16, 53, 18, farMat, 33, 12, -135);
  massB.rotation.z = -0.35;
  massB.castShadow = false;
  const farBridge = box(70, 1.5, 9, farMat, 8, 16, -115);
  farBridge.rotation.z = 0.24;
  farBridge.castShadow = false;
  // Local haze is deliberately not uniform: thin pools collect at separate depths.
  for (let index5 = 0; index5 < 5; index5++) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: mistTexture,
        color: '#6b87ad',
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        blending: THREE.NormalBlending,
      }),
    );
    sprite.position.set(
      randomBetween(-8, 8),
      randomBetween(0.4, 3),
      -9 - index5 * 11,
    );
    sprite.scale.set(19 + index5 * 3, randomBetween(2, 5), 1);
    scene.add(sprite);
    haze.push({
      sprite,
      x: sprite.position.x,
      y: sprite.position.y,
      phase: randomBetween(0, 6),
    });
  }
  // Contact occlusion under the shell, independently of shadow-map softness.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 256;
  const drawingContext = shadowCanvas.getContext('2d');
  const gradient = drawingContext.createRadialGradient(
    128,
    128,
    12,
    128,
    128,
    128,
  );
  gradient.addColorStop(0, 'rgba(1,5,7,.85)');
  gradient.addColorStop(0.4, 'rgba(1,5,7,.5)');
  gradient.addColorStop(1, 'rgba(1,5,7,0)');
  drawingContext.fillStyle = gradient;
  drawingContext.fillRect(0, 0, 256, 256);
  const contact = mesh(
    new THREE.PlaneGeometry(4.6, 3.9),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(shadowCanvas),
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
    }),
    2.7,
    -0.133,
    -11.6,
  );
  contact.rotation.x = -Math.PI / 2;
  contact.castShadow = false;
  // A few landing traces make the shell feel like it came to rest here. They stay
  // low and asymmetrical so the road still reads as the leading line.
  const landingRoot = new THREE.Group();
  scene.add(landingRoot);
  landingRoot.position.set(2.7, -0.125, -12.1);
  animatedRoots.push(landingRoot);
  const scrapeMat = new THREE.MeshStandardMaterial({
    color: '#343c4a',
    roughness: 1,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
  });
  const scrape = mesh(
    new THREE.PlaneGeometry(1.9, 0.16),
    scrapeMat,
    0.1,
    0.004,
    0.15,
    landingRoot,
  );
  scrape.rotation.x = -Math.PI / 2;
  scrape.rotation.z = -0.18;
  const scrape2 = mesh(
    new THREE.PlaneGeometry(1.15, 0.1),
    scrapeMat,
    -0.5,
    0.006,
    0.55,
    landingRoot,
  );
  scrape2.rotation.x = -Math.PI / 2;
  scrape2.rotation.z = 0.2;
  const landingBits = [];
  [
    [-1.45, 0.02, 0.18, 0.42],
    [1.25, 0.03, -0.32, 0.3],
    [-0.65, 0.04, 0.7, 0.2],
  ].forEach(([xPosition, yPosition, zPosition, scaleFactor]) => {
    const bit = mesh(
      new THREE.DodecahedronGeometry(scaleFactor, 0),
      materials.concrete,
      xPosition,
      yPosition,
      zPosition,
      landingRoot,
    );
    bit.rotation.set(
      randomBetween(0, 2),
      randomBetween(0, 3),
      randomBetween(0, 2),
    );
    landingBits.push(bit);
  });
  const roadChip = mesh(
    new THREE.BoxGeometry(0.64, 0.12, 0.42),
    materials.edge,
    0.75,
    0.04,
    0.74,
    landingRoot,
  );
  roadChip.rotation.set(0.12, 0.3, -0.14);
  landingBits.push(roadChip);
  // A low crimson bounce is local to the damaged armour and never becomes a pickup glow.
  const shellBounce = new THREE.PointLight('#b72a31', 0.34, 3.4, 2);
  shellBounce.position.set(2.95, 0.12, -11.55);
  scene.add(shellBounce);
  // Low grime and grit keep concrete stylized while breaking perfect material uniformity.
  const grit = document.createElement('canvas');
  grit.width = grit.height = 256;
  const gc = grit.getContext('2d');
  gc.fillStyle = '#aaaaaa';
  gc.fillRect(0, 0, 256, 256);
  for (let index6 = 0; index6 < 9000; index6++) {
    const sampleValue = Math.floor(randomBetween(110, 210));
    gc.fillStyle = `rgba(${sampleValue},${sampleValue},${sampleValue},.24)`;
    gc.fillRect(
      randomBetween(0, 256),
      randomBetween(0, 256),
      randomBetween(1, 6),
      randomBetween(1, 3),
    );
  }
  const gritTexture = new THREE.CanvasTexture(grit);
  gritTexture.wrapS = gritTexture.wrapT = THREE.RepeatWrapping;
  gritTexture.repeat.set(2, 3);
  materials.concrete.bumpMap = gritTexture;
  materials.concrete.bumpScale = 0.025;
  materials.concrete.roughnessMap = gritTexture;
  materials.concrete.roughness = 0.98;
  materials.metal.roughness = 0.38;
  materials.metal.metalness = 0.65;
  materials.metal.envMapIntensity = 0.35;
  materials.dark.roughness = 0.49;
  materials.dark.metalness = 0.12;
  return {
    animatedRoots,
    update(timeSeconds, deltaSeconds, reduced, progress = 0) {
      if (reduced) return;
      cableRoot.rotation.z = Math.sin(timeSeconds * 0.18) * 0.018;
      upper.rotation.z =
        Math.PI / 2 - 0.08 + Math.sin(timeSeconds * 0.035) * 0.008;
      detached.position.y = 7.5 + Math.sin(timeSeconds * 0.12) * 0.08;
      haze.forEach((state2) => {
        state2.sprite.position.x =
          state2.x + Math.sin(timeSeconds * 0.035 + state2.phase) * 1.3;
        state2.sprite.position.y =
          state2.y + Math.sin(timeSeconds * 0.05 + state2.phase) * 0.15;
      });
      nearDust.position.x = Math.sin(timeSeconds * 0.025) * 0.65;
      nearDust.position.y = Math.sin(timeSeconds * 0.06) * 0.08;
      nearDust.material.opacity = 0.34 * (1 - progress * 0.72);
      shardStates.forEach((state2, index7) => {
        dummy.position.copy(state2.pos);
        dummy.position.y += Math.sin(timeSeconds * 0.15 + state2.phase) * 0.12;
        dummy.scale.setScalar(state2.scale);
        dummy.rotation.set(
          state2.phase + timeSeconds * 0.012,
          state2.phase * 0.4 + timeSeconds * 0.009,
          state2.phase * 0.3,
        );
        dummy.updateMatrix();
        shards.setMatrixAt(index7, dummy.matrix);
      });
      shards.instanceMatrix.needsUpdate = true;
      shellBounce.intensity = 0.3 + Math.sin(timeSeconds * 0.63) * 0.025;
    },
  };
}
