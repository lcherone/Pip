import type { DesktopWindow, DisplayInfo } from './desktop'

export const WORLD_SCENARIOS = ['One window', 'Overlapping windows', 'Scattered windows', 'Moving support', 'Resizing window', 'Closing support', 'Multiple displays', 'No windows', 'Fullscreen', 'Partially offscreen', 'Rapid focus switching', 'Dynamic overlap', 'No accessibility'] as const
export type WorldScenarioName = typeof WORLD_SCENARIOS[number]
export interface WorldScenario {
  displays: DisplayInfo[]
  windows: DesktopWindow[]
  start: { x: number; y: number; surfaceId: string | null }
  fullscreen: boolean
  accessibility: boolean
}

export function worldScenario(name: WorldScenarioName, elapsed = 0): WorldScenario {
  const display: DisplayInfo = { id: 'sim', bounds: { x: 0, y: 0, w: 980, h: 620 }, workArea: { x: 30, y: 36, w: 920, h: 520 }, scaleFactor: 2 }
  const make = (id: string, x: number, y: number, w = 420, h = 180): DesktopWindow => ({ id, app: id, displayId: x < 0 ? 'left' : 'sim', bounds: { x, y, w, h }, focused: false, onScreen: true })
  const scene: WorldScenario = { displays: [display], windows: [make('Editor', 180, 360)], start: { x: 120, y: 548, surfaceId: null }, fullscreen: false, accessibility: true }
  if (name === 'Overlapping windows') scene.windows = [make('Notes', 200, 300, 520, 240), make('Browser', 260, 400, 400, 160)]
  if (name === 'Scattered windows' || name === 'Rapid focus switching') scene.windows = [make('Notes', 60, 330, 260, 200), make('Editor', 360, 260, 280, 280), make('Browser', 680, 400, 240, 140)]
  if (name === 'Moving support') {
    scene.windows = [make('Editor', 180 + Math.sin(elapsed * 0.65) * 110, 360 + Math.sin(elapsed * 0.8) * 20)]
    scene.start = { x: 390, y: 362, surfaceId: 'Editor' }
  }
  if (name === 'Resizing window') scene.windows = [make('Editor', 180, 360, 320 + Math.sin(elapsed * 0.7) * 100, 180)]
  if (name === 'Closing support') {
    scene.windows = elapsed < 5 ? [make('Editor', 180, 360)] : []
    scene.start = { x: 390, y: 362, surfaceId: 'Editor' }
  }
  if (name === 'Multiple displays') {
    scene.displays = [{ ...display, id: 'left', bounds: { x: -980, y: 0, w: 980, h: 620 }, workArea: { x: -950, y: 36, w: 920, h: 520 }, scaleFactor: 1 }, display]
    scene.windows = [make('Notes', -700, 360), make('Editor', 280, 330)]
    scene.start = { x: -820, y: 548, surfaceId: null }
  }
  if (name === 'No windows') scene.windows = []
  if (name === 'Fullscreen') { scene.windows = [make('Browser', 0, 0, 980, 620)]; scene.fullscreen = true }
  if (name === 'Partially offscreen') scene.windows = [make('Notes', -180, 360, 500, 180)]
  if (name === 'Rapid focus switching') scene.windows.forEach((window, index) => { window.focused = index === Math.floor(elapsed / 0.6) % scene.windows.length })
  if (name === 'Dynamic overlap') scene.windows = [make('Moving notes', 100 + Math.sin(elapsed * 0.7) * 220, 260, 400, 280), make('Editor', 300, 380, 400, 180)]
  if (name === 'No accessibility') scene.accessibility = false
  if (!scene.windows.some(window => window.focused) && scene.windows[0]) scene.windows[0].focused = true
  return scene
}
