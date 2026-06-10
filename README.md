# gtasks-mcp

A self-hosted [Model Context Protocol](https://modelcontextprotocol.io) server for Google Tasks. Lets Claude read and manage your tasks via natural language.

## Features

- Full Google Tasks CRUD via 5 MCP tools
- Google OAuth 2.0 authentication
- Encrypted token storage (AES-256-GCM)
- HTTP Streamable transport — works with Claude.ai remote connectors
- Docker + docker-compose for easy self-hosting
- Tokens survive container restarts via volume mount

## Quick Start

### 1. Get Google OAuth Credentials

1. Open [Google Cloud Console](https://console.cloud.google.com) and create a project
2. Enable the **Tasks API** (APIs & Services → Enable APIs → search "Tasks API")
3. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
4. Application type: **Web application**
5. Authorized redirect URI: `https://your-host/callback`
6. Copy your **Client ID** and **Client Secret**

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env`:

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

Open `https://your-host/auth` in your browser and complete the Google sign-in. You'll see **"Connected!"** when done.

### 5. Add to Claude.ai

Go to **Claude.ai → Settings → Connectors → Add Custom Connector**:

- **Name**: Google Tasks
- **URL**: `https://your-host/mcp`

Click **Connect**. Your tasks are now available in Claude.

---

## Tailscale Funnel (Home Server)

If self-hosting on a home server (e.g. a machine named `zeno`):

```bash
tailscale funnel 3000
```

Your server is then reachable at `https://zeno.your-tailnet.ts.net`. Use that domain for `GOOGLE_REDIRECT_URI` and the Claude.ai connector URL.

---

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_task_lists` | Get all your Google Task lists |
| `list_tasks` | Get tasks in a list (optionally include completed) |
| `create_task` | Create a task with title, notes, and due date |
| `update_task` | Update a task or mark it complete/incomplete |
| `delete_task` | Permanently delete a task |

---

## Development

```bash
npm install
cp .env.example .env   # fill in real values
npm run dev            # starts on port 3000
npm test               # run unit tests
npm run build          # compile TypeScript
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | OAuth 2.0 client ID from GCP |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth 2.0 client secret from GCP |
| `GOOGLE_REDIRECT_URI` | Yes | Must match GCP console exactly |
| `ENCRYPTION_SECRET` | Yes | Min 32 chars — used for AES-256-GCM token encryption |
| `PORT` | No | HTTP port (default: `3000`) |

---

## Architecture

```
GET  /auth       → Redirect to Google OAuth consent screen
GET  /callback   → Exchange auth code for tokens, encrypt and save
GET  /health     → 200 OK
ALL  /mcp        → MCP Streamable HTTP endpoint (requires auth)
```

Tokens are stored encrypted in `data/tokens.json` on a Docker volume. On each request, tokens are loaded and refreshed automatically if expired.

---

## License

MIT
