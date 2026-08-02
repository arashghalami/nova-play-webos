import { describe, expect, it } from 'vitest'
import { ProviderError } from './provider-error'
import {
  DEFAULT_PROVIDER_COOLDOWN_MS,
  isProviderBlocked,
  providerBlockForFailure,
  providerBlockMessage,
} from './provider-search-guard'

describe('provider access guard', () => {
  it('does not block transient failures', () => {
    const failure = new ProviderError('timeout', 'Slow provider', true)

    expect(providerBlockForFailure(failure, 10_000)).toBeNull()
  })

  it('uses a conservative cooldown for a provider refusal without Retry-After', () => {
    const now = 10_000
    const block = providerBlockForFailure(
      new ProviderError('forbidden', 'Blocked', false),
      now,
    )

    expect(block).toEqual({
      kind: 'forbidden',
      until: now + DEFAULT_PROVIDER_COOLDOWN_MS,
    })
    expect(isProviderBlocked(block, now)).toBe(true)
    expect(isProviderBlocked(block, block!.until!)).toBe(false)
  })

  it('honors a longer Retry-After response', () => {
    const now = 10_000
    const block = providerBlockForFailure(
      new ProviderError('rate-limited', 'Slow down', false, {
        retryAfterMs: 12 * 60_000,
      }),
      now,
    )

    expect(block).toEqual({
      kind: 'rate-limited',
      until: now + 12 * 60_000,
    })
    expect(providerBlockMessage(block, now)).toContain('12 minutes')
  })

  it('keeps authentication refusals blocked until the profile changes', () => {
    const block = providerBlockForFailure(
      new ProviderError('auth', 'Rejected credentials', false),
      10_000,
    )

    expect(block).toEqual({ kind: 'auth', until: null })
    expect(isProviderBlocked(block, 99_999_999)).toBe(true)
    expect(providerBlockMessage(block, 99_999_999)).toContain('update this account')
  })
})