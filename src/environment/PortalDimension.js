import * as THREE from 'three';
import {createGeometryKit} from '../systems/GeometryKit.js';
import {createCinematicDetails} from './CinematicDetails.js';
import {createPortalArt} from './PortalArt.js';
import {patchWarpTree,warpUniforms} from '../effects/WorldWarp.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
export function createPortalDimension(){
const scene=new THREE.Group();scene.name='PortalDimension';
const {mesh,box,cylinderBetween,materials,random,rand}=createGeometryKit(scene);
// A single fractured street, with layered stone edges and exposed reinforcing steel.
const groundCanvas=document.createElement('canvas');groundCanvas.width=groundCanvas.height=512;
const gx=groundCanvas.getContext('2d');gx.fillStyle='#78808b';gx.fillRect(0,0,512,512);
for(let i=0;i<27000;i++){const c=Math.floor(rand(65,170));gx.fillStyle=`rgba(${c},${c},${c+3},${rand(.1,.32)})`;gx.fillRect(rand(0,512),rand(0,512),rand(1,3),rand(1,3));}
gx.strokeStyle='#444955';gx.lineWidth=1;
for(let i=0;i<13;i++){gx.beginPath();let x=rand(0,512),y=rand(0,512);gx.moveTo(x,y);for(let j=0;j<5;j++){x+=rand(-55,55);y+=rand(10,50);gx.lineTo(x,y);}gx.stroke();}
const groundTexture=new THREE.CanvasTexture(groundCanvas);groundTexture.wrapS=groundTexture.wrapT=THREE.RepeatWrapping;groundTexture.repeat.set(3,12);groundTexture.colorSpace=THREE.SRGBColorSpace;
groundTexture.anisotropy=8;
const groundMat=new THREE.MeshStandardMaterial({map:groundTexture,bumpMap:groundTexture,bumpScale:.045,color:'#8b929e',roughness:.94,metalness:0,envMapIntensity:.025});
// The street runs on past the crater and into the seam, then breaks off into the void.
const ROAD_NEAR=25,ROAD_FAR=-50,ROAD_LEN=ROAD_NEAR-ROAD_FAR,ROAD_MID=(ROAD_NEAR+ROAD_FAR)/2;
groundTexture.repeat.set(3,12*ROAD_LEN/40);
const road=mesh(new THREE.BoxGeometry(10.8,.7,ROAD_LEN,36,1,Math.round(ROAD_LEN*3)),groundMat,0,-.5,ROAD_MID);road.name='road';
box(10.5,1.2,ROAD_LEN-1,materials.edge,.1,-1.3,ROAD_MID-.1);
for(let i=0;i<22;i++){
  const side=i%2===0?-1:1,z=rand(-26,11),x=side*rand(4.6,6.8);
  const rubble=mesh(new THREE.DodecahedronGeometry(rand(.3,1.1),0),materials.concrete,x,rand(-.9,.1),z);rubble.scale.set(rand(.8,2),rand(.2,.65),rand(.6,1.6));rubble.rotation.set(rand(0,3),rand(0,3),rand(0,3));
}
// Faded lane markings and wet-looking seams give the floor a human scale.
const roadPaint=new THREE.MeshStandardMaterial({color:'#b9a56e',roughness:1,transparent:true,opacity:.42});
for(let i=0;i<16;i++)box(.1,.012,1.6,roadPaint,-.7,-.14,10-i*3.8);
for(let i=0;i<13;i++)box(10.5,.015,.025,materials.dark,0,-.13,10-i*4.7);
for(let i=0;i<13;i++){
  const x=rand(-4.8,4.8),z=rand(-23,9),r=rand(.05,.2);
  const stone=mesh(new THREE.DodecahedronGeometry(r),materials.edge,x,-.08,z);stone.rotation.set(random()*3,random()*3,random()*3);
}
// Sparse structural scars keep the road graphic and directional without making it busy.
const roadScarMat=new THREE.MeshBasicMaterial({color:'#252d3a',transparent:true,opacity:.38,depthWrite:false});
function roadScar(points,opacity=.38){
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(([x,y,z])=>new THREE.Vector3(x,y,z))),roadScarMat.clone());line.material.opacity=opacity;scene.add(line);return line;
}
roadScar([[-3.9,-.135,5.2],[-3.5,-.135,3.8],[-3.8,-.135,2.4]],.3);
roadScar([[2.9,-.134,-2.2],[3.2,-.134,-3.1],[2.8,-.134,-4.4]],.27);
roadScar([[-1.9,-.134,-7.8],[-1.3,-.134,-8.3],[-1.55,-.134,-9.1]],.34);
const tyreMat=new THREE.MeshBasicMaterial({color:'#18202b',transparent:true,opacity:.2,depthWrite:false});
for(const x of [-1.05,1.55]){const tyre=mesh(new THREE.PlaneGeometry(.18,4.8),tyreMat,x,-.136,-5.1);tyre.rotation.x=-Math.PI/2;tyre.rotation.z=(x<0?.035:-.025);}
// Broken parapets frame the path rather than hiding the companion.
for(const side of [-1,1]){
  for(let i=0;i<7;i++){
    const z=8-i*5.2;
    if((side===1&&i===4)||(side===-1&&i===2))continue;
    box(.52,.85,rand(2,4),materials.concrete,side*5.1,.22,z);
    box(.64,.13,rand(2,4),groundMat,side*5.1,.72,z);
  }
  for(let i=0;i<6;i++)cylinderBetween(new THREE.Vector3(side*5.5,-.7,-25+i*.3),new THREE.Vector3(side*rand(6,8),rand(-.4,1),-25+i*.3),.025,materials.metal);
}
// The extended stretch toward the seam. Its own seed, so the original city layout is unchanged.
{
  let s=917;const r=(a,b)=>{s=(s*1664525+1013904223)>>>0;return a+s/4294967296*(b-a);};
  for(const side of [-1,1])for(let i=7;i<11;i++){
    if((side===1&&i===9)||(side===-1&&i===8))continue;
    const z=8-i*5.2;
    box(.52,.85,r(2,4),materials.concrete,side*5.1,.22,z).rotation.z=side*r(0,.06);
    box(.64,.13,r(2,4),groundMat,side*5.1,.72,z);
  }
  for(let i=0;i<14;i++){
    const side=i%2===0?-1:1,rubble=mesh(new THREE.DodecahedronGeometry(r(.3,1.1),0),materials.concrete,side*r(4.6,6.8),r(-.9,.1),r(ROAD_FAR+3,-26));
    rubble.scale.set(r(.8,2),r(.2,.65),r(.6,1.6));rubble.rotation.set(r(0,3),r(0,3),r(0,3));
  }
  for(let i=0;i<9;i++){const stone=mesh(new THREE.DodecahedronGeometry(r(.05,.2)),materials.edge,r(-4.8,4.8),-.08,r(ROAD_FAR+4,-23));stone.rotation.set(r(0,3),r(0,3),r(0,3));}
  // A ragged far edge: tilted, half-detached slabs instead of a clean cut.
  for(let i=0;i<7;i++){
    const slab=box(r(1.2,2.4),.62,r(1.4,2.6),groundMat,-4.6+i*1.55+r(-.2,.2),-.55-r(0,.6),ROAD_FAR-r(.4,1.8));
    slab.rotation.set(r(-.35,.05),r(-.3,.3),r(-.18,.18));
  }
}

const floating=[];
const windowLight=new THREE.MeshStandardMaterial({color:'#42536d',roughness:.22,metalness:.62,envMapIntensity:.65});
const wallCanvas=document.createElement('canvas');wallCanvas.width=wallCanvas.height=256;const wc=wallCanvas.getContext('2d');wc.fillStyle='#c3c5cb';wc.fillRect(0,0,256,256);
for(let i=0;i<5000;i++){const v=Math.floor(rand(120,205));wc.fillStyle=`rgba(${v},${v+3},${v},.12)`;wc.fillRect(rand(0,256),rand(0,256),rand(1,5),rand(2,11));}
for(let i=0;i<10;i++){const x=rand(0,256);const g=wc.createLinearGradient(x,0,x+13,0);g.addColorStop(0,'#414c4630');g.addColorStop(1,'#414c4600');wc.fillStyle=g;wc.fillRect(x,0,13,256);}
const wallTexture=new THREE.CanvasTexture(wallCanvas);wallTexture.colorSpace=THREE.SRGBColorSpace;wallTexture.wrapS=wallTexture.wrapT=THREE.RepeatWrapping;
// One material per facade colour, shared by every building, so the city batches into few draws.
const facades=['#647286','#464d5e','#858a94','#4e6973','#807b7e'].map((color,i)=>new THREE.MeshStandardMaterial({map:wallTexture,bumpMap:wallTexture,bumpScale:.025,color,roughness:.78+i*.045,envMapIntensity:.18}));
function building(x,y,z,w,h,d,tilt=0){
  const g=new THREE.Group();scene.add(g);g.position.set(x,y,z);g.rotation.z=tilt;
  const facade=facades[Math.floor(random()*facades.length)];rand(0,1); // keep the seeded layout identical
  box(w,h,d,facade,0,h/2,0,g);
  const sill=materials.metal;
  for(let fy=1;fy<h-.8;fy+=1.5){
    box(w+.12,.06,d+.12,materials.dark,0,fy,0,g);
    for(let fx=-w/2+.5;fx<w/2-.2;fx+=1.1){
      const lit=random()>.9;
      box(.48,.77,.025,lit?windowLight:materials.dark,fx,fy+.55,d/2+.02,g);
      box(.54,.04,.08,sill,fx,fy+.14,d/2+.035,g);
    }
  }
  box(w+.2,.2,d+.2,materials.edge,0,h,0,g);
  if(random()>.4){box(.3,2.2,.3,materials.metal,0,h+1,0,g);}
  return g;
}
building(-15,-4,-21,6,22,6,-.16);
building(-22,1,-41,8,30,8,.22);
building(17,-7,-29,2.5,26,7,-.2);
building(21,-7,-29,2.5,26,7,-.2);
building(27,8,-56,9,33,7,.19);
building(-35,6,-69,8,27,8,-.31);
building(9,-13,-53,6,15,7,.1);
building(-7,-9,-68,5,17,5,-.07);
for(let i=0;i<12;i++)building(rand(-65,65),rand(-30,18),rand(-130,-80),rand(4,9),rand(12,30),rand(4,9),rand(-.8,.8));
// A recognisable fragment of a San Fransokyo street sign.
const signGroup=new THREE.Group();scene.add(signGroup);signGroup.position.set(-4.9,0,-6);
cylinderBetween(new THREE.Vector3(0,0,0),new THREE.Vector3(.3,4.6,0),.07,materials.metal,signGroup);
const signCanvas=document.createElement('canvas');signCanvas.width=512;signCanvas.height=256;
const sc=signCanvas.getContext('2d');sc.fillStyle='#243c53';sc.fillRect(0,0,512,256);sc.strokeStyle='#bbc9da';sc.lineWidth=5;sc.strokeRect(12,12,488,232);sc.fillStyle='#d6dee9';sc.font='25px sans-serif';sc.textAlign='center';sc.fillText('SAN FRANSOKYO',256,82);sc.font='bold 65px sans-serif';sc.fillText('NORTH',256,158);sc.font='27px sans-serif';sc.fillText('↗   14TH STREET',256,212);
const signTex=new THREE.CanvasTexture(signCanvas);signTex.colorSpace=THREE.SRGBColorSpace;
const sign=box(2.3,1.15,.07,new THREE.MeshStandardMaterial({map:signTex,roughness:.75}),.35,3.6,.03,signGroup);sign.rotation.z=-.08;
// A broken suspension cable and hanging bridge ribs.
for(let side of [-1,1]){
  const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(side*7,13,8),new THREE.Vector3(side*6.3,6,-5),new THREE.Vector3(side*6.1,6,-19),new THREE.Vector3(side*7.5,15,-34)]);
  mesh(new THREE.TubeGeometry(curve,45,.035,6,false),materials.metal);
  for(let i=0;i<7;i++){
    const pt=curve.getPoint(.12+i*.1);cylinderBetween(pt,new THREE.Vector3(side*5.6,.5,pt.z),.018,materials.metal);
  }
}
// Drifting chunks visibly retain traces of the city.
const debris=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),materials.concrete,46);
scene.add(debris);debris.castShadow=true;
for(let i=0;i<46;i++){
  const g=new THREE.Object3D(),side=random()>.5?1:-1;
  g.position.set(side*rand(8,42),rand(-13,23),rand(-78,0));
  const s=rand(.35,2.6);g.scale.set(s*rand(1,3),s*.5,s*rand(1,2));
  g.rotation.set(rand(-.6,.6),rand(-1,1),rand(-.7,.7));
  g.updateMatrix();debris.setMatrixAt(i,g.matrix);
  floating.push({obj:g,y:g.position.y,speed:rand(.15,.35),phase:rand(0,6.3),amp:rand(.1,.5)});
}

// A ruined wall gives the body a grounded resting place.
box(4.2,1.6,.65,materials.concrete,3.05,.65,-13.05).rotation.z=.04;
box(1.4,2.6,.7,materials.concrete,4.8,1.05,-13.1).rotation.z=-.15;

// The sky is a pale, folded rupture rather than a conventional outer-space backdrop.
function softTexture(){
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');
  const g=ctx.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(230,239,255,.8)');g.addColorStop(.2,'rgba(185,209,255,.25)');g.addColorStop(1,'rgba(150,190,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);
}
const mistTexture=softTexture();
const mistLayers=[];
const skyMaterial=new THREE.ShaderMaterial({
  uniforms:{uTime:{value:0},uTear:{value:0}},depthWrite:false,
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`
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
    }`
});
mesh(new THREE.PlaneGeometry(230,150),skyMaterial,0,8,-158).castShadow=false;
// Low mist passes across the broken roadway; a quiet glow separates the shell from the void.
for(let i=0;i<8;i++){
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:mistTexture,color:'#6ea7cd',transparent:true,opacity:.12,depthWrite:false,blending:THREE.AdditiveBlending}));
  s.position.set(rand(-10,10),rand(.2,1.7),-16-i*4);s.scale.set(rand(13,21),rand(1.8,3.6),1);scene.add(s);mistLayers.push({sprite:s,x:s.position.x});
}
const backGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:mistTexture,color:'#88c5ed',transparent:true,opacity:.3,depthWrite:false,blending:THREE.AdditiveBlending}));backGlow.position.set(2.7,4,-18);backGlow.scale.set(17,15,1);scene.add(backGlow);
// The primary dimensional landmark: a vertical architectural seam, half swallowed
// by the mid-city blocks rather than a conventional circular portal.
const anomaly=new THREE.Group();scene.add(anomaly);anomaly.position.set(1.8,4.2,-34);anomaly.rotation.z=-.08;
const seamCurve=new THREE.CatmullRomCurve3([
  new THREE.Vector3(-.35,-5.8,.2),new THREE.Vector3(.1,-2.2,0),new THREE.Vector3(-.18,1.5,.05),
  new THREE.Vector3(.42,5.2,-.02),new THREE.Vector3(.08,9.4,.02),new THREE.Vector3(.55,13.4,0)
]);
const seamFringe=new THREE.MeshBasicMaterial({color:'#756b9e',transparent:true,opacity:.12,blending:THREE.AdditiveBlending,depthWrite:false});
const seamHalo=new THREE.MeshBasicMaterial({color:'#72c9ef',transparent:true,opacity:.1,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
// A narrow, layered spatial cut: a dark core, offset refractive planes and a restrained cyan edge.
const seamCore=new THREE.Mesh(new THREE.TubeGeometry(seamCurve,64,.12,7,false),new THREE.MeshBasicMaterial({color:'#07111d',transparent:true,opacity:.94,depthWrite:false}));anomaly.add(seamCore);
const seamEdge=new THREE.Mesh(new THREE.TubeGeometry(seamCurve,64,.035,6,false),new THREE.MeshBasicMaterial({color:'#e2f8ff',toneMapped:false}));anomaly.add(seamEdge);
anomaly.add(new THREE.Mesh(new THREE.TubeGeometry(seamCurve,64,.24,8,false),seamFringe));
for(const [x,y,rot,s,z] of [[-.8,1.2,-.16,1.2,-.14],[.75,4.9,.19,.8,-.22],[-.35,8.1,-.08,.62,-.3]]){
  const shard=new THREE.Mesh(new THREE.PlaneGeometry(1.2,7.4),seamHalo);shard.position.set(x,y,z);shard.rotation.z=rot;shard.scale.set(s,1,1);anomaly.add(shard);
}
const anomalyLight=new THREE.PointLight('#a9e7ff',2.2,20,2);anomalyLight.position.set(.1,3.7,.2);anomaly.add(anomalyLight);
for(let i=0;i<25;i++){
  const m=new THREE.SpriteMaterial({map:mistTexture,color:i%5===0?'#836eae':'#65a8cd',transparent:true,opacity:rand(.05,.16),depthWrite:false,blending:THREE.AdditiveBlending});
  const s=new THREE.Sprite(m);s.position.set(rand(-70,70),rand(-5,35),rand(-150,-55));s.scale.set(rand(25,70),rand(10,40),1);scene.add(s);
}
const riftGroup=new THREE.Group();scene.add(riftGroup);riftGroup.position.set(6,27,-106);riftGroup.rotation.z=-.45;
for(let i=0;i<9;i++){
  const curve=new THREE.EllipseCurve(0,0,rand(25,42),rand(9,14),rand(-.2,.1),rand(3.8,5.8),false,0);
  const pts=curve.getPoints(140).map(v=>new THREE.Vector3(v.x,v.y,rand(-.1,.1)));
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:i%3===0?'#c9ded0':'#7fa8a5',transparent:true,opacity:rand(.12,.4)}));line.position.y=rand(-2,2);riftGroup.add(line);
}
const dustCount=900,dustPositions=new Float32Array(dustCount*3);
for(let i=0;i<dustCount;i++){dustPositions[i*3]=rand(-50,50);dustPositions[i*3+1]=rand(-12,30);dustPositions[i*3+2]=rand(-95,15);}
const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));
const dust=new THREE.Points(dustGeo,new THREE.PointsMaterial({color:'#bdd5c6',map:mistTexture,size:.065,transparent:true,opacity:.44,depthWrite:false,blending:THREE.AdditiveBlending}));scene.add(dust);
// Distinct fragments crossing the void give the scene depth and scale.
for(let i=0;i<7;i++){
  const lineGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(rand(-40,40),rand(0,28),-65),new THREE.Vector3(rand(-30,30),rand(10,38),-95)]);
  scene.add(new THREE.Line(lineGeo,new THREE.LineBasicMaterial({color:'#9fbeb2',transparent:true,opacity:.13})));
}
scene.add(new THREE.HemisphereLight('#b8cee8','#161d30',.65));
const key=new THREE.DirectionalLight('#ece7db',1.8);key.position.set(-7,15,-4);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-11;key.shadow.camera.right=11;key.shadow.camera.top=14;key.shadow.camera.bottom=-14;key.shadow.camera.near=.5;key.shadow.camera.far=42;key.shadow.normalBias=.024;key.shadow.bias=-.00015;key.shadow.autoUpdate=false;key.shadow.needsUpdate=true;scene.add(key);scene.add(key.target);key.target.position.set(1,0,-10);
key.shadow.mapSize.set(4096,4096);key.shadow.radius=3;
const rim=new THREE.DirectionalLight('#8ed4ff',1.25);rim.position.set(12,8,-30);scene.add(rim);
const front=new THREE.PointLight('#c7d7ec',1.1,24,1.8);front.position.set(-2,5,-4);scene.add(front);
// Broad reflected sky warmth, without a spotlight cone on the character.
const companionLight=new THREE.DirectionalLight('#ffe4c5',.55);companionLight.position.set(-4,8,3);scene.add(companionLight);
const details=createCinematicDetails(scene,{mesh,box,materials,rand,building,mistTexture});
const art=createPortalArt(scene,{mesh,box,materials,rand,mistTexture});
// The new escape opening looks back along the near end of the same fractured street.
// Ground and surrounding mass continue to the gate; it never hangs over an empty void.
for(const side of [-1,1]) {
  const near=building(side*9.4,-.8,19,5.6,17,9,side*.045);near.rotation.y=Math.PI;
  const far=building(side*18,-2,39,8,24,11,-side*.08);far.rotation.y=Math.PI;
  for(const z of [15,20,24]) {
    box(.52,.85,3.1,materials.concrete,side*5.1,.22,z);
    box(.64,.13,3.2,groundMat,side*5.1,.72,z);
  }
}
for(const z of [14,18,22])box(.1,.012,1.6,roadPaint,-.7,-.14,z);
const reverseSky=mesh(new THREE.PlaneGeometry(900,600),skyMaterial,0,8,170);reverseSky.rotation.y=Math.PI;reverseSky.castShadow=false;


// Bake every static opaque surface into one mesh per material. The city was ~330 separate
// draws (each repeated in the shadow, AO and depth-of-field passes); merged it is a few dozen.
// Only transforms are baked: materials stay shared, so sign flicker and emissive pulses still work.
// Moving or toggled groups (debris, sign, cable, anomaly, sliding blocks) stay live.
const animatedRoots=new Set([...floating.map(f=>f.obj),signGroup,anomaly,riftGroup,...details.animatedRoots]);
/** Merges the static opaque meshes under `root` (skipping `skip` subtrees) into one mesh per material, in root space. */
function mergeStatic(root,skip){
  root.updateMatrixWorld(true);
  const toRoot=new THREE.Matrix4().copy(root.matrixWorld).invert(),groups=new Map();
  root.traverse(obj=>{
    if(!obj.isMesh||obj.isInstancedMesh||Array.isArray(obj.material)||obj.material.transparent||obj.material.isShaderMaterial||!obj.visible)return;
    let parent=obj;while(parent&&parent!==root){if(skip.has(parent))return;parent=parent.parent;}
    // Thin facade pieces (windows, sills) never cast: they only add shadow acne.
    const p=obj.geometry.parameters,cast=obj.castShadow&&!(p&&p.depth!==undefined&&p.depth<=.1);
    const attrs=Object.keys(obj.geometry.attributes).sort().join(',');
    const key=`${obj.material.uuid}/${cast?1:0}${obj.receiveShadow?1:0}/${obj.geometry.index?'i':'n'}/${attrs}`;
    if(!groups.has(key))groups.set(key,{material:obj.material,cast,receive:obj.receiveShadow,objects:[]});
    groups.get(key).objects.push(obj);
  });
  for(const {material,cast,receive,objects} of groups.values()){
    if(objects.length<2)continue;
    const geometry=mergeGeometries(objects.map(obj=>obj.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot,obj.matrixWorld))));
    if(!geometry)continue;
    objects.forEach(obj=>obj.parent.remove(obj));
    geometry.computeBoundingSphere();
    const merged=new THREE.Mesh(geometry,material);merged.name='static-merged';
    merged.castShadow=cast;merged.receiveShadow=receive;merged.matrixAutoUpdate=false;root.add(merged);
  }
}
mergeStatic(scene,animatedRoots);
// Moving groups still hold together as rigid bodies: merge inside each, leaving the swinging sign itself live.
for(const group of animatedRoots)if(group.isGroup)mergeStatic(group,new Set([sign]));


let lastShadow=0;
// Every lit material shares the warp patch; compiled once with the rest of the scene.
patchWarpTree(scene);
const mistBase=mistLayers.map(h=>h.sprite.position.clone());
let dustSpin=1,dustKick=0,mistPush=0;const pushFrom=new THREE.Vector3();
let instability=0;
const keyOffset=key.position.clone().sub(key.target.position);
return {group:scene,anomaly,anomalyLight,signs:art,
 /** Impact response outside the warp shader: particles reverse, fog is shoved, signs fail. */
 impulse(position,power){dustSpin=-1;dustKick=Math.min(1.5,dustKick+power);mistPush=Math.min(1,mistPush+power);pushFrom.copy(position);art.flicker(power);},
 dispose(){const geos=new Set(),mats=new Set(),textures=new Set();scene.traverse(obj=>{if(obj.geometry)geos.add(obj.geometry);if(obj.material){for(const mat of Array.isArray(obj.material)?obj.material:[obj.material]){mats.add(mat);for(const value of Object.values(mat))if(value?.isTexture)textures.add(value);}}});geos.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());mats.forEach(m=>m.dispose());},
 /** @param {number} t @param {number} dt @param {boolean} reduced @param {number} [progress] @param {string} [phase] @param {any} [seq] @param {any} [focus] */
 update(t,dt,reduced,progress=0,phase='approaching',seq=null,focus=null){
 const charged=['ignition','chase','fracture','pulled'].includes(phase)?1:0;
 instability=THREE.MathUtils.damp(instability,charged?THREE.MathUtils.clamp((seq?.tear??0)*.82+(phase==='chase'?.2:0),0,1):0,charged?1.15:2.4,dt);
 if(!reduced){floating.forEach((f,i)=>{const pull=instability*Math.max(0,1-Math.abs(f.obj.position.z+34)/55);f.obj.position.y=f.y+Math.sin(t*f.speed+f.phase)*f.amp+pull*Math.sin(t*1.7+f.phase)*.32;f.obj.position.x+=Math.sign(1.8-f.obj.position.x)*pull*dt*.18;f.obj.rotation.y+=dt*(.006+pull*.05);f.obj.updateMatrix();debris.setMatrixAt(i,f.obj.matrix);});debris.instanceMatrix.needsUpdate=true;riftGroup.rotation.z=-.45+Math.sin(t*.04)*.015+instability*Math.sin(t*5.3)*.018;skyMaterial.uniforms.uTime.value=t;}
 // Dust drifts one way; an impact briefly reverses it, then it recovers.
 dustSpin=THREE.MathUtils.damp(dustSpin,1,.8,dt);dustKick=Math.max(0,dustKick-dt*.9);
 if(!reduced){dust.rotation.y+=dt*.001*dustSpin+dustKick*dt*.012*dustSpin;dust.position.y=Math.sin(t*.7)*dustKick*.25;}
 details.update(t,dt,reduced,progress);
 art.update(reduced?0:t,dt);
 mistPush=Math.max(0,mistPush-dt*.35);
 if(!reduced){sign.rotation.z=-.08+Math.sin(t*.21)*.009;mistLayers.forEach((h,i)=>{const base=mistBase[i];const away=base.x-pushFrom.x;h.sprite.position.x=base.x+Math.sin(t*.04+i)*.7+Math.sign(away||1)*mistPush*2.5+Math.sign(1.8-base.x)*instability*.7;h.sprite.position.y=base.y+mistPush*.6+instability*.18;h.sprite.material.opacity=.12*(1-progress*.65)*(1+mistPush*.8+instability*.55);});anomaly.rotation.y=Math.sin(t*.07)*.012+instability*Math.sin(t*6.1)*.014;anomaly.rotation.x=instability*Math.sin(t*4.3)*.009;anomaly.position.x=1.8+Math.sin(t*.035)*.035+instability*Math.sin(t*5.7)*.055;anomalyLight.intensity=2.2+instability*(.6+.45*Math.sin(t*8.4));seamEdge.material.opacity=1-instability*.18;seamFringe.opacity=.12+instability*.12;}
 dust.material.opacity=.44*(1-progress*.72)*(1+dustKick*.4);
 const tear=seq?seq.tear:0;skyMaterial.uniforms.uTear.value=tear;warpUniforms.uWarpTime.value=t;
 // The key light travels with the action so the chase keeps its shadows.
 if(focus){key.target.position.set(focus.x*.5,0,focus.z-3);key.position.copy(key.target.position).add(keyOffset);}
 const busy=['ignition','chase','fracture','pulled'].includes(phase);
 if(t-lastShadow>(busy?.05:.18)){key.shadow.needsUpdate=true;lastShadow=t;}
}};
}
