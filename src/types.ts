export type LibrarySection = 'live' | 'vod' | 'series'
export type AppView = 'login' | 'home' | 'catalog' | 'details' | 'player' | 'guide' | 'search' | 'settings'
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
  tmdbId?: string
  trailer?: Trailer
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