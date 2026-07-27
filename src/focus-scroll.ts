export type FocusViewportBounds = {
  top: number
  bottom: number
}

export function focusScrollDelta(
  elementTop: number,
  elementBottom: number,
  viewportHeight: number,
  bounds: FocusViewportBounds,
): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return 0
  }

  const safeTop = Math.max(0, bounds.top)
  const safeBottom = Math.max(safeTop, Math.min(viewportHeight, bounds.bottom))

  if (elementTop < safeTop) {
    return elementTop - safeTop
  }

  if (elementBottom > safeBottom) {
    return elementBottom - safeBottom
  }

  return 0
}