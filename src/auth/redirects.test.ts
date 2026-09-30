import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_REDIRECT_URIS, isAllowedRedirectUri } from './redirects.js'

describe('isAllowedRedirectUri', () => {
  afterEach(() => {
    delete process.env.ALLOWED_REDIRECT_URIS
  })

  it("allows Claude's callbacks by default", () => {
    for (const uri of DEFAULT_REDIRECT_URIS) expect(isAllowedRedirectUri(uri)).toBe(true)
  })

  it('rejects anything else by default', () => {
    expect(isAllowedRedirectUri('https://attacker.example/cb')).toBe(false)
    expect(isAllowedRedirectUri('')).toBe(false)
    expect(isAllowedRedirectUri(undefined)).toBe(false)
  })

  it('requires an exact match', () => {
    expect(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback/')).toBe(false)
    expect(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback?x=1')).toBe(false)
    expect(isAllowedRedirectUri('https://claude.ai.attacker.example/api/mcp/auth_callback')).toBe(false)
    expect(isAllowedRedirectUri('http://claude.ai/api/mcp/auth_callback')).toBe(false)
  })

  it('ALLOWED_REDIRECT_URIS replaces the defaults', () => {
    process.env.ALLOWED_REDIRECT_URIS = ' http://localhost:33418/callback , https://example.com/cb'
    expect(isAllowedRedirectUri('http://localhost:33418/callback')).toBe(true)
    expect(isAllowedRedirectUri('https://example.com/cb')).toBe(true)
    expect(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(false)
  })
})
