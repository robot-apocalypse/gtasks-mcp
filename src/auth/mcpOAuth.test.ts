import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  storePendingRequest,
  consumePendingRequest,
  generateAuthCode,
  validateAndConsumeCode,
  generateAccessToken
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

describe('access token generation', () => {
  it('produces a non-empty string', () => {
    expect(generateAccessToken().length).toBeGreaterThan(0)
  })

  it('produces unique tokens', () => {
    expect(generateAccessToken()).not.toBe(generateAccessToken())
  })
})
