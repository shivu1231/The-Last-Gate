import * as T from 'three';

/**
 * The way home: a torn opening between the dimension (−Z) and San Fransokyo (+Z).
 * Layers, back to front: a soft corona that lights the air around it, a counter-rotating energy
 * band whose inner edge wobbles (the stencil aperture wobbles with it, so the city really is cut
 * by that edge), the burning seam, sparks and debris spiralling in, and the seal: a contraction,
 * an implosion flash and a shockwave. `close` (0→1) irises it slowly through the escape;
 * `seal()` collapses it for good.
 */
const R=5;                      // authored radius; the ellipse group squashes it to the gate's shape
const SEAL_IMPLODE=1.15;        // seconds from seal() to the implosion flash
const SEAL_DONE=2.7;            // seconds until nothing of the gate remains
// Edge wobble in units of the aperture radius. Mirrored in GLSL below; keep the two in step.
const wobble=(a:number,t:number)=>.034*Math.sin(a*5+t*1.7)+.021*Math.sin(a*9-t*2.3)+.012*Math.sin(a*17+t*3.1);
const WOBBLE_GLSL='float wobble(float a,float t){return .034*sin(a*5.+t*1.7)+.021*sin(a*9.-t*2.3)+.012*sin(a*17.+t*3.1);}';
const VERT='varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
const NOISE=`float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}`;
const ease=(x:number)=>x*x*(3-2*x);
const clamp01=(x:number)=>T.MathUtils.clamp(x,0,1);

export function createPortalGate(z=24) {
  const group=new T.Group();group.name='PortalGate';group.position.set(0,4.2,z);
  const ellipse=new T.Group();ellipse.scale.set(.8,1.1,1);group.add(ellipse);
  const geometries:T.BufferGeometry[]=[],materials:T.Material[]=[];
  const mesh=(geometry:T.BufferGeometry,material:T.Material,parent:T.Object3D=ellipse)=>{geometries.push(geometry);materials.push(material);const m=new T.Mesh(geometry,material);m.frustumCulled=false;parent.add(m);return m;};

  // Stencil aperture: a unit disc whose rim vertices follow the wobble every frame.
  const maskMaterial=new T.MeshBasicMaterial({colorWrite:false,depthWrite:false,depthTest:false,side:T.DoubleSide,stencilWrite:true,stencilRef:1,stencilFunc:T.AlwaysStencilFunc,stencilZPass:T.ReplaceStencilOp});
  const maskGeometry=new T.CircleGeometry(1,128);
  const mask=mesh(maskGeometry,maskMaterial);mask.name='portal-aperture';mask.renderOrder=-1000;
  const maskPos=maskGeometry.attributes.position as T.BufferAttribute;
  const rimAngles=Array.from({length:maskPos.count},(_,i)=>Math.atan2(maskPos.getY(i),maskPos.getX(i)));

  const shared={uTime:{value:0},uClose:{value:0},uAperture:{value:.89},uInstability:{value:0},uIntensity:{value:1}};

  // 1. Corona: soft light in the air around the rim, flickering with the energy.
  const corona=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,uniforms:shared,vertexShader:VERT,
    fragmentShader:`varying vec2 vUv;uniform float uTime;uniform float uInstability;uniform float uIntensity;${NOISE}
    void main(){vec2 p=(vUv-.5)*3.2;float r=length(p);float a=atan(p.y,abs(p.x)+abs(p.y)>1e-6?p.x:1.);
      float n=fbm(vec2(a*2.2+uTime*.15,r*2.-uTime*.4));
      float halo=exp(-(((r-1.)*3.2)*((r-1.)*3.2)))*(.55+.6*n)+exp(-(((r-1.)*9.)*((r-1.)*9.)))*.5;
      vec3 col=mix(vec3(.30,.72,.95),vec3(.62,.46,.95),n);
      gl_FragColor=vec4(col,halo*.16*(1.+uInstability*2.5)*uIntensity);}`});
  mesh(new T.PlaneGeometry(R*3.2,R*3.2),corona).renderOrder=3;

  // 2. Energy band: two counter-rotating fbm layers between the clear eye and the rim, with a
  // chromatic fringe along the wobbling inner edge (the heat-haze read of torn space).
  const field=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,uniforms:shared,vertexShader:VERT,
    fragmentShader:`varying vec2 vUv;uniform float uTime;uniform float uAperture;uniform float uInstability;uniform float uIntensity;${NOISE}${WOBBLE_GLSL}
    vec2 rot(vec2 p,float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c)*p;}
    void main(){vec2 p=(vUv-.5)*2.;float r=length(p);if(r>1.)discard;float a=atan(p.y,abs(p.x)+abs(p.y)>1e-6?p.x:1.);
      float edge=uAperture*(1.+wobble(a,uTime)*(1.+uInstability*3.));
      float band=smoothstep(edge-.015,edge+.03,r)*(1.-smoothstep(.93,1.,r));
      float swirlA=fbm(rot(p,uTime*.32+r*2.6)*3.1+vec2(0.,-uTime*.6));
      float swirlB=fbm(rot(p,-uTime*.21-r*3.4)*4.3+vec2(uTime*.4,0.));
      float streaks=pow(max(0.,.5+.5*sin(a*14.+r*30.-uTime*2.2+swirlA*6.)),6.);
      vec3 cyan=vec3(.34,.86,1.),violet=vec3(.66,.47,1.);
      vec3 col=cyan*swirlA*1.3+violet*swirlB*1.1+vec3(.8,.95,1.)*streaks*.45;
      float alpha=band*(.18+.42*swirlA*swirlB+streaks*.18);
      // The seam: a hot line on the inner edge, split into cyan / violet a hair apart.
      float d=r-edge;
      float seamC=exp(-((d*90.)*(d*90.))),seamV=exp(-(((d-.012)*70.)*((d-.012)*70.))),seamO=exp(-(((d+.01)*70.)*((d+.01)*70.)));
      col+=vec3(.9,1.,1.)*seamC*1.6+violet*seamV*.9+cyan*seamO*.9;alpha+=seamC*.85+(seamV+seamO)*.35;
      // Rim glow at the outer edge.
      float rim=exp(-(((r-.95)*26.)*((r-.95)*26.)));col+=cyan*rim*.6;alpha+=rim*.25;
      gl_FragColor=vec4(col,alpha*.8*min(uIntensity,1.8)*(1.+uInstability*.5));}`});
  const fieldMesh=mesh(new T.CircleGeometry(R*1.08,160),field);fieldMesh.renderOrder=5;

  // 3. Structure: the burning tube rim, and a broad soft fringe behind it.
  const points=Array.from({length:129},(_,i)=>{const a=i/128*Math.PI*2,r=R*(1+.009*Math.sin(a*7)+.006*Math.cos(a*11));return new T.Vector3(Math.cos(a)*r,Math.sin(a)*r,.025*Math.sin(a*4));});
  const curve=new T.CatmullRomCurve3(points,true);
  const seamMat=new T.MeshBasicMaterial({color:new T.Color('#b9e1df').multiplyScalar(1.6),toneMapped:false,transparent:true});
  const rimGroup=new T.Group();ellipse.add(rimGroup);
  mesh(new T.TubeGeometry(curve,192,.036,6,true),seamMat,rimGroup).renderOrder=6;
  const fringeMat=new T.MeshBasicMaterial({color:'#8a9dc5',transparent:true,opacity:.18,depthWrite:false,blending:T.AdditiveBlending});
  mesh(new T.TubeGeometry(curve,192,.09,6,true),fringeMat,rimGroup).renderOrder=4;

  // 4. Sparks: GPU-animated, spiralling in from the surrounding air and vanishing at the edge.
  const SPARKS=320,seed=new Float32Array(SPARKS*4),sparkPos=new Float32Array(SPARKS*3);
  for(let i=0;i<SPARKS;i++){seed[i*4]=Math.random()*Math.PI*2;seed[i*4+1]=1.08+Math.random()*.9;seed[i*4+2]=.12+Math.random()*.22;seed[i*4+3]=Math.random();}
  const sparkGeo=new T.BufferGeometry();sparkGeo.setAttribute('position',new T.BufferAttribute(sparkPos,3));sparkGeo.setAttribute('seed',new T.BufferAttribute(seed,4));
  const sparkMat=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,uniforms:{...shared,uPull:{value:0},uSize:{value:1}},
    vertexShader:`attribute vec4 seed;uniform float uTime;uniform float uAperture;uniform float uPull;uniform float uSize;varying float vFade;
    void main(){float life=fract(uTime*seed.z*(1.+uPull*3.)+seed.w);float k=life*life;
      float r=mix(seed.y,uAperture*.98,k);float a=seed.x+k*(2.2+uPull*3.)+uTime*.05;
      vec3 p=vec3(cos(a)*r*${R}.,sin(a)*r*${R}.,sin(seed.x*7.)*(1.-k)*.9);
      vFade=smoothstep(0.,.15,life)*(1.-smoothstep(.85,1.,life));
      vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=uSize*(1.+seed.w*1.5)*(1.+uPull*.25)*(42./max(1.,-mv.z));}`,
    fragmentShader:`varying float vFade;uniform float uIntensity;void main(){vec2 c=gl_PointCoord-.5;float d=length(c);float g=exp(-d*d*28.);gl_FragColor=vec4(vec3(.7,.92,1.)*1.4,g*vFade*min(uIntensity,1.6)*.85);}`});
  geometries.push(sparkGeo);materials.push(sparkMat);
  const sparks=new T.Points(sparkGeo,sparkMat);sparks.frustumCulled=false;sparks.renderOrder=7;ellipse.add(sparks);

  // 5. Debris: real chunks of the street, dragged into a slow orbit and pulled through.
  const DEBRIS=26,debrisGeo=new T.DodecahedronGeometry(.16,0);
  const debrisMat=new T.MeshStandardMaterial({color:'#2a3646',roughness:.75,metalness:.15,emissive:'#3b7fa8',emissiveIntensity:.35});
  geometries.push(debrisGeo);materials.push(debrisMat);
  const debris=new T.InstancedMesh(debrisGeo,debrisMat,DEBRIS);debris.frustumCulled=false;group.add(debris);
  const chunks=Array.from({length:DEBRIS},()=>({a:Math.random()*Math.PI*2,r:1.25+Math.random()*1.1,life:Math.random(),speed:.05+Math.random()*.07,size:.5+Math.random()*1.4,spin:new T.Vector3(Math.random(),Math.random(),Math.random()).multiplyScalar(3),z:(Math.random()-.5)*2.4}));
  const m4=new T.Matrix4(),q=new T.Quaternion(),e=new T.Euler(),v=new T.Vector3(),s=new T.Vector3();

  // 6. The seal: an implosion core and a shockwave ring, both invisible until the gate collapses.
  const flashMat=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,side:T.DoubleSide,blending:T.AdditiveBlending,uniforms:{uFlash:{value:0}},vertexShader:VERT,
    fragmentShader:`varying vec2 vUv;uniform float uFlash;void main(){vec2 p=(vUv-.5)*2.;float r=length(p);float a=atan(p.y,abs(p.x)+abs(p.y)>1e-6?p.x:1.);
      float core=exp(-r*r*18.)+exp(-r*5.)*.35;float rays=pow(max(0.,.5+.5*sin(a*9.)),12.)*exp(-r*3.)*.6;
      gl_FragColor=vec4(vec3(.85,.96,1.)*2.,(core+rays)*uFlash);}`});
  const flash=mesh(new T.PlaneGeometry(R*2.4,R*2.4),flashMat,group);flash.renderOrder=9;
  const waveMat=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,uniforms:{uWave:{value:0},uAlpha:{value:0}},vertexShader:VERT,
    fragmentShader:`varying vec2 vUv;uniform float uWave;uniform float uAlpha;void main(){vec2 p=(vUv-.5)*2.;float r=length(p);
      float ring=exp(-(((r-uWave)*(14.-uWave*8.))*((r-uWave)*(14.-uWave*8.))));float inner=smoothstep(uWave,0.,r)*.12;
      gl_FragColor=vec4(mix(vec3(.55,.9,1.),vec3(.7,.55,1.),r),(ring+inner)*uAlpha);}`});
  const wave=mesh(new T.PlaneGeometry(R*6,R*6),waveMat,group);wave.renderOrder=8;

  // Light on the surroundings. Kept outside the gate group and never hidden (only dimmed to 0), so
  // showing or hiding the gate never changes the scene's light count and never recompiles shaders.
  const lights=new T.Group();lights.name='PortalLight';lights.position.copy(group.position);
  const key=new T.PointLight('#8fd8ff',0,42,1.5);key.position.set(0,0,.6);lights.add(key);
  const wash=new T.PointLight('#a487ff',0,26,1.6);wash.position.set(0,-3.4,-.8);lights.add(wash);

  let close=0,sealT=-1,shown=true,flashOut=0,imploded=false,tension=0;
  const aperture=()=>T.MathUtils.lerp(.89,.34,close);
  return {group,lights,z,
    get closeAmount(){return close;},
    /** True once the seal has finished: nothing of the gate is left. */
    get sealed(){return sealT>=SEAL_DONE;},
    /** 0..1 white flash at the implosion, for the post pass. */
    get flash(){return flashOut;},
    /** True on the one update where the gate implodes. */
    get imploded(){return imploded;},
    setClose(value:number){close=clamp01(value);},
    /** The return decision builds wind and flicker without prematurely sealing the aperture. */
    setTension(value:number){tension=clamp01(value);},
    /** Collapse the gate for good: contraction, implosion, shockwave. Idempotent. */
    seal(){if(sealT<0)sealT=0;},
    reset(){sealT=-1;close=0;flashOut=0;imploded=false;tension=0;},
    /** Whether the gate is in the world at all (drives light, not shader state). */
    setShown(value:boolean){shown=value;},
    update(t:number,dt:number,target?:number){
      if(target!==undefined&&sealT<0)close=T.MathUtils.damp(close,target,2,dt);
      const before=sealT;if(sealT>=0)sealT+=dt;
      imploded=before>=0&&before<SEAL_IMPLODE&&sealT>=SEAL_IMPLODE;
      // Seal timeline: contract (0→1.15s), implode, shockwave and fade (→2.7s).
      const contract=sealT<0?0:ease(clamp01(sealT/SEAL_IMPLODE));
      const after=sealT<SEAL_IMPLODE?0:clamp01((sealT-SEAL_IMPLODE)/(SEAL_DONE-SEAL_IMPLODE));
      const gone=sealT>=SEAL_IMPLODE;
      const instability=Math.min(1,close*.35+contract*1.2+tension*.38);
      const scale=gone?0:1-contract*contract*.82;
      ellipse.scale.set(.8*scale,1.1*scale,1);ellipse.visible=!gone;
      const ap=T.MathUtils.lerp(aperture(),0,contract);
      shared.uTime.value=t;shared.uClose.value=close;shared.uAperture.value=ap;shared.uInstability.value=instability;shared.uIntensity.value=1+contract*1.6;
      sparkMat.uniforms.uPull.value=contract*2+close*.3+tension*.9;
      // Aperture follows the same wobble the shader draws.
      const amp=1+instability*3,r=Math.max(.0001,R*ap);
      for(let i=1;i<maskPos.count;i++){const k=1+wobble(rimAngles[i],t)*amp;maskPos.setXY(i,Math.cos(rimAngles[i])*k,Math.sin(rimAngles[i])*k);}
      maskPos.needsUpdate=true;mask.scale.set(r,r,1);
      seamMat.color.setRGB(.73,.88,.87).multiplyScalar(1.6+contract*2.5);
      fringeMat.opacity=.18+contract*.35;
      rimGroup.scale.setScalar(1+Math.sin(t*1.3)*.004+shiver(t,instability));
      // Debris: an inward spiral; through the seal they all go at once.
      const pull=1+close*.6+contract*6+tension*1.6;
      for(let i=0;i<DEBRIS;i++){const c=chunks[i];c.life+=dt*c.speed*pull;if(c.life>=1){c.life=gone?1:0;c.a=Math.random()*Math.PI*2;c.r=1.25+Math.random()*1.1;}
        const k=c.life*c.life,rr=T.MathUtils.lerp(c.r,ap*.9,k),a=c.a+k*2.4+t*.04;
        const fade=gone?0:Math.min(1,c.life*6)*(1-T.MathUtils.smoothstep(c.life,.8,1));
        v.set(Math.cos(a)*rr*R*.8*scale,Math.sin(a)*rr*R*1.1*scale,c.z*(1-k));
        e.set(c.spin.x*t,c.spin.y*t,c.spin.z*t);q.setFromEuler(e);s.setScalar(c.size*fade*(1-contract*.5));
        m4.compose(v,q,s);debris.setMatrixAt(i,m4);}
      debris.instanceMatrix.needsUpdate=true;
      // Implosion flash and shockwave.
      const pop=sealT<0?0:Math.exp(-Math.pow((sealT-SEAL_IMPLODE)*7,2))+(gone?Math.exp(-(sealT-SEAL_IMPLODE)*2.6)*.35:0);
      flashMat.uniforms.uFlash.value=pop*1.4;flash.scale.setScalar(.4+pop*.9);
      waveMat.uniforms.uWave.value=after*1.05;waveMat.uniforms.uAlpha.value=gone?(1-after)*(1-after)*.9:0;
      flashOut=sealT<0?0:pop;
      // Light: pulses while open, swells as it contracts, spikes at the implosion, then gone.
      const pulse=.9+.1*Math.sin(t*.8)+(.05+.12*tension)*Math.sin(t*5.3)*instability;
      const live=shown&&!(gone&&after>=1)?1:0;
      key.intensity=live*((gone?0:(14-close*5)*pulse*(1+contract*1.8))+pop*70);
      wash.intensity=live*((gone?0:6*pulse*(1+contract))+pop*30);
    },
    dispose(){geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.removeFromParent();group.clear();lights.removeFromParent();lights.clear();}};
}
export type PortalGate=ReturnType<typeof createPortalGate>;
/** Unstable rims shiver; a calm one only breathes. */
function shiver(t:number,instability:number){return instability*.012*Math.sin(t*23.)*Math.sin(t*17.3);}

/** Cache material state once; crossing changes GPU stencil state, never shaders. */
export function portalWorldMask(root:T.Object3D) {
  const originals=new Map<T.Material,{write:boolean;ref:number;func:T.Material['stencilFunc'];pass:T.Material['stencilZPass']}>();
  root.traverse(o=>{const value=(o as T.Mesh).material;if(value)for(const m of Array.isArray(value)?value:[value])if(!originals.has(m))originals.set(m,{write:m.stencilWrite,ref:m.stencilRef,func:m.stencilFunc,pass:m.stencilZPass});});
  let current:string|null=null;
  return {set(mode:'inside'|'outside'|'none'){if(current===mode)return;current=mode;const enabled=mode!=='none';for(const [m,old]of originals){m.stencilWrite=enabled||old.write;m.stencilRef=enabled?1:old.ref;m.stencilFunc=enabled?(mode==='inside'?T.EqualStencilFunc:T.NotEqualStencilFunc):old.func;m.stencilZPass=enabled?T.KeepStencilOp:old.pass;}},dispose(){for(const[m,old]of originals){m.stencilWrite=old.write;m.stencilRef=old.ref;m.stencilFunc=old.func;m.stencilZPass=old.pass;}}};
}
