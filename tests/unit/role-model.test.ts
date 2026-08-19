/**
 * tests/unit/role-model.test.ts
 *
 * Acceptance criteria for issue #4:
 *   - register no longer reads a role from the request body
 *   - created user's role is always LEARNER
 *   - a user with EMPLOYER role can pass authorize('EMPLOYER')
 *   - a user with LEARNER role is rejected 403 from employer routes
 *   - UserRole enum values align with the Prisma Role enum (uppercase)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Request, Response } from 'express'
import { AuthController } from '../../src/controllers/auth.controller'
import { UserRole } from '../../src/types/user.types'

// ── Mock Prisma ───────────────────────────────────────────────────────────────

vi.mock('../../src/config/database', () => ({
  default: {
    user: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
  },
  prisma: {
    user: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))

// ── Mock JWT (stable secret) ──────────────────────────────────────────────────

vi.stubEnv('JWT_SECRET', 'test-secret-key')

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeResMock(): Partial<Response> {
  const res: Partial<Response> = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)

  return res
}

// ── UserRole enum alignment ───────────────────────────────────────────────────

describe('UserRole enum', () => {
  it('has EMPLOYER member with uppercase value', () => {
    expect(UserRole.EMPLOYER).toBe('EMPLOYER')
  })

  it('has LEARNER member with uppercase value matching Prisma Role enum', () => {
    expect(UserRole.LEARNER).toBe('LEARNER')
  })

  it('has ADMIN member with uppercase value', () => {
    expect(UserRole.ADMIN).toBe('ADMIN')
  })

  it('has INSTRUCTOR member with uppercase value', () => {
    expect(UserRole.INSTRUCTOR).toBe('INSTRUCTOR')
  })
})

// ── authorize ─────────────────────────────────────────────────────────────────

describe('authorize – EMPLOYER access', () => {
  // Import dynamically so the env stub is in effect
  const getAuthorize = async () => {
    const { authorize } = await import('../../src/middleware/auth.middleware')

    return authorize
  }

  it('allows a user with EMPLOYER role to pass authorize("EMPLOYER")', async () => {
    const authorize = await getAuthorize()
    const req = { user: { id: 'u1', email: 'e@e.com', role: 'EMPLOYER' } } as Partial<Request>
    const res = makeResMock()
    const next = vi.fn()

    authorize('EMPLOYER')(req as Request, res as Response, next)

    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('rejects a LEARNER from the EMPLOYER-only route with 403', async () => {
    const authorize = await getAuthorize()
    const req = { user: { id: 'u1', email: 'l@l.com', role: 'LEARNER' } } as Partial<Request>
    const res = makeResMock()
    const next = vi.fn()

    authorize('EMPLOYER')(req as Request, res as Response, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects an INSTRUCTOR from the EMPLOYER-only route with 403', async () => {
    const authorize = await getAuthorize()
    const req = { user: { id: 'u1', email: 'i@i.com', role: 'INSTRUCTOR' } } as Partial<Request>
    const res = makeResMock()
    const next = vi.fn()

    authorize('EMPLOYER')(req as Request, res as Response, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })
})

// ── register – always creates LEARNER ────────────────────────────────────────

describe('AuthController.register – role enforcement', () => {
  let authController: AuthController

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('../../src/config/database')
    const prisma = mod.default

    // Happy-path: user does not exist yet, creation succeeds
    ;(prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(prisma.user.create as ReturnType<typeof vi.fn>).mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: 'new-user-id',
        email: data.email,
        username: data.username,
        role: data.role,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    )

    authController = new AuthController()
  })

  it('creates the user with role LEARNER when no role is supplied', async () => {
    const prisma = (await import('../../src/config/database')).default
    const req = {
      body: {
        email: 'alice@example.com',
        password: 'P@ssword123',
        username: 'alice',
        // no role field
      },
    } as Partial<Request>
    const res = makeResMock()

    await authController.register(req as Request, res as Response)

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'LEARNER' }),
      }),
    )
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('creates the user with role LEARNER even when client sends role: EMPLOYER', async () => {
    const prisma = (await import('../../src/config/database')).default
    const req = {
      body: {
        email: 'bob@example.com',
        password: 'P@ssword123',
        username: 'bob',
        role: 'EMPLOYER', // adversarial input — should be ignored
      },
    } as Partial<Request>
    const res = makeResMock()

    await authController.register(req as Request, res as Response)

    // The prisma.user.create call must always write LEARNER, never EMPLOYER
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'LEARNER' }),
      }),
    )
  })

  it('returns a token whose role claim is LEARNER (uppercase, Prisma-aligned)', async () => {
    const req = {
      body: {
        email: 'carol@example.com',
        password: 'P@ssword123',
        username: 'carol',
      },
    } as Partial<Request>
    const res = makeResMock()

    await authController.register(req as Request, res as Response)

    const jsonArg = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(jsonArg).toMatchObject({ user: { role: 'LEARNER' } })
  })

  it('returns 409 when email or username already exists', async () => {
    const prisma = (await import('../../src/config/database')).default
    ;(prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'existing',
      email: 'alice@example.com',
    })

    const req = {
      body: {
        email: 'alice@example.com',
        password: 'P@ssword123',
        username: 'alice',
      },
    } as Partial<Request>
    const res = makeResMock()

    await authController.register(req as Request, res as Response)

    expect(res.status).toHaveBeenCalledWith(409)
  })

  it('returns 400 for invalid request body (missing required fields)', async () => {
    const req = {
      body: { email: 'not-an-email' },
    } as Partial<Request>
    const res = makeResMock()

    await authController.register(req as Request, res as Response)

    expect(res.status).toHaveBeenCalledWith(400)
  })
})
