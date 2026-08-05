import type { LibrarySection } from '../types'

/**
 * A crash-surviving marker for the catalog acquisition run.
 *
 * Four consecutive Live acquisitions terminated the webOS renderer with no JS
 * exception, and every one lost its diagnostic state to the page reload that
 * followed. `localStorage` writes are synchronous and survive a renderer kill, so
 * a single small record written at each stage boundary tells the next launch where
 * the previous run stopped.
 *
 * This is durability, not instrumentation: a run that finds an unfinished
 * breadcrumb reduces its own batch size instead of repeating the work that killed
 * it. The record carries a stage name, a section name, a count, and a timestamp -
 * no titles, no queries, no URLs, no credentials - so it is safe under this
 * project's privacy constraints.
 */
export const SYNC_BREADCRUMB_KEY = 'nova-play.sync-breadcrumb'

/** Consecutive unfinished runs after which the batch size stops shrinking. */
export const SYNC_BREADCRUMB_MAX_DEGRADATIONS = 3

export type SyncBreadcrumbStage =
  | 'starting'
  | 'storage-preflight'
  | 'categories'
  | 'scanning'
  | 'publishing'
  | 'indexing'
  | 'section-complete'
  | 'finished'

export type SyncBreadcrumb = {
  schemaVersion: 1
  stage: SyncBreadcrumbStage
  section: LibrarySection | null
  itemCount: number
  /** Unfinished runs observed in a row, used to pick this run's batch size. */
  degradations: number
  updatedAt: number
}

export type BreadcrumbStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function storage(): BreadcrumbStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    // Storage can be denied outright; the run must continue regardless.
    return null
  }
}

export function readSyncBreadcrumb(
  store: BreadcrumbStorage | null = storage(),
): SyncBreadcrumb | null {
  if (!store) {
    return null
  }

  try {
    const raw = store.getItem(SYNC_BREADCRUMB_KEY)

    if (!raw) {
      return null
    }

    const value = JSON.parse(raw) as unknown

    if (
      typeof value !== 'object' ||
      value === null ||
      (value as SyncBreadcrumb).schemaVersion !== 1 ||
      typeof (value as SyncBreadcrumb).stage !== 'string' ||
      typeof (value as SyncBreadcrumb).itemCount !== 'number'
    ) {
      return null
    }

    const breadcrumb = value as SyncBreadcrumb

    return {
      schemaVersion: 1,
      stage: breadcrumb.stage,
      section: breadcrumb.section ?? null,
      itemCount: Number.isFinite(breadcrumb.itemCount) ? breadcrumb.itemCount : 0,
      degradations: Number.isFinite(breadcrumb.degradations)
        ? Math.max(0, Math.floor(breadcrumb.degradations))
        : 0,
      updatedAt: Number.isFinite(breadcrumb.updatedAt) ? breadcrumb.updatedAt : 0,
    }
  } catch {
    return null
  }
}

export function writeSyncBreadcrumb(
  breadcrumb: Omit<SyncBreadcrumb, 'schemaVersion'>,
  store: BreadcrumbStorage | null = storage(),
): void {
  if (!store) {
    return
  }

  try {
    store.setItem(
      SYNC_BREADCRUMB_KEY,
      JSON.stringify({ schemaVersion: 1, ...breadcrumb } satisfies SyncBreadcrumb),
    )
  } catch {
    // A full or denied quota must never fail the run it is only describing.
  }
}

export function clearSyncBreadcrumb(store: BreadcrumbStorage | null = storage()): void {
  if (!store) {
    return
  }

  try {
    store.removeItem(SYNC_BREADCRUMB_KEY)
  } catch {
    // Nothing to recover; the next successful run overwrites it anyway.
  }
}

/**
 * A breadcrumb left in a working stage means the previous run never reached
 * `finished`, so it either crashed or was killed. Cancellation clears the
 * breadcrumb explicitly, so this does not treat a paused run as a failure.
 */
export function isUnfinished(breadcrumb: SyncBreadcrumb | null): boolean {
  return breadcrumb !== null && breadcrumb.stage !== 'finished'
}

/**
 * Halves the batch size once per consecutive unfinished run, down to a floor.
 * Smaller batches mean more frequent yields and a smaller working set, which is
 * the cheapest available response to an unexplained termination.
 */
export function degradedFlushItems(
  baseFlushItems: number,
  breadcrumb: SyncBreadcrumb | null,
  minimumFlushItems = 16,
): number {
  if (!isUnfinished(breadcrumb)) {
    return baseFlushItems
  }

  const steps = Math.min(
    SYNC_BREADCRUMB_MAX_DEGRADATIONS,
    Math.max(1, (breadcrumb?.degradations ?? 0) + 1),
  )
  const scaled = Math.floor(baseFlushItems / 2 ** steps)
  return Math.max(minimumFlushItems, scaled)
}

/** Consecutive-unfinished counter to persist for the run that is starting. */
export function nextDegradationCount(breadcrumb: SyncBreadcrumb | null): number {
  if (!isUnfinished(breadcrumb)) {
    return 0
  }

  return Math.min(SYNC_BREADCRUMB_MAX_DEGRADATIONS, (breadcrumb?.degradations ?? 0) + 1)
}
