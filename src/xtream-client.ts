import type {
  AccountSummary,
  CatchupCapability,
  Category,
  LibrarySection,
  NowNext,
  RatingCandidate,
  PersonSummary,
  Program,
  RichMetadata,
  SeriesDetails,
  StreamItem,
  Trailer,
  VodDetails,
  XtreamProfile,
} from './types'
import { foldText, matchesQuery, queryTokens } from './search'
import { ageGuidanceForRating, normalizeRatingCandidate } from './content-rating'
import { performanceTrace } from './performance-trace'
import type { ProviderFailureDiagnostics } from './provider-error'
import {
  AUTH_MESSAGE,
  ProviderError,
  buildBodySnippet,
  classifyHttpStatus,
  httpFailureMessage,
  parseRetryAfterMs,
} from './provider-error'

type RawRecord = Record<string, unknown>

const API_TIMEOUT_MS = 15_000
/*
 * A guarded global-search fallback may request a whole provider section when
 * categories do not describe their stream names. Keep the limit high enough
 * for common real-world Xtream libraries while still rejecting truly
 * unbounded payloads before JSON parsing.
 */
const MAX_JSON_RESPONSE_BYTES = 64 * 1024 * 1024
const SEARCH_TIMEOUT_MS = 60_000
const SEARCH_WORK_SLICE_MS = 8
const MAX_SEARCH_RECORD_CHARS = 2 * 1024 * 1024
// Cheap, allocation-free early-exit scan used to keep pure-ASCII search records
// on the native lowercase fast path instead of the per-character accent fold.
const NON_ASCII_PATTERN = /[^\x00-\x7f]/
const NORMALIZATION_BATCH_SIZE = 400
// A failed response only needs enough of its body to fingerprint the cause.
const MAX_ERROR_BODY_CHARS = 8 * 1024
const RESPONSE_TOO_LARGE_MESSAGE =
  'This provider response is too large to load safely. Open a category to load a smaller portion of the catalog.'

type RequestOptions = {
  signal?: AbortSignal
  timeoutMs?: number
}

type StreamSearchOptions = RequestOptions & {
  /**
   * Optional deadline for receiving HTTP response headers. When supplied, the
   * regular timeout begins again after headers arrive and bounds incremental
   * body scanning independently.
   */
  responseTimeoutMs?: number
  limit?: number
  excludeCategoryIds?: ReadonlySet<string>
  onMatches?: (matches: StreamItem[]) => void
  matchAll?: boolean
}

function readString(value: unknown): string | undefined {
  if (value === undefined || value === null || typeof value === 'object' || typeof value === 'function') {
    return undefined
  }

  return String(value)
}

function readRecord(value: unknown): RawRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }

  return value as RawRecord
}

/**
 * Episode season fields vary by provider: some send a bare number ("1"), others
 * send prefixed forms like "S01" or "Season 1". The UI's episodeIdentifier()
 * prepends its own "S" and zero-pads, so a raw "S01" would render as "SS01".
 * Only trust a purely numeric value; otherwise fall back to the reliable map
 * grouping key.
 */
function normalizeSeasonNumber(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim()

  return trimmed && /^\d+$/.test(trimmed) ? trimmed : fallback
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

// A value that could plausibly be base64: only base64 alphabet characters with
// optional "=" padding. Length being a multiple of 4 is checked separately.
const BASE64_SHAPE = /^[A-Za-z0-9+/]+={0,2}$/
// C0/C1 control characters (excluding tab/newline/carriage-return) plus the
// Unicode replacement character. Their presence means a base64 "decode" of a
// plain-text title produced binary garbage rather than real program text.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFD]/
// Letters/digits/space across Latin, Latin-1 supplement/extended, Greek,
// Cyrillic, Hebrew, Arabic, Devanagari, Kana, and CJK/Hangul BMP ranges. Kept
// to explicit BMP ranges to stay ES2015-compatible for the webOS bundle (no
// Unicode property escapes / \p{L}).
const LETTER_LIKE_CHARACTER =
  /[0-9A-Za-z \u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0900-\u097F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/

function textReadabilityRatio(value: string): number {
  if (!value.length) {
    return 0
  }

  let readable = 0

  for (let index = 0; index < value.length; index += 1) {
    if (LETTER_LIKE_CHARACTER.test(value[index])) {
      readable += 1
    }
  }

  return readable / value.length
}

function toBaseUrl(serverUrl: string): string {
  const source = serverUrl.trim()

  if (!/^https?:\/\//i.test(source)) {
    throw new Error('Use a full server URL beginning with http:// or https://.')
  }

  const url = new URL(source)
  url.search = ''
  url.hash = ''
  url.pathname = url.pathname.replace(/\/player_api\.php\/?$/i, '').replace(/\/+$/, '')

  return url.toString().replace(/\/+$/, '')
}

function epgListings(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value
  }

  const payload = readRecord(value)
  const candidates = [
    payload.epg_listings,
    payload.epg_list,
    payload.listings,
    payload.programs,
    payload.data,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
    }

    const nested = readRecord(candidate)

    for (const key of ['epg_listings', 'epg_list', 'listings', 'programs']) {
      if (Array.isArray(nested[key])) {
        return nested[key]
      }
    }
  }

  return []
}

function parseTimestamp(value: unknown): Date | null {
  const source = readString(value)?.trim()

  if (!source) {
    return null
  }

  const compactTimestamp = source.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/)

  if (compactTimestamp) {
    const [, year, month, day, hour, minute, second] = compactTimestamp
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    )

    return Number.isNaN(date.getTime()) ? null : date
  }

  if (/^-?\d+$/.test(source)) {
    const timestamp = Number(source)
    const milliseconds = Math.abs(timestamp) < 1e12 ? timestamp * 1000 : timestamp
    const date = new Date(milliseconds)

    return Number.isNaN(date.getTime()) ? null : date
  }

  // Many Xtream panels send "YYYY-MM-DD HH:MM(:SS)" for the start/end fields.
  // The space-separated (non-ISO) form is implementation-defined for Date.parse:
  // modern V8 accepts it, but the older webOS TV Chromium returns Invalid Date,
  // which silently drops every EPG entry. Parse the components explicitly so the
  // schedule renders on the TV. A trailing timezone offset (if present) is left
  // to the engine; the common bare local form is handled here.
  const spacedTimestamp = source.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
  )

  if (spacedTimestamp) {
    const [, year, month, day, hour, minute, second] = spacedTimestamp
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second ?? '0'),
    )

    return Number.isNaN(date.getTime()) ? null : date
  }

  const date = new Date(source)
  return Number.isNaN(date.getTime()) ? null : date
}

function parseDurationSeconds(value: unknown): number | undefined {
  const source = readString(value)?.trim()

  if (!source) {
    return undefined
  }

  if (/^\d+$/.test(source)) {
    return Number(source)
  }

  const parts = source.split(':').map(Number)

  if (
    parts.length !== 3 ||
    parts.some((part) => !Number.isFinite(part) || part < 0)
  ) {
    return undefined
  }

  return parts[0] * 3600 + parts[1] * 60 + parts[2]
}

function parseTrailer(value: unknown): Trailer | undefined {
  const source = readString(value)?.trim()

  if (!source) {
    return undefined
  }

  const youtubeMatch = source.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/i,
  )

  if (youtubeMatch) {
    return {
      kind: 'youtube',
      url: `https://www.youtube.com/watch?v=${youtubeMatch[1]}`,
    }
  }

  if (/^[\w-]{6,}$/.test(source)) {
    return {
      kind: 'youtube',
      url: `https://www.youtube.com/watch?v=${source}`,
    }
  }

  if (/^https?:\/\//i.test(source)) {
    return { kind: 'url', url: source }
  }

  return undefined
}

function parseCatchup(record: RawRecord): CatchupCapability | undefined {
  const available = readString(record.tv_archive) === '1'
  const rawDuration = readString(record.tv_archive_duration)
  const duration = rawDuration ? Number(rawDuration) : Number.NaN

  if (!available && !Number.isFinite(duration)) {
    return undefined
  }

  return {
    available,
    durationDays: Number.isFinite(duration) && duration > 0 ? duration : undefined,
  }
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}

function textDecoder(): { decode: (value?: Uint8Array, options?: { stream?: boolean }) => string } {
  if (typeof TextDecoder === 'function') {
    return new TextDecoder()
  }

  return {
    decode: (value = new Uint8Array()): string => {
      let binary = ''

      for (let index = 0; index < value.length; index += 1) {
        binary += String.fromCharCode(value[index])
      }

      try {
        return decodeURIComponent(escape(binary))
      } catch {
        return binary
      }
    },
  }
}

async function readResponseText(response: Response): Promise<string> {
  if (
    !response.body ||
    typeof response.body.getReader !== 'function' ||
    typeof TextDecoder !== 'function'
  ) {
    const source = await response.text()

    if (source.length > MAX_JSON_RESPONSE_BYTES) {
      throw new ProviderError('too-large', RESPONSE_TOO_LARGE_MESSAGE, false)
    }

    return source
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    if (!value) {
      continue
    }

    byteLength += value.byteLength

    if (byteLength > MAX_JSON_RESPONSE_BYTES) {
      await reader.cancel()
      throw new ProviderError('too-large', RESPONSE_TOO_LARGE_MESSAGE, false)
    }

    chunks.push(value)
  }

  const payload = new Uint8Array(byteLength)
  let offset = 0

  chunks.forEach((chunk) => {
    payload.set(chunk, offset)
    offset += chunk.byteLength
  })

  return textDecoder().decode(payload)
}

function providerPersonId(name: string, role: string): string {
  return `xtream-${role}-${foldText(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

function parseProviderPeople(value: unknown, role: 'cast' | 'crew'): PersonSummary[] | undefined {
  const people = readArray(value)
    .map((entry, index): PersonSummary | null => {
      const record = readRecord(entry)
      const name = readString(
        typeof entry === 'string'
          ? entry
          : record.name ?? record.actor ?? record.person ?? record.title,
      )

      if (!name) {
        return null
      }

      return {
        id: readString(record.id ?? record.person_id ?? record.tmdb_id) ?? `${providerPersonId(name, role)}-${index}`,
        name,
        profileImage: readString(
          record.profile_path ?? record.profile_image ?? record.image ?? record.photo ?? record.avatar,
        ),
        character: readString(record.character ?? record.role),
        job: readString(record.job ?? record.credit),
        department: readString(record.department),
        source: 'xtream' as const,
      }
    })
    .filter((person): person is PersonSummary => Boolean(person))

  return people.length ? people : undefined
}

function parseContentRating(record: RawRecord): RatingCandidate | undefined {
  const raw = readString(
    record.certification ??
      record.content_rating ??
      record.classification ??
      record.mpaa_rating ??
      record.age_rating ??
      record.age,
  )

  if (!raw) {
    return undefined
  }

  const region = readString(record.region ?? record.country_code ?? record.certification_country)
  const value = raw.trim()
  const minimumAgeMatch = value.match(/^(?:FSK\s*)?(\d{1,2})$/i)

  return normalizeRatingCandidate({
    value,
    region,
    minimumAge: minimumAgeMatch ? Number(minimumAgeMatch[1]) : undefined,
    provider: 'xtream',
    sourceLabel: 'Xtream',
    official: true,
  })
}

function parseMetadata(record: RawRecord): RichMetadata {
  const rawBackdrops = readArray(record.backdrop_path ?? record.backdrops)
  const backdrops = rawBackdrops
    .map((backdrop) => {
      if (typeof backdrop === 'string') {
        return backdrop
      }

      return readString(readRecord(backdrop).url ?? readRecord(backdrop).path)
    })
    .filter((backdrop): backdrop is string => Boolean(backdrop))

  const trailer = parseTrailer(
    record.youtube_trailer ?? record.trailer ?? record.trailer_url ?? record.youtube,
  )

  const duration = readString(record.duration ?? record.runtime ?? record.duration_formatted)
  const contentRating = parseContentRating(record)

  return {
    originalTitle: readString(record.o_name ?? record.original_name),
    plot: readString(record.plot ?? record.description ?? record.story ?? record.synopsis ?? record.overview),
    cover: readString(
      record.movie_image ??
        record.episode_image ??
        record.still_path ??
        record.image ??
        record.cover ??
        record.cover_big,
    ),
    backdrops: backdrops.length ? backdrops : undefined,
    genre: readString(record.genre),
    cast: readString(record.cast ?? record.actors),
    director: readString(record.director),
    country: readString(record.country),
    releaseDate: readString(
      record.releasedate ?? record.release_date ?? record.releaseDate ?? record.air_date ?? record.aired,
    ),
    year: readString(record.year),
    rating: readString(record.rating ?? record.vote_average),
    ratingFiveBased: readString(record.rating_5based),
    duration,
    durationSeconds: parseDurationSeconds(
      record.duration_secs ?? record.duration_seconds ?? record.runtime_seconds ?? duration,
    ),
    ageRating: contentRating?.value ?? readString(record.age ?? record.age_rating ?? record.mpaa_rating),
    contentRating,
    ageGuidance: contentRating ? ageGuidanceForRating(contentRating) : undefined,
    contentRatings: contentRating ? [contentRating] : undefined,
    providerCast: parseProviderPeople(record.cast ?? record.actors ?? record.actor_list, 'cast'),
    providerCrew: parseProviderPeople(record.crew ?? record.directors ?? record.creators, 'crew'),
    tmdbId: readString(record.tmdb_id ?? record.tmdb),
    trailer,
  }
}

/*
 * Reads a bounded prefix of a failed response body. Provider rejections are
 * normally tiny, but an edge proxy challenge page can be large, so stop early
 * instead of buffering whatever the edge decided to send.
 */
async function readBoundedErrorText(response: Response): Promise<string> {
  if (
    response.body &&
    typeof response.body.getReader === 'function' &&
    typeof TextDecoder === 'function'
  ) {
    const reader = response.body.getReader()
    const decoder = textDecoder()
    let text = ''

    try {
      while (text.length < MAX_ERROR_BODY_CHARS) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        if (value) {
          text += decoder.decode(value, { stream: true })
        }
      }
    } finally {
      void reader.cancel().catch(() => undefined)
    }

    return text.slice(0, MAX_ERROR_BODY_CHARS)
  }

  return (await response.text()).slice(0, MAX_ERROR_BODY_CHARS)
}

/*
 * Builds the typed failure for a non-OK provider response.
 *
 * The status alone cannot distinguish per-minute throttling from a blocked
 * account from an edge challenge page, and that distinction decides whether the
 * app may issue any further request. Capture the bounded, credential-scrubbed
 * evidence needed to tell them apart and record it on the trace so it can be
 * read back from a device without a debugger session.
 */
async function describeHttpFailure(
  response: Response,
  operation: string,
  secrets: ReadonlyArray<string | undefined>,
  requestId: number | null,
): Promise<ProviderError> {
  const { kind, retryable } = classifyHttpStatus(response.status)
  const diagnostics: ProviderFailureDiagnostics = { status: response.status }
  const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'), Date.now())

  if (retryAfterMs !== undefined) {
    diagnostics.retryAfterMs = retryAfterMs
  }

  const server = response.headers.get('server')

  if (server) {
    diagnostics.server = server.slice(0, 64)
  }

  // A CDN or WAF hop changes the diagnosis: an edge challenge is a different
  // problem, with a different remedy, from a panel-level rate limit.
  diagnostics.proxied = Boolean(
    response.headers.get('cf-ray') ??
      response.headers.get('cf-mitigated') ??
      response.headers.get('x-sucuri-id'),
  )

  try {
    const bodySnippet = buildBodySnippet(await readBoundedErrorText(response), secrets)

    if (bodySnippet) {
      diagnostics.bodySnippet = bodySnippet
    }
  } catch {
    // An unreadable body must never hide the status we already classified.
  }

  performanceTrace.event(
    'network',
    'xtream-http-failure',
    {
      operation,
      status: response.status,
      kind,
      retryable,
      retryAfterMs: diagnostics.retryAfterMs ?? null,
      server: diagnostics.server ?? null,
      proxied: diagnostics.proxied ?? null,
      bodySnippet: diagnostics.bodySnippet ?? null,
    },
    { requestId: requestId ?? undefined },
  )

  return new ProviderError(
    kind,
    httpFailureMessage(response.status, kind),
    retryable,
    diagnostics,
  )
}

export class XtreamClient {
  readonly baseUrl: string
  private readonly profile: XtreamProfile

  constructor(profile: XtreamProfile) {
    this.profile = profile
    this.baseUrl = toBaseUrl(profile.serverUrl)
  }

  private apiUrl(action?: string, parameters: Record<string, string> = {}): string {
    const url = new URL(`${this.baseUrl}/player_api.php`)
    url.searchParams.set('username', this.profile.username)
    url.searchParams.set('password', this.profile.password)

    if (action) {
      url.searchParams.set('action', action)
    }

    Object.entries(parameters).forEach(([name, value]) => url.searchParams.set(name, value))
    return url.toString()
  }

  private async getJson<T>(
    action?: string,
    parameters: Record<string, string> = {},
    options: RequestOptions = {},
  ): Promise<T> {
    const operation = action ?? 'validate'
    const requestId = performanceTrace.beginRequest('xtream-request', {
      operation,
      parameterCount: Object.keys(parameters).length,
    })
    const controller = new AbortController()
    const timeout = window.setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? API_TIMEOUT_MS,
    )
    const abortFromCaller = (): void => controller.abort()

    if (options.signal?.aborted) {
      controller.abort()
    } else {
      options.signal?.addEventListener('abort', abortFromCaller, { once: true })
    }

    try {
      let response: Response

      try {
        performanceTrace.event('network', 'xtream-fetch-start', { operation }, {
          requestId: requestId ?? undefined,
        })
        response = await fetch(this.apiUrl(action, parameters), { signal: controller.signal })
        performanceTrace.event(
          'network',
          'xtream-response-headers',
          {
            operation,
            status: response.status,
            contentLength: Number(response.headers.get('content-length')) || 0,
          },
          { requestId: requestId ?? undefined },
        )
      } catch {
        if (options.signal?.aborted) {
          throw new ProviderError('cancelled', 'Request cancelled.', false)
        }

        if (controller.signal.aborted) {
          throw new ProviderError(
            'timeout',
            'The provider took too long to respond. Please try again.',
            true,
          )
        }

        throw new ProviderError(
          'network',
          'Unable to reach this provider. Check the server URL and your internet connection.',
          true,
        )
      }

      if (!response.ok) {
        throw await describeHttpFailure(
          response,
          operation,
          [this.profile.username, this.profile.password],
          requestId,
        )
      }

      const contentLength = Number(response.headers.get('content-length'))

      if (Number.isFinite(contentLength) && contentLength > MAX_JSON_RESPONSE_BYTES) {
        throw new ProviderError('too-large', RESPONSE_TOO_LARGE_MESSAGE, false)
      }

      let source

      try {
        source = await performanceTrace.measureAsync(
          'data',
          'xtream-response-read',
          () => readResponseText(response),
          { operation },
          { requestId: requestId ?? undefined },
        )
        performanceTrace.event(
          'data',
          'xtream-response-decoded',
          {
            operation,
            characters: source.length,
          },
          { requestId: requestId ?? undefined },
        )
      } catch (reason) {
        if (reason instanceof Error && reason.message === RESPONSE_TOO_LARGE_MESSAGE) {
          throw reason
        }

        if (options.signal?.aborted) {
          throw new ProviderError('cancelled', 'Request cancelled.', false)
        }

        if (controller.signal.aborted) {
          throw new ProviderError(
            'timeout',
            'The provider took too long to respond. Please try again.',
            true,
          )
        }

        // A truncated or aborted read is a transport fault, so a different
        // request may still succeed.
        throw new ProviderError('network', 'The provider response could not be read.', true)
      }

      try {
        return performanceTrace.measure(
          'data',
          'xtream-json-parse',
          () => JSON.parse(source) as T,
          {
            operation,
            characters: source.length,
          },
          { requestId: requestId ?? undefined },
        )
      } catch {
        if (options.signal?.aborted) {
          throw new ProviderError('cancelled', 'Request cancelled.', false)
        }

        throw new ProviderError(
          'invalid-response',
          'The provider sent an invalid response.',
          false,
        )
      }
    } finally {
      performanceTrace.endRequest(requestId, {
        operation,
        aborted: controller.signal.aborted,
      })
      window.clearTimeout(timeout)
      options.signal?.removeEventListener('abort', abortFromCaller)
    }
  }

  async validate(signal?: AbortSignal): Promise<AccountSummary> {
    const payload = readRecord(
      await this.getJson<RawRecord>(undefined, {}, { signal, timeoutMs: 30_000 }),
    )
    const user = readRecord(payload.user_info)

    if (readString(user.auth) !== '1') {
      throw new ProviderError('auth', AUTH_MESSAGE, false)
    }

    return {
      status: readString(user.status) ?? 'Unknown',
      expiresAt: readString(user.exp_date),
      activeConnections: readString(user.active_cons),
      maxConnections: readString(user.max_connections),
    }
  }

  async categories(
    section: LibrarySection,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<Category[]> {
    const actions: Record<LibrarySection, string> = {
      live: 'get_live_categories',
      vod: 'get_vod_categories',
      series: 'get_series_categories',
    }

    const payload = await this.getJson<unknown[]>(
      actions[section],
      {},
      { signal, timeoutMs: timeoutMs ?? 30_000 },
    )

    return Array.isArray(payload)
      ? payload.flatMap((item) => {
          const record = readRecord(item)
          const id = readString(record.category_id)

          if (!id) {
            return []
          }

          return [{
            id,
            name: readString(record.category_name) ?? 'Uncategorized',
          }]
        })
      : []
  }

  async streams(
    section: LibrarySection,
    categoryId?: string,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<StreamItem[]> {
    const actions: Record<LibrarySection, string> = {
      live: 'get_live_streams',
      vod: 'get_vod_streams',
      series: 'get_series',
    }
    const parameters: Record<string, string> = categoryId ? { category_id: categoryId } : {}
    const payload = await this.getJson<unknown[]>(actions[section], parameters, {
      signal,
      timeoutMs,
    })

    if (!Array.isArray(payload)) {
      return []
    }

    const streams: StreamItem[] = []
    const normalizationStartedAt =
      typeof performance !== 'undefined' ? performance.now() : Date.now()

    performanceTrace.event('data', 'xtream-normalization-start', {
      section,
      recordCount: payload.length,
    })

    for (let index = 0; index < payload.length; index += 1) {
      if (signal?.aborted) {
        throw new ProviderError('cancelled', 'Request cancelled.', false)
      }

      const stream = this.normalizeStream(readRecord(payload[index]), section)

      if (stream.id) {
        streams.push(stream)
      }

      if (index > 0 && index % NORMALIZATION_BATCH_SIZE === 0) {
        await yieldToBrowser()
      }
    }

    performanceTrace.event('data', 'xtream-normalization-complete', {
      section,
      recordCount: payload.length,
      streamCount: streams.length,
      durationMs:
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
        normalizationStartedAt,
    })
    return streams
  }

  async searchStreams(
    section: LibrarySection,
    query: string,
    options: StreamSearchOptions = {},
  ): Promise<StreamItem[]> {
    const tokens = queryTokens(query)
    const limit = Math.max(1, options.limit ?? 180)

    if (!tokens.length && !options.matchAll) {
      return []
    }

    // Cheap single-token prefilter run against raw record text before JSON.parse.
    // A record can only contain every token if it contains the longest one, so
    // pick that to reject the most non-matches. Multi-token AND is confirmed
    // against the parsed, folded name below.
    const longestToken = tokens.reduce(
      (longest, token) => (token.length > longest.length ? token : longest),
      '',
    )

    const actions: Record<LibrarySection, string> = {
      live: 'get_live_streams',
      vod: 'get_vod_streams',
      series: 'get_series',
    }
    const operation = actions[section]
    const requestId = performanceTrace.beginRequest('xtream-search-request', {
      operation,
      queryTokenCount: tokens.length,
      matchAll: Boolean(options.matchAll),
    })
    const controller = new AbortController()
    let timeout = window.setTimeout(
      () => controller.abort(),
      options.responseTimeoutMs ?? options.timeoutMs ?? SEARCH_TIMEOUT_MS,
    )
    const abortFromCaller = (): void => controller.abort()
    const matches: StreamItem[] = []
    let pendingMatches: StreamItem[] = []
    let objectParts: string[] = []
    let objectLength = 0
    let objectDepth = 0
    let inString = false
    let escaped = false

    if (options.signal?.aborted) {
      controller.abort()
    } else {
      options.signal?.addEventListener('abort', abortFromCaller, { once: true })
    }

    const flushMatches = (): void => {
      if (!pendingMatches.length) {
        return
      }

      const batch = pendingMatches
      pendingMatches = []

      // Publish incrementally so cancellation requested by a consumer takes
      // effect before any later match from the same network chunk is exposed.
      for (const match of batch) {
        if (controller.signal.aborted) {
          break
        }

        options.onMatches?.([match])
      }
    }

    const processRecord = (source: string): boolean => {
      // Reject the overwhelming majority of records before JSON.parse. Whole
      // IPTV libraries can contain hundreds of thousands of objects, and JSON
      // parsing every non-match starves the webOS UI thread. Keep the common
      // pure-ASCII record on the native lowercase fast path; only pay the
      // per-character fold when the source actually contains accents (so an
      // accented title still survives the prefilter, confirmed below).
      const haystack = NON_ASCII_PATTERN.test(source)
        ? foldText(source)
        : source.toLowerCase()

      if (longestToken && !haystack.includes(longestToken)) {
        return false
      }

      try {
        const record = readRecord(JSON.parse(source))
        const name = readString(record.name ?? record.title) ?? ''

        if (!matchesQuery(foldText(name), tokens)) {
          return false
        }

        const categoryId = readString(record.category_id) ?? ''

        if (options.excludeCategoryIds?.has(categoryId)) {
          return false
        }

        const stream = this.normalizeStream(record, section)

        if (stream.id) {
          matches.push(stream)
          pendingMatches.push(stream)
        }
      } catch {
        // Ignore one malformed record without discarding the rest of the search.
      }

      return matches.length >= limit
    }

    const processChunk = async (chunk: string): Promise<boolean> => {
      let sliceStartedAt = Date.now()
      let objectChunkStart = objectDepth > 0 ? 0 : -1

      for (let index = 0; index < chunk.length; index += 1) {
        if (controller.signal.aborted) {
          throw new ProviderError('cancelled', 'Request cancelled.', false)
        }

        const character = chunk[index]

        if (objectDepth === 0) {
          if (character === '{') {
            objectChunkStart = index
            objectDepth = 1
            inString = false
            escaped = false
          }
        } else if (
          objectChunkStart >= 0 &&
          objectLength + index - objectChunkStart + 1 > MAX_SEARCH_RECORD_CHARS
        ) {
          objectParts = []
          objectLength = 0
          objectDepth = 0
          objectChunkStart = -1
          inString = false
          escaped = false
        } else if (inString) {
          if (escaped) {
            escaped = false
          } else if (character === '\\') {
            escaped = true
          } else if (character === '"') {
            inString = false
          }
        } else if (character === '"') {
          inString = true
        } else if (character === '{') {
          objectDepth += 1
        } else if (character === '}') {
          objectDepth -= 1

          if (objectDepth === 0 && objectChunkStart >= 0) {
            objectParts.push(chunk.slice(objectChunkStart, index + 1))
            const recordSource = objectParts.join('')
            objectParts = []
            objectLength = 0
            objectChunkStart = -1

            if (processRecord(recordSource)) {
              flushMatches()
              return true
            }
          }
        }

        // Reading the clock for every character is itself a major cost on
        // older webOS JavaScript engines. Check the cooperative budget in
        // coarse blocks while still checking abort on every iteration.
        if (
          (index & 2047) === 2047 &&
          Date.now() - sliceStartedAt >= SEARCH_WORK_SLICE_MS
        ) {
          flushMatches()
          await yieldToBrowser()
          sliceStartedAt = Date.now()
        }
      }

      if (objectDepth > 0 && objectChunkStart >= 0) {
        const part = chunk.slice(objectChunkStart)
        objectParts.push(part)
        objectLength += part.length
      }

      flushMatches()

      if (controller.signal.aborted) {
        throw new ProviderError('cancelled', 'Request cancelled.', false)
      }

      return matches.length >= limit
    }

    try {
      let response: Response

      try {
        performanceTrace.event(
          'network',
          'xtream-search-fetch-start',
          { operation },
          { requestId: requestId ?? undefined },
        )
        response = await fetch(this.apiUrl(operation), {
          signal: controller.signal,
        })
        performanceTrace.event(
          'network',
          'xtream-search-response-headers',
          {
            operation,
            status: response.status,
            contentLength: Number(response.headers.get('content-length')) || 0,
          },
          { requestId: requestId ?? undefined },
        )

        if (options.responseTimeoutMs !== undefined) {
          window.clearTimeout(timeout)
          timeout = window.setTimeout(
            () => controller.abort(),
            options.timeoutMs ?? SEARCH_TIMEOUT_MS,
          )
        }
      } catch {
        if (options.signal?.aborted) {
          throw new ProviderError('cancelled', 'Request cancelled.', false)
        }

        if (controller.signal.aborted) {
          throw new ProviderError(
            'timeout',
            'The provider search took too long. Please try again.',
            true,
          )
        }

        throw new ProviderError('network', 'Unable to search this provider right now.', true)
      }

      if (!response.ok) {
        throw await describeHttpFailure(
          response,
          operation,
          [this.profile.username, this.profile.password],
          requestId,
        )
      }

      if (
        response.body &&
        typeof response.body.getReader === 'function' &&
        typeof TextDecoder === 'function'
      ) {
        const reader = response.body.getReader()
        const decoder = textDecoder()

        while (matches.length < limit) {
          const { done, value } = await reader.read()

          if (done) {
            await processChunk(decoder.decode())
            break
          }

          if (value && await processChunk(decoder.decode(value, { stream: true }))) {
            await reader.cancel()
            break
          }
        }
      } else {
        await processChunk(await response.text())
      }

      flushMatches()
      return matches
    } catch (reason) {
      flushMatches()

      if (options.signal?.aborted) {
        throw new ProviderError('cancelled', 'Request cancelled.', false)
      }

      if (controller.signal.aborted) {
        throw new ProviderError(
            'timeout',
            'The provider search took too long. Please try again.',
            true,
          )
      }

      throw reason
    } finally {
      performanceTrace.endRequest(requestId, {
        operation,
        aborted: controller.signal.aborted,
        matchCount: matches.length,
      })
      window.clearTimeout(timeout)
      options.signal?.removeEventListener('abort', abortFromCaller)
    }
  }

  async vodInfo(streamId: string, signal?: AbortSignal): Promise<VodDetails> {
    const payload = readRecord(
      await this.getJson<RawRecord>('get_vod_info', { vod_id: streamId }, { signal }),
    )
    const info = readRecord(payload.info)
    const movieData = readRecord(payload.movie_data)
    const metadata = parseMetadata({ ...movieData, ...info })

    return {
      id: readString(movieData.stream_id) ?? streamId,
      containerExtension: readString(movieData.container_extension ?? info.container_extension),
      directSource: readString(movieData.direct_source ?? info.direct_source),
      metadata,
    }
  }

  async seriesInfo(seriesId: string, signal?: AbortSignal): Promise<SeriesDetails> {
    const payload = readRecord(
      await this.getJson<RawRecord>('get_series_info', { series_id: seriesId }, { signal }),
    )
    const rawEpisodes = readRecord(payload.episodes)
    const episodes: Record<string, StreamItem[]> = {}

    Object.entries(rawEpisodes).forEach(([season, values]) => {
      if (!Array.isArray(values)) {
        return
      }

      episodes[season] = values.flatMap((episode) => {
        const record = readRecord(episode)
        const info = readRecord(record.info)
        const id = readString(record.id ?? record.episode_id ?? record.stream_id ?? info.id)

        if (!id) {
          return []
        }

        const metadata = parseMetadata({ ...record, ...info })

        return [{
          id,
          name: readString(record.title ?? record.name ?? info.title ?? info.name) ?? 'Untitled episode',
          section: 'series',
          categoryId: readString(record.category_id ?? info.category_id) ?? '',
          cover: metadata.cover,
          rating: metadata.rating,
          year: metadata.year,
          containerExtension: readString(record.container_extension ?? info.container_extension) ?? 'mp4',
          streamType: 'episode',
          plot: metadata.plot,
          season: normalizeSeasonNumber(readString(record.season ?? info.season), season),
          episodeNumber: readString(
            record.episode_num ?? record.episode ?? record.episode_number ?? info.episode_num ?? info.episode,
          ),
          directSource: readString(record.direct_source ?? info.direct_source),
          metadata,
        }]
      })
    })

    const rawInfo = readRecord(payload.info)

    return {
      info: {
        name: readString(rawInfo.name),
        ...parseMetadata(rawInfo),
      },
      episodes,
    }
  }

  async epg(streamId: string, limit = 8, signal?: AbortSignal): Promise<Program[]> {
    const payload = await this.getJson<unknown>(
      'get_simple_data_table',
      { stream_id: streamId },
      { signal },
    )

    return this.parsePrograms(epgListings(payload)).slice(0, Math.max(1, limit))
  }

  async nowNext(streamId: string, signal?: AbortSignal): Promise<NowNext> {
    const payload = await this.getJson<unknown>(
      'get_short_epg',
      { stream_id: streamId, limit: '2' },
      { signal },
    )
    const programs = this.parsePrograms(epgListings(payload))

    if (programs.length) {
      return this.selectNowNext(programs)
    }

    const fallbackPayload = await this.getJson<unknown>(
      'get_simple_data_table',
      { stream_id: streamId },
      { signal },
    )

    return this.selectNowNext(this.parsePrograms(epgListings(fallbackPayload)))
  }

  catchupUrl(item: StreamItem, start: Date, durationMinutes: number): string | null {
    if (!item.catchup?.available) {
      return null
    }

    const credentials = `${encodeURIComponent(this.profile.username)}/${encodeURIComponent(
      this.profile.password,
    )}`
    const datePart = [
      start.getFullYear(),
      String(start.getMonth() + 1).padStart(2, '0'),
      String(start.getDate()).padStart(2, '0'),
    ].join('-')
    const timePart = [
      String(start.getHours()).padStart(2, '0'),
      String(start.getMinutes()).padStart(2, '0'),
    ].join('-')
    const startTimestamp = `${datePart}:${timePart}`

    return `${this.baseUrl}/timeshift/${credentials}/${Math.max(1, Math.round(durationMinutes))}/${startTimestamp}/${encodeURIComponent(item.id)}.${item.containerExtension ?? 'ts'}`
  }

  streamUrl(item: StreamItem, preferDirectSource = true): string {
    if (preferDirectSource && item.directSource && /^https?:\/\//i.test(item.directSource)) {
      return item.directSource
    }

    const credentials = `${encodeURIComponent(this.profile.username)}/${encodeURIComponent(
      this.profile.password,
    )}`

    if (item.streamType === 'episode') {
      return `${this.baseUrl}/series/${credentials}/${encodeURIComponent(item.id)}.${
        item.containerExtension ?? 'mp4'
      }`
    }

    if (item.section === 'live') {
      return `${this.baseUrl}/live/${credentials}/${encodeURIComponent(item.id)}.${
        item.containerExtension ?? 'ts'
      }`
    }

    return `${this.baseUrl}/movie/${credentials}/${encodeURIComponent(item.id)}.${
      item.containerExtension ?? 'mp4'
    }`
  }

  private normalizeStream(record: RawRecord, section: LibrarySection): StreamItem {
    const isSeries = section === 'series'
    const name = readString(record.name ?? record.title) ?? 'Untitled'
    const cover = readString(record.movie_image ?? record.cover ?? record.cover_big)

    return {
      id: readString(isSeries ? record.series_id : record.stream_id) ?? '',
      name,
      section,
      categoryId: readString(record.category_id) ?? '',
      icon: readString(record.stream_icon),
      cover: cover ?? readString(record.stream_icon),
      rating: readString(record.rating),
      year: readString(record.year),
      added: readString(record.added),
      containerExtension: readString(record.container_extension),
      seriesId: readString(record.series_id),
      channelNumber: readString(record.num),
      catchup: parseCatchup(record),
      directSource: readString(record.direct_source),
      searchName: foldText(name),
    }
  }

  private selectNowNext(programs: Program[]): NowNext {
    const now = Date.now()
    const activeIndex = programs.findIndex(
      (program) => program.start.getTime() <= now && program.end.getTime() > now,
    )
    const nextIndex =
      activeIndex >= 0
        ? activeIndex + 1
        : programs.findIndex((program) => program.start.getTime() > now)

    return {
      now: activeIndex >= 0 ? programs[activeIndex] : undefined,
      next: nextIndex >= 0 ? programs[nextIndex] : undefined,
    }
  }

  private parsePrograms(value: unknown): Program[] {
    return readArray(value)
      .flatMap((listing) => {
        const record = readRecord(listing)
        const start = parseTimestamp(
          record.start_timestamp ??
            record.start ??
            record.start_time ??
            record.start_datetime ??
            record.start_date,
        )
        const end = parseTimestamp(
          record.stop_timestamp ??
            record.end_timestamp ??
            record.end ??
            record.stop ??
            record.end_time ??
            record.stop_time ??
            record.end_datetime ??
            record.end_date,
        )

        if (!start || !end || end.getTime() <= start.getTime()) {
          return []
        }

        const encodedTitle = readString(record.title ?? record.name ?? record.program_title) ?? ''
        const encodedDescription =
          readString(record.description ?? record.descr ?? record.program_description) ?? ''

        return [{
          title: this.decodeBase64(encodedTitle),
          description: this.decodeBase64(encodedDescription),
          start,
          end,
        }]
      })
      .sort((left, right) => left.start.getTime() - right.start.getTime())
  }

  private decodeBase64(value: string): string {
    // Providers are inconsistent: some base64-encode EPG titles/descriptions,
    // others send them as plain text. Blindly calling atob() corrupts plain
    // titles that happen to be valid base64 (e.g. "Film" -> "\u0016)f") because
    // atob() succeeds instead of throwing, so a round-trip check is not enough.
    // Only accept the decoded result when it is valid UTF-8 (decodeURIComponent
    // does not throw), contains no control/replacement characters, and reads as
    // mostly letters/digits/spaces across common scripts; otherwise keep the
    // original plain text.
    if (!value || value.length % 4 !== 0 || !BASE64_SHAPE.test(value)) {
      return value
    }

    let decoded: string

    try {
      decoded = decodeURIComponent(
        Array.from(atob(value), (character) => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
      )
    } catch {
      return value
    }

    if (CONTROL_CHARACTERS.test(decoded)) {
      return value
    }

    return textReadabilityRatio(decoded) >= 0.6 ? decoded : value
  }
}