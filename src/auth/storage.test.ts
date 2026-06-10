import { describe, it, expect, beforeEach } from 'vitest'
import { encryptTokens, decryptTokens } from './storage.js'

describe('token storage', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_SECRET = 'test-secret-that-is-at-least-32-chars-long'
  })

  it('round-trips token data through encrypt/decrypt', () => {
    const tokens = {
      access_token: 'ya29.test-access-token',
      refresh_token: '1//test-refresh-token',
      expiry_date: 1700000000000
    }
    const encrypted = encryptTokens(tokens)
    expect(encrypted.iv).toBeTruthy()
    expect(encrypted.tag).toBeTruthy()
    expect(encrypted.data).toBeTruthy()
    expect(encrypted.data).not.toContain('ya29')

    const decrypted = decryptTokens(encrypted)
    expect(decrypted).toEqual(tokens)
  })

  it('produces different ciphertext each call (random IV)', () => {
    const tokens = { access_token: 'x', refresh_token: 'y', expiry_date: 0 }
    const a = encryptTokens(tokens)
    const b = encryptTokens(tokens)
    expect(a.iv).not.toBe(b.iv)
    expect(a.data).not.toBe(b.data)
  })

  it('throws when ENCRYPTION_SECRET is missing', () => {
    delete process.env.ENCRYPTION_SECRET
    expect(() =>
      encryptTokens({ access_token: '', refresh_token: '', expiry_date: 0 })
    ).toThrow('ENCRYPTION_SECRET must be at least 32 characters')
  })
})
