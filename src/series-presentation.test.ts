import { describe, expect, it } from 'vitest'
import { episodeDisplayTitle, episodeThumbnailSources, seasonLabel } from './series-presentation'
import type { StreamItem } from './types'

function episode(overrides: Partial<StreamItem> = {}): StreamItem {
  return {
    id: '1',
    name: 'Test Episode',
    section: 'series',
    categoryId: '1',
    streamType: 'episode',
    ...overrides,
  }
}

describe('series episode presentation', () => {
  it('removes only confirmed provider, series, and episode prefixes', () => {
    expect(
      episodeDisplayTitle(
        'MU - Anne with an E - S03E01 - A Secret Which I Desired to Divine',
        'Anne with an E',
        '3',
        '1',
      ),
    ).toBe('A Secret Which I Desired to Divine')

    expect(
      episodeDisplayTitle(
        'Anne with an E - S03E02 - There Is Something at Work in My Soul',
        'Anne with an E',
        '3',
        '2',
      ),
    ).toBe('There Is Something at Work in My Soul')
  })

  it('preserves a title when cleanup would remove meaningful text', () => {
    expect(episodeDisplayTitle('The Office', 'The Office', '1', '1')).toBe('The Office')
    expect(episodeDisplayTitle('S01E01', 'Example Series', '1', '1')).toBe('S01E01')
  })

  it('uses clear season labels', () => {
    expect(seasonLabel('3')).toBe('Season 3')
    expect(seasonLabel('Specials')).toBe('Specials')
  })
})

describe('episodeThumbnailSources', () => {
  it('returns episode still as primary and series poster as fallback', () => {
    var result = episodeThumbnailSources(
      episode({ cover: 'https://img/ep1.jpg', seriesCover: 'https://img/series.jpg' }),
    )
    expect(result).toEqual({ primary: 'https://img/ep1.jpg', fallback: 'https://img/series.jpg' })
  })

  it('returns metadata.cover as primary when episode.cover is missing', () => {
    var result = episodeThumbnailSources(
      episode({ metadata: { cover: 'https://img/meta.jpg' }, seriesCover: 'https://img/series.jpg' }),
    )
    expect(result).toEqual({ primary: 'https://img/meta.jpg', fallback: 'https://img/series.jpg' })
  })

  it('returns series poster only when no episode still exists', () => {
    var result = episodeThumbnailSources(
      episode({ seriesCover: 'https://img/series.jpg' }),
    )
    expect(result).toEqual({ primary: 'https://img/series.jpg', fallback: undefined })
  })

  it('returns both undefined when neither still nor poster exists', () => {
    var result = episodeThumbnailSources(episode())
    expect(result).toEqual({ primary: undefined, fallback: undefined })
  })

  it('omits fallback when episode still equals series poster', () => {
    var result = episodeThumbnailSources(
      episode({ cover: 'https://img/same.jpg', seriesCover: 'https://img/same.jpg' }),
    )
    expect(result).toEqual({ primary: 'https://img/same.jpg', fallback: undefined })
  })

  it('prefers episode.cover over metadata.cover', () => {
    var result = episodeThumbnailSources(
      episode({
        cover: 'https://img/ep-cover.jpg',
        metadata: { cover: 'https://img/meta-cover.jpg' },
        seriesCover: 'https://img/series.jpg',
      }),
    )
    expect(result).toEqual({ primary: 'https://img/ep-cover.jpg', fallback: 'https://img/series.jpg' })
  })

  it('returns episode still with no fallback when seriesCover is absent', () => {
    var result = episodeThumbnailSources(episode({ cover: 'https://img/ep1.jpg' }))
    expect(result).toEqual({ primary: 'https://img/ep1.jpg', fallback: undefined })
  })
})