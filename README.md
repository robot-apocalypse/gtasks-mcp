# gtasks-mcp

A self-hosted [Model Context Protocol](https://modelcontextprotocol.io) server for Google Tasks. Lets Claude read and manage your tasks via natural language.

## Features

- Full Google Tasks CRUD via 5 MCP tools
- Google OAuth 2.0 authentication
- Encrypted token storage (AES-256-GCM)
- HTTP Streamable transport — works with Claude.ai remote connectors
- Tailscale Funnel for secure public exposure — no reverse proxy needed
- Docker + docker-compose, auto-updates via Watchtower

---

## How It Works

The server runs as a Docker container on your home server. A **Tailscale sidecar container** authenticates to your tailnet and exposes the server over [Tailscale Funnel](https://tailscale.com/kb/1223/funnel) — a feature that makes your server reachable at a stable public HTTPS URL (`https://gtasks-mcp.your-tailnet.ts.net`) without opening firewall ports or configuring a reverse proxy.

Claude.ai connects to that URL to call the MCP tools. Port 3000 is never exposed to the host — it's only reachable within the shared Docker network namespace.

---

## Prerequisites

- A home server running Docker
- A [Tailscale](https://tailscale.com) account (free tier works)
- A Google account

---

## Setup

### 1. Enable Tailscale Funnel

Funnel must be enabled for your tailnet before it will work.

1. Go to [Tailscale Admin → DNS](https://login.tailscale.com/admin/dns) and enable **HTTPS Certificates**
2. Go to [Tailscale Admin → Access Controls](https://login.tailscale.com/admin/acls) and add Funnel to your policy:

```json
"nodeAttrs": [
  {
    "target": ["*"],
    "attr":   ["funnel"]
  }
]
```

### 2. Get a Tailscale Auth Key

Go to [Tailscale Admin → Settings → Keys](https://login.tailscale.com/admin/settings/keys) and generate an auth key.

- Check **Reusable** and set no expiry (recommended for a server that may restart)
- Copy the key — you'll add it to `.env` as `TS_AUTHKEY`

The Tailscale container will authenticate with this key and register as `gtasks-mcp` in your tailnet (set by `hostname:` in `docker-compose.yml`). Your server will then be reachable at `https://gtasks-mcp.your-tailnet.ts.net`.

### 3. Get Google OAuth Credentials

1. Open [Google Cloud Console](https://console.cloud.google.com) and create a project
2. Enable the **Tasks API** (APIs & Services → Enable APIs → search "Tasks API")
3. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
4. Application type: **Web application**
5. Authorized redirect URI: `https://gtasks-mcp.your-tailnet.ts.net/callback`
6. Copy your **Client ID** and **Client Secret**

### 4. Configure

```bash
cp .env.example .env
```

Edit `.env` — replace every placeholder:

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://gtasks-mcp.your-tailnet.ts.net/callback
ENCRYPTION_SECRET=$(openssl rand -base64 32)
TS_AUTHKEY=tskey-auth-xxxx
```

### 5. Run

```bash
docker compose up -d
```

The Tailscale container starts, authenticates to your tailnet, and begins serving. The `gtasks-mcp` container starts and is reachable only through the Tailscale sidecar.

Check that it's up:

```bash
docker compose logs tailscale   # should show "Connected."
docker compose logs gtasks-mcp  # should show the port it's listening on
```

### 6. Authorize with Google

Open `https://gtasks-mcp.your-tailnet.ts.net/auth` in your browser and complete the Google sign-in. You'll see **"Connected!"** when done.

Your tokens are stored encrypted in `./data/tokens.json` and will survive container restarts.

### 7. Add to Claude.ai

Go to **Claude.ai → Settings → Connectors → Add Custom Connector**:

- **Name**: Google Tasks
- **URL**: `https://gtasks-mcp.your-tailnet.ts.net/mcp`

Click **Connect**. Claude will open the Google OAuth flow and your tasks will be available immediately.

---

## Tailscale Serve Config

The included `tailscale-serve.json` tells Tailscale to:
- Terminate HTTPS on port 443 using your tailnet's automatically-provisioned certificate
- Proxy all requests to `http://127.0.0.1:3000` (the app, via the shared network namespace)
- Enable Funnel so the URL is reachable from the public internet (not just your tailnet)

You don't need to modify this file.

---

## Auto-Updates (Watchtower)

The `watchtower` service in `docker-compose.yml` automatically pulls updated images for `tailscale` and `gtasks-mcp` every night at 3 AM and restarts them if a new version is available. It is scoped to this stack via the `com.centurylinklabs.watchtower.scope=gtasks-mcp` label.

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
npm run dev            # starts on http://localhost:3000
npm test               # run unit tests
npm run build          # compile TypeScript to dist/
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | OAuth 2.0 client ID from GCP |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth 2.0 client secret from GCP |
| `GOOGLE_REDIRECT_URI` | Yes | Must match GCP console exactly |
| `ENCRYPTION_SECRET` | Yes | Min 32 chars — used for AES-256-GCM token encryption |
| `TS_AUTHKEY` | Yes | Tailscale auth key for the sidecar container |
| `PORT` | No | HTTP port (default: `3000`) |

---

## Architecture

```
GET  /auth       → Redirect to Google OAuth consent screen
GET  /callback   → Exchange auth code for tokens, encrypt and save
GET  /health     → 200 OK
ALL  /mcp        → MCP Streamable HTTP endpoint (requires auth)
```

Tokens are stored encrypted in `data/tokens.json` on a bind-mounted volume. On each request they are loaded and refreshed automatically if expired — you should never need to re-authorize unless you explicitly revoke access in your Google account.

---

## License

MIT
