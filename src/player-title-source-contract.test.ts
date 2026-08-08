import { describe, expect, it } from 'vitest'

/*
 * Fail-closed static guard: the player title and the video source must stay
 * bound to the same item.
 *
 * A user reported briefly seeing one film's title over another film's video.
 * Investigation found the app itself is correct — renderPlayer builds BOTH the
 * title and the source URL from the same `item` in one synchronous pass, and
 * every in-app content switch (beginPlayback, next-episode autoplay, live
 * channel switch) goes through a full render() — so the mismatch was a
 * debugger-only test artifact (a raw <video>.src assignment bypassing render).
 *
 * This guard pins that structural invariant so a future refactor cannot silently
 * decouple them:
 *  1. renderPlayer renders the title from the same `item` it plays.
 *  2. renderPlayer derives the source URL from `activeItem`, which is bound to
 *     that same `item` (const activeItem = item).
 *  3. The media element's `src` is assigned in exactly ONE place — the native
 *     attach — never from an event handler or a partial update that would swap
 *     the video without re-rendering the title.
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

describe('player title/source binding contract', () => {
  it('renderPlayer renders the title from the same item it plays', () => {
    const body = fnBody('function renderPlayer(): void {')
    expect(body).toBeTruthy()
    // The player-title is built from streamDisplayTitle(item) — the same `item`
    // the function opened with (const item = playerItem).
    expect(body).toMatch(/const item = playerItem/)
    expect(body).toMatch(/class="player-title"[\s\S]{0,120}streamDisplayTitle\(item\)/)
  })

  it('renderPlayer binds the source to the same item as the title', () => {
    const body = fnBody('function renderPlayer(): void {')
    // activeItem is that same item, and the source URL is derived from activeItem.
    expect(body).toMatch(/const activeItem = item\b/)
    expect(body).toMatch(/client\.streamUrl\(activeItem/)
    // The title must NOT be built from a different variable than the source.
    // (streamDisplayTitle must take `item`, not some other stream.)
    expect(body).not.toMatch(/streamDisplayTitle\((?!item\))/)
  })

  it('assigns the media element src in exactly one place (the native attach)', () => {
    // Any assignment to `player.src` outside startNativeAttempt would be a path
    // that swaps the video without re-rendering the title.
    const assignments = [...mainSource.matchAll(/\bplayer\.src\s*=/g)]
    expect(assignments.length).toBe(1)

    const attach = fnBody(
      'function startNativeAttempt(attempt: PlaybackAttempt, generation: number): void {',
    )
    expect(attach).toMatch(/player\.src\s*=\s*attempt\.url/)
  })

  it('every in-app content switch re-renders (no partial source swap)', () => {
    // beginPlayback is the single entry point for opening/switching content and
    // must set playerItem then render() — so title+source rebuild together.
    const begin = fnBody('function beginPlayback(item: StreamItem): void {')
    expect(begin).toMatch(/playerItem = item/)
    expect(begin).toMatch(/\brender\(\)/)

    // Next-episode autoplay likewise swaps playerItem then render(), never the
    // bare source.
    expect(mainSource).toMatch(/playerItem = nextEpisode[\s\S]{0,160}\brender\(\)/)
  })
})
