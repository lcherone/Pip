import { ACTIVITIES, learningBias, type LearningMemory } from './learning'
import { asideFrom, coversPuppy, windowFocusPoint, type DeskEvent, type DesktopWindow, type DisplayInfo } from './desktop'
import { chooseWindow, edgeOccluded, emptyEnvironment, noteVisit, rememberRest, restingLocations, windowAffordances, readWorld, routeToWindow, type EnvironmentMemory, type RouteStep, type WorldView } from './world'
import { clamp, mulberry32 } from './math'
import { getClip } from './animation/clips'
import type { Mood } from './animation/engine'
import type { Gait, Posture } from './director'
import type { Personality } from './settings'
import type { PipMode } from './settings'
import type { TypingActivity } from './activity'
import { AttentionController, type AttentionState } from './attention'
import type { PuppyReply } from './reply'
import { effectivePersonality } from './settings'

export interface Needs {
  energy: number
  attention: number
  curiosity: number
  rest: number
  stimulation: number
}

export interface ForceRequest {
  action: 'sleep' | 'sit' | 'wake' | 'play' | 'pet' | 'follow' | 'stay' | 'explore' | 'zoom' | 'emote'
  emote?: string
}

export interface BehaviourInput {
  dt: number
  now: number
  x: number
  y: number
  floorY: number
  minimumPerchY?: number
  surfaceId?: string | null
  airborne?: boolean
  typing?: TypingActivity | null
  petSize?: { w: number; h: number }
  windowInteractionFrequency?: 'low' | 'normal' | 'high'
  minX: number
  maxX: number
  cursor: { x: number; y: number; speed: number } | null
  windows: DesktopWindow[]
  focusedApp: string | null
  idleSeconds: number
  dragging: boolean
  mode: PipMode
  paused: boolean
  events: DeskEvent[]
  affinity: Record<string, number>
  supportLost: boolean
  arrived: boolean
  allowIntro: boolean
  followWindows: boolean
  windowClimbing: boolean
  followCursor: boolean
  displays?: DisplayInfo[]
  memoryEnabled: boolean
  learningEnabled?: boolean
  learning?: LearningMemory
  recentActions?: string[]
  force?: ForceRequest | null
}

export interface BehaviourOutput {
  posture: Posture
  gait: Gait
  emote: string | null
  targetX: number | null
  targetY: number | null
  surfaceId: string | null
  look: { x: number; y: number } | null
  headLook: { x: number; y: number } | null
  faceX: number | null
  force: boolean
  token: number
  reason: string
  action: string
  speech: string | null
  fx: 'none' | 'hearts' | 'sparkle' | 'paws'
  mood: Mood
  needs: Needs
  debug: {
    action: string
    reason: string
    mood: Mood
    event: string | null
    source: string | null
    note: string | null
    target: { x: number; y: number } | null
    state: string
    scores: { id: string; score: number }[]
    goal: string | null
    attention: string | null
  }
}

export interface EnvironmentalGoal {
  id: number
  kind: 'investigate' | 'rest' | 'recover'
  phase: 'anticipate' | 'approach' | 'interact' | 'settle' | 'edge_walk' | 'rest' | 'recover'
  status: 'active' | 'completed' | 'cancelled'
  windowId: string | null
  app: string
  reason: string
  target: { x: number; y: number }
  startedAt: number
  until: number
}

interface Plan {
  force?: boolean
  action: string
  reason: string
  posture: Posture
  gait: Gait
  emote: string | null
  targetX: number | null
  targetY: number | null
  surfaceId: string | null
  until: number
  token: number
  speech: string | null
  fx: BehaviourOutput['fx']
  phase: 'move' | 'act'
  event: string | null
  source: string | null
  note: string | null
}

const DECISIONS = ACTIVITIES

export function introAt(t: number, x: number, minX: number, maxX: number): Omit<Plan, 'until' | 'token' | 'speech' | 'fx' | 'phase' | 'event' | 'source' | 'note'> | null {
  const target = clamp(x + 150, minX, maxX)
  if (t < 1.3) return { action: 'intro_sit', reason: 'settling in', posture: 'sitting', gait: 'none', emote: null, targetX: null, targetY: null, surfaceId: null }
  if (t < 2.6) return { action: 'intro_look_left', reason: 'looking around', posture: 'sitting', gait: 'none', emote: 'look_left', targetX: null, targetY: null, surfaceId: null }
  if (t < 3.9) return { action: 'intro_look_right', reason: 'looking around', posture: 'sitting', gait: 'none', emote: 'look_right', targetX: null, targetY: null, surfaceId: null }
  if (t < 5.4) return { action: 'intro_stretch', reason: 'stretching before a walk', posture: 'standing', gait: 'none', emote: 'stretch_front', targetX: null, targetY: null, surfaceId: null }
  if (t < 9.4) return { action: 'intro_walk', reason: 'taking a short walk', posture: 'standing', gait: 'walk', emote: null, targetX: target, targetY: null, surfaceId: null }
  if (t < 13) return { action: 'intro_rest', reason: 'sitting down again', posture: 'sitting', gait: 'none', emote: null, targetX: null, targetY: null, surfaceId: null }
  return null
}

export class BehaviourEngine {
  needs: Needs = { energy: 0.74, attention: 0.45, curiosity: 0.52, rest: 0.22, stimulation: 0.34 }
  places: EnvironmentMemory = emptyEnvironment()
  personality: Personality
  mood: Mood = 'calm'
  age = 0
  private plan: Plan | null = null
  private asleep = false
  private token = 1
  private cooldowns = new Map<string, number>()
  private excitement = 0
  private settleUntil = 0
  private followUntil = 0
  private exploreUntil = 0
  private stayUntil = 0
  private anchorX: number | null = null
  private moodUntil = 0
  private moodLock: Mood | null = null
  private scores: { id: string; score: number }[] = []
  private route: RouteStep[] = []
  private routeApp = ''
  private routeWindowId: string | null = null
  private nextWindowVisit = 0
  private recentWindows = new Map<string, number>()
  private visitStyle: 'sniff' | 'watch' | 'paw' = 'sniff'
  private typingQuietUntil = 0
  private pendingSharedReply: PuppyReply | null = null
  private pendingSharedSource: 'user' | 'sim' = 'user'
  private worldCache: { key: string; at: number; view: WorldView } | null = null
  private attention = new AttentionController()
  private attentionState: AttentionState = { target: null, since: 0, phase: 'idle' }
  private goal: EnvironmentalGoal | null = null
  private goalHistory: EnvironmentalGoal[] = []
  private nextMicroAt = 0
  private perception: { at: number; type: string; app?: string }[] = []
  private worldBuilds = 0
  private rng: () => number

  constructor(personality?: Personality, seed = 1) {
    this.personality = personality ?? effectivePersonality({
      curiosity: 0.62, playfulness: 0.58, energy: 0.55, confidence: 0.5, sociability: 0.64,
      attentionSeeking: 0.42, sleepiness: 0.38, excitability: 0.56, independence: 0.45,
    }, 'chill')
    this.rng = mulberry32(seed)
  }

  setPersonality(personality: Personality): void {
    this.personality = personality
  }

  update(input: BehaviourInput): BehaviourOutput {
    const dt = Math.max(0, Math.min(1, input.dt))
    this.age += dt
    if (!input.paused) this.driftNeeds(dt, input)
    this.excitement = Math.max(0, this.excitement - dt * 0.08)
    if (input.now > this.moodUntil) this.moodLock = null
    this.mood = this.moodLock ?? this.inferMood(input)
    const spatialEvents = input.events.filter(event => event.type.startsWith('window_'))
    if (spatialEvents.length) {
      const chosen = spatialEvents.slice().sort((a, b) => this.eventImportance(b, input) - this.eventImportance(a, input))[0]!
      input = { ...input, events: [...input.events.filter(event => !event.type.startsWith('window_')), chosen] }
    }
    for (const event of input.events) this.perception.push({ at: input.now, type: event.type, app: 'app' in event ? event.app : undefined })
    this.perception = this.perception.slice(-40)
    const note = this.noteForEvents(input)
    const shared = input.events.find(event => event.type === 'shared_text')
    if (shared?.type === 'shared_text') {
      this.pendingSharedReply = shared.reply
      this.pendingSharedSource = shared.source
    }
    if (input.typing?.active) this.typingQuietUntil = input.now + 4
    if (this.routeWindowId && !input.windows.some(window => window.id === this.routeWindowId && window.onScreen)) {
      this.cancelGoal('the destination disappeared')
    }

    if (input.dragging) {
      this.cancelGoal('picked up by the user')
      return this.output(this.make({
      action: 'held', reason: 'picked up', posture: 'held', gait: 'none', emote: 'held',
      targetX: null, targetY: null, surfaceId: null, until: input.now + 5, phase: 'act',
      speech: null, fx: 'none', event: 'drag', source: 'user', note, force: true,
    }, input), input)
    }

    if (this.plan?.action === 'held') {
      this.plan = null
      this.asleep = false
    }
    if (input.paused) { this.cancelGoal('paused'); return this.output(this.hold(input, 'paused', 'Pip is paused'), input) }

    if (input.supportLost) {
      const app = this.goal?.app ?? this.routeApp
      if (app) this.places = noteVisit(this.places, app, input.now, true)
      this.cancelGoal('support lost')
      this.asleep = false
      return this.output(this.make({
        action: 'recover', reason: 'the surface disappeared', posture: 'standing', gait: 'none', emote: 'startled',
        targetX: null, targetY: input.floorY, surfaceId: null, until: input.now + 0.8, phase: 'act',
        speech: null, fx: 'none', event: 'support_lost', source: 'os', note,
      }, input), input)
    }

    if (this.asleep) {
      if (this.shouldWake(input)) return this.output(this.wake(input, note), input)
      const dreams = [null, 'dream_paws', 'snore', 'dream_run', 'sleep_twitch'] as const
      return this.output(this.make({
        action: 'sleep', reason: 'still asleep', posture: 'sleeping', gait: 'none', emote: dreams[Math.floor(this.age / 8) % dreams.length] ?? null,
        targetX: null, targetY: null, surfaceId: null, until: input.now + 30, phase: 'act',
        speech: null, fx: 'none', event: null, source: null, note: note ?? 'sleep ignores ordinary cursor movement',
      }, input), input)
    }

    if (input.mode === 'sleep') this.cancelGoal('sleep mode')
    if (input.mode === 'sleep') return this.output(this.startSleep(input, 'sleep mode'), input)
    if (input.now < this.settleUntil) {
      return this.output(this.make({
        action: 'settle', reason: 'settling down after too much attention', posture: 'sitting', gait: 'none', emote: null,
        targetX: this.anchorX, targetY: input.floorY, surfaceId: null, until: this.settleUntil, phase: 'act',
        speech: null, fx: 'none', event: null, source: null, note,
      }, input), input)
    }

    if (input.force) {
      this.cancelGoal('a user command takes priority')
      return this.output(this.applyForce(input.force, input, note), input)
    }
    if (input.mode === 'focus' && this.goal?.status === 'active' && this.goal.phase !== 'rest') this.cancelGoal('focus mode')
    if (input.mode === 'focus' && this.plan?.phase === 'move' && ['approach', 'wander', 'follow', 'chase'].includes(this.plan.action)) {
      this.plan = null
      this.route = []
    }

    const urgent = this.urgent(input, note)
    if (urgent) return this.output(urgent, input)
    const continuation = this.advanceGoal(input, note)
    if (continuation) return this.output(continuation, input)

    if (this.plan && input.now < this.plan.until) {
      if (note) this.plan.note = note
      if (this.plan.phase === 'move' && this.plan.surfaceId) {
        const surface = input.windows.find(window => window.id === this.plan!.surfaceId && window.onScreen)
        if (!surface || !input.windowClimbing || surface.bounds.y + 2 < (input.minimumPerchY ?? -Infinity)) {
          this.plan = null
          this.route = []
        } else {
          this.plan.targetY = surface.bounds.y + 2
          this.plan.targetX = clamp(this.plan.targetX ?? input.x, surface.bounds.x + 40, surface.bounds.x + surface.bounds.w - 40)
          if (Math.abs(input.x - this.plan.targetX) < 90 && input.y - this.plan.targetY > 24) {
            this.plan.gait = this.plan.gait === 'climb' || input.y - this.plan.targetY > 155 ? 'climb' : 'jump'
          }
        }
      }
      if (this.plan?.phase === 'move' && input.surfaceId && !this.plan.surfaceId && (this.plan.targetY ?? input.floorY) > input.y + 24) this.plan.gait = 'jump'
      const atSurface = !this.plan || (Math.abs(input.y - (this.plan.targetY ?? input.y)) < 8 && Math.abs(input.x - (this.plan.targetX ?? input.x)) <= 20)
      if (this.plan?.phase === 'move' && input.arrived && atSurface) {
        if ((this.plan.action === 'approach' || this.plan.action === 'investigate') && this.route.length > 1) {
          if (this.goal?.phase === 'approach' && !this.plan.surfaceId && this.route[1]?.surfaceId) {
            this.goal.phase = 'interact'
            this.goal.until = input.now + 1.5
            this.plan.phase = 'act'
            this.plan.gait = 'none'
            this.plan.emote = 'sniff_ground'
            this.plan.reason = 'investigating the frame before choosing the edge'
            this.plan.until = this.goal.until
            this.plan.token = ++this.token
            return this.output(this.plan, input)
          }
          this.route.shift()
          const next = this.route[0]
          if (next) {
            this.plan.targetX = next.x
            this.plan.targetY = next.y
            this.plan.surfaceId = next.surfaceId
            this.plan.gait = next.gait
            this.plan.posture = next.posture
            this.plan.phase = 'move'
            this.plan.emote = next.surfaceId || next.gait === 'climb' ? 'approach_window' : null
            this.plan.reason = next.reason
            this.plan.until = input.now + Math.abs(next.x - input.x) / 80 + Math.max(0, input.y - next.y) / 120 + 4
            this.plan.token = ++this.token
          }
        } else if (this.plan.action === 'approach' || this.plan.action === 'investigate') {
          this.route = []
          if (this.routeApp) this.places = noteVisit(this.places, this.routeApp, input.now, false)
          this.plan.phase = 'act'
          this.plan.gait = 'none'
          const floorEmotes = { sniff: 'sniff_frame', watch: 'peek_up', paw: 'paw_glass' }
          this.plan.emote = this.plan.surfaceId ? 'look_over_edge' : floorEmotes[this.visitStyle]
          this.plan.posture = this.plan.surfaceId ? 'ledge' : 'standing'
          this.plan.until = input.now + 2.5 + this.rng() * 3.5
          this.plan.token = ++this.token
          const reasons = { sniff: 'sniffing the window frame', watch: 'looking up at the window', paw: 'tapping the glass' }
          this.plan.reason = this.plan.surfaceId ? 'watching from the edge' : reasons[this.visitStyle]
          if (this.goal) { this.goal.phase = 'settle'; this.goal.until = input.now + 2; this.plan.until = this.goal.until }
        } else if (this.goal?.kind === 'rest' && this.plan.action === 'find_rest') {
          this.goal.status = 'completed'
          this.places = rememberRest(this.places, this.worldInput(input))
          return this.output(this.startSleep(input, 'settled in a familiar resting spot'), input)
        } else if (this.goal?.phase === 'edge_walk') {
          return this.output(this.restAtWindow(input, note), input)
        } else if (this.plan.action === 'zoomies') {
          this.route = []
          this.plan.phase = 'act'
          this.plan.gait = 'none'
          this.plan.posture = 'standing'
          this.plan.emote = 'pant'
          this.plan.reason = 'catching his breath'
          this.plan.until = input.now + 1.3
          this.plan.token = ++this.token
        } else {
          this.plan = null
          this.route = []
        }
      }
      if (this.goal?.phase === 'rest' && input.now >= this.nextMicroAt && this.plan) this.microBehaviour(input)
      if (this.plan && input.now < this.plan.until) return this.output(this.plan, input)
    }

    if (input.allowIntro && this.age < 13 && (input.mode === 'chill' || input.mode === 'playful')) {
      const stage = introAt(this.age, input.x, input.minX, input.maxX)
      if (stage) {
        return this.output(this.make({
          ...stage,
          until: input.now + 0.4,
          phase: stage.gait === 'none' ? 'act' : 'move',
          speech: null,
          fx: 'none',
          event: null,
          source: null,
          note: 'intro',
        }, input), input)
      }
    }

    return this.output(this.decide(input, note), input)
  }

  private driftNeeds(dt: number, input: BehaviourInput): void {
    const moving = this.plan?.gait && this.plan.gait !== 'none'
    this.needs.energy = clamp(this.needs.energy - dt * (moving ? 0.02 : 0.004) * (1.15 - this.personality.energy * 0.4), 0, 1)
    if (!moving && (this.plan?.posture === 'sitting' || this.plan?.posture === 'lying' || this.asleep)) {
      this.needs.energy = clamp(this.needs.energy + dt * 0.012, 0, 1)
    }
    this.needs.rest = clamp(this.needs.rest + dt * (this.needs.energy < 0.4 ? 0.02 : -0.008) + (input.idleSeconds > 60 ? dt * 0.01 : 0), 0, 1)
    const busy = input.events.some((event) => event.type === 'window_opened' || event.type === 'app_launched' || event.type === 'app_activated')
    this.needs.curiosity = clamp(this.needs.curiosity + dt * (busy ? 0.08 : -0.01), 0, 1)
    this.needs.attention = clamp(this.needs.attention - dt * 0.01, 0, 1)
    this.needs.stimulation = clamp(this.needs.stimulation - dt * 0.012, 0, 1)
    if (input.events.some((event) => event.type === 'clicked' || event.type === 'petted')) {
      this.needs.attention = clamp(this.needs.attention + 0.18, 0, 1)
      this.needs.stimulation = clamp(this.needs.stimulation + 0.2, 0, 1)
    }
  }

  private inferMood(input: BehaviourInput): Mood {
    if (this.asleep || this.needs.energy < 0.22 || this.needs.rest > 0.78) return 'sleepy'
    if (input.mode === 'playful' && this.needs.stimulation > 0.55) return 'excited'
    if (this.needs.curiosity > 0.66) return 'curious'
    if (this.personality.playfulness > 0.72 && this.needs.energy > 0.5) return 'playful'
    if (this.needs.attention > 0.68) return 'happy'
    return 'calm'
  }

  private shouldWake(input: BehaviourInput): boolean {
    if (input.force?.action === 'wake' || input.force?.action === 'play' || input.force?.action === 'pet') return true
    return input.events.some((event) => event.type === 'clicked' || event.type === 'petted' || event.type === 'active' || event.type === 'shared_text')
  }

  private wake(input: BehaviourInput, note: string | null): Plan {
    this.asleep = false
    this.needs.rest = Math.max(0, this.needs.rest - 0.3)
    this.needs.energy = Math.min(1, this.needs.energy + 0.08)
    return this.make({
      action: 'wake', reason: 'waking up', posture: 'lying', gait: 'none', emote: 'wake',
      targetX: null, targetY: null, surfaceId: null, until: input.now + 1.3, phase: 'act',
      speech: input.mode === 'focus' ? null : 'Mmh?', fx: 'none', event: 'wake', source: 'user', note,
    }, input)
  }

  private startSleep(input: BehaviourInput, reason: string): Plan {
    this.asleep = true
    return this.make({
      action: 'sleep', reason, posture: 'sleeping', gait: 'none', emote: null,
      targetX: null, targetY: null, surfaceId: null, until: input.now + 60, phase: 'act',
      speech: null, fx: 'none', event: null, source: null, note: null,
    }, input)
  }

  private hold(input: BehaviourInput, action: string, reason: string): Plan {
    return this.plan ?? this.make({
      action, reason, posture: 'sitting', gait: 'none', emote: null,
      targetX: null, targetY: input.floorY, surfaceId: null, until: input.now + 1, phase: 'act',
      speech: null, fx: 'none', event: null, source: null, note: null,
    }, input)
  }

  private applyForce(force: ForceRequest, input: BehaviourInput, note: string | null): Plan {
    if (force.action === 'sleep') return this.startSleep(input, 'asked to sleep')
    if (force.action === 'wake') return this.wake(input, note)
    if (force.action === 'sit') {
      this.anchorX = input.x
      return this.make({
        action: 'sit', reason: 'asked to sit', posture: 'sitting', gait: 'none', emote: null,
        targetX: input.x, targetY: input.floorY, surfaceId: null, until: input.now + 6, phase: 'act',
        speech: null, fx: 'none', event: 'sit', source: 'user', note,
      }, input)
    }
    if (force.action === 'pet') {
      this.needs.attention = Math.min(1, this.needs.attention + 0.25)
      this.excitement += 0.2
      return this.make({
        action: 'pet', reason: 'being petted', posture: 'sitting', gait: 'none', emote: 'happy_wag',
        targetX: null, targetY: null, surfaceId: null, until: input.now + 1.6, phase: 'act',
        speech: null, fx: 'hearts', event: 'petted', source: 'user', note,
      }, input)
    }
    if (force.action === 'play') {
      this.needs.stimulation = Math.min(1, this.needs.stimulation + 0.3)
      return this.make({
        action: 'play', reason: 'play time', posture: 'standing', gait: 'none', emote: 'play_bow',
        targetX: null, targetY: null, surfaceId: null, until: input.now + 1.4, phase: 'act',
        speech: null, fx: 'sparkle', event: 'play', source: 'user', note,
      }, input)
    }
    if (force.action === 'follow') {
      this.followUntil = input.now + 25
      return this.make({
        action: 'follow', reason: 'following you', posture: 'standing', gait: 'walk', emote: null,
        targetX: input.cursor ? input.cursor.x : input.x + 40, targetY: input.floorY, surfaceId: null,
        until: input.now + 2, phase: 'move', speech: null, fx: 'none', event: 'follow', source: 'user', note,
      }, input)
    }
    if (force.action === 'stay') {
      this.stayUntil = input.now + 40
      this.anchorX = input.x
      return this.make({
        action: 'stay', reason: 'staying here', posture: 'sitting', gait: 'none', emote: null,
        targetX: input.x, targetY: input.floorY, surfaceId: null, until: input.now + 8, phase: 'act',
        speech: null, fx: 'none', event: 'stay', source: 'user', note,
      }, input)
    }
    if (force.action === 'explore') {
      this.exploreUntil = input.now + 20
      this.stayUntil = 0
      return this.decide(input, 'explore')
    }
    if (force.action === 'zoom') {
      this.stayUntil = 0
      const target = clamp(input.x + (this.rng() > 0.5 ? 240 : -240), input.minX, input.maxX)
      return this.make({
        action: 'zoomies', reason: 'zooming around', posture: 'standing', gait: 'run', emote: null,
        targetX: target, targetY: input.floorY, surfaceId: null, until: input.now + 2.4, phase: 'move',
        speech: null, fx: 'paws', event: 'play', source: 'user', note,
      }, input)
    }
    const emote = force.emote ?? 'head_tilt'
    const clip = getClip(emote)
    const posture: Posture = clip && clip.from.includes('standing') && !clip.from.includes('sitting') ? 'standing' : 'sitting'
    return this.make({
      action: emote, reason: 'requested animation', posture, gait: 'none',
      emote, targetX: null, targetY: null, surfaceId: null,
      until: input.now + 1.5, phase: 'act', speech: null, fx: 'none', event: 'emote', source: 'user', note,
    }, input)
  }

  private urgent(input: BehaviourInput, note: string | null): Plan | null {
    if (this.pendingSharedReply && !input.airborne && this.plan?.gait !== 'climb') {
      const reply = this.pendingSharedReply
      this.pendingSharedReply = null
      this.cancelGoal('the user shared text')
      const emotes = { investigate: 'head_tilt', explain: 'curious', celebrate: 'happy_wag', ask: 'play_bow', offer_help: 'look_expectant', report_problem: 'confused_tilt', chat: 'greet' }
      return this.make({
        action: 'shared_text', reason: 'reacting to text you explicitly shared', posture: 'sitting', gait: 'none', emote: emotes[reply.intention],
        targetX: null, targetY: null, surfaceId: input.surfaceId ?? null, until: input.now + 2.5,
        phase: 'act', speech: reply.say, fx: reply.intention === 'celebrate' ? 'hearts' : 'none', event: 'shared_text', source: this.pendingSharedSource, note,
      }, input)
    }

    const codexDone = input.events.find((event) => event.type === 'codex_completed')
    const codexFail = input.events.find((event) => event.type === 'codex_failed')
    const codexStart = input.events.find((event) => event.type === 'codex_started')
    const clicked = input.events.find((event) => event.type === 'clicked' || event.type === 'petted')
    const closed = input.events.find((event) => event.type === 'window_closed')
    if (codexDone && this.ready('codex', input.now, 1.2)) {
      this.moodLock = 'proud'
      this.moodUntil = input.now + 6
      this.needs.stimulation = Math.min(1, this.needs.stimulation + 0.25)
      return this.make({
        action: 'celebrate', reason: 'Codex finished', posture: 'standing', gait: 'none', emote: 'celebrate',
        targetX: null, targetY: null, surfaceId: null, until: input.now + 1.4, phase: 'act',
        speech: input.mode === 'focus' ? null : 'Yes!', fx: 'sparkle', event: 'codex_completed', source: codexDone.source, note,
      }, input)
    }
    if (codexFail && this.ready('codex', input.now, 1.2)) {
      this.moodLock = 'confused'
      this.moodUntil = input.now + 6
      return this.make({
        action: 'react_failure', reason: 'Codex hit a problem', posture: 'sitting', gait: 'none', emote: 'react_failure',
        targetX: null, targetY: null, surfaceId: null, until: input.now + 1.5, phase: 'act',
        speech: input.mode === 'focus' ? null : 'Oh.', fx: 'none', event: 'codex_failed', source: codexFail.source, note,
      }, input)
    }
    if (clicked) {
      this.cancelGoal('responding to the user')
      this.excitement += clicked.type === 'petted' ? 0.2 : 0.34
      this.needs.attention = Math.min(1, this.needs.attention + 0.15)
      if (this.excitement > 1.7) {
        this.settleUntil = input.now + 8
        this.excitement = 0.4
        return this.make({
          action: 'settle', reason: 'that was a lot of pats', posture: 'sitting', gait: 'none', emote: null,
          targetX: null, targetY: null, surfaceId: null, until: input.now + 8, phase: 'act',
          speech: null, fx: 'none', event: clicked.type, source: clicked.source, note,
        }, input)
      }
      const petRoll = this.rng()
      const petEmote = petRoll > 0.8 ? 'beg' : petRoll > 0.6 ? 'wiggle' : petRoll > 0.4 ? 'paw_wave' : petRoll > 0.2 ? 'knead' : 'happy_wag'
      const clickRoll = this.rng()
      const emote = this.excitement > 1.1 ? 'pounce' : clicked.type === 'petted' ? petEmote : clickRoll > 0.66 ? 'bark' : clickRoll > 0.33 ? 'lick_nose' : 'head_tilt'
      const clip = getClip(emote)
      const posture: Posture = clip && clip.from.includes('standing') && !clip.from.includes('sitting') ? 'standing' : 'sitting'
      return this.make({
        action: 'react_click', reason: 'noticed you', posture, gait: 'none', emote,
        targetX: null, targetY: null, surfaceId: null, until: input.now + 1.1, phase: 'act',
        speech: null, fx: clicked.type === 'petted' ? 'hearts' : 'none', event: clicked.type, source: clicked.source, note,
      }, input)
    }
    if (closed && (!this.goal || this.goal.status !== 'active' || ('windowId' in closed && closed.windowId === this.goal.windowId)) && this.ready('window_closed', input.now, 2)) {
      return this.make({
        action: 'window_closed', reason: 'a window closed', posture: 'standing', gait: 'none', emote: 'window_closed',
        targetX: null, targetY: input.floorY, surfaceId: null, until: input.now + 1, phase: 'act',
        speech: null, fx: 'none', event: 'window_closed', source: closed.source, note,
      }, input)
    }
    if (codexStart && this.ready('watch', input.now, 3) && input.mode !== 'focus') {
      return this.make({
        action: 'watch', reason: 'watching a task', posture: 'sitting', gait: 'none', emote: 'watch_progress',
        targetX: null, targetY: null, surfaceId: null, until: input.now + 2.4, phase: 'act',
        speech: null, fx: 'none', event: 'codex_started', source: codexStart.source, note,
      }, input)
    }
    const opened = input.events.find((event) => event.type === 'window_opened')
      ?? input.events.find((event) => event.type === 'app_launched' || event.type === 'app_activated')
    const duringIntro = input.allowIntro && this.age < 13 && (input.mode === 'chill' || input.mode === 'playful')
    const returned = input.events.find((event) => event.type === 'active')
    if (returned && !duringIntro && input.mode !== 'focus' && input.mode !== 'sleep' && this.ready('greet', input.now, 8)) {
      return this.make({
        action: 'greet', reason: 'you are back', posture: 'sitting', gait: 'none', emote: 'greet',
        targetX: null, targetY: null, surfaceId: null, until: input.now + 1.3, phase: 'act',
        speech: null, fx: 'hearts', event: 'active', source: returned.source, note,
      }, input)
    }
    const idle = input.events.find((event) => event.type === 'idle')
    if (idle && !duringIntro && input.mode !== 'focus' && input.mode !== 'sleep' && this.ready('idle', input.now, 25)) {
      if (this.needs.rest > 0.72 || this.needs.energy < 0.28) return this.startSleep(input, 'you have been quiet')
      return this.make({
        action: 'yawn', reason: 'the desk has gone quiet', posture: 'sitting', gait: 'none', emote: 'yawn',
        targetX: null, targetY: null, surfaceId: null, until: input.now + 1.6, phase: 'act',
        speech: null, fx: 'none', event: 'idle', source: idle.source, note,
      }, input)
    }
    const fullscreen = input.events.find((event) => event.type === 'fullscreen')
    if (fullscreen?.type === 'fullscreen' && !duringIntro && input.mode !== 'focus' && input.mode !== 'sleep' && this.ready('fullscreen', input.now, 6)) {
      const hiding = fullscreen.enabled
      return this.make({
        action: hiding ? 'duck' : 'shake_off',
        reason: hiding ? 'a window took over the screen' : 'the screen opened back up',
        posture: 'standing', gait: 'none', emote: hiding ? 'duck' : 'shake_off',
        targetX: null, targetY: null, surfaceId: input.surfaceId ?? null, until: input.now + 0.9, phase: 'act',
        speech: null, fx: 'none', event: 'fullscreen', source: fullscreen.source, note,
      }, input)
    }
    const display = input.events.find((event) => event.type === 'display_changed')
    if (display && !duringIntro && input.mode !== 'focus' && input.mode !== 'sleep' && this.ready('display', input.now, 8)) {
      return this.make({
        action: 'perk', reason: 'the desktop changed shape', posture: 'standing', gait: 'none', emote: 'perk',
        targetX: null, targetY: null, surfaceId: null, until: input.now + 0.9, phase: 'act',
        speech: null, fx: 'none', event: 'display_changed', source: display.source, note,
      }, input)
    }
    const shifted = input.events.find((event) => event.type === 'window_moved' || event.type === 'window_resized')
    const shiftedWindow = shifted && (shifted.type === 'window_moved' || shifted.type === 'window_resized')
      ? input.windows.find((window) => window.id === shifted.windowId)
      : undefined
    if (shifted && shiftedWindow && coversPuppy(shiftedWindow, { x: input.x, y: input.y })) {
      const aside = asideFrom(shiftedWindow, input.x, input.minX, input.maxX)
      if (aside !== null && Math.abs(aside - input.x) > 24 && this.ready('dodge', input.now, 3)) {
        return this.make({
          action: 'dodge', reason: `${shiftedWindow.app} moved into the way`, posture: 'standing', gait: 'walk', emote: 'sidestep',
          targetX: aside, targetY: input.floorY, surfaceId: null, until: input.now + 2.4, phase: 'move',
          speech: null, fx: 'none', event: shifted.type, source: shifted.source, note,
        }, input)
      }
      if (!duringIntro && input.mode !== 'focus' && input.mode !== 'sleep' && this.ready('duck', input.now, 3)) {
        return this.make({
          action: 'duck', reason: `${shiftedWindow.app} covered him`, posture: 'standing', gait: 'none', emote: 'duck',
          targetX: null, targetY: null, surfaceId: null, until: input.now + 0.8, phase: 'act',
          speech: null, fx: 'none', event: shifted.type, source: shifted.source, note,
        }, input)
      }
    }
    const typingReaction = this.reactToActivity(input, note)
    if (typingReaction) return typingReaction
    if (opened && input.surfaceId && !duringIntro && input.mode !== 'focus' && input.mode !== 'sleep') {
      const other = this.windowForEvent(input, opened)
      if (other && other.id !== input.surfaceId && this.ready('ledge_notice', input.now, 5)) {
        return this.make({
          action: 'notice', reason: `${other.app} opened while he was up on a window`, posture: 'ledge', gait: 'none', emote: 'notice_app',
          targetX: null, targetY: null, surfaceId: input.surfaceId, until: input.now + 1.1, phase: 'act',
          speech: null, fx: 'none', event: opened.type, source: opened.source, note,
        }, input)
      }
    }
    if (opened && (!this.goal || this.goal.status !== 'active') && !input.airborne && !duringIntro && input.followWindows && input.windows.length > 0 && input.mode !== 'focus' && input.mode !== 'sleep' && input.now >= this.stayUntil && input.now >= this.typingQuietUntil && this.ready('window', input.now, 8)) {
      return this.approach(input, note, opened.source, opened.type, this.windowForEvent(input, opened))
    }
    const moving = this.plan?.phase === 'move'
    if (shifted && shiftedWindow && !moving && !duringIntro && input.mode !== 'focus' && input.mode !== 'sleep') {
      const point = windowFocusPoint(shiftedWindow)
      if (Math.hypot(point.x - input.x, point.y - input.y) < 640 && this.ready('notice', input.now, 4.5)) {
        const onIt = input.surfaceId === shiftedWindow.id && input.y < input.floorY - 40
        const lookingUp = shifted.type === 'window_resized' && shiftedWindow.bounds.y + 2 < input.y - 36
        const emote = onIt ? 'settle_paws' : lookingUp ? 'peek_up' : 'curious'
        const posture: Posture = onIt ? 'ledge' : 'standing'
        return this.make({
          action: onIt ? 'settle_paws' : lookingUp ? 'peek' : 'notice',
          reason: onIt ? `steadying on ${shiftedWindow.app}` : lookingUp ? `${shiftedWindow.app} changed above him` : `noticed ${shiftedWindow.app} move`,
          posture, gait: 'none', emote,
          targetX: null, targetY: null, surfaceId: onIt ? input.surfaceId ?? null : null, until: input.now + 1.2, phase: 'act',
          speech: null, fx: 'none', event: shifted.type, source: shifted.source, note,
        }, input)
      }
    }
    const ended = input.events.find((event) => event.type === 'app_terminated')
    if (ended && !closed && input.mode !== 'focus' && this.ready('window', input.now, 2)) {
      return this.make({
        action: 'shake_off', reason: `${ended.app} quit`, posture: 'standing', gait: 'none', emote: 'shake_off',
        targetX: null, targetY: input.floorY, surfaceId: null, until: input.now + 1, phase: 'act',
        speech: null, fx: 'none', event: 'app_terminated', source: ended.source, note,
      }, input)
    }
    if (!moving && !duringIntro && input.cursor && input.mode !== 'focus' && input.mode !== 'sleep') {
      const dx = input.cursor.x - input.x
      const dy = input.cursor.y - (input.y - 90)
      if (input.cursor.speed < 260 && Math.hypot(dx, dy) < 110 && this.ready('sniff', input.now, 12)) {
        return this.make({
          action: 'sniff', reason: 'something is right in front of his nose', posture: 'standing', gait: 'none', emote: 'investigate_cursor',
          targetX: null, targetY: null, surfaceId: null, until: input.now + 1.2, phase: 'act',
          speech: null, fx: 'none', event: 'cursor', source: 'user', note,
        }, input)
      }
    }
    return null
  }

  private decide(input: BehaviourInput, note: string | null): Plan {
    const windowEvent = input.events.find((event) => event.type === 'window_opened' || event.type === 'app_launched' || event.type === 'app_activated')
    const adapting = input.memoryEnabled && input.learningEnabled && input.mode !== 'focus' && input.mode !== 'sleep'
    const scores = DECISIONS.map((id) => {
      const base = this.score(id, input, Boolean(windowEvent))
      const adjustment = adapting && base >= 0 ? learningBias(id, input.learning ?? {}, input.recentActions ?? []) : 0
      return { id, score: base + adjustment }
    })
    this.scores = scores.sort((a, b) => b.score - a.score)
    const best = this.scores[0]
    const choice = best && best.score > 0.32 ? best.id : 'sit'
    if (choice === 'sleep' || (this.needs.rest > 0.82 && this.needs.energy < 0.3)) {
      const comfort = this.findComfort(input, note)
      return comfort ?? this.startSleep(input, 'energy is low')
    }
    if (choice === 'yawn') {
      return this.make({
        action: 'yawn', reason: 'getting drowsy', posture: 'sitting', gait: 'none', emote: 'yawn',
        targetX: null, targetY: null, surfaceId: null, until: input.now + 1.5, phase: 'act',
        speech: null, fx: 'none', event: null, source: null, note,
      }, input)
    }
    if ((choice === 'approach' || windowEvent) && input.now >= this.nextWindowVisit && input.now >= this.typingQuietUntil && input.followWindows && this.ready('window', input.now, 8) && input.windows.length > 0 && input.mode !== 'focus' && input.mode !== 'sleep') {
      return this.approach(input, note, windowEvent?.source ?? 'os', windowEvent?.type ?? 'approach')
    }
    if (choice === 'chase' && input.cursor && input.mode !== 'focus' && this.ready('chase', input.now, 5)) {
      return this.make({
        action: 'chase', reason: 'the pointer looks like a toy', posture: 'standing', gait: 'run', emote: null,
        targetX: clamp(input.cursor.x, input.minX, input.maxX), targetY: input.floorY, surfaceId: null,
        until: input.now + 2.4, phase: 'move', speech: null, fx: 'paws', event: 'cursor', source: 'user', note,
      }, input)
    }
    if ((choice === 'follow' || input.now < this.followUntil) && input.cursor && input.followCursor && input.mode !== 'focus' && input.mode !== 'sleep') {
      const gap = this.personality.independence > 0.7 ? 120 : 70
      return this.make({
        action: 'follow', reason: 'tagging along', posture: 'standing', gait: this.needs.energy > 0.55 ? 'trot' : 'walk', emote: null,
        targetX: clamp(input.cursor.x - gap, input.minX, input.maxX), targetY: input.floorY, surfaceId: null,
        until: input.now + 1.6, phase: 'move', speech: null, fx: 'none', event: null, source: null, note,
      }, input)
    }
    if (choice === 'wander' && input.followWindows && input.now >= this.nextWindowVisit && input.now >= this.typingQuietUntil && this.rng() < 0.5) {
      const visit = chooseWindow(this.worldInput(input), this.rng, this.recentWindowIds(input.now))
      if (visit) return this.beginVisit(visit.window, visit.steps, input, note, 'spontaneous_visit', 'world')
    }
    if (choice === 'wander' && input.now >= this.stayUntil && this.ready('wander', input.now, input.mode === 'chill' ? 20 : 10)) {
      const spread = input.now < this.exploreUntil ? 280 : 180
      const target = clamp(input.x + (this.rng() * 2 - 1) * spread, input.minX, input.maxX)
      const gait: Gait = this.needs.energy > 0.75 && input.mode === 'playful' ? 'trot' : 'walk'
      return this.make({
        action: 'wander', reason: input.now < this.exploreUntil ? 'exploring' : 'going for a wander',
        posture: 'standing', gait, emote: null, targetX: target, targetY: input.floorY, surfaceId: null,
        until: input.now + 8, phase: 'move', speech: null, fx: 'paws', event: null, source: null, note,
      }, input)
    }
    if (choice === 'emote' && this.ready('emote', input.now, 4) && input.mode !== 'focus') {
      const perched = Boolean(input.surfaceId) && input.y < input.floorY - 40
      const emotes = perched
        ? ['look_over_edge', 'settle_paws', 'paw_glass', 'peek_along']
        : ['head_tilt', 'paw_adjust', 'curious', 'ear_twitch_left', 'nose_twitch', 'weight_shift', 'sniff_ground', 'lick_paw', 'sneeze', 'beg', 'dig', 'sniff_frame', 'peek_up', 'perk', 'tail_chase', 'paw_wave', 'knead', 'doze', 'lick_nose', 'wiggle', 'pounce', 'stretch_side', 'pant']
      const emote = emotes[Math.floor(this.rng() * emotes.length)] ?? 'head_tilt'
      const standing = ['sniff_ground', 'dig', 'sniff_frame', 'peek_up', 'perk', 'paw_glass', 'tail_chase', 'pounce', 'stretch_side', 'pant'].includes(emote)
      return this.make({
        action: emote, reason: 'a small idle habit', posture: perched ? 'ledge' : standing ? 'standing' : 'sitting', gait: 'none', emote,
        targetX: null, targetY: null, surfaceId: perched ? input.surfaceId ?? null : null, until: input.now + 1.3, phase: 'act',
        speech: null, fx: 'none', event: null, source: null, note,
      }, input)
    }
    return this.make({
      action: 'idle_sit', reason: this.scores[0] ? `sitting wins (${this.scores[0].id} ${this.scores[0].score.toFixed(2)})` : 'nothing better to do',
      posture: this.needs.rest > 0.65 ? 'lying' : 'sitting', gait: 'none', emote: null,
      targetX: this.anchorX, targetY: input.floorY, surfaceId: null, until: input.now + (input.mode === 'chill' ? 5 : 3.2),
      phase: 'act', speech: null, fx: 'none', event: null, source: null, note,
    }, input)
  }

  get worldView(): WorldView | null {
    return this.worldCache ? { ...this.worldCache.view, activeGoal: this.goal, path: this.route, attentionState: this.attentionState, perception: this.perception, goalHistory: this.goalHistory, builds: this.worldBuilds } : null
  }

  private worldInput(input: BehaviourInput) {
    return {
      now: input.now,
      x: input.x,
      y: input.y,
      floorY: input.floorY,
      minimumPerchY: input.minimumPerchY,
      petSize: input.petSize,
      minX: input.minX,
      maxX: input.maxX,
      windows: input.windows,
      displays: input.displays ?? [],
      focusedApp: input.focusedApp,
      events: input.events,
      memory: this.places,
      traits: {
        curiosity: this.personality.curiosity,
        playfulness: this.personality.playfulness,
        sleepiness: this.personality.sleepiness,
        confidence: this.personality.confidence,
        energy: this.needs.energy,
      },
      mode: input.mode,
      climbing: input.windowClimbing,
      surfaceId: input.surfaceId !== undefined ? input.surfaceId : input.windows.find(window => Math.abs(window.bounds.y + 2 - input.y) < 8 && input.x >= window.bounds.x && input.x <= window.bounds.x + window.bounds.w)?.id ?? null,
    }
  }

  private world(input: BehaviourInput): WorldView {
    const key = `${input.mode}:${input.focusedApp}:${input.windowClimbing}:${input.minimumPerchY}:${input.surfaceId}:` + input.windows.map((window) => `${window.id}:${Math.round(window.bounds.x)}:${Math.round(window.bounds.y)}:${Math.round(window.bounds.w)}:${Math.round(window.bounds.h)}:${window.onScreen}:${window.layer ?? 0}:${window.focused ? 1 : 0}`).join('|') + (input.displays ?? []).map(display => JSON.stringify([display.bounds, display.workArea])).join('|')
    if (this.worldCache && this.worldCache.key === key && input.now - this.worldCache.at < 0.45) return this.worldCache.view
    const view = readWorld(this.worldInput(input))
    this.worldBuilds += 1
    this.worldCache = { key, at: input.now, view }
    return view
  }

  private windowForEvent(input: BehaviourInput, event: DeskEvent): DesktopWindow | undefined {
    if (event.type === 'window_opened' || event.type === 'window_moved' || event.type === 'window_resized') {
      return input.windows.find((window) => window.id === event.windowId)
    }
    if (event.type === 'app_launched' || event.type === 'app_activated' || event.type === 'app_terminated') {
      return input.windows.find((window) => window.bundleId === event.bundleId || window.app === event.app)
    }
    return undefined
  }

  private approach(input: BehaviourInput, note: string | null, source: string, event: string, preferred?: DesktopWindow): Plan {
    const selected = preferred ? { window: preferred, steps: routeToWindow(this.worldInput(input), preferred) } : chooseWindow(this.worldInput(input), this.rng, this.recentWindowIds(input.now))
    if (selected?.steps.length) return this.beginVisit(selected.window, selected.steps, input, note, event, source)
    this.nextWindowVisit = input.now + this.visitInterval(input)
    return this.make({
      action: 'notice', reason: 'watching the windows from here', posture: input.surfaceId ? 'ledge' : 'sitting', gait: 'none', emote: 'head_tilt',
      targetX: null, targetY: null, surfaceId: input.surfaceId ?? null, until: input.now + 2.2,
      phase: 'act', speech: null, fx: 'none', event, source, note,
    }, input)
  }

  private recentWindowIds(now: number): Set<string> {
    for (const [id, until] of this.recentWindows) if (until <= now) this.recentWindows.delete(id)
    return new Set(this.recentWindows.keys())
  }

  private visitInterval(input: BehaviourInput): number {
    const ranges = { low: [35, 70], normal: [18, 40], high: [8, 20] } as const
    const [minimum, maximum] = ranges[input.windowInteractionFrequency ?? 'normal']
    const mode = input.mode === 'playful' ? 0.75 : 1.2
    return (minimum + this.rng() * (maximum - minimum)) * mode
  }

  private beginVisit(window: DesktopWindow, steps: RouteStep[], input: BehaviourInput, note: string | null, event: string, source: string): Plan {
    this.route = steps
    this.routeApp = window.app
    this.routeWindowId = window.id
    const interval = this.visitInterval(input)
    this.nextWindowVisit = input.now + interval
    this.recentWindows.set(window.id, input.now + Math.max(25, interval))
    if (this.recentWindows.size > 40) this.recentWindows.delete(this.recentWindows.keys().next().value!)
    this.visitStyle = (['sniff', 'watch', 'paw'] as const)[Math.floor(this.rng() * 3)] ?? 'sniff'
    const corner = windowAffordances(this.worldInput(input)).find(item => item.windowId === window.id && item.kind === 'sniff_corner' && item.feasible)
    if (corner && steps[0]?.surfaceId === null && !input.surfaceId) steps[0]!.x = corner.target.x
    const step = steps[0]!
    this.goal = { id: this.token + 1, kind: 'investigate', phase: 'anticipate', status: 'active', windowId: window.id, app: window.app,
      reason: 'a visible place worth investigating', target: { x: step.x, y: step.y }, startedAt: input.now, until: input.now + 0.65 }
    return this.make({
      action: 'approach', reason: `noticing the ${window.app} window`, posture: input.surfaceId ? 'ledge' : 'standing', gait: 'none', emote: 'ear_twitch_left',
      targetX: step.x, targetY: step.y, surfaceId: input.surfaceId ?? null, until: this.goal.until,
      phase: 'act', speech: null, fx: 'none', event, source, note,
    }, input)
  }

  private cancelGoal(reason: string): void {
    if (this.goal?.status === 'active') {
      this.goal.status = 'cancelled'
      this.goal.reason = reason
      this.goalHistory = [...this.goalHistory, { ...this.goal }].slice(-12)
    }
    const environmentalPlan = this.plan && ['approach', 'investigate', 'rest_surface', 'walk_edge', 'find_rest'].includes(this.plan.action)
    this.route = []
    this.routeWindowId = null
    if (environmentalPlan) this.plan = null
  }

  clearPerception(): void {
    this.cancelGoal('desktop observations unavailable')
    this.worldCache = null
    this.perception = []
    this.attention.reset()
  }

  resetEnvironment(): void {
    this.cancelGoal('environmental memory cleared')
    this.places = emptyEnvironment()
    this.recentWindows.clear()
    this.goalHistory = []
    this.perception = []
    this.attention.reset()
    this.worldCache = null
    this.nextWindowVisit = 0
  }

  private eventImportance(event: DeskEvent, input: BehaviourInput): number {
    const id = 'windowId' in event ? event.windowId : null
    if (id && id === input.surfaceId) return 20
    const window = input.windows.find(item => item.id === id)
    if (!window) return event.type === 'window_closed' ? 0.4 : 0
    if ((event.type === 'window_moved' || event.type === 'window_resized') && coversPuppy(window, input)) return 15
    const near = Math.max(0, 1 - Math.hypot(window.bounds.x + window.bounds.w / 2 - input.x, window.bounds.y - input.y) / 1200)
    return near + (event.type === 'window_opened' ? 1 : 0.2)
  }

  private advanceGoal(input: BehaviourInput, note: string | null): Plan | null {
    const goal = this.goal
    if (!goal || goal.status !== 'active') return null
    const window = input.windows.find(item => item.id === goal.windowId)
    if (window && edgeOccluded(input.windows, input.windows.indexOf(window))) {
      this.cancelGoal('the destination is now covered')
      if (input.surfaceId) return this.make({ action: 'recover', reason: 'leaving an obscured edge', posture: 'standing', gait: 'jump', emote: null,
        targetX: clamp(input.x, input.minX, input.maxX), targetY: input.floorY, surfaceId: null, until: input.now + 3, phase: 'move', speech: null, fx: 'none', event: 'path_invalid', source: 'world', note }, input)
      return null
    }
    if (input.now < goal.until) return null
    if (goal.phase === 'anticipate' || goal.phase === 'interact') {
      if (goal.phase === 'interact') this.route.shift()
      const step = this.route[0]
      if (!step) { this.cancelGoal('no safe continuation'); return null }
      goal.phase = 'approach'
      goal.target = { x: step.x, y: step.y }
      goal.until = input.now + Math.abs(step.x - input.x) / 70 + Math.abs(input.y - step.y) / 110 + 8
      return this.make({ action: 'approach', reason: step.reason, posture: step.posture, gait: step.gait, emote: null,
        targetX: step.x, targetY: step.y, surfaceId: step.surfaceId, until: goal.until, phase: 'move', speech: null, fx: 'none', event: 'goal_continued', source: 'world', note }, input)
    }
    if (goal.phase === 'settle') {
      const edgeWalk = windowAffordances(this.worldInput(input)).find(item => item.windowId === goal.windowId && item.kind === 'walk_edge' && item.feasible)
      if (input.surfaceId && edgeWalk && this.personality.playfulness > 0.65 && this.rng() < 0.25) {
        goal.phase = 'edge_walk'
        goal.until = input.now + Math.abs(edgeWalk.target.x - input.x) / 60 + 5
        return this.make({ action: 'walk_edge', reason: 'carefully exploring the edge', posture: 'ledge', gait: 'walk', emote: null,
          targetX: edgeWalk.target.x, targetY: edgeWalk.target.y, surfaceId: input.surfaceId, until: goal.until, phase: 'move', speech: null, fx: 'none', event: 'edge_reached', source: 'world', note }, input)
      }
      return this.restAtWindow(input, note)
    }
    if (goal.phase === 'rest') {
      goal.status = 'completed'
      this.goalHistory = [...this.goalHistory, { ...goal }].slice(-12)
      this.plan = null
      this.route = []
      this.nextWindowVisit = input.now + this.visitInterval(input)
      return null
    }
    if (goal.phase === 'approach' || goal.phase === 'edge_walk') this.cancelGoal('reconsidering a route that took too long')
    return null
  }

  private findComfort(input: BehaviourInput, note: string | null): Plan | null {
    if (input.mode === 'focus' || input.mode === 'sleep' || input.typing?.active || input.airborne || this.needs.energy < 0.1) return null
    if (input.surfaceId) return null
    const spot = restingLocations(this.worldInput(input)).find(item => item.surfaceId === null && Math.abs(item.x - input.x) > 35 && Math.abs(item.x - input.x) < 450)
    if (!spot) return null
    this.goal = { id: this.token + 1, kind: 'rest', phase: 'approach', status: 'active', windowId: null, app: spot.app,
      reason: 'returning to a comfortable familiar spot', target: { x: spot.x, y: spot.y }, startedAt: input.now, until: input.now + Math.abs(spot.x - input.x) / 70 + 5 }
    return this.make({ action: 'find_rest', reason: this.goal.reason, posture: 'standing', gait: 'walk', emote: null,
      targetX: spot.x, targetY: spot.y, surfaceId: null, until: this.goal.until, phase: 'move', speech: null, fx: 'none', event: 'rest_goal', source: 'world', note }, input)
  }

  private restAtWindow(input: BehaviourInput, note: string | null): Plan {
    const goal = this.goal!
    const stableRest = windowAffordances(this.worldInput(input)).some(item => item.windowId === goal.windowId && item.kind === 'rest' && item.feasible)
    const duration = input.surfaceId ? 45 + this.rng() * 105 : 12 + this.rng() * 30
    goal.kind = 'rest'
    goal.phase = 'rest'
    goal.until = input.now + duration * (input.mode === 'playful' ? 0.7 : 1)
    this.nextWindowVisit = goal.until
    this.nextMicroAt = input.now + 4 + this.rng() * 5
    this.route = []
    this.places = rememberRest(this.places, this.worldInput(input))
    let posture: Posture = input.surfaceId ? 'ledge' : 'sitting'
    if (stableRest && input.surfaceId && this.needs.rest > 0.6) posture = 'resting_ledge'
    return this.make({ action: 'rest_surface', reason: stableRest ? 'a comfortable stable place to watch' : 'watching quietly after investigating', posture, gait: 'none', emote: null,
      targetX: null, targetY: null, surfaceId: input.surfaceId ?? null, until: goal.until, phase: 'act', speech: null, fx: 'none', event: 'resting_place', source: 'world', note }, input)
  }

  private microBehaviour(input: BehaviourInput): void {
    if (!this.plan || input.mode === 'sleep' || input.mode === 'focus') return
    const clips = input.surfaceId && this.plan.posture !== 'resting_ledge'
      ? ['look_over_edge', 'peek_along', 'settle_paws', 'paw_glass']
      : ['doze', 'lick_nose', 'knead', 'ear_twitch_left', 'nose_twitch']
    this.plan.emote = clips[Math.floor(this.rng() * clips.length)] ?? 'slow_blink'
    this.plan.token = ++this.token
    this.nextMicroAt = input.now + 6 + this.rng() * 10
  }

  private reactToActivity(input: BehaviourInput, note: string | null): Plan | null {
    if (input.airborne || this.plan?.gait === 'climb' || input.mode === 'sleep') return null
    const typing = input.typing
    if (typing?.active && typing.duration >= 1.2 && this.ready('typing', input.now, 18)) {
      this.cancelGoal('keeping company during typing')
      const window = input.windows.find(item => item.focused || item.app === typing.app)
      const aside = window && coversPuppy(window, input) && input.y >= input.floorY - 8
        ? asideFrom(window, input.x, input.minX, input.maxX) : null
      if (typing.pace === 'busy' && input.now >= this.stayUntil && aside !== null && Math.abs(aside - input.x) > 24 && input.mode !== 'focus') {
        return this.make({
          action: 'make_room', reason: `giving you room while you type in ${typing.app}`, posture: 'standing', gait: 'walk', emote: 'sidestep',
          targetX: aside, targetY: input.floorY, surfaceId: null, until: input.now + Math.abs(aside - input.x) / 80 + 2,
          phase: 'move', speech: null, fx: 'none', event: 'typing_started', source: typing.source ?? 'os', note,
        }, input)
      }
      return this.make({
        action: 'quiet_company', reason: `listening to your typing in ${typing.app}`, posture: input.surfaceId ? 'ledge' : 'sitting', gait: 'none',
        emote: input.surfaceId ? (typing.pace === 'busy' ? 'look_over_edge' : 'settle_paws') : (typing.pace === 'busy' ? 'watch_progress' : 'listen'),
        targetX: null, targetY: null, surfaceId: input.surfaceId ?? null, until: input.now + 3,
        phase: 'act', speech: null, fx: 'none', event: 'typing_started', source: typing.source ?? 'os', note,
      }, input)
    }
    const pause = input.events.find(event => event.type === 'typing_paused')
    if (pause?.type === 'typing_paused' && pause.duration >= 8 && input.mode !== 'focus' && this.ready('typing_pause', input.now, 25)) {
      return this.make({
        action: 'typing_pause', reason: 'looking up as your typing goes quiet', posture: 'sitting', gait: 'none', emote: pause.duration > 40 ? 'stretch_front' : 'listen',
        targetX: null, targetY: null, surfaceId: input.surfaceId ?? null, until: input.now + 1.6,
        phase: 'act', speech: null, fx: 'none', event: 'typing_paused', source: pause.source, note,
      }, input)
    }
    return null
  }

  private score(id: string, input: BehaviourInput, windowEvent: boolean): number {
    const p = this.personality
    if (input.now < this.typingQuietUntil && ['wander', 'follow', 'chase', 'approach'].includes(id)) return -1
    if (input.mode === 'focus' && ['wander', 'approach'].includes(id)) return -1
    if (input.mode === 'focus' && (id === 'chase' || id === 'follow' || id === 'emote')) return -1
    if (input.mode === 'sleep') return id === 'sleep' ? 5 : -1
    if (id === 'sleep') {
      const tired = this.needs.rest * 1.4 + (1 - this.needs.energy) * 1.1 + p.sleepiness * 0.45
      const quiet = input.idleSeconds > 90 ? 1.1 : input.idleSeconds > 30 ? 0.2 : -0.45
      return tired + quiet + (input.mode === 'chill' ? 0.05 : 0) - (input.mode === 'playful' ? 0.8 : 0)
    }
    if (id === 'yawn') return this.needs.energy < 0.48 ? 0.45 + p.sleepiness * 0.6 + this.needs.rest * 0.4 : -1
    if (id === 'chase') {
      if (!input.cursor || input.cursor.speed < 700 || !input.followCursor) return -1
      return p.playfulness * p.excitability * 1.6 + (input.mode === 'playful' ? 0.4 : 0) - p.independence * 0.2
    }
    if (id === 'follow') {
      if (!input.cursor || !input.followCursor || input.now < this.stayUntil) return -1
      const near = Math.hypot(input.cursor.x - input.x, input.cursor.y - input.y) < 360 ? 0.25 : 0
      return p.sociability * (1.05 - p.independence) * 0.85 + near + (input.now < this.followUntil ? 1.4 : 0)
    }
    if (id === 'approach') {
      if (!input.followWindows || input.windows.length === 0 || input.now < this.stayUntil || input.now < this.nextWindowVisit || input.now < this.typingQuietUntil || input.mode === 'focus') return -1
      const familiar = this.places.visits.reduce((sum, visit) => sum + visit.count, 0)
      return p.curiosity * 1.15 + this.needs.curiosity * 0.8 + (windowEvent ? 0.9 : 0) + (input.mode === 'playful' ? 0.15 : 0) - Math.min(0.55, familiar * 0.07)
    }
    if (id === 'wander') {
      if (input.now < this.stayUntil) return -1
      const explore = input.now < this.exploreUntil ? 0.8 : 0
      return this.needs.energy * 0.7 + p.energy * 0.35 + p.playfulness * 0.25 + explore + (input.mode === 'chill' ? -0.25 : 0.1)
    }
    if (id === 'emote') return 0.2 + (1 - this.needs.stimulation) * 0.25 + p.attentionSeeking * 0.2
    if (id === 'sit') return 0.48 + (input.mode === 'chill' ? 0.35 : 0) + p.independence * 0.15 + (1 - this.needs.energy) * 0.2
    return 0
  }

  private ready(key: string, now: number, seconds: number): boolean {
    const until = this.cooldowns.get(key) ?? 0
    if (now < until) return false
    this.cooldowns.set(key, now + seconds)
    return true
  }

  private noteForEvents(input: BehaviourInput): string | null {
    const noisy = input.events.find((event) => event.type === 'window_opened' || event.type === 'app_launched' || event.type === 'app_activated')
    if (!noisy) return null
    const until = this.cooldowns.get('window') ?? 0
    if (input.now < until) return `ignored ${noisy.type} (${noisy.source}) during cooldown`
    return null
  }

  private make(plan: Omit<Plan, 'token'> & { force?: boolean }, input: BehaviourInput): Plan {
    const previous = this.plan
    const changed = !previous || previous.action !== plan.action || previous.emote !== plan.emote || previous.targetX !== plan.targetX
    const token = changed ? ++this.token : previous.token
    this.plan = { ...plan, token }
    if (plan.posture === 'sleeping') this.asleep = true
    return this.plan
  }

  private gaze(input: BehaviourInput): { look: { x: number; y: number } | null; headLook: { x: number; y: number } | null; faceX: number | null } {
    if (this.asleep || input.mode === 'sleep') { this.attention.reset(); return { look: null, headLook: null, faceX: null } }
    const headY = input.y - 100
    const targets: import('./attention').AttentionTarget[] = []
    const world = this.world(input)
    if (world.attention) targets.push({ id: `window:${world.attention.id ?? world.attention.label}`, ...world.attention, score: world.attention.salience, body: !world.attention.glanceOnly })
    if (this.goal?.status === 'active') {
      const window = input.windows.find(item => item.id === this.goal!.windowId)
      const x = this.goal.phase === 'anticipate' && window ? window.bounds.x + window.bounds.w / 2 : this.goal.target.x
      const y = this.goal.phase === 'anticipate' && window ? window.bounds.y + 28 : this.goal.target.y - 30
      targets.push({ id: `goal:${this.goal.id}`, x, y, score: 2.8, label: this.goal.reason, body: true })
    }
    if (input.typing?.active) {
      const window = input.windows.find(item => item.app === input.typing!.app && item.focused)
      if (window) { const point = windowFocusPoint(window); targets.push({ id: `typing:${window.id}`, ...point, score: 3, label: 'the active application', body: true }) }
    }
    if (input.cursor) {
      const distance = Math.hypot(input.cursor.x - input.x, input.cursor.y - headY)
      if (distance < 280 || input.cursor.speed > 80) targets.push({ id: 'cursor', x: input.cursor.x, y: input.cursor.y, score: distance < 110 ? 4 : 2, label: 'cursor', body: distance < 220 })
    }
    const attention = this.attention.update(input.now, targets)
    this.attentionState = attention.state
    return { look: attention.eyes ? { x: attention.eyes.x - input.x, y: attention.eyes.y - headY } : null,
      headLook: attention.head ? { x: attention.head.x - input.x, y: attention.head.y - headY } : null, faceX: attention.bodyX }
  }

  private output(plan: Plan, input: BehaviourInput): BehaviourOutput {
    const gaze = this.gaze(input)
    const speech = input.mode === 'focus' && plan.event !== 'shared_text' ? null : plan.speech
    return {
      posture: plan.posture,
      gait: plan.gait,
      emote: plan.emote,
      targetX: plan.targetX,
      targetY: plan.targetY,
      surfaceId: plan.surfaceId,
      look: gaze.look,
      headLook: gaze.headLook,
      faceX: gaze.faceX,
      force: plan.force === true || plan.action === 'held' || plan.event === 'wake',
      token: plan.token,
      reason: plan.reason,
      action: plan.action,
      speech,
      fx: plan.fx,
      mood: this.mood,
      needs: { ...this.needs },
      debug: {
        action: plan.action,
        reason: plan.reason,
        mood: this.mood,
        event: plan.event,
        source: plan.source,
        note: plan.note,
        target: plan.targetX === null ? null : { x: plan.targetX, y: plan.targetY ?? input.floorY },
        state: this.asleep ? 'sleeping' : plan.posture,
        scores: this.scores,
        goal: this.route[0]?.reason ?? this.worldCache?.view.goal?.reason ?? null,
        attention: this.worldCache?.view.attention?.label ?? null,
      },
    }
  }
}
