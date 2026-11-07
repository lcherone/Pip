import type { AscentFrame, AscentStyle } from './ascent'
import { clamp, shortestYaw } from './math'
import type { DesktopWindow, DisplayInfo } from './desktop'
import { edgeOccluded } from './world'

export type MoveKind = 'idle' | 'walk' | 'trot' | 'run' | 'back' | 'jump' | 'skid' | 'held' | 'climb'

export interface MoveIntent {
  kind: MoveKind
  ascentStyle?: AscentStyle
  targetX?: number
  targetY?: number
  surfaceId?: string | null
}

export interface MovementWorld {
  floorY: number
  minX: number
  maxX: number
  windows: DesktopWindow[]
  displays?: DisplayInfo[]
}

export type MotionKind = 'idle' | 'walk' | 'trot' | 'run' | 'back' | 'skid' | 'air' | 'climb' | 'crouch'

export class MovementController {
  x = 200
  y = 800
  vx = 0
  vy = 0
  facing = 1
  yaw = 1
  phase = 0
  airborne = false
  held = false
  justLanded = false
  skidding = false
  arrived = true
  surfaceId: string | null = null
  ascent: AscentFrame | null = null
  private climbId: string | null = null
  private climbStartY = 0
  private climbCharge = 0
  private climbLeap = 0
  private climbLaunched = false
  supportMotion = { x: 0, y: 0 }
  justRecovered = false
  private support: { id: string; x: number; y: number; w: number } | null = null
  private jumpCharge = 0
  private charging = false
  private turnFrom = 1
  private turnTo = 1
  private turnT = 1
  private skidFor = 0
  private previousSpeed = 0
  private climbing = false
  private dropThroughId: string | null = null

  place(x: number, y: number): void {
    this.x = x
    this.y = y
    this.vx = 0
    this.vy = 0
  }

  reset(x: number, y: number, surfaceId: string | null = null): void {
    this.place(x, y)
    this.surfaceId = surfaceId
    this.support = null
    this.airborne = false
    this.charging = false
    this.jumpCharge = 0
    this.climbing = false
    this.climbId = null
    this.ascent = null
    this.arrived = true
  }

  /** Turn toward something nearby while standing still. Walking keeps its own facing. */
  glance(direction: number): void {
    if (this.airborne || this.held || Math.abs(this.vx) > 14) return
    if (Math.abs(direction) < 36) return
    this.faceToward(direction > 0 ? 1 : -1)
  }

  releaseToGravity(floorY: number, windows: DesktopWindow[] = []): void {
    this.held = false
    this.surfaceId = null
    this.climbing = false
    const ledge = windows.find(window => window.kind !== 'popover' && !edgeOccluded(windows, windows.indexOf(window), this.x) && window.onScreen && this.x >= window.bounds.x + 20 && this.x <= window.bounds.x + window.bounds.w - 20 && Math.abs(this.y - (window.bounds.y + 2)) <= 12)
    if (ledge) {
      this.surfaceId = ledge.id
      this.y = ledge.bounds.y + 2
      this.airborne = false
      this.vy = 0
      this.arrived = true
      return
    }
    if (this.y < floorY - 4) {
      this.airborne = true
      this.vy = Math.min(this.vy, 0)
    } else {
      this.y = floorY
      this.airborne = false
    }
  }

  update(dt: number, intent: MoveIntent, world: MovementWorld): void {
    let remaining = Number.isFinite(dt) ? clamp(dt, 0, 1) : 0
    this.justLanded = false
    this.justRecovered = false
    this.supportMotion = { x: 0, y: 0 }
    if (world.displays?.length && intent.kind !== 'held') {
      const visible = world.displays.some(display => this.x >= display.bounds.x - 40 && this.x <= display.bounds.x + display.bounds.w + 40 && this.y >= display.bounds.y - 80 && this.y <= display.bounds.y + display.bounds.h + 80)
      if (!visible) {
        const display = world.displays.slice().sort((a, b) => {
          const distance = (item: DisplayInfo) => Math.hypot(this.x - clamp(this.x, item.workArea.x, item.workArea.x + item.workArea.w), this.y - clamp(this.y, item.workArea.y, item.workArea.y + item.workArea.h))
          return distance(a) - distance(b)
        })[0]!
        this.place(clamp(this.x, display.workArea.x + 80, display.workArea.x + display.workArea.w - 80), display.workArea.y + display.workArea.h - 8)
        this.surfaceId = null
        this.airborne = false
        this.support = null
        this.justRecovered = true
      }
    }
    while (remaining > 1e-9) {
      const step = Math.min(1 / 60, remaining)
      remaining -= step
      this.integrate(step, intent, world)
    }
  }

  private integrate(step: number, intent: MoveIntent, world: MovementWorld): void {
    if (intent.kind !== 'climb') this.climbId = null
    if (intent.kind !== 'jump') this.ascent = null
    if (intent.kind === 'held') {
      this.held = true
      this.jumpCharge = 0
      this.charging = false
      this.support = null
      this.climbing = false
      this.surfaceId = null
      this.airborne = false
      this.vx = 0
      this.vy = 0
      this.arrived = true
      return
    }
    this.held = false
    if (this.turnT < 1) {
      this.turnT = Math.min(1, this.turnT + step / 0.34)
      this.yaw = shortestYaw(this.turnFrom, this.turnTo, this.turnT)
    }
    const wasClimbing = this.climbing
    if (this.climbing && intent.kind !== 'climb') {
      this.airborne = true
      this.vy = 0
    }
    this.climbing = false

    if (this.surfaceId) {
      const surface = world.windows.find((window) => window.id === this.surfaceId)
      if (surface && this.support?.id === surface.id) {
        const dx = surface.bounds.x - this.support.x
        const dy = surface.bounds.y - this.support.y
        this.x += dx
        this.supportMotion.x += dx
        this.supportMotion.y += dy
      }
      if (!surface || !surface.onScreen || surface.kind === 'popover' || edgeOccluded(world.windows, world.windows.indexOf(surface), this.x) || surface.bounds.w < 90 || this.x < surface.bounds.x + 20 || this.x > surface.bounds.x + surface.bounds.w - 20) {
        this.surfaceId = null
        this.support = null
        this.airborne = true
        this.vy = 40
      } else {
        this.support = { id: surface.id, x: surface.bounds.x, y: surface.bounds.y, w: surface.bounds.w }
        this.y = surface.bounds.y + 2
        const min = surface.bounds.x + 36
        const max = surface.bounds.x + surface.bounds.w - 36
        if (intent.kind === 'idle' || intent.kind === 'skid') this.x = clamp(this.x, min, max)
      }
    }

    if (!this.surfaceId) this.support = null
    if (intent.kind !== 'jump') { this.jumpCharge = 0; this.charging = false }
    const floorY = this.surfaceId ? this.y : world.floorY
    const targetX = intent.targetX ?? this.x
    const targetY = intent.targetY ?? floorY
    const dx = targetX - this.x
    const adx = Math.abs(dx)

    const climbSurface = intent.kind === 'climb' && intent.surfaceId
      ? world.windows.find(window => window.id === intent.surfaceId && window.onScreen && window.kind !== 'popover' && !edgeOccluded(world.windows, world.windows.indexOf(window), this.x))
      : undefined
    if (climbSurface && adx < 90 && this.y > climbSurface.bounds.y + 2) {
      const top = climbSurface.bounds.y + 2
      const style = intent.ascentStyle ?? 'scramble'
      if (this.climbId !== climbSurface.id) {
        this.climbId = climbSurface.id
        this.climbStartY = this.y
        this.climbCharge = 0
        this.climbLeap = 0
        this.climbLaunched = false
      }
      this.climbing = true
      this.arrived = false
      this.vx = 0
      if (Math.abs(dx) > 4) this.faceToward(Math.sign(dx))
      if (style === 'spring' && !this.climbLaunched && this.climbStartY >= world.floorY - 12 && this.climbStartY - top > 220) {
        this.climbCharge += step
        this.airborne = false
        this.vy = 0
        this.ascent = { phase: 'anticipate', style, direction: this.facing, progress: Math.min(1, this.climbCharge / 0.16), remaining: this.y - top, surfaceId: climbSurface.id }
        if (this.climbCharge < 0.16) return
        this.climbLaunched = true
        this.climbLeap = 0.32
        this.vy = -610
      }
      this.surfaceId = null
      this.x += Math.sign(dx) * Math.min(adx, 100 * step)
      if (this.climbLeap > 0) {
        this.airborne = true
        this.climbLeap = Math.max(0, this.climbLeap - step)
        this.vy += 1500 * step
        const distance = Math.min(this.y - top, Math.max(0, -this.vy * step))
        this.y -= distance
        this.phase = (this.phase + distance / 48) % 1
        this.ascent = { phase: 'leap', style, direction: this.facing, progress: 1 - this.climbLeap / 0.32, remaining: this.y - top, surfaceId: climbSurface.id }
        return
      }
      this.airborne = false
      const remaining = this.y - top
      const pulling = remaining <= 90
      const speed = pulling ? 76 : style === 'careful' ? 90 : style === 'spring' ? 135 : 125
      this.vy = -speed
      const distance = Math.min(remaining, speed * step)
      this.y -= distance
      this.phase = (this.phase + distance / (style === 'careful' ? 58 : 48)) % 1
      this.ascent = { phase: pulling ? 'pullup' : 'climb', style, direction: this.facing,
        progress: pulling ? 1 - remaining / 90 : (this.climbStartY - this.y) / Math.max(1, this.climbStartY - top), remaining, surfaceId: climbSurface.id }
      if (this.y <= top && Math.abs(dx) <= 20) {
        this.y = top
        this.surfaceId = climbSurface.id
        this.support = { id: climbSurface.id, x: climbSurface.bounds.x, y: climbSurface.bounds.y, w: climbSurface.bounds.w }
        this.climbing = false
        this.climbId = null
        this.ascent = null
        this.vy = 0
        this.arrived = true
        this.justLanded = true
      }
      return
    }

    if (wasClimbing && !this.surfaceId) {
      this.climbId = null
      this.ascent = null
      this.airborne = true
      this.vy = 0
    }

    if (intent.kind === 'jump' && !intent.surfaceId && this.surfaceId && targetY > this.y + 24) {
      this.dropThroughId = this.surfaceId
      this.surfaceId = null
      this.airborne = true
      this.vy = 40
    }
    const crossing = intent.surfaceId && this.surfaceId && intent.surfaceId !== this.surfaceId && Math.abs(this.y - targetY) <= 155
    if (intent.kind === 'jump' && !this.airborne && !this.justLanded && adx < 160 && (this.y - targetY > 24 || crossing)) {
      this.charging = true
      this.jumpCharge += step
      this.arrived = false
      this.vx *= Math.exp(-step * 14)
      this.faceToward(Math.sign(dx) || this.facing)
      if (intent.surfaceId) this.ascent = { phase: 'anticipate', direction: this.facing, style: intent.ascentStyle ?? 'spring', progress: Math.min(1, this.jumpCharge / 0.14), remaining: this.y - targetY, surfaceId: intent.surfaceId }
      if (this.jumpCharge < 0.14) return
      this.charging = false
      this.jumpCharge = 0
      this.vy = -780
      this.airborne = true
      this.dropThroughId = this.surfaceId
      this.surfaceId = null
      this.support = null
    }

    let desired = 0
    let accel = 900
    if (!this.airborne && intent.kind !== 'idle' && intent.kind !== 'skid') {
      const speed = intent.kind === 'run' ? 230 : intent.kind === 'trot' ? 140 : intent.kind === 'back' ? 62 : 86
      const dir = intent.kind === 'back' ? -Math.sign(this.facing || 1) : Math.sign(dx || this.facing)
      if (adx > 18) {
        desired = dir * speed
        this.arrived = false
        const nextFacing = intent.kind === 'back' ? this.facing : dir || this.facing
        this.faceToward(nextFacing || 1)
      } else {
        this.arrived = true
        desired = 0
      }
    } else if (intent.kind === 'skid') {
      desired = 0
      accel = 1400
      this.skidFor = 0.28
    } else {
      this.arrived = adx <= 18
    }

    if (this.airborne) {
      const destination = world.windows.find(window => window.id === intent.surfaceId && window.onScreen)
      this.ascent = destination ? { phase: 'leap', direction: this.facing, style: intent.ascentStyle ?? 'spring', progress: clamp(1 + this.vy / 780, 0, 1), remaining: this.y - destination.bounds.y - 2, surfaceId: destination.id } : null
      const previousY = this.y
      this.vy += 1800 * step
      this.y += this.vy * step
      if (Math.abs(dx) > 8) this.vx = clamp(this.vx + Math.sign(dx) * 700 * step, -260, 260)
      this.x += this.vx * step
      // Land only on a surface actually crossed while descending, never teleport up.
      const landing = world.windows
        .filter(window => window.id !== this.dropThroughId && window.onScreen && window.kind !== 'popover' && !edgeOccluded(world.windows, world.windows.indexOf(window), this.x) && this.x >= window.bounds.x + 20 && this.x <= window.bounds.x + window.bounds.w - 20)
        .map(window => ({ y: window.bounds.y + 2, id: window.id }))
        .filter(surface => previousY <= surface.y && this.y >= surface.y && surface.y <= world.floorY)
        .sort((a, b) => a.y - b.y)[0]
      const departed = world.windows.find(window => window.id === this.dropThroughId)
      if (!departed || this.y > departed.bounds.y + 10) this.dropThroughId = null
      const landingY = landing?.y ?? world.floorY
      if (this.y >= landingY && this.vy > 0) {
        this.y = landingY
        this.vy = 0
        this.vx *= 0.4
        this.airborne = false
        this.justLanded = true
        this.ascent = null
        this.surfaceId = landing?.id ?? null
        const support = world.windows.find(window => window.id === this.surfaceId)
        this.support = support ? { id: support.id, x: support.bounds.x, y: support.bounds.y, w: support.bounds.w } : null
        this.arrived = Math.abs(dx) <= 20
      }
    } else {
      const rate = Math.abs(desired) < Math.abs(this.vx) ? Math.max(accel, 1100) : accel
      if (this.vx < desired) this.vx = Math.min(desired, this.vx + rate * step)
      else this.vx = Math.max(desired, this.vx - rate * step)
      this.x += this.vx * step
      this.y = this.surfaceId ? this.y : world.floorY
      if (Math.abs(this.previousSpeed) > 160 && Math.abs(this.vx) < 70 && intent.kind !== 'run') this.skidFor = 0.22
    }

    if (!this.surfaceId) this.x = clamp(this.x, world.minX, world.maxX)
    this.skidding = this.skidFor > 0
    this.skidFor = Math.max(0, this.skidFor - step)
    const distance = Math.abs(this.vx) * step
    if (!this.airborne && distance > 1e-6) {
      const stride = Math.abs(this.vx) >= 180 ? 78 : Math.abs(this.vx) >= 110 ? 58 : 46
      this.phase = (this.phase + distance / stride) % 1
    }
    this.previousSpeed = this.vx
  }

  private faceToward(next: number): void {
    const sign = next >= 0 ? 1 : -1
    if (sign === this.facing && this.turnT >= 1) return
    if (sign === this.turnTo && this.turnT < 1) return
    this.turnFrom = this.yaw
    this.turnTo = sign
    this.facing = sign
    this.turnT = 0
  }

  get motion(): MotionKind {
    if (this.charging) return 'crouch'
    if (this.climbing) return 'climb'
    if (this.airborne) return 'air'
    if (this.skidding) return 'skid'
    const speed = Math.abs(this.vx)
    if (speed < 14) return 'idle'
    if (Math.sign(this.vx) !== this.facing && speed > 20) return 'back'
    if (speed < 110) return 'walk'
    if (speed < 180) return 'trot'
    return 'run'
  }
}
