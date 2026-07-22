import type {
  AppSettings,
  FavoriteEntry,
  ProfileSummary,
  ResumeEntry,
  StreamItem,
  XtreamProfile,
} from './types'

const ACTIVE_PROFILE_KEY = 'nova-play.profile'
const PROFILES_KEY = 'nova-play.profiles'
const SETTINGS_KEY = 'nova-play.settings'
const LEGACY_FAVORITES_KEY = 'nova-play.favorites'
const LEGACY_RESUME_KEY = 'nova-play.resume'
const MAX_FAVORITES = 500
const MAX_RESUME_ENTRIES = 100

const DEFAULT_SETTINGS: AppSettings = {
  preferHls: true,
  bufferSeconds: 20,
  timeFormat: '24h',
  hideAdultContent: true,
}

export const STORAGE_FAILURE_MESSAGE =
  'This TV could not save that change because local storage is full or unavailable.'

export function favoriteKey(stream: StreamItem): string {
  return `${stream.section}:${stream.streamType ?? 'stream'}:${stream.id}`
}

export function loadProfile(): XtreamProfile | null {
  const active = readJson<XtreamProfile | null>(ACTIVE_PROFILE_KEY, null)

  if (active && isProfile(active)) {
    const profiles = loadProfiles()

    if (!profiles.some((profile) => profile.id === active.id)) {
      saveProfiles([...profiles, active])
    }

    return active
  }

  const fallback = loadProfiles()[0] ?? null

  if (fallback) {
    writeJson(ACTIVE_PROFILE_KEY, fallback)
  }

  return fallback
}

export function loadProfiles(): XtreamProfile[] {
  const saved = readJson<unknown>(PROFILES_KEY, [])
  return Array.isArray(saved) ? saved.filter(isProfile) : []
}

export function profileSummaries(): ProfileSummary[] {
  return loadProfiles().map(({ id, name }) => ({ id, name }))
}

export function saveProfile(profile: XtreamProfile): boolean {
  const profiles = loadProfiles()
  const nextProfiles = [...profiles.filter((candidate) => candidate.id !== profile.id), profile]
  return saveProfiles(nextProfiles) && writeJson(ACTIVE_PROFILE_KEY, profile)
}

export function selectProfile(profileId: string): XtreamProfile | null {
  const profile = loadProfiles().find((candidate) => candidate.id === profileId) ?? null

  if (profile && !writeJson(ACTIVE_PROFILE_KEY, profile)) {
    return null
  }

  return profile
}

export function removeProfile(profileId: string): void {
  const profiles = loadProfiles()
  saveProfiles(profiles.filter((profile) => profile.id !== profileId))
  removeStoredItem(favoritesKey(profileId))
  removeStoredItem(resumeKey(profileId))

  const active = readJson<XtreamProfile | null>(ACTIVE_PROFILE_KEY, null)

  if (active?.id === profileId) {
    const fallback = profiles.find((profile) => profile.id !== profileId) ?? null

    if (fallback) {
      writeJson(ACTIVE_PROFILE_KEY, fallback)
    } else {
      removeStoredItem(ACTIVE_PROFILE_KEY)
    }
  }
}

export function clearProfile(): void {
  removeStoredItem(ACTIVE_PROFILE_KEY)
}

export function loadSettings(profileId: string): AppSettings {
  const allSettings = readJson<Record<string, Partial<AppSettings>>>(SETTINGS_KEY, {})
  const saved = allSettings[profileId]

  return {
    ...DEFAULT_SETTINGS,
    ...(saved ?? {}),
    bufferSeconds: clampBufferSeconds(saved?.bufferSeconds),
    preferHls: saved?.preferHls ?? DEFAULT_SETTINGS.preferHls,
    timeFormat: saved?.timeFormat === '12h' ? '12h' : '24h',
    hideAdultContent: saved?.hideAdultContent ?? DEFAULT_SETTINGS.hideAdultContent,
    parentalPin: typeof saved?.parentalPin === 'string' ? saved.parentalPin : undefined,
  }
}

export function saveSettings(profileId: string, settings: AppSettings): boolean {
  const allSettings = readJson<Record<string, Partial<AppSettings>>>(SETTINGS_KEY, {})
  allSettings[profileId] = {
    ...settings,
    bufferSeconds: clampBufferSeconds(settings.bufferSeconds),
  }
  return writeJson(SETTINGS_KEY, allSettings)
}

export function favoriteKeyForProfile(profileId: string): string {
  return favoritesKey(profileId)
}

export function loadFavorites(profileId: string): Map<string, FavoriteEntry> {
  const key = favoritesKey(profileId)
  const raw = readStoredItem(key) ?? migrateLegacyValue(LEGACY_FAVORITES_KEY, key)
  const saved = parseJson<unknown>(raw, [])

  if (!Array.isArray(saved)) {
    return new Map()
  }

  const favorites = new Map<string, FavoriteEntry>()

  saved.forEach((entry) => {
    if (typeof entry === 'string') {
      const key = `legacy:${entry}`
      favorites.set(key, { key, updatedAt: 0 })
      return
    }

    if (
      typeof entry !== 'object' ||
      entry === null ||
      !('key' in entry) ||
      typeof entry.key !== 'string'
    ) {
      return
    }

    const candidate = entry as Partial<FavoriteEntry>
    const stream = isStreamItem(candidate.stream) ? toStoredStream(candidate.stream) : undefined
    const key = entry.key

    favorites.set(key, {
      key,
      stream,
      updatedAt:
        typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt)
          ? candidate.updatedAt
          : 0,
    })
  })

  return favorites
}

export function saveFavorites(profileId: string, favorites: Map<string, FavoriteEntry>): boolean {
  const recentFavorites = [...favorites.values()]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_FAVORITES)
    .map((entry) => ({
      key: entry.key,
      stream: entry.stream ? toStoredStream(entry.stream) : undefined,
      updatedAt: entry.updatedAt,
    }))

  return persistEntries(favoritesKey(profileId), recentFavorites, favorites, (entry) => entry.key)
}

export function isFavorite(favorites: Map<string, FavoriteEntry>, stream: StreamItem): boolean {
  return favorites.has(favoriteKey(stream)) || favorites.has(`legacy:${stream.id}`)
}

export function toggleFavorite(
  favorites: Map<string, FavoriteEntry>,
  stream: StreamItem,
): boolean {
  const key = favoriteKey(stream)
  const legacyKey = `legacy:${stream.id}`

  if (favorites.has(key) || favorites.has(legacyKey)) {
    favorites.delete(key)
    favorites.delete(legacyKey)
    return false
  }

  favorites.set(key, { key, stream: toStoredStream(stream), updatedAt: Date.now() })
  return true
}

export function favoriteStreams(favorites: Map<string, FavoriteEntry>): StreamItem[] {
  return [...favorites.values()]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .flatMap((favorite) => (favorite.stream ? [favorite.stream] : []))
}

export function hydrateFavorites(
  favorites: Map<string, FavoriteEntry>,
  streams: StreamItem[],
): boolean {
  let changed = false

  streams.forEach((stream) => {
    const key = favoriteKey(stream)
    const legacyKey = `legacy:${stream.id}`
    const existing = favorites.get(key) ?? favorites.get(legacyKey)

    if (!existing || (existing.key === key && existing.stream)) {
      return
    }

    favorites.delete(legacyKey)
    favorites.set(key, {
      key,
      stream: toStoredStream(stream),
      updatedAt: existing.updatedAt || Date.now(),
    })
    changed = true
  })

  return changed
}

export function loadResume(profileId: string): Map<string, ResumeEntry> {
  const key = resumeKey(profileId)
  const raw = readStoredItem(key) ?? migrateLegacyValue(LEGACY_RESUME_KEY, key)
  const saved = parseJson<unknown>(raw, [])

  if (!Array.isArray(saved)) {
    return new Map()
  }

  const entries = new Map<string, ResumeEntry>()

  saved.forEach((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return
    }

    const candidate = entry as Partial<ResumeEntry> & { streamId?: unknown }
    const position =
      typeof candidate.position === 'number' && Number.isFinite(candidate.position)
        ? candidate.position
        : null
    const updatedAt =
      typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt)
        ? candidate.updatedAt
        : null

    if (position === null || updatedAt === null) {
      return
    }

    const stream = isStreamItem(candidate.stream) ? toStoredStream(candidate.stream) : undefined
    const completed = candidate.completed === true

    if (typeof candidate.streamKey === 'string') {
      entries.set(candidate.streamKey, {
        streamKey: candidate.streamKey,
        position,
        updatedAt,
        stream,
        completed,
      })
      return
    }

    if (typeof candidate.streamId === 'string') {
      const streamKey = `legacy:${candidate.streamId}`
      entries.set(streamKey, { streamKey, position, updatedAt, stream, completed })
    }
  })

  return entries
}

export function saveResume(profileId: string, entries: Map<string, ResumeEntry>): boolean {
  const recentEntries = [...entries.values()]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_RESUME_ENTRIES)
    .map((entry) => ({
      streamKey: entry.streamKey,
      position: entry.position,
      updatedAt: entry.updatedAt,
      stream: entry.stream ? toStoredStream(entry.stream) : undefined,
      completed: entry.completed === true,
    }))

  return persistEntries(resumeKey(profileId), recentEntries, entries, (entry) => entry.streamKey)
}

export function continueWatching(entries: Map<string, ResumeEntry>): ResumeEntry[] {
  return [...entries.values()]
    .filter((entry) => entry.stream && !entry.completed)
    .sort((left, right) => right.updatedAt - left.updatedAt)
}

function saveProfiles(profiles: XtreamProfile[]): boolean {
  return writeJson(PROFILES_KEY, profiles)
}

function favoritesKey(profileId: string): string {
  return `nova-play.favorites.${profileId}`
}

function resumeKey(profileId: string): string {
  return `nova-play.resume.${profileId}`
}

function toStoredStream(stream: StreamItem): StreamItem {
  return {
    id: stream.id,
    name: stream.name,
    section: stream.section,
    categoryId: stream.categoryId,
    icon: stream.icon,
    cover: stream.cover,
    rating: stream.rating,
    year: stream.year,
    added: stream.added,
    containerExtension: stream.containerExtension,
    streamType: stream.streamType,
    seriesId: stream.seriesId,
    channelNumber: stream.channelNumber,
    catchup: stream.catchup,
    directSource: stream.directSource,
    season: stream.season,
    episodeNumber: stream.episodeNumber,
    searchName: stream.searchName ?? stream.name.toLocaleLowerCase(),
  }
}

function persistEntries<T>(
  key: string,
  entries: T[],
  source: Map<string, unknown>,
  entryKey: (entry: T) => string,
): boolean {
  if (!entries.length) {
    return writeJson(key, [])
  }

  let count = entries.length

  while (count > 0) {
    const retained = entries.slice(0, count)

    if (writeJson(key, retained)) {
      const evictedEntries = entries.slice(count)

      if (evictedEntries.length) {
        evictedEntries.forEach((entry) => source.delete(entryKey(entry)))
      }

      return evictedEntries.length === 0
    }

    count = Math.floor(count / 2)
  }

  if (writeJson(key, [])) {
    source.clear()
  }

  return false
}

function migrateLegacyValue(legacyKey: string, scopedKey: string): string | null {
  const legacyValue = readStoredItem(legacyKey)

  if (legacyValue !== null && writeStoredItem(scopedKey, legacyValue)) {
    removeStoredItem(legacyKey)
  }

  return legacyValue
}

function readJson<T>(key: string, fallback: T): T {
  return parseJson(readStoredItem(key), fallback)
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) {
    return fallback
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    return writeStoredItem(key, JSON.stringify(value))
  } catch {
    return false
  }
}

function readStoredItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStoredItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function removeStoredItem(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Local storage can be disabled or unavailable on some webOS targets.
  }
}

function clampBufferSeconds(value: unknown): number {
  const numeric = typeof value === 'number' ? value : DEFAULT_SETTINGS.bufferSeconds

  if (!Number.isFinite(numeric)) {
    return DEFAULT_SETTINGS.bufferSeconds
  }

  return Math.min(60, Math.max(10, Math.round(numeric)))
}

function isProfile(value: unknown): value is XtreamProfile {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<XtreamProfile>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.serverUrl === 'string' &&
    typeof candidate.username === 'string' &&
    typeof candidate.password === 'string'
  )
}

function isStreamItem(value: unknown): value is StreamItem {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<StreamItem>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    (candidate.section === 'live' || candidate.section === 'vod' || candidate.section === 'series') &&
    typeof candidate.categoryId === 'string'
  )
}