import { describe, expect, it } from 'vitest'
import { PerformanceTrace } from './performance-trace'

describe('PerformanceTrace', () => {
  it('does not retain events while disabled', () => {
    const trace = new PerformanceTrace()

    trace.event('route', 'rendered', { itemCount: 4 })

    expect(trace.isEnabled()).toBe(false)
    expect(trace.snapshot().events).toEqual([])
  })

  it('records sanitized, correlated events when enabled', () => {
    const trace = new PerformanceTrace()
    trace.enable()

    const interactionId = trace.startInteraction('open-details', {
      streamId: 'private-stream-id',
      itemCount: 4,
    })
    trace.event('route', 'details-rendered', { title: 'Private title', itemCount: 12 }, {
      interactionId: interactionId ?? undefined,
    })
    trace.endInteraction(interactionId, 'details-ready')

    const events = trace.snapshot().events
    const start = events.find((event) => event.name === 'open-details')
    const render = events.find((event) => event.name === 'details-rendered')

    expect(start?.interactionId).toBe(interactionId)
    expect(start?.data).toEqual({
      streamIdPresent: true,
      itemCount: 4,
    })
    expect(render?.interactionId).toBe(interactionId)
    expect(render?.data).toEqual({
      titlePresent: true,
      itemCount: 12,
    })

    trace.disable()
  })

  it('uses a bounded ring buffer and reports dropped events', () => {
    const trace = new PerformanceTrace()
    trace.enable()

    for (let index = 0; index < 8_010; index += 1) {
      trace.event('test', 'event', { index })
    }

    const snapshot = trace.snapshot()

    expect(snapshot.events).toHaveLength(8_000)
    expect(snapshot.droppedEvents).toBe(11)
    expect(snapshot.events[0]?.seq).toBeGreaterThan(1)

    trace.disable()
  })
})