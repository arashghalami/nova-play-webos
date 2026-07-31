import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig(() => {
  const metadataProxyConfigured = Boolean(process.env.VITE_METADATA_PROXY_URL?.trim())

  return {
    base: './',
    define: {
      __NOVA_METADATA_PROXY_CONFIGURED__: JSON.stringify(metadataProxyConfigured),
    },
    plugins: [
      {
        name: 'nova-build-info',
        closeBundle() {
          writeFileSync(
            resolve(__dirname, 'webos-app', 'build-info.json'),
            `${JSON.stringify(
              {
                schemaVersion: 1,
                generatedAt: new Date().toISOString(),
                metadataProxyConfigured,
                performanceTracingAvailable: true,
              },
              null,
              2,
            )}\n`,
          )
        },
      },
    ],
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
  }
})