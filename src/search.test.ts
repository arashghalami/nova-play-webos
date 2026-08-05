import { describe, expect, it } from 'vitest'
import { foldText, matchesQuery, normalizeQuery, queryTokens, searchTokens } from './search'

describe('foldText', () => {
  it('lowercases and strips Latin diacritics', () => {
    expect(foldText('Pokémon')).toBe('pokemon')
    expect(foldText('Elétra')).toBe('eletra')
    expect(foldText('Über Café')).toBe('uber cafe')
  })

  it('expands ligatures and sharp s', () => {
    expect(foldText('Straße')).toBe('strasse')
    expect(foldText('Æther œuvre')).toBe('aether oeuvre')
  })

  it('is idempotent for ASCII input', () => {
    expect(foldText('the office (us)')).toBe('the office (us)')
  })
})

describe('queryTokens', () => {
  it('splits on punctuation/whitespace and folds each token', () => {
    expect(queryTokens('  Office   US ')).toEqual(['office', 'us'])
    expect(queryTokens('Pokémon')).toEqual(['pokemon'])
    expect(queryTokens('Office—US / 2026')).toEqual(['office', 'us', '2026'])
  })

  it('keeps Unicode word tokens from every supported script', () => {
    expect(searchTokens('Новости, أخبار، 映画 東京')).toEqual([
      'новости',
      'أخبار',
      '映画',
      '東京',
    ])
  })

  it('returns an empty list for blank input', () => {
    expect(queryTokens('')).toEqual([])
    expect(queryTokens('   ')).toEqual([])
  })
})

describe('matchesQuery', () => {
  const haystack = foldText('The Office (US)')

  it('matches when every token is present regardless of order', () => {
    expect(matchesQuery(haystack, queryTokens('office us'))).toBe(true)
    expect(matchesQuery(haystack, queryTokens('us office'))).toBe(true)
  })

  it('fails when any token is missing', () => {
    expect(matchesQuery(haystack, queryTokens('office uk'))).toBe(false)
  })

  it('matches accented content via a folded query', () => {
    expect(matchesQuery(foldText('Pokémon Journeys'), queryTokens('pokemon'))).toBe(true)
  })

  it('treats an empty token list as a match-all', () => {
    expect(matchesQuery(haystack, queryTokens(''))).toBe(true)
  })
})

describe('normalizeQuery', () => {
  it('folds and trims', () => {
    expect(normalizeQuery('  Pokémon ')).toBe('pokemon')
  })
})
