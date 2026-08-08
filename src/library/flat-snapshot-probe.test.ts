import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import {
  armFlatSnapshotPlaybackStartup,
  deleteFlatSnapshotDatabase,
  inspectFlatSnapshotRecovery,
  markFlatSnapshotPlaybackFailed,
  markFlatSnapshotPlaybackReady,
  markFlatSnapshotPlaybackStarting,
  resetFlatSnapshotPlaybackStartup,
  runFlatSnapshotProbe,
  snapshotFlatSnapshotPlaybackStartup,
} from './flat-snapshot-probe'

const databaseNames: string[] = []

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
})

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map(deleteFlatSnapshotDatabase))
  vi.unstubAllGlobals()
})

describe('flat snapshot capability probe', () => {
  it('writes category-shaped snapshots and measures one get plus JSON parse', async () => {
    const databaseName = uniqueDatabaseName()
    databaseNames.push(databaseName)

    const report = await runFlatSnapshotProbe({
      databaseName,
      runId: 'complete-run',
      snapshotCount: 8,
      itemsPerSnapshot: 12,
      cleanup: false,
    })

    expect(report).toMatchObject({
      databaseName,
      runId: 'complete-run',
      snapshotCount: 8,
      itemsPerSnapshot: 12,
      targetPayloadBytes: 50 * 1024,
      writesCompleted: 8,
      cancelled: false,
      recovery: {
        state: 'complete',
        candidateSnapshotCount: 8,
        retainedSnapshotCount: 8,
        invalidSnapshotCount: 0,
        atomicityPreserved: true,
      },
      read: {
        itemCount: 12,
        success: true,
      },
    })
    expect(report.averagePayloadBytes).toBeGreaterThan(48_000)
    expect(report.measurements.filter((measurement) => measurement.operation === 'snapshot-write')).toHaveLength(
      8,
    )
    expect(report.measurements).toContainEqual(
      expect.objectContaining({ operation: 'snapshot-read', success: true, recordCount: 1 }),
    )
    expect(report.measurements).toContainEqual(
      expect.objectContaining({ operation: 'snapshot-parse', success: true, recordCount: 12 }),
    )
  })

  it('measures a configurable 256 KiB snapshot with one read plus parse', async () => {
    const databaseName = uniqueDatabaseName()
    databaseNames.push(databaseName)

    const report = await runFlatSnapshotProbe({
      databaseName,
      runId: 'maximum-shard-run',
      snapshotCount: 1,
      itemsPerSnapshot: 1_500,
      targetPayloadBytes: 256 * 1024,
      cleanup: false,
    })

    expect(report.targetPayloadBytes).toBe(256 * 1024)
    expect(report.averagePayloadBytes).toBeGreaterThan(250 * 1024)
    expect(report.read).toMatchObject({
      itemCount: 1_500,
      success: true,
    })
  })

  it('completes a 1,055-snapshot cooperative write workload without losing atomicity', async () => {
    const databaseName = uniqueDatabaseName()
    databaseNames.push(databaseName)

    const report = await runFlatSnapshotProbe({
      databaseName,
      runId: 'thousand-fifty-five-run',
      snapshotCount: 1_055,
      itemsPerSnapshot: 8,
      targetPayloadBytes: 2 * 1024,
      cleanup: false,
      // The cooperative macrotask yield exists to measure real
      // `setTimeout(0)` turnaround on the device. Under Node + fake-indexeddb
      // each of the ~3,165 yields costs ~14 ms, so a real-timer run of this
      // 1,055-unit workload takes ~45 s and blows any sane test timeout even
      // though every IndexedDB put is sub-millisecond. Inject a fast yield so
      // this test exercises the atomicity/coverage contract, not timer latency.
      // The delay is still honored so any future inter-unit pacing stays real;
      // this workload uses the default `interUnitDelayMs` of 0.
      scheduleMacrotask: (delayMs) =>
        delayMs > 0
          ? new Promise<void>((resolve) => globalThis.setTimeout(resolve, delayMs))
          : Promise.resolve(),
    })

    expect(report).toMatchObject({
      snapshotCount: 1_055,
      writesCompleted: 1_055,
      cancelled: false,
      recovery: {
        state: 'complete',
        candidateSnapshotCount: 1_055,
        retainedSnapshotCount: 1_055,
        invalidSnapshotCount: 0,
        atomicityPreserved: true,
      },
    })
    expect(report.writeTotalMs).toBeGreaterThan(0)
    expect(report.p95PutMs).toEqual(expect.any(Number))
    expect(report.p95UnitMs).toEqual(expect.any(Number))
    expect(
      report.measurements.filter((measurement) => measurement.operation === 'cooperative-yield'),
    ).toHaveLength(1_055)
  })

  it('cancels a cooperative write promptly when playback starts', async () => {
    const databaseName = uniqueDatabaseName()
    databaseNames.push(databaseName)
    const controller = new AbortController()
    resetFlatSnapshotPlaybackStartup()

    const report = await runFlatSnapshotProbe({
      databaseName,
      runId: 'playback-cancelled-run',
      snapshotCount: 1_055,
      itemsPerSnapshot: 8,
      targetPayloadBytes: 2 * 1024,
      cleanup: false,
      signal: controller.signal,
      onSnapshotCommitted(writesCompleted) {
        if (writesCompleted === 2) {
          armFlatSnapshotPlaybackStartup('concurrent')
          markFlatSnapshotPlaybackStarting()
          controller.abort()
        }
      },
    })
    const recovered = await inspectFlatSnapshotRecovery(databaseName, 'playback-cancelled-run')

    expect(report.cancelled).toBe(true)
    expect(report.writesCompleted).toBe(2)
    expect(report.cancellationAckMs).toEqual(expect.any(Number))
    expect(report.cancellationAckMs).toBeLessThanOrEqual(250)
    expect(report.playbackStartup).toMatchObject({
      mode: 'concurrent',
      state: 'starting',
    })
    expect(recovered).toMatchObject({
      state: 'writing',
      candidateSnapshotCount: 2,
      retainedSnapshotCount: 2,
      invalidSnapshotCount: 0,
      atomicityPreserved: true,
    })
  })

  it('preserves only fully committed snapshot units after cooperative cancellation', async () => {
    const databaseName = uniqueDatabaseName()
    databaseNames.push(databaseName)
    const controller = new AbortController()

    const reportPromise = runFlatSnapshotProbe({
      databaseName,
      runId: 'interrupted-run',
      snapshotCount: 40,
      itemsPerSnapshot: 8,
      interUnitDelayMs: 5,
      cleanup: false,
      signal: controller.signal,
    })
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(() => {
        controller.abort()
        resolve()
      }, 1)
    })

    const report = await reportPromise
    const recovered = await inspectFlatSnapshotRecovery(databaseName, 'interrupted-run')

    expect(report.cancelled).toBe(true)
    expect(report.writesCompleted).toBeLessThan(40)
    expect(recovered).toMatchObject({
      runId: 'interrupted-run',
      state: 'writing',
      candidateSnapshotCount: report.writesCompleted,
      retainedSnapshotCount: report.writesCompleted,
      invalidSnapshotCount: 0,
      atomicityPreserved: true,
    })
  })

  it('records an explicitly armed player startup independently from the snapshot write', () => {
    resetFlatSnapshotPlaybackStartup()

    expect(armFlatSnapshotPlaybackStartup('concurrent')).toEqual({
      mode: 'concurrent',
      state: 'armed',
    })
    expect(markFlatSnapshotPlaybackStarting().state).toBe('starting')
    expect(markFlatSnapshotPlaybackReady()).toMatchObject({
      mode: 'concurrent',
      state: 'ready',
    })

    resetFlatSnapshotPlaybackStartup()
    armFlatSnapshotPlaybackStartup('baseline')
    markFlatSnapshotPlaybackStarting()
    expect(markFlatSnapshotPlaybackFailed()).toMatchObject({
      mode: 'baseline',
      state: 'failed',
    })
    expect(snapshotFlatSnapshotPlaybackStartup().state).toBe('failed')
  })

  it('detects an unknown or missing interrupted run instead of treating it as recoverable', async () => {
    const databaseName = uniqueDatabaseName()
    databaseNames.push(databaseName)

    await runFlatSnapshotProbe({
      databaseName,
      runId: 'known-run',
      snapshotCount: 1,
      itemsPerSnapshot: 1,
      cleanup: false,
    })

    await expect(inspectFlatSnapshotRecovery(databaseName, 'missing-run')).resolves.toEqual({
      runId: 'missing-run',
      state: 'writing',
      expectedSnapshotCount: 0,
      candidateSnapshotCount: 0,
      retainedSnapshotCount: 0,
      invalidSnapshotCount: 0,
      atomicityPreserved: false,
    })
  })
})

function uniqueDatabaseName(): string {
  return `nova-play-flat-snapshot-probe-test-${Date.now()}-${Math.random()}`
}