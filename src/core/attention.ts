import { clamp } from './math'

export interface AttentionTarget { id: string; x: number; y: number; score: number; label: string; body: boolean }
export interface AttentionState {
  target: AttentionTarget | null
  since: number
  phase: 'idle' | 'eyes' | 'head' | 'body'
}

/** Stable attention with hysteresis. Eye, head and body decisions are separate. */
export class AttentionController {
  private current: AttentionTarget | null = null
  private since = 0
  private previousHead: { x: number; y: number } | null = null
  private head: { x: number; y: number } | null = null
  private lastNow = 0

  update(now: number, candidates: AttentionTarget[]): { eyes: AttentionTarget | null; head: { x: number; y: number } | null; bodyX: number | null; state: AttentionState } {
    const valid = candidates.filter(target => Number.isFinite(target.x) && Number.isFinite(target.y) && Number.isFinite(target.score))
    const best = valid.slice().sort((a, b) => b.score - a.score)[0] ?? null
    const retained = valid.find(target => target.id === this.current?.id)
    const elapsed = now - this.since
    if (!retained || (best && best.id !== retained.id && elapsed >= 0.8 && best.score > retained.score + 0.3)) {
      this.previousHead = this.head
      this.current = best
      this.since = now
    } else if (retained) this.current = retained
    const held = Math.max(0, now - this.since)
    const dt = clamp(now - this.lastNow, 0, 0.2)
    this.lastNow = now
    if (held >= 0.12 && this.current) {
      const target = this.current
      if (!this.head) this.head = { x: target.x, y: target.y }
      const weight = 1 - Math.exp(-dt * 9)
      this.head.x += (target.x - this.head.x) * weight
      this.head.y += (target.y - this.head.y) * weight
    }
    const head = held < 0.12 ? this.previousHead : this.head
    const bodyX = held >= 0.55 && this.current?.body ? this.current.x : null
    const phase = !this.current ? 'idle' : held < 0.12 ? 'eyes' : bodyX === null ? 'head' : 'body'
    return { eyes: this.current, head, bodyX, state: { target: this.current, since: this.since, phase } }
  }

  reset(): void { this.current = null; this.head = null; this.previousHead = null; this.since = 0 }
}
