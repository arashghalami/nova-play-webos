import { describe, expect, it } from 'vitest'
import { classifyArtwork } from './artwork-shape'

/*
 * The legitimate set is tested FIRST and HARDEST: blanking a working poster is
 * worse than the smear this predicate fixes, and the app has thousands of
 * provider images we have not seen. If any legitimate case regressed, the
 * predicate would be tightened until it stays quiet — never the reverse.
 */
describe('classifyArtwork — legitimate artwork must be kept (ok)', () => {
  it('keeps a standard 342x513 TMDB poster', () => {
    expect(classifyArtwork('poster', { width: 342, height: 513 })).toBe('ok')
  })

  it('keeps a large 600x900 provider poster', () => {
    expect(classifyArtwork('poster', { width: 600, height: 900 })).toBe('ok')
  })

  it('keeps a small-but-correctly-proportioned poster (soft, not burned)', () => {
    // 150x225 is 2:3 — a real poster, merely low-res. Must not be blanked.
    expect(classifyArtwork('poster', { width: 150, height: 225 })).toBe('ok')
  })

  it('keeps a squarish poster that only letterboxes', () => {
    // Some provider posters are ~0.8 aspect; they letterbox, they do not smear.
    expect(classifyArtwork('poster', { width: 400, height: 500 })).toBe('ok')
  })

  it('keeps a 16:9 episode still', () => {
    expect(classifyArtwork('still', { width: 640, height: 360 })).toBe('ok')
  })

  it('keeps a small-but-correct 16:9 still', () => {
    expect(classifyArtwork('still', { width: 300, height: 169 })).toBe('ok')
  })

  it('keeps a square-ish logo', () => {
    expect(classifyArtwork('logo', { width: 120, height: 120 })).toBe('ok')
  })

  it('keeps a wide banner logo (arbitrary aspect)', () => {
    expect(classifyArtwork('logo', { width: 300, height: 80 })).toBe('ok')
  })

  it('keeps a tiny logo (logos are never shape-judged)', () => {
    expect(classifyArtwork('logo', { width: 60, height: 40 })).toBe('ok')
  })
})

describe('classifyArtwork — degenerate artwork must be rejected', () => {
  it('rejects the known 100x70 landscape thumbnail in a poster frame', () => {
    // The exact IR- case measured on device: landscape art in a portrait frame.
    expect(classifyArtwork('poster', { width: 100, height: 70 })).toBe('degenerate')
  })

  it('rejects a landscape image in a poster frame regardless of size', () => {
    expect(classifyArtwork('poster', { width: 800, height: 450 })).toBe('degenerate')
  })

  it('rejects a portrait image in an episode-still frame', () => {
    expect(classifyArtwork('still', { width: 200, height: 300 })).toBe('degenerate')
  })

  it('rejects a collapsed poster thumbnail (both edges below floor)', () => {
    // 2:3 but only 60x90 — a genuine thumbnail placeholder, not a usable poster.
    expect(classifyArtwork('poster', { width: 60, height: 90 })).toBe('degenerate')
  })

  it('rejects a zero / collapsed decode for any shape', () => {
    expect(classifyArtwork('poster', { width: 0, height: 0 })).toBe('degenerate')
    expect(classifyArtwork('still', { width: 0, height: 0 })).toBe('degenerate')
    expect(classifyArtwork('logo', { width: 0, height: 0 })).toBe('degenerate')
  })

  it('rejects NaN / negative decodes defensively', () => {
    expect(classifyArtwork('poster', { width: Number.NaN, height: 100 })).toBe('degenerate')
    expect(classifyArtwork('poster', { width: -10, height: 20 })).toBe('degenerate')
  })
})

describe('classifyArtwork — boundary behaviour', () => {
  it('keeps a poster exactly at the size floor', () => {
    // maxEdge === 120 is not below the floor → kept (portrait).
    expect(classifyArtwork('poster', { width: 80, height: 120 })).toBe('ok')
  })

  it('treats near-square in a poster frame as acceptable (letterbox, not smear)', () => {
    // aspect 1.0 < 1.1 threshold → kept.
    expect(classifyArtwork('poster', { width: 500, height: 500 })).toBe('ok')
  })
})
