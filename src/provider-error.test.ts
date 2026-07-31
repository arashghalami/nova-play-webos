import { describe, expect, it } from 'vitest'
import {
  AUTH_MESSAGE,
  FORBIDDEN_MESSAGE,
  MAX_BODY_SNIPPET_CHARS,
  ProviderError,
  RATE_LIMIT_MESSAGE,
  REDACTED,
  buildBodySnippet,
  classifyHttpStatus,
  httpFailureMessage,
  isProviderError,
  isProviderRefusal,
  isRetryableProviderFailure,
  parseRetryAfterMs,
  scrubSecrets,
} from './provider-error'

describe('classifyHttpStatus', () => {
  it('treats refusals as non-retryable so a rejection cannot trigger more requests', () => {
    expect(classifyHttpStatus(401)).toEqual({ kind: 'auth', retryable: false })
    expect(classifyHttpStatus(403)).toEqual({ kind: 'forbidden', retryable: false })
    expect(classifyHttpStatus(429)).toEqual({ kind: 'rate-limited', retryable: false })
    expect(classifyHttpStatus(404)).toEqual({ kind: 'not-found', retryable: false })
  })

  it('treats stalls and server faults as retryable', () => {
    expect(classifyHttpStatus(408)).toEqual({ kind: 'timeout', retryable: true })
    expect(classifyHttpStatus(500)).toEqual({ kind: 'server', retryable: true })
    expect(classifyHttpStatus(502)).toEqual({ kind: 'server', retryable: true })
    expect(classifyHttpStatus(503)).toEqual({ kind: 'server', retryable: true })
  })

  it('defaults any other client error to a non-retryable refusal', () => {
    expect(classifyHttpStatus(400)).toEqual({ kind: 'http', retryable: false })
    expect(classifyHttpStatus(418)).toEqual({ kind: 'http', retryable: false })
  })
})

describe('httpFailureMessage', () => {
  it('explains refusals in user-facing terms', () => {
    expect(httpFailureMessage(429, 'rate-limited')).toBe(RATE_LIMIT_MESSAGE)
    expect(httpFailureMessage(403, 'forbidden')).toBe(FORBIDDEN_MESSAGE)
    expect(httpFailureMessage(401, 'auth')).toBe(AUTH_MESSAGE)
  })

  it('preserves the previous wording for every other status', () => {
    expect(httpFailureMessage(502, 'server')).toBe('The provider returned HTTP 502.')
    expect(httpFailureMessage(400, 'http')).toBe('The provider returned HTTP 400.')
  })

  it('keeps the substring existing callers match on for auth rejections', () => {
    expect(AUTH_MESSAGE).toContain('rejected that username or password')
  })
})

describe('parseRetryAfterMs', () => {
  const now = 1_700_000_000_000

  it('reads delta-seconds', () => {
    expect(parseRetryAfterMs('120', now)).toBe(120_000)
    expect(parseRetryAfterMs('  30  ', now)).toBe(30_000)
    expect(parseRetryAfterMs('0', now)).toBe(0)
  })

  it('reads an HTTP date relative to the supplied clock', () => {
    expect(parseRetryAfterMs(new Date(now + 5_000).toUTCString(), now)).toBe(5_000)
  })

  it('floors an already-elapsed date at zero rather than returning a negative delay', () => {
    expect(parseRetryAfterMs(new Date(now - 60_000).toUTCString(), now)).toBe(0)
  })

  it('clamps a hostile or skewed value to one day', () => {
    expect(parseRetryAfterMs('99999999', now)).toBe(24 * 60 * 60 * 1000)
  })

  it('ignores missing and unparsable values', () => {
    expect(parseRetryAfterMs(null, now)).toBeUndefined()
    expect(parseRetryAfterMs(undefined, now)).toBeUndefined()
    expect(parseRetryAfterMs('', now)).toBeUndefined()
    expect(parseRetryAfterMs('   ', now)).toBeUndefined()
    expect(parseRetryAfterMs('soon', now)).toBeUndefined()
  })
})

describe('scrubSecrets', () => {
  it('removes raw credential values', () => {
    expect(scrubSecrets('denied for user=alice pass=s3cret!', ['alice', 's3cret!'])).toBe(
      `denied for user=${REDACTED} pass=${REDACTED}`,
    )
  })

  it('removes percent-encoded credential values as proxies echo them', () => {
    expect(scrubSecrets('?username=a%40b.com', ['a@b.com'])).toBe(
      `?username=${REDACTED}`,
    )
  })

  it('skips very short secrets that would redact unrelated text', () => {
    expect(scrubSecrets('an ordinary sentence', ['a', 'an'])).toBe('an ordinary sentence')
  })

  it('ignores missing secrets', () => {
    expect(scrubSecrets('untouched', [undefined, ''])).toBe('untouched')
  })

  it('replaces every occurrence, not just the first', () => {
    expect(scrubSecrets('token token', ['token'])).toBe(`${REDACTED} ${REDACTED}`)
  })
})

describe('buildBodySnippet', () => {
  it('collapses whitespace into a single-line fingerprint', () => {
    expect(buildBodySnippet('<html>\n  <body>  403 </body>\n</html>', [])).toBe(
      '<html> <body> 403 </body> </html>',
    )
  })

  it('scrubs credentials before returning anything', () => {
    expect(buildBodySnippet('blocked: password=hunter2', ['hunter2'])).toBe(
      `blocked: password=${REDACTED}`,
    )
  })

  it('truncates an oversized page', () => {
    const snippet = buildBodySnippet('x'.repeat(MAX_BODY_SNIPPET_CHARS + 500), [])

    expect(snippet).toHaveLength(MAX_BODY_SNIPPET_CHARS + 1)
    expect(snippet?.endsWith('…')).toBe(true)
  })

  it('returns nothing for an empty or whitespace-only body', () => {
    expect(buildBodySnippet('', [])).toBeUndefined()
    expect(buildBodySnippet('   \n  ', [])).toBeUndefined()
  })
})

describe('ProviderError', () => {
  it('is a real Error carrying its classification and diagnostics', () => {
    const error = new ProviderError('rate-limited', RATE_LIMIT_MESSAGE, false, {
      status: 429,
      retryAfterMs: 30_000,
    })

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ProviderError')
    expect(error.message).toBe(RATE_LIMIT_MESSAGE)
    expect(error.kind).toBe('rate-limited')
    expect(error.retryable).toBe(false)
    expect(error.diagnostics.status).toBe(429)
    expect(error.diagnostics.retryAfterMs).toBe(30_000)
  })

  it('defaults to empty diagnostics', () => {
    expect(new ProviderError('network', 'offline', true).diagnostics).toEqual({})
  })
})

describe('isProviderError', () => {
  it('recognises provider errors by marker rather than prototype identity', () => {
    expect(isProviderError(new ProviderError('timeout', 'slow', true))).toBe(true)
    expect(isProviderError({ isProviderError: true })).toBe(true)
  })

  it('rejects everything else', () => {
    expect(isProviderError(new Error('plain'))).toBe(false)
    expect(isProviderError(null)).toBe(false)
    expect(isProviderError(undefined)).toBe(false)
    expect(isProviderError('403')).toBe(false)
    expect(isProviderError({})).toBe(false)
  })
})

describe('isRetryableProviderFailure', () => {
  it('blocks follow-up requests after a refusal', () => {
    expect(isRetryableProviderFailure(new ProviderError('forbidden', FORBIDDEN_MESSAGE, false))).toBe(
      false,
    )
    expect(
      isRetryableProviderFailure(new ProviderError('rate-limited', RATE_LIMIT_MESSAGE, false)),
    ).toBe(false)
    expect(isRetryableProviderFailure(new ProviderError('auth', AUTH_MESSAGE, false))).toBe(false)
  })

  it('blocks follow-up requests after a cancellation', () => {
    expect(isRetryableProviderFailure(new ProviderError('cancelled', 'cancelled', false))).toBe(
      false,
    )
  })

  it('allows follow-up requests after a stall or transport failure', () => {
    expect(isRetryableProviderFailure(new ProviderError('timeout', 'slow', true))).toBe(true)
    expect(isRetryableProviderFailure(new ProviderError('network', 'offline', true))).toBe(true)
  })

  it('allows follow-up requests for unclassified reasons so legitimate fallbacks survive', () => {
    expect(isRetryableProviderFailure(new Error('unexpected'))).toBe(true)
    expect(isRetryableProviderFailure(undefined)).toBe(true)
  })
})

describe('isProviderRefusal', () => {
  it('is true only when the provider is actively refusing traffic', () => {
    expect(isProviderRefusal(new ProviderError('forbidden', FORBIDDEN_MESSAGE, false))).toBe(true)
    expect(isProviderRefusal(new ProviderError('rate-limited', RATE_LIMIT_MESSAGE, false))).toBe(
      true,
    )
    expect(isProviderRefusal(new ProviderError('auth', AUTH_MESSAGE, false))).toBe(true)
  })

  it('is false for stalls, cancellations and unclassified reasons', () => {
    expect(isProviderRefusal(new ProviderError('timeout', 'slow', true))).toBe(false)
    expect(isProviderRefusal(new ProviderError('cancelled', 'cancelled', false))).toBe(false)
    expect(isProviderRefusal(new Error('plain'))).toBe(false)
  })
})
