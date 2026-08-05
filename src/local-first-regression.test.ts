import { describe, expect, it } from 'vitest'

const sources = import.meta.glob('./**/*.ts', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

describe('local-first catalog regressions', () => {
  const mainSource = sources['./main.ts']

  it('keeps startup account validation disabled while initializing durable library recovery', () => {
    expect(mainSource).toMatch(/function localGlobalSearchMatches\(/)
    expect(mainSource).not.toMatch(/void refreshAccount\(true\)/)
    expect(mainSource).toMatch(/void initializeLibrarySync\(profile\.id\)/)
    expect(mainSource).toMatch(/catalogRepository\.recoverStaleSync\(\s*profileId,\s*CATALOG_SYNC_STALE_RUN_MS\s*\)/)
  })

  it('uses local snapshots first, then a single interactive request only for incomplete browse sections', () => {
    expect(mainSource).toMatch(
      /await catalogRepository\.readCompleteSectionCategories\(\s*activeProfile\.id,\s*section,\s*\)/,
    )
    expect(mainSource).toMatch(
      /await catalogRepository\.readCompleteCategoryPage\(\s*activeProfile\.id,\s*activeCatalog\.section,\s*category\.id,\s*0,\s*catalogPageSize\(\),\s*\)/,
    )
    expect(mainSource).toMatch(/await activeClient\.categories\(section, signal\)/)
    expect(mainSource).toMatch(
      /await activeClient\.streams\(activeCatalog\.section, category\.id, signal\)/,
    )
    expect(mainSource).toMatch(/source: 'live'/)
    expect(mainSource).toMatch(/Live provider results/)
  })

  it('provides submit-only, section-scoped live global search for incomplete sections', () => {
    expect(mainSource).toMatch(/async function searchGlobalLiveSection\(section: LibrarySection\)/)
    expect(mainSource).toMatch(/activeClient\.searchStreams\(section, query,/)
    expect(mainSource).toMatch(/data-action="search-global-live-section"/)
    expect(mainSource).toMatch(/Search \$\{escape\(labels\[section\]\)\} live/)
    expect(mainSource).toMatch(/globalSearchSectionSource\.set\(section, 'live'\)/)
    expect(mainSource).not.toMatch(/Promise\.all\(\s*GLOBAL_SEARCH_SECTIONS\.map\(/)
  })

  it('retains existing progressive-search cards while appending later batches', () => {
    expect(mainSource).toMatch(/function updateGlobalSearchSection\(section: LibrarySection\): void/)
    expect(mainSource).toMatch(
      /querySelectorAll<HTMLElement>\('\[data-global-search-card-key\]'\)[\s\S]*?card\.remove\(\)/,
    )
    expect(mainSource).toMatch(/if \(!existing\) \{\s*content\.insertAdjacentHTML\(\s*'beforeend',/)
    expect(mainSource).toMatch(/assignNavigationZones\(\)\s*\n\s*invalidateSpatialLayout\(\)/)
  })

  it('keeps Guide category and channel-list reads in the complete local catalog', () => {
    expect(mainSource).toMatch(
      /async function openGuide\([\s\S]*?catalogRepository\.readCompleteSectionCategories\(\s*activeProfile\.id,\s*'live',/,
    )
    expect(mainSource).toMatch(
      /async function openGuide\([\s\S]*?catalogRepository\.readCompleteCategoryPage\(\s*activeProfile\.id,\s*'live',\s*selectedCategory\.id,/,
    )
    expect(mainSource).not.toMatch(/activeClient\.categories\('live', signal\)/)
    expect(mainSource).not.toMatch(/activeClient\.streams\('live', guideCategory\.id, signal\)/)
    expect(mainSource).toMatch(/return view === 'guide'/)
  })

  it('keeps detail and programme requests behind durable TTL cache reads', () => {
    expect(mainSource).toMatch(/catalogRepository\.getDetails<SeriesDetails>\(/)
    expect(mainSource).toMatch(/catalogRepository\.getDetails<VodDetails>\(/)
    expect(mainSource).toMatch(/catalogRepository\.putDetails\(/)
    // Programme reads now flow through the EPG service, which consults the
    // durable cache (getEpg) before any provider request and persists with
    // putEpg. The service is the single owner of that ordering.
    const epgServiceSource = sources['./epg-service.ts']
    expect(epgServiceSource).toMatch(/config\.cache\.getEpg<NowNext>\(/)
    expect(epgServiceSource).toMatch(/config\.cache\.getEpg<Program\[\]>\(/)
    expect(epgServiceSource).toMatch(/config\.cache\.putEpg\(/)
    expect(mainSource).toMatch(/resolveNowNext as resolveNowNextData/)
    expect(mainSource).toMatch(/resolveSchedule as resolveScheduleData/)
  })

  it('does not prefetch EPG during catalog or guide rendering', () => {
    // The banned fan-out (prefetchNowNext) must never return in any form.
    expect(mainSource).not.toMatch(/prefetchNowNext/)
    expect(mainSource).toMatch(/new LruTtlCache<NowNext>\(\s*MAX_NOW_NEXT_ENTRIES,\s*NOW_NEXT_CACHE_TTL_MS,/)
    // Guide list hydration is bounded to the visible page and skips unmapped
    // channels before any request is formed.
    expect(mainSource).toMatch(/streams\.slice\(0, GUIDE_VISIBLE_NOW_NEXT_LIMIT\)/)
    expect(mainSource).toMatch(/visible\.filter\(\(stream\) => hasEpgIdentifier\(stream\)\)/)
    // A blank identifier is an authoritative negative: no request is issued.
    expect(mainSource).toMatch(/if \(!hasEpgIdentifier\(stream\)\) \{/)
  })

  it('starts incomplete background acquisition, reports truthful cooldown state, and gates production diagnostics', () => {
    expect(mainSource).toMatch(/function createCatalogSyncCoordinator\(nextClient: ProviderBroker\)/)
    expect(mainSource).toMatch(/new CatalogSyncCoordinator\(nextClient, catalogRepository, \{/)
    expect(mainSource).toMatch(/onProgress: updateLibrarySyncProgress/)
    expect(mainSource).toMatch(/function scheduleCatalogSync\(/)
    expect(mainSource).toMatch(/void initializeLibrarySync\(nextProfile\.id\)/)
    expect(mainSource).toMatch(/Downloaded library is incomplete\. Next attempt/)
    expect(mainSource).toMatch(/if \(action === 'measure-vod-library' && libraryProbeEnabled\)/)
    expect(mainSource).not.toMatch(/data-action="measure-vod-library"/)
  })

  it('keeps the video sizing capture probe-only and preserves normal-package probe boundaries', () => {
    expect(mainSource).toMatch(/if \(libraryProbeEnabled\) \{\s*resetVideoSizingProbe\(\)/)
    expect(mainSource).toMatch(/function captureVideoSizing\(/)
    expect(mainSource).toMatch(/videoWidth: video\.videoWidth/)
    expect(mainSource).toMatch(/objectFit: window\.getComputedStyle\(video\)\.objectFit/)
    expect(mainSource).toMatch(/videoSizing: \{\s*capture\(\)/)
    expect(mainSource).toMatch(
      /if \(\s*import\.meta\.env\.DEV \|\|[\s\S]*?window\.__NOVA_LIBRARY_PROBE__ = \{/,
    )
  })
})