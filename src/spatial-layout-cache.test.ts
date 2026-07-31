import { describe, expect, it } from 'vitest'
import { createSpatialLayoutCache } from './spatial-layout-cache'

describe('createSpatialLayoutCache', () => {
  it('builds once for repeated navigation on the same root', () => {
    const cache = createSpatialLayoutCache<object, { version: number }>()
    const root = {}
    let builds = 0

    const first = cache.get(root, () => ({ version: ++builds }))
    const second = cache.get(root, () => ({ version: ++builds }))

    expect(first).toEqual({ version: 1 })
    expect(second).toBe(first)
    expect(builds).toBe(1)
    expect(cache.populated).toBe(true)
  })

  it('rebuilds after explicit invalidation or a root replacement', () => {
    const cache = createSpatialLayoutCache<object, number>()
    const firstRoot = {}
    const secondRoot = {}
    let builds = 0
    const build = (): number => ++builds

    expect(cache.get(firstRoot, build)).toBe(1)

    cache.invalidate()
    expect(cache.populated).toBe(false)
    expect(cache.get(firstRoot, build)).toBe(2)
    expect(cache.get(secondRoot, build)).toBe(3)
  })
})