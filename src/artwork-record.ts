/*
 * Persistence for resolved catalog artwork (Part B).
 *
 * A separate module, mirroring delivery-record.ts (and loadResume/saveResume):
 * profile-scoped localStorage, hydrated to an in-memory Map at profile load,
 * capped by recency, reusing only the shared readJson/writeJson primitives from
 * storage.ts so the localStorage-shape logic stays in one place.
 *
 * Each record is keyed by streamLookupKey and holds either:
 *  - a resolved poster URL (positive), or
 *  - null (NEGATIVE cache: TMDB had no usable match).
 * The negative marker is mandatory — without it every scroll past an unmatchable
 * title re-queries TMDB forever. Both share one 30-day TTL, so a title TMDB
 * gains art for later is retried after the window rather than never.
 *
 * The cap is load-bearing: the Live section alone holds 53,560 items, so a Map
 * keyed by stream must never grow unbounded.
 *
 * ES2015-compatible for the webOS bundle.
 */
import { readJson, writeJson } from './storage'

export const MAX_ARTWORK_RECORDS = 500
export const ARTWORK_RECORD_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days (positive and negative)

export type ArtworkRecord = {
  /** streamLookupKey(stream). */
  streamKey: string
  /** Resolved poster URL, or null for a negative (no-match) marker. */
  poster: string | null
  /** ms; recency for the cap and the 30-day expiry. */
  updatedAt: number
}

function artworkKey(profileId: string): string {
  return `nova-play.artwork.${profileId}`
}

function isFresh(record: ArtworkRecord, now: number): boolean {
  return now - record.updatedAt < ARTWORK_RECORD_TTL_MS
}

function toRecord(entry: unknown): ArtworkRecord | null {
  if (typeof entry !== 'object' || entry === null) {
    return null
  }

  const candidate = entry as Partial<ArtworkRecord>

  if (
    typeof candidate.streamKey !== 'string' ||
    typeof candidate.updatedAt !== 'number' ||
    !Number.isFinite(candidate.updatedAt)
  ) {
    return null
  }

  // poster is either a non-empty string (positive) or null (negative). Anything
  // else is malformed.
  const poster =
    typeof candidate.poster === 'string' && candidate.poster.length > 0
      ? candidate.poster
      : candidate.poster === null
        ? null
        : undefined

  if (poster === undefined) {
    return null
  }

  return {
    streamKey: candidate.streamKey,
    poster,
    updatedAt: candidate.updatedAt,
  }
}

/**
 * Hydrate the profile's artwork records into a Map keyed by streamKey. Expired
 * records (older than the TTL) are dropped on read so a stale negative marker
 * eventually lapses and the title is retried. `now` is injectable for testing.
 */
export function loadArtworkRecords(
  profileId: string,
  now: number = Date.now(),
): Map<string, ArtworkRecord> {
  const saved = readJson<unknown>(artworkKey(profileId), [])
  const records = new Map<string, ArtworkRecord>()

  if (!Array.isArray(saved)) {
    return records
  }

  saved.forEach((entry) => {
    const record = toRecord(entry)

    if (record && isFresh(record, now)) {
      records.set(record.streamKey, record)
    }
  })

  return records
}

/**
 * Persist the artwork records, dropping expired ones and capping to the most
 * recent MAX_ARTWORK_RECORDS by updatedAt (oldest evicted from both the stored
 * array and the in-memory Map, mirroring saveResume/saveDeliveryRecords). `now`
 * is injectable for testing.
 */
export function saveArtworkRecords(
  profileId: string,
  records: Map<string, ArtworkRecord>,
  now: number = Date.now(),
): boolean {
  const fresh = [...records.values()].filter((record) => isFresh(record, now))
  const retained = fresh
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_ARTWORK_RECORDS)

  const retainedKeys = new Set(retained.map((record) => record.streamKey))

  for (const key of [...records.keys()]) {
    if (!retainedKeys.has(key)) {
      records.delete(key)
    }
  }

  return writeJson(
    artworkKey(profileId),
    retained.map((record) => ({
      streamKey: record.streamKey,
      poster: record.poster,
      updatedAt: record.updatedAt,
    })),
  )
}
