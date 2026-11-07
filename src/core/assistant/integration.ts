import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import type { BrainSignal, Project } from './types'

/** Same-user, opt-in Unix socket. Receipts carry structured metadata, never instructions. */
export function startIntegration(socketPath: string, projects: () => Project[], receive: (signal: BrainSignal) => void): () => void {
  if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath)
  const server = net.createServer(socket => {
    let buffer = ''
    let handled = false
    socket.setTimeout(2000, () => socket.destroy())
    socket.on('error', () => {})
    socket.on('data', chunk => {
      if (handled) return
      buffer += chunk.toString()
      if (buffer.length > 8192) { socket.end('Request too large\n'); return }
      if (!buffer.includes('\n')) return
      handled = true
      try {
        const event = JSON.parse(buffer.split('\n')[0])
        const directory = fs.realpathSync(String(event.path))
        const project = projects().find(p => p.path === directory)
        if (!project) throw new Error('Project is not registered')
        if (!['workspace', 'test_failed', 'build_failed', 'merge_conflict'].includes(event.type)) throw new Error('Unsupported event')
        const file = typeof event.file === 'string' && !path.isAbsolute(event.file) && !event.file.split(/[\\/]/).includes('..') ? event.file : undefined
        receive({ type: event.type, projectId: project.id, source: 'integration', file })
        socket.end('Accepted\n')
      } catch (error) { socket.end(`${error instanceof Error ? error.message : 'Invalid event'}\n`) }
    })
  })
  server.on('error', () => {})
  server.listen(socketPath, () => fs.chmodSync(socketPath, 0o600))
  return () => { server.close(); if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath) }
}
