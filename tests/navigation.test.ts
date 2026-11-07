import { describe, expect, it } from 'vitest'
import { AnimationEngine } from '../src/core/animation/engine'
import { BehaviourEngine, type BehaviourInput } from '../src/core/behaviour'
import { PerformanceDirector } from '../src/core/director'
import { MovementController } from '../src/core/movement'
import { heldPosition, petAnchor } from '../src/core/pet-layout'
import type { DesktopWindow } from '../src/core/desktop'

const windowA: DesktopWindow = {
  id: 'editor', app: 'Editor', bounds: { x: 200, y: 180, w: 500, h: 500 },
  onScreen: true, focused: true, displayId: 'main',
}
const world = { floorY: 800, minX: 50, maxX: 1100, windows: [windowA] }
function input(movement: MovementController, partial: Partial<BehaviourInput>): BehaviourInput {
  return {
    dt: 1 / 60, now: 20, x: movement.x, y: movement.y, floorY: world.floorY,
    minX: world.minX, maxX: world.maxX, cursor: null, windows: world.windows,
    focusedApp: 'Editor', idleSeconds: 0, dragging: false, mode: 'chill', paused: false,
    events: [], affinity: {}, supportLost: false, arrived: movement.arrived,
    allowIntro: false, followWindows: true, windowClimbing: true, followCursor: false,
    memoryEnabled: false, ...partial,
  }
}

describe('desktop navigation', () => {
  it.each([180, 650])('walks to a window at y=%s, climbs or jumps, and perches only after reaching its top', top => {
    const window = { ...windowA, bounds: { ...windowA.bounds, y: top } }
    const movement = new MovementController()
    movement.place(120, 800)
    const behaviour = new BehaviourEngine(undefined, 2)
    const engine = new AnimationEngine()
    const director = new PerformanceDirector(engine)
    let reached = false
    let sawVerticalMotion = false
    for (let i = 0; i < 1000; i++) {
      const output = behaviour.update(input(movement, {
        now: 20 + i / 60, windows: [window],
        events: i === 0 ? [{ type: 'window_opened', windowId: window.id, app: window.app, bounds: window.bounds, source: 'sim' }] : [],
      }))
      const performance = {
        posture: output.posture, gait: output.gait, emote: output.emote, facing: movement.facing,
        motion: movement.motion, airborne: movement.airborne, justLanded: movement.justLanded,
        force: output.force, token: output.token,
      }
      const kind = director.prepareMovement(performance)
      const previousY = movement.y
      movement.update(1 / 60, { kind, targetX: output.targetX ?? undefined, targetY: output.targetY ?? undefined, surfaceId: output.surfaceId }, { ...world, windows: [window] })
      expect(Math.abs(movement.y - previousY)).toBeLessThan(16)
      director.sync({ ...performance, motion: movement.motion, airborne: movement.airborne, justLanded: movement.justLanded })
      engine.update(1 / 60, { phase: movement.phase, time: i / 60, airborne: movement.airborne })
      sawVerticalMotion ||= movement.motion === 'climb' || movement.airborne
      if (movement.surfaceId === window.id && movement.arrived && Math.abs(movement.x - (output.targetX ?? movement.x)) < 20) {
        expect(movement.y).toBe(top + 2)
        const perched = behaviour.update(input(movement, { now: 20 + (i + 1) / 60, windows: [window] }))
        expect(perched.posture).toBe('ledge')
        expect(perched.gait).toBe('none')
        expect(perched.emote).toBe('look_over_edge')
        reached = true
        break
      }
    }
    expect(sawVerticalMotion).toBe(true)
    expect(reached).toBe(true)
  })

  it('keeps held feet at the pointer height and releases onto a crossed window top', () => {
    const movement = new MovementController()
    movement.place(450, 100)
    movement.update(0.5, { kind: 'held' }, world)
    expect(movement.y).toBe(100)
    movement.releaseToGravity(800)
    for (let i = 0; i < 120 && !movement.surfaceId; i++) movement.update(1 / 60, { kind: 'idle' }, world)
    expect(movement.surfaceId).toBe(windowA.id)
    expect(movement.y).toBe(182)
    movement.place(450, 185)
    movement.releaseToGravity(800, [windowA])
    expect(movement.surfaceId).toBe(windowA.id)
    movement.update(0.1, { kind: 'idle' }, { ...world, windows: [] })
    expect(movement.airborne).toBe(true)
    expect(movement.y).toBeGreaterThan(182)
  })

  it('approaches a window without hiding Pip above the menu bar when there is no perching headroom', () => {
    const movement = new MovementController()
    movement.place(120, 800)
    const window = { ...windowA, bounds: { ...windowA.bounds, y: 38 } }
    const brain = new BehaviourEngine(undefined, 2)
    const noticing = brain.update(input(movement, {
      minimumPerchY: 168, windows: [window],
      events: [{ type: 'window_opened', windowId: window.id, app: window.app, bounds: window.bounds, source: 'sim' }],
    }))
    expect(noticing.gait).toBe('none')
    const output = brain.update(input(movement, { now: 21, minimumPerchY: 168, windows: [window] }))
    expect(output.surfaceId).toBeNull()
    expect(output.gait).toBe('walk')
    expect(output.targetY).toBe(800)
  })

  it('falls from its current position if a window disappears during a climb', () => {
    const movement = new MovementController()
    movement.place(450, 800)
    const intent = { kind: 'climb' as const, targetX: 450, targetY: 182, surfaceId: windowA.id }
    movement.update(0.5, intent, world)
    expect(movement.motion).toBe('climb')
    const height = movement.y
    movement.update(1 / 60, intent, { ...world, windows: [] })
    expect(movement.airborne).toBe(true)
    expect(movement.y).toBeGreaterThan(height)
    expect(movement.y - height).toBeLessThan(2)
  })

  it('does not teleport onto a ledge above the apex of a jump', () => {
    const movement = new MovementController()
    movement.place(450, 800)
    let highest = 800
    for (let i = 0; i < 50; i++) {
      movement.update(1 / 60, { kind: 'jump', targetX: 450, targetY: 182, surfaceId: windowA.id }, world)
      highest = Math.min(highest, movement.y)
      expect(movement.surfaceId).toBeNull()
    }
    expect(highest).toBeGreaterThan(600)
  })

  it('keeps a held puppy visible at screen edges and supports a display above the primary', () => {
    const displays = [
      { id: 'main', bounds: { x: 0, y: 0, w: 1200, h: 900 }, workArea: { x: 0, y: 38, w: 1200, h: 830 }, scaleFactor: 2 },
      { id: 'above', bounds: { x: 0, y: -900, w: 1200, h: 900 }, workArea: { x: 0, y: -900, w: 1200, h: 900 }, scaleFactor: 1 },
    ]
    expect(heldPosition({ x: 5, y: 10 }, displays, 1)).toEqual({ x: 80, y: 168 })
    expect(heldPosition({ x: 500, y: -600 }, displays, 1)).toEqual({ x: 500, y: -600 })
    const anchor = petAnchor({ x: 500, y: -600 }, displays, 1)
    expect(-600 - anchor.y).toBe(-900)
  })

  it.each([0.7, 1, 1.6])('moves canvas padding rather than clamping Pip below the menu bar at scale %s', scale => {
    const displays = [{ id: 'main', bounds: { x: 0, y: 0, w: 1200, h: 900 }, workArea: { x: 0, y: 38, w: 1200, h: 830 }, scaleFactor: 2 }]
    for (const y of [100, 180, 500, 800]) {
      const anchor = petAnchor({ x: 450, y }, displays, scale)
      const nativeTop = Math.max(38, y - anchor.y)
      expect(nativeTop + anchor.y).toBe(y)
    }
  })
})
