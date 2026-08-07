import { describe, expect, it } from 'vitest'
import {
  type AudioTrackInfo,
  type TextTrackInfo,
  languageName,
  nextAudioIndex,
  nextTextIndex,
  trackLabel,
} from './track-selection'

function audio(enabled: boolean, language?: string, label?: string): AudioTrackInfo {
  return { enabled, language, label }
}
function text(mode: TextTrackInfo['mode'], language?: string, label?: string): TextTrackInfo {
  return { mode, language, label }
}

describe('nextAudioIndex', () => {
  it('advances from the enabled track and wraps', () => {
    const tracks = [audio(true, 'en'), audio(false, 'fa')]
    expect(nextAudioIndex(tracks)).toBe(1)
    expect(nextAudioIndex([audio(false, 'en'), audio(true, 'fa')])).toBe(0)
  })

  it('starts at 0 -> 1 when none is marked enabled', () => {
    expect(nextAudioIndex([audio(false), audio(false)])).toBe(1)
  })

  it('returns -1 when there are no tracks (native reports one/none)', () => {
    expect(nextAudioIndex([])).toBe(-1)
  })

  it('a single track wraps back to itself (0)', () => {
    expect(nextAudioIndex([audio(true, 'en')])).toBe(0)
  })
})

describe('nextTextIndex', () => {
  it('cycles current -> next -> off -> first', () => {
    const two = [text('showing', 'en'), text('disabled', 'fa')]
    expect(nextTextIndex(two)).toBe(1) // en -> fa
    expect(nextTextIndex([text('disabled', 'en'), text('showing', 'fa')])).toBe(-1) // last -> off
    expect(nextTextIndex([text('disabled', 'en'), text('disabled', 'fa')])).toBe(0) // off -> first
  })

  it('a single track toggles on -> off -> on', () => {
    expect(nextTextIndex([text('disabled', 'en')])).toBe(0)
    expect(nextTextIndex([text('showing', 'en')])).toBe(-1)
  })

  it('returns -1 (off) when there are no tracks', () => {
    expect(nextTextIndex([])).toBe(-1)
  })
})

describe('trackLabel', () => {
  it('prefers an explicit label', () => {
    expect(trackLabel({ label: 'Director Commentary', language: 'en' }, 0)).toBe('Director Commentary')
  })

  it('maps a language code to a readable name', () => {
    expect(trackLabel({ language: 'fa' }, 1)).toBe('Persian')
    expect(trackLabel({ language: 'eng' }, 0)).toBe('English')
  })

  it('ignores the und (undefined) language and falls back to position', () => {
    expect(trackLabel({ language: 'und' }, 2)).toBe('Track 3')
  })

  it('falls back to a 1-based position when nothing is known', () => {
    expect(trackLabel(undefined, 0)).toBe('Track 1')
    expect(trackLabel({}, 4)).toBe('Track 5')
  })

  it('uppercases an unknown language code rather than blanking', () => {
    expect(trackLabel({ language: 'xx' }, 0)).toBe('XX')
  })
})

describe('languageName', () => {
  it('handles BCP-47 region suffixes', () => {
    expect(languageName('en-US')).toBe('English')
    expect(languageName('pt_BR')).toBe('Portuguese')
  })
})
