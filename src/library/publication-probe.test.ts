import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { deleteLibraryDatabase } from './catalog-repository'
import { runPublicationProbe } from './publication-probe'

const databaseNames: string[] = []

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
})

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map(deleteLibraryDatabase))
  vi.unstubAllGlobals()
})

describe('synthetic publication probe', () => {
  it('drives whole-section publication without a provider client', async () => {
    const databaseName = uniqueDatabaseName()
    databaseNames.push(databaseName)

    const report = await runPublicationProbe({
      databaseName,
      runId: 'synthetic-publication',
      categoryCount: 4,
      itemsPerCategory: 3,
      cleanup: false,
    })

    expect(report).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        databaseName,
        runId: 'synthetic-publication',
        categoryCount: 4,
        itemsPerCategory: 3,
        publishedCategoryCount: 4,
        success: true,
      }),
    )
    expect(report.publishStages).toEqual([
      'snapshot-plan',
      'snapshot-write',
      'manifest-build',
      'manifest-put',
      'cleanup',
      'complete',
    ])
    expect(report.fault).toBeUndefined()
  })
})

function uniqueDatabaseName(): string {
  return `nova-play-publication-probe-test-${Date.now()}-${Math.random()}`
}