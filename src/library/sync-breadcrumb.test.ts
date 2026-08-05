import { describe, expect, it } from 'vitest'
import {
  SYNC_BREADCRUMB_KEY,
  SYNC_BREADCRUMB_MAX_DEGRADATIONS,
  clearSyncBreadcrumb,
  degradedFlushItems,
  isUnfinished,
  nextDegradationCount,
  readSyncBreadcrumb,
  writeSyncBreadcrumb,
} from './sync-breadcrumb'

class MemoryStorage {
  private readonly values = new Map<string, string>()
  failWrites = false

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) {
      throw new Error('quota exceeded')
    }

    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

describe('catalog sync breadcrumb', () => {
  it('round-trips a stage marker and carries no catalog content', () => {
    const store = new MemoryStorage()

    writeSyncBreadcrumb(
      { stage: 'scanning', section: 'live', itemCount: 39_174, degradations: 0, updatedAt: 1_000 },
      store,
    )

    const raw = store.getItem(SYNC_BREADCRUMB_KEY) ?? ''
    expect(JSON.parse(raw)).toEqual({
      schemaVersion: 1,
      stage: 'scanning',
      section: 'live',
      itemCount: 39_174,
      degradations: 0,
      updatedAt: 1_000,
    })

    // Only a stage name, a section name, a count and a timestamp are persisted.
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual([
      'degradations',
      'itemCount',
      'schemaVersion',
      'section',
      'stage',
      'updatedAt',
    ])

    expect(readSyncBreadcrumb(store)).toMatchObject({
      stage: 'scanning',
      section: 'live',
      itemCount: 39_174,
    })
  })

  it('treats a working stage as unfinished and a finished stage as clean', () => {
    const store = new MemoryStorage()

    writeSyncBreadcrumb(
      { stage: 'publishing', section: 'live', itemCount: 53_876, degradations: 0, updatedAt: 1 },
      store,
    )
    expect(isUnfinished(readSyncBreadcrumb(store))).toBe(true)

    writeSyncBreadcrumb(
      { stage: 'finished', section: null, itemCount: 0, degradations: 0, updatedAt: 2 },
      store,
    )
    expect(isUnfinished(readSyncBreadcrumb(store))).toBe(false)

    clearSyncBreadcrumb(store)
    expect(readSyncBreadcrumb(store)).toBeNull()
    expect(isUnfinished(null)).toBe(false)
  })

  it('halves the flush size once per consecutive unfinished run, down to a floor', () => {
    const unfinished = (degradations: number) => ({
      schemaVersion: 1 as const,
      stage: 'scanning' as const,
      section: 'live' as const,
      itemCount: 40_000,
      degradations,
      updatedAt: 1,
    })

    expect(degradedFlushItems(128, null)).toBe(128)
    expect(degradedFlushItems(128, unfinished(0))).toBe(64)
    expect(degradedFlushItems(128, unfinished(1))).toBe(32)
    expect(degradedFlushItems(128, unfinished(2))).toBe(16)
    // Bounded: further failures cannot shrink the batch indefinitely.
    expect(degradedFlushItems(128, unfinished(9))).toBe(16)
    expect(degradedFlushItems(128, unfinished(9), 8)).toBe(16)

    expect(nextDegradationCount(null)).toBe(0)
    expect(nextDegradationCount(unfinished(0))).toBe(1)
    expect(nextDegradationCount(unfinished(SYNC_BREADCRUMB_MAX_DEGRADATIONS))).toBe(
      SYNC_BREADCRUMB_MAX_DEGRADATIONS,
    )
  })

  it('never lets storage failures or malformed records affect a run', () => {
    const store = new MemoryStorage()

    store.failWrites = true
    expect(() =>
      writeSyncBreadcrumb(
        { stage: 'scanning', section: 'live', itemCount: 1, degradations: 0, updatedAt: 1 },
        store,
      ),
    ).not.toThrow()

    store.failWrites = false
    store.setItem(SYNC_BREADCRUMB_KEY, 'not json')
    expect(readSyncBreadcrumb(store)).toBeNull()

    store.setItem(SYNC_BREADCRUMB_KEY, JSON.stringify({ schemaVersion: 2, stage: 'scanning' }))
    expect(readSyncBreadcrumb(store)).toBeNull()

    expect(readSyncBreadcrumb(null)).toBeNull()
    expect(() => writeSyncBreadcrumb(
      { stage: 'scanning', section: null, itemCount: 0, degradations: 0, updatedAt: 0 },
      null,
    )).not.toThrow()
  })
})
