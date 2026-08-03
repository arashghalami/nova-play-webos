import { isProviderError, isProviderRefusal } from '../provider-error'
import { performanceTrace } from '../performance-trace'
import type {
  ProviderBroker,
  ProviderCatalogSyncPreflight,
} from '../provider-broker'
import { internalFaultTraceData } from './internal-fault-diagnostics'
import type { Category, LibrarySection, StreamItem } from '../types'
import {
  IndexedDbCatalogRepository,
  LibraryWriteAbortedError,
  type CooperativeWriteOptions,
  type LibraryCoverage,
  type LibrarySyncSectionState,
  type SnapshotPublishStage,
} from './catalog-repository'

export const CATALOG_SYNC_SECTIONS: readonly LibrarySection[] = ['live', 'vod', 'series']
export const CATALOG_SYNC_DAILY_REQUEST_LIMIT = 6
export const CATALOG_SYNC_HEADER_TIMEOUT_MS = 15_000
export const CATALOG_SYNC_TOTAL_TIMEOUT_MS = 120_000
export const CATALOG_SYNC_SUCCESS_COOLDOWN_MS = 24 * 60 * 60 * 1000
export const CATALOG_SYNC_FAILURE_COOLDOWN_INITIAL_MS = 6 * 60 * 60 * 1000
export const CATALOG_SYNC_FAILURE_COOLDOWN_MAX_MS = 24 * 60 * 60 * 1000
export const CATALOG_SYNC_STALE_RUN_MS = 10 * 60 * 1000
export const CATALOG_SYNC_REQUESTS_PER_COMPLETE_RUN = 6
/**
 * Keep per-category partial publication bounded below the repository's physical
 * snapshot limit so each parser checkpoint is one cooperative cache unit.
 */
export const PARTIAL_CATEGORY_FLUSH_ITEMS = 128
/**
 * The physical VOD measurement completed at 79,696,256 bytes. 96 MiB leaves
 * more than 20 MiB of headroom while retaining a bounded sync-lane response.
 */
export const VOD_SYNC_MAX_RESPONSE_BYTES = 96 * 1024 * 1024
/**
 * Explicit VOD measurement runs use this temporary discovery ceiling. It is not
 * the normal production setting and exists only for controlled sizing passes.
 */
export const VOD_SYNC_MEASUREMENT_MAX_RESPONSE_BYTES = 192 * 1024 * 1024

export type CatalogSyncProvider = Pick<
  ProviderBroker,
  'backgroundCategories' | 'backgroundScanSection'
> & {
  canBeginCatalogSync?: (
    requestCount: number,
  ) => ProviderCatalogSyncPreflight
  /**
   * The broker reports only requests that crossed the transport handoff. It is
   * intentionally separate from coordinator attempts, which can fail before
   * a provider request exists.
   */
  issuedRequestCount?: (budget: 'sync') => number
}

type CatalogSyncSectionOutcome = {
  section: LibrarySection
  mode: 'whole-section' | 'category-slice' | 'skipped'
  success: boolean
  categoryId?: string
  reason?: 'category-request-failed' | 'scan-failed' | 'no-categories' | 'cancelled'
  refused?: boolean
}

type CatalogSyncSectionRequestCounts = {
  attempted: number
  issued: number | null
}

export type CatalogSyncSectionResult = CatalogSyncSectionOutcome & {
  /**
   * Coordinator calls attempted for this section. This includes pre-handoff
   * failures and therefore is not interchangeable with issuedRequestCount.
   */
  attemptedRequestCount: number
  /**
   * Transport handoffs observed by ProviderBroker for this section. Fixture
   * providers that do not expose broker accounting report null.
   */
  issuedRequestCount: number | null
  categoryId?: string
  reason?: 'category-request-failed' | 'scan-failed' | 'no-categories' | 'cancelled'
  refused?: boolean
}

export type CatalogSyncResult =
  | {
      status: 'completed' | 'failed' | 'cancelled'
      /** Coordinator attempts across every section. */
      requestCount: number
      /** Broker-issued/debited requests across every section, if observable. */
      issuedRequestCount: number | null
      nextDueAt: number
      sections: CatalogSyncSectionResult[]
    }
  | {
      status: 'busy' | 'cooldown' | 'deferred'
      requestCount: 0
      issuedRequestCount: 0
      nextDueAt?: number
      sections: []
    }

export type CatalogSyncRunOptions = {
  /**
   * An explicitly invoked, section-scoped recovery scan. It reuses the persisted
   * category manifest, so its provider plan is exactly one section scan.
   */
  section?: LibrarySection
  /**
   * Applies only to an explicitly scoped section scan. Normal complete runs
   * retain the default provider response bound.
   */
  maxResponseBytes?: number
}

export type CatalogSyncOptions = {
  now?: () => number
  successCooldownMs?: number
  failureCooldownInitialMs?: number
  failureCooldownMaxMs?: number
  staleRunMs?: number
  onSnapshotPut?: CooperativeWriteOptions['onSnapshotPut']
  /**
   * Permits payload-free internal exception details only for explicit device
   * diagnostic builds. Provider failures remain fully classified and sanitized.
   */
  internalFaultDiagnostics?: boolean
}

/**
 * Acquires provider catalog data only through ProviderBroker's background lane.
 *
 * A normal due run makes exactly six serial requests: three category manifests
 * followed by one incremental, whole-section scan per section. A section whose
 * whole scan failed switches on the next scheduled run to one category slice at
 * its persisted cursor, so it never escalates into an in-run category crawl.
 */
export class CatalogSyncCoordinator {
  private readonly provider: CatalogSyncProvider
  private readonly repository: IndexedDbCatalogRepository
  private readonly now: () => number
  private readonly successCooldownMs: number
  private readonly failureCooldownInitialMs: number
  private readonly failureCooldownMaxMs: number
  private readonly staleRunMs: number
  private readonly onSnapshotPut?: CooperativeWriteOptions['onSnapshotPut']
  private readonly internalFaultDiagnostics: boolean
  private activeController: AbortController | null = null
  private runSequence = 0

  constructor(
    provider: CatalogSyncProvider,
    repository: IndexedDbCatalogRepository,
    options: CatalogSyncOptions = {},
  ) {
    this.provider = provider
    this.repository = repository
    this.now = options.now ?? Date.now
    this.successCooldownMs = options.successCooldownMs ?? CATALOG_SYNC_SUCCESS_COOLDOWN_MS
    this.failureCooldownInitialMs =
      options.failureCooldownInitialMs ?? CATALOG_SYNC_FAILURE_COOLDOWN_INITIAL_MS
    this.failureCooldownMaxMs =
      options.failureCooldownMaxMs ?? CATALOG_SYNC_FAILURE_COOLDOWN_MAX_MS
    this.staleRunMs = options.staleRunMs ?? CATALOG_SYNC_STALE_RUN_MS
    this.onSnapshotPut = options.onSnapshotPut
    this.internalFaultDiagnostics = options.internalFaultDiagnostics === true
  }

  get isRunning(): boolean {
    return this.activeController !== null
  }

  cancel(): void {
    this.activeController?.abort()
  }

  async sync(
    profileId: string,
    runOptions: CatalogSyncRunOptions = {},
  ): Promise<CatalogSyncResult> {
    const now = this.now()
    const priorMeta = await this.repository.getMeta(profileId)
    const targetedSection = runOptions.section
    const plannedSections = targetedSection
      ? [targetedSection]
      : CATALOG_SYNC_SECTIONS
    const plannedRequestCount = targetedSection
      ? 1
      : CATALOG_SYNC_REQUESTS_PER_COMPLETE_RUN

    if (
      !targetedSection &&
      priorMeta?.nextDueAt !== undefined &&
      priorMeta.nextDueAt > now
    ) {
      return {
        status: 'cooldown',
        requestCount: 0,
        issuedRequestCount: 0,
        nextDueAt: priorMeta.nextDueAt,
        sections: [],
      }
    }

    if (this.activeController) {
      return { status: 'busy', requestCount: 0, issuedRequestCount: 0, sections: [] }
    }

    const preflight = this.provider.canBeginCatalogSync?.(plannedRequestCount)

    if (preflight && !preflight.allowed) {
      return {
        status: 'deferred',
        requestCount: 0,
        issuedRequestCount: 0,
        nextDueAt: preflight.nextEligibleAt,
        sections: [],
      }
    }

    const controller = new AbortController()
    this.activeController = controller
    const runId = `catalog-sync-${now}-${this.runSequence += 1}`

    if (!await this.repository.tryBeginSync(profileId, runId, this.staleRunMs)) {
      this.activeController = null
      return { status: 'busy', requestCount: 0, issuedRequestCount: 0, sections: [] }
    }

    const sectionStates = new Map<LibrarySection, LibrarySyncSectionState>()
    for (const section of plannedSections) {
      const manifest = await this.repository.getManifest(profileId, section)
      sectionStates.set(
        section,
        normalizeSectionState(
          priorMeta?.sync.sections?.[section],
          manifest?.coverage.state ?? 'none',
        ),
      )
    }

    const categoriesBySection = new Map<LibrarySection, Category[]>()
    const sections: CatalogSyncSectionOutcome[] = []
    const sectionRequestCounts = new Map<LibrarySection, CatalogSyncSectionRequestCounts>(
      plannedSections.map((section) => [
        section,
        {
          attempted: 0,
          issued: this.provider.issuedRequestCount ? 0 : null,
        },
      ]),
    )
    const issuedRequestCountAtStart = this.provider.issuedRequestCount?.('sync')
    let requestCount = 0

    const beginProviderRequest = (section: LibrarySection): (() => void) => {
      const counts = sectionRequestCounts.get(section)!

      counts.attempted += 1
      requestCount += 1
      const issuedRequestCountBefore = this.provider.issuedRequestCount?.('sync')
      let finished = false

      return () => {
        if (finished || issuedRequestCountBefore === undefined || counts.issued === null) {
          return
        }

        finished = true
        const issuedRequestCountAfter =
          this.provider.issuedRequestCount?.('sync') ?? issuedRequestCountBefore
        counts.issued += Math.max(0, issuedRequestCountAfter - issuedRequestCountBefore)
      }
    }
    let failed = false
    let cancelled = false
    let refusal = false

    try {
      for (const section of plannedSections) {
        if (controller.signal.aborted || refusal) {
          break
        }

        if (targetedSection) {
          const manifest = await this.repository.getManifest(profileId, section)
          const categories = categoriesFromManifest(manifest)

          if (!categories.length) {
            failed = true
            sections.push({
              section,
              mode: 'skipped',
              success: false,
              reason: 'no-categories',
            })
          } else {
            categoriesBySection.set(section, categories)
          }

          continue
        }

        const attemptAt = this.now()

        const finishRequest = beginProviderRequest(section)

        try {
          const categories = uniqueCategories(
            await this.provider.backgroundCategories(
              section,
              controller.signal,
              CATALOG_SYNC_HEADER_TIMEOUT_MS,
            ),
          )
          finishRequest()
          categoriesBySection.set(section, categories)

          // The manifest is updated only after its own request succeeds. Its
          // merge policy retains routes for categories missing from this response.
          await this.repository.putSectionManifest(profileId, section, categories, runId)
          await this.updateSectionState(
            profileId,
            runId,
            section,
            sectionStates,
            { lastAttemptAt: attemptAt },
          )
        } catch (reason) {
          finishRequest()
          if (isCancelled(reason, controller.signal)) {
            cancelled = true
            break
          }

          failed = true
          refusal = isProviderRefusal(reason)
          await this.updateSectionState(
            profileId,
            runId,
            section,
            sectionStates,
            {
              lastAttemptAt: attemptAt,
              lastFailureAt: this.now(),
            },
          )
          sections.push({
            section,
            mode: 'skipped',
            success: false,
            reason: 'category-request-failed',
          })
        }
      }

      for (const section of plannedSections) {
        if (controller.signal.aborted || refusal) {
          break
        }

        const categories = categoriesBySection.get(section)

        if (!categories) {
          continue
        }

        const state = sectionStates.get(section) ?? normalizeSectionState(undefined, 'none')

        if (!targetedSection && state.wholeSectionFailureCount > 0) {
          const result = await this.syncCategorySlice(
            profileId,
            runId,
            section,
            categories,
            state,
            sectionStates,
            controller.signal,
            () => beginProviderRequest(section),
          )
          sections.push(result)

          if (!result.success) {
            if (result.reason === 'cancelled') {
              cancelled = true
              break
            }

            failed = true
            refusal ||= result.refused === true
          }

          continue
        }

        const result = await this.syncWholeSection(
          profileId,
          runId,
          section,
          categories,
          state,
          sectionStates,
          controller.signal,
          () => beginProviderRequest(section),
          runOptions.maxResponseBytes ?? syncResponseByteLimit(section),
        )
        sections.push(result)

        if (!result.success) {
          if (result.reason === 'cancelled') {
            cancelled = true
            break
          }

          failed = true
          // A refusal ends the run immediately. Ordinary section failures are
          // recorded for the next scheduled category-slice attempt.
          refusal ||= result.refused === true
        }
      }
    } finally {
      const currentTime = this.now()
      const outcome = cancelled || controller.signal.aborted
        ? 'cancelled'
        : failed
          ? 'failed'
          : 'completed'
      const updatedMeta = await this.repository.updateSyncState(
        profileId,
        runId,
        (state) => {
          const previousFailures = state.failureCount ?? 0
          const failureCount =
            outcome === 'failed'
              ? previousFailures + 1
              : outcome === 'completed'
                ? 0
                : previousFailures

          return {
            ...state,
            failureCount,
          }
        },
      )
      const failureCount = updatedMeta?.sync.failureCount ?? priorMeta?.sync.failureCount ?? 0
      const nextDueAt =
        outcome === 'completed'
          ? currentTime + this.successCooldownMs
          : outcome === 'failed'
            ? currentTime + failureCooldownMs(
                failureCount,
                this.failureCooldownInitialMs,
                this.failureCooldownMaxMs,
              )
            : currentTime + this.failureCooldownInitialMs

      await this.repository.finishSync(
        profileId,
        runId,
        outcome === 'completed',
        nextDueAt,
      )

      if (this.activeController === controller) {
        this.activeController = null
      }

      const issuedRequestCountAtEnd = this.provider.issuedRequestCount?.('sync')
      const issuedRequestCount =
        issuedRequestCountAtStart === undefined || issuedRequestCountAtEnd === undefined
          ? null
          : Math.max(0, issuedRequestCountAtEnd - issuedRequestCountAtStart)
      const reportedSections: CatalogSyncSectionResult[] = sections.map((section) => {
        const counts = sectionRequestCounts.get(section.section)!

        return {
          ...section,
          attemptedRequestCount: counts.attempted,
          issuedRequestCount: counts.issued,
        }
      })

      return {
        status: outcome,
        requestCount,
        issuedRequestCount,
        nextDueAt,
        sections: reportedSections,
      }
    }
  }

  private async syncWholeSection(
    profileId: string,
    runId: string,
    section: LibrarySection,
    categories: readonly Category[],
    state: LibrarySyncSectionState,
    states: Map<LibrarySection, LibrarySyncSectionState>,
    signal: AbortSignal,
    recordRequest: () => (() => void),
    maxResponseBytes?: number,
  ): Promise<CatalogSyncSectionOutcome> {
    const attemptAt = this.now()
    const incrementalPublication = state.coverage !== 'complete'
    const buckets = incrementalPublication ? null : new Map<string, StreamItem[]>()
    const categoryById = new Map(categories.map((category) => [category.id, category]))
    const pendingByCategory = new Map<string, StreamItem[]>()
    const partialCategoryKeys = new Set<string>()
    const heap = createHeapSampler()
    let streamedRecordCount = 0
    let nextHeapSampleAt = 1_024
    let failureStage: CatalogSyncFailureStage = 'provider-scan'
    let publishStage: SnapshotPublishStage | null = null

    const categoryForKey = (categoryKey: string): Category => {
      const known = categoryById.get(categoryKey)

      if (known) {
        return known
      }

      const category = {
        id: categoryKey,
        name: categoryKey === 'uncategorized' ? 'Uncategorized' : `Category ${categoryKey}`,
      }
      categoryById.set(categoryKey, category)
      return category
    }

    const flushPartialCategory = async (categoryKey: string): Promise<void> => {
      const items = pendingByCategory.get(categoryKey)

      if (!items?.length) {
        return
      }

      pendingByCategory.delete(categoryKey)
      failureStage = 'snapshot-publish'
      await this.repository.appendPartialCategorySnapshot(
        {
          profileId,
          section,
          category: categoryForKey(categoryKey),
          items,
          runId,
        },
        {
          signal,
          onSnapshotPut: this.onSnapshotPut,
          onPublishStage: (stage) => {
            publishStage = stage
          },
        },
      )
      partialCategoryKeys.add(categoryKey)
      failureStage = 'provider-scan'
    }

    const flushPartialSnapshots = async (): Promise<void> => {
      for (const categoryKey of [...pendingByCategory.keys()]) {
        await flushPartialCategory(categoryKey)
      }
    }

    const finishRequest = recordRequest()

    try {
      if (incrementalPublication) {
        failureStage = 'snapshot-publish'
        await this.repository.preparePartialSectionSnapshotRun(profileId, section, runId)
        failureStage = 'provider-scan'
      }

      await this.provider.backgroundScanSection(section, {
        signal,
        responseTimeoutMs: CATALOG_SYNC_HEADER_TIMEOUT_MS,
        timeoutMs: CATALOG_SYNC_TOTAL_TIMEOUT_MS,
        maxResponseBytes,
        onMatches: async (batch) => {
          streamedRecordCount += batch.length

          if (streamedRecordCount >= nextHeapSampleAt) {
            heap.sample()
            nextHeapSampleAt = streamedRecordCount + 1_024
          }

          for (const item of batch) {
            const categoryKey = item.categoryId || 'uncategorized'

            if (incrementalPublication) {
              const pending = pendingByCategory.get(categoryKey) ?? []
              pending.push(item)
              pendingByCategory.set(categoryKey, pending)

              if (pending.length >= PARTIAL_CATEGORY_FLUSH_ITEMS) {
                await flushPartialCategory(categoryKey)
              }
              continue
            }

            const existing = buckets!.get(categoryKey)

            if (existing) {
              existing.push(item)
            } else {
              buckets!.set(categoryKey, [item])
            }
          }
        },
      })

      finishRequest()
      failureStage = 'snapshot-publish'

      if (incrementalPublication) {
        await flushPartialSnapshots()

        for (const category of categories) {
          if (partialCategoryKeys.has(category.id)) {
            continue
          }

          await this.repository.appendPartialCategorySnapshot(
            {
              profileId,
              section,
              category,
              items: [],
              runId,
            },
            {
              signal,
              onSnapshotPut: this.onSnapshotPut,
              onPublishStage: (stage) => {
                publishStage = stage
              },
            },
          )
          partialCategoryKeys.add(category.id)
        }

        await this.repository.promotePartialSectionSnapshots(profileId, section, runId)
      } else {
        await this.repository.replaceSectionSnapshots(
          {
            profileId,
            section,
            runId,
            snapshots: snapshotsForWholeSection(categories, buckets!),
          },
          {
            signal,
            onSnapshotPut: this.onSnapshotPut,
            onPublishStage: (stage) => {
              publishStage = stage
            },
          },
        )
      }
      failureStage = 'manifest-read'
      const manifest = await this.repository.getManifest(profileId, section)

      /*
       * Search postings are derived only after the strict array has closed and
       * the new manifest is authoritative. A failed index build never rolls
       * back a valid catalog publish: search remains honestly unavailable until
       * its next local rebuild instead.
       */
      try {
        const [indexResult] = await this.repository.rebuildSearchIndexes(
          profileId,
          [section],
          signal,
        )
        performanceTrace.event('library', 'catalog-search-index-published', {
          section,
          coverage: indexResult?.coverage ?? 'none',
          itemCount: indexResult?.coverage === 'complete' ? indexResult.itemCount : 0,
          postingCount: indexResult?.coverage === 'complete' ? indexResult.postingCount : 0,
          elapsedMs: indexResult?.elapsedMs ?? null,
        })
      } catch {
        performanceTrace.event('library', 'catalog-search-index-published', {
          section,
          coverage: 'none',
          itemCount: 0,
          postingCount: 0,
          elapsedMs: null,
        })
      }

      failureStage = 'sync-state'
      await this.updateSectionState(profileId, runId, section, states, {
        coverage: manifest?.coverage.state ?? state.coverage,
        wholeSectionFailureCount: 0,
        nextCategoryCursor: 0,
        lastAttemptAt: attemptAt,
        lastSuccessAt: this.now(),
      })
      traceWholeSectionMemory(
        section,
        'completed',
        streamedRecordCount,
        maxResponseBytes,
        heap,
      )

      return { section, mode: 'whole-section', success: true }
    } catch (reason) {
      finishRequest()

      if (isCancelled(reason, signal)) {
        traceWholeSectionMemory(
          section,
          'cancelled',
          streamedRecordCount,
          maxResponseBytes,
          heap,
        )
        return { section, mode: 'whole-section', success: false, reason: 'cancelled' }
      }

      const refused = isProviderRefusal(reason)
      traceWholeSectionMemory(
        section,
        'failed',
        streamedRecordCount,
        maxResponseBytes,
        heap,
      )
      traceSectionFailure(
        section,
        'whole-section',
        failureStage,
        publishStage,
        reason,
        refused,
        this.internalFaultDiagnostics,
      )
      const manifest = await this.repository.getManifest(profileId, section)
      await this.updateSectionState(profileId, runId, section, states, {
        coverage: manifest?.coverage.state ?? state.coverage,
        wholeSectionFailureCount: state.wholeSectionFailureCount + 1,
        nextCategoryCursor: firstIncompleteCategoryCursor(categories, manifest),
        lastAttemptAt: attemptAt,
        lastFailureAt: this.now(),
      })
      return {
        section,
        mode: 'whole-section',
        success: false,
        reason: 'scan-failed',
        refused,
      }
    }
  }

  private async syncCategorySlice(
    profileId: string,
    runId: string,
    section: LibrarySection,
    categories: readonly Category[],
    state: LibrarySyncSectionState,
    states: Map<LibrarySection, LibrarySyncSectionState>,
    signal: AbortSignal,
    recordRequest: () => (() => void),
  ): Promise<CatalogSyncSectionOutcome> {
    if (!categories.length) {
      return {
        section,
        mode: 'category-slice',
        success: false,
        reason: 'no-categories',
      }
    }

    const recoveryManifest = await this.repository.getManifest(profileId, section)
    const incompleteCursor =
      state.coverage === 'partial'
        ? incompleteCategoryCursor(categories, recoveryManifest)
        : null
    const cursor = incompleteCursor ?? state.nextCategoryCursor % categories.length
    const category = categories[cursor]
    const attemptAt = this.now()
    const items: StreamItem[] = []
    let failureStage: CatalogSyncFailureStage = 'provider-scan'
    let publishStage: SnapshotPublishStage | null = null

    const finishRequest = recordRequest()

    try {
      await this.provider.backgroundScanSection(section, {
        signal,
        categoryId: category.id,
        responseTimeoutMs: CATALOG_SYNC_HEADER_TIMEOUT_MS,
        timeoutMs: CATALOG_SYNC_TOTAL_TIMEOUT_MS,
        maxResponseBytes: syncResponseByteLimit(section),
        onMatches: (batch) => items.push(...batch),
      })

      finishRequest()
      failureStage = 'snapshot-publish'
      await this.repository.replaceCategorySnapshot(
        {
          profileId,
          section,
          category,
          items,
          runId,
        },
        {
          signal,
          onSnapshotPut: this.onSnapshotPut,
          onPublishStage: (stage) => {
            publishStage = stage
          },
        },
      )
      failureStage = 'manifest-read'
      const manifest = await this.repository.getManifest(profileId, section)

      try {
        const [indexResult] = await this.repository.rebuildSearchIndexes(
          profileId,
          [section],
          signal,
        )
        performanceTrace.event('library', 'catalog-search-index-published', {
          section,
          coverage: indexResult?.coverage ?? 'none',
          itemCount: indexResult?.coverage === 'complete' ? indexResult.itemCount : 0,
          postingCount: indexResult?.coverage === 'complete' ? indexResult.postingCount : 0,
          elapsedMs: indexResult?.elapsedMs ?? null,
        })
      } catch {
        performanceTrace.event('library', 'catalog-search-index-published', {
          section,
          coverage: 'none',
          itemCount: 0,
          postingCount: 0,
          elapsedMs: null,
        })
      }

      const nextIncompleteCursor =
        state.coverage === 'partial'
          ? incompleteCategoryCursor(categories, manifest)
          : null
      const nextCategoryCursor =
        state.coverage === 'partial'
          ? nextIncompleteCursor ?? 0
          : (cursor + 1) % categories.length
      const recoveryComplete =
        state.coverage === 'partial'
          ? nextIncompleteCursor === null
          : nextCategoryCursor === 0
      failureStage = 'sync-state'
      await this.updateSectionState(profileId, runId, section, states, {
        coverage: manifest?.coverage.state ?? state.coverage,
        wholeSectionFailureCount:
          recoveryComplete ? 0 : state.wholeSectionFailureCount,
        nextCategoryCursor,
        lastAttemptAt: attemptAt,
        lastSuccessAt: this.now(),
      })

      return {
        section,
        mode: 'category-slice',
        success: true,
        categoryId: category.id,
      }
    } catch (reason) {
      finishRequest()

      if (isCancelled(reason, signal)) {
        return {
          section,
          mode: 'category-slice',
          success: false,
          categoryId: category.id,
          reason: 'cancelled',
        }
      }

      const refused = isProviderRefusal(reason)
      traceSectionFailure(
        section,
        'category-slice',
        failureStage,
        publishStage,
        reason,
        refused,
        this.internalFaultDiagnostics,
      )
      const manifest = await this.repository.getManifest(profileId, section)
      await this.updateSectionState(profileId, runId, section, states, {
        coverage: manifest?.coverage.state ?? state.coverage,
        lastAttemptAt: attemptAt,
        lastFailureAt: this.now(),
      })
      return {
        section,
        mode: 'category-slice',
        success: false,
        categoryId: category.id,
        reason: 'scan-failed',
        refused,
      }
    }
  }

  private async updateSectionState(
    profileId: string,
    runId: string,
    section: LibrarySection,
    states: Map<LibrarySection, LibrarySyncSectionState>,
    patch: Partial<LibrarySyncSectionState>,
  ): Promise<void> {
    const current = states.get(section) ?? normalizeSectionState(undefined, 'none')
    const next = { ...current, ...patch }
    states.set(section, next)

    await this.repository.updateSyncState(profileId, runId, (state) => ({
      ...state,
      sections: {
        ...state.sections,
        [section]: next,
      },
    }))
  }
}

function normalizeSectionState(
  state: LibrarySyncSectionState | undefined,
  coverage: LibraryCoverage,
): LibrarySyncSectionState {
  return {
    coverage: state?.coverage ?? coverage,
    wholeSectionFailureCount: state?.wholeSectionFailureCount ?? 0,
    nextCategoryCursor: state?.nextCategoryCursor ?? 0,
    lastAttemptAt: state?.lastAttemptAt,
    lastSuccessAt: state?.lastSuccessAt,
    lastFailureAt: state?.lastFailureAt,
  }
}

function syncResponseByteLimit(section: LibrarySection): number | undefined {
  return section === 'vod' ? VOD_SYNC_MAX_RESPONSE_BYTES : undefined
}

function firstIncompleteCategoryCursor(
  categories: readonly Category[],
  manifest: Awaited<ReturnType<IndexedDbCatalogRepository['getManifest']>>,
): number {
  return incompleteCategoryCursor(categories, manifest) ?? 0
}

function incompleteCategoryCursor(
  categories: readonly Category[],
  manifest: Awaited<ReturnType<IndexedDbCatalogRepository['getManifest']>>,
): number | null {
  const firstIncomplete = categories.findIndex((category) =>
    manifest?.categories.find((entry) => entry.categoryKey === category.id)?.coverage !== 'complete',
  )

  return firstIncomplete >= 0 ? firstIncomplete : null
}

function categoriesFromManifest(
  manifest: Awaited<ReturnType<IndexedDbCatalogRepository['getManifest']>>,
): Category[] {
  return manifest?.categories.map((category) => ({
    id: category.categoryId,
    name: category.name,
  })) ?? []
}

function uniqueCategories(categories: readonly Category[]): Category[] {
  const unique = new Map<string, Category>()

  for (const category of categories) {
    if (category.id && !unique.has(category.id)) {
      unique.set(category.id, category)
    }
  }

  return [...unique.values()]
}

function snapshotsForWholeSection(
  categories: readonly Category[],
  buckets: ReadonlyMap<string, readonly StreamItem[]>,
): Array<{ category: Category; categoryKey: string; items: readonly StreamItem[] }> {
  const categoryById = new Map<string, Category>()

  for (const category of categories) {
    categoryById.set(category.id, category)
  }

  for (const categoryId of buckets.keys()) {
    if (!categoryById.has(categoryId)) {
      categoryById.set(categoryId, {
        id: categoryId,
        name: categoryId === 'uncategorized' ? 'Uncategorized' : `Category ${categoryId}`,
      })
    }
  }

  return [...categoryById.values()].map((category) => ({
    category,
    categoryKey: category.id,
    items: buckets.get(category.id) ?? [],
  }))
}

type HeapSampler = {
  initialUsedJsHeapSize: number | null
  peakUsedJsHeapSize: number | null
  sample: () => void
  finish: () => number | null
}

function createHeapSampler(): HeapSampler {
  const initialUsedJsHeapSize = usedJsHeapSize()
  let peakUsedJsHeapSize = initialUsedJsHeapSize

  const sample = (): void => {
    const used = usedJsHeapSize()

    if (used !== null && (peakUsedJsHeapSize === null || used > peakUsedJsHeapSize)) {
      peakUsedJsHeapSize = used
    }
  }

  return {
    initialUsedJsHeapSize,
    get peakUsedJsHeapSize() {
      return peakUsedJsHeapSize
    },
    sample,
    finish: () => {
      sample()
      return usedJsHeapSize()
    },
  }
}

function usedJsHeapSize(): number | null {
  const memory = (performance as Performance & {
    memory?: { usedJSHeapSize?: unknown }
  }).memory
  const value = memory?.usedJSHeapSize

  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null
}

function traceWholeSectionMemory(
  section: LibrarySection,
  outcome: 'completed' | 'failed' | 'cancelled',
  streamedRecordCount: number,
  maxResponseBytes: number | undefined,
  heap: HeapSampler,
): void {
  performanceTrace.event('library', 'catalog-sync-section-memory', {
    section,
    mode: 'whole-section',
    outcome,
    streamedRecordCount,
    maxResponseBytes: maxResponseBytes ?? null,
    initialUsedJsHeapSize: heap.initialUsedJsHeapSize,
    peakUsedJsHeapSize: heap.peakUsedJsHeapSize,
    finalUsedJsHeapSize: heap.finish(),
  })
}

function failureCooldownMs(
  failureCount: number,
  initialMs: number,
  maximumMs: number,
): number {
  const exponent = Math.max(0, failureCount - 1)
  return Math.min(maximumMs, initialMs * Math.pow(2, exponent))
}

type CatalogSyncFailureStage =
  | 'provider-scan'
  | 'snapshot-publish'
  | 'manifest-read'
  | 'sync-state'

function traceSectionFailure(
  section: LibrarySection,
  mode: 'whole-section' | 'category-slice',
  failureStage: CatalogSyncFailureStage,
  publishStage: SnapshotPublishStage | null,
  reason: unknown,
  refused: boolean,
  includeInternalFaultDiagnostics: boolean,
): void {
  const providerError = isProviderError(reason)
  const failureSource = providerError
    ? 'provider'
    : reason instanceof LibraryWriteAbortedError
      ? 'library-write'
      : 'unknown'

  /*
   * Provider/network errors can carry URLs, credentials, or response fragments,
   * so their existing classification remains the only trace data. Explicit probe
   * builds can additionally expose a bounded, payload-free signature for local
   * application faults to avoid spending another provider request on a missing
   * runtime identifier.
   */
  performanceTrace.event('library', 'catalog-sync-section-failed', {
    section,
    mode,
    failureStage,
    publishStage,
    refused,
    failureSource,
    providerKind: providerError ? reason.kind : null,
    exceptionType: reason instanceof Error ? reason.name : typeof reason,
    ...internalFaultTraceData(
      reason,
      providerError,
      includeInternalFaultDiagnostics,
    ),
  })
}

function isCancelled(reason: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    reason instanceof LibraryWriteAbortedError ||
    (isProviderError(reason) && reason.kind === 'cancelled')
  )
}