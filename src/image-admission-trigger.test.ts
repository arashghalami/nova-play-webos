import { describe, expect, it } from 'vitest'
import { createAdmissionTrigger, type ObserverLike } from './image-admission-trigger'

/*
 * These tests cover the observer LIFECYCLE, which is this module's own logic and
 * the part with a history of leaking: the app replaces its entire shell via
 * innerHTML on every view change, and an IntersectionObserver holds strong
 * references to its targets, so a registration that does not release the old
 * ones retains a detached DOM tree per navigation.
 *
 * They deliberately do not attempt to emulate Chromium's intersection geometry.
 * This repo has no DOM test environment on purpose - all 339 other tests are
 * pure logic under `environment: 'node'` - and the browser's own behaviour is
 * verified on the device instead. What is faked here is only the observer
 * interface this module calls; every assertion is about a decision the module
 * makes.
 */

type Target = { id: string }

function harness(available = true) {
  const observers: Array<{
    observed: Target[]
    disconnected: boolean
    fire: () => void
  }> = []

  const admissions: number[] = []

  const trigger = createAdmissionTrigger<Target>({
    createObserver: (onIntersect) => {
      if (!available) {
        return null
      }

      const record = {
        observed: [] as Target[],
        disconnected: false,
        fire: () => onIntersect(),
      }

      const observer: ObserverLike<Target> = {
        observe: (target) => {
          record.observed.push(target)
        },
        disconnect: () => {
          record.disconnected = true
          record.observed = []
        },
      }

      observers.push(record)
      return observer
    },
    requestAdmission: () => {
      admissions.push(admissions.length)
    },
  })

  return { trigger, observers, admissions }
}

const targets = (...ids: string[]): Target[] => ids.map((id) => ({ id }))

describe('createAdmissionTrigger', () => {
  it('creates no observer until something is registered', () => {
    const { observers } = harness()

    expect(observers).toHaveLength(0)
  })

  it('uses a single observer for many targets', () => {
    const { trigger, observers } = harness()

    trigger.register(targets('a', 'b', 'c', 'd'))

    expect(observers).toHaveLength(1)
    expect(observers[0].observed.map((target) => target.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('reuses the same observer across registrations', () => {
    const { trigger, observers } = harness()

    trigger.register(targets('a'))
    trigger.register(targets('b'))

    expect(observers).toHaveLength(1)
  })

  it('releases the previous targets on re-registration so a replaced shell cannot leak', () => {
    const { trigger, observers } = harness()
    const first = targets('old-1', 'old-2')

    trigger.register(first)
    trigger.register(targets('new-1'))

    // The observer is reused, so the release must be observable as a disconnect
    // followed by only the new targets being observed.
    expect(observers[0].disconnected).toBe(true)
    expect(observers[0].observed.map((target) => target.id)).toEqual(['new-1'])
    expect(trigger.observedCount()).toBe(1)
  })

  it('observes a repeated target only once within one registration', () => {
    const { trigger, observers } = harness()
    const shared = { id: 'same' }

    trigger.register([shared, shared])

    expect(observers[0].observed).toHaveLength(1)
  })

  it('requests admission when the observer reports a change', () => {
    const { trigger, observers, admissions } = harness()

    trigger.register(targets('a'))
    observers[0].fire()

    expect(admissions).toHaveLength(1)
  })

  it('forwards every observer callback, leaving coalescing to the scheduler', () => {
    /*
     * The scheduler this feeds is already rAF-coalesced, so suppressing
     * callbacks here would only add a second, redundant throttle - and an early
     * return that guessed wrong would drop the one callback that mattered.
     */
    const { trigger, observers, admissions } = harness()

    trigger.register(targets('a'))
    observers[0].fire()
    observers[0].fire()
    observers[0].fire()

    expect(admissions).toHaveLength(3)
  })

  it('stops observing and requesting after teardown', () => {
    const { trigger, observers, admissions } = harness()

    trigger.register(targets('a', 'b'))
    trigger.teardown()

    expect(observers[0].disconnected).toBe(true)
    expect(trigger.observedCount()).toBe(0)

    observers[0].fire()
    expect(admissions).toHaveLength(0)
  })

  it('can be re-armed after teardown', () => {
    const { trigger, observers, admissions } = harness()

    trigger.register(targets('a'))
    trigger.teardown()
    trigger.register(targets('b'))
    observers[observers.length - 1].fire()

    expect(trigger.observedCount()).toBe(1)
    expect(admissions).toHaveLength(1)
  })

  it('degrades to a no-op where the runtime has no observer to give', () => {
    // Chromium 79 does support IntersectionObserver, but the app must not depend
    // on it: the existing triggers remain the correctness path.
    const { trigger, admissions } = harness(false)

    trigger.register(targets('a', 'b'))

    expect(trigger.observedCount()).toBe(0)
    expect(admissions).toHaveLength(0)
    expect(() => trigger.teardown()).not.toThrow()
  })

  it('registering nothing releases previous targets rather than keeping them', () => {
    const { trigger, observers } = harness()

    trigger.register(targets('a'))
    trigger.register([])

    expect(trigger.observedCount()).toBe(0)
    expect(observers[0].observed).toEqual([])
  })
})
