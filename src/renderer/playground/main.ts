import { WORLD_SCENARIOS, worldScenario, type WorldScenarioName } from '../../core/scenarios'
import { diffWindows, observeWindows } from '../../core/desktop'
import type { WorldDebugSnapshot } from '../../shared/world'
import type { PipMode } from '../../core/settings'
import type { TypingActivity } from '../../core/activity'
import { localPuppyReply } from '../../core/reply'
import { AnimationEngine, type Mood } from '../../core/animation/engine'
import { BehaviourEngine } from '../../core/behaviour'
import { listClips } from '../../core/animation/clips'
import { PerformanceDirector } from '../../core/director'
import type { DeskEvent, DesktopWindow } from '../../core/desktop'
import type { WorldView } from '../../core/world'
import { resolveFloor } from '../../core/desktop'
import { MovementController } from '../../core/movement'
import { effectivePersonality, type Personality } from '../../core/settings'
import { finitePose } from '../../core/pose'
import { drawPuppy } from '../draw/puppy'

const canvas = document.querySelector('#stage') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const list = document.querySelector('#list') as HTMLDivElement
const log = document.querySelector('#log') as HTMLPreElement
const diag = document.querySelector('#diag') as HTMLParagraphElement
const frame = document.querySelector('#stage-frame') as HTMLDivElement
const clips = listClips()
const engine = new AnimationEngine()
let behaviour = new BehaviourEngine(effectivePersonality({
  curiosity: 0.7, playfulness: 0.7, energy: 0.6, confidence: 0.5, sociability: 0.6,
  attentionSeeking: 0.4, sleepiness: 0.3, excitability: 0.6, independence: 0.4,
}, 'playful'), 3)
const movement = new MovementController()
const director = new PerformanceDirector(engine)

let display = { id: 'sim', bounds: { x: 0, y: 0, w: 980, h: 620 }, workArea: { x: 30, y: 36, w: 920, h: 520 }, scaleFactor: 1 }
let displays = [display]
let source: 'simulation' | 'live' = 'simulation'
let liveWorld: WorldDebugSnapshot | null = null
let simMode: PipMode = 'playful'
let scenario: WorldScenarioName | null = null
let scenarioStarted = 0
let scenarioPolled = 0
let sceneFullscreen = false
let sceneAccessibility = true
let debuggerUpdated = 0
let windows: DesktopWindow[] = []
let simulatedTyping: TypingActivity | null = null
let typingStarted = 0
let cursor = { x: 700, y: 180, speed: 0 }
let mode: 'behaviour' | 'clip' = 'behaviour'
let paused = false
let loop = true
let speed = 1
let mood: Mood = 'calm'
let previewId = 'idle_sit'
let previewFacing: 'animation' | 'left' | 'front' | 'right' = 'animation'
let cycling = false
let cycleIndex = 0
let cycleStarted = 0
let cycleSafe = true
const cycleResults = new Map<string, 'played' | 'failed'>()
const cycleStatus = document.querySelector('#cycle-status') as HTMLParagraphElement
let inbox: DeskEvent[] = []
let lines: string[] = []
let loggedToken = -1
let frames = 0
let fps = 0
let fpsTick = performance.now()
const personality: Personality = {
  curiosity: 0.7, playfulness: 0.7, energy: 0.6, confidence: 0.5, sociability: 0.6,
  attentionSeeking: 0.4, sleepiness: 0.3, excitability: 0.6, independence: 0.4,
}

movement.place(220, 548)

function renderList(): void {
  const query = (document.querySelector('#search') as HTMLInputElement).value.toLowerCase()
  list.innerHTML = ''
  for (const clip of clips) {
    if (query && !clip.id.includes(query) && !clip.category.includes(query)) continue
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = `${clip.id} · ${clip.category}${cycleResults.has(clip.id) ? ` · ${cycleResults.get(clip.id)}` : ''}`
    button.classList.toggle('active', mode === 'clip' && clip.id === previewId)
    button.addEventListener('click', () => {
      mode = 'clip'
      previewId = clip.id
      stopCycle()
      engine.play(clip.id, { force: true, once: !loop })
      renderList()
    })
    list.append(button)
  }
}

function stopCycle(): void {
  if (!cycling) return
  cycling = false
  cycleStatus.textContent = `Cycle stopped after ${cycleResults.size}/${clips.length} clips. Visual review is separate.`
}

function push(event: DeskEvent): void {
  inbox.push(event)
  note(`SIM ${event.type}`)
}

function note(line: string): void {
  lines = [`${new Date().toLocaleTimeString()}  ${line}`, ...lines].slice(0, 10)
  log.textContent = lines.join('\n')
}

const eventButtons: { label: string; run: () => void }[] = [
  { label: 'Typing burst', run: () => {
    if (!windows.length) openApp('Editor', 'sim.editor', 180, 260, 460, 290)
    const app = windows[windows.length - 1]!.app
    typingStarted = performance.now() / 1000 - 5
    simulatedTyping = { active: true, pace: 'busy', app, duration: 5, source: 'sim' }
    push({ type: 'typing_started', app, source: 'sim' })
  } },
  { label: 'Typing paused', run: () => {
    const app = simulatedTyping?.app ?? 'Editor'
    simulatedTyping = null
    push({ type: 'typing_paused', app, duration: 45, source: 'sim' })
  } },
  { label: 'Shared success text', run: () => push({ type: 'shared_text', reply: localPuppyReply('All tests passed', 'shared-text'), source: 'sim' }) },

  { label: 'VS Code opened', run: () => openApp('Visual Studio Code', 'com.microsoft.VSCode', 180, 390, 460, 150) },
  { label: 'Terminal opened', run: () => openApp('Terminal', 'com.apple.Terminal', 80, 420, 360, 120) },
  { label: 'Browser opened', run: () => openApp('Safari', 'com.apple.Safari', 520, 360, 380, 180) },
  { label: 'Move window', run: () => moveWindow() },
  { label: 'Close window', run: () => closeWindow() },
  { label: 'User inactive', run: () => push({ type: 'idle', idleSeconds: 140, source: 'sim' }) },
  { label: 'User active', run: () => push({ type: 'active', source: 'sim' }) },
  { label: 'Pet', run: () => push({ type: 'petted', source: 'sim' }) },
  { label: 'Click', run: () => push({ type: 'clicked', source: 'sim' }) },
  { label: 'Cursor dash', run: () => { cursor.speed = 1400 } },
  { label: 'Codex started', run: () => push({ type: 'codex_started', source: 'sim' }) },
  { label: 'Codex completed', run: () => push({ type: 'codex_completed', source: 'sim' }) },
  { label: 'Codex failed', run: () => push({ type: 'codex_failed', source: 'sim' }) },
  { label: 'Permission denied', run: () => push({ type: 'permission', granted: false, source: 'sim' }) },
  { label: 'One window', run: () => layout([{ app: 'Notes', bundleId: 'com.apple.Notes', x: 180, y: 360, w: 420, h: 180 }]) },
  { label: 'Two overlapping', run: () => layout([
    { app: 'Safari', bundleId: 'com.apple.Safari', x: 80, y: 300, w: 520, h: 240 },
    { app: 'Notes', bundleId: 'com.apple.Notes', x: 260, y: 250, w: 360, h: 200 },
  ]) },
  { label: 'Scattered windows', run: () => layout([
    { app: 'Notes', bundleId: 'com.apple.Notes', x: 60, y: 400, w: 280, h: 140 },
    { app: 'Terminal', bundleId: 'com.apple.Terminal', x: 420, y: 340, w: 300, h: 180 },
    { app: 'Safari', bundleId: 'com.apple.Safari', x: 680, y: 280, w: 240, h: 220 },
  ]) },
]

function layout(items: { app: string; bundleId: string; x: number; y: number; w: number; h: number }[]): void {
  scenario = null
  windows = []
  for (const item of items) openApp(item.app, item.bundleId, item.x, item.y, item.w, item.h)
}

function openApp(app: string, bundleId: string, x: number, y: number, w: number, h: number): void {
  scenario = null
  const window: DesktopWindow = {
    id: `sim-${bundleId}`,
    app,
    bundleId,
    displayId: 'sim',
    bounds: { x, y, w, h },
    focused: true,
    onScreen: true,
  }
  windows = windows.filter((item) => item.id !== window.id).concat(window)
  push({ type: 'app_launched', app, bundleId, source: 'sim' })
  push({ type: 'window_opened', windowId: window.id, app, bounds: window.bounds, source: 'sim' })
}

function moveWindow(): void {
  scenario = null
  const window = windows[windows.length - 1]
  if (!window) return
  window.bounds = { ...window.bounds, x: window.bounds.x + 80 }
  push({ type: 'window_moved', windowId: window.id, app: window.app, bounds: window.bounds, source: 'sim' })
}

function closeWindow(): void {
  scenario = null
  const window = windows.pop()
  if (!window) return
  push({ type: 'window_closed', windowId: window.id, app: window.app, source: 'sim' })
}

document.querySelector('#events')!.innerHTML = ''
for (const item of eventButtons) {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = item.label
  button.addEventListener('click', () => {
    stopCycle()
    mode = 'behaviour'
    item.run()
  })
  document.querySelector('#events')!.append(button)
}

document.querySelector('#mode')!.addEventListener('click', () => {
  stopCycle()
  mode = mode === 'behaviour' ? 'clip' : 'behaviour'
  ;(document.querySelector('#mode') as HTMLButtonElement).textContent = mode === 'behaviour' ? 'Clip preview' : 'Behaviour mode'
  if (mode === 'clip') engine.play(previewId, { force: true, once: !loop })
  renderList()
})
document.querySelector('#play')!.addEventListener('click', () => {
  paused = !paused
  engine.paused = paused
  ;(document.querySelector('#play') as HTMLButtonElement).textContent = paused ? 'Play' : 'Pause'
})
document.querySelector('#reset')!.addEventListener('click', () => {
  stopCycle()
  engine.reset('sitting')
  movement.place(220, 548)
})
document.querySelector('#facing')!.addEventListener('change', (event) => {
  previewFacing = (event.target as HTMLSelectElement).value as typeof previewFacing
})
document.querySelector('#loop')!.addEventListener('change', (event) => {
  stopCycle()
  loop = (event.target as HTMLInputElement).checked
  if (mode === 'clip') engine.play(previewId, { force: true, once: !loop })
})
document.querySelector('#speed')!.addEventListener('input', (event) => {
  speed = Number((event.target as HTMLInputElement).value)
  engine.timeScale = speed
  document.querySelector('#speed-out')!.textContent = speed.toFixed(2)
})
document.querySelector('#bg')!.addEventListener('input', (event) => {
  frame.style.background = (event.target as HTMLInputElement).value
})
document.querySelector('#checker')!.addEventListener('change', (event) => {
  frame.classList.toggle('checker', (event.target as HTMLInputElement).checked)
  if ((event.target as HTMLInputElement).checked) frame.style.background = ''
})
document.querySelector('#mood')!.addEventListener('change', (event) => {
  mood = (event.target as HTMLSelectElement).value as Mood
})
for (const id of ['playfulness', 'curiosity', 'energy'] as const) {
  document.querySelector(`#${id}`)!.addEventListener('input', (event) => {
    personality[id] = Number((event.target as HTMLInputElement).value)
    behaviour.setPersonality(effectivePersonality(personality, 'playful'))
  })
}
document.querySelector('#search')!.addEventListener('input', renderList)
document.querySelector('#cycle')!.addEventListener('click', () => {
  cycling = true
  cycleIndex = 0
  cycleResults.clear()
  engine.reset('sitting')
  paused = false
  engine.paused = false
  document.querySelector('#play')!.textContent = 'Pause'
  mode = 'clip'
  playCycle()
})

function playCycle(): void {
  const clip = clips[cycleIndex]
  if (!clip) {
    cycling = false
    const failed = [...cycleResults.values()].filter((result) => result === 'failed').length
    cycleStatus.textContent = `Playback checks: ${cycleResults.size - failed}/${clips.length} passed${failed ? ` · ${failed} failed` : ''}. Visual review is separate.`
    note('Cycle finished')
    return
  }
  previewId = clip.id
  cycleStarted = engine.update(0).time
  cycleSafe = true
  cycleStatus.textContent = `Checking ${cycleIndex + 1}/${clips.length}: ${clip.id}`
  engine.play(clip.id, { force: true, once: true })
  note(`Cycle ${clip.id}`)
  renderList()
}

let lastLook: { x: number; y: number } | null = null
let lastHeadLook: { x: number; y: number } | null = null
let lastWorld: WorldView | null = null

function checked(id: string): boolean { return (document.querySelector(`#${id}`) as HTMLInputElement | null)?.checked ?? true }

function drawWorld(view: WorldView | null, origin = { x: movement.x, y: movement.y }): void {
  if (!view) return
  ctx.save()
  ctx.font = '11px system-ui'
  if (checked('overlay-objects')) for (const object of view.objects) {
    if (!object.visible && object.type !== 'intersection') continue
    ctx.strokeStyle = object.type === 'intersection' ? '#bd7145' : object.provenance === 'inferred' ? '#ab8a4d' : '#4e7180'
    ctx.setLineDash(object.provenance === 'inferred' ? [4, 4] : [])
    ctx.strokeRect(object.bounds.x, object.bounds.y, object.bounds.w, object.bounds.h)
    if (['window', 'popover', 'display'].includes(object.type)) {
      ctx.fillStyle = '#3e2c20'
      ctx.fillText(`${object.id} · z${object.zOrder} · ${object.provenance}`, object.bounds.x + 5, object.bounds.y + 15)
    }
  }
  ctx.setLineDash([])
  if (checked('overlay-surfaces')) for (const surface of view.surfaces) {
    ctx.strokeStyle = surface.occluded ? '#b75454' : '#287b5c'
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(surface.x + 8, surface.y); ctx.lineTo(surface.x + surface.width - 8, surface.y); ctx.stroke()
  }
  if (checked('overlay-graph')) {
    const nodes = new Map(view.graph.nodes.map(node => [node.id, node]))
    ctx.lineWidth = 1
    for (const edge of view.graph.edges) {
      const from = nodes.get(edge.from)!, to = nodes.get(edge.to)!
      ctx.strokeStyle = edge.risk > 0.3 ? '#ba735d' : '#7198a2'
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke()
    }
    for (const node of view.graph.nodes) { ctx.fillStyle = '#40777f'; ctx.beginPath(); ctx.arc(node.x, node.y, 4, 0, Math.PI * 2); ctx.fill() }
  }
  if (checked('overlay-path')) {
    const steps = view.path ?? view.goal?.steps ?? []
    ctx.strokeStyle = '#bb633b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(origin.x, origin.y)
    for (const step of steps) ctx.lineTo(step.x, step.y)
    ctx.stroke()
  }
  const attention = view.attentionState?.target ?? view.attention
  if (attention && checked('overlay-attention')) {
    ctx.fillStyle = '#bb633b'; ctx.beginPath(); ctx.arc(attention.x, attention.y, 6, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

function fitWorld(items: import('../../core/desktop').DisplayInfo[]): void {
  if (!items.length) return
  const left = Math.min(...items.map(item => item.bounds.x)), top = Math.min(...items.map(item => item.bounds.y))
  const right = Math.max(...items.map(item => item.bounds.x + item.bounds.w)), bottom = Math.max(...items.map(item => item.bounds.y + item.bounds.h))
  const scale = Math.min((canvas.width - 30) / (right - left), (canvas.height - 30) / (bottom - top))
  ctx.translate(15, 15); ctx.scale(scale, scale); ctx.translate(-left, -top)
}

function describeWorld(view: WorldView | null, now: number, snapshot?: WorldDebugSnapshot): void {
  if (!view || now - debuggerUpdated < 400) return
  debuggerUpdated = now
  const capabilities = snapshot?.capabilities ?? { geometry: 'available', accessibility: sceneAccessibility ? 'available' : 'unavailable', detailedContent: false }
  document.querySelector('#world-summary')!.textContent = `${source} · ${view.objects.length} objects · ${view.graph.nodes.length} nodes · ${view.activeGoal?.phase ?? 'observing'} · Accessibility ${capabilities.accessibility}`
  document.querySelector('#world-debug')!.textContent = JSON.stringify({ source, capabilities, monitors: view.objects.filter(object => object.type === 'display'),
    objects: view.objects, surfaces: view.surfaces, graph: view.graph, goal: view.activeGoal, path: view.path, supportingSurface: snapshot?.movement.surfaceId ?? movement.surfaceId,
    attention: view.attentionState, events: view.perception, goalHistory: view.goalHistory, worldBuilds: view.builds }, null, 2)
}

function loadScenario(name: WorldScenarioName): void {
  source = 'simulation'
  ;(document.querySelector('#world-source') as HTMLSelectElement).value = source
  window.pip?.worldSource(source)
  document.querySelector('.banner')!.textContent = 'Simulated desktop — these events are not the live Mac'
  stopCycle(); mode = 'behaviour'; scenario = name; scenarioStarted = performance.now() / 1000; scenarioPolled = 0
  const scene = worldScenario(name)
  displays = scene.displays; display = displays[0]!; windows = observeWindows([], scene.windows, scenarioStarted)
  movement.reset(scene.start.x, scene.start.y, scene.start.surfaceId)
  behaviour = new BehaviourEngine(effectivePersonality(personality, simMode), 3)
  engine.reset(scene.start.surfaceId ? 'ledge' : 'sitting')
  inbox = []; simulatedTyping = null; sceneFullscreen = scene.fullscreen; sceneAccessibility = scene.accessibility
  note(`Scenario: ${name}`)
}

const scenarioSelect = document.querySelector('#scenario') as HTMLSelectElement
for (const name of WORLD_SCENARIOS) { const option = document.createElement('option'); option.textContent = name; scenarioSelect.append(option) }
scenarioSelect.addEventListener('change', () => loadScenario(scenarioSelect.value as WorldScenarioName))
document.querySelector('#scenario-reset')!.addEventListener('click', () => loadScenario(scenarioSelect.value as WorldScenarioName))
document.querySelector('#world-mode')!.addEventListener('change', event => { simMode = (event.target as HTMLSelectElement).value as PipMode; behaviour.setPersonality(effectivePersonality(personality, simMode)) })
document.querySelector('#world-source')!.addEventListener('change', event => {
  source = (event.target as HTMLSelectElement).value as typeof source
  window.pip?.worldSource(source)
  if (source === 'live') void window.pip?.getWorld().then(snapshot => { liveWorld = snapshot })
  document.querySelector('.banner')!.textContent = source === 'live' ? 'Live desktop snapshot — read only; Pip keeps moving on the desktop' : 'Simulated desktop — these events are not the live Mac'
})
if (window.pip) window.pip.onWorld(snapshot => { liveWorld = snapshot })

function drawWindow(window: DesktopWindow): void {
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.strokeStyle = 'rgba(90, 60, 30, 0.35)'
  ctx.lineWidth = 2
  round(window.bounds.x, window.bounds.y, window.bounds.w, window.bounds.h, 12)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#e2a44b'
  round(window.bounds.x, window.bounds.y, window.bounds.w, 28, 12)
  ctx.fill()
  ctx.fillStyle = '#3e2c20'
  ctx.font = '14px Avenir Next, sans-serif'
  ctx.fillText(window.app, window.bounds.x + 12, window.bounds.y + 18)
}

function round(x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

let last = performance.now()
function frameTick(now: number): void {
  const dt = Math.min(1, (now - last) / 1000)
  last = now
  if (source === 'live') {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#d7ccc2'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (liveWorld) {
      ctx.save()
      const detected = liveWorld.world.objects.filter(object => object.type === 'display').map(object => ({ id: object.id, bounds: object.bounds, workArea: object.bounds, scaleFactor: 1 }))
      fitWorld(detected)
      for (const object of liveWorld.world.objects.filter(item => ['window', 'popover'].includes(item.type))) {
        ctx.fillStyle = '#fffaf3'; ctx.fillRect(object.bounds.x, object.bounds.y, object.bounds.w, object.bounds.h)
      }
      if (checked('world')) drawWorld(liveWorld.world, liveWorld.movement)
      const pet = liveWorld.world.objects.find(object => object.type === 'pet')
      drawPuppy(ctx, liveWorld.pose, liveWorld.movement.x, liveWorld.movement.y, (pet?.bounds.w ?? 120) / 120, now / 1000)
      ctx.restore()
      describeWorld(liveWorld.world, now, liveWorld)
      diag.textContent = `Live · ${liveWorld.action} · ${liveWorld.reason}`
    } else document.querySelector('#world-summary')!.textContent = 'Waiting for a live snapshot. Enable Desktop awareness for measured window geometry.'
    requestAnimationFrame(frameTick)
    return
  }
  if (scenario && now - scenarioPolled >= 100) {
    scenarioPolled = now
    const scene = worldScenario(scenario, now / 1000 - scenarioStarted)
    const observed = observeWindows(windows, scene.windows, now / 1000)
    inbox.push(...diffWindows(windows, observed, 'sim'))
    inbox = inbox.slice(-32)
    windows = observed; displays = scene.displays; sceneFullscreen = scene.fullscreen; sceneAccessibility = scene.accessibility
  }
  frames += 1
  if (now - fpsTick > 500) {
    fps = Math.round((frames * 1000) / (now - fpsTick))
    frames = 0
    fpsTick = now
  }
  const floor = resolveFloor({ x: movement.x, y: movement.y, displays, multiMonitor: true })
  let clipName = previewId
  if (mode === 'behaviour') {
    const output = behaviour.update({
      dt, now: now / 1000, x: movement.x, y: movement.y, floorY: floor.floorY, minX: floor.minX, maxX: floor.maxX,
      cursor, windows, displays, focusedApp: windows.find((item) => item.focused)?.app ?? null, idleSeconds: 0,
      surfaceId: movement.surfaceId, airborne: movement.airborne || movement.motion === 'climb',
      typing: simulatedTyping ? { ...simulatedTyping, duration: now / 1000 - typingStarted } : null, windowInteractionFrequency: 'high',
      dragging: false, mode: sceneFullscreen ? 'focus' : simMode, paused, events: inbox.splice(0, 8), affinity: { 'Visual Studio Code': 3 },
      supportLost: movement.justRecovered || Boolean(movement.surfaceId && !windows.some(window => window.id === movement.surfaceId)), arrived: movement.arrived, allowIntro: false, followWindows: true, windowClimbing: true,
      followCursor: true, memoryEnabled: true,
    })
    const performanceState = {
      posture: output.posture, gait: output.gait, emote: output.emote, facing: movement.facing,
      motion: movement.motion, force: output.force, token: output.token,
      airborne: movement.airborne, justLanded: movement.justLanded,
    }
    movement.update(paused ? 0 : dt * speed, {
      kind: director.prepareMovement(performanceState),
      targetX: output.targetX ?? undefined,
      targetY: output.targetY ?? floor.floorY,
      surfaceId: output.surfaceId,
    }, { floorY: floor.floorY, minX: floor.minX, maxX: floor.maxX, windows, displays })
    clipName = director.sync({
      ...performanceState, facing: movement.facing,
      motion: movement.motion, force: output.force, token: output.token, airborne: movement.airborne, justLanded: movement.justLanded,
    })
    lastLook = output.look
    lastHeadLook = output.headLook
    lastWorld = behaviour.worldView
    if (output.debug.event && output.token !== loggedToken) {
      loggedToken = output.token
      const tag = output.debug.source === 'sim' ? 'SIM' : (output.debug.source ?? 'live')
      note(`${tag} ${output.debug.event} → ${output.action} (${output.reason}) mood ${output.mood} @ ${output.debug.target ? `${Math.round(output.debug.target.x)},${Math.round(output.debug.target.y)}` : '—'} state ${output.debug.state}${output.debug.note ? ` · ${output.debug.note}` : ''}`)
    }
  } else if (!paused) {
    movement.phase = (movement.phase + dt * speed) % 1
  }
  const animated = engine.update(paused ? 0 : dt, {
    phase: movement.phase,
    time: now / 1000,
    look: mode === 'behaviour' ? lastLook : null,
    headLook: mode === 'behaviour' ? lastHeadLook : null,
    balance: -movement.supportMotion.x / 35,
    mood, applyMood: true, autoBlink: mode === 'behaviour',
  })
  if (cycling) {
    cycleSafe = cycleSafe && finitePose(animated.pose)
    const completed = animated.completedIds.includes(previewId)
    const timedOut = animated.time - cycleStarted > (clips[cycleIndex]?.duration ?? 0) + 15
    if (completed || timedOut || !cycleSafe) {
      const passed = completed && cycleSafe && !timedOut
      cycleResults.set(previewId, passed ? 'played' : 'failed')
      note(`${passed ? 'Playback passed' : 'Playback failed'}: ${previewId}`)
      cycleIndex += 1
      playCycle()
      renderList()
    }
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = frame.style.background || '#d7ccc2'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.save()
  fitWorld(displays)
  for (const window of windows) drawWindow(window)
  if ((document.querySelector('#world') as HTMLInputElement | null)?.checked) drawWorld(lastWorld)
  ctx.strokeStyle = 'rgba(80,50,20,0.25)'
  ctx.beginPath()
  ctx.moveTo(floor.minX, floor.floorY)
  ctx.lineTo(floor.maxX, floor.floorY)
  ctx.stroke()
  let renderedPose = animated.pose
  if (mode === 'clip' && previewFacing !== 'animation') {
    const yaw = { left: -1, front: 0, right: 1 }[previewFacing]
    renderedPose = { ...animated.pose, yaw }
  }
  drawPuppy(ctx, renderedPose, movement.x, movement.y, 1.15, animated.time, animated.tailPhase)
  ctx.fillStyle = '#3e2c20'
  ctx.beginPath()
  ctx.arc(cursor.x, cursor.y, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  describeWorld(lastWorld, now)
  const debug = animated.debug
  diag.textContent = `${mode} · ${clipName} · facing ${mode === 'clip' ? previewFacing : 'behaviour'} · body ${debug.body} · fps ${fps} · layers ${debug.clips.map((clip) => `${clip.id}:${clip.weight.toFixed(2)}`).join(', ') || 'none'}${debug.transitioning ? ' · blending' : ''}`
  requestAnimationFrame(frameTick)
}

renderList()
note('Playground ready. Simulated events stay in this window.')
requestAnimationFrame(frameTick)

const api = {
  setClip(id: string) {
    stopCycle()
    mode = 'clip'
    previewId = id
    engine.play(id, { force: true, once: false })
    renderList()
  },
  scenario: loadScenario,
  list: () => clips.map((clip) => clip.id),
  inspect: () => ({
    mode, paused, previewId, previewFacing, cycling, cycleIndex,
    world: lastWorld, movement: { x: movement.x, y: movement.y, surfaceId: movement.surfaceId, airborne: movement.airborne, motion: movement.motion }, scenario, source, simMode,
    results: Object.fromEntries(cycleResults),
    ...engine.update(0),
  }),
}
Object.assign(window, { __pip: api })

// Use the pet's learned transition settings without recording simulated behaviour.
if (window.pip) {
  let learningAllowed = true
  let durations: Record<string, number> = {}
  const applyCalibration = () => engine.setTransitionDurations(learningAllowed ? durations : {})
  void window.pip.getBoot().then((boot) => {
    learningAllowed = boot.settings.memoryEnabled && boot.settings.learningEnabled
    durations = boot.state.animationReport?.durations ?? {}
    applyCalibration()
  })
  window.pip.onMemory((memory) => {
    durations = memory.animationReport?.durations ?? {}
    applyCalibration()
  })
  window.pip.onCommand((command) => {
    if (!command.settings) return
    learningAllowed = command.settings.memoryEnabled && command.settings.learningEnabled
    applyCalibration()
  })
}

if (window.pip) {
  const showBrain = (snapshot: import('../../core/assistant/types').BrainSnapshot) => {
    const current = snapshot.conversations.find(c => c.id === snapshot.currentConversationId)
    const debug = document.querySelector('#brain-debug')!
    debug.textContent = JSON.stringify({
      simulation: snapshot.simulated, connection: snapshot.connection, brain: snapshot.state,
      project: snapshot.projects.find(p => p.id === snapshot.selectedProjectId)?.name ?? 'unknown',
      confidence: snapshot.confidence, conversation: current?.id, thread: current?.threadId,
      capabilities: snapshot.capabilities, pendingApproval: snapshot.approval,
      tasks: snapshot.tasks.slice(-4), events: snapshot.events.slice(-6), suggestions: snapshot.suggestions.slice(-4),
      animation: snapshot.animation,
    }, null, 2)
    if (!cycling) {
      mode = 'clip'
      previewId = snapshot.animation
      engine.play(snapshot.animation, { force: true })
      renderList()
    }
  }
  for (const kind of ['Project detected', 'Project ambiguous', 'Test failed', 'Codex running', 'Codex completed', 'Codex failed', 'Approval requested', 'Approval granted', 'Approval rejected', 'Connection lost', 'Connection restored']) {
    const button = document.createElement('button')
    button.textContent = kind
    button.onclick = () => { stopCycle(); void window.pip.simulateBrain(kind).then(showBrain) }
    document.querySelector('#brain-events')!.append(button)
  }
  window.pip.onDebugBrain(showBrain)
  document.querySelector('#open-brain')!.addEventListener('click', () => void window.pip.brainCommand({ type: 'open' }))
}
