import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderBroker } from './provider-broker'
import { performanceTrace } from './performance-trace'
import { loadProviderAccessState } from './storage'
import type { ProviderTransport } from './provider-transport'
import type { XtreamProfile } from './types'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

const profile: XtreamProfile = {
  id: 'broker-profile',
  name: 'Broker test',
  serverUrl: 'https://provider.example',
  username: 'user',
  password: 'password',
}

const accountResponse = (): Response =>
  new Response(JSON.stringify({ user_info: { auth: '1', status: 'Active' } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

function responseForAction(action: string | null): Response {
  if (!action) {
    return accountResponse()
  }

  if (action === 'get_vod_info') {
    return new Response(JSON.stringify({ info: {}, movie_data: {} }), { status: 200 })
  }

  if (action === 'get_series_info') {
    return new Response(JSON.stringify({ info: {}, episodes: {} }), { status: 200 })
  }

  return new Response('[]', { status: 200 })
}

afterEach(() => {
  performanceTrace.disable()
  performanceTrace.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ProviderBroker', () => {
  it('runs provider requests one at a time', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    let resolveFirst: ((response: Response) => void) | undefined
    let inFlight = 0
    let greatestInFlight = 0
    const transport: ProviderTransport = {
      fetch: vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            inFlight += 1
            greatestInFlight = Math.max(greatestInFlight, inFlight)
            resolveFirst = (response) => {
              inFlight -= 1
              resolve(response)
            }
          }),
      ),
    }
    const broker = new ProviderBroker(profile, { transport, dailyRequestBudget: 3 })

    const first = broker.validate()
    const second = broker.validate()

    await Promise.resolve()
    expect(transport.fetch).toHaveBeenCalledTimes(1)
    expect(greatestInFlight).toBe(1)

    resolveFirst?.(accountResponse())
    await first
    await Promise.resolve()

    expect(transport.fetch).toHaveBeenCalledTimes(2)
    resolveFirst?.(accountResponse())
    await second
    expect(greatestInFlight).toBe(1)
  })

  it('initializes both persisted budget counters from an empty access record', () => {
    vi.stubGlobal('localStorage', new MemoryStorage())

    expect(loadProviderAccessState(profile.id)).toMatchObject({
      windowStartAt: 0,
      interactiveRequestCount: 0,
      syncRequestCount: 0,
    })
  })

  it('rejects a request before transport once the daily budget is exhausted', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    const transport: ProviderTransport = {
      fetch: vi.fn(async () => accountResponse()),
    }
    const broker = new ProviderBroker(profile, { transport, dailyRequestBudget: 1 })

    await broker.validate()
    await expect(broker.validate()).rejects.toMatchObject({ kind: 'rate-limited' })
    expect(transport.fetch).toHaveBeenCalledTimes(1)
    expect(broker.inspectBudget()).toMatchObject({
      interactive: { used: 1 },
      sync: { used: 0 },
    })
  })

  it('does not debit an attempt already aborted before it can reach transport', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    const transport: ProviderTransport = {
      fetch: vi.fn(async () => new Response('[]', { status: 200 })),
    }
    const broker = new ProviderBroker(profile, { transport })
    const controller = new AbortController()
    controller.abort()

    await expect(broker.backgroundCategories('live', controller.signal)).rejects.toMatchObject({
      kind: 'cancelled',
    })

    expect(transport.fetch).not.toHaveBeenCalled()
    expect(broker.inspectBudget()).toMatchObject({
      interactive: { used: 0 },
      sync: { used: 0 },
    })
  })

  it('does not debit when the transport throws before issuing a request', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    const transport: ProviderTransport = {
      fetch: vi.fn(() => {
        throw new Error('Transport setup failed before request handoff.')
      }),
    }
    const broker = new ProviderBroker(profile, { transport })

    await expect(broker.backgroundCategories('live')).rejects.toMatchObject({
      kind: 'network',
    })

    expect(transport.fetch).toHaveBeenCalledTimes(1)
    expect(broker.inspectBudget()).toMatchObject({
      interactive: { used: 0 },
      sync: { used: 0 },
    })
  })

  it('persists a provider refusal and blocks requests after a simulated relaunch', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    const refusedTransport: ProviderTransport = {
      fetch: vi.fn(async () => new Response('rate limited', { status: 429 })),
    }
    const firstBroker = new ProviderBroker(profile, {
      transport: refusedTransport,
      dailyRequestBudget: 3,
    })

    await expect(firstBroker.validate()).rejects.toMatchObject({ kind: 'rate-limited' })

    const laterTransport: ProviderTransport = {
      fetch: vi.fn(async () => accountResponse()),
    }
    const relaunchedBroker = new ProviderBroker(profile, {
      transport: laterTransport,
      dailyRequestBudget: 3,
    })

    await expect(relaunchedBroker.validate()).rejects.toMatchObject({ kind: 'rate-limited' })
    expect(laterTransport.fetch).not.toHaveBeenCalled()
    expect(relaunchedBroker.inspectBudget()).toMatchObject({
      interactive: { used: 1 },
      sync: { used: 0 },
    })
  })

  it('runs interactive work before queued catalog and background work', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    const requestedActions: string[] = []
    const resolvers: Array<(response: Response) => void> = []
    const transport: ProviderTransport = {
      fetch: vi.fn(
        (url: string) =>
          new Promise<Response>((resolve) => {
            requestedActions.push(new URL(url).searchParams.get('action') ?? 'validate')
            resolvers.push(resolve)
          }),
      ),
    }
    const broker = new ProviderBroker(profile, { transport, dailyRequestBudget: 6 })

    const firstInteractive = broker.validate()
    await vi.waitFor(() => expect(resolvers).toHaveLength(1))

    const background = broker.nowNext('live-1')
    const catalog = broker.categories('live')
    const secondInteractive = broker.validate()

    resolvers.shift()?.(accountResponse())
    await firstInteractive
    await vi.waitFor(() => expect(resolvers).toHaveLength(1))
    resolvers.shift()?.(accountResponse())
    await secondInteractive
    await vi.waitFor(() => expect(resolvers).toHaveLength(1))
    resolvers.shift()?.(new Response('[]', { status: 200 }))
    await catalog
    await vi.waitFor(() => expect(resolvers).toHaveLength(1))
    resolvers.shift()?.(new Response('[]', { status: 200 }))
    await vi.waitFor(() => expect(resolvers).toHaveLength(1))
    resolvers.shift()?.(new Response('[]', { status: 200 }))
    await background

    expect(requestedActions).toEqual([
      'validate',
      'validate',
      'get_live_categories',
      'get_short_epg',
      'get_simple_data_table',
    ])
  })

  it('rejects queued work without another fetch after a provider refusal', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    let refuseFirst: ((response: Response) => void) | undefined
    const transport: ProviderTransport = {
      fetch: vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            refuseFirst = resolve
          }),
      ),
    }
    const broker = new ProviderBroker(profile, { transport, dailyRequestBudget: 3 })

    const refused = broker.validate()
    const queued = broker.categories('live')
    const refusedResult = expect(refused).rejects.toMatchObject({ kind: 'rate-limited' })
    const queuedResult = expect(queued).rejects.toMatchObject({ kind: 'rate-limited' })

    await Promise.resolve()
    refuseFirst?.(new Response('rate limited', { status: 429 }))

    await refusedResult
    await queuedResult
    expect(transport.fetch).toHaveBeenCalledTimes(1)
  })

  it('emits a sanitized aggregate counter trace for each budget debit', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    const transport: ProviderTransport = {
      fetch: vi.fn(async () => new Response('[]', { status: 200 })),
    }
    const broker = new ProviderBroker(profile, {
      transport,
      interactiveDailyRequestBudget: 24,
      syncDailyRequestBudget: 6,
    })
    performanceTrace.enable()
    performanceTrace.clear()

    await broker.backgroundCategories('live')

    const debit = performanceTrace
      .snapshot()
      .events.find((event) => event.name === 'provider-budget-debit')

    expect(debit).toMatchObject({
      category: 'network',
      data: {
        priority: 'background',
        budget: 'sync',
        interactiveUsed: 0,
        interactiveLimit: 24,
        interactiveRemaining: 24,
        syncUsed: 1,
        syncLimit: 6,
        syncRemaining: 5,
        blocked: false,
      },
    })
    expect(JSON.stringify(debit)).not.toContain(profile.serverUrl)
    expect(JSON.stringify(debit)).not.toContain(profile.username)
    expect(JSON.stringify(debit)).not.toContain(profile.password)
  })

  it('refuses a partial scheduled catalog pass without consuming its final sync debit', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    const transport: ProviderTransport = {
      fetch: vi.fn(async () => new Response('[]', { status: 200 })),
    }
    const broker = new ProviderBroker(profile, {
      transport,
      interactiveDailyRequestBudget: 24,
      syncDailyRequestBudget: 6,
    })

    for (let index = 0; index < 5; index += 1) {
      await broker.backgroundCategories('live')
    }

    const preflight = broker.canBeginCatalogSync(6)

    expect(preflight).toMatchObject({
      allowed: false,
      reason: 'budget-exhausted',
      budget: { sync: { used: 5, remaining: 1 } },
    })
    expect(preflight.nextEligibleAt).toEqual(expect.any(Number))
    expect(transport.fetch).toHaveBeenCalledTimes(5)
    expect(broker.inspectBudget()).toMatchObject({
      interactive: { used: 0 },
      sync: { used: 5, remaining: 1 },
    })
  })

  it('keeps normal interactive use out of the six-request catalog-sync budget', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    const transport: ProviderTransport = {
      fetch: vi.fn(async (url: string) => responseForAction(new URL(url).searchParams.get('action'))),
    }
    const broker = new ProviderBroker(profile, {
      transport,
      interactiveDailyRequestBudget: 16,
      syncDailyRequestBudget: 6,
    })

    await broker.validate()
    await Promise.all([
      broker.categories('live'),
      broker.categories('vod'),
      broker.categories('series'),
    ])
    await Promise.all([
      broker.streams('live', 'live-category'),
      broker.streams('vod', 'vod-category'),
      broker.streams('series', 'series-category'),
    ])
    await broker.vodInfo('movie-1')
    await broker.seriesInfo('series-1')

    expect(broker.inspectBudget()).toMatchObject({
      interactive: { used: 9, remaining: 7 },
      sync: { used: 0, remaining: 6 },
    })

    for (let index = 0; index < 6; index += 1) {
      await broker.backgroundCategories('live')
    }

    expect(broker.inspectBudget()).toMatchObject({
      interactive: { used: 9 },
      sync: { used: 6, remaining: 0 },
    })
  })

  it('rolls an UTC window over at its exact boundary across relaunch without granting budget on clock rollback', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    let now = Date.UTC(2026, 7, 1, 23, 59, 59, 999)
    const transport: ProviderTransport = {
      fetch: vi.fn(async () => accountResponse()),
    }
    const first = new ProviderBroker(profile, {
      transport,
      interactiveDailyRequestBudget: 2,
      syncDailyRequestBudget: 6,
      now: () => now,
    })

    await first.validate()
    const beforeBoundary = first.inspectBudget()
    expect(beforeBoundary).toMatchObject({
      windowStartAt: Date.UTC(2026, 7, 1),
      nextResetAt: Date.UTC(2026, 7, 2),
      interactive: { used: 1 },
    })

    const relaunchedBeforeBoundary = new ProviderBroker(profile, {
      transport,
      interactiveDailyRequestBudget: 2,
      syncDailyRequestBudget: 6,
      now: () => now,
    })
    expect(relaunchedBeforeBoundary.inspectBudget().interactive.used).toBe(1)

    now = Date.UTC(2026, 7, 2)
    const atBoundary = new ProviderBroker(profile, {
      transport,
      interactiveDailyRequestBudget: 2,
      syncDailyRequestBudget: 6,
      now: () => now,
    })
    expect(atBoundary.inspectBudget()).toMatchObject({
      windowStartAt: Date.UTC(2026, 7, 2),
      resetRule: 'window reset at or after its UTC boundary',
      interactive: { used: 0 },
      sync: { used: 0 },
    })

    await atBoundary.validate()
    now = Date.UTC(2026, 7, 1, 23, 59, 59, 999)
    expect(atBoundary.inspectBudget()).toMatchObject({
      resetRule: 'current time is before the persisted window start; counters preserved',
      interactive: { used: 1 },
    })
  })

  it('allows due sync after interactive exhaustion and retains playback capability after sync exhaustion', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    const transport: ProviderTransport = {
      fetch: vi.fn(async (url: string) => responseForAction(new URL(url).searchParams.get('action'))),
    }
    const broker = new ProviderBroker(profile, {
      transport,
      interactiveDailyRequestBudget: 1,
      syncDailyRequestBudget: 1,
    })

    await broker.validate()
    await expect(broker.categories('live')).rejects.toMatchObject({ kind: 'rate-limited' })
    await broker.backgroundCategories('live')
    await expect(broker.backgroundCategories('live')).rejects.toMatchObject({
      kind: 'rate-limited',
    })

    // Playback URL generation is local and remains available regardless of
    // either provider allowance.
    expect(
      broker.streamUrl({
        id: 'stream-1',
        name: 'Stream',
        section: 'live',
        categoryId: 'live-category',
        containerExtension: 'ts',
      }),
    ).toContain('/live/')
    expect(transport.fetch).toHaveBeenCalledTimes(2)
  })

  it('migrates a legacy shared counter into interactive usage without consuming the new sync budget', () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('localStorage', storage)
    storage.setItem(
      'nova-play.provider-access',
      JSON.stringify({
        [profile.id]: {
          day: '2026-08-01',
          requestCount: 6,
          block: null,
          failureCount: 0,
          nextAttemptAt: null,
          updatedAt: Date.UTC(2026, 7, 1, 8),
        },
      }),
    )
    const broker = new ProviderBroker(profile, {
      now: () => Date.UTC(2026, 7, 1, 12),
    })

    expect(broker.inspectBudget()).toMatchObject({
      windowStartAt: Date.UTC(2026, 7, 1),
      interactive: { used: 6 },
      sync: { used: 0, remaining: 6 },
    })
  })

  it('keeps an active refusal across relaunch and probe budget reset', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    let now = Date.UTC(2026, 7, 1, 12)
    const refusedTransport: ProviderTransport = {
      fetch: vi.fn(async () => new Response('rate limited', {
        status: 429,
        headers: { 'retry-after': '90' },
      })),
    }
    const first = new ProviderBroker(profile, {
      transport: refusedTransport,
      now: () => now,
    })

    await expect(first.validate()).rejects.toMatchObject({ kind: 'rate-limited' })
    const beforeReset = first.inspectBudget()
    const laterTransport: ProviderTransport = {
      fetch: vi.fn(async () => accountResponse()),
    }
    const relaunched = new ProviderBroker(profile, {
      transport: laterTransport,
      now: () => now,
    })
    const afterReset = relaunched.resetBudgetsForProbe()

    expect(afterReset.block).toEqual(beforeReset.block)
    await expect(relaunched.backgroundCategories('live')).rejects.toMatchObject({
      kind: 'rate-limited',
    })
    expect(laterTransport.fetch).not.toHaveBeenCalled()

    // The existing provider guard retains a conservative five-minute minimum
    // even when Retry-After is shorter. Probe reset must not bypass it.
    now += 5 * 60_000
    expect(relaunched.inspectBudget().block).toBeNull()
  })
})