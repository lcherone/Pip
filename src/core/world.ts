import { validRect } from './desktop'
import type { DeskEvent, DesktopWindow, DisplayInfo } from './desktop'
import type { Gait, Posture } from './director'
import { clamp, type Rect } from './math'
import type { PipMode } from './settings'

/**
 * One coordinate space: Electron top-left points, y down, already calibrated
 * from Cocoa by the desktop helper. Distances, collision and routes all use it.
 * Dock and menu-bar rectangles are inferred from the gap between a display's
 * bounds and its work area. They are not claimed as measured windows.
 */

export interface WorldTraits {
  curiosity: number
  playfulness: number
  sleepiness: number
  confidence: number
  energy: number
}

export interface VisitMemory {
  key: string
  app: string
  count: number
  last: number
  unstable: number
}

export interface EnvironmentMemory {
  visits: VisitMemory[]
  restingSpots: RestingSpot[]
}

export interface Surface {
  id: string
  windowId: string
  app: string
  x: number
  y: number
  width: number
  occluded: boolean
  confidence: number
  displayId: string
}

export interface NavNode {
  id: string
  x: number
  y: number
  surfaceId: string | null
  kind: 'here' | 'ground' | 'edge' | 'rest'
}

export interface RouteStep {
  x: number
  y: number
  surfaceId: string | null
  gait: Gait
  posture: Posture
  emote: string | null
  reason: string
}

export interface AttentionChoice {
  id?: string
  x: number
  y: number
  salience: number
  label: string
  glanceOnly: boolean
}

export interface SurroundingsBrief {
  pet: { state: string; mood: string; surface: string }
  environment: { activeApplication: string | null; nearbyWindows: number; interestingEvent: string | null }
}

export interface WorldView {
  surfaces: Surface[]
  nodes: NavNode[]
  attention: AttentionChoice | null
  goal: { app: string; windowId: string; reason: string; steps: RouteStep[] } | null
  dock: Rect | null
  menuBar: Rect | null
  brief: SurroundingsBrief
  objects: WorldObject[]
  affordances: Affordance[]
  graph: NavigationGraph
  observedAt: number
  activeGoal?: import('./behaviour').EnvironmentalGoal | null
  path?: RouteStep[]
  attentionState?: import('./attention').AttentionState
  perception?: { at: number; type: string; app?: string }[]
  goalHistory?: import('./behaviour').EnvironmentalGoal[]
  builds?: number
}

export interface WorldInput {
  now: number
  x: number
  y: number
  floorY: number
  minimumPerchY?: number
  minX: number
  maxX: number
  windows: DesktopWindow[]
  displays: DisplayInfo[]
  focusedApp: string | null
  events: DeskEvent[]
  memory: EnvironmentMemory
  traits: WorldTraits
  mode: PipMode
  climbing: boolean
  surfaceId: string | null
  petSize?: { w: number; h: number }
}

interface Edge {
  from: string
  to: string
  cost: number
  gait: Gait
}

export function emptyEnvironment(): EnvironmentMemory {
  return { visits: [], restingSpots: [] }
}

export function hydrateEnvironment(raw: unknown): EnvironmentMemory {
  if (!raw || typeof raw !== 'object') return emptyEnvironment()
  const visits = Array.isArray((raw as EnvironmentMemory).visits) ? (raw as EnvironmentMemory).visits : []
  const spots = Array.isArray((raw as EnvironmentMemory).restingSpots) ? (raw as EnvironmentMemory).restingSpots : []
  return {
    restingSpots: spots.filter(spot => spot && typeof spot.app === 'string' && ['ground', 'window_top'].includes(spot.surface) && Number.isFinite(spot.relativeX) && Number.isFinite(spot.relativeY)).slice(0, 24).map(spot => ({
      app: spot.app.slice(0, 80), displayId: String(spot.displayId ?? '').slice(0, 80), surface: spot.surface,
      relativeX: clamp(spot.relativeX, 0, 1), relativeY: clamp(spot.relativeY, 0, 1), comfort: clamp(Number(spot.comfort) || 0.5, 0, 1), count: clamp(Number(spot.count) || 1, 1, 100), last: Number.isFinite(spot.last) ? spot.last : 0,
    })),
    visits: visits.filter((visit) => visit && typeof visit.app === 'string' && typeof visit.key === 'string').slice(-40).map((visit) => ({
      key: String(visit.key).slice(0, 80),
      app: String(visit.app).slice(0, 80),
      count: clamp(Number(visit.count) || 0, 0, 100),
      last: Number.isFinite(visit.last) ? visit.last : 0,
      unstable: clamp(Number(visit.unstable) || 0, 0, 100),
    })),
  }
}

export function noteVisit(memory: EnvironmentMemory, app: string, now: number, unstable = false): EnvironmentMemory {
  if (!app) return memory
  const key = app.toLowerCase()
  const previous = memory.visits.find((visit) => visit.key === key)
  const next: VisitMemory = previous
    ? { ...previous, count: Math.min(100, previous.count + 1), last: now, unstable: Math.min(100, previous.unstable + (unstable ? 1 : 0)) }
    : { key, app, count: 1, last: now, unstable: unstable ? 1 : 0 }
  return { restingSpots: memory.restingSpots ?? [], visits: [next, ...memory.visits.filter((visit) => visit.key !== key)].slice(0, 40) }
}

/** A window earlier in the list is in front. Its body hides the edge behind it. */
export function edgeOccluded(windows: DesktopWindow[], index: number, atX?: number): boolean {
  const window = windows[index]
  if (!window) return true
  const y = window.bounds.y + 1
  const mid = atX ?? window.bounds.x + window.bounds.w / 2
  return windows.slice(0, index).some((front) => {
    if (!front.onScreen) return false
    const bounds = front.bounds
    return mid >= bounds.x && mid <= bounds.x + bounds.w && y >= bounds.y && y <= bounds.y + bounds.h
  })
}

export function extractSurfaces(input: Pick<WorldInput, 'windows' | 'minX' | 'maxX'>): Surface[] {
  return input.windows.map((window, index) => {
    const left = Math.max(window.bounds.x, input.minX)
    const right = Math.min(window.bounds.x + window.bounds.w, input.maxX)
    const offscreen = window.bounds.x < input.minX - 8 || window.bounds.x + window.bounds.w > input.maxX + 8
    const occluded = edgeOccluded(input.windows, index)
    return {
      id: window.id,
      windowId: window.id,
      app: window.app,
      x: window.bounds.x,
      y: window.bounds.y + 2,
      width: window.bounds.w,
      occluded: occluded || right - left < 80,
      confidence: !window.onScreen ? 0 : occluded ? 0.2 : offscreen ? 0.7 : 1,
      displayId: window.displayId,
    }
  }).filter((surface) => {
    const window = input.windows.find((item) => item.id === surface.windowId)
    return Boolean(window?.onScreen && window.kind !== 'popover' && validRect(window.bounds) && window.bounds.w >= 160 && window.bounds.h >= 80)
  })
}

export function inferredChrome(displays: DisplayInfo[]): { dock: Rect | null; menuBar: Rect | null } {
  const display = displays[0]
  if (!display) return { dock: null, menuBar: null }
  const menuHeight = display.workArea.y - display.bounds.y
  const dockHeight = display.bounds.y + display.bounds.h - (display.workArea.y + display.workArea.h)
  return {
    menuBar: menuHeight > 8 ? { x: display.bounds.x, y: display.bounds.y, w: display.bounds.w, h: menuHeight } : null,
    dock: dockHeight > 16 ? { x: display.workArea.x, y: display.workArea.y + display.workArea.h, w: display.workArea.w, h: dockHeight } : null,
  }
}

export function ascentGait(drop: number, traits: WorldTraits, climbing: boolean): { gait: Gait; risk: number } | null {
  if (drop < 24) return null
  if (drop <= 155) return { gait: 'jump', risk: 0.15 }
  if (drop <= 1400 && climbing && (drop < 420 || traits.confidence >= 0.35) && traits.sleepiness < 0.85) {
    return { gait: 'climb', risk: 0.35 + Math.max(0, 1 - traits.confidence) * 0.4 }
  }
  return null
}

function salience(window: DesktopWindow, input: WorldInput): number {
  // A tall window beside Pip is nearby even if its title bar is far overhead.
  const pointX = clamp(input.x, window.bounds.x, window.bounds.x + window.bounds.w)
  const pointY = clamp(input.y - 90, window.bounds.y, window.bounds.y + window.bounds.h)
  const distance = Math.hypot(pointX - input.x, pointY - (input.y - 90))
  const near = clamp(1 - distance / 980, 0, 1)
  const visit = input.memory.visits.find((item) => item.key === window.app.toLowerCase())
  const age = visit ? input.now - visit.last : 999
  const familiarity = visit ? clamp(1 - visit.count * 0.18 + age / 90, 0.08, 1) : 1
  const changed = input.events.some((event) => {
    if (event.type === 'window_opened' || event.type === 'window_moved' || event.type === 'window_resized') return event.windowId === window.id
    if (event.type === 'app_launched' || event.type === 'app_activated') return event.app === window.app
    return false
  })
  const novelty = changed ? Math.min(1, familiarity + 0.5) : familiarity
  const unstable = visit && visit.unstable > 3 && !changed ? 0.45 : 1
  const focus = window.focused || window.app === input.focusedApp ? 0.35 : 0
  const size = clamp(window.bounds.w / 900, 0.15, 1) * 0.25 * near
  return (near * (1.15 + novelty * input.traits.curiosity) + focus + size) * unstable
}

export function prioritise(events: DeskEvent[], windows: DesktopWindow[], origin: { x: number; y: number }): { chosen: DeskEvent | null; dropped: DeskEvent[] } {
  const ranked = events.map((event) => {
    const id = 'windowId' in event ? event.windowId : undefined
    const window = windows.find((item) => item.id === id || ('app' in event && item.app === event.app))
    const distance = window ? Math.hypot(window.bounds.x + window.bounds.w / 2 - origin.x, window.bounds.y - origin.y) : 1400
    const sudden = event.type === 'window_opened' || event.type === 'window_closed' || event.type === 'app_launched' ? 0.6 : 0.2
    return { event, score: sudden + clamp(1 - distance / 1000, 0, 1) }
  }).sort((a, b) => b.score - a.score)
  return { chosen: ranked[0]?.event ?? null, dropped: ranked.slice(1).map((item) => item.event) }
}

function nodesFor(input: WorldInput, surfaces: Surface[]): { nodes: NavNode[]; edges: Edge[] } {
  const hereY = input.surfaceId ? input.y : input.floorY
  const nodes: NavNode[] = [{ id: 'here', x: input.x, y: hereY, surfaceId: input.surfaceId, kind: 'here' }]
  const edges: Edge[] = []
  for (const surface of surfaces) {
    if ((surface.occluded || surface.confidence < 0.5) && surface.id !== input.surfaceId) continue
    if (surface.width < 220) continue
    const x = clamp(surface.x + surface.width / 2, Math.max(input.minX, surface.x + 40), Math.min(input.maxX, surface.x + surface.width - 40))
    const targetDisplay = input.displays.find(display => display.id === surface.displayId) ?? input.displays.find(display => x >= display.bounds.x && x <= display.bounds.x + display.bounds.w && surface.y >= display.bounds.y && surface.y <= display.bounds.y + display.bounds.h)
    const groundY = targetDisplay ? targetDisplay.workArea.y + targetDisplay.workArea.h - 8 : input.floorY
    const ground: NavNode = { id: `ground:${surface.id}`, x, y: groundY, surfaceId: null, kind: 'ground' }
    const top: NavNode = { id: `top:${surface.id}`, x, y: surface.y, surfaceId: surface.id, kind: 'edge' }
    nodes.push(ground, top)
    const drop = groundY - surface.y
    const display = input.displays.find(item => item.id === surface.displayId) ?? input.displays.find(item => x >= item.bounds.x && x <= item.bounds.x + item.bounds.w)
    const minimum = input.minimumPerchY ?? (display ? display.workArea.y + 12 : -Infinity)
    const rise = input.climbing && surface.y >= minimum ? ascentGait(drop, input.traits, true) : null
    if (rise && input.traits.energy > 0.2) {
      const caution = input.traits.sleepiness * 0.8 + (1 - input.traits.confidence) * 0.4
      edges.push({ from: ground.id, to: top.id, cost: drop / 130 + rise.risk + caution, gait: rise.gait })
    }
    edges.push({ from: top.id, to: ground.id, cost: Math.max(0, drop) / 200 + 0.3, gait: 'jump' })
    if (!input.surfaceId && groundConnected(input, input.x, input.floorY, ground.x, ground.y)) {
      edges.push({ from: 'here', to: ground.id, cost: Math.abs(ground.x - input.x) / 86 + 0.15, gait: input.traits.playfulness > 0.75 && input.traits.energy > 0.6 ? 'trot' : 'walk' })
    }
  }
  const tops = nodes.filter(node => node.kind === 'edge')
  for (const surface of surfaces.filter(item => !item.occluded && item.confidence >= 0.5)) {
    const top = tops.find(node => node.surfaceId === surface.id)
    if (!top) continue
    for (const [side, x] of [['left', surface.x + 40], ['right', surface.x + surface.width - 40]] as const) {
      if (x < input.minX || x > input.maxX || edgeOccluded(input.windows, input.windows.findIndex(window => window.id === surface.id), x)) continue
      const end: NavNode = { id: `${top.id}:${side}`, x, y: top.y, surfaceId: surface.id, kind: 'edge' }
      nodes.push(end)
      const cost = Math.abs(top.x - x) / 70 + 0.1
      edges.push({ from: top.id, to: end.id, cost, gait: 'walk' }, { from: end.id, to: top.id, cost, gait: 'walk' })
    }
  }
  const ends = nodes.filter(node => node.kind === 'edge' && /:(left|right)$/.test(node.id))
  for (const from of ends) for (const to of ends) {
    const rise = from.y - to.y
    const gap = Math.abs(to.x - from.x)
    if (from.surfaceId !== to.surfaceId && gap >= 35 && gap <= 155 && Math.abs(rise) <= 130 && input.climbing && input.traits.energy > 0.45 && input.traits.confidence > 0.55) {
      edges.push({ from: from.id, to: to.id, cost: 0.7 + gap / 200 + Math.abs(rise) / 150, gait: 'jump' })
    }
  }
  const groundNodes = nodes.filter(node => node.kind === 'ground')
  for (const from of groundNodes) {
    for (const to of groundNodes) {
      if (from.id !== to.id && groundConnected(input, from.x, from.y, to.x, to.y)) edges.push({ from: from.id, to: to.id, cost: Math.abs(to.x - from.x) / 86 + 0.15, gait: 'walk' })
    }
  }
  if (input.surfaceId) {
    const top = nodes.find((node) => node.surfaceId === input.surfaceId && node.kind === 'edge')
    if (top) edges.push({ from: 'here', to: top.id, cost: Math.abs(top.x - input.x) / 70 + 0.1, gait: 'walk' })
  }
  return { nodes, edges }
}

function astar(nodes: NavNode[], edges: Edge[], start: string, goal: string): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const open = new Set([start])
  const score = new Map<string, number>([[start, 0]])
  const total = new Map<string, number>([[start, Math.hypot((byId.get(goal)?.x ?? 0) - (byId.get(start)?.x ?? 0), (byId.get(goal)?.y ?? 0) - (byId.get(start)?.y ?? 0))]])
  const came = new Map<string, string>()
  while (open.size > 0) {
    const current = [...open].sort((a, b) => (total.get(a) ?? Infinity) - (total.get(b) ?? Infinity))[0]
    if (!current) break
    if (current === goal) {
      const path = [current]
      let cursor = current
      while (came.has(cursor)) {
        cursor = came.get(cursor)!
        path.push(cursor)
      }
      return path.reverse()
    }
    open.delete(current)
    for (const edge of edges) {
      if (edge.from !== current) continue
      const next = (score.get(current) ?? Infinity) + edge.cost
      if (next >= (score.get(edge.to) ?? Infinity)) continue
      came.set(edge.to, current)
      score.set(edge.to, next)
      const node = byId.get(edge.to)
      const end = byId.get(goal)
      const remaining = node && end ? Math.hypot(end.x - node.x, end.y - node.y) / 200 : 0
      total.set(edge.to, next + remaining)
      open.add(edge.to)
    }
  }
  return []
}

export function routeToWindow(input: WorldInput, window: DesktopWindow, surfaces = extractSurfaces(input), graph = navigationGraph(input, surfaces)): RouteStep[] {
  const { nodes, edges } = graph
  const surface = surfaces.find((item) => item.windowId === window.id)
  const wantsHeight = input.traits.sleepiness < 0.72 && input.traits.energy > 0.22 && surface && !surface.occluded
  const goalId = wantsHeight && nodes.some((node) => node.id === `top:${window.id}`) ? `top:${window.id}` : `ground:${window.id}`
  if (!nodes.some((node) => node.id === goalId)) return []
  let path = astar(nodes, edges, 'here', goalId)
  if (!path.length && goalId.startsWith('top:')) path = astar(nodes, edges, 'here', `ground:${window.id}`)
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const steps: RouteStep[] = []
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1]
    const to = path[index]
    const edge = edges.find((item) => item.from === from && item.to === to)
    const node = byId.get(to)
    if (!edge || !node) continue
    if (node.kind === 'ground' && Math.abs(node.x - input.x) <= 18 && !input.surfaceId && steps.length === 0) continue
    const climbing = edge.gait === 'climb' || edge.gait === 'jump'
    steps.push({
      x: node.x,
      y: node.y,
      surfaceId: node.surfaceId,
      gait: edge.gait,
      posture: node.kind === 'edge' ? 'ledge' : 'standing',
      emote: null,
      reason: node.kind === 'edge'
        ? `${climbing ? 'climbing' : 'stepping'} onto ${window.app}`
        : `going to look at ${window.app}`,
    })
  }
  return steps
}

/** Weighted curiosity: variation among visible, reachable places, with recent visits cooled. */
export function chooseWindow(input: WorldInput, random: () => number, recent: ReadonlySet<string> = new Set()): { window: DesktopWindow; steps: RouteStep[] } | null {
  const surfaces = extractSurfaces(input)
  const graph = navigationGraph(input, surfaces)
  let candidates = input.windows.filter(window => {
    const surface = surfaces.find(item => item.id === window.id)
    return window.onScreen && window.id !== input.surfaceId && surface && !surface.occluded && salience(window, input) >= 0.55
  })
  const fresh = candidates.filter(window => !recent.has(window.id))
  if (fresh.length) candidates = fresh
  else if (candidates.every(window => recent.has(window.id))) return null
  while (candidates.length) {
    const weighted = candidates.map(window => {
      const spot = (input.memory.restingSpots ?? []).find(item => item.app === window.app)
      const familiarComfort = spot && (input.traits.sleepiness > 0.5 || input.traits.energy < 0.45) ? 1 + spot.comfort : 1
      return { window, weight: Math.max(0.05, salience(window, input)) * familiarComfort }
    })
    const total = weighted.reduce((sum, item) => sum + item.weight, 0)
    let pick = clamp(random(), 0, 0.999999) * total
    let selected = weighted[weighted.length - 1]!.window
    for (const item of weighted) {
      pick -= item.weight
      if (pick <= 0) {
        selected = item.window
        break
      }
    }
    const steps = routeToWindow(input, selected, surfaces, graph)
    if (steps.length) return { window: selected, steps }
    candidates = candidates.filter(window => window.id !== selected.id)
  }
  return null
}

export function readWorld(input: WorldInput): WorldView {
  input = { ...input, windows: input.windows.filter(window => window && validRect(window.bounds)).slice(0, 64), displays: input.displays.filter(display => validRect(display.bounds) && validRect(display.workArea)) }
  const surfaces = extractSurfaces(input)
  const graph = navigationGraph(input, surfaces)
  const { nodes } = graph
  const chrome = inferredChrome(input.displays)
  const ranked = input.windows.filter((window) => window.onScreen).map((window) => ({ window, score: salience(window, input) })).sort((a, b) => b.score - a.score)
  const best = ranked[0]
  const calm = input.mode === 'focus' || input.mode === 'sleep'
  const attention: AttentionChoice | null = best ? {
    id: best.window.id,
    x: best.window.bounds.x + best.window.bounds.w / 2,
    y: best.window.bounds.y + 28,
    salience: best.score,
    label: best.window.app,
    glanceOnly: calm || best.score < 0.55,
  } : null
  let goal: WorldView['goal'] = null
  if (best && attention && !attention.glanceOnly) {
    const steps = routeToWindow(input, best.window, surfaces, graph)
    if (steps.length > 0) {
      goal = { app: best.window.app, windowId: best.window.id, reason: steps[0]?.reason ?? `interested in ${best.window.app}`, steps }
    }
  }
  const interesting = input.events.find((event) => event.type === 'window_opened' || event.type === 'window_moved' || event.type === 'app_activated')
  return {
    surfaces,
    nodes,
    graph,
    objects: worldObjects(input, surfaces),
    affordances: windowAffordances(input, surfaces),
    observedAt: input.now,
    attention,
    goal,
    dock: chrome.dock,
    menuBar: chrome.menuBar,
    brief: {
      pet: { state: input.surfaceId ? 'perched' : 'on the floor', mood: input.traits.curiosity > 0.65 ? 'curious' : input.traits.sleepiness > 0.6 ? 'sleepy' : 'calm', surface: input.surfaceId ?? 'floor' },
      environment: { activeApplication: input.focusedApp, nearbyWindows: surfaces.filter((surface) => !surface.occluded).length, interestingEvent: interesting?.type ?? null },
    },
  }
}

export interface RestingSpot {
  app: string
  displayId: string
  surface: 'ground' | 'window_top'
  relativeX: number
  relativeY: number
  comfort: number
  count: number
  last: number
}
export interface WorldObject {
  id: string
  type: 'display' | 'window' | 'popover' | 'title_bar' | 'corner' | 'edge' | 'intersection' | 'ground' | 'dock' | 'menu_bar' | 'pet'
  bounds: Rect
  displayId: string
  app: string | null
  visible: boolean
  zOrder: number
  confidence: number
  provenance: 'observed' | 'inferred'
  observedAt: number
  moving: boolean
  navigable: boolean
}
export interface Affordance {
  id: string
  windowId: string
  kind: 'sniff_corner' | 'look_up' | 'lean_side' | 'climb' | 'jump_up' | 'walk_edge' | 'perch' | 'rest' | 'jump_down'
  target: { x: number; y: number; surfaceId: string | null }
  feasible: boolean
  risk: number
  reason: string
}
export interface NavTransition extends Edge {
  kind: 'walk' | 'trot' | 'jump_up' | 'jump_down' | 'cross_surface' | 'climb'
  feasible: boolean
  risk: number
  animation: string
  orientation: number
  recovery: { x: number; y: number; reason: string }
}
export interface NavigationGraph { nodes: NavNode[]; edges: NavTransition[] }

function groundConnected(input: WorldInput, fromX: number, fromY: number, toX: number, toY: number): boolean {
  if (Math.abs(fromY - toY) > 120) return false
  if (!input.displays.length) return true
  const spans = input.displays.filter(display => Math.abs(display.workArea.y + display.workArea.h - 8 - fromY) <= 120)
    .map(display => [display.bounds.x, display.bounds.x + display.bounds.w]).sort((a, b) => a[0]! - b[0]!)
  let end = Math.min(fromX, toX)
  for (const [left, right] of spans) {
    if (left! > end + 48) return false
    if (right! >= end) end = right!
    if (end >= Math.max(fromX, toX)) return true
  }
  return false
}

export function navigationGraph(input: WorldInput, surfaces = extractSurfaces(input)): NavigationGraph {
  const graph = nodesFor(input, surfaces)
  const byId = new Map(graph.nodes.map(node => [node.id, node]))
  return { nodes: graph.nodes, edges: graph.edges.map(edge => {
    const from = byId.get(edge.from)!
    const to = byId.get(edge.to)!
    let kind: NavTransition['kind'] = edge.gait === 'climb' ? 'climb' : edge.gait === 'trot' ? 'trot' : 'walk'
    if (edge.gait === 'jump') kind = to.y < from.y ? 'jump_up' : 'jump_down'
    if (edge.gait === 'jump' && from.surfaceId && to.surfaceId && from.surfaceId !== to.surfaceId) kind = 'cross_surface'
    const risk = edge.gait === 'jump' ? 0.35 : edge.gait === 'climb' ? 0.5 : 0.05
    return { ...edge, kind, feasible: true, risk, animation: edge.gait === 'climb' ? 'climb_window' : edge.gait === 'jump' ? 'jump' : 'walk_right',
      orientation: Math.sign(to.x - from.x) || 1, recovery: { x: clamp(to.x, input.minX, input.maxX), y: input.floorY, reason: 'return to visible ground if the destination disappears' } }
  }) }
}

export function worldObjects(input: WorldInput, surfaces = extractSurfaces(input)): WorldObject[] {
  const objects: WorldObject[] = []
  const add = (object: Omit<WorldObject, 'observedAt'> & { observedAt?: number }) => objects.push({ ...object, observedAt: object.observedAt ?? input.now })
  for (const display of input.displays) {
    add({ id: `display:${display.id}`, type: 'display', bounds: display.bounds, displayId: display.id, app: null, visible: true, zOrder: -1, confidence: 1, provenance: 'observed', moving: false, navigable: false })
    add({ id: `ground:${display.id}`, type: 'ground', bounds: { x: display.workArea.x, y: display.workArea.y + display.workArea.h - 8, w: display.workArea.w, h: 8 }, displayId: display.id, app: null, visible: true, zOrder: -1, confidence: 0.95, provenance: 'inferred', moving: false, navigable: true })
    const chrome = inferredChrome([display])
    for (const [type, bounds] of [['dock', chrome.dock], ['menu_bar', chrome.menuBar]] as const) if (bounds) {
      add({ id: `${type}:${display.id}`, type, bounds, displayId: display.id, app: null, visible: true, zOrder: -1, confidence: 0.65, provenance: 'inferred', moving: false, navigable: false })
    }
  }
  input.windows.forEach((window, index) => {
    const surface = surfaces.find(item => item.id === window.id)
    const base = { observedAt: window.observedAt ?? input.now, displayId: window.displayId, app: window.app, visible: window.onScreen && !surface?.occluded, zOrder: window.zOrder ?? index, moving: Math.hypot(window.velocity?.x ?? 0, window.velocity?.y ?? 0) > 5 }
    add({ ...base, id: window.id, type: window.kind === 'popover' ? 'popover' : 'window', bounds: window.bounds, confidence: window.kind === 'popover' ? 0.55 : 1, provenance: window.kind === 'popover' ? 'inferred' : 'observed', navigable: false })
    add({ ...base, id: `${window.id}:title`, type: 'title_bar', bounds: { ...window.bounds, h: Math.min(28, window.bounds.h) }, confidence: 0.7, provenance: 'inferred', navigable: false })
    if (!surface) return
    add({ ...base, id: `${window.id}:top`, type: 'edge', bounds: { x: window.bounds.x, y: surface.y, w: window.bounds.w, h: 2 }, confidence: surface.confidence, provenance: 'inferred', navigable: !surface.occluded })
    for (const [name, x, y] of [['lower_left', window.bounds.x, window.bounds.y + window.bounds.h], ['lower_right', window.bounds.x + window.bounds.w, window.bounds.y + window.bounds.h], ['top_left', window.bounds.x, surface.y], ['top_right', window.bounds.x + window.bounds.w, surface.y]] as const) {
      add({ ...base, id: `${window.id}:${name}`, type: 'corner', bounds: { x: x - 3, y: y - 3, w: 6, h: 6 }, confidence: surface.confidence, provenance: 'inferred', navigable: false })
    }
    for (const front of input.windows.slice(0, index)) {
      const x = Math.max(front.bounds.x, window.bounds.x)
      const y = Math.max(front.bounds.y, window.bounds.y)
      const w = Math.min(front.bounds.x + front.bounds.w, window.bounds.x + window.bounds.w) - x
      const h = Math.min(front.bounds.y + front.bounds.h, window.bounds.y + window.bounds.h) - y
      if (w > 0 && h > 0) add({ ...base, id: `${window.id}:intersection:${front.id}`, type: 'intersection', bounds: { x, y, w, h }, confidence: 0.9, provenance: 'inferred', navigable: false })
    }
  })
  const size = input.petSize ?? { w: 120, h: 130 }
  add({ id: 'pip', type: 'pet', bounds: { x: input.x - size.w / 2, y: input.y - size.h, w: size.w, h: size.h }, displayId: input.displays.find(display => input.x >= display.bounds.x && input.x <= display.bounds.x + display.bounds.w)?.id ?? '', app: null, visible: true, zOrder: -1, confidence: 1, provenance: 'observed', moving: false, navigable: false })
  return objects.slice(0, 768)
}

export function windowAffordances(input: WorldInput, surfaces = extractSurfaces(input)): Affordance[] {
  const result: Affordance[] = []
  const width = input.petSize?.w ?? 120
  for (const surface of surfaces) {
    const window = input.windows.find(item => item.id === surface.id)!
    const stable = window.changedAt === undefined || input.now - window.changedAt > 6
    const visible = !surface.occluded && surface.confidence >= 0.5
    const x = clamp(input.x < surface.x + surface.width / 2 ? surface.x + 30 : surface.x + surface.width - 30, input.minX, input.maxX)
    const add = (kind: Affordance['kind'], target: Affordance['target'], feasible: boolean, risk: number, reason: string) => result.push({ id: `${surface.id}:${kind}`, windowId: surface.id, kind, target, feasible: visible && feasible, risk, reason })
    add('sniff_corner', { x, y: input.floorY, surfaceId: null }, true, 0.02, 'an exposed lower corner is a place to investigate')
    add('look_up', { x: surface.x + surface.width / 2, y: surface.y, surfaceId: null }, true, 0, 'look towards the title bar before choosing a route')
    add('lean_side', { x, y: input.floorY, surfaceId: null }, surface.width > width * 1.5, 0.05, 'a broad visible frame can be inspected with a paw')
    const rise = ascentGait(input.floorY - surface.y, input.traits, input.climbing)
    const headroom = surface.y >= (input.minimumPerchY ?? -Infinity)
    add(rise?.gait === 'jump' ? 'jump_up' : 'climb', { x: surface.x + surface.width / 2, y: surface.y, surfaceId: surface.id }, Boolean(input.climbing && rise && headroom && input.traits.energy > 0.2), rise?.risk ?? 1, 'height, energy and confidence determine whether the edge is reachable')
    add('walk_edge', { x: surface.x + surface.width * 0.65, y: surface.y, surfaceId: surface.id }, surface.width > width * 2 && stable, 0.15, 'enough stable exposed edge for careful walking')
    add('perch', { x: surface.x + surface.width / 2, y: surface.y, surfaceId: surface.id }, surface.width > width * 1.5 && headroom, 0.1, 'a visible edge with room for the puppy')
    add('rest', { x: surface.x + surface.width / 2, y: surface.y, surfaceId: surface.id }, stable && surface.width > width * 2.5 && headroom, 0.05, 'only a wide stable edge is suitable for resting')
    add('jump_down', { x: clamp(input.x, input.minX, input.maxX), y: input.floorY, surfaceId: null }, input.surfaceId === surface.id, 0.2, 'return to ground before leaving a platform')
  }
  return result
}

export function rememberRest(memory: EnvironmentMemory, input: WorldInput): EnvironmentMemory {
  const window = input.windows.find(item => item.id === input.surfaceId)
  const display = input.displays.find(item => input.x >= item.bounds.x && input.x <= item.bounds.x + item.bounds.w && input.y >= item.bounds.y && input.y <= item.bounds.y + item.bounds.h) ?? input.displays[0]
  const bounds = window?.bounds ?? display?.workArea
  if (!bounds) return memory
  const surface = window ? 'window_top' : 'ground'
  const app = window?.app ?? input.focusedApp ?? 'Desktop'
  const relativeX = clamp((input.x - bounds.x) / bounds.w, 0, 1)
  const previous = (memory.restingSpots ?? []).find(spot => spot.app === app && spot.surface === surface && spot.displayId === (display?.id ?? '') && Math.abs(spot.relativeX - relativeX) < 0.2)
  const spot: RestingSpot = { app, surface, displayId: display?.id ?? '', relativeX, relativeY: clamp((input.y - bounds.y) / bounds.h, 0, 1), comfort: Math.min(1, (previous?.comfort ?? 0.4) + 0.08), count: Math.min(100, (previous?.count ?? 0) + 1), last: input.now }
  return { ...memory, restingSpots: [spot, ...(memory.restingSpots ?? []).filter(item => item !== previous)].slice(0, 24) }
}

/** Restore relationships to current geometry, never to an old native window ID. */
export function restingLocations(input: WorldInput): { x: number; y: number; surfaceId: string | null; app: string; comfort: number }[] {
  const locations: { x: number; y: number; surfaceId: string | null; app: string; comfort: number }[] = []
  const surfaces = extractSurfaces(input)
  for (const spot of input.memory.restingSpots ?? []) {
    if (spot.surface === 'window_top') {
      const surface = surfaces.find(item => item.app === spot.app && !item.occluded && item.width >= 300)
      const window = input.windows.find(item => item.id === surface?.id)
      if (!surface || !window || (window.changedAt !== undefined && input.now - window.changedAt < 8)) continue
      locations.push({ x: clamp(surface.x + surface.width * spot.relativeX, surface.x + 45, surface.x + surface.width - 45), y: surface.y, surfaceId: surface.id, app: spot.app, comfort: spot.comfort })
    } else {
      const display = input.displays.find(item => item.id === spot.displayId) ?? input.displays[0]
      if (!display) continue
      const x = clamp(display.workArea.x + display.workArea.w * spot.relativeX, input.minX, input.maxX)
      const y = display.workArea.y + display.workArea.h - 8
      if (groundConnected(input, input.x, input.floorY, x, y)) locations.push({ x, y, surfaceId: null, app: spot.app, comfort: spot.comfort })
    }
  }
  return locations.sort((a, b) => (Math.hypot(a.x - input.x, a.y - input.y) / 500 - a.comfort) - (Math.hypot(b.x - input.x, b.y - input.y) / 500 - b.comfort))
}
