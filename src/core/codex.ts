import { PIP_DEVELOPER_INSTRUCTIONS, parsePuppyReply, type Intention, type PuppyReply } from './reply'
import type { SandboxChoice } from './settings'

export type CodexStatus = 'disabled' | 'unavailable' | 'starting' | 'needs_auth' | 'ready' | 'busy' | 'error' | 'disconnected'

export interface CodexTransport {
  start(): Promise<void>
  send(line: string): void
  onLine(listener: (line: string) => void): void
  onExit(listener: (code: number | null) => void): void
  stop(): void
}

export interface ApprovalView {
  id: number | string
  threadId?: string
  questions?: { id: string; question: string; options: string[] }[]
  method: string
  title: string
  detail: string
}

export type CodexListener = (event: CodexEvent) => void

export type CodexEvent =
  | { type: 'status'; status: CodexStatus; detail?: string }
  | { type: 'models'; models: { id: string; displayName: string }[] }
  | { type: 'delta'; text: string; threadId?: string }
  | { type: 'reply'; reply: PuppyReply; threadId?: string }
  | { type: 'turn'; state: 'started' | 'completed' | 'failed' | 'cancelled'; detail?: string; threadId?: string; turnId?: string }
  | { type: 'approval'; approval: ApprovalView }
  | { type: 'approval-cleared' }
  | { type: 'uncertain'; threadId: string; detail: string }
  | { type: 'item'; threadId: string; item: Record<string, unknown>; phase: 'started' | 'completed' | 'progress' }

export interface CodexConnectOptions {
  cwd: string
  model?: string
  sandbox: SandboxChoice
  threadId?: string | null
  instructions?: string
  disableMcp?: string[]
  lazyThread?: boolean
}

interface PendingRpc {
  method: string
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const MAX_RECONNECTS = 3

export class CodexSession {
  status: CodexStatus = 'disabled'
  models: { id: string; displayName: string }[] = []
  private defaultModel: string | undefined
  private modelEfforts = new Map<string, string>()
  threadId: string | null = null
  pendingApproval: ApprovalView | null = null
  reconnects = 0
  private transport: CodexTransport | null = null
  private nextId = 1
  private pending = new Map<number, PendingRpc>()
  private listeners = new Set<CodexListener>()
  private buffer = ''
  private turnId: string | null = null
  private agentText = ''
  private turns = new Map<string, string>()
  private texts = new Map<string, string>()
  private approvals: ApprovalView[] = []
  private generation = 0
  private items = new Map<string, Record<string, unknown>>()
  private enabled = false
  private options: CodexConnectOptions | null = null
  private stopping = false
  private sentApprovals = new Set<number | string>()

  on(listener: CodexListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async connect(transport: CodexTransport, options: CodexConnectOptions): Promise<void> {
    this.rejectAll(new Error('Codex connection replaced'))
    this.transport?.stop()
    const generation = ++this.generation
    this.sentApprovals.clear()
    this.lastParams.clear()
    this.approvals = []
    this.pendingApproval = null
    this.stopping = false
    this.enabled = true
    this.options = options
    this.transport = transport
    this.setStatus('starting', 'Starting Codex')
    transport.onLine((line) => { if (generation === this.generation) this.ingest(line) })
    transport.onExit((code) => { if (generation === this.generation) this.handleExit(code) })
    await transport.start()
    const init = await this.request('initialize', {
      clientInfo: { name: 'pip', title: 'Pip', version: '1.0.0' },
      capabilities: { experimentalApi: false, requestAttestation: false },
    })
    void init
    this.notify('initialized', {})
    let authenticated = false
    const account = await this.request('account/read', { refreshToken: false }) as { account?: unknown; requiresOpenaiAuth?: boolean }
    if ('account' in account) authenticated = Boolean(account.account) || account.requiresOpenaiAuth === false
    else {
      // Compatibility with older installed App Server releases.
      const auth = await this.request('getAuthStatus', { includeToken: false, refreshToken: false }) as { authMethod?: string; requiresOpenaiAuth?: boolean }
      authenticated = Boolean(auth.authMethod) || auth.requiresOpenaiAuth === false
    }
    if (!authenticated) {
      this.setStatus('needs_auth', 'Sign in with codex login, then reconnect Pip.')
      return
    }
    const listed = await this.request('model/list', { limit: 40 }) as { data?: { id?: string; model?: string; displayName?: string; isDefault?: boolean; defaultReasoningEffort?: string }[] }
    this.models = (listed?.data ?? [])
      .map((model) => ({ id: model.model || model.id || '', displayName: model.displayName || model.model || model.id || '' }))
      .filter((model) => model.id)
    const defaultEntry = listed.data?.find(model => model.isDefault) ?? listed.data?.[0]
    this.defaultModel = defaultEntry?.model ?? defaultEntry?.id
    this.modelEfforts = new Map((listed.data ?? []).filter(model => model.defaultReasoningEffort).map(model => [model.model ?? model.id ?? '', model.defaultReasoningEffort!]))
    this.emit({ type: 'models', models: this.models })
    if (!options.lazyThread) await this.ensureThread(options)
    this.setStatus('ready', 'Codex is ready')
  }

  async disconnect(): Promise<void> {
    this.stopping = true
    this.enabled = false
    while (this.pendingApproval) this.respondApproval(false)
    let timer: ReturnType<typeof setTimeout> | undefined
    const cancellations = [...this.turns].filter(([, id]) => id).map(([threadId, turnId]) => this.request('turn/interrupt', { threadId, turnId }))
    await Promise.race([Promise.allSettled(cancellations), new Promise(resolve => { timer = setTimeout(resolve, 1000) })])
    if (timer) clearTimeout(timer)
    this.rejectAll(new Error('Codex disconnected'))
    this.generation += 1
    this.transport?.stop()
    this.transport = null
    this.turns.clear()
    this.texts.clear()
    this.turnId = null
    this.setStatus('disabled')
  }

  async ask(text: string, prompt: string): Promise<void> {
    if (!this.threadId || !['ready', 'busy'].includes(this.status)) {
      const say = this.status === 'needs_auth' ? 'Codex needs a login. Run codex login, then reconnect.' : 'Codex is not connected. I can still keep you company.'
      this.emit({ type: 'reply', reply: { say, intention: 'report_problem' } })
      return
    }
    await this.askThread(this.threadId, prompt)
    void text
  }

  async askThread(threadId: string, prompt: string): Promise<void> {
    if (!this.transport || !['ready', 'busy'].includes(this.status)) throw new Error('Codex is not ready')
    if (this.turns.has(threadId)) throw new Error('This conversation already has an active task')
    this.texts.set(threadId, '')
    this.turns.set(threadId, '')
    this.setStatus('busy', 'Thinking')
    this.emit({ type: 'turn', state: 'started', threadId })
    try {
      const response = await this.request('turn/start', {
        threadId, input: [{ type: 'text', text: prompt, text_elements: [] }],
      }) as { turn?: { id?: string } }
      if (this.turns.has(threadId)) this.turns.set(threadId, response.turn?.id ?? '')
    } catch (error) {
      if (this.turns.get(threadId)) return // A turn/started notification already confirmed execution.
      if (error instanceof Error && error.message.includes('timed out') && this.turns.has(threadId)) {
        this.emit({ type: 'uncertain', threadId, detail: 'Turn start was not confirmed. Reconnect or stop before retrying.' })
        throw error
      }
      this.turns.delete(threadId)
      this.setStatus(this.turns.size ? 'busy' : 'ready')
      this.emit({ type: 'turn', state: 'failed', threadId, detail: error instanceof Error ? error.message : 'Turn failed' })
      throw error
    }
  }

  async cancel(threadId: string): Promise<void> {
    const turnId = this.turns.get(threadId)
    if (turnId === undefined) return
    if (!turnId) throw new Error('The task is still starting. Try Stop again shortly.')
    await this.request('turn/interrupt', { threadId, turnId })
  }

  async openThread(options: CodexConnectOptions): Promise<string> {
    let id = await this.ensureThread(options, false)
    if (options.disableMcp) {
      const inventory = await this.discoverTools(id)
      const remaining = inventory.filter(server => server.runtimeStatus !== 'disabled').map(server => String(server.name))
      if (remaining.length) {
        id = await this.ensureThread({ ...options, threadId: id, disableMcp: [...new Set([...options.disableMcp, ...remaining])] }, false)
        const checked = await this.discoverTools(id)
        if (checked.some(server => server.runtimeStatus !== 'disabled')) {
          throw new Error('This Codex configuration cannot isolate external tools for an inspect-only conversation. Use an explicitly approved Work task.')
        }
      }
    }
    return id
  }

  async discoverTools(threadId?: string): Promise<Record<string, unknown>[]> {
    const servers: Record<string, unknown>[] = []
    let cursor: string | null = null
    do {
      const response = await this.request('mcpServerStatus/list', { threadId, cursor, limit: 50, detail: 'toolsAndAuthOnly' }) as { data?: Record<string, unknown>[]; nextCursor?: string | null }
      servers.push(...(response.data ?? []))
      cursor = response.nextCursor ?? null
    } while (cursor && servers.length < 200)
    if (cursor) throw new Error('MCP inventory exceeds the safe discovery limit')
    return servers
  }

  respondApproval(accept: boolean, answers?: Record<string, string>): void {
    const approval = this.pendingApproval
    if (!approval || this.sentApprovals.has(approval.id)) return
    this.sentApprovals.add(approval.id)
    if (this.sentApprovals.size > 1024) this.sentApprovals.delete(this.sentApprovals.values().next().value!)
    const result = approval.method === 'item/tool/requestUserInput'
      ? { kind: 'ok' as const, value: { answers: Object.fromEntries((approval.questions ?? []).map((q) => [q.id, { answers: [accept ? answers?.[q.id] ?? 'Decline' : 'Decline'] }])) } }
      : approvalResult(approval.method, accept, this.lastParams.get(approval.id))
    if (result.kind === 'error') this.respondError(approval.id, result.message)
    else this.respond(approval.id, result.value)
    this.lastParams.delete(approval.id)
    this.pendingApproval = this.approvals.shift() ?? null
    this.emit({ type: 'approval-cleared' })
    if (this.pendingApproval) this.emit({ type: 'approval', approval: this.pendingApproval })
  }

  private lastParams = new Map<number | string, Record<string, unknown>>()

  private async ensureThread(options: CodexConnectOptions, useDefault = true): Promise<string> {
    const sandbox = options.sandbox === 'workspace-write' ? 'workspace-write' : 'read-only'
    const model = options.model ?? this.options?.model ?? this.defaultModel
    const effort = model ? this.modelEfforts.get(model) : undefined
    const common = {
      cwd: options.cwd,
      approvalPolicy: 'untrusted',
      approvalsReviewer: 'user',
      sandbox,
      developerInstructions: [PIP_DEVELOPER_INSTRUCTIONS, options.instructions ?? ''].join('\n'),
      config: {
        ...(options.disableMcp?.length ? { mcp_servers: Object.fromEntries(options.disableMcp.map(name => [name, { command: '/usr/bin/false', enabled: false }])) } : {}),
        ...(effort ? { model_reasoning_effort: effort } : {}),
      },
      ...(model ? { model } : {}),
    }
    if (options.threadId) {
      try {
        const resumed = await this.request('thread/resume', { threadId: options.threadId, ...common }) as { thread?: { id?: string } }
        const id = resumed?.thread?.id ?? options.threadId
        if (useDefault) this.threadId = id
        return id
      } catch {
        if (useDefault) this.threadId = null
      }
    }
    const started = await this.request('thread/start', { ...common, ephemeral: false }) as { thread?: { id?: string } }
    const id = started?.thread?.id
    if (!id) throw new Error('App Server did not return a thread ID')
    if (useDefault) this.threadId = id
    if (id) {
      try {
        await this.request('thread/name/set', { threadId: id, name: 'Pip' })
      } catch {
        /* naming is optional */
      }
    }
    return id
  }

  private ingest(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return
    let message: Record<string, unknown>
    try {
      message = JSON.parse(trimmed) as Record<string, unknown>
    } catch {
      return
    }
    const id = typeof message.id === 'number' || typeof message.id === 'string' ? message.id : null
    const method = typeof message.method === 'string' ? message.method : null
    if (id !== null && method) {
      this.handleServerRequest(id, method, (message.params ?? {}) as Record<string, unknown>)
      return
    }
    if (id !== null && ('result' in message || 'error' in message)) {
      const waiter = typeof id === 'number' ? this.pending.get(id) : undefined
      if (!waiter) return
      this.pending.delete(id as number)
      clearTimeout(waiter.timer)
      if ('error' in message && message.error) {
        const err = message.error as { message?: string }
        waiter.reject(new Error(err.message || 'Codex request failed'))
      } else waiter.resolve(message.result)
      return
    }
    if (method) this.handleNotification(method, (message.params ?? {}) as Record<string, unknown>)
  }

  private handleNotification(method: string, params: Record<string, unknown>): void {
    const threadId = typeof params.threadId === 'string' ? params.threadId : this.threadId ?? ''
    if (method === 'account/updated' && params.authMode === null) {
      this.setStatus('needs_auth', 'Codex authentication changed. Sign in and reconnect.')
      return
    }
    if (method === 'item/agentMessage/delta' && typeof params.delta === 'string') {
      const text = ((this.texts.get(threadId) ?? '') + params.delta).slice(-100000)
      this.texts.set(threadId, text)
      this.emit({ type: 'delta', text, threadId })
    } else if (method === 'turn/started') {
      const turn = params.turn as { id?: string }
      if (turn?.id) this.turns.set(threadId, turn.id)
    } else if (method === 'turn/completed') {
      const turn = params.turn as { status?: string; id?: string; error?: { message?: string } }
      const text = this.texts.get(threadId) ?? ''
      const state = turn?.status === 'completed' ? 'completed' : turn?.status === 'interrupted' ? 'cancelled' : 'failed'
      if (state !== 'cancelled') {
        const reply = parsePuppyReply(text || turn?.error?.message || (state === 'completed' ? 'Done.' : 'The task failed.'))
        this.emit({ type: 'reply', threadId, reply: state === 'failed' ? { ...reply, intention: 'report_problem' } : reply })
      }
      this.turns.delete(threadId)
      this.texts.delete(threadId)
      this.emit({ type: 'turn', state, threadId, turnId: turn?.id, detail: turn?.error?.message })
      this.setStatus(this.turns.size ? 'busy' : 'ready')
    } else if (method === 'item/started' || method === 'item/completed' || method.endsWith('/progress') || method.endsWith('/outputDelta')) {
      const item = (params.item ?? params) as Record<string, unknown>
      if (typeof item.id === 'string') {
        this.items.set(item.id, item)
        if (this.items.size > 100) this.items.delete(this.items.keys().next().value!)
      }
      this.emit({ type: 'item', threadId, phase: method === 'item/started' ? 'started' : method === 'item/completed' ? 'completed' : 'progress', item: (params.item ?? params) as Record<string, unknown> })
    } else if (method === 'serverRequest/resolved') {
      const requestId = params.requestId
      if (typeof requestId === 'string' || typeof requestId === 'number') this.lastParams.delete(requestId)
      this.approvals = this.approvals.filter((a) => a.id !== requestId)
      if (this.pendingApproval?.id === requestId) {
        this.pendingApproval = this.approvals.shift() ?? null
        this.emit({ type: 'approval-cleared' })
        if (this.pendingApproval) this.emit({ type: 'approval', approval: this.pendingApproval })
      }
    } else if (method === 'error' && params.willRetry !== true) {
      const error = params.error as { message?: string }
      this.emit({ type: 'turn', state: 'failed', threadId, detail: error?.message })
    }
  }

  private handleServerRequest(id: number | string, method: string, params: Record<string, unknown>): void {
    if (method === 'account/chatgptAuthTokens/refresh' || method === 'attestation/generate' || method === 'item/tool/call') {
      this.respondError(id, 'Pip does not handle that request')
      return
    }
    if (!['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/permissions/requestApproval', 'execCommandApproval', 'applyPatchApproval', 'item/tool/requestUserInput', 'mcpServer/elicitation/request'].includes(method)) {
      this.respondError(id, 'Pip declined an unsupported request')
      return
    }
    if (this.approvals.length >= 64) { this.respondError(id, 'Too many pending approvals'); return }
    this.lastParams.set(id, params)
    const view = summarizeApproval(id, method, params)
    if (method === 'item/fileChange/requestApproval' && typeof params.itemId === 'string') {
      const item = this.items.get(params.itemId)
      if (item) view.detail += `\n${JSON.stringify(item.changes ?? item).slice(0, 12000)}`
    }
    if (method === 'item/permissions/requestApproval') view.detail += `\nRequested permissions: ${JSON.stringify(params.permissions ?? {}).slice(0, 5000)}`
    view.threadId = typeof params.threadId === 'string' ? params.threadId : undefined
    if (Array.isArray(params.questions)) view.questions = params.questions.map((q: any) => ({ id: String(q.id), question: String(q.question), options: Array.isArray(q.options) ? q.options.map((o: any) => String(o.label)) : [] }))
    if (this.pendingApproval) this.approvals.push(view)
    else {
      this.pendingApproval = view
      this.emit({ type: 'approval', approval: view })
    }
  }

  private handleExit(code: number | null): void {
    this.rejectAll(new Error('Codex process exited'))
    this.transport = null
    this.turns.clear()
    this.texts.clear()
    this.approvals = []
    this.lastParams.clear()
    this.pendingApproval = null
    this.emit({ type: 'approval-cleared' })
    if (this.stopping || !this.enabled) {
      this.setStatus('disabled')
      return
    }
    this.reconnects += 1
    if (this.reconnects > MAX_RECONNECTS) {
      this.setStatus('error', 'Codex disconnected. Reconnect from settings when you want to try again.')
      return
    }
    this.setStatus('disconnected', `Codex exited (${code ?? 'unknown'}). Reconnect attempt ${this.reconnects} of ${MAX_RECONNECTS}.`)
  }

  private request(method: string, params: unknown): Promise<unknown> {
    if (!this.transport) return Promise.reject(new Error('Codex is not running'))
    const id = this.nextId++
    const payload = JSON.stringify({ id, method, params })
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out`)) }, 20000)
      timer.unref?.()
      this.pending.set(id, { method, resolve, reject, timer })
      try { this.transport?.send(payload) }
      catch (error) { this.pending.delete(id); clearTimeout(timer); reject(error instanceof Error ? error : new Error('Codex input failed')) }
    })
  }

  private notify(method: string, params: unknown): void {
    this.transport?.send(JSON.stringify({ method, params }))
  }

  private respond(id: number | string, result: unknown): void {
    this.transport?.send(JSON.stringify({ id, result }))
  }

  private respondError(id: number | string, message: string): void {
    this.transport?.send(JSON.stringify({ id, error: { code: -32000, message } }))
  }

  private declinePending(reason: string): void {
    if (!this.pendingApproval || this.sentApprovals.has(this.pendingApproval.id)) return
    const id = this.pendingApproval.id
    this.sentApprovals.add(id)
    const result = approvalResult(this.pendingApproval.method, false, this.lastParams.get(id))
    if (result.kind === 'error') this.respondError(id, reason)
    else this.respond(id, result.value)
    this.pendingApproval = null
  }

  private rejectAll(error: Error): void {
    for (const waiter of this.pending.values()) { clearTimeout(waiter.timer); waiter.reject(error) }
    this.pending.clear()
  }

  private setStatus(status: CodexStatus, detail?: string): void {
    this.status = status
    this.emit({ type: 'status', status, detail })
  }

  private emit(event: CodexEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}

export function summarizeApproval(id: number | string, method: string, params: Record<string, unknown>): ApprovalView {
  const reason = typeof params.reason === 'string' ? params.reason : ''
  if (method.includes('command') || method === 'execCommandApproval') {
    const command = Array.isArray(params.command) ? params.command.map(String).join(' ') : typeof params.command === 'string' ? params.command : ''
    return { id, method, title: 'Pip wants to run a command', detail: [command, reason].filter(Boolean).join('\n') || 'A command needs approval.' }
  }
  if (method.includes('file') || method === 'applyPatchApproval') {
    const files = params.fileChanges && typeof params.fileChanges === 'object' ? Object.keys(params.fileChanges as object).join('\n') : ''
    const root = typeof params.grantRoot === 'string' ? params.grantRoot : ''
    return { id, method, title: 'Pip wants to change files', detail: [files, root, reason].filter(Boolean).join('\n') || 'A file change needs approval.' }
  }
  return { id, method, title: 'Pip needs permission', detail: reason || method }
}

function approvalResult(method: string, accept: boolean, params?: Record<string, unknown>): { kind: 'ok'; value: unknown } | { kind: 'error'; message: string } {
  if (method === 'item/commandExecution/requestApproval') return { kind: 'ok', value: { decision: accept ? 'accept' : 'decline' } }
  if (method === 'item/fileChange/requestApproval') return { kind: 'ok', value: { decision: accept ? 'accept' : 'decline' } }
  if (method === 'execCommandApproval') {
    return { kind: 'ok', value: { decision: accept ? 'approved' : { denied: { rejection: 'Denied by you' } } } }
  }
  if (method === 'applyPatchApproval') {
    return { kind: 'ok', value: { decision: accept ? 'approved' : { denied: { rejection: 'Denied by you' } } } }
  }
  if (method === 'mcpServer/elicitation/request') return { kind: 'ok', value: { action: 'decline', content: null, _meta: null } }
  if (method === 'item/permissions/requestApproval') {
    if (!accept) return { kind: 'error', message: 'Denied by you' }
    const requested = (params?.permissions ?? {}) as Record<string, unknown>
    return { kind: 'ok', value: { permissions: requested, scope: 'turn' } }
  }
  return { kind: 'error', message: accept ? 'Unsupported approval' : 'Denied by you' }
}

export { MAX_RECONNECTS }
