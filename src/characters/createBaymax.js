import * as THREE from 'three';
import {createGeometryKit} from '../systems/GeometryKit.js';
export function createBaymax(){
const scene=new THREE.Group();
const {mesh,box,ellipsoid,materials}=createGeometryKit(scene);
const baymax=new THREE.Group();baymax.name='BaymaxDormantShell';
const torsoPoints=[new THREE.Vector2(0,.22),new THREE.Vector2(.55,.24),new THREE.Vector2(.9,.43),new THREE.Vector2(1.1,.75),new THREE.Vector2(1.16,1.08),new THREE.Vector2(1.1,1.42),new THREE.Vector2(.98,1.8),new THREE.Vector2(.82,2.15),new THREE.Vector2(.66,2.48),new THREE.Vector2(.43,2.66),new THREE.Vector2(0,2.7)];
const torsoCurve=new THREE.SplineCurve(torsoPoints);
const torso=mesh(new THREE.LatheGeometry(torsoCurve.getPoints(60),64),materials.white,0,0,.08,baymax);torso.scale.z=.73;torso.name='inflatable-body';
const head=new THREE.Group();baymax.add(head);head.name='dormant-head';head.position.set(0,2.98,.23);head.rotation.x=.24;head.rotation.z=-.12;
ellipsoid(.77,.49,.49,materials.white,0,0,0,head);
const eyeMat=new THREE.MeshBasicMaterial({color:'#172022'});
ellipsoid(.065,.065,.025,eyeMat,-.23,.015,.49,head).name='dormant-eye';
ellipsoid(.065,.065,.025,eyeMat,.23,.015,.49,head).name='dormant-eye';
box(.46,.022,.016,eyeMat,0,.015,.502,head);
// Chest seam and circular medical access port. The shell remains soft; the service
// bay underneath is a restrained, cleanly layered mechanism rather than an exposed engine.
const access=new THREE.Group();access.name='baymax-access';baymax.add(access);access.position.set(.42,2.05,.63);access.rotation.y=.15;
const port=mesh(new THREE.TorusGeometry(.17,.018,10,48),materials.seam,0,0,.025,access);port.name='access-ring';
const panel=mesh(new THREE.CircleGeometry(.151,40),materials.white,0,0,.03,access);panel.name='access-panel';
const internal=new THREE.Group();internal.name='medical-interface';internal.visible=false;baymax.add(internal);internal.position.set(.42,2.05,.7);internal.rotation.y=.15;
const housingMat=new THREE.MeshStandardMaterial({color:'#c9d0d0',roughness:.42,metalness:.32,envMapIntensity:.4});
const darkMat=new THREE.MeshStandardMaterial({color:'#1d2830',roughness:.38,metalness:.44,envMapIntensity:.35});
const softBlue=new THREE.MeshBasicMaterial({color:'#b9eaff',transparent:true,opacity:.78});
// Nested medical-grade layers: rim, carrier, keyed socket. No loose wiring or clutter.
mesh(new THREE.CylinderGeometry(.145,.145,.06,32),housingMat,0,0,-.015,internal).rotation.x=Math.PI/2;
mesh(new THREE.TorusGeometry(.11,.012,8,32),softBlue,0,0,.02,internal);
mesh(new THREE.BoxGeometry(.16,.09,.035),darkMat,0,0,.035,internal);
mesh(new THREE.BoxGeometry(.105,.035,.012),softBlue,0,0,.057,internal);
for(const x of [-.075,.075])mesh(new THREE.BoxGeometry(.018,.15,.025),housingMat,x,0,.02,internal);
const seal=new THREE.Group();seal.name='access-seal';seal.visible=false;baymax.add(seal);seal.position.copy(access.position);seal.rotation.copy(access.rotation);
mesh(new THREE.TorusGeometry(.155,.01,8,40),materials.seam,0,0,.043,seal);
for(let side of [-1,1]){
  const tag=side<0?'right':'left';
  ellipsoid(.45,.56,.46,materials.white,side*.93,2.3,-.03,baymax).rotation.z=side*.25;
  baymax.children.at(-1).name=`shoulder-${tag}`;
  ellipsoid(.38,.73,.38,materials.white,side*1.12,1.7,.08,baymax).rotation.z=side*.12;
  baymax.children.at(-1).name=`upper-arm-${tag}`;
  ellipsoid(.39,.54,.42,materials.white,side*1.23,.82,.3,baymax).rotation.x=-.16;
  baymax.children.at(-1).name=`forearm-${tag}`;
  ellipsoid(.35,.24,.38,materials.white,side*1.25,.35,.48,baymax).name=`hand-${tag}`;
  for(let finger=0;finger<3;finger++)ellipsoid(.09,.11,.17,materials.white,side*1.25+(finger-1)*.17,.29,.76,baymax).name=`finger-${tag}-${finger}`;
  const leg=ellipsoid(.49,.49,.83,materials.white,side*.57,.48,.76,baymax);leg.rotation.y=side*.2;leg.name=`thigh-${tag}`;
  ellipsoid(.43,.35,.61,materials.white,side*.71,.26,1.42,baymax).name=`boot-${tag}`;
  box(.53,.07,.62,materials.dark,side*.71,.04,1.5,baymax);
}
// A few armor scratches, and a dormant back thruster.
box(.025,.29,.012,materials.seam,-.99,2.35,.373,baymax).rotation.z=-.4;
box(.016,.19,.012,materials.seam,1.06,2.27,.365,baymax).rotation.z=.3;
ellipsoid(.48,.66,.26,materials.white,0,2.1,-.61,baymax).name='back-shell';

return baymax;
}

