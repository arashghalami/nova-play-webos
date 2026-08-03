import { LruTtlCache } from '../lru-ttl-cache'
import { performanceTrace } from '../performance-trace'
import { foldText, matchesQuery, queryTokens } from '../search'
import {
  favoriteKey,
  toStoredStream,
  type ProviderAccessState,
} from '../storage'
import type {
  AccountSummary,
  Category,
  LibrarySection,
  NowNext,
  SeriesDetails,
  StreamItem,
  VodDetails,
} from '../types'

export const LIBRARY_DATABASE_NAME = 'nova-play-library'
export const LIBRARY_DATABASE_VERSION = 4
export const LIBRARY_SCHEMA_VERSION = 1
export const MAX_SNAPSHOT_ITEMS = 1_500
export const MAX_SNAPSHOT_BYTES = 256 * 1024
export const MAX_SEARCH_SHARD_ENTRIES = 5_000
export const SEARCH_INDEX_FORMAT_VERSION = 1
/*
 * IndexedDB writes run synchronously inside each transaction. Larger batches
 * keep the migration practical on webOS, while still committing frequently
 * enough to yield between bounded units and avoid a long single transaction.
 */
export const SEARCH_INDEX_POSTINGS_PER_SHARD = 1_024
export const SEARCH_INDEX_WRITE_RECORD_BATCH_SIZE = 32
export const MAX_SEARCH_INDEX_BUFFERED_POSTINGS = 200_000

export const LIBRARY_STORE_NAMES = [
  'meta',
  'manifests',
  'snapshots',
  'searchShards',
  'searchIndexMeta',
  'searchIndexShards',
  'details',
  'epg',
] as const

export type LibraryStoreName = (typeof LIBRARY_STORE_NAMES)[number]
export type LibraryCoverage = 'none' | 'partial' | 'complete'
export type LibraryDetailKind = 'vod' | 'series'
export type LibraryDetails = VodDetails | SeriesDetails
export type SearchTuple = [key: string, foldedName: string, section: LibrarySection, categoryId: string]

export type LibrarySyncSectionState = {
  coverage: LibraryCoverage
  wholeSectionFailureCount: number
  nextCategoryCursor: number
  lastAttemptAt?: number
  lastSuccessAt?: number
  lastFailureAt?: number
}

export type LibrarySyncState = {
  inProgress: boolean
  runId?: string
  startedAt?: number
  updatedAt?: number
  failureCount?: number
  sections?: Partial<Record<LibrarySection, LibrarySyncSectionState>>
}

export type LibraryMetaRecord = {
  schemaVersion: 1
  profileId: string
  lastSyncAttemptAt?: number
  lastSyncSuccessAt?: number
  nextDueAt?: number
  providerAccessState?: ProviderAccessState
  account?: {
    summary: AccountSummary
    capturedAt: number
  }
  sync: LibrarySyncState
  searchCoverage: LibraryCoverage
  searchShardCount: number
  searchUpdatedAt?: number
}

export type CategoryManifestEntry = {
  categoryKey: string
  categoryId: string
  name: string
  coverage: LibraryCoverage
  shardCount: number
  /**
   * Physical shard slot for this category's currently active snapshot set.
   * The manifest record itself is the category's atomic publish boundary.
   */
  shardBase?: number
  itemCount: number
  byteEstimate: number
  updatedAt?: number
}

export type CoverageSummary = {
  state: LibraryCoverage
  categoryCount: number
  completeCategoryCount: number
  itemCount: number
  byteEstimate: number
}

export type SectionManifestRecord = {
  schemaVersion: 1
  profileId: string
  section: LibrarySection
  categories: CategoryManifestEntry[]
  coverage: CoverageSummary
  updatedAt: number
}

export type SnapshotRecord = {
  schemaVersion: 1
  profileId: string
  section: LibrarySection
  categoryKey: string
  shardIndex: number
  payload: string
  updatedAt: number
  itemCount: number
  byteEstimate: number
}

export type SearchShardRecord = {
  schemaVersion: 1
  profileId: string
  shardIndex: number
  payload: string
  updatedAt: number
  entryCount: number
  byteEstimate: number
}

/**
 * A generation-bound, derived local prefix index. It is not authoritative on
 * its own: readers require an exact match with the accepted section manifest.
 */
export type SearchIndexMetaRecord = {
  schemaVersion: 1
  profileId: string
  section: LibrarySection
  formatVersion: number
  coverage: LibraryCoverage
  generation?: number
  updatedAt: number
  itemCount: number
  postingCount: number
  legacyUntitledCount: number
  prefixPostingCounts: Record<string, number>
  prefixShardCounts: Record<string, number>
}

/**
 * A packed prefix posting references the authoritative snapshot item. Full
 * streams are resolved lazily only for the bounded visible result page.
 */
export type SearchIndexPosting = [
  categoryKey: string,
  snapshotShardIndex: number,
  snapshotItemIndex: number,
  snapshotUpdatedAt: number,
  streamKey: string,
  foldedName: string,
]

export type SearchIndexShardRecord = {
  schemaVersion: 1
  profileId: string
  section: LibrarySection
  generation: number
  prefix: string
  shardIndex: number
  payload: string
  entryCount: number
}

export type DetailRecord<T extends LibraryDetails = LibraryDetails> = {
  schemaVersion: 1
  profileId: string
  kind: LibraryDetailKind
  id: string
  value: T
  updatedAt: number
  expiresAt: number
}

export type EpgRecord = {
  schemaVersion: 1
  profileId: string
  streamId: string
  value: NowNext
  updatedAt: number
  expiresAt: number
}

export type CategorySnapshotShard = {
  payload: string
  itemCount: number
  byteEstimate: number
}

export type CategoryShardReadResult =
  | {
      coverage: 'none'
      items: []
      reason:
        | 'database-unavailable'
        | 'manifest-missing'
        | 'category-unavailable'
        | 'snapshot-missing'
        | 'snapshot-invalid'
    }
  | {
      coverage: 'complete'
      items: StreamItem[]
      shardIndex: number
      shardCount: number
      itemCount: number
      byteEstimate: number
      updatedAt: number
    }

export type LocalLibraryUnavailableReason =
  | 'database-unavailable'
  | 'manifest-missing'
  | 'section-incomplete'
  | 'category-unavailable'
  | 'snapshot-missing'
  | 'snapshot-invalid'

export type CompleteSectionCategoriesResult =
  | {
      coverage: 'complete'
      categories: Category[]
    }
  | {
      coverage: 'none'
      categories: []
      reason: 'database-unavailable' | 'manifest-missing' | 'section-incomplete'
    }

export type CompleteCategoryReadResult =
  | {
      coverage: 'complete'
      items: StreamItem[]
    }
  | {
      coverage: 'none'
      items: []
      reason: LocalLibraryUnavailableReason
    }

export type SectionSearchResult =
  | {
      coverage: 'complete'
      matches: StreamItem[]
      limited: boolean
    }
  | {
      coverage: 'none'
      matches: []
      reason: LocalLibraryUnavailableReason | 'index-unavailable' | 'index-invalid'
    }

export type SectionSearchProgress = {
  matches: StreamItem[]
  matchedCount: number
  postingCount: number
}

export type SectionSearchOptions = {
  signal?: AbortSignal
  onMatches?: (progress: SectionSearchProgress) => void | Promise<void>
}

type SearchIndexUnavailableReason =
  | LocalLibraryUnavailableReason
  | 'index-unavailable'
  | 'index-invalid'

export type SearchIndexBuildResult =
  | {
      coverage: 'complete'
      generation: number
      itemCount: number
      postingCount: number
      legacyUntitledCount: number
      prefixPostingCounts: Record<string, number>
      prefixShardCounts: Record<string, number>
      elapsedMs: number
    }
  | {
      coverage: 'none'
      reason: SearchIndexUnavailableReason
      elapsedMs: number
    }

export type LegacyUntitledSectionCount = {
  section: LibrarySection
  itemCount: number
  legacyUntitledCount: number
}

export type SearchQueryResult =
  | {
      coverage: 'none'
      matches: []
      reason: 'database-unavailable' | 'index-unavailable' | 'shard-missing' | 'shard-invalid'
    }
  | {
      coverage: 'complete'
      matches: SearchTuple[]
    }

export type CategorySnapshotWriteInput = {
  profileId: string
  section: LibrarySection
  category: Category
  categoryKey?: string
  items: readonly StreamItem[]
  updatedAt?: number
  /**
   * Optional Phase 1B ownership token. When supplied, a stale or superseded
   * sync cannot keep publishing cooperative snapshot units.
   */
  runId?: string
}

export type PartialCategorySnapshotAppendInput = {
  profileId: string
  section: LibrarySection
  category: Category
  categoryKey?: string
  items: readonly StreamItem[]
  runId?: string
}

export type SectionSnapshotWriteInput = {
  profileId: string
  section: LibrarySection
  snapshots: readonly Omit<CategorySnapshotWriteInput, 'profileId' | 'section' | 'runId' | 'updatedAt'>[]
  updatedAt?: number
  runId?: string
}

export type SnapshotPublishStage =
  | 'snapshot-plan'
  | 'snapshot-write'
  | 'manifest-build'
  | 'manifest-put'
  | 'cleanup'
  | 'complete'

export type CooperativeWriteOptions = {
  signal?: AbortSignal
  yieldControl?: () => Promise<void>
  onSnapshotPut?: (measurement: {
    durationMs: number
    eventLoopTurnMs: number
    byteEstimate: number
    itemCount: number
  }) => void
  /**
   * Reports stable, payload-free publication boundaries for probe diagnostics.
   * This is intentionally called only around local cache work.
   */
  onPublishStage?: (stage: SnapshotPublishStage) => void
}

export type CatalogRepositoryOptions = {
  databaseName?: string
  now?: () => number
  snapshotCacheEntries?: number
  snapshotCacheTtlMs?: number
  searchCacheProfiles?: number
  searchCacheTtlMs?: number
}

type SnapshotCacheValue = {
  items: StreamItem[]
  itemCount: number
  byteEstimate: number
  updatedAt: number
}

type SearchCacheValue = {
  updatedAt: number
  shards: SearchTuple[][]
}

const DEFAULT_MEMORY_TTL_MS = 5 * 60_000
const activeCooperativeTransactions = new Set<IDBTransaction>()
let playbackStarting = false
let playbackEpoch = 0
let activeCacheScope: string | null = null
let snapshotMemoryCache = new LruTtlCache<SnapshotCacheValue>(24, DEFAULT_MEMORY_TTL_MS)
let searchMemoryCache = new LruTtlCache<SearchCacheValue>(2, DEFAULT_MEMORY_TTL_MS)

export class LibraryWriteAbortedError extends Error {
  readonly code = 'library-write-aborted'

  constructor(message = 'Library cache write aborted.') {
    super(message)
    this.name = 'LibraryWriteAbortedError'
  }
}

/**
 * Player startup is a hard cancellation boundary for cooperative catalog writes.
 * Phase 1B can resume from its own source unit after playback startup completes.
 */
export function setLibraryPlaybackStarting(starting: boolean): void {
  playbackStarting = starting

  if (!starting) {
    return
  }

  playbackEpoch += 1

  for (const transaction of activeCooperativeTransactions) {
    try {
      transaction.abort()
    } catch {
      // A transaction that has already completed no longer needs cancellation.
    }
  }
}

export function clearLibraryMemoryCaches(): void {
  snapshotMemoryCache.clear()
  searchMemoryCache.clear()
  activeCacheScope = null
}

export function buildCategorySnapshotShards(
  items: readonly StreamItem[],
  maxItems = MAX_SNAPSHOT_ITEMS,
  maxBytes = MAX_SNAPSHOT_BYTES,
): CategorySnapshotShard[] {
  const safeMaxItems = positiveInteger(maxItems, MAX_SNAPSHOT_ITEMS)
  const safeMaxBytes = positiveInteger(maxBytes, MAX_SNAPSHOT_BYTES)
  const shards: CategorySnapshotShard[] = []
  let itemPayloads: string[] = []
  let payloadBytes = 2

  const flush = (): void => {
    if (!itemPayloads.length) {
      return
    }

    const payload = `[${itemPayloads.join(',')}]`
    shards.push({
      payload,
      itemCount: itemPayloads.length,
      byteEstimate: utf8ByteLength(payload),
    })
    itemPayloads = []
    payloadBytes = 2
  }

  for (const item of items) {
    const stored = toCachedStream(item)
    const itemPayload = JSON.stringify(stored)
    const itemBytes = utf8ByteLength(itemPayload)

    if (itemBytes + 2 > safeMaxBytes) {
      throw new Error(`A normalized catalog item exceeds the ${safeMaxBytes}-byte shard limit.`)
    }

    const separatorBytes = itemPayloads.length ? 1 : 0

    if (
      itemPayloads.length > 0 &&
      (itemPayloads.length >= safeMaxItems || payloadBytes + separatorBytes + itemBytes > safeMaxBytes)
    ) {
      flush()
    }

    itemPayloads.push(itemPayload)
    payloadBytes += (itemPayloads.length > 1 ? 1 : 0) + itemBytes
  }

  flush()

  if (!shards.length) {
    return [{ payload: '[]', itemCount: 0, byteEstimate: 2 }]
  }

  return shards
}

export function buildSearchShards(
  items: readonly StreamItem[],
  maxEntries = MAX_SEARCH_SHARD_ENTRIES,
): SearchTuple[][] {
  const safeMaxEntries = positiveInteger(maxEntries, MAX_SEARCH_SHARD_ENTRIES)
  const shards: SearchTuple[][] = []
  let current: SearchTuple[] = []

  for (const item of items) {
    const stored = toCachedStream(item)
    current.push([
      favoriteKey(stored),
      stored.searchName ?? '',
      stored.section,
      stored.categoryId,
    ])

    if (current.length >= safeMaxEntries) {
      shards.push(current)
      current = []
    }
  }

  if (current.length) {
    shards.push(current)
  }

  return shards
}

export function openLibraryDatabase(
  databaseName = LIBRARY_DATABASE_NAME,
): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.open !== 'function') {
    return Promise.reject(new Error('IndexedDB is unavailable.'))
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, LIBRARY_DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result

      for (const existingName of objectStoreNames(database)) {
        if (!isLibraryStoreName(existingName)) {
          database.deleteObjectStore(existingName)
        }
      }

      createStore(database, 'meta', 'profileId')
      createStore(database, 'manifests', ['profileId', 'section'])
      createStore(database, 'snapshots', [
        'profileId',
        'section',
        'categoryKey',
        'shardIndex',
      ])
      createStore(database, 'searchShards', ['profileId', 'shardIndex'])
      createStore(database, 'searchIndexMeta', ['profileId', 'section'])
      createStore(database, 'searchIndexShards', [
        'profileId',
        'section',
        'generation',
        'prefix',
        'shardIndex',
      ])
      createStore(database, 'details', ['profileId', 'kind', 'id'])
      createStore(database, 'epg', ['profileId', 'streamId'])
    }

    request.onerror = () =>
      reject(request.error ?? new Error('Unable to open the library cache database.'))
    request.onblocked = () => reject(new Error('Opening the library cache database was blocked.'))
    request.onsuccess = () => {
      const database = request.result
      const actualStores = objectStoreNames(database)

      if (
        actualStores.length !== LIBRARY_STORE_NAMES.length ||
        LIBRARY_STORE_NAMES.some((name) => !database.objectStoreNames.contains(name))
      ) {
        database.close()
        reject(new Error('The library cache database has an incompatible store layout.'))
        return
      }

      database.onversionchange = () => database.close()
      resolve(database)
    }
  })
}

export function deleteLibraryDatabase(
  databaseName = LIBRARY_DATABASE_NAME,
): Promise<void> {
  clearLibraryMemoryCaches()

  if (typeof indexedDB === 'undefined' || typeof indexedDB.deleteDatabase !== 'function') {
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName)
    request.onsuccess = () => resolve()
    request.onerror = () =>
      reject(request.error ?? new Error('Unable to delete the library cache database.'))
    request.onblocked = () => reject(new Error('Deleting the library cache database was blocked.'))
  })
}

export class IndexedDbCatalogRepository {
  private readonly databaseName: string
  private readonly now: () => number
  private databasePromise: Promise<IDBDatabase> | null = null
  private readonly searchIndexBuilds = new Map<string, Promise<SearchIndexBuildResult>>()

  constructor(options: CatalogRepositoryOptions = {}) {
    this.databaseName = options.databaseName ?? LIBRARY_DATABASE_NAME
    this.now = options.now ?? Date.now

    if (
      options.snapshotCacheEntries !== undefined ||
      options.snapshotCacheTtlMs !== undefined
    ) {
      snapshotMemoryCache = new LruTtlCache<SnapshotCacheValue>(
        positiveInteger(options.snapshotCacheEntries, 24),
        nonNegativeNumber(options.snapshotCacheTtlMs, DEFAULT_MEMORY_TTL_MS),
      )
    }

    if (
      options.searchCacheProfiles !== undefined ||
      options.searchCacheTtlMs !== undefined
    ) {
      searchMemoryCache = new LruTtlCache<SearchCacheValue>(
        positiveInteger(options.searchCacheProfiles, 2),
        nonNegativeNumber(options.searchCacheTtlMs, DEFAULT_MEMORY_TTL_MS),
      )
    }
  }

  async initialize(): Promise<readonly LibraryStoreName[]> {
    const database = await this.database()
    return objectStoreNames(database) as LibraryStoreName[]
  }

  close(): void {
    void this.databasePromise?.then((database) => database.close()).catch(() => undefined)
    this.databasePromise = null
  }

  async getMeta(profileId: string): Promise<LibraryMetaRecord | null> {
    selectMemoryCacheScope(this.databaseName, profileId)

    try {
      const database = await this.database()
      const record = await getRecord<unknown>(database, 'meta', profileId)
      return isMetaRecord(record, profileId) ? record : null
    } catch {
      return null
    }
  }

  async putMeta(
    profileId: string,
    patch: Partial<Omit<LibraryMetaRecord, 'schemaVersion' | 'profileId'>>,
  ): Promise<LibraryMetaRecord> {
    assertProfileId(profileId)
    const database = await this.database()

    return new Promise<LibraryMetaRecord>((resolve, reject) => {
      const transaction = database.transaction('meta', 'readwrite')
      const store = transaction.objectStore('meta')
      let result: LibraryMetaRecord | null = null
      let requestHandled = false
      let rejected = false

      const rejectOnce = (reason: unknown): void => {
        if (!rejected) {
          rejected = true
          reject(reason)
        }
      }

      transaction.oncomplete = () => {
        if (!rejected && requestHandled && result) {
          resolve(result)
        }
      }
      transaction.onerror = () =>
        rejectOnce(transaction.error ?? new Error('Unable to update catalog metadata.'))
      transaction.onabort = () =>
        rejectOnce(transaction.error ?? new Error('Catalog metadata transaction was aborted.'))

      const request = store.get(profileId)
      request.onerror = () =>
        rejectOnce(request.error ?? new Error('Unable to read catalog metadata.'))
      request.onsuccess = () => {
        requestHandled = true

        try {
          const current = request.result
          const base = isMetaRecord(current, profileId) ? current : defaultMeta(profileId)
          result = {
            ...base,
            ...patch,
            schemaVersion: LIBRARY_SCHEMA_VERSION,
            profileId,
            sync: patch.sync
              ? normalizeSyncState(patch.sync)
              : normalizeSyncState(base.sync),
          }
          store.put(result)
        } catch (reason) {
          try {
            transaction.abort()
          } catch {
            // Completion may win the race with this local validation failure.
          }
          rejectOnce(reason)
        }
      }
    })
  }

  async tryBeginSync(
    profileId: string,
    runId: string,
    staleAfterMs: number,
  ): Promise<boolean> {
    assertProfileId(profileId)
    const database = await this.database()

    return new Promise<boolean>((resolve, reject) => {
      const transaction = database.transaction('meta', 'readwrite')
      const store = transaction.objectStore('meta')
      let result = false
      let requestHandled = false
      let rejected = false

      const rejectOnce = (reason: unknown): void => {
        if (!rejected) {
          rejected = true
          reject(reason)
        }
      }

      transaction.oncomplete = () => {
        if (!rejected && requestHandled) {
          resolve(result)
        }
      }
      transaction.onerror = () =>
        rejectOnce(transaction.error ?? new Error('Unable to begin catalog synchronization.'))
      transaction.onabort = () =>
        rejectOnce(transaction.error ?? new Error('Catalog sync-start transaction was aborted.'))

      const request = store.get(profileId)
      request.onerror = () =>
        rejectOnce(request.error ?? new Error('Unable to read catalog sync state.'))
      request.onsuccess = () => {
        requestHandled = true

        try {
          const currentValue = request.result
          const current = isMetaRecord(currentValue, profileId)
            ? currentValue
            : defaultMeta(profileId)
          const currentTime = this.now()
          const staleAt = currentTime - Math.max(0, staleAfterMs)

          if (
            current.sync.inProgress &&
            typeof current.sync.updatedAt === 'number' &&
            current.sync.updatedAt > staleAt
          ) {
            return
          }

          store.put({
            ...current,
            lastSyncAttemptAt: currentTime,
            sync: {
              ...normalizeSyncState(current.sync),
              inProgress: true,
              runId,
              startedAt: currentTime,
              updatedAt: currentTime,
            },
          } satisfies LibraryMetaRecord)
          result = true
        } catch (reason) {
          try {
            transaction.abort()
          } catch {
            // Completion may win the race with this local validation failure.
          }
          rejectOnce(reason)
        }
      }
    })
  }

  async finishSync(
    profileId: string,
    runId: string,
    succeeded: boolean,
    nextDueAt?: number,
  ): Promise<boolean> {
    const database = await this.database()

    return new Promise<boolean>((resolve, reject) => {
      const transaction = database.transaction('meta', 'readwrite')
      const store = transaction.objectStore('meta')
      let result = false
      let requestHandled = false
      let rejected = false

      const rejectOnce = (reason: unknown): void => {
        if (!rejected) {
          rejected = true
          reject(reason)
        }
      }

      transaction.oncomplete = () => {
        if (!rejected && requestHandled) {
          resolve(result)
        }
      }
      transaction.onerror = () =>
        rejectOnce(transaction.error ?? new Error('Unable to finish catalog synchronization.'))
      transaction.onabort = () =>
        rejectOnce(transaction.error ?? new Error('Catalog sync-finish transaction was aborted.'))

      const request = store.get(profileId)
      request.onerror = () =>
        rejectOnce(request.error ?? new Error('Unable to read catalog sync state.'))
      request.onsuccess = () => {
        requestHandled = true
        const currentValue = request.result

        if (
          !isMetaRecord(currentValue, profileId) ||
          !currentValue.sync.inProgress ||
          currentValue.sync.runId !== runId
        ) {
          return
        }

        try {
          const currentTime = this.now()
          store.put({
            ...currentValue,
            lastSyncSuccessAt: succeeded
              ? currentTime
              : currentValue.lastSyncSuccessAt,
            nextDueAt,
            sync: {
              ...normalizeSyncState(currentValue.sync),
              inProgress: false,
              runId: undefined,
              updatedAt: currentTime,
            },
          } satisfies LibraryMetaRecord)
          result = true
        } catch (reason) {
          try {
            transaction.abort()
          } catch {
            // Completion may win the race with this local validation failure.
          }
          rejectOnce(reason)
        }
      }
    })
  }

  async updateSyncState(
    profileId: string,
    runId: string,
    update: (state: LibrarySyncState) => LibrarySyncState,
  ): Promise<LibraryMetaRecord | null> {
    const database = await this.database()

    /*
     * Keep the get-and-put in one IndexedDB request callback. Some older webOS
     * engines may auto-commit a readwrite transaction after an awaited request,
     * leaving a later store.put() inactive. A post-scan sync-state failure can
     * otherwise make already-published snapshots look like a failed section.
     */
    return new Promise<LibraryMetaRecord | null>((resolve, reject) => {
      const transaction = database.transaction('meta', 'readwrite')
      const store = transaction.objectStore('meta')
      let result: LibraryMetaRecord | null = null
      let requestHandled = false
      let rejected = false

      const rejectOnce = (reason: unknown): void => {
        if (!rejected) {
          rejected = true
          reject(reason)
        }
      }

      transaction.oncomplete = () => {
        if (!rejected && requestHandled) {
          resolve(result)
        }
      }
      transaction.onerror = () =>
        rejectOnce(transaction.error ?? new Error('Unable to update catalog sync state.'))
      transaction.onabort = () =>
        rejectOnce(transaction.error ?? new Error('Catalog sync-state transaction was aborted.'))

      const request = store.get(profileId)
      request.onerror = () =>
        rejectOnce(request.error ?? new Error('Unable to read catalog sync state.'))
      request.onsuccess = () => {
        requestHandled = true
        const currentValue = request.result

        if (
          !isMetaRecord(currentValue, profileId) ||
          !currentValue.sync.inProgress ||
          currentValue.sync.runId !== runId
        ) {
          return
        }

        try {
          const nextSync = normalizeSyncState(update(normalizeSyncState(currentValue.sync)))

          if (!nextSync.inProgress || nextSync.runId !== runId) {
            return
          }

          result = {
            ...currentValue,
            sync: {
              ...nextSync,
              updatedAt: this.now(),
            },
          }
          store.put(result)
        } catch (reason) {
          try {
            transaction.abort()
          } catch {
            // Completion may win the race with this local validation failure.
          }
          rejectOnce(reason)
        }
      }
    })
  }

  async putSectionManifest(
    profileId: string,
    section: LibrarySection,
    categories: readonly Category[],
    runId?: string,
  ): Promise<SectionManifestRecord> {
    assertProfileId(profileId)
    selectMemoryCacheScope(this.databaseName, profileId)
    const current = await this.getManifest(profileId, section)
    const currentByKey = new Map(
      (current?.categories ?? []).map((category) => [category.categoryKey, category]),
    )
    const receivedCategoryKeys = new Set(categories.map((category) => category.id))
    const nextCategories = [
      ...categories.map((category) => {
        const existing = currentByKey.get(category.id)
        return existing
          ? {
              ...existing,
              categoryId: category.id,
              categoryKey: category.id,
              name: category.name,
            }
          : emptyCategoryManifest(category)
      }),
      ...(current?.categories ?? []).filter(
        (category) => !receivedCategoryKeys.has(category.categoryKey),
      ),
    ]
    const manifest = createManifest(
      profileId,
      section,
      nextCategories,
      this.now(),
    )
    const database = await this.database()
    await assertSyncOwnership(database, profileId, runId)
    await putRecord(database, 'manifests', manifest)
    return manifest
  }

  async getManifest(
    profileId: string,
    section: LibrarySection,
  ): Promise<SectionManifestRecord | null> {
    selectMemoryCacheScope(this.databaseName, profileId)

    try {
      const database = await this.database()
      const record = await getRecord<unknown>(
        database,
        'manifests',
        [profileId, section],
      )
      return isManifestRecord(record, profileId, section) ? record : null
    } catch {
      return null
    }
  }

  async replaceCategorySnapshot(
    input: CategorySnapshotWriteInput,
    options: CooperativeWriteOptions = {},
  ): Promise<CategoryManifestEntry> {
    assertProfileId(input.profileId)
    selectMemoryCacheScope(this.databaseName, input.profileId)

    for (const item of input.items) {
      if (item.section !== input.section) {
        throw new Error('A category snapshot cannot contain items from another section.')
      }
    }

    options.onPublishStage?.('snapshot-plan')
    const categoryKey = input.categoryKey ?? input.category.id
    const shards = buildCategorySnapshotShards(input.items)
    const currentManifest = await this.getManifest(input.profileId, input.section)
    const currentCategory = currentManifest?.categories.find(
      (category) => category.categoryKey === categoryKey,
    )
    const generation = Math.max(
      input.updatedAt ?? this.now(),
      (currentCategory?.updatedAt ?? 0) + 1,
    )
    const writeEpoch = playbackEpoch
    const database = await this.database()
    const nextShardBase = nextSnapshotShardBase(currentCategory, shards.length)

    options.onPublishStage?.('snapshot-write')
    for (let shardIndex = 0; shardIndex < shards.length; shardIndex += 1) {
      assertCooperativeWriteAllowed(writeEpoch, options.signal)
      await assertSyncOwnership(database, input.profileId, input.runId)
      const shard = shards[shardIndex]
      const eventLoopTurn = nextEventLoopTurn()
      const startedAt = monotonicNow()

      await putCooperativeRecord(
        database,
        'snapshots',
        {
          schemaVersion: LIBRARY_SCHEMA_VERSION,
          profileId: input.profileId,
          section: input.section,
          categoryKey,
          shardIndex: nextShardBase + shardIndex,
          payload: shard.payload,
          updatedAt: generation,
          itemCount: shard.itemCount,
          byteEstimate: shard.byteEstimate,
        } satisfies SnapshotRecord,
        options.signal,
      )

      const durationMs = monotonicNow() - startedAt
      const eventLoopTurnMs = await eventLoopTurn
      options.onSnapshotPut?.({
        durationMs,
        eventLoopTurnMs,
        byteEstimate: shard.byteEstimate,
        itemCount: shard.itemCount,
      })
      await (options.yieldControl ?? defaultYield)()
    }

    assertCooperativeWriteAllowed(writeEpoch, options.signal)
    await assertSyncOwnership(database, input.profileId, input.runId)
    options.onPublishStage?.('manifest-build')
    const categoryEntry: CategoryManifestEntry = {
      categoryKey,
      categoryId: input.category.id,
      name: input.category.name,
      coverage: 'complete',
      shardCount: shards.length,
      shardBase: nextShardBase,
      itemCount: input.items.length,
      byteEstimate: shards.reduce((total, shard) => total + shard.byteEstimate, 0),
      updatedAt: generation,
    }
    const categories = upsertCategoryManifest(
      currentManifest?.categories ?? [],
      categoryEntry,
    )
    const manifest = createManifest(
      input.profileId,
      input.section,
      categories,
      generation,
    )

    options.onPublishStage?.('manifest-put')
    await putRecord(database, 'manifests', manifest)
    snapshotMemoryCache.clear()
    options.onPublishStage?.('cleanup')
    await pruneSurplusCategoryShards(
      database,
      input.profileId,
      input.section,
      categoryKey,
      shards.length,
      currentCategory?.shardCount ?? 0,
      currentCategory?.shardBase ?? 0,
      nextShardBase,
      writeEpoch,
      options,
    )
    options.onPublishStage?.('complete')
    return categoryEntry
  }

  /**
   * Starts a replacement pass for a section that has no authoritative complete
   * categories. Existing partial pointers are detached before parsing restarts,
   * so a restarted non-paginated response cannot append duplicate records.
   */
  async preparePartialSectionSnapshotRun(
    profileId: string,
    section: LibrarySection,
    runId?: string,
  ): Promise<SectionManifestRecord> {
    assertProfileId(profileId)
    selectMemoryCacheScope(this.databaseName, profileId)
    const current = await this.getManifest(profileId, section)

    if (!current) {
      throw new Error('Cannot prepare partial snapshots without a category manifest.')
    }

    if (current.categories.some((category) => category.coverage === 'complete')) {
      throw new Error('Partial publication cannot replace authoritative category snapshots.')
    }

    const database = await this.database()
    await assertSyncOwnership(database, profileId, runId)
    const manifest = createManifest(
      profileId,
      section,
      current.categories.map((category) => ({
        ...category,
        coverage: 'none',
        shardCount: 0,
        shardBase: 0,
        itemCount: 0,
        byteEstimate: 0,
        updatedAt: this.now(),
      })),
      this.now(),
    )
    await putRecord(database, 'manifests', manifest)
    snapshotMemoryCache.clear()
    return manifest
  }

  /**
   * Appends one bounded, parser-confirmed batch to a category that has no
   * currently authoritative complete snapshot. Each manifest update makes the
   * accumulated shards durable but explicitly partial. A later closed-array
   * promotion is the only transition to complete coverage.
   */
  async appendPartialCategorySnapshot(
    input: PartialCategorySnapshotAppendInput,
    options: CooperativeWriteOptions = {},
  ): Promise<CategoryManifestEntry> {
    assertProfileId(input.profileId)
    selectMemoryCacheScope(this.databaseName, input.profileId)

    for (const item of input.items) {
      if (item.section !== input.section) {
        throw new Error('A category snapshot cannot contain items from another section.')
      }
    }

    options.onPublishStage?.('snapshot-plan')
    const categoryKey = input.categoryKey ?? input.category.id
    const shards = buildCategorySnapshotShards(input.items)
    const currentManifest = await this.getManifest(input.profileId, input.section)
    const currentCategory = currentManifest?.categories.find(
      (category) => category.categoryKey === categoryKey,
    )

    if (currentCategory?.coverage === 'complete') {
      throw new Error('Partial publication cannot replace an authoritative category snapshot.')
    }

    const generation = currentCategory?.updatedAt ?? this.now()
    const currentShardCount = currentCategory?.shardCount ?? 0
    const shardBase = currentCategory?.shardBase ?? 0
    const writeEpoch = playbackEpoch
    const database = await this.database()

    options.onPublishStage?.('snapshot-write')
    for (let shardIndex = 0; shardIndex < shards.length; shardIndex += 1) {
      assertCooperativeWriteAllowed(writeEpoch, options.signal)
      await assertSyncOwnership(database, input.profileId, input.runId)
      const shard = shards[shardIndex]
      const eventLoopTurn = nextEventLoopTurn()
      const startedAt = monotonicNow()

      await putCooperativeRecord(
        database,
        'snapshots',
        {
          schemaVersion: LIBRARY_SCHEMA_VERSION,
          profileId: input.profileId,
          section: input.section,
          categoryKey,
          shardIndex: shardBase + currentShardCount + shardIndex,
          payload: shard.payload,
          updatedAt: generation,
          itemCount: shard.itemCount,
          byteEstimate: shard.byteEstimate,
        } satisfies SnapshotRecord,
        options.signal,
      )

      const durationMs = monotonicNow() - startedAt
      const eventLoopTurnMs = await eventLoopTurn
      options.onSnapshotPut?.({
        durationMs,
        eventLoopTurnMs,
        byteEstimate: shard.byteEstimate,
        itemCount: shard.itemCount,
      })
      await (options.yieldControl ?? defaultYield)()
    }

    assertCooperativeWriteAllowed(writeEpoch, options.signal)
    await assertSyncOwnership(database, input.profileId, input.runId)
    options.onPublishStage?.('manifest-build')
    const categoryEntry: CategoryManifestEntry = {
      categoryKey,
      categoryId: input.category.id,
      name: input.category.name,
      coverage: 'partial',
      shardCount: currentShardCount + shards.length,
      shardBase,
      itemCount: (currentCategory?.itemCount ?? 0) + input.items.length,
      byteEstimate:
        (currentCategory?.byteEstimate ?? 0) +
        shards.reduce((total, shard) => total + shard.byteEstimate, 0),
      updatedAt: generation,
    }
    const manifest = createManifest(
      input.profileId,
      input.section,
      upsertCategoryManifest(currentManifest?.categories ?? [], categoryEntry),
      this.now(),
    )

    options.onPublishStage?.('manifest-put')
    await putRecord(database, 'manifests', manifest)
    snapshotMemoryCache.clear()
    options.onPublishStage?.('complete')
    return categoryEntry
  }

  /**
   * A successful, fully closed whole-section stream promotes its already
   * persisted partial category generations in one manifest operation.
   */
  async promotePartialSectionSnapshots(
    profileId: string,
    section: LibrarySection,
    runId?: string,
  ): Promise<SectionManifestRecord> {
    assertProfileId(profileId)
    selectMemoryCacheScope(this.databaseName, profileId)
    const current = await this.getManifest(profileId, section)

    if (!current || current.categories.some((category) => category.coverage === 'none')) {
      throw new Error('Cannot promote a section with unavailable category coverage.')
    }

    const database = await this.database()
    await assertSyncOwnership(database, profileId, runId)
    const manifest = createManifest(
      profileId,
      section,
      current.categories.map((category) => (
        category.coverage === 'partial'
          ? { ...category, coverage: 'complete' }
          : category
      )),
      this.now(),
    )
    await putRecord(database, 'manifests', manifest)
    snapshotMemoryCache.clear()
    return manifest
  }

  async replaceSectionSnapshots(
    input: SectionSnapshotWriteInput,
    options: CooperativeWriteOptions = {},
  ): Promise<CategoryManifestEntry[]> {
    assertProfileId(input.profileId)
    selectMemoryCacheScope(this.databaseName, input.profileId)

    options.onPublishStage?.('snapshot-plan')
    const currentManifest = await this.getManifest(input.profileId, input.section)
    const currentByKey = new Map(
      (currentManifest?.categories ?? []).map((category) => [category.categoryKey, category]),
    )
    const writeEpoch = playbackEpoch
    const database = await this.database()
    const seenCategoryKeys = new Set<string>()
    const plans = input.snapshots.map((snapshot) => {
      const categoryKey = snapshot.categoryKey ?? snapshot.category.id

      if (seenCategoryKeys.has(categoryKey)) {
        throw new Error('A whole-section snapshot may contain each category only once.')
      }

      seenCategoryKeys.add(categoryKey)

      for (const item of snapshot.items) {
        if (item.section !== input.section) {
          throw new Error('A category snapshot cannot contain items from another section.')
        }
      }

      const currentCategory = currentByKey.get(categoryKey)
      const shards = buildCategorySnapshotShards(snapshot.items)
      const generation = Math.max(
        input.updatedAt ?? this.now(),
        (currentCategory?.updatedAt ?? 0) + 1,
      )
      const nextShardBase = nextSnapshotShardBase(currentCategory, shards.length)

      return {
        categoryKey,
        category: snapshot.category,
        items: snapshot.items,
        shards,
        currentCategory,
        generation,
        nextShardBase,
      }
    })

    options.onPublishStage?.('snapshot-write')
    for (const plan of plans) {
      for (let shardIndex = 0; shardIndex < plan.shards.length; shardIndex += 1) {
        assertCooperativeWriteAllowed(writeEpoch, options.signal)
        await assertSyncOwnership(database, input.profileId, input.runId)
        const shard = plan.shards[shardIndex]

        await putCooperativeRecord(
          database,
          'snapshots',
          {
            schemaVersion: LIBRARY_SCHEMA_VERSION,
            profileId: input.profileId,
            section: input.section,
            categoryKey: plan.categoryKey,
            shardIndex: plan.nextShardBase + shardIndex,
            payload: shard.payload,
            updatedAt: plan.generation,
            itemCount: shard.itemCount,
            byteEstimate: shard.byteEstimate,
          } satisfies SnapshotRecord,
          options.signal,
        )

        await (options.yieldControl ?? defaultYield)()
      }
    }

    assertCooperativeWriteAllowed(writeEpoch, options.signal)
    await assertSyncOwnership(database, input.profileId, input.runId)
    options.onPublishStage?.('manifest-build')
    let categories = currentManifest?.categories ?? []
    const entries = plans.map((plan) => {
      const entry: CategoryManifestEntry = {
        categoryKey: plan.categoryKey,
        categoryId: plan.category.id,
        name: plan.category.name,
        coverage: 'complete',
        shardCount: plan.shards.length,
        shardBase: plan.nextShardBase,
        itemCount: plan.items.length,
        byteEstimate: plan.shards.reduce((total, shard) => total + shard.byteEstimate, 0),
        updatedAt: plan.generation,
      }
      categories = upsertCategoryManifest(categories, entry)
      return entry
    })
    const updatedAt = Math.max(
      input.updatedAt ?? this.now(),
      currentManifest?.updatedAt ?? 0,
      ...entries.map((entry) => entry.updatedAt ?? 0),
    )

    options.onPublishStage?.('manifest-put')
    await putRecord(
      database,
      'manifests',
      createManifest(input.profileId, input.section, categories, updatedAt),
    )
    snapshotMemoryCache.clear()

    options.onPublishStage?.('cleanup')
    for (const plan of plans) {
      await pruneSurplusCategoryShards(
        database,
        input.profileId,
        input.section,
        plan.categoryKey,
        plan.shards.length,
        plan.currentCategory?.shardCount ?? 0,
        plan.currentCategory?.shardBase ?? 0,
        plan.nextShardBase,
        writeEpoch,
        options,
      )
    }

    options.onPublishStage?.('complete')
    return entries
  }

  async readCategoryShard(
    profileId: string,
    section: LibrarySection,
    categoryKey: string,
    shardIndex: number,
  ): Promise<CategoryShardReadResult> {
    selectMemoryCacheScope(this.databaseName, profileId)
    const manifest = await this.getManifest(profileId, section)

    if (!manifest) {
      return {
        coverage: 'none',
        items: [],
        reason: await this.isDatabaseAvailable()
          ? 'manifest-missing'
          : 'database-unavailable',
      }
    }

    const category = manifest.categories.find(
      (entry) => entry.categoryKey === categoryKey,
    )

    if (
      !category ||
      category.coverage !== 'complete' ||
      shardIndex < 0 ||
      shardIndex >= category.shardCount
    ) {
      return { coverage: 'none', items: [], reason: 'category-unavailable' }
    }

    const cacheKey = snapshotCacheKey(
      profileId,
      section,
      categoryKey,
      shardIndex,
      category.shardBase ?? 0,
      category.updatedAt ?? 0,
    )
    const cached = snapshotMemoryCache.get(cacheKey, this.now())

    if (cached) {
      return {
        coverage: 'complete',
        items: cached.items.slice(),
        shardIndex,
        shardCount: category.shardCount,
        itemCount: cached.itemCount,
        byteEstimate: cached.byteEstimate,
        updatedAt: cached.updatedAt,
      }
    }

    try {
      const record = await getRecord<unknown>(
        await this.database(),
        'snapshots',
        [profileId, section, categoryKey, (category.shardBase ?? 0) + shardIndex],
      )

      if (
        !isSnapshotRecord(
          record,
          profileId,
          section,
          categoryKey,
          (category.shardBase ?? 0) + shardIndex,
        )
      ) {
        return { coverage: 'none', items: [], reason: 'snapshot-missing' }
      }

      if (record.updatedAt !== category.updatedAt) {
        return { coverage: 'none', items: [], reason: 'snapshot-missing' }
      }

      const items = parseSnapshotItems(record)

      if (!items) {
        return { coverage: 'none', items: [], reason: 'snapshot-invalid' }
      }

      const cacheValue: SnapshotCacheValue = {
        items,
        itemCount: record.itemCount,
        byteEstimate: record.byteEstimate,
        updatedAt: record.updatedAt,
      }
      snapshotMemoryCache.set(cacheKey, cacheValue, this.now())

      return {
        coverage: 'complete',
        items: items.slice(),
        shardIndex,
        shardCount: category.shardCount,
        itemCount: record.itemCount,
        byteEstimate: record.byteEstimate,
        updatedAt: record.updatedAt,
      }
    } catch {
      return {
        coverage: 'none',
        items: [],
        reason: 'database-unavailable',
      }
    }
  }

  async readCompleteSectionCategories(
    profileId: string,
    section: LibrarySection,
  ): Promise<CompleteSectionCategoriesResult> {
    const manifest = await this.getManifest(profileId, section)

    if (!manifest) {
      return {
        coverage: 'none',
        categories: [],
        reason: await this.isDatabaseAvailable()
          ? 'manifest-missing'
          : 'database-unavailable',
      }
    }

    if (
      manifest.coverage.state !== 'complete' ||
      manifest.categories.some((category) => category.coverage !== 'complete')
    ) {
      return { coverage: 'none', categories: [], reason: 'section-incomplete' }
    }

    return {
      coverage: 'complete',
      categories: manifest.categories.map((category) => ({
        id: category.categoryId,
        name: category.name,
      })),
    }
  }

  async readCompleteCategory(
    profileId: string,
    section: LibrarySection,
    categoryId: string,
  ): Promise<CompleteCategoryReadResult> {
    const sectionCategories = await this.readCompleteSectionCategories(profileId, section)

    if (sectionCategories.coverage === 'none') {
      return { coverage: 'none', items: [], reason: sectionCategories.reason }
    }

    const manifest = await this.getManifest(profileId, section)
    const category = manifest?.categories.find((entry) => entry.categoryKey === categoryId)

    if (!category || category.coverage !== 'complete') {
      return { coverage: 'none', items: [], reason: 'category-unavailable' }
    }

    const items: StreamItem[] = []

    for (let shardIndex = 0; shardIndex < category.shardCount; shardIndex += 1) {
      const shard = await this.readCategoryShard(profileId, section, categoryId, shardIndex)

      if (shard.coverage === 'none') {
        return shard
      }

      items.push(...shard.items)
    }

    return { coverage: 'complete', items }
  }

  async getSearchIndexMeta(
    profileId: string,
    section: LibrarySection,
  ): Promise<SearchIndexMetaRecord | null> {
    try {
      const record = await getRecord<unknown>(
        await this.database(),
        'searchIndexMeta',
        [profileId, section],
      )
      return isSearchIndexMetaRecord(record, profileId, section) ? record : null
    } catch {
      return null
    }
  }

  async rebuildSearchIndexes(
    profileId: string,
    sections: readonly LibrarySection[] = ['live', 'vod', 'series'],
    signal?: AbortSignal,
  ): Promise<SearchIndexBuildResult[]> {
    const results: SearchIndexBuildResult[] = []

    for (const section of sections) {
      if (signal?.aborted) {
        break
      }

      const key = `${profileId}\u0000${section}`
      let build = this.searchIndexBuilds.get(key)

      if (!build) {
        build = this.rebuildSearchIndex(profileId, section, signal)
        this.searchIndexBuilds.set(key, build)
        void build.then(
          () => this.searchIndexBuilds.delete(key),
          () => this.searchIndexBuilds.delete(key),
        )
      }

      results.push(await build)
      await defaultYield()
    }

    return results
  }

  async searchCompleteSection(
    profileId: string,
    section: LibrarySection,
    query: string,
    resultLimit: number,
    options: SectionSearchOptions = {},
  ): Promise<SectionSearchResult> {
    const startedAt = monotonicNow()
    const report = (result: SectionSearchResult, postingCount = 0): SectionSearchResult => {
      performanceTrace.event('library', 'local-section-index-search-result', {
        section,
        coverage: result.coverage,
        reason: result.coverage === 'none' ? result.reason : null,
        postingCount,
        elapsedMs: monotonicNow() - startedAt,
      })
      return result
    }
    const manifest = await this.getManifest(profileId, section)

    if (!manifest) {
      return report({
        coverage: 'none',
        matches: [],
        reason: await this.isDatabaseAvailable()
          ? 'manifest-missing'
          : 'database-unavailable',
      })
    }

    if (
      manifest.coverage.state !== 'complete' ||
      manifest.categories.some((category) => category.coverage !== 'complete')
    ) {
      return report({ coverage: 'none', matches: [], reason: 'section-incomplete' })
    }

    const index = await this.ensureSearchIndex(profileId, section, manifest, options.signal)

    if (index.coverage === 'none') {
      return report({ coverage: 'none', matches: [], reason: index.reason })
    }

    const tokens = queryTokens(query)
    const prefixes = tokens
      .map(searchIndexPrefixForToken)
      .filter((prefix): prefix is string => prefix !== null)

    if (!prefixes.length) {
      return report({ coverage: 'complete', matches: [], limited: false })
    }

    const candidatePrefix = prefixes.reduce((best, prefix) => {
      const bestCount = index.prefixPostingCounts[best] ?? Number.MAX_SAFE_INTEGER
      const prefixCount = index.prefixPostingCounts[prefix] ?? 0
      return prefixCount < bestCount ? prefix : best
    })

    if (
      (index.prefixPostingCounts[candidatePrefix] ?? 0) === 0 ||
      (index.prefixShardCounts[candidatePrefix] ?? 0) === 0
    ) {
      return report({ coverage: 'complete', matches: [], limited: false })
    }

    let entries: SearchIndexPosting[]

    try {
      entries = await readSearchIndexPostings(
        await this.database(),
        profileId,
        section,
        index.generation,
        candidatePrefix,
        index.prefixShardCounts[candidatePrefix] ?? 0,
      )
    } catch {
      return report({ coverage: 'none', matches: [], reason: 'database-unavailable' })
    }

    const safeLimit = positiveInteger(resultLimit, 60)
    const matches: StreamItem[] = []
    const seen = new Set<string>()
    let matchedCount = 0

    for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
      if (options.signal?.aborted) {
        return report({ coverage: 'none', matches: [], reason: 'index-unavailable' }, entries.length)
      }

      const entry = entries[entryIndex]

      if (
        !isSearchIndexPosting(entry) ||
        !matchesQuery(entry[5], tokens) ||
        seen.has(entry[4])
      ) {
        continue
      }

      seen.add(entry[4])
      matchedCount += 1

      if (matches.length < safeLimit) {
        const stream = await this.resolveSearchIndexPosting(
          profileId,
          section,
          manifest,
          entry,
        )

        if (!stream) {
          return report({ coverage: 'none', matches: [], reason: 'index-invalid' }, entries.length)
        }

        matches.push(stream)

        if (matches.length % 8 === 0 || matches.length === safeLimit) {
          await options.onMatches?.({
            matches: matches.slice(),
            matchedCount,
            postingCount: entries.length,
          })
        }
      }

      if (matches.length >= safeLimit && matchedCount > safeLimit) {
        break
      }

      if (entryIndex % 64 === 63) {
        await defaultYield()
      }
    }

    if (matches.length) {
      await options.onMatches?.({
        matches: matches.slice(),
        matchedCount,
        postingCount: entries.length,
      })
    }

    return report(
      {
        coverage: 'complete',
        matches,
        limited: matchedCount > safeLimit,
      },
      entries.length,
    )
  }

  private async ensureSearchIndex(
    profileId: string,
    section: LibrarySection,
    manifest: SectionManifestRecord,
    _signal?: AbortSignal,
  ): Promise<
    | {
        coverage: 'complete'
        generation: number
        prefixPostingCounts: Record<string, number>
        prefixShardCounts: Record<string, number>
      }
    | {
        coverage: 'none'
        reason: SearchIndexUnavailableReason
      }
  > {
    const current = await this.getSearchIndexMeta(profileId, section)

    if (
      current?.coverage === 'complete' &&
      current.formatVersion === SEARCH_INDEX_FORMAT_VERSION &&
      current.generation === manifest.updatedAt
    ) {
      return {
        coverage: 'complete',
        generation: current.generation,
        prefixPostingCounts: current.prefixPostingCounts,
        prefixShardCounts: current.prefixShardCounts,
      }
    }

    /*
     * A query must never initiate a whole-catalog scan. The coordinator builds
     * indexes after accepted snapshot publication; startup runs the one-time
     * migration for legacy snapshots. Until then the section is honestly
     * unavailable instead of quietly falling back to the old full scan.
     */
    return { coverage: 'none', reason: 'index-unavailable' }
  }

  private async rebuildSearchIndex(
    profileId: string,
    section: LibrarySection,
    signal?: AbortSignal,
    knownManifest?: SectionManifestRecord,
  ): Promise<SearchIndexBuildResult> {
    const startedAt = monotonicNow()
    const manifest = knownManifest ?? await this.getManifest(profileId, section)
    const unavailable = (reason: SearchIndexUnavailableReason): SearchIndexBuildResult => {
      const result = {
        coverage: 'none' as const,
        reason,
        elapsedMs: monotonicNow() - startedAt,
      }
      performanceTrace.event('library', 'local-search-index-build', {
        section,
        coverage: result.coverage,
        reason,
        elapsedMs: result.elapsedMs,
      })
      return result
    }

    if (!manifest) {
      return unavailable(
        await this.isDatabaseAvailable() ? 'manifest-missing' : 'database-unavailable',
      )
    }

    if (
      manifest.coverage.state !== 'complete' ||
      manifest.categories.some((category) => category.coverage !== 'complete')
    ) {
      return unavailable('section-incomplete')
    }

    const currentIndex = await this.getSearchIndexMeta(profileId, section)

    if (
      currentIndex?.coverage === 'complete' &&
      currentIndex.formatVersion === SEARCH_INDEX_FORMAT_VERSION &&
      currentIndex.generation === manifest.updatedAt
    ) {
      const result: SearchIndexBuildResult = {
        coverage: 'complete',
        generation: currentIndex.generation,
        itemCount: currentIndex.itemCount,
        postingCount: currentIndex.postingCount,
        legacyUntitledCount: currentIndex.legacyUntitledCount,
        prefixPostingCounts: currentIndex.prefixPostingCounts,
        prefixShardCounts: currentIndex.prefixShardCounts,
        elapsedMs: monotonicNow() - startedAt,
      }
      performanceTrace.event('library', 'local-search-index-build', {
        section,
        coverage: result.coverage,
        itemCount: result.itemCount,
        postingCount: result.postingCount,
        legacyUntitledCount: result.legacyUntitledCount,
        reused: true,
        elapsedMs: result.elapsedMs,
      })
      return result
    }

    const database = await this.database()
    const generation = manifest.updatedAt
    const pendingByPrefix = new Map<string, SearchIndexPosting[]>()
    const nextShardByPrefix = new Map<string, number>()
    const prefixPostingCounts: Record<string, number> = {}
    const prefixShardCounts: Record<string, number> = {}
    let bufferedPostingCount = 0
    let itemCount = 0
    let postingCount = 0
    let legacyUntitledCount = 0

    await putRecord(database, 'searchIndexMeta', {
      schemaVersion: LIBRARY_SCHEMA_VERSION,
      profileId,
      section,
      formatVersion: SEARCH_INDEX_FORMAT_VERSION,
      coverage: 'none',
      updatedAt: this.now(),
      itemCount: 0,
      postingCount: 0,
      legacyUntitledCount: 0,
      prefixPostingCounts: {},
      prefixShardCounts: {},
    } satisfies SearchIndexMetaRecord)

    /*
     * Index keys include the manifest generation, so stale postings are
     * unreachable once the replacement meta is published. Do not cursor-delete
     * every historic shard before a migration: on webOS that local cleanup can
     * take longer than rebuilding the index itself. The current generation
     * overwrites matching keys; any unmatched stale records remain inert.
     */
    const takePrefixShard = (prefix: string): SearchIndexShardRecord | null => {
      const pending = pendingByPrefix.get(prefix)

      if (!pending?.length) {
        return null
      }

      if (signal?.aborted) {
        throw new LibraryWriteAbortedError('Local search-index build was cancelled.')
      }

      const shardIndex = nextShardByPrefix.get(prefix) ?? 0
      const postings = pending.splice(0, SEARCH_INDEX_POSTINGS_PER_SHARD)
      bufferedPostingCount -= postings.length
      nextShardByPrefix.set(prefix, shardIndex + 1)
      prefixShardCounts[prefix] = shardIndex + 1

      return {
        schemaVersion: LIBRARY_SCHEMA_VERSION,
        profileId,
        section,
        generation,
        prefix,
        shardIndex,
        payload: JSON.stringify(postings),
        entryCount: postings.length,
      }
    }

    const flushReadyPrefixes = async (force = false): Promise<void> => {
      let candidates = [...pendingByPrefix.entries()]
        .filter(
          ([, postings]) =>
            postings.length > 0 &&
            (force || postings.length >= SEARCH_INDEX_POSTINGS_PER_SHARD),
        )
        .sort((left, right) => right[1].length - left[1].length)

      while (candidates.length) {
        for (let start = 0; start < candidates.length; start += SEARCH_INDEX_WRITE_RECORD_BATCH_SIZE) {
          const batch = candidates
            .slice(start, start + SEARCH_INDEX_WRITE_RECORD_BATCH_SIZE)
            .map(([prefix]) => takePrefixShard(prefix))
            .filter((shard): shard is SearchIndexShardRecord => shard !== null)
          await putSearchIndexShardBatch(database, batch)
          await defaultYield()
        }

        candidates = [...pendingByPrefix.entries()]
          .filter(
            ([, postings]) =>
              postings.length > 0 &&
              (force || postings.length >= SEARCH_INDEX_POSTINGS_PER_SHARD),
          )
          .sort((left, right) => right[1].length - left[1].length)
      }
    }

    try {
      for (const category of manifest.categories) {
        for (let shardOffset = 0; shardOffset < category.shardCount; shardOffset += 1) {
          if (signal?.aborted) {
            return unavailable('index-unavailable')
          }

          const snapshotShardIndex = (category.shardBase ?? 0) + shardOffset
          const record = await getRecord<unknown>(
            database,
            'snapshots',
            [profileId, section, category.categoryKey, snapshotShardIndex],
          )

          if (
            !isSnapshotRecord(
              record,
              profileId,
              section,
              category.categoryKey,
              snapshotShardIndex,
            ) ||
            record.updatedAt !== category.updatedAt
          ) {
            return unavailable('snapshot-missing')
          }

          const items = parseSnapshotItems(record)
          const missingNameCount = countLegacyMissingNames(record)

          if (!items || missingNameCount === null) {
            return unavailable('snapshot-invalid')
          }

          legacyUntitledCount += missingNameCount

          for (let snapshotItemIndex = 0; snapshotItemIndex < items.length; snapshotItemIndex += 1) {
            const item = items[snapshotItemIndex]
            const foldedName = item.searchName ?? foldText(item.name)
            const prefixes = searchIndexPrefixes(foldedName)

            itemCount += 1
            postingCount += prefixes.length

            for (const prefix of prefixes) {
              prefixPostingCounts[prefix] = (prefixPostingCounts[prefix] ?? 0) + 1
            }

            for (const prefix of prefixes) {
              const pending = pendingByPrefix.get(prefix) ?? []
              pending.push([
                category.categoryKey,
                snapshotShardIndex,
                snapshotItemIndex,
                record.updatedAt,
                favoriteKey(item),
                foldedName,
              ])
              pendingByPrefix.set(prefix, pending)
              bufferedPostingCount += 1
            }

          }

          /*
           * Prefix flushing is deliberately batched at the snapshot boundary.
           * Evaluating every prefix after each individual item turns a VOD
           * migration into an accidental quadratic main-thread workload.
           */
          if (bufferedPostingCount >= MAX_SEARCH_INDEX_BUFFERED_POSTINGS) {
            await flushReadyPrefixes(true)
          } else {
            await flushReadyPrefixes()
          }
        }
      }

      await flushReadyPrefixes(true)
      const currentManifest = await this.getManifest(profileId, section)

      if (
        !currentManifest ||
        currentManifest.updatedAt !== generation ||
        currentManifest.coverage.state !== 'complete' ||
        currentManifest.categories.some((category) => category.coverage !== 'complete')
      ) {
        return unavailable('index-invalid')
      }

      const completedAt = this.now()
      await putRecord(database, 'searchIndexMeta', {
        schemaVersion: LIBRARY_SCHEMA_VERSION,
        profileId,
        section,
        formatVersion: SEARCH_INDEX_FORMAT_VERSION,
        coverage: 'complete',
        generation,
        updatedAt: completedAt,
        itemCount,
        postingCount,
        legacyUntitledCount,
        prefixPostingCounts,
        prefixShardCounts,
      } satisfies SearchIndexMetaRecord)

      const result: SearchIndexBuildResult = {
        coverage: 'complete',
        generation,
        itemCount,
        postingCount,
        legacyUntitledCount,
        prefixPostingCounts,
        prefixShardCounts,
        elapsedMs: monotonicNow() - startedAt,
      }
      performanceTrace.event('library', 'local-search-index-build', {
        section,
        coverage: result.coverage,
        itemCount,
        postingCount,
        legacyUntitledCount,
        elapsedMs: result.elapsedMs,
      })
      return result
    } catch (reason) {
      if (reason instanceof LibraryWriteAbortedError) {
        return unavailable('index-unavailable')
      }

      return unavailable('database-unavailable')
    }
  }

  private async resolveSearchIndexPosting(
    profileId: string,
    section: LibrarySection,
    manifest: SectionManifestRecord,
    posting: SearchIndexPosting,
  ): Promise<StreamItem | null> {
    const [categoryKey, snapshotShardIndex, snapshotItemIndex, snapshotUpdatedAt, streamKey] =
      posting
    const category = manifest.categories.find(
      (candidate) => candidate.categoryKey === categoryKey,
    )
    const shardOffset = snapshotShardIndex - (category?.shardBase ?? 0)

    if (
      !category ||
      shardOffset < 0 ||
      shardOffset >= category.shardCount ||
      category.updatedAt !== snapshotUpdatedAt
    ) {
      return null
    }

    const shard = await this.readCategoryShard(
      profileId,
      section,
      category.categoryKey,
      shardOffset,
    )

    if (shard.coverage === 'none') {
      return null
    }

    const item = shard.items[snapshotItemIndex]

    return item && favoriteKey(item) === streamKey ? item : null
  }

  async searchCompleteSectionLegacy(
    profileId: string,
    section: LibrarySection,
    query: string,
    resultLimit: number,
  ): Promise<SectionSearchResult> {
    const startedAt = monotonicNow()
    const reportOutcome = (
      result: SectionSearchResult,
      expectedSnapshotCount = 0,
      seenSnapshotCount = 0,
      invalid = false,
    ): SectionSearchResult => {
      performanceTrace.event('library', 'local-section-search-result', {
        section,
        coverage: result.coverage,
        reason: result.coverage === 'none' ? result.reason : null,
        expectedSnapshotCount,
        seenSnapshotCount,
        invalid,
        elapsedMs: monotonicNow() - startedAt,
      })
      return result
    }
    const manifest = await this.getManifest(profileId, section)

    if (!manifest) {
      return reportOutcome({
        coverage: 'none',
        matches: [],
        reason: await this.isDatabaseAvailable()
          ? 'manifest-missing'
          : 'database-unavailable',
      })
    }

    if (
      manifest.coverage.state !== 'complete' ||
      manifest.categories.some((category) => category.coverage !== 'complete')
    ) {
      return reportOutcome({
        coverage: 'none',
        matches: [],
        reason: 'section-incomplete',
      })
    }

    const expected = new Map<string, CategoryManifestEntry>()
    for (const category of manifest.categories) {
      for (let shardIndex = 0; shardIndex < category.shardCount; shardIndex += 1) {
        expected.set(
          snapshotReadKey(
            category.categoryKey,
            (category.shardBase ?? 0) + shardIndex,
          ),
          category,
        )
      }
    }

    const tokens = queryTokens(query)
    const safeLimit = positiveInteger(resultLimit, 60)
    const matches: StreamItem[] = []
    const seen = new Set<string>()
    let afterKey: IDBValidKey | undefined
    let exhausted = false
    let invalid = false
    let limited = false

    while (!exhausted) {
      const database = await this.database()
      const batch = await new Promise<{
        exhausted: boolean
        lastKey?: IDBValidKey
      }>((resolve, reject) => {
        const transaction = database.transaction('snapshots', 'readonly')
        const store = transaction.objectStore('snapshots')
        const request = store.openCursor(
          afterKey === undefined ? undefined : IDBKeyRange.lowerBound(afterKey, true),
        )
        let processed = 0
        let lastKey: IDBValidKey | undefined
        let resolved = false

        const resolveOnce = (value: { exhausted: boolean; lastKey?: IDBValidKey }): void => {
          if (!resolved) {
            resolved = true
            resolve(value)
          }
        }

        request.onerror = () =>
          reject(request.error ?? new Error('Unable to scan local library snapshots.'))
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('Local library scan failed.'))
        transaction.onabort = () =>
          reject(transaction.error ?? new Error('Local library scan was aborted.'))
        request.onsuccess = () => {
          const cursor = request.result

          if (!cursor) {
            resolveOnce({ exhausted: true, lastKey })
            return
          }

          lastKey = cursor.key
          const value = cursor.value as unknown
          const record = isRecord(value) ? value : null
          const categoryKey =
            record && typeof record.categoryKey === 'string' ? record.categoryKey : null
          const shardIndex =
            record && typeof record.shardIndex === 'number' ? record.shardIndex : null
          const key =
            categoryKey !== null && shardIndex !== null
              ? snapshotReadKey(categoryKey, shardIndex)
              : null
          const category = key ? expected.get(key) : undefined

          if (
            category &&
            key &&
            isSnapshotRecord(value, profileId, section, category.categoryKey, shardIndex!) &&
            value.updatedAt === category.updatedAt
          ) {
            if (expected.has(key)) {
              const items = parseSnapshotItems(value)

              if (!items) {
                invalid = true
                resolveOnce({ exhausted: true, lastKey })
                return
              }

              seen.add(key)

              for (const item of items) {
                if (!matchesQuery(item.searchName ?? foldText(item.name), tokens)) {
                  continue
                }

                if (matches.length < safeLimit) {
                  matches.push(item)
                } else {
                  limited = true
                }
              }
            }
          }

          processed += 1

          if (processed >= 12) {
            resolveOnce({ exhausted: false, lastKey })
            return
          }

          cursor.continue()
        }
      })

      exhausted = batch.exhausted
      afterKey = batch.lastKey
      await defaultYield()
    }

    if (invalid) {
      return reportOutcome(
        { coverage: 'none', matches: [], reason: 'snapshot-invalid' },
        expected.size,
        seen.size,
        true,
      )
    }

    if (seen.size !== expected.size) {
      return reportOutcome(
        { coverage: 'none', matches: [], reason: 'snapshot-missing' },
        expected.size,
        seen.size,
      )
    }

    return reportOutcome(
      {
        coverage: 'complete',
        matches,
        limited,
      },
      expected.size,
      seen.size,
    )
  }

  async replaceSearchShards(
    profileId: string,
    items: readonly StreamItem[],
    options: CooperativeWriteOptions = {},
  ): Promise<number> {
    assertProfileId(profileId)
    selectMemoryCacheScope(this.databaseName, profileId)
    const shards = buildSearchShards(items)
    const currentMeta = await this.getMeta(profileId)
    const generation = Math.max(
      this.now(),
      (currentMeta?.searchUpdatedAt ?? 0) + 1,
    )
    const writeEpoch = playbackEpoch
    const database = await this.database()

    assertCooperativeWriteAllowed(writeEpoch, options.signal)
    await this.putMeta(profileId, {
      searchCoverage: 'none',
      searchShardCount: 0,
      searchUpdatedAt: undefined,
    })
    await (options.yieldControl ?? defaultYield)()

    for (let shardIndex = 0; shardIndex < shards.length; shardIndex += 1) {
      assertCooperativeWriteAllowed(writeEpoch, options.signal)
      const payload = JSON.stringify(shards[shardIndex])
      const eventLoopTurn = nextEventLoopTurn()
      const startedAt = monotonicNow()

      await putCooperativeRecord(
        database,
        'searchShards',
        {
          schemaVersion: LIBRARY_SCHEMA_VERSION,
          profileId,
          shardIndex,
          payload,
          updatedAt: generation,
          entryCount: shards[shardIndex].length,
          byteEstimate: utf8ByteLength(payload),
        } satisfies SearchShardRecord,
        options.signal,
      )

      const durationMs = monotonicNow() - startedAt
      const eventLoopTurnMs = await eventLoopTurn
      options.onSnapshotPut?.({
        durationMs,
        eventLoopTurnMs,
        byteEstimate: utf8ByteLength(payload),
        itemCount: shards[shardIndex].length,
      })
      await (options.yieldControl ?? defaultYield)()
    }

    assertCooperativeWriteAllowed(writeEpoch, options.signal)
    await this.putMeta(profileId, {
      searchCoverage: 'complete',
      searchShardCount: shards.length,
      searchUpdatedAt: generation,
    })
    await pruneSurplusSearchShards(
      database,
      profileId,
      shards.length,
      currentMeta?.searchShardCount ?? 0,
      writeEpoch,
      options,
    )
    searchMemoryCache.clear()
    return shards.length
  }

  async search(profileId: string, query: string): Promise<SearchQueryResult> {
    selectMemoryCacheScope(this.databaseName, profileId)
    const loaded = await this.loadSearchShards(profileId)

    if (loaded.coverage === 'none') {
      return loaded
    }

    const tokens = queryTokens(query)
    const matches: SearchTuple[] = []

    for (const shard of loaded.shards) {
      for (const tuple of shard) {
        if (matchesQuery(tuple[1], tokens)) {
          matches.push(tuple)
        }
      }
    }

    return { coverage: 'complete', matches }
  }

  async putDetails<T extends LibraryDetails>(
    profileId: string,
    kind: LibraryDetailKind,
    id: string,
    value: T,
    ttlMs: number,
  ): Promise<void> {
    const updatedAt = this.now()
    await putRecord(await this.database(), 'details', {
      schemaVersion: LIBRARY_SCHEMA_VERSION,
      profileId,
      kind,
      id,
      value: toCachedDetails(value),
      updatedAt,
      expiresAt: updatedAt + Math.max(0, ttlMs),
    } satisfies DetailRecord<T>)
  }

  async getDetails<T extends LibraryDetails>(
    profileId: string,
    kind: LibraryDetailKind,
    id: string,
  ): Promise<T | null> {
    try {
      const database = await this.database()
      const record = await getRecord<unknown>(
        database,
        'details',
        [profileId, kind, id],
      )

      if (!isDetailRecord(record, profileId, kind, id)) {
        return null
      }

      if (record.expiresAt <= this.now()) {
        await deleteRecord(database, 'details', [profileId, kind, id])
        return null
      }

      return record.value as T
    } catch {
      return null
    }
  }

  async putEpg(
    profileId: string,
    streamId: string,
    value: NowNext,
    ttlMs: number,
  ): Promise<void> {
    const updatedAt = this.now()
    await putRecord(await this.database(), 'epg', {
      schemaVersion: LIBRARY_SCHEMA_VERSION,
      profileId,
      streamId,
      value,
      updatedAt,
      expiresAt: updatedAt + Math.max(0, ttlMs),
    } satisfies EpgRecord)
  }

  async getEpg(profileId: string, streamId: string): Promise<NowNext | null> {
    try {
      const database = await this.database()
      const record = await getRecord<unknown>(
        database,
        'epg',
        [profileId, streamId],
      )

      if (!isEpgRecord(record, profileId, streamId)) {
        return null
      }

      if (record.expiresAt <= this.now()) {
        await deleteRecord(database, 'epg', [profileId, streamId])
        return null
      }

      return record.value
    } catch {
      return null
    }
  }

  async deleteProfileCache(profileId: string): Promise<void> {
    const database = await this.database()
    const transaction = database.transaction([...LIBRARY_STORE_NAMES], 'readwrite')
    const complete = transactionComplete(transaction)
    transaction.objectStore('meta').delete(profileId)

    const deletions = LIBRARY_STORE_NAMES.filter(
      (storeName) => storeName !== 'meta',
    ).map((storeName) =>
      deleteProfileRows(transaction.objectStore(storeName), profileId),
    )

    await Promise.all(deletions)
    await complete
    clearLibraryMemoryCachesForScope(this.databaseName, profileId)
  }

  private async loadSearchShards(
    profileId: string,
  ): Promise<
    | { coverage: 'complete'; shards: SearchTuple[][] }
    | {
        coverage: 'none'
        matches: []
        reason: 'database-unavailable' | 'index-unavailable' | 'shard-missing' | 'shard-invalid'
      }
  > {
    const meta = await this.getMeta(profileId)

    if (!meta) {
      return {
        coverage: 'none',
        matches: [],
        reason: await this.isDatabaseAvailable()
          ? 'index-unavailable'
          : 'database-unavailable',
      }
    }

    if (
      meta.searchCoverage !== 'complete' ||
      meta.searchUpdatedAt === undefined
    ) {
      return { coverage: 'none', matches: [], reason: 'index-unavailable' }
    }

    const cacheScope = memoryCacheScope(this.databaseName, profileId)
    const cached = searchMemoryCache.get(cacheScope, this.now())

    if (cached?.updatedAt === meta.searchUpdatedAt) {
      return { coverage: 'complete', shards: cached.shards }
    }

    try {
      const database = await this.database()
      const shards: SearchTuple[][] = []

      for (let shardIndex = 0; shardIndex < meta.searchShardCount; shardIndex += 1) {
        const record = await getRecord<unknown>(
          database,
          'searchShards',
          [profileId, shardIndex],
        )

        if (
          !isSearchShardRecord(record, profileId, shardIndex) ||
          record.updatedAt !== meta.searchUpdatedAt
        ) {
          return { coverage: 'none', matches: [], reason: 'shard-missing' }
        }

        const tuples = parseSearchTuples(record)

        if (!tuples) {
          return { coverage: 'none', matches: [], reason: 'shard-invalid' }
        }

        shards.push(tuples)
      }

      searchMemoryCache.set(
        cacheScope,
        { updatedAt: meta.searchUpdatedAt, shards },
        this.now(),
      )
      return { coverage: 'complete', shards }
    } catch {
      return {
        coverage: 'none',
        matches: [],
        reason: 'database-unavailable',
      }
    }
  }

  private async isDatabaseAvailable(): Promise<boolean> {
    try {
      await this.database()
      return true
    } catch {
      return false
    }
  }

  private database(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = openLibraryDatabase(this.databaseName)
    }

    return this.databasePromise
  }
}

function createStore(
  database: IDBDatabase,
  name: LibraryStoreName,
  keyPath: string | string[],
): void {
  if (!database.objectStoreNames.contains(name)) {
    database.createObjectStore(name, { keyPath })
  }
}

function searchIndexPrefixes(value: string): string[] {
  const prefixes = new Set<string>()
  const words = foldText(value).match(/[a-z0-9]{2,}/g) ?? []

  for (const word of words) {
    const prefix = searchIndexPrefixForToken(word)

    if (prefix) {
      prefixes.add(prefix)
    }
  }

  return [...prefixes]
}

function searchIndexPrefixForToken(token: string): string | null {
  const folded = foldText(token)
  const match = folded.match(/[a-z0-9]{2,}/)

  if (!match) {
    return null
  }

  return match[0].slice(0, Math.min(3, match[0].length))
}

async function putSearchIndexShardBatch(
  database: IDBDatabase,
  shards: readonly SearchIndexShardRecord[],
): Promise<void> {
  if (!shards.length) {
    return
  }

  const transaction = database.transaction('searchIndexShards', 'readwrite')
  const complete = transactionComplete(transaction)
  const store = transaction.objectStore('searchIndexShards')

  for (const shard of shards) {
    store.put(shard)
  }

  await complete
}

async function readSearchIndexPostings(
  database: IDBDatabase,
  profileId: string,
  section: LibrarySection,
  generation: number,
  prefix: string,
  shardCount: number,
): Promise<SearchIndexPosting[]> {
  const postings: SearchIndexPosting[] = []

  for (let shardIndex = 0; shardIndex < shardCount; shardIndex += 1) {
    const record = await getRecord<unknown>(
      database,
      'searchIndexShards',
      [profileId, section, generation, prefix, shardIndex],
    )

    if (!isSearchIndexShardRecord(record, profileId, section, generation, prefix, shardIndex)) {
      throw new Error('Local search index shard is unavailable.')
    }

    const parsed = parseSearchIndexPostings(record)

    if (!parsed) {
      throw new Error('Local search index shard is invalid.')
    }

    postings.push(...parsed)
  }

  return postings
}

function countLegacyMissingNames(record: SnapshotRecord): number | null {
  try {
    const parsed = JSON.parse(record.payload) as unknown

    if (!Array.isArray(parsed) || parsed.length !== record.itemCount) {
      return null
    }

    let count = 0

    for (const value of parsed) {
      if (!isRecord(value)) {
        return null
      }

      if (typeof value.name !== 'string') {
        count += 1
      }
    }

    return count
  } catch {
    return null
  }
}

function isSearchIndexMetaRecord(
  value: unknown,
  profileId: string,
  section: LibrarySection,
): value is SearchIndexMetaRecord {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.schemaVersion === LIBRARY_SCHEMA_VERSION &&
    value.profileId === profileId &&
    value.section === section &&
    isNonNegativeInteger(value.formatVersion) &&
    isCoverage(value.coverage) &&
    (value.generation === undefined || isFiniteNumber(value.generation)) &&
    isFiniteNumber(value.updatedAt) &&
    isNonNegativeInteger(value.itemCount) &&
    isNonNegativeInteger(value.postingCount) &&
    isNonNegativeInteger(value.legacyUntitledCount) &&
    isRecord(value.prefixPostingCounts) &&
    Object.values(value.prefixPostingCounts).every(isNonNegativeInteger) &&
    isRecord(value.prefixShardCounts) &&
    Object.values(value.prefixShardCounts).every(isNonNegativeInteger)
  )
}

function isSearchIndexShardRecord(
  value: unknown,
  profileId: string,
  section: LibrarySection,
  generation: number,
  prefix: string,
  shardIndex: number,
): value is SearchIndexShardRecord {
  return (
    isRecord(value) &&
    value.schemaVersion === LIBRARY_SCHEMA_VERSION &&
    value.profileId === profileId &&
    value.section === section &&
    value.generation === generation &&
    value.prefix === prefix &&
    value.shardIndex === shardIndex &&
    typeof value.payload === 'string' &&
    isNonNegativeInteger(value.entryCount)
  )
}

function parseSearchIndexPostings(record: SearchIndexShardRecord): SearchIndexPosting[] | null {
  try {
    const parsed = JSON.parse(record.payload) as unknown

    if (!Array.isArray(parsed) || parsed.length !== record.entryCount) {
      return null
    }

    return parsed.every(isSearchIndexPosting) ? parsed as SearchIndexPosting[] : null
  } catch {
    return null
  }
}

function isSearchIndexPosting(value: unknown): value is SearchIndexPosting {
  return (
    Array.isArray(value) &&
    value.length === 6 &&
    typeof value[0] === 'string' &&
    isNonNegativeInteger(value[1]) &&
    isNonNegativeInteger(value[2]) &&
    isFiniteNumber(value[3]) &&
    typeof value[4] === 'string' &&
    typeof value[5] === 'string'
  )
}

function isLibraryStoreName(value: string): value is LibraryStoreName {
  return (LIBRARY_STORE_NAMES as readonly string[]).includes(value)
}

function objectStoreNames(database: IDBDatabase): string[] {
  const names: string[] = []

  for (let index = 0; index < database.objectStoreNames.length; index += 1) {
    const name = database.objectStoreNames.item(index)

    if (name !== null) {
      names.push(name)
    }
  }

  return names.sort()
}

function selectMemoryCacheScope(databaseName: string, profileId: string): void {
  const scope = memoryCacheScope(databaseName, profileId)

  if (activeCacheScope === scope) {
    return
  }

  snapshotMemoryCache.clear()
  searchMemoryCache.clear()
  activeCacheScope = scope
}

function clearLibraryMemoryCachesForScope(databaseName: string, profileId: string): void {
  if (activeCacheScope !== memoryCacheScope(databaseName, profileId)) {
    return
  }

  clearLibraryMemoryCaches()
}

function memoryCacheScope(databaseName: string, profileId: string): string {
  return `${databaseName}\u0000${profileId}`
}

function snapshotReadKey(categoryKey: string, shardIndex: number): string {
  return `${categoryKey}\u0000${shardIndex}`
}

function snapshotCacheKey(
  profileId: string,
  section: LibrarySection,
  categoryKey: string,
  shardIndex: number,
  shardBase: number,
  updatedAt: number,
): string {
  return `${activeCacheScope ?? ''}\u0000${profileId}\u0000${section}\u0000${categoryKey}\u0000${shardBase}\u0000${shardIndex}\u0000${updatedAt}`
}

function normalizeSyncState(state: LibrarySyncState): LibrarySyncState {
  return {
    ...state,
    failureCount: state.failureCount ?? 0,
    sections: state.sections ?? {},
  }
}

function defaultMeta(profileId: string): LibraryMetaRecord {
  return {
    schemaVersion: LIBRARY_SCHEMA_VERSION,
    profileId,
    sync: {
      inProgress: false,
      failureCount: 0,
      sections: {},
    },
    searchCoverage: 'none',
    searchShardCount: 0,
  }
}

function emptyCategoryManifest(category: Category): CategoryManifestEntry {
  return {
    categoryKey: category.id,
    categoryId: category.id,
    name: category.name,
    coverage: 'none',
    shardCount: 0,
    shardBase: undefined,
    itemCount: 0,
    byteEstimate: 0,
  }
}

function createManifest(
  profileId: string,
  section: LibrarySection,
  categories: CategoryManifestEntry[],
  updatedAt: number,
): SectionManifestRecord {
  const coverage = coverageSummary(categories)
  return {
    schemaVersion: LIBRARY_SCHEMA_VERSION,
    profileId,
    section,
    categories,
    coverage,
    updatedAt,
  }
}

function nextSnapshotShardBase(
  current: CategoryManifestEntry | undefined,
  nextShardCount: number,
): number {
  if (!current || current.shardCount === 0) {
    return 0
  }

  return (current.shardBase ?? 0) + Math.max(current.shardCount, nextShardCount)
}

function coverageSummary(categories: readonly CategoryManifestEntry[]): CoverageSummary {
  const completeCategoryCount = categories.filter(
    (category) => category.coverage === 'complete',
  ).length
  const hasPublishedCategory = categories.some(
    (category) => category.coverage === 'partial' || category.coverage === 'complete',
  )

  return {
    state:
      categories.length === 0 || !hasPublishedCategory
        ? 'none'
        : completeCategoryCount === categories.length
          ? 'complete'
          : 'partial',
    categoryCount: categories.length,
    completeCategoryCount,
    itemCount: categories.reduce((total, category) => total + category.itemCount, 0),
    byteEstimate: categories.reduce(
      (total, category) => total + category.byteEstimate,
      0,
    ),
  }
}

function upsertCategoryManifest(
  categories: readonly CategoryManifestEntry[],
  replacement: CategoryManifestEntry,
): CategoryManifestEntry[] {
  const result = categories.filter(
    (category) => category.categoryKey !== replacement.categoryKey,
  )
  result.push(replacement)
  return result
}

async function pruneSurplusCategoryShards(
  database: IDBDatabase,
  profileId: string,
  section: LibrarySection,
  categoryKey: string,
  retainedShardCount: number,
  previousShardCount: number,
  previousShardBase: number,
  nextShardBase: number,
  writeEpoch: number,
  options: CooperativeWriteOptions,
): Promise<void> {
  const firstObsoleteShard = previousShardBase === nextShardBase ? retainedShardCount : 0

  for (let shardIndex = firstObsoleteShard; shardIndex < previousShardCount; shardIndex += 1) {
    if (!canContinueBackgroundCleanup(writeEpoch, options.signal)) {
      return
    }

    try {
      await deleteCooperativeRecord(
        database,
        'snapshots',
        [profileId, section, categoryKey, previousShardBase + shardIndex],
        options.signal,
      )
    } catch (reason) {
      if (reason instanceof LibraryWriteAbortedError) {
        return
      }

      throw reason
    }

    await (options.yieldControl ?? defaultYield)()
  }
}

async function pruneSurplusSearchShards(
  database: IDBDatabase,
  profileId: string,
  retainedShardCount: number,
  previousShardCount: number,
  writeEpoch: number,
  options: CooperativeWriteOptions,
): Promise<void> {
  for (let shardIndex = retainedShardCount; shardIndex < previousShardCount; shardIndex += 1) {
    if (!canContinueBackgroundCleanup(writeEpoch, options.signal)) {
      return
    }

    try {
      await deleteCooperativeRecord(
        database,
        'searchShards',
        [profileId, shardIndex],
        options.signal,
      )
    } catch (reason) {
      if (reason instanceof LibraryWriteAbortedError) {
        return
      }

      throw reason
    }

    await (options.yieldControl ?? defaultYield)()
  }
}

function canContinueBackgroundCleanup(epoch: number, signal?: AbortSignal): boolean {
  return !signal?.aborted && !playbackStarting && playbackEpoch === epoch
}

function deleteProfileRows(store: IDBObjectStore, profileId: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = store.openCursor()
    request.onerror = () =>
      reject(request.error ?? new Error('Unable to delete profile library records.'))
    request.onsuccess = () => {
      const cursor = request.result

      if (!cursor) {
        resolve()
        return
      }

      const primaryKey = cursor.primaryKey

      if (Array.isArray(primaryKey) && primaryKey[0] === profileId) {
        cursor.delete()
      }

      cursor.continue()
    }
  })
}

async function putCooperativeRecord(
  database: IDBDatabase,
  storeName: 'snapshots' | 'searchShards',
  value: SnapshotRecord | SearchShardRecord,
  signal?: AbortSignal,
): Promise<void> {
  const transaction = database.transaction(storeName, 'readwrite')
  const complete = transactionComplete(transaction)
  const abort = (): void => {
    try {
      transaction.abort()
    } catch {
      // Completion won the race with cancellation.
    }
  }

  activeCooperativeTransactions.add(transaction)
  signal?.addEventListener('abort', abort, { once: true })

  try {
    transaction.objectStore(storeName).put(value)
    await complete
  } catch (reason) {
    if (signal?.aborted || playbackStarting) {
      throw new LibraryWriteAbortedError()
    }

    throw reason
  } finally {
    signal?.removeEventListener('abort', abort)
    activeCooperativeTransactions.delete(transaction)
  }
}

function assertCooperativeWriteAllowed(
  epoch: number,
  signal?: AbortSignal,
): void {
  if (signal?.aborted || playbackStarting || playbackEpoch !== epoch) {
    throw new LibraryWriteAbortedError()
  }
}

async function putRecord(
  database: IDBDatabase,
  storeName: LibraryStoreName,
  value: unknown,
): Promise<void> {
  const transaction = database.transaction(storeName, 'readwrite')
  const complete = transactionComplete(transaction)
  transaction.objectStore(storeName).put(value)
  await complete
}

async function deleteRecord(
  database: IDBDatabase,
  storeName: LibraryStoreName,
  key: IDBValidKey,
): Promise<void> {
  const transaction = database.transaction(storeName, 'readwrite')
  const complete = transactionComplete(transaction)
  transaction.objectStore(storeName).delete(key)
  await complete
}

async function deleteCooperativeRecord(
  database: IDBDatabase,
  storeName: 'snapshots' | 'searchShards',
  key: IDBValidKey,
  signal?: AbortSignal,
): Promise<void> {
  const transaction = database.transaction(storeName, 'readwrite')
  const complete = transactionComplete(transaction)
  const abort = (): void => {
    try {
      transaction.abort()
    } catch {
      // Completion won the race with cancellation.
    }
  }

  activeCooperativeTransactions.add(transaction)
  signal?.addEventListener('abort', abort, { once: true })

  try {
    transaction.objectStore(storeName).delete(key)
    await complete
  } catch (reason) {
    if (signal?.aborted || playbackStarting) {
      throw new LibraryWriteAbortedError()
    }

    throw reason
  } finally {
    signal?.removeEventListener('abort', abort)
    activeCooperativeTransactions.delete(transaction)
  }
}

async function getRecord<T>(
  database: IDBDatabase,
  storeName: LibraryStoreName,
  key: IDBValidKey,
): Promise<T | undefined> {
  const transaction = database.transaction(storeName, 'readonly')
  const complete = transactionComplete(transaction)
  const value = await requestResult<T | undefined>(
    transaction.objectStore(storeName).get(key),
  )
  await complete
  return value
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted.'))
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
  })
}

async function assertSyncOwnership(
  database: IDBDatabase,
  profileId: string,
  runId: string | undefined,
): Promise<void> {
  if (!runId) {
    return
  }

  const meta = await getRecord<unknown>(database, 'meta', profileId)

  if (
    !isMetaRecord(meta, profileId) ||
    !meta.sync.inProgress ||
    meta.sync.runId !== runId
  ) {
    throw new LibraryWriteAbortedError('The library sync no longer owns catalog writes.')
  }
}

function toCachedStream(stream: StreamItem): StreamItem {
  const stored = toStoredStream(stream)
  const { directSource: _directSource, ...cached } = stored
  const sanitized = stripCachedUrls(cached)

  /*
   * URL-like provider titles are legitimate display data, not transport
   * endpoints. Preserve the identity and search fields after recursively
   * removing URL-bearing optional metadata so a title cannot make an otherwise
   * complete local shard unreadable.
   */
  return {
    ...sanitized,
    id: stored.id,
    name: stored.name,
    section: stored.section,
    categoryId: stored.categoryId,
    searchName: stored.searchName,
  }
}

function toCachedDetails<T extends LibraryDetails>(value: T): T {
  if ('episodes' in value) {
    const episodes = Object.fromEntries(
      Object.entries(value.episodes).map(([season, items]) => [
        season,
        items.map(toCachedStream),
      ]),
    )

    return stripCachedUrls({
      ...value,
      episodes,
    }) as T
  }

  const { directSource: _directSource, ...cached } = value
  return stripCachedUrls(cached) as T
}

function stripCachedUrls<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripCachedUrls) as T
  }

  if (!isRecord(value)) {
    return value
  }

  const sanitized: Record<string, unknown> = {}

  for (const [key, candidate] of Object.entries(value)) {
    if (key === 'directSource') {
      continue
    }

    if (typeof candidate === 'string' && isUrlLike(candidate)) {
      continue
    }

    sanitized[key] = stripCachedUrls(candidate)
  }

  return sanitized as T
}

function isUrlLike(value: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)
}

function parseSnapshotItems(record: SnapshotRecord): StreamItem[] | null {
  try {
    const parsed = JSON.parse(record.payload) as unknown

    if (!Array.isArray(parsed) || parsed.length !== record.itemCount) {
      return null
    }

    const items: StreamItem[] = []

    for (const item of parsed) {
      const normalized = normalizeSnapshotStream(item)

      if (!normalized) {
        return null
      }

      items.push(normalized)
    }

    return items
  } catch {
    return null
  }
}

function normalizeSnapshotStream(value: unknown): StreamItem | null {
  if (!isRecord(value)) {
    return null
  }

  const id = value.id
  const section = value.section
  const categoryId = value.categoryId

  if (
    typeof id !== 'string' ||
    !isLibrarySection(section) ||
    typeof categoryId !== 'string'
  ) {
    return null
  }

  /*
   * Legacy cache writes stripped every URL-like string recursively, including
   * a legitimate provider title. The identity fields remain intact, so recover
   * such entries as an untitled local item rather than treating the entire
   * otherwise validated authoritative shard as corrupt.
   */
  const name = typeof value.name === 'string' ? value.name : 'Untitled'

  return toCachedStream({
    ...value,
    id,
    name,
    section,
    categoryId,
  } as StreamItem)
}

function parseSearchTuples(record: SearchShardRecord): SearchTuple[] | null {
  try {
    const parsed = JSON.parse(record.payload) as unknown

    if (!Array.isArray(parsed) || parsed.length !== record.entryCount) {
      return null
    }

    const tuples: SearchTuple[] = []

    for (const value of parsed) {
      if (
        !Array.isArray(value) ||
        value.length !== 4 ||
        typeof value[0] !== 'string' ||
        typeof value[1] !== 'string' ||
        !isLibrarySection(value[2]) ||
        typeof value[3] !== 'string'
      ) {
        return null
      }

      tuples.push([value[0], value[1], value[2], value[3]])
    }

    return tuples
  } catch {
    return null
  }
}

function isMetaRecord(value: unknown, profileId: string): value is LibraryMetaRecord {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.schemaVersion === LIBRARY_SCHEMA_VERSION &&
    value.profileId === profileId &&
    isRecord(value.sync) &&
    typeof value.sync.inProgress === 'boolean' &&
    (value.sync.failureCount === undefined || isNonNegativeInteger(value.sync.failureCount)) &&
    (value.sync.sections === undefined ||
      (isRecord(value.sync.sections) &&
        Object.values(value.sync.sections).every(isSyncSectionState))) &&
    isCoverage(value.searchCoverage) &&
    isNonNegativeInteger(value.searchShardCount)
  )
}

function isManifestRecord(
  value: unknown,
  profileId: string,
  section: LibrarySection,
): value is SectionManifestRecord {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.schemaVersion === LIBRARY_SCHEMA_VERSION &&
    value.profileId === profileId &&
    value.section === section &&
    Array.isArray(value.categories) &&
    value.categories.every(isCategoryManifestEntry) &&
    isRecord(value.coverage) &&
    isCoverage(value.coverage.state) &&
    isFiniteNumber(value.updatedAt)
  )
}

function isCategoryManifestEntry(value: unknown): value is CategoryManifestEntry {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.categoryKey === 'string' &&
    typeof value.categoryId === 'string' &&
    typeof value.name === 'string' &&
    isCoverage(value.coverage) &&
    isNonNegativeInteger(value.shardCount) &&
    (value.shardBase === undefined || isNonNegativeInteger(value.shardBase)) &&
    isNonNegativeInteger(value.itemCount) &&
    isNonNegativeInteger(value.byteEstimate) &&
    (value.updatedAt === undefined || isFiniteNumber(value.updatedAt))
  )
}

function isSnapshotRecord(
  value: unknown,
  profileId: string,
  section: LibrarySection,
  categoryKey: string,
  shardIndex: number,
): value is SnapshotRecord {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.schemaVersion === LIBRARY_SCHEMA_VERSION &&
    value.profileId === profileId &&
    value.section === section &&
    value.categoryKey === categoryKey &&
    value.shardIndex === shardIndex &&
    typeof value.payload === 'string' &&
    isFiniteNumber(value.updatedAt) &&
    isNonNegativeInteger(value.itemCount) &&
    value.itemCount <= MAX_SNAPSHOT_ITEMS &&
    isNonNegativeInteger(value.byteEstimate) &&
    value.byteEstimate <= MAX_SNAPSHOT_BYTES &&
    utf8ByteLength(value.payload) <= MAX_SNAPSHOT_BYTES
  )
}

function isSearchShardRecord(
  value: unknown,
  profileId: string,
  shardIndex: number,
): value is SearchShardRecord {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.schemaVersion === LIBRARY_SCHEMA_VERSION &&
    value.profileId === profileId &&
    value.shardIndex === shardIndex &&
    typeof value.payload === 'string' &&
    isFiniteNumber(value.updatedAt) &&
    isNonNegativeInteger(value.entryCount) &&
    value.entryCount <= MAX_SEARCH_SHARD_ENTRIES &&
    isNonNegativeInteger(value.byteEstimate)
  )
}

function isDetailRecord(
  value: unknown,
  profileId: string,
  kind: LibraryDetailKind,
  id: string,
): value is DetailRecord {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.schemaVersion === LIBRARY_SCHEMA_VERSION &&
    value.profileId === profileId &&
    value.kind === kind &&
    value.id === id &&
    isFiniteNumber(value.updatedAt) &&
    isFiniteNumber(value.expiresAt) &&
    'value' in value
  )
}

function isEpgRecord(
  value: unknown,
  profileId: string,
  streamId: string,
): value is EpgRecord {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.schemaVersion === LIBRARY_SCHEMA_VERSION &&
    value.profileId === profileId &&
    value.streamId === streamId &&
    isFiniteNumber(value.updatedAt) &&
    isFiniteNumber(value.expiresAt) &&
    'value' in value
  )
}

function isSyncSectionState(value: unknown): value is LibrarySyncSectionState {
  if (!isRecord(value)) {
    return false
  }

  return (
    isCoverage(value.coverage) &&
    isNonNegativeInteger(value.wholeSectionFailureCount) &&
    isNonNegativeInteger(value.nextCategoryCursor) &&
    (value.lastAttemptAt === undefined || isFiniteNumber(value.lastAttemptAt)) &&
    (value.lastSuccessAt === undefined || isFiniteNumber(value.lastSuccessAt)) &&
    (value.lastFailureAt === undefined || isFiniteNumber(value.lastFailureAt))
  )
}

function isCoverage(value: unknown): value is LibraryCoverage {
  return value === 'none' || value === 'partial' || value === 'complete'
}

function isLibrarySection(value: unknown): value is LibrarySection {
  return value === 'live' || value === 'vod' || value === 'series'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && Math.floor(value) === value
}

function assertProfileId(profileId: string): void {
  if (!profileId) {
    throw new Error('A profile ID is required for library cache writes.')
  }
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.max(1, Math.floor(value))
    : fallback
}

function nonNegativeNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback
}

function utf8ByteLength(value: string): number {
  let bytes = 0

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)

    if (code < 0x80) {
      bytes += 1
    } else if (code < 0x800) {
      bytes += 2
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1)

      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        index += 1
      } else {
        bytes += 3
      }
    } else {
      bytes += 3
    }
  }

  return bytes
}

function defaultYield(): Promise<void> {
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0))
}

function nextEventLoopTurn(): Promise<number> {
  const startedAt = monotonicNow()
  return new Promise<number>((resolve) => {
    globalThis.setTimeout(() => resolve(monotonicNow() - startedAt), 0)
  })
}

function monotonicNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}