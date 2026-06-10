import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TOKEN_PATH = path.join(__dirname, '..', '..', 'data', 'tokens.json')
const ALGORITHM = 'aes-256-gcm'

export interface Tokens {
  access_token: string
  refresh_token: string
  expiry_date: number
}

interface StoredTokens {
  iv: string
  tag: string
  data: string
}

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('ENCRYPTION_SECRET must be at least 32 characters')
  }
  return crypto.scryptSync(secret, 'gtasks-mcp', 32)
}

export function encryptTokens(tokens: Tokens): StoredTokens {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(tokens), 'utf8'),
    cipher.final()
  ])
  return {
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    data: encrypted.toString('hex')
  }
}

export function decryptTokens(stored: StoredTokens): Tokens {
  const key = getKey()
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(stored.iv, 'hex'))
  decipher.setAuthTag(Buffer.from(stored.tag, 'hex'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(stored.data, 'hex')),
    decipher.final()
  ])
  return JSON.parse(decrypted.toString('utf8')) as Tokens
}

export async function saveTokens(tokens: Tokens): Promise<void> {
  await fs.mkdir(path.dirname(TOKEN_PATH), { recursive: true })
  await fs.writeFile(TOKEN_PATH, JSON.stringify(encryptTokens(tokens), null, 2))
}

export async function loadTokens(): Promise<Tokens | null> {
  try {
    const raw = await fs.readFile(TOKEN_PATH, 'utf8')
    return decryptTokens(JSON.parse(raw) as StoredTokens)
  } catch {
    return null
  }
}
