import { describe, expect, it } from 'vitest'
import { ProviderError } from './provider-error'
import {
  DEFAULT_PROVIDER_SEARCH_COOLDOWN_MS,
  isProviderSearchBlocked,
  providerSearchBlockForFailure,
  providerSearchBlockMessage,
} from './provider-search-guard'

describe('provider search guard', () => {
  it('does not block transient failures', () => {
    const failure = new ProviderError('timeout', 'Slow provider', true)

    expect(providerSearchBlockForFailure(failure, 10_000)).toBeNull()
  })

  it('uses a conservative cooldown for a provider refusal without Retry-After', () => {
    const now = 10_000
    const block = providerSearchBlockForFailure(
      new ProviderError('forbidden', 'Blocked', false),
      now,
    )

    expect(block).toEqual({
      kind: 'forbidden',
      until: now + DEFAULT_PROVIDER_SEARCH_COOLDOWN_MS,
    })
    expect(isProviderSearchBlocked(block, now)).toBe(true)
    expect(isProviderSearchBlocked(block, block!.until!)).toBe(false)
  })

  it('honors a longer Retry-After response', () => {
    const now = 10_000
    const block = providerSearchBlockForFailure(
      new ProviderError('rate-limited', 'Slow down', false, {
        retryAfterMs: 12 * 60_000,
      }),
      now,
    )

    expect(block).toEqual({
      kind: 'rate-limited',
      until: now + 12 * 60_000,
    })
    expect(providerSearchBlockMessage(block, now)).toContain('12 minutes')
  })

  it('keeps authentication refusals blocked until the profile changes', () => {
    const block = providerSearchBlockForFailure(
      new ProviderError('auth', 'Rejected credentials', false),
      10_000,
    )

    expect(block).toEqual({ kind: 'auth', until: null })
    expect(isProviderSearchBlocked(block, 99_999_999)).toBe(true)
    expect(providerSearchBlockMessage(block, 99_999_999)).toContain('update this account')
  })
})