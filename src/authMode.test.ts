import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  delete process.env.AUTH_MODE
  vi.resetModules()
  vi.doUnmock('./auth/storage.js')
})

describe('AUTH_MODE=none', () => {
  it('exposes only /health and /mcp, and /mcp needs no bearer', async () => {
    process.env.AUTH_MODE = 'none'
    vi.doMock('./auth/storage.js', () => ({ loadTokens: async () => null }))
    const { default: app } = await import('./server.js')
    for (const p of ['/authorize', '/auth', '/token', '/register', '/.well-known/oauth-authorization-server']) {
      expect((await app.request(p)).status).toBe(404)
    }
    expect((await app.request('/health')).status).toBe(200)
    // no bearer, but no Google tokens either: 503, not 401
    expect((await app.request('/mcp', { method: 'POST' })).status).toBe(503)
  })

  it('rejects unknown modes', async () => {
    process.env.AUTH_MODE = 'open'
    const { authMode } = await import('./authMode.js')
    expect(() => authMode()).toThrow(/AUTH_MODE/)
  })

  it('keeps OAuth routes in the default mode', async () => {
    const { default: app } = await import('./server.js')
    expect((await app.request('/.well-known/oauth-authorization-server')).status).toBe(200)
    expect((await app.request('/mcp', { method: 'POST' })).status).toBe(401)
  })
})
