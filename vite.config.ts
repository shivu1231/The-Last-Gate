import { defineConfig } from 'vite';

// Production hardening: no debug logging or debugger statements ship, three.js is split
// into its own long-cached chunk, and dev-only modules are tree-shaken by import.meta.env.
export default defineConfig(({ command }) => ({
  esbuild:
    command === 'build'
      ? {
          drop: ['debugger'],
          pure: [
            'console.log',
            'console.info',
            'console.debug',
            'console.trace',
          ],
        }
      : {},
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: (id) =>
          id.includes('node_modules/three/')
            ? 'three'
            : id.includes('node_modules/')
              ? 'vendor'
              : undefined,
      },
    },
  },
}));
