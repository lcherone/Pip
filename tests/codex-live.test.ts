import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { CodexSession } from '../src/core/codex'
import { AppServerTransport } from '../src/core/assistant/transport'

// Opt-in: uses the existing Codex login and may consume account usage.
describe.skipIf(process.env.PIP_LIVE_CODEX !== '1')('real Codex integration', () => {
  let session: CodexSession | null = null
  let directory = ''
  afterEach(async () => { await session?.disconnect(); if (directory) await rm(directory, { recursive: true, force: true }) })
  it('uses the advertised model, requests approval, reads one fixture, and confirms completion', async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'pip-codex-live-'))
    await writeFile(path.join(directory, 'README.md'), 'The verification phrase is golden paws.\n')
    session = new CodexSession()
    let text = ''
    let status = ''
    let completed!: () => void
    const done = new Promise<void>(resolve => { completed = resolve })
    session.on(event => {
      if (event.type === 'approval') {
        // This test grants only this exact read. It never grants writes or external actions.
        const command = event.approval.detail.split('\n')[0]
        session!.respondApproval(/^(?:\/bin\/(?:zsh|bash) -lc ['"])?cat README\.md['"]?$/.test(command))
      }
      if (event.type === 'reply') text = event.reply.say
      if (event.type === 'turn' && event.state !== 'started') { status = event.state; completed() }
    })
    await session.connect(new AppServerTransport(async () => process.env.PIP_CODEX_BIN || 'codex'), { cwd: directory, sandbox: 'read-only', lazyThread: true })
    expect(session.status).toBe('ready')
    const thread = await session.openThread({ cwd: directory, sandbox: 'read-only', instructions: 'Only read README.md in this fixture. No modifications, network or MCP tools.' })
    await session.askThread(thread, 'Run only cat README.md using a read-only command and tell me the verification phrase. Do not change files or use MCP tools.')
    await done
    expect(status).toBe('completed')
    expect(text).toContain('golden paws')
    expect(await readFile(path.join(directory, 'README.md'), 'utf8')).toBe('The verification phrase is golden paws.\n')
  }, 90000)
})
