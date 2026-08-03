import { describe, expect, it } from 'vitest'

const sources = import.meta.glob('./**/*.ts', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

describe('local-first catalog regressions', () => {
  const mainSource = sources['./main.ts']

  it('keeps global search local and avoids startup account validation', () => {
    expect(mainSource).toMatch(/function localGlobalSearchMatches\(/)
    expect(mainSource).toMatch(/Movies have not been downloaded yet\. Refresh library from Settings\./)
    expect(mainSource).not.toMatch(/searchStreams\s*\(/)
    expect(mainSource).not.toMatch(/void refreshAccount\(true\)/)
  })

  it('reads browse categories and category contents only from authoritative local snapshots', () => {
    expect(mainSource).toMatch(
      /await catalogRepository\.readCompleteSectionCategories\(\s*activeProfile\.id,\s*section,\s*\)/,
    )
    expect(mainSource).toMatch(
      /await catalogRepository\.readCompleteCategory\(\s*activeProfile\.id,\s*activeCatalog\.section,\s*category\.id,\s*\)/,
    )
    expect(mainSource).not.toMatch(/await activeClient\.categories\(section, signal\)/)
    expect(mainSource).not.toMatch(
      /await activeClient\.streams\(activeCatalog\.section, category\.id, signal\)/,
    )
  })

  it('does not prefetch EPG during catalog or guide rendering', () => {
    expect(mainSource).not.toMatch(/prefetchNowNext/)
    expect(mainSource).toMatch(/new LruTtlCache<NowNext>\(\s*MAX_NOW_NEXT_ENTRIES,\s*NOW_NEXT_CACHE_TTL_MS,/)
    expect(mainSource).toMatch(/await activeClient\.nowNext\(stream\.id, signal\)/)
  })

  it('keeps provider acquisition explicit while browse and search read the local catalog', () => {
    expect(mainSource).toMatch(
      /new CatalogSyncCoordinator\(\s*client,\s*catalogRepository(?:,\s*\{[\s\S]*?internalFaultDiagnostics:[\s\S]*?\})?\s*\)/,
    )
    expect(mainSource).toMatch(/catalogRepository\.readCompleteCategory\(/)
    expect(mainSource).toMatch(/catalogRepository\.searchCompleteSection\(/)
    expect(mainSource).not.toMatch(/searchStreams\s*\(/)
    expect(mainSource).toMatch(/function scheduleCatalogSync\(/)
    expect(mainSource).toMatch(/data-action="refresh-library"/)
    expect(mainSource).toMatch(/if \(action === 'refresh-library'\)/)
    expect(mainSource).toMatch(/catalogSync\?\.cancel\(\)/)
    expect(mainSource).not.toMatch(
      /initializeAppHistory\(\)\s*\nrender\(\)\s*\nscheduleCatalogSync\(\)/,
    )
    expect(mainSource).not.toMatch(/nowNextCache\.clear\(\)\s*\n\s*scheduleCatalogSync\(\)/)
    expect(mainSource).not.toMatch(/render\(\)\s*\n\s*scheduleCatalogSync\(\)\s*\n}\s*\n\s*function togglePlayback/)
  })
})