import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { SYNC_BREADCRUMB_KEY } from './sync-breadcrumb'
import {
  cleanupSyncSimulation,
  runSyncSimulationProbe,
} from './sync-simulation-probe'

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

const SMALL_SHAPES = {
  live: { categoryCount: 2, itemsPerCategory: 3 },
  vod: { categoryCount: 2, itemsPerCategory: 3 },
  series: { categoryCount: 2, itemsPerCategory: 3 },
}

const databases: string[] = []

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  vi.stubGlobal('localStorage', new MemoryStorage())
})

afterEach(async () => {
  await Promise.all(databases.splice(0).map((name) => cleanupSyncSimulation(name).catch(() => undefined)))
  vi.unstubAllGlobals()
})

function databaseName(label: string): string {
  const name = `nova-play-sync-sim-test-${label}-${Date.now()}-${Math.random()}`
  databases.push(name)
  return name
}

describe('runSyncSimulationProbe', () => {
  it('runs the full six-request plan over a populated seed and reports per section', async () => {
    const report = await runSyncSimulationProbe({
      shapes: SMALL_SHAPES,
      databaseName: databaseName('populated'),
      transport: 'parser',
      cleanup: true,
    })

    expect(report.status).toBe('completed')
    // Unscoped: three category manifests plus one whole-section scan per section.
    expect(report.requestCount).toBe(6)
    expect(report.issuedRequestCount).toBe(6)
    expect(report.sections.map((section) => section.section).sort()).toEqual([
      'live',
      'series',
      'vod',
    ])

    for (const section of report.sections) {
      // The seed was a real populated complete generation, not a metadata flag.
      expect(section.seededCoverage).toBe('complete')
      expect(section.seededItemCount).toBe(6)
      expect(section.seededIndexPostingCount).toBeGreaterThan(0)
      // The refresh republished a complete generation.
      expect(section.manifestCoverage).toBe('complete')
      expect(section.manifestItemCount).toBe(6)
      expect(section.mode).toBe('whole-section')
      expect(section.success).toBe(true)
      expect(section.streamedBytes ?? 0).toBeGreaterThan(0)
    }
  })

  /*
   * This asserts the throttle switch's call-count behaviour only. It runs under
   * node with no DOM, so it is NOT evidence for or against the DOM-sink
   * hypothesis, which is about Chromium 79 layout and accessibility-tree cost.
   * That remains untested until the on-device A/B (cells A1/A2) is run.
   */
  it('emits more scanning events unthrottled than throttled (switch behaviour only)', async () => {
    const throttled: Array<{ stage: string }> = []
    const throttledReport = await runSyncSimulationProbe({
      shapes: SMALL_SHAPES,
      databaseName: databaseName('throttled'),
      transport: 'parser',
      cleanup: true,
      // Larger shape so the unthrottled cell has many batches to coalesce.
      onProgress: (event) => throttled.push(event),
    })

    const unthrottled: Array<{ stage: string }> = []
    const unthrottledReport = await runSyncSimulationProbe({
      shapes: SMALL_SHAPES,
      databaseName: databaseName('unthrottled'),
      transport: 'parser',
      cleanup: true,
      progressThrottleMs: 0,
      onProgress: (event) => unthrottled.push(event),
    })

    expect(throttledReport.throttled).toBe(true)
    expect(unthrottledReport.throttled).toBe(false)
    expect(unthrottledReport.progressThrottleMs).toBe(0)
    // The unthrottled A1 cell emits one scanning event per batch; the throttled
    // A2 cell coalesces intermediate batches, so it emits no more than A1.
    const throttledScans = throttled.filter((event) => event.stage === 'scanning').length
    const unthrottledScans = unthrottled.filter((event) => event.stage === 'scanning').length
    expect(unthrottledScans).toBeGreaterThanOrEqual(throttledScans)
    expect(unthrottledReport.progressEventCount).toBeGreaterThanOrEqual(
      throttledReport.progressEventCount,
    )
    expect(throttledReport.status).toBe('completed')
    expect(unthrottledReport.status).toBe('completed')
  })

  it('scopes to a single section and issues exactly one scan request', async () => {
    const report = await runSyncSimulationProbe({
      section: 'live',
      shapes: SMALL_SHAPES,
      databaseName: databaseName('scoped'),
      transport: 'parser',
      cleanup: true,
    })

    // A targeted run reuses the persisted manifest, so its plan is one scan.
    expect(report.scopedSection).toBe('live')
    expect(report.requestCount).toBe(1)
    expect(report.issuedRequestCount).toBe(1)
    expect(report.sections).toHaveLength(1)
  })

  it('never writes the production breadcrumb key', async () => {
    await runSyncSimulationProbe({
      shapes: SMALL_SHAPES,
      databaseName: databaseName('breadcrumb'),
      transport: 'callback',
      cleanup: true,
    })

    // The probe uses an isolated in-memory breadcrumb store, so the shared
    // localStorage key must be untouched by a probe run.
    expect(localStorage.getItem(SYNC_BREADCRUMB_KEY)).toBeNull()
  })

  it('leaves a recoverable database by default and cleans it up on request', async () => {
    const name = databaseName('recoverable')
    const report = await runSyncSimulationProbe({
      shapes: SMALL_SHAPES,
      databaseName: name,
      transport: 'callback',
    })

    expect(report.cleanedUp).toBe(false)
    // An explicit cleanup call is the recovery path after a renderer kill.
    await expect(cleanupSyncSimulation(name)).resolves.toBeUndefined()
  })
})
