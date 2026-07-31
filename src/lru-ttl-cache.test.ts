import { describe, expect, it } from 'vitest'
import { LruTtlCache } from './lru-ttl-cache'

describe('LruTtlCache', () => {
  it('returns a live entry and expires it after its TTL', () => {
    const cache = new LruTtlCache<string>(2, 100)

    cache.set('query', 'result', 1_000)

    expect(cache.get('query', 1_100)).toBe('result')
    expect(cache.get('query', 1_101)).toBeNull()
    expect(cache.size).toBe(0)
  })

  it('evicts the least recently used entry and promotes entries on reads', () => {
    const cache = new LruTtlCache<string>(2, 1_000)

    cache.set('oldest', 'one', 0)
    cache.set('recent', 'two', 1)
    expect(cache.get('oldest', 2)).toBe('one')
    cache.set('newest', 'three', 3)

    expect(cache.get('oldest', 4)).toBe('one')
    expect(cache.get('recent', 4)).toBeNull()
    expect(cache.get('newest', 4)).toBe('three')
  })

  it('replaces an existing key without consuming an additional cache slot', () => {
    const cache = new LruTtlCache<string>(2, 1_000)

    cache.set('query', 'old', 0)
    cache.set('query', 'new', 1)

    expect(cache.size).toBe(1)
    expect(cache.get('query', 2)).toBe('new')
  })

  it('clears all entries explicitly', () => {
    const cache = new LruTtlCache<number>(2, 1_000)

    cache.set('a', 1, 0)
    cache.set('b', 2, 0)
    cache.clear()

    expect(cache.size).toBe(0)
    expect(cache.get('a', 1)).toBeNull()
    expect(cache.get('b', 1)).toBeNull()
  })
})