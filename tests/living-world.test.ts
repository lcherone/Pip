import { describe, expect, it } from 'vitest'
import { AttentionController } from '../src/core/attention'
import { observeWindows, diffWindows, resolveFloor, type DesktopWindow } from '../src/core/desktop'
import { MovementController } from '../src/core/movement'
import { BehaviourEngine, type BehaviourInput } from '../src/core/behaviour'
import { PerformanceDirector } from '../src/core/director'
import { AnimationEngine } from '../src/core/animation/engine'
import { emptyEnvironment, readWorld, navigationGraph, rememberRest, restingLocations, hydrateEnvironment, routeToWindow, type WorldInput } from '../src/core/world'
import { WORLD_SCENARIOS, worldScenario } from '../src/core/scenarios'

const display = { id: 'main', bounds: { x: 0, y: 0, w: 1200, h: 900 }, workArea: { x: 0, y: 36, w: 1200, h: 820 }, scaleFactor: 2 }
const window: DesktopWindow = { id: 'editor', app: 'Editor', displayId: 'main', focused: true, onScreen: true, bounds: { x: 200, y: 350, w: 500, h: 450 }, changedAt: 0 }
function world(overrides: Partial<WorldInput> = {}): WorldInput {
  return { now: 20, x: 120, y: 848, floorY: 848, minX: 40, maxX: 1160, windows: [window], displays: [display], focusedApp: 'Editor', events: [],
    memory: emptyEnvironment(), traits: { curiosity: 0.8, confidence: 0.8, energy: 0.9, playfulness: 0.4, sleepiness: 0.1 }, mode: 'chill', climbing: true, surfaceId: null, minimumPerchY: 168, ...overrides }
}
function input(overrides: Partial<BehaviourInput> = {}): BehaviourInput {
  return { dt: 1 / 30, now: 20, x: 120, y: 848, floorY: 848, minX: 40, maxX: 1160, windows: [window], displays: [display], cursor: null,
    focusedApp: 'Editor', idleSeconds: 0, dragging: false, mode: 'chill', paused: false, events: [], affinity: {}, supportLost: false, arrived: true,
    allowIntro: false, followWindows: true, windowClimbing: true, followCursor: false, memoryEnabled: false, ...overrides }
}

describe('living desktop observations and navigation', () => {
  it('rejects invalid and duplicate geometry, tracks measured changes and bounded velocity', () => {
    const first = observeWindows([], [window, window, { ...window, id: 'bad', bounds: { ...window.bounds, w: NaN } }], 10)
    expect(first).toHaveLength(1)
    const next = observeWindows(first, [{ ...window, bounds: { ...window.bounds, x: 230 } }], 11)
    expect(next[0]).toMatchObject({ firstSeen: 10, observedAt: 11, changedAt: 11, velocity: { x: 30, y: 0 } })
    const still = observeWindows(next, next, 12)
    expect(still[0]?.changedAt).toBe(11)
    expect(still[0]?.velocity?.x).toBe(0)
    expect(diffWindows(first, next).map(event => event.type)).toContain('window_moved')
  })

  it('distinguishes focus and coverage, and keeps popovers off navigable surfaces', () => {
    const front = { ...window, id: 'front', bounds: { x: 100, y: 200, w: 700, h: 500 } }
    const back = { ...window, focused: false }
    const events = diffWindows([window], [front, back]).map(event => event.type)
    expect(events).toContain('window_covered')
    expect(events).toContain('window_unfocused')
    const model = readWorld(world({ windows: [front, back, { ...window, id: 'popup', kind: 'popover', layer: 10 }] }))
    expect(model.surfaces.find(surface => surface.id === 'editor')?.occluded).toBe(true)
    expect(model.surfaces.some(surface => surface.id === 'popup')).toBe(false)
    expect(model.objects.find(object => object.id === 'popup')).toMatchObject({ type: 'popover', navigable: false, provenance: 'inferred' })
    expect(model.objects.some(object => object.type === 'intersection')).toBe(true)
    expect(model.objects.find(object => object.type === 'menu_bar')?.provenance).toBe('inferred')
  })

  it('describes routes with risk and recovery, and rejects unsafe ascent while retaining descent', () => {
    const graph = navigationGraph(world())
    expect(graph.edges.some(edge => edge.kind === 'climb' && edge.animation === 'climb_window')).toBe(true)
    expect(graph.edges.every(edge => Number.isFinite(edge.cost) && Number.isFinite(edge.recovery.y) && edge.risk >= 0)).toBe(true)
    const tired = world({ traits: { ...world().traits, energy: 0.1 }, surfaceId: window.id, x: 450, y: 352 })
    expect(navigationGraph(tired).edges.some(edge => edge.kind === 'climb')).toBe(false)
    expect(navigationGraph(tired).edges.some(edge => edge.kind === 'jump_down')).toBe(true)
    expect(routeToWindow(world({ minimumPerchY: 500 }), window).every(step => step.surfaceId === null)).toBe(true)
  })

  it('connects adjacent scaled displays but never walks to a vertically disconnected display', () => {
    const left = { ...display, id: 'left', bounds: { ...display.bounds, x: -1200 }, workArea: { ...display.workArea, x: -1200 }, scaleFactor: 1 }
    const target = { ...window, displayId: 'left', bounds: { ...window.bounds, x: -900 } }
    const route = routeToWindow(world({ windows: [target], displays: [left, display], minX: -1160 }), target)
    expect(route.length).toBeGreaterThan(0)
    const above = { ...left, bounds: { ...left.bounds, y: -900 }, workArea: { ...left.workArea, y: -864 } }
    expect(routeToWindow(world({ windows: [target], displays: [above, display], minX: -1160 }), target)).toEqual([])
    expect(resolveFloor({ displays: [above, display], x: -500, y: -500, multiMonitor: true }).floorY).toBeLessThan(0)
  })
})

describe('surface physics and recovery', () => {
  const physics = { floorY: 848, minX: 40, maxX: 1160, windows: [window], displays: [display] }
  it('rides horizontal and vertical support movement without losing relative position', () => {
    const move = new MovementController(); move.reset(450, 352, window.id)
    move.update(1 / 60, { kind: 'idle' }, physics)
    const moved = { ...window, bounds: { ...window.bounds, x: 300, y: 300 } }
    move.update(1 / 60, { kind: 'idle' }, { ...physics, windows: [moved] })
    expect(move.x).toBe(550); expect(move.y).toBe(302)
    expect(move.supportMotion).toEqual({ x: 100, y: -50 })
    expect(move.surfaceId).toBe(window.id)
  })
  it.each(['close', 'cover', 'resize'] as const)('recovers from a %s beneath Pip and lands visibly', kind => {
    const move = new MovementController(); move.reset(650, 352, window.id)
    move.update(1 / 60, { kind: 'idle' }, physics)
    const windows = kind === 'close' ? [] : kind === 'resize' ? [{ ...window, bounds: { ...window.bounds, w: 100 } }] : [{ ...window, id: 'cover', bounds: { x: 100, y: 300, w: 800, h: 500 } }, window]
    move.update(1 / 60, { kind: 'idle' }, { ...physics, windows })
    expect(move.surfaceId).toBeNull(); expect(move.airborne).toBe(true)
    for (let i = 0; i < 180; i++) move.update(1 / 60, { kind: 'idle' }, { ...physics, windows: [] })
    expect(move.y).toBe(848); expect(move.airborne).toBe(false)
  })
  it('leaves an obstructed paw position even when the platform centre remains visible', () => {
    const move = new MovementController(); move.reset(650, 352, window.id)
    move.update(1 / 60, { kind: 'idle' }, physics)
    const cover = { ...window, id: 'small-front', bounds: { x: 600, y: 300, w: 200, h: 200 } }
    move.update(1 / 60, { kind: 'idle' }, { ...physics, windows: [cover, window] })
    expect(move.surfaceId).toBeNull(); expect(move.airborne).toBe(true)
    const graph = navigationGraph(world({ windows: [cover, window] }))
    expect(graph.nodes.some(node => node.id === 'top:editor:right')).toBe(false)
  })
  it('crosses nearby platforms with a crouch and airborne arc', () => {
    const move = new MovementController(); move.reset(660, 352, window.id)
    const target = { ...window, id: 'next', bounds: { x: 720, y: 350, w: 300, h: 400 } }
    const model = world({ x: 660, y: 352, surfaceId: window.id, windows: [window, target] })
    expect(navigationGraph(model).edges.some(edge => edge.kind === 'cross_surface')).toBe(true)
    const intent = { kind: 'jump' as const, targetX: 760, targetY: 352, surfaceId: target.id }
    let flew = false
    for (let i = 0; i < 100 && move.surfaceId !== target.id; i++) {
      move.update(1 / 60, intent, { ...physics, windows: [window, target] })
      flew ||= move.airborne
    }
    expect(flew).toBe(true); expect(move.surfaceId).toBe(target.id)
  })
  it('relocates visibly when the supporting display disconnects', () => {
    const move = new MovementController(); move.reset(-900, 352, window.id)
    move.update(1 / 60, { kind: 'idle' }, { ...physics, windows: [] })
    expect(move.justRecovered).toBe(true); expect(move.x).toBeGreaterThanOrEqual(80)
    expect(move.y).toBe(848); expect(move.surfaceId).toBeNull()
  })
  it('crouches before takeoff and lands a real jump on the destination', () => {
    const move = new MovementController(); move.reset(450, 848)
    const low = { ...window, bounds: { ...window.bounds, y: 710 } }
    const intent = { kind: 'jump' as const, targetX: 450, targetY: 712, surfaceId: low.id }
    move.update(0.1, intent, { ...physics, windows: [low] })
    expect(move.motion).toBe('crouch'); expect(move.y).toBe(848); expect(move.airborne).toBe(false)
    move.update(0.05, intent, { ...physics, windows: [low] })
    expect(move.airborne).toBe(true); expect(move.y).toBeLessThan(848)
    for (let i = 0; i < 90 && !move.surfaceId; i++) move.update(1 / 60, intent, { ...physics, windows: [low] })
    expect(move.surfaceId).toBe(low.id); expect(move.y).toBe(712)
  })
})

describe('intentions, attention and habits', () => {
  it('leads with eyes, then head and body, and resists small competing targets', () => {
    const attention = new AttentionController()
    const target = { id: 'editor', x: 500, y: 200, score: 1, label: 'Editor', body: true }
    expect(attention.update(10, [target])).toMatchObject({ eyes: target, head: null, bodyX: null })
    expect(attention.update(10.2, [target]).state.phase).toBe('head')
    expect(attention.update(10.6, [target]).bodyX).toBe(500)
    const other = { ...target, id: 'other', score: 1.2 }
    expect(attention.update(12, [target, other]).eyes?.id).toBe('editor')
    expect(attention.update(12.1, [target, { ...other, score: 2 }]).eyes?.id).toBe('other')
    expect(attention.update(12.2, [target]).eyes?.id).toBe('editor')
  })
  it('restores habits against current application geometry without retaining window IDs', () => {
    const memory = rememberRest(emptyEnvironment(), world({ x: 450, y: 352, surfaceId: window.id }))
    expect(JSON.stringify(memory)).not.toContain('editor')
    const replacement = { ...window, id: 'new-native-id', bounds: { ...window.bounds, x: 300, w: 600 } }
    const restored = restingLocations(world({ windows: [replacement], memory: hydrateEnvironment(memory) }))
    expect(restored[0]).toMatchObject({ surfaceId: 'new-native-id', x: 600, y: 352 })
  })
  it('uses anticipation, investigation and long rest, and bounds rebuilds over five simulated minutes', () => {
    const brain = new BehaviourEngine(undefined, 2), move = new MovementController(), engine = new AnimationEngine(), director = new PerformanceDirector(engine)
    move.reset(120, 848)
    const phases = new Set<string>(), rests: number[] = []
    let maxRest = 0, resting = 0
    for (let i = 0; i < 9000; i++) {
      const out = brain.update(input({ now: 20 + i / 30, x: move.x, y: move.y, arrived: move.arrived, surfaceId: move.surfaceId, airborne: move.airborne,
        events: i === 0 ? [{ type: 'window_opened', windowId: window.id, app: window.app, bounds: window.bounds, source: 'sim' }] : [] }))
      const goal = brain.worldView?.activeGoal
      if (goal) phases.add(goal.phase)
      if (out.action === 'rest_surface') { resting++; rests.push(out.token) } else resting = 0
      maxRest = Math.max(maxRest, resting)
      const performance = { posture: out.posture, gait: out.gait, emote: out.emote, facing: move.facing, motion: move.motion, airborne: move.airborne, justLanded: move.justLanded, token: out.token, force: out.force }
      move.update(1 / 30, { kind: director.prepareMovement(performance), targetX: out.targetX ?? undefined, targetY: out.targetY ?? undefined, surfaceId: out.surfaceId }, { floorY: 848, minX: 40, maxX: 1160, windows: [window], displays: [display] })
      director.sync({ ...performance, motion: move.motion, airborne: move.airborne, justLanded: move.justLanded })
      engine.update(1 / 30, { phase: move.phase, time: i / 30, airborne: move.airborne })
      expect(Number.isFinite(move.y)).toBe(true)
    }
    for (const phase of ['anticipate', 'approach', 'interact', 'settle', 'rest']) expect(phases.has(phase), phase).toBe(true)
    expect(maxRest / 30).toBeGreaterThan(30)
    expect(new Set(rests).size).toBeGreaterThan(2)
    expect(brain.worldView?.builds).toBeLessThan(700)
    const held = brain.update(input({ now: 321, dragging: true }))
    expect(held.action).toBe('held'); expect(brain.worldView?.activeGoal?.status).not.toBe('active')
    brain.resetEnvironment(); expect(brain.places).toEqual(emptyEnvironment())
  })
  it('keeps focus calm and cancels exploration when focus starts', () => {
    const brain = new BehaviourEngine(undefined, 2)
    brain.update(input({ events: [{ type: 'window_opened', windowId: window.id, app: window.app, bounds: window.bounds, source: 'sim' }] }))
    const focus = brain.update(input({ now: 21, mode: 'focus' }))
    expect(focus.gait).toBe('none'); expect(brain.worldView?.activeGoal?.status).not.toBe('active')
  })
  it.each(WORLD_SCENARIOS)('builds a repeatable valid %s scenario using the production world model', name => {
    const scene = worldScenario(name, 10)
    expect(scene).toEqual(worldScenario(name, 10))
    const model = readWorld(world({ displays: scene.displays, windows: scene.windows, x: scene.start.x, y: scene.start.y, minX: -1160, surfaceId: scene.start.surfaceId }))
    expect(model.objects.every(object => Object.values(object.bounds).every(Number.isFinite))).toBe(true)
    if (name === 'Closing support') expect(scene.windows).toEqual([])
    if (name === 'No accessibility') expect(scene.accessibility).toBe(false)
  })
})
