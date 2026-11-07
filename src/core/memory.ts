import { hydrateAnimationReport, type AnimationReport } from './animation/coach'
import { hydrateLearning, type LearningMemory } from './learning'
import { defaultSettings, sanitizeSettings, type Settings } from './settings'
import { hydrateEnvironment, type EnvironmentMemory } from './world'

export interface PersistedState {
  version: 1
  settings: Settings
  position: { x: number; y: number } | null
  affinity: Record<string, number>
  interactionCount: number
  recentActions: string[]
  learning: LearningMemory
  animationReport: AnimationReport | null
  codexThreadId: string | null
  launchCount: number
  environment: EnvironmentMemory
}

export function freshState(): PersistedState {
  return {
    version: 1,
    settings: defaultSettings(),
    position: null,
    affinity: {},
    interactionCount: 0,
    recentActions: [],
    learning: {},
    animationReport: null,
    codexThreadId: null,
    launchCount: 0,
    environment: hydrateEnvironment(null),
  }
}

export function hydrate(raw: unknown): PersistedState {
  const fresh = freshState()
  if (!raw || typeof raw !== 'object') return fresh
  const value = raw as Partial<PersistedState>
  const affinity: Record<string, number> = {}
  if (value.affinity && typeof value.affinity === 'object') {
    for (const [key, score] of Object.entries(value.affinity)) {
      if (typeof score === 'number' && Number.isFinite(score)) affinity[key] = Math.max(0, Math.min(20, score))
    }
  }
  return {
    version: 1,
    settings: sanitizeSettings(value.settings),
    position:
      value.position && Number.isFinite(value.position.x) && Number.isFinite(value.position.y)
        ? { x: value.position.x, y: value.position.y }
        : null,
    affinity,
    interactionCount: typeof value.interactionCount === 'number' ? value.interactionCount : 0,
    recentActions: Array.isArray(value.recentActions) ? value.recentActions.map(String).slice(-24) : [],
    learning: hydrateLearning(value.learning),
    animationReport: hydrateAnimationReport(value.animationReport),
    codexThreadId: typeof value.codexThreadId === 'string' ? value.codexThreadId : null,
    launchCount: typeof value.launchCount === 'number' ? value.launchCount : 0,
    environment: hydrateEnvironment(value.environment),
  }
}

export function clearMemory(state: PersistedState): PersistedState {
  return {
    ...freshState(),
    settings: state.settings,
    launchCount: state.launchCount,
    position: state.position,
  }
}

export function noteRest(affinity: Record<string, number>, app: string): Record<string, number> {
  if (!app) return affinity
  return { ...affinity, [app]: Math.min(20, (affinity[app] ?? 0) + 1) }
}

export function rememberAction(history: string[], action: string): string[] {
  return [...history, action].slice(-24)
}

export function affinityScore(affinity: Record<string, number>, app: string): number {
  return affinity[app] ?? 0
}
