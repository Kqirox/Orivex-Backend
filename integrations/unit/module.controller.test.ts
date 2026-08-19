import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Request, Response } from 'express'
import { completeModule } from '../../src/controllers/module.controller'
import { prisma } from '../../src/config/database'

const { queueEventMock } = vi.hoisted(() => ({
    queueEventMock: vi.fn().mockResolvedValue(undefined),
}))

const { queueNotificationMock } = vi.hoisted(() => ({
    queueNotificationMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../src/config/database', () => ({
    prisma: {
        module: {
            findUnique: vi.fn(),
        },
        completion: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        transaction: {
            create: vi.fn(),
        },
    },
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

describe('ModuleController.completeModule', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('emits module.completed webhook event after a passing quiz', async () => {
        ;(prisma.module.findUnique as any).mockResolvedValue({
            id: 'mod-1',
            title: 'Stellar Fundamentals',
            reward: 10,
        })
        ;(prisma.completion.findUnique as any).mockResolvedValue({
            userId: 'user-1',
            moduleId: 'mod-1',
            score: -1,
        })
        const completedAt = new Date('2026-01-01T00:00:00Z')
        ;(prisma.completion.update as any).mockResolvedValue({ completedAt })
        ;(prisma.transaction.create as any).mockResolvedValue({ id: 'txn-1' })

        const req = {
            user: { id: 'user-1' },
            params: { id: 'mod-1' },
            body: { quizAnswers: [{ questionId: 'q1', answer: 'a' }] },
        } as unknown as Request
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
})
