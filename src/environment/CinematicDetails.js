import * as THREE from 'three';

export function createCinematicDetails(scene,{mesh,box,materials,rand,building,mistTexture}){
  const animatedRoots=[],haze=[];
  // Close framing: a loose cable and fragments cross a different plane from the street.
  const cableRoot=new THREE.Group();scene.add(cableRoot);cableRoot.position.set(-2.9,4.8,2.4);animatedRoots.push(cableRoot);
  const cableCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(-.2,4,-1),new THREE.Vector3(.1,1.5,0),new THREE.Vector3(.65,-1.2,.4),new THREE.Vector3(.2,-2.8,.15)]);
  const cable=mesh(new THREE.TubeGeometry(cableCurve,36,.021,7,false),materials.dark,0,0,0,cableRoot);cable.castShadow=false;
  const shardGeo=new THREE.BufferGeometry();shardGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.4,-.2,0,.32,-.1,.03,.12,.53,0],3));shardGeo.computeVertexNormals();
  const glass=new THREE.MeshPhysicalMaterial({color:'#818f8e',roughness:.24,metalness:.14,transparent:true,opacity:.29,side:THREE.DoubleSide,envMapIntensity:.7});
  const shards=new THREE.InstancedMesh(shardGeo,glass,3);scene.add(shards);
  const shardStates=[],dummy=new THREE.Object3D();
  for(let i=0;i<3;i++){const pos=new THREE.Vector3(rand(-4.5,4.5),rand(.7,4.7),rand(-2,6));const s=rand(.15,.5);shardStates.push({pos,scale:s,phase:rand(0,6.3)});dummy.position.copy(pos);dummy.scale.setScalar(s);dummy.rotation.set(rand(0,1),rand(0,1),rand(0,2));dummy.updateMatrix();shards.setMatrixAt(i,dummy.matrix);}
  const nearPositions=new Float32Array(190*3);
  for(let i=0;i<190;i++){nearPositions[i*3]=rand(-6,6);nearPositions[i*3+1]=rand(.2,6);nearPositions[i*3+2]=rand(-14,10);}
  const nearGeo=new THREE.BufferGeometry();nearGeo.setAttribute('position',new THREE.BufferAttribute(nearPositions,3));
  const nearDust=new THREE.Points(nearGeo,new THREE.PointsMaterial({map:mistTexture,color:'#b6b8a8',size:.024,transparent:true,opacity:.34,depthWrite:false}));scene.add(nearDust);
  // Four precise anomalies remain legible as city infrastructure.
  const upper=building(-17.7,17.5,-22,5.8,8,6,Math.PI/2-.08);animatedRoots.push(upper);
  const verticalRoad=new THREE.Group();scene.add(verticalRoad);verticalRoad.position.set(-12,13,-61);verticalRoad.rotation.set(1.37,.15,-.11);
  box(7,.6,25,materials.concrete,0,0,0,verticalRoad);
  for(let i=0;i<6;i++)box(.13,.02,1.1,materials.metal,0,.31,-10+i*3.4,verticalRoad);
  box(9,1.3,2,materials.edge,-6,5,-44).rotation.set(.09,.1,-.07);
  box(9,1.3,2,materials.edge,-5.4,6.5,-45).rotation.set(-.07,-.1,.06);
  const detached=new THREE.Group();scene.add(detached);detached.position.set(-9.1,7.5,-33);detached.rotation.z=.22;animatedRoots.push(detached);
  for(let i=0;i<6;i++)box(.53,.95,.04,materials.dark,(i-2.5)*.9,0,0,detached);
  // Extreme-distance masses read through the fog instead of ending at an empty sky.
  const farMat=new THREE.MeshStandardMaterial({color:'#303e59',roughness:1});
  const massA=box(22,62,19,farMat,-36,20,-123);massA.rotation.z=.19;massA.castShadow=false;
  const massB=box(16,53,18,farMat,33,12,-135);massB.rotation.z=-.35;massB.castShadow=false;
  const farBridge=box(70,1.5,9,farMat,8,16,-115);farBridge.rotation.z=.24;farBridge.castShadow=false;
  // Local haze is deliberately not uniform: thin pools collect at separate depths.
  for(let i=0;i<5;i++){
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:mistTexture,color:'#6b87ad',transparent:true,opacity:.12,depthWrite:false,blending:THREE.NormalBlending}));
    sprite.position.set(rand(-8,8),rand(.4,3),-9-i*11);sprite.scale.set(19+i*3,rand(2,5),1);scene.add(sprite);haze.push({sprite,x:sprite.position.x,y:sprite.position.y,phase:rand(0,6)});
  }
  // Contact occlusion under the shell, independently of shadow-map softness.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=256;
  const ctx=shadowCanvas.getContext('2d');const gradient=ctx.createRadialGradient(128,128,12,128,128,128);gradient.addColorStop(0,'rgba(1,5,7,.85)');gradient.addColorStop(.4,'rgba(1,5,7,.5)');gradient.addColorStop(1,'rgba(1,5,7,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,256,256);
  const contact=mesh(new THREE.PlaneGeometry(4.6,3.9),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false,opacity:.85}),2.7,-.133,-11.6);contact.rotation.x=-Math.PI/2;contact.castShadow=false;
  // A few landing traces make the shell feel like it came to rest here. They stay
  // low and asymmetrical so the road still reads as the leading line.
  const landingRoot=new THREE.Group();scene.add(landingRoot);landingRoot.position.set(2.7,-.125,-12.1);animatedRoots.push(landingRoot);
  const scrapeMat=new THREE.MeshStandardMaterial({color:'#343c4a',roughness:1,transparent:true,opacity:.52,depthWrite:false});
  const scrape=mesh(new THREE.PlaneGeometry(1.9,.16),scrapeMat,.1,.004,.15,landingRoot);scrape.rotation.x=-Math.PI/2;scrape.rotation.z=-.18;
  const scrape2=mesh(new THREE.PlaneGeometry(1.15,.1),scrapeMat,-.5,.006,.55,landingRoot);scrape2.rotation.x=-Math.PI/2;scrape2.rotation.z=.2;
  const landingBits=[];
  [[-1.45,.02,.18,.42],[1.25,.03,-.32,.3],[-.65,.04,.7,.2]].forEach(([x,y,z,s])=>{
    const bit=mesh(new THREE.DodecahedronGeometry(s,0),materials.concrete,x,y,z,landingRoot);bit.rotation.set(rand(0,2),rand(0,3),rand(0,2));landingBits.push(bit);
  });
  const roadChip=mesh(new THREE.BoxGeometry(.64,.12,.42),materials.edge,.75,.04,.74,landingRoot);roadChip.rotation.set(.12,.3,-.14);landingBits.push(roadChip);
  // A low crimson bounce is local to the damaged armour and never becomes a pickup glow.
  const shellBounce=new THREE.PointLight('#b72a31',.34,3.4,2);shellBounce.position.set(2.95,.12,-11.55);scene.add(shellBounce);
  // Low grime and grit keep concrete stylized while breaking perfect material uniformity.
  const grit=document.createElement('canvas');grit.width=grit.height=256;const gc=grit.getContext('2d');gc.fillStyle='#aaaaaa';gc.fillRect(0,0,256,256);
  for(let i=0;i<9000;i++){const v=Math.floor(rand(110,210));gc.fillStyle=`rgba(${v},${v},${v},.24)`;gc.fillRect(rand(0,256),rand(0,256),rand(1,6),rand(1,3));}
  const gritTexture=new THREE.CanvasTexture(grit);gritTexture.wrapS=gritTexture.wrapT=THREE.RepeatWrapping;gritTexture.repeat.set(2,3);
  materials.concrete.bumpMap=gritTexture;materials.concrete.bumpScale=.025;materials.concrete.roughnessMap=gritTexture;materials.concrete.roughness=.98;
  materials.metal.roughness=.38;materials.metal.metalness=.65;materials.metal.envMapIntensity=.35;
  materials.dark.roughness=.49;materials.dark.metalness=.12;
  return {animatedRoots,update(t,dt,reduced,progress=0){
    if(reduced)return;
    cableRoot.rotation.z=Math.sin(t*.18)*.018;
    upper.rotation.z=Math.PI/2-.08+Math.sin(t*.035)*.008;
    detached.position.y=7.5+Math.sin(t*.12)*.08;
    haze.forEach(h=>{h.sprite.position.x=h.x+Math.sin(t*.035+h.phase)*1.3;h.sprite.position.y=h.y+Math.sin(t*.05+h.phase)*.15;});
    nearDust.position.x=Math.sin(t*.025)*.65;nearDust.position.y=Math.sin(t*.06)*.08;
    nearDust.material.opacity=.34*(1-progress*.72);
    shardStates.forEach((s,i)=>{dummy.position.copy(s.pos);dummy.position.y+=Math.sin(t*.15+s.phase)*.12;dummy.scale.setScalar(s.scale);dummy.rotation.set(s.phase+t*.012,s.phase*.4+t*.009,s.phase*.3);dummy.updateMatrix();shards.setMatrixAt(i,dummy.matrix);});shards.instanceMatrix.needsUpdate=true;
    shellBounce.intensity=.3+Math.sin(t*.63)*.025;
  }};
}
