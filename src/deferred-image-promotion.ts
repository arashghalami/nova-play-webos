/*
 * Pure promotion/demotion decision for the two-tier deferred-image loader.
 *
 * Context (see the comment block at the DEFERRED_PENDING_SRC_ATTR declaration in
 * main.ts): render templates emit an INERT pending image
 * (`data-deferred-pending-src`). A pending image carries no `src` and is not seen
 * by the loader. `promoteDeferredImages` in main.ts is the single writer that
 * ARMS a bounded number of pending images by moving the value to
 * `data-deferred-src`, after which the existing admission trigger + loader take
 * over. The bound (the cap) is the whole point: an unbounded armed set hands the
 * IntersectionObserver dozens of targets and Chromium 79 recomputes intersection
 * geometry synchronously per target per layout, the measured +10 ms/median-move
 * regression.
 *
 * This module holds the DECISION only — which pending images to arm and which
 * armed-but-idle images to release — as pure data so it is testable in this
 * repo's node-only environment. main.ts remains the thin DOM adapter that reads
 * attributes/geometry into these inputs and applies the outputs. The real
 * DOM/geometry behaviour is verified on the device.
 *
 * ES2015-compatible for the webOS bundle.
 */

/** One pending (inert) candidate, as observed by the DOM adapter. */
export type PendingCandidate = {
  /** Stable index/handle the caller uses to map back to the element. */
  ref: number
  /** Passed `deferredImageIsNearby` — inside the prefetch band. */
  nearby: boolean
  /** |getBoundingClientRect().top|; smaller = closer to the viewport top. */
  distance: number
}

/** One currently-armed image (`data-deferred-src`), as observed by the adapter. */
export type ArmedCandidate = {
  ref: number
  /** Still inside the prefetch band. */
  nearby: boolean
  /** Already handed to the loader (`data-deferred-loading="true"`). */
  loading: boolean
}

export type PromotionPlan = {
  /** Refs of pending images to arm now (pending → armed), nearest first. */
  promote: number[]
  /**
   * Refs of armed images to release back to pending (armed → pending) because
   * they drifted out of the band before the loader admitted them and would
   * otherwise hold a cap slot indefinitely. Never includes loading images.
   */
  demote: number[]
}

/**
 * Decide promotions and demotions for one pass.
 *
 * Rules:
 * - Never let `armed` exceed `cap`. `armed` counts images that will remain armed
 *   after demotion (i.e. loading images and armed-nearby images).
 * - Demote armed images that are NOT loading and NOT nearby: a stranded armed
 *   image holds a slot and an observer target without ever loading (the loader
 *   only admits nearby images), which silently shrinks the effective cap until
 *   nothing near the viewport can arm. Releasing it back to pending keeps the
 *   armed set tracking the viewport. Loading images are never demoted — their
 *   fetch is already in flight.
 * - Fill the freed budget with the nearest pending candidates that are nearby.
 *   A pending image that is not nearby is left pending (the geometry trigger will
 *   bring it back when the view moves).
 */
export function planDeferredImagePromotion(
  pending: readonly PendingCandidate[],
  armed: readonly ArmedCandidate[],
  cap: number,
): PromotionPlan {
  const safeCap = Math.max(0, Math.floor(cap))

  const demote = armed
    .filter((image) => !image.loading && !image.nearby)
    .map((image) => image.ref)

  // Images that keep their armed slot after demotion.
  const retained = armed.length - demote.length
  const budget = Math.max(0, safeCap - retained)

  const promote = pending
    .filter((candidate) => candidate.nearby)
    .slice()
    .sort((left, right) => left.distance - right.distance)
    .slice(0, budget)
    .map((candidate) => candidate.ref)

  return { promote, demote }
}

/** One armed, not-yet-loading image the loader may admit. */
export type AdmissionCandidate = {
  ref: number
  nearby: boolean
  distance: number
}

/**
 * Decide which armed images the loader admits this pass: nearest-first among the
 * nearby ones, up to the remaining concurrency budget. Mirrors the loader in
 * main.ts so the promote→admit seam can be simulated as pure logic (the seam is
 * exactly what broke when the attribute was renamed without a promoter).
 */
export function planDeferredImageAdmission(
  armedIdle: readonly AdmissionCandidate[],
  inFlight: number,
  concurrency: number,
): number[] {
  const budget = Math.max(0, Math.floor(concurrency) - Math.max(0, inFlight))

  if (budget <= 0) {
    return []
  }

  return armedIdle
    .filter((candidate) => candidate.nearby)
    .slice()
    .sort((left, right) => left.distance - right.distance)
    .slice(0, budget)
    .map((candidate) => candidate.ref)
}
