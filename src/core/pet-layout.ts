import type { DisplayInfo } from './desktop'
import { clamp } from './math'

function displayAt(point: { x: number; y: number }, displays: DisplayInfo[]): DisplayInfo | undefined {
  return displays.slice().sort((a, b) => {
    const distance = ({ bounds }: DisplayInfo) => Math.hypot(
      point.x - clamp(point.x, bounds.x, bounds.x + bounds.w),
      point.y - clamp(point.y, bounds.y, bounds.y + bounds.h),
    )
    return distance(a) - distance(b)
  })[0]
}

/** Keep transparent padding inside macOS's window limits, without moving the pet. */
export function petAnchor(feet: { x: number; y: number }, displays: DisplayInfo[], scale: number): { x: number; y: number } {
  const top = displayAt(feet, displays)?.workArea.y ?? 40
  return { x: 210 * scale, y: Math.min(360 * scale, Math.max(0, feet.y - top)) }
}

/** Keep the held puppy visible, while allowing the pointer to cross displays. */
export function heldPosition(feet: { x: number; y: number }, displays: DisplayInfo[], scale: number): { x: number; y: number } {
  const area = displayAt(feet, displays)?.workArea
  if (!area) return feet
  return {
    x: clamp(feet.x, area.x + 80 * scale, area.x + area.w - 80 * scale),
    y: clamp(feet.y, area.y + 130 * scale, area.y + area.h - 8),
  }
}
