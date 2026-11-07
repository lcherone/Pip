import { describe, expect, it } from 'vitest'
import { listClips } from '../src/core/animation/clips'
import { addDelta, poseFrom, type Pose } from '../src/core/pose'
import { drawPuppy } from '../src/renderer/draw/puppy'

// Exercise the real renderer without a native canvas dependency. Browser QA also
// checks the raster output; this trace keeps the per-clip regression in npm test.
function render(pose: Pose) {
  const calls: unknown[][] = []
  const stack: Record<string, unknown>[] = []
  let state: Record<string, unknown> = { globalAlpha: 1 }
  let ears = 0
  const gradient = { addColorStop: (...args: unknown[]) => calls.push(['colorStop', ...args]) }
  const ctx = new Proxy({}, {
    get: (_target, key: string) => {
      if (key in state) return state[key]
      return (...args: unknown[]) => {
        for (const value of args) if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Non-finite ${key}`)
        calls.push([key, ...args])
        if (key === 'save') stack.push({ ...state })
        if (key === 'restore') state = stack.pop()!
        if (key === 'fill' && state.fillStyle === '#f4b8ab') ears += 1
        if (key === 'createRadialGradient') return gradient
      }
    },
    set: (_target, key: string, value: unknown) => {
      state[key] = value
      calls.push(['set', key, value === gradient ? 'gradient' : value])
      return true
    },
  }) as CanvasRenderingContext2D
  drawPuppy(ctx, pose, 160, 255, 1.2, 0.4)
  expect(stack).toHaveLength(0)
  return { calls, ears }
}

describe.each(listClips())('facing renderer: $id', clip => {
  it('draws one ear in either side profile throughout the animation and hides far-ear twitches', () => {
    for (let n = 0; n <= 8; n++) {
      const u = n / 8
      const sample = clip.sample(u, { phase: u, time: u * clip.duration })
      const pose = clip.blend === 'add' ? addDelta(poseFrom({}), sample, 1) : poseFrom(sample)
      for (const yaw of [-1, 1]) {
        const farEar = yaw < 0 ? 'earR' : 'earL'
        const before = render({ ...pose, yaw, [farEar]: -70 })
        const after = render({ ...pose, yaw, [farEar]: 70 })
        expect(before.ears).toBe(1)
        expect(after.calls).toEqual(before.calls)
      }
    }
  })
})

describe('ear perspective', () => {
  it('keeps both ears visible from the front and during partial turns', () => {
    for (const yaw of [-0.5, 0, 0.5]) expect(render(poseFrom({ yaw })).ears).toBe(2)
  })

  it('keeps the camera-facing ear animated on either side', () => {
    for (const yaw of [-1, 1]) {
      const nearEar = yaw < 0 ? 'earL' : 'earR'
      expect(render(poseFrom({ yaw, [nearEar]: -40 })).calls)
        .not.toEqual(render(poseFrom({ yaw, [nearEar]: 40 })).calls)
    }
  })
})
