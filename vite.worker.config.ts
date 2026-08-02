import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    outDir: 'webos-app',
    emptyOutDir: false,
    target: 'es2015',
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/library/capability-probe-worker.ts'),
      name: 'NovaLibraryCapabilityProbeWorker',
      formats: ['iife'],
      fileName: () => 'library-capability-worker.js',
    },
  },
})