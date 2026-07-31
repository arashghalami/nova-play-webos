import { describe, expect, it, vi } from 'vitest'
import { SearchCatalogWarmQueue } from './search-catalog-queue'

type Section = 'live' | 'vod' | 'series'

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('SearchCatalogWarmQueue', () => {
  it('warms requested sections sequentially', async () => {
    const calls: Section[] = []
    const resolvers: Array<() => void> = []
    const queue = new SearchCatalogWarmQueue<Section>({
      retryDelayMs: 1_000,
      load: (section) =>
        new Promise((resolve) => {
          calls.push(section)
          resolvers.push(() => resolve('complete'))
        }),
    })

    expect(queue.request('live')).toBe(true)
    expect(queue.request('vod')).toBe(true)
    expect(queue.request('series')).toBe(true)
    await flush()

    expect(calls).toEqual(['live'])
    expect(queue.state('live')).toBe('loading')
    expect(queue.state('vod')).toBe('queued')

    resolvers.shift()!()
    await flush()
    expect(calls).toEqual(['live', 'vod'])

    resolvers.shift()!()
    await flush()
    expect(calls).toEqual(['live', 'vod', 'series'])

    resolvers.shift()!()
    await flush()
    expect(queue.state('live')).toBe('complete')
    expect(queue.state('vod')).toBe('complete')
    expect(queue.state('series')).toBe('complete')
  })

  it('deduplicates complete and oversized sections', async () => {
    const load = vi.fn().mockResolvedValueOnce('complete').mockResolvedValueOnce('oversized')
    const queue = new SearchCatalogWarmQueue<Section>({
      retryDelayMs: 1_000,
      load,
    })

    queue.request('live')
    await flush()
    expect(queue.request('live')).toBe(false)

    queue.request('vod')
    await flush()
    await flush()
    expect(queue.state('vod')).toBe('oversized')
    expect(queue.request('vod')).toBe(false)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('backs off failed sections before allowing another request', async () => {
    let now = 1_000
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('complete')
    const queue = new SearchCatalogWarmQueue<Section>({
      retryDelayMs: 500,
      load,
      now: () => now,
    })

    queue.request('live')
    await flush()

    expect(queue.state('live')).toBe('failed')
    expect(queue.request('live')).toBe(false)

    now += 500
    expect(queue.request('live')).toBe(true)
    await flush()

    expect(queue.state('live')).toBe('complete')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('cancels active work while preserving a completed catalog state', async () => {
    const pending: {
      signal?: AbortSignal
      resolve?: (result: 'complete') => void
    } = {}
    const queue = new SearchCatalogWarmQueue<Section>({
      retryDelayMs: 1_000,
      load: (_section, activeSignal) =>
        new Promise((resolve) => {
          pending.signal = activeSignal
          pending.resolve = resolve
        }),
    })

    queue.request('live')
    await flush()
    queue.cancel()

    expect(pending.signal?.aborted).toBe(true)
    expect(queue.state('live')).toBe('idle')
    pending.resolve?.('complete')
    await flush()
    expect(queue.state('live')).toBe('idle')
  })
})