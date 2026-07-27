import type { StreamItem } from './types'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function trimLeadingSeparator(value: string): string {
  return value.replace(/^\s*(?:[-–—|:·]\s*)+/, '').trim()
}

function isUsefulEpisodeTitle(value: string): boolean {
  return value.replace(/[^a-z0-9\u00c0-\u024f\u0600-\u06ff]/gi, '').length >= 3
}

/**
 * Providers frequently prefix episode names with a language, series title, and
 * episode number. The source name remains untouched; this only creates the
 * concise title used where the series context is already visible.
 */
export function episodeDisplayTitle(
  rawTitle: string,
  seriesTitle: string | undefined,
  season: string | undefined,
  episodeNumber: string | undefined,
): string {
  const original = rawTitle.trim()

  if (!original) {
    return 'Untitled episode'
  }

  let title = original
  title = title.replace(/^\s*[a-z]{2,4}\s*(?:[-|:]\s*)/i, '')

  const normalizedSeriesTitle = seriesTitle?.trim()

  if (normalizedSeriesTitle) {
    const seriesPrefix = new RegExp(
      `^${escapeRegExp(normalizedSeriesTitle)}\\s*(?:[-–—|:·]\\s*)`,
      'i',
    )
    title = title.replace(seriesPrefix, '')
  }

  const seasonNumber = season?.match(/\d+/)?.[0]
  const episode = episodeNumber?.match(/\d+/)?.[0]

  if (seasonNumber && episode) {
    const token = new RegExp(
      `^s?0*${Number(seasonNumber)}\\s*[-_. ]*e?0*${Number(episode)}\\s*(?:[-–—|:·]\\s*)?`,
      'i',
    )
    title = title.replace(token, '')
  }

  title = trimLeadingSeparator(title)

  return isUsefulEpisodeTitle(title) ? title : original
}

export function seasonLabel(season: string): string {
  return /^\d+$/.test(season.trim()) ? `Season ${season}` : season
}

/**
 * Returns the primary and fallback image sources for an episode thumbnail.
 * Primary is the per-episode still (cover / metadata.cover); fallback is the
 * series poster. The caller renders primary as `src` and fallback as
 * `data-fallback-src` so the image error handler can swap gracefully before
 * degrading to a text tile.
 */
export function episodeThumbnailSources(episode: StreamItem): {
  primary: string | undefined
  fallback: string | undefined
} {
  var episodeStill = episode.cover || (episode.metadata ? episode.metadata.cover : undefined)
  var seriesPoster = episode.seriesCover

  // When the episode still is the same URL as the series poster there is no
  // distinct thumbnail to try — treat it as series-poster-only.
  if (episodeStill && seriesPoster && episodeStill === seriesPoster) {
    return { primary: seriesPoster, fallback: undefined }
  }

  if (episodeStill) {
    return { primary: episodeStill, fallback: seriesPoster }
  }

  return { primary: seriesPoster, fallback: undefined }
}