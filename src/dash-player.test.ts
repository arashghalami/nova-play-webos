import { afterEach, describe, expect, it } from 'vitest'
import { dashMediaPlayerFactory, type DashMediaPlayerFactory } from './dash-player'

const dashGlobal = globalThis as typeof globalThis & {
  dashjs?: { MediaPlayer?: unknown }
}

let originalDashjs: { MediaPlayer?: unknown } | undefined

afterEach(() => {
  if (originalDashjs === undefined) {
    delete dashGlobal.dashjs
  } else {
    dashGlobal.dashjs = originalDashjs
  }

  originalDashjs = undefined
})

describe('dashMediaPlayerFactory', () => {
  it('returns null until the separately loaded UMD player is available', () => {
    originalDashjs = dashGlobal.dashjs
    delete dashGlobal.dashjs

    expect(dashMediaPlayerFactory()).toBeNull()
  })

  it('returns the UMD MediaPlayer factory without importing dash.js into the application module graph', () => {
    originalDashjs = dashGlobal.dashjs
    const factory: DashMediaPlayerFactory = Object.assign(
      () => ({
        create: () => ({
          reset() {},
          initialize() {},
          on() {},
        }),
      }),
      {
        events: {
          ERROR: 'error',
          STREAM_INITIALIZED: 'streamInitialized',
        },
      },
    )
    dashGlobal.dashjs = { MediaPlayer: factory }

    expect(dashMediaPlayerFactory()).toBe(factory)
  })
})