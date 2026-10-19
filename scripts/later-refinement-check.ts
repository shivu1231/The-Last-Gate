import * as T from 'three';
import { createBaymax, restPose } from '../src/phase6/baymax';
import { downshiftDpr } from '../src/performance/AdaptiveDpr';
import { facilityCameraRoute, FACILITY_SHOTS } from '../src/phase5/cameraRoute';
import { createFacility } from '../src/phase5/facility';
import { createStreetImpacts } from '../src/phase6/StreetImpacts';
import { haulProgress } from '../src/phase6/haulMotion';
import { createBay } from '../src/phase5/bay';
const b = await createBaymax();
const suit = b.model;
const surfaces: T.Mesh[] = [];
suit.traverse(o => { if (o instanceof T.Mesh && !Array.isArray(o.material) && o.material.userData.combatSurface) surfaces.push(o); });
if (surfaces.length < 15) throw new Error(`Canonical combat finish missing from body parts: ${surfaces.length}`);
if (suit.getObjectByName('armour-abdomen') || suit.getObjectByName('plate-inflatable-body')) throw new Error('Duplicate shells overlap the canonical body');
const mount=b.model.getObjectByName('regulator-chest-supports');
if(!mount||mount.children.length!==4)throw new Error('Regulator lacks four physical chest supports');
const unit=b.model.getObjectByName('power-regulator')!;
if(Math.abs(unit.getWorldScale(new T.Vector3()).x-1)>.001)throw new Error('Fitted unit changes the original Bay 6 world scale');
for(const support of mount.children){const g=(support as T.Mesh).geometry as T.CylinderGeometry;if(g.parameters.height>.25)throw new Error('Regulator floats on overlong supports');}
let previous=0;
for(let i=1;i<=10000;i++){const next=haulProgress(i/10000,10);if(next<previous||next-previous>.0004)throw new Error('Haul reverses or starts with an impulse');previous=next;}
if(previous!==1||haulProgress(.01,10)!==0)throw new Error('Haul lacks brace or final settle');
const results = [];
for (const p of [ {sit:0}, {sit:.7}, {sit:0,stride:.8,gait:1.2}, {sit:0,lie:1,overhead:1}, {sit:0,getUp:.45}, {sit:0,armour:0} ]) {
  Object.assign(b.pose,restPose(),p);
  for(let i=0;i<60;i++) { if(p.getUp) b.pose.getUp=p.getUp; b.update(i/60); }
  b.root.updateMatrixWorld(true);
  const box = new T.Box3();
  suit.traverseVisible(o=>{if(o instanceof T.Mesh && (o.material as T.Material).name==='inflatable') { const single=new T.Box3().makeEmpty();const v=new T.Vector3();for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,v).applyMatrix4(o.matrixWorld);single.expandByPoint(v);}box.union(single); }});
  if(Math.abs(box.min.y)>.025) throw new Error(`Contact ${JSON.stringify(p)}: ${box.min.y}`);
  if(p.armour===0) for(const mesh of surfaces){const shader={uniforms:{},vertexShader:'',fragmentShader:''} as Parameters<T.Material['onBeforeCompile']>[0];(mesh.material as T.Material).onBeforeCompile(shader,{} as T.WebGLRenderer);if(shader.uniforms.uCombatFinish.value!==0)throw new Error('Combat finish remains after healthcare chip');}
  results.push({pose:p,minY:box.min.y,height:box.max.y-box.min.y});
}
if(b.bay.root.parent!==suit || b.bay.root.parent?.type==='Bone') throw new Error('Chip bay left the shared body');
Object.assign(b.pose,restPose(),{sit:0,lie:1,armour:1,guard:0,open:4.6,yaw:Math.PI});
for(let i=0;i<60;i++)b.update(5+i/60);
const recoveryDock=b.dockWorld(), recoveryChest=b.chestWorld();
let checkedHole=false;
suit.traverse(o=>{if(checkedHole||!(o instanceof T.Mesh))return;for(const material of Array.isArray(o.material)?o.material:[o.material]){
 const shader={uniforms:{},vertexShader:'#include <common>\n#include <project_vertex>',fragmentShader:'#include <common>\n#include <clipping_planes_fragment>\n#include <color_fragment>'} as Parameters<T.Material['onBeforeCompile']>[0];
 material.onBeforeCompile(shader,{} as T.WebGLRenderer);
 if(shader.uniforms.uHoleCenter && shader.uniforms.uCombatFinish){checkedHole=true;if((shader.uniforms.uHoleCenter.value as T.Vector3).distanceTo(recoveryChest)>1e-5)throw new Error('Canonical cutout lags grounded chest bay');if(shader.uniforms.uHoleRadius.value>b.bay.root.getWorldScale(new T.Vector3()).x*.235*1.01)throw new Error('Cutout exceeds the physical bay rim');}
}});
if(!checkedHole)throw new Error('Chest aperture shader missing');
for(let i=0;i<180;i++){b.pose.tension=.4;b.pose.sluggish=1;b.update(6+i/60);if(b.dockWorld().distanceTo(recoveryDock)>1e-5)throw new Error('Unconscious chest bobs during inspection');}
Object.assign(b.pose,restPose(),{sit:0,lie:1,overhead:1});
b.root.rotation.x=.18;b.root.position.set(0,0,-3);
const floor=(x:number,z:number)=>Math.max(0,Math.min(1.2,(z+5)*.2));
for(let i=0;i<60;i++) b.update(i/60,floor);
let penetration=0;const v=new T.Vector3();suit.traverseVisible(o=>{if(o instanceof T.Mesh && (o.material as T.Material).name==='inflatable')for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,v).applyMatrix4(o.matrixWorld);penetration=Math.max(penetration,floor(v.x,v.z)-v.y);}});
if(penetration>.025) throw new Error(`Ramp penetration: ${penetration}`);
b.root.rotation.x=0;b.root.position.set(0,0,0);
Object.assign(b.pose,restPose(),{sit:0});
const start=performance.now(); for(let i=0;i<300;i++){ b.pose.gait=i/20;b.pose.stride=.8;b.update(i/60); }
const ms=(performance.now()-start)/300;
if(downshiftDpr(.8,1/40,1)>.8) throw new Error('DPR rose under load');
const facility=createFacility();facility.root.updateMatrixWorld(true);
const room=facility.root.getObjectByName('relay-room-structure')!;
const ray = new T.Raycaster();const dir=new T.Vector3();
let from=new T.Vector3(...FACILITY_SHOTS.power[0]);
for(const key of ['patch','spectrum','dish','trace','done'] as const){
 for(const shot of facilityCameraRoute(from,key)){
  const to=new T.Vector3(...shot.p);dir.subVectors(to,from);const length=dir.length();ray.set(from,dir.normalize());ray.far=length;
  const hits=ray.intersectObject(room,true).filter(h=>h.distance>.01&&h.distance<length-.01);
  if(hits.length) throw new Error(`Camera ${key}: ${hits[0].object.name} at ${hits[0].point.toArray()}`);
  from.copy(to);
 }
}
const poolRoot=new T.Group();let hits=0;const pool=createStreetImpacts(poolRoot,()=>hits++);pool.fire(new T.Vector3(0,2,0),new T.Vector3(2,0,0));for(let i=0;i<1800;i++)pool.update(1/60);
if(hits!==1||poolRoot.children[0].children.some(o=>o.visible))throw new Error('Impact did not expire');pool.dispose();
console.log(JSON.stringify({results,actorCpuMs:ms,cameraRoutes:'clear',rampPenetration:penetration,chipBay:'same solid rig',combatSurfaces:surfaces.length,impacts:'travel / impact / expire passed',dpr:'pass'},null,2));
facility.dispose();b.dispose();
const recovery=await createBay();recovery.update(0,1/60,{fitted:0,power:0,held:false});
const up=new T.Vector3(0,1,0).applyQuaternion(recovery.model.quaternion);
const recline=90-T.MathUtils.radToDeg(up.angleTo(new T.Vector3(0,1,0)));
if(recline<20||recline>35)throw new Error(`Recovery torso recline ${recline}`);
if(!recovery.district.group.getObjectByName('recovery-backstop'))throw new Error('Recovery lacks shoulder support');
for(let i=0;i<=100;i++)recovery.update(i/30,1/30,{fitted:i/100,power:0,held:false});
const recoveryUnit=recovery.district.group.getObjectByName('power-regulator')!;
if(Math.abs(recoveryUnit.getWorldScale(new T.Vector3()).x-1)>.001)throw new Error('Installation changes original unit scale');
const readerCamera=new T.PerspectiveCamera(46,16/9,.1,400),front=new T.Vector3(0,0,1).applyQuaternion(recovery.model.quaternion);
readerCamera.position.copy(recovery.body).addScaledVector(front,9.8);readerCamera.position.y=recovery.body.y+3.6;readerCamera.lookAt(recovery.body.clone().add(new T.Vector3(0,.3,0)));readerCamera.updateMatrixWorld();
const projected=new T.Box3();recovery.model.traverseVisible(o=>{if(o instanceof T.Mesh && (o.material as T.Material).name==='inflatable')for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,v).applyMatrix4(o.matrixWorld).project(readerCamera);projected.expandByPoint(v);}});
if(projected.min.y<-.95||projected.max.y>.95||projected.min.x<-.95||projected.max.x>.95)throw new Error('Recovery overview crops the head or feet');
console.log(JSON.stringify({recoveryRecline:recline,recoveryFraming:'head and feet clear',regulator:'same world scale, four short back supports'},null,2));recovery.dispose();


