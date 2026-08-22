import { NextFunction, Request, Response } from 'express'

import { env } from '../config/env'
import {
  RateLimitStore,
  InMemoryStore,
  RedisStore,
} from './rate-limit-store'

// ---------------------------------------------------------------------------
// Shared store singleton
// ---------------------------------------------------------------------------

let _sharedStore: RateLimitStore

/**
 * Return the single shared store used by every limiter.
 *
 * When REDIS_URL is set (and we're not in test) a Redis-backed store is used;
 * otherwise an in-memory Map is used as a fallback.
 *
 * Exporting for test support – tests typically inject the in-memory store
 * via `__setSharedStoreForTest`.
 */
export function getSharedStore(): RateLimitStore {
  if (!_sharedStore) {
    if (env.REDIS_URL && process.env.NODE_ENV !== 'test') {
      _sharedStore = new RedisStore(env.REDIS_URL)
    } else {
      _sharedStore = new InMemoryStore()
    }
  }

  return _sharedStore
}

/** ONLY for tests – swap in a test store before importing middleware. */
export function __setSharedStoreForTest(store: RateLimitStore): void {
  _sharedStore = store
}

// ---------------------------------------------------------------------------
// Identity helpers
// ---------------------------------------------------------------------------

/**
 * Extract the client IP from the request.
 *
 * When TRUST_PROXY is enabled the rightmost entry of x-forwarded-for is used
 * (the address added by the trusted proxy).  Otherwise the socket address is
 * used and untrusted headers are ignored to prevent identity spoofing.
 */
function getClientIP(req: Request): string {
  if (env.TRUST_PROXY) {
    const forwarded = (req.headers['x-forwarded-for'] as string | undefined)
    if (forwarded) {
      // In a trusted-proxy chain the rightmost address is the client as seen
      // by the first trusted proxy.
      const parts = forwarded.split(',')
      const rightmost = parts[parts.length - 1]?.trim()
      if (rightmost) return rightmost
    }
    const realIp = req.headers['x-real-ip'] as string | undefined
    if (realIp) return realIp
  }

  return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown'
}

// ---------------------------------------------------------------------------
// Limiter factory
// ---------------------------------------------------------------------------

interface RateLimitOptions {
  windowMs: number
  max: number
  message?: string
}

interface RateLimitData {
  count: number
  resetTime: number
}

function createRateLimiter(
  options: RateLimitOptions,
  store: RateLimitStore,
) {
  const {
    windowMs,
    max,
    message = 'Too many requests, please try again later.',
  } = options

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `rate:${getClientIP(req)}:${req.originalUrl}`
    const now = Date.now()

    let data: RateLimitData
    try {
      data = await store.increment(key, windowMs)
    } catch {
      // If the store is unreachable, fail open so we don't block valid traffic.
      // Operators should monitor for this condition.
      return next()
    }

    if (data.count > max) {
      res.set({
        'X-RateLimit-Limit': max.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': new Date(data.resetTime).toISOString(),
        'Retry-After': Math.ceil((data.resetTime - now) / 1000).toString(),
      })

      return res.status(429).json({ error: message })
    }

    res.set({
      'X-RateLimit-Limit': max.toString(),
      'X-RateLimit-Remaining': (max - data.count).toString(),
      'X-RateLimit-Reset': new Date(data.resetTime).toISOString(),
    })

    next()
  }
}

// ---------------------------------------------------------------------------
// Exported limiters
// ---------------------------------------------------------------------------

const store = getSharedStore()

export const generalLimiter = createRateLimiter(
  { windowMs: env.RATE_LIMIT_GENERAL_WINDOW_MS, max: env.RATE_LIMIT_GENERAL_MAX },
  store,
)

export const authLimiter = createRateLimiter(
  { windowMs: env.RATE_LIMIT_AUTH_WINDOW_MS, max: env.RATE_LIMIT_AUTH_MAX },
  store,
)

export const employerLimiter = createRateLimiter(
  { windowMs: env.RATE_LIMIT_EMPLOYER_WINDOW_MS, max: env.RATE_LIMIT_EMPLOYER_MAX },
  store,
)

export const authenticatedLimiter = createRateLimiter(
  { windowMs: env.RATE_LIMIT_AUTHENTICATED_WINDOW_MS, max: env.RATE_LIMIT_AUTHENTICATED_MAX },
  store,
)

export function dynamicRateLimiter(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user
  if (user && user.role === 'employer') {
    return employerLimiter(req, res, next)
  }
  if (user) {
    return authenticatedLimiter(req, res, next)
  }

  return generalLimiter(req, res, next)
}
