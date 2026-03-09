import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import prisma from '../config/database'
import { loginSchema, registerSchema } from '../schemas/auth.schema'
import { UserRole } from '../types/user.types'

const JWT_SECRET = process.env.JWT_SECRET || 'your-default-secret'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d'

export class AuthController {
    /**
     * @route POST /api/v1/auth/register
     * @desc Register a new user
     * @access Public
     */
    async register(req: Request, res: Response): Promise<void> {
        try {
            // Validate input
            const validation = registerSchema.safeParse(req.body)
            if (!validation.success) {
                res.status(400).json({
                    error: 'Validation failed',
                    details: validation.error.format()
                })

                return
            }

            const { email, password, username, role } = validation.data

            // Check if user already exists
            const existingUser = await prisma.user.findFirst({
                where: {
                    OR: [
                        { email },
                        { username }
                    ]
                }
            })

            if (existingUser) {
                res.status(409).json({ error: 'User with this email or username already exists' })

                return
            }

            // Hash password
            const salt = await bcrypt.genSalt(10)
            const hashedPassword = await bcrypt.hash(password, salt)

            // Create user
            const user = await prisma.user.create({
                data: {
                    email,
                    username,
                    password: hashedPassword,
                    role: (role as any) || UserRole.LEARNER,
                }
            })

            // Generate token
            const token = this.generateToken(user.id, user.role)

            res.status(201).json({
                message: 'User registered successfully',
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    role: user.role
                }
            })
        } catch (error) {
            console.error('Registration error:', error)
            res.status(500).json({ error: 'Internal server error during registration' })
        }
    }

    /**
     * @route POST /api/v1/auth/login
     * @desc Login a user
     * @access Public
     */
    async login(req: Request, res: Response): Promise<void> {
        try {
            // Validate input
            const validation = loginSchema.safeParse(req.body)
            if (!validation.success) {
                res.status(400).json({
                    error: 'Validation failed',
                    details: validation.error.format()
                })

                return
            }

            const { email, password } = validation.data

            // Find user
            const user = await prisma.user.findUnique({
                where: { email }
            })

            if (!user) {
                res.status(401).json({ error: 'Invalid credentials' })

                return
            }

            // Verify password
            const isMatch = await bcrypt.compare(password, user.password)
            if (!isMatch) {
                res.status(401).json({ error: 'Invalid credentials' })

                return
            }

            // Update last login
            await prisma.user.update({
                where: { id: user.id },
                data: { lastLoginAt: new Date() }
            })

            // Generate token
            const token = this.generateToken(user.id, user.role)

            res.status(200).json({
                message: 'Login successful',
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    role: user.role
                }
            })
        } catch (error) {
            console.error('Login error:', error)
            res.status(500).json({ error: 'Internal server error during login' })
        }
    }

    /**
     * @route POST /api/v1/auth/logout
     * @desc Logout user (client-side usually handles this by deleting token, but can track server-side)
     * @access Private (optional, here public)
     */
    async logout(req: Request, res: Response): Promise<void> {
        // For stateless JWT, we can't truly "logout" unless we blacklist tokens.
        // For now, let's just return success message as the client will clear the token.
        res.status(200).json({ message: 'Logged out successfully. Please clear your token client-side.' })
    }

    private generateToken(userId: string, role: string): string {
        return jwt.sign(
            { id: userId, role },
            JWT_SECRET as string,
            { expiresIn: JWT_EXPIRES_IN as any }
        )
    }
}
