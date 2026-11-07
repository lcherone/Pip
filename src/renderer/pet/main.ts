import type { BrainState } from '../../core/assistant/types'
import { brainAnimation } from '../../core/assistant/types'
import type { AnimationReport } from '../../core/animation/coach'
import { activityForAction, ACTIVITY_LABELS, type Activity, type LearningMemory } from '../../core/learning'
import { frameInterval, type Mood } from '../../core/animation/engine'
import { AnimationEngine } from '../../core/animation/engine'
import { BehaviourEngine, type ForceRequest } from '../../core/behaviour'
import { PerformanceDirector, type Performance, type Posture } from '../../core/director'
import { resolveFloor } from '../../core/desktop'
import type { DeskEvent } from '../../core/desktop'
import { MovementController } from '../../core/movement'
import { heldPosition, petAnchor } from '../../core/pet-layout'
import type { Intention } from '../../core/reply'
import { localPuppyReply } from '../../core/reply'
import { effectivePersonality, type PipMode, type Settings } from '../../core/settings'
import { playBark, playWhimper } from '../audio'
import { drawParticles, spawnBurst, updateParticles, type Particle } from '../draw/fx'
import { drawPuppy, puppyContains } from '../draw/puppy'
import type { BootPayload, CodexPush, DesktopPayload } from '../../shared/ipc'

const BASE_W = 420
const BASE_H = 460

const canvas = document.querySelector('#stage') as HTMLCanvasElement
const bubble = document.querySelector('#bubble') as HTMLDivElement
const talk = document.querySelector('#talk') as HTMLFormElement
const talkInput = document.querySelector('#talk-input') as HTMLInputElement
const approval = document.querySelector('#approval') as HTMLDivElement
const approvalTitle = document.querySelector('#approval-title') as HTMLElement
const approvalDetail = document.querySelector('#approval-detail') as HTMLElement
const menu = document.querySelector('#menu') as HTMLDivElement
const ctx = canvas.getContext('2d')!

const engine = new AnimationEngine()
// Fresh curiosity each launch; the playground and tests keep reproducible seeds.
const behaviour = new BehaviourEngine(undefined, crypto.getRandomValues(new Uint32Array(1))[0])
const movement = new MovementController()
const director = new PerformanceDirector(engine)
const particles: Particle[] = []

let settings: Settings | null = null
let desktop: DesktopPayload | null = null
let desktopReceivedAt = 0
let inbox: DeskEvent[] = []
let paused = false
let hidden = false
let hover = false
let dragging = false
let dragOffset = { x: 0, y: 0 }
let pointer = { x: 0, y: 0, speed: 0, seen: 0 }
let lastPointer = { x: 0, y: 0, t: 0 }
let downAt: { x: number; y: number; t: number } | null = null
const chatLine = document.querySelector('#chat-line') as HTMLParagraphElement
const trainHint = document.querySelector('#train-hint') as HTMLParagraphElement
let releaseAt = 0
let lastSave = 0
let lastRest = 0
let thinking = false
let bubbleText = ''
let pendingForce: ForceRequest | null = null
let lastSound = ''
let approvalOpen = false
let latestPose = engine.update(0, { phase: 0, time: 0 }).pose
let affinity: Record<string, number> = {}
let bubbleUntil = 0
let fxToken = -1
let spokenToken = -1
let lastPaw = 0
let learning: LearningMemory = {}
let animationReport: AnimationReport | null = null
let animationCheckTimer = 0
let lastBrainState: BrainState = 'disconnected'
let recentActions: string[] = []
let observedToken = -1
let lastActivity: Activity | null = null
let lastActivityAt = 0
let sentPlaces = behaviour.places
let worldDebug = false
let worldReportAt = 0

function resize(): void {
  const scale = settings?.scale ?? 1
  const width = Math.round(BASE_W * scale)
  const height = Math.round(BASE_H * scale)
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  document.body.style.width = `${width}px`
  document.body.style.height = `${height}px`
}

function anchor(): { x: number; y: number } {
  const scale = settings?.scale ?? 1
  return petAnchor(movement, desktop?.displays ?? [], scale)
}

function syncFrame(): void {
  const scale = settings?.scale ?? 1
  const point = anchor()
  window.pip.setFrame({
    x: movement.x,
    y: movement.y,
    width: Math.round(BASE_W * scale),
    height: Math.round(BASE_H * scale),
    anchorX: point.x,
    anchorY: point.y,
  })
}

function localPoint(event: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function overPuppy(event: MouseEvent): boolean {
  const point = localPoint(event)
  const pointA = anchor()
  return puppyContains(point.x, point.y, latestPose, pointA.x, pointA.y, settings?.scale ?? 1)
}

function setBubble(text: string, seconds = 6): void {
  bubbleText = text
  bubble.textContent = text
  if (text && !menu.classList.contains('hidden')) chatLine.textContent = text
  bubble.classList.toggle('hidden', !text)
  bubble.style.pointerEvents = text ? 'auto' : 'none'
  bubbleUntil = text ? performance.now() + seconds * 1000 : 0
  positionChrome()
}

function positionChrome(): void {
  const scale = settings?.scale ?? 1
  const point = anchor()
  const top = Math.max(8, point.y - 168 * scale)
  for (const node of [bubble, approval]) {
    node.style.left = '18px'
    node.style.top = `${top}px`
  }
  if (!menu.classList.contains('hidden')) {
    const limit = Math.max(120, point.y - 18)
    menu.style.left = '12px'
    menu.style.top = '10px'
    menu.style.width = `${Math.max(180, Math.round(BASE_W * scale - 24))}px`
    menu.style.maxHeight = `${limit - 10}px`
  }
}

function showMenu(open: boolean): void {
  const learningOn = Boolean(settings?.memoryEnabled && settings.learningEnabled)
  const recent = learningOn && lastActivity && performance.now() - lastActivityAt < 30000 ? lastActivity : null
  for (const id of ['encourage', 'discourage']) {
    const button = menu.querySelector(`[data-id="${id}"]`) as HTMLButtonElement
    button.disabled = !recent
  }
  trainHint.textContent = !learningOn
    ? 'Learning is turned off.'
    : recent
      ? `Just now: ${ACTIVITY_LABELS[recent].toLowerCase()}.`
      : 'Let him do something, then tell him if you liked it.'
  menu.classList.toggle('hidden', !open)
  positionChrome()
  refreshPolicy()
  if (open) talkInput.focus()
}

function refreshPolicy(): void {
  const cardOpen = !menu.classList.contains('hidden')
  const interactive = dragging || hover || cardOpen || approvalOpen
  const focus = cardOpen || approvalOpen
  window.pip.setMousePolicy(focus ? 'focus' : interactive ? 'active' : 'ignore')
}

function intentionForce(intention: Intention): ForceRequest {
  const emote = {
    celebrate: 'celebrate',
    report_problem: 'react_failure',
    investigate: 'curious',
    explain: 'look_expectant',
    ask: 'head_tilt',
    offer_help: 'request_attention',
    chat: 'happy_wag',
  }[intention]
  return { action: 'emote', emote }
}

function pushCodex(payload: CodexPush): void {
  if (payload.kind === 'delta' && payload.text) {
    setBubble(payload.text)
    thinking = true
    return
  }
  if (payload.kind === 'reply' && payload.text) {
    setBubble(payload.text)
    pendingForce = intentionForce((payload.intention as Intention) ?? 'chat')
    thinking = false
    inbox.push({ type: payload.intention === 'report_problem' ? 'codex_failed' : 'codex_completed', source: 'os' })
    return
  }
  if (payload.kind === 'approval') {
    approvalOpen = true
    approval.classList.remove('hidden')
    approvalTitle.textContent = payload.title ?? 'Approval needed'
    approvalDetail.textContent = payload.approvalDetail ?? ''
    refreshPolicy()
    return
  }
  if (payload.kind === 'cleared') {
    approvalOpen = false
    approval.classList.add('hidden')
    refreshPolicy()
  }
}

function notePointer(x: number, y: number): void {
  const now = performance.now()
  const dt = Math.max(0.016, (now - lastPointer.t) / 1000)
  pointer.speed = lastPointer.t ? Math.hypot(x - lastPointer.x, y - lastPointer.y) / dt : 0
  pointer.x = x
  pointer.y = y
  pointer.seen = now
  lastPointer = { x, y, t: now }
}

window.pip.onCursor(({ x, y }) => notePointer(x, y))

function dragTo(event: PointerEvent): void {
  const feet = heldPosition({ x: event.screenX - dragOffset.x, y: event.screenY - dragOffset.y }, desktop?.displays ?? [], settings?.scale ?? 1)
  movement.place(feet.x, feet.y)
  movement.held = true
  syncFrame()
  positionChrome()
}

window.addEventListener('pointermove', (event) => {
  notePointer(event.screenX, event.screenY)
  hover = overPuppy(event) || !menu.classList.contains('hidden') || Boolean((event.target as HTMLElement).closest?.('#bubble, #brain-suggestion'))
  if (downAt && !dragging && Math.hypot(event.screenX - downAt.x, event.screenY - downAt.y) > 6) {
    dragging = true
    showMenu(false)
  }
  if (dragging) dragTo(event)
  refreshPolicy()
})

window.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || (event.target as HTMLElement).closest?.('#menu, #talk, #approval, #brain-suggestion')) return
  if (!overPuppy(event)) return
  downAt = { x: event.screenX, y: event.screenY, t: performance.now() }
  dragOffset = { x: event.screenX - movement.x, y: event.screenY - movement.y }
  canvas.setPointerCapture(event.pointerId)
})

function releasePointer(event: PointerEvent, cancelled = false): void {
  if (!downAt) return
  const moved = Math.hypot(event.screenX - downAt.x, event.screenY - downAt.y)
  if (dragging || moved > 6 || cancelled) {
    if (!cancelled) dragTo(event)
    dragging = false
    movement.releaseToGravity(currentFloor().floorY, settings?.windowClimbing ? desktop?.windows ?? [] : [])
    releaseAt = performance.now() + (settings?.releaseDelay ?? 0.7) * 1000
  } else if (overPuppy(event)) {
    inbox.push({ type: 'clicked', source: 'user' })
    showMenu(menu.classList.contains('hidden'))
  }
  downAt = null
  dragging = false
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
  refreshPolicy()
}

window.addEventListener('pointerup', event => releasePointer(event))
window.addEventListener('pointercancel', event => releasePointer(event, true))
window.addEventListener('lostpointercapture', event => { if (downAt) releasePointer(event, true) })

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !menu.classList.contains('hidden')) showMenu(false)
})

menu.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest('button')
  if (!button || button.disabled || button.type === 'submit') return
  const id = button.dataset.id
  if (id === 'shared-text') {
    showMenu(false)
    void window.pip.reactToCopiedText()
    return
  }
  if ((id !== 'encourage' && id !== 'discourage') || !lastActivity || performance.now() - lastActivityAt >= 30000) return
  const activity = lastActivity
  const more = id === 'encourage'
  void window.pip.feedback(activity, more ? 1 : -1).then((learned) => {
    const line = learned
      ? more ? `Okay! More ${ACTIVITY_LABELS[activity].toLowerCase()}.` : `Got it. I'll ease off ${ACTIVITY_LABELS[activity].toLowerCase()}.`
      : 'I could not remember that.'
    chatLine.textContent = line
    setBubble(line, 3)
  })
})

talk.addEventListener('submit', (event) => {
  event.preventDefault()
  const text = talkInput.value.trim()
  if (!text) return
  talkInput.value = ''
  if (settings?.codexEnabled) {
    thinking = true
    setBubble('…')
    inbox.push({ type: 'codex_started', source: 'user' })
    void window.pip.talk(text, desktop?.frontmost?.name ?? null)
    return
  }
  const reply = localPuppyReply(text)
  chatLine.textContent = reply.say
  setBubble(reply.say)
  pendingForce = intentionForce(reply.intention)
})

document.querySelector('#allow')?.addEventListener('click', () => window.pip.decideApproval(true))
document.querySelector('#deny')?.addEventListener('click', () => window.pip.decideApproval(false))

function currentFloor(): ReturnType<typeof resolveFloor> {
  return resolveFloor({
    x: movement.x,
    y: movement.y,
    displays: desktop?.displays ?? [],
    multiMonitor: settings?.multiMonitor ?? true,
  })
}

let last = performance.now()
let performing = false
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  const moving = Math.abs(movement.vx) > 12 || movement.airborne || dragging || performing
  const sleeping = behaviour.mood === 'sleepy' && !moving
  const quality = settings?.quality ?? 'balanced'
  const interval = frameInterval(quality, moving, sleeping)
  if (!hidden) draw(dt)
  const delay = hidden ? 400 : interval
  if (delay <= 20) requestAnimationFrame(frame)
  else window.setTimeout(() => requestAnimationFrame(frame), delay - 16)
}

function draw(dt: number): void {
  if (!settings) return
  const observationsFresh = performance.now() - desktopReceivedAt < 5000
  const windows = settings.desktopAwareness && observationsFresh ? desktop?.windows ?? [] : []
  const floor = currentFloor()
  const cursorFresh = performance.now() - pointer.seen < 1500
  const autonomy = performance.now() > releaseAt && !dragging
  const output = behaviour.update({
    dt,
    now: Date.now() / 1000,
    x: movement.x,
    y: movement.y,
    floorY: floor.floorY,
    minimumPerchY: (desktop?.displays.find(display => display.id === floor.displayId)?.workArea.y ?? 40) + 12,
    minX: floor.minX,
    maxX: floor.maxX,
    cursor: cursorFresh && settings.followCursor ? { x: pointer.x, y: pointer.y, speed: pointer.speed } : null,
    windows,
    displays: desktop?.displays ?? [],
    petSize: { w: 120 * settings.scale, h: 130 * settings.scale },
    focusedApp: observationsFresh ? desktop?.frontmost?.name ?? null : null,
    idleSeconds: desktop?.idleSeconds ?? 0,
    surfaceId: movement.surfaceId,
    airborne: movement.airborne || movement.motion === 'climb',
    typing: settings.desktopAwareness && settings.reactToTyping && performance.now() - desktopReceivedAt < 3500 ? desktop?.typing : null,
    windowInteractionFrequency: settings.windowInteractionFrequency,
    dragging,
    mode: paused ? 'focus' : settings.mode,
    paused,
    events: inbox.splice(0, 32),
    affinity,
    supportLost: movement.justRecovered || Boolean(movement.surfaceId && !windows.some((item) => item.id === movement.surfaceId)),
    arrived: movement.arrived,
    allowIntro: autonomy && settings.mode !== 'focus' && settings.mode !== 'sleep',
    followWindows: settings.followWindows,
    windowClimbing: settings.windowClimbing,
    followCursor: settings.followCursor,
    memoryEnabled: settings.memoryEnabled,
    learningEnabled: settings.learningEnabled,
    learning,
    recentActions,
    force: pendingForce,
  })
  pendingForce = null
  canvas.dataset.activity = output.action
  canvas.dataset.reason = output.reason
  const activity = activityForAction(output.action)
  if (activity && output.token !== observedToken && !dragging && !paused) {
    observedToken = output.token
    lastActivity = activity
    lastActivityAt = performance.now()
    if (settings.memoryEnabled && settings.learningEnabled) window.pip.remember(activity)
  }
  const posture: Posture = dragging ? 'held' : output.posture
  const performanceState: Performance = {
    posture, gait: output.gait, emote: thinking ? 'watch_progress' : output.emote,
    facing: movement.facing, motion: movement.motion, force: output.force || dragging,
    token: output.token + (thinking ? 1000 : 0),
    airborne: movement.airborne, justLanded: movement.justLanded,
  }
  const kind = director.prepareMovement(performanceState)
  if (output.faceX !== null && output.gait === 'none' && !dragging && !movement.airborne) movement.glance(output.faceX - movement.x)
  if (autonomy || movement.airborne || dragging) {
    movement.update(dt, {
      kind: dragging ? 'held' : autonomy ? kind : 'idle',
      targetX: output.targetX ?? undefined,
      targetY: autonomy ? output.targetY ?? floor.floorY : floor.floorY,
      surfaceId: autonomy ? output.surfaceId : null,
    }, { floorY: floor.floorY, minX: floor.minX, maxX: floor.maxX, windows: settings.windowClimbing ? windows : [], displays: desktop?.displays ?? [] })
  }
  director.sync({
    ...performanceState,
    facing: movement.facing,
    motion: movement.motion,
    airborne: movement.airborne,
    justLanded: movement.justLanded,
  })
  const animated = engine.update(dt, {
    phase: movement.phase,
    time: performance.now() / 1000,
    targetYaw: movement.yaw,
    look: output.look,
    headLook: output.headLook,
    balance: -movement.supportMotion.x / 35,
    mood: output.mood as Mood,
    applyMood: true,
    airborne: movement.airborne,
    held: dragging,
    autoBlink: !output.emote && !thinking,
  })
  latestPose = animated.pose
  if (worldDebug && performance.now() - worldReportAt > 500 && behaviour.worldView) {
    worldReportAt = performance.now()
    window.pip.reportWorld({ at: Date.now() / 1000, world: behaviour.worldView,
      movement: { x: movement.x, y: movement.y, vx: movement.vx, vy: movement.vy, surfaceId: movement.surfaceId, airborne: movement.airborne, motion: movement.motion, recovered: movement.justRecovered },
      pose: animated.pose, action: output.action, reason: output.reason,
      capabilities: { geometry: desktop?.source === 'os' && observationsFresh ? 'available' : 'limited', accessibility: desktop?.accessibility ? 'available' : 'unavailable', detailedContent: false } })
  }
  performing = Boolean(output.emote) || output.gait !== 'none' || movement.airborne || dragging
  const nowMs = performance.now()
  if (bubbleUntil && nowMs > bubbleUntil && !approvalOpen) setBubble('')
  if ((output.fx === 'hearts' || output.fx === 'sparkle') && output.token !== fxToken) {
    fxToken = output.token
    spawnBurst(particles, anchor().x, anchor().y - 120 * settings.scale, output.fx === 'hearts' ? 'heart' : 'spark')
  }
  if (output.fx === 'paws' && Math.abs(movement.vx) > 20 && nowMs - lastPaw > 420) {
    lastPaw = nowMs
    spawnBurst(particles, anchor().x, anchor().y - 4, 'paw')
  }
  if (settings.sounds && output.emote && output.emote !== lastSound) {
    if (output.emote === 'bark') playBark()
    if (output.emote === 'whimper') playWhimper()
    lastSound = output.emote
  }
  if (!output.emote) lastSound = ''
  updateParticles(particles, dt)
  const width = BASE_W * settings.scale
  const height = BASE_H * settings.scale
  ctx.clearRect(0, 0, width, height)
  positionChrome()
  const point = anchor()
  drawPuppy(ctx, animated.pose, point.x, point.y, settings.scale, animated.time, animated.tailPhase)
  drawParticles(ctx, particles)
  if (behaviour.places !== sentPlaces) {
    sentPlaces = behaviour.places
    window.pip.noteEnvironment(behaviour.places)
  }
  if (output.speech && output.token !== spokenToken) {
    spokenToken = output.token
    setBubble(output.speech, 4)
  }
  if (!dragging) syncFrame()
  const now = performance.now()
  if (now - lastSave > 2000) {
    lastSave = now
    window.pip.savePosition({ x: movement.x, y: movement.y })
  }
  if (output.action === 'approach' && desktop?.frontmost?.name && now - lastRest > 8000 && settings.memoryEnabled) {
    lastRest = now
    window.pip.noteRest(desktop.frontmost.name)
  }
  const fullscreen = Boolean(desktop?.fullscreen && settings.hideDuringFullscreen)
  if (fullscreen !== hidden) {
    hidden = fullscreen
    window.pip.setPetVisible(!hidden)
  }
}

window.pip.onEnvironmentEvent(event => inbox.unshift(event))

window.pip.onDesktop((payload) => {
  desktopReceivedAt = performance.now()
  desktop = payload
  inbox.push(...payload.events)
  if (inbox.length > 32) inbox.splice(0, inbox.length - 32)
})
window.pip.onCommand((command) => {
  if (command.type === 'world-debug') worldDebug = command.enabled === true
  if (command.type === 'environment-cleared') { behaviour.resetEnvironment(); sentPlaces = behaviour.places }
  if (command.type === 'memory-cleared') {
    behaviour.resetEnvironment()
    window.clearTimeout(animationCheckTimer)
    lastActivity = null
  }
  if (command.type === 'pause') paused = !paused
  if (command.type === 'hide') {
    hidden = true
    window.pip.setPetVisible(false)
  }
  if (command.type === 'show') {
    hidden = false
    window.pip.setPetVisible(true)
  }
  if (command.type === 'mode' && command.mode && settings) {
    settings = { ...settings, mode: command.mode as PipMode }
    behaviour.setPersonality(effectivePersonality(settings.personality, settings.mode))
  }
  if (command.settings) {
    if (settings?.desktopAwareness && !command.settings.desktopAwareness) behaviour.clearPerception()
    settings = command.settings
    behaviour.setPersonality(effectivePersonality(settings.personality, settings.mode))
    applyAnimationLearning()
    resize()
  }
})
window.pip.onCodex(pushCodex)
function applyAnimationLearning(): void {
  engine.setTransitionDurations(settings?.memoryEnabled && settings.learningEnabled ? animationReport?.durations ?? {} : {})
}

window.pip.onMemory((memory) => {
  affinity = memory.affinity
  learning = memory.learning
  recentActions = memory.recentActions
  animationReport = memory.animationReport
  applyAnimationLearning()
})

void window.pip.getBoot().then((boot: BootPayload) => {
  settings = boot.settings
  affinity = boot.state.affinity ?? {}
  learning = boot.state.learning
  recentActions = boot.state.recentActions
  behaviour.places = boot.state.environment
  animationReport = boot.state.animationReport
  applyAnimationLearning()
  if (settings.memoryEnabled && settings.learningEnabled && !animationReport) {
    animationCheckTimer = window.setTimeout(() => {
      if (!animationReport && settings?.memoryEnabled && settings.learningEnabled) {
        void window.pip.checkAnimations().catch(() => window.pip.log('warn', 'Animation self-check could not complete'))
      }
    }, 2000)
  }
  behaviour.setPersonality(effectivePersonality(settings.personality, settings.mode))
  const floor = resolveFloor({
    x: boot.position?.x ?? 400,
    y: boot.position?.y ?? 800,
    displays: boot.displays,
    multiMonitor: settings.multiMonitor,
  })
  movement.place(boot.position?.x ?? floor.x, boot.position?.y ?? floor.floorY)
  desktop = {
    windows: [],
    displays: boot.displays,
    frontmost: null,
    idleSeconds: 0,
    fullscreen: false,
    permission: 'unknown',
    source: 'unavailable',
    events: [],
  }
  resize()
  positionChrome()
  refreshPolicy()
  requestAnimationFrame(frame)
})

bubble.addEventListener('click', () => showMenu(true))
const suggestionBubble = document.createElement('div')
suggestionBubble.id = 'brain-suggestion'
suggestionBubble.className = 'brain-suggestion hidden'
document.body.append(suggestionBubble)
window.pip.onBrain((snapshot) => {
  thinking = ['thinking', 'executing', 'responding', 'waiting_approval'].includes(snapshot.state)
  if (snapshot.state !== lastBrainState) {
    lastBrainState = snapshot.state
    if (!['idle', 'disconnected'].includes(snapshot.state)) pendingForce = { action: 'emote', emote: brainAnimation(snapshot.state) }
    if (snapshot.approval) setBubble('I need your approval. Click to review.', 10)
  }
  const suggestion = snapshot.suggestions.filter(s => s.status === 'offered' && s.expiresAt > Date.now()).at(-1)
  suggestionBubble.classList.toggle('hidden', !suggestion || settings?.mode === 'focus' || settings?.mode === 'sleep')
  suggestionBubble.replaceChildren()
  if (suggestion) {
    const p = document.createElement('p'); p.textContent = suggestion.text; suggestionBubble.append(p)
    for (const [action, text] of [['do', 'Do it'], ['more', 'Tell me more'], ['dismiss', 'Dismiss']] as const) {
      const button = document.createElement('button'); button.textContent = text
      button.onclick = () => void window.pip.brainCommand({ type: 'suggestion', id: suggestion.id, action }).catch(() => setBubble('Open the conversation to connect Codex first.'))
      suggestionBubble.append(button)
    }
  }
})
