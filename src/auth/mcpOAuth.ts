import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_TOKENS_PATH = path.join(__dirname, '..', '..', 'data', 'mcp-tokens.json')

// Access tokens are short-lived; Claude silently refreshes them with the
// long-lived refresh token, so the user never has to re-run the OAuth flow.
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

function tokensPath(): string {
  return process.env.MCP_TOKENS_PATH ?? DEFAULT_TOKENS_PATH
}

interface PendingRequest {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
  codeChallengeMethod: string
  expiresAt: number
}

interface PendingCode {
  codeChallenge: string
  codeChallengeMethod: string
  redirectUri: string
  expiresAt: number
}

const pendingRequests = new Map<string, PendingRequest>()
const pendingCodes = new Map<string, PendingCode>()

export function storePendingRequest(req: Omit<PendingRequest, 'expiresAt'>): string {
  const nonce = crypto.randomBytes(16).toString('hex')
  pendingRequests.set(nonce, { ...req, expiresAt: Date.now() + 5 * 60 * 1000 })
  return nonce
}

export function consumePendingRequest(nonce: string): Omit<PendingRequest, 'expiresAt'> | null {
  const req = pendingRequests.get(nonce)
  pendingRequests.delete(nonce)
  if (!req || req.expiresAt < Date.now()) return null
  const { expiresAt: _, ...rest } = req
  return rest
}

export function generateAuthCode(codeChallenge: string, codeChallengeMethod: string, redirectUri: string): string {
  const code = crypto.randomBytes(32).toString('base64url')
  pendingCodes.set(code, {
    codeChallenge,
    codeChallengeMethod,
    redirectUri,
    expiresAt: Date.now() + 10 * 60 * 1000
  })
  return code
}

export function validateAndConsumeCode(code: string, codeVerifier: string, redirectUri: string): boolean {
  const pending = pendingCodes.get(code)
  pendingCodes.delete(code)
  if (!pending || pending.expiresAt < Date.now()) return false
  if (pending.redirectUri !== redirectUri) return false

  const computed =
    pending.codeChallengeMethod === 'S256'
      ? crypto.createHash('sha256').update(codeVerifier).digest('base64url')
      : codeVerifier

  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(pending.codeChallenge))
  } catch {
    return false
  }
}

// Multi-token store: many access tokens (one per device/session) and their
// refresh tokens coexist, so connecting a new client never invalidates others.
interface TokenStore {
  accessTokens: Record<string, { expiresAt: number }>
  refreshTokens: Record<string, { createdAt: number }>
}

let store: TokenStore | null = null

export function _resetStore(): void {
  store = null
}

async function loadStore(): Promise<TokenStore> {
  if (store) return store
  try {
    const raw = await fs.readFile(tokensPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<TokenStore>
    store = {
      accessTokens: parsed.accessTokens ?? {},
      refreshTokens: parsed.refreshTokens ?? {}
    }
  } catch {
    store = { accessTokens: {}, refreshTokens: {} }
  }
  return store
}

async function persist(s: TokenStore): Promise<void> {
  const p = tokensPath()
  await fs.mkdir(path.dirname(p), { recursive: true })
  const tmp = `${p}.tmp`
  await fs.writeFile(tmp, JSON.stringify(s, null, 2), 'utf8')
  await fs.rename(tmp, p)
}

function pruneExpired(s: TokenStore): void {
  const now = Date.now()
  for (const [token, meta] of Object.entries(s.accessTokens)) {
    if (meta.expiresAt < now) delete s.accessTokens[token]
  }
}

export interface IssuedTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

async function mintAccessToken(s: TokenStore): Promise<string> {
  pruneExpired(s)
  const accessToken = crypto.randomBytes(32).toString('base64url')
  s.accessTokens[accessToken] = { expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS }
  return accessToken
}

// Issued after a successful authorization_code exchange.
export async function issueTokens(): Promise<IssuedTokens> {
  const s = await loadStore()
  const accessToken = await mintAccessToken(s)
  const refreshToken = crypto.randomBytes(32).toString('base64url')
  s.refreshTokens[refreshToken] = { createdAt: Date.now() }
  await persist(s)
  return { accessToken, refreshToken, expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000) }
}

// Exchanges a refresh token for a fresh access token. The refresh token is
// long-lived and non-rotating, so the same one keeps working indefinitely.
export async function refreshAccessToken(refreshToken: string): Promise<IssuedTokens | null> {
  const s = await loadStore()
  if (!s.refreshTokens[refreshToken]) return null
  const accessToken = await mintAccessToken(s)
  await persist(s)
  return { accessToken, refreshToken, expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000) }
}

export async function validateAccessToken(token: string): Promise<boolean> {
  const s = await loadStore()
  const meta = s.accessTokens[token]
  if (!meta) return false
  if (meta.expiresAt < Date.now()) {
    delete s.accessTokens[token]
    await persist(s)
    return false
  }
  return true
}
