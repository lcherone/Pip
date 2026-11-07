import { clamp } from './math'
import type { Pose } from './pose'

export const TRICK_IDS = ['roll_over', 'belly_rub', 'stand_two_paws', 'handstand', 'happy_dance'] as const
export type TrickId = typeof TRICK_IDS[number]
export function isTrick(id: string | null): id is TrickId {
  return TRICK_IDS.some(trick => trick === id)
}

/** Facing-relative rotation around the supporting shoulder, hip, or rolling centre. */
export function trickFrame(pose: Pose): { x: number; y: number; rotation: number; frontPlant: number; backPlant: number; headTuck: number } {
  const direction = pose.yaw >= 0 ? 1 : -1
  const pivot = clamp(pose.trickPivot, -1, 1)
  return {
    x: (pivot > 0 ? 24 : -12) * Math.abs(pivot) * direction,
    y: -45 + (pivot > 0 ? 11 : 15) * Math.abs(pivot),
    rotation: clamp(pose.trickRot, -185, 185) * direction,
    headTuck: Math.max(0, pivot) * Math.min(1, Math.abs(pose.trickRot) / 75) * 44,
    frontPlant: Math.max(0, pivot),
    backPlant: Math.max(0, -pivot),
  }
}

export function unrotatePoint(x: number, y: number, degrees: number): { x: number; y: number } {
  const angle = degrees * Math.PI / 180
  return { x: x * Math.cos(angle) + y * Math.sin(angle), y: -x * Math.sin(angle) + y * Math.cos(angle) }
}
