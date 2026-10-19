import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchWarpTree, warpUniforms } from '../effects/WorldWarp.js';
import {
  SEAM_POSITION,
  PULL_CONTACT_POSITION,
} from '../systems/SequenceDirector';

const ease = (inputValue) => {
  inputValue = Math.max(0, Math.min(1, inputValue));
  return inputValue * inputValue * (3 - 2 * inputValue);
};
const span = (inputValue, startValue, endValue) =>
  ease((inputValue - startValue) / (endValue - startValue));
let seed = 913;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const randomBetween = (startValue, endValue) =>
  startValue + random() * (endValue - startValue);
/**
 * Paint a radial alpha falloff for the existing glow sprites.
 */
function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const drawingContext = canvas.getContext('2d');
  const group = drawingContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  group.addColorStop(0, 'rgba(255,255,255,1)');
  group.addColorStop(0.3, 'rgba(255,255,255,.45)');
  group.addColorStop(1, 'rgba(255,255,255,0)');
  drawingContext.fillStyle = group;
  drawingContext.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}
const fullVertex =
  'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
const noiseGLSL =
  'float h1(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h1(i),h1(i+vec2(1,0)),f.x),mix(h1(i+vec2(0,1)),h1(i+vec2(1,1)),f.x),f.y);}';

/**
 * Everything Baymax's attacks do to the world, and the corridor they open. All of it is built
 * and compiled up front, with pooled effects, so nothing is created during the action.
 */
export function createRuptureSet(environment) {
  const root = new THREE.Group();
  root.name = 'Rupture';
  const glow = glowTexture();
  const additive = (color, opacity = 1) =>
    new THREE.SpriteMaterial({
      map: glow,
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  const blastLight = new THREE.PointLight('#ff6a3a', 0, 18, 1.8);
  root.add(blastLight);
  // ----------------------------------------------------------------- bolts
  const boltMat = () =>
    new THREE.MeshBasicMaterial({
      color: '#ffd9cf',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
  const bolts = [0, 1].map(() => {
    const group = new THREE.Group();
    group.visible = false;
    root.add(group);
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 1, 8, 1, true),
      boltMat(),
    );
    core.position.y = 0.5;
    group.add(core);
    const sheath = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.1, 1, 10, 1, true),
      boltMat(),
    );
    sheath.material.color.set('#ff3a22');
    sheath.position.y = 0.5;
    group.add(sheath);
    const head = new THREE.Sprite(additive('#ffb09a', 0));
    head.scale.setScalar(0.42);
    root.add(head);
    return {
      g: group,
      core,
      sheath,
      head,
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      age: 9,
      flight: 0.2,
    };
  });
  let boltIndex = 0;
  // ----------------------------------------------------------------- impacts
  const ringMat = () =>
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uAge: { value: 9 }, uColor: { value: new THREE.Color() } },
      vertexShader: fullVertex,
      fragmentShader:
        'varying vec2 vUv;uniform float uAge;uniform vec3 uColor;void main(){float r=length(vUv-.5)*2.;float band=exp(-(((r-.86)*14.)*((r-.86)*14.)))+exp(-(((r-.6)*9.)*((r-.6)*9.)))*.35;float fade=exp(-uAge*3.2);gl_FragColor=vec4(uColor*band*fade*1.6,band*fade);}',
    });
  const dustMat = () =>
    new THREE.SpriteMaterial({
      map: glow,
      color: '#8b9db3',
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
  const impacts = [0, 1, 2, 3].map(() => {
    const flash = new THREE.Sprite(additive('#fff1e6', 0));
    root.add(flash);
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ringMat());
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    root.add(ring);
    const dust = [0, 1, 2, 3].map(() => {
      const sceneObject = new THREE.Sprite(dustMat());
      root.add(sceneObject);
      return sceneObject;
    });
    return {
      flash,
      ring,
      dust,
      dustDir: dust.map(() => new THREE.Vector3()),
      pos: new THREE.Vector3(),
      age: 9,
      power: 0,
      tear: false,
    };
  });
  let impactIndex = 0;
  // Persistent scars: scorch and glowing fractures in the asphalt.
  const scorchTex = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const drawingContext = canvas.getContext('2d');
    const group = drawingContext.createRadialGradient(64, 64, 4, 64, 64, 64);
    group.addColorStop(0, 'rgba(4,6,8,.95)');
    group.addColorStop(0.55, 'rgba(10,12,16,.6)');
    group.addColorStop(1, 'rgba(10,12,16,0)');
    drawingContext.fillStyle = group;
    drawingContext.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  })();
  const scars = [0, 1, 2, 3, 4, 5].map(() => {
    const group = new THREE.Group();
    group.visible = false;
    root.add(group);
    const scorch = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({
        map: scorchTex,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    scorch.rotation.x = -Math.PI / 2;
    group.add(scorch);
    const crackMat = new THREE.MeshBasicMaterial({
      color: '#9fe6ff',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    // All 21 strips of a scar are baked into one mesh: same image, 1 draw call instead of 21.
    const strips = [],
      place = new THREE.Object3D();
    for (let index = 0; index < 7; index++) {
      const firstEntry = (index / 7) * Math.PI * 2 + randomBetween(-0.3, 0.3),
        len = randomBetween(1, 2.6);
      let px = 0,
        pz = 0;
      for (let scaleFactor = 0; scaleFactor < 3; scaleFactor++) {
        const seg = len / 3,
          dir = firstEntry + randomBetween(-0.5, 0.5);
        const strip = new THREE.PlaneGeometry(0.035, seg);
        place.rotation.set(-Math.PI / 2, 0, -dir + Math.PI / 2);
        place.position.set(
          px + (Math.cos(dir) * seg) / 2,
          0.004,
          pz + (Math.sin(dir) * seg) / 2,
        );
        place.updateMatrix();
        strip.applyMatrix4(place.matrix);
        strips.push(strip);
        px += Math.cos(dir) * seg;
        pz += Math.sin(dir) * seg;
      }
    }
    group.add(new THREE.Mesh(mergeGeometries(strips), crackMat));
    strips.forEach((strip) => strip.dispose());
    return { g: group, crackMat, age: 0, tear: false };
  });
  let scarIndex = 0;
  // ----------------------------------------------------------------- debris
  const DEBRIS = 120;
  const debris = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.16, 0),
    new THREE.MeshStandardMaterial({ color: '#6c7684', roughness: 0.95 }),
    DEBRIS,
  );
  debris.castShadow = true;
  debris.frustumCulled = false;
  root.add(debris);
  const chunks = Array.from({ length: DEBRIS }, () => ({
    p: new THREE.Vector3(0, -50, 0),
    v: new THREE.Vector3(),
    r: new THREE.Euler(),
    w: new THREE.Vector3(),
    s: 1,
    life: 0,
    lift: false,
  }));
  const dummy = new THREE.Object3D();
  let chunkIndex = 0;
  chunks.forEach((vector, index) => {
    dummy.position.copy(vector.p);
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    debris.setMatrixAt(index, dummy.matrix);
  });
  // ----------------------------------------------------------------- dimensional tears
  const tears = [0, 1, 2, 3, 4, 5].map(() => {
    const group = new THREE.Group();
    group.visible = false;
    root.add(group);
    const height = randomBetween(3.2, 6.5),
      points = [];
    for (let index = 0; index < 7; index++)
      points.push(
        new THREE.Vector3(
          randomBetween(-0.22, 0.22) * (index % 2 ? 1 : -1),
          (index / 6) * height,
          randomBetween(-0.08, 0.08),
        ),
      );
    const curve = new THREE.CatmullRomCurve3(points);
    const coreMat = new THREE.MeshBasicMaterial({
      color: '#dff8ff',
      toneMapped: false,
      transparent: true,
      opacity: 1,
    });
    coreMat.color.multiplyScalar(2);
    const fringeMat = new THREE.MeshBasicMaterial({
      color: '#9c74e0',
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    group.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(curve, 40, 0.028, 6, false),
        coreMat,
      ),
    );
    group.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(curve, 40, 0.2, 8, false),
        fringeMat,
      ),
    );
    const halo = new THREE.Sprite(additive('#7fd8ff', 0.25));
    halo.position.y = height / 2;
    halo.scale.set(2.4, height * 1.3, 1);
    group.add(halo);
    return {
      g: group,
      coreMat,
      fringeMat,
      halo,
      age: 9,
      phase: randomBetween(0, 6),
    };
  });
  let tearIndex = 0;
  // ----------------------------------------------------------------- the fracture corridor
  const corridor = new THREE.Group();
  corridor.name = 'Fracture corridor';
  corridor.visible = false;
  root.add(corridor);
  corridor.position.set(
    SEAM_POSITION.x,
    SEAM_POSITION.y + 1,
    SEAM_POSITION.z - 0.2,
  );
  const mouthMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uOpen: { value: 0 }, uTime: { value: 0 } },
    vertexShader: fullVertex,
    fragmentShader: `varying vec2 vUv;uniform float uOpen;uniform float uTime;${noiseGLSL}
    void main(){
      vec2 p=vUv-.5;float y=p.y*2.;
      float jag=(vn(vec2(y*5.,uTime*.5))-.5)*.07+(vn(vec2(y*21.,uTime*1.4))-.5)*.025*uOpen;
      float profile=(1.-smoothstep(.45,1.,abs(y)))*(.85+.15*sin(y*4.+1.));
      float w=uOpen*.2*profile+.004;float x=p.x-jag*(.4+uOpen);float d=abs(x)-w;
      float inside=smoothstep(.006,-.02,d);
      float edge=exp(-((d/(.004+uOpen*.008))*(d/(.004+uOpen*.008))));
      float fringe=exp(-max(d,0.)*(26.-uOpen*10.))*(1.-inside);
      float lanes=.6+.4*sin((abs(x)/(w+.001))*9.-uTime*3.)*sin(y*30.+uTime);
      vec3 col=mix(vec3(.62,.9,1.),vec3(1.),1.-abs(x)/(w+.001))*inside*(.75+.25*lanes);
      col+=vec3(.9,.98,1.)*edge*2.2+mix(vec3(.5,.3,.95),vec3(.3,.75,1.),vn(vec2(y*3.,uTime*.3)))*fringe*.9;
      float a=clamp(inside*.9+edge+fringe*.7,0.,1.)*smoothstep(1.,.85,abs(y));
      gl_FragColor=vec4(col,a);
    }`,
  });
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(9, 22), mouthMat);
  mouth.position.set(0, 2, 0);
  corridor.add(mouth);
  // Receding membranes: each a slot of light, offset a little more than the last.
  const layerMats = [];
  for (let index2 = 0; index2 < 11; index2++) {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uOpen: { value: 0 },
        uTime: { value: 0 },
        uDepth: { value: index2 / 10 },
      },
      vertexShader: fullVertex,
      fragmentShader: `varying vec2 vUv;uniform float uOpen;uniform float uTime;uniform float uDepth;${noiseGLSL}
      void main(){vec2 p=(vUv-.5)*vec2(30.,40.);float bend=sin(p.y*.12+uDepth*4.+uTime*.2)*1.4*uDepth;float w=1.6+uDepth*3.2;float d=abs(p.x-bend)-w;
        float edge=exp(-((d*1.6)*(d*1.6)))*.7;float membrane=exp(-max(d,0.)*.22)*.09*vn(p*.3+uTime*.1+uDepth*9.);
        float fall=smoothstep(19.,6.,abs(p.y));vec3 c=mix(vec3(.45,.82,1.),vec3(.62,.38,.98),vn(vec2(p.y*.1,uDepth*5.)))*(edge*.9+membrane)+vec3(.85,.97,1.)*smoothstep(.0,-1.,d)*uDepth*uDepth*.035;
        gl_FragColor=vec4(c*fall*uOpen,1.);}`,
    });
    const layer = new THREE.Mesh(new THREE.PlaneGeometry(30, 40), material);
    layer.position.set(Math.sin(index2 * 0.9) * 0.6, 2, -2.5 - index2 * 3.4);
    layer.rotation.z = Math.sin(index2 * 1.3) * 0.08;
    corridor.add(layer);
    layerMats.push(material);
  }
  const endGlow = new THREE.Sprite(additive('#e8fbff', 0));
  endGlow.position.set(0, 2, -40);
  endGlow.scale.set(26, 34, 1);
  corridor.add(endGlow);
  // Fragments of the city already inside: slabs, a road piece, a lit window. Instanced.
  const FRAG = 64,
    fragments = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: '#3d4c63',
        roughness: 0.8,
        emissive: '#123049',
        emissiveIntensity: 0.6,
      }),
      FRAG,
    );
  fragments.frustumCulled = false;
  corridor.add(fragments);
  const fragState = Array.from({ length: FRAG }, (unusedValue, index) => ({
    a: randomBetween(0, Math.PI * 2),
    r: randomBetween(3.2, 7),
    z: -randomBetween(1, 38),
    s: new THREE.Vector3(
      randomBetween(0.3, 2.4),
      randomBetween(0.1, 1.2),
      randomBetween(0.4, 2.6),
    ),
    spin: randomBetween(-0.2, 0.2),
    phase: randomBetween(0, 6),
  }));
  const farRed = new THREE.Sprite(additive('#ff3322', 0));
  farRed.position.set(0, 2.2, -30);
  farRed.scale.setScalar(1.4);
  corridor.add(farRed);
  const corridorLight = new THREE.PointLight('#bdeeff', 0, 46, 1.4);
  corridorLight.position.set(0, 2, 4);
  corridor.add(corridorLight);
  // Inward stream: GPU-animated motes drawn from the street into the seam.
  const STREAM = 1500,
    starts = new Float32Array(STREAM * 3),
    seeds = new Float32Array(STREAM);
  for (let index3 = 0; index3 < STREAM; index3++) {
    starts[index3 * 3] = randomBetween(-18, 18);
    starts[index3 * 3 + 1] = randomBetween(-1, 15);
    starts[index3 * 3 + 2] = randomBetween(-2, 22);
    seeds[index3] = random();
  }
  const streamGeo = new THREE.BufferGeometry();
  streamGeo.setAttribute('position', new THREE.BufferAttribute(starts, 3));
  streamGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const streamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uStream: { value: 0 },
      uRush: { value: 0 },
      uMap: { value: glow },
    },
    vertexShader: `attribute float aSeed;uniform float uTime;uniform float uStream;uniform float uRush;varying float vA;
      void main(){float sp=.12+aSeed*.18+uRush*.5;float u=fract(aSeed*7.13+uTime*sp);float k=u*u;
        vec3 target=vec3(0.,clamp(position.y*.5,0.,7.),-1.5);vec3 p=mix(position,target,k);float sw=(1.-k)*2.;p.x+=sin(u*6.+aSeed*20.)*sw*.4;p.y+=cos(u*5.+aSeed*13.)*sw*.25;
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=(.8+uRush*2.2)*(1.+k*1.6)*(110./-mv.z);vA=uStream*sin(u*3.14159);}`,
    fragmentShader:
      'uniform sampler2D uMap;varying float vA;void main(){vec4 t=texture2D(uMap,gl_PointCoord);gl_FragColor=vec4(vec3(.75,.94,1.)*t.a*vA,t.a*vA);}',
  });
  const stream = new THREE.Points(streamGeo, streamMat);
  stream.frustumCulled = false;
  corridor.add(stream);
  // ----------------------------------------------------------------- collapse
  const SLABS = 34,
    slabMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.3, 0.32, 1.2),
      new THREE.MeshStandardMaterial({ color: '#7c838e', roughness: 0.95 }),
      SLABS,
    );
  slabMesh.castShadow = true;
  slabMesh.frustumCulled = false;
  slabMesh.visible = false;
  root.add(slabMesh);
  const slabs = Array.from({ length: SLABS }, (unusedValue, index) => {
    const xPosition = -4 + (index % 6) * 1.45 + randomBetween(-0.2, 0.2),
      zPosition =
        -23.2 - Math.floor(index / 6) * 1.32 + randomBetween(-0.15, 0.15);
    return {
      base: new THREE.Vector3(xPosition, -0.31, zPosition),
      delay:
        randomBetween(0, 0.45) +
        Math.max(0, (zPosition + 31) * -0.0) +
        Math.abs(xPosition - 1.5) * 0.04,
      spin: new THREE.Vector3(
        randomBetween(-2, 2),
        randomBetween(-1, 1),
        randomBetween(-2, 2),
      ),
    };
  });
  // One broken service-frame member catches his shoulder during displacement.
  // Its brief electrical scatter is separate from the larger road-impact effect pool.
  const pullFrame = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 3.8, 0.44),
    new THREE.MeshStandardMaterial({
      color: '#465462',
      roughness: 0.83,
      metalness: 0.3,
    }),
  );
  pullFrame.position
    .copy(PULL_CONTACT_POSITION)
    .add(new THREE.Vector3(0.25, 0, 0));
  pullFrame.rotation.set(0.12, 0.15, -0.22);
  pullFrame.visible = false;
  root.add(pullFrame);
  const sparkPositions = new Float32Array(24 * 3),
    sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(sparkPositions, 3),
  );
  const sparkMat = new THREE.PointsMaterial({
    color: '#b8e7ff',
    size: 0.045,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pullSparks = new THREE.Points(sparkGeo, sparkMat);
  pullSparks.position.copy(PULL_CONTACT_POSITION);
  pullSparks.frustumCulled = false;
  root.add(pullSparks);
  let pullHit = false;
  patchWarpTree(root);
  const scratchVector = new THREE.Vector3(),
    secondaryScratchVector = new THREE.Vector3(),
    seamWorld = SEAM_POSITION.clone();
  let fold = 0,
    foldTarget = 0,
    shearSpike = 0;
  const redColor = new THREE.Color('#ff5a36'),
    cyanColor = new THREE.Color('#9fe6ff'),
    mix = new THREE.Color();

  function spawnDebris(position, power, tear) {
    const count = Math.round(14 + power * 16);
    for (let count2 = 0; count2 < count; count2++) {
      const placement = chunks[chunkIndex];
      chunkIndex = (chunkIndex + 1) % DEBRIS;
      placement.p
        .copy(position)
        .add(
          scratchVector.set(
            randomBetween(-0.4, 0.4),
            randomBetween(0, 0.3),
            randomBetween(-0.4, 0.4),
          ),
        );
      const firstEntry = randomBetween(0, Math.PI * 2),
        out = randomBetween(2, 6.5) * power;
      placement.v.set(
        Math.cos(firstEntry) * out,
        randomBetween(3.5, 9) * power,
        Math.sin(firstEntry) * out,
      );
      placement.r.set(
        randomBetween(0, 6),
        randomBetween(0, 6),
        randomBetween(0, 6),
      );
      placement.w.set(
        randomBetween(-6, 6),
        randomBetween(-6, 6),
        randomBetween(-6, 6),
      );
      placement.s = randomBetween(0.35, 1.5) * (0.7 + power * 0.4);
      placement.life = randomBetween(3.5, 5.5);
      placement.lift = tear && random() < 0.4;
    }
  }
  return {
    root,
    corridor,
    /** Respond to the director's events. `camera` is used only to aim the screen-space warp. */
    onEvent(event, seq, camera) {
      if (event.type === 'discharge') {
        const material2 = bolts[boltIndex];
        boltIndex = (boltIndex + 1) % bolts.length;
        material2.from.copy(event.from);
        material2.to.copy(event.to);
        material2.age = 0;
        material2.flight = Math.min(0.32, event.from.distanceTo(event.to) / 60);
        material2.g.visible = true;
      }
      if (event.type === 'charge') {
        blastLight.position.copy(event.position);
        blastLight.color.copy(redColor);
        blastLight.intensity = Math.max(blastLight.intensity, 6);
      }
      if (event.type !== 'impact') return;
      const { position, power, tear } = event;
      const im = impacts[impactIndex];
      const slot = impactIndex;
      impactIndex = (impactIndex + 1) % impacts.length;
      im.pos.copy(position);
      im.age = 0;
      im.power = power;
      im.tear = tear;
      im.ring.position.copy(position).setY(Math.max(position.y, -0.12) + 0.06);
      im.ring.visible = true;
      im.ring.material.uniforms.uColor.value.copy(tear ? cyanColor : redColor);
      im.dust.forEach((sceneObject, index) => {
        im.dustDir[index]
          .set(
            randomBetween(-1, 1),
            randomBetween(0.3, 1),
            randomBetween(-1, 1),
          )
          .normalize();
        sceneObject.position.copy(position);
      });
      // Warp: ripple slot, shear spike, and a heave where no seam opens.
      warpUniforms.uImpacts.value[slot].set(
        position.x,
        position.y,
        position.z,
        warpUniforms.uWarpTime.value,
      );
      const powers = warpUniforms.uImpactPower.value;
      if (slot === 0) powers.x = power;
      else if (slot === 1) powers.y = power;
      else if (slot === 2) powers.z = power;
      else powers.w = power;
      if (!tear && position.y < 0.5) {
        warpUniforms.uFold.value.set(position.x, 0, position.z, 0);
        foldTarget = 1.15 * power;
      }
      shearSpike = Math.min(1, shearSpike + power * 0.6);
      if (position.y < 1.2) {
        const material3 = scars[scarIndex];
        scarIndex = (scarIndex + 1) % scars.length;
        material3.g.visible = true;
        material3.g.position.set(position.x, -0.142, position.z);
        material3.g.scale.setScalar(0.7 + power * 0.7);
        material3.g.rotation.y = randomBetween(0, 6);
        material3.age = 0;
        material3.tear = tear;
      }
      spawnDebris(
        secondaryScratchVector.copy(position).setY(Math.max(position.y, -0.1)),
        power,
        tear,
      );
      if (tear) {
        const timeSeconds = tears[tearIndex];
        tearIndex = (tearIndex + 1) % tears.length;
        timeSeconds.age = 0;
        timeSeconds.g.visible = true;
        const side = position.x >= 0 ? 1 : -1;
        timeSeconds.g.position.copy(position);
        if (position.y < 1) {
          timeSeconds.g.position.x += side * 1.7;
          timeSeconds.g.position.y = -0.14;
        } else timeSeconds.g.position.y -= 2.6;
        timeSeconds.g.rotation.set(
          randomBetween(-0.1, 0.1),
          randomBetween(0, 3),
          randomBetween(-0.18, 0.18),
        );
      }
      blastLight.position.copy(position).setY(Math.max(position.y, 0.4) + 0.6);
      blastLight.intensity = 28 * power;
      blastLight.color.copy(
        mix.copy(redColor).lerp(cyanColor, tear ? 0.45 : 0),
      );
      environment.impulse(position, power);
      if (camera) {
        scratchVector.copy(position).project(camera);
        const screen = new THREE.Vector2(
          scratchVector.x * 0.5 + 0.5,
          scratchVector.y * 0.5 + 0.5,
        );
        const dist = camera.position.distanceTo(position),
          near = Math.max(0.15, Math.min(1, 7 / dist));
        const shove = secondaryScratchVector
          .subVectors(camera.position, position)
          .setY(0.35)
          .normalize()
          .multiplyScalar(power * 0.5 * near);
        seq.impulse(
          power * (0.45 + near * 0.55),
          scratchVector.z < 1 ? screen : undefined,
          shove,
        );
      }
    },
    update(timeSeconds, deltaSeconds, seq, phase, camera) {
      warpUniforms.uWarpTime.value = timeSeconds;
      pullFrame.visible =
        (phase === 'fracture' && seq.phaseTime > 3) ||
        (phase === 'pulled' && seq.phaseTime < 3.4);
      const contactAge = phase === 'pulled' ? seq.phaseTime - 1.45 : 9;
      pullSparks.visible = contactAge >= 0 && contactAge < 0.34;
      if (pullSparks.visible) {
        sparkMat.opacity = (1 - contactAge / 0.34) * 0.85;
        for (let index = 0; index < 24; index++) {
          const firstValue = index * 2.399;
          const speed = 0.8 + (index % 5) * 0.3;
          sparkPositions[index * 3] = Math.cos(firstValue) * contactAge * speed;
          sparkPositions[index * 3 + 1] =
            Math.sin(firstValue) * contactAge * speed -
            contactAge * contactAge * 3;
          sparkPositions[index * 3 + 2] = ((index % 3) - 1) * contactAge * 0.7;
        }
        sparkGeo.attributes.position.needsUpdate = true;
        if (!pullHit) {
          pullHit = true;
          seq.impulse(0.16);
        }
      }
      // Bolts: the head runs ahead of the beam, the beam lingers a fraction then dies.
      for (const material2 of bolts) {
        if (!material2.g.visible) continue;
        material2.age += deltaSeconds;
        const progress = Math.min(1, material2.age / material2.flight);
        scratchVector.subVectors(material2.to, material2.from);
        const len = scratchVector.length();
        material2.g.position.copy(material2.from);
        material2.g.quaternion.setFromUnitVectors(
          secondaryScratchVector.set(0, 1, 0),
          scratchVector.normalize(),
        );
        material2.g.scale.set(
          1 + (1 - progress) * 0.4,
          len * progress,
          1 + (1 - progress) * 0.4,
        );
        const fade =
          1 - span(material2.age, material2.flight, material2.flight + 0.22);
        material2.core.material.opacity = fade;
        material2.sheath.material.opacity = fade * 0.45;
        material2.head.position.lerpVectors(
          material2.from,
          material2.to,
          progress,
        );
        material2.head.material.opacity = progress < 1 ? 1 : 0;
        if (fade <= 0) {
          material2.g.visible = false;
          material2.head.material.opacity = 0;
        }
      }
      for (const im of impacts) {
        im.age += deltaSeconds;
        const firstValue2 = im.age,
          progress2 = im.power;
        im.flash.position.copy(im.pos);
        im.flash.scale.setScalar(
          (1.5 + span(firstValue2, 0, 0.12) * 5.5) * progress2,
        );
        im.flash.material.opacity =
          firstValue2 < 0.6
            ? (1 - span(firstValue2, 0.04, 0.55)) * progress2
            : 0;
        im.flash.material.color
          .copy(im.tear ? cyanColor : redColor)
          .lerp(mix.set('#ffffff'), 0.55);
        im.ring.material.uniforms.uAge.value = firstValue2;
        im.ring.scale.setScalar(
          0.4 + span(firstValue2, 0, 0.9) * 13 * progress2,
        );
        if (firstValue2 > 1.2) im.ring.visible = false;
        im.dust.forEach((sceneObject, index4) => {
          sceneObject.position
            .copy(im.pos)
            .addScaledVector(
              im.dustDir[index4],
              span(firstValue2, 0, 2.6) * 3.2 * progress2,
            );
          sceneObject.scale.setScalar((1.6 + firstValue2 * 2.6) * progress2);
          sceneObject.material.opacity =
            firstValue2 < 3
              ? 0.32 *
                (1 - span(firstValue2, 0.3, 3)) *
                span(firstValue2, 0, 0.15)
              : 0;
        });
      }
      blastLight.intensity *= Math.exp(-deltaSeconds * 4.2);
      for (const material3 of scars) {
        if (!material3.g.visible) continue;
        material3.age += deltaSeconds;
        material3.crackMat.opacity = material3.tear
          ? (0.35 + 0.25 * Math.sin(timeSeconds * 2 + material3.age)) *
            span(material3.age, 0, 0.3)
          : 0.0;
      }
      for (let index5 = 0; index5 < DEBRIS; index5++) {
        const placement = chunks[index5];
        if (placement.life <= 0) continue;
        placement.life -= deltaSeconds;
        const group = placement.lift && placement.life < 4.2 ? 2.2 : -9.8;
        placement.v.y += group * deltaSeconds;
        if (placement.lift && placement.life < 4.2) {
          placement.v.multiplyScalar(Math.exp(-deltaSeconds * 1.8));
        }
        placement.p.addScaledVector(placement.v, deltaSeconds);
        if (placement.p.y < -0.08 && !placement.lift) {
          placement.p.y = -0.08;
          placement.v.y *= -0.28;
          placement.v.x *= 0.6;
          placement.v.z *= 0.6;
          placement.w.multiplyScalar(0.6);
        }
        placement.r.x +=
          placement.w.x * deltaSeconds * (placement.lift ? 0.15 : 1);
        placement.r.y +=
          placement.w.y * deltaSeconds * (placement.lift ? 0.15 : 1);
        placement.r.z +=
          placement.w.z * deltaSeconds * (placement.lift ? 0.15 : 1);
        dummy.position.copy(placement.p);
        dummy.rotation.copy(placement.r);
        dummy.scale.setScalar(placement.s * Math.min(1, placement.life * 1.5));
        dummy.updateMatrix();
        debris.setMatrixAt(index5, dummy.matrix);
      }
      debris.instanceMatrix.needsUpdate = true;
      for (const tr of tears) {
        if (!tr.g.visible) continue;
        tr.age += deltaSeconds;
        const open = 1 - Math.pow(1 - Math.min(1, tr.age / 0.45), 3);
        tr.g.scale.set(
          0.4 + open * 0.6 + Math.sin(timeSeconds * 9 + tr.phase) * 0.03,
          open,
          1,
        );
        tr.coreMat.opacity =
          0.75 + 0.25 * Math.sin(timeSeconds * 13 + tr.phase);
        tr.fringeMat.opacity =
          (0.2 + 0.12 * Math.sin(timeSeconds * 2 + tr.phase)) *
          (1 + Math.max(0, 1 - tr.age) * 2);
        tr.halo.material.opacity = 0.18 + Math.max(0, 1 - tr.age) * 0.6;
      }
      // Global dimensional state.
      fold = THREE.MathUtils.damp(
        fold,
        foldTarget,
        fold < foldTarget ? 7 : 1,
        deltaSeconds,
      );
      warpUniforms.uFold.value.w = fold;
      shearSpike = Math.max(0, shearSpike - deltaSeconds * 0.9);
      warpUniforms.uShear.value = seq.tear * 0.32 + shearSpike * 0.5;
      const context = seq.corridor,
        col = seq.collapse;
      warpUniforms.uPull.value.set(
        seamWorld.x,
        seamWorld.y,
        seamWorld.z,
        context * 0.32 + col * 1.4,
      );
      corridor.visible = context > 0.001 || phase === 'handoff';
      environment.anomaly.visible = context < 0.25;
      if (corridor.visible) {
        mouthMat.uniforms.uOpen.value = context;
        mouthMat.uniforms.uTime.value = timeSeconds;
        // Seen from the street the membranes are the corridor; from inside they thin to outlines.
        const inside =
          phase === 'handoff'
            ? 0.2
            : phase === 'pulled'
              ? 1 - span(seq.phaseTime, 2.6, 4.4) * 0.6
              : 1;
        layerMats.forEach((mesh, index4) => {
          mesh.uniforms.uOpen.value =
            span(context, 0.2 + index4 * 0.04, 0.8 + index4 * 0.02) * inside;
          mesh.uniforms.uTime.value = timeSeconds;
        });
        endGlow.material.opacity =
          context * (phase === 'handoff' ? 0.22 : 0.45);
        corridorLight.intensity =
          context * (phase === 'handoff' ? 12 : 34) + col * 20;
        streamMat.uniforms.uTime.value = timeSeconds;
        streamMat.uniforms.uStream.value = Math.min(1, context * 1.3);
        streamMat.uniforms.uRush.value = col + (phase === 'handoff' ? 0.6 : 0);
        fragState.forEach((state, index4) => {
          const zPosition = state.z + ((timeSeconds * (0.6 + col * 4)) % 40);
          const zz = ((zPosition + 40) % 40) - 40;
          dummy.position.set(
            Math.cos(state.a + timeSeconds * 0.03) * state.r,
            2 + Math.sin(state.a + timeSeconds * 0.03) * state.r * 1.3,
            zz - 1,
          );
          dummy.scale.copy(state.s).multiplyScalar(span(context, 0.3, 1));
          dummy.rotation.set(
            state.phase + timeSeconds * state.spin,
            state.phase * 0.5,
            state.phase + timeSeconds * state.spin * 0.6,
          );
          dummy.updateMatrix();
          fragments.setMatrixAt(index4, dummy.matrix);
        });
        fragments.instanceMatrix.needsUpdate = true;
        farRed.material.opacity =
          phase === 'handoff' ? 0.9 : phase === 'pulled' ? 0.6 : 0;
        farRed.position.z =
          -30 - (phase === 'handoff' ? seq.phaseTime * 0.8 : 0);
      } else corridorLight.intensity = 0;
      // The road around Hiro breaks into slabs and falls toward the seam.
      slabMesh.visible = col > 0 && phase !== 'handoff';
      if (slabMesh.visible) {
        slabs.forEach((scaleVector, index4) => {
          const blendFactor = Math.max(0, col * 1.25 - scaleVector.delay),
            fly = blendFactor * blendFactor;
          dummy.position
            .copy(scaleVector.base)
            .lerp(
              scratchVector.set(
                seamWorld.x + Math.sin(index4) * 2,
                seamWorld.y + Math.cos(index4 * 1.7) * 3,
                seamWorld.z - 4,
              ),
              fly,
            );
          dummy.position.y += Math.sin(blendFactor * 3) * 0.6 * blendFactor;
          dummy.rotation.set(
            scaleVector.spin.x * blendFactor,
            scaleVector.spin.y * blendFactor,
            scaleVector.spin.z * blendFactor,
          );
          dummy.scale.setScalar(1 - fly * 0.7);
          dummy.updateMatrix();
          slabMesh.setMatrixAt(index4, dummy.matrix);
        });
        slabMesh.instanceMatrix.needsUpdate = true;
      }
    },
    /** Clears scars, tears and the corridor for a replay. */
    reset() {
      pullHit = false;
      pullFrame.visible = false;
      pullSparks.visible = false;
      [
        ...scars.map((material2) => material2.g),
        ...tears.map((timeSeconds) => timeSeconds.g),
      ].forEach((group) => {
        group.visible = false;
      });
      chunks.forEach((vector) => {
        vector.life = 0;
      });
      fold = 0;
      foldTarget = 0;
      shearSpike = 0;
      warpUniforms.uFold.value.set(0, 0, 0, 0);
      warpUniforms.uShear.value = 0;
      warpUniforms.uPull.value.set(0, 0, 0, 0);
      warpUniforms.uImpactPower.value.set(0, 0, 0, 0);
      for (let index = 0; index < DEBRIS; index++) {
        dummy.position.set(0, -50, 0);
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        debris.setMatrixAt(index, dummy.matrix);
      }
      debris.instanceMatrix.needsUpdate = true;
    },
    /** Everything visible for one frame so the renderer can compile it before it is needed. */
    setPrecompile(on) {
      [
        ...bolts.map((material2) => material2.g),
        ...impacts.map((index) => index.ring),
        ...scars.map((material2) => material2.g),
        ...tears.map((timeSeconds) => timeSeconds.g),
        corridor,
        slabMesh,
      ].forEach((material2) => {
        material2.visible = on;
      });
    },
  };
}
