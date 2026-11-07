import type { Clip } from './types'
import type { Pose, PoseKey } from '../pose'

/** Shared playback flavors. Every base clip picks one, then another a moment later. */
export const VARIATIONS: Partial<Pose>[] = [
  {},
  { bodyRot: -11, headRot: -8 },
  { bodyRot: 11, headRot: 8 },
  { headTilt: -8, bodyRot: 6, alert: 0.35 },
  { tailLift: -12, headY: 4 },
  { tailLift: 22, tailWag: 8, chest: 0.35 },
  { tailLift: -14, headY: 8 },
  { headTilt: -12, headRot: 10 },
  { headTilt: 12, headRot: -10 },
  { squash: -0.08, bodyY: 5, headY: 5, tailLift: 6 },
]

export function variationIndex(id: string, salt: number): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 33 + id.charCodeAt(i)) >>> 0
  return (hash + Math.abs(Math.floor(salt))) % VARIATIONS.length
}

export function applyVariation(pose: Pose, clip: Clip, salt: number): void {
  if (clip.id === 'held' || pose.held > 0.5) return
  const flavor = VARIATIONS[variationIndex(clip.id, salt)]
  if (!flavor) return
  const sleeping = clip.from.includes('sleeping') || clip.end === 'sleeping'
  const scale = sleeping ? 0.4 : clip.category === 'movement' ? 0.7 : 1
  const locked = new Set(clip.locks)
  for (const key of Object.keys(flavor) as PoseKey[]) {
    // Ear gestures and their release are owned by the ear animation layer.
    if (locked.has(key) || key === 'earL' || key === 'earR') continue
    if (sleeping && (key === 'eyeL' || key === 'eyeR' || key === 'curl')) continue
    const amount = flavor[key]
    if (amount === undefined) continue
    pose[key] += amount * scale
  }
}
