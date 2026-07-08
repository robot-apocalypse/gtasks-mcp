import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  storePendingRequest,
  consumePendingRequest,
  generateAuthCode,
  validateAndConsumeCode,
  issueTokens,
  refreshAccessToken,
  validateAccessToken,
  _resetStore
} from './mcpOAuth.js'

const baseRequest = {
  clientId: 'test-client',
  redirectUri: 'https://claude.ai/callback',
  state: 'test-state',
  codeChallenge: 'abc123',
  codeChallengeMethod: 'S256'
}

describe('pending OAuth requests', () => {
  it('stores and retrieves a request by nonce', () => {
    const nonce = storePendingRequest(baseRequest)
    const result = consumePendingRequest(nonce)
    expect(result).toMatchObject(baseRequest)
  })

  it('can only be consumed once (replay protection)', () => {
    const nonce = storePendingRequest(baseRequest)
    consumePendingRequest(nonce)
    expect(consumePendingRequest(nonce)).toBeNull()
  })

  it('returns null for an unknown nonce', () => {
    expect(consumePendingRequest('nonexistent')).toBeNull()
  })

  it('returns null for an expired request', () => {
    vi.useFakeTimers()
    const nonce = storePendingRequest(baseRequest)
    vi.advanceTimersByTime(6 * 60 * 1000) // past 5-minute TTL
    expect(consumePendingRequest(nonce)).toBeNull()
    vi.useRealTimers()
  })
})

describe('authorization codes', () => {
  let codeChallenge: string
  let codeVerifier: string

  beforeEach(() => {
    // A real S256 pair: sha256(verifier) base64url === challenge
    codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    // pre-computed: base64url(sha256(codeVerifier))
    const crypto = require('node:crypto')
    codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
  })

  it('valid code + verifier succeeds', () => {
    const code = generateAuthCode(codeChallenge, 'S256', baseRequest.redirectUri)
    expect(validateAndConsumeCode(code, codeVerifier, baseRequest.redirectUri)).toBe(true)
  })

  it('wrong verifier fails', () => {
    const code = generateAuthCode(codeChallenge, 'S256', baseRequest.redirectUri)
    expect(validateAndConsumeCode(code, 'wrong-verifier', baseRequest.redirectUri)).toBe(false)
  })

  it('wrong redirect_uri fails', () => {
    const code = generateAuthCode(codeChallenge, 'S256', baseRequest.redirectUri)
    expect(validateAndConsumeCode(code, codeVerifier, 'https://evil.example.com/callback')).toBe(false)
  })

  it('can only be used once (replay protection)', () => {
    const code = generateAuthCode(codeChallenge, 'S256', baseRequest.redirectUri)
    expect(validateAndConsumeCode(code, codeVerifier, baseRequest.redirectUri)).toBe(true)
    expect(validateAndConsumeCode(code, codeVerifier, baseRequest.redirectUri)).toBe(false)
  })

  it('expired code fails', () => {
    vi.useFakeTimers()
    const code = generateAuthCode(codeChallenge, 'S256', baseRequest.redirectUri)
    vi.advanceTimersByTime(11 * 60 * 1000) // past 10-minute TTL
    expect(validateAndConsumeCode(code, codeVerifier, baseRequest.redirectUri)).toBe(false)
    vi.useRealTimers()
  })

  it('unknown code fails', () => {
    expect(validateAndConsumeCode('not-a-real-code', codeVerifier, baseRequest.redirectUri)).toBe(false)
  })
})

describe('access + refresh tokens', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-tokens-'))
    process.env.MCP_TOKENS_PATH = path.join(tmpDir, 'mcp-tokens.json')
    _resetStore()
  })

  afterEach(async () => {
    delete process.env.MCP_TOKENS_PATH
    _resetStore()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('issues an access token that validates', async () => {
    const { accessToken } = await issueTokens()
    expect(await validateAccessToken(accessToken)).toBe(true)
  })

  it('rejects an unknown access token', async () => {
    expect(await validateAccessToken('not-a-real-token')).toBe(false)
  })

  it('issuing a second token does not invalidate the first (multi-device)', async () => {
    const { accessToken: first } = await issueTokens()
    const { accessToken: second } = await issueTokens()
    expect(await validateAccessToken(first)).toBe(true)
    expect(await validateAccessToken(second)).toBe(true)
  })

  it('refresh token mints a new valid access token', async () => {
    const { refreshToken } = await issueTokens()
    const refreshed = await refreshAccessToken(refreshToken)
    expect(refreshed).not.toBeNull()
    expect(await validateAccessToken(refreshed!.accessToken)).toBe(true)
  })

  it('same refresh token keeps working (non-rotating)', async () => {
    const { refreshToken } = await issueTokens()
    const a = await refreshAccessToken(refreshToken)
    const b = await refreshAccessToken(refreshToken)
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(b!.refreshToken).toBe(refreshToken)
  })

  it('rejects an unknown refresh token', async () => {
    expect(await refreshAccessToken('not-a-real-refresh-token')).toBeNull()
  })

  it('rejects an expired access token', async () => {
    vi.useFakeTimers()
    const { accessToken } = await issueTokens()
    vi.advanceTimersByTime(61 * 60 * 1000) // past 1-hour TTL
    expect(await validateAccessToken(accessToken)).toBe(false)
    vi.useRealTimers()
  })

  it('tokens survive a store reload from disk', async () => {
    const { accessToken } = await issueTokens()
    _resetStore() // forces a fresh read from the JSON file
    expect(await validateAccessToken(accessToken)).toBe(true)
  })
})
