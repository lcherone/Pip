import { describe, expect, it } from 'vitest'
import type { DesktopWindow, DisplayInfo } from '../src/core/desktop'
import { ascentGait, edgeOccluded, emptyEnvironment, extractSurfaces, hydrateEnvironment, noteVisit, prioritise, readWorld, routeToWindow, type WorldInput } from '../src/core/world'

const display: DisplayInfo = {
  id: 'main',
  bounds: { x: 0, y: 0, w: 1400, h: 900 },
  workArea: { x: 0, y: 38, w: 1400, h: 790 },
  scaleFactor: 2,
}

function world(partial: Partial<WorldInput> = {}): WorldInput {
  return {
    now: 10,
    x: 120,
    y: 820,
    floorY: 820,
    minX: 40,
    maxX: 1360,
    windows: [],
    displays: [display],
    focusedApp: null,
    events: [],
    memory: emptyEnvironment(),
    traits: { curiosity: 0.7, playfulness: 0.5, sleepiness: 0.3, confidence: 0.6, energy: 0.8 },
    mode: 'chill',
    climbing: true,
    surfaceId: null,
    ...partial,
  }
}

function windowAt(id: string, x: number, y: number, w = 480, h = 220, app = id): DesktopWindow {
  return { id, app, displayId: 'main', bounds: { x, y, w, h }, focused: false, onScreen: true }
}

describe('desktop world', () => {
  it('builds measured surfaces and inferred chrome without inventing windows', () => {
    const view = readWorld(world({ windows: [windowAt('notes', 200, 500)] }))
    expect(view.surfaces.map((surface) => surface.app)).toEqual(['notes'])
    expect(view.surfaces[0]?.confidence).toBe(1)
    expect(view.menuBar?.h).toBe(38)
    expect(view.dock?.y).toBe(828)
    expect(view.dock && view.surfaces.some((surface) => surface.app === 'Dock')).toBe(false)
  })

  it('hides a top edge that is covered by a window in front', () => {
    const back = windowAt('back', 200, 480, 500, 260)
    const front = windowAt('front', 180, 360, 520, 300)
    const windows = [front, back]
    expect(edgeOccluded(windows, 1)).toBe(true)
    expect(edgeOccluded(windows, 0)).toBe(false)
    const surfaces = extractSurfaces(world({ windows }))
    expect(surfaces.find((surface) => surface.id === 'back')?.occluded).toBe(true)
    expect(routeToWindow(world({ windows }), back, surfaces).some((step) => step.surfaceId === 'back')).toBe(false)
  })

  it('routes a curious puppy onto a reachable top and only glances at a distant one', () => {
    const near = windowAt('editor', 180, 620, 460, 180)
    const far = windowAt('mail', 4000, 620, 200, 120)
    const climb = routeToWindow(world({ windows: [near] }), near)
    expect(climb.some((step) => step.gait === 'jump' || step.gait === 'climb')).toBe(true)
    expect(climb.at(-1)?.y).toBe(622)
    const view = readWorld(world({ windows: [far], focusedApp: null }))
    expect(view.attention?.glanceOnly).toBe(true)
    expect(view.goal).toBeNull()
  })

  it('decays interest, prefers one salient event, and remembers places by application', () => {
    const editor = windowAt('editor', 200, 600)
    const input = world({ windows: [editor], events: [{ type: 'window_opened', windowId: 'editor', app: 'editor', bounds: editor.bounds, source: 'sim' }] })
    const fresh = readWorld(input).attention?.salience ?? 0
    const tired = noteVisit(noteVisit(emptyEnvironment(), 'editor', 9), 'editor', 9.2)
    const stale = readWorld({ ...input, memory: tired, events: [] }).attention?.salience ?? 0
    expect(stale).toBeLessThan(fresh)
    const other = windowAt('other', 900, 600)
    const choice = prioritise([
      { type: 'window_moved', windowId: 'other', app: 'other', bounds: other.bounds, source: 'sim' },
      { type: 'window_opened', windowId: 'editor', app: 'editor', bounds: editor.bounds, source: 'sim' },
    ], [editor, other], { x: 220, y: 820 })
    expect(choice.chosen?.type).toBe('window_opened')
    expect(choice.dropped).toHaveLength(1)
    const saved = hydrateEnvironment(tired)
    expect(saved.visits[0]?.app).toBe('editor')
    expect(saved.visits[0]?.count).toBe(2)
  })

  it('refuses a climb that is too high for a cautious puppy and keeps a jump inside its reach', () => {
    expect(ascentGait(600, { curiosity: 0.2, playfulness: 0.2, sleepiness: 0.2, confidence: 0.2, energy: 0.8 }, true)?.gait).toBeUndefined()
    expect(ascentGait(140, { curiosity: 0.2, playfulness: 0.2, sleepiness: 0.2, confidence: 0.2, energy: 0.8 }, true)?.gait).toBe('jump')
    const high = windowAt('high', 200, 80, 400, 200)
    expect(routeToWindow(world({ traits: { curiosity: 0.4, playfulness: 0.2, sleepiness: 0.2, confidence: 0.2, energy: 0.8 } }), high).some((step) => step.surfaceId === 'high')).toBe(false)
  })

  it('drops a route when the supporting window is gone and stays calm in focus', () => {
    const editor = windowAt('editor', 200, 600)
    const focused = readWorld(world({ windows: [editor], mode: 'focus' }))
    expect(focused.goal).toBeNull()
    expect(focused.attention?.glanceOnly).toBe(true)
    const gone = readWorld(world({ windows: [], surfaceId: 'editor' }))
    expect(gone.surfaces).toHaveLength(0)
    expect(gone.goal).toBeNull()
  })
})
