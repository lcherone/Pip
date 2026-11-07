import type { WorldDebugSnapshot } from './world'
import type { TypingActivity } from '../core/activity'
import type { BrainSnapshot, ConversationScope } from '../core/assistant/types'
import type { AnimationReport } from '../core/animation/coach'
import type { Activity, Feedback, LearningMemory } from '../core/learning'
import type { CodexStatus } from '../core/codex'
import type { DeskEvent, DesktopWindow, DisplayInfo } from '../core/desktop'
import type { PersistedState } from '../core/memory'
import type { Settings } from '../core/settings'
import type { EnvironmentMemory } from '../core/world'

export interface DesktopPayload {
  windows: DesktopWindow[]
  displays: DisplayInfo[]
  frontmost: { name: string; bundleId: string } | null
  idleSeconds: number
  typing?: TypingActivity | null
  fullscreen: boolean
  accessibility?: boolean
  permission: 'unknown' | 'granted' | 'limited' | 'denied'
  source: 'os' | 'unavailable'
  events: DeskEvent[]
}

export interface BootPayload {
  settings: Settings
  position: { x: number; y: number } | null
  displays: DisplayInfo[]
  codexStatus: CodexStatus
  codexDetail: string
  state: PersistedState
}

export interface PetFrame {
  x: number
  y: number
  width: number
  height: number
  anchorX: number
  anchorY: number
}

export interface CodexPush {
  kind: 'status' | 'delta' | 'reply' | 'approval' | 'cleared' | 'models'
  status?: CodexStatus
  detail?: string
  text?: string
  intention?: string
  title?: string
  approvalDetail?: string
  approvalId?: number | string
  models?: { id: string; displayName: string }[]
}

export interface MemoryPayload {
  affinity: Record<string, number>
  learning: LearningMemory
  animationReport: AnimationReport | null
  recentActions: string[]
}

export type BrainCommand =
  | { type: 'select-project'; id: string | null }
  | { type: 'register-project' }
  | { type: 'remove-project'; id: string }
  | { type: 'refresh-project' }
  | { type: 'instructions'; id: string; text: string }
  | { type: 'new'; scope: ConversationScope }
  | { type: 'resume'; id: string }
  | { type: 'ask'; text: string; mode: 'inspect' | 'execute' }
  | { type: 'approve'; id: string | number; accept: boolean; answers?: Record<string, string> }
  | { type: 'cancel'; id: string }
  | { type: 'retry'; id: string }
  | { type: 'suggestion'; id: string; action: 'do' | 'more' | 'dismiss' }
  | { type: 'discover' }
  | { type: 'clear' }
  | { type: 'open' }
  | { type: 'close' }

export interface PipApi {
  getBoot: () => Promise<BootPayload>
  worldSource: (source: 'live' | 'simulation') => void
  getWorld: () => Promise<WorldDebugSnapshot | null>
  onWorld: (listener: (snapshot: WorldDebugSnapshot) => void) => () => void
  reportWorld: (snapshot: WorldDebugSnapshot) => void
  clearEnvironment: () => Promise<void>
  getBrain: (debug?: boolean) => Promise<BrainSnapshot>
  brainCommand: (command: BrainCommand) => Promise<BrainSnapshot>
  simulateBrain: (event: string) => Promise<BrainSnapshot>
  onBrain: (listener: (snapshot: BrainSnapshot) => void) => () => void
  onDebugBrain: (listener: (snapshot: BrainSnapshot) => void) => () => void
  saveSettings: (settings: Settings) => Promise<Settings>
  savePosition: (position: { x: number; y: number }) => void
  noteRest: (app: string) => void
  noteEnvironment: (memory: EnvironmentMemory) => void
  remember: (action: string) => void
  feedback: (activity: Activity, feedback: Feedback) => Promise<boolean>
  checkAnimations: () => Promise<AnimationReport | null>
  onMemory: (listener: (payload: MemoryPayload) => void) => () => void
  clearMemory: () => Promise<BootPayload>
  clearThread: () => Promise<void>
  setFrame: (frame: PetFrame) => void
  setMousePolicy: (policy: 'ignore' | 'active' | 'focus') => void
  setPetVisible: (visible: boolean) => void
  onDesktop: (listener: (payload: DesktopPayload) => void) => () => void
  reactToCopiedText: () => Promise<void>
  onEnvironmentEvent: (listener: (event: DeskEvent) => void) => () => void
  onCursor: (listener: (point: { x: number; y: number }) => void) => () => void
  onCommand: (listener: (command: { type: string; mode?: string; settings?: Settings; enabled?: boolean }) => void) => () => void
  onCodex: (listener: (payload: CodexPush) => void) => () => void
  talk: (text: string, frontApp: string | null) => Promise<void>
  decideApproval: (accept: boolean) => void
  reconnectCodex: () => Promise<void>
  open: (target: 'settings' | 'playground') => void
  command: (type: 'show' | 'hide' | 'pause' | 'quit' | 'mode', mode?: string) => void
  log: (level: string, message: string) => void
  capture: (name: string) => Promise<string>
}

declare global {
  interface Window {
    pip: PipApi
  }
}
