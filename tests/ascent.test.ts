import { describe, expect, it } from 'vitest'
import { chooseAscentStyle, type AscentStyle } from '../src/core/ascent'
import { MovementController } from '../src/core/movement'
import { PerformanceDirector, resolveClip, type Performance } from '../src/core/director'
import { AnimationEngine } from '../src/core/animation/engine'
import { finitePose } from '../src/core/pose'
import { getClip } from '../src/core/animation/clips'

const window = { id: 'editor', app: 'Editor', displayId: 'main', focused: true, onScreen: true, bounds: { x: 200, y: 250, w: 500, h: 500 } }
const world = { floorY: 848, minX: 40, maxX: 1160, windows: [window] }
const performance: Performance = { posture: 'ledge', gait: 'climb', emote: null, facing: 1, motion: 'climb', force: false, token: 1, airborne: false, justLanded: false }

describe('window ascent performances', () => {
  it('chooses a spring for low ledges, cautious crawling when tired, and varied confident routes', () => {
    expect(chooseAscentStyle(120, 0.8, 0.8, 0.8, 0.9)).toBe('spring')
    expect(chooseAscentStyle(600, 0.3, 0.8, 0.8, 0.1)).toBe('careful')
    expect(chooseAscentStyle(600, 0.8, 0.2, 0.8, 0.1)).toBe('careful')
    expect(chooseAscentStyle(600, 0.8, 0.8, 0.8, 0.1)).toBe('spring')
    expect(chooseAscentStyle(600, 0.8, 0.8, 0.8, 0.6)).toBe('scramble')
  })

  it.each(['spring', 'scramble', 'careful'] as AscentStyle[])('completes a %s climb with reaching paws, pull-up and actual contact', style => {
    const move = new MovementController(), engine = new AnimationEngine(), director = new PerformanceDirector(engine)
    move.reset(450, 848); engine.reset('standing')
    const phases = new Set<string>(), clips = new Set<string>()
    let maxReach = 0, alternating = false, landed = false
    for (let frame = 0; frame < 900; frame++) {
      const before = move.y
      move.update(1 / 60, { kind: 'climb', targetX: 450, targetY: 252, surfaceId: window.id, ascentStyle: style }, world)
      expect(Math.abs(move.y - before)).toBeLessThan(12)
      if (move.ascent) phases.add(move.ascent.phase)
      const clip = director.sync({ ...performance, ascent: move.ascent, motion: move.motion, airborne: move.airborne, justLanded: move.justLanded })
      clips.add(clip)
      const out = engine.update(1 / 60, { phase: move.phase, time: frame / 60, ascent: move.ascent, airborne: move.airborne })
      expect(finitePose(out.pose)).toBe(true)
      maxReach = Math.max(maxReach, out.pose.reachFL, out.pose.reachFR)
      alternating ||= Math.abs(out.pose.reachFL - out.pose.reachFR) > 0.25
      if (move.surfaceId) { landed = true; break }
    }
    expect(landed).toBe(true)
    expect(move.y).toBe(252)
    expect(move.surfaceId).toBe(window.id)
    expect(move.ascent).toBeNull()
    expect(phases.has('climb')).toBe(true)
    expect(phases.has('pullup')).toBe(true)
    expect(clips.has('climb_pull_up')).toBe(true)
    expect(clips.has('land_ledge')).toBe(true)
    expect(maxReach).toBeGreaterThan(0.8)
    expect(alternating).toBe(true)
    if (style === 'spring') {
      expect(phases.has('anticipate')).toBe(true)
      expect(phases.has('leap')).toBe(true)
      expect(clips.has('jump_paws_up')).toBe(true)
    } else expect(phases.has('leap')).toBe(false)
  })

  it('uses a real crouch/arc and paws-up pose for a low ledge jump', () => {
    const low = { ...window, bounds: { ...window.bounds, y: 710 } }
    const move = new MovementController(); move.reset(450, 848)
    const phases = new Set<string>()
    for (let i = 0; i < 180 && !move.surfaceId; i++) {
      move.update(1 / 60, { kind: 'jump', targetX: 450, targetY: 712, surfaceId: low.id }, { ...world, windows: [low] })
      if (move.ascent) phases.add(move.ascent.phase)
    }
    expect(phases).toEqual(new Set(['anticipate', 'leap']))
    expect(move.surfaceId).toBe(low.id)
    expect(resolveClip({ ...performance, ascent: { phase: 'leap', style: 'spring', progress: 0.5, remaining: 100, surfaceId: low.id }, airborne: true })).toBe('jump_paws_up')
    expect(resolveClip({ ...performance, motion: 'air', ascent: null, airborne: true })).toBe('jump')
  })

  it.each(['anticipate', 'leap', 'climb', 'pullup'])('recovers if the window disappears during %s', phase => {
    const move = new MovementController(); move.reset(450, 848)
    const intent = { kind: 'climb' as const, targetX: 450, targetY: 252, surfaceId: window.id, ascentStyle: 'spring' as const }
    for (let i = 0; i < 800 && move.ascent?.phase !== phase; i++) move.update(1 / 60, intent, world)
    expect(move.ascent?.phase).toBe(phase)
    for (let i = 0; i < 180; i++) move.update(1 / 60, { kind: 'idle' }, { ...world, windows: [] })
    expect(move.ascent).toBeNull()
    expect(move.y).toBe(848)
    expect(move.airborne).toBe(false)
  })

  it('retracts reaching paws immediately when Pip is picked up', () => {
    const engine = new AnimationEngine(); engine.reset('standing'); engine.play('climb_scramble', { force: true })
    for (let i = 0; i < 20; i++) engine.update(1 / 60, { phase: i / 20, time: i / 60 })
    expect(engine.update(0).pose.reachFR).toBeGreaterThan(0.1)
    const held = engine.update(1 / 60, { phase: 0, time: 1, held: true })
    expect(held.pose.reachFL).toBe(0); expect(held.pose.reachFR).toBe(0)
  })

  it('makes the final paw reach follow physical pull-up progress rather than the clip clock', () => {
    const clip = getClip('climb_pull_up')!
    const at = (progress: number) => clip.sample(0.5, { phase: 0.5, time: 0.5, ascent: { phase: 'pullup', style: 'scramble', progress, remaining: (1 - progress) * 90, surfaceId: window.id } })
    expect(at(0).reachFR).toBeGreaterThan(0.8)
    expect(at(1).reachFR).toBe(0)
  })
})
