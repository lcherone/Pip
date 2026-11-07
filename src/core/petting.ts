/** Turn deliberate mouse strokes into bounded pats, without counting idle hover. */
export class PettingTracker {
  private previous: { x: number; y: number } | null = null
  private distance = 0
  private lastPat = -Infinity

  sample(now: number, x: number, y: number, eligible: boolean, scale = 1): boolean {
    if (!eligible || ![now, x, y].every(Number.isFinite)) {
      this.reset()
      return false
    }
    const entered = !this.previous
    if (this.previous) {
      this.distance += Math.min(40, Math.hypot(x - this.previous.x, y - this.previous.y) / Math.max(0.5, scale))
    }
    this.previous = { x, y }
    if (now - this.lastPat < 0.65 || (!entered && this.distance < 18)) return false
    this.lastPat = now
    this.distance = 0
    return true
  }

  reset(): void {
    this.previous = null
    this.distance = 0
  }
}
