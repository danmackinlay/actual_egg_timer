/**
 * What more than one fixture module uses: the particle rows every
 * posterior is written out as, the summary of one that is not, and the cook the running and step fixtures
 * start from. The English catalogue is
 * english.ts's, apart, so that a fixture that shows no words does not reach
 * them. Importing this module computes nothing, so each
 * fixture can be made in a worker of its own (tools/fixtures.ts).
 */

import { SIZE_CLASSES } from '../../src/core/geometry.ts';
import { type Particle, type Posterior, createPrior, effectiveSampleSize } from '../../src/core/infer.ts';
import { type CookChoices, type CookPlan, phaseAt } from '../../src/core/running.ts';

export function particleRows(post: ReturnType<typeof createPrior>) {
  return post.particles.map((p) => ({
    alpha_m2s: p.alpha_m2s,
    logDoseOffset: p.logDoseOffset,
    noise: p.noise,
    whiteOffset: p.whiteOffset,
    whiteFirmGap: p.whiteFirmGap,
  }));
}

/**
 * A posterior as a fixture writes one that is not an input: its RNG's
 * state, its effective sample size, where the weight sits among the
 * particles (the weighted mean index, from 0), the first particle whole,
 * and the weighted mean and sd of each dimension, the time-scale's as its
 * log. Held to 1e-12, a particle drawn differently moves a mean, and one
 * reordered moves where the weight sits: what writing every particle
 * pinned, in a row. Swift's PosteriorSummary makes the same.
 */
export function posteriorSummary(post: Posterior) {
  let total = 0;
  for (const w of post.weights) total += w;
  const dims: [string, (p: Particle) => number][] = [
    ['logAlpha', (p) => Math.log(p.alpha_m2s)], ['logDoseOffset', (p) => p.logDoseOffset], ['noise', (p) => p.noise],
    ['whiteOffset', (p) => p.whiteOffset], ['whiteFirmGap', (p) => p.whiteFirmGap],
  ];
  const mean: Record<string, number> = {};
  const sd: Record<string, number> = {};
  for (const [name, of] of dims) {
    let m = 0;
    for (let i = 0; i < post.particles.length; i++) m += post.weights[i] * of(post.particles[i]);
    m /= total;
    let v = 0;
    for (let i = 0; i < post.particles.length; i++) v += post.weights[i] * (of(post.particles[i]) - m) ** 2;
    mean[name] = m;
    sd[name] = Math.sqrt(v / total);
  }
  let centre = 0;
  for (let i = 0; i < post.weights.length; i++) centre += post.weights[i] * i;
  return {
    count: post.particles.length, rng: post.rng, ess: effectiveSampleSize(post), weightCentre: centre / total,
    first: particleRows(post)[0], mean: mean, sd: sd,
  };
}

/** A plan as the running and step fixtures write it: what the cook is shown
 *  and timed by, at `now_s`. Swift's PlanRow makes the same. */
export function planRow(p: CookPlan, now_s: number) {
  return {
    phase: phaseAt(p.deadlines, now_s), cookTime_s: p.cookTime_s, timeToBoil_s: p.setup.timeToBoil_s,
    deadlines: p.deadlines, decided: p.decided !== null, lengthened: p.inputs === null, lean_s: p.lean_s,
    level: p.answer.level, verdict: p.answer.verdict.kind, overdue: p.overdue,
    slowHobAt_s: p.slowHobAt_s, tooOldAt_s: p.tooOldAt_s,
    certainty: p.certainty === null ? null : {
      certainty: p.certainty.words.certainty, from: p.certainty.words.from, to: p.certainty.words.to,
      low_s: p.certainty.time.low_s, high_s: p.certainty.time.high_s,
    },
  };
}

/** A JSON value `to` as what changed from `from`: `set`, each field given
 *  or changed, by its dotted path, and `delete`, each one taken away. An
 *  object in both is gone into; anything else, an array among them, is set
 *  whole. Fixtures.swift's `applying` makes `to` again. */
export function patchOf(from: unknown, to: unknown): { set?: Record<string, unknown>; delete?: string[] } {
  const set: Record<string, unknown> = {};
  const gone: string[] = [];
  const plain = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
  const walk = (a: Record<string, unknown>, b: Record<string, unknown>, at: string): void => {
    for (const k of Object.keys(a)) if (!(k in b)) gone.push(at + k);
    for (const [k, v] of Object.entries(b)) {
      if (plain(a[k]) && plain(v)) walk(a[k] as Record<string, unknown>, v, `${at}${k}.`);
      else if (!(k in a) || JSON.stringify(a[k]) !== JSON.stringify(v)) set[at + k] = v;
    }
  };
  if (!plain(from) || !plain(to)) throw new Error('patchOf: not two objects');
  walk(from, to, '');
  return { ...(Object.keys(set).length > 0 ? { set: set } : {}), ...(gone.length > 0 ? { delete: gone } : {}) };
}

/** The cook of the running and step fixtures: a 68 g EU Large from the
 *  fridge into 2 L of cold water at sea level, the heat held, then ice,
 *  jammy. */
export const BASE_CHOICES: CookChoices = {
  mass_kg: SIZE_CLASSES[2].mass_kg, massFrom: 'class', sizeTable: 'eu', eggFrom: 'fridge', customStart_C: 12,
  room_C: null, startMode: 'cold', afterBoil: 'hold', cooling: 'ice', tapWater_C: null, bowlLitres: 2, bowlWater_C: null, waterLitres: 2, eggCount: 2,
  altitude_m: 0, level: 0.41,
};

/** 7 October 2026, 09:00 UTC, in ms: when the fixtures' cooks start. */
export const START_MS = 1791363600000;
export const START_S = START_MS / 1000;

export const MEMORY = { '2.0': 480, '3.0': 610 };
