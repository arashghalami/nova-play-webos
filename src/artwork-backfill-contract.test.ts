import { describe, expect, it } from 'vitest'

/*
 * Fail-closed static guard for the demand-driven artwork backfill (Part B).
 *
 * Convention: pure static scan via import.meta.glob ?raw, anchored to specific
 * tokens (never bare regexes that pass for the wrong reason). Every assertion
 * below was proven by break -> red -> restore.
 */

const runtimeSources = import.meta.glob('./**/*.ts', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const mainSource = runtimeSources['./main.ts'] ?? ''
const recordSource = runtimeSources['./artwork-record.ts'] ?? ''

function fnBody(source: string, decl: string): string {
  const start = source.indexOf(decl)
  if (start === -1) return ''
  const rest = source.slice(start + decl.length)
  const next = rest.indexOf('\nfunction ')
  return next === -1 ? rest : rest.slice(0, next)
}

describe('artwork backfill contract (Part B)', () => {
  it('imports the artwork override store and enrichment', () => {
    expect(mainSource).toMatch(/from ['"]\.\/artwork-record['"]/)
    expect(mainSource).toMatch(/loadArtworkRecords/)
    expect(mainSource).toMatch(/saveArtworkRecords/)
  })

  it('is demand-driven — resolution is queued from the settle/degenerate path, not a bulk scan', () => {
    // The trigger must be the degenerate handler (settled, on-screen image), and
    // the queue is fed from there.
    const handler = fnBody(mainSource, 'function handleDegenerateArtwork(image: HTMLImageElement): boolean {')
    expect(handler).toMatch(/queueArtworkResolution\(image\)/)
    // There must be NO iteration over the whole catalog to pre-resolve artwork.
    // (A bulk scan would look like catalog?.streams.forEach(... resolveArtwork).)
    expect(mainSource).not.toMatch(/catalog[^\n]*streams[\s\S]{0,80}resolveArtworkFor/)
  })

  it('is VOD-only — live is excluded in the queue gate', () => {
    const queue = fnBody(mainSource, 'function queueArtworkResolution(image: HTMLImageElement): void {')
    expect(queue).toMatch(/section === 'live'/)
    // Only the poster shape is backfilled (not stills/logos).
    expect(queue).toMatch(/dataset\.shape !== 'poster'/)
  })

  it('is bounded by a negative cache and by concurrency + per-session caps', () => {
    const queue = fnBody(mainSource, 'function queueArtworkResolution(image: HTMLImageElement): void {')
    // Negative cache / already-known: a hydrated record short-circuits the query.
    expect(queue).toMatch(/artworkRecords\.has\(streamKey\)/)
    // Per-session backstop.
    expect(queue).toMatch(/artworkResolveSessionAttempts >= ARTWORK_RESOLVE_SESSION_CAP/)
    // Concurrency cap governs the pump.
    const pump = fnBody(mainSource, 'function pumpArtworkResolution(): void {')
    expect(pump).toMatch(/artworkResolveInFlight < ARTWORK_RESOLVE_CONCURRENCY/)
  })

  it('does not persist a negative marker on a transient resolve failure', () => {
    // The catch block must return WITHOUT writing a record, so a network error
    // does not suppress retries for 30 days. Anchor to the catch block CONTENTS:
    // the first statement inside `catch { ... }` (ignoring a comment) is a bare
    // `return`, and there is no artworkRecords.set inside the catch. A loose
    // `catch {[\s\S]*?return` would also match a later return elsewhere in the
    // function, so it is insufficient (and did pass for the wrong reason once).
    const resolver = fnBody(mainSource, 'async function resolveArtworkFor(streamKey: string): Promise<void> {')
    const catchStart = resolver.indexOf('} catch {')
    expect(catchStart).toBeGreaterThan(-1)
    const afterCatch = resolver.slice(catchStart + '} catch {'.length)
    const catchBody = afterCatch.slice(0, afterCatch.indexOf('\n    }'))
    expect(catchBody).toMatch(/^\s*(?:\/\/[^\n]*\n\s*)*return\s*(?:\n|$)/)
    expect(catchBody).not.toMatch(/artworkRecords\.set/)
    // The record write exists, but only on the resolved-value path (outside catch).
    expect(resolver).toMatch(/artworkRecords\.set\(streamKey, record\)/)
    expect(resolver).toMatch(/saveArtworkRecords\(profile\.id, artworkRecords\)/)
  })

  it('posterArtwork consults the override map before the provider source', () => {
    const poster = fnBody(mainSource, 'function posterArtwork(stream: StreamItem): string {')
    // The override is read and OR-ed ahead of stream.cover/icon.
    expect(poster).toMatch(/deliveryArtworkOverride\(stream\)[\s\S]{0,80}stream\.cover/)
  })

  it('the detail view poster also consults the override before the provider cover', () => {
    const details = fnBody(mainSource, 'function renderDetails(): void {')
    // The detail "video card" media source must prefer the override so it matches
    // the corrected catalog/search art, not the provider's degenerate thumbnail.
    expect(details).toMatch(/deliveryArtworkOverride\(item\)[\s\S]{0,60}metadata\.cover/)
  })

  it('backfills the override store when detail enrichment resolves a poster', () => {
    // Opening a card (e.g. from search) can resolve a poster even if the catalog
    // never settled the image; that poster must be persisted so cards/reload get
    // it. Guard the persistence, gated to non-negative + VOD + no existing record.
    expect(mainSource).toMatch(/enrichment\?\.poster\s*&&[\s\S]{0,200}artworkRecords\.set\(/)
  })

  it('hydrates overrides synchronously and resets them on profile switch', () => {
    expect(mainSource).toMatch(/let artworkRecords = profile\s*[\s\S]*?loadArtworkRecords\(profile\.id\)/)
    expect(mainSource).toMatch(/artworkRecords = loadArtworkRecords\(nextProfile\.id\)/)
  })

  it('the override store is capped by recency', () => {
    expect(recordSource).toMatch(/MAX_ARTWORK_RECORDS/)
    expect(recordSource).toMatch(/\.slice\(0, MAX_ARTWORK_RECORDS\)/)
  })
})
