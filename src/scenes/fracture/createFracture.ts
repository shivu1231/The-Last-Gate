import * as T from 'three';
import { SceneKit, ease, seeded, type Pose } from '../../phase2/SceneKit';
import { VectorTrace } from '../../systems/afterimage/VectorTrace';
import type { PhaseTwoDirector } from '../../phase2/model';

export function createFracture(director:PhaseTwoDirector){
  const k=new SceneKit('11 / THE FRACTURE');const random=seeded(1105);
  // A broken street is our sole frame of reference. The composition opens into absence.
  k.box({p:[-1,-1.35,5],s:[16,.65,24],r:[0,.13,-.025]},k.edge);
  k.box({p:[-1,-.99,5],s:[15.8,.05,23.6],r:[0,.13,-.025]},k.dark);
  const roadMarks:Pose[]=[];for(let i=0;i<7;i++)roadMarks.push({p:[-.5,-.93,13-i*3.1],s:[.09,.02,1.4],r:[0,.13,0]});k.instances(roadMarks,k.metal);
  const rails:Pose[]=[];for(let i=0;i<10;i++){rails.push({p:[-8.2,-.14,10-i*2],s:[.055,1.55,.055]});}rails.push({p:[-8.2,.55,1],s:[.06,.06,20]});k.instances(rails,k.metal);
  const bodies:Pose[]=[],edges:Pose[]=[],windows:Pose[]=[];
  for(let i=0;i<16;i++){
    const side=i%2?1:-1,x=side*(18+random()*32),z=-22-random()*145,y=-18+random()*50,w=5+random()*9,h=10+random()*24;
    const rotation=new T.Euler((random()-.5)*.8,(random()-.5)*.6,i<4?side*.65:(random()-.5)*.3);
    const transform=new T.Matrix4().compose(new T.Vector3(x,y,z),new T.Quaternion().setFromEuler(rotation),new T.Vector3(1,1,1));
    bodies.push({p:[x,y,z],s:[w,h,6],r:[rotation.x,rotation.y,rotation.z]});
    const local=(px:number,py:number,pz:number):[number,number,number]=>new T.Vector3(px,py,pz).applyMatrix4(transform).toArray() as [number,number,number];
    for(let row=0;row<Math.floor(h/2);row++){edges.push({p:local(0,-h/2+row*2,3.08),s:[w+.15,.07,.12],r:[rotation.x,rotation.y,rotation.z]});for(let col=0;col<3;col++)windows.push({p:local((col-1)*w*.24,-h/2+row*2+.7,3.12),s:[w*.14,1,.02],r:[rotation.x,rotation.y,rotation.z]});}
  }
  k.instances(bodies,k.concrete);k.instances(edges,k.edge);k.instances(windows,k.dim);
  // Incomplete bridge, vertical asphalt, window frames existing without walls.
  k.box({p:[-24,11,-51],s:[36,.7,5],r:[0,.2,-.22]},k.metal);
  k.box({p:[17,8,-36],s:[5,.5,27],r:[.95,0,.4]},k.edge);
  const loose:Pose[]=[];for(let i=0;i<24;i++){const x=11+(i%4)*1.4,y=6+Math.floor(i/4)*1.6;loose.push({p:[x,y,-23],s:[1.1,.04,.05],r:[0,.18,.16]});loose.push({p:[x-.53,y+.65,-23],s:[.04,1.3,.05],r:[0,.18,.16]});}k.instances(loose,k.metal);
  const fragment=new T.Group();fragment.position.set(4.9,2.7,-14);k.root.add(fragment);
  k.box({p:[0,0,0],s:[3.2,4.8,1.3]},k.concrete,fragment);k.box({p:[0,0,.7],s:[3.3,.12,.15]},k.metal,fragment);
  k.label('通行止 / NO THROUGH ROAD',{p:[-5,2.3,-9],r:[0,.2,-.2]},4.5);
  k.haze({p:[-8,5,-55],s:[65,30,1]},'#48829e',.2);k.haze({p:[27,17,-85],s:[52,60,1]},'#43416b',.09);
  const scar=new VectorTrace(new T.Vector3(-4,1.1,-5),new T.Vector3(8.5,5.4,-55));k.root.add(scar.root);
  const diagnosis=k.label('ATTACK VECTOR // 01    SOURCE // BM-01\nTARGET // HIRO     DISPLACEMENT // +18.7\nLOCAL STABILITY // 3.2 SEC',{p:[-.2,3.4,-13],r:[0,-.12,-.08]},8.8);
  diagnosis.visible=false;
  const red=k.mesh(k.sphereGeo,k.basic('#e23c40',4),{p:[-13,9,-105],s:[.16,.16,.16]});red.visible=false;
  const debrisPos:Pose[]=[];for(let i=0;i<50;i++)debrisPos.push({p:[(random()-.5)*45,-8+random()*25,-5-random()*60],s:[.04+random()*.13,.04,.08],r:[random(),random(),random()]});const debris=k.instances(debrisPos,k.metal);
  let releaseTime=0;
  return {root:k.root,scar,update(time:number,dt:number){
    const s=director.getSnapshot();const stored=s.stored;
    fragment.position.y=2.7+Math.sin(time*.22)*.17;
    releaseTime=stored?Math.min(.28,releaseTime+dt):0;
    const release=ease(0,.28,releaseTime);
    // Recording ends with a discontinuous local slip: the trace was holding it in place.
    fragment.rotation.z=Math.sin(time*.13)*.025+release*.31;fragment.position.x=4.9+release*1.1;
    scar.opacity(s.stage==='fracture'?.28:stored?Math.max(.12,1-release):.85);
    diagnosis.visible=s.scanning;debris.rotation.y=Math.sin(time*.035)*.025;
    red.visible=stored&&Math.sin(time*.43)>.42;red.position.x=Math.sin(time*.19)>0?-13:25;
  },dispose(){scar.dispose();k.dispose();}};
}
