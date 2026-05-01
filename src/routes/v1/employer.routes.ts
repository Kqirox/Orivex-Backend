import { Router } from 'express'
import { contactCandidate, getCandidateProfile, searchTalent } from '../../controllers/employer.controller'
import { authenticate, authorize } from '../../middleware/auth.middleware'
import { employerLimiter } from '../../middleware/rate-limit.middleware'

const router: Router = Router()

router.use(authenticate, authorize('employer'), employerLimiter)

// GET /employer/search - search talent with filters
router.get('/search', searchTalent)

// GET /employer/candidates/:id - candidate profile with verified credentials
router.get('/candidates/:id', getCandidateProfile)

// POST /employer/contact - record outreach attempt
router.post('/contact', contactCandidate)

export default router
