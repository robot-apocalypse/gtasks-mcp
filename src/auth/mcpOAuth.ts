import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ACCESS_TOKEN_PATH = path.join(__dirname, '..', '..', 'data', 'mcp-access-token.txt')

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

export function generateAccessToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

export async function saveAccessToken(token: string): Promise<void> {
  const dir = path.dirname(ACCESS_TOKEN_PATH)
  await fs.mkdir(dir, { recursive: true })
  const tmp = `${ACCESS_TOKEN_PATH}.tmp`
  await fs.writeFile(tmp, token, 'utf8')
  await fs.rename(tmp, ACCESS_TOKEN_PATH)
}

export async function loadAccessToken(): Promise<string | null> {
  try {
    return (await fs.readFile(ACCESS_TOKEN_PATH, 'utf8')).trim()
  } catch {
    return null
  }
}

export async function validateAccessToken(token: string): Promise<boolean> {
  const stored = await loadAccessToken()
  if (!stored) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(stored))
  } catch {
    return false
  }
}
