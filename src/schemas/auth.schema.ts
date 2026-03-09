import { z } from 'zod'
import { UserRole } from '../types/user.types'

export const registerSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters long'),
    username: z.string().min(3, 'Username must be at least 3 characters long'),
    role: z.nativeEnum(UserRole).optional().default(UserRole.LEARNER),
})

export const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string(),
})

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
