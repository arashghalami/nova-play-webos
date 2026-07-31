import { afterEach, describe, expect, it, vi } from 'vitest'

const originalProxyUrl = import.meta.env.VITE_METADATA_PROXY_URL

async function client() {
  return import('./metadata-client')
}

afterEach(() => {
  vi.unstubAllGlobals()

  if (originalProxyUrl === undefined) {
    delete import.meta.env.VITE_METADATA_PROXY_URL
  } else {
    import.meta.env.VITE_METADATA_PROXY_URL = originalProxyUrl
  }

  vi.resetModules()
})

describe('metadata client', () => {
  it('does not call the network while metadata proxy configuration is absent', async () => {
    delete import.meta.env.VITE_METADATA_PROXY_URL
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { loadTitleMetadata, metadataServiceConfigured } = await client()

    expect(metadataServiceConfigured()).toBe(false)
    await expect(
      loadTitleMetadata({ mediaType: 'movie', title: 'Example' }),
    ).rejects.toThrow('not configured')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('parses a bounded rating candidate payload and its selected resolution', async () => {
    import.meta.env.VITE_METADATA_PROXY_URL = 'https://metadata.example'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tmdbId: '123',
          mediaType: 'movie',
          tagline: 'A story',
          contentRatings: [
            {
              value: 'PG-13',
              system: 'MPAA',
              region: 'US',
              minimumAge: 13,
              provider: 'tmdb',
              sourceLabel: 'TMDB',
              official: true,
            },
            {
              value: '12',
              region: 'NL',
              provider: 'tmdb',
              sourceLabel: 'TMDB',
              official: true,
            },
            {
              value: 'IMDb 8',
              region: 'US',
              provider: 'tmdb',
              sourceLabel: 'TMDB',
              official: true,
            },
          ],
          ratingResolution: {
            preferredRegion: 'NL',
            fallbackUsed: false,
            selected: {
              value: '12',
              system: 'Kijkwijzer',
              region: 'NL',
              minimumAge: 12,
              provider: 'tmdb',
              sourceLabel: 'TMDB',
              official: true,
            },
            ageGuidance: {
              suggestedMinimumAge: 12,
              basis: 'official-certification',
              confidence: 'high',
            },
          },
          cast: [
            { id: 'p1', name: 'Actor', profileImage: 'https://images.example/a.jpg', character: 'Hero' },
            { id: '', name: 'Discarded' },
          ],
          crew: [{ id: 'p2', name: 'Director', job: 'Director' }],
          related: [{ id: '456', mediaType: 'tv', title: 'Related', year: '2025' }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { loadTitleMetadata } = await client()

    await expect(
      loadTitleMetadata({ mediaType: 'movie', title: 'Example', year: '2024' }),
    ).resolves.toMatchObject({
      tmdbId: '123',
      mediaType: 'movie',
      tagline: 'A story',
      contentRating: {
        value: '12',
        system: 'Kijkwijzer',
        region: 'NL',
        provider: 'tmdb',
        sourceLabel: 'TMDB',
      },
      ageGuidance: {
        suggestedMinimumAge: 12,
        basis: 'official-certification',
        confidence: 'high',
      },
      contentRatings: [
        expect.objectContaining({ value: 'PG-13', provider: 'tmdb' }),
        expect.objectContaining({ value: '12', system: 'Kijkwijzer', provider: 'tmdb' }),
      ],
      ratingResolution: expect.objectContaining({
        preferredRegion: 'NL',
        fallbackUsed: false,
        selected: expect.objectContaining({ value: '12', region: 'NL' }),
      }),
      cast: [{ id: 'p1', name: 'Actor', profileImage: 'https://images.example/a.jpg', character: 'Hero' }],
      crew: [{ id: 'p2', name: 'Director', job: 'Director' }],
      related: [{ id: '456', mediaType: 'tv', title: 'Related', year: '2025', overview: undefined }],
    })
  })

  it('retains legacy singular proxy ratings with compatible provenance', async () => {
    import.meta.env.VITE_METADATA_PROXY_URL = 'https://metadata.example'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            tmdbId: '124',
            mediaType: 'movie',
            contentRating: {
              value: 'PG-13',
              system: 'MPAA',
              region: 'US',
              minimumAge: 13,
              official: true,
            },
            ageGuidance: {
              suggestedMinimumAge: 13,
              basis: 'derived',
              confidence: 'medium',
            },
          }),
          { status: 200 },
        ),
      ),
    )

    const { loadTitleMetadata } = await client()

    await expect(loadTitleMetadata({ mediaType: 'movie', title: 'Legacy' })).resolves.toMatchObject({
      contentRating: {
        value: 'PG-13',
        provider: 'tmdb',
        sourceLabel: 'TMDB',
      },
      contentRatings: [
        expect.objectContaining({ value: 'PG-13', provider: 'tmdb' }),
      ],
      ageGuidance: {
        suggestedMinimumAge: 13,
        basis: 'derived',
        confidence: 'medium',
      },
    })
  })

  it('drops malformed candidate and resolution fields without losing unrelated title data', async () => {
    import.meta.env.VITE_METADATA_PROXY_URL = 'https://metadata.example'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            tmdbId: '125',
            mediaType: 'tv',
            contentRatings: [
              { value: 'TV-14', provider: 'invalid', sourceLabel: 'Unknown', official: true },
              { value: 'TV-14', provider: 'trakt', sourceLabel: 'x'.repeat(41), official: true },
            ],
            ratingResolution: {
              preferredRegion: 'NLD',
              selected: { value: 'TV-14', provider: 'trakt', sourceLabel: 'Trakt', official: true },
            },
            cast: [{ id: 'p1', name: 'Actor' }],
          }),
          { status: 200 },
        ),
      ),
    )

    const { loadTitleMetadata } = await client()
    const metadata = await loadTitleMetadata({ mediaType: 'tv', title: 'Example' })

    expect(metadata).toMatchObject({
      tmdbId: '125',
      mediaType: 'tv',
      cast: [{ id: 'p1', name: 'Actor' }],
    })
    expect(metadata?.contentRatings).toBeUndefined()
    expect(metadata?.ratingResolution).toBeUndefined()
  })

  it('loads TV-series cast portraits through the no-key TVMaze fallback', async () => {
    delete import.meta.env.VITE_METADATA_PROXY_URL
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              show: {
                id: 251,
                name: 'Downton Abbey',
              },
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              person: {
                id: 1,
                name: 'Michelle Dockery',
                image: { medium: 'https://static.example/michelle.jpg' },
              },
              character: { name: 'Lady Mary Crawley' },
            },
          ]),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)
    const { loadTvMazeSeriesMetadata } = await client()

    await expect(loadTvMazeSeriesMetadata('Downton Abbey')).resolves.toMatchObject({
      tmdbId: 'tvmaze-251',
      mediaType: 'tv',
      cast: [
        {
          id: 'tvmaze-1',
          name: 'Michelle Dockery',
          character: 'Lady Mary Crawley',
          profileImage: 'https://static.example/michelle.jpg',
        },
      ],
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.tvmaze.com/search/shows?q=Downton%20Abbey',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.tvmaze.com/shows/251/cast',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('allows only HTTPS external person profile links', async () => {
    import.meta.env.VITE_METADATA_PROXY_URL = 'https://metadata.example'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'p1',
            name: 'Actor',
            externalProfiles: [
              { label: 'Safe', url: 'https://example.com/profile' },
              { label: 'Unsafe', url: 'http://example.com/profile' },
            ],
            credits: [{ id: '9', mediaType: 'movie', title: 'Film' }],
          }),
          { status: 200 },
        ),
      ),
    )
    const { loadPersonMetadata } = await client()

    await expect(loadPersonMetadata('p1')).resolves.toMatchObject({
      id: 'p1',
      name: 'Actor',
      externalProfiles: [{ label: 'Safe', url: 'https://example.com/profile' }],
      credits: [{ id: '9', mediaType: 'movie', title: 'Film' }],
    })
  })
})