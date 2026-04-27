import { Router } from 'express'
import { SyncController } from '../../controllers/sync.controller'
import { authenticate } from '../../middleware/auth.middleware'
import { authenticatedLimiter } from '../../middleware/rate-limit.middleware'

const router = Router()
const syncController = new SyncController()

/**
 * @route   POST /api/v1/sync/progress
 * @desc    Upload batched offline progress events
 * @body    events - Array of progress events with idempotencyKey, deviceId, moduleId, progressPercent, clientTimestamp, syncVersion
 * @access  Private
 */
router.post(
  '/progress',
  authenticate,
  authenticatedLimiter,
  syncController.syncProgress.bind(syncController),
)

/**
 * @route   POST /api/v1/sync/completions
 * @desc    Reconcile offline quiz/completion attempts
 * @body    events - Array of completion events with idempotencyKey, deviceId, moduleId, score, clientTimestamp, syncVersion
 * @access  Private
 */
router.post(
  '/completions',
  authenticate,
  authenticatedLimiter,
  syncController.syncCompletions.bind(syncController),
)

export default router
