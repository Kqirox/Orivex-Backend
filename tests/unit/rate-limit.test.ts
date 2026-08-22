import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Request, Response, NextFunction } from 'express'
import {
  generalLimiter,
  authLimiter,
  employerLimiter,
  authenticatedLimiter,
  dynamicRateLimiter,
  getSharedStore,
} from '../../src/middleware/rate-limit.middleware'
import { InMemoryStore } from '../../src/middleware/rate-limit-store'
import { env } from '../../src/config/env'

// Mock the env
vi.mock('../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    REDIS_URL: '',
    TRUST_PROXY: false,
    RATE_LIMIT_GENERAL_WINDOW_MS: 900000, // 15 min
    RATE_LIMIT_GENERAL_MAX: 100,
    RATE_LIMIT_AUTH_WINDOW_MS: 900000,
    RATE_LIMIT_AUTH_MAX: 10,
    RATE_LIMIT_EMPLOYER_WINDOW_MS: 900000,
    RATE_LIMIT_EMPLOYER_MAX: 500,
    RATE_LIMIT_AUTHENTICATED_WINDOW_MS: 900000,
    RATE_LIMIT_AUTHENTICATED_MAX: 1000,
  },
}))

describe('Rate Limiting Middleware', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockNext: NextFunction

  beforeEach(() => {
    // All limiters share the singleton InMemoryStore — reset between tests
    // so counts from one test don't bleed into the next.
    ;(getSharedStore() as InMemoryStore).reset()

    mockReq = {
      headers: {},
      connection: { remoteAddress: '127.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' },
      originalUrl: '/test',
    }
    mockRes = {
      set: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }
    mockNext = vi.fn()
  })

  describe('General Limiter', () => {
    it('should allow requests within limit', async () => {
      for (let i = 0; i < 100; i++) {
        await generalLimiter(mockReq as Request, mockRes as Response, mockNext)
      }
      expect(mockNext).toHaveBeenCalledTimes(100)
      expect(mockRes.status).not.toHaveBeenCalled()
    })

    it('should block requests over limit', async () => {
      for (let i = 0; i < 101; i++) {
        await generalLimiter(mockReq as Request, mockRes as Response, mockNext)
      }
      expect(mockNext).toHaveBeenCalledTimes(100)
      expect(mockRes.status).toHaveBeenCalledWith(429)
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Too many requests, please try again later.' })
    })

    it('should set correct headers', async () => {
      await generalLimiter(mockReq as Request, mockRes as Response, mockNext)
      expect(mockRes.set).toHaveBeenCalledWith({
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '99',
        'X-RateLimit-Reset': expect.any(String),
    })
  })

  describe('Client identity', () => {
    it('ignores x-forwarded-for when TRUST_PROXY is off (no spoofing)', async () => {
      for (let i = 0; i < 11; i++) {
        mockReq.headers = { 'x-forwarded-for': `203.0.113.${i}` }
        await authLimiter(mockReq as Request, mockRes as Response, mockNext)
      }
      expect(mockNext).toHaveBeenCalledTimes(10)
      expect(mockRes.status).toHaveBeenCalledWith(429)
    })

    it('keys on the rightmost x-forwarded-for hop when TRUST_PROXY is on', async () => {
      env.TRUST_PROXY = true
      try {
        for (let i = 0; i < 11; i++) {
          mockReq.headers = { 'x-forwarded-for': `203.0.113.${i}, 10.0.0.5` }
          await authLimiter(mockReq as Request, mockRes as Response, mockNext)
        }
        expect(mockNext).toHaveBeenCalledTimes(10)
        expect(mockRes.status).toHaveBeenCalledWith(429)
      } finally {
        env.TRUST_PROXY = false
      }
    })
  })
})

  describe('Auth Limiter', () => {
    it('should have stricter limits', async () => {
      for (let i = 0; i < 11; i++) {
        await authLimiter(mockReq as Request, mockRes as Response, mockNext)
      }
      expect(mockNext).toHaveBeenCalledTimes(10)
      expect(mockRes.status).toHaveBeenCalledWith(429)
    })
  })

  describe('Employer Limiter', () => {
    it('should have higher limits', async () => {
      for (let i = 0; i < 500; i++) {
        await employerLimiter(mockReq as Request, mockRes as Response, mockNext)
      }
      expect(mockNext).toHaveBeenCalledTimes(500)
      expect(mockRes.status).not.toHaveBeenCalled()
    })
  })

  describe('Authenticated Limiter', () => {
    it('should have high limits', async () => {
      for (let i = 0; i < 1000; i++) {
        await authenticatedLimiter(mockReq as Request, mockRes as Response, mockNext)
      }
      expect(mockNext).toHaveBeenCalledTimes(1000)
      expect(mockRes.status).not.toHaveBeenCalled()
    })
  })

  describe('Dynamic Rate Limiter', () => {
    it('should use general limiter for unauthenticated', async () => {
      await dynamicRateLimiter(mockReq as Request, mockRes as Response, mockNext)
      expect(mockNext).toHaveBeenCalled()
    })

    it('should use authenticated limiter for authenticated users', async () => {
      (mockReq as any).user = { role: 'user' }
      await dynamicRateLimiter(mockReq as Request, mockRes as Response, mockNext)
      expect(mockNext).toHaveBeenCalled()
    })

    it('should use employer limiter for employers', async () => {
      (mockReq as any).user = { role: 'employer' }
      await dynamicRateLimiter(mockReq as Request, mockRes as Response, mockNext)
      expect(mockNext).toHaveBeenCalled()
    })
  })
})