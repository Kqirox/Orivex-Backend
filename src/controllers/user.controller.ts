import { ChangePasswordData, PublicUserInfo, UpdateUserData, User } from '../types/user.types'
import { Request, Response } from 'express'

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
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
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
      const userId = (req as any).user.id
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
    } catch (error) {
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
   *       500:
   *         description: Internal server error
   */

  private async findUserById (id: string): Promise<User | null> {
    const mockUser: User = {
      id,
      email: 'test@example.com',
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      bio: 'Test bio',
      avatar: 'https://example.com/avatar.jpg',
      walletAddress: 'GABC123456789012345678901234567890123456789012345678901234567890',
      isActive: true,
      role: 'LEARNER' as any,
      status: 'active' as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    return mockUser
  }

  private async updateUserProfile (id: string, data: UpdateUserData): Promise<User> {
    const mockUser: User = {
      id,
      email: 'test@example.com',
      username: data.username || 'testuser',
      firstName: data.firstName,
      lastName: data.lastName,
      bio: data.bio,
      avatar: data.avatar,
      walletAddress: 'GABC123456789012345678901234567890123456789012345678901234567890',
      isActive: true,
      role: 'LEARNER' as any,
      status: 'active' as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    return mockUser
  }

  private async validatePassword (_user: User, _password: string): Promise<boolean> {
    return false
  }

  private async updateUserPassword (_id: string, _newPassword: string): Promise<void> {
    throw new Error('Not implemented')
  }

  private async updateUserWallet (id: string, walletAddress: string): Promise<User> {
    const mockUser: User = {
      id,
      email: 'test@example.com',
      username: 'testuser',
      walletAddress,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never

    return mockUser
  }

  private isValidStellarAddress (address: string): boolean {
    return /^G[A-Z0-9]{50,55}$/.test(address)
  }
}
