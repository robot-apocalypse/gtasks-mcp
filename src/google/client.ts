import { google, type Common } from 'googleapis'
import { getAuthenticatedClient } from '../auth/oauth.js'

export async function getTasksClient() {
  const auth = await getAuthenticatedClient()
  if (!auth) {
    throw new Error('Not authenticated. Visit /auth to connect your Google account.')
  }
  return google.tasks({ version: 'v1', auth })
}

export function googleErrorMessage(err: unknown): string {
  const e = err as Common.GaxiosError
  if (e?.response?.data) {
    const data = e.response.data as { error?: { message?: string; status?: string } }
    if (data.error?.message) return `Google API error: ${data.error.message}`
  }
  return err instanceof Error ? err.message : String(err)
}
