import * as THREE from 'three';
import { SceneKit, seeded, type ScenePlacement } from '../phase2/SceneKit';
import { batchStaticGeometry } from '../phase4/environmentDetail';
import { buildSanFransokyo } from './SanFransokyoSkyline';
import { worldMapped, worldSurfaces } from '../presentation/WorldSurfaces';

/** A complete inhabited waterfront, built once and batched by surface material. */
export function createSanFransokyo() {
  const sceneKit = new SceneKit('SanFransokyo'),
    random = seeded(10616),
    randomBetween = (startValue: number, endValue: number) =>
      startValue + random() * (endValue - startValue);
  const stone = sceneKit.standard('#788482', 0.88, 0.08),
    trim = sceneKit.standard('#4c656b', 0.55, 0.45);
  const dark = sceneKit.standard('#142b39', 0.36, 0.48),
    red = sceneKit.standard('#773e37', 0.7, 0.28);
  const warm = sceneKit.basic('#ddbc85', 1),
    cream = sceneKit.standard('#b8b5a0', 0.8, 0.1);
  const tile = sceneKit.standard('#27313a', 0.72, 0.2),
    plant = sceneKit.standard('#5a676c', 0.6, 0.45);
  const windows = [
    sceneKit.basic('#172c3a'),
    sceneKit.basic('#233e49'),
    sceneKit.basic('#c7ad79', 0.8),
    sceneKit.basic('#87aab3', 0.7),
  ];
  const walls = ['#667b83', '#465d69', '#738084', '#4c6873'].map((colorValue) =>
    sceneKit.standard(colorValue, 0.82, 0.15),
  );
  const ownTextures: THREE.Texture[] = [];
  // Surface detail in world space: stucco on the walls, slabs on the quay, tile on the roofs.
  const surface = worldSurfaces(sceneKit);
  for (const wall of walls) worldMapped(wall, surface.stucco, 4);
  worldMapped(cream, surface.stucco, 3);
  worldMapped(stone, surface.slabs, 3);
  worldMapped(tile, surface.tile, 1.2);

  // Broad, quiet sky; the moon and hills establish scale rather than a dense star field.
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const drawingContext = canvas.getContext('2d')!;
  const skyGradient = drawingContext.createLinearGradient(0, 0, 0, 256);
  skyGradient.addColorStop(0, '#071426');
  skyGradient.addColorStop(0.58, '#19374b');
  skyGradient.addColorStop(1, '#53676b');
  drawingContext.fillStyle = skyGradient;
  drawingContext.fillRect(0, 0, 512, 256);
  for (let index = 0; index < 20; index++) {
    drawingContext.fillStyle = `rgba(133,166,177,${randomBetween(0.01, 0.035)})`;
    drawingContext.beginPath();
    drawingContext.ellipse(
      randomBetween(0, 512),
      randomBetween(85, 175),
      randomBetween(60, 180),
      randomBetween(2, 9),
      -0.08,
      0,
      Math.PI * 2,
    );
    drawingContext.fill();
  }
  const skyTexture = new THREE.CanvasTexture(canvas);
  skyTexture.colorSpace = THREE.SRGBColorSpace;
  ownTextures.push(skyTexture);
  const skyMaterial = sceneKit.ownMaterial(
    new THREE.MeshBasicMaterial({
      map: skyTexture,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
  skyMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\ngl_Position.z=gl_Position.w*.9999;',
    );
  };
  skyMaterial.customProgramCacheKey = () => 'waterfront-sky';
  const sky = sceneKit.mesh(
    new THREE.SphereGeometry(420, 32, 16),
    skyMaterial,
    { p: [0, 0, 90] },
  );
  sky.renderOrder = -800;
  sceneKit.mesh(
    new THREE.CircleGeometry(3.6, 40),
    sceneKit.ownMaterial(
      new THREE.MeshBasicMaterial({
        color: '#dbded0',
        side: THREE.DoubleSide,
        fog: false,
        toneMapped: false,
      }),
    ),
    { p: [-100, 83, 230] },
  );
  const hills = new THREE.Group();
  sceneKit.root.add(hills);
  for (let index2 = 0; index2 < 7; index2++)
    sceneKit.mesh(
      new THREE.SphereGeometry(
        randomBetween(24, 44),
        16,
        8,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2,
      ),
      sceneKit.standard(index2 % 2 ? '#223e4b' : '#2e4953', 1, 0),
      {
        p: [-130 + index2 * 43, -7, 220 + randomBetween(-10, 15)],
        s: [1, 0.37, 1],
      },
      hills,
    );

  // Water reflections are one inexpensive surface, with continuous fine ripples.
  const waterMaterial = sceneKit.ownMaterial(
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader:
        'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec3 vP;uniform float uTime;void main(){float ripple=sin(vP.x*2.7+vP.z*4.2+uTime*.45)*sin(vP.z*8.-uTime*.7);float streak=pow(max(0.,sin(vP.x*.21+sin(vP.z*.12)*.13)),16.);float breakUp=.3+.7*pow(max(0.,.5+.5*sin(vP.z*5.+uTime*.3)),3.);vec3 col=vec3(.035,.09,.12)+ripple*.006+vec3(.11,.11,.075)*streak*breakUp;float wz=128.-vP.y;float shore=smoothstep(52.,106.,wz)*step(wz,108.6);float lights=pow(max(0.,sin(vP.x*1.7+sin(vP.x*.23)*2.4)),10.)*(.35+.65*pow(max(0.,sin(vP.x*.37+1.3)),2.));float chop=.35+.65*pow(max(0.,.5+.5*sin(wz*2.6+vP.x*.9+uTime*1.1)),2.);col+=vec3(.5,.38,.24)*lights*chop*shore*.75+vec3(.05,.08,.1)*shore*.35;gl_FragColor=vec4(col,1.);}`,
    }),
  );
  sceneKit.mesh(new THREE.PlaneGeometry(310, 210), waterMaterial, {
    p: [0, -1.15, 128],
    r: [-Math.PI / 2, 0, 0],
  });
  const built = new THREE.Group();
  built.name = 'waterfront-architecture';
  sceneKit.root.add(built);
  sceneKit.box({ p: [0, -0.6, 32], s: [22, 1.2, 18] }, stone, built);
  for (const xx of [-10.7, 10.7]) {
    sceneKit.box({ p: [xx, 0.15, 32], s: [0.35, 0.3, 18] }, cream, built);
    sceneKit.box({ p: [xx, 0.7, 32], s: [0.07, 0.07, 17.8] }, trim, built);
  }
  for (const yPosition of [0.48, 1.03])
    sceneKit.box(
      { p: [0, yPosition, 40.8], s: [21, 0.055, 0.055] },
      trim,
      built,
    );
  for (let xx = -10; xx <= 10; xx += 1.5)
    sceneKit.box({ p: [xx, 0.51, 40.8], s: [0.065, 1.05, 0.065] }, trim, built);
  for (const xx of [-10.2, 10.2])
    for (const zz of [26, 35]) {
      sceneKit.box({ p: [xx, 1.9, zz], s: [0.1, 3.8, 0.1] }, trim, built);
      sceneKit.box({ p: [xx, 3.55, zz], s: [0.45, 0.16, 0.45] }, warm, built);
    }
  for (let xx = -9; xx <= 9; xx += 3)
    sceneKit.box({ p: [xx, 0.007, 32], s: [0.025, 0.015, 17] }, trim, built);
  sceneKit.box({ p: [0, -1.1, 164], s: [270, 1, 110] }, stone, built);
  sceneKit.box({ p: [0, 1.25, 109], s: [270, 2.5, 1] }, trim, built);
  // A promenade and recognizable low-rise waterfront before the tall downtown blocks.
  for (let index3 = 0; index3 < 12; index3++) {
    const xx = -100 + index3 * 17,
      width = randomBetween(11, 15),
      height = randomBetween(6, 10);
    sceneKit.box(
      { p: [xx, height / 2, 116], s: [width, height, 10] },
      index3 % 3 ? cream : walls[1],
      built,
    );
    sceneKit.box(
      { p: [xx, height + 0.3, 116], s: [width + 1, 0.6, 11] },
      trim,
      built,
    );
    for (let col = 0; col < 5; col++) {
      const px = xx - width * 0.38 + col * width * 0.19;
      sceneKit.box({ p: [px, 2.2, 110.94], s: [1.9, 3.5, 0.12] }, dark, built);
      sceneKit.box(
        { p: [px, 2.3, 110.86], s: [1.55, 2.9, 0.05] },
        col % 3 ? windows[1] : windows[2],
        built,
      );
    }
    if (index3 % 3 === 2)
      // A low tiled eave over the shopfronts: the Japanese half of the city's waterfront.
      sceneKit.box(
        { p: [xx, 4.9, 110.3], s: [width + 0.4, 0.22, 1.7], r: [-0.34, 0, 0] },
        tile,
        built,
      );
    if (index3 % 2 === 0)
      sceneKit.box(
        { p: [xx + width * 0.22, height + 1.2, 117], s: [2.2, 1.2, 1.8] },
        plant,
        built,
      );
    if (index3 % 3 === 1) {
      sceneKit.box(
        { p: [xx, 4.6, 109.8], s: [width * 0.75, 0.15, 2.1], r: [-0.13, 0, 0] },
        red,
        built,
      );
      sceneKit.box(
        { p: [xx, 4.45, 108.85], s: [width * 0.7, 0.05, 0.06] },
        warm,
        built,
      );
    }
  }
  // The harbour edge: timber pilings under the quay, a ferry-building clock tower in the middle of
  // the low waterfront row, and the street's power line on short poles in front of the shops.
  const piling = sceneKit.standard('#3b3631', 0.9, 0.05);
  for (let xx = -128; xx <= 128; xx += 4.8)
    sceneKit.box(
      { p: [xx, -0.85, 108.3], s: [0.34, 1.9, 0.34] },
      piling,
      built,
    );
  sceneKit.box({ p: [2, 11, 114.5], s: [4.4, 22, 4.4] }, cream, built);
  for (const yPosition of [8, 15, 21.6])
    sceneKit.box(
      { p: [2, yPosition, 114.5], s: [4.9, 0.3, 4.9] },
      trim,
      built,
    );
  sceneKit.mesh(
    new THREE.CircleGeometry(1.15, 24),
    sceneKit.basic('#e8d8b4', 0.9),
    { p: [2, 18.2, 112.27], r: [0, Math.PI, 0] },
    built,
  );
  sceneKit.mesh(
    new THREE.CylinderGeometry(0, 0.5 * Math.SQRT2, 1, 4).rotateY(Math.PI / 4),
    tile,
    { p: [2, 24, 114.5], s: [5.6, 3.6, 5.6] },
    built,
  );
  const poleTops: THREE.Vector3[] = [];
  for (let xx = -112; xx <= 112; xx += 14) {
    sceneKit.box({ p: [xx, 4, 110.3], s: [0.2, 8, 0.2] }, trim, built);
    sceneKit.box({ p: [xx, 7.6, 110.3], s: [1.6, 0.1, 0.1] }, trim, built);
    poleTops.push(new THREE.Vector3(xx, 7.55, 110.3));
  }
  const wirePoints: THREE.Vector3[] = [];
  for (const dx of [-0.65, 0, 0.65])
    for (let index = 0; index < poleTops.length - 1; index++)
      for (let step = 0; step < 6; step++) {
        const from = poleTops[index],
          to = poleTops[index + 1],
          at = (blend: number) =>
            from
              .clone()
              .lerp(to, blend)
              .add(new THREE.Vector3(dx, -Math.sin(blend * Math.PI) * 0.7, 0));
        wirePoints.push(at(step / 6), at((step + 1) / 6));
      }
  sceneKit.root.add(
    new THREE.LineSegments(
      sceneKit.ownGeometry(new THREE.BufferGeometry().setFromPoints(wirePoints)),
      sceneKit.ownMaterial(
        new THREE.LineBasicMaterial({
          color: '#0e1a22',
          transparent: true,
          opacity: 0.8,
        }),
      ),
    ),
  );
  // Facade depth instead of flat slabs: piers stand proud of the street face so the windows read as
  // set into the wall, sills catch the light, and tall towers step back near the top. Everything is
  // merged per material below, so the extra pieces cost triangles, not draws.
  const hip = (
    xx: number,
    yy: number,
    zz: number,
    width: number,
    height: number,
    depth: number,
  ) =>
    sceneKit.mesh(
      new THREE.CylinderGeometry(0, 0.5 * Math.SQRT2, 1, 4).rotateY(Math.PI / 4),
      tile,
      { p: [xx, yy + height / 2, zz], s: [width, height, depth] },
      built,
    );
  const block = (
    xx: number,
    zz: number,
    width2: number,
    depth: number,
    y0: number,
    y1: number,
    style: number,
    detail: boolean,
  ) => {
    const material = walls[style % walls.length],
      height = y1 - y0,
      face = zz - depth / 2,
      bays = Math.max(2, Math.round(width2 / 3.4)),
      bay = width2 / bays;
    sceneKit.box(
      { p: [xx, y0 + height / 2, zz], s: [width2, height, depth] },
      material,
      built,
    );
    for (let pier = 0; pier <= bays; pier++)
      sceneKit.box(
        {
          p: [xx - width2 / 2 + pier * bay, y0 + height / 2, face - 0.16],
          s: [0.4, height, 0.32],
        },
        material,
        built,
      );
    for (
      let yPosition2 = Math.max(y0 + 1.6, 5.2);
      yPosition2 < y1 - 1;
      yPosition2 += 2.65
    ) {
      if (Math.round(yPosition2) % 3 === 0)
        sceneKit.box(
          {
            p: [xx, yPosition2 - 0.95, zz - 0.16],
            s: [width2 + 0.18, 0.15, depth + 0.5],
          },
          trim,
          built,
        );
      for (let index = 0; index < bays; index++)
        for (const side of [-0.24, 0.24]) {
          const lit = random(),
            px = xx - width2 / 2 + (index + 0.5) * bay + side * bay;
          sceneKit.box(
            { p: [px, yPosition2, face - 0.035], s: [1.03, 1.48, 0.08] },
            windows[lit > 0.88 ? 2 : lit > 0.79 ? 3 : style % 2],
            built,
          );
          if (detail)
            sceneKit.box(
              { p: [px, yPosition2 - 0.82, face - 0.12], s: [1.2, 0.09, 0.22] },
              trim,
              built,
            );
        }
      for (let col = -depth / 2 + 0.8; col < depth / 2 - 0.5; col += 1.85)
        for (const side of [-1, 1])
          sceneKit.box(
            {
              p: [xx + side * (width2 / 2 + 0.035), yPosition2, zz + col],
              s: [0.08, 1.48, 1],
            },
            windows[random() > 0.92 ? 2 : 0],
            built,
          );
    }
    sceneKit.box(
      { p: [xx, y1 + 0.4, zz], s: [width2 + 0.55, 0.8, depth + 0.55] },
      trim,
      built,
    );
  };
  const tower = (
    xx: number,
    zz: number,
    width2: number,
    depth: number,
    height2: number,
    style: number,
    detail = true,
  ) => {
    const material = walls[style % walls.length],
      lower = height2 > 38 ? Math.round(height2 * 0.7) : height2;
    sceneKit.box(
      { p: [xx, 2.2, zz], s: [width2 + 1.2, 4.4, depth + 1.2] },
      material,
      built,
    );
    block(xx, zz, width2, depth, 0, lower, style, detail);
    let top = lower,
      topWidth = width2,
      topDepth = depth;
    if (lower < height2) {
      // The setback: a narrower upper tier on the stepped base.
      topWidth = width2 * 0.76;
      topDepth = depth * 0.76;
      block(xx, zz + 0.5, topWidth, topDepth, lower + 0.8, height2, style, detail);
      top = height2;
    }
    if (style % 3 === 0) {
      sceneKit.box(
        { p: [xx, top + 2.1, zz], s: [topWidth * 0.6, 3.5, topDepth * 0.6] },
        material,
        built,
      );
      sceneKit.box(
        { p: [xx, top + 4, zz], s: [topWidth * 0.68, 0.3, topDepth * 0.68] },
        warm,
        built,
      );
    } else if (style % 3 === 1) {
      // San Fransokyo's tiered cap: two shallow hipped tile roofs over a short drum.
      hip(xx, top + 0.8, zz, topWidth * 1.06, 2.2, topDepth * 1.06);
      sceneKit.box(
        { p: [xx, top + 3.4, zz], s: [topWidth * 0.46, 1.6, topDepth * 0.46] },
        material,
        built,
      );
      hip(xx, top + 4.2, zz, topWidth * 0.66, 1.7, topDepth * 0.66);
    } else {
      // Plant on the roof: a timber water tank, cooling units and a mast.
      sceneKit.mesh(
        new THREE.CylinderGeometry(1.1, 1.1, 2.2, 10),
        red,
        { p: [xx - topWidth * 0.2, top + 2.3, zz + topDepth * 0.15] },
        built,
      );
      for (const dx of [0.15, 0.32])
        sceneKit.box(
          { p: [xx + topWidth * dx, top + 1.3, zz - topDepth * 0.2], s: [1.6, 1, 1.2] },
          plant,
          built,
        );
      sceneKit.box(
        { p: [xx + topWidth * 0.25, top + 4.5, zz + topDepth * 0.2], s: [0.12, 7, 0.12] },
        trim,
        built,
      );
    }
  };
  // Authored blocks leave the bay and bridge legible. Heights and setbacks have a hierarchy.
  for (const [xx, zz, width3, depth2, height3, style] of [
    [-73, 143, 12, 13, 31, 0],
    [-52, 149, 10, 12, 44, 1],
    [-31, 145, 13, 13, 32, 2],
    [-12, 160, 12, 14, 67, 3],
    [12, 153, 15, 13, 52, 0],
    [34, 160, 12, 13, 39, 2],
    [54, 143, 12, 14, 34, 1],
    [75, 151, 15, 14, 47, 0],
    [-91, 169, 14, 16, 41, 3],
    [95, 176, 16, 16, 50, 1],
    [-38, 179, 16, 15, 55, 0],
    [38, 184, 17, 15, 64, 2],
  ])
    tower(xx, zz, width3, depth2, height3, style);
  for (let index4 = 0; index4 < 16; index4++)
    tower(
      -120 + index4 * 16 + randomBetween(-3, 3),
      194 + randomBetween(-2, 25),
      randomBetween(7, 12),
      randomBetween(9, 14),
      randomBetween(18, 43),
      index4 % 4,
      false,
    );
  // Distinct central stepped landmark, rather than an identical glowing box grid.
  for (let tier = 0; tier < 4; tier++) {
    const width4 = 12 - tier * 2,
      yPosition3 = 63 + tier * 4.3;
    sceneKit.box(
      { p: [-12, yPosition3, 160], s: [width4, 4.3, width4] },
      walls[3],
      built,
    );
    sceneKit.box(
      {
        p: [-12, yPosition3 + 2.15, 160],
        s: [width4 + 0.8, 0.2, width4 + 0.8],
      },
      warm,
      built,
    );
  }
  sceneKit.box({ p: [-12, 86, 160], s: [0.35, 15, 0.35] }, trim, built);

  // Hybrid suspension bridge: real paired pylons, road edge, catenary and suspension hangers.
  const cable = sceneKit.standard('#b38561', 0.56, 0.55);
  sceneKit.box({ p: [0, 7.1, 91], s: [160, 0.65, 5.2] }, red, built);
  for (const zz of [88.5, 93.5])
    sceneKit.box({ p: [0, 8.1, zz], s: [160, 0.1, 0.1] }, trim, built);
  for (const xx of [-38, 38]) {
    for (const zz of [88.2, 93.8])
      sceneKit.box({ p: [xx, 15, zz], s: [1.5, 33, 1.7] }, red, built);
    for (const yPosition4 of [21, 29.5]) {
      sceneKit.box({ p: [xx, yPosition4, 91], s: [6, 0.8, 8.2] }, red, built);
      sceneKit.box(
        {
          p: [xx, yPosition4 + 0.5, 91],
          s: [7.7, 0.35, 8.8],
          r: [0, 0, 0.015],
        },
        trim,
        built,
      );
    }
  }
  const link = (
    startPoint: THREE.Vector3,
    endPoint: THREE.Vector3,
    radius: number,
    material: THREE.Material,
  ) => {
    const delta = endPoint.clone().sub(startPoint),
      mesh = sceneKit.mesh(
        new THREE.CylinderGeometry(radius, radius, delta.length(), 6),
        material,
        {
          p: startPoint
            .clone()
            .add(endPoint)
            .multiplyScalar(0.5)
            .toArray() as ScenePlacement['p'],
        },
        built,
      );
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
  };
  for (const zz of [88.3, 93.7]) {
    const points: THREE.Vector3[] = [];
    for (let index5 = 0; index5 <= 64; index5++) {
      const xx = -80 + index5 * 2.5,
        yPosition5 =
          Math.abs(xx) <= 38
            ? 12 + 17 * (xx / 38) ** 2
            : 29 - 21 * ((Math.abs(xx) - 38) / 42);
      points.push(new THREE.Vector3(xx, yPosition5, zz));
      if (index5 % 2 === 0)
        link(
          new THREE.Vector3(xx, 7.5, zz),
          new THREE.Vector3(xx, yPosition5, zz),
          0.035,
          cable,
        );
    }
    sceneKit.mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 96, 0.075, 6),
      cable,
      { p: [0, 0, 0] },
      built,
    );
  }
  const traffic = sceneKit.instances(
    Array.from({ length: 24 }, (unusedValue, index6) => ({
      p: [
        -76 + index6 * 6.5,
        7.7,
        90 + (index6 % 2) * 2,
      ] as ScenePlacement['p'],
      s: [0.14, 0.12, 0.35] as ScenePlacement['s'],
    })),
    warm,
    undefined,
    sceneKit.root,
  );
  batchStaticGeometry(sceneKit); // Instanced traffic remains independent.
  sceneKit.root.traverse((sceneObject) => {
    sceneObject.castShadow = false;
    sceneObject.receiveShadow = false;
    const material2 = (sceneObject as THREE.Mesh).material;
    if (material2)
      for (const material of Array.isArray(material2) ? material2 : [material2])
        (material as THREE.Material & { fog: boolean }).fog = false;
  });
  let lastTraffic = -1;
  const dummy = new THREE.Object3D();
  sceneKit.root.visible = false;
  // Tracker P1-02: the detailed skyline from the finale (lit facades, bridge towers, turbines, signs)
  // stands behind this waterfront, turned to face the gate and pushed back past it.
  const far = new SceneKit('SanFransokyoFar'),
    skyline = buildSanFransokyo(far, new THREE.Vector3(-0.3, 0.5, 0.6));
  far.root.rotation.y = Math.PI;
  far.root.position.set(0, -0.5, 80);
  sceneKit.root.add(far.root);
  // Built for sunset; retinted to this night: cool bodies, blue haze, the lit windows kept.
  const nightBase = new THREE.Color('#2a4256'),
    nightHaze = new THREE.Color('#19374b');
  far.root.traverse((sceneObject) => {
    const material = (sceneObject as THREE.Mesh).material as
      | THREE.ShaderMaterial
      | undefined;
    const textValue = material?.uniforms;
    if (textValue?.uHaze && textValue.uBase) {
      textValue.uBase.value.lerp(nightBase, 0.7);
      textValue.uHaze.value.copy(nightHaze);
    }
  });
  let lastT = -1;
  return {
    group: sceneKit.root,
    thresholdZ: 24,
    update(timeSeconds: number) {
      skyline.update(
        timeSeconds,
        lastT < 0 ? 0 : Math.min(0.1, timeSeconds - lastT),
      );
      lastT = timeSeconds;
      waterMaterial.uniforms.uTime.value = timeSeconds;
      if (timeSeconds - lastTraffic > 0.1) {
        lastTraffic = timeSeconds;
        for (let index6 = 0; index6 < 24; index6++) {
          dummy.position.set(
            ((index6 * 6.5 + timeSeconds * (index6 % 2 ? 1.5 : -1.5) + 200) %
              156) -
              78,
            7.7,
            90 + (index6 % 2) * 2,
          );
          dummy.scale.set(0.14, 0.12, 0.35);
          dummy.updateMatrix();
          traffic.setMatrixAt(index6, dummy.matrix);
        }
        traffic.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      ownTextures.forEach((timeSeconds) => timeSeconds.dispose());
      skyline.dispose();
      far.dispose();
      sceneKit.dispose();
    },
  };
}
/**
 * Data contract used by environment construction.
 */
export type SanFransokyo = ReturnType<typeof createSanFransokyo>;
