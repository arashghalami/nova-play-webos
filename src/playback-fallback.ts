export type PlaybackEngine = 'native' | 'hls' | 'mpegts' | 'dash'

export type PlaybackMediaKind =
  | 'hls'
  | 'transport-stream'
  | 'dash'
  | 'native'

export type PlaybackSourceKind =
  | 'provider-direct'
  | 'provider-declared'
  | 'xtream-hls'
  | 'xtream-transport-stream'
  | 'catchup'

export type PlaybackSource = {
  id: string
  kind: PlaybackSourceKind
  url: string
  mediaKind: PlaybackMediaKind
  label: string
}

export type PlaybackAttempt = {
  id: string
  engine: PlaybackEngine
  url: string
  label: string
  source: PlaybackSource
}

export type PlaybackFailureKind =
  | 'manifest'
  | 'network'
  | 'authorization'
  | 'timeout'
  | 'codec'
  | 'decode'
  | 'no-video-frames'
  | 'audio-only'
  | 'media-source'
  | 'drm'
  | 'unsupported'
  | 'protocol'
  | 'unknown'

export type PlaybackEvidence = {
  detail?: string
  videoCodec?: string
  audioCodec?: string
  hasVideo?: boolean
  hasAudio?: boolean
  decodedFrames?: number
  droppedFrames?: number
  httpStatus?: number
  contentType?: string
}

export type PlaybackFailure = {
  engine: PlaybackEngine
  source: PlaybackSourceKind
  kind: PlaybackFailureKind
  evidence?: PlaybackEvidence
}

export type PlaybackCapabilities = {
  nativeHls: boolean
  nativeTransportStream: boolean
  nativeVideo: boolean
  hlsJs: boolean
  mpegts: boolean
  dash: boolean
  preferNativeTransport: boolean
}

export type PlaybackSourceOptions = {
  isLive: boolean
  directUrl?: string
  declaredUrl?: string
  hlsUrl?: string
  transportStreamUrl?: string
  sourceOverride?: string
}

export type PlaybackPlanOptions = {
  preferHls: boolean
  capabilities: PlaybackCapabilities
  sources: PlaybackSource[]
}

function extensionOf(url: string): string {
  try {
    return new URL(url).pathname.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase() ?? ''
  } catch {
    return url.match(/(\.[a-z0-9]+)(?:[?#]|$)/i)?.[1]?.toLowerCase() ?? ''
  }
}

export function mediaKindForUrl(url: string): PlaybackMediaKind {
  const extension = extensionOf(url)

  if (extension === '.m3u8') {
    return 'hls'
  }

  if (extension === '.ts' || extension === '.m2ts' || extension === '.flv') {
    return 'transport-stream'
  }

  if (extension === '.mpd') {
    return 'dash'
  }

  return 'native'
}

function uniqueSources(sources: PlaybackSource[]): PlaybackSource[] {
  const seen = new Set<string>()

  return sources.filter((source) => {
    if (!source.url || seen.has(source.url)) {
      return false
    }

    seen.add(source.url)
    return true
  })
}

export function discoverPlaybackSources(options: PlaybackSourceOptions): PlaybackSource[] {
  const override = options.sourceOverride

  if (override) {
    return [{
      id: 'catchup',
      kind: 'catchup',
      url: override,
      mediaKind: mediaKindForUrl(override),
      label: 'Programme stream',
    }]
  }

  const sources: PlaybackSource[] = []

  if (options.directUrl) {
    sources.push({
      id: 'provider-direct',
      kind: 'provider-direct',
      url: options.directUrl,
      mediaKind: mediaKindForUrl(options.directUrl),
      label: 'Provider stream',
    })
  }

  if (options.declaredUrl) {
    sources.push({
      id: 'provider-declared',
      kind: 'provider-declared',
      url: options.declaredUrl,
      mediaKind: mediaKindForUrl(options.declaredUrl),
      label: 'Provider format',
    })
  }

  if (options.isLive && options.hlsUrl) {
    sources.push({
      id: 'xtream-hls',
      kind: 'xtream-hls',
      url: options.hlsUrl,
      mediaKind: 'hls',
      label: 'HLS stream',
    })
  }

  if (options.isLive && options.transportStreamUrl) {
    sources.push({
      id: 'xtream-transport-stream',
      kind: 'xtream-transport-stream',
      url: options.transportStreamUrl,
      mediaKind: 'transport-stream',
      label: 'MPEG-TS stream',
    })
  }

  return uniqueSources(sources)
}

function attempt(
  source: PlaybackSource,
  engine: PlaybackEngine,
  label: string,
): PlaybackAttempt {
  return {
    id: `${engine}:${source.id}:${source.url}`,
    engine,
    url: source.url,
    label,
    source,
  }
}

function attemptsForSource(
  source: PlaybackSource,
  capabilities: PlaybackCapabilities,
): PlaybackAttempt[] {
  if (source.mediaKind === 'hls') {
    return [
      ...(capabilities.nativeHls ? [attempt(source, 'native', 'Native HLS')] : []),
      ...(capabilities.hlsJs ? [attempt(source, 'hls', 'HLS')] : []),
    ]
  }

  if (source.mediaKind === 'transport-stream') {
    return [
      ...(capabilities.nativeTransportStream
        ? [attempt(source, 'native', 'Native MPEG-TS')]
        : []),
      ...(capabilities.mpegts ? [attempt(source, 'mpegts', 'MPEG-TS')] : []),
    ]
  }

  if (source.mediaKind === 'dash') {
    return [
      ...(capabilities.dash ? [attempt(source, 'dash', 'MPEG-DASH')] : []),
      ...(capabilities.nativeVideo ? [attempt(source, 'native', 'Native DASH')] : []),
    ]
  }

  return capabilities.nativeVideo ? [attempt(source, 'native', source.label)] : []
}

function uniqueAttempts(attempts: PlaybackAttempt[]): PlaybackAttempt[] {
  const seen = new Set<string>()

  return attempts.filter((candidate) => {
    const key = `${candidate.engine}:${candidate.url}`

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

export function planPlaybackAttempts(options: PlaybackPlanOptions): PlaybackAttempt[] {
  const hlsSources = options.sources.filter((source) => source.mediaKind === 'hls')
  const transportSources = options.sources.filter(
    (source) => source.mediaKind === 'transport-stream',
  )
  const dashSources = options.sources.filter((source) => source.mediaKind === 'dash')
  const nativeSources = options.sources.filter((source) => source.mediaKind === 'native')

  const hlsAttempts = hlsSources.flatMap((source) =>
    attemptsForSource(source, options.capabilities),
  )
  const transportAttempts = transportSources.flatMap((source) =>
    attemptsForSource(source, options.capabilities),
  )
  const dashAttempts = dashSources.flatMap((source) =>
    attemptsForSource(source, options.capabilities),
  )
  const nativeAttempts = nativeSources.flatMap((source) =>
    attemptsForSource(source, options.capabilities),
  )

  const transportFirst =
    options.capabilities.preferNativeTransport || !options.preferHls
      ? [...transportAttempts, ...hlsAttempts]
      : [...hlsAttempts, ...transportAttempts]

  return uniqueAttempts([...transportFirst, ...dashAttempts, ...nativeAttempts])
}

function engineLabel(engine: PlaybackEngine): string {
  if (engine === 'hls') return 'HLS'
  if (engine === 'mpegts') return 'MPEG-TS'
  if (engine === 'dash') return 'MPEG-DASH'
  return 'native playback'
}

function attemptedEngines(failures: PlaybackFailure[]): string {
  return [...new Set(failures.map((failure) => engineLabel(failure.engine)))].join(' and ')
}

function knownCodec(failures: PlaybackFailure[]): string | null {
  const codecFailure = failures.find(
    (failure) =>
      failure.kind === 'codec' &&
      (failure.evidence?.videoCodec || failure.evidence?.audioCodec),
  )

  if (!codecFailure) {
    return null
  }

  return codecFailure.evidence?.videoCodec ?? codecFailure.evidence?.audioCodec ?? null
}

export function describePlaybackFailure(failures: PlaybackFailure[]): string {
  const attempted = attemptedEngines(failures) || 'all available'
  const codec = knownCodec(failures)
  const hasAudioOnly = failures.some((failure) => failure.kind === 'audio-only')
  const hasDrm = failures.some((failure) => failure.kind === 'drm')
  const hasAuthorization = failures.some(
    (failure) => failure.kind === 'authorization',
  )
  const hasNoFrames = failures.some(
    (failure) => failure.kind === 'no-video-frames',
  )
  const hasManifest = failures.some((failure) => failure.kind === 'manifest')
  const hasNetwork = failures.some(
    (failure) => failure.kind === 'network' || failure.kind === 'timeout',
  )
  const hasMediaSource = failures.some(
    (failure) => failure.kind === 'media-source',
  )

  if (hasDrm) {
    return `Playback requires DRM support or a license that is not configured on this TV. ${attempted} was checked.`
  }

  if (hasAuthorization) {
    return `The provider rejected this playback stream. Check the subscription or provider session, then retry.`
  }

  if (hasAudioOnly) {
    return `This service delivered audio but no video track. ${attempted} was checked.`
  }

  if (codec) {
    return `This stream reports the ${codec} codec, which this runtime cannot use. ${attempted} was checked.`
  }

  if (hasNoFrames) {
    return `The stream loaded but produced no video frames on this device. ${attempted} was checked. Try the same channel on the physical TV or use a compatible provider rendition.`
  }

  if (hasManifest && hasNetwork) {
    return `The provider's HLS media was unavailable and no compatible fallback stream started after ${attempted} attempts.`
  }

  if (hasMediaSource) {
    return `This device could not initialize a compatible media pipeline after ${attempted} attempts.`
  }

  if (hasNetwork) {
    return `The provider stream could not be loaded after ${attempted} attempts. Check the network or try again shortly.`
  }

  return `Playback could not start after ${attempted} attempts. Review the diagnostics for the stream-specific result.`
}

export function playbackDiagnosticLines(failures: PlaybackFailure[]): string[] {
  return failures.map((failure) => {
    const detail =
      failure.evidence?.videoCodec ??
      failure.evidence?.audioCodec ??
      failure.evidence?.detail ??
      ''

    return `${engineLabel(failure.engine)} · ${failure.kind}${detail ? ` · ${detail}` : ''}`
  })
}