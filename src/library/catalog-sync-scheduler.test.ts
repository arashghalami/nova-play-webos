import { describe, expect, it } from 'vitest'
import {
  CATALOG_SYNC_MIN_REARM_DELAY_MS,
  catalogSyncRearmDelay,
} from './catalog-sync-scheduler'

describe('catalog sync scheduler', () => {
  it('preserves a future deferred eligibility delay', () => {
    expect(catalogSyncRearmDelay(12_000, 1_000)).toBe(11_000)
  })

  it('applies a minimum delay when eligibility is already due or in the past', () => {
    expect(catalogSyncRearmDelay(1_000, 1_000)).toBe(CATALOG_SYNC_MIN_REARM_DELAY_MS)
    expect(catalogSyncRearmDelay(999, 1_000)).toBe(CATALOG_SYNC_MIN_REARM_DELAY_MS)
  })

  it('treats an invalid deadline as a bounded retry rather than a zero-delay loop', () => {
    expect(catalogSyncRearmDelay(Number.NaN, 1_000)).toBe(CATALOG_SYNC_MIN_REARM_DELAY_MS)
  })
})