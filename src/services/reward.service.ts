import { prisma } from '../config/database'
import { StellarService } from './stellar.service'
import { NotificationService } from './notification.service'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModuleDifficulty =
  | 'beginner'
  | 'intermediate'
  | 'advanced'
  | 'expert'

export interface Module {
  id: string
  difficulty: ModuleDifficulty
  baseReward: number
  title: string
}

export interface RewardClaim {
  userId: string
  moduleId: string
  walletAddress: string
  streakDays?: number
  referralCode?: string
}

export interface RewardResult {
  transactionId: string
  userId: string
  moduleId: string
  baseAmount: number
  streakBonus: number
  referralBonus: number
  totalAmount: number
  stellarTxHash: string
  claimedAt: Date
}

/**
 * The Transaction shape exposed by the service.  Field names mirror the
 * persisted Prisma row; no in-memory augmentation is needed.
 */
export interface Transaction {
  id: string
  userId: string
  moduleId?: string
  amount: number
  type: 'module_reward' | 'streak_bonus' | 'referral_reward' | 'withdrawal'
  status: 'pending' | 'completed' | 'failed'
  stellarTxHash?: string
  createdAt: Date
  completedAt?: Date
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const DIFFICULTY_MULTIPLIERS: Record<ModuleDifficulty, number> = {
  beginner: 1.0,
  intermediate: 1.5,
  advanced: 2.0,
  expert: 3.0,
}

export const BASE_REWARD_XLM = 5
export const STREAK_BONUS_RATE = 0.1 // 10% bonus per streak day
export const MAX_STREAK_BONUS = 1.0 // cap at 100% of base
export const REFERRAL_BONUS_XLM = 2 // flat XLM bonus per referral

export interface WithdrawalRequest {
  userId: string
  walletAddress: string
  amount: number
  memo?: string
}

export interface WithdrawalResult {
  transactionId: string
  userId: string
  amount: number
  stellarTxHash: string
  status: 'pending' | 'completed' | 'failed'
  requestedAt: Date
  completedAt?: Date
}

export interface Balance {
  userId: string
  available: number
  pending: number
  lifetime: number
  updatedAt: Date
}

export interface TransactionFilter {
  type?: Transaction['type']
  status?: Transaction['status']
  fromDate?: Date
  toDate?: Date
  limit?: number
  offset?: number
}

// ─── RewardService ────────────────────────────────────────────────────────────

/**
 * Stateless service: every method reads from and writes to Postgres via Prisma.
 * There is no module-level mutable state; constructing a new instance sees the
 * same durable data as any other instance in any process.
 */
export class RewardService {
  private stellarService: StellarService
  private notificationService: NotificationService

  constructor(stellarService?: StellarService) {
    this.stellarService = stellarService ?? new StellarService()
    this.notificationService = new NotificationService()
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Calculate the reward breakdown for a module completion without paying out.
   */
  calculateReward(
    module: Module,
    streakDays = 0,
    hasReferral = false,
  ): {
    baseAmount: number
    streakBonus: number
    referralBonus: number
    totalAmount: number
  } {
    const baseAmount = this.calculateBaseReward(module)
    const streakBonus = this.calculateStreakBonus(baseAmount, streakDays)
    const referralBonus = hasReferral ? REFERRAL_BONUS_XLM : 0
    const totalAmount = baseAmount + streakBonus + referralBonus

    return { baseAmount, streakBonus, referralBonus, totalAmount }
  }

  /**
   * Claim a reward for completing a module.
   *
   * Outbox pattern:
   *  1. Insert a RewardClaim row (unique on userId+moduleId) — this is the
   *     atomic double-claim guard at the database level.
   *  2. Insert a Transaction row with status='pending' BEFORE calling Stellar.
   *  3. Submit the Stellar payment.
   *  4. Flip the Transaction row to 'completed' (or 'failed').
   *
   * A crash between steps 2 and 4 leaves a 'pending' row that a reconciliation
   * job can detect and retry (not in scope for this issue).
   */
  async claimReward(claim: RewardClaim, module: Module): Promise<RewardResult> {
    // 1. Atomic double-claim guard via unique constraint
    try {
      await prisma.rewardClaim.create({
        data: { userId: claim.userId, moduleId: claim.moduleId },
      })
    } catch (err: any) {
      // Prisma P2002 = unique constraint violation
      if (err?.code === 'P2002') {
        throw new Error(
          `User "${claim.userId}" has already claimed the reward for module "${claim.moduleId}"`,
          { cause: err },
        )
      }
      throw err
    }

    // 2. Calculate amounts
    const hasReferral = Boolean(claim.referralCode)
    const { baseAmount, streakBonus, referralBonus, totalAmount } =
      this.calculateReward(module, claim.streakDays ?? 0, hasReferral)

    // 3. Persist a 'pending' row before hitting Stellar (outbox)
    const txRow = await prisma.transaction.create({
      data: {
        userId: claim.userId,
        moduleId: claim.moduleId,
        amount: totalAmount,
        type: 'module_reward',
        status: 'pending',
      },
    })

    // 4. Payout via Stellar
    let stellarTxHash: string

    try {
      const paymentResult = await this.stellarService.sendPayment({
        sourceSecret: process.env.STELLAR_SOURCE_SECRET!,
        destinationPublicKey: claim.walletAddress,
        amount: totalAmount.toString(),
        memo: `Orivex reward: module ${claim.moduleId}`,
      })
      stellarTxHash = paymentResult.hash

      // 5. Flip to completed
      await prisma.transaction.update({
        where: { id: txRow.id },
        data: {
          status: 'completed',
          stellarTxHash,
          completedAt: new Date(),
        },
      })
    } catch (err) {
      await prisma.transaction.update({
        where: { id: txRow.id },
        data: { status: 'failed' },
      })
      throw err
    }

    // 6. Push notification (non-blocking)
    this.notificationService
      .queueNotification(
        claim.userId,
        'rewardReceipt',
        'Reward Received!',
        `You earned ${totalAmount.toFixed(2)} XLM for completing module ${module.title}.`,
      )
      .catch((err) =>
        console.error('[Notifications] Reward notification error:', err),
      )

    return {
      transactionId: txRow.id,
      userId: claim.userId,
      moduleId: claim.moduleId,
      baseAmount,
      streakBonus,
      referralBonus,
      totalAmount,
      stellarTxHash,
      claimedAt: new Date(),
    }
  }

  /**
   * Check whether a user has already claimed the reward for a module.
   * Reads from the durable RewardClaim table.
   */
  async hasAlreadyClaimed(userId: string, moduleId: string): Promise<boolean> {
    const existing = await prisma.rewardClaim.findUnique({
      where: { userId_moduleId: { userId, moduleId } },
    })

    return existing !== null
  }

  /**
   * Return all recorded transactions.
   */
  async getTransactions(): Promise<Transaction[]> {
    const rows = await prisma.transaction.findMany({
      orderBy: { createdAt: 'asc' },
    })

    return rows.map(this.rowToTransaction)
  }

  /**
   * Return all recorded transactions for a specific user.
   */
  async getUserTransactions(userId: string): Promise<Transaction[]> {
    const rows = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    })

    return rows.map(this.rowToTransaction)
  }

  /**
   * Calculate user's current balance based on completed rewards and withdrawals.
   * Derived purely from durable Prisma rows; survives process restarts.
   */
  async getBalance(userId: string): Promise<Balance> {
    const rows = await prisma.transaction.findMany({ where: { userId } })

    const earned = rows
      .filter(
        (r) =>
          r.status === 'completed' &&
          ['module_reward', 'streak_bonus', 'referral_reward'].includes(r.type),
      )
      .reduce((sum, r) => sum + r.amount, 0)

    const withdrawn = rows
      .filter((r) => r.status === 'completed' && r.type === 'withdrawal')
      .reduce((sum, r) => sum + r.amount, 0)

    const pending = rows
      .filter((r) => r.status === 'pending' && r.type === 'withdrawal')
      .reduce((sum, r) => sum + r.amount, 0)

    const available = earned - withdrawn - pending

    return {
      userId,
      available: Math.max(0, +available.toFixed(7)),
      pending: +pending.toFixed(7),
      lifetime: +earned.toFixed(7),
      updatedAt: new Date(),
    }
  }

  /**
   * Get transaction history with filtering and pagination.
   */
  async getTransactionHistory(
    userId: string,
    filters: TransactionFilter = {},
  ): Promise<{
    transactions: Transaction[]
    total: number
    hasMore: boolean
  }> {
    const where: any = { userId }

    if (filters.type) where.type = filters.type
    if (filters.status) where.status = filters.status
    if (filters.fromDate || filters.toDate) {
      where.createdAt = {}
      if (filters.fromDate) where.createdAt.gte = filters.fromDate
      if (filters.toDate) where.createdAt.lte = filters.toDate
    }

    const total = await prisma.transaction.count({ where })

    const limit = filters.limit ?? 20
    const offset = filters.offset ?? 0

    const rows = await prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    })

    return {
      transactions: rows.map(this.rowToTransaction),
      total,
      hasMore: offset + limit < total,
    }
  }

  /**
   * Process a withdrawal request.
   *
   * Outbox pattern: persist a 'pending' row BEFORE calling Stellar,
   * then flip to 'completed' or 'failed' with the stellarTxHash.
   */
  async processWithdrawal(request: WithdrawalRequest): Promise<WithdrawalResult> {
    // Validate balance
    const balance = await this.getBalance(request.userId)

    if (request.amount <= 0) {
      throw new Error('Withdrawal amount must be greater than 0')
    }

    if (request.amount > balance.available) {
      throw new Error(
        `Insufficient balance. Available: ${balance.available} XLM, Requested: ${request.amount} XLM`,
      )
    }

    // Persist pending row before Stellar call (outbox)
    const txRow = await prisma.transaction.create({
      data: {
        userId: request.userId,
        amount: request.amount,
        type: 'withdrawal',
        status: 'pending',
      },
    })

    try {
      const paymentResult = await this.stellarService.sendPayment({
        sourceSecret: process.env.STELLAR_SOURCE_SECRET!,
        destinationPublicKey: request.walletAddress,
        amount: request.amount.toString(),
        memo: request.memo ?? `Orivex withdrawal: ${txRow.id}`,
      })
      const stellarTxHash = paymentResult.hash

      await prisma.transaction.update({
        where: { id: txRow.id },
        data: {
          status: 'completed',
          stellarTxHash,
          completedAt: new Date(),
        },
      })

      return {
        transactionId: txRow.id,
        userId: request.userId,
        amount: request.amount,
        stellarTxHash,
        status: 'completed',
        requestedAt: txRow.createdAt,
        completedAt: new Date(),
      }
    } catch (error) {
      await prisma.transaction.update({
        where: { id: txRow.id },
        data: { status: 'failed' },
      })
      throw error
    }
  }

  /**
   * Check if user has sufficient balance for withdrawal.
   */
  async hasSufficientBalance(userId: string, amount: number): Promise<boolean> {
    const balance = await this.getBalance(userId)

    return amount <= balance.available
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private calculateBaseReward(module: Module): number {
    const multiplier = DIFFICULTY_MULTIPLIERS[module.difficulty] ?? 1.0

    return +(BASE_REWARD_XLM * multiplier).toFixed(7)
  }

  private calculateStreakBonus(baseAmount: number, streakDays: number): number {
    if (streakDays <= 0) return 0
    const bonusRate = Math.min(streakDays * STREAK_BONUS_RATE, MAX_STREAK_BONUS)

    return +(baseAmount * bonusRate).toFixed(7)
  }

  /**
   * Convert a raw Prisma row (type: string) to the typed Transaction interface.
   * Unknown type strings fall back to 'module_reward' to avoid runtime errors
   * on legacy seed rows with free-form type values.
   */
  private rowToTransaction(row: {
    id: string
    userId: string
    moduleId?: string | null
    amount: number
    type: string
    status: string
    stellarTxHash?: string | null
    createdAt: Date
    completedAt?: Date | null
  }): Transaction {
    const validTypes = new Set([
      'module_reward',
      'streak_bonus',
      'referral_reward',
      'withdrawal',
    ])
    const validStatuses = new Set(['pending', 'completed', 'failed'])

    return {
      id: row.id,
      userId: row.userId,
      moduleId: row.moduleId ?? undefined,
      amount: row.amount,
      type: validTypes.has(row.type)
        ? (row.type as Transaction['type'])
        : 'module_reward',
      status: validStatuses.has(row.status)
        ? (row.status as Transaction['status'])
        : 'pending',
      stellarTxHash: row.stellarTxHash ?? undefined,
      createdAt: row.createdAt,
      completedAt: row.completedAt ?? undefined,
    }
  }
}
