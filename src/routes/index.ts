import { Router } from 'express'
import userRoutes from './v1/users.routes'
import authRoutes from './v1/auth.routes'

const router: Router = Router()

router.get('/', (req, res) => {
  res.json({ message: 'API is running' })
})

router.use('/v1/users', userRoutes)
router.use('/v1/auth', authRoutes)

export default router
import express, { Router } from 'express'
import userRoutes from './v1/users.routes'  
import rewardRoutes from './v1/rewards.routes'
import moduleRoutes from './v1/modules.routes'
 
const router: express.Router = Router()

router.get('/', (req, res) => {
  res.json({ message: 'API is running' })
})

router.use('/v1/users', userRoutes) 
router.use('/v1/rewards', rewardRoutes)
router.use('/v1/modules', moduleRoutes)

export default router 
