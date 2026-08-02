import { afterEach, describe, expect, it } from 'vitest'
import {
  hlsConstructor,
  mpegtsEngine,
  type HlsConstructor,
  type MpegtsEngine,
} from './media-engines'

const mediaGlobals = globalThis as typeof globalThis & {
  Hls?: unknown
  mpegts?: unknown
}

let originalHls: unknown
let originalMpegts: unknown

afterEach(() => {
  if (originalHls === undefined) {
    delete mediaGlobals.Hls
  } else {
    mediaGlobals.Hls = originalHls
  }

  if (originalMpegts === undefined) {
    delete mediaGlobals.mpegts
  } else {
    mediaGlobals.mpegts = originalMpegts
  }

  originalHls = undefined
  originalMpegts = undefined
})

describe('media engine accessors', () => {
  it('requires separately loaded HLS and MPEG-TS UMD globals', () => {
    originalHls = mediaGlobals.Hls
    originalMpegts = mediaGlobals.mpegts
    delete mediaGlobals.Hls
    delete mediaGlobals.mpegts

    expect(hlsConstructor()).toBeNull()
    expect(mpegtsEngine()).toBeNull()
  })

  it('returns media engines from their UMD globals without importing them into the app graph', () => {
    originalHls = mediaGlobals.Hls
    originalMpegts = mediaGlobals.mpegts

    const Hls = function () {} as unknown as HlsConstructor
    Hls.isSupported = () => true
    Hls.Events = {
      MEDIA_ATTACHED: 'mediaAttached',
      BUFFER_CODECS: 'bufferCodecs',
      MANIFEST_PARSED: 'manifestParsed',
      ERROR: 'error',
    }
    Hls.ErrorTypes = {
      NETWORK_ERROR: 'networkError',
      MEDIA_ERROR: 'mediaError',
    }
    const mpegts = {
      isSupported: () => true,
      getFeatureList: () => ({ mseLivePlayback: true }),
      createPlayer: () => ({
        pause() {},
        unload() {},
        detachMediaElement() {},
        destroy() {},
        on() {},
        attachMediaElement() {},
        load() {},
        play() {},
      }),
      Events: { MEDIA_INFO: 'mediaInfo', ERROR: 'error' },
      ErrorDetails: {
        MEDIA_FORMAT_UNSUPPORTED: 'mediaFormatUnsupported',
        MEDIA_CODEC_UNSUPPORTED: 'mediaCodecUnsupported',
        MEDIA_FORMAT_ERROR: 'mediaFormatError',
        MEDIA_MSE_ERROR: 'mediaMseError',
        NETWORK_TIMEOUT: 'networkTimeout',
        NETWORK_EXCEPTION: 'networkException',
        NETWORK_STATUS_CODE_INVALID: 'networkStatusCodeInvalid',
        NETWORK_UNRECOVERABLE_EARLY_EOF: 'networkUnrecoverableEarlyEof',
      },
    } satisfies MpegtsEngine

    mediaGlobals.Hls = Hls
    mediaGlobals.mpegts = mpegts

    expect(hlsConstructor()).toBe(Hls)
    expect(mpegtsEngine()).toBe(mpegts)
  })
})