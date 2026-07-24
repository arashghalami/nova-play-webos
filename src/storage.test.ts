import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { favoriteKey, loadResume, saveResume } from './storage'
import type { StreamItem } from './types'

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