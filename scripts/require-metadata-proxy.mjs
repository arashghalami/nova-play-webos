import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const buildInfoPath = resolve('webos-app', 'build-info.json')

if (!existsSync(buildInfoPath)) {
  throw new Error('webOS package cannot be created without webos-app/build-info.json.')
}

const buildInfo = JSON.parse(readFileSync(buildInfoPath, 'utf8'))

if (buildInfo.metadataProxyConfigured !== true) {
  throw new Error(
    'webOS package blocked: metadata proxy is not configured. Set VITE_METADATA_PROXY_URL in the ignored local .env before packaging.',
  )
}

console.log('Verified metadata proxy configuration in webos-app/build-info.json.')