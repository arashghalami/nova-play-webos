import {
  isProviderError,
  isProviderRefusal,
  type ProviderErrorKind,
} from './provider-error'

export type ProviderSearchBlock = {
  kind: ProviderErrorKind
  until: number | null
}

export const DEFAULT_PROVIDER_SEARCH_COOLDOWN_MS = 5 * 60_000

/**
 * Global search must stop issuing requests as soon as a provider refuses one.
 * A profile-authentication refusal remains blocked until the profile changes;
 * other refusals use Retry-After when the provider supplies one, otherwise a
 * conservative local cooldown.
 */
export function providerSearchBlockForFailure(
  reason: unknown,
  now = Date.now(),
): ProviderSearchBlock | null {
  if (!isProviderRefusal(reason) || !isProviderError(reason)) {
    return null
  }

  if (reason.kind === 'auth') {
    return { kind: reason.kind, until: null }
  }

  const retryAfterMs = reason.diagnostics.retryAfterMs
  const delayMs =
    retryAfterMs !== undefined
      ? Math.max(DEFAULT_PROVIDER_SEARCH_COOLDOWN_MS, retryAfterMs)
      : DEFAULT_PROVIDER_SEARCH_COOLDOWN_MS

  return {
    kind: reason.kind,
    until: now + delayMs,
  }
}

export function isProviderSearchBlocked(
  block: ProviderSearchBlock | null,
  now = Date.now(),
): boolean {
  return block !== null && (block.until === null || block.until > now)
}

export function providerSearchBlockMessage(
  block: ProviderSearchBlock | null,
  now = Date.now(),
): string | null {
  if (!isProviderSearchBlocked(block, now) || !block) {
    return null
  }

  if (block.kind === 'auth') {
    return 'Provider search is paused until you update this account.'
  }

  const remainingMinutes = Math.max(1, Math.ceil(((block.until ?? now) - now) / 60_000))

  return `Provider search is paused for about ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'} after a refusal.`
}