/**
 * tests/unit/quiz-grading.test.ts
 *
 * Acceptance criteria for issue #6:
 *   - All-incorrect answers yield score < 70, isEligibleForReward: false
 *   - All-correct answers yield score 100
 *   - Empty quizAnswers is rejected or scored 0
 *   - Modules with no configured questions cannot grant a reward
 *   - Quiz question answer keys live in Postgres (QuizQuestion model)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'
import { prisma } from '../../src/config/database'

// ── Mock Prisma ───────────────────────────────────────────────────────────────

vi.mock('../../src/config/database', () => {
  const mock = {
    module: { findUnique: vi.fn() },
    completion: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    quizQuestion: { findMany: vi.fn() },
    transaction: { create: vi.fn() },
  }

  return { prisma: mock, default: mock }
})

// Mock NotificationService so it doesn't touch Prisma
vi.mock('../../src/services/notification.service', () => ({
  NotificationService: class {
    queueNotification = vi.fn().mockResolvedValue(null)
  },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRes(): { res: Partial<Response>; json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> } {
  const json = vi.fn()
  const status = vi.fn().mockReturnValue({ json })
  const res: Partial<Response> = { json, status: status as any }

  return { res, json, status }
}

function makeReq(
  userId: string,
  moduleId: string,
  quizAnswers: Array<{ questionId: string; answer: string }>,
): Partial<Request> {
  return {
    user: { id: userId, role: 'LEARNER' } as any,
    params: { id: moduleId },
    body: { quizAnswers },
  }
}

const MODULE_ID = 'mod-abc'
const USER_ID = 'user-xyz'

const MOCK_MODULE = {
  id: MODULE_ID,
  title: 'Stellar Basics',
  description: 'Learn Stellar',
  category: 'blockchain',
  difficulty: 'beginner',
  reward: 5,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const MOCK_QUESTIONS = [
  { id: 'q1', moduleId: MODULE_ID, prompt: 'What is XLM?', options: '[]', answerKey: 'opt-a', position: 0 },
  { id: 'q2', moduleId: MODULE_ID, prompt: 'What is Soroban?', options: '[]', answerKey: 'opt-b', position: 1 },
  { id: 'q3', moduleId: MODULE_ID, prompt: 'What is Horizon?', options: '[]', answerKey: 'opt-c', position: 2 },
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('completeModule – real quiz grading', () => {
  let completeModule: (req: Request, res: Response) => Promise<any>

  beforeEach(async () => {
    vi.clearAllMocks()

    // Re-import to pick up fresh mocks
    vi.resetModules()
    const mod = await import('../../src/controllers/module.controller')
    completeModule = mod.completeModule

    // Default: module exists, completion is in-progress (score = -1)
    ;(prisma.module.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_MODULE)
    ;(prisma.completion.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'comp-1',
      userId: USER_ID,
      moduleId: MODULE_ID,
      score: -1,
      completedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    ;(prisma.completion.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'comp-1',
      score: 100,
      completedAt: new Date(),
    })
    ;(prisma.transaction.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'txn-1',
      userId: USER_ID,
      amount: 5,
      type: 'reward',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    ;(prisma.quizQuestion.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_QUESTIONS)
  })

  // ── All correct ─────────────────────────────────────────────────────────────

  it('scores 100 and isEligibleForReward:true when all answers are correct', async () => {
    const { res, json } = makeRes()
    const req = makeReq(USER_ID, MODULE_ID, [
      { questionId: 'q1', answer: 'opt-a' },
      { questionId: 'q2', answer: 'opt-b' },
      { questionId: 'q3', answer: 'opt-c' },
    ])

    await completeModule(req as Request, res as Response)

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ score: 100, isEligibleForReward: true }),
    )
  })

  // ── All incorrect ───────────────────────────────────────────────────────────

  it('scores 0 and isEligibleForReward:false when all answers are wrong', async () => {
    const { res, json } = makeRes()
    const req = makeReq(USER_ID, MODULE_ID, [
      { questionId: 'q1', answer: 'wrong-a' },
      { questionId: 'q2', answer: 'wrong-b' },
      { questionId: 'q3', answer: 'wrong-c' },
    ])

    await completeModule(req as Request, res as Response)

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ score: 0, isEligibleForReward: false }),
    )
  })

  it('does not create a reward transaction when score < 70', async () => {
    const { res } = makeRes()
    const req = makeReq(USER_ID, MODULE_ID, [
      { questionId: 'q1', answer: 'wrong' },
      { questionId: 'q2', answer: 'wrong' },
      { questionId: 'q3', answer: 'wrong' },
    ])

    await completeModule(req as Request, res as Response)

    expect(prisma.transaction.create).not.toHaveBeenCalled()
  })

  // ── Partial credit ──────────────────────────────────────────────────────────

  it('scores proportionally for partial correctness', async () => {
    const { res, json } = makeRes()
    // 2 out of 3 correct = 67% → not eligible
    const req = makeReq(USER_ID, MODULE_ID, [
      { questionId: 'q1', answer: 'opt-a' },  // correct
      { questionId: 'q2', answer: 'opt-b' },  // correct
      { questionId: 'q3', answer: 'wrong' },  // wrong
    ])

    await completeModule(req as Request, res as Response)

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ score: 67, isEligibleForReward: false }),
    )
  })

  it('scores 100 with 3/3 correct regardless of submission order', async () => {
    const { res, json } = makeRes()
    const req = makeReq(USER_ID, MODULE_ID, [
      { questionId: 'q3', answer: 'opt-c' },
      { questionId: 'q1', answer: 'opt-a' },
      { questionId: 'q2', answer: 'opt-b' },
    ])

    await completeModule(req as Request, res as Response)

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ score: 100, isEligibleForReward: true }),
    )
  })

  // ── Empty answers ───────────────────────────────────────────────────────────

  it('rejects empty quizAnswers array with 400', async () => {
    const { res, status } = makeRes()
    const req = makeReq(USER_ID, MODULE_ID, [])

    await completeModule(req as Request, res as Response)

    expect(status).toHaveBeenCalledWith(400)
  })

  it('does not create a reward transaction for an empty answers submission', async () => {
    const { res } = makeRes()
    const req = makeReq(USER_ID, MODULE_ID, [])

    await completeModule(req as Request, res as Response)

    expect(prisma.transaction.create).not.toHaveBeenCalled()
  })

  // ── No configured questions ──────────────────────────────────────────────────

  it('returns 400 when module has no configured questions', async () => {
    ;(prisma.quizQuestion.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])
    const { res, status } = makeRes()
    const req = makeReq(USER_ID, MODULE_ID, [{ questionId: 'any', answer: 'any' }])

    await completeModule(req as Request, res as Response)

    expect(status).toHaveBeenCalledWith(400)
  })

  it('does not grant reward for a module with no configured questions', async () => {
    ;(prisma.quizQuestion.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])
    const { res } = makeRes()
    const req = makeReq(USER_ID, MODULE_ID, [{ questionId: 'any', answer: 'any' }])

    await completeModule(req as Request, res as Response)

    expect(prisma.transaction.create).not.toHaveBeenCalled()
  })

  // ── QuizQuestion Prisma model is the answer store ────────────────────────────

  it('queries quizQuestion.findMany to obtain the server-side answer keys', async () => {
    const { res } = makeRes()
    const req = makeReq(USER_ID, MODULE_ID, [
      { questionId: 'q1', answer: 'opt-a' },
      { questionId: 'q2', answer: 'opt-b' },
      { questionId: 'q3', answer: 'opt-c' },
    ])

    await completeModule(req as Request, res as Response)

    expect(prisma.quizQuestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { moduleId: MODULE_ID } }),
    )
  })

  // ── Reward threshold ────────────────────────────────────────────────────────

  it('grants reward at exactly 70% (2 of 3 rounded up meets threshold)', async () => {
    // 3 questions: 2 correct = 66.7% → rounds to 67% → NOT eligible
    // Need 3 questions where 2 correct = exactly 66.67% — let's use 10 questions
    const tenQuestions = Array.from({ length: 10 }, (_, i) => ({
      id: `q${i}`,
      moduleId: MODULE_ID,
      prompt: `Q${i}`,
      options: '[]',
      answerKey: `correct-${i}`,
      position: i,
    }))
    ;(prisma.quizQuestion.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(tenQuestions)

    // 7 correct out of 10 = 70%
    const answers = tenQuestions.map((q, i) => ({
      questionId: q.id,
      answer: i < 7 ? `correct-${i}` : 'wrong',
    }))

    const { res, json } = makeRes()
    const req = makeReq(USER_ID, MODULE_ID, answers)

    await completeModule(req as Request, res as Response)

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ score: 70, isEligibleForReward: true }),
    )
  })

  it('does not grant reward at 69%', async () => {
    const tenQuestions = Array.from({ length: 10 }, (_, i) => ({
      id: `q${i}`,
      moduleId: MODULE_ID,
      prompt: `Q${i}`,
      options: '[]',
      answerKey: `correct-${i}`,
      position: i,
    }))
    ;(prisma.quizQuestion.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(tenQuestions)

    // 6.9 correct is not possible with integers; 6/10 = 60%, 7/10 = 70%
    // Use 6 correct = 60%
    const answers = tenQuestions.map((q, i) => ({
      questionId: q.id,
      answer: i < 6 ? `correct-${i}` : 'wrong',
    }))

    const { res, json } = makeRes()
    const req = makeReq(USER_ID, MODULE_ID, answers)

    await completeModule(req as Request, res as Response)

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ score: 60, isEligibleForReward: false }),
    )
  })
})
