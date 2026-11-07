import { describe, expect, it } from 'vitest'
import { CodexSession, type CodexTransport } from '../src/core/codex'
import { AssistantBrain } from '../src/core/assistant/brain'
import { brainAnimation, emptyAssistantMemory, restoreAssistant, type AssistantMemory } from '../src/core/assistant/types'
import { getClip } from '../src/core/animation/clips'

export class ScriptedCodex implements CodexTransport {
  sent: { id?: number | string; method?: string; params?: any; result?: any }[] = []
  private line = (_line: string) => {}
  private exit = (_code: number | null) => {}
  private threads = 0
  private turns = 0
  servers: any[] = []
  private configs = new Map<string, any>()
  async start() {}
  send(line: string) {
    const message = JSON.parse(line)
    this.sent.push(message)
    if (!message.method || message.id === undefined) return
    const result = message.method === 'account/read' ? { account: { type: 'chatgpt' }, requiresOpenaiAuth: true }
      : message.method === 'model/list' ? { data: [{ id: 'configured-model', displayName: 'Configured model' }] }
      : message.method === 'thread/start' ? { thread: { id: `thread-${++this.threads}` } }
      : message.method === 'thread/resume' ? { thread: { id: message.params.threadId } }
      : message.method === 'turn/start' ? { turn: { id: `turn-${++this.turns}`, status: 'inProgress' } }
      : message.method === 'mcpServerStatus/list' ? { data: this.servers.map(server => this.configs.get(message.params.threadId)?.mcp_servers?.[server.name]?.enabled === false ? { ...server, runtimeStatus: 'disabled', tools: {} } : server), nextCursor: null } : {}
    if (message.method === 'thread/start' || message.method === 'thread/resume') this.configs.set(result.thread!.id, message.params.config)
    this.push({ id: message.id, result })
  }
  onLine(listener: (line: string) => void) { this.line = listener }
  onExit(listener: (code: number | null) => void) { this.exit = listener }
  stop() {}
  push(value: unknown) { this.line(JSON.stringify(value)) }
  disconnect() { this.exit(1) }
  calls(method: string) { return this.sent.filter(m => m.method === method) }
}
async function setup(memory?: AssistantMemory) {
  let time = 100000
  let saved = emptyAssistantMemory()
  const session = new CodexSession()
  const transport = new ScriptedCodex()
  const brain = new AssistantBrain({ session, neutralCwd: '/neutral', readProject: async path => ({ path, root: path, name: path.split('/').at(-1)!, branch: 'main', remote: '', conflicts: false }), persist: m => { saved = JSON.parse(JSON.stringify(m)) }, memory, now: () => time, enabled: () => true })
  await session.connect(transport, { cwd: '/neutral', sandbox: 'read-only' })
  return { brain, session, transport, saved: () => saved, advance: (n: number) => { time += n } }
}

describe('Assistant Brain', () => {
  it('treats window titles as probable and asks for a project without running tools', async () => {
    const { brain, transport } = await setup()
    await brain.register('/projects/alpha')
    brain.selectProject(null)
    brain.observeApplication('Code', 'alpha — editor')
    expect(brain.snapshot().confidence).toBe('probable')
    expect(brain.snapshot().selectedProjectId).toBeNull()
    await brain.ask('Review the project changes')
    expect(transport.calls('turn/start')).toHaveLength(0)
    expect(brain.snapshot().conversations.at(-1)?.messages.at(-1)?.text).toContain('Which project')
  })

  it('isolates simultaneous projects, threads and streamed responses', async () => {
    const { brain, transport } = await setup()
    const a = await brain.register('/projects/alpha')
    await brain.ask('Review current changes')
    const first = brain.snapshot().tasks.at(-1)!
    const b = await brain.register('/projects/beta')
    await brain.ask('Explain this project')
    const second = brain.snapshot().tasks.at(-1)!
    expect(first.threadId).not.toBe(second.threadId)
    transport.push({ method: 'item/agentMessage/delta', params: { threadId: first.threadId, delta: '[[explain]]\nAlpha only' } })
    transport.push({ method: 'item/agentMessage/delta', params: { threadId: second.threadId, delta: '[[explain]]\nBeta only' } })
    const snap = brain.snapshot()
    expect(snap.conversations.find(c => c.projectId === a.id)?.messages.at(-1)?.text).toBe('Alpha only')
    expect(snap.conversations.find(c => c.projectId === b.id)?.messages.at(-1)?.text).toBe('Beta only')
    const threads = transport.calls('thread/start').slice(-2)
    expect(threads[0].params.cwd).toBe('/projects/alpha')
    expect(threads[1].params.cwd).toBe('/projects/beta')
    expect(threads[1].params.developerInstructions).not.toContain('/projects/alpha')
  })

  it('requires app approval before work starts and preserves native approvals', async () => {
    const { brain, transport, session } = await setup()
    await brain.register('/projects/alpha')
    await brain.ask('Run the tests and fix the failure', 'execute')
    expect(transport.calls('turn/start')).toHaveLength(0)
    const gate = brain.snapshot().approval!
    expect(gate.appGate).toBe(true)
    await brain.approve(gate.id, true)
    expect(transport.calls('turn/start')).toHaveLength(1)
    const threadId = brain.snapshot().tasks.at(-1)!.threadId
    transport.push({ id: 'native-one', method: 'item/commandExecution/requestApproval', params: { threadId, command: 'npm test', cwd: '/projects/alpha' } })
    transport.push({ id: 'native-two', method: 'item/fileChange/requestApproval', params: { threadId, reason: 'Fix test' } })
    expect(session.pendingApproval?.id).toBe('native-one')
    expect(transport.sent.some(m => m.id === 'native-one' && m.result)).toBe(false)
    await brain.approve('native-one', false)
    expect(transport.sent.at(-1)?.result).toEqual({ decision: 'decline' })
    expect(session.pendingApproval?.id).toBe('native-two')
    await brain.approve('native-two', false)
    expect(session.pendingApproval).toBeNull()
    const started = transport.calls('thread/start').at(-1)!.params
    expect(started.approvalPolicy).toBe('untrusted')
    expect(started.approvalsReviewer).toBe('user')
  })

  it('does not execute declined work or upgrade an inspect thread', async () => {
    const { brain, transport } = await setup()
    await brain.register('/projects/alpha')
    await brain.ask('Review changes')
    const task = brain.snapshot().tasks.at(-1)!
    transport.push({ method: 'turn/completed', params: { threadId: task.threadId, turn: { status: 'completed' } } })
    const inspectConversation = task.conversationId
    await brain.ask('Fix the code', 'execute')
    expect(brain.snapshot().currentConversationId).not.toBe(inspectConversation)
    await brain.approve(brain.snapshot().approval!.id, false)
    expect(transport.calls('turn/start')).toHaveLength(1)
    expect(brain.snapshot().tasks.at(-1)?.status).toBe('cancelled')
  })

  it('confirms cancellation and completion only from terminal server events', async () => {
    const { brain, transport } = await setup()
    await brain.register('/projects/alpha')
    await brain.ask('Review changes')
    const task = brain.snapshot().tasks.at(-1)!
    await brain.cancel(task.id)
    expect(brain.snapshot().tasks.at(-1)?.status).toBe('running')
    expect(transport.calls('turn/interrupt')).toHaveLength(1)
    transport.push({ method: 'turn/completed', params: { threadId: task.threadId, turn: { status: 'interrupted' } } })
    expect(brain.snapshot().tasks.at(-1)?.status).toBe('cancelled')
    expect(brain.snapshot().state).not.toBe('completed')
  })

  it('marks tasks interrupted after disconnect and restart, without claiming success', async () => {
    const { brain, transport, saved } = await setup()
    await brain.register('/projects/alpha')
    await brain.ask('Review changes')
    expect(restoreAssistant(saved()).tasks.at(-1)?.status).toBe('interrupted')
    transport.disconnect()
    expect(brain.snapshot().state).toBe('disconnected')
    expect(brain.snapshot().tasks.at(-1)?.status).toBe('interrupted')
  })

  it('deduplicates suggestions, honours cooldown and remembers dismissals', async () => {
    const { brain, advance, saved } = await setup()
    const project = await brain.register('/projects/alpha')
    const event = { type: 'test_failed' as const, projectId: project.id, source: 'integration' as const }
    brain.receive(event); brain.receive(event)
    expect(brain.snapshot().suggestions).toHaveLength(1)
    expect(brain.snapshot().tasks).toHaveLength(0)
    advance(600001)
    brain.receive(event)
    expect(brain.snapshot().suggestions).toHaveLength(2)
    await brain.actOnSuggestion(brain.snapshot().suggestions.at(-1)!.id, 'dismiss')
    advance(3600000); brain.receive(event)
    expect(brain.snapshot().suggestions).toHaveLength(2)
    expect(restoreAssistant(saved(), 1000000).suggestions.some(s => s.status === 'dismissed')).toBe(true)
  })

  it('never starts a suggestion merely by displaying or explaining it', async () => {
    const { brain, transport } = await setup()
    const project = await brain.register('/projects/alpha')
    brain.receive({ type: 'merge_conflict', projectId: project.id, source: 'integration' })
    const suggestion = brain.snapshot().suggestions[0]
    await brain.actOnSuggestion(suggestion.id, 'more')
    expect(transport.calls('turn/start')).toHaveLength(0)
    await brain.actOnSuggestion(suggestion.id, 'do')
    expect(transport.calls('turn/start')).toHaveLength(1)
  })

  it('discovers permission/authentication states and disables MCP on inspect threads', async () => {
    const { brain, transport } = await setup()
    transport.servers = [{ name: 'calendar', authStatus: 'notLoggedIn', runtimeStatus: 'authenticationRequired', tools: { write: { description: 'Create an event', inputSchema: {} } } }]
    await brain.register('/projects/alpha')
    await brain.discover()
    expect(brain.snapshot().capabilities.find(c => c.id === 'calendar/write')?.status).toBe('requires_authentication')
    await brain.ask('Review changes')
    expect(transport.calls('thread/start').at(-1)?.params.config).toEqual({ mcp_servers: { calendar: { command: '/usr/bin/false', enabled: false } } })
  })

  it('persists conversation references while redacting recognised credentials', async () => {
    const { brain, transport, saved } = await setup()
    await brain.register('/projects/alpha')
    await brain.ask('Explain sk-abcdefghijklmnopqrstuv')
    const task = brain.snapshot().tasks.at(-1)!
    transport.push({ method: 'turn/completed', params: { threadId: task.threadId, turn: { status: 'completed' } } })
    expect(JSON.stringify(saved())).not.toContain('sk-abcdefgh')
    const restored = await setup(saved())
    restored.brain.resumeConversation(task.conversationId)
    await restored.brain.ask('Continue the review')
    expect(restored.transport.calls('thread/resume').at(-1)?.params.threadId).toBe(task.threadId)
  })

  it('uses real handlers for isolated simulations and maps every brain state to a real clip', () => {
    const brain = new AssistantBrain({ session: new CodexSession(), neutralCwd: '/sim', simulated: true, persist: () => {}, readProject: async () => { throw new Error('No filesystem') } })
    for (const kind of ['Project detected', 'Test failed', 'Codex running', 'Approval requested', 'Approval rejected', 'Codex completed', 'Connection lost', 'Connection restored']) brain.simulate(kind)
    expect(brain.snapshot().simulated).toBe(true)
    expect(brain.snapshot().events.some(e => e.description.includes('SIM'))).toBe(true)
    for (const state of ['disconnected', 'idle', 'observing', 'thinking', 'waiting_approval', 'executing', 'responding', 'completed', 'failed'] as const) expect(getClip(brainAnimation(state))).toBeDefined()
  })
})
