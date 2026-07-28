export interface Env {
  TMDB_BEARER_TOKEN: string
  ALLOWED_ORIGIN?: string
  METADATA_LANGUAGE?: string
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

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get('Origin')
  const allowedOrigin = env.ALLOWED_ORIGIN?.trim()

  if (!allowedOrigin || !origin || origin === allowedOrigin) {
    return {
      'Access-Control-Allow-Origin': allowedOrigin || origin || '*',
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
  const response = await fetch(`${TMDB_API}${path}${path.includes('?') ? '&' : '?'}language=${encodeURIComponent(language)}`, {
    headers: {
      Authorization: `Bearer ${env.TMDB_BEARER_TOKEN}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Response(null, { status: response.status })
  }

  return readRecord(await response.json())
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

  const [details, credits, recommendations] = await Promise.all([
    tmdb(env, `/${mediaType}/${tmdbId}`, language),
    tmdb(env, `/${mediaType}/${tmdbId}/credits`, language),
    tmdb(env, `/${mediaType}/${tmdbId}/recommendations`, language),
  ])

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
    .filter((entry): entry is JsonRecord => Boolean(entry))
    .slice(0, MAX_RELATED)

  return json({
    tmdbId,
    mediaType,
    title: titleFor(details, mediaType),
    originalTitle: originalTitleFor(details, mediaType),
    tagline: readString(details.tagline),
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

      return json({ error: 'Not found.' }, 404, cors)
    } catch (error) {
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