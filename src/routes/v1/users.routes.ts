import express, { Router } from 'express'
import { z } from 'zod'
import { UserController } from '../../controllers/user.controller'
import { authenticate } from '../../middleware/auth.middleware'
import { validateProfileUpdate, validatePasswordChange, validateWalletAddress, validate, commonSchemas } from '../../middleware/validation.middleware'

const router: express.Router = Router()
const userController = new UserController()

const userIdParamSchema = z.object({
  id: commonSchemas.id,
})

router.get('/me', authenticate, userController.getCurrentUser.bind(userController))

router.patch('/me', authenticate, validateProfileUpdate, userController.updateProfile.bind(userController))

router.get('/:id', validate({ params: userIdParamSchema }), userController.getUserById.bind(userController))

router.patch('/password', authenticate, validatePasswordChange, userController.changePassword.bind(userController))

router.patch('/wallet', authenticate, validateWalletAddress, userController.updateWalletAddress.bind(userController))

export default router
