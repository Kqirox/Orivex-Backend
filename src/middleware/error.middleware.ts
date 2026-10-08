import { AppError, InternalServerError, NotFoundError } from '../utils/errors'
import { NextFunction, Request, Response } from 'express'

import { env } from '../config/env'
import logger from '../config/logger'
import { getRequestId } from '../config/request-context'

function requestIdFrom(req: Request): string | undefined {
  return req.requestId ?? getRequestId()
}

/**
 * Global error handler middleware
 * Must be registered as the last middleware in the application
 * Catches all errors and returns consistent JSON responses
 */
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  let error = err
  const requestId = requestIdFrom(req)

  if (requestId) {
    res.setHeader('X-Request-Id', requestId)
  }

  logger.error({
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    requestId,
    timestamp: new Date().toISOString(),
  })

  if (!(error instanceof AppError)) {
    const message =
      err instanceof Error ? err.message : 'An unexpected error occurred'
    error = new InternalServerError(message)
  }

  const statusCode = (error as AppError).statusCode || 500
  const isDevelopment = env.NODE_ENV === 'development'

  const errorResponse: {
    success: false
    error: {
      message: string
      code: number | string
      requestId?: string
      stack?: string[]
      details?: unknown
      request?: {
        method: string
        path: string
        headers: Request['headers']
      }
    }
  } = {
    success: false,
    error: {
      message: (error as AppError).message,
      code: (error as AppError).statusCode || 'INTERNAL_SERVER_ERROR',
    },
  }

  if (requestId) {
    errorResponse.error.requestId = requestId
  }

  if (isDevelopment && err.stack) {
    errorResponse.error.stack = err.stack.split('\n')
  }

  if ('errors' in error && (error as AppError & { errors?: unknown }).errors) {
    errorResponse.error.details = (error as AppError & { errors?: unknown }).errors
  }

  if (isDevelopment) {
    errorResponse.error.request = {
      method: req.method,
      path: req.path,
      headers: req.headers,
    }
  }

  res.status(statusCode).json(errorResponse)
}

/**
 * 404 Not Found handler
 * Must be registered AFTER all routes
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const notFound = new NotFoundError(`Cannot ${req.method} ${req.path}`)
  const requestId = requestIdFrom(req)

  logger.warn({
    message: 'Not Found',
    path: req.path,
    method: req.method,
    requestId,
    timestamp: new Date().toISOString(),
  })

  next(notFound)
}

/**
 * Async error wrapper for route handlers
 * Prevents unhandled promise rejections
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      logger.error({
        message: 'Async error caught',
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        requestId: requestIdFrom(req),
        timestamp: new Date().toISOString(),
      })

      next(error)
    })
  }
}
