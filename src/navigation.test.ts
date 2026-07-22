import { describe, expect, it } from 'vitest'
import { resolveNavigationTarget, type NavigationItem } from './navigation'

const item = (
  id: string,
  zoneId: string,
  left: number,
  top: number,
  width = 100,
  height = 100,
): NavigationItem => ({ id, zoneId, left, top, width, height })

describe('resolveNavigationTarget', () => {
  it('wraps horizontally within the same visual row', () => {
    const items = [
      item('live', 'home-hub', 0, 300),
      item('movies', 'home-hub', 120, 300),
      item('series', 'home-hub', 240, 300),
      item('favorites', 'home-hub', 360, 300),
      item('continue-1', 'home-continue', 0, 150),
    ]

    expect(resolveNavigationTarget(items, 'favorites', 'ArrowRight')).toBe('live')
    expect(resolveNavigationTarget(items, 'live', 'ArrowLeft')).toBe('favorites')
    expect(resolveNavigationTarget(items, 'movies', 'ArrowRight')).toBe('series')
  })

  it('does not escape a row horizontally when another zone is nearby', () => {
    const items = [
      item('guide', 'home-hero', 0, 0),
      item('refresh', 'home-hero', 140, 0),
      item('live', 'home-hub', 0, 300),
      item('favorites', 'home-hub', 140, 300),
    ]

    expect(resolveNavigationTarget(items, 'favorites', 'ArrowRight')).toBe('live')
    expect(resolveNavigationTarget(items, 'live', 'ArrowLeft')).toBe('favorites')
  })

  it('enters the intervening Continue Watching rail before the hero controls', () => {
    const items = [
      item('guide', 'home-hero', 0, 0),
      item('refresh', 'home-hero', 140, 0),
      item('continue-1', 'home-continue', 0, 150),
      item('continue-2', 'home-continue', 140, 150),
      item('live', 'home-hub', 0, 300),
      item('favorites', 'home-hub', 140, 300),
    ]

    expect(resolveNavigationTarget(items, 'favorites', 'ArrowUp')).toBe('continue-2')
    expect(resolveNavigationTarget(items, 'continue-2', 'ArrowUp')).toBe('refresh')
    expect(resolveNavigationTarget(items, 'continue-1', 'ArrowDown')).toBe('live')
  })

  it('uses the hero rail when Continue Watching is absent', () => {
    const items = [
      item('guide', 'home-hero', 0, 0),
      item('refresh', 'home-hero', 140, 0),
      item('live', 'home-hub', 0, 300),
      item('favorites', 'home-hub', 140, 300),
    ]

    expect(resolveNavigationTarget(items, 'favorites', 'ArrowUp')).toBe('refresh')
    expect(resolveNavigationTarget(items, 'guide', 'ArrowDown')).toBe('live')
  })

  it('preserves the nearest column through incomplete rows', () => {
    const items = [
      item('one', 'catalog', 0, 0),
      item('two', 'catalog', 120, 0),
      item('three', 'catalog', 240, 0),
      item('four', 'catalog', 0, 120),
      item('five', 'catalog', 120, 120),
    ]

    expect(resolveNavigationTarget(items, 'three', 'ArrowDown')).toBe('five')
    expect(resolveNavigationTarget(items, 'five', 'ArrowUp')).toBe('two')
    expect(resolveNavigationTarget(items, 'five', 'ArrowRight')).toBe('four')
    expect(resolveNavigationTarget(items, 'four', 'ArrowLeft')).toBe('five')
  })

  it('navigates catalog toolbars, grids, and pagers as separate predictable zones', () => {
    const items = [
      item('categories', 'catalog-tools', 0, 0),
      item('sort', 'catalog-tools', 120, 0),
      item('guide', 'catalog-tools', 240, 0),
      item('search', 'catalog-tools', 360, 0),
      item('card-1', 'catalog-grid', 0, 150),
      item('card-2', 'catalog-grid', 120, 150),
      item('card-3', 'catalog-grid', 0, 270),
      item('card-4', 'catalog-grid', 120, 270),
      item('previous', 'catalog-pager', 0, 420),
      item('next', 'catalog-pager', 120, 420),
    ]

    expect(resolveNavigationTarget(items, 'search', 'ArrowRight')).toBe('categories')
    expect(resolveNavigationTarget(items, 'categories', 'ArrowLeft')).toBe('search')
    expect(resolveNavigationTarget(items, 'sort', 'ArrowDown')).toBe('card-2')
    expect(resolveNavigationTarget(items, 'card-4', 'ArrowDown')).toBe('next')
    expect(resolveNavigationTarget(items, 'previous', 'ArrowUp')).toBe('card-3')
  })

  it('navigates detail actions, episodes, and catch-up controls without cross-page jumps', () => {
    const items = [
      item('play', 'detail-actions', 0, 0),
      item('favorite', 'detail-actions', 120, 0),
      item('watched', 'detail-actions', 240, 0),
      item('episode-1', 'episodes', 0, 150),
      item('episode-2', 'episodes', 0, 270),
      item('catchup-1', 'epg', 0, 420),
    ]

    expect(resolveNavigationTarget(items, 'watched', 'ArrowRight')).toBe('play')
    expect(resolveNavigationTarget(items, 'favorite', 'ArrowDown')).toBe('episode-1')
    expect(resolveNavigationTarget(items, 'episode-1', 'ArrowDown')).toBe('episode-2')
    expect(resolveNavigationTarget(items, 'episode-2', 'ArrowDown')).toBe('catchup-1')
    expect(resolveNavigationTarget(items, 'catchup-1', 'ArrowUp')).toBe('episode-2')
  })

  it('covers login, settings, guide, and global-search rails', () => {
    const items = [
      item('saved-1', 'saved-profiles', 0, 0),
      item('saved-2', 'saved-profiles', 120, 0),
      item('login-name', 'login-form', 0, 150),
      item('login-server', 'login-form', 0, 260),
      item('login-submit', 'login-form', 0, 370),
      item('guide-library', 'guide-tools', 0, 500),
      item('guide-refresh', 'guide-tools', 120, 500),
      item('guide-row-1', 'guide-rows', 0, 620),
      item('guide-row-2', 'guide-rows', 0, 740),
      item('search-input', 'search-controls', 0, 880),
      item('search-run', 'search-controls', 120, 880),
      item('live-result', 'live-results', 0, 1_000),
      item('movie-result', 'movie-results', 0, 1_120),
    ]

    expect(resolveNavigationTarget(items, 'saved-1', 'ArrowRight')).toBe('saved-2')
    expect(resolveNavigationTarget(items, 'saved-2', 'ArrowRight')).toBe('saved-1')
    expect(resolveNavigationTarget(items, 'login-server', 'ArrowDown')).toBe('login-submit')
    expect(resolveNavigationTarget(items, 'guide-refresh', 'ArrowDown')).toBe('guide-row-1')
    expect(resolveNavigationTarget(items, 'guide-row-2', 'ArrowUp')).toBe('guide-row-1')
    expect(resolveNavigationTarget(items, 'search-run', 'ArrowDown')).toBe('live-result')
    expect(resolveNavigationTarget(items, 'live-result', 'ArrowDown')).toBe('movie-result')
  })

  it('keeps navigation inside an overlay zone', () => {
    const items = [
      item('player-close', 'player-controls', 0, 0),
      item('player-play', 'player-controls', 120, 0),
      item('channel-1', 'channel-overlay', 0, 100),
      item('channel-2', 'channel-overlay', 0, 220),
      item('channel-3', 'channel-overlay', 0, 340),
    ]

    expect(resolveNavigationTarget(items, 'channel-1', 'ArrowRight')).toBeNull()
    expect(resolveNavigationTarget(items, 'channel-2', 'ArrowUp')).toBe('channel-1')
    expect(resolveNavigationTarget(items, 'channel-3', 'ArrowDown')).toBeNull()
  })

  it('returns null for unknown origins and one-item rows', () => {
    const items = [item('only', 'single', 0, 0)]

    expect(resolveNavigationTarget(items, 'missing', 'ArrowRight')).toBeNull()
    expect(resolveNavigationTarget(items, 'only', 'ArrowLeft')).toBeNull()
    expect(resolveNavigationTarget(items, 'only', 'ArrowRight')).toBeNull()
  })
})