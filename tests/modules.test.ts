import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import app from '../../src/app'

// Mock Prisma Client
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    module: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    completion: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
      findFirst: vi.fn(),
    }
  }))
}))

// Mock auth middleware
vi.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, res: any, next: any) => {
    req.user = { id: 'test-user-id', email: 'test@example.com', role: 'learner' }
    next()
  },
  optionalAuthenticate: (req: any, res: any, next: any) => {
    if (req.headers.authorization === 'Bearer mock-jwt-token') {
      req.user = { id: 'test-user-id', email: 'test@example.com', role: 'learner' }
    }
    next()
  }
}))

describe('Module Management Endpoints', () => {
  let authToken: string
  const testUserId = 'test-user-id'
  const testModuleId = 'test-module-id'

  beforeEach(() => {
    authToken = 'Bearer mock-jwt-token'
    vi.clearAllMocks()
  })

  describe('GET /api/v1/modules', () => {
    it('should return paginated list of modules', async () => {
      const { PrismaClient } = await import('@prisma/client')
      const mockPrisma = new PrismaClient() as any

      const mockModules = [
        {
          id: testModuleId,
          title: 'Test Module',
          description: 'A test module',
          category: 'blockchain',
          difficulty: 'beginner',
          reward: 10.0,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { completions: 5 }
        }
      ]

      mockPrisma.module.count.mockResolvedValue(1)
      mockPrisma.module.findMany.mockResolvedValue(mockModules)
      mockPrisma.completion.findMany.mockResolvedValue([])

      const response = await request(app)
        .get('/api/v1/modules')
        .expect(200)

      expect(response.body).toHaveProperty('modules')
      expect(response.body).toHaveProperty('pagination')
      expect(response.body.modules).toBeInstanceOf(Array)
      expect(response.body.modules.length).toBe(1)
      expect(response.body.pagination).toHaveProperty('page')
      expect(response.body.pagination).toHaveProperty('limit')
      expect(response.body.pagination).toHaveProperty('total')
    })

    it('should filter modules by category', async () => {
      const { PrismaClient } = await import('@prisma/client')
      const mockPrisma = new PrismaClient() as any

      mockPrisma.module.count.mockResolvedValue(1)
      mockPrisma.module.findMany.mockResolvedValue([])
      mockPrisma.completion.findMany.mockResolvedValue([])

      const response = await request(app)
        .get('/api/v1/modules?category=blockchain')
        .expect(200)

      expect(mockPrisma.module.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: 'blockchain'
          })
        })
      )
    })

    it('should filter modules by difficulty', async () => {
      const { PrismaClient } = await import('@prisma/client')
      const mockPrisma = new PrismaClient() as any

      mockPrisma.module.count.mockResolvedValue(1)
      mockPrisma.module.findMany.mockResolvedValue([])
      mockPrisma.completion.findMany.mockResolvedValue([])

      const response = await request(app)
        .get('/api/v1/modules?difficulty=beginner')
        .expect(200)

      expect(mockPrisma.module.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            difficulty: 'beginner'
          })
        })
      )
    })

    it('should search modules by title and description', async () => {
      const { PrismaClient } = await import('@prisma/client')
      const mockPrisma = new PrismaClient() as any

      mockPrisma.module.count.mockResolvedValue(1)
      mockPrisma.module.findMany.mockResolvedValue([])
      mockPrisma.completion.findMany.mockResolvedValue([])

      const response = await request(app)
        .get('/api/v1/modules?search=Test')
        .expect(200)

      expect(mockPrisma.module.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { title: { contains: 'Test', mode: 'insensitive' } },
              { description: { contains: 'Test', mode: 'insensitive' } }
            ]
          })
        })
      )
    })

    it('should include user progress when authenticated', async () => {
      const { PrismaClient } = await import('@prisma/client')
      const mockPrisma = new PrismaClient() as any

      const mockModules = [
        {
          id: testModuleId,
          title: 'Test Module',
          description: 'A test module',
          category: 'blockchain',
          difficulty: 'beginner',
          reward: 10.0,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { completions: 5 }
        }
      ]

      const mockCompletions = [
        {
          moduleId: testModuleId,
          score: 85,
          completedAt: new Date()
        }
      ]

      mockPrisma.module.count.mockResolvedValue(1)
      mockPrisma.module.findMany.mockResolvedValue(mockModules)
      mockPrisma.completion.findMany.mockResolvedValue(mockCompletions)

      const response = await request(app)
        .get('/api/v1/modules')
        .set('Authorization', authToken)
        .expect(200)

      const moduleWithProgress = response.body.modules.find((m: any) => m.id === testModuleId)
      expect(moduleWithProgress.userProgress).toBeTruthy()
      expect(moduleWithProgress.userProgress.completed).toBe(true)
      expect(moduleWithProgress.userProgress.score).toBe(85)
    })

    it('should validate pagination parameters', async () => {
      await request(app)
        .get('/api/v1/modules?page=invalid')
        .expect(400)

      await request(app)
        .get('/api/v1/modules?limit=invalid')
        .expect(400)
    })
  })

  describe('GET /api/v1/modules/:id', () => {
    it('should return module details', async () => {
      const { PrismaClient } = await import('@prisma/client')
      const mockPrisma = new PrismaClient() as any

      const mockModule = {
        id: testModuleId,
        title: 'Test Module',
        description: 'A test module',
        category: 'blockchain',
        difficulty: 'beginner',
        reward: 10.0,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { completions: 5 }
      }

      mockPrisma.module.findUnique.mockResolvedValue(mockModule)
      mockPrisma.completion.findUnique.mockResolvedValue(null)

      const response = await request(app)
        .get(`/api/v1/modules/${testModuleId}`)
        .expect(200)

      expect(response.body.id).toBe(testModuleId)
      expect(response.body.title).toBe(mockModule.title)
      expect(response.body.description).toBe(mockModule.description)
      expect(response.body.category).toBe(mockModule.category)
      expect(response.body.difficulty).toBe(mockModule.difficulty)
      expect(response.body.reward).toBe(mockModule.reward)
      expect(response.body).toHaveProperty('completionCount')
    })

    it('should return 404 for non-existent module', async () => {
      const { PrismaClient } = await import('@prisma/client')
      const mockPrisma = new PrismaClient() as any

      mockPrisma.module.findUnique.mockResolvedValue(null)

      await request(app)
        .get(`/api/v1/modules/non-existent-id`)
        .expect(404)
    })

    it('should include user progress when authenticated', async () => {
      const { PrismaClient } = await import('@prisma/client')
      const mockPrisma = new PrismaClient() as any

      const mockModule = {
        id: testModuleId,
        title: 'Test Module',
        description: 'A test module',
        category: 'blockchain',
        difficulty: 'beginner',
        reward: 10.0,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { completions: 5 }
      }

      const mockCompletion = {
        score: 90,
        completedAt: new Date()
      }

      mockPrisma.module.findUnique.mockResolvedValue(mockModule)
      mockPrisma.completion.findUnique.mockResolvedValue(mockCompletion)

      const response = await request(app)
        .get(`/api/v1/modules/${testModuleId}`)
        .set('Authorization', authToken)
        .expect(200)

      expect(response.body.userProgress).toBeTruthy()
      expect(response.body.userProgress.completed).toBe(true)
      expect(response.body.userProgress.score).toBe(90)
    })
  })

  describe('POST /api/v1/modules/:id/start', () => {
    it('should start tracking module progress', async () => {
      const { PrismaClient } = await import('@prisma/client')
      const mockPrisma = new PrismaClient() as any

      const mockModule = {
        id: testModuleId,
        title: 'Test Module',
        description: 'A test module',
        category: 'blockchain',
        difficulty: 'beginner',
        reward: 10.0
      }

      const mockCompletion = {
        id: 'completion-id',
        userId: testUserId,
        moduleId: testModuleId,
        score: null,
        createdAt: new Date()
      }

      mockPrisma.module.findUnique.mockResolvedValue(mockModule)
      mockPrisma.completion.findUnique.mockResolvedValue(null)
      mockPrisma.completion.create.mockResolvedValue(mockCompletion)

      const response = await request(app)
        .post(`/api/v1/modules/${testModuleId}/start`)
        .set('Authorization', authToken)
        .expect(201)

      expect(response.body.message).toBe('Module started successfully')
      expect(response.body).toHaveProperty('completionId')
      expect(response.body).toHaveProperty('startedAt')
      expect(mockPrisma.completion.create).toHaveBeenCalledWith({
        data: {
          userId: testUserId,
          moduleId: testModuleId,
          score: null
        }
      })
    })

    it('should return 401 for unauthenticated request', async () => {
      await request(app)
        .post(`/api/v1/modules/${testModuleId}/start`)
        .expect(401)
    })

    it('should return 404 for non-existent module', async () => {
      const { PrismaClient } = await import('@prisma/client')
      const mockPrisma = new PrismaClient() as any

      mockPrisma.module.findUnique.mockResolvedValue(null)

      await request(app)
        .post(`/api/v1/modules/${testModuleId}/start`)
        .set('Authorization', authToken)
        .expect(404)
    })

    it('should return 400 if module already started', async () => {
      const { PrismaClient } = await import('@prisma/client')
      const mockPrisma = new PrismaClient() as any

      const mockModule = {
        id: testModuleId,
        title: 'Test Module',
        description: 'A test module',
        category: 'blockchain',
        difficulty: 'beginner',
        reward: 10.0
      }

      const existingCompletion = {
        score: null, // in progress
      }

      mockPrisma.module.findUnique.mockResolvedValue(mockModule)
      mockPrisma.completion.findUnique.mockResolvedValue(existingCompletion)

      const response = await request(app)
        .post(`/api/v1/modules/${testModuleId}/start`)
        .set('Authorization', authToken)
        .expect(400)

      expect(response.body.message).toBe('Module already started or completed')
      expect(response.body.status).toBe('in_progress')
    })
  })

  describe('POST /api/v1/modules/:id/complete', () => {
    it('should complete module with quiz answers', async () => {
      const { PrismaClient } = await import('@prisma/client')
      const mockPrisma = new PrismaClient() as any

      const mockModule = {
        id: testModuleId,
        title: 'Test Module',
        description: 'A test module',
        category: 'blockchain',
        difficulty: 'beginner',
        reward: 10.0
      }

      const existingCompletion = {
        score: null, // in progress
      }

      const updatedCompletion = {
        score: 100,
        completedAt: new Date()
      }

      const quizAnswers = [
        { questionId: 'q1', answer: 'answer1' },
        { questionId: 'q2', answer: 'answer2' }
      ]

      mockPrisma.module.findUnique.mockResolvedValue(mockModule)
      mockPrisma.completion.findUnique.mockResolvedValue(existingCompletion)
      mockPrisma.completion.update.mockResolvedValue(updatedCompletion)
      mockPrisma.transaction.create.mockResolvedValue({ id: 'transaction-id' })

      const response = await request(app)
        .post(`/api/v1/modules/${testModuleId}/complete`)
        .set('Authorization', authToken)
        .send({ quizAnswers })
        .expect(200)

      expect(response.body.message).toBe('Module completed successfully')
      expect(response.body).toHaveProperty('score')
      expect(response.body).toHaveProperty('isEligibleForReward')
      expect(response.body).toHaveProperty('reward')
      expect(response.body).toHaveProperty('completedAt')
      expect(mockPrisma.completion.update).toHaveBeenCalledWith({
        where: {
          userId_moduleId: {
            userId: testUserId,
            moduleId: testModuleId
          }
        },
        data: {
          score: 100,
          completedAt: expect.any(Date)
        }
      })
    })

    it('should create reward transaction for eligible scores', async () => {
      const { PrismaClient } = await import('@prisma/client')
      const mockPrisma = new PrismaClient() as any

      const mockModule = {
        id: testModuleId,
        title: 'Test Module',
        description: 'A test module',
        category: 'blockchain',
        difficulty: 'beginner',
        reward: 10.0
      }

      const existingCompletion = { score: null }
      const updatedCompletion = { score: 100, completedAt: new Date() }

      const quizAnswers = [{ questionId: 'q1', answer: 'answer1' }]

      mockPrisma.module.findUnique.mockResolvedValue(mockModule)
      mockPrisma.completion.findUnique.mockResolvedValue(existingCompletion)
      mockPrisma.completion.update.mockResolvedValue(updatedCompletion)
      mockPrisma.transaction.create.mockResolvedValue({ id: 'transaction-id' })

      const response = await request(app)
        .post(`/api/v1/modules/${testModuleId}/complete`)
        .set('Authorization', authToken)
        .send({ quizAnswers })
        .expect(200)

      expect(response.body.isEligibleForReward).toBe(true)
      expect(response.body.reward).toBe(mockModule.reward)
      expect(response.body).toHaveProperty('rewardTransaction')
      expect(mockPrisma.transaction.create).toHaveBeenCalledWith({
        data: {
          userId: testUserId,
          amount: mockModule.reward,
          type: 'reward',
          status: 'pending'
        }
      })
    })

    it('should return 401 for unauthenticated request', async () => {
      await request(app)
        .post(`/api/v1/modules/${testModuleId}/complete`)
        .send({ quizAnswers: [] })
        .expect(401)
    })

    it('should return 404 for non-existent module', async () => {
      const { PrismaClient } = await import('@prisma/client')
      const mockPrisma = new PrismaClient() as any

      mockPrisma.module.findUnique.mockResolvedValue(null)

      await request(app)
        .post(`/api/v1/modules/${testModuleId}/complete`)
        .set('Authorization', authToken)
        .send({ quizAnswers: [] })
        .expect(404)
    })

    it('should return 400 if module not started', async () => {
      const { PrismaClient } = await import('@prisma/client')
      const mockPrisma = new PrismaClient() as any

      mockPrisma.module.findUnique.mockResolvedValue({ id: testModuleId })
      mockPrisma.completion.findUnique.mockResolvedValue(null)

      await request(app)
        .post(`/api/v1/modules/${testModuleId}/complete`)
        .set('Authorization', authToken)
        .send({ quizAnswers: [] })
        .expect(400)
    })

    it('should return 400 if module already completed', async () => {
      const { PrismaClient } = await import('@prisma/client')
      const mockPrisma = new PrismaClient() as any

      mockPrisma.module.findUnique.mockResolvedValue({ id: testModuleId })
      mockPrisma.completion.findUnique.mockResolvedValue({ score: 85 })

      const response = await request(app)
        .post(`/api/v1/modules/${testModuleId}/complete`)
        .set('Authorization', authToken)
        .send({ quizAnswers: [] })
        .expect(400)

      expect(response.body.message).toBe('Module already completed')
    })

    it('should validate request body', async () => {
      await request(app)
        .post(`/api/v1/modules/${testModuleId}/complete`)
        .set('Authorization', authToken)
        .send({ quizAnswers: 'invalid' })
        .expect(400)

      await request(app)
        .post(`/api/v1/modules/${testModuleId}/complete`)
        .set('Authorization', authToken)
        .send({})
        .expect(400)
    })
  })
})
