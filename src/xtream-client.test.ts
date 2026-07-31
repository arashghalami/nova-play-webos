import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { XtreamProfile } from './types'
import { XtreamClient } from './xtream-client'

const profile: XtreamProfile = {
  id: 'test-profile',
  name: 'Test playlist',
  serverUrl: 'https://example.test',
  username: 'user',
  password: 'password',
}

describe('XtreamClient global search', () => {
  beforeEach(() => {
    vi.stubGlobal('window', globalThis)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('publishes only matching provider records and respects the section limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          { stream_id: '1', name: 'Anne with an E', category_id: 'movies' },
          { stream_id: '2', name: 'Unrelated title', category_id: 'movies' },
          { stream_id: '3', name: 'Anne of Green Gables', category_id: 'movies' },
        ]),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const batches: string[][] = []
    const client = new XtreamClient(profile)

    const matches = await client.searchStreams('vod', 'anne', {
      limit: 2,
      onMatches: (batch) => batches.push(batch.map((stream) => stream.id)),
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(matches.map((stream) => stream.id)).toEqual(['1', '3'])
    expect(batches.flat()).toEqual(['1', '3'])
  })

  it('honors a caller-provided stream request timeout', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new XtreamClient(profile)

    const outcome = client
      .streams('vod', 'movies', undefined, 50)
      .then(
        () => null,
        (reason: unknown) => reason,
      )
    await vi.advanceTimersByTimeAsync(50)

    // Retryable matters as much as the message: the global-search category
    // fallback exists for providers that stall on whole-library endpoints, and
    // it is gated on this flag.
    await expect(outcome).resolves.toMatchObject({
      message: 'The provider took too long to respond. Please try again.',
      kind: 'timeout',
      retryable: true,
    })
    vi.useRealTimers()
  })

  it('supports opt-in match-all scanning up to its requested limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          { stream_id: '1', name: 'First title', category_id: 'movies' },
          { stream_id: '2', name: 'Second title', category_id: 'movies' },
          { stream_id: '3', name: 'Third title', category_id: 'movies' },
        ]),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new XtreamClient(profile)

    const streams = await client.searchStreams('vod', '', { limit: 2, matchAll: true })

    expect(streams.map((stream) => stream.id)).toEqual(['1', '2'])
  })

  it('matches accented titles and multi-term, order-independent queries', async () => {
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Response(
          JSON.stringify([
            { stream_id: '1', name: 'Pokémon Journeys', category_id: 'kids' },
            { stream_id: '2', name: 'The Office (US)', category_id: 'comedy' },
            { stream_id: '3', name: 'The Office (UK)', category_id: 'comedy' },
          ]),
          { status: 200 },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new XtreamClient(profile)

    const accented = await client.searchStreams('vod', 'pokemon')
    expect(accented.map((stream) => stream.id)).toEqual(['1'])

    const multiTerm = await client.searchStreams('vod', 'us office')
    expect(multiTerm.map((stream) => stream.id)).toEqual(['2'])
  })

  it('observes cancellation after yielding parser work and publishes no late match batches', async () => {
    const originalNow = Date.now
    let now = 0
    vi.spyOn(Date, 'now').mockImplementation(() => {
      now += 9
      return now
    })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          { stream_id: '1', name: 'Anne with an E', category_id: 'movies' },
          { stream_id: '2', name: 'Anne of Green Gables', category_id: 'movies' },
        ]),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const published: string[][] = []
    const client = new XtreamClient(profile)

    await expect(
      client.searchStreams('vod', 'anne', {
        signal: controller.signal,
        onMatches: (batch) => {
          published.push(batch.map((stream) => stream.id))
          controller.abort()
        },
      }),
    ).rejects.toThrow('Request cancelled.')

    expect(published).toEqual([['1']])
    Date.now = originalNow
  })
})

describe('XtreamClient series details', () => {
  beforeEach(() => {
    vi.stubGlobal('window', globalThis)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('retains episode stories, stills, dates, durations, and alternate episode identifiers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          info: {
            name: 'Example Series',
            cover: 'https://images.example/series.jpg',
          },
          episodes: {
            '1': [
              {
                episode_id: 'episode-101',
                episode_number: '1',
                title: 'The Beginning',
                info: {
                  story: 'The team reunites for an unexpected case.',
                  episode_image: 'https://images.example/episode-101.jpg',
                  air_date: '2025-04-12',
                  duration: '00:42:30',
                  vote_average: '8.4',
                },
              },
            ],
          },
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new XtreamClient(profile)

    const series = await client.seriesInfo('series-1')
    const episode = series.episodes['1'][0]

    expect(episode).toMatchObject({
      id: 'episode-101',
      name: 'The Beginning',
      season: '1',
      episodeNumber: '1',
      cover: 'https://images.example/episode-101.jpg',
      plot: 'The team reunites for an unexpected case.',
    })
    expect(episode.metadata).toMatchObject({
      plot: 'The team reunites for an unexpected case.',
      cover: 'https://images.example/episode-101.jpg',
      releaseDate: '2025-04-12',
      duration: '00:42:30',
      durationSeconds: 2_550,
      rating: '8.4',
    })
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('action')).toBe(
      'get_series_info',
    )
  })
})

describe('XtreamClient EPG', () => {
  beforeEach(() => {
    vi.stubGlobal('window', globalThis)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('accepts alternate EPG wrappers and field names without sending unsupported simple-EPG parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          epg_list: [
            {
              title: 'TW9ybmluZyBOZXdz',
              description: 'RGFpbHkgaGVhZGxpbmVz',
              start_time: '20260101090000',
              end_time: '20260101100000',
            },
          ],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new XtreamClient(profile)

    const programs = await client.epg('42', 8)

    expect(programs).toHaveLength(1)
    expect(programs[0]).toMatchObject({
      title: 'Morning News',
      description: 'Daily headlines',
    })
    expect(programs[0].start).toEqual(new Date(2026, 0, 1, 9, 0, 0))
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]))
    expect(requestUrl.searchParams.get('action')).toBe('get_simple_data_table')
    expect(requestUrl.searchParams.get('stream_id')).toBe('42')
    expect(requestUrl.searchParams.has('limit')).toBe(false)
  })

  it('accepts direct-array EPG payloads, nested data payloads, and sorts programs chronologically', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              name: 'TGF0ZXI=',
              start_timestamp: '1767271200',
              end_timestamp: '1767274800',
            },
            {
              name: 'RWFybGllcg==',
              start_timestamp: '1767267600',
              stop_timestamp: '1767271200',
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              programs: [
                {
                  program_title: 'TmVzdGVk',
                  start: '1767274800',
                  stop: '1767278400',
                },
              ],
            },
          }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)
    const client = new XtreamClient(profile)

    const directPrograms = await client.epg('42', 8)
    const nestedPrograms = await client.epg('42', 8)

    expect(directPrograms.map((program) => program.title)).toEqual(['Earlier', 'Later'])
    expect(nestedPrograms.map((program) => program.title)).toEqual(['Nested'])
  })

  it('uses the same compatible parser for now/next fallback and selects the active program', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(150_000)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ listings: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              epg_listings: [
                {
                  title: 'UGFzdA==',
                  start_timestamp: '0',
                  stop_timestamp: '100',
                },
                {
                  title: 'Tm93',
                  start_timestamp: '100',
                  stop_timestamp: '200',
                },
                {
                  title: 'TmV4dA==',
                  start_timestamp: '200',
                  stop_timestamp: '300',
                },
              ],
            },
          }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)
    const client = new XtreamClient(profile)

    const nowNext = await client.nowNext('42')

    expect(nowNext.now?.title).toBe('Now')
    expect(nowNext.next?.title).toBe('Next')
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('limit')).toBe('2')
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.has('limit')).toBe(false)
  })

  it('normalizes a pasted player_api.php server URL before building EPG requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ epg_listings: [] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new XtreamClient({
      ...profile,
      serverUrl: 'https://example.test:8443/player_api.php?legacy=true#fragment',
    })

    await client.epg('42')

    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]))
    expect(requestUrl.pathname).toBe('/player_api.php')
    expect(requestUrl.port).toBe('8443')
  })

  it('parses space-separated datetime start/end fields (webOS Chromium safe)', async () => {
    // Older webOS Chromium returns Invalid Date for the non-ISO space form, so
    // the client must parse the components itself rather than trust new Date().
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          epg_listings: [
            {
              title: 'TW9ybmluZyBOZXdz',
              description: 'RGFpbHkgaGVhZGxpbmVz',
              start: '2026-01-01 09:00:00',
              end: '2026-01-01 10:00:00',
            },
          ],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new XtreamClient(profile)

    const programs = await client.epg('42', 8)

    expect(programs).toHaveLength(1)
    expect(programs[0]).toMatchObject({ title: 'Morning News', description: 'Daily headlines' })
    expect(programs[0].start).toEqual(new Date(2026, 0, 1, 9, 0, 0))
    expect(programs[0].end).toEqual(new Date(2026, 0, 1, 10, 0, 0))
  })

  it('parses space-separated datetime without seconds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          epg_listings: [
            { title: 'Tm9vbg==', start: '2026-01-01 12:00', end: '2026-01-01 13:00' },
          ],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new XtreamClient(profile)

    const programs = await client.epg('42', 8)

    expect(programs).toHaveLength(1)
    expect(programs[0].start).toEqual(new Date(2026, 0, 1, 12, 0, 0))
  })

  it('keeps plain-text titles that are coincidentally valid base64', async () => {
    // 'Film', 'Kids', 'Cinema' are valid base64 and would otherwise be decoded
    // into garbage. The round-trip guard must keep them as plain text.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          epg_listings: [
            {
              title: 'Film',
              description: 'Cinema',
              start_timestamp: '1767258000',
              stop_timestamp: '1767261600',
            },
            {
              title: 'News at Nine',
              description: 'Plain sentence with spaces',
              start_timestamp: '1767261600',
              stop_timestamp: '1767265200',
            },
          ],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new XtreamClient(profile)

    const programs = await client.epg('42', 8)

    expect(programs.map((program) => program.title)).toEqual(['Film', 'News at Nine'])
    expect(programs[0].description).toBe('Cinema')
    expect(programs[1].description).toBe('Plain sentence with spaces')
  })

  it('still decodes genuinely base64-encoded titles', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          epg_listings: [
            {
              title: 'TW9ybmluZyBOZXdz',
              start_timestamp: '1767258000',
              stop_timestamp: '1767261600',
            },
          ],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new XtreamClient(profile)

    const programs = await client.epg('42', 8)

    expect(programs[0].title).toBe('Morning News')
  })
})

describe('XtreamClient provider failure classification', () => {
  // A distinctive password, so asserting that it was scrubbed proves the
  // redaction ran rather than coincidentally matching a common word.
  const bannedProfile: XtreamProfile = {
    id: 'banned-profile',
    name: 'Banned playlist',
    serverUrl: 'https://example.test',
    username: 'alice',
    password: 's3cret-value',
  }

  beforeEach(() => {
    vi.stubGlobal('window', globalThis)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('classifies 403 as a non-retryable refusal and scrubs credentials echoed in the body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          'Access denied for /player_api.php?username=alice&password=s3cret-value',
          { status: 403, headers: { server: 'nginx', 'cf-ray': 'abc123' } },
        ),
      ),
    )
    const client = new XtreamClient(bannedProfile)

    const reason = await client.categories('live').then(
      () => null,
      (error: unknown) => error,
    )

    expect(reason).toMatchObject({
      isProviderError: true,
      kind: 'forbidden',
      retryable: false,
    })
    const diagnostics = (reason as { diagnostics: Record<string, unknown> }).diagnostics
    expect(diagnostics.status).toBe(403)
    expect(diagnostics.server).toBe('nginx')
    expect(diagnostics.proxied).toBe(true)
    expect(diagnostics.bodySnippet).not.toContain('s3cret-value')
    expect(diagnostics.bodySnippet).not.toContain('alice')
    expect(diagnostics.bodySnippet).toContain('Access denied')
  })

  it('classifies 429 as rate limited and records Retry-After', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('slow down', { status: 429, headers: { 'retry-after': '90' } }),
      ),
    )
    const client = new XtreamClient(bannedProfile)

    const reason = await client.categories('vod').then(
      () => null,
      (error: unknown) => error,
    )

    expect(reason).toMatchObject({ kind: 'rate-limited', retryable: false })
    expect(
      (reason as { diagnostics: { retryAfterMs?: number } }).diagnostics.retryAfterMs,
    ).toBe(90_000)
  })

  it('keeps 5xx retryable so a genuine provider stall still falls back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('bad gateway', { status: 502 })),
    )
    const client = new XtreamClient(bannedProfile)

    const reason = await client.categories('series').then(
      () => null,
      (error: unknown) => error,
    )

    expect(reason).toMatchObject({ kind: 'server', retryable: true })
    expect((reason as Error).message).toBe('The provider returned HTTP 502.')
  })

  it('classifies a refusal on the streamed search path as well', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('denied', { status: 403 })),
    )
    const client = new XtreamClient(bannedProfile)

    const reason = await client.searchStreams('vod', 'anne').then(
      () => null,
      (error: unknown) => error,
    )

    expect(reason).toMatchObject({
      isProviderError: true,
      kind: 'forbidden',
      retryable: false,
    })
  })

  it('classifies an account rejection as a non-retryable auth failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ user_info: { auth: 0 } }), { status: 200 }),
      ),
    )
    const client = new XtreamClient(bannedProfile)

    const reason = await client.validate().then(
      () => null,
      (error: unknown) => error,
    )

    expect(reason).toMatchObject({ kind: 'auth', retryable: false })
    expect((reason as Error).message).toContain('rejected that username or password')
  })
})