import { isProviderError, isProviderRefusal } from '../provider-error'
import { performanceTrace } from '../performance-trace'
import type {
  ProviderBroker,
  ProviderCatalogSyncPreflight,
} from '../provider-broker'
import { internalFaultTraceData } from './internal-fault-diagnostics'
import type { SectionScanResult } from '../xtream-client'
import type { Category, LibrarySection, StreamItem } from '../types'
import {
  assessLibraryStorageHeadroom,
  measureLibraryStorage,
  type LibraryStorageHeadroom,
} from './storage-budget'
import {
  clearSyncBreadcrumb,
  degradedFlushItems,
  nextDegradationCount,
  readSyncBreadcrumb,
  writeSyncBreadcrumb,
  type BreadcrumbStorage,
  type SyncBreadcrumbStage,
} from './sync-breadcrumb'
import {
  EmptySectionPublicationError,
  IndexedDbCatalogRepository,
  LibraryWriteAbortedError,
  type CooperativeWriteOptions,
  type LibraryCoverage,
  type LibrarySyncSectionFailureDetail,
  type LibrarySyncSectionState,
  type PartialSectionPublication,
  type RebuildableCacheEvictionResult,
  type SnapshotPublishStage,
} from './catalog-repository'

export const CATALOG_SYNC_SECTIONS: readonly LibrarySection[] = ['live', 'vod', 'series']
export const CATALOG_SYNC_DAILY_REQUEST_LIMIT = 6
export const CATALOG_SYNC_HEADER_TIMEOUT_MS = 15_000
/**
 * Total scan deadline for a normal section. VOD is far larger and gets its own
 * bound below: the response-byte ceiling is section-scaled, but the timeout used
 * to be uniform, so VOD - measured at 71,541 ms standalone, with under 48 s of
 * headroom against 120 s, and running third after two publications and two index
 * builds - could exhaust the shared deadline while Live and Series never came
 * close. Scaling the deadline to the section's measured response removes that.
 */
export const CATALOG_SYNC_TOTAL_TIMEOUT_MS = 120_000
/**
 * VOD scan deadline. VOD's ~79.7 MB response measured 71,541 ms alone on the
 * real provider; on a scheduled run it also follows two other publications and
 * index builds. On-device synthetic runs at true VOD scale (194k items, ~80 MB
 * streamed through the real parser) exhausted both the shared 120 s bound
 * (reached ~61k) and a 240 s bound (reached ~137k), so the deadline must be
 * materially larger than either. 420 s keeps a bounded upper limit while giving
 * the largest section the room the shared 120 s never did. The section-scaled
 * response-byte ceiling remains the real size guard; this only stops a healthy,
 * still-streaming VOD scan from being aborted mid-flight.
 */
export const CATALOG_SYNC_VOD_TOTAL_TIMEOUT_MS = 420_000
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
 * Minimum interval between `scanning` progress notifications. The scan fires a
 * progress event per parsed batch (hundreds to thousands per section), and the
 * UI sink recomputes an aria-live region on each one. Coalescing to a bounded
 * rate keeps the accessibility-tree and layout cost off the parse's hot path
 * while a large section streams, without changing the final reported count.
 */
export const CATALOG_SYNC_PROGRESS_THROTTLE_MS = 250
/**
 * The largest proportional drop in accepted records, relative to the section's
 * prior authoritative item count, that a refresh may publish. A closed scan that
 * retains less than this fraction is treated as a catastrophic collapse and
 * refused, preserving the previous generation rather than keying the guard on an
 * exact zero that a single surviving record would defeat.
 */
export const CATALOG_SYNC_COLLAPSE_RETAIN_RATIO = 0.1

/**
 * A closed section scan whose accepted records cannot justify replacing the
 * current generation. Payload-free: it carries only the counts behind the
 * refusal. Raised before publication so the previous manifest, snapshots, and
 * derived index remain authoritative.
 */
export class SectionScanValidationError extends Error {
  readonly code = 'section-scan-validation'
  readonly rawItemCount: number
  readonly acceptedItemCount: number
  readonly priorItemCount: number

  constructor(reason: string, counts: {
    rawItemCount: number
    acceptedItemCount: number
    priorItemCount: number
  }) {
    super(reason)
    this.name = 'SectionScanValidationError'
    this.rawItemCount = counts.rawItemCount
    this.acceptedItemCount = counts.acceptedItemCount
    this.priorItemCount = counts.priorItemCount
  }
}
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

export type CatalogSyncStorageMaintenance =
  | {
      state: 'ready'
      before: LibraryStorageHeadroom
      after: LibraryStorageHeadroom
      eviction: RebuildableCacheEvictionResult | null
    }
  | {
      state: 'unavailable'
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
      storage?: CatalogSyncStorageMaintenance
    }
  | {
      status: 'busy' | 'cooldown' | 'deferred'
      requestCount: 0
      issuedRequestCount: 0
      nextDueAt?: number
      sections: []
      storage?: CatalogSyncStorageMaintenance
    }

export type CatalogSyncProgress = {
  stage: 'starting' | 'categories' | 'scanning' | 'section-complete' | 'finishing'
  section?: LibrarySection
  itemsAcquired?: number
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
  /**
   * Provides payload-free progress for the persistent UI indicator. It never
   * changes the serial provider plan or exposes provider response content.
   */
  onProgress?: (progress: CatalogSyncProgress) => void
  /**
   * Overrides the crash-surviving breadcrumb store. Production uses the default
   * `localStorage` key; the synthetic sync probe passes an isolated store so a
   * renderer kill during a probe run cannot leave a marker that would degrade
   * the next real sync's flush size.
   */
  breadcrumbStore?: BreadcrumbStorage | null
  /**
   * Overrides the `scanning` progress throttle window in milliseconds. Defaults
   * to `CATALOG_SYNC_PROGRESS_THROTTLE_MS`. A value of 0 restores one event per
   * parsed batch, which the on-device A/B uses to measure the unthrottled DOM
   * sink against the throttled one.
   */
  progressThrottleMs?: number
  /**
   * Diagnostic-only override of the per-section scan `timeoutMs`. Omit for the
   * production section-scaled deadline. The VOD-scale synthetic uses this to
   * reproduce the old uniform 120 s bound.
   */
  scanTimeoutMs?: number
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
  private readonly onProgress?: (progress: CatalogSyncProgress) => void
  /**
   * Explicit breadcrumb store, or undefined to use the shared localStorage key.
   * `false` in the option is not accepted; only a store or null/undefined.
   */
  private readonly breadcrumbStore?: BreadcrumbStorage | null
  /** Throttle window for `scanning` progress; 0 restores per-batch emission. */
  private readonly progressThrottleMs: number
  /** Diagnostic override of the per-section scan deadline; undefined = scaled. */
  private readonly scanTimeoutMsOverride?: number
  private activeController: AbortController | null = null
  private runSequence = 0
  /** Wall-clock of the last emitted `scanning` progress event, for throttling. */
  private lastScanProgressAt = 0

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
    this.onProgress = options.onProgress
    this.breadcrumbStore = options.breadcrumbStore
    this.progressThrottleMs =
      options.progressThrottleMs ?? CATALOG_SYNC_PROGRESS_THROTTLE_MS
    this.scanTimeoutMsOverride = options.scanTimeoutMs
  }

  private scanTimeoutMs(section: LibrarySection): number {
    return this.scanTimeoutMsOverride ?? syncScanTimeoutMs(section)
  }

  /**
   * Resolves the breadcrumb store to use. When the option is unset, the shared
   * module default (localStorage) is used by passing `undefined` through.
   */
  private breadcrumb(): BreadcrumbStorage | null | undefined {
    return this.breadcrumbStore
  }

  get isRunning(): boolean {
    return this.activeController !== null
  }

  cancel(): void {
    this.activeController?.abort()
  }

  private reportProgress(progress: CatalogSyncProgress): void {
    this.onProgress?.(progress)
  }

  /**
   * Emits a `scanning` progress event no more than once per throttle window.
   * `force` bypasses the window for the boundary events (first batch of a
   * section and the final count) so the count a reader sees always settles on
   * the true total. Between those, intermediate batches are coalesced.
   *
   * A throttle window of 0 restores the pre-fix behaviour of one event per
   * parsed batch. This exists so the on-device A/B (unthrottled `outerHTML`
   * replacement versus throttled in-place mutation) is measurable from one
   * build; production leaves it at the default.
   */
  private reportScanProgress(
    section: LibrarySection,
    itemsAcquired: number,
    force = false,
  ): void {
    if (!this.onProgress) {
      return
    }

    const now = this.now()

    if (
      !force &&
      this.progressThrottleMs > 0 &&
      now - this.lastScanProgressAt < this.progressThrottleMs
    ) {
      return
    }

    this.lastScanProgressAt = now
    this.onProgress({ stage: 'scanning', section, itemsAcquired })
  }

  /**
   * Refuses a closed scan whose accepted records cannot justify replacing the
   * current generation. Throws {@link SectionScanValidationError} before any
   * publication; a passing scan returns silently.
   */
  private assertScanIsPublishable(
    scanResult: { rawItemCount: number; acceptedItemCount: number },
    streamedRecordCount: number,
    priorItemCount: number,
  ): void {
    const accepted = Math.max(scanResult.acceptedItemCount, streamedRecordCount)

    // A response that carried records but produced none we could identify is a
    // parser/identity failure regardless of whether a prior generation exists.
    if (accepted === 0 && scanResult.rawItemCount > 0) {
      throw new SectionScanValidationError(
        `A closed scan parsed ${scanResult.rawItemCount} record(s) but none were ` +
          'identifiable; publication refused.',
        {
          rawItemCount: scanResult.rawItemCount,
          acceptedItemCount: accepted,
          priorItemCount,
        },
      )
    }

    // A near-total collapse against a populated prior generation is refused even
    // when a few records survive, so a healthy section is never overwritten by a
    // degenerate response.
    if (
      priorItemCount > 0 &&
      accepted > 0 &&
      accepted < priorItemCount * CATALOG_SYNC_COLLAPSE_RETAIN_RATIO
    ) {
      throw new SectionScanValidationError(
        `A closed scan retained only ${accepted} of ${priorItemCount} prior item(s), ` +
          'below the collapse threshold; publication refused.',
        {
          rawItemCount: scanResult.rawItemCount,
          acceptedItemCount: accepted,
          priorItemCount,
        },
      )
    }
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

    /*
     * A breadcrumb left in a working stage means the previous run never reached
     * `finished`: it crashed or the renderer was killed. Rather than repeat the
     * work that ended it, halve the flush size for this run. Cancellation clears
     * the breadcrumb, so a paused run is not treated as a failure.
     */
    const priorBreadcrumb = readSyncBreadcrumb(this.breadcrumb())
    const degradations = nextDegradationCount(priorBreadcrumb)
    const flushItems = degradedFlushItems(PARTIAL_CATEGORY_FLUSH_ITEMS, priorBreadcrumb)
    const markStage = (
      stage: SyncBreadcrumbStage,
      section: LibrarySection | null = null,
      itemCount = 0,
    ): void => {
      writeSyncBreadcrumb({
        stage,
        section,
        itemCount,
        degradations,
        updatedAt: this.now(),
      }, this.breadcrumb())
    }

    if (flushItems !== PARTIAL_CATEGORY_FLUSH_ITEMS) {
      performanceTrace.event('library', 'catalog-sync-degraded-batch', {
        priorStage: priorBreadcrumb?.stage ?? null,
        priorSection: priorBreadcrumb?.section ?? null,
        priorItemCount: priorBreadcrumb?.itemCount ?? 0,
        degradations,
        flushItems,
      })
    }

    markStage('starting')
    markStage('storage-preflight')
    const storage = await this.maintainStorageHeadroom(profileId)

    if (storage.state !== 'ready' || !storage.after.allowed) {
      performanceTrace.event('library', 'catalog-sync-storage-deferred', {
        storageAvailable: storage.state === 'ready',
        storageSource: storage.state === 'ready' ? storage.after.source : null,
        evictionPerformed: storage.state === 'ready' && storage.eviction !== null,
      })
      /*
       * A storage deferral is an ordinary, non-crash exit that returns while the
       * breadcrumb still reads `storage-preflight`. Leaving that working-stage
       * marker would make the next run misclassify this as a renderer kill and
       * needlessly halve its flush size, so clear it as terminal.
       */
      clearSyncBreadcrumb(this.breadcrumb())
      return {
        status: 'deferred',
        requestCount: 0,
        issuedRequestCount: 0,
        sections: [],
        storage,
      }
    }

    performanceTrace.event('library', 'catalog-sync-storage-ready', {
      storageSource: storage.after.source,
      storageUsageBytes: storage.after.usageBytes,
      storageQuotaBytes: storage.after.quotaBytes,
      storageHeadroomBytes: storage.after.availableBytes,
      evictionPerformed: storage.eviction !== null,
    })

    const controller = new AbortController()
    this.activeController = controller
    const runId = `catalog-sync-${now}-${this.runSequence += 1}`
    this.reportProgress({ stage: 'starting' })


    if (!await this.repository.tryBeginSync(profileId, runId, this.staleRunMs)) {
      this.activeController = null
      /*
       * A failed sync lease is a clean early return, not a crash: another run
       * already owns the breadcrumb. Clear the working-stage marker this attempt
       * wrote so it cannot be read as an unfinished run by the next launch.
       */
      clearSyncBreadcrumb(this.breadcrumb())
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
        this.reportProgress({ stage: 'categories', section })
        markStage('categories', section)

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
          flushItems,
          markStage,
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
      this.reportProgress({ stage: 'finishing' })
      const outcome = cancelled || controller.signal.aborted
        ? 'cancelled'
        : failed
          ? 'failed'
          : 'completed'
      /*
       * Reaching here at all means the run ended in JavaScript rather than being
       * killed, so the breadcrumb has done its job. A recorded failure is already
       * described by the persisted section checkpoints.
       */
      if (outcome === 'cancelled') {
        clearSyncBreadcrumb(this.breadcrumb())
      } else {
        markStage('finished')
      }
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
        storage,
      }
    }
  }

  /**
   * Provider work is not allowed to begin while the local durable catalog lacks
   * its reserved write headroom. Rebuildable data is evicted in repository
   * order (EPG, details, search indexes, superseded snapshots) before deferral;
   * active catalog snapshots and localStorage user state remain protected.
   */
  private async maintainStorageHeadroom(
    profileId: string,
  ): Promise<CatalogSyncStorageMaintenance> {
    try {
      const beforeEstimate = await this.repository.estimateProfileStorage(profileId)
      const before = assessLibraryStorageHeadroom(
        await measureLibraryStorage(beforeEstimate.byteEstimate),
      )

      if (before.allowed) {
        return {
          state: 'ready',
          before,
          after: before,
          eviction: null,
        }
      }

      const eviction = await this.repository.evictRebuildableData(profileId)
      const afterEstimate = await this.repository.estimateProfileStorage(profileId)
      const after = assessLibraryStorageHeadroom(
        await measureLibraryStorage(afterEstimate.byteEstimate),
      )

      return {
        state: 'ready',
        before,
        after,
        eviction,
      }
    } catch {
      return { state: 'unavailable' }
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
    flushItems: number,
    markStage: (
      stage: SyncBreadcrumbStage,
      section: LibrarySection | null,
      itemCount: number,
    ) => void,
    maxResponseBytes?: number,
  ): Promise<CatalogSyncSectionOutcome> {
    const attemptAt = this.now()
    /*
     * Every whole-section scan publishes incrementally, whatever the section's
     * current coverage. The accumulate-then-publish alternative held the entire
     * section in memory and produced a 2.3 s unyielded main-thread span at Live
     * scale on the physical target, and four consecutive Live acquisitions
     * terminated the renderer at exactly that transition. The chunked path yields
     * between bounded flushes, keeps partial generations invisible to readers, and
     * promotes only on a closed top-level array; it has completed 194,302 items on
     * the same hardware. Coverage-dependent branching bought nothing and left the
     * larger sections on the unproven path.
     */
    const categoryById = new Map(categories.map((category) => [category.id, category]))
    const pendingByCategory = new Map<string, StreamItem[]>()
    let publication: PartialSectionPublication | null = null
    const requirePublication = (): PartialSectionPublication => {
      if (!publication) {
        throw new Error('The section publication was not opened before its first flush.')
      }

      return publication
    }
    const heap = createHeapSampler()
    let streamedRecordCount = 0
    let nextHeapSampleAt = 1_024
    let nextBreadcrumbAt = 2_048
    let failureStage: CatalogSyncFailureStage = 'provider-scan'
    let publishStage: SnapshotPublishStage | null = null
    let scanStartedAt = 0
    let lastScanStatistics: SectionScanResult | null = null

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
      await requirePublication().appendCategoryItems(
        {
          category: categoryForKey(categoryKey),
          items,
        },
        {
          signal,
          onSnapshotPut: this.onSnapshotPut,
          onPublishStage: (stage) => {
            publishStage = stage
          },
        },
      )
      failureStage = 'provider-scan'
    }

    const flushPartialSnapshots = async (): Promise<void> => {
      for (const categoryKey of [...pendingByCategory.keys()]) {
        await flushPartialCategory(categoryKey)
      }
    }

    const finishRequest = recordRequest()

    try {
      failureStage = 'snapshot-publish'
      publication = await this.repository.openPartialSectionPublication(
        profileId,
        section,
        runId,
      )
      failureStage = 'provider-scan'
      /*
       * Mark the scan boundary immediately. Without this a targeted run stays
       * labelled `storage-preflight` until the first 2,048-record breadcrumb, so
       * a crash before record 2,048 could not be told apart from a pre-scan
       * failure. The count is 0 until the first bounded checkpoint updates it.
       */
      markStage('scanning', section, 0)
      this.lastScanProgressAt = 0
      scanStartedAt = this.now()

      const scanResult = await this.provider.backgroundScanSection(section, {
        signal,
        responseTimeoutMs: CATALOG_SYNC_HEADER_TIMEOUT_MS,
        timeoutMs: this.scanTimeoutMs(section),
        maxResponseBytes,
        onScanStatistics: (statistics) => {
          // Captured continuously so the catch block can persist detail even when
          // the scan throws before returning its result.
          lastScanStatistics = statistics
        },
        onMatches: async (batch) => {
          const firstBatch = streamedRecordCount === 0
          streamedRecordCount += batch.length
          this.reportScanProgress(section, streamedRecordCount, firstBatch)

          if (streamedRecordCount >= nextHeapSampleAt) {
            heap.sample()
            nextHeapSampleAt = streamedRecordCount + 1_024
          }

          /*
           * Bounded rate: one synchronous storage write per 2,048 records rather
           * than per batch. This marker survives a renderer kill and names the
           * record count the previous run reached.
           */
          if (streamedRecordCount >= nextBreadcrumbAt) {
            markStage('scanning', section, streamedRecordCount)
            nextBreadcrumbAt = streamedRecordCount + 2_048
          }

          for (const item of batch) {
            const categoryKey = item.categoryId || 'uncategorized'
            const pending = pendingByCategory.get(categoryKey) ?? []
            pending.push(item)
            pendingByCategory.set(categoryKey, pending)

            if (pending.length >= flushItems) {
              await flushPartialCategory(categoryKey)
            }
          }
        },
      })

      finishRequest()

      /*
       * Validate the closed scan against the typed provider statistics before any
       * publication. Two cases the exact-zero commit guard cannot see:
       *
       *  - raw records arrived but none were identifiable (accepted 0, raw > 0):
       *    reject even on a first acquisition, because an all-unidentifiable
       *    response is a parser/identity failure, not an empty catalog; and
       *  - a catastrophic collapse against the prior authoritative count, so a
       *    single surviving record among tens of thousands cannot mask a
       *    near-total identifier loss and overwrite a healthy section.
       *
       * A genuinely empty first acquisition (raw 0, no prior items) still passes.
       */
      failureStage = 'empty-validation'
      const priorItemCount = requirePublication().priorAuthoritativeItemCount
      this.assertScanIsPublishable(scanResult, streamedRecordCount, priorItemCount)

      failureStage = 'snapshot-publish'
      // The transition four consecutive Live acquisitions never survived.
      markStage('publishing', section, streamedRecordCount)

      await flushPartialSnapshots()
      /*
       * One manifest write promotes the whole run. Categories the closed array
       * never mentioned are committed complete with zero items. `commit` refuses
       * to promote a zero-item run over a section that still holds items, so an
       * all-unidentifiable response leaves the previous generation authoritative.
       */
      await requirePublication().commit({
        signal,
        onSnapshotPut: this.onSnapshotPut,
        onPublishStage: (stage) => {
          publishStage = stage
        },
      })
      failureStage = 'manifest-read'
      const manifest = await this.repository.getManifest(profileId, section)
      markStage('indexing', section, streamedRecordCount)

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
      markStage('section-complete', section, streamedRecordCount)

      this.reportProgress({
        stage: 'section-complete',
        section,
        itemsAcquired: streamedRecordCount,
      })
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

      const emptyRefusal =
        reason instanceof EmptySectionPublicationError ||
        reason instanceof SectionScanValidationError
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
        emptyRefusal ? 'empty-validation' : failureStage,
        publishStage,
        reason,
        refused,
        this.internalFaultDiagnostics,
      )
      const manifest = await this.repository.getManifest(profileId, section)
      const now = this.now()
      /*
       * Persist per-section failure detail in the sync meta record. Unlike the
       * single global breadcrumb - which a later section's success overwrites -
       * this survives the run's terminal state, so a mid-run section failure can
       * be diagnosed after the fact without another provider request. Payload-free.
       */
      // Read through a widening cast: the value is assigned inside the scan's
      // onScanStatistics callback, which the compiler's control-flow analysis
      // does not observe, so it would otherwise narrow this to `null`.
      const stats = lastScanStatistics as SectionScanResult | null
      const failureDetail: LibrarySyncSectionFailureDetail = {
        failureStage: emptyRefusal ? 'empty-validation' : failureStage,
        failureKind: classifyFailureKind(reason, emptyRefusal, refused),
        streamedRecordCount,
        elapsedMs: scanStartedAt > 0 ? Math.max(0, now - scanStartedAt) : undefined,
        refused,
        updatedAt: now,
        ...(stats
          ? {
              rawItemCount: stats.rawItemCount,
              acceptedItemCount: stats.acceptedItemCount,
              bytesReceived: stats.bytesReceived,
              arrayClosed: stats.arrayClosed,
            }
          : {}),
      }
      await this.updateSectionState(profileId, runId, section, states, {
        coverage: manifest?.coverage.state ?? state.coverage,
        wholeSectionFailureCount: state.wholeSectionFailureCount + 1,
        nextCategoryCursor: firstIncompleteCategoryCursor(categories, manifest),
        lastAttemptAt: attemptAt,
        lastFailureAt: now,
        lastFailureDetail: failureDetail,
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
        timeoutMs: this.scanTimeoutMs(section),
        maxResponseBytes: syncResponseByteLimit(section),
        onMatches: (batch) => {
          items.push(...batch)
          this.reportProgress({
            stage: 'scanning',
            section,
            itemsAcquired: items.length,
          })
        },
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

      this.reportProgress({
        stage: 'section-complete',
        section,
        itemsAcquired: items.length,
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

/**
 * Total scan deadline scaled to the section's measured response, so the largest
 * section is not starved of time by a bound sized for the smallest.
 */
function syncScanTimeoutMs(section: LibrarySection): number {
  return section === 'vod'
    ? CATALOG_SYNC_VOD_TOTAL_TIMEOUT_MS
    : CATALOG_SYNC_TOTAL_TIMEOUT_MS
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
  | 'empty-validation'
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

/**
 * A short, payload-free classification of a whole-section failure for the
 * persisted per-section detail. Provider errors contribute only their `kind`
 * (e.g. `timeout`, `too-large`, `rate-limited`), never message text.
 */
function classifyFailureKind(
  reason: unknown,
  emptyRefusal: boolean,
  refused: boolean,
): string {
  if (emptyRefusal) {
    return reason instanceof SectionScanValidationError
      ? 'scan-validation'
      : 'empty-publication'
  }

  if (refused) {
    return isProviderError(reason) ? `refused:${reason.kind}` : 'refused'
  }

  if (isProviderError(reason)) {
    return `provider:${reason.kind}`
  }

  if (reason instanceof LibraryWriteAbortedError) {
    return 'library-write-aborted'
  }

  return reason instanceof Error ? reason.name : 'unknown'
}
