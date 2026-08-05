import { LruTtlCache } from '../lru-ttl-cache'
import { performanceTrace } from '../performance-trace'
import { foldText, matchesQuery, queryTokens, searchTokens } from '../search'
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
  Program,
  SeriesDetails,
  StreamItem,
  VodDetails,
} from '../types'

export const LIBRARY_DATABASE_NAME = 'nova-play-library'
export const LIBRARY_DATABASE_VERSION = 5
export const LIBRARY_SCHEMA_VERSION = 1
export const MAX_SNAPSHOT_ITEMS = 1_500
export const MAX_SNAPSHOT_BYTES = 256 * 1024
export const MAX_SEARCH_SHARD_ENTRIES = 5_000
export const SEARCH_INDEX_FORMAT_VERSION = 3
/*
 * IndexedDB writes run synchronously inside each transaction. Larger batches
 * keep the migration practical on webOS, while still committing frequently
 * enough to yield between bounded units and avoid a long single transaction.
 */
export const SEARCH_INDEX_POSTINGS_PER_SHARD = 1_024
export const SEARCH_INDEX_WRITE_RECORD_BATCH_SIZE = 32
export const MAX_SEARCH_INDEX_BUFFERED_POSTINGS = 200_000
/**
 * The index rebuild's per-item posting loop (payload parse, posting generation,
 * and prefix bucketing) previously ran unyielded across an entire snapshot
 * shard, producing a multi-hundred-millisecond main-thread span at section
 * scale. It now yields whenever a slice exceeds this budget, keeping each
 * uninterrupted run short without paying a clock read per item.
 */
export const SEARCH_INDEX_WORK_SLICE_MS = 12

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
export type LibraryEpgKind = 'now-next' | 'schedule' | 'catchup'
export type LibraryDetails = VodDetails | SeriesDetails
export type LibraryEpgValue = NowNext | Program[]
export type SearchTuple = [key: string, foldedName: string, section: LibrarySection, categoryId: string]

/**
 * Payload-free diagnostics for one section's most recent whole-section failure.
 * Persisted per section in the sync meta record, so a later section succeeding in
 * the same run cannot overwrite it the way the single global breadcrumb does. It
 * carries only counts, bytes, timing, and classification - never titles, URLs, or
 * provider payload.
 */
export type LibrarySyncSectionFailureDetail = {
  /** Coordinator failure stage reached (provider-scan, snapshot-publish, ...). */
  failureStage: string
  /** Failure classification: provider kind, empty-validation, or exception name. */
  failureKind: string
  /** Records the parser confirmed as top-level array members, if known. */
  rawItemCount?: number
  /** Records accepted with a usable identity, if known. */
  acceptedItemCount?: number
  /** Records streamed to the publisher before the failure. */
  streamedRecordCount?: number
  /** Response bytes read before the failure, if known. */
  bytesReceived?: number
  /** Whether the strict top-level array closed cleanly, if known. */
  arrayClosed?: boolean
  /** Wall-clock from scan start to failure, milliseconds. */
  elapsedMs?: number
  /** Whether the failure was a refusal (401/403/429/Retry-After). */
  refused?: boolean
  updatedAt: number
}

export type LibrarySyncSectionState = {
  coverage: LibraryCoverage
  wholeSectionFailureCount: number
  nextCategoryCursor: number
  lastAttemptAt?: number
  lastSuccessAt?: number
  lastFailureAt?: number
  /** Survives later sections in the same run; see the type doc. */
  lastFailureDetail?: LibrarySyncSectionFailureDetail
}

export type LibrarySyncState = {
  inProgress: boolean
  runId?: string
  startedAt?: number
  updatedAt?: number
  failureCount?: number
  sections?: Partial<Record<LibrarySection, LibrarySyncSectionState>>
}

/**
 * Per-profile EPG capability. A host either serves guide data or it does not;
 * this is a property of the account's current server, detected once rather than
 * rediscovered per channel. `unknown` means not yet probed.
 */
export type EpgCapabilityState = 'available' | 'unavailable' | 'unknown'

export type EpgCapabilityRecord = {
  state: EpgCapabilityState
  checkedAt: number
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
  epgCapability?: EpgCapabilityRecord
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
  /**
   * Items that the replaced ASCII-only prefix tokenizer would have omitted.
   * This is captured during the local format migration before new postings are
   * written, allowing device audits without provider reacquisition.
   */
  preMigrationZeroPrefixCount: number
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

export type EpgRecord<T extends LibraryEpgValue = LibraryEpgValue> = {
  schemaVersion: 1
  profileId: string
  streamId: string
  kind: LibraryEpgKind
  value: T
  updatedAt: number
  expiresAt: number
}

export type RebuildableCacheEvictionResult = {
  epgRecordsDeleted: number
  detailRecordsDeleted: number
  searchIndexRecordsDeleted: number
  supersededSnapshotRecordsDeleted: number
}

export type ProfileLibraryStorageEstimate = {
  byteEstimate: number
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

export type CompleteCategoryPageReadResult =
  | {
      coverage: 'complete'
      items: StreamItem[]
      itemCount: number
      page: number
      pageCount: number
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
      preMigrationZeroPrefixCount: number
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

export type PartialCategoryAppendInput = {
  category: Category
  categoryKey?: string
  items: readonly StreamItem[]
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
 * A closed top-level array that yielded zero identifiable records must never
 * promote over an authoritative section that currently holds items. The scan
 * completed cleanly at the transport layer, so this is not a provider fault and
 * carries no payload: only the counts that justify the refusal. The previous
 * manifest, snapshots, and derived index are left exactly as readers resolve
 * them.
 */
export class EmptySectionPublicationError extends Error {
  readonly code = 'empty-section-publication'
  readonly priorItemCount: number

  constructor(priorItemCount: number) {
    super(
      'A closed section scan emitted zero identifiable records while the ' +
        `existing generation holds ${priorItemCount} item(s); promotion refused.`,
    )
    this.name = 'EmptySectionPublicationError'
    this.priorItemCount = priorItemCount
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

/**
 * Placeholder that replaces a shard once its record has committed, so a
 * whole-section publication never holds more than one category's payloads.
 */
const EMPTY_SNAPSHOT_SHARD: CategorySnapshotShard = {
  payload: '',
  itemCount: 0,
  byteEstimate: 0,
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

    request.onupgradeneeded = (event) => {
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

      /*
       * EPG used to share one row between now/next and the full schedule.
       * Recreate this disposable cache store so each short-lived programme
       * projection has an independent key. Authoritative catalog records and
       * user state are not part of this schema migration.
       */
      if (event.oldVersion < 5 && database.objectStoreNames.contains('epg')) {
        database.deleteObjectStore('epg')
      }
      createStore(database, 'epg', ['profileId', 'streamId', 'kind'])
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

type PartialSectionPublicationInit = {
  database: IDBDatabase
  profileId: string
  section: LibrarySection
  runId?: string
  now: () => number
  categories: readonly CategoryManifestEntry[]
}

/**
 * Buffered manifest state for one streamed partial-section publication.
 *
 * A section manifest is a single record listing every category, so rewriting it
 * once per bounded item flush costs O(flushes x categories). VOD (~194,000
 * items across 363 categories, flushed every 128 items) therefore read,
 * rebuilt, and rewrote the whole manifest ~1,500 times while its ~80 MB
 * streamed parse was still running, which reproducibly stalled the webOS
 * Chromium 79 runtime a few thousand items into the scan. Live and Series never
 * took this path, which is why only VOD hung.
 *
 * Snapshot shards are still written on every bounded flush - that is what keeps
 * peak memory bounded - but manifest mutation accumulates here and is written
 * exactly **once** per run, at the closed-array commit. Manifest cost is
 * therefore O(1) per section rather than O(flushes).
 *
 * Because every whole-section scan now publishes this way, including a refresh of
 * an already complete section, the run must not disturb what readers currently
 * resolve. New shards are written to a fresh slot above the live generation
 * (`shardBase + shardCount`) and the manifest is swapped in one write at commit,
 * after which the superseded range is pruned. Consequences:
 *
 * - a reader sees the previous complete generation for the whole scan;
 * - a crashed or cancelled run leaves that generation intact and authoritative,
 *   which is the accepted rule that a failed refresh never erases a complete
 *   section;
 * - a restarted response recomputes the same fresh slot and overwrites it, so it
 *   cannot append duplicates;
 * - shards orphaned by an interrupted run are reclaimed by
 *   `evictRebuildableData()`, which deletes every snapshot row the active manifest
 *   does not reference.
 */
export class PartialSectionPublication {
  readonly profileId: string
  readonly section: LibrarySection
  private readonly database: IDBDatabase
  private readonly runId?: string
  private readonly now: () => number
  /**
   * One generation stamp for every shard and manifest entry in this run.
   * Bounded reads reject a shard whose `updatedAt` differs from its manifest
   * entry, so the stamp cannot change between flushes of the same category.
   */
  private readonly generation: number
  private readonly entries = new Map<string, CategoryManifestEntry>()
  /** The shard range each category occupied before this run, pruned at commit. */
  private readonly superseded = new Map<string, { shardBase: number; shardCount: number }>()
  /**
   * Item total the section held when this run opened. A run that closes with an
   * empty scan checks this to refuse erasing an authoritative generation.
   */
  private readonly priorItemCount: number
  private manifestWrites = 0
  private committed = false

  private constructor(init: PartialSectionPublicationInit) {
    this.database = init.database
    this.profileId = init.profileId
    this.section = init.section
    this.runId = init.runId
    this.now = init.now
    this.generation = init.now()
    this.priorItemCount = init.categories.reduce(
      (total, category) => total + (category.itemCount ?? 0),
      0,
    )

    for (const category of init.categories) {
      const liveShardBase = category.shardBase ?? 0
      this.entries.set(category.categoryKey, {
        ...category,
        coverage: 'partial',
        shardCount: 0,
        // Start above the generation readers are currently resolving.
        shardBase: liveShardBase + category.shardCount,
        itemCount: 0,
        byteEstimate: 0,
        updatedAt: this.generation,
      })
      this.superseded.set(category.categoryKey, {
        shardBase: liveShardBase,
        shardCount: category.shardCount,
      })
    }
  }

  static open(init: PartialSectionPublicationInit): PartialSectionPublication {
    /*
     * No manifest write here: the live generation must stay exactly as readers
     * resolve it until this run's array closes.
     */
    return new PartialSectionPublication(init)
  }

  /** `manifests` store writes performed by this publication so far. */
  get manifestWriteCount(): number {
    return this.manifestWrites
  }

  get categoryCount(): number {
    return this.entries.size
  }

  /** Item total the section held when this publication opened. */
  get priorAuthoritativeItemCount(): number {
    return this.priorItemCount
  }

  /**
   * Persists one bounded, parser-confirmed batch. The shards become durable
   * immediately; the section manifest is not touched.
   */
  async appendCategoryItems(
    input: PartialCategoryAppendInput,
    options: CooperativeWriteOptions = {},
  ): Promise<CategoryManifestEntry> {
    if (this.committed) {
      throw new Error('A committed partial section publication cannot accept more items.')
    }

    for (const item of input.items) {
      if (item.section !== this.section) {
        throw new Error('A category snapshot cannot contain items from another section.')
      }
    }

    options.onPublishStage?.('snapshot-plan')
    const entry = this.entryFor(input.categoryKey ?? input.category.id, input.category)

    if (input.items.length) {
      options.onPublishStage?.('snapshot-write')
      await this.appendShards(entry, buildCategorySnapshotShards(input.items), options)
    }

    options.onPublishStage?.('complete')
    return { ...entry }
  }

  /**
   * Promotes the whole run in one manifest write. A closed top-level array is
   * authoritative for the section, so a category the stream never mentioned is
   * complete with zero items rather than unavailable.
   */
  async commit(options: CooperativeWriteOptions = {}): Promise<SectionManifestRecord> {
    if (this.committed) {
      throw new Error('A partial section publication can be committed only once.')
    }

    /*
     * A closed scan that produced zero identifiable records must not erase a
     * section that currently holds items. This is checked before any empty
     * placeholder shard is written and before the manifest swap, so the previous
     * generation and its derived index remain authoritative. A genuinely empty
     * first acquisition (no prior items) is still allowed to commit.
     */
    const committedItemCount = [...this.entries.values()].reduce(
      (total, entry) => total + entry.itemCount,
      0,
    )

    if (committedItemCount === 0 && this.priorItemCount > 0) {
      throw new EmptySectionPublicationError(this.priorItemCount)
    }

    options.onPublishStage?.('snapshot-write')

    for (const entry of this.entries.values()) {
      if (entry.shardCount > 0) {
        continue
      }

      /*
       * An empty category still needs one shard record: bounded category reads
       * derive an IndexedDB key range from `shardCount`, and a zero-length range
       * is not a valid range.
       */
      await this.appendShards(entry, buildCategorySnapshotShards([]), options)
    }

    assertCooperativeWriteAllowed(playbackEpoch, options.signal)
    await assertSyncOwnership(this.database, this.profileId, this.runId)
    options.onPublishStage?.('manifest-build')
    options.onPublishStage?.('manifest-put')
    const manifest = await this.publishManifest('complete')
    this.committed = true

    /*
     * The manifest now points at the new range, so the previous one is
     * unreachable. Pruning is cooperative and best-effort: whatever it does not
     * remove is reclaimed by `evictRebuildableData()`.
     */
    options.onPublishStage?.('cleanup')
    const writeEpoch = playbackEpoch
    for (const [categoryKey, previous] of this.superseded) {
      if (previous.shardCount < 1) {
        continue
      }

      const entry = this.entries.get(categoryKey)
      await pruneSurplusCategoryShards(
        this.database,
        this.profileId,
        this.section,
        categoryKey,
        entry?.shardCount ?? 0,
        previous.shardCount,
        previous.shardBase,
        entry?.shardBase ?? previous.shardBase,
        writeEpoch,
        options,
      )
    }

    options.onPublishStage?.('complete')
    return manifest
  }

  private entryFor(categoryKey: string, category: Category): CategoryManifestEntry {
    const existing = this.entries.get(categoryKey)

    if (existing) {
      existing.categoryId = category.id
      existing.name = category.name
      return existing
    }

    const entry: CategoryManifestEntry = {
      categoryKey,
      categoryId: category.id,
      name: category.name,
      coverage: 'partial',
      shardCount: 0,
      shardBase: 0,
      itemCount: 0,
      byteEstimate: 0,
      updatedAt: this.generation,
    }
    this.entries.set(categoryKey, entry)
    return entry
  }

  private async appendShards(
    entry: CategoryManifestEntry,
    shards: readonly CategorySnapshotShard[],
    options: CooperativeWriteOptions,
  ): Promise<void> {
    const writeEpoch = playbackEpoch

    for (const shard of shards) {
      assertCooperativeWriteAllowed(writeEpoch, options.signal)
      await assertSyncOwnership(this.database, this.profileId, this.runId)
      const eventLoopTurn = nextEventLoopTurn()
      const startedAt = monotonicNow()

      await putCooperativeRecord(
        this.database,
        'snapshots',
        {
          schemaVersion: LIBRARY_SCHEMA_VERSION,
          profileId: this.profileId,
          section: this.section,
          categoryKey: entry.categoryKey,
          shardIndex: (entry.shardBase ?? 0) + entry.shardCount,
          payload: shard.payload,
          updatedAt: this.generation,
          itemCount: shard.itemCount,
          byteEstimate: shard.byteEstimate,
        } satisfies SnapshotRecord,
        options.signal,
      )

      /*
       * Advance the buffered cursor only after the record commits, so a
       * cancelled flush cannot leave the next shard index pointing past a gap.
       */
      entry.shardCount += 1
      entry.itemCount += shard.itemCount
      entry.byteEstimate += shard.byteEstimate

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
  }

  private async publishManifest(
    coverage: Extract<LibraryCoverage, 'complete'>,
  ): Promise<SectionManifestRecord> {
    const manifest = createManifest(
      this.profileId,
      this.section,
      [...this.entries.values()].map((entry) => ({ ...entry, coverage })),
      this.now(),
    )
    await putRecord(this.database, 'manifests', manifest)
    this.manifestWrites += 1
    snapshotMemoryCache.clear()
    return manifest
  }
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

  /**
   * Discards a stale database connection after browser eviction or an explicit
   * recovery request. Opening a fresh connection cannot affect localStorage
   * favorites, resume records, profiles, or settings.
   */
  async reopen(): Promise<void> {
    const previous = this.databasePromise
    this.databasePromise = null

    try {
      ;(await previous)?.close()
    } catch {
      // A browser-evicted connection may already be closed.
    }

    await this.database()
  }

  /**
   * Development-only fault injection for recovery validation. It clears only
   * this repository's IndexedDB database; profiles, favorites, resume history,
   * and settings remain in their localStorage ownership boundary.
   */
  async simulateEviction(): Promise<void> {
    const current = this.databasePromise
    this.databasePromise = null

    try {
      ;(await current)?.close()
    } catch {
      // A browser-evicted connection may already be closed.
    }

    await deleteLibraryDatabase(this.databaseName)
    await this.database()
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

  /**
   * Clears a run abandoned by process suspension before its coordinator could
   * finish. The active-run lease is disposable cache state, so recovery makes
   * an incomplete library immediately eligible for the next normal sync.
   */
  async recoverStaleSync(profileId: string, staleAfterMs: number): Promise<boolean> {
    assertProfileId(profileId)
    const database = await this.database()

    return new Promise<boolean>((resolve, reject) => {
      const transaction = database.transaction('meta', 'readwrite')
      const store = transaction.objectStore('meta')
      let recovered = false
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
          resolve(recovered)
        }
      }
      transaction.onerror = () =>
        rejectOnce(transaction.error ?? new Error('Unable to recover catalog synchronization.'))
      transaction.onabort = () =>
        rejectOnce(transaction.error ?? new Error('Catalog sync recovery transaction was aborted.'))

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
          const updatedAt = current.sync.updatedAt

          if (
            !current.sync.inProgress ||
            (typeof updatedAt === 'number' && updatedAt > staleAt)
          ) {
            return
          }

          store.put({
            ...current,
            nextDueAt: currentTime,
            sync: {
              ...normalizeSyncState(current.sync),
              inProgress: false,
              runId: undefined,
              startedAt: undefined,
              updatedAt: currentTime,
            },
          } satisfies LibraryMetaRecord)
          recovered = true
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
   *
   * The returned publication buffers all manifest mutation for the run. See
   * `PartialSectionPublication` for why per-flush manifest writes are unsafe on
   * the webOS runtime.
   */
  async openPartialSectionPublication(
    profileId: string,
    section: LibrarySection,
    runId?: string,
  ): Promise<PartialSectionPublication> {
    assertProfileId(profileId)
    selectMemoryCacheScope(this.databaseName, profileId)
    const current = await this.getManifest(profileId, section)

    if (!current) {
      throw new Error('Cannot prepare partial snapshots without a category manifest.')
    }

    const database = await this.database()
    await assertSyncOwnership(database, profileId, runId)

    /*
     * A complete section is a valid starting point: the run writes above the live
     * generation and swaps the manifest at commit, so the existing snapshots stay
     * readable and authoritative throughout.
     */
    return PartialSectionPublication.open({
      database,
      profileId,
      section,
      runId,
      now: this.now,
      categories: current.categories,
    })
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
    /*
     * Plan without serializing. Validation and shard-slot arithmetic are cheap
     * and depend only on this category's current manifest entry, so nothing here
     * needs a payload.
     */
    const plans = input.snapshots.map((snapshot) => {
      const categoryKey = snapshot.categoryKey ?? snapshot.category.id

      if (seenCategoryKeys.has(categoryKey)) {
        throw new Error('A whole-section snapshot may contain each category only once.')
      }

      seenCategoryKeys.add(categoryKey)
      let itemCount = 0

      for (const item of snapshot.items) {
        if (item.section !== input.section) {
          throw new Error('A category snapshot cannot contain items from another section.')
        }

        itemCount += 1
      }

      const currentCategory = currentByKey.get(categoryKey)

      return {
        categoryKey,
        category: snapshot.category,
        /*
         * Hold the input, not its items, so the only read of `items` after this
         * validation pass is the one that serializes this category.
         */
        snapshot,
        itemCount,
        currentCategory,
        generation: Math.max(
          input.updatedAt ?? this.now(),
          (currentCategory?.updatedAt ?? 0) + 1,
        ),
        shardCount: 0,
        byteEstimate: 0,
        nextShardBase: 0,
      }
    })

    /*
     * Serialize one category at a time. Building every section shard up front
     * held the whole section's payload strings live at once, on top of the
     * already-resident parsed items and the streamed response state. That peak
     * grew when cached artwork URLs were restored, and the webOS renderer is
     * terminated at the scan-to-publish transition for a section the size of
     * Live. Per-category serialization lets each payload be collected as soon as
     * its record commits.
     */
    options.onPublishStage?.('snapshot-write')
    for (const plan of plans) {
      const shards = buildCategorySnapshotShards(plan.snapshot.items)
      plan.nextShardBase = nextSnapshotShardBase(plan.currentCategory, shards.length)
      plan.shardCount = shards.length
      plan.byteEstimate = shards.reduce((total, shard) => total + shard.byteEstimate, 0)

      for (let shardIndex = 0; shardIndex < shards.length; shardIndex += 1) {
        assertCooperativeWriteAllowed(writeEpoch, options.signal)
        await assertSyncOwnership(database, input.profileId, input.runId)
        const shard = shards[shardIndex]

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

        // Drop this shard's payload before the next put is scheduled.
        shards[shardIndex] = EMPTY_SNAPSHOT_SHARD
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
        shardCount: plan.shardCount,
        shardBase: plan.nextShardBase,
        itemCount: plan.itemCount,
        byteEstimate: plan.byteEstimate,
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
        plan.shardCount,
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

    try {
      return {
        coverage: 'complete',
        items: await readCompleteCategorySnapshotItems(
          await this.database(),
          profileId,
          section,
          category,
        ),
      }
    } catch {
      return { coverage: 'none', items: [], reason: 'snapshot-invalid' }
    }
  }

  async readCompleteCategoryPage(
    profileId: string,
    section: LibrarySection,
    categoryId: string,
    page: number,
    pageSize: number,
  ): Promise<CompleteCategoryPageReadResult> {
    const sectionCategories = await this.readCompleteSectionCategories(profileId, section)

    if (sectionCategories.coverage === 'none') {
      return { coverage: 'none', items: [], reason: sectionCategories.reason }
    }

    const manifest = await this.getManifest(profileId, section)
    const category = manifest?.categories.find((entry) => entry.categoryKey === categoryId)

    if (!category || category.coverage !== 'complete') {
      return { coverage: 'none', items: [], reason: 'category-unavailable' }
    }

    const safePageSize = positiveInteger(pageSize, 24)
    const pageCount = Math.max(1, Math.ceil(category.itemCount / safePageSize))
    const safePage = Math.max(0, Math.min(Math.floor(page), pageCount - 1))

    try {
      return {
        coverage: 'complete',
        items: await readCompleteCategorySnapshotItems(
          await this.database(),
          profileId,
          section,
          category,
          safePage * safePageSize,
          safePageSize,
        ),
        itemCount: category.itemCount,
        page: safePage,
        pageCount,
      }
    } catch {
      return { coverage: 'none', items: [], reason: 'snapshot-invalid' }
    }
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
    const matchedPostings: SearchIndexPosting[] = []
    const seen = new Set<string>()

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
      matchedPostings.push(entry)

      if (matchedPostings.length > safeLimit) {
        break
      }

      if (entryIndex % 64 === 63) {
        await defaultYield()
      }
    }

    let matches: StreamItem[]

    try {
      /*
       * Fetch every visible result's snapshot shard inside one readonly
       * transaction. Resolving one posting at a time used to reintroduce a
       * serial IDB round-trip for each of the 60 displayed cards, masking the
       * cursor-based posting-read fix on physical webOS hardware.
       */
      matches = await readSearchIndexPostingStreams(
        await this.database(),
        profileId,
        section,
        manifest,
        matchedPostings.slice(0, safeLimit),
      )
    } catch {
      return report({ coverage: 'none', matches: [], reason: 'index-invalid' }, entries.length)
    }

    for (let count = 8; count < matches.length; count += 8) {
      await options.onMatches?.({
        matches: matches.slice(0, count),
        matchedCount: matchedPostings.length,
        postingCount: entries.length,
      })
    }

    if (matches.length) {
      await options.onMatches?.({
        matches: matches.slice(),
        matchedCount: matchedPostings.length,
        postingCount: entries.length,
      })
    }

    return report(
      {
        coverage: 'complete',
        matches,
        limited: matchedPostings.length > safeLimit,
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
        preMigrationZeroPrefixCount: currentIndex.preMigrationZeroPrefixCount,
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
        preMigrationZeroPrefixCount: result.preMigrationZeroPrefixCount,
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
    let preMigrationZeroPrefixCount = 0

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
      preMigrationZeroPrefixCount: 0,
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

          let sliceStartedAt = monotonicNow()

          for (let snapshotItemIndex = 0; snapshotItemIndex < items.length; snapshotItemIndex += 1) {
            const item = items[snapshotItemIndex]
            const foldedName = item.searchName ?? foldText(item.name)
            const prefixes = searchIndexPrefixes(foldedName)

            if (!legacyAsciiSearchIndexPrefixes(foldedName).length) {
              preMigrationZeroPrefixCount += 1
            }

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

            /*
             * Yield when this posting-generation slice has run long enough. The
             * clock is read in coarse blocks so the check itself is not a cost;
             * without this the loop walked an entire shard unyielded.
             */
            if (
              (snapshotItemIndex & 255) === 255 &&
              monotonicNow() - sliceStartedAt >= SEARCH_INDEX_WORK_SLICE_MS
            ) {
              if (signal?.aborted) {
                throw new LibraryWriteAbortedError('Local search-index build was cancelled.')
              }

              await defaultYield()
              sliceStartedAt = monotonicNow()
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
        preMigrationZeroPrefixCount,
        prefixPostingCounts,
        prefixShardCounts,
      } satisfies SearchIndexMetaRecord)

      /*
       * The new generation is now the one readers resolve, so every earlier
       * generation for this section is unreachable. Nothing used to delete them:
       * each rebuild added a full generation of shards and left the previous one
       * behind, so `searchIndexShards` grew without bound. Measured on the
       * physical target before this fix: 68,800 records across 10 generations for
       * two sections, of which only 2 generations were active - 55,192 orphaned
       * records, and the largest store in an evictable cache by a wide margin.
       *
       * This runs after the meta record is published, so a failure here leaves
       * extra rows to reclaim rather than an index readers cannot resolve.
       */
      const supersededShardsDeleted = await deleteSupersededSearchIndexShards(
        database,
        profileId,
        section,
        generation,
        signal,
      )
      performanceTrace.event('library', 'local-search-index-generations-pruned', {
        section,
        generation,
        supersededShardsDeleted,
      })

      const result: SearchIndexBuildResult = {
        coverage: 'complete',
        generation,
        itemCount,
        postingCount,
        legacyUntitledCount,
        preMigrationZeroPrefixCount,
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
        preMigrationZeroPrefixCount,
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

  async putEpg<T extends LibraryEpgValue>(
    profileId: string,
    streamId: string,
    kind: LibraryEpgKind,
    value: T,
    ttlMs: number,
  ): Promise<void> {
    const updatedAt = this.now()
    await putRecord(await this.database(), 'epg', {
      schemaVersion: LIBRARY_SCHEMA_VERSION,
      profileId,
      streamId,
      kind,
      value: stripCachedUrls(value),
      updatedAt,
      expiresAt: updatedAt + Math.max(0, ttlMs),
    } satisfies EpgRecord<T>)
  }

  async getEpg<T extends LibraryEpgValue>(
    profileId: string,
    streamId: string,
    kind: LibraryEpgKind,
  ): Promise<T | null> {
    try {
      const database = await this.database()
      const record = await getRecord<unknown>(
        database,
        'epg',
        [profileId, streamId, kind],
      )

      if (!isEpgRecord(record, profileId, streamId, kind)) {
        return null
      }

      if (record.expiresAt <= this.now()) {
        await deleteRecord(database, 'epg', [profileId, streamId, kind])
        return null
      }

      return record.value as T
    } catch {
      return null
    }
  }

  /**
   * Removes data that can be re-created without touching active catalog
   * manifests/snapshots or localStorage user state. The order is intentional:
   * programme cache, details cache, derived search data, then superseded shards.
   */
  async evictRebuildableData(profileId: string): Promise<RebuildableCacheEvictionResult> {
    assertProfileId(profileId)
    const database = await this.database()
    const epgRecordsDeleted = await deleteProfileRowsWithCount(database, 'epg', profileId)
    const detailRecordsDeleted = await deleteProfileRowsWithCount(database, 'details', profileId)
    const searchIndexRecordsDeleted =
      await deleteProfileRowsWithCount(database, 'searchIndexMeta', profileId) +
      await deleteProfileRowsWithCount(database, 'searchIndexShards', profileId) +
      await deleteProfileRowsWithCount(database, 'searchShards', profileId)
    const manifests = await Promise.all(
      (['live', 'vod', 'series'] as const).map((section) =>
        this.getManifest(profileId, section),
      ),
    )
    const supersededSnapshotRecordsDeleted = await deleteSupersededSnapshotRows(
      database,
      profileId,
      manifests.filter((manifest): manifest is SectionManifestRecord => manifest !== null),
    )

    searchMemoryCache.clear()
    snapshotMemoryCache.clear()

    return {
      epgRecordsDeleted,
      detailRecordsDeleted,
      searchIndexRecordsDeleted,
      supersededSnapshotRecordsDeleted,
    }
  }

  /**
   * Estimates the profile's IndexedDB footprint without serializing provider
   * credentials, playback URLs, or catalog values outside the database.
   * The value is used only when StorageManager does not expose a device quota.
   */
  async estimateProfileStorage(profileId: string): Promise<ProfileLibraryStorageEstimate> {
    assertProfileId(profileId)
    const database = await this.database()
    const estimates = await Promise.all(
      LIBRARY_STORE_NAMES.map((storeName) =>
        estimateProfileStoreBytes(database, storeName, profileId),
      ),
    )

    return {
      byteEstimate: estimates.reduce((total, estimate) => total + estimate, 0),
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
      const opening = openLibraryDatabase(this.databaseName)
      this.databasePromise = opening
      void opening.catch(() => {
        if (this.databasePromise === opening) {
          this.databasePromise = null
        }
      })
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

  for (const token of searchTokens(value)) {
    const characters = Array.from(token)

    /*
     * Keep one posting per token at the rarest-prefix selection width. Retaining
     * all 1/2/3-character variants tripled the VOD migration footprint on the
     * physical webOS device; one-character queries therefore remain an explicit
     * local-search limitation rather than ballooning every persistent index.
     */
    if (characters.length >= 2) {
      prefixes.add(characters.slice(0, Math.min(3, characters.length)).join(''))
    }
  }

  return [...prefixes]
}

function searchIndexPrefixForToken(token: string): string | null {
  const characters = Array.from(searchTokens(token)[0] ?? '')

  return characters.length >= 2
    ? characters.slice(0, Math.min(3, characters.length)).join('')
    : null
}

/** The retired v1 tokenizer, retained only to audit its local migration impact. */
function legacyAsciiSearchIndexPrefixes(value: string): string[] {
  return foldText(value).match(/[a-z0-9]{2,}/g) ?? []
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

/**
 * Deletes every `searchIndexShards` row for a section whose generation is not the
 * currently active one. Readers require an exact generation match, so these rows
 * are unreachable; leaving them made a rebuildable cache grow without bound.
 *
 * Deletion is cooperative: it yields between bounded batches and stops for
 * playback or cancellation, leaving the remainder for the next rebuild or for
 * `evictRebuildableData()`.
 */
async function deleteSupersededSearchIndexShards(
  database: IDBDatabase,
  profileId: string,
  section: LibrarySection,
  activeGeneration: number,
  signal?: AbortSignal,
): Promise<number> {
  const writeEpoch = playbackEpoch
  let deleted = 0

  for (;;) {
    if (!canContinueBackgroundCleanup(writeEpoch, signal)) {
      return deleted
    }

    const staleKeys = await collectSupersededSearchIndexKeys(
      database,
      profileId,
      section,
      activeGeneration,
      SEARCH_INDEX_WRITE_RECORD_BATCH_SIZE,
    )

    if (!staleKeys.length) {
      return deleted
    }

    const transaction = database.transaction('searchIndexShards', 'readwrite')
    const complete = transactionComplete(transaction)
    const store = transaction.objectStore('searchIndexShards')

    for (const key of staleKeys) {
      store.delete(key)
    }

    await complete
    deleted += staleKeys.length
    await defaultYield()
  }
}

function collectSupersededSearchIndexKeys(
  database: IDBDatabase,
  profileId: string,
  section: LibrarySection,
  activeGeneration: number,
  limit: number,
): Promise<IDBValidKey[]> {
  return new Promise<IDBValidKey[]>((resolve, reject) => {
    const transaction = database.transaction('searchIndexShards', 'readonly')
    const store = transaction.objectStore('searchIndexShards')
    /*
     * Key order is [profileId, section, generation, prefix, shardIndex], so one
     * bounded range per section covers every generation for it.
     */
    const request = store.openKeyCursor(
      IDBKeyRange.bound(
        [profileId, section],
        [profileId, section, Number.MAX_SAFE_INTEGER, [], Number.MAX_SAFE_INTEGER],
      ),
    )
    const keys: IDBValidKey[] = []
    let failed = false

    const rejectOnce = (reason: unknown): void => {
      if (!failed) {
        failed = true
        reject(reason)
      }
    }

    request.onerror = () =>
      rejectOnce(request.error ?? new Error('Unable to scan search index generations.'))
    transaction.onerror = () =>
      rejectOnce(transaction.error ?? new Error('Unable to scan search index generations.'))
    transaction.onabort = () =>
      rejectOnce(transaction.error ?? new Error('Search index generation scan was aborted.'))
    transaction.oncomplete = () => {
      if (!failed) {
        resolve(keys)
      }
    }

    request.onsuccess = () => {
      const cursor = request.result

      if (!cursor) {
        return
      }

      const key = cursor.key

      /*
       * The active generation is a single contiguous block in key order. Stepping
       * through every one of its shards to prove they are current made this scan
       * walk the whole live index (hundreds of thousands of keys at VOD scale).
       * When the cursor lands inside the active generation, jump past it in one
       * seek instead, so only genuinely superseded generations are visited.
       */
      if (Array.isArray(key) && key[2] === activeGeneration) {
        cursor.continue([profileId, section, activeGeneration + 1])
        return
      }

      if (Array.isArray(key)) {
        keys.push(key as IDBValidKey)
      }

      if (keys.length >= limit) {
        return
      }

      cursor.continue()
    }
  })
}

async function readSearchIndexPostings(
  database: IDBDatabase,
  profileId: string,
  section: LibrarySection,
  generation: number,
  prefix: string,
  shardCount: number,
): Promise<SearchIndexPosting[]> {
  if (shardCount < 1) {
    return []
  }

  return new Promise<SearchIndexPosting[]>((resolve, reject) => {
    const transaction = database.transaction('searchIndexShards', 'readonly')
    const store = transaction.objectStore('searchIndexShards')
    const range = IDBKeyRange.bound(
      [profileId, section, generation, prefix, 0],
      [profileId, section, generation, prefix, shardCount - 1],
    )
    const postings: SearchIndexPosting[] = []
    let expectedShardIndex = 0
    let completed = false

    const fail = (reason: unknown): void => {
      if (!completed) {
        completed = true
        reject(reason)
      }
    }

    transaction.oncomplete = () => {
      if (!completed) {
        if (expectedShardIndex !== shardCount) {
          fail(new Error('Local search index shard is unavailable.'))
          return
        }
        completed = true
        resolve(postings)
      }
    }
    transaction.onabort = () =>
      fail(transaction.error ?? new Error('Local search index transaction was aborted.'))
    transaction.onerror = () =>
      fail(transaction.error ?? new Error('Local search index transaction failed.'))

    const request = store.openCursor(range)
    request.onerror = () =>
      fail(request.error ?? new Error('Unable to read local search index shards.'))
    request.onsuccess = () => {
      const cursor = request.result

      if (!cursor) {
        return
      }

      const record = cursor.value

      if (
        !isSearchIndexShardRecord(
          record,
          profileId,
          section,
          generation,
          prefix,
          expectedShardIndex,
        )
      ) {
        fail(new Error('Local search index shard is invalid.'))
        try {
          transaction.abort()
        } catch {
          // The readonly transaction may already be completing.
        }
        return
      }

      const parsed = parseSearchIndexPostings(record)

      if (!parsed) {
        fail(new Error('Local search index shard payload is invalid.'))
        try {
          transaction.abort()
        } catch {
          // The readonly transaction may already be completing.
        }
        return
      }

      postings.push(...parsed)
      expectedShardIndex += 1
      cursor.continue()
    }
  })
}

async function readSearchIndexPostingStreams(
  database: IDBDatabase,
  profileId: string,
  section: LibrarySection,
  manifest: SectionManifestRecord,
  postings: readonly SearchIndexPosting[],
): Promise<StreamItem[]> {
  if (!postings.length) {
    return []
  }

  const categories = new Map(
    manifest.categories.map((category) => [category.categoryKey, category]),
  )
  const snapshots = new Map<
    string,
    {
      category: CategoryManifestEntry
      snapshotShardIndex: number
    }
  >()

  for (const posting of postings) {
    if (!isSearchIndexPosting(posting)) {
      throw new Error('Local search index posting is invalid.')
    }

    const [categoryKey, snapshotShardIndex, , snapshotUpdatedAt] = posting
    const category = categories.get(categoryKey)
    const shardOffset = snapshotShardIndex - (category?.shardBase ?? 0)

    if (
      !category ||
      shardOffset < 0 ||
      shardOffset >= category.shardCount ||
      category.updatedAt !== snapshotUpdatedAt
    ) {
      throw new Error('Local search index posting references an unavailable snapshot.')
    }

    const key = snapshotReadKey(categoryKey, snapshotShardIndex)

    if (!snapshots.has(key)) {
      snapshots.set(key, { category, snapshotShardIndex })
    }
  }

  const transaction = database.transaction('snapshots', 'readonly')
  const complete = transactionComplete(transaction)
  const store = transaction.objectStore('snapshots')
  const requests = [...snapshots.entries()].map(([key, snapshot]) => ({
    key,
    snapshot,
    request: store.get([
      profileId,
      section,
      snapshot.category.categoryKey,
      snapshot.snapshotShardIndex,
    ]),
  }))

  /*
   * Queue all reads synchronously before awaiting so older webOS engines keep
   * the transaction alive and the visible result page costs one IDB read.
   */
  const records = await Promise.all(
    requests.map(({ request }) => requestResult<unknown>(request)),
  )
  await complete

  const itemsBySnapshot = new Map<string, StreamItem[]>()

  for (let index = 0; index < requests.length; index += 1) {
    const { key, snapshot } = requests[index]
    const record = records[index]

    if (
      !isSnapshotRecord(
        record,
        profileId,
        section,
        snapshot.category.categoryKey,
        snapshot.snapshotShardIndex,
      ) ||
      record.updatedAt !== snapshot.category.updatedAt
    ) {
      throw new Error('Local search index snapshot is unavailable.')
    }

    const items = parseSnapshotItems(record)

    if (!items) {
      throw new Error('Local search index snapshot payload is invalid.')
    }

    itemsBySnapshot.set(key, items)
  }

  return postings.map((posting) => {
    const [categoryKey, snapshotShardIndex, snapshotItemIndex, , streamKey] = posting
    const item = itemsBySnapshot
      .get(snapshotReadKey(categoryKey, snapshotShardIndex))
      ?.[snapshotItemIndex]

    if (!item || favoriteKey(item) !== streamKey) {
      throw new Error('Local search index posting does not match its authoritative snapshot.')
    }

    return item
  })
}

function readCompleteCategorySnapshotItems(
  database: IDBDatabase,
  profileId: string,
  section: LibrarySection,
  category: CategoryManifestEntry,
  offset = 0,
  limit = Number.MAX_SAFE_INTEGER,
): Promise<StreamItem[]> {
  const shardBase = category.shardBase ?? 0
  const start = Math.max(0, Math.floor(offset))
  const maximum = Math.max(0, Math.floor(limit))

  return new Promise<StreamItem[]>((resolve, reject) => {
    const transaction = database.transaction('snapshots', 'readonly')
    const store = transaction.objectStore('snapshots')
    const range = IDBKeyRange.bound(
      [profileId, section, category.categoryKey, shardBase],
      [profileId, section, category.categoryKey, shardBase + category.shardCount - 1],
    )
    const items: StreamItem[] = []
    let expectedShardIndex = shardBase
    let skipped = 0
    let windowSatisfied = false
    let completed = false

    const fail = (reason: unknown): void => {
      if (!completed) {
        completed = true
        reject(reason)
      }
    }

    transaction.oncomplete = () => {
      if (!completed) {
        if (!windowSatisfied && expectedShardIndex !== shardBase + category.shardCount) {
          fail(new Error('Category snapshot shard is unavailable.'))
          return
        }
        completed = true
        resolve(items)
      }
    }
    transaction.onabort = () =>
      fail(transaction.error ?? new Error('Category snapshot transaction was aborted.'))
    transaction.onerror = () =>
      fail(transaction.error ?? new Error('Category snapshot transaction failed.'))

    const request = store.openCursor(range)
    request.onerror = () =>
      fail(request.error ?? new Error('Unable to read category snapshot shards.'))
    request.onsuccess = () => {
      const cursor = request.result

      if (!cursor) {
        return
      }

      const record = cursor.value

      if (
        !isSnapshotRecord(
          record,
          profileId,
          section,
          category.categoryKey,
          expectedShardIndex,
        ) ||
        record.updatedAt !== category.updatedAt
      ) {
        fail(new Error('Category snapshot shard is unavailable.'))
        try {
          transaction.abort()
        } catch {
          // The readonly transaction may already be completing.
        }
        return
      }

      const parsed = parseSnapshotItems(record)

      if (!parsed) {
        fail(new Error('Category snapshot payload is invalid.'))
        try {
          transaction.abort()
        } catch {
          // The readonly transaction may already be completing.
        }
        return
      }

      for (const item of parsed) {
        if (skipped < start) {
          skipped += 1
        } else if (items.length < maximum) {
          items.push(item)
        }
      }

      expectedShardIndex += 1

      if (items.length >= maximum) {
        windowSatisfied = true
        return
      }

      cursor.continue()
    }
  })
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
    isNonNegativeInteger(value.preMigrationZeroPrefixCount) &&
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

async function deleteProfileRowsWithCount(
  database: IDBDatabase,
  storeName: LibraryStoreName,
  profileId: string,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    const request = store.openCursor()
    let deleted = 0
    let failed = false

    const rejectOnce = (reason: unknown): void => {
      if (!failed) {
        failed = true
        reject(reason)
      }
    }

    request.onerror = () =>
      rejectOnce(request.error ?? new Error('Unable to evict profile library records.'))
    transaction.onerror = () =>
      rejectOnce(transaction.error ?? new Error('Profile library eviction failed.'))
    transaction.onabort = () =>
      rejectOnce(transaction.error ?? new Error('Profile library eviction was aborted.'))
    transaction.oncomplete = () => {
      if (!failed) {
        resolve(deleted)
      }
    }
    request.onsuccess = () => {
      const cursor = request.result

      if (!cursor) {
        return
      }

      if (Array.isArray(cursor.primaryKey) && cursor.primaryKey[0] === profileId) {
        cursor.delete()
        deleted += 1
      }

      cursor.continue()
    }
  })
}

async function estimateProfileStoreBytes(
  database: IDBDatabase,
  storeName: LibraryStoreName,
  profileId: string,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly')
    const store = transaction.objectStore(storeName)
    const request = store.openCursor()
    let byteEstimate = 0
    let failed = false

    const rejectOnce = (reason: unknown): void => {
      if (!failed) {
        failed = true
        reject(reason)
      }
    }

    request.onerror = () =>
      rejectOnce(request.error ?? new Error(`Unable to estimate ${storeName} storage.`))
    transaction.onerror = () =>
      rejectOnce(transaction.error ?? new Error(`Unable to estimate ${storeName} storage.`))
    transaction.onabort = () =>
      rejectOnce(transaction.error ?? new Error(`Estimating ${storeName} storage was aborted.`))
    transaction.oncomplete = () => {
      if (!failed) {
        resolve(byteEstimate)
      }
    }
    request.onsuccess = () => {
      const cursor = request.result

      if (!cursor) {
        return
      }

      const primaryKey = cursor.primaryKey
      const belongsToProfile =
        primaryKey === profileId || (Array.isArray(primaryKey) && primaryKey[0] === profileId)

      if (belongsToProfile) {
        try {
          byteEstimate += utf8ByteLength(JSON.stringify(cursor.value))
        } catch {
          // A malformed cache row cannot be safely measured, so leave it for
          // normal schema recovery rather than treating it as provider work.
        }
      }

      cursor.continue()
    }
  })
}

async function deleteSupersededSnapshotRows(
  database: IDBDatabase,
  profileId: string,
  manifests: readonly SectionManifestRecord[],
): Promise<number> {
  const activeKeys = new Set<string>()

  for (const manifest of manifests) {
    for (const category of manifest.categories) {
      for (let offset = 0; offset < category.shardCount; offset += 1) {
        activeKeys.add(
          `${manifest.section}\u0000${category.categoryKey}\u0000${(category.shardBase ?? 0) + offset}`,
        )
      }
    }
  }

  return new Promise<number>((resolve, reject) => {
    const transaction = database.transaction('snapshots', 'readwrite')
    const store = transaction.objectStore('snapshots')
    const request = store.openCursor()
    let deleted = 0
    let failed = false

    const rejectOnce = (reason: unknown): void => {
      if (!failed) {
        failed = true
        reject(reason)
      }
    }

    request.onerror = () =>
      rejectOnce(request.error ?? new Error('Unable to evict superseded snapshots.'))
    transaction.onerror = () =>
      rejectOnce(transaction.error ?? new Error('Superseded snapshot eviction failed.'))
    transaction.onabort = () =>
      rejectOnce(transaction.error ?? new Error('Superseded snapshot eviction was aborted.'))
    transaction.oncomplete = () => {
      if (!failed) {
        resolve(deleted)
      }
    }
    request.onsuccess = () => {
      const cursor = request.result

      if (!cursor) {
        return
      }

      const value = cursor.value as Partial<SnapshotRecord>
      const activeKey =
        typeof value.section === 'string' &&
        typeof value.categoryKey === 'string' &&
        typeof value.shardIndex === 'number'
          ? `${value.section}\u0000${value.categoryKey}\u0000${value.shardIndex}`
          : null

      if (
        Array.isArray(cursor.primaryKey) &&
        cursor.primaryKey[0] === profileId &&
        (!activeKey || !activeKeys.has(activeKey))
      ) {
        cursor.delete()
        deleted += 1
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
   *
   * Artwork endpoints (icon/cover/seriesCover) are also legitimate display
   * data, not credentialed transport. The recursive strip removes them because
   * they are URL-like, which left cached snapshots with no poster/logo source
   * and forced every browse/search card to a text placeholder. The credentialed
   * playback URL (directSource) is excluded separately above, and the same
   * artwork fields are already persisted for favorites/resume via
   * toStoredStream, so restore them here from the whitelisted stored record.
   */
  return {
    ...sanitized,
    id: stored.id,
    name: stored.name,
    section: stored.section,
    categoryId: stored.categoryId,
    icon: retainedArtwork(stored.icon),
    cover: retainedArtwork(stored.cover),
    seriesCover: retainedArtwork(stored.seriesCover),
    searchName: stored.searchName,
    // Preserve the guide-mapping identifier verbatim. It is a plain token, not
    // credentialed transport, but a scheme-like value (e.g. "sky:sports") could
    // otherwise be dropped by the URL-like recursive strip above.
    epgChannelId: stored.epgChannelId,
  }
}

/**
 * Preserve a provider artwork endpoint verbatim, or return undefined when the
 * field is absent. Keeping the key undefined rather than an empty string lets
 * the renderer fall through to its text/monogram placeholder cleanly.
 */
function retainedArtwork(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
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
  if (value instanceof Date) {
    return new Date(value.getTime()) as T
  }

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
  kind: LibraryEpgKind,
): value is EpgRecord {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.schemaVersion === LIBRARY_SCHEMA_VERSION &&
    value.profileId === profileId &&
    value.streamId === streamId &&
    value.kind === kind &&
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
    (value.lastFailureAt === undefined || isFiniteNumber(value.lastFailureAt)) &&
    (value.lastFailureDetail === undefined || isSyncSectionFailureDetail(value.lastFailureDetail))
  )
}

function isSyncSectionFailureDetail(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.failureStage === 'string' &&
    typeof value.failureKind === 'string' &&
    isFiniteNumber(value.updatedAt) &&
    (value.rawItemCount === undefined || isNonNegativeInteger(value.rawItemCount)) &&
    (value.acceptedItemCount === undefined || isNonNegativeInteger(value.acceptedItemCount)) &&
    (value.streamedRecordCount === undefined || isNonNegativeInteger(value.streamedRecordCount)) &&
    (value.bytesReceived === undefined || isNonNegativeInteger(value.bytesReceived)) &&
    (value.arrayClosed === undefined || typeof value.arrayClosed === 'boolean') &&
    (value.elapsedMs === undefined || isFiniteNumber(value.elapsedMs)) &&
    (value.refused === undefined || typeof value.refused === 'boolean')
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