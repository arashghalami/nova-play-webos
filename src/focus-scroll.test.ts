import { describe, expect, it } from 'vitest'
import { focusScrollDelta } from './focus-scroll'

describe('focus scroll visibility', () => {
  const viewport = 720
  const safeArea = { top: 110, bottom: 660 }

  it('does not scroll a focused episode already inside the TV-safe viewport', () => {
    expect(focusScrollDelta(180, 300, viewport, safeArea)).toBe(0)
  })

  it('scrolls a focused lower episode above the fixed help bar', () => {
    expect(focusScrollDelta(610, 735, viewport, safeArea)).toBe(75)
  })

  it('scrolls a focused upper target below the sticky top bar', () => {
    expect(focusScrollDelta(60, 150, viewport, safeArea)).toBe(-50)
  })

  it('uses no adjustment for an invalid viewport', () => {
    expect(focusScrollDelta(700, 820, 0, safeArea)).toBe(0)
  })
})