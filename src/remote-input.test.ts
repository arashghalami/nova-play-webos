import { describe, expect, it } from 'vitest'
import { isRemoteBack, remoteDirection, remoteKeyCode } from './remote-input'

describe('webOS remote input normalization', () => {
  it('normalizes modern and legacy arrow names', () => {
    expect(remoteDirection({ key: 'ArrowLeft' })).toBe('ArrowLeft')
    expect(remoteDirection({ key: 'Left' })).toBe('ArrowLeft')
    expect(remoteDirection({ key: 'Up' })).toBe('ArrowUp')
    expect(remoteDirection({ key: 'Right' })).toBe('ArrowRight')
    expect(remoteDirection({ key: 'Down' })).toBe('ArrowDown')
  })

  it('normalizes arrows reported only through legacy key codes', () => {
    expect(remoteDirection({ key: 'Unidentified', keyCode: 37 })).toBe('ArrowLeft')
    expect(remoteDirection({ key: 'Unidentified', keyCode: 38 })).toBe('ArrowUp')
    expect(remoteDirection({ key: '', which: 39 })).toBe('ArrowRight')
    expect(remoteDirection({ which: 40 })).toBe('ArrowDown')
  })

  it('recognizes webOS and browser Back variants', () => {
    expect(isRemoteBack({ key: 'Escape' })).toBe(true)
    expect(isRemoteBack({ key: 'BrowserBack' })).toBe(true)
    expect(isRemoteBack({ key: 'Unidentified', keyCode: 461 })).toBe(true)
    expect(isRemoteBack({ which: 10009 })).toBe(true)
    expect(isRemoteBack({ key: 'Enter', keyCode: 13 })).toBe(false)
  })

  it('prefers keyCode and falls back to which', () => {
    expect(remoteKeyCode({ keyCode: 39, which: 37 })).toBe(39)
    expect(remoteKeyCode({ keyCode: 0, which: 40 })).toBe(40)
  })
})