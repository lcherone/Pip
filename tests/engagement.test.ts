import { describe, expect, it } from 'vitest'
import { activityForAction } from '../src/core/learning'
import { BehaviourEngine, type BehaviourInput } from '../src/core/behaviour'
import { windowRestDuration, windowVisitInterval } from '../src/core/engagement'
import { AnimationEngine } from '../src/core/animation/engine'
import { PerformanceDirector, type Performance } from '../src/core/director'

const window = { id: 'editor', app: 'Editor', displayId: 'main', focused: true, onScreen: true, bounds: { x: 200, y: 400, w: 500, h: 400 } }
function input(overrides: Partial<BehaviourInput> = {}): BehaviourInput {
 return { dt: 0.1, now: 20, x: 450, y: 402, floorY: 848, minX: 40, maxX: 1160, windows: [window], focusedApp: 'Editor', cursor: null,
  idleSeconds: 0, dragging: false, paused: false, mode: 'playful', events: [], affinity: {}, supportLost: false, arrived: true,
  allowIntro: false, followWindows: true, windowClimbing: true, followCursor: false, memoryEnabled: false, surfaceId: window.id, ...overrides }
}

describe('environmental engagement', () => {
 it('uses shorter playful rests and visit gaps while retaining low-frequency and tired rests', () => {
  expect(windowVisitInterval('playful','normal',1)).toBeLessThan(windowVisitInterval('chill','normal',1))
  expect(windowVisitInterval('playful','high',1)).toBeLessThan(windowVisitInterval('playful','low',0))
  expect(windowRestDuration('playful','normal',true,false,false,1)).toBe(20)
  expect(windowRestDuration('playful','normal',true,true,false,0)).toBe(45)
  expect(windowRestDuration('playful','normal',true,false,true,0)).toBe(45)
 })
 it('plays, patrols and plays again on its current window before a short rest', () => {
  const brain=new BehaviourEngine(undefined,3)
  expect(activityForAction('play_window')).toBe('approach')
  expect(brain.update(input()).action).toBe('play_window')
  expect(brain.update(input({now:21})).action).toBe('play_window')
  const patrol=brain.update(input({now:26}))
  expect(patrol.action).toBe('play_window');expect(patrol.gait).toBe('walk')
  expect(patrol.targetX).not.toBe(450);expect(patrol.surfaceId).toBe(window.id)
  const game=brain.update(input({now:27,x:patrol.targetX!,arrived:true}))
  expect(game.action).toBe('play_window');expect(game.gait).toBe('none')
  const rest=brain.update(input({now:33,x:patrol.targetX!}))
  expect(rest.action).toBe('rest_surface')
  expect(brain.worldView?.activeGoal?.until).toBeLessThanOrEqual(53)
 })
 it('continues exploring during gentle typing and remains quiet during busy typing', () => {
  const gentle=new BehaviourEngine(undefined,3)
  const typing={active:true,pace:'gentle' as const,app:'Editor',duration:5}
  gentle.update(input({typing}))
  const exploration=gentle.update(input({now:22,typing}))
  expect(exploration.action).toBe('play_window')
  expect(gentle.worldView?.activeGoal?.status).toBe('active')
  const busy=new BehaviourEngine(undefined,3).update(input({typing:{...typing,pace:'busy'}}))
  expect(busy.action).toBe('quiet_company');expect(busy.gait).toBe('none')
 })
 it.each([{mode:'focus' as const},{mode:'sleep' as const},{followWindows:false},{paused:true}])('respects quiet and disabled states: %j', override => {
  const out=new BehaviourEngine(undefined,3).update(input(override))
  expect(out.action).not.toBe('play_window')
  if (!('followWindows' in override)) expect(out.gait).toBe('none')
 })
 it('recovers energy while resting on a window ledge', () => {
  const brain=new BehaviourEngine(undefined,3);brain.needs.energy=.5
  const before=brain.needs.energy
  for(let i=0;i<20;i++)brain.update(input({dt:.1,now:20+i/10}))
  expect(brain.needs.energy).toBeGreaterThan(before)
 })
 it('prepares a ledge walk without requesting a jump-down or ground-standing transition', () => {
  const engine=new AnimationEngine();engine.reset('ledge');engine.play('ledge_sniff',{force:true})
  const director=new PerformanceDirector(engine)
  const p:Performance={posture:'ledge',gait:'walk',emote:null,facing:1,motion:'idle',force:false,token:1,airborne:false,justLanded:false}
  expect(director.prepareMovement(p)).toBe('idle')
  expect(engine.requestedClip).toBe('sit_ledge')
  for(let i=0;i<40;i++)engine.update(1/60,{phase:0,time:i/60})
  expect(director.prepareMovement(p)).toBe('walk')
 })
 it('wakes from a refreshed natural nap in playful mode but honours an explicit sleep request', () => {
  const natural=new BehaviourEngine(undefined,3);natural.needs.energy=.1;natural.needs.rest=.95
  expect(natural.update(input({surfaceId:null,y:848})).action).toBe('sleep')
  natural.needs.energy=.9;natural.needs.rest=.1
  expect(natural.update(input({now:60,surfaceId:null,y:848})).action).toBe('wake')
  const requested=new BehaviourEngine(undefined,3)
  requested.update(input({surfaceId:null,y:848,force:{action:'sleep'}}))
  requested.needs.energy=.9;requested.needs.rest=.1
  expect(requested.update(input({now:60,surfaceId:null,y:848})).action).toBe('sleep')
 })
})
