import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { ProviderError } from '../provider-error'
import { performanceTrace } from '../performance-trace'
import { ProviderBroker } from '../provider-broker'
import { FixtureProviderTransport } from '../provider-transport'
import type { Category, LibrarySection, StreamItem, XtreamProfile } from '../types'
import type { StreamScanOptions } from '../xtream-client'
import {
  CatalogSyncCoordinator,
  VOD_SYNC_MEASUREMENT_MAX_RESPONSE_BYTES,
  type CatalogSyncProvider,
} from './catalog-sync'
import {
  IndexedDbCatalogRepository,
  deleteLibraryDatabase,
} from './catalog-repository'

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

const databaseNames: string[] = []
const repositories: IndexedDbCatalogRepository[] = []
const fixtureProfile: XtreamProfile = {
  id: 'fixture-profile',
  name: 'Fixture profile',
  serverUrl: 'https://fixture.invalid',
  username: 'fixture-user',
  password: 'fixture-password',
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
})

afterEach(async () => {
  performanceTrace.disable()
  performanceTrace.clear()
  repositories.splice(0).forEach((repository) => repository.close())
  await Promise.all(databaseNames.splice(0).map(deleteLibraryDatabase))
  vi.unstubAllGlobals()
})

describe('CatalogSyncCoordinator', () => {
  it('acquires a complete catalog through the real broker using only registered transport fixtures', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    const repository = createRepository()
    const broker = new ProviderBroker(fixtureProfile, {
      transport: new FixtureProviderTransport({
        [fixtureUrl('get_live_categories')]: jsonResponse([
          { category_id: 'live-a', category_name: 'Live A' },
        ]),
        [fixtureUrl('get_vod_categories')]: jsonResponse([
          { category_id: 'vod-a', category_name: 'VOD A' },
        ]),
        [fixtureUrl('get_series_categories')]: jsonResponse([
          { category_id: 'series-a', category_name: 'Series A' },
        ]),
        [fixtureUrl('get_live_streams')]: jsonResponse([
          { stream_id: 'live-1', name: 'Fixture Live', category_id: 'live-a' },
        ]),
        [fixtureUrl('get_vod_streams')]: jsonResponse([
          { stream_id: 'vod-1', name: 'Fixture VOD', category_id: 'vod-a' },
        ]),
        [fixtureUrl('get_series')]: jsonResponse([
          { series_id: 'series-1', name: 'Fixture Series', category_id: 'series-a' },
        ]),
      }),
      dailyRequestBudget: 6,
    })

    const result = await new CatalogSyncCoordinator(broker, repository).sync(
      fixtureProfile.id,
    )

    expect(result).toMatchObject({
      status: 'completed',
      requestCount: 6,
      issuedRequestCount: 6,
      sections: [
        { section: 'live', attemptedRequestCount: 2, issuedRequestCount: 2 },
        { section: 'vod', attemptedRequestCount: 2, issuedRequestCount: 2 },
        { section: 'series', attemptedRequestCount: 2, issuedRequestCount: 2 },
      ],
    })
    const cooldown = await new CatalogSyncCoordinator(broker, repository).sync(fixtureProfile.id)
    expect(cooldown).toMatchObject({ status: 'cooldown', requestCount: 0 })
    expect(broker.inspectBudget()).toMatchObject({
      interactive: { used: 0 },
      sync: { used: 6, remaining: 0 },
    })
    await expect(broker.backgroundCategories('live')).rejects.toMatchObject({
      kind: 'rate-limited',
    })
    await expect(
      repository.readCategoryShard(fixtureProfile.id, 'series', 'series-a', 0),
    ).resolves.toMatchObject({
      coverage: 'complete',
      items: [expect.objectContaining({ id: 'series-1' })],
    })
  })

  it('defers a scheduled run before provider traffic when fewer than six sync debits remain', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    const repository = createRepository()
    const transport = {
      fetch: vi.fn(async () => new Response('[]', { status: 200 })),
    }
    const broker = new ProviderBroker(fixtureProfile, {
      transport,
      interactiveDailyRequestBudget: 24,
      syncDailyRequestBudget: 6,
    })

    for (let index = 0; index < 5; index += 1) {
      await broker.backgroundCategories('live')
    }

    const result = await new CatalogSyncCoordinator(broker, repository).sync(fixtureProfile.id)

    expect(result).toMatchObject({
      status: 'deferred',
      requestCount: 0,
      sections: [],
      nextDueAt: expect.any(Number),
    })
    expect(transport.fetch).toHaveBeenCalledTimes(5)
    expect(broker.inspectBudget()).toMatchObject({
      interactive: { used: 0 },
      sync: { used: 5, remaining: 1 },
    })
  })

  it('runs an explicit VOD-only measurement from the persisted manifest in one request', async () => {
    let now = 1_000
    const repository = createRepository(() => now)
    const provider = new FixtureCatalogProvider()
    const coordinator = new CatalogSyncCoordinator(provider, repository, { now: () => now })

    provider.failScans.add('vod')
    const initial = await coordinator.sync('profile-a')
    expect(initial).toMatchObject({ status: 'failed', requestCount: 6 })

    provider.failScans.delete('vod')
    provider.calls.length = 0
    provider.scanOptions.length = 0

    const result = await coordinator.sync('profile-a', {
      section: 'vod',
      maxResponseBytes: VOD_SYNC_MEASUREMENT_MAX_RESPONSE_BYTES,
    })

    expect(result).toMatchObject({
      status: 'completed',
      requestCount: 1,
      sections: [
        {
          section: 'vod',
          mode: 'whole-section',
          success: true,
          attemptedRequestCount: 1,
        },
      ],
    })
    expect(provider.calls).toEqual(['scan:vod'])
    expect(provider.scanOptions).toHaveLength(1)
    expect(provider.scanOptions[0]).toMatchObject({
      maxResponseBytes: VOD_SYNC_MEASUREMENT_MAX_RESPONSE_BYTES,
    })
    expect((await repository.getMeta('profile-a'))?.sync.sections?.vod).toMatchObject({
      coverage: 'complete',
      wholeSectionFailureCount: 0,
      nextCategoryCursor: 0,
    })
  })

  it('allows one targeted VOD request when exactly one sync debit remains', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    const repository = createRepository()
    const transport = new FixtureProviderTransport({
      [fixtureUrl('get_live_categories')]: jsonResponse([]),
      [fixtureUrl('get_vod_streams')]: jsonResponse([
        { stream_id: 'vod-1', name: 'Fixture VOD', category_id: 'vod-a' },
      ]),
    })
    const broker = new ProviderBroker(fixtureProfile, {
      transport,
      syncDailyRequestBudget: 6,
    })

    for (let index = 0; index < 5; index += 1) {
      await broker.backgroundCategories('live')
    }

    await repository.putSectionManifest(fixtureProfile.id, 'vod', [
      { id: 'vod-a', name: 'VOD A' },
    ])

    const result = await new CatalogSyncCoordinator(broker, repository).sync(
      fixtureProfile.id,
      {
        section: 'vod',
        maxResponseBytes: VOD_SYNC_MEASUREMENT_MAX_RESPONSE_BYTES,
      },
    )

    expect(result).toMatchObject({
      status: 'completed',
      requestCount: 1,
      issuedRequestCount: 1,
      sections: [
        {
          section: 'vod',
          attemptedRequestCount: 1,
          issuedRequestCount: 1,
        },
      ],
    })
    expect(broker.inspectBudget()).toMatchObject({
      sync: { used: 6, remaining: 0 },
    })
    await expect(
      repository.readCategoryShard(fixtureProfile.id, 'vod', 'vod-a', 0),
    ).resolves.toMatchObject({
      coverage: 'complete',
      items: [expect.objectContaining({ id: 'vod-1' })],
    })
  })

  it('reports an attempted request without a debit when transport fails before handoff', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    const repository = createRepository()
    const transport = {
      fetch: vi.fn(() => {
        throw new Error('Synchronous fixture transport failure.')
      }),
    }
    const broker = new ProviderBroker(fixtureProfile, {
      transport,
      syncDailyRequestBudget: 6,
    })

    const result = await new CatalogSyncCoordinator(broker, repository).sync(fixtureProfile.id)

    expect(result).toMatchObject({
      status: 'failed',
      requestCount: 3,
      issuedRequestCount: 0,
      sections: [
        {
          section: 'live',
          mode: 'skipped',
          attemptedRequestCount: 1,
          issuedRequestCount: 0,
          reason: 'category-request-failed',
        },
        {
          section: 'vod',
          mode: 'skipped',
          attemptedRequestCount: 1,
          issuedRequestCount: 0,
          reason: 'category-request-failed',
        },
        {
          section: 'series',
          mode: 'skipped',
          attemptedRequestCount: 1,
          issuedRequestCount: 0,
          reason: 'category-request-failed',
        },
      ],
    })
    expect(broker.inspectBudget()).toMatchObject({
      sync: { used: 0, remaining: 6 },
    })
    expect(transport.fetch).toHaveBeenCalledTimes(3)
  })

  it('acquires a complete catalog in exactly six serial background requests', async () => {
    let now = 1_000
    const repository = createRepository(() => now)
    const provider = new FixtureCatalogProvider()

    const result = await new CatalogSyncCoordinator(provider, repository, { now: () => now })
      .sync('profile-a')

    expect(result).toMatchObject({
      status: 'completed',
      requestCount: 6,
    })
    expect(provider.calls).toEqual([
      'categories:live',
      'categories:vod',
      'categories:series',
      'scan:live',
      'scan:vod',
      'scan:series',
    ])
    expect(provider.maxInFlight).toBe(1)

    const meta = await repository.getMeta('profile-a')
    expect(meta?.sync.sections).toMatchObject({
      live: { coverage: 'complete', wholeSectionFailureCount: 0 },
      vod: { coverage: 'complete', wholeSectionFailureCount: 0 },
      series: { coverage: 'complete', wholeSectionFailureCount: 0 },
    })
    expect(
      await repository.readCategoryShard('profile-a', 'live', 'live-a', 0),
    ).toMatchObject({
      coverage: 'complete',
      items: [expect.objectContaining({ id: 'live-a-1' })],
    })
  })

  it('persists a cooldown so a relaunched coordinator issues zero requests', async () => {
    let now = 1_000
    const databaseName = uniqueDatabaseName()
    const first = createRepository(() => now, databaseName)
    const provider = new FixtureCatalogProvider()
    const firstCoordinator = new CatalogSyncCoordinator(provider, first, { now: () => now })

    const completed = await firstCoordinator.sync('profile-a')
    expect(completed.status).toBe('completed')
    first.close()

    const relaunched = createRepository(() => now, databaseName)
    const secondProvider = new FixtureCatalogProvider()
    const next = await new CatalogSyncCoordinator(secondProvider, relaunched, { now: () => now })
      .sync('profile-a')

    expect(next).toEqual({
      status: 'cooldown',
      requestCount: 0,
      issuedRequestCount: 0,
      nextDueAt: completed.nextDueAt,
      sections: [],
    })
    expect(secondProvider.calls).toEqual([])
  })

  it('preserves a published section after a failed whole-section refresh and records fallback state', async () => {
    let now = 1_000
    const repository = createRepository(() => now)
    const provider = new FixtureCatalogProvider()
    const coordinator = new CatalogSyncCoordinator(provider, repository, { now: () => now })

    const first = await coordinator.sync('profile-a')
    now = requiredNextDueAt(first)
    provider.failScans.add('live')

    const second = await coordinator.sync('profile-a')

    expect(second).toMatchObject({ status: 'failed', requestCount: 6 })
    expect(
      await repository.readCategoryShard('profile-a', 'live', 'live-a', 0),
    ).toMatchObject({
      coverage: 'complete',
      items: [expect.objectContaining({ id: 'live-a-1' })],
    })
    expect((await repository.getMeta('profile-a'))?.sync.sections?.live).toMatchObject({
      coverage: 'complete',
      wholeSectionFailureCount: 1,
    })
  })

  it('uses the next scheduled run for one checkpointed category slice and resumes its cursor', async () => {
    let now = 1_000
    const repository = createRepository(() => now)
    const provider = new FixtureCatalogProvider()
    const coordinator = new CatalogSyncCoordinator(provider, repository, { now: () => now })

    const first = await coordinator.sync('profile-a')
    now = requiredNextDueAt(first)
    provider.failScans.add('live')
    const failed = await coordinator.sync('profile-a')

    now = requiredNextDueAt(failed)
    provider.failScans.delete('live')
    provider.calls.length = 0
    const fallback = await coordinator.sync('profile-a')

    expect(fallback).toMatchObject({ status: 'completed', requestCount: 6 })
    expect(provider.calls).toContain('scan:live:live-a')
    expect(provider.calls).not.toContain('scan:live')
    expect((await repository.getMeta('profile-a'))?.sync.sections?.live).toMatchObject({
      nextCategoryCursor: 1,
      wholeSectionFailureCount: 1,
    })

    now = requiredNextDueAt(fallback)
    provider.calls.length = 0
    const resumed = await coordinator.sync('profile-a')

    expect(resumed).toMatchObject({ status: 'completed', requestCount: 6 })
    expect(provider.calls).toContain('scan:live:live-b')
    expect((await repository.getMeta('profile-a'))?.sync.sections?.live).toMatchObject({
      nextCategoryCursor: 0,
      wholeSectionFailureCount: 0,
    })
  })

  it('stops after the first refusal without issuing more provider traffic', async () => {
    const repository = createRepository()
    const provider = new FixtureCatalogProvider()
    provider.refuseCategories.add('live')

    const result = await new CatalogSyncCoordinator(provider, repository).sync('profile-a')

    expect(result).toMatchObject({ status: 'failed', requestCount: 1 })
    expect(provider.calls).toEqual(['categories:live'])
    expect((await repository.getMeta('profile-a'))?.sync.sections?.live?.lastFailureAt)
      .toEqual(expect.any(Number))
  })

  it('keeps provider failures fully sanitized even when internal diagnostics are enabled', async () => {
    const repository = createRepository()
    const provider = new FixtureCatalogProvider()
    provider.failScans.add('live')
    performanceTrace.enable()
    performanceTrace.clear()

    const result = await new CatalogSyncCoordinator(provider, repository, {
      internalFaultDiagnostics: true,
    }).sync('profile-a')

    expect(result).toMatchObject({ status: 'failed', requestCount: 6 })
    const event = performanceTrace
      .snapshot()
      .events.find((candidate) => candidate.name === 'catalog-sync-section-failed')

    expect(event).toMatchObject({
      category: 'library',
      data: {
        section: 'live',
        mode: 'whole-section',
        failureStage: 'provider-scan',
        publishStage: null,
        refused: false,
        failureSource: 'provider',
        providerKind: 'server',
        exceptionType: 'ProviderError',
      },
    })
    expect(event?.data).not.toHaveProperty('faultMessage')
    expect(event?.data).not.toHaveProperty('faultFrame1')
  })

  it('records bounded probe-only detail for an internal snapshot publication fault', async () => {
    const repository = createRepository()
    const provider = new FixtureCatalogProvider()
    const originalAppend = repository.appendPartialCategorySnapshot.bind(repository)
    const appendSpy = vi
      .spyOn(repository, 'appendPartialCategorySnapshot')
      .mockImplementation(async (input, options) => {
        if (input.section === 'live') {
          options?.onPublishStage?.('manifest-put')
          const error = new ReferenceError(
            'structuredClone is not defined at https://fixture-user:fixture-password@private.invalid/',
          )
          error.stack =
            'ReferenceError: structuredClone is not defined\\n' +
            '    at publish (app.js:101:22)\\n' +
            '    at coordinator (app.js:99:4)'
          throw error
        }

        return originalAppend(input, options)
      })
    performanceTrace.enable()
    performanceTrace.clear()

    try {
      const result = await new CatalogSyncCoordinator(provider, repository, {
        internalFaultDiagnostics: true,
      }).sync('profile-a')

      expect(result).toMatchObject({ status: 'failed', requestCount: 6 })
      expect(
        performanceTrace
          .snapshot()
          .events.find((candidate) => candidate.name === 'catalog-sync-section-failed'),
      ).toMatchObject({
        category: 'library',
        data: {
          section: 'live',
          mode: 'whole-section',
          failureStage: 'snapshot-publish',
          publishStage: 'manifest-put',
          refused: false,
          failureSource: 'unknown',
          providerKind: null,
          exceptionType: 'ReferenceError',
          faultType: 'ReferenceError',
          faultMessage: 'structuredClone is not defined at [url]',
          faultFrame1: 'app.js:101:22',
          faultFrame2: 'app.js:99:4',
        },
      })
    } finally {
      appendSpy.mockRestore()
    }
  })

  it('persists a durable partial category snapshot after an interrupted first section scan and resumes the first incomplete category', async () => {
    let now = 1_000
    const repository = createRepository(() => now)
    const provider = new FixtureCatalogProvider()
    provider.partialBatchCount = 128
    provider.partialFailures.add('vod')
    const coordinator = new CatalogSyncCoordinator(provider, repository, { now: () => now })

    const failed = await coordinator.sync('profile-a')

    expect(failed).toMatchObject({ status: 'failed', requestCount: 6 })
    expect((await repository.getManifest('profile-a', 'vod'))?.coverage).toMatchObject({
      state: 'partial',
      completeCategoryCount: 0,
      itemCount: 128,
    })
    expect((await repository.getMeta('profile-a'))?.sync.sections?.vod).toMatchObject({
      coverage: 'partial',
      wholeSectionFailureCount: 1,
      nextCategoryCursor: 0,
    })
    await expect(
      repository.readCategoryShard('profile-a', 'vod', 'vod-a', 0),
    ).resolves.toMatchObject({
      coverage: 'none',
      reason: 'category-unavailable',
    })

    now = requiredNextDueAt(failed)
    provider.partialFailures.delete('vod')
    provider.calls.length = 0
    const resumed = await coordinator.sync('profile-a')

    expect(resumed).toMatchObject({ status: 'completed', requestCount: 6 })
    expect(provider.calls).toContain('scan:vod:vod-a')
    expect(provider.calls).not.toContain('scan:vod')
    expect((await repository.getMeta('profile-a'))?.sync.sections?.vod).toMatchObject({
      coverage: 'partial',
      wholeSectionFailureCount: 1,
      nextCategoryCursor: 1,
    })
    await expect(
      repository.readCategoryShard('profile-a', 'vod', 'vod-a', 0),
    ).resolves.toMatchObject({
      coverage: 'complete',
      items: [expect.objectContaining({ id: 'vod-a-slice' })],
    })
  })

  it('does not publish partial streamed data from a truncated section response', async () => {
    let now = 1_000
    const repository = createRepository(() => now)
    const provider = new FixtureCatalogProvider()
    const coordinator = new CatalogSyncCoordinator(provider, repository, { now: () => now })

    const first = await coordinator.sync('profile-a')
    now = requiredNextDueAt(first)
    provider.partialFailures.add('live')

    const result = await coordinator.sync('profile-a')

    expect(result).toMatchObject({ status: 'failed', requestCount: 6 })
    expect(
      await repository.readCategoryShard('profile-a', 'live', 'live-a', 0),
    ).toMatchObject({
      coverage: 'complete',
      items: [expect.objectContaining({ id: 'live-a-1' })],
    })
    expect((await repository.getMeta('profile-a'))?.sync.sections?.live).toMatchObject({
      coverage: 'complete',
      wholeSectionFailureCount: 1,
    })
  })

  it('keeps every scheduled run at the six-request ceiling across a week of failures', async () => {
    let now = 1_000
    const repository = createRepository(() => now)
    const provider = new FixtureCatalogProvider()
    provider.failScans.add('live')
    provider.failScans.add('vod')
    provider.failScans.add('series')
    const coordinator = new CatalogSyncCoordinator(provider, repository, { now: () => now })

    for (let day = 0; day < 7; day += 1) {
      provider.calls.length = 0
      const result = await coordinator.sync('profile-a')

      expect(result).toMatchObject({ status: 'failed', requestCount: 6 })
      expect(provider.calls).toHaveLength(6)
      expect(provider.maxInFlight).toBe(1)
      now = Math.max(requiredNextDueAt(result), now + 24 * 60 * 60 * 1000)
    }
  })
})

class FixtureCatalogProvider implements CatalogSyncProvider {
  readonly calls: string[] = []
  readonly scanOptions: StreamScanOptions[] = []
  readonly failScans = new Set<string>()
  readonly partialFailures = new Set<string>()
  readonly refuseCategories = new Set<string>()
  partialBatchCount = 1
  maxInFlight = 0
  private inFlight = 0

  async backgroundCategories(
    section: LibrarySection,
    _signal?: AbortSignal,
    _timeoutMs?: number,
  ): Promise<Category[]> {
    return this.run(`categories:${section}`, async () => {
      if (this.refuseCategories.has(section)) {
        throw new ProviderError('forbidden', 'Fixture refusal.', false, { status: 403 })
      }

      return categories(section)
    })
  }

  async backgroundScanSection(
    section: LibrarySection,
    options: StreamScanOptions = {},
  ): Promise<void> {
    const key = options.categoryId ? `${section}:${options.categoryId}` : section
    this.scanOptions.push(options)

    await this.run(`scan:${key}`, async () => {
      const values = options.categoryId
        ? [stream(`${options.categoryId}-slice`, section, options.categoryId)]
        : catalogStreams(section)

      if (this.partialFailures.has(key)) {
        await options.onMatches?.(
          Array.from({ length: this.partialBatchCount }, (_, index) =>
            stream(`partial-${section}-${index}`, section, `${section}-a`),
          ),
        )
        throw new ProviderError('invalid-response', 'Fixture response was truncated.', false)
      }

      if (this.failScans.has(key) || this.failScans.has(section)) {
        throw new ProviderError('server', 'Fixture server failure.', true)
      }

      await options.onMatches?.(values)
    })
  }

  private async run<T>(call: string, action: () => Promise<T> | T): Promise<T> {
    this.calls.push(call)
    this.inFlight += 1
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight)

    try {
      await Promise.resolve()
      return await action()
    } finally {
      this.inFlight -= 1
    }
  }
}

function fixtureUrl(action: string): string {
  const url = new URL('https://fixture.invalid/player_api.php')
  url.searchParams.set('username', fixtureProfile.username)
  url.searchParams.set('password', fixtureProfile.password)
  url.searchParams.set('action', action)
  return url.toString()
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200 })
}

function categories(section: LibrarySection): Category[] {
  return [
    { id: `${section}-a`, name: `${section} A` },
    { id: `${section}-b`, name: `${section} B` },
  ]
}

function catalogStreams(section: LibrarySection): StreamItem[] {
  return [
    stream(`${section}-a-1`, section, `${section}-a`),
    stream(`${section}-b-1`, section, `${section}-b`),
  ]
}

function stream(id: string, section: LibrarySection, categoryId: string): StreamItem {
  return {
    id,
    name: `Fixture ${id}`,
    section,
    categoryId,
    containerExtension: section === 'live' ? 'ts' : 'mp4',
    streamType: section,
  }
}

function createRepository(
  now?: () => number,
  databaseName = uniqueDatabaseName(),
): IndexedDbCatalogRepository {
  if (!databaseNames.includes(databaseName)) {
    databaseNames.push(databaseName)
  }

  const repository = new IndexedDbCatalogRepository({ databaseName, now })
  repositories.push(repository)
  return repository
}

function requiredNextDueAt(result: { nextDueAt?: number }): number {
  if (result.nextDueAt === undefined) {
    throw new Error('Expected a completed, failed, or cancelled catalog sync result.')
  }

  return result.nextDueAt
}

function uniqueDatabaseName(): string {
  return `nova-play-catalog-sync-test-${Date.now()}-${Math.random()}`
}