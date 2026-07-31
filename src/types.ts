export type LibrarySection = 'live' | 'vod' | 'series'
export type AppView =
  | 'login'
  | 'home'
  | 'catalog'
  | 'details'
  | 'person'
  | 'player'
  | 'guide'
  | 'search'
  | 'settings'
export type CatalogSort = 'default' | 'name' | 'recent' | 'rating' | 'year'

export interface XtreamProfile {
  id: string
  name: string
  serverUrl: string
  username: string
  password: string
}

export interface AppSettings {
  startupSection?: LibrarySection
  preferHls: boolean
  preservePitch: boolean
  bufferSeconds: number
  timeFormat: '12h' | '24h'
  hideAdultContent: boolean
  parentalPin?: string
}

export interface Category {
  id: string
  name: string
}

export interface CatchupCapability {
  available: boolean
  durationDays?: number
}

export interface Trailer {
  kind: 'youtube' | 'url'
  url: string
}

export type MetadataSource = 'xtream' | 'external' | 'derived'
export type RatingProvider = 'xtream' | 'tmdb' | 'trakt'

export interface PersonSummary {
  id: string
  name: string
  profileImage?: string
  character?: string
  job?: string
  department?: string
  source?: MetadataSource
}

export interface ContentRating {
  value: string
  system?: string
  region?: string
  minimumAge?: number
  descriptors?: string[]
  source: MetadataSource
  official: boolean
  /** Provider-specific origin retained while migrating from singular ratings. */
  provider?: RatingProvider
}

export interface RatingCandidate extends ContentRating {
  provider: RatingProvider
  sourceLabel: string
  retrievedRegion?: string
}

export interface AgeGuidance {
  suggestedMinimumAge?: number
  basis: 'official-certification' | 'provider-value' | 'derived'
  confidence: 'high' | 'medium' | 'low'
  reasons?: string[]
}

export interface RatingResolution {
  selected?: RatingCandidate
  candidates: RatingCandidate[]
  ageGuidance?: AgeGuidance
  preferredRegion: string
  fallbackUsed: boolean
}

export interface ExternalProfile {
  label: string
  url: string
}

export interface FilmographyCredit {
  id: string
  mediaType: 'movie' | 'tv'
  title: string
  originalTitle?: string
  year?: string
  poster?: string
  character?: string
  job?: string
  rating?: string
}

export interface PersonDetails extends PersonSummary {
  biography?: string
  birthday?: string
  deathday?: string
  placeOfBirth?: string
  knownForDepartment?: string
  homepage?: string
  externalProfiles?: ExternalProfile[]
  knownFor?: FilmographyCredit[]
  credits?: FilmographyCredit[]
}

export interface RelatedTitle extends FilmographyCredit {
  overview?: string
}

export interface EnrichedTitleMetadata {
  tmdbId: string
  mediaType: 'movie' | 'tv'
  tagline?: string
  contentRating?: ContentRating
  ageGuidance?: AgeGuidance
  contentRatings?: RatingCandidate[]
  ratingResolution?: RatingResolution
  cast?: PersonSummary[]
  crew?: PersonSummary[]
  related?: RelatedTitle[]
}

export interface RichMetadata {
  originalTitle?: string
  plot?: string
  cover?: string
  backdrops?: string[]
  genre?: string
  cast?: string
  director?: string
  country?: string
  releaseDate?: string
  year?: string
  rating?: string
  ratingFiveBased?: string
  duration?: string
  durationSeconds?: number
  ageRating?: string
  contentRating?: ContentRating
  ageGuidance?: AgeGuidance
  contentRatings?: RatingCandidate[]
  ratingResolution?: RatingResolution
  providerCast?: PersonSummary[]
  providerCrew?: PersonSummary[]
  tmdbId?: string
  trailer?: Trailer
  enrichment?: EnrichedTitleMetadata
}

export interface StreamItem {
  id: string
  name: string
  section: LibrarySection
  categoryId: string
  icon?: string
  cover?: string
  rating?: string
  year?: string
  added?: string
  containerExtension?: string
  streamType?: string
  seriesId?: string
  plot?: string
  channelNumber?: string
  catchup?: CatchupCapability
  directSource?: string
  season?: string
  episodeNumber?: string
  /**
   * Parent-series context carried by episode records. Providers frequently omit
   * episode artwork, so this is used as the reliable display fallback.
   */
  seriesTitle?: string
  seriesCover?: string
  /**
   * Cached lowercase display name used for catalog and global-search matching.
   * It is deliberately kept outside rich metadata so list rendering stays cheap.
   */
  searchName?: string
  metadata?: RichMetadata
}

export interface FavoriteEntry {
  key: string
  stream?: StreamItem
  updatedAt: number
}

export interface SeriesDetails {
  info: RichMetadata & {
    name?: string
  }
  episodes: Record<string, StreamItem[]>
}

export interface VodDetails {
  id: string
  containerExtension?: string
  directSource?: string
  metadata: RichMetadata
}

export interface AccountSummary {
  status: string
  expiresAt?: string
  activeConnections?: string
  maxConnections?: string
}

export interface ResumeEntry {
  streamKey: string
  position: number
  updatedAt: number
  stream?: StreamItem
  /**
   * Duration observed by the player when progress was saved. This makes progress
   * meters accurate after the stream object has been restored from storage.
   */
  duration?: number
  completed?: boolean
}

export interface Program {
  title: string
  description?: string
  start: Date
  end: Date
}

export interface NowNext {
  now?: Program
  next?: Program
}

export interface ProfileSummary {
  id: string
  name: string
}