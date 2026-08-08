import { describe, expect, it } from 'vitest'
import {
  type ArmedCandidate,
  type PendingCandidate,
  planDeferredImagePromotion,
} from './deferred-image-promotion'

function pending(ref: number, nearby: boolean, distance: number): PendingCandidate {
  return { ref, nearby, distance }
}

function armed(ref: number, nearby: boolean, loading: boolean): ArmedCandidate {
  return { ref, nearby, loading }
}

describe('planDeferredImagePromotion', () => {
  it('arms up to the cap when nothing is armed yet', () => {
    const candidates = Array.from({ length: 40 }, (_, i) => pending(i, true, i))
    const plan = planDeferredImagePromotion(candidates, [], 16)

    expect(plan.promote).toHaveLength(16)
    expect(plan.demote).toEqual([])
  })

  it('never exceeds the cap — armed + newly promoted <= cap', () => {
    const candidates = Array.from({ length: 40 }, (_, i) => pending(i, true, i))
    const alreadyArmed = Array.from({ length: 10 }, (_, i) => armed(100 + i, true, false))

    const plan = planDeferredImagePromotion(candidates, alreadyArmed, 16)

    // 10 armed retained + promoted must not exceed 16.
    expect(plan.promote).toHaveLength(6)
    expect(alreadyArmed.length - plan.demote.length + plan.promote.length).toBeLessThanOrEqual(16)
  })

  it('promotes nearest first', () => {
    const candidates = [
      pending(1, true, 900),
      pending(2, true, 100),
      pending(3, true, 500),
    ]
    const plan = planDeferredImagePromotion(candidates, [], 2)

    expect(plan.promote).toEqual([2, 3])
  })

  it('never promotes a candidate that is not nearby', () => {
    const candidates = [
      pending(1, false, 10),
      pending(2, false, 20),
      pending(3, true, 30),
    ]
    const plan = planDeferredImagePromotion(candidates, [], 16)

    expect(plan.promote).toEqual([3])
  })

  it('is a no-op when the cap is already full of nearby armed images', () => {
    const candidates = Array.from({ length: 20 }, (_, i) => pending(i, true, i))
    const full = Array.from({ length: 16 }, (_, i) => armed(100 + i, true, false))

    const plan = planDeferredImagePromotion(candidates, full, 16)

    expect(plan.promote).toEqual([])
    expect(plan.demote).toEqual([])
  })

  it('demotes a stranded armed image (not loading, not nearby) and refills the freed slot', () => {
    // Cap 16, 16 armed but 3 have drifted out of the band and are not loading.
    const armedSet: ArmedCandidate[] = [
      ...Array.from({ length: 13 }, (_, i) => armed(i, true, false)),
      armed(90, false, false),
      armed(91, false, false),
      armed(92, false, false),
    ]
    const candidates = [pending(200, true, 5), pending(201, true, 8), pending(202, true, 9)]

    const plan = planDeferredImagePromotion(candidates, armedSet, 16)

    expect(plan.demote.sort()).toEqual([90, 91, 92])
    // 13 retained + 3 promoted = 16, still within cap.
    expect(plan.promote).toEqual([200, 201, 202])
  })

  it('never demotes an image that is loading, even if it drifted out of band', () => {
    const armedSet = [armed(1, false, true), armed(2, false, true)]
    const plan = planDeferredImagePromotion([], armedSet, 16)

    expect(plan.demote).toEqual([])
  })

  it('counts loading images against the cap so promotion cannot overshoot', () => {
    // All 16 slots are loading (in flight) — even though none is "nearby" in the
    // strict sense, they must not be demoted and no new promotion may happen.
    const loading = Array.from({ length: 16 }, (_, i) => armed(i, false, true))
    const candidates = Array.from({ length: 10 }, (_, i) => pending(100 + i, true, i))

    const plan = planDeferredImagePromotion(candidates, loading, 16)

    expect(plan.demote).toEqual([])
    expect(plan.promote).toEqual([])
  })

  it('handles a zero / negative cap defensively', () => {
    const candidates = [pending(1, true, 1)]
    expect(planDeferredImagePromotion(candidates, [], 0).promote).toEqual([])
    expect(planDeferredImagePromotion(candidates, [], -5).promote).toEqual([])
  })
})
