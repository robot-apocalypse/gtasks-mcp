import { serve } from '@hono/node-server'
import app from './server.js'

const port = parseInt(process.env.PORT ?? '3000')

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`gtasks-mcp running on http://localhost:${info.port}`)
  console.log(`Authorize: http://localhost:${info.port}/auth`)
})
