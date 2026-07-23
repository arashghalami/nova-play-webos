import { describe, expect, it } from 'vitest'
import {
  clampSeekPosition,
  hasVerifiedVideoFrame,
  isDoubleSeekTap,
  SEEK_DOUBLE_TAP_WINDOW_MS,
  seekFeedbackLabel,
  seekStepForHold,
} from './player-transport'

describe('player transport behavior', () => {
  it('starts with a conservative 10-second hold jump and accelerates over time', () => {
    expect(seekStepForHold(0)).toBe(10)
    expect(seekStepForHold(1_199)).toBe(10)
    expect(seekStepForHold(1_200)).toBe(20)
    expect(seekStepForHold(2_799)).toBe(20)
    expect(seekStepForHold(2_800)).toBe(30)
    expect(seekStepForHold(4_999)).toBe(30)
    expect(seekStepForHold(5_000)).toBe(60)
  })

  it('recognizes only a quick second tap in the same direction as a double seek', () => {
    expect(isDoubleSeekTap(-1, 1_000, -1, 1_000 + SEEK_DOUBLE_TAP_WINDOW_MS)).toBe(true)
    expect(isDoubleSeekTap(-1, 1_000, 1, 1_100)).toBe(false)
    expect(isDoubleSeekTap(-1, 1_000, -1, 1_001 + SEEK_DOUBLE_TAP_WINDOW_MS)).toBe(false)
    expect(isDoubleSeekTap(null, 0, 1, 100)).toBe(false)
  })

  it('clamps seek positions to the finite media timeline', () => {
    expect(clampSeekPosition(-12, 300)).toBe(0)
    expect(clampSeekPosition(312, 300)).toBe(300)
    expect(clampSeekPosition(125, 300)).toBe(125)
    expect(clampSeekPosition(125, Number.NaN)).toBe(125)
  })

  it('requires decoded-frame progression before treating video dimensions and time as visible playback', () => {
    expect(hasVerifiedVideoFrame(1920, 1080, 4, 0, 0)).toBe(false)
    expect(hasVerifiedVideoFrame(1920, 1080, 4, null, 1)).toBe(false)
    expect(hasVerifiedVideoFrame(1920, 1080, 0, 0, 1)).toBe(false)
    expect(hasVerifiedVideoFrame(0, 1080, 4, 0, 1)).toBe(false)
    expect(hasVerifiedVideoFrame(1920, 1080, 4, 0, 1)).toBe(true)
  })

  it('provides conventional directional seek feedback', () => {
    expect(seekFeedbackLabel(-10)).toBe('−10 seconds')
    expect(seekFeedbackLabel(60)).toBe('+60 seconds')
  })
})