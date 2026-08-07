import { describe, expect, it } from 'vitest'

/*
 * Fail-closed static guard: native track cycling must not regress to hls-only.
 *
 * The reported bug was that cycleAudioTrack consulted only activeHls and so
 * reported "one audio track" on native progressive playback (.mkv/.mp4) even
 * when the element exposed multiple audio tracks. This guard pins the native
 * fallback so a refactor cannot silently drop it again.
 *
 * Convention: pure static scan via import.meta.glob ?raw, anchored to specific
 * tokens (never bare regexes that pass for the wrong reason).
 */

const runtimeSources = import.meta.glob('./**/*.ts', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const mainSource = runtimeSources['./main.ts'] ?? ''

function fnBody(decl: string): string {
  const start = mainSource.indexOf(decl)
  if (start === -1) return ''
  const rest = mainSource.slice(start + decl.length)
  const next = rest.indexOf('\nfunction ')
  return next === -1 ? rest : rest.slice(0, next)
}

describe('track-selection contract', () => {
  it('imports the pure selectors', () => {
    expect(mainSource).toMatch(/from ['"]\.\/track-selection['"]/)
    expect(mainSource).toMatch(/nextAudioIndex/)
  })

  it('cycleAudioTrack has a native audioTracks fallback beyond hls', () => {
    const body = fnBody('function cycleAudioTrack(): void {')
    expect(body).toBeTruthy()
    // Must read the native element's audioTracks and decide via the pure selector.
    expect(body).toMatch(/audioTracks/)
    expect(body).toMatch(/nextAudioIndex\(/)
    // Must actually switch the track by writing .enabled on the native list.
    expect(body).toMatch(/\.enabled\s*=/)
    // The hls path is not the only branch: the native fallback runs when
    // activeHls has no audio tracks.
    expect(body).toMatch(/document\.querySelector<HTMLVideoElement>\('#video-player'\)/)
  })

  it('cycleSubtitleTrack still has its native textTracks fallback', () => {
    const body = fnBody('function cycleSubtitleTrack(): void {')
    expect(body).toMatch(/textTracks/)
    expect(body).toMatch(/nextTextIndex\(/)
    expect(body).toMatch(/\.mode\s*=/)
  })
})
