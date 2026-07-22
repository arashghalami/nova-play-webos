import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    outDir: 'webos-app',
    emptyOutDir: true,
    target: 'es2015',
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'NovaPlay',
      formats: ['iife'],
      fileName: () => 'app.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: 'style.css',
      },
    },
  },
})