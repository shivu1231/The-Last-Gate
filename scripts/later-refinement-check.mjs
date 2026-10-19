import fs from 'node:fs/promises';
import { build } from 'esbuild';
await fs.mkdir('artifacts/later-qa', { recursive: true });
const doNothing = () => {};
const gradient = { addColorStop: doNothing };
const context = new Proxy(
  {
    measureText: (timeSeconds) => ({ width: String(timeSeconds).length * 12 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createImageData: (width, height) => ({
      data: new Uint8ClampedArray(width * height * 4),
    }),
    getImageData: (xPosition, yPosition, width, height) => ({
      data: new Uint8ClampedArray(width * height * 4),
    }),
  },
  {
    get: (color, key) => color[key] ?? doNothing,
    set: (color, key, value) => ((color[key] = value), true),
  },
);
globalThis.document = {
  createElement: () => ({
    width: 1,
    height: 1,
    getContext: (timeSeconds) => (timeSeconds === '2d' ? context : null),
    style: {},
  }),
};
globalThis.window = {
  devicePixelRatio: 1,
  matchMedia: () => ({ matches: false, addEventListener: doNothing }),
  addEventListener: doNothing,
};
globalThis.innerWidth = 1440;
globalThis.innerHeight = 810;
globalThis.location = { search: '?quality=HIGH' };
globalThis.sessionStorage = { getItem: () => null };
globalThis.ProgressEvent = class {
  constructor(type, args) {
    Object.assign(this, args);
  }
};
const NativeRequest = globalThis.Request;
globalThis.Request = class extends NativeRequest {
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
  entryPoints: [process.argv[2] ?? 'scripts/later-refinement-check.ts'],
  outfile: 'artifacts/later-qa/rig-bundle.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  define: {
    'import.meta.env.DEV': 'false',
    'import.meta.env.VITE_QUALITY': '"HIGH"',
  },
});
await import('../artifacts/later-qa/rig-bundle.mjs');
