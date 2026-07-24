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