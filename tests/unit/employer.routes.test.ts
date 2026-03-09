import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/controllers/employer.controller', () => ({
  searchTalent: vi.fn((_req, res) => res.status(200).json({ ok: true })),
  getCandidateProfile: vi.fn((_req, res) => res.status(200).json({ ok: true })),
  contactCandidate: vi.fn((_req, res) => res.status(201).json({ ok: true })),
}))

import employerRoutes from '../../src/routes/v1/employer.routes'

function makeToken(role: 'learner' | 'employer') {
  const secret = process.env.JWT_SECRET as string

  return jwt.sign({ id: 'user-1', email: 'user@example.com', role }, secret, {
    expiresIn: '1h',
  })
}

describe('employer.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects unauthenticated requests', async () => {
    const app = express()
    app.use(express.json())
    app.use('/employer', employerRoutes)

    const response = await request(app).get('/employer/search')

    expect(response.status).toBe(401)
  })

  it('restricts access to employer accounts only', async () => {
    const app = express()
    app.use(express.json())
    app.use('/employer', employerRoutes)

    const response = await request(app)
      .get('/employer/search')
      .set('Authorization', `Bearer ${makeToken('learner')}`)

    expect(response.status).toBe(403)
  })

  it('applies employer rate limiter and allows employer role', async () => {
    const app = express()
    app.use(express.json())
    app.use('/employer', employerRoutes)

    const response = await request(app)
      .get('/employer/search')
      .set('Authorization', `Bearer ${makeToken('employer')}`)

    expect(response.status).toBe(200)
    expect(response.headers['x-ratelimit-limit']).toBeDefined()
  })
})
