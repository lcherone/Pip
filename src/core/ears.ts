import { clamp } from './math'

/** A floppy ear can perk without swinging forward across the eye. */
export function earHinge(twitch: number, alert: number, back = false, headRotation = 0, direction = 1): number {
  const expression = clamp(twitch, -70, 70) * Math.PI / 180 * 0.5
  const resting = 0.3 - clamp(alert, 0, 1) * 0.18
  const expressionAngle = (back ? -1 : 1) * (resting + expression)
  // Let the flap lag a tilted skull, while keeping its root beside the head.
  const gravity = clamp(headRotation, -55, 55) * Math.PI / 180 * 0.55 * direction
  return clamp(expressionAngle - gravity, back ? -0.72 : -0.36, back ? 0.36 : 0.72)
}
