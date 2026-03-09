import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default prisma
const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
