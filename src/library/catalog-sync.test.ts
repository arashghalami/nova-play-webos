import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { ProviderError } from '../provider-error'
import { performanceTrace } from '../performance-trace'
import { ProviderBroker } from '../provider-broker'
import { FixtureProviderTransport } from '../provider-transport'
import type {
  Category,
  LibrarySection,
  NowNext,
  StreamItem,
  VodDetails,
  XtreamProfile,
} from '../types'
import type { SectionScanResult, StreamScanOptions } from '../xtream-client'
import {
  CatalogSyncCoordinator,
  VOD_SYNC_MEASUREMENT_MAX_RESPONSE_BYTES,
  type CatalogSyncProvider,
} from './catalog-sync'
import {
  IndexedDbCatalogRepository,
  deleteLibraryDatabase,
  type SnapshotPublishStage,
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

    const progress: Array<{
      stage: string
      section?: LibrarySection
      itemsAcquired?: number
    }> = []
    const result = await new CatalogSyncCoordinator(broker, repository, {
      onProgress: (event) => progress.push(event),
    }).sync(fixtureProfile.id)

    expect(progress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: 'starting' }),
        expect.objectContaining({ stage: 'categories', section: 'live' }),
        expect.objectContaining({ stage: 'scanning', section: 'vod' }),
        expect.objectContaining({
          stage: 'section-complete',
          section: 'series',
          itemsAcquired: 1,
        }),
        expect.objectContaining({ stage: 'finishing' }),
      ]),
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

  it('evicts only rebuildable cache records before provider sync when storage headroom is low', async () => {
    const repository = createRepository()
    const provider = new FixtureCatalogProvider()
    let estimateCallCount = 0

    vi.stubGlobal('navigator', {
      storage: {
        estimate: vi.fn(async () => {
          estimateCallCount += 1
          const mib = 1024 * 1024
          return estimateCallCount === 1
            ? { usage: 390 * mib, quota: 400 * mib }
            : { usage: 100 * mib, quota: 400 * mib }
        }),
      },
    })

    await repository.putSectionManifest('profile-a', 'live', [
      { id: 'live-a', name: 'Live A' },
    ])
    await repository.replaceCategorySnapshot({
      profileId: 'profile-a',
      section: 'live',
      category: { id: 'live-a', name: 'Live A' },
      items: [stream('live-existing', 'live', 'live-a')],
    })
    await repository.putDetails<VodDetails>(
      'profile-a',
      'vod',
      'vod-details',
      { id: 'vod-details', metadata: {} },
      60_000,
    )
    await repository.putEpg<NowNext>(
      'profile-a',
      'live-existing',
      'now-next',
      {
        now: {
          title: 'Current',
          start: new Date(0),
          end: new Date(1),
        },
      },
      60_000,
    )

    const result = await new CatalogSyncCoordinator(provider, repository).sync('profile-a')

    expect(result).toMatchObject({
      status: 'completed',
      requestCount: 6,
      storage: {
        state: 'ready',
        before: { allowed: false, source: 'navigator' },
        after: { allowed: true, source: 'navigator' },
        eviction: {
          epgRecordsDeleted: 1,
          detailRecordsDeleted: 1,
        },
      },
    })
    await expect(repository.getDetails('profile-a', 'vod', 'vod-details')).resolves.toBeNull()
    await expect(repository.getEpg('profile-a', 'live-existing', 'now-next')).resolves.toBeNull()
    await expect(repository.readCompleteCategory('profile-a', 'live', 'live-a')).resolves.toMatchObject({
      coverage: 'complete',
      items: [expect.objectContaining({ id: 'live-a-1' })],
    })
    expect(provider.calls).toHaveLength(6)
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
    const originalOpen = repository.openPartialSectionPublication.bind(repository)
    const appendSpy = vi
      .spyOn(repository, 'openPartialSectionPublication')
      .mockImplementation(async (profileId, section, runId) => {
        const publication = await originalOpen(profileId, section, runId)

        if (section !== 'live') {
          return publication
        }

        return Object.assign(Object.create(Object.getPrototypeOf(publication)), publication, {
          appendCategoryItems: async (
            _input: unknown,
            options?: { onPublishStage?: (stage: SnapshotPublishStage) => void },
          ) => {
            options?.onPublishStage?.('manifest-put')
            const error = new ReferenceError(
              'structuredClone is not defined at https://fixture-user:fixture-password@private.invalid/',
            )
            error.stack =
              'ReferenceError: structuredClone is not defined\\n' +
              '    at publish (app.js:101:22)\\n' +
              '    at coordinator (app.js:99:4)'
            throw error
          },
        })
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

  it('leaves an interrupted first section scan non-authoritative and resumes the first incomplete category', async () => {
    let now = 1_000
    const repository = createRepository(() => now)
    const provider = new FixtureCatalogProvider()
    provider.partialBatchCount = 128
    provider.partialFailures.add('vod')
    const coordinator = new CatalogSyncCoordinator(provider, repository, { now: () => now })

    const failed = await coordinator.sync('profile-a')

    expect(failed).toMatchObject({ status: 'failed', requestCount: 6 })
    /*
     * Streamed shards stay durable in the snapshots store, but the manifest is
     * written only at the closed-array commit, so an interrupted run publishes
     * no category pointer at all.
     */
    expect((await repository.getManifest('profile-a', 'vod'))?.coverage).toMatchObject({
      state: 'none',
      completeCategoryCount: 0,
      itemCount: 0,
    })
    expect((await repository.getMeta('profile-a'))?.sync.sections?.vod).toMatchObject({
      coverage: 'none',
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

  it('persists per-section failure detail that survives later sections succeeding', async () => {
    let now = 1_000
    const repository = createRepository(() => now)
    const provider = new FixtureCatalogProvider()
    // VOD fails; live and series (which run after in the plan order) succeed.
    provider.failScans.add('vod')
    const coordinator = new CatalogSyncCoordinator(provider, repository, { now: () => now })

    const result = await coordinator.sync('profile-a')

    expect(result).toMatchObject({ status: 'failed' })
    const meta = await repository.getMeta('profile-a')
    // The single global breadcrumb would be overwritten by the later successes;
    // the per-section detail must still name VOD's failure.
    const vod = meta?.sync.sections?.vod
    expect(vod?.wholeSectionFailureCount).toBe(1)
    expect(vod?.lastFailureDetail).toMatchObject({
      failureStage: 'provider-scan',
      failureKind: 'provider:server',
    })
    expect(typeof vod?.lastFailureDetail?.updatedAt).toBe('number')
    // Sections that succeeded carry no failure detail.
    expect(meta?.sync.sections?.live?.lastFailureDetail).toBeUndefined()
    expect(meta?.sync.sections?.series?.lastFailureDetail).toBeUndefined()
  })

  it('gives VOD a larger scan deadline than the smaller sections', async () => {
    const repository = createRepository()
    const provider = new FixtureCatalogProvider()
    const coordinator = new CatalogSyncCoordinator(provider, repository)

    await coordinator.sync('profile-a')

    const timeoutFor = (section: LibrarySection): number | undefined => {
      const opts = provider.scanOptions.find(
        (o) => !o.categoryId && provider.scanSections.get(o) === section,
      )
      return opts?.timeoutMs
    }
    // VOD's deadline must exceed Live's, so the largest response is not starved.
    const vodTimeout = timeoutFor('vod')
    const liveTimeout = timeoutFor('live')
    expect(vodTimeout).toBeGreaterThan(liveTimeout ?? 0)
    expect(liveTimeout).toBe(120_000)
    expect(vodTimeout).toBe(420_000)
  })

  it('preserves an authoritative complete section when a refresh scan yields zero identifiable records', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    let now = 1_000
    const repository = createRepository(() => now)
    const provider = new FixtureCatalogProvider()
    const coordinator = new CatalogSyncCoordinator(provider, repository, { now: () => now })

    const first = await coordinator.sync('profile-a')
    expect(first).toMatchObject({ status: 'completed' })
    const beforeManifest = await repository.getManifest('profile-a', 'live')
    expect(beforeManifest?.coverage).toMatchObject({ state: 'complete', itemCount: 2 })

    now = requiredNextDueAt(first)
    provider.emptyScans.add('live')
    performanceTrace.enable()
    performanceTrace.clear()

    const refreshed = await coordinator.sync('profile-a')

    expect(refreshed).toMatchObject({ status: 'failed', requestCount: 6 })
    // The previous generation's items are untouched: no zero-item swap occurred.
    const afterManifest = await repository.getManifest('profile-a', 'live')
    expect(afterManifest?.coverage).toMatchObject({ state: 'complete', itemCount: 2 })
    await expect(
      repository.readCategoryShard('profile-a', 'live', 'live-a', 0),
    ).resolves.toMatchObject({
      coverage: 'complete',
      items: [expect.objectContaining({ id: 'live-a-1' })],
    })
    expect((await repository.getMeta('profile-a'))?.sync.sections?.live).toMatchObject({
      coverage: 'complete',
      wholeSectionFailureCount: 1,
    })
    expect(
      performanceTrace
        .snapshot()
        .events.find((candidate) => candidate.name === 'catalog-sync-section-failed'),
    ).toMatchObject({
      category: 'library',
      data: { section: 'live', failureStage: 'empty-validation' },
    })
  })

  it('preserves an authoritative section when an all-unidentifiable Series response closes empty', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    let now = 1_000
    const repository = createRepository(() => now)
    const provider = new FixtureCatalogProvider()
    const coordinator = new CatalogSyncCoordinator(provider, repository, { now: () => now })

    const first = await coordinator.sync('profile-a')
    expect(first).toMatchObject({ status: 'completed' })
    const beforeManifest = await repository.getManifest('profile-a', 'series')
    expect(beforeManifest?.coverage).toMatchObject({ state: 'complete', itemCount: 2 })

    now = requiredNextDueAt(first)
    provider.emptyScans.add('series')

    const refreshed = await coordinator.sync('profile-a')

    expect(refreshed).toMatchObject({ status: 'failed' })
    const afterManifest = await repository.getManifest('profile-a', 'series')
    expect(afterManifest?.coverage).toMatchObject({ state: 'complete', itemCount: 2 })
    await expect(
      repository.readCategoryShard('profile-a', 'series', 'series-a', 0),
    ).resolves.toMatchObject({
      coverage: 'complete',
      items: [expect.objectContaining({ id: 'series-a-1' })],
    })
  })

  it('permits a genuinely empty first acquisition to publish a complete empty section', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    const repository = createRepository()
    const provider = new FixtureCatalogProvider()
    provider.emptyScans.add('live')
    const coordinator = new CatalogSyncCoordinator(provider, repository)

    const result = await coordinator.sync('profile-a')

    // Live has no prior items, so the empty close is a valid first result.
    expect(result).toMatchObject({ status: 'completed' })
    expect((await repository.getManifest('profile-a', 'live'))?.coverage).toMatchObject({
      state: 'complete',
      itemCount: 0,
    })
    expect((await repository.getMeta('profile-a'))?.sync.sections?.live).toMatchObject({
      coverage: 'complete',
      wholeSectionFailureCount: 0,
    })
  })

  it('refuses a first acquisition whose records all lack identifiers', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    const repository = createRepository()
    const provider = new FixtureCatalogProvider()
    provider.unidentifiableScans.add('live')
    provider.unidentifiableRawCount = 12
    performanceTrace.enable()
    performanceTrace.clear()

    const result = await coordinatorSync(provider, repository)

    expect(result).toMatchObject({ status: 'failed' })
    // No prior items, but raw records arrived and none were identifiable, so the
    // section must not publish an empty complete generation.
    expect((await repository.getManifest('profile-a', 'live'))?.coverage).toMatchObject({
      state: 'none',
      itemCount: 0,
    })
    expect(
      performanceTrace
        .snapshot()
        .events.find((candidate) => candidate.name === 'catalog-sync-section-failed'),
    ).toMatchObject({
      category: 'library',
      data: { section: 'live', failureStage: 'empty-validation' },
    })
  })

  it('preserves a populated section when a refresh collapses to a few records', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    let now = 1_000
    const repository = createRepository(() => now)
    const provider = new FixtureCatalogProvider()
    // 40 items per section so a 2-record close is below the 10% retain ratio.
    provider.wholeSectionItemCount = 40
    const coordinator = new CatalogSyncCoordinator(provider, repository, { now: () => now })

    const first = await coordinator.sync('profile-a')
    expect(first).toMatchObject({ status: 'completed' })
    expect((await repository.getManifest('profile-a', 'live'))?.coverage).toMatchObject({
      state: 'complete',
      itemCount: 40,
    })

    now = requiredNextDueAt(first)
    provider.wholeSectionItemCount = 2

    const refreshed = await coordinator.sync('profile-a')

    expect(refreshed).toMatchObject({ status: 'failed' })
    // The healthy 40-item generation is retained; the 2-record collapse is refused.
    expect((await repository.getManifest('profile-a', 'live'))?.coverage).toMatchObject({
      state: 'complete',
      itemCount: 40,
    })
  })

  it('marks the scan boundary as scanning with a zero count before the first checkpoint', async () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('localStorage', storage)
    const repository = createRepository()
    const provider = new FixtureCatalogProvider()
    const stages: Array<{ stage: string; section: string | null; itemCount: number }> = []
    const originalScan = provider.backgroundScanSection.bind(provider)
    vi.spyOn(provider, 'backgroundScanSection').mockImplementation(async (section, options) => {
      const raw = storage.getItem('nova-play.sync-breadcrumb')

      if (raw) {
        const value = JSON.parse(raw) as { stage: string; section: string | null; itemCount: number }
        stages.push({ stage: value.stage, section: value.section, itemCount: value.itemCount })
      }

      return originalScan(section, options)
    })

    const result = await coordinatorSync(provider, repository)

    expect(result).toMatchObject({ status: 'completed' })
    // Every section scan is entered with the boundary already recorded at 0.
    expect(stages).toEqual([
      { stage: 'scanning', section: 'live', itemCount: 0 },
      { stage: 'scanning', section: 'vod', itemCount: 0 },
      { stage: 'scanning', section: 'series', itemCount: 0 },
    ])
  })

  it('leaves a finished breadcrumb after an ordinary section failure', async () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('localStorage', storage)
    const repository = createRepository()
    const provider = new FixtureCatalogProvider()
    provider.failScans.add('vod')

    const result = await coordinatorSync(provider, repository)

    expect(result).toMatchObject({ status: 'failed' })
    const raw = storage.getItem('nova-play.sync-breadcrumb')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string)).toMatchObject({ stage: 'finished' })
  })

  it('clears the breadcrumb when a run is cancelled', async () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('localStorage', storage)
    const repository = createRepository()
    const provider = new FixtureCatalogProvider()
    const coordinator = new CatalogSyncCoordinator(provider, repository)
    const originalScan = provider.backgroundScanSection.bind(provider)
    vi.spyOn(provider, 'backgroundScanSection').mockImplementation(async (section, options) => {
      coordinator.cancel()
      return originalScan(section, options)
    })

    const result = await coordinator.sync('profile-a')

    expect(result.status).toBe('cancelled')
    expect(storage.getItem('nova-play.sync-breadcrumb')).toBeNull()
  })

  /*
   * Publication used to branch on coverage: an incomplete section published in
   * bounded chunks while an already complete one accumulated the whole section in
   * memory and published it in one go. That left the largest sections on the path
   * that never once completed on the physical target. Both now use the chunked
   * path, and nothing may reintroduce the accumulating one.
   */
  it('refreshes an already complete section through chunked incremental publication', async () => {
    let now = 1_000
    const repository = createRepository(() => now)
    const provider = new FixtureCatalogProvider()
    const coordinator = new CatalogSyncCoordinator(provider, repository, { now: () => now })

    const first = await coordinator.sync('profile-a')
    expect(first).toMatchObject({ status: 'completed' })
    expect((await repository.getMeta('profile-a'))?.sync.sections?.live?.coverage).toBe(
      'complete',
    )

    const openSpy = vi.spyOn(repository, 'openPartialSectionPublication')
    const wholeSectionSpy = vi.spyOn(repository, 'replaceSectionSnapshots')
    now = requiredNextDueAt(first)

    try {
      const refreshed = await coordinator.sync('profile-a')

      expect(refreshed).toMatchObject({ status: 'completed', requestCount: 6 })
      // One publication per section, none through the accumulating path.
      expect(openSpy.mock.calls.map((call) => call[1]).sort()).toEqual([
        'live',
        'series',
        'vod',
      ])
      expect(wholeSectionSpy).not.toHaveBeenCalled()
      await expect(
        repository.readCategoryShard('profile-a', 'live', 'live-a', 0),
      ).resolves.toMatchObject({ coverage: 'complete' })
    } finally {
      openSpy.mockRestore()
      wholeSectionSpy.mockRestore()
    }
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
  readonly scanSections = new Map<StreamScanOptions, LibrarySection>()
  readonly failScans = new Set<string>()
  readonly partialFailures = new Set<string>()
  readonly emptyScans = new Set<string>()
  readonly unidentifiableScans = new Set<string>()
  unidentifiableRawCount = 4
  /** When set, a whole-section scan emits this many identifiable items. */
  wholeSectionItemCount: number | null = null
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
  ): Promise<SectionScanResult> {
    const key = options.categoryId ? `${section}:${options.categoryId}` : section
    this.scanOptions.push(options)
    this.scanSections.set(options, section)

    return this.run(`scan:${key}`, async () => {
      const values = options.categoryId
        ? [stream(`${options.categoryId}-slice`, section, options.categoryId)]
        : this.wholeSectionItemCount !== null
          ? Array.from({ length: this.wholeSectionItemCount }, (_, index) =>
              stream(`${section}-${index}`, section, `${section}-${index % 2 === 0 ? 'a' : 'b'}`),
            )
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

      /*
       * A cleanly closed response that never yields an identifiable record. The
       * transport succeeds; the scan simply emits nothing.
       */
      if (this.emptyScans.has(key) || this.emptyScans.has(section)) {
        return scanResult(0, 0)
      }

      /*
       * A cleanly closed response whose records all failed identity: raw records
       * arrived but none were accepted, so onMatches is never invoked.
       */
      if (this.unidentifiableScans.has(key) || this.unidentifiableScans.has(section)) {
        const raw = this.unidentifiableRawCount
        options.onScanStatistics?.(scanResult(raw, 0))
        return scanResult(raw, 0)
      }

      await options.onMatches?.(values)
      const accepted = values.length
      options.onScanStatistics?.(scanResult(accepted, accepted))
      return scanResult(accepted, accepted)
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

function coordinatorSync(
  provider: CatalogSyncProvider,
  repository: IndexedDbCatalogRepository,
): ReturnType<CatalogSyncCoordinator['sync']> {
  return new CatalogSyncCoordinator(provider, repository).sync('profile-a')
}

function scanResult(raw: number, accepted: number): SectionScanResult {
  return {
    rawItemCount: raw,
    parsedItemCount: raw,
    acceptedItemCount: accepted,
    missingIdentifierCount: Math.max(0, raw - accepted),
    bytesReceived: raw * 64,
    arrayClosed: true,
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