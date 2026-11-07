import type { Clip } from './types'
import type { Pose, PoseKey } from '../pose'

/** Shared playback flavors. Every base clip picks one, then another a moment later. */
export const VARIATIONS: Partial<Pose>[] = [
  {},
  { bodyRot: -11, headRot: -8, earL: 10 },
  { bodyRot: 11, headRot: 8, earR: 10 },
  { earL: -20, earR: -18, headTilt: -8, alert: 0.35 },
  { earL: 18, earR: 20, tailLift: -12, headY: 4 },
  { tailLift: 22, tailWag: 8, chest: 0.35, earL: -8, earR: -8 },
  { tailLift: -14, headY: 8, earL: 12, earR: 14 },
  { headTilt: -12, headRot: 10, earL: -16 },
  { headTilt: 12, headRot: -10, earR: -16 },
  { squash: -0.08, bodyY: 5, headY: 5, tailLift: 6 },
]

export function variationIndex(id: string, time: number): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 33 + id.charCodeAt(i)) >>> 0
  return (hash + Math.floor(Math.max(0, time) / 2.2)) % VARIATIONS.length
}

export function applyVariation(pose: Pose, clip: Clip, time: number): void {
  if (clip.id === 'held' || pose.held > 0.5) return
  const flavor = VARIATIONS[variationIndex(clip.id, time)]
  if (!flavor) return
  const sleeping = clip.from.includes('sleeping') || clip.end === 'sleeping'
  const scale = sleeping ? 0.4 : clip.category === 'movement' ? 0.7 : 1
  const locked = new Set(clip.locks)
  for (const key of Object.keys(flavor) as PoseKey[]) {
    if (locked.has(key)) continue
    if (sleeping && (key === 'eyeL' || key === 'eyeR' || key === 'curl')) continue
    const amount = flavor[key]
    if (amount === undefined) continue
    pose[key] += amount * scale
  }
}
