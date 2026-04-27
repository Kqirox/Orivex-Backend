import { Request, Response } from 'express'
import { randomBytes } from 'crypto'
import prisma from '../config/database'
import { asyncHandler } from '../middleware/error.middleware'
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError } from '../utils/errors'

const REFERRAL_BONUS_AMOUNT = 5.0
const CODE_BYTES = 4

export class ReferralController {
  /**
   * @openapi
   * /referrals/code:
   *   post:
   *     summary: Generate a unique referral code for the authenticated user
   *     tags: [Referrals]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       201:
   *         description: Referral code generated
   *       409:
   *         description: User already has a referral code
   *       401:
   *         description: Unauthorized
   */
  generateCode = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = (req as any).user?.id
    if (!userId) throw new UnauthorizedError('User ID not found')

    const existing = await prisma.referralCode.findUnique({ where: { userId } })
    if (existing) {
      res.status(200).json({
        success: true,
        message: 'Referral code already exists',
        data: { code: existing.code },
      })
      return
    }

    const code = await this.generateUniqueCode()
    const referralCode = await prisma.referralCode.create({
      data: { code, userId },
    })

    res.status(201).json({
      success: true,
      message: 'Referral code generated successfully',
      data: { code: referralCode.code },
    })
  })

  /**
   * @openapi
   * /referrals/apply:
   *   post:
   *     summary: Apply a referral code during signup or onboarding
   *     tags: [Referrals]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [code]
   *             properties:
   *               code:
   *                 type: string
   *     responses:
   *       201:
   *         description: Referral applied successfully
   *       400:
   *         description: Invalid or self-referral code
   *       409:
   *         description: User has already used a referral code
   */
  applyCode = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = (req as any).user?.id
    if (!userId) throw new UnauthorizedError('User ID not found')

    const { code } = req.body
    if (!code || typeof code !== 'string') {
      throw new BadRequestError('Referral code is required')
    }

    const referralCode = await prisma.referralCode.findUnique({ where: { code } })
    if (!referralCode) throw new NotFoundError('Referral code not found')

    if (referralCode.userId === userId) {
      throw new BadRequestError('Self-referrals are not allowed')
    }

    const alreadyReferred = await prisma.referral.findUnique({ where: { referreeId: userId } })
    if (alreadyReferred) throw new ConflictError('You have already used a referral code')

    const alreadyUsedThisCode = await prisma.referral.findFirst({
      where: { referrerId: referralCode.userId, referreeId: userId },
    })
    if (alreadyUsedThisCode) throw new ConflictError('This referral code has already been applied')

    const referral = await prisma.referral.create({
      data: {
        referrerId: referralCode.userId,
        referreeId: userId,
        codeId: referralCode.id,
      },
    })

    res.status(201).json({
      success: true,
      message: 'Referral code applied successfully',
      data: { referralId: referral.id },
    })
  })

  /**
   * @openapi
   * /referrals/stats:
   *   get:
   *     summary: Get referral stats for the authenticated user
   *     tags: [Referrals]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Referral stats retrieved successfully
   *       401:
   *         description: Unauthorized
   */
  getStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = (req as any).user?.id
    if (!userId) throw new UnauthorizedError('User ID not found')

    const referrals = await prisma.referral.findMany({
      where: { referrerId: userId },
      include: {
        referree: {
          select: { completions: { take: 1 } },
        },
      },
    })

    const totalReferrals = referrals.length
    const activeReferrals = referrals.filter((r) => r.referree.completions.length > 0).length
    const paidBonuses = referrals.filter((r) => r.bonusPaid)
    const earnedBonuses = paidBonuses.reduce((sum, r) => sum + (r.bonusAmount ?? 0), 0)

    res.status(200).json({
      success: true,
      data: {
        totalReferrals,
        activeReferrals,
        earnedBonuses,
        pendingBonuses: (totalReferrals - paidBonuses.length) * REFERRAL_BONUS_AMOUNT,
      },
    })
  })

  /**
   * Called internally when a referree completes their first module to unlock the referrer bonus.
   */
  static async processReferralBonus(referreeId: string): Promise<void> {
    const referral = await prisma.referral.findUnique({
      where: { referreeId },
    })

    if (!referral || referral.bonusPaid) return

    const completionCount = await prisma.completion.count({ where: { userId: referreeId } })
    if (completionCount < 1) return

    await prisma.referral.update({
      where: { id: referral.id },
      data: {
        bonusPaid: true,
        bonusAmount: REFERRAL_BONUS_AMOUNT,
        bonusPaidAt: new Date(),
      },
    })

    await prisma.transaction.create({
      data: {
        userId: referral.referrerId,
        amount: REFERRAL_BONUS_AMOUNT,
        type: 'referral_reward',
        status: 'completed',
      },
    })
  }

  private async generateUniqueCode(): Promise<string> {
    let code: string
    let exists: boolean

    do {
      code = randomBytes(CODE_BYTES).toString('hex').toUpperCase()
      const found = await prisma.referralCode.findUnique({ where: { code } })
      exists = !!found
    } while (exists)

    return code
  }
}
