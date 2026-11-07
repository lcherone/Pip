import { describe, expect, it } from 'vitest'
import { listClips, LIE_STYLES, SIT_STYLES, SLEEP_STYLES } from '../src/core/animation/clips'
import { AnimationEngine } from '../src/core/animation/engine'
import { BehaviourEngine, introAt, type BehaviourInput } from '../src/core/behaviour'
import { summarizeApproval, CodexSession, type CodexTransport } from '../src/core/codex'
import { calibrateDisplays, cocoaRectToTopLeft, deriveIdleEdges, diffWindows, filterWindows, ledgeTarget, resolveFloor, type DesktopWindow } from '../src/core/desktop'
import { transitionPath } from '../src/core/animation/clips'
import { clearMemory, freshState, hydrate } from '../src/core/memory'
import { MovementController } from '../src/core/movement'
import { buildPrompt, consumeStream, localPuppyReply, parsePuppyReply } from '../src/core/reply'
import { effectivePersonality, sanitizeSettings } from '../src/core/settings'
import { finitePose, poseFrom } from '../src/core/pose'

function input(partial: Partial<BehaviourInput> = {}): BehaviourInput {
  return {
    dt: 0.2,
    now: 1,
    x: 120,
    y: 500,
    floorY: 500,
    minX: 20,
    maxX: 900,
    cursor: null,
    windows: [],
    focusedApp: null,
    idleSeconds: 0,
    dragging: false,
    mode: 'chill',
    paused: false,
    events: [],
    affinity: {},
    supportLost: false,
    arrived: false,
    allowIntro: false,
    followWindows: true,
    windowClimbing: true,
    followCursor: true,
    memoryEnabled: true,
    ...partial,
  }
}

const windowA: DesktopWindow = {
  id: 'w1',
  app: 'Visual Studio Code',
  bundleId: 'com.microsoft.VSCode',
  displayId: 'd',
  bounds: { x: 200, y: 340, w: 420, h: 140 },
  focused: true,
  onScreen: true,
}

describe('animation catalogue', () => {
  it('registers at least 50 distinct clips with metadata', () => {
    const clips = listClips()
    expect(clips.length).toBeGreaterThanOrEqual(50)
    expect(new Set(clips.map((clip) => clip.id)).size).toBe(clips.length)
    for (const clip of clips) {
      expect(clip.duration).toBeGreaterThan(0)
      expect(clip.priority).toBeGreaterThan(0)
      expect(clip.interruptibility).toBeGreaterThanOrEqual(0)
      expect(clip.playback.speed).toBeGreaterThan(0)
      const pose = clip.blend === 'base'
        ? clip.sample(0.5, { phase: 0.3, time: 0.5 })
        : { ...poseFrom({ sit: 1 }), ...clip.sample(0.5, { phase: 0.3, time: 0.5 }) }
      expect(finitePose(poseFrom(pose))).toBe(true)
    }
    const prints = clips.map((clip) => JSON.stringify(clip.sample(0.45, { phase: 0.37, time: 1.2 })))
    expect(new Set(prints).size).toBe(clips.length)
  })

  it('bridges into a clip and keeps poses finite', () => {
    const engine = new AnimationEngine()
    engine.play('sleep_breathe', { once: true })
    let completed = ''
    for (let i = 0; i < 400 && completed !== 'sleep_breathe'; i++) {
      const frame = engine.update(0.05, { phase: 0, time: i * 0.05 })
      expect(finitePose(frame.pose)).toBe(true)
      if (frame.completed) completed = frame.completed
    }
    expect(completed).toBe('sleep_breathe')
    expect(engine.bodyState).toBe('sleeping')
  })

  it('does not let an ordinary bark interrupt sleep, but a forced wake does', () => {
    const engine = new AnimationEngine()
    engine.reset('sleeping')
    engine.play('bark')
    const before = engine.update(0.05, { phase: 0, time: 0 }).debug.clips.map((clip) => clip.id)
    expect(before).toContain('sleep_breathe')
    expect(before).not.toContain('bark')
    engine.play('wake', { force: true })
    const after = engine.update(0.05, { phase: 0, time: 1 }).debug
    expect(after.clips.some((clip) => clip.id === 'wake' || clip.id === 'lie_to_sit')).toBe(true)
    expect(after.transitioning || after.clips[0]?.id === 'wake').toBe(true)
  })

  it('has a path between every body state used by the catalogue', () => {
    expect(transitionPath('sitting', 'sleeping')).toEqual(['sit_to_lie', 'fall_asleep'])
    expect(transitionPath('ledge', 'standing')).toEqual(['jump_down'])
  })
})

describe('behaviour', () => {
  it('walks and sits during the intro', () => {
    const engine = new BehaviourEngine(undefined, 2)
    let sawWalk = false
    let sawSit = false
    let now = 0
    for (let i = 0; i < 240; i++) {
      now += 0.05
      const output = engine.update(input({ dt: 0.05, now, allowIntro: true, mode: 'chill' }))
      if (output.action === 'intro_walk' && output.gait === 'walk') sawWalk = true
      if (output.action === 'intro_rest' && output.posture === 'sitting') sawSit = true
    }
    expect(sawWalk).toBe(true)
    expect(sawSit).toBe(true)
    expect(introAt(14, 0, 0, 100)).toBeNull()
  })

  it('sleeps through cursor movement and wakes on a click', () => {
    const engine = new BehaviourEngine(undefined, 2)
    const asleep = engine.update(input({ mode: 'sleep', now: 5 }))
    expect(asleep.action).toBe('sleep')
    const ignored = engine.update(input({
      mode: 'sleep',
      now: 6,
      cursor: { x: 140, y: 200, speed: 1800 },
    }))
    expect(ignored.action).toBe('sleep')
    expect(ignored.posture).toBe('sleeping')
    const awake = engine.update(input({ mode: 'chill', now: 7, events: [{ type: 'clicked', source: 'user' }] }))
    expect(awake.action).toBe('wake')
  })

  it('cycles dream animations while he stays asleep', () => {
    const engine = new BehaviourEngine(undefined, 2)
    engine.update(input({ mode: 'sleep', now: 1, dt: 0.2 }))
    const seen = new Set<string | null>()
    for (let i = 0; i < 45; i++) {
      const dream = engine.update(input({ mode: 'sleep', now: 2 + i, dt: 1 }))
      expect(dream.posture).toBe('sleeping')
      seen.add(dream.emote)
    }
    expect(seen.has('snore')).toBe(true)
    expect(seen.has('dream_run')).toBe(true)
    expect(seen.has('dream_paws')).toBe(true)
    expect(seen.size).toBe(SLEEP_STYLES.length)
  })

  it('changes sitting pose across ten styles', () => {
    expect(new Set(SIT_STYLES).size).toBe(10)
    expect(new Set(LIE_STYLES).size).toBe(10)
    expect(new Set(SLEEP_STYLES).size).toBe(10)
    const brain = new BehaviourEngine(undefined, 3)
    const sits = new Set<string | null>()
    for (let i = 0; i < 130; i++) sits.add(brain.update(input({ now: i + 1, dt: 1, force: { action: 'sit' } })).emote)
    expect(sits).toEqual(new Set(SIT_STYLES))
  })

  it('does not chase in focus mode', () => {
    const engine = new BehaviourEngine(undefined, 2)
    engine.setPersonality(effectivePersonality({
      curiosity: 0.2, playfulness: 1, energy: 1, confidence: 0.5, sociability: 1,
      attentionSeeking: 0.2, sleepiness: 0, excitability: 1, independence: 0,
    }, 'focus'))
    const output = engine.update(input({
      mode: 'focus',
      cursor: { x: 400, y: 200, speed: 2000 },
      now: 3,
    }))
    expect(output.action).not.toBe('chase')
    expect(output.gait).not.toBe('run')
  })

  it('greets a returning user and can be asked to zoom', () => {
    const greet = new BehaviourEngine(undefined, 2).update(input({
      now: 4,
      events: [{ type: 'active', source: 'sim' }],
    }))
    expect(greet.emote).toBe('greet')
    const zoom = new BehaviourEngine(undefined, 2).update(input({
      now: 4,
      x: 200,
      force: { action: 'zoom' },
    }))
    expect(zoom.action).toBe('zoomies')
    expect(zoom.gait).toBe('run')
    const sniff = new BehaviourEngine(undefined, 2).update(input({
      now: 4,
      force: { action: 'emote', emote: 'sniff_ground' },
    }))
    expect(sniff.emote).toBe('sniff_ground')
    expect(sniff.posture).toBe('standing')
  })

  it('celebrates a finished task and reacts differently to a failure', () => {
    const success = new BehaviourEngine(undefined, 2).update(input({
      now: 4,
      events: [{ type: 'codex_completed', source: 'sim' }],
    }))
    const failure = new BehaviourEngine(undefined, 2).update(input({
      now: 4,
      events: [{ type: 'codex_failed', source: 'sim' }],
    }))
    expect(success.emote).toBe('celebrate')
    expect(failure.emote).toBe('react_failure')
    expect(success.emote).not.toBe(failure.emote)
  })

  it('watches the focused window, notices movement, and steps aside when covered', () => {
    const watching = new BehaviourEngine(undefined, 2).update(input({
      now: 4,
      x: 120,
      y: 500,
      windows: [windowA],
      focusedApp: windowA.app,
      cursor: { x: 980, y: 40, speed: 0 },
    }))
    expect(watching.look?.x ?? 0).toBeGreaterThan(150)
    expect(watching.faceX).toBeNull() // Eyes lead; the body turns only after attention settles.

    const near = new BehaviourEngine(undefined, 2).update(input({
      now: 4,
      x: 120,
      y: 500,
      windows: [windowA],
      cursor: { x: 150, y: 430, speed: 0 },
    }))
    expect(near.look?.x ?? 999).toBeLessThan(80)
    expect(near.emote).toBe('investigate_cursor')

    const moved = new BehaviourEngine(undefined, 2).update(input({
      now: 4,
      x: 120,
      y: 500,
      windows: [windowA],
      events: [{ type: 'window_moved', windowId: windowA.id, app: windowA.app, bounds: windowA.bounds, source: 'sim' }],
    }))
    expect(moved.action).toBe('notice')
    expect(moved.emote).toBe('curious')

    const covering: DesktopWindow = { ...windowA, bounds: { x: 40, y: 360, w: 200, h: 200 } }
    const dodge = new BehaviourEngine(undefined, 2).update(input({
      now: 4,
      x: 120,
      y: 500,
      windows: [covering],
      events: [{ type: 'window_resized', windowId: covering.id, app: covering.app, bounds: covering.bounds, source: 'sim' }],
    }))
    expect(dodge.action).toBe('dodge')
    expect(dodge.targetX).toBeGreaterThan(240)

    const quiet = new BehaviourEngine(undefined, 2).update(input({
      now: 4,
      events: [{ type: 'idle', idleSeconds: 120, source: 'sim' }],
    }))
    expect(quiet.emote).toBe('yawn')

    const other: DesktopWindow = { ...windowA, id: 'w2', app: 'Terminal', bounds: { x: 700, y: 360, w: 300, h: 160 }, focused: false }
    const visit = new BehaviourEngine(undefined, 2).update(input({
      now: 4,
      windows: [windowA, other],
      focusedApp: windowA.app,
      events: [{ type: 'window_opened', windowId: other.id, app: other.app, bounds: other.bounds, source: 'sim' }],
    }))
    expect(visit.action).toBe('approach')
    expect(visit.targetX).toBeGreaterThan(600)
  })

  it('uses a different reaction for fullscreen, display changes, resizes, and quiet typing', () => {
    const duck = new BehaviourEngine(undefined, 2).update(input({
      now: 4,
      events: [{ type: 'fullscreen', enabled: true, source: 'sim' }],
    }))
    expect(duck.emote).toBe('duck')
    const perk = new BehaviourEngine(undefined, 2).update(input({
      now: 4,
      events: [{ type: 'display_changed', source: 'sim' }],
    }))
    expect(perk.emote).toBe('perk')
    const resized = new BehaviourEngine(undefined, 2).update(input({
      now: 4,
      x: 120,
      y: 500,
      windows: [windowA],
      events: [{ type: 'window_resized', windowId: windowA.id, app: windowA.app, bounds: windowA.bounds, source: 'sim' }],
    }))
    expect(resized.emote).toBe('peek_up')
    const listen = new BehaviourEngine(undefined, 2).update(input({
      now: 4,
      typing: { active: true, pace: 'gentle', app: 'Notes', duration: 4 },
    }))
    expect(listen.emote).toBe('listen')
    const other: DesktopWindow = { ...windowA, id: 'other', app: 'Notes', bounds: { x: 700, y: 200, w: 300, h: 200 }, focused: false }
    const fromLedge = new BehaviourEngine(undefined, 2).update(input({
      now: 4,
      x: 300,
      y: 342,
      floorY: 500,
      surfaceId: windowA.id,
      windows: [windowA, other],
      events: [{ type: 'window_opened', windowId: other.id, app: other.app, bounds: other.bounds, source: 'sim' }],
    }))
    expect(fromLedge.emote).toBe('notice_app')
    expect(fromLedge.posture).toBe('ledge')
  })

  it('rate-limits a burst of window events', () => {
    const engine = new BehaviourEngine(undefined, 2)
    const first = engine.update(input({
      now: 10,
      windows: [windowA],
      events: [{ type: 'window_opened', windowId: 'w1', app: windowA.app, bounds: windowA.bounds, source: 'sim' }],
    }))
    expect(first.action).toBe('approach')
    const second = engine.update(input({
      now: 11,
      windows: [windowA],
      events: [{ type: 'window_opened', windowId: 'w1', app: windowA.app, bounds: windowA.bounds, source: 'sim' }],
    }))
    expect(second.debug.note).toMatch(/ignored window_opened/)
    expect(second.debug.source === 'sim' || second.debug.note?.includes('sim')).toBe(true)
  })

  it('lets a drag override autonomy and a lost surface interrupt sleep', () => {
    const engine = new BehaviourEngine(undefined, 2)
    expect(engine.update(input({ dragging: true })).posture).toBe('held')
    const sleeper = new BehaviourEngine(undefined, 2)
    sleeper.update(input({ mode: 'sleep' }))
    const dropped = sleeper.update(input({ supportLost: true, floorY: 500 }))
    expect(dropped.action).toBe('recover')
  })

  it('changes effective personality without rewriting the saved sliders', () => {
    const saved = sanitizeSettings({ personality: { curiosity: 0.4, playfulness: 0.4, energy: 0.4, confidence: 0.4, sociability: 0.4, attentionSeeking: 0.4, sleepiness: 0.4, excitability: 0.4, independence: 0.4 }, mode: 'playful' })
    const playful = effectivePersonality(saved.personality, 'playful')
    expect(saved.personality.curiosity).toBe(0.4)
    expect(playful.playfulness).toBeGreaterThan(saved.personality.playfulness)
  })
})

describe('movement and desktop', () => {
  it('accelerates within the screen instead of teleporting', () => {
    const movement = new MovementController()
    movement.place(30, 500)
    let previous = movement.x
    let maxStep = 0
    for (let i = 0; i < 180; i++) {
      movement.update(0.016, { kind: 'run', targetX: 5000 }, { floorY: 500, minX: 20, maxX: 400, windows: [] })
      maxStep = Math.max(maxStep, Math.abs(movement.x - previous))
      previous = movement.x
    }
    expect(movement.x).toBeLessThanOrEqual(400)
    expect(movement.x).toBeGreaterThan(300)
    expect(maxStep).toBeLessThan(12)
  })

  it('converts Cocoa coordinates and clamps a multi-monitor floor', () => {
    expect(cocoaRectToTopLeft({ x: 0, y: 0, w: 100, h: 40 }, 1000)).toEqual({ x: 0, y: 960, w: 100, h: 40 })
    const displays = [
      { id: 'a', bounds: { x: 0, y: 0, w: 1000, h: 800 }, workArea: { x: 0, y: 0, w: 1000, h: 800 }, scaleFactor: 2 },
      { id: 'b', bounds: { x: 1000, y: 100, w: 800, h: 700 }, workArea: { x: 1000, y: 100, w: 800, h: 700 }, scaleFactor: 2 },
    ]
    const shifted = calibrateDisplays([{ x: 10, y: 10, w: 1000, h: 800 }], [{ x: 0, y: 0, w: 1000, h: 800 }])
    expect(shifted.dx).toBe(-10)
    const floor = resolveFloor({ x: 1400, y: 100, displays, multiMonitor: true })
    expect(floor.displayId).toBe('b')
    expect(floor.x).toBeGreaterThan(1000)
    expect(floor.minX).toBeLessThan(100)
    const opened = diffWindows([], [windowA])
    expect(opened[0]?.type).toBe('window_opened')
    expect(diffWindows([windowA], [])[0]?.type).toBe('window_closed')
    expect(deriveIdleEdges(10, 120)[0]?.type).toBe('idle')
    expect(deriveIdleEdges(100, 1)[0]?.type).toBe('active')
    expect(filterWindows([windowA, { ...windowA, id: 'mail', app: 'Mail', bundleId: 'com.apple.mail' }], ['Mail'])).toHaveLength(1)
    expect(ledgeTarget(windowA, { x: 300, y: 500 })?.surfaceId).toBe('w1')
  })
})

describe('memory and replies', () => {
  it('hydrates safely and clear keeps settings', () => {
    const state = hydrate({ version: 1, settings: { scale: 9, mode: 'focus', codexEnabled: true }, affinity: { Code: 4 }, codexThreadId: 'abc', position: { x: 10, y: 20 } })
    expect(state.settings.scale).toBe(1.6)
    expect(state.settings.mode).toBe('focus')
    expect(state.codexThreadId).toBe('abc')
    const cleared = clearMemory(state)
    expect(cleared.settings.mode).toBe('focus')
    expect(cleared.codexThreadId).toBeNull()
    expect(cleared.affinity).toEqual({})
    expect(freshState().settings.codexEnabled).toBe(false)
  })

  it('streams intention markers and keeps prompts free of window contents', () => {
    expect(consumeStream('[[celebrate]]\nYes!').intention).toBe('celebrate')
    expect(consumeStream('[[celebrate]]\nYes!').visible).toBe('Yes!')
    expect(parsePuppyReply('{"say":"Hi","intention":"ask"}').intention).toBe('ask')
    expect(localPuppyReply('what are you doing?').intention).toBe('explain')
    const prompt = buildPrompt('help', 'Notes', false)
    expect(prompt).not.toContain('Notes')
    expect(buildPrompt('help', 'Notes', true)).toContain('Notes')
    expect(prompt).not.toContain('title')
  })
})

describe('codex session', () => {
  function scripted(): { transport: CodexTransport; sent: string[]; push: (value: unknown) => void; exit: (code: number | null) => void } {
    const sent: string[] = []
    let onLine: (line: string) => void = () => {}
    let onExit: (code: number | null) => void = () => {}
    const transport: CodexTransport = {
      async start() {},
      send(line: string) {
        sent.push(line)
        const message = JSON.parse(line) as { id?: number; method?: string }
        if (!message.method || message.id === undefined) return
        const result = message.method === 'initialize'
          ? { userAgent: 'test', codexHome: '/tmp', platformFamily: 'unix', platformOs: 'macos' }
          : message.method === 'getAuthStatus'
            ? { authMethod: 'chatgpt', requiresOpenaiAuth: false }
            : message.method === 'model/list'
              ? { data: [{ id: 'model-a', displayName: 'Model A' }], nextCursor: null }
              : message.method === 'thread/start'
                ? { thread: { id: 'thread-1' } }
                : message.method === 'thread/name/set'
                  ? {}
                  : message.method === 'turn/start'
                    ? { turn: { id: 'turn-1' } }
                    : {}
        onLine(JSON.stringify({ id: message.id, result }))
      },
      onLine(listener) { onLine = listener },
      onExit(listener) { onExit = listener },
      stop() {},
    }
    return { transport, sent, push: (value) => onLine(JSON.stringify(value)), exit: (code) => onExit(code) }
  }

  it('streams a reply and stays unauthenticated without a login', async () => {
    const session = new CodexSession()
    const fake = scripted()
    const replies: string[] = []
    session.on((event) => { if (event.type === 'reply') replies.push(event.reply.say) })
    await session.connect(fake.transport, { cwd: '/tmp', sandbox: 'read-only' })
    expect(session.status).toBe('ready')
    expect(session.models[0]?.id).toBe('model-a')
    expect(session.threadId).toBe('thread-1')
    await session.ask('hi', '[[chat]]\nhi')
    fake.push({ method: 'item/agentMessage/delta', params: { delta: '[[chat]]\nHello' } })
    fake.push({ method: 'turn/completed', params: { turn: { status: 'completed', error: null } } })
    expect(replies.at(-1)).toBe('Hello')
    expect(session.status).toBe('ready')
  })

  it('holds an approval until the user answers, then declines', async () => {
    const session = new CodexSession()
    const fake = scripted()
    await session.connect(fake.transport, { cwd: '/tmp', sandbox: 'read-only' })
    const before = fake.sent.length
    fake.push({
      id: 90,
      method: 'item/commandExecution/requestApproval',
      params: { command: 'rm important.txt', reason: 'cleanup', threadId: 'thread-1', turnId: 'turn-1', itemId: 'item', startedAtMs: 1, environmentId: null },
    })
    expect(session.pendingApproval?.detail).toContain('rm important.txt')
    expect(fake.sent.slice(before).some((line) => line.includes('"id":90'))).toBe(false)
    session.respondApproval(false)
    expect(fake.sent.at(-1)).toContain('decline')
    expect(session.pendingApproval).toBeNull()
    expect(summarizeApproval(1, 'applyPatchApproval', { fileChanges: { 'a.ts': {} }, reason: 'edit' }).title).toMatch(/file/i)
  })

  it('stops retrying after the reconnect budget', async () => {
    const session = new CodexSession()
    const fake = scripted()
    await session.connect(fake.transport, { cwd: '/tmp', sandbox: 'read-only' })
    fake.exit(1)
    fake.exit(1)
    fake.exit(1)
    expect(session.status).toBe('disconnected')
    fake.exit(1)
    expect(session.status).toBe('error')
    expect(session.reconnects).toBeGreaterThan(3)
  })

  it('reports auth required and a missing binary as unavailable to the caller', async () => {
    const session = new CodexSession()
    const fake = scripted()
    const original = fake.transport.send
    fake.transport.send = (line: string) => {
      const message = JSON.parse(line) as { id?: number; method?: string }
      if (message.method === 'getAuthStatus' && message.id !== undefined) {
        fake.push({ id: message.id, result: { authMethod: null, requiresOpenaiAuth: true } })
        return
      }
      original.call(fake.transport, line)
    }
    await session.connect(fake.transport, { cwd: '/tmp', sandbox: 'read-only' })
    expect(session.status).toBe('needs_auth')
    const said: string[] = []
    session.on((event) => { if (event.type === 'reply') said.push(event.reply.say) })
    await session.ask('hi', 'hi')
    expect(said[0]).toMatch(/login/i)
  })
})
