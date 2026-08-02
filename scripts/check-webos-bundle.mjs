import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const bundlePath = resolve('webos-app', 'app.js')
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

console.log(`Verified ${bundlePath} contains none of the prohibited post-ES2015 globals.`)