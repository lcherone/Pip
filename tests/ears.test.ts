import { describe, expect, it } from 'vitest'
import { earHinge } from '../src/core/ears'
import { AnimationEngine } from '../src/core/animation/engine'
import { listClips } from '../src/core/animation/clips'

const context = { phase: 0, time: 0 }

describe('floppy ear hinges', () => {
  it('keeps combined alertness and twitch inside a natural range', () => {
    for (const alert of [-1, 0, 0.5, 1, 3]) for (const twitch of [-100, -70, -35, 0, 35, 70, 100]) {
      const angle = earHinge(twitch, alert)
      expect(angle).toBeGreaterThanOrEqual(-0.36)
      expect(angle).toBeLessThanOrEqual(0.72)
      expect(earHinge(twitch, alert, true)).toBe(-angle)
    }
    expect(earHinge(-28, 1)).toBeGreaterThan(-0.2) // Perk must not fold across the eye.
    expect(earHinge(-10, 0.5)).not.toBe(earHinge(10, 0.5))
  })

  it('lets tilted ears lag the skull in both facing directions', () => {
    for (const direction of [-1, 1]) {
      expect(earHinge(0, 0.4, false, 40 * direction, direction)).toBeLessThan(earHinge(0, 0.4))
      expect(earHinge(-70, 1, false, 180 * direction, direction)).toBe(-0.36)
    }
  })

})

describe('ear recovery after animations', () => {
  it('preserves intentional ear poses while a looping gait is running', () => {
    const engine = new AnimationEngine()
    engine.reset('standing')
    engine.play('run', { force: true })
    for (let i = 0; i < 180; i++) engine.update(1 / 60, context)
    expect(engine.update(0).pose.earL).toBeCloseTo(10, 2)
    expect(engine.update(0).pose.earR).toBeCloseTo(8, 2)
  })

  it.each(listClips())('releases the final ear pose after $id completes', clip => {
    const engine = new AnimationEngine()
    engine.reset(clip.from[0])
    engine.play(clip.id, { force: true, once: true })
    let completed = false
    for (let i = 0; i < (clip.duration + 12) * 60; i++) {
      const frame = engine.update(1 / 60, { phase: i / 60, time: i / 60 })
      if (frame.completedIds.includes(clip.id)) { completed = true; break }
    }
    expect(completed).toBe(true)
    for (let i = 0; i < 90; i++) engine.update(1 / 60, context)
    const resting = engine.update(0).pose
    expect(Math.abs(resting.earL)).toBeLessThan(0.05)
    expect(Math.abs(resting.earR)).toBeLessThan(0.05)
  })

  it('still allows an ear twitch after a completed base pose settles', () => {
    const engine = new AnimationEngine()
    engine.reset('standing')
    engine.play('perk', { force: true, once: true })
    for (let i = 0; i < 180; i++) engine.update(1 / 60, context)
    engine.play('ear_twitch_left')
    let twitch = 0
    for (let i = 0; i < 30; i++) twitch = Math.max(twitch, Math.abs(engine.update(1 / 60, context).pose.earL))
    expect(twitch).toBeGreaterThan(5)
    for (let i = 0; i < 90; i++) engine.update(1 / 60, context)
    expect(Math.abs(engine.update(0).pose.earL)).toBeLessThan(0.05)
  })
})
