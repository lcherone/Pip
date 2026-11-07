import type { AscentFrame } from '../core/ascent'
import type { WorldView } from '../core/world'
import type { Pose } from '../core/pose'

export interface WorldDebugSnapshot {
  at: number
  world: WorldView
  movement: { ascent?: AscentFrame | null; x: number; y: number; vx: number; vy: number; surfaceId: string | null; airborne: boolean; motion: string; recovered: boolean }
  pose: Pose
  action: string
  reason: string
  capabilities: { geometry: 'available' | 'limited'; accessibility: 'available' | 'unavailable'; detailedContent: false }
}
