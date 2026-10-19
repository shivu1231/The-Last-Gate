import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {patchWarpTree,warpUniforms} from '../effects/WorldWarp.js';
import {SEAM_POSITION,PULL_CONTACT_POSITION} from '../systems/SequenceDirector';

const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const span=(t,a,b)=>ease((t-a)/(b-a));
let seed=913;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const rand=(a,b)=>a+rnd()*(b-a);
function glowTexture(){
  const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');
  const g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.3,'rgba(255,255,255,.45)');g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);
}
const fullVertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
const noiseGLSL='float h1(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h1(i),h1(i+vec2(1,0)),f.x),mix(h1(i+vec2(0,1)),h1(i+vec2(1,1)),f.x),f.y);}';

/**
 * Everything Baymax's attacks do to the world, and the corridor they open. All of it is built
 * and compiled up front, with pooled effects, so nothing is created during the action.
 */
export function createRuptureSet(environment){
  const root=new THREE.Group();root.name='Rupture';
  const glow=glowTexture();
  const additive=(color,opacity=1)=>new THREE.SpriteMaterial({map:glow,color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending});
  const blastLight=new THREE.PointLight('#ff6a3a',0,18,1.8);root.add(blastLight);
  // ----------------------------------------------------------------- bolts
  const boltMat=()=>new THREE.MeshBasicMaterial({color:'#ffd9cf',transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  const bolts=[0,1].map(()=>{
    const g=new THREE.Group();g.visible=false;root.add(g);
    const core=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,1,8,1,true),boltMat());core.position.y=.5;g.add(core);
    const sheath=new THREE.Mesh(new THREE.CylinderGeometry(.16,.1,1,10,1,true),boltMat());sheath.material.color.set('#ff3a22');sheath.position.y=.5;g.add(sheath);
    const head=new THREE.Sprite(additive('#ffb09a',0));head.scale.setScalar(.42);root.add(head);
    return {g,core,sheath,head,from:new THREE.Vector3(),to:new THREE.Vector3(),age:9,flight:.2};
  });
  let boltIndex=0;
  // ----------------------------------------------------------------- impacts
  const ringMat=()=>new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,uniforms:{uAge:{value:9},uColor:{value:new THREE.Color()}},vertexShader:fullVertex,
    fragmentShader:'varying vec2 vUv;uniform float uAge;uniform vec3 uColor;void main(){float r=length(vUv-.5)*2.;float band=exp(-(((r-.86)*14.)*((r-.86)*14.)))+exp(-(((r-.6)*9.)*((r-.6)*9.)))*.35;float fade=exp(-uAge*3.2);gl_FragColor=vec4(uColor*band*fade*1.6,band*fade);}'});
  const dustMat=()=>new THREE.SpriteMaterial({map:glow,color:'#8b9db3',transparent:true,opacity:0,depthWrite:false});
  const impacts=[0,1,2,3].map(()=>{
    const flash=new THREE.Sprite(additive('#fff1e6',0));root.add(flash);
    const ring=new THREE.Mesh(new THREE.PlaneGeometry(2,2),ringMat());ring.rotation.x=-Math.PI/2;ring.visible=false;root.add(ring);
    const dust=[0,1,2,3].map(()=>{const s=new THREE.Sprite(dustMat());root.add(s);return s;});
    return {flash,ring,dust,dustDir:dust.map(()=>new THREE.Vector3()),pos:new THREE.Vector3(),age:9,power:0,tear:false};
  });
  let impactIndex=0;
  // Persistent scars: scorch and glowing fractures in the asphalt.
  const scorchTex=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');const g=x.createRadialGradient(64,64,4,64,64,64);g.addColorStop(0,'rgba(4,6,8,.95)');g.addColorStop(.55,'rgba(10,12,16,.6)');g.addColorStop(1,'rgba(10,12,16,0)');x.fillStyle=g;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);})();
  const scars=[0,1,2,3,4,5].map(()=>{
    const g=new THREE.Group();g.visible=false;root.add(g);
    const scorch=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map:scorchTex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));scorch.rotation.x=-Math.PI/2;g.add(scorch);
    const crackMat=new THREE.MeshBasicMaterial({color:'#9fe6ff',transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-3});
    // All 21 strips of a scar are baked into one mesh: same image, 1 draw call instead of 21.
    const strips=[],place=new THREE.Object3D();
    for(let i=0;i<7;i++){
      const a=i/7*Math.PI*2+rand(-.3,.3),len=rand(1,2.6);let px=0,pz=0;
      for(let s=0;s<3;s++){const seg=len/3,dir=a+rand(-.5,.5);const strip=new THREE.PlaneGeometry(.035,seg);place.rotation.set(-Math.PI/2,0,-dir+Math.PI/2);place.position.set(px+Math.cos(dir)*seg/2,.004,pz+Math.sin(dir)*seg/2);place.updateMatrix();strip.applyMatrix4(place.matrix);strips.push(strip);px+=Math.cos(dir)*seg;pz+=Math.sin(dir)*seg;}
    }
    g.add(new THREE.Mesh(mergeGeometries(strips),crackMat));strips.forEach(strip=>strip.dispose());
    return {g,crackMat,age:0,tear:false};
  });
  let scarIndex=0;
  // ----------------------------------------------------------------- debris
  const DEBRIS=120;
  const debris=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.16,0),new THREE.MeshStandardMaterial({color:'#6c7684',roughness:.95}),DEBRIS);
  debris.castShadow=true;debris.frustumCulled=false;root.add(debris);
  const chunks=Array.from({length:DEBRIS},()=>({p:new THREE.Vector3(0,-50,0),v:new THREE.Vector3(),r:new THREE.Euler(),w:new THREE.Vector3(),s:1,life:0,lift:false}));
  const dummy=new THREE.Object3D();let chunkIndex=0;
  chunks.forEach((c,i)=>{dummy.position.copy(c.p);dummy.scale.setScalar(0);dummy.updateMatrix();debris.setMatrixAt(i,dummy.matrix);});
  // ----------------------------------------------------------------- dimensional tears
  const tears=[0,1,2,3,4,5].map(()=>{
    const g=new THREE.Group();g.visible=false;root.add(g);
    const h=rand(3.2,6.5),pts=[];for(let i=0;i<7;i++)pts.push(new THREE.Vector3(rand(-.22,.22)*(i%2?1:-1),i/6*h,rand(-.08,.08)));
    const curve=new THREE.CatmullRomCurve3(pts);
    const coreMat=new THREE.MeshBasicMaterial({color:'#dff8ff',toneMapped:false,transparent:true,opacity:1});coreMat.color.multiplyScalar(2);
    const fringeMat=new THREE.MeshBasicMaterial({color:'#9c74e0',transparent:true,opacity:.22,depthWrite:false,blending:THREE.AdditiveBlending});
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve,40,.028,6,false),coreMat));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve,40,.2,8,false),fringeMat));
    const halo=new THREE.Sprite(additive('#7fd8ff',.25));halo.position.y=h/2;halo.scale.set(2.4,h*1.3,1);g.add(halo);
    return {g,coreMat,fringeMat,halo,age:9,phase:rand(0,6)};
  });
  let tearIndex=0;
  // ----------------------------------------------------------------- the fracture corridor
  const corridor=new THREE.Group();corridor.name='Fracture corridor';corridor.visible=false;root.add(corridor);
  corridor.position.set(SEAM_POSITION.x,SEAM_POSITION.y+1,SEAM_POSITION.z-.2);
  const mouthMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{uOpen:{value:0},uTime:{value:0}},vertexShader:fullVertex,
    fragmentShader:`varying vec2 vUv;uniform float uOpen;uniform float uTime;${noiseGLSL}
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
    }`});
  const mouth=new THREE.Mesh(new THREE.PlaneGeometry(9,22),mouthMat);mouth.position.set(0,2,0);corridor.add(mouth);
  // Receding membranes: each a slot of light, offset a little more than the last.
  const layerMats=[];
  for(let i=0;i<11;i++){
    const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,uniforms:{uOpen:{value:0},uTime:{value:0},uDepth:{value:i/10}},vertexShader:fullVertex,
      fragmentShader:`varying vec2 vUv;uniform float uOpen;uniform float uTime;uniform float uDepth;${noiseGLSL}
      void main(){vec2 p=(vUv-.5)*vec2(30.,40.);float bend=sin(p.y*.12+uDepth*4.+uTime*.2)*1.4*uDepth;float w=1.6+uDepth*3.2;float d=abs(p.x-bend)-w;
        float edge=exp(-((d*1.6)*(d*1.6)))*.7;float membrane=exp(-max(d,0.)*.22)*.09*vn(p*.3+uTime*.1+uDepth*9.);
        float fall=smoothstep(19.,6.,abs(p.y));vec3 c=mix(vec3(.45,.82,1.),vec3(.62,.38,.98),vn(vec2(p.y*.1,uDepth*5.)))*(edge*.9+membrane)+vec3(.85,.97,1.)*smoothstep(.0,-1.,d)*uDepth*uDepth*.035;
        gl_FragColor=vec4(c*fall*uOpen,1.);}`});
    const layer=new THREE.Mesh(new THREE.PlaneGeometry(30,40),m);layer.position.set(Math.sin(i*.9)*.6,2,-2.5-i*3.4);layer.rotation.z=Math.sin(i*1.3)*.08;corridor.add(layer);layerMats.push(m);
  }
  const endGlow=new THREE.Sprite(additive('#e8fbff',0));endGlow.position.set(0,2,-40);endGlow.scale.set(26,34,1);corridor.add(endGlow);
  // Fragments of the city already inside: slabs, a road piece, a lit window. Instanced.
  const FRAG=64,fragments=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#3d4c63',roughness:.8,emissive:'#123049',emissiveIntensity:.6}),FRAG);
  fragments.frustumCulled=false;corridor.add(fragments);
  const fragState=Array.from({length:FRAG},(_,i)=>({a:rand(0,Math.PI*2),r:rand(3.2,7),z:-rand(1,38),s:new THREE.Vector3(rand(.3,2.4),rand(.1,1.2),rand(.4,2.6)),spin:rand(-.2,.2),phase:rand(0,6)}));
  const farRed=new THREE.Sprite(additive('#ff3322',0));farRed.position.set(0,2.2,-30);farRed.scale.setScalar(1.4);corridor.add(farRed);
  const corridorLight=new THREE.PointLight('#bdeeff',0,46,1.4);corridorLight.position.set(0,2,4);corridor.add(corridorLight);
  // Inward stream: GPU-animated motes drawn from the street into the seam.
  const STREAM=1500,starts=new Float32Array(STREAM*3),seeds=new Float32Array(STREAM);
  for(let i=0;i<STREAM;i++){starts[i*3]=rand(-18,18);starts[i*3+1]=rand(-1,15);starts[i*3+2]=rand(-2,22);seeds[i]=rnd();}
  const streamGeo=new THREE.BufferGeometry();streamGeo.setAttribute('position',new THREE.BufferAttribute(starts,3));streamGeo.setAttribute('aSeed',new THREE.BufferAttribute(seeds,1));
  const streamMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uTime:{value:0},uStream:{value:0},uRush:{value:0},uMap:{value:glow}},
    vertexShader:`attribute float aSeed;uniform float uTime;uniform float uStream;uniform float uRush;varying float vA;
      void main(){float sp=.12+aSeed*.18+uRush*.5;float u=fract(aSeed*7.13+uTime*sp);float k=u*u;
        vec3 target=vec3(0.,clamp(position.y*.5,0.,7.),-1.5);vec3 p=mix(position,target,k);float sw=(1.-k)*2.;p.x+=sin(u*6.+aSeed*20.)*sw*.4;p.y+=cos(u*5.+aSeed*13.)*sw*.25;
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=(.8+uRush*2.2)*(1.+k*1.6)*(110./-mv.z);vA=uStream*sin(u*3.14159);}`,
    fragmentShader:'uniform sampler2D uMap;varying float vA;void main(){vec4 t=texture2D(uMap,gl_PointCoord);gl_FragColor=vec4(vec3(.75,.94,1.)*t.a*vA,t.a*vA);}'});
  const stream=new THREE.Points(streamGeo,streamMat);stream.frustumCulled=false;corridor.add(stream);
  // ----------------------------------------------------------------- collapse
  const SLABS=34,slabMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1.3,.32,1.2),new THREE.MeshStandardMaterial({color:'#7c838e',roughness:.95}),SLABS);
  slabMesh.castShadow=true;slabMesh.frustumCulled=false;slabMesh.visible=false;root.add(slabMesh);
  const slabs=Array.from({length:SLABS},(_,i)=>{const x=-4+(i%6)*1.45+rand(-.2,.2),z=-23.2-Math.floor(i/6)*1.32+rand(-.15,.15);return {base:new THREE.Vector3(x,-.31,z),delay:rand(0,.45)+Math.max(0,(z+31)*-.0)+(Math.abs(x-1.5)*.04),spin:new THREE.Vector3(rand(-2,2),rand(-1,1),rand(-2,2))};});
  // One broken service-frame member catches his shoulder during displacement.
  // Its brief electrical scatter is separate from the larger road-impact effect pool.
  const pullFrame=new THREE.Mesh(new THREE.BoxGeometry(.38,3.8,.44),new THREE.MeshStandardMaterial({color:'#465462',roughness:.83,metalness:.3}));
  pullFrame.position.copy(PULL_CONTACT_POSITION).add(new THREE.Vector3(.25,0,0));pullFrame.rotation.set(.12,.15,-.22);pullFrame.visible=false;root.add(pullFrame);
  const sparkPositions=new Float32Array(24*3),sparkGeo=new THREE.BufferGeometry();sparkGeo.setAttribute('position',new THREE.BufferAttribute(sparkPositions,3));
  const sparkMat=new THREE.PointsMaterial({color:'#b8e7ff',size:.045,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
  const pullSparks=new THREE.Points(sparkGeo,sparkMat);pullSparks.position.copy(PULL_CONTACT_POSITION);pullSparks.frustumCulled=false;root.add(pullSparks);let pullHit=false;
  patchWarpTree(root);
  const tmp=new THREE.Vector3(),tmp2=new THREE.Vector3(),seamWorld=SEAM_POSITION.clone();
  let fold=0,foldTarget=0,shearSpike=0;
  const redColor=new THREE.Color('#ff5a36'),cyanColor=new THREE.Color('#9fe6ff'),mix=new THREE.Color();

  function spawnDebris(pos,power,tear){
    const count=Math.round(14+power*16);
    for(let n=0;n<count;n++){
      const c=chunks[chunkIndex];chunkIndex=(chunkIndex+1)%DEBRIS;
      c.p.copy(pos).add(tmp.set(rand(-.4,.4),rand(0,.3),rand(-.4,.4)));
      const a=rand(0,Math.PI*2),out=rand(2,6.5)*power;c.v.set(Math.cos(a)*out,rand(3.5,9)*power,Math.sin(a)*out);
      c.r.set(rand(0,6),rand(0,6),rand(0,6));c.w.set(rand(-6,6),rand(-6,6),rand(-6,6));
      c.s=rand(.35,1.5)*(.7+power*.4);c.life=rand(3.5,5.5);c.lift=tear&&rnd()<.4;
    }
  }
  return {root,corridor,
    /** Respond to the director's events. `camera` is used only to aim the screen-space warp. */
    onEvent(event,seq,camera){
      if(event.type==='discharge'){
        const b=bolts[boltIndex];boltIndex=(boltIndex+1)%bolts.length;
        b.from.copy(event.from);b.to.copy(event.to);b.age=0;b.flight=Math.min(.32,event.from.distanceTo(event.to)/60);b.g.visible=true;
      }
      if(event.type==='charge'){blastLight.position.copy(event.position);blastLight.color.copy(redColor);blastLight.intensity=Math.max(blastLight.intensity,6);}
      if(event.type!=='impact')return;
      const {position,power,tear}=event;
      const im=impacts[impactIndex];const slot=impactIndex;impactIndex=(impactIndex+1)%impacts.length;
      im.pos.copy(position);im.age=0;im.power=power;im.tear=tear;
      im.ring.position.copy(position).setY(Math.max(position.y,-.12)+.06);im.ring.visible=true;
      im.ring.material.uniforms.uColor.value.copy(tear?cyanColor:redColor);
      im.dust.forEach((d,i)=>{im.dustDir[i].set(rand(-1,1),rand(.3,1),rand(-1,1)).normalize();d.position.copy(position);});
      // Warp: ripple slot, shear spike, and a heave where no seam opens.
      warpUniforms.uImpacts.value[slot].set(position.x,position.y,position.z,warpUniforms.uWarpTime.value);
      const powers=warpUniforms.uImpactPower.value;if(slot===0)powers.x=power;else if(slot===1)powers.y=power;else if(slot===2)powers.z=power;else powers.w=power;
      if(!tear&&position.y<.5){warpUniforms.uFold.value.set(position.x,0,position.z,0);foldTarget=1.15*power;}
      shearSpike=Math.min(1,shearSpike+power*.6);
      if(position.y<1.2){const s=scars[scarIndex];scarIndex=(scarIndex+1)%scars.length;s.g.visible=true;s.g.position.set(position.x,-.142,position.z);s.g.scale.setScalar(.7+power*.7);s.g.rotation.y=rand(0,6);s.age=0;s.tear=tear;}
      spawnDebris(tmp2.copy(position).setY(Math.max(position.y,-.1)),power,tear);
      if(tear){
        const t=tears[tearIndex];tearIndex=(tearIndex+1)%tears.length;t.age=0;t.g.visible=true;
        const side=position.x>=0?1:-1;t.g.position.copy(position);if(position.y<1){t.g.position.x+=side*1.7;t.g.position.y=-.14;}else t.g.position.y-=2.6;
        t.g.rotation.set(rand(-.1,.1),rand(0,3),rand(-.18,.18));
      }
      blastLight.position.copy(position).setY(Math.max(position.y,.4)+.6);blastLight.intensity=28*power;blastLight.color.copy(mix.copy(redColor).lerp(cyanColor,tear?.45:0));
      environment.impulse(position,power);
      if(camera){
        tmp.copy(position).project(camera);const screen=new THREE.Vector2(tmp.x*.5+.5,tmp.y*.5+.5);
        const dist=camera.position.distanceTo(position),near=Math.max(.15,Math.min(1,7/dist));
        const shove=tmp2.subVectors(camera.position,position).setY(.35).normalize().multiplyScalar(power*.5*near);
        seq.impulse(power*(.45+near*.55),tmp.z<1?screen:undefined,shove);
      }
    },
    update(t,dt,seq,phase,camera){
      warpUniforms.uWarpTime.value=t;
      pullFrame.visible=(phase==='fracture'&&seq.phaseTime>3)||(phase==='pulled'&&seq.phaseTime<3.4);
      const contactAge=phase==='pulled'?seq.phaseTime-1.45:9;
      pullSparks.visible=contactAge>=0&&contactAge<.34;
      if(pullSparks.visible){
        sparkMat.opacity=(1-contactAge/.34)*.85;
        for(let i=0;i<24;i++){const a=i*2.399;const speed=.8+(i%5)*.3;sparkPositions[i*3]=Math.cos(a)*contactAge*speed;sparkPositions[i*3+1]=Math.sin(a)*contactAge*speed-contactAge*contactAge*3;sparkPositions[i*3+2]=(i%3-1)*contactAge*.7;}
        sparkGeo.attributes.position.needsUpdate=true;
        if(!pullHit){pullHit=true;seq.impulse(.16);}
      }
      // Bolts: the head runs ahead of the beam, the beam lingers a fraction then dies.
      for(const b of bolts){
        if(!b.g.visible)continue;b.age+=dt;const u=Math.min(1,b.age/b.flight);
        tmp.subVectors(b.to,b.from);const len=tmp.length();b.g.position.copy(b.from);b.g.quaternion.setFromUnitVectors(tmp2.set(0,1,0),tmp.normalize());
        b.g.scale.set(1+(1-u)*.4,len*u,1+(1-u)*.4);
        const fade=1-span(b.age,b.flight,b.flight+.22);b.core.material.opacity=fade;b.sheath.material.opacity=fade*.45;
        b.head.position.lerpVectors(b.from,b.to,u);b.head.material.opacity=u<1?1:0;
        if(fade<=0){b.g.visible=false;b.head.material.opacity=0;}
      }
      for(const im of impacts){
        im.age+=dt;const a=im.age,p=im.power;
        im.flash.position.copy(im.pos);im.flash.scale.setScalar((1.5+span(a,0,.12)*5.5)*p);im.flash.material.opacity=a<.6?(1-span(a,.04,.55))*p:0;
        im.flash.material.color.copy(im.tear?cyanColor:redColor).lerp(mix.set('#ffffff'),.55);
        im.ring.material.uniforms.uAge.value=a;im.ring.scale.setScalar(.4+span(a,0,.9)*13*p);if(a>1.2)im.ring.visible=false;
        im.dust.forEach((d,i)=>{d.position.copy(im.pos).addScaledVector(im.dustDir[i],span(a,0,2.6)*3.2*p);d.scale.setScalar((1.6+a*2.6)*p);d.material.opacity=a<3?(.32*(1-span(a,.3,3))*span(a,0,.15)):0;});
      }
      blastLight.intensity*=Math.exp(-dt*4.2);
      for(const s of scars){if(!s.g.visible)continue;s.age+=dt;s.crackMat.opacity=s.tear?(.35+.25*Math.sin(t*2+s.age))*span(s.age,0,.3):.0;}
      for(let i=0;i<DEBRIS;i++){
        const c=chunks[i];if(c.life<=0)continue;c.life-=dt;
        const g=c.lift&&c.life<4.2?2.2:-9.8;c.v.y+=g*dt;if(c.lift&&c.life<4.2){c.v.multiplyScalar(Math.exp(-dt*1.8));}
        c.p.addScaledVector(c.v,dt);if(c.p.y<-.08&&!c.lift){c.p.y=-.08;c.v.y*=-.28;c.v.x*=.6;c.v.z*=.6;c.w.multiplyScalar(.6);}
        c.r.x+=c.w.x*dt*(c.lift?.15:1);c.r.y+=c.w.y*dt*(c.lift?.15:1);c.r.z+=c.w.z*dt*(c.lift?.15:1);
        dummy.position.copy(c.p);dummy.rotation.copy(c.r);dummy.scale.setScalar(c.s*Math.min(1,c.life*1.5));dummy.updateMatrix();debris.setMatrixAt(i,dummy.matrix);
      }
      debris.instanceMatrix.needsUpdate=true;
      for(const tr of tears){
        if(!tr.g.visible)continue;tr.age+=dt;const open=1-Math.pow(1-Math.min(1,tr.age/.45),3);
        tr.g.scale.set(.4+open*.6+Math.sin(t*9+tr.phase)*.03,open,1);
        tr.coreMat.opacity=.75+.25*Math.sin(t*13+tr.phase);tr.fringeMat.opacity=(.2+.12*Math.sin(t*2+tr.phase))*(1+Math.max(0,1-tr.age)*2);
        tr.halo.material.opacity=.18+Math.max(0,1-tr.age)*.6;
      }
      // Global dimensional state.
      fold=THREE.MathUtils.damp(fold,foldTarget,fold<foldTarget?7:1,dt);warpUniforms.uFold.value.w=fold;
      shearSpike=Math.max(0,shearSpike-dt*.9);
      warpUniforms.uShear.value=seq.tear*.32+shearSpike*.5;
      const c=seq.corridor,col=seq.collapse;
      warpUniforms.uPull.value.set(seamWorld.x,seamWorld.y,seamWorld.z,c*.32+col*1.4);
      corridor.visible=c>.001||phase==='handoff';
      environment.anomaly.visible=c<.25;
      if(corridor.visible){
        mouthMat.uniforms.uOpen.value=c;mouthMat.uniforms.uTime.value=t;
        // Seen from the street the membranes are the corridor; from inside they thin to outlines.
        const inside=phase==='handoff'?.2:phase==='pulled'?1-span(seq.phaseTime,2.6,4.4)*.6:1;
        layerMats.forEach((m,i)=>{m.uniforms.uOpen.value=span(c,.2+i*.04,.8+i*.02)*inside;m.uniforms.uTime.value=t;});
        endGlow.material.opacity=c*(phase==='handoff'?.22:.45);
        corridorLight.intensity=c*(phase==='handoff'?12:34)+col*20;
        streamMat.uniforms.uTime.value=t;streamMat.uniforms.uStream.value=Math.min(1,c*1.3);streamMat.uniforms.uRush.value=col+(phase==='handoff'?.6:0);
        fragState.forEach((f,i)=>{const z=f.z+((t*(.6+col*4))%40);const zz=((z+40)%40)-40;dummy.position.set(Math.cos(f.a+t*.03)*f.r,2+Math.sin(f.a+t*.03)*f.r*1.3,zz-1);dummy.scale.copy(f.s).multiplyScalar(span(c,.3,1));dummy.rotation.set(f.phase+t*f.spin,f.phase*.5,f.phase+t*f.spin*.6);dummy.updateMatrix();fragments.setMatrixAt(i,dummy.matrix);});
        fragments.instanceMatrix.needsUpdate=true;
        farRed.material.opacity=phase==='handoff'?.9:phase==='pulled'?.6:0;farRed.position.z=-30-(phase==='handoff'?seq.phaseTime*.8:0);
      }else corridorLight.intensity=0;
      // The road around Hiro breaks into slabs and falls toward the seam.
      slabMesh.visible=col>0&&phase!=='handoff';
      if(slabMesh.visible){
        slabs.forEach((s,i)=>{
          const k=Math.max(0,col*1.25-s.delay),fly=k*k;
          dummy.position.copy(s.base).lerp(tmp.set(seamWorld.x+Math.sin(i)*2,seamWorld.y+Math.cos(i*1.7)*3,seamWorld.z-4),fly);dummy.position.y+=Math.sin(k*3)*.6*k;
          dummy.rotation.set(s.spin.x*k,s.spin.y*k,s.spin.z*k);dummy.scale.setScalar(1-fly*.7);dummy.updateMatrix();slabMesh.setMatrixAt(i,dummy.matrix);
        });
        slabMesh.instanceMatrix.needsUpdate=true;
      }
    },
    /** Clears scars, tears and the corridor for a replay. */
    reset(){
      pullHit=false;pullFrame.visible=false;pullSparks.visible=false;
      [...scars.map(s=>s.g),...tears.map(t=>t.g)].forEach(g=>{g.visible=false;});
      chunks.forEach(c=>{c.life=0;});fold=0;foldTarget=0;shearSpike=0;warpUniforms.uFold.value.set(0,0,0,0);warpUniforms.uShear.value=0;warpUniforms.uPull.value.set(0,0,0,0);
      warpUniforms.uImpactPower.value.set(0,0,0,0);
      for(let i=0;i<DEBRIS;i++){dummy.position.set(0,-50,0);dummy.scale.setScalar(0);dummy.updateMatrix();debris.setMatrixAt(i,dummy.matrix);}debris.instanceMatrix.needsUpdate=true;
    },
    /** Everything visible for one frame so the renderer can compile it before it is needed. */
    setPrecompile(on){
      [...bolts.map(b=>b.g),...impacts.map(i=>i.ring),...scars.map(s=>s.g),...tears.map(t=>t.g),corridor,slabMesh].forEach(o=>{o.visible=on;});
    }
  };
}
