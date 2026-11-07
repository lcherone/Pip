import { clamp } from './math'

/** Angles relative to the rotated body, keeping relaxed paws pointed with gravity. */
export function suspendedLeg(bodyRotation: number, time: number, hind: boolean, far: boolean) {
  const phase = time * 2.4 + (hind ? 1.1 : 0) + (far ? 0.65 : 0)
  const sway = Math.sin(phase) * 4
  const bend = (hind ? -1 : 1) * (5 + Math.sin(phase + 0.4) * 2)
  return {
    upperAngle: -clamp(bodyRotation, -32, 32) + sway,
    lowerAngle: bend,
    upperLength: hind ? 19 : 20,
    lowerLength: hind ? 20 : 22,
  }
}
