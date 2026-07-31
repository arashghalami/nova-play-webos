import { describe, expect, it } from 'vitest'
import { createFrameNavigationScheduler } from './frame-navigation'
import type { NavigationDirection } from './navigation'

type ScheduledFrame = {
  handle: number
  callback: FrameRequestCallback
}

function fakeFrameDriver(): {
  driver: {
    requestFrame(callback: FrameRequestCallback): number
    cancelFrame(handle: number): void
  }
  flush(): void
  scheduled(): number
} {
  let nextHandle = 1
  const frames = new Map<number, ScheduledFrame>()

  return {
    driver: {
      requestFrame(callback): number {
        const handle = nextHandle
        nextHandle += 1
        frames.set(handle, { handle, callback })
        return handle
      },

      cancelFrame(handle): void {
        frames.delete(handle)
      },
    },

    flush(): void {
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach((frame) => frame.callback(0))
    },

    scheduled(): number {
      return frames.size
    },
  }
}

describe('createFrameNavigationScheduler', () => {
  it('coalesces a repeat burst into one move using the latest direction', () => {
    const frame = fakeFrameDriver()
    const directions: NavigationDirection[] = []
    const scheduler = createFrameNavigationScheduler(
      (direction) => directions.push(direction),
      frame.driver,
    )

    scheduler.schedule('ArrowRight')
    scheduler.schedule('ArrowRight')
    scheduler.schedule('ArrowDown')

    expect(frame.scheduled()).toBe(1)
    expect(scheduler.pending).toBe(true)

    frame.flush()

    expect(directions).toEqual(['ArrowDown'])
    expect(scheduler.pending).toBe(false)
  })

  it('permits one fresh move in each rendered frame', () => {
    const frame = fakeFrameDriver()
    const directions: NavigationDirection[] = []
    const scheduler = createFrameNavigationScheduler(
      (direction) => directions.push(direction),
      frame.driver,
    )

    scheduler.schedule('ArrowLeft')
    frame.flush()
    scheduler.schedule('ArrowLeft')
    frame.flush()

    expect(directions).toEqual(['ArrowLeft', 'ArrowLeft'])
  })

  it('cancels stale input when the screen changes before the frame runs', () => {
    const frame = fakeFrameDriver()
    const directions: NavigationDirection[] = []
    const scheduler = createFrameNavigationScheduler(
      (direction) => directions.push(direction),
      frame.driver,
    )

    scheduler.schedule('ArrowUp')
    scheduler.cancel()
    frame.flush()

    expect(directions).toEqual([])
    expect(scheduler.pending).toBe(false)
  })
})