import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'

// Avoid pulling JWT_SECRET / DB requirements via route imports during app boot.
vi.mock('../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3000,
  },
}))

vi.mock('../src/config/swagger', () => ({
  specs: {},
}))

vi.mock('../src/routes', () => ({
  default: (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, next: (err?: unknown) => void) => {
    // Minimal router stub: /api/boom throws, everything else 404s via notFoundHandler
    const expressReq = _req as { path?: string; url?: string; originalUrl?: string }
    const path = expressReq.originalUrl ?? expressReq.url ?? ''
    if (path === '/api/boom' || path.endsWith('/boom')) {
      next(new Error('boom'))

      return
    }
    next()
  },
}))

import app from '../src/app'

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('Request ID end-to-end', () => {
  it('returns a generated X-Request-Id on successful responses', async () => {
    const res = await request(app).get('/health')

    expect(res.status).toBe(200)
    expect(res.headers['x-request-id']).toMatch(UUID_V4_RE)
  })

  it('echoes a valid client-supplied X-Request-Id on success', async () => {
    const inbound = 'client-corr-id-42'
    const res = await request(app)
      .get('/health')
      .set('X-Request-Id', inbound)

    expect(res.status).toBe(200)
    expect(res.headers['x-request-id']).toBe(inbound)
  })

  it('includes requestId on error responses (header + envelope)', async () => {
    const inbound = 'err-corr-id-99'
    const res = await request(app)
      .get('/api/boom')
      .set('X-Request-Id', inbound)

    expect(res.status).toBe(500)
    expect(res.headers['x-request-id']).toBe(inbound)
    expect(res.body.success).toBe(false)
    expect(res.body.error.requestId).toBe(inbound)
    expect(res.body.error).toHaveProperty('message')
    expect(res.body.error).toHaveProperty('code')
  })

  it('overwrites an oversized inbound X-Request-Id', async () => {
    const oversized = 'x'.repeat(200)
    const res = await request(app)
      .get('/health')
      .set('X-Request-Id', oversized)

    expect(res.status).toBe(200)
    expect(res.headers['x-request-id']).toMatch(UUID_V4_RE)
    expect(res.headers['x-request-id']).not.toBe(oversized)
  })

  it('exposes X-Request-Id to browser clients via CORS', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:3000')

    expect(res.status).toBe(200)
    expect(res.headers['access-control-expose-headers']).toMatch(/X-Request-Id/i)
  })

  it('includes requestId on 404 responses (header + envelope)', async () => {
    const inbound = 'not-found-corr-id-3'
    const res = await request(app)
      .get('/api/does-not-exist')
      .set('X-Request-Id', inbound)

    expect(res.status).toBe(404)
    expect(res.headers['x-request-id']).toBe(inbound)
    expect(res.body.success).toBe(false)
    expect(res.body.error.requestId).toBe(inbound)
    expect(res.body.error).toHaveProperty('message')
    expect(res.body.error).toHaveProperty('code')
  })

  it('emits the same request ID in morgan and winston log output', async () => {
    const inbound = 'log-corr-id-7'
    const chunks: string[] = []
    const spies: Array<ReturnType<typeof vi.spyOn>> = []

    const intercept = (stream: { write: NodeJS.WriteStream['write'] }) => {
      const original = stream.write.bind(stream)
      spies.push(
        vi.spyOn(stream, 'write').mockImplementation(((
          chunk: unknown,
          ...args: unknown[]
        ) => {
          chunks.push(String(chunk))

          return original(chunk as string, ...(args as []))
        }) as typeof stream.write),
      )
    }

    intercept(process.stdout)
    intercept(process.stderr)
    const consoleStdout = (console as { _stdout?: NodeJS.WriteStream })._stdout
    const consoleStderr = (console as { _stderr?: NodeJS.WriteStream })._stderr
    if (consoleStdout && consoleStdout !== process.stdout) intercept(consoleStdout)
    if (consoleStderr && consoleStderr !== process.stderr) intercept(consoleStderr)

    try {
      const res = await request(app)
        .get('/api/boom')
        .set('X-Request-Id', inbound)

      expect(res.status).toBe(500)
      expect(res.body.error.requestId).toBe(inbound)

      const combined = chunks.join('')
      expect(combined).toContain(`${inbound} GET /api/boom`)
      expect(combined).toContain(`requestId=${inbound}`)
    } finally {
      spies.forEach((spy) => spy.mockRestore())
    }
  })
})
