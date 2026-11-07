import type { AnimationReport } from '../../core/animation/coach'
import { ACTIVITIES, ACTIVITY_LABELS, type LearningMemory } from '../../core/learning'
import type { CodexStatus } from '../../core/codex'
import { defaultSettings, type Personality, type PipMode, type Settings } from '../../core/settings'

const form = document.querySelector('#form') as HTMLFormElement
const modes = document.querySelector('#modes') as HTMLElement
let settings = defaultSettings()
let status: CodexStatus = 'disabled'
let detail = ''
let learning: LearningMemory = {}
let animationReport: AnimationReport | null = null
let checkingAnimations = false
let animationCheckError = ''
let desktopStatus = 'Waiting for desktop capabilities…'
let models: { id: string; displayName: string }[] = []

const personalityFields: { key: keyof Personality; label: string }[] = [
  { key: 'playfulness', label: 'Playfulness' },
  { key: 'curiosity', label: 'Curiosity' },
  { key: 'energy', label: 'Energy' },
  { key: 'attentionSeeking', label: 'Attention frequency' },
  { key: 'independence', label: 'Independence' },
  { key: 'sleepiness', label: 'Sleep frequency' },
  { key: 'sociability', label: 'Sociability' },
  { key: 'excitability', label: 'Excitability' },
]

function render(): void {
  modes.innerHTML = ''
  const wrap = document.createElement('div')
  wrap.className = 'modes'
  for (const mode of ['playful', 'chill', 'focus', 'sleep'] as PipMode[]) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = mode[0].toUpperCase() + mode.slice(1)
    button.classList.toggle('active', settings.mode === mode)
    button.addEventListener('click', () => {
      settings = { ...settings, mode }
      void persist()
      render()
    })
    wrap.append(button)
  }
  modes.replaceChildren(wrap)

  form.innerHTML = `
    <h2>General</h2>
    ${check('enabled', 'Show Pip')}
    ${check('launchAtLogin', 'Launch at login')}
    ${slider('scale', 'Size', 0.7, 1.6, 0.05, settings.scale)}
    ${check('sounds', 'Sound effects')}
    ${select('quality', 'Animation quality', ['high', 'balanced', 'saver'], settings.quality)}
    <h2>Personality</h2>
    ${personalityFields.map((field) => slider(`personality.${field.key}`, field.label, 0, 1, 0.01, settings.personality[field.key])).join('')}
    <h2>Desktop</h2>
    <p id="desktop-capabilities" role="status">${desktopStatus}</p>
    ${check('followWindows', 'Follow active windows')}
    ${check('windowClimbing', 'Window climbing')}
    ${check('followCursor', 'Follow the cursor')}
    ${check('multiMonitor', 'Allow other monitors')}
    ${check('hideDuringFullscreen', 'Hide during fullscreen')}
    ${check('desktopAwareness', 'Desktop awareness')}
    ${select('windowInteractionFrequency', 'Window visit frequency', ['low', 'normal', 'high'], settings.windowInteractionFrequency)}
    <h2>Codex</h2>
    <div class="status">Status: ${status}${detail ? ` — ${detail}` : ''}</div>
    ${check('codexEnabled', 'Connect to Codex')}
    ${select('codexModel', 'Model', ['', ...models.map((model) => model.id)], settings.codexModel, ['Server default', ...models.map((model) => model.displayName)])}
    <label>Working directory<input name="codexCwd" type="text" value="${escapeAttr(settings.codexCwd)}" placeholder="Home directory" /></label>
    <label>Codex executable<input name="codexPath" type="text" value="${escapeAttr(settings.codexPath)}" placeholder="Leave blank to search PATH" /></label>
    ${check('shareDesktopContext', 'Share the frontmost app name')}
    ${select('sandbox', 'Sandbox', ['read-only', 'workspace-write'], settings.sandbox)}
    <div class="actions">
      <button type="button" id="reconnect" class="solid">Reconnect</button>
      <button type="button" id="clear-thread">New conversation</button>
    </div>
    <h2>Assistant Brain</h2>
    <p>Application awareness uses the existing desktop controls. Project access starts with registering a folder. Detailed content is shared only when requested through the selected Codex task.</p>
    ${check('assistantMemoryEnabled', 'Save assistant conversations and task history')}
    ${select('assistantSuggestions', 'Suggestion frequency', ['off', 'low', 'normal'], settings.assistantSuggestions)}
    ${check('assistantIntegration', 'Enable local workspace event integration')}
    <p>Registered tools can report workspace, test and build events through Pip’s private local socket. Window titles are only hints.</p>
    <div class="actions"><button type="button" id="assistant-open">Talk to Pip / register projects</button><button type="button" id="assistant-clear">Clear assistant memory</button></div>
    <p id="assistant-error" role="status"></p>
    <h2>Environmental memory</h2>
    <p>Pip remembers familiar applications and relative resting places. Window identifiers and transient observations are not saved.</p>
    <button type="button" id="reset-environment">Reset environmental memory</button>
    <p id="environment-status" role="status"></p>
    <h2>Learning</h2>
    ${check('learningEnabled', 'Learn activity preferences')}
    <p>Use “More of this” or “Less of this” in Pip’s menu after an activity. Pip gently adapts his choices and varies recent activities. Learning stays on this Mac and respects your mode and desktop settings.</p>
    <p id="learning-summary" role="status"></p>
    <p>Animation self-check tests every clip and keeps measured improvements to transition timing. It runs once on first launch with learning enabled.</p>
    <button type="button" id="check-animations">Run animation self-check</button>
    <p id="animation-summary" role="status"></p>
    <details><summary>Per-animation results</summary><pre id="animation-results"></pre></details>
    <h2>Privacy</h2>
    <p>Pip does not record keys, capture screenshots or read what you type. Optional typing reactions use aggregate activity only and require Desktop awareness. Window titles stay off unless you allow them.</p>
    ${check('reactToTyping', 'React to typing activity (no text capture)')}
    <p>To share actual words, copy selected text and choose “React to copied text” in Pip’s menu. This reads the clipboard once, reacts locally and saves no text. Nothing is sent to Codex.</p>
    <button type="button" id="react-copied">React to copied text</button>
    <p id="copied-status" role="status"></p>
    ${check('allowWindowTitles', 'Allow window titles')}
    ${check('memoryEnabled', 'Remember preferences and resting places')}
    <label>Blocked apps, one name or bundle id per line<textarea name="blocked">${escapeText(settings.blockedApps.join('\n'))}</textarea></label>
    ${check('diagnostics', 'Verbose diagnostics')}
    <div class="actions">
      <button type="button" id="clear-memory">Clear memory</button>
      <button type="button" id="playground">Open playground</button>
    </div>
  `
  form.querySelectorAll('input, select, textarea').forEach((element) => {
    element.addEventListener('change', () => {
      settings = readForm()
      void persist()
    })
  })
  document.querySelector('#reset-environment')?.addEventListener('click', () => void window.pip.clearEnvironment().then(() => { document.querySelector('#environment-status')!.textContent = 'Environmental places and familiarity cleared.' }))
  document.querySelector('#react-copied')?.addEventListener('click', () => void window.pip.reactToCopiedText().then(() => { document.querySelector('#copied-status')!.textContent = 'Pip reacted locally. No copied text was saved or sent to Codex.' }))
  document.querySelector('#reconnect')?.addEventListener('click', () => void window.pip.reconnectCodex())
  document.querySelector('#clear-thread')?.addEventListener('click', () => void window.pip.clearThread())
  document.querySelector('#clear-memory')?.addEventListener('click', () => void window.pip.clearMemory())
  document.querySelector('#playground')?.addEventListener('click', () => window.pip.open('playground'))
  document.querySelector('#assistant-open')?.addEventListener('click', () => void window.pip.brainCommand({ type: 'open' }))
  document.querySelector('#assistant-clear')?.addEventListener('click', () => void window.pip.brainCommand({ type: 'clear' }).then(() => { document.querySelector('#assistant-error')!.textContent = 'Assistant memory cleared.' }).catch(e => { document.querySelector('#assistant-error')!.textContent = String(e) }))
  document.querySelector('#check-animations')?.addEventListener('click', () => void runAnimationChecks())
  renderLearning()
}

async function runAnimationChecks(): Promise<void> {
  checkingAnimations = true
  animationCheckError = ''
  renderLearning()
  try {
    animationReport = await window.pip.checkAnimations()
  } catch {
    animationCheckError = 'Animation self-check could not complete. Try again.'
  } finally {
    checkingAnimations = false
    renderLearning()
  }
}

function renderLearning(): void {
  const summary = document.querySelector('#learning-summary')
  if (!summary) return
  const learned = ACTIVITIES.filter((id) => learning[id])
  const prefix = !settings.memoryEnabled || !settings.learningEnabled ? 'Learning is paused. ' : ''
  summary.textContent = prefix + (learned.length ? learned.map((id) => {
    const preference = learning[id]!
    return `${ACTIVITY_LABELS[id]}: ${preference.encouraged} encouraged, ${preference.discouraged} discouraged`
  }).join(' · ') : 'No activity feedback yet.')
  const button = document.querySelector('#check-animations') as HTMLButtonElement
  button.disabled = checkingAnimations || !settings.memoryEnabled || !settings.learningEnabled
  const status = document.querySelector('#animation-summary')!
  const results = document.querySelector('#animation-results')!
  if (checkingAnimations) status.textContent = 'Checking every animation…'
  else if (animationCheckError) status.textContent = animationCheckError
  else if (!animationReport) status.textContent = prefix + 'No animation self-check saved yet.'
  else {
    const passed = animationReport.results.filter((result) => result.passed).length
    const tuned = animationReport.results.filter((result) => result.tuned).length
    status.textContent = `${prefix}${passed}/${animationReport.results.length} playback checks passed · ${tuned} transitions softened. Visual inspection is separate.`
  }
  results.textContent = animationReport?.results.map((result) => `${result.passed ? 'PASS' : 'FAIL'} ${result.id}${result.tuned ? ` · transition ${Math.round(result.blendDuration * 1000)}ms · step ${result.transitionBefore.toFixed(2)} → ${result.transitionAfter.toFixed(2)}` : ''}`).join('\n') ?? ''
}

function check(name: keyof Settings, label: string): string {
  const on = Boolean(settings[name])
  return `<label class="check">${label}<input name="${name}" type="checkbox" ${on ? 'checked' : ''} /></label>`
}

function slider(name: string, label: string, min: number, max: number, step: number, value: number): string {
  return `<label>${label}<input name="${name}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" /></label>`
}

function select(name: string, label: string, values: string[], current: string, labels = values): string {
  const options = values.map((value, index) => `<option value="${escapeAttr(value)}" ${value === current ? 'selected' : ''}>${labels[index] || value || 'Default'}</option>`).join('')
  return `<label>${label}<select name="${name}">${options}</select></label>`
}

function readForm(): Settings {
  const data = new FormData(form)
  const personality = { ...settings.personality }
  for (const field of personalityFields) {
    personality[field.key] = Number(data.get(`personality.${field.key}`))
  }
  const blocked = String(data.get('blocked') ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
  return {
    ...settings,
    enabled: data.get('enabled') === 'on',
    launchAtLogin: data.get('launchAtLogin') === 'on',
    sounds: data.get('sounds') === 'on',
    followWindows: data.get('followWindows') === 'on',
    windowInteractionFrequency: String(data.get('windowInteractionFrequency')) as Settings['windowInteractionFrequency'],
    reactToTyping: data.get('reactToTyping') === 'on',
    windowClimbing: data.get('windowClimbing') === 'on',
    followCursor: data.get('followCursor') === 'on',
    multiMonitor: data.get('multiMonitor') === 'on',
    hideDuringFullscreen: data.get('hideDuringFullscreen') === 'on',
    desktopAwareness: data.get('desktopAwareness') === 'on',
    codexEnabled: data.get('codexEnabled') === 'on',
    shareDesktopContext: data.get('shareDesktopContext') === 'on',
    allowWindowTitles: data.get('allowWindowTitles') === 'on',
    memoryEnabled: data.get('memoryEnabled') === 'on',
    assistantMemoryEnabled: data.get('assistantMemoryEnabled') === 'on',
    assistantIntegration: data.get('assistantIntegration') === 'on',
    assistantSuggestions: String(data.get('assistantSuggestions')) as Settings['assistantSuggestions'],
    learningEnabled: data.get('learningEnabled') === 'on',
    diagnostics: data.get('diagnostics') === 'on',
    scale: Number(data.get('scale')),
    quality: String(data.get('quality')) as Settings['quality'],
    sandbox: String(data.get('sandbox')) === 'workspace-write' ? 'workspace-write' : 'read-only',
    codexModel: String(data.get('codexModel') ?? ''),
    codexCwd: String(data.get('codexCwd') ?? ''),
    codexPath: String(data.get('codexPath') ?? ''),
    personality,
    blockedApps: blocked,
  }
}

async function persist(): Promise<void> {
  settings = await window.pip.saveSettings(settings)
  renderLearning()
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}
function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
}

void window.pip.getBoot().then((boot) => {
  settings = boot.settings
  learning = boot.state.learning
  animationReport = boot.state.animationReport
  status = boot.codexStatus
  detail = boot.codexDetail
  render()
})

window.pip.onCodex((payload) => {
  if (payload.kind === 'status' && payload.status) {
    status = payload.status
    detail = payload.detail ?? ''
    render()
  }
  if (payload.kind === 'models' && payload.models) {
    models = payload.models
    render()
  }
})

window.pip.onMemory((memory) => {
  learning = memory.learning
  animationReport = memory.animationReport
  renderLearning()
})

window.pip.onDesktop(payload => {
  desktopStatus = payload.source === 'unavailable' ? 'Display bounds only; window observations are unavailable.'
    : payload.accessibility ? 'Window geometry available. Accessibility access available.'
    : 'Basic window geometry available. Accessibility access unavailable; detailed controls are unavailable.'
  const status = document.querySelector('#desktop-capabilities')
  if (status) status.textContent = desktopStatus
})
