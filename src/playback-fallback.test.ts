import { describe, expect, it } from 'vitest'
import {
  describePlaybackFailure,
  discoverPlaybackSources,
  mediaKindForUrl,
  planPlaybackAttempts,
} from './playback-fallback'

const capabilities = {
  nativeHls: true,
  nativeTransportStream: true,
  nativeVideo: true,
  hlsJs: true,
  mpegts: true,
  dash: true,
  preferNativeTransport: false,
}

describe('discoverPlaybackSources', () => {
  it('uses real provider source variants without inventing unrelated extensions', () => {
    const sources = discoverPlaybackSources({
      isLive: true,
      directUrl: 'https://cdn.example/stream/42.mpd',
      declaredUrl: 'https://provider.example/live/user/pass/42.ts',
      hlsUrl: 'https://provider.example/live/user/pass/42.m3u8',
      transportStreamUrl: 'https://provider.example/live/user/pass/42.ts',
    })

    expect(sources.map((source) => [source.kind, source.mediaKind])).toEqual([
      ['provider-direct', 'dash'],
      ['provider-declared', 'transport-stream'],
      ['xtream-hls', 'hls'],
    ])
    expect(sources.some((source) => source.url.endsWith('.mp4'))).toBe(false)
  })

  it('treats a source override as the only catch-up source', () => {
    const sources = discoverPlaybackSources({
      isLive: true,
      directUrl: 'https://provider.example/live/user/pass/42.ts',
      sourceOverride: 'https://provider.example/timeshift/user/pass/42.ts',
    })

    expect(sources).toEqual([
      expect.objectContaining({
        kind: 'catchup',
        mediaKind: 'transport-stream',
      }),
    ])
  })
})

describe('planPlaybackAttempts', () => {
  it('uses a deterministic HLS, transport, DASH, and native sequence', () => {
    const sources = discoverPlaybackSources({
      isLive: true,
      directUrl: 'https://cdn.example/stream/42.mpd',
      declaredUrl: 'https://provider.example/live/user/pass/42.ts',
      hlsUrl: 'https://provider.example/live/user/pass/42.m3u8',
      transportStreamUrl: 'https://provider.example/live/user/pass/42.ts',
    })

    const attempts = planPlaybackAttempts({
      preferHls: true,
      capabilities,
      sources,
    })

    expect(attempts.map((attempt) => [attempt.engine, attempt.label])).toEqual([
      ['native', 'Native HLS'],
      ['hls', 'HLS'],
      ['native', 'Native MPEG-TS'],
      ['mpegts', 'MPEG-TS'],
      ['dash', 'MPEG-DASH'],
      ['native', 'Native DASH'],
    ])
  })

  it('prioritizes native and transmuxed transport playback when configured', () => {
    const sources = discoverPlaybackSources({
      isLive: true,
      hlsUrl: 'https://provider.example/live/user/pass/42.m3u8',
      transportStreamUrl: 'https://provider.example/live/user/pass/42.ts',
    })

    const attempts = planPlaybackAttempts({
      preferHls: true,
      capabilities: { ...capabilities, preferNativeTransport: true },
      sources,
    })

    expect(attempts.slice(0, 2).map((attempt) => attempt.engine)).toEqual([
      'native',
      'mpegts',
    ])
  })
})

describe('describePlaybackFailure', () => {
  it('does not call a zero-frame stream an unsupported codec without codec evidence', () => {
    expect(
      describePlaybackFailure([
        {
          engine: 'hls',
          source: 'xtream-hls',
          kind: 'manifest',
        },
        {
          engine: 'mpegts',
          source: 'xtream-transport-stream',
          kind: 'no-video-frames',
        },
      ]),
    ).toBe(
      'The stream loaded but produced no video frames on this device. HLS and MPEG-TS was checked. Try the same channel on the physical TV or use a compatible provider rendition.',
    )
  })

  it('reports a codec only when an engine supplied a codec string', () => {
    expect(
      describePlaybackFailure([
        {
          engine: 'mpegts',
          source: 'xtream-transport-stream',
          kind: 'codec',
          evidence: { videoCodec: 'hev1.1.6.L93.B0' },
        },
      ]),
    ).toBe(
      'This stream reports the hev1.1.6.L93.B0 codec, which this runtime cannot use. MPEG-TS was checked.',
    )
  })

  it('classifies media kinds from actual extensions', () => {
    expect(mediaKindForUrl('https://example.test/video.mpd')).toBe('dash')
    expect(mediaKindForUrl('https://example.test/video.ts')).toBe('transport-stream')
    expect(mediaKindForUrl('https://example.test/video.mp4')).toBe('native')
  })
})