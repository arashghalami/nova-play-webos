import { loadProviderAccessState, saveProviderAccessState } from './storage'
import { performanceTrace } from './performance-trace'
import {
  isProviderBlocked,
  providerBlockForFailure,
  providerBlockMessage,
} from './provider-search-guard'
import { ProviderError } from './provider-error'
import type { ProviderTransport } from './provider-transport'
import {
  XtreamClient,
  type SectionScanResult,
  type StreamScanOptions,
  type StreamSearchOptions,
} from './xtream-client'
import type {
  AccountSummary,
  Category,
  LibrarySection,
  NowNext,
  Program,
  SeriesDetails,
  StreamItem,
  VodDetails,
  XtreamProfile,
} from './types'

export type ProviderRequestPriority = 'interactive' | 'catalog' | 'background'
export type ProviderBudgetKind = 'interactive' | 'sync'

export type ProviderBrokerOptions = {
  transport?: ProviderTransport
  /**
   * Compatibility override for tests and integrations that predate split
   * accounting. It applies the same limit to each independent budget.
   */
  dailyRequestBudget?: number
  interactiveDailyRequestBudget?: number
  syncDailyRequestBudget?: number
  now?: () => number
}

export type ProviderCatalogSyncPreflight = {
  allowed: boolean
  reason: 'provider-blocked' | 'budget-exhausted' | null
  nextEligibleAt?: number
  budget: ProviderBudgetSnapshot
}

export type ProviderBudgetSnapshot = {
  now: number
  windowStartAt: number
  windowEndsAt: number
  nextResetAt: number
  resetRule:
    | 'window initialized at the current UTC boundary'
    | 'window reset at or after its UTC boundary'
    | 'current time is before the persisted window start; counters preserved'
    | 'current UTC window remains active'
  interactive: {
    used: number
    limit: number
    remaining: number
  }
  sync: {
    used: number
    limit: number
    remaining: number
  }
  block: {
    kind: string
    until: number | null
  } | null
}

type PendingRequest = {
  priority: ProviderRequestPriority
  budget: ProviderBudgetKind
  signal?: AbortSignal
  run: (client: XtreamClient) => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

const DEFAULT_SYNC_DAILY_REQUEST_BUDGET = 6
const DEFAULT_INTERACTIVE_DAILY_REQUEST_BUDGET = 24
const BUDGET_WINDOW_MS = 24 * 60 * 60 * 1000

function utcWindowStart(now: number): number {
  const date = new Date(now)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

/**
 * Serializes all provider I/O for one profile. Background catalog acquisition
 * consumes only its own six-request sync budget; user-initiated operations use
 * a separate interactive allowance. A persisted provider refusal is absolute
 * for both budgets and all priorities.
 */
export class ProviderBroker {
  private readonly client: XtreamClient
  private readonly profileId: string
  private readonly interactiveDailyRequestBudget: number
  private readonly syncDailyRequestBudget: number
  private readonly now: () => number
  private readonly queues: Record<ProviderRequestPriority, PendingRequest[]> = {
    interactive: [],
    catalog: [],
    background: [],
  }
  private readonly issuedRequestCounts: Record<ProviderBudgetKind, number> = {
    interactive: 0,
    sync: 0,
  }
  private running = false

  constructor(profile: XtreamProfile, options: ProviderBrokerOptions = {}) {
    this.client = new XtreamClient(profile, options.transport)
    this.profileId = profile.id
    this.interactiveDailyRequestBudget =
      options.interactiveDailyRequestBudget ??
      options.dailyRequestBudget ??
      DEFAULT_INTERACTIVE_DAILY_REQUEST_BUDGET
    this.syncDailyRequestBudget =
      options.syncDailyRequestBudget ??
      options.dailyRequestBudget ??
      DEFAULT_SYNC_DAILY_REQUEST_BUDGET
    this.now = options.now ?? Date.now
  }

  streamUrl(stream: StreamItem, direct = true): string {
    return this.client.streamUrl(stream, direct)
  }

  catchupUrl(stream: StreamItem, start: Date, durationMinutes: number): string | null {
    return this.client.catchupUrl(stream, start, durationMinutes)
  }

  validate(signal?: AbortSignal): Promise<AccountSummary> {
    return this.request('interactive', 'interactive', signal, (client) =>
      client.validate(signal),
    )
  }

  categories(section: LibrarySection, signal?: AbortSignal): Promise<Category[]> {
    return this.request('catalog', 'interactive', signal, (client) =>
      client.categories(section, signal),
    )
  }

  streams(
    section: LibrarySection,
    categoryId?: string,
    signal?: AbortSignal,
  ): Promise<StreamItem[]> {
    return this.request('catalog', 'interactive', signal, (client) =>
      client.streams(section, categoryId, signal),
    )
  }

  /**
   * One explicit submitted live-search request. Callers must select the section
   * themselves; this broker deliberately never fans one user query out across
   * multiple provider sections.
   */
  searchStreams(
    section: LibrarySection,
    query: string,
    options: StreamSearchOptions = {},
  ): Promise<StreamItem[]> {
    return this.request('interactive', 'interactive', options.signal, (client) =>
      client.searchStreams(section, query, options),
    )
  }

  backgroundCategories(
    section: LibrarySection,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<Category[]> {
    return this.request('background', 'sync', signal, (client) =>
      client.categories(section, signal, timeoutMs),
    )
  }

  backgroundStreams(
    section: LibrarySection,
    categoryId: string,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<StreamItem[]> {
    return this.request('background', 'sync', signal, (client) =>
      client.streams(section, categoryId, signal, timeoutMs),
    )
  }

  backgroundScanSection(
    section: LibrarySection,
    options: StreamScanOptions = {},
  ): Promise<SectionScanResult> {
    return this.request('background', 'sync', options.signal, (client) =>
      client.scanSection(section, options),
    )
  }

  seriesInfo(seriesId: string, signal?: AbortSignal): Promise<SeriesDetails> {
    return this.request('interactive', 'interactive', signal, (client) =>
      client.seriesInfo(seriesId, signal),
    )
  }

  vodInfo(vodId: string, signal?: AbortSignal): Promise<VodDetails> {
    return this.request('interactive', 'interactive', signal, (client) =>
      client.vodInfo(vodId, signal),
    )
  }

  nowNext(streamId: string, signal?: AbortSignal): Promise<NowNext> {
    // This uses the low-priority background queue so it does not compete with
    // foreground interaction, but it is still user-facing provider traffic and
    // therefore consumes interactive—not sync—allowance.
    return this.request('background', 'interactive', signal, (client) =>
      client.nowNext(streamId, signal),
    )
  }

  epg(streamId: string, limit?: number, signal?: AbortSignal): Promise<Program[]> {
    return this.request('interactive', 'interactive', signal, (client) =>
      client.epg(streamId, limit, signal),
    )
  }

  /**
   * Read-only budget state intended for the probe surface. It normalizes and
   * persists a due window rollover, but never alters a refusal block.
   */
  inspectBudget(): ProviderBudgetSnapshot {
    const { state, resetRule } = this.normalizedState(this.now())
    saveProviderAccessState(this.profileId, state)
    return this.budgetSnapshot(state, resetRule, this.now())
  }

  /**
   * Refuses a partial scheduled catalog pass up front. A due run must have all
   * of its fixed request slots available, so a relaunch cannot consume the
   * final debit and leave the following run short of its section scan.
   */
  canBeginCatalogSync(requestCount: number): ProviderCatalogSyncPreflight {
    if (!Number.isInteger(requestCount) || requestCount < 1) {
      throw new Error('Catalog sync request count must be a positive integer.')
    }

    const now = this.now()
    const { state, resetRule } = this.normalizedState(now)
    state.updatedAt = now
    saveProviderAccessState(this.profileId, state)
    const budget = this.budgetSnapshot(state, resetRule, now)

    if (state.block && isProviderBlocked(state.block, now)) {
      return {
        allowed: false,
        reason: 'provider-blocked',
        ...(state.block.until === null ? {} : { nextEligibleAt: state.block.until }),
        budget,
      }
    }

    if (budget.sync.remaining < requestCount) {
      return {
        allowed: false,
        reason: 'budget-exhausted',
        nextEligibleAt: budget.nextResetAt,
        budget,
      }
    }

    return { allowed: true, reason: null, budget }
  }

  /**
   * Probe-only caller support. Normal app builds do not expose this broker
   * method through a global API. It resets counters only: a refusal block,
   * Retry-After deadline, failure evidence, and cooldown state survive intact.
   */
  resetBudgetsForProbe(): ProviderBudgetSnapshot {
    const now = this.now()
    const { state } = this.normalizedState(now)
    state.requestCount = 0
    state.interactiveRequestCount = 0
    state.syncRequestCount = 0
    state.updatedAt = now
    saveProviderAccessState(this.profileId, state)
    return this.budgetSnapshot(state, 'current UTC window remains active', now)
  }

  /**
   * Returns transport handoffs observed by this broker instance. It is distinct
   * from persisted daily budget state so a catalog coordinator can reconcile
   * attempted calls with requests the provider actually received.
   */
  issuedRequestCount(budget: ProviderBudgetKind): number {
    return this.issuedRequestCounts[budget]
  }

  private request<T>(
    priority: ProviderRequestPriority,
    budget: ProviderBudgetKind,
    signal: AbortSignal | undefined,
    run: (client: XtreamClient) => Promise<T>,
  ): Promise<T> {
    if (signal?.aborted) {
      return Promise.reject(new ProviderError('cancelled', 'Request cancelled.', false))
    }

    return new Promise<T>((resolve, reject) => {
      this.queues[priority].push({
        priority,
        budget,
        signal,
        run,
        resolve: (value) => resolve(value as T),
        reject,
      })
      void this.drain()
    })
  }

  private nextRequest(): PendingRequest | undefined {
    return (
      this.queues.interactive.shift() ??
      this.queues.catalog.shift() ??
      this.queues.background.shift()
    )
  }

  private rejectQueued(reason: unknown): void {
    for (const queue of Object.values(this.queues)) {
      while (queue.length) {
        queue.shift()?.reject(reason)
      }
    }
  }

  private get hasQueuedRequests(): boolean {
    return Object.values(this.queues).some((queue) => queue.length > 0)
  }

  private accessBlockedError(): ProviderError {
    const state = loadProviderAccessState(this.profileId)
    return new ProviderError(
      state.block?.kind ?? 'rate-limited',
      providerBlockMessage(state.block) ?? 'Provider requests are temporarily paused.',
      false,
    )
  }

  private budgetExceededError(budget: ProviderBudgetKind): ProviderError {
    const message =
      budget === 'sync'
        ? 'Today’s catalog sync request budget has been reached. The downloaded library will be refreshed later.'
        : 'Today’s interactive provider request allowance has been reached. Playback and scheduled catalog refresh remain available.'

    return new ProviderError('rate-limited', message, false)
  }

  private budgetUsed(
    state: ReturnType<typeof loadProviderAccessState>,
    budget: ProviderBudgetKind,
  ): number {
    return budget === 'sync'
      ? state.syncRequestCount
      : state.interactiveRequestCount
  }

  private budgetLimit(budget: ProviderBudgetKind): number {
    return budget === 'sync'
      ? this.syncDailyRequestBudget
      : this.interactiveDailyRequestBudget
  }

  private debitBudget(
    state: ReturnType<typeof loadProviderAccessState>,
    budget: ProviderBudgetKind,
  ): void {
    if (budget === 'sync') {
      state.syncRequestCount += 1
    } else {
      state.interactiveRequestCount += 1
      // Keep the retained legacy field diagnostic-friendly. It is no longer a
      // shared ceiling and deliberately mirrors interactive usage only.
      state.requestCount = state.interactiveRequestCount
    }
  }

  /**
   * Emits aggregate counter evidence only. Request URLs, credentials, query
   * parameters, item metadata, and response data are intentionally excluded.
   */
  private traceBudgetEvent(
    name:
      | 'provider-budget-debit'
      | 'provider-budget-rejected'
      | 'provider-request-blocked'
      | 'provider-refusal-recorded',
    state: ReturnType<typeof loadProviderAccessState>,
    priority: ProviderRequestPriority,
    budget: ProviderBudgetKind,
    reason?: 'budget-exhausted' | 'refusal',
  ): void {
    performanceTrace.event('network', name, {
      priority,
      budget,
      ...(reason ? { reason } : {}),
      interactiveUsed: state.interactiveRequestCount,
      interactiveLimit: this.interactiveDailyRequestBudget,
      interactiveRemaining: Math.max(
        0,
        this.interactiveDailyRequestBudget - state.interactiveRequestCount,
      ),
      syncUsed: state.syncRequestCount,
      syncLimit: this.syncDailyRequestBudget,
      syncRemaining: Math.max(0, this.syncDailyRequestBudget - state.syncRequestCount),
      blocked: state.block !== null,
    })
  }

  private normalizedState(now: number): {
    state: ReturnType<typeof loadProviderAccessState>
    resetRule: ProviderBudgetSnapshot['resetRule']
  } {
    const state = loadProviderAccessState(this.profileId)
    const currentWindowStart = utcWindowStart(now)
    let resetRule: ProviderBudgetSnapshot['resetRule']

    if (state.windowStartAt <= 0) {
      state.windowStartAt = currentWindowStart
      state.day = new Date(currentWindowStart).toISOString().slice(0, 10)
      resetRule = 'window initialized at the current UTC boundary'
    } else if (now < state.windowStartAt) {
      // Never grant requests merely because device time moved backward.
      resetRule = 'current time is before the persisted window start; counters preserved'
    } else if (
      now >= state.windowStartAt + BUDGET_WINDOW_MS &&
      currentWindowStart >= state.windowStartAt + BUDGET_WINDOW_MS
    ) {
      state.windowStartAt = currentWindowStart
      state.day = new Date(currentWindowStart).toISOString().slice(0, 10)
      state.requestCount = 0
      state.interactiveRequestCount = 0
      state.syncRequestCount = 0
      resetRule = 'window reset at or after its UTC boundary'
    } else {
      resetRule = 'current UTC window remains active'
    }

    if (state.block && !isProviderBlocked(state.block, now)) {
      state.block = null
    }

    return { state, resetRule }
  }

  private budgetSnapshot(
    state: ReturnType<typeof loadProviderAccessState>,
    resetRule: ProviderBudgetSnapshot['resetRule'],
    now: number,
  ): ProviderBudgetSnapshot {
    const interactiveLimit = this.interactiveDailyRequestBudget
    const syncLimit = this.syncDailyRequestBudget

    return {
      now,
      windowStartAt: state.windowStartAt,
      windowEndsAt: state.windowStartAt + BUDGET_WINDOW_MS,
      nextResetAt: state.windowStartAt + BUDGET_WINDOW_MS,
      resetRule,
      interactive: {
        used: state.interactiveRequestCount,
        limit: interactiveLimit,
        remaining: Math.max(0, interactiveLimit - state.interactiveRequestCount),
      },
      sync: {
        used: state.syncRequestCount,
        limit: syncLimit,
        remaining: Math.max(0, syncLimit - state.syncRequestCount),
      },
      block: state.block
        ? {
            kind: state.block.kind,
            until: state.block.until,
          }
        : null,
    }
  }

  private async drain(): Promise<void> {
    if (this.running) {
      return
    }

    this.running = true

    try {
      let pending: PendingRequest | undefined

      while ((pending = this.nextRequest())) {
        if (pending.signal?.aborted) {
          pending.reject(new ProviderError('cancelled', 'Request cancelled.', false))
          continue
        }

        const activeRequest = pending
        const now = this.now()
        const { state } = this.normalizedState(now)

        if (state.block && isProviderBlocked(state.block, now)) {
          const error = this.accessBlockedError()
          this.traceBudgetEvent(
            'provider-request-blocked',
            state,
            activeRequest.priority,
            activeRequest.budget,
            'refusal',
          )
          activeRequest.reject(error)
          this.rejectQueued(error)
          continue
        }

        if (
          this.budgetUsed(state, activeRequest.budget) >=
          this.budgetLimit(activeRequest.budget)
        ) {
          state.updatedAt = now
          saveProviderAccessState(this.profileId, state)
          this.traceBudgetEvent(
            'provider-budget-rejected',
            state,
            activeRequest.priority,
            activeRequest.budget,
            'budget-exhausted',
          )
          activeRequest.reject(this.budgetExceededError(activeRequest.budget))
          continue
        }

        const assertCanIssue = (): void => {
          if (activeRequest.signal?.aborted) {
            throw new ProviderError('cancelled', 'Request cancelled.', false)
          }

          const issueNow = this.now()

          if (state.block && isProviderBlocked(state.block, issueNow)) {
            throw this.accessBlockedError()
          }

          if (
            this.budgetUsed(state, activeRequest.budget) >=
            this.budgetLimit(activeRequest.budget)
          ) {
            throw this.budgetExceededError(activeRequest.budget)
          }
        }

        const recordIssuedRequest = (): void => {
          // The transport handoff has already happened. Do not re-check abort or
          // capacity here: either could change immediately after fetch begins,
          // but the provider has still received the request and it must be
          // represented by exactly one debit.
          this.debitBudget(state, activeRequest.budget)
          this.issuedRequestCounts[activeRequest.budget] += 1
          state.updatedAt = this.now()
          saveProviderAccessState(this.profileId, state)
          this.traceBudgetEvent(
            'provider-budget-debit',
            state,
            activeRequest.priority,
            activeRequest.budget,
          )
        }

        try {
          const result = await this.client.runWithRequestIssueObserver(
            assertCanIssue,
            recordIssuedRequest,
            () => activeRequest.run(this.client),
          )
          state.failureCount = 0
          state.nextAttemptAt = null
          state.updatedAt = this.now()
          saveProviderAccessState(this.profileId, state)
          activeRequest.resolve(result)
        } catch (reason) {
          const block = providerBlockForFailure(reason, this.now())

          if (block) {
            state.block = block
            state.updatedAt = this.now()
            saveProviderAccessState(this.profileId, state)
            this.traceBudgetEvent(
              'provider-refusal-recorded',
              state,
              activeRequest.priority,
              activeRequest.budget,
              'refusal',
            )
            activeRequest.reject(reason)
            this.rejectQueued(reason)
            continue
          }

          state.failureCount += 1
          state.updatedAt = this.now()
          saveProviderAccessState(this.profileId, state)
          activeRequest.reject(reason)
        }
      }
    } finally {
      this.running = false

      if (this.hasQueuedRequests) {
        void this.drain()
      }
    }
  }
}