import * as T from 'three';

export type Pose={p:[number,number,number];s?:[number,number,number];r?:[number,number,number]};
export type ChapterWorld={root:T.Group;update:(time:number,dt:number)=>void;dispose:()=>void};

/** One resource owner per chapter; no module-level GPU resources survive an exit. */
export class SceneKit {
  root=new T.Group();
  private geometries=new Set<T.BufferGeometry>();
  private materials=new Set<T.Material>();
  private textures=new Set<T.Texture>();
  boxGeo=this.ownGeometry(new T.BoxGeometry(1,1,1));
  sphereGeo=this.ownGeometry(new T.IcosahedronGeometry(1,1));
  concrete=this.standard('#485f72',.91,.06);
  edge=this.standard('#1d3042',.78,.25);
  metal=this.standard('#637d8c',.45,.64);
  dark=this.standard('#101d2a',.9,.22);
  ivory=this.standard('#b5cbd1',.6,.25);
  cyan=this.basic('#b2eaff',1.5);
  dim=this.basic('#366783',.7);
  private dummy=new T.Object3D();
  constructor(name:string){this.root.name=name;}
  ownGeometry<G extends T.BufferGeometry>(geometry:G):G{this.geometries.add(geometry);return geometry;}
  ownMaterial<M extends T.Material>(material:M):M{this.materials.add(material);return material;}
  standard(color:string,roughness=.8,metalness=.2){return this.ownMaterial(new T.MeshStandardMaterial({color,roughness,metalness}));}
  basic(color:string,intensity=1){return this.ownMaterial(new T.MeshBasicMaterial({color:new T.Color(color).multiplyScalar(intensity)}));}
  box(p:Pose,material:T.Material=this.concrete,parent:T.Object3D=this.root){const m=new T.Mesh(this.boxGeo,material);this.pose(m,p);m.receiveShadow=true;parent.add(m);return m;}
  mesh(geometry:T.BufferGeometry,material:T.Material,p:Pose,parent:T.Object3D=this.root){const m=new T.Mesh(this.ownGeometry(geometry),material);this.pose(m,p);parent.add(m);return m;}
  pose(object:T.Object3D,p:Pose){object.position.set(...p.p);if(p.s)object.scale.set(...p.s);if(p.r)object.rotation.set(...p.r);}
  instances(poses:Pose[],material:T.Material=this.concrete,geometry:T.BufferGeometry=this.boxGeo,parent:T.Object3D=this.root){
    const mesh=new T.InstancedMesh(geometry,material,poses.length);
    for(let i=0;i<poses.length;i++){this.dummy.position.set(0,0,0);this.dummy.scale.set(1,1,1);this.dummy.rotation.set(0,0,0);this.pose(this.dummy,poses[i]);this.dummy.updateMatrix();mesh.setMatrixAt(i,this.dummy.matrix);}
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();parent.add(mesh);return mesh;
  }
  line(points:T.Vector3[],color='#83c7e1',opacity=.5,parent:T.Object3D=this.root){
    const g=this.ownGeometry(new T.BufferGeometry().setFromPoints(points));
    const m=this.ownMaterial(new T.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false}));
    const line=new T.Line(g,m);parent.add(line);return line;
  }
  label(text:string,p:Pose,width=5,color='#a6d5e5',parent:T.Object3D=this.root){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;
    const ctx=canvas.getContext('2d')!;let size=46;ctx.font=`500 ${size}px "IBM Plex Mono",monospace`;ctx.fillStyle=color;
    while(ctx.measureText(text.split('\n')[0]).width>1000&&size>22){size-=2;ctx.font=`500 ${size}px "IBM Plex Mono",monospace`;}
    text.split('\n').forEach((line,i)=>ctx.fillText(line,12,78+i*42));
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;this.textures.add(texture);
    const material=this.ownMaterial(new T.MeshBasicMaterial({map:texture,transparent:true,opacity:1,depthWrite:false,side:T.DoubleSide,toneMapped:false}));
    return this.mesh(this.ownGeometry(new T.PlaneGeometry(width,width/8)),material,p,parent);
  }
  haze(p:Pose,color='#397895',opacity=.13){
    const material=this.ownMaterial(new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,uniforms:{color:{value:new T.Color(color)},opacity:{value:opacity}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;uniform vec3 color;uniform float opacity;void main(){vec2 p=(vUv-.5)*2.;float a=pow(max(0.,1.-dot(p,p)),3.);gl_FragColor=vec4(color,a*opacity);}'}));
    return this.mesh(this.ownGeometry(new T.PlaneGeometry(1,1)),material,p);
  }
  dispose(){this.root.removeFromParent();this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());this.root.clear();}
}
export function seeded(seed:number){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
export function ease(a:number,b:number,t:number){return T.MathUtils.smoothstep(t,a,b);}
