import type { DeskEvent } from './desktop'

export interface TypingSample {
  active: boolean
  pace: 'gentle' | 'busy'
}
export interface TypingActivity extends TypingSample {
  app: string
  duration: number
  source?: 'os' | 'sim'
}
interface ActiveApplication { name: string; bundleId: string }

/** Transient cadence only: no key events, characters, clipboard or text history. */
export class TypingObserver {
  private application = ''
  private startedAt: number | null = null
  private lastPace: TypingSample['pace'] = 'gentle'

  clear(): void {
    this.application = ''
    this.startedAt = null
    this.lastPace = 'gentle'
  }

  sample(raw: unknown, app: ActiveApplication | null, enabled: boolean, now: number): { activity: TypingActivity | null; events: DeskEvent[] } {
    if (!enabled || !app || !raw || typeof raw !== 'object') {
      this.clear()
      return { activity: null, events: [] }
    }
    const value = raw as Partial<TypingSample>
    if (typeof value.active !== 'boolean' || !['gentle', 'busy'].includes(value.pace ?? '')) {
      this.clear()
      return { activity: null, events: [] }
    }
    const key = app.bundleId || app.name
    if (key !== this.application) {
      this.clear()
      this.application = key
    }
    const events: DeskEvent[] = []
    if (value.active) {
      if (this.startedAt === null) {
        this.startedAt = now
        events.push({ type: 'typing_started', app: app.name, source: 'os' })
      }
      this.lastPace = value.pace === 'busy' ? 'busy' : 'gentle'
      return {
        activity: {
          active: true, pace: this.lastPace, app: app.name, source: 'os',
          duration: Math.max(0, Math.min(3600, now - this.startedAt)),
        },
        events,
      }
    }
    if (this.startedAt !== null) {
      events.push({ type: 'typing_paused', app: app.name, duration: Math.max(0, Math.min(3600, now - this.startedAt)), source: 'os' })
      this.startedAt = null
    }
    return { activity: null, events }
  }
}
