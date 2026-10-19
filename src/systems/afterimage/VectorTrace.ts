import * as T from 'three';
import { SceneKit } from '../../phase2/SceneKit';

/** A stable path in world coordinates; surrounding architecture never parents this trace. */
export class VectorTrace {
  root=new T.Group();
  readonly start:T.Vector3;
  readonly end:T.Vector3;
  private kit=new SceneKit('afterimage / resources');
  private core:T.LineBasicMaterial;
  private halo:T.MeshBasicMaterial;
  private nodes:T.InstancedMesh;
  private dummy=new T.Object3D();
  constructor(start:T.Vector3,end:T.Vector3){
    this.start=start;this.end=end;
    this.core=this.kit.ownMaterial(new T.LineBasicMaterial({color:'#c2f1ff',transparent:true,opacity:.9,depthWrite:false}));
    const p:number[]=[];
    for(let i=0;i<19;i++){const a=start.clone().lerp(end,i/19),b=start.clone().lerp(end,(i+.86)/19);p.push(a.x,a.y,a.z,b.x,b.y,b.z);}
    const geo=this.kit.ownGeometry(new T.BufferGeometry());geo.setAttribute('position',new T.Float32BufferAttribute(p,3));this.root.add(new T.LineSegments(geo,this.core));
    this.halo=this.kit.ownMaterial(new T.MeshBasicMaterial({color:'#4795c1',transparent:true,opacity:.1,depthWrite:false,blending:T.AdditiveBlending}));
    const direction=end.clone().sub(start),length=direction.length();
    const halo=new T.Mesh(this.kit.ownGeometry(new T.CylinderGeometry(.055,.055,length,5,1,true)),this.halo);
    halo.position.copy(start).add(end).multiplyScalar(.5);halo.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction.normalize());this.root.add(halo);
    this.nodes=new T.InstancedMesh(this.kit.ownGeometry(new T.OctahedronGeometry(.055)),this.coreAsMesh(),12);
    for(let i=0;i<12;i++){this.dummy.position.copy(start).lerp(end,i/11);this.dummy.updateMatrix();this.nodes.setMatrixAt(i,this.dummy.matrix);}
    this.root.add(this.nodes);this.root.name='AFTERIMAGE / stable dimensional scar';
  }
  private coreAsMesh(){return this.kit.ownMaterial(new T.MeshBasicMaterial({color:'#a7e5fa',transparent:true,opacity:.8}));}
  opacity(value:number){this.root.visible=value>.005;this.core.opacity=value;this.halo.opacity=value*.13;(this.nodes.material as T.MeshBasicMaterial).opacity=value*.75;}
  dispose(){this.root.removeFromParent();this.kit.dispose();}
}
