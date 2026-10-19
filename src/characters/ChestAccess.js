import * as THREE from 'three';
import {chipOutline,CHIP_W,CHIP_H,CHIP_KEY} from './RedChip.js';

const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const span=(t,a,b)=>ease((t-a)/(b-a));
const OUTER=.235,CAVITY=.196,DEPTH=.15;

/**
 * Baymax's medical access bay. Hierarchy, outermost first:
 *   OUTER  soft white collar + four iris petals that retract behind the shell
 *   MID    neutral grey mounting ring, three struts, carrier plate
 *   CORE   keyed dock whose outline repeats the chip's silhouette
 *   DETAIL broken ring traces, logic LEDs, black connector accents
 * The cavity is real depth: while the bay is open, Baymax's skin shader discards the fragments
 * inside the bay's cylinder (see BaymaxController), so the internals show through.
 * Local frame: origin on the shell surface, +Z out of the body.
 */
export function createChestAccess(skin){
  const root=new THREE.Group();root.name='chest-access';
  const inner=new THREE.Group();inner.name='chest-internals';root.add(inner);
  const add=(geo,mat,parent=inner,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);parent.add(m);return m;};
  const housing=new THREE.MeshStandardMaterial({color:'#e6e1d7',roughness:.5,metalness:.02,envMapIntensity:.55});
  const grey=new THREE.MeshStandardMaterial({color:'#8f989e',roughness:.34,metalness:.62,envMapIntensity:.9});
  const greyMatte=new THREE.MeshStandardMaterial({color:'#5d666d',roughness:.62,metalness:.3,envMapIntensity:.5});
  const dark=new THREE.MeshStandardMaterial({color:'#0b0f13',roughness:.4,metalness:.5,envMapIntensity:.3});
  const cavityMat=new THREE.MeshStandardMaterial({color:'#1f262b',roughness:.7,metalness:.25,side:THREE.BackSide,envMapIntensity:.35});
  // Light-emitting internals are opaque and fade by brightness: transparent objects would draw
  // after the depth mask and vanish inside the bay.
  const glowing=(hex,level=1)=>{const m=new THREE.MeshBasicMaterial({color:hex,toneMapped:false});m.userData.base=new THREE.Color(hex).multiplyScalar(level);m.color.setRGB(0,0,0);return m;};
  const setGlow=(m,k)=>m.color.copy(m.userData.base).multiplyScalar(Math.max(0,k));
  const logic=glowing('#bfe9ff',1.4),rails=glowing('#bfe9ff',1.2),traceMat=glowing('#6fb6d8',.8),redLogic=glowing('#ff2f22',1.6);
  const seamMat=new THREE.MeshBasicMaterial({color:'#cdefff',toneMapped:false,transparent:true,opacity:0,depthWrite:false});

  // --- Cavity: walls and floor.
  const wall=add(new THREE.CylinderGeometry(CAVITY,CAVITY*.93,DEPTH,48,1,true),cavityMat,inner,0,0,-DEPTH/2);wall.rotation.x=Math.PI/2;
  add(new THREE.CircleGeometry(CAVITY*.94,48),greyMatte,inner,0,0,-DEPTH+.001);
  // --- MID: mounting ring, struts, carrier.
  const ring=add(new THREE.TorusGeometry(.168,.009,10,64),grey,inner,0,0,-.118);
  for(let i=0;i<3;i++){
    const a=Math.PI/2+i*Math.PI*2/3,strut=add(new THREE.BoxGeometry(.075,.014,.02),greyMatte,inner,Math.cos(a)*.15,Math.sin(a)*.15,-.11);strut.rotation.z=a;
    add(new THREE.BoxGeometry(.014,.022,.012),dark,inner,Math.cos(a)*.182,Math.sin(a)*.182,-.098).rotation.z=a;
  }
  const carrier=new THREE.Group();carrier.name='carrier';inner.add(carrier);carrier.position.z=-.098;
  const plate=new THREE.Shape();plate.absarc(0,0,.142,0,Math.PI*2,false);
  const plateHole=new THREE.Path();plateHole.setFromPoints(chipOutline(CHIP_W+.024,CHIP_H+.024,CHIP_KEY+.008,.016).getPoints(6).reverse());plate.holes.push(plateHole);
  add(new THREE.ExtrudeGeometry(plate,{depth:.014,bevelEnabled:true,bevelThickness:.002,bevelSize:.002,bevelSegments:2,curveSegments:32}),grey,carrier);
  // --- CORE: the keyed dock. Its outline is the chip's outline.
  const dock=new THREE.Group();dock.name='dock';inner.add(dock);dock.position.z=-.072;
  const frame=chipOutline(CHIP_W+.03,CHIP_H+.03,CHIP_KEY+.012,.018);
  const frameHole=new THREE.Path();frameHole.setFromPoints(chipOutline(CHIP_W+.008,CHIP_H+.008,CHIP_KEY+.003,.014).getPoints(6).reverse());frame.holes.push(frameHole);
  add(new THREE.ExtrudeGeometry(frame,{depth:.016,bevelEnabled:true,bevelThickness:.0018,bevelSize:.0018,bevelSegments:2,curveSegments:6}),grey,dock,0,0,-.004);
  add(new THREE.ShapeGeometry(chipOutline(CHIP_W+.008,CHIP_H+.008,CHIP_KEY+.003,.014)),dark,dock,0,0,-.012);
  const contactGeo=new THREE.PlaneGeometry(.011,.02);
  for(let i=0;i<7;i++)add(contactGeo,logic,dock,-.054+i*.018,-.082,-.0105);
  for(const x of [-1,1])add(new THREE.PlaneGeometry(.003,CHIP_H*.72),rails,dock,x*(CHIP_W/2+.0105),0,.0125);
  // The key corner answers the chip's chamfer with a lit triangle: shape language, not arrows.
  const keyShape=new THREE.Shape();keyShape.moveTo(0,0);keyShape.lineTo(-.024,0);keyShape.lineTo(0,-.024);keyShape.closePath();
  const keyMark=add(new THREE.ShapeGeometry(keyShape),rails,dock,CHIP_W/2+.012,CHIP_H/2-CHIP_KEY+.012,.0127);keyMark.rotation.z=Math.PI/4+Math.PI/2;
  // --- DETAIL: broken ring traces, LEDs, connectors. Organised, never cluttered.
  for(let i=0;i<5;i++)add(new THREE.RingGeometry(.176,.1785,40,1,i*Math.PI*.4+.08,Math.PI*.29),traceMat,inner,0,0,-.0895);
  const leds=[];
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2+.13;leds.push(add(new THREE.PlaneGeometry(.0065,.0065),logic.clone(),inner,Math.cos(a)*.159,Math.sin(a)*.159,-.083));}
  for(let i=0;i<6;i++){const a=i/6*Math.PI*2+.5;add(new THREE.BoxGeometry(.012,.006,.01),dark,inner,Math.cos(a)*.188,Math.sin(a)*.188,-.06).rotation.z=a;}
  for(const side of [-1,1]){
    const cable=new THREE.CatmullRomCurve3([new THREE.Vector3(side*.09,-.11,-.1),new THREE.Vector3(side*.135,-.12,-.13),new THREE.Vector3(side*.16,-.06,-.14)]);
    add(new THREE.TubeGeometry(cable,12,.0042,6,false),greyMatte);
  }
  // Own material per trace: Material.clone() JSON-copies userData, turning the base Color into a
  // hex number and the glow into NaN, which bloom then spreads across the whole frame.
  const redTraces=[];
  for(let i=0;i<6;i++){const a=-Math.PI/2+(i-2.5)*.42,len=.06+(i%2)*.025;const tr=add(new THREE.PlaneGeometry(.0028,len),glowing('#ff2f22',1.6),inner,Math.cos(a)*(.115+len/2),Math.sin(a)*(.115+len/2),-.0885);tr.rotation.z=a-Math.PI/2;redTraces.push(tr);}
  inner.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=true;}});

  // --- OUTER: collar skirt fills the curve of the shell, petals iris shut over the bay.
  const collar=new THREE.Group();root.add(collar);
  const skirt=add(new THREE.CylinderGeometry(OUTER,OUTER+.012,.07,64,1,true),housing,collar,0,0,-.03);skirt.rotation.x=Math.PI/2;
  add(new THREE.TorusGeometry(OUTER-.018,.019,14,72),housing,collar,0,0,.002).scale.z=.42;
  add(new THREE.TorusGeometry(CAVITY+.004,.0035,8,72),grey,collar,0,0,.006);
  const seam=add(new THREE.TorusGeometry(CAVITY*.985,.0022,6,80),seamMat,collar,0,0,.0135);
  const petals=[];
  // Three leaves: reads as an aperture, never a reticle.
  const LEAF=Math.PI*2/3;
  for(let i=0;i<3;i++){
    const pivot=new THREE.Group();collar.add(pivot);
    const petal=new THREE.Mesh(new THREE.CylinderGeometry(CAVITY+.006,CAVITY+.006,.014,32,1,false,i*LEAF+.0035,LEAF-.007),skin||housing);
    petal.rotation.x=Math.PI/2;petal.position.z=.004;pivot.add(petal);
    // Cylinder theta maps to screen angle theta-90deg once the axis is turned toward +Z.
    const a=i*LEAF,border=a-Math.PI/2,mid=a-Math.PI/2+LEAF/2;
    const gap=new THREE.Mesh(new THREE.PlaneGeometry(.0028,CAVITY*.96),seamMat);gap.position.set(Math.cos(border)*CAVITY*.49,Math.sin(border)*CAVITY*.49,.0118);gap.rotation.z=border-Math.PI/2;pivot.add(gap);
    petals.push({pivot,dir:new THREE.Vector2(Math.cos(mid),Math.sin(mid))});
  }
  collar.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=true;}});
  const light=new THREE.PointLight('#cdeeff',0,1.4,2);light.position.set(0,.05,.34);root.add(light);
  const dockWorld=new THREE.Vector3(),seatLocal=new THREE.Vector3(0,0,-.072);
  const blue=new THREE.Color('#cdeeff'),red=new THREE.Color('#ff3524'),tmp=new THREE.Color();

  const state={hole:false};
  return {root,dock,seatLocal,CAVITY,
    /** True while the shell should be cut open over the bay. */
    get holeOpen(){return state.hole;},
    /** Socket centre in world space, for chip guidance and camera framing. */
    dockWorld(){return dock.localToWorld(dockWorld.set(0,0,0));},
    update({t,open=0,align=0,seated=0,seal=0,red:corruption=0,seamGlow=0}){
      // open: 0..4.6 authored seconds of the reveal; seal: 0..1 closes it again.
      const pop=span(open,.7,.95)-span(open,.95,1.25),iris=span(open,1.2,2.65)*(1-ease(seal*1.15));
      const lights=span(open,1.55,3.1)*(1-ease((seal-.35)*2.5));
      petals.forEach((p,i)=>{
        p.pivot.position.set(p.dir.x*iris*.2,p.dir.y*iris*.2,pop*.008-iris*.045);
        p.pivot.rotation.z=iris*.5;
      });
      const visible=open>.65||seal<1&&seal>0;
      inner.visible=visible;state.hole=visible&&iris>.01;
      dock.position.z=-.072+span(open,2.6,3.4)*.018-seated*.004;
      setGlow(logic,lights*(.55+align*.45));setGlow(rails,lights*(.25+align*.75)*(1-seated));
      setGlow(traceMat,lights*.75);
      leds.forEach((led,i)=>{const k=lights*ease((open-1.7-i*.09)*4)*(.5+.5*Math.sin(t*2.3+i*.8)**2);led.material.color.copy(tmp.copy(blue).lerp(red,corruption)).multiplyScalar(k*1.4);});
      redTraces.forEach((tr,i)=>{const k=ease(seated*3-i*.35)*(1-seal*.6);tr.visible=k>.01;setGlow(tr.material,k);});
      // The seam reads first, before anything moves; later it carries the corruption outward.
      seamMat.opacity=Math.max(span(open,.05,.55)*(1-span(open,1.25,1.6)),seamGlow);
      seamMat.color.copy(tmp.copy(blue).lerp(red,corruption));
      light.color.copy(tmp.copy(blue).lerp(red,Math.max(corruption,seated*.25)));
      light.intensity=lights*(.22+align*.3)+seamGlow*.35+seated*.3*(1-seal);
    }};
}
