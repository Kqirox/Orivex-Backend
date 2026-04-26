import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks (vi.hoisted ensures the variables exist when vi.mock runs) ────

const { prismaMock, mockRegisterDeviceToken, mockUpdateUserPreferences } = vi.hoisted(() => {
    return {
        prismaMock: {
            notificationLog: {
                findMany: vi.fn().mockResolvedValue([
                    {
                        id: 'log-1',
                        type: 'rewardReceipt',
                        title: 'Reward Received!',
                        body: 'You earned 5 XLM.',
                        status: 'success',
                        error: null,
                        attemptCount: 1,
                        createdAt: new Date('2026-01-01')
                    }
                ])
            }
        },
        mockRegisterDeviceToken: vi.fn(),
        mockUpdateUserPreferences: vi.fn()
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
    messaging: vi.fn()
}))

vi.mock('../src/services/notification.service', () => {
    const MockNotificationService = function(this: any) {
        this.registerDeviceToken = mockRegisterDeviceToken
        this.updateUserPreferences = mockUpdateUserPreferences
        this.queueNotification = vi.fn()
        this.processQueue = vi.fn()
    }
    return { NotificationService: MockNotificationService }
})

import { Request, Response } from 'express'
import { NotificationController } from '../src/controllers/notification.controller'

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeReq = (overrides: Partial<Request> = {}): Request =>
    ({
        body: {},
        query: {},
        params: {},
        headers: {},
        user: { id: 'user-123', email: 'test@test.com', role: 'learner' as any },
        ...overrides
    } as Request)

const makeRes = (): Response => {
    const res: Partial<Response> = {}
    res.status = vi.fn().mockReturnValue(res)
    res.json = vi.fn().mockReturnValue(res)
    return res as Response
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NotificationController', () => {
    let controller: NotificationController

    beforeEach(() => {
        vi.clearAllMocks()
        controller = new NotificationController()
    })

    describe('registerDevice', () => {
        it('returns 401 when user is not authenticated', async () => {
            const req = makeReq({ user: undefined })
            const res = makeRes()
            await controller.registerDevice(req, res)
            expect(res.status).toHaveBeenCalledWith(401)
            expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' })
        })

        it('returns 400 when token is missing', async () => {
            const req = makeReq({ body: { platform: 'ios' } })
            const res = makeRes()
            await controller.registerDevice(req, res)
            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: 'Validation failed' })
            )
        })

        it('returns 400 when platform is invalid', async () => {
            const req = makeReq({ body: { token: 'abc123', platform: 'windows' } })
            const res = makeRes()
            await controller.registerDevice(req, res)
            expect(res.status).toHaveBeenCalledWith(400)
        })

        it('returns 201 with a valid token and platform', async () => {
            const fakeToken = { id: 'dt-1', userId: 'user-123', token: 'fcm-token', platform: 'android' }
            mockRegisterDeviceToken.mockResolvedValue(fakeToken)

            const req = makeReq({ body: { token: 'fcm-token', platform: 'android' } })
            const res = makeRes()
            await controller.registerDevice(req, res)

            expect(res.status).toHaveBeenCalledWith(201)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Device token registered successfully', data: fakeToken })
            )
        })

        it('returns 500 on unexpected service error', async () => {
            mockRegisterDeviceToken.mockRejectedValue(new Error('DB error'))

            const req = makeReq({ body: { token: 'tok', platform: 'web' } })
            const res = makeRes()
            await controller.registerDevice(req, res)

            expect(res.status).toHaveBeenCalledWith(500)
        })
    })

    describe('updatePreferences', () => {
        it('returns 401 when user is not authenticated', async () => {
            const req = makeReq({ user: undefined })
            const res = makeRes()
            await controller.updatePreferences(req, res)
            expect(res.status).toHaveBeenCalledWith(401)
        })

        it('returns 400 when no preference fields are provided', async () => {
            const req = makeReq({ body: {} })
            const res = makeRes()
            await controller.updatePreferences(req, res)
            expect(res.status).toHaveBeenCalledWith(400)
        })

        it('returns 200 with valid preferences', async () => {
            const fakePrefs = {
                id: 'pref-1', userId: 'user-123',
                rewardReceipt: false, quizPassFail: true, streakReminders: true
            }
            mockUpdateUserPreferences.mockResolvedValue(fakePrefs)

            const req = makeReq({ body: { rewardReceipt: false } })
            const res = makeRes()
            await controller.updatePreferences(req, res)

            expect(res.status).toHaveBeenCalledWith(200)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Preferences updated successfully',
                    data: fakePrefs
                })
            )
        })
    })

    describe('getDeliveryStatus', () => {
        it('returns 401 when user is not authenticated', async () => {
            const req = makeReq({ user: undefined })
            const res = makeRes()
            await controller.getDeliveryStatus(req, res)
            expect(res.status).toHaveBeenCalledWith(401)
        })

        it('returns 200 with delivery logs for authenticated user', async () => {
            const req = makeReq({ query: { limit: '5' } })
            const res = makeRes()
            await controller.getDeliveryStatus(req, res)

            expect(res.status).toHaveBeenCalledWith(200)
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ count: 1 })
            )
        })
    })
})
