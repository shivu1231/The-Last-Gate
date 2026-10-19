import * as T from 'three';
import { SceneKit, seeded } from '../phase2/SceneKit';
import { createCityBackdrop } from '../presentation/Backdrop';
import { concreteTexture } from '../presentation/Surfaces';
import { Dressing, buildingFrame, cityMaterials, dressFacade, dressRoof, skinMergedBoxes } from '../environment/CityDressing';
import { batchSolids, createReceiver, link } from './receiverModel';

/** Four recorded fixes, in chronological order, on the actual outgoing bearing. */
export const SIGNAL_FIXES: [number, number, number][] = [[1.6, 6.9, -14], [-2, 14, -40], [-6, 23, -67], [-9.5, 30, -95]];

/** The middle console's readout once the receiver has the chip's last transmission: it isn't here. */
function transmissionTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 384;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#10181b'; ctx.fillRect(0, 0, 768, 384);
  ctx.fillStyle = '#91b7ad'; ctx.font = '500 24px "IBM Plex Mono",monospace'; ctx.fillText('RX / LAST TRANSMISSION', 28, 42);
  ctx.fillStyle = '#c6cfc2'; ctx.font = '20px "IBM Plex Mono",monospace';
  [['SOURCE', 'HEALTHCARE CHIP'], ['HEADING', 'OUTBOUND'], ['LAST FIX', 'OLD PORTAL SITE'], ['BOUNDARY', 'CROSSED'], ['LOCAL SIGNAL', 'NONE']]
    .forEach(([k, v], i) => { ctx.fillStyle = '#7f948c'; ctx.fillText(k, 28, 96 + i * 40); ctx.fillStyle = '#e6ece4'; ctx.fillText(v, 210, 96 + i * 40); });
  ctx.fillStyle = '#F08A3C'; ctx.font = '600 34px "IBM Plex Mono",monospace'; ctx.fillText('NOT IN THIS CITY', 28, 330);
  // A small plan: the city ring, the track leaving it.
  ctx.strokeStyle = '#425a5c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(600, 190, 110, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#F08A3C'; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(560, 250); ctx.lineTo(640, 150); ctx.lineTo(700, 70); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#F08A3C'; ctx.beginPath(); ctx.moveTo(712, 54); ctx.lineTo(688, 66); ctx.lineTo(706, 82); ctx.fill();
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4; return texture;
}

function consoleTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 384;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#142429'; ctx.fillRect(0, 0, 768, 384);
  ctx.fillStyle = '#91b7ad'; ctx.font = '500 25px "IBM Plex Mono",monospace'; ctx.fillText('SF / TELEMETRY RELAY', 28, 42);
  ctx.strokeStyle = '#425a5c'; ctx.lineWidth = 2; ctx.strokeRect(28, 66, 450, 274);
  for (let x = 58; x < 470; x += 60) { ctx.beginPath(); ctx.moveTo(x, 66); ctx.lineTo(x, 340); ctx.stroke(); }
  for (let y = 100; y < 340; y += 48) { ctx.beginPath(); ctx.moveTo(28, y); ctx.lineTo(478, y); ctx.stroke(); }
  ctx.strokeStyle = '#bfcea7'; ctx.lineWidth = 3; ctx.beginPath();
  for (let x = 36; x <= 470; x += 4) { const y = 250 - Math.sin(x * .022) * 12 - 110 * Math.exp(-(((x - 315) / 18) ** 2)); if (x === 36) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke();
  ctx.fillStyle = '#c6cfc2'; ctx.font = '20px "IBM Plex Mono",monospace';
  ['RX / STANDBY', '12.0 GHz', 'LNA  01', 'SYNC / WAIT', 'BAY 6 / LINK'].forEach((text, i) => ctx.fillText(text, 512, 106 + i * 48));
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4; return texture;
}

/** A damaged, inhabited relay service room; the original five repairs operate its real hardware. */
export function createFacility() {
  const k = new SceneKit('telemetry-facility');
  const random = seeded(5150), rand = (a: number, b: number) => a + random() * (b - a);
  const city = createCityBackdrop(); city.group.position.set(-6, -6, -52); city.group.scale.setScalar(1.25);
  city.group.traverse(o => { o.castShadow = false; }); k.root.add(city.group);
  const room = new T.Group(); room.name = 'relay-room-structure'; k.root.add(room);
  const floorMap = concreteTexture(); floorMap.repeat.set(3, 3);
  const floorMat = k.ownMaterial(new T.MeshStandardMaterial({ color: '#65716b', roughness: .94, metalness: .04, map: floorMap }));
  const wall = k.standard('#42504f', .88, .16), inset = k.standard('#293b3e', .72, .28);
  const paint = k.standard('#b8bcae', .65, .26), graphite = k.standard('#172629', .72, .48);
  const aluminium = k.standard('#788b87', .38, .72), ochre = k.standard('#ae8f54', .7, .24);
  const rubber = k.standard('#17201f', .96, .03), red = k.standard('#894d3d', .65, .3);
  const glowMat = k.ownMaterial(new T.MeshBasicMaterial({ color: '#bdc6ac', toneMapped: false }));
  const screenMap = consoleTexture();
  const screenMat = k.ownMaterial(new T.MeshBasicMaterial({ color: '#061014', map: screenMap, toneMapped: false }));
  const readoutMap = transmissionTexture();
  const readoutMat = k.ownMaterial(new T.MeshBasicMaterial({ map: readoutMap, toneMapped: false, transparent: true, opacity: 0 }));
  const ledMat = k.ownMaterial(new T.MeshBasicMaterial({ color: '#1a2a24', toneMapped: false }));
  const panelMat = k.ownMaterial(new T.MeshBasicMaterial({ color: '#343d39', toneMapped: false }));
  const cyl = (radius: number, height: number, p: [number, number, number], material: T.Material, r?: [number, number, number], parent: T.Object3D = room) =>
    k.mesh(k.ownGeometry(new T.CylinderGeometry(radius, radius, height, 12)), material, { p, r }, parent);

  k.box({ p: [0, -.2, 0], s: [17, .4, 15] }, floorMat, room);
  for (const x of [-8.3, 8.3]) {
    k.box({ p: [x, 2.4, 0], s: [.4, 5.2, 15] }, wall, room);
    k.box({ p: [x * .972, .17, 0], s: [.13, .34, 14.6] }, graphite, room);
    for (let z = -5.9; z < 6; z += 2.2) {
      k.box({ p: [x * .974, 2.5, z], s: [.09, 4.4, .08] }, aluminium, room);
      k.box({ p: [x * .971, 2.3, z + 1.02], s: [.025, 3.45, 1.9] }, inset, room);
      for (const y of [.65, 3.95]) for (const dz of [.16, 1.87]) cyl(.025, .032, [x * .969, y, z + dz], aluminium, [0, 0, Math.PI / 2]);
    }
  }
  // The opening is wider than the complete dish silhouette; no wall or roof cuts through it.
  k.box({ p: [-6.1, 2.4, -6.8], s: [4.8, 5.2, .4] }, wall, room);
  k.box({ p: [6.7, 2.4, -6.8], s: [3.6, 5.2, .4] }, wall, room);
  for (const x of [-3.65, 4.85]) k.box({ p: [x, 2.45, -6.75], s: [.14, 4.9, .58] }, aluminium, room);
  // A complete service building. The camera exits under the rear lintel before rising.
  k.box({ p: [0, 5.18, .15], s: [17.35, .36, 15.4] }, graphite, room);
  k.box({ p: [0, 4.83, -6.8], s: [8.5, .32, .6] }, aluminium, room);
  k.box({ p: [0, 2.4, 7.35], s: [17, 5.2, .35] }, wall, room);
  for (const x of [-8.5, 8.5]) k.box({ p: [x, 5.55, .15], s: [.22, .65, 15.6] }, wall, room);
  for (const z of [-7.6, 7.9]) k.box({ p: [0, 5.55, z], s: [17.2, .65, .22] }, wall, room);
  for (const z of [-4.5, -.3, 3.9]) k.box({ p: [0, 4.94, z], s: [16.3, .18, .16] }, aluminium, room);
  for (const x of [-4.7, 4.7]) {
    k.box({ p: [x, 5.87, 3.8], s: [2.8, 1, 2] }, aluminium, room);
    for (let z=3;z<4.7;z+=.17) k.box({p:[x,6.39,z],s:[2.55,.035,.055]},graphite,room);
    k.box({p:[x,5.64,1.3],s:[.85,.45,3.1]},inset,room);
  }
  k.box({p:[-1.5,5.47,4.4],s:[1.6,.22,2.2]},paint,room);
  k.box({p:[0,-6.9,.15],s:[17,13.4,15.4]},wall,room);
  for (const y of [-2.6,-5.8,-9]) {
    for (const z of [-7.62,7.92]) {
      k.box({p:[0,y-1.3,z],s:[17.3,.18,.3]},aluminium,room);
      for(let x=-6.6;x<7;x+=2.2) { k.box({p:[x,y,z],s:[1.65,1.7,.08]},graphite,room); k.box({p:[x,y,z+Math.sign(z)*.05],s:[1.42,1.45,.04]},inset,room); }
    }
    for (const x of [-8.52,8.52]) for(let z=-5.7;z<7;z+=2.3) k.box({p:[x,y,z],s:[.08,1.6,1.55]},inset,room);
  }
  for (let i = 0; i < 9; i++) k.box({ p: [rand(-3.7, 4.8), rand(.03, .18), rand(-7.6, -6.2)], s: [rand(.2, .7), rand(.12, .3), rand(.25, .7)], r: [rand(0, 1), rand(0, 3), rand(0, 1)] }, k.concrete, room);
  for (const x of [-5.8, 5.8]) k.box({ p: [x, .008, 0], s: [.055, .008, 12] }, ochre, room);
  k.box({ p: [0, .012, -5.8], s: [7.4, .015, .3] }, graphite, room);
  for (let x = -3.5; x < 3.6; x += .18) k.box({ p: [x, .022, -5.8], s: [.055, .008, .28] }, aluminium, room);
  for (const x of [-3.25, 0, 3.25]) {
    k.box({ p: [x, .78, -1.7], s: [2.6, .13, 1.35] }, paint, room);
    k.box({ p: [x, .69, -1.7], s: [2.42, .07, 1.24] }, graphite, room);
    for (const dx of [-1.1, 1.1]) { k.box({ p: [x + dx, .35, -1.7], s: [.1, .7, 1.12] }, aluminium, room); k.box({ p: [x + dx, .05, -1.7], s: [.32, .08, 1.28] }, graphite, room); }
    k.box({ p: [x, .45, -2.18], s: [2.2, .36, .22] }, inset, room);
    k.box({ p: [x, 1.24, -2.08], s: [1.62, .89, .13], r: [-.12, 0, 0] }, graphite, room);
    k.mesh(k.ownGeometry(new T.PlaneGeometry(1.44, .72)), screenMat, { p: [x, 1.26, -1.997], r: [-.12, 0, 0] }, room);
    k.box({ p: [x, .97, -2.13], s: [.12, .3, .15] }, aluminium, room);
    k.box({ p: [x, .865, -1.47], s: [.98, .045, .32], r: [.06, 0, 0] }, graphite, room);
    for (let row = 0; row < 3; row++) for (let key = 0; key < 11; key++) k.box({ p: [x - .44 + key * .081, .895 + row * .005, -1.58 + row * .08], s: [.056, .018, .055] }, aluminium, room);
    k.box({ p: [x + .77, .877, -1.45], s: [.2, .04, .28] }, graphite, room);
    k.box({ p: [x - .77, .88, -1.43], s: [.18, .055, .18] }, red, room);
    cyl(.045, .035, [x - .77, .93, -1.43], ochre);
    k.label(`RX / 0${Math.round((x + 3.25) / 3.25) + 1}`, { p: [x - .72, .67, -.985] }, .8, '#b9c2b7', room);
  }  // The middle console's screen switches to the chip's last transmission.
  const readoutScreen = k.mesh(k.ownGeometry(new T.PlaneGeometry(1.44, .72)), readoutMat, { p: [0, 1.26, -1.993], r: [-.12, 0, 0] }, room);
  readoutScreen.visible = false;

  // Furniture establishes human scale without adding another interaction.
  for (const x of [-3.25, 3.25]) {
    cyl(.32, .08, [x, .53, -.25], graphite); cyl(.055, .5, [x, .25, -.25], aluminium);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; link(k, room, new T.Vector3(x, .09, -.25), new T.Vector3(x + Math.cos(a) * .4, .09, -.25 + Math.sin(a) * .4), .035, graphite); }
  }
  k.box({ p: [4.8, .65, 3.6], s: [1.05, .07, .65] }, aluminium, room);
  k.box({ p: [4.8, .25, 3.6], s: [1.05, .07, .65] }, graphite, room);
  for (const x of [4.36, 5.24]) for (const z of [3.36, 3.84]) k.box({ p: [x, .42, z], s: [.045, .8, .045] }, aluminium, room);
  k.box({ p: [4.7, .71, 3.6], s: [.35, .06, .45], r: [0, .2, 0] }, paint, room);

  // Open-faced racks have rack units, ventilation slots, handles and service labels.
  for (let i = 0; i < 4; i++) {
    const z = -4.7 + i * 1.35;
    k.box({ p: [-7.4, 1.35, z], s: [1.18, 2.7, 1.12] }, graphite, room);
    for (const dz of [-.49, .49]) k.box({ p: [-6.785, 1.4, z + dz], s: [.04, 2.5, .035] }, aluminium, room);
    for (let r = 0; r < 7; r++) {
      const y = .32 + r * .32;
      k.box({ p: [-6.78, y, z], s: [.055, .265, .91] }, inset, room);
      for (let v = 0; v < 8; v++) k.box({ p: [-6.744, y, z - .3 + v * .075], s: [.009, .09, .025] }, rubber, room);
      k.box({ p: [-6.73, y + .08, z + .34], s: [.015, .04, .04] }, ledMat, room);
    }
    k.label(`RELAY / 0${i + 1}`, { p: [-6.72, 2.56, z], r: [0, Math.PI / 2, 0] }, .88, '#b9c2b7', room);
  }

  // Recessed breaker cabinet: real switches, a copper bus and physical service fascia.
  k.box({ p: [7.74, 1.56, .4], s: [.5, 2.28, 1.82] }, aluminium, room);
  k.box({ p: [7.47, 1.55, .4], s: [.055, 1.94, 1.51] }, graphite, room);
  for (const z of [-.36, 1.16]) k.box({ p: [7.42, 1.55, z], s: [.11, 2.12, .08] }, paint, room);
  for (const y of [.52, 2.59]) k.box({ p: [7.42, y, .4], s: [.11, .075, 1.6] }, paint, room);
  k.box({ p: [7.36, 1.45, -.13], s: [.04, 1.65, .045] }, ochre, room);
  const breakers: T.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const y = 2.18 - i * .39;
    k.box({ p: [7.36, y, .42], s: [.12, .31, .73] }, inset, room);
    k.box({ p: [7.28, y, .42], s: [.06, .25, .24] }, paint, room);
    const switchGroup = new T.Group(); switchGroup.position.set(7.23, y, .42); k.root.add(switchGroup);
    k.box({ p: [-.07, 0, 0], s: [.17, .06, .18] }, graphite, switchGroup); breakers.push(switchGroup);
    k.label(['12 A / CONSOLE', '18 A / RECEIVER', '15 A / LIGHTS', '22 A / HVAC'][i], { p: [7.265, y, .87], r: [0, -Math.PI / 2, 0] }, .57, '#bac6b8', room);
  }
  k.label('DC DISTRIBUTION / 40 A', { p: [7.32, 2.77, .4], r: [0, -Math.PI / 2, 0] }, 1.9, '#d7c095', room);
  k.label('ISOLATE BEFORE SERVICE', { p: [7.32, .34, .4], r: [0, -Math.PI / 2, 0] }, 1.6, '#c5ad7a', room);
  const door = new T.Group(); door.position.set(7.48, 1.55, -.47); door.rotation.y = .55; room.add(door);
  k.box({ p: [0, 0, -.84], s: [.055, 2.14, 1.68] }, paint, door);
  k.box({ p: [-.055, 0, -1.47], s: [.065, .35, .07] }, graphite, door);
  k.box({ p: [-.04, .28, -.84], s: [.012, .59, .86] }, ochre, door);
  k.label('40 A / DC', { p: [-.052, .28, -.84], r: [0, -Math.PI / 2, 0] }, .75, '#25342f', door);

  k.box({ p: [7.74, 1.62, 2.83], s: [.48, 1.48, 1.85] }, aluminium, room);
  k.box({ p: [7.48, 1.62, 2.83], s: [.05, 1.3, 1.68] }, graphite, room);
  const leads: T.Mesh[] = [], leadColors = ['#d1a965', '#89babb', '#a8bd8e'];
  for (let i = 0; i < 3; i++) {
    const y = 2.05 - i * .38;
    for (const z of [2.21, 3.4]) {
      cyl(.07, .08, [7.415, y, z], ochre, [0, 0, Math.PI / 2]);
      cyl(.037, .085, [7.395, y, z], rubber, [0, 0, Math.PI / 2]);
    }
    k.label(['RF / 12 GHz', 'IF / 1.2 GHz', 'BASEBAND'][i], { p: [7.39, y + .12, 2.83], r: [0, -Math.PI / 2, 0] }, .8, '#b4c6ba', room);
    const curve = new T.CatmullRomCurve3([new T.Vector3(7.35, y, 2.21), new T.Vector3(7.02, y - .14, 2.35), new T.Vector3(6.95, y - .23, 2.83), new T.Vector3(7.35, y, 3.4)]);
    const lead = k.mesh(k.ownGeometry(new T.TubeGeometry(curve, 20, .027, 6)), k.standard(leadColors[i], .62, .1), { p: [0, 0, 0] }); lead.visible = false; leads.push(lead);
  }
  k.label('SIGNAL PATCH / RX', { p: [7.39, 2.51, 2.83], r: [0, -Math.PI / 2, 0] }, 1.8, '#b9c2b7', room);
  for (const z of [.4, 2.83]) {
    const points = [new T.Vector3(7.8, 2.8, z), new T.Vector3(7.8, 3.6, z), new T.Vector3(7.8, 3.8, z - .2), new T.Vector3(7.8, 3.8, -5.8)];
    k.mesh(k.ownGeometry(new T.TubeGeometry(new T.CatmullRomCurve3(points, false, 'centripetal'), 32, .048, 8)), aluminium, { p: [0, 0, 0] }, room);
  }
  for (const x of [-5.6, 5.9]) {
    k.box({ p: [x, 4.55, .4], s: [.44, .07, 12.2] }, aluminium, room);
    for (let z = -5.5; z < 6.5; z += .5) k.box({ p: [x, 4.61, z], s: [.5, .07, .04] }, graphite, room);
    for (const dx of [-.12, 0, .12]) link(k, room, new T.Vector3(x + dx, 4.62, -5.5), new T.Vector3(x + dx, 4.62, 6.4), .022, rubber);
  }
  for (const [x, z] of [[-4.6, -2.5], [5.7, 1.3], [-4.6, 2.8]]) {
    k.box({ p: [x, 4.82, z], s: [1.7, .11, .4] }, graphite, room);
    k.box({ p: [x, 4.75, z], s: [1.5, .015, .26] }, panelMat, room);
  }
  k.box({ p: [-5.8, 2.4, -6.54], s: [2.4, .42, .05] }, graphite, room);
  k.label('NORTH RELAY / 06', { p: [-5.8, 2.4, -6.5] }, 2.15, '#c5b484', room);
  k.box({ p: [-5.7, 1.15, -6.52], s: [1.8, 1.6, .05] }, inset, room);
  for (let i = 0; i < 6; i++) k.box({ p: [-5.7, .62 + i * .19, -6.47], s: [1.48, .055, .03] }, graphite, room);
  k.box({ p: [7.8, 3.05, .4], s: [.17, .13, .68] }, graphite, room);
  k.box({ p: [7.69, 3.05, .4], s: [.025, .055, .54] }, glowMat, room);
  batchSolids(room, k);

  // Adjacent occupied blocks surround the terrace in every direction, including behind the dish.
  const neighborhood=new T.Group(); k.root.add(neighborhood);
  k.box({p:[0,-14.1,10],s:[90,.5,110]},inset,neighborhood);
  // Storey-scaled facades, roof plant and tiered caps from the city dressing kit (instanced), in
  // a mix of tones so the blocks round the terrace don't read as one box repeated.
  const dress=new Dressing(k),cm=cityMaterials(k),nRandom=seeded(5151);
  const tones=[k.standard('#4a5862',.9,.08),k.standard('#6d6a66',.9,.06),k.standard('#3b4852',.9,.1),k.standard('#7a6354',.9,.05)];
  // The first eight surround the back of the building; the last five stand out past the yard,
  // either side of the outbound trace and below it, so the exterior shots look into a district.
  for(const [x,z,w,h,d] of [[-21,1,14,24,19],[23,6,15,31,22],[-20,30,17,35,15],[5,38,16,24,16],[29,37,17,42,19],[-34,59,22,44,22],[0,68,21,52,19],[34,69,19,38,22],
    [24,-30,14,30,14],[-30,-34,14,30,16],[32,-58,16,40,16],[-38,-68,18,42,18],[12,-90,16,28,14]]) {
    const frame=buildingFrame(x,z,0,0,-14),i=Math.floor(nRandom()*tones.length);
    k.box({p:[x,h/2-14,z],s:[w,h,d]},tones[i],neighborhood);
    // The lower storeys sit below the terrace; the facades start a storey under its edge.
    dressFacade(dress,cm,frame,w,h,d,['+x','-x','+z','-z'],nRandom,{from:8,lit:.12});
    dressRoof(dress,cm,frame,w,h,d,nRandom,{tower:h>40,sign:h<30});
  }
  batchSolids(neighborhood,k);
  dress.build(neighborhood);
  // The backdrop's towers only have windows on the face its first chapter looks at; from the
  // terrace their sides read as blank slabs. Give those faces storeys too, in this scene only.
  const skin=new Dressing(k);
  city.group.updateMatrixWorld(true);
  city.group.traverse(o=>{ if(o instanceof T.Mesh&&o.name==='static-merged'&&(o.material as T.MeshBasicMaterial).map) skinMergedBoxes(skin,cm,o,city.group,nRandom,{storey:1.5,from:1.1,minHeight:10}); });
  skin.build(city.group);

  const receiver = createReceiver(k, k.root);
  const apron = new T.Group(); k.root.add(apron);
  k.box({ p: [1.6, -.17, -13.3], s: [10, .3, 13] }, floorMat, apron);
  for (const x of [-3.3, 6.5]) {
    k.box({ p: [x, .15, -13.3], s: [.18, .55, 13] }, wall, apron);
    for (const z of [-8, -11, -14, -17, -19]) cyl(.04, .85, [x, .77, z], aluminium, undefined, apron);
    link(k, apron, new T.Vector3(x, 1.18, -7.8), new T.Vector3(x, 1.18, -19.4), .035, aluminium);
  }
  k.box({ p: [-2.1, .58, -17.8], s: [1.5, 1.16, 1.6] }, graphite, apron);
  for (let z = -18.3; z < -17.2; z += .13) k.box({ p: [-2.1, 1.18, z], s: [1.3, .03, .055] }, aluminium, apron);
  batchSolids(apron, k);

  // Recorded fixes occupy the city itself; extrapolation continues past the final recorded point.
  const fixes = SIGNAL_FIXES.map((p, i) => {
    const group = new T.Group(); group.name = `signal-fix-${i + 1}`; group.position.set(...p); k.root.add(group);
    const pinMat = k.ownMaterial(new T.MeshBasicMaterial({ color: '#e4c78f', toneMapped: false, fog: false }));
    k.mesh(k.ownGeometry(new T.SphereGeometry(.28, 10, 8)), pinMat, { p: [0, 0, 0] }, group);
    k.mesh(k.ownGeometry(new T.TorusGeometry(.62, .035, 6, 32)), pinMat, { p: [0, 0, 0] }, group);
    group.visible = false; return group;
  });
  const recordedMat = k.ownMaterial(new T.MeshBasicMaterial({ color: '#bfcdaa', toneMapped: false, fog: false }));
  const recorded = SIGNAL_FIXES.slice(1).map((p, i) => {
    const mesh = link(k, k.root, new T.Vector3(...SIGNAL_FIXES[i]), new T.Vector3(...p), .035, recordedMat, 6); mesh.visible = false; return mesh;
  });
  const traceMat = k.ownMaterial(new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uReveal: { value: 0 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 vUv;uniform float uTime;uniform float uReveal;void main(){if(vUv.x>uReveal)discard;float pulse=.5+.5*sin((vUv.x*30.-uTime*3.));gl_FragColor=vec4(vec3(1.,.56,.34)*(.6+pulse*.8),.82);}',
  }));
  const tracePath = new T.CatmullRomCurve3([...SIGNAL_FIXES.map(p => new T.Vector3(...p)), new T.Vector3(-12, 34, -118)]);
  const trace = k.mesh(k.ownGeometry(new T.TubeGeometry(tracePath, 96, .075, 6)), traceMat, { p: [0, 0, 0] }); trace.name = 'outbound-signal-trajectory'; trace.visible = false;
  const boundary = k.haze({ p: [-12, 34, -119], s: [26, 26, 1] }, '#d8a264', 0);

  // Four scene lights total. Floor pools add depth without extra shadow passes.
  const hemi = new T.HemisphereLight('#b3c7c2', '#1d2723', .85); k.root.add(hemi);
  const sky = new T.DirectionalLight('#a5c4da', 1.65); sky.position.set(-4, 12, -10); k.root.add(sky);
  const practical = new T.PointLight('#dd9d62', 8, 10, 1.7); practical.position.set(6.5, 3.2, .6); k.root.add(practical);
  const consoleGlow = new T.PointLight('#9bbfc2', .4, 7, 1.8); consoleGlow.position.set(0, 2, -.6); k.root.add(consoleGlow);
  const warmPool = k.haze({ p: [6.1, .025, .8], s: [4.3, 4.3, 1], r: [-Math.PI / 2, 0, 0] }, '#ce9b68', .12);
  const coolPool = k.haze({ p: [0, .027, -1.1], s: [5.2, 3.6, 1], r: [-Math.PI / 2, 0, 0] }, '#81b3b6', .025);
  let reveal = 0;const viewDirection=new T.Vector3();
  return {
    root: k.root,
    update(t: number, dt: number, s: { powered: boolean; leads: number; snr: number; az: number; el: number; strength: number; traced: boolean; breakers: boolean[]; traceCount?: number; readout?: boolean }, camera?: T.Camera) {
      readoutMat.opacity = T.MathUtils.damp(readoutMat.opacity, s.readout && s.powered ? 1 : 0, 3, dt); readoutScreen.visible = readoutMat.opacity > .01;
      if(camera){
        camera.getWorldDirection(viewDirection);
        const exterior=camera.position.z < -5.8 || camera.position.y > 4.9 || viewDirection.z < -.65;
        city.group.visible=neighborhood.visible=receiver.root.visible=apron.visible=exterior;
      }
      const on = s.powered ? 1 : 0;
      panelMat.color.set(on ? '#d5d8bd' : '#343d39');
      practical.intensity = T.MathUtils.damp(practical.intensity, on ? 15 : 8, 3, dt);
      consoleGlow.intensity = T.MathUtils.damp(consoleGlow.intensity, on ? 5 : .4, 3, dt);
      screenMat.color.setScalar(on ? .62 + .38 * Math.min(1, s.strength / 100) : .025);
      ledMat.color.set(on ? '#a8c69d' : '#253831');
      breakers.forEach((b, i) => { b.rotation.z = T.MathUtils.damp(b.rotation.z, s.breakers[i] ? .45 : -.45, 12, dt); });
      leads.forEach((l, i) => { l.visible = i < s.leads; });
      receiver.update(s.az, s.el, dt);
      const count = s.traced ? 4 : (s.traceCount ?? 0);
      fixes.forEach((fix, i) => { fix.visible = i < count; });
      recorded.forEach((segment, i) => { segment.visible = i + 1 < count; });
      reveal = T.MathUtils.damp(reveal, s.traced ? 1 : 0, 1.2, dt);
      trace.visible = reveal > .01; traceMat.uniforms.uReveal.value = reveal; traceMat.uniforms.uTime.value = t;
      boundary.visible=reveal>.01;
      (boundary.material as T.ShaderMaterial).uniforms.opacity.value = reveal * .38;
      (warmPool.material as T.ShaderMaterial).uniforms.opacity.value = on ? .16 : .1;
      (coolPool.material as T.ShaderMaterial).uniforms.opacity.value = on ? .1 : .025;
    },
    dispose() { city.dispose(); floorMap.dispose(); screenMap.dispose(); readoutMap.dispose(); k.dispose(); },
  };
}
export type Facility = ReturnType<typeof createFacility>;
