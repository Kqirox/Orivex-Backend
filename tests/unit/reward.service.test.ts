/**
 * tests/unit/reward.service.test.ts
 *
 * Unit tests for the Prisma-backed RewardService.
 * All Prisma calls are mocked — no live database required.
 * The _resetState() hook has been removed; tests are isolated via vi.clearAllMocks().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  RewardService,
  DIFFICULTY_MULTIPLIERS,
  BASE_REWARD_XLM,
  STREAK_BONUS_RATE,
  MAX_STREAK_BONUS,
  REFERRAL_BONUS_XLM,
  Module,
  RewardClaim,
} from '../../src/services/reward.service'
import { StellarService } from '../../src/services/stellar.service'

// ── Mock Prisma ───────────────────────────────────────────────────────────────

vi.mock('../../src/config/database', () => ({
  prisma: {
    rewardClaim: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
  default: {
    rewardClaim: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeModule = (overrides: Partial<Module> = {}): Module => ({
  id: 'mod-001',
  title: 'Intro to Stellar',
  difficulty: 'beginner',
  baseReward: BASE_REWARD_XLM,
  ...overrides,
})

const makeClaim = (overrides: Partial<RewardClaim> = {}): RewardClaim => ({
  userId: 'user-abc',
  moduleId: 'mod-001',
  walletAddress: 'GABC1234567890123456789012345678901234567890123456789',
  streakDays: 0,
  ...overrides,
})

const MOCK_TX_HASH = 'abc123stellar'
const MOCK_TX_ID = 'txn-mock-id-001'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RewardService', () => {
  let stellarMock: StellarService
  let service: RewardService

  beforeEach(async () => {
    vi.clearAllMocks()

    stellarMock = {
      sendPayment: vi
        .fn()
        .mockResolvedValue({ hash: MOCK_TX_HASH, ledger: 123, successful: true }),
      verifyTransaction: vi.fn().mockResolvedValue(true),
    } as unknown as StellarService

    service = new RewardService(stellarMock)

    // Default Prisma mocks for happy-path
    const { prisma } = await import('../../src/config/database')

    // rewardClaim.create succeeds (no duplicate)
    ;(prisma.rewardClaim.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'claim-id',
      userId: 'user-abc',
      moduleId: 'mod-001',
      createdAt: new Date(),
    })

    // transaction.create returns a pending row
    ;(prisma.transaction.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: MOCK_TX_ID,
      userId: 'user-abc',
      moduleId: 'mod-001',
      amount: 5,
      type: 'module_reward',
      status: 'pending',
      stellarTxHash: null,
      createdAt: new Date(),
      completedAt: null,
      updatedAt: new Date(),
    })

    // transaction.update flips to completed
    ;(prisma.transaction.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: MOCK_TX_ID,
      status: 'completed',
      stellarTxHash: MOCK_TX_HASH,
    })

    // transaction.findMany returns empty by default
    ;(prisma.transaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(prisma.transaction.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)

    // rewardClaim.findUnique returns null by default (not yet claimed)
    ;(prisma.rewardClaim.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  })

  // ── calculateReward ─────────────────────────────────────────────────────────

  describe('calculateReward – base amounts by difficulty', () => {
    it.each([
      ['beginner', 5],
      ['intermediate', 7.5],
      ['advanced', 10],
      ['expert', 15],
    ] as const)('%s difficulty yields %d XLM base', (difficulty, expected) => {
      const { baseAmount } = service.calculateReward(makeModule({ difficulty }))
      expect(baseAmount).toBe(expected)
    })

    it('applies the correct multiplier from DIFFICULTY_MULTIPLIERS', () => {
      for (const [diff, mult] of Object.entries(DIFFICULTY_MULTIPLIERS)) {
        const mod = makeModule({ difficulty: diff as Module['difficulty'] })
        const { baseAmount } = service.calculateReward(mod)
        expect(baseAmount).toBeCloseTo(BASE_REWARD_XLM * mult)
      }
    })
  })

  describe('calculateReward – streak bonus', () => {
    it('returns 0 streak bonus with 0 streak days', () => {
      const { streakBonus } = service.calculateReward(makeModule(), 0)
      expect(streakBonus).toBe(0)
    })

    it('applies 10% bonus per streak day', () => {
      const base = BASE_REWARD_XLM
      const { streakBonus } = service.calculateReward(makeModule(), 3)
      expect(streakBonus).toBeCloseTo(base * 3 * STREAK_BONUS_RATE)
    })

    it('caps streak bonus at 100% of base', () => {
      const base = BASE_REWARD_XLM
      const { streakBonus } = service.calculateReward(makeModule(), 20)
      expect(streakBonus).toBeCloseTo(base * MAX_STREAK_BONUS)
    })

    it('streak bonus is included in totalAmount', () => {
      const { baseAmount, streakBonus, totalAmount } = service.calculateReward(makeModule(), 5)
      expect(totalAmount).toBeCloseTo(baseAmount + streakBonus)
    })
  })

  describe('calculateReward – referral bonus', () => {
    it('adds REFERRAL_BONUS_XLM when hasReferral is true', () => {
      const { referralBonus } = service.calculateReward(makeModule(), 0, true)
      expect(referralBonus).toBe(REFERRAL_BONUS_XLM)
    })

    it('adds no referral bonus when hasReferral is false', () => {
      const { referralBonus } = service.calculateReward(makeModule(), 0, false)
      expect(referralBonus).toBe(0)
    })

    it('totalAmount includes base + streak + referral', () => {
      const { baseAmount, streakBonus, referralBonus, totalAmount } =
        service.calculateReward(makeModule(), 3, true)
      expect(totalAmount).toBeCloseTo(baseAmount + streakBonus + referralBonus)
    })
  })

  // ── claimReward ─────────────────────────────────────────────────────────────

  describe('claimReward – happy path', () => {
    it('returns a result with correct shape', async () => {
      const result = await service.claimReward(makeClaim(), makeModule())

      expect(result).toMatchObject({
        userId: 'user-abc',
        moduleId: 'mod-001',
        transactionId: MOCK_TX_ID,
        stellarTxHash: MOCK_TX_HASH,
      })
      expect(result.claimedAt).toBeInstanceOf(Date)
    })

    it('inserts a RewardClaim row to prevent double-claims', async () => {
      const { prisma } = await import('../../src/config/database')
      await service.claimReward(makeClaim(), makeModule())

      expect(prisma.rewardClaim.create).toHaveBeenCalledWith({
        data: { userId: 'user-abc', moduleId: 'mod-001' },
      })
    })

    it('creates a pending Transaction row BEFORE calling Stellar', async () => {
      const { prisma } = await import('../../src/config/database')

      // Track call order
      const callOrder: string[] = []
      ;(prisma.transaction.create as ReturnType<typeof vi.fn>).mockImplementation(async (args: any) => {
        callOrder.push('transaction.create')

        return {
          id: MOCK_TX_ID,
          userId: args.data.userId,
          amount: args.data.amount ?? 5,
          type: args.data.type,
          status: args.data.status,
          moduleId: args.data.moduleId ?? null,
          stellarTxHash: null,
          createdAt: new Date(),
          completedAt: null,
          updatedAt: new Date(),
        }
      })
      ;(stellarMock.sendPayment as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        callOrder.push('stellar.sendPayment')

        return { hash: MOCK_TX_HASH, ledger: 1, successful: true }
      })

      await service.claimReward(makeClaim(), makeModule())

      // The pending row must exist before the Stellar call
      const createIdx = callOrder.indexOf('transaction.create')
      const stellarIdx = callOrder.indexOf('stellar.sendPayment')
      expect(createIdx).toBeLessThan(stellarIdx)
    })

    it('flips Transaction status to completed after successful Stellar payment', async () => {
      const { prisma } = await import('../../src/config/database')
      await service.claimReward(makeClaim(), makeModule())

      expect(prisma.transaction.update).toHaveBeenCalledWith({
        where: { id: MOCK_TX_ID },
        data: {
          status: 'completed',
          stellarTxHash: MOCK_TX_HASH,
          completedAt: expect.any(Date),
        },
      })
    })

    it('calls Stellar sendPayment with correct address and total amount', async () => {
      const module = makeModule({ difficulty: 'advanced' })
      const claim = makeClaim({ streakDays: 2 })
      await service.claimReward(claim, module)

      const { totalAmount } = service.calculateReward(module, 2, false)
      expect(stellarMock.sendPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          destinationPublicKey: claim.walletAddress,
          amount: totalAmount.toString(),
          memo: expect.stringContaining(claim.moduleId),
        }),
      )
    })
  })

  describe('claimReward – double-claim prevention', () => {
    it('throws when the same user claims the same module twice (P2002)', async () => {
      const { prisma } = await import('../../src/config/database')
      const error = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
      ;(prisma.rewardClaim.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error)

      await expect(service.claimReward(makeClaim(), makeModule())).rejects.toThrow(
        /already claimed/i,
      )
    })

    it('does not call Stellar if the double-claim guard fires', async () => {
      const { prisma } = await import('../../src/config/database')
      const error = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
      ;(prisma.rewardClaim.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error)

      try {
        await service.claimReward(makeClaim(), makeModule())
      } catch {
        /* expected */
      }

      expect(stellarMock.sendPayment).not.toHaveBeenCalled()
    })
  })

  describe('claimReward – Stellar failure marks transaction failed', () => {
    it('flips Transaction to failed when Stellar throws', async () => {
      const { prisma } = await import('../../src/config/database')
      ;(stellarMock.sendPayment as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Network error'),
      )

      await expect(service.claimReward(makeClaim(), makeModule())).rejects.toThrow()

      expect(prisma.transaction.update).toHaveBeenCalledWith({
        where: { id: MOCK_TX_ID },
        data: { status: 'failed' },
      })
    })
  })

  // ── hasAlreadyClaimed ───────────────────────────────────────────────────────

  describe('hasAlreadyClaimed', () => {
    it('returns false when no RewardClaim row exists', async () => {
      const { prisma } = await import('../../src/config/database')
      ;(prisma.rewardClaim.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)

      expect(await service.hasAlreadyClaimed('user-abc', 'mod-001')).toBe(false)
    })

    it('returns true when a RewardClaim row exists', async () => {
      const { prisma } = await import('../../src/config/database')
      ;(prisma.rewardClaim.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'claim-1',
        userId: 'user-abc',
        moduleId: 'mod-001',
        createdAt: new Date(),
      })

      expect(await service.hasAlreadyClaimed('user-abc', 'mod-001')).toBe(true)
    })
  })

  // ── getBalance ──────────────────────────────────────────────────────────────

  describe('getBalance', () => {
    it('returns zero balance for a user with no transactions', async () => {
      const { prisma } = await import('../../src/config/database')
      ;(prisma.transaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])

      const balance = await service.getBalance('user-abc')
      expect(balance).toMatchObject({ available: 0, pending: 0, lifetime: 0 })
    })

    it('derives available from completed rewards minus completed withdrawals', async () => {
      const { prisma } = await import('../../src/config/database')
      ;(prisma.transaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: 't1', userId: 'user-abc', amount: 10, type: 'module_reward',
          status: 'completed', createdAt: new Date(), updatedAt: new Date(),
          stellarTxHash: 'abc', completedAt: new Date(), moduleId: 'mod-1',
        },
        {
          id: 't2', userId: 'user-abc', amount: 3, type: 'withdrawal',
          status: 'completed', createdAt: new Date(), updatedAt: new Date(),
          stellarTxHash: 'def', completedAt: new Date(), moduleId: null,
        },
      ])

      const balance = await service.getBalance('user-abc')
      expect(balance.available).toBeCloseTo(7)
      expect(balance.lifetime).toBe(10)
    })

    it('includes pending withdrawals in the pending field and reduces available', async () => {
      const { prisma } = await import('../../src/config/database')
      ;(prisma.transaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: 't1', userId: 'user-abc', amount: 20, type: 'module_reward',
          status: 'completed', createdAt: new Date(), updatedAt: new Date(),
          stellarTxHash: 'abc', completedAt: new Date(), moduleId: 'mod-1',
        },
        {
          id: 't2', userId: 'user-abc', amount: 5, type: 'withdrawal',
          status: 'pending', createdAt: new Date(), updatedAt: new Date(),
          stellarTxHash: null, completedAt: null, moduleId: null,
        },
      ])

      const balance = await service.getBalance('user-abc')
      expect(balance.pending).toBe(5)
      expect(balance.available).toBeCloseTo(15)
    })
  })

  // ── getTransactionHistory ───────────────────────────────────────────────────

  describe('getTransactionHistory', () => {
    it('returns paginated rows for a user', async () => {
      const { prisma } = await import('../../src/config/database')
      const row = {
        id: 't1', userId: 'user-abc', amount: 5, type: 'module_reward',
        status: 'completed', createdAt: new Date(), updatedAt: new Date(),
        stellarTxHash: 'hash1', completedAt: new Date(), moduleId: 'mod-1',
      }
      ;(prisma.transaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([row])
      ;(prisma.transaction.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1)

      const result = await service.getTransactionHistory('user-abc')
      expect(result.total).toBe(1)
      expect(result.transactions).toHaveLength(1)
      expect(result.transactions[0].stellarTxHash).toBe('hash1')
    })

    it('passes where filters to Prisma', async () => {
      const { prisma } = await import('../../src/config/database')
      ;(prisma.transaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])
      ;(prisma.transaction.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0)

      await service.getTransactionHistory('user-abc', {
        type: 'withdrawal',
        status: 'pending',
        limit: 5,
        offset: 10,
      })

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'withdrawal', status: 'pending' }),
          skip: 10,
          take: 5,
        }),
      )
    })
  })

  // ── processWithdrawal ───────────────────────────────────────────────────────

  describe('processWithdrawal', () => {
    const makeWithdrawal = (overrides = {}) => ({
      userId: 'user-abc',
      walletAddress: 'GABC1234567890123456789012345678901234567890123456789',
      amount: 3,
      ...overrides,
    })

    beforeEach(async () => {
      const { prisma } = await import('../../src/config/database')
      // Sufficient balance: 10 XLM earned
      ;(prisma.transaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'earn-1', userId: 'user-abc', amount: 10, type: 'module_reward',
          status: 'completed', createdAt: new Date(), updatedAt: new Date(),
          stellarTxHash: 'prev', completedAt: new Date(), moduleId: 'mod-1',
        },
      ])
      ;(prisma.transaction.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'wd-tx-id',
        userId: 'user-abc',
        amount: 3,
        type: 'withdrawal',
        status: 'pending',
        moduleId: null,
        stellarTxHash: null,
        createdAt: new Date(),
        completedAt: null,
        updatedAt: new Date(),
      })
      ;(prisma.transaction.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'wd-tx-id',
        status: 'completed',
        stellarTxHash: MOCK_TX_HASH,
      })
    })

    it('creates a pending Transaction before calling Stellar', async () => {
      const { prisma } = await import('../../src/config/database')
      const callOrder: string[] = []
      ;(prisma.transaction.create as ReturnType<typeof vi.fn>).mockImplementation(async (args: any) => {
        callOrder.push('transaction.create')

        return {
          id: 'wd-tx-id', userId: args.data.userId, amount: args.data.amount,
          type: 'withdrawal', status: 'pending', moduleId: null,
          stellarTxHash: null, createdAt: new Date(), completedAt: null, updatedAt: new Date(),
        }
      })
      ;(stellarMock.sendPayment as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        callOrder.push('stellar.sendPayment')

        return { hash: MOCK_TX_HASH, ledger: 1, successful: true }
      })

      await service.processWithdrawal(makeWithdrawal())

      expect(callOrder.indexOf('transaction.create')).toBeLessThan(
        callOrder.indexOf('stellar.sendPayment'),
      )
    })

    it('flips status to completed with stellarTxHash on success', async () => {
      const { prisma } = await import('../../src/config/database')
      await service.processWithdrawal(makeWithdrawal())

      expect(prisma.transaction.update).toHaveBeenCalledWith({
        where: { id: 'wd-tx-id' },
        data: expect.objectContaining({
          status: 'completed',
          stellarTxHash: MOCK_TX_HASH,
          completedAt: expect.any(Date),
        }),
      })
    })

    it('flips status to failed when Stellar throws', async () => {
      const { prisma } = await import('../../src/config/database')
      ;(stellarMock.sendPayment as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Stellar error'),
      )

      await expect(service.processWithdrawal(makeWithdrawal())).rejects.toThrow()

      expect(prisma.transaction.update).toHaveBeenCalledWith({
        where: { id: 'wd-tx-id' },
        data: { status: 'failed' },
      })
    })

    it('throws if amount is zero or negative', async () => {
      await expect(
        service.processWithdrawal(makeWithdrawal({ amount: 0 })),
      ).rejects.toThrow(/greater than 0/i)

      await expect(
        service.processWithdrawal(makeWithdrawal({ amount: -1 })),
      ).rejects.toThrow(/greater than 0/i)
    })

    it('throws if amount exceeds available balance', async () => {
      await expect(
        service.processWithdrawal(makeWithdrawal({ amount: 999 })),
      ).rejects.toThrow(/Insufficient balance/i)
    })
  })
})
