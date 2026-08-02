import type {
  CapabilityMeasurement,
  CapabilityProbeRecord,
} from './capability-types'

const PROBE_STORE = 'probeRecords'
const TOKEN_INDEX = 'byToken'
const GROUP_SEQUENCE_INDEX = 'byGroupSequence'

export function indexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined' && typeof indexedDB.open === 'function'
}

export function openProbeDatabase(name: string, version = 1): Promise<IDBDatabase> {
  if (!indexedDbAvailable()) {
    return Promise.reject(new Error('IndexedDB is unavailable.'))
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, version)

    request.onupgradeneeded = () => {
      const database = request.result
      const store = database.objectStoreNames.contains(PROBE_STORE)
        ? request.transaction!.objectStore(PROBE_STORE)
        : database.createObjectStore(PROBE_STORE, { keyPath: 'id' })

      if (!store.indexNames.contains(TOKEN_INDEX)) {
        store.createIndex(TOKEN_INDEX, 'token', { unique: false })
      }

      if (!store.indexNames.contains(GROUP_SEQUENCE_INDEX)) {
        store.createIndex(GROUP_SEQUENCE_INDEX, ['group', 'sequence'], { unique: true })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open the probe database.'))
    request.onblocked = () => reject(new Error('Opening the probe database was blocked.'))
  })
}

export function deleteProbeDatabase(name: string): Promise<void> {
  if (!indexedDbAvailable()) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('Unable to delete the probe database.'))
    request.onblocked = () => reject(new Error('Deleting the probe database was blocked.'))
  })
}

export async function writeProbeBatch(
  database: IDBDatabase,
  records: CapabilityProbeRecord[],
  batchSize: number,
  signal?: AbortSignal,
): Promise<CapabilityMeasurement> {
  const startedAt = now()
  const safeBatchSize = Math.max(1, Math.floor(batchSize))

  try {
    for (let offset = 0; offset < records.length; offset += safeBatchSize) {
      if (signal?.aborted) {
        throw new Error('Probe write cancelled.')
      }

      const transaction = database.transaction(PROBE_STORE, 'readwrite')
      const store = transaction.objectStore(PROBE_STORE)
      const abortTransaction = (): void => transaction.abort()

      signal?.addEventListener('abort', abortTransaction, { once: true })

      try {
        records.slice(offset, offset + safeBatchSize).forEach((record) => {
          store.put(record)
        })

        await transactionComplete(transaction)
      } finally {
        signal?.removeEventListener('abort', abortTransaction)
      }
    }

    return measurement('write', startedAt, true, {
      recordCount: records.length,
      batchSize: safeBatchSize,
    })
  } catch {
    return measurement('write', startedAt, false, {
      recordCount: records.length,
      batchSize: safeBatchSize,
      errorCode: signal?.aborted ? 'cancelled' : 'database',
    })
  }
}

export async function readProbeKeys(
  database: IDBDatabase,
  expectedCount: number,
): Promise<CapabilityMeasurement> {
  const startedAt = now()

  try {
    const transaction = database.transaction(PROBE_STORE, 'readonly')
    const complete = transactionComplete(transaction)
    const count = await countCursor(transaction.objectStore(PROBE_STORE))
    await complete

    return measurement('read', startedAt, count === expectedCount, {
      recordCount: count,
      errorCode: count === expectedCount ? undefined : 'database',
    })
  } catch {
    return measurement('read', startedAt, false, { errorCode: 'database' })
  }
}

export async function queryProbeIndex(
  database: IDBDatabase,
  token: string,
): Promise<CapabilityMeasurement> {
  const startedAt = now()

  try {
    const transaction = database.transaction(PROBE_STORE, 'readonly')
    const complete = transactionComplete(transaction)
    const index = transaction.objectStore(PROBE_STORE).index(TOKEN_INDEX)
    const count = await countCursor(index, IDBKeyRange.only(token))
    await complete

    return measurement('index-query', startedAt, true, { recordCount: count })
  } catch {
    return measurement('index-query', startedAt, false, { errorCode: 'database' })
  }
}

export async function queryProbeCompoundKey(
  database: IDBDatabase,
  group: number,
  sequence: number,
): Promise<CapabilityMeasurement> {
  const startedAt = now()

  try {
    const transaction = database.transaction(PROBE_STORE, 'readonly')
    const complete = transactionComplete(transaction)
    const index = transaction.objectStore(PROBE_STORE).index(GROUP_SEQUENCE_INDEX)
    const result = await requestResult(index.get([group, sequence]))
    await complete

    return measurement('compound-key-query', startedAt, Boolean(result), {
      recordCount: result ? 1 : 0,
      errorCode: result ? undefined : 'database',
    })
  } catch {
    return measurement('compound-key-query', startedAt, false, { errorCode: 'database' })
  }
}

export async function iterateProbeCursor(
  database: IDBDatabase,
): Promise<CapabilityMeasurement> {
  const startedAt = now()

  try {
    const transaction = database.transaction(PROBE_STORE, 'readonly')
    const complete = transactionComplete(transaction)
    const count = await countCursor(transaction.objectStore(PROBE_STORE))
    await complete
    return measurement('cursor-scan', startedAt, true, { recordCount: count })
  } catch {
    return measurement('cursor-scan', startedAt, false, { errorCode: 'database' })
  }
}

function countCursor(
  source: IDBObjectStore | IDBIndex,
  query?: IDBValidKey | IDBKeyRange,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let count = 0
    const request = source.openCursor(query)

    request.onerror = () => reject(request.error ?? new Error('Cursor iteration failed.'))
    request.onsuccess = () => {
      const cursor = request.result

      if (!cursor) {
        resolve(count)
        return
      }

      count += 1
      cursor.continue()
    }
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
  })
}

function measurement(
  operation: CapabilityMeasurement['operation'],
  startedAt: number,
  success: boolean,
  details: Omit<CapabilityMeasurement, 'schemaVersion' | 'operation' | 'runner' | 'success' | 'durationMs'>,
): CapabilityMeasurement {
  return {
    schemaVersion: 1,
    operation,
    runner: 'main',
    success,
    durationMs: now() - startedAt,
    ...details,
  }
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}