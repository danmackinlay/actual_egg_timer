/**
 * The decision's measurements: what choosing the time costs, how accurate its surface
 * is, what it does before and after the first egg, whether the odds are
 * calibrated, and why "still learning" is a count.
 *
 * Run: npm run decide            (all of it, several minutes)
 *      npm run decide -- cost    (one section: cost, accuracy, lean, odds,
 *                                 learning, runny, reach, advice, outcome,
 *                                 nudge, certainty)
 *
 * Read-only. Nothing in src/ is touched. The numbers it prints are the ones in
 * INFERENCE.md section 8 and LOGBOOK.md, 28 September 2026; the
 * claims they rest on are asserted, more cheaply, in test/decide.test.ts.
 */

import {
  Decision, DecisionInputs, NUDGE_MAX_S, RUNNY_WHITE_LOSS, chooseCookTime, decide, decideAt,
  decisionGridRequest, decisionGridSpec, decisionInputs, oddsInTenths,
} from '../src/core/decide.js';
import { DoseGrid, buildDoseGrid, buildRequestedGrid, cookTimeForLogYolkDose } from '../src/core/doseGrid.js';
import {
  FEEDBACK_BAND, Particle, WhiteReport, YOLK_WORDS, YolkWord, createPrior, yolkWordBands, yolkWordProbit,
  withUnrelated, withUnrelatedWord,
  posteriorMeanOffset, posteriorParams, predictCookTime, updatePosterior, whiteProbit, yolkProbit,
} from '../src/core/infer.js';
import { ALPHA_DEFAULT } from '../src/core/constants.js';
import { eggFromMass, Egg } from '../src/core/geometry.js';
import { CookSetup } from '../src/core/protocol.js';
import { Solution, logYolkTarget } from '../src/core/solve.js';
import { LevelOdds, OddsProfile, answerAt, envelopeBounds, oddsProfile } from '../src/core/reach.js';
import { predictOutcome } from '../src/core/outcome.js';
import { CERTAINTY_MASS, CertaintyReading, certaintyAt } from '../src/core/certainty.js';
import { cookTimeForLogWhiteDose, lookupLogYolkDose } from '../src/core/doseGrid.js';
import { UNRELATED } from '../src/core/infer.js';
import { sliderFromYolkDose } from '../src/core/solve.js';
import {
  CALIBRATION_ALPHA_HIGH, CALIBRATION_ALPHA_LOW, CALIBRATION_SEED, PARTICLE_COUNT,
} from '../src/core/policy.js';
import {
  Calibration, EggRecord, calibrationDoneness, calibrationParams, freshCalibration, replay,
} from '../src/core/record.js';
import { appSetup, draw, recordAt, rng } from './common.js';

const only = process.argv[2] ?? 'all';
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
      const fine = buildDoseGrid(pot.egg, pot.setup, inputs.params.tauAirScale, {
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
  const grid = buildDoseGrid(REF_EGG, SETUP, 1, { alphaMin: ALPHA_DEFAULT * CALIBRATION_ALPHA_LOW, alphaMax: ALPHA_DEFAULT * CALIBRATION_ALPHA_HIGH, alphaCount: 17, timeMin_s: 200, timeMax_s: 900, timeCount: 71 });
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
  // E8: what +-10 s costs the cook. Cooks drawn from the prior, as for the
  // odds, each egg at the time the app chooses; at every egg the TRUE cook's
  // loss - P(too soft) + P(too firm) + 3 P(runny), the decision's own loss,
  // read through the truth's probit rather than the posterior's - at the
  // chosen time, and averaged over the 21 nudges. And how often the egg comes
  // out right (the yolk just right, the white not runny) either way.
  console.log(`\n== nudge: the true cook's loss at the chosen time, and +-${NUDGE_MAX_S} s about it (300 cooks x 6 eggs, 1000 particles)`);
  const grid = buildDoseGrid(REF_EGG, SETUP, 1, { alphaMin: ALPHA_DEFAULT * CALIBRATION_ALPHA_LOW, alphaMax: ALPHA_DEFAULT * CALIBRATION_ALPHA_HIGH, alphaCount: 17, timeMin_s: 200, timeMax_s: 900, timeCount: 71 });
  const random = rng(20261002);
  const truths = createPrior(300, 20261002 ^ 0x2545f49).particles;
  const levels = [0.22, 0.41, 0.62];
  const lossOf = (p: Particle, t: number, target: number): { loss: number; right: number } => {
    const y = yolkProbit(grid, p, t, target);
    const w = whiteProbit(grid, p, t);
    return { loss: y[0] + y[2] + RUNNY_WHITE_LOSS * w[0], right: y[1] * (1 - w[0]) };
  };
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
  // The owner's rule, +-15 s (DECISIONS.md 9). No screen
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
  const grid = buildDoseGrid(REF_EGG, SETUP, 1, { alphaMin: ALPHA_DEFAULT * CALIBRATION_ALPHA_LOW, alphaMax: ALPHA_DEFAULT * CALIBRATION_ALPHA_HIGH, alphaCount: 17, timeMin_s: 200, timeMax_s: 900, timeCount: 71 });
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
  // DECISIONS.md 93, SHIP-0.5 A7: the certainty word, the 90% interval in
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
  const grid = buildDoseGrid(egg58, SETUP, 1, { alphaMin: ALPHA_DEFAULT * CALIBRATION_ALPHA_LOW, alphaMax: ALPHA_DEFAULT * CALIBRATION_ALPHA_HIGH, alphaCount: 17, timeMin_s: 150, timeMax_s: 850, timeCount: 71 });
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

export type { DecisionInputs };
