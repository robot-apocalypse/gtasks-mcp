import { describe, it, expect, beforeEach } from 'vitest'
import { allowedEmails, isAllowedEmail } from './oauth.js'

describe('google account allowlist', () => {
  beforeEach(() => {
    delete process.env.ALLOWED_GOOGLE_EMAILS
  })

  it('fails closed when the allowlist is unset', () => {
    expect(isAllowedEmail('anyone@gmail.com')).toBe(false)
  })

  it('fails closed when the allowlist is empty or blank', () => {
    process.env.ALLOWED_GOOGLE_EMAILS = '  , ,'
    expect(allowedEmails()).toEqual([])
    expect(isAllowedEmail('anyone@gmail.com')).toBe(false)
  })

  it('admits a listed address and rejects an unlisted one', () => {
    process.env.ALLOWED_GOOGLE_EMAILS = 'owner@example.com'
    expect(isAllowedEmail('owner@example.com')).toBe(true)
    expect(isAllowedEmail('stranger@gmail.com')).toBe(false)
  })

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    process.env.ALLOWED_GOOGLE_EMAILS = ' Owner@Example.com , second@example.com '
    expect(isAllowedEmail('OWNER@EXAMPLE.COM')).toBe(true)
    expect(isAllowedEmail('second@example.com')).toBe(true)
  })

  it('rejects a missing email claim', () => {
    process.env.ALLOWED_GOOGLE_EMAILS = 'owner@example.com'
    expect(isAllowedEmail(undefined)).toBe(false)
    expect(isAllowedEmail(null)).toBe(false)
    expect(isAllowedEmail('')).toBe(false)
  })
})
