import * as T from 'three';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {TessellateModifier} from 'three/addons/modifiers/TessellateModifier.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {createInternals} from '../src/engineering/internals';
import {createBaymax} from '../src/phase6/baymax';
import {createHiro} from '../src/characters/HiroModel';
import {createLimiter} from '../src/phase4/limiter';
import {createFirstPersonHands,createLimiterController} from '../src/characters/RegulatorController';
import {createRedChip} from '../src/characters/RedChip.js';
import {createCareChip,createHome} from '../src/phase6/home';
import {SceneKit} from '../src/phase2/SceneKit';
import {createServiceBay} from '../src/phase4/bayScene';
import {createFacility} from '../src/phase5/facility';
import {createStreet,createCartridge} from '../src/phase6/street';
import {createDistrict} from '../src/recovery/district';
import {createPortalDimension} from '../src/environment/PortalDimension.js';
import {createSanFransokyo} from '../src/environment/HarbourCity';
import {createPortalGate} from '../src/environment/RiftGate';
const out=process.env.LAST_GATE_MODELS_OUT||'artifacts/models';await fs.mkdir(out,{recursive:true});
const manifest:any[]=[];
function portable(root:T.Object3D,combat=false){
 const clone=root.clone(true);clone.visible=true; const remove:T.Object3D[]=[];
 clone.traverse(o=>{
  if(o instanceof T.Points||o instanceof T.Light){remove.push(o);return;}
  if(!(o instanceof T.Mesh))return;
  const convert=(m:T.Material)=>{
   if(m instanceof T.ShaderMaterial){const u=m.uniforms;return new T.MeshStandardMaterial({color:u.uBase?.value?.isColor?u.uBase.value:u.uColor?.value?.isColor?u.uColor.value:'#6b8797',roughness:.8,side:m.side,transparent:m.transparent,opacity:m.opacity});}
   const n=m.clone() as T.MeshStandardMaterial;n.onBeforeCompile=()=>{};if(n.color){const peak=Math.max(n.color.r,n.color.g,n.color.b,1);n.color.multiplyScalar(1/peak);}return n;
  };
  o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);
  if(combat&&!Array.isArray(o.material)&&o.material.userData.combatSurface){
   const detail=o.name==='inflatable-body'||o.parent?.name==='dormant-head';
   const geo=detail?new TessellateModifier(.055,3).modify(o.geometry):o.geometry.clone(),p=geo.attributes.position,col=new Float32Array(p.count*3);
   const red=new T.Color('#a91e2b'),purple=new T.Color('#563580'),white=new T.Color('#f6f8fa'),c=new T.Color();
   const torso=o.name==='inflatable-body',head=o.parent?.name==='dormant-head',hand=/^(hand-|finger-)/.test(o.name);
   for(let i=0;i<p.count;i++){
    c.copy(hand?purple:red);
    if(torso){const x=Math.abs(p.getX(i)/.84),y=Math.abs((p.getY(i)-1.30)/.57),edge=Math.max(x,y,(x+y)*.71),front=T.MathUtils.smoothstep(p.getZ(i),.20,.45);c.lerp(purple,(1-T.MathUtils.smoothstep(edge,.96,1))*front);c.lerp(red.clone().multiplyScalar(.46),(1-T.MathUtils.smoothstep(Math.abs(edge-1),.012,.027))*front);}
    if(head){const r=Math.hypot(p.getX(i)/.86,(p.getY(i)-.015)/.65);c.lerp(white,(1-T.MathUtils.smoothstep(r,.96,1))*T.MathUtils.smoothstep(p.getZ(i),.45,.58));}
    c.toArray(col,i*3);
   }
   geo.setAttribute('color',new T.BufferAttribute(col,3));o.geometry=geo;
   const m=o.material as T.MeshStandardMaterial;m.color.set('white');m.vertexColors=true;m.roughness=.66;m.metalness=.12;
  }
 });remove.forEach(o=>o.removeFromParent());clone.updateMatrixWorld(true);return clone;
}
async function save(name:string,root:T.Object3D,source:string,combat=false){
 const model=portable(root,combat);model.name=name;
 const binary=await new GLTFExporter().parseAsync(model,{binary:true,onlyVisible:true,maxTextureSize:2048});
 const bytes=Buffer.from(binary as ArrayBuffer);if(bytes.readUInt32LE(0)!==0x46546c67)throw Error('Invalid GLB '+name);
 const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
 const box=new T.Box3().setFromObject(model),size=box.getSize(new T.Vector3());
 if(!json.meshes?.length||!size.toArray().every(Number.isFinite))throw Error('Empty model '+name);
 await fs.writeFile(`${out}/${name}.glb`,bytes);
 manifest.push({file:`${name}.glb`,source,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),meshes:json.meshes.length,textures:json.textures?.length??0,sizeMetres:size.toArray()});console.log(name,bytes.length,json.meshes.length);
}
const b=await createBaymax();b.pose.sit=0;b.pose.armour=1;for(let i=0;i<90;i++)b.update(i/60,()=>0);
await save('baymax-combat',b.root,'src/phase6/baymax.ts',true);
b.bay.update({t:2,open:4.6,seated:1,red:1,seamGlow:.2});
await save('chip-bay-interior',b.bay.root,'src/characters/ChestBay.ts',true);
b.pose.armour=0;b.pose.careSeated=true;b.pose.chipInBay=false;b.update(2,()=>0);
await save('baymax-healthcare',b.root,'src/phase6/baymax.ts');
const engineering=createInternals(new T.Group());for(let i=0;i<30;i++)engineering.update(i/30,.1,{mode:'xray',selected:null,rerouted:false,plugAngle:0,plugSeated:false,actuatorAngle:0,actuatorReset:false});
await save('engineering-internals',engineering.root,'src/engineering/internals.ts');
await save('hiro',createHiro().root,'src/characters/HiroModel.ts');
await save('power-regulator',createLimiter(),'src/phase4/limiter.ts');
await save('pr6-remote',createLimiterController().root,'src/characters/RegulatorController.ts');
const hands=createFirstPersonHands();hands.update(0,1/60,{walk:0,gait:0,raise:1,reach:0});
await save('first-person-hands-remote',hands.root,'src/characters/RegulatorController.ts');
await save('combat-chip',createRedChip().chip,'src/characters/RedChip.js');
await save('healthcare-chip',createCareChip(new SceneKit('care-chip')).chip,'src/phase6/home.ts');
await save('reader-cartridge',createCartridge().root,'src/phase6/street.ts');
for(const [name,fn,source] of [
 ['portal-dimension',createPortalDimension,'src/environment/PortalDimension.js'],
 ['opening-harbour',createSanFransokyo,'src/environment/HarbourCity.ts'],
 ['recovery-district',createDistrict,'src/recovery/district.ts'],
 ['service-bay-06',createServiceBay,'src/phase4/bayScene.ts'],
 ['relay-facility',createFacility,'src/phase5/facility.ts'],
 ['portal-street',createStreet,'src/phase6/street.ts'],
 ['ending-waterfront',createHome,'src/phase6/home.ts'],
 ['portal-frame',createPortalGate,'src/environment/RiftGate.ts'],
] as const){const set=fn();await save(name,(set as any).root??(set as any).group,source);}
await fs.copyFile('public/models/baymax-shell.glb',`${out}/baymax-shell-source.glb`);
await fs.writeFile(`${out}/manifest.json`,JSON.stringify({units:'metres',up:'+Y',models:manifest,sourceGLB:'baymax-shell-source.glb'},null,2));
await fs.writeFile(`${out}/README.txt`, `THE LAST GATE — MODEL COLLECTION\n\nCurrent website character, prop and environment geometry exported as binary glTF (.glb).\nUnits: metres. Up: +Y. Embedded procedural textures. Combat finish baked into vertex colours.\n\nEach environment file includes its buildings, furniture and smaller props. The manifest identifies the source factory, dimensions, mesh count, texture count and SHA-256 for each export. The source Baymax GLB is also included unchanged. The retired separate armour asset is not used by the current website and is excluded.\n\nThese are static scene/rig snapshots. Gameplay animation, controller logic, shader effects, portal render targets, particles and camera choreography remain authored in the website source; GLB does not reproduce that runtime. Shader-only surfaces use a neutral portable material. Inspection assembly is supplied separately. Inactive effects and hidden runtime alternates are excluded.\n\nNo extra branding or authorship claims have been added. Existing project and third-party rights continue to apply.\n`);
console.log('Exported',manifest.length,'models to',out);
