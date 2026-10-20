import * as THREE from 'three';

/**
 * The normal world, on the far side of the gate: San Fransokyo at night — warm, alive and whole,
 * the deliberate opposite of the broken dimension. It lives in the same coordinate space, set
 * beyond the portal threshold (+Z), so walking through the gate carries Hiro into it and turning
 * back frames the dimension through the ring.
 *
 * Built for a smooth frame: instanced tower bodies, a single canvas window-glow material (no
 * per-window meshes), a cheap bay shader, a point-cloud sky, and almost no dynamic lights.
 */
const THRESHOLD = 24; // portal plane Z; the city sits beyond it.

/**
 * Paint the repeated window pattern used by the city facades.
 */
function windowTexture(warm: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const drawingContext = canvas.getContext('2d')!;
  drawingContext.fillStyle = warm ? '#0b1420' : '#0a1018';
  drawingContext.fillRect(0, 0, 128, 256);
  const lit = warm
    ? ['#ffd9a3', '#ffc477', '#ffe8c4', '#9fd4ff', '#fff2d6']
    : ['#bfe2ff', '#9fc8ef', '#e8f4ff'];
  for (let gy = 0; gy < 32; gy++)
    for (let gx = 0; gx < 8; gx++) {
      const on = Math.random() > 0.32;
      drawingContext.fillStyle = on
        ? lit[(Math.random() * lit.length) | 0]
        : '#101a28';
      drawingContext.globalAlpha = on ? 0.55 + Math.random() * 0.45 : 1;
      drawingContext.fillRect(gx * 16 + 3, gy * 8 + 2, 10, 5);
    }
  drawingContext.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Build the San Fransokyo waterfront and its layered city backdrop.
 */
export function createSanFransokyo() {
  const group = new THREE.Group();
  group.name = 'SanFransokyo';
  group.position.z = 0;
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(result: T) => {
    owned.push(result);
    return result;
  };

  // --- Night sky dome + stars ---
  const skyMat = own(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color('#0a1830') },
        uBot: { value: new THREE.Color('#243a52') },
      },
      vertexShader:
        'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:
        'varying vec3 vP;uniform vec3 uTop;uniform vec3 uBot;void main(){float h=clamp(normalize(vP).y*.5+.5,0.,1.);gl_FragColor=vec4(mix(uBot,uTop,pow(h,.7)),1.);}',
    }),
  );
  const sky = new THREE.Mesh(
    own(new THREE.SphereGeometry(300, 24, 16)),
    skyMat,
  );
  sky.position.set(0, 0, THRESHOLD + 50);
  group.add(sky);

  const starGeo = own(new THREE.BufferGeometry());
  const stars = 900;
  const sp = new Float32Array(stars * 3);
  for (let index = 0; index < stars; index++) {
    const firstValue = Math.random() * Math.PI * 2,
      radius = 120 + Math.random() * 150,
      yPosition = 20 + Math.random() * 180;
    sp[index * 3] = Math.cos(firstValue) * radius;
    sp[index * 3 + 1] = yPosition;
    sp[index * 3 + 2] = THRESHOLD + 50 + Math.sin(firstValue) * radius;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const starMat = own(
    new THREE.PointsMaterial({
      color: '#cfe4ff',
      size: 0.5,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  group.add(new THREE.Points(starGeo, starMat));
  // A calm moon, the single clean light source of the whole scene.
  const moonMat = own(
    new THREE.MeshBasicMaterial({ color: '#eaf1ff', toneMapped: false }),
  );
  group.add(
    new THREE.Mesh(own(new THREE.CircleGeometry(4.5, 32)), moonMat)
      .translateX(-40)
      .translateY(70)
      .translateZ(THRESHOLD + 120),
  );

  // --- Bay water ---
  const waterMat = own(
    new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color('#0e2740') },
        uGlow: { value: new THREE.Color('#2a5a7e') },
      },
      vertexShader:
        'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec2 vUv;uniform float uTime;uniform vec3 uColor;uniform vec3 uGlow;
      void main(){float b=sin(vUv.y*120.+uTime*.6)*.5+.5;b*=sin(vUv.x*70.-uTime*.4)*.5+.5;
      float shore=smoothstep(0.,.25,vUv.y);vec3 c=mix(uGlow,uColor,shore)+b*.06*uGlow;gl_FragColor=vec4(c,.96);}`,
    }),
  );
  const water = new THREE.Mesh(
    own(new THREE.PlaneGeometry(260, 150)),
    waterMat,
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -1.1, THRESHOLD + 70);
  group.add(water);

  // --- Arrival overlook: where Hiro steps through. A small clean vista deck + railing. ---
  const deckMat = own(
    new THREE.MeshStandardMaterial({
      color: '#2b3a46',
      roughness: 0.8,
      metalness: 0.2,
    }),
  );
  const deck = new THREE.Mesh(own(new THREE.BoxGeometry(16, 1, 14)), deckMat);
  deck.position.set(0, -0.5, THRESHOLD + 6);
  group.add(deck);
  const railMat = own(
    new THREE.MeshStandardMaterial({
      color: '#5a6b74',
      roughness: 0.5,
      metalness: 0.7,
    }),
  );
  const railGeo = own(new THREE.BoxGeometry(16, 0.12, 0.12));
  for (const yPosition2 of [0.55, 0.9]) {
    const part = new THREE.Mesh(railGeo, railMat);
    part.position.set(0, yPosition2, THRESHOLD + 12.9);
    group.add(part);
  }
  const postGeo = own(new THREE.BoxGeometry(0.1, 1, 0.1));
  const posts = new THREE.InstancedMesh(postGeo, railMat, 9);
  const sceneObject = new THREE.Object3D();
  for (let index2 = 0; index2 < 9; index2++) {
    sceneObject.position.set(-8 + index2 * 2, 0.45, THRESHOLD + 12.9);
    sceneObject.updateMatrix();
    posts.setMatrixAt(index2, sceneObject.matrix);
  }
  group.add(posts);
  // A warm standing lamp on the deck — the first friendly light in the whole experience.
  const lampGlow = own(
    new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false }),
  );
  group.add(
    new THREE.Mesh(own(new THREE.SphereGeometry(0.16, 12, 10)), lampGlow)
      .translateX(6)
      .translateY(2.4)
      .translateZ(THRESHOLD + 10),
  );
  const lamp = new THREE.PointLight('#ffcaa0', 6, 16, 1.8);
  lamp.position.set(6, 2.4, THRESHOLD + 10);
  group.add(lamp);

  // --- Downtown towers: instanced bodies with a shared warm window-glow material ---
  const warmWindows = own(windowTexture(true));
  const coolWindows = own(windowTexture(false));
  const bodyGeo = own(new THREE.BoxGeometry(1, 1, 1));
  const makeTowerMat = (texture: THREE.Texture, color: string) =>
    own(
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.72,
        metalness: 0.22,
        emissive: '#ffffff',
        emissiveMap: texture,
        emissiveIntensity: 1.15,
        map: texture,
      }),
    );
  const warmMat = makeTowerMat(warmWindows, '#223141');
  const coolMat = makeTowerMat(coolWindows, '#1c2b3b');
  type T = {
    x: number;
    z: number;
    w: number;
    d: number;
    h: number;
    warm: boolean;
  };
  const towers: T[] = [];
  let seed = 20260116;
  const randomBetween = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let index3 = 0; index3 < 46; index3++) {
    const firstValue2 = randomBetween(),
      ring = 40 + randomBetween() * 55;
    const xPosition = (randomBetween() - 0.5) * 120,
      zPosition = THRESHOLD + 34 + randomBetween() * 60;
    const height = 10 + randomBetween() * 46 * (1 - Math.abs(xPosition) / 150);
    towers.push({
      x: xPosition,
      z: zPosition,
      w: 4 + randomBetween() * 7,
      d: 4 + randomBetween() * 7,
      h: Math.max(8, height),
      warm: firstValue2 > 0.3,
    });
    void ring;
  }
  const warmT = towers.filter((tower) => tower.warm),
    coolT = towers.filter((tower) => !tower.warm);
  const buildCluster = (list: T[], material2: THREE.Material) => {
    const mesh = new THREE.InstancedMesh(bodyGeo, material2, list.length);
    const sceneObject2 = new THREE.Object3D();
    list.forEach((tower, index4) => {
      sceneObject2.position.set(
        tower.x,
        tower.h / 2 - 1.1,
        tower.z,
      );
      sceneObject2.scale.set(tower.w, tower.h, tower.d);
      // Repeat the window texture per floor/column so the grid density reads at any height.
      sceneObject2.updateMatrix();
      mesh.setMatrixAt(index4, sceneObject2.matrix);
    });
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    return mesh;
  };
  buildCluster(warmT, warmMat);
  buildCluster(coolT, coolMat);
  // Scale the window texture so one tile ≈ one floor band.
  warmWindows.repeat.set(2, 6);
  coolWindows.repeat.set(2, 6);
  // A few crowned landmark towers with lit tops (the Fransokyo skyline signature).
  const crownMat = own(
    new THREE.MeshStandardMaterial({
      color: '#e8b25a',
      emissive: '#ffb347',
      emissiveIntensity: 2.2,
      roughness: 0.5,
    }),
  );
  for (const [xPosition2, zPosition2, height2] of [
    [-14, THRESHOLD + 44, 52],
    [10, THRESHOLD + 52, 60],
    [26, THRESHOLD + 66, 46],
  ] as const) {
    const body = new THREE.Mesh(bodyGeo, warmMat);
    body.scale.set(7, height2, 7);
    body.position.set(xPosition2, height2 / 2 - 1.1, zPosition2);
    group.add(body);
    const crown = new THREE.Mesh(
      own(new THREE.ConeGeometry(4, 6, 4)),
      crownMat,
    );
    crown.position.set(xPosition2, height2 - 1.1 + 3, zPosition2);
    crown.rotation.y = Math.PI / 4;
    group.add(crown);
  }

  // --- The fused suspension bridge (Golden Gate × torii), spanning the bay in the mid-distance ---
  const bridge = new THREE.Group();
  bridge.position.set(0, 0, THRESHOLD + 40);
  group.add(bridge);
  const towerMat = own(
    new THREE.MeshStandardMaterial({
      color: '#8a2f33',
      roughness: 0.6,
      metalness: 0.3,
      emissive: '#5a1013',
      emissiveIntensity: 0.4,
    }),
  );
  const deckMatB = own(
    new THREE.MeshStandardMaterial({
      color: '#6b2529',
      roughness: 0.7,
      metalness: 0.3,
    }),
  );
  const roadway = new THREE.Mesh(
    own(new THREE.BoxGeometry(150, 0.5, 3)),
    deckMatB,
  );
  roadway.position.set(0, 7, 0);
  bridge.add(roadway);
  for (const bx of [-34, 34]) {
    const col = new THREE.Mesh(own(new THREE.BoxGeometry(2, 34, 2)), towerMat);
    col.position.set(bx, 10, 0);
    bridge.add(col);
    const col2 = new THREE.Mesh(new THREE.BoxGeometry(2, 34, 2), towerMat);
    col2.position.set(bx, 10, -3);
    bridge.add(col2);
    // A torii crossbeam between the pylons.
    const beam = new THREE.Mesh(
      own(new THREE.BoxGeometry(6, 1.2, 5)),
      towerMat,
    );
    beam.position.set(bx, 25, -1.5);
    bridge.add(beam);
    const beam2 = new THREE.Mesh(
      own(new THREE.BoxGeometry(8, 0.8, 5)),
      towerMat,
    );
    beam2.position.set(bx, 27.5, -1.5);
    bridge.add(beam2);
  }
  // Main cables (catenary) and hangers, as cheap lines.
  const cableMat = own(
    new THREE.LineBasicMaterial({
      color: '#d98a55',
      transparent: true,
      opacity: 0.7,
    }),
  );
  for (const zc of [0, -3]) {
    const points: THREE.Vector3[] = [];
    for (let index5 = 0; index5 <= 40; index5++) {
      const progress = index5 / 40,
        xPosition3 = -72 + progress * 144;
      const sag =
        Math.abs(xPosition3) < 34
          ? 7 + (1 - Math.cos((xPosition3 / 34) * Math.PI)) * 9
          : 25;
      points.push(new THREE.Vector3(xPosition3, sag, zc));
    }
    bridge.add(
      new THREE.Line(
        own(new THREE.BufferGeometry().setFromPoints(points)),
        cableMat,
      ),
    );
  }

  // --- Distant hills silhouette behind the city ---
  const hillMat = own(
    new THREE.MeshStandardMaterial({ color: '#14202e', roughness: 1 }),
  );
  for (let index6 = 0; index6 < 5; index6++) {
    const hill = new THREE.Mesh(
      own(
        new THREE.SphereGeometry(
          30 + index6 * 8,
          10,
          6,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2,
        ),
      ),
      hillMat,
    );
    hill.position.set(-60 + index6 * 30, -6, THRESHOLD + 110);
    hill.scale.set(1, 0.4, 1);
    group.add(hill);
  }

  // Soft ambient so the far city reads without heavy lighting.
  const hemi = new THREE.HemisphereLight('#4a6a92', '#0a1420', 1.1);
  group.add(hemi);
  const moon = new THREE.DirectionalLight('#9fb8e0', 1.2);
  moon.position.set(-40, 70, THRESHOLD + 120);
  group.add(moon);

  group.visible = false;
  return {
    group,
    thresholdZ: THRESHOLD,
    update(timeSeconds: number) {
      waterMat.uniforms.uTime.value = timeSeconds;
      lamp.intensity = 6 + Math.sin(timeSeconds * 2.3) * 0.4;
    },
    dispose() {
      owned.forEach((options) => options.dispose());
      group.removeFromParent();
      group.clear();
    },
  };
}
export type SanFransokyo = ReturnType<typeof createSanFransokyo>;
