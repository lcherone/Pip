import { bump, clamp, doubleBump, lerp, smoothstep } from '../math'
import { poseFrom, type Pose } from '../pose'
import type { BodyState } from '../pose'
import type { Clip, ClipCategory, SampleCtx } from './types'

type PartialPose = Partial<Pose>

function P(partial: PartialPose): Pose {
  return poseFrom(partial)
}

function wave(phase: number, amp: number, bounce: number, lean: number): PartialPose {
  const s = Math.sin(phase * Math.PI * 2)
  const c = Math.cos(phase * Math.PI * 2)
  return {
    legFL: s * amp,
    legFR: -s * amp * 0.92,
    legBL: -s * amp * 0.8,
    legBR: s * amp * 0.78,
    bodyY: -Math.abs(s) * bounce,
    bodyRot: c * lean,
    headY: Math.abs(s) * bounce * 0.25,
  }
}

interface Spec {
  id: string
  category: ClipCategory
  duration: number
  loop?: boolean
  interruptibility?: number
  priority?: number
  from: BodyState[]
  end: BodyState | null
  blend?: 'base' | 'add'
  slot?: Clip['slot']
  locks?: Clip['locks']
  markers?: Clip['markers']
  sample: Clip['sample']
}

function define(spec: Spec): Clip {
  return {
    blend: 'base',
    slot: 'base',
    loop: false,
    interruptibility: 0.7,
    priority: 3,
    locks: [],
    ...spec,
    playback: { speed: 1 },
  }
}

const sit = { sit: 1, tailLift: 32, bodyY: 1, mouth: 0.3 }
const lie = { lie: 1, sit: 0.15, bodyY: 4, headY: 10, headRot: -8, tailLift: 8, legFL: 34, legFR: 28, eyeL: 0.85, eyeR: 0.85 }
const sleep = { ...lie, lie: 1, curl: 0.9, eyeL: 0.02, eyeR: 0.02, tailCurl: 0.8, tailLift: 4, tailWag: 0, mouth: 0, headRot: -16, headY: 16 }
const stand = { sit: 0, lie: 0, tailLift: 24, mouth: 0.22 }

const CLIPS: Clip[] = [
  define({
    id: 'idle_stand', category: 'idle', duration: 3.2, loop: true, from: ['standing'], end: 'standing', interruptibility: 0.9, priority: 1,
    sample: (u) => P({ ...stand, bodyX: Math.sin(u * Math.PI * 2) * 3.5, bodyRot: Math.sin(u * Math.PI * 2) * 1.4, headRot: Math.sin(u * Math.PI * 2 + 0.6) * 3, breath: 1 }),
  }),
  define({
    id: 'idle_sit', category: 'idle', duration: 3.4, loop: true, from: ['sitting'], end: 'sitting', interruptibility: 0.92, priority: 1,
    sample: (u) => P({ ...sit, bodyX: Math.sin(u * Math.PI * 2) * 1.6, headRot: Math.sin(u * Math.PI * 2 + 0.4) * 4, headTilt: Math.sin(u * Math.PI * 2) * 2, breath: 1 }),
  }),
  define({
    id: 'idle_lie', category: 'idle', duration: 3.6, loop: true, from: ['lying'], end: 'lying', interruptibility: 0.75, priority: 1,
    sample: (u) => P({ ...lie, breath: 1.15, bodyX: Math.sin(u * Math.PI * 2) * 1.2, headY: 10 + Math.sin(u * Math.PI * 2) * 1.5 }),
  }),
  define({
    id: 'gentle_breathing', category: 'idle', duration: 2.8, loop: true, blend: 'add', slot: 'body', from: ['standing', 'sitting', 'lying', 'sleeping', 'ledge'], end: null, interruptibility: 1, priority: 1,
    sample: (u) => {
      const s = Math.sin(u * Math.PI * 2)
      return { breath: s * 0.18, chest: s * 0.35, squash: s * 0.03 }
    },
  }),
  define({
    id: 'slow_blink', category: 'idle', duration: 0.7, blend: 'add', slot: 'face', from: ['standing', 'sitting', 'lying', 'ledge'], end: null, locks: ['eyeL', 'eyeR'], interruptibility: 1, priority: 2,
    sample: (u) => ({ eyeL: -bump(u), eyeR: -bump(u) }),
  }),
  define({
    id: 'double_blink', category: 'idle', duration: 0.95, blend: 'add', slot: 'face', from: ['standing', 'sitting', 'lying', 'ledge'], end: null, locks: ['eyeL', 'eyeR'], interruptibility: 1, priority: 2,
    sample: (u) => ({ eyeL: -doubleBump(u), eyeR: -doubleBump(u) * 0.92 }),
  }),
  define({
    id: 'ear_twitch_left', category: 'idle', duration: 0.45, blend: 'add', slot: 'ears', from: ['standing', 'sitting', 'lying', 'ledge'], end: null, interruptibility: 1, priority: 2,
    sample: (u) => ({ earL: -bump(u) * 36, earR: bump(u) * 4 }),
  }),
  define({
    id: 'ear_twitch_right', category: 'idle', duration: 0.42, blend: 'add', slot: 'ears', from: ['standing', 'sitting', 'lying', 'ledge'], end: null, interruptibility: 1, priority: 2,
    sample: (u) => ({ earR: -bump(u) * 38, earL: bump(u) * 3 }),
  }),
  define({
    id: 'nose_twitch', category: 'idle', duration: 0.55, blend: 'add', slot: 'face', from: ['standing', 'sitting', 'ledge'], end: null, interruptibility: 1, priority: 2,
    sample: (u) => ({ muzzle: Math.sin(u * Math.PI * 6) * bump(u) * 3.2, sniff: bump(u) }),
  }),
  define({
    id: 'head_subtle', category: 'idle', duration: 2.4, loop: true, blend: 'add', slot: 'face', from: ['standing', 'sitting', 'ledge'], end: null, interruptibility: 1, priority: 1,
    sample: (u) => ({ headRot: Math.sin(u * Math.PI * 2) * 5, headTilt: Math.sin(u * Math.PI * 4) * 2.2, headX: Math.cos(u * Math.PI * 2) * 1.5 }),
  }),
  define({
    id: 'look_left', category: 'idle', duration: 1.3, from: ['sitting'], end: 'sitting', locks: ['yaw', 'headRot', 'pupilX'], interruptibility: 0.8, priority: 3,
    sample: (u) => {
      const k = smoothstep(Math.min(1, u * 1.4))
      return P({ ...sit, yaw: -0.85, headRot: -16 * k, pupilX: -0.8 * k, alert: k })
    },
  }),
  define({
    id: 'look_right', category: 'idle', duration: 1.3, from: ['sitting'], end: 'sitting', locks: ['yaw', 'headRot', 'pupilX'], interruptibility: 0.8, priority: 3,
    sample: (u) => {
      const k = smoothstep(Math.min(1, u * 1.4))
      return P({ ...sit, yaw: 0.9, headRot: 14 * k, pupilX: 0.85 * k, alert: k * 0.8 })
    },
  }),
  define({
    id: 'look_up', category: 'idle', duration: 1.15, from: ['sitting'], end: 'sitting', locks: ['headTilt', 'pupilY'], interruptibility: 0.8, priority: 3,
    sample: (u) => P({ ...sit, headTilt: smoothstep(u) * -16, pupilY: smoothstep(u) * -0.9, headY: smoothstep(u) * -6, alert: 0.8, earL: -12, earR: -12 }),
  }),
  define({
    id: 'look_down', category: 'idle', duration: 1.15, from: ['sitting'], end: 'sitting', locks: ['headTilt', 'pupilY'], interruptibility: 0.8, priority: 3,
    sample: (u) => P({ ...sit, headTilt: smoothstep(u) * 14, pupilY: smoothstep(u) * 0.85, headY: smoothstep(u) * 8, sniff: smoothstep(u) * 0.4 }),
  }),
  define({
    id: 'look_behind', category: 'idle', duration: 1.5, from: ['standing'], end: 'standing', locks: ['yaw', 'headRot'], interruptibility: 0.55, priority: 4,
    sample: (u) => {
      const k = Math.sin(clamp(u, 0, 1) * Math.PI)
      return P({ ...stand, yaw: lerp(1, -0.25, k), headRot: -18 * k, headTilt: 6 * k, alert: k, bodyRot: -4 * k })
    },
  }),
  define({
    id: 'tail_slow_wag', category: 'idle', duration: 2.2, loop: true, blend: 'add', slot: 'tail', from: ['standing', 'sitting', 'ledge'], end: null, interruptibility: 1, priority: 1,
    sample: () => ({ tailWag: 14, tailLift: 8 }),
  }),
  define({
    id: 'paw_adjust', category: 'idle', duration: 1.05, from: ['sitting'], end: 'sitting', interruptibility: 0.75, priority: 3,
    sample: (u) => P({ ...sit, legFL: bump(u) * -42, bodyX: bump(u) * 3, headTilt: bump(u) * 6, headRot: bump(u) * -4 }),
  }),
  define({
    id: 'weight_shift', category: 'idle', duration: 1.6, from: ['standing'], end: 'standing', interruptibility: 0.8, priority: 2,
    sample: (u) => {
      const s = Math.sin(u * Math.PI * 2)
      return P({ ...stand, bodyX: s * 10, bodyRot: s * 5, legFL: s * 8, legFR: -s * 8, headRot: -s * 4 })
    },
  }),
  define({
    id: 'head_tilt', category: 'idle', duration: 1.25, from: ['sitting'], end: 'sitting', locks: ['headTilt'], interruptibility: 0.8, priority: 3,
    sample: (u) => P({ ...sit, headTilt: smoothstep(Math.min(1, u * 1.3)) * 18, earL: -8, earR: 6, browL: 0.4, browR: -0.2, pupilX: 0.2 }),
  }),
  define({
    id: 'body_shake', category: 'idle', duration: 0.7, from: ['standing'], end: 'standing', interruptibility: 0.4, priority: 5, locks: ['bodyRot', 'earL', 'earR'],
    sample: (u) => {
      const wobble = Math.sin(u * Math.PI * 10) * bump(u)
      return P({ ...stand, bodyRot: wobble * 16, earL: wobble * 22, earR: -wobble * 22, squash: 1 - bump(u) * 0.08, headRot: wobble * 8 })
    },
  }),
  define({
    id: 'walk_left', category: 'movement', duration: 0.72, loop: true, from: ['standing'], end: 'standing', interruptibility: 0.85, priority: 3,
    sample: (_u, ctx) => P({ ...stand, ...wave(ctx.phase, 26, 3.5, 3), yaw: -1, headRot: -5, tailWag: 10, tailLift: 28 }),
  }),
  define({
    id: 'walk_right', category: 'movement', duration: 0.72, loop: true, from: ['standing'], end: 'standing', interruptibility: 0.85, priority: 3,
    sample: (_u, ctx) => P({ ...stand, ...wave(ctx.phase, 24, 3.2, 2.4), yaw: 1, headRot: 4, tailWag: 9, tailLift: 26 }),
  }),
  define({
    id: 'trot', category: 'movement', duration: 0.48, loop: true, from: ['standing'], end: 'standing', interruptibility: 0.8, priority: 3,
    sample: (_u, ctx) => P({ ...stand, ...wave(ctx.phase, 34, 6, 5), stretch: 1.04, tailWag: 16, tailLift: 36, earL: -6, earR: -6, mouth: 0.6 }),
  }),
  define({
    id: 'run', category: 'movement', duration: 0.36, loop: true, from: ['standing'], end: 'standing', interruptibility: 0.7, priority: 4,
    sample: (_u, ctx) => P({ ...stand, ...wave(ctx.phase, 46, 10, 8), stretch: 1.1, squash: 0.96, tailWag: 24, tailLift: 48, earL: 10, earR: 8, mouth: 1.3, alert: 0.4, bodyRot: Math.sin(ctx.phase * Math.PI * 2) * 8 - 6 }),
  }),
  define({
    id: 'accelerate', category: 'movement', duration: 0.55, from: ['standing'], end: 'standing', interruptibility: 0.7, priority: 4,
    sample: (u, ctx) => P({ ...stand, ...wave(ctx.phase, lerp(18, 40, u), lerp(2, 8, u), lerp(1, 9, u)), stretch: lerp(1, 1.08, u), bodyRot: lerp(0, -8, u), earL: lerp(0, 6, u), earR: lerp(0, 6, u), tailLift: lerp(20, 40, u) }),
  }),
  define({
    id: 'decelerate', category: 'movement', duration: 0.5, from: ['standing'], end: 'standing', interruptibility: 0.75, priority: 4,
    sample: (u, ctx) => P({ ...stand, ...wave(ctx.phase, lerp(40, 12, u), lerp(8, 1, u), lerp(6, 1, u)), bodyRot: lerp(-4, 10, smoothstep(u)), stretch: lerp(1.08, 0.98, u), headY: lerp(0, 4, u) }),
  }),
  define({
    id: 'skid_stop', category: 'movement', duration: 0.48, from: ['standing'], end: 'standing', interruptibility: 0.45, priority: 5,
    markers: [{ at: 0.35, name: 'skid' }],
    sample: (u) => P({ ...stand, bodyX: bump(u) * 8, bodyRot: bump(u) * 14, legFL: smoothstep(u) * 28, legFR: smoothstep(u) * 22, legBL: -smoothstep(u) * 16, squash: 1 - bump(u) * 0.12, tailLift: 10, earL: 8, earR: 8 }),
  }),
  define({
    id: 'turn_around', category: 'movement', duration: 0.55, from: ['standing'], end: 'standing', interruptibility: 0.5, priority: 5, locks: ['yaw'],
    sample: (u) => {
      const k = smoothstep(clamp(u, 0, 1))
      return P({ ...stand, yaw: lerp(1, -1, k), headRot: -16 * Math.sin(k * Math.PI), bodyRot: 6 * Math.sin(k * Math.PI), legFL: bump(u) * -16, squash: 1 - bump(u) * 0.06, alert: k })
    },
  }),
  define({
    id: 'reverse', category: 'movement', duration: 0.7, loop: true, from: ['standing'], end: 'standing', interruptibility: 0.7, priority: 3,
    sample: (_u, ctx) => P({ ...stand, ...wave(ctx.phase + 0.5, 16, 2, -4), headRot: -18, pupilX: -0.6, tailLift: 12, tailWag: 4, bodyRot: 6 }),
  }),
  define({
    id: 'jump', category: 'movement', duration: 0.72, from: ['standing', 'ledge'], end: 'standing', interruptibility: 0.35, priority: 6,
    markers: [{ at: 0.28, name: 'takeoff' }, { at: 0.72, name: 'land' }],
    sample: (u) => {
      const air = u > 0.22 && u < 0.72 ? 1 : 0
      const crouch = u < 0.22 ? bump(u / 0.22) : 0
      return P({ ...stand, air, squash: 1 - crouch * 0.18 + (u > 0.72 ? bump((u - 0.72) / 0.28) * -0.1 : 0), bodyY: air ? -16 : crouch * 8, stretch: air ? 1.08 : 1, legFL: air ? -24 : crouch * 18, legFR: air ? -20 : crouch * 16, legBL: air ? 22 : -crouch * 10, earL: air ? -16 : 0, earR: air ? -16 : 0, tailLift: air ? 50 : 20 })
    },
  }),
  define({
    id: 'land', category: 'movement', duration: 0.42, from: ['standing', 'airborne', 'held'], end: 'standing', interruptibility: 0.3, priority: 6,
    markers: [{ at: 0.25, name: 'impact' }],
    sample: (u) => P({ ...stand, squash: 1 - bump(u) * 0.2, bodyY: bump(u) * 8, legFL: bump(u) * 16, legFR: bump(u) * 14, earL: bump(u) * 10, earR: bump(u) * 10, air: u < 0.15 ? 1 - u / 0.15 : 0 }),
  }),
  define({
    id: 'hop', category: 'movement', duration: 0.48, from: ['standing'], end: 'standing', interruptibility: 0.55, priority: 4,
    sample: (u) => P({ ...stand, air: u > 0.25 && u < 0.7 ? 0.8 : 0, bodyY: -bump(u) * 10, squash: 1 - (u < 0.25 ? bump(u / 0.25) * 0.1 : 0), legFL: -bump(u) * 16, tailWag: 12, mouth: 0.5 }),
  }),
  define({
    id: 'bounce', category: 'movement', duration: 0.9, from: ['standing'], end: 'standing', interruptibility: 0.6, priority: 4,
    sample: (u) => {
      const hop = Math.abs(Math.sin(u * Math.PI * 3))
      return P({ ...stand, bodyY: -hop * 12, squash: 1 - (1 - hop) * 0.08, air: hop > 0.65 ? 0.7 : 0, mouth: 1.4, tailWag: 26, tailLift: 46, earL: -10, earR: -8, eyeL: 1, eyeR: 1 })
    },
  }),
  define({
    id: 'careful_approach', category: 'movement', duration: 0.9, loop: true, from: ['standing'], end: 'standing', interruptibility: 0.75, priority: 3,
    sample: (_u, ctx) => P({ ...stand, ...wave(ctx.phase, 14, 1.5, 1), headY: 6, headRot: 8, sniff: 0.7, muzzle: 2, bodyY: 3, squash: 0.97, tailLift: 14, tailWag: 4, alert: 0.5 }),
  }),
  define({
    id: 'back_away', category: 'movement', duration: 0.8, loop: true, from: ['standing'], end: 'standing', interruptibility: 0.7, priority: 3,
    sample: (_u, ctx) => P({ ...stand, ...wave(ctx.phase + 0.5, 14, 1.4, -2), bodyX: -4, headRot: -8, tailLift: 6, tailWag: 2, earL: 6, earR: 4, browL: 0.3, browR: 0.3 }),
  }),
  define({
    id: 'follow_cursor', category: 'movement', duration: 0.72, loop: true, from: ['standing'], end: 'standing', interruptibility: 0.8, priority: 3, locks: ['pupilY', 'headTilt'],
    sample: (_u, ctx) => P({ ...stand, ...wave(ctx.phase, 22, 3, 2), headTilt: -10, pupilY: -0.7, tailWag: 12, alert: 0.7, earL: -8, earR: -8 }),
  }),
  define({
    id: 'chase_cursor', category: 'movement', duration: 0.36, loop: true, from: ['standing'], end: 'standing', interruptibility: 0.65, priority: 5,
    sample: (_u, ctx) => P({ ...stand, ...wave(ctx.phase, 48, 11, 7), mouth: 1.7, tailWag: 30, tailLift: 52, earL: -14, earR: -12, stretch: 1.12, eyeL: 1, eyeR: 1, alert: 1 }),
  }),
  define({
    id: 'walk_to', category: 'movement', duration: 0.7, loop: true, from: ['standing'], end: 'standing', interruptibility: 0.8, priority: 3,
    sample: (_u, ctx) => P({ ...stand, ...wave(ctx.phase, 25, 3.4, 3.5), headRot: 2, tailLift: 30, tailWag: 8, chest: 0.3, alert: 0.3 }),
  }),
  define({
    id: 'investigate', category: 'movement', duration: 1.5, from: ['standing'], end: 'standing', interruptibility: 0.6, priority: 4, locks: ['headTilt', 'muzzle'],
    sample: (u, ctx) => P({ ...stand, ...wave(ctx.phase, u < 0.45 ? 18 : 4, 2, 1), sniff: smoothstep(u) , muzzle: smoothstep(u) * 4, headY: smoothstep(u) * 12, headTilt: 10 * smoothstep(u), earL: -14, earR: -4, alert: 1 }),
  }),
  define({
    id: 'recover_balance', category: 'movement', duration: 0.7, from: ['standing'], end: 'standing', interruptibility: 0.4, priority: 7,
    sample: (u) => {
      const w = Math.sin(u * Math.PI * 6) * (1 - u)
      return P({ ...stand, bodyRot: w * 18, bodyX: w * 8, legFL: w * 12, headRot: -w * 10, squash: 1 - Math.abs(w) * 0.05 })
    },
  }),
  define({
    id: 'stand_to_sit', category: 'rest', duration: 0.55, from: ['standing'], end: 'sitting', interruptibility: 0.4, priority: 4,
    sample: (u) => P({ ...stand, sit: smoothstep(u), tailLift: lerp(24, 32, u), bodyY: lerp(0, 2, smoothstep(u)), legBL: lerp(0, 8, u), legBR: lerp(0, 6, u) }),
  }),
  define({
    id: 'sit_to_stand', category: 'rest', duration: 0.5, from: ['sitting'], end: 'standing', interruptibility: 0.45, priority: 4,
    sample: (u) => P({ ...sit, sit: 1 - smoothstep(u), tailLift: lerp(32, 24, u), bodyY: lerp(2, -2, bump(u)), stretch: 1 + bump(u) * 0.04 }),
  }),
  define({
    id: 'sit_to_lie', category: 'rest', duration: 0.7, from: ['sitting'], end: 'lying', interruptibility: 0.35, priority: 4,
    sample: (u) => {
      const k = smoothstep(u)
      return P({ sit: 1 - k, lie: k, headY: lerp(0, 12, k), headRot: lerp(0, -10, k), legFL: lerp(0, 36, k), legFR: lerp(0, 30, k), tailLift: lerp(30, 8, k), bodyY: lerp(0, 4, k) })
    },
  }),
  define({
    id: 'lie_to_sit', category: 'rest', duration: 0.65, from: ['lying'], end: 'sitting', interruptibility: 0.4, priority: 5,
    sample: (u) => {
      const k = smoothstep(u)
      return P({ lie: 1 - k, sit: k, curl: lerp(0.2, 0, k), eyeL: lerp(0.85, 1, k), eyeR: lerp(0.85, 1, k), headY: lerp(12, 0, k), headRot: lerp(-10, 0, k), legFL: lerp(34, 0, k), tailLift: lerp(8, 30, k) })
    },
  }),
  define({
    id: 'curl_up', category: 'rest', duration: 0.8, from: ['lying'], end: 'lying', interruptibility: 0.3, priority: 4,
    sample: (u) => {
      const k = smoothstep(u)
      return P({ ...lie, curl: k * 0.5, tailCurl: k * 0.45, headRot: lerp(-8, -14, k), headY: lerp(10, 14, k), tailLift: lerp(8, 4, k), bodyRot: lerp(0, -4, k) })
    },
  }),
  define({
    id: 'fall_asleep', category: 'rest', duration: 1.3, from: ['lying'], end: 'sleeping', interruptibility: 0.15, priority: 4, locks: ['eyeL', 'eyeR'],
    sample: (u) => {
      const k = smoothstep(u)
      return P({ ...lie, curl: lerp(0.3, 0.92, k), eyeL: lerp(0.8, 0.02, k), eyeR: lerp(0.85, 0.02, k), headY: lerp(10, 18, k), headRot: lerp(-8, -18, k), tailCurl: k, tailWag: 0, mouth: lerp(0.2, 0, k), breath: lerp(1, 0.7, k) })
    },
  }),
  define({
    id: 'sleep_breathe', category: 'rest', duration: 3.2, loop: true, from: ['sleeping'], end: 'sleeping', interruptibility: 0.08, priority: 2, locks: ['eyeL', 'eyeR'],
    sample: (u) => P({ ...sleep, breath: 0.7 + Math.sin(u * Math.PI * 2) * 0.15, chest: Math.sin(u * Math.PI * 2) * 0.4, bodyY: 4 + Math.sin(u * Math.PI * 2) * 0.6 }),
  }),
  define({
    id: 'sleep_twitch', category: 'rest', duration: 0.45, from: ['sleeping'], end: 'sleeping', interruptibility: 0.2, priority: 3, locks: ['eyeL', 'eyeR'],
    sample: (u) => P({ ...sleep, legBL: 8 + bump(u) * 22, earL: bump(u) * -10, bodyRot: bump(u) * 4 }),
  }),
  define({
    id: 'dream_paws', category: 'rest', duration: 1.6, from: ['sleeping'], end: 'sleeping', interruptibility: 0.2, priority: 3, locks: ['eyeL', 'eyeR'],
    sample: (u) => {
      const s = Math.sin(u * Math.PI * 4)
      return P({ ...sleep, legFL: s * 14, legFR: -s * 10, legBL: s * 8, mouth: 0.15, earL: -4 })
    },
  }),
  define({
    id: 'yawn', category: 'rest', duration: 1.35, from: ['sitting'], end: 'sitting', interruptibility: 0.35, priority: 4, locks: ['mouth', 'eyeL', 'eyeR'],
    sample: (u) => P({ ...sit, mouth: 4 * bump(u), eyeL: 1 - bump(u) * 0.85, eyeR: 1 - bump(u) * 0.75, headTilt: bump(u) * -12, headY: bump(u) * -4, earL: bump(u) * -6, earR: bump(u) * -6 }),
  }),
  define({
    id: 'wake', category: 'rest', duration: 1.1, from: ['sleeping'], end: 'lying', interruptibility: 0.3, priority: 9, locks: ['eyeL', 'eyeR'],
    sample: (u) => {
      const k = smoothstep(u)
      return P({ ...sleep, curl: lerp(0.9, 0.15, k), eyeL: lerp(0.02, 0.9, k), eyeR: lerp(0.02, 1, Math.max(0, k - 0.1)), headY: lerp(18, 8, k), headRot: lerp(-18, -4, k), mouth: bump(u) * 1.2, alert: k * 0.4 })
    },
  }),
  define({
    id: 'stretch_front', category: 'rest', duration: 1.25, from: ['standing'], end: 'standing', interruptibility: 0.35, priority: 4,
    sample: (u) => {
      const k = bump(u)
      return P({ ...stand, legFL: k * 40, legFR: k * 36, bodyY: k * 8, headY: k * 14, stretch: 1 + k * 0.12, squash: 1 - k * 0.06, tailLift: lerp(24, 40, k), mouth: k * 0.4 })
    },
  }),
  define({
    id: 'stretch_full', category: 'rest', duration: 1.6, from: ['standing'], end: 'standing', interruptibility: 0.3, priority: 4,
    sample: (u) => {
      const front = u < 0.55 ? bump(u / 0.55) : 0
      const back = u >= 0.4 ? bump((u - 0.4) / 0.6) : 0
      return P({ ...stand, legFL: front * 42, legFR: front * 38, bodyY: front * 10 - back * 6, headY: front * 16 - back * 8, stretch: 1 + front * 0.14, chest: back * 0.8, tailLift: 20 + back * 30, sit: back * 0.25 })
    },
  }),
  define({
    id: 'scratch_ear', category: 'rest', duration: 1.15, from: ['sitting'], end: 'sitting', interruptibility: 0.45, priority: 4,
    sample: (u) => {
      const k = 0.5 + 0.5 * Math.sin(u * Math.PI * 8)
      return P({ ...sit, scratch: 1, headTilt: 16, earL: -20 + k * 8, legBL: 20 + k * 16, bodyRot: -6, eyeL: 0.4 })
    },
  }),
  define({
    id: 'scratch_neck', category: 'rest', duration: 1.05, from: ['sitting'], end: 'sitting', interruptibility: 0.45, priority: 4,
    sample: (u) => {
      const k = Math.sin(u * Math.PI * 7)
      return P({ ...sit, headTilt: 12 + k * 6, headRot: -10, legFL: -20 + k * 8, sniff: 0.2, bodyRot: 4, earR: -6 })
    },
  }),
  define({
    id: 'shake_wake', category: 'rest', duration: 0.75, from: ['standing'], end: 'standing', interruptibility: 0.4, priority: 5, locks: ['earL', 'earR', 'bodyRot'],
    sample: (u) => {
      const w = Math.sin(u * Math.PI * 12) * bump(u)
      return P({ ...stand, bodyRot: w * 14, earL: 8 + w * 18, earR: 8 - w * 18, headRot: w * 6, tailWag: 8 })
    },
  }),
  define({
    id: 'happy_wag', category: 'emotion', duration: 1.4, loop: true, from: ['sitting'], end: 'sitting', interruptibility: 0.8, priority: 3,
    sample: () => P({ ...sit, tailWag: 28, tailLift: 48, mouth: 1.1, eyeL: 0.92, eyeR: 0.92, chest: 0.4, earL: -4, earR: -4 }),
  }),
  define({
    id: 'excited_jump', category: 'emotion', duration: 0.85, from: ['standing'], end: 'standing', interruptibility: 0.5, priority: 5,
    sample: (u) => {
      const hop = Math.abs(Math.sin(u * Math.PI * 2))
      return P({ ...stand, bodyY: -hop * 16, air: hop > 0.7 ? 1 : 0, mouth: 2.2, tailWag: 32, tailLift: 54, earL: -18, earR: -16, stretch: 1.06, eyeL: 1, eyeR: 1 })
    },
  }),
  define({
    id: 'curious', category: 'emotion', duration: 1.4, from: ['standing'], end: 'standing', interruptibility: 0.65, priority: 4, locks: ['headTilt'],
    sample: (u) => {
      const k = smoothstep(Math.min(1, u * 1.2))
      return P({ ...stand, headTilt: 14 * k, headY: 4 * k, sniff: k, muzzle: k * 3, earL: -18 * k, earR: -6 * k, alert: 1, pupilX: 0.35, tailLift: 18, tailWag: 6 })
    },
  }),
  define({
    id: 'confused_tilt', category: 'emotion', duration: 1.3, from: ['sitting'], end: 'sitting', interruptibility: 0.7, priority: 4, locks: ['headTilt', 'browL', 'browR'],
    sample: (u) => P({ ...sit, headTilt: -16 * smoothstep(u), earL: 8, earR: -14 * smoothstep(u), browL: 0.8, browR: -0.4, pupilX: -0.3, mouth: -0.1, tailWag: 1, tailLift: 12 }),
  }),
  define({
    id: 'surprised', category: 'emotion', duration: 0.7, from: ['sitting'], end: 'sitting', interruptibility: 0.4, priority: 6, locks: ['eyeL', 'eyeR', 'earL', 'earR'],
    sample: (u) => P({ ...sit, bodyY: -bump(u) * 6, squash: 1 - bump(u) * 0.05, eyeL: 1, eyeR: 1, earL: -22 * bump(u), earR: -22 * bump(u), mouth: 0.8 * bump(u), headY: -4 * bump(u), alert: 1, pupilY: -0.4 }),
  }),
  define({
    id: 'startled', category: 'emotion', duration: 0.62, from: ['standing'], end: 'standing', interruptibility: 0.25, priority: 8, locks: ['earL', 'earR'],
    sample: (u) => P({ ...stand, air: u < 0.45 ? bump(u / 0.45) : 0, bodyY: -bump(u) * 14, bodyX: bump(u) * -8, earL: 14, earR: 12, eyeL: 1, eyeR: 1, legFL: -18 * bump(u), tailLift: 6, mouth: 0.4, squash: u > 0.55 ? 1 - bump((u - 0.55) / 0.45) * 0.12 : 1 }),
  }),
  define({
    id: 'sad', category: 'emotion', duration: 1.8, loop: true, from: ['sitting'], end: 'sitting', interruptibility: 0.55, priority: 3, locks: ['tailWag', 'mouth', 'browL', 'browR'],
    sample: () => P({ ...sit, headY: 10, headRot: -6, tailLift: 2, tailWag: 0, mouth: -0.8, browL: 0.7, browR: 0.7, earL: 10, earR: 10, eyeL: 0.75, eyeR: 0.75, chest: -0.3 }),
  }),
  define({
    id: 'frustrated', category: 'emotion', duration: 0.9, from: ['sitting'], end: 'sitting', interruptibility: 0.5, priority: 4, locks: ['browL', 'browR'],
    sample: (u) => {
      const stamp = bump(clamp((u - 0.2) / 0.35, 0, 1))
      return P({ ...sit, browL: -0.8, browR: -0.7, legFL: -stamp * 28, bodyRot: Math.sin(u * Math.PI * 5) * 4, headRot: -4, mouth: -0.3, earL: 4, tailWag: 2, tailLift: 10 })
    },
  }),
  define({
    id: 'proud', category: 'emotion', duration: 1.5, from: ['sitting'], end: 'sitting', interruptibility: 0.6, priority: 4,
    sample: (u) => P({ ...sit, chest: 1, headY: -8, headTilt: -4, tailLift: 42, tailWag: 12, stretch: 1.04, mouth: 0.8, earL: -6, earR: -6, bodyY: -2 * smoothstep(u) }),
  }),
  define({
    id: 'celebrate', category: 'emotion', duration: 1.15, from: ['standing'], end: 'standing', interruptibility: 0.45, priority: 6,
    markers: [{ at: 0.3, name: 'hop' }],
    sample: (u) => {
      const hop = Math.abs(Math.sin(u * Math.PI * 2))
      return P({ ...stand, bodyY: -hop * 18, air: hop > 0.72 ? 1 : 0, mouth: 2.4, tailWag: 34, tailLift: 56, earL: -20, earR: -18, stretch: 1.08, eyeL: 0.9, eyeR: 0.9 })
    },
  }),
  define({
    id: 'request_attention', category: 'emotion', duration: 1.3, from: ['sitting'], end: 'sitting', interruptibility: 0.7, priority: 4,
    sample: (u) => P({ ...sit, legFL: -bump(u) * 36, headTilt: -8, pupilY: -0.8, mouth: 0.6, tailWag: 18, tailLift: 40, earL: -10, earR: -10, alert: 0.8 }),
  }),
  define({
    id: 'play_bow', category: 'emotion', duration: 1.15, from: ['standing'], end: 'standing', interruptibility: 0.5, priority: 4,
    sample: (u) => {
      const k = bump(u)
      return P({ ...stand, bodyY: k * 16, headY: k * 20, legFL: k * 24, legFR: k * 22, legBL: -k * 8, tailWag: 22, tailLift: 46, stretch: 1 + k * 0.06, mouth: 1.2, chest: -k })
    },
  }),
  define({
    id: 'bark', category: 'emotion', duration: 0.7, from: ['sitting'], end: 'sitting', interruptibility: 0.55, priority: 5, locks: ['mouth'],
    markers: [{ at: 0.2, name: 'bark' }, { at: 0.48, name: 'bark' }],
    sample: (u) => {
      const open = Math.max(0, Math.sin(u * Math.PI * 4))
      return P({ ...sit, mouth: 3 * open, headY: -open * 4, bodyY: -open * 2, earL: -8, earR: -6, tailWag: 16, alert: 0.6 })
    },
  }),
  define({
    id: 'whimper', category: 'emotion', duration: 1.2, from: ['sitting'], end: 'sitting', interruptibility: 0.6, priority: 3, locks: ['mouth', 'browL'],
    sample: (u) => P({ ...sit, mouth: -0.4 + Math.sin(u * Math.PI * 4) * 0.25, headY: 8, browL: 0.6, browR: 0.5, earL: 8, earR: 10, tailLift: 6, tailWag: 2, eyeL: 0.8, eyeR: 0.85 }),
  }),
  define({
    id: 'look_expectant', category: 'emotion', duration: 1.4, from: ['sitting'], end: 'sitting', interruptibility: 0.65, priority: 4, locks: ['pupilY', 'headTilt'],
    sample: () => P({ ...sit, headTilt: -6, pupilY: -0.75, pupilX: 0.1, eyeL: 1, eyeR: 1, earL: -12, earR: -12, tailWag: 8, tailLift: 30, mouth: 0.45, alert: 0.9 }),
  }),
  define({
    id: 'notice_app', category: 'desktop', duration: 0.8, from: ['sitting', 'ledge'], end: 'sitting', interruptibility: 0.5, priority: 5, locks: ['earL', 'earR', 'headRot'],
    sample: (u) => {
      const k = smoothstep(Math.min(1, u * 1.6))
      return P({ ...sit, earL: -24 * k, earR: -20 * k, headRot: 12 * k, alert: 1, pupilX: 0.6 * k, tailLift: lerp(30, 38, k), eyeL: 1, eyeR: 1 })
    },
  }),
  define({
    id: 'approach_window', category: 'desktop', duration: 0.86, loop: true, from: ['standing'], end: 'standing', interruptibility: 0.75, priority: 4,
    sample: (_u, ctx) => P({ ...stand, ...wave(ctx.phase, 18, 2, 2), headTilt: -12, pupilY: -0.65, alert: 0.9, earL: -12, earR: -10, tailLift: 22, sniff: 0.3 }),
  }),
  define({
    id: 'look_over_edge', category: 'desktop', duration: 1.4, from: ['ledge'], end: 'ledge', interruptibility: 0.5, priority: 4, locks: ['headTilt', 'headY'],
    sample: (u) => {
      const k = smoothstep(u)
      return P({ ...sit, ledge: 1, danglers: 0.8, headTilt: 18 * k, headY: 14 * k, pupilY: 0.8, sniff: 0.5, earL: -4, bodyY: 4, tailLift: 16 })
    },
  }),
  define({
    id: 'climb_window', category: 'movement', duration: 0.8, loop: true, from: ['standing'], end: 'standing', priority: 6,
    sample: (_u, ctx) => P({ ...stand, ...wave(ctx.phase, 34, 2, 3), bodyRot: -18, headRot: 12, pupilY: -0.7, earL: -10, earR: -8, tailLift: 12, tailWag: 3, alert: 0.8 }),
  }),
  define({
    id: 'jump_ledge', category: 'desktop', duration: 0.7, from: ['standing'], end: 'ledge', interruptibility: 0.3, priority: 6,
    markers: [{ at: 0.3, name: 'takeoff' }, { at: 0.75, name: 'land' }],
    sample: (u) => {
      const air = u > 0.2 && u < 0.75 ? 1 : 0
      const landed = u >= 0.75 ? smoothstep((u - 0.75) / 0.25) : 0
      return P({ ...stand, air: air * (1 - landed), ledge: landed, sit: landed, danglers: landed, bodyY: air ? -18 : 0, earL: air ? -14 : 0, earR: air ? -14 : 0, squash: landed ? 0.9 : 1, legFL: air ? -20 : 0 })
    },
  }),
  define({
    id: 'land_ledge', category: 'desktop', duration: 0.45, from: ['standing', 'airborne', 'ledge'], end: 'ledge', priority: 7, interruptibility: 0.25,
    sample: (u) => P({ ...sit, ledge: 1, danglers: smoothstep(u), squash: 1 - bump(u) * 0.14, bodyY: bump(u) * 6, tailLift: 24, earL: bump(u) * 8, earR: bump(u) * 8 }),
  }),
  define({
    id: 'rest_ledge', category: 'desktop', duration: 3.6, loop: true, from: ['ledge'], end: 'ledge', priority: 2, interruptibility: 0.8,
    sample: (u) => P({ ...lie, lie: 0.72, ledge: 1, danglers: 0.2, headY: 9 + Math.sin(u * Math.PI * 2) * 1.2, breath: 1.1, eyeL: 0.65, eyeR: 0.65, tailLift: 6 }),
  }),
  define({
    id: 'sit_ledge', category: 'desktop', duration: 2.4, loop: true, from: ['ledge'], end: 'ledge', interruptibility: 0.7, priority: 2,
    sample: (u) => P({ ...sit, ledge: 1, danglers: 1, legFL: 18 + Math.sin(u * Math.PI * 2) * 3, legFR: 16, tailWag: 8, tailLift: 28, headRot: Math.sin(u * Math.PI * 2) * 3 }),
  }),
  define({
    id: 'walk_ledge', category: 'desktop', duration: 0.9, loop: true, from: ['ledge'], end: 'ledge', interruptibility: 0.6, priority: 4,
    sample: (_u, ctx) => P({ sit: 0.2, ledge: 1, ...wave(ctx.phase, 12, 1.2, 1), bodyY: 2, headTilt: 8, tailLift: 14, tailWag: 3, squash: 0.96, alert: 0.4, yaw: 1 }),
  }),
  define({
    id: 'prepare_jump_down', category: 'desktop', duration: 0.7, from: ['ledge'], end: 'ledge', interruptibility: 0.4, priority: 5,
    sample: (u) => {
      const k = smoothstep(u)
      return P({ ...sit, ledge: 1, danglers: 1, headTilt: 16 * k, pupilY: 0.9, bodyX: -4 * k, squash: 1 - k * 0.08, earL: -6, tailLift: 8 })
    },
  }),
  define({
    id: 'jump_down', category: 'desktop', duration: 0.62, from: ['ledge'], end: 'standing', interruptibility: 0.3, priority: 6,
    markers: [{ at: 0.74, name: 'land' }],
    sample: (u) => {
      const leave = smoothstep(Math.min(1, u / 0.18))
      const airborne = u > 0.16 && u < 0.72
      const land = u >= 0.72 ? bump((u - 0.72) / 0.28) : 0
      return P({
        ...stand,
        ledge: u < 0.2 ? 1 - leave : 0,
        air: airborne ? 1 : 0,
        bodyY: airborne ? -8 : land * 8,
        squash: 1 - land * 0.16,
        danglers: u < 0.28 ? 1 - leave : 0,
        earL: airborne ? 8 : 0,
        earR: airborne ? 8 : 0,
        legFL: airborne ? -18 : land * 14,
        legFR: airborne ? -14 : land * 12,
      })
    },
  }),
  define({
    id: 'investigate_cursor', category: 'desktop', duration: 1.2, from: ['standing'], end: 'standing', interruptibility: 0.65, priority: 4,
    sample: (u) => {
      const k = smoothstep(u)
      return P({ ...stand, sniff: k, muzzle: k * 4.5, headY: 10 * k, headRot: 6 * k, earL: -8, pupilY: 0.4, tailWag: 6, legFL: k * 6 })
    },
  }),
  define({
    id: 'follow_window', category: 'desktop', duration: 0.78, loop: true, from: ['standing'], end: 'standing', interruptibility: 0.75, priority: 4, locks: ['headTilt', 'pupilY'],
    sample: (_u, ctx) => P({ ...stand, ...wave(ctx.phase, 20, 2.4, 2), headTilt: -14, pupilY: -0.8, alert: 0.8, earL: -10, earR: -8, tailLift: 24 }),
  }),
  define({
    id: 'lose_interest', category: 'desktop', duration: 1.1, from: ['standing'], end: 'standing', interruptibility: 0.7, priority: 3, locks: ['headRot'],
    sample: (u) => {
      const k = smoothstep(u)
      return P({ ...stand, headRot: -22 * k, tailWag: lerp(12, 1, k), tailLift: lerp(30, 16, k), alert: lerp(0.8, 0, k), earL: lerp(-10, 0, k) })
    },
  }),
  define({
    id: 'window_closed', category: 'desktop', duration: 0.9, from: ['standing'], end: 'standing', interruptibility: 0.35, priority: 7,
    sample: (u) => P({ ...stand, earL: u < 0.4 ? -18 : lerp(-18, 0, (u - 0.4) / 0.6), earR: u < 0.4 ? -16 : 0, bodyY: u < 0.35 ? -8 : 0, headRot: Math.sin(u * Math.PI * 2) * 10, alert: u < 0.7 ? 1 : 0.2, eyeL: 1, pupilX: Math.sin(u * Math.PI * 2) * 0.5 }),
  }),
  define({
    id: 'watch_progress', category: 'desktop', duration: 2.2, loop: true, from: ['sitting'], end: 'sitting', interruptibility: 0.6, priority: 4, locks: ['pupilY'],
    sample: (u) => P({ ...sit, alert: 1, earL: -14, earR: -12, pupilY: -0.35 + Math.sin(u * Math.PI * 2) * 0.12, headTilt: -4, tailWag: 6, tailLift: 26, chest: 0.2, eyeL: 1, eyeR: 1 }),
  }),
  define({
    id: 'celebrate_work', category: 'desktop', duration: 1.35, from: ['sitting'], end: 'sitting', interruptibility: 0.45, priority: 6,
    sample: (u) => {
      const hop = u > 0.35 && u < 0.7 ? bump((u - 0.35) / 0.35) : 0
      return P({ ...sit, chest: 1, headY: -6, sit: 1 - hop * 0.4, bodyY: -hop * 10, air: hop > 0.6 ? 0.6 : 0, mouth: 1.3, tailWag: 20, tailLift: 44, earL: -8, earR: -8, eyeL: 0.86, eyeR: 0.9 })
    },
  }),
  define({
    id: 'react_failure', category: 'desktop', duration: 1.25, from: ['sitting'], end: 'sitting', interruptibility: 0.55, priority: 6, locks: ['headTilt', 'browL', 'mouth'],
    sample: (u) => {
      const k = smoothstep(Math.min(1, u * 1.3))
      return P({ ...sit, headTilt: 15 * k, browL: 0.9, browR: -0.2, mouth: -0.55, earL: 12 * k, earR: -8, tailLift: 6, tailWag: 0, headY: 4, pupilX: -0.25 })
    },
  }),
  define({
    id: 'beg', category: 'emotion', duration: 1.4, from: ['sitting'], end: 'sitting', interruptibility: 0.7, priority: 4, locks: ['headTilt'],
    sample: (u) => {
      const k = smoothstep(Math.min(1, u * 1.6))
      return P({ ...sit, legFL: -36 * k, headTilt: -12 * k, pupilY: -0.55, earL: -16 * k, earR: -14 * k, tailWag: 12, tailLift: 40, mouth: 0.45, alert: 0.85, eyeL: 1, eyeR: 1 })
    },
  }),
  define({
    id: 'sniff_ground', category: 'idle', duration: 1.5, from: ['standing'], end: 'standing', interruptibility: 0.65, priority: 4, locks: ['headTilt', 'muzzle'],
    sample: (u) => {
      const k = smoothstep(Math.min(1, u * 1.4))
      const sniff = Math.sin(u * Math.PI * 6) * 0.5 + 0.5
      return P({ ...stand, headY: 14 * k, headTilt: 12 * k, sniff, muzzle: sniff * 3, earL: 6, earR: 4, tailLift: 14, bodyY: 4 * k, alert: 0.35 })
    },
  }),
  define({
    id: 'dig', category: 'emotion', duration: 1.2, from: ['standing'], end: 'standing', interruptibility: 0.55, priority: 4,
    sample: (u) => {
      const paw = Math.sin(u * Math.PI * 6)
      return P({ ...stand, legFL: -16 + paw * 14, legFR: -16 - paw * 14, headY: 10, headTilt: 8, bodyY: 3, earL: 4, earR: 4, tailWag: 8, tailLift: 22, squash: 0.96 })
    },
  }),
  define({
    id: 'roll_shoulder', category: 'rest', duration: 1.4, from: ['sitting'], end: 'sitting', interruptibility: 0.4, priority: 4, locks: ['bodyRot'],
    sample: (u) => {
      const k = Math.sin(clamp(u, 0, 1) * Math.PI)
      return P({ ...sit, bodyRot: 20 * k, headRot: 8 * k, legFL: -10 * k, danglers: k * 0.35, tailWag: 6, tailLift: 22, eyeL: 1, eyeR: 0.9, mouth: 0.45 })
    },
  }),
  define({
    id: 'greet', category: 'emotion', duration: 1.15, from: ['sitting'], end: 'sitting', interruptibility: 0.6, priority: 5,
    sample: (u) => {
      const hop = bump(clamp(u, 0, 1))
      return P({ ...sit, sit: 1 - hop * 0.3, bodyY: -hop * 8, earL: -18, earR: -16, tailWag: 20, tailLift: 44, mouth: 1.05, alert: 1, eyeL: 1, eyeR: 1, chest: 0.35 })
    },
  }),
  define({
    id: 'sneeze', category: 'idle', duration: 0.7, from: ['sitting'], end: 'sitting', interruptibility: 0.5, priority: 5, locks: ['headRot', 'earL', 'earR'],
    sample: (u) => {
      const k = u < 0.45 ? smoothstep(u / 0.45) : 1 - smoothstep((u - 0.45) / 0.55)
      return P({ ...sit, headY: 6 * k, headRot: -8 * k, earL: 12 * k, earR: 10 * k, eyeL: 1 - k * 0.65, eyeR: 1 - k * 0.65, muzzle: k * 2, bodyY: k * 2 })
    },
  }),
  define({
    id: 'lick_paw', category: 'rest', duration: 1.3, from: ['sitting'], end: 'sitting', interruptibility: 0.5, priority: 4, locks: ['headTilt'],
    sample: (u) => {
      const k = 0.7 + 0.3 * Math.sin(u * Math.PI * 4)
      return P({ ...sit, headTilt: 14 * k, headY: 8 * k, legFL: -20 * k, mouth: 0.35, eyeL: 0.55, eyeR: 0.75, earL: 4, tailLift: 18 })
    },
  }),
  define({
    id: 'perk', category: 'desktop', duration: 0.85, from: ['standing'], end: 'standing', interruptibility: 0.55, priority: 5, locks: ['earL', 'earR'],
    sample: (u) => {
      const k = u < 0.4 ? smoothstep(u / 0.4) : 1 - smoothstep((u - 0.4) / 0.6)
      return P({ ...stand, earL: -28 * k, earR: -26 * k, chest: 0.8 * k, alert: k, headY: -8 * k, tailLift: 24 + 16 * k, tailWag: 12 * k, legFL: -10 * k, eyeL: 1, eyeR: 1 })
    },
  }),
  define({
    id: 'peek_up', category: 'desktop', duration: 1.25, from: ['standing'], end: 'standing', interruptibility: 0.6, priority: 4, locks: ['headTilt', 'pupilY'],
    sample: (u) => {
      const k = smoothstep(Math.min(1, u * 1.4))
      return P({ ...stand, headTilt: -24 * k, headY: -12 * k, pupilY: -0.9, earL: -18 * k, earR: -14 * k, legFL: -24 * k, legFR: -6 * k, chest: 0.45 * k, alert: 1, tailLift: 28, eyeL: 1, eyeR: 1 })
    },
  }),
  define({
    id: 'sniff_frame', category: 'desktop', duration: 1.45, from: ['standing'], end: 'standing', interruptibility: 0.6, priority: 4, locks: ['headTilt', 'muzzle'],
    sample: (u) => {
      const k = smoothstep(Math.min(1, u * 1.3))
      const sniff = Math.sin(u * Math.PI * 5) * 0.5 + 0.5
      return P({ ...stand, headTilt: -16 * k, headRot: 18 * Math.sin(u * Math.PI), headY: -4 * k, sniff, muzzle: sniff * 3.2, earL: -8, earR: 4, tailLift: 18, alert: 0.7, legFL: 4 * k })
    },
  }),
  define({
    id: 'paw_glass', category: 'desktop', duration: 1.2, from: ['standing', 'ledge'], end: null, interruptibility: 0.55, priority: 4,
    sample: (u) => {
      const tap = Math.max(0, Math.sin(u * Math.PI * 4))
      return P({ ...stand, legFL: -30 * tap, legFR: -6, headTilt: -12, headY: -4, earL: -10, earR: -6, alert: 0.75, tailWag: 8, tailLift: 26, chest: 0.2 })
    },
  }),
  define({
    id: 'settle_paws', category: 'desktop', duration: 1.5, from: ['ledge'], end: 'ledge', interruptibility: 0.6, priority: 3,
    sample: (u) => {
      const k = Math.sin(u * Math.PI * 2)
      return P({ ...sit, ledge: 1, danglers: 0.85 + k * 0.1, legFL: 16 + k * 8, legFR: 14 - k * 6, tailWag: 5, tailLift: 22, headRot: k * 4, headTilt: 6, earL: -4, bodyY: 2 })
    },
  }),
  define({
    id: 'listen', category: 'desktop', duration: 1.6, from: ['sitting'], end: 'sitting', interruptibility: 0.65, priority: 4, locks: ['earL', 'headRot'],
    sample: (u) => {
      const k = 0.75 + 0.25 * Math.sin(u * Math.PI * 2)
      return P({ ...sit, earL: -24 * k, earR: 8, headRot: 12 * k, headTilt: -6, pupilX: 0.45, alert: 0.85, tailLift: 20, tailWag: 3, eyeL: 1, eyeR: 0.92, mouth: 0.15 })
    },
  }),
  define({
    id: 'duck', category: 'desktop', duration: 0.7, from: ['standing'], end: 'standing', interruptibility: 0.35, priority: 7, locks: ['earL', 'earR', 'squash'],
    sample: (u) => {
      const k = u < 0.45 ? smoothstep(u / 0.45) : 1 - smoothstep((u - 0.45) / 0.55)
      return P({ ...stand, squash: 1 - 0.22 * k, bodyY: 10 * k, earL: 18 * k, earR: 16 * k, headY: 8 * k, tailLift: 8, alert: 1 - k * 0.2, eyeL: 1 - k * 0.35, eyeR: 1 - k * 0.35 })
    },
  }),
  define({
    id: 'sidestep', category: 'desktop', duration: 0.55, loop: true, from: ['standing'], end: 'standing', interruptibility: 0.75, priority: 5,
    sample: (_u, ctx) => P({ ...stand, ...wave(ctx.phase, 14, 1, 1.5), squash: 0.84, bodyY: 7, earL: 14, earR: 12, headY: 5, tailLift: 10, alert: 0.55 }),
  }),
  define({
    id: 'shake_off', category: 'desktop', duration: 0.8, from: ['standing'], end: 'standing', interruptibility: 0.4, priority: 6, locks: ['bodyRot', 'earL', 'earR'],
    sample: (u) => {
      const k = Math.sin(clamp(u, 0, 1) * Math.PI * 3)
      return P({ ...stand, bodyRot: 16 * k, earL: 20 * k, earR: -18 * k, headRot: 8 * k, tailWag: 14, tailLift: 20, alert: 0.4 })
    },
  }),
  define({
    id: 'tail_chase', category: 'emotion', duration: 1.35, from: ['standing'], end: 'standing', interruptibility: 0.5, priority: 4, locks: ['bodyRot', 'headRot'],
    sample: (u) => {
      const k = Math.sin(u * Math.PI * 2)
      return P({ ...stand, bodyRot: k * 22, headRot: -k * 26, headTilt: 10, earL: 10, earR: -8, legFL: k * 14, legBL: -k * 16, tailWag: 18, tailLift: 38, tailCurl: 0.7, alert: 0.45, eyeL: 0.75, eyeR: 0.9 })
    },
  }),
  define({
    id: 'paw_wave', category: 'emotion', duration: 1.15, from: ['sitting'], end: 'sitting', interruptibility: 0.65, priority: 4,
    sample: (u) => {
      const wave = Math.sin(u * Math.PI * 4)
      return P({ ...sit, legFL: -28 + wave * 12, headTilt: -8, earL: -14, earR: -10, tailWag: 14, tailLift: 40, mouth: 0.7, alert: 0.8, eyeL: 1, eyeR: 1, chest: 0.25 })
    },
  }),
  define({
    id: 'knead', category: 'idle', duration: 1.3, from: ['sitting'], end: 'sitting', interruptibility: 0.6, priority: 3,
    sample: (u) => {
      const paw = Math.sin(u * Math.PI * 4)
      return P({ ...sit, legFL: paw * 14, legFR: -paw * 14, bodyY: 2 + Math.abs(paw), squash: 0.96, headTilt: 6, earL: -4, tailWag: 6, tailLift: 24, eyeL: 0.8, eyeR: 0.85, mouth: 0.35 })
    },
  }),
  define({
    id: 'doze', category: 'rest', duration: 1.7, from: ['sitting'], end: 'sitting', interruptibility: 0.4, priority: 3, locks: ['eyeL', 'eyeR', 'headY'],
    sample: (u) => {
      const nod = u < 0.7 ? smoothstep(u / 0.7) : 1 - smoothstep((u - 0.7) / 0.3) * 0.35
      return P({ ...sit, headY: 12 * nod, headTilt: 8 * nod, eyeL: 1 - nod * 0.82, eyeR: 1 - nod * 0.9, earL: 8 * nod, earR: 10 * nod, tailLift: 12, mouth: 0.1, alert: 0 })
    },
  }),
  define({
    id: 'lick_nose', category: 'idle', duration: 0.85, from: ['sitting'], end: 'sitting', interruptibility: 0.6, priority: 4, locks: ['muzzle', 'mouth'],
    sample: (u) => {
      const k = u < 0.55 ? smoothstep(u / 0.55) : 1 - smoothstep((u - 0.55) / 0.45)
      return P({ ...sit, headY: 6 * k, headTilt: 8 * k, muzzle: k * 3, mouth: 0.2 + k * 0.5, eyeL: 0.7, eyeR: 0.85, earL: 2, tailLift: 22 })
    },
  }),
  define({
    id: 'wiggle', category: 'emotion', duration: 0.95, from: ['sitting'], end: 'sitting', interruptibility: 0.6, priority: 4, locks: ['bodyRot'],
    sample: (u) => {
      const k = Math.sin(u * Math.PI * 6)
      return P({ ...sit, bodyRot: k * 14, headRot: k * 6, tailWag: 22, tailLift: 42, earL: -12, earR: -10, mouth: 0.8, chest: 0.3, alert: 0.9, eyeL: 1, eyeR: 1 })
    },
  }),
  define({
    id: 'pounce', category: 'emotion', duration: 0.85, from: ['standing'], end: 'standing', interruptibility: 0.45, priority: 5,
    sample: (u) => {
      const crouch = u < 0.3 ? smoothstep(u / 0.3) : u < 0.45 ? 1 : 0
      const air = u > 0.32 && u < 0.72 ? bump((u - 0.32) / 0.4) : 0
      return P({ ...stand, squash: 1 - crouch * 0.18, bodyY: air * -16 + crouch * 6, air: air > 0.45 ? 0.8 : 0, legFL: air ? -22 : crouch * 12, legFR: air ? -18 : crouch * 10, earL: air ? -16 : -4, earR: air ? -14 : -4, tailLift: 28 + air * 12, tailWag: 8, alert: 1, chest: crouch * 0.4 })
    },
  }),
  define({
    id: 'stretch_side', category: 'rest', duration: 1.25, from: ['standing'], end: 'standing', interruptibility: 0.4, priority: 4, locks: ['bodyRot'],
    sample: (u) => {
      const k = Math.sin(clamp(u, 0, 1) * Math.PI)
      return P({ ...stand, bodyRot: 20 * k, headRot: 10 * k, legFL: 16 * k, legFR: -8 * k, stretch: 1 + k * 0.1, tailLift: 26 + k * 8, earL: -6, earR: 4, alert: 0.2 })
    },
  }),
  define({
    id: 'pant', category: 'rest', duration: 1.2, from: ['standing'], end: 'standing', interruptibility: 0.7, priority: 3, locks: ['mouth'],
    sample: (u) => {
      const s = Math.sin(u * Math.PI * 6)
      return P({ ...stand, mouth: 0.85 + s * 0.3, chest: 0.35 + Math.abs(s) * 0.25, headY: 3 + s, earL: 8, earR: 6, tailWag: 12, tailLift: 20, eyeL: 0.72, eyeR: 0.8, alert: 0.35 })
    },
  }),
  define({
    id: 'snore', category: 'rest', duration: 1.8, from: ['sleeping'], end: 'sleeping', interruptibility: 0.2, priority: 3, locks: ['eyeL', 'eyeR', 'mouth'],
    sample: (u) => {
      const s = Math.sin(u * Math.PI * 2)
      return P({ ...sleep, mouth: s > 0 ? s * 0.9 : 0, bodyY: 4 + s * 2, squash: 1 + s * 0.03, eyeL: 0.02, eyeR: 0.02 })
    },
  }),
  define({
    id: 'dream_run', category: 'rest', duration: 1.35, from: ['sleeping'], end: 'sleeping', interruptibility: 0.2, priority: 3, locks: ['eyeL', 'eyeR'],
    sample: (u) => {
      const s = Math.sin(u * Math.PI * 8)
      return P({ ...sleep, legFL: s * 18, legFR: -s * 16, legBL: -s * 12, legBR: s * 10, tailWag: 6, mouth: 0.15, eyeL: 0.02, eyeR: 0.02 })
    },
  }),
  define({
    id: 'peek_along', category: 'desktop', duration: 1.35, from: ['ledge'], end: 'ledge', interruptibility: 0.6, priority: 4, locks: ['headRot', 'pupilX'],
    sample: (u) => {
      const k = Math.sin(u * Math.PI * 2)
      return P({ ...sit, ledge: 1, danglers: 0.9, headRot: k * 22, pupilX: k * 0.75, earL: -10, earR: -6, alert: 0.65, tailLift: 22, tailWag: 4, eyeL: 1, eyeR: 1 })
    },
  }),
  define({
    id: 'held', category: 'emotion', duration: 1.2, loop: true, from: ['held'], end: 'held', interruptibility: 0.2, priority: 9,
    sample: (u) => P({ held: 1, danglers: 1, air: 0.8, bodyY: -12, bodyRot: -16 + Math.sin(u * Math.PI * 2) * 2, legFL: 0, legFR: 0, legBL: 0, legBR: 0, earL: 4, earR: 2, tailLift: 18, eyeL: 0.9, eyeR: 1, mouth: 0.4, squash: 0.94 }),
  }),
]

const byId = new Map(CLIPS.map((clip) => [clip.id, clip]))

export function listClips(): Clip[] {
  return CLIPS.slice()
}

export function getClip(id: string): Clip | undefined {
  return byId.get(id)
}

export function clipMeta(clip: Clip) {
  return {
    id: clip.id,
    category: clip.category,
    duration: clip.duration,
    loop: clip.loop,
    interruptibility: clip.interruptibility,
    priority: clip.priority,
    from: clip.from,
    end: clip.end,
    blend: clip.blend,
    playback: clip.playback,
  }
}

export function transitionPath(from: BodyState, to: BodyState): string[] {
  if (from === to) return []
  const table: Record<string, string[]> = {
    'sleeping->lying': ['wake'],
    'sleeping->sitting': ['wake', 'lie_to_sit'],
    'sleeping->standing': ['wake', 'lie_to_sit', 'sit_to_stand'],
    'sleeping->ledge': ['wake', 'lie_to_sit', 'sit_to_stand', 'jump_ledge'],
    'sleeping->airborne': ['wake', 'lie_to_sit', 'sit_to_stand', 'jump'],
    'sleeping->held': ['wake', 'lie_to_sit', 'sit_to_stand', 'held'],
    'lying->sitting': ['lie_to_sit'],
    'lying->standing': ['lie_to_sit', 'sit_to_stand'],
    'lying->sleeping': ['fall_asleep'],
    'lying->ledge': ['lie_to_sit', 'sit_to_stand', 'jump_ledge'],
    'lying->airborne': ['lie_to_sit', 'sit_to_stand', 'jump'],
    'lying->held': ['lie_to_sit', 'sit_to_stand', 'held'],
    'sitting->standing': ['sit_to_stand'],
    'sitting->lying': ['sit_to_lie'],
    'sitting->sleeping': ['sit_to_lie', 'fall_asleep'],
    'sitting->ledge': ['sit_to_stand', 'jump_ledge'],
    'sitting->airborne': ['sit_to_stand', 'jump'],
    'sitting->held': ['held'],
    'standing->sitting': ['stand_to_sit'],
    'standing->lying': ['stand_to_sit', 'sit_to_lie'],
    'standing->sleeping': ['stand_to_sit', 'sit_to_lie', 'fall_asleep'],
    'standing->ledge': ['jump_ledge'],
    'standing->airborne': ['jump'],
    'standing->held': ['held'],
    'ledge->standing': ['jump_down'],
    'ledge->sitting': ['jump_down', 'stand_to_sit'],
    'ledge->lying': ['jump_down', 'stand_to_sit', 'sit_to_lie'],
    'ledge->sleeping': ['jump_down', 'stand_to_sit', 'sit_to_lie', 'fall_asleep'],
    'ledge->airborne': ['jump_down'],
    'ledge->held': ['held'],
    'airborne->standing': ['land'],
    'airborne->sitting': ['land', 'stand_to_sit'],
    'airborne->lying': ['land', 'stand_to_sit', 'sit_to_lie'],
    'airborne->sleeping': ['land', 'stand_to_sit', 'sit_to_lie', 'fall_asleep'],
    'airborne->ledge': ['land', 'jump_ledge'],
    'airborne->held': ['held'],
    'held->standing': ['land'],
    'held->sitting': ['land', 'stand_to_sit'],
    'held->lying': ['land', 'stand_to_sit', 'sit_to_lie'],
    'held->sleeping': ['land', 'stand_to_sit', 'sit_to_lie', 'fall_asleep'],
    'held->ledge': ['land', 'jump_ledge'],
    'held->airborne': ['jump'],
  }
  return table[`${from}->${to}`] ?? ['recover_balance']
}
