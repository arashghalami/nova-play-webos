import type { NowNext, Program, StreamItem } from './types'
import type {
  EpgCapabilityRecord,
  EpgCapabilityState,
  LibraryEpgKind,
} from './library/catalog-repository'

/**
 * General EPG capability + retrieval policy, independent of any specific
 * provider, host, lineup, or channel. It encodes the rules the task requires:
 *
 *   - Guide data is requested only for a channel the caller explicitly asks
 *     about (a visible row or an opened channel). There is no fan-out and no
 *     prefetch here; callers drive one channel at a time.
 *   - A channel with a blank `epgChannelId` is an authoritative negative: it has
 *     no schedule anywhere, so no provider request is ever issued for it.
 *   - The durable cache is always consulted before any provider request.
 *   - Host EPG capability is a per-profile property, detected once and persisted.
 *   - When the provider host serves no guide but a channel carries an
 *     identifier, a public-source fallback keyed on that identifier may answer.
 *
 * The service is deliberately free of DOM, timers, and module globals so it can
 * be unit-tested directly.
 */

export type EpgSource = 'provider' | 'public' | 'cache'

export type NowNextResult = {
  nowNext: NowNext
  source: EpgSource
} | null

export type ScheduleResult = {
  programs: Program[]
  source: EpgSource
} | null

/**
 * Three-state classification of a channel's guide identifier. This distinction
 * is load-bearing: treating a missing field as an authoritative negative (the
 * original two-state bug) silently suppressed EPG for every record stored before
 * `epg_channel_id` capture existed.
 *
 *   - `populated`: a real identifier. Request provider EPG (by stream id) and,
 *     on a non-serving host, the public source (by identifier).
 *   - `blank`: an empty string or the literal `"null"`. The provider itself
 *     declared no guide mapping for this channel — an authoritative negative, so
 *     no request is ever issued.
 *   - `absent`: the field is missing entirely. The stored generation predates
 *     capture, so mapping is UNKNOWN, not negative. A provider probe is allowed
 *     (the provider EPG endpoints key on stream id, not the identifier); it is
 *     cheap, cached, and only fires for a channel the user opens or a visible
 *     guide row. The public source cannot run (there is no identifier to key on).
 */
export type EpgIdentifierState = 'populated' | 'blank' | 'absent'

export function epgIdentifierState(
  stream: Pick<StreamItem, 'epgChannelId'>,
): EpgIdentifierState {
  const value = stream.epgChannelId
  if (value === undefined || value === null) {
    return 'absent'
  }
  const trimmed = String(value).trim()
  if (trimmed.length === 0 || trimmed.toLowerCase() === 'null') {
    return 'blank'
  }
  return 'populated'
}

/**
 * True only for a `populated` identifier. Retained for callers that need the
 * strict "has a usable identifier" meaning (e.g. public-source keying). It is
 * NOT the request gate — use {@link epgIdentifierState} so an `absent`
 * (pre-capture) record is not mistaken for an authoritative negative.
 */
export function hasEpgIdentifier(stream: Pick<StreamItem, 'epgChannelId'>): boolean {
  return epgIdentifierState(stream) === 'populated'
}

/** True unless the identifier is a `blank` authoritative negative. */
export function epgRequestAllowed(stream: Pick<StreamItem, 'epgChannelId'>): boolean {
  return epgIdentifierState(stream) !== 'blank'
}

export function normalizedEpgIdentifier(
  stream: Pick<StreamItem, 'epgChannelId'>,
): string | null {
  if (!hasEpgIdentifier(stream)) {
    return null
  }

  return (stream.epgChannelId as string).trim()
}

/**
 * Durable per-profile+channel guide cache. Mirrors the repository's existing
 * `getEpg`/`putEpg`, injected so the service stays testable.
 */
export interface EpgDurableCache {
  getEpg<T extends NowNext | Program[]>(
    profileId: string,
    streamId: string,
    kind: LibraryEpgKind,
  ): Promise<T | null>
  putEpg<T extends NowNext | Program[]>(
    profileId: string,
    streamId: string,
    kind: LibraryEpgKind,
    value: T,
    ttlMs: number,
  ): Promise<void>
}

/** The provider broker surface the service relies on. */
export interface EpgProvider {
  nowNext(streamId: string, signal?: AbortSignal): Promise<NowNext>
  epg(streamId: string, limit?: number, signal?: AbortSignal): Promise<Program[]>
}

/** Public-source fallback keyed on the guide identifier (via the Worker). */
export interface EpgPublicSource {
  nowNext(identifier: string, signal?: AbortSignal): Promise<NowNext | null>
  schedule(identifier: string, limit: number, signal?: AbortSignal): Promise<Program[] | null>
}

export type EpgServiceConfig = {
  cache: EpgDurableCache
  nowNextTtlMs: number
  scheduleTtlMs: number
  publicSource?: EpgPublicSource
}

const CAPABILITY_TTL_MS = 24 * 60 * 60_000

export function capabilityIsFresh(
  record: EpgCapabilityRecord | undefined,
  now: number,
  ttlMs = CAPABILITY_TTL_MS,
): boolean {
  return Boolean(record) && record!.state !== 'unknown' && now - record!.checkedAt < ttlMs
}

export function capabilityState(record: EpgCapabilityRecord | undefined): EpgCapabilityState {
  return record?.state ?? 'unknown'
}

function nowNextHasData(value: NowNext | null | undefined): value is NowNext {
  return Boolean(value && (value.now || value.next))
}

/**
 * Resolves now/next for a single channel. Order: durable cache -> provider (if
 * the host is EPG-capable) -> public source (if the host is not capable but the
 * channel has an identifier). Returns null when nothing is available. Never
 * issues a request for a channel without an identifier.
 */
export async function resolveNowNext(
  config: EpgServiceConfig,
  profileId: string,
  stream: StreamItem,
  capability: EpgCapabilityState,
  provider: EpgProvider | null,
  signal?: AbortSignal,
): Promise<NowNextResult> {
  const idState = epgIdentifierState(stream)

  // Authoritative negative: the provider explicitly declared no mapping.
  // `absent` (pre-capture) is NOT negative and still allows a provider probe.
  if (idState === 'blank') {
    return null
  }

  const cached = await config.cache.getEpg<NowNext>(profileId, stream.id, 'now-next')
  if (nowNextHasData(cached)) {
    return { nowNext: cached, source: 'cache' }
  }

  // Provider EPG keys on stream id, so it works for `populated` and `absent`.
  if (capability !== 'unavailable' && provider) {
    try {
      const nowNext = await provider.nowNext(stream.id, signal)
      if (nowNextHasData(nowNext)) {
        await config.cache.putEpg(profileId, stream.id, 'now-next', nowNext, config.nowNextTtlMs)
        return { nowNext, source: 'provider' }
      }
    } catch (error) {
      if (isAbort(error)) {
        throw error
      }
      // fall through to public source
    }
  }

  // The public source is keyed on the identifier, so it needs a populated one.
  const identifier = normalizedEpgIdentifier(stream)
  if (capability === 'unavailable' && identifier && config.publicSource) {
    const nowNext = await config.publicSource.nowNext(identifier, signal)
    if (nowNextHasData(nowNext)) {
      await config.cache.putEpg(profileId, stream.id, 'now-next', nowNext, config.nowNextTtlMs)
      return { nowNext, source: 'public' }
    }
  }

  return null
}

/**
 * Resolves a full schedule for a single explicitly opened channel. Same source
 * order as now/next. `kind` distinguishes the plain schedule from the catch-up
 * projection so the two cache under separate keys.
 */
export async function resolveSchedule(
  config: EpgServiceConfig,
  profileId: string,
  stream: StreamItem,
  capability: EpgCapabilityState,
  provider: EpgProvider | null,
  options: { limit: number; kind: Extract<LibraryEpgKind, 'schedule' | 'catchup'> },
  signal?: AbortSignal,
): Promise<ScheduleResult> {
  const idState = epgIdentifierState(stream)

  // Authoritative negative only for a provider-declared blank mapping.
  if (idState === 'blank') {
    return null
  }

  const cached = await config.cache.getEpg<Program[]>(profileId, stream.id, options.kind)
  if (cached && cached.length) {
    return { programs: rehydratePrograms(cached), source: 'cache' }
  }

  // Provider schedule keys on stream id, so it works for `populated` and `absent`.
  if (capability !== 'unavailable' && provider) {
    try {
      const programs = await provider.epg(stream.id, options.limit, signal)
      if (programs.length) {
        await config.cache.putEpg(profileId, stream.id, options.kind, programs, config.scheduleTtlMs)
        return { programs, source: 'provider' }
      }
    } catch (error) {
      if (isAbort(error)) {
        throw error
      }
    }
  }

  const identifier = normalizedEpgIdentifier(stream)
  if (capability === 'unavailable' && identifier && config.publicSource) {
    const programs = await config.publicSource.schedule(identifier, options.limit, signal)
    if (programs && programs.length) {
      await config.cache.putEpg(profileId, stream.id, options.kind, programs, config.scheduleTtlMs)
      return { programs, source: 'public' }
    }
  }

  return null
}

/**
 * Programs restored from the durable cache have Date fields serialized to
 * strings by IndexedDB structured-clone only when they were stored as strings;
 * structured clone preserves Date, but public-source JSON does not. This
 * normalizes either representation back to Date objects.
 */
export function rehydratePrograms(programs: Program[]): Program[] {
  return programs.map((program) => ({
    ...program,
    start: program.start instanceof Date ? program.start : new Date(program.start as unknown as string),
    end: program.end instanceof Date ? program.end : new Date(program.end as unknown as string),
  }))
}

function isAbort(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') {
    return true
  }
  return (
    typeof error === 'object' &&
    error !== null &&
    'kind' in error &&
    (error as { kind?: unknown }).kind === 'cancelled'
  )
}
