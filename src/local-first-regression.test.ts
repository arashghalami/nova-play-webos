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
    expect(mainSource).toMatch(/Library not downloaded yet — Refresh library\./)
    expect(mainSource).not.toMatch(/searchStreams\s*\(/)
    expect(mainSource).not.toMatch(/void refreshAccount\(true\)/)
  })

  it('reuses cached section categories before requesting them again', () => {
    expect(mainSource).toMatch(
      /sectionCategories\.get\(section\)\s*\?\?\s*await activeClient\.categories\(section, signal\)/,
    )
  })

  it('does not prefetch EPG during catalog or guide rendering', () => {
    expect(mainSource).not.toMatch(/prefetchNowNext/)
    expect(mainSource).toMatch(/new LruTtlCache<NowNext>\(\s*MAX_NOW_NEXT_ENTRIES,\s*NOW_NEXT_CACHE_TTL_MS,/)
    expect(mainSource).toMatch(/await activeClient\.nowNext\(stream\.id, signal\)/)
  })

  it('keeps Phase 1B acquisition outside every UI catalog read route', () => {
    expect(mainSource).toMatch(
      /new CatalogSyncCoordinator\(\s*client,\s*catalogRepository(?:,\s*\{[\s\S]*?internalFaultDiagnostics:[\s\S]*?\})?\s*\)/,
    )
    expect(mainSource).not.toMatch(/catalogRepository\.readCategoryShard\(/)
    expect(mainSource).not.toMatch(/catalogRepository\.search\(/)
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