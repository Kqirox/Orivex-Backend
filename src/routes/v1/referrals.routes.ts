import { Router } from 'express'
import { ReferralController } from '../../controllers/referral.controller'
import { authenticate } from '../../middleware/auth.middleware'

const router: Router = Router()
const referralController = new ReferralController()

/**
 * @route   POST /api/v1/referrals/code
 * @desc    Generate a unique referral code for the authenticated user
 * @access  Private
 */
router.post(
  '/code',
  authenticate,
  referralController.generateCode.bind(referralController),
)

/**
 * @route   POST /api/v1/referrals/apply
 * @desc    Apply a referral code during signup or onboarding
 * @body    code - The referral code to apply (required)
 * @access  Private
 */
router.post(
  '/apply',
  authenticate,
  referralController.applyCode.bind(referralController),
)

/**
 * @route   GET /api/v1/referrals/stats
 * @desc    Get referral stats: count, active referrals, earned bonuses
 * @access  Private
 */
router.get(
  '/stats',
  authenticate,
  referralController.getStats.bind(referralController),
)

export default router
