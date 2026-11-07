import { suspendedLeg } from '../../core/rig'
import { clamp, smoothstep } from '../../core/math'
import type { Pose } from '../../core/pose'

const FUR = '#e2a44b'
const FUR_MID = '#d3923d'
const FUR_DEEP = '#b8742e'
const FUR_SHADOW = '#a5672a'
const LIGHT = '#f8ddb0'
const CREAM = '#fff6ea'
const CREAM_EDGE = '#f3d7b6'
const NOSE = '#3c2b29'
const EYE = '#2a211c'
const WHITE = '#fffdfb'
const INNER = '#f4b8ab'
const TONGUE = '#ee8d8c'
const LINE = 'rgba(96, 58, 28, 0.38)'

export interface DrawOrigin {
  x: number
  y: number
  scale: number
}

export function drawPuppy(
  ctx: CanvasRenderingContext2D,
  pose: Pose,
  originX: number,
  originY: number,
  scale: number,
  time: number,
  tailPhase = time * (3.2 + pose.tailWag * 0.18),
): void {
  const dir = pose.yaw >= 0 ? 1 : -1
  const profile = clamp(Math.abs(pose.yaw), 0, 1)
  const front = 1 - profile
  const sit = clamp(pose.sit, 0, 1) * (1 - clamp(pose.lie, 0, 1))
  const lie = clamp(pose.lie, 0, 1)
  const curl = clamp(pose.curl, 0, 1)
  const breath = 1 + Math.sin(time * 2.3) * 0.02 * clamp(pose.breath, 0.3, 2.4)
  const wag = Math.sin(tailPhase) * pose.tailWag
  const drop = sit * 22 + lie * 34 + Math.max(0, 1 - pose.squash) * 10 + pose.bodyY

  ctx.save()
  ctx.translate(originX, originY)
  ctx.scale(scale, scale)
  drawShadow(ctx, pose, sit, lie)
  ctx.translate(pose.bodyX, drop)
  ctx.rotate((clamp(pose.bodyRot, -32, 32) * Math.PI) / 180)
  ctx.scale(clamp(pose.stretch, 0.75, 1.35), clamp(pose.squash, 0.62, 1.35) * breath)

  const hipY = -30
  const shoulderY = -36
  const bodyX = dir * profile * 2
  drawTail(ctx, dir, pose, wag, hipY)
  drawLeg(ctx, dir * (-26 - front * 8), hipY, pose.legBL + sit * 62 * (1 - lie) + lie * 18, 0.72, true, sit, lie, pose.scratch > 0.4 && dir > 0, time, pose.held, pose.bodyRot)
  drawLeg(ctx, dir * (18 + front * 4), shoulderY, pose.legFL * 0.35 + lie * 46 + pose.danglers * 34, 0.78, false, 0, lie, false, time, pose.held, pose.bodyRot)
  drawBody(ctx, dir, profile, sit, lie, pose)
  drawLeg(ctx, dir * (-12 + front * 10), hipY, pose.legBR + sit * 58 * (1 - lie) + lie * 14, 1, true, sit, lie, pose.scratch > 0.4, time, pose.held, pose.bodyRot)
  drawLeg(ctx, dir * (24 - front * 6) + front * 12 * dir, shoulderY + 2, pose.legFR + lie * 40 + pose.danglers * 30, 1, false, 0, lie, false, time, pose.held, pose.bodyRot)

  const headX = bodyX + dir * (12 + profile * 24) + pose.headX + curl * dir * -8
  const headY = -78 + pose.headY + lie * 16 + curl * 12 + sit * 4
  ctx.save()
  ctx.translate(headX, headY)
  ctx.rotate((clamp(pose.headRot, -48, 48) * Math.PI) / 180)
  ctx.rotate((clamp(pose.headTilt, -36, 36) * Math.PI) / 180)
  // The skull hides the far ear in a side profile, including large twitches.
  const farEarOpacity = 1 - smoothstep((profile - 0.45) / 0.4)
  if (farEarOpacity > 0) {
    ctx.save()
    ctx.globalAlpha *= farEarOpacity
    const farTwitch = dir < 0 ? pose.earR : pose.earL
    drawEar(ctx, dir * (-30 * profile + 26 * front), -24, farTwitch, pose.alert, dir, true)
    ctx.restore()
  }
  drawHead(ctx, dir, profile, front, pose, time)
  ctx.restore()
  ctx.restore()
}

function drawShadow(ctx: CanvasRenderingContext2D, pose: Pose, sit: number, lie: number): void {
  const lift = clamp(pose.air, 0, 1)
  ctx.save()
  ctx.globalAlpha = 1 - clamp(pose.held, 0, 1)
  ctx.fillStyle = `rgba(70, 48, 24, ${0.2 - lift * 0.1})`
  ctx.beginPath()
  ctx.ellipse(pose.bodyX * 0.3, 8, 46 - sit * 6 - lift * 16, 10 - lie * 2, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawBody(ctx: CanvasRenderingContext2D, dir: number, profile: number, sit: number, lie: number, pose: Pose): void {
  const gradient = ctx.createRadialGradient(-16, -62, 8, 0, -48, 70)
  gradient.addColorStop(0, LIGHT)
  gradient.addColorStop(0.45, FUR)
  gradient.addColorStop(1, FUR_DEEP)
  ctx.fillStyle = gradient
  ctx.strokeStyle = LINE
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.ellipse(dir * profile * 2, -50, 50 + lie * 6, 32 - sit * 2, dir * lie * -0.15, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = 'rgba(184, 116, 46, 0.28)'
  ctx.beginPath()
  ctx.ellipse(-dir * 10, -62, 16, 10, -0.4, 0, Math.PI * 2)
  ctx.fill()

  const chest = ctx.createRadialGradient(dir * 16, -40, 2, dir * 18, -36, 28)
  chest.addColorStop(0, CREAM)
  chest.addColorStop(1, CREAM_EDGE)
  ctx.fillStyle = chest
  ctx.beginPath()
  ctx.ellipse(dir * (16 + profile * 6), -40 + sit * 2, 18 + pose.chest * 2, 16, dir * 0.3, 0, Math.PI * 2)
  ctx.fill()
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  dir: number,
  profile: number,
  front: number,
  pose: Pose,
  time: number,
): void {
  const gradient = ctx.createRadialGradient(-10, -16, 4, 0, 0, 42)
  gradient.addColorStop(0, '#f7d7a4')
  gradient.addColorStop(0.55, FUR)
  gradient.addColorStop(1, FUR_MID)
  ctx.fillStyle = gradient
  ctx.strokeStyle = LINE
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.arc(0, 0, 34, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // The near ear overlaps the skull; drawing both ears behind it hid the twitches.
  drawEar(ctx, dir * (-22 - front * 4), -20, dir < 0 ? pose.earL : pose.earR, pose.alert, dir, false)

  const muzzleX = dir * (8 + profile * 14)
  const muzzleY = 12 + pose.sniff * 3 + pose.muzzle * 0.6
  ctx.fillStyle = CREAM
  ctx.beginPath()
  ctx.ellipse(muzzleX, muzzleY, 16 + profile * 4, 12, dir * 0.15, 0, Math.PI * 2)
  ctx.fill()

  const noseX = muzzleX + dir * (8 + profile * 4)
  const noseY = muzzleY - 2
  ctx.fillStyle = NOSE
  ctx.beginPath()
  ctx.ellipse(noseX, noseY, 5.2, 4.1, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.beginPath()
  ctx.ellipse(noseX - dir * 1.4, noseY - 1.2, 1.6, 1, 0, 0, Math.PI * 2)
  ctx.fill()

  drawMouth(ctx, noseX, muzzleY + 6, dir, pose.mouth, time)
  drawEye(ctx, dir * (2 + profile * 8) - front * 12, -4, pose.eyeL, pose.pupilX, pose.pupilY, pose.browL, front > 0.2 ? 1 : profile < 0.82 ? 0.9 : dir < 0 ? 1 : 0.15)
  drawEye(ctx, dir * (2 + profile * 8) + front * 12, -4, pose.eyeR, pose.pupilX, pose.pupilY, pose.browR, front > 0.2 ? 1 : profile < 0.82 ? 0.9 : dir > 0 ? 1 : 0.15)

  ctx.fillStyle = 'rgba(244, 170, 150, 0.35)'
  ctx.beginPath()
  ctx.ellipse(dir * -14 - front * 6, 8, 6, 3.2, 0, 0, Math.PI * 2)
  ctx.fill()
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  openness: number,
  pupilX: number,
  pupilY: number,
  brow: number,
  alpha: number,
): void {
  if (alpha < 0.05) return
  const open = clamp(openness, 0, 1)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  if (open < 0.12) {
    ctx.strokeStyle = 'rgba(90, 58, 36, 0.85)'
    ctx.lineWidth = 1.6
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-7, 0.5)
    ctx.quadraticCurveTo(0, 2.4, 7, 0.5)
    ctx.stroke()
  } else {
  ctx.fillStyle = WHITE
  ctx.beginPath()
  ctx.ellipse(0, 0, 8.2, Math.max(1.6, 9.2 * open), 0, 0, Math.PI * 2)
  ctx.fill()
  if (open > 0.18) {
    ctx.fillStyle = EYE
    ctx.beginPath()
    ctx.arc(clamp(pupilX, -1, 1) * 2.4, clamp(pupilY, -1, 1) * 2.2, 4.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = WHITE
    ctx.beginPath()
    ctx.arc(-1.5, -1.8, 1.5, 0, Math.PI * 2)
    ctx.fill()
  }
  }
  ctx.strokeStyle = 'rgba(120, 72, 36, 0.45)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(-7, -9 - brow * 3)
  ctx.quadraticCurveTo(0, -12 - brow * 5, 7, -8 - brow * 2)
  ctx.stroke()
  ctx.restore()
}

function drawMouth(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, mouth: number, time: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = 'rgba(120, 64, 48, 0.75)'
  ctx.fillStyle = TONGUE
  ctx.lineWidth = 1.4
  ctx.lineCap = 'round'
  if (mouth > 3.2) {
    ctx.beginPath()
    ctx.ellipse(dir * 1, 4, 8, 7, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = 'rgba(80, 40, 36, 0.35)'
    ctx.fill()
  } else if (mouth > 2.2) {
    ctx.beginPath()
    ctx.ellipse(dir * 1, 3, 6.5, 5.5, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#5c3330'
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(dir * 1, 6, 4.5, 3.4, 0, 0, Math.PI)
    ctx.fillStyle = TONGUE
    ctx.fill()
  } else if (mouth > 1.15) {
    ctx.beginPath()
    ctx.ellipse(dir * 1, 2, 6, 3.4, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#5a3432'
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(dir * 1, 4.5 + Math.sin(time * 8) * 0.4, 3.6, 2.6, 0, 0, Math.PI)
    ctx.fillStyle = TONGUE
    ctx.fill()
  } else if (mouth < -0.25) {
    ctx.beginPath()
    ctx.moveTo(-6, 2)
    ctx.quadraticCurveTo(0, -2, 6, 2)
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.moveTo(-6, 0)
    ctx.quadraticCurveTo(0, 4 + mouth * 2, 6, 0)
    ctx.stroke()
  }
  ctx.restore()
}

function drawEar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  twitch: number,
  alert: number,
  dir: number,
  back: boolean,
): void {
  ctx.save()
  ctx.translate(x, y)
  // Mirror the complete ear, including its shape, rest angle and twitch.
  ctx.scale(dir, 1)
  const flip = back ? -1 : 1
  const swing = clamp(twitch, -70, 70)
  ctx.rotate(flip * (0.35 - alert * 0.85) + (swing * Math.PI) / 180 + (back ? 0.15 : -0.05))
  ctx.fillStyle = back ? FUR_MID : FUR
  ctx.strokeStyle = LINE
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(0, 2)
  ctx.quadraticCurveTo(-16, 18, -10, 42)
  ctx.quadraticCurveTo(-2, 52, 10, 40)
  ctx.quadraticCurveTo(16, 22, 6, 0)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = INNER
  ctx.beginPath()
  ctx.moveTo(0, 10)
  ctx.quadraticCurveTo(-8, 24, -4, 36)
  ctx.quadraticCurveTo(2, 40, 6, 30)
  ctx.quadraticCurveTo(8, 18, 2, 8)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawLeg(
  ctx: CanvasRenderingContext2D,
  hipX: number,
  hipY: number,
  angle: number,
  shade: number,
  hind: boolean,
  sit: number,
  lie: number,
  scratch: boolean,
  time: number,
  held: number,
  bodyRotation: number,
): void {
  ctx.save()
  ctx.translate(hipX, hipY)
  const folded = hind && sit > 0.55 && lie < 0.35 && !scratch
  ctx.fillStyle = shade < 0.9 ? FUR_SHADOW : FUR_MID
  ctx.strokeStyle = LINE
  ctx.lineWidth = 1.2
  if (held > 0.5) {
    const leg = suspendedLeg(bodyRotation, time, hind, shade < 0.9)
    ctx.rotate(leg.upperAngle * Math.PI / 180)
    capsule(ctx, 0, 0, hind ? 13 : 12, leg.upperLength)
    ctx.translate(0, leg.upperLength - 2)
    ctx.rotate(leg.lowerAngle * Math.PI / 180)
    capsule(ctx, 0, 0, 10, leg.lowerLength)
    ctx.translate(0, leg.lowerLength)
    ctx.rotate((hind ? 12 : 18) * Math.PI / 180)
    paw(ctx, 0, 0)
  } else if (scratch) {
    const pump = Math.sin(time * 16) * 0.28
    ctx.rotate(-1.15 + pump)
    capsule(ctx, 0, 0, 12, 28)
    paw(ctx, 0, 28)
  } else if (folded) {
    ctx.rotate(0.7)
    capsule(ctx, 0, 0, 14, 22)
    ctx.translate(6, 20)
    ctx.beginPath()
    ctx.ellipse(0, 0, 11, 7, 0.2, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.rotate((clamp(angle, -75, 85) * Math.PI) / 180)
    capsule(ctx, 0, 0, hind ? 13 : 12, lie > 0.4 ? 26 : 30)
    paw(ctx, 0, lie > 0.4 ? 26 : 30)
  }
  ctx.restore()
}

function capsule(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.beginPath()
  ctx.roundRect(x - w / 2, y, w, h, w / 2)
  ctx.fill()
  ctx.stroke()
}

function paw(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath()
  ctx.ellipse(x, y + 2, 9, 6.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = CREAM_EDGE
  ctx.beginPath()
  ctx.ellipse(x - 3, y + 4, 2, 1.5, 0, 0, Math.PI * 2)
  ctx.ellipse(x + 3, y + 4, 2, 1.5, 0, 0, Math.PI * 2)
  ctx.fill()
}

function drawTail(ctx: CanvasRenderingContext2D, dir: number, pose: Pose, wag: number, hipY: number): void {
  ctx.save()
  ctx.translate(-dir * 40, hipY - 16)
  const lift = (clamp(pose.tailLift + wag, -25, 95) * Math.PI) / 180
  ctx.rotate(-dir * (0.2 + lift))
  const curl = clamp(pose.tailCurl, 0, 1)
  ctx.fillStyle = FUR
  ctx.strokeStyle = LINE
  ctx.lineWidth = 1.2
  for (let i = 0; i < 5; i++) {
    const t = i / 4
    const along = 8 + i * 9
    const bend = curl * Math.sin(t * Math.PI) * 18
    ctx.beginPath()
    ctx.arc(-dir * bend, -along, 11 - i * 1.1, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = LIGHT
  ctx.beginPath()
  ctx.arc(curl * 6, -46, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export function puppyContains(px: number, py: number, pose: Pose, originX: number, originY: number, scale: number): boolean {
  const dx = (px - originX) / scale - pose.bodyX
  const sit = clamp(pose.sit, 0, 1)
  const lie = clamp(pose.lie, 0, 1)
  const drop = sit * 22 + lie * 34 + pose.bodyY
  const dy = (py - originY) / scale - drop
  const inBody = (dx * dx) / (58 * 58) + ((dy + 50) * (dy + 50)) / (40 * 40) <= 1
  const dir = pose.yaw >= 0 ? 1 : -1
  const hx = dir * 28
  const hy = -78 + pose.headY
  const hdx = dx - hx
  const hdy = dy - hy
  const inHead = hdx * hdx + hdy * hdy <= 40 * 40
  return inBody || inHead
}
