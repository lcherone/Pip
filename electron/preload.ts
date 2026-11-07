import { contextBridge, ipcRenderer } from 'electron'
import type { BrainSnapshot } from '../src/core/assistant/types'
import type { BootPayload, CodexPush, DesktopPayload, MemoryPayload, PetFrame, PipApi } from '../src/shared/ipc'
import type { Settings } from '../src/core/settings'

function listen<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: unknown, payload: T) => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

const api: PipApi = {
  getBoot: () => ipcRenderer.invoke('get-boot'),
  worldSource: (source) => ipcRenderer.send('world:source', source),
  getWorld: () => ipcRenderer.invoke('world:get'),
  onWorld: (listener) => listen('world', listener),
  reportWorld: (snapshot) => ipcRenderer.send('world:report', snapshot),
  clearEnvironment: () => ipcRenderer.invoke('world:clear-memory'),
  getBrain: (debug = false) => ipcRenderer.invoke('brain:get', debug),
  brainCommand: (command) => ipcRenderer.invoke('brain:command', command),
  simulateBrain: (event) => ipcRenderer.invoke('brain:simulate', event),
  onBrain: (listener) => listen<BrainSnapshot>('brain', listener),
  onDebugBrain: (listener) => listen<BrainSnapshot>('debug-brain', listener),
  saveSettings: (settings: Settings) => ipcRenderer.invoke('save-settings', settings),
  savePosition: (position) => ipcRenderer.send('save-position', position),
  noteRest: (app) => ipcRenderer.send('note-rest', app),
  noteEnvironment: (memory) => ipcRenderer.send('note-environment', memory),
  remember: (action) => ipcRenderer.send('remember', action),
  feedback: (activity, feedback) => ipcRenderer.invoke('feedback', activity, feedback),
  checkAnimations: () => ipcRenderer.invoke('check-animations'),
  onMemory: (listener) => listen<MemoryPayload>('memory', listener),
  clearMemory: () => ipcRenderer.invoke('clear-memory'),
  clearThread: () => ipcRenderer.invoke('clear-thread'),
  setFrame: (frame: PetFrame) => ipcRenderer.send('set-frame', frame),
  setMousePolicy: (policy) => ipcRenderer.send('mouse-policy', policy),
  setPetVisible: (visible) => ipcRenderer.send('pet-visible', visible),
  onDesktop: (listener) => listen<DesktopPayload>('desktop', listener),
  reactToCopiedText: () => ipcRenderer.invoke('react-to-copied-text'),
  onEnvironmentEvent: (listener) => listen('environment-event', listener),
  onCursor: (listener) => listen<{ x: number; y: number }>('cursor', listener),
  onCommand: (listener) => listen('command', listener),
  onCodex: (listener) => listen<CodexPush>('codex', listener),
  talk: (text, frontApp) => ipcRenderer.invoke('talk', text, frontApp),
  decideApproval: (accept) => ipcRenderer.send('approval', accept),
  reconnectCodex: () => ipcRenderer.invoke('codex-reconnect'),
  open: (target) => ipcRenderer.send('open', target),
  command: (type, mode) => ipcRenderer.send('command', { type, mode }),
  log: (level, message) => ipcRenderer.send('log', level, message),
  capture: (name) => ipcRenderer.invoke('capture', name),
}

contextBridge.exposeInMainWorld('pip', api)

export type Boot = BootPayload
