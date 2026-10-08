import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
}))

vi.mock('../src/config/database', () => ({
  default: prismaMock,
  prisma: prismaMock,
}))

import userRoutes from '../src/routes/v1/users.routes'

const VALID_UUID = '3f6a1b2c-9d8e-4f00-8a1b-2c3d4e5f6a7b'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/users', userRoutes)

  return app
}

describe('GET /users/:id param validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a non-UUID id with 400 and never queries Prisma', async () => {
    const response = await request(makeApp()).get('/users/not-a-uuid')

    expect(response.status).toBe(400)
    expect(response.body.message).toBe('Validation failed')
    expect(response.body.errors.params).toEqual(['Invalid ID format'])
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })

  it('rejects a numeric id with 400', async () => {
    const response = await request(makeApp()).get('/users/123')

    expect(response.status).toBe(400)
    expect(response.body.errors.params).toEqual(['Invalid ID format'])
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })

  it('returns the public profile for a valid UUID', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z')
    prismaMock.user.findUnique.mockResolvedValue({
      id: VALID_UUID,
      username: 'ada',
      role: 'LEARNER',
      createdAt,
    })

    const response = await request(makeApp()).get(`/users/${VALID_UUID}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      id: VALID_UUID,
      username: 'ada',
      role: 'LEARNER',
      createdAt: createdAt.toISOString(),
    })
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: VALID_UUID },
    })
  })
})
