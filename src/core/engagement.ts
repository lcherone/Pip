import type { PipMode } from './settings'
export type VisitFrequency = 'low' | 'normal' | 'high'

export function windowVisitInterval(mode: PipMode, frequency: VisitFrequency, roll: number): number {
  const ranges = mode === 'playful'
    ? { low: [32, 60], normal: [9, 17], high: [5, 10] }
    : { low: [42, 84], normal: [22, 48], high: [10, 24] }
  const [minimum, maximum] = ranges[frequency]
  return minimum! + roll * (maximum! - minimum!)
}

export function windowRestDuration(mode: PipMode, frequency: VisitFrequency, perched: boolean, tired: boolean, busy: boolean, roll: number): number {
  if (mode !== 'playful' || tired || busy) return perched ? 45 + roll * 105 : 12 + roll * 30
  const range = frequency === 'low' ? [24, 45] : frequency === 'high' ? [6, 12] : [9, 20]
  return (range[0]! + roll * (range[1]! - range[0]!)) * (perched ? 1 : 0.7)
}
