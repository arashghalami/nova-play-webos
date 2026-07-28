import type {
  EnrichedTitleMetadata,
  FilmographyCredit,
  PersonDetails,
  PersonSummary,
  RelatedTitle,
} from './types'

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

function titleFromPayload(value: unknown): EnrichedTitleMetadata | null {
  const source = readRecord(value)
  const tmdbId = readString(source.tmdbId)
  const mediaType = normalizeMediaType(source.mediaType)

  if (!tmdbId || !mediaType) {
    return null
  }

  return {
    tmdbId,
    mediaType,
    tagline: readString(source.tagline),
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

  if (!baseUrl) {
    throw new Error('Metadata service is not configured.')
  }

  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const forwardAbort = () => controller.abort()
  signal?.addEventListener('abort', forwardAbort, { once: true })

  try {
    const response = await fetch(`${baseUrl}${path}`, { ...init, signal: controller.signal })

    if (!response.ok) {
      throw new Error(response.status === 404 ? 'Metadata was not found.' : 'Metadata service is unavailable.')
    }

    return await response.json()
  } finally {
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
    return cached
  }

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
  const metadata = titleFromPayload(payload)
  cacheWrite(titleCache, lookup, metadata, TITLE_CACHE_TTL_MS)
  return metadata
}

export async function loadPersonMetadata(
  personId: string,
  signal?: AbortSignal,
): Promise<PersonDetails> {
  const cached = cacheRead(personCache, personId)

  if (cached) {
    return cached
  }

  const payload = await requestJson(`/v1/person/${encodeURIComponent(personId)}`, { method: 'GET' }, signal)
  const person = personFromPayload(payload)

  if (!person) {
    throw new Error('Person metadata is unavailable.')
  }

  cacheWrite(personCache, personId, person, PERSON_CACHE_TTL_MS)
  return person
}