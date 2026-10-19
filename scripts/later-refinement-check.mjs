import fs from 'node:fs/promises';
import {build} from 'esbuild';
await fs.mkdir('artifacts/later-qa',{recursive:true});
const noop=()=>{};
const gradient={addColorStop:noop};
const context=new Proxy({measureText:t=>({width:String(t).length*12}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>o[k]??noop,set:(o,k,v)=>(o[k]=v,true)});
globalThis.document={createElement:()=>({width:1,height:1,getContext:t=>t==='2d'?context:null,style:{}})};
globalThis.window={devicePixelRatio:1,matchMedia:()=>({matches:false,addEventListener:noop}),addEventListener:noop};
globalThis.innerWidth=1440;globalThis.innerHeight=810;globalThis.location={search:'?quality=HIGH'};
globalThis.sessionStorage={getItem:()=>null};globalThis.ProgressEvent=class{constructor(type,args){Object.assign(this,args);}};
const NativeRequest=globalThis.Request;globalThis.Request=class extends NativeRequest{constructor(url,opts){super(new URL(url,'http://localhost'),opts)}};
globalThis.fetch=async url=>{const pathname=new URL(typeof url==='string'?url:url.url,'http://localhost').pathname;const bytes=await fs.readFile(`public${pathname}`);return new Response(bytes,{headers:{'Content-Length':String(bytes.length)}})};
await build({entryPoints:[process.argv[2] ?? 'scripts/later-refinement-check.ts'],outfile:'artifacts/later-qa/rig-bundle.mjs',bundle:true,platform:'node',format:'esm',packages:'external',define:{'import.meta.env.DEV':'false','import.meta.env.VITE_QUALITY':'"HIGH"'}});
await import('../artifacts/later-qa/rig-bundle.mjs');

