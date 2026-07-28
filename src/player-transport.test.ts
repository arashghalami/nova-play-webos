import { describe, expect, it } from 'vitest'
import {
  applyPlaybackRate,
  clampSeekPosition,
  effectivePreservePitch,
  hasAdvancedPlaybackTimeline,
  hasVerifiedVideoFrame,
  hasVisibleVideoTrack,
  isDoubleSeekTap,
  supportsAudiblePlaybackRate,
  type PitchControllableMedia,
  SEEK_DOUBLE_TAP_WINDOW_MS,
  seekFeedbackLabel,
  seekStepForHold,
  timelinePercentFromPosition,
  timelinePositionFromPercent,
  TIMELINE_SEEK_STEP_SECONDS,
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

  it('accepts an advancing, dimensioned video track when webOS does not expose frame counters', () => {
    expect(hasVisibleVideoTrack(1920, 1080, 1)).toBe(true)
    expect(hasVisibleVideoTrack(1920, 1080, 0.5)).toBe(false)
    expect(hasVisibleVideoTrack(0, 1080, 5)).toBe(false)
    expect(hasVisibleVideoTrack(1920, 0, 5)).toBe(false)
  })

  it('keeps playback alive when webOS exposes only an advancing timeline', () => {
    expect(hasAdvancedPlaybackTimeline(1)).toBe(true)
    expect(hasAdvancedPlaybackTimeline(0.5)).toBe(false)
    expect(hasAdvancedPlaybackTimeline(0)).toBe(false)
  })

  it('provides conventional directional seek feedback', () => {
    expect(seekFeedbackLabel(-10)).toBe('−10 seconds')
    expect(seekFeedbackLabel(60)).toBe('+60 seconds')
  })

  it('maps YouTube-style timeline previews between percentages and media positions', () => {
    expect(TIMELINE_SEEK_STEP_SECONDS).toBe(5)
    expect(timelinePositionFromPercent(25, 400)).toBe(100)
    expect(timelinePositionFromPercent(-10, 400)).toBe(0)
    expect(timelinePositionFromPercent(110, 400)).toBe(400)
    expect(timelinePositionFromPercent(50, Number.NaN)).toBe(0)
    expect(timelinePercentFromPosition(100, 400)).toBe(25)
    expect(timelinePercentFromPosition(-5, 400)).toBe(0)
    expect(timelinePercentFromPosition(450, 400)).toBe(100)
    expect(timelinePercentFromPosition(100, 0)).toBe(0)
  })

  it('blocks accelerated playback on webOS because native fast playback mutes audio', () => {
    expect(supportsAudiblePlaybackRate(true)).toBe(false)
    expect(effectivePreservePitch(true, true)).toBe(false)
    expect(effectivePreservePitch(false, true)).toBe(false)
  })

  it('allows accelerated playback and honors pitch preferences on non-webOS runtimes', () => {
    expect(supportsAudiblePlaybackRate(false)).toBe(true)
    expect(effectivePreservePitch(true, false)).toBe(true)
    expect(effectivePreservePitch(false, false)).toBe(false)
  })

  it('sets available vendor pitch flags true when pitch preservation is enabled above 1x', () => {
    const media: PitchControllableMedia = {
      playbackRate: 1,
      preservesPitch: false,
      mozPreservesPitch: false,
      webkitPreservesPitch: false,
    }
    applyPlaybackRate(media, 1.5, true)
    expect(media.preservesPitch).toBe(true)
    expect(media.mozPreservesPitch).toBe(true)
    expect(media.webkitPreservesPitch).toBe(true)
    expect(media.playbackRate).toBe(1.5)
  })

  it('sets available vendor pitch flags false when pitch preservation is disabled above 1x', () => {
    const media: PitchControllableMedia = {
      playbackRate: 1,
      preservesPitch: true,
      mozPreservesPitch: true,
      webkitPreservesPitch: true,
    }
    applyPlaybackRate(media, 2, false)
    expect(media.preservesPitch).toBe(false)
    expect(media.mozPreservesPitch).toBe(false)
    expect(media.webkitPreservesPitch).toBe(false)
    expect(media.playbackRate).toBe(2)
  })

  it('does not create unsupported pitch properties on older webOS media elements', () => {
    const media: PitchControllableMedia = { playbackRate: 1 }
    applyPlaybackRate(media, 1.5, false)
    expect(media).not.toHaveProperty('preservesPitch')
    expect(media).not.toHaveProperty('mozPreservesPitch')
    expect(media).not.toHaveProperty('webkitPreservesPitch')
    expect(media.playbackRate).toBe(1.5)
  })

  it('leaves pitch flags untouched at exactly 1x to preserve the default audio path', () => {
    const media: PitchControllableMedia = {
      playbackRate: 2,
      preservesPitch: true,
      mozPreservesPitch: true,
      webkitPreservesPitch: true,
    }
    applyPlaybackRate(media, 1, false)
    expect(media.preservesPitch).toBe(true)
    expect(media.mozPreservesPitch).toBe(true)
    expect(media.webkitPreservesPitch).toBe(true)
    expect(media.playbackRate).toBe(1)
  })
})
