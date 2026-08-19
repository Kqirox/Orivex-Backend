import { Request, Response } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { contactCandidate, getCandidateProfile, searchTalent } from '../../src/controllers/employer.controller'
import prisma from '../../src/config/database'

vi.mock('../../src/config/database', () => ({
  default: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    webhookEndpoint: {
      upsert: vi.fn(),
    },
    webhookDelivery: {
      create: vi.fn(),
    },
  },
}))

function createResponse() {
  const response: Partial<Response> = {}

  response.status = vi.fn().mockReturnValue(response)
  response.json = vi.fn().mockReturnValue(response)

  return response as Response
}

// `getEmployerPlan` resolves the plan by querying the authenticated employer's
// persisted row (id 'emp-1'). Every other id resolves through the per-test candidate mock.
function mockEmployerPlan(plan: string | null) {
  ;(prisma.user.findUnique as any).mockImplementation(async ({ where }: any) => {
    if (where.id === 'emp-1') {
      return plan ? { id: 'emp-1', plan } : null
    }

    return null
  })
}

const candidateFixture = {
  id: 'cand-1',
  email: 'alice.learner+seed@orivex.dev',
  username: 'Alice Learner',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  completions: [
    {
      score: 90,
      completedAt: new Date('2026-02-01T00:00:00Z'),
      module: { id: 'm1', title: 'Stellar Fundamentals', category: 'blockchain', difficulty: 'beginner' },
    },
  ],
  credentials: [
    {
      id: 'cred-1',
      onChainId: 'chain-cred-1',
      issuedAt: new Date('2026-02-02T00:00:00Z'),
      module: { id: 'm1', title: 'Stellar Fundamentals', category: 'blockchain', difficulty: 'beginner' },
    },
  ],
}

describe('EmployerController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.PRIVATE_CANDIDATE_IDS
  })

  it('searchTalent returns candidates matching filters and excludes private profiles', async () => {
    mockEmployerPlan('pro')
    process.env.PRIVATE_CANDIDATE_IDS = 'cand-2'
    ;(prisma.user.findMany as any).mockResolvedValue([
      candidateFixture,
      {
        id: 'cand-2',
        email: 'bob.learner+seed@orivex.dev',
        username: 'Bob Learner',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        completions: [
          {
            score: 88,
            completedAt: new Date('2026-02-01T00:00:00Z'),
            module: { id: 'm2', title: 'Wallet Security & Key Management', category: 'security', difficulty: 'intermediate' },
          },
        ],
        credentials: [],
      },
    ])

    const req = {
      user: { id: 'emp-1', email: 'employer@orivex.dev', role: 'EMPLOYER' },
      headers: { 'x-employer-plan': 'pro' },
      query: {
        skills: 'blockchain',
        location: 'lagos',
        credentials: 'verified',
      },
    } as unknown as Request
    const res = createResponse()

    await searchTalent(req, res)

    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        candidates: [
          expect.objectContaining({
            id: 'cand-1',
            location: 'lagos',
            verifiedCredentialCount: 1,
          }),
        ],
        plan: 'pro',
      }),
    )
  })

  it('searchTalent caps the page limit from the persisted enterprise plan', async () => {
    mockEmployerPlan('enterprise')
    ;(prisma.user.findMany as any).mockResolvedValue([candidateFixture])

    const req = {
      user: { id: 'emp-1', role: 'EMPLOYER' },
      query: { limit: '100' },
    } as unknown as Request
    const res = createResponse()

    await searchTalent(req, res)

    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: expect.objectContaining({ limit: 100 }),
      }),
    )
  })

  it('searchTalent ignores a spoofed enterprise header when the persisted plan is starter', async () => {
    mockEmployerPlan('starter')
    ;(prisma.user.findMany as any).mockResolvedValue([candidateFixture])

    const req = {
      user: { id: 'emp-1', role: 'EMPLOYER' },
      headers: { 'x-employer-plan': 'enterprise' },
      query: { limit: '100' },
    } as unknown as Request
    const res = createResponse()

    await searchTalent(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Current plan allows up to 10 results per page',
        currentPlan: 'starter',
        requestedLimit: 100,
        maxLimit: 10,
      }),
    )
  })

  it('getCandidateProfile returns profile with verified credentials', async () => {
    ;(prisma.user.findUnique as any).mockResolvedValue(candidateFixture)

    const req = {
      user: { id: 'emp-1', email: 'employer@orivex.dev', role: 'EMPLOYER' },
      params: { id: 'cand-1' },
    } as unknown as Request
    const res = createResponse()

    await getCandidateProfile(req, res)

    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cand-1',
        verifiedCredentials: [expect.objectContaining({ verified: true })],
      }),
    )
  })

  it('getCandidateProfile blocks private candidates', async () => {
    process.env.PRIVATE_CANDIDATE_IDS = 'cand-private'
    const req = {
      user: { id: 'emp-1', email: 'employer@orivex.dev', role: 'EMPLOYER' },
      params: { id: 'cand-private' },
    } as unknown as Request
    const res = createResponse()

    await getCandidateProfile(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ message: 'Candidate profile is private' })
  })

  it('contactCandidate returns 402 for a starter employer from persistence', async () => {
    mockEmployerPlan('starter')

    const req = {
      user: { id: 'emp-1', email: 'employer@orivex.dev', role: 'EMPLOYER' },
      headers: { 'x-employer-plan': 'starter' },
      body: {
        candidateId: 'cand-1',
        subject: 'Role opportunity',
        message: 'We would like to invite you to interview for a backend role.',
      },
    } as unknown as Request
    const res = createResponse()

    await contactCandidate(req, res)

    expect(res.status).toHaveBeenCalledWith(402)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Employer plan upgrade required',
        requiredPlan: 'pro',
        currentPlan: 'starter',
      }),
    )
  })

  it('contactCandidate ignores a spoofed pro header when the persisted plan is starter', async () => {
    mockEmployerPlan('starter')

    const req = {
      user: { id: 'emp-1', email: 'employer@orivex.dev', role: 'EMPLOYER' },
      headers: { 'x-employer-plan': 'pro' },
      body: {
        candidateId: 'cand-1',
        subject: 'Role opportunity',
        message: 'We would like to invite you to interview for a backend role.',
      },
    } as unknown as Request
    const res = createResponse()

    await contactCandidate(req, res)

    expect(res.status).toHaveBeenCalledWith(402)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Employer plan upgrade required' }),
    )
  })

  it('contactCandidate records outreach attempts for a pro employer', async () => {
    ;(prisma.user.findUnique as any).mockImplementation(async ({ where }: any) => {
      if (where.id === 'emp-1') {
        return { id: 'emp-1', plan: 'pro' }
      }
      if (where.id === 'cand-1') {
        return { id: 'cand-1', email: 'alice.learner+seed@orivex.dev', username: 'Alice Learner' }
      }

      return null
    })
    ;(prisma.webhookEndpoint.upsert as any).mockResolvedValue({ id: 'system-employer-outreach-log' })
    ;(prisma.webhookDelivery.create as any).mockResolvedValue({
      id: 'attempt-1',
      createdAt: new Date('2026-03-01T10:00:00Z'),
    })

    const req = {
      user: { id: 'emp-1', email: 'employer@orivex.dev', role: 'EMPLOYER' },
      headers: { 'x-employer-plan': 'pro' },
      body: {
        candidateId: 'cand-1',
        subject: 'Role opportunity',
        message: 'We would like to invite you to interview for a backend role.',
        channel: 'platform',
      },
    } as unknown as Request
    const res = createResponse()

    await contactCandidate(req, res)

    expect(prisma.webhookEndpoint.upsert).toHaveBeenCalled()
    expect(prisma.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'employer.contact_attempt',
          payload: expect.stringContaining('"employerPlan":"pro"'),
        }),
      }),
    )
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Candidate outreach recorded',
        outreach: expect.objectContaining({ id: 'attempt-1', candidateId: 'cand-1' }),
      }),
    )
  })
})
