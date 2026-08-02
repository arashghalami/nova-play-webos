import { readFile, readdir } from 'node:fs/promises'
import { resolve, relative, sep } from 'node:path'

const sourceRoot = resolve('src')
const sourceFiles = await collectSourceFiles(sourceRoot)
const sourceSet = new Set(sourceFiles)
const graph = new Map()

for (const sourceFile of sourceFiles) {
  const source = await readFile(sourceFile, 'utf8')
  graph.set(sourceFile, resolveImports(sourceFile, source, sourceSet))
}

const permanent = new Set()
const visiting = new Set()
const stack = []
const cycles = []

for (const sourceFile of sourceFiles) {
  visit(sourceFile)
}

if (cycles.length) {
  console.error('Runtime import cycles detected:')
  cycles.forEach((cycle) => {
    console.error(`- ${cycle.map(displayPath).join(' -> ')}`)
  })
  process.exit(1)
}

console.log(`Verified ${sourceFiles.length} runtime source modules contain no relative import cycles.`)

function visit(sourceFile) {
  if (permanent.has(sourceFile)) {
    return
  }

  if (visiting.has(sourceFile)) {
    const cycleStart = stack.indexOf(sourceFile)
    cycles.push([...stack.slice(cycleStart), sourceFile])
    return
  }

  visiting.add(sourceFile)
  stack.push(sourceFile)

  for (const dependency of graph.get(sourceFile) ?? []) {
    visit(dependency)
  }

  stack.pop()
  visiting.delete(sourceFile)
  permanent.add(sourceFile)
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const path = resolve(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(path))
    } else if (
      entry.isFile() &&
      path.endsWith('.ts') &&
      !path.endsWith('.test.ts')
    ) {
      files.push(path)
    }
  }

  return files
}

function resolveImports(sourceFile, source, sourceSet) {
  const dependencies = new Set()
  const importPattern = /\b(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g
  let match

  while ((match = importPattern.exec(source)) !== null) {
    const specifier = match[1]

    if (!specifier.startsWith('.')) {
      continue
    }

    const candidate = resolve(sourceFile, '..', `${specifier}.ts`)

    if (sourceSet.has(candidate)) {
      dependencies.add(candidate)
      continue
    }

    const indexCandidate = resolve(sourceFile, '..', specifier, 'index.ts')

    if (sourceSet.has(indexCandidate)) {
      dependencies.add(indexCandidate)
    }
  }

  return dependencies
}

function displayPath(path) {
  return relative(process.cwd(), path).split(sep).join('/')
}