import { describe, expect, it } from 'vitest'
import { TypingObserver } from '../src/core/activity'
import { BehaviourEngine, type BehaviourInput } from '../src/core/behaviour'
import { AnimationEngine } from '../src/core/animation/engine'
import { PerformanceDirector } from '../src/core/director'
import { MovementController } from '../src/core/movement'
import { isBlockedApp, type DesktopWindow } from '../src/core/desktop'
import { localPuppyReply } from '../src/core/reply'
import { chooseWindow, emptyEnvironment, routeToWindow, type WorldInput } from '../src/core/world'

const windows: DesktopWindow[] = [
  { id: 'notes', app: 'Notes', displayId: 'main', focused: true, onScreen: true, bounds: { x: 100, y: 400, w: 300, h: 450 } },
  { id: 'editor', app: 'Editor', displayId: 'main', focused: false, onScreen: true, bounds: { x: 650, y: 450, w: 350, h: 300 } },
  { id: 'browser', app: 'Browser', displayId: 'main', focused: false, onScreen: true, bounds: { x: 1150, y: 500, w: 350, h: 250 } },
]
function input(partial: Partial<BehaviourInput> = {}): BehaviourInput {
  return { dt: 1 / 30, now: 20, x: 250, y: 820, floorY: 820, minX: 40, maxX: 1760, windows,
    focusedApp: 'Notes', cursor: null, idleSeconds: 0, dragging: false, paused: false, mode: 'playful', events: [], affinity: {},
    supportLost: false, arrived: true, allowIntro: false, followWindows: true, windowClimbing: false, followCursor: true,
    memoryEnabled: false, surfaceId: null, ...partial }
}
function world(partial: Partial<WorldInput> = {}): WorldInput {
  return { now: 20, x: 450, y: 820, floorY: 820, minX: 40, maxX: 1760, windows, displays: [],
    focusedApp: 'Notes', events: [], memory: emptyEnvironment(), traits: { curiosity: 0.9, playfulness: 0.8, sleepiness: 0, confidence: 0.8, energy: 0.9 },
    mode: 'playful', climbing: false, surfaceId: null, ...partial }
}

describe('typing observation', () => {
  it('emits one start and one pause, keeps only activity, and resets on app changes', () => {
    const observer = new TypingObserver()
    const app = { name: 'Editor', bundleId: 'dev.editor' }
    const started = observer.sample({ active: true, pace: 'busy', text: 'never retain this', keys: [12] }, app, true, 10)
    expect(started.events.map(event => event.type)).toEqual(['typing_started'])
    expect(JSON.stringify(started)).not.toMatch(/never retain|keys/)
    expect(observer.sample({ active: true, pace: 'busy' }, app, true, 15).activity?.duration).toBe(5)
    const switched = observer.sample({ active: false, pace: 'gentle' }, { name: 'Notes', bundleId: 'notes' }, true, 16)
    expect(switched.events).toEqual([])
    observer.sample({ active: true, pace: 'gentle' }, app, true, 20)
    const ended = observer.sample({ active: false, pace: 'gentle' }, app, true, 35)
    expect(ended.events).toEqual([{ type: 'typing_paused', app: 'Editor', duration: 15, source: 'os' }])
    expect(observer.sample({ active: false, pace: 'gentle' }, app, true, 36).events).toEqual([])
  })

  it('drops disabled, blocked, absent and malformed observations without a delayed reaction', () => {
    const observer = new TypingObserver()
    const app = { name: 'Editor', bundleId: 'dev.editor' }
    observer.sample({ active: true, pace: 'busy' }, app, true, 10)
    expect(observer.sample({ active: true, pace: 'busy' }, app, false, 11).activity).toBeNull()
    expect(observer.sample({ active: false, pace: 'gentle' }, app, true, 30).events).toEqual([])
    expect(observer.sample({ active: true, pace: 'busy' }, null, true, 31).activity).toBeNull()
    expect(observer.sample({ active: 'yes', pace: 'secret' }, app, true, 32).events).toEqual([])
    expect(isBlockedApp('Private Editor', 'dev.private', ['PRIVATE'])).toBe(true)
    expect(isBlockedApp('Editor', 'dev.editor', ['  DEV.EDITOR  '])).toBe(true)
  })
})

describe('Pip in his environment', () => {
  it('chooses different visible places, honours recent visits, and ignores hidden windows', () => {
    const choices = new Set([0, 0.3, 0.6, 0.99].map(n => chooseWindow(world(), () => n)?.window.id))
    expect(choices.size).toBeGreaterThan(1)
    expect(chooseWindow(world(), () => 0, new Set(['notes']))?.window.id).not.toBe('notes')
    expect(chooseWindow(world(), () => 0, new Set(windows.map(window => window.id)))).toBeNull()
    const hidden = { ...windows[0]!, id: 'hidden', onScreen: false }
    expect(chooseWindow(world({ windows: [hidden] }), () => 0)).toBeNull()
  })

  it('climbs onto a tall window instead of staying on the floor', () => {
    const tall = { ...windows[1]!, id: 'tall', bounds: { x: 180, y: 48, w: 900, h: 840 } }
    const route = routeToWindow(world({
      x: 120, y: 900, floorY: 900, minX: 20, maxX: 1400, windows: [tall], climbing: true, minimumPerchY: 46,
    }), tall)
    expect(route.some((step) => step.gait === 'climb' && step.surfaceId === 'tall')).toBe(true)
  })

  it('falls back to a ground visit when climbing is off, or when a window is too high', () => {
    const route = routeToWindow(world(), windows[1]!)
    expect(route.length).toBeGreaterThan(0)
    expect(route.every(step => step.surfaceId === null)).toBe(true)
    const high = { ...windows[1]!, bounds: { ...windows[1]!.bounds, y: 30 } }
    expect(routeToWindow(world({ windows: [high], climbing: true, minimumPerchY: 168 }), high).every(step => step.surfaceId === null)).toBe(true)
  })

  it('can leave one window and visit another, without re-landing on the edge it leaves', () => {
    const route = routeToWindow(world({ x: 250, y: 402, surfaceId: 'notes' }), windows[1]!)
    expect(route.some(step => step.gait === 'jump' && step.surfaceId === null && step.y === 820)).toBe(true)
    const movement = new MovementController()
    movement.place(250, 402)
    movement.surfaceId = 'notes'
    movement.update(1 / 30, { kind: 'jump', targetX: 250, targetY: 820 }, { floorY: 820, minX: 40, maxX: 1760, windows })
    expect(movement.surfaceId).toBeNull()
    expect(movement.airborne).toBe(true)
    expect(movement.y).toBeGreaterThan(402)
  })

  it('gives room during busy typing, then stays quiet instead of roaming or chasing', () => {
    const brain = new BehaviourEngine(undefined, 4)
    const typing = { active: true, pace: 'busy' as const, app: 'Notes', duration: 5 }
    const reaction = brain.update(input({ typing }))
    expect(reaction.action).toBe('make_room')
    expect(reaction.speech).toBeNull()
    expect(reaction.targetX).not.toBe(250)
    const quiet = brain.update(input({ now: 40, x: 44, typing: { ...typing, duration: 25 }, cursor: { x: 900, y: 500, speed: 1200 } }))
    expect(quiet.gait).toBe('none')
    expect(quiet.action).not.toMatch(/chase|follow|wander|approach/)
    expect(new BehaviourEngine(undefined, 4).update(input({ typing, mode: 'focus' })).gait).toBe('none')
    expect(new BehaviourEngine(undefined, 4).update(input({ typing, mode: 'sleep' })).posture).toBe('sleeping')
  })

  it('still notices a window closing immediately after visiting it', () => {
    const brain = new BehaviourEngine(undefined, 2)
    const window = windows[1]!
    brain.update(input({ events: [{ type: 'window_opened', windowId: window.id, app: window.app, bounds: window.bounds, source: 'sim' }] }))
    const closed = brain.update(input({ now: 21, windows: windows.filter(item => item.id !== window.id), events: [{ type: 'window_closed', windowId: window.id, app: window.app, source: 'sim' }] }))
    expect(closed.action).toBe('window_closed')
  })

  it('reacts to a pause after typing and to explicitly shared words without AI', () => {
    const paused = new BehaviourEngine().update(input({ events: [{ type: 'typing_paused', app: 'Notes', duration: 45, source: 'sim' }] }))
    expect(paused.action).toBe('typing_pause')
    const success = localPuppyReply('All tests passed', 'shared-text')
    expect(success.intention).toBe('celebrate')
    const shared = new BehaviourEngine().update(input({ mode: 'focus', events: [{ type: 'shared_text', reply: success, source: 'user' }] }))
    expect(shared.speech).toBe(success.say)
    expect(shared.emote).toBe('happy_wag')
    const simulated = new BehaviourEngine().update(input({ events: [{ type: 'shared_text', reply: success, source: 'sim' }] }))
    expect(simulated.debug.source).toBe('sim')
    const secret = 'sk-example-secret-value-that-must-not-be-repeated'
    expect(JSON.stringify(localPuppyReply(secret, 'shared-text'))).not.toContain(secret)
    expect(localPuppyReply('Tests failed', 'shared-text').intention).toBe('report_problem')
  })

  it('visits varied windows spontaneously, and responds to frequency settings', () => {
    function simulate(frequency: 'low' | 'high') {
      const brain = new BehaviourEngine({ curiosity: 0.9, playfulness: 0.9, energy: 0.9, confidence: 0.8, sociability: 0.2, attentionSeeking: 0.2, sleepiness: 0, excitability: 0.5, independence: 0.4 }, 7)
      const movement = new MovementController()
      const engine = new AnimationEngine()
      const director = new PerformanceDirector(engine)
      movement.place(450, 820)
      const visits = new Set<string>()
      let count = 0
      let lastVisit = ''
      for (let i = 0; i < 150 * 30; i++) {
        const out = brain.update(input({ now: 20 + i / 30, x: movement.x, y: movement.y, arrived: movement.arrived, surfaceId: movement.surfaceId, windowInteractionFrequency: frequency, followCursor: false }))
        if (out.action === 'approach' && out.reason.startsWith('going to look at ') && out.reason !== lastVisit) {
          visits.add(out.reason)
          count++
          lastVisit = out.reason
        } else if (out.action !== 'approach') lastVisit = ''
        const performance = { posture: out.posture, gait: out.gait, emote: out.emote, facing: movement.facing, motion: movement.motion, force: out.force, token: out.token, airborne: movement.airborne, justLanded: movement.justLanded }
        movement.update(1 / 30, { kind: director.prepareMovement(performance), targetX: out.targetX ?? undefined, targetY: out.targetY ?? undefined, surfaceId: out.surfaceId }, { floorY: 820, minX: 40, maxX: 1760, windows: [] })
        director.sync({ ...performance, motion: movement.motion, airborne: movement.airborne, justLanded: movement.justLanded })
        engine.update(1 / 30, { phase: movement.phase, time: i / 30 })
      }
      return { count, visits }
    }
    const low = simulate('low')
    const high = simulate('high')
    expect(high.visits.size).toBeGreaterThan(1)
    expect(high.count).toBeGreaterThan(low.count)
  })
})
