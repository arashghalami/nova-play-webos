import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ARTWORK_RECORD_TTL_MS,
  MAX_ARTWORK_RECORDS,
  type ArtworkRecord,
  loadArtworkRecords,
  saveArtworkRecords,
} from './artwork-record'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length(): number {
    return this.values.size
  }
  clear(): void {
    this.values.clear()
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.values.delete(key)
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

const profileId = 'profile-artwork-test'

function record(overrides: Partial<ArtworkRecord> = {}): ArtworkRecord {
  return {
    streamKey: 'vod:stream:1',
    poster: 'https://image.tmdb.org/t/p/w342/a.jpg',
    updatedAt: 1_000_000,
    ...overrides,
  }
}

describe('artwork record persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips a positive poster override', () => {
    const now = 5_000_000
    const map = new Map([['vod:stream:1', record({ updatedAt: now })]])
    expect(saveArtworkRecords(profileId, map, now)).toBe(true)

    const loaded = loadArtworkRecords(profileId, now)
    expect(loaded.get('vod:stream:1')?.poster).toBe('https://image.tmdb.org/t/p/w342/a.jpg')
  })

  it('round-trips a NEGATIVE (no-match) marker as null', () => {
    const now = 5_000_000
    const map = new Map([['vod:stream:2', record({ streamKey: 'vod:stream:2', poster: null, updatedAt: now })]])
    saveArtworkRecords(profileId, map, now)

    const loaded = loadArtworkRecords(profileId, now)
    expect(loaded.has('vod:stream:2')).toBe(true)
    expect(loaded.get('vod:stream:2')?.poster).toBeNull()
  })

  it('is profile-scoped', () => {
    const now = 5_000_000
    saveArtworkRecords(profileId, new Map([['s', record({ updatedAt: now })]]), now)
    expect(loadArtworkRecords('other', now).size).toBe(0)
  })

  it('drops records past the 30-day TTL on load (negative markers lapse and retry)', () => {
    const now = 100 * ARTWORK_RECORD_TTL_MS
    const map = new Map([
      ['fresh', record({ streamKey: 'fresh', poster: null, updatedAt: now - 1000 })],
      ['stale', record({ streamKey: 'stale', poster: null, updatedAt: now - ARTWORK_RECORD_TTL_MS - 1 })],
    ])
    saveArtworkRecords(profileId, map, now - ARTWORK_RECORD_TTL_MS - 1)

    const loaded = loadArtworkRecords(profileId, now)
    expect(loaded.has('fresh')).toBe(true)
    expect(loaded.has('stale')).toBe(false)
  })

  it('drops expired records on save and reconciles the in-memory map', () => {
    const now = 100 * ARTWORK_RECORD_TTL_MS
    const map = new Map([
      ['fresh', record({ streamKey: 'fresh', updatedAt: now - 1000 })],
      ['stale', record({ streamKey: 'stale', updatedAt: now - ARTWORK_RECORD_TTL_MS - 1 })],
    ])
    saveArtworkRecords(profileId, map, now)
    expect(map.has('stale')).toBe(false)
    expect(map.has('fresh')).toBe(true)
  })

  it('caps to the most recent MAX_ARTWORK_RECORDS by updatedAt', () => {
    const now = 10_000_000
    const map = new Map<string, ArtworkRecord>()
    for (let i = 0; i < MAX_ARTWORK_RECORDS + 40; i += 1) {
      const key = `s-${i}`
      map.set(key, record({ streamKey: key, updatedAt: now - (MAX_ARTWORK_RECORDS + 40 - i) * 1000 }))
    }
    saveArtworkRecords(profileId, map, now)

    expect(map.size).toBe(MAX_ARTWORK_RECORDS)
    expect(map.has(`s-${MAX_ARTWORK_RECORDS + 39}`)).toBe(true) // newest kept
    expect(map.has('s-0')).toBe(false) // oldest evicted
  })

  it('returns empty when nothing stored and tolerates malformed data', () => {
    expect(loadArtworkRecords(profileId, 1).size).toBe(0)
    localStorage.setItem('nova-play.artwork.' + profileId, '{not json')
    expect(loadArtworkRecords(profileId, 1).size).toBe(0)
    localStorage.setItem(
      'nova-play.artwork.' + profileId,
      JSON.stringify([null, 1, { streamKey: 'x' }, { streamKey: 'y', updatedAt: 1, poster: 5 }]),
    )
    // All four entries are malformed (missing/!string poster or updatedAt).
    expect(loadArtworkRecords(profileId, 1).size).toBe(0)
  })
})
