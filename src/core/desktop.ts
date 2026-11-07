import type { PuppyReply } from './reply'
import { clamp, type Rect } from './math'

export interface DisplayInfo {
  id: string
  bounds: Rect
  workArea: Rect
  scaleFactor: number
}

export interface DesktopWindow {
  id: string
  app: string
  bundleId?: string
  displayId: string
  bounds: Rect
  focused: boolean
  title?: string
  onScreen: boolean
  layer?: number
  kind?: 'window' | 'popover'
  zOrder?: number
  firstSeen?: number
  observedAt?: number
  changedAt?: number
  velocity?: { x: number; y: number }
}

export type EventSource = 'os' | 'sim' | 'user'

export type DeskEvent =
  | { type: 'app_activated'; app: string; bundleId?: string; source: EventSource }
  | { type: 'app_launched'; app: string; bundleId?: string; source: EventSource }
  | { type: 'app_terminated'; app: string; bundleId?: string; source: EventSource }
  | { type: 'window_opened'; windowId: string; app: string; bounds: Rect; source: EventSource }
  | { type: 'window_closed'; windowId: string; app: string; source: EventSource }
  | { type: 'window_moved'; windowId: string; app: string; bounds: Rect; source: EventSource }
  | { type: 'window_resized'; windowId: string; app: string; bounds: Rect; source: EventSource }
  | { type: 'typing_started'; app: string; source: EventSource }
  | { type: 'typing_paused'; app: string; duration: number; source: EventSource }
  | { type: 'shared_text'; reply: PuppyReply; source: 'user' | 'sim' }
  | { type: 'window_focused' | 'window_unfocused' | 'window_covered' | 'window_visible'; windowId: string; app: string; source: EventSource }
  | { type: 'display_changed'; source: EventSource }
  | { type: 'idle'; idleSeconds: number; source: EventSource }
  | { type: 'active'; source: EventSource }
  | { type: 'fullscreen'; enabled: boolean; source: EventSource }
  | { type: 'permission'; granted: boolean; source: EventSource }
  | { type: 'clicked'; source: EventSource }
  | { type: 'petted'; source: EventSource }
  | { type: 'codex_started'; source: EventSource }
  | { type: 'codex_completed'; source: EventSource }
  | { type: 'codex_failed'; source: EventSource }

/**
 * Cocoa display space is bottom-left, y up. Electron is top-left of the
 * primary display, y down. `primaryHeight` is the primary display's height in points.
 */
export function cocoaRectToTopLeft(rect: Rect, primaryHeight: number): Rect {
  return {
    x: rect.x,
    y: primaryHeight - (rect.y + rect.h),
    w: rect.w,
    h: rect.h,
  }
}

export function calibrateDisplays(helper: Rect[], electron: Rect[]): { dx: number; dy: number } {
  if (helper.length === 0 || electron.length === 0) return { dx: 0, dy: 0 }
  let best = { dx: 0, dy: 0, score: Number.POSITIVE_INFINITY }
  for (const h of helper) {
    for (const e of electron) {
      const size = Math.abs(h.w - e.w) + Math.abs(h.h - e.h)
      const dx = e.x - h.x
      const dy = e.y - h.y
      const score = size + Math.abs(dx) * 0.01 + Math.abs(dy) * 0.01
      if (score < best.score) best = { dx, dy, score }
    }
  }
  if (best.score > 80) return { dx: 0, dy: 0 }
  return { dx: best.dx, dy: best.dy }
}

export function translateRect(rect: Rect, dx: number, dy: number): Rect {
  return { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h }
}

export function isBlockedApp(name: string, bundleId: string | undefined, blocked: string[]): boolean {
  const app = name.toLowerCase()
  const bundle = (bundleId ?? '').toLowerCase()
  return blocked.some(value => {
    const ban = value.trim().toLowerCase()
    return Boolean(ban && (app.includes(ban) || bundle.includes(ban)))
  })
}

export function filterWindows(windows: DesktopWindow[], blocked: string[]): DesktopWindow[] {
  return windows.filter(window => !isBlockedApp(window.app, window.bundleId, blocked))
}

export function validRect(rect: Rect): boolean {
  return Boolean(rect && [rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) && rect.w > 0 && rect.h > 0 && Math.abs(rect.x) < 100000 && Math.abs(rect.y) < 100000 && rect.w < 50000 && rect.h < 50000)
}

/** Bounded, validated observations; timestamps share the caller's clock. */
export function observeWindows(previous: DesktopWindow[], incoming: DesktopWindow[], now: number): DesktopWindow[] {
  const byId = new Map(previous.map(window => [window.id, window]))
  const seen = new Set<string>()
  return incoming.filter(window => {
    if (!window || typeof window.id !== 'string' || typeof window.app !== 'string' || !validRect(window.bounds) || seen.has(window.id)) return false
    seen.add(window.id)
    return true
  }).slice(0, 64).map((window, index) => {
    const old = byId.get(window.id)
    const elapsed = Math.max(0.05, now - (old?.observedAt ?? now))
    const dx = old ? window.bounds.x - old.bounds.x : 0
    const dy = old ? window.bounds.y - old.bounds.y : 0
    const changed = !old || Math.abs(dx) + Math.abs(dy) + Math.abs(window.bounds.w - old.bounds.w) + Math.abs(window.bounds.h - old.bounds.h) > 2
    return { ...window, zOrder: index, firstSeen: old?.firstSeen ?? now, observedAt: now, changedAt: changed ? now : old.changedAt ?? now,
      velocity: { x: clamp(dx / elapsed, -3000, 3000), y: clamp(dy / elapsed, -3000, 3000) } }
  })
}

function covered(windows: DesktopWindow[], index: number): boolean {
  const window = windows[index]!
  const x = window.bounds.x + window.bounds.w / 2
  const y = window.bounds.y + 1
  return windows.slice(0, index).some(front => front.onScreen && x >= front.bounds.x && x <= front.bounds.x + front.bounds.w && y >= front.bounds.y && y <= front.bounds.y + front.bounds.h)
}

export function diffWindows(prev: DesktopWindow[], next: DesktopWindow[], source: EventSource = 'os'): DeskEvent[] {
  const events: DeskEvent[] = []
  const prevMap = new Map(prev.map((window) => [window.id, window]))
  const nextMap = new Map(next.map((window) => [window.id, window]))
  for (const window of next) {
    const old = prevMap.get(window.id)
    if (!old) {
      events.push({ type: 'window_opened', windowId: window.id, app: window.app, bounds: window.bounds, source })
      continue
    }
    if (window.focused !== old.focused) events.push({ type: window.focused ? 'window_focused' : 'window_unfocused', windowId: window.id, app: window.app, source })
    const wasCovered = covered(prev, prev.indexOf(old))
    const isCovered = covered(next, next.indexOf(window))
    if (wasCovered !== isCovered) events.push({ type: isCovered ? 'window_covered' : 'window_visible', windowId: window.id, app: window.app, source })
    const moved = Math.abs(old.bounds.x - window.bounds.x) > 4 || Math.abs(old.bounds.y - window.bounds.y) > 4
    const resized = Math.abs(old.bounds.w - window.bounds.w) > 4 || Math.abs(old.bounds.h - window.bounds.h) > 4
    if (resized) events.push({ type: 'window_resized', windowId: window.id, app: window.app, bounds: window.bounds, source })
    else if (moved) events.push({ type: 'window_moved', windowId: window.id, app: window.app, bounds: window.bounds, source })
  }
  for (const window of prev) {
    if (!nextMap.has(window.id)) {
      events.push({ type: 'window_closed', windowId: window.id, app: window.app, source })
    }
  }
  return events.slice(0, 64)
}

export function deriveIdleEdges(previousSeconds: number, nextSeconds: number, source: EventSource = 'os'): DeskEvent[] {
  const events: DeskEvent[] = []
  if (previousSeconds < 90 && nextSeconds >= 90) events.push({ type: 'idle', idleSeconds: nextSeconds, source })
  if (previousSeconds >= 20 && nextSeconds < 5) events.push({ type: 'active', source })
  return events
}

export interface FloorQuery {
  x: number
  y: number
  displays: DisplayInfo[]
  multiMonitor: boolean
  margin?: number
}

export function resolveFloor(query: FloorQuery): { x: number; floorY: number; minX: number; maxX: number; displayId: string } {
  const margin = query.margin ?? 36
  const displays = query.displays.length > 0 ? query.displays : [{
    id: 'primary',
    bounds: { x: 0, y: 0, w: 1440, h: 900 },
    workArea: { x: 0, y: 25, w: 1440, h: 830 },
    scaleFactor: 2,
  }]
  const nearest = displays.slice().sort((a, b) => {
    const distance = (display: DisplayInfo) => Math.hypot(query.x - clamp(query.x, display.bounds.x, display.bounds.x + display.bounds.w), query.y - clamp(query.y, display.bounds.y, display.bounds.y + display.bounds.h))
    return distance(a) - distance(b)
  })
  const containing = nearest.find((display) => query.x >= display.workArea.x && query.x <= display.workArea.x + display.workArea.w)
    ?? nearest[0]!
  let minX = containing.workArea.x + margin
  let maxX = containing.workArea.x + containing.workArea.w - margin
  if (query.multiMonitor) {
    const row = displays.filter((display) => {
      const top = display.workArea.y
      const bottom = display.workArea.y + display.workArea.h
      const cTop = containing.workArea.y
      const cBottom = containing.workArea.y + containing.workArea.h
      return Math.min(bottom, cBottom) - Math.max(top, cTop) > 80
    })
    minX = Math.min(...row.map((display) => display.workArea.x + margin))
    maxX = Math.max(...row.map((display) => display.workArea.x + display.workArea.w - margin))
  }
  const displayUnder = nearest.find((display) => query.x >= display.workArea.x && query.x <= display.workArea.x + display.workArea.w) ?? containing
  const floorY = displayUnder.workArea.y + displayUnder.workArea.h - 8
  return {
    x: clamp(query.x, minX, maxX),
    floorY,
    minX,
    maxX,
    displayId: displayUnder.id,
  }
}

export function ledgeTarget(
  window: DesktopWindow,
  feet: { x: number; y: number },
  reach = 175,
): { x: number; y: number; surfaceId: string } | null {
  if (!window.onScreen || window.bounds.w < 220 || window.bounds.h < 80) return null
  const top = window.bounds.y
  const dy = feet.y - top
  if (dy < 28 || dy > reach) return null
  const center = window.bounds.x + window.bounds.w / 2
  if (Math.abs(center - feet.x) > 680) return null
  const x = clamp(center, window.bounds.x + 40, window.bounds.x + window.bounds.w - 40)
  return { x, y: top + 2, surfaceId: window.id }
}

/** A point on the window Pip can look at: the top-middle, where the title bar is. */
export function windowFocusPoint(window: DesktopWindow): { x: number; y: number } {
  return {
    x: window.bounds.x + window.bounds.w / 2,
    y: window.bounds.y + Math.min(72, window.bounds.h * 0.2),
  }
}

/** The window covers the space Pip is standing in, and there is room to step outside it. */
export function asideFrom(window: DesktopWindow, feetX: number, minX: number, maxX: number): number | null {
  const left = window.bounds.x - 56
  const right = window.bounds.x + window.bounds.w + 56
  const options = [left, right].filter((x) => x >= minX && x <= maxX)
  if (options.length === 0) return null
  return options.sort((a, b) => Math.abs(a - feetX) - Math.abs(b - feetX))[0] ?? null
}

export function coversPuppy(window: DesktopWindow, feet: { x: number; y: number }): boolean {
  const top = window.bounds.y
  const bottom = window.bounds.y + window.bounds.h
  const overlapsBody = bottom > feet.y - 130 && top < feet.y - 8
  const overlapsX = feet.x > window.bounds.x + 20 && feet.x < window.bounds.x + window.bounds.w - 20
  return overlapsBody && overlapsX
}

export function approachPoint(window: DesktopWindow, minX: number, maxX: number, floorY: number): { x: number; y: number } {
  const center = window.bounds.x + window.bounds.w / 2
  return { x: clamp(center, minX, maxX), y: floorY }
}

export function isFullscreenWindow(window: DesktopWindow, displays: DisplayInfo[]): boolean {
  return displays.some((display) => {
    const dw = Math.abs(window.bounds.w - display.bounds.w)
    const dh = Math.abs(window.bounds.h - display.bounds.h)
    return dw < 12 && dh < 12
  })
}
