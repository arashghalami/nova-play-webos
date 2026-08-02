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

export type CatalogSyncProvider = Pick<
  ProviderBroker,
  'backgroundCategories' | 'backgroundScanSection'
> & {
  canBeginCatalogSync?: (
    requestCount: number,
  ) => ProviderCatalogSyncPreflight
}

export type CatalogSyncSectionResult = {
  section: LibrarySection
  mode: 'whole-section' | 'category-slice' | 'skipped'
  success: boolean
  categoryId?: string
  reason?: 'category-request-failed' | 'scan-failed' | 'no-categories' | 'cancelled'
  refused?: boolean
}

export type CatalogSyncResult =
  | {
      status: 'completed' | 'failed' | 'cancelled'
      requestCount: number
      nextDueAt: number
      sections: CatalogSyncSectionResult[]
    }
  | {
      status: 'busy' | 'cooldown' | 'deferred'
      requestCount: 0
      nextDueAt?: number
      sections: []
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

  async sync(profileId: string): Promise<CatalogSyncResult> {
    const now = this.now()
    const priorMeta = await this.repository.getMeta(profileId)

    if (priorMeta?.nextDueAt !== undefined && priorMeta.nextDueAt > now) {
      return {
        status: 'cooldown',
        requestCount: 0,
        nextDueAt: priorMeta.nextDueAt,
        sections: [],
      }
    }

    if (this.activeController) {
      return { status: 'busy', requestCount: 0, sections: [] }
    }

    const preflight = this.provider.canBeginCatalogSync?.(
      CATALOG_SYNC_REQUESTS_PER_COMPLETE_RUN,
    )

    if (preflight && !preflight.allowed) {
      return {
        status: 'deferred',
        requestCount: 0,
        nextDueAt: preflight.nextEligibleAt,
        sections: [],
      }
    }

    const controller = new AbortController()
    this.activeController = controller
    const runId = `catalog-sync-${now}-${this.runSequence += 1}`

    if (!await this.repository.tryBeginSync(profileId, runId, this.staleRunMs)) {
      this.activeController = null
      return { status: 'busy', requestCount: 0, sections: [] }
    }

    const sectionStates = new Map<LibrarySection, LibrarySyncSectionState>()
    for (const section of CATALOG_SYNC_SECTIONS) {
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
    const sections: CatalogSyncSectionResult[] = []
    let requestCount = 0
    let failed = false
    let cancelled = false
    let refusal = false

    try {
      for (const section of CATALOG_SYNC_SECTIONS) {
        if (controller.signal.aborted || refusal) {
          break
        }

        const attemptAt = this.now()

        try {
          requestCount += 1
          const categories = uniqueCategories(
            await this.provider.backgroundCategories(
              section,
              controller.signal,
              CATALOG_SYNC_HEADER_TIMEOUT_MS,
            ),
          )
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

      for (const section of CATALOG_SYNC_SECTIONS) {
        if (controller.signal.aborted || refusal) {
          break
        }

        const categories = categoriesBySection.get(section)

        if (!categories) {
          continue
        }

        const state = sectionStates.get(section) ?? normalizeSectionState(undefined, 'none')

        if (state.wholeSectionFailureCount > 0) {
          const result = await this.syncCategorySlice(
            profileId,
            runId,
            section,
            categories,
            state,
            sectionStates,
            controller.signal,
            () => {
              requestCount += 1
            },
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
          () => {
            requestCount += 1
          },
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

      return {
        status: outcome,
        requestCount,
        nextDueAt,
        sections,
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
    recordRequest: () => void,
  ): Promise<CatalogSyncSectionResult> {
    const attemptAt = this.now()
    const buckets = new Map<string, StreamItem[]>()
    let failureStage: CatalogSyncFailureStage = 'provider-scan'
    let publishStage: SnapshotPublishStage | null = null

    try {
      recordRequest()
      await this.provider.backgroundScanSection(section, {
        signal,
        responseTimeoutMs: CATALOG_SYNC_HEADER_TIMEOUT_MS,
        timeoutMs: CATALOG_SYNC_TOTAL_TIMEOUT_MS,
        onMatches: (batch) => {
          for (const item of batch) {
            const categoryKey = item.categoryId || 'uncategorized'
            const existing = buckets.get(categoryKey)

            if (existing) {
              existing.push(item)
            } else {
              buckets.set(categoryKey, [item])
            }
          }
        },
      })

      failureStage = 'snapshot-publish'
      await this.repository.replaceSectionSnapshots(
        {
          profileId,
          section,
          runId,
          snapshots: snapshotsForWholeSection(categories, buckets),
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
      failureStage = 'sync-state'
      await this.updateSectionState(profileId, runId, section, states, {
        coverage: manifest?.coverage.state ?? state.coverage,
        wholeSectionFailureCount: 0,
        nextCategoryCursor: 0,
        lastAttemptAt: attemptAt,
        lastSuccessAt: this.now(),
      })

      return { section, mode: 'whole-section', success: true }
    } catch (reason) {
      if (isCancelled(reason, signal)) {
        return { section, mode: 'whole-section', success: false, reason: 'cancelled' }
      }

      const refused = isProviderRefusal(reason)
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
    recordRequest: () => void,
  ): Promise<CatalogSyncSectionResult> {
    if (!categories.length) {
      return {
        section,
        mode: 'category-slice',
        success: false,
        reason: 'no-categories',
      }
    }

    const cursor = state.nextCategoryCursor % categories.length
    const category = categories[cursor]
    const attemptAt = this.now()
    const items: StreamItem[] = []
    let failureStage: CatalogSyncFailureStage = 'provider-scan'
    let publishStage: SnapshotPublishStage | null = null

    try {
      recordRequest()
      await this.provider.backgroundScanSection(section, {
        signal,
        categoryId: category.id,
        responseTimeoutMs: CATALOG_SYNC_HEADER_TIMEOUT_MS,
        timeoutMs: CATALOG_SYNC_TOTAL_TIMEOUT_MS,
        onMatches: (batch) => items.push(...batch),
      })

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
      const nextCategoryCursor = (cursor + 1) % categories.length
      failureStage = 'sync-state'
      await this.updateSectionState(profileId, runId, section, states, {
        coverage: manifest?.coverage.state ?? state.coverage,
        wholeSectionFailureCount:
          nextCategoryCursor === 0 ? 0 : state.wholeSectionFailureCount,
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