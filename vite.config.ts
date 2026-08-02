import { copyFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => {
  const metadataProxyConfigured = Boolean(process.env.VITE_METADATA_PROXY_URL?.trim())
  const libraryCapabilityProbeAvailable =
    mode !== 'production' || process.env.VITE_ENABLE_LIBRARY_PROBE === 'true'

  let bundledMediaEngineIds: string[] = []

  return {
    base: './',
    define: {
      __NOVA_METADATA_PROXY_CONFIGURED__: JSON.stringify(metadataProxyConfigured),
    },
    plugins: [
      {
        name: 'nova-build-info',
        generateBundle(_options, bundle) {
          bundledMediaEngineIds = Object.values(bundle)
            .filter((output) => output.type === 'chunk' && output.fileName === 'app.js')
            .flatMap((output) => output.moduleIds)
            .filter((id) => /\/node_modules\/(?:dashjs|hls\.js|mpegts\.js)\//.test(id.replace(/\\/g, '/')))

          if (bundledMediaEngineIds.length) {
            throw new Error(
              `Media engines must remain outside the webOS application IIFE: ${bundledMediaEngineIds.join(', ')}`,
            )
          }
        },
        closeBundle() {
          const outputDir = resolve(__dirname, 'webos-app')
          copyFileSync(
            resolve(__dirname, 'node_modules', 'dashjs', 'dist', 'legacy', 'umd', 'dash.all.min.js'),
            resolve(outputDir, 'dash.all.min.js'),
          )
          copyFileSync(
            resolve(__dirname, 'node_modules', 'hls.js', 'dist', 'hls.min.js'),
            resolve(outputDir, 'hls.min.js'),
          )
          copyFileSync(
            resolve(__dirname, 'node_modules', 'mpegts.js', 'dist', 'mpegts.js'),
            resolve(outputDir, 'mpegts.js'),
          )
          writeFileSync(
            resolve(__dirname, 'webos-app', 'build-info.json'),
            `${JSON.stringify(
              {
                schemaVersion: 1,
                generatedAt: new Date().toISOString(),
                metadataProxyConfigured,
                performanceTracingAvailable: true,
                libraryCapabilityProbeAvailable,
                dashjsBundledInAppIife: false,
                dashjsUmdAsset: 'dash.all.min.js',
                bundledMediaEngineIds,
                standaloneMediaAssets: ['dash.all.min.js', 'hls.min.js', 'mpegts.js'],
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
      /*
       * The target webOS Chromium executes the unminified ES2015 IIFE correctly,
       * while the minified single-chunk output has produced false TDZ reads in
       * the catalog publication coroutine. Keep the syntax stable at the package
       * boundary; media engines are already separate minified UMD assets.
       */
      minify: false,
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