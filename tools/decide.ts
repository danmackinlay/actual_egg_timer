/**
 * E5's measurements: what choosing the time costs, how accurate its surface
 * is, what it does before and after the first egg, whether the odds are
 * calibrated, and why "still learning" is a count.
 *
 * Run: npm run decide            (all of it, several minutes)
 *      npm run decide -- cost    (one section: cost, accuracy, lean, odds,
 *                                 learning, runny)
 *
 * Read-only. Nothing in src/ is touched. The numbers it prints are the ones in
 * PLAN.md (E5), INFERENCE.md section 8 and LOGBOOK.md, 28 September 2026; the
 * claims they rest on are asserted, more cheaply, in test/decide.test.ts.
 */

import {
  Decision, DecisionInputs, chooseCookTime, decide, decideAt, decisionGridRequest,
  decisionGridSpec, decisionInputs, STILL_LEARNING_HALF_WIDTH_S,
} from '../src/core/decide.js';
import { DoseGrid, buildDoseGrid, cookTimeForLogYolkDose } from '../src/core/doseGrid.js';
import {
  Feedback, FEEDBACK_BAND, Particle, WhiteReport, answerLikelihood, createPrior,
  posteriorMeanOffset, posteriorParams, updatePosterior,
} from '../src/core/infer.js';
import { ALPHA_DEFAULT } from '../src/core/constants.js';
import { eggFromMass, Egg } from '../src/core/geometry.js';
import { CookSetup } from '../src/core/protocol.js';
import { Solution, donenessFromSlider, solveCookTime } from '../src/core/solve.js';
import { CALIBRATION_SEED, PARTICLE_COUNT, verdictFor } from '../src/core/policy.js';
import {
  Calibration, EggRecord, PRIOR_ID, buildRequestedGrid, calibrationDoneness, calibrationParams,
  freshCalibration, replay,
} from '../src/core/record.js';

const only = process.argv[2] ?? 'all';
const run = (name: string): boolean => only === 'all' || only === name;

function setupOf(over: Partial<CookSetup> = {}): CookSetup {
  return {
    startMode: 'hot', eggStart_C: 4, ambient_C: 20, boiling_C: 100, timeToBoil_s: 480,
    cooling: 'ice', afterBoil: 'hold', waterLitres: 2, eggCount: 2, ...over,
  };
}

const REF_EGG = eggFromMass(0.068);
const SETUP = setupOf();

interface Pot { name: string; egg: Egg; setup: CookSetup }
const POTS: Pot[] = [
  { name: '68 g, boiling, ice', egg: REF_EGG, setup: SETUP },
  { name: '68 g, cold start', egg: REF_EGG, setup: setupOf({ startMode: 'cold' }) },
  { name: '68 g, tap', egg: REF_EGG, setup: setupOf({ cooling: 'tap' }) },
  { name: '68 g, counter', egg: REF_EGG, setup: setupOf({ cooling: 'counter' }) },
  { name: '68 g, heat off, 4 L', egg: REF_EGG, setup: setupOf({ afterBoil: 'off', waterLitres: 4 }) },
  { name: '50 g, boiling, ice', egg: eggFromMass(0.05), setup: SETUP },
  { name: '80 g, boiling, ice', egg: eggFromMass(0.08), setup: SETUP },
];

function logTarget(level: number): number {
  return Math.log10(donenessFromSlider(level).yolkDose_min);
}

function meanSolve(c: Calibration, egg: Egg, setup: CookSetup, level: number): { sol: Solution; level: number } {
  const params = calibrationParams(c);
  const sol = solveCookTime(egg, setup, params, calibrationDoneness(c, level));
  const v = verdictFor(sol, level);
  if (v.snapTo !== null) {
    const retry = solveCookTime(egg, setup, params, calibrationDoneness(c, v.snapTo));
    if (retry.reachable) return { sol: retry, level: v.snapTo };
  }
  return { sol: sol, level: level };
}

function recordAt(level: number, t: number, yolk: Feedback | null, white: WhiteReport | null): EggRecord {
  return {
    v: 1, uid: null, day: '2026-09-28', app: 'web', appVersion: '0.2.0', prior: PRIOR_ID,
    egg: { mass_g: 68, massFrom: 'class', sizeTable: 'eu' },
    setup: {
      startMode: 'hot', eggStart_C: 4, eggFrom: 'fridge', ambient_C: 20, boiling_C: 100,
      timeToBoil_s: 480, timeToBoilFrom: 'default', cooling: 'ice', afterBoil: 'hold',
      waterLitres: 2, eggCount: 2,
    },
    level: level, recommended_s: t, nudge_s: 0, pulled_s: t, pulledBy: 'timeout', cooled_s: 180,
    yolk: yolk, white: white, whiteOffered: true, probe: null, lang: 'en', register: 'modern', units: 'metric',
  };
}

function ms(f: () => void): number {
  const t0 = performance.now();
  f();
  return performance.now() - t0;
}

const PRIOR = freshCalibration(PARTICLE_COUNT, CALIBRATION_SEED);
const lit464 = meanSolve(PRIOR, REF_EGG, SETUP, 0.41).sol.result.cookTime_s;
const LEARNED: Record<string, Calibration> = {
  prior: PRIOR,
  'one egg': replay(PRIOR, [recordAt(0.41, lit464, 0, 'firm')]),
  'three eggs, firmer': replay(PRIOR, [
    recordAt(0.41, lit464, -1, 'firm'), recordAt(0.41, lit464 + 15, -1, 'firm'), recordAt(0.41, lit464 + 30, 0, 'firm'),
  ]),
};

/* ------------------------------------------------------------------ cost */

if (run('cost')) {
  console.log('\n== cost: the decision surface, and a decision on it (node, this machine)');
  for (const pot of POTS) {
    const inputs = decisionInputs(LEARNED['one egg'], pot.egg, pot.setup);
    let grid: DoseGrid | null = null;
    const spec = decisionGridSpec(inputs);
    const build = ms(() => { grid = buildRequestedGrid(decisionGridRequest(inputs)); });
    const g = grid as unknown as DoseGrid;
    const m = meanSolve(LEARNED['one egg'], pot.egg, pot.setup, 0.41);
    let d: Decision | null = null;
    const choose = ms(() => { d = decide(LEARNED['one egg'], g, m.sol, logTarget(m.level)); });
    const solve = ms(() => meanSolve(LEARNED['one egg'], pot.egg, pot.setup, 0.41));
    console.log(`${pot.name}: surface ${spec.alphaCount} x ${spec.timeCount} (${spec.timeMin_s.toFixed(0)}-${spec.timeMax_s.toFixed(0)} s) built in ${build.toFixed(0)} ms; `
      + `a decision ${choose.toFixed(1)} ms; the mean solve ${solve.toFixed(1)} ms${(d as Decision | null)?.chosen ? '' : ' (nothing to choose)'}`);
  }
}

/* -------------------------------------------------------------- accuracy */

if (run('accuracy')) {
  console.log('\n== accuracy: the production surface against a fine one (29 rows, 4 s)');
  const rows: string[] = [];
  for (const pot of POTS) {
    let worst = { t: 0, odds: 0, where: '' };
    for (const [name, c] of Object.entries(LEARNED)) {
      if (c.eggsLogged === 0) continue;
      const inputs = decisionInputs(c, pot.egg, pot.setup);
      const spec = decisionGridSpec(inputs);
      const grid = buildRequestedGrid(decisionGridRequest(inputs));
      const fine = buildDoseGrid(
        pot.egg, pot.setup, inputs.params.tauAirScale, spec.alphaMin, spec.alphaMax, 29,
        spec.timeMin_s, spec.timeMax_s, Math.round((spec.timeMax_s - spec.timeMin_s) / 4) + 1,
      );
      for (const level of [0.1, 0.22, 0.41, 0.62, 0.85, 1]) {
        const m = meanSolve(c, pot.egg, pot.setup, level);
        const a = decide(c, grid, m.sol, logTarget(m.level));
        const b = decide(c, fine, m.sol, logTarget(m.level));
        const e = Math.abs(a.cookTime_s - b.cookTime_s);
        if (e > worst.t) worst = { ...worst, t: e, where: `${name}, level ${m.level}` };
        worst.odds = Math.max(worst.odds, Math.abs(a.odds - b.odds));
      }
    }
    rows.push(`${pot.name}: worst time ${worst.t.toFixed(2)} s (${worst.where}); worst odds ${worst.odds.toFixed(4)}`);
  }
  console.log(rows.join('\n'));
}

/* ------------------------------------------------------------------ lean */

if (run('lean')) {
  console.log('\n== lean: the choice against the mean solve, s (the mean solve before any egg IS the literature)');
  for (const pot of POTS) {
    const cells: string[] = [];
    for (const [name, c] of Object.entries(LEARNED)) {
      const grid = buildRequestedGrid(decisionGridRequest(decisionInputs(c, pot.egg, pot.setup)));
      const row: string[] = [];
      for (const level of [0.22, 0.41, 0.62, 1.0]) {
        const m = meanSolve(c, pot.egg, pot.setup, level);
        const mean = m.sol.result.cookTime_s;
        // Before any egg the app does not choose; this is what it WOULD choose.
        const t = chooseCookTime(c.posterior, grid, logTarget(m.level), mean);
        const d = decideAt(c.posterior, c.eggsLogged, grid, mean, true, logTarget(m.level));
        row.push(`${m.level}: ${t - mean >= 0 ? '+' : ''}${(t - mean).toFixed(0)} (${d.oddsTenths}/10)`);
      }
      cells.push(`${name}${c.eggsLogged === 0 ? ' [would]' : ''} ${row.join(' ')}`);
    }
    console.log(`${pot.name}:\n  ${cells.join('\n  ')}`);
  }
}

/* ------------------------------------------------------ simulated cooks */

function rng(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13; s |= 0;
    s ^= s >>> 17;
    s ^= s << 5; s |= 0;
    return ((s >>> 0) % 16777216) / 16777216;
  };
}

function draw(probs: number[], u: number): number {
  let acc = 0;
  for (let k = 0; k < probs.length; k++) {
    acc += probs[k];
    if (u < acc) return k;
  }
  return probs.length - 1;
}

/** Cooks drawn from the prior, each at one level, eggs at the time the app
 *  would choose, answers from the truth's own probit. Calls `each` before every
 *  egg is folded. One fixed surface for speed. */
function simulate(
  cooks: number, eggs: number, particles: number, seed: number,
  each: (c: Calibration, d: Decision, hit: boolean, egg: number, grid: DoseGrid, target: number) => void,
): void {
  const grid = buildDoseGrid(REF_EGG, SETUP, 1, ALPHA_DEFAULT * 0.55, ALPHA_DEFAULT * 1.8, 17, 200, 900, 71);
  const random = rng(seed);
  const truths = createPrior(cooks, seed ^ 0x2545f49).particles;
  const levels = [0.22, 0.41, 0.62];
  for (let k = 0; k < cooks; k++) {
    const truth: Particle = truths[k];
    const cal: Calibration = { posterior: createPrior(particles, 1 + Math.floor(random() * 2147483646)), eggsLogged: 0 };
    const level = levels[k % levels.length];
    for (let egg = 0; egg <= eggs; egg++) {
      const m = meanSolve(cal, REF_EGG, SETUP, level);
      const target = logTarget(m.level);
      const d = decide(cal, grid, m.sol, target);
      if (egg === eggs) {
        each(cal, d, false, egg, grid, target);
        break;
      }
      const t = d.cookTime_s;
      const y = draw(([-1, 0, 1] as Feedback[]).map((a) => answerLikelihood(grid, truth, t, target, a, null)), random());
      const w = draw((['runny', 'tender', 'firm'] as WhiteReport[]).map((a) => answerLikelihood(grid, truth, t, target, null, a)), random());
      each(cal, d, y === 1 && w !== 0, egg, grid, target);
      updatePosterior(cal.posterior, grid, t, target, (y - 1) as Feedback, (['runny', 'tender', 'firm'] as WhiteReport[])[w]);
      cal.eggsLogged += 1;
    }
  }
}

if (run('odds')) {
  console.log('\n== odds: predicted P(hit the mark) against simulated cooks (400 cooks x 6 eggs, 1000 particles)');
  const BINS = 10;
  const pred = new Array<number>(BINS).fill(0);
  const obs = new Array<number>(BINS).fill(0);
  const cnt = new Array<number>(BINS).fill(0);
  const byEgg: { p: number; o: number; n: number }[] = [];
  simulate(400, 6, 1000, 20260929, (_c, d, hit, egg) => {
    if (egg === 6) return;
    const b = Math.min(BINS - 1, Math.floor(d.odds * BINS));
    pred[b] += d.odds; obs[b] += hit ? 1 : 0; cnt[b] += 1;
    byEgg[egg] ??= { p: 0, o: 0, n: 0 };
    byEgg[egg].p += d.odds; byEgg[egg].o += hit ? 1 : 0; byEgg[egg].n += 1;
  });
  let ece = 0;
  let total = 0;
  const rows: string[] = [];
  for (let b = 0; b < BINS; b++) {
    if (cnt[b] === 0) continue;
    const p = pred[b] / cnt[b];
    const o = obs[b] / cnt[b];
    rows.push(`${(100 * p).toFixed(0)}% -> ${(100 * o).toFixed(0)}% (${cnt[b]})`);
    ece += Math.abs(p - o) * cnt[b];
    total += cnt[b];
  }
  console.log(`ECE ${(ece / total).toFixed(4)} over ${total}: ${rows.join('; ')}`);
  console.log(`by egg, mean predicted -> observed: ${byEgg.map((e, i) => `${i}: ${(100 * e.p / e.n).toFixed(0)}% -> ${(100 * e.o / e.n).toFixed(0)}%`).join('; ')}`);
}

if (run('learning')) {
  console.log('\n== learning: the interval rule, against the count (150 cooks x 8 eggs)');
  type Flags = { interval: boolean; band: boolean; count: boolean }[];
  const flags: Flags[] = [];
  let current: Flags = [];
  simulate(150, 8, 1000, 20260930, (c, d, _hit, egg, grid, target) => {
    if (egg === 0) { current = []; flags.push(current); }
    const half = 0.5 * (d.interval.high_s - d.interval.low_s);
    const a = posteriorParams(c.posterior).alpha_m2s;
    const o = posteriorMeanOffset(c.posterior);
    const band = 0.5 * (cookTimeForLogYolkDose(grid, a, target + o + FEEDBACK_BAND)
      - cookTimeForLogYolkDose(grid, a, target + o - FEEDBACK_BAND));
    current.push({ interval: d.stillLearning, band: half > band, count: c.eggsLogged < 4 });
  });
  for (const rule of ['interval', 'band', 'count'] as const) {
    const firstOff: number[] = [];
    let never = 0;
    let back = 0;
    const share = new Array<number>(9).fill(0);
    for (const f of flags) {
      const on = f.map((x) => x[rule]);
      on.forEach((v, i) => { share[i] += v ? 1 : 0; });
      const off = on.indexOf(false);
      if (off < 0) { never += 1; continue; }
      firstOff.push(off);
      if (on.slice(off).some((v) => v)) back += 1;
    }
    firstOff.sort((x, y) => x - y);
    console.log(`${rule}: first off after ${firstOff[Math.floor(firstOff.length / 2)]} eggs (median), never off in 8: ${never}, `
      + `came back after going: ${back} of ${flags.length}; on after each egg: ${share.map((s) => (s / flags.length).toFixed(2)).join(' ')}`);
  }
  console.log(`(interval is the app's rule, +-${STILL_LEARNING_HALF_WIDTH_S} s; band is +-the width of "just right" at that cook; count is the first four eggs, the fallback)`);
}

/* ---------------------------------------------------------- runny whites */

if (run('runny')) {
  console.log('\n== two runny whites at soft (production surfaces)');
  const grid0 = buildRequestedGrid(decisionGridRequest(decisionInputs(PRIOR, REF_EGG, SETUP)));
  const at = (c: Calibration, g: DoseGrid, level: number): Decision => {
    const m = meanSolve(c, REF_EGG, SETUP, level);
    return decide(c, g, m.sol, logTarget(m.level));
  };
  const before = [at(PRIOR, grid0, 0.22), at(PRIOR, grid0, 0.41)];
  for (const sequence of ['E3', 'E5'] as const) {
    for (const yolk of [null, 0] as (Feedback | null)[]) {
      let cal = PRIOR;
      const log: EggRecord[] = [];
      for (let i = 0; i < 2; i++) {
        const g = buildRequestedGrid(decisionGridRequest(decisionInputs(cal, REF_EGG, SETUP)));
        const d = at(cal, g, 0.22);
        log.push(recordAt(0.22, sequence === 'E3' ? d.meanCookTime_s : d.cookTime_s, yolk, 'runny'));
        cal = replay(PRIOR, log);
      }
      const g = buildRequestedGrid(decisionGridRequest(decisionInputs(cal, REF_EGG, SETUP)));
      const after = [at(cal, g, 0.22), at(cal, g, 0.41)];
      console.log(`${sequence}, ${yolk === null ? 'white only' : 'yolk just right too'}, cooked at ${log.map((r) => r.recommended_s.toFixed(0)).join(' and ')} s: `
        + `soft ${before[0].cookTime_s.toFixed(0)} -> mean ${after[0].meanCookTime_s.toFixed(0)}, chosen ${after[0].cookTime_s.toFixed(0)} (${after[0].oddsTenths}/10); `
        + `jammy ${before[1].cookTime_s.toFixed(0)} -> mean ${after[1].meanCookTime_s.toFixed(0)}, chosen ${after[1].cookTime_s.toFixed(0)} (${after[1].oddsTenths}/10)`);
    }
  }
}

export type { DecisionInputs };
