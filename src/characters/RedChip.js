import * as THREE from 'three';

/** The chip's silhouette: a card with one chamfered key corner. The dock repeats this exact outline. */
export const CHIP_W=.15, CHIP_H=.21, CHIP_KEY=.038;
export function chipOutline(w=CHIP_W,h=CHIP_H,key=CHIP_KEY,r=.012){
  const s=new THREE.Shape(),x=-w/2,y=-h/2;
  s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);
  s.lineTo(x+w,y+h-key);s.lineTo(x+w-key,y+h);
  s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);
  return s;
}

/**
 * Precision hardware, not a toy: anodised crimson body, carbon inset with a laser-etched
 * readout, a single emissive logic line, and gold edge contacts. Local frame: face is +Z,
 * contacts at -Y (the leading edge into the socket).
 */
export function createRedChip(){
  const chip=new THREE.Group();chip.name='combat-chip';
  const body=new THREE.MeshPhysicalMaterial({color:'#7d1016',roughness:.27,metalness:.72,clearcoat:.75,clearcoatRoughness:.18,envMapIntensity:1.1,emissive:'#2a0204',emissiveIntensity:.4});
  const bodyGeo=new THREE.ExtrudeGeometry(chipOutline(),{depth:.012,bevelEnabled:true,bevelThickness:.003,bevelSize:.0028,bevelSegments:3,curveSegments:6});
  bodyGeo.translate(0,0,-.006);
  const shell=new THREE.Mesh(bodyGeo,body);chip.add(shell);
  // Laser-etched inset: tiny, legible only at inspection distance.
  const c=document.createElement('canvas');c.width=256;c.height=320;const x=c.getContext('2d');
  x.fillStyle='#160a0c';x.fillRect(0,0,256,320);
  x.strokeStyle='rgba(205,92,80,.38)';x.lineWidth=2;x.strokeRect(10,10,236,300);
  for(let i=0;i<14;i++){x.fillStyle=`rgba(190,70,62,${.08+(i%3)*.05})`;x.fillRect(22,150+i*9,120+((i*37)%90),2);}
  x.fillStyle='#e2a093';x.font='600 34px "IBM Plex Mono",monospace';x.fillText('CMB-01',22,62);
  x.fillStyle='#a3605a';x.font='15px "IBM Plex Mono",monospace';x.fillText('H.HAMADA // PROTO',22,92);x.fillText('UNSAFE  —  NO CARE',22,116);
  x.beginPath();const cx=196,cy=266;for(let i=0;i<6;i++){const a=i/6*Math.PI*2+Math.PI/6;x.lineTo(cx+Math.cos(a)*24,cy+Math.sin(a)*24);}x.closePath();x.strokeStyle='#d0675c';x.lineWidth=3;x.stroke();
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;
  const inset=new THREE.Mesh(new THREE.PlaneGeometry(.098,.122),new THREE.MeshStandardMaterial({map:tex,roughness:.42,metalness:.35,envMapIntensity:.7}));
  inset.position.set(-.012,.018,.0092);chip.add(inset);
  // One emissive logic line: the only light the chip owns.
  const glow=new THREE.MeshBasicMaterial({color:'#ff3a2c',toneMapped:false});
  const line=new THREE.Mesh(new THREE.PlaneGeometry(.0042,.15),glow);line.position.set(.054,.004,.0094);chip.add(line);
  const tick=new THREE.Mesh(new THREE.PlaneGeometry(.018,.0042),glow);tick.position.set(.046,-.07,.0094);chip.add(tick);
  // Machined grooves catch a hard edge of light.
  const groove=new THREE.MeshStandardMaterial({color:'#2a0507',roughness:.5,metalness:.6});
  for(const y of [.088,-.058]){const g=new THREE.Mesh(new THREE.BoxGeometry(.124,.0022,.002),groove);g.position.set(-.004,y,.0092);chip.add(g);}
  const gold=new THREE.MeshStandardMaterial({color:'#d3a55c',roughness:.24,metalness:1,envMapIntensity:1.2});
  const contact=new THREE.BoxGeometry(.011,.026,.0016);
  for(let i=0;i<7;i++){const m=new THREE.Mesh(contact,gold);m.position.set(-.054+i*.018,-.088,.0088);chip.add(m);}
  chip.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  line.castShadow=tick.castShadow=false;
  return {chip,glow,body};
}
