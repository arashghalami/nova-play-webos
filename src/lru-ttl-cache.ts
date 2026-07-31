/**
 * A small in-memory cache with time-based expiry and least-recently-used
 * eviction. It intentionally stores no persistence metadata: callers scope and
 * clear instances when the underlying data source changes.
 */
export class LruTtlCache<T> {
  private readonly entries = new Map<string, { value: T; updatedAt: number }>()
  private readonly maxEntries: number
  private readonly ttlMs: number

  constructor(maxEntries: number, ttlMs: number) {
    this.maxEntries = maxEntries
    this.ttlMs = ttlMs
  }

  get(key: string, now = Date.now()): T | null {
    const entry = this.entries.get(key)

    if (!entry) {
      return null
    }

    if (now - entry.updatedAt > this.ttlMs) {
      this.entries.delete(key)
      return null
    }

    // Reinsert the entry so Map iteration order continues to represent LRU
    // order without needing a separate linked-list implementation.
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: string, value: T, now = Date.now()): void {
    this.entries.delete(key)
    this.entries.set(key, { value, updatedAt: now })

    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value

      if (oldestKey === undefined) {
        return
      }

      this.entries.delete(oldestKey)
    }
  }

  clear(): void {
    this.entries.clear()
  }

  get size(): number {
    return this.entries.size
  }
}