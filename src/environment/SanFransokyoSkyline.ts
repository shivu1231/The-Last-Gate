import * as T from 'three';
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
vec3 col=uBase*(.6+.3*n.y)+vec3(1.,.55,.35)*sunSide*.22;
col=mix(col,lamp*1.35*flick,win*on*(1.-roof));
float d=length(vWorld-cameraPosition);
float haze=smoothstep(uHazeRange.x,uHazeRange.y,d);
haze=clamp(haze+(1.-smoothstep(-1.,22.,h))*.35,0.,1.);
col=mix(col,uHaze,haze*.82);
gl_FragColor=vec4(col,1.);}`;
// A vertical band of haze: thick at the water, gone by the top.
const HAZE_FS = `varying vec2 vUv;uniform vec3 uColor;uniform float uOpacity;void main(){float a=pow(1.-vUv.y,2.2)*uOpacity*smoothstep(0.,.08,vUv.x)*smoothstep(1.,.92,vUv.x);gl_FragColor=vec4(uColor,a);}`;
const UV_VS = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
// Light points (aviation lights, house lights, deck lamps): round, soft, optionally blinking.
const DOTS_VS = `attribute float aSeed;uniform float uTime;uniform float uSize;uniform float uBlink;varying float vA;varying vec3 vC;attribute vec3 color;
void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;
float b=uBlink>0.?step(.55,fract(uTime*.8+aSeed)):1.;vA=b*(.75+.25*sin(uTime*2.+aSeed*30.));vC=color;
gl_PointSize=uSize*(300./-mv.z);}`;
const DOTS_FS = `varying float vA;varying vec3 vC;void main(){vec2 p=gl_PointCoord-.5;float d=length(p);float a=smoothstep(.5,.0,d);gl_FragColor=vec4(vC*a*vA*1.6,a*vA);}`;

/** A neon sign: glowing text drawn once into a canvas. */
function neon(text: string, color: string, opts: { w?: number; h?: number; font?: string; frame?: boolean } = {}) {
  const w = opts.w ?? 512, h = opts.h ?? 128;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = opts.font ?? `700 ${Math.round(h * .56)}px "Space Grotesk", Arial, sans-serif`;
  x.shadowColor = color; x.shadowBlur = h * .16; x.fillStyle = color;
  for (let i = 0; i < 3; i++) x.fillText(text, w / 2, h / 2 + 2);
  x.shadowBlur = 0; x.fillStyle = '#fff6f0'; x.globalAlpha = .7; x.fillText(text, w / 2, h / 2 + 2); x.globalAlpha = 1;
  if (opts.frame) { x.strokeStyle = color; x.lineWidth = 6; x.shadowColor = color; x.shadowBlur = 14; x.strokeRect(10, 10, w - 20, h - 20); }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function buildSanFransokyo(k: SceneKit, sunDir: T.Vector3) {
  const random = seeded(2214), rand = (a: number, b: number) => a + random() * (b - a);
  const textures: T.Texture[] = [];
  const disposeExtra = () => textures.forEach(t => t.dispose());
  const city = new T.Group(); city.name = 'san-fransokyo'; k.root.add(city);
  const timeUniforms: { value: number }[] = [];

  // ── Skyline layers. Each is one instanced box mesh with the facade shader.
  const facade = (base: string, haze: string, range: [number, number], lit: number, cell: [number, number]) => {
    const u = { uBase: { value: new T.Color(base) }, uHaze: { value: new T.Color(haze) }, uHazeRange: { value: new T.Vector2(...range) }, uLit: { value: lit }, uSun: { value: sunDir.clone() }, uTime: { value: 0 }, uCell: { value: new T.Vector2(...cell) } };
    timeUniforms.push(u.uTime);
    return k.ownMaterial(new T.ShaderMaterial({ uniforms: u, vertexShader: FACADE_VS, fragmentShader: FACADE_FS, fog: false }));
  };
  type B = { x: number; z: number; w: number; d: number; h: number };
  const layer = (list: B[], mat: T.Material, capMat?: T.Material, caps?: number) => {
    const mesh = new T.InstancedMesh(k.boxGeo, mat, list.length), m = new T.Object3D();
    list.forEach((b, i) => { m.position.set(b.x, b.h / 2 - 1.2, b.z); m.scale.set(b.w, b.h, b.d); m.updateMatrix(); mesh.setMatrixAt(i, m.matrix); });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); city.add(mesh);
    // Setbacks: a narrower block on top of the taller ones.
    const tops = list.filter(b => b.h > 30 && random() > .35);
    if (tops.length) {
      const top = new T.InstancedMesh(k.boxGeo, mat, tops.length);
      tops.forEach((b, i) => { const hh = b.h * rand(.12, .25); m.position.set(b.x + rand(-.1, .1) * b.w, b.h - 1.2 + hh / 2, b.z); m.scale.set(b.w * rand(.5, .75), hh, b.d * rand(.5, .75)); m.updateMatrix(); top.setMatrixAt(i, m.matrix); b.h += hh; });
      top.instanceMatrix.needsUpdate = true; top.computeBoundingSphere(); city.add(top);
    }
    // Pagoda caps: flared four-sided roofs on some of the towers.
    if (capMat && caps) {
      const picked = list.filter(() => random() < caps);
      const roof = k.ownGeometry(new T.ConeGeometry(.75, .35, 4, 1)); roof.rotateY(Math.PI / 4);
      const cap = new T.InstancedMesh(roof, capMat, picked.length * 2);
      picked.forEach((b, i) => {
        for (let j = 0; j < 2; j++) { const s = Math.max(b.w, b.d) * (1.25 - j * .35); m.position.set(b.x, b.h - 1.2 + s * .1 + j * s * .32, b.z); m.scale.set(s, s, s); m.updateMatrix(); cap.setMatrixAt(i * 2 + j, m.matrix); }
      });
      cap.instanceMatrix.needsUpdate = true; cap.computeBoundingSphere(); city.add(cap);
    }
    return list;
  };

  // Far: a pale wall of towers fading into the sunset.
  const far: B[] = [];
  for (let x = -300; x < 300; x += rand(7, 14)) far.push({ x, z: rand(-300, -270), w: rand(8, 16), d: 10, h: rand(12, 34) + (Math.abs(x - 40) < 90 ? rand(10, 40) : 0) });
  layer(far, facade('#7a6a92', '#d99a8c', [180, 330], .35, [2.6, 2.2]));
  // Mid: downtown, the tall cluster right of the bridge, pagoda caps on some.
  const midMat = facade('#3f3c5a', '#c98c8c', [140, 300], .75, [1.9, 1.6]);
  const mid: B[] = [];
  for (let x = -200; x < 220; x += rand(5, 10)) {
    const downtown = Math.exp(-Math.pow((x - 55) / 55, 2));
    mid.push({ x, z: rand(-215, -185), w: rand(5, 10), d: rand(5, 9), h: rand(10, 24) + downtown * rand(20, 62) });
  }
  layer(mid, midMat, k.standard('#2b2436', .9, 0), .14);
  // Near: the waterfront: low blocks, warehouses on the piers.
  const nearMat = facade('#2e2c42', '#b88282', [90, 240], .9, [1.5, 1.3]);
  const near: B[] = [];
  for (let x = 30; x < 230; x += rand(5, 11)) near.push({ x, z: rand(-150, -132), w: rand(5, 11), d: rand(5, 10), h: rand(5, 16) });
  for (let x = -230; x < -90; x += rand(6, 12)) near.push({ x, z: rand(-175, -150), w: rand(5, 10), d: rand(5, 9), h: rand(4, 12) });
  layer(near, nearMat);
  // Piers below the waterfront.
  for (const x of [45, 85, 125, 170]) k.box({ p: [x, -1, -122], s: [9, .8, 22] }, k.standard('#3a3242', .9, 0), city);

  // The tiered pyramid tower downtown, pagoda tiers stacked up a tapering spire.
  const spire = new T.Group(); spire.position.set(62, -1.2, -196); city.add(spire);
  const spireMat = k.standard('#45405e', .7, .2), tierMat = k.standard('#2a2234', .8, .1);
  k.mesh(new T.ConeGeometry(9, 96, 4, 1, false), spireMat, { p: [0, 48, 0], r: [0, Math.PI / 4, 0] }, spire);
  for (let i = 0; i < 6; i++) { const y = 18 + i * 12, s = 13 - i * 1.6; k.mesh(new T.ConeGeometry(s, 3.2, 4, 1, true), tierMat, { p: [0, y, 0], r: [0, Math.PI / 4, 0] }, spire); }
  // A round tower with a disc crown beside it, and a needle mast.
  const drum = new T.Group(); drum.position.set(92, -1.2, -204); city.add(drum);
  k.mesh(new T.CylinderGeometry(5.5, 6.5, 70, 20), spireMat, { p: [0, 35, 0] }, drum);
  k.mesh(new T.CylinderGeometry(10, 8, 2.4, 24), tierMat, { p: [0, 71, 0] }, drum);
  k.mesh(new T.CylinderGeometry(.3, .5, 22, 6), tierMat, { p: [0, 83, 0] }, drum);

  // ── The bridge: deck and truss, two vermilion towers with pagoda roofs, cables and hangers.
  const bridge = new T.Group(); bridge.position.set(-30, -1.2, -112); bridge.rotation.y = .1; city.add(bridge);
  const vermilion = k.standard('#b4473a', .55, .2), deep = k.standard('#7a2d27', .7, .1), deckMat = k.standard('#5a4a4a', .8, .1), roofMat = k.standard('#2c2026', .7, .1);
  k.box({ p: [0, 9, 0], s: [190, .8, 4.4] }, deckMat, bridge);
  k.box({ p: [0, 8.1, 0], s: [190, 1.2, 3.6] }, deep, bridge);
  for (let x = -94; x <= 94; x += 4) k.box({ p: [x, 8.4, 0], s: [.25, 1.6, 3.8], r: [0, 0, .5 * (x % 8 === 0 ? 1 : -1)] }, deep, bridge);
  for (const x of [-42, 42]) {
    for (const side of [-1, 1]) k.box({ p: [x, 22, side * 2.4], s: [1.6, 46, 1.4], r: [side * .015, 0, 0] }, vermilion, bridge);
    // Crossbeams with upturned ends, like a gate's top beam.
    for (const y of [16, 30, 42]) {
      k.box({ p: [x, y, 0], s: [1.8, 1.3, 7.2] }, vermilion, bridge);
      for (const side of [-1, 1]) k.box({ p: [x, y + .5, side * 3.9], s: [1.8, .6, 1.4], r: [-side * .35, 0, 0] }, vermilion, bridge);
    }
    // Pagoda roof: two flared tiers and a finial.
    k.mesh(new T.ConeGeometry(6, 2.6, 4, 1), roofMat, { p: [x, 46, 0], r: [0, Math.PI / 4, 0] }, bridge);
    k.mesh(new T.ConeGeometry(4.2, 2.2, 4, 1), roofMat, { p: [x, 48.4, 0], r: [0, Math.PI / 4, 0] }, bridge);
    k.mesh(new T.CylinderGeometry(.15, .3, 3, 6), k.standard('#c9a050', .3, .8), { p: [x, 50.6, 0] }, bridge);
  }
  // Main cables and hangers.
  const cableY = (x: number) => Math.abs(x) <= 42 ? 10 + 34 * Math.pow(Math.abs(x) / 42, 2) : 44 - (Math.abs(x) - 42) * .65;
  for (const side of [-1, 1]) {
    const pts: T.Vector3[] = []; for (let i = 0; i <= 80; i++) { const x = -95 + i * 190 / 80; pts.push(new T.Vector3(x, Math.max(9.5, cableY(x)), side * 2.2)); }
    k.line(pts, '#c2564a', .95, bridge);
    for (let x = -40; x <= 40; x += 3) k.line([new T.Vector3(x, 9.4, side * 2.2), new T.Vector3(x, cableY(x), side * 2.2)], '#a54a40', .6, bridge);
  }

  // ── Lights: deck lamps, aviation blinkers on the tops, house lights on the hills.
  const dots = (pts: T.Vector3[], colors: T.Color[], size: number, blink: boolean, parent: T.Object3D = city) => {
    const g = k.ownGeometry(new T.BufferGeometry()).setFromPoints(pts);
    g.setAttribute('color', new T.Float32BufferAttribute(colors.flatMap(c => [c.r, c.g, c.b]), 3));
    g.setAttribute('aSeed', new T.Float32BufferAttribute(pts.map(() => random()), 1));
    const u = { uTime: { value: 0 }, uSize: { value: size }, uBlink: { value: blink ? 1 : 0 } }; timeUniforms.push(u.uTime);
    const p = new T.Points(g, k.ownMaterial(new T.ShaderMaterial({ uniforms: u, vertexShader: DOTS_VS, fragmentShader: DOTS_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false })));
    p.frustumCulled = false; parent.add(p); return p;
  };
  const warm = new T.Color('#ffd49a'), red = new T.Color('#ff3a2a');
  const deckLights: T.Vector3[] = []; for (let x = -92; x <= 92; x += 5) for (const s of [-1, 1]) deckLights.push(new T.Vector3(x, 10, s * 2.3));
  dots(deckLights, deckLights.map(() => warm), .5, false, bridge);
  bridge.updateMatrix();
  const blinkers: T.Vector3[] = [];
  for (const x of [-42, 42]) blinkers.push(new T.Vector3(x, 52.4, 0).applyMatrix4(bridge.matrix));
  for (const b of mid.filter(b => b.h > 40)) blinkers.push(new T.Vector3(b.x, b.h - .6, b.z));
  blinkers.push(new T.Vector3(62, 95, -196), new T.Vector3(92, 94.5, -204));
  dots(blinkers, blinkers.map(() => red), 1.1, true);
  // Hills on the left with the houses' lights scattered up them.
  const hillMat = k.standard('#3c3550', .95, 0);
  for (let i = 0; i < 7; i++) k.mesh(k.sphereGeo, hillMat, { p: [-260 + i * 34, -14, -238 + rand(-10, 10)], s: [38, 30 + rand(0, 16), 22] }, city);
  const houses: T.Vector3[] = [];
  for (let i = 0; i < 260; i++) { const x = rand(-280, -50), z = rand(-232, -222), y = Math.max(0, 18 * Math.exp(-Math.pow((x + 170) / 80, 2)) * rand(.1, 1.05)); houses.push(new T.Vector3(x, y, z)); }
  dots(houses, houses.map(() => (random() > .8 ? new T.Color('#bfe2ff') : warm)), .55, false);

  // ── Neon signs on the waterfront and the downtown roofs.
  const sign = (text: string, color: string, p: [number, number, number], w: number, opts: Parameters<typeof neon>[2] = {}, flicker = false) => {
    const tex = neon(text, color, opts); textures.push(tex);
    const mat = k.ownMaterial(new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, fog: false }));
    const h = w * (opts.h ?? 128) / (opts.w ?? 512);
    const m = k.mesh(k.ownGeometry(new T.PlaneGeometry(w, h)), mat, { p }, city);
    return { m, mat, flicker };
  };
  const signs = [
    sign('SAN FRANSOKYO', '#ff6a4a', [-150, 22, -224], 58, { w: 1024, h: 128 }),
    sign('LUCKY CAT CAFÉ', '#ff9a3c', [72, 11, -129], 15, { frame: true }, true),
    sign('ラーメン', '#5ef0ff', [112, 13, -131], 9, { w: 512, h: 160, font: '700 110px "Noto Sans JP", "Yu Gothic", sans-serif' }),
    sign('SFIT', '#9fd7ff', [30, 46, -186], 12, { w: 512, h: 160 }),
    sign('KREI TECH', '#c79bff', [98, 66, -197], 16, { w: 768, h: 128 }),
    sign('桜', '#ff7fb3', [150, 15, -136], 4.5, { w: 256, h: 256, font: '700 200px "Noto Sans JP", "Yu Gothic", sans-serif' }, true),
    sign('FERRY', '#ffd27a', [48, 4.5, -111], 8, {}),
  ];

  // ── The wind turbines that ride over the city: white blimps with a rotor, tethered down.
  const turbineMat = k.standard('#e9e2dc', .55, .15), ringMat = k.standard('#9a948e', .4, .6);
  const turbines: { g: T.Group; rotor: T.Group; base: T.Vector3; ph: number }[] = [];
  for (const [x, y, z, s] of [[-90, 70, -190, 1], [-10, 88, -240, 1.3], [70, 76, -170, .9], [150, 92, -230, 1.2], [-180, 82, -250, 1.1]] as const) {
    const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(s); g.rotation.y = rand(-.4, .4); city.add(g);
    k.mesh(k.sphereGeo, turbineMat, { p: [0, 0, 0], s: [9, 3.2, 3.2] }, g);
    for (const r of [0, Math.PI / 2]) k.box({ p: [-7.2, 0, 0], s: [2.6, .25, 5.4], r: [r, 0, 0] }, turbineMat, g);
    const rotor = new T.Group(); rotor.position.x = 8.6; g.add(rotor);
    k.mesh(new T.TorusGeometry(3.6, .25, 8, 28), ringMat, { p: [0, 0, 0], r: [0, Math.PI / 2, 0] }, rotor);
    for (let i = 0; i < 3; i++) k.box({ p: [0, 0, 0], s: [.2, 6.6, .7], r: [i * Math.PI * 2 / 3, 0, 0] }, ringMat, rotor);
    k.line([new T.Vector3(x, y - 3 * s, z), new T.Vector3(x + rand(-8, 8), -1, z + 10)], '#5a5266', .5, city);
    turbines.push({ g, rotor, base: g.position.clone(), ph: random() * 6 });
  }

  // ── The bay: a ferry crossing with lit windows, sailboats with mast lights, a buoy.
  const boats: { g: T.Group; speed: number; x0: number; bob: number }[] = [];
  const hullMat = k.standard('#e8e2d8', .6, .1), darkHull = k.standard('#2a2a36', .7, .1);
  const winMat = k.basic('#ffd08a', 1.4);
  { const g = new T.Group(); g.position.set(-60, -1.1, -62); city.add(g);
    k.box({ p: [0, .4, 0], s: [14, 1.4, 4.2] }, darkHull, g); k.box({ p: [0, 1.6, 0], s: [11, 1.2, 3.6] }, hullMat, g); k.box({ p: [-1, 2.7, 0], s: [6.5, 1, 3] }, hullMat, g);
    for (let i = 0; i < 8; i++) k.box({ p: [-4.6 + i * 1.3, 1.65, 1.82], s: [.7, .45, .04] }, winMat, g);
    k.box({ p: [2, 3.6, 0], s: [.6, 1.6, .6] }, k.standard('#b4473a', .6, .2), g);
    k.mesh(k.sphereGeo, k.basic('#ffe2b0', 2), { p: [2, 4.6, 0], s: [.25, .25, .25] }, g);
    boats.push({ g, speed: 2.2, x0: -60, bob: 0 }); }
  for (const [x, z] of [[-28, -46], [20, -78], [-95, -88], [95, -58], [140, -96]] as const) {
    const g = new T.Group(); g.position.set(x, -1.15, z); g.rotation.y = rand(0, Math.PI * 2); city.add(g);
    k.box({ p: [0, .25, 0], s: [4, .6, 1.3] }, hullMat, g);
    k.box({ p: [0, 3.2, 0], s: [.1, 5.6, .1] }, darkHull, g);
    const sail = new T.Shape(); sail.moveTo(0, 0); sail.lineTo(0, 5); sail.lineTo(2.4, .3); sail.closePath();
    k.mesh(new T.ShapeGeometry(sail), k.ownMaterial(new T.MeshStandardMaterial({ color: '#f3ece2', roughness: .8, side: T.DoubleSide })), { p: [.1, .6, 0] }, g);
    boats.push({ g, speed: rand(.15, .4), x0: x, bob: random() * 6 });
  }
  // Reflected light streaks under the lit things on the water.
  const streakMat = k.ownMaterial(new T.ShaderMaterial({ uniforms: { uColor: { value: new T.Color('#ffb070') }, uOpacity: { value: .5 } }, vertexShader: UV_VS, fragmentShader: `varying vec2 vUv;uniform vec3 uColor;uniform float uOpacity;void main(){float a=pow(vUv.y,1.5)*smoothstep(0.,.5,vUv.x)*smoothstep(1.,.5,vUv.x)*uOpacity;gl_FragColor=vec4(uColor*a,a);}`, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
  for (const [x, z, w, l] of [[-30, -110, 3, 40], [72, -128, 2, 22], [112, -130, 1.5, 18], [-150, -220, 6, 50], [62, -190, 2.5, 50]] as const) {
    k.mesh(k.ownGeometry(new T.PlaneGeometry(w, l)), streakMat, { p: [x, -1.15, z + l / 2], r: [-Math.PI / 2, 0, 0] }, city);
  }

  // ── The sun on the horizon, and haze between the layers.
  const sunAt = sunDir.clone().normalize().multiplyScalar(360);
  const sunMat = k.ownMaterial(new T.ShaderMaterial({ uniforms: {}, vertexShader: UV_VS, fragmentShader: 'varying vec2 vUv;void main(){vec2 p=vUv-.5;float d=length(p)*2.;float a=smoothstep(.32,.28,d)+pow(max(0.,1.-d),3.)*.55;vec3 c=mix(vec3(1.,.6,.35),vec3(1.,.95,.8),smoothstep(.3,0.,d));gl_FragColor=vec4(c*a,a);}', transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
  const sun = k.mesh(k.ownGeometry(new T.PlaneGeometry(90, 90)), sunMat, { p: [sunAt.x, Math.max(6, sunAt.y), sunAt.z] }, city);
  sun.lookAt(0, 4, 0); sun.renderOrder = -1;
  const haze = (z: number, color: string, opacity: number, height: number) => {
    const m = k.ownMaterial(new T.ShaderMaterial({ uniforms: { uColor: { value: new T.Color(color) }, uOpacity: { value: opacity } }, vertexShader: UV_VS, fragmentShader: HAZE_FS, transparent: true, depthWrite: false, fog: false }));
    k.mesh(k.ownGeometry(new T.PlaneGeometry(900, height)), m, { p: [0, height / 2 - 1.5, z] }, city);
  };
  haze(-128, '#e3a08e', .35, 26);
  haze(-178, '#e0988c', .45, 40);
  haze(-238, '#e7a690', .55, 60);
  haze(-305, '#f0b49a', .6, 80);

  return {
    update(t: number, dt: number) {
      for (const u of timeUniforms) u.value = t;
      for (const tb of turbines) { tb.rotor.rotation.x += dt * 1.6; tb.g.position.y = tb.base.y + Math.sin(t * .3 + tb.ph) * 1.2; tb.g.rotation.z = Math.sin(t * .25 + tb.ph) * .03; }
      for (const b of boats) {
        if (b.speed > 1) { b.g.position.x = ((b.x0 + t * b.speed + 160) % 320) - 160; }
        b.g.position.y = -1.15 + Math.sin(t * 1.3 + b.bob) * .08; b.g.rotation.z = Math.sin(t * 1.1 + b.bob) * .04;
      }
      for (const sg of signs) if (sg.flicker) sg.mat.opacity = Math.sin(t * 13) * Math.sin(t * 3.1) > .85 ? .35 : 1;
    },
    dispose: disposeExtra,
  };
}
