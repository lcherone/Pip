import { isTrick } from '../tricks'
import { AnimationEngine } from './engine'
import { getClip, listClips } from './clips'
import { finitePose, type Pose, type PoseKey } from '../pose'

export interface AnimationCheck {
  id: string
  passed: boolean
  transitionBefore: number
  transitionAfter: number
  blendDuration: number
  tuned: boolean
}
export interface AnimationReport {
  checkedAt: string
  results: AnimationCheck[]
  durations: Record<string, number>
}

const SCALES: Partial<Record<PoseKey, number>> = {
  bodyX: 8, bodyY: 8, bodyRot: 12, trickRot: 18, headX: 8, headY: 8,
  headRot: 12, headTilt: 12, yaw: 0.3, sit: 0.2, lie: 0.2, curl: 0.2,
}

function poseStep(a: Pose, b: Pose): number {
  return Math.max(...Object.entries(SCALES).map(([key, scale]) => Math.abs(a[key as PoseKey] - b[key as PoseKey]) / scale))
}

function trial(id: string, blendDuration: number) {
  const clip = getClip(id)!
  const engine = new AnimationEngine()
  engine.setTransitionDurations({ [id]: blendDuration })
  engine.reset(clip.from[0])
  let previous = engine.update(0)
  engine.play(id, { force: true, once: true })
  let peak = 0
  let safe = true
  let complete = false
  for (let step = 1; step <= Math.ceil((clip.duration + 12) * 60); step++) {
    const time = step / 60
    const phase = time / clip.duration % 1
    const frame = engine.update(1 / 60, { phase, time, held: id === 'held' })
    const raw = clip.sample(Math.min(0.999, time / clip.duration), { phase, time })
    safe = safe && finitePose(frame.pose) && Object.values(raw).every(Number.isFinite)
    if (frame.debug.clips[0]?.id === id && (frame.debug.transitioning || previous.debug.transitioning)) {
      peak = Math.max(peak, poseStep(previous.pose, frame.pose))
    }
    previous = frame
    if (frame.completedIds.includes(id)) {
      complete = true
      break
    }
  }
  return { passed: safe && complete && (!clip.end || engine.bodyState === clip.end), peak }
}

/** Tests the real engine, then keeps only measured improvements to transition timing. */
export function checkAnimation(id: string): AnimationCheck {
  const clip = getClip(id)
  if (!clip) throw new Error(`Unknown animation: ${id}`)
  const baseline = trial(id, 0.18)
  let best = baseline
  let duration = 0.18
  const physicalTiming = clip.markers?.some((marker) => ['takeoff', 'land', 'impact'].includes(marker.name))
  // Physical takeoff/impact timing and direct pickup are never retimed by the coach.
  if (baseline.passed && baseline.peak > 0.35 && clip.blend === 'base' && id !== 'held' && !isTrick(id) && !physicalTiming) {
    for (const candidate of [0.26, 0.36, 0.48]) {
      if (candidate > clip.duration * 0.6) continue
      const attempt = trial(id, candidate)
      if (attempt.passed && attempt.peak < best.peak * 0.9) {
        best = attempt
        duration = candidate
      }
    }
  }
  return {
    id, passed: best.passed, transitionBefore: baseline.peak, transitionAfter: best.peak,
    blendDuration: duration, tuned: duration > 0.18,
  }
}

export async function checkAnimations(): Promise<AnimationReport> {
  const results: AnimationCheck[] = []
  const durations: Record<string, number> = {}
  for (const clip of listClips()) {
    const result = checkAnimation(clip.id)
    results.push(result)
    if (result.passed && result.tuned) durations[result.id] = result.blendDuration
    // Yield between clips so the desktop and controls remain responsive.
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  return { checkedAt: new Date().toISOString(), results, durations }
}

export function hydrateAnimationReport(raw: unknown): AnimationReport | null {
  if (!raw || typeof raw !== 'object') return null
  const report = raw as Partial<AnimationReport>
  if (!Array.isArray(report.results) || typeof report.checkedAt !== 'string') return null
  const results: AnimationCheck[] = []
  const durations: Record<string, number> = {}
  const ids = new Set<string>()
  for (const result of report.results) {
    if (!result || typeof result !== 'object' || !getClip(result.id) || ids.has(result.id)) continue
    if (![result.transitionBefore, result.transitionAfter, result.blendDuration].every(Number.isFinite)) continue
    if (result.blendDuration < 0.18 || result.blendDuration > 0.48) continue
    ids.add(result.id)
    const tuned = result.passed === true && result.blendDuration > 0.18 && result.transitionAfter < result.transitionBefore * 0.9
    results.push({ id: result.id, passed: result.passed === true, tuned, transitionBefore: result.transitionBefore, transitionAfter: result.transitionAfter, blendDuration: result.blendDuration })
    if (tuned) durations[result.id] = result.blendDuration
  }
  if (results.length !== listClips().length) return null
  return { checkedAt: report.checkedAt.slice(0, 80), results, durations }
}
