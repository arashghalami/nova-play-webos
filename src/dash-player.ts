export type DashMediaPlayerInstance = {
  reset(): void
  initialize(video: HTMLVideoElement, source: string, autoplay: boolean): void
  on(eventName: string, listener: (event: { error?: { message?: string } }) => void): void
}

export type DashMediaPlayerFactory = {
  (): {
    create(): DashMediaPlayerInstance
  }
  events: {
    ERROR: string
    STREAM_INITIALIZED: string
  }
}

/**
 * dash.js is loaded as a separate legacy UMD asset before the application IIFE.
 * Keeping it outside Vite's single IIFE avoids its internal module bootstrap
 * sharing transformed bindings with the app on older webOS Chromium builds.
 */
export function dashMediaPlayerFactory(): DashMediaPlayerFactory | null {
  const candidate = (
    globalThis as typeof globalThis & {
      dashjs?: { MediaPlayer?: unknown }
    }
  ).dashjs?.MediaPlayer

  return typeof candidate === 'function'
    ? (candidate as DashMediaPlayerFactory)
    : null
}