import crypto from 'node:crypto'
import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { handleMcpRequest } from './mcp/transport.js'
import { getAuthUrl, handleCallback } from './auth/oauth.js'
import { loadTokens } from './auth/storage.js'
import {
  storePendingRequest,
  consumePendingRequest,
  generateAuthCode,
  validateAndConsumeCode,
  issueTokens,
  refreshAccessToken,
  validateAccessToken
} from './auth/mcpOAuth.js'

const app = new Hono()

// Request logging
app.use('*', async (c, next) => {
  await next()
  if (c.req.path === '/mcp') {
    console.log(`${c.req.method} ${c.req.path} accept="${c.req.header('accept')}" → ${c.res.status}`)
  } else {
    console.log(`${c.req.method} ${c.req.path} → ${c.res.status}`)
  }
})

// CORS — required for browser-side OAuth requests from Claude.ai
app.use('/.well-known/*', cors())
app.use('/register', cors())
app.use('/token', cors())

function getOrigin(c: { req: { url: string; header: (name: string) => string | undefined } }): string {
  const url = new URL(c.req.url)
  const proto = c.req.header('x-forwarded-proto') ?? url.protocol.replace(':', '')
  return `${proto}://${url.host}`
}

// RFC 8414 OAuth Authorization Server Metadata
app.get('/.well-known/oauth-authorization-server', (c) => {
  const issuer = getOrigin(c)
  c.header('Cache-Control', 'no-store')
  return c.json({
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    registration_endpoint: `${issuer}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none']
  })
})

// RFC 9728 OAuth Protected Resource Metadata — both /mcp-specific and root paths
const protectedResourceMetadata = (c: Context) => {
  const issuer = getOrigin(c)
  c.header('Cache-Control', 'no-store')
  return c.json({
    resource: `${issuer}/mcp`,
    authorization_servers: [issuer],
    scopes_supported: []
  })
}
app.get('/.well-known/oauth-protected-resource/mcp', protectedResourceMetadata)
app.get('/.well-known/oauth-protected-resource', protectedResourceMetadata)

// RFC 7591 Dynamic Client Registration
app.post('/register', async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  c.header('Cache-Control', 'no-store')
  return c.json(
    {
      client_id: crypto.randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_secret_expires_at: 0,
      redirect_uris: body.redirect_uris ?? [],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code']
    },
    201
  )
})

// Entry point for Claude.ai's OAuth flow
app.get('/authorize', (c) => {
  const q = c.req.query()
  const { client_id, redirect_uri, response_type, state, code_challenge, code_challenge_method } = q

  if (response_type !== 'code') return c.text('unsupported_response_type', 400)
  if (!redirect_uri || !code_challenge || !state) return c.text('invalid_request', 400)
  if (code_challenge_method !== 'S256') return c.text('invalid_request: only S256 supported', 400)

  const nonce = storePendingRequest({
    clientId: client_id ?? '',
    redirectUri: redirect_uri,
    state,
    codeChallenge: code_challenge,
    codeChallengeMethod: code_challenge_method
  })

  return c.redirect(getAuthUrl(`mcp:${nonce}`))
})

// Direct Google auth (manual setup / re-auth)
app.get('/auth', (c) => c.redirect(getAuthUrl()))

app.get('/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  if (!code) return c.text('Missing authorization code', 400)

  try {
    await handleCallback(code)
  } catch (e) {
    return c.text(`Authentication failed: ${String(e)}`, 500)
  }

  // MCP OAuth flow: redirect back to Claude.ai with an auth code
  if (state?.startsWith('mcp:')) {
    const nonce = state.slice(4)
    const pending = consumePendingRequest(nonce)
    if (pending) {
      const authCode = generateAuthCode(pending.codeChallenge, pending.codeChallengeMethod, pending.redirectUri)
      const redirectUrl = new URL(pending.redirectUri)
      redirectUrl.searchParams.set('code', authCode)
      redirectUrl.searchParams.set('state', pending.state)
      return c.redirect(redirectUrl.toString())
    }
  }

  return c.html(
    '<h1>Connected!</h1><p>Your Google account is linked. Close this tab and start using Google Tasks in Claude.</p>'
  )
})

// Claude.ai exchanges the auth code for an access token
app.post('/token', async (c) => {
  c.header('Cache-Control', 'no-store')
  let body: Record<string, string>
  const ct = c.req.header('content-type') ?? ''
  if (ct.includes('application/x-www-form-urlencoded')) {
    body = Object.fromEntries(new URLSearchParams(await c.req.text())) as Record<string, string>
  } else {
    body = (await c.req.json()) as Record<string, string>
  }

  const { grant_type, code, code_verifier, redirect_uri, refresh_token } = body

  if (grant_type === 'refresh_token') {
    if (!refresh_token) return c.json({ error: 'invalid_request' }, 400)
    const refreshed = await refreshAccessToken(refresh_token)
    if (!refreshed) return c.json({ error: 'invalid_grant' }, 400)
    return c.json({
      access_token: refreshed.accessToken,
      token_type: 'bearer',
      expires_in: refreshed.expiresIn,
      refresh_token: refreshed.refreshToken
    })
  }

  if (grant_type !== 'authorization_code') {
    return c.json({ error: 'unsupported_grant_type' }, 400)
  }
  if (!code || !code_verifier || !redirect_uri) {
    return c.json({ error: 'invalid_request' }, 400)
  }
  if (!validateAndConsumeCode(code, code_verifier, redirect_uri)) {
    return c.json({ error: 'invalid_grant' }, 400)
  }

  const issued = await issueTokens()

  return c.json({
    access_token: issued.accessToken,
    token_type: 'bearer',
    expires_in: issued.expiresIn,
    refresh_token: issued.refreshToken
  })
})

app.get('/health', (c) => c.json({ ok: true }))

app.all('/mcp', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    const origin = getOrigin(c)
    return c.json(
      { error: 'Unauthorized. Connect via Claude.ai or run the OAuth flow.', authUrl: `${origin}/authorize` },
      401
    )
  }

  const token = authHeader.slice(7)
  if (!(await validateAccessToken(token))) {
    return c.json({ error: 'Invalid or expired access token' }, 401)
  }

  const tokens = await loadTokens()
  if (!tokens) {
    const origin = getOrigin(c)
    return c.json(
      { error: 'Not authenticated with Google. Visit /auth to connect your Google account.', authUrl: `${origin}/auth` },
      401
    )
  }

  return handleMcpRequest(c.req.raw)
})

export default app
