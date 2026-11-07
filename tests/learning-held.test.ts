import { describe, expect, it } from 'vitest'
import { AnimationEngine } from '../src/core/animation/engine'
import { BehaviourEngine, type BehaviourInput } from '../src/core/behaviour'
import { hydrateLearning, learnFeedback, type LearningMemory } from '../src/core/learning'
import { clearMemory, freshState, hydrate } from '../src/core/memory'
import { finitePose } from '../src/core/pose'
import { suspendedLeg } from '../src/core/rig'
import { DEFAULT_PERSONALITY } from '../src/core/settings'

function input(overrides: Partial<BehaviourInput> = {}): BehaviourInput {
  return {
    dt: 0, now: 30, x: 200, y: 500, floorY: 500, minX: 0, maxX: 1000,
    cursor: null, windows: [], focusedApp: null, idleSeconds: 0, dragging: false,
    mode: 'chill', paused: false, events: [], affinity: {}, supportLost: false,
    arrived: false, allowIntro: false, followWindows: true, windowClimbing: true,
    followCursor: true, memoryEnabled: true, learningEnabled: true, ...overrides,
  }
}

function puppy() {
  const engine = new BehaviourEngine({ ...DEFAULT_PERSONALITY, energy: 0.5, playfulness: 0.5, independence: 0.5, sleepiness: 0 }, 1)
  engine.needs = { energy: 0.9, rest: 0, curiosity: 0, attention: 0.5, stimulation: 0.5 }
  return engine
}

const likedWandering: LearningMemory = { wander: { score: 1, encouraged: 10, discouraged: 0 } }

describe('local behaviour learning', () => {
  it('changes autonomous choices from explicit feedback without changing personality', () => {
    const baseline = puppy()
    const adapted = puppy()
    const original = { ...adapted.personality }
    expect(baseline.update(input()).action).toBe('idle_sit')
    expect(adapted.update(input({ learning: likedWandering })).action).toBe('wander')
    expect(adapted.personality).toEqual(original)
  })

  it('uses recent history to avoid continually repeating an encouraged activity', () => {
    expect(puppy().update(input({ learning: likedWandering, recentActions: ['wander', 'wander', 'wander'] })).action).toBe('idle_sit')
  })

  it.each([{ memoryEnabled: false }, { learningEnabled: false }])('respects disabled learning: %j', (disabled) => {
    expect(puppy().update(input({ ...disabled, learning: likedWandering })).action).toBe('idle_sit')
  })

  it('cannot enable an unavailable activity or override focus and sleep modes', () => {
    const learning: LearningMemory = { chase: { score: 1, encouraged: 10, discouraged: 0 } }
    const unavailable = puppy().update(input({ learning, cursor: { x: 700, y: 500, speed: 1500 }, followCursor: false }))
    expect(unavailable.debug.scores.find((score) => score.id === 'chase')?.score).toBe(-1)
    const focus = puppy().update(input({ mode: 'focus', learning, cursor: { x: 700, y: 500, speed: 1500 } }))
    expect(focus.action).not.toBe('chase')
    expect(puppy().update(input({ mode: 'sleep', learning: likedWandering })).posture).toBe('sleeping')
  })

  it('does not suppress essential rest or explicit stay commands', () => {
    const tired = puppy()
    tired.needs.energy = 0.05
    tired.needs.rest = 0.95
    expect(tired.update(input({ learning: { sleep: { score: -1, encouraged: 0, discouraged: 10 } } })).action).toBe('sleep')
    expect(puppy().update(input({ learning: likedWandering, force: { action: 'stay' } })).action).toBe('stay')
  })

  it('bounds feedback and can learn in both directions', () => {
    let learning: LearningMemory = {}
    for (let i = 0; i < 50; i++) learning = learnFeedback(learning, 'wander', 1)
    expect(learning.wander?.score).toBe(1)
    for (let i = 0; i < 50; i++) learning = learnFeedback(learning, 'wander', -1)
    expect(learning.wander?.score).toBe(-1)
    expect(learning.wander?.encouraged).toBe(50)
    expect(learning.wander?.discouraged).toBe(50)
  })

  it('round-trips preferences, migrates older saves, and clears learned memory', () => {
    const state = { ...freshState(), learning: likedWandering, recentActions: ['wander'] }
    expect(hydrate(JSON.parse(JSON.stringify(state))).learning).toEqual(likedWandering)
    expect(hydrate({ version: 1, settings: {} }).learning).toEqual({})
    const cleared = clearMemory(state)
    expect(cleared.learning).toEqual({})
    expect(cleared.recentActions).toEqual([])
    expect(cleared.settings).toEqual(state.settings)
  })

  it('rejects unknown keys and malformed preference values', () => {
    expect(hydrateLearning({ shell: { score: 1 }, wander: { score: Infinity } })).toEqual({})
    expect(hydrateLearning({ sit: { score: 50, encouraged: -3, discouraged: NaN } })).toEqual({ sit: { score: 1, encouraged: 0, discouraged: 0 } })
  })
})

describe('suspended puppy', () => {
  it('keeps all four legs hanging with gravity while the torso tilts', () => {
    for (const bodyRotation of [-25, 0, 8, 25]) {
      for (const hind of [false, true]) {
        for (const far of [false, true]) {
          const leg = suspendedLeg(bodyRotation, 0.7, hind, far)
          const worldUpper = bodyRotation + leg.upperAngle
          const worldPaw = worldUpper + leg.lowerAngle
          expect(Math.abs(worldUpper)).toBeLessThanOrEqual(4)
          expect(Math.abs(worldPaw)).toBeLessThanOrEqual(11)
          expect(leg.upperLength + leg.lowerLength).toBeGreaterThan(35)
        }
      }
    }
  })

  it('uses gentle, independent leg sway instead of a walking gait', () => {
    const a = suspendedLeg(8, 0, false, false)
    const b = suspendedLeg(8, 0.5, false, false)
    const rear = suspendedLeg(8, 0.5, true, true)
    expect(a.upperAngle).not.toBe(b.upperAngle)
    expect(b.upperAngle).not.toBe(rear.upperAngle)
    expect(Math.abs(a.upperAngle - b.upperAngle)).toBeLessThan(8)
  })

  it('releases the held behaviour immediately, including after picking up a sleeping puppy', () => {
    const behaviour = puppy()
    behaviour.update(input({ mode: 'sleep' }))
    expect(behaviour.update(input({ dragging: true })).posture).toBe('held')
    const released = behaviour.update(input({ now: 30.02 }))
    expect(released.posture).not.toBe('held')
    expect(released.action).not.toBe('held')
  })

  it('overrides sleeping, scratching and seated geometry while held', () => {
    const engine = new AnimationEngine()
    engine.reset('sleeping')
    engine.play('held', { force: true })
    const frame = engine.update(0.25, { phase: 0.5, time: 0.25, held: true })
    expect(finitePose(frame.pose)).toBe(true)
    expect(frame.pose.held).toBe(1)
    expect(frame.pose.sit + frame.pose.lie + frame.pose.curl).toBe(0)
    expect(frame.pose.legFL).toBe(0)
    expect(frame.pose.legFR).toBe(0)
    expect(frame.pose.air).toBeGreaterThan(0.5)
  })
})

describe('animation self-improvement', () => {
  it('reduces measured abruptness and applies the resulting timing to real playback', async () => {
    const { checkAnimation } = await import('../src/core/animation/coach')
    const result = checkAnimation('look_left')
    expect(result.passed).toBe(true)
    expect(result.tuned).toBe(true)
    expect(result.transitionAfter).toBeLessThan(result.transitionBefore * 0.9)
    const engine = new AnimationEngine()
    engine.setTransitionDurations({ look_left: result.blendDuration })
    engine.play('look_left', { force: true })
    expect(engine.update(1 / 60).debug.blendDuration).toBe(result.blendDuration)
  })

  it('checks every animation and saves only bounded improvements', async () => {
    const { checkAnimations, hydrateAnimationReport } = await import('../src/core/animation/coach')
    const { listClips } = await import('../src/core/animation/clips')
    const report = await checkAnimations()
    expect(report.results.map((r) => r.id)).toEqual(listClips().map((clip) => clip.id))
    expect(report.results.every((r) => r.passed)).toBe(true)
    for (const result of report.results.filter((r) => r.tuned)) {
      expect(result.blendDuration).toBeGreaterThanOrEqual(0.18)
      expect(result.blendDuration).toBeLessThanOrEqual(0.48)
      expect(result.transitionAfter).toBeLessThan(result.transitionBefore * 0.9)
    }
    const restored = hydrateAnimationReport(JSON.parse(JSON.stringify(report)))
    expect(restored?.durations).toEqual(report.durations)
    expect(clearMemory({ ...freshState(), animationReport: report }).animationReport).toBeNull()
  })

  it('keeps pickup, takeoff and impact timings unchanged', async () => {
    const { checkAnimation } = await import('../src/core/animation/coach')
    for (const id of ['held', 'jump', 'jump_ledge', 'jump_down', 'land']) {
      const result = checkAnimation(id)
      expect(result.passed).toBe(true)
      expect(result.tuned).toBe(false)
      expect(result.blendDuration).toBe(0.18)
    }
  })

  it('detects a broken clip and refuses to tune it', async () => {
    const { checkAnimation } = await import('../src/core/animation/coach')
    const { getClip } = await import('../src/core/animation/clips')
    const clip = getClip('head_tilt')!
    const sample = clip.sample
    try {
      clip.sample = () => ({ headTilt: NaN })
      const result = checkAnimation(clip.id)
      expect(result.passed).toBe(false)
      expect(result.tuned).toBe(false)
    } finally {
      clip.sample = sample
    }
  })
})
