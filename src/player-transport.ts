export const SEEK_DOUBLE_TAP_WINDOW_MS = 350
export const TIMELINE_SEEK_STEP_SECONDS = 5

export function hasVerifiedVideoFrame(
  width: number,
  height: number,
  currentTime: number,
  decodedFrameBaseline: number | null,
  decodedFrames: number | null,
): boolean {
  return (
    width > 0 &&
    height > 0 &&
    currentTime > 0 &&
    decodedFrameBaseline !== null &&
    decodedFrames !== null &&
    decodedFrames > decodedFrameBaseline
  )
}

/**
 * Some webOS media pipelines render correctly but never update
 * getVideoPlaybackQuality().totalVideoFrames. Dimensions plus an advancing
 * timeline are the portable confirmation fallback for those devices.
 */
export function hasVisibleVideoTrack(
  width: number,
  height: number,
  currentTime: number,
): boolean {
  return width > 0 && height > 0 && currentTime >= 1
}

/**
 * WebOS hardware decoders can omit both frame counters and dimensions while
 * video is playing. An advancing media timeline is sufficient to stop the
 * startup watchdog from tearing down working playback.
 */
export function hasAdvancedPlaybackTimeline(currentTime: number): boolean {
  return currentTime >= 1
}

export function seekStepForHold(heldMs: number): number {
  if (heldMs >= 5_000) {
    return 60
  }

  if (heldMs >= 2_800) {
    return 30
  }

  if (heldMs >= 1_200) {
    return 20
  }

  return 10
}

export function isDoubleSeekTap(
  previousDirection: number | null,
  previousAt: number,
  direction: number,
  now: number,
): boolean {
  return (
    previousDirection === direction &&
    now >= previousAt &&
    now - previousAt <= SEEK_DOUBLE_TAP_WINDOW_MS
  )
}

export function clampSeekPosition(position: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return position
  }

  return Math.max(0, Math.min(duration, position))
}

export function timelinePositionFromPercent(percent: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(percent)) {
    return 0
  }

  return clampSeekPosition((Math.max(0, Math.min(100, percent)) / 100) * duration, duration)
}

export function timelinePercentFromPosition(position: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position)) {
    return 0
  }

  return (clampSeekPosition(position, duration) / duration) * 100
}

export function seekFeedbackLabel(seconds: number): string {
  return `${seconds < 0 ? '−' : '+'}${Math.abs(seconds)} seconds`
}

/** Element shape covering standard + legacy vendor-prefixed pitch flags. */
export interface PitchControllableMedia {
  playbackRate: number
  preservesPitch?: boolean
  mozPreservesPitch?: boolean
  webkitPreservesPitch?: boolean
}

/**
 * Apply playback rate and pitch handling in one place. When preservePitch is
 * true, request YouTube-style pitch-preserving time-stretch (natural voice);
 * when false, disable it so audio stays audible (higher pitch) instead of the
 * silence some webOS builds emit while time-stretching. Writes all vendor
 * variants because older webOS Chromium only honors the prefixed forms.
 *
 * At exactly 1× there is no time-stretching to perform, so the pitch flags are
 * intentionally left untouched. Some webOS audio pipelines attach a broken
 * resampler node the moment preservesPitch is written and emit silence even at
 * normal speed; skipping the write at 1× preserves the untouched-default audio
 * path that plays correctly.
 */
export function applyPlaybackRate(
  media: PitchControllableMedia,
  rate: number,
  preservePitch: boolean,
): void {
  if (rate !== 1) {
    media.preservesPitch = preservePitch
    media.mozPreservesPitch = preservePitch
    media.webkitPreservesPitch = preservePitch
  }

  media.playbackRate = rate
}