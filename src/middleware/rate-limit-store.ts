import { Redis } from 'ioredis'

/**
 * A shared, atomic store for rate-limit counters.
 *
 * In production this is backed by a single Redis instance so that counters
 * survive process restarts and are shared across replicas.  In tests (or when
 * REDIS_URL is absent) the in-memory fallback is used.
 */
export interface RateLimitStore {
  /**
   * Increment the counter for `key` within `windowMs`.
   *
   * Must be atomic: the returned `count` reflects the value **after** the
   * increment, and the key must be expired after `windowMs` (TTL is reset
   * on every call — fixed-window semantics).
   */
  increment(key: string, windowMs: number): Promise<{ count: number; resetTime: number }>
}

// ---------------------------------------------------------------------------
// In-memory (fallback / test)
// ---------------------------------------------------------------------------

interface Entry {
  count: number
  resetTime: number
}

export class InMemoryStore implements RateLimitStore {
  private store = new Map<string, Entry>()
  private timers = new Map<string, NodeJS.Timeout>()

  async increment(key: string, windowMs: number): Promise<{ count: number; resetTime: number }> {
    const now = Date.now()
    let entry = this.store.get(key)

    if (!entry || entry.resetTime < now) {
      // Start a fresh window
      entry = { count: 0, resetTime: now + windowMs }

      // Clear any stale timer
      const prev = this.timers.get(key)
      if (prev) clearTimeout(prev)

      this.timers.set(key, setTimeout(() => {
        this.store.delete(key)
        this.timers.delete(key)
      }, windowMs))
    }

    entry.count++
    this.store.set(key, entry)

    return { count: entry.count, resetTime: entry.resetTime }
  }

  /** Clear all counters and pending timers (test support). */
  reset(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
    this.store.clear()
  }
}

// ---------------------------------------------------------------------------
// Redis (production)
// ---------------------------------------------------------------------------

/**
 * Lua script that atomically increments a counter and sets/refreshes the TTL.
 *
 * KEYS[1] – the rate-limit key
 * ARGV[1] – windowMs (TTL in milliseconds)
 */
const ATOMIC_INCREMENT = `
  local count = redis.call('INCR', KEYS[1])
  local ttl = redis.call('PTTL', KEYS[1])
  if ttl < 0 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
  end
  local resetTime = redis.call('TIME')[1] * 1000 + ttl
  return { count, resetTime }
`

export class RedisStore implements RateLimitStore {
  private redis: Redis

  constructor(url: string) {
    this.redis = new Redis(url)
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetTime: number }> {
    const result = (await this.redis.eval(
      ATOMIC_INCREMENT,
      1,
      key,
      windowMs
    )) as [number, number]

    return { count: result[0], resetTime: result[1] }
  }

  /** Gracefully disconnect. */
  async disconnect(): Promise<void> {
    await this.redis.quit()
  }
}