import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks (vi.hoisted ensures variables exist when vi.mock factories run) ──

const { prismaMock } = vi.hoisted(() => {
    return {
        prismaMock: {
            deviceToken: { upsert: vi.fn() },
            notificationPreference: { findUnique: vi.fn(), upsert: vi.fn() },
            notificationLog: { create: vi.fn(), findMany: vi.fn(), update: vi.fn() }
        }
    }
})

vi.mock('../src/config/database', () => ({
    default: prismaMock,
    prisma: prismaMock
}))

vi.mock('firebase-admin', () => ({
    apps: [],
    initializeApp: vi.fn(),
    credential: { cert: vi.fn() },
    messaging: vi.fn().mockReturnValue({
        sendEachForMulticast: vi.fn()
    })
}))

import { NotificationService } from '../src/services/notification.service'

// ── Tests ───────────────────────────────────────────────────────────────────

describe('NotificationService', () => {
    let service: NotificationService

    beforeEach(() => {
        vi.clearAllMocks()
        service = new NotificationService()
    })

    describe('registerDeviceToken', () => {
        it('calls prisma.deviceToken.upsert with correct args', async () => {
            const fakeToken = { id: 'dt-1', userId: 'u1', token: 'tok', platform: 'ios' }
            prismaMock.deviceToken.upsert.mockResolvedValue(fakeToken)

            const result = await service.registerDeviceToken('u1', 'tok', 'ios')

            expect(prismaMock.deviceToken.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { token: 'tok' },
                    create: expect.objectContaining({ userId: 'u1', token: 'tok', platform: 'ios' })
                })
            )
            expect(result).toEqual(fakeToken)
        })
    })

    describe('updateUserPreferences', () => {
        it('calls prisma.notificationPreference.upsert', async () => {
            const fakePrefs = { id: 'p1', userId: 'u1', rewardReceipt: false, quizPassFail: true, streakReminders: true }
            prismaMock.notificationPreference.upsert.mockResolvedValue(fakePrefs)

            const result = await service.updateUserPreferences('u1', { rewardReceipt: false })

            expect(prismaMock.notificationPreference.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { userId: 'u1' },
                    update: { rewardReceipt: false }
                })
            )
            expect(result).toEqual(fakePrefs)
        })
    })

    describe('queueNotification', () => {
        it('returns null when user has opted out of the notification type', async () => {
            prismaMock.notificationPreference.findUnique.mockResolvedValue({
                rewardReceipt: false,
                quizPassFail: true,
                streakReminders: true
            })

            const result = await service.queueNotification('u1', 'rewardReceipt', 'Hi', 'Body')

            expect(result).toBeNull()
            expect(prismaMock.notificationLog.create).not.toHaveBeenCalled()
        })

        it('creates a log entry when user has opted in', async () => {
            prismaMock.notificationPreference.findUnique.mockResolvedValue({
                rewardReceipt: true,
                quizPassFail: true,
                streakReminders: true
            })
            const fakeLog = { id: 'log-1', status: 'pending' }
            prismaMock.notificationLog.create.mockResolvedValue(fakeLog)
            prismaMock.notificationLog.findMany.mockResolvedValue([])

            const result = await service.queueNotification('u1', 'rewardReceipt', 'Reward!', 'You earned 5 XLM.')

            expect(prismaMock.notificationLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ userId: 'u1', type: 'rewardReceipt', title: 'Reward!', status: 'pending' })
                })
            )
            expect(result).toEqual(fakeLog)
        })

        it('defaults to enabled when no preference row exists', async () => {
            prismaMock.notificationPreference.findUnique.mockResolvedValue(null)
            const fakeLog = { id: 'log-2', status: 'pending' }
            prismaMock.notificationLog.create.mockResolvedValue(fakeLog)
            prismaMock.notificationLog.findMany.mockResolvedValue([])

            const result = await service.queueNotification('u2', 'quizPassFail', 'Quiz', 'Passed!')

            expect(result).toBeDefined()
            expect(result?.id).toBe('log-2')
        })
    })

    describe('processQueue', () => {
        it('does nothing when there are no pending logs', async () => {
            prismaMock.notificationLog.findMany.mockResolvedValue([])

            await expect(service.processQueue()).resolves.not.toThrow()
            expect(prismaMock.notificationLog.update).not.toHaveBeenCalled()
        })

        it('marks log as failed when user has no device tokens', async () => {
            const pendingLog = {
                id: 'log-1',
                title: 'Test',
                body: 'Test body',
                attemptCount: 0,
                maxAttempts: 5,
                user: { deviceTokens: [] }
            }
            prismaMock.notificationLog.findMany.mockResolvedValue([pendingLog])
            prismaMock.notificationLog.update.mockResolvedValue({})

            await service.processQueue()

            expect(prismaMock.notificationLog.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ status: 'failed' })
                })
            )
        })
    })

    describe('event type routing', () => {
        it('queues with the correct event type for streakReminders', async () => {
            prismaMock.notificationPreference.findUnique.mockResolvedValue(null)
            const fakeLog = { id: 'log-3', status: 'pending' }
            prismaMock.notificationLog.create.mockResolvedValue(fakeLog)
            prismaMock.notificationLog.findMany.mockResolvedValue([])

            const result = await service.queueNotification('u3', 'streakReminders', 'Streak!', 'Keep it up')

            expect(prismaMock.notificationLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ type: 'streakReminders' })
                })
            )
            expect(result?.id).toBe('log-3')
        })
    })
})
