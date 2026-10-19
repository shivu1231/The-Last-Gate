import * as T from 'three';
import { SceneKit, seeded, type Pose } from '../phase2/SceneKit';
import { batchStaticGeometry } from '../phase4/environmentDetail';
import { buildSanFransokyo } from './SanFransokyoSkyline';

/** A complete inhabited waterfront, built once and batched by surface material. */
export function createSanFransokyo() {
  const k = new SceneKit('SanFransokyo'), random = seeded(10616), rand = (a: number, b: number) => a + random() * (b - a);
  const stone = k.standard('#788482', .88, .08), trim = k.standard('#4c656b', .55, .45);
  const dark = k.standard('#142b39', .36, .48), red = k.standard('#773e37', .7, .28);
  const warm = k.basic('#ddbc85', 1), cream = k.standard('#b8b5a0', .8, .1);
  const windows = [k.basic('#172c3a'), k.basic('#233e49'), k.basic('#c7ad79', .8), k.basic('#87aab3', .7)];
  const walls = ['#667b83', '#465d69', '#738084', '#4c6873'].map(c => k.standard(c, .82, .15));
  const ownTextures: T.Texture[] = [];

  // Broad, quiet sky; the moon and hills establish scale rather than a dense star field.
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d')!;
  const skyGradient = x.createLinearGradient(0, 0, 0, 256); skyGradient.addColorStop(0, '#071426'); skyGradient.addColorStop(.58, '#19374b'); skyGradient.addColorStop(1, '#53676b'); x.fillStyle = skyGradient; x.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 20; i++) { x.fillStyle = `rgba(133,166,177,${rand(.01,.035)})`; x.beginPath(); x.ellipse(rand(0,512),rand(85,175),rand(60,180),rand(2,9),-.08,0,Math.PI*2); x.fill(); }
  const skyTexture = new T.CanvasTexture(c); skyTexture.colorSpace = T.SRGBColorSpace; ownTextures.push(skyTexture);
  const skyMaterial = k.ownMaterial(new T.MeshBasicMaterial({ map: skyTexture, side: T.BackSide, depthWrite: false, fog: false, toneMapped: false }));
  skyMaterial.onBeforeCompile = shader => { shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\ngl_Position.z=gl_Position.w*.9999;'); };
  skyMaterial.customProgramCacheKey = () => 'waterfront-sky';
  const sky = k.mesh(new T.SphereGeometry(420,32,16), skyMaterial, { p: [0,0,90] }); sky.renderOrder = -800;
  k.mesh(new T.CircleGeometry(3.6,40), k.ownMaterial(new T.MeshBasicMaterial({ color:'#dbded0',side:T.DoubleSide,fog:false,toneMapped:false })), { p: [-100,83,230] });
  const hills = new T.Group(); k.root.add(hills);
  for (let i=0;i<7;i++) k.mesh(new T.SphereGeometry(rand(24,44),16,8,0,Math.PI*2,0,Math.PI/2),k.standard(i%2?'#223e4b':'#2e4953',1,0),{p:[-130+i*43,-7,220+rand(-10,15)],s:[1,.37,1]},hills);

  // Water reflections are one inexpensive surface, with continuous fine ripples.
  const waterMaterial = k.ownMaterial(new T.ShaderMaterial({ uniforms:{uTime:{value:0}}, vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader:`varying vec3 vP;uniform float uTime;void main(){float ripple=sin(vP.x*2.7+vP.z*4.2+uTime*.45)*sin(vP.z*8.-uTime*.7);float streak=pow(max(0.,sin(vP.x*.21+sin(vP.z*.12)*.13)),16.);float breakUp=.3+.7*pow(max(0.,.5+.5*sin(vP.z*5.+uTime*.3)),3.);vec3 col=vec3(.035,.09,.12)+ripple*.006+vec3(.11,.11,.075)*streak*breakUp;gl_FragColor=vec4(col,1.);}` }));
  k.mesh(new T.PlaneGeometry(310,210),waterMaterial,{p:[0,-1.15,128],r:[-Math.PI/2,0,0]});
  const built = new T.Group(); built.name='waterfront-architecture'; k.root.add(built);
  k.box({p:[0,-.6,32],s:[22,1.2,18]},stone,built);
  for(const xx of [-10.7,10.7]) { k.box({p:[xx,.15,32],s:[.35,.3,18]},cream,built); k.box({p:[xx,.7,32],s:[.07,.07,17.8]},trim,built); }
  for(const y of [.48,1.03]) k.box({p:[0,y,40.8],s:[21,.055,.055]},trim,built);
  for(let xx=-10;xx<=10;xx+=1.5) k.box({p:[xx,.51,40.8],s:[.065,1.05,.065]},trim,built);
  for(const xx of [-10.2,10.2]) for(const zz of [26,35]) { k.box({p:[xx,1.9,zz],s:[.1,3.8,.1]},trim,built); k.box({p:[xx,3.55,zz],s:[.45,.16,.45]},warm,built); }
  for(let xx=-9;xx<=9;xx+=3) k.box({p:[xx,.007,32],s:[.025,.015,17]},trim,built);
  k.box({p:[0,-1.1,164],s:[270,1,110]},stone,built);
  k.box({p:[0,1.25,109],s:[270,2.5,1]},trim,built);
  // A promenade and recognizable low-rise waterfront before the tall downtown blocks.
  for(let i=0;i<12;i++) {
    const xx=-100+i*17, width=rand(11,15), h=rand(6,10);
    k.box({p:[xx,h/2,116],s:[width,h,10]},i%3?cream:walls[1],built);
    k.box({p:[xx,h+.3,116],s:[width+1,.6,11]},trim,built);
    for(let col=0;col<5;col++) { const px=xx-width*.38+col*width*.19; k.box({p:[px,2.2,110.94],s:[1.9,3.5,.12]},dark,built); k.box({p:[px,2.3,110.86],s:[1.55,2.9,.05]},col%3?windows[1]:windows[2],built); }
    if(i%3===1) { k.box({p:[xx,4.6,109.8],s:[width*.75,.15,2.1],r:[-.13,0,0]},red,built); k.box({p:[xx,4.45,108.85],s:[width*.7,.05,.06]},warm,built); }
  }
  const tower=(xx:number,zz:number,w:number,d:number,h:number,style:number)=>{
    const material=walls[style%walls.length];
    k.box({p:[xx,h/2,zz],s:[w,h,d]},material,built);
    k.box({p:[xx,h+.4,zz],s:[w+.55,.8,d+.55]},trim,built);
    k.box({p:[xx,2.2,zz],s:[w+1.2,4.4,d+1.2]},material,built);
    for(let y=5.2;y<h-1;y+=2.65) {
      if(Math.round(y)%3===0) k.box({p:[xx,y-.95,zz],s:[w+.18,.15,d+.18]},trim,built);
      for(let col=-w/2+.8;col<w/2-.5;col+=1.75) {
        const lit=random(); k.box({p:[xx+col,y,zz-d/2-.035],s:[1.03,1.48,.08]},windows[lit>.88?2:lit>.79?3:style%2],built);
      }
      for(let col=-d/2+.8;col<d/2-.5;col+=1.85) for(const side of [-1,1]) k.box({p:[xx+side*(w/2+.035),y,zz+col],s:[.08,1.48,1]},windows[random()>.92?2:0],built);
    }
    if(style%3===0) { k.box({p:[xx,h+2.1,zz],s:[w*.6,3.5,d*.6]},material,built); k.box({p:[xx,h+4,zz],s:[w*.68,.3,d*.68]},warm,built); }
  };
  // Authored blocks leave the bay and bridge legible. Heights and setbacks have a hierarchy.
  for(const [xx,zz,w,d,h,style] of [[-73,143,12,13,31,0],[-52,149,10,12,44,1],[-31,145,13,13,32,2],[-12,160,12,14,67,3],[12,153,15,13,52,0],[34,160,12,13,39,2],[54,143,12,14,34,1],[75,151,15,14,47,0],[-91,169,14,16,41,3],[95,176,16,16,50,1],[-38,179,16,15,55,0],[38,184,17,15,64,2]]) tower(xx,zz,w,d,h,style);
  for(let i=0;i<16;i++) tower(-120+i*16+rand(-3,3),194+rand(-2,25),rand(7,12),rand(9,14),rand(18,43),i%4);
  // Distinct central stepped landmark, rather than an identical glowing box grid.
  for(let tier=0;tier<4;tier++) { const w=12-tier*2, y=63+tier*4.3; k.box({p:[-12,y,160],s:[w,4.3,w]},walls[3],built); k.box({p:[-12,y+2.15,160],s:[w+.8,.2,w+.8]},warm,built); }
  k.box({p:[-12,86,160],s:[.35,15,.35]},trim,built);

  // Hybrid suspension bridge: real paired pylons, road edge, catenary and suspension hangers.
  const cable=k.standard('#b38561',.56,.55);
  k.box({p:[0,7.1,91],s:[160,.65,5.2]},red,built);
  for(const zz of [88.5,93.5]) k.box({p:[0,8.1,zz],s:[160,.1,.1]},trim,built);
  for(const xx of [-38,38]) {
    for(const zz of [88.2,93.8]) k.box({p:[xx,15,zz],s:[1.5,33,1.7]},red,built);
    for(const y of [21,29.5]) { k.box({p:[xx,y,91],s:[6,.8,8.2]},red,built); k.box({p:[xx,y+.5,91],s:[7.7,.35,8.8],r:[0,0,.015]},trim,built); }
  }
  const link=(a:T.Vector3,b:T.Vector3,r:number,mat:T.Material)=>{const delta=b.clone().sub(a),mesh=k.mesh(new T.CylinderGeometry(r,r,delta.length(),6),mat,{p:a.clone().add(b).multiplyScalar(.5).toArray() as Pose['p']},built);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());};
  for(const zz of [88.3,93.7]) {
    const points:T.Vector3[]=[];
    for(let i=0;i<=64;i++) { const xx=-80+i*2.5, y=Math.abs(xx)<=38?12+17*(xx/38)**2:29-21*((Math.abs(xx)-38)/42); points.push(new T.Vector3(xx,y,zz)); if(i%2===0)link(new T.Vector3(xx,7.5,zz),new T.Vector3(xx,y,zz),.035,cable); }
    k.mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),96,.075,6),cable,{p:[0,0,0]},built);
  }
  const traffic=k.instances(Array.from({length:24},(_,i)=>({p:[-76+i*6.5,7.7,90+(i%2)*2] as Pose['p'],s:[.14,.12,.35] as Pose['s']})),warm,undefined,k.root);
  batchStaticGeometry(k); // Instanced traffic remains independent.
  k.root.traverse(o=>{o.castShadow=false;o.receiveShadow=false;const m=(o as T.Mesh).material;if(m)for(const material of Array.isArray(m)?m:[m])(material as T.Material & {fog:boolean}).fog=false;});
  let lastTraffic=-1;
  const dummy=new T.Object3D();
  k.root.visible=false;
  // Tracker P1-02: the detailed skyline from the finale (lit facades, bridge towers, turbines, signs)
  // stands behind this waterfront, turned to face the gate and pushed back past it.
  const far = new SceneKit('SanFransokyoFar'), skyline = buildSanFransokyo(far, new T.Vector3(-.3, .5, .6));
  far.root.rotation.y = Math.PI; far.root.position.set(0, -.5, 80); k.root.add(far.root);
  // Built for sunset; retinted to this night: cool bodies, blue haze, the lit windows kept.
  const nightBase = new T.Color('#2a4256'), nightHaze = new T.Color('#19374b');
  far.root.traverse(o => { const m = (o as T.Mesh).material as T.ShaderMaterial | undefined; const u = m?.uniforms; if (u?.uHaze && u.uBase) { u.uBase.value.lerp(nightBase, .7); u.uHaze.value.copy(nightHaze); } });
  let lastT = -1;
  return { group:k.root,thresholdZ:24,update(t:number){ skyline.update(t, lastT < 0 ? 0 : Math.min(.1, t - lastT)); lastT = t; waterMaterial.uniforms.uTime.value=t; if(t-lastTraffic>.1){lastTraffic=t;for(let i=0;i<24;i++){dummy.position.set(((i*6.5+t*(i%2?1.5:-1.5)+200)%156)-78,7.7,90+(i%2)*2);dummy.scale.set(.14,.12,.35);dummy.updateMatrix();traffic.setMatrixAt(i,dummy.matrix);}traffic.instanceMatrix.needsUpdate=true;} },dispose(){ownTextures.forEach(t=>t.dispose());skyline.dispose();far.dispose();k.dispose();} };
}
export type SanFransokyo=ReturnType<typeof createSanFransokyo>;
