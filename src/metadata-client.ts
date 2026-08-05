import type {
  AgeGuidance,
  EnrichedTitleMetadata,
  FilmographyCredit,
  PersonDetails,
  PersonSummary,
  RatingCandidate,
  RatingResolution,
  RelatedTitle,
} from './types'
import {
  ageGuidanceForRating,
  dedupeRatingCandidates,
  normalizeRatingCandidate,
  normalizeRegion,
  resolveContentRating,
} from './content-rating'
import { performanceTrace } from './performance-trace'

type JsonRecord = Record<string, unknown>

export type MetadataTitleRequest = {
  mediaType: 'movie' | 'tv'
  title: string
  originalTitle?: string
  year?: string
  tmdbId?: string
  signal?: AbortSignal
}

const REQUEST_TIMEOUT_MS = 8_000
const TITLE_CACHE_TTL_MS = 6 * 60 * 60_000
const PERSON_CACHE_TTL_MS = 24 * 60 * 60_000
const MAX_CACHE_ENTRIES = 120

type CacheEntry<Value> = {
  value: Value
  expiresAt: number
}

const titleCache = new Map<string, CacheEntry<EnrichedTitleMetadata | null>>()
const personCache = new Map<string, CacheEntry<PersonDetails>>()

function configuredBaseUrl(): string | null {
  const source = import.meta.env.VITE_METADATA_PROXY_URL

  if (typeof source !== 'string' || !source.trim()) {
    return null
  }

  try {
    const url = new URL(source)
    return url.protocol === 'https:' || url.hostname === 'localhost' ? url.toString().replace(/\/$/, '') : null
  } catch {
    return null
  }
}

function readRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readIdentifier(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return readString(value)
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function normalizeMediaType(value: unknown): 'movie' | 'tv' | null {
  return value === 'movie' || value === 'tv' ? value : null
}

function readPerson(value: unknown): PersonSummary | null {
  const source = readRecord(value)
  const id = readString(source.id)
  const name = readString(source.name)

  if (!id || !name) {
    return null
  }

  return {
    id,
    name,
    profileImage: readString(source.profileImage),
    character: readString(source.character),
    job: readString(source.job),
    department: readString(source.department),
  }
}

function readCredit(value: unknown): FilmographyCredit | null {
  const source = readRecord(value)
  const id = readString(source.id)
  const mediaType = normalizeMediaType(source.mediaType)
  const title = readString(source.title)

  if (!id || !mediaType || !title) {
    return null
  }

  return {
    id,
    mediaType,
    title,
    originalTitle: readString(source.originalTitle),
    year: readString(source.year),
    poster: readString(source.poster),
    character: readString(source.character),
    job: readString(source.job),
    rating: readString(source.rating),
  }
}

function readRelatedTitle(value: unknown): RelatedTitle | null {
  const credit = readCredit(value)

  if (!credit) {
    return null
  }

  return { ...credit, overview: readString(readRecord(value).overview) }
}

function readContentRating(value: unknown): RatingCandidate | undefined {
  const source = readRecord(value)
  const provider =
    source.provider === undefined
      ? 'tmdb'
      : source.provider === 'tmdb' || source.provider === 'trakt'
        ? source.provider
        : undefined

  if (!provider) {
    return undefined
  }

  return normalizeRatingCandidate({
    ...source,
    provider,
    sourceLabel:
      readString(source.sourceLabel) ??
      (provider === 'trakt' ? 'Trakt' : 'TMDB'),
    official: source.official === undefined ? true : source.official,
  })
}

function readRatingCandidates(value: unknown): RatingCandidate[] {
  return dedupeRatingCandidates(
    readArray(value)
      .map(normalizeRatingCandidate)
      .filter((candidate): candidate is RatingCandidate => Boolean(candidate)),
  )
}

function readAgeGuidance(value: unknown): AgeGuidance | undefined {
  const source = readRecord(value)
  const suggestedMinimumAge =
    typeof source.suggestedMinimumAge === 'number' &&
    Number.isInteger(source.suggestedMinimumAge) &&
    source.suggestedMinimumAge >= 0 &&
    source.suggestedMinimumAge <= 21
      ? source.suggestedMinimumAge
      : undefined
  const basis = source.basis
  const confidence = source.confidence

  if (
    suggestedMinimumAge === undefined ||
    (basis !== 'official-certification' && basis !== 'provider-value' && basis !== 'derived') ||
    (confidence !== 'high' && confidence !== 'medium' && confidence !== 'low')
  ) {
    return undefined
  }

  return {
    suggestedMinimumAge,
    basis,
    confidence,
    reasons: readArray(source.reasons)
      .map(readString)
      .filter((reason): reason is string => Boolean(reason))
      .slice(0, 8),
  }
}

function sameRating(left: RatingCandidate, right: RatingCandidate): boolean {
  return (
    left.provider === right.provider &&
    left.value === right.value &&
    left.system === right.system &&
    left.region === right.region &&
    left.retrievedRegion === right.retrievedRegion
  )
}

function readRatingResolution(
  value: unknown,
  candidates: RatingCandidate[],
): RatingResolution | undefined {
  const source = readRecord(value)
  const preferredRegion = normalizeRegion(source.preferredRegion)

  if (!preferredRegion) {
    return undefined
  }

  const normalizedCandidates = dedupeRatingCandidates([
    ...candidates,
    ...readRatingCandidates(source.candidates),
  ])
  const selected = normalizeRatingCandidate(source.selected)

  if (!selected || !normalizedCandidates.some((candidate) => sameRating(candidate, selected))) {
    return resolveContentRating(normalizedCandidates, preferredRegion)
  }

  return {
    selected,
    candidates: normalizedCandidates,
    ageGuidance: readAgeGuidance(source.ageGuidance) ?? ageGuidanceForRating(selected),
    preferredRegion,
    fallbackUsed: source.fallbackUsed === true,
  }
}

function titleFromPayload(value: unknown): EnrichedTitleMetadata | null {
  const source = readRecord(value)
  const tmdbId = readString(source.tmdbId)
  const mediaType = normalizeMediaType(source.mediaType)

  if (!tmdbId || !mediaType) {
    return null
  }

  const legacyContentRating = readContentRating(source.contentRating)
  const contentRatings = dedupeRatingCandidates([
    ...readRatingCandidates(source.contentRatings),
    ...(legacyContentRating && !Array.isArray(source.contentRatings) ? [legacyContentRating] : []),
  ])
  const ratingResolution = readRatingResolution(source.ratingResolution, contentRatings)
  const selectedRating = ratingResolution?.selected ?? legacyContentRating
  const ageGuidance =
    ratingResolution?.ageGuidance ??
    readAgeGuidance(source.ageGuidance) ??
    (selectedRating ? ageGuidanceForRating(selectedRating) : undefined)

  return {
    tmdbId,
    mediaType,
    tagline: readString(source.tagline),
    ...(selectedRating ? { contentRating: selectedRating } : {}),
    ...(ageGuidance ? { ageGuidance } : {}),
    ...(contentRatings.length ? { contentRatings } : {}),
    ...(ratingResolution ? { ratingResolution } : {}),
    cast: readArray(source.cast).map(readPerson).filter((person): person is PersonSummary => Boolean(person)),
    crew: readArray(source.crew).map(readPerson).filter((person): person is PersonSummary => Boolean(person)),
    related: readArray(source.related)
      .map(readRelatedTitle)
      .filter((title): title is RelatedTitle => Boolean(title)),
  }
}

function personFromPayload(value: unknown): PersonDetails | null {
  const source = readRecord(value)
  const summary = readPerson(source)

  if (!summary) {
    return null
  }

  const profiles = readArray(source.externalProfiles)
    .map((profile) => {
      const data = readRecord(profile)
      const label = readString(data.label)
      const url = readString(data.url)

      return label && url && /^https:\/\//i.test(url) ? { label, url } : null
    })
    .filter((profile): profile is { label: string; url: string } => Boolean(profile))

  return {
    ...summary,
    biography: readString(source.biography),
    birthday: readString(source.birthday),
    deathday: readString(source.deathday),
    placeOfBirth: readString(source.placeOfBirth),
    knownForDepartment: readString(source.knownForDepartment),
    homepage: readString(source.homepage),
    externalProfiles: profiles,
    knownFor: readArray(source.knownFor)
      .map(readCredit)
      .filter((credit): credit is FilmographyCredit => Boolean(credit)),
    credits: readArray(source.credits)
      .map(readCredit)
      .filter((credit): credit is FilmographyCredit => Boolean(credit)),
  }
}

function cacheRead<Value>(cache: Map<string, CacheEntry<Value>>, key: string): Value | undefined {
  const entry = cache.get(key)

  if (!entry || entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return undefined
  }

  cache.delete(key)
  cache.set(key, entry)
  return entry.value
}

function cacheWrite<Value>(
  cache: Map<string, CacheEntry<Value>>,
  key: string,
  value: Value,
  ttl: number,
): void {
  cache.delete(key)
  cache.set(key, { value, expiresAt: Date.now() + ttl })

  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value

    if (!oldest) {
      break
    }

    cache.delete(oldest)
  }
}

async function requestJson(
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<unknown> {
  const baseUrl = configuredBaseUrl()
  const requestId = performanceTrace.beginRequest('metadata-request', {
    route: path,
    configured: Boolean(baseUrl),
  })

  if (!baseUrl) {
    performanceTrace.endRequest(requestId, {
      route: path,
      configured: false,
      outcome: 'unconfigured',
    })
    throw new Error('Metadata service is not configured.')
  }

  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const forwardAbort = () => controller.abort()
  signal?.addEventListener('abort', forwardAbort, { once: true })

  try {
    performanceTrace.event('network', 'metadata-fetch-start', {
      route: path,
      method: init.method ?? 'GET',
    }, { requestId: requestId ?? undefined })
    const response = await fetch(`${baseUrl}${path}`, { ...init, signal: controller.signal })

    performanceTrace.event(
      'network',
      'metadata-response-headers',
      {
        route: path,
        status: response.status,
        contentLength: Number(response.headers.get('content-length')) || 0,
      },
      { requestId: requestId ?? undefined },
    )

    if (!response.ok) {
      throw new Error(response.status === 404 ? 'Metadata was not found.' : 'Metadata service is unavailable.')
    }

    return await performanceTrace.measureAsync(
      'data',
      'metadata-json-parse',
      () => response.json(),
      { route: path },
      { requestId: requestId ?? undefined },
    )
  } finally {
    performanceTrace.endRequest(requestId, {
      route: path,
      aborted: controller.signal.aborted,
    })
    globalThis.clearTimeout(timeout)
    signal?.removeEventListener('abort', forwardAbort)
  }
}

export function metadataServiceConfigured(): boolean {
  return configuredBaseUrl() !== null
}

export async function loadTitleMetadata(
  request: MetadataTitleRequest,
): Promise<EnrichedTitleMetadata | null> {
  const lookup = request.tmdbId
    ? `id:${request.mediaType}:${request.tmdbId}`
    : `search:${request.mediaType}:${request.title}:${request.year ?? ''}`.toLocaleLowerCase()
  const cached = cacheRead(titleCache, lookup)

  if (cached !== undefined) {
    performanceTrace.event('cache', 'metadata-title-hit')
    return cached
  }

  performanceTrace.event('cache', 'metadata-title-miss')
  const payload = await requestJson(
    '/v1/resolve-title',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mediaType: request.mediaType,
        title: request.title,
        originalTitle: request.originalTitle,
        year: request.year,
        tmdbId: request.tmdbId,
      }),
    },
    request.signal,
  )
  const metadata = performanceTrace.measure(
    'data',
    'metadata-title-normalize',
    () => titleFromPayload(payload),
  )
  performanceTrace.event('metadata', 'title-result', {
    found: Boolean(metadata),
    castCount: metadata?.cast?.length ?? 0,
    crewCount: metadata?.crew?.length ?? 0,
    ratingCount: metadata?.contentRatings?.length ?? 0,
  })
  cacheWrite(titleCache, lookup, metadata, TITLE_CACHE_TTL_MS)
  return metadata
}

export async function loadTvMazeSeriesMetadata(
  title: string,
  signal?: AbortSignal,
): Promise<EnrichedTitleMetadata | null> {
  const normalizedTitle = title.trim()
  const cacheKey = `tvmaze:${normalizedTitle.toLocaleLowerCase()}`
  const cached = cacheRead(titleCache, cacheKey)

  if (cached !== undefined) {
    performanceTrace.event('cache', 'metadata-tvmaze-hit')
    return cached
  }

  performanceTrace.event('cache', 'metadata-tvmaze-miss')

  if (!normalizedTitle) {
    return null
  }

  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const forwardAbort = () => controller.abort()
  signal?.addEventListener('abort', forwardAbort, { once: true })

  try {
    const requestId = performanceTrace.beginRequest('tvmaze-search')
    const searchResponse = await fetch(
      `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(normalizedTitle)}`,
      { signal: controller.signal },
    )
    performanceTrace.endRequest(requestId, {
      status: searchResponse.status,
      aborted: controller.signal.aborted,
    })

    if (!searchResponse.ok) {
      cacheWrite(titleCache, cacheKey, null, TITLE_CACHE_TTL_MS)
      return null
    }

    const searchResults = readArray(await searchResponse.json())
    const normalizedQuery = normalizedTitle.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const show =
      searchResults
        .map((entry) => readRecord(readRecord(entry).show))
        .find((candidate) => {
          const name = readString(candidate.name)?.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
          return name === normalizedQuery
        }) ??
      readRecord(readRecord(searchResults[0]).show)
    const showId = readIdentifier(show.id)
    const showName = readString(show.name)

    if (!showId || !showName) {
      cacheWrite(titleCache, cacheKey, null, TITLE_CACHE_TTL_MS)
      return null
    }

    const castRequestId = performanceTrace.beginRequest('tvmaze-cast')
    const castResponse = await fetch(
      `https://api.tvmaze.com/shows/${encodeURIComponent(showId)}/cast`,
      { signal: controller.signal },
    )
    performanceTrace.endRequest(castRequestId, {
      status: castResponse.status,
      aborted: controller.signal.aborted,
    })
    const castPayload = castResponse.ok ? await castResponse.json() : []
    const cast = readArray(castPayload)
      .map((entry): PersonSummary | null => {
        const credit = readRecord(entry)
        const person = readRecord(credit.person)
        const personId = readIdentifier(person.id)
        const name = readString(person.name)

        if (!personId || !name) {
          return null
        }

        return {
          id: `tvmaze-${personId}`,
          name,
          profileImage: readString(readRecord(person.image).medium ?? readRecord(person.image).original),
          character: readString(readRecord(credit.character).name),
          department: 'Acting',
        }
      })
      .filter((person): person is PersonSummary => Boolean(person))
      .slice(0, 12)

    const metadata: EnrichedTitleMetadata = {
      tmdbId: `tvmaze-${showId}`,
      mediaType: 'tv',
      cast,
      crew: [],
      related: [],
    }

    performanceTrace.event('metadata', 'tvmaze-result', {
      castCount: cast.length,
    })
    cacheWrite(titleCache, cacheKey, metadata, TITLE_CACHE_TTL_MS)
    return metadata
  } finally {
    globalThis.clearTimeout(timeout)
    signal?.removeEventListener('abort', forwardAbort)
  }
}

export async function loadPersonMetadata(
  personId: string,
  signal?: AbortSignal,
): Promise<PersonDetails> {
  const cached = cacheRead(personCache, personId)

  if (cached) {
    performanceTrace.event('cache', 'metadata-person-hit')
    return cached
  }

  performanceTrace.event('cache', 'metadata-person-miss')
  const payload = await requestJson(`/v1/person/${encodeURIComponent(personId)}`, { method: 'GET' }, signal)
  const person = performanceTrace.measure(
    'data',
    'metadata-person-normalize',
    () => personFromPayload(payload),
  )

  if (!person) {
    throw new Error('Person metadata is unavailable.')
  }

  cacheWrite(personCache, personId, person, PERSON_CACHE_TTL_MS)
  return person
}

// ---------------------------------------------------------------------------
// Public-source EPG (Worker `/v1/epg`).
//
// Used only as a fallback when the provider host serves no guide but channels
// carry an identifier. The identifier is the join key; its trailing country
// code selects the region source file. Results are labelled as public.
// ---------------------------------------------------------------------------

export type PublicProgram = {
  title: string
  description?: string
  start: Date
  end: Date
}

export type PublicNowNext = { now?: PublicProgram; next?: PublicProgram }

/**
 * Region token for a guide identifier, e.g. "NPO.1.nl" -> "NL1". Public sources
 * shard by country; the numeric "1" is the primary shard. Returns null when the
 * identifier has no recognizable trailing country code.
 */
export function regionForIdentifier(identifier: string): string | null {
  const match = identifier.trim().match(/\.([A-Za-z]{2,3})$/)
  if (!match) {
    return null
  }
  return `${match[1].toUpperCase()}1`
}

function readPublicProgram(value: unknown): PublicProgram | null {
  const source = readRecord(value)
  const start = Number(source.start)
  const stop = Number(source.stop)
  if (!Number.isFinite(start) || !Number.isFinite(stop) || stop <= start) {
    return null
  }
  return {
    title: readString(source.title) ?? '',
    description: readString(source.description),
    start: new Date(start * 1000),
    end: new Date(stop * 1000),
  }
}

async function requestPublicEpg(
  region: string,
  identifiers: string[],
  limit: number,
  signal?: AbortSignal,
): Promise<Map<string, PublicProgram[]>> {
  const query =
    `/v1/epg?region=${encodeURIComponent(region)}` +
    `&ids=${encodeURIComponent(identifiers.join(','))}` +
    `&limit=${encodeURIComponent(String(limit))}`
  const payload = readRecord(await requestJson(query, { method: 'GET' }, signal))
  const channels = readRecord(payload.channels)
  const result = new Map<string, PublicProgram[]>()

  for (const [id, listings] of Object.entries(channels)) {
    const programs = readArray(listings)
      .map(readPublicProgram)
      .filter((program): program is PublicProgram => program !== null)
    result.set(id, programs)
  }

  return result
}

/** Full public schedule for one identifier, or null when the route can't serve it. */
export async function loadPublicSchedule(
  identifier: string,
  limit: number,
  signal?: AbortSignal,
): Promise<PublicProgram[] | null> {
  if (!metadataServiceConfigured()) {
    return null
  }
  const region = regionForIdentifier(identifier)
  if (!region) {
    return null
  }
  try {
    const channels = await requestPublicEpg(region, [identifier], limit, signal)
    return channels.get(identifier) ?? null
  } catch {
    return null
  }
}

/** Public now/next for one identifier, derived from the schedule around now. */
export async function loadPublicNowNext(
  identifier: string,
  signal?: AbortSignal,
): Promise<PublicNowNext | null> {
  const programs = await loadPublicSchedule(identifier, 8, signal)
  if (!programs || !programs.length) {
    return null
  }
  const now = Date.now()
  const sorted = [...programs].sort((left, right) => left.start.getTime() - right.start.getTime())
  const current = sorted.find(
    (program) => program.start.getTime() <= now && program.end.getTime() > now,
  )
  const next = sorted.find((program) => program.start.getTime() > now)
  return { now: current, next }
}