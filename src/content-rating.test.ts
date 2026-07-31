import { describe, expect, it } from 'vitest'
import {
  ageGuidanceForRating,
  classificationSystem,
  dedupeRatingCandidates,
  normalizeRatingCandidate,
  normalizeRatingValue,
  resolveContentRating,
  ratingSourceSummary,
} from './content-rating'
import type { RatingCandidate } from './types'

function candidate(
  provider: RatingCandidate['provider'],
  value: string,
  region: string,
  options: Partial<RatingCandidate> = {},
): RatingCandidate {
  const result = normalizeRatingCandidate({
    value,
    region,
    retrievedRegion: region,
    provider,
    sourceLabel: provider === 'tmdb' ? 'TMDB' : provider === 'trakt' ? 'Trakt' : 'Xtream',
    official: true,
    ...options,
  })

  if (!result) {
    throw new Error(`Expected ${provider} ${region} ${value} to be a valid rating candidate.`)
  }

  return result
}

describe('content rating policy', () => {
  it.each([
    ['AL', 0],
    ['6', 6],
    ['9', 9],
    ['12', 12],
    ['14', 14],
    ['16', 16],
    ['18', 18],
  ])('maps Netherlands Kijkwijzer %s to %s+', (value, expectedAge) => {
    const rating = candidate('tmdb', value, 'NL')

    expect(rating.system).toBe('Kijkwijzer')
    expect(ageGuidanceForRating(rating)).toMatchObject({
      suggestedMinimumAge: expectedAge,
      basis: 'official-certification',
      confidence: 'high',
    })
  })

  it('recognizes MPAA, TVPG, BBFC, and FSK systems without conflating regional values', () => {
    expect(classificationSystem('PG-13', 'US', 'movie')).toBe('MPAA')
    expect(classificationSystem('TV-14', 'US', 'tv')).toBe('TVPG')
    expect(classificationSystem('12A', 'GB', 'movie')).toBe('BBFC')
    expect(classificationSystem('FSK 16', 'DE', 'movie')).toBe('FSK')
    expect(classificationSystem('12', 'NL', 'movie')).toBe('Kijkwijzer')
    expect(classificationSystem('12', 'GB', 'movie')).toBe('BBFC')
  })

  it('rejects scores and malformed classifications while bounding supplied fields', () => {
    expect(normalizeRatingValue('7.9')).toBeUndefined()
    expect(normalizeRatingValue('IMDb 8')).toBeUndefined()
    expect(normalizeRatingValue('8')).toBeUndefined()
    expect(normalizeRatingValue('x'.repeat(33))).toBeUndefined()
    expect(
      normalizeRatingCandidate({
        value: 'PG-13',
        region: 'United States',
        provider: 'tmdb',
        sourceLabel: 'TMDB',
        official: true,
      }),
    ).toBeUndefined()
    expect(
      normalizeRatingCandidate({
        value: 'PG',
        region: 'US',
        provider: 'tmdb',
        sourceLabel: 'x'.repeat(41),
        official: true,
      }),
    ).toBeUndefined()
  })

  it('rejects mismatched supplied systems and malformed official flags', () => {
    expect(
      normalizeRatingCandidate({
        value: 'PG-13',
        system: 'Kijkwijzer',
        region: 'US',
        provider: 'tmdb',
        sourceLabel: 'TMDB',
        official: true,
      }),
    ).toBeUndefined()
    expect(
      normalizeRatingCandidate({
        value: '12',
        region: 'NL',
        provider: 'tmdb',
        sourceLabel: 'TMDB',
        official: 'true',
      }),
    ).toBeUndefined()
  })

  it('deduplicates candidates and selects the deterministic Netherlands-first result', () => {
    const tmdbNl = candidate('tmdb', '12', 'NL')
    const resolution = resolveContentRating([
      candidate('xtream', 'PG-13', 'US'),
      candidate('tmdb', 'PG-13', 'US'),
      tmdbNl,
      { ...tmdbNl },
      candidate('trakt', 'TV-14', 'US'),
    ])

    expect(dedupeRatingCandidates([tmdbNl, { ...tmdbNl }])).toHaveLength(1)
    expect(resolution.selected).toMatchObject({
      provider: 'tmdb',
      value: '12',
      region: 'NL',
      system: 'Kijkwijzer',
    })
    expect(resolution.fallbackUsed).toBe(false)
    expect(ratingSourceSummary(resolution)).toBe('TMDB · NL · Kijkwijzer')
  })

  it('keeps Xtream classifications as the final fallback even when its rating is Netherlands-based', () => {
    const resolution = resolveContentRating([
      candidate('xtream', '12', 'NL'),
      candidate('tmdb', 'PG-13', 'US'),
    ])

    expect(resolution.selected).toMatchObject({
      provider: 'tmdb',
      value: 'PG-13',
      system: 'MPAA',
    })
  })

  it('uses documented fallback precedence and describes Trakt fallback provenance', () => {
    const trakt = candidate('trakt', 'TV-14', 'US')
    const resolution = resolveContentRating([
      candidate('tmdb', 'PG-13', 'US'),
      trakt,
      candidate('xtream', 'PG-13', 'US'),
    ])

    expect(resolution.selected).toMatchObject({ provider: 'trakt', value: 'TV-14' })
    expect(resolution.fallbackUsed).toBe(true)
    expect(ratingSourceSummary(resolution)).toBe('Trakt fallback · US · TV-PG')
  })

  it('returns unavailable when every candidate is unrecognized', () => {
    const unknown = normalizeRatingCandidate({
      value: 'Adults only',
      provider: 'xtream',
      sourceLabel: 'Xtream',
      official: false,
    })

    expect(unknown).toBeDefined()
    expect(resolveContentRating(unknown ? [unknown] : []).selected).toBeUndefined()
  })
})