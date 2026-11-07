export type PipMode = 'playful' | 'chill' | 'focus' | 'sleep'
export type AnimationQuality = 'high' | 'balanced' | 'saver'
export type SandboxChoice = 'read-only' | 'workspace-write'

export interface Personality {
  curiosity: number
  playfulness: number
  energy: number
  confidence: number
  sociability: number
  attentionSeeking: number
  sleepiness: number
  excitability: number
  independence: number
}

export interface Settings {
  enabled: boolean
  launchAtLogin: boolean
  scale: number
  sounds: boolean
  quality: AnimationQuality
  mode: PipMode
  personality: Personality
  followWindows: boolean
  windowInteractionFrequency: 'low' | 'normal' | 'high'
  reactToTyping: boolean
  windowClimbing: boolean
  followCursor: boolean
  multiMonitor: boolean
  hideDuringFullscreen: boolean
  desktopAwareness: boolean
  codexEnabled: boolean
  codexPath: string
  codexModel: string
  codexCwd: string
  shareDesktopContext: boolean
  sandbox: SandboxChoice
  allowWindowTitles: boolean
  blockedApps: string[]
  diagnostics: boolean
  memoryEnabled: boolean
  learningEnabled: boolean
  assistantMemoryEnabled: boolean
  assistantSuggestions: 'off' | 'low' | 'normal'
  assistantIntegration: boolean
  releaseDelay: number
}

export const DEFAULT_PERSONALITY: Personality = {
  curiosity: 0.62,
  playfulness: 0.58,
  energy: 0.55,
  confidence: 0.5,
  sociability: 0.64,
  attentionSeeking: 0.42,
  sleepiness: 0.38,
  excitability: 0.56,
  independence: 0.45,
}

export function defaultSettings(): Settings {
  return {
    enabled: true,
    launchAtLogin: false,
    scale: 1,
    sounds: false,
    quality: 'balanced',
    mode: 'chill',
    personality: { ...DEFAULT_PERSONALITY },
    followWindows: true,
    windowInteractionFrequency: 'normal',
    reactToTyping: true,
    windowClimbing: true,
    followCursor: true,
    multiMonitor: true,
    hideDuringFullscreen: true,
    desktopAwareness: true,
    codexEnabled: false,
    codexPath: '',
    codexModel: '',
    codexCwd: '',
    shareDesktopContext: false,
    sandbox: 'read-only',
    allowWindowTitles: false,
    blockedApps: [],
    diagnostics: false,
    memoryEnabled: true,
    learningEnabled: true,
    assistantMemoryEnabled: true,
    assistantSuggestions: 'low',
    assistantIntegration: false,
    releaseDelay: 0.7,
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

export function sanitizePersonality(input: Partial<Personality> | undefined): Personality {
  const base = { ...DEFAULT_PERSONALITY }
  if (!input) return base
  for (const key of Object.keys(base) as (keyof Personality)[]) {
    if (typeof input[key] === 'number') base[key] = clamp01(input[key] as number)
  }
  return base
}

export function sanitizeSettings(input: Partial<Settings> | undefined): Settings {
  const base = defaultSettings()
  if (!input) return base
  const modes: PipMode[] = ['playful', 'chill', 'focus', 'sleep']
  const qualities: AnimationQuality[] = ['high', 'balanced', 'saver']
  return {
    ...base,
    ...input,
    scale: Number.isFinite(input.scale) ? Math.max(0.7, Math.min(1.6, input.scale as number)) : base.scale,
    mode: modes.includes(input.mode as PipMode) ? (input.mode as PipMode) : base.mode,
    quality: qualities.includes(input.quality as AnimationQuality) ? (input.quality as AnimationQuality) : base.quality,
    sandbox: input.sandbox === 'workspace-write' ? 'workspace-write' : 'read-only',
    personality: sanitizePersonality(input.personality),
    assistantMemoryEnabled: typeof input.assistantMemoryEnabled === 'boolean' ? input.assistantMemoryEnabled : base.assistantMemoryEnabled,
    assistantIntegration: input.assistantIntegration === true,
    assistantSuggestions: ['off', 'low', 'normal'].includes(input.assistantSuggestions ?? '') ? input.assistantSuggestions! : base.assistantSuggestions,
    reactToTyping: typeof input.reactToTyping === 'boolean' ? input.reactToTyping : base.reactToTyping,
    windowInteractionFrequency: ['low', 'normal', 'high'].includes(input.windowInteractionFrequency ?? '') ? input.windowInteractionFrequency! : base.windowInteractionFrequency,
    learningEnabled: typeof input.learningEnabled === 'boolean' ? input.learningEnabled : base.learningEnabled,
    blockedApps: Array.isArray(input.blockedApps) ? input.blockedApps.map(String).slice(0, 40) : [],
    releaseDelay: Number.isFinite(input.releaseDelay)
      ? Math.max(0, Math.min(5, input.releaseDelay as number))
      : base.releaseDelay,
    codexModel: typeof input.codexModel === 'string' ? input.codexModel : '',
    codexPath: typeof input.codexPath === 'string' ? input.codexPath : '',
    codexCwd: typeof input.codexCwd === 'string' ? input.codexCwd : '',
  }
}

/** Mode biases the saved personality without overwriting the sliders. */
export function effectivePersonality(personality: Personality, mode: PipMode): Personality {
  const p = { ...personality }
  if (mode === 'playful') {
    p.playfulness = clamp01(p.playfulness * 1.25 + 0.15)
    p.energy = clamp01(p.energy * 1.2 + 0.1)
    p.excitability = clamp01(p.excitability * 1.2 + 0.1)
    p.sleepiness = clamp01(p.sleepiness * 0.55)
    p.curiosity = clamp01(p.curiosity * 1.1)
  } else if (mode === 'chill') {
    p.energy = clamp01(p.energy * 0.62)
    p.playfulness = clamp01(p.playfulness * 0.55)
    p.attentionSeeking = clamp01(p.attentionSeeking * 0.7)
    p.sleepiness = clamp01(p.sleepiness * 1.15 + 0.05)
  } else if (mode === 'focus') {
    p.playfulness = clamp01(p.playfulness * 0.15)
    p.attentionSeeking = clamp01(p.attentionSeeking * 0.1)
    p.excitability = clamp01(p.excitability * 0.25)
    p.curiosity = clamp01(p.curiosity * 0.45)
    p.sociability = clamp01(p.sociability * 0.35)
  } else if (mode === 'sleep') {
    p.sleepiness = 1
    p.energy = 0.15
    p.playfulness = 0.05
    p.attentionSeeking = 0.05
    p.excitability = 0.05
  }
  return p
}
