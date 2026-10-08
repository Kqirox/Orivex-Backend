import { Router } from 'express'
import { AuthController } from '../../controllers/auth.controller'
import { authLimiter } from '../../middleware/rate-limit.middleware'

const router: Router = Router()
const authController = new AuthController()

/**
 * @route POST /api/v1/auth/register
 * @desc Register a new user
 * @access Public
 */
router.post(
  '/register',
  authLimiter,
  authController.register.bind(authController),
)

/**
 * @route POST /api/v1/auth/login
 * @desc Login user
 * @access Public
 */
router.post(
  '/login',
  authLimiter,
  authController.login.bind(authController),
)

/**
 * @route POST /api/v1/auth/logout
 * @desc Logout user
 * @access Public
 */
router.post('/logout', authController.logout.bind(authController))

export default router
