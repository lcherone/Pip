import { isTrick } from './tricks'
import { clamp } from './math'

export const ACTIVITIES = ['sleep', 'wander', 'approach', 'chase', 'follow', 'yawn', 'sit', 'emote'] as const
export type Activity = typeof ACTIVITIES[number]
export type Feedback = 1 | -1
export interface Preference { score: number; encouraged: number; discouraged: number }
export type LearningMemory = Partial<Record<Activity, Preference>>

export const ACTIVITY_LABELS: Record<Activity, string> = {
  sleep: 'Sleeping', wander: 'Wandering', approach: 'Exploring windows', chase: 'Chasing the cursor',
  follow: 'Following you', yawn: 'Yawning', sit: 'Resting quietly', emote: 'Idle expressions',
}

export function isActivity(value: unknown): value is Activity {
  return typeof value === 'string' && (ACTIVITIES as readonly string[]).includes(value)
}

export function hydrateLearning(raw: unknown): LearningMemory {
  const memory: LearningMemory = {}
  if (!raw || typeof raw !== 'object') return memory
  for (const id of ACTIVITIES) {
    const item = (raw as Record<string, unknown>)[id]
    if (!item || typeof item !== 'object') continue
    const value = item as Partial<Preference>
    if (typeof value.score !== 'number' || !Number.isFinite(value.score)) continue
    const count = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? Math.floor(clamp(n, 0, 10000)) : 0
    memory[id] = { score: clamp(value.score, -1, 1), encouraged: count(value.encouraged), discouraged: count(value.discouraged) }
  }
  return memory
}

export function learnFeedback(memory: LearningMemory, activity: Activity, feedback: Feedback): LearningMemory {
  const previous = memory[activity] ?? { score: 0, encouraged: 0, discouraged: 0 }
  return {
    ...memory,
    [activity]: {
      score: clamp(previous.score + feedback * 0.1, -1, 1),
      encouraged: Math.min(10000, previous.encouraged + (feedback === 1 ? 1 : 0)),
      discouraged: Math.min(10000, previous.discouraged + (feedback === -1 ? 1 : 0)),
    },
  }
}

/** A small utility bias; unavailable activities and explicit modes still win. */
export function learningBias(activity: Activity, memory: LearningMemory, history: string[]): number {
  const preference = (memory[activity]?.score ?? 0) * 0.35
  const repeats = history.slice(-3).filter((id) => id === activity).length
  return preference - repeats * 0.08
}

export function activityForAction(action: string): Activity | null {
  if (isActivity(action)) return action
  if (isTrick(action)) return 'emote'
  if (action === 'play_window') return 'approach'
  if (action === 'idle_sit' || action === 'stay' || action === 'sad') return 'sit'
  if (action === 'stand' || action === 'stand_watch' || action === 'rest_surface' || action === 'quirk' || action === 'tease' || action === 'attend' || action === 'cover_notice') return 'emote'
  if (action === 'dodge') return 'approach'
  if (['head_tilt', 'paw_adjust', 'curious', 'ear_twitch_left', 'nose_twitch', 'weight_shift', 'notice', 'sniff', 'perk', 'peek', 'listen', 'duck', 'shake_off', 'sniff_frame', 'paw_glass', 'settle_paws', 'tail_chase', 'paw_wave', 'knead', 'doze', 'lick_nose', 'wiggle', 'pounce', 'stretch_side', 'pant', 'peek_along'].includes(action)) return 'emote'
  return null
}
