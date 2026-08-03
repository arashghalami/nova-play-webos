import './style.css'
import {
  clearProfile,
  continueWatching,
  DEFAULT_SETTINGS,
  favoriteKey,
  favoriteStreams,
  hydrateFavorites,
  isFavorite as hasFavorite,
  loadFavorites,
  loadProfile,
  loadProfiles,
  loadResume,
  loadSettings,
  profileSummaries,
  removeProfile,
  saveFavorites,
  saveProfile,
  saveResume,
  saveSettings,
  selectProfile,
  STORAGE_FAILURE_MESSAGE,
  toggleFavorite as toggleStoredFavorite,
} from './storage'
import type {
  AccountSummary,
  AppSettings,
  AppView,
  CatalogSort,
  Category,
  EnrichedTitleMetadata,
  FilmographyCredit,
  LibrarySection,
  RelatedTitle,
  NowNext,
  PersonDetails,
  PersonSummary,
  Program,
  RichMetadata,
  ResumeEntry,
  SeriesDetails,
  RatingCandidate,
  StreamItem,
  VodDetails,
  XtreamProfile,
} from './types'
import {
  loadPersonMetadata,
  loadTitleMetadata,
  loadTvMazeSeriesMetadata,
  metadataServiceConfigured,
} from './metadata-client'
import {
  resolveNavigationTarget,
  type NavigationDirection,
  type NavigationItem,
} from './navigation'
import { createFrameNavigationScheduler } from './frame-navigation'
import { createSpatialLayoutCache } from './spatial-layout-cache'
import { isRemoteBack, remoteDirection } from './remote-input'
import { foldText, matchesQuery, normalizeQuery, queryTokens } from './search'
import { LruTtlCache } from './lru-ttl-cache'
import { focusScrollDelta } from './focus-scroll'
import { episodeDisplayTitle, episodeThumbnailSources, seasonLabel } from './series-presentation'
import { dashMediaPlayerFactory } from './dash-player'
import {
  clampSeekPosition,
  hasAdvancedPlaybackTimeline,
  hasVerifiedVideoFrame,
  hasVisibleVideoTrack,
  applyPlaybackRate,
  effectivePreservePitch,
  isDoubleSeekTap,
  supportsAudiblePlaybackRate,
  seekFeedbackLabel,
  seekStepForHold,
  timelinePercentFromPosition,
  timelinePositionFromPercent,
  TIMELINE_SEEK_STEP_SECONDS,
} from './player-transport'
import {
  describePlaybackFailure,
  discoverPlaybackSources,
  planPlaybackAttempts,
  playbackDiagnosticLines,
  type PlaybackAttempt,
  type PlaybackCapabilities,
  type PlaybackEvidence,
  type PlaybackFailure,
  type PlaybackFailureKind,
} from './playback-fallback'
import { ProviderBroker } from './provider-broker'
import {
  dedupeRatingCandidates,
  ratingSourceSummary,
  resolveContentRating,
} from './content-rating'
import { performanceTrace } from './performance-trace'
import {
  deleteProbeDatabase,
} from './library/idb-probe'
import {
  runLibraryCapabilityProbe,
  type CapabilityProbeRunOptions,
  type CatalogSyncStorageInspection,
} from './library/capability-probe'
import { runPublicationProbe } from './library/publication-probe'
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
} from './library/flat-snapshot-probe'
import {
  clearLibraryMemoryCaches,
  IndexedDbCatalogRepository,
  setLibraryPlaybackStarting,
  type SearchIndexBuildResult,
} from './library/catalog-repository'
import {
  CATALOG_SYNC_SECTIONS,
  CatalogSyncCoordinator,
  VOD_SYNC_MEASUREMENT_MAX_RESPONSE_BYTES,
  type CatalogSyncRunOptions,
} from './library/catalog-sync'
import { catalogSyncRearmDelay } from './library/catalog-sync-scheduler'
import {
  hlsConstructor,
  mpegtsEngine,
  type HlsInstance,
  type MpegtsMediaPlayer,
} from './media-engines'

type CatalogResults = {
  key: string
  categories: Category[]
  streams: StreamItem[]
}

type CatalogState = {
  section: LibrarySection
  category: Category | null
  categories: Category[]
  streams: StreamItem[]
  query: string
  page: number
  isFavorites: boolean
  sort: CatalogSort
  availabilityMessage?: string
  results?: CatalogResults
}

type CachedStreams = {
  streams: StreamItem[]
  updatedAt: number
}

type FocusSnapshot = {
  id: string | null
  scrollY: number
  view: AppView
}

type ViewReturnPoint = {
  view: AppView
  focus: FocusSnapshot
}

type CatalogReturnPoint = {
  catalog: CatalogState
  focus: FocusSnapshot
}

type ZoneTransition = {
  fromZoneId: string
  toZoneId: string
  fromFocusId: string
  direction: NavigationDirection
}

type NavigationLayout = {
  items: NavigationItem[]
  elements: Map<string, HTMLElement>
}

type AppHistoryState = {
  novaPlay: true
  depth: number
}

type GlobalSearchViewUpdate = {
  controls?: boolean
  fullResults?: boolean
  sections?: Iterable<LibrarySection>
}

type PlayerUiMode = 'immersive' | 'overlay' | 'focused' | 'seeking'
const CATALOG_PAGE_SIZE = 60
const WEBOS_CATALOG_PAGE_SIZE = 24
// Local, in-memory catalog filtering is cheap, so it can react faster than the
// networked global search without feeling chatty.
const CATALOG_SEARCH_DEBOUNCE_MS = 140
const NUMERIC_CHANNEL_TIMEOUT_MS = 1600
const MAX_KNOWN_STREAMS = 5_000
const MAX_STREAM_CACHE_ENTRIES = 18
const MAX_CACHED_STREAM_ITEMS = 12_000
const STREAM_CACHE_TTL_MS = 15 * 60_000
const GLOBAL_SEARCH_SECTION_RESULT_LIMIT = 60
const GLOBAL_SEARCH_COLLAPSED_RESULT_LIMIT = 12
const MIN_GLOBAL_SEARCH_LENGTH = 2
const MAX_NOW_NEXT_ENTRIES = 600
const NOW_NEXT_CACHE_TTL_MS = 5 * 60_000
const PLAYBACK_ATTEMPT_TIMEOUT_MS = 12_000
// Older webOS Chromium eagerly decodes every image in a 60-card DOM grid even
// when loading="lazy" is present. Admit only nearby artwork and limit active
// decodes so category rendering cannot monopolize the UI thread.
const DEFERRED_IMAGE_CONCURRENCY = 4
const WEBOS_DEFERRED_IMAGE_CONCURRENCY = 1
const DEFERRED_IMAGE_PREFETCH_PX = 0
const WEBOS_DEFERRED_IMAGE_COOLDOWN_MS = 180
const AMPERSAND = String.fromCharCode(38)
const ESCAPE_PATTERN = /[&<>"']/g
const ESCAPED_CHARACTERS: Record<string, string> = {
  '&': `${AMPERSAND}amp;`,
  '<': `${AMPERSAND}lt;`,
  '>': `${AMPERSAND}gt;`,
  '"': `${AMPERSAND}quot;`,
  "'": `${AMPERSAND}#039;`,
}
const ADULT_CATEGORY_PATTERN =
  /(^|[^a-z0-9])(adult|xxx|sex|porn|erotic|onlyfans|playboy|redlight|18\+)($|[^a-z0-9])/i
const SORT_LABELS: Record<CatalogSort, string> = {
  default: 'Default',
  name: 'A–Z',
  recent: 'Recently added',
  rating: 'Rating',
  year: 'Year',
}
const labels: Record<LibrarySection, string> = {
  live: 'Live TV',
  vod: 'Movies',
  series: 'Series',
}
const GLOBAL_SEARCH_SECTIONS: LibrarySection[] = ['live', 'vod', 'series']

const appElement = document.querySelector<HTMLDivElement>('#app')

if (!appElement) {
  throw new Error('Application root was not found.')
}

const app: HTMLDivElement = appElement

function isWebOsRuntime(): boolean {
  return Boolean(
    (window as Window & { webOSSystem?: unknown; PalmSystem?: unknown }).webOSSystem ||
      (window as Window & { PalmSystem?: unknown }).PalmSystem ||
      /web0s|webos/i.test(navigator.userAgent),
  )
}

if (isWebOsRuntime()) {
  document.documentElement.dataset.webosRuntime = 'true'
}

function catalogPageSize(): number {
  // On the webOS 6 emulator, a 60-card grid adds 129 focusable nodes and
  // schedules a large number of image decodes. A 24-card page keeps the grid
  // TV-sized while preserving explicit Next/Previous access to the full list.
  return isWebOsRuntime() ? WEBOS_CATALOG_PAGE_SIZE : CATALOG_PAGE_SIZE
}

function playbackPreservesPitch(): boolean {
  return effectivePreservePitch(settings.preservePitch, isWebOsRuntime())
}

function canChangePlaybackSpeed(): boolean {
  return supportsAudiblePlaybackRate(isWebOsRuntime())
}

/**
 * Provision an Xtream profile from webOS launch parameters, so credentials can
 * be injected from the terminal without an on-screen login. This exists because
 * ares-shell is locked down on the target TV (no direct localStorage access),
 * and an uninstall (ares-install -r) wipes the app's stored profile.
 *
 * Inject from a dev machine with, e.g.:
 *   ares-launch -d lg-oled-g1 com.arash.novaplay -p '{"provisionProfile":{"name":"My IPTV","serverUrl":"http://host:port","username":"user","password":"pass"}}'
 *
 * The param is consumed once: after a successful save the profile lives in
 * localStorage exactly as if it had been entered through the login form.
 */
function provisionProfileFromLaunchParams(): void {
  try {
    const launchParams = (
      window as Window & { webOSSystem?: { launchParams?: string } }
    ).webOSSystem?.launchParams

    if (!launchParams) {
      return
    }

    const parsed = JSON.parse(launchParams) as {
      provisionProfile?: Partial<XtreamProfile>
    }
    const candidate = parsed.provisionProfile

    if (
      !candidate ||
      typeof candidate.serverUrl !== 'string' ||
      typeof candidate.username !== 'string' ||
      typeof candidate.password !== 'string'
    ) {
      return
    }

    const injected: XtreamProfile = {
      id: candidate.id && typeof candidate.id === 'string'
        ? candidate.id
        : crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}`,
      name:
        typeof candidate.name === 'string' && candidate.name.trim()
          ? candidate.name.trim()
          : 'My IPTV',
      serverUrl: candidate.serverUrl.trim(),
      username: candidate.username.trim(),
      password: candidate.password,
    }

    // Skip if an identical profile is already stored, so relaunching with the
    // same param is idempotent and does not disturb the active selection.
    const alreadyStored = loadProfiles().some(
      (existing) =>
        existing.serverUrl === injected.serverUrl &&
        existing.username === injected.username &&
        existing.password === injected.password,
    )

    if (!alreadyStored) {
      saveProfile(injected)
    }
  } catch {
    // A malformed launch param must never block normal startup.
  }
}

provisionProfileFromLaunchParams()

let profile = loadProfile()
let client = profile ? new ProviderBroker(profile) : null
const catalogRepository = new IndexedDbCatalogRepository()
let catalogSync = client
  ? new CatalogSyncCoordinator(client, catalogRepository, {
      internalFaultDiagnostics: import.meta.env.VITE_ENABLE_LIBRARY_PROBE === 'true',
    })
  : null
let catalogSyncTimer: number | null = null
let activeLibraryProbeController: AbortController | null = null
let settings: AppSettings = profile
  ? loadSettings(profile.id)
  : { ...DEFAULT_SETTINGS }
let account: AccountSummary | null = null
let view: AppView = profile ? 'home' : 'login'
performanceTrace.setView(view)
let renderedView: AppView | null = null
let catalog: CatalogState | null = null
let selectedItem: StreamItem | null = null
let selectedSeries: SeriesDetails | null = null
let activeSeriesSeason: string | null = null
let selectedVod: VodDetails | null = null
let playerItem: StreamItem | null = null
let lastLiveItem: StreamItem | null = null
let playerSourceOverride: string | null = null
let playerForceDirect = false
let playerControlsTimer: number | null = null
let playerCleanup: (() => void) | null = null
let searchDebounceTimer: number | null = null
let numericChannelTimer: number | null = null
let numericChannelBuffer = ''
let activeHls: HlsInstance | null = null
let activeMpegts: MpegtsMediaPlayer | null = null
let activeDash: { reset: () => void } | null = null
let playerDiagnostics: PlaybackFailure[] = []
let playerDiagnosticsExpanded = false
let playerMuted = false
let playerPlaybackRate = 1
let playerAspect: 'contain' | 'cover' = 'contain'
let showPlayerChannels = false
let playerUiMode: PlayerUiMode = 'immersive'
let playerSeekDirection: -1 | 1 | null = null
let playerSeekStartedAt = 0
let playerSeekHoldTimer: number | null = null
let playerSeekRepeatTimer: number | null = null
let playerSeekFeedbackTimer: number | null = null
let playerTimelinePreviewSeconds: number | null = null
let playerTimelineWasPlaying = false
let playerLastSeekDirection: -1 | 1 | null = null
let playerLastSeekAt = 0
let wakeLock: { release: () => Promise<void> } | null = null
let navigationSequence = 0
let navigationToken = 0
let navigationController: AbortController | null = null
let liveQueue: StreamItem[] = []
let guideStreams: StreamItem[] = []
let globalSearchResults: StreamItem[] = []
let globalSearchQuery = ''
let globalSearchStatus = ''
let globalSearchSequence = 0
const globalSearchSectionAvailability = new Map<LibrarySection, boolean>()
let localSearchIndexMigrationProfileId: string | null = null
let searchReturnView: AppView = 'home'
let pendingFocus: FocusSnapshot | null = null
let detailReturnPoint: ViewReturnPoint | null = null
let personReturnPoint: ViewReturnPoint | null = null
let selectedTitleEnrichment: EnrichedTitleMetadata | null = null
let titleEnrichmentLoading = false
let selectedPerson: PersonDetails | null = null
let catalogReturnPoint: CatalogReturnPoint | null = null
let playerReturnPoint: ViewReturnPoint | null = null
let editingInput: HTMLInputElement | HTMLTextAreaElement | null = null
let lastZoneTransition: ZoneTransition | null = null
let stickyColumnX: number | null = null
let stickyColumnZone: string | null = null
let pendingSpatialInteractionId: number | null = null
let deferredImageLoads = 0
let deferredImageScheduleHandle: number | null = null
const LIBRARY_SYNC_IDLE_DELAY_MS = 10_000
const spatialLayoutCache = createSpatialLayoutCache<HTMLElement, NavigationLayout>()
const frameNavigation = createFrameNavigationScheduler(
  (direction) => {
    const interactionId = pendingSpatialInteractionId
    pendingSpatialInteractionId = null
    const moved = performanceTrace.measure(
      'navigation',
      'spatial-move',
      () => handleSpatialNavigation(direction),
      { direction },
      { interactionId: interactionId ?? undefined },
    )

    window.requestAnimationFrame(() => {
      performanceTrace.endInteraction(interactionId, 'spatial-painted', {
        direction,
        moved,
      })
    })
  },
  {
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (handle) => window.cancelAnimationFrame(handle),
  },
)
let appHistoryDepth = 0
let retainSearchOnNextPopState = false
let playerAbsorbNextPopState = false
let continueMenuHoldTimer: number | null = null
let continueMenuHoldCard: HTMLElement | null = null
// True while OK is still physically held after a long-press opened the menu.
// webOS keeps firing keydown repeats for the held key; without swallowing them
// the still-down OK would immediately activate the focused menu button.
let continueMenuHoldConsumeOk = false
let continueMenuAbsorbNextPopState = false
let continueMenuEl: HTMLElement | null = null
let lastRemovedResume: { key: string; entry: ResumeEntry } | null = null
let undoResumeTimer: number | null = null
const expandedGlobalSearchSections = new Set<LibrarySection>()
let favorites = profile ? loadFavorites(profile.id) : new Map()
let resumeEntries = profile ? loadResume(profile.id) : new Map<string, ResumeEntry>()
const knownStreams = new Map<string, StreamItem>()
const streamCache = new Map<string, CachedStreams>()
const sectionCategories = new Map<LibrarySection, Category[]>()
const adultCategoryIds = new Map<LibrarySection, Set<string>>()
const nowNextCache = new LruTtlCache<NowNext>(
  MAX_NOW_NEXT_ENTRIES,
  NOW_NEXT_CACHE_TTL_MS,
)
const nowNextLoading = new Map<string, AbortController>()
if (profile && repairResumeEpisodeContexts()) {
  saveResume(profile.id, resumeEntries)
}

const escape = (value: string): string =>
  value.replace(ESCAPE_PATTERN, (character) => ESCAPED_CHARACTERS[character])

type AppIcon =
  | 'search'
  | 'star'
  | 'starFilled'
  | 'settings'
  | 'live'
  | 'movie'
  | 'series'
  | 'grid'

function icon(name: AppIcon, className = ''): string {
  const attributes = `class="app-icon ${className}" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"`

  if (name === 'search') {
    return `<svg ${attributes}><circle cx="10.8" cy="10.8" r="6.35"></circle><path d="m16 16 4.2 4.2"></path></svg>`
  }

  if (name === 'star' || name === 'starFilled') {
    return `<svg ${attributes}><path ${name === 'starFilled' ? 'fill="currentColor"' : ''} d="m12 3.35 2.7 5.48 6.05.88-4.38 4.27 1.03 6.02L12 17.16 6.6 20l1.03-6.02-4.38-4.27 6.05-.88L12 3.35Z"></path></svg>`
  }

  if (name === 'settings') {
    return `<svg ${attributes}><circle cx="12" cy="12" r="2.8"></circle><path d="M19.15 13.5a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56v.08h-3v-.08a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06a1.7 1.7 0 0 0 .34-1.88 1.7 1.7 0 0 0-1.56-1.03h-.08v-3h.08a1.7 1.7 0 0 0 1.56-1.03 1.7 1.7 0 0 0-.34-1.88l-.06-.06L8.5 4.38l.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.56v-.08h3v.08a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.03h.08v3h-.08a1.7 1.7 0 0 0-1.56 1.03Z"></path></svg>`
  }

  if (name === 'live') {
    return `<svg ${attributes}><path d="M7 7.4a7.1 7.1 0 0 0 0 9.2"></path><path d="M17 7.4a7.1 7.1 0 0 1 0 9.2"></path><path d="M9.55 9.75a3.6 3.6 0 0 0 0 4.5"></path><path d="M14.45 9.75a3.6 3.6 0 0 1 0 4.5"></path><circle cx="12" cy="12" r="1.05" fill="currentColor"></circle></svg>`
  }

  if (name === 'movie') {
    return `<svg ${attributes}><rect x="3.3" y="5.2" width="17.4" height="13.6" rx="2"></rect><path d="M7.8 5.2v13.6M16.2 5.2v13.6M3.3 9h17.4M3.3 15h17.4"></path></svg>`
  }

  if (name === 'series' || name === 'grid') {
    return `<svg ${attributes}><rect x="4" y="4" width="6.2" height="6.2" rx="1"></rect><rect x="13.8" y="4" width="6.2" height="6.2" rx="1"></rect><rect x="4" y="13.8" width="6.2" height="6.2" rx="1"></rect><rect x="13.8" y="13.8" width="6.2" height="6.2" rx="1"></rect></svg>`
  }

  return ''
}

const currentViewTitle = (): string => {
  if (view === 'home') return 'Home'
  if (view === 'catalog') return catalog?.isFavorites ? 'Favorites' : catalog ? labels[catalog.section] : 'Library'
  if (view === 'details') return selectedItem?.name ?? 'Details'
  if (view === 'person') return selectedPerson?.name ?? 'Person'
  if (view === 'guide') return 'TV Guide'
  if (view === 'search') return 'Search'
  if (view === 'settings') return 'Settings'
  return 'Nova Play'
}

const imageOrPlaceholder = (
  source: string | undefined,
  label: string,
  className = '',
): string => {
  if (source) {
    return `<img class="${className}" src="${escape(source)}" alt="" loading="lazy" />`
  }

  return `<div class="image-placeholder ${className}" aria-hidden="true">${escape(label.slice(0, 1))}</div>`
}

const formatDate = (value?: string): string => {
  if (!value) {
    return 'No expiry date supplied'
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return value
  }

  return new Date(numeric * 1000).toLocaleDateString()
}

const formatDuration = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainingSeconds = safeSeconds % 60

  return [hours, minutes, remainingSeconds]
    .map((value, index) => (index === 0 ? String(value) : String(value).padStart(2, '0')))
    .join(':')
}

const formatTime = (date: Date): string =>
  date.toLocaleTimeString([], {
    hour: settings.timeFormat === '12h' ? 'numeric' : '2-digit',
    minute: '2-digit',
    hour12: settings.timeFormat === '12h',
  })

const isAdult = (name: string): boolean => ADULT_CATEGORY_PATTERN.test(name)

function rememberCategories(section: LibrarySection, categories: Category[]): void {
  sectionCategories.set(section, categories)
  adultCategoryIds.set(
    section,
    new Set(
      categories
        .filter((category) => isAdult(category.name))
        .map((category) => category.id),
    ),
  )
}

function isAdultStream(stream: StreamItem): boolean {
  return (
    isAdult(stream.name) ||
    Boolean(adultCategoryIds.get(stream.section)?.has(stream.categoryId))
  )
}

function visibleStream(stream: StreamItem): boolean {
  return !settings.hideAdultContent || !isAdultStream(stream)
}

function streamLookupKey(stream: StreamItem): string {
  return favoriteKey(stream)
}

function episodeIdentifier(stream: StreamItem): string {
  const season = stream.season?.trim()
  const episode = stream.episodeNumber?.trim()

  if (season && episode) {
    return `S${season.padStart(2, '0')} E${episode.padStart(2, '0')}`
  }

  if (episode) {
    return `Episode ${episode}`
  }

  return season ? `Season ${season}` : 'Episode'
}

function streamDisplayTitle(stream: StreamItem): string {
  return stream.streamType === 'episode' && stream.seriesTitle
    ? `${stream.seriesTitle} · ${episodeIdentifier(stream)}`
    : stream.name
}

function streamDisplaySubtitle(stream: StreamItem): string {
  return stream.streamType === 'episode' && stream.seriesTitle
    ? stream.name
    : ''
}

function metadataLookupTitle(title: string): string {
  return title
    .replace(/^\s*[a-z]{2,4}\s*(?:[-|:]\s*)/i, '')
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .replace(/\s+\b(4k|uhd|fhd|full\s*hd|hd|sd|web[- .]?dl|bluray|remux)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizedSeriesName(stream: StreamItem): string {
  const title = (stream.seriesTitle || stream.name)
    .replace(/^\s*[a-z]{2,4}\s*(?:[-|]\s*)?/i, '')
    .replace(/\s*(?:[-·|]\s*)?s\d{1,2}\s*e\d{1,3}.*$/i, '')
    .replace(/\s*\(\d{4}\)\s*/g, ' ')
    .toLocaleLowerCase()

  return title.replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Historic resume records were written before episodes retained their parent
 * series data. Reuse the known poster/series ID from another saved episode of
 * the same show so the home rail repairs itself without losing progress.
 */
function repairResumeEpisodeContexts(): boolean {
  const donors = new Map<string, StreamItem>()

  resumeEntries.forEach((entry) => {
    const stream = entry.stream

    if (!stream || stream.streamType !== 'episode') {
      return
    }

    const key = normalizedSeriesName(stream)
    const current = donors.get(key)
    const streamScore =
      (stream.seriesCover ? 4 : 0) +
      (stream.seriesId ? 2 : 0) +
      (stream.seriesTitle ? 1 : 0) +
      (stream.cover ? 1 : 0)
    const currentScore = current
      ? (current.seriesCover ? 4 : 0) +
        (current.seriesId ? 2 : 0) +
        (current.seriesTitle ? 1 : 0) +
        (current.cover ? 1 : 0)
      : -1

    if (streamScore > currentScore) {
      donors.set(key, stream)
    }
  })

  let changed = false

  resumeEntries.forEach((entry, key) => {
    const stream = entry.stream

    if (!stream || stream.streamType !== 'episode') {
      return
    }

    const donor = donors.get(normalizedSeriesName(stream))

    if (!donor) {
      return
    }

    const seriesCover = stream.seriesCover || donor.seriesCover || donor.cover
    const seriesId = stream.seriesId || donor.seriesId
    const seriesTitle = stream.seriesTitle || donor.seriesTitle

    if (
      seriesCover === stream.seriesCover &&
      seriesId === stream.seriesId &&
      seriesTitle === stream.seriesTitle
    ) {
      return
    }

    resumeEntries.set(key, {
      ...entry,
      stream: {
        ...stream,
        cover: seriesCover || stream.cover,
        seriesCover,
        seriesId,
        seriesTitle,
      },
    })
    changed = true
  })

  return changed
}

function resumeDuration(entry: ResumeEntry, stream: StreamItem): number | undefined {
  const duration = entry.duration ?? stream.metadata?.durationSeconds

  return typeof duration === 'number' && Number.isFinite(duration) && duration > 0
    ? duration
    : undefined
}

function resumeLabel(entry: ResumeEntry, stream: StreamItem): string {
  if (entry.completed) {
    return 'Watched'
  }

  const duration = resumeDuration(entry, stream)

  return duration
    ? `Resume ${formatDuration(entry.position)} of ${formatDuration(duration)}`
    : `Resume ${formatDuration(entry.position)}`
}

function rememberStreams(streams: StreamItem[]): void {
  streams.forEach((stream) => {
    const key = streamLookupKey(stream)

    if (knownStreams.has(key)) {
      knownStreams.delete(key)
    }

    knownStreams.set(key, stream)
  })

  while (knownStreams.size > MAX_KNOWN_STREAMS) {
    const oldestKey = knownStreams.keys().next().value

    if (!oldestKey) {
      break
    }

    knownStreams.delete(oldestKey)
  }
}

function streamCacheKey(section: LibrarySection, categoryId?: string): string {
  return `${section}:${categoryId ?? 'all'}`
}

function cachedStreams(section: LibrarySection, categoryId?: string): StreamItem[] | null {
  const key = streamCacheKey(section, categoryId)
  const cached = streamCache.get(key)

  if (!cached) {
    performanceTrace.event('cache', 'stream-memory-miss', { section })
    return null
  }

  if (Date.now() - cached.updatedAt > STREAM_CACHE_TTL_MS) {
    streamCache.delete(key)
    performanceTrace.event('cache', 'stream-memory-expired', {
      section,
      itemCount: cached.streams.length,
    })
    return null
  }

  streamCache.delete(key)
  streamCache.set(key, cached)
  performanceTrace.event('cache', 'stream-memory-hit', {
    section,
    itemCount: cached.streams.length,
    ageMs: Date.now() - cached.updatedAt,
  })
  return cached.streams
}

function cachedStreamItemCount(): number {
  let count = 0
  streamCache.forEach((entry) => {
    count += entry.streams.length
  })
  return count
}

function cacheStreams(section: LibrarySection, categoryId: string | undefined, streams: StreamItem[]): void {
  const key = streamCacheKey(section, categoryId)
  streamCache.delete(key)

  if (streams.length > MAX_CACHED_STREAM_ITEMS) {
    performanceTrace.event('cache', 'stream-memory-skip-oversized', {
      section,
      itemCount: streams.length,
    })
    return
  }

  streamCache.set(key, { streams, updatedAt: Date.now() })
  performanceTrace.event('cache', 'stream-memory-write', {
    section,
    itemCount: streams.length,
    cacheEntries: streamCache.size,
  })

  while (
    streamCache.size > MAX_STREAM_CACHE_ENTRIES ||
    cachedStreamItemCount() > MAX_CACHED_STREAM_ITEMS
  ) {
    const oldestKey = streamCache.keys().next().value

    if (!oldestKey) {
      break
    }

    streamCache.delete(oldestKey)
  }
}

function isAppHistoryState(value: unknown): value is AppHistoryState {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Partial<AppHistoryState>).novaPlay === true &&
    typeof (value as Partial<AppHistoryState>).depth === 'number'
  )
}

function initializeAppHistory(): void {
  if (isAppHistoryState(history.state)) {
    appHistoryDepth = history.state.depth
    return
  }

  history.replaceState({ novaPlay: true, depth: 0 } satisfies AppHistoryState, '', location.href)
}

function pushAppHistory(): void {
  appHistoryDepth += 1
  history.pushState({ novaPlay: true, depth: appHistoryDepth } satisfies AppHistoryState, '', location.href)
}

function requestAppBack(): boolean {
  if (appHistoryDepth > 0) {
    history.back()
    return true
  }

  return navigateBack()
}

function pushRouteHistory(): void {
  if (view !== 'login') {
    pushAppHistory()
  }
}

function armSearchBackCancellation(): void {
  // Some webOS remotes emit both a key event and a delayed browser-history
  // event for one physical Back press. Keep this marker until that history
  // event is consumed; a subsequent Back clears it before navigating away.
  retainSearchOnNextPopState = true
}

function retainSearchRouteAfterPopState(): void {
  retainSearchOnNextPopState = false
  pushAppHistory()
  document.querySelector<HTMLInputElement>('#global-search-input')?.focus({
    preventScroll: true,
  })
}

function startNavigation(): { token: number; signal: AbortSignal } {
  performanceTrace.event('route', 'navigation-start', {
    nextNavigationToken: navigationToken + 1,
  })

  navigationToken += 1
  navigationController?.abort()
  nowNextLoading.clear()
  navigationController = new AbortController()
  return { token: navigationToken, signal: navigationController.signal }
}

function isCurrentNavigation(token: number): boolean {
  return token === navigationToken && !navigationController?.signal.aborted
}

function invalidateSpatialLayout(reason = 'unspecified'): void {
  const wasPopulated = spatialLayoutCache.populated
  spatialLayoutCache.invalidate()
  performanceTrace.event('navigation', 'layout-invalidated', {
    reason,
    wasPopulated,
  })
}

function cancelPendingSpatialNavigation(): void {
  if (frameNavigation.pending) {
    performanceTrace.event('navigation', 'spatial-navigation-cancelled')
  }

  performanceTrace.endInteraction(pendingSpatialInteractionId, 'spatial-cancelled')
  pendingSpatialInteractionId = null
  frameNavigation.cancel()
}

function scrollDocumentBy(deltaY: number): void {
  const maximumScroll = Math.max(
    0,
    document.documentElement.scrollHeight - window.innerHeight,
  )
  const nextScroll = Math.max(0, Math.min(maximumScroll, window.scrollY + deltaY))

  if (nextScroll !== window.scrollY) {
    window.scrollTo(0, nextScroll)
    invalidateSpatialLayout('programmatic-scroll')
  }
}

function focusVisibilityDelta(target: HTMLElement): number {
  // Keep all geometry reads together before focus or scrolling writes. This
  // avoids a second forced layout in the D-pad hot path.
  const topbarBottom =
    document.querySelector<HTMLElement>('.topbar')?.getBoundingClientRect().bottom ?? 0
  const helpbarTop = document.querySelector<HTMLElement>('.helpbar')?.getBoundingClientRect().top
  const rect = target.getBoundingClientRect()

  return focusScrollDelta(
    rect.top,
    rect.bottom,
    window.innerHeight,
    {
      top: topbarBottom + 18,
      bottom: (helpbarTop ?? window.innerHeight) - 18,
    },
  )
}

function applyFocusVisibility(delta: number): void {
  if (delta !== 0) {
    window.scrollTo(0, window.scrollY + delta)
    invalidateSpatialLayout('focus-scroll')
  }
}

function ensureFocusVisible(target: HTMLElement): void {
  applyFocusVisibility(focusVisibilityDelta(target))
}

function searchText(stream: StreamItem): string {
  return stream.searchName ?? foldText(stream.name)
}

function cacheNowNext(key: string, value: NowNext): void {
  nowNextCache.set(key, value)
}

function streamFromKey(key: string | undefined): StreamItem | null {
  if (!key) {
    return null
  }

  if (selectedItem && streamLookupKey(selectedItem) === key) {
    return selectedItem
  }

  return (
    knownStreams.get(key) ??
    catalog?.streams.find((stream) => streamLookupKey(stream) === key) ??
    resumeEntries.get(key)?.stream ??
    favorites.get(key)?.stream ??
    null
  )
}

function snapshotFocus(): FocusSnapshot {
  const focused = document.activeElement

  return {
    id:
      focused instanceof HTMLElement
        ? focused.dataset.focusId ?? null
        : null,
    scrollY: window.scrollY,
    view: renderedView ?? view,
  }
}

function requestFocus(snapshot: FocusSnapshot | null): void {
  pendingFocus = snapshot
}

function isTextInput(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
}

function beginTextEditing(input: HTMLInputElement | HTMLTextAreaElement): void {
  editingInput = input
  input.removeAttribute('readonly')
  input.focus({ preventScroll: true })
  const end = input.value.length
  input.setSelectionRange(end, end)
}

function finishTextEditing(input = editingInput): boolean {
  if (!input) {
    return false
  }

  input.setAttribute('readonly', '')
  input.blur()
  editingInput = null
  return true
}

function captureReturnPoint(): ViewReturnPoint {
  return { view, focus: snapshotFocus() }
}

function defaultFocusTarget(): HTMLElement | null {
  const selectors =
    view === 'home'
      ? ['[data-focus-id="home-guide"]', '[data-focus-id="home-live"]']
      : view === 'catalog'
        ? [
            '.category-grid [data-focus-id]',
            '.content-grid [data-focus-id]',
            '.catalog-tools [data-focus-id]',
          ]
        : view === 'details'
          ? ['[data-focus-id="detail-play-next"]', '[data-focus-id="detail-play"]', '[data-focus-id="detail-content-guidance"]', '.metadata-people [data-focus-id]', '.series-episodes [data-focus-id]']
          : view === 'person'
            ? ['.person-filmography [data-focus-id]', '.person-header [data-focus-id]']
          : view === 'guide'
            ? ['.guide-grid [data-focus-id]', '.catalog-tools [data-focus-id]']
            : view === 'search'
              ? ['[data-focus-id="global-search-input"]', '.global-search-controls [data-focus-id]']
              : view === 'settings'
                ? ['[data-focus-id="settings-add-profile"]', '.settings-panel [data-focus-id]']
                : view === 'player'
                  ? ['#player-surface', '[data-focus-id="player-play"]']
                  : ['[autofocus]', '.login-form [data-focus-id]']

  for (const selector of selectors) {
    const target = document.querySelector<HTMLElement>(selector)
    if (target && !target.matches('[disabled], [data-nav-skip="true"]')) {
      return target
    }
  }

  return null
}

function restoreFocus(snapshot: FocusSnapshot | null): void {
  const requested = pendingFocus
  pendingFocus = null

  window.setTimeout(() => {
    const requestedTarget = requested?.id
      ? document.querySelector<HTMLElement>(`[data-focus-id="${cssEscape(requested.id)}"]`)
      : null
    const snapshotTarget =
      snapshot?.view === view && snapshot.id
        ? document.querySelector<HTMLElement>(`[data-focus-id="${cssEscape(snapshot.id)}"]`)
        : null
    const fallback =
      defaultFocusTarget() ??
      document.querySelector<HTMLElement>(
        '[autofocus], [data-focus-id]:not([data-nav-skip="true"]):not([disabled])',
      )
    const focusTarget =
      (requestedTarget?.matches(':not([disabled])') ? requestedTarget : null) ??
      (snapshotTarget?.matches(':not([disabled])') ? snapshotTarget : null) ??
      fallback

    focusTarget?.focus({ preventScroll: true })

    const scrollY = requested?.scrollY ?? (snapshotTarget ? snapshot?.scrollY : null)
    if (scrollY !== null && scrollY !== undefined) {
      window.scrollTo(0, scrollY)
    }

    if (focusTarget) {
      ensureFocusVisible(focusTarget)
    }
  }, 0)
}
function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&')
}

function replaceStreamExtension(source: string, extension: string): string {
  try {
    const url = new URL(source)
    url.pathname = url.pathname.replace(/\.[^/.]+$/, extension)
    return url.toString()
  } catch {
    const match = source.match(/^([^?#]*)([?#].*)?$/)

    if (!match) {
      return source
    }

    return `${match[1].replace(/\.[^/.]+$/, extension)}${match[2] ?? ''}`
  }
}

function toHlsUrl(source: string): string {
  return replaceStreamExtension(source, '.m3u8')
}

function toTransportStreamUrl(source: string): string {
  return replaceStreamExtension(source, '.ts')
}

function renderShell(content: string, title = currentViewTitle()): void {
  cancelPendingSpatialNavigation()
  const snapshot = snapshotFocus()
  const renderId = performanceTrace.beginRender(view, {
    htmlCharacters: content.length,
  })
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <button class="brand" data-action="home" data-focus-id="top-home" aria-label="Go to home">
          <span class="brand-mark">N</span>
          <span>Nova <strong>Play</strong></span>
        </button>
        <div class="crumb">${escape(title)}</div>
        <div class="topbar-actions">
          <button class="icon-button" data-action="global-search" data-focus-id="top-search" aria-label="Global search" title="Global search">${icon('search')}</button>
          <button class="icon-button" data-action="favorites" data-focus-id="top-favorites" aria-label="Open favorites" title="Favorites">${icon('star')}</button>
          <button class="icon-button" data-action="settings" data-focus-id="top-settings" aria-label="Settings" title="Settings">${icon('settings')}</button>
        </div>
      </header>
      <main class="page">${content}</main>
      <footer class="helpbar">
        <span><kbd>← ↑ ↓ →</kbd> Navigate</span>
        <span><kbd>OK</kbd> Select</span>
        <span><kbd>RED</kbd> Favorites</span>
        <span><kbd>GREEN</kbd> Guide</span>
        <span><kbd>YELLOW</kbd> Sort</span>
        <span><kbd>BLUE</kbd> Settings</span>
        <span><kbd>BACK</kbd> Return</span>
      </footer>
    </div>
  `
  invalidateSpatialLayout('shell-replaced')
  bindEvents()
  performanceTrace.trackImages(app, { renderId: renderId ?? undefined })
  performanceTrace.endRender(renderId, {
    focusableCount: app.querySelectorAll('[data-focus-id]').length,
    imageCount: app.querySelectorAll('img').length,
  })
  renderedView = view
  restoreFocus(snapshot)
}

function catalogResultsFor(activeCatalog: CatalogState): CatalogResults {
  const normalizedQuery = normalizeQuery(activeCatalog.query)
  const tokens = queryTokens(activeCatalog.query)
  const key = [
    activeCatalog.category?.id ?? 'categories',
    normalizedQuery,
    activeCatalog.sort,
    settings.hideAdultContent ? 'adult-hidden' : 'adult-visible',
    activeCatalog.categories.length,
    activeCatalog.streams.length,
  ].join('|')

  if (activeCatalog.results?.key === key) {
    return activeCatalog.results
  }

  const categories = sortCategories(
    activeCatalog.categories.filter(
      (category) =>
        matchesQuery(foldText(category.name), tokens) &&
        (!settings.hideAdultContent || !isAdult(category.name)),
    ),
  )
  const streams = sortStreams(
    activeCatalog.streams.filter(
      (stream) =>
        matchesQuery(searchText(stream), tokens) &&
        visibleStream(stream),
    ),
    activeCatalog.sort,
  )
  const results = { key, categories, streams }
  activeCatalog.results = results
  return results
}

function renderLogin(): void {
  const snapshot = snapshotFocus()
  const renderId = performanceTrace.beginRender('login')
  invalidateSpatialLayout('login-replaced')
  const profiles = profileSummaries()

  app.innerHTML = `
    <main class="login-page">
      <section class="login-panel">
        <div class="login-brand"><span class="brand-mark">N</span><h1>Nova <strong>Play</strong></h1></div>
        <p class="lead">Your private IPTV library for webOS.</p>
        ${
          profiles.length
            ? `<div class="profile-quick-switch">
                <p>Saved playlists</p>
                <div>${profiles
                  .map(
                    (savedProfile) =>
                      `<button class="secondary-button" data-action="switch-profile" data-profile-id="${escape(savedProfile.id)}" data-focus-id="profile-${escape(savedProfile.id)}">${escape(savedProfile.name)}</button>`,
                  )
                  .join('')}</div>
              </div>`
            : ''
        }
        <form id="login-form" class="login-form">
          <label>Playlist name<input name="name" autocomplete="off" maxlength="60" placeholder="My IPTV" readonly autofocus required aria-label="Playlist name. Press OK to type." /></label>
          <label>Server URL<input name="serverUrl" autocomplete="url" inputmode="url" placeholder="https://provider.example:8080" readonly required aria-label="Server URL. Press OK to type." /></label>
          <div class="form-grid">
            <label>Username<input name="username" autocomplete="username" readonly required aria-label="Username. Press OK to type." /></label>
            <label>Password<input name="password" type="password" autocomplete="current-password" readonly required aria-label="Password. Press OK to type." /></label>
          </div>
          <p id="login-error" class="form-error" role="alert"></p>
          <button class="primary-button" type="submit" data-focus-id="login-connect">Connect securely</button>
        </form>
        <p class="fine-print">Your login is stored only on this TV. It is never sent anywhere except your IPTV provider. Add HTTPS-capable playlists whenever possible.</p>
      </section>
    </main>
  `

  const loginForm = document.querySelector<HTMLFormElement>('#login-form')

  loginForm?.addEventListener('submit', async (event: SubmitEvent) => {
    event.preventDefault()
    const form = new FormData(loginForm)
    const error = document.querySelector<HTMLElement>('#login-error')
    const button = loginForm.querySelector<HTMLButtonElement>('button[type="submit"]')
    const nextProfile: XtreamProfile = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
      name: String(form.get('name')).trim() || 'My IPTV',
      serverUrl: String(form.get('serverUrl')).trim(),
      username: String(form.get('username')).trim(),
      password: String(form.get('password')),
    }

    try {
      if (button) {
        button.disabled = true
        button.textContent = 'Connecting…'
      }
      if (error) {
        error.textContent = ''
      }

      const { token, signal } = startNavigation()
      const nextClient = new ProviderBroker(nextProfile)
      const nextAccount = await nextClient.validate(signal)

      if (!isCurrentNavigation(token)) {
        return
      }

      if (!saveProfile(nextProfile)) {
        throw new Error(STORAGE_FAILURE_MESSAGE)
      }

      account = nextAccount
      activateProfile(nextProfile, nextClient)
      view = 'home'
      render()
    } catch (reason) {
      if (error) {
        error.textContent = reason instanceof Error ? reason.message : 'Unable to connect.'
      }
    } finally {
      if (button?.isConnected) {
        button.disabled = false
        button.textContent = 'Connect securely'
      }
    }
  })

  bindEvents()
  performanceTrace.trackImages(app, { renderId: renderId ?? undefined })
  performanceTrace.endRender(renderId, {
    focusableCount: app.querySelectorAll('[data-focus-id]').length,
  })
  renderedView = view
  restoreFocus(snapshot)
}

function renderHome(): void {
  const connectionSummary = account ? 'Connected' : 'Ready to watch'
  const expiry = account?.expiresAt ? `Expires ${formatDate(account.expiresAt)} · ` : ''
  const continueEntries = continueWatching(resumeEntries)
    .filter((entry) => Boolean(entry.stream && visibleStream(entry.stream)))
    .slice(0, 12)

  renderShell(`
    <section class="hero hero-cinematic">
      <div class="hero-copy">
        <p class="eyebrow">${escape(profile?.name ?? 'My IPTV')}</p>
        <h1>What would you like to watch?</h1>
        <p>${escape(expiry)}${escape(connectionSummary)}</p>
        <div class="hero-status"><span class="status-pulse" aria-hidden="true"></span>Ready when you are</div>
      </div>
      <div class="hero-actions" data-nav-zone="home-hero">
        <button class="secondary-button" data-action="open-guide" data-focus-id="home-guide">TV Guide</button>
        <button class="secondary-button" data-action="refresh-account" data-focus-id="home-refresh">Refresh account</button>
      </div>
    </section>
    ${
      continueEntries.length
        ? `<section class="home-rail">
            <div class="rail-heading"><div><p class="eyebrow">Continue watching</p><h2>Pick up where you left off</h2></div><span class="rail-caption">Your next episode is waiting</span></div>
            <section class="content-grid continue-grid" data-nav-zone="home-continue" aria-label="Continue watching">
              ${continueEntries.map((entry) => streamCard(entry.stream!, entry)).join('')}
            </section>
          </section>`
        : ''
    }
    <section class="hub-grid" data-nav-zone="home-hub">
      ${libraryCard('live', icon('live'), 'Live TV', 'Browse channels, current programmes, and the TV guide.')}
      ${libraryCard('vod', icon('movie'), 'Movies', 'Explore rich movie details, trailers, and resume playback.')}
      ${libraryCard('series', icon('series'), 'Series', 'Pick up a show where you left off, episode by episode.')}
      <button class="hub-card favorites" data-action="favorites" data-focus-id="home-favorites">
        <span class="hub-card-kicker">Your library</span><span class="hub-icon favorite-icon">${icon('star')}</span><span class="hub-label">Favorites</span><span class="hub-description">Your saved channels and titles in one place.</span>
      </button>
    </section>
  `)
}

function libraryCard(
  section: LibrarySection,
  icon: string,
  title: string,
  description: string,
): string {
  return `
    <button class="hub-card ${section}" data-action="open-section" data-section="${section}" data-focus-id="home-${section}">
      <span class="hub-card-kicker">Explore</span><span class="hub-icon">${icon}</span><span class="hub-label">${title}</span><span class="hub-description">${description}</span>
    </button>
  `
}

function renderCatalog(): void {
  if (!catalog) {
    view = 'home'
    render()
    return
  }

  const results = catalogResultsFor(catalog)
  const visibleCategories = results.categories
  const filteredStreams = results.streams
  const itemCount = catalog.category === null ? visibleCategories.length : filteredStreams.length
  const pageSize = catalogPageSize()
  const pageCount = Math.max(1, Math.ceil(itemCount / pageSize))
  catalog.page = Math.max(0, Math.min(catalog.page, pageCount - 1))
  const pageStart = catalog.page * pageSize
  const pageCategories = visibleCategories.slice(pageStart, pageStart + pageSize)
  const pageStreams = filteredStreams.slice(pageStart, pageStart + pageSize)
  const activeCategory = catalog.category?.name ?? 'All categories'
  const catalogLabel = catalog.isFavorites ? 'Favorites' : labels[catalog.section]
  const searchTarget = catalog.isFavorites
    ? 'favorites'
    : catalog.category === null
      ? 'categories'
      : labels[catalog.section].toLowerCase()
  const catalogNavigation = catalog.isFavorites
    ? ''
    : catalog.category === null
      ? '<button class="secondary-button" data-action="home" data-focus-id="catalog-home">Home</button>'
      : `<button class="secondary-button" data-action="return-to-library" data-focus-id="catalog-back" aria-label="Back to ${labels[catalog.section]}">← ${labels[catalog.section]}</button>`

  renderShell(`
    <section class="catalog-heading">
      <div><p class="eyebrow">${catalogLabel}</p><h1>${escape(activeCategory)}</h1></div>
      <div class="catalog-tools">
        ${catalogNavigation}
        ${
          catalog.category !== null
            ? `<button class="secondary-button" data-action="cycle-sort" data-focus-id="catalog-sort">Sort: ${SORT_LABELS[catalog.sort]}</button>`
            : ''
        }
        ${catalog.section === 'live' && !catalog.isFavorites ? '<button class="secondary-button" data-action="open-guide" data-focus-id="catalog-guide">Guide</button>' : ''}
        <label class="search">${icon('search', 'search-icon')}<input id="search-input" data-focus-id="catalog-search" placeholder="Search ${searchTarget}" value="${escape(catalog.query)}" readonly aria-label="Search ${searchTarget}. Press OK to type." /></label>
      </div>
    </section>
    ${
      catalog.category === null
        ? `<section class="category-grid" aria-label="${catalogLabel} categories">
            ${
              pageCategories.length
                ? pageCategories.map((category) => categoryCard(category)).join('')
                : catalog.availabilityMessage
                  ? `<div class="empty-state"><h2>Library not downloaded yet</h2><p>${escape(catalog.availabilityMessage)}</p></div>`
                  : '<div class="empty-state"><h2>No categories found</h2><p>Try a different search term or change parental controls in Settings.</p></div>'
            }
          </section>`
        : catalog.isFavorites
          ? renderFavoriteGroups(pageStreams)
          : `<section class="content-grid" aria-label="${catalogLabel}">
              ${
                pageStreams.length
                  ? pageStreams.map((stream) => streamCard(stream)).join('')
                  : '<div class="empty-state"><h2>Nothing found</h2><p>Try a different category, sort, or search term.</p></div>'
              }
            </section>`
    }
    ${renderCatalogPager(itemCount, pageCount)}
  `)

  bindSearchInput(
    document.querySelector<HTMLInputElement>('#search-input'),
    scheduleCatalogSearch,
  )

}

// Wire a search input so it filters on debounced input but ignores events that
// fire mid-IME-composition (which would otherwise search on half-typed text).
function bindSearchInput(
  input: HTMLInputElement | null | undefined,
  schedule: (value: string) => void,
): void {
  if (!input) {
    return
  }

  let composing = false

  input.addEventListener('compositionstart', () => {
    composing = true
  })
  input.addEventListener('compositionend', () => {
    composing = false
    schedule(input.value)
  })
  input.addEventListener('input', (event) => {
    if (composing) {
      return
    }

    schedule((event.target as HTMLInputElement).value)
  })
}

function scheduleCatalogSearch(value: string): void {
  if (!catalog) {
    return
  }

  const targetCatalog = catalog
  const input = document.querySelector<HTMLInputElement>('#search-input')
  const selectionStart = input?.selectionStart ?? value.length
  const selectionEnd = input?.selectionEnd ?? selectionStart
  const wasEditing = editingInput === input

  if (searchDebounceTimer !== null) {
    window.clearTimeout(searchDebounceTimer)
  }

  searchDebounceTimer = window.setTimeout(() => {
    searchDebounceTimer = null

    if (catalog !== targetCatalog || view !== 'catalog') {
      return
    }

    // Skip a full catalog re-render when the effective query is unchanged (e.g.
    // caret/selection moved, or trailing whitespace toggled). matchesQuery
    // tokenizes on whitespace, so only a token-level change alters results.
    if (normalizeQuery(catalog.query) === normalizeQuery(value)) {
      catalog.query = value
      return
    }

    catalog.query = value
    catalog.page = 0
    requestFocus({ id: 'catalog-search', scrollY: window.scrollY, view: 'catalog' })
    renderCatalog()

    if (wasEditing) {
      window.setTimeout(() => {
        const replacement = document.querySelector<HTMLInputElement>('#search-input')
        if (!replacement) {
          return
        }

        beginTextEditing(replacement)
        replacement.setSelectionRange(selectionStart, selectionEnd)
      }, 0)
    }
  }, CATALOG_SEARCH_DEBOUNCE_MS)
}

function renderFavoriteGroups(streams: StreamItem[]): string {
  if (!streams.length) {
    return '<section class="empty-state"><h2>No favorites yet</h2><p>Press the star on a channel, movie, or series to save it here.</p></section>'
  }

  return (['live', 'vod', 'series'] as LibrarySection[])
    .map((section) => {
      const group = streams.filter((stream) => stream.section === section)

      if (!group.length) {
        return ''
      }

      return `
        <section class="favorite-group" aria-label="${labels[section]} favorites">
          <h2>${labels[section]}</h2>
          <div class="content-grid">${group.map((stream) => streamCard(stream)).join('')}</div>
        </section>
      `
    })
    .join('')
}

function renderCatalogPager(itemCount: number, pageCount: number): string {
  if (!catalog || pageCount <= 1) {
    return ''
  }

  return `
    <nav class="catalog-pager" aria-label="Catalog pages">
      <button class="secondary-button" data-action="catalog-prev" data-focus-id="catalog-prev" ${catalog.page === 0 ? 'disabled' : ''}>← Previous</button>
      <span>Page ${catalog.page + 1} of ${pageCount} · ${itemCount} items</span>
      <button class="secondary-button" data-action="catalog-next" data-focus-id="catalog-next" ${catalog.page >= pageCount - 1 ? 'disabled' : ''}>Next →</button>
    </nav>
  `
}

function categoryCard(category: Category): string {
  return `
    <button class="category-card" data-action="select-category" data-category-id="${escape(category.id)}" data-focus-id="category-${escape(category.id)}">
      <span class="category-card-icon">${icon('grid')}</span>
      <span>${escape(category.name)}</span>
    </button>
  `
}

function cardRating(stream: StreamItem): string {
  const rawRating = stream.metadata?.rating ?? stream.rating
  const numericRating = rawRating ? Number(rawRating) : Number.NaN

  if (!Number.isFinite(numericRating) || numericRating <= 0) {
    return ''
  }

  const roundedRating = Math.round(numericRating * 10) / 10
  const displayRating = Number.isInteger(roundedRating)
    ? String(roundedRating)
    : roundedRating.toFixed(1)

  return `<span class="media-rating" aria-label="IMDb rating ${escape(displayRating)}">IMDb ${escape(displayRating)}</span>`
}

function suppressRemoteArtworkForLocalLibrary(): boolean {
  return view === 'catalog' || view === 'search'
}

function isRemoteArtworkSource(source: string): boolean {
  return /^(?:https?:)?\/\//i.test(source)
}

function liveArtwork(stream: StreamItem): string {
  const language =
    stream.name.match(/^\s*([a-z]{2,4})\s*[|:-]/i)?.[1]?.toLocaleUpperCase() ??
    'LIVE'
  const title =
    stream.name
      .replace(/^\s*[a-z]{2,4}\s*[|:-]\s*/i, '')
      .replace(/\s+\b(fhd|uhd|4k|hd|lq|raw)\b/gi, '')
      .trim() || stream.name
  const monogram =
    title
      .split(/[^a-z0-9]+/i)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word.charAt(0).toLocaleUpperCase())
      .join('') || language
  const providerLogo =
    stream.icon &&
    !(
      suppressRemoteArtworkForLocalLibrary() &&
      isRemoteArtworkSource(stream.icon)
    )
      ? `<span class="live-logo-frame"><img class="channel-logo live-channel-logo" src="${escape(stream.icon)}" alt="" loading="lazy" /></span>`
      : ''

  return `
    <span class="live-channel-artwork ${providerLogo ? 'has-provider-logo' : ''}">
      ${providerLogo}
      <span class="channel-artwork-fallback" aria-hidden="true">
        <span class="channel-artwork-language">${escape(language)}</span>
        <span class="channel-artwork-monogram">${escape(monogram)}</span>
        <span class="channel-artwork-title">${escape(title)}</span>
      </span>
    </span>
  `
}

function catalogArtworkSource(source: string): string {
  // Provider catalogues frequently return TMDB's `original` artwork. A card
  // never displays enough pixels to justify decoding a 2K–3K image on webOS;
  // request TMDB's poster-sized rendition before the deferred loader admits it.
  return source.replace(
    /(https?:\/\/image\.tmdb\.org\/t\/p\/)(?:original|w\d+(?:_and_h\d+_bestv2)?)(\/)/i,
    '$1w342$2',
  )
}

function posterArtwork(stream: StreamItem): string {
  var source: string | undefined
  var fallbackSource: string | undefined

  if (stream.streamType === 'episode') {
    // Attempt the per-episode still first (distinct thumbnail), falling back to
    // the series poster on load error via data-fallback-src, then to the text
    // tile via the existing image-unavailable path.
    const sources = episodeThumbnailSources(stream)
    source = sources.primary || stream.icon

    const fallbackPoster = source
      ? sources.fallback || (sources.primary !== stream.icon ? stream.icon : undefined)
      : undefined

    if (fallbackPoster && fallbackPoster !== source) {
      fallbackSource = fallbackPoster
    }
  } else {
    source = stream.cover || stream.metadata?.cover || stream.seriesCover || stream.icon
  }

  if (
    !source ||
    (suppressRemoteArtworkForLocalLibrary() && isRemoteArtworkSource(source))
  ) {
    return imageOrPlaceholder(undefined, stream.name, 'poster')
  }

  const optimizedSource = catalogArtworkSource(source)
  const optimizedFallback = fallbackSource
    ? catalogArtworkSource(fallbackSource)
    : undefined
  const fallbackAttr =
    optimizedFallback && optimizedFallback !== optimizedSource
      ? ` data-fallback-src="${escape(optimizedFallback)}"`
      : ''

  return `
    <span class="poster-artwork image-deferred">
      <img class="poster" data-deferred-src="${escape(optimizedSource)}"${fallbackAttr} alt="" />
      <span class="poster-fallback" aria-hidden="true">${escape(stream.name.slice(0, 1))}</span>
    </span>
  `
}

function streamCard(stream: StreamItem, resume?: ResumeEntry): string {
  const isLive = stream.section === 'live'
  const favorite = hasFavorite(favorites, stream)
  const streamKey = streamLookupKey(stream)
  const storedResume = resume ?? resumeEntries.get(streamKey)
  const image = isLive ? liveArtwork(stream) : posterArtwork(stream)
  const nowNext = nowNextCache.get(streamKey)
  const subtitle = streamDisplaySubtitle(stream)
  const meta = isLive
    ? nowNext?.now
      ? `Now: ${nowNext.now.title}`
      : 'Live · loading now/next…'
    : storedResume
      ? resumeLabel(storedResume, stream)
      : stream.rating ?? stream.year ?? 'On demand'

  return `
    <article class="media-card ${isLive ? 'is-live' : ''} ${storedResume?.completed ? 'is-watched' : ''}">
      ${cardRating(stream)}
      <button class="media-select" data-action="select-stream" data-stream-key="${escape(streamKey)}" data-resume-card="${storedResume && !storedResume.completed ? 'true' : 'false'}" data-focus-id="stream-${escape(streamKey)}">
        <span class="artwork ${isLive ? 'live-artwork' : ''}">${image}</span>
        <span class="media-info">
          <span class="media-name">${escape(streamDisplayTitle(stream))}</span>
          ${subtitle ? `<span class="media-subtitle">${escape(subtitle)}</span>` : ''}
          <span class="media-meta" data-now-next-key="${escape(streamKey)}">${escape(meta)}</span>
          ${
            storedResume && !storedResume.completed
              ? `<span class="resume-progress" style="--resume-progress:${resumePercent(storedResume, stream)}%"></span>`
              : ''
          }
        </span>
      </button>
      <button class="favorite-button ${favorite ? 'is-favorite' : ''}" data-action="toggle-favorite" data-favorite-key="${escape(streamKey)}" data-favorite-style="icon" data-nav-skip="true" tabindex="-1" aria-label="Toggle favorite">${icon(favorite ? 'starFilled' : 'star')}</button>
    </article>
  `
}

function resumePercent(entry: ResumeEntry, stream: StreamItem): number {
  const duration = resumeDuration(entry, stream)

  if (!duration) {
    return 20
  }

  return Math.max(3, Math.min(100, (entry.position / duration) * 100))
}

function renderDetails(): void {
  const item = selectedItem

  if (!item) {
    view = 'catalog'
    render()
    return
  }

  const metadata = metadataForCurrentDetail()
  const media = metadata.cover ?? item.cover ?? item.icon
  const description = metadata.plot ?? item.plot ?? 'No description provided by this IPTV provider.'
  const detailFacts = [
    metadata.genre,
    metadata.rating ?? item.rating,
    metadata.releaseDate ?? metadata.year ?? item.year,
    metadata.duration,
  ].filter((fact): fact is string => Boolean(fact))
  const backdrop = metadata.backdrops?.[0] ?? media

  const isParentSeries = item.section === 'series' && !item.streamType

  renderShell(`
    <section class="detail-hero ${isParentSeries ? 'series-detail-hero' : ''}">
      <div class="detail-backdrop" aria-hidden="true">
        ${backdrop ? `<img src="${escape(backdrop)}" alt="" />` : ''}
      </div>
      <div class="detail-layout detail-layout-cinematic ${isParentSeries ? 'series-detail-layout' : ''}">
        <div class="detail-art">${imageOrPlaceholder(media, item.name, 'detail-image')}</div>
        <div class="detail-copy">
          <p class="eyebrow">${item.section === 'series' ? 'Series' : item.streamType === 'episode' ? `Season ${escape(item.season ?? '')} · Episode ${escape(item.episodeNumber ?? '')}` : item.section === 'live' ? 'Live TV' : 'Movie'}</p>
          <h1>${escape(selectedSeries?.info.name ?? item.name)}</h1>
          <div class="detail-chips">${detailFacts.length ? detailFacts.map((fact) => `<span>${escape(fact)}</span>`).join('') : '<span>Available now</span>'}</div>
          ${selectedTitleEnrichment?.tagline ? `<p class="detail-tagline">${escape(selectedTitleEnrichment.tagline)}</p>` : ''}
          <p class="plot">${escape(description)}</p>
          ${renderContentGuidance(metadata)}
          ${renderRichMetadata(metadata)}
          ${detailActions(item, metadata)}
        </div>
      </div>
    </section>
    ${item.section !== 'live' ? renderEnrichedMetadata() : ''}
    ${renderEpisodeList()}
    <section id="now-next-panel"></section>
    <section id="epg-panel"></section>
  `)

  if (item.section === 'live') {
    void loadLiveDetails(item)
  }
}

function detailsMetadata(item: StreamItem): RichMetadata {
  if (item.section === 'vod') {
    return selectedVod?.metadata ?? item.metadata ?? {}
  }

  if (item.section === 'series') {
    return selectedSeries?.info ?? item.metadata ?? {}
  }

  return item.metadata ?? {}
}

function renderPersonCard(person: PersonSummary, role: string, group: 'cast' | 'crew'): string {
  const canOpenProfile = metadataServiceConfigured() && !person.id.startsWith('tvmaze-')

  return `
    <button class="person-card" ${canOpenProfile ? `data-action="open-person" data-person-id="${escape(person.id)}" data-person-name="${escape(person.name)}"` : 'disabled'} data-focus-id="${group}-person-${escape(person.id)}">
      <span class="person-portrait">${imageOrPlaceholder(person.profileImage, person.name, 'person-image')}</span>
      <span class="person-card-copy"><strong>${escape(person.name)}</strong><small>${escape(role)}</small></span>
    </button>
  `
}

function isRatingCandidate(value: unknown): value is RatingCandidate {
  return (
    typeof value === 'object' &&
    value !== null &&
    'provider' in value &&
    'sourceLabel' in value
  )
}

function metadataForCurrentDetail(): RichMetadata {
  const metadata = selectedItem ? detailsMetadata(selectedItem) : {}
  const candidates = dedupeRatingCandidates(
    [
      ...(metadata.contentRatings ?? []),
      ...(selectedTitleEnrichment?.contentRatings ?? []),
      metadata.contentRating,
      selectedTitleEnrichment?.contentRating,
    ].filter(isRatingCandidate),
  )
  const resolution = resolveContentRating(candidates)

  return {
    ...metadata,
    contentRatings: candidates.length ? candidates : undefined,
    ratingResolution: resolution,
    contentRating: resolution.selected,
    ageGuidance: resolution.ageGuidance,
  }
}

function renderEnrichedMetadata(): string {
  const metadata = metadataForCurrentDetail()
  const enrichment = selectedTitleEnrichment
  const cast = effectivePeople(metadata, 'cast').slice(0, 12)
  const crew = effectivePeople(metadata, 'crew')
    .filter((person) => person.job || person.department)
    .slice(0, 8)
  const related = enrichment?.related?.slice(0, 10) ?? []

  if (!enrichment && !cast.length && !crew.length) {
    return titleEnrichmentLoading
      ? '<section class="metadata-loading" aria-live="polite">Loading cast and crew…</section>'
      : ''
  }

  return `
    ${
      cast.length
        ? `<section class="metadata-section"><div class="metadata-heading"><h2>Cast</h2><span>Explore people</span></div><div class="metadata-people">${cast.map((person) => renderPersonCard(person, person.character ?? 'Cast', 'cast')).join('')}</div></section>`
        : ''
    }
    ${
      crew.length
        ? `<section class="metadata-section"><div class="metadata-heading"><h2>Directors & crew</h2></div><div class="metadata-people">${crew.map((person) => renderPersonCard(person, person.job ?? person.department ?? 'Crew', 'crew')).join('')}</div></section>`
        : ''
    }
    ${
      related.length
        ? `<section class="metadata-section"><div class="metadata-heading"><h2>You may also like</h2></div><div class="metadata-title-row">${related.map(renderMetadataTitleCard).join('')}</div></section>`
        : ''
    }
    <p class="metadata-attribution">${
      enrichment?.tmdbId.startsWith('tvmaze-')
        ? 'Cast portraits provided by TVmaze.'
        : enrichment
          ? 'Metadata and images provided by TMDB.'
          : 'People details supplied by your IPTV provider.'
    }</p>
  `
}

function renderMetadataTitleCard(title: RelatedTitle): string {
  return `
    <button class="metadata-title-card" data-action="open-related-title" data-tmdb-id="${escape(title.id)}" data-media-type="${title.mediaType}" data-title="${escape(title.title)}" data-year="${escape(title.year ?? '')}" data-focus-id="related-${title.mediaType}-${escape(title.id)}">
      <span class="metadata-title-art">${imageOrPlaceholder(title.poster, title.title, 'metadata-title-image')}</span>
      <span><strong>${escape(title.title)}</strong><small>${escape([title.year, title.rating ? `★ ${title.rating}` : ''].filter(Boolean).join(' · '))}</small></span>
    </button>
  `
}

function renderContentGuidance(metadata: RichMetadata): string {
  const rating = metadata.contentRating?.value ?? '-'
  const age = metadata.ageGuidance?.suggestedMinimumAge === undefined
    ? '-'
    : `${metadata.ageGuidance.suggestedMinimumAge}+`
  const provenance = metadata.ratingResolution
    ? ratingSourceSummary(metadata.ratingResolution)
    : ''
  const accessibleName = [
    'Content classification',
    `PG: ${rating}`,
    `Age: ${age}`,
    provenance,
  ].filter(Boolean).join('. ')

  return `
    <button class="content-guidance" type="button" data-focus-id="detail-content-guidance" aria-label="${escape(accessibleName)}">
      <span class="content-guidance-value"><strong>PG:</strong> ${escape(rating)}</span>
      <span class="content-guidance-separator" aria-hidden="true">·</span>
      <span class="content-guidance-value"><strong>Age:</strong> ${escape(age)}</span>
      ${provenance ? `<small class="content-guidance-provenance">${escape(provenance)}</small>` : ''}
    </button>
  `
}

function effectivePeople(metadata: RichMetadata, group: 'cast' | 'crew'): PersonSummary[] {
  const enriched = group === 'cast'
    ? selectedTitleEnrichment?.cast
    : selectedTitleEnrichment?.crew

  return enriched?.length
    ? enriched
    : group === 'cast'
      ? metadata.providerCast ?? []
      : metadata.providerCrew ?? []
}

function renderRichMetadata(metadata: RichMetadata): string {
  const details = [
    metadata.cast ? `<p><strong>Cast:</strong> ${escape(metadata.cast)}</p>` : '',
    metadata.director ? `<p><strong>Director:</strong> ${escape(metadata.director)}</p>` : '',
    metadata.country ? `<p><strong>Country:</strong> ${escape(metadata.country)}</p>` : '',
  ].filter(Boolean)

  return details.length ? `<div class="rich-metadata">${details.join('')}</div>` : ''
}

function detailActions(item: StreamItem, metadata: RichMetadata): string {
  const streamKey = streamLookupKey(item)

  if (item.section === 'series' && !item.streamType) {
    const nextEpisode = nextSeriesEpisode()
    const progress = selectedSeries
      ? seriesProgressSummary(Object.values(selectedSeries.episodes).flat())
      : ''

    return `
      ${progress}
      <div class="action-row series-action-row">
        ${
          nextEpisode
            ? `<button class="primary-button" data-action="play-next-episode" data-stream-key="${escape(streamLookupKey(nextEpisode))}" data-focus-id="detail-play-next">▶ ${resumeEntries.get(streamLookupKey(nextEpisode))?.position ? 'Continue' : 'Start'} ${escape(episodeIdentifier(nextEpisode))}</button>`
            : ''
        }
        <button class="secondary-button" data-action="toggle-favorite" data-favorite-key="${escape(streamKey)}" data-favorite-style="label" data-focus-id="detail-favorite">${hasFavorite(favorites, item) ? '★ Saved to favorites' : '☆ Add to favorites'}</button>
      </div>
    `
  }

  const resume = resumeEntries.get(streamKey)
  const canMarkWatched = item.section !== 'live'
  const canCatchup = item.section === 'live' && item.catchup?.available

  return `
    ${
      resume && item.section !== 'live'
        ? `<p class="resume-detail-status ${resume.completed ? 'is-watched' : ''}">${escape(resumeLabel(resume, item))}</p>${
            !resume.completed
              ? `<span class="resume-detail-progress" style="--resume-progress:${resumePercent(resume, item)}%"></span>`
              : ''
          }`
        : ''
    }
    <div class="action-row">
      <button class="primary-button" data-action="play-selected" data-focus-id="detail-play">▶ ${item.section === 'live' ? 'Watch live' : resume && !resume.completed ? 'Resume' : 'Play'}</button>
      <button class="secondary-button" data-action="toggle-favorite" data-favorite-key="${escape(streamKey)}" data-favorite-style="label" data-focus-id="detail-favorite">${hasFavorite(favorites, item) ? '★ Saved' : '☆ Add favorite'}</button>
      ${canMarkWatched ? `<button class="secondary-button" data-action="toggle-watched" data-focus-id="detail-watched">${resume?.completed ? '✓ Mark unwatched' : '✓ Mark watched'}</button>` : ''}
      ${metadata.trailer ? '<button class="secondary-button" data-action="watch-trailer" data-focus-id="detail-trailer">Trailer ↗</button>' : ''}
      ${item.section === 'live' ? '<button class="secondary-button" data-action="show-epg" data-focus-id="detail-schedule">Schedule</button>' : ''}
      ${canCatchup ? '<button class="secondary-button" data-action="show-catchup" data-focus-id="detail-catchup">Catch-up</button>' : ''}
    </div>
  `
}

function seriesProgressSummary(episodes: StreamItem[]): string {
  const entries = episodes
    .map((episode) => resumeEntries.get(streamLookupKey(episode)))
    .filter((entry): entry is ResumeEntry => Boolean(entry))
  const watched = entries.filter((entry) => entry.completed).length
  const inProgress = entries.filter((entry) => !entry.completed && entry.position > 0).length
  const total = episodes.length

  return `<p class="episode-summary">${watched} of ${total} watched${inProgress ? ` · ${inProgress} in progress` : ''}</p>`
}

function compareSeasonNames(left: string, right: string): number {
  // Treat empty digit extraction as NaN so non-numeric names ("Specials",
  // "Extras") never collapse to 0 and sort ahead of real numbered seasons.
  const leftDigits = left.replace(/[^\d.]/g, '')
  const rightDigits = right.replace(/[^\d.]/g, '')
  const leftNumber = leftDigits ? Number(leftDigits) : Number.NaN
  const rightNumber = rightDigits ? Number(rightDigits) : Number.NaN
  const leftIsNumeric = Number.isFinite(leftNumber)
  const rightIsNumeric = Number.isFinite(rightNumber)

  if (leftIsNumeric && rightIsNumeric && leftNumber !== rightNumber) {
    return leftNumber - rightNumber
  }

  // Numbered seasons sort before non-numeric ones (e.g. Season 3 before Specials).
  if (leftIsNumeric !== rightIsNumeric) {
    return leftIsNumeric ? -1 : 1
  }

  return left.localeCompare(right)
}

function orderedSeriesEpisodes(): StreamItem[] {
  if (!selectedSeries) {
    return []
  }

  return Object.entries(selectedSeries.episodes)
    .sort(([left], [right]) => compareSeasonNames(left, right))
    .flatMap(([, episodes]) =>
      [...episodes].sort((left, right) => {
        const leftNumber = Number(left.episodeNumber)
        const rightNumber = Number(right.episodeNumber)

        if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
          return leftNumber - rightNumber
        }

        return left.name.localeCompare(right.name)
      }),
    )
}

function nextSeriesEpisode(): StreamItem | null {
  const episodes = orderedSeriesEpisodes()
  const inProgress = episodes.find((episode) => {
    const entry = resumeEntries.get(streamLookupKey(episode))
    return Boolean(entry && !entry.completed && entry.position > 0)
  })

  return inProgress ?? episodes.find((episode) => !resumeEntries.get(streamLookupKey(episode))?.completed) ?? episodes[0] ?? null
}

function episodeArtwork(episode: StreamItem): string {
  const sources = episodeThumbnailSources(episode)

  const fallback = `<span class="episode-image-fallback" aria-hidden="true">${escape(episodeIdentifier(episode))}</span>`

  if (!sources.primary) {
    return fallback
  }

  const optimizedPrimary = catalogArtworkSource(sources.primary)
  const optimizedFallback = sources.fallback
    ? catalogArtworkSource(sources.fallback)
    : undefined
  const fallbackAttr =
    optimizedFallback && optimizedFallback !== optimizedPrimary
      ? ` data-fallback-src="${escape(optimizedFallback)}"`
      : ''

  return `<img class="episode-image" data-deferred-src="${escape(optimizedPrimary)}"${fallbackAttr} alt="" />${fallback}`
}

function episodeMeta(episode: StreamItem, entry?: ResumeEntry): string {
  const values = [
    episode.metadata?.duration ?? (episode.metadata?.durationSeconds ? formatDuration(episode.metadata.durationSeconds) : undefined),
    episode.metadata?.releaseDate ?? episode.year,
    episode.metadata?.rating ? `★ ${episode.metadata.rating}` : undefined,
    entry?.completed ? 'Watched' : entry?.position ? resumeLabel(entry, episode) : undefined,
  ].filter((value): value is string => Boolean(value))

  return values.map((value) => `<span>${escape(value)}</span>`).join('')
}

function renderEpisodeList(): string {
  if (!selectedSeries) {
    return ''
  }

  const seasons = Object.entries(selectedSeries.episodes)
    .filter(([, episodes]) => episodes.length)
    .sort(([left], [right]) => compareSeasonNames(left, right))
  const allEpisodes = orderedSeriesEpisodes()

  if (!seasons.length) {
    return '<section class="empty-state"><h2>No episodes available</h2><p>The provider did not return episode information for this series.</p></section>'
  }

  const preferredSeason =
    seasons.find(([, episodes]) =>
      episodes.some((episode) => {
        const entry = resumeEntries.get(streamLookupKey(episode))
        return Boolean(entry && !entry.completed && entry.position > 0)
      }),
    )?.[0] ?? seasons[0][0]
  const selectedSeason = seasons.some(([season]) => season === activeSeriesSeason)
    ? activeSeriesSeason!
    : preferredSeason
  activeSeriesSeason = selectedSeason
  const visibleEpisodes = seasons.find(([season]) => season === selectedSeason)?.[1] ?? []
  const seriesTitle = selectedSeries.info.name

  return `
    <section class="series-episodes">
      <div class="episodes-heading series-episodes-heading">
        <div><p class="eyebrow">Episode guide</p><h2>Episodes</h2></div>
        ${seriesProgressSummary(allEpisodes)}
      </div>
      <div class="season-selector" data-nav-zone="series-seasons" aria-label="Seasons">
        ${seasons
          .map(
            ([season, episodes]) =>
              `<button class="season-pill ${season === selectedSeason ? 'is-active' : ''}" data-action="select-series-season" data-season="${escape(season)}" data-focus-id="series-season-${escape(season)}" aria-pressed="${season === selectedSeason}"><span class="season-label">${escape(seasonLabel(season))}</span><span class="season-count">${episodes.length} episodes</span></button>`,
          )
          .join('')}
      </div>
      <section class="episode-list" data-nav-zone="series-episodes" aria-label="Season ${escape(selectedSeason)} episodes">
        ${visibleEpisodes
          .map((episode) => {
            const entry = resumeEntries.get(streamLookupKey(episode))
            const progress =
              entry && !entry.completed
                ? `<span class="episode-card-progress" style="--resume-progress:${resumePercent(entry, episode)}%"></span>`
                : ''
            const story = episode.plot ?? episode.metadata?.plot ?? 'No episode description is available.'
            const title = episodeDisplayTitle(
              episode.name,
              episode.seriesTitle ?? seriesTitle,
              episode.season,
              episode.episodeNumber,
            )

            return `
              <button class="episode-card ${entry?.completed ? 'is-watched' : ''} ${entry?.position && !entry.completed ? 'is-in-progress' : ''}" data-action="play-episode" data-stream-key="${escape(streamLookupKey(episode))}" data-focus-id="episode-${escape(streamLookupKey(episode))}">
                <span class="episode-art">${episodeArtwork(episode)}</span>
                <span class="episode-card-copy">
                  <span class="episode-card-heading"><span class="episode-number">${escape(episodeIdentifier(episode))}</span><strong>${escape(title)}</strong>${entry?.completed ? '<span class="episode-state">✓ Watched</span>' : ''}</span>
                  <span class="episode-meta">${episodeMeta(episode, entry)}</span>
                  <span class="episode-story" dir="auto">${escape(story)}</span>
                  ${progress}
                </span>
              </button>`
          })
          .join('')}
      </section>
    </section>
  `
}

function renderFilmographyCredit(credit: FilmographyCredit): string {
  return `
    <button class="metadata-title-card" data-action="open-filmography-title" data-tmdb-id="${escape(credit.id)}" data-media-type="${credit.mediaType}" data-title="${escape(credit.title)}" data-year="${escape(credit.year ?? '')}" data-focus-id="filmography-${credit.mediaType}-${escape(credit.id)}">
      <span class="metadata-title-art">${imageOrPlaceholder(credit.poster, credit.title, 'metadata-title-image')}</span>
      <span><strong>${escape(credit.title)}</strong><small>${escape([credit.year, credit.character ?? credit.job ?? ''].filter(Boolean).join(' · '))}</small></span>
    </button>
  `
}

function renderPerson(): void {
  const person = selectedPerson

  if (!person) {
    navigateBack()
    return
  }

  const facts = [
    person.knownForDepartment,
    person.birthday ? `Born ${person.birthday}` : undefined,
    person.placeOfBirth,
  ].filter((fact): fact is string => Boolean(fact))
  const credits = (person.credits ?? []).slice(0, 30)
  const links = [person.homepage ? { label: 'Official site', url: person.homepage } : null, ...(person.externalProfiles ?? [])]
    .filter((link): link is { label: string; url: string } => Boolean(link))

  renderShell(`
    <section class="person-page">
      <section class="person-header">
        <div class="person-detail-portrait">${imageOrPlaceholder(person.profileImage, person.name, 'person-detail-image')}</div>
        <div class="person-detail-copy">
          <p class="eyebrow">${escape(person.knownForDepartment ?? 'Cast & crew')}</p>
          <h1>${escape(person.name)}</h1>
          ${facts.length ? `<div class="detail-chips">${facts.map((fact) => `<span>${escape(fact)}</span>`).join('')}</div>` : ''}
          <p class="person-biography">${escape(person.biography ?? 'Biography is not available yet.')}</p>
          ${links.length ? `<div class="action-row person-links">${links.map((link, index) => `<a class="secondary-button" href="${escape(link.url)}" target="_blank" rel="noopener noreferrer" data-focus-id="person-link-${index}">${escape(link.label)} ↗</a>`).join('')}</div>` : ''}
        </div>
      </section>
      ${
        person.knownFor?.length
          ? `<section class="metadata-section"><div class="metadata-heading"><h2>Known for</h2></div><div class="metadata-title-row">${person.knownFor.slice(0, 10).map(renderFilmographyCredit).join('')}</div></section>`
          : ''
      }
      <section class="metadata-section person-filmography">
        <div class="metadata-heading"><h2>Filmography</h2><span>${credits.length ? `${credits.length} titles` : 'Loading credits…'}</span></div>
        ${credits.length ? `<div class="metadata-title-row">${credits.map(renderFilmographyCredit).join('')}</div>` : '<p class="hint">No filmography was returned for this person.</p>'}
      </section>
      <p class="metadata-attribution">Metadata and images provided by TMDB.</p>
    </section>
  `)
}

function localStreamForCredit(
  tmdbId: string,
  mediaType: 'movie' | 'tv',
  title: string,
  year: string | undefined,
): StreamItem | null {
  const targetSection: LibrarySection = mediaType === 'movie' ? 'vod' : 'series'
  const normalizedTitle = foldText(title)
  const exactTmdb = [...knownStreams.values()].find(
    (stream) =>
      stream.section === targetSection &&
      stream.metadata?.tmdbId === tmdbId,
  )

  if (exactTmdb) {
    return exactTmdb
  }

  return (
    [...knownStreams.values()].find(
      (stream) =>
        stream.section === targetSection &&
        foldText(stream.name) === normalizedTitle &&
        (!year || stream.year === year || stream.metadata?.year === year),
    ) ?? null
  )
}

async function openPerson(personId: string, name: string): Promise<void> {
  if (!personId || !metadataServiceConfigured()) {
    showToast('Person metadata is unavailable.')
    return
  }

  personReturnPoint = captureReturnPoint()
  pushRouteHistory()
  const { token, signal } = startNavigation()
  selectedPerson = { id: personId, name }
  view = 'person'
  renderPerson()

  try {
    const person = await loadPersonMetadata(personId, signal)

    if (isCurrentNavigation(token) && view === 'person') {
      selectedPerson = person
      renderPerson()
    }
  } catch {
    if (isCurrentNavigation(token) && view === 'person') {
      renderPerson()
      showToast('Person details are unavailable right now.')
    }
  }
}

async function openFilmographyTitle(
  tmdbId: string,
  mediaType: 'movie' | 'tv',
  title: string,
  year: string | undefined,
): Promise<void> {
  const stream = localStreamForCredit(tmdbId, mediaType, title, year)

  if (!stream) {
    showToast('This title is not available in the loaded IPTV library.')
    return
  }

  await openDetails(stream)
}

function renderGuide(): void {
  renderShell(`
    <section class="catalog-heading">
      <div><p class="eyebrow">Live TV</p><h1>TV Guide</h1></div>
      <div class="catalog-tools">
        <button class="secondary-button" data-action="open-section" data-section="live" data-focus-id="guide-library">Channels</button>
        <button class="secondary-button" data-action="refresh-guide" data-focus-id="guide-refresh">Refresh guide</button>
      </div>
    </section>
    <section class="guide-grid" aria-label="TV guide">
      ${
        guideStreams.length
          ? guideStreams
              .map((stream) => {
                const nowNext = nowNextCache.get(streamLookupKey(stream))
                return `
                  <button class="guide-row" data-action="select-stream" data-stream-key="${escape(streamLookupKey(stream))}" data-focus-id="guide-${escape(streamLookupKey(stream))}">
                    <span class="guide-logo">${imageOrPlaceholder(stream.icon, stream.name, 'channel-logo')}</span>
                    <span class="guide-channel">${escape(stream.name)}</span>
                    <span class="guide-program"><strong>Now</strong><span data-guide-now-key="${escape(streamLookupKey(stream))}">${escape(nowNext?.now?.title ?? 'Loading schedule…')}</span></span>
                    <span class="guide-program"><strong>Next</strong><span data-guide-next-key="${escape(streamLookupKey(stream))}">${escape(nowNext?.next?.title ?? 'Schedule unavailable')}</span></span>
                  </button>`
              })
              .join('')
          : '<div class="empty-state"><h2>Loading guide</h2><p>Fetching channels and current programmes…</p></div>'
      }
    </section>
  `)

}

function globalSearchResultsForSection(section: LibrarySection): StreamItem[] {
  return globalSearchResults.filter((stream) => stream.section === section)
}

function globalSearchResultNoun(section: LibrarySection, count: number): string {
  if (section === 'live') {
    return count === 1 ? 'channel' : 'channels'
  }

  if (section === 'vod') {
    return count === 1 ? 'movie' : 'movies'
  }

  return count === 1 ? 'series' : 'series'
}

function globalSearchCard(stream: StreamItem): string {
  const key = streamLookupKey(stream)
  return `<div data-global-search-card-key="${escape(key)}">${streamCard(stream)}</div>`
}

function globalSearchSectionContent(section: LibrarySection): string {
  const results = globalSearchResultsForSection(section)
  const expanded = expandedGlobalSearchSections.has(section)
  const visibleResults = expanded
    ? results
    : results.slice(0, GLOBAL_SEARCH_COLLAPSED_RESULT_LIMIT)
  const hiddenCount = Math.max(0, results.length - visibleResults.length)
  const hasMore = results.length > GLOBAL_SEARCH_COLLAPSED_RESULT_LIMIT
  const noun = globalSearchResultNoun(section, results.length)
  const sectionResolved = globalSearchSectionAvailability.has(section)
  const sectionAvailable = globalSearchSectionAvailability.get(section) === true
  const emptyState = !sectionResolved
    ? '<div class="empty-state"><h3>Searching downloaded library</h3><p>Loading local results…</p></div>'
    : sectionAvailable
      ? '<div class="empty-state"><h3>No matching titles</h3><p>Try another search in your downloaded library.</p></div>'
      : '<div class="empty-state"><h3>Library not downloaded yet</h3><p>Refresh library before searching this section.</p></div>'

  return `
    <div class="global-search-group-heading">
      <div class="global-search-group-title">
        <h2>${escape(labels[section])}</h2>
        <span id="global-search-count-${section}" class="global-search-count" aria-label="${results.length} ${noun} found">
          <strong>${results.length}</strong><span>results</span>
        </span>
      </div>
      <button id="global-search-toggle-${section}" class="secondary-button global-search-toggle" data-action="toggle-global-search-section" data-section="${section}" data-focus-id="global-search-toggle-${section}" aria-expanded="${expanded}" ${hasMore ? '' : 'hidden disabled'}>
        ${expanded ? 'Show less' : `Show ${hiddenCount} more`}
      </button>
    </div>
    <div id="global-search-content-${section}" data-global-search-content="${section}" class="${visibleResults.length ? 'content-grid' : 'global-search-empty'}">
      ${
        visibleResults.length
          ? visibleResults.map(globalSearchCard).join('')
          : emptyState
      }
    </div>
  `
}

function renderGlobalSearchSection(section: LibrarySection): string {
  return `
    <section class="global-search-group" data-global-search-section="${section}" aria-label="${labels[section]} results">
      ${globalSearchSectionContent(section)}
    </section>
  `
}

function renderGlobalSearchResults(): string {
  if (!globalSearchQuery) {
    return '<section class="empty-state"><h2>Find anything</h2><p>Search Live TV, Movies, and Series.</p></section>'
  }

  return GLOBAL_SEARCH_SECTIONS.map(renderGlobalSearchSection).join('')
}

function globalSearchControlsContent(): string {
  return `
    ${globalSearchQuery ? '<button class="secondary-button" data-action="clear-global-search" data-focus-id="global-search-clear">Clear</button>' : ''}
    <button class="primary-button" data-action="run-global-search" data-focus-id="global-search-run">Search local library</button>
  `
}

function globalSearchControls(): string {
  return `<div id="global-search-controls" class="global-search-controls">${globalSearchControlsContent()}</div>`
}

function visibleGlobalSearchResults(section: LibrarySection): StreamItem[] {
  const results = globalSearchResultsForSection(section)
  return expandedGlobalSearchSections.has(section)
    ? results
    : results.slice(0, GLOBAL_SEARCH_COLLAPSED_RESULT_LIMIT)
}

function updateGlobalSearchSection(section: LibrarySection): void {
  const group = document.querySelector<HTMLElement>(
    `[data-global-search-section="${section}"]`,
  )

  if (!group) {
    return
  }

  const results = globalSearchResultsForSection(section)
  const visibleResults = visibleGlobalSearchResults(section)
  const count = group.querySelector<HTMLElement>(`#global-search-count-${section}`)
  const toggle = group.querySelector<HTMLButtonElement>(`#global-search-toggle-${section}`)
  const content = group.querySelector<HTMLElement>(`#global-search-content-${section}`)
  const noun = globalSearchResultNoun(section, results.length)
  const hasMore = results.length > GLOBAL_SEARCH_COLLAPSED_RESULT_LIMIT
  const expanded = expandedGlobalSearchSections.has(section)
  const sectionResolved = globalSearchSectionAvailability.has(section)
  const sectionAvailable = globalSearchSectionAvailability.get(section) === true

  if (count) {
    count.setAttribute('aria-label', `${results.length} ${noun} found`)
    count.innerHTML = `<strong>${results.length}</strong><span>results</span>`
  }

  if (toggle) {
    toggle.hidden = !hasMore
    toggle.disabled = !hasMore
    toggle.setAttribute('aria-expanded', String(expanded))
    toggle.textContent = expanded
      ? 'Show less'
      : `Show ${Math.max(0, results.length - visibleResults.length)} more`
  }

  if (!content) {
    return
  }

  if (!visibleResults.length) {
    content.className = 'global-search-empty'
    content.innerHTML = !sectionResolved
      ? '<div class="empty-state"><h3>Searching downloaded library</h3><p>Loading local results…</p></div>'
      : sectionAvailable
        ? '<div class="empty-state"><h3>No matching titles</h3><p>Try another search in your downloaded library.</p></div>'
        : '<div class="empty-state"><h3>Library not downloaded yet</h3><p>Refresh library before searching this section.</p></div>'
    return
  }

  if (!content.classList.contains('content-grid')) {
    content.className = 'content-grid'
    content.textContent = ''
  }

  const expectedKeys = new Set(visibleResults.map(streamLookupKey))

  content
    .querySelectorAll<HTMLElement>('[data-global-search-card-key]')
    .forEach((card) => {
      if (!expectedKeys.has(card.dataset.globalSearchCardKey ?? '')) {
        card.remove()
      }
    })

  for (const stream of visibleResults) {
    const key = streamLookupKey(stream)
    const existing = content.querySelector<HTMLElement>(
      `[data-global-search-card-key="${cssEscape(key)}"]`,
    )

    if (!existing) {
      content.insertAdjacentHTML(
        'beforeend',
        globalSearchCard(stream),
      )
    }
  }
}

function updateGlobalSearchView(update: GlobalSearchViewUpdate = {}): void {
  const status = document.querySelector<HTMLElement>('#global-search-status')
  const controls = document.querySelector<HTMLElement>('#global-search-controls')
  const results = document.querySelector<HTMLElement>('#global-search-results')
  const fullResults = update.fullResults ?? true
  const updateControls = update.controls ?? fullResults

  if (status) {
    status.textContent = globalSearchStatus
    status.hidden = !globalSearchStatus
  }

  if (controls && updateControls) {
    controls.innerHTML = globalSearchControlsContent()
  }

  if (!results) {
    return
  }

  if (fullResults) {
    results.innerHTML = renderGlobalSearchResults()
    bindEvents()
    return
  }

  const sections = update.sections ?? []

  for (const section of sections) {
    updateGlobalSearchSection(section)
  }

  // Search cards use delegated actions and already provide stable focus IDs.
  // Avoid re-scanning every button/image for each incremental result commit.
  assignNavigationZones()
  invalidateSpatialLayout()
}

function globalSearchIsActive(): boolean {
  return false
}

function clearGlobalSearch(): void {
  const input = document.querySelector<HTMLInputElement>('#global-search-input')

  if (input) {
    input.value = ''
    input.setSelectionRange(0, 0)
  }

  globalSearchQuery = ''
  globalSearchResults = []
  globalSearchStatus = ''
  globalSearchSequence += 1
  globalSearchSectionAvailability.clear()
  expandedGlobalSearchSections.clear()
  updateGlobalSearchView({ controls: true, fullResults: true })
  input?.focus({ preventScroll: true })
}

function cancelGlobalSearch(): boolean {
  return false
}

function leaveGlobalSearch(): void {
  globalSearchQuery = ''
  globalSearchResults = []
  globalSearchStatus = ''
  globalSearchSequence += 1
  globalSearchSectionAvailability.clear()
  expandedGlobalSearchSections.clear()
  view =
    searchReturnView === 'catalog' && catalog
      ? 'catalog'
      : searchReturnView === 'details' && selectedItem
        ? 'details'
        : searchReturnView === 'guide'
          ? 'guide'
          : searchReturnView === 'settings'
            ? 'settings'
            : 'home'
  render()
}

async function localGlobalSearchMatches(
  query: string,
  sequence: number,
  onSectionResult?: (section: LibrarySection, matches: readonly StreamItem[]) => void,
): Promise<StreamItem[]> {
  const activeProfile = profile

  if (!activeProfile) {
    return []
  }

  const results: StreamItem[] = []
  const knownKeys = new Set<string>()

  for (const section of GLOBAL_SEARCH_SECTIONS) {
    const sectionResult = await catalogRepository.searchCompleteSection(
      activeProfile.id,
      section,
      query,
      GLOBAL_SEARCH_SECTION_RESULT_LIMIT,
      {
        onMatches: ({ matches }) => {
          if (sequence !== globalSearchSequence) {
            return
          }

          const sectionKeys = new Set(
            results
              .filter((stream) => stream.section === section)
              .map(streamLookupKey),
          )
          const nextResults = results.filter((stream) => stream.section !== section)

          for (const stream of matches) {
            const key = streamLookupKey(stream)

            if (
              stream.streamType !== 'episode' &&
              !sectionKeys.has(key) &&
              visibleStream(stream)
            ) {
              sectionKeys.add(key)
              nextResults.push(stream)
            }
          }

          results.splice(0, results.length, ...nextResults)
          knownKeys.clear()
          results.forEach((stream) => knownKeys.add(streamLookupKey(stream)))
          onSectionResult?.(section, results)
        },
      },
    )

    if (sequence !== globalSearchSequence) {
      return []
    }

    globalSearchSectionAvailability.set(section, sectionResult.coverage === 'complete')

    if (sectionResult.coverage === 'none') {
      continue
    }

    for (const stream of sectionResult.matches) {
      const key = streamLookupKey(stream)

      if (stream.streamType !== 'episode' && !knownKeys.has(key) && visibleStream(stream)) {
        knownKeys.add(key)
        results.push(stream)
      }
    }

    onSectionResult?.(section, results)
  }

  rememberStreams(results)
  return results
}

async function updateGlobalSearchFromLibrary(query: string): Promise<void> {
  const normalizedQuery = query.trim()
  const sequence = globalSearchSequence += 1
  globalSearchQuery = query
  globalSearchResults = []
  globalSearchSectionAvailability.clear()
  expandedGlobalSearchSections.clear()

  if (!normalizedQuery) {
    globalSearchStatus = ''
    updateGlobalSearchView({ controls: true, fullResults: true })
    return
  }

  if (normalizedQuery.length < MIN_GLOBAL_SEARCH_LENGTH) {
    globalSearchStatus =
      `Type at least ${MIN_GLOBAL_SEARCH_LENGTH} characters to search your downloaded library.`
    updateGlobalSearchView({ controls: true, fullResults: true })
    return
  }

  globalSearchStatus = 'Searching downloaded library…'
  updateGlobalSearchView({ controls: true, fullResults: true })

  const results = await localGlobalSearchMatches(
    normalizedQuery,
    sequence,
    (section, partialResults) => {
      if (sequence !== globalSearchSequence || view !== 'search') {
        return
      }

      globalSearchResults = partialResults.slice()
      globalSearchStatus = `Searching downloaded library… ${globalSearchResults.length} local result${globalSearchResults.length === 1 ? '' : 's'}`
      updateGlobalSearchView({ controls: false, fullResults: false, sections: [section] })
    },
  )

  if (sequence !== globalSearchSequence || view !== 'search') {
    return
  }

  globalSearchResults = results
  globalSearchStatus = results.length
    ? `${results.length} local result${results.length === 1 ? '' : 's'}`
    : 'No matching titles in the downloaded library.'
  updateGlobalSearchView({ controls: true, fullResults: true })
}

function scheduleGlobalSearch(query: string): void {
  void updateGlobalSearchFromLibrary(query)
}

function renderGlobalSearch(): void {
  renderShell(`
    <section class="catalog-heading">
      <div><p class="eyebrow">All libraries</p><h1>Global Search</h1></div>
    </section>
    <section class="global-search-panel">
      <label class="search global-search">${icon('search', 'search-icon')}<input id="global-search-input" data-focus-id="global-search-input" placeholder="Search Live TV, Movies, and Series" value="${escape(globalSearchQuery)}" readonly aria-label="Search Live TV, Movies, and Series. Press OK to type." /></label>
      ${globalSearchControls()}
    </section>
    <p id="global-search-status" class="hint global-search-status" ${globalSearchStatus ? '' : 'hidden'}>${escape(globalSearchStatus)}</p>
    <section id="global-search-results" class="global-search-groups">${renderGlobalSearchResults()}</section>
  `)

  bindSearchInput(
    document.querySelector<HTMLInputElement>('#global-search-input'),
    scheduleGlobalSearch,
  )
}

function renderSettings(): void {
  const profiles = loadProfiles()
  const webOsRuntime = isWebOsRuntime()
  const preservePitch = playbackPreservesPitch()

  renderShell(`
    <section class="catalog-heading">
      <div><p class="eyebrow">Device preferences</p><h1>Settings</h1></div>
      <button class="secondary-button" data-action="add-profile" data-focus-id="settings-add-profile">Add playlist</button>
    </section>
    <section class="settings-layout">
      <section class="settings-panel">
        <p class="panel-kicker">Playback</p>
        <h2>Make it yours</h2>
        <label class="setting-row"><span>Prefer HLS live streams<small>Use adaptive streaming when available</small></span><input id="setting-prefer-hls" data-focus-id="setting-prefer-hls" type="checkbox" ${settings.preferHls ? 'checked' : ''} /></label>
        <label class="setting-row"><span>Preserve pitch when speeding up<small>${webOsRuntime ? 'Unavailable on this LG TV: its native media pipeline mutes audio above 1×.' : 'Keep voices natural above 1×. Turn off if audio is silent when fast.'}</small></span><input id="setting-preserve-pitch" data-focus-id="setting-preserve-pitch" type="checkbox" ${preservePitch ? 'checked' : ''} ${webOsRuntime ? 'disabled' : ''} /></label>
        <label class="setting-row"><span>Live buffer</span><select id="setting-buffer" data-focus-id="setting-buffer">
          ${[10, 20, 30, 45, 60].map((value) => `<option value="${value}" ${settings.bufferSeconds === value ? 'selected' : ''}>${value} seconds</option>`).join('')}
        </select></label>
        <label class="setting-row"><span>Clock format</span><select id="setting-time-format" data-focus-id="setting-time-format">
          <option value="24h" ${settings.timeFormat === '24h' ? 'selected' : ''}>24-hour</option>
          <option value="12h" ${settings.timeFormat === '12h' ? 'selected' : ''}>12-hour</option>
        </select></label>
        <label class="setting-row"><span>Hide adult categories<small>Keep sensitive content out of the library</small></span><input id="setting-hide-adult" data-focus-id="setting-hide-adult" type="checkbox" ${settings.hideAdultContent ? 'checked' : ''} /></label>
        <label class="setting-row"><span>Parental PIN <small>Device-local deterrent</small></span><input id="setting-parental-pin" data-focus-id="setting-parental-pin" type="password" inputmode="numeric" maxlength="8" value="${escape(settings.parentalPin ?? '')}" placeholder="Optional PIN" readonly aria-label="Parental PIN. Press OK to type." /></label>
        <button class="primary-button" data-action="save-settings" data-focus-id="settings-save">Save settings</button>
      </section>
      <section class="settings-panel">
        <p class="panel-kicker">Library</p>
        <h2>Downloaded library</h2>
        <p class="hint">Refresh is manual so it can be observed and controlled. It never starts automatically when the app launches.</p>
        <button class="secondary-button" data-action="refresh-library" data-focus-id="settings-refresh-library">Refresh downloaded library</button>
        <button class="secondary-button" data-action="measure-vod-library" data-focus-id="settings-measure-vod-library">Measure VOD download</button>
        <p class="hint">Uses one VOD-only sync request with a temporary 192 MiB discovery limit. It never refreshes Live TV or Series.</p>
      </section>
      <section class="settings-panel">
        <p class="panel-kicker">Library</p>
        <h2>Playlists</h2>
        <p class="hint">Favorites and watch history stay separate for every playlist.</p>
        <div class="profile-list">
          ${profiles
            .map(
              (savedProfile) => `
                <div class="profile-row ${savedProfile.id === profile?.id ? 'is-active' : ''}">
                  <span class="profile-name">${escape(savedProfile.name)}</span>
                  <div>
                    <span class="profile-state">${savedProfile.id === profile?.id ? 'Active' : 'Saved'}</span>
                    <button class="secondary-button" data-action="switch-profile" data-profile-id="${escape(savedProfile.id)}" data-focus-id="settings-profile-${escape(savedProfile.id)}">${savedProfile.id === profile?.id ? 'Selected' : 'Use'}</button>
                    <button class="secondary-button danger-button" data-action="remove-profile" data-profile-id="${escape(savedProfile.id)}" data-focus-id="settings-remove-${escape(savedProfile.id)}">Remove</button>
                  </div>
                </div>`,
            )
            .join('')}
        </div>
      </section>
    </section>
  `)
}

function renderPlayer(): void {
  const item = playerItem

  if (!item || !client) {
    view = 'home'
    render()
    return
  }

  const snapshot = snapshotFocus()
  const renderId = performanceTrace.beginRender('player')
  const playbackInteractionId = performanceTrace.startInteraction('playback-start', {
    section: item.section,
    streamType: item.streamType === 'episode' ? 'episode' : 'title',
  })
  const isLive = item.section === 'live'
  const hasSeekableTimeline = !isLive || Boolean(playerSourceOverride)
  const playerControlsClass = playerUiMode === 'immersive' ? 'concealed' : ''
  const playerProgressClass = `${hasSeekableTimeline ? '' : 'hidden'} ${playerUiMode === 'immersive' ? 'concealed' : ''}`.trim()
  const queue = isLive ? liveQueue : []
  const currentIndex = queue.findIndex((candidate) => streamLookupKey(candidate) === streamLookupKey(item))
  const playerNavigationControls = isLive
    ? '<button class="icon-button" data-action="previous-live-channel" data-focus-id="player-channel-previous" aria-label="Previous channel">‹</button><button class="icon-button" data-action="next-live-channel" data-focus-id="player-channel-next" aria-label="Next channel">›</button><button class="secondary-button" data-action="toggle-channel-overlay" data-focus-id="player-channel-list">Channels</button>'
    : '<button class="icon-button" data-action="skip-backward" data-focus-id="player-skip-backward" aria-label="Skip backward 10 seconds">−10</button>'
  const playerUtilityControls = isLive
    ? '<button class="icon-button" data-action="toggle-last-channel" data-focus-id="player-last-channel" aria-label="Return to last channel">↶</button>'
    : `<button class="icon-button" data-action="skip-forward" data-focus-id="player-skip-forward" aria-label="Skip forward 10 seconds">+10</button>${canChangePlaybackSpeed() ? `<button class="icon-button" data-action="cycle-speed" data-focus-id="player-speed" aria-label="Playback speed">${playerPlaybackRate}×</button>` : ''}`

  app.innerHTML = `
    <main id="player-surface" class="player-page player-aspect-${playerAspect}" tabindex="0" aria-label="Video player. Press OK to show controls.">
      <video id="video-player" autoplay playsinline ${playerMuted ? 'muted' : ''}></video>
      <div id="player-message" class="player-message" hidden></div>
      <section id="player-diagnostics" class="player-diagnostics" hidden aria-live="polite"></section>
      <div id="player-seek-feedback" class="player-seek-feedback" aria-live="polite" hidden></div>
      <div id="channel-number-overlay" class="channel-number-overlay" hidden></div>
      <div id="player-controls" class="player-controls player-control-dock ${playerControlsClass}">
        <button class="icon-button player-back" data-action="close-player" data-focus-id="player-close" aria-label="Close player">←</button>
        ${playerNavigationControls}
        <div class="player-title"><span>${escape(isLive ? 'LIVE' : 'PLAYING')}</span>${escape(streamDisplayTitle(item))}</div>
        <div class="player-spacer"></div>
        <button class="icon-button" data-action="toggle-mute" data-focus-id="player-mute" aria-label="Mute or unmute">${playerMuted ? '🔇' : '🔊'}</button>
        ${playerUtilityControls}
        <button class="icon-button" data-action="cycle-aspect" data-focus-id="player-aspect" aria-label="Toggle aspect ratio">${playerAspect === 'contain' ? '▣' : '▤'}</button>
        <button class="icon-button" data-action="cycle-audio" data-focus-id="player-audio" aria-label="Change audio track">A</button>
        <button class="icon-button" data-action="cycle-subtitles" data-focus-id="player-subtitles" aria-label="Change subtitles">CC</button>
        <button class="icon-button" data-action="cycle-quality" data-focus-id="player-quality" aria-label="Change quality">HD</button>
        <button class="icon-button" data-action="toggle-play" data-focus-id="player-play" aria-label="Pause or play">Ⅱ</button>
      </div>
      ${
        showPlayerChannels && isLive
          ? `<aside id="channel-overlay" class="channel-overlay">
              <h2>Channels</h2>
              ${queue
                .slice(Math.max(0, currentIndex - 10), currentIndex + 11)
                .map(
                  (channel) => `
                    <button class="${streamLookupKey(channel) === streamLookupKey(item) ? 'is-current' : ''}" data-action="play-live-channel" data-stream-key="${escape(streamLookupKey(channel))}" data-focus-id="player-channel-${escape(streamLookupKey(channel))}">
                      <span>${escape(channel.channelNumber ?? '')}</span>${escape(channel.name)}
                    </button>`,
                )
                .join('')}
            </aside>`
          : ''
      }
      <div id="player-progress-wrap" class="player-progress-wrap ${playerProgressClass}">
        <div class="player-time"><span id="player-current">0:00</span><span id="player-preview-time" hidden></span><span id="player-duration">0:00</span></div>
        <input id="player-progress" data-focus-id="player-progress" aria-label="Playback position" type="range" min="0" max="100" value="0" step="0.1" />
      </div>
    </main>
  `
  invalidateSpatialLayout('player-replaced')
  bindEvents()
  performanceTrace.trackImages(app, { renderId: renderId ?? undefined })
  performanceTrace.endRender(renderId, {
    focusableCount: app.querySelectorAll('[data-focus-id]').length,
  })

  const video = document.querySelector<HTMLVideoElement>('#video-player')
  const message = document.querySelector<HTMLElement>('#player-message')
  const diagnostics = document.querySelector<HTMLElement>('#player-diagnostics')
  const progress = document.querySelector<HTMLInputElement>('#player-progress')
  const currentTime = document.querySelector<HTMLElement>('#player-current')
  const duration = document.querySelector<HTMLElement>('#player-duration')
  const previewTime = document.querySelector<HTMLElement>('#player-preview-time')

  if (!video || !message || !diagnostics || !progress || !currentTime || !duration || !previewTime) {
    return
  }

  const activeItem = item
  const activeItemKey = streamLookupKey(activeItem)
  const player = video
  const playerMessage = message
  const playerDiagnosticsElement = diagnostics
  const playerProgress = progress
  const playerCurrentTime = currentTime
  const playerDuration = duration
  const playerPreviewTime = previewTime
  let lastResumeSaveAt = 0
  let playbackWatchdog: number | null = null
  let visiblePlaybackConfirmed = false
  let resumeRestored = false
  let decodedFrameBaseline: number | null = null
  let activeAttempt: PlaybackAttempt | null = null
  let activeAttemptGeneration = 0
  let nextAttemptIndex = 0
  const playbackFailures: PlaybackFailure[] = []
  const directUrl = playerSourceOverride ?? client.streamUrl(activeItem)
  const declaredUrl = playerSourceOverride ?? client.streamUrl(activeItem, false)
  const nativeHlsSupport = Boolean(
    player.canPlayType('application/vnd.apple.mpegurl') ||
      player.canPlayType('application/x-mpegURL'),
  )
  const isWebOs = isWebOsRuntime()
  const hlsEngine = hlsConstructor()
  const mpegtsEngineValue = mpegtsEngine()
  const mpegtsFeatures = mpegtsEngineValue?.isSupported()
    ? mpegtsEngineValue.getFeatureList()
    : null
  const playbackCapabilities: PlaybackCapabilities = {
    nativeHls: nativeHlsSupport,
    nativeTransportStream: Boolean(player.canPlayType('video/mp2t')) || isWebOs,
    nativeVideo: true,
    hlsJs: Boolean(hlsEngine?.isSupported()),
    mpegts: Boolean(mpegtsFeatures?.mseLivePlayback),
    dash: typeof MediaSource !== 'undefined',
    preferNativeTransport: isWebOs,
  }
  const playbackSources = discoverPlaybackSources({
    isLive: activeItem.section === 'live',
    directUrl,
    declaredUrl,
    hlsUrl:
      activeItem.section === 'live' && !playerForceDirect
        ? toHlsUrl(declaredUrl)
        : undefined,
    transportStreamUrl:
      activeItem.section === 'live' && !playerForceDirect
        ? toTransportStreamUrl(declaredUrl)
        : undefined,
    sourceOverride: playerSourceOverride ?? undefined,
  })
  const playbackAttempts = planPlaybackAttempts({
    preferHls: settings.preferHls,
    capabilities: playbackCapabilities,
    sources: playbackSources,
  })
  playerDiagnostics = []
  playerDiagnosticsExpanded = false
  playerTimelinePreviewSeconds = null
  playerTimelineWasPlaying = false

  const cleanupActiveTransport = (): void => {
    activeHls?.destroy()
    activeHls = null

    if (activeMpegts) {
      try {
        activeMpegts.pause()
        activeMpegts.unload()
        activeMpegts.detachMediaElement()
        activeMpegts.destroy()
      } catch {
        // A partially initialized transport player may already be destroyed.
      }
      activeMpegts = null
    }

    try {
      activeDash?.reset()
    } catch {
      // A partially initialized DASH player may already be reset.
    }
    activeDash = null

    player.pause()
    player.removeAttribute('src')
    player.load()
  }

  const cleanup = (): void => {
    performanceTrace.event('playback', 'session-cleanup', undefined, {
      interactionId: playbackInteractionId ?? undefined,
    })
    performanceTrace.endInteraction(playbackInteractionId, 'playback-cleanup')
    discardPlayerTimelinePreview()
    persistProgress()
    activeAttemptGeneration += 1
    clearPlaybackWatchdog()
    cleanupActiveTransport()
    document.removeEventListener('mousemove', revealControls)
    cancelPlayerSeek()
    void releaseKeepAwake()
  }

  playerCleanup = cleanup
  void requestKeepAwake()

  function isActiveAttempt(attempt: PlaybackAttempt, generation: number): boolean {
    return (
      activeAttemptGeneration === generation &&
      activeAttempt?.id === attempt.id &&
      player.isConnected
    )
  }

  function clearPlaybackWatchdog(): void {
    if (playbackWatchdog !== null) {
      window.clearTimeout(playbackWatchdog)
      playbackWatchdog = null
    }
  }

  function failAttempt(
    attempt: PlaybackAttempt,
    generation: number,
    kind: PlaybackFailureKind,
    evidence: PlaybackEvidence = {},
  ): void {
    if (!isActiveAttempt(attempt, generation)) {
      return
    }

    performanceTrace.event(
      'playback',
      'attempt-failed',
      {
        engine: attempt.engine,
        source: attempt.source.kind,
        kind,
        generation,
      },
      { interactionId: playbackInteractionId ?? undefined },
    )
    const failure: PlaybackFailure = {
      engine: attempt.engine,
      source: attempt.source.kind,
      kind,
      evidence,
    }
    playbackFailures.push(failure)
    playerDiagnostics = [...playbackFailures]
    startNextAttempt()
  }

  function failActiveAttempt(
    kind: PlaybackFailureKind,
    evidence: PlaybackEvidence = {},
  ): void {
    if (!activeAttempt) {
      return
    }

    failAttempt(activeAttempt, activeAttemptGeneration, kind, evidence)
  }

  function hlsFailureKind(detail: string): PlaybackFailureKind {
    const normalized = detail.toLocaleLowerCase()

    if (normalized.includes('manifest') || normalized.includes('playlist')) {
      return 'manifest'
    }

    if (normalized.includes('timeout')) {
      return 'timeout'
    }

    return 'network'
  }

  function mpegtsFailureKind(detail: string): PlaybackFailureKind {
    const Mpegts = mpegtsEngineValue

    if (!Mpegts) {
      return 'unknown'
    }

    if (detail === Mpegts.ErrorDetails.MEDIA_FORMAT_UNSUPPORTED) {
      return 'unsupported'
    }

    if (detail === Mpegts.ErrorDetails.MEDIA_CODEC_UNSUPPORTED) {
      return 'codec'
    }

    if (
      detail === Mpegts.ErrorDetails.MEDIA_FORMAT_ERROR ||
      detail === Mpegts.ErrorDetails.MEDIA_MSE_ERROR
    ) {
      return 'media-source'
    }

    if (detail === Mpegts.ErrorDetails.NETWORK_TIMEOUT) {
      return 'timeout'
    }

    if (
      detail === Mpegts.ErrorDetails.NETWORK_EXCEPTION ||
      detail === Mpegts.ErrorDetails.NETWORK_STATUS_CODE_INVALID ||
      detail === Mpegts.ErrorDetails.NETWORK_UNRECOVERABLE_EARLY_EOF
    ) {
      return 'network'
    }

    return 'unknown'
  }

  function renderPlayerDiagnostics(forceVisible: boolean): void {
    const lines = playbackDiagnosticLines(playerDiagnostics)

    if (!lines.length) {
      playerDiagnosticsElement.hidden = true
      playerDiagnosticsElement.innerHTML = ''
      return
    }

    const visibleLines = playerDiagnosticsExpanded || forceVisible ? lines : lines.slice(-1)
    playerDiagnosticsElement.innerHTML = `
      <p>${forceVisible ? 'Playback diagnostics' : 'Fallback status'}</p>
      <ul>${visibleLines.map((line) => `<li>${escape(line)}</li>`).join('')}</ul>
      ${
        forceVisible
          ? '<div class="player-diagnostic-actions"><button class="secondary-button" data-action="retry-player" data-focus-id="player-retry">Retry</button><button class="secondary-button" data-action="close-player" data-focus-id="player-diagnostic-back">Back to channels</button></div>'
          : ''
      }
    `
    playerDiagnosticsElement.hidden = false
    bindEvents()

    if (forceVisible) {
      window.setTimeout(() => {
        setPlayerUiMode('focused')
        playerDiagnosticsElement
          .querySelector<HTMLElement>('[data-focus-id="player-retry"]')
          ?.focus({ preventScroll: true })
      }, 0)
    }
  }

  function sourceEvidence(detail?: string): PlaybackEvidence {
    return detail ? { detail } : {}
  }

  function startNextAttempt(): void {
    clearPlaybackWatchdog()
    setLibraryPlaybackStarting(true)
    markFlatSnapshotPlaybackStarting()
    activeAttemptGeneration += 1
    cleanupActiveTransport()

    const attempt = playbackAttempts[nextAttemptIndex]
    nextAttemptIndex += 1

    if (!attempt) {
      activeAttempt = null
      setLibraryPlaybackStarting(false)
      markFlatSnapshotPlaybackFailed()
      performanceTrace.endInteraction(playbackInteractionId, 'playback-failed', {
        attempts: playbackFailures.length,
      })
      showPlayerMessage(describePlaybackFailure(playbackFailures))
      renderPlayerDiagnostics(true)
      return
    }

    activeAttempt = attempt
    performanceTrace.event(
      'playback',
      'attempt-start',
      {
        engine: attempt.engine,
        source: attempt.source.kind,
        attemptIndex: nextAttemptIndex,
        generation: activeAttemptGeneration,
      },
      { interactionId: playbackInteractionId ?? undefined },
    )
    visiblePlaybackConfirmed = false
    decodedFrameBaseline = decodedVideoFrames()
    const generation = activeAttemptGeneration
    const fallback = nextAttemptIndex > 1 ? ' fallback' : ''
    showPlayerMessage(`Checking ${attempt.label}${fallback}…`)
    renderPlayerDiagnostics(false)

    playbackWatchdog = window.setTimeout(() => {
      failAttempt(attempt, generation, 'timeout', {
        detail: 'No visible playback before the startup deadline.',
      })
    }, PLAYBACK_ATTEMPT_TIMEOUT_MS)

    if (attempt.engine === 'hls') {
      startHlsAttempt(attempt, generation)
    } else if (attempt.engine === 'mpegts') {
      startMpegtsAttempt(attempt, generation)
    } else if (attempt.engine === 'dash') {
      startDashAttempt(attempt, generation)
    } else {
      startNativeAttempt(attempt, generation)
    }
  }

  function startHlsAttempt(attempt: PlaybackAttempt, generation: number): void {
    const Hls = hlsEngine

    if (!Hls || !Hls.isSupported()) {
      failAttempt(attempt, generation, 'unsupported', sourceEvidence('HLS MediaSource is unavailable.'))
      return
    }

    let networkRecoveryAttempts = 0
    let mediaRecoveryAttempts = 0
    const hls = new Hls({
      enableWorker: false,
      lowLatencyMode: false,
      backBufferLength: settings.bufferSeconds,
      maxBufferLength: settings.bufferSeconds,
      maxMaxBufferLength: Math.max(40, settings.bufferSeconds * 2),
      liveSyncDurationCount: 2,
      liveMaxLatencyDurationCount: 5,
    })
    activeHls = hls
    hls.attachMedia(player)
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      if (isActiveAttempt(attempt, generation) && activeHls === hls) {
        hls.loadSource(attempt.url)
      }
    })
    hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => {
      if (!isActiveAttempt(attempt, generation) || activeHls !== hls) {
        return
      }

      const videoCodec = data.video?.codec
      const audioCodec = data.audio?.codec
      const unsupported = [data.video, data.audio, data.audiovideo].find((track) => {
        if (!track?.codec) {
          return false
        }

        return !MediaSource.isTypeSupported(`${track.container}; codecs="${track.codec}"`)
      })

      if (unsupported) {
        failAttempt(attempt, generation, 'codec', {
          detail: 'The HLS manifest declared a MediaSource-incompatible codec.',
          videoCodec,
          audioCodec,
        })
      }
    })
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (isActiveAttempt(attempt, generation)) {
        void player.play().catch(() => {
          failAttempt(attempt, generation, 'decode', sourceEvidence('The HLS media element rejected playback.'))
        })
      }
    })
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!isActiveAttempt(attempt, generation) || !data.fatal) {
        return
      }

      if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRecoveryAttempts < 1) {
        networkRecoveryAttempts += 1
        showPlayerMessage('HLS interrupted · reconnecting…')
        hls.startLoad()
        return
      }

      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveryAttempts < 1) {
        mediaRecoveryAttempts += 1
        showPlayerMessage('HLS media recovery…')
        hls.recoverMediaError()
        return
      }

      failAttempt(
        attempt,
        generation,
        data.type === Hls.ErrorTypes.MEDIA_ERROR
          ? 'decode'
          : hlsFailureKind(String(data.details)),
        sourceEvidence(String(data.details)),
      )
    })
  }

  function startMpegtsAttempt(attempt: PlaybackAttempt, generation: number): void {
    const Mpegts = mpegtsEngineValue

    if (!Mpegts || !playbackCapabilities.mpegts) {
      failAttempt(attempt, generation, 'media-source', sourceEvidence('MPEG-TS MediaSource playback is unavailable.'))
      return
    }

    let mediaInfo: {
      videoCodec?: string
      audioCodec?: string
      hasVideo?: boolean
      hasAudio?: boolean
    } = {}
    const transportPlayer = Mpegts.createPlayer(
      {
        type: 'mse',
        isLive: activeItem.section === 'live',
        url: attempt.url,
      },
      {
        enableWorker: false,
        enableStashBuffer: true,
        lazyLoad: false,
        autoCleanupSourceBuffer: true,
        autoCleanupMaxBackwardDuration: Math.max(30, settings.bufferSeconds * 3),
        autoCleanupMinBackwardDuration: Math.max(15, settings.bufferSeconds),
      },
    )
    activeMpegts = transportPlayer
    transportPlayer.on(Mpegts.Events.MEDIA_INFO, (info: Record<string, unknown>) => {
      if (!isActiveAttempt(attempt, generation) || activeMpegts !== transportPlayer) {
        return
      }

      mediaInfo = {
        videoCodec: typeof info.videoCodec === 'string' ? info.videoCodec : undefined,
        audioCodec: typeof info.audioCodec === 'string' ? info.audioCodec : undefined,
        hasVideo: info.hasVideo === true,
        hasAudio: info.hasAudio === true,
      }

      if (mediaInfo.hasVideo === false && mediaInfo.hasAudio) {
        failAttempt(attempt, generation, 'audio-only', mediaInfo)
      }
    })
    transportPlayer.on(Mpegts.Events.ERROR, (errorType: string, detail: string) => {
      if (isActiveAttempt(attempt, generation) && activeMpegts === transportPlayer) {
        failAttempt(attempt, generation, mpegtsFailureKind(detail), {
          ...mediaInfo,
          detail: detail || errorType,
        })
      }
    })
    transportPlayer.attachMediaElement(player)
    transportPlayer.load()
    void Promise.resolve(transportPlayer.play()).catch(() => {
      failAttempt(attempt, generation, 'decode', mediaInfo)
    })
  }

  function startDashAttempt(attempt: PlaybackAttempt, generation: number): void {
    if (!playbackCapabilities.dash) {
      failAttempt(attempt, generation, 'media-source', sourceEvidence('MPEG-DASH MediaSource playback is unavailable.'))
      return
    }

    const DashMediaPlayer = dashMediaPlayerFactory()

    if (!DashMediaPlayer) {
      failAttempt(
        attempt,
        generation,
        'media-source',
        sourceEvidence('The local DASH playback engine is unavailable.'),
      )
      return
    }

    const dash = DashMediaPlayer().create()
    activeDash = dash
    dash.on(DashMediaPlayer.events.ERROR, (event: { error?: { message?: string } }) => {
      if (isActiveAttempt(attempt, generation) && activeDash === dash) {
        const detail = event.error?.message ?? 'MPEG-DASH playback error.'
        failAttempt(attempt, generation, 'network', sourceEvidence(detail))
      }
    })
    dash.on(DashMediaPlayer.events.STREAM_INITIALIZED, () => {
      if (isActiveAttempt(attempt, generation)) {
        void player.play().catch(() => {
          failAttempt(attempt, generation, 'decode', sourceEvidence('The MPEG-DASH media element rejected playback.'))
        })
      }
    })
    dash.initialize(player, attempt.url, true)
  }

  function startNativeAttempt(attempt: PlaybackAttempt, generation: number): void {
    player.src = attempt.url
    player.load()
    void player.play().catch(() => {
      failAttempt(attempt, generation, 'decode', sourceEvidence('The native media element rejected playback.'))
    })
  }

  applyPlaybackRate(player as any, playerPlaybackRate, playbackPreservesPitch())
  player.muted = playerMuted

  function restoreResume(): void {
    if (
      resumeRestored ||
      activeItem.section === 'live' ||
      !Number.isFinite(player.duration) ||
      player.duration <= 0
    ) {
      return
    }

    const legacyResumeKey = `legacy:${activeItem.id}`
    const resume = resumeEntries.get(activeItemKey) ?? resumeEntries.get(legacyResumeKey)

    if (
      !resume ||
      resume.completed ||
      resume.position <= 10 ||
      resume.position >= player.duration - 10
    ) {
      return
    }

    player.currentTime = resume.position
    resumeRestored = true

    if (!resumeEntries.has(activeItemKey) && resumeEntries.has(legacyResumeKey)) {
      resumeEntries.delete(legacyResumeKey)
      resumeEntries.set(activeItemKey, {
        streamKey: activeItemKey,
        position: resume.position,
        updatedAt: resume.updatedAt,
        stream: activeItem,
        duration: resume.duration ?? player.duration,
        completed: false,
      })
      saveCurrentResume()
    }
  }

  function setPlayerTimelinePresentation(position: number): void {
    if (!Number.isFinite(player.duration) || player.duration <= 0) {
      return
    }

    const safePosition = clampSeekPosition(position, player.duration)
    const percent = timelinePercentFromPosition(safePosition, player.duration)
    playerProgress.value = String(percent)
    playerProgress.style.setProperty('--timeline-progress', `${percent}%`)
    playerCurrentTime.textContent = formatDuration(safePosition)
  }

  function updatePlayerTimelinePreview(position: number): void {
    if (!Number.isFinite(player.duration) || player.duration <= 0) {
      return
    }

    if (playerTimelinePreviewSeconds === null) {
      playerTimelineWasPlaying = !player.paused
    }

    if (playerTimelineWasPlaying && !player.paused) {
      player.pause()
    }

    playerTimelinePreviewSeconds = clampSeekPosition(position, player.duration)
    setPlayerTimelinePresentation(playerTimelinePreviewSeconds)
    playerPreviewTime.textContent = `Seek to ${formatDuration(playerTimelinePreviewSeconds)}`
    playerPreviewTime.hidden = false
  }

  function commitPlayerTimelinePreview(): void {
    const position = playerTimelinePreviewSeconds

    if (position === null) {
      return
    }

    const resumePlayback = playerTimelineWasPlaying
    // Always clear preview state first so the player can never get stuck paused
    // with a stale overlay when duration is momentarily unavailable (e.g. during
    // a live-DVR manifest refresh).
    playerTimelinePreviewSeconds = null
    playerTimelineWasPlaying = false
    playerPreviewTime.hidden = true

    if (Number.isFinite(player.duration) && player.duration > 0) {
      player.currentTime = clampSeekPosition(position, player.duration)
      setPlayerTimelinePresentation(player.currentTime)
      showPlayerSeekFeedback(`Seeking to ${formatDuration(player.currentTime)}`)
    }

    if (resumePlayback) {
      void player.play().catch(() => showPlayerMessage('Press OK to continue playback.'))
    }
  }

  function discardPlayerTimelinePreview(): void {
    if (playerTimelinePreviewSeconds === null) {
      return
    }

    playerTimelinePreviewSeconds = null
    playerTimelineWasPlaying = false
    setPlayerTimelinePresentation(player.currentTime)
    playerPreviewTime.hidden = true
  }

  function updatePlayerPlayControl(): void {
    const button = document.querySelector<HTMLElement>('[data-action="toggle-play"]')

    if (button) {
      button.textContent = player.paused ? '▶' : 'Ⅱ'
      button.setAttribute('aria-label', player.paused ? 'Play' : 'Pause')
    }
  }

  player.addEventListener('loadedmetadata', () => {
    performanceTrace.event('playback', 'loadedmetadata', {
      videoWidth: player.videoWidth,
      videoHeight: player.videoHeight,
      durationKnown: Number.isFinite(player.duration),
    }, { interactionId: playbackInteractionId ?? undefined })
    // Re-assert rate + pitch after source (re)attach so HLS.js/mpegts.js/dash.js
    // engine swaps don't silently reset the media element's playback properties.
    applyPlaybackRate(player as any, playerPlaybackRate, playbackPreservesPitch())
    restoreResume()
    // On webOS, loaded metadata is the reliable native-playback readiness signal.
    // Do not destroy a stream that has already attached a playable media pipeline
    // merely because frame telemetry is unavailable in the emulator.
    confirmPlaybackStarted()
    player.play().catch(() => showPlayerMessage('Press OK to start playback.'))
  })
  player.addEventListener('durationchange', restoreResume)
  player.addEventListener('error', () => {
    const error = player.error
    performanceTrace.event('playback', 'media-error', {
      code: error?.code ?? 0,
      messagePresent: Boolean(error?.message),
    }, { interactionId: playbackInteractionId ?? undefined })

    failActiveAttempt(
      error?.code === 3 ? 'decode' : 'network',
      sourceEvidence(error?.message),
    )
  })
  player.addEventListener('timeupdate', () => {
    confirmVisiblePlayback()

    if (
      (activeItem.section !== 'live' || Boolean(playerSourceOverride)) &&
      Number.isFinite(player.duration)
    ) {
      if (playerTimelinePreviewSeconds === null) {
        setPlayerTimelinePresentation(player.currentTime)
      }
      playerDuration.textContent = formatDuration(player.duration)

      if (activeItem.section !== 'live' && Date.now() - lastResumeSaveAt > 10_000) {
        persistProgress()
      }
    }
  })
  player.addEventListener('waiting', () => {
    performanceTrace.event('playback', 'waiting', undefined, {
      interactionId: playbackInteractionId ?? undefined,
    })
  })
  player.addEventListener('canplay', () => {
    performanceTrace.event('playback', 'canplay', undefined, {
      interactionId: playbackInteractionId ?? undefined,
    })
  })
  player.addEventListener('pause', () => {
    performanceTrace.event('playback', 'paused', undefined, {
      interactionId: playbackInteractionId ?? undefined,
    })
    persistProgress()
    updatePlayerPlayControl()
  })
  player.addEventListener('ended', () => {
    performanceTrace.event('playback', 'ended', undefined, {
      interactionId: playbackInteractionId ?? undefined,
    })
    performanceTrace.endInteraction(playbackInteractionId, 'playback-ended')
    if (activeItem.section !== 'live') {
      markStreamWatched(activeItem, true, player.duration)
      const nextEpisode = findNextEpisode(activeItem)

      if (nextEpisode) {
        playerItem = nextEpisode
        playerSourceOverride = null
        playerForceDirect = false
        render()
      }
    }
  })
  player.addEventListener('playing', () => {
    performanceTrace.event('playback', 'playing', undefined, {
      interactionId: playbackInteractionId ?? undefined,
    })
    // The webOS emulator can render native video while exposing neither stable
    // dimensions nor decoded-frame statistics. Once the media element reports
    // playing, it must not be torn down by the visual-frame watchdog.
    updatePlayerPlayControl()
    confirmPlaybackStarted()
  })
  player.addEventListener('resize', () => {
    confirmVisiblePlayback()
  })
  playerProgress.addEventListener('focus', () => {
    setPlayerTimelinePresentation(player.currentTime)
  })
  playerProgress.addEventListener('input', () => {
    if (Number.isFinite(player.duration) && player.duration > 0) {
      updatePlayerTimelinePreview(
        timelinePositionFromPercent(Number(playerProgress.value), player.duration),
      )
    }
  })
  playerProgress.addEventListener('change', commitPlayerTimelinePreview)
  playerProgress.addEventListener('nova-timeline-step', (event) => {
    if (!Number.isFinite(player.duration) || player.duration <= 0) {
      return
    }

    const seconds = (event as CustomEvent<number>).detail
    const basePosition = playerTimelinePreviewSeconds ?? player.currentTime
    updatePlayerTimelinePreview(basePosition + seconds)
  })
  playerProgress.addEventListener('nova-timeline-confirm', () => {
    if (playerTimelinePreviewSeconds !== null) {
      commitPlayerTimelinePreview()
    } else {
      togglePlayback()
    }
  })
  playerProgress.addEventListener('blur', () => {
    if (playerTimelinePreviewSeconds !== null) {
      commitPlayerTimelinePreview()
    }
  })
  document.addEventListener('mousemove', revealControls)
  setPlayerUiMode(playerUiMode)
  renderedView = view
  restoreFocus(snapshot)
  startNextAttempt()

  function decodedVideoFrames(): number | null {
    if (typeof player.getVideoPlaybackQuality !== 'function') {
      return null
    }

    const frames = player.getVideoPlaybackQuality().totalVideoFrames
    return Number.isFinite(frames) ? frames : null
  }

  function confirmPlaybackStarted(): void {
    if (visiblePlaybackConfirmed) {
      return
    }

    visiblePlaybackConfirmed = true
    setLibraryPlaybackStarting(false)
    markFlatSnapshotPlaybackReady()
    performanceTrace.endInteraction(playbackInteractionId, 'playback-ready', {
      engine: activeAttempt?.engine ?? 'unknown',
      attemptIndex: nextAttemptIndex,
    })
    clearPlaybackWatchdog()
    playerDiagnostics = []
    playerDiagnosticsElement.hidden = true
    hidePlayerMessage()
  }

  function confirmVisiblePlayback(): void {
    if (
      !hasVerifiedVideoFrame(
        player.videoWidth,
        player.videoHeight,
        player.currentTime,
        decodedFrameBaseline,
        decodedVideoFrames(),
      ) &&
      !hasVisibleVideoTrack(
        player.videoWidth,
        player.videoHeight,
        player.currentTime,
      ) &&
      !hasAdvancedPlaybackTimeline(player.currentTime)
    ) {
      return
    }

    confirmPlaybackStarted()
  }

  function persistProgress(): void {
    if (
      activeItem.section === 'live' ||
      player.currentTime < 5 ||
      !Number.isFinite(player.duration) ||
      !profile
    ) {
      return
    }

    lastResumeSaveAt = Date.now()
    resumeEntries.set(activeItemKey, {
      streamKey: activeItemKey,
      position: player.currentTime,
      updatedAt: lastResumeSaveAt,
      stream: activeItem,
      duration: player.duration,
      completed: false,
    })
    saveCurrentResume()
  }

  function saveCurrentResume(): void {
    if (profile && !saveResume(profile.id, resumeEntries)) {
      showToast(STORAGE_FAILURE_MESSAGE)
    }
  }

  function showPlayerMessage(text: string): void {
    playerMessage.textContent = text
    playerMessage.hidden = false
    revealControls()
  }

  function hidePlayerMessage(): void {
    playerMessage.hidden = true
  }
}

function clearPlayerControlsTimer(): void {
  if (playerControlsTimer !== null) {
    window.clearTimeout(playerControlsTimer)
    playerControlsTimer = null
  }
}

function setPlayerUiMode(mode: PlayerUiMode): void {
  playerUiMode = mode
  const controls = document.querySelector<HTMLElement>('#player-controls')
  const progress = document.querySelector<HTMLElement>('#player-progress-wrap')

  clearPlayerControlsTimer()

  if (mode === 'immersive') {
    controls?.classList.add('concealed')
    progress?.classList.add('concealed')
    document.querySelector<HTMLElement>('#player-surface')?.focus({ preventScroll: true })
    return
  }

  controls?.classList.remove('concealed')
  progress?.classList.remove('concealed')

  if (mode === 'overlay' || mode === 'seeking') {
    playerControlsTimer = window.setTimeout(() => {
      // Match YouTube/VLC: never auto-hide the controls while the video is
      // paused, otherwise the user is left on a frozen frame with no state
      // indication. The controls stay up until playback resumes or Back is
      // pressed. Seeking is transient, so it is allowed to time out.
      const video = document.querySelector<HTMLVideoElement>('#video-player')

      if (playerUiMode === 'overlay' && !video?.paused) {
        setPlayerUiMode('immersive')
      }
    }, 3500)
  }
}

function revealControls(): void {
  if (view !== 'player') {
    return
  }

  if (playerUiMode === 'immersive') {
    setPlayerUiMode('overlay')
  } else if (playerUiMode === 'overlay' || playerUiMode === 'seeking') {
    setPlayerUiMode(playerUiMode)
  }
}

function isFocusedPlayerControl(): boolean {
  const active = document.activeElement
  return (
    active instanceof HTMLElement &&
    Boolean(
      active.closest(
        '#player-controls, #player-progress-wrap, #player-diagnostics, #channel-overlay',
      ),
    )
  )
}

function showPlayerSeekFeedback(text: string): void {
  const feedback = document.querySelector<HTMLElement>('#player-seek-feedback')

  if (!feedback) {
    return
  }

  if (playerSeekFeedbackTimer !== null) {
    window.clearTimeout(playerSeekFeedbackTimer)
  }

  feedback.textContent = text
  feedback.hidden = false
  playerSeekFeedbackTimer = window.setTimeout(() => {
    feedback.hidden = true
    playerSeekFeedbackTimer = null
  }, 900)
}

function playerCanSeek(): boolean {
  const player = document.querySelector<HTMLVideoElement>('#video-player')
  const hasSeekableSource = playerItem?.section !== 'live' || Boolean(playerSourceOverride)
  return Boolean(
    hasSeekableSource &&
      player &&
      Number.isFinite(player.duration) &&
      player.duration > 0,
  )
}

function applyPlayerSeek(direction: -1 | 1, seconds: number): boolean {
  const player = document.querySelector<HTMLVideoElement>('#video-player')

  if (!player || !Number.isFinite(player.duration) || player.duration <= 0) {
    return false
  }

  const delta = direction * seconds
  player.currentTime = clampSeekPosition(player.currentTime + delta, player.duration)
  showPlayerSeekFeedback(`${seekFeedbackLabel(delta)} · ${formatDuration(player.currentTime)}`)
  return true
}

function cancelPlayerSeek(): void {
  if (playerSeekHoldTimer !== null) {
    window.clearTimeout(playerSeekHoldTimer)
    playerSeekHoldTimer = null
  }

  if (playerSeekRepeatTimer !== null) {
    window.clearInterval(playerSeekRepeatTimer)
    playerSeekRepeatTimer = null
  }

  if (playerSeekDirection !== null && playerUiMode === 'seeking') {
    setPlayerUiMode('overlay')
  }

  playerSeekDirection = null
  playerSeekStartedAt = 0
}

function startPlayerSeek(direction: -1 | 1): void {
  if (!playerCanSeek()) {
    setPlayerUiMode('overlay')
    showPlayerSeekFeedback('Seeking is unavailable for this live stream')
    return
  }

  if (playerSeekDirection === direction) {
    return
  }

  cancelPlayerSeek()

  const now = Date.now()
  const isDoubleTap = isDoubleSeekTap(
    playerLastSeekDirection,
    playerLastSeekAt,
    direction,
    now,
  )

  playerLastSeekDirection = direction
  playerLastSeekAt = now
  playerSeekDirection = direction
  playerSeekStartedAt = now
  setPlayerUiMode('seeking')
  applyPlayerSeek(direction, isDoubleTap ? 20 : 10)

  playerSeekHoldTimer = window.setTimeout(() => {
    if (playerSeekDirection !== direction) {
      return
    }

    playerSeekRepeatTimer = window.setInterval(() => {
      if (playerSeekDirection !== direction) {
        return
      }

      const heldMs = Date.now() - playerSeekStartedAt
      applyPlayerSeek(direction, seekStepForHold(heldMs))
    }, 420)
  }, 450)
}

let delegatedEventsBound = false
let liveLogoErrorHandlerBound = false
let navigationZoneSequence = 0

function assignNavigationZones(): void {
  const zoneSelectors = [
    '.topbar',
    '.login-form',
    '.profile-quick-switch',
    '.hero-actions',
    '.content-grid',
    '.hub-grid',
    '.catalog-tools',
    '.category-grid',
    '.catalog-pager',
    '.action-row',
    '.content-guidance',
    '.metadata-people',
    '.metadata-title-row',
    '.person-filmography',
    '.person-header',
    '.series-episodes',
    '.guide-grid',
    '.global-search-panel',
    '.global-search-group',
    '.settings-panel',
    '.profile-list',
    '#epg-panel',
    '.status-page',
    '#player-controls',
    '#player-progress-wrap',
    '#player-diagnostics',
    '#channel-overlay',
  ].join(', ')

  app.querySelectorAll<HTMLElement>(zoneSelectors).forEach((zone) => {
    if (!zone.dataset.navZone) {
      navigationZoneSequence += 1
      zone.dataset.navZone = `zone-${navigationZoneSequence}`
    }
  })
}

/**
 * If an image has a data-fallback-src attribute, swap it to the fallback URL
 * and remove the attribute so a second failure proceeds to the text tile.
 * Returns true if a swap was performed (caller should skip adding
 * image-unavailable), false if no fallback was available.
 */
function deferredImageContainer(image: HTMLImageElement): HTMLElement | null {
  return image.closest<HTMLElement>('.poster-artwork, .episode-art, .live-channel-artwork')
}

function deferredImageIsNearby(image: HTMLImageElement): boolean {
  const rect = image.getBoundingClientRect()

  return (
    rect.bottom >= -DEFERRED_IMAGE_PREFETCH_PX &&
    rect.top <= window.innerHeight + DEFERRED_IMAGE_PREFETCH_PX
  )
}

function deferredImageConcurrency(): number {
  return isWebOsRuntime()
    ? WEBOS_DEFERRED_IMAGE_CONCURRENCY
    : DEFERRED_IMAGE_CONCURRENCY
}

function scheduleDeferredImageLoads(): void {
  if (deferredImageScheduleHandle !== null) {
    return
  }

  deferredImageScheduleHandle = window.requestAnimationFrame(() => {
    deferredImageScheduleHandle = null

    const concurrency = deferredImageConcurrency()

    if (deferredImageLoads >= concurrency) {
      return
    }

    const pending = Array.from(
      app.querySelectorAll<HTMLImageElement>(
        'img[data-deferred-src]:not([data-deferred-loading="true"])',
      ),
    )
      .filter(deferredImageIsNearby)
      .sort((left, right) => {
        const leftDistance = Math.abs(left.getBoundingClientRect().top)
        const rightDistance = Math.abs(right.getBoundingClientRect().top)
        return leftDistance - rightDistance
      })

    for (const image of pending) {
      if (deferredImageLoads >= concurrency) {
        break
      }

      const source = image.dataset.deferredSrc

      if (!source) {
        continue
      }

      const container = deferredImageContainer(image)
      deferredImageLoads += 1
      image.dataset.deferredLoading = 'true'
      container?.classList.add('image-loading')

      const settle = (outcome: 'load' | 'error'): void => {
        deferredImageLoads = Math.max(0, deferredImageLoads - 1)
        delete image.dataset.deferredLoading
        container?.classList.remove('image-loading')
        performanceTrace.event('image', 'deferred-settled', {
          outcome,
          queuedRemaining: app.querySelectorAll('img[data-deferred-src]').length,
          concurrency,
        })
        window.setTimeout(
          scheduleDeferredImageLoads,
          isWebOsRuntime() ? WEBOS_DEFERRED_IMAGE_COOLDOWN_MS : 0,
        )
      }

      image.addEventListener('load', () => settle('load'), { once: true })
      image.addEventListener('error', () => settle('error'), { once: true })
      delete image.dataset.deferredSrc
      scheduleImageErrorCheck(image)
      image.src = source
      performanceTrace.event('image', 'deferred-admitted', {
        queuedRemaining: app.querySelectorAll('img[data-deferred-src]').length,
        concurrency,
      })
      performanceTrace.trackImages(app)
    }
  })
}

function tryImageFallbackSwap(image: HTMLImageElement): boolean {
  var fallbackSrc = image.getAttribute('data-fallback-src')

  if (fallbackSrc && fallbackSrc !== image.src) {
    performanceTrace.event('image', 'fallback-swapped', {
      imageType: image.className || 'unclassified',
      fallbackPresent: true,
    })
    image.removeAttribute('data-fallback-src')
    image.src = fallbackSrc
    return true
  }

  performanceTrace.event('image', 'fallback-unavailable', {
    imageType: image.className || 'unclassified',
  })
  return false
}

function scheduleImageErrorCheck(image: HTMLImageElement): void {
  if (image.dataset.errorCheckScheduled === 'true') {
    return
  }

  image.dataset.errorCheckScheduled = 'true'
  window.setTimeout(() => {
    if (
      !image.isConnected ||
      image.dataset.deferredSrc ||
      image.dataset.deferredLoading === 'true' ||
      (image.complete && image.naturalWidth > 0)
    ) {
      return
    }

    performanceTrace.event('image', 'timeout-without-load', {
      imageType: image.className || 'unclassified',
      complete: image.complete,
      naturalWidth: image.naturalWidth,
    })

    if (tryImageFallbackSwap(image)) {
      delete image.dataset.errorCheckScheduled
      scheduleImageErrorCheck(image)
      return
    }

    if (image.classList.contains('live-channel-logo')) {
      image.closest<HTMLElement>('.live-channel-artwork')?.classList.add('logo-unavailable')
    } else if (image.classList.contains('episode-image')) {
      image.closest<HTMLElement>('.episode-art')?.classList.add('image-unavailable')
    } else {
      image.closest<HTMLElement>('.poster-artwork')?.classList.add('image-unavailable')
    }
  }, 5_000)
}

function bindEvents(): void {
  invalidateSpatialLayout('event-binding')
  performanceTrace.trackImages(app)

  if (!delegatedEventsBound) {
    app.addEventListener('click', (event) => {
      const target = event.target

      if (!(target instanceof Element)) {
        return
      }

      const actionElement = target.closest<HTMLElement>('[data-action]')

        if (actionElement && app.contains(actionElement)) {
          const interactionId = performanceTrace.startInteraction('click-action', {
            action: actionElement.dataset.action ?? 'unknown',
          })
          void handleAction(actionElement).finally(() => {
            performanceTrace.endInteraction(interactionId, 'click-action-complete')
          })
        }
    })

    // The continue-menu overlay is appended to document.body (outside #app).
    // Delegate its action clicks from the body so handleAction receives them.
    document.body.addEventListener('click', function (event) {
      var target = event.target
      if (!(target instanceof Element)) {
        return
      }
      var menu = document.querySelector('#continue-menu')
      if (!menu) {
        return
      }
      var actionElement = target.closest<HTMLElement>('[data-action]')
      if (actionElement && menu.contains(actionElement)) {
        const interactionId = performanceTrace.startInteraction('overlay-action', {
          action: actionElement.dataset.action ?? 'unknown',
        })
        void handleAction(actionElement).finally(() => {
          performanceTrace.endInteraction(interactionId, 'overlay-action-complete')
        })
      }
    })

    delegatedEventsBound = true
  }

  if (!liveLogoErrorHandlerBound) {
    app.addEventListener(
      'error',
      (event) => {
        const target = event.target

        if (!(target instanceof HTMLImageElement)) {
          return
        }

        performanceTrace.event('image', 'fallback-handler-error', {
          imageType: target.className || 'unclassified',
          connected: target.isConnected,
          naturalWidth: target.naturalWidth,
        })

        if (target.classList.contains('live-channel-logo')) {
          target.closest<HTMLElement>('.live-channel-artwork')?.classList.add('logo-unavailable')
        }

        // Try swapping to the fallback image before marking unavailable.
        if (tryImageFallbackSwap(target)) {
          return
        }

        if (target.classList.contains('episode-image')) {
          target.closest<HTMLElement>('.episode-art')?.classList.add('image-unavailable')
        } else if (target.classList.contains('poster')) {
          target.closest<HTMLElement>('.poster-artwork')?.classList.add('image-unavailable')
        }
      },
      true,
    )
    liveLogoErrorHandlerBound = true
  }

  app
    .querySelectorAll<HTMLImageElement>(
      '.live-channel-logo[src], .poster[src], .episode-image[src]',
    )
    .forEach(scheduleImageErrorCheck)

  app.querySelectorAll<HTMLElement>('button, input, select, [tabindex="0"]').forEach((element) => {
    if (!element.dataset.focusId) {
      navigationSequence += 1
      element.dataset.focusId = `generated-${navigationSequence}`
    }

    if (element.dataset.navSkip === 'true') {
      element.tabIndex = -1
    }
  })

  assignNavigationZones()
  scheduleDeferredImageLoads()
}

async function handleAction(element: HTMLElement): Promise<void> {
  if (editingInput && !element.contains(editingInput)) {
    finishTextEditing()
  }

  const action = element.dataset.action

  if (action === 'home') {
    catalogReturnPoint = null
    startNavigation()
    view = 'home'
    render()
    return
  }

  if (action === 'return-to-library') {
    requestAppBack()
    return
  }

  if (action === 'open-section') {
    await openSection(element.dataset.section as LibrarySection)
    return
  }

  if ((action === 'catalog-prev' || action === 'catalog-next') && catalog) {
    catalog.page += action === 'catalog-next' ? 1 : -1
    renderCatalog()
    return
  }

  if (action === 'cycle-sort' && catalog) {
    catalog.sort = nextSort(catalog.sort)
    catalog.page = 0
    renderCatalog()
    showToast(`Sort: ${SORT_LABELS[catalog.sort]}`)
    return
  }

  if (action === 'select-category' && catalog) {
    const nextCategory =
      catalog.categories.find((category) => category.id === element.dataset.categoryId) ?? null
    await loadCategory(nextCategory)
    return
  }

  if (action === 'select-stream') {
    const stream = streamFromKey(element.dataset.streamKey)

    if (!stream) {
      return
    }

    if (element.dataset.resumeCard === 'true') {
      await beginResumePlayback(stream)
    } else {
      await openDetails(stream)
    }
    return
  }

  if (action === 'resume-continue') {
    var resumeStream = streamFromKey(element.dataset.streamKey)
    closeContinueMenu()
    if (resumeStream) {
      await beginResumePlayback(resumeStream)
    }
    return
  }

  if (action === 'remove-continue') {
    var removeKey = element.dataset.streamKey
    if (removeKey && profile) {
      var removedEntry = resumeEntries.get(removeKey)
      if (removedEntry) {
        // Store for undo before deleting.
        lastRemovedResume = { key: removeKey, entry: removedEntry }
        if (undoResumeTimer !== null) {
          window.clearTimeout(undoResumeTimer)
        }
        undoResumeTimer = window.setTimeout(function () {
          lastRemovedResume = null
          undoResumeTimer = null
        }, 6000)

        resumeEntries.delete(removeKey)
        if (!saveResume(profile.id, resumeEntries)) {
          showToast(STORAGE_FAILURE_MESSAGE)
        }
      }
    }

    closeContinueMenu()

    // Re-render the home view. restoreFocus inside renderHome will land on
    // the next continue-watching card or fall back to the first hub card.
    renderHome()

    showToast('Removed \u2014 press Green to undo')
    return
  }

  if (action === 'toggle-favorite') {
    const stream = streamFromKey(element.dataset.favoriteKey)

    if (!stream || !profile) {
      return
    }

    const nowFavorite = toggleStoredFavorite(favorites, stream)

    if (!saveFavorites(profile.id, favorites)) {
      showToast(STORAGE_FAILURE_MESSAGE)
    }

    if (catalog?.isFavorites && !nowFavorite) {
      catalog = {
        ...catalog,
        streams: favoriteStreams(favorites),
        page: 0,
      }
      renderCatalog()
      return
    }

    updateFavoriteControls(streamLookupKey(stream), nowFavorite)
    return
  }

  if (action === 'toggle-watched' && selectedItem) {
    markStreamWatched(selectedItem, !resumeEntries.get(streamLookupKey(selectedItem))?.completed)
    renderDetails()
    return
  }

  if (action === 'favorites') {
    openFavorites()
    return
  }

  if (action === 'global-search') {
    if (view !== 'search') {
      searchReturnView = view
      pushRouteHistory()
    }
    startNavigation()
    view = 'search'
    render()
    return
  }

  if (action === 'run-global-search') {
    await runGlobalSearch()
    return
  }

  if (action === 'clear-global-search') {
    clearGlobalSearch()
    return
  }

  if (action === 'cancel-global-search') {
    cancelGlobalSearch()
    return
  }

  if (action === 'toggle-global-search-section') {
    const section = element.dataset.section as LibrarySection

    if (GLOBAL_SEARCH_SECTIONS.includes(section)) {
      if (expandedGlobalSearchSections.has(section)) {
        expandedGlobalSearchSections.delete(section)
      } else {
        expandedGlobalSearchSections.add(section)
      }
      updateGlobalSearchView({ controls: false, fullResults: false, sections: [section] })
    }
    return
  }

  if (action === 'open-guide') {
    await openGuide()
    return
  }

  if (action === 'refresh-guide') {
    await openGuide(true)
    return
  }

  if (action === 'open-person') {
    const personId = element.dataset.personId
    const name = element.dataset.personName

    if (personId && name) {
      await openPerson(personId, name)
    }
    return
  }

  if (action === 'open-related-title' || action === 'open-filmography-title') {
    const tmdbId = element.dataset.tmdbId
    const mediaType = element.dataset.mediaType
    const title = element.dataset.title

    if (tmdbId && title && (mediaType === 'movie' || mediaType === 'tv')) {
      await openFilmographyTitle(tmdbId, mediaType, title, element.dataset.year)
    }
    return
  }

  if (action === 'play-selected' && selectedItem) {
    beginPlayback(selectedItem)
    return
  }

  if (action === 'play-next-episode') {
    const episode = streamFromKey(element.dataset.streamKey)

    if (episode) {
      beginPlayback(episode)
    }
    return
  }

  if (action === 'select-series-season' && selectedSeries) {
    const season = element.dataset.season

    if (season && selectedSeries.episodes[season]) {
      activeSeriesSeason = season
      requestFocus({ id: `series-season-${season}`, scrollY: window.scrollY, view: 'details' })
      renderDetails()
    }
    return
  }

  if (action === 'play-episode') {
    const episode = streamFromKey(element.dataset.streamKey)
    if (episode) {
      beginPlayback(episode)
    }
    return
  }

  if (action === 'show-epg' && selectedItem) {
    await showEpg(selectedItem)
    return
  }

  if (action === 'show-catchup' && selectedItem) {
    await showEpg(selectedItem, true)
    return
  }

  if (action === 'play-catchup' && selectedItem) {
    const start = Number(element.dataset.programStart)
    const duration = Number(element.dataset.programDuration)

    if (!Number.isFinite(start) || !Number.isFinite(duration) || !client) {
      return
    }

    const catchupUrl = client.catchupUrl(selectedItem, new Date(start), duration)

    if (!catchupUrl) {
      showToast('Catch-up is not available for this programme.')
      return
    }

    playerReturnPoint = captureReturnPoint()
    pushRouteHistory()
    cancelScheduledCatalogSync()
    catalogSync?.cancel()
    startNavigation()
    playerCleanup?.()
    playerCleanup = null
    playerSourceOverride = catchupUrl
    playerForceDirect = true
    playerItem = selectedItem
    view = 'player'
    render()
    return
  }

  if (action === 'watch-trailer' && selectedItem) {
    const trailer = detailsMetadata(selectedItem).trailer

    if (trailer) {
      window.open(trailer.url, '_blank', 'noopener')
    }
    return
  }

  if (action === 'close-player') {
    requestAppBack()
    return
  }

  if (action === 'retry-player' && view === 'player') {
    startNavigation()
    playerCleanup?.()
    playerCleanup = null
    render()
    return
  }

  if (action === 'toggle-play') {
    togglePlayback()
    return
  }

  if (action === 'skip-backward') {
    seekBy(-10)
    return
  }

  if (action === 'skip-forward') {
    seekBy(10)
    return
  }

  if (action === 'cycle-speed') {
    cyclePlaybackSpeed()
    return
  }

  if (action === 'cycle-aspect') {
    playerAspect = playerAspect === 'contain' ? 'cover' : 'contain'
    document.querySelector<HTMLElement>('.player-page')?.classList.toggle('player-aspect-cover', playerAspect === 'cover')
    document.querySelector<HTMLElement>('.player-page')?.classList.toggle('player-aspect-contain', playerAspect === 'contain')
    showToast(`Aspect: ${playerAspect === 'contain' ? 'Fit' : 'Fill'}`)
    return
  }

  if (action === 'toggle-mute') {
    const video = document.querySelector<HTMLVideoElement>('#video-player')
    if (video) {
      playerMuted = !video.muted
      video.muted = playerMuted
      const button = document.querySelector<HTMLElement>('[data-action="toggle-mute"]')
      if (button) {
        button.textContent = playerMuted ? '🔇' : '🔊'
      }
    }
    revealControls()
    return
  }

  if (action === 'cycle-audio') {
    cycleAudioTrack()
    return
  }

  if (action === 'cycle-subtitles') {
    cycleSubtitleTrack()
    return
  }

  if (action === 'cycle-quality') {
    cycleQuality()
    return
  }

  if (action === 'previous-live-channel') {
    switchLiveChannel(-1)
    return
  }

  if (action === 'next-live-channel') {
    switchLiveChannel(1)
    return
  }

  if (action === 'toggle-last-channel') {
    switchToLastChannel()
    return
  }

  if (action === 'toggle-channel-overlay') {
    toggleChannelOverlay()
    return
  }

  if (action === 'play-live-channel') {
    const stream = streamFromKey(element.dataset.streamKey)
    if (stream) {
      beginPlayback(stream)
    }
    return
  }

  if (action === 'refresh-account') {
    await refreshAccount()
    return
  }

  if (action === 'refresh-library') {
    const result = await runCatalogSync()

    if (!result) {
      showToast('Library refresh is unavailable right now.')
      return
    }

    if (result.status === 'completed') {
      showToast('Downloaded library refreshed.')
    } else if (result.status === 'cooldown') {
      showToast('Downloaded library is already up to date.')
    } else if (result.status === 'deferred') {
      showToast('Library refresh is deferred until the next provider sync window.')
    } else if (result.status === 'busy') {
      showToast('Library refresh is already running.')
    } else {
      showToast('Library refresh did not complete.')
    }
    return
  }

  if (action === 'measure-vod-library') {
    const result = await runCatalogSync({
      section: 'vod',
      maxResponseBytes: VOD_SYNC_MEASUREMENT_MAX_RESPONSE_BYTES,
    })

    if (!result) {
      showToast('VOD measurement is unavailable right now.')
    } else if (result.status === 'completed') {
      showToast('VOD download measurement completed.')
    } else if (result.status === 'deferred') {
      showToast('VOD measurement is deferred until the next provider sync window.')
    } else if (result.status === 'busy') {
      showToast('A library refresh is already running.')
    } else {
      showToast('VOD download measurement did not complete.')
    }
    return
  }

  if (action === 'settings') {
    if (view !== 'settings') {
      pushRouteHistory()
    }
    startNavigation()
    view = 'settings'
    render()
    return
  }

  if (action === 'save-settings') {
    saveCurrentSettings()
    return
  }

  if (action === 'add-profile') {
    pushRouteHistory()
    startNavigation()
    cancelScheduledCatalogSync()
    catalogSync?.cancel()
    clearProfile()
    profile = null
    client = null
    catalogSync = null
    account = null
    favorites = new Map()
    resumeEntries = new Map()
    view = 'login'
    render()
    return
  }

  if (action === 'switch-profile') {
    const savedProfile = element.dataset.profileId ? selectProfile(element.dataset.profileId) : null

    if (!savedProfile) {
      showToast(STORAGE_FAILURE_MESSAGE)
      return
    }

    const { token, signal } = startNavigation()
    activateProfile(savedProfile)
    renderLoading(`Connecting to ${savedProfile.name}…`)

    try {
      const nextAccount = await client?.validate(signal)

      if (!isCurrentNavigation(token)) {
        return
      }

      account = nextAccount ?? null
    } catch {
      if (!isCurrentNavigation(token)) {
        return
      }

      account = null
    }

    if (isCurrentNavigation(token)) {
      view = 'home'
      render()
    }
    return
  }

  if (action === 'remove-profile') {
    const profileId = element.dataset.profileId

    if (!profileId || profileId === profile?.id || !window.confirm('Remove this saved playlist and its local history?')) {
      return
    }

    removeProfile(profileId)
    renderSettings()
  }
}

async function openSection(section: LibrarySection): Promise<void> {
  const activeProfile = profile

  if (!activeProfile) {
    return
  }

  catalogReturnPoint = null
  pushRouteHistory()
  const { token } = startNavigation()
  renderLoading(`Opening downloaded ${labels[section].toLowerCase()}…`)

  const local = await catalogRepository.readCompleteSectionCategories(
    activeProfile.id,
    section,
  )

  if (!isCurrentNavigation(token)) {
    return
  }

  if (local.coverage === 'complete') {
    rememberCategories(section, local.categories)
    catalog = {
      section,
      category: null,
      categories: local.categories,
      streams: [],
      query: '',
      page: 0,
      isFavorites: false,
      sort: 'default',
    }
  } else {
    catalog = {
      section,
      category: null,
      categories: [],
      streams: [],
      query: '',
      page: 0,
      isFavorites: false,
      sort: 'default',
      availabilityMessage:
        section === 'vod'
          ? 'Movies have not been downloaded yet. Refresh library from Settings.'
          : 'This library section is not available on this TV yet. Refresh library from Settings.',
    }
  }

  view = 'catalog'
  render()
}

async function loadCategory(category: Category | null): Promise<void> {
  const activeProfile = profile
  const activeCatalog = catalog

  if (!activeProfile || !activeCatalog) {
    return
  }

  if (!category) {
    catalog = {
      ...activeCatalog,
      category: null,
      streams: [],
      query: '',
      page: 0,
      isFavorites: false,
      results: undefined,
    }
    renderCatalog()
    return
  }

  catalogReturnPoint = {
    catalog: { ...activeCatalog },
    focus: snapshotFocus(),
  }
  pushRouteHistory()
  const { token } = startNavigation()
  renderLoading(`Opening ${category.name}…`)

  const local = await catalogRepository.readCompleteCategory(
    activeProfile.id,
    activeCatalog.section,
    category.id,
  )

  if (!isCurrentNavigation(token)) {
    return
  }

  if (local.coverage === 'none') {
    catalog = {
      ...activeCatalog,
      category,
      streams: [],
      query: '',
      page: 0,
      isFavorites: false,
      availabilityMessage: 'This category is not available in the downloaded library.',
      results: undefined,
    }
    renderCatalog()
    return
  }

  const streams = local.items
  rememberStreams(streams)
  cacheStreams(activeCatalog.section, category.id, streams)

  if (activeCatalog.section === 'live') {
    liveQueue = streams
  }

  const favoritesChanged = hydrateFavorites(favorites, streams)

  if (favoritesChanged && !saveFavorites(activeProfile.id, favorites)) {
    showToast(STORAGE_FAILURE_MESSAGE)
  }

  catalog = {
    ...activeCatalog,
    category,
    streams,
    query: '',
    page: 0,
    isFavorites: false,
    availabilityMessage: undefined,
    results: undefined,
  }
  renderCatalog()
}

async function beginResumePlayback(stream: StreamItem): Promise<void> {
  if (stream.streamType !== 'episode') {
    await openDetails(stream)

    if (view === 'details' && selectedItem) {
      beginPlayback(selectedItem)
    }
    return
  }

  if (stream.seriesId) {
    await openDetails({
      ...stream,
      id: stream.seriesId,
      name: stream.seriesTitle || stream.name,
      cover: stream.seriesCover || stream.cover,
      streamType: undefined,
    })

    const selectedEpisode =
      selectedSeries &&
      Object.values(selectedSeries.episodes)
        .flat()
        .find((candidate) => streamLookupKey(candidate) === streamLookupKey(stream))
    const episode =
      selectedEpisode ??
      {
        ...stream,
        seriesId: selectedItem?.id ?? stream.seriesId,
        seriesTitle: selectedSeries?.info.name ?? stream.seriesTitle,
        seriesCover:
          selectedSeries?.info.cover ?? selectedItem?.cover ?? stream.seriesCover,
      }

    if (view === 'details') {
      beginPlayback(episode)
    }
    return
  }

  // A legacy entry without a recoverable parent still gets a detail screen as
  // its player return point rather than leaving the user stranded on Home.
  detailReturnPoint = captureReturnPoint()
  pushRouteHistory()
  startNavigation()
  selectedItem = stream
  selectedSeries = null
  selectedVod = null
  view = 'details'
  render()
  beginPlayback(stream)
}

async function enrichSelectedTitle(
  item: StreamItem,
  metadata: RichMetadata,
  token: number,
  signal: AbortSignal,
): Promise<void> {
  if (item.section === 'live') {
    return
  }

  const configured = metadataServiceConfigured()
  performanceTrace.event('metadata', 'enrichment-start', {
    section: item.section,
    configured,
    navigationToken: token,
  })

  try {
    const title = metadataLookupTitle(selectedSeries?.info.name ?? item.name)
    const enrichment = configured
      ? await loadTitleMetadata({
          mediaType: item.section === 'series' ? 'tv' : 'movie',
          title,
          originalTitle: metadata.originalTitle,
          year: metadata.year ?? item.year,
          tmdbId: metadata.tmdbId,
          signal,
        })
      : item.section === 'series'
        ? await loadTvMazeSeriesMetadata(title, signal)
        : null

    const current = isCurrentNavigation(token) && view === 'details' && selectedItem === item
    performanceTrace.event('metadata', 'enrichment-complete', {
      current,
      found: Boolean(enrichment),
      castCount: enrichment?.cast?.length ?? 0,
      ratingCount: enrichment?.contentRatings?.length ?? 0,
    })

    if (current) {
      selectedTitleEnrichment = enrichment
      titleEnrichmentLoading = false
      renderDetails()
    }
  } catch {
    const current = isCurrentNavigation(token) && view === 'details' && selectedItem === item
    performanceTrace.event('metadata', 'enrichment-failed', { current, configured })

    if (current) {
      titleEnrichmentLoading = false
      renderDetails()
    }
  }
}

async function openDetails(stream: StreamItem): Promise<void> {
  const activeClient = client
  detailReturnPoint = captureReturnPoint()

  if (!activeClient) {
    return
  }

  pushRouteHistory()
  const { token, signal } = startNavigation()
  rememberStreams([stream])
  selectedItem = stream
  selectedSeries = null
  activeSeriesSeason = null
  selectedVod = null
  selectedTitleEnrichment = null
  titleEnrichmentLoading =
    stream.section === 'series' || (metadataServiceConfigured() && stream.section !== 'live')

  if (stream.section === 'live') {
    view = 'details'
    render()
    return
  }

  renderLoading(stream.section === 'series' ? 'Loading series details…' : 'Loading movie details…')

  try {
    if (stream.section === 'series') {
      const series = await activeClient.seriesInfo(stream.seriesId ?? stream.id, signal)

      if (!isCurrentNavigation(token)) {
        return
      }

      const seriesTitle = series.info.name ?? stream.name
      const seriesCover =
        series.info.cover || stream.cover || stream.metadata?.cover || stream.icon
      const episodes = Object.fromEntries(
        Object.entries(series.episodes).map(([season, episodes]) => [
          season,
          episodes.map((episode) => ({
            ...episode,
            cover: episode.cover || seriesCover,
            seriesId: stream.seriesId ?? stream.id,
            seriesTitle,
            seriesCover,
          })),
        ]),
      )
      selectedSeries = { ...series, episodes }

      let resumeEntriesChanged = false
      Object.values(episodes).flat().forEach((episode) => {
        const key = streamLookupKey(episode)
        const existing = resumeEntries.get(key)

        if (!existing?.stream) {
          return
        }

        resumeEntries.set(key, {
          ...existing,
          stream: episode,
        })
        resumeEntriesChanged = true
      })

      if (resumeEntriesChanged && profile && !saveResume(profile.id, resumeEntries)) {
        showToast(STORAGE_FAILURE_MESSAGE)
      }

      Object.values(episodes).forEach(rememberStreams)
    } else {
      const vod = await activeClient.vodInfo(stream.id, signal)

      if (!isCurrentNavigation(token)) {
        return
      }

      selectedVod = vod
      selectedItem = {
        ...stream,
        containerExtension: vod.containerExtension ?? stream.containerExtension,
        directSource: vod.directSource ?? stream.directSource,
        metadata: vod.metadata,
        plot: vod.metadata.plot ?? stream.plot,
        cover: vod.metadata.cover ?? stream.cover,
      }
      rememberStreams([selectedItem])
    }

    view = 'details'
    render()
    void enrichSelectedTitle(selectedItem, detailsMetadata(selectedItem), token, signal)
  } catch (reason) {
    if (isCurrentNavigation(token)) {
      renderError(reason, () => void openDetails(stream))
    }
  }
}

function openFavorites(): void {
  catalogReturnPoint = null

  if (!catalog?.isFavorites) {
    pushRouteHistory()
  }
  startNavigation()
  const streams = favoriteStreams(favorites).filter(visibleStream)
  rememberStreams(streams)
  catalog = {
    section: streams[0]?.section ?? 'live',
    category: { id: 'favorites', name: 'Favorites' },
    categories: [],
    streams,
    query: '',
    page: 0,
    isFavorites: true,
    sort: 'default',
  }
  view = 'catalog'
  render()
}

async function openGuide(refresh = false): Promise<void> {
  const activeClient = client

  if (!activeClient) {
    return
  }

  if (view !== 'guide') {
    pushRouteHistory()
  }
  const { token, signal } = startNavigation()
  let streams = refresh ? null : liveQueue.length ? liveQueue : null

  if (!streams) {
    const selectedCategory =
      catalog?.section === 'live' && catalog.category && !catalog.isFavorites
        ? catalog.category
        : null
    const cached = selectedCategory && !refresh
      ? cachedStreams('live', selectedCategory.id)
      : null

    renderLoading('Loading channels for the guide…')

    try {
      if (cached) {
        streams = cached
      } else {
        const categories = selectedCategory
          ? [selectedCategory]
          : await activeClient.categories('live', signal)

        if (!selectedCategory) {
          rememberCategories('live', categories)
        }

        const guideCategory =
          categories.find((category) => !settings.hideAdultContent || !isAdult(category.name)) ??
          categories[0]

        if (!guideCategory) {
          throw new Error('This provider did not return any live-TV categories for the guide.')
        }

        streams = await activeClient.streams('live', guideCategory.id, signal)
        cacheStreams('live', guideCategory.id, streams)
      }
    } catch (reason) {
      if (isCurrentNavigation(token)) {
        renderError(reason, () => void openGuide(refresh))
      }
      return
    }
  }

  if (!isCurrentNavigation(token)) {
    return
  }

  liveQueue = streams
  rememberStreams(streams)
  guideStreams = streams
    .filter(visibleStream)
    .slice(0, 32)
  view = 'guide'
  render()
}

async function runGlobalSearch(): Promise<void> {
  const searchInput = document.querySelector<HTMLInputElement>('#global-search-input')
  const requestedQuery = (searchInput?.value ?? globalSearchQuery).trim()

  if (requestedQuery.length < MIN_GLOBAL_SEARCH_LENGTH) {
    globalSearchResults = []
    globalSearchStatus =
      `Type at least ${MIN_GLOBAL_SEARCH_LENGTH} characters to search your downloaded library.`
    updateGlobalSearchView({ controls: true, fullResults: true })
    return
  }

  await updateGlobalSearchFromLibrary(requestedQuery)

  performanceTrace.event('search', 'global-search-local-complete', {
    queryLength: requestedQuery.length,
    resultCount: globalSearchResults.length,
  })
}

async function loadLiveDetails(stream: StreamItem): Promise<void> {
  const activeClient = client
  const token = navigationToken
  const signal = navigationController?.signal

  if (!activeClient || selectedItem !== stream || !isCurrentNavigation(token)) {
    return
  }

  const panel = document.querySelector<HTMLElement>('#now-next-panel')

  if (!panel) {
    return
  }

  const cacheKey = streamLookupKey(stream)
  const cached = nowNextCache.get(cacheKey)

  if (cached) {
    panel.innerHTML = renderNowNext(cached)
    return
  }

  try {
    const nowNext = await activeClient.nowNext(stream.id, signal)

    if (isCurrentNavigation(token) && selectedItem === stream && panel.isConnected) {
      cacheNowNext(cacheKey, nowNext)
      panel.innerHTML = renderNowNext(nowNext)
    }
  } catch {
    if (isCurrentNavigation(token) && selectedItem === stream && panel.isConnected) {
      panel.innerHTML = ''
    }
  }
}

function renderNowNext(nowNext: NowNext): string {
  if (!nowNext.now && !nowNext.next) {
    return ''
  }

  return `
    <section class="now-next">
      <h2>Now & Next</h2>
      ${nowNext.now ? `<div><strong>Now · ${formatTime(nowNext.now.start)}</strong><span>${escape(nowNext.now.title)}</span></div>` : ''}
      ${nowNext.next ? `<div><strong>Next · ${formatTime(nowNext.next.start)}</strong><span>${escape(nowNext.next.title)}</span></div>` : ''}
    </section>
  `
}

async function showEpg(
  stream: StreamItem,
  showCatchupActions = false,
  token = navigationToken,
  signal = navigationController?.signal,
): Promise<void> {
  const activeClient = client
  const panel = document.querySelector<HTMLElement>('#epg-panel')

  if (!activeClient || !panel || selectedItem !== stream || !isCurrentNavigation(token)) {
    return
  }

  panel.innerHTML = '<div class="epg"><h2>Schedule</h2><p>Loading schedule…</p></div>'

  try {
    const programs = await activeClient.epg(stream.id, showCatchupActions ? 24 : 8, signal)

    if (isCurrentNavigation(token) && selectedItem === stream && panel.isConnected) {
      panel.innerHTML = renderEpg(stream, programs, showCatchupActions)
      bindEvents()
    }
  } catch (reason) {
    console.warn('EPG schedule load failed', stream.id, reason)
    if (isCurrentNavigation(token) && selectedItem === stream && panel.isConnected) {
      panel.innerHTML = '<div class="epg"><h2>Schedule</h2><p>Schedule information is unavailable for this channel.</p></div>'
    }
  }
}

function renderEpg(stream: StreamItem, programs: Program[], showCatchupActions: boolean): string {
  if (!programs.length) {
    return '<div class="epg"><h2>Schedule</h2><p>Schedule information is unavailable for this channel.</p></div>'
  }

  return `
    <div class="epg"><h2>${showCatchupActions ? 'Catch-up programmes' : 'Schedule'}</h2>
      ${programs
        .slice(0, showCatchupActions ? 24 : 8)
        .map((program) => {
          const canPlayCatchup =
            showCatchupActions &&
            stream.catchup?.available &&
            program.start.getTime() < Date.now()
          const durationMinutes = Math.max(1, (program.end.getTime() - program.start.getTime()) / 60_000)

          return `<div class="program"><strong>${formatTime(program.start)}</strong><span>${escape(program.title)}</span><small>${escape(program.description ?? '')}</small>${canPlayCatchup ? `<button class="secondary-button program-catchup" data-action="play-catchup" data-program-start="${program.start.getTime()}" data-program-duration="${durationMinutes}" data-focus-id="catchup-${program.start.getTime()}">Play catch-up</button>` : ''}</div>`
        })
        .join('')}
    </div>
  `
}

function beginPlayback(item: StreamItem): void {
  activeLibraryProbeController?.abort()
  cancelScheduledCatalogSync()
  catalogSync?.cancel()

  if (view !== 'player') {
    playerReturnPoint = captureReturnPoint()
    pushRouteHistory()
    playerUiMode = 'immersive'
  }
  cancelPlayerSeek()
  startNavigation()

  if (
    item.section === 'live' &&
    playerItem?.section === 'live' &&
    streamLookupKey(playerItem) !== streamLookupKey(item)
  ) {
    lastLiveItem = playerItem
  }

  playerCleanup?.()
  playerCleanup = null

  if (item.section === 'live') {
    const cached = cachedStreams('live', item.categoryId)

    if (cached?.length) {
      liveQueue = cached
    }
  }

  playerItem = item
  playerSourceOverride = null
  playerForceDirect = false
  showPlayerChannels = false
  // Every newly opened stream must start at normal speed. Playback rate is
  // module-level session state, so without this reset a speed chosen on a
  // previous item would silently carry over to the next file.
  playerPlaybackRate = 1
  view = 'player'
  render()
}

function closePlayer(): void {
  setLibraryPlaybackStarting(false)
  cancelPlayerSeek()
  playerUiMode = 'immersive'
  const { token, signal } = startNavigation()
  playerCleanup?.()
  playerCleanup = null
  activeHls = null

  if (playerControlsTimer !== null) {
    window.clearTimeout(playerControlsTimer)
    playerControlsTimer = null
  }

  playerItem = null
  playerSourceOverride = null
  playerForceDirect = false
  showPlayerChannels = false
  const returnPoint = playerReturnPoint
  playerReturnPoint = null
  view =
    returnPoint && returnPoint.view !== 'player'
      ? returnPoint.view
      : selectedItem
        ? 'details'
        : 'home'
  requestFocus(returnPoint?.focus ?? null)

  const returningDetailItem = selectedItem
  if (
    view === 'details' &&
    returningDetailItem !== null &&
    returningDetailItem.section !== 'live' &&
    !selectedTitleEnrichment
  ) {
    titleEnrichmentLoading = true
    render()
    void enrichSelectedTitle(
      returningDetailItem,
      detailsMetadata(returningDetailItem),
      token,
      signal,
    )
    return
  }

  render()
}

function togglePlayback(): void {
  const video = document.querySelector<HTMLVideoElement>('#video-player')

  if (video?.paused) {
    void video.play()
  } else {
    video?.pause()
  }

  revealControls()
}

function seekBy(seconds: number): void {
  const video = document.querySelector<HTMLVideoElement>('#video-player')

  if (video && Number.isFinite(video.duration)) {
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds))
  }

  revealControls()
}

function cyclePlaybackSpeed(): void {
  if (!canChangePlaybackSpeed()) {
    playerPlaybackRate = 1
    const video = document.querySelector<HTMLVideoElement>('#video-player')

    if (video) {
      applyPlaybackRate(video as any, playerPlaybackRate, false)
    }

    showToast('Speed control is unavailable on this LG TV because higher speeds mute audio.')
    return
  }

  const values = [1, 1.25, 1.5, 2]
  const index = values.indexOf(playerPlaybackRate)
  playerPlaybackRate = values[(index + 1) % values.length]
  const video = document.querySelector<HTMLVideoElement>('#video-player')

  if (video) {
    applyPlaybackRate(video as any, playerPlaybackRate, playbackPreservesPitch())
  }

  const button = document.querySelector<HTMLElement>('[data-action="cycle-speed"]')
  if (button) {
    button.textContent = `${playerPlaybackRate}×`
  }

  showToast(`Speed: ${playerPlaybackRate}×`)
  revealControls()
}

function cycleAudioTrack(): void {
  if (activeHls?.audioTracks.length) {
    activeHls.audioTrack = (activeHls.audioTrack + 1) % activeHls.audioTracks.length
    const track = activeHls.audioTracks[activeHls.audioTrack]
    showToast(`Audio: ${track?.name ?? `Track ${activeHls.audioTrack + 1}`}`)
  } else {
    showToast('This stream has one audio track.')
  }

  revealControls()
}

function cycleSubtitleTrack(): void {
  if (activeHls?.subtitleTracks.length) {
    const next = activeHls.subtitleTrack + 1 >= activeHls.subtitleTracks.length ? -1 : activeHls.subtitleTrack + 1
    activeHls.subtitleTrack = next
    const track = next >= 0 ? activeHls.subtitleTracks[next] : null
    showToast(track ? `Subtitles: ${track.name ?? track.lang ?? 'On'}` : 'Subtitles off')
  } else {
    const video = document.querySelector<HTMLVideoElement>('#video-player')
    const tracks = video?.textTracks

    if (tracks?.length) {
      const activeIndex = Array.from(tracks).findIndex((track) => track.mode === 'showing')
      const nextIndex = activeIndex + 1 >= tracks.length ? -1 : activeIndex + 1
      Array.from(tracks).forEach((track, index) => {
        track.mode = index === nextIndex ? 'showing' : 'disabled'
      })
      showToast(nextIndex >= 0 ? 'Subtitles on' : 'Subtitles off')
    } else {
      showToast('No subtitle tracks available.')
    }
  }

  revealControls()
}

function cycleQuality(): void {
  if (activeHls?.levels.length) {
    const nextLevel = activeHls.currentLevel + 1 >= activeHls.levels.length ? -1 : activeHls.currentLevel + 1
    activeHls.currentLevel = nextLevel
    const level = nextLevel >= 0 ? activeHls.levels[nextLevel] : null
    showToast(level ? `Quality: ${level.height || level.width ? `${level.height || level.width}p` : 'Manual'}` : 'Quality: Auto')
  } else {
    showToast('Quality is selected automatically by this stream.')
  }

  revealControls()
}

function switchLiveChannel(offset: number): void {
  if (!playerItem || !liveQueue.length) {
    return
  }

  const index = liveQueue.findIndex(
    (stream) => streamLookupKey(stream) === streamLookupKey(playerItem!),
  )

  if (index < 0) {
    return
  }

  const nextIndex = (index + offset + liveQueue.length) % liveQueue.length
  beginPlayback(liveQueue[nextIndex])
}

function switchToLastChannel(): void {
  if (lastLiveItem) {
    beginPlayback(lastLiveItem)
  } else {
    showToast('No previous channel yet.')
  }
}

function markStreamWatched(
  stream: StreamItem,
  completed: boolean,
  duration?: number,
): void {
  if (stream.section === 'live' || !profile) {
    return
  }

  const key = streamLookupKey(stream)
  const existing = resumeEntries.get(key)
  resumeEntries.set(key, {
    streamKey: key,
    position: completed
      ? duration ?? existing?.duration ?? stream.metadata?.durationSeconds ?? existing?.position ?? 0
      : 0,
    updatedAt: Date.now(),
    stream,
    duration: duration ?? existing?.duration ?? stream.metadata?.durationSeconds,
    completed,
  })
  if (!saveResume(profile.id, resumeEntries)) {
    showToast(STORAGE_FAILURE_MESSAGE)
  }
}

function findNextEpisode(episode: StreamItem): StreamItem | null {
  if (!selectedSeries || episode.streamType !== 'episode') {
    return null
  }

  const episodes = Object.values(selectedSeries.episodes).flat()
  const index = episodes.findIndex((candidate) => streamLookupKey(candidate) === streamLookupKey(episode))

  return index >= 0 ? episodes[index + 1] ?? null : null
}

function openContinueMenu(cardEl: HTMLElement): void {
  cancelPendingSpatialNavigation()
  const streamKey = cardEl.dataset.streamKey
  const stream = streamFromKey(streamKey)

  if (!stream) {
    return
  }

  // Remove any existing instance before opening a fresh one.
  if (continueMenuEl) {
    continueMenuEl.remove()
    continueMenuEl = null
  }

  const menu = document.createElement('aside')
  menu.id = 'continue-menu'
  menu.className = 'continue-menu'
  menu.setAttribute('role', 'menu')
  menu.dataset.navZone = 'continue-menu'
  menu.dataset.returnStreamKey = streamKey!
  menu.innerHTML =
    '<h3 class="continue-menu-title">' + escape(streamDisplayTitle(stream)) + '</h3>' +
    '<button class="continue-menu-button" data-action="resume-continue" data-stream-key="' + escape(streamKey!) + '" data-focus-id="continue-menu-resume" role="menuitem">Resume playing</button>' +
    '<button class="continue-menu-button danger-button" data-action="remove-continue" data-stream-key="' + escape(streamKey!) + '" data-focus-id="continue-menu-remove" role="menuitem">Remove from Continue watching</button>'

  document.body.appendChild(menu)
  continueMenuEl = menu
  invalidateSpatialLayout()
  var resumeButton = menu.querySelector<HTMLElement>('[data-focus-id="continue-menu-resume"]')
  if (resumeButton) {
    resumeButton.focus({ preventScroll: true })
  }
}

function closeContinueMenu(): string | null {
  cancelPendingSpatialNavigation()
  var menu = continueMenuEl

  if (!menu) {
    return null
  }

  var returnKey = menu.dataset.returnStreamKey ?? null
  menu.remove()
  continueMenuEl = null
  invalidateSpatialLayout()
  return returnKey
}

function closeContinueMenuAndRefocus(): void {
  var returnKey = closeContinueMenu()

  if (returnKey) {
    var target = document.querySelector<HTMLElement>(
      '[data-focus-id="stream-' + cssEscape(returnKey) + '"]',
    )

    if (target) {
      target.focus({ preventScroll: true })
    }
  }
}

function toggleChannelOverlay(): void {
  cancelPendingSpatialNavigation()
  const overlay = document.querySelector<HTMLElement>('#channel-overlay')

  if (overlay) {
    overlay.remove()
    showPlayerChannels = false
    invalidateSpatialLayout()
    return
  }

  if (!playerItem?.section || playerItem.section !== 'live') {
    return
  }

  const currentIndex = liveQueue.findIndex(
    (stream) => streamLookupKey(stream) === streamLookupKey(playerItem!),
  )
  const nextOverlay = document.createElement('aside')
  nextOverlay.id = 'channel-overlay'
  nextOverlay.className = 'channel-overlay'
  nextOverlay.innerHTML = `
    <h2>Channels</h2>
    ${liveQueue
      .slice(Math.max(0, currentIndex - 10), currentIndex + 11)
      .map(
        (channel) => `
          <button class="${streamLookupKey(channel) === streamLookupKey(playerItem!) ? 'is-current' : ''}" data-action="play-live-channel" data-stream-key="${escape(streamLookupKey(channel))}" data-focus-id="player-channel-${escape(streamLookupKey(channel))}">
            <span>${escape(channel.channelNumber ?? '')}</span>${escape(channel.name)}
          </button>`,
      )
      .join('')}
  `
  document.querySelector<HTMLElement>('.player-page')?.append(nextOverlay)
  showPlayerChannels = true
  bindEvents()
  nextOverlay.querySelector<HTMLElement>('button')?.focus()
}

function updateFavoriteControls(key: string, favorite: boolean): void {
  document
    .querySelectorAll<HTMLElement>('[data-action="toggle-favorite"]')
    .forEach((button) => {
      if (button.dataset.favoriteKey !== key) {
        return
      }

      button.classList.toggle('is-favorite', favorite)
      if (button.dataset.favoriteStyle === 'icon') {
        button.innerHTML = icon(favorite ? 'starFilled' : 'star')
      } else {
        button.textContent = favorite ? 'Saved' : 'Add favorite'
      }
    })
}

function sortableNumber(value: string | undefined): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : Number.NEGATIVE_INFINITY
}

function sortStreams(streams: StreamItem[], sort: CatalogSort): StreamItem[] {
  if (sort === 'default') {
    return streams
  }

  return streams
    .map((stream, index) => ({ stream, index }))
    .sort((left, right) => {
      let comparison = 0

      if (sort === 'name') {
        comparison = left.stream.name.localeCompare(right.stream.name)
      } else if (sort === 'recent') {
        comparison = sortableNumber(right.stream.added) - sortableNumber(left.stream.added)
      } else if (sort === 'rating') {
        comparison = sortableNumber(right.stream.rating) - sortableNumber(left.stream.rating)
      } else {
        comparison = sortableNumber(right.stream.year) - sortableNumber(left.stream.year)
      }

      if (Number.isFinite(comparison) && comparison !== 0) {
        return comparison
      }

      const nameComparison = left.stream.name.localeCompare(right.stream.name)
      return nameComparison || left.index - right.index
    })
    .map(({ stream }) => stream)
}

function sortCategories(categories: Category[]): Category[] {
  return categories
}

function nextSort(current: CatalogSort): CatalogSort {
  const sorts: CatalogSort[] = ['default', 'name', 'recent', 'rating', 'year']
  return sorts[(sorts.indexOf(current) + 1) % sorts.length]
}

function saveCurrentSettings(): void {
  if (!profile) {
    return
  }

  const preferHls = document.querySelector<HTMLInputElement>('#setting-prefer-hls')
  const preservePitch = document.querySelector<HTMLInputElement>('#setting-preserve-pitch')
  const buffer = document.querySelector<HTMLSelectElement>('#setting-buffer')
  const timeFormat = document.querySelector<HTMLSelectElement>('#setting-time-format')
  const hideAdult = document.querySelector<HTMLInputElement>('#setting-hide-adult')
  const parentalPin = document.querySelector<HTMLInputElement>('#setting-parental-pin')

  const nextHideAdultContent = hideAdult?.checked ?? settings.hideAdultContent

  if (
    settings.hideAdultContent &&
    !nextHideAdultContent &&
    settings.parentalPin &&
    window.prompt('Enter the parental PIN to show adult categories.') !== settings.parentalPin
  ) {
    showToast('Adult categories remain locked.')
    renderSettings()
    return
  }

  settings = {
    ...settings,
    preferHls: preferHls?.checked ?? settings.preferHls,
    preservePitch: preservePitch?.checked ?? settings.preservePitch,
    bufferSeconds: Number(buffer?.value ?? settings.bufferSeconds),
    timeFormat: timeFormat?.value === '12h' ? '12h' : '24h',
    hideAdultContent: nextHideAdultContent,
    parentalPin: parentalPin?.value.trim() || undefined,
  }
  if (!saveSettings(profile.id, settings)) {
    showToast(STORAGE_FAILURE_MESSAGE)
    return
  }

  showToast('Settings saved.')
  renderSettings()
}

function cancelScheduledCatalogSync(): void {
  if (catalogSyncTimer !== null) {
    window.clearTimeout(catalogSyncTimer)
    catalogSyncTimer = null
  }
}

function canRunCatalogSync(): boolean {
  return Boolean(profile && client && catalogSync && view !== 'player' && !document.hidden)
}

function scheduleCatalogSync(delayMs = LIBRARY_SYNC_IDLE_DELAY_MS): boolean {
  if (!canRunCatalogSync()) {
    return false
  }

  cancelScheduledCatalogSync()
  const now = Date.now()
  const requestedDueAt = Number.isFinite(delayMs) ? now + Math.max(0, delayMs) : now

  catalogSyncTimer = window.setTimeout(() => {
    catalogSyncTimer = null
    void runCatalogSync()
  }, catalogSyncRearmDelay(requestedDueAt, now))
  return true
}

async function inspectCatalogSyncStorage(): Promise<CatalogSyncStorageInspection | null> {
  const activeProfile = profile

  if (!activeProfile) {
    return null
  }

  const meta = await catalogRepository.getMeta(activeProfile.id)
  const sections = {} as CatalogSyncStorageInspection['sections']

  for (const section of CATALOG_SYNC_SECTIONS) {
    const manifest = await catalogRepository.getManifest(activeProfile.id, section)
    const categories = manifest?.categories ?? []
    const checkpoint = meta?.sync.sections?.[section]

    sections[section] = {
      coverage: manifest?.coverage.state ?? 'none',
      manifestCategoryCount: categories.length,
      activeSnapshotCount: categories.reduce(
        (total, category) => total + category.shardCount,
        0,
      ),
      activeItemCount: categories.reduce(
        (total, category) => total + category.itemCount,
        0,
      ),
      checkpoint: {
        wholeSectionFailureCount: checkpoint?.wholeSectionFailureCount ?? 0,
        nextCategoryCursor: checkpoint?.nextCategoryCursor ?? 0,
        lastAttemptAt: checkpoint?.lastAttemptAt ?? null,
        lastSuccessAt: checkpoint?.lastSuccessAt ?? null,
        lastFailureAt: checkpoint?.lastFailureAt ?? null,
      },
    }
  }

  return {
    nextDueAt: meta?.nextDueAt ?? null,
    failureCount: meta?.sync.failureCount ?? 0,
    inProgress: meta?.sync.inProgress ?? false,
    sections,
  }
}

async function runCatalogSync(runOptions: CatalogSyncRunOptions = {}) {
  const activeProfile = profile
  const activeSync = catalogSync

  if (!activeProfile || !activeSync || view === 'player' || document.hidden) {
    return null
  }

  performanceTrace.event('library', 'catalog-sync-start', {
    profileId: activeProfile.id,
    section: runOptions.section ?? null,
    maxResponseBytes: runOptions.maxResponseBytes ?? null,
  })

  try {
    const result = await activeSync.sync(activeProfile.id, runOptions)
    performanceTrace.event('library', 'catalog-sync-complete', {
      profileId: activeProfile.id,
      status: result.status,
      attemptedRequestCount: result.requestCount,
      issuedRequestCount: result.issuedRequestCount,
      section: runOptions.section ?? null,
      maxResponseBytes: runOptions.maxResponseBytes ?? null,
    })

    result.sections.forEach((section) => {
      performanceTrace.event('library', 'catalog-sync-section-result', {
        section: section.section,
        mode: section.mode,
        success: section.success,
        reason: section.reason ?? null,
        refused: section.refused === true,
        attemptedRequestCount: section.attemptedRequestCount,
        issuedRequestCount: section.issuedRequestCount,
      })
    })

    return result
  } catch {
    performanceTrace.event('library', 'catalog-sync-failed', {
      profileId: activeProfile.id,
    })
    return null
  }
}

function scheduleLocalSearchIndexMigration(profileId: string): void {
  if (localSearchIndexMigrationProfileId === profileId) {
    return
  }

  localSearchIndexMigrationProfileId = profileId

  window.setTimeout(() => {
    void catalogRepository.rebuildSearchIndexes(profileId).then(
      (results) => {
        const completed = results.filter(
          (result): result is Extract<SearchIndexBuildResult, { coverage: 'complete' }> =>
            result.coverage === 'complete',
        )
        performanceTrace.event('library', 'local-search-index-migration', {
          profileStillActive: profile?.id === profileId,
          completedSectionCount: completed.length,
          itemCount: completed.reduce((total, result) => total + result.itemCount, 0),
          postingCount: completed.reduce((total, result) => total + result.postingCount, 0),
          legacyUntitledCount: completed.reduce(
            (total, result) => total + result.legacyUntitledCount,
            0,
          ),
          elapsedMs: completed.reduce((total, result) => total + result.elapsedMs, 0),
        })
      },
      () => {
        performanceTrace.event('library', 'local-search-index-migration', {
          profileStillActive: profile?.id === profileId,
          completedSectionCount: 0,
          itemCount: 0,
          postingCount: 0,
          legacyUntitledCount: 0,
          elapsedMs: null,
        })
      },
    ).finally(() => {
      if (localSearchIndexMigrationProfileId === profileId) {
        localSearchIndexMigrationProfileId = null
      }
    })
  }, 0)
}

function activateProfile(nextProfile: XtreamProfile, nextClient?: ProviderBroker): void {
  cancelScheduledCatalogSync()
  catalogSync?.cancel()
  clearLibraryMemoryCaches()
  profile = nextProfile
  client = nextClient ?? new ProviderBroker(nextProfile)
  catalogSync = new CatalogSyncCoordinator(client, catalogRepository, {
    internalFaultDiagnostics: import.meta.env.VITE_ENABLE_LIBRARY_PROBE === 'true',
  })
  settings = loadSettings(nextProfile.id)
  favorites = loadFavorites(nextProfile.id)
  resumeEntries = loadResume(nextProfile.id)

  if (repairResumeEpisodeContexts()) {
    saveResume(nextProfile.id, resumeEntries)
  }

  catalog = null
  catalogReturnPoint = null
  selectedItem = null
  selectedSeries = null
  activeSeriesSeason = null
  selectedVod = null
  selectedTitleEnrichment = null
  titleEnrichmentLoading = false
  selectedPerson = null
  personReturnPoint = null
  playerItem = null
  liveQueue = []
  guideStreams = []
  streamCache.clear()
  sectionCategories.clear()
  adultCategoryIds.clear()
  knownStreams.clear()
  nowNextCache.clear()
  scheduleLocalSearchIndexMigration(nextProfile.id)
}

async function refreshAccount(silent = false): Promise<void> {
  if (!client) {
    return
  }

  try {
    account = await client.validate()

    if (view === 'home') {
      renderHome()
    }
  } catch (reason) {
    if (!silent) {
      renderError(reason, () => void refreshAccount())
    }
  }
}

function renderLoading(message: string): void {
  cancelPendingSpatialNavigation()
  const snapshot = snapshotFocus()
  const renderId = performanceTrace.beginRender(view, { state: 'loading' })
  app.innerHTML = `
    <main class="status-page">
      <section class="status-card" aria-live="polite">
        <div class="status-orb"><div class="spinner"></div></div>
        <p class="eyebrow">Nova Play</p>
        <h1>${escape(message)}</h1>
        <p>Just a moment while we prepare your next screen.</p>
      </section>
    </main>
  `
  invalidateSpatialLayout('loading-replaced')
  performanceTrace.endRender(renderId, { state: 'loading' })
  restoreFocus(snapshot)
}

function renderError(reason: unknown, retry: () => void): void {
  cancelPendingSpatialNavigation()
  const snapshot = snapshotFocus()
  const renderId = performanceTrace.beginRender(view, { state: 'error' })
  const message = reason instanceof Error ? reason.message : 'Something went wrong.'
  performanceTrace.event('route', 'error-rendered', {
    errorType: reason instanceof Error ? reason.name : 'unknown',
  })
  app.innerHTML = `
    <main class="status-page">
      <section class="status-card status-card-error">
        <div class="error-icon">!</div>
        <p class="eyebrow">Connection issue</p>
        <h1>Unable to continue</h1>
        <p>${escape(message)}</p>
        <button class="primary-button" id="retry" data-focus-id="error-retry">Try again</button>
      </section>
    </main>
  `
  invalidateSpatialLayout('error-replaced')
  document.querySelector<HTMLButtonElement>('#retry')?.addEventListener('click', retry)
  bindEvents()
  performanceTrace.endRender(renderId, { state: 'error' })
  restoreFocus(snapshot)
}

function navigateBack(): boolean {
  if (view === 'player') {
    closePlayer()
    return true
  }

  if (view === 'search') {
    leaveGlobalSearch()
    return true
  }

  if (view === 'person') {
    const returnPoint = personReturnPoint
    personReturnPoint = null
    selectedPerson = null
    startNavigation()
    view = returnPoint?.view === 'details' && selectedItem ? 'details' : 'home'
    requestFocus(returnPoint?.focus ?? null)
    render()
    return true
  }

  if (view === 'details') {
    const returnPoint = detailReturnPoint
    detailReturnPoint = null
    startNavigation()
    view =
      returnPoint?.view === 'person' && selectedPerson
        ? 'person'
        : returnPoint?.view === 'search' || returnPoint?.view === 'guide' || returnPoint?.view === 'catalog'
          ? returnPoint.view
          : catalog
            ? 'catalog'
            : 'home'
    requestFocus(returnPoint?.focus ?? null)
    render()
    return true
  }

  if (view === 'catalog') {
    if (catalog && catalog.category !== null && !catalog.isFavorites) {
      const returnPoint = catalogReturnPoint
      catalogReturnPoint = null
      startNavigation()

      if (returnPoint) {
        catalog = returnPoint.catalog
        requestFocus(returnPoint.focus)
      } else {
        catalog = {
          ...catalog,
          category: null,
          streams: [],
          query: '',
          page: 0,
          results: undefined,
        }
      }

      renderCatalog()
    } else {
      startNavigation()
      view = 'home'
      render()
    }
    return true
  }

  if (view === 'guide' || view === 'settings') {
    startNavigation()
    view = 'home'
    render()
    return true
  }

  return false
}

function clearContinueMenuState(): void {
  if (continueMenuHoldTimer !== null) {
    window.clearTimeout(continueMenuHoldTimer)
    continueMenuHoldTimer = null
  }
  continueMenuHoldCard = null
  continueMenuHoldConsumeOk = false
  // Reset the absorb flag defensively: on webOS versions that fire only a
  // keydown (no companion popstate) for Back, the flag would otherwise linger.
  // Safe here because the keydown-close → companion-popstate sequence performs
  // no render in between.
  continueMenuAbsorbNextPopState = false
  closeContinueMenu()
}

function clearUndoState(): void {
  if (undoResumeTimer !== null) {
    window.clearTimeout(undoResumeTimer)
    undoResumeTimer = null
  }
  lastRemovedResume = null
}

function render(): void {
  performanceTrace.setView(view)
  performanceTrace.event('route', 'render-dispatch')
  cancelPendingSpatialNavigation()

  // Always remove the continue-menu overlay and hold timer before any render.
  clearContinueMenuState()

  if (view === 'login' || !profile || !client) {
    // Leaving home — drop undo state too.
    clearUndoState()
    renderLogin()
    return
  }

  // Clear undo state when navigating away from home so Green can't
  // unexpectedly restore a removed item long after the user left.
  if (view !== 'home') {
    clearUndoState()
  }

  if (view === 'home') renderHome()
  else if (view === 'catalog') renderCatalog()
  else if (view === 'details') renderDetails()
  else if (view === 'person') renderPerson()
  else if (view === 'guide') renderGuide()
  else if (view === 'search') renderGlobalSearch()
  else if (view === 'settings') renderSettings()
  else renderPlayer()
}

function navigationZone(element: HTMLElement): HTMLElement | null {
  return element.closest<HTMLElement>('[data-nav-zone]')
}

function navigationLayout(): NavigationLayout {
  const overlay = continueMenuEl ?? document.querySelector<HTMLElement>('#channel-overlay')
  const root = overlay ?? app
  const cacheHit = spatialLayoutCache.populated

  return performanceTrace.measure('navigation', cacheHit ? 'layout-cache-hit' : 'layout-cache-miss', () =>
    spatialLayoutCache.get(root, () => {
    const elements = new Map<string, HTMLElement>()

    const items = Array.from(
      root.querySelectorAll<HTMLElement>(
        '[data-focus-id]:not([data-nav-skip="true"]):not([disabled])',
      ),
    )
      .filter((element) => {
        const zone = navigationZone(element)
        return Boolean(zone && (!overlay || zone === overlay))
      })
      .map((element) => {
        const rect = element.getBoundingClientRect()
        const id = element.dataset.focusId!
        const zoneId = navigationZone(element)?.dataset.navZone

        elements.set(id, element)
        return {
          id,
          zoneId: zoneId ?? '',
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        }
      })
      .filter((item) => item.width > 0 && item.height > 0)

      return { items, elements }
    }),
  )
}

function moveFocus(target: HTMLElement): void {
  performanceTrace.measure('navigation', 'focus-move', () => {
    const scrollDelta = focusVisibilityDelta(target)

    target.focus({ preventScroll: true })
    applyFocusVisibility(scrollDelta)
  })
}

function isReverseDirection(
  direction: NavigationDirection,
  previousDirection: NavigationDirection,
): boolean {
  return (
    (direction === 'ArrowUp' && previousDirection === 'ArrowDown') ||
    (direction === 'ArrowDown' && previousDirection === 'ArrowUp') ||
    (direction === 'ArrowLeft' && previousDirection === 'ArrowRight') ||
    (direction === 'ArrowRight' && previousDirection === 'ArrowLeft')
  )
}

function canQueueSpatialNavigation(direction: NavigationDirection): boolean {
  const active = document.activeElement

  if (
    (active instanceof HTMLInputElement || active instanceof HTMLSelectElement) &&
    (direction === 'ArrowLeft' || direction === 'ArrowRight') &&
    editingInput === active
  ) {
    return false
  }

  return active instanceof HTMLElement && Boolean(navigationZone(active))
}

function handleSpatialNavigation(direction: NavigationDirection): boolean {
  const active = document.activeElement
  if (
    (active instanceof HTMLInputElement || active instanceof HTMLSelectElement) &&
    (direction === 'ArrowLeft' || direction === 'ArrowRight') &&
    editingInput === active
  ) {
    return false
  }

  const origin = active instanceof HTMLElement ? active : null
  const zone = origin ? navigationZone(origin) : null

  if (!origin || !zone) {
    return false
  }

  const { items, elements } = navigationLayout()
  const originFocusId = origin.dataset.focusId!
  const originZoneId = zone.dataset.navZone!
  const isVertical = direction === 'ArrowUp' || direction === 'ArrowDown'

  // Sticky column: capture origin X on first vertical press, clear on horizontal
  if (isVertical) {
    if (stickyColumnX === null || stickyColumnZone !== originZoneId) {
      const originItem = items.find((item) => item.id === originFocusId)
      stickyColumnX = originItem ? originItem.left + originItem.width / 2 : null
      stickyColumnZone = originZoneId
    }
  } else {
    stickyColumnX = null
    stickyColumnZone = null
  }

  const returningTarget =
    lastZoneTransition &&
    lastZoneTransition.toZoneId === originZoneId &&
    isReverseDirection(direction, lastZoneTransition.direction)
      ? elements.get(lastZoneTransition.fromFocusId) ?? null
      : null
  const targetId = returningTarget
    ? returningTarget.dataset.focusId ?? null
    : resolveNavigationTarget(
        items,
        originFocusId,
        direction,
        isVertical ? stickyColumnX ?? undefined : undefined,
      )
  const target = targetId ? elements.get(targetId) ?? null : null

  if (!target) {
    return false
  }

  const targetZoneId = navigationZone(target)?.dataset.navZone

  if (targetZoneId && targetZoneId !== originZoneId) {
    lastZoneTransition = {
      fromZoneId: originZoneId,
      toZoneId: targetZoneId,
      fromFocusId: originFocusId,
      direction,
    }
    // Clear sticky column when leaving the zone
    stickyColumnX = null
    stickyColumnZone = null
  } else {
    lastZoneTransition = null
  }

  moveFocus(target)
  return true
}

function handleColorShortcut(event: KeyboardEvent): boolean {
  const key = event.key
  const code = event.keyCode
  const color =
    key === 'ColorF0Red' || code === 403
      ? 'red'
      : key === 'ColorF1Green' || code === 404
        ? 'green'
        : key === 'ColorF2Yellow' || code === 405
          ? 'yellow'
          : key === 'ColorF3Blue' || code === 406
            ? 'blue'
            : null

  if (!color) {
    return false
  }

  event.preventDefault()

  if (color === 'red') {
    openFavorites()
  } else if (color === 'green') {
    // Undo a recent Continue Watching removal (green key, home view only).
    // When no undo is pending, fall through to the normal guide shortcut.
    if (view === 'home' && lastRemovedResume && profile) {
      resumeEntries.set(lastRemovedResume.key, lastRemovedResume.entry)
      if (!saveResume(profile.id, resumeEntries)) {
        showToast(STORAGE_FAILURE_MESSAGE)
      }
      if (undoResumeTimer !== null) {
        window.clearTimeout(undoResumeTimer)
        undoResumeTimer = null
      }
      lastRemovedResume = null
      renderHome()
      showToast('Restored to Continue watching')
    } else if (view === 'details' && selectedItem?.section === 'live') {
      void showEpg(selectedItem)
    } else {
      void openGuide()
    }
  } else if (color === 'yellow' && view === 'catalog' && catalog?.category) {
    catalog.sort = nextSort(catalog.sort)
    renderCatalog()
    showToast(`Sort: ${SORT_LABELS[catalog.sort]}`)
  } else if (color === 'blue') {
    pushRouteHistory()
    startNavigation()
    view = 'settings'
    render()
  }

  return true
}

function handleNumericChannelInput(event: KeyboardEvent): boolean {
  if (!/^\d$/.test(event.key) || document.activeElement instanceof HTMLInputElement) {
    return false
  }

  if (!(view === 'player' || (view === 'catalog' && catalog?.section === 'live'))) {
    return false
  }

  numericChannelBuffer += event.key
  showChannelNumberOverlay(numericChannelBuffer)

  if (numericChannelTimer !== null) {
    window.clearTimeout(numericChannelTimer)
  }

  numericChannelTimer = window.setTimeout(() => {
    const number = numericChannelBuffer
    numericChannelBuffer = ''
    numericChannelTimer = null
    hideChannelNumberOverlay()

    const stream = liveQueue.find(
      (candidate) => candidate.channelNumber === number || candidate.id === number,
    )

    if (stream) {
      if (view === 'player') {
        beginPlayback(stream)
      } else {
        void openDetails(stream)
      }
    } else {
      showToast(`Channel ${number} is not in the loaded list.`)
    }
  }, NUMERIC_CHANNEL_TIMEOUT_MS)

  return true
}

function showChannelNumberOverlay(number: string): void {
  const playerOverlay = document.querySelector<HTMLElement>('#channel-number-overlay')

  if (playerOverlay) {
    playerOverlay.textContent = number
    playerOverlay.hidden = false
  } else {
    showToast(`Channel ${number}`)
  }
}

function hideChannelNumberOverlay(): void {
  const playerOverlay = document.querySelector<HTMLElement>('#channel-number-overlay')

  if (playerOverlay) {
    playerOverlay.hidden = true
  }
}

function showToast(message: string): void {
  let toast = document.querySelector<HTMLElement>('#remote-toast')

  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'remote-toast'
    toast.className = 'remote-toast'
    document.body.append(toast)
  }

  toast.textContent = message
  toast.hidden = false
  window.setTimeout(() => {
    if (toast?.textContent === message) {
      toast.hidden = true
    }
  }, 2200)
}

async function requestKeepAwake(): Promise<void> {
  try {
    const navigatorWithWakeLock = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
    }
    wakeLock = navigatorWithWakeLock.wakeLock
      ? await navigatorWithWakeLock.wakeLock.request('screen')
      : null
  } catch {
    wakeLock = null
  }

  try {
    const system = (window as unknown as { webOSSystem?: { keepAlive?: (enabled: boolean) => void } })
      .webOSSystem
    system?.keepAlive?.(true)
  } catch {
    // The standard wake-lock API remains the portable fallback.
  }
}

async function releaseKeepAwake(): Promise<void> {
  try {
    await wakeLock?.release()
  } catch {
    // Already released by the platform.
  } finally {
    wakeLock = null
  }

  try {
    const system = (window as unknown as { webOSSystem?: { keepAlive?: (enabled: boolean) => void } })
      .webOSSystem
    system?.keepAlive?.(false)
  } catch {
    // No webOS-specific keep-alive API on this target.
  }
}

window.addEventListener('keydown', (event) => {
  const activeElement = document.activeElement
  const activeInput = isTextInput(activeElement) ? activeElement : null
  const direction = remoteDirection(event)

  if (isRemoteBack(event)) {
    // Close the continue-watching options menu on Back, restoring focus to the
    // originating card instead of navigating away from home. Set the absorb
    // flag so the companion popstate (on webOS TVs that fire both events for a
    // single physical Back press) does not also consume a history entry.
    if (continueMenuEl) {
      closeContinueMenuAndRefocus()
      continueMenuAbsorbNextPopState = true
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }

    if (view === 'search' && globalSearchIsActive()) {
      armSearchBackCancellation()
      finishTextEditing()
      cancelGlobalSearch()
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }

    if (finishTextEditing()) {
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }

    if (view === 'player' && playerUiMode !== 'immersive') {
      cancelPlayerSeek()
      setPlayerUiMode('immersive')
      // On webOS the physical Back button fires both a keydown AND a
      // companion browser history.back() (popstate). We consumed the
      // keydown here to only hide the controls; set a flag so the
      // popstate handler absorbs the companion event instead of
      // navigating away from the player.
      playerAbsorbNextPopState = true
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }

    if (view === 'search') {
      retainSearchOnNextPopState = false
    }

    if (requestAppBack()) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    return
  }

  if (activeInput?.readOnly && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault()
    beginTextEditing(activeInput)
    return
  }

  if (editingInput) {
    if (event.key === 'Enter') {
      event.preventDefault()
      const submittedInput = editingInput
      finishTextEditing(submittedInput)

      if (submittedInput.id === 'global-search-input') {
        void runGlobalSearch()
      } else if (submittedInput.id === 'search-input') {
        scheduleCatalogSearch(submittedInput.value)
      }
      return
    }

    if (direction) {
      const navigationOrigin = editingInput
      finishTextEditing(navigationOrigin)
      navigationOrigin.focus({ preventScroll: true })
    } else {
      return
    }
  }

  if (handleColorShortcut(event) || handleNumericChannelInput(event)) {
    return
  }

  if (view === 'player') {
    if (event.key === 'ChannelUp') {
      event.preventDefault()
      switchLiveChannel(1)
      return
    }

    if (event.key === 'ChannelDown') {
      event.preventDefault()
      switchLiveChannel(-1)
      return
    }

    if (event.key === 'MediaTrackPrevious') {
      event.preventDefault()
      switchToLastChannel()
      return
    }

    const isPlayerControl = isFocusedPlayerControl()
    const isTimeline = activeElement instanceof HTMLInputElement && activeElement.id === 'player-progress'
    const isSeekKey = direction === 'ArrowLeft' || direction === 'ArrowRight'
    const isConfirmKey = event.key === 'Enter' || event.key === ' '

    if (isTimeline && isSeekKey) {
      event.preventDefault()
      activeElement.dispatchEvent(
        new CustomEvent<number>('nova-timeline-step', {
          detail: direction === 'ArrowLeft'
            ? -TIMELINE_SEEK_STEP_SECONDS
            : TIMELINE_SEEK_STEP_SECONDS,
        }),
      )
      return
    }

    if (isTimeline && isConfirmKey) {
      event.preventDefault()
      activeElement.dispatchEvent(new Event('nova-timeline-confirm'))
      return
    }

    if (
      isPlayerControl &&
      isConfirmKey &&
      activeElement instanceof HTMLElement &&
      activeElement.dataset.action === 'toggle-play'
    ) {
      event.preventDefault()
      togglePlayback()
      return
    }

    if (isSeekKey && !isPlayerControl) {
      event.preventDefault()
      startPlayerSeek(direction === 'ArrowLeft' ? -1 : 1)
      return
    }

    if ((event.key === 'Enter' || event.key === ' ') && !isPlayerControl) {
      event.preventDefault()

      if (playerUiMode === 'immersive') {
        // First OK from the bare video surface only reveals the controls
        // (YouTube/VLC behaviour). It must NOT toggle playback yet.
        setPlayerUiMode('overlay')
      } else {
        // Controls are already visible and focus is still on the surface:
        // OK now toggles play/pause. togglePlayback() re-reveals the controls
        // and, with the paused-aware auto-hide, keeps them up while paused.
        togglePlayback()
      }
      return
    }

    if (!isPlayerControl && direction === 'ArrowUp') {
      event.preventDefault()
      setPlayerUiMode('focused')
      document.querySelector<HTMLElement>('[data-focus-id="player-play"]')?.focus({
        preventScroll: true,
      })
      return
    }

    if (!isPlayerControl && direction === 'ArrowDown') {
      event.preventDefault()

      if (playerCanSeek()) {
        setPlayerUiMode('focused')
        document.querySelector<HTMLElement>('[data-focus-id="player-progress"]')?.focus({
          preventScroll: true,
        })
      } else {
        setPlayerUiMode('overlay')
        showPlayerSeekFeedback('Timeline controls are unavailable for live TV')
      }
      return
    }

    if (isPlayerControl && direction && canQueueSpatialNavigation(direction)) {
      setPlayerUiMode('focused')
      event.preventDefault()
      performanceTrace.endInteraction(pendingSpatialInteractionId, 'spatial-coalesced')
      pendingSpatialInteractionId = performanceTrace.startInteraction('spatial-navigation', {
        direction,
        repeated: event.repeat,
        player: true,
      })
      frameNavigation.schedule(direction)
      return
    }
    return
  }

  // While OK is still physically held after a long-press opened the menu,
  // swallow every OK keydown repeat. Otherwise the still-down key would
  // immediately activate the focused "Resume playing" button and jump into the
  // player. Released via keyup, which clears the flag.
  if (continueMenuHoldConsumeOk && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault()
    event.stopImmediatePropagation()
    return
  }

  // OK on a Continue Watching card: quick tap resumes, long-press (550ms)
  // opens the options menu. On webOS a <button> fires its click SYNCHRONOUSLY
  // during keydown, so we must preventDefault here to cancel that native
  // activation and drive both outcomes ourselves (resume on keyup for a tap,
  // openContinueMenu when the hold timer fires). webOS emits repeated keydown
  // while held; the timer-null + !event.repeat guard schedules only once.
  if (
    view === 'home' &&
    !editingInput &&
    (event.key === 'Enter' || event.key === ' ') &&
    !continueMenuEl
  ) {
    var card = activeElement instanceof HTMLElement
      ? activeElement.closest<HTMLElement>('[data-resume-card="true"]')
      : null

    if (card) {
      // Cancel the native button click that webOS fires on keydown.
      event.preventDefault()
      event.stopImmediatePropagation()

      if (!event.repeat && continueMenuHoldTimer === null) {
        continueMenuHoldCard = card
        continueMenuHoldTimer = window.setTimeout(function () {
          continueMenuHoldTimer = null
          continueMenuHoldCard = null
          // Mark OK as consumed until release so the held key does not leak
          // into the freshly-opened menu and trigger "Resume playing".
          continueMenuHoldConsumeOk = true
          openContinueMenu(card!)
        }, 450)
      }
      return
    }
  }

  if (direction && canQueueSpatialNavigation(direction)) {
    event.preventDefault()
    performanceTrace.endInteraction(pendingSpatialInteractionId, 'spatial-coalesced')
    pendingSpatialInteractionId = performanceTrace.startInteraction('spatial-navigation', {
      direction,
      repeated: event.repeat,
      player: false,
    })
    frameNavigation.schedule(direction)
  }
}, true)

window.addEventListener('keyup', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    // OK physically released: stop swallowing OK repeats. The next OK press is
    // a fresh interaction (e.g. selecting a menu item).
    if (continueMenuHoldConsumeOk) {
      continueMenuHoldConsumeOk = false
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }

    // OK released while the hold timer is still pending → this was a quick tap,
    // not a hold. Cancel the timer and resume playback ourselves (the native
    // click was suppressed in keydown).
    if (continueMenuHoldTimer !== null) {
      window.clearTimeout(continueMenuHoldTimer)
      continueMenuHoldTimer = null

      var tappedCard = continueMenuHoldCard
      continueMenuHoldCard = null

      if (tappedCard) {
        var tappedStream = streamFromKey(tappedCard.dataset.streamKey)
        if (tappedStream) {
          event.preventDefault()
          void beginResumePlayback(tappedStream)
        }
      }
    }
  }

  const direction = remoteDirection(event)

  if (
    view === 'player' &&
    (direction === 'ArrowLeft' || direction === 'ArrowRight')
  ) {
    cancelPlayerSeek()
  }
})

window.addEventListener(
  'wheel',
  (event) => {
    if (view === 'player') {
      return
    }

    const target = event.target instanceof Element ? event.target : null
    const localScroller = target?.closest<HTMLElement>(
      '.category-menu, .channel-overlay',
    )

    if (
      localScroller &&
      localScroller.scrollHeight > localScroller.clientHeight
    ) {
      return
    }

    const before = window.scrollY
    const direction = event.deltaY === 0 ? 0 : Math.sign(event.deltaY)
    const magnitude = Math.max(
      72,
      Math.min(
        Math.round(window.innerHeight * 0.72),
        Math.abs(event.deltaY) * 1.35,
      ),
    )

    scrollDocumentBy(direction * magnitude)

    if (window.scrollY !== before) {
      event.preventDefault()
    }
  },
  { passive: false },
)

window.addEventListener('popstate', (event) => {
  // Close the continue-watching options menu on Back (popstate path).
  // On webOS TVs that fire BOTH keydown + popstate for a single Back press,
  // the keydown handler already closed the menu and set the absorb flag.
  // Absorb the companion event and re-push history so depth is preserved.
  if (view === 'home' && (continueMenuAbsorbNextPopState || continueMenuEl)) {
    var menuWasOpen = Boolean(continueMenuEl)
    continueMenuAbsorbNextPopState = false

    if (menuWasOpen) {
      closeContinueMenuAndRefocus()
    }

    if (isAppHistoryState(event.state)) {
      appHistoryDepth = event.state.depth
    } else {
      appHistoryDepth = Math.max(0, appHistoryDepth - 1)
    }

    pushAppHistory()
    return
  }

  // Back-button handling for the player must live here because on this webOS
  // TV the physical Back arrives ONLY as a browser history.back() → popstate
  // (no companion keydown). Rule: first Back with controls visible only hides
  // them (stay in player); next Back (immersive) exits. The consumed history
  // entry is re-pushed so a later Back still has an entry to pop.
  //
  // playerAbsorbNextPopState covers webOS versions that ALSO fire a keydown for
  // Back: there the keydown already hid the controls and set the flag, so this
  // companion popstate is simply absorbed.
  if (view === 'player' && (playerAbsorbNextPopState || playerUiMode !== 'immersive')) {
    playerAbsorbNextPopState = false
    cancelPlayerSeek()
    setPlayerUiMode('immersive')

    if (isAppHistoryState(event.state)) {
      appHistoryDepth = event.state.depth
    } else {
      appHistoryDepth = Math.max(0, appHistoryDepth - 1)
    }

    pushAppHistory()
    return
  }

  // A webOS Back press can arrive only as browser history navigation. Consume
  // active-search history before inspecting the state, because some webOS
  // versions provide null/non-app state for that companion event.
  if (view === 'search' && (retainSearchOnNextPopState || globalSearchIsActive())) {
    if (isAppHistoryState(event.state)) {
      appHistoryDepth = event.state.depth
    } else {
      appHistoryDepth = Math.max(0, appHistoryDepth - 1)
    }

    if (globalSearchIsActive()) {
      cancelGlobalSearch()
    }

    retainSearchRouteAfterPopState()
    return
  }

  if (!isAppHistoryState(event.state)) {
    return
  }

  appHistoryDepth = event.state.depth

  if (!navigateBack()) {
    // A Back press can arrive while an async route is still showing its loading state.
    // The history entry has already been consumed, so redraw the current root state
    // instead of leaving a loading screen or allowing the platform to close the app.
    render()
  }
})

window.addEventListener('scroll', () => {
  invalidateSpatialLayout('scroll')
  scheduleDeferredImageLoads()
}, { passive: true })
window.addEventListener('resize', () => {
  invalidateSpatialLayout('resize')
  scheduleDeferredImageLoads()
})
window.addEventListener('pagehide', () => {
  performanceTrace.event('lifecycle', 'pagehide')
  performanceTrace.disable()
  cancelPendingSpatialNavigation()
  cancelScheduledCatalogSync()
  catalogSync?.cancel()
  playerCleanup?.()
})

document.addEventListener('visibilitychange', () => {
  performanceTrace.event('lifecycle', document.hidden ? 'hidden' : 'visible')

  if (document.hidden) {
    cancelScheduledCatalogSync()
    catalogSync?.cancel()
  }

  if (document.hidden && view === 'player') {
    cancelPlayerSeek()
    document.querySelector<HTMLVideoElement>('#video-player')?.pause()
  }
})

if (
  import.meta.env.DEV ||
  import.meta.env.VITE_ENABLE_LIBRARY_PROBE === 'true'
) {
  let lastLibraryProbeDatabaseName = ''

  window.__NOVA_LIBRARY_PROBE__ = {
    async run(options: CapabilityProbeRunOptions = {}) {
      activeLibraryProbeController?.abort()
      const controller = new AbortController()
      activeLibraryProbeController = controller
      lastLibraryProbeDatabaseName =
        options.databaseName ??
        `nova-play-capability-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`

      try {
        return await runLibraryCapabilityProbe({
          ...options,
          signal: options.signal ?? controller.signal,
          databaseName: lastLibraryProbeDatabaseName,
          workerScriptUrl: options.workerScriptUrl ?? './library-capability-worker.js',
        })
      } finally {
        if (activeLibraryProbeController === controller) {
          activeLibraryProbeController = null
        }
      }
    },
    cancel() {
      activeLibraryProbeController?.abort()
    },
    async cleanup() {
      activeLibraryProbeController?.abort()

      if (lastLibraryProbeDatabaseName) {
        await deleteProbeDatabase(lastLibraryProbeDatabaseName)
      }
    },
    catalogSync: {
      schedule(delayMs = LIBRARY_SYNC_IDLE_DELAY_MS) {
        return scheduleCatalogSync(delayMs)
      },
      run() {
        cancelScheduledCatalogSync()
        return runCatalogSync()
      },
      cancel() {
        cancelScheduledCatalogSync()
        catalogSync?.cancel()
      },
      isRunning() {
        return catalogSync?.isRunning ?? false
      },
      inspectState() {
        return inspectCatalogSyncStorage()
      },
      async resetForWholeSectionProbe() {
        const activeProfile = profile

        if (!activeProfile || catalogSync?.isRunning) {
          return false
        }

        cancelScheduledCatalogSync()
        await catalogRepository.deleteProfileCache(activeProfile.id)
        clearLibraryMemoryCaches()

        // This deliberately touches only the rebuildable cache profile. It does
        // not call the broker or mutate its daily budget/refusal state.
        return true
      },
      async clearFailedCheckpointsForProbe() {
        const activeProfile = profile

        if (!activeProfile || catalogSync?.isRunning) {
          return false
        }

        const meta = await catalogRepository.getMeta(activeProfile.id)

        if (!meta || meta.sync.inProgress) {
          return false
        }

        const sections: NonNullable<typeof meta.sync.sections> = {}

        for (const section of CATALOG_SYNC_SECTIONS) {
          const current = meta.sync.sections?.[section]

          if (current) {
            sections[section] = {
              ...current,
              wholeSectionFailureCount: 0,
              nextCategoryCursor: 0,
            }
          }
        }

        cancelScheduledCatalogSync()
        await catalogRepository.putMeta(activeProfile.id, {
          nextDueAt: undefined,
          sync: {
            ...meta.sync,
            inProgress: false,
            runId: undefined,
            failureCount: 0,
            sections,
          },
        })

        // This only removes retry scheduling/checkpoints. It does not call the
        // provider or alter the broker's daily counters or refusal state.
        return true
      },
      inspectBudget() {
        return client?.inspectBudget() ?? null
      },
      resetBudget() {
        // This object is emitted only under the development/probe build guard
        // below. ProviderBroker resets counters only and preserves any
        // refusal/Retr-After block.
        return client?.resetBudgetsForProbe() ?? null
      },
    },
    publication: {
      run(options = {}) {
        return runPublicationProbe(options)
      },
    },
    flatSnapshot: {
      async run(options = {}) {
        activeLibraryProbeController?.abort()
        const controller = new AbortController()
        activeLibraryProbeController = controller

        try {
          return await runFlatSnapshotProbe({
            ...options,
            signal: options.signal ?? controller.signal,
          })
        } finally {
          if (activeLibraryProbeController === controller) {
            activeLibraryProbeController = null
          }
        }
      },
      inspect(databaseName, runId) {
        return inspectFlatSnapshotRecovery(databaseName, runId)
      },
      cleanup(databaseName) {
        return deleteFlatSnapshotDatabase(databaseName)
      },
      playback: {
        arm(mode) {
          return armFlatSnapshotPlaybackStartup(mode)
        },
        status() {
          return snapshotFlatSnapshotPlaybackStartup()
        },
        reset() {
          resetFlatSnapshotPlaybackStartup()
        },
        async startFromResume() {
          const entry = continueWatching(resumeEntries).find(
            (candidate) => Boolean(candidate.stream),
          )

          if (!entry?.stream) {
            return false
          }

          beginPlayback(entry.stream)
          return true
        },
      },
    },
  }
}

initializeAppHistory()
render()

if (profile) {
  scheduleLocalSearchIndexMigration(profile.id)
}
