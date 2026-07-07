import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { hash } from 'bcryptjs'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

type SeedUser = {
  id: string
  email: string
  name: string
  walletAddress: string | null
}

type SeedModule = {
  id: string
  title: string
  description: string
  category: string
  difficulty: string
  reward: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DIFFICULTY_MULTIPLIER: Record<string, number> = {
  beginner: 1,
  intermediate: 1.4,
  advanced: 1.9,
  expert: 2.5,
}

const seedUserFixtures: SeedUser[] = [
  {
    id: 'seed-user-admin-ada',
    email: 'ada.admin+seed@orivex.dev',
    name: 'Ada Admin',
    walletAddress: 'GD6QK3H5MYYXQUDMVDGLDZ4E2IWXQ7N5SLW7PZBLW4D5YV3V2NFH8A1A',
  },
  {
    id: 'seed-user-learner-alice',
    email: 'alice.learner+seed@orivex.dev',
    name: 'Alice Learner',
    walletAddress: 'GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJ4HBSNF63YLIXLQ5EDLF274Y6C',
  },
  {
    id: 'seed-user-learner-bob',
    email: 'bob.learner+seed@orivex.dev',
    name: 'Bob Learner',
    walletAddress: 'GB7YLLICSMNYWJ46NWYCBTGXD54FPPWFY3YQYBFJFTQ6B2N3WHAL5V4K',
  },
  {
    id: 'seed-user-learner-carla',
    email: 'carla.learner+seed@orivex.dev',
    name: 'Carla Learner',
    walletAddress: 'GA5N2IBQ2J5KVSBBR6K7D6JQ3Y7L46BP3I7WNIPXQ2XH2WQOTJXK5C2Z',
  },
  {
    id: 'seed-user-learner-deepak',
    email: 'deepak.learner+seed@orivex.dev',
    name: 'Deepak Learner',
    walletAddress: 'GDVXG4D7WQ3WWT3S3Q6L2J5KLC2TSGBYHYQ4M4U7QWEK3J75VYLPQ9U2',
  },
  {
    id: 'seed-user-employer-acme',
    email: 'acme.employer+seed@orivex.dev',
    name: 'Acme Talent Team',
    walletAddress: null,
  },
  {
    id: 'seed-user-employer-globex',
    email: 'globex.employer+seed@orivex.dev',
    name: 'Globex Hiring Ops',
    walletAddress: null,
  },
]

const seedModuleFixtures: SeedModule[] = [
  {
    id: 'seed-module-blockchain-101',
    title: 'Stellar Fundamentals',
    description: 'Core ledger concepts, accounts, trustlines, and transaction flow on Stellar.',
    category: 'blockchain',
    difficulty: 'beginner',
    reward: 10,
  },
  {
    id: 'seed-module-finance-101',
    title: 'Understanding Stablecoins',
    description: 'How fiat-backed and crypto-backed stablecoins work across global payment rails.',
    category: 'finance',
    difficulty: 'beginner',
    reward: 12,
  },
  {
    id: 'seed-module-security-201',
    title: 'Wallet Security & Key Management',
    description: 'Threat modeling, custody approaches, and secure key handling in production systems.',
    category: 'security',
    difficulty: 'intermediate',
    reward: 18,
  },
  {
    id: 'seed-module-development-301',
    title: 'Build with Soroban',
    description: 'Develop and test smart contracts using practical Soroban development workflows.',
    category: 'development',
    difficulty: 'advanced',
    reward: 30,
  },
  {
    id: 'seed-module-compliance-201',
    title: 'AML/KYC for Digital Finance',
    description: 'Compliance basics, sanctions screening, and regulated onboarding for fintech teams.',
    category: 'compliance',
    difficulty: 'intermediate',
    reward: 20,
  },
  {
    id: 'seed-module-identity-301',
    title: 'Decentralized Identity in Practice',
    description: 'Verifiable credentials, selective disclosure, and identity portability patterns.',
    category: 'identity',
    difficulty: 'advanced',
    reward: 28,
  },
  {
    id: 'seed-module-development-401',
    title: 'Production API Hardening',
    description: 'Rate limiting, auth patterns, observability, and safe rollout practices.',
    category: 'development',
    difficulty: 'expert',
    reward: 40,
  },
  {
    id: 'seed-module-blockchain-202',
    title: 'Stellar Asset Issuance',
    description: 'Issue and manage custom assets with issuer/distributor architecture.',
    category: 'blockchain',
    difficulty: 'intermediate',
    reward: 22,
  },
]

function createPrng(seed: number) {
  let state = seed >>> 0

  return () => {
    state = (1664525 * state + 1013904223) >>> 0

    return state / 0xffffffff
  }
}

function scoreFor(module: SeedModule, rand: () => number) {
  const base = 66 + rand() * 28
  const penalty = (DIFFICULTY_MULTIPLIER[module.difficulty] - 1) * 5

  return Number(Math.max(60, Math.min(99, base - penalty)).toFixed(2))
}

function xlmAmount(module: SeedModule, rand: () => number) {

  return Number((module.reward * (1 + rand() * 0.3)).toFixed(2))
}

async function resetAllData() {
  console.log('🧹 Resetting all records...')
  await prisma.transaction.deleteMany()
  await prisma.credential.deleteMany()
  await prisma.completion.deleteMany()
  await prisma.webhookDelivery.deleteMany()
  await prisma.webhookEndpoint.deleteMany()
  await prisma.module.deleteMany()
  await prisma.user.deleteMany()
  console.log('✅ Reset complete')
}

async function upsertUsers(passwordHash: string) {
  for (const user of seedUserFixtures) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        email: user.email,
        name: user.name,
        walletAddress: user.walletAddress,
        passwordHash,
      },
      create: {
        id: user.id,
        email: user.email,
        name: user.name,
        walletAddress: user.walletAddress,
        passwordHash,
      },
    })
  }
  console.log(`✅ Upserted ${seedUserFixtures.length} users (learners, employers, admin)`)
}

async function upsertModules() {
  for (const moduleData of seedModuleFixtures) {
    await prisma.module.upsert({
      where: { id: moduleData.id },
      update: {
        title: moduleData.title,
        description: moduleData.description,
        category: moduleData.category,
        difficulty: moduleData.difficulty,
        reward: moduleData.reward,
      },
      create: moduleData,
    })
  }
  console.log(`✅ Upserted ${seedModuleFixtures.length} modules across all categories`)
}

async function seedLearningData() {
  const learners = seedUserFixtures.filter((u) => u.email.includes('.learner+'))
  const rand = createPrng(20260308)
  const completions = []
  const credentials = []
  const transactions = []

  for (const user of learners) {
    for (const moduleData of seedModuleFixtures) {
      const completed = rand() < 0.72
      if (!completed) continue

      const completedAt = new Date(Date.now() - Math.floor(rand() * 75) * MS_PER_DAY)
      const score = scoreFor(moduleData, rand)
      const completionId = `seed-completion-${user.id}-${moduleData.id}`

      completions.push(
        prisma.completion.upsert({
          where: { id: completionId },
          update: {
            userId: user.id,
            moduleId: moduleData.id,
            score,
            completedAt,
          },
          create: {
            id: completionId,
            userId: user.id,
            moduleId: moduleData.id,
            score,
            completedAt,
          },
        }),
      )

      const hasCredential = score >= 78 || rand() < 0.7
      if (hasCredential) {
        const credentialId = `seed-credential-${user.id}-${moduleData.id}`
        credentials.push(
          prisma.credential.upsert({
            where: { id: credentialId },
            update: {
              userId: user.id,
              moduleId: moduleData.id,
              onChainId: `cred_${user.id.slice(-5)}_${moduleData.id.slice(-5)}`,
              issuedAt: new Date(completedAt.getTime() + Math.floor(rand() * 12) * 60 * 60 * 1000),
            },
            create: {
              id: credentialId,
              userId: user.id,
              moduleId: moduleData.id,
              onChainId: `cred_${user.id.slice(-5)}_${moduleData.id.slice(-5)}`,
              issuedAt: new Date(completedAt.getTime() + Math.floor(rand() * 12) * 60 * 60 * 1000),
            },
          }),
        )
      }

      const rewardTxnId = `seed-transaction-reward-${user.id}-${moduleData.id}`
      const amount = xlmAmount(moduleData, rand)
      const rewardCreatedAt = new Date(completedAt.getTime() + 60 * 60 * 1000)
      transactions.push(
        prisma.transaction.upsert({
          where: { id: rewardTxnId },
          update: {
            userId: user.id,
            amount,
            type: 'module_reward',
            status: 'completed',
            createdAt: rewardCreatedAt,
          },
          create: {
            id: rewardTxnId,
            userId: user.id,
            amount,
            type: 'module_reward',
            status: 'completed',
            createdAt: rewardCreatedAt,
          },
        }),
      )
    }

    const payoutTxnId = `seed-transaction-withdrawal-${user.id}`
    transactions.push(
      prisma.transaction.upsert({
        where: { id: payoutTxnId },
        update: {
          userId: user.id,
          amount: Number((15 + rand() * 30).toFixed(2)),
          type: 'withdrawal',
          status: rand() < 0.85 ? 'completed' : 'pending',
          createdAt: new Date(Date.now() - Math.floor(rand() * 30) * MS_PER_DAY),
        },
        create: {
          id: payoutTxnId,
          userId: user.id,
          amount: Number((15 + rand() * 30).toFixed(2)),
          type: 'withdrawal',
          status: rand() < 0.85 ? 'completed' : 'pending',
          createdAt: new Date(Date.now() - Math.floor(rand() * 30) * MS_PER_DAY),
        },
      }),
    )
  }

  const employers = seedUserFixtures.filter((u) => u.email.includes('.employer+'))
  for (const employer of employers) {
    const txId = `seed-transaction-employer-credit-${employer.id}`
    transactions.push(
      prisma.transaction.upsert({
        where: { id: txId },
        update: {
          userId: employer.id,
          amount: 1000,
          type: 'admin_adjustment',
          status: 'completed',
          createdAt: new Date(Date.now() - 7 * MS_PER_DAY),
        },
        create: {
          id: txId,
          userId: employer.id,
          amount: 1000,
          type: 'admin_adjustment',
          status: 'completed',
          createdAt: new Date(Date.now() - 7 * MS_PER_DAY),
        },
      }),
    )
  }

  await Promise.all(completions)
  await Promise.all(credentials)
  await Promise.all(transactions)

  console.log(`✅ Upserted ${completions.length} completions`)
  console.log(`✅ Upserted ${credentials.length} credentials`)
  console.log(`✅ Upserted ${transactions.length} transactions`)
}

async function seedWebhookData() {
  const endpointId = 'seed-webhook-endpoint-main'
  await prisma.webhookEndpoint.upsert({
    where: { id: endpointId },
    update: {
      url: 'https://example.com/webhooks/orivex',
      secret: 'seed_webhook_secret',
      description: 'Development webhook endpoint',
      isActive: true,
      events: 'user.registered,module.completed,reward.issued',
    },
    create: {
      id: endpointId,
      url: 'https://example.com/webhooks/orivex',
      secret: 'seed_webhook_secret',
      description: 'Development webhook endpoint',
      isActive: true,
      events: 'user.registered,module.completed,reward.issued',
    },
  })
  console.log('✅ Upserted webhook endpoint')
}

async function main() {
  console.log('🌱 Starting database seed...')
  const shouldReset = process.argv.includes('--reset')
  if (shouldReset) {
    await resetAllData()
  }

  const passwordHash = await hash('seed-password-123', 10)
  await upsertUsers(passwordHash)
  await upsertModules()
  await seedLearningData()
  await seedWebhookData()

  const [userCount, moduleCount, completionCount, credentialCount, transactionCount] = await Promise.all([
    prisma.user.count(),
    prisma.module.count(),
    prisma.completion.count(),
    prisma.credential.count(),
    prisma.transaction.count(),
  ])

  console.log('🎉 Seed completed successfully')
  console.log(
    `📊 Totals => users: ${userCount}, modules: ${moduleCount}, completions: ${completionCount}, credentials: ${credentialCount}, transactions: ${transactionCount}`,
  )
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
