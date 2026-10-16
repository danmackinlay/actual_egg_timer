/**
 * The decision's measurements: what choosing the time costs, how accurate its surface
 * is, what it does before and after the first egg, whether the odds are
 * calibrated, and why "still learning" is a count.
 *
 * Run: npm run decide            (all of it, about nine minutes)
 *      npm run decide -- cost    (one section: cost, accuracy, lean, odds,
 *                                 learning, runny, reach, advice, outcome,
 *                                 nudge, certainty, versus)
 *      npm run decide -- versus  (D against M, about 20 minutes on a pool of
 *                                 worker threads; the thresholds are in its
 *                                 section's header)
 *
 * Read-only. Nothing in src/ is touched. The numbers it prints are the ones in
 * INFERENCE.md section 8 (and DECISIONS.md and UI.md, which cite its
 * sections); the claims they rest
 * on are asserted, more cheaply, in test/decide.test.ts.
 */

import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import {
  CHOICE_SCAN_STEP_S, DECISION_WINDOW_S, type Decision, type DecisionInputs, INV_PHI, LEAN_COST_PER_S, NUDGE_MAX_S,
  REFINE_TOL_S, RUNNY_WHITE_LOSS, chooseCookTime, decide, decideAt, decisionApplies,
  decisionGridRequest, decisionGridSpec, decisionInputs, expectedLoss, oddsInTenths,
} from '../src/core/decide.ts';
import { type DoseGrid, buildDoseGrid, buildRequestedGrid, cookTimeForLogYolkDose } from '../src/core/doseGrid.ts';
import {
  FEEDBACK_BAND, type Particle, type Posterior, type WhiteReport, WHITE_OFFSET_SD, YOLK_WORDS, YOLK_WORD_CUTS, type YolkWord,
  createPrior, yolkWordBands, yolkWordProbit,
  withUnrelated, withUnrelatedWord,
  posteriorMeanOffset, posteriorParams, predictCookTime, updatePosterior, whiteProbit, yolkProbit,
} from '../src/core/infer.ts';
import { ALPHA_DEFAULT, ALPHA_REL_SD } from '../src/core/constants.ts';
import { normalCdf } from '../src/core/sphere.ts';
import { eggFromMass, type Egg } from '../src/core/geometry.ts';
import type { CookSetup } from '../src/core/protocol.ts';
import { type Solution, logYolkTarget } from '../src/core/solve.ts';
import { type LevelOdds, type OddsProfile, answerAt, envelopeBounds, oddsProfile } from '../src/core/reach.ts';
import { predictOutcome } from '../src/core/outcome.ts';
import {
  CERTAINTY_MASS, type CertaintyReading, type WordCertainty, askedWord, certaintyAt, wordCertainty,
} from '../src/core/certainty.ts';
import { cookTimeForLogWhiteDose, lookupLogYolkDose } from '../src/core/doseGrid.ts';
import { UNRELATED } from '../src/core/infer.ts';
import { sliderFromYolkDose } from '../src/core/solve.ts';
import {
  CALIBRATION_ALPHA_HIGH, CALIBRATION_ALPHA_LOW, CALIBRATION_SEED, type Calibration, type EggRecord, PARTICLE_COUNT,
  calibrationDoneness, calibrationParams, freshCalibration, replay,
} from '../src/core/record.ts';
import { appSetup, draw, recordAt, rng } from '../tools/common.ts';

// A `versus` worker thread runs none of the sections: it only takes jobs.
const only = isMainThread ? process.argv[2] ?? 'all' : 'versus-worker';
const run = (name: string): boolean => only === 'all' || only === name;

const REF_EGG = eggFromMass(0.068);
const SETUP = appSetup();

interface Pot { name: string; egg: Egg; setup: CookSetup }
const POTS: Pot[] = [
  { name: '68 g, boiling, ice', egg: REF_EGG, setup: SETUP },
  { name: '68 g, cold start', egg: REF_EGG, setup: appSetup({ startMode: 'cold' }) },
  { name: '68 g, tap', egg: REF_EGG, setup: appSetup({ cooling: 'tap' }) },
  { name: '68 g, counter', egg: REF_EGG, setup: appSetup({ cooling: 'counter' }) },
  { name: '68 g, heat off, 4 L', egg: REF_EGG, setup: appSetup({ afterBoil: 'off', waterLitres: 4 }) },
  { name: '50 g, boiling, ice', egg: eggFromMass(0.05), setup: SETUP },
  { name: '80 g, boiling, ice', egg: eggFromMass(0.08), setup: SETUP },
];

/** The app's idle answer (core `answerAt`), without the odds' range: this
 *  tool measures the mean solve, not the slider's reach. */
function meanSolve(c: Calibration, egg: Egg, setup: CookSetup, level: number): { sol: Solution; level: number } {
  const a = answerAt(c, egg, setup, level, null);
  return { sol: a.solution, level: a.level };
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
  'one egg': replay(PRIOR, [recordAt(0.41, lit464, 'jammy', 'firm')]),
  'three eggs, firmer': replay(PRIOR, [
    recordAt(0.41, lit464, 'soft', 'firm'), recordAt(0.41, lit464 + 15, 'soft', 'firm'),
    recordAt(0.41, lit464 + 30, 'jammy', 'firm'),
  ]),
};

const WHITES: WhiteReport[] = ['runny', 'tender', 'firm'];

/** What a cook `truth` says about an egg cooked for `t`, unrelated share
 *  included: the white, and the yolk in the five words, drawn in that order. */
function truthSays(grid: DoseGrid, truth: Particle, t: number, random: () => number): { white: WhiteReport; word: YolkWord } {
  const white = WHITES[draw(whiteProbit(grid, truth, t).map(withUnrelated), random())];
  const word = YOLK_WORDS[draw(yolkWordProbit(grid, truth, t).map(withUnrelatedWord), random())];
  return { white: white, word: word };
}

/** A cook `p`'s own loss at `t`, through its probit - P(too soft) + P(too
 *  firm) + `runnyLoss` P(runny), the decision's loss read through the truth
 *  rather than the posterior - and whether the egg comes out right: the yolk
 *  just right and the white not runny. No unrelated share: this is the egg,
 *  not what is said about it. */
function trueLossOf(
  grid: DoseGrid, p: Particle, t: number, target: number, runnyLoss = RUNNY_WHITE_LOSS,
): { loss: number; right: number } {
  const y = yolkProbit(grid, p, t, target);
  const w = whiteProbit(grid, p, t);
  return { loss: y[0] + y[2] + runnyLoss * w[0], right: y[1] * (1 - w[0]) };
}

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
    const choose = ms(() => { d = decide(LEARNED['one egg'], g, m.sol, logYolkTarget(m.level)); });
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
      const fine = buildDoseGrid(pot.egg, pot.setup, {
        ...spec, alphaCount: 29, timeCount: Math.round((spec.timeMax_s - spec.timeMin_s) / 4) + 1,
      });
      for (const level of [0.1, 0.22, 0.41, 0.62, 0.85, 1]) {
        const m = meanSolve(c, pot.egg, pot.setup, level);
        const a = decide(c, grid, m.sol, logYolkTarget(m.level));
        const b = decide(c, fine, m.sol, logYolkTarget(m.level));
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
        const t = chooseCookTime(c.posterior, grid, logYolkTarget(m.level), mean);
        const d = decideAt(c.posterior, c.eggsLogged, grid, mean, true, logYolkTarget(m.level));
        row.push(`${m.level}: ${t - mean >= 0 ? '+' : ''}${(t - mean).toFixed(0)} (${d.oddsTenths}/10)`);
      }
      cells.push(`${name}${c.eggsLogged === 0 ? ' [would]' : ''} ${row.join(' ')}`);
    }
    console.log(`${pot.name}:\n  ${cells.join('\n  ')}`);
  }
}

/* ------------------------------------------------------ simulated cooks */

/** Cooks drawn from the prior, each at one level, eggs at the time the app
 *  would choose, answers from the truth's own probit: whether the yolk was
 *  just right, for the hit, and the five words, which are folded. Calls `each`
 *  before every egg is folded. One fixed surface for speed. */
function simulate(
  cooks: number, eggs: number, particles: number, seed: number,
  each: (c: Calibration, d: Decision, hit: boolean, egg: number, grid: DoseGrid, target: number) => void,
): void {
  const grid = buildDoseGrid(REF_EGG, SETUP, { alphaMin: ALPHA_DEFAULT * CALIBRATION_ALPHA_LOW, alphaMax: ALPHA_DEFAULT * CALIBRATION_ALPHA_HIGH, alphaCount: 17, timeMin_s: 200, timeMax_s: 900, timeCount: 71 });
  const random = rng(seed);
  const truths = createPrior(cooks, seed ^ 0x2545f49).particles;
  const levels = [0.22, 0.41, 0.62];
  for (let k = 0; k < cooks; k++) {
    const truth: Particle = truths[k];
    const cal: Calibration = { posterior: createPrior(particles, 1 + Math.floor(random() * 2147483646)), eggsLogged: 0 };
    const level = levels[k % levels.length];
    for (let egg = 0; egg <= eggs; egg++) {
      const m = meanSolve(cal, REF_EGG, SETUP, level);
      const target = logYolkTarget(m.level);
      const d = decide(cal, grid, m.sol, target);
      if (egg === eggs) {
        each(cal, d, false, egg, grid, target);
        break;
      }
      const t = d.cookTime_s;
      const y = draw(yolkProbit(grid, truth, t, target).map(withUnrelated), random());
      const said = truthSays(grid, truth, t, random);
      each(cal, d, y === 1 && said.white !== 'runny', egg, grid, target);
      updatePosterior(cal.posterior, grid, t, said.word, said.white);
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

if (run('nudge')) {
  // The nudge: what +-10 s costs the cook. Cooks drawn from the prior, as for the
  // odds, each egg at the time the app chooses; at every egg the TRUE cook's
  // loss - P(too soft) + P(too firm) + 3 P(runny), the decision's own loss,
  // read through the truth's probit rather than the posterior's - at the
  // chosen time, and averaged over the 21 nudges. And how often the egg comes
  // out right (the yolk just right, the white not runny) either way.
  console.log(`\n== nudge: the true cook's loss at the chosen time, and +-${NUDGE_MAX_S} s about it (300 cooks x 6 eggs, 1000 particles)`);
  const grid = buildDoseGrid(REF_EGG, SETUP, { alphaMin: ALPHA_DEFAULT * CALIBRATION_ALPHA_LOW, alphaMax: ALPHA_DEFAULT * CALIBRATION_ALPHA_HIGH, alphaCount: 17, timeMin_s: 200, timeMax_s: 900, timeCount: 71 });
  const random = rng(20261002);
  const truths = createPrior(300, 20261002 ^ 0x2545f49).particles;
  const levels = [0.22, 0.41, 0.62];
  const lossOf = (p: Particle, t: number, target: number): { loss: number; right: number } => trueLossOf(grid, p, t, target);
  // Each size of nudge, on the same cooks: the cost of a nudge goes with its
  // variance, and so does what it teaches about the slope.
  const SIZES = [3, 5, NUDGE_MAX_S];
  const sums = SIZES.map(() => ({ base: 0, nudged: 0, rightBase: 0, rightNudged: 0, n: 0 }));
  const byEgg: { base: number; nudged: number; rightBase: number; rightNudged: number; n: number }[] = [];
  for (let k = 0; k < truths.length; k++) {
    const truth = truths[k];
    const cal: Calibration = { posterior: createPrior(1000, 1 + Math.floor(random() * 2147483646)), eggsLogged: 0 };
    const level = levels[k % levels.length];
    for (let egg = 0; egg < 6; egg++) {
      const m = meanSolve(cal, REF_EGG, SETUP, level);
      const target = logYolkTarget(m.level);
      const d = decide(cal, grid, m.sol, target);
      const t = d.cookTime_s;
      const base = lossOf(truth, t, target);
      SIZES.forEach((size, i) => {
        let nudged = 0;
        let right = 0;
        for (let s = -size; s <= size; s++) {
          const l = lossOf(truth, t + s, target);
          nudged += l.loss;
          right += l.right;
        }
        nudged /= 2 * size + 1;
        right /= 2 * size + 1;
        const a = sums[i];
        a.base += base.loss; a.nudged += nudged; a.rightBase += base.right; a.rightNudged += right; a.n += 1;
        if (size === NUDGE_MAX_S) {
          byEgg[egg] ??= { base: 0, nudged: 0, rightBase: 0, rightNudged: 0, n: 0 };
          const e = byEgg[egg];
          e.base += base.loss; e.nudged += nudged; e.rightBase += base.right; e.rightNudged += right; e.n += 1;
        }
      });
      const said = truthSays(grid, truth, t, random);
      updatePosterior(cal.posterior, grid, t, said.word, said.white);
      cal.eggsLogged += 1;
    }
  }
  SIZES.forEach((size, i) => {
    const a = sums[i];
    const variance = ((2 * size + 1) ** 2 - 1) / 12;
    console.log(`+-${size} s (variance ${variance.toFixed(1)} s^2): loss ${(a.base / a.n).toFixed(4)} -> ${(a.nudged / a.n).toFixed(4)} `
      + `(+${(100 * (a.nudged - a.base) / a.base).toFixed(1)}%); right ${(100 * a.rightBase / a.n).toFixed(1)}% -> ${(100 * a.rightNudged / a.n).toFixed(1)}%`);
  });
  console.log(`+-${NUDGE_MAX_S} s by egg: ${byEgg.map((e, i) => `${i + 1}: right ${(100 * e.rightBase / e.n).toFixed(1)}% -> ${(100 * e.rightNudged / e.n).toFixed(1)}%`).join('; ')}`);
}

if (run('learning')) {
  console.log('\n== learning: the interval rule, against the count (150 cooks x 8 eggs)');
  // The owner's rule, +-15 s (DECISIONS.md 40). No screen
  // shows it and `Decision` does not carry it, so it is read here, on demand,
  // from `predictCookTime`.
  const STILL_LEARNING_S = 15;
  type Flags = { interval: boolean; band: boolean; count: boolean }[];
  const flags: Flags[] = [];
  let current: Flags = [];
  simulate(150, 8, 1000, 20260930, (c, _d, _hit, egg, grid, target) => {
    if (egg === 0) { current = []; flags.push(current); }
    const interval = predictCookTime(c.posterior, grid, target);
    const half = 0.5 * (interval.high_s - interval.low_s);
    const a = posteriorParams(c.posterior).alpha_m2s;
    const o = posteriorMeanOffset(c.posterior);
    const band = 0.5 * (cookTimeForLogYolkDose(grid, a, target + o + FEEDBACK_BAND)
      - cookTimeForLogYolkDose(grid, a, target + o - FEEDBACK_BAND));
    current.push({ interval: half > STILL_LEARNING_S, band: half > band, count: c.eggsLogged < 4 });
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
  console.log(`(interval is the owner's rule, +-${STILL_LEARNING_S} s; band is +-the width of "just right" at that cook; count is the first four eggs, the fallback)`);
}

/* ---------------------------------------------------------- runny whites */

if (run('runny')) {
  console.log('\n== two runny whites at soft (production surfaces)');
  const grid0 = buildRequestedGrid(decisionGridRequest(decisionInputs(PRIOR, REF_EGG, SETUP)));
  const at = (c: Calibration, g: DoseGrid, level: number): Decision => {
    const m = meanSolve(c, REF_EGG, SETUP, level);
    return decide(c, g, m.sol, logYolkTarget(m.level));
  };
  const before = [at(PRIOR, grid0, 0.22), at(PRIOR, grid0, 0.41)];
  for (const sequence of ['E3', 'E5'] as const) {
    for (const yolk of [null, 'soft'] as (YolkWord | null)[]) {
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
      console.log(`${sequence}, ${yolk === null ? 'white only' : 'yolk soft too'}, cooked at ${log.map((r) => r.recommended_s.toFixed(0)).join(' and ')} s: `
        + `soft ${before[0].cookTime_s.toFixed(0)} -> mean ${after[0].meanCookTime_s.toFixed(0)}, chosen ${after[0].cookTime_s.toFixed(0)} (${after[0].oddsTenths}/10); `
        + `jammy ${before[1].cookTime_s.toFixed(0)} -> mean ${after[1].meanCookTime_s.toFixed(0)}, chosen ${after[1].cookTime_s.toFixed(0)} (${after[1].oddsTenths}/10)`);
    }
  }
}

/* ---------------------------------------------------- odds at every level */

function tenthsAt(profile: OddsProfile, level: number): string {
  let best: LevelOdds | null = null;
  for (const p of profile.points) {
    if (best === null || Math.abs(p.level - level) < Math.abs(best.level - level)) best = p;
  }
  return best === null ? '-' : String(oddsInTenths(best.odds));
}

if (run('reach')) {
  console.log('\n== reach: the odds at every level, what they cost, and the range they allow (node, this machine)');
  const many = replay(PRIOR, [
    recordAt(0.41, lit464, 'jammy', 'firm'), recordAt(0.41, lit464, 'jammy', 'tender'),
    recordAt(0.41, lit464, 'jammy', 'firm'), recordAt(0.62, lit464 + 70, 'fudgy', 'firm'),
    recordAt(0.41, lit464, 'jammy', 'firm'),
  ]);
  const cals: [string, Calibration][] = [...Object.entries(LEARNED), ['five eggs, jammy right', many]];
  for (const pot of POTS) {
    console.log(`${pot.name}:`);
    for (const [name, c] of cals) {
      const inputs = decisionInputs(c, pot.egg, pot.setup);
      let grid: DoseGrid | null = null;
      const build = ms(() => { grid = buildRequestedGrid(decisionGridRequest(inputs)); });
      let profile: OddsProfile | null = null;
      const cost = ms(() => { profile = oddsProfile(c, pot.egg, pot.setup, grid as unknown as DoseGrid); });
      const p = profile as unknown as OddsProfile;
      const range = p.softest === null ? 'physical' : `${p.softest}-${p.hardest}`;
      const cols = [0, 0.22, 0.41, 0.62, 0.8, 1].map((l) => `${l}:${tenthsAt(p, l)}`).join(' ');
      console.log(`  ${name}: ${p.points.length} points in ${cost.toFixed(0)} ms (surface ${build.toFixed(0)} ms); `
        + `physical ${p.physicalSoftest}-${p.physicalHardest}, offered ${range}, best ${oddsInTenths(p.best)}/10; ${cols}`);
    }
  }
}

/* ------------------------------------------------------------- the advice */

if (run('advice')) {
  console.log('\n== advice: what each change of protocol does to the odds, on the model (tenths)');
  const cals: [string, Calibration][] = Object.entries(LEARNED);
  const changes: { name: string; from: Partial<CookSetup>; to: Partial<CookSetup> }[] = [
    { name: 'counter -> ice', from: { cooling: 'counter' }, to: { cooling: 'ice' } },
    { name: 'tap -> ice', from: { cooling: 'tap' }, to: { cooling: 'ice' } },
    { name: 'room egg -> fridge egg', from: { eggStart_C: 20 }, to: { eggStart_C: 4 } },
    { name: 'heat off, 2 L -> 4 L', from: { afterBoil: 'off', waterLitres: 2 }, to: { afterBoil: 'off', waterLitres: 4 } },
  ];
  for (const change of changes) {
    const cells: string[] = [];
    for (const [name, c] of cals) {
      const row: string[] = [];
      for (const which of [change.from, change.to]) {
        const setup = appSetup(which);
        const grid = buildRequestedGrid(decisionGridRequest(decisionInputs(c, REF_EGG, setup)));
        row.push([0.22, 0.41, 0.62, 1].map((level) => {
          const m = meanSolve(c, REF_EGG, setup, level);
          const d = decide(c, grid, m.sol, logYolkTarget(m.level));
          return `${m.level === level ? '' : '*'}${d.oddsTenths}`;
        }).join('/'));
      }
      cells.push(`${name} ${row[0]} -> ${row[1]}`);
    }
    console.log(`${change.name} (soft/jammy/fudgy/hard; * snapped by the white): ${cells.join('; ')}`);
  }
}

/* ------------------------------------------------------------ the outcome */

if (run('outcome')) {
  console.log('\n== outcome: the level range, the answers and the lean against simulated cooks (400 cooks x 6 eggs, 1000 particles)');
  // As test/outcome.test.ts, larger: every egg drawn from the truth - its
  // time-scale's dose plus a draw of its noise - and the yolk answer read off
  // that egg. A second egg at the chosen time +-30 s, not folded, checks the
  // lean where it has something to say: at the chosen time it is nearly
  // always balanced.
  const grid = buildDoseGrid(REF_EGG, SETUP, { alphaMin: ALPHA_DEFAULT * CALIBRATION_ALPHA_LOW, alphaMax: ALPHA_DEFAULT * CALIBRATION_ALPHA_HIGH, alphaCount: 17, timeMin_s: 200, timeMax_s: 900, timeCount: 71 });
  const random = rng(20260927);
  const normal = (): number => Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) * Math.cos(2 * Math.PI * random());
  const eggOf = (truth: Particle, t: number, target: number): { level: number; yolk: number } => {
    const dose = lookupLogYolkDose(grid, truth.alpha_m2s, t) + truth.noise * normal();
    const latent = dose - (target + truth.logDoseOffset);
    const yolk = random() < UNRELATED
      ? Math.min(2, Math.floor(3 * random()))
      : latent < -FEEDBACK_BAND ? 0 : latent > FEEDBACK_BAND ? 2 : 1;
    return { level: sliderFromYolkDose(10 ** dose), yolk: yolk };
  };
  const truths = createPrior(400, 20260927 ^ 0x2545f49).particles;
  const levels = [0.22, 0.41, 0.62];
  const byEgg: { n: number; inside: number; under: number; over: number; width: number }[] = [];
  const BINS = 10;
  const bins = [0, 1, 2, 3].map(() => ({
    p: new Array<number>(BINS).fill(0), o: new Array<number>(BINS).fill(0), n: new Array<number>(BINS).fill(0),
  }));
  const tally = (k: number, p: number, hit: boolean): void => {
    const b = Math.min(BINS - 1, Math.floor(p * BINS));
    bins[k].p[b] += p; bins[k].o[b] += hit ? 1 : 0; bins[k].n[b] += 1;
  };
  const leansAtChoice: Record<string, number> = { soft: 0, firm: 0, balanced: 0 };
  // For the lean: every jittered egg that missed, with its two probabilities.
  const misses: { soft: number; firm: number; wasFirm: boolean }[] = [];
  let decideMs = 0;
  let outcomeMs = 0;
  for (let c = 0; c < truths.length; c++) {
    const truth = truths[c];
    const cal: Calibration = { posterior: createPrior(1000, 1 + Math.floor(random() * 2147483646)), eggsLogged: 0 };
    const level = levels[c % levels.length];
    const target = logYolkTarget(level);
    for (let k = 0; k < 6; k++) {
      const params = calibrationParams(cal);
      const whiteTarget = Math.log10(calibrationDoneness(cal, level).whiteDose_min);
      const mean = Math.max(
        cookTimeForLogYolkDose(grid, params.alpha_m2s, target),
        cookTimeForLogWhiteDose(grid, params.alpha_m2s, whiteTarget),
      );
      let t0 = performance.now();
      const t = decideAt(cal.posterior, cal.eggsLogged, grid, mean, true, target).cookTime_s;
      decideMs += performance.now() - t0;
      t0 = performance.now();
      const o = predictOutcome(cal.posterior, grid, t, target);
      outcomeMs += performance.now() - t0;
      leansAtChoice[o.lean] += 1;
      const e = eggOf(truth, t, target);
      const w = draw(whiteProbit(grid, truth, t).map(withUnrelated), random());
      byEgg[k] ??= { n: 0, inside: 0, under: 0, over: 0, width: 0 };
      const row = byEgg[k];
      row.n += 1;
      row.width += o.levelHigh - o.levelLow;
      if (e.level < o.levelLow) row.under += 1;
      else if (e.level > o.levelHigh) row.over += 1;
      else row.inside += 1;
      tally(0, o.pTooSoft, e.yolk === 0);
      tally(1, o.pJustRight, e.yolk === 1);
      tally(2, o.pTooFirm, e.yolk === 2);
      tally(3, o.pWhiteRunny, w === 0);
      const tj = t + 60 * (random() - 0.5);
      const oj = predictOutcome(cal.posterior, grid, tj, target);
      const ej = eggOf(truth, tj, target);
      if (ej.yolk !== 1) misses.push({ soft: oj.pTooSoft, firm: oj.pTooFirm, wasFirm: ej.yolk === 2 });
      const word = YOLK_WORDS[draw(yolkWordProbit(grid, truth, t).map(withUnrelatedWord), random())];
      updatePosterior(cal.posterior, grid, t, word, WHITES[w]);
      cal.eggsLogged += 1;
    }
  }
  const all = byEgg.reduce((a, r) => ({ n: a.n + r.n, inside: a.inside + r.inside, under: a.under + r.under, over: a.over + r.over, width: a.width + r.width }),
    { n: 0, inside: 0, under: 0, over: 0, width: 0 });
  const pc = (x: number, n: number): string => `${(100 * x / n).toFixed(1)}%`;
  console.log(`inside the range ${pc(all.inside, all.n)}, under ${pc(all.under, all.n)}, over ${pc(all.over, all.n)} of ${all.n} eggs`);
  console.log(`by egg (inside, mean width on the slider): ${byEgg.map((r, i) => `${i}: ${pc(r.inside, r.n)} ${(r.width / r.n).toFixed(3)}`).join('; ')}`);
  const names = ['too soft', 'just right', 'too firm', 'runny'];
  for (let k = 0; k < 4; k++) {
    let ece = 0;
    let total = 0;
    const cells: string[] = [];
    for (let b = 0; b < BINS; b++) {
      if (bins[k].n[b] === 0) continue;
      const p = bins[k].p[b] / bins[k].n[b];
      const ob = bins[k].o[b] / bins[k].n[b];
      cells.push(`${(100 * p).toFixed(0)}->${(100 * ob).toFixed(0)} (${bins[k].n[b]})`);
      ece += Math.abs(bins[k].p[b] - bins[k].o[b]);
      total += bins[k].n[b];
    }
    console.log(`${names[k]}: ECE ${(ece / total).toFixed(4)}; ${cells.join('; ')}`);
  }
  console.log(`lean at the chosen time: ${Object.entries(leansAtChoice).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  // The threshold: for each ratio, how often a lean is stated among the misses
  // and how often the miss went the way it said.
  for (const ratio of [1.0, 1.25, 1.5, 2.0, 3.0]) {
    let stated = 0;
    let right = 0;
    let expected = 0;
    for (const m of misses) {
      const firm = m.firm > ratio * m.soft;
      const soft = m.soft > ratio * m.firm;
      if (!firm && !soft) continue;
      stated += 1;
      right += (firm && m.wasFirm) || (soft && !m.wasFirm) ? 1 : 0;
      expected += Math.max(m.soft, m.firm) / (m.soft + m.firm);
    }
    console.log(`ratio ${ratio}: a lean for ${pc(stated, misses.length)} of ${misses.length} misses 30 s either side; `
      + `the miss went that way ${pc(right, stated)} (predicted ${pc(expected, stated)})`);
  }
  console.log(`cost, mean per egg: a decision ${(decideMs / all.n).toFixed(2)} ms, the outcome ${(outcomeMs / all.n).toFixed(2)} ms`);

  // And on the production surface and particle count, as the apps run it.
  const g = buildRequestedGrid(decisionGridRequest(decisionInputs(PRIOR, REF_EGG, SETUP)));
  for (const name of ['prior', 'one egg'] as const) {
    const cal = LEARNED[name];
    for (const level of [0.22, 0.41, 0.62, 1.0]) {
      const m = meanSolve(cal, REF_EGG, SETUP, level);
      let d: Decision | null = null;
      const dm = ms(() => { for (let i = 0; i < 10; i++) d = decide(cal, g, m.sol, logYolkTarget(m.level)); }) / 10;
      const dd = d as unknown as Decision;
      let o = predictOutcome(cal.posterior, g, dd.cookTime_s, logYolkTarget(m.level));
      const om = ms(() => { for (let i = 0; i < 10; i++) o = predictOutcome(cal.posterior, g, dd.cookTime_s, logYolkTarget(m.level)); }) / 10;
      console.log(`${name}, level ${level}: ${dd.cookTime_s.toFixed(0)} s, ${dd.oddsTenths}/10; soft/right/firm ${o.pTooSoft.toFixed(2)}/${o.pJustRight.toFixed(2)}/${o.pTooFirm.toFixed(2)}, `
        + `runny ${o.pWhiteRunny.toFixed(2)}; level ${o.levelLow.toFixed(2)}-${o.levelHigh.toFixed(2)} (median ${o.levelMedian.toFixed(2)}), ${o.lean}; `
        + `decision ${dm.toFixed(1)} ms, outcome ${om.toFixed(1)} ms`);
    }
  }
}

/* ------------------------------------------------------- how sure, in words */

if (run('certainty')) {
  // DECISIONS.md 93 and 97: the certainty word, the 90% interval in
  // words and the likely time range (src/core/certainty.ts). First what a
  // cook is told at each word on the owner's setup - 58 g from the fridge,
  // into boiling water, an ice bath - on the production surface and particle
  // count, fresh and after eggs answered in words; then whether the words and
  // the time range are calibrated, against simulated cooks answering in words.
  const egg58 = eggFromMass(0.058);
  const word = (k: number): string => YOLK_WORDS[k];
  const describe = (r: CertaintyReading): string => {
    const w = r.words;
    const span = w.from === w.to ? word(w.from) : `${word(w.from)}-${word(w.to)}`;
    return `${w.certainty} (asked ${word(w.asked)} ${w.pAsked.toFixed(2)}, with neighbours ${w.pNear.toFixed(2)}); `
      + `90%: ${span} (${w.pInterval.toFixed(2)}), most likely ${word(w.mostLikely)}; `
      + `time ${r.time.low_s.toFixed(0)}-${r.time.high_s.toFixed(0)} s`;
  };
  console.log('\n== certainty: what a cook is told at each word (58 g, fridge, boiling, ice; 1000 particles)');
  // Eggs answered in words: a 68 g egg at the literature's jammy, called Jammy.
  const jammy = (): EggRecord => recordAt(0.41, lit464, 'jammy', 'firm');
  const cals: [string, Calibration][] = [
    ['fresh install', PRIOR],
    ['one egg called jammy', replay(PRIOR, [jammy()])],
    ['three eggs called jammy', replay(PRIOR, [jammy(), jammy(), jammy()])],
    ['ten eggs called jammy', replay(PRIOR, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(() => jammy()))],
  ];
  for (const [name, c] of cals) {
    // As the apps do it: the answer at the level, its time held by the pot's
    // odds profile (DECISIONS.md 84).
    const grid = buildRequestedGrid(decisionGridRequest(decisionInputs(c, egg58, SETUP)));
    const profile = oddsProfile(c, egg58, SETUP, grid);
    console.log(`${name}:`);
    for (const level of [0, 0.22, 0.41, 0.62, 1.0]) {
      const a = answerAt(c, egg58, SETUP, level, profile);
      const d = decide(c, grid, a.solution, logYolkTarget(a.level), envelopeBounds(profile, a.level));
      const snapped = a.level === level ? '' : ` (snapped to ${a.level})`;
      console.log(`  ${level}${snapped}: ${d.cookTime_s.toFixed(0)} s, ${d.oddsTenths}/10: `
        + `${describe(certaintyAt(c.posterior, grid, d.cookTime_s, a.level))}`);
    }
  }

  const COOKS = 300;
  const EGGS = 8;
  console.log(`\n== certainty: against simulated cooks answering in words (${COOKS} cooks x ${EGGS} eggs, 1000 particles, 58 g)`);
  const grid = buildDoseGrid(egg58, SETUP, { alphaMin: ALPHA_DEFAULT * CALIBRATION_ALPHA_LOW, alphaMax: ALPHA_DEFAULT * CALIBRATION_ALPHA_HIGH, alphaCount: 17, timeMin_s: 150, timeMax_s: 850, timeCount: 71 });
  const random = rng(20261006);
  const truths = createPrior(COOKS, 20261006 ^ 0x2545f49).particles;
  const levels = [0, 0.22, 0.41, 0.62, 1.0];
  interface Row { n: number; very: number; ballpark: number; wild: number; inWords: number; asked: number; pAsked: number; inTime: number; width: number }
  const byEgg: Row[] = [];
  // Of the eggs given each class, how often the word asked came out, and it
  // or a neighbour.
  const byClass: Record<string, { n: number; asked: number; near: number }> = {
    veryCertain: { n: 0, asked: 0, near: 0 }, ballpark: { n: 0, asked: 0, near: 0 }, wildGuess: { n: 0, asked: 0, near: 0 },
  };
  const whites: WhiteReport[] = ['runny', 'tender', 'firm'];
  for (let k = 0; k < truths.length; k++) {
    const truth = truths[k];
    const cal: Calibration = { posterior: createPrior(1000, 1 + Math.floor(random() * 2147483646)), eggsLogged: 0 };
    const level = levels[k % levels.length];
    for (let e = 0; e < EGGS; e++) {
      const m = meanSolve(cal, egg58, SETUP, level);
      const target = logYolkTarget(m.level);
      const t = decide(cal, grid, m.sol, target).cookTime_s;
      const r = certaintyAt(cal.posterior, grid, t, m.level);
      // What the truth says at t, unrelated share included, and its own
      // right time as `predictCookTime` defines a particle's.
      const bands = yolkWordBands(lookupLogYolkDose(grid, truth.alpha_m2s, t) - truth.logDoseOffset, truth.noise);
      const got = draw(bands.map(withUnrelatedWord), random());
      const white = draw(whiteProbit(grid, truth, t).map(withUnrelated), random());
      const right = predictCookTime({ particles: [truth], weights: [1], rng: 1 }, grid, target).median_s;
      byEgg[e] ??= { n: 0, very: 0, ballpark: 0, wild: 0, inWords: 0, asked: 0, pAsked: 0, inTime: 0, width: 0 };
      const row = byEgg[e];
      row.n += 1;
      if (r.words.certainty === 'veryCertain') row.very += 1;
      else if (r.words.certainty === 'ballpark') row.ballpark += 1;
      else row.wild += 1;
      row.inWords += got >= r.words.from && got <= r.words.to ? 1 : 0;
      row.asked += got === r.words.asked ? 1 : 0;
      row.pAsked += r.words.pAsked;
      row.inTime += right >= r.time.low_s && right <= r.time.high_s ? 1 : 0;
      row.width += r.time.high_s - r.time.low_s;
      const cls = byClass[r.words.certainty];
      cls.n += 1;
      cls.asked += got === r.words.asked ? 1 : 0;
      cls.near += Math.abs(got - r.words.asked) <= 1 ? 1 : 0;
      updatePosterior(cal.posterior, grid, t, YOLK_WORDS[got], whites[white]);
      cal.eggsLogged += 1;
    }
  }
  const pc = (x: number, n: number): string => `${(100 * x / n).toFixed(0)}%`;
  console.log('by egg: very certain / ballpark / wild guess; the word inside the 90% interval; '
    + 'the word asked, predicted -> got; the right time inside the range, and its mean width');
  byEgg.forEach((r, i) => {
    console.log(`  ${i}: ${pc(r.very, r.n)} / ${pc(r.ballpark, r.n)} / ${pc(r.wild, r.n)}; in words ${pc(r.inWords, r.n)}; `
      + `asked ${pc(r.pAsked, r.n)} -> ${pc(r.asked, r.n)}; in time ${pc(r.inTime, r.n)}, ${(r.width / r.n).toFixed(0)} s`);
  });
  for (const [name, c] of Object.entries(byClass)) {
    if (c.n === 0) continue;
    console.log(`  ${name}: ${c.n} eggs; the word asked ${pc(c.asked, c.n)}, it or a neighbour ${pc(c.near, c.n)} `
      + `(the class promises ${CERTAINTY_MASS * 100}% of one or the other)`);
  }
}

/* ---------------------------------------------- versus: D against M */

/*
 * Does the decision layer pay its way? The Bayes action D
 * (`decide(...).cookTime_s`) against the plug-in rule M (`meanSolve(...)
 * .sol.result.cookTime_s`), in eggs right per 100 cooks: an egg is right when
 * the yolk is just right and the white is set, P(right) = P(yolk just right)
 * (1 - P(runny)) through the truth's own probit. Before the first egg both
 * cook the literature's time, as the app does.
 *
 * THE THRESHOLDS, decided before anything ran and not changed since:
 *
 *   CUT           All three hold: in test 1, D's advantage is under 1 egg
 *                 right per 100 cooks at every egg index from 1 up, in every
 *                 pot and level; in test 2, no regime has D's advantage above
 *                 2 per 100; in test 5, the words agree at least 95% of the
 *                 time.
 *   KEEP          In test 1 or test 2, D's advantage is 3 or more per 100 in
 *                 any pot and level a cook actually uses: soft, jammy or
 *                 fudgy, with ice, tap or counter cooling.
 *   OWNER'S CALL  Anything in between.
 *
 * How they are read, also fixed before the run:
 *  - "D's advantage" is the mean over cooks of P(right | t_D) - P(right | t_M),
 *    x100, a point estimate; its 95% interval is printed beside it, and a
 *    verdict whose interval straddles its threshold is said to.
 *  - Test 1's CUT condition is read per pot, level and egg index 1-6.
 *  - "In any pot and level" (KEEP) and "no regime" (CUT, test 2) are read per
 *    pot and level, as the mean over eggs 1-6, the eggs on which D can
 *    differ from M; per-egg figures are printed too.
 *  - Every pot here uses ice, tap or counter cooling, and every level is
 *    soft (0.22), jammy (0.41) or fudgy (0.62), so every cell counts for KEEP.
 *  - Test 5's "the words agree" is the certainty class AND the 90% interval
 *    in words both the same, over the simulated cooks' states at every egg
 *    0-6 in every pot and level; the class alone and lean's grid are printed
 *    too.
 *
 * The design (set after a timing pilot, before the run):
 *  - Test 0 is lean's grid, on the production surfaces, in this thread.
 *  - Tests 1, 2, 3 and 5 are simulated cooks, in a pool of worker threads.
 *    Each pot has one wide surface (25 rows, 0.4-2.5 of the literature's
 *    time-scale, 10 s), built here and handed to every worker; the filter,
 *    the choice and the scoring all read it, as `simulate` does its one.
 *    `simulate` itself is one policy in one pot, so the duel is its loop
 *    twice: the same truth, the same particles' seed and the same stream of
 *    answer draws (two per egg, `truthSays`), each policy folding its own
 *    eggs.
 *  - The truths of a pot and level are the same in every regime and loss,
 *    so the regimes differ only by what they change.
 *  - Each policy's egg is scored against the level its own mean solve left
 *    (a snap by the white can differ between them); how often it does is
 *    printed.
 *  - Test 3's choice at a loss other than 3 is `chooseWithLoss`, a copy of
 *    `chooseCookTime` with the loss's weight as an argument (src/ is read
 *    only), checked against it at 3 to the bit before it is used.
 *  - Test 5's "spread" source, the obvious mapping: the time on screen is
 *    the mean solve's (no decision, so no lean); `predictCookTime`'s median
 *    m and its 80% interval as an sd, s_T = (p90 - p10) / 2.563; the likely
 *    time range m -+ 1.645 s_T; and the five words from one Gaussian in log
 *    yolk dose, centred at the level's target + k (t - m), with k the
 *    surface's slope d log10(dose) / dt at the posterior mean time-scale and
 *    sd sqrt((k s_T)^2 + E[noise^2]), cut at YOLK_WORD_CUTS, the unrelated
 *    share mixed in, then `wordCertainty` as the app reads it. "The grid" is
 *    `certaintyAt` at the time the app shows today (the decision's). The
 *    verdict reads the grid at the decided time against the spread at the
 *    mean solve's; the grid at the mean solve's is printed beside it, so the
 *    mapping and the time can be told apart.
 *  - How many cooks: 400 per pot and level for test 1 (7200), 40 for each
 *    regime of test 2 and 30 for each other loss of test 3, all the 20
 *    minutes allow. A pilot at a twentieth of the scale (`versus 0.05`) put
 *    the sd of one cook's D - M at about 16 per 100 over eggs 1-6 and 24 at
 *    one egg: once the two policies' eggs differ, their answers and so their
 *    posteriors part, and common random numbers no longer pair them. The
 *    full duel's intervals are therefore wider than half an egg per 100;
 *    beside it is printed the ONE STEP - on D's own posterior, at every
 *    egg, P(right) at D's time against at M's - which pairs exactly and
 *    is the choice's effect without the learning's. Runny whites per 100
 *    are printed too: the loss trades them for yolks, and P(right) does not
 *    weigh them as the loss does.
 */

/** The pots the duel cooks in: lean's, less the heat off. */
const VS_POTS: Pot[] = [POTS[0], POTS[2], POTS[3], POTS[1], POTS[5], POTS[6]];
const VS_LEVELS = [0.22, 0.41, 0.62];
/** Eggs 0 to 6. */
const VS_EGGS = 7;
const Z95 = 1.959963984540054;
/** Cooks per pot and level: test 1; each regime of test 2; each other loss of
 *  test 3. Scaled by `npm run decide -- versus <scale>` for a pilot. */
const VS_SCALE = Number(process.argv[3] ?? '1');
const VS_COOKS = { model: Math.round(400 * VS_SCALE), regime: Math.round(40 * VS_SCALE), loss: Math.round(30 * VS_SCALE) };
const VS_CHUNK = 25;

type RegimeName = 'model' | 'wide' | 'wideFast' | 'whiteLate' | 'whiteEarly' | 'noisy';
interface Regime { name: RegimeName; what: string; truth: (p: Particle) => Particle; answerNoise: number }
const LOG_ALPHA_MEDIAN = Math.log(ALPHA_DEFAULT);
/** A truth's time-scale moved `sds` prior sds and its spread about the median
 *  made `spread` times the prior's. */
const alphaMoved = (p: Particle, spread: number, sds: number): Particle => ({
  ...p, alpha_m2s: Math.exp(LOG_ALPHA_MEDIAN + ALPHA_REL_SD * sds + spread * (Math.log(p.alpha_m2s) - LOG_ALPHA_MEDIAN)),
});
const REGIMES: Regime[] = [
  { name: 'model', what: 'the truths drawn from the prior', truth: (p) => p, answerNoise: 1 },
  { name: 'wide', what: '(a) time-scale spread 2x the prior sd', truth: (p) => alphaMoved(p, 2, 0), answerNoise: 1 },
  { name: 'wideFast', what: '(b) the same, +1 prior sd (eggs that cook faster)', truth: (p) => alphaMoved(p, 2, 1), answerNoise: 1 },
  { name: 'whiteLate', what: '(c+) white offset +1 prior sd (sets later: the runny tail)', truth: (p) => ({ ...p, whiteOffset: p.whiteOffset + WHITE_OFFSET_SD }), answerNoise: 1 },
  { name: 'whiteEarly', what: '(c-) white offset -1 prior sd (sets sooner)', truth: (p) => ({ ...p, whiteOffset: p.whiteOffset - WHITE_OFFSET_SD }), answerNoise: 1 },
  { name: 'noisy', what: '(d) answers through twice the noise (scored on the egg)', truth: (p) => p, answerNoise: 2 },
];

/** The expected loss with `runnyLoss` for the 3: `expectedLoss`, to the bit
 *  at 3. */
function expectedLossWith(post: Posterior, grid: DoseGrid, t: number, target: number, runnyLoss: number): number {
  let loss = 0.0;
  let total = 0.0;
  for (let i = 0; i < post.particles.length; i++) {
    const w = post.weights[i];
    if (w === 0.0) continue;
    const p = post.particles[i];
    const yolk = yolkProbit(grid, p, t, target);
    const white = whiteProbit(grid, p, t);
    loss += w * (yolk[0] + yolk[2] + runnyLoss * white[0]);
    total += w;
  }
  return total > 0.0 ? loss / total : 0.0;
}

/** `chooseCookTime` with the runny white's weight as an argument: the same
 *  scan, the same golden section, the same lean cost. */
function chooseWithLoss(post: Posterior, grid: DoseGrid, target: number, around_s: number, runnyLoss: number): number {
  const gridHi = grid.timeMin_s + grid.timeStep_s * (grid.timeCount - 1);
  const lo = Math.max(grid.timeMin_s, around_s - DECISION_WINDOW_S);
  const hi = Math.min(gridHi, around_s + DECISION_WINDOW_S);
  if (!(hi > lo)) return around_s;
  const f = (t: number): number => expectedLossWith(post, grid, t, target, runnyLoss) + LEAN_COST_PER_S * Math.abs(t - around_s);
  const steps = Math.ceil((hi - lo) / CHOICE_SCAN_STEP_S);
  const step = (hi - lo) / steps;
  let best = 0;
  let bestValue = Number.POSITIVE_INFINITY;
  for (let k = 0; k <= steps; k++) {
    const v = f(lo + step * k);
    if (v < bestValue) { bestValue = v; best = k; }
  }
  let a = lo + step * (best > 0 ? best - 1 : 0);
  let b = lo + step * (best < steps ? best + 1 : steps);
  let c = b - INV_PHI * (b - a);
  let d = a + INV_PHI * (b - a);
  let fc = f(c);
  let fd = f(d);
  while (b - a > REFINE_TOL_S) {
    if (fc <= fd) { b = d; d = c; fd = fc; c = b - INV_PHI * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + INV_PHI * (b - a); fd = f(d); }
  }
  const mid = 0.5 * (a + b);
  return f(mid) <= bestValue ? mid : lo + step * best;
}

/** The posterior's P(right) at `t`: each particle's P(yolk just right)
 *  (1 - P(runny)), no unrelated share. */
function posteriorRight(post: Posterior, grid: DoseGrid, t: number, target: number): number {
  let s = 0.0;
  let total = 0.0;
  for (let i = 0; i < post.particles.length; i++) {
    s += post.weights[i] * trueLossOf(grid, post.particles[i], t, target).right;
    total += post.weights[i];
  }
  return s / total;
}

/** Test 5's "spread" source: the words and the likely time range from
 *  `predictCookTime`'s spread alone, at `t` (see the header). */
function spreadCertainty(post: Posterior, grid: DoseGrid, t: number, level: number): { words: WordCertainty; low_s: number; high_s: number } {
  const target = logYolkTarget(level);
  const q = predictCookTime(post, grid, target);
  const sdT = (q.high_s - q.low_s) / (2 * 1.2815515655446004);
  const a = posteriorParams(post).alpha_m2s;
  const slope = (lookupLogYolkDose(grid, a, t + 5) - lookupLogYolkDose(grid, a, t - 5)) / 10;
  let n2 = 0.0;
  let total = 0.0;
  for (let i = 0; i < post.particles.length; i++) {
    n2 += post.weights[i] * post.particles[i].noise ** 2;
    total += post.weights[i];
  }
  const mu = target + slope * (t - q.median_s);
  const sd = Math.sqrt((slope * sdT) ** 2 + n2 / total);
  const p: number[] = [];
  let below = 0.0;
  for (let k = 0; k < 4; k++) {
    const upTo = normalCdf((YOLK_WORD_CUTS[k] - mu) / sd);
    p.push(withUnrelatedWord(upTo - below));
    below = upTo;
  }
  p.push(withUnrelatedWord(1 - below));
  return { words: wordCertainty(p, askedWord(level)), low_s: q.median_s - 1.6448536269514722 * sdT, high_s: q.median_s + 1.6448536269514722 * sdT };
}

/** The duel's surface for a pot: wide enough for every truth the regimes
 *  draw and every time either policy picks. */
function versusGrid(pot: Pot): DoseGrid {
  const spec = decisionGridSpec(decisionInputs(PRIOR, pot.egg, pot.setup));
  const lo = Math.max(20, spec.timeMin_s - 150);
  const count = Math.round((spec.timeMax_s + 250 - lo) / 10) + 1;
  return buildDoseGrid(pot.egg, pot.setup, {
    alphaMin: ALPHA_DEFAULT * 0.4, alphaMax: ALPHA_DEFAULT * 2.5, alphaCount: 25, timeMin_s: lo, timeMax_s: lo + 10 * (count - 1), timeCount: count,
  });
}

interface VsJob {
  test: 'model' | 'regime' | 'loss';
  regime: RegimeName;
  runnyLoss: number;
  pot: number;
  level: number;
  /** Cooks `from` to `to` - 1 of the cell's `cooks`. */
  from: number;
  to: number;
  cooks: number;
  /** Whether to read test 5's words on D's eggs. */
  words: boolean;
}

/** One cook's eggs, 0 to 6, under each policy. */
interface VsCook {
  tD: number[]; tM: number[];
  /** P(right), the loss and P(runny) under the truth, at each policy's time. */
  rD: number[]; rM: number[]; lD: number[]; lM: number[]; wD: number[]; wM: number[];
  /** P(right) at the mean solve's time on D's own posterior: the same state,
   *  the other time, so D's choice is seen without the paths parting. */
  rDm: number[];
  snapDiffers: number; offGrid: number;
}

/** Test 5's tally, for one job. */
interface VsWords {
  n: number[]; cls: number[]; interval: number[]; both: number[]; bothAtM: number[]; clsAtM: number[];
  dLow: number[]; dHigh: number[]; widthGrid: number[]; widthSpread: number[];
}

interface VsResult { job: VsJob; cooks: VsCook[]; words: VsWords | null; ms: number }

/** The seed of a cell's truths, and of one of its cooks. */
const cellSeed = (job: VsJob): number => 20261017 + 7919 * job.pot + 104729 * VS_LEVELS.indexOf(job.level);
const cookSeed = (job: VsJob, k: number): number => ((cellSeed(job) * 2654435761) ^ (k * 40503 + 1)) | 0 || 1;

function runVersusJob(job: VsJob, grids: DoseGrid[]): VsResult {
  const t0 = performance.now();
  const pot = VS_POTS[job.pot];
  const grid = grids[job.pot];
  const gridHi = grid.timeMin_s + grid.timeStep_s * (grid.timeCount - 1);
  const regime = REGIMES.find((r) => r.name === job.regime) as Regime;
  const truths = createPrior(job.cooks, cellSeed(job) ^ 0x2545f49).particles;
  const cooks: VsCook[] = [];
  const words: VsWords | null = job.words ? {
    n: new Array<number>(VS_EGGS).fill(0), cls: new Array<number>(VS_EGGS).fill(0), interval: new Array<number>(VS_EGGS).fill(0),
    both: new Array<number>(VS_EGGS).fill(0), bothAtM: new Array<number>(VS_EGGS).fill(0), clsAtM: new Array<number>(VS_EGGS).fill(0),
    dLow: [], dHigh: [], widthGrid: [], widthSpread: [],
  } : null;
  for (let k = job.from; k < job.to; k++) {
    const truth = regime.truth(truths[k]);
    const answerer: Particle = { ...truth, noise: truth.noise * regime.answerNoise };
    const seed = cookSeed(job, k);
    const postSeed = 1 + Math.floor(rng(seed)() * 2147483646);
    const cook: VsCook = { tD: [], tM: [], rD: [], rM: [], lD: [], lM: [], wD: [], wM: [], rDm: [], snapDiffers: 0, offGrid: 0 };
    const levels: number[][] = [[], []];
    for (const policy of ['D', 'M'] as const) {
      const random = rng(seed ^ 0x5bd1e995);
      const cal: Calibration = { posterior: createPrior(PARTICLE_COUNT, postSeed), eggsLogged: 0 };
      for (let egg = 0; egg < VS_EGGS; egg++) {
        const m = meanSolve(cal, pot.egg, pot.setup, job.level);
        const target = logYolkTarget(m.level);
        const mean = m.sol.result.cookTime_s;
        let t = mean;
        if (policy === 'D') {
          t = job.runnyLoss === RUNNY_WHITE_LOSS
            ? decide(cal, grid, m.sol, target).cookTime_s
            : decisionApplies(m.sol) && cal.eggsLogged > 0 ? chooseWithLoss(cal.posterior, grid, target, mean, job.runnyLoss) : mean;
        }
        if (t < grid.timeMin_s || t > gridHi) cook.offGrid += 1;
        const s = trueLossOf(grid, truth, t, target, job.runnyLoss);
        (policy === 'D' ? cook.tD : cook.tM).push(t);
        (policy === 'D' ? cook.rD : cook.rM).push(s.right);
        (policy === 'D' ? cook.lD : cook.lM).push(s.loss);
        (policy === 'D' ? cook.wD : cook.wM).push(whiteProbit(grid, truth, t)[0]);
        if (policy === 'D') cook.rDm.push(trueLossOf(grid, truth, mean, target).right);
        levels[policy === 'D' ? 0 : 1].push(m.level);
        if (policy === 'D' && words !== null) {
          const g = certaintyAt(cal.posterior, grid, t, m.level);
          const gm = certaintyAt(cal.posterior, grid, mean, m.level);
          const sp = spreadCertainty(cal.posterior, grid, mean, m.level);
          const sameInterval = (w: WordCertainty): boolean => w.from === sp.words.from && w.to === sp.words.to;
          words.n[egg] += 1;
          words.cls[egg] += g.words.certainty === sp.words.certainty ? 1 : 0;
          words.interval[egg] += sameInterval(g.words) ? 1 : 0;
          words.both[egg] += g.words.certainty === sp.words.certainty && sameInterval(g.words) ? 1 : 0;
          words.clsAtM[egg] += gm.words.certainty === sp.words.certainty ? 1 : 0;
          words.bothAtM[egg] += gm.words.certainty === sp.words.certainty && sameInterval(gm.words) ? 1 : 0;
          words.dLow.push(sp.low_s - g.time.low_s);
          words.dHigh.push(sp.high_s - g.time.high_s);
          words.widthGrid.push(g.time.high_s - g.time.low_s);
          words.widthSpread.push(sp.high_s - sp.low_s);
        }
        const said = truthSays(grid, answerer, t, random);
        updatePosterior(cal.posterior, grid, t, said.word, said.white);
        cal.eggsLogged += 1;
      }
    }
    for (let e = 0; e < VS_EGGS; e++) cook.snapDiffers += levels[0][e] === levels[1][e] ? 0 : 1;
    cooks.push(cook);
  }
  return { job: job, cooks: cooks, words: words, ms: performance.now() - t0 };
}

if (!isMainThread && parentPort !== null && (workerData as { versus?: boolean } | null)?.versus === true) {
  const port = parentPort;
  const grids = (workerData as { grids: DoseGrid[] }).grids;
  port.on('message', (job: VsJob) => port.postMessage(runVersusJob(job, grids)));
}

/** Every job, through a pool of worker threads, the longest first. */
function versusPool(jobs: VsJob[], grids: DoseGrid[], workers: number): Promise<VsResult[]> {
  return new Promise((resolve, reject) => {
    const results: VsResult[] = [];
    let next = 0;
    let done = 0;
    const pool: Worker[] = [];
    const feed = (w: Worker): void => {
      if (next < jobs.length) w.postMessage(jobs[next++]);
    };
    for (let i = 0; i < Math.min(workers, jobs.length); i++) {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { versus: true, grids: grids } });
      w.on('message', (r: VsResult) => {
        results.push(r);
        done += 1;
        if (done % 20 === 0 || done === jobs.length) process.stderr.write(`  versus: ${done}/${jobs.length} jobs\n`);
        if (done === jobs.length) {
          for (const p of pool) void p.terminate();
          resolve(results);
        } else {
          feed(w);
        }
      });
      w.on('error', reject);
      pool.push(w);
      feed(w);
    }
  });
}

/** Mean and 95% half-width. */
function meanCi(xs: number[]): { mean: number; half: number; n: number } {
  const n = xs.length;
  let s = 0;
  for (const x of xs) s += x;
  const mean = s / n;
  let v = 0;
  for (const x of xs) v += (x - mean) ** 2;
  return { mean: mean, half: n > 1 ? Z95 * Math.sqrt(v / (n - 1) / n) : Number.NaN, n: n };
}
/** Per 100, with its interval. */
const per100 = (xs: number[]): string => {
  const c = meanCi(xs);
  return `${c.mean >= 0 ? '+' : ''}${(100 * c.mean).toFixed(2)} [${(100 * (c.mean - c.half)).toFixed(2)}, ${(100 * (c.mean + c.half)).toFixed(2)}]`;
};
const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
/** A cook's D - M over eggs 1-6. */
const laterEggs = (c: VsCook, f: (c: VsCook, e: number) => number): number => {
  let s = 0;
  for (let e = 1; e < VS_EGGS; e++) s += f(c, e);
  return s / (VS_EGGS - 1);
};
const advantage = (c: VsCook, e: number): number => c.rD[e] - c.rM[e];
const lossGain = (c: VsCook, e: number): number => c.lM[e] - c.lD[e];
const leanOf = (c: VsCook, e: number): number => c.tD[e] - c.tM[e];
const oneStep = (c: VsCook, e: number): number => c.rD[e] - c.rDm[e];
const runnyDiff = (c: VsCook, e: number): number => c.wD[e] - c.wM[e];

/** The tables for one set of cells: by egg, by level, by pot, and each cell. */
function versusTables(results: VsResult[], title: string): { maxCellEgg: number; maxCellEggAt: string; maxCell: number; maxCellAt: string; minCell: number; minCellAt: string } {
  const all = results.flatMap((r) => r.cooks);
  console.log(`\n-- ${title}: ${all.length} cooks; D - M in eggs right per 100 cooks [95%]`);
  console.log('by egg: D right%, M right%, D - M; one step on D\'s posterior, D - M; runny whites per 100, D - M; loss M - D (x100); lean t_D - t_M mean (mean |lean|) s');
  for (let e = 0; e < VS_EGGS; e++) {
    console.log(`  ${e}: ${(100 * avg(all.map((c) => c.rD[e]))).toFixed(1)}%, ${(100 * avg(all.map((c) => c.rM[e]))).toFixed(1)}%, `
      + `${per100(all.map((c) => advantage(c, e)))}; ${per100(all.map((c) => oneStep(c, e)))}; ${per100(all.map((c) => runnyDiff(c, e)))}; `
      + `${per100(all.map((c) => lossGain(c, e)))}; ${avg(all.map((c) => leanOf(c, e))).toFixed(1)} (${avg(all.map((c) => Math.abs(leanOf(c, e)))).toFixed(1)})`);
  }
  const by = (label: string, keyOf: (j: VsJob) => string): void => {
    const keys = [...new Set(results.map((r) => keyOf(r.job)))];
    console.log(`by ${label}, eggs 1-6: D - M; one step; runny per 100, D - M; loss M - D (x100); mean lean s`);
    for (const k of keys) {
      const cs = results.filter((r) => keyOf(r.job) === k).flatMap((r) => r.cooks);
      console.log(`  ${k}: ${per100(cs.map((c) => laterEggs(c, advantage)))}; ${per100(cs.map((c) => laterEggs(c, oneStep)))}; `
        + `${per100(cs.map((c) => laterEggs(c, runnyDiff)))}; ${per100(cs.map((c) => laterEggs(c, lossGain)))}; ${avg(cs.map((c) => laterEggs(c, leanOf))).toFixed(1)}`);
    }
  };
  by('level', (j) => String(j.level));
  by('pot', (j) => VS_POTS[j.pot].name);
  console.log('each pot and level, eggs 1-6: D - M; one step; the egg where D - M is largest, and its value; mean lean s; eggs on another level than M\'s; eggs off the surface');
  let maxCellEgg = -Infinity;
  let maxCellEggAt = '';
  let maxCell = -Infinity;
  let maxCellAt = '';
  let minCell = Infinity;
  let minCellAt = '';
  for (let p = 0; p < VS_POTS.length; p++) {
    for (const level of VS_LEVELS) {
      const cs = results.filter((r) => r.job.pot === p && r.job.level === level).flatMap((r) => r.cooks);
      if (cs.length === 0) continue;
      const cell = meanCi(cs.map((c) => laterEggs(c, advantage)));
      let bestE = 1;
      let bestV = -Infinity;
      for (let e = 1; e < VS_EGGS; e++) {
        const v = avg(cs.map((c) => advantage(c, e)));
        if (v > bestV) { bestV = v; bestE = e; }
      }
      const where = `${VS_POTS[p].name}, ${level}`;
      if (bestV > maxCellEgg) { maxCellEgg = bestV; maxCellEggAt = `${where}, egg ${bestE} ${per100(cs.map((c) => advantage(c, bestE)))}`; }
      if (cell.mean > maxCell) { maxCell = cell.mean; maxCellAt = `${where} ${per100(cs.map((c) => laterEggs(c, advantage)))}`; }
      if (cell.mean < minCell) { minCell = cell.mean; minCellAt = `${where} ${per100(cs.map((c) => laterEggs(c, advantage)))}`; }
      console.log(`  ${where}: ${per100(cs.map((c) => laterEggs(c, advantage)))}; ${per100(cs.map((c) => laterEggs(c, oneStep)))}; egg ${bestE} ${per100(cs.map((c) => advantage(c, bestE)))}; `
        + `${avg(cs.map((c) => laterEggs(c, leanOf))).toFixed(1)} s; ${cs.reduce((a, c) => a + c.snapDiffers, 0)}; ${cs.reduce((a, c) => a + c.offGrid, 0)}`);
    }
  }
  console.log(`largest cell (eggs 1-6): ${maxCellAt}; smallest: ${minCellAt}; largest at one egg: ${maxCellEggAt}`);
  return { maxCellEgg: maxCellEgg, maxCellEggAt: maxCellEggAt, maxCell: maxCell, maxCellAt: maxCellAt, minCell: minCell, minCellAt: minCellAt };
}

if (run('versus')) {
  const started = performance.now();
  console.log(`\n== versus: the Bayes action D against the plug-in rule M (${PARTICLE_COUNT} particles)`);

  /* Test 0, and test 5 and test 3's lean on lean's grid: production surfaces. */
  let t0 = performance.now();
  console.log('\n-- test 0: what the posterior believes M costs, on lean\'s grid (production surfaces)');
  console.log('   per level: lean t_D - t_M s; E_post[L(t_M)] - E_post[L(t_D)] x100; E_post[P(right) at t_D] - at t_M x100 (prior: what D WOULD choose)');
  let maxRegret = 0;
  let wordsN = 0;
  let wordsBoth = 0;
  let wordsCls = 0;
  const leanByLoss: Record<number, number[]> = { 1: [], 3: [], 10: [] };
  // The check that chooseWithLoss is chooseCookTime at 3.
  let checked = 0;
  let mismatched = 0;
  const words5: string[] = [];
  for (const pot of POTS) {
    console.log(`${pot.name}:`);
    for (const [name, c] of Object.entries(LEARNED)) {
      const grid = buildRequestedGrid(decisionGridRequest(decisionInputs(c, pot.egg, pot.setup)));
      const row: string[] = [];
      for (const level of [0.22, 0.41, 0.62, 1.0]) {
        const m = meanSolve(c, pot.egg, pot.setup, level);
        const target = logYolkTarget(m.level);
        const tM = m.sol.result.cookTime_s;
        const tD = chooseCookTime(c.posterior, grid, target, tM);
        const regret = expectedLoss(c.posterior, grid, tM, target) - expectedLoss(c.posterior, grid, tD, target);
        const right = posteriorRight(c.posterior, grid, tD, target) - posteriorRight(c.posterior, grid, tM, target);
        if (c.eggsLogged > 0) maxRegret = Math.max(maxRegret, regret);
        row.push(`${m.level}: ${tD - tM >= 0 ? '+' : ''}${(tD - tM).toFixed(0)} s ${(100 * regret).toFixed(2)} ${right >= 0 ? '+' : ''}${(100 * right).toFixed(2)}`);
        // Test 3's lean, at one and three eggs, where the app chooses.
        if (c.eggsLogged > 0 && decisionApplies(m.sol)) {
          for (const W of [1, 3, 10]) leanByLoss[W].push(chooseWithLoss(c.posterior, grid, target, tM, W) - tM);
          checked += 1;
          if (chooseWithLoss(c.posterior, grid, target, tM, RUNNY_WHITE_LOSS) !== tD) mismatched += 1;
        }
        // Test 5 on lean's grid: the words as the app reads them today, at
        // the decision's time, against the spread's at the mean solve's.
        const d = decide(c, grid, m.sol, target);
        const g = certaintyAt(c.posterior, grid, d.cookTime_s, m.level);
        const sp = spreadCertainty(c.posterior, grid, tM, m.level);
        const same = g.words.certainty === sp.words.certainty && g.words.from === sp.words.from && g.words.to === sp.words.to;
        wordsN += 1;
        wordsBoth += same ? 1 : 0;
        wordsCls += g.words.certainty === sp.words.certainty ? 1 : 0;
        words5.push(`${pot.name}, ${name}, ${m.level}: grid ${g.words.certainty} ${YOLK_WORDS[g.words.from]}-${YOLK_WORDS[g.words.to]} `
          + `${g.time.low_s.toFixed(0)}-${g.time.high_s.toFixed(0)} s | spread ${sp.words.certainty} ${YOLK_WORDS[sp.words.from]}-${YOLK_WORDS[sp.words.to]} `
          + `${sp.low_s.toFixed(0)}-${sp.high_s.toFixed(0)} s${same ? '' : '  <- differ'}`);
      }
      console.log(`  ${name}${c.eggsLogged === 0 ? ' [would]' : ''}: ${row.join('; ')}`);
    }
  }
  console.log(`largest regret after an egg: ${(100 * maxRegret).toFixed(2)} per 100 (of loss)`);
  console.log(`chooseWithLoss at 3 against chooseCookTime: ${checked - mismatched} of ${checked} to the bit`);
  if (mismatched > 0) throw new Error('chooseWithLoss is not chooseCookTime at 3');
  console.log('\n-- test 3 on lean\'s grid (one egg, three eggs firmer; every pot and level where the app chooses): lean t_D - t_M s at each loss');
  for (const W of [1, 3, 10]) {
    const xs = leanByLoss[W];
    console.log(`  runny white x${W}: mean ${avg(xs).toFixed(1)}, range ${Math.min(...xs).toFixed(1)} to ${Math.max(...xs).toFixed(1)}`);
  }
  console.log(`\n-- test 5 on lean's grid: class and 90% interval the same in ${wordsBoth} of ${wordsN} (class alone ${wordsCls})`);
  for (const w of words5) console.log(`  ${w}`);
  console.log(`(test 0, test 3's and test 5's grids: ${((performance.now() - t0) / 1000).toFixed(0)} s)`);

  /* Tests 1, 2, 3 and 5: the duel. */
  t0 = performance.now();
  const grids = VS_POTS.map(versusGrid);
  console.log(`\n(the duel's surfaces: ${((performance.now() - t0) / 1000).toFixed(0)} s)`);
  const jobs: VsJob[] = [];
  const add = (test: VsJob['test'], regime: RegimeName, runnyLoss: number, cooks: number, words: boolean): void => {
    for (let p = 0; p < VS_POTS.length; p++) {
      for (const level of VS_LEVELS) {
        for (let from = 0; from < cooks; from += VS_CHUNK) {
          jobs.push({ test: test, regime: regime, runnyLoss: runnyLoss, pot: p, level: level, from: from, to: Math.min(cooks, from + VS_CHUNK), cooks: cooks, words: words });
        }
      }
    }
  };
  add('model', 'model', RUNNY_WHITE_LOSS, VS_COOKS.model, true);
  for (const r of REGIMES) if (r.name !== 'model') add('regime', r.name, RUNNY_WHITE_LOSS, VS_COOKS.regime, false);
  for (const W of [1, 10]) add('loss', 'model', W, VS_COOKS.loss, false);
  // The counter's mean solve is twice the others': its jobs first.
  jobs.sort((a, b) => (VS_POTS[b.pot].setup.cooling === 'counter' ? 1 : 0) - (VS_POTS[a.pot].setup.cooling === 'counter' ? 1 : 0));
  const workers = Math.max(1, Math.min(14, availableParallelism() - 2));
  t0 = performance.now();
  const results = await versusPool(jobs, grids, workers);
  const wall = (performance.now() - t0) / 1000;
  const cpu = (test: VsJob['test']): string => `${(results.filter((r) => r.job.test === test).reduce((a, r) => a + r.ms, 0) / 1000).toFixed(0)} s`;
  console.log(`(the duel: ${jobs.length} jobs on ${workers} workers in ${wall.toFixed(0)} s; worker time: test 1 and 5 ${cpu('model')}, test 2 ${cpu('regime')}, test 3 ${cpu('loss')})`);

  const model = results.filter((r) => r.job.test === 'model');
  const t1 = versusTables(model, `test 1: the model correct (${VS_COOKS.model} cooks per pot and level)`);
  const t2: Record<string, ReturnType<typeof versusTables>> = {};
  for (const r of REGIMES) {
    if (r.name === 'model') continue;
    t2[r.name] = versusTables(results.filter((x) => x.job.test === 'regime' && x.job.regime === r.name), `test 2 ${r.what} (${VS_COOKS.regime} cooks per pot and level)`);
  }
  for (const W of [1, 10]) {
    versusTables(results.filter((x) => x.job.test === 'loss' && x.job.runnyLoss === W), `test 3: a runny white costs ${W} (${VS_COOKS.loss} cooks per pot and level)`);
  }

  // Test 5, from the duel's D eggs.
  const tallies = model.map((r) => r.words as VsWords);
  const sumAt = (f: (w: VsWords) => number[], e: number): number => tallies.reduce((a, w) => a + f(w)[e], 0);
  console.log(`\n-- test 5: the words from the grid (at t_D, today) against the spread (at t_M), on test 1's cooks`);
  console.log('by egg: class and interval the same (the verdict\'s); class alone; interval alone; both, the grid read at t_M');
  let n5 = 0;
  let both5 = 0;
  for (let e = 0; e < VS_EGGS; e++) {
    const n = sumAt((w) => w.n, e);
    n5 += n;
    both5 += sumAt((w) => w.both, e);
    const pc = (x: number): string => `${(100 * x / n).toFixed(1)}%`;
    console.log(`  ${e}: ${pc(sumAt((w) => w.both, e))}, ${pc(sumAt((w) => w.cls, e))}, ${pc(sumAt((w) => w.interval, e))}, ${pc(sumAt((w) => w.bothAtM, e))} (${n})`);
  }
  for (let p = 0; p < VS_POTS.length; p++) {
    const ts = model.filter((r) => r.job.pot === p).map((r) => r.words as VsWords);
    const n = ts.reduce((a, w) => a + w.n.reduce((x, y) => x + y, 0), 0);
    const b = ts.reduce((a, w) => a + w.both.reduce((x, y) => x + y, 0), 0);
    console.log(`  ${VS_POTS[p].name}: ${(100 * b / n).toFixed(1)}% of ${n}`);
  }
  const q = (xs: number[], p: number): number => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const dLow = tallies.flatMap((w) => w.dLow);
  const dHigh = tallies.flatMap((w) => w.dHigh);
  const absEnd = dLow.map((x, i) => Math.max(Math.abs(x), Math.abs(dHigh[i])));
  console.log(`the likely time range, spread - grid: low end mean ${avg(dLow).toFixed(1)} s, high end ${avg(dHigh).toFixed(1)} s; `
    + `the farther end median ${q(absEnd, 0.5).toFixed(1)} s, 95th percentile ${q(absEnd, 0.95).toFixed(1)} s, largest ${Math.max(...absEnd).toFixed(1)} s; `
    + `mean width ${avg(tallies.flatMap((w) => w.widthGrid)).toFixed(0)} s (grid) and ${avg(tallies.flatMap((w) => w.widthSpread)).toFixed(0)} s (spread)`);
  const agree5 = both5 / n5;

  // The verdict, against the thresholds in the header.
  const t2max = Math.max(...Object.values(t2).map((x) => x.maxCell));
  const t2maxAt = Object.entries(t2).find(([, x]) => x.maxCell === t2max);
  const keep = Math.max(t1.maxCell, t2max) >= 0.03;
  const cut = t1.maxCellEgg < 0.01 && t2max <= 0.02 && agree5 >= 0.95;
  console.log('\n-- the verdict');
  console.log(`test 1, largest D - M at any pot, level and egg 1-6: ${(100 * t1.maxCellEgg).toFixed(2)} per 100 (${t1.maxCellEggAt}); CUT needs < 1`);
  console.log(`test 1, largest pot and level (eggs 1-6): ${(100 * t1.maxCell).toFixed(2)} (${t1.maxCellAt}); KEEP needs >= 3`);
  console.log(`test 2, largest pot and level in any regime (eggs 1-6): ${(100 * t2max).toFixed(2)} (${t2maxAt?.[0]}: ${t2maxAt?.[1].maxCellAt}); CUT needs <= 2, KEEP >= 3`);
  console.log(`test 5, the words agree: ${(100 * agree5).toFixed(1)}%; CUT needs >= 95%`);
  console.log(`=> ${keep ? 'KEEP' : cut ? 'CUT' : 'OWNER\'S CALL'}`);
  console.log(`(versus: ${((performance.now() - started) / 1000).toFixed(0)} s in all)`);
}

export type { DecisionInputs };
