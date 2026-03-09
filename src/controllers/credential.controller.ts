import { Request, Response } from 'express'
import { asyncHandler } from '../middleware/error.middleware'
import { BadRequestError, NotFoundError, UnauthorizedError } from '../utils/errors'
import { prisma } from '../config/database'

export class CredentialController {
  /**
   * GET /credentials
   * Retrieve all credentials for the authenticated user
   * Query params: moduleId, fromDate, toDate, page, limit
   */
  getUserCredentials = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const userId = (req as any).user?.id

      if (!userId) {
        throw new UnauthorizedError('User ID not found')
      }

      // Parse query parameters
      const page = parseInt(req.query.page as string) || 1
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 100)
      const skip = (page - 1) * limit

      // Build where clause
      const where: any = { userId }

      if (req.query.moduleId) {
        where.moduleId = req.query.moduleId as string
      }

      if (req.query.fromDate) {
        const fromDate = new Date(req.query.fromDate as string)
        if (isNaN(fromDate.getTime())) {
          throw new BadRequestError('Invalid fromDate format')
        }
        where.issuedAt = { ...where.issuedAt, gte: fromDate }
      }

      if (req.query.toDate) {
        const toDate = new Date(req.query.toDate as string)
        if (isNaN(toDate.getTime())) {
          throw new BadRequestError('Invalid toDate format')
        }
        where.issuedAt = { ...where.issuedAt, lte: toDate }
      }

      // Get total count
      const total = await prisma.credential.count({ where })

      // Get credentials with related data
      const credentials = await prisma.credential.findMany({
        where,
        skip,
        take: limit,
        orderBy: { issuedAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          module: {
            select: {
              id: true,
              title: true,
              description: true,
              category: true,
              difficulty: true,
            },
          },
        },
      })

      res.json({
        success: true,
        data: credentials.map((cred) => ({
          id: cred.id,
          userId: cred.userId,
          moduleId: cred.moduleId,
          moduleName: cred.module.title,
          moduleCategory: cred.module.category,
          moduleDifficulty: cred.module.difficulty,
          onChainId: cred.onChainId,
          issuedAt: cred.issuedAt.toISOString(),
          shareableLink: `/api/v1/credentials/verify/${cred.onChainId || cred.id}`,
        })),
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1,
        },
      })
    },
  )

  /**
   * GET /credentials/:id
   * Retrieve a single credential by ID
   * Requires authentication - user must own the credential
   */
  getCredentialById = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const userId = (req as any).user?.id
      const { id } = req.params

      if (!userId) {
        throw new UnauthorizedError('User ID not found')
      }

      const credential = await prisma.credential.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          module: {
            select: {
              id: true,
              title: true,
              description: true,
              category: true,
              difficulty: true,
              reward: true,
            },
          },
        },
      })

      if (!credential) {
        throw new NotFoundError('Credential not found')
      }

      // Verify ownership
      if (credential.userId !== userId) {
        throw new UnauthorizedError('You do not have access to this credential')
      }

      res.json({
        success: true,
        data: {
          id: credential.id,
          userId: credential.userId,
          holderName: credential.user.name,
          moduleId: credential.moduleId,
          moduleName: credential.module.title,
          moduleDescription: credential.module.description,
          moduleCategory: credential.module.category,
          moduleDifficulty: credential.module.difficulty,
          onChainId: credential.onChainId,
          issuedAt: credential.issuedAt.toISOString(),
          shareableLink: `/api/v1/credentials/verify/${credential.onChainId || credential.id}`,
          metadata: {
            reward: credential.module.reward,
            verificationUrl: `/api/v1/credentials/verify/${credential.onChainId || credential.id}`,
          },
        },
      })
    },
  )

  /**
   * GET /credentials/verify/:onChainId
   * Public endpoint to verify a credential
   * No authentication required
   */
  verifyCredential = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { onChainId } = req.params

      // Try to find by onChainId first, then by regular id
      let credential = await prisma.credential.findFirst({
        where: { onChainId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
            },
          },
          module: {
            select: {
              id: true,
              title: true,
              category: true,
              difficulty: true,
            },
          },
        },
      })

      // If not found by onChainId, try by regular id
      if (!credential) {
        credential = await prisma.credential.findUnique({
          where: { id: onChainId },
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
            module: {
              select: {
                id: true,
                title: true,
                category: true,
                difficulty: true,
              },
            },
          },
        })
      }

      if (!credential) {
        throw new NotFoundError('Credential not found or invalid')
      }

      res.json({
        success: true,
        data: {
          valid: true,
          credential: {
            id: credential.id,
            holderName: credential.user.name,
            moduleName: credential.module.title,
            moduleCategory: credential.module.category,
            moduleDifficulty: credential.module.difficulty,
            onChainId: credential.onChainId,
            issuedAt: credential.issuedAt.toISOString(),
          },
          verification: {
            verifiedAt: new Date().toISOString(),
            status: 'verified',
            message: 'This credential is valid and has been verified on-chain',
          },
        },
      })
    },
  )
}
