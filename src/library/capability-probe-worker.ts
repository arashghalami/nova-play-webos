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
import type {
  CapabilityProbeRecord,
  WorkerProbeResult,
} from './capability-types'

type ProbeWorkerRequest = {
  type: 'nova-library-capability-probe'
  requestId: string
  databaseName: string
  recordCount: number
  batchSize: number
}

type ProbeWorkerResponse = {
  type: 'nova-library-capability-probe-result'
  requestId: string
  result: WorkerProbeResult
}

type WorkerScope = {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<ProbeWorkerRequest>) => void,
  ): void
  postMessage(message: ProbeWorkerResponse): void
}

const workerScope = self as unknown as WorkerScope

workerScope.addEventListener('message', (event) => {
  if (event.data?.type !== 'nova-library-capability-probe') {
    return
  }

  void runWorkerProbe(event.data).then((result) => {
    workerScope.postMessage({
      type: 'nova-library-capability-probe-result',
      requestId: event.data.requestId,
      result,
    })
  })
})

async function runWorkerProbe(request: ProbeWorkerRequest): Promise<WorkerProbeResult> {
  const measurements: WorkerProbeResult['measurements'] = []

  if (!indexedDbAvailable()) {
    return {
      indexedDbSupported: false,
      indexesSupported: false,
      cursorsSupported: false,
      compoundKeysSupported: false,
      measurements,
    }
  }

  let database: IDBDatabase | undefined

  try {
    database = await openProbeDatabase(request.databaseName)
    const records = createRecords(request.recordCount)
    measurements.push(await writeProbeBatch(database, records, request.batchSize))
    measurements.push(await readProbeKeys(database, records.length))
    measurements.push(await queryProbeIndex(database, records[0]?.token ?? 'token-0'))
    measurements.push(
      await queryProbeCompoundKey(
        database,
        records[0]?.group ?? 0,
        records[0]?.sequence ?? 0,
      ),
    )
    measurements.push(await iterateProbeCursor(database))

    return {
      indexedDbSupported: measurements.every((measurement) => measurement.success),
      indexesSupported: measurements.some(
        (measurement) => measurement.operation === 'index-query' && measurement.success,
      ),
      cursorsSupported: measurements.some(
        (measurement) => measurement.operation === 'cursor-scan' && measurement.success,
      ),
      compoundKeysSupported: measurements.some(
        (measurement) => measurement.operation === 'compound-key-query' && measurement.success,
      ),
      measurements: measurements.map((measurement) => ({
        ...measurement,
        runner: 'worker',
      })),
    }
  } catch {
    return {
      indexedDbSupported: false,
      indexesSupported: false,
      cursorsSupported: false,
      compoundKeysSupported: false,
      measurements: measurements.map((measurement) => ({
        ...measurement,
        runner: 'worker',
      })),
    }
  } finally {
    database?.close()

    try {
      await deleteProbeDatabase(request.databaseName)
    } catch {
      // The caller records worker availability independently of disposable
      // database cleanup, which can be retried during the next probe run.
    }
  }
}

function createRecords(count: number): CapabilityProbeRecord[] {
  return Array.from({ length: Math.max(1, count) }, (_, index) => ({
    schemaVersion: 1,
    id: `worker-probe-${index}`,
    token: `token-${index % 5}`,
    group: Math.floor(index / 10),
    sequence: index,
    payload: `worker-probe-record-${index}`,
    estimatedBytes: 64,
  }))
}