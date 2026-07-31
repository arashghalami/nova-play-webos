import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { XtreamProfile } from './types'
import { XtreamClient } from './xtream-client'

const profile: XtreamProfile = {
  id: 'provider-metadata-test',
  name: 'Provider metadata test',
  serverUrl: 'https://example.test',
  username: 'user',
  password: 'password',
}

describe('Xtream provider metadata', () => {
  beforeEach(() => {
    vi.stubGlobal('window', globalThis)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('retains structured people portraits and tags a recognized provider classification', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            movie_data: { stream_id: '42', container_extension: 'mp4' },
            info: {
              title: 'Example',
              certification: 'PG-13',
              cast: [
                {
                  id: '100',
                  name: 'Example Actor',
                  character: 'Lead',
                  profile_image: 'https://images.example/actor.jpg',
                },
              ],
              crew: [
                {
                  person_id: '200',
                  name: 'Example Director',
                  job: 'Director',
                  image: 'https://images.example/director.jpg',
                },
              ],
            },
          }),
          { status: 200 },
        ),
      ),
    )
    const client = new XtreamClient(profile)

    const details = await client.vodInfo('42')

    expect(details.metadata.contentRating).toEqual({
      value: 'PG-13',
      system: 'MPAA',
      minimumAge: 13,
      source: 'xtream',
      provider: 'xtream',
      sourceLabel: 'Xtream',
      official: true,
    })
    expect(details.metadata.contentRatings).toEqual([details.metadata.contentRating])
    expect(details.metadata.ageGuidance).toMatchObject({
      suggestedMinimumAge: 13,
      basis: 'derived',
      confidence: 'medium',
    })
    expect(details.metadata.providerCast).toEqual([
      {
        id: '100',
        name: 'Example Actor',
        character: 'Lead',
        profileImage: 'https://images.example/actor.jpg',
        source: 'xtream',
      },
    ])
    expect(details.metadata.providerCrew).toEqual([
      {
        id: '200',
        name: 'Example Director',
        job: 'Director',
        profileImage: 'https://images.example/director.jpg',
        source: 'xtream',
      },
    ])
  })

  it('keeps recognized Netherlands provider classifications as Kijkwijzer candidates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            movie_data: { stream_id: '7' },
            info: { age_rating: '12', country_code: 'nl' },
          }),
          { status: 200 },
        ),
      ),
    )

    const details = await new XtreamClient(profile).vodInfo('7')

    expect(details.metadata.contentRating).toMatchObject({
      value: '12',
      system: 'Kijkwijzer',
      region: 'NL',
      provider: 'xtream',
    })
    expect(details.metadata.ageGuidance).toMatchObject({
      suggestedMinimumAge: 12,
      basis: 'official-certification',
      confidence: 'high',
    })
  })

  it('never converts IMDb or editorial scores into a classification', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            movie_data: { stream_id: '8' },
            info: { certification: 'IMDb 8' },
          }),
          { status: 200 },
        ),
      ),
    )

    const details = await new XtreamClient(profile).vodInfo('8')

    expect(details.metadata.contentRating).toBeUndefined()
    expect(details.metadata.contentRatings).toBeUndefined()
    expect(details.metadata.ageGuidance).toBeUndefined()
  })
})