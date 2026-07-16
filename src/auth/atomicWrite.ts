import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

// Serializes writes per destination path and gives each write its own temp
// file. Without this, concurrent callers (MCP token minting on every request,
// Google token auto-refresh, the OAuth callback) all wrote to a single shared
// `${dest}.tmp` and raced: overlapping writers corrupt the temp file or make
// the second `rename` throw ENOENT, which surfaced as a spurious 401 /
// "not connected" during reconnect.
const chains = new Map<string, Promise<unknown>>()

async function writeOnce(dest: string, data: string): Promise<void> {
  await fs.mkdir(path.dirname(dest), { recursive: true })
  const tmp = `${dest}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
  try {
    await fs.writeFile(tmp, data, 'utf8')
    await fs.rename(tmp, dest)
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw e
  }
}

// Snapshot `data` is captured by the caller before this returns, so the bytes
// written reflect state at call time even though the write itself is queued.
export function atomicWrite(dest: string, data: string): Promise<void> {
  const run = (chains.get(dest) ?? Promise.resolve()).then(
    () => writeOnce(dest, data),
    () => writeOnce(dest, data) // proceed even if the previous queued write failed
  )
  // Tail of the chain swallows errors so one failure can't wedge later writes;
  // the returned `run` still rejects so callers see their own write's result.
  chains.set(dest, run.catch(() => {}))
  return run
}
