import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Request, Response } from 'express'
import { completeModule } from '../../src/controllers/module.controller'
import { prisma } from '../../src/config/database'

// Shared Prisma mock: module.controller imports the named `{ prisma }` export while
// referral.controller imports the default export, and both must observe the same calls.
const prismaMock = vi.hoisted(() => ({
    module: {
        findUnique: vi.fn(),
    },
    completion: {
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
    },
    quizQuestion: {
        findMany: vi.fn(),
    },
    transaction: {
        create: vi.fn(),
    },
    rewardClaim: {
        create: vi.fn(),
    },
    referral: {
        findUnique: vi.fn(),
        updateMany: vi.fn(),
    },
}))

const { queueEventMock } = vi.hoisted(() => ({
    queueEventMock: vi.fn().mockResolvedValue(undefined),
}))

const { queueNotificationMock } = vi.hoisted(() => ({
    queueNotificationMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../src/config/database', () => ({
    prisma: prismaMock,
    default: prismaMock,
}))

vi.mock('../../src/services/notification.service', () => ({
    NotificationService: class {
        queueNotification = queueNotificationMock
    },
}))

vi.mock('../../src/services/webhook.service', () => ({
    WebhookService: class {
        queueEvent = queueEventMock
    },
}))

function createResponse() {
    const response: Partial<Response> = {}
    response.status = vi.fn().mockReturnValue(response)
    response.json = vi.fn().mockReturnValue(response)

    return response as Response
}

function makeRequest(userId: string, moduleId: string) {
    return {
        user: { id: userId },
        params: { id: moduleId },
        body: { quizAnswers: [{ questionId: 'q1', answer: 'a' }] },
    } as unknown as Request
}

describe('ModuleController.completeModule', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('emits module.completed webhook event after a passing quiz', async () => {
        vi.mocked(prisma.module.findUnique).mockResolvedValue({
            id: 'mod-1',
            title: 'Stellar Fundamentals',
            reward: 10,
        } as any)
        vi.mocked(prisma.completion.findUnique).mockResolvedValue({
            userId: 'user-1',
            moduleId: 'mod-1',
            score: -1,
        } as any)
        vi.mocked(prisma.quizQuestion.findMany).mockResolvedValue([
            { id: 'q1', answerKey: 'a' },
        ] as any)
        const completedAt = new Date('2026-01-01T00:00:00Z')
        vi.mocked(prisma.completion.update).mockResolvedValue({ completedAt } as any)
        vi.mocked(prisma.transaction.create).mockResolvedValue({ id: 'txn-1' } as any)
        // No referral in play for this user, so the bonus hook is a no-op.
        vi.mocked(prisma.referral.findUnique).mockResolvedValue(null)

        const req = makeRequest('user-1', 'mod-1')
        const res = createResponse()

        await completeModule(req, res)

        expect(queueEventMock).toHaveBeenCalledWith(
            'module.completed',
            expect.objectContaining({
                userId: 'user-1',
                moduleId: 'mod-1',
                moduleTitle: 'Stellar Fundamentals',
                score: 100,
                isEligibleForReward: true,
                reward: 10,
                completedAt: completedAt.toISOString(),
            }),
        )
    })

    it('credits the referrer bonus on the first completion', async () => {
        vi.mocked(prisma.module.findUnique).mockResolvedValue({
            id: 'mod-1',
            title: 'Intro',
            reward: 10,
        } as any)
        vi.mocked(prisma.completion.findUnique).mockResolvedValue({
            userId: 'user-1',
            moduleId: 'mod-1',
            score: -1,
        } as any)
        vi.mocked(prisma.quizQuestion.findMany).mockResolvedValue([
            { id: 'q1', answerKey: 'a' },
        ] as any)
        vi.mocked(prisma.completion.update).mockResolvedValue({} as any)
        vi.mocked(prisma.transaction.create).mockResolvedValue({ id: 'txn-1' } as any)

        vi.mocked(prisma.referral.findUnique).mockResolvedValue({
            id: 'ref-1',
            referrerId: 'user-2',
            bonusPaid: false,
        } as any)
        vi.mocked(prisma.completion.count).mockResolvedValue(1)
        vi.mocked(prisma.referral.updateMany).mockResolvedValue({ count: 1 })

        const req = makeRequest('user-1', 'mod-1')
        const res = createResponse()

        await completeModule(req, res)

        expect(prisma.referral.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ id: 'ref-1', bonusPaid: false }),
                data: expect.objectContaining({ bonusPaid: true }),
            }),
        )
        expect(prisma.transaction.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    userId: 'user-2',
                    type: 'referral_reward',
                    status: 'completed',
                }),
            }),
        )
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Module completed successfully' }),
        )
    })

    it('does not credit the bonus a second time for a later completion', async () => {
        vi.mocked(prisma.module.findUnique).mockResolvedValue({
            id: 'mod-2',
            title: 'Next',
            reward: 10,
        } as any)
        vi.mocked(prisma.completion.findUnique).mockResolvedValue({
            userId: 'user-1',
            moduleId: 'mod-2',
            score: -1,
        } as any)
        vi.mocked(prisma.quizQuestion.findMany).mockResolvedValue([
            { id: 'q1', answerKey: 'a' },
        ] as any)
        vi.mocked(prisma.completion.update).mockResolvedValue({} as any)
        vi.mocked(prisma.transaction.create).mockResolvedValue({ id: 'txn-2' } as any)

        // The referrer's bonus was already paid on an earlier completion.
        vi.mocked(prisma.referral.findUnique).mockResolvedValue({
            id: 'ref-1',
            referrerId: 'user-2',
            bonusPaid: true,
        } as any)
        vi.mocked(prisma.completion.count).mockResolvedValue(2)

        const req = makeRequest('user-1', 'mod-2')
        const res = createResponse()

        await completeModule(req, res)

        expect(prisma.referral.updateMany).not.toHaveBeenCalled()
        // Only the learner's own reward transaction is created — no referral_reward.
        expect(prisma.transaction.create).not.toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ type: 'referral_reward' }),
            }),
        )
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Module completed successfully' }),
        )
    })

    it('still completes the module when bonus processing throws', async () => {
        vi.mocked(prisma.module.findUnique).mockResolvedValue({
            id: 'mod-1',
            title: 'Intro',
            reward: 10,
        } as any)
        vi.mocked(prisma.completion.findUnique).mockResolvedValue({
            userId: 'user-1',
            moduleId: 'mod-1',
            score: -1,
        } as any)
        vi.mocked(prisma.quizQuestion.findMany).mockResolvedValue([
            { id: 'q1', answerKey: 'a' },
        ] as any)
        vi.mocked(prisma.completion.update).mockResolvedValue({} as any)
        vi.mocked(prisma.transaction.create).mockResolvedValue({ id: 'txn-1' } as any)
        vi.mocked(prisma.referral.findUnique).mockRejectedValue(new Error('db down'))

        const req = makeRequest('user-1', 'mod-1')
        const res = createResponse()

        await completeModule(req, res)

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Module completed successfully' }),
        )
    })

    it('credits the learner with a completed module_reward tied to the module', async () => {
        vi.mocked(prisma.module.findUnique).mockResolvedValue({
            id: 'mod-1',
            title: 'Stellar Fundamentals',
            reward: 10,
        } as any)
        vi.mocked(prisma.completion.findUnique).mockResolvedValue({
            userId: 'user-1',
            moduleId: 'mod-1',
            score: -1,
        } as any)
        vi.mocked(prisma.quizQuestion.findMany).mockResolvedValue([
            { id: 'q1', answerKey: 'a' },
        ] as any)
        vi.mocked(prisma.completion.update).mockResolvedValue({} as any)
        vi.mocked(prisma.rewardClaim.create).mockResolvedValue({ id: 'claim-1' } as any)
        vi.mocked(prisma.transaction.create).mockResolvedValue({ id: 'txn-1' } as any)
        vi.mocked(prisma.referral.findUnique).mockResolvedValue(null)

        const req = makeRequest('user-1', 'mod-1')
        const res = createResponse()

        await completeModule(req, res)

        // Atomic claim row first — the unique (userId, moduleId) constraint is
        // what makes the credit idempotent across replicas.
        expect(prisma.rewardClaim.create).toHaveBeenCalledWith({
            data: { userId: 'user-1', moduleId: 'mod-1' },
        })
        expect(prisma.transaction.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                userId: 'user-1',
                moduleId: 'mod-1',
                amount: 10,
                type: 'module_reward',
                status: 'completed',
                completedAt: expect.any(Date),
            }),
        })
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Module completed successfully',
                rewardTransaction: 'txn-1',
            }),
        )
    })

    it('does not create a second reward row when the claim already exists (P2002)', async () => {
        vi.mocked(prisma.module.findUnique).mockResolvedValue({
            id: 'mod-1',
            title: 'Stellar Fundamentals',
            reward: 10,
        } as any)
        vi.mocked(prisma.completion.findUnique).mockResolvedValue({
            userId: 'user-1',
            moduleId: 'mod-1',
            score: -1,
        } as any)
        vi.mocked(prisma.quizQuestion.findMany).mockResolvedValue([
            { id: 'q1', answerKey: 'a' },
        ] as any)
        vi.mocked(prisma.completion.update).mockResolvedValue({} as any)
        const uniqueViolation = Object.assign(
            new Error('Unique constraint failed on reward_claims'),
            { code: 'P2002' },
        )
        vi.mocked(prisma.rewardClaim.create).mockRejectedValue(uniqueViolation)
        vi.mocked(prisma.referral.findUnique).mockResolvedValue(null)

        const req = makeRequest('user-1', 'mod-1')
        const res = createResponse()

        await completeModule(req, res)

        expect(prisma.transaction.create).not.toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ type: 'module_reward' }),
            }),
        )
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Module completed successfully',
                rewardTransaction: undefined,
            }),
        )
    })

    it('does not credit any reward on a repeated completion of the same module', async () => {
        vi.mocked(prisma.module.findUnique).mockResolvedValue({
            id: 'mod-1',
            title: 'Stellar Fundamentals',
            reward: 10,
        } as any)
        vi.mocked(prisma.completion.findUnique).mockResolvedValue({
            userId: 'user-1',
            moduleId: 'mod-1',
            score: 80,
        } as any)

        const req = makeRequest('user-1', 'mod-1')
        const res = createResponse()

        await completeModule(req, res)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Module already completed' }),
        )
        expect(prisma.rewardClaim.create).not.toHaveBeenCalled()
        expect(prisma.transaction.create).not.toHaveBeenCalled()
    })
})
