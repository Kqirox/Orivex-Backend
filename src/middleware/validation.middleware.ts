import { Request, Response, NextFunction } from 'express'
import { z, ZodSchema, ZodError } from 'zod'

// ── Common validation schemas ────────────────────────────────────────────────
// These can be reused across different routes and controllers

export const commonSchemas = {
  email: z.string().email('Invalid email format'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/(?=.*[a-z])/, 'Password must contain at least one lowercase letter')
    .regex(/(?=.*[A-Z])/, 'Password must contain at least one uppercase letter')
    .regex(/(?=.*\d)/, 'Password must contain at least one number')
    .regex(/(?=.*[@$!%*?&])/, 'Password must contain at least one special character'),
  id: z.string().uuid('Invalid ID format'),
  username: z.string()
    .min(3, 'Username must be at least 3 characters long')
    .max(30, 'Username must be less than 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  walletAddress: z.string()
    .regex(/^[G][A-Z0-9]{55}$/, 'Invalid Stellar wallet address format'),
  url: z.string().url('Invalid URL format'),
}

// ── Validation middleware ───────────────────────────────────────────────────
// Example usage:
// router.post('/login', validate({ body: z.object({ email: commonSchemas.email, password: commonSchemas.password }) }), controller.login)
// router.get('/users/:id', validate({ params: z.object({ id: commonSchemas.id }) }), controller.getUser)

export interface ValidationSchemas {
  body?: ZodSchema
  query?: ZodSchema
  params?: ZodSchema
}

export const validate = (schemas: ValidationSchemas) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: Record<string, string[]> = {}

    // Validate body
    if (schemas.body) {
      try {
        req.body = schemas.body.parse(req.body)
      } catch (error) {
        if (error instanceof ZodError) {
          errors.body = error.errors.map(err => err.message)
        }
      }
    }

    // Validate query
    if (schemas.query) {
      try {
        req.query = schemas.query.parse(req.query)
      } catch (error) {
        if (error instanceof ZodError) {
          errors.query = error.errors.map(err => err.message)
        }
      }
    }

    // Validate params
    if (schemas.params) {
      try {
        req.params = schemas.params.parse(req.params)
      } catch (error) {
        if (error instanceof ZodError) {
          errors.params = error.errors.map(err => err.message)
        }
      }
    }

    // If there are errors, return 400 with field-specific errors
    if (Object.keys(errors).length > 0) {
      res.status(400).json({
        message: 'Validation failed',
        errors
      })
      
      return
    }

    next()
  }
}

// Specific validation middlewares for backward compatibility
export const validateProfileUpdate = validate({
  body: z.object({
    username: commonSchemas.username.optional(),
    firstName: z.string().max(50, 'First name must be less than 50 characters').optional(),
    lastName: z.string().max(50, 'Last name must be less than 50 characters').optional(),
    bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
    avatar: commonSchemas.url.optional(),
  })
})

export const validatePasswordChange = validate({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: commonSchemas.password,
  }).refine((data: { currentPassword: string; newPassword: string }) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword']
  })
})

export const validateWalletAddress = validate({
  body: z.object({
    walletAddress: commonSchemas.walletAddress,
  })
})