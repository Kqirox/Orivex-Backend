import { Request, Response } from 'express'

/** Sentinel score while a module is started but not yet completed (schema uses non-null Float). */
const COMPLETION_IN_PROGRESS_SCORE = -1
import { z } from 'zod'
import { prisma } from '../config/database'
import { NotificationService } from '../services/notification.service'
import { WebhookService } from '../services/webhook.service'
import { ReferralController } from './referral.controller'

const notificationService = new NotificationService()
const webhookService = new WebhookService()

// Query parameter schemas for validation
const listModulesSchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val) : 1),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 10),
  category: z.string().optional(),
  difficulty: z.string().optional(),
  search: z.string().optional(),
})


const completeModuleSchema = z.object({
  quizAnswers: z.array(z.object({
    questionId: z.string(),
    answer: z.string(),
  })),
})

/**
 * @openapi
 * /modules:
 *   get:
 *     summary: List modules with filters and pagination
 *     tags: [Modules]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: difficulty
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of modules retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ModuleList'
 *       400:
 *         description: Invalid query parameters
 */
export const listModules = async (req: Request, res: Response) => {
  try {
    const queryValidation = listModulesSchema.safeParse(req.query)
    if (!queryValidation.success) {
      return res.status(400).json({
        message: 'Invalid query parameters',
        errors: queryValidation.error.errors
      })
    }

    const { page, limit, category, difficulty, search } = queryValidation.data
    const skip = (page - 1) * limit

    // Build where clause for filters
    const where: any = {}

    if (category) {
      where.category = category
    }

    if (difficulty) {
      where.difficulty = difficulty
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ]
    }

    // Get total count for pagination
    const total = await prisma.module.count({ where })

    // Get modules with pagination
    const modules = await prisma.module.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            completions: true
          }
        }
      }
    })

    // If user is authenticated, include their progress
    const userProgress: any = {}
    if (req.user) {
      const userCompletions = await prisma.completion.findMany({
        where: { userId: req.user.id },
        select: { moduleId: true, score: true, completedAt: true }
      })
      
      userCompletions.forEach((completion: any) => {
        userProgress[completion.moduleId] = {
          completed: true,
          score: completion.score,
          completedAt: completion.completedAt
        }
      })
    }

    // Transform response
    const transformedModules = modules.map((module: any) => ({
      id: module.id,
      title: module.title,
      description: module.description,
      category: module.category,
      difficulty: module.difficulty,
      reward: module.reward,
      createdAt: module.createdAt,
      updatedAt: module.updatedAt,
      completionCount: module._count.completions,
      userProgress: userProgress[module.id] || null
    }))

    res.json({
      modules: transformedModules,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    })

  } catch (error) {
    console.error('Error listing modules:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}

/**
 * @openapi
 * /modules/{id}:
 *   get:
 *     summary: Get module details
 *     tags: [Modules]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Module details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Module'
 *       404:
 *         description: Module not found
 */
export const getModuleById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const module = await prisma.module.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            completions: true
          }
        }
      }
    })

    if (!module) {
      return res.status(404).json({ message: 'Module not found' })
    }

    // Get user's progress if authenticated
    let userProgress = null
    if (req.user) {
      const completion = await prisma.completion.findUnique({
        where: {
          userId_moduleId: {
            userId: req.user.id,
            moduleId: id
          }
        }
      })
      
      if (completion) {
        userProgress = {
          completed: true,
          score: completion.score,
          completedAt: completion.completedAt
        }
      }
    }

    const response = {
      id: module.id,
      title: module.title,
      description: module.description,
      category: module.category,
      difficulty: module.difficulty,
      reward: module.reward,
      createdAt: module.createdAt,
      updatedAt: module.updatedAt,
      completionCount: module._count.completions,
      userProgress
    }

    res.json(response)

  } catch (error) {
    console.error('Error getting module:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}

/**
 * @openapi
 * /modules/{id}/start:
 *   post:
 *     summary: Start a module
 *     tags: [Modules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Module started successfully
 *       400:
 *         description: Module already started or completed
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Module not found
 */
export const startModule = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' })
    }

    const { id } = req.params

    // Check if module exists
    const module = await prisma.module.findUnique({
      where: { id }
    })

    if (!module) {
      return res.status(404).json({ message: 'Module not found' })
    }

    // Check if user already has a completion record
    const existingCompletion = await prisma.completion.findUnique({
      where: {
        userId_moduleId: {
          userId: req.user.id,
          moduleId: id
        }
      }
    })

    if (existingCompletion) {
      return res.status(400).json({
        message: 'Module already started or completed',
        status:
          existingCompletion.score >= 0 ? 'completed' : 'in_progress',
      })
    }

    // Create completion record with sentinel score until quiz is submitted
    const completion = await prisma.completion.create({
      data: {
        userId: req.user.id,
        moduleId: id,
        score: COMPLETION_IN_PROGRESS_SCORE,
      },
    })

    res.status(201).json({
      message: 'Module started successfully',
      completionId: completion.id,
      startedAt: completion.createdAt
    })

  } catch (error) {
    console.error('Error starting module:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}

/**
 * @openapi
 * /modules/{id}/complete:
 *   post:
 *     summary: Complete a module with quiz answers
 *     tags: [Modules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CompleteModuleInput'
 *     responses:
 *       200:
 *         description: Module completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ModuleCompletionResponse'
 *       400:
 *         description: Invalid request or module already completed
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Module not found
 */
export const completeModule = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' })
    }

    const { id } = req.params
    const bodyValidation = completeModuleSchema.safeParse(req.body)
    
    if (!bodyValidation.success) {
      return res.status(400).json({
        message: 'Invalid request body',
        errors: bodyValidation.error.errors
      })
    }

    const { quizAnswers } = bodyValidation.data

    // Check if module exists
    const module = await prisma.module.findUnique({
      where: { id }
    })

    if (!module) {
      return res.status(404).json({ message: 'Module not found' })
    }

    // Check if user has started this module
    const completion = await prisma.completion.findUnique({
      where: {
        userId_moduleId: {
          userId: req.user.id,
          moduleId: id
        }
      }
    })

    if (!completion) {
      return res.status(400).json({ message: 'Module must be started before completion' })
    }

    if (completion.score >= 0) {
      return res.status(400).json({ message: 'Module already completed' })
    }

    // Load the module's quiz questions (server-side answer keys)
    const questions = await prisma.quizQuestion.findMany({
      where: { moduleId: id },
      orderBy: { position: 'asc' },
    })

    // A module with no configured questions cannot grant a reward
    if (questions.length === 0) {
      return res.status(400).json({
        message: 'This module has no quiz questions configured. Contact support.',
      })
    }

    // Reject empty answer submissions
    if (quizAnswers.length === 0) {
      return res.status(400).json({ message: 'Quiz answers must not be empty' })
    }

    // Grade against server-side answer keys
    const answerMap = new Map(quizAnswers.map((a) => [a.questionId, a.answer]))
    let correctCount = 0

    for (const question of questions) {
      const submitted = answerMap.get(question.id)
      if (submitted === question.answerKey) {
        correctCount++
      }
    }

    const score = Math.round((correctCount / questions.length) * 100)

    // Update completion record
    const updatedCompletion = await prisma.completion.update({
      where: {
        userId_moduleId: {
          userId: req.user.id,
          moduleId: id
        }
      },
      data: {
        score,
        completedAt: new Date()
      }
    })

    // Check reward eligibility (score >= 70%)
    const isEligibleForReward = score >= 70
    let rewardTransaction = null

    if (isEligibleForReward) {
      // Create reward transaction
      rewardTransaction = await prisma.transaction.create({
        data: {
          userId: req.user.id,
          amount: module.reward,
          type: 'reward',
          status: 'pending'
        }
      })
    }

    // Credit the referrer's bonus on the referee's first completion. This is idempotent
    // (guarded by the bonusPaid flag and a conditional updateMany) so a second module
    // completion never double-pays. A failure here must not fail the user's completion.
    try {
      await ReferralController.processReferralBonus(req.user.id)
    } catch (error) {
      console.error('Error processing referral bonus:', error)
    }

    // Fire push notification for quiz pass/fail (non-blocking)
    notificationService.queueNotification(
      req.user.id,
      'quizPassFail',
      isEligibleForReward ? 'Quiz Passed!' : 'Quiz Completed',
      isEligibleForReward
        ? `Great job! You scored ${score}% on "${module.title}" and earned ${module.reward} XLM.`
        : `You scored ${score}% on "${module.title}". Keep practicing to earn rewards!`
    ).catch(err => console.error('[Notifications] Quiz notification error:', err))

    // Emit module.completed webhook event (non-blocking)
    webhookService.queueEvent('module.completed', {
      userId: req.user.id,
      moduleId: id,
      moduleTitle: module.title,
      score,
      isEligibleForReward,
      reward: isEligibleForReward ? module.reward : 0,
      completedAt: updatedCompletion.completedAt?.toISOString(),
    }).catch(err => console.error('[Webhook] module.completed error:', err))

    res.json({
      message: 'Module completed successfully',
      score,
      isEligibleForReward,
      reward: isEligibleForReward ? module.reward : 0,
      rewardTransaction: rewardTransaction?.id,
      completedAt: updatedCompletion.completedAt
    })

  } catch (error) {
    console.error('Error completing module:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}
