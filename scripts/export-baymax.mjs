import {writeFile,mkdir} from 'node:fs/promises';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {createBaymax} from '../src/characters/createBaymax.js';
// GLTFExporter uses the browser FileReader API for binary buffers.
globalThis.FileReader=class {
  readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}
  readAsDataURL(blob){blob.arrayBuffer().then(result=>{this.result='data:application/octet-stream;base64,'+Buffer.from(result).toString('base64');this.onloadend?.();});}
};
const model=createBaymax();
const glb=await new GLTFExporter().parseAsync(model,{binary:true,onlyVisible:true});
await mkdir('public/models',{recursive:true});
await writeFile('public/models/baymax-shell.glb',Buffer.from(glb));
console.log('Exported original Baymax shell: '+Math.round(glb.byteLength/1024)+' KB');
