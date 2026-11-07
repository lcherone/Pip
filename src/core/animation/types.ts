import type { BodyState, Pose, PoseKey } from '../pose'

export type ClipCategory = 'idle' | 'movement' | 'rest' | 'emotion' | 'desktop'

export interface SampleCtx {
  phase: number
  time: number
}

export interface ClipMarker {
  at: number
  name: string
}

export interface Clip {
  id: string
  category: ClipCategory
  duration: number
  loop: boolean
  interruptibility: number
  priority: number
  from: BodyState[]
  end: BodyState | null
  blend: 'base' | 'add'
  slot: 'base' | 'face' | 'ears' | 'tail' | 'body'
  locks: PoseKey[]
  playback: { speed: number }
  markers?: ClipMarker[]
  sample: (u: number, ctx: SampleCtx) => Pose | Partial<Pose>
}

export interface ClipMeta {
  id: string
  category: ClipCategory
  duration: number
  loop: boolean
  interruptibility: number
  priority: number
  from: BodyState[]
  end: BodyState | null
  blend: 'base' | 'add'
  playback: { speed: number }
}
