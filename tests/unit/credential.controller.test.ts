import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Request, Response } from 'express'
import { CredentialController } from '../../src/controllers/credential.controller'
import { prisma } from '../../src/config/database'

vi.mock('../../src/config/database', () => ({
  prisma: {
    credential: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}))

// Mock stellarService so verifyCredential tests don't hit the network
vi.mock('../../src/services/stellar.service', () => ({
  stellarService: {
    verifyCredential: vi.fn(),
  },
  StellarServiceError: class StellarServiceError extends Error {
    constructor(
      message: string,
      public readonly code: string,
    ) {
      super(message)
      this.name = 'StellarServiceError'
    }
  },
}))

interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
  }
}

describe('CredentialController', () => {
  let credentialController: CredentialController
  let mockRequest: Partial<AuthRequest>
  let mockResponse: Partial<Response>
  let mockNext: any

  beforeEach(() => {
    credentialController = new CredentialController()
    mockRequest = {
      query: {},
      params: {},
    }
    mockResponse = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    }
    mockNext = vi.fn()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getUserCredentials', () => {
    it('should return user credentials with pagination', async () => {
      const mockCredentials = [
        {
          id: 'cred-1',
          userId: 'user-1',
          moduleId: 'module-1',
          onChainId: 'chain-1',
          issuedAt: new Date('2024-01-01'),
          user: {
            id: 'user-1',
            username: 'John Doe',
            email: 'john@example.com',
          },
          module: {
            id: 'module-1',
            title: 'JavaScript Basics',
            description: 'Learn JS',
            category: 'Programming',
            difficulty: 'easy',
          },
        },
      ]

      mockRequest.user = { id: 'user-1', email: 'john@example.com' }
      vi.mocked(prisma.credential.count).mockResolvedValue(1)
      vi.mocked(prisma.credential.findMany).mockResolvedValue(mockCredentials as any)

      await credentialController.getUserCredentials(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      )

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(prisma.credential.count).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      })
      expect(prisma.credential.findMany).toHaveBeenCalled()
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            id: 'cred-1',
            moduleName: 'JavaScript Basics',
            onChainId: 'chain-1',
          }),
        ]),
        meta: expect.objectContaining({
          page: 1,
          limit: 10,
          total: 1,
        }),
      })
    })

    it('should filter credentials by moduleId', async () => {
      mockRequest.user = { id: 'user-1', email: 'john@example.com' }
      mockRequest.query = { moduleId: 'module-1' }

      vi.mocked(prisma.credential.count).mockResolvedValue(0)
      vi.mocked(prisma.credential.findMany).mockResolvedValue([])

      await credentialController.getUserCredentials(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      )

      expect(prisma.credential.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', moduleId: 'module-1' },
      })
    })

    it('should filter credentials by date range', async () => {
      mockRequest.user = { id: 'user-1', email: 'john@example.com' }
      mockRequest.query = {
        fromDate: '2024-01-01T00:00:00Z',
        toDate: '2024-12-31T23:59:59Z',
      }

      vi.mocked(prisma.credential.count).mockResolvedValue(0)
      vi.mocked(prisma.credential.findMany).mockResolvedValue([])

      await credentialController.getUserCredentials(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      )

      expect(prisma.credential.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          issuedAt: {
            gte: new Date('2024-01-01T00:00:00Z'),
            lte: new Date('2024-12-31T23:59:59Z'),
          },
        },
      })
    })

    it('should throw error for invalid date format', async () => {
      mockRequest.user = { id: 'user-1', email: 'john@example.com' }
      mockRequest.query = { fromDate: 'invalid-date' }

      await credentialController.getUserCredentials(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      )

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Invalid fromDate format' })
      )
    })

    it('should throw error if user is not authenticated', async () => {
      mockRequest.user = undefined

      await credentialController.getUserCredentials(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      )

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'User ID not found' })
      )
    })

    it('should handle pagination correctly', async () => {
      mockRequest.user = { id: 'user-1', email: 'john@example.com' }
      mockRequest.query = { page: '2', limit: '5' }

      vi.mocked(prisma.credential.count).mockResolvedValue(15)
      vi.mocked(prisma.credential.findMany).mockResolvedValue([])

      await credentialController.getUserCredentials(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      )

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(prisma.credential.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          take: 5,
        })
      )
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({
            page: 2,
            limit: 5,
            total: 15,
            totalPages: 3,
            hasNextPage: true,
            hasPrevPage: true,
          }),
        })
      )
    })
  })

  describe('getCredentialById', () => {
    it('should return credential details for owner', async () => {
      const mockCredential = {
        id: 'cred-1',
        userId: 'user-1',
        moduleId: 'module-1',
        onChainId: 'chain-1',
        issuedAt: new Date('2024-01-01'),
        user: {
          id: 'user-1',
          username: 'John Doe',
          email: 'john@example.com',
        },
        module: {
          id: 'module-1',
          title: 'JavaScript Basics',
          description: 'Learn JS fundamentals',
          category: 'Programming',
          difficulty: 'easy',
          reward: 100,
        },
      }

      mockRequest.user = { id: 'user-1', email: 'john@example.com' }
      mockRequest.params = { id: 'cred-1' }
      vi.mocked(prisma.credential.findUnique).mockResolvedValue(mockCredential as any)

      await credentialController.getCredentialById(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      )

      expect(prisma.credential.findUnique).toHaveBeenCalledWith({
        where: { id: 'cred-1' },
        include: expect.any(Object),
      })
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: 'cred-1',
          holderName: 'John Doe',
          moduleName: 'JavaScript Basics',
          onChainId: 'chain-1',
        }),
      })
    })

    it('should throw error if credential not found', async () => {
      mockRequest.user = { id: 'user-1', email: 'john@example.com' }
      mockRequest.params = { id: 'non-existent' }
      vi.mocked(prisma.credential.findUnique).mockResolvedValue(null)

      await credentialController.getCredentialById(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      )

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Credential not found' })
      )
    })

    it('should throw error if user does not own credential', async () => {
      const mockCredential = {
        id: 'cred-1',
        userId: 'user-2',
        moduleId: 'module-1',
        onChainId: 'chain-1',
        issuedAt: new Date(),
        user: { id: 'user-2', username: 'Jane Doe', email: 'jane@example.com' },
        module: {
          id: 'module-1',
          title: 'Test',
          description: 'Test',
          category: 'Test',
          difficulty: 'easy',
          reward: 100,
        },
      }

      mockRequest.user = { id: 'user-1', email: 'john@example.com' }
      mockRequest.params = { id: 'cred-1' }
      vi.mocked(prisma.credential.findUnique).mockResolvedValue(mockCredential as any)

      await credentialController.getCredentialById(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      )

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'You do not have access to this credential' })
      )
    })

    it('should throw error if user is not authenticated', async () => {
      mockRequest.user = undefined
      mockRequest.params = { id: 'cred-1' }

      await credentialController.getCredentialById(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      )

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'User ID not found' })
      )
    })
  })

  describe('verifyCredential', () => {
    // Import the mocked stellarService for assertions
    const getStellarMock = async () => {
      const mod = await import('../../src/services/stellar.service')

      return mod.stellarService
    }

    it('should call stellarService.verifyCredential when onChainId is present', async () => {
      const mockCredential = {
        id: 'cred-1',
        userId: 'user-1',
        moduleId: 'module-1',
        onChainId: 'chain-1',
        issuedAt: new Date('2024-01-01'),
        user: { id: 'user-1', username: 'John Doe' },
        module: { id: 'module-1', title: 'JavaScript Basics', category: 'Programming', difficulty: 'easy' },
      }

      const stellar = await getStellarMock()
      ;(stellar.verifyCredential as ReturnType<typeof vi.fn>).mockResolvedValue({
        isValid: true,
        credentialId: 'chain-1',
        issuer: 'GABC',
        recipient: 'GXYZ',
        credentialType: 'module',
        issuedAt: 0,
        data: {},
      })

      mockRequest.params = { onChainId: 'chain-1' }
      vi.mocked(prisma.credential.findFirst).mockResolvedValue(mockCredential as any)

      await credentialController.verifyCredential(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      )
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(stellar.verifyCredential).toHaveBeenCalledWith('chain-1')
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          valid: true,
          verification: expect.objectContaining({ status: 'verified' }),
        }),
      })
    })

    it('should return valid:false and status:unverified when stellarService returns isValid:false', async () => {
      const mockCredential = {
        id: 'cred-1',
        userId: 'user-1',
        moduleId: 'module-1',
        onChainId: 'chain-revoked',
        issuedAt: new Date(),
        user: { id: 'user-1', username: 'John Doe' },
        module: { id: 'module-1', title: 'JS Basics', category: 'Programming', difficulty: 'easy' },
      }

      const stellar = await getStellarMock()
      ;(stellar.verifyCredential as ReturnType<typeof vi.fn>).mockResolvedValue({
        isValid: false,
        credentialId: 'chain-revoked',
        issuer: '',
        recipient: '',
        credentialType: '',
        issuedAt: 0,
        data: {},
      })

      mockRequest.params = { onChainId: 'chain-revoked' }
      vi.mocked(prisma.credential.findFirst).mockResolvedValue(mockCredential as any)

      await credentialController.verifyCredential(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      )
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          valid: false,
          verification: expect.objectContaining({ status: 'unverified' }),
        }),
      })
    })

    it('should return valid:false and status:unverified when onChainId is null', async () => {
      const mockCredential = {
        id: 'cred-1',
        userId: 'user-1',
        moduleId: 'module-1',
        onChainId: null,
        issuedAt: new Date('2024-01-01'),
        user: { id: 'user-1', username: 'John Doe' },
        module: { id: 'module-1', title: 'JavaScript Basics', category: 'Programming', difficulty: 'easy' },
      }

      const stellar = await getStellarMock()

      mockRequest.params = { onChainId: 'cred-1' }
      vi.mocked(prisma.credential.findFirst).mockResolvedValue(null)
      vi.mocked(prisma.credential.findUnique).mockResolvedValue(mockCredential as any)

      await credentialController.verifyCredential(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      )
      await new Promise((resolve) => setTimeout(resolve, 10))

      // stellarService must NOT be called for a credential with no onChainId
      expect(stellar.verifyCredential).not.toHaveBeenCalled()
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          valid: false,
          verification: expect.objectContaining({
            status: 'unverified',
            onChainId: null,
          }),
        }),
      })
    })

    it('should fail closed (valid:false, status:error) when Soroban contract is not configured', async () => {
      const mockCredential = {
        id: 'cred-1',
        userId: 'user-1',
        moduleId: 'module-1',
        onChainId: 'chain-1',
        issuedAt: new Date(),
        user: { id: 'user-1', username: 'John Doe' },
        module: { id: 'module-1', title: 'Test', category: 'Test', difficulty: 'easy' },
      }

      const stellar = await getStellarMock()
      const { StellarServiceError } = await import('../../src/services/stellar.service')
      ;(stellar.verifyCredential as ReturnType<typeof vi.fn>).mockRejectedValue(
        new StellarServiceError('No Soroban contract ID configured', 'CONTRACT_NOT_CONFIGURED'),
      )

      mockRequest.params = { onChainId: 'chain-1' }
      vi.mocked(prisma.credential.findFirst).mockResolvedValue(mockCredential as any)

      await credentialController.verifyCredential(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      )
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          valid: false,
          verification: expect.objectContaining({ status: 'error' }),
        }),
      })
    })

    it('should throw error if credential not found', async () => {
      mockRequest.params = { onChainId: 'non-existent' }
      vi.mocked(prisma.credential.findFirst).mockResolvedValue(null)
      vi.mocked(prisma.credential.findUnique).mockResolvedValue(null)

      await credentialController.verifyCredential(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      )
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Credential not found or invalid' }),
      )
    })

    it('should not require authentication', async () => {
      const mockCredential = {
        id: 'cred-1',
        userId: 'user-1',
        moduleId: 'module-1',
        onChainId: 'chain-1',
        issuedAt: new Date(),
        user: { id: 'user-1', username: 'John Doe' },
        module: { id: 'module-1', title: 'Test', category: 'Test', difficulty: 'easy' },
      }

      const stellar = await getStellarMock()
      ;(stellar.verifyCredential as ReturnType<typeof vi.fn>).mockResolvedValue({
        isValid: true, credentialId: 'chain-1', issuer: '', recipient: '', credentialType: '', issuedAt: 0, data: {},
      })

      mockRequest.user = undefined
      mockRequest.params = { onChainId: 'chain-1' }
      vi.mocked(prisma.credential.findFirst).mockResolvedValue(mockCredential as any)

      await credentialController.verifyCredential(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      )
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockResponse.json).toHaveBeenCalled()
    })

    it('should never return valid:true without calling stellarService', async () => {
      const mockCredential = {
        id: 'cred-1',
        userId: 'user-1',
        moduleId: 'module-1',
        onChainId: 'chain-1',
        issuedAt: new Date(),
        user: { id: 'user-1', username: 'John Doe' },
        module: { id: 'module-1', title: 'Test', category: 'Test', difficulty: 'easy' },
      }

      const stellar = await getStellarMock()
      // Simulate stellar returning invalid
      ;(stellar.verifyCredential as ReturnType<typeof vi.fn>).mockResolvedValue({
        isValid: false, credentialId: 'chain-1', issuer: '', recipient: '', credentialType: '', issuedAt: 0, data: {},
      })

      mockRequest.params = { onChainId: 'chain-1' }
      vi.mocked(prisma.credential.findFirst).mockResolvedValue(mockCredential as any)

      await credentialController.verifyCredential(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      )
      await new Promise((resolve) => setTimeout(resolve, 10))

      // stellarService must have been called
      expect(stellar.verifyCredential).toHaveBeenCalled()
      // The response must NOT claim valid:true if stellar says false
      const jsonArg = (mockResponse.json as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(jsonArg.data.valid).toBe(false)
    })
  })
})
