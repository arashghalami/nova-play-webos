/*
 * Typed IPTV provider failures.
 *
 * The Xtream API reports everything through plain HTTP status codes, and the
 * client previously collapsed every non-OK response into
 * `new Error('The provider returned HTTP <status>.')`. Callers could only match
 * substrings, so a 403 was indistinguishable from a transient stall. The global
 * search fallback treated that rejection as "this provider dislikes
 * whole-library endpoints" and answered a single 403 with a category crawl of
 * up to 13 further requests per section, three sections in parallel. Being rate
 * limited therefore caused the app to send more traffic, which sustained the
 * ban.
 *
 * `retryable` answers exactly one question: is it useful to issue a DIFFERENT
 * request to this provider right now? Authentication rejections, rate limits
 * and user cancellations are not retryable. Timeouts, transport failures and
 * 5xx responses are.
 *
 * This module is deliberately free of DOM types so it stays unit-testable in
 * the default Node test environment. Response reading lives in the client.
 */

export type ProviderErrorKind =
  | 'rate-limited'
  | 'forbidden'
  | 'auth'
  | 'not-found'
  | 'server'
  | 'timeout'
  | 'cancelled'
  | 'network'
  | 'invalid-response'
  | 'too-large'
  | 'http'

/*
 * Sanitized, bounded evidence about a provider rejection. This is what makes a
 * 403 diagnosable: the status alone cannot distinguish per-minute throttling
 * from a blocked account from a WAF challenge, but the response body and a few
 * headers usually can.
 *
 * Nothing here may carry credentials. Provider URLs embed the username and
 * password as query parameters, and error pages produced by proxies frequently
 * echo the requested URL, so any captured body must be scrubbed.
 */
export interface ProviderFailureDiagnostics {
  status?: number
  retryAfterMs?: number
  server?: string
  proxied?: boolean
  bodySnippet?: string
}

export const REDACTED = '***'
export const MAX_BODY_SNIPPET_CHARS = 2048
const MAX_RETRY_AFTER_MS = 24 * 60 * 60 * 1000
const MIN_SCRUBBABLE_SECRET_LENGTH = 3

/*
 * Preserved verbatim: `validate()` already throws this exact sentence and other
 * code matches part of it. Changing the wording would silently break those
 * checks.
 */
export const AUTH_MESSAGE = 'The provider rejected that username or password.'
export const RATE_LIMIT_MESSAGE =
  'This provider is limiting how many requests we may send. Please wait a little before trying again.'
export const FORBIDDEN_MESSAGE =
  'This provider refused the request. The account may be rate limited or temporarily blocked.'

export class ProviderError extends Error {
  readonly isProviderError: true
  readonly kind: ProviderErrorKind
  readonly retryable: boolean
  readonly diagnostics: ProviderFailureDiagnostics

  constructor(
    kind: ProviderErrorKind,
    message: string,
    retryable: boolean,
    diagnostics: ProviderFailureDiagnostics = {},
  ) {
    super(message)
    this.name = 'ProviderError'
    this.isProviderError = true
    this.kind = kind
    this.retryable = retryable
    this.diagnostics = diagnostics
  }
}

/*
 * Marker-based rather than `instanceof` so the guard keeps working across
 * bundle boundaries and after class transpilation.
 */
export function isProviderError(value: unknown): value is ProviderError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { isProviderError?: unknown }).isProviderError === true
  )
}

export function classifyHttpStatus(status: number): {
  kind: ProviderErrorKind
  retryable: boolean
} {
  if (status === 401) {
    return { kind: 'auth', retryable: false }
  }

  if (status === 403) {
    return { kind: 'forbidden', retryable: false }
  }

  if (status === 429) {
    return { kind: 'rate-limited', retryable: false }
  }

  if (status === 404) {
    return { kind: 'not-found', retryable: false }
  }

  if (status === 408) {
    return { kind: 'timeout', retryable: true }
  }

  if (status >= 500) {
    return { kind: 'server', retryable: true }
  }

  // Any other 4xx is treated as a refusal rather than a stall. Retrying a
  // different endpoint after an unexplained client error is what produced the
  // amplification this module exists to prevent.
  return { kind: 'http', retryable: false }
}

export function httpFailureMessage(status: number, kind: ProviderErrorKind): string {
  if (kind === 'rate-limited') {
    return RATE_LIMIT_MESSAGE
  }

  if (kind === 'forbidden') {
    return FORBIDDEN_MESSAGE
  }

  if (kind === 'auth') {
    return AUTH_MESSAGE
  }

  return `The provider returned HTTP ${status}.`
}

/*
 * Accepts both `Retry-After` forms: delta-seconds and an HTTP date. Clamped so
 * a hostile or skewed value cannot park the app for days, and floored at zero
 * so an already-elapsed date means "retry now" rather than a negative delay.
 */
export function parseRetryAfterMs(
  value: string | null | undefined,
  now: number,
): number | undefined {
  if (!value) {
    return undefined
  }

  const trimmed = value.trim()

  if (!trimmed) {
    return undefined
  }

  if (/^\d+$/.test(trimmed)) {
    return clampDelay(Number(trimmed) * 1000)
  }

  const at = Date.parse(trimmed)

  if (Number.isNaN(at)) {
    return undefined
  }

  return clampDelay(at - now)
}

function clampDelay(value: number): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined
  }

  return Math.max(0, Math.min(value, MAX_RETRY_AFTER_MS))
}

/*
 * Removes credential values from text captured out of a provider response.
 * Very short secrets are skipped: replacing a one- or two-character password
 * would redact unrelated text and destroy the diagnostic value of the snippet.
 */
export function scrubSecrets(
  text: string,
  secrets: ReadonlyArray<string | undefined>,
): string {
  let result = text

  for (const secret of secrets) {
    if (!secret || secret.length < MIN_SCRUBBABLE_SECRET_LENGTH) {
      continue
    }

    for (const variant of secretVariants(secret)) {
      result = result.split(variant).join(REDACTED)
    }
  }

  return result
}

function secretVariants(secret: string): string[] {
  const variants = [secret]

  let encoded: string

  try {
    encoded = encodeURIComponent(secret)
  } catch {
    return variants
  }

  if (encoded !== secret) {
    variants.push(encoded)
  }

  return variants
}

/*
 * Collapses whitespace and truncates, so an HTML error page becomes a short
 * single-line fingerprint rather than kilobytes of markup.
 */
export function buildBodySnippet(
  text: string,
  secrets: ReadonlyArray<string | undefined>,
): string | undefined {
  const collapsed = scrubSecrets(text, secrets).replace(/\s+/g, ' ').trim()

  if (!collapsed) {
    return undefined
  }

  return collapsed.length > MAX_BODY_SNIPPET_CHARS
    ? `${collapsed.slice(0, MAX_BODY_SNIPPET_CHARS)}…`
    : collapsed
}

/*
 * The gate every fallback path should consult before issuing additional
 * requests after a failure.
 *
 * Unclassified reasons default to retryable so an unexpected internal error
 * shape does not silently disable a legitimate fallback. Every throw site in
 * the client produces a `ProviderError`, so reaching the default indicates a
 * bug rather than a provider condition.
 */
export function isRetryableProviderFailure(reason: unknown): boolean {
  if (isProviderError(reason)) {
    return reason.retryable
  }

  return true
}

/*
 * True when the provider is actively refusing traffic, as opposed to being slow
 * or unreachable. These are the cases where sending more requests makes the
 * situation worse.
 */
export function isProviderRefusal(reason: unknown): boolean {
  if (!isProviderError(reason)) {
    return false
  }

  return (
    reason.kind === 'rate-limited' ||
    reason.kind === 'forbidden' ||
    reason.kind === 'auth'
  )
}
