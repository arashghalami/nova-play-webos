export type ProbeStage =
  | 'main-idb'
  | 'worker-start'
  | 'worker-message'
  | 'worker-idb'
  | 'cooperative-main'
  | 'persistence'
  | 'cancellation'
  | 'cleanup'

export type CapabilityWarningCode =
  | 'indexeddb-unavailable'
  | 'storage-estimate-unavailable'
  | 'storage-persistence-unavailable'
  | 'worker-unavailable'
  | 'worker-idb-unavailable'
  | 'performance-budget-exceeded'
  | 'cleanup-retry-required'

export type CapabilityMeasurementOperation =
  | 'write'
  | 'read'
  | 'index-query'
  | 'cursor-scan'
  | 'compound-key-query'
  | 'worker-message'
  | 'worker-idb'
  | 'cooperative-slice'
  | 'transaction-recovery'
  | 'snapshot-write'
  | 'snapshot-read'
  | 'snapshot-parse'
  | 'snapshot-serialize'
  | 'playback-startup'
  | 'cooperative-yield'
  | 'snapshot-recovery'

export type CapabilityMeasurement = {
  schemaVersion: 1
  operation: CapabilityMeasurementOperation
  runner: 'main' | 'worker'
  success: boolean
  durationMs: number
  recordCount?: number
  batchSize?: number
  payloadBytes?: number
  errorCode?: 'unsupported' | 'database' | 'cancelled' | 'unknown'
}

export type CapabilityProbeRecord = {
  schemaVersion: 1
  id: string
  token: string
  group: number
  sequence: number
  payload: string
  estimatedBytes: number
}

export type FlatSnapshotProbeOptions = {
  databaseName?: string
  runId?: string
  snapshotCount?: number
  itemsPerSnapshot?: number
  targetPayloadBytes?: number
  interUnitDelayMs?: number
  cleanup?: boolean
  signal?: AbortSignal
  onSnapshotCommitted?: (writesCompleted: number) => void
}

export type PublicationProbeOptions = {
  databaseName?: string
  runId?: string
  categoryCount?: number
  itemsPerCategory?: number
  cleanup?: boolean
}

export type PublicationProbeReport = {
  schemaVersion: 1
  databaseName: string
  runId: string
  categoryCount: number
  itemsPerCategory: number
  publishedCategoryCount: number
  publishStages: string[]
  success: boolean
  fault?: Record<string, string>
}

export type FlatSnapshotPlaybackMode = 'baseline' | 'concurrent'

export type FlatSnapshotPlaybackStartupReport = {
  mode: FlatSnapshotPlaybackMode
  state: 'idle' | 'armed' | 'starting' | 'ready' | 'failed'
  durationMs?: number
}

export type FlatSnapshotRecoveryReport = {
  runId: string
  state: 'writing' | 'complete'
  expectedSnapshotCount: number
  candidateSnapshotCount: number
  retainedSnapshotCount: number
  invalidSnapshotCount: number
  atomicityPreserved: boolean
}

export type FlatSnapshotProbeReport = {
  schemaVersion: 1
  databaseName: string
  runId: string
  snapshotCount: number
  itemsPerSnapshot: number
  targetPayloadBytes: number
  averagePayloadBytes: number
  writesCompleted: number
  writeTotalMs: number
  p95PutMs?: number
  worstPutMs?: number
  p95UnitMs?: number
  worstUnitMs?: number
  p95PreYieldSliceMs?: number
  worstPreYieldSliceMs?: number
  p95SerializeMs?: number
  worstSerializeMs?: number
  p95EventLoopTurnMs?: number
  worstEventLoopTurnMs?: number
  firstPutMs?: number
  warmupUnitCount: number
  warmupP95PutMs?: number
  steadyStateP50PutMs?: number
  steadyStateP95PutMs?: number
  worstYieldDelayMs?: number
  cancellationAckMs?: number
  playbackStartup?: FlatSnapshotPlaybackStartupReport
  read?: {
    retrievalMs: number
    parseMs: number
    itemCount: number
    success: boolean
  }
  recovery?: FlatSnapshotRecoveryReport
  measurements: CapabilityMeasurement[]
  cancelled: boolean
}

export type CapabilityProbeOptions = {
  recordCounts: number[]
  batchSizes: number[]
  testWorkerIndexedDb: boolean
  cleanup: boolean
  workerScriptUrl?: string
}

export type WorkerProbeResult = {
  indexedDbSupported: boolean
  indexesSupported: boolean
  cursorsSupported: boolean
  compoundKeysSupported: boolean
  measurements: CapabilityMeasurement[]
}

export type CapabilityProbeReport = {
  schemaVersion: 1
  device: {
    userAgent: string
    webOsRuntime: boolean
  }
  worker: {
    classicSupported: boolean
    packagedUrlResolved: boolean
    startupSupported: boolean
    messagingSupported: boolean
  }
  indexedDb: {
    mainThreadSupported: boolean
    workerSupported: boolean
    persistsAcrossRelaunch: 'unknown' | 'yes' | 'no'
    indexesSupported: boolean
    cursorsSupported: boolean
    compoundKeysSupported: boolean
  }
  cooperativeMain: {
    tested: boolean
    supported: boolean
    p95SliceMs?: number
  }
  storage: {
    estimateSupported: boolean
    persistSupported: boolean
    quotaBytes?: number
    usageBytes?: number
    persistenceGranted?: boolean
  }
  measurements: CapabilityMeasurement[]
  recommendation: 'worker-idb' | 'worker-main-idb' | 'cooperative-main' | 'no-go'
  warnings: CapabilityWarningCode[]
}