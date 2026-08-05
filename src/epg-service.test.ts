import { describe, expect, it, vi } from 'vitest'
import {
  capabilityIsFresh,
  epgIdentifierState,
  epgRequestAllowed,
  hasEpgIdentifier,
  normalizedEpgIdentifier,
  resolveNowNext,
  resolveSchedule,
  type EpgDurableCache,
  type EpgProvider,
  type EpgPublicSource,
  type EpgServiceConfig,
} from './epg-service'
import type { NowNext, Program, StreamItem } from './types'

function channel(id: string, epgChannelId?: string): StreamItem {
  return { id, name: `Channel ${id}`, section: 'live', categoryId: 'c', epgChannelId }
}

function nowNextFixture(): NowNext {
  const start = new Date('2026-08-05T10:00:00Z')
  const end = new Date('2026-08-05T11:00:00Z')
  return {
    now: { title: 'Now', start, end },
    next: { title: 'Next', start: end, end: new Date('2026-08-05T12:00:00Z') },
  }
}

function programFixture(): Program[] {
  return [
    {
      title: 'A',
      start: new Date('2026-08-05T10:00:00Z'),
      end: new Date('2026-08-05T11:00:00Z'),
    },
  ]
}

class MemoryCache implements EpgDurableCache {
  private store = new Map<string, unknown>()
  reads = 0
  writes = 0
  private key(profileId: string, streamId: string, kind: string): string {
    return `${profileId}:${streamId}:${kind}`
  }
  async getEpg<T extends NowNext | Program[]>(
    profileId: string,
    streamId: string,
    kind: string,
  ): Promise<T | null> {
    this.reads += 1
    return (this.store.get(this.key(profileId, streamId, kind)) as T) ?? null
  }
  async putEpg<T extends NowNext | Program[]>(
    profileId: string,
    streamId: string,
    kind: string,
    value: T,
  ): Promise<void> {
    this.writes += 1
    this.store.set(this.key(profileId, streamId, kind), value)
  }
  seed(profileId: string, streamId: string, kind: string, value: unknown): void {
    this.store.set(this.key(profileId, streamId, kind), value)
  }
}

function config(cache: EpgDurableCache, publicSource?: EpgPublicSource): EpgServiceConfig {
  return { cache, nowNextTtlMs: 60_000, scheduleTtlMs: 60_000, publicSource }
}

describe('EPG identifier three-state classification', () => {
  it('classifies absent (undefined/null) as absent, not a negative', () => {
    expect(epgIdentifierState(channel('1'))).toBe('absent')
    expect(epgIdentifierState({ ...channel('1'), epgChannelId: null as unknown as undefined })).toBe(
      'absent',
    )
  })

  it('classifies empty string and the literal "null" as blank', () => {
    expect(epgIdentifierState(channel('1', ''))).toBe('blank')
    expect(epgIdentifierState(channel('1', '   '))).toBe('blank')
    expect(epgIdentifierState(channel('1', 'null'))).toBe('blank')
    expect(epgIdentifierState(channel('1', 'NULL'))).toBe('blank')
  })

  it('classifies a real value as populated', () => {
    expect(epgIdentifierState(channel('1', 'NPO.1.nl'))).toBe('populated')
  })

  it('allows a request for absent and populated, and suppresses only blank', () => {
    expect(epgRequestAllowed(channel('1'))).toBe(true) // absent (pre-capture)
    expect(epgRequestAllowed(channel('1', 'NPO.1.nl'))).toBe(true) // populated
    expect(epgRequestAllowed(channel('1', ''))).toBe(false) // blank negative
    expect(epgRequestAllowed(channel('1', 'null'))).toBe(false)
  })

  it('keeps hasEpgIdentifier/normalizedEpgIdentifier strict to populated only', () => {
    expect(hasEpgIdentifier(channel('1'))).toBe(false)
    expect(hasEpgIdentifier(channel('1', ''))).toBe(false)
    expect(hasEpgIdentifier(channel('1', 'null'))).toBe(false)
    expect(hasEpgIdentifier(channel('1', 'NPO.1.nl'))).toBe(true)
    expect(normalizedEpgIdentifier(channel('1'))).toBeNull()
    expect(normalizedEpgIdentifier(channel('1', ' NPO.1.nl '))).toBe('NPO.1.nl')
  })
})

describe('three-state EPG request gate (the shipped-defect regression)', () => {
  it('does NOT suppress a pre-capture stored record (absent field) — it probes by stream id', async () => {
    // A record written before epg_channel_id capture reads `undefined`. The old
    // two-state gate suppressed it forever; the fix must probe the provider.
    const cache = new MemoryCache()
    const provider: EpgProvider = {
      nowNext: vi.fn().mockResolvedValue(nowNextFixture()),
      epg: vi.fn(),
    }

    const result = await resolveNowNext(config(cache), 'p', channel('legacy'), 'available', provider)

    expect(provider.nowNext).toHaveBeenCalledTimes(1)
    expect(provider.nowNext).toHaveBeenCalledWith('legacy', undefined)
    expect(result?.source).toBe('provider')
  })

  it('probes a populated channel', async () => {
    const cache = new MemoryCache()
    const provider: EpgProvider = {
      nowNext: vi.fn().mockResolvedValue(nowNextFixture()),
      epg: vi.fn(),
    }
    const result = await resolveNowNext(config(cache), 'p', channel('1', 'NPO.1.nl'), 'available', provider)
    expect(provider.nowNext).toHaveBeenCalledTimes(1)
    expect(result?.source).toBe('provider')
  })

  it('suppresses a blank channel as an authoritative negative', async () => {
    const cache = new MemoryCache()
    const provider: EpgProvider = { nowNext: vi.fn(), epg: vi.fn() }
    const result = await resolveNowNext(config(cache), 'p', channel('1', ''), 'available', provider)
    expect(result).toBeNull()
    expect(provider.nowNext).not.toHaveBeenCalled()
  })

  it('applies the same three states to resolveSchedule', async () => {
    const cache = new MemoryCache()
    const provider: EpgProvider = {
      nowNext: vi.fn(),
      epg: vi.fn().mockResolvedValue(programFixture()),
    }
    // absent -> probes
    await resolveSchedule(config(cache), 'p', channel('legacy'), 'available', provider, {
      limit: 8,
      kind: 'schedule',
    })
    expect((provider.epg as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
    // blank -> suppressed
    const blank = await resolveSchedule(config(cache), 'p', channel('1', 'null'), 'available', provider, {
      limit: 8,
      kind: 'schedule',
    })
    expect(blank).toBeNull()
    expect((provider.epg as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })

  it('does not use the public source for an absent channel (no identifier to key on)', async () => {
    const cache = new MemoryCache()
    const provider: EpgProvider = { nowNext: vi.fn().mockRejectedValue({ kind: 'not-found' }), epg: vi.fn() }
    const publicSource: EpgPublicSource = {
      nowNext: vi.fn().mockResolvedValue(nowNextFixture()),
      schedule: vi.fn(),
    }
    // Host unavailable + absent identifier: provider is skipped (unavailable),
    // and the public source cannot run without an identifier.
    const result = await resolveNowNext(
      config(cache, publicSource),
      'p',
      channel('legacy'),
      'unavailable',
      provider,
    )
    expect(result).toBeNull()
    expect(publicSource.nowNext).not.toHaveBeenCalled()
  })
})

describe('resolveNowNext request discipline', () => {
  it('issues no provider request for a blank (authoritative-negative) channel', async () => {
    const cache = new MemoryCache()
    const provider: EpgProvider = {
      nowNext: vi.fn(),
      epg: vi.fn(),
    }

    const result = await resolveNowNext(
      config(cache),
      'p',
      channel('1', ''),
      'available',
      provider,
    )

    expect(result).toBeNull()
    expect(provider.nowNext).not.toHaveBeenCalled()
  })

  it('serves from the durable cache without a provider request', async () => {
    const cache = new MemoryCache()
    cache.seed('p', '1', 'now-next', nowNextFixture())
    const provider: EpgProvider = { nowNext: vi.fn(), epg: vi.fn() }

    const result = await resolveNowNext(
      config(cache),
      'p',
      channel('1', 'NPO.1.nl'),
      'available',
      provider,
    )

    expect(result?.source).toBe('cache')
    expect(provider.nowNext).not.toHaveBeenCalled()
  })

  it('issues exactly one provider request on a cache miss and then caches', async () => {
    const cache = new MemoryCache()
    const provider: EpgProvider = {
      nowNext: vi.fn().mockResolvedValue(nowNextFixture()),
      epg: vi.fn(),
    }

    const first = await resolveNowNext(config(cache), 'p', channel('1', 'x.uk'), 'available', provider)
    expect(first?.source).toBe('provider')
    expect(provider.nowNext).toHaveBeenCalledTimes(1)

    // Second call hits the durable cache the first populated.
    const second = await resolveNowNext(config(cache), 'p', channel('1', 'x.uk'), 'available', provider)
    expect(second?.source).toBe('cache')
    expect(provider.nowNext).toHaveBeenCalledTimes(1)
  })

  it('does not call the provider when the host is EPG-unavailable, and uses the public source instead', async () => {
    const cache = new MemoryCache()
    const provider: EpgProvider = { nowNext: vi.fn(), epg: vi.fn() }
    const publicSource: EpgPublicSource = {
      nowNext: vi.fn().mockResolvedValue(nowNextFixture()),
      schedule: vi.fn(),
    }

    const result = await resolveNowNext(
      config(cache, publicSource),
      'p',
      channel('1', 'NPO.1.nl'),
      'unavailable',
      provider,
    )

    expect(provider.nowNext).not.toHaveBeenCalled()
    expect(publicSource.nowNext).toHaveBeenCalledTimes(1)
    expect(result?.source).toBe('public')
  })
})

describe('full guide page hydration discipline', () => {
  it('issues at most one request per visible mapped row and zero for unmapped rows', async () => {
    const cache = new MemoryCache()
    const provider: EpgProvider = {
      nowNext: vi.fn().mockResolvedValue(nowNextFixture()),
      epg: vi.fn(),
    }
    // 24-row page: 15 eligible (populated), 9 blank-negative, interleaved. Blank
    // identifiers are the authoritative negatives that must never be requested.
    const page: StreamItem[] = Array.from({ length: 24 }, (_, index) =>
      index % 8 === 0 || index % 5 === 0
        ? channel(`s${index}`, '')
        : channel(`s${index}`, `id.${index}.uk`),
    )
    const eligible = page.filter((stream) => epgRequestAllowed(stream))
    const suppressed = page.filter((stream) => !epgRequestAllowed(stream))
    expect(eligible.length + suppressed.length).toBe(24)
    expect(suppressed.length).toBeGreaterThan(0)

    // Drive the same serial, cache-first loop the guide uses.
    for (const stream of page) {
      await resolveNowNext(config(cache), 'p', stream, 'available', provider)
    }

    // One request per eligible row, none for the blank-negative rows.
    expect((provider.nowNext as ReturnType<typeof vi.fn>).mock.calls.length).toBe(eligible.length)
    for (const stream of suppressed) {
      expect(
        (provider.nowNext as ReturnType<typeof vi.fn>).mock.calls.some(
          (call) => call[0] === stream.id,
        ),
      ).toBe(false)
    }
  })

  it('re-rendering the same page within TTL issues zero new provider requests', async () => {
    const cache = new MemoryCache()
    const provider: EpgProvider = {
      nowNext: vi.fn().mockResolvedValue(nowNextFixture()),
      epg: vi.fn(),
    }
    const page = [channel('a', 'a.uk'), channel('b', 'b.uk'), channel('c', '')]

    for (const stream of page) {
      await resolveNowNext(config(cache), 'p', stream, 'available', provider)
    }
    const afterFirst = (provider.nowNext as ReturnType<typeof vi.fn>).mock.calls.length
    expect(afterFirst).toBe(2)

    // Second pass (relaunch/re-render): everything served from cache.
    for (const stream of page) {
      await resolveNowNext(config(cache), 'p', stream, 'available', provider)
    }
    expect((provider.nowNext as ReturnType<typeof vi.fn>).mock.calls.length).toBe(afterFirst)
  })
})

describe('resolveSchedule', () => {
  it('caches a schedule and serves catch-up and plain projections under separate keys', async () => {
    const cache = new MemoryCache()
    const provider: EpgProvider = {
      nowNext: vi.fn(),
      epg: vi.fn().mockResolvedValue(programFixture()),
    }

    const schedule = await resolveSchedule(
      config(cache),
      'p',
      channel('1', 'x.uk'),
      'available',
      provider,
      { limit: 8, kind: 'schedule' },
    )
    expect(schedule?.source).toBe('provider')

    const cached = await resolveSchedule(
      config(cache),
      'p',
      channel('1', 'x.uk'),
      'available',
      provider,
      { limit: 8, kind: 'schedule' },
    )
    expect(cached?.source).toBe('cache')
    // catchup is a different key -> another provider call.
    await resolveSchedule(config(cache), 'p', channel('1', 'x.uk'), 'available', provider, {
      limit: 24,
      kind: 'catchup',
    })
    expect((provider.epg as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
  })

  it('returns null for a blank (authoritative-negative) channel without requesting', async () => {
    const cache = new MemoryCache()
    const provider: EpgProvider = { nowNext: vi.fn(), epg: vi.fn() }
    const result = await resolveSchedule(
      config(cache),
      'p',
      channel('1', 'null'),
      'available',
      provider,
      { limit: 8, kind: 'schedule' },
    )
    expect(result).toBeNull()
    expect(provider.epg).not.toHaveBeenCalled()
  })
})

describe('capability freshness', () => {
  it('treats unknown or stale capability as not fresh', () => {
    const now = 1_000_000
    expect(capabilityIsFresh(undefined, now)).toBe(false)
    expect(capabilityIsFresh({ state: 'unknown', checkedAt: now }, now)).toBe(false)
    expect(capabilityIsFresh({ state: 'available', checkedAt: now }, now)).toBe(true)
    expect(
      capabilityIsFresh({ state: 'available', checkedAt: now - 48 * 60 * 60_000 }, now),
    ).toBe(false)
  })
})
