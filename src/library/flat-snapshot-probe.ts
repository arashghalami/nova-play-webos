import type {
  CapabilityMeasurement,
  FlatSnapshotPlaybackMode,
  FlatSnapshotPlaybackStartupReport,
  FlatSnapshotProbeOptions,
  FlatSnapshotProbeReport,
  FlatSnapshotRecoveryReport,
} from './capability-types'

const SNAPSHOT_STORE = 'categorySnapshots'
const RUN_STORE = 'snapshotProbeRuns'
const RUN_INDEX = 'byRunId'
const DEFAULT_SNAPSHOT_COUNT = 200
const DEFAULT_ITEMS_PER_SNAPSHOT = 300
const TARGET_PAYLOAD_BYTES = 50 * 1024
const WARMUP_UNIT_COUNT = 5

let playbackStartup: FlatSnapshotPlaybackStartupReport = {
  mode: 'baseline',
  state: 'idle',
}
let playbackStartupStartedAt: number | undefined

type SnapshotProbeRun = {
  id: string
  state: 'writing' | 'complete'
  expectedSnapshotCount: number
  itemsPerSnapshot: number
  writesCompleted: number
}

type SnapshotRecord = {
  id: string
  runId: string
  sequence: number
  payload: string
}

type SnapshotWriteResult = {
  measurement: CapabilityMeasurement
  eventLoopTurnMs?: number
}

export function armFlatSnapshotPlaybackStartup(
  mode: FlatSnapshotPlaybackMode,
): FlatSnapshotPlaybackStartupReport {
  playbackStartup = { mode, state: 'armed' }
  playbackStartupStartedAt = undefined
  return snapshotFlatSnapshotPlaybackStartup()
}

export function markFlatSnapshotPlaybackStarting(): FlatSnapshotPlaybackStartupReport {
  if (playbackStartup.state !== 'armed') {
    return snapshotFlatSnapshotPlaybackStartup()
  }

  playbackStartup = { ...playbackStartup, state: 'starting' }
  playbackStartupStartedAt = now()
  return snapshotFlatSnapshotPlaybackStartup()
}

export function markFlatSnapshotPlaybackReady(): FlatSnapshotPlaybackStartupReport {
  if (playbackStartup.state !== 'starting' || playbackStartupStartedAt === undefined) {
    return snapshotFlatSnapshotPlaybackStartup()
  }

  playbackStartup = {
    ...playbackStartup,
    state: 'ready',
    durationMs: now() - playbackStartupStartedAt,
  }
  return snapshotFlatSnapshotPlaybackStartup()
}

export function markFlatSnapshotPlaybackFailed(): FlatSnapshotPlaybackStartupReport {
  if (playbackStartup.state !== 'starting') {
    return snapshotFlatSnapshotPlaybackStartup()
  }

  playbackStartup = {
    ...playbackStartup,
    state: 'failed',
    durationMs:
      playbackStartupStartedAt === undefined ? undefined : now() - playbackStartupStartedAt,
  }
  return snapshotFlatSnapshotPlaybackStartup()
}

export function resetFlatSnapshotPlaybackStartup(): void {
  playbackStartup = { mode: 'baseline', state: 'idle' }
  playbackStartupStartedAt = undefined
}

export function snapshotFlatSnapshotPlaybackStartup(): FlatSnapshotPlaybackStartupReport {
  return { ...playbackStartup }
}

export async function runFlatSnapshotProbe(
  options: FlatSnapshotProbeOptions = {},
): Promise<FlatSnapshotProbeReport> {
  const databaseName = options.databaseName ?? `nova-play-flat-snapshot-probe-${Date.now()}`
  const runId = options.runId ?? `run-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const snapshotCount = positiveInteger(options.snapshotCount, DEFAULT_SNAPSHOT_COUNT)
  const itemsPerSnapshot = positiveInteger(options.itemsPerSnapshot, DEFAULT_ITEMS_PER_SNAPSHOT)
  const targetPayloadBytes = positiveInteger(options.targetPayloadBytes, TARGET_PAYLOAD_BYTES)
  const interUnitDelayMs = nonNegativeInteger(options.interUnitDelayMs, 0)
  const measurements: CapabilityMeasurement[] = []
  const writeDurations: number[] = []
  const unitDurations: number[] = []
  const preYieldSliceDurations: number[] = []
  const serializeDurations: number[] = []
  const eventLoopTurnDurations: number[] = []
  const yieldDelays: number[] = []
  const startedAt = now()
  let writeFinishedAt = startedAt
  let writesCompleted = 0
  let cancelled = false
  let cancellationRequestedAt = options.signal?.aborted ? startedAt : undefined
  let cancellationAcknowledgedAt: number | undefined
  let database: IDBDatabase | undefined
  const captureCancellationRequest = (): void => {
    cancellationRequestedAt ??= now()
  }

  options.signal?.addEventListener('abort', captureCancellationRequest, { once: true })

  try {
    database = await openFlatSnapshotDatabase(databaseName)
    await createRun(database, {
      id: runId,
      state: 'writing',
      expectedSnapshotCount: snapshotCount,
      itemsPerSnapshot,
      writesCompleted: 0,
    })

    for (let sequence = 0; sequence < snapshotCount; sequence += 1) {
      if (options.signal?.aborted) {
        cancelled = true
        cancellationAcknowledgedAt ??= now()
        break
      }

      const unitStartedAt = now()
      const serializationTurn = nextEventLoopTurn()
      const serializeStartedAt = now()
      const payload = JSON.stringify(
        createCategorySnapshot(sequence, itemsPerSnapshot, targetPayloadBytes),
      )
      const serializeDuration = now() - serializeStartedAt
      await serializationTurn
      serializeDurations.push(serializeDuration)
      measurements.push(
        measurement(
          'snapshot-serialize',
          serializeDuration,
          true,
          itemsPerSnapshot,
          1,
          payload.length,
        ),
      )

      const writeResult = await writeSnapshot(
        database,
        {
          id: `${runId}:${sequence}`,
          runId,
          sequence,
          payload,
        },
        snapshotCount,
        itemsPerSnapshot,
        sequence + 1,
        options.signal,
      )
      const write = writeResult.measurement
      measurements.push(write)

      if (writeResult.eventLoopTurnMs !== undefined) {
        eventLoopTurnDurations.push(writeResult.eventLoopTurnMs)
        measurements.push(
          measurement(
            'cooperative-slice',
            writeResult.eventLoopTurnMs,
            true,
            itemsPerSnapshot,
            1,
            payload.length,
          ),
        )
      }

      if (!write.success) {
        cancelled = write.errorCode === 'cancelled' || Boolean(options.signal?.aborted)

        if (cancelled) {
          cancellationAcknowledgedAt ??= now()
        }

        break
      }

      writesCompleted += 1
      options.onSnapshotCommitted?.(writesCompleted)

      if (options.signal?.aborted) {
        cancelled = true
        cancellationAcknowledgedAt ??= now()
        break
      }

      writeDurations.push(write.durationMs)
      preYieldSliceDurations.push(now() - unitStartedAt)
      const yieldDelay = await yieldToMain(interUnitDelayMs)
      yieldDelays.push(yieldDelay)
      measurements.push(measurement('cooperative-yield', yieldDelay, true, 1, 1))
      unitDurations.push(now() - unitStartedAt)
    }

    if (!cancelled && writesCompleted === snapshotCount) {
      await completeRun(database, runId)
    }

    writeFinishedAt = now()
    const read =
      writesCompleted > 0
        ? await readAndParseSnapshot(database, `${runId}:${Math.floor((writesCompleted - 1) / 2)}`)
        : undefined

    if (read) {
      measurements.push(read.retrieval)
      measurements.push(read.parse)
    }

    const recoveryStartedAt = now()
    const recovery = await inspectFlatSnapshotRecovery(databaseName, runId, database)
    measurements.push(
      measurement(
        'snapshot-recovery',
        now() - recoveryStartedAt,
        recovery.atomicityPreserved,
        recovery.retainedSnapshotCount,
        1,
      ),
    )
    const averagePayloadBytes =
      writesCompleted > 0
        ? Math.round(
            measurements
              .filter((item) => item.operation === 'snapshot-write' && item.success)
              .reduce((total, item) => total + (item.payloadBytes ?? 0), 0) / writesCompleted,
          )
        : 0
    const warmupWrites = writeDurations.slice(0, WARMUP_UNIT_COUNT)
    const steadyStateWrites = writeDurations.slice(WARMUP_UNIT_COUNT)

    return {
      schemaVersion: 1,
      databaseName,
      runId,
      snapshotCount,
      itemsPerSnapshot,
      targetPayloadBytes,
      averagePayloadBytes,
      writesCompleted,
      writeTotalMs: writeFinishedAt - startedAt,
      p95PutMs: percentile(writeDurations, 95),
      worstPutMs: maximum(writeDurations),
      p95UnitMs: percentile(unitDurations, 95),
      worstUnitMs: maximum(unitDurations),
      p95PreYieldSliceMs: percentile(preYieldSliceDurations, 95),
      worstPreYieldSliceMs: maximum(preYieldSliceDurations),
      p95SerializeMs: percentile(serializeDurations, 95),
      worstSerializeMs: maximum(serializeDurations),
      p95EventLoopTurnMs: percentile(eventLoopTurnDurations, 95),
      worstEventLoopTurnMs: maximum(eventLoopTurnDurations),
      firstPutMs: writeDurations[0],
      warmupUnitCount: warmupWrites.length,
      warmupP95PutMs: percentile(warmupWrites, 95),
      steadyStateP50PutMs: percentile(steadyStateWrites, 50),
      steadyStateP95PutMs: percentile(steadyStateWrites, 95),
      worstYieldDelayMs: maximum(yieldDelays),
      cancellationAckMs:
        cancelled &&
        cancellationRequestedAt !== undefined &&
        cancellationAcknowledgedAt !== undefined
          ? cancellationAcknowledgedAt - cancellationRequestedAt
          : undefined,
      playbackStartup: snapshotFlatSnapshotPlaybackStartup(),
      read: read
        ? {
            retrievalMs: read.retrieval.durationMs,
            parseMs: read.parse.durationMs,
            itemCount: read.itemCount,
            success: read.retrieval.success && read.parse.success,
          }
        : undefined,
      recovery,
      measurements,
      cancelled,
    }
  } finally {
    options.signal?.removeEventListener('abort', captureCancellationRequest)
    database?.close()

    if (options.cleanup) {
      await deleteFlatSnapshotDatabase(databaseName)
    }
  }
}

export async function inspectFlatSnapshotRecovery(
  databaseName: string,
  runId: string,
  existingDatabase?: IDBDatabase,
): Promise<FlatSnapshotRecoveryReport> {
  const database = existingDatabase ?? (await openFlatSnapshotDatabase(databaseName))
  const shouldClose = !existingDatabase

  try {
    const run = await readRun(database, runId)

    if (!run) {
      return {
        runId,
        state: 'writing',
        expectedSnapshotCount: 0,
        candidateSnapshotCount: 0,
        retainedSnapshotCount: 0,
        invalidSnapshotCount: 0,
        atomicityPreserved: false,
      }
    }

    const snapshots = await readSnapshotsForRun(database, runId)
    const orderedSnapshots = [...snapshots].sort((left, right) => left.sequence - right.sequence)
    const validSnapshots = orderedSnapshots.filter((snapshot) =>
      isValidSnapshot(snapshot, run.itemsPerSnapshot),
    )
    const invalidSnapshotCount = snapshots.length - validSnapshots.length
    const candidateSnapshotCount = snapshots.length
    const sequenceCoverageIsContiguous = validSnapshots.every(
      (snapshot, index) => snapshot.sequence === index,
    )
    const countMatchesState =
      run.state === 'complete'
        ? candidateSnapshotCount === run.expectedSnapshotCount &&
          run.writesCompleted === run.expectedSnapshotCount
        : candidateSnapshotCount === run.writesCompleted &&
          run.writesCompleted <= run.expectedSnapshotCount

    return {
      runId,
      state: run.state,
      expectedSnapshotCount: run.expectedSnapshotCount,
      candidateSnapshotCount,
      retainedSnapshotCount: validSnapshots.length,
      invalidSnapshotCount,
      atomicityPreserved:
        countMatchesState &&
        validSnapshots.length === run.writesCompleted &&
        sequenceCoverageIsContiguous &&
        invalidSnapshotCount === 0,
    }
  } finally {
    if (shouldClose) {
      database.close()
    }
  }
}

export async function deleteFlatSnapshotDatabase(databaseName: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName)
    request.onsuccess = () => resolve()
    request.onerror = () =>
      reject(request.error ?? new Error('Unable to delete the flat snapshot probe database.'))
    request.onblocked = () => reject(new Error('Deleting the flat snapshot probe database was blocked.'))
  })
}

function openFlatSnapshotDatabase(name: string): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.open !== 'function') {
    return Promise.reject(new Error('IndexedDB is unavailable.'))
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1)

    request.onupgradeneeded = () => {
      const database = request.result
      const snapshots = database.objectStoreNames.contains(SNAPSHOT_STORE)
        ? request.transaction!.objectStore(SNAPSHOT_STORE)
        : database.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' })

      if (!snapshots.indexNames.contains(RUN_INDEX)) {
        snapshots.createIndex(RUN_INDEX, 'runId', { unique: false })
      }

      if (!database.objectStoreNames.contains(RUN_STORE)) {
        database.createObjectStore(RUN_STORE, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Unable to open the flat snapshot probe database.'))
    request.onblocked = () => reject(new Error('Opening the flat snapshot probe database was blocked.'))
  })
}

async function createRun(database: IDBDatabase, run: SnapshotProbeRun): Promise<void> {
  const transaction = database.transaction(RUN_STORE, 'readwrite')
  const complete = transactionComplete(transaction)
  transaction.objectStore(RUN_STORE).put(run)
  await complete
}

async function writeSnapshot(
  database: IDBDatabase,
  snapshot: SnapshotRecord,
  snapshotCount: number,
  itemsPerSnapshot: number,
  writesCompleted: number,
  signal?: AbortSignal,
): Promise<SnapshotWriteResult> {
  const startedAt = now()

  try {
    if (signal?.aborted) {
      throw new Error('Snapshot probe write cancelled.')
    }

    const transaction = database.transaction([SNAPSHOT_STORE, RUN_STORE], 'readwrite')
    const complete = transactionComplete(transaction)
    const abortTransaction = (): void => transaction.abort()
    signal?.addEventListener('abort', abortTransaction, { once: true })

    try {
      transaction.objectStore(SNAPSHOT_STORE).put(snapshot)
      transaction.objectStore(RUN_STORE).put({
        id: snapshot.runId,
        state: 'writing',
        expectedSnapshotCount: snapshotCount,
        itemsPerSnapshot,
        writesCompleted,
      } satisfies SnapshotProbeRun)
      const eventLoopTurn = nextEventLoopTurn()
      await complete

      return {
        measurement: measurement(
          'snapshot-write',
          now() - startedAt,
          true,
          itemsPerSnapshot,
          1,
          snapshot.payload.length,
        ),
        eventLoopTurnMs: await eventLoopTurn,
      }
    } finally {
      signal?.removeEventListener('abort', abortTransaction)
    }
  } catch {
    return {
      measurement: measurement(
        'snapshot-write',
        now() - startedAt,
        false,
        itemsPerSnapshot,
        1,
        snapshot.payload.length,
        {
          errorCode: signal?.aborted ? 'cancelled' : 'database',
        },
      ),
    }
  }
}

async function completeRun(database: IDBDatabase, runId: string): Promise<void> {
  const existing = await readRun(database, runId)

  if (!existing) {
    throw new Error('The flat snapshot probe run was not found.')
  }

  const transaction = database.transaction(RUN_STORE, 'readwrite')
  const complete = transactionComplete(transaction)
  transaction.objectStore(RUN_STORE).put({ ...existing, state: 'complete' } satisfies SnapshotProbeRun)
  await complete
}

async function readAndParseSnapshot(
  database: IDBDatabase,
  snapshotId: string,
): Promise<{
  retrieval: CapabilityMeasurement
  parse: CapabilityMeasurement
  itemCount: number
}> {
  const retrievalStartedAt = now()
  let snapshot: SnapshotRecord | undefined

  try {
    const transaction = database.transaction(SNAPSHOT_STORE, 'readonly')
    const complete = transactionComplete(transaction)
    snapshot = (await requestResult(
      transaction.objectStore(SNAPSHOT_STORE).get(snapshotId),
    )) as SnapshotRecord | undefined
    await complete
  } catch {
    return {
      retrieval: measurement('snapshot-read', now() - retrievalStartedAt, false, 0, 1, 0, {
        errorCode: 'database',
      }),
      parse: measurement('snapshot-parse', 0, false, 0, 1, 0, { errorCode: 'database' }),
      itemCount: 0,
    }
  }

  const retrieval = measurement(
    'snapshot-read',
    now() - retrievalStartedAt,
    Boolean(snapshot),
    1,
    1,
    snapshot?.payload.length ?? 0,
    {
      errorCode: snapshot ? undefined : 'database',
    },
  )
  const parseStartedAt = now()

  try {
    const items: unknown = JSON.parse(snapshot?.payload ?? '')
    const itemCount = Array.isArray(items) ? items.length : 0

    return {
      retrieval,
      parse: measurement(
        'snapshot-parse',
        now() - parseStartedAt,
        Array.isArray(items),
        itemCount,
        1,
        snapshot?.payload.length ?? 0,
        {
          errorCode: Array.isArray(items) ? undefined : 'database',
        },
      ),
      itemCount,
    }
  } catch {
    return {
      retrieval,
      parse: measurement(
        'snapshot-parse',
        now() - parseStartedAt,
        false,
        0,
        1,
        snapshot?.payload.length ?? 0,
        {
          errorCode: 'database',
        },
      ),
      itemCount: 0,
    }
  }
}

async function readRun(database: IDBDatabase, runId: string): Promise<SnapshotProbeRun | undefined> {
  const transaction = database.transaction(RUN_STORE, 'readonly')
  const complete = transactionComplete(transaction)
  const run = (await requestResult(
    transaction.objectStore(RUN_STORE).get(runId),
  )) as SnapshotProbeRun | undefined
  await complete
  return run
}

async function readSnapshotsForRun(
  database: IDBDatabase,
  runId: string,
): Promise<SnapshotRecord[]> {
  const transaction = database.transaction(SNAPSHOT_STORE, 'readonly')
  const complete = transactionComplete(transaction)
  const index = transaction.objectStore(SNAPSHOT_STORE).index(RUN_INDEX)
  const snapshots = await new Promise<SnapshotRecord[]>((resolve, reject) => {
    const result: SnapshotRecord[] = []
    const request = index.openCursor(IDBKeyRange.only(runId))

    request.onerror = () => reject(request.error ?? new Error('Reading flat snapshots failed.'))
    request.onsuccess = () => {
      const cursor = request.result

      if (!cursor) {
        resolve(result)
        return
      }

      result.push(cursor.value as SnapshotRecord)
      cursor.continue()
    }
  })
  await complete
  return snapshots
}

function isValidSnapshot(snapshot: SnapshotRecord, itemsPerSnapshot: number): boolean {
  try {
    const items: unknown = JSON.parse(snapshot.payload)
    return Array.isArray(items) && items.length === itemsPerSnapshot
  } catch {
    return false
  }
}

function createCategorySnapshot(
  snapshotIndex: number,
  itemCount: number,
  targetPayloadBytes: number,
): Array<Record<string, string>> {
  const items = Array.from({ length: itemCount }, (_, itemIndex) => ({
    id: `synthetic-${snapshotIndex}-${itemIndex}`,
    title: `Synthetic catalog item ${snapshotIndex}-${itemIndex}`,
    categoryId: `category-${snapshotIndex}`,
    section: snapshotIndex % 3 === 0 ? 'live' : snapshotIndex % 3 === 1 ? 'vod' : 'series',
    sortTitle: `synthetic catalog item ${snapshotIndex}-${itemIndex}`,
    detail: '',
  }))
  const baselineBytes = JSON.stringify(items).length
  const paddingPerItem = Math.max(0, Math.floor((targetPayloadBytes - baselineBytes) / itemCount))

  return items.map((item) => ({
    ...item,
    detail: repeatCharacter('x', paddingPerItem),
  }))
}

function repeatCharacter(character: string, count: number): string {
  let value = ''

  for (let index = 0; index < count; index += 1) {
    value += character
  }

  return value
}

function measurement(
  operation: CapabilityMeasurement['operation'],
  durationMs: number,
  success: boolean,
  recordCount: number,
  batchSize: number,
  payloadBytes = 0,
  extra: Partial<Pick<CapabilityMeasurement, 'errorCode'>> = {},
): CapabilityMeasurement {
  return {
    schemaVersion: 1,
    operation,
    runner: 'main',
    success,
    durationMs,
    recordCount,
    batchSize,
    payloadBytes,
    ...extra,
  }
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('The flat snapshot transaction was aborted.'))
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('The flat snapshot transaction failed.'))
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

async function nextEventLoopTurn(): Promise<number> {
  const startedAt = now()

  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, 0)
  })

  return now() - startedAt
}

async function yieldToMain(delayMs: number): Promise<number> {
  const startedAt = now()

  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, delayMs)
  })

  return now() - startedAt
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback
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

function maximum(values: number[]): number | undefined {
  return values.length ? Math.max(...values) : undefined
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}