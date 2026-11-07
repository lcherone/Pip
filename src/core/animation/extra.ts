import { clamp } from '../math'
import { poseFrom, type BodyState, type Pose } from '../pose'
import type { Clip, ClipCategory } from './types'

type Kind = 'sigh' | 'paw' | 'look' | 'tuck' | 'hop' | 'blink' | 'lean' | 'sniff' | 'perk' | 'wag'

const stand = { sit: 0, lie: 0, tailLift: 24, mouth: 0.22 }
const sad = { sit: 1, tailLift: 2, tailWag: 0, mouth: -0.45, browL: 0.7, browR: 0.7, earL: 18, earR: 18, eyeL: 0.55, eyeR: 0.55, headY: 10 }
const ledge = { sit: 1, ledge: 1, danglers: 0.85, tailLift: 16, mouth: 0.2 }

export const SAD_STYLES = ['sad', 'sad_sigh', 'sad_paw', 'sad_aside', 'sad_curl', 'sad_whimper', 'sad_chin', 'sad_shuffle', 'sad_ear', 'sad_wait'] as const
export const WINDOW_FLOOR_STYLES = ['win_sniff_left', 'win_sniff_right', 'win_paw_left', 'win_paw_right', 'win_both_paws', 'win_tilt_left', 'win_tilt_right', 'win_peek_low', 'win_stretch_up', 'win_step_back', 'win_nose_press', 'win_double_take', 'win_tail_watch', 'win_hop_look', 'win_slow_watch'] as const
export const WINDOW_LEDGE_STYLES = ['ledge_chin', 'ledge_paw_dangle', 'ledge_lean_left', 'ledge_lean_right', 'ledge_peek_down', 'ledge_ears_up', 'ledge_tail_hang', 'ledge_shift', 'ledge_sniff', 'ledge_doze'] as const
export const STAND_STYLES = ['stand_square', 'stand_left_paw', 'stand_right_paw', 'stand_lean_left', 'stand_lean_right', 'stand_tall', 'stand_crouch', 'stand_alert', 'stand_soft', 'stand_nose_down', 'stand_look_up', 'stand_look_back', 'stand_wide', 'stand_crossed', 'stand_one_ear', 'stand_tail_high', 'stand_tail_low', 'stand_forward', 'stand_back', 'stand_side_eye', 'stand_panting', 'stand_sniffing', 'stand_proud', 'stand_shy', 'stand_ready'] as const

function clip(id: string, category: ClipCategory, state: BodyState, pose: Partial<Pose>, kind: Kind): Clip {
  return {
    id,
    category,
    duration: 2.2,
    loop: true,
    blend: 'base',
    slot: 'base',
    from: [state],
    end: state,
    interruptibility: 0.8,
    priority: 3,
    locks: [],
    playback: { speed: 1 },
    sample: (u) => bound({ ...pose, ...motion(kind, u, pose) }),
  }
}

function motion(kind: Kind, u: number, pose: Partial<Pose>): Partial<Pose> {
  const s = Math.sin(u * Math.PI * 2)
  const slow = Math.sin(u * Math.PI)
  const lift = Math.max(0, s)
  switch (kind) {
    case 'sigh':
      return { headY: (pose.headY ?? 0) + slow * 6, chest: -0.25 + slow * 0.2, eyeL: 0.4 + slow * 0.25, eyeR: 0.38 + slow * 0.22, mouth: -0.3 + slow * 0.15 }
    case 'paw':
      return { legFL: -26 * lift, legFR: (pose.legFR ?? 0) + s * 4, headRot: (pose.headRot ?? 0) + s * 6, headTilt: (pose.headTilt ?? 0) + lift * -4 }
    case 'look':
      return { headRot: (pose.headRot ?? 0) + s * 14, pupilX: s * 0.8, earL: (pose.earL ?? 0) + s * 6, yaw: clamp((pose.yaw ?? 1) + s * 0.15, -1, 1) }
    case 'tuck':
      return { curl: clamp((pose.curl ?? 0) + slow * 0.35, 0, 1), headY: (pose.headY ?? 0) + slow * 5, tailCurl: clamp((pose.tailCurl ?? 0) + slow * 0.4, 0, 1), squash: 0.9 - slow * 0.08 }
    case 'hop':
      return { bodyY: (pose.bodyY ?? 0) - lift * 8, squash: 1 - (1 - lift) * 0.08, legFL: -12 * lift, legFR: -10 * lift, tailLift: (pose.tailLift ?? 20) + lift * 8 }
    case 'blink':
      return { eyeL: 0.35 + (1 - Math.abs(s)) * 0.55, eyeR: 0.32 + (1 - Math.abs(s)) * 0.55, headTilt: (pose.headTilt ?? 0) + s * 3 }
    case 'lean':
      return { bodyRot: (pose.bodyRot ?? 0) + s * 4, bodyX: s * 6, legFL: (pose.legFL ?? 0) + s * 8, legFR: (pose.legFR ?? 0) - s * 8 }
    case 'sniff':
      return { sniff: 0.45 + lift * 0.55, muzzle: lift * 3, headY: (pose.headY ?? 0) + lift * 2, headRot: (pose.headRot ?? 0) + Math.sin(u * Math.PI * 4) * 6 }
    case 'perk':
      return { earL: (pose.earL ?? 0) - lift * 16, earR: (pose.earR ?? 0) - Math.max(0, -s) * 14, alert: 0.4 + lift * 0.6, headTilt: (pose.headTilt ?? 0) - lift * 4 }
    case 'wag':
      return { tailWag: 8 + Math.abs(s) * 14, tailLift: (pose.tailLift ?? 16) + s * 4, chest: (pose.chest ?? 0) + Math.abs(s) * 0.15 }
    default:
      return { bodyX: s * 2 }
  }
}

function bound(partial: Partial<Pose>): Pose {
  const pose = poseFrom(partial)
  pose.headRot = clamp(pose.headRot, -36, 36)
  pose.headTilt = clamp(pose.headTilt, -26, 26)
  pose.bodyRot = clamp(pose.bodyRot, -26, 26)
  pose.squash = clamp(pose.squash, 0.72, 1.24)
  pose.stretch = clamp(pose.stretch, 0.84, 1.24)
  pose.eyeL = clamp(pose.eyeL, 0, 1)
  pose.eyeR = clamp(pose.eyeR, 0, 1)
  pose.yaw = clamp(pose.yaw, -1.05, 1.05)
  return pose
}

export const EXTRA_CLIPS: Clip[] = [
  clip('sad_sigh', 'emotion', 'sitting', { ...sad, headTilt: 10, chest: -0.3, eyeL: 0.4, eyeR: 0.38 }, 'sigh'),
  clip('sad_paw', 'emotion', 'sitting', { ...sad, headRot: 12, headTilt: 6, legFL: -8 }, 'paw'),
  clip('sad_aside', 'emotion', 'sitting', { ...sad, yaw: -0.7, headRot: -16, pupilX: -0.6 }, 'look'),
  clip('sad_curl', 'emotion', 'sitting', { ...sad, lie: 0.35, curl: 0.4, headY: 16, tailCurl: 0.5 }, 'tuck'),
  clip('sad_whimper', 'emotion', 'sitting', { ...sad, mouth: 0.15, earL: 22, earR: 24, headY: 12 }, 'sigh'),
  clip('sad_chin', 'emotion', 'sitting', { ...sad, headY: 18, headTilt: 12, legFL: 20, legFR: 18, eyeL: 0.35, eyeR: 0.35 }, 'blink'),
  clip('sad_shuffle', 'emotion', 'sitting', { ...sad, bodyRot: -8, danglers: 0.3 }, 'lean'),
  clip('sad_ear', 'emotion', 'sitting', { ...sad, earL: 8, earR: 24, headTilt: -6, alert: 0.2 }, 'perk'),
  clip('sad_wait', 'emotion', 'sitting', { ...sad, headTilt: -8, pupilY: -0.4, earL: 6, earR: 20, tailLift: 8 }, 'look'),

  clip('win_sniff_left', 'desktop', 'standing', { ...stand, headTilt: -12, headRot: -14, alert: 0.7, earL: -10 }, 'sniff'),
  clip('win_sniff_right', 'desktop', 'standing', { ...stand, headTilt: -10, headRot: 16, alert: 0.7, earR: -12 }, 'sniff'),
  clip('win_paw_left', 'desktop', 'standing', { ...stand, headTilt: -8, chest: 0.3, earL: -8 }, 'paw'),
  clip('win_paw_right', 'desktop', 'standing', { ...stand, headTilt: -8, headRot: 8, chest: 0.25, legFR: -8 }, 'paw'),
  clip('win_both_paws', 'desktop', 'standing', { ...stand, chest: 0.7, stretch: 1.12, headTilt: -14, legFL: -16, legFR: -14, earL: -16, earR: -14 }, 'hop'),
  clip('win_tilt_left', 'desktop', 'standing', { ...stand, headTilt: -16, headRot: -12, earL: -20, alert: 0.8 }, 'look'),
  clip('win_tilt_right', 'desktop', 'standing', { ...stand, headTilt: -16, headRot: 14, earR: -20, alert: 0.8 }, 'look'),
  clip('win_peek_low', 'desktop', 'standing', { ...stand, headTilt: 14, headY: 10, squash: 0.86, sniff: 0.4 }, 'sniff'),
  clip('win_stretch_up', 'desktop', 'standing', { ...stand, stretch: 1.18, headTilt: -18, headY: -8, chest: 0.6, earL: -18, earR: -16 }, 'perk'),
  clip('win_step_back', 'desktop', 'standing', { ...stand, bodyX: -6, headTilt: -6, tailLift: 10, earL: 8, earR: 8 }, 'lean'),
  clip('win_nose_press', 'desktop', 'standing', { ...stand, headTilt: -14, headY: -2, muzzle: 2, alert: 0.6 }, 'sniff'),
  clip('win_double_take', 'desktop', 'standing', { ...stand, earL: -12, earR: -4, alert: 1 }, 'look'),
  clip('win_tail_watch', 'desktop', 'standing', { ...stand, tailLift: 36, headTilt: -8, alert: 0.55 }, 'wag'),
  clip('win_hop_look', 'desktop', 'standing', { ...stand, headTilt: -12, mouth: 0.6, earL: -10, earR: -10 }, 'hop'),
  clip('win_slow_watch', 'desktop', 'standing', { ...stand, headTilt: -6, eyeL: 0.7, eyeR: 0.7, tailLift: 18, alert: 0.35 }, 'blink'),

  clip('ledge_chin', 'desktop', 'ledge', { ...ledge, headY: 14, headTilt: 10, eyeL: 0.6, eyeR: 0.55 }, 'blink'),
  clip('ledge_paw_dangle', 'desktop', 'ledge', { ...ledge, danglers: 1, legFL: 28, legFR: 22, headRot: 8 }, 'paw'),
  clip('ledge_lean_left', 'desktop', 'ledge', { ...ledge, bodyRot: -16, headRot: -12, earL: 8 }, 'lean'),
  clip('ledge_lean_right', 'desktop', 'ledge', { ...ledge, bodyRot: 16, headRot: 12, earR: 8 }, 'lean'),
  clip('ledge_peek_down', 'desktop', 'ledge', { ...ledge, headTilt: 16, pupilY: 0.7, alert: 0.7, earL: -6, earR: -4 }, 'look'),
  clip('ledge_ears_up', 'desktop', 'ledge', { ...ledge, earL: -24, earR: -22, alert: 0.9, headTilt: -8 }, 'perk'),
  clip('ledge_tail_hang', 'desktop', 'ledge', { ...ledge, tailLift: 4, tailWag: 2, headY: 6 }, 'wag'),
  clip('ledge_shift', 'desktop', 'ledge', { ...ledge, bodyX: 4 }, 'lean'),
  clip('ledge_sniff', 'desktop', 'ledge', { ...ledge, headTilt: 6, headRot: 8 }, 'sniff'),
  clip('ledge_doze', 'desktop', 'ledge', { ...ledge, eyeL: 0.35, eyeR: 0.3, earL: 16, earR: 18, headY: 10, tailLift: 6 }, 'blink'),

  clip('stand_square', 'idle', 'standing', { ...stand, chest: 0.2, legFL: 2, legFR: 2 }, 'lean'),
  clip('stand_left_paw', 'idle', 'standing', { ...stand, headRot: -8 }, 'paw'),
  clip('stand_right_paw', 'idle', 'standing', { ...stand, headRot: 10, legFR: -6 }, 'paw'),
  clip('stand_lean_left', 'idle', 'standing', { ...stand, bodyRot: -14, headRot: -8 }, 'lean'),
  clip('stand_lean_right', 'idle', 'standing', { ...stand, bodyRot: 14, headRot: 8 }, 'lean'),
  clip('stand_tall', 'idle', 'standing', { ...stand, stretch: 1.16, chest: 0.8, headY: -8, earL: -18, earR: -16, tailLift: 48 }, 'perk'),
  clip('stand_crouch', 'idle', 'standing', { ...stand, squash: 0.78, bodyY: 8, headY: 8, tailLift: 12 }, 'hop'),
  clip('stand_alert', 'idle', 'standing', { ...stand, earL: -22, earR: -20, alert: 1, headTilt: -8, tailLift: 40 }, 'perk'),
  clip('stand_soft', 'idle', 'standing', { ...stand, earL: 14, earR: 16, eyeL: 0.7, eyeR: 0.65, tailLift: 14, squash: 0.92 }, 'blink'),
  clip('stand_nose_down', 'idle', 'standing', { ...stand, headTilt: 16, headY: 8, sniff: 0.5 }, 'sniff'),
  clip('stand_look_up', 'idle', 'standing', { ...stand, headTilt: -18, pupilY: -0.7, earL: -8, earR: -8 }, 'look'),
  clip('stand_look_back', 'idle', 'standing', { ...stand, yaw: -0.55, headRot: -18, alert: 0.4 }, 'look'),
  clip('stand_wide', 'idle', 'standing', { ...stand, legFL: 14, legFR: -14, bodyX: 2, tailLift: 20 }, 'lean'),
  clip('stand_crossed', 'idle', 'standing', { ...stand, legFL: 10, legFR: -12, headTilt: 6, tailLift: 16 }, 'paw'),
  clip('stand_one_ear', 'idle', 'standing', { ...stand, earL: -26, earR: 16, headTilt: -6 }, 'perk'),
  clip('stand_tail_high', 'idle', 'standing', { ...stand, tailLift: 62, tailWag: 10, chest: 0.4, mouth: 0.5 }, 'wag'),
  clip('stand_tail_low', 'idle', 'standing', { ...stand, tailLift: 4, earL: 10, earR: 12, headY: 4 }, 'wag'),
  clip('stand_forward', 'idle', 'standing', { ...stand, bodyRot: -8, chest: 0.55, headY: -4, alert: 0.6 }, 'lean'),
  clip('stand_back', 'idle', 'standing', { ...stand, bodyRot: 10, bodyX: -4, headTilt: 4, tailLift: 10 }, 'lean'),
  clip('stand_side_eye', 'idle', 'standing', { ...stand, pupilX: 0.8, headRot: 6, yaw: 0.4 }, 'look'),
  clip('stand_panting', 'idle', 'standing', { ...stand, mouth: 0.9, chest: 0.35, earL: 6, earR: 6, tailWag: 8 }, 'wag'),
  clip('stand_sniffing', 'idle', 'standing', { ...stand, headTilt: 12, headY: 6 }, 'sniff'),
  clip('stand_proud', 'idle', 'standing', { ...stand, chest: 0.9, stretch: 1.1, tailLift: 56, mouth: 0.7, earL: -14, earR: -12 }, 'wag'),
  clip('stand_shy', 'idle', 'standing', { ...stand, headRot: -10, earL: 16, earR: 18, tailLift: 6, squash: 0.9, eyeL: 0.6, eyeR: 0.55 }, 'blink'),
  clip('stand_ready', 'idle', 'standing', { ...stand, alert: 0.85, earL: -12, earR: -14, tailLift: 34, chest: 0.45, legFL: -4, legFR: -4 }, 'perk'),
]
