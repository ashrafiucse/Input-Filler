// Small, dependency-free randomness helpers. Generators accept an optional rng
// so tests can seed deterministic sequences; the default is Math.random so every
// real fill produces fresh data.

export type Rng = () => number;

/** Deterministic PRNG (mulberry32) for tests; pass a fixed seed for reproducibility. */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const defaultRng: Rng = Math.random;

export function pick<T>(arr: readonly T[], rng: Rng = defaultRng): T {
  return arr[Math.floor(rng() * arr.length)] as T;
}

/** Random character from a string. */
export function char(s: string, rng: Rng = defaultRng): string {
  return s.charAt(Math.floor(rng() * s.length));
}

/** Inclusive random integer in [min, max] snapped to a step. */
export function int(min: number, max: number, step = 1, rng: Rng = defaultRng): number {
  const span = max - min;
  const steps = Math.round(span / step);
  const k = Math.floor(rng() * (steps + 1));
  return min + k * step;
}
