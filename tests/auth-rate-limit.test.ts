import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The limiter itself is real — only the handlers behind it are stubbed so the
// test never touches Prisma or bcrypt.
vi.mock('../src/controllers/auth.controller', () => ({
  AuthController: class {
    register = vi.fn((_req: unknown, res: any) =>
      res.status(201).json({ message: 'registered' }),
    )
    login = vi.fn((_req: unknown, res: any) =>
      res.status(200).json({ message: 'logged in' }),
    )
    logout = vi.fn((_req: unknown, res: any) =>
      res.status(200).json({ message: 'logged out' }),
    )
  },
}))

import authRoutes from '../src/routes/v1/auth.routes'
import { getSharedStore } from '../src/middleware/rate-limit.middleware'
import { InMemoryStore } from '../src/middleware/rate-limit-store'
import { env } from '../src/config/env'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/auth', authRoutes)

  return app
}

describe('auth routes rate limiting', () => {
  beforeEach(() => {
    // All limiters share the singleton store — clear counters between tests.
    ;(getSharedStore() as InMemoryStore).reset()
  })

  it('allows requests within the auth window, then returns 429', async () => {
    const app = makeApp()
    const max = env.RATE_LIMIT_AUTH_MAX

    for (let i = 0; i < max; i++) {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'learner@example.com', password: 'Secret1!' })

      expect(res.status).toBe(200)
    }

    const blocked = await request(app)
      .post('/auth/login')
      .send({ email: 'learner@example.com', password: 'Secret1!' })

    expect(blocked.status).toBe(429)
    expect(blocked.headers['x-ratelimit-limit']).toBe(String(max))
    expect(blocked.headers['x-ratelimit-remaining']).toBe('0')
    expect(blocked.headers['retry-after']).toBeDefined()
    expect(blocked.body).toEqual({
      error: 'Too many requests, please try again later.',
    })
  })

  it('rate limits POST /register independently of /login', async () => {
    const app = makeApp()
    const max = env.RATE_LIMIT_AUTH_MAX

    for (let i = 0; i < max; i++) {
      const res = await request(app)
        .post('/auth/register')
        .send({ email: `learner${i}@example.com`, password: 'Secret1!' })

      expect(res.status).toBe(201)
    }

    const blocked = await request(app)
      .post('/auth/register')
      .send({ email: 'one-too-many@example.com', password: 'Secret1!' })

    expect(blocked.status).toBe(429)

    // The login counter is separate, so it must still succeed.
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'learner@example.com', password: 'Secret1!' })

    expect(login.status).toBe(200)
  })
})
