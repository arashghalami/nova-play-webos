import type { AppView } from './types'

export type TracePrimitive = string | number | boolean | null
export type TraceData = Record<string, TracePrimitive>

export type TraceEvent = {
  v: 1
  seq: number
  t: number
  dur?: number
  category: string
  name: string
  phase: 'instant' | 'begin' | 'end' | 'measure'
  view: AppView | 'bootstrap'
  interactionId?: number
  navigationId?: number
  renderId?: number
  requestId?: number
  imageId?: number
  playbackId?: number
  attemptId?: number
  data?: TraceData
}

export type TraceContext = Pick<
  TraceEvent,
  | 'interactionId'
  | 'navigationId'
  | 'renderId'
  | 'requestId'
  | 'imageId'
  | 'playbackId'
  | 'attemptId'
>

type TraceSummary = {
  enabled: boolean
  sessionId: string
  eventCount: number
  droppedEvents: number
  durationMs: number
  categories: Record<string, number>
  longTasks: number
  frameGaps: number
  eventLoopGaps: number
}

type TraceSnapshot = {
  schemaVersion: 1
  sessionId: string
  exportedAt: number
  enabled: boolean
  droppedEvents: number
  events: TraceEvent[]
  summary: TraceSummary
}

type PerformanceMemory = {
  usedJSHeapSize?: number
  totalJSHeapSize?: number
  jsHeapSizeLimit?: number
}

type PerformanceWithMemory = Performance & {
  memory?: PerformanceMemory
}

type TraceWindow = Window & {
  __NOVA_PERF__?: PerformanceTraceApi
  __NOVA_PERF_ENABLE__?: boolean
}

export type PerformanceTraceApi = {
  enable(verbose?: boolean): void
  disable(): void
  clear(): void
  event(category: string, name: string, data?: TraceData, context?: TraceContext): void
  startInteraction(name: string, data?: TraceData): number | null
  endInteraction(interactionId: number | null, name: string, data?: TraceData): void
  beginRender(view: AppView, data?: TraceData, context?: TraceContext): number | null
  endRender(renderId: number | null, data?: TraceData, context?: TraceContext): void
  beginRequest(name: string, data?: TraceData, context?: TraceContext): number | null
  endRequest(requestId: number | null, data?: TraceData, context?: TraceContext): void
  measure<T>(category: string, name: string, work: () => T, data?: TraceData, context?: TraceContext): T
  measureAsync<T>(
    category: string,
    name: string,
    work: () => Promise<T>,
    data?: TraceData,
    context?: TraceContext,
  ): Promise<T>
  trackImages(root: ParentNode, context?: TraceContext): void
  setView(view: AppView): void
  snapshot(): TraceSnapshot
  summary(): TraceSummary
  exportConsole(chunkSize?: number): void
  isEnabled(): boolean
}

const TRACE_SCHEMA_VERSION = 1
const MAX_TRACE_EVENTS = 8_000
const MAX_CONSOLE_CHUNK_SIZE = 12_000
const LONG_TASK_THRESHOLD_MS = 50
const FRAME_GAP_THRESHOLD_MS = 34
const EVENT_LOOP_GAP_THRESHOLD_MS = 60
const EVENT_LOOP_SAMPLE_MS = 1_000
const SENSITIVE_KEY_PATTERN = /(credential|password|token|secret|authorization|url|query|title|name|profile|stream|username)/i

function monotonicNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function epochNow(): number {
  return Date.now()
}

function randomId(): string {
  const cryptoApi = globalThis.crypto

  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID()
  }

  return `${epochNow().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function clampFinite(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0
}

function dataValue(value: unknown): TracePrimitive | undefined {
  if (value === null) {
    return null
  }

  if (typeof value === 'string') {
    return value.length > 160 ? `${value.slice(0, 157)}...` : value
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? clampFinite(value) : undefined
  }

  return typeof value === 'boolean' ? value : undefined
}

function sanitizeData(data: TraceData | undefined): TraceData | undefined {
  if (!data) {
    return undefined
  }

  const safe: TraceData = {}

  Object.entries(data).forEach(([key, value]) => {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      safe[`${key}Present`] = value !== null && value !== ''
      return
    }

    const normalized = dataValue(value)

    if (normalized !== undefined) {
      safe[key] = normalized
    }
  })

  return Object.keys(safe).length > 0 ? safe : undefined
}

function queryEnablesTracing(): boolean {
  if (typeof location === 'undefined') {
    return false
  }

  try {
    const query = new URLSearchParams(location.search)
    return query.get('novaPerf') === '1' || query.get('novaPerf') === 'verbose'
  } catch {
    return false
  }
}

function queryEnablesVerboseTracing(): boolean {
  if (typeof location === 'undefined') {
    return false
  }

  try {
    return new URLSearchParams(location.search).get('novaPerf') === 'verbose'
  } catch {
    return false
  }
}

function requestFrame(callback: FrameRequestCallback): number | null {
  if (typeof requestAnimationFrame !== 'function') {
    return null
  }

  return requestAnimationFrame(callback)
}

function cancelFrame(handle: number | null): void {
  if (handle !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(handle)
  }
}

function supportsPerformanceObserver(): boolean {
  return typeof PerformanceObserver !== 'undefined'
}

function resourceKind(entry: PerformanceResourceTiming): string {
  const type = entry.initiatorType

  return type || 'other'
}

function imageSourceKind(source: string | null): string {
  if (!source) {
    return 'empty'
  }

  if (/^https:/i.test(source)) {
    return 'https'
  }

  if (/^http:/i.test(source)) {
    return 'http'
  }

  if (/^(data|blob):/i.test(source)) {
    return 'inline'
  }

  return 'relative'
}

export class PerformanceTrace implements PerformanceTraceApi {
  private enabled = false
  private verbose = false
  private events: TraceEvent[] = []
  private nextSequence = 1
  private nextCorrelationId = 1
  private nextImageId = 1
  private droppedEvents = 0
  private currentView: AppView | 'bootstrap' = 'bootstrap'
  private sessionId = randomId()
  private startedAt = monotonicNow()
  private longTasks = 0
  private frameGaps = 0
  private eventLoopGaps = 0
  private frameHandle: number | null = null
  private lastFrameAt: number | null = null
  private eventLoopTimer: number | null = null
  private eventLoopExpectedAt: number | null = null
  private observers: PerformanceObserver[] = []

  constructor(enabled = false, verbose = false) {
    if (enabled) {
      this.enable(verbose)
    }
  }

  enable(verbose = false): void {
    if (this.enabled) {
      this.verbose = verbose
      return
    }

    this.enabled = true
    this.verbose = verbose
    this.startedAt = monotonicNow()
    this.event('runtime', 'trace-enabled', {
      verbose,
      performanceObserver: supportsPerformanceObserver(),
      memory: Boolean((performance as PerformanceWithMemory).memory),
      requestAnimationFrame: typeof requestAnimationFrame === 'function',
    })
    this.installObservers()
    this.startFrameSampler()
    this.startEventLoopSampler()
  }

  disable(): void {
    if (!this.enabled) {
      return
    }

    this.event('runtime', 'trace-disabled')
    this.enabled = false
    this.removeObservers()
    cancelFrame(this.frameHandle)
    this.frameHandle = null

    if (this.eventLoopTimer !== null) {
      globalThis.clearTimeout(this.eventLoopTimer)
      this.eventLoopTimer = null
    }
  }

  clear(): void {
    this.events = []
    this.nextSequence = 1
    this.droppedEvents = 0
    this.sessionId = randomId()
    this.startedAt = monotonicNow()
    this.longTasks = 0
    this.frameGaps = 0
    this.eventLoopGaps = 0

    if (this.enabled) {
      this.event('runtime', 'trace-cleared')
    }
  }

  isEnabled(): boolean {
    return this.enabled
  }

  setView(view: AppView): void {
    this.currentView = view

    if (this.enabled) {
      this.event('route', 'view-state', { view })
    }
  }

  event(category: string, name: string, data?: TraceData, context?: TraceContext): void {
    if (!this.enabled) {
      return
    }

    const event: TraceEvent = {
      v: TRACE_SCHEMA_VERSION,
      seq: this.nextSequence,
      t: clampFinite(monotonicNow() - this.startedAt),
      category,
      name,
      phase: 'instant',
      view: this.currentView,
      ...context,
    }
    const safeData = sanitizeData(data)

    if (safeData) {
      event.data = safeData
    }

    this.push(event)
  }

  startInteraction(name: string, data?: TraceData): number | null {
    if (!this.enabled) {
      return null
    }

    const interactionId = this.nextId()
    this.appendSpan('input', name, 'begin', undefined, data, { interactionId })
    return interactionId
  }

  endInteraction(interactionId: number | null, name: string, data?: TraceData): void {
    if (!this.enabled || interactionId === null) {
      return
    }

    this.appendSpan('input', name, 'end', undefined, data, { interactionId })
  }

  beginRender(view: AppView, data?: TraceData, context?: TraceContext): number | null {
    if (!this.enabled) {
      return null
    }

    const renderId = this.nextId()
    this.appendSpan('render', 'render-shell', 'begin', undefined, { ...data, view }, {
      ...context,
      renderId,
    })
    return renderId
  }

  endRender(renderId: number | null, data?: TraceData, context?: TraceContext): void {
    if (!this.enabled || renderId === null) {
      return
    }

    const finishedAt = monotonicNow()

    this.appendSpan('render', 'render-shell', 'end', undefined, data, {
      ...context,
      renderId,
    })

    const firstFrame = requestFrame(() => {
      this.appendSpan(
        'render',
        'first-frame-after-render',
        'measure',
        monotonicNow() - finishedAt,
        data,
        { ...context, renderId },
      )

      requestFrame(() => {
        this.appendSpan(
          'render',
          'stable-frame-after-render',
          'measure',
          monotonicNow() - finishedAt,
          data,
          { ...context, renderId },
        )
      })
    })

    if (firstFrame === null) {
      this.appendSpan('render', 'frame-api-unavailable', 'instant', undefined, data, {
        ...context,
        renderId,
      })
    }
  }

  beginRequest(name: string, data?: TraceData, context?: TraceContext): number | null {
    if (!this.enabled) {
      return null
    }

    const requestId = this.nextId()
    this.appendSpan('network', name, 'begin', undefined, data, { ...context, requestId })
    return requestId
  }

  endRequest(requestId: number | null, data?: TraceData, context?: TraceContext): void {
    if (!this.enabled || requestId === null) {
      return
    }

    this.appendSpan('network', 'request', 'end', undefined, data, { ...context, requestId })
  }

  measure<T>(
    category: string,
    name: string,
    work: () => T,
    data?: TraceData,
    context?: TraceContext,
  ): T {
    if (!this.enabled) {
      return work()
    }

    const startedAt = monotonicNow()

    try {
      return work()
    } finally {
      this.appendSpan(category, name, 'measure', monotonicNow() - startedAt, data, context)
    }
  }

  async measureAsync<T>(
    category: string,
    name: string,
    work: () => Promise<T>,
    data?: TraceData,
    context?: TraceContext,
  ): Promise<T> {
    if (!this.enabled) {
      return work()
    }

    const startedAt = monotonicNow()

    try {
      return await work()
    } finally {
      this.appendSpan(category, name, 'measure', monotonicNow() - startedAt, data, context)
    }
  }

  trackImages(root: ParentNode, context?: TraceContext): void {
    if (!this.enabled) {
      return
    }

    root.querySelectorAll('img').forEach((image) => {
      const element = image as HTMLImageElement

      // Deferred catalogue artwork deliberately has no src until the bounded
      // viewport loader admits it. Treating that state as a terminal image
      // error would both pollute traces and hide the real decode lifecycle.
      if (!element.getAttribute('src') || element.dataset.novaTraceImageId) {
        return
      }

      const imageId = this.nextImageId
      this.nextImageId += 1
      element.dataset.novaTraceImageId = String(imageId)
      const sourceKind = imageSourceKind(element.getAttribute('src'))
      const data: TraceData = {
        sourceKind,
        lazy: element.loading === 'lazy',
        completeAtBind: element.complete,
      }

      this.event('image', 'assigned', data, { ...context, imageId })

      const terminal = (name: 'load' | 'error'): void => {
        this.event(
          'image',
          name,
          {
            sourceKind,
            complete: element.complete,
            naturalWidth: element.naturalWidth,
            naturalHeight: element.naturalHeight,
            attached: element.isConnected,
          },
          { ...context, imageId },
        )
      }

      element.addEventListener('load', () => terminal('load'), { once: true })
      element.addEventListener('error', () => terminal('error'), { once: true })

      if (element.complete) {
        terminal(element.naturalWidth > 0 ? 'load' : 'error')
      }
    })
  }

  snapshot(): TraceSnapshot {
    return {
      schemaVersion: TRACE_SCHEMA_VERSION,
      sessionId: this.sessionId,
      exportedAt: epochNow(),
      enabled: this.enabled,
      droppedEvents: this.droppedEvents,
      events: [...this.events],
      summary: this.summary(),
    }
  }

  summary(): TraceSummary {
    const categories: Record<string, number> = {}

    this.events.forEach((event) => {
      categories[event.category] = (categories[event.category] ?? 0) + 1
    })

    return {
      enabled: this.enabled,
      sessionId: this.sessionId,
      eventCount: this.events.length,
      droppedEvents: this.droppedEvents,
      durationMs: clampFinite(monotonicNow() - this.startedAt),
      categories,
      longTasks: this.longTasks,
      frameGaps: this.frameGaps,
      eventLoopGaps: this.eventLoopGaps,
    }
  }

  exportConsole(chunkSize = MAX_CONSOLE_CHUNK_SIZE): void {
    const safeChunkSize = Math.max(1_000, Math.min(MAX_CONSOLE_CHUNK_SIZE, Math.floor(chunkSize)))
    const payload = JSON.stringify(this.snapshot())
    const chunkCount = Math.ceil(payload.length / safeChunkSize)

    console.info(
      `[NOVA_PERF_EXPORT] session=${this.sessionId} chunks=${chunkCount} bytes=${payload.length}`,
    )

    for (let index = 0; index < chunkCount; index += 1) {
      const content = payload.slice(index * safeChunkSize, (index + 1) * safeChunkSize)
      console.info(`[NOVA_PERF_EXPORT:${index + 1}/${chunkCount}]${content}`)
    }
  }

  private nextId(): number {
    const id = this.nextCorrelationId
    this.nextCorrelationId += 1
    return id
  }

  private appendSpan(
    category: string,
    name: string,
    phase: TraceEvent['phase'],
    duration?: number,
    data?: TraceData,
    context?: TraceContext,
  ): void {
    if (!this.enabled) {
      return
    }

    const event: TraceEvent = {
      v: TRACE_SCHEMA_VERSION,
      seq: this.nextSequence,
      t: clampFinite(monotonicNow() - this.startedAt),
      category,
      name,
      phase,
      view: this.currentView,
      ...context,
    }

    if (duration !== undefined) {
      event.dur = clampFinite(duration)
    }

    const safeData = sanitizeData(data)

    if (safeData) {
      event.data = safeData
    }

    this.push(event)
  }

  private push(event: TraceEvent): void {
    event.seq = this.nextSequence
    this.nextSequence += 1

    if (this.events.length >= MAX_TRACE_EVENTS) {
      this.events.shift()
      this.droppedEvents += 1
    }

    this.events.push(event)
  }

  private installObservers(): void {
    if (!supportsPerformanceObserver()) {
      return
    }

    this.observe('longtask', (entries) => {
      entries.forEach((entry) => {
        if (entry.duration < LONG_TASK_THRESHOLD_MS) {
          return
        }

        this.longTasks += 1
        this.appendSpan('runtime', 'long-task', 'measure', entry.duration)
      })
    })

    this.observe('resource', (entries) => {
      entries.forEach((entry) => {
        const resource = entry as PerformanceResourceTiming

        if (resource.duration < LONG_TASK_THRESHOLD_MS && !this.verbose) {
          return
        }

        this.appendSpan(
          'resource',
          resourceKind(resource),
          'measure',
          resource.duration,
          {
            transferBytes: resource.transferSize ?? 0,
            encodedBytes: resource.encodedBodySize ?? 0,
            decodedBytes: resource.decodedBodySize ?? 0,
          },
        )
      })
    })
  }

  private observe(
    type: string,
    onEntries: (entries: PerformanceEntryList) => void,
  ): void {
    try {
      const observer = new PerformanceObserver((list) => onEntries(list.getEntries()))
      observer.observe({ type, buffered: true })
      this.observers.push(observer)
    } catch {
      this.event('runtime', 'observer-unavailable', { observer: type })
    }
  }

  private removeObservers(): void {
    this.observers.forEach((observer) => observer.disconnect())
    this.observers = []
  }

  private startFrameSampler(): void {
    const sample = (now: number): void => {
      if (!this.enabled) {
        return
      }

      if (this.lastFrameAt !== null) {
        const gap = now - this.lastFrameAt

        if (gap >= FRAME_GAP_THRESHOLD_MS) {
          this.frameGaps += 1
          this.appendSpan('runtime', 'frame-gap', 'measure', gap)
        }
      }

      this.lastFrameAt = now
      this.frameHandle = requestFrame(sample)
    }

    this.frameHandle = requestFrame(sample)
  }

  private startEventLoopSampler(): void {
    const sample = (): void => {
      if (!this.enabled) {
        return
      }

      const now = monotonicNow()
      const expectedAt = this.eventLoopExpectedAt

      if (expectedAt !== null) {
        const delay = now - expectedAt

        if (delay >= EVENT_LOOP_GAP_THRESHOLD_MS) {
          this.eventLoopGaps += 1
          this.appendSpan('runtime', 'event-loop-gap', 'measure', delay)
        }
      }

      const memory = (performance as PerformanceWithMemory).memory

      if (memory?.usedJSHeapSize && this.verbose) {
        this.event('runtime', 'heap-sample', {
          usedHeapBytes: memory.usedJSHeapSize,
          totalHeapBytes: memory.totalJSHeapSize ?? 0,
          heapLimitBytes: memory.jsHeapSizeLimit ?? 0,
        })
      }

      this.eventLoopExpectedAt = monotonicNow() + EVENT_LOOP_SAMPLE_MS
      this.eventLoopTimer = globalThis.setTimeout(sample, EVENT_LOOP_SAMPLE_MS)
    }

    this.eventLoopExpectedAt = monotonicNow() + EVENT_LOOP_SAMPLE_MS
    this.eventLoopTimer = globalThis.setTimeout(sample, EVENT_LOOP_SAMPLE_MS)
  }
}

const initialEnabled =
  (globalThis as typeof globalThis & { __NOVA_PERF_ENABLE__?: boolean }).__NOVA_PERF_ENABLE__ === true ||
  queryEnablesTracing()

export const performanceTrace = new PerformanceTrace(initialEnabled, queryEnablesVerboseTracing())

if (typeof window !== 'undefined') {
  ;(window as TraceWindow).__NOVA_PERF__ = performanceTrace
}