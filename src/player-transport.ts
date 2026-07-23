export const SEEK_DOUBLE_TAP_WINDOW_MS = 350

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

export function seekFeedbackLabel(seconds: number): string {
  return `${seconds < 0 ? '−' : '+'}${Math.abs(seconds)} seconds`
}