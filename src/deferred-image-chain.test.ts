import { describe, expect, it } from 'vitest'
import {
  type AdmissionCandidate,
  type ArmedCandidate,
  type PendingCandidate,
  planDeferredImageAdmission,
  planDeferredImagePromotion,
} from './deferred-image-promotion'

/*
 * Behavioral test of the promote → admit → load → refill chain — the seam that
 * broke when the template attribute was renamed to data-deferred-pending-src
 * with no promoter, blanking every image while the templates and the loader were
 * each individually well-formed. A static scan passed happily; only exercising
 * the seam catches it.
 *
 * This is a pure simulation of the two decision functions plus a tiny image
 * model (position, an armed/pending/loading/loaded state). It does not emulate
 * Chromium geometry — real geometry is verified on the device — but it does drive
 * the exact promote/admit/settle loop main.ts runs, and asserts the two
 * properties that both matter:
 *   1. every pending image that is (or becomes) nearby ends up LOADED, and
 *   2. the armed count NEVER exceeds the cap at any tick.
 * Property 1 catches this bug (a severed chain leaves images blank). Property 2
 * catches a future "fix" that restores images by removing the cap and
 * reintroduces the observer-cost regression.
 */

type Img = {
  ref: number
  top: number // viewport-relative top (px); mutated as the grid scrolls
  state: 'pending' | 'armed' | 'loading' | 'loaded'
}

const PREFETCH_PX = 480
const VIEWPORT_H = 1080
const CAP = 16
const CONCURRENCY = 3

function nearby(top: number): boolean {
  // Mirrors deferredImageIsNearby using an assumed card height for `bottom`.
  const CARD_H = 300
  const bottom = top + CARD_H
  return bottom >= -PREFETCH_PX && top <= VIEWPORT_H + PREFETCH_PX
}

function armedCount(images: Img[]): number {
  return images.filter((i) => i.state === 'armed' || i.state === 'loading').length
}

/** One scheduler pass: promote (capped), then admit (concurrency), as main.ts does. */
function schedulerPass(images: Img[]): void {
  // --- promote ---
  const pending: PendingCandidate[] = images
    .filter((i) => i.state === 'pending')
    .map((i) => ({ ref: i.ref, nearby: nearby(i.top), distance: Math.abs(i.top) }))
  const armed: ArmedCandidate[] = images
    .filter((i) => i.state === 'armed' || i.state === 'loading')
    .map((i) => ({ ref: i.ref, nearby: nearby(i.top), loading: i.state === 'loading' }))

  const plan = planDeferredImagePromotion(pending, armed, CAP)
  for (const ref of plan.demote) {
    const img = images.find((i) => i.ref === ref)!
    img.state = 'pending'
  }
  for (const ref of plan.promote) {
    const img = images.find((i) => i.ref === ref)!
    img.state = 'armed'
  }

  // --- admit (load) ---
  const inFlight = images.filter((i) => i.state === 'loading').length
  const armedIdle: AdmissionCandidate[] = images
    .filter((i) => i.state === 'armed')
    .map((i) => ({ ref: i.ref, nearby: nearby(i.top), distance: Math.abs(i.top) }))
  const admit = planDeferredImageAdmission(armedIdle, inFlight, CONCURRENCY)
  for (const ref of admit) {
    images.find((i) => i.ref === ref)!.state = 'loading'
  }
}

/** Settle one in-flight image (models a network completion + settle continuation). */
function settleOne(images: Img[]): boolean {
  const loading = images.find((i) => i.state === 'loading')
  if (!loading) {
    return false
  }
  loading.state = 'loaded'
  return true
}

/**
 * Run the chain to quiescence with an assertion after every mutation that the
 * armed cap is never breached. Returns the max armed count observed.
 */
function runToQuiescence(
  images: Img[],
  onTick: (images: Img[]) => void,
  maxTicks = 5000,
): number {
  let maxArmed = 0
  let ticks = 0

  // Interleave scheduler passes and settles until nothing changes.
  for (;;) {
    schedulerPass(images)
    maxArmed = Math.max(maxArmed, armedCount(images))
    onTick(images)

    // Drain in-flight loads one at a time, re-running the scheduler between each
    // (this is the settle continuation → refill path).
    if (settleOne(images)) {
      maxArmed = Math.max(maxArmed, armedCount(images))
      onTick(images)
      ticks += 1
      if (ticks > maxTicks) {
        throw new Error('did not reach quiescence')
      }
      continue
    }

    // No loads settled this round; if a scheduler pass changes nothing more,
    // we are quiescent.
    const before = images.map((i) => i.state).join(',')
    schedulerPass(images)
    maxArmed = Math.max(maxArmed, armedCount(images))
    onTick(images)
    const after = images.map((i) => i.state).join(',')
    if (before === after && !images.some((i) => i.state === 'loading')) {
      break
    }
    ticks += 1
    if (ticks > maxTicks) {
      throw new Error('did not reach quiescence')
    }
  }

  return maxArmed
}

function grid(count: number, topOf: (ref: number) => number): Img[] {
  return Array.from({ length: count }, (_, ref) => ({
    ref,
    top: topOf(ref),
    state: 'pending' as const,
  }))
}

describe('deferred-image promote→admit→load chain', () => {
  it('loads every nearby image, and the armed count never exceeds the cap', () => {
    // 60-card grid, all initially within/near the viewport (worst case for the
    // observer-cost regression the cap addresses).
    const images = grid(60, (ref) => -PREFETCH_PX + ref * 40)
    const nearbyRefs = images.filter((i) => nearby(i.top)).map((i) => i.ref)

    const maxArmed = runToQuiescence(images, (imgs) => {
      expect(armedCount(imgs), 'armed count must never exceed the cap').toBeLessThanOrEqual(
        CAP,
      )
    })

    // Property 1: every nearby image ended up loaded (chain intact).
    for (const ref of nearbyRefs) {
      expect(images.find((i) => i.ref === ref)!.state, `image ${ref} must load`).toBe(
        'loaded',
      )
    }
    // Property 2 (aggregate): the cap was actually exercised, not vacuously held.
    expect(maxArmed).toBeGreaterThan(0)
    expect(maxArmed).toBeLessThanOrEqual(CAP)
  })

  it('refills: a first cap-worth loading does not strand the rest as blanks', () => {
    // All 60 nearby. If the promoter only ran once, exactly CAP would ever arm
    // and the rest would never load. Quiescence with all-loaded proves refill.
    const images = grid(60, () => 100)
    runToQuiescence(images, (imgs) => {
      expect(armedCount(imgs)).toBeLessThanOrEqual(CAP)
    })
    expect(images.every((i) => i.state === 'loaded')).toBe(true)
  })

  it('promotes off-screen images once the grid scrolls them into the band', () => {
    // Half the grid starts far below the viewport (not nearby): it must stay
    // pending until scrolled, then load.
    const images = grid(40, (ref) => 100 + ref * 400) // spread far down
    // First quiescence: only the initially-nearby ones load.
    runToQuiescence(images, (imgs) =>
      expect(armedCount(imgs)).toBeLessThanOrEqual(CAP),
    )
    const loadedFirst = images.filter((i) => i.state === 'loaded').length
    expect(loadedFirst).toBeGreaterThan(0)
    expect(loadedFirst).toBeLessThan(40) // not everything loaded yet

    // Scroll up by a big amount so the lower images enter the band.
    for (const img of images) {
      img.top -= 6000
    }
    runToQuiescence(images, (imgs) =>
      expect(armedCount(imgs)).toBeLessThanOrEqual(CAP),
    )
    // Everything that is now nearby must have loaded.
    for (const img of images) {
      if (nearby(img.top)) {
        expect(img.state).toBe('loaded')
      }
    }
  })

  it('demotes a stranded armed image so it never permanently holds a cap slot', () => {
    // Arm a batch, then scroll most out of band before they load; the stranded
    // armed (non-loading) ones must return to pending, freeing slots. Model by
    // running one promote-only pass, then moving them away.
    const images = grid(30, () => 100)
    // One promote pass (no settle) arms up to CAP.
    schedulerPass(images)
    const armedInitially = images.filter((i) => i.state === 'armed' || i.state === 'loading')
    expect(armedInitially.length).toBeLessThanOrEqual(CAP)

    // Push the armed-but-idle ones far out of band.
    for (const img of images) {
      if (img.state === 'armed') {
        img.top = 99999
      }
    }
    schedulerPass(images)
    // The out-of-band idle ones must have been demoted back to pending (or be
    // loading, never stranded-armed-far-away).
    for (const img of images) {
      if (img.top === 99999) {
        expect(img.state === 'pending' || img.state === 'loaded').toBe(true)
      }
    }
    expect(armedCount(images)).toBeLessThanOrEqual(CAP)
  })
})
