import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  delete process.env.AUTH_MODE
  delete process.env.UPSTREAM_TOKEN
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

  it('requires UPSTREAM_TOKEN when it is set', async () => {
    process.env.AUTH_MODE = 'none'
    process.env.UPSTREAM_TOKEN = 'u'.repeat(40)
    const { default: app } = await import('./server.js')
    expect((await app.request('/mcp', { method: 'POST' })).status).toBe(401)
    expect((await app.request('/mcp', { method: 'POST', headers: { authorization: 'Bearer wrong' } })).status).toBe(401)
    const ok = await app.request('/mcp', { method: 'POST', headers: { authorization: `Bearer ${'u'.repeat(40)}` } })
    expect(ok.status).not.toBe(401)
  })
})
