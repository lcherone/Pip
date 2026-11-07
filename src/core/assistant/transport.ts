import { spawn, type ChildProcess } from 'node:child_process'
import type { CodexTransport } from '../codex'

/** One owned stdio process shared by all Assistant Brain conversations. */
export class AppServerTransport implements CodexTransport {
  private child: ChildProcess | null = null
  private buffer = ''
  private line = (_line: string) => {}
  private exit = (_code: number | null) => {}
  constructor(private binary: () => Promise<string | null>, private diagnostic: () => void = () => {}) {}
  async start(): Promise<void> {
    const bin = await this.binary()
    if (!bin) throw new Error('Codex CLI was not found')
    this.child = spawn(bin, ['app-server', '--listen', 'stdio://'], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.child.stdin!.on('error', () => {})
    this.child.stdout!.on('data', chunk => {
      this.buffer += String(chunk)
      if (this.buffer.length > 16 * 1024 * 1024) { this.child?.kill(); return }
      const lines = this.buffer.split('\n')
      this.buffer = lines.pop() ?? ''
      for (const line of lines) if (line.trim()) this.line(line)
    })
    // Avoid persisting stderr, which may contain provider or authentication details.
    this.child.stderr!.on('data', this.diagnostic)
    this.child.on('exit', code => this.exit(code))
    await new Promise<void>((resolve, reject) => {
      this.child!.once('spawn', resolve)
      this.child!.once('error', reject)
    })
  }
  send(line: string) {
    if (!this.child?.stdin?.writable) throw new Error('Codex input is closed')
    this.child.stdin.write(`${line}\n`)
  }
  onLine(listener: (line: string) => void) { this.line = listener }
  onExit(listener: (code: number | null) => void) { this.exit = listener }
  stop() { this.child?.kill(); this.child = null }
}
