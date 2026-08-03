import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { favoriteKey, toStoredStream } from '../storage'
import { matchesQuery, queryTokens } from '../search'
import { ProviderBroker } from '../provider-broker'
import { FixtureProviderTransport } from '../provider-transport'
import type { StreamItem, VodDetails, XtreamProfile } from '../types'
import type { LibrarySyncState, LibraryMetaRecord } from './catalog-repository'
import { CatalogSyncCoordinator } from './catalog-sync'
import {
  IndexedDbCatalogRepository,
  LIBRARY_STORE_NAMES,
  LibraryWriteAbortedError,
  MAX_SNAPSHOT_BYTES,
  MAX_SNAPSHOT_ITEMS,
  buildCategorySnapshotShards,
  deleteLibraryDatabase,
  openLibraryDatabase,
  clearLibraryMemoryCaches,
  setLibraryPlaybackStarting,
} from './catalog-repository'

const databaseNames: string[] = []
const repositories: IndexedDbCatalogRepository[] = []
const productionScaleProfile: XtreamProfile = {
  id: 'production-scale-profile',
  name: 'Production-scale fixture',
  serverUrl: 'https://fixture.invalid',
  username: 'fixture-user',
  password: 'fixture-password',
}

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

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  setLibraryPlaybackStarting(false)
})

afterEach(async () => {
  repositories.splice(0).forEach((repository) => repository.close())
  await Promise.all(databaseNames.splice(0).map(deleteLibraryDatabase))
  setLibraryPlaybackStarting(false)
  vi.unstubAllGlobals()
})

describe('flat catalog repository', () => {
  it('creates exactly the six Phase 1A stores with the required key paths', async () => {
    const repository = createRepository()
    const stores = await repository.initialize()

    expect(stores).toEqual([...LIBRARY_STORE_NAMES].sort())

    const database = await openLibraryDatabase(databaseNames[0])
    const transaction = database.transaction([...LIBRARY_STORE_NAMES], 'readonly')

    expect(transaction.objectStore('meta').keyPath).toBe('profileId')
    expect(transaction.objectStore('manifests').keyPath).toEqual(['profileId', 'section'])
    expect(transaction.objectStore('snapshots').keyPath).toEqual([
      'profileId',
      'section',
      'categoryKey',
      'shardIndex',
    ])
    expect(transaction.objectStore('searchShards').keyPath).toEqual([
      'profileId',
      'shardIndex',
    ])
    expect(transaction.objectStore('details').keyPath).toEqual([
      'profileId',
      'kind',
      'id',
    ])
    expect(transaction.objectStore('epg').keyPath).toEqual([
      'profileId',
      'streamId',
    ])
    database.close()
  })

  it('isolates snapshot shards and metadata by profile', async () => {
    const repository = createRepository()
    const category = { id: 'news', name: 'News' }

    await repository.putSectionManifest('profile-a', 'live', [category])
    await repository.putSectionManifest('profile-b', 'live', [category])
    await repository.replaceCategorySnapshot({
      profileId: 'profile-a',
      section: 'live',
      category,
      items: [stream('a-1', 'Alpha News', 'live', category.id)],
    })
    await repository.replaceCategorySnapshot({
      profileId: 'profile-b',
      section: 'live',
      category,
      items: [stream('b-1', 'Beta News', 'live', category.id)],
    })

    const profileA = await repository.readCategoryShard(
      'profile-a',
      'live',
      category.id,
      0,
    )
    const profileB = await repository.readCategoryShard(
      'profile-b',
      'live',
      category.id,
      0,
    )

    expect(profileA.coverage).toBe('complete')
    expect(profileB.coverage).toBe('complete')

    if (profileA.coverage === 'complete' && profileB.coverage === 'complete') {
      expect(profileA.items.map((item) => item.id)).toEqual(['a-1'])
      expect(profileB.items.map((item) => item.id)).toEqual(['b-1'])
    }

    await repository.putMeta('profile-a', {
      nextDueAt: 111,
      searchCoverage: 'none',
      searchShardCount: 0,
      sync: { inProgress: false },
    })
    await repository.putMeta('profile-b', {
      nextDueAt: 222,
      searchCoverage: 'none',
      searchShardCount: 0,
      sync: { inProgress: false },
    })

    expect((await repository.getMeta('profile-a'))?.nextDueAt).toBe(111)
    expect((await repository.getMeta('profile-b'))?.nextDueAt).toBe(222)
  })

  it('keeps parser-confirmed category snapshots durable but unavailable until a closed section is promoted', async () => {
    const repository = createRepository()
    const categories = [
      { id: 'vod-a', name: 'VOD A' },
      { id: 'vod-b', name: 'VOD B' },
    ]

    await repository.putSectionManifest('profile-a', 'vod', categories)
    await repository.preparePartialSectionSnapshotRun('profile-a', 'vod')
    await repository.appendPartialCategorySnapshot({
      profileId: 'profile-a',
      section: 'vod',
      category: categories[0],
      items: [stream('vod-a-1', 'VOD A One', 'vod', categories[0].id)],
    })

    expect((await repository.getManifest('profile-a', 'vod'))?.coverage).toMatchObject({
      state: 'partial',
      completeCategoryCount: 0,
      itemCount: 1,
    })
    await expect(
      repository.readCategoryShard('profile-a', 'vod', categories[0].id, 0),
    ).resolves.toMatchObject({
      coverage: 'none',
      reason: 'category-unavailable',
    })

    await repository.appendPartialCategorySnapshot({
      profileId: 'profile-a',
      section: 'vod',
      category: categories[1],
      items: [stream('vod-b-1', 'VOD B One', 'vod', categories[1].id)],
    })
    await repository.promotePartialSectionSnapshots('profile-a', 'vod')

    expect((await repository.getManifest('profile-a', 'vod'))?.coverage).toMatchObject({
      state: 'complete',
      completeCategoryCount: 2,
      itemCount: 2,
    })
    await expect(
      repository.readCategoryShard('profile-a', 'vod', categories[0].id, 0),
    ).resolves.toMatchObject({
      coverage: 'complete',
      items: [expect.objectContaining({ id: 'vod-a-1' })],
    })
    await expect(
      repository.readCategoryShard('profile-a', 'vod', categories[1].id, 0),
    ).resolves.toMatchObject({
      coverage: 'complete',
      items: [expect.objectContaining({ id: 'vod-b-1' })],
    })
  })

  it('serves only a complete section through bounded local category and search reads', async () => {
    const repository = createRepository()
    const categories = [
      { id: 'live-a', name: 'Live A' },
      { id: 'live-b', name: 'Live B' },
    ]

    await repository.putSectionManifest('profile-a', 'live', categories)
    await repository.replaceCategorySnapshot({
      profileId: 'profile-a',
      section: 'live',
      category: categories[0],
      items: [stream('live-a-1', 'Morning News', 'live', categories[0].id)],
    })
    await repository.replaceCategorySnapshot({
      profileId: 'profile-a',
      section: 'live',
      category: categories[1],
      items: [stream('live-b-1', 'Evening News', 'live', categories[1].id)],
    })

    await expect(
      repository.readCompleteSectionCategories('profile-a', 'live'),
    ).resolves.toEqual({ coverage: 'complete', categories })
    await expect(
      repository.readCompleteCategory('profile-a', 'live', categories[0].id),
    ).resolves.toMatchObject({
      coverage: 'complete',
      items: [expect.objectContaining({ id: 'live-a-1' })],
    })
    await expect(
      repository.searchCompleteSection('profile-a', 'live', 'news', 10),
    ).resolves.toMatchObject({
      coverage: 'complete',
      limited: false,
      matches: [
        expect.objectContaining({ id: 'live-a-1' }),
        expect.objectContaining({ id: 'live-b-1' }),
      ],
    })

    await repository.putSectionManifest('profile-a', 'live', [
      ...categories,
      { id: 'live-c', name: 'Live C' },
    ])

    await expect(
      repository.readCompleteSectionCategories('profile-a', 'live'),
    ).resolves.toEqual({
      coverage: 'none',
      categories: [],
      reason: 'section-incomplete',
    })
  })

  it('keeps legacy sanitized URL-like titles readable in complete local shards', async () => {
    const repository = createRepository()
    const category = { id: 'legacy-live', name: 'Legacy Live' }

    await repository.putSectionManifest('profile-a', 'live', [category])
    await repository.replaceCategorySnapshot({
      profileId: 'profile-a',
      section: 'live',
      category,
      items: [stream('legacy-title', 'Original title', 'live', category.id)],
    })

    const record = await readStoreRecord(
      databaseNames[0],
      'snapshots',
      ['profile-a', 'live', category.id, 0],
    ) as { payload: string; byteEstimate: number }
    const payload = JSON.parse(record.payload) as Array<Record<string, unknown>>
    delete payload[0].name
    delete payload[0].searchName
    const serialized = JSON.stringify(payload)

    await overwriteSnapshotRecord(databaseNames[0], {
      ...record,
      payload: serialized,
      byteEstimate: serialized.length,
    })
    clearLibraryMemoryCaches()

    await expect(
      repository.readCompleteCategory('profile-a', 'live', category.id),
    ).resolves.toMatchObject({
      coverage: 'complete',
      items: [expect.objectContaining({ id: 'legacy-title', name: 'Untitled' })],
    })
    await expect(
      repository.searchCompleteSection('profile-a', 'live', 'untitled', 10),
    ).resolves.toMatchObject({
      coverage: 'complete',
      matches: [expect.objectContaining({ id: 'legacy-title', name: 'Untitled' })],
    })
  })

  it('round-trips a category larger than 6,000 items through bounded shards', async () => {
    const repository = createRepository()
    const category = { id: 'all-live', name: 'All Live' }
    const items = Array.from({ length: 6_001 }, (_, index) =>
      stream(
        `live-${index}`,
        `Live channel ${index} ${'x'.repeat(70)}`,
        'live',
        category.id,
      ),
    )
    const builtShards = buildCategorySnapshotShards(items)

    expect(builtShards.length).toBeGreaterThan(4)
    expect(
      builtShards.every(
        (shard) =>
          shard.itemCount <= MAX_SNAPSHOT_ITEMS &&
          shard.byteEstimate <= MAX_SNAPSHOT_BYTES,
      ),
    ).toBe(true)

    await repository.putSectionManifest('profile-a', 'live', [category])
    const entry = await repository.replaceCategorySnapshot({
      profileId: 'profile-a',
      section: 'live',
      category,
      items,
    })

    expect(entry.shardCount).toBe(builtShards.length)
    expect(entry.itemCount).toBe(items.length)

    const restored: StreamItem[] = []

    for (let shardIndex = 0; shardIndex < entry.shardCount; shardIndex += 1) {
      const result = await repository.readCategoryShard(
        'profile-a',
        'live',
        category.id,
        shardIndex,
      )
      expect(result.coverage).toBe('complete')

      if (result.coverage === 'complete') {
        expect(result.itemCount).toBeLessThanOrEqual(MAX_SNAPSHOT_ITEMS)
        expect(result.byteEstimate).toBeLessThanOrEqual(MAX_SNAPSHOT_BYTES)
        restored.push(...result.items)
      }
    }

    expect(restored.map((item) => item.id)).toEqual(items.map((item) => item.id))
  })

  it('degrades complete manifest coverage to none when a snapshot shard was evicted', async () => {
    const repository = createRepository()
    const category = { id: 'movies', name: 'Movies' }

    await repository.putSectionManifest('profile-a', 'vod', [category])
    await repository.replaceCategorySnapshot({
      profileId: 'profile-a',
      section: 'vod',
      category,
      items: [stream('movie-1', 'Movie One', 'vod', category.id)],
    })
    await deleteStoreRecord(
      databaseNames[0],
      'snapshots',
      ['profile-a', 'vod', category.id, 0],
    )

    await expect(
      repository.readCategoryShard('profile-a', 'vod', category.id, 0),
    ).resolves.toEqual({
      coverage: 'none',
      items: [],
      reason: 'snapshot-missing',
    })
  })

  it('expires details and EPG records using the injectable clock', async () => {
    let now = 1_000
    const repository = createRepository(() => now)
    const details: VodDetails = {
      id: 'movie-1',
      metadata: { plot: 'Fixture plot' },
    }
    const epg = {
      now: {
        title: 'Current programme',
        start: new Date(0),
        end: new Date(1_000),
      },
    }

    await repository.putDetails('profile-a', 'vod', details.id, details, 50)
    await repository.putEpg('profile-a', 'stream-1', epg, 50)

    expect(await repository.getDetails('profile-a', 'vod', details.id)).toEqual(
      details,
    )
    expect(await repository.getEpg('profile-a', 'stream-1')).toEqual(epg)

    now = 1_051

    expect(await repository.getDetails('profile-a', 'vod', details.id)).toBeNull()
    expect(await repository.getEpg('profile-a', 'stream-1')).toBeNull()
  })

  it('builds compact search shards and matches the direct shared matcher', async () => {
    const repository = createRepository()
    const items = Array.from({ length: 5_011 }, (_, index) =>
      stream(
        `item-${index}`,
        index % 997 === 0 ? `Pokémon News ${index}` : `Ordinary title ${index}`,
        index % 2 === 0 ? 'live' : 'vod',
        `category-${index % 7}`,
      ),
    )

    const shardCount = await repository.replaceSearchShards('profile-a', items)
    expect(shardCount).toBe(2)

    const query = 'pokemon news'
    const expectedKeys = items
      .map(toStoredStream)
      .filter((item) => matchesQuery(item.searchName ?? '', queryTokens(query)))
      .map(favoriteKey)
    const result = await repository.search('profile-a', query)

    expect(result.coverage).toBe('complete')

    if (result.coverage === 'complete') {
      expect(result.matches.map((tuple) => tuple[0])).toEqual(expectedKeys)
      expect(result.matches.every((tuple) => Array.isArray(tuple))).toBe(true)
    }
  })

  it('returns unavailable-cache results instead of throwing when IndexedDB is absent', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const repository = new IndexedDbCatalogRepository({
      databaseName: uniqueDatabaseName(),
    })

    await expect(repository.getManifest('profile-a', 'live')).resolves.toBeNull()
    await expect(
      repository.readCategoryShard('profile-a', 'live', 'news', 0),
    ).resolves.toEqual({
      coverage: 'none',
      items: [],
      reason: 'database-unavailable',
    })
    await expect(repository.search('profile-a', 'news')).resolves.toEqual({
      coverage: 'none',
      matches: [],
      reason: 'database-unavailable',
    })
  })

  it('aborts the write loop on playback startup and leaves the category unavailable', async () => {
    const repository = createRepository()
    const category = { id: 'large', name: 'Large' }
    const items = Array.from({ length: 1_501 }, (_, index) =>
      stream(`item-${index}`, `Item ${index}`, 'live', category.id),
    )
    let puts = 0

    await repository.putSectionManifest('profile-a', 'live', [category])

    await expect(
      repository.replaceCategorySnapshot(
        {
          profileId: 'profile-a',
          section: 'live',
          category,
          items,
        },
        {
          onSnapshotPut: () => {
            puts += 1
            setLibraryPlaybackStarting(true)
          },
        },
      ),
    ).rejects.toBeInstanceOf(LibraryWriteAbortedError)

    expect(puts).toBe(1)
    setLibraryPlaybackStarting(false)
    await expect(
      repository.readCategoryShard('profile-a', 'live', category.id, 0),
    ).resolves.toEqual({
      coverage: 'none',
      items: [],
      reason: 'category-unavailable',
    })
  })

  it('persists a sync-state read-modify-write in the same transaction callback', async () => {
    const repository = createRepository()

    await expect(repository.tryBeginSync('profile-a', 'run-one', 60_000)).resolves.toBe(true)

    await expect(
      repository.updateSyncState('profile-a', 'run-one', (state) => ({
        ...state,
        failureCount: 3,
        sections: {
          ...state.sections,
          vod: {
            coverage: 'partial',
            wholeSectionFailureCount: 1,
            nextCategoryCursor: 0,
            lastAttemptAt: 1_000,
            lastFailureAt: 1_001,
          },
        },
      })),
    ).resolves.toMatchObject({
      sync: {
        inProgress: true,
        runId: 'run-one',
        failureCount: 3,
        sections: {
          vod: {
            coverage: 'partial',
            wholeSectionFailureCount: 1,
            nextCategoryCursor: 0,
          },
        },
      },
    })

    await expect(repository.getMeta('profile-a')).resolves.toMatchObject({
      sync: {
        inProgress: true,
        runId: 'run-one',
        failureCount: 3,
        sections: {
          vod: {
            lastAttemptAt: 1_000,
            lastFailureAt: 1_001,
          },
        },
      },
    })
  })

  it('reproduces the post-publication auto-commit failure at production section scale, then completes with callback-contained metadata writes', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())

    const legacyDatabaseName = uniqueDatabaseName()
    const legacyRepository = createRepository(undefined, legacyDatabaseName)
    await legacyRepository.initialize()
    const restoreLegacyAutoCommitHarness = await installAutoCommitAfterGetHarness(
      legacyDatabaseName,
    )
    const currentUpdateSyncState = legacyRepository.updateSyncState.bind(legacyRepository)
    let updateCount = 0
    const legacyUpdateSpy = vi
      .spyOn(legacyRepository, 'updateSyncState')
      .mockImplementation((profileId, runId, update) => {
        updateCount += 1

        /*
         * The three manifest updates and Live section update succeed. The VOD
         * whole-section response has already been parsed and published when the
         * fifth state update reproduces the previous await-then-put implementation.
         */
        return updateCount === 5
          ? legacyAwaitThenPutSyncState(
              legacyDatabaseName,
              profileId,
              runId,
              update,
            )
          : currentUpdateSyncState(profileId, runId, update)
      })

    try {
      const legacyResult = await createProductionScaleCoordinator(legacyRepository).sync(
        productionScaleProfile.id,
      )

      expect(legacyResult).toMatchObject({ status: 'failed', requestCount: 6 })
      expect(legacyResult.sections).toContainEqual(
        expect.objectContaining({
          section: 'vod',
          mode: 'whole-section',
          success: false,
          reason: 'scan-failed',
        }),
      )

      const legacyManifest = await legacyRepository.getManifest(productionScaleProfile.id, 'vod')
      const legacyMeta = await legacyRepository.getMeta(productionScaleProfile.id)

      expect(legacyManifest?.coverage).toMatchObject({
        state: 'complete',
        categoryCount: PRODUCTION_SCALE_CATEGORY_COUNT,
        completeCategoryCount: PRODUCTION_SCALE_CATEGORY_COUNT,
        itemCount: PRODUCTION_SCALE_ITEM_COUNT,
      })
      expect(
        legacyManifest?.categories.reduce((total, category) => total + category.shardCount, 0),
      ).toBe(PRODUCTION_SCALE_CATEGORY_COUNT)
      expect(legacyMeta?.sync.sections?.vod).toMatchObject({
        coverage: 'complete',
        wholeSectionFailureCount: 1,
        nextCategoryCursor: 0,
      })
    } finally {
      legacyUpdateSpy.mockRestore()
      restoreLegacyAutoCommitHarness()
    }

    localStorage.clear()

    const correctedDatabaseName = uniqueDatabaseName()
    const correctedRepository = createRepository(undefined, correctedDatabaseName)
    await correctedRepository.initialize()
    const restoreCorrectedAutoCommitHarness = await installAutoCommitAfterGetHarness(
      correctedDatabaseName,
    )

    try {
      const correctedResult = await createProductionScaleCoordinator(correctedRepository).sync(
        productionScaleProfile.id,
      )

      expect(correctedResult).toMatchObject({ status: 'completed', requestCount: 6 })
      expect(
        correctedResult.sections.map((section) => ({
          section: section.section,
          mode: section.mode,
          success: section.success,
        })),
      ).toEqual([
        { section: 'live', mode: 'whole-section', success: true },
        { section: 'vod', mode: 'whole-section', success: true },
        { section: 'series', mode: 'whole-section', success: true },
      ])

      const correctedManifest = await correctedRepository.getManifest(
        productionScaleProfile.id,
        'vod',
      )
      const correctedMeta = await correctedRepository.getMeta(productionScaleProfile.id)

      expect(correctedManifest?.coverage).toMatchObject({
        state: 'complete',
        categoryCount: PRODUCTION_SCALE_CATEGORY_COUNT,
        completeCategoryCount: PRODUCTION_SCALE_CATEGORY_COUNT,
        itemCount: PRODUCTION_SCALE_ITEM_COUNT,
      })
      expect(
        correctedManifest?.categories.reduce((total, category) => total + category.shardCount, 0),
      ).toBe(PRODUCTION_SCALE_CATEGORY_COUNT)
      expect(correctedMeta?.sync.sections).toMatchObject({
        live: {
          coverage: 'complete',
          wholeSectionFailureCount: 0,
          nextCategoryCursor: 0,
          lastSuccessAt: expect.any(Number),
        },
        vod: {
          coverage: 'complete',
          wholeSectionFailureCount: 0,
          nextCategoryCursor: 0,
          lastSuccessAt: expect.any(Number),
        },
        series: {
          coverage: 'complete',
          wholeSectionFailureCount: 0,
          nextCategoryCursor: 0,
          lastSuccessAt: expect.any(Number),
        },
      })
    } finally {
      restoreCorrectedAutoCommitHarness()
    }
  })

  it('keeps existing category routing when a successful manifest omits a previously cached category', async () => {
    const repository = createRepository()
    const news = { id: 'news', name: 'News' }
    const sports = { id: 'sports', name: 'Sports' }

    await repository.putSectionManifest('profile-a', 'live', [news, sports])
    await repository.replaceCategorySnapshot({
      profileId: 'profile-a',
      section: 'live',
      category: sports,
      items: [stream('sports-1', 'Sports One', 'live', sports.id)],
    })
    await repository.putSectionManifest('profile-a', 'live', [news])

    await expect(repository.getManifest('profile-a', 'live')).resolves.toMatchObject({
      categories: expect.arrayContaining([
        expect.objectContaining({ categoryKey: news.id, name: news.name }),
        expect.objectContaining({ categoryKey: sports.id, coverage: 'complete' }),
      ]),
      coverage: expect.objectContaining({ state: 'partial' }),
    })
    await expect(
      repository.readCategoryShard('profile-a', 'live', sports.id, 0),
    ).resolves.toMatchObject({
      coverage: 'complete',
      items: [expect.objectContaining({ id: 'sports-1' })],
    })
  })

  it('keeps the published snapshot generation when a replacement is cancelled', async () => {
    const repository = createRepository()
    const category = { id: 'large', name: 'Large' }
    const existingItems = Array.from({ length: 1_501 }, (_, index) =>
      stream(`existing-${index}`, `Existing ${index}`, 'live', category.id),
    )
    const replacementItems = Array.from({ length: 1_501 }, (_, index) =>
      stream(`replacement-${index}`, `Replacement ${index}`, 'live', category.id),
    )

    await repository.putSectionManifest('profile-a', 'live', [category])
    await repository.replaceCategorySnapshot({
      profileId: 'profile-a',
      section: 'live',
      category,
      items: existingItems,
    })

    await expect(
      repository.replaceCategorySnapshot(
        {
          profileId: 'profile-a',
          section: 'live',
          category,
          items: replacementItems,
        },
        {
          onSnapshotPut: () => setLibraryPlaybackStarting(true),
        },
      ),
    ).rejects.toBeInstanceOf(LibraryWriteAbortedError)

    setLibraryPlaybackStarting(false)
    const firstShard = await repository.readCategoryShard(
      'profile-a',
      'live',
      category.id,
      0,
    )
    const secondShard = await repository.readCategoryShard(
      'profile-a',
      'live',
      category.id,
      1,
    )

    expect(firstShard.coverage).toBe('complete')
    expect(secondShard.coverage).toBe('complete')

    if (firstShard.coverage === 'complete' && secondShard.coverage === 'complete') {
      const restoredIds = [...firstShard.items, ...secondShard.items].map((item) => item.id)

      expect(restoredIds).toContain('existing-0')
      expect(restoredIds).toContain('existing-1500')
      expect(restoredIds.every((id) => id.startsWith('existing-'))).toBe(true)
    }
  })

  it('reclaims the old shard generation after atomically publishing a replacement', async () => {
    const repository = createRepository()
    const category = { id: 'news', name: 'News' }

    await repository.putSectionManifest('profile-a', 'live', [category])
    const first = await repository.replaceCategorySnapshot({
      profileId: 'profile-a',
      section: 'live',
      category,
      items: [stream('old', 'Old News', 'live', category.id)],
    })
    const second = await repository.replaceCategorySnapshot({
      profileId: 'profile-a',
      section: 'live',
      category,
      items: [stream('new', 'New News', 'live', category.id)],
    })

    expect(first.shardBase).toBe(0)
    expect(second.shardBase).toBeGreaterThan(first.shardBase ?? -1)
    await expect(
      readStoreRecord(
        databaseNames[0],
        'snapshots',
        ['profile-a', 'live', category.id, first.shardBase ?? 0],
      ),
    ).resolves.toBeUndefined()
    await expect(
      readStoreRecord(
        databaseNames[0],
        'snapshots',
        ['profile-a', 'live', category.id, second.shardBase ?? 0],
      ),
    ).resolves.toMatchObject({
      updatedAt: second.updatedAt,
    })
  })

  it('persists across repository relaunch, then clears both durable and memory cache state after deletion', async () => {
    const databaseName = uniqueDatabaseName()
    databaseNames.push(databaseName)
    const category = { id: 'news', name: 'News' }
    const first = createRepository(undefined, databaseName)

    await first.putSectionManifest('profile-a', 'live', [category])
    await first.replaceCategorySnapshot({
      profileId: 'profile-a',
      section: 'live',
      category,
      items: [stream('news-1', 'Persisted News', 'live', category.id)],
    })
    await first.replaceSearchShards('profile-a', [
      stream('news-1', 'Persisted News', 'live', category.id),
    ])
    expect(
      (await first.readCategoryShard('profile-a', 'live', category.id, 0)).coverage,
    ).toBe('complete')
    expect((await first.search('profile-a', 'persisted')).coverage).toBe('complete')
    first.close()

    const relaunched = createRepository(undefined, databaseName)
    await expect(
      relaunched.readCategoryShard('profile-a', 'live', category.id, 0),
    ).resolves.toMatchObject({
      coverage: 'complete',
      items: [expect.objectContaining({ id: 'news-1' })],
    })
    await expect(relaunched.search('profile-a', 'persisted')).resolves.toMatchObject({
      coverage: 'complete',
      matches: [expect.objectContaining(['live:live:news-1'])],
    })
    relaunched.close()

    await deleteLibraryDatabase(databaseName)

    const afterDeletion = createRepository(undefined, databaseName)
    await expect(
      afterDeletion.readCategoryShard('profile-a', 'live', category.id, 0),
    ).resolves.toEqual({
      coverage: 'none',
      items: [],
      reason: 'manifest-missing',
    })
    await expect(afterDeletion.search('profile-a', 'persisted')).resolves.toEqual({
      coverage: 'none',
      matches: [],
      reason: 'index-unavailable',
    })
  })

  it('keeps module-level cache entries isolated by both database and profile scope', async () => {
    const category = { id: 'news', name: 'News' }
    const first = createRepository()
    const second = createRepository()

    await first.putSectionManifest('profile-a', 'live', [category])
    await first.replaceCategorySnapshot({
      profileId: 'profile-a',
      section: 'live',
      category,
      items: [stream('first', 'First database', 'live', category.id)],
    })
    await expect(
      first.readCategoryShard('profile-a', 'live', category.id, 0),
    ).resolves.toMatchObject({
      coverage: 'complete',
      items: [expect.objectContaining({ id: 'first' })],
    })

    await second.putSectionManifest('profile-a', 'live', [category])
    await second.replaceCategorySnapshot({
      profileId: 'profile-a',
      section: 'live',
      category,
      items: [stream('second', 'Second database', 'live', category.id)],
    })
    await expect(
      second.readCategoryShard('profile-a', 'live', category.id, 0),
    ).resolves.toMatchObject({
      coverage: 'complete',
      items: [expect.objectContaining({ id: 'second' })],
    })

    await first.putSectionManifest('profile-b', 'live', [category])
    await first.replaceCategorySnapshot({
      profileId: 'profile-b',
      section: 'live',
      category,
      items: [stream('profile-b', 'Other profile', 'live', category.id)],
    })
    await expect(
      first.readCategoryShard('profile-b', 'live', category.id, 0),
    ).resolves.toMatchObject({
      coverage: 'complete',
      items: [expect.objectContaining({ id: 'profile-b' })],
    })
  })

  it('takes over only stale sync markers and rejects an obsolete run before it can publish', async () => {
    let now = 1_000
    const repository = createRepository(() => now)
    const category = { id: 'news', name: 'News' }

    expect(await repository.tryBeginSync('profile-a', 'run-one', 100)).toBe(true)
    now = 1_050
    expect(await repository.tryBeginSync('profile-a', 'run-two', 100)).toBe(false)
    now = 1_101
    expect(await repository.tryBeginSync('profile-a', 'run-two', 100)).toBe(true)

    await repository.putSectionManifest('profile-a', 'live', [category])
    await expect(
      repository.replaceCategorySnapshot({
        profileId: 'profile-a',
        section: 'live',
        category,
        items: [stream('old', 'Old run', 'live', category.id)],
        runId: 'run-one',
      }),
    ).rejects.toBeInstanceOf(LibraryWriteAbortedError)

    await expect(
      repository.replaceCategorySnapshot({
        profileId: 'profile-a',
        section: 'live',
        category,
        items: [stream('new', 'New run', 'live', category.id)],
        runId: 'run-two',
      }),
    ).resolves.toMatchObject({ coverage: 'complete' })
    expect(await repository.finishSync('profile-a', 'run-two', true, 2_000)).toBe(true)
    expect((await repository.getMeta('profile-a'))?.sync.inProgress).toBe(false)
  })

  it('degrades search to unavailable when any persisted search shard is evicted', async () => {
    const repository = createRepository()
    const items = Array.from({ length: 5_001 }, (_, index) =>
      stream(`item-${index}`, `Search title ${index}`, 'vod', 'movies'),
    )

    await repository.replaceSearchShards('profile-a', items)
    await expect(repository.search('profile-a', 'search title')).resolves.toMatchObject({
      coverage: 'complete',
    })
    await deleteStoreRecord(databaseNames[0], 'searchShards', ['profile-a', 1])
    clearLibraryMemoryCaches()

    await expect(repository.search('profile-a', 'search title')).resolves.toEqual({
      coverage: 'none',
      matches: [],
      reason: 'shard-missing',
    })
  })

  it('deletes only the selected profile cache and excludes direct playback URLs from durable records', async () => {
    const repository = createRepository()
    const category = { id: 'movies', name: 'Movies' }
    const privateSource = 'https://provider.invalid/movie/secret-token.mp4'
    const profileAStream = {
      ...stream('movie-a', 'Profile A movie', 'vod', category.id),
      directSource: privateSource,
    }
    const profileBStream = stream('movie-b', 'Profile B movie', 'vod', category.id)

    await repository.putSectionManifest('profile-a', 'vod', [category])
    await repository.putSectionManifest('profile-b', 'vod', [category])
    await repository.replaceCategorySnapshot({
      profileId: 'profile-a',
      section: 'vod',
      category,
      items: [profileAStream],
    })
    await repository.replaceCategorySnapshot({
      profileId: 'profile-b',
      section: 'vod',
      category,
      items: [profileBStream],
    })
    await repository.replaceSearchShards('profile-a', [profileAStream])
    await repository.putDetails(
      'profile-a',
      'vod',
      'movie-a',
      {
        id: 'movie-a',
        directSource: privateSource,
        metadata: {
          plot: 'Fixture only',
          cover: privateSource,
          trailer: { kind: 'url', url: privateSource },
        },
      },
      1_000,
    )

    expect(
      JSON.stringify(
        await readStoreRecord(
          databaseNames[0],
          'snapshots',
          ['profile-a', 'vod', category.id, 0],
        ),
      ),
    ).not.toContain(privateSource)
    expect(
      JSON.stringify(
        await readStoreRecord(
          databaseNames[0],
          'details',
          ['profile-a', 'vod', 'movie-a'],
        ),
      ),
    ).not.toContain(privateSource)

    await repository.deleteProfileCache('profile-a')

    await expect(
      repository.readCategoryShard('profile-a', 'vod', category.id, 0),
    ).resolves.toEqual({
      coverage: 'none',
      items: [],
      reason: 'manifest-missing',
    })
    await expect(repository.search('profile-a', 'profile')).resolves.toEqual({
      coverage: 'none',
      matches: [],
      reason: 'index-unavailable',
    })
    await expect(repository.getDetails('profile-a', 'vod', 'movie-a')).resolves.toBeNull()
    await expect(
      repository.readCategoryShard('profile-b', 'vod', category.id, 0),
    ).resolves.toMatchObject({
      coverage: 'complete',
      items: [expect.objectContaining({ id: 'movie-b' })],
    })
  })
})

const PRODUCTION_SCALE_CATEGORY_COUNT = 300
const PRODUCTION_SCALE_ITEMS_PER_CATEGORY = 100
const PRODUCTION_SCALE_ITEM_COUNT =
  PRODUCTION_SCALE_CATEGORY_COUNT * PRODUCTION_SCALE_ITEMS_PER_CATEGORY

function createProductionScaleCoordinator(
  repository: IndexedDbCatalogRepository,
): CatalogSyncCoordinator {
  const broker = new ProviderBroker(productionScaleProfile, {
    transport: new FixtureProviderTransport({
      [fixtureUrl('get_live_categories')]: jsonResponse([
        { category_id: 'live-category', category_name: 'Live category' },
      ]),
      [fixtureUrl('get_vod_categories')]: jsonResponse(
        Array.from({ length: PRODUCTION_SCALE_CATEGORY_COUNT }, (_, index) => ({
          category_id: `vod-category-${index}`,
          category_name: `VOD category ${index}`,
        })),
      ),
      [fixtureUrl('get_series_categories')]: jsonResponse([
        { category_id: 'series-category', category_name: 'Series category' },
      ]),
      [fixtureUrl('get_live_streams')]: jsonResponse([
        {
          stream_id: 'live-1',
          name: 'Fixture Live',
          category_id: 'live-category',
        },
      ]),
      [fixtureUrl('get_vod_streams')]: jsonResponse(productionScaleVodResponse()),
      [fixtureUrl('get_series')]: jsonResponse([
        {
          series_id: 'series-1',
          name: 'Fixture Series',
          category_id: 'series-category',
        },
      ]),
    }),
    dailyRequestBudget: 6,
  })

  return new CatalogSyncCoordinator(broker, repository)
}

function fixtureUrl(action: string): string {
  const url = new URL('https://fixture.invalid/player_api.php')
  url.searchParams.set('username', productionScaleProfile.username)
  url.searchParams.set('password', productionScaleProfile.password)
  url.searchParams.set('action', action)
  return url.toString()
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200 })
}

function productionScaleVodResponse(): Array<Record<string, string>> {
  return Array.from({ length: PRODUCTION_SCALE_ITEM_COUNT }, (_, index) => {
    const categoryIndex = Math.floor(index / PRODUCTION_SCALE_ITEMS_PER_CATEGORY)

    return {
      stream_id: `vod-${index}`,
      name: `Fixture VOD item ${index}`,
      category_id: `vod-category-${categoryIndex}`,
    }
  })
}

/**
 * Emulates the webOS transaction behavior under investigation: a readwrite
 * transaction becomes inactive as soon as a get() success callback returns.
 * Synchronous puts from that callback remain valid; an await continuation fails.
 */
async function installAutoCommitAfterGetHarness(databaseName: string): Promise<() => void> {
  const database = await openLibraryDatabase(databaseName)
  const transaction = database.transaction('meta', 'readonly')
  const prototype = Object.getPrototypeOf(transaction.objectStore('meta')) as IDBObjectStore
  database.close()

  const originalGet = prototype.get
  const originalPut = prototype.put
  const states = new WeakMap<IDBObjectStore, { armed: boolean; insideGetSuccess: boolean }>()

  prototype.get = function (
    this: IDBObjectStore,
    query: IDBValidKey | IDBKeyRange,
  ): IDBRequest<unknown> {
    const request = originalGet.call(this, query)
    const state = { armed: false, insideGetSuccess: false }
    states.set(this, state)
    const originalDispatchEvent = request.dispatchEvent.bind(request)

    request.dispatchEvent = (event: Event): boolean => {
      if (event.type !== 'success') {
        return originalDispatchEvent(event)
      }

      state.armed = true
      state.insideGetSuccess = true

      try {
        return originalDispatchEvent(event)
      } finally {
        state.insideGetSuccess = false
      }
    }

    return request
  }

  prototype.put = function (
    this: IDBObjectStore,
    value: any,
    key?: IDBValidKey,
  ): IDBRequest<IDBValidKey> {
    const state = states.get(this)

    if (state?.armed && !state.insideGetSuccess) {
      throw new DOMException(
        'The transaction auto-committed after the get request callback returned.',
        'TransactionInactiveError',
      )
    }

    return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key)
  }

  return () => {
    prototype.get = originalGet
    prototype.put = originalPut
  }
}

async function legacyAwaitThenPutSyncState(
  databaseName: string,
  profileId: string,
  runId: string,
  update: (state: LibrarySyncState) => LibrarySyncState,
): Promise<LibraryMetaRecord | null> {
  const database = await openLibraryDatabase(databaseName)

  try {
    const transaction = database.transaction('meta', 'readwrite')
    const complete = transactionCompleteForTest(transaction)
    const store = transaction.objectStore('meta')
    const current = await requestValue<LibraryMetaRecord | undefined>(store.get(profileId))

    if (!current || !current.sync.inProgress || current.sync.runId !== runId) {
      await complete
      return null
    }

    const nextSync = update(current.sync)
    const result: LibraryMetaRecord = {
      ...current,
      sync: {
        ...nextSync,
        updatedAt: Date.now(),
      },
    }

    // This is the prior vulnerable shape. The harness throws because the await
    // resumed after the request callback returned and the transaction went inactive.
    store.put(result)
    await complete
    return result
  } finally {
    database.close()
  }
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed in the test harness.'))
  })
}

function transactionCompleteForTest(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted in the test harness.'))
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed in the test harness.'))
  })
}

function createRepository(
  now?: () => number,
  databaseName = uniqueDatabaseName(),
): IndexedDbCatalogRepository {
  databaseNames.push(databaseName)
  const repository = new IndexedDbCatalogRepository({
    databaseName,
    now,
    snapshotCacheTtlMs: 60_000,
    searchCacheTtlMs: 60_000,
  })
  repositories.push(repository)
  return repository
}

function stream(
  id: string,
  name: string,
  section: StreamItem['section'],
  categoryId: string,
): StreamItem {
  return {
    id,
    name,
    section,
    categoryId,
    icon: `icon-${id}`,
    cover: `cover-${id}`,
    rating: '8.2',
    year: '2026',
    added: '1',
    containerExtension: section === 'live' ? 'ts' : 'mp4',
    streamType: section,
    seriesId: section === 'series' ? id : undefined,
    channelNumber: section === 'live' ? id : undefined,
    catchup: section === 'live' ? { available: false } : undefined,
    season: section === 'series' ? '1' : undefined,
    episodeNumber: section === 'series' ? '1' : undefined,
    seriesTitle: section === 'series' ? name : undefined,
    seriesCover: section === 'series' ? `series-${id}` : undefined,
  }
}

async function deleteStoreRecord(
  databaseName: string,
  storeName: 'snapshots' | 'searchShards',
  key: IDBValidKey,
): Promise<void> {
  const database = await openLibraryDatabase(databaseName)
  const transaction = database.transaction(storeName, 'readwrite')
  const completed = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Test transaction failed.'))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Test transaction aborted.'))
  })
  transaction.objectStore(storeName).delete(key)
  await completed
  database.close()
}

async function overwriteSnapshotRecord(
  databaseName: string,
  value: unknown,
): Promise<void> {
  const database = await openLibraryDatabase(databaseName)
  const transaction = database.transaction('snapshots', 'readwrite')
  const completed = transactionCompleteForTest(transaction)
  transaction.objectStore('snapshots').put(value)
  await completed
  database.close()
}

async function readStoreRecord(
  databaseName: string,
  storeName: 'snapshots' | 'details',
  key: IDBValidKey,
): Promise<unknown> {
  const database = await openLibraryDatabase(databaseName)
  const transaction = database.transaction(storeName, 'readonly')
  const completed = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Test transaction failed.'))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Test transaction aborted.'))
  })
  const request = transaction.objectStore(storeName).get(key)
  const value = await new Promise<unknown>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Test request failed.'))
  })
  await completed
  database.close()
  return value
}

function uniqueDatabaseName(): string {
  return `nova-play-library-test-${Date.now()}-${Math.random()}`
}