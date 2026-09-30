// Redirect URIs this server will send an MCP authorization code to.
//
// Without this check /authorize would redirect to any caller-supplied URI: an
// attacker could build their own PKCE pair, send the owner an /authorize link
// with redirect_uri=https://attacker.example, and after the owner signs in with
// their allowlisted Google account the code (and so a non-expiring refresh
// token) would land with the attacker.
//
// Defaults are Claude's documented callback URLs (claude.ai web, Desktop,
// mobile and Cowork all use them; claude.com is the announced future one).
// See https://claude.com/docs/connectors/building/authentication
export const DEFAULT_REDIRECT_URIS = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback'
]

/** From ALLOWED_REDIRECT_URIS (comma-separated, exact match); defaults to Claude's callbacks. */
export function allowedRedirectUris(): string[] {
  const configured = (process.env.ALLOWED_REDIRECT_URIS ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
  return configured.length > 0 ? configured : DEFAULT_REDIRECT_URIS
}

/** Exact string match only: no prefix, host or wildcard matching. */
export function isAllowedRedirectUri(uri: string | undefined | null): boolean {
  if (!uri) return false
  return allowedRedirectUris().includes(uri)
}
