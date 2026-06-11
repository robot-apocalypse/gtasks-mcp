import { serve } from '@hono/node-server'
import app from './server.js'

const REQUIRED_ENV = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'ENCRYPTION_SECRET']
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

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`gtasks-mcp running on http://localhost:${info.port}`)
  console.log(`Authorize: http://localhost:${info.port}/auth`)
})
