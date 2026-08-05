import {
  deleteProbeDatabase,
  indexedDbAvailable,
  iterateProbeCursor,
  openProbeDatabase,
  queryProbeCompoundKey,
  queryProbeIndex,
  readProbeKeys,
  writeProbeBatch,
} from './idb-probe'
import type { CatalogSyncResult, CatalogSyncRunOptions } from './catalog-sync'
import type { LibrarySyncSectionFailureDetail } from './catalog-repository'
import type {
  SyncSimulationOptions,
  SyncSimulationReport,
} from './sync-simulation-probe'
import type { ProviderBudgetSnapshot } from '../provider-broker'
import type { LibrarySection } from '../types'
import type {
  CapabilityMeasurement,
  CapabilityProbeOptions,
  CapabilityProbeRecord,
  CapabilityProbeReport,
  CapabilityWarningCode,
  FlatSnapshotPlaybackMode,
  FlatSnapshotPlaybackStartupReport,
  FlatSnapshotProbeOptions,
  FlatSnapshotProbeReport,
  FlatSnapshotRecoveryReport,
  PublicationProbeOptions,
  PublicationProbeReport,
  WorkerProbeResult,
} from './capability-types'

const DEFAULT_OPTIONS: CapabilityProbeOptions = {
  recordCounts: [100],
  batchSizes: [25],
  testWorkerIndexedDb: false,
  cleanup: true,
}

const WORKER_TIMEOUT_MS = 15_000

export type CapabilityProbeRunOptions = Partial<CapabilityProbeOptions> & {
  databaseName?: string
  persistenceExpectedRecordCount?: number
  signal?: AbortSignal
}

export type CatalogSyncStorageInspection = {
  nextDueAt: number | null
  failureCount: number
  inProgress: boolean
  sections: Record<
    LibrarySection,
    {
      coverage: 'none' | 'partial' | 'complete'
      manifestCategoryCount: number
      activeSnapshotCount: number
      activeItemCount: number
      checkpoint: {
        wholeSectionFailureCount: number
        nextCategoryCursor: number
        lastAttemptAt: number | null
        lastSuccessAt: number | null
        lastFailureAt: number | null
        lastFailureDetail: LibrarySyncSectionFailureDetail | null
      }
    }
  >
}

export type VideoSizingSample = {
  observedAt: number
  reason: 'attempt-start' | 'loadedmetadata' | 'playing' | 'resize' | 'capture'
  activeEngine: 'native' | 'hls' | 'mpegts' | 'dash' | 'unknown'
  videoWidth: number
  videoHeight: number
  clientWidth: number
  clientHeight: number
  objectFit: string
  playerContainer: {
    x: number
    y: number
    width: number
    height: number
  }
}

export type VideoSizingReport = VideoSizingSample & {
  resolutionHistory: VideoSizingSample[]
}

export type LibraryCapabilityProbeApi = {
  run(options?: CapabilityProbeRunOptions): Promise<CapabilityProbeReport>
  cancel(): void
  cleanup(): Promise<void>
  publication: {
    run(options?: PublicationProbeOptions): Promise<PublicationProbeReport>
  }
  /**
   * Reproduces a whole-section acquisition through the production coordinator
   * against a synthetic provider and a disposable database. No provider request,
   * no effect on the real catalog cache.
   */
  syncSimulation: {
    run(options?: SyncSimulationOptions): Promise<SyncSimulationReport>
    cleanup(databaseName: string): Promise<void>
    setIndicatorMode(mode: 'legacy-replace' | 'in-place'): boolean
  }
  flatSnapshot: {
    run(options?: FlatSnapshotProbeOptions): Promise<FlatSnapshotProbeReport>
    inspect(databaseName: string, runId: string): Promise<FlatSnapshotRecoveryReport>
    cleanup(databaseName: string): Promise<void>
    playback: {
      arm(mode: FlatSnapshotPlaybackMode): FlatSnapshotPlaybackStartupReport
      status(): FlatSnapshotPlaybackStartupReport
      reset(): void
      startFromResume(): Promise<boolean>
    }
  }
  videoSizing: {
    capture(): VideoSizingReport | null
    reset(): void
  }
  catalogSync: {
    schedule(delayMs?: number): boolean
    run(runOptions?: CatalogSyncRunOptions): Promise<CatalogSyncResult | null>
    cancel(): void
    isRunning(): boolean
    inspectState(): Promise<CatalogSyncStorageInspection | null>
    /**
     * Deletes only the rebuildable profile catalog cache so the next explicitly
     * invoked probe run starts with no cooldown or fallback checkpoint. It does
     * not alter provider budgets, refusal/Retry-After state, profiles, settings,
     * favorites, or resume history.
     */
    resetForWholeSectionProbe(): Promise<boolean>
    /**
     * Clears only persisted retry/cooldown checkpoints after an offline
     * publication proof. It never sends a provider request or alters budgets.
     */
    clearFailedCheckpointsForProbe(): Promise<boolean>
    /**
     * Deletes the complete local library database for eviction-recovery checks.
     * It never calls the provider and leaves localStorage user state intact.
     */
    simulateEviction(): Promise<boolean>
    inspectBudget(): ProviderBudgetSnapshot | null
    resetBudget(): ProviderBudgetSnapshot | null
    /**
     * Probe-only EPG UI demonstration: opens the real live details view for a
     * channel so now/next and the schedule render through the production path,
     * without a downloaded live catalog. Returns whether the panels rendered.
     */
    epgDemo(input: { id: string; name?: string; showSchedule?: boolean }): Promise<{
      view: string
      selectedIsLive: boolean
      nowNextRendered: boolean
      nowNextRowCount: number
      scheduleRendered: boolean
      scheduleRowCount: number
    }>
  }
}

declare global {
  interface Window {
    __NOVA_LIBRARY_PROBE__?: LibraryCapabilityProbeApi
  }
}

type WorkerProbeExecution = {
  worker: CapabilityProbeReport['worker']
  result?: WorkerProbeResult
  measurement?: CapabilityMeasurement
}

export async function runLibraryCapabilityProbe(
  options: CapabilityProbeRunOptions = {},
): Promise<CapabilityProbeReport> {
  const settings = {
    ...DEFAULT_OPTIONS,
    ...options,
    recordCounts: validPositiveIntegers(options.recordCounts ?? DEFAULT_OPTIONS.recordCounts),
    batchSizes: validPositiveIntegers(options.batchSizes ?? DEFAULT_OPTIONS.batchSizes),
  }
  const warnings: CapabilityWarningCode[] = []
  const measurements: CapabilityMeasurement[] = []
  const storage = await probeStorage()
  const databaseName = options.databaseName ?? `nova-play-capability-probe-${Date.now()}`
  const workerProbe = settings.testWorkerIndexedDb
    ? await runWorkerIndexedDbProbe(
        settings.workerScriptUrl,
        Math.max(...settings.recordCounts),
        settings.batchSizes[0],
      )
    : unavailableWorkerProbe()
  let mainThreadSupported = false
  let persistenceAcrossRelaunch: CapabilityProbeReport['indexedDb']['persistsAcrossRelaunch'] =
    'unknown'
  let indexesSupported = false
  let cursorsSupported = false
  let compoundKeysSupported = false

  if (!indexedDbAvailable()) {
    warnings.push('indexeddb-unavailable')
  } else {
    try {
      const database = await openProbeDatabase(databaseName)

      mainThreadSupported = true
      const largestRecordCount = Math.max(...settings.recordCounts)
      const largestRecordSet = createRecords(largestRecordCount)

      if (options.persistenceExpectedRecordCount !== undefined) {
        const persistenceRead = await readProbeKeys(
          database,
          Math.max(0, Math.floor(options.persistenceExpectedRecordCount)),
        )
        measurements.push(persistenceRead)
        persistenceAcrossRelaunch = persistenceRead.success ? 'yes' : 'no'
      }

      writeLoop:
      for (const recordCount of settings.recordCounts) {
        const records = largestRecordSet.slice(0, recordCount)

        for (const batchSize of settings.batchSizes) {
          for (let offset = 0; offset < records.length; offset += batchSize) {
            const write = await writeProbeBatch(
              database,
              records.slice(offset, offset + batchSize),
              batchSize,
              options.signal,
            )
            measurements.push(write)

            if (options.signal?.aborted || !write.success) {
              break writeLoop
            }

            await yieldProbeBatch()
          }
        }
      }

      if (!options.signal?.aborted) {
        measurements.push(await readProbeKeys(database, largestRecordCount))
        measurements.push(
          await queryProbeIndex(
            database,
            largestRecordSet[0]?.token ?? 'probe-token-0',
          ),
        )
        measurements.push(
          await queryProbeCompoundKey(
            database,
            largestRecordSet[0]?.group ?? 0,
            largestRecordSet[0]?.sequence ?? 0,
          ),
        )
        measurements.push(await iterateProbeCursor(database))
      }

      indexesSupported = measurements.some(
        (measurement) => measurement.operation === 'index-query' && measurement.success,
      )
      cursorsSupported = measurements.some(
        (measurement) => measurement.operation === 'cursor-scan' && measurement.success,
      )
      compoundKeysSupported = measurements.some(
        (measurement) => measurement.operation === 'compound-key-query' && measurement.success,
      )

      database.close()
    } catch {
      warnings.push('indexeddb-unavailable')
    } finally {
      if (settings.cleanup) {
        try {
          await deleteProbeDatabase(databaseName)
        } catch {
          warnings.push('cleanup-retry-required')
        }
      }
    }
  }

  if (workerProbe.measurement) {
    measurements.push(workerProbe.measurement)
  }

  if (workerProbe.result) {
    measurements.push(...workerProbe.result.measurements)
  }

  if (!storage.estimateSupported) {
    warnings.push('storage-estimate-unavailable')
  }

  if (!storage.persistSupported) {
    warnings.push('storage-persistence-unavailable')
  }

  if (!workerProbe.worker.classicSupported) {
    warnings.push('worker-unavailable')
  } else if (settings.testWorkerIndexedDb && !workerProbe.result?.indexedDbSupported) {
    warnings.push('worker-idb-unavailable')
  }

  const report: CapabilityProbeReport = {
    schemaVersion: 1,
    device: {
      userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      webOsRuntime:
        typeof navigator !== 'undefined' &&
        /web0s|webos|lgtv/i.test(navigator.userAgent),
    },
    worker: workerProbe.worker,
    indexedDb: {
      mainThreadSupported,
      workerSupported: workerProbe.result?.indexedDbSupported ?? false,
      persistsAcrossRelaunch: persistenceAcrossRelaunch,
      indexesSupported,
      cursorsSupported,
      compoundKeysSupported,
    },
    cooperativeMain: {
      tested: mainThreadSupported,
      supported: mainThreadSupported && indexesSupported && cursorsSupported && compoundKeysSupported,
      p95SliceMs: percentile(
        measurements
          .filter((measurement) => measurement.runner === 'main' && measurement.success)
          .map((measurement) => measurement.durationMs),
        95,
      ),
    },
    storage,
    measurements,
    recommendation: 'no-go',
    warnings: uniqueWarnings(warnings),
  }

  report.recommendation = recommendLibraryRunner(report)
  return report
}

export function recommendLibraryRunner(
  report: CapabilityProbeReport,
): CapabilityProbeReport['recommendation'] {
  const indexedDbReady =
    report.indexedDb.mainThreadSupported &&
    report.indexedDb.indexesSupported &&
    report.indexedDb.cursorsSupported &&
    report.indexedDb.compoundKeysSupported

  if (!indexedDbReady) {
    return 'no-go'
  }

  if (
    report.worker.classicSupported &&
    report.worker.packagedUrlResolved &&
    report.worker.startupSupported &&
    report.worker.messagingSupported &&
    report.indexedDb.workerSupported
  ) {
    return 'worker-idb'
  }

  return report.cooperativeMain.supported ? 'cooperative-main' : 'no-go'
}

async function runWorkerIndexedDbProbe(
  workerScriptUrl: string | undefined,
  recordCount: number,
  batchSize: number,
): Promise<WorkerProbeExecution> {
  if (typeof Worker === 'undefined') {
    return unavailableWorkerProbe()
  }

  if (!workerScriptUrl) {
    return {
      worker: {
        classicSupported: true,
        packagedUrlResolved: false,
        startupSupported: false,
        messagingSupported: false,
      },
    }
  }

  let resolvedUrl: string

  try {
    resolvedUrl =
      typeof document === 'undefined'
        ? workerScriptUrl
        : new URL(workerScriptUrl, document.baseURI).toString()
  } catch {
    return {
      worker: {
        classicSupported: true,
        packagedUrlResolved: false,
        startupSupported: false,
        messagingSupported: false,
      },
    }
  }

  let worker: Worker

  try {
    worker = new Worker(resolvedUrl)
  } catch {
    return {
      worker: {
        classicSupported: true,
        packagedUrlResolved: true,
        startupSupported: false,
        messagingSupported: false,
      },
    }
  }

  const startedAt = now()
  const requestId = `probe-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const databaseName = `nova-play-worker-capability-probe-${Date.now()}`

  try {
    const result = await new Promise<WorkerProbeResult>((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        reject(new Error('Capability probe worker timed out.'))
      }, WORKER_TIMEOUT_MS)

      worker.onmessage = (event: MessageEvent<unknown>) => {
        const response = event.data as {
          type?: unknown
          requestId?: unknown
          result?: WorkerProbeResult
        }

        if (
          response.type === 'nova-library-capability-probe-result' &&
          response.requestId === requestId &&
          response.result
        ) {
          globalThis.clearTimeout(timeout)
          resolve(response.result)
        }
      }
      worker.onerror = () => {
        globalThis.clearTimeout(timeout)
        reject(new Error('Capability probe worker failed to start.'))
      }
      worker.postMessage({
        type: 'nova-library-capability-probe',
        requestId,
        databaseName,
        recordCount,
        batchSize,
      })
    })

    return {
      worker: {
        classicSupported: true,
        packagedUrlResolved: true,
        startupSupported: true,
        messagingSupported: true,
      },
      result,
      measurement: {
        schemaVersion: 1,
        operation: 'worker-message',
        runner: 'main',
        success: true,
        durationMs: now() - startedAt,
      },
    }
  } catch {
    return {
      worker: {
        classicSupported: true,
        packagedUrlResolved: true,
        startupSupported: false,
        messagingSupported: false,
      },
      measurement: {
        schemaVersion: 1,
        operation: 'worker-message',
        runner: 'main',
        success: false,
        durationMs: now() - startedAt,
        errorCode: 'unknown',
      },
    }
  } finally {
    worker.terminate()
  }
}

function unavailableWorkerProbe(): WorkerProbeExecution {
  return {
    worker: {
      classicSupported: false,
      packagedUrlResolved: false,
      startupSupported: false,
      messagingSupported: false,
    },
  }
}

function createRecords(count: number): CapabilityProbeRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    schemaVersion: 1,
    id: `probe-${index}`,
    token: `token-${index % 5}`,
    group: Math.floor(index / 10),
    sequence: index,
    payload: `probe-record-${index}`,
    estimatedBytes: 64,
  }))
}

async function probeStorage(): Promise<CapabilityProbeReport['storage']> {
  const manager =
    typeof navigator !== 'undefined' && 'storage' in navigator ? navigator.storage : undefined
  const estimateSupported = Boolean(manager && typeof manager.estimate === 'function')
  const persistSupported = Boolean(manager && typeof manager.persist === 'function')

  if (!manager) {
    return { estimateSupported, persistSupported }
  }

  let quotaBytes: number | undefined
  let usageBytes: number | undefined
  let persistenceGranted: boolean | undefined

  if (estimateSupported) {
    try {
      const estimate = await manager.estimate()
      quotaBytes = estimate.quota
      usageBytes = estimate.usage
    } catch {
      // Capability reports record unsupported/unavailable storage without failing
      // the independent IndexedDB result.
    }
  }

  if (persistSupported) {
    try {
      persistenceGranted = await manager.persist()
    } catch {
      // Permission can be unavailable on packaged webOS builds.
    }
  }

  return {
    estimateSupported,
    persistSupported,
    quotaBytes,
    usageBytes,
    persistenceGranted,
  }
}

function validPositiveIntegers(values: number[]): number[] {
  const valid = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.floor(value))

  return valid.length ? valid : [1]
}

function yieldProbeBatch(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0)
  })
}

function percentile(values: number[], percentileValue: number): number | undefined {
  if (!values.length) {
    return undefined
  }

  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  )

  return sorted[index]
}

function uniqueWarnings(warnings: CapabilityWarningCode[]): CapabilityWarningCode[] {
  return [...new Set(warnings)]
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}