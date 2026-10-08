import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Request, Response, NextFunction } from 'express'
import {
  requestIdMiddleware,
  resolveRequestId,
  isValidRequestId,
  REQUEST_ID_MAX_LENGTH,
} from '../../src/middleware/request-id.middleware'
import { getRequestId } from '../../src/config/request-context'

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function makeMocks(headers: Record<string, string | string[] | undefined> = {}) {
  const req = {
    headers,
  } as Partial<Request>

  const res = {
    setHeader: vi.fn(),
  } as Partial<Response>

  const next: NextFunction = vi.fn()

  return { req, res, next }
}

describe('isValidRequestId', () => {
  it('accepts a UUID v4', () => {
    expect(isValidRequestId('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })

  it('accepts alphanumeric and common separator characters', () => {
    expect(isValidRequestId('req_abc-123.xyz:01')).toBe(true)
  })

  it('rejects empty strings', () => {
    expect(isValidRequestId('')).toBe(false)
  })

  it('rejects values longer than the bound', () => {
    expect(isValidRequestId('a'.repeat(REQUEST_ID_MAX_LENGTH + 1))).toBe(false)
  })

  it('rejects values with whitespace or control characters', () => {
    expect(isValidRequestId('bad id')).toBe(false)
    expect(isValidRequestId('bad\nid')).toBe(false)
  })

  it('rejects non-strings', () => {
    expect(isValidRequestId(undefined)).toBe(false)
    expect(isValidRequestId(42)).toBe(false)
  })
})

describe('resolveRequestId', () => {
  it('generates a UUID v4 when no inbound header is present', () => {
    const id = resolveRequestId(undefined)
    expect(id).toMatch(UUID_V4_RE)
  })

  it('honors a valid inbound X-Request-Id', () => {
    const inbound = 'client-supplied-id-001'
    expect(resolveRequestId(inbound)).toBe(inbound)
  })

  it('overwrites an oversized inbound value with a generated UUID', () => {
    const oversized = 'x'.repeat(REQUEST_ID_MAX_LENGTH + 1)
    const id = resolveRequestId(oversized)
    expect(id).not.toBe(oversized)
    expect(id).toMatch(UUID_V4_RE)
  })

  it('overwrites a malformed inbound value with a generated UUID', () => {
    const id = resolveRequestId('has spaces and\nnewlines')
    expect(id).toMatch(UUID_V4_RE)
  })

  it('uses the first value when the header is an array', () => {
    expect(resolveRequestId(['first-id', 'second-id'])).toBe('first-id')
  })
})

describe('requestIdMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('generates a valid UUID, stores it on the request, and sets the response header', () => {
    const { req, res, next } = makeMocks()

    requestIdMiddleware(req as Request, res as Response, next)

    expect(req.requestId).toMatch(UUID_V4_RE)
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', req.requestId)
    expect(next).toHaveBeenCalledOnce()
  })

  it('honors a valid client-supplied X-Request-Id', () => {
    const inbound = 'upstream-gateway-abc'
    const { req, res, next } = makeMocks({ 'x-request-id': inbound })

    requestIdMiddleware(req as Request, res as Response, next)

    expect(req.requestId).toBe(inbound)
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', inbound)
    expect(next).toHaveBeenCalledOnce()
  })

  it('overwrites an oversized inbound header without throwing', () => {
    const oversized = 'z'.repeat(REQUEST_ID_MAX_LENGTH + 50)
    const { req, res, next } = makeMocks({ 'x-request-id': oversized })

    expect(() =>
      requestIdMiddleware(req as Request, res as Response, next),
    ).not.toThrow()

    expect(req.requestId).toMatch(UUID_V4_RE)
    expect(req.requestId).not.toBe(oversized)
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', req.requestId)
    expect(next).toHaveBeenCalledOnce()
  })

  it('propagates the request ID through AsyncLocalStorage for the request scope', () => {
    const { req, res } = makeMocks()
    let seenInside: string | undefined

    const next: NextFunction = () => {
      seenInside = getRequestId()
    }

    requestIdMiddleware(req as Request, res as Response, next)

    expect(seenInside).toBe(req.requestId)
    expect(getRequestId()).toBeUndefined()
  })
})
