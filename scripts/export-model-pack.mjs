import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const { createCanvas, Canvas, Image, ImageData } = require('@napi-rs/canvas');
globalThis.ImageData = ImageData;
globalThis.HTMLCanvasElement = Canvas;
globalThis.HTMLImageElement = Image;
Canvas.prototype.toBlob = function (cb, type = 'image/png') {
  cb(new Blob([this.toBuffer(type)], { type }));
};
globalThis.document = { createElement: () => createCanvas(1, 1) };
globalThis.window = {
  devicePixelRatio: 1,
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  addEventListener() {},
};
globalThis.innerWidth = 1440;
globalThis.innerHeight = 810;
globalThis.location = { search: '' };
globalThis.sessionStorage = { getItem: () => null };
globalThis.ProgressEvent = class {
  constructor(type, args) {
    Object.assign(this, args);
  }
};
globalThis.FileReader = class {
  readAsArrayBuffer(secondEntry) {
    secondEntry.arrayBuffer().then((result2) => {
      this.result = result2;
      this.onloadend?.();
    });
  }
  readAsDataURL(secondEntry) {
    secondEntry.arrayBuffer().then((result2) => {
      this.result =
        'data:application/octet-stream;base64,' +
        Buffer.from(result2).toString('base64');
      this.onloadend?.();
    });
  }
};
const RequestBase = globalThis.Request;
globalThis.Request = class extends RequestBase {
  constructor(url, options) {
    super(new URL(url, 'http://localhost'), options);
  }
};
globalThis.fetch = async (url) => {
  const pathname = new URL(
    typeof url === 'string' ? url : url.url,
    'http://localhost',
  ).pathname;
  const bytes = await fs.readFile(`public${pathname}`);
  return new Response(bytes, {
    headers: { 'Content-Length': String(bytes.length) },
  });
};
await build({
  entryPoints: ['scripts/export-model-pack.ts'],
  outfile: 'artifacts/model-export.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  define: {
    'import.meta.env.DEV': 'false',
    'import.meta.env.VITE_QUALITY': '"HIGH"',
  },
});
await import('../artifacts/model-export.mjs');
delete globalThis.document;
delete globalThis.window;
const validator = require('gltf-validator');
const out = process.env.LAST_GATE_MODELS_OUT || 'artifacts/models';
const report = [];
for (const name of (await fs.readdir(out)).filter((node) =>
  node.endsWith('.glb'),
)) {
  const result = await validator.validateBytes(
    new Uint8Array(await fs.readFile(`${out}/${name}`)),
    { maxIssues: 100 },
  );
  report.push({
    file: name,
    errors: result.issues.numErrors,
    warnings: result.issues.numWarnings,
    messages: result.issues.messages,
  });
}
await fs.writeFile(`${out}/validation.json`, JSON.stringify(report, null, 2));
if (report.some((result2) => result2.errors || result2.warnings))
  throw Error('Model validation failed; inspect validation.json');
console.log('All GLBs validated without errors or warnings.');
