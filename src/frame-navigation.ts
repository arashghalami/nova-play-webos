import type { NavigationDirection } from './navigation'

export type AnimationFrameDriver = {
  requestFrame(callback: FrameRequestCallback): number
  cancelFrame(handle: number): void
}

export type FrameNavigationScheduler = {
  schedule(direction: NavigationDirection): void
  cancel(): void
  readonly pending: boolean
}

/**
 * Coalesces a burst of remote D-pad events into at most one navigation move per
 * animation frame. The most recent direction wins, which prevents webOS key
 * repeat events from accumulating a long, stale input queue.
 */
export function createFrameNavigationScheduler(
  dispatch: (direction: NavigationDirection) => void,
  driver: AnimationFrameDriver,
): FrameNavigationScheduler {
  let frameHandle: number | null = null
  let pendingDirection: NavigationDirection | null = null

  const flush = (): void => {
    frameHandle = null

    const direction = pendingDirection
    pendingDirection = null

    if (direction) {
      dispatch(direction)
    }
  }

  return {
    schedule(direction): void {
      pendingDirection = direction

      if (frameHandle === null) {
        frameHandle = driver.requestFrame(flush)
      }
    },

    cancel(): void {
      pendingDirection = null

      if (frameHandle !== null) {
        driver.cancelFrame(frameHandle)
        frameHandle = null
      }
    },

    get pending(): boolean {
      return frameHandle !== null
    },
  }
}