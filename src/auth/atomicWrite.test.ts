import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { atomicWrite } from './atomicWrite.js'

const tmpFiles: string[] = []

async function tmpPath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atomicwrite-'))
  const p = path.join(dir, 'store.json')
  tmpFiles.push(p)
  return p
}

afterEach(async () => {
  await Promise.all(tmpFiles.map((p) => fs.rm(path.dirname(p), { recursive: true, force: true })))
  tmpFiles.length = 0
})

describe('atomicWrite', () => {
  it('leaves a valid, fully-written file under concurrent writes to the same path', async () => {
    const dest = await tmpPath()
    // Fire many overlapping writes at once — the old shared-tmp code raced here.
    const writes = Array.from({ length: 50 }, (_, i) =>
      atomicWrite(dest, JSON.stringify({ n: i, payload: 'x'.repeat(1000) }))
    )
    await expect(Promise.all(writes)).resolves.toBeDefined()

    const raw = await fs.readFile(dest, 'utf8')
    const parsed = JSON.parse(raw) as { n: number }
    expect(parsed.n).toBeGreaterThanOrEqual(0)
    expect(parsed.n).toBeLessThan(50)

    // No stray temp files left behind in the directory.
    const leftovers = (await fs.readdir(path.dirname(dest))).filter((f) => f.includes('.tmp'))
    expect(leftovers).toEqual([])
  })

  it('applies the last queued write, in order', async () => {
    const dest = await tmpPath()
    for (let i = 0; i < 10; i++) await atomicWrite(dest, String(i))
    expect(await fs.readFile(dest, 'utf8')).toBe('9')
  })
})
