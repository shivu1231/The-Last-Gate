import * as T from 'three';
import { assets } from '../src/systems/AssetManager';
import { BaymaxController } from '../src/characters/BaymaxController';
import { CameraDirector, type ShotContext } from '../src/systems/CameraDirector';
import { PULL_CONTACT_POSITION, SequenceDirector } from '../src/systems/SequenceDirector';
import { useSceneState, type Phase } from '../src/state/SceneStateManager';
import { SHELL_DURATIONS } from '../src/config/shell';
const shell=await assets.cloneBaymax(), actor=new BaymaxController(shell);await actor.prepareSuit();
const seq=new SequenceDirector(), director=new CameraDirector(), camera=new T.PerspectiveCamera(54,16/9,.1,500);
camera.position.set(2,2.5,-7);camera.lookAt(2.7,1.8,-12);camera.updateMatrixWorld();
const ctx:ShotContext={chest:new T.Vector3(),normal:new T.Vector3(),chip:new T.Vector3(),baymax:new T.Vector3(),head:new T.Vector3()};
const snapshots:unknown[]=[];let time=0;const v=new T.Vector3(),box=new T.Box3();const sampled=new Set<string>();
let checkedFrames=0,peakStep=0,impactClearance=Infinity,minMeshCameraDistance=Infinity,dt=1/60,sprinting=true;
const previous=new T.Vector3();let hasPrevious=false;const strikes:number[][]=[],cadence:unknown[]=[];let attacks=0;
seq.on(event=>{
 if(event.type==='flyby'||event.type==='discharge'||event.type==='impact'&&(seq.beat==='final'||seq.beat==='overhead'))attacks++;
 if(event.type==='impact'&&seq.beat==='rooftop'){
  const screen=event.position.clone().project(camera);strikes.push(screen.toArray());
  if(Math.abs(screen.x)>.95||Math.abs(screen.y)>.95||screen.z>1)throw new Error('Ranged miss is outside the camera');
 }
});
function visibleBounds(){
 box.makeEmpty();shell.traverseVisible(o=>{if(o instanceof T.Mesh && !Array.isArray(o.material) && o.material.name==='inflatable')for(let i=0;i<o.geometry.attributes.position.count;i++){
  o.getVertexPosition(i,v).applyMatrix4(o.matrixWorld);minMeshCameraDistance=Math.min(minMeshCameraDistance,v.distanceTo(camera.position));v.project(camera);box.expandByPoint(v);
 }});
}
seq.on(event=>{if(event.type==='impact'&&seq.beat==='final'){
 shell.updateMatrixWorld(true);let low=Infinity;
 shell.traverseVisible(o=>{if(o instanceof T.Mesh&&!Array.isArray(o.material)&&!o.material.transparent&&o.parent?.name.startsWith('ankle-'))for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,v).applyMatrix4(o.matrixWorld);low=Math.min(low,v.y);}});
 impactClearance=Math.abs(low+.14);
}});
function frame(phase:Phase){
 time+=dt;seq.sprint=sprinting;seq.update(dt);actor.chestFrame(ctx.chest,ctx.normal);ctx.baymax.copy(shell.position);actor.headFocus(ctx.head);
 director.update(camera,dt,1280,720,seq,ctx);actor.update(time,dt,false,phase,seq,camera.position);shell.updateMatrixWorld(true);camera.updateMatrixWorld();
 if(phase==='ignition'&&seq.phaseTime>.7&&Math.round(seq.phaseTime*60)%6===0){visibleBounds();if(box.min.y<-.98||box.max.y>.98)throw new Error(`Launch crops Baymax at ${seq.phaseTime.toFixed(2)}: ${box.min.y}/${box.max.y}`);}
 if(hasPrevious&&phase==='chase')peakStep=Math.max(peakStep,shell.position.distanceTo(previous)/dt);previous.copy(shell.position);hasPrevious=true;
 if(phase==='chase'&&seq.beat&&seq.beatTime>.4&&seq.beatTime<({silhouette:1.6,overhead:2.2,rooftop:2.5,final:3.1,'tear-pass':0,launch:0}[seq.beat])&&Math.round(seq.beatTime*60)%6===0){
  visibleBounds();checkedFrames++;
  if(box.min.x<-.98||box.max.x>.98||box.min.y<-.98||box.max.y>.98||box.max.z>=1)throw new Error(`Clipped ${seq.beat} at ${seq.beatTime.toFixed(2)}: ${box.min.toArray()} / ${box.max.toArray()}`);
 }
 if(phase==='chase'&&seq.beat&&!sampled.has(seq.beat)&&seq.beatTime>(seq.beat==='rooftop'?1.43:seq.beat==='final'?2.28:.65)){
  visibleBounds();
  snapshots.push({aspect:camera.aspect,beat:seq.beat,time:seq.beatTime,min:box.min.toArray(),max:box.max.toArray(),distance:camera.position.distanceTo(shell.position)});sampled.add(seq.beat);
 }
}
for(const [index,aspect] of [16/9,690/668,16/9,690/668].entries()){
 dt=index<2?1/60:1/30;sprinting=index<2;attacks=0;camera.aspect=aspect;camera.updateProjectionMatrix();sampled.clear();
 useSceneState.setState({phase:'ignition',chapter:'RED_WAKE',replay:index});for(let i=0;i<Math.ceil(SHELL_DURATIONS.ignition!/dt);i++)frame('ignition');
 useSceneState.setState({phase:'chase'});let frames=0;for(;frames<Math.ceil(16/dt)&&useSceneState.getState().phase==='chase';frames++)frame('chase');
 if(sampled.size!==4)throw new Error('Missing flight beat');if(attacks!==5)throw new Error(`Expected five attack contacts, received ${attacks}`);
 if(frames*dt>12.5)throw new Error('Fight stalls while waiting for input');
 cadence.push({aspect,fps:1/dt,sprinting,seconds:frames*dt,attacks});
}
for (const shot of snapshots as {beat:string,min:number[],max:number[],distance:number}[]) { if(shot.min[0]<-.93||shot.max[0]>.93||shot.min[1]<-.93||shot.max[1]>.93||shot.max[2]>=1) throw new Error(`Baymax leaves frame at ${shot.beat}`); if(shot.distance<2) throw new Error(`Camera collision at ${shot.beat}`); }
if(sampled.size!==4)throw new Error('An authored flight beat was not exercised');
if(peakStep>28)throw new Error(`Abrupt movement speed ${peakStep}`);
if(minMeshCameraDistance<1)throw new Error(`A body surface collides with the camera: ${minMeshCameraDistance}`);
if(impactClearance>.04)throw new Error(`Impact before sole contact: ${impactClearance}`);
dt=1/60;useSceneState.setState({phase:'fracture',chapter:'THE_FRACTURE'});for(let i=0;i<336;i++)frame('fracture');
useSceneState.setState({phase:'pulled'});for(let i=0;i<87;i++)frame('pulled');
const shoulderContact=shell.localToWorld(new T.Vector3(1.02,2.26,.02)).distanceTo(PULL_CONTACT_POSITION);
if(shoulderContact>.55)throw new Error(`Displacement sparks miss shoulder: ${shoulderContact}`);
console.log(JSON.stringify({cadence,openingShots:snapshots,checkedFrames,peakSpeed:peakStep,minMeshCameraDistance,impactClearance,strikes,shoulderContact,framing:'all four beats retain head and feet',cameraCollision:'clear'},null,2));actor.dispose();

