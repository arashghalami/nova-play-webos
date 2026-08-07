import { describe, expect, it } from 'vitest'

/*
 * Fail-closed static guard for the degenerate-artwork rejection (Part A).
 *
 * Convention: pure static scan via import.meta.glob ?raw, anchored to specific
 * tokens (never bare regexes that pass for the wrong reason — that has bitten
 * this codebase twice and was only caught by breaking the guarded thing).
 */

const runtimeSources = import.meta.glob('./**/*.ts', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const mainSource = runtimeSources['./main.ts'] ?? ''
const predicateSource = runtimeSources['./artwork-shape.ts'] ?? ''

describe('artwork-quality contract (Part A)', () => {
  it('predicate is shape-parameterized, not shape-inferring', () => {
    // classifyArtwork must take the shape as its FIRST argument — an explicit
    // input, never guessed from the image being judged.
    expect(predicateSource).toMatch(/export function classifyArtwork\(\s*shape:\s*ArtworkShape/)
    // The three concrete shapes exist.
    expect(predicateSource).toMatch(/'poster'\s*\|\s*'still'\s*\|\s*'logo'/)
  })

  it('every deferred-artwork template declares an explicit frame shape', () => {
    // Poster, episode still, and live logo must each carry a data-shape so the
    // predicate is fed an explicit shape rather than inferring one.
    expect(mainSource).toMatch(/class="poster"[^>]*data-shape="poster"/)
    expect(mainSource).toMatch(/class="episode-image"[^>]*data-shape="still"/)
    expect(mainSource).toMatch(/class="channel-logo[^"]*"[^>]*data-shape="logo"/)
  })

  it('runs the predicate at settle (load path), not somewhere ad hoc', () => {
    // The settle closure must invoke the degenerate handler on a successful load.
    const start = mainSource.indexOf('const settle = (outcome')
    expect(start).toBeGreaterThan(-1)
    const rest = mainSource.slice(start)
    const end = rest.indexOf('\n      }')
    const body = end === -1 ? rest.slice(0, 800) : rest.slice(0, end)
    expect(body).toMatch(/handleDegenerateArtwork\(image\)/)
    // It only acts on a successful decode (a failed load already has its path).
    expect(body).toMatch(/outcome === 'load'/)
  })

  it('degenerate handling routes through the existing fallback → unavailable machinery', () => {
    const start = mainSource.indexOf('function handleDegenerateArtwork')
    expect(start).toBeGreaterThan(-1)
    const rest = mainSource.slice(start)
    const end = rest.indexOf('\nfunction ')
    const body = end === -1 ? rest : rest.slice(0, end)
    expect(body).toMatch(/classifyArtwork\(/)
    expect(body).toMatch(/tryImageFallbackSwap\(image\)/)
    // Must have the TERMINAL fallthrough — mark unavailable when no fallback is
    // available — anchored to the `markImageUnavailable(image); return true` pair
    // at the end of the function. A bare `markImageUnavailable(image)` match is
    // insufficient: it also appears inside the fallback-swap branch's error
    // listener, so removing the terminal call alone would still match it.
    expect(body).toMatch(/markImageUnavailable\(image\)\s*\n\s*return true\s*\n\s*\}/)
  })

  it('is not applied uniformly — only images with an explicit data-shape are judged', () => {
    // handleDegenerateArtwork must early-return when there is no declared shape,
    // so images outside the artwork templates are never touched.
    const start = mainSource.indexOf('function handleDegenerateArtwork')
    const rest = mainSource.slice(start)
    const end = rest.indexOf('\nfunction ')
    const body = end === -1 ? rest : rest.slice(0, end)
    expect(body).toMatch(/if\s*\(\s*!image\.dataset\.shape\s*\)\s*\{\s*[\s\S]*?return false/)
  })
})
