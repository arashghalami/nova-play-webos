export type HlsBufferCodecsData = {
  video?: { codec?: string; container: string }
  audio?: { codec?: string; container: string }
  audiovideo?: { codec?: string; container: string }
}

export type HlsErrorData = {
  fatal: boolean
  type: string
  details?: string
}

export type HlsTrack = {
  name?: string
  lang?: string
}

export type HlsLevel = {
  height?: number
  width?: number
}

export type HlsInstance = {
  audioTracks: HlsTrack[]
  audioTrack: number
  subtitleTracks: HlsTrack[]
  subtitleTrack: number
  levels: HlsLevel[]
  currentLevel: number
  destroy(): void
  attachMedia(media: HTMLMediaElement): void
  loadSource(source: string): void
  startLoad(): void
  recoverMediaError(): void
  on(eventName: string, listener: (...args: any[]) => void): void
}

export type HlsConstructor = {
  new (config: Record<string, boolean | number>): HlsInstance
  isSupported(): boolean
  Events: {
    MEDIA_ATTACHED: string
    BUFFER_CODECS: string
    MANIFEST_PARSED: string
    ERROR: string
  }
  ErrorTypes: {
    NETWORK_ERROR: string
    MEDIA_ERROR: string
  }
}

export type MpegtsMediaPlayer = {
  pause(): void
  unload(): void
  detachMediaElement(): void
  destroy(): void
  on(eventName: string, listener: (...args: any[]) => void): void
  attachMediaElement(media: HTMLMediaElement): void
  load(): void
  play(): void | Promise<void>
}

export type MpegtsEngine = {
  isSupported(): boolean
  getFeatureList(): { mseLivePlayback?: boolean }
  createPlayer(
    mediaDataSource: {
      type: string
      isLive: boolean
      url: string
    },
    config: Record<string, boolean | number>,
  ): MpegtsMediaPlayer
  Events: {
    MEDIA_INFO: string
    ERROR: string
  }
  ErrorDetails: {
    MEDIA_FORMAT_UNSUPPORTED: string
    MEDIA_CODEC_UNSUPPORTED: string
    MEDIA_FORMAT_ERROR: string
    MEDIA_MSE_ERROR: string
    NETWORK_TIMEOUT: string
    NETWORK_EXCEPTION: string
    NETWORK_STATUS_CODE_INVALID: string
    NETWORK_UNRECOVERABLE_EARLY_EOF: string
  }
}

/**
 * Playback libraries load as independent UMD scripts before the application IIFE.
 * They must not be folded into the app bundle because their transformed module
 * initializers have produced temporal-dead-zone errors on webOS Chromium.
 */
export function hlsConstructor(): HlsConstructor | null {
  const candidate = (globalThis as typeof globalThis & { Hls?: unknown }).Hls

  return typeof candidate === 'function' ? (candidate as HlsConstructor) : null
}

export function mpegtsEngine(): MpegtsEngine | null {
  const candidate = (globalThis as typeof globalThis & { mpegts?: unknown }).mpegts

  return candidate && typeof candidate === 'object' ? (candidate as MpegtsEngine) : null
}