/*
 * Pure track-cycling logic for native <video> audio/text tracks.
 *
 * The webOS native media element exposes multi-audio (and sometimes text)
 * tracks via the standard AudioTrackList / TextTrackList APIs, but the player's
 * cycle controls previously only consulted hls.js. This module holds the
 * index/mode DECISION as pure data so it is testable in this repo's node-only
 * environment; main.ts is the thin adapter that reads/writes the live track
 * lists.
 *
 * ES2015-compatible for the webOS bundle.
 */

/** Minimal shape of an audio track (native AudioTrack subset). */
export type AudioTrackInfo = {
  enabled: boolean
  language?: string
  label?: string
}

/** Minimal shape of a text track (native TextTrack subset). */
export type TextTrackInfo = {
  mode: 'showing' | 'hidden' | 'disabled'
  language?: string
  label?: string
  kind?: string
}

/**
 * Next enabled index when cycling audio tracks. Audio always has exactly one
 * enabled track, so we advance from the currently-enabled one (or 0 if none is
 * marked) and wrap. Returns -1 only when there are no tracks.
 */
export function nextAudioIndex(tracks: readonly AudioTrackInfo[]): number {
  if (tracks.length === 0) {
    return -1
  }

  let current = tracks.findIndex((track) => track.enabled)

  if (current < 0) {
    current = 0
  }

  return (current + 1) % tracks.length
}

/**
 * Next showing index when cycling text tracks, including an OFF state (-1).
 * Cycles current -> next -> ... -> last -> off -> first. Returns -1 (off) when
 * there are no tracks. Only 'showing' counts as active.
 */
export function nextTextIndex(tracks: readonly TextTrackInfo[]): number {
  if (tracks.length === 0) {
    return -1
  }

  const current = tracks.findIndex((track) => track.mode === 'showing')
  return current + 1 >= tracks.length ? -1 : current + 1
}

/** A readable, non-empty label for a track, or a 1-based positional fallback. */
export function trackLabel(
  track: { language?: string; label?: string } | undefined,
  index: number,
): string {
  if (track) {
    const label = (track.label ?? '').trim()
    if (label) {
      return label
    }
    const language = (track.language ?? '').trim()
    if (language && language.toLowerCase() !== 'und') {
      return languageName(language)
    }
  }

  return `Track ${index + 1}`
}

/*
 * Small BCP-47 / ISO-639 code -> display name map for the languages this
 * provider library actually ships. Unknown codes fall back to the upper-cased
 * code so nothing is ever blank. Kept deliberately small and ES2015-safe rather
 * than pulling Intl.DisplayNames, which is unavailable on webOS Chromium 79.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  eng: 'English',
  fa: 'Persian',
  per: 'Persian',
  fas: 'Persian',
  ar: 'Arabic',
  ara: 'Arabic',
  fr: 'French',
  fre: 'French',
  fra: 'French',
  de: 'German',
  ger: 'German',
  deu: 'German',
  es: 'Spanish',
  spa: 'Spanish',
  it: 'Italian',
  ita: 'Italian',
  nl: 'Dutch',
  dut: 'Dutch',
  nld: 'Dutch',
  ru: 'Russian',
  rus: 'Russian',
  tr: 'Turkish',
  tur: 'Turkish',
  hi: 'Hindi',
  hin: 'Hindi',
  ur: 'Urdu',
  urd: 'Urdu',
  pt: 'Portuguese',
  por: 'Portuguese',
  ja: 'Japanese',
  jpn: 'Japanese',
  ko: 'Korean',
  kor: 'Korean',
  zh: 'Chinese',
  chi: 'Chinese',
  zho: 'Chinese',
}

export function languageName(code: string): string {
  const normalized = code.trim().toLowerCase().split(/[-_]/)[0]
  return LANGUAGE_NAMES[normalized] ?? code.trim().toUpperCase()
}
