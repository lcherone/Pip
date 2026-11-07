import { describe, expect, it } from 'vitest'
import { activityForAction } from '../src/core/learning'
import { TRICK_IDS, trickFrame, unrotatePoint, isTrick } from '../src/core/tricks'
import { getClip } from '../src/core/animation/clips'
import { AnimationEngine } from '../src/core/animation/engine'
import { BehaviourEngine, type BehaviourInput } from '../src/core/behaviour'
import { poseFrom } from '../src/core/pose'
import { puppyContains } from '../src/renderer/draw/puppy'

function input(overrides: Partial<BehaviourInput> = {}): BehaviourInput {
  return { dt: 0.2, now: 20, x: 300, y: 800, floorY: 800, minX: 40, maxX: 1100,
    cursor: null, windows: [], focusedApp: null, idleSeconds: 0, dragging: false, mode: 'playful', paused: false,
    events: [], affinity: {}, supportLost: false, arrived: true, allowIntro: false, followWindows: false,
    windowClimbing: true, followCursor: false, memoryEnabled: false, ...overrides }
}

describe.each(TRICK_IDS)('playful trick %s', id => {
  it('winds up, holds a distinct trick, and returns upright', () => {
    const clip = getClip(id)!
    expect(activityForAction(id)).toBe('emote')
    expect(clip.loop).toBe(false)
    expect(clip.duration).toBeGreaterThan(2)
    const start = poseFrom(clip.sample(0, { phase: 0, time: 0 }))
    const middle = poseFrom(clip.sample(0.5, { phase: 0.5, time: clip.duration / 2 }))
    const end = poseFrom(clip.sample(1, { phase: 1, time: clip.duration }))
    expect(start.trickRot).toBeCloseTo(0)
    expect(end.trickRot).toBeCloseTo(0)
    expect(Math.abs(middle.trickRot)).toBeGreaterThan(45)
    if (id === 'roll_over') expect(middle.trickRot).toBeCloseTo(180)
    const engine = new AnimationEngine()
    engine.reset('standing')
    engine.play(id, { force: true, once: true })
    let completed = false
    for (let i = 0; i < 240; i++) completed ||= engine.update(1 / 60).completedIds.includes(id)
    expect(completed).toBe(true)
  })

  it('cancels inversion immediately on pickup and falling', () => {
    for (const context of [{ held: true }, { airborne: true }]) {
      const engine = new AnimationEngine()
      engine.reset('standing')
      engine.play(id, { force: true })
      for (let i = 0; i < 90; i++) engine.update(1 / 60)
      expect(Math.abs(engine.update(0).pose.trickRot)).toBeGreaterThan(20)
      const picked = engine.update(1 / 60, { phase: 0, time: 0, ...context })
      expect(picked.pose.trickRot).toBe(0)
      expect(picked.pose.trickPivot).toBe(0)
    }
  })

  it('allows a complete explicit performance and blocks turning halfway through', () => {
    const brain = new BehaviourEngine(undefined, 4)
    const out = brain.update(input({ force: { action: 'emote', emote: id } }))
    expect(out.emote).toBe(id)
    const later = brain.update(input({ now: 22, cursor: { x: 100, y: 700, speed: 100 }, followCursor: true }))
    expect(later.emote).toBe(id)
    expect(later.token).toBe(out.token)
    expect(later.faceX).toBeNull()
  })
})

describe('trick contact and interaction', () => {
  it.each([-1, 1])('mirrors rotation and keeps the supporting shoulder or hip fixed facing %s', yaw => {
    for (const id of ['handstand', 'stand_two_paws']) {
      const pose = poseFrom({ ...getClip(id)!.sample(0.5, { phase: 0.5, time: 1 }), yaw })
      const frame = trickFrame(pose)
      expect(frame.x).toBe((id === 'handstand' ? 24 : -12) * yaw)
      expect(frame.y).toBe(id === 'handstand' ? -34 : -30)
      expect(Math.sign(frame.rotation)).toBe((id === 'handstand' ? 1 : -1) * yaw)
      const pivot = unrotatePoint(0, 0, frame.rotation)
      expect(pivot).toEqual({ x: 0, y: 0 })
      const body = unrotatePoint(-frame.x, -50 - frame.y, -frame.rotation)
      expect(puppyContains(body.x + frame.x, body.y + frame.y, pose, 0, 0, 1)).toBe(true)
    }
  })

  it('keeps encouraging pats from restarting a running trick', () => {
    const brain = new BehaviourEngine(undefined, 4)
    let trick: ReturnType<BehaviourEngine['update']> | null = null
    for (let i = 0; i < 15; i++) {
      const out = brain.update(input({ dt: 0.65, now: 20 + i * 0.65, events: [{ type: 'petted', source: 'user' }] }))
      if (isTrick(out.emote)) { trick = out; break }
    }
    expect(trick).not.toBeNull()
    const encouraged = brain.update(input({ now: 25, events: [{ type: 'petted', source: 'user' }] }))
    expect(encouraged.emote).toBe(trick!.emote)
    expect(encouraged.token).toBe(trick!.token)
  })

  it.each([{ surfaceId: 'editor' }, { airborne: true }, { mode: 'focus' as const }, { x: 55 }, { paused: true }])('keeps tricks off unsafe ground: %j', constraint => {
    for (const id of TRICK_IDS) {
      const out = new BehaviourEngine().update(input({ ...constraint, force: { action: 'emote', emote: id } }))
      expect(isTrick(out.emote)).toBe(false)
      if ('surfaceId' in constraint) expect(out.posture).toBe('ledge')
    }
  })

  it('spontaneously varies tricks in playful mode, without constant acrobatics', () => {
    const brain = new BehaviourEngine({ curiosity: 0.3, playfulness: 1, energy: 0.8, confidence: 0.8,
      sociability: 0.4, attentionSeeking: 0.8, sleepiness: 0.1, excitability: 0.7, independence: 0.4 }, 8)
    const seen: string[] = []
    let token = -1
    for (let i = 0; i < 900; i++) {
      // Isolate selection/cooldowns from hunger and sleep cycles.
      brain.needs.energy = 0.85
      brain.needs.rest = 0.1
      const out = brain.update(input({ dt: 1, now: 20 + i }))
      if (isTrick(out.emote) && out.token !== token) seen.push(out.emote)
      token = out.token
    }
    expect(new Set(seen).size).toBeGreaterThan(1)
    expect(seen.length).toBeLessThan(30)
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1])
  })
})
