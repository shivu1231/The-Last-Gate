import * as THREE from 'three';

// Art layers only: no narrative or movement state lives here.
export function createPortalArt(scene,{mesh,box,materials,rand,mistTexture}){
  const root=new THREE.Group();root.name='Portal illumination and city remnants';scene.add(root);
  const pulses=[];
  function tear(points,color,power){
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    const core=new THREE.MeshBasicMaterial({color:'#b7eaff',toneMapped:false});core.color.multiplyScalar(2.2);
    const fringe=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.13,depthWrite:false,blending:THREE.AdditiveBlending});
    const tube=mesh(new THREE.TubeGeometry(curve,64,.022,6,false),core,0,0,0,root);tube.castShadow=false;
    const halo=mesh(new THREE.TubeGeometry(curve,64,.17,8,false),fringe,0,0,0,root);halo.castShadow=false;
    const center=curve.getPoint(.5),light=new THREE.PointLight(color,power,22,1.5);light.position.copy(center);root.add(light);
    const mist=new THREE.Sprite(new THREE.SpriteMaterial({map:mistTexture,color,opacity:.22,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));mist.position.copy(center);mist.scale.set(12,20,1);root.add(mist);
    pulses.push({light,power,fringe,mist});
  }
  tear([[-12,0,-23],[-11.6,4,-23.5],[-12.2,7,-24],[-10.8,12,-25],[-11.2,17,-27]],'#65cfff',18);
  tear([[18,4,-47],[20,10,-48],[19,16,-49],[23,21,-51]],'#9b78db',24);
  // Fractured road edge catches the same source as the suspended masonry.
  tear([[-5.25,-.4,-15],[-5.6,-.25,-18],[-5.3,-.3,-20]],'#76d8ff',3);
  function sign(text,sub,color,x,y,z,w){
    const c=document.createElement('canvas');c.width=512;c.height=192;const ctx=c.getContext('2d');
    ctx.fillStyle='#121b29';ctx.fillRect(0,0,512,192);ctx.strokeStyle=color;ctx.lineWidth=5;ctx.strokeRect(12,12,488,168);
    ctx.fillStyle=color;ctx.textAlign='center';ctx.font='600 58px sans-serif';ctx.fillText(text,256,87);ctx.font='22px sans-serif';ctx.fillText(sub,256,143);
    // One damaged segment, preserving legibility and avoiding wall-to-wall neon.
    ctx.fillStyle='#0c1423';ctx.fillRect(349,0,14,192);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;
    const mat=new THREE.MeshStandardMaterial({map:tex,emissiveMap:tex,emissive:'#ffffff',emissiveIntensity:1.35,roughness:.6});
    box(w,w*.375,.11,mat,x,y,z,root);
    return mat;
  }
  const transit=sign('TRANSIT','SAN FRANSOKYO  /  14', '#81c7dc',-12,6.8,-17.8,3.3);
  const shop=sign('ラーメン','NOODLES • OPEN LATE','#e5ad67',-13.3,2.5,-17.8,2.5);
  const warm=new THREE.PointLight('#ffb96c',7,9,1.7);warm.position.set(-12.3,2.5,-16.8);root.add(warm);
  const coast=sign('海岸通り','COAST AVENUE','#ad5360',17,9,-25,2.6);
  // A surviving amber signal on a broken roadside mast.
  box(.09,3.9,.09,materials.metal,5.2,1.8,-20,root);
  box(.38,1,.25,materials.dark,5.2,3.3,-20,root);
  const amber=new THREE.MeshStandardMaterial({color:'#b47b35',emissive:'#ffad4d',emissiveIntensity:2.4,roughness:.4});
  const bulb=mesh(new THREE.SphereGeometry(.105,16,12),amber,5.2,3.32,-19.84,root);bulb.scale.z=.45;
  const window=new THREE.MeshStandardMaterial({color:'#e9c990',emissive:'#e9bd77',emissiveIntensity:1.1,roughness:.55});
  box(.42,.73,.03,window,-14.7,10,-17.96,root);
  // Two broad tapered shafts. Smooth cross-section, no hard transparent planes.
  for(const [x,y,z,angle] of [[-6,9,-26,.38],[11,13,-46,-.32]]){
    const shaftMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,uniforms:{uTime:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;uniform float uTime;void main(){float width=mix(.48,.12,vUv.y);float edge=1.-smoothstep(width*.18,width,abs(vUv.x-.5));float ends=sin(vUv.y*3.14159);float dust=.92+.08*sin(vUv.y*19.+uTime*.12);gl_FragColor=vec4(.25,.56,.79,edge*ends*dust*.035);}'});
    const shaft=mesh(new THREE.PlaneGeometry(9,30),shaftMat,x,y,z,root);shaft.rotation.z=angle;shaft.castShadow=false;
  }
  // Sparse moisture islands with broken contours, a distinct response from dry asphalt.
  for(let i=0;i<6;i++){
    const patch=mesh(new THREE.CircleGeometry(rand(.35,.8),9),new THREE.MeshStandardMaterial({color:'#455264',roughness:.48,metalness:.12,transparent:true,opacity:.16,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}),rand(-4,4),-.142,rand(-20,2),root);
    patch.rotation.x=-Math.PI/2;patch.scale.y=rand(1,2.8);patch.castShadow=false;
  }
  const shafts=[];root.traverse(o=>{if(o.material?.uniforms?.uTime)shafts.push(o.material);});
  // Impacts make the surviving signs stutter; a hard enough hit kills the amber signal for good.
  let fault=0,amberAlive=1;
  return {animatedRoots:[root],
    flicker(power){fault=Math.min(1.4,fault+power*1.1);if(power>.9)amberAlive=0;},
    update(t,dt=.016){
      fault=Math.max(0,fault-dt*.7);
      const stutter=fault>0?(Math.sin(t*53)*Math.sin(t*31.7)>.1-fault*.4?1:.08):1;
      pulses.forEach((p,i)=>{const wave=.94+.06*Math.sin(t*.18+i*2);p.light.intensity=p.power*wave*(1+fault*.6);p.fringe.opacity=.12*wave*(1+fault);p.mist.material.opacity=.2*wave;});
      shop.emissiveIntensity=(1.15+.12*Math.sin(t*.71)*Math.sin(t*1.31))*stutter;warm.intensity=(6.5+.3*Math.sin(t*.71))*stutter;
      transit.emissiveIntensity=1.35*(fault>.2?(Math.sin(t*41+1)>0?1:.1):1);coast.emissiveIntensity=1.35*(fault>.35?.05:1);
      amber.emissiveIntensity=THREE.MathUtils.damp(amber.emissiveIntensity,2.4*amberAlive*stutter,6,dt);
      shafts.forEach(m=>{m.uniforms.uTime.value=t;});
    }};
}
