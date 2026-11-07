import type { BrainSnapshot, ConversationScope } from '../../core/assistant/types'
import type { BrainCommand } from '../../shared/ipc'
import { renderMarkdown } from './markdown'

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
let snapshot: BrainSnapshot | null = null
let lastMessages = ''
let renderedProject: string | null = null
const ACTIVE = ['pending', 'running', 'waiting_approval', 'recoverable']
async function command(value: BrainCommand) {
  el('error').textContent = ''
  try { render(await window.pip.brainCommand(value)) }
  catch (error) { el('error').textContent = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'That action failed.' }
}
function options(select: HTMLSelectElement, entries: [string, string][], current: string) {
  const signature = JSON.stringify(entries)
  if (select.dataset.signature !== signature) {
    select.replaceChildren(...entries.map(([value, label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; return option }))
    select.dataset.signature = signature
  }
  select.value = current
}
function render(next: BrainSnapshot) {
  snapshot = next
  const project = next.projects.find(p => p.id === next.selectedProjectId)
  const conversation = next.conversations.find(c => c.id === next.currentConversationId)
  const active = next.tasks.find(t => t.conversationId === conversation?.id && ACTIVE.includes(t.status))
  el('connection').textContent = `${next.connection} · ${next.state.replace('_', ' ')}${next.simulated ? ' · SIMULATION' : ''}`
  options(el<HTMLSelectElement>('project'), [['', 'General conversation'], ...next.projects.map(p => [p.id, p.name] as [string, string])], project?.id ?? '')
  el('context-detail').textContent = project ? `${next.confidence} · ${project.branch} · ${project.root}${project.openFile ? ` · ${project.openFile}` : ''}` : `${next.confidence} project · select a registered directory for project questions. ${next.detail}`
  options(el<HTMLSelectElement>('history'), [['', 'Choose conversation'], ...next.conversations.map(c => [c.id, `${next.projects.find(p => p.id === c.projectId)?.name ?? 'General'} · ${c.scope} · ${c.title}`] as [string, string])], conversation?.id ?? '')
  if (renderedProject !== (project?.id ?? null)) {
    el<HTMLTextAreaElement>('instructions').value = project?.instructions ?? ''
    el<HTMLSelectElement>('scope').value = project ? 'project' : 'general'
    renderedProject = project?.id ?? null
  }
  const messages = conversation?.messages ?? []
  const signature = JSON.stringify(messages)
  if (signature !== lastMessages) {
    lastMessages = signature
    const log = el('messages')
    const follow = log.scrollHeight - log.scrollTop - log.clientHeight < 80
    log.replaceChildren(...messages.map(message => { const article = document.createElement('article'); article.className = message.role; article.append(renderMarkdown(message.text)); return article }))
    if (!messages.length) { const p = document.createElement('p'); p.textContent = 'A question, a project review, or a task—Pip is listening.'; log.append(p) }
    if (follow) log.scrollTop = log.scrollHeight
  }
  el('activity').textContent = active ? `${active.status.replace('_', ' ')} · ${active.progress}` : next.detail
  el<HTMLButtonElement>('send').disabled = Boolean(active) || !['ready', 'busy'].includes(next.connection)
  el<HTMLButtonElement>('stop').disabled = !active
  el<HTMLButtonElement>('retry').disabled = !next.tasks.some(t => t.conversationId === conversation?.id && !ACTIVE.includes(t.status)) || Boolean(active)
  el<HTMLButtonElement>('refresh').disabled = !project
  el<HTMLButtonElement>('save-instructions').disabled = !project
  el<HTMLButtonElement>('remove-project').disabled = !project
  const approval = next.approval
  el('approval').hidden = !approval
  if (approval) {
    el('approval-title').textContent = approval.title
    el('approval-detail').textContent = approval.detail
    const questions = el('questions')
    if (questions.dataset.approval !== String(approval.id)) {
      questions.replaceChildren()
      for (const q of approval.questions ?? []) {
        const label = document.createElement('label'); label.textContent = q.question
        if (q.options.length) {
          const select = document.createElement('select'); select.dataset.question = q.id
          options(select, [['', 'Choose an answer'], ...q.options.map(o => [o, o] as [string, string])], '')
          label.append(select)
        } else { const input = document.createElement('textarea'); input.dataset.question = q.id; label.append(input) }
        questions.append(label)
      }
      questions.dataset.approval = String(approval.id)
    }
    const unsupported = approval.method === 'mcpServer/elicitation/request'
    el<HTMLButtonElement>('allow').disabled = unsupported || approval.blocked === true
    if (unsupported) el('approval-detail').textContent += '\nThis integration requires a form Pip cannot safely submit. Deny here and authenticate through Codex’s configured integration.'
  }
  el('suggestions').replaceChildren(...next.suggestions.filter(s => s.status === 'offered' && s.expiresAt > Date.now()).slice(-3).map(s => {
    const section = document.createElement('section'); section.className = 'suggestion'
    const p = document.createElement('p'); p.textContent = `${next.projects.find(p => p.id === s.projectId)?.name}: ${s.text}`; section.append(p)
    for (const [action, label] of [['do', 'Do it'], ['more', 'Tell me more'], ['dismiss', 'Dismiss']] as const) {
      const button = document.createElement('button'); button.textContent = label; button.onclick = () => void command({ type: 'suggestion', id: s.id, action }); section.append(button)
    }
    return section
  }))
  el('tasks').replaceChildren(...next.tasks.slice(-8).reverse().map(task => {
    const p = document.createElement('p'); p.textContent = `${task.risk} · ${task.status} · ${task.request.slice(0, 90)} · ${task.progress}${task.error ? ` · ${task.error}` : ''}`
    if (ACTIVE.includes(task.status)) { const button = document.createElement('button'); button.textContent = 'Stop task'; button.onclick = () => void command({ type: 'cancel', id: task.id }); p.append(button) }
    return p
  }))
  el('tools').replaceChildren(...next.capabilities.map(capability => { const li = document.createElement('li'); li.textContent = `${capability.id} · ${capability.status.replaceAll('_', ' ')} · ${capability.description}`; return li }))
}
el('project').onchange = () => void command({ type: 'select-project', id: el<HTMLSelectElement>('project').value || null })
el('history').onchange = () => { const id = el<HTMLSelectElement>('history').value; if (id) void command({ type: 'resume', id }) }
el('register').onclick = () => void command({ type: 'register-project' })
el('refresh').onclick = () => void command({ type: 'refresh-project' })
el('new').onclick = () => void command({ type: 'new', scope: el<HTMLSelectElement>('scope').value as ConversationScope })
el('close').onclick = () => void command({ type: 'close' })
el('settings').onclick = () => window.pip.open('settings')
el('discover').onclick = () => void command({ type: 'discover' })
el('clear-memory').onclick = () => void command({ type: 'clear' })
el('remove-project').onclick = () => { if (snapshot?.selectedProjectId) void command({ type: 'remove-project', id: snapshot.selectedProjectId }) }
el('save-instructions').onclick = () => { if (snapshot?.selectedProjectId) void command({ type: 'instructions', id: snapshot.selectedProjectId, text: el<HTMLTextAreaElement>('instructions').value }) }
el('prompt-form').onsubmit = (event) => {
  event.preventDefault()
  const text = el<HTMLTextAreaElement>('prompt').value.trim()
  if (!text) return
  el<HTMLTextAreaElement>('prompt').value = ''
  void command({ type: 'ask', text, mode: el<HTMLSelectElement>('task-mode').value as 'inspect' | 'execute' })
}
el('prompt').onkeydown = event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); el<HTMLFormElement>('prompt-form').requestSubmit() } }
el('stop').onclick = () => { const task = snapshot?.tasks.find(t => t.conversationId === snapshot?.currentConversationId && ACTIVE.includes(t.status)); if (task) void command({ type: 'cancel', id: task.id }) }
el('retry').onclick = () => { const task = snapshot?.tasks.filter(t => t.conversationId === snapshot?.currentConversationId).at(-1); if (task) void command({ type: 'retry', id: task.id }) }
el('allow').onclick = () => {
  if (!snapshot?.approval) return
  const answers = Object.fromEntries([...el('questions').querySelectorAll<HTMLSelectElement | HTMLTextAreaElement>('[data-question]')].map(input => [input.dataset.question!, input.value]))
  if (Object.values(answers).some(value => !value.trim())) { el('error').textContent = 'Answer each question before continuing.'; return }
  void command({ type: 'approve', id: snapshot.approval.id, accept: true, answers })
}
el('deny').onclick = () => { if (snapshot?.approval) void command({ type: 'approve', id: snapshot.approval.id, accept: false }) }
el('copy').onclick = () => {
  const text = snapshot?.conversations.find(c => c.id === snapshot?.currentConversationId)?.messages.filter(m => m.role === 'assistant').at(-1)?.text
  if (text) void navigator.clipboard.writeText(text).catch(() => { el('error').textContent = 'Could not copy the response.' })
}
window.pip.onBrain(render)
void window.pip.getBrain().then(render)
