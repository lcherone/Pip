import type { WorldDebugSnapshot } from '../src/shared/world'
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, screen, Tray } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AssistantBrain } from '../src/core/assistant/brain'
import { inspectProject } from '../src/core/assistant/projects'
import { startIntegration } from '../src/core/assistant/integration'
import { emptyAssistantMemory, type AssistantMemory } from '../src/core/assistant/types'
import type { BrainCommand } from '../src/shared/ipc'
import { AppServerTransport } from '../src/core/assistant/transport'
import { CodexSession } from '../src/core/codex'
import { calibrateDisplays, deriveIdleEdges, isBlockedApp, validRect, observeWindows, diffWindows, filterWindows, translateRect, type DeskEvent, type DesktopWindow, type DisplayInfo } from '../src/core/desktop'
import { emptyEnvironment, hydrateEnvironment, readWorld } from '../src/core/world'
import { effectivePersonality } from '../src/core/settings'
import { checkAnimations, type AnimationReport } from '../src/core/animation/coach'
import { isActivity, learnFeedback } from '../src/core/learning'
import { clearMemory, hydrate, noteRest, rememberAction, type PersistedState } from '../src/core/memory'
import { TypingObserver } from '../src/core/activity'
import { buildPrompt, localPuppyReply } from '../src/core/reply'
import { petAnchor } from '../src/core/pet-layout'
import { sanitizeSettings, type PipMode, type Settings } from '../src/core/settings'
import type { BootPayload, CodexPush, DesktopPayload, PetFrame } from '../src/shared/ipc'

app.setName('Pip')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

if (gotLock) {
  app.on('second-instance', (_event, argv) => {
    if (argv.includes('--playground')) createUtility('playground')
    else pet?.showInactive()
  })
}

let animationCheck: Promise<AnimationReport | null> | null = null
let memoryRevision = 0
let state: PersistedState
let pet: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let playgroundWindow: BrowserWindow | null = null
let lastWorldReport: WorldDebugSnapshot | null = null
let tray: Tray | null = null
let conversationWindow: BrowserWindow | null = null
let brain: AssistantBrain
let debugBrain: AssistantBrain
let stopIntegration: (() => void) | null = null
let brainTimer: ReturnType<typeof setInterval> | null = null
let helper: ChildProcess | null = null
let helperBuffer = ''
let helperRestarts = 0
const typingObserver = new TypingObserver()
let lastWindows: DesktopWindow[] = []
let desktopSeeded = false
let cursorShift = { dx: 0, dy: 0 }
let petHiddenByPlayground = false
let playgroundLive = false
let lastIdle = 0
let lastFullscreen = false
let desktopTimer: NodeJS.Timeout | null = null
const session = new CodexSession()
let codexDetail = 'Codex is off'
let codexStarting = false
let logPath = ''

function stateFile(): string {
  return path.join(app.getPath('userData'), 'pip-state.json')
}

function loadState(): PersistedState {
  try {
    return hydrate(JSON.parse(fs.readFileSync(stateFile(), 'utf8')))
  } catch {
    return hydrate({})
  }
}

function saveState(): void {
  const file = stateFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(state, null, 2))
}

function log(level: string, scope: string, message: string, extra?: unknown): void {
  if (!state?.settings.diagnostics && level === 'debug') return
  const line = JSON.stringify({ t: new Date().toISOString(), level, scope, message, extra: extra ?? undefined })
  if (!logPath) return
  try {
    const stat = fs.existsSync(logPath) ? fs.statSync(logPath) : null
    if (stat && stat.size > 1_000_000) fs.renameSync(logPath, `${logPath}.1`)
    fs.appendFileSync(logPath, `${line}\n`)
  } catch {
    /* logging must not take the pet down */
  }
}

function preloadPath(): string {
  return path.join(__dirname, '../preload/index.js')
}

function loadPage(window: BrowserWindow, page: string): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) void window.loadURL(`${devUrl}/${page}/index.html`)
  else void window.loadFile(path.join(__dirname, `../renderer/${page}/index.html`))
}

function electronDisplays(): DisplayInfo[] {
  return screen.getAllDisplays().map((display) => ({
    id: String(display.id),
    bounds: { x: display.bounds.x, y: display.bounds.y, w: display.bounds.width, h: display.bounds.height },
    workArea: { x: display.workArea.x, y: display.workArea.y, w: display.workArea.width, h: display.workArea.height },
    scaleFactor: display.scaleFactor,
  }))
}

function boot(): BootPayload {
  return {
    settings: state.settings,
    position: state.position,
    displays: electronDisplays(),
    codexStatus: session.status,
    codexDetail,
    state,
  }
}

function send(channel: string, payload: unknown): void {
  for (const window of [pet, settingsWindow, playgroundWindow, conversationWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload)
  }
}

function createPet(): void {
  const displays = electronDisplays()
  const primary = screen.getPrimaryDisplay()
  const fallback = {
    x: primary.workArea.x + primary.workArea.width / 2,
    y: primary.workArea.y + primary.workArea.height - 8,
  }
  const feet = state.position ?? fallback
  const width = Math.round(420 * state.settings.scale)
  const height = Math.round(460 * state.settings.scale)
  const anchor = petAnchor(feet, displays, state.settings.scale)
  pet = new BrowserWindow({
    width,
    height,
    x: Math.round(feet.x - width / 2),
    y: Math.round(feet.y - anchor.y),
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
    type: 'panel',
    roundedCorners: false,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  pet.setAlwaysOnTop(true, 'floating')
  pet.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })
  pet.setIgnoreMouseEvents(true, { forward: true })
  pet.once('ready-to-show', () => {
    if (state.settings.enabled) pet?.showInactive()
  })
  loadPage(pet, 'pet')
  pet.on('closed', () => { pet = null })
  void displays
}

function revealUtility(window: BrowserWindow): void {
  if (process.platform === 'darwin' && app.setActivationPolicy) app.setActivationPolicy('regular')
  applyAppIcon()
  window.show()
  window.focus()
  if (window === playgroundWindow && !playgroundLive) hidePetForPlayground()
}

function hidePetForPlayground(): void {
  if (!pet || pet.isDestroyed() || !pet.isVisible()) return
  pet.hide()
  petHiddenByPlayground = true
}

function restorePetAfterPlayground(): void {
  if (!petHiddenByPlayground) return
  petHiddenByPlayground = false
  if (state.settings.enabled) pet?.showInactive()
}

function createUtility(page: 'settings' | 'playground'): BrowserWindow {
  const existing = page === 'settings' ? settingsWindow : playgroundWindow
  if (existing && !existing.isDestroyed()) {
    revealUtility(existing)
    return existing
  }
  const window = new BrowserWindow({
    width: page === 'settings' ? 460 : 1280,
    height: page === 'settings' ? 760 : 860,
    title: page === 'settings' ? 'Pip Settings' : 'Pip Playground',
    icon: appIcon() ?? undefined,
    resizable: page === 'playground',
    show: false,
    backgroundColor: '#fff8f1',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.once('ready-to-show', () => revealUtility(window))
  loadPage(window, page)
  window.on('closed', () => {
    if (page === 'settings') settingsWindow = null
    else {
      playgroundWindow = null
      playgroundLive = false
      pet?.webContents.send('command', { type: 'world-debug', enabled: false })
      restorePetAfterPlayground()
    }
    if (!settingsWindow && !playgroundWindow && process.platform === 'darwin' && app.setActivationPolicy) {
      app.setActivationPolicy('accessory')
    }
  })
  if (page === 'settings') settingsWindow = window
  else {
    playgroundWindow = window
    pet?.webContents.send('command', { type: 'world-debug', enabled: true })
  }
  return window
}

function showConversation(): void {
  if (!conversationWindow || conversationWindow.isDestroyed()) {
    const window = new BrowserWindow({
      width: 500, height: 680, minWidth: 380, minHeight: 460, maxWidth: 850,
      title: 'Talk to Pip', frame: false, show: false, backgroundColor: '#fff8f1',
      alwaysOnTop: true, skipTaskbar: true, type: 'panel',
      webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false, sandbox: true },
    })
    conversationWindow = window
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', event => event.preventDefault())
    window.on('closed', () => { conversationWindow = null })
    window.once('ready-to-show', () => showConversation())
    loadPage(window, 'conversation')
    return
  }
  const anchor = pet?.getBounds() ?? { x: 400, y: 400, width: 420, height: 460 }
  const area = screen.getDisplayNearestPoint({ x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 }).workArea
  const width = Math.min(conversationWindow.getBounds().width, area.width - 24)
  const height = Math.min(conversationWindow.getBounds().height, area.height - 24)
  const x = Math.max(area.x + 12, Math.min(anchor.x + anchor.width - 40, area.x + area.width - width - 12))
  const y = Math.max(area.y + 12, Math.min(anchor.y - height + 200, area.y + area.height - height - 12))
  conversationWindow.setBounds({ x: Math.round(x), y: Math.round(y), width, height })
  conversationWindow.show()
  conversationWindow.focus()
}

function assistantFile(): string { return path.join(app.getPath('userData'), 'assistant-memory.json') }
function persistAssistant(memory: AssistantMemory): void {
  if (!state.settings.assistantMemoryEnabled) return
  const file = assistantFile()
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(memory, null, 2), { mode: 0o600 })
  fs.renameSync(`${file}.tmp`, file)
}
function configureIntegration(): void {
  stopIntegration?.()
  stopIntegration = null
  if (state.settings.assistantIntegration) {
    stopIntegration = startIntegration(path.join(app.getPath('userData'), 'assistant.sock'), () => brain.snapshot().projects, signal => brain.receive(signal))
  }
}

function resourceFile(name: string): string | null {
  const candidates = [
    path.join(process.resourcesPath, 'resources', name),
    path.join(app.getAppPath(), 'resources', name),
    path.join(process.cwd(), 'resources', name),
  ]
  return candidates.find((file) => fs.existsSync(file)) ?? null
}

function appIcon(): Electron.NativeImage | null {
  const file = resourceFile('icon.png')
  if (!file) return null
  const image = nativeImage.createFromPath(file)
  return image.isEmpty() ? null : image
}

function applyAppIcon(): void {
  const image = appIcon()
  const file = resourceFile('icon.png')
  if (image && process.platform === 'darwin' && app.dock) app.dock.setIcon(image)
  if (file) app.setAboutPanelOptions({ applicationName: 'Pip', applicationVersion: app.getVersion(), iconPath: file })
}

function trayImage(): Electron.NativeImage {
  const file = resourceFile('trayTemplate.png')
  const image = file ? nativeImage.createFromPath(file) : nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFUlEQVQ4T2NkYGD4z0ABYBw1gGE0DBgAAAWAAQHc0oN8AAAAAElFTkSuQmCC')
  image.setTemplateImage(true)
  return image
}

function rebuildTray(): void {
  if (tray) tray.destroy()
  tray = new Tray(trayImage())
  tray.setToolTip('Pip')
  const mode = (value: PipMode, label: string) => ({
    label,
    type: 'radio' as const,
    checked: state.settings.mode === value,
    click: () => applySettings({ ...state.settings, mode: value }),
  })
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Pip', click: () => { pet?.showInactive(); send('command', { type: 'show' }) } },
    { label: 'Hide Pip', click: () => { pet?.hide(); send('command', { type: 'hide' }) } },
    { label: 'Pause', click: () => send('command', { type: 'pause' }) },
    { type: 'separator' },
    mode('playful', 'Playful'),
    mode('chill', 'Chill'),
    mode('focus', 'Focus'),
    mode('sleep', 'Sleep'),
    { type: 'separator' },
    { label: 'Talk to Pip', click: () => showConversation() },
    { label: 'React to copied text', click: () => reactToCopiedText() },
    { label: 'Settings', click: () => createUtility('settings') },
    { label: 'Playground', click: () => createUtility('playground') },
    { type: 'separator' },
    { label: 'Quit Pip', click: () => app.quit() },
  ]))
}

function syncLoginItem(): void {
  try {
    const current = app.getLoginItemSettings()
    if (current.openAtLogin !== state.settings.launchAtLogin) {
      app.setLoginItemSettings({ openAtLogin: state.settings.launchAtLogin })
    }
  } catch {
    log('warn', 'app', 'Launch at login is unavailable in this session')
  }
}

function applySettings(next: Settings): Settings {
  const previous = state.settings
  if (state.settings.memoryEnabled !== next.memoryEnabled || state.settings.learningEnabled !== next.learningEnabled) memoryRevision += 1
  state.settings = sanitizeSettings(next)
  saveState()
  syncLoginItem()
  rebuildTray()
  configureIntegration()
  send('command', { type: 'settings', settings: state.settings })
  if (!state.settings.enabled) pet?.hide()
  else pet?.showInactive()
  if (state.settings.desktopAwareness) startHelper()
  else {
    stopHelper()
    publishDesktop([], 'unavailable', 'unknown')
  }
  const connectionChanged = previous.codexPath !== state.settings.codexPath || previous.codexModel !== state.settings.codexModel || previous.sandbox !== state.settings.sandbox
  if (state.settings.codexEnabled && (!previous.codexEnabled || connectionChanged)) void startCodex(true)
  else if (!state.settings.codexEnabled && previous.codexEnabled) void stopCodex()
  return state.settings
}

function helperPath(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'pip-desktop-helper')
  return path.join(app.getAppPath(), 'native/bin/pip-desktop-helper')
}

function startHelper(): void {
  stopHelper()
  if (!state.settings.desktopAwareness) return
  const bin = helperPath()
  if (!fs.existsSync(bin)) {
    log('warn', 'desktop', 'Helper missing, using display bounds only', { bin })
    publishDesktop([], 'unavailable', 'limited')
    return
  }
  const args: string[] = []
  if (state.settings.allowWindowTitles) args.push('--titles')
  if (state.settings.reactToTyping) args.push('--typing')
  const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  helper = child
  helperBuffer = ''
  child.stdout?.on('data', (chunk) => { if (helper === child) consumeHelper(String(chunk)) })
  child.stderr?.on('data', (chunk) => { if (helper === child) log('debug', 'desktop', String(chunk).trim()) })
  child.on('error', () => {
    if (helper !== child) return
    helper = null
    publishDesktop([], 'unavailable', 'limited')
  })
  child.on('exit', (code) => {
    if (helper !== child) return
    helper = null
    if (!state.settings.desktopAwareness) return
    helperRestarts += 1
    if (helperRestarts <= 1) {
      setTimeout(() => startHelper(), 3000)
      return
    }
    log('warn', 'desktop', 'Helper stopped', { code })
    publishDesktop([], 'unavailable', 'limited')
  })
}

function stopHelper(): void {
  if (desktopTimer) clearInterval(desktopTimer)
  desktopTimer = null
  const child = helper
  helper = null
  typingObserver.clear()
  child?.kill()
}

function consumeHelper(text: string): void {
  helperBuffer += text
  const lines = helperBuffer.split('\n')
  helperBuffer = lines.pop() ?? ''
  const events: DeskEvent[] = []
  let latest: { accessibility?: boolean; typing?: DesktopPayload['typing']; windows: DesktopWindow[]; displays: DisplayInfo[]; frontmost: { name: string; bundleId: string } | null; idleSeconds: number; fullscreen: boolean; permission: DesktopPayload['permission'] } | null = null
  for (const line of lines) {
    if (!line.trim()) continue
    let message: Record<string, unknown>
    try { message = JSON.parse(line) as Record<string, unknown> } catch { continue }
    if (message.type === 'event') {
      const name = String(message.name ?? '')
      const appName = String(message.app ?? '')
      const bundleId = typeof message.bundleId === 'string' ? message.bundleId : undefined
      if (isBlockedApp(appName, bundleId, state.settings.blockedApps)) continue
      if (name.includes('didLaunch')) events.push({ type: 'app_launched', app: appName, bundleId, source: 'os' })
      else if (name.includes('didActivate')) events.push({ type: 'app_activated', app: appName, bundleId, source: 'os' })
      else if (name.includes('didTerminate')) events.push({ type: 'app_terminated', app: appName, bundleId, source: 'os' })
      continue
    }
    if (message.type === 'cursor') {
      const x = Number(message.x) + cursorShift.dx
      const y = Number(message.y) + cursorShift.dy
      if (Number.isFinite(x) && Number.isFinite(y)) pet?.webContents.send('cursor', { x, y })
      continue
    }
    if (message.type !== 'snapshot') continue
    const helperDisplays = ((message.displays as { id: string; bounds: { x: number; y: number; w: number; h: number }; workArea: { x: number; y: number; w: number; h: number }; scaleFactor: number }[]) ?? [])
      .map((display) => ({ ...display }))
    const electron = electronDisplays()
    const shift = calibrateDisplays(helperDisplays.map((display) => display.bounds), electron.map((display) => display.bounds))
    cursorShift = shift
    const rawWindows = (Array.isArray(message.windows) ? message.windows as DesktopWindow[] : []).filter(window => window && typeof window.id === 'string' && typeof window.app === 'string' && validRect(window.bounds))
    const windows = observeWindows(lastWindows, filterWindows(rawWindows.map((window) => ({
      ...window,
      bounds: translateRect(window.bounds, shift.dx, shift.dy),
      displayId: window.displayId || electron.find(display => window.bounds.x + window.bounds.w / 2 >= display.bounds.x && window.bounds.x + window.bounds.w / 2 <= display.bounds.x + display.bounds.w && window.bounds.y >= display.bounds.y && window.bounds.y <= display.bounds.y + display.bounds.h)?.id || electron[0]?.id || '',
      title: state.settings.allowWindowTitles ? window.title : undefined,
    })), state.settings.blockedApps), Date.now() / 1000)
    if (desktopSeeded) events.push(...diffWindows(lastWindows, windows, 'os'))
    desktopSeeded = true
    const idle = Number(message.idleSeconds ?? 0)
    const fullscreen = Boolean(message.fullscreen)
    if (fullscreen !== lastFullscreen) events.push({ type: 'fullscreen', enabled: fullscreen, source: 'os' })
    lastWindows = windows
    lastFullscreen = fullscreen
    const observedFront = message.frontmost as { name?: string; bundleId?: string } | null
    let frontmost: DesktopPayload['frontmost'] = observedFront
      ? { name: String(observedFront.name ?? ''), bundleId: String(observedFront.bundleId ?? '') }
      : null
    if (frontmost && isBlockedApp(frontmost.name, frontmost.bundleId, state.settings.blockedApps)) frontmost = null
    if (frontmost) events.push(...deriveIdleEdges(lastIdle, idle, 'os'))
    const typing = typingObserver.sample(message.typing, frontmost, state.settings.reactToTyping, Date.now() / 1000)
    events.push(...typing.events)
    lastIdle = idle
    latest = {
      typing: typing.activity,
      accessibility: message.trusted === true,
      windows,
      displays: electron,
      frontmost,
      idleSeconds: idle,
      fullscreen,
      permission: message.permission === 'granted' ? 'granted' : 'limited',
    }
  }
  if (!latest && events.length === 0) return
  const payload: DesktopPayload = {
    windows: latest?.windows ?? lastWindows,
    displays: latest?.displays ?? electronDisplays(),
    frontmost: latest?.frontmost ?? null,
    typing: latest?.typing ?? null,
    accessibility: latest?.accessibility ?? false,
    idleSeconds: latest?.idleSeconds ?? lastIdle,
    fullscreen: latest?.fullscreen ?? lastFullscreen,
    permission: latest?.permission ?? 'unknown',
    source: 'os',
    events: events.filter(event => !('app' in event) || !isBlockedApp(event.app, 'bundleId' in event ? event.bundleId : undefined, state.settings.blockedApps)).slice(-24),
  }
  const personality = effectivePersonality(state.settings.personality, state.settings.mode)
  brain.noteSurroundings(readWorld({
    now: Date.now() / 1000,
    x: state.position?.x ?? 200,
    y: state.position?.y ?? 400,
    floorY: state.position?.y ?? 400,
    minX: 0,
    maxX: 2000,
    windows: payload.windows,
    displays: payload.displays,
    focusedApp: payload.frontmost?.name ?? null,
    events: payload.events,
    memory: state.environment,
    traits: {
      curiosity: personality.curiosity,
      playfulness: personality.playfulness,
      sleepiness: personality.sleepiness,
      confidence: personality.confidence,
      energy: personality.energy,
    },
    mode: state.settings.mode,
    climbing: state.settings.windowClimbing,
    surfaceId: null,
  }).brief)
  const front = payload.frontmost
  if (front && !isBlockedApp(front.name, front.bundleId, state.settings.blockedApps)) {
    const title = state.settings.allowWindowTitles ? payload.windows.find(w => w.focused)?.title : undefined
    brain.observeApplication(front.name, title)
  }
  pet?.webContents.send('desktop', payload)
}

function publishDesktop(windows: DesktopWindow[], source: DesktopPayload['source'], permission: DesktopPayload['permission']): void {
  const payload: DesktopPayload = {
    windows,
    displays: electronDisplays(),
    frontmost: null,
    idleSeconds: lastIdle,
    fullscreen: false,
    permission,
    source,
    events: [],
  }
  pet?.webContents.send('desktop', payload)
}

async function findCodex(): Promise<string | null> {
  if (state.settings.codexPath && fs.existsSync(state.settings.codexPath)) return state.settings.codexPath
  const candidates = [
    path.join(os.homedir(), '.local/bin/codex'),
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
  ]
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate
  try {
    const { execFileSync } = await import('node:child_process')
    const found = execFileSync('/bin/zsh', ['-lc', 'command -v codex'], { encoding: 'utf8' }).trim()
    if (found && fs.existsSync(found)) return found
  } catch {
    /* not on the login path */
  }
  return null
}

async function startCodex(userInitiated = false): Promise<void> {
  if (!state.settings.codexEnabled || codexStarting) return
  if (!userInitiated && ['ready', 'busy', 'starting'].includes(session.status)) return
  if (userInitiated && ['ready', 'busy'].includes(session.status)) await session.disconnect()
  if (userInitiated) session.reconnects = 0
  codexStarting = true
  const transport = new AppServerTransport(findCodex, () => log('debug', 'codex', 'App Server diagnostic output received'))
  try {
    await session.connect(transport, {
      cwd: path.join(app.getPath('userData'), 'assistant-general'),
      model: state.settings.codexModel || undefined,
      sandbox: state.settings.sandbox,
      threadId: null,
      lazyThread: true,
      instructions: 'General companion session. Do not access files or external applications without a project-scoped request.',
    })
    if (session.threadId) {
      state.codexThreadId = session.threadId
      saveState()
    }
  } catch (error) {
    if (!state.settings.codexEnabled) { transport.stop(); return }
    codexDetail = error instanceof Error ? error.message : 'Codex failed to start'
    log('warn', 'codex', codexDetail)
    send('codex', { kind: 'status', status: 'unavailable', detail: codexDetail } satisfies CodexPush)
    brain.handleCodex({ type: 'status', status: 'unavailable', detail: codexDetail })
    transport.stop()
  } finally {
    codexStarting = false
  }
}

async function stopCodex(): Promise<void> {
  await session.disconnect()
  codexDetail = 'Codex is off'
}

function broadcastCodex(event: Parameters<Parameters<CodexSession['on']>[0]>[0]): void {
  if (event.type === 'status') {
    codexDetail = event.detail ?? codexDetail
    send('codex', { kind: 'status', status: event.status, detail: event.detail })
    if (event.status === 'disconnected' && state.settings.codexEnabled && session.reconnects <= 3 && !codexStarting) {
      const wait = 1500 * session.reconnects
      setTimeout(() => { void startCodex(false) }, wait)
    }
    return
  }
  if (event.type === 'models') send('codex', { kind: 'models', models: event.models })
  if (event.type === 'delta' && !event.threadId) send('codex', { kind: 'delta', text: event.text })
  if (event.type === 'reply' && !event.threadId) send('codex', { kind: 'reply', text: event.reply.say, intention: event.reply.intention })
  if (event.type === 'approval-cleared') send('codex', { kind: 'cleared' })
}

function publishMemory(): void {
  send('memory', {
    affinity: state.affinity, learning: state.learning,
    animationReport: state.animationReport, recentActions: state.recentActions,
  })
}

function reactToCopiedText(): void {
  // An explicit user action. The clipboard is never polled, saved or sent to Codex.
  const text = clipboard.readText().slice(0, 4000).trim()
  const reply = text ? localPuppyReply(text, 'shared-text') : { say: 'Copy a little text, then ask me to react.', intention: 'chat' as const }
  pet?.webContents.send('environment-event', { type: 'shared_text', reply, source: 'user' } satisfies DeskEvent)
}

function registerIpc(): void {
  ipcMain.on('world:source', (event, source: string) => {
    if (event.sender !== playgroundWindow?.webContents) return
    if (source !== 'live' && source !== 'simulation') return
    playgroundLive = source === 'live'
    if (playgroundLive) restorePetAfterPlayground()
    else hidePetForPlayground()
  })
  ipcMain.handle('world:get', () => state.settings.desktopAwareness ? lastWorldReport : null)
  ipcMain.on('world:report', (event, snapshot: WorldDebugSnapshot) => {
    if (event.sender !== pet?.webContents || !snapshot || !Number.isFinite(snapshot.movement?.x) || !Number.isFinite(snapshot.movement?.y)) return
    lastWorldReport = snapshot
    playgroundWindow?.webContents.send('world', snapshot)
  })
  ipcMain.handle('world:clear-memory', () => {
    state.environment = emptyEnvironment()
    saveState()
    lastWorldReport = null
    send('command', { type: 'environment-cleared' })
  })
  ipcMain.handle('react-to-copied-text', () => reactToCopiedText())
  ipcMain.handle('brain:get', (_event, debug: boolean) => debug ? debugBrain.snapshot() : brain.snapshot())
  ipcMain.handle('brain:simulate', (event, kind: string) => {
    if (event.sender !== playgroundWindow?.webContents) throw new Error('Simulations belong in the playground')
    debugBrain.simulate(String(kind))
    return debugBrain.snapshot()
  })
  ipcMain.handle('brain:command', async (_event, command: BrainCommand) => {
    if (!command || typeof command.type !== 'string') throw new Error('Invalid assistant command')
    switch (command.type) {
      case 'open': showConversation(); break
      case 'close': conversationWindow?.hide(); break
      case 'register-project': {
        const selected = await dialog.showOpenDialog({ title: 'Register a project with Pip', properties: ['openDirectory'] })
        if (!selected.canceled && selected.filePaths[0]) await brain.register(selected.filePaths[0])
        break
      }
      case 'select-project': brain.selectProject(command.id); break
      case 'remove-project': brain.removeProject(command.id); break
      case 'refresh-project': await brain.refreshProject(); break
      case 'instructions': brain.updateInstructions(command.id, String(command.text)); break
      case 'new': brain.newConversation(command.scope); break
      case 'resume': brain.resumeConversation(command.id); break
      case 'ask': await brain.ask(String(command.text), command.mode === 'execute' ? 'execute' : 'inspect'); break
      case 'approve': await brain.approve(command.id, command.accept === true, command.answers); break
      case 'cancel': await brain.cancel(command.id); break
      case 'retry': await brain.retry(command.id); break
      case 'suggestion': await brain.actOnSuggestion(command.id, command.action); if (command.action !== 'dismiss') showConversation(); break
      case 'discover': await brain.discover(); break
      case 'clear': {
        brain.clear()
        fs.writeFileSync(assistantFile(), JSON.stringify(emptyAssistantMemory()), { mode: 0o600 })
        break
      }
      default: throw new Error('Unsupported assistant command')
    }
    return brain.snapshot()
  })
  ipcMain.handle('get-boot', () => boot())
  ipcMain.handle('save-settings', (_event, incoming: Settings) => applySettings(incoming))
  ipcMain.handle('clear-memory', () => {
    memoryRevision += 1
    state = clearMemory(state)
    saveState()
    send('command', { type: 'memory-cleared' })
    publishMemory()
    return boot()
  })
  ipcMain.handle('check-animations', async () => {
    if (!state.settings.memoryEnabled || !state.settings.learningEnabled) return null
    if (!animationCheck) {
      const revision = memoryRevision
      animationCheck = checkAnimations().then((report) => {
        if (revision !== memoryRevision || !state.settings.memoryEnabled || !state.settings.learningEnabled) return null
        state.animationReport = report
        saveState()
        publishMemory()
        return report
      }).finally(() => { animationCheck = null })
    }
    return animationCheck
  })
  ipcMain.handle('clear-thread', async () => {
    brain.newConversation('general')
    state.codexThreadId = null
    saveState()
    if (state.settings.codexEnabled) {
      await stopCodex()
      state.settings.codexEnabled = true
      await startCodex(true)
    }
  })
  ipcMain.handle('talk', async (_event, text: string, frontApp: string | null) => {
    const prompt = buildPrompt(String(text ?? '').slice(0, 2000), frontApp ? String(frontApp).slice(0, 80) : null, state.settings.shareDesktopContext)
    log('info', 'codex', 'Turn requested')
    await brain.ask(String(text ?? ''), 'inspect')
  })
  ipcMain.handle('codex-reconnect', async () => {
    await stopCodex()
    if (state.settings.codexEnabled) await startCodex(true)
  })
  ipcMain.handle('capture', async (event, name: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const image = await window?.webContents.capturePage()
    const file = path.join(app.getAppPath(), 'artifacts', `${String(name).replace(/[^\w.-]+/g, '_')}.png`)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    if (image) fs.writeFileSync(file, image.toPNG())
    return file
  })
  ipcMain.on('save-position', (_event, position: { x: number; y: number }) => {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return
    state.position = { x: position.x, y: position.y }
    saveState()
  })
  ipcMain.on('note-rest', (_event, appName: string) => {
    if (!state.settings.memoryEnabled) return
    state.affinity = noteRest(state.affinity, String(appName))
    saveState()
    publishMemory()
  })
  ipcMain.on('note-environment', (_event, raw: unknown) => {
    if (!state.settings.memoryEnabled) return
    state.environment = hydrateEnvironment(raw)
    saveState()
  })
  ipcMain.on('remember', (_event, activity: unknown) => {
    if (!state.settings.memoryEnabled || !state.settings.learningEnabled || !isActivity(activity)) return
    state.recentActions = rememberAction(state.recentActions, activity)
    saveState()
    publishMemory()
  })
  ipcMain.handle('feedback', (_event, activity: unknown, feedback: unknown) => {
    if (!state.settings.memoryEnabled || !state.settings.learningEnabled || !isActivity(activity)) return false
    if (feedback !== 1 && feedback !== -1) return false
    state.learning = learnFeedback(state.learning, activity, feedback)
    state.interactionCount += 1
    saveState()
    publishMemory()
    return true
  })
  ipcMain.on('set-frame', (_event, frame: PetFrame) => {
    if (!pet || pet.isDestroyed()) return
    const next = {
      x: Math.round(frame.x - frame.anchorX),
      y: Math.round(frame.y - frame.anchorY),
      width: Math.max(120, Math.round(frame.width)),
      height: Math.max(120, Math.round(frame.height)),
    }
    const current = pet.getBounds()
    if (current.x === next.x && current.y === next.y && current.width === next.width && current.height === next.height) return
    pet.setBounds(next)
  })
  ipcMain.on('mouse-policy', (_event, policy: 'ignore' | 'active' | 'focus') => {
    if (!pet || pet.isDestroyed()) return
    if (policy === 'ignore') {
      pet.setFocusable(false)
      pet.setIgnoreMouseEvents(true, { forward: true })
    } else if (policy === 'focus') {
      pet.setIgnoreMouseEvents(false)
      pet.setFocusable(true)
    } else {
      pet.setFocusable(false)
      pet.setIgnoreMouseEvents(false)
    }
  })
  ipcMain.on('pet-visible', (_event, visible: boolean) => {
    if (!pet || pet.isDestroyed()) return
    if (visible && state.settings.enabled) pet.showInactive()
    else pet.hide()
  })
  ipcMain.on('open', (_event, target: 'settings' | 'playground') => createUtility(target))
  ipcMain.on('command', (_event, command: { type: string; mode?: string }) => {
    if (command.type === 'quit') app.quit()
    if (command.type === 'mode' && command.mode) applySettings({ ...state.settings, mode: command.mode as PipMode })
    else send('command', command)
  })
  ipcMain.on('approval', (_event, accept: boolean) => {
    log('info', 'codex', accept ? 'Approval accepted' : 'Approval denied')
    session.respondApproval(Boolean(accept))
  })
  ipcMain.on('log', (_event, level: string, message: string) => log(level, 'renderer', String(message)))
}

function painted(window: BrowserWindow): Promise<void> {
  const loaded = !window.webContents.isLoading() && window.webContents.getURL().includes('playground')
    ? Promise.resolve()
    : new Promise<void>((resolve) => window.webContents.once('did-finish-load', () => resolve()))
  return loaded.then(() => window.webContents.executeJavaScript(
    'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(document.body.innerText.slice(0, 180)))))',
  )).then(() => new Promise((resolve) => setTimeout(resolve, 300)))
}

async function shots(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 1600))
  const dir = path.join(app.getAppPath(), 'artifacts')
  fs.mkdirSync(dir, { recursive: true })
  const petImage = await pet?.webContents.capturePage()
  if (petImage) fs.writeFileSync(path.join(dir, 'pet.png'), petImage.toPNG())
  const playground = createUtility('playground')
  await painted(playground)
  for (const id of ['idle_sit', 'look_left', 'look_right', 'look_behind', 'head_tilt', 'body_shake', 'celebrate', 'scratch_ear', 'sleep_breathe']) {
    await playground.webContents.executeJavaScript(`window.__pip.setClip(${JSON.stringify(id)})`)
    await new Promise((resolve) => setTimeout(resolve, 700))
    const dataUrl = await playground.webContents.executeJavaScript("document.querySelector('#stage').toDataURL('image/png')")
    fs.writeFileSync(path.join(dir, `${id}.png`), Buffer.from(String(dataUrl).split(',')[1] ?? '', 'base64'))
  }
  const logText = await playground.webContents.executeJavaScript(`
    const button = [...document.querySelectorAll('#events button')].find((item) => item.textContent.includes('VS Code'))
    button?.click()
    new Promise((resolve) => setTimeout(() => resolve(document.getElementById('log').innerText), 800))
  `)
  fs.writeFileSync(path.join(dir, 'sim-log.txt'), String(logText))
  const simUrl = await playground.webContents.executeJavaScript("document.querySelector('#stage').toDataURL('image/png')")
  fs.writeFileSync(path.join(dir, 'sim-vscode.png'), Buffer.from(String(simUrl).split(',')[1] ?? '', 'base64'))
  const settings = createUtility('settings')
  await new Promise<void>((resolve) => {
    if (!settings.webContents.isLoading() && settings.webContents.getURL().includes('settings')) resolve()
    else settings.webContents.once('did-finish-load', () => resolve())
  })
  const settingsText = await settings.webContents.executeJavaScript('document.body.innerText')
  fs.writeFileSync(path.join(dir, 'settings.txt'), String(settingsText))
  app.quit()
}

if (gotLock) app.whenReady().then(() => {
  state = loadState()
  state.launchCount += 1
  saveState()
  logPath = path.join(app.getPath('userData'), 'logs', 'pip.log')
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  applyAppIcon()
  if (process.platform === 'darwin' && app.setActivationPolicy) app.setActivationPolicy('accessory')
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
  ]))
  fs.mkdirSync(path.join(app.getPath('userData'), 'assistant-general'), { recursive: true })
  let assistantMemory: unknown
  try { assistantMemory = JSON.parse(fs.readFileSync(assistantFile(), 'utf8')) } catch { assistantMemory = undefined }
  brain = new AssistantBrain({ session, neutralCwd: path.join(app.getPath('userData'), 'assistant-general'), readProject: inspectProject, persist: persistAssistant, memory: assistantMemory,
    enabled: () => state.settings.codexEnabled, executionSandbox: () => state.settings.sandbox, suggestions: () => state.settings.mode === 'focus' || state.settings.mode === 'sleep' ? 'off' : state.settings.assistantSuggestions })
  debugBrain = new AssistantBrain({ session: new CodexSession(), neutralCwd: '/simulated', readProject: async () => { throw new Error('Simulation cannot read files') }, persist: () => {}, simulated: true })
  brain.on(snapshot => send('brain', snapshot))
  debugBrain.on(snapshot => send('debug-brain', snapshot))
  brainTimer = setInterval(() => brain.tick(), 30000)
  configureIntegration()
  registerIpc()
  session.on(broadcastCodex)
  createPet()
  rebuildTray()
  syncLoginItem()
  startHelper()
  if (!state.settings.desktopAwareness) publishDesktop([], 'unavailable', 'unknown')
  if (state.settings.codexEnabled) void startCodex(true)
  log('info', 'app', 'Pip started', { launch: state.launchCount })
  if (process.argv.includes('--playground')) createUtility('playground')
  if (process.argv.includes('--shot') || process.env.PIP_SHOT === '1') void shots()
  const displayChanged = () => {
    lastWorldReport = null
    pet?.webContents.send('desktop', { windows: lastWindows, displays: electronDisplays(), frontmost: null, idleSeconds: lastIdle, fullscreen: lastFullscreen, permission: helper ? 'granted' : 'limited', source: helper ? 'os' : 'unavailable', events: [{ type: 'display_changed', source: 'os' }] } satisfies DesktopPayload)
  }
  screen.on('display-added', displayChanged)
  screen.on('display-removed', displayChanged)
  screen.on('display-metrics-changed', () => {
    displayChanged()
    publishDesktop(lastWindows, helper ? 'os' : 'unavailable', helper ? 'granted' : 'limited')
  })
})

let quitting = false
app.on('before-quit', event => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  stopHelper()
  stopIntegration?.()
  if (brainTimer) clearInterval(brainTimer)
  void session.disconnect().finally(() => app.quit())
})

app.on('window-all-closed', () => {
  /* Pip lives in the menu bar. */
})
