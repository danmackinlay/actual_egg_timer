/**
 * E5's measurements: what choosing the time costs, how accurate its surface
 * is, what it does before and after the first egg, whether the odds are
 * calibrated, and why "still learning" is a count.
 *
 * Run: npm run decide            (all of it, several minutes)
 *      npm run decide -- cost    (one section: cost, accuracy, lean, odds,
 *                                 learning, runny, reach, advice, outcome)
 *
 * Read-only. Nothing in src/ is touched. The numbers it prints are the ones in
 * PLAN.md (E5), INFERENCE.md section 8 and LOGBOOK.md, 28 September 2026; the
 * claims they rest on are asserted, more cheaply, in test/decide.test.ts.
 */

import {
  Decision, DecisionInputs, chooseCookTime, decide, decideAt, decisionGridRequest,
  decisionGridSpec, decisionInputs, oddsInTenths,
} from '../src/core/decide.js';
import { DoseGrid, buildDoseGrid, cookTimeForLogYolkDose } from '../src/core/doseGrid.js';
import {
  Feedback, FEEDBACK_BAND, Particle, WhiteReport, answerLikelihood, createPrior,
  posteriorMeanOffset, posteriorParams, predictCookTime, updatePosterior,
} from '../src/core/infer.js';
import { ALPHA_DEFAULT } from '../src/core/constants.js';
import { eggFromMass, Egg } from '../src/core/geometry.js';
import { CookSetup } from '../src/core/protocol.js';
import { Solution, donenessFromSlider } from '../src/core/solve.js';
import { LevelOdds, OddsProfile, answerAt, oddsProfile } from '../src/core/reach.js';
import { predictOutcome } from '../src/core/outcome.js';
import { cookTimeForLogWhiteDose, lookupLogYolkDose } from '../src/core/doseGrid.js';
import { UNRELATED } from '../src/core/infer.js';
import { sliderFromYolkDose } from '../src/core/solve.js';
import { CALIBRATION_SEED, PARTICLE_COUNT } from '../src/core/policy.js';
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

/** The app's idle answer (core `answerAt`), without the odds' range: this
 *  tool measures the mean solve, not the slider's reach. */
function meanSolve(c: Calibration, egg: Egg, setup: CookSetup, level: number): { sol: Solution; level: number } {
  const a = answerAt(c, egg, setup, level, null, true);
  return { sol: a.solution, level: a.level };
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
    yolk: yolk, white: white, probe: null, lang: 'en', register: 'modern', units: 'metric',
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
  // The owner's rule, +-15 s (INFERENCE.md section 11, decision 9). No screen
  // shows it and `Decision` no longer carries it (D3), so it is read here, on
  // demand, from `predictCookTime`, as E8 would.
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
    recordAt(0.41, lit464, 0, 'firm'), recordAt(0.41, lit464, 0, 'tender'), recordAt(0.41, lit464, 0, 'firm'),
    recordAt(0.62, lit464 + 70, 0, 'firm'), recordAt(0.41, lit464, 0, 'firm'),
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
        const setup = setupOf(which);
        const grid = buildRequestedGrid(decisionGridRequest(decisionInputs(c, REF_EGG, setup)));
        row.push([0.22, 0.41, 0.62, 1].map((level) => {
          const m = meanSolve(c, REF_EGG, setup, level);
          const d = decide(c, grid, m.sol, logTarget(m.level));
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
  const grid = buildDoseGrid(REF_EGG, SETUP, 1, ALPHA_DEFAULT * 0.55, ALPHA_DEFAULT * 1.8, 17, 200, 900, 71);
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
    const target = logTarget(level);
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
      const w = draw((['runny', 'tender', 'firm'] as WhiteReport[]).map((a) => answerLikelihood(grid, truth, t, target, null, a)), random());
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
      updatePosterior(cal.posterior, grid, t, target, (e.yolk - 1) as Feedback, (['runny', 'tender', 'firm'] as WhiteReport[])[w]);
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
      const dm = ms(() => { for (let i = 0; i < 10; i++) d = decide(cal, g, m.sol, logTarget(m.level)); }) / 10;
      const dd = d as unknown as Decision;
      let o = predictOutcome(cal.posterior, g, dd.cookTime_s, logTarget(m.level));
      const om = ms(() => { for (let i = 0; i < 10; i++) o = predictOutcome(cal.posterior, g, dd.cookTime_s, logTarget(m.level)); }) / 10;
      console.log(`${name}, level ${level}: ${dd.cookTime_s.toFixed(0)} s, ${dd.oddsTenths}/10; soft/right/firm ${o.pTooSoft.toFixed(2)}/${o.pJustRight.toFixed(2)}/${o.pTooFirm.toFixed(2)}, `
        + `runny ${o.pWhiteRunny.toFixed(2)}; level ${o.levelLow.toFixed(2)}-${o.levelHigh.toFixed(2)} (median ${o.levelMedian.toFixed(2)}), ${o.lean}; `
        + `decision ${dm.toFixed(1)} ms, outcome ${om.toFixed(1)} ms`);
    }
  }
}

export type { DecisionInputs };
