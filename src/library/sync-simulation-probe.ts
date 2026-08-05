import {
  deleteLibraryDatabase,
  IndexedDbCatalogRepository,
  type LibraryCoverage,
} from './catalog-repository'
import {
  CATALOG_SYNC_PROGRESS_THROTTLE_MS,
  CATALOG_SYNC_SECTIONS,
  CatalogSyncCoordinator,
  type CatalogSyncProgress,
  type CatalogSyncProvider,
} from './catalog-sync'
import { ProviderBroker } from '../provider-broker'
import type { ProviderTransport } from '../provider-transport'
import type { BreadcrumbStorage } from './sync-breadcrumb'
import type { SectionScanResult } from '../xtream-client'
import type { Category, LibrarySection, StreamItem, XtreamProfile } from '../types'

/** Per-section synthetic sizing. Defaults track the physical device figures. */
export type SyncSimulationSectionShape = {
  categoryCount: number
  itemsPerCategory: number
}

export type SyncSimulationOptions = {
  /**
   * A single section to scope the run to, or omitted to run the full unscoped
   * six-request plan (three category manifests plus one whole-section scan per
   * section) exactly as a scheduled acquisition does.
   */
  section?: LibrarySection
  /** Overrides the default per-section shape. */
  shapes?: Partial<Record<LibrarySection, Partial<SyncSimulationSectionShape>>>
  /**
   * When true (the default), each section is seeded with a real populated
   * complete generation before the run: published snapshots and a built search
   * index, whose coverage and counts are verified. This is what makes the run a
   * refresh over an authoritative section rather than a metadata flag.
   */
  seedPopulated?: boolean
  batchSize?: number
  /**
   * Defaults to false so a renderer kill leaves a recoverable disposable
   * database for `inspectSyncSimulation`/`cleanupSyncSimulation`. Pass true only
   * for an in-process run whose cleanup is guaranteed to execute.
   */
  cleanup?: boolean
  databaseName?: string
  /**
   * `callback` hands batches straight to the coordinator, isolating publication.
   * `parser` streams a synthetic Xtream body through the real `ProviderBroker`,
   * so `XtreamClient`'s brace-aware character parser is exercised too.
   */
  transport?: 'callback' | 'parser'
  /**
   * Optional payload-free progress sink. The device diagnostic attaches the real
   * DOM indicator here so the progress path is exercised on the physical target.
   */
  onProgress?: (progress: CatalogSyncProgress) => void
  /**
   * Progress throttle window in milliseconds. Omit for the production default.
   * Pass 0 to run the unthrottled (pre-fix, one-event-per-batch) A1 cell; the
   * A2 cell omits it. This is the switch that makes the on-device A/B measurable
   * from a single build.
   */
  progressThrottleMs?: number
  /**
   * Trims the synthetic record to the real provider shape. The default padded
   * record overstates bytes/record; `lean` drops the plot padding so a Live body
   * approximates the measured ~18.6 MB across ~53,913 records instead of ~23-32
   * MB. Used for A1' so an unthrottled run reaches end-of-parse inside 120 s.
   */
  recordShape?: 'padded' | 'lean'
  /**
   * Forces the per-section scan `timeoutMs` (both header-less total deadline).
   * Omit to use production's section-scaled deadline. Set 120000 to reproduce
   * the old uniform bound at VOD scale.
   */
  scanTimeoutMs?: number
}

export type SyncSimulationSectionReport = {
  section: LibrarySection
  categoryCount: number
  itemCount: number
  streamedBytes: number | null
  seededCoverage: LibraryCoverage | null
  seededItemCount: number | null
  seededIndexGeneration: number | null
  seededIndexPostingCount: number | null
  manifestCoverage: LibraryCoverage | null
  manifestItemCount: number | null
  indexGeneration: number | null
  indexPostingCount: number | null
  mode: string
  success: boolean
  reason?: string
}

export type SyncSimulationReport = {
  schemaVersion: 2
  databaseName: string
  cleanedUp: boolean
  transport: 'callback' | 'parser'
  seedPopulated: boolean
  scopedSection: LibrarySection | null
  status: string
  /** Effective progress throttle window; 0 means unthrottled (A1 cell). */
  progressThrottleMs: number
  /** Total progress events observed by the probe's own sink during the run. */
  progressEventCount: number
  /** Convenience flag: true when the throttle window is greater than zero. */
  throttled: boolean
  /** Coordinator attempts. For an unscoped run this must be six. */
  requestCount: number
  /** Broker-issued/debited requests. For an unscoped run this must be six. */
  issuedRequestCount: number | null
  sections: SyncSimulationSectionReport[]
  storageBeforeBytes: number
  storageAfterBytes: number
  /**
   * Longest observed gap between fixed-interval scheduler ticks. This is
   * scheduler drift, not a pure main-thread span: it includes setInterval
   * clamping, timer-queue delay, and IndexedDB task-source starvation. It is a
   * coarse pressure signal, not a definitive unyielded-span measurement.
   */
  schedulerDriftMs: number
  /** Wall-clock of the measured run only; seeding is excluded. */
  runElapsedMs: number
}

const DEFAULT_SHAPES: Record<LibrarySection, SyncSimulationSectionShape> = {
  // Category/item products chosen so the record counts approximate the physical
  // device figures (Live ~53k, VOD ~194k, Series ~40k) when fully populated.
  live: { categoryCount: 824, itemsPerCategory: 65 },
  vod: { categoryCount: 363, itemsPerCategory: 535 },
  series: { categoryCount: 200, itemsPerCategory: 200 },
}

/**
 * Drives the production `CatalogSyncCoordinator` against a synthetic provider and
 * a disposable database, so a whole catalog acquisition can be reproduced on the
 * device with no provider request and no risk to the real catalog cache.
 *
 * Against the earlier probe this version:
 *  - seeds a real populated complete generation per section and verifies it, so
 *    a refresh runs over authoritative snapshots and a built index rather than a
 *    bare metadata flag;
 *  - runs the full unscoped six-request plan by default and reports the observed
 *    coordinator and broker request counts;
 *  - isolates the crash-surviving breadcrumb to an in-memory store so a probe
 *    kill cannot degrade the next real sync;
 *  - starts its timers after seeding so setup is not conflated with the run; and
 *  - leaves the disposable database recoverable by default.
 */
export async function runSyncSimulationProbe(
  options: SyncSimulationOptions = {},
): Promise<SyncSimulationReport> {
  const scopedSection = options.section ?? null
  const sections = scopedSection ? [scopedSection] : [...CATALOG_SYNC_SECTIONS]
  const seedPopulated = options.seedPopulated !== false
  const batchSize = positiveInteger(options.batchSize, 256)
  const transportMode = options.transport ?? 'callback'
  const databaseName = options.databaseName ?? `nova-play-sync-sim-${Date.now()}`
  const profileId = 'sync-simulation-profile'
  const repository = new IndexedDbCatalogRepository({ databaseName })

  const shapeFor = (section: LibrarySection): SyncSimulationSectionShape => {
    const override = options.shapes?.[section] ?? {}
    const base = DEFAULT_SHAPES[section]
    return {
      categoryCount: positiveInteger(override.categoryCount, base.categoryCount),
      itemsPerCategory: positiveInteger(override.itemsPerCategory, base.itemsPerCategory),
    }
  }

  const categoriesBySection = new Map<LibrarySection, Category[]>()
  for (const section of sections) {
    const { categoryCount } = shapeFor(section)
    categoriesBySection.set(
      section,
      Array.from({ length: categoryCount }, (_unused, index) => ({
        id: `sim-${section}-category-${index}`,
        name: `Simulated ${section} category ${index + 1}`,
      })),
    )
  }

  const streamedBytesBySection = new Map<LibrarySection, number>()

  /*
   * The crash-surviving breadcrumb is scoped to the probe. A renderer kill during
   * a synthetic run therefore leaves an isolated marker, never the production
   * `nova-play.sync-breadcrumb`, so the next real sync's flush size is untouched.
   */
  const breadcrumbStore = createMemoryBreadcrumbStore()

  const seededBySection = new Map<
    LibrarySection,
    {
      coverage: LibraryCoverage | null
      itemCount: number | null
      indexGeneration: number | null
      indexPostingCount: number | null
    }
  >()

  try {
    // ---- Setup: seed authoritative generations (excluded from run metrics). ----
    for (const section of sections) {
      const categories = categoriesBySection.get(section)!
      await repository.putSectionManifest(profileId, section, categories)
    }

    if (seedPopulated) {
      for (const section of sections) {
        const categories = categoriesBySection.get(section)!
        const { itemsPerCategory } = shapeFor(section)

        for (const category of categories) {
          const items = Array.from({ length: itemsPerCategory }, (_unused, itemIndex) =>
            simulatedItem(section, category.id, categoryIndexOf(category.id), itemIndex),
          )
          await repository.replaceCategorySnapshot({ profileId, section, category, items })
        }
      }

      const indexResults = await repository.rebuildSearchIndexes(profileId, sections)

      for (let index = 0; index < sections.length; index += 1) {
        const section = sections[index]
        const manifest = await repository.getManifest(profileId, section)
        const indexResult = indexResults[index]
        seededBySection.set(section, {
          coverage: manifest?.coverage.state ?? null,
          itemCount: manifest?.coverage.itemCount ?? null,
          indexGeneration:
            indexResult?.coverage === 'complete' ? indexResult.generation : null,
          indexPostingCount:
            indexResult?.coverage === 'complete' ? indexResult.postingCount : null,
        })
      }
    }

    // Seed sync metadata as a completed prior run so the refresh is not deferred.
    await repository.putMeta(profileId, {
      searchCoverage: seedPopulated ? 'complete' : 'none',
      searchShardCount: 0,
      sync: {
        inProgress: false,
        sections: Object.fromEntries(
          sections.map((section) => [
            section,
            {
              coverage: seedPopulated ? 'complete' : 'none',
              wholeSectionFailureCount: 0,
              nextCategoryCursor: 0,
            },
          ]),
        ),
      },
    })

    const storageBeforeBytes = (await repository.estimateProfileStorage(profileId)).byteEstimate

    // ---- Build the synthetic provider. ----
    const provider = buildProvider({
      transportMode,
      sections,
      categoriesBySection,
      shapeFor,
      batchSize,
      profileId,
      streamedBytesBySection,
      recordShape: options.recordShape ?? 'padded',
    })

    // ---- Run: start timers only now, so seeding is not measured. ----
    let schedulerDriftMs = 0
    let lastTickAt = monotonicNow()
    const gapTimer = setInterval(() => {
      const now = monotonicNow()
      const gap = now - lastTickAt
      if (gap > schedulerDriftMs) {
        schedulerDriftMs = gap
      }
      lastTickAt = now
    }, 50)

    /*
     * Count every progress event the coordinator emits, and still forward it to
     * a caller-supplied sink (the real DOM indicator, on the device). The A1
     * cell (throttle 0) should show a per-batch count; A2 a small coalesced one.
     */
    let progressEventCount = 0
    const onProgress = (progress: CatalogSyncProgress): void => {
      progressEventCount += 1
      options.onProgress?.(progress)
    }

    const startedAt = monotonicNow()
    let result
    try {
      const coordinator = new CatalogSyncCoordinator(provider, repository, {
        breadcrumbStore,
        onProgress,
        progressThrottleMs: options.progressThrottleMs,
        scanTimeoutMs: options.scanTimeoutMs,
      })
      result = scopedSection
        ? await coordinator.sync(profileId, { section: scopedSection })
        : await coordinator.sync(profileId)
    } finally {
      clearInterval(gapTimer)
    }
    const runElapsedMs = Math.round(monotonicNow() - startedAt)
    const effectiveThrottleMs = options.progressThrottleMs ?? CATALOG_SYNC_PROGRESS_THROTTLE_MS

    // ---- Per-section reporting. ----
    const sectionReports: SyncSimulationSectionReport[] = []
    for (const section of sections) {
      const shape = shapeFor(section)
      const manifest = await repository.getManifest(profileId, section)
      const indexMeta = await repository.getSearchIndexMeta(profileId, section)
      const outcome = result.sections.find((entry) => entry.section === section)
      const seeded = seededBySection.get(section) ?? null

      sectionReports.push({
        section,
        categoryCount: shape.categoryCount,
        itemCount: shape.categoryCount * shape.itemsPerCategory,
        streamedBytes: streamedBytesBySection.get(section) ?? null,
        seededCoverage: seeded?.coverage ?? null,
        seededItemCount: seeded?.itemCount ?? null,
        seededIndexGeneration: seeded?.indexGeneration ?? null,
        seededIndexPostingCount: seeded?.indexPostingCount ?? null,
        manifestCoverage: manifest?.coverage.state ?? null,
        manifestItemCount: manifest?.coverage.itemCount ?? null,
        indexGeneration: indexMeta?.coverage === 'complete' ? indexMeta.generation ?? null : null,
        indexPostingCount: indexMeta?.coverage === 'complete' ? indexMeta.postingCount : null,
        mode: outcome?.mode ?? 'skipped',
        success: outcome?.success ?? false,
        reason: outcome?.reason,
      })
    }

    const storageAfterBytes = (await repository.estimateProfileStorage(profileId)).byteEstimate
    const cleanup = options.cleanup === true

    return {
      schemaVersion: 2,
      databaseName,
      cleanedUp: cleanup,
      transport: transportMode,
      seedPopulated,
      scopedSection,
      status: result.status,
      progressThrottleMs: effectiveThrottleMs,
      progressEventCount,
      throttled: effectiveThrottleMs > 0,
      requestCount: result.requestCount,
      issuedRequestCount: result.issuedRequestCount ?? null,
      sections: sectionReports,
      storageBeforeBytes,
      storageAfterBytes,
      schedulerDriftMs: Math.round(schedulerDriftMs),
      runElapsedMs,
    }
  } finally {
    repository.close()

    if (options.cleanup === true) {
      await deleteLibraryDatabase(databaseName).catch(() => undefined)
    }
  }
}

/**
 * Explicit cleanup for a recoverable probe database left behind by a run started
 * with the default `cleanup: false`, including after a renderer kill where the
 * run's own `finally` could not execute.
 */
export async function cleanupSyncSimulation(databaseName: string): Promise<void> {
  await deleteLibraryDatabase(databaseName)
}

type ProviderBuildInput = {
  transportMode: 'callback' | 'parser'
  sections: LibrarySection[]
  categoriesBySection: Map<LibrarySection, Category[]>
  shapeFor: (section: LibrarySection) => SyncSimulationSectionShape
  batchSize: number
  profileId: string
  streamedBytesBySection: Map<LibrarySection, number>
  recordShape: 'padded' | 'lean'
}

function buildProvider(input: ProviderBuildInput): CatalogSyncProvider {
  const {
    transportMode,
    categoriesBySection,
    shapeFor,
    batchSize,
    profileId,
    streamedBytesBySection,
    recordShape,
  } = input

  const callbackProvider: CatalogSyncProvider = {
    backgroundCategories: async (section) => categoriesBySection.get(section) ?? [],
    backgroundScanSection: async (section, scanOptions) => {
      const categories = categoriesBySection.get(section) ?? []
      const { itemsPerCategory } = shapeFor(section)
      const onMatches = scanOptions?.onMatches
      let accepted = 0

      if (onMatches) {
        /*
         * Emit in provider-like order: interleaved across categories rather than
         * grouped, because that keeps every category open for the whole scan.
         */
        let batch: StreamItem[] = []

        for (let itemIndex = 0; itemIndex < itemsPerCategory; itemIndex += 1) {
          for (let categoryIndex = 0; categoryIndex < categories.length; categoryIndex += 1) {
            batch.push(simulatedItem(section, categories[categoryIndex].id, categoryIndex, itemIndex, recordShape))

            if (batch.length >= batchSize) {
              accepted += batch.length
              await onMatches(batch)
              batch = []
            }
          }
        }

        if (batch.length) {
          accepted += batch.length
          await onMatches(batch)
        }
      }

      const statistics: SectionScanResult = {
        rawItemCount: accepted,
        parsedItemCount: accepted,
        acceptedItemCount: accepted,
        missingIdentifierCount: 0,
        bytesReceived: 0,
        arrayClosed: true,
      }
      scanOptions?.onScanStatistics?.(statistics)
      return statistics
    },
  }

  if (transportMode === 'callback') {
    return callbackProvider
  }

  const simulatedProfile: XtreamProfile = {
    id: profileId,
    name: 'Sync simulation',
    serverUrl: 'https://synthetic.invalid',
    username: 'simulation',
    password: 'simulation',
  }

  const transport = createStreamingTransport(categoriesBySection, shapeFor, streamedBytesBySection, recordShape)

  /*
   * Constructed through ProviderBroker so the real request boundary, budget
   * accounting, and brace-aware parser are all exercised. The generous budget
   * keeps the synthetic run from tripping the daily ceiling.
   */
  const parserProvider = new ProviderBroker(simulatedProfile, {
    transport,
    dailyRequestBudget: Number.MAX_SAFE_INTEGER,
  })

  return {
    backgroundCategories: (section, signal, timeoutMs) =>
      parserProvider.backgroundCategories(section, signal, timeoutMs),
    backgroundScanSection: (section, scanOptions) =>
      parserProvider.backgroundScanSection(section, scanOptions),
    canBeginCatalogSync: (requestCount) => parserProvider.canBeginCatalogSync(requestCount),
    issuedRequestCount: (budget) => parserProvider.issuedRequestCount(budget),
  }
}

/**
 * Serves both category manifests and streamed section bodies for every section,
 * so a broker-backed run exercises the full six-request plan. Section bodies are
 * generated lazily so the whole response is never materialised at once.
 */
function createStreamingTransport(
  categoriesBySection: Map<LibrarySection, Category[]>,
  shapeFor: (section: LibrarySection) => SyncSimulationSectionShape,
  streamedBytesBySection: Map<LibrarySection, number>,
  recordShape: 'padded' | 'lean',
): ProviderTransport {
  const categoryActions: Record<string, LibrarySection> = {
    get_live_categories: 'live',
    get_vod_categories: 'vod',
    get_series_categories: 'series',
  }
  const streamActions: Record<string, LibrarySection> = {
    get_live_streams: 'live',
    get_vod_streams: 'vod',
    get_series: 'series',
  }

  return {
    async fetch(url: string) {
      const action = new URL(url).searchParams.get('action') ?? ''

      if (categoryActions[action]) {
        const section = categoryActions[action]
        const categories = categoriesBySection.get(section) ?? []
        const body = JSON.stringify(
          categories.map((category) => ({
            category_id: category.id,
            category_name: category.name,
          })),
        )
        return new Response(body, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      const section = streamActions[action]
      if (!section) {
        throw new Error(`No sync-simulation fixture for action ${action}.`)
      }

      const categories = categoriesBySection.get(section) ?? []
      const { itemsPerCategory } = shapeFor(section)
      let itemIndex = 0
      let categoryIndex = 0
      let wroteFirst = false
      let finished = false
      const encoder = new TextEncoder()
      let bytes = 0

      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (finished) {
            controller.close()
            return
          }

          const parts: string[] = []

          if (!wroteFirst) {
            parts.push('[')
            wroteFirst = true
          }

          for (let produced = 0; produced < 64; produced += 1) {
            if (itemIndex >= itemsPerCategory) {
              parts.push(']')
              finished = true
              break
            }

            parts.push(
              `${parts.length > 1 || bytes > 1 ? ',' : ''}${syntheticRecordJson(
                section,
                categories[categoryIndex].id,
                categoryIndex,
                itemIndex,
                recordShape,
              )}`,
            )

            categoryIndex += 1

            if (categoryIndex >= categories.length) {
              categoryIndex = 0
              itemIndex += 1
            }
          }

          const chunk = encoder.encode(parts.join(''))
          bytes += chunk.byteLength
          streamedBytesBySection.set(section, bytes)
          controller.enqueue(chunk)
        },
      })

      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  }
}

/**
 * A payload-free in-memory breadcrumb store for the probe, isolating the run
 * from the production `localStorage` breadcrumb key.
 */
function createMemoryBreadcrumbStore(): BreadcrumbStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    },
  }
}

function categoryIndexOf(categoryId: string): number {
  const match = /-category-(\d+)$/.exec(categoryId)
  return match ? Number(match[1]) : 0
}

/**
 * Representative record shape. A record built from a handful of short fields
 * understates the real working set by several times, and artwork is the field
 * that grew most once the cache writer stopped stripping it. Synthetic strings
 * on a non-routable host only.
 */
function simulatedItem(
  section: LibrarySection,
  categoryId: string,
  categoryIndex: number,
  itemIndex: number,
  recordShape: 'padded' | 'lean' = 'padded',
): StreamItem {
  const label = `Simulated item ${categoryIndex + 1}-${itemIndex + 1}`

  const base: StreamItem = {
    id: `sim-${section}-${categoryIndex}-${itemIndex}`,
    name: `${label} extended title padding`,
    section,
    categoryId,
    searchName: `${label} extended title padding`.toLowerCase(),
    icon: `https://synthetic.invalid/artwork/icon/${categoryIndex}-${itemIndex}-0123456789abcdef.jpg`,
    cover: `https://synthetic.invalid/artwork/cover/${categoryIndex}-${itemIndex}-0123456789abcdef.jpg`,
    rating: '8.2',
    year: '2026',
    added: '1785800000',
    containerExtension: section === 'live' ? 'ts' : 'mp4',
  }

  // `lean` omits the plot padding so bytes/record approximate the measured real
  // provider shape; `padded` keeps the larger representative record.
  if (recordShape === 'lean') {
    return base
  }

  return {
    ...base,
    plot: `Synthetic plot text for ${label}, present only so the simulated record is representative of a provider record rather than a minimal stub.`,
  }
}

/**
 * Provider-shaped record JSON, matching the field names the client reads.
 *
 * The identity field differs by section: the series endpoint is keyed on
 * `series_id`, and a record carrying only `stream_id` is skipped outright - which
 * silently published a complete-but-empty section the first time this was run.
 */
function syntheticRecordJson(
  section: LibrarySection,
  categoryId: string,
  categoryIndex: number,
  itemIndex: number,
  recordShape: 'padded' | 'lean' = 'padded',
): string {
  const label = `Simulated item ${categoryIndex + 1}-${itemIndex + 1} extended title padding`
  const id = `${section}-${categoryIndex}-${itemIndex}`

  const record: Record<string, unknown> = {
    ...(section === 'series' ? { series_id: id } : { stream_id: id }),
    num: itemIndex + 1,
    name: label,
    stream_type: section === 'live' ? 'live' : section,
    stream_icon: `https://synthetic.invalid/artwork/icon/${categoryIndex}-${itemIndex}-0123456789abcdef.jpg`,
    cover: `https://synthetic.invalid/artwork/cover/${categoryIndex}-${itemIndex}-0123456789abcdef.jpg`,
    category_id: categoryId,
    rating: '8.2',
    year: '2026',
    added: '1785800000',
    container_extension: section === 'live' ? 'ts' : 'mp4',
    epg_channel_id: `sim.${categoryIndex}.${itemIndex}`,
    tv_archive: 0,
  }

  // `lean` drops the plot padding so a Live body approximates the measured real
  // ~18.6 MB rather than the larger padded shape (used for the A1' calibration).
  if (recordShape === 'padded') {
    record.plot = `Synthetic plot text for ${label}, present only so the simulated record is representative of a provider record rather than a minimal stub.`
  }

  return JSON.stringify(record)
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback
}

function monotonicNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}
