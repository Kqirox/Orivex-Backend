import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { Request, Response } from 'express'
import prisma from '../config/database'
import { ChangePasswordData, PublicUserInfo, UpdateUserData, User } from '../types/user.types'

class WalletConflictError extends Error {
  constructor() {
    super('Wallet address is already in use')
    this.name = 'WalletConflictError'
  }
}

export class UserController {
  /**
   * @openapi
   * /users/me:
   *   get:
   *     summary: Get current authenticated user profile
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: User profile retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/User'
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: User not found
   */

  async getCurrentUser (req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })

        return
      }
      const user = await this.findUserById(userId)
      if (!user) {
        res.status(404).json({ error: 'User not found' })

        return
      }
      res.json(this.toUserResponse(user))
    } catch {
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * @openapi
   * /users/profile:
   *   put:
   *     summary: Update user profile
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/UpdateUser'
   *     responses:
   *       200:
   *         description: Profile updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/User'
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */

  async updateProfile (req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })

        return
      }
      const data = req.body as UpdateUserData
      const user = await this.updateUserProfile(userId, data)
      res.json(this.toUserResponse(user))
    } catch {
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  async getUserById (req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params

      const user = await this.findUserById(id)
      if (!user) {
        res.status(404).json({ error: 'User not found' })

        return
      }

      const publicInfo: PublicUserInfo = {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
      }

      res.json(publicInfo)
    } catch (error) {
      console.error('Error getting user by ID:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  async changePassword (req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id
      const { currentPassword, newPassword }: ChangePasswordData = req.body

      const user = await this.findUserById(userId)
      if (!user) {
        res.status(404).json({ error: 'User not found' })

        return
      }

      const isCurrentPasswordValid = await this.validatePassword(user, currentPassword)
      if (!isCurrentPasswordValid) {
        res.status(400).json({ error: 'Current password is incorrect' })

        return
      }

      await this.updateUserPassword(userId, newPassword)

      res.json({ message: 'Password updated successfully' })
    } catch (error: unknown) {
      console.error('Error changing password:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * @openapi
   * /users/wallet:
   *   put:
   *     summary: Update user Stellar wallet address
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - walletAddress
   *             properties:
   *               walletAddress:
   *                 type: string
   *                 example: GABC123456789012345678901234567890123456789012345678901234567890
   *     responses:
   *       200:
   *         description: Wallet address updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/User'
   *       400:
   *         description: Invalid Stellar wallet address
   *       401:
   *         description: Unauthorized
   *       409:
   *         description: Wallet address already in use
   *       500:
   *         description: Internal server error
   */

  async updateWalletAddress (req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })

        return
      }
      const { walletAddress } = req.body as { walletAddress: string }
      if (!this.isValidStellarAddress(walletAddress)) {
        res.status(400).json({ error: 'Invalid Stellar wallet address' })

        return
      }
      const user = await this.updateUserWallet(userId, walletAddress)
      res.json(this.toUserResponse(user))
    } catch (error) {
      if (error instanceof WalletConflictError) {
        res.status(409).json({ error: error.message })

        return
      }
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  private findUserById (id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } })
  }

  private updateUserProfile (id: string, data: UpdateUserData): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: { username: data.username },
    })
  }

  private validatePassword (user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password)
  }

  private async updateUserPassword (id: string, newPassword: string): Promise<void> {
    const hashed = await bcrypt.hash(newPassword, 10)

    await prisma.user.update({
      where: { id },
      data: { password: hashed },
    })
  }

  private async updateUserWallet (id: string, walletAddress: string): Promise<User> {
    try {
      return await prisma.user.update({
        where: { id },
        data: { walletAddress },
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new WalletConflictError()
      }

      throw error
    }
  }

  private isValidStellarAddress (address: string): boolean {
    return /^G[A-Z0-9]{50,55}$/.test(address)
  }

  private toUserResponse (user: User) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      walletAddress: user.walletAddress,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }
  }
}
