import { google } from 'googleapis'
import { saveTokens, loadTokens, type Tokens } from './storage.js'

const SCOPES = ['https://www.googleapis.com/auth/tasks']

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
