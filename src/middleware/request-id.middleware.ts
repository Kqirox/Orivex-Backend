import { randomUUID } from 'node:crypto'
import { NextFunction, Request, Response } from 'express'

import { requestContext } from '../config/request-context'

/** Maximum accepted length for a client-supplied X-Request-Id. */
export const REQUEST_ID_MAX_LENGTH = 128

/**
 * Allowed characters for an inbound request ID.
 * Covers UUID v4, ULID, and common gateway/correlation formats without
 * permitting whitespace or control characters (log-injection risk).
 */
const REQUEST_ID_PATTERN = /^[\w.:-]+$/

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string
    }
  }
}

/**
 * Returns true when `value` is a safe, bounded request identifier.
 */
export function isValidRequestId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= REQUEST_ID_MAX_LENGTH &&
    REQUEST_ID_PATTERN.test(value)
  )
}

/**
 * Resolve the request ID from an inbound header, or generate a UUID v4.
 *
 * Decision: a valid client-supplied `X-Request-Id` is honored so upstream
 * proxies and clients can correlate across services. Invalid, oversized, or
 * missing values are overwritten with a newly generated UUID — never rejected
 * with an error response, so malformed headers cannot crash or block the request.
 */
export function resolveRequestId(
  inbound: string | string[] | undefined,
): string {
  const candidate = Array.isArray(inbound) ? inbound[0] : inbound
  if (isValidRequestId(candidate)) {
    return candidate
  }

  return randomUUID()
}

/**
 * Assigns a unique request ID early in the pipeline, stores it on the
 * request and in AsyncLocalStorage, and echoes it on every response via
 * the `X-Request-Id` header.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId = resolveRequestId(req.headers['x-request-id'])

  req.requestId = requestId
  res.setHeader('X-Request-Id', requestId)

  requestContext.run({ requestId }, () => {
    next()
  })
}
