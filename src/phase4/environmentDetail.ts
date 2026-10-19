import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SceneKit, seeded, type Pose } from '../phase2/SceneKit';
import { concreteTexture } from '../presentation/Surfaces';
import { Dressing, cityMaterials, dressRoof, type Rand } from '../environment/CityDressing';

/** Solid, static set dressing. Repeated surfaces are baked by material into a handful of draws. */
export function batchStaticGeometry(k: SceneKit) {
  k.root.updateMatrixWorld(true);
  const batches = new Map<T.Material, T.BufferGeometry[]>();
  const remove: T.Mesh[] = [];
  k.root.traverse(o => {
    if (!(o instanceof T.Mesh) || o instanceof T.InstancedMesh || Array.isArray(o.material) || o.material.transparent) return;
    const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const compatible = geometry.index ? geometry.toNonIndexed() : geometry;
    if (compatible !== geometry) geometry.dispose();
    if (!compatible.getAttribute('uv')) compatible.setAttribute('uv', new T.BufferAttribute(new Float32Array(compatible.getAttribute('position').count * 2), 2));
    const list = batches.get(o.material) ?? []; list.push(compatible); batches.set(o.material, list); remove.push(o);
  });
  remove.forEach(o => o.removeFromParent());
  for (const [material, geometries] of batches) {
    const merged = mergeGeometries(geometries, false);
    geometries.forEach(g => g.dispose());
    if (!merged) continue;
    const mesh = new T.Mesh(k.ownGeometry(merged), material); mesh.receiveShadow = true; mesh.castShadow = true;
    k.root.add(mesh);
  }
  k.root.traverse(o => { o.updateMatrix(); o.matrixAutoUpdate = false; });
  k.root.matrixAutoUpdate = true;
  return k;
}

function palette(k: SceneKit) {
  const materials = {
    structure: k.standard('#344345', .78, .38), panel: k.standard('#59615b', .9, .16),
    enamel: k.standard('#84958a', .52, .32), dark: k.standard('#141f22', .7, .3),
    metal: k.standard('#768481', .38, .7), brass: k.standard('#a48656', .4, .65),
    rubber: k.standard('#20282a', .96, .02), cream: k.standard('#c4bca2', .8, .12),
    warm: k.basic('#e7c998', 1.15), cool: k.basic('#70bdc0', .75),
    glazing: k.standard('#233e44', .19, .7), red: k.standard('#a15c43', .67, .24),
  };
  // Fine aggregate and worn paint break up broad surfaces; one small texture per environment.
  const texture = concreteTexture();
  for (const material of [materials.panel, materials.enamel, materials.structure]) {
    material.map = texture; material.bumpMap = texture; material.bumpScale = .008;
  }
  const dispose = k.dispose.bind(k); k.dispose = () => { dispose(); texture.dispose(); };
  return materials;
}

function pipe(k: SceneKit, a: T.Vector3, b: T.Vector3, radius: number, material: T.Material, parent: T.Object3D = k.root) {
  const delta = b.clone().sub(a);
  const object = k.mesh(k.ownGeometry(new T.CylinderGeometry(radius, radius, delta.length(), 10)), material, { p: a.clone().add(b).multiplyScalar(.5).toArray() as Pose['p'] }, parent);
  object.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize());
}

/** The same open workshop is seen from the lane and from the component-search apron. */
export function createBaySixArchitecture() {
  const k = new SceneKit('bay6-architecture'), m = palette(k);
  const slab = concreteTexture(); slab.repeat.set(4, 4);
  const floor = k.standard('#67736b', .94, .03); floor.map = slab; floor.bumpMap = slab; floor.bumpScale = .018;
  // Doorway is genuinely open: deep service hall, solid jambs and a raised rolling shutter.
  k.box({ p: [0, -.1, -4], s: [11.5, .24, 10.5] }, floor);
  for (const x of [-5.3, 5.3]) k.box({ p: [x, 2.6, -4.3], s: [.65, 5.2, 9] }, m.panel);
  k.box({ p: [0, 2.6, -8.7], s: [11.2, 5.2, .4] }, m.panel);
  for (const x of [-4, 4]) {
    k.box({ p: [x, 2.65, .05], s: [.42, 5.3, .7] }, m.structure);
    k.box({ p: [x, .8, .46], s: [.48, 1.6, .16] }, m.brass);
    for (let y = .18; y < 1.6; y += .3) k.box({ p: [x, y, .55], s: [.49, .11, .025], r: [0, 0, -.5] }, m.dark);
  }
  // Office glazing, gate controls and electrical distribution flank the service opening.
  for (const side of [-1, 1]) {
    const x = side * 4.7;
    k.box({ p: [x, 2.55, .02], s: [1.25, 5.1, .55] }, m.enamel);
    k.box({ p: [x, 2.72, .32], s: [.94, 1.38, .07] }, m.dark);
    k.box({ p: [x, 2.72, .37], s: [.77, 1.2, .035] }, m.glazing);
    for (const y of [2.34, 2.72, 3.1]) k.box({ p: [x, y, .41], s: [.88, .035, .045] }, m.metal);
    k.box({ p: [x, 2.72, .41], s: [.035, 1.3, .045] }, m.metal);
    k.box({ p: [x, .75, .31], s: [.95, 1.05, .08] }, m.structure);
    for (let y = .35; y < 1.2; y += .12) k.box({ p: [x, y, .37], s: [.76, .035, .055] }, m.dark);
  }
  k.box({ p: [-3.6, 1.2, .6], s: [.26, .52, .18] }, m.dark);
  k.box({ p: [-3.6, 1.3, .71], s: [.17, .14, .018] }, m.cool);
  k.mesh(k.ownGeometry(new T.CylinderGeometry(.055, .055, .04, 12)), m.red, { p: [-3.6, 1.1, .72], r: [Math.PI / 2, 0, 0] });
  k.box({ p: [3.6, 1.2, .6], s: [.28, .42, .18] }, m.dark);
  k.mesh(k.ownGeometry(new T.CylinderGeometry(.075, .075, .07, 12)), m.brass, { p: [3.6, 1.2, .73], r: [Math.PI / 2, 0, 0] });
  k.box({ p: [0, 4.9, .05], s: [11.3, .85, .85] }, m.structure);
  k.box({ p: [0, 4.95, .51], s: [10.7, .57, .06] }, m.dark);
  k.label('BAY 6  /  ROBOTICS MAINTENANCE', { p: [.08, 4.95, .56] }, 9.7, '#d7ceb3');
  k.label('ロボティクス整備   /   NORTH SERVICE', { p: [-.6, 4.57, .57] }, 4.8, '#91b4b0');
  k.box({ p: [0, 4.2, -.1], s: [7.5, .85, .33] }, m.enamel);
  for (let y = 3.87; y < 4.56; y += .12) k.box({ p: [0, y, .08], s: [7.5, .028, .045] }, m.metal);
  // Solid roof and upper service offices give the workshop a complete architectural silhouette.
  k.box({p:[0,5.58,-4.3],s:[11.7,.32,9.5]},m.structure);
  for(const x of [-5.7,5.7]) k.box({p:[x,5.98,-4.3],s:[.22,.65,9.6]},m.enamel);
  for(const z of [.45,-9.05]) k.box({p:[0,5.98,z],s:[11.6,.65,.22]},m.enamel);
  k.box({p:[0,7.25,-6.1],s:[10.5,3,5.3]},m.panel);
  k.box({p:[0,8.85,-6.1],s:[10.9,.25,5.7]},m.structure);
  for(let x=-4;x<=4;x+=1.6) {
    k.box({p:[x,7.35,-3.42],s:[1.3,1.65,.08]},m.dark);
    k.box({p:[x,7.35,-3.36],s:[1.13,1.45,.04]},x===0?m.warm:m.glazing);
    k.box({p:[x,6.48,-3.3],s:[1.5,.09,.3]},m.metal);
  }
  for(const side of [-1,1]) for(const z of [-4.4,-6.2,-8]) k.box({p:[side*5.29,7.3,z],s:[.08,1.4,1.15]},m.glazing);
  for(const x of [-3.1,3.1]) { k.box({p:[x,6.15,-1.5],s:[1.6,.8,1.5]},m.enamel);for(let z=-2.1;z<-.8;z+=.15)k.box({p:[x,6.57,z],s:[1.4,.035,.045]},m.dark); }
  // Roof trusses, a short gantry track and high clerestory glazing add real parallax.
  for (const z of [-.65, -3.5, -6.5]) {
    k.box({ p: [0, 4.65, z], s: [10.3, .19, .22] }, m.structure);
    pipe(k, new T.Vector3(-4.9, 4.65, z), new T.Vector3(0, 5.35, z), .055, m.metal);
    pipe(k, new T.Vector3(4.9, 4.65, z), new T.Vector3(0, 5.35, z), .055, m.metal);
    k.box({ p: [0, 4.45, z], s: [4.8, .045, .16] }, m.warm);
  }
  for (const x of [-2.8, 2.8]) k.box({ p: [x, 4.85, -4.4], s: [.12, .22, 8] }, m.metal);
  for (let x = -4.6; x < 5; x += 1.45) {
    k.box({ p: [x, 3.95, -8.45], s: [1.2, .9, .08] }, m.glazing);
    k.box({ p: [x, 3.95, -8.37], s: [.025, .9, .04] }, m.metal);
  }
  // Tool wall, machinist's bench and storage drawers. Warm work lights retain the opening palette.
  k.box({ p: [0, 1.75, -8.33], s: [5.1, 2.1, .12] }, m.dark);
  for (let x = -2.4; x <= 2.4; x += .3) k.box({ p: [x, 1.85, -8.23], s: [.015, 1.8, .025] }, m.metal);
  for (let i = 0; i < 12; i++) {
    const x = -2.2 + i * .4;
    k.box({ p: [x, 1.8 + (i % 3) * .15, -8.13], s: [.055, .4 + (i % 2) * .15, .045], r: [0, 0, i % 2 ? -.12 : .12] }, i % 3 ? m.cream : m.brass);
  }
  k.box({ p: [0, .85, -7.65], s: [5.3, .16, 1] }, m.metal);
  for (const x of [-1.9, 1.9]) {
    k.box({ p: [x, .4, -7.66], s: [1, .8, .85] }, m.enamel);
    for (let y = .16; y < .8; y += .2) { k.box({ p: [x, y, -7.21], s: [.9, .17, .045] }, m.structure); k.box({ p: [x, y, -7.17], s: [.4, .025, .035] }, m.metal); }
  }
  k.box({ p: [0, 3, -7.9], s: [5.4, .1, .38] }, m.structure);
  k.box({ p: [0, 2.94, -7.8], s: [4.9, .035, .15] }, m.warm);
  // A service arm on its maintenance stand: articulated links, axle housings and a real gripper.
  const arm = new T.Group(); arm.position.set(-3.65, 0, -5.65); arm.rotation.y = -.3; k.root.add(arm);
  k.box({ p: [0, .22, 0], s: [1.2, .44, 1] }, m.structure, arm);
  k.mesh(k.ownGeometry(new T.CylinderGeometry(.36, .42, .35, 20)), m.metal, { p: [0, .6, 0] }, arm);
  for (const [a, b] of [[[0, .8, 0], [.1, 2.05, -.15]], [[.1, 2.05, -.15], [1.05, 2.65, .1]], [[1.05, 2.65, .1], [1.48, 2.15, .55]]] as [number[], number[]][]) {
    pipe(k, new T.Vector3(...a), new T.Vector3(...b), .16, m.enamel, arm);
    k.mesh(k.ownGeometry(new T.CylinderGeometry(.24, .24, .4, 16)), m.dark, { p: a as Pose['p'], r: [Math.PI / 2, 0, 0] }, arm);
    k.mesh(k.ownGeometry(new T.CylinderGeometry(.13, .13, .42, 16)), m.brass, { p: a as Pose['p'], r: [Math.PI / 2, 0, 0] }, arm);
  }
  for (const x of [1.35, 1.61]) k.box({ p: [x, 1.96, .6], s: [.08, .35, .12], r: [.2, 0, x < 1.5 ? -.2 : .2] }, m.metal, arm);
  k.label('ACTUATOR SERVICE  /  06', { p: [-3.85, .58, -4.94] }, 1.8, '#c1b99d');
  // Side service cabinets, conduit runs and compressed-air cylinder.
  for (let i = 0; i < 3; i++) {
    const x = 3.25 + i * .55;
    k.box({ p: [x, 1.1, -8.13], s: [.48, 2.1, .58] }, i === 1 ? m.enamel : m.structure);
    k.box({ p: [x, 1.65, -7.8], s: [.33, .22, .035] }, m.dark);
    k.box({ p: [x, 1.65, -7.77], s: [.22, .025, .015] }, m.cool);
    for (let y = .4; y < .95; y += .11) k.box({ p: [x, y, -7.79], s: [.32, .026, .03] }, m.dark);
  }
  for (const x of [-5.01, 5.01]) {
    pipe(k, new T.Vector3(x, .2, -.4), new T.Vector3(x, 3.6, -.4), .06, m.metal);
    pipe(k, new T.Vector3(x, 3.6, -.4), new T.Vector3(x, 3.6, -8.2), .06, m.metal);
  }
  k.mesh(k.ownGeometry(new T.CapsuleGeometry(.2, 1.05, 4, 12)), m.red, { p: [4.62, .8, -5.4] });
  pipe(k, new T.Vector3(4.62, 1.5, -5.4), new T.Vector3(4.62, 1.72, -5.4), .035, m.brass);
  // Pavement markings and fasteners are part of the same baked draw batches.
  for (const x of [-3.25, 3.25]) k.box({ p: [x, .034, -2.9], s: [.07, .02, 6] }, m.brass);
  for (let x = -3.65; x < 3.7; x += .42) k.box({ p: [x, .045, .6], s: [.18, .025, .58], r: [0, .5, 0] }, m.brass);
  for (const x of [-4, 4]) for (const y of [.2, 1.65, 3.4, 4.75]) k.mesh(k.ownGeometry(new T.CylinderGeometry(.045, .045, .035, 8)), m.metal, { p: [x, y, .43], r: [Math.PI / 2, 0, 0] });
  const kit = batchStaticGeometry(k), disposeKit = kit.dispose.bind(kit);
  kit.dispose = () => { disposeKit(); slab.dispose(); };
  return kit;
}

/** Close urban detail along the existing guided route; fixed meshes, no running city simulation. */
export function createServiceStreetDetail() {
  const k = new SceneKit('north-service-street-detail'), m = palette(k);
  const random = seeded(61243), rand = (a: number, b: number) => a + random() * (b - a);
  // Roof plant, tanks, masts and signs (instanced), on their own seed so the street layout holds.
  const dress = new Dressing(k), cm = cityMaterials(k), roofRandom: Rand = seeded(61244);
  const map = concreteTexture(); map.repeat.set(6, 40);
  const paving = k.standard('#67736f', .94, .02); paving.map = map; paving.bumpMap = map; paving.bumpScale = .018;
  k.box({ p: [0, .025, -28], s: [12.2, .035, 83] }, paving);
  const shops = ['MIYAZAKI  /  MACHINE WORKS', '港湾工具  /  HARBOUR TOOLS', 'NORTH SERVICE  /  ELECTRICAL', 'ROBOTRONICS  /  PARTS + REPAIR'];
  for (const side of [-1, 1]) {
    const blocks=[{z:5,w:10,h:11,d:8},{z:-7,w:10,h:18,d:10},{z:-20,w:12,h:13,d:9},{z:-34,w:11,h:23,d:12},{z:-47,w:10,h:10,d:8},{z:-58,w:8,h:16,d:11}];
    blocks.forEach(({z,w,h,d},i)=>{
      const shop=new T.Group();shop.position.set(side*6.65,0,z+(side>0?-.7:0));shop.rotation.y=side<0?Math.PI/2:-Math.PI/2;k.root.add(shop);
      const facade=i%3===0?m.enamel:i%3===1?m.panel:m.structure;
      const height=h+(side>0?2:0);
      k.box({p:[0,height/2,-d/2-.2],s:[w,height,d]},facade,shop);
      k.box({p:[0,.18,.05],s:[w+.25,.36,1.1]},m.structure,shop);
      k.box({p:[0,4.1,.05],s:[w+.2,.22,.55]},m.metal,shop);
      k.box({p:[0,height+.12,-d/2],s:[w+.5,.3,d+.6]},m.dark,shop);
      for(const x of [-w/2,w/2]) k.box({p:[x,height+.45,-d/2],s:[.2,.7,d+.5]},m.panel,shop);
      k.box({p:[0,height+.45,.18],s:[w,.7,.18]},m.panel,shop);
      k.box({p:[w*.18,height+.7,-d*.62],s:[2,1.2,2.4]},m.metal,shop);
      shop.updateMatrix();
      dressRoof(dress,cm,shop.matrix.clone().multiply(new T.Matrix4().makeTranslation(0,0,-d/2-.2)),w,height+.3,d,roofRandom,{parapet:false,sign:i===2||i===5});
      // Three kinds of street frontage: workshop shutter, glazed parts shop, recessed loading bay.
      if(i%3===0){
        k.box({p:[-.9,1.9,.04],s:[w*.65,3.3,.15]},m.dark,shop);
        for(let y=.4;y<3.4;y+=.18) k.box({p:[-.9,y,.13],s:[w*.62,.12,.09]},m.metal,shop);
        k.box({p:[-.9,3.65,.5],s:[w*.7,.15,1.3]},m.enamel,shop);
      }else if(i%3===1){
        k.box({p:[-1,1.95,.04],s:[w*.65,2.9,.15]},m.dark,shop);
        for(let x=-w*.36;x<w*.2;x+=1.6){k.box({p:[x,1.95,.14],s:[1.35,2.6,.05]},m.glazing,shop);k.box({p:[x,1.08,.18],s:[1.36,.055,.06]},m.metal,shop);}
        k.box({p:[-1,3.55,.68],s:[w*.7,.14,1.7],r:[.09,0,0]},m.red,shop);
        k.box({p:[-1,3.44,1.45],s:[w*.65,.04,.06]},m.warm,shop);
      }else{
        k.box({p:[-1,1.8,.025],s:[w*.62,3.5,.12]},m.dark,shop);
        for(const x of [-w*.4,w*.22])k.box({p:[x,1.9,.4],s:[.32,3.8,.9]},m.enamel,shop);
        k.box({p:[-1,3.9,.4],s:[w*.7,.35,.9]},m.structure,shop);
        for(const x of [-2,0])k.box({p:[x,.55,.15],s:[1.2,1.1,.25]},m.brass,shop);
      }
      k.box({p:[w*.34,1.55,.08],s:[1.25,3,.18]},m.dark,shop);
      k.box({p:[w*.34,2,.2],s:[.96,1.55,.035]},i===4?m.warm:m.glazing,shop);
      k.box({p:[w*.34+.4,1.3,.24],s:[.035,.35,.06]},m.brass,shop);
      k.box({p:[-.4,4.48,.12],s:[w*.85,.55,.22]},m.dark,shop);
      if(i!==3)k.label(shops[(i+(side>0?1:0))%shops.length],{p:[-.4,4.48,.25]},w*.78,i%2?'#b1cfca':'#dfc39b',shop);
      const columns=Math.floor(w/2.3),rows=Math.floor((height-5)/2.5);
      for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
        const x=(col-(columns-1)/2)*2.3,y=5.65+row*2.5;
        k.box({p:[x,y,-.13],s:[1.5,1.65,.18]},m.dark,shop);
        k.box({p:[x,y,.01],s:[1.25,1.4,.06]},(row*3+col+i)%11===0?m.warm:m.glazing,shop);
        k.box({p:[x,y-.85,.13],s:[1.7,.1,.38]},m.metal,shop);
      }
      // Windows continue around solid end walls, so alleys reveal depth instead of blank planes.
      for(const edge of [-1,1])for(let y=5.65;y<height-1;y+=2.5)for(let z=-2;z>-d+1;z-=2.3)k.box({p:[edge*(w/2+.025),y,z],s:[.06,1.4,1.15]},m.glazing,shop);
      for(const y of [4.9,height-1]) k.box({p:[0,y,-d/2],s:[w+.18,.13,d+.2]},m.metal,shop);
      pipe(k,new T.Vector3(w/2-.3,.4,.24),new T.Vector3(w/2-.3,height,.24),.05,m.metal,shop);
      if(i===1||i===3){
        const lx=-w*.35;for(const dx of [-.32,.32])k.box({p:[lx+dx,height*.55,.5],s:[.045,height*.8,.045]},m.metal,shop);
        for(let y=2;y<height-1;y+=.4)k.box({p:[lx,y,.5],s:[.65,.035,.05]},m.metal,shop);
        for(const y of [6,11])if(y<height)k.box({p:[lx,y,.75],s:[1.35,.1,1.4]},m.structure,shop);
      }
    });
    // Raised service walk, drainage slots, bollards and conduits catch light close to camera.
    k.box({ p: [side * 5.6, .13, -28], s: [1.1, .26, 82] }, m.panel);
    for (let z = 7; z > -60; z -= 3) {
      k.box({ p: [side * 5, .043, z], s: [.36, .025, .85] }, m.dark);
      for (let dz = -.3; dz <= .3; dz += .15) k.box({ p: [side * 5, .062, z + dz], s: [.32, .025, .025] }, m.metal);
    }
    for (let z = 3; z > -60; z -= 14) {
      k.mesh(k.ownGeometry(new T.CylinderGeometry(.095, .13, .85, 12)), m.structure, { p: [side * 4.6, .45, z] });
      k.mesh(k.ownGeometry(new T.CylinderGeometry(.102, .102, .14, 12)), m.brass, { p: [side * 4.6, .7, z] });
    }
  }
  // Cable trays and suspended service lines: an occupied city, not free-standing cubes.
  for (const z of [-10, -35, -52]) {
    k.box({ p: [0, 7.7, z], s: [13.7, .17, .3] }, m.structure);
    for (const x of [-6.2, 6.2]) k.box({ p: [x, 5.8, z], s: [.14, 4.1, .14] }, m.metal);
    for (const x of [-.4, 0, .4]) {
      const pts = [new T.Vector3(-6.2, 7.4 + x, z), new T.Vector3(0, 6.6 + x, z + .3), new T.Vector3(6.2, 7.4 + x, z)];
      k.mesh(k.ownGeometry(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 24, .022, 5, false)), m.rubber, { p: [0, 0, 0] });
    }
  }
  // Broken pavement and compact cargo stacks preserve the safe guided center lane.
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? -1 : 1, x = side * rand(3.6, 4.6), z = rand(-57, 5);
    k.box({ p: [x, .2, z], s: [rand(.35, .9), .28, rand(.4, 1)], r: [rand(-.15, .15), rand(-1, 1), rand(-.2, .2)] }, i % 3 ? m.panel : m.dark);
  }
  for (const [x, z] of [[-4.2, -17], [4.2, -45]]) {
    k.box({ p: [x, .5, z], s: [.95, .9, 1.1] }, m.enamel);
    for (const xx of [-.32, .32]) k.box({ p: [x + xx, .52, z + .56], s: [.035, .85, .035] }, m.metal);
    k.box({ p: [x, .75, z + .575], s: [.56, .18, .02] }, m.brass);
  }
  const kit = batchStaticGeometry(k);
  dress.build();
  const disposeKit = kit.dispose.bind(kit);
  kit.dispose = () => { disposeKit(); map.dispose(); };
  return kit;
}

/** Compact yard neighbors retain depth in the workshop's wide shots at low draw cost. */
export function createYardSurroundings() {
  const k = new SceneKit('bay6-yard-surroundings'), m = palette(k);
  for (const [x, z, w, h, d] of [[-10, -15, 6, 10, 8], [11, -16, 7, 12, 9], [-9, -29, 7, 15, 8], [15, -31, 8, 17, 11], [-13, 3, 7, 8, 8], [13, 4, 7, 9, 8]]) {
    k.box({ p: [x, h / 2, z], s: [w, h, d] }, m.panel);
    for (let y = 1.5; y < h; y += 2.1) for (let xx = -w / 2 + .8; xx < w / 2; xx += 1.6) {
      k.box({ p: [x + xx, y, z + d / 2 + .025], s: [1.1, 1.25, .07] }, m.dark);
      k.box({ p: [x + xx, y, z + d / 2 + .07], s: [.9, 1.05, .035] }, Math.round(y + xx) % 9 ? m.glazing : m.warm);
      k.box({ p: [x + xx, y - .66, z + d / 2 + .2], s: [1.25, .09, .45] }, m.metal);
    }
    for (const side of [-1,1]) for(let y=1.5;y<h;y+=2.1)for(let zz=-d/2+1;zz<d/2;zz+=1.9){
      k.box({p:[x+side*(w/2+.035),y,z+zz],s:[.07,1.25,1.15]},m.dark);
      k.box({p:[x+side*(w/2+.08),y,z+zz],s:[.035,1.05,.95]},m.glazing);
      k.box({p:[x+side*(w/2+.14),y-.67,z+zz],s:[.3,.09,1.3]},m.metal);
    }
    k.box({p:[x,h+.85,z],s:[w*.45,1.3,d*.35]},m.dark);
    for (let y = 3; y < h; y += 4.2) k.box({ p: [x, y, z + d / 2 + .05], s: [w, .12, .3] }, m.structure);
    k.box({ p: [x, h + .18, z], s: [w + .3, .3, d + .3] }, m.structure);
  }
  k.box({p:[0,-.25,-15],s:[45,.45,62]},m.structure);
  for (const x of [-4.65, 4.65]) {
    for (let z = 11; z > -8; z -= 3) {
      k.box({ p: [x, .6, z], s: [.11, 1.2, .11] }, m.metal);
      for (const y of [.45, 1]) k.box({ p: [x, y, z - 1.5], s: [.06, .06, 3] }, m.structure);
    }
  }
  return batchStaticGeometry(k);
}
