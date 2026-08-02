import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import {
  runLibraryCapabilityProbe,
  recommendLibraryRunner,
} from './capability-probe'
import type {
  CapabilityProbeRecord,
  CapabilityProbeReport,
} from './capability-types'
import {
  deleteProbeDatabase,
  iterateProbeCursor,
  openProbeDatabase,
  queryProbeCompoundKey,
  queryProbeIndex,
  readProbeKeys,
  writeProbeBatch,
} from './idb-probe'

let database: IDBDatabase | undefined
let databaseName = ''

beforeEach(() => {
  databaseName = `nova-play-capability-test-${Date.now()}-${Math.random()}`
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
})

afterEach(async () => {
  database?.close()
  database = undefined
  await deleteProbeDatabase(databaseName)
  vi.unstubAllGlobals()
})

describe('library IndexedDB capability probe', () => {
  it('creates a disposable schema with indexed, compound-key, and cursor reads', async () => {
    database = await openProbeDatabase(databaseName)
    const records = probeRecords(4)

    expect(await writeProbeBatch(database, records, 2)).toMatchObject({
      operation: 'write',
      success: true,
      recordCount: 4,
    })
    expect(await readProbeKeys(database, 4)).toMatchObject({
      operation: 'read',
      success: true,
      recordCount: 4,
    })
    expect(await queryProbeIndex(database, 'token-0')).toMatchObject({
      operation: 'index-query',
      success: true,
      recordCount: 2,
    })
    expect(await queryProbeCompoundKey(database, 0, 2)).toMatchObject({
      operation: 'compound-key-query',
      success: true,
      recordCount: 1,
    })
    expect(await iterateProbeCursor(database)).toMatchObject({
      operation: 'cursor-scan',
      success: true,
      recordCount: 4,
    })
  })

  it('aborts a pending probe write without committing records', async () => {
    database = await openProbeDatabase(databaseName)
    const controller = new AbortController()

    controller.abort()

    await expect(writeProbeBatch(database, probeRecords(3), 3, controller.signal)).resolves.toMatchObject({
      operation: 'write',
      success: false,
      errorCode: 'cancelled',
    })
    await expect(readProbeKeys(database, 0)).resolves.toMatchObject({
      operation: 'read',
      success: true,
      recordCount: 0,
    })
  })

  it('aggregates a main-thread capability report and removes its temporary database', async () => {
    const report = await runLibraryCapabilityProbe({
      databaseName,
      recordCounts: [6],
      batchSizes: [2, 4],
      cleanup: true,
    })

    expect(report.indexedDb).toMatchObject({
      mainThreadSupported: true,
      indexesSupported: true,
      cursorsSupported: true,
      compoundKeysSupported: true,
    })
    expect(report.recommendation).toBe('cooperative-main')
    expect(report.measurements.filter((measurement) => measurement.success)).not.toHaveLength(0)

    database = await openProbeDatabase(databaseName)
    await expect(readProbeKeys(database, 0)).resolves.toMatchObject({
      operation: 'read',
      success: true,
      recordCount: 0,
    })
  })

  it('records a relaunch persistence check without rewriting the existing probe data', async () => {
    const firstRun = await runLibraryCapabilityProbe({
      databaseName,
      recordCounts: [5],
      batchSizes: [5],
      cleanup: false,
    })

    expect(firstRun.indexedDb.mainThreadSupported).toBe(true)

    const relaunchedRun = await runLibraryCapabilityProbe({
      databaseName,
      persistenceExpectedRecordCount: 5,
      recordCounts: [5],
      batchSizes: [5],
      cleanup: true,
    })

    expect(relaunchedRun.indexedDb.persistsAcrossRelaunch).toBe('yes')
  })

  it('stops a capability run cleanly when its cancellation signal is already aborted', async () => {
    const controller = new AbortController()

    controller.abort()

    const report = await runLibraryCapabilityProbe({
      databaseName,
      recordCounts: [100],
      batchSizes: [25],
      signal: controller.signal,
    })

    expect(report.measurements).toContainEqual(
      expect.objectContaining({
        operation: 'write',
        success: false,
        errorCode: 'cancelled',
      }),
    )
    expect(report.measurements.some((measurement) => measurement.operation === 'cursor-scan')).toBe(
      false,
    )
  })

  it('records a successful classic worker round trip separately from main-thread IndexedDB', async () => {
    class ProbeWorker {
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null
      onerror: (() => void) | null = null

      constructor(_url: string) {}

      postMessage(message: { requestId: string }): void {
        queueMicrotask(() => {
          this.onmessage?.({
            data: {
              type: 'nova-library-capability-probe-result',
              requestId: message.requestId,
              result: {
                indexedDbSupported: true,
                indexesSupported: true,
                cursorsSupported: true,
                compoundKeysSupported: true,
                measurements: [],
              },
            },
          } as MessageEvent<unknown>)
        })
      }

      terminate(): void {}
    }

    vi.stubGlobal('Worker', ProbeWorker)
    const report = await runLibraryCapabilityProbe({
      databaseName,
      recordCounts: [4],
      batchSizes: [2],
      testWorkerIndexedDb: true,
      workerScriptUrl: './library-capability-worker.js',
    })

    expect(report.worker).toEqual({
      classicSupported: true,
      packagedUrlResolved: true,
      startupSupported: true,
      messagingSupported: true,
    })
    expect(report.indexedDb.workerSupported).toBe(true)
    expect(report.recommendation).toBe('worker-idb')
  })

  it('selects no-go deterministically when complete main-thread evidence is absent', () => {
    const report: CapabilityProbeReport = {
      schemaVersion: 1,
      device: { userAgent: '', webOsRuntime: false },
      worker: {
        classicSupported: true,
        packagedUrlResolved: true,
        startupSupported: true,
        messagingSupported: true,
      },
      indexedDb: {
        mainThreadSupported: true,
        workerSupported: true,
        persistsAcrossRelaunch: 'unknown',
        indexesSupported: false,
        cursorsSupported: true,
        compoundKeysSupported: true,
      },
      cooperativeMain: { tested: true, supported: true },
      storage: { estimateSupported: false, persistSupported: false },
      measurements: [],
      recommendation: 'cooperative-main',
      warnings: [],
    }

    expect(recommendLibraryRunner(report)).toBe('no-go')
  })
})

function probeRecords(count: number): CapabilityProbeRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    schemaVersion: 1,
    id: `probe-${index}`,
    token: `token-${index % 2}`,
    group: 0,
    sequence: index,
    payload: `record-${index}`,
    estimatedBytes: 32,
  }))
}