import * as THREE from 'three';
import { SceneKit, seeded } from '../phase2/SceneKit';

/**
 * San Fransokyo across the water at sunset, for the home set: the bay bridge with its pagoda-
 * roofed vermilion towers, three layers of skyline (lit windows drawn by one shader, so hundreds
 * of buildings cost a handful of draw calls), pagoda caps and a tiered pyramid tower, neon signs,
 * the airborne wind turbines riding over the city, red aviation lights, hills dotted with house
 * lights, boats on the bay, and warm haze between the layers.
 *
 * Everything sits beyond z = -40 and is built into the kit's root; update(t) animates it.
 */

const FACADE_VS = `varying vec3 vWorld;varying vec3 vN;varying float vSeed;
void main(){mat4 m=modelMatrix;
#ifdef USE_INSTANCING
m=m*instanceMatrix;vSeed=float(gl_InstanceID);
#else
vSeed=0.;
#endif
vec4 w=m*vec4(position,1.);vWorld=w.xyz;vN=normalize(mat3(m)*normal);gl_Position=projectionMatrix*viewMatrix*w;}`;
// Facades: a window grid on the vertical faces, lit by a per-building hash; sunset light on the
// faces toward the sun, a rim on the edges, and haze that thickens with distance and toward the water.
const FACADE_FS = `uniform vec3 uBase;uniform vec3 uHaze;uniform vec2 uHazeRange;uniform float uLit;uniform vec3 uSun;uniform float uTime;uniform vec2 uCell;
varying vec3 vWorld;varying vec3 vN;varying float vSeed;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){vec3 n=normalize(vN);float side=step(.5,abs(n.x));
float u=mix(vWorld.x,vWorld.z,side);float h=vWorld.y;
vec2 cell=vec2(u/uCell.x,h/uCell.y);vec2 id=floor(cell);vec2 f=fract(cell);
float win=step(.2,f.x)*step(f.x,.8)*step(.28,f.y)*step(f.y,.78);
float density=.25+.55*hash(vec2(vSeed,1.7));
float on=step(1.-uLit*density,hash(id+vSeed*7.13));
float flick=.85+.15*sin(uTime*(1.+hash(id)*3.)+hash(id.yx)*40.);
float roof=step(.6,n.y);
vec3 lamp=mix(vec3(1.,.74,.42),vec3(.62,.86,1.),step(.82,hash(id.yx+vSeed)));
float sunSide=max(0.,dot(n,normalize(uSun)));
vec3 col=uBase*(.6+.3*n.y)+vec3(1.,.8,.64)*sunSide*.2;
col=mix(col,lamp*1.35*flick,win*on*(1.-roof));
float d=length(vWorld-cameraPosition);
float haze=smoothstep(uHazeRange.x,uHazeRange.y,d);
haze=clamp(haze+(1.-smoothstep(-1.,22.,h))*.35,0.,1.);
col=mix(col,uHaze,haze*.82);
gl_FragColor=vec4(col,1.);}`;
// A vertical band of haze: thick at the water, gone by the top.
const HAZE_FS = `varying vec2 vUv;uniform vec3 uColor;uniform float uOpacity;void main(){float a=pow(1.-vUv.y,2.2)*uOpacity*smoothstep(0.,.08,vUv.x)*smoothstep(1.,.92,vUv.x);gl_FragColor=vec4(uColor,a);}`;
const UV_VS =
  'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
// Light points (aviation lights, house lights, deck lamps): round, soft, optionally blinking.
const DOTS_VS = `attribute float aSeed;uniform float uTime;uniform float uSize;uniform float uBlink;varying float vA;varying vec3 vC;attribute vec3 color;
void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;
float b=uBlink>0.?step(.55,fract(uTime*.8+aSeed)):1.;vA=b*(.75+.25*sin(uTime*2.+aSeed*30.));vC=color;
gl_PointSize=uSize*(300./-mv.z);}`;
const DOTS_FS = `varying float vA;varying vec3 vC;void main(){vec2 p=gl_PointCoord-.5;float d=length(p);float a=smoothstep(.5,.0,d);gl_FragColor=vec4(vC*a*vA*1.6,a*vA);}`;

/** A neon sign: glowing text drawn once into a canvas. */
function neon(
  text: string,
  color: string,
  options: { w?: number; h?: number; font?: string; frame?: boolean } = {},
) {
  const width = options.w ?? 512,
    height = options.h ?? 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const drawingContext = canvas.getContext('2d')!;
  drawingContext.textAlign = 'center';
  drawingContext.textBaseline = 'middle';
  drawingContext.font =
    options.font ??
    `700 ${Math.round(height * 0.56)}px "Space Grotesk", Arial, sans-serif`;
  drawingContext.shadowColor = color;
  drawingContext.shadowBlur = height * 0.16;
  drawingContext.fillStyle = color;
  for (let index = 0; index < 3; index++)
    drawingContext.fillText(text, width / 2, height / 2 + 2);
  drawingContext.shadowBlur = 0;
  drawingContext.fillStyle = '#fff6f0';
  drawingContext.globalAlpha = 0.7;
  drawingContext.fillText(text, width / 2, height / 2 + 2);
  drawingContext.globalAlpha = 1;
  if (options.frame) {
    drawingContext.strokeStyle = color;
    drawingContext.lineWidth = 6;
    drawingContext.shadowColor = color;
    drawingContext.shadowBlur = 14;
    drawingContext.strokeRect(10, 10, width - 20, height - 20);
  }
  const timeSeconds = new THREE.CanvasTexture(canvas);
  timeSeconds.colorSpace = THREE.SRGBColorSpace;
  timeSeconds.anisotropy = 4;
  return timeSeconds;
}

/**
 * Build the shared skyline with tiered architecture and controlled distant detail.
 */
export function buildSanFransokyo(sceneKit: SceneKit, sunDir: THREE.Vector3) {
  const random = seeded(2214),
    randomBetween = (startValue: number, endValue: number) =>
      startValue + random() * (endValue - startValue);
  const textures: THREE.Texture[] = [];
  const disposeExtra = () =>
    textures.forEach((timeSeconds) => timeSeconds.dispose());
  const city = new THREE.Group();
  city.name = 'san-fransokyo';
  sceneKit.root.add(city);
  const timeUniforms: { value: number }[] = [];

  // ── Skyline layers. Each is one instanced box mesh with the facade shader.
  const facade = (
    base: string,
    haze: string,
    range: [number, number],
    lit: number,
    cell: [number, number],
  ) => {
    const vector = {
      uBase: { value: new THREE.Color(base) },
      uHaze: { value: new THREE.Color(haze) },
      uHazeRange: { value: new THREE.Vector2(...range) },
      uLit: { value: lit },
      uSun: { value: sunDir.clone() },
      uTime: { value: 0 },
      uCell: { value: new THREE.Vector2(...cell) },
    };
    timeUniforms.push(vector.uTime);
    return sceneKit.ownMaterial(
      new THREE.ShaderMaterial({
        uniforms: vector,
        vertexShader: FACADE_VS,
        fragmentShader: FACADE_FS,
        fog: false,
      }),
    );
  };
  type B = { x: number; z: number; w: number; d: number; h: number };
  const layer = (
    list: B[],
    material: THREE.Material,
    capMat?: THREE.Material,
    caps?: number,
  ) => {
    const mesh = new THREE.InstancedMesh(
        sceneKit.boxGeo,
        material,
        list.length,
      ),
      sceneObject = new THREE.Object3D();
    list.forEach((secondEntry, index) => {
      sceneObject.position.set(
        secondEntry.x,
        secondEntry.h / 2 - 1.2,
        secondEntry.z,
      );
      sceneObject.scale.set(secondEntry.w, secondEntry.h, secondEntry.d);
      sceneObject.updateMatrix();
      mesh.setMatrixAt(index, sceneObject.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    city.add(mesh);
    // Setbacks: a narrower block on top of the taller ones.
    const tops = list.filter(
      (secondEntry) => secondEntry.h > 30 && random() > 0.35,
    );
    if (tops.length) {
      const top = new THREE.InstancedMesh(
        sceneKit.boxGeo,
        material,
        tops.length,
      );
      tops.forEach((secondEntry, index) => {
        const hh = secondEntry.h * randomBetween(0.12, 0.25);
        sceneObject.position.set(
          secondEntry.x + randomBetween(-0.1, 0.1) * secondEntry.w,
          secondEntry.h - 1.2 + hh / 2,
          secondEntry.z,
        );
        sceneObject.scale.set(
          secondEntry.w * randomBetween(0.5, 0.75),
          hh,
          secondEntry.d * randomBetween(0.5, 0.75),
        );
        sceneObject.updateMatrix();
        top.setMatrixAt(index, sceneObject.matrix);
        secondEntry.h += hh;
      });
      top.instanceMatrix.needsUpdate = true;
      top.computeBoundingSphere();
      city.add(top);
    }
    // Pagoda caps: flared four-sided roofs on some of the towers.
    if (capMat && caps) {
      const picked = list.filter(() => random() < caps);
      const roof = sceneKit.ownGeometry(
        new THREE.ConeGeometry(0.75, 0.35, 4, 1),
      );
      roof.rotateY(Math.PI / 4);
      const cap = new THREE.InstancedMesh(roof, capMat, picked.length * 2);
      picked.forEach((secondEntry, index) => {
        for (let segmentIndex = 0; segmentIndex < 2; segmentIndex++) {
          const scaleFactor =
            Math.max(secondEntry.w, secondEntry.d) *
            (1.25 - segmentIndex * 0.35);
          sceneObject.position.set(
            secondEntry.x,
            secondEntry.h -
              1.2 +
              scaleFactor * 0.1 +
              segmentIndex * scaleFactor * 0.32,
            secondEntry.z,
          );
          sceneObject.scale.set(scaleFactor, scaleFactor, scaleFactor);
          sceneObject.updateMatrix();
          cap.setMatrixAt(index * 2 + segmentIndex, sceneObject.matrix);
        }
      });
      cap.instanceMatrix.needsUpdate = true;
      cap.computeBoundingSphere();
      city.add(cap);
    }
    return list;
  };

  // Far: a pale wall of towers fading into the sunset.
  const far: B[] = [];
  for (let xPosition = -300; xPosition < 300; xPosition += randomBetween(7, 14))
    far.push({
      x: xPosition,
      z: randomBetween(-300, -270),
      w: randomBetween(8, 16),
      d: 10,
      h:
        randomBetween(12, 34) +
        (Math.abs(xPosition - 40) < 90 ? randomBetween(10, 40) : 0),
    });
  layer(far, facade('#6c7190', '#aeaab6', [180, 330], 0.35, [2.6, 2.2]));
  // Mid: downtown, the tall cluster right of the bridge, pagoda caps on some.
  const midMat = facade('#3a3e58', '#9e9cac', [140, 300], 0.75, [1.9, 1.6]);
  const mid: B[] = [];
  for (
    let xPosition2 = -200;
    xPosition2 < 220;
    xPosition2 += randomBetween(5, 10)
  ) {
    const downtown = Math.exp(-Math.pow((xPosition2 - 55) / 55, 2));
    mid.push({
      x: xPosition2,
      z: randomBetween(-215, -185),
      w: randomBetween(5, 10),
      d: randomBetween(5, 9),
      h: randomBetween(10, 24) + downtown * randomBetween(20, 62),
    });
  }
  layer(mid, midMat, sceneKit.standard('#2b2436', 0.9, 0), 0.14);
  // Near: the waterfront: low blocks, warehouses on the piers.
  const nearMat = facade('#2b2e42', '#8f8e9f', [90, 240], 0.9, [1.5, 1.3]);
  const near: B[] = [];
  for (
    let xPosition3 = 30;
    xPosition3 < 230;
    xPosition3 += randomBetween(5, 11)
  )
    near.push({
      x: xPosition3,
      z: randomBetween(-150, -132),
      w: randomBetween(5, 11),
      d: randomBetween(5, 10),
      h: randomBetween(5, 16),
    });
  for (
    let xPosition4 = -230;
    xPosition4 < -90;
    xPosition4 += randomBetween(6, 12)
  )
    near.push({
      x: xPosition4,
      z: randomBetween(-175, -150),
      w: randomBetween(5, 10),
      d: randomBetween(5, 9),
      h: randomBetween(4, 12),
    });
  layer(near, nearMat);
  // Piers below the waterfront.
  for (const xPosition5 of [45, 85, 125, 170])
    sceneKit.box(
      { p: [xPosition5, -1, -122], s: [9, 0.8, 22] },
      sceneKit.standard('#3a3242', 0.9, 0),
      city,
    );

  // The tiered pyramid tower downtown, pagoda tiers stacked up a tapering spire.
  const spire = new THREE.Group();
  spire.position.set(62, -1.2, -196);
  city.add(spire);
  const spireMat = sceneKit.standard('#45405e', 0.7, 0.2),
    tierMat = sceneKit.standard('#2a2234', 0.8, 0.1);
  sceneKit.mesh(
    new THREE.ConeGeometry(9, 96, 4, 1, false),
    spireMat,
    { p: [0, 48, 0], r: [0, Math.PI / 4, 0] },
    spire,
  );
  for (let index2 = 0; index2 < 6; index2++) {
    const yPosition = 18 + index2 * 12,
      scaleFactor2 = 13 - index2 * 1.6;
    sceneKit.mesh(
      new THREE.ConeGeometry(scaleFactor2, 3.2, 4, 1, true),
      tierMat,
      { p: [0, yPosition, 0], r: [0, Math.PI / 4, 0] },
      spire,
    );
  }
  // A round tower with a disc crown beside it, and a needle mast.
  const drum = new THREE.Group();
  drum.position.set(92, -1.2, -204);
  city.add(drum);
  sceneKit.mesh(
    new THREE.CylinderGeometry(5.5, 6.5, 70, 20),
    spireMat,
    { p: [0, 35, 0] },
    drum,
  );
  sceneKit.mesh(
    new THREE.CylinderGeometry(10, 8, 2.4, 24),
    tierMat,
    { p: [0, 71, 0] },
    drum,
  );
  sceneKit.mesh(
    new THREE.CylinderGeometry(0.3, 0.5, 22, 6),
    tierMat,
    { p: [0, 83, 0] },
    drum,
  );

  // ── The bridge: deck and truss, two vermilion towers with pagoda roofs, cables and hangers.
  const bridge = new THREE.Group();
  bridge.position.set(-30, -1.2, -112);
  bridge.rotation.y = 0.1;
  city.add(bridge);
  const vermilion = sceneKit.standard('#b4473a', 0.55, 0.2),
    deep = sceneKit.standard('#7a2d27', 0.7, 0.1),
    deckMat = sceneKit.standard('#5a4a4a', 0.8, 0.1),
    roofMat = sceneKit.standard('#2c2026', 0.7, 0.1);
  sceneKit.box({ p: [0, 9, 0], s: [190, 0.8, 4.4] }, deckMat, bridge);
  sceneKit.box({ p: [0, 8.1, 0], s: [190, 1.2, 3.6] }, deep, bridge);
  for (let xPosition6 = -94; xPosition6 <= 94; xPosition6 += 4)
    sceneKit.box(
      {
        p: [xPosition6, 8.4, 0],
        s: [0.25, 1.6, 3.8],
        r: [0, 0, 0.5 * (xPosition6 % 8 === 0 ? 1 : -1)],
      },
      deep,
      bridge,
    );
  for (const xPosition7 of [-42, 42]) {
    for (const side of [-1, 1])
      sceneKit.box(
        {
          p: [xPosition7, 22, side * 2.4],
          s: [1.6, 46, 1.4],
          r: [side * 0.015, 0, 0],
        },
        vermilion,
        bridge,
      );
    // Crossbeams with upturned ends, like a gate's top beam.
    for (const yPosition2 of [16, 30, 42]) {
      sceneKit.box(
        { p: [xPosition7, yPosition2, 0], s: [1.8, 1.3, 7.2] },
        vermilion,
        bridge,
      );
      for (const side of [-1, 1])
        sceneKit.box(
          {
            p: [xPosition7, yPosition2 + 0.5, side * 3.9],
            s: [1.8, 0.6, 1.4],
            r: [-side * 0.35, 0, 0],
          },
          vermilion,
          bridge,
        );
    }
    // Pagoda roof: two flared tiers and a finial.
    sceneKit.mesh(
      new THREE.ConeGeometry(6, 2.6, 4, 1),
      roofMat,
      { p: [xPosition7, 46, 0], r: [0, Math.PI / 4, 0] },
      bridge,
    );
    sceneKit.mesh(
      new THREE.ConeGeometry(4.2, 2.2, 4, 1),
      roofMat,
      { p: [xPosition7, 48.4, 0], r: [0, Math.PI / 4, 0] },
      bridge,
    );
    sceneKit.mesh(
      new THREE.CylinderGeometry(0.15, 0.3, 3, 6),
      sceneKit.standard('#c9a050', 0.3, 0.8),
      { p: [xPosition7, 50.6, 0] },
      bridge,
    );
  }
  // Main cables and hangers.
  const cableY = (xPosition8: number) =>
    Math.abs(xPosition8) <= 42
      ? 10 + 34 * Math.pow(Math.abs(xPosition8) / 42, 2)
      : 44 - (Math.abs(xPosition8) - 42) * 0.65;
  for (const side of [-1, 1]) {
    const points: THREE.Vector3[] = [];
    for (let index3 = 0; index3 <= 80; index3++) {
      const xPosition9 = -95 + (index3 * 190) / 80;
      points.push(
        new THREE.Vector3(
          xPosition9,
          Math.max(9.5, cableY(xPosition9)),
          side * 2.2,
        ),
      );
    }
    sceneKit.line(points, '#c2564a', 0.95, bridge);
    for (let xPosition10 = -40; xPosition10 <= 40; xPosition10 += 3)
      sceneKit.line(
        [
          new THREE.Vector3(xPosition10, 9.4, side * 2.2),
          new THREE.Vector3(xPosition10, cableY(xPosition10), side * 2.2),
        ],
        '#a54a40',
        0.6,
        bridge,
      );
  }

  // ── Lights: deck lamps, aviation blinkers on the tops, house lights on the hills.
  const dots = (
    points2: THREE.Vector3[],
    colors: THREE.Color[],
    size: number,
    blink: boolean,
    parent: THREE.Object3D = city,
  ) => {
    const geometry = sceneKit
      .ownGeometry(new THREE.BufferGeometry())
      .setFromPoints(points2);
    geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(
        colors.flatMap((color) => [color.r, color.g, color.b]),
        3,
      ),
    );
    geometry.setAttribute(
      'aSeed',
      new THREE.Float32BufferAttribute(
        points2.map(() => random()),
        1,
      ),
    );
    const progress = {
      uTime: { value: 0 },
      uSize: { value: size },
      uBlink: { value: blink ? 1 : 0 },
    };
    timeUniforms.push(progress.uTime);
    const material = new THREE.Points(
      geometry,
      sceneKit.ownMaterial(
        new THREE.ShaderMaterial({
          uniforms: progress,
          vertexShader: DOTS_VS,
          fragmentShader: DOTS_FS,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
        }),
      ),
    );
    material.frustumCulled = false;
    parent.add(material);
    return material;
  };
  const warm = new THREE.Color('#ffd49a'),
    red = new THREE.Color('#ff3a2a');
  const deckLights: THREE.Vector3[] = [];
  for (let xPosition11 = -92; xPosition11 <= 92; xPosition11 += 5)
    for (const scaleFactor3 of [-1, 1])
      deckLights.push(new THREE.Vector3(xPosition11, 10, scaleFactor3 * 2.3));
  dots(
    deckLights,
    deckLights.map(() => warm),
    0.5,
    false,
    bridge,
  );
  bridge.updateMatrix();
  const blinkers: THREE.Vector3[] = [];
  for (const xPosition12 of [-42, 42])
    blinkers.push(
      new THREE.Vector3(xPosition12, 52.4, 0).applyMatrix4(bridge.matrix),
    );
  for (const secondEntry2 of mid.filter((secondEntry) => secondEntry.h > 40))
    blinkers.push(
      new THREE.Vector3(secondEntry2.x, secondEntry2.h - 0.6, secondEntry2.z),
    );
  blinkers.push(
    new THREE.Vector3(62, 95, -196),
    new THREE.Vector3(92, 94.5, -204),
  );
  dots(
    blinkers,
    blinkers.map(() => red),
    1.1,
    true,
  );
  // Hills on the left with the houses' lights scattered up them.
  const hillMat = sceneKit.standard('#3c3550', 0.95, 0);
  for (let index4 = 0; index4 < 7; index4++)
    sceneKit.mesh(
      sceneKit.sphereGeo,
      hillMat,
      {
        p: [-260 + index4 * 34, -14, -238 + randomBetween(-10, 10)],
        s: [38, 30 + randomBetween(0, 16), 22],
      },
      city,
    );
  const houses: THREE.Vector3[] = [];
  for (let index5 = 0; index5 < 260; index5++) {
    const xPosition13 = randomBetween(-280, -50),
      zPosition = randomBetween(-232, -222),
      yPosition3 = Math.max(
        0,
        18 *
          Math.exp(-Math.pow((xPosition13 + 170) / 80, 2)) *
          randomBetween(0.1, 1.05),
      );
    houses.push(new THREE.Vector3(xPosition13, yPosition3, zPosition));
  }
  dots(
    houses,
    houses.map(() => (random() > 0.8 ? new THREE.Color('#bfe2ff') : warm)),
    0.55,
    false,
  );

  // ── Neon signs on the waterfront and the downtown roofs.
  const sign = (
    text: string,
    color: string,
    points2: [number, number, number],
    width: number,
    options: Parameters<typeof neon>[2] = {},
    flicker = false,
  ) => {
    const texture = neon(text, color, options);
    textures.push(texture);
    const material = sceneKit.ownMaterial(
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: false,
      }),
    );
    const height = (width * (options.h ?? 128)) / (options.w ?? 512);
    const material2 = sceneKit.mesh(
      sceneKit.ownGeometry(new THREE.PlaneGeometry(width, height)),
      material,
      { p: points2 },
      city,
    );
    return { m: material2, mat: material, flicker };
  };
  const signs = [
    sign('SAN FRANSOKYO', '#ff6a4a', [-150, 22, -224], 58, { w: 1024, h: 128 }),
    sign(
      'LUCKY CAT CAFÉ',
      '#ff9a3c',
      [72, 11, -129],
      15,
      { frame: true },
      true,
    ),
    sign('ラーメン', '#5ef0ff', [112, 13, -131], 9, {
      w: 512,
      h: 160,
      font: '700 110px "Noto Sans JP", "Yu Gothic", sans-serif',
    }),
    sign('SFIT', '#9fd7ff', [30, 46, -186], 12, { w: 512, h: 160 }),
    sign('KREI TECH', '#c79bff', [98, 66, -197], 16, { w: 768, h: 128 }),
    sign(
      '桜',
      '#ff7fb3',
      [150, 15, -136],
      4.5,
      {
        w: 256,
        h: 256,
        font: '700 200px "Noto Sans JP", "Yu Gothic", sans-serif',
      },
      true,
    ),
    sign('FERRY', '#ffd27a', [48, 4.5, -111], 8, {}),
  ];

  // ── The wind turbines that ride over the city: white blimps with a rotor, tethered down.
  const turbineMat = sceneKit.standard('#e9e2dc', 0.55, 0.15),
    ringMat = sceneKit.standard('#9a948e', 0.4, 0.6);
  const turbines: {
    g: THREE.Group;
    rotor: THREE.Group;
    base: THREE.Vector3;
    ph: number;
  }[] = [];
  for (const [xPosition14, yPosition4, zPosition2, state] of [
    [-90, 70, -190, 1],
    [-10, 88, -240, 1.3],
    [70, 76, -170, 0.9],
    [150, 92, -230, 1.2],
    [-180, 82, -250, 1.1],
  ] as const) {
    const group = new THREE.Group();
    group.position.set(xPosition14, yPosition4, zPosition2);
    group.scale.setScalar(state);
    group.rotation.y = randomBetween(-0.4, 0.4);
    city.add(group);
    sceneKit.mesh(
      sceneKit.sphereGeo,
      turbineMat,
      { p: [0, 0, 0], s: [9, 3.2, 3.2] },
      group,
    );
    for (const radius of [0, Math.PI / 2])
      sceneKit.box(
        { p: [-7.2, 0, 0], s: [2.6, 0.25, 5.4], r: [radius, 0, 0] },
        turbineMat,
        group,
      );
    const rotor = new THREE.Group();
    rotor.position.x = 8.6;
    group.add(rotor);
    sceneKit.mesh(
      new THREE.TorusGeometry(3.6, 0.25, 8, 28),
      ringMat,
      { p: [0, 0, 0], r: [0, Math.PI / 2, 0] },
      rotor,
    );
    for (let index6 = 0; index6 < 3; index6++)
      sceneKit.box(
        {
          p: [0, 0, 0],
          s: [0.2, 6.6, 0.7],
          r: [(index6 * Math.PI * 2) / 3, 0, 0],
        },
        ringMat,
        rotor,
      );
    sceneKit.line(
      [
        new THREE.Vector3(xPosition14, yPosition4 - 3 * state, zPosition2),
        new THREE.Vector3(
          xPosition14 + randomBetween(-8, 8),
          -1,
          zPosition2 + 10,
        ),
      ],
      '#5a5266',
      0.5,
      city,
    );
    turbines.push({
      g: group,
      rotor,
      base: group.position.clone(),
      ph: random() * 6,
    });
  }

  // ── The bay: a ferry crossing with lit windows, sailboats with mast lights, a buoy.
  const boats: { g: THREE.Group; speed: number; x0: number; bob: number }[] =
    [];
  const hullMat = sceneKit.standard('#e8e2d8', 0.6, 0.1),
    darkHull = sceneKit.standard('#2a2a36', 0.7, 0.1);
  const winMat = sceneKit.basic('#ffd08a', 1.4);
  {
    const group2 = new THREE.Group();
    group2.position.set(-60, -1.1, -62);
    city.add(group2);
    sceneKit.box({ p: [0, 0.4, 0], s: [14, 1.4, 4.2] }, darkHull, group2);
    sceneKit.box({ p: [0, 1.6, 0], s: [11, 1.2, 3.6] }, hullMat, group2);
    sceneKit.box({ p: [-1, 2.7, 0], s: [6.5, 1, 3] }, hullMat, group2);
    for (let index7 = 0; index7 < 8; index7++)
      sceneKit.box(
        { p: [-4.6 + index7 * 1.3, 1.65, 1.82], s: [0.7, 0.45, 0.04] },
        winMat,
        group2,
      );
    sceneKit.box(
      { p: [2, 3.6, 0], s: [0.6, 1.6, 0.6] },
      sceneKit.standard('#b4473a', 0.6, 0.2),
      group2,
    );
    sceneKit.mesh(
      sceneKit.sphereGeo,
      sceneKit.basic('#ffe2b0', 2),
      { p: [2, 4.6, 0], s: [0.25, 0.25, 0.25] },
      group2,
    );
    boats.push({ g: group2, speed: 2.2, x0: -60, bob: 0 });
  }
  for (const [xPosition15, zPosition3] of [
    [-28, -46],
    [20, -78],
    [-95, -88],
    [95, -58],
    [140, -96],
  ] as const) {
    const group3 = new THREE.Group();
    group3.position.set(xPosition15, -1.15, zPosition3);
    group3.rotation.y = randomBetween(0, Math.PI * 2);
    city.add(group3);
    sceneKit.box({ p: [0, 0.25, 0], s: [4, 0.6, 1.3] }, hullMat, group3);
    sceneKit.box({ p: [0, 3.2, 0], s: [0.1, 5.6, 0.1] }, darkHull, group3);
    const sail = new THREE.Shape();
    sail.moveTo(0, 0);
    sail.lineTo(0, 5);
    sail.lineTo(2.4, 0.3);
    sail.closePath();
    sceneKit.mesh(
      new THREE.ShapeGeometry(sail),
      sceneKit.ownMaterial(
        new THREE.MeshStandardMaterial({
          color: '#f3ece2',
          roughness: 0.8,
          side: THREE.DoubleSide,
        }),
      ),
      { p: [0.1, 0.6, 0] },
      group3,
    );
    boats.push({
      g: group3,
      speed: randomBetween(0.15, 0.4),
      x0: xPosition15,
      bob: random() * 6,
    });
  }
  // Reflected light streaks under the lit things on the water.
  const streakMat = sceneKit.ownMaterial(
    new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#ffd2a4') },
        uOpacity: { value: 0.5 },
      },
      vertexShader: UV_VS,
      fragmentShader: `varying vec2 vUv;uniform vec3 uColor;uniform float uOpacity;void main(){float a=pow(vUv.y,1.5)*smoothstep(0.,.5,vUv.x)*smoothstep(1.,.5,vUv.x)*uOpacity;gl_FragColor=vec4(uColor*a,a);}`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  for (const [xPosition16, zPosition4, width2, entry] of [
    [-30, -110, 3, 40],
    [72, -128, 2, 22],
    [112, -130, 1.5, 18],
    [-150, -220, 6, 50],
    [62, -190, 2.5, 50],
  ] as const) {
    sceneKit.mesh(
      sceneKit.ownGeometry(new THREE.PlaneGeometry(width2, entry)),
      streakMat,
      {
        p: [xPosition16, -1.15, zPosition4 + entry / 2],
        r: [-Math.PI / 2, 0, 0],
      },
      city,
    );
  }

  // ── The sun on the horizon, and haze between the layers.
  const sunAt = sunDir.clone().normalize().multiplyScalar(360);
  const sunMat = sceneKit.ownMaterial(
    new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: UV_VS,
      fragmentShader:
        'varying vec2 vUv;void main(){vec2 p=vUv-.5;float d=length(p)*2.;float a=smoothstep(.32,.28,d)+pow(max(0.,1.-d),3.)*.55;vec3 c=mix(vec3(1.,.6,.35),vec3(1.,.95,.8),smoothstep(.3,0.,d));gl_FragColor=vec4(c*a,a);}',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  const sun = sceneKit.mesh(
    sceneKit.ownGeometry(new THREE.PlaneGeometry(90, 90)),
    sunMat,
    { p: [sunAt.x, Math.max(6, sunAt.y), sunAt.z] },
    city,
  );
  sun.lookAt(0, 4, 0);
  sun.renderOrder = -1;
  const haze = (
    zPosition5: number,
    color: string,
    opacity: number,
    height: number,
  ) => {
    const color2 = sceneKit.ownMaterial(
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uOpacity: { value: opacity },
        },
        vertexShader: UV_VS,
        fragmentShader: HAZE_FS,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    sceneKit.mesh(
      sceneKit.ownGeometry(new THREE.PlaneGeometry(900, height)),
      color2,
      { p: [0, height / 2 - 1.5, zPosition5] },
      city,
    );
  };
  haze(-128, '#bab4ba', 0.3, 26);
  haze(-178, '#b5b0b9', 0.4, 40);
  haze(-238, '#bfb7ba', 0.5, 60);
  haze(-305, '#cbc0bc', 0.55, 80);

  return {
    update(timeSeconds: number, deltaSeconds: number) {
      for (const progress of timeUniforms) progress.value = timeSeconds;
      for (const tb of turbines) {
        tb.rotor.rotation.x += deltaSeconds * 1.6;
        tb.g.position.y = tb.base.y + Math.sin(timeSeconds * 0.3 + tb.ph) * 1.2;
        tb.g.rotation.z = Math.sin(timeSeconds * 0.25 + tb.ph) * 0.03;
      }
      for (const group4 of boats) {
        if (group4.speed > 1) {
          group4.g.position.x =
            ((group4.x0 + timeSeconds * group4.speed + 160) % 320) - 160;
        }
        group4.g.position.y =
          -1.15 + Math.sin(timeSeconds * 1.3 + group4.bob) * 0.08;
        group4.g.rotation.z = Math.sin(timeSeconds * 1.1 + group4.bob) * 0.04;
      }
      for (const sg of signs)
        if (sg.flicker)
          sg.mat.opacity =
            Math.sin(timeSeconds * 13) * Math.sin(timeSeconds * 3.1) > 0.85
              ? 0.35
              : 1;
    },
    dispose: disposeExtra,
  };
}
