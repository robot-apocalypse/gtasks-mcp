import { google } from 'googleapis'
import { saveTokens, loadTokens, type Tokens } from './storage.js'

// openid + userinfo.email are required to identify *who* signed in. Without
// them Google returns no id_token and any Google account can link this server.
const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/tasks'
]

/** Emails permitted to link this server, from ALLOWED_GOOGLE_EMAILS (comma-separated). */
export function allowedEmails(): string[] {
  return (process.env.ALLOWED_GOOGLE_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/** Fails closed: an unset or empty allowlist permits nobody. */
export function isAllowedEmail(email: string | undefined | null): boolean {
  if (!email) return false
  return allowedEmails().includes(email.toLowerCase())
}

function createClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

export function getAuthUrl(state?: string): string {
  return createClient().generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    ...(state ? { state } : {})
  })
}

export async function handleCallback(code: string): Promise<void> {
  const client = createClient()
  const { tokens } = await client.getToken(code)

  // Authorization gate: Google authenticates anyone with an account, so verify
  // the identity before storing credentials. Runs before saveTokens so a
  // rejected sign-in cannot overwrite the linked account's tokens.
  if (!tokens.id_token) {
    throw new Error('No id_token returned; cannot verify the signing-in account')
  }
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID
  })
  const payload = ticket.getPayload()
  if (!payload?.email_verified || !isAllowedEmail(payload.email)) {
    throw new Error(`Account not permitted: ${payload?.email ?? 'unknown'}`)
  }

  await saveTokens({
    access_token: tokens.access_token!,
    refresh_token: tokens.refresh_token!,
    expiry_date: tokens.expiry_date!
  })
}

export async function getAuthenticatedClient() {
  const tokens = await loadTokens()
  if (!tokens) return null

  const client = createClient()
  client.setCredentials(tokens)

  client.on('tokens', async (fresh) => {
    const current = await loadTokens()
    const merged: Tokens = {
      access_token: fresh.access_token ?? current?.access_token ?? '',
      refresh_token: fresh.refresh_token ?? current?.refresh_token ?? '',
      expiry_date: fresh.expiry_date ?? current?.expiry_date ?? 0
    }
    await saveTokens(merged)
  })

  return client
}
