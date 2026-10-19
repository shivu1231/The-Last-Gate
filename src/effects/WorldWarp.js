import * as THREE from 'three';

/**
 * One shared set of uniforms bends the whole city: impact ripples that fold the road,
 * shear that slides architecture out of register, a local heave, and the corridor's pull.
 * Materials are patched once, before the first frame, so nothing recompiles mid-sequence.
 * Shadows and AO keep the undeformed shape; every deformation is brief or small.
 */
export const warpUniforms={
  uWarpTime:{value:0},
  uImpacts:{value:[0,1,2,3].map(()=>new THREE.Vector4(0,-999,0,-99))},
  uImpactPower:{value:new THREE.Vector4(0,0,0,0)},
  uShear:{value:0},
  uFold:{value:new THREE.Vector4(0,0,0,0)},
  uPull:{value:new THREE.Vector4(0,0,0,0)}
};
const header=`
uniform float uWarpTime;uniform vec4 uImpacts[4];uniform vec4 uImpactPower;uniform float uShear;uniform vec4 uFold;uniform vec4 uPull;
float warpHash(float n){return fract(sin(n)*43758.5453);}
vec3 lattiseWarp(vec3 w){
  vec3 o=vec3(0.);
  for(int i=0;i<4;i++){
    vec4 im=uImpacts[i];float age=uWarpTime-im.w;
    if(age<0.||age>2.4)continue;
    float p=i==0?uImpactPower.x:i==1?uImpactPower.y:i==2?uImpactPower.z:uImpactPower.w;
    vec3 d=w-im.xyz;float r=length(d.xz)+.001;
    float front=age*19.;float ring=exp(-pow((r-front)*.32,2.))*exp(-age*1.7)*p;
    o.y+=ring*.55;o.xz+=d.xz/r*ring*.35;
  }
  // Slices of architecture slide out of register; the road corridor itself stays walkable.
  float tall=smoothstep(4.5,8.,abs(w.x))*smoothstep(1.,6.,w.y);
  float band=floor(w.y*.42+warpHash(floor(w.x*.1))*3.);
  o.x+=uShear*tall*(warpHash(band)-.5)*1.6;o.z+=uShear*tall*(warpHash(band+7.)-.5)*.9;
  vec3 fd=w-uFold.xyz;o.y+=uFold.w*exp(-dot(fd.xz,fd.xz)*.09)*(1.+.3*sin(fd.x*1.7));
  // The corridor drags nearby space toward its axis.
  vec3 pd=uPull.xyz-w;float pr=length(pd.xz);
  o+=normalize(pd+vec3(0.,.001,0.))*uPull.w*smoothstep(28.,4.,pr)*min(pr*.45,4.);
  return o;
}`;
const project=`
vec4 lattiseLocal=vec4(transformed,1.);
#ifdef USE_BATCHING
lattiseLocal=batchingMatrix*lattiseLocal;
#endif
#ifdef USE_INSTANCING
lattiseLocal=instanceMatrix*lattiseLocal;
#endif
vec4 lattiseWorld=modelMatrix*lattiseLocal;lattiseWorld.xyz+=lattiseWarp(lattiseWorld.xyz);
vec4 mvPosition=viewMatrix*lattiseWorld;
gl_Position=projectionMatrix*mvPosition;`;

export function patchWarp(material){
  if(material.userData.lattiseWarp||!(material.isMeshStandardMaterial||material.isMeshBasicMaterial))return;
  material.userData.lattiseWarp=true;
  const previous=material.onBeforeCompile;
  material.onBeforeCompile=(shader,renderer)=>{
    previous?.call(material,shader,renderer);
    Object.assign(shader.uniforms,warpUniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+header).replace('#include <project_vertex>',project);
  };
  material.customProgramCacheKey=()=>'lattise-warp';
}
export function patchWarpTree(root){root.traverse(o=>{if(!o.material)return;for(const m of Array.isArray(o.material)?o.material:[o.material])patchWarp(m);});}
