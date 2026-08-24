// Deterministic seeded PRNG — CLAUDE.md tech stack: "a small hand-rolled seeded PRNG
// (mulberry32) for synthetic data generation and simulated recovery outcomes — no external
// dependency, fully reproducible." Used by the simulated Action Executor (pipeline/
// actionExecutor.js) so a given case/attempt always resolves to the same simulated outcome —
// this is what "deterministic" means in EVALUATION.md and in this pipeline, not Math.random().

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Turns an arbitrary string (e.g. `${caseId}:${attempts}`) into a 32-bit seed. */
export function seedFromString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}
