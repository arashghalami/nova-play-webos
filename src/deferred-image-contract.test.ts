import { describe, expect, it } from 'vitest'

/*
 * Fail-closed static guard for the two-tier deferred-image chain.
 *
 * A half-finished attribute rename (templates emit data-deferred-pending-src,
 * but no promoter ever moves it to data-deferred-src) blanked every image while
 * each piece was individually well-formed. The behavioral proof lives in
 * deferred-image-chain.test.ts; this guard additionally pins the source-level
 * wiring so the chain cannot be silently severed again, and so a "fix" that
 * removes the cap trips a test.
 *
 * Convention: pure static scan via import.meta.glob ?raw, anchored to the
 * specific tokens (not bare regexes), like the stall-indicator and provider
 * boundary guards.
 */

const runtimeSources = import.meta.glob('./**/*.ts', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const mainSource = runtimeSources['./main.ts'] ?? ''

describe('deferred-image chain contract', () => {
  it('templates emit the inert pending attribute, never armed src directly', () => {
    // Poster and episode artwork must emit the pending attribute. Other inert
    // attributes (e.g. data-shape) may sit between the class and the pending
    // attribute, so allow any non-`>` run in between rather than only whitespace.
    expect(mainSource).toMatch(/class="poster"[^>]*\s\$\{DEFERRED_PENDING_SRC_ATTR\}=/)
    expect(mainSource).toMatch(/class="episode-image"[^>]*\s\$\{DEFERRED_PENDING_SRC_ATTR\}=/)

    // ...and no template literal may hand-write an armed data-deferred-src (only
    // the promoter, via image.dataset.deferredSrc, is allowed to arm). A literal
    // `data-deferred-src="` in a template string is the pre-cap bug.
    expect(mainSource).not.toMatch(/data-deferred-src="/)
  })

  it('has a single promoter that moves pending → armed under the cap', () => {
    expect(mainSource).toMatch(/function promoteDeferredImages\(\)/)
    expect(mainSource).toMatch(/planDeferredImagePromotion\(/)
    // The promoter arms by writing dataset.deferredSrc and clearing the pending
    // attribute — the actual pending→armed move.
    expect(mainSource).toMatch(/\.dataset\.deferredSrc\s*=\s*source/)
    expect(mainSource).toMatch(/removeAttribute\(DEFERRED_PENDING_SRC_ATTR\)/)
  })

  it('drives the promoter from the scheduler (no separate timer)', () => {
    // promoteDeferredImages must be invoked inside the scheduler so it inherits
    // every existing admission trigger and refills freed slots.
    const scheduler = mainSource.slice(
      mainSource.indexOf('function scheduleDeferredImageLoads'),
    )
    expect(scheduler).toMatch(/promoteDeferredImages\(\)/)
  })

  it('enforces the armed cap through the platform-specific helper', () => {
    // The cap must be applied; removing it to "fix" a blank-image report should
    // break this test.
    expect(mainSource).toMatch(/function armedDeferredImageCap\(\)/)
    expect(mainSource).toMatch(/WEBOS_ARMED_DEFERRED_IMAGE_CAP/)
    expect(mainSource).toMatch(/ARMED_DEFERRED_IMAGE_CAP/)
    // The planner must be called with the cap helper (no dotall flag: keep the
    // scan ES2015-compatible like the bundle). [\s\S] spans newlines instead.
    expect(mainSource).toMatch(/planDeferredImagePromotion\([\s\S]*?armedDeferredImageCap\(\)/)
  })

  it('keeps the geometry observer scoped to armed containers only', () => {
    // Observing pending containers too would put every card back under the
    // observer and reintroduce the regression the cap exists to fix.
    const register = mainSource.slice(
      mainSource.indexOf('function registerDeferredImageAdmissionTargets'),
      mainSource.indexOf('function scheduleDeferredImageLoads'),
    )
    expect(register).toMatch(/img\[data-deferred-src\]/)
    expect(register).not.toMatch(/DEFERRED_PENDING_SRC_ATTR/)
  })
})
