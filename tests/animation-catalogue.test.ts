import { describe, expect, it } from 'vitest'
import { getClip, listClips } from '../src/core/animation/clips'
import { AnimationEngine } from '../src/core/animation/engine'
import { PerformanceDirector, resolveClip, type Performance } from '../src/core/director'
import { MovementController } from '../src/core/movement'
import { finitePose } from '../src/core/pose'

const context = { phase: 0, time: 0 }
const catalogue = listClips()
const performance: Performance = {
  posture: 'standing', gait: 'walk', emote: null, facing: 1, motion: 'idle',
  force: false, token: 1, airborne: false, justLanded: false,
}

// Each catalogue entry gets its own named result, including every legal starting state.
describe.each(catalogue)('$id', (clip) => {
  it.each(clip.from)('plays safely from %s and completes exactly once', (state) => {
    const engine = new AnimationEngine()
    engine.reset(state)
    engine.play(clip.id, { force: true, once: true })
    const seen = new Set<string>()
    const completed: string[] = []
    const markers = new Set<string>()
    const poses = new Set<string>()
    const dt = 1 / 60
    const timeout = clip.duration + 12
    let done = false
    for (let i = 0; i < timeout / dt; i++) {
      const frame = engine.update(dt, { phase: (i * dt / clip.duration) % 1, time: i * dt })
      expect(finitePose(frame.pose)).toBe(true)
      expect(frame.pose.eyeL).toBeGreaterThanOrEqual(0)
      expect(frame.pose.eyeR).toBeLessThanOrEqual(1)
      expect(frame.pose.squash).toBeGreaterThanOrEqual(0.62)
      expect(frame.pose.stretch).toBeLessThanOrEqual(1.35)
      for (const active of frame.debug.clips) seen.add(active.id)
      for (const marker of frame.debug.markers) markers.add(marker)
      completed.push(...frame.completedIds.filter((id) => id === clip.id))
      poses.add(JSON.stringify(frame.pose))
      if (completed.length) {
        done = true
        break
      }
    }
    expect(done, `${clip.id} timed out from ${state}`).toBe(true)
    expect(seen.has(clip.id), 'requested clip actually became active').toBe(true)
    expect(poses.size, 'clip has changing poses').toBeGreaterThan(1)
    if (clip.end) expect(engine.bodyState).toBe(clip.end)
    for (const marker of clip.markers ?? []) expect(markers.has(marker.name), marker.name).toBe(true)
    for (let i = 0; i < 30; i++) {
      completed.push(...engine.update(dt, context).completedIds.filter((id) => id === clip.id))
    }
    expect(completed).toEqual([clip.id])
  })
})

describe('interrupting the catalogue', () => {
  it.each(catalogue)('picks Pip up safely during $id', (clip) => {
    const engine = new AnimationEngine()
    engine.reset(clip.from[0])
    engine.play(clip.id, { force: true })
    engine.update(clip.duration / 2, context)
    engine.play('held', { force: true })
    const frame = engine.update(1 / 60, { ...context, held: true })
    expect(frame.debug.clips[0].id).toBe('held')
    expect(frame.debug.body).toBe('held')
    expect(finitePose(frame.pose)).toBe(true)
    expect(frame.pose.held).toBe(1)
    expect(frame.pose.sit + frame.pose.lie + frame.pose.curl + frame.pose.ledge).toBe(0)
    engine.play('land', { force: true, once: true })
    let landed = false
    for (let i = 0; i < 60; i++) {
      const released = engine.update(1 / 60, context)
      expect(finitePose(released.pose)).toBe(true)
      landed ||= released.completedIds.includes('land')
    }
    expect(landed).toBe(true)
    expect(engine.bodyState).toBe('standing')
  })
})

describe('animation coordination regressions', () => {
  it('cycles the entire catalogue, including overlays, without stalling', () => {
    const engine = new AnimationEngine()
    const completed: string[] = []
    for (const clip of catalogue) {
      engine.play(clip.id, { force: true, once: true })
      for (let i = 0; i < (clip.duration + 15) * 20; i++) {
        const frame = engine.update(0.05, { phase: i / 20, time: i / 20 })
        expect(finitePose(frame.pose)).toBe(true)
        if (frame.completedIds.includes(clip.id)) {
          completed.push(clip.id)
          break
        }
      }
    }
    expect(completed).toEqual(catalogue.map((clip) => clip.id))
  })

  it('preserves elapsed time and poses at saver frame rates', () => {
    const fast = new AnimationEngine()
    const saver = new AnimationEngine()
    for (let i = 0; i < 600; i++) fast.update(1 / 60, context)
    for (let i = 0; i < 40; i++) saver.update(0.25, context)
    const a = fast.update(0, context)
    const b = saver.update(0, context)
    expect(b.time).toBeCloseTo(10, 7)
    expect(b.pose).toEqual(a.pose)
    expect(b.tailPhase).toBeCloseTo(a.tailPhase, 7)
  })

  it('honours per-clip speed for both base and additive playback', () => {
    for (const id of ['idle_stand', 'gentle_breathing']) {
      const engine = new AnimationEngine()
      engine.reset('standing')
      engine.play(id, { force: true, speed: 2 })
      const frame = engine.update(0.25, context)
      expect(frame.debug.clips.find((clip) => clip.id === id)?.time).toBeCloseTo(0.5, 7)
    }
  })

  it('freezes pose, breathing time and tail phase when paused', () => {
    const engine = new AnimationEngine()
    engine.update(0.5, { ...context, mood: 'happy', applyMood: true })
    const before = engine.update(0, context)
    engine.paused = true
    const after = engine.update(0.25, { ...context, mood: 'sad', applyMood: true, targetYaw: -1 })
    expect(after.pose).toEqual(before.pose)
    expect(after.time).toBe(before.time)
    expect(after.tailPhase).toBe(before.tailPhase)
    engine.paused = false
    engine.timeScale = 2
    expect(engine.update(0.25, context).time).toBeCloseTo(before.time + 0.5, 7)
  })

  it('keeps tail phase continuous across a mood change', () => {
    const engine = new AnimationEngine()
    engine.update(1, { ...context, mood: 'calm', applyMood: true })
    const before = engine.update(0, context).tailPhase
    const after = engine.update(0.01, { ...context, mood: 'excited', applyMood: true }).tailPhase
    const delta = (after - before + Math.PI * 2) % (Math.PI * 2)
    expect(delta).toBeGreaterThan(0)
    expect(delta).toBeLessThan(0.1)
  })

  it('uses physical motion before gait intent or a full-body emote', () => {
    expect(resolveClip({ ...performance, gait: 'run', motion: 'walk' })).toBe('walk_right')
    expect(resolveClip({ ...performance, gait: 'run', motion: 'idle' })).toBe('idle_stand')
    expect(resolveClip({ ...performance, emote: 'curious', airborne: true, motion: 'air' })).toBe('jump')
    expect(resolveClip({ ...performance, emote: 'curious', justLanded: true })).toBe('land')
    expect(resolveClip({ ...performance, gait: 'none', motion: 'run', emote: 'celebrate' })).toBe('run')
    expect(resolveClip({ ...performance, motion: 'walk', emote: 'approach_window' })).toBe('approach_window')
    expect(resolveClip({ ...performance, gait: 'walk', motion: 'idle', emote: 'approach_window' })).toBe('idle_stand')
    expect(resolveClip({ ...performance, motion: 'walk', emote: 'sidestep' })).toBe('sidestep')
    expect(resolveClip({ ...performance, motion: 'walk', emote: 'curious' })).toBe('walk_right')
    expect(resolveClip({ ...performance, motion: 'trot', emote: 'trot_prance' })).toBe('trot_prance')
    expect(resolveClip({ ...performance, motion: 'trot', emote: 'curious' })).toBe('trot')
    expect(resolveClip({ ...performance, motion: 'trot', emote: null })).toBe('trot')
  })

  it('stands before translation, then accelerates and brakes without a gait feedback loop', () => {
    const engine = new AnimationEngine()
    const director = new PerformanceDirector(engine)
    const movement = new MovementController()
    movement.place(200, 500)
    const world = { floorY: 500, minX: 0, maxX: 900, windows: [] }
    const step = (gait: Performance['gait']) => {
      const state = { ...performance, gait, motion: movement.motion, justLanded: movement.justLanded }
      const kind = director.prepareMovement(state)
      movement.update(1 / 60, { kind, targetX: 700 }, world)
      director.sync({ ...state, motion: movement.motion, justLanded: movement.justLanded })
      return engine.update(1 / 60, { ...context, phase: movement.phase })
    }
    for (let i = 0; i < 25; i++) step('walk')
    expect(movement.x).toBe(200)
    for (let i = 0; i < 90; i++) step('run')
    expect(movement.vx).toBeGreaterThan(200)
    expect(movement.x).toBeGreaterThan(250)
    const brakingPhase = movement.phase
    for (let i = 0; i < 60; i++) step('none')
    expect(movement.vx).toBe(0)
    expect(movement.phase).not.toBe(brakingPhase)
    expect(step('none').debug.clips[0].id).toBe('idle_stand')
  })

  it('does not drop a forced retry after a rejected sleeping request', () => {
    const engine = new AnimationEngine()
    engine.reset('sleeping')
    const director = new PerformanceDirector(engine)
    const request = { ...performance, gait: 'none' as const, emote: 'bark' }
    director.sync(request)
    expect(engine.update(0.05, context).debug.clips[0].id).toBe('sleep_breathe')
    director.sync({ ...request, force: true })
    const active = engine.update(0.05, context).debug.clips[0].id
    expect(active).not.toBe('sleep_breathe')
  })

  it('resumes the same requested action after a playground pose reset', () => {
    const engine = new AnimationEngine()
    const director = new PerformanceDirector(engine)
    director.sync(performance)
    for (let i = 0; i < 60; i++) engine.update(1 / 60, context)
    engine.reset('sitting')
    director.sync(performance)
    expect(engine.requestedClip).toBe('idle_stand')
    for (let i = 0; i < 60; i++) engine.update(1 / 60, context)
    expect(engine.bodyState).toBe('standing')
  })

  it('does not report arrival while waiting to stand up', () => {
    const movement = new MovementController()
    movement.place(200, 500)
    movement.update(1 / 60, { kind: 'idle', targetX: 600 }, { floorY: 500, minX: 0, maxX: 900, windows: [] })
    expect(movement.x).toBe(200)
    expect(movement.arrived).toBe(false)
  })

  it('integrates movement consistently at 60 FPS and saver frame rates', () => {
    const fast = new MovementController()
    const saver = new MovementController()
    const world = { floorY: 500, minX: 0, maxX: 3000, windows: [] }
    const intent = { kind: 'run' as const, targetX: 2500 }
    fast.place(200, 500)
    saver.place(200, 500)
    for (let i = 0; i < 120; i++) fast.update(1 / 60, intent, world)
    for (let i = 0; i < 8; i++) saver.update(0.25, intent, world)
    expect(saver.x).toBeCloseTo(fast.x, 7)
    expect(saver.phase).toBeCloseTo(fast.phase, 7)
  })

  it('delivers markers on a looping boundary and does not repeat completion', () => {
    const clip = getClip('idle_stand')!
    const previous = clip.markers
    clip.markers = [{ at: 0.99, name: 'near-end' }, { at: 0.01, name: 'near-start' }]
    try {
      const engine = new AnimationEngine()
      engine.reset('standing')
      engine.play('idle_stand', { force: true })
      const markers: string[] = []
      for (let i = 0; i < 66; i++) markers.push(...engine.update(0.05, context).debug.markers)
      expect(markers.filter((name) => name === 'near-end')).toHaveLength(1)
      expect(markers.filter((name) => name === 'near-start')).toHaveLength(2)
    } finally {
      clip.markers = previous
    }
  })
})
