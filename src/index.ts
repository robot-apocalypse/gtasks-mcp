import { serve } from '@hono/node-server'
import { authMode, type AuthMode } from './authMode.js'
import app from './server.js'

let mode: AuthMode
try {
  mode = authMode()
} catch (e) {
  console.error(String(e instanceof Error ? e.message : e))
  process.exit(1)
}

// Behind a gateway there is no sign-in flow, so no redirect URI; the Google
// client credentials are still needed to refresh the stored Tasks token.
const REQUIRED_ENV =
  mode === 'none'
    ? ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'ENCRYPTION_SECRET']
    : ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'ENCRYPTION_SECRET']
const missing = REQUIRED_ENV.filter((k) => !process.env[k])
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`)
  process.exit(1)
}
if ((process.env.ENCRYPTION_SECRET?.length ?? 0) < 32) {
  console.error('ENCRYPTION_SECRET must be at least 32 characters')
  process.exit(1)
}

const port = parseInt(process.env.PORT ?? '3000')

const hostname = process.env.HOST ?? (mode === 'none' ? '127.0.0.1' : '0.0.0.0')

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`auth mode: ${mode}`)
  console.log(`gtasks-mcp running on http://localhost:${info.port}`)
  if (mode === 'oauth') console.log(`Authorize: http://localhost:${info.port}/auth`)
})
