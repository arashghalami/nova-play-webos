import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  favoriteKey,
  loadProfile,
  loadProfiles,
  loadResume,
  saveProfile,
  saveResume,
  updateProfileConnection,
} from './storage'
import type { StreamItem, XtreamProfile } from './types'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

const profileId = 'profile-resume-test'

const episode: StreamItem = {
  id: 'episode-103',
  name: 'The Signal',
  section: 'series',
  categoryId: '',
  streamType: 'episode',
  seriesId: 'series-77',
  seriesTitle: 'The Example Show',
  seriesCover: 'https://images.example.test/series-77.jpg',
  season: '1',
  episodeNumber: '3',
  directSource: 'https://streams.example.test/episode-103.mp4',
}

describe('resume persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('preserves episode series context and player duration for Continue Watching', () => {
    const key = favoriteKey(episode)
    const entries = new Map([
      [
        key,
        {
          streamKey: key,
          position: 487,
          duration: 1_800,
          updatedAt: 1_700_000_000_000,
          stream: episode,
          completed: false,
        },
      ],
    ])

    expect(saveResume(profileId, entries)).toBe(true)

    const restored = loadResume(profileId).get(key)

    expect(restored).toMatchObject({
      streamKey: key,
      position: 487,
      duration: 1_800,
      completed: false,
      stream: {
        id: 'episode-103',
        seriesId: 'series-77',
        seriesTitle: 'The Example Show',
        seriesCover: 'https://images.example.test/series-77.jpg',
        season: '1',
        episodeNumber: '3',
      },
    })
  })

  it('loads legacy resume entries that do not yet contain a duration', () => {
    localStorage.setItem(
      `nova-play.resume.${profileId}`,
      JSON.stringify([
        {
          streamKey: favoriteKey(episode),
          position: 240,
          updatedAt: 1_700_000_000_000,
          stream: episode,
          completed: false,
        },
      ]),
    )

    expect(loadResume(profileId).get(favoriteKey(episode))).toMatchObject({
      position: 240,
      duration: undefined,
      completed: false,
      stream: { seriesTitle: 'The Example Show' },
    })
  })
})

describe('in-place host editing preserves the catalog binding', () => {
  const original: XtreamProfile = {
    id: 'profile-host-test',
    name: 'Living Room',
    serverUrl: 'http://old-host.example:8080',
    username: 'user',
    password: 'secret',
  }

  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    saveProfile(original)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the profile id stable so the local catalog is never orphaned', () => {
    const updated = updateProfileConnection(original.id, {
      serverUrl: 'http://new-host.example:8080',
      username: 'user2',
      password: 'secret2',
    })

    // The id — which the IndexedDB catalog is keyed to — must be unchanged.
    expect(updated?.id).toBe(original.id)
    expect(updated?.serverUrl).toBe('http://new-host.example:8080')
    expect(updated?.username).toBe('user2')

    const profiles = loadProfiles()
    expect(profiles).toHaveLength(1)
    expect(profiles[0].id).toBe(original.id)
    expect(profiles[0].serverUrl).toBe('http://new-host.example:8080')
  })

  it('updates the active profile pointer when the edited profile is active', () => {
    updateProfileConnection(original.id, {
      serverUrl: 'http://new-host.example:8080',
      username: 'user',
      password: 'secret',
    })

    expect(loadProfile()?.id).toBe(original.id)
    expect(loadProfile()?.serverUrl).toBe('http://new-host.example:8080')
  })

  it('preserves the existing name when none is supplied', () => {
    const updated = updateProfileConnection(original.id, {
      serverUrl: 'http://new-host.example:8080',
      username: 'user',
      password: 'secret',
    })
    expect(updated?.name).toBe('Living Room')
  })

  it('refuses to create a new profile for an unknown id, so it cannot orphan a library', () => {
    const result = updateProfileConnection('does-not-exist', {
      serverUrl: 'http://x.example',
      username: 'u',
      password: 'p',
    })
    expect(result).toBeNull()
    expect(loadProfiles()).toHaveLength(1)
    expect(loadProfiles()[0].id).toBe(original.id)
  })

  it('never adopts an id from the connection payload', () => {
    const updated = updateProfileConnection(original.id, {
      serverUrl: 'http://new-host.example',
      username: 'user',
      password: 'secret',
      // @ts-expect-error - id is intentionally not part of the accepted shape
      id: 'attacker-supplied-id',
    })
    expect(updated?.id).toBe(original.id)
    expect(loadProfiles().some((p) => p.id === 'attacker-supplied-id')).toBe(false)
  })
})