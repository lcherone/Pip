export interface Pose {
  yaw: number
  sit: number
  lie: number
  curl: number
  air: number
  held: number
  ledge: number
  bodyX: number
  bodyY: number
  bodyRot: number
  trickRot: number
  trickPivot: number
  squash: number
  stretch: number
  headX: number
  headY: number
  headRot: number
  headTilt: number
  eyeL: number
  eyeR: number
  pupilX: number
  pupilY: number
  browL: number
  browR: number
  mouth: number
  muzzle: number
  earL: number
  earR: number
  tailLift: number
  tailWag: number
  tailCurl: number
  legFL: number
  legFR: number
  legBL: number
  legBR: number
  scratch: number
  sniff: number
  breath: number
  alert: number
  chest: number
  danglers: number
}

export type PoseKey = keyof Pose

export const POSE_KEYS = Object.keys(defaultPose()) as PoseKey[]

export function defaultPose(): Pose {
  return {
    yaw: 1,
    sit: 0,
    lie: 0,
    curl: 0,
    air: 0,
    held: 0,
    ledge: 0,
    bodyX: 0,
    bodyY: 0,
    bodyRot: 0,
    trickRot: 0,
    trickPivot: 0,
    squash: 1,
    stretch: 1,
    headX: 0,
    headY: 0,
    headRot: 0,
    headTilt: 0,
    eyeL: 1,
    eyeR: 1,
    pupilX: 0,
    pupilY: 0,
    browL: 0,
    browR: 0,
    mouth: 0.25,
    muzzle: 0,
    earL: 0,
    earR: 0,
    tailLift: 24,
    tailWag: 3,
    tailCurl: 0.25,
    legFL: 0,
    legFR: 0,
    legBL: 0,
    legBR: 0,
    scratch: 0,
    sniff: 0,
    breath: 1,
    alert: 0,
    chest: 0,
    danglers: 0,
  }
}

export function clonePose(pose: Pose): Pose {
  return { ...pose }
}

export function poseFrom(partial: Partial<Pose>): Pose {
  return { ...defaultPose(), ...partial }
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out = defaultPose()
  for (const key of POSE_KEYS) {
    out[key] = a[key] + (b[key] - a[key]) * t
  }
  return out
}

export function addDelta(pose: Pose, delta: Partial<Pose>, weight = 1): Pose {
  const out = clonePose(pose)
  for (const key of Object.keys(delta) as PoseKey[]) {
    const value = delta[key]
    if (value === undefined) continue
    out[key] += value * weight
  }
  out.eyeL = clamp01(out.eyeL)
  out.eyeR = clamp01(out.eyeR)
  out.sit = clamp01(out.sit)
  out.lie = clamp01(out.lie)
  out.curl = clamp01(out.curl)
  return out
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function finitePose(pose: Pose): boolean {
  return POSE_KEYS.every((key) => Number.isFinite(pose[key]))
}

export type BodyState = 'standing' | 'sitting' | 'lying' | 'sleeping' | 'airborne' | 'held' | 'ledge'

export function deriveBodyState(pose: Pose): BodyState {
  if (pose.held > 0.65) return 'held'
  if (pose.air > 0.65) return 'airborne'
  if (pose.ledge > 0.65) return 'ledge'
  if (pose.curl > 0.72 && pose.lie > 0.45) return 'sleeping'
  if (pose.lie > 0.55) return 'lying'
  if (pose.sit > 0.55) return 'sitting'
  return 'standing'
}
