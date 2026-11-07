import { describe, expect, it } from 'vitest'
import { getClip, listClips } from '../src/core/animation/clips'
import { AnimationEngine } from '../src/core/animation/engine'
import { VARIATIONS, applyVariation } from '../src/core/animation/variation'
import { springStep } from '../src/core/math'
import { defaultPose, finitePose, POSE_KEYS, type Pose } from '../src/core/pose'

function expectSane(pose: Pose, where: string): void {
  expect(finitePose(pose), where).toBe(true)
  expect(pose.headRot, `${where} headRot`).toBeGreaterThan(-49)
  expect(pose.headRot, `${where} headRot`).toBeLessThan(49)
  expect(pose.headTilt, `${where} headTilt`).toBeGreaterThan(-37)
  expect(pose.headTilt, `${where} headTilt`).toBeLessThan(37)
  expect(pose.bodyRot, `${where} bodyRot`).toBeGreaterThan(-33)
  expect(pose.bodyRot, `${where} bodyRot`).toBeLessThan(33)
  expect(pose.squash, `${where} squash`).toBeGreaterThan(0.6)
  expect(pose.squash, `${where} squash`).toBeLessThan(1.36)
  expect(pose.stretch, `${where} stretch`).toBeGreaterThan(0.74)
  expect(pose.stretch, `${where} stretch`).toBeLessThan(1.36)
  expect(pose.eyeL, `${where} eyeL`).toBeGreaterThanOrEqual(0)
  expect(pose.eyeL, `${where} eyeL`).toBeLessThanOrEqual(1)
  expect(pose.eyeR, `${where} eyeR`).toBeGreaterThanOrEqual(0)
  expect(pose.eyeR, `${where} eyeR`).toBeLessThanOrEqual(1)
  expect(pose.yaw, `${where} yaw`).toBeGreaterThan(-1.3)
  expect(pose.yaw, `${where} yaw`).toBeLessThan(1.3)
  for (const key of POSE_KEYS) expect(Number.isFinite(pose[key]), `${where} ${key}`).toBe(true)
}

describe('animation poses', () => {
  it('keeps every clip finite across its duration', () => {
    for (const clip of listClips()) {
      const steps = Math.max(4, Math.ceil(clip.duration / 0.05))
      for (let i = 0; i <= steps; i++) {
        const u = Math.min(0.999, i / steps)
        const sample = clip.sample(u, { phase: (i % 8) / 8, time: i * 0.05 })
        for (const value of Object.values(sample)) {
          expect(Number.isFinite(value), `${clip.id} @ ${u.toFixed(2)}`).toBe(true)
        }
        if (clip.blend === 'base') {
          expect(sample.squash ?? 1, clip.id).toBeGreaterThan(0.6)
          expect(sample.stretch ?? 1, clip.id).toBeLessThan(1.4)
          expect(Math.abs(sample.headRot ?? 0), clip.id).toBeLessThan(40)
          expect(Math.abs(sample.headTilt ?? 0), clip.id).toBeLessThan(30)
          expect(Math.abs(sample.bodyRot ?? 0), clip.id).toBeLessThan(30)
        } else {
          expect(Math.abs(sample.headRot ?? 0), clip.id).toBeLessThan(20)
          expect(Math.abs(sample.squash ?? 0), clip.id).toBeLessThan(0.2)
        }
      }
    }
  })

  it('stays aligned through playback and a crossfade', () => {
    const engine = new AnimationEngine()
    const play = (id: string, seconds: number) => {
      engine.play(id, { force: true })
      const steps = Math.ceil(seconds / 0.05)
      for (let i = 0; i < steps; i++) {
        const { pose } = engine.update(0.05, { phase: (i % 10) / 10, time: i * 0.05, autoBlink: true, applyMood: true, mood: 'calm' })
        expectSane(pose, `${id} step ${i}`)
      }
    }
    for (const clip of listClips()) {
      if (clip.blend === 'add') continue
      play(clip.id, clip.duration + 0.4)
    }
    play('idle_sit', 0.3)
    play('look_left', 0.5)
    play('celebrate', 0.5)
    play('sleep_breathe', 0.8)
  })

  it('does not let looping overlays wind the head up', () => {
    const engine = new AnimationEngine()
    engine.play('idle_sit', { force: true })
    engine.play('gentle_breathing')
    engine.play('head_subtle')
    engine.play('tail_slow_wag')
    let early = 0
    let late = 0
    for (let i = 0; i < 200; i++) {
      const { pose } = engine.update(0.05, { phase: 0, time: i * 0.05, autoBlink: true })
      expectSane(pose, `overlay ${i}`)
      const spin = Math.abs(pose.headRot) + Math.abs(pose.bodyRot)
      if (i < 40) early = Math.max(early, spin)
      if (i > 160) late = Math.max(late, spin)
    }
    expect(late).toBeLessThan(early + 12)
  })

  it('settles a spring after a long frame instead of exploding', () => {
    const spring = { value: 0, velocity: 0 }
    for (let i = 0; i < 40; i++) springStep(spring, 24, 0.05, 8, 0.78)
    expect(Number.isFinite(spring.value)).toBe(true)
    expect(Number.isFinite(spring.velocity)).toBe(true)
    expect(Math.abs(spring.value - 24)).toBeLessThan(2)
    expect(Math.abs(spring.velocity)).toBeLessThan(40)

    const jolt = { value: 0, velocity: 0 }
    springStep(jolt, 24, 0.25, 8, 0.78)
    expect(Number.isFinite(jolt.value)).toBe(true)
    expect(Math.abs(jolt.value)).toBeLessThan(80)
    expect(Math.abs(jolt.velocity)).toBeLessThan(400)
  })
})
