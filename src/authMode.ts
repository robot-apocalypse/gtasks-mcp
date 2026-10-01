import crypto from 'node:crypto'

// AUTH_MODE=oauth (default): this server is its own OAuth authorization server
// for Claude.ai, gated by Google sign-in and ALLOWED_GOOGLE_EMAILS.
//
// AUTH_MODE=none: run behind a gateway that handles sign-in (for example
// mcp-latchkey). Only /health and /mcp exist and /mcp trusts every caller, so
// the server must be reachable only by the gateway; it binds 127.0.0.1 by
// default in this mode. Google Tasks credentials (data/tokens.json) must
// already exist.
export type AuthMode = 'oauth' | 'none'

export function authMode(): AuthMode {
  const m = process.env.AUTH_MODE ?? 'oauth'
  if (m !== 'oauth' && m !== 'none') throw new Error(`AUTH_MODE must be "oauth" or "none", got "${m}"`)
  return m
}

/**
 * AUTH_MODE=none with UPSTREAM_TOKEN set: callers must still present
 * `Authorization: Bearer <UPSTREAM_TOKEN>`. The gateway sends it; anything else
 * that can reach the port (other processes in the same network namespace) is
 * refused. Unset means no check (localhost trust only).
 */
export function upstreamTokenOk(authorization: string | undefined): boolean {
  const expected = process.env.UPSTREAM_TOKEN
  if (!expected) return true
  const got = /^Bearer\s+(\S+)$/i.exec(authorization ?? '')?.[1] ?? ''
  const a = crypto.createHash('sha256').update(got).digest()
  const b = crypto.createHash('sha256').update(expected).digest()
  return crypto.timingSafeEqual(a, b)
}
