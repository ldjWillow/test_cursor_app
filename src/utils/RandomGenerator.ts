/**
 * Seeded mulberry32 PRNG — all simulation randomness must go through this.
 */
export class RandomGenerator {
  private state: number

  constructor(seed = 1) {
    this.state = seed >>> 0 || 1
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Uniform float in [min, max). */
  nextRange(min: number, max: number): number {
    return min + (max - min) * this.next()
  }

  /** Uniform integer in [min, max] inclusive. */
  nextInt(min: number, max: number): number {
    const lo = Math.ceil(min)
    const hi = Math.floor(max)
    return lo + Math.floor(this.next() * (hi - lo + 1))
  }

  /** Exponential distribution with mean = 1/rate (rate = events per unit time). */
  nextExponential(rate: number): number {
    const lambda = Math.max(1e-12, rate)
    return -Math.log(1 - this.next()) / lambda
  }

  /** Interval in seconds for tasksPerHour using exponential spacing. */
  nextInterArrivalHours(tasksPerHour: number): number {
    const ratePerSecond = Math.max(1e-12, tasksPerHour) / 3600
    return this.nextExponential(ratePerSecond)
  }

  getSeedState(): number {
    return this.state
  }
}
