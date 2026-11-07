export type AscentStyle = 'spring' | 'scramble' | 'careful'
export interface AscentFrame {
  phase: 'anticipate' | 'leap' | 'climb' | 'pullup'
  style: AscentStyle
  direction?: number
  progress: number
  remaining: number
  surfaceId: string
}

/** Selection is made once per visit, never rerolled during a paw stroke. */
export function chooseAscentStyle(height: number, energy: number, confidence: number, playfulness: number, roll: number): AscentStyle {
  if (height <= 155) return 'spring'
  if (energy < 0.45 || confidence < 0.4) return 'careful'
  if (playfulness > 0.6 && energy > 0.55 && roll < 0.55) return 'spring'
  return roll > 0.8 ? 'careful' : 'scramble'
}
