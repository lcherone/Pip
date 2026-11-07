import { describe, expect, it } from 'vitest'
import { PettingTracker } from '../src/core/petting'
import { BehaviourEngine, type BehaviourInput } from '../src/core/behaviour'

function input(overrides: Partial<BehaviourInput> = {}): BehaviourInput {
  return { dt: 0.65, now: 20, x: 200, y: 800, floorY: 800, minX: 40, maxX: 1100,
    cursor: null, windows: [], focusedApp: null, idleSeconds: 0, dragging: false, mode: 'chill', paused: false,
    events: [{ type: 'petted', source: 'user' }], affinity: {}, supportLost: false, arrived: true,
    allowIntro: false, followWindows: false, windowClimbing: true, followCursor: false, memoryEnabled: false, ...overrides }
}

describe('mouse petting', () => {
  it('greets entry, counts deliberate strokes and ignores stationary hover and small jitter', () => {
    const tracker = new PettingTracker()
    expect(tracker.sample(1, 100, 100, true)).toBe(true)
    expect(tracker.sample(2, 100, 100, true)).toBe(false)
    expect(tracker.sample(3, 102, 100, true)).toBe(false)
    expect(tracker.sample(3.1, 130, 100, true)).toBe(true)
    expect(tracker.sample(3.2, 100, 100, true)).toBe(false)
    expect(tracker.sample(3.8, 130, 100, true)).toBe(true)
  })
  it('ignores dragging, transparent padding and controls, and does not bank travel outside Pip', () => {
    const tracker = new PettingTracker()
    expect(tracker.sample(1, 100, 100, false)).toBe(false)
    expect(tracker.sample(2, 100, 100, true)).toBe(true)
    expect(tracker.sample(3, 900, 900, false)).toBe(false)
    expect(tracker.sample(4, 100, 100, true)).toBe(true)
    expect(tracker.sample(5, 100, 100, true)).toBe(false)
    expect(tracker.sample(5.1, NaN, 100, true)).toBe(false)
  })
  it('limits rapid re-entry and normalises stroke distance for pet scale', () => {
    const tracker = new PettingTracker()
    expect(tracker.sample(1, 100, 100, true, 2)).toBe(true)
    tracker.reset()
    expect(tracker.sample(1.1, 100, 100, true, 2)).toBe(false)
    expect(tracker.sample(2, 120, 100, true, 2)).toBe(false)
    expect(tracker.sample(3, 140, 100, true, 2)).toBe(true)
  })
})

describe('affection and excitement', () => {
  it('builds from happy wagging through wiggles to excitement, without becoming unresponsive', () => {
    const brain = new BehaviourEngine(undefined, 2)
    const clips = new Set<string | null>()
    for (let i = 0; i < 40; i++) {
      const out = brain.update(input({ now: 20 + i * 0.65 }))
      expect(out.action).toBe('pet')
      expect(out.gait).toBe('none')
      expect(out.fx).toBe('hearts')
      clips.add(out.emote)
      if (i > 8) expect(out.mood).toBe('excited')
    }
    expect(clips).toEqual(new Set(['happy_wag', 'wiggle', 'excited_jump']))
    for (let i = 0; i < 40; i++) brain.update(input({ dt: 1, now: 50 + i, events: [] }))
    const fresh = brain.update(input({ now: 91 }))
    expect(fresh.emote).toBe('happy_wag')
    expect(fresh.mood).toBe('happy')
  })
  it.each(['focus', 'ledge'] as const)('keeps petting safe in %s', state => {
    const brain = new BehaviourEngine(undefined, 2)
    for (let i = 0; i < 20; i++) {
      const out = brain.update(input({ now: 20 + i * 0.65, mode: state === 'focus' ? 'focus' : 'chill', surfaceId: state === 'ledge' ? 'editor' : null }))
      expect(out.action).toBe('pet')
      expect(out.emote).not.toBe('excited_jump')
      if (state === 'ledge') {
        expect(out.posture).toBe('ledge')
        expect(out.surfaceId).toBe('editor')
      }
    }
  })
  it('keeps dragging and pausing ahead of petting', () => {
    expect(new BehaviourEngine().update(input({ dragging: true })).action).toBe('held')
    expect(new BehaviourEngine().update(input({ paused: true })).action).toBe('paused')
  })
})
