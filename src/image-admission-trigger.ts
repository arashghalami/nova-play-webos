/*
 * An additional trigger for deferred-image admission.
 *
 * The admission scheduler in main.ts is driven by four triggers: the end of
 * bindEvents(), the window `scroll` listener, the window `resize` listener, and
 * its own per-image settle continuation. Every one of those depends on either a
 * re-render or the WINDOW scrolling. None of them fires when content moves
 * inside a scrolling container or under a transform, because the settle
 * continuation stops as soon as a pass admits nothing.
 *
 * That is survivable today only because the nearby predicate tests the vertical
 * axis alone, so horizontally-offscreen artwork still counts as nearby and the
 * settle chain drains it. The moment that predicate learns about the horizontal
 * axis, artwork revealed by a container scroll would become permanently
 * unloadable. This module is the trigger that has to exist first.
 *
 * It is deliberately generic over the target type and takes its observer from a
 * factory. That keeps the lifecycle - which is the part with a leak history,
 * because the app replaces its whole shell via innerHTML and an
 * IntersectionObserver holds its targets strongly - testable in this repo's
 * node-only test environment, without pretending to emulate Chromium's
 * intersection geometry. Real geometry is verified on the device.
 */

export type ObserverLike<T> = {
  observe(target: T): void
  disconnect(): void
}

export type AdmissionTriggerOptions<T> = {
  /**
   * Builds the observer, or returns null when the runtime cannot provide one.
   * `onIntersect` carries no entries on purpose: this trigger only says "the
   * view moved, look again", and the scheduler remains the single place that
   * decides which images are admissible.
   */
  createObserver: (onIntersect: () => void) => ObserverLike<T> | null
  requestAdmission: () => void
}

export type AdmissionTrigger<T> = {
  /**
   * Replaces the observed set. Callers pass the targets that currently exist, so
   * a re-registration after a shell replacement both picks up the new nodes and
   * releases the old ones.
   */
  register(targets: Iterable<T>): void
  teardown(): void
  observedCount(): number
}

export function createAdmissionTrigger<T>(
  options: AdmissionTriggerOptions<T>,
): AdmissionTrigger<T> {
  let observer: ObserverLike<T> | null = null
  let unavailable = false
  let observedCount = 0
  let active = true

  /*
   * Built on first registration rather than up front, so a view with no deferred
   * artwork - the player, settings, the login screen - creates no observer at
   * all. On Chromium 79 an observer's geometry is recomputed synchronously in
   * the post-layout lifecycle for every target it holds, so an idle observer is
   * not free.
   */
  const ensureObserver = (): ObserverLike<T> | null => {
    if (observer || unavailable) {
      return observer
    }

    const created = options.createObserver(() => {
      if (!active) {
        return
      }

      options.requestAdmission()
    })

    if (!created) {
      unavailable = true
      return null
    }

    observer = created
    return observer
  }

  return {
    register(targets) {
      const unique = new Set<T>()

      for (const target of targets) {
        unique.add(target)
      }

      // Nothing to observe and nothing observed: do not build an observer just
      // to hold an empty set.
      if (!unique.size && !observer) {
        observedCount = 0
        return
      }

      const current = ensureObserver()

      if (!current) {
        observedCount = 0
        return
      }

      active = true
      /*
       * Disconnect before re-observing. `unobserve` per target would need the
       * previous list kept alive, which is exactly the reference the shell
       * replacement is trying to drop.
       */
      current.disconnect()
      observedCount = unique.size

      for (const target of unique) {
        current.observe(target)
      }
    },

    teardown() {
      active = false
      observedCount = 0

      if (observer) {
        observer.disconnect()
      }
    },

    observedCount: () => observedCount,
  }
}
