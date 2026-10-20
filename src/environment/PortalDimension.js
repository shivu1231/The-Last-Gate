import * as THREE from 'three';
import { createGeometryKit } from '../systems/GeometryKit.js';
import { createCinematicDetails } from './CinematicDetails.js';
import { createPortalArt } from './PortalArt.js';
import { patchWarpTree, warpUniforms } from '../effects/WorldWarp.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
/**
 * Build the opening displaced city, portal anomaly and animated environment details.
 */
export function createPortalDimension() {
  const scene = new THREE.Group();
  scene.name = 'PortalDimension';
  const {
    mesh,
    box,
    cylinderBetween,
    materials,
    random,
    rand: randomBetween,
  } = createGeometryKit(scene);
  // A single fractured street, with layered stone edges and exposed reinforcing steel.
  const groundCanvas = document.createElement('canvas');
  groundCanvas.width = groundCanvas.height = 512;
  const gx = groundCanvas.getContext('2d');
  gx.fillStyle = '#78808b';
  gx.fillRect(0, 0, 512, 512);
  for (let index = 0; index < 27000; index++) {
    const componentValue = Math.floor(randomBetween(65, 170));
    gx.fillStyle = `rgba(${componentValue},${componentValue},${componentValue + 3},${randomBetween(0.1, 0.32)})`;
    gx.fillRect(
      randomBetween(0, 512),
      randomBetween(0, 512),
      randomBetween(1, 3),
      randomBetween(1, 3),
    );
  }
  gx.strokeStyle = '#444955';
  gx.lineWidth = 1;
  for (let index2 = 0; index2 < 13; index2++) {
    gx.beginPath();
    let xPosition = randomBetween(0, 512),
      yPosition = randomBetween(0, 512);
    gx.moveTo(xPosition, yPosition);
    for (let segmentIndex = 0; segmentIndex < 5; segmentIndex++) {
      xPosition += randomBetween(-55, 55);
      yPosition += randomBetween(10, 50);
      gx.lineTo(xPosition, yPosition);
    }
    gx.stroke();
  }
  const groundTexture = new THREE.CanvasTexture(groundCanvas);
  groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
  groundTexture.repeat.set(3, 12);
  groundTexture.colorSpace = THREE.SRGBColorSpace;
  groundTexture.anisotropy = 8;
  const groundMat = new THREE.MeshStandardMaterial({
    map: groundTexture,
    bumpMap: groundTexture,
    bumpScale: 0.045,
    color: '#8b929e',
    roughness: 0.94,
    metalness: 0,
    envMapIntensity: 0.025,
  });
  // The street runs on past the crater and into the seam, then breaks off into the void.
  const ROAD_NEAR = 25,
    ROAD_FAR = -50,
    ROAD_LEN = ROAD_NEAR - ROAD_FAR,
    ROAD_MID = (ROAD_NEAR + ROAD_FAR) / 2;
  groundTexture.repeat.set(3, (12 * ROAD_LEN) / 40);
  const road = mesh(
    new THREE.BoxGeometry(10.8, 0.7, ROAD_LEN, 36, 1, Math.round(ROAD_LEN * 3)),
    groundMat,
    0,
    -0.5,
    ROAD_MID,
  );
  road.name = 'road';
  box(10.5, 1.2, ROAD_LEN - 1, materials.edge, 0.1, -1.3, ROAD_MID - 0.1);
  for (let index3 = 0; index3 < 22; index3++) {
    const side = index3 % 2 === 0 ? -1 : 1,
      zPosition = randomBetween(-26, 11),
      xPosition2 = side * randomBetween(4.6, 6.8);
    const rubble = mesh(
      new THREE.DodecahedronGeometry(randomBetween(0.3, 1.1), 0),
      materials.concrete,
      xPosition2,
      randomBetween(-0.9, 0.1),
      zPosition,
    );
    rubble.scale.set(
      randomBetween(0.8, 2),
      randomBetween(0.2, 0.65),
      randomBetween(0.6, 1.6),
    );
    rubble.rotation.set(
      randomBetween(0, 3),
      randomBetween(0, 3),
      randomBetween(0, 3),
    );
  }
  // Faded lane markings and wet-looking seams give the floor a human scale.
  const roadPaint = new THREE.MeshStandardMaterial({
    color: '#b9a56e',
    roughness: 1,
    transparent: true,
    opacity: 0.42,
  });
  for (let index4 = 0; index4 < 16; index4++)
    box(0.1, 0.012, 1.6, roadPaint, -0.7, -0.14, 10 - index4 * 3.8);
  for (let index5 = 0; index5 < 13; index5++)
    box(10.5, 0.015, 0.025, materials.dark, 0, -0.13, 10 - index5 * 4.7);
  for (let index6 = 0; index6 < 13; index6++) {
    const xPosition3 = randomBetween(-4.8, 4.8),
      zPosition2 = randomBetween(-23, 9),
      result = randomBetween(0.05, 0.2);
    const stone = mesh(
      new THREE.DodecahedronGeometry(result),
      materials.edge,
      xPosition3,
      -0.08,
      zPosition2,
    );
    stone.rotation.set(random() * 3, random() * 3, random() * 3);
  }
  // Sparse structural scars keep the road graphic and directional without making it busy.
  const roadScarMat = new THREE.MeshBasicMaterial({
    color: '#252d3a',
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  function roadScar(points, opacity = 0.38) {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        points.map(
          ([xPosition4, yPosition2, zPosition3]) =>
            new THREE.Vector3(xPosition4, yPosition2, zPosition3),
        ),
      ),
      roadScarMat.clone(),
    );
    line.material.opacity = opacity;
    scene.add(line);
    return line;
  }
  roadScar(
    [
      [-3.9, -0.135, 5.2],
      [-3.5, -0.135, 3.8],
      [-3.8, -0.135, 2.4],
    ],
    0.3,
  );
  roadScar(
    [
      [2.9, -0.134, -2.2],
      [3.2, -0.134, -3.1],
      [2.8, -0.134, -4.4],
    ],
    0.27,
  );
  roadScar(
    [
      [-1.9, -0.134, -7.8],
      [-1.3, -0.134, -8.3],
      [-1.55, -0.134, -9.1],
    ],
    0.34,
  );
  const tyreMat = new THREE.MeshBasicMaterial({
    color: '#18202b',
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });
  for (const xPosition5 of [-1.05, 1.55]) {
    const tyre = mesh(
      new THREE.PlaneGeometry(0.18, 4.8),
      tyreMat,
      xPosition5,
      -0.136,
      -5.1,
    );
    tyre.rotation.x = -Math.PI / 2;
    tyre.rotation.z = xPosition5 < 0 ? 0.035 : -0.025;
  }
  // Broken parapets frame the path rather than hiding the companion.
  for (const side of [-1, 1]) {
    for (let index7 = 0; index7 < 7; index7++) {
      const zPosition4 = 8 - index7 * 5.2;
      if ((side === 1 && index7 === 4) || (side === -1 && index7 === 2))
        continue;
      box(
        0.52,
        0.85,
        randomBetween(2, 4),
        materials.concrete,
        side * 5.1,
        0.22,
        zPosition4,
      );
      box(
        0.64,
        0.13,
        randomBetween(2, 4),
        groundMat,
        side * 5.1,
        0.72,
        zPosition4,
      );
    }
    for (let index8 = 0; index8 < 6; index8++)
      cylinderBetween(
        new THREE.Vector3(side * 5.5, -0.7, -25 + index8 * 0.3),
        new THREE.Vector3(
          side * randomBetween(6, 8),
          randomBetween(-0.4, 1),
          -25 + index8 * 0.3,
        ),
        0.025,
        materials.metal,
      );
  }
  // The extended stretch toward the seam. Its own seed, so the original city layout is unchanged.
  {
    let scaleFactor = 917;
    const randomSource = (firstEntry, secondEntry) => {
      scaleFactor = (scaleFactor * 1664525 + 1013904223) >>> 0;
      return (
        firstEntry + (scaleFactor / 4294967296) * (secondEntry - firstEntry)
      );
    };
    for (const side of [-1, 1])
      for (let index9 = 7; index9 < 11; index9++) {
        if ((side === 1 && index9 === 9) || (side === -1 && index9 === 8))
          continue;
        const zPosition5 = 8 - index9 * 5.2;
        box(
          0.52,
          0.85,
          randomSource(2, 4),
          materials.concrete,
          side * 5.1,
          0.22,
          zPosition5,
        ).rotation.z = side * randomSource(0, 0.06);
        box(
          0.64,
          0.13,
          randomSource(2, 4),
          groundMat,
          side * 5.1,
          0.72,
          zPosition5,
        );
      }
    for (let index10 = 0; index10 < 14; index10++) {
      const side = index10 % 2 === 0 ? -1 : 1,
        rubble = mesh(
          new THREE.DodecahedronGeometry(randomSource(0.3, 1.1), 0),
          materials.concrete,
          side * randomSource(4.6, 6.8),
          randomSource(-0.9, 0.1),
          randomSource(ROAD_FAR + 3, -26),
        );
      rubble.scale.set(
        randomSource(0.8, 2),
        randomSource(0.2, 0.65),
        randomSource(0.6, 1.6),
      );
      rubble.rotation.set(
        randomSource(0, 3),
        randomSource(0, 3),
        randomSource(0, 3),
      );
    }
    for (let index11 = 0; index11 < 9; index11++) {
      const stone = mesh(
        new THREE.DodecahedronGeometry(randomSource(0.05, 0.2)),
        materials.edge,
        randomSource(-4.8, 4.8),
        -0.08,
        randomSource(ROAD_FAR + 4, -23),
      );
      stone.rotation.set(
        randomSource(0, 3),
        randomSource(0, 3),
        randomSource(0, 3),
      );
    }
    // A ragged far edge: tilted, half-detached slabs instead of a clean cut.
    for (let index12 = 0; index12 < 7; index12++) {
      const slab = box(
        randomSource(1.2, 2.4),
        0.62,
        randomSource(1.4, 2.6),
        groundMat,
        -4.6 + index12 * 1.55 + randomSource(-0.2, 0.2),
        -0.55 - randomSource(0, 0.6),
        ROAD_FAR - randomSource(0.4, 1.8),
      );
      slab.rotation.set(
        randomSource(-0.35, 0.05),
        randomSource(-0.3, 0.3),
        randomSource(-0.18, 0.18),
      );
    }
  }

  const floating = [];
  const windowLight = new THREE.MeshStandardMaterial({
    color: '#42536d',
    roughness: 0.22,
    metalness: 0.62,
    envMapIntensity: 0.65,
  });
  const wallCanvas = document.createElement('canvas');
  wallCanvas.width = wallCanvas.height = 256;
  const wc = wallCanvas.getContext('2d');
  wc.fillStyle = '#c3c5cb';
  wc.fillRect(0, 0, 256, 256);
  for (let index13 = 0; index13 < 5000; index13++) {
    const sampleValue = Math.floor(randomBetween(120, 205));
    wc.fillStyle = `rgba(${sampleValue},${sampleValue + 3},${sampleValue},.12)`;
    wc.fillRect(
      randomBetween(0, 256),
      randomBetween(0, 256),
      randomBetween(1, 5),
      randomBetween(2, 11),
    );
  }
  for (let index14 = 0; index14 < 10; index14++) {
    const xPosition6 = randomBetween(0, 256);
    const group2 = wc.createLinearGradient(xPosition6, 0, xPosition6 + 13, 0);
    group2.addColorStop(0, '#414c4630');
    group2.addColorStop(1, '#414c4600');
    wc.fillStyle = group2;
    wc.fillRect(xPosition6, 0, 13, 256);
  }
  const wallTexture = new THREE.CanvasTexture(wallCanvas);
  wallTexture.colorSpace = THREE.SRGBColorSpace;
  wallTexture.wrapS = wallTexture.wrapT = THREE.RepeatWrapping;
  // One material per facade colour, shared by every building, so the city batches into few draws.
  const facades = ['#647286', '#464d5e', '#858a94', '#4e6973', '#807b7e'].map(
    (color, index15) =>
      new THREE.MeshStandardMaterial({
        map: wallTexture,
        bumpMap: wallTexture,
        bumpScale: 0.025,
        color,
        roughness: 0.78 + index15 * 0.045,
        envMapIntensity: 0.18,
      }),
  );
  function building(
    xPosition4,
    yPosition2,
    zPosition3,
    width,
    height,
    depth,
    tilt = 0,
  ) {
    const group3 = new THREE.Group();
    scene.add(group3);
    group3.position.set(xPosition4, yPosition2, zPosition3);
    group3.rotation.z = tilt;
    const facade = facades[Math.floor(random() * facades.length)];
    randomBetween(0, 1); // keep the seeded layout identical
    box(width, height, depth, facade, 0, height / 2, 0, group3);
    const sill = materials.metal;
    for (let fy = 1; fy < height - 0.8; fy += 1.5) {
      box(width + 0.12, 0.06, depth + 0.12, materials.dark, 0, fy, 0, group3);
      for (let fx = -width / 2 + 0.5; fx < width / 2 - 0.2; fx += 1.1) {
        const lit = random() > 0.9;
        box(
          0.48,
          0.77,
          0.025,
          lit ? windowLight : materials.dark,
          fx,
          fy + 0.55,
          depth / 2 + 0.02,
          group3,
        );
        box(0.54, 0.04, 0.08, sill, fx, fy + 0.14, depth / 2 + 0.035, group3);
      }
    }
    box(width + 0.2, 0.2, depth + 0.2, materials.edge, 0, height, 0, group3);
    if (random() > 0.4) {
      box(0.3, 2.2, 0.3, materials.metal, 0, height + 1, 0, group3);
    }
    return group3;
  }
  building(-15, -4, -21, 6, 22, 6, -0.16);
  building(-22, 1, -41, 8, 30, 8, 0.22);
  building(17, -7, -29, 2.5, 26, 7, -0.2);
  building(21, -7, -29, 2.5, 26, 7, -0.2);
  building(27, 8, -56, 9, 33, 7, 0.19);
  building(-35, 6, -69, 8, 27, 8, -0.31);
  building(9, -13, -53, 6, 15, 7, 0.1);
  building(-7, -9, -68, 5, 17, 5, -0.07);
  for (let index16 = 0; index16 < 12; index16++)
    building(
      randomBetween(-65, 65),
      randomBetween(-30, 18),
      randomBetween(-130, -80),
      randomBetween(4, 9),
      randomBetween(12, 30),
      randomBetween(4, 9),
      randomBetween(-0.8, 0.8),
    );
  // A recognisable fragment of a San Fransokyo street sign.
  const signGroup = new THREE.Group();
  scene.add(signGroup);
  signGroup.position.set(-4.9, 0, -6);
  cylinderBetween(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.3, 4.6, 0),
    0.07,
    materials.metal,
    signGroup,
  );
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 512;
  signCanvas.height = 256;
  const sc = signCanvas.getContext('2d');
  sc.fillStyle = '#243c53';
  sc.fillRect(0, 0, 512, 256);
  sc.strokeStyle = '#bbc9da';
  sc.lineWidth = 5;
  sc.strokeRect(12, 12, 488, 232);
  sc.fillStyle = '#d6dee9';
  sc.font = '25px sans-serif';
  sc.textAlign = 'center';
  sc.fillText('SAN FRANSOKYO', 256, 82);
  sc.font = 'bold 65px sans-serif';
  sc.fillText('NORTH', 256, 158);
  sc.font = '27px sans-serif';
  sc.fillText('↗   14TH STREET', 256, 212);
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = box(
    2.3,
    1.15,
    0.07,
    new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.75 }),
    0.35,
    3.6,
    0.03,
    signGroup,
  );
  sign.rotation.z = -0.08;
  // A broken suspension cable and hanging bridge ribs.
  for (let side of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 7, 13, 8),
      new THREE.Vector3(side * 6.3, 6, -5),
      new THREE.Vector3(side * 6.1, 6, -19),
      new THREE.Vector3(side * 7.5, 15, -34),
    ]);
    mesh(new THREE.TubeGeometry(curve, 45, 0.035, 6, false), materials.metal);
    for (let index17 = 0; index17 < 7; index17++) {
      const pt = curve.getPoint(0.12 + index17 * 0.1);
      cylinderBetween(
        pt,
        new THREE.Vector3(side * 5.6, 0.5, pt.z),
        0.018,
        materials.metal,
      );
    }
  }
  // Drifting chunks visibly retain traces of the city.
  const debris = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    materials.concrete,
    46,
  );
  scene.add(debris);
  debris.castShadow = true;
  for (let index18 = 0; index18 < 46; index18++) {
    const sceneObject = new THREE.Object3D(),
      side = random() > 0.5 ? 1 : -1;
    sceneObject.position.set(
      side * randomBetween(8, 42),
      randomBetween(-13, 23),
      randomBetween(-78, 0),
    );
    const state = randomBetween(0.35, 2.6);
    sceneObject.scale.set(
      state * randomBetween(1, 3),
      state * 0.5,
      state * randomBetween(1, 2),
    );
    sceneObject.rotation.set(
      randomBetween(-0.6, 0.6),
      randomBetween(-1, 1),
      randomBetween(-0.7, 0.7),
    );
    sceneObject.updateMatrix();
    debris.setMatrixAt(index18, sceneObject.matrix);
    floating.push({
      obj: sceneObject,
      y: sceneObject.position.y,
      speed: randomBetween(0.15, 0.35),
      phase: randomBetween(0, 6.3),
      amp: randomBetween(0.1, 0.5),
    });
  }

  // A ruined wall gives the body a grounded resting place.
  box(4.2, 1.6, 0.65, materials.concrete, 3.05, 0.65, -13.05).rotation.z = 0.04;
  box(1.4, 2.6, 0.7, materials.concrete, 4.8, 1.05, -13.1).rotation.z = -0.15;

  // The sky is a pale, folded rupture rather than a conventional outer-space backdrop.
  function softTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const drawingContext = canvas.getContext('2d');
    const group3 = drawingContext.createRadialGradient(64, 64, 0, 64, 64, 64);
    group3.addColorStop(0, 'rgba(230,239,255,.8)');
    group3.addColorStop(0.2, 'rgba(185,209,255,.25)');
    group3.addColorStop(1, 'rgba(150,190,255,0)');
    drawingContext.fillStyle = group3;
    drawingContext.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }
  const mistTexture = softTexture();
  const mistLayers = [];
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uTear: { value: 0 } },
    depthWrite: false,
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
    varying vec2 vUv; uniform float uTime; uniform float uTear;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){float n=0.;float a=.5;for(int i=0;i<5;i++){n+=noise(p)*a;p=p*2.05+vec2(3.1,7.2);a*=.5;}return n;}
    void main(){
      vec2 p=(vUv-vec2(.54,.61))*vec2(1.35,1.);float r=length(p);float a=atan(p.y,abs(p.x)+abs(p.y)>1e-6?p.x:1.);
      vec2 flow=vec2(a*1.3+r*9.,r*12.-uTime*.008);float n=fbm(flow);
      float ring=exp(-(((r-.32)*12.)*((r-.32)*12.)));float clouds=fbm(vUv*7.+vec2(uTime*.003,0.));
      float light=ring*(.26+n*.7)*smoothstep(-.7,.7,p.y+.25)+clouds*.1;
      vec3 col=mix(vec3(.018,.035,.075),vec3(.18,.46,.62),clamp(light,0.,.8));
      float fold=((max(0.,n-.3))*(max(0.,n-.3)))*ring;
      col+=vec3(.29,.07,.31)*fold*1.8;
      col+=vec3(.06,.16,.22)*exp(-r*r*13.)*.65;
      // Attacks open hairline fractures across the sky, cyan cores with violet bleed.
      float crack=fbm(vUv*vec2(3.,5.)+vec2(7.,uTime*.01));float ridge=1.-smoothstep(0.,.012+uTear*.012,abs(crack-.5));
      float reach=smoothstep(1.,.15,length(vUv-vec2(.52,.5))*(1.6-uTear));
      col+=mix(vec3(.55,.9,1.),vec3(.62,.32,.95),n)*ridge*reach*uTear*1.4;
      gl_FragColor=vec4(col,1.);
    }`,
  });
  mesh(new THREE.PlaneGeometry(230, 150), skyMaterial, 0, 8, -158).castShadow =
    false;
  // Low mist passes across the broken roadway; a quiet glow separates the shell from the void.
  for (let index19 = 0; index19 < 8; index19++) {
    const sceneObject2 = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: mistTexture,
        color: '#6ea7cd',
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    sceneObject2.position.set(
      randomBetween(-10, 10),
      randomBetween(0.2, 1.7),
      -16 - index19 * 4,
    );
    sceneObject2.scale.set(randomBetween(13, 21), randomBetween(1.8, 3.6), 1);
    scene.add(sceneObject2);
    mistLayers.push({ sprite: sceneObject2, x: sceneObject2.position.x });
  }
  const backGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: mistTexture,
      color: '#88c5ed',
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  backGlow.position.set(2.7, 4, -18);
  backGlow.scale.set(17, 15, 1);
  scene.add(backGlow);
  // The primary dimensional landmark: a vertical architectural seam, half swallowed
  // by the mid-city blocks rather than a conventional circular portal.
  const anomaly = new THREE.Group();
  scene.add(anomaly);
  anomaly.position.set(1.8, 4.2, -34);
  anomaly.rotation.z = -0.08;
  const seamCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.35, -5.8, 0.2),
    new THREE.Vector3(0.1, -2.2, 0),
    new THREE.Vector3(-0.18, 1.5, 0.05),
    new THREE.Vector3(0.42, 5.2, -0.02),
    new THREE.Vector3(0.08, 9.4, 0.02),
    new THREE.Vector3(0.55, 13.4, 0),
  ]);
  const seamFringe = new THREE.MeshBasicMaterial({
    color: '#756b9e',
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const seamHalo = new THREE.MeshBasicMaterial({
    color: '#72c9ef',
    transparent: true,
    opacity: 0.1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  // A narrow, layered spatial cut: a dark core, offset refractive planes and a restrained cyan edge.
  const seamCore = new THREE.Mesh(
    new THREE.TubeGeometry(seamCurve, 64, 0.12, 7, false),
    new THREE.MeshBasicMaterial({
      color: '#07111d',
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
    }),
  );
  anomaly.add(seamCore);
  const seamEdge = new THREE.Mesh(
    new THREE.TubeGeometry(seamCurve, 64, 0.035, 6, false),
    new THREE.MeshBasicMaterial({ color: '#e2f8ff', toneMapped: false }),
  );
  anomaly.add(seamEdge);
  anomaly.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(seamCurve, 64, 0.24, 8, false),
      seamFringe,
    ),
  );
  for (const [xPosition7, yPosition3, rotation, scaleFactor2, zPosition6] of [
    [-0.8, 1.2, -0.16, 1.2, -0.14],
    [0.75, 4.9, 0.19, 0.8, -0.22],
    [-0.35, 8.1, -0.08, 0.62, -0.3],
  ]) {
    const shard = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 7.4), seamHalo);
    shard.position.set(xPosition7, yPosition3, zPosition6);
    shard.rotation.z = rotation;
    shard.scale.set(scaleFactor2, 1, 1);
    anomaly.add(shard);
  }
  const anomalyLight = new THREE.PointLight('#a9e7ff', 2.2, 20, 2);
  anomalyLight.position.set(0.1, 3.7, 0.2);
  anomaly.add(anomalyLight);
  for (let index20 = 0; index20 < 25; index20++) {
    const material2 = new THREE.SpriteMaterial({
      map: mistTexture,
      color: index20 % 5 === 0 ? '#836eae' : '#65a8cd',
      transparent: true,
      opacity: randomBetween(0.05, 0.16),
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sceneObject3 = new THREE.Sprite(material2);
    sceneObject3.position.set(
      randomBetween(-70, 70),
      randomBetween(-5, 35),
      randomBetween(-150, -55),
    );
    sceneObject3.scale.set(randomBetween(25, 70), randomBetween(10, 40), 1);
    scene.add(sceneObject3);
  }
  const riftGroup = new THREE.Group();
  scene.add(riftGroup);
  riftGroup.position.set(6, 27, -106);
  riftGroup.rotation.z = -0.45;
  for (let index21 = 0; index21 < 9; index21++) {
    const curve = new THREE.EllipseCurve(
      0,
      0,
      randomBetween(25, 42),
      randomBetween(9, 14),
      randomBetween(-0.2, 0.1),
      randomBetween(3.8, 5.8),
      false,
      0,
    );
    const points2 = curve
      .getPoints(140)
      .map(
        (screenVector) =>
          new THREE.Vector3(
            screenVector.x,
            screenVector.y,
            randomBetween(-0.1, 0.1),
          ),
      );
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points2),
      new THREE.LineBasicMaterial({
        color: index21 % 3 === 0 ? '#c9ded0' : '#7fa8a5',
        transparent: true,
        opacity: randomBetween(0.12, 0.4),
      }),
    );
    line.position.y = randomBetween(-2, 2);
    riftGroup.add(line);
  }
  const dustCount = 900,
    dustPositions = new Float32Array(dustCount * 3);
  for (let index22 = 0; index22 < dustCount; index22++) {
    dustPositions[index22 * 3] = randomBetween(-50, 50);
    dustPositions[index22 * 3 + 1] = randomBetween(-12, 30);
    dustPositions[index22 * 3 + 2] = randomBetween(-95, 15);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      color: '#bdd5c6',
      map: mistTexture,
      size: 0.065,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  scene.add(dust);
  // Distinct fragments crossing the void give the scene depth and scale.
  for (let index23 = 0; index23 < 7; index23++) {
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(randomBetween(-40, 40), randomBetween(0, 28), -65),
      new THREE.Vector3(randomBetween(-30, 30), randomBetween(10, 38), -95),
    ]);
    scene.add(
      new THREE.Line(
        lineGeo,
        new THREE.LineBasicMaterial({
          color: '#9fbeb2',
          transparent: true,
          opacity: 0.13,
        }),
      ),
    );
  }
  // Corrupted city: a cold, low sky fill and a cool-neutral moon key carry the forms; warmth is
  // left to the few surviving practicals and Baymax's red, never to the base light.
  scene.add(new THREE.HemisphereLight('#a9c0dc', '#121827', 0.6));
  const key = new THREE.DirectionalLight('#dbe2ea', 1.85);
  key.position.set(-7, 15, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -11;
  key.shadow.camera.right = 11;
  key.shadow.camera.top = 14;
  key.shadow.camera.bottom = -14;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 42;
  key.shadow.normalBias = 0.024;
  key.shadow.bias = -0.00015;
  key.shadow.autoUpdate = false;
  key.shadow.needsUpdate = true;
  scene.add(key);
  scene.add(key.target);
  key.target.position.set(1, 0, -10);
  // Capped per quality tier by RenderPolicy; 2048 is the HIGH budget.
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 3;
  const rim = new THREE.DirectionalLight('#8ed4ff', 1.25);
  rim.position.set(12, 8, -30);
  scene.add(rim);
  const front = new THREE.PointLight('#c7d7ec', 0.8, 24, 1.8);
  front.position.set(-2, 5, -4);
  scene.add(front);
  // Broad, soft front fill so the white shell keeps its curvature, without a spotlight cone.
  const companionLight = new THREE.DirectionalLight('#dfe3ea', 0.5);
  companionLight.position.set(-4, 8, 3);
  scene.add(companionLight);
  const details = createCinematicDetails(scene, {
    mesh,
    box,
    materials,
    rand: randomBetween,
    building,
    mistTexture,
  });
  const art = createPortalArt(scene, {
    mesh,
    box,
    materials,
    rand: randomBetween,
    mistTexture,
  });
  // The new escape opening looks back along the near end of the same fractured street.
  // Ground and surrounding mass continue to the gate; it never hangs over an empty void.
  for (const side of [-1, 1]) {
    const near = building(side * 9.4, -0.8, 19, 5.6, 17, 9, side * 0.045);
    near.rotation.y = Math.PI;
    const far = building(side * 18, -2, 39, 8, 24, 11, -side * 0.08);
    far.rotation.y = Math.PI;
    for (const zPosition7 of [15, 20, 24]) {
      box(0.52, 0.85, 3.1, materials.concrete, side * 5.1, 0.22, zPosition7);
      box(0.64, 0.13, 3.2, groundMat, side * 5.1, 0.72, zPosition7);
    }
  }
  for (const zPosition8 of [14, 18, 22])
    box(0.1, 0.012, 1.6, roadPaint, -0.7, -0.14, zPosition8);
  const reverseSky = mesh(
    new THREE.PlaneGeometry(900, 600),
    skyMaterial,
    0,
    8,
    170,
  );
  reverseSky.rotation.y = Math.PI;
  reverseSky.castShadow = false;

  // Bake every static opaque surface into one mesh per material. The city was ~330 separate
  // draws (each repeated in the shadow, AO and depth-of-field passes); merged it is a few dozen.
  // Only transforms are baked: materials stay shared, so sign flicker and emissive pulses still work.
  // Moving or toggled groups (debris, sign, cable, anomaly, sliding blocks) stay live.
  const animatedRoots = new Set([
    ...floating.map((sceneObject4) => sceneObject4.obj),
    signGroup,
    anomaly,
    riftGroup,
    ...details.animatedRoots,
  ]);
  /** Merges the static opaque meshes under `root` (skipping `skip` subtrees) into one mesh per material, in root space. */
  function mergeStatic(root, skip) {
    root.updateMatrixWorld(true);
    const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert(),
      groups = new Map();
    root.traverse((obj) => {
      if (
        !obj.isMesh ||
        obj.isInstancedMesh ||
        Array.isArray(obj.material) ||
        obj.material.transparent ||
        obj.material.isShaderMaterial ||
        !obj.visible
      )
        return;
      let parent = obj;
      while (parent && parent !== root) {
        if (skip.has(parent)) return;
        parent = parent.parent;
      }
      // Thin facade pieces (windows, sills) never cast: they only add shadow acne.
      const point = obj.geometry.parameters,
        cast =
          obj.castShadow &&
          !(point && point.depth !== undefined && point.depth <= 0.1);
      const attrs = Object.keys(obj.geometry.attributes).sort().join(',');
      const key = `${obj.material.uuid}/${cast ? 1 : 0}${obj.receiveShadow ? 1 : 0}/${obj.geometry.index ? 'i' : 'n'}/${attrs}`;
      if (!groups.has(key))
        groups.set(key, {
          material: obj.material,
          cast,
          receive: obj.receiveShadow,
          objects: [],
        });
      groups.get(key).objects.push(obj);
    });
    for (const { material, cast, receive, objects } of groups.values()) {
      if (objects.length < 2) continue;
      const geometry = mergeGeometries(
        objects.map((obj) =>
          obj.geometry
            .clone()
            .applyMatrix4(
              new THREE.Matrix4().multiplyMatrices(toRoot, obj.matrixWorld),
            ),
        ),
      );
      if (!geometry) continue;
      objects.forEach((obj) => obj.parent.remove(obj));
      geometry.computeBoundingSphere();
      const merged = new THREE.Mesh(geometry, material);
      merged.name = 'static-merged';
      merged.castShadow = cast;
      merged.receiveShadow = receive;
      merged.matrixAutoUpdate = false;
      root.add(merged);
    }
  }
  mergeStatic(scene, animatedRoots);
  // Moving groups still hold together as rigid bodies: merge inside each, leaving the swinging sign itself live.
  for (const group of animatedRoots)
    if (group.isGroup) mergeStatic(group, new Set([sign]));

  let lastShadow = 0;
  // Every lit material shares the warp patch; compiled once with the rest of the scene.
  patchWarpTree(scene);
  const mistBase = mistLayers.map((sceneObject4) =>
    sceneObject4.sprite.position.clone(),
  );
  let dustSpin = 1,
    dustKick = 0,
    mistPush = 0;
  const pushFrom = new THREE.Vector3();
  let instability = 0;
  const keyOffset = key.position.clone().sub(key.target.position);
  return {
    group: scene,
    anomaly,
    anomalyLight,
    signs: art,
    /** Impact response outside the warp shader: particles reverse, fog is shoved, signs fail. */
    impulse(position, power) {
      dustSpin = -1;
      dustKick = Math.min(1.5, dustKick + power);
      mistPush = Math.min(1, mistPush + power);
      pushFrom.copy(position);
      art.flicker(power);
    },
    dispose() {
      const geometries = new Set(),
        materials2 = new Set(),
        textures = new Set();
      scene.traverse((obj) => {
        if (obj.geometry) geometries.add(obj.geometry);
        if (obj.material) {
          for (const material of Array.isArray(obj.material)
            ? obj.material
            : [obj.material]) {
            materials2.add(material);
            for (const value of Object.values(material))
              if (value?.isTexture) textures.add(value);
          }
        }
      });
      geometries.forEach((group3) => group3.dispose());
      textures.forEach((texture) => texture.dispose());
      materials2.forEach((mesh2) => mesh2.dispose());
    },
    /** @param {number} t @param {number} dt @param {boolean} reduced @param {number} [progress] @param {string} [phase] @param {any} [seq] @param {any} [focus] */
    update(
      timeSeconds,
      deltaSeconds,
      reduced,
      progress = 0,
      phase = 'approaching',
      seq = null,
      focus = null,
    ) {
      const charged = ['ignition', 'chase', 'fracture', 'pulled'].includes(
        phase,
      )
        ? 1
        : 0;
      instability = THREE.MathUtils.damp(
        instability,
        charged
          ? THREE.MathUtils.clamp(
              (seq?.tear ?? 0) * 0.82 + (phase === 'chase' ? 0.2 : 0),
              0,
              1,
            )
          : 0,
        charged ? 1.15 : 2.4,
        deltaSeconds,
      );
      if (!reduced) {
        floating.forEach((state2, index15) => {
          const pull =
            instability *
            Math.max(0, 1 - Math.abs(state2.obj.position.z + 34) / 55);
          state2.obj.position.y =
            state2.y +
            Math.sin(timeSeconds * state2.speed + state2.phase) * state2.amp +
            pull * Math.sin(timeSeconds * 1.7 + state2.phase) * 0.32;
          state2.obj.position.x +=
            Math.sign(1.8 - state2.obj.position.x) * pull * deltaSeconds * 0.18;
          state2.obj.rotation.y += deltaSeconds * (0.006 + pull * 0.05);
          state2.obj.updateMatrix();
          debris.setMatrixAt(index15, state2.obj.matrix);
        });
        debris.instanceMatrix.needsUpdate = true;
        riftGroup.rotation.z =
          -0.45 +
          Math.sin(timeSeconds * 0.04) * 0.015 +
          instability * Math.sin(timeSeconds * 5.3) * 0.018;
        skyMaterial.uniforms.uTime.value = timeSeconds;
      }
      // Dust drifts one way; an impact briefly reverses it, then it recovers.
      dustSpin = THREE.MathUtils.damp(dustSpin, 1, 0.8, deltaSeconds);
      dustKick = Math.max(0, dustKick - deltaSeconds * 0.9);
      if (!reduced) {
        dust.rotation.y +=
          deltaSeconds * 0.001 * dustSpin +
          dustKick * deltaSeconds * 0.012 * dustSpin;
        dust.position.y = Math.sin(timeSeconds * 0.7) * dustKick * 0.25;
      }
      details.update(timeSeconds, deltaSeconds, reduced, progress);
      art.update(reduced ? 0 : timeSeconds, deltaSeconds);
      mistPush = Math.max(0, mistPush - deltaSeconds * 0.35);
      if (!reduced) {
        sign.rotation.z = -0.08 + Math.sin(timeSeconds * 0.21) * 0.009;
        mistLayers.forEach((height, index15) => {
          const base = mistBase[index15];
          const away = base.x - pushFrom.x;
          height.sprite.position.x =
            base.x +
            Math.sin(timeSeconds * 0.04 + index15) * 0.7 +
            Math.sign(away || 1) * mistPush * 2.5 +
            Math.sign(1.8 - base.x) * instability * 0.7;
          height.sprite.position.y =
            base.y + mistPush * 0.6 + instability * 0.18;
          height.sprite.material.opacity =
            0.12 *
            (1 - progress * 0.65) *
            (1 + mistPush * 0.8 + instability * 0.55);
        });
        anomaly.rotation.y =
          Math.sin(timeSeconds * 0.07) * 0.012 +
          instability * Math.sin(timeSeconds * 6.1) * 0.014;
        anomaly.rotation.x = instability * Math.sin(timeSeconds * 4.3) * 0.009;
        anomaly.position.x =
          1.8 +
          Math.sin(timeSeconds * 0.035) * 0.035 +
          instability * Math.sin(timeSeconds * 5.7) * 0.055;
        anomalyLight.intensity =
          2.2 + instability * (0.6 + 0.45 * Math.sin(timeSeconds * 8.4));
        seamEdge.material.opacity = 1 - instability * 0.18;
        seamFringe.opacity = 0.12 + instability * 0.12;
      }
      dust.material.opacity =
        0.44 * (1 - progress * 0.72) * (1 + dustKick * 0.4);
      const tear = seq ? seq.tear : 0;
      skyMaterial.uniforms.uTear.value = tear;
      warpUniforms.uWarpTime.value = timeSeconds;
      // The key light travels with the action so the chase keeps its shadows.
      if (focus) {
        key.target.position.set(focus.x * 0.5, 0, focus.z - 3);
        key.position.copy(key.target.position).add(keyOffset);
      }
      const busy = ['ignition', 'chase', 'fracture', 'pulled'].includes(phase);
      if (timeSeconds - lastShadow > (busy ? 0.05 : 0.18)) {
        key.shadow.needsUpdate = true;
        lastShadow = timeSeconds;
      }
    },
  };
}
