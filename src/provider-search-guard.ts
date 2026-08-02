import {
  isProviderError,
  isProviderRefusal,
  type ProviderErrorKind,
} from './provider-error'

export type ProviderAccessBlock = {
  kind: ProviderErrorKind
  until: number | null
}

export const DEFAULT_PROVIDER_COOLDOWN_MS = 5 * 60_000

/**
 * Stops all provider traffic after a refusal. Authentication refusals remain
 * blocked until the profile changes; other refusals use Retry-After when it is
 * available, otherwise a conservative local cooldown.
 */
export function providerBlockForFailure(
  reason: unknown,
  now = Date.now(),
): ProviderAccessBlock | null {
  if (!isProviderRefusal(reason) || !isProviderError(reason)) {
    return null
  }

  if (reason.kind === 'auth') {
    return { kind: reason.kind, until: null }
  }

  const retryAfterMs = reason.diagnostics.retryAfterMs
  const delayMs =
    retryAfterMs !== undefined
      ? Math.max(DEFAULT_PROVIDER_COOLDOWN_MS, retryAfterMs)
      : DEFAULT_PROVIDER_COOLDOWN_MS

  return {
    kind: reason.kind,
    until: now + delayMs,
  }
}

export function isProviderBlocked(
  block: ProviderAccessBlock | null,
  now = Date.now(),
): boolean {
  return block !== null && (block.until === null || block.until > now)
}

export function providerBlockMessage(
  block: ProviderAccessBlock | null,
  now = Date.now(),
): string | null {
  if (!isProviderBlocked(block, now) || !block) {
    return null
  }

  if (block.kind === 'auth') {
    return 'Provider access is paused until you update this account.'
  }

  const remainingMinutes = Math.max(1, Math.ceil(((block.until ?? now) - now) / 60_000))

  return `Provider access is paused for about ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'} after a refusal.`
}