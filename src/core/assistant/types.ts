import type { ApprovalView, CodexStatus } from '../codex'

export type BrainState = 'disconnected' | 'idle' | 'observing' | 'thinking' | 'waiting_approval' | 'executing' | 'responding' | 'completed' | 'failed'
export type Confidence = 'confirmed' | 'probable' | 'unknown'
export type TaskStatus = 'pending' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled' | 'interrupted' | 'recoverable'
export type ConversationScope = 'general' | 'project' | 'task' | 'background'
export interface Project {
  id: string; name: string; path: string; root: string; branch: string; remote: string
  instructions: string; workspace?: string; openFile?: string; conflicts: boolean
}
export interface Message { id: string; role: 'user' | 'assistant'; text: string; at: number }
export interface Conversation {
  id: string; projectId: string | null; scope: ConversationScope; title: string
  threadId: string | null; mode: 'inspect' | 'execute'; messages: Message[]; updatedAt: number
}
export interface AssistantTask {
  id: string; projectId: string | null; conversationId: string; threadId: string | null
  request: string; risk: 'read' | 'command' | 'write' | 'external'; mode: 'inspect' | 'execute'; status: TaskStatus; startedAt: number; updatedAt: number
  progress: string; result: string; error: string; approval: boolean; cancelRequested: boolean
}
export interface Capability {
  id: string; description: string; status: 'available' | 'requires_authentication' | 'requires_permission' | 'unavailable' | 'failed'
  risk: 'read' | 'command' | 'external'; arguments?: unknown
}
export type SignalType = 'workspace' | 'test_failed' | 'build_failed' | 'merge_conflict' | 'task_failed' | 'task_completed' | 'long_task' | 'project_returned'
export interface BrainSignal { type: SignalType; projectId: string; source: 'integration' | 'codex' | 'sim'; detail?: string; at?: number; file?: string }
export interface Suggestion {
  id: string; event: SignalType; projectId: string; confidence: Confidence; reason: string; action: string
  taskId?: string; text: string; createdAt: number; expiresAt: number; status: 'offered' | 'dismissed' | 'accepted' | 'expired' | 'completed' | 'failed'
}
export interface AssistantMemory {
  version: 1; projects: Project[]; conversations: Conversation[]; tasks: AssistantTask[]; suggestions: Suggestion[]
  selectedProjectId: string | null; currentConversationId: string | null
}
export interface BrainSnapshot extends AssistantMemory {
  state: BrainState; connection: CodexStatus; detail: string; confidence: Confidence
  capabilities: Capability[]; approval: (ApprovalView & { taskId?: string; appGate?: boolean; blocked?: boolean }) | null
  events: { at: number; description: string }[]; simulated: boolean; animation: string
  surroundings: {
    pet: { state: string; mood: string; surface: string }
    environment: { activeApplication: string | null; nearbyWindows: number; interestingEvent: string | null }
  } | null
}
export function emptyAssistantMemory(): AssistantMemory {
  return { version: 1, projects: [], conversations: [], tasks: [], suggestions: [], selectedProjectId: null, currentConversationId: null }
}
export function brainAnimation(state: BrainState): string {
  return ({ disconnected: 'idle_sit', idle: 'idle_sit', observing: 'curious', thinking: 'head_tilt', waiting_approval: 'look_expectant', executing: 'watch_progress', responding: 'look_expectant', completed: 'celebrate_work', failed: 'confused_tilt' })[state]
}
export function redact(text: string): string {
  return text.replace(/\bsk-[A-Za-z0-9_-]{12,}/g, '[redacted key]').replace(/Bearer\s+[A-Za-z0-9._-]{16,}/gi, 'Bearer [redacted]').replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[redacted private key]')
}
export function restoreAssistant(raw: unknown, now = Date.now()): AssistantMemory {
  const memory = emptyAssistantMemory()
  if (!raw || typeof raw !== 'object') return memory
  const data = raw as Partial<AssistantMemory>
  memory.projects = (Array.isArray(data.projects) ? data.projects : []).filter(p => p && typeof p.id === 'string' && typeof p.path === 'string' && typeof p.root === 'string').slice(-20).map(p => ({ ...p, name: String(p.name).slice(0, 100), instructions: String(p.instructions ?? '').slice(0, 4000) }))
  const projects = new Set(memory.projects.map(p => p.id))
  memory.conversations = (Array.isArray(data.conversations) ? data.conversations : []).filter(c => c && typeof c.id === 'string' && (!c.projectId || projects.has(c.projectId))).slice(-60).map(c => ({
    ...c, title: redact(String(c.title ?? 'Conversation')).slice(0, 100), mode: c.mode === 'execute' ? 'execute' : 'inspect', threadId: typeof c.threadId === 'string' ? c.threadId : null,
    messages: (Array.isArray(c.messages) ? c.messages : []).filter(m => m && ['user', 'assistant'].includes(m.role)).slice(-40).map(m => ({ ...m, text: redact(String(m.text)).slice(0, 16000) })),
  }))
  const conversations = new Set(memory.conversations.map(c => c.id))
  memory.tasks = (Array.isArray(data.tasks) ? data.tasks : []).filter(t => t && typeof t.id === 'string' && conversations.has(t.conversationId)).slice(-100).map(t => ({ ...t, risk: t.risk ?? (t.mode === 'execute' ? 'command' : 'read'), status: ['pending', 'running', 'waiting_approval', 'recoverable'].includes(t.status) ? 'interrupted' : t.status, approval: false, progress: ['pending', 'running', 'waiting_approval', 'recoverable'].includes(t.status) ? 'Interrupted when Pip stopped; resume the conversation or retry.' : t.progress }))
  memory.suggestions = (Array.isArray(data.suggestions) ? data.suggestions : []).filter(s => s && projects.has(s.projectId) && Number.isFinite(s.expiresAt) && now - s.createdAt < 30 * 86400000).slice(-100).map(s => ({ ...s, status: s.status === 'offered' && now > s.expiresAt ? 'expired' : s.status }))
  memory.selectedProjectId = projects.has(data.selectedProjectId ?? '') ? data.selectedProjectId! : null
  memory.currentConversationId = conversations.has(data.currentConversationId ?? '') ? data.currentConversationId! : null
  return memory
}
