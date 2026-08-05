export const LIBRARY_STORAGE_FALLBACK_CEILING_BYTES = 384 * 1024 * 1024
export const LIBRARY_STORAGE_MIN_HEADROOM_BYTES = 32 * 1024 * 1024
export const LIBRARY_STORAGE_HEADROOM_RATIO = 0.1

export type LibraryStorageEstimate = {
  source: 'navigator' | 'fallback'
  usageBytes: number
  quotaBytes: number
}

export type LibraryStorageHeadroom = LibraryStorageEstimate & {
  requiredHeadroomBytes: number
  availableBytes: number
  usableCeilingBytes: number
  allowed: boolean
}

/**
 * Uses the browser quota when webOS exposes it. Older webOS releases often do
 * not; callers then provide a conservative, repository-derived usage estimate
 * against the bounded fallback ceiling.
 */
export async function measureLibraryStorage(
  fallbackUsageBytes: number,
  fallbackCeilingBytes = LIBRARY_STORAGE_FALLBACK_CEILING_BYTES,
): Promise<LibraryStorageEstimate> {
  const safeFallbackUsage = nonNegativeInteger(fallbackUsageBytes)
  const safeFallbackCeiling = positiveInteger(
    fallbackCeilingBytes,
    LIBRARY_STORAGE_FALLBACK_CEILING_BYTES,
  )
  const manager =
    typeof navigator !== 'undefined' && 'storage' in navigator ? navigator.storage : undefined

  if (manager && typeof manager.estimate === 'function') {
    try {
      const estimate = await manager.estimate()
      const quotaBytes = finiteNonNegativeInteger(estimate.quota)
      const usageBytes = finiteNonNegativeInteger(estimate.usage)

      if (quotaBytes !== null && quotaBytes > 0 && usageBytes !== null) {
        return {
          source: 'navigator',
          usageBytes,
          quotaBytes,
        }
      }
    } catch {
      // The fallback is deliberately local-only and does not create provider traffic.
    }
  }

  return {
    source: 'fallback',
    usageBytes: safeFallbackUsage,
    quotaBytes: safeFallbackCeiling,
  }
}

/**
 * Reserves both a fixed write buffer and a percentage of the available quota.
 * The usable ceiling is enforced before any catalog provider request begins.
 */
export function assessLibraryStorageHeadroom(
  estimate: LibraryStorageEstimate,
  minimumHeadroomBytes = LIBRARY_STORAGE_MIN_HEADROOM_BYTES,
): LibraryStorageHeadroom {
  const quotaBytes = positiveInteger(estimate.quotaBytes, LIBRARY_STORAGE_FALLBACK_CEILING_BYTES)
  const usageBytes = nonNegativeInteger(estimate.usageBytes)
  const requiredHeadroomBytes = Math.max(
    nonNegativeInteger(minimumHeadroomBytes),
    Math.floor(quotaBytes * LIBRARY_STORAGE_HEADROOM_RATIO),
  )
  const availableBytes = Math.max(0, quotaBytes - usageBytes)
  const usableCeilingBytes = Math.max(0, quotaBytes - requiredHeadroomBytes)

  return {
    source: estimate.source,
    usageBytes,
    quotaBytes,
    requiredHeadroomBytes,
    availableBytes,
    usableCeilingBytes,
    allowed: usageBytes <= usableCeilingBytes,
  }
}

function finiteNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null
}

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}