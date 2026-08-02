/**
 * Prevents a deferred catalog run from hot-looping when its next eligible
 * timestamp is already due by the time scheduling resumes.
 */
export const CATALOG_SYNC_MIN_REARM_DELAY_MS = 1_000

export function catalogSyncRearmDelay(nextDueAt: number, now: number): number {
  if (!Number.isFinite(nextDueAt) || !Number.isFinite(now)) {
    return CATALOG_SYNC_MIN_REARM_DELAY_MS
  }

  return Math.max(CATALOG_SYNC_MIN_REARM_DELAY_MS, nextDueAt - now)
}