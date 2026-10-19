import { Box3, CatmullRomCurve3, Euler, type Material, AdditiveBlending, CanvasTexture, Color, ConeGeometry, Group, MathUtils, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, Object3D, PointLight, Quaternion, RepeatWrapping, ShaderMaterial, Sprite, SpriteMaterial, Vector3 } from 'three';
import { BAYMAX_POSITION } from '../config/experience';
import type { Phase } from '../state/SceneStateManager';
import type { SequenceDirector } from '../systems/SequenceDirector';
import { createChestAccess } from './ChestAccess.js';
import { createArmouredBaymax, mountArmour, type ArmouredBaymax } from './SolidArmour';
import { createSurfaceContact, LATER_BAYMAX_SCALE } from './LaterBaymax';

/** After the combat chip takes over: plated. It assembles during 'corrupting' (tracker P1-01). */
const ARMOURED:Phase[]=['threat','ignition','chase','fracture','pulled','handoff'];

const ease=(t:number)=>MathUtils.smoothstep(t,0,1);
const span=(t:number,a:number,b:number)=>MathUtils.smoothstep(t,a,b);
/** A single smooth pulse between a and b (0 → 1 → 0). */
const bump=(t:number,a:number,b:number)=>Math.sin(Math.PI*MathUtils.clamp((t-a)/(b-a),0,1));
/** A sharp jolt at a, decaying (the combat program loading in hits). */
const jolt=(t:number,a:number,decay=7)=>t<a?0:Math.exp(-(t-a)*decay)*Math.sin((t-a)*38);
/** Shortest signed difference between two angles, so turns never go the long way round. */
const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
const HEAD_YAW=1.05,HEAD_PITCH_UP=.45,HEAD_PITCH_DOWN=.6;
const UP=new Vector3(0,1,0),DOWN=new Vector3(0,-1,0);
const DORMANT_HEAD={x:.24,y:0,z:-.12};
type Pose={pos:Vector3;yaw:number;pitch:number;roll:number;head:Vector3;look:number;arm:number;aim:Vector3;thrust:number;inflate:number;stand:number};
/** Standing straightens the legs under him; the body rises by this much to keep the feet grounded. */
const LEG_SWING=1.45;

function glowTexture(){
  const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d')!;
  const g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.25,'rgba(255,255,255,.5)');g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle=g;x.fillRect(0,0,64,64);return new CanvasTexture(c);
}

/**
 * Baymax stays Baymax: every motion is damped, weighted and slow to start. What changes is
 * intent. Corruption is carried by eyes, armour, chest light and posture, never by twitching.
 */
export class BaymaxController {
  readonly chest:ReturnType<typeof createChestAccess>;
  private head:Object3D|null=null;
  private eyes:Mesh[]=[];private eyeGlow:Sprite[]=[];
  private armR=new Group();private armL=new Group();private legR=new Group();private legL=new Group();
  private elbowR=new Group();private elbowL=new Group();
  private ankleR=new Group();private ankleL=new Group();private standLift=.89*LATER_BAYMAX_SCALE;
  private armor:MeshPhysicalMaterial;private skin:MeshPhysicalMaterial;
  private redLight=new PointLight('#ff2a1c',0,7,1.6);
  private thruster=new Group();private flame:ShaderMaterial;private thrusterGlow:Sprite;
  private footJets:Mesh[]=[];
  private hand=new Object3D();private charge:Sprite;
  private pose:Pose;private target:Pose;
  private phase:Phase='loading';private phaseTime=0;private beat:string|null=null;
  // Motion memory for the flight layer (bank, trailing legs) and squash/stretch impulses.
  private prevPos=new Vector3();private prevYaw=0;private bank=0;private stretch=0;private moved=false;
  private tmp=new Vector3();private tmp2=new Vector3();private q=new Quaternion();private q2=new Quaternion();
  private eyeColor=new Color();private lastBeatTime=0;
  private beatCamera=new Vector3();private beatOrigin=new Vector3();
  private passCurve=new CatmullRomCurve3([new Vector3(),new Vector3(),new Vector3()]);
  private hole={uHoleCenter:{value:new Vector3()},uHoleNormal:{value:new Vector3(0,0,1)},uHoleRadius:{value:.196},uHoleOpen:{value:0}};
  // The armoured suit (tracker PW-03), loaded in the background and mounted on the shell.
  private suit?: ArmouredBaymax;private suitBaseY=0;private wasCovered=false;private white?:Mesh[];private suitStandY=0;private box=new Box3();private eul=new Euler();
  private qs=[new Quaternion(),new Quaternion(),new Quaternion(),new Quaternion(),new Quaternion()];
  private contact: ReturnType<typeof createSurfaceContact>;
  constructor(public readonly shell: Group) {
    shell.position.set(...BAYMAX_POSITION);
    shell.rotation.order='YXZ';shell.rotation.y=-.18;
    shell.name='Baymax';
    shell.scale.setScalar(LATER_BAYMAX_SCALE);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#bbbbbb';ctx.fillRect(0,0,128,128);
    for(let y=0;y<128;y+=4)for(let x=0;x<128;x+=4){const v=178+Math.sin(x*.31+y*.2)*5;ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(x,y,4,4);}
    const roughness=new CanvasTexture(canvas);roughness.wrapS=roughness.wrapT=RepeatWrapping;roughness.repeat.set(3,3);
    this.skin=new MeshPhysicalMaterial({name:'inflatable',color:'#f6f8fa',roughness:.79,roughnessMap:roughness,metalness:0,sheen:.3,sheenColor:new Color('#eef4f8'),sheenRoughness:.9,clearcoat:.02,envMapIntensity:.45});
    this.armor=new MeshPhysicalMaterial({name:'armor',color:'#8c1531',roughness:.3,metalness:.48,clearcoat:.28,clearcoatRoughness:.36,envMapIntensity:.65,emissive:'#ff1d12',emissiveIntensity:0});
    const meshes:Mesh[]=[];
    shell.traverse(object=>{
      if(object.name==='dormant-head')this.head=object;
      if(object instanceof Mesh&&!Array.isArray(object.material)){
        meshes.push(object);
        if(object.material.name==='inflatable')object.material=this.skin;
        else if(object.material.name==='armor')object.material=this.armor;
        // GLTFLoader de-duplicates names (dormant-eye, dormant-eye_1).
        if(object.name.startsWith('dormant-eye'))this.eyes.push(object);
        // The baked access port is replaced by the articulated bay below.
        if(object.name==='access-panel'||object.name==='access-ring')object.visible=false;
      }
    });
    // Eyes bypass tone mapping so corruption reads as a clean crimson, not a blown-out orange.
    this.eyes.forEach(eye=>{const m=(eye.material as MeshBasicMaterial).clone();m.toneMapped=false;eye.material=m;});
    if(this.head)this.head.rotation.order='YXZ';
    // Arms hinge at the shoulder: upper arm, forearm, hand and fingers are separate shapes.
    for(const [side,pivot] of [[1,this.armR],[-1,this.armL]] as const){
      pivot.position.set(side*1.02,2.26,.02);shell.add(pivot);
      const elbow=side===1?this.elbowR:this.elbowL;elbow.position.set(side*.17,-1.08,.18);pivot.add(elbow);shell.updateMatrixWorld(true);
      for(const m of meshes){
        const p=m.position,sx=side*p.x;
        const upper=Math.abs(sx-1.12)<.06&&Math.abs(p.y-1.7)<.06,fore=Math.abs(sx-1.23)<.06&&Math.abs(p.y-.82)<.06;
        const hand=Math.abs(sx-1.25)<.06&&Math.abs(p.y-.35)<.06,finger=sx>1.0&&sx<1.5&&Math.abs(p.y-.29)<.03&&p.z>.7;
        const shoulder=Math.abs(sx-.93)<.06&&Math.abs(p.y-2.3)<.06;
        if(upper||shoulder)pivot.attach(m);else if(fore||hand||finger)elbow.attach(m);
      }
    }
    // Legs hinge at the hip: thigh, armoured foot and sole. Seated, they point forward; standing
    // and in flight they swing down under him, so he can rise and fly rather than float seated.
    for(const [side,pivot] of [[1,this.legR],[-1,this.legL]] as const){
      pivot.position.set(side*.53,.55,.28);shell.add(pivot);
      const ankle=side===1?this.ankleR:this.ankleL;
      ankle.name=side===1?'ankle-left':'ankle-right';
      ankle.position.set(side*.18,-.27,.86);pivot.add(ankle);shell.updateMatrixWorld(true);
      for(const m of meshes){
        const p=m.position,sx=side*p.x;
        const thigh=Math.abs(sx-.57)<.06&&Math.abs(p.y-.48)<.06&&Math.abs(p.z-.76)<.08;
        const foot=Math.abs(sx-.71)<.06&&(Math.abs(p.y-.26)<.06||Math.abs(p.y-.04)<.06)&&p.z>1.2;
        if(thigh)pivot.attach(m);else if(foot)ankle.attach(m);
      }
    }
    this.hand.position.set(.23,-1.95,.62);this.armR.add(this.hand);shell.updateMatrixWorld(true);this.elbowR.attach(this.hand);
    const glow=glowTexture();
    // Medical access bay, seated on the surface normal of the chest curve.
    // The iris leaves keep an unpatched copy of the skin; only the body is cut open.
    this.chest=createChestAccess(this.skin.clone());
    this.skin.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,this.hole);
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vHoleWorld;')
        .replace('#include <project_vertex>','#include <project_vertex>\nvHoleWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vHoleWorld;uniform vec3 uHoleCenter;uniform vec3 uHoleNormal;uniform float uHoleRadius;uniform float uHoleOpen;')
        .replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(uHoleOpen>.5){vec3 hd=vHoleWorld-uHoleCenter;float along=dot(hd,uHoleNormal);if(length(hd-along*uHoleNormal)<uHoleRadius&&along>-.35&&along<.1)discard;}');
    };
    this.skin.customProgramCacheKey=()=>'baymax-skin-hole';
    this.chest.root.position.set(.42,2.05,.642);
    this.chest.root.quaternion.setFromUnitVectors(new Vector3(0,0,1),new Vector3(.4,.34,1).normalize());
    shell.add(this.chest.root);
    if(this.head){
      for(const eye of this.eyes){
        const s=new Sprite(new SpriteMaterial({map:glow,color:'#9fe4ff',transparent:true,opacity:0,depthWrite:false,blending:AdditiveBlending}));
        s.position.copy(eye.position).add(new Vector3(0,0,.03));s.scale.setScalar(.2);this.head.add(s);this.eyeGlow.push(s);
      }
    }
    this.redLight.position.set(.1,2.9,1.2);shell.add(this.redLight);
    // Back thruster: a short, hot cone and a soft bloom source; dormant until ignition.
    this.flame=new ShaderMaterial({transparent:true,depthWrite:false,blending:AdditiveBlending,uniforms:{uPower:{value:0},uTime:{value:0}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec2 vUv;uniform float uPower;uniform float uTime;void main(){float life=vUv.y;float core=pow(1.-life,1.4);float flutter=.83+.17*sin(uTime*47.+life*23.);vec3 c=mix(vec3(.13,.35,1.),vec3(.9,.97,1.),core*core);float alpha=core*flutter*uPower*.72;gl_FragColor=vec4(c*(.7+core)*uPower,alpha);}'});
    // Wide at the nozzle, tapering away. The previous reversed cone looked like a white ribbon.
    const jetGeometry=new ConeGeometry(.2,1.3,20,1,true);jetGeometry.rotateX(-Math.PI/2);jetGeometry.translate(0,0,-.65);
    const cone=new Mesh(jetGeometry,this.flame);this.thruster.add(cone);
    for(const ankle of [this.ankleR,this.ankleL]){
      const boot=ankle.children.find(o=>o instanceof Mesh&&o.name.startsWith('boot-')) as Mesh|undefined;
      const jet=new Mesh(jetGeometry,this.flame);jet.rotation.x=-Math.PI/2;jet.scale.setScalar(.78);
      if(boot){boot.geometry.computeBoundingBox();shell.updateMatrixWorld(true);
        jet.position.copy(ankle.worldToLocal(boot.localToWorld(new Vector3(0,boot.geometry.boundingBox!.min.y-.025,0))));}
      ankle.add(jet);this.footJets.push(jet);
    }
    this.thrusterGlow=new Sprite(new SpriteMaterial({map:glow,color:'#93bfff',transparent:true,opacity:0,depthWrite:false,blending:AdditiveBlending}));
    this.thrusterGlow.scale.setScalar(1.3);this.thruster.add(this.thrusterGlow);
    // Angled down and back so the jet lifts him as well as driving him forward.
    this.thruster.position.set(0,1.95,-.82);this.thruster.rotation.x=-.75;shell.add(this.thruster);
    this.charge=new Sprite(new SpriteMaterial({map:glow,color:'#ff6b55',transparent:true,opacity:0,depthWrite:false,blending:AdditiveBlending}));
    this.charge.scale.setScalar(.01);this.hand.add(this.charge);
    const rest=():Pose=>({pos:new Vector3(...BAYMAX_POSITION),yaw:-.18,pitch:0,roll:0,head:new Vector3(DORMANT_HEAD.x,DORMANT_HEAD.y,DORMANT_HEAD.z),look:0,arm:0,aim:new Vector3(),thrust:0,inflate:0,stand:0});
    this.pose=rest();this.target=rest();
    this.contact=createSurfaceContact(meshes);
    // Match the later rig: ankles counter-rotate the hips so feet remain feet,
    // rather than turning into long vertical capsules when he stands or flies.
    this.legR.rotation.x=this.legL.rotation.x=LEG_SWING;
    this.ankleR.rotation.x=this.ankleL.rotation.x=-LEG_SWING;shell.updateMatrixWorld(true);
    this.standLift=Math.max(0,this.contact.correction(-.14));
    this.legR.rotation.x=this.legL.rotation.x=this.ankleR.rotation.x=this.ankleL.rotation.x=0;shell.updateMatrixWorld(true);
  }

  /** The dock in world space, for the chip and camera. */
  dockWorld(){return this.chest.dockWorld();}
  dockQuaternion(out:Quaternion){return this.chest.dock.getWorldQuaternion(out);}
  chestFrame(position:Vector3,normal:Vector3){
    this.chest.root.getWorldPosition(position);
    normal.set(0,0,1).applyQuaternion(this.chest.root.getWorldQuaternion(this.q2)).normalize();
  }

  private suitReady?:Promise<void>;
  /** Load and mount the armoured suit once. The boot warm-up awaits it, so parsing it never stalls the intro (tracker Q-02). */
  prepareSuit(){
    if(this.suitReady)return this.suitReady;
    return this.suitReady=createArmouredBaymax({shell:this.shell,eye:this.eyes[0]?.material as Material|undefined,hole:()=>this.chest.holeOpen?this.dockWorld():null})
      .then(a=>{mountArmour(a,this.shell,{y:.55,z:.28},2.42);this.suitBaseY=a.root.position.y;this.suit=a;})
      .catch(()=>{/* stays white if the suit can't load */});
  }
  update(time:number,dt:number,reduced:boolean,phase:Phase,seq:SequenceDirector,camera:Vector3){
    if(phase!==this.phase){this.phase=phase;this.phaseTime=0;}
    this.phaseTime+=dt*seq.slowmo;
    const t=this.phaseTime,T=this.target;
    void this.prepareSuit();
    const armourK=phase==='inserting'?span(t,1.1,2.2):phase==='silence'||phase==='booting'||phase==='diagnostic'||phase==='corrupting'||ARMOURED.includes(phase)?1:0;
    this.restPose(T);
    if(phase==='awakening'||phase==='approaching'||phase==='loading'){T.aim.set(0,0,0);this.snap();}
    // ---------------------------------------------------------------- shell + boot
    let open=0,seal=0,seated=0,seamGlow=0,eyeOn=0;
    const after=(list:Phase[])=>list.includes(phase);
    if(phase==='panel-opening')open=t;
    if(after(['socket-ready','inserting','silence']))open=4.6;
    if(phase==='inserting')seated=span(t,.55,1.1);
    if(phase==='silence'){seated=1;seamGlow=t>1.25&&t<1.42?.35:0;}
    if(phase==='booting'){
      open=4.6;seated=1;seal=span(t,.2,1.5);
      T.inflate=span(t,1.3,2.9);T.pos.y+=span(t,1.3,2.9)*.035;T.roll=span(t,1.6,3)*.018;
      T.head.set(MathUtils.lerp(DORMANT_HEAD.x,.04,span(t,2.1,3.7)),0,MathUtils.lerp(DORMANT_HEAD.z,0,span(t,2.1,3.7)));
      eyeOn=span(t,3.5,3.75);seamGlow=span(t,1.4,2)*.45*(1-span(t,3,4.2));
      // Systems coming online: a shiver through the shell, a hand twitches, a first deep breath
      // that overshoots, and a small double-take as his eyes light and find Hiro.
      T.roll+=Math.sin(t*31)*.006*bump(t,1.5,2.7);
      T.arm=.07*bump(t,2.3,2.7)+.05*bump(t,2.85,3.2);
      T.inflate+=.05*bump(t,2.5,3.6);
      this.lookAt(camera,T,span(t,3.2,4.6)*.9);
      T.head.y+=.09*bump(t,3.6,4.5);
    }
    if(after(['diagnostic','corrupting','threat','ignition','chase','fracture','pulled','handoff'])){open=4.6;seated=1;seal=1;T.inflate=1;T.pos.y+=.035;eyeOn=1;T.head.set(.04,0,0);}
    if(phase==='diagnostic'){
      // A small, curious head tilt: the most Baymax gesture there is.
      T.head.set(.04,.04*span(t,.8,2.2),0);this.lookAt(camera,T,.9);
      T.head.z=.11*span(t,.8,2.2)*(1-span(t,4.3,5.6));
      seamGlow=.18+.14*Math.sin(t*3.1)**2;
      if(t>4.9)seamGlow=Math.sin(t*41)>.55?.55:.12;
    }
    if(phase==='corrupting'){
      const k=span(t,.2,4.6);seamGlow=.3+k*.5;
      T.pitch=.055*k;T.head.set(.04-.06*k,0,0);T.arm=.06*k+.08*span(t,2.8,4.2);T.pos.y+=.02*k;
      // He never stops watching Hiro; the corruption is in how he holds the look.
      this.lookAt(camera,T,.85+span(t,3,4.8)*.15);
      // The combat program loads in hits: three jolts through the body, each squaring him up more.
      const j=jolt(t,1.05)+jolt(t,1.85)*.8+jolt(t,2.65)*1.1;
      T.roll+=j*.03;T.pitch+=Math.abs(j)*.02;T.head.z+=j*.08;T.head.x+=.05*span(t,3.2,4.4);
    }
    if(phase==='threat'){
      seamGlow=.8;T.pitch=.055;T.arm=.14;T.pos.y+=.02;
      this.face(camera,T,.55*span(t,.6,2.4));this.lookAt(camera,T,span(t,.15,1.7));
    }
    const red=seq.red;
    // ---------------------------------------------------------------- violence
    if(phase==='ignition')this.ignition(t,T,camera);
    if(phase==='chase'){this.watch=camera;this.chase(seq,T,camera);this.watch=null;}
    if(phase==='fracture')this.fracture(t,T,camera);
    if(phase==='pulled'){
      const k=span(t,0,4.4),hit=span(t,1.25,1.55),recover=span(t,1.6,3.2);
      T.pos.lerpVectors(this.tmp.set(1.9,4,-42),this.tmp2.set(1,3,-65),k);
      T.pos.x-=hit*.7*(1-recover);T.pos.y-=hit*.35;
      T.stand=1;T.pitch=-.28-k*.6;T.roll=.28*hit*(1-recover);T.yaw=.15-k*.35;
      T.thrust=.45*(1-span(t,1.45,2.2));T.arm=.45*(1-recover);
      T.head.set(.2,0,-.12*hit);T.aim.set(4.1,6.3,-43.1);
    }
    if(phase==='handoff'){T.pos.set(1,3,-65);T.thrust=0;}
    this.shell.visible=phase!=='handoff';
    // ---------------------------------------------------------------- integrate
    const P=this.pose,k=(l:number)=>1-Math.exp(-dt*l);
    const fast=['ignition','chase','fracture'].includes(phase)&&!reduced;
    // The final dive is already eased in world space. A second lag used to leave him
    // airborne when the road impact fired, then slide him down through the dust.
    if(phase==='chase'&&seq.beat==='final'&&seq.beatTime>=1.65)P.pos.copy(T.pos);
    else P.pos.lerp(T.pos,k(fast?7:2.6));
    P.yaw+=wrap(T.yaw-P.yaw)*k(fast?5:1.8);P.yaw=wrap(P.yaw);P.pitch=MathUtils.lerp(P.pitch,T.pitch,k(fast?5:1.6));P.roll=MathUtils.lerp(P.roll,T.roll,k(2));
    P.head.lerp(T.head,k(fast?4.5:phase==='threat'?2.4:1.6));P.look=MathUtils.lerp(P.look,T.look,k(2.2));
    P.arm=MathUtils.lerp(P.arm,T.arm,k(fast?6:2));if(P.aim.lengthSq()===0)P.aim.copy(T.aim);else P.aim.lerp(T.aim,k(8));
    P.thrust=MathUtils.lerp(P.thrust,T.thrust,k(T.thrust>P.thrust?4:2.5));P.inflate=MathUtils.lerp(P.inflate,T.inflate,k(1.5));P.stand=MathUtils.lerp(P.stand,T.stand,k(fast?3.2:2));
    // Flight layer: bank into turns, legs trail with speed and sway on the thruster, the free arm sweeps back.
    const yawVel=this.moved?wrap(P.yaw-this.prevYaw)/Math.max(dt,1e-3):0,speed=this.moved?this.tmp2.subVectors(P.pos,this.prevPos).length()/Math.max(dt,1e-3):0;
    this.prevYaw=P.yaw;this.prevPos.copy(P.pos);this.moved=!reduced;
    this.bank=MathUtils.damp(this.bank,MathUtils.clamp(-yawVel*.14,-.28,.28)*P.thrust,5,dt);
    const trail=Math.min(.45,speed*.025)*P.thrust,sway=reduced?0:Math.sin(time*1.7)*.07*P.thrust*P.stand;
    this.stretch=MathUtils.damp(this.stretch,0,5,dt);
    // Breathing: soft and slow as himself; faster and heavier once the combat program has him.
    const red0=seq.red,breathe=reduced?0:Math.sin(time*MathUtils.lerp(1.05,2.3,red0))*MathUtils.lerp(.004,.007,red0)*P.inflate;
    this.shell.position.copy(P.pos);this.shell.position.y+=breathe-.009*(1-Math.exp(-time*.18))*(1-P.inflate)+P.stand*this.standLift;
    this.legR.rotation.set(P.stand*LEG_SWING+trail+sway,0,P.stand*-.05);this.legL.rotation.set(P.stand*LEG_SWING+trail-sway*.8,0,P.stand*.05);
    this.ankleR.rotation.x=-P.stand*LEG_SWING-trail*.7;this.ankleL.rotation.x=-P.stand*LEG_SWING-trail*.7;
    this.shell.rotation.set(P.pitch,P.yaw,P.roll+this.bank);
    const st=this.stretch;
    this.shell.scale.set(1+P.inflate*.006+breathe*.4-st*.03,1+P.inflate*.012+breathe+st*.05,1+P.inflate*.006+breathe*.4-st*.03).multiplyScalar(LATER_BAYMAX_SCALE);
    if(this.head){this.head.rotation.set(P.head.x,P.head.y,P.head.z);}
    // Arms: rest, a slight shoulder rise under corruption, or aimed at a world target.
    this.armL.rotation.set(trail*1.2,0,-P.arm*.6-.12*P.thrust);
    if(P.aim.lengthSq()>0){
      this.shell.updateMatrixWorld();
      this.tmp.copy(P.aim);this.shell.worldToLocal(this.tmp);this.tmp.sub(this.armR.position).normalize();
      this.q.setFromUnitVectors(DOWN,this.tmp);this.q2.identity();this.armR.quaternion.slerpQuaternions(this.q2,this.q,Math.min(1,P.arm));
    }else this.armR.rotation.set(0,0,P.arm*.6);
    // Load the fist before a strike, extend it through the action, then recover.
    // Previously every arm was a single straight shoulder hinge throughout the fight.
    const bt=seq.beatTime;
    const elbow=phase==='ignition'?.45*span(t,.25,.75)*(1-span(t,1.1,1.65))
      :phase==='chase'&&seq.beat==='overhead'?.7*span(bt,.2,.65)*(1-span(bt,.85,1.2))+.25*span(bt,1.35,1.6)*(1-span(bt,1.8,2.1))
      :phase==='chase'&&seq.beat==='rooftop'?.8*span(bt,.55,1)*(1-span(bt,1.1,1.43))+.35*bump(bt,1.45,1.9)
      :phase==='chase'&&seq.beat==='final'?.6*span(bt,.8,1.2)*(1-span(bt,1.55,1.95)):.16*P.thrust;
    this.elbowR.rotation.x=MathUtils.damp(this.elbowR.rotation.x,-elbow,10,dt);
    this.elbowL.rotation.x=MathUtils.damp(this.elbowL.rotation.x,-.25*P.thrust,7,dt);
    this.shell.updateMatrixWorld();
    if(this.suit)this.dressSuit(armourK,P.stand);
    this.shell.position.y+=Math.max(0,this.contact.correction(-.14));this.shell.updateMatrixWorld(true);
    this.hand.getWorldPosition(seq.muzzle);
    // ---------------------------------------------------------------- light and tone
    this.eyeColor.set('#0b0f11').lerp(this.tmpColor('#e0140c'),red);
    this.eyes.forEach(eye=>{const m=eye.material as MeshBasicMaterial;m.color.copy(this.eyeColor).multiplyScalar(1+red*.45);});
    const lock=phase==='threat'?Math.exp(-Math.pow((t-1.75)*3,2)):0;
    this.eyeGlow.forEach(s=>{const m=s.material;m.color.set('#9fe4ff').lerp(this.tmpColor('#ff2a1a'),red);m.opacity=eyeOn*(.2+red*.28)+lock*.4;s.scale.setScalar(.15+red*.08+lock*.14);});
    this.armor.emissiveIntensity=red*(.16+.05*Math.sin(time*2.2))+P.thrust*.12;
    this.redLight.intensity=red*(.75+lock*1.6)+P.thrust*2.4;
    this.redLight.position.set(.1,MathUtils.lerp(3,2.1,P.thrust),MathUtils.lerp(2.2,-1.6,P.thrust));
    this.flame.uniforms.uPower.value=P.thrust;this.flame.uniforms.uTime.value=time;
    this.thruster.scale.set(1,1,.6+P.thrust*.8);this.thruster.visible=P.thrust>.01;
    this.footJets.forEach((jet,i)=>{jet.visible=P.thrust>.01;const flicker=reduced?1:.94+.06*Math.sin(time*39+i*2);jet.scale.set(.78,.78,(.4+P.thrust*.7)*flicker);});
    this.thrusterGlow.material.opacity=P.thrust*.85;
    const charging=this.charging(phase,t,seq);
    this.charge.material.opacity=charging;this.charge.scale.setScalar(.05+charging*.75+(reduced?0:Math.sin(time*31)*.04*charging));
    this.chest.update({t:time,open,seal,seated,align:phase==='socket-ready'?seq.alignment:0,red,seamGlow});
    this.hole.uHoleOpen.value=this.chest.holeOpen?1:0;this.hole.uHoleRadius.value=this.chest.CAVITY*this.shell.scale.x;
    this.chestFrame(this.hole.uHoleCenter.value,this.hole.uHoleNormal.value);
  }

  private colorCache=new Map<string,Color>();
  private tmpColor(hex:string){let c=this.colorCache.get(hex);if(!c){c=new Color(hex);this.colorCache.set(hex,c);}return c;}
  private restPose(T:Pose){
    T.pos.set(...BAYMAX_POSITION);T.yaw=-.18;T.pitch=0;T.roll=0;T.head.set(DORMANT_HEAD.x,DORMANT_HEAD.y,DORMANT_HEAD.z);
    T.look=0;T.arm=0;T.thrust=0;T.inflate=0;T.stand=0;
  }
  private snap(){const P=this.pose,T=this.target;P.pos.copy(T.pos);P.yaw=T.yaw;P.pitch=T.pitch;P.roll=T.roll;P.head.copy(T.head);P.arm=T.arm;P.thrust=0;P.inflate=0;P.stand=0;P.aim.set(0,0,0);}
  /** Turns the head (and a little of the body) toward a world point, Baymax-slow. */
  private lookAt(point:Vector3,T:Pose,weight:number){
    if(weight<=0)return;
    // Head height follows the body's own pitch (he pivots near the feet), so aim from where the eyes really are.
    const lift=2.98*LATER_BAYMAX_SCALE+T.stand*this.standLift,headY=T.pos.y+lift*Math.cos(T.pitch),reachZ=lift*Math.sin(T.pitch);
    const hx=T.pos.x+Math.sin(T.yaw)*reachZ,hz=T.pos.z+Math.cos(T.yaw)*reachZ;
    const dx=point.x-hx,dz=point.z-hz,dy=point.y-headY;
    // Relative to the body. What the neck can't reach, the body turns and leans into.
    const yaw=wrap(Math.atan2(dx,dz)-T.yaw),pitch=-Math.atan2(dy,Math.hypot(dx,dz))-T.pitch;
    const headYaw=MathUtils.clamp(yaw,-HEAD_YAW,HEAD_YAW),headPitch=MathUtils.clamp(pitch,-HEAD_PITCH_UP,HEAD_PITCH_DOWN);
    T.yaw=wrap(T.yaw+(yaw-headYaw)*weight);
    T.pitch=MathUtils.clamp(T.pitch+(pitch-headPitch)*weight,-1.1,1.1);
    T.head.y=MathUtils.lerp(T.head.y,headYaw,weight);
    T.head.x=MathUtils.lerp(T.head.x,headPitch,weight);
    T.head.z=MathUtils.lerp(T.head.z,0,weight);
  }
  private face(point:Vector3,T:Pose,weight=1){T.yaw=wrap(T.yaw+wrap(Math.atan2(point.x-T.pos.x,point.z-T.pos.z)-T.yaw)*weight);}
  /** Hiro's position during flight; only the neck tracks him while the body follows its path. */
  private watch:Vector3|null=null;
  private flightLook(point:Vector3,T:Pose,weight:number){
    const yaw=T.yaw,pitch=T.pitch;this.lookAt(point,T,weight);T.yaw=yaw;T.pitch=pitch;
  }
  private flyToward(from:Vector3,to:Vector3,T:Pose,u:number,pitch=.55){
    const progress=ease(u),bend=Math.min(1.8,from.distanceTo(to)*.085),sign=to.x>=from.x?1:-1;
    T.pos.lerpVectors(from,to,progress);this.tmp2.subVectors(to,from);
    const length=Math.max(.001,Math.hypot(this.tmp2.x,this.tmp2.z)),nx=-this.tmp2.z/length,nz=this.tmp2.x/length;
    const arc=Math.sin(Math.PI*progress)**2,tangent=Math.PI*Math.sin(2*Math.PI*progress);
    T.pos.x+=nx*bend*sign*arc;T.pos.z+=nz*bend*sign*arc;T.pos.y+=bend*.12*arc;
    this.tmp2.x+=nx*bend*sign*tangent;this.tmp2.z+=nz*bend*sign*tangent;
    T.yaw=Math.atan2(this.tmp2.x,this.tmp2.z);T.thrust=1;T.stand=1;
    const lean=pitch*Math.min(1,Math.sin(Math.PI*Math.min(1,u*1.1))*1.7);
    if(!this.watch){T.pitch=lean;T.head.set(-.35*Math.min(1,pitch),0,0);return;}
    // The body follows the flight tangent. Only the head follows Hiro; forcing the
    // entire body to face him during an exit made Baymax fly backwards.
    T.pitch=lean;
    T.head.set(0,0,0);this.flightLook(this.watch,T,.9);
  }
  private charging(phase:Phase,t:number,seq:SequenceDirector){
    if(phase==='ignition')return span(t,.4,.9)*(1-span(t,1.15,1.5));
    if(phase!=='chase')return 0;
    const b=seq.beat,bt=seq.beatTime;
    if(b==='rooftop')return Math.max(span(bt,.75,1.4)*(1-span(bt,1.45,1.55)),.65*span(bt,1.65,1.9)*(1-span(bt,1.95,2.05)),.55*span(bt,2.15,2.35)*(1-span(bt,2.4,2.5)));
    if(b==='final')return span(bt,1.05,2)*(1-span(bt,2.25,2.4));
    return 0;
  }
  private ignition(t:number,T:Pose,camera:Vector3){
    // He stands. The first thing the corrupted state does is rise to full height over Hiro.
    T.inflate=1;T.pos.y+=.035-.07*bump(t,0,.45);T.stand=span(t,.25,1.05);
    // Compress, ignite, then accelerate away. Hiro isn't knocked down by a nonexistent shot.
    this.face(camera,T,.45*span(t,0,.6));this.lookAt(camera,T,1);
    T.pitch=.12*span(t,0,.8);T.arm=.35*span(t,.2,.8)*(1-span(t,1.25,1.8));T.aim.copy(camera);
    T.thrust=span(t,.9,1.55);
    const lift=Math.pow(span(t,1.35,3.5),1.6);
    T.pos.set(BAYMAX_POSITION[0]+lift*1.6,BAYMAX_POSITION[1]+.035+lift*4.8,BAYMAX_POSITION[2]-lift*6);
    T.pitch-=lift*.25;
  }
  private chase(seq:SequenceDirector,T:Pose,camera:Vector3){
    const b=seq.beat,u=seq.beatTime,V=(x:number,y:number,z:number)=>this.tmp.set(x,y,z);
    T.inflate=1;T.thrust=1;T.stand=1;
    if(!b){T.pos.set(4.3,4.75,-18);T.pitch=.15;this.face(camera,T);this.lookAt(camera,T,1);return;}
    if(b!==this.beat){this.beat=b;this.lastBeatTime=0;this.beatCamera.copy(camera);this.beatOrigin.copy(this.pose.pos);
      if(b==='overhead'){
        this.passCurve.points[0].copy(this.beatOrigin);
        this.passCurve.points[1].set(camera.x-4.5,camera.y-.7,camera.z-5.8);
        this.passCurve.points[2].set(camera.x-5.2,camera.y+3.6,camera.z-12);
        this.passCurve.updateArcLengths();
        seq.swipeTarget.set(camera.x-1.8,camera.y,camera.z-2.8);
      }
    }
    const C=this.beatCamera;
    if(b==='silhouette'){
      // Continuous bank into the first attack; no stop-and-hover establishing loop.
      this.flyToward(this.beatOrigin,V(C.x+3.9,C.y+3.2,C.z-11).clone(),T,span(u,0,1.25),.4);
    }else if(b==='overhead'){
      // Cross the forward field rather than teleporting behind the running camera.
      // He banks past the left shoulder with a safe horizontal clearance.
      const p=span(u,0,2.65);this.passCurve.getPointAt(p,T.pos);this.passCurve.getTangentAt(p,this.tmp2);
      T.yaw=Math.atan2(this.tmp2.x,this.tmp2.z);T.pitch=.38*Math.sin(Math.PI*p);T.thrust=.4+.6*Math.sin(Math.PI*p);
      T.arm=span(u,.55,1.16)*(1-span(u,1.35,1.9));T.aim.copy(seq.swipeTarget);
      this.flightLook(camera,T,.7);
    }else if(b==='rooftop'){
      // Bank above the left roofline, fire wide, and peel back into the street.
      const roof=new Vector3(C.x-5.2,C.y+1.8,C.z-8.8);
      const from=this.beatOrigin;
      if(u<.75)this.flyToward(from,roof,T,u/.75,.85);
      else{T.pos.copy(roof);T.pos.x-=span(u,.75,2.55)*.7;T.pos.y-=span(u,.75,2.55)*.3;
        T.thrust=.5;T.pitch=.1-.16*bump(u,1.45,1.8);this.face(camera,T);this.lookAt(camera,T,1);
        T.arm=span(u,.7,1.3)*(1-span(u,2.45,2.75));T.aim.set(-4.6,-.12,-21.2);T.pitch-=.07*bump(u,1.95,2.15)+.07*bump(u,2.4,2.55);}
      if(u>2.55)this.flyToward(roof.clone().add(V(-.7,-.3,0)),V(C.x+4.5,C.y+3.8,C.z-14).clone(),T,span(u,2.55,3.65),.55);
    }else if(b==='tear-pass'){
      // He comes out of the tear itself, close enough to fill the frame for a moment.
      const from=new Vector3(5.8,2.3,-23.8),to=new Vector3(-8,3.8,-19.8);
      if(u<.32){T.pos.copy(from);T.thrust=.4;}else this.flyToward(from,to,T,span(u,.32,1.45),1.1);
      if(u>.32&&u<1.1)this.lookAt(camera,T,1);
    }else if(b==='final'){
      const high=new Vector3(C.x+.5,C.y+6.4,C.z-5.5),ground=new Vector3(1.9,-.08,-30.4);
      const launch=this.beatOrigin;
      if(u<1.05)this.flyToward(launch,high,T,u/1.05,.85);
      else if(u<1.65){T.pos.copy(high);this.face(camera,T);this.lookAt(camera,T,1);T.thrust=.7;T.arm=span(u,1.05,1.5);T.aim.copy(camera);}
      else{const d=span(u,1.65,2.35),absorb=span(u,2.35,2.48)*(1-span(u,2.48,2.95));
        T.pos.lerpVectors(high,ground,d*d);this.face(camera,T);T.pitch=.22*d+.12*absorb;
        T.arm=.8*(1-span(u,2.4,3.05));T.aim.copy(ground).setY(-1);T.thrust=.7*(1-span(u,2.15,2.35));
        T.stand=1-.2*absorb;}
    }
  }
  private fracture(t:number,T:Pose,camera:Vector3){
    // Caught by the instability his own blow created: resists, then is taken.
    T.inflate=1;T.stand=1;const crater=new Vector3(1.9,-.08,-30.4),hover=new Vector3(1.9,1.9,-30.9);
    T.pos.lerpVectors(crater,hover,span(t,.2,1.3));this.face(camera,T);this.lookAt(camera,T,1-span(t,2.4,3.2));
    T.thrust=span(t,.4,1)*(1+span(t,1.3,3)*.4);
    const drag=span(t,1.3,3.1)*1.4+Math.pow(span(t,3.1,4.2),2)*11;
    T.pos.z-=drag;T.pos.y+=span(t,3.1,4.2)*2.2;T.pitch=-.25*span(t,1.3,3.1)-.5*span(t,3.1,4);T.roll=Math.sin(t*2.1)*.06*span(t,1.3,3.1);
    T.arm=.4*span(t,1.4,2.2);T.aim.set(camera.x,camera.y+2,camera.z);
  }
  /** Pose the suit from this rig, swap it in or out, and keep its feet on the white rig's ground line. */
  private suitK=0;
  /** Where the camera should look for his head: the helmet once the armour is mostly on (tracker N-02). */
  headFocus(out:Vector3){if(this.head)this.head.getWorldPosition(out);return out;}
  private dressSuit(k:number,stand:number){
    const a=this.suit!;a.set(k);this.suitK=k;
    if(a.isSingleRig)return;
    const covered=a.covers(k);
    if(covered!==this.wasCovered){
      this.wasCovered=covered;
      if(!this.white){this.white=[];this.shell.traverse(o=>{if(o instanceof Mesh&&!this.underChest(o)&&!this.inSuit(o))this.white!.push(o);});}
      this.white.forEach(m=>{m.visible=!covered;});this.eyeGlow.forEach(g=>{g.visible=!covered;});
    }
    if(k<=0)return;
    const [aL,aR,lL,lR,h]=this.qs;
    // The shell's +x pivots are the suit's .L side.
    a.drive({armL:aL.copy(this.armR.quaternion),armR:aR.setFromEuler(this.armL.rotation),
      legL:lL.setFromEuler(this.eul.set(this.legR.rotation.x-LEG_SWING,0,this.legR.rotation.z)),legR:lR.setFromEuler(this.eul.set(this.legL.rotation.x-LEG_SWING,0,this.legL.rotation.z)),
      head:this.head?h.setFromEuler(this.head.rotation):undefined});
    // Standing: learn how far to lift the suit so its feet meet the white rig's ground line.
    if(stand>.9){let low=Infinity;for(const leg of [this.legR,this.legL])leg.children.forEach(c=>{if(c instanceof Mesh){this.box.setFromObject(c);low=Math.min(low,this.box.min.y);}});
      this.suitStandY+=(low-a.footLow())/Math.max(1e-3,this.shell.scale.y*a.root.scale.y)*.5;}
    a.root.position.y=this.suitBaseY+this.suitStandY*stand;
  }
  private underChest(o:Object3D){for(let q:Object3D|null=o;q;q=q.parent)if(q===this.chest.root)return true;return false;}
  private inSuit(o:Object3D){for(let q:Object3D|null=o;q;q=q.parent)if(q===this.suit?.root)return true;return false;}
  dispose(){this.suit?.dispose();this.shell.removeFromParent();}
}
