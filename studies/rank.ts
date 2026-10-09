/**
 * How many parameters can "how was it?" actually move?
 *
 * Run: npm run rank
 *
 * Quoted by INFERENCE.md (what feedback can move) and README 11.5.
 *
 * This exists because a plan to pool feedback across many cooks proposed ten
 * global parameters, and the objection to it - that most of them cash out in the
 * same predictive, so the list claims more than the data can update - is a
 * measurable claim rather than a matter of taste. `studies/identifiability.ts`
 * asked it of one pair (alpha, h) at one cook. This asks it of ten candidates
 * over the cooks a population would actually send in.
 *
 * Read-only. Nothing in src/ is touched.
 *
 * Method: the Jacobian of (log10 yolk dose, log10 white dose) with respect to
 * each candidate, every column scaled by that candidate's PRIOR sd, so an entry
 * reads "decades of dose per prior sd". One pair of rows per scenario, each
 * scenario cooked for the time the app would have recommended - because that is
 * where the data will lie, and a deterministic policy is part of what limits it.
 * The eigenvalues of J'J / n / noise^2 are then the information ONE average
 * answer carries about each direction, in prior-sd units, and
 *
 *     N = 3 / lambda
 *
 * is the number of answers that halves the prior sd along it (precision 1 -> 4).
 * N is a Gaussian-latent count against an ordinal reality and a uniform scenario
 * mix against a skewed one. Read it to an order of magnitude; the GAPS in the
 * spectrum are the result, not the third digit.
 *
 * What it treats as informative: every yolk row, and a white row only when the
 * white lands within WHITE_NEAR decades of its threshold. A white that is
 * obviously set teaches next to nothing.
 */

import { ALPHA_DEFAULT, ALPHA_REL_SD } from '../src/core/constants.js';
import { CookSetup, Cooling, StartMode } from '../src/core/protocol.js';
import { eggFromMass } from '../src/core/geometry.js';
import {
  simulate, solveCookTime, donenessFromSlider, WHITE_DOSE_TARGET,
} from '../src/core/solve.js';
import { Theta, THETA0, NO_PROBE, runPerturbed } from './perturbed.js';

/* ------------------------------------------------------------ candidates */

interface Candidate {
  key: keyof Theta;
  /** Prior sd in the parameter's own units, and where it comes from. */
  priorSd: number;
  /** Central-difference half step. */
  step: number;
  why: string;
}

const CANDIDATES: Candidate[] = [
  { key: 'logAlpha', priorSd: ALPHA_REL_SD, step: 0.01, why: 'ALPHA_REL_SD' },
  { key: 'logTauAir', priorSd: 0.35, step: 0.02, why: 'the prior infer.ts had until DECISIONS.md 95 held it at 1.0' },
  { key: 'zYolk_K', priorSd: 0.07, step: 0.02, why: 'Vega CI 4.54-4.80 K read as 95%' },
  { key: 'zWhite_K', priorSd: 0.2, step: 0.02, why: 'Weijers 430-490 kJ/mol -> 4.87-5.55 K; judgement' },
  { key: 'whiteRadiusFrac', priorSd: 0.03, step: 0.005, why: 'yolk 28-38% of volume' },
  { key: 'sizeExponent', priorSd: 0.03, step: 0.01, why: 'shape varies with size; judgement' },
  { key: 'yolkOffset', priorSd: 0.22, step: 0.01, why: 'PRIOR_OFFSET_SD in infer.ts' },
  { key: 'whiteOffset', priorSd: 0.5, step: 0.01, why: 'README 8: 3-6 C of disagreement is about a decade' },
  { key: 'startBias_C', priorSd: 2.0, step: 0.2, why: 'fridges run 2-8 C' },
  { key: 'boilBias_C', priorSd: 1.5, step: 0.2, why: 'a simmer against a rolling boil; judgement' },
];

/** Latent sd of one ordinal answer, decades. FEEDBACK_BAND is 0.28 and the egg
 *  adds its own scatter on top; 0.4 is a judgement, and N scales as its square. */
const ANSWER_NOISE = 0.4;

/** A white answer counts only this close to the threshold, decades. */
const WHITE_NEAR = 0.8;

/* -------------------------------------------------------------- scenarios */

interface Scenario { mass_kg: number; setup: CookSetup; cook_s: number }

function scenarios(): Scenario[] {
  const out: Scenario[] = [];
  const masses = [0.048, 0.058, 0.068, 0.076];
  const starts = [4, 20];
  const coolings: Cooling[] = ['ice', 'tap', 'counter'];
  const modes: StartMode[] = ['hot', 'cold'];
  const levels = [0.1, 0.22, 0.41, 0.62, 0.9];
  for (const mass_kg of masses) for (const eggStart_C of starts) {
    for (const cooling of coolings) for (const startMode of modes) for (const level of levels) {
      const setup: CookSetup = {
        startMode, eggStart_C, ambient_C: 20, boiling_C: 100, timeToBoil_s: 480,
        cooling, waterLitres: 1.5, eggCount: 2,
      };
      const sol = solveCookTime(
        eggFromMass(mass_kg), setup, { alpha_m2s: ALPHA_DEFAULT, tauAirScale: 1.0 },
        donenessFromSlider(level),
      );
      // An unreachable level is never cooked, so it never generates an answer.
      if (sol.reachable) out.push({ mass_kg, setup, cook_s: sol.result.cookTime_s });
    }
  }
  return out;
}

/* ------------------------------------------------- sanity: the restated loop */

function crossCheck(all: Scenario[]): number {
  let worst = 0;
  for (let i = 0; i < all.length; i += 4) {
    const sc = all[i];
    const mine = runPerturbed(sc.mass_kg, sc.setup, THETA0, sc.cook_s, NO_PROBE);
    const theirs = simulate(
      eggFromMass(sc.mass_kg), sc.setup, { alpha_m2s: ALPHA_DEFAULT, tauAirScale: 1.0 }, sc.cook_s,
    );
    worst = Math.max(
      worst,
      Math.abs(mine.logYolk - Math.log10(theirs.yolkDose_min)),
      Math.abs(mine.logWhite - Math.log10(theirs.whiteDose_min)),
    );
  }
  return worst;
}

/* --------------------------------------------------------------- Jacobian */

interface Row { cooling: Cooling; j: number[] }

function jacobian(all: Scenario[]): Row[] {
  const logWhiteTarget = Math.log10(WHITE_DOSE_TARGET);
  const rows: Row[] = [];
  for (const sc of all) {
    const base = runPerturbed(sc.mass_kg, sc.setup, THETA0, sc.cook_s, NO_PROBE);
    const jy: number[] = [];
    const jw: number[] = [];
    for (const c of CANDIDATES) {
      const up = runPerturbed(sc.mass_kg, sc.setup, { ...THETA0, [c.key]: THETA0[c.key] + c.step }, sc.cook_s, NO_PROBE);
      const dn = runPerturbed(sc.mass_kg, sc.setup, { ...THETA0, [c.key]: THETA0[c.key] - c.step }, sc.cook_s, NO_PROBE);
      jy.push((up.logYolk - dn.logYolk) / (2 * c.step) * c.priorSd);
      jw.push((up.logWhite - dn.logWhite) / (2 * c.step) * c.priorSd);
    }
    rows.push({ cooling: sc.setup.cooling, j: jy });
    if (Math.abs(base.logWhite - logWhiteTarget) < WHITE_NEAR) {
      rows.push({ cooling: sc.setup.cooling, j: jw });
    }
  }
  return rows;
}

/* ------------------------------------------- symmetric eigen, cyclic Jacobi */

/* Ten by ten and symmetric, so Jacobi rotations are exact enough and keep the
 * tool free of a linear algebra dependency the rest of the repo does not have. */
function eigenSymmetric(a0: number[][]): { values: number[]; vectors: number[][] } {
  const n = a0.length;
  const a = a0.map((r) => r.slice());
  const v: number[][] = a.map((_, i) => a.map((__, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = a[k][p]; const akq = a[k][q];
        a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = a[p][k]; const aqk = a[q][k];
        a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < n; k++) {
        const vkp = v[k][p]; const vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  const order = a.map((_, i) => i).sort((i, j) => a[j][j] - a[i][i]);
  return {
    values: order.map((i) => a[i][i]),
    vectors: order.map((i) => v.map((row) => row[i])),
  };
}

/* ----------------------------------------------------------------- report */

function report(title: string, rows: Row[], drop: (keyof Theta)[]): void {
  const keep: number[] = [];
  CANDIDATES.forEach((c, i) => { if (!drop.includes(c.key)) keep.push(i); });
  const n = keep.length;
  const info: number[][] = keep.map(() => keep.map(() => 0));
  for (const r of rows) {
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      info[a][b] += r.j[keep[a]] * r.j[keep[b]];
    }
  }
  const scale = rows.length * ANSWER_NOISE * ANSWER_NOISE;
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) info[a][b] /= scale;

  console.log(`${title}  (${rows.length} answers, ${n} parameters)`);
  console.log('  dir |  answers to halve the prior sd | loads on');
  const eig = eigenSymmetric(info);
  for (let k = 0; k < n; k++) {
    const lambda = Math.max(eig.values[k], 0);
    const need = lambda > 1e-12 ? 3 / lambda : Infinity;
    const vec = eig.vectors[k];
    const top = vec.map((_, i) => i).sort((i, j) => Math.abs(vec[j]) - Math.abs(vec[i])).slice(0, 3);
    const loads = top.map((i) => `${CANDIDATES[keep[i]].key} ${vec[i] >= 0 ? '+' : '-'}${Math.abs(vec[i]).toFixed(2)}`).join(', ');
    const shown = need === Infinity ? 'never' : need < 10 ? need.toFixed(1) : need.toFixed(0);
    console.log(`  ${String(k + 1).padStart(3)} | ${shown.padStart(30)} | ${loads}`);
  }
  console.log();
}

const all = scenarios();
console.log(`${all.length} reachable scenarios; the restated loop agrees with simulate() to`);
console.log(`  worst |log10 dose| difference  ${crossCheck(all).toExponential(2)}`);
console.log();

console.log('candidates, and what one prior sd of each is worth (rms decades of dose):');
const rows = jacobian(all);
CANDIDATES.forEach((c, i) => {
  let ss = 0;
  for (const r of rows) ss += r.j[i] * r.j[i];
  console.log(`  ${c.key.padEnd(16)} sd ${String(c.priorSd).padEnd(6)} ${Math.sqrt(ss / rows.length).toFixed(3)}   ${c.why}`);
});
console.log();

report('every protocol', rows, []);
// The slider's dose scale is definitional, so a global yolk offset is not a
// fact about eggs: it is the mean of everybody's taste, and only a thermometer
// can tell those apart (studies/probe.ts).
report('yolk offset fixed by convention', rows, ['yolkOffset']);
report('water-cooled cooks only - what most people do', rows.filter((r) => r.cooling !== 'counter'), ['yolkOffset']);
