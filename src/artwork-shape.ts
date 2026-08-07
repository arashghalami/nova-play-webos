/*
 * Pure artwork-shape predicate.
 *
 * Judges whether a *successfully decoded* image is usable for the frame it was
 * loaded into, or is a degenerate placeholder that will smear when the frame's
 * `object-fit: cover` upscales it. The motivating case: providers return a tiny
 * 100x70 landscape thumbnail for titles they lack real art for, and stretched
 * into a portrait poster frame that is the "burned" look.
 *
 * Design (per brief):
 * - Shape is an EXPLICIT input, never inferred from the image being judged
 *   (that would be circular). The caller declares the frame shape at template
 *   time.
 * - Orientation is the STRONG signal: a landscape image in a portrait frame (or
 *   vice-versa) is definitively wrong and is what produces the smear. Firm here.
 * - Absolute size is the WEAK signal: a small but correctly-proportioned image
 *   only looks soft, not burned. Conservative here — size alone never rejects a
 *   correctly-oriented image; it only reinforces an already-suspect orientation.
 * - False positives (blanking a working poster) are worse than the smear. When
 *   in doubt, keep the image.
 *
 * Pure and ES2015-compatible: no DOM, no globals, fully testable.
 */

export type ArtworkShape = 'poster' | 'still' | 'logo'

export type ArtworkDimensions = {
  width: number
  height: number
}

export type ArtworkVerdict = 'ok' | 'degenerate'

/*
 * Orientation gate, expressed as an aspect-ratio (width/height) band the frame
 * can tolerate. A value outside the band is the wrong orientation for the frame.
 *
 * - poster: portrait (~2:3 = 0.667). Real posters sit ~0.6–0.75. We only reject
 *   clearly landscape art (ar >= 1.1) — squarish art (e.g. some provider posters
 *   at ~0.9) is still kept, because it merely letterboxes rather than smears.
 * - still: 16:9 landscape (~1.78). Reject clearly portrait art (ar <= 0.9).
 * - logo: arbitrary aspect; never rejected on orientation.
 */
const MAX_POSTER_ASPECT = 1.1
const MIN_STILL_ASPECT = 0.9

/*
 * Size floor used ONLY to reinforce an orientation that is already wrong-ish, or
 * to catch a truly collapsed decode. A correctly-oriented image at or above this
 * on its larger edge is always kept. Deliberately small so real-but-modest
 * provider art is never blanked.
 */
const DEGENERATE_MAX_EDGE = 120

/**
 * Decide whether decoded artwork is usable for its declared frame shape.
 *
 * Returns 'degenerate' only when confident the image will visibly smear:
 *  - a non-positive / collapsed decode, or
 *  - an orientation that is wrong for the frame (the strong signal).
 * Everything else — including small-but-correctly-proportioned art — returns
 * 'ok'.
 */
export function classifyArtwork(
  shape: ArtworkShape,
  dimensions: ArtworkDimensions,
): ArtworkVerdict {
  const { width, height } = dimensions

  // A collapsed or unknown decode (0x0, negative, NaN) is not usable. The load
  // path already handles naturalWidth===0 as an error, but guard it here too so
  // the predicate is self-contained.
  if (!(width > 0) || !(height > 0)) {
    return 'degenerate'
  }

  // Logos have arbitrary aspect and are not upscaled into a fixed portrait/
  // landscape frame the way posters/stills are; never reject them on shape.
  if (shape === 'logo') {
    return 'ok'
  }

  const aspect = width / height
  const maxEdge = Math.max(width, height)

  if (shape === 'poster') {
    // Wrong orientation for a portrait frame: landscape art. This is the smear.
    if (aspect >= MAX_POSTER_ASPECT) {
      return 'degenerate'
    }
    // Correctly-oriented but collapsed to a thumbnail on both edges: also
    // degenerate. Kept conservative — only when the larger edge is below the
    // floor (so 150x225 real posters are safe).
    if (maxEdge < DEGENERATE_MAX_EDGE) {
      return 'degenerate'
    }
    return 'ok'
  }

  // shape === 'still' (16:9 landscape frame)
  if (aspect <= MIN_STILL_ASPECT) {
    return 'degenerate'
  }
  if (maxEdge < DEGENERATE_MAX_EDGE) {
    return 'degenerate'
  }
  return 'ok'
}
