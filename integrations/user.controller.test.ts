import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { Request, Response } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import prisma from '../src/config/database'
import { UserController } from '../src/controllers/user.controller'

vi.mock('../src/config/database', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}))

function createResponse() {
  const response: Partial<Response> = {}
  response.status = vi.fn().mockReturnValue(response)
  response.json = vi.fn().mockReturnValue(response)

  return response as Response
}

const persistedUser = {
  id: '1',
  email: 'user@example.com',
  username: 'testuser',
  password: 'hashed_password',
  role: 'LEARNER',
  walletAddress: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  lastLoginAt: null,
}

const validWalletAddress = 'GABC1234567890123456789012345678901234567890123456789'

describe('UserController', () => {
  let controller: UserController

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new UserController()
  })

  describe('getCurrentUser', () => {
    it('returns the persisted row without leaking the password', async () => {
      ;(prisma.user.findUnique as any).mockResolvedValue(persistedUser)

      const req = { user: { id: '1' } } as unknown as Request
      const res = createResponse()

      await controller.getCurrentUser(req, res)

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: '1' } })
      expect(res.json).toHaveBeenCalledWith({
        id: '1',
        email: 'user@example.com',
        username: 'testuser',
        role: 'LEARNER',
        walletAddress: null,
        createdAt: persistedUser.createdAt,
        updatedAt: persistedUser.updatedAt,
      })
      expect(JSON.stringify((res.json as any).mock.calls[0][0])).not.toContain('hashed_password')
    })

    it('returns 404 when the user does not exist', async () => {
      ;(prisma.user.findUnique as any).mockResolvedValue(null)

      const req = { user: { id: 'missing' } } as unknown as Request
      const res = createResponse()

      await controller.getCurrentUser(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' })
    })
  })

  describe('updateProfile', () => {
    it('persists the username via prisma.user.update and returns the row', async () => {
      const updated = { ...persistedUser, username: 'updateduser' }
      ;(prisma.user.update as any).mockResolvedValue(updated)

      const req = { user: { id: '1' }, body: { username: 'updateduser' } } as unknown as Request
      const res = createResponse()

      await controller.updateProfile(req, res)

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { username: 'updateduser' },
      })
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ username: 'updateduser' }))
    })
  })

  describe('getUserById', () => {
    it('returns public user info', async () => {
      ;(prisma.user.findUnique as any).mockResolvedValue(persistedUser)

      const req = { params: { id: '1' } } as unknown as Request
      const res = createResponse()

      await controller.getUserById(req, res)

      expect(res.json).toHaveBeenCalledWith({
        id: '1',
        username: 'testuser',
        role: 'LEARNER',
        createdAt: persistedUser.createdAt,
      })
    })

    it('returns 404 when the user does not exist', async () => {
      ;(prisma.user.findUnique as any).mockResolvedValue(null)

      const req = { params: { id: 'missing' } } as unknown as Request
      const res = createResponse()

      await controller.getUserById(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
    })
  })

  describe('changePassword', () => {
    it('verifies the current password, hashes, and persists the new password', async () => {
      ;(prisma.user.findUnique as any).mockResolvedValue(persistedUser)
      ;(bcrypt.compare as any).mockResolvedValue(true)
      ;(bcrypt.hash as any).mockResolvedValue('new_hash')

      const req = {
        user: { id: '1' },
        body: { currentPassword: 'OldPassword123!', newPassword: 'NewPassword123!' },
      } as unknown as Request
      const res = createResponse()

      await controller.changePassword(req, res)

      expect(bcrypt.compare).toHaveBeenCalledWith('OldPassword123!', 'hashed_password')
      expect(bcrypt.hash).toHaveBeenCalledWith('NewPassword123!', 10)
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { password: 'new_hash' },
      })
      expect(res.json).toHaveBeenCalledWith({ message: 'Password updated successfully' })
    })

    it('returns 400 and does not persist when the current password is incorrect', async () => {
      ;(prisma.user.findUnique as any).mockResolvedValue(persistedUser)
      ;(bcrypt.compare as any).mockResolvedValue(false)

      const req = {
        user: { id: '1' },
        body: { currentPassword: 'WrongPassword123!', newPassword: 'NewPassword123!' },
      } as unknown as Request
      const res = createResponse()

      await controller.changePassword(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'Current password is incorrect' })
      expect(prisma.user.update).not.toHaveBeenCalled()
    })
  })

  describe('updateWalletAddress', () => {
    it('persists the wallet address and returns the row', async () => {
      const updated = { ...persistedUser, walletAddress: validWalletAddress }
      ;(prisma.user.update as any).mockResolvedValue(updated)

      const req = { user: { id: '1' }, body: { walletAddress: validWalletAddress } } as unknown as Request
      const res = createResponse()

      await controller.updateWalletAddress(req, res)

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { walletAddress: validWalletAddress },
      })
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ walletAddress: validWalletAddress }))
    })

    it('returns 409 on a duplicate wallet address', async () => {
      ;(prisma.user.update as any).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '7.4.2',
        }),
      )

      const req = { user: { id: '1' }, body: { walletAddress: validWalletAddress } } as unknown as Request
      const res = createResponse()

      await controller.updateWalletAddress(req, res)

      expect(res.status).toHaveBeenCalledWith(409)
      expect(res.json).toHaveBeenCalledWith({ error: 'Wallet address is already in use' })
    })

    it('returns 400 for an invalid wallet address', async () => {
      const req = { user: { id: '1' }, body: { walletAddress: 'invalid-address' } } as unknown as Request
      const res = createResponse()

      await controller.updateWalletAddress(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid Stellar wallet address' })
    })
  })

  describe('isValidStellarAddress', () => {
    it('validates a correct Stellar address', () => {
      expect((controller as any).isValidStellarAddress(validWalletAddress)).toBe(true)
    })

    it('rejects an invalid Stellar address', () => {
      expect((controller as any).isValidStellarAddress('invalid-address')).toBe(false)
    })
  })
})
