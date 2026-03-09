import { Router } from 'express'
import authRoutes from './v1/auth.routes'
import employerRoutes from './v1/employer.routes'
import moduleRoutes from './v1/modules.routes'
import rewardRoutes from './v1/rewards.routes'
import userRoutes from './v1/users.routes'

const router: Router = Router()

router.get('/', (_req, res) => {
  res.json({ message: 'API is running' })
})

router.use('/v1/auth', authRoutes)
router.use('/v1/users', userRoutes)
router.use('/v1/modules', moduleRoutes)
router.use('/v1/rewards', rewardRoutes)
router.use('/v1/employer', employerRoutes)

export default router
