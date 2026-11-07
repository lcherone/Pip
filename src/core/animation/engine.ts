import type { AscentFrame } from '../ascent'
import { clamp, smoothstep, springStep, type Spring } from '../math'
import { clonePose, finitePose, lerpPose, POSE_KEYS, poseFrom, type BodyState, type Pose, type PoseKey } from '../pose'
import { getClip, transitionPath } from './clips'
import { applyVariation } from './variation'
import type { Clip, SampleCtx } from './types'

export interface AnimContext {
  ascent?: AscentFrame | null
  phase: number
  time: number
  targetYaw?: number
  look?: { x: number; y: number } | null
  headLook?: { x: number; y: number } | null
  balance?: number
  mood?: Mood
  applyMood?: boolean
  airborne?: boolean
  held?: boolean
  autoBlink?: boolean
}

export type Mood = 'happy' | 'curious' | 'excited' | 'sleepy' | 'sad' | 'playful' | 'calm' | 'proud' | 'confused'

interface ActiveClip {
  id: string
  time: number
  weight: number
  speed: number
  loop: boolean
  fired: Set<string>
  finished: boolean
  variation: number
  variationAge: number
}

const SPRUNG: PoseKey[] = ['headRot', 'headTilt', 'earL', 'earR', 'tailLift', 'bodyRot', 'yaw']

export interface EngineDebug {
  body: BodyState
  clips: { id: string; weight: number; time: number; slot: string }[]
  transitioning: boolean
  blendDuration: number
  locks: PoseKey[]
  marker: string | null
  markers: string[]
}

export interface PlaybackOptions {
  force?: boolean
  speed?: number
  once?: boolean
}

export interface AnimationFrame {
  pose: Pose
  completed: string | null
  completedIds: string[]
  time: number
  tailPhase: number
  debug: EngineDebug
}

export class AnimationEngine {
  bodyState: BodyState = 'sitting'
  timeScale = 1
  paused = false
  private base: ActiveClip | null = null
  private outgoing: ActiveClip | null = null
  private earRelease = 0
  private overlays = new Map<string, ActiveClip>()
  private queue: string[] = []
  private goal: string | null = null
  private pending: { id: string; opts?: PlaybackOptions } | null = null
  private goalSpeed = 1
  private onceGoal = false
  private transitionDurations: Record<string, number> = {}
  private blendDuration = 0.18
  private display: Pose = poseFrom({ sit: 1, tailLift: 32, mouth: 0.3, breath: 1 })
  private springs = new Map<PoseKey, Spring>()
  private blinkIn = 2.8
  private blinkU = -1
  private blinkKind: 'single' | 'double' = 'single'
  private clock = 0
  private tailPhase = 0
  private variationSerial = 0
  lastCompleted: string | null = null

  constructor() {
    for (const key of SPRUNG) this.springs.set(key, { value: this.display[key], velocity: 0 })
    this.play('idle_sit')
  }

  play(id: string, opts?: PlaybackOptions): boolean {
    const clip = getClip(id)
    if (!clip) throw new Error(`Unknown animation: ${id}`)
    if (clip.blend === 'add') {
      this.overlays.set(clip.slot, {
        id,
        time: 0,
        weight: 1,
        speed: opts?.speed ?? clip.playback.speed,
        loop: opts?.once ? false : clip.loop,
        fired: new Set(),
        finished: false,
        variation: 0,
        variationAge: 0,
      })
      return true
    }
    const duration = clip.duration
    const running = this.base && this.base.id === id && (this.base.loop || this.base.time < duration - 0.02)
    if (this.goal === id && (running || this.queue.length > 0) && !opts?.force) return true
    if (opts?.force || !this.base || this.canInterrupt(clip)) {
      this.pending = null
      this.begin(id, opts)
      return true
    }
    if (this.base && !this.base.loop) {
      this.pending = { id, opts }
      return true
    }
    return false
  }

  private begin(id: string, opts?: PlaybackOptions): void {
    const clip = getClip(id)
    if (!clip) return
    // Picking Pip up is a physical override, including when he is asleep.
    if (id === 'held' && opts?.force) this.bodyState = 'held'
    const preferred = clip.from.includes(this.bodyState) ? null : (clip.from[0] ?? 'standing')
    const path = preferred ? transitionPath(this.bodyState, preferred) : []
    const steps = path[path.length - 1] === id ? path.slice() : [...path, id]
    this.queue = steps.length > 0 ? steps : [id]
    this.goal = id
    this.onceGoal = Boolean(opts?.once)
    this.goalSpeed = opts?.speed ?? clip.playback.speed
    this.startNext()
  }

  reset(state: BodyState = 'sitting'): void {
    this.bodyState = state
    this.base = null
    this.earRelease = 0
    this.outgoing = null
    this.overlays.clear()
    this.queue = []
    this.goal = null
    this.pending = null
    this.onceGoal = false
    this.goalSpeed = 1
    this.clock = 0
    this.tailPhase = 0
    this.variationSerial = 0
    this.blinkIn = 2.8
    this.blinkU = -1
    this.lastCompleted = null
    this.display = poseFrom(state === 'sleeping' ? { lie: 1, curl: 0.9, eyeL: 0, eyeR: 0, sit: 0 } : state === 'lying' ? { lie: 1 } : state === 'standing' ? { sit: 0 } : { sit: 1 })
    for (const key of SPRUNG) this.springs.set(key, { value: this.display[key], velocity: 0 })
    const idle = state === 'sleeping' ? 'sleep_breathe' : state === 'lying' ? 'idle_lie' : state === 'standing' ? 'idle_stand' : state === 'ledge' ? 'sit_ledge' : 'idle_sit'
    this.play(idle)
  }

  setTransitionDurations(durations: Record<string, number>): void {
    this.transitionDurations = {}
    for (const [id, duration] of Object.entries(durations)) {
      if (getClip(id) && Number.isFinite(duration)) this.transitionDurations[id] = clamp(duration, 0.18, 0.48)
    }
  }

  get requestedClip(): string | null {
    return this.pending?.id ?? this.goal
  }

  /** Locomotion waits for posture bridges and landing recovery to finish. */
  get readyForMovement(): boolean {
    if (this.queue.length > 0 || this.outgoing || Math.abs(this.display.trickRot) > 3) return false
    if (this.bodyState !== 'standing' && this.bodyState !== 'ledge') return false
    const clip = this.base && getClip(this.base.id)
    const travelling = Boolean(clip?.loop && (clip.category === 'movement' || clip.id === 'approach_window' || clip.id === 'follow_window' || clip.id === 'sidestep' || clip.id === 'walk_ledge'))
    return !clip || this.base?.finished === true || clip.id === 'idle_stand' || clip.id === 'sit_ledge' || travelling
  }

  update(dt: number, ctx: AnimContext = { phase: 0, time: 0 }): AnimationFrame {
    const elapsed = this.paused || !Number.isFinite(dt) ? 0 : clamp(dt, 0, 1) * clamp(this.timeScale, 0, 4)
    const completedIds: string[] = []
    const markers: string[] = []
    this.lastCompleted = null
    // Integrate all ordinary low-FPS elapsed time without destabilising springs.
    let remaining = elapsed
    while (remaining > 1e-9) {
      const step = Math.min(1 / 60, remaining)
      remaining -= step
      this.tick(step, ctx, completedIds, markers)
    }
    this.lastCompleted = completedIds.at(-1) ?? null
    return {
      pose: clonePose(this.display),
      completed: this.lastCompleted,
      completedIds,
      time: this.clock,
      tailPhase: this.tailPhase,
      debug: {
        body: this.bodyState,
        clips: this.debugClips(),
        transitioning: Boolean(this.outgoing),
        blendDuration: this.blendDuration,
        locks: this.activeLocks(),
        marker: markers.at(-1) ?? null,
        markers,
      },
    }
  }

  private tick(step: number, ctx: AnimContext, completed: string[], markers: string[]): void {
    this.clock += step
    this.advance(this.base, step, (name) => markers.push(name))
    if (this.base && !this.base.finished && this.base.time >= (getClip(this.base.id)?.duration ?? 1) && !this.base.loop) {
      const finished = getClip(this.base.id)
      const finishedId = this.base.id
      this.base.finished = true
      if (finished?.end) this.bodyState = finished.end
      if (this.queue.length > 0) this.startNext()
      else {
        if (finishedId === this.goal) completed.push(finishedId)
        if (this.pending) {
          const next = this.pending
          this.pending = null
          this.begin(next.id, next.opts)
        }
      }
    }
    this.earRelease = this.base?.finished ? this.earRelease + step : 0
    if (this.outgoing) {
      this.outgoing.weight = Math.max(0, this.outgoing.weight - step / this.blendDuration)
      if (this.outgoing.weight <= 0) this.outgoing = null
    }
    if (this.base && this.base.weight < 1) this.base.weight = Math.min(1, this.base.weight + step / this.blendDuration)

    for (const [slot, active] of this.overlays) {
      this.advance(active, step, (name) => markers.push(name))
      const clip = getClip(active.id)
      if (clip && active.time >= clip.duration && !active.loop) {
        completed.push(active.id)
        this.overlays.delete(slot)
      }
    }

    const target = this.compose(ctx)
    this.applyProcedural(target, ctx, step)
    this.follow(target, step)
    if (!finitePose(this.display)) this.display = clonePose(target)
    this.tailPhase = (this.tailPhase + step * (3.2 + this.display.tailWag * 0.18)) % (Math.PI * 2)
  }

  private canInterrupt(incoming: Clip): boolean {
    if (!this.base || this.base.finished) return true
    const current = getClip(this.base.id)
    if (!current) return true
    if (this.bodyState === 'sleeping' && current.interruptibility <= 0.2) {
      if (incoming.priority >= 9) return true
      return incoming.from.includes('sleeping') && incoming.end === 'sleeping'
    }
    if (incoming.priority >= current.priority + 3) return true
    return current.interruptibility >= 0.45
  }

  private startNext(): void {
    const id = this.queue.shift()
    if (!id) return
    const clip = getClip(id)
    if (!clip) return
    if (this.base) this.outgoing = { ...this.base, weight: 1 }
    this.blendDuration = this.transitionDurations[id] ?? 0.18
    const isGoal = id === this.goal
    this.earRelease = 0
    this.base = {
      id,
      time: 0,
      weight: this.outgoing ? 0 : 1,
      speed: isGoal ? this.goalSpeed : clip.playback.speed,
      loop: clip.loop && !(isGoal && this.onceGoal),
      fired: new Set(),
      finished: false,
      variation: this.variationSerial++,
      variationAge: 0,
    }
  }

  private advance(active: ActiveClip | null, dt: number, onMarker: (name: string) => void): void {
    if (!active || dt <= 0) return
    active.variationAge += dt
    if (active.variationAge >= 2.4) {
      active.variationAge -= 2.4
      active.variation += 1
    }
    const clip = getClip(active.id)
    if (!clip) return
    if (active.finished) return
    let remaining = dt * active.speed
    while (remaining > 1e-9) {
      const before = active.time / clip.duration
      const consumed = Math.min(remaining, Math.max(0, clip.duration - active.time))
      active.time += consumed
      remaining -= consumed
      const after = active.time / clip.duration
      for (const marker of clip.markers ?? []) {
        if (!active.fired.has(marker.name) && before <= marker.at && after >= marker.at) {
          active.fired.add(marker.name)
          onMarker(marker.name)
        }
      }
      if (active.time < clip.duration - 1e-9 || !active.loop) break
      active.time = 0
      active.fired.clear()
      if (clip.end && active === this.base) this.bodyState = clip.end
    }
  }

  private compose(ctx: AnimContext): Pose {
    const sampleCtx: SampleCtx = { phase: ctx.phase, time: this.clock, ascent: ctx.ascent }
    const settled = !this.outgoing
    const basePose = this.sampleBase(this.base, sampleCtx, settled) ?? poseFrom({ sit: 1 })
    if (this.base?.finished) {
      const release = 1 - smoothstep(this.earRelease / 0.35)
      basePose.earL *= release
      basePose.earR *= release
    }
    let pose = basePose
    if (this.outgoing && this.base) {
      const previous = this.sampleBase(this.outgoing, sampleCtx, false) ?? basePose
      pose = lerpPose(previous, basePose, this.base.weight)
    }
    for (const active of this.overlays.values()) {
      const clip = getClip(active.id)
      if (!clip) continue
      const delta = clip.sample(clamp(active.time / clip.duration, 0, 0.999), sampleCtx)
      for (const key of Object.keys(delta) as PoseKey[]) {
        const value = delta[key]
        if (value === undefined) continue
        pose[key] += value * active.weight
      }
    }
    containPose(pose)
    return pose
  }

  private sampleBase(active: ActiveClip | null, ctx: SampleCtx, vary: boolean): Pose | null {
    if (!active) return null
    const clip = getClip(active.id)
    if (!clip || clip.blend !== 'base') return null
    const sampled = clip.sample(clamp(active.time / clip.duration, 0, 0.999), ctx)
    const pose = poseFrom(sampled as Pose)
    if (vary) applyVariation(pose, clip, active.variation)
    return pose
  }

  private applyProcedural(pose: Pose, ctx: AnimContext, dt: number): void {
    const locks = new Set(this.activeLocks())
    if (ctx.airborne) {
      pose.trickRot = 0
      pose.trickPivot = 0
      pose.air = Math.max(pose.air, 1)
      pose.sit = Math.min(pose.sit, 0.15)
      pose.lie = 0
      pose.curl = 0
      pose.ledge = 0
      pose.held = 0
      pose.legFL = Math.min(pose.legFL, -12)
      pose.legFR = Math.min(pose.legFR, -10)
    }
    if (ctx.held) {
      pose.reachFL = 0
      pose.reachFR = 0
      pose.trickRot = 0
      pose.trickPivot = 0
      pose.held = 1
      pose.sit = 0
      pose.lie = 0
      pose.curl = 0
      pose.ledge = 0
      pose.danglers = 1
      pose.air = 0.8
      pose.bodyY = -12
      pose.bodyRot = -16 * ((ctx.targetYaw ?? pose.yaw) >= 0 ? 1 : -1)
      pose.legFL = 0
      pose.legFR = 0
      pose.legBL = 0
      pose.legBR = 0
    }
    if (typeof ctx.targetYaw === 'number' && !locks.has('yaw')) pose.yaw = ctx.targetYaw
    if (ctx.balance) pose.bodyRot += clamp(ctx.balance, -8, 8)
    if (ctx.look && !locks.has('pupilX')) {
      pose.pupilX = clamp(ctx.look.x / 110, -1, 1)
      pose.pupilY = clamp(ctx.look.y / 120, -1, 1)
    }
    const headLook = ctx.headLook === undefined ? ctx.look : ctx.headLook
    if (headLook && !locks.has('headRot')) {
      pose.headRot = clamp(headLook.x / 11, -20, 20)
    }
    if (headLook && !locks.has('headTilt')) {
      pose.headTilt = clamp(-headLook.y / 14, -14, 16)
    }
    if (ctx.applyMood && ctx.mood) applyMood(pose, ctx.mood, locks)
    if (ctx.autoBlink && !locks.has('eyeL')) {
      this.blinkIn -= dt
      if (this.blinkU < 0 && this.blinkIn <= 0) {
        this.blinkKind = this.blinkIn < -0.2 ? 'double' : 'single'
        this.blinkU = 0
        this.blinkIn = 2.6 + (this.clock % 1.7)
      }
      if (this.blinkU >= 0) {
        this.blinkU += dt / (this.blinkKind === 'double' ? 0.7 : 0.45)
        const env = this.blinkKind === 'double'
          ? Math.max(Math.sin(clamp(this.blinkU / 0.45, 0, 1) * Math.PI) * (this.blinkU < 0.5 ? 1 : 0), this.blinkU > 0.48 ? Math.sin(clamp((this.blinkU - 0.48) / 0.45, 0, 1) * Math.PI) : 0)
          : Math.sin(clamp(this.blinkU, 0, 1) * Math.PI)
        pose.eyeL = clamp(pose.eyeL - env, 0, 1)
        pose.eyeR = clamp(pose.eyeR - env, 0, 1)
        if (this.blinkU >= 1) this.blinkU = -1
      }
    }
  }

  private follow(target: Pose, dt: number): void {
    if (dt <= 0) {
      this.display = clonePose(target)
      return
    }
    const next = clonePose(target)
    for (const key of SPRUNG) {
      const spring = this.springs.get(key) ?? { value: target[key], velocity: 0 }
      const freq = key === 'yaw' ? 4.5 : key.startsWith('ear') ? 7.5 : key === 'tailLift' ? 5.5 : 8
      springStep(spring, target[key], dt, freq, key.startsWith('ear') ? 0.62 : 0.78)
      const limit = POSE_LIMITS[key]
      if (limit && (spring.value < limit[0] || spring.value > limit[1])) {
        spring.value = clamp(spring.value, limit[0], limit[1])
        spring.velocity *= 0.2
      }
      this.springs.set(key, spring)
      next[key] = spring.value
    }
    containPose(next)
    this.display = next
  }

  private activeLocks(): PoseKey[] {
    const locks = new Set<PoseKey>()
    const collect = (active: ActiveClip | null) => {
      if (!active) return
      const clip = getClip(active.id)
      if (!clip) return
      for (const key of clip.locks) locks.add(key)
    }
    collect(this.base)
    for (const overlay of this.overlays.values()) collect(overlay)
    return [...locks]
  }

  private debugClips(): EngineDebug['clips'] {
    const clips: EngineDebug['clips'] = []
    if (this.base) clips.push({ id: this.base.id, weight: this.base.weight, time: this.base.time, slot: 'base' })
    if (this.outgoing) clips.push({ id: this.outgoing.id, weight: this.outgoing.weight, time: this.outgoing.time, slot: 'outgoing' })
    for (const [slot, active] of this.overlays) clips.push({ id: active.id, weight: active.weight, time: active.time, slot })
    return clips
  }
}

const POSE_LIMITS: Partial<Record<PoseKey, [number, number]>> = {
  reachFL: [0, 1],
  reachFR: [0, 1],
  headRot: [-48, 48],
  headTilt: [-36, 36],
  bodyRot: [-32, 32],
  trickRot: [-185, 185],
  trickPivot: [-1, 1],
  earL: [-70, 70],
  earR: [-70, 70],
  tailLift: [-20, 80],
  squash: [0.62, 1.35],
  stretch: [0.75, 1.35],
  yaw: [-1.25, 1.25],
  eyeL: [0, 1],
  eyeR: [0, 1],
}

function containPose(pose: Pose): void {
  for (const key of POSE_KEYS) {
    const value = pose[key]
    pose[key] = Number.isFinite(value) ? value : 0
    const limit = POSE_LIMITS[key]
    if (limit) pose[key] = clamp(pose[key], limit[0], limit[1])
  }
}

function applyMood(pose: Pose, mood: Mood, locks: Set<PoseKey>): void {
  const wag = mood === 'excited' ? 28 : mood === 'playful' ? 22 : mood === 'happy' ? 16 : mood === 'proud' ? 12 : mood === 'curious' ? 8 : mood === 'calm' ? 5 : mood === 'confused' ? 2 : 0
  if (!locks.has('tailWag')) pose.tailWag = mood === 'sad' || mood === 'sleepy' ? Math.min(pose.tailWag, 1) : Math.max(pose.tailWag, wag)
  if ((mood === 'sad' || mood === 'sleepy') && !locks.has('tailLift')) pose.tailLift = Math.min(pose.tailLift, mood === 'sad' ? 8 : 14)
  if (mood === 'curious' && !locks.has('alert')) pose.alert = Math.max(pose.alert, 0.7)
  if (mood === 'proud' && !locks.has('chest')) pose.chest = Math.max(pose.chest, 0.6)
  if (mood === 'sleepy' && !locks.has('eyeL')) {
    pose.eyeL = Math.min(pose.eyeL, 0.72)
    pose.eyeR = Math.min(pose.eyeR, 0.72)
  }
}

export function frameInterval(quality: 'high' | 'balanced' | 'saver', moving: boolean, sleeping: boolean): number {
  if (quality === 'high') return 16
  if (quality === 'saver') return sleeping ? 250 : moving ? 33 : 90
  return sleeping ? 120 : moving ? 16 : 48
}
