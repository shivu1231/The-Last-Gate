import * as THREE from 'three';
export function createGeometryKit(scene){
let seed = 71;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const rand = (a,b) => a + random() * (b-a);
const materials = {
  concrete: new THREE.MeshStandardMaterial({color:'#677384',roughness:.94}),
  edge: new THREE.MeshStandardMaterial({color:'#354156',roughness:1}),
  dark: new THREE.MeshStandardMaterial({color:'#101925',roughness:.82}),
  metal: new THREE.MeshStandardMaterial({color:'#626c7c',roughness:.66,metalness:.5}),
  white: new THREE.MeshStandardMaterial({color:'#f6f8fa',roughness:.58,metalness:0}),
  seam: new THREE.MeshStandardMaterial({color:'#b2bbb2',roughness:.7}),
  black: new THREE.MeshStandardMaterial({color:'#131a1b',roughness:.45}),
  armor: new THREE.MeshPhysicalMaterial({color:'#4b1918',roughness:.32,metalness:.52,clearcoat:.32,clearcoatRoughness:.38}),
  light: new THREE.MeshBasicMaterial({color:'#c5dfd7'}),
  red: new THREE.MeshStandardMaterial({color:'#a52b24',emissive:'#e62915',emissiveIntensity:1.4,roughness:.32,metalness:.45})
};
materials.white.name='inflatable';materials.armor.name='armor';materials.seam.name='seam';
function mesh(geo,mat,x=0,y=0,z=0,parent=scene){
  const m = new THREE.Mesh(geo,mat); m.position.set(x,y,z); m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
const boxGeometries=new Map();
function box(w,h,d,mat,x,y,z,parent){const key=`${w}/${h}/${d}`;if(!boxGeometries.has(key))boxGeometries.set(key,new THREE.BoxGeometry(w,h,d));return mesh(boxGeometries.get(key),mat,x,y,z,parent);}
const sphereGeo = new THREE.SphereGeometry(1,40,28);
function ellipsoid(sx,sy,sz,mat,x,y,z,parent){const m=mesh(sphereGeo,mat,x,y,z,parent);m.scale.set(sx,sy,sz);return m;}
function cylinderBetween(a,b,r,mat,parent=scene){
  const direction = new THREE.Vector3().subVectors(b,a);
  const m=mesh(new THREE.CylinderGeometry(r,r,direction.length(),9),mat,0,0,0,parent);
  m.position.copy(a).add(b).multiplyScalar(.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), direction.normalize());return m;
}


return {mesh,box,ellipsoid,cylinderBetween,materials,random,rand};
}

