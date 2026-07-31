export type SearchCatalogWarmState =
  | 'idle'
  | 'queued'
  | 'loading'
  | 'complete'
  | 'oversized'
  | 'failed'

export type SearchCatalogWarmResult = 'complete' | 'oversized'

type QueueOptions<T extends string> = {
  load: (section: T, signal: AbortSignal) => Promise<SearchCatalogWarmResult>
  onStateChange?: (section: T, state: SearchCatalogWarmState) => void
  retryDelayMs: number
  now?: () => number
}

/**
 * Runs at most one catalog warming request at a time. A failed section is
 * retried only after its backoff expires; oversized sections stay disabled
 * until the owning cache is reset.
 */
export class SearchCatalogWarmQueue<T extends string> {
  private readonly queue: T[] = []
  private readonly states = new Map<T, SearchCatalogWarmState>()
  private readonly failedAt = new Map<T, number>()
  private readonly load: QueueOptions<T>['load']
  private readonly onStateChange?: QueueOptions<T>['onStateChange']
  private readonly retryDelayMs: number
  private readonly now: () => number
  private controller: AbortController | null = null
  private generation = 0
  private draining = false

  constructor(options: QueueOptions<T>) {
    this.load = options.load
    this.onStateChange = options.onStateChange
    this.retryDelayMs = options.retryDelayMs
    this.now = options.now ?? Date.now
  }

  state(section: T): SearchCatalogWarmState {
    return this.states.get(section) ?? 'idle'
  }

  request(section: T): boolean {
    const state = this.state(section)

    if (state === 'queued' || state === 'loading' || state === 'complete' || state === 'oversized') {
      return false
    }

    const failedAt = this.failedAt.get(section)

    if (state === 'failed' && failedAt !== undefined && this.now() - failedAt < this.retryDelayMs) {
      return false
    }

    this.setState(section, 'queued')
    this.queue.push(section)
    void this.drain()
    return true
  }

  invalidate(section: T): void {
    this.queue.splice(
      0,
      this.queue.length,
      ...this.queue.filter((candidate) => candidate !== section),
    )
    this.failedAt.delete(section)
    this.setState(section, 'idle')
  }

  /**
   * Stops queued/active work without discarding completed or oversized state.
   * A later request can resume warming an interrupted section.
   */
  cancel(): void {
    this.generation += 1
    const activeSections = [...this.states.entries()]
      .filter(([, state]) => state === 'queued' || state === 'loading')
      .map(([section]) => section)

    this.controller?.abort()
    this.controller = null
    this.queue.length = 0
    this.draining = false

    activeSections.forEach((section) => this.setState(section, 'idle'))
  }

  clear(): void {
    this.cancel()
    this.failedAt.clear()
    this.states.clear()
  }

  private setState(section: T, state: SearchCatalogWarmState): void {
    this.states.set(section, state)
    this.onStateChange?.(section, state)
  }

  private async drain(): Promise<void> {
    if (this.draining) {
      return
    }

    this.draining = true
    const generation = this.generation

    try {
      while (generation === this.generation && this.queue.length) {
        const section = this.queue.shift()!

        if (this.state(section) !== 'queued') {
          continue
        }

        const controller = new AbortController()
        this.controller = controller
        this.setState(section, 'loading')

        try {
          const outcome = await this.load(section, controller.signal)

          if (generation !== this.generation || controller.signal.aborted) {
            continue
          }

          this.setState(section, outcome)
          if (outcome !== 'oversized') {
            this.failedAt.delete(section)
          }
        } catch {
          if (generation !== this.generation || controller.signal.aborted) {
            continue
          }

          this.failedAt.set(section, this.now())
          this.setState(section, 'failed')
        } finally {
          if (this.controller === controller) {
            this.controller = null
          }
        }
      }
    } finally {
      if (generation === this.generation) {
        this.draining = false
      }
    }
  }
}