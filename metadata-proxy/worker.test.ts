import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, { type Env } from './worker'

const env: Env = {
  TMDB_BEARER_TOKEN: 'tmdb-secret-that-must-not-leak',
  METADATA_REGION: 'NL',
  METADATA_LANGUAGE: 'en-US',
  ALLOWED_ORIGINS: 'https://app.example,null',
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function baseTmdbFetch(options: {
  classifications?: unknown
  classificationStatus?: number
  title?: string
} = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input)

    if (url.includes('/release_dates') || url.includes('/content_ratings')) {
      return response(
        options.classifications ?? { results: [] },
        options.classificationStatus ?? 200,
      )
    }

    if (/\/movie\/1(?:\?|$)/.test(url) || /\/tv\/1(?:\?|$)/.test(url)) {
      return response({
        title: options.title ?? 'Example',
        name: options.title ?? 'Example',
        poster_path: '/exampleposter.jpg',
      })
    }

    if (url.includes('/credits')) {
      return response({ cast: [{ id: 1, name: 'Actor' }], crew: [] })
    }

    if (url.includes('/recommendations')) {
      return response({ results: [] })
    }

    throw new Error(`Unexpected request: ${url}`)
  })
}

async function resolveTitle(
  body: Record<string, unknown> = { mediaType: 'movie', tmdbId: '1', title: 'Example' },
  requestHeaders: HeadersInit = {},
  requestEnv: Env = env,
): Promise<Response> {
  return worker.fetch(
    new Request('https://metadata.example/v1/resolve-title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...requestHeaders },
      body: JSON.stringify(body),
    }),
    requestEnv,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('metadata Worker rating aggregation', () => {
  it('collects TMDB candidates, selects Netherlands Kijkwijzer, and emits bounded provenance', async () => {
    vi.stubGlobal(
      'fetch',
      baseTmdbFetch({
        classifications: {
          results: [
            {
              iso_3166_1: 'US',
              release_dates: [{ certification: 'PG-13' }],
            },
            {
              iso_3166_1: 'NL',
              release_dates: [{ certification: '12' }],
            },
          ],
        },
      }),
    )

    const response = await resolveTitle()
    const payload = await response.json() as Record<string, unknown>
    const resolution = payload.ratingResolution as Record<string, unknown>
    const selected = resolution.selected as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(payload.contentRatings).toEqual([
      expect.objectContaining({ value: 'PG-13', provider: 'tmdb', region: 'US' }),
      expect.objectContaining({ value: '12', provider: 'tmdb', region: 'NL', system: 'Kijkwijzer' }),
    ])
    expect(selected).toMatchObject({
      value: '12',
      provider: 'tmdb',
      region: 'NL',
      system: 'Kijkwijzer',
    })
    expect(resolution.ageGuidance).toMatchObject({
      suggestedMinimumAge: 12,
      basis: 'official-certification',
    })
    expect(JSON.stringify(payload)).not.toContain(env.TMDB_BEARER_TOKEN)
  })

  it('exposes the title poster as a credential-free w342 image URL', async () => {
    vi.stubGlobal('fetch', baseTmdbFetch())

    const response = await resolveTitle()
    const payload = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(payload.poster).toBe('https://image.tmdb.org/t/p/w342/exampleposter.jpg')
    // No credential ever leaks into the poster URL or the payload.
    expect(String(payload.poster)).not.toContain(env.TMDB_BEARER_TOKEN)
  })

  it('omits the poster when TMDB has no poster_path', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/release_dates') || url.includes('/content_ratings')) {
        return response({ results: [] })
      }
      if (/\/movie\/1(?:\?|$)/.test(url)) {
        return response({ title: 'No Art' }) // no poster_path
      }
      if (url.includes('/credits')) {
        return response({ cast: [], crew: [] })
      }
      if (url.includes('/recommendations')) {
        return response({ results: [] })
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const response2 = await resolveTitle()
    const payload = (await response2.json()) as Record<string, unknown>

    expect(response2.status).toBe(200)
    expect(payload.poster).toBeUndefined()
  })

  it('uses Trakt classification only as a deterministic fallback when TMDB lacks Netherlands data', async () => {
    const fetchMock = baseTmdbFetch({
      classifications: {
        results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'PG-13' }] }],
      },
    })
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input)

      if (url.includes('api.trakt.tv/search/tmdb/1')) {
        return response([
          {
            movie: {
              title: 'Example',
              year: 2024,
              certification: 'TV-14',
              country: 'US',
            },
          },
        ])
      }

      if (url.includes('/release_dates')) {
        return response({
          results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'PG-13' }] }],
        })
      }

      if (/\/movie\/1(?:\?|$)/.test(url)) {
        return response({ title: 'Example' })
      }

      if (url.includes('/credits')) {
        return response({ cast: [], crew: [] })
      }

      if (url.includes('/recommendations')) {
        return response({ results: [] })
      }

      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const proxyResponse = await resolveTitle(
      { mediaType: 'movie', tmdbId: '1', title: 'Example', year: '2024' },
      {},
      { ...env, TRAKT_CLIENT_ID: 'trakt-client-id' },
    )
    const payload = await proxyResponse.json() as Record<string, unknown>
    const resolution = payload.ratingResolution as Record<string, unknown>

    expect(
      proxyResponse.status,
      JSON.stringify({
        payload,
        calls: fetchMock.mock.calls.map(([input]) => String(input)),
      }),
    ).toBe(200)
    expect(resolution.selected).toMatchObject({
      value: 'TV-14',
      provider: 'trakt',
      sourceLabel: 'Trakt',
    })
    expect(resolution.fallbackUsed).toBe(true)
  })

  it('falls back to an exact Trakt title and year match after an empty TMDB-ID lookup', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)

      if (url.includes('api.trakt.tv/search/tmdb/1')) {
        return response([])
      }

      if (url.includes('api.trakt.tv/search/movie?query=Example')) {
        return response([
          {
            movie: {
              title: 'Example',
              year: 2023,
              certification: 'TV-MA',
              country: 'US',
            },
          },
          {
            movie: {
              title: 'Example',
              year: 2024,
              certification: 'TV-14',
              country: 'US',
            },
          },
        ])
      }

      if (url.includes('/release_dates')) {
        return response({ results: [] })
      }

      if (/\/movie\/1(?:\?|$)/.test(url)) {
        return response({ title: 'Example' })
      }

      if (url.includes('/credits')) {
        return response({ cast: [], crew: [] })
      }

      if (url.includes('/recommendations')) {
        return response({ results: [] })
      }

      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const proxyResponse = await resolveTitle(
      { mediaType: 'movie', tmdbId: '1', title: 'Example', year: '2024' },
      {},
      { ...env, TRAKT_CLIENT_ID: 'trakt-client-id' },
    )
    const payload = await proxyResponse.json() as Record<string, unknown>
    const resolution = payload.ratingResolution as Record<string, unknown>

    expect(proxyResponse.status).toBe(200)
    expect(resolution.selected).toMatchObject({
      value: 'TV-14',
      provider: 'trakt',
      region: 'US',
    })
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain(
      'https://api.trakt.tv/search/movie?query=Example',
    )
  })

  it('keeps TMDB classification content when Trakt is unavailable', async () => {
    const fetchMock = baseTmdbFetch({
      classifications: {
        results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'PG-13' }] }],
      },
    })
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input)

      if (url.includes('api.trakt.tv/')) {
        return response({}, 503)
      }

      if (url.includes('/release_dates')) {
        return response({
          results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'PG-13' }] }],
        })
      }

      if (/\/movie\/1(?:\?|$)/.test(url)) {
        return response({ title: 'Example' })
      }

      if (url.includes('/credits')) {
        return response({ cast: [], crew: [] })
      }

      if (url.includes('/recommendations')) {
        return response({ results: [] })
      }

      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const proxyResponse = await resolveTitle(
      { mediaType: 'movie', tmdbId: '1', title: 'Example' },
      {},
      { ...env, TRAKT_CLIENT_ID: 'trakt-client-id' },
    )
    const payload = await proxyResponse.json() as Record<string, unknown>

    expect(proxyResponse.status).toBe(200)
    expect(payload.contentRating).toMatchObject({
      value: 'PG-13',
      provider: 'tmdb',
      region: 'US',
    })
  })

  it('preserves title, people, and recommendations when classification lookup fails', async () => {
    vi.stubGlobal(
      'fetch',
      baseTmdbFetch({
        classificationStatus: 503,
        title: 'Resilient title',
      }),
    )

    const response = await resolveTitle()
    const payload = await response.json() as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(payload.title).toBe('Resilient title')
    expect(payload.cast).toEqual([{ id: '1', name: 'Actor' }])
    expect(payload.contentRatings).toEqual([])
    expect(payload.ratingResolution).toMatchObject({
      preferredRegion: 'NL',
      fallbackUsed: false,
    })
  })

  it('enforces an explicit CORS allowlist including null only when configured', async () => {
    vi.stubGlobal('fetch', baseTmdbFetch())

    const allowed = await resolveTitle(
      undefined,
      { Origin: 'https://app.example' },
    )
    const packaged = await resolveTitle(
      undefined,
      { Origin: 'null' },
    )
    const denied = await resolveTitle(
      undefined,
      { Origin: 'https://untrusted.example' },
    )
    const preflight = await worker.fetch(
      new Request('https://metadata.example/v1/resolve-title', {
        method: 'OPTIONS',
        headers: { Origin: 'https://app.example' },
      }),
      env,
    )

    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example')
    expect(packaged.headers.get('Access-Control-Allow-Origin')).toBe('null')
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toContain('POST')
  })
})