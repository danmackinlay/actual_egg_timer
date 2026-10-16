/**
 * Test 4 of `npm run decide -- versus`: real eggs. The decision's value is
 * made of the posterior's spread, so this asks whether that spread is honest
 * on a cook's own eggs. The thresholds the study is read against are in the
 * `versus` section's header in studies/decide.ts; this test has none of its
 * own and feeds none of them.
 *
 * Run by hand, on records the eggs tool wrote:
 *
 *   npm run eggs -- import <results.json> fit/data/imported.jsonl
 *   node studies/decideEggs.ts fit/data/imported.jsonl
 *
 * The file is a cook's own eggs: it stays in fit/data/, which git ignores,
 * and this prints counts and summary statistics only, never an egg.
 *
 * The replay goes through the eggs in order, as the app folds them
 * (`replay`): for each egg, the posterior from the eggs before it, on the
 * surface the fold of that egg is scored on (`gridRequestFor`), and at the
 * time it is scored at (`recordCookTime_s`):
 *  - the predicted probabilities of the five yolk words and of the three
 *    whites, unrelated share included, scored against what was said, as a
 *    log score, beside the prior's own prediction of the same egg;
 *  - a randomised PIT for the yolk word: F(k - 1) + u p(k), uniform on [0, 1]
 *    if the predictive is honest;
 *  - runny whites said, against the number predicted.
 */

import { readFileSync } from 'node:fs';
import { buildRequestedGrid } from '../src/core/doseGrid.ts';
import { type Posterior, whiteAnswerProbabilities, yolkWordIndex, yolkWordProbabilities } from '../src/core/infer.ts';
import {
  CALIBRATION_SEED, type Calibration, type EggRecord, PARTICLE_COUNT, calibrationGrid, copyCalibration, foldRecord,
  freshCalibration, gridRequestFor, recordCookTime_s, recordTeaches,
} from '../src/core/record.ts';
import { normalCdf } from '../src/core/sphere.ts';
import { readFitRecord } from '../tools/eggsImport.ts';
import { rng } from '../tools/common.ts';

const path = process.argv[2];
if (path === undefined) {
  console.error('usage: node studies/decideEggs.ts <records.jsonl>   (from `npm run eggs -- import`)');
  process.exit(1);
}

const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as { seq?: number; record: unknown });
lines.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
const records: EggRecord[] = [];
let unreadable = 0;
let oldYolk = 0;
for (const l of lines) {
  const f = readFitRecord(l.record);
  if (f === null) { unreadable += 1; continue; }
  if (f.yolk !== null) oldYolk += 1;
  records.push(f.record);
}

const WHITES = ['runny', 'tender', 'firm'] as const;
const PRIOR: Calibration = freshCalibration(PARTICLE_COUNT, CALIBRATION_SEED);

/** The predictive at an egg, from `c`, on the surface its fold reads. */
function predict(c: Calibration, r: EggRecord): { words: number[]; whites: number[] } {
  const grid = buildRequestedGrid(gridRequestFor(c, r, calibrationGrid));
  const t = recordCookTime_s(r);
  const post: Posterior = c.posterior;
  return { words: yolkWordProbabilities(post, grid, t), whites: whiteAnswerProbabilities(post, grid, t) };
}

const random = rng(20261017);
const scores = { yolk: [] as number[], yolkPrior: [] as number[], white: [] as number[], whitePrior: [] as number[] };
const pit: number[] = [];
/** Each PIT's range before the draw: F(k - 1) to F(k). */
const pitEnds: [number, number][] = [];
let runnySaid = 0;
let runnyPredicted = 0;
let runnyPredictedPrior = 0;
const runnyP: number[] = [];
let withProbe = 0;
let taught = 0;
const c = copyCalibration(PRIOR);
for (const r of records) {
  if (!recordTeaches(r)) continue;
  taught += 1;
  if (r.probe !== null) withProbe += 1;
  const post = predict(c, r);
  const prior = predict(PRIOR, r);
  if (r.yolkWord !== null) {
    const k = yolkWordIndex(r.yolkWord);
    scores.yolk.push(Math.log(post.words[k]));
    scores.yolkPrior.push(Math.log(prior.words[k]));
    let below = 0;
    for (let j = 0; j < k; j++) below += post.words[j];
    pit.push(below + random() * post.words[k]);
    pitEnds.push([below, below + post.words[k]]);
  }
  if (r.white !== null) {
    const k = WHITES.indexOf(r.white);
    scores.white.push(Math.log(post.whites[k]));
    scores.whitePrior.push(Math.log(prior.whites[k]));
    runnySaid += r.white === 'runny' ? 1 : 0;
    runnyPredicted += post.whites[0];
    runnyPredictedPrior += prior.whites[0];
    runnyP.push(post.whites[0]);
  }
  // The egg folded as the app folds it, on the same surface.
  foldRecord(c, r, buildRequestedGrid(gridRequestFor(c, r, calibrationGrid)));
}

const mean = (xs: number[]): number => (xs.length === 0 ? Number.NaN : xs.reduce((a, b) => a + b, 0) / xs.length);
const sd = (xs: number[]): number => {
  const m = mean(xs);
  return xs.length < 2 ? Number.NaN : Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};

console.log(`== test 4: real eggs (${path})`);
console.log(`${lines.length} records; ${unreadable} unreadable; ${oldYolk} answered the old way (too soft / right / too firm, not scored as words); `
  + `${taught} that teach; ${scores.yolk.length} with a yolk word, ${scores.white.length} with a white, ${withProbe} with a probe reading`);
const diff = (a: number[], b: number[]): number[] => a.map((x, i) => x - b[i]);
const yd = diff(scores.yolk, scores.yolkPrior);
const wd = diff(scores.white, scores.whitePrior);
console.log(`mean log score, yolk word: posterior ${mean(scores.yolk).toFixed(3)}, prior ${mean(scores.yolkPrior).toFixed(3)}, `
  + `difference ${mean(yd).toFixed(3)} (sd ${sd(yd).toFixed(3)}); uniform over five words ${Math.log(0.2).toFixed(3)}`);
console.log(`mean log score, white: posterior ${mean(scores.white).toFixed(3)}, prior ${mean(scores.whitePrior).toFixed(3)}, `
  + `difference ${mean(wd).toFixed(3)} (sd ${sd(wd).toFixed(3)}); uniform over three ${Math.log(1 / 3).toFixed(3)}`);
console.log('(the first egg is scored by the prior either way, so its difference is 0)');

const BINS = 5;
const hist = new Array<number>(BINS).fill(0);
for (const u of pit) hist[Math.min(BINS - 1, Math.floor(u * BINS))] += 1;
console.log(`randomised PIT of the yolk word, ${BINS} bins of 0.2 (uniform if honest; expected ${(pit.length / BINS).toFixed(1)} each): `
  + `${hist.map((n, i) => `${(i / BINS).toFixed(1)}-${((i + 1) / BINS).toFixed(1)}: ${'#'.repeat(n)}${n}`).join('  ')}; mean ${mean(pit).toFixed(2)} (0.5 if honest)`);

// How far the PITs' mean is from a half: the chance a mean of N uniforms
// lies as far out or farther, the Irwin-Hall distribution (a normal past 20).
const irwinHall = (x: number, k: number): number => {
  if (k > 20) return normalCdf((x - k / 2) / Math.sqrt(k / 12));
  let s = 0;
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  let binom = 1;
  for (let j = 0; j <= Math.floor(x) && j <= k; j++) {
    s += (j % 2 === 0 ? 1 : -1) * binom * (x - j) ** k;
    binom = binom * (k - j) / (j + 1);
  }
  return s / fact;
};
if (pit.length > 0) {
  const k = pit.length;
  const sum = pit.reduce((a, b) => a + b, 0);
  const lower = irwinHall(Math.min(sum, k - sum), k);
  console.log(`before the draw each PIT lies between F(k - 1) and F(k): on average ${mean(pitEnds.map((e) => e[0])).toFixed(2)} to ${mean(pitEnds.map((e) => e[1])).toFixed(2)}, the largest upper end ${Math.max(...pitEnds.map((e) => e[1])).toFixed(2)}`);
  const twoSided = (total: number): number => Math.min(1, 2 * irwinHall(Math.min(total, k - total), k));
  const lowEnds = pitEnds.reduce((a, e) => a + e[0], 0);
  const highEnds = pitEnds.reduce((a, e) => a + e[1], 0);
  console.log(`the PITs' mean is ${mean(pit).toFixed(2)}: a mean of ${k} uniforms is that far from 0.5 or farther with probability ${Math.min(1, 2 * lower).toFixed(4)} (two-sided); `
    + `with every PIT at the low end of its range ${twoSided(lowEnds).toFixed(4)}, at the high end ${twoSided(highEnds).toFixed(4)}`);
}

// The chance of as many runny whites as were said, or more, and as few or
// fewer, under the posterior's own predictions: a Poisson-binomial.
const pb = (ps: number[]): number[] => {
  let dist = [1];
  for (const p of ps) {
    const next = new Array<number>(dist.length + 1).fill(0);
    for (let k = 0; k < dist.length; k++) { next[k] += dist[k] * (1 - p); next[k + 1] += dist[k] * p; }
    dist = next;
  }
  return dist;
};
const dist = pb(runnyP);
const atLeast = dist.slice(runnySaid).reduce((a, b) => a + b, 0);
const atMost = dist.slice(0, runnySaid + 1).reduce((a, b) => a + b, 0);
console.log(`runny whites: said ${runnySaid} of ${scores.white.length}; predicted ${runnyPredicted.toFixed(2)} by the posterior, ${runnyPredictedPrior.toFixed(2)} by the prior; `
  + `P(as many or more) ${atLeast.toFixed(3)}, P(as few or fewer) ${atMost.toFixed(3)}`);

// What N can show. A PIT histogram is a test of uniformity: at N eggs the
// Kolmogorov-Smirnov 5% critical distance is about 1.36 / sqrt(N), and a
// Gaussian predictive with half the true sd puts its PIT's CDF at
// Phi(Phi^-1(u) / 2), at most 0.16 from the diagonal (near u = 0.1 and 0.9).
const n = pit.length;
console.log(`power: ${n} yolk words. A PIT tells the predictive from uniform at 5% only when its CDF is ${(1.36 / Math.sqrt(Math.max(n, 1))).toFixed(2)} or more `
  + `from the diagonal somewhere${n < 35 ? ' (the asymptotic figure; at this N the exact one is larger still)' : ''}; `
  + `a predictive whose sd is half the truth's is at most 0.16 from it (Phi(Phi^-1(u) / 2) against u), which takes about 72 eggs to see, so `
  + `${n < 72 ? 'this N cannot see that' : 'this N can see that'}. `
  + `Runny whites: ${scores.white.length} whites with ${runnyPredicted.toFixed(1)} predicted, so only a count several times that, or none where several were predicted, would show.`);
