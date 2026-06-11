# gtasks-mcp

A self-hosted Google Tasks MCP server. Lets Claude (and other MCP clients) read and manage Google Tasks via natural language. Built to run on a home server and expose via Tailscale Funnel.

## What This Is

A remote MCP server that:
- Speaks HTTP/SSE (Server-Sent Events) transport — required for Claude.ai remote connectors
- Authenticates with Google via OAuth 2.0
- Stores tokens encrypted in a JSON file on a Docker volume
- Runs as a Docker container managed by docker-compose

## Context

Built by Ian Buffington. Primary use case: personal productivity, accessed from Claude.ai on desktop and mobile. Hosted on a home server (Zeno) exposed to the internet via Tailscale Funnel. The goal is a clean, well-documented open source project others can self-host.

## Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **HTTP framework**: Hono (lightweight, good TS support)
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Google API**: `googleapis` npm package
- **Token encryption**: AES-256-GCM via Node crypto (no external deps)
- **Containerization**: Docker + docker-compose

## Project Structure

```
gtasks-mcp/
├── src/
│   ├── index.ts          # Entry point — starts HTTP server
│   ├── server.ts         # Hono app, route definitions
│   ├── auth/
│   │   ├── oauth.ts      # Google OAuth flow (redirect, callback, token refresh)
│   │   └── storage.ts    # Encrypted token read/write to JSON file
│   ├── tools/
│   │   ├── index.ts      # Registers all tools with MCP server
│   │   ├── taskLists.ts  # list_task_lists, create_task_list, update_task_list, delete_task_list
│   │   └── tasks.ts      # list_tasks, create_task, update_task, delete_task, move_task, clear_completed_tasks
│   ├── google/
│   │   └── client.ts     # Authenticated Google Tasks API client
│   └── mcp/
│       └── transport.ts  # SSE transport setup for MCP
├── data/                 # Mounted Docker volume — stores encrypted tokens.json
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── .gitignore
├── tsconfig.json
├── package.json
└── README.md
```

## MCP Tools

### `list_task_lists`
Returns all task lists for the authenticated user.
- Params: none
- Returns: array of `{ id, title, updated }`

### `create_task_list`
Creates a new task list.
- Params: `title` (string)
- Returns: created task list object

### `update_task_list`
Renames a task list.
- Params: `taskListId` (string), `title` (string)
- Returns: updated task list object

### `delete_task_list`
Permanently deletes a task list and all its tasks.
- Params: `taskListId` (string)
- Returns: confirmation

### `list_tasks`
Returns tasks in a specific task list.
- Params: `taskListId` (string), `showCompleted?` (boolean, default false)
- Returns: array of `{ id, title, notes, due, completed, status }`

### `create_task`
Creates a new task.
- Params: `taskListId` (string), `title` (string), `notes?` (string), `due?` (RFC3339 date string)
- Returns: created task object

### `update_task`
Updates an existing task. Also used to mark complete/incomplete.
- Params: `taskListId` (string), `taskId` (string), `title?` (string), `notes?` (string), `due?` (string), `status?` (`"needsAction"` | `"completed"`)
- Returns: updated task object

### `delete_task`
Deletes a task permanently.
- Params: `taskListId` (string), `taskId` (string)
- Returns: confirmation

### `move_task`
Moves a task to a different position or a different task list.
- Params: `taskListId` (string), `taskId` (string), `destinationTaskListId?` (string), `previousTaskId?` (string — place after this task; omit for top), `parentTaskId?` (string — make subtask)
- Returns: updated task object (or newly created task if moved to another list)

### `clear_completed_tasks`
Permanently deletes all completed tasks from a task list.
- Params: `taskListId` (string)
- Returns: confirmation

## Auth Flow

1. User hits `/auth` → redirected to Google OAuth consent screen
2. Google redirects to `/callback` with auth code
3. Server exchanges code for access + refresh tokens
4. Tokens encrypted with AES-256-GCM and written to `data/tokens.json`
5. On each request, tokens loaded and refreshed automatically if expired
6. MCP endpoint at `/mcp` — requires valid tokens, returns 401 with auth URL if not authed

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | GCP OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | GCP OAuth 2.0 client secret |
| `GOOGLE_REDIRECT_URI` | Yes | Must match GCP console — e.g. `https://zeno.tail1234.ts.net/callback` |
| `ENCRYPTION_SECRET` | Yes | Min 32 chars, random. Used for AES-256-GCM token encryption |
| `PORT` | No | Default 3000 |
| `LOG_LEVEL` | No | `debug` \| `info` \| `warn` \| `error`. Default `info` |

## Docker Setup

`docker-compose.yml` should:
- Build from local Dockerfile
- Mount `./data` as a volume at `/app/data`
- Load env from `.env` file
- Expose port 3000
- Restart unless stopped

`Dockerfile` should:
- Use `node:20-alpine`
- Build TypeScript in a multi-stage build
- Run as non-root user
- Final image runs `node dist/index.js`

## Tailscale Funnel Setup

After the container is running on Zeno:
```bash
tailscale funnel 3000
```
This exposes port 3000 at `https://zeno.<tailnet>.ts.net`. Use that URL as `GOOGLE_REDIRECT_URI` and as the MCP server URL in Claude.ai settings.

## Claude.ai Integration

In Claude.ai → Settings → Connectors → Add Custom Connector:
- **Name**: Google Tasks
- **URL**: `https://zeno.<tailnet>.ts.net/mcp`

Click Connect → OAuth flow opens in browser → done.

## Development Notes

- Token storage path: `data/tokens.json` (relative to project root, or `/app/data/tokens.json` in container)
- If `data/tokens.json` doesn't exist or is invalid, all MCP tool calls should return a helpful error pointing to `/auth`
- The `/auth` endpoint should be accessible without authentication
- Refresh tokens automatically — never make the user re-auth unless the refresh token is revoked
- Error messages should be human-readable (Claude will surface them to the user)

## What Good Looks Like

- `docker compose up` → server running
- Hit `/auth` in browser → Google consent → redirected back → "Connected" message
- Add MCP URL to Claude.ai → tools available immediately
- "What are my task lists?" works in Claude
- Tokens survive container restart (volume mount)
- README is good enough that a stranger can self-host it in 15 minutes
