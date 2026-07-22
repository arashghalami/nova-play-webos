import Hls from 'hls.js'
import './style.css'
import {
  clearProfile,
  continueWatching,
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
  LibrarySection,
  NowNext,
  Program,
  RichMetadata,
  ResumeEntry,
  SeriesDetails,
  StreamItem,
  VodDetails,
  XtreamProfile,
} from './types'
import { XtreamClient } from './xtream-client'

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
  results?: CatalogResults
}

type CachedStreams = {
  streams: StreamItem[]
  updatedAt: number
}

type FocusSnapshot = {
  id: string | null
  scrollY: number
}

type ViewReturnPoint = {
  view: AppView
  focus: FocusSnapshot
}
const CATALOG_PAGE_SIZE = 60
const SEARCH_DEBOUNCE_MS = 180
const NUMERIC_CHANNEL_TIMEOUT_MS = 1600
const NOW_NEXT_CONCURRENCY = 4
const MAX_KNOWN_STREAMS = 5_000
const MAX_STREAM_CACHE_ENTRIES = 18
const MAX_CACHED_STREAM_ITEMS = 12_000
const STREAM_CACHE_TTL_MS = 15 * 60_000
const GLOBAL_SEARCH_SECTION_RESULT_LIMIT = 60
const GLOBAL_SEARCH_COLLAPSED_RESULT_LIMIT = 12
const MIN_GLOBAL_SEARCH_LENGTH = 1
const MAX_NOW_NEXT_ENTRIES = 600
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
const GLOBAL_SEARCH_EXECUTION_SECTIONS: LibrarySection[] = ['series', 'live', 'vod']

const appElement = document.querySelector<HTMLDivElement>('#app')

if (!appElement) {
  throw new Error('Application root was not found.')
}

const app: HTMLDivElement = appElement

let profile = loadProfile()
let client = profile ? new XtreamClient(profile) : null
let settings: AppSettings = profile
  ? loadSettings(profile.id)
  : {
      preferHls: true,
      bufferSeconds: 20,
      timeFormat: '24h',
      hideAdultContent: true,
    }
let account: AccountSummary | null = null
let view: AppView = profile ? 'home' : 'login'
let catalog: CatalogState | null = null
let selectedItem: StreamItem | null = null
let selectedSeries: SeriesDetails | null = null
let selectedVod: VodDetails | null = null
let playerItem: StreamItem | null = null
let lastLiveItem: StreamItem | null = null
let playerSourceOverride: string | null = null
let playerForceDirect = false
let playerControlsTimer: number | null = null
let playerCleanup: (() => void) | null = null
let searchDebounceTimer: number | null = null
let globalSearchDebounceTimer: number | null = null
let numericChannelTimer: number | null = null
let numericChannelBuffer = ''
let activeHls: Hls | null = null
let playerMuted = false
let playerPlaybackRate = 1
let playerAspect: 'contain' | 'cover' = 'contain'
let showPlayerChannels = false
let wakeLock: { release: () => Promise<void> } | null = null
let navigationSequence = 0
let navigationToken = 0
let navigationController: AbortController | null = null
let nowNextPrefetchController: AbortController | null = null
let liveQueue: StreamItem[] = []
let guideStreams: StreamItem[] = []
let globalSearchResults: StreamItem[] = []
let globalSearchQuery = ''
let globalSearchLoading = false
let globalSearchStatus = ''
let searchReturnView: AppView = 'home'
let pendingFocus: FocusSnapshot | null = null
let detailReturnPoint: ViewReturnPoint | null = null
let playerReturnPoint: ViewReturnPoint | null = null
let editingInput: HTMLInputElement | HTMLTextAreaElement | null = null
const expandedGlobalSearchSections = new Set<LibrarySection>()
let favorites = profile ? loadFavorites(profile.id) : new Map()
let resumeEntries = profile ? loadResume(profile.id) : new Map<string, ResumeEntry>()
const knownStreams = new Map<string, StreamItem>()
const streamCache = new Map<string, CachedStreams>()
const sectionCategories = new Map<LibrarySection, Category[]>()
const adultCategoryIds = new Map<LibrarySection, Set<string>>()
const nowNextCache = new Map<string, NowNext>()
const nowNextLoading = new Set<string>()

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
    return `<svg ${attributes} ${name === 'starFilled' ? 'fill="currentColor"' : ''}><path d="m12 3.35 2.7 5.48 6.05.88-4.38 4.27 1.03 6.02L12 17.16 6.6 20l1.03-6.02-4.38-4.27 6.05-.88L12 3.35Z"></path></svg>`
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
    return null
  }

  if (Date.now() - cached.updatedAt > STREAM_CACHE_TTL_MS) {
    streamCache.delete(key)
    return null
  }

  streamCache.delete(key)
  streamCache.set(key, cached)
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
    return
  }

  streamCache.set(key, { streams, updatedAt: Date.now() })

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

function cachedStreamsForSection(section: LibrarySection): StreamItem[] {
  const prefix = `${section}:`
  const streams = new Map<string, StreamItem>()

  streamCache.forEach((entry, key) => {
    if (key.startsWith(prefix) && Date.now() - entry.updatedAt <= STREAM_CACHE_TTL_MS) {
      entry.streams.forEach((stream) => streams.set(streamLookupKey(stream), stream))
    }
  })

  knownStreams.forEach((stream, key) => {
    if (stream.section === section) {
      streams.set(key, stream)
    }
  })

  favorites.forEach((favorite) => {
    if (favorite.stream?.section === section) {
      streams.set(streamLookupKey(favorite.stream), favorite.stream)
    }
  })

  resumeEntries.forEach((resume) => {
    if (resume.stream?.section === section) {
      streams.set(streamLookupKey(resume.stream), resume.stream)
    }
  })

  return [...streams.values()]
}

function startNavigation(): { token: number; signal: AbortSignal } {
  navigationToken += 1
  navigationController?.abort()
  nowNextPrefetchController?.abort()
  navigationController = new AbortController()
  nowNextPrefetchController = null
  return { token: navigationToken, signal: navigationController.signal }
}

function isCurrentNavigation(token: number): boolean {
  return token === navigationToken && !navigationController?.signal.aborted
}

function invalidateSpatialLayout(): void {
  // Geometry is measured on every D-pad event because scrolling changes viewport coordinates.
}

function scrollDocumentBy(deltaY: number): void {
  const maximumScroll = Math.max(
    0,
    document.documentElement.scrollHeight - window.innerHeight,
  )
  const nextScroll = Math.max(0, Math.min(maximumScroll, window.scrollY + deltaY))

  if (nextScroll !== window.scrollY) {
    window.scrollTo(0, nextScroll)
    invalidateSpatialLayout()
  }
}

function searchText(stream: StreamItem): string {
  return stream.searchName ?? stream.name.toLocaleLowerCase()
}

function cacheNowNext(key: string, value: NowNext): void {
  nowNextCache.delete(key)
  nowNextCache.set(key, value)

  while (nowNextCache.size > MAX_NOW_NEXT_ENTRIES) {
    const oldestKey = nowNextCache.keys().next().value

    if (!oldestKey) {
      break
    }

    nowNextCache.delete(oldestKey)
  }
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
function restoreFocus(snapshot: FocusSnapshot | null): void {
  const requested = pendingFocus
  pendingFocus = null

  window.setTimeout(() => {
    const requestedTarget = requested?.id
      ? document.querySelector<HTMLElement>(`[data-focus-id="${cssEscape(requested.id)}"]`)
      : null
    const snapshotTarget = snapshot?.id
      ? document.querySelector<HTMLElement>(`[data-focus-id="${cssEscape(snapshot.id)}"]`)
      : null
    const fallback = document.querySelector<HTMLElement>(
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

    focusTarget?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, 0)
}
function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&')
}

function toHlsUrl(source: string): string {
  try {
    const url = new URL(source)
    url.pathname = url.pathname.replace(/\.[^/.]+$/, '.m3u8')
    return url.toString()
  } catch {
    const match = source.match(/^([^?#]*)([?#].*)?$/)

    if (!match) {
      return source
    }

    return `${match[1].replace(/\.[^/.]+$/, '.m3u8')}${match[2] ?? ''}`
  }
}

function renderShell(content: string, title = currentViewTitle()): void {
  const snapshot = snapshotFocus()
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
  invalidateSpatialLayout()
  bindEvents()
  restoreFocus(snapshot)
}

function catalogResultsFor(activeCatalog: CatalogState): CatalogResults {
  const normalizedQuery = activeCatalog.query.toLocaleLowerCase()
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
        category.name.toLocaleLowerCase().includes(normalizedQuery) &&
        (!settings.hideAdultContent || !isAdult(category.name)),
    ),
  )
  const streams = sortStreams(
    activeCatalog.streams.filter(
      (stream) =>
        searchText(stream).includes(normalizedQuery) &&
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
  invalidateSpatialLayout()
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
          <label>Playlist name<input name="name" autocomplete="off" maxlength="60" placeholder="My IPTV" autofocus required /></label>
          <label>Server URL<input name="serverUrl" autocomplete="url" inputmode="url" placeholder="https://provider.example:8080" required /></label>
          <div class="form-grid">
            <label>Username<input name="username" autocomplete="username" required /></label>
            <label>Password<input name="password" type="password" autocomplete="current-password" required /></label>
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
      const nextClient = new XtreamClient(nextProfile)
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
  restoreFocus(snapshot)
}

function renderHome(): void {
  const connectionSummary = account ? 'Connected' : 'Ready to watch'
  const expiry = account?.expiresAt ? `Expires ${formatDate(account.expiresAt)} · ` : ''
  const continueEntries = continueWatching(resumeEntries)
    .filter((entry) => Boolean(entry.stream && visibleStream(entry.stream)))
    .slice(0, 12)

  renderShell(`
    <section class="hero">
      <div>
        <p class="eyebrow">${escape(profile?.name ?? 'My IPTV')}</p>
        <h1>What would you like to watch?</h1>
        <p>${escape(expiry)}${escape(connectionSummary)}</p>
      </div>
      <div class="hero-actions" data-nav-zone="home-hero">
        <button class="secondary-button" data-action="open-guide" data-focus-id="home-guide">TV Guide</button>
        <button class="secondary-button" data-action="refresh-account" data-focus-id="home-refresh">Refresh account</button>
      </div>
    </section>
    ${
      continueEntries.length
        ? `<section class="home-rail">
            <div class="rail-heading"><div><p class="eyebrow">Continue watching</p><h2>Pick up where you left off</h2></div></div>
            <section class="content-grid continue-grid" data-nav-zone="home-continue" aria-label="Continue watching">
              ${continueEntries.map((entry) => streamCard(entry.stream!, entry)).join('')}
            </section>
          </section>`
        : ''
    }
    <section class="hub-grid" data-nav-zone="home-hub">
      ${libraryCard('live', icon('live'), 'Watch TV channels now', 'Browse live channels, now and next information, and a TV guide.')}
      ${libraryCard('vod', icon('movie'), 'Movies on demand', 'Explore rich movie information, trailers, and resume playback.')}
      ${libraryCard('series', icon('series'), 'Series & episodes', 'Pick up a show where you left off, with next-episode playback.')}
      <button class="hub-card" data-action="favorites" data-focus-id="home-favorites">
        <span class="hub-icon favorite-icon">${icon('star')}</span><span class="hub-label">Favorites</span><span class="hub-description">Your saved channels and titles across every library.</span>
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
      <span class="hub-icon">${icon}</span><span class="hub-label">${title}</span><span class="hub-description">${description}</span>
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
  const pageCount = Math.max(1, Math.ceil(itemCount / CATALOG_PAGE_SIZE))
  catalog.page = Math.max(0, Math.min(catalog.page, pageCount - 1))
  const pageStart = catalog.page * CATALOG_PAGE_SIZE
  const pageCategories = visibleCategories.slice(pageStart, pageStart + CATALOG_PAGE_SIZE)
  const pageStreams = filteredStreams.slice(pageStart, pageStart + CATALOG_PAGE_SIZE)
  const activeCategory = catalog.category?.name ?? 'All categories'
  const catalogLabel = catalog.isFavorites ? 'Favorites' : labels[catalog.section]
  const searchTarget = catalog.isFavorites
    ? 'favorites'
    : catalog.category === null
      ? 'categories'
      : labels[catalog.section].toLowerCase()

  renderShell(`
    <section class="catalog-heading">
      <div><p class="eyebrow">${catalogLabel}</p><h1>${escape(activeCategory)}</h1></div>
      <div class="catalog-tools">
        ${catalog.isFavorites ? '' : '<button class="secondary-button" data-action="choose-category" data-focus-id="catalog-categories">Categories</button>'}
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

  document.querySelector<HTMLInputElement>('#search-input')?.addEventListener('input', (event) => {
    scheduleCatalogSearch((event.target as HTMLInputElement).value)
  })

  if (catalog.section === 'live' && catalog.category !== null) {
    prefetchNowNext(pageStreams)
  }
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

    catalog.query = value
    catalog.page = 0
    requestFocus({ id: 'catalog-search', scrollY: window.scrollY })
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
  }, SEARCH_DEBOUNCE_MS)
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
  const providerLogo = stream.icon
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

function posterArtwork(stream: StreamItem): string {
  const source = stream.cover ?? stream.metadata?.cover ?? stream.icon

  if (!source) {
    return imageOrPlaceholder(undefined, stream.name, 'poster')
  }

  return `
    <span class="poster-artwork">
      <img class="poster" src="${escape(source)}" alt="" loading="lazy" />
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
  const meta = isLive
    ? nowNext?.now
      ? `Now: ${nowNext.now.title}`
      : 'Live · loading now/next…'
    : storedResume?.completed
      ? 'Watched'
      : storedResume
        ? `Resume ${formatDuration(storedResume.position)}`
        : stream.rating ?? stream.year ?? 'On demand'

  return `
    <article class="media-card ${isLive ? 'is-live' : ''} ${storedResume?.completed ? 'is-watched' : ''}">
      ${cardRating(stream)}
      <button class="media-select" data-action="select-stream" data-stream-key="${escape(streamKey)}" data-resume-card="${storedResume ? 'true' : 'false'}" data-focus-id="stream-${escape(streamKey)}">
        <span class="artwork ${isLive ? 'live-artwork' : ''}">${image}</span>
        <span class="media-info">
          <span class="media-name">${escape(stream.name)}</span>
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
  const duration = stream.metadata?.durationSeconds

  if (!duration || duration <= 0) {
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

  const metadata = detailsMetadata(item)
  const media = metadata.cover ?? item.cover ?? item.icon
  const description = metadata.plot ?? item.plot ?? 'No description provided by this IPTV provider.'
  const details = [
    metadata.genre,
    metadata.rating ?? item.rating,
    metadata.releaseDate ?? metadata.year ?? item.year,
    metadata.duration,
  ]
    .filter(Boolean)
    .join(' · ')

  renderShell(`
    <section class="detail-layout">
      <div class="detail-art">${imageOrPlaceholder(media, item.name, 'detail-image')}</div>
      <div class="detail-copy">
        <p class="eyebrow">${item.section === 'series' ? 'Series' : item.streamType === 'episode' ? `Season ${escape(item.season ?? '')} · Episode ${escape(item.episodeNumber ?? '')}` : item.section === 'live' ? 'Live TV' : 'Movie'}</p>
        <h1>${escape(selectedSeries?.info.name ?? item.name)}</h1>
        <p class="metadata">${escape(details || 'Available now')}</p>
        <p class="plot">${escape(description)}</p>
        ${renderRichMetadata(metadata)}
        ${detailActions(item, metadata)}
      </div>
    </section>
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

function renderRichMetadata(metadata: RichMetadata): string {
  const details = [
    metadata.cast ? `<p><strong>Cast:</strong> ${escape(metadata.cast)}</p>` : '',
    metadata.director ? `<p><strong>Director:</strong> ${escape(metadata.director)}</p>` : '',
    metadata.country ? `<p><strong>Country:</strong> ${escape(metadata.country)}</p>` : '',
  ].filter(Boolean)

  return details.length ? `<div class="rich-metadata">${details.join('')}</div>` : ''
}

function detailActions(item: StreamItem, metadata: RichMetadata): string {
  if (item.section === 'series' && !item.streamType) {
    return '<p class="hint">Choose an episode below to start watching.</p>'
  }

  const streamKey = streamLookupKey(item)
  const resume = resumeEntries.get(streamKey)
  const canMarkWatched = item.section !== 'live'
  const canCatchup = item.section === 'live' && item.catchup?.available

  return `
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

function renderEpisodeList(): string {
  if (!selectedSeries) {
    return ''
  }

  const seasons = Object.entries(selectedSeries.episodes)

  if (!seasons.length) {
    return '<section class="empty-state"><h2>No episodes available</h2><p>The provider did not return episode information for this series.</p></section>'
  }

  return `
    <section class="episodes">
      <h2>Episodes</h2>
      ${seasons
        .map(
          ([season, episodes]) => `
            <div class="season"><h3>Season ${escape(season)}</h3>
            ${episodes
              .map((episode) => {
                const entry = resumeEntries.get(streamLookupKey(episode))
                return `
                  <button class="episode ${entry?.completed ? 'is-watched' : ''}" data-action="play-episode" data-stream-key="${escape(streamLookupKey(episode))}" data-focus-id="episode-${escape(streamLookupKey(episode))}">
                    <span>${entry?.completed ? '✓' : '▶'}</span><span>${escape(episode.name)}</span><small>${escape(episode.plot ?? '')}</small>
                  </button>`
              })
              .join('')}
            </div>`,
        )
        .join('')}
    </section>
  `
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

  prefetchNowNext(guideStreams)
}

function renderGlobalSearchSection(section: LibrarySection): string {
  const results = globalSearchResults.filter((stream) => stream.section === section)
  const expanded = expandedGlobalSearchSections.has(section)
  const visibleResults = expanded
    ? results
    : results.slice(0, GLOBAL_SEARCH_COLLAPSED_RESULT_LIMIT)
  const hiddenCount = Math.max(0, results.length - visibleResults.length)
  const hasMore = results.length > GLOBAL_SEARCH_COLLAPSED_RESULT_LIMIT
  const noun =
    section === 'live'
      ? results.length === 1
        ? 'channel'
        : 'channels'
      : section === 'vod'
        ? results.length === 1
          ? 'movie'
          : 'movies'
        : results.length === 1
          ? 'series'
          : 'series'

  return `
    <section class="global-search-group" aria-label="${labels[section]} results">
      <div class="global-search-group-heading">
        <div class="global-search-group-title">
          <h2>${escape(labels[section])}</h2>
          <span class="global-search-count" aria-label="${results.length} ${noun} found">
            <strong>${results.length}</strong><span>results</span>
          </span>
        </div>
        ${
          hasMore
            ? `<button class="secondary-button global-search-toggle" data-action="toggle-global-search-section" data-section="${section}" data-focus-id="global-search-toggle-${section}" aria-expanded="${expanded}">
                ${expanded ? 'Show less' : `Show ${hiddenCount} more`}
              </button>`
            : ''
        }
      </div>
      ${
        visibleResults.length
          ? `<div class="content-grid">${visibleResults.map((stream) => streamCard(stream)).join('')}</div>`
          : globalSearchLoading
            ? '<div class="global-search-empty"><div class="spinner"></div><span>Looking in this library…</span></div>'
            : '<div class="global-search-empty">No results</div>'
      }
    </section>
  `
}

function renderGlobalSearchResults(): string {
  if (!globalSearchQuery) {
    return '<section class="empty-state"><h2>Find anything</h2><p>Search Live TV, Movies, and Series.</p></section>'
  }

  return GLOBAL_SEARCH_SECTIONS.map(renderGlobalSearchSection).join('')
}

function globalSearchControls(): string {
  return `
    <div id="global-search-controls" class="global-search-controls">
      ${globalSearchQuery ? '<button class="secondary-button" data-action="clear-global-search" data-focus-id="global-search-clear">Clear</button>' : ''}
      ${globalSearchLoading ? '<button class="secondary-button" data-action="cancel-global-search" data-focus-id="global-search-cancel">Cancel</button>' : ''}
      <button class="primary-button" data-action="run-global-search" data-focus-id="global-search-run">Search</button>
    </div>
  `
}

function updateGlobalSearchView(): void {
  const status = document.querySelector<HTMLElement>('#global-search-status')
  const controls = document.querySelector<HTMLElement>('#global-search-controls')
  const results = document.querySelector<HTMLElement>('#global-search-results')
  const active = document.activeElement
  const activeFocusId =
    active instanceof HTMLElement ? active.dataset.focusId ?? null : null
  const scrollY = window.scrollY

  if (status) {
    status.textContent = globalSearchStatus
    status.hidden = !globalSearchStatus
  }

  if (controls) {
    controls.outerHTML = globalSearchControls()
  }

  if (!results) {
    return
  }

  results.innerHTML = renderGlobalSearchResults()
  bindEvents()

  if (activeFocusId) {
    window.setTimeout(() => {
      const replacement = document.querySelector<HTMLElement>(
        `[data-focus-id="${cssEscape(activeFocusId)}"]`,
      )

      if (replacement) {
        replacement.focus({ preventScroll: true })
        window.scrollTo(0, scrollY)
      }
    }, 0)
  }
}

function clearGlobalSearch(): void {
  const input = document.querySelector<HTMLInputElement>('#global-search-input')

  if (input) {
    input.value = ''
    input.setSelectionRange(0, 0)
  }

  if (globalSearchDebounceTimer !== null) {
    window.clearTimeout(globalSearchDebounceTimer)
    globalSearchDebounceTimer = null
  }

  startNavigation()
  globalSearchQuery = ''
  globalSearchResults = []
  globalSearchLoading = false
  globalSearchStatus = ''
  expandedGlobalSearchSections.clear()
  updateGlobalSearchView()

  window.setTimeout(() => {
    document.querySelector<HTMLInputElement>('#global-search-input')?.focus()
  }, 0)
}

function cancelGlobalSearch(): void {
  if (!globalSearchLoading) {
    return
  }

  if (globalSearchDebounceTimer !== null) {
    window.clearTimeout(globalSearchDebounceTimer)
    globalSearchDebounceTimer = null
  }

  startNavigation()
  globalSearchLoading = false
  globalSearchStatus = globalSearchResults.length
    ? `${globalSearchResults.length} results`
    : 'Search stopped'
  updateGlobalSearchView()
}

function leaveGlobalSearch(): void {
  if (globalSearchDebounceTimer !== null) {
    window.clearTimeout(globalSearchDebounceTimer)
    globalSearchDebounceTimer = null
  }

  startNavigation()
  globalSearchQuery = ''
  globalSearchResults = []
  globalSearchLoading = false
  globalSearchStatus = ''
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

  const input = document.querySelector<HTMLInputElement>('#global-search-input')
  input?.addEventListener('input', () => {
    globalSearchQuery = input.value

    if (globalSearchDebounceTimer !== null) {
      window.clearTimeout(globalSearchDebounceTimer)
    }

    startNavigation()
    globalSearchResults = []
    globalSearchLoading = globalSearchQuery.trim().length >= MIN_GLOBAL_SEARCH_LENGTH
    globalSearchStatus = globalSearchLoading ? 'Searching…' : ''
    expandedGlobalSearchSections.clear()
    updateGlobalSearchView()

    globalSearchDebounceTimer = window.setTimeout(() => {
      globalSearchDebounceTimer = null

      if (view !== 'search') {
        return
      }

      if (globalSearchQuery.trim().length < MIN_GLOBAL_SEARCH_LENGTH) {
        return
      }

      void runGlobalSearch(globalSearchQuery)
    }, SEARCH_DEBOUNCE_MS)
  })
}

function renderSettings(): void {
  const profiles = loadProfiles()

  renderShell(`
    <section class="catalog-heading">
      <div><p class="eyebrow">Device preferences</p><h1>Settings</h1></div>
      <button class="secondary-button" data-action="add-profile" data-focus-id="settings-add-profile">Add playlist</button>
    </section>
    <section class="settings-layout">
      <section class="settings-panel">
        <h2>Playback</h2>
        <label class="setting-row"><span>Prefer HLS live streams</span><input id="setting-prefer-hls" data-focus-id="setting-prefer-hls" type="checkbox" ${settings.preferHls ? 'checked' : ''} /></label>
        <label class="setting-row"><span>Live buffer</span><select id="setting-buffer" data-focus-id="setting-buffer">
          ${[10, 20, 30, 45, 60].map((value) => `<option value="${value}" ${settings.bufferSeconds === value ? 'selected' : ''}>${value} seconds</option>`).join('')}
        </select></label>
        <label class="setting-row"><span>Clock format</span><select id="setting-time-format" data-focus-id="setting-time-format">
          <option value="24h" ${settings.timeFormat === '24h' ? 'selected' : ''}>24-hour</option>
          <option value="12h" ${settings.timeFormat === '12h' ? 'selected' : ''}>12-hour</option>
        </select></label>
        <label class="setting-row"><span>Hide adult categories</span><input id="setting-hide-adult" data-focus-id="setting-hide-adult" type="checkbox" ${settings.hideAdultContent ? 'checked' : ''} /></label>
        <label class="setting-row"><span>Parental PIN <small>Device-local deterrent</small></span><input id="setting-parental-pin" data-focus-id="setting-parental-pin" type="password" inputmode="numeric" maxlength="8" value="${escape(settings.parentalPin ?? '')}" placeholder="Optional PIN" /></label>
        <button class="primary-button" data-action="save-settings" data-focus-id="settings-save">Save settings</button>
      </section>
      <section class="settings-panel">
        <h2>Playlists</h2>
        <p class="hint">Favorites and watch history are separated per playlist.</p>
        <div class="profile-list">
          ${profiles
            .map(
              (savedProfile) => `
                <div class="profile-row ${savedProfile.id === profile?.id ? 'is-active' : ''}">
                  <span>${escape(savedProfile.name)}</span>
                  <div>
                    <button class="secondary-button" data-action="switch-profile" data-profile-id="${escape(savedProfile.id)}" data-focus-id="settings-profile-${escape(savedProfile.id)}">${savedProfile.id === profile?.id ? 'Active' : 'Use'}</button>
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
  const isLive = item.section === 'live'
  const queue = isLive ? liveQueue : []
  const currentIndex = queue.findIndex((candidate) => streamLookupKey(candidate) === streamLookupKey(item))
  const playerNavigationControls = isLive
    ? '<button class="icon-button" data-action="previous-live-channel" data-focus-id="player-channel-previous" aria-label="Previous channel">‹</button><button class="icon-button" data-action="next-live-channel" data-focus-id="player-channel-next" aria-label="Next channel">›</button><button class="secondary-button" data-action="toggle-channel-overlay" data-focus-id="player-channel-list">Channels</button>'
    : '<button class="icon-button" data-action="skip-backward" data-focus-id="player-skip-backward" aria-label="Skip backward 10 seconds">−10</button>'
  const playerUtilityControls = isLive
    ? '<button class="icon-button" data-action="toggle-last-channel" data-focus-id="player-last-channel" aria-label="Return to last channel">↶</button>'
    : `<button class="icon-button" data-action="skip-forward" data-focus-id="player-skip-forward" aria-label="Skip forward 10 seconds">+10</button><button class="icon-button" data-action="cycle-speed" data-focus-id="player-speed" aria-label="Playback speed">${playerPlaybackRate}×</button>`

  app.innerHTML = `
    <main class="player-page player-aspect-${playerAspect}">
      <video id="video-player" autoplay playsinline ${playerMuted ? 'muted' : ''}></video>
      <div id="player-message" class="player-message" hidden></div>
      <div id="channel-number-overlay" class="channel-number-overlay" hidden></div>
      <div id="player-controls" class="player-controls">
        <button class="icon-button player-back" data-action="close-player" data-focus-id="player-close" aria-label="Close player">←</button>
        ${playerNavigationControls}
        <div class="player-title"><span>${escape(isLive ? 'LIVE' : 'PLAYING')}</span>${escape(item.name)}</div>
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
      <div id="player-progress-wrap" class="player-progress-wrap ${isLive ? 'hidden' : ''}">
        <div class="player-time"><span id="player-current">0:00</span><span id="player-duration">0:00</span></div>
        <input id="player-progress" data-focus-id="player-progress" aria-label="Playback position" type="range" min="0" max="100" value="0" step="0.1" />
      </div>
    </main>
  `
  invalidateSpatialLayout()
  bindEvents()

  const video = document.querySelector<HTMLVideoElement>('#video-player')
  const message = document.querySelector<HTMLElement>('#player-message')
  const progress = document.querySelector<HTMLInputElement>('#player-progress')
  const currentTime = document.querySelector<HTMLElement>('#player-current')
  const duration = document.querySelector<HTMLElement>('#player-duration')

  if (!video || !message || !progress || !currentTime || !duration) {
    return
  }

  const activeItem = item
  const activeItemKey = streamLookupKey(activeItem)
  const player = video
  const playerMessage = message
  const playerProgress = progress
  const playerCurrentTime = currentTime
  const playerDuration = duration
  let lastResumeSaveAt = 0
  let videoDecodeWatchdog: number | null = null
  let playbackWatchdog: number | null = window.setTimeout(() => {
    if (player.readyState === HTMLMediaElement.HAVE_NOTHING) {
      showPlayerMessage('This stream did not start. Try another stream format or channel.')
    }
  }, 15_000)

  const cleanup = (): void => {
    clearPlaybackWatchdog()
    clearVideoDecodeWatchdog()

    activeHls?.destroy()
    activeHls = null
    player.pause()
    player.removeAttribute('src')
    player.load()
    document.removeEventListener('mousemove', revealControls)
    document.removeEventListener('keydown', revealControls)
    void releaseKeepAwake()
  }

  playerCleanup = cleanup
  void requestKeepAwake()

  const directUrl = playerSourceOverride ?? client.streamUrl(activeItem)
  const useHls = activeItem.section === 'live' && settings.preferHls && !playerForceDirect
  const hlsUrl = toHlsUrl(directUrl)
  let playbackCompatibilityMessage: string | null = null

  if (useHls) {
    const nativeHlsSupport =
      player.canPlayType('application/vnd.apple.mpegurl') ||
      player.canPlayType('application/x-mpegURL')

    if (nativeHlsSupport) {
      player.src = hlsUrl
      player.load()
    } else if (Hls.isSupported()) {
      let mediaRecoveryAttempts = 0
      let networkRecoveryAttempts = 0
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
        if (activeHls === hls) {
          hls.loadSource(hlsUrl)
        }
      })
      hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => {
        if (activeHls !== hls) {
          return
        }

        const unsupportedCodecs: string[] = []

        ;[data.video, data.audio, data.audiovideo].forEach((track) => {
          if (!track?.codec) {
            return
          }

          const mimeType = `${track.container}; codecs="${track.codec}"`

          if (!MediaSource.isTypeSupported(mimeType)) {
            unsupportedCodecs.push(track.codec)
          }
        })

        if (!unsupportedCodecs.length) {
          return
        }

        const usesHevc = unsupportedCodecs.some((codec) => /^(hev1|hvc1|hevc)/i.test(codec))
        playbackCompatibilityMessage = usesHevc
          ? 'This channel uses HEVC/H.265, which the webOS Emulator cannot decode. Try another feed or test it on the physical LG TV.'
          : `This channel uses an unsupported codec (${unsupportedCodecs.join(', ')}).`

        clearPlaybackWatchdog()
        hls.stopLoad()
        showPlayerMessage(playbackCompatibilityMessage)
      })
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        player.play().catch(() => showPlayerMessage('Press OK to start playback.'))
      })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (activeHls !== hls || !data.fatal || playbackCompatibilityMessage) {
          return
        }

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRecoveryAttempts < 2) {
          networkRecoveryAttempts += 1
          hls.startLoad()
          showPlayerMessage('The live stream was interrupted. Reconnecting…')
        } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.destroy()
          activeHls = null
          player.src = directUrl
          player.load()
          player.play().catch(() => showPlayerMessage('Press OK to start playback.'))
          showPlayerMessage('HLS is unavailable. Trying the provider’s direct stream…')
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveryAttempts < 2) {
          mediaRecoveryAttempts += 1
          hls.recoverMediaError()
          showPlayerMessage('Recovering the live stream…')
        } else {
          clearPlaybackWatchdog()
          showPlayerMessage('This live stream could not be decoded by this device.')
        }
      })
    } else {
      player.src = hlsUrl
      player.load()
    }
  } else {
    player.src = directUrl
    player.load()
  }

  player.playbackRate = playerPlaybackRate
  player.muted = playerMuted
  player.addEventListener('loadedmetadata', () => {
    clearPlaybackWatchdog()
    const legacyResumeKey = `legacy:${activeItem.id}`
    const resume = resumeEntries.get(activeItemKey) ?? resumeEntries.get(legacyResumeKey)

    if (
      resume &&
      activeItem.section !== 'live' &&
      !resume.completed &&
      resume.position > 10 &&
      resume.position < player.duration - 10
    ) {
      player.currentTime = resume.position

      if (!resumeEntries.has(activeItemKey) && resumeEntries.has(legacyResumeKey)) {
        resumeEntries.delete(legacyResumeKey)
        resumeEntries.set(activeItemKey, {
          streamKey: activeItemKey,
          position: resume.position,
          updatedAt: resume.updatedAt,
          stream: activeItem,
          completed: false,
        })
        saveCurrentResume()
      }
    }
    player.play().catch(() => showPlayerMessage('Press OK to start playback.'))
    watchForVideoTrack()
  })
  player.addEventListener('error', () => {
    clearPlaybackWatchdog()
    showPlayerMessage(
      playbackCompatibilityMessage ??
        'This stream could not be played. It may use an unsupported format.',
    )
    window.setTimeout(watchForVideoTrack, 250)
  })
  player.addEventListener('timeupdate', () => {
    watchForVideoTrack()

    if (activeItem.section !== 'live' && Number.isFinite(player.duration)) {
      playerProgress.value = String((player.currentTime / player.duration) * 100)
      playerCurrentTime.textContent = formatDuration(player.currentTime)
      playerDuration.textContent = formatDuration(player.duration)

      if (Date.now() - lastResumeSaveAt > 10_000) {
        persistProgress()
      }
    }
  })
  player.addEventListener('ended', () => {
    if (activeItem.section !== 'live') {
      markStreamWatched(activeItem, true)
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
    clearPlaybackWatchdog()
    hidePlayerMessage()
    watchForVideoTrack()
  })
  player.addEventListener('resize', () => {
    if (player.videoWidth > 0 && player.videoHeight > 0) {
      clearVideoDecodeWatchdog()
    }
  })
  playerProgress.addEventListener('input', () => {
    if (Number.isFinite(player.duration)) {
      player.currentTime = (Number(playerProgress.value) / 100) * player.duration
    }
  })
  document.addEventListener('mousemove', revealControls)
  document.addEventListener('keydown', revealControls)
  revealControls()
  restoreFocus(snapshot)
  watchForVideoTrack()

  function clearPlaybackWatchdog(): void {
    if (playbackWatchdog !== null) {
      window.clearTimeout(playbackWatchdog)
      playbackWatchdog = null
    }
  }

  function clearVideoDecodeWatchdog(): void {
    if (videoDecodeWatchdog !== null) {
      window.clearInterval(videoDecodeWatchdog)
      videoDecodeWatchdog = null
    }
  }

  function watchForVideoTrack(): void {
    if (player.videoWidth > 0 && player.videoHeight > 0) {
      clearVideoDecodeWatchdog()
      return
    }

    if (videoDecodeWatchdog !== null) {
      return
    }

    videoDecodeWatchdog = window.setInterval(() => {
      if (player.videoWidth > 0 && player.videoHeight > 0) {
        clearVideoDecodeWatchdog()
        return
      }

      if (player.paused || player.currentTime <= 0) {
        return
      }

      playbackCompatibilityMessage =
        'Audio is available, but this stream has no video track that this webOS device can decode. This provider item is delivered as an incompatible MKV/video codec combination. Try another provider rendition or play it on a device that supports this video codec.'
      player.pause()
      clearPlaybackWatchdog()
      clearVideoDecodeWatchdog()
      showPlayerMessage(playbackCompatibilityMessage)
    }, 750)
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

function revealControls(): void {
  const controls = document.querySelector<HTMLElement>('#player-controls')
  const progress = document.querySelector<HTMLElement>('#player-progress-wrap')
  controls?.classList.remove('concealed')
  progress?.classList.remove('concealed')

  if (playerControlsTimer !== null) {
    window.clearTimeout(playerControlsTimer)
  }

  playerControlsTimer = window.setTimeout(() => {
    controls?.classList.add('concealed')
    progress?.classList.add('concealed')
  }, 3500)
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
    '.episodes',
    '.guide-grid',
    '.global-search-panel',
    '.global-search-group',
    '.settings-panel',
    '.profile-list',
    '#player-controls',
    '#player-progress-wrap',
    '#channel-overlay',
  ].join(', ')

  app.querySelectorAll<HTMLElement>(zoneSelectors).forEach((zone) => {
    if (!zone.dataset.navZone) {
      navigationZoneSequence += 1
      zone.dataset.navZone = `zone-${navigationZoneSequence}`
    }
  })
}

function bindEvents(): void {
  invalidateSpatialLayout()

  if (!delegatedEventsBound) {
    app.addEventListener('click', (event) => {
      const target = event.target

      if (!(target instanceof Element)) {
        return
      }

      const actionElement = target.closest<HTMLElement>('[data-action]')

      if (actionElement && app.contains(actionElement)) {
        void handleAction(actionElement)
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

        if (target.classList.contains('live-channel-logo')) {
          target.closest<HTMLElement>('.live-channel-artwork')?.classList.add('logo-unavailable')
        }

        if (target.classList.contains('poster')) {
          target.closest<HTMLElement>('.poster-artwork')?.classList.add('image-unavailable')
        }
      },
      true,
    )
    liveLogoErrorHandlerBound = true
  }

  app.querySelectorAll<HTMLImageElement>('.live-channel-logo, .poster').forEach((image) => {
    window.setTimeout(() => {
      if (!image.isConnected || (image.complete && image.naturalWidth > 0)) {
        return
      }

      if (image.classList.contains('live-channel-logo')) {
        image.closest<HTMLElement>('.live-channel-artwork')?.classList.add('logo-unavailable')
      } else {
        image.closest<HTMLElement>('.poster-artwork')?.classList.add('image-unavailable')
      }
    }, 5_000)
  })

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
}

async function handleAction(element: HTMLElement): Promise<void> {
  const action = element.dataset.action

  if (action === 'home') {
    startNavigation()
    view = 'home'
    render()
    return
  }

  if (action === 'open-section') {
    await openSection(element.dataset.section as LibrarySection)
    return
  }

  if (action === 'choose-category' && catalog) {
    startNavigation()
    catalog = {
      ...catalog,
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

    if (element.dataset.resumeCard === 'true' && stream.streamType === 'episode') {
      beginPlayback(stream)
    } else {
      await openDetails(stream)
    }
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
      updateGlobalSearchView()
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

  if (action === 'play-selected' && selectedItem) {
    beginPlayback(selectedItem)
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
    closePlayer()
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

  if (action === 'settings') {
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
    startNavigation()
    clearProfile()
    profile = null
    client = null
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
  const activeClient = client

  if (!activeClient) {
    return
  }

  const { token, signal } = startNavigation()
  renderLoading(`Loading ${labels[section].toLowerCase()}…`)

  try {
    const categories = await activeClient.categories(section, signal)

    if (!isCurrentNavigation(token)) {
      return
    }

    rememberCategories(section, categories)
    catalog = {
      section,
      category: null,
      categories,
      streams: [],
      query: '',
      page: 0,
      isFavorites: false,
      sort: 'default',
    }
    view = 'catalog'
    render()
  } catch (reason) {
    if (!isCurrentNavigation(token)) {
      return
    }

    try {
      await activeClient.validate(signal)
      renderError(
        new Error(
          'Your login is valid, but this provider is not responding to its category service. Please try again shortly.',
        ),
        () => void openSection(section),
      )
    } catch (validationReason) {
      const validationMessage =
        validationReason instanceof Error ? validationReason.message : ''

      if (
        validationMessage.includes('rejected that username or password') ||
        validationMessage.includes('invalid response')
      ) {
        renderError(validationReason, () => void openSection(section))
      } else {
        renderError(
          new Error(
            'The IPTV provider is currently unreachable or too slow. This is a provider/network failure, not a confirmed login rejection.',
          ),
          () => void openSection(section),
        )
      }
    }
  }
}

async function loadCategory(category: Category | null): Promise<void> {
  const activeClient = client
  const activeCatalog = catalog

  if (!activeClient || !activeCatalog) {
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

  const { token, signal } = startNavigation()
  renderLoading(`Loading ${category.name}…`)

  try {
    const streams =
      cachedStreams(activeCatalog.section, category.id) ??
      await activeClient.streams(activeCatalog.section, category.id, signal)

    if (!isCurrentNavigation(token)) {
      return
    }

    rememberStreams(streams)
    cacheStreams(activeCatalog.section, category.id, streams)

    if (activeCatalog.section === 'live') {
      liveQueue = streams
    }

    const favoritesChanged = hydrateFavorites(favorites, streams)

    if (favoritesChanged && profile && !saveFavorites(profile.id, favorites)) {
      showToast(STORAGE_FAILURE_MESSAGE)
    }

    catalog = {
      ...activeCatalog,
      category,
      streams,
      query: '',
      page: 0,
      isFavorites: false,
      results: undefined,
    }
    renderCatalog()
  } catch (reason) {
    if (isCurrentNavigation(token)) {
      renderError(reason, () => void loadCategory(category))
    }
  }
}

async function openDetails(stream: StreamItem): Promise<void> {
  const activeClient = client
  detailReturnPoint = captureReturnPoint()

  if (!activeClient) {
    return
  }

  const { token, signal } = startNavigation()
  rememberStreams([stream])
  selectedItem = stream
  selectedSeries = null
  selectedVod = null

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

      selectedSeries = series
      Object.values(series.episodes).forEach(rememberStreams)
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
  } catch (reason) {
    if (isCurrentNavigation(token)) {
      renderError(reason, () => void openDetails(stream))
    }
  }
}

function openFavorites(): void {
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

function categorySearchScore(category: Category, query: string): number {
  const normalizedName = category.name.toLocaleLowerCase()

  if (normalizedName.includes(query)) {
    return 0
  }

  // Keep the fuzzy fallback compatible with the ES2015 webOS bundle.
  const queryTokens = query.match(/[a-z0-9]+/g) ?? []
  const nameTokens = normalizedName.match(/[a-z0-9]+/g) ?? []

  return queryTokens.reduce((bestScore, queryToken) => {
    const tokenScore = nameTokens.reduce((bestTokenScore, nameToken) => {
      if (nameToken.includes(queryToken) || queryToken.includes(nameToken)) {
        return Math.min(bestTokenScore, 1)
      }

      const distance = boundedEditDistance(nameToken, queryToken, 2)

      return distance <= 2
        ? Math.min(bestTokenScore, distance + 2)
        : bestTokenScore
    }, Number.POSITIVE_INFINITY)

    return Math.min(bestScore, tokenScore)
  }, Number.POSITIVE_INFINITY)
}

function boundedEditDistance(left: string, right: string, limit: number): number {
  if (Math.abs(left.length - right.length) > limit) {
    return limit + 1
  }

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    let smallest = current[0]

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      const value = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + cost,
      )
      current.push(value)
      smallest = Math.min(smallest, value)
    }

    if (smallest > limit) {
      return limit + 1
    }

    previous = current
  }

  return previous[right.length]
}

function globalSearchResultCount(results: StreamItem[], section: LibrarySection): number {
  return results.reduce(
    (count, stream) => count + (stream.section === section ? 1 : 0),
    0,
  )
}

function addSearchMatches(
  results: StreamItem[],
  knownKeys: Set<string>,
  streams: StreamItem[],
  query: string,
): boolean {
  let added = false

  for (const stream of streams) {
    if (
      stream.streamType === 'episode' ||
      globalSearchResultCount(results, stream.section) >=
        GLOBAL_SEARCH_SECTION_RESULT_LIMIT
    ) {
      continue
    }

    const key = streamLookupKey(stream)

    if (
      !knownKeys.has(key) &&
      searchText(stream).includes(query) &&
      visibleStream(stream)
    ) {
      knownKeys.add(key)
      results.push(stream)
      added = true
    }
  }

  return added
}

function renderGlobalSearchProgress(token: number, hasNewResults: boolean): void {
  if (!isCurrentNavigation(token) || view !== 'search') {
    return
  }

  if (hasNewResults) {
    updateGlobalSearchView()
    return
  }

  const status = document.querySelector<HTMLElement>('#global-search-status')
  if (status) {
    status.textContent = globalSearchStatus
  }
}

async function runGlobalSearch(queryOverride?: string): Promise<void> {
  const activeClient = client

  if (!activeClient) {
    return
  }

  const searchInput = document.querySelector<HTMLInputElement>('#global-search-input')
  globalSearchQuery = (queryOverride ?? searchInput?.value ?? globalSearchQuery).trim()

  if (globalSearchQuery.length < MIN_GLOBAL_SEARCH_LENGTH) {
    globalSearchResults = []
    globalSearchLoading = false
    globalSearchStatus = ''
    view = 'search'

    if (document.querySelector('#global-search-results')) {
      updateGlobalSearchView()
    } else {
      renderGlobalSearch()
    }
    return
  }

  const { token, signal } = startNavigation()
  const query = globalSearchQuery.toLocaleLowerCase()
  const results: StreamItem[] = []
  const resultKeys = new Set<string>()
  const sections = GLOBAL_SEARCH_SECTIONS

  expandedGlobalSearchSections.clear()
  sections.forEach((section) => {
    addSearchMatches(results, resultKeys, cachedStreamsForSection(section), query)
  })
  globalSearchResults = [...results]
  globalSearchLoading = true
  globalSearchStatus = 'Searching…'
  view = 'search'

  if (document.querySelector('#global-search-results')) {
    updateGlobalSearchView()
  } else {
    renderGlobalSearch()
  }

  try {
    const categoryResults = await Promise.allSettled(
      sections.map(async (section) => ({
        section,
        categories: await activeClient.categories(section, signal),
      })),
    )

    if (!isCurrentNavigation(token)) {
      return
    }

    categoryResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        rememberCategories(result.value.section, result.value.categories)
      }
    })
  } catch {
    // Name-based adult filtering remains active if category metadata is unavailable.
  }

  renderGlobalSearchProgress(token, results.length > 0)

  for (const section of GLOBAL_SEARCH_EXECUTION_SECTIONS) {
    if (!isCurrentNavigation(token)) {
      break
    }

    const cachedMatches = addSearchMatches(
      results,
      resultKeys,
      cachedStreamsForSection(section),
      query,
    )
    globalSearchResults = [...results]
    globalSearchStatus = 'Searching…'
    renderGlobalSearchProgress(token, cachedMatches)

    try {
      globalSearchStatus = 'Searching…'
      renderGlobalSearchProgress(token, false)

      const onMatches = (matches: StreamItem[]): void => {
        if (!isCurrentNavigation(token)) {
          return
        }

        const visibleMatches = matches.filter(
          (stream) => visibleStream(stream) && stream.streamType !== 'episode',
        )
        rememberStreams(visibleMatches)

        let hasMatches = false

        for (const stream of visibleMatches) {
          if (
            globalSearchResultCount(results, section) >=
            GLOBAL_SEARCH_SECTION_RESULT_LIMIT
          ) {
            break
          }

          const key = streamLookupKey(stream)

          if (!resultKeys.has(key)) {
            resultKeys.add(key)
            results.push(stream)
            hasMatches = true
          }
        }

        globalSearchResults = [...results]
        renderGlobalSearchProgress(token, hasMatches)
      }
      const sectionMatches = await activeClient.searchStreams(section, query, {
        signal,
        limit: Math.max(
          1,
          GLOBAL_SEARCH_SECTION_RESULT_LIMIT - globalSearchResultCount(results, section),
        ),
        excludeCategoryIds: settings.hideAdultContent
          ? adultCategoryIds.get(section)
          : undefined,
        onMatches,
      })

      if (!isCurrentNavigation(token)) {
        return
      }

      onMatches(sectionMatches)
      renderGlobalSearchProgress(token, false)
      continue
    } catch {
      if (!isCurrentNavigation(token)) {
        return
      }

      renderGlobalSearchProgress(token, false)
    }

    try {
        const categories =
        sectionCategories.get(section) ??
        await activeClient.categories(section, signal)

      if (!isCurrentNavigation(token)) {
        return
      }

      rememberCategories(section, categories)

      const categorySource = categories
      const categoriesToSearch = categorySource
        .filter((category) => !settings.hideAdultContent || !isAdult(category.name))
        .map((category, index) => ({ category, index, score: categorySearchScore(category, query) }))
        .sort((left, right) => left.score - right.score || left.index - right.index)
        .map(({ category }) => category)

      for (const category of categoriesToSearch) {
        if (
          !isCurrentNavigation(token) ||
          globalSearchResultCount(results, section) >=
            GLOBAL_SEARCH_SECTION_RESULT_LIMIT
        ) {
          break
        }

        try {
          const streams =
            cachedStreams(section, category.id) ??
            await activeClient.streams(section, category.id, signal)

          if (!isCurrentNavigation(token)) {
            return
          }

          cacheStreams(section, category.id, streams)
          rememberStreams(streams)
          const hasMatches = addSearchMatches(results, resultKeys, streams, query)
          globalSearchResults = [...results]
          globalSearchStatus = 'Searching…'
          renderGlobalSearchProgress(token, hasMatches)
        } catch {
          if (!isCurrentNavigation(token)) {
            return
          }

          renderGlobalSearchProgress(token, false)
        }
      }
    } catch {
      if (!isCurrentNavigation(token)) {
        return
      }

      renderGlobalSearchProgress(token, false)
    }
  }

  if (!isCurrentNavigation(token)) {
    return
  }

  globalSearchLoading = false
  globalSearchResults = results
  globalSearchStatus = results.length
    ? `${results.length} result${results.length === 1 ? '' : 's'}`
    : 'No results'
  updateGlobalSearchView()
}

async function loadLiveDetails(stream: StreamItem): Promise<void> {
  const activeClient = client
  const token = navigationToken
  const signal = navigationController?.signal

  if (!activeClient || selectedItem !== stream || !isCurrentNavigation(token)) {
    return
  }

  const [nowNext] = await Promise.allSettled([activeClient.nowNext(stream.id, signal)])
  const panel = document.querySelector<HTMLElement>('#now-next-panel')

  if (
    isCurrentNavigation(token) &&
    selectedItem === stream &&
    panel &&
    nowNext.status === 'fulfilled'
  ) {
    cacheNowNext(streamLookupKey(stream), nowNext.value)
    panel.innerHTML = renderNowNext(nowNext.value)
  }

  await showEpg(stream, false, token, signal)
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
    }
  } catch {
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

async function prefetchNowNext(streams: StreamItem[]): Promise<void> {
  const activeClient = client
  const token = navigationToken

  if (!activeClient || !isCurrentNavigation(token)) {
    return
  }

  nowNextPrefetchController?.abort()
  const controller = new AbortController()
  nowNextPrefetchController = controller
  const signal = controller.signal
  const queue = streams.filter((stream) => {
    const key = streamLookupKey(stream)
    return !nowNextCache.has(key) && !nowNextLoading.has(key)
  })
  let cursor = 0

  const worker = async (): Promise<void> => {
    while (cursor < queue.length && !signal.aborted && isCurrentNavigation(token)) {
      const stream = queue[cursor]
      cursor += 1
      const key = streamLookupKey(stream)
      nowNextLoading.add(key)

      try {
        const nowNext = await activeClient.nowNext(stream.id, signal)

        if (!signal.aborted && isCurrentNavigation(token)) {
          cacheNowNext(key, nowNext)
          updateNowNextCard(key, nowNext)
        }
      } catch {
        if (!signal.aborted && isCurrentNavigation(token)) {
          updateNowNextCard(key, undefined)
        }
      } finally {
        nowNextLoading.delete(key)
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(NOW_NEXT_CONCURRENCY, queue.length) }, () => worker()),
  )
}

function updateNowNextCard(key: string, nowNext?: NowNext): void {
  document
    .querySelectorAll<HTMLElement>(`[data-now-next-key="${cssEscape(key)}"]`)
    .forEach((element) => {
      element.textContent = nowNext?.now ? `Now: ${nowNext.now.title}` : 'Live channel'
    })

  document
    .querySelectorAll<HTMLElement>(`[data-guide-now-key="${cssEscape(key)}"]`)
    .forEach((element) => {
      element.textContent = nowNext?.now?.title ?? 'Schedule unavailable'
    })

  document
    .querySelectorAll<HTMLElement>(`[data-guide-next-key="${cssEscape(key)}"]`)
    .forEach((element) => {
      element.textContent = nowNext?.next?.title ?? 'Schedule unavailable'
    })
}

function beginPlayback(item: StreamItem): void {
  if (view !== 'player') {
    playerReturnPoint = captureReturnPoint()
  }
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
  view = 'player'
  render()
}

function closePlayer(): void {
  startNavigation()
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
  const values = [1, 1.25, 1.5, 2]
  const index = values.indexOf(playerPlaybackRate)
  playerPlaybackRate = values[(index + 1) % values.length]
  const video = document.querySelector<HTMLVideoElement>('#video-player')

  if (video) {
    video.playbackRate = playerPlaybackRate
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

function markStreamWatched(stream: StreamItem, completed: boolean): void {
  if (stream.section === 'live' || !profile) {
    return
  }

  const key = streamLookupKey(stream)
  const existing = resumeEntries.get(key)
  resumeEntries.set(key, {
    streamKey: key,
    position: completed ? stream.metadata?.durationSeconds ?? existing?.position ?? 0 : 0,
    updatedAt: Date.now(),
    stream,
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

function toggleChannelOverlay(): void {
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

function activateProfile(nextProfile: XtreamProfile, nextClient?: XtreamClient): void {
  profile = nextProfile
  client = nextClient ?? new XtreamClient(nextProfile)
  settings = loadSettings(nextProfile.id)
  favorites = loadFavorites(nextProfile.id)
  resumeEntries = loadResume(nextProfile.id)
  catalog = null
  selectedItem = null
  selectedSeries = null
  selectedVod = null
  playerItem = null
  liveQueue = []
  guideStreams = []
  streamCache.clear()
  sectionCategories.clear()
  adultCategoryIds.clear()
  knownStreams.clear()
  nowNextCache.clear()
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
  const snapshot = snapshotFocus()
  app.innerHTML = `<main class="status-page"><div class="spinner"></div><h1>${escape(message)}</h1></main>`
  invalidateSpatialLayout()
  restoreFocus(snapshot)
}

function renderError(reason: unknown, retry: () => void): void {
  const snapshot = snapshotFocus()
  const message = reason instanceof Error ? reason.message : 'Something went wrong.'
  app.innerHTML = `<main class="status-page"><div class="error-icon">!</div><h1>Unable to continue</h1><p>${escape(message)}</p><button class="primary-button" id="retry" data-focus-id="error-retry">Try again</button></main>`
  invalidateSpatialLayout()
  document.querySelector<HTMLButtonElement>('#retry')?.addEventListener('click', retry)
  bindEvents()
  restoreFocus(snapshot)
}

function isBackKey(event: KeyboardEvent): boolean {
  return (
    event.key === 'Escape' ||
    event.key === 'Back' ||
    event.key === 'GoBack' ||
    event.key === 'BrowserBack' ||
    event.keyCode === 461 ||
    event.keyCode === 10009
  )
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

  if (view === 'details') {
    const returnPoint = detailReturnPoint
    detailReturnPoint = null
    startNavigation()
    view = returnPoint?.view === 'search' || returnPoint?.view === 'guide' || returnPoint?.view === 'catalog'
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
      startNavigation()
      catalog = {
        ...catalog,
        category: null,
        streams: [],
        query: '',
        page: 0,
        results: undefined,
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

function render(): void {
  if (view === 'login' || !profile || !client) {
    renderLogin()
    return
  }

  if (view === 'home') renderHome()
  else if (view === 'catalog') renderCatalog()
  else if (view === 'details') renderDetails()
  else if (view === 'guide') renderGuide()
  else if (view === 'search') renderGlobalSearch()
  else if (view === 'settings') renderSettings()
  else renderPlayer()
}

function navigationZone(element: HTMLElement): HTMLElement | null {
  return element.closest<HTMLElement>('[data-nav-zone]')
}

function navigationItems(zone: HTMLElement): HTMLElement[] {
  return Array.from(
    zone.querySelectorAll<HTMLElement>(
      '[data-focus-id]:not([data-nav-skip="true"]):not([disabled])',
    ),
  ).filter((element) => navigationZone(element) === zone)
}

function navigationRows(items: HTMLElement[]): HTMLElement[][] {
  const rows: HTMLElement[][] = []

  items
    .slice()
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect()
      const rightRect = right.getBoundingClientRect()
      return leftRect.top - rightRect.top || leftRect.left - rightRect.left
    })
    .forEach((element) => {
      const row = rows[rows.length - 1]
      const rect = element.getBoundingClientRect()
      const rowTop = row?.[0].getBoundingClientRect().top

      if (!row || Math.abs(rect.top - rowTop) > Math.max(8, rect.height * 0.35)) {
        rows.push([element])
      } else {
        row.push(element)
      }
    })

  rows.forEach((row) =>
    row.sort((left, right) => left.getBoundingClientRect().left - right.getBoundingClientRect().left),
  )
  return rows
}

function closestColumn(items: HTMLElement[], origin: HTMLElement): HTMLElement | null {
  const originRect = origin.getBoundingClientRect()
  const originX = originRect.left + originRect.width / 2

  return items
    .map((element) => {
      const rect = element.getBoundingClientRect()
      return { element, distance: Math.abs(rect.left + rect.width / 2 - originX) }
    })
    .sort((left, right) => left.distance - right.distance)[0]?.element ?? null
}

function adjacentZone(originZone: HTMLElement, direction: 'ArrowUp' | 'ArrowDown'): HTMLElement | null {
  const overlay = document.querySelector<HTMLElement>('#channel-overlay')
  const zones = Array.from(
    (overlay ?? app).querySelectorAll<HTMLElement>('[data-nav-zone]'),
  ).filter((zone) => zone !== originZone && navigationItems(zone).length > 0)

  const originRect = originZone.getBoundingClientRect()
  const originY = originRect.top + originRect.height / 2

  return zones
    .map((zone) => {
      const rect = zone.getBoundingClientRect()
      const centerY = rect.top + rect.height / 2
      const isInDirection =
        direction === 'ArrowUp' ? centerY < originY - 4 : centerY > originY + 4

      if (!isInDirection) {
        return null
      }

      return { zone, distance: Math.abs(centerY - originY) }
    })
    .filter((candidate): candidate is { zone: HTMLElement; distance: number } => Boolean(candidate))
    .sort((left, right) => left.distance - right.distance)[0]?.zone ?? null
}

function moveFocus(target: HTMLElement): void {
  target.focus({ preventScroll: true })
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  invalidateSpatialLayout()
}

function handleSpatialNavigation(event: KeyboardEvent): boolean {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    return false
  }

  const active = document.activeElement
  if (
    (active instanceof HTMLInputElement || active instanceof HTMLSelectElement) &&
    (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
    editingInput === active
  ) {
    return false
  }

  const origin = active instanceof HTMLElement ? active : null
  const zone = origin ? navigationZone(origin) : null

  if (!origin || !zone) {
    return false
  }

  const items = navigationItems(zone)
  const rows = navigationRows(items)
  const rowIndex = rows.findIndex((row) => row.includes(origin))
  const row = rows[rowIndex]
  const column = row?.indexOf(origin) ?? -1
  let target: HTMLElement | null = null

  if (event.key === 'ArrowRight' && row?.length) {
    target = row[(column + 1) % row.length]
  } else if (event.key === 'ArrowLeft' && row?.length) {
    target = row[(column - 1 + row.length) % row.length]
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    const nextRow = rows[rowIndex + (event.key === 'ArrowUp' ? -1 : 1)]
    target = nextRow ? closestColumn(nextRow, origin) : null

    if (!target) {
      const nextZone = adjacentZone(zone, event.key)
      target = nextZone ? closestColumn(navigationItems(nextZone), origin) : null
    }
  }

  if (!target || target === origin) {
    return false
  }

  event.preventDefault()
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
    if (view === 'details' && selectedItem?.section === 'live') {
      void showEpg(selectedItem)
    } else {
      void openGuide()
    }
  } else if (color === 'yellow' && view === 'catalog' && catalog?.category) {
    catalog.sort = nextSort(catalog.sort)
    renderCatalog()
    showToast(`Sort: ${SORT_LABELS[catalog.sort]}`)
  } else if (color === 'blue') {
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

  if (isBackKey(event)) {
    if (finishTextEditing()) {
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }

    if (navigateBack()) {
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
    }
    return
  }

  if (handleColorShortcut(event) || handleNumericChannelInput(event)) {
    return
  }

  if (view === 'player') {
    if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'BrowserBack') {
      event.preventDefault()
      closePlayer()
      return
    }

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

    if (handleSpatialNavigation(event)) {
      revealControls()
      return
    }

    if (['ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) {
      revealControls()
    }

    const activeElement = document.activeElement
    const isPlayerControl =
      activeElement instanceof HTMLElement &&
      Boolean(activeElement.closest('#player-controls, #player-progress-wrap, #channel-overlay'))

    if ((event.key === 'Enter' || event.key === ' ') && !isPlayerControl) {
      event.preventDefault()
      togglePlayback()
    } else if (event.key === 'ArrowLeft' && !isPlayerControl && playerItem?.section !== 'live') {
      event.preventDefault()
      seekBy(-10)
    } else if (event.key === 'ArrowRight' && !isPlayerControl && playerItem?.section !== 'live') {
      event.preventDefault()
      seekBy(10)
    }
    return
  }

  if (handleSpatialNavigation(event)) {
    return
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

window.addEventListener('scroll', invalidateSpatialLayout, { passive: true })
window.addEventListener('resize', invalidateSpatialLayout)

document.addEventListener('visibilitychange', () => {
  if (document.hidden && view === 'player') {
    document.querySelector<HTMLVideoElement>('#video-player')?.pause()
  }
})

render()
void refreshAccount(true)
