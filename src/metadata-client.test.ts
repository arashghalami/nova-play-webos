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

  it('normalizes the proxy title response and removes malformed people', async () => {
    import.meta.env.VITE_METADATA_PROXY_URL = 'https://metadata.example'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tmdbId: '123',
          mediaType: 'movie',
          tagline: 'A story',
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
    ).resolves.toEqual({
      tmdbId: '123',
      mediaType: 'movie',
      tagline: 'A story',
      cast: [{ id: 'p1', name: 'Actor', profileImage: 'https://images.example/a.jpg', character: 'Hero' }],
      crew: [{ id: 'p2', name: 'Director', job: 'Director' }],
      related: [{ id: '456', mediaType: 'tv', title: 'Related', year: '2025', overview: undefined }],
    })
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