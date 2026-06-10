import { google } from 'googleapis'
import { getAuthenticatedClient } from '../auth/oauth.js'

export async function getTasksClient() {
  const auth = await getAuthenticatedClient()
  if (!auth) {
    throw new Error(
      'Not authenticated. Visit /auth to connect your Google account.'
    )
  }
  return google.tasks({ version: 'v1', auth })
}
