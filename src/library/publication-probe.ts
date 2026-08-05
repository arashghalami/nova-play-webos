import {
  deleteLibraryDatabase,
  IndexedDbCatalogRepository,
  type SnapshotPublishStage,
} from './catalog-repository'
import { internalFaultTraceData } from './internal-fault-diagnostics'
import type {
  PublicationProbeOptions,
  PublicationProbeReport,
} from './capability-types'
import type { Category, StreamItem } from '../types'

const DEFAULT_CATEGORY_COUNT = 3
const DEFAULT_ITEMS_PER_CATEGORY = 24

/**
 * Exercises the exact repository publication path with synthetic records only.
 * It never constructs a provider client or issues network traffic.
 */
export async function runPublicationProbe(
  options: PublicationProbeOptions = {},
): Promise<PublicationProbeReport> {
  const databaseName =
    options.databaseName ?? `nova-play-publication-probe-${Date.now()}`
  const runId =
    options.runId ?? `publication-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const categoryCount = positiveInteger(options.categoryCount, DEFAULT_CATEGORY_COUNT)
  const itemsPerCategory = positiveInteger(options.itemsPerCategory, DEFAULT_ITEMS_PER_CATEGORY)
  const profileId = `publication-probe-profile-${runId}`
  const stages: SnapshotPublishStage[] = []
  const repository = new IndexedDbCatalogRepository({ databaseName })

  try {
    const snapshots = Array.from({ length: categoryCount }, (_, categoryIndex) => {
      const category: Category = {
        id: `synthetic-category-${categoryIndex}`,
        name: `Synthetic category ${categoryIndex + 1}`,
      }

      return {
        category,
        categoryKey: category.id,
        /*
         * Representative record size matters: a probe built from four short
         * fields understates the real peak by several times, and the field that
         * grew most is artwork, which is now retained by the cache writer. These
         * are synthetic strings on a non-routable host, never provider values.
         */
        items: Array.from(
          { length: itemsPerCategory },
          (_, itemIndex): StreamItem => ({
            id: `synthetic-${categoryIndex}-${itemIndex}`,
            name: `Synthetic item ${categoryIndex + 1}-${itemIndex + 1} extended title padding`,
            section: 'vod',
            categoryId: category.id,
            searchName: `synthetic item ${categoryIndex + 1}-${itemIndex + 1} extended title padding`,
            icon: `https://synthetic.invalid/artwork/icon/${categoryIndex}-${itemIndex}-0123456789abcdef.jpg`,
            cover: `https://synthetic.invalid/artwork/cover/${categoryIndex}-${itemIndex}-0123456789abcdef.jpg`,
            rating: '8.2',
            year: '2026',
            added: '1785800000',
            containerExtension: 'mp4',
            plot: `Synthetic plot text for item ${categoryIndex + 1}-${itemIndex + 1} used only to make the probe record representative of a provider record.`,
          }),
        ),
      }
    })

    const published = await repository.replaceSectionSnapshots(
      {
        profileId,
        section: 'vod',
        snapshots,
      },
      {
        onPublishStage(stage) {
          stages.push(stage)
        },
      },
    )

    return {
      schemaVersion: 1,
      databaseName,
      runId,
      categoryCount,
      itemsPerCategory,
      publishedCategoryCount: published.length,
      publishStages: stages,
      success: true,
    }
  } catch (reason) {
    return {
      schemaVersion: 1,
      databaseName,
      runId,
      categoryCount,
      itemsPerCategory,
      publishedCategoryCount: 0,
      publishStages: stages,
      success: false,
      fault: internalFaultTraceData(reason, false, true),
    }
  } finally {
    repository.close()

    if (options.cleanup !== false) {
      await deleteLibraryDatabase(databaseName)
    }
  }
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback
}