import type {
  AccountSummary,
  CatchupCapability,
  Category,
  LibrarySection,
  NowNext,
  Program,
  RichMetadata,
  SeriesDetails,
  StreamItem,
  Trailer,
  VodDetails,
  XtreamProfile,
} from './types'

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
const MAX_SEARCH_RECORD_CHARS = 2 * 1024 * 1024
const NORMALIZATION_BATCH_SIZE = 400
const RESPONSE_TOO_LARGE_MESSAGE =
  'This provider response is too large to load safely. Open a category to load a smaller portion of the catalog.'

type RequestOptions = {
  signal?: AbortSignal
  timeoutMs?: number
}

type StreamSearchOptions = RequestOptions & {
  limit?: number
  excludeCategoryIds?: ReadonlySet<string>
  onMatches?: (matches: StreamItem[]) => void
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

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function toBaseUrl(serverUrl: string): string {
  const normalized = serverUrl.trim().replace(/\/+$/, '')

  if (!/^https?:\/\//i.test(normalized)) {
    throw new Error('Use a full server URL beginning with http:// or https://.')
  }

  return normalized
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
      throw new Error(RESPONSE_TOO_LARGE_MESSAGE)
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
      throw new Error(RESPONSE_TOO_LARGE_MESSAGE)
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

  return {
    originalTitle: readString(record.o_name ?? record.original_name),
    plot: readString(record.plot ?? record.description),
    cover: readString(record.movie_image ?? record.cover ?? record.cover_big),
    backdrops: backdrops.length ? backdrops : undefined,
    genre: readString(record.genre),
    cast: readString(record.cast ?? record.actors),
    director: readString(record.director),
    country: readString(record.country),
    releaseDate: readString(record.releasedate ?? record.release_date ?? record.releaseDate),
    year: readString(record.year),
    rating: readString(record.rating),
    ratingFiveBased: readString(record.rating_5based),
    duration: readString(record.duration),
    durationSeconds: parseDurationSeconds(record.duration_secs ?? record.duration_seconds),
    ageRating: readString(record.age ?? record.age_rating ?? record.mpaa_rating),
    tmdbId: readString(record.tmdb_id ?? record.tmdb),
    trailer,
  }
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
        response = await fetch(this.apiUrl(action, parameters), { signal: controller.signal })
      } catch {
        if (options.signal?.aborted) {
          throw new Error('Request cancelled.')
        }

        if (controller.signal.aborted) {
          throw new Error('The provider took too long to respond. Please try again.')
        }

        throw new Error(
          'Unable to reach this provider. Check the server URL and your internet connection.',
        )
      }

      if (!response.ok) {
        throw new Error(`The provider returned HTTP ${response.status}.`)
      }

      const contentLength = Number(response.headers.get('content-length'))

      if (Number.isFinite(contentLength) && contentLength > MAX_JSON_RESPONSE_BYTES) {
        throw new Error(RESPONSE_TOO_LARGE_MESSAGE)
      }

      let source

      try {
        source = await readResponseText(response)
      } catch (reason) {
        if (reason instanceof Error && reason.message === RESPONSE_TOO_LARGE_MESSAGE) {
          throw reason
        }

        if (options.signal?.aborted) {
          throw new Error('Request cancelled.')
        }

        if (controller.signal.aborted) {
          throw new Error('The provider took too long to respond. Please try again.')
        }

        throw new Error('The provider response could not be read.')
      }

      try {
        return JSON.parse(source) as T
      } catch {
        if (options.signal?.aborted) {
          throw new Error('Request cancelled.')
        }

        throw new Error('The provider sent an invalid response.')
      }
    } finally {
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
      throw new Error('The provider rejected that username or password.')
    }

    return {
      status: readString(user.status) ?? 'Unknown',
      expiresAt: readString(user.exp_date),
      activeConnections: readString(user.active_cons),
      maxConnections: readString(user.max_connections),
    }
  }

  async categories(section: LibrarySection, signal?: AbortSignal): Promise<Category[]> {
    const actions: Record<LibrarySection, string> = {
      live: 'get_live_categories',
      vod: 'get_vod_categories',
      series: 'get_series_categories',
    }

    const payload = await this.getJson<unknown[]>(
      actions[section],
      {},
      { signal, timeoutMs: 30_000 },
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
  ): Promise<StreamItem[]> {
    const actions: Record<LibrarySection, string> = {
      live: 'get_live_streams',
      vod: 'get_vod_streams',
      series: 'get_series',
    }
    const parameters: Record<string, string> = categoryId ? { category_id: categoryId } : {}
    const payload = await this.getJson<unknown[]>(actions[section], parameters, { signal })

    if (!Array.isArray(payload)) {
      return []
    }

    const streams: StreamItem[] = []

    for (let index = 0; index < payload.length; index += 1) {
      if (signal?.aborted) {
        throw new Error('Request cancelled.')
      }

      const stream = this.normalizeStream(readRecord(payload[index]), section)

      if (stream.id) {
        streams.push(stream)
      }

      if (index > 0 && index % NORMALIZATION_BATCH_SIZE === 0) {
        await yieldToBrowser()
      }
    }

    return streams
  }

  async searchStreams(
    section: LibrarySection,
    query: string,
    options: StreamSearchOptions = {},
  ): Promise<StreamItem[]> {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const limit = Math.max(1, options.limit ?? 180)

    if (!normalizedQuery) {
      return []
    }

    const actions: Record<LibrarySection, string> = {
      live: 'get_live_streams',
      vod: 'get_vod_streams',
      series: 'get_series',
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)
    const abortFromCaller = (): void => controller.abort()
    const matches: StreamItem[] = []
    let pendingMatches: StreamItem[] = []
    let objectBuffer = ''
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

      options.onMatches?.(pendingMatches)
      pendingMatches = []
    }

    const processRecord = (source: string): boolean => {
      try {
        const record = readRecord(JSON.parse(source))
        const name = readString(record.name ?? record.title) ?? ''

        if (!name.toLocaleLowerCase().includes(normalizedQuery)) {
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

    const processChunk = (chunk: string): boolean => {
      for (let index = 0; index < chunk.length; index += 1) {
        const character = chunk[index]

        if (!objectBuffer) {
          if (character === '{') {
            objectBuffer = character
            objectDepth = 1
            inString = false
            escaped = false
          }
          continue
        }

        objectBuffer += character

        if (objectBuffer.length > MAX_SEARCH_RECORD_CHARS) {
          objectBuffer = ''
          objectDepth = 0
          inString = false
          escaped = false
          continue
        }

        if (inString) {
          if (escaped) {
            escaped = false
          } else if (character === '\\') {
            escaped = true
          } else if (character === '"') {
            inString = false
          }
          continue
        }

        if (character === '"') {
          inString = true
        } else if (character === '{') {
          objectDepth += 1
        } else if (character === '}') {
          objectDepth -= 1

          if (objectDepth === 0) {
            const recordSource = objectBuffer
            objectBuffer = ''

            if (processRecord(recordSource)) {
              flushMatches()
              return true
            }
          }
        }
      }

      flushMatches()
      return matches.length >= limit
    }

    try {
      let response: Response

      try {
        response = await fetch(this.apiUrl(actions[section]), {
          signal: controller.signal,
        })
      } catch {
        if (options.signal?.aborted) {
          throw new Error('Request cancelled.')
        }

        if (controller.signal.aborted) {
          throw new Error('The provider search took too long. Please try again.')
        }

        throw new Error('Unable to search this provider right now.')
      }

      if (!response.ok) {
        throw new Error(`The provider returned HTTP ${response.status}.`)
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
            processChunk(decoder.decode())
            break
          }

          if (value && processChunk(decoder.decode(value, { stream: true }))) {
            await reader.cancel()
            break
          }
        }
      } else {
        processChunk(await response.text())
      }

      flushMatches()
      return matches
    } catch (reason) {
      flushMatches()

      if (options.signal?.aborted) {
        throw new Error('Request cancelled.')
      }

      if (controller.signal.aborted) {
        throw new Error('The provider search took too long. Please try again.')
      }

      throw reason
    } finally {
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
        const id = readString(record.id)

        if (!id) {
          return []
        }

        const metadata = parseMetadata({ ...record, ...info })

        return [{
          id,
          name: readString(record.title ?? record.name) ?? 'Untitled episode',
          section: 'series',
          categoryId: '',
          cover: metadata.cover,
          rating: metadata.rating,
          year: metadata.year,
          containerExtension: readString(record.container_extension) ?? 'mp4',
          streamType: 'episode',
          plot: metadata.plot,
          season,
          episodeNumber: readString(record.episode_num ?? info.episode_num),
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
    const payload = readRecord(
      await this.getJson<RawRecord>(
        'get_simple_data_table',
        { stream_id: streamId, limit: String(limit) },
        { signal },
      ),
    )

    return this.parsePrograms(payload.epg_listings)
  }

  async nowNext(streamId: string, signal?: AbortSignal): Promise<NowNext> {
    const payload = readRecord(
      await this.getJson<RawRecord>(
        'get_short_epg',
        { stream_id: streamId, limit: '2' },
        { signal },
      ),
    )
    const programs = this.parsePrograms(payload.epg_listings ?? payload.epg_list ?? payload.listings)

    if (programs.length) {
      return {
        now: programs[0],
        next: programs[1],
      }
    }

    const fallbackPayload = readRecord(
      await this.getJson<RawRecord>(
        'get_simple_data_table',
        {
          stream_id: streamId,
          limit: '24',
        },
        { signal },
      ),
    )
    const fallbackPrograms = this.parsePrograms(fallbackPayload.epg_listings)
    const now = Date.now()
    const activeIndex = fallbackPrograms.findIndex(
      (program) => program.start.getTime() <= now && program.end.getTime() > now,
    )
    const nextIndex =
      activeIndex >= 0
        ? activeIndex + 1
        : fallbackPrograms.findIndex((program) => program.start.getTime() > now)

    return {
      now: activeIndex >= 0 ? fallbackPrograms[activeIndex] : undefined,
      next: fallbackPrograms[nextIndex] ?? fallbackPrograms[nextIndex + 1],
    }
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

  streamUrl(item: StreamItem): string {
    if (item.directSource && /^https?:\/\//i.test(item.directSource)) {
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
      searchName: name.toLocaleLowerCase(),
    }
  }

  private parsePrograms(value: unknown): Program[] {
    return readArray(value).flatMap((listing) => {
      const record = readRecord(listing)
      const start = parseTimestamp(record.start_timestamp ?? record.start)
      const end = parseTimestamp(record.stop_timestamp ?? record.end)

      if (!start || !end) {
        return []
      }

      const encodedTitle = readString(record.title ?? record.name) ?? ''
      const encodedDescription = readString(record.description ?? record.descr) ?? ''

      return [{
        title: this.decodeBase64(encodedTitle),
        description: this.decodeBase64(encodedDescription),
        start,
        end,
      }]
    })
  }

  private decodeBase64(value: string): string {
    try {
      return decodeURIComponent(
        Array.from(atob(value), (character) => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
      )
    } catch {
      return value
    }
  }
}