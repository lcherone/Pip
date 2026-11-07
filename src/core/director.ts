import type { AnimationEngine } from './animation/engine'
import { getClip } from './animation/clips'
import type { MotionKind, MoveKind } from './movement'

export type Posture = 'standing' | 'sitting' | 'lying' | 'sleeping' | 'held' | 'ledge' | 'resting_ledge'
export type Gait = 'none' | 'walk' | 'trot' | 'run' | 'back' | 'jump' | 'climb'

export interface Performance {
  posture: Posture
  gait: Gait
  emote: string | null
  facing: number
  motion: MotionKind
  force: boolean
  token: number
  airborne: boolean
  justLanded: boolean
}

/** Physical motion owns the body; compatible expressions use their own layer. */
export function resolveClip(performance: Performance): string {
  if (performance.posture === 'held') return 'held'
  if (performance.justLanded) return performance.posture === 'ledge' || performance.posture === 'resting_ledge' ? 'land_ledge' : 'land'
  if (performance.motion === 'crouch') return 'jump'
  if (performance.motion === 'climb') return 'climb_window'
  if (performance.airborne || performance.motion === 'air') return 'jump'
  if (performance.motion === 'skid') return 'skid_stop'
  if (performance.motion === 'back') return 'back_away'
  if (performance.motion === 'run') return performance.emote === 'chase_cursor' ? 'chase_cursor' : 'run'
  if (performance.motion === 'trot') return 'trot'
  const travelEmote = performance.emote === 'approach_window' || performance.emote === 'sidestep'
  if (performance.motion === 'walk') {
    if (performance.posture === 'ledge' || performance.posture === 'resting_ledge') return 'walk_ledge'
    if (travelEmote) return performance.emote!
    return performance.facing < 0 ? 'walk_left' : 'walk_right'
  }
  if (!travelEmote && performance.emote && getClip(performance.emote)?.blend === 'base') return performance.emote
  // Prepare an upright posture before translation begins; the gait follows velocity.
  if (performance.gait !== 'none') return 'idle_stand'
  if (performance.posture === 'sleeping') return 'sleep_breathe'
  if (performance.posture === 'lying') return 'idle_lie'
  if (performance.posture === 'resting_ledge') return 'rest_ledge'
  if (performance.posture === 'ledge') return 'sit_ledge'
  if (performance.posture === 'sitting') return 'idle_sit'
  return 'idle_stand'
}

export class PerformanceDirector {
  private clipId = ''
  private token = -1
  private overlayId: string | null = null
  private overlayToken = -1
  private forced = false

  constructor(private engine: AnimationEngine) {}

  /** Called before movement, so standing up and landing never slide across the desk. */
  prepareMovement(performance: Performance): MoveKind {
    if (performance.posture === 'held') return 'held'
    if (performance.gait === 'none') return 'idle'
    if (performance.airborne) return performance.gait
    if (!performance.justLanded && performance.motion !== 'idle' && performance.motion !== 'skid') return performance.gait
    if (!this.engine.readyForMovement) {
      this.sync({ ...performance, posture: 'standing', gait: 'none', emote: null, motion: 'idle', force: false, justLanded: false })
      return 'idle'
    }
    return performance.gait
  }

  sync(performance: Performance): string {
    const overlay = performance.emote && getClip(performance.emote)?.blend === 'add' ? performance.emote : null
    if (overlay && (overlay !== this.overlayId || performance.token !== this.overlayToken)) {
      this.engine.play(overlay)
      this.overlayId = overlay
      this.overlayToken = performance.token
    }
    const id = resolveClip(performance)
    if (id !== this.clipId || performance.token !== this.token || this.engine.requestedClip !== id || (performance.force && !this.forced)) {
      const accepted = this.engine.play(id, { force: performance.force || performance.justLanded || performance.posture === 'held' })
      if (accepted) {
        this.clipId = id
        this.token = performance.token
      }
    }
    this.forced = performance.force
    return id
  }
}
