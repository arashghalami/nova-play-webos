import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const outputDir = resolve('webos-app')
const bundlePath = resolve(outputDir, 'app.js')
const indexPath = resolve(outputDir, 'index.html')
const buildInfoPath = resolve(outputDir, 'build-info.json')
const source = readFileSync(bundlePath, 'utf8')
const unsupportedGlobals = [
  'structuredClone',
  'reportError',
  'AggregateError',
  'WeakRef',
  'FinalizationRegistry',
  'AbortSignal.timeout',
  'Array.fromAsync',
]
const mediaAssets = [
  {
    fileName: 'dash.all.min.js',
    script: '<script src="./dash.all.min.js"></script>',
    marker: 'MediaPlayer',
  },
  {
    fileName: 'hls.min.js',
    script: '<script src="./hls.min.js"></script>',
    marker: 'Hls',
  },
  {
    fileName: 'mpegts.js',
    script: '<script src="./mpegts.js"></script>',
    marker: 'mpegts',
  },
]

const found = unsupportedGlobals.filter((identifier) => {
  const pattern = new RegExp(
    `\\b${identifier.replace('.', '\\.').replace('.', '\\.')}\\b`,
  )

  return pattern.test(source)
})

if (found.length) {
  throw new Error(
    `The webOS ES2015 bundle contains unsupported runtime globals: ${found.join(', ')}`,
  )
}

for (const requiredPath of [indexPath, buildInfoPath]) {
  if (!existsSync(requiredPath)) {
    throw new Error(`The webOS bundle is missing required build artifact: ${requiredPath}`)
  }
}

const indexHtml = readFileSync(indexPath, 'utf8')
const appScript = '<script src="./app.js"></script>'
const appScriptOffset = indexHtml.indexOf(appScript)

if (appScriptOffset < 0) {
  throw new Error('webos-app/index.html must load the application IIFE.')
}

for (const asset of mediaAssets) {
  const assetPath = resolve(outputDir, asset.fileName)
  const scriptOffset = indexHtml.indexOf(asset.script)

  if (
    !existsSync(assetPath) ||
    scriptOffset < 0 ||
    scriptOffset > appScriptOffset ||
    statSync(assetPath).size < 100_000 ||
    !readFileSync(assetPath, 'utf8').includes(asset.marker)
  ) {
    throw new Error(
      `webos-app must load a complete ${asset.fileName} media-engine asset before app.js.`,
    )
  }
}

const buildInfo = JSON.parse(readFileSync(buildInfoPath, 'utf8'))

if (
  buildInfo.dashjsBundledInAppIife !== false ||
  !Array.isArray(buildInfo.bundledMediaEngineIds) ||
  buildInfo.bundledMediaEngineIds.length !== 0 ||
  JSON.stringify(buildInfo.standaloneMediaAssets) !==
    JSON.stringify(mediaAssets.map((asset) => asset.fileName))
) {
  throw new Error(
    'build-info.json does not confirm the required standalone media-engine boundaries.',
  )
}

const bundledEngineMarkers = [
  'dist/modern/esm/dash.all.min.js',
  'node_modules/hls.js/',
  'node_modules/mpegts.js/',
]

const bundledEngine = bundledEngineMarkers.find((marker) => source.includes(marker))

if (bundledEngine) {
  throw new Error(
    `The application IIFE still contains a bundled media engine marker: ${bundledEngine}`,
  )
}

console.log(
  `Verified ${bundlePath} has no prohibited post-ES2015 globals and loads Dash.js, Hls.js, and MPEG-TS outside the application IIFE.`,
)