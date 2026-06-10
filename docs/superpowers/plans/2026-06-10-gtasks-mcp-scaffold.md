# gtasks-mcp Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the complete gtasks-mcp server — a self-hosted Google Tasks MCP server using Hono + MCP SDK v2, containerized with Docker, and published to GitHub as an open source project.

**Architecture:** Hono HTTP server with MCP v2 Streamable HTTP transport on `/mcp`, Google OAuth 2.0 for auth with AES-256-GCM encrypted token storage, and five MCP tools for reading and managing Google Tasks.

**Tech Stack:** Node.js 20+, TypeScript, Hono, `@modelcontextprotocol/server`, `@modelcontextprotocol/hono`, googleapis, zod, Docker, GitHub

---

## File Map

```
src/
├── index.ts           — Entry point: starts @hono/node-server
├── server.ts          — Hono app: /auth /callback /health /mcp routes + MCP transport setup
├── auth/
│   ├── oauth.ts       — Google OAuth2 client: getAuthUrl, handleCallback, getAuthenticatedClient
│   └── storage.ts     — AES-256-GCM encrypt/decrypt + read/write data/tokens.json
├── tools/
│   ├── index.ts       — Calls registerTaskListTools + registerTaskTools
│   ├── taskLists.ts   — list_task_lists tool
│   └── tasks.ts       — list_tasks, create_task, update_task, delete_task tools
├── google/
│   └── client.ts      — Returns authenticated Google Tasks API client
└── mcp/
    └── transport.ts   — Creates McpServer + WebStandardStreamableHTTPServerTransport

Config:
package.json, tsconfig.json, .gitignore, .env.example
Dockerfile, docker-compose.yml
README.md
data/.gitkeep
src/auth/storage.test.ts  — Unit tests for encrypt/decrypt
```

---

## Task 1: Project Initialization

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `data/.gitkeep`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "gtasks-mcp",
  "version": "1.0.0",
  "description": "Self-hosted Google Tasks MCP server for Claude.ai",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@hono/node-server": "^1.14.0",
    "@modelcontextprotocol/hono": "^2.0.0",
    "@modelcontextprotocol/server": "^2.0.0",
    "googleapis": "^144.0.0",
    "hono": "^4.7.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Write .gitignore**

```
node_modules/
dist/
.env
data/tokens.json
*.local
```

- [ ] **Step 4: Write .env.example**

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://your-host/callback
ENCRYPTION_SECRET=generate-32-plus-random-chars-here
PORT=3000
LOG_LEVEL=info
```

- [ ] **Step 5: Create data/.gitkeep**

```bash
mkdir -p data && touch data/.gitkeep
```

- [ ] **Step 6: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json .gitignore .env.example data/.gitkeep
git commit -m "chore: initialize project"
```

---

## Task 2: Token Storage + Tests

**Files:**
- Create: `src/auth/storage.ts`
- Create: `src/auth/storage.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/auth/storage.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { encryptTokens, decryptTokens } from './storage.js'

describe('token storage', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_SECRET = 'test-secret-that-is-at-least-32-chars-long'
  })

  it('round-trips token data through encrypt/decrypt', () => {
    const tokens = {
      access_token: 'ya29.test-access-token',
      refresh_token: '1//test-refresh-token',
      expiry_date: 1700000000000
    }
    const encrypted = encryptTokens(tokens)
    expect(encrypted.iv).toBeTruthy()
    expect(encrypted.tag).toBeTruthy()
    expect(encrypted.data).toBeTruthy()
    expect(encrypted.data).not.toContain('ya29')

    const decrypted = decryptTokens(encrypted)
    expect(decrypted).toEqual(tokens)
  })

  it('produces different ciphertext for each call (random IV)', () => {
    const tokens = { access_token: 'x', refresh_token: 'y', expiry_date: 0 }
    const a = encryptTokens(tokens)
    const b = encryptTokens(tokens)
    expect(a.iv).not.toBe(b.iv)
    expect(a.data).not.toBe(b.data)
  })

  it('throws when ENCRYPTION_SECRET is missing', () => {
    delete process.env.ENCRYPTION_SECRET
    expect(() => encryptTokens({ access_token: '', refresh_token: '', expiry_date: 0 })).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL with "Cannot find module './storage.js'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/auth/storage.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/auth/storage.ts src/auth/storage.test.ts
git commit -m "feat: add AES-256-GCM token encryption/storage"
```

---

## Task 3: OAuth Flow

**Files:**
- Create: `src/auth/oauth.ts`

- [ ] **Step 1: Write implementation**

```typescript
// src/auth/oauth.ts
import { google } from 'googleapis'
import { saveTokens, loadTokens, type Tokens } from './storage.js'

const SCOPES = ['https://www.googleapis.com/auth/tasks']

function createClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

export function getAuthUrl(): string {
  return createClient().generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  })
}

export async function handleCallback(code: string): Promise<void> {
  const client = createClient()
  const { tokens } = await client.getToken(code)
  await saveTokens({
    access_token: tokens.access_token!,
    refresh_token: tokens.refresh_token!,
    expiry_date: tokens.expiry_date!
  })
}

export async function getAuthenticatedClient() {
  const tokens = await loadTokens()
  if (!tokens) return null

  const client = createClient()
  client.setCredentials(tokens)

  client.on('tokens', async (fresh) => {
    const current = await loadTokens()
    const merged: Tokens = {
      access_token: fresh.access_token ?? current?.access_token ?? '',
      refresh_token: fresh.refresh_token ?? current?.refresh_token ?? '',
      expiry_date: fresh.expiry_date ?? current?.expiry_date ?? 0
    }
    await saveTokens(merged)
  })

  return client
}
```

- [ ] **Step 2: Commit**

```bash
git add src/auth/oauth.ts
git commit -m "feat: add Google OAuth2 flow"
```

---

## Task 4: Google API Client

**Files:**
- Create: `src/google/client.ts`

- [ ] **Step 1: Write implementation**

```typescript
// src/google/client.ts
import { google } from 'googleapis'
import { getAuthenticatedClient } from '../auth/oauth.js'

export async function getTasksClient() {
  const auth = await getAuthenticatedClient()
  if (!auth) {
    throw new Error(
      'Not authenticated. Visit /auth to connect your Google account.'
    )
  }
  return google.tasks({ version: 'v1', auth })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/google/client.ts
git commit -m "feat: add authenticated Google Tasks API client"
```

---

## Task 5: Task Lists Tool

**Files:**
- Create: `src/tools/taskLists.ts`

- [ ] **Step 1: Write implementation**

```typescript
// src/tools/taskLists.ts
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { getTasksClient } from '../google/client.js'

export function registerTaskListTools(server: McpServer) {
  server.registerTool(
    'list_task_lists',
    {
      description: 'Returns all Google Task lists for the authenticated user',
      inputSchema: z.object({})
    },
    async () => {
      const tasks = await getTasksClient()
      const res = await tasks.tasklists.list()
      const lists = (res.data.items ?? []).map((l) => ({
        id: l.id,
        title: l.title,
        updated: l.updated
      }))
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(lists, null, 2) }]
      }
    }
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tools/taskLists.ts
git commit -m "feat: add list_task_lists MCP tool"
```

---

## Task 6: Tasks CRUD Tools

**Files:**
- Create: `src/tools/tasks.ts`

- [ ] **Step 1: Write implementation**

```typescript
// src/tools/tasks.ts
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { getTasksClient } from '../google/client.js'

export function registerTaskTools(server: McpServer) {
  server.registerTool(
    'list_tasks',
    {
      description: 'Returns tasks in a specific task list',
      inputSchema: z.object({
        taskListId: z.string().describe('The ID of the task list'),
        showCompleted: z
          .boolean()
          .optional()
          .describe('Include completed tasks (default: false)')
      })
    },
    async ({ taskListId, showCompleted = false }) => {
      const tasks = await getTasksClient()
      const res = await tasks.tasks.list({
        tasklist: taskListId,
        showCompleted,
        showHidden: showCompleted
      })
      const items = (res.data.items ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        notes: t.notes,
        due: t.due,
        completed: t.completed,
        status: t.status
      }))
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(items, null, 2) }]
      }
    }
  )

  server.registerTool(
    'create_task',
    {
      description: 'Creates a new task in a task list',
      inputSchema: z.object({
        taskListId: z.string().describe('The ID of the task list'),
        title: z.string().describe('Task title'),
        notes: z.string().optional().describe('Task notes/description'),
        due: z
          .string()
          .optional()
          .describe('Due date as RFC3339 string, e.g. 2024-12-31T00:00:00.000Z')
      })
    },
    async ({ taskListId, title, notes, due }) => {
      const tasks = await getTasksClient()
      const res = await tasks.tasks.insert({
        tasklist: taskListId,
        requestBody: { title, notes, due }
      })
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(res.data, null, 2) }]
      }
    }
  )

  server.registerTool(
    'update_task',
    {
      description:
        'Updates an existing task. Use status "completed" to mark done, "needsAction" to reopen.',
      inputSchema: z.object({
        taskListId: z.string().describe('The ID of the task list'),
        taskId: z.string().describe('The ID of the task to update'),
        title: z.string().optional().describe('New task title'),
        notes: z.string().optional().describe('New task notes'),
        due: z.string().optional().describe('New due date as RFC3339 string'),
        status: z
          .enum(['needsAction', 'completed'])
          .optional()
          .describe('Task completion status')
      })
    },
    async ({ taskListId, taskId, title, notes, due, status }) => {
      const tasks = await getTasksClient()
      const requestBody: Record<string, string> = {}
      if (title !== undefined) requestBody.title = title
      if (notes !== undefined) requestBody.notes = notes
      if (due !== undefined) requestBody.due = due
      if (status !== undefined) requestBody.status = status
      const res = await tasks.tasks.patch({
        tasklist: taskListId,
        task: taskId,
        requestBody
      })
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(res.data, null, 2) }]
      }
    }
  )

  server.registerTool(
    'delete_task',
    {
      description: 'Permanently deletes a task',
      inputSchema: z.object({
        taskListId: z.string().describe('The ID of the task list'),
        taskId: z.string().describe('The ID of the task to delete')
      })
    },
    async ({ taskListId, taskId }) => {
      const tasks = await getTasksClient()
      await tasks.tasks.delete({ tasklist: taskListId, task: taskId })
      return {
        content: [{ type: 'text' as const, text: `Task ${taskId} deleted.` }]
      }
    }
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tools/tasks.ts
git commit -m "feat: add list_tasks, create_task, update_task, delete_task MCP tools"
```

---

## Task 7: Tool Registration

**Files:**
- Create: `src/tools/index.ts`

- [ ] **Step 1: Write implementation**

```typescript
// src/tools/index.ts
import type { McpServer } from '@modelcontextprotocol/server'
import { registerTaskListTools } from './taskLists.js'
import { registerTaskTools } from './tasks.js'

export function registerAllTools(server: McpServer): void {
  registerTaskListTools(server)
  registerTaskTools(server)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tools/index.ts
git commit -m "feat: register all MCP tools"
```

---

## Task 8: MCP Server + Transport

**Files:**
- Create: `src/mcp/transport.ts`

- [ ] **Step 1: Write implementation**

```typescript
// src/mcp/transport.ts
import { McpServer, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server'
import { registerAllTools } from '../tools/index.js'

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'gtasks-mcp', version: '1.0.0' })
  registerAllTools(server)
  return server
}

export function createTransport(): WebStandardStreamableHTTPServerTransport {
  return new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mcp/transport.ts
git commit -m "feat: add MCP server + Streamable HTTP transport"
```

---

## Task 9: Hono Server + Entry Point

**Files:**
- Create: `src/server.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Write server.ts**

```typescript
// src/server.ts
import { Hono } from 'hono'
import { createMcpHonoApp } from '@modelcontextprotocol/hono'
import { createMcpServer, createTransport } from './mcp/transport.js'
import { getAuthUrl, handleCallback } from './auth/oauth.js'
import { loadTokens } from './auth/storage.js'

const mcpServer = createMcpServer()
const transport = createTransport()
await mcpServer.connect(transport)

const app = createMcpHonoApp()

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
  return transport.handleRequest(c.req.raw, { parsedBody: c.get('parsedBody') })
})

export default app
```

- [ ] **Step 2: Write index.ts**

```typescript
// src/index.ts
import { serve } from '@hono/node-server'
import app from './server.js'

const port = parseInt(process.env.PORT ?? '3000')

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`gtasks-mcp running on http://localhost:${info.port}`)
  console.log(`Authorize: http://localhost:${info.port}/auth`)
})
```

- [ ] **Step 3: Run TypeScript type check**

```bash
npm run build
```

Expected: `dist/` directory created, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/server.ts src/index.ts
git commit -m "feat: add Hono server with auth, health, and MCP routes"
```

---

## Task 10: Docker Setup

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: Write Dockerfile**

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runner
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
RUN mkdir -p data && chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Write docker-compose.yml**

```yaml
services:
  gtasks-mcp:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    env_file:
      - .env
    restart: unless-stopped
```

- [ ] **Step 3: Commit**

```bash
git add Dockerfile docker-compose.yml
git commit -m "feat: add Docker multi-stage build and compose config"
```

---

## Task 11: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README.md**

```markdown
# gtasks-mcp

A self-hosted [Model Context Protocol](https://modelcontextprotocol.io) server for Google Tasks. Lets Claude read and manage your tasks via natural language.

## Features

- Full Google Tasks CRUD via MCP tools
- Google OAuth 2.0 authentication
- Encrypted token storage (AES-256-GCM)
- HTTP/Streamable transport — works with Claude.ai remote connectors
- Docker + docker-compose for easy self-hosting

## Quick Start

### 1. Get Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable **Tasks API**
3. Go to **APIs & Services → Credentials → Create OAuth 2.0 Client ID**
4. Application type: **Web application**
5. Authorized redirect URI: `https://your-host/callback`
6. Copy your Client ID and Client Secret

### 2. Configure

```bash
cp .env.example .env
```

Fill in `.env`:

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://your-host/callback
ENCRYPTION_SECRET=$(openssl rand -base64 32)
```

### 3. Run

```bash
docker compose up -d
```

### 4. Authorize

Open `https://your-host/auth` in your browser and complete the Google sign-in. You'll see "Connected!" when done.

### 5. Add to Claude.ai

Go to **Claude.ai → Settings → Connectors → Add Custom Connector**:

- **Name**: Google Tasks
- **URL**: `https://your-host/mcp`

Click Connect. Your tasks are now available in Claude.

## Tailscale Funnel (Home Server)

If hosting on a home server (e.g., running on a machine named `zeno`):

```bash
tailscale funnel 3000
```

Your server is now reachable at `https://zeno.your-tailnet.ts.net`. Use that domain for `GOOGLE_REDIRECT_URI` and the Claude.ai connector URL.

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_task_lists` | Get all your task lists |
| `list_tasks` | Get tasks in a list (optionally include completed) |
| `create_task` | Create a new task with title, notes, and due date |
| `update_task` | Update a task or mark it complete/incomplete |
| `delete_task` | Permanently delete a task |

## Development

```bash
npm install
cp .env.example .env   # fill in real values
npm run dev            # starts on port 3000
npm test               # run tests
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | OAuth 2.0 client ID from GCP |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth 2.0 client secret from GCP |
| `GOOGLE_REDIRECT_URI` | Yes | Must match GCP console exactly |
| `ENCRYPTION_SECRET` | Yes | Min 32 chars — used for token encryption |
| `PORT` | No | Default: 3000 |

## License

MIT
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with self-hosting instructions"
```

---

## Task 12: GitHub + Initial Publish

- [ ] **Step 1: Initialize git and create repo**

```bash
git init
gh repo create gtasks-mcp --public --description "Self-hosted Google Tasks MCP server for Claude.ai" --source=. --remote=origin --push
```

Expected: repo created at `https://github.com/<user>/gtasks-mcp`, all commits pushed.

- [ ] **Step 2: Add topics to repo**

```bash
gh repo edit --add-topic mcp,google-tasks,claude-ai,self-hosted,typescript
```

- [ ] **Step 3: Verify**

```bash
gh repo view --web
```

Expected: browser opens to the published repo showing the README.
