import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import app from '../../src/app'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

describe('Module Management Endpoints', () => {
  let authToken: string
  let testUser: any
  let testModule: any

  beforeEach(async () => {
    // Clean up test data
    await prisma.completion.deleteMany()
    await prisma.transaction.deleteMany()
    await prisma.module.deleteMany()
    await prisma.user.deleteMany({
      where: { email: { contains: 'test' } }
    })

    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: 'hashedpassword'
      }
    })

    // Create test module
    testModule = await prisma.module.create({
      data: {
        title: 'Test Module',
        description: 'A test module for testing',
        category: 'blockchain',
        difficulty: 'beginner',
        reward: 10.0
      }
    })

    // Get auth token (mock JWT for testing)
    authToken = 'Bearer mock-jwt-token'
    
    // Mock the authenticate middleware
    vi.mock('../../src/middleware/auth.middleware', () => ({
      authenticate: (req: any, res: any, next: any) => {
        req.user = { id: testUser.id, email: testUser.email, role: 'learner' }
        next()
      },
      optionalAuthenticate: (req: any, res: any, next: any) => {
        if (req.headers.authorization === authToken) {
          req.user = { id: testUser.id, email: testUser.email, role: 'learner' }
        }
        next()
      }
    }))
  })

  afterEach(async () => {
    // Clean up test data
    await prisma.completion.deleteMany()
    await prisma.transaction.deleteMany()
    await prisma.module.deleteMany()
    await prisma.user.deleteMany({
      where: { email: { contains: 'test' } }
    })
  })

  describe('GET /api/v1/modules', () => {
    it('should return paginated list of modules', async () => {
      const response = await request(app)
        .get('/api/v1/modules')
        .expect(200)

      expect(response.body).toHaveProperty('modules')
      expect(response.body).toHaveProperty('pagination')
      expect(response.body.modules).toBeInstanceOf(Array)
      expect(response.body.modules.length).toBeGreaterThan(0)
      expect(response.body.pagination).toHaveProperty('page')
      expect(response.body.pagination).toHaveProperty('limit')
      expect(response.body.pagination).toHaveProperty('total')
    })

    it('should filter modules by category', async () => {
      const response = await request(app)
        .get('/api/v1/modules?category=blockchain')
        .expect(200)

      expect(response.body.modules.every((module: any) => 
        module.category === 'blockchain'
      )).toBe(true)
    })

    it('should filter modules by difficulty', async () => {
      const response = await request(app)
        .get('/api/v1/modules?difficulty=beginner')
        .expect(200)

      expect(response.body.modules.every((module: any) => 
        module.difficulty === 'beginner'
      )).toBe(true)
    })

    it('should search modules by title and description', async () => {
      const response = await request(app)
        .get('/api/v1/modules?search=Test')
        .expect(200)

      expect(response.body.modules.length).toBeGreaterThan(0)
      expect(response.body.modules.some((module: any) => 
        module.title.includes('Test') || module.description.includes('Test')
      )).toBe(true)
    })

    it('should include user progress when authenticated', async () => {
      // Create a completion record
      await prisma.completion.create({
        data: {
          userId: testUser.id,
          moduleId: testModule.id,
          score: 85
        }
      })

      const response = await request(app)
        .get('/api/v1/modules')
        .set('Authorization', authToken)
        .expect(200)

      const moduleWithProgress = response.body.modules.find((m: any) => m.id === testModule.id)
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
      const response = await request(app)
        .get(`/api/v1/modules/${testModule.id}`)
        .expect(200)

      expect(response.body.id).toBe(testModule.id)
      expect(response.body.title).toBe(testModule.title)
      expect(response.body.description).toBe(testModule.description)
      expect(response.body.category).toBe(testModule.category)
      expect(response.body.difficulty).toBe(testModule.difficulty)
      expect(response.body.reward).toBe(testModule.reward)
      expect(response.body).toHaveProperty('completionCount')
    })

    it('should return 404 for non-existent module', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000'
      await request(app)
        .get(`/api/v1/modules/${fakeId}`)
        .expect(404)
    })

    it('should include user progress when authenticated', async () => {
      // Create a completion record
      await prisma.completion.create({
        data: {
          userId: testUser.id,
          moduleId: testModule.id,
          score: 90
        }
      })

      const response = await request(app)
        .get(`/api/v1/modules/${testModule.id}`)
        .set('Authorization', authToken)
        .expect(200)

      expect(response.body.userProgress).toBeTruthy()
      expect(response.body.userProgress.completed).toBe(true)
      expect(response.body.userProgress.score).toBe(90)
    })
  })

  describe('POST /api/v1/modules/:id/start', () => {
    it('should start tracking module progress', async () => {
      const response = await request(app)
        .post(`/api/v1/modules/${testModule.id}/start`)
        .set('Authorization', authToken)
        .expect(201)

      expect(response.body.message).toBe('Module started successfully')
      expect(response.body).toHaveProperty('completionId')
      expect(response.body).toHaveProperty('startedAt')

      // Verify completion record was created
      const completion = await prisma.completion.findUnique({
        where: {
          userId_moduleId: {
            userId: testUser.id,
            moduleId: testModule.id
          }
        }
      })
      expect(completion).toBeTruthy()
      expect(completion?.score).toBeNull() // null indicates in progress
    })

    it('should return 401 for unauthenticated request', async () => {
      await request(app)
        .post(`/api/v1/modules/${testModule.id}/start`)
        .expect(401)
    })

    it('should return 404 for non-existent module', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000'
      await request(app)
        .post(`/api/v1/modules/${fakeId}/start`)
        .set('Authorization', authToken)
        .expect(404)
    })

    it('should return 400 if module already started', async () => {
      // Start the module first
      await request(app)
        .post(`/api/v1/modules/${testModule.id}/start`)
        .set('Authorization', authToken)
        .expect(201)

      // Try to start again
      const response = await request(app)
        .post(`/api/v1/modules/${testModule.id}/start`)
        .set('Authorization', authToken)
        .expect(400)

      expect(response.body.message).toBe('Module already started or completed')
      expect(response.body.status).toBe('in_progress')
    })
  })

  describe('POST /api/v1/modules/:id/complete', () => {
    beforeEach(async () => {
      // Start the module before each completion test
      await prisma.completion.create({
        data: {
          userId: testUser.id,
          moduleId: testModule.id,
          score: null // in progress
        }
      })
    })

    it('should complete module with quiz answers', async () => {
      const quizAnswers = [
        { questionId: 'q1', answer: 'answer1' },
        { questionId: 'q2', answer: 'answer2' }
      ]

      const response = await request(app)
        .post(`/api/v1/modules/${testModule.id}/complete`)
        .set('Authorization', authToken)
        .send({ quizAnswers })
        .expect(200)

      expect(response.body.message).toBe('Module completed successfully')
      expect(response.body).toHaveProperty('score')
      expect(response.body).toHaveProperty('isEligibleForReward')
      expect(response.body).toHaveProperty('reward')
      expect(response.body).toHaveProperty('completedAt')

      // Verify completion record was updated
      const completion = await prisma.completion.findUnique({
        where: {
          userId_moduleId: {
            userId: testUser.id,
            moduleId: testModule.id
          }
        }
      })
      expect(completion?.score).toBeGreaterThan(0)
      expect(completion?.completedAt).toBeTruthy()
    })

    it('should create reward transaction for eligible scores', async () => {
      const quizAnswers = [
        { questionId: 'q1', answer: 'answer1' }
      ]

      const response = await request(app)
        .post(`/api/v1/modules/${testModule.id}/complete`)
        .set('Authorization', authToken)
        .send({ quizAnswers })
        .expect(200)

      expect(response.body.isEligibleForReward).toBe(true)
      expect(response.body.reward).toBe(testModule.reward)
      expect(response.body).toHaveProperty('rewardTransaction')

      // Verify reward transaction was created
      const transaction = await prisma.transaction.findFirst({
        where: {
          userId: testUser.id,
          type: 'reward'
        }
      })
      expect(transaction).toBeTruthy()
      expect(transaction?.amount).toBe(testModule.reward)
      expect(transaction?.status).toBe('pending')
    })

    it('should return 401 for unauthenticated request', async () => {
      await request(app)
        .post(`/api/v1/modules/${testModule.id}/complete`)
        .send({ quizAnswers: [] })
        .expect(401)
    })

    it('should return 404 for non-existent module', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000'
      await request(app)
        .post(`/api/v1/modules/${fakeId}/complete`)
        .set('Authorization', authToken)
        .send({ quizAnswers: [] })
        .expect(404)
    })

    it('should return 400 if module not started', async () => {
      // Delete the completion record
      await prisma.completion.delete({
        where: {
          userId_moduleId: {
            userId: testUser.id,
            moduleId: testModule.id
          }
        }
      })

      await request(app)
        .post(`/api/v1/modules/${testModule.id}/complete`)
        .set('Authorization', authToken)
        .send({ quizAnswers: [] })
        .expect(400)
    })

    it('should return 400 if module already completed', async () => {
      // Complete the module first
      await prisma.completion.update({
        where: {
          userId_moduleId: {
            userId: testUser.id,
            moduleId: testModule.id
          }
        },
        data: {
          score: 85,
          completedAt: new Date()
        }
      })

      const response = await request(app)
        .post(`/api/v1/modules/${testModule.id}/complete`)
        .set('Authorization', authToken)
        .send({ quizAnswers: [] })
        .expect(400)

      expect(response.body.message).toBe('Module already completed')
    })

    it('should validate request body', async () => {
      await request(app)
        .post(`/api/v1/modules/${testModule.id}/complete`)
        .set('Authorization', authToken)
        .send({ quizAnswers: 'invalid' })
        .expect(400)

      await request(app)
        .post(`/api/v1/modules/${testModule.id}/complete`)
        .set('Authorization', authToken)
        .send({})
        .expect(400)
    })
  })
})
