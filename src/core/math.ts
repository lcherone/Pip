export interface Vec {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

export function inverseLerp(a: number, b: number, value: number): number {
  if (Math.abs(b - a) < 1e-6) return 0
  return clamp((value - a) / (b - a), 0, 1)
}

/** One-shot bump that starts and ends at 0. */
export function bump(t: number): number {
  return Math.sin(clamp(t, 0, 1) * Math.PI)
}

/** Two blinks inside a single 0–1 interval. */
export function doubleBump(t: number): number {
  const x = clamp(t, 0, 1)
  const first = Math.sin(clamp(x / 0.42, 0, 1) * Math.PI)
  const second = x > 0.5 ? Math.sin(clamp((x - 0.5) / 0.42, 0, 1) * Math.PI) : 0
  return Math.max(first * (x < 0.48 ? 1 : 0), second)
}

export function shortestYaw(from: number, to: number, t: number): number {
  if (from * to < 0) {
    if (t < 0.5) return lerp(from, 0, t * 2)
    return lerp(0, to, (t - 0.5) * 2)
  }
  return lerp(from, to, t)
}

export interface Spring {
  value: number
  velocity: number
}

/**
 * Underdamped spring, solved in closed form so a long frame cannot spin the value.
 * Euler integration at the idle frame rate (about 30–50ms) was past the stability
 * limit and made the head and body rotate without bound.
 */
export function springStep(spring: Spring, target: number, dt: number, frequency = 6, zeta = 0.72): void {
  if (!Number.isFinite(spring.value) || !Number.isFinite(spring.velocity)) {
    spring.value = target
    spring.velocity = 0
    return
  }
  const h = clamp(dt, 0, 0.25)
  if (h <= 0) return
  const w = Math.max(0.01, frequency) * Math.PI * 2
  const damp = clamp(zeta, 0.05, 0.99)
  const wd = w * Math.sqrt(1 - damp * damp)
  const x0 = spring.value - target
  const v0 = spring.velocity
  const decay = Math.exp(-damp * w * h)
  const cos = Math.cos(wd * h)
  const sin = Math.sin(wd * h)
  const c0 = x0
  const c1 = (v0 + damp * w * x0) / wd
  spring.value = target + decay * (c0 * cos + c1 * sin)
  spring.velocity = decay * ((c1 * wd - c0 * damp * w) * cos - (c0 * wd + c1 * damp * w) * sin)
  if (!Number.isFinite(spring.value) || !Number.isFinite(spring.velocity)) {
    spring.value = target
    spring.velocity = 0
  }
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function length(dx: number, dy: number): number {
  return Math.hypot(dx, dy)
}
