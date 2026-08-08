/*
 * Self-test for the motion/paint scanner.
 *
 * The scanner exists because the focus model fires on every D-pad press. A
 * transitioned `box-shadow` repaints its element every frame for the duration of
 * the transition, and the previous stylesheet transitioned `box-shadow`,
 * `background` and `border-color` on nine focusable surfaces. On the device that
 * is paint work on the one interaction the whole product is navigated with.
 *
 * These tests pin the scanner itself, not the stylesheet: the stylesheet is
 * asserted by `check-css-motion.mjs` at build time and by
 * `design-contract.test.mjs` in the suite.
 */

import { describe, expect, it } from 'vitest'
import { parseStylesheet } from './css-baseline-scan.mjs'
import {
  findBannedSelectors,
  findKeyframePaintAnimations,
  findTransitionViolations,
  findWillChange,
} from './css-motion-scan.mjs'

const scan = (source) => parseStylesheet(source)
const properties = (findings) => findings.map((finding) => finding.property)

describe('findTransitionViolations', () => {
  it('reports a transitioned box-shadow', () => {
    const findings = findTransitionViolations(scan('.card:focus { transition: box-shadow 200ms ease; }'))

    expect(properties(findings)).toEqual(['box-shadow'])
    expect(findings[0].prelude).toBe('.card:focus')
    expect(findings[0].line).toBe(1)
  })

  it('reports every non-compositor property in a multi-property transition', () => {
    const findings = findTransitionViolations(
      scan(`.card {
        transition:
          color 180ms ease,
          background 180ms ease,
          transform 180ms ease,
          border-color 180ms ease;
      }`),
    )

    expect(properties(findings).sort()).toEqual(['background', 'border-color', 'color'])
  })

  it('accepts compositor-only transitions', () => {
    const findings = findTransitionViolations(
      scan('.card:focus { transition: transform 200ms ease, opacity 200ms ease; }'),
    )

    expect(findings).toEqual([])
  })

  it('rejects an unlisted paint property such as color', () => {
    const findings = findTransitionViolations(scan('.link:focus { transition: color 200ms ease; }'))

    expect(properties(findings)).toEqual(['color'])
    expect(findings[0].kind).toBe('non-compositor')
  })

  it('reports layout-triggering transitions, which cost more than paint', () => {
    const findings = findTransitionViolations(
      scan('.card:focus { transition: width 200ms ease, padding 200ms ease; }'),
    )

    expect(properties(findings).sort()).toEqual(['padding', 'width'])
  })

  it('reports transition: all, which is a blank cheque', () => {
    const findings = findTransitionViolations(scan('.card { transition: all 200ms ease; }'))

    expect(properties(findings)).toEqual(['all'])
  })

  it('reports a timing-only shorthand that defaults to transition: all', () => {
    const findings = findTransitionViolations(scan('.card { transition: 200ms ease; }'))

    expect(properties(findings)).toEqual(['all'])
    expect(findings[0].kind).toBe('blanket')
  })

  it('reports a decimal timing-only shorthand that defaults to transition: all', () => {
    const findings = findTransitionViolations(scan('.card { transition: .2s ease-in-out; }'))

    expect(properties(findings)).toEqual(['all'])
    expect(findings[0].kind).toBe('blanket')
  })

  it('reports violations nested inside a media query', () => {
    const findings = findTransitionViolations(
      scan('@media (max-width: 680px) { .card:focus { transition: background 200ms ease; } }'),
    )

    expect(properties(findings)).toEqual(['background'])
  })

  it('reads the transition-property longhand as well as the shorthand', () => {
    const findings = findTransitionViolations(
      scan('.card { transition-property: filter; transition-duration: 200ms; }'),
    )

    expect(properties(findings)).toEqual(['filter'])
  })

  it('fails closed on a transition it cannot attribute to a property', () => {
    const findings = findTransitionViolations(scan('.card { transition: var(--focus-transition); }'))

    expect(findings).toHaveLength(1)
    expect(findings[0].property).toBe('(unresolved)')
  })

  it('ignores a transition that only names a duration for no property', () => {
    const findings = findTransitionViolations(scan('.card { transition: none; }'))

    expect(findings).toEqual([])
  })
})

describe('findWillChange', () => {
  it('reports will-change anywhere in the sheet', () => {
    const findings = findWillChange(scan('.card:focus { will-change: transform; }'))

    expect(findings).toHaveLength(1)
    expect(findings[0].detail).toContain('transform')
  })

  it('passes a sheet that leaves layer promotion to JS', () => {
    expect(findWillChange(scan('.card:focus { transform: scale(1.08); }'))).toEqual([])
  })
})

describe('findBannedSelectors', () => {
  it('reports :focus-visible, which this runtime does not implement', () => {
    const findings = findBannedSelectors(scan('.card:focus-visible { outline: 2px solid #fff; }'))

    expect(findings).toHaveLength(1)
    expect(findings[0].feature).toBe(':focus-visible')
  })

  it('reports :focus-visible even when a :focus twin sits in the same list', () => {
    /*
     * This is the exact shape of the shipped defect: an unknown pseudo-class
     * invalidates the entire selector list, so the authored :focus fallback was
     * discarded along with it.
     */
    const findings = findBannedSelectors(
      scan('.card:focus, .card:focus-visible { outline: 2px solid #fff; }'),
    )

    expect(findings).toHaveLength(1)
  })

  it('accepts :focus and :focus-within', () => {
    const findings = findBannedSelectors(
      scan('.card:focus { outline: 0; } .rail:focus-within .card { opacity: 0.55; }'),
    )

    expect(findings).toEqual([])
  })
})

describe('findKeyframePaintAnimations', () => {
  it('reports a paint property animated inside @keyframes', () => {
    const findings = findKeyframePaintAnimations(
      scan('@keyframes pulse { to { transform: scale(1.25); box-shadow: 0 0 0 0.5rem #fff; } }'),
    )

    expect(properties(findings)).toEqual(['box-shadow'])
    expect(findings[0].animation).toBe('pulse')
  })

  it('accepts keyframes that animate only compositor properties', () => {
    const findings = findKeyframePaintAnimations(
      scan('@keyframes pulse { to { transform: scale(1.25); opacity: 0.4; } }'),
    )

    expect(findings).toEqual([])
  })
})
