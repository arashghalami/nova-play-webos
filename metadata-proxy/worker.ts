import {
  dedupeRatingCandidates,
  normalizeRatingCandidate,
  resolveContentRating,
} from '../src/content-rating'
import type { RatingCandidate } from '../src/types'

export interface Env {
  TMDB_BEARER_TOKEN: string
  TRAKT_CLIENT_ID?: string
  ALLOWED_ORIGIN?: string
  ALLOWED_ORIGINS?: string
  METADATA_LANGUAGE?: string
  METADATA_REGION?: string
}

type MediaType = 'movie' | 'tv'
type JsonRecord = Record<string, unknown>

const TMDB_API = 'https://api.themoviedb.org/3'
const TMDB_IMAGE = 'https://image.tmdb.org/t/p'
const MAX_PEOPLE = 12
const MAX_CREW = 8
const MAX_RELATED = 10
const MAX_CREDITS = 30
const CACHE_SECONDS = 60 * 60 * 6
const METADATA_TIMEOUT_MS = 6_000
const MAX_RATING_CANDIDATES = 16

const allowedExternalHosts = new Map<string, string>([
  ['www.imdb.com', 'IMDb'],
  ['imdb.com', 'IMDb'],
  ['www.instagram.com', 'Instagram'],
  ['instagram.com', 'Instagram'],
  ['www.facebook.com', 'Facebook'],
  ['facebook.com', 'Facebook'],
  ['twitter.com', 'X'],
  ['x.com', 'X'],
])

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      ...headers,
    },
  })
}

function withCors(response: Response, cors: HeadersInit): Response {
  const headers = new Headers(response.headers)

  Object.entries(cors).forEach(([name, value]) => {
    headers.set(name, value)
  })

  return new Response(response.body, { status: response.status, headers })
}

function configuredOrigins(env: Env): Set<string> {
  return new Set(
    [env.ALLOWED_ORIGINS, env.ALLOWED_ORIGIN]
      .flatMap((value) => value?.split(',') ?? [])
      .map((value) => value.trim())
      .filter(Boolean),
  )
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get('Origin')
  const allowedOrigins = configuredOrigins(env)

  if (origin && allowedOrigins.has(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
    }
  }

  return { Vary: 'Origin' }
}

function readRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readNumberString(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : readString(value)
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function validMediaType(value: unknown): value is MediaType {
  return value === 'movie' || value === 'tv'
}

function validId(value: string): boolean {
  return /^\d{1,16}$/.test(value)
}

function image(path: unknown, width: 'w185' | 'w342' | 'w500' | 'original'): string | undefined {
  const source = readString(path)
  return source?.startsWith('/') ? `${TMDB_IMAGE}/${width}${source}` : undefined
}

function year(date: unknown): string | undefined {
  const source = readString(date)
  return source?.match(/^\d{4}/)?.[0]
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = METADATA_TIMEOUT_MS,
): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { ...init, signal: controller.signal })

    if (!response.ok) {
      console.warn('Upstream metadata request failed', {
        service: new URL(url).hostname,
        status: response.status,
      })
      throw new Response(null, { status: response.status })
    }

    return await response.json()
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Metadata request timed out.')
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function tmdbRatingCandidates(value: unknown, mediaType: MediaType): RatingCandidate[] {
  const rawCandidates: unknown[] = []

  for (const entry of readArray(readRecord(value).results)) {
    const result = readRecord(entry)
    const region = readString(result.iso_3166_1)?.toUpperCase()

    if (!region) {
      continue
    }

    const values =
      mediaType === 'movie'
        ? readArray(result.release_dates)
            .map((release) => readString(readRecord(release).certification))
            .filter((rating): rating is string => Boolean(rating))
        : [readString(result.rating)].filter((rating): rating is string => Boolean(rating))

    values.forEach((rating) => {
      rawCandidates.push({
        value: rating,
        region,
        retrievedRegion: region,
        provider: 'tmdb',
        sourceLabel: 'TMDB',
        official: true,
      })
    })
  }

  return dedupeRatingCandidates(
    rawCandidates
      .map(normalizeRatingCandidate)
      .filter((candidate): candidate is RatingCandidate => Boolean(candidate)),
  ).slice(0, MAX_RATING_CANDIDATES)
}

function normalizedTitle(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function titleFor(source: JsonRecord, mediaType: MediaType): string | undefined {
  return readString(mediaType === 'movie' ? source.title : source.name)
}

function originalTitleFor(source: JsonRecord, mediaType: MediaType): string | undefined {
  return readString(mediaType === 'movie' ? source.original_title : source.original_name)
}

async function tmdb(env: Env, path: string, language: string): Promise<JsonRecord> {
  const token = (env.TMDB_BEARER_TOKEN || '')
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/[^a-zA-Z0-9._-]/g, '')
  const isV3Key = Boolean(token && /^[a-f0-9]{32}$/i.test(token))
  const hasQuery = path.includes('?')
  const langParam = path.includes('language=') ? '' : `${hasQuery ? '&' : '?'}language=${encodeURIComponent(language)}`
  const keyParam = isV3Key ? `${hasQuery || langParam ? '&' : '?'}api_key=${token}` : ''
  const url = `${TMDB_API}${path}${langParam}${keyParam}`

  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  if (token && !isV3Key) {
    headers.Authorization = `Bearer ${token}`
  }

  return readRecord(
    await fetchJsonWithTimeout(url, { headers }),
  )
}

function traktHeaders(env: Env): HeadersInit | null {
  const clientId = env.TRAKT_CLIENT_ID?.trim()

  return clientId
    ? {
        'trakt-api-key': clientId,
        'trakt-api-version': '2',
        Accept: 'application/json',
      }
    : null
}

function traktClassification(value: JsonRecord): string | undefined {
  return readString(value.certification ?? value.content_rating ?? value.contentRating)
}

async function traktRatingCandidate(
  env: Env,
  lookup: { tmdbId: string; title?: string; originalTitle?: string; year?: string },
  mediaType: MediaType,
): Promise<RatingCandidate | undefined> {
  const headers = traktHeaders(env)

  if (!headers) {
    return undefined
  }

  const itemKey = mediaType === 'movie' ? 'movie' : 'show'
  const traktType = mediaType === 'movie' ? 'movie' : 'show'
  let results: unknown[] = []

  try {
    const byTmdb = await fetchJsonWithTimeout(
      `https://api.trakt.tv/search/tmdb/${encodeURIComponent(lookup.tmdbId)}?type=${traktType}`,
      { headers },
    )
    results = readArray(byTmdb)
  } catch {
    // A title lookup below can still safely recover from an unavailable Trakt TMDB-ID route.
  }

  if (!results.length) {
    const searchTitle = lookup.title ?? lookup.originalTitle

    if (!searchTitle) {
      return undefined
    }

    try {
      const searched = await fetchJsonWithTimeout(
        `https://api.trakt.tv/search/${traktType}?query=${encodeURIComponent(searchTitle)}`,
        { headers },
      )
      const expectedTitles = new Set(
        [lookup.title, lookup.originalTitle].map(normalizedTitle).filter(Boolean),
      )

      results = readArray(searched).filter((entry) => {
        const item = readRecord(readRecord(entry)[itemKey])
        const candidateTitle = normalizedTitle(readString(item.title))
        const candidateYear = readNumberString(item.year)

        return (
          expectedTitles.has(candidateTitle) &&
          (!lookup.year || candidateYear === lookup.year)
        )
      })
    } catch {
      return undefined
    }
  }

  const result = readRecord(results[0])
  const item = readRecord(result[itemKey])
  const value = traktClassification(item)
  const region = readString(item.country ?? item.certification_country)?.toUpperCase()

  return normalizeRatingCandidate({
    value,
    region,
    retrievedRegion: region,
    provider: 'trakt',
    sourceLabel: 'Trakt',
    official: Boolean(value),
  })
}

async function resolveExternalRatings(
  env: Env,
  classifications: Promise<JsonRecord>,
  lookup: { tmdbId: string; title?: string; originalTitle?: string; year?: string },
  mediaType: MediaType,
): Promise<ReturnType<typeof resolveContentRating>> {
  const [tmdbResult, traktResult] = await Promise.allSettled([
    classifications.then((payload) => tmdbRatingCandidates(payload, mediaType)),
    traktRatingCandidate(env, lookup, mediaType),
  ])
  const candidates = dedupeRatingCandidates([
    ...(tmdbResult.status === 'fulfilled' ? tmdbResult.value : []),
    ...(traktResult.status === 'fulfilled' && traktResult.value ? [traktResult.value] : []),
  ]).slice(0, MAX_RATING_CANDIDATES)

  return resolveContentRating(
    candidates,
    env.METADATA_REGION?.trim().toUpperCase() || 'NL',
  )
}

function personSummary(value: unknown): JsonRecord | null {
  const source = readRecord(value)
  const id = readNumberString(source.id)
  const name = readString(source.name)

  if (!id || !name) {
    return null
  }

  return {
    id,
    name,
    profileImage: image(source.profile_path, 'w185'),
    character: readString(source.character),
    job: readString(source.job),
    department: readString(source.known_for_department) ?? readString(source.department),
  }
}

function credit(value: unknown): JsonRecord | null {
  const source = readRecord(value)
  const mediaType = source.media_type === 'tv' ? 'tv' : source.media_type === 'movie' ? 'movie' : null
  const id = readNumberString(source.id)

  if (!mediaType || !id) {
    return null
  }

  const title = titleFor(source, mediaType)

  if (!title) {
    return null
  }

  return {
    id,
    mediaType,
    title,
    originalTitle: originalTitleFor(source, mediaType),
    year: year(mediaType === 'movie' ? source.release_date : source.first_air_date),
    poster: image(source.poster_path, 'w342'),
    character: readString(source.character),
    job: readString(source.job),
    rating: readNumberString(source.vote_average),
  }
}

async function resolveTitle(request: Request, env: Env): Promise<Response> {
  const body = readRecord(await request.json())
  const mediaType = body.mediaType

  if (!validMediaType(mediaType)) {
    return json({ error: 'mediaType must be movie or tv.' }, 400)
  }

  const suppliedId = readString(body.tmdbId)
  const title = readString(body.title)
  const originalTitle = readString(body.originalTitle)
  const suppliedYear = readString(body.year)?.slice(0, 4)
  const language = env.METADATA_LANGUAGE?.trim() || 'en-US'

  if (suppliedId && !validId(suppliedId)) {
    return json({ error: 'Invalid TMDB ID.' }, 400)
  }

  if (!suppliedId && (!title || title.length > 180)) {
    return json({ error: 'A title of up to 180 characters is required.' }, 400)
  }

  let tmdbId = suppliedId

  if (!tmdbId) {
    const params = new URLSearchParams({
      query: title!,
      include_adult: 'false',
      language,
    })

    if (suppliedYear && /^\d{4}$/.test(suppliedYear)) {
      params.set(mediaType === 'movie' ? 'year' : 'first_air_date_year', suppliedYear)
    }

    const search = await tmdb(env, `/search/${mediaType}?${params}`, language)
    const candidates = readArray(search.results).map(readRecord)
    const requestedTitles = new Set(
      [title, originalTitle]
        .map(normalizedTitle)
        .filter(Boolean),
    )
    const candidate =
      candidates.find((result) => {
        const candidateTitle = normalizedTitle(titleFor(result, mediaType))
        const candidateOriginalTitle = normalizedTitle(originalTitleFor(result, mediaType))

        return requestedTitles.has(candidateTitle) || requestedTitles.has(candidateOriginalTitle)
      }) ?? candidates[0]

    tmdbId = readNumberString(candidate?.id)
  }

  if (!tmdbId) {
    return json({}, 404)
  }

  const classificationPath = mediaType === 'movie' ? 'release_dates' : 'content_ratings'
  const classifications = tmdb(
    env,
    `/${mediaType}/${tmdbId}/${classificationPath}`,
    language,
  )
  const [detailsResult, creditsResult, recommendationsResult, ratingsResult] =
    await Promise.allSettled([
      tmdb(env, `/${mediaType}/${tmdbId}`, language),
      tmdb(env, `/${mediaType}/${tmdbId}/credits`, language),
      tmdb(env, `/${mediaType}/${tmdbId}/recommendations`, language),
      resolveExternalRatings(
        env,
        classifications,
        { tmdbId, title, originalTitle, year: suppliedYear },
        mediaType,
      ),
    ])

  if (detailsResult.status === 'rejected') {
    throw detailsResult.reason
  }

  const details = detailsResult.value
  const credits =
    creditsResult.status === 'fulfilled' ? creditsResult.value : {}
  const recommendations =
    recommendationsResult.status === 'fulfilled'
      ? recommendationsResult.value
      : {}
  const ratingResolution =
    ratingsResult.status === 'fulfilled'
      ? ratingsResult.value
      : resolveContentRating(
          [],
          env.METADATA_REGION?.trim().toUpperCase() || 'NL',
        )

  const cast = readArray(credits.cast)
    .map(personSummary)
    .filter((person): person is JsonRecord => Boolean(person))
    .slice(0, MAX_PEOPLE)
  const crew = readArray(credits.crew)
    .map(personSummary)
    .filter((person): person is JsonRecord => Boolean(person))
    .filter((person) => ['Director', 'Creator', 'Writer', 'Screenplay'].includes(String(person.job)))
    .slice(0, MAX_CREW)
  const related = readArray(recommendations.results)
    .map((entry) => {
      const data = readRecord(entry)
      const relatedTitle = titleFor(data, mediaType)
      const id = readNumberString(data.id)

      return relatedTitle && id
        ? {
            id,
            mediaType,
            title: relatedTitle,
            originalTitle: originalTitleFor(data, mediaType),
            year: year(mediaType === 'movie' ? data.release_date : data.first_air_date),
            poster: image(data.poster_path, 'w342'),
            rating: readNumberString(data.vote_average),
            overview: readString(data.overview),
          }
        : null
    })
    .filter((entry) => entry !== null)
    .slice(0, MAX_RELATED)

  return json({
    tmdbId,
    mediaType,
    title: titleFor(details, mediaType),
    originalTitle: originalTitleFor(details, mediaType),
    // The title's own poster (w342), built the same credential-free way as
    // related[].poster. Lets the client backfill catalog artwork for provider
    // items that shipped only a degenerate thumbnail.
    poster: image(details.poster_path, 'w342'),
    tagline: readString(details.tagline),
    contentRatings: ratingResolution.candidates,
    ratingResolution,
    ...(ratingResolution.selected ? { contentRating: ratingResolution.selected } : {}),
    ...(ratingResolution.ageGuidance ? { ageGuidance: ratingResolution.ageGuidance } : {}),
    cast,
    crew,
    related,
  })
}

async function personDetails(personId: string, env: Env): Promise<Response> {
  if (!validId(personId)) {
    return json({ error: 'Invalid person ID.' }, 400)
  }

  const language = env.METADATA_LANGUAGE?.trim() || 'en-US'
  const [person, credits, externalIds] = await Promise.all([
    tmdb(env, `/person/${personId}`, language),
    tmdb(env, `/person/${personId}/combined_credits`, language),
    tmdb(env, `/person/${personId}/external_ids`, language),
  ])
  const knownFor = readArray(credits.cast)
    .map(credit)
    .filter((entry): entry is JsonRecord => Boolean(entry))
    .sort((left, right) => Number(right.rating ?? 0) - Number(left.rating ?? 0))
    .slice(0, MAX_RELATED)
  const allCredits = [...readArray(credits.cast), ...readArray(credits.crew)]
    .map(credit)
    .filter((entry): entry is JsonRecord => Boolean(entry))
    .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.id === entry.id && candidate.mediaType === entry.mediaType) === index)
    .sort((left, right) => String(right.year ?? '').localeCompare(String(left.year ?? '')))
    .slice(0, MAX_CREDITS)
  const externalProfiles = externalLinks(person, externalIds)

  return json({
    id: personId,
    name: readString(person.name),
    profileImage: image(person.profile_path, 'w500'),
    biography: readString(person.biography),
    birthday: readString(person.birthday),
    deathday: readString(person.deathday),
    placeOfBirth: readString(person.place_of_birth),
    knownForDepartment: readString(person.known_for_department),
    homepage: safeHttps(readString(person.homepage)),
    externalProfiles,
    knownFor,
    credits: allCredits,
  })
}

function safeHttps(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function externalLinks(person: JsonRecord, ids: JsonRecord): JsonRecord[] {
  const links: JsonRecord[] = []
  const imdbId = readString(ids.imdb_id)

  if (imdbId && /^[a-z0-9]+$/i.test(imdbId)) {
    links.push({ label: 'IMDb', url: `https://www.imdb.com/name/${imdbId}/` })
  }

  const social = [
    ['instagram_id', 'https://www.instagram.com/', 'Instagram'],
    ['facebook_id', 'https://www.facebook.com/', 'Facebook'],
    ['twitter_id', 'https://x.com/', 'X'],
  ] as const

  social.forEach(([key, base, label]) => {
    const id = readString(ids[key])
    if (id && /^[a-z0-9._-]+$/i.test(id)) {
      links.push({ label, url: `${base}${id}` })
    }
  })

  const homepage = safeHttps(readString(person.homepage))
  if (homepage) {
    try {
      const host = new URL(homepage).hostname.toLowerCase()
      const label = allowedExternalHosts.get(host)

      if (label) {
        links.push({ label, url: homepage })
      }
    } catch {
      // The homepage is already checked, this is defensive.
    }
  }

  return links
}

// ---------------------------------------------------------------------------
// Public-source EPG fallback.
//
// This route exists for one situation: the user's provider host serves no guide
// data, but its channels carry populated EPG identifiers. Public XMLTV sources
// are reachable from the Worker's egress even when the provider hosts block it.
//
// The Worker fetches a per-region source file SERVER-SIDE, filters it down to
// the identifiers the client asks about, caches the whole file at the edge for
// a few hours, and returns compact JSON. A whole region file is never sent to
// the TV. No credential, playlist URL, or stream URL is ever involved.
// ---------------------------------------------------------------------------

const EPG_SOURCE_BASE = 'https://epgshare01.online/epgshare01/epg_ripper_'
const EPG_SOURCE_CACHE_SECONDS = 60 * 60 * 3
const EPG_MAX_IDENTIFIERS = 40
const EPG_MAX_PROGRAMMES_PER_CHANNEL = 32
const EPG_SOURCE_TIMEOUT_MS = 12_000

type PublicProgramme = { start: number; stop: number; title: string; description?: string }

function regionFileName(region: string): string | null {
  // Region tokens are short alphanumerics like "UK1", "NL1", "US2". Reject
  // anything else so the path cannot be manipulated.
  return /^[A-Za-z]{2,3}[0-9]{0,2}$/.test(region) ? region.toUpperCase() : null
}

function parseXmltvTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null
  }
  // "20260805114500 +0000" (offset optional).
  const match = value.match(/^(\d{14})(?:\s*([+-]\d{4}))?/)
  if (!match) {
    return null
  }
  const [, digits, offset] = match
  const iso =
    `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T` +
    `${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}` +
    (offset ? `${offset.slice(0, 3)}:${offset.slice(3)}` : 'Z')
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

async function publicEpg(url: URL, env: Env): Promise<Response> {
  void env
  const region = regionFileName(url.searchParams.get('region') ?? '')
  const wanted = (url.searchParams.get('ids') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, EPG_MAX_IDENTIFIERS)
  const limit = Math.min(
    EPG_MAX_PROGRAMMES_PER_CHANNEL,
    Math.max(1, Number(url.searchParams.get('limit') ?? '8') || 8),
  )

  if (!region || !wanted.length) {
    return json({ error: 'A region and at least one identifier are required.' }, 400)
  }

  const sourceUrl = `${EPG_SOURCE_BASE}${region}.xml.gz`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), EPG_SOURCE_TIMEOUT_MS)

  let xml: string
  try {
    // `cf.cacheTtl` caches the upstream file at the edge so repeated channel
    // requests within the window reuse one download.
    const response = await fetch(sourceUrl, {
      signal: controller.signal,
      cf: { cacheTtl: EPG_SOURCE_CACHE_SECONDS, cacheEverything: true },
    } as RequestInit)
    if (!response.ok) {
      return json({ error: 'Public guide source is unavailable.' }, 502)
    }
    // The source is gzipped; the Workers runtime transparently decompresses a
    // gzip Content-Encoding, and DecompressionStream covers explicit .gz bodies.
    xml = await decodeGuideBody(response)
  } catch {
    return json({ error: 'Public guide source is unavailable.' }, 502)
  } finally {
    clearTimeout(timeout)
  }

  const wantedSet = new Set(wanted)
  const wantedLower = new Set(wanted.map((value) => value.toLowerCase()))
  const channels: Record<string, PublicProgramme[]> = {}

  const programmeRegex = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g
  let match: RegExpExecArray | null
  while ((match = programmeRegex.exec(xml))) {
    const attributes = match[1]
    const channelMatch = attributes.match(/channel="([^"]+)"/)
    if (!channelMatch) {
      continue
    }
    const channelId = decodeXmlEntities(channelMatch[1])
    if (!wantedSet.has(channelId) && !wantedLower.has(channelId.toLowerCase())) {
      continue
    }
    const bucketKey = wantedSet.has(channelId)
      ? channelId
      : wanted.find((value) => value.toLowerCase() === channelId.toLowerCase()) ?? channelId
    const bucket = (channels[bucketKey] ??= [])
    if (bucket.length >= limit) {
      continue
    }
    const start = parseXmltvTimestamp(attributes.match(/start="([^"]+)"/)?.[1])
    const stop = parseXmltvTimestamp(attributes.match(/stop="([^"]+)"/)?.[1])
    if (start === null || stop === null || stop <= start) {
      continue
    }
    const body = match[2]
    const title = decodeXmlEntities((body.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? '').trim())
    const description = decodeXmlEntities(
      (body.match(/<desc[^>]*>([\s\S]*?)<\/desc>/)?.[1] ?? '').trim(),
    )
    bucket.push(description ? { start, stop, title, description } : { start, stop, title })
  }

  for (const key of Object.keys(channels)) {
    channels[key].sort((left, right) => left.start - right.start)
  }

  return json({ source: 'public', region, channels })
}

async function decodeGuideBody(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? ''
  const contentEncoding = response.headers.get('content-encoding') ?? ''

  // If the runtime already decompressed (gzip transfer-encoding), text() is XML.
  if (contentEncoding.includes('gzip') || contentType.includes('xml')) {
    const text = await response.text()
    if (text.trimStart().startsWith('<')) {
      return text
    }
  }

  // Otherwise treat the body as an explicit gzip stream.
  if (response.body && typeof DecompressionStream === 'function') {
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'))
    return await new Response(stream).text()
  }

  return await response.text()
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env)

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }

    try {
      const url = new URL(request.url)

      if (request.method === 'POST' && url.pathname === '/v1/resolve-title') {
        return withCors(await resolveTitle(request, env), cors)
      }

      const personMatch = url.pathname.match(/^\/v1\/person\/(\d{1,16})$/)
      if (request.method === 'GET' && personMatch) {
        return withCors(await personDetails(personMatch[1], env), cors)
      }

      if (request.method === 'GET' && url.pathname === '/v1/epg') {
        return withCors(await publicEpg(url, env), cors)
      }

      return json({ error: 'Not found.' }, 404, cors)
    } catch (error) {
      console.error(
        'Metadata request failed',
        error instanceof Response
          ? { kind: 'upstream-response', status: error.status }
          : {
              kind: 'runtime-error',
              message: error instanceof Error ? error.message : 'Unknown error',
            },
      )

      if (error instanceof Response) {
        return json(
          { error: error.status === 404 ? 'Metadata was not found.' : 'Metadata service is unavailable.' },
          error.status,
          cors,
        )
      }

      return json({ error: 'Metadata service is unavailable.' }, 502, cors)
    }
  },
}