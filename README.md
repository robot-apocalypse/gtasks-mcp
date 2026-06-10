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
GOOGLE_REDIRECT_URI=https://gtasks-mcp.your-tailnet.ts.net/callback
ENCRYPTION_SECRET=$(openssl rand -base64 32)
```

### 3. Run

```bash
docker compose up -d
```

### 4. Authorize

Open `https://gtasks-mcp.your-tailnet.ts.net/auth` in your browser and complete the Google sign-in. You'll see **"Connected!"** when done.

### 5. Add to Claude.ai

Go to **Claude.ai → Settings → Connectors → Add Custom Connector**:

- **Name**: Google Tasks
- **URL**: `https://gtasks-mcp.your-tailnet.ts.net/mcp`

Click **Connect**. Your tasks are now available in Claude.

---

## Tailscale Funnel (Home Server)

This project uses a **Tailscale sidecar container** to expose the server over Tailscale Funnel — no `tailscale` CLI needed on the host.

The `docker-compose.yml` includes:
- `tailscale` sidecar — authenticates to your tailnet and runs the serve config
- `gtasks-mcp` — shares the tailscale container's network via `network_mode: service:tailscale`
- `watchtower` — auto-updates images nightly

**Setup:**

1. Generate a [Tailscale auth key](https://login.tailscale.com/admin/settings/keys) (reusable, no expiry recommended for servers)
2. Add to `.env`: `TS_AUTHKEY=tskey-auth-xxxx`
3. Set `GOOGLE_REDIRECT_URI=https://gtasks-mcp.your-tailnet.ts.net/callback` (the `hostname:` in docker-compose is `gtasks-mcp`)
4. Enable Funnel for the node in your [Tailscale admin console](https://login.tailscale.com/admin/machines)
5. `docker compose up -d`

Your server will be reachable at `https://gtasks-mcp.your-tailnet.ts.net`. Use that as the Claude.ai connector URL.

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
