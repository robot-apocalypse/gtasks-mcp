import { Hono } from 'hono'
import { createMcpServer, createTransport } from './mcp/transport.js'
import { getAuthUrl, handleCallback } from './auth/oauth.js'
import { loadTokens } from './auth/storage.js'

const mcpServer = createMcpServer()
const transport = createTransport()
await mcpServer.connect(transport)

const app = new Hono()

app.get('/auth', (c) => c.redirect(getAuthUrl()))

app.get('/callback', async (c) => {
  const code = c.req.query('code')
  if (!code) return c.text('Missing authorization code', 400)
  try {
    await handleCallback(code)
    return c.html(
      '<h1>Connected!</h1><p>Your Google account is linked. Close this tab and start using Google Tasks in Claude.</p>'
    )
  } catch (e) {
    return c.text(`Authentication failed: ${String(e)}`, 500)
  }
})

app.get('/health', (c) => c.json({ ok: true }))

app.all('/mcp', async (c) => {
  const tokens = await loadTokens()
  if (!tokens) {
    const origin = new URL(c.req.url).origin
    return c.json(
      {
        error: 'Not authenticated. Visit /auth to connect your Google account.',
        authUrl: `${origin}/auth`
      },
      401
    )
  }
  return transport.handleRequest(c.req.raw)
})

export default app
