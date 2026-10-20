/**
 * The fit's simulated cooks and its emulator (INFERENCE.md section 9):
 * `tools/eggs.ts simulate` and `emulate` are the command line; this is what
 * they do, apart, so `npm run fixtures` can make the fit's test samples
 * (tools/fixtures/fitSample.ts, fitRecovery.ts) with the same code.
 *
 * THE EMULATOR. A record's answers depend on the cook's time-scale through
 * the physics, and on everything else additively (INFERENCE.md section 3).
 * So for each egg one column is enough: the doses at its own cook time, at
 * 17 time-scales from -4 to +4 literature sds, `alpha = ALPHA_DEFAULT *
 * exp(ALPHA_REL_SD * z)`, which is uniform in log alpha, as the app's grids
 * are. Carryover and size scaling stay at the physics (INFERENCE.md section
 * 2): the egg is the size the record says.
 */

import { ALPHA_DEFAULT, ALPHA_REL_SD, Z_WHITE, Z_YOLK } from '../src/core/constants.ts';
import { buildDoseGrid } from '../src/core/doseGrid.ts';
import { eggFromMass } from '../src/core/geometry.ts';
import {
  FEEDBACK_BAND, LITERATURE_POPULATION, PROBE_HANDLING_MEAN_C, PROBE_INSTRUMENT_SD_C,
  PROBE_UNRELATED, PROBE_UNRELATED_SPAN_C, type Particle, UNRELATED, WHITE_REPORTS, YOLK_WORDS, YOLK_WORD_CUTS,
  probeLikelihood, whiteProbit, withUnrelated, withUnrelatedWord, yolkProbit, yolkWordBands, yolkWordIndex,
  yolkWordProbit,
} from '../src/core/infer.ts';
import { type CookSetup, countsDown, restsInAir } from '../src/core/protocol.ts';
import {
  type EggRecord, LIKELIHOOD_ID, MODEL_ID, RECORD_VERSION, gridRequestFor, freshCalibration, recordCookTime_s,
  recordMass_g, recordProbe_C, recordTeaches,
} from '../src/core/record.ts';
import { DEFAULT_PARAMS, WHITE_DOSE_TARGET, donenessFromSlider, logYolkTarget, simulate, solveCookTime } from '../src/core/solve.ts';
import { coolingSecondsFor, countedCooling_s } from '../src/core/running.ts';
import { normalCdf } from '../src/core/sphere.ts';
import { NUDGE_MAX_S, nudgeSeconds } from '../src/core/decide.ts';
import { appSetup, rng } from './common.ts';
import { type Line, type OldYolk, readFitRecord, sameEggKey } from './eggsImport.ts';

/** The time-scale axis of the emulator, in literature sds. */
export const Z_GRID = Array.from({ length: 17 }, (_, i) => -4 + 0.5 * i);

/* --------------------------------------------------------------- simulate */

/** A population, as the fit parametrises it: the time-scale in literature
 *  sds (`muZ`, and each cook's spread `tauZ`), the white's lag and each
 *  cook's spread about it, the taste's spread (its mean is 0 by convention),
 *  and the noise and firm gap as lognormals. Cook effects are Student-t with
 *  4 degrees of freedom, as the fit has them, so a few cooks are far out. */
export interface Truth {
  muZ: number;
  tauZ: number;
  lag: number;
  tauW: number;
  tauT: number;
  noiseMedian: number;
  noiseLogSd: number;
  gapMedian: number;
  gapLogSd: number;
}

/** The truth the simulated cooks are drawn from by default: a kitchen 7%
 *  faster than the literature, whites that set a quarter of a decade later,
 *  and spreads a little under the literature prior's. */
export const SIMULATED_TRUTH: Truth = {
  muZ: 0.6, tauZ: 0.35, lag: 0.25, tauW: 0.3, tauT: 0.12,
  noiseMedian: 0.18, noiseLogSd: 0.35, gapMedian: 1.0, gapLogSd: 0.25,
};

function normal(u: () => number): number {
  const u1 = Math.max(u(), 1e-12);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u());
}

function studentT4(u: () => number): number {
  let chi2 = 0;
  for (let k = 0; k < 4; k++) chi2 += normal(u) ** 2;
  return normal(u) / Math.sqrt(chi2 / 4);
}

function uuid(u: () => number): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(u() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ['8', '9', 'a', 'b'][Math.floor(u() * 4)];
  const h = hex.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

interface Kitchen {
  setup: CookSetup;
  mass_g: number;
  massFrom: EggRecord['egg']['massFrom'];
  level: number;
}

/** A cook's kitchen: one of the setups people use, kept for every egg, with
 *  now and then a different level. */
function kitchenOf(u: () => number): Kitchen {
  const pick = <T>(xs: T[]): T => xs[Math.floor(u() * xs.length)];
  const drawn = pick(['ice', 'ice', 'tap', 'counter'] as const);
  const start = pick(['hot', 'hot', 'cold'] as const);
  const mass_g = pick([55, 62, 62, 68, 68, 75]);
  const setup = {
    startMode: start, eggStart_C: u() < 0.8 ? 4 : 20,
    timeToBoil_s: start === 'cold' ? 420 + 120 * u() : 480,
    waterLitres: pick([1.5, 2, 2, 3]), eggCount: pick([1, 2, 2, 4]),
  };
  const massFrom = u() < 0.4 ? 'scale' : 'class';
  const level = pick([0.22, 0.41, 0.41, 0.62, 0.8]);
  // A kitchen that rests its eggs in the air for a soft or jammy yolk eats
  // them warm from an egg cup, where that yolk is in reach. Read off the
  // draws already made, so every other kitchen is drawn as before.
  const cooling = drawn === 'counter' && level <= 0.41 ? 'eggCup' : drawn;
  return { setup: appSetup({ ...setup, cooling: cooling }), mass_g: mass_g, massFrom: massFrom, level: level };
}

export interface CookTruth {
  uid: string;
  tier: Line['tier'];
  z: number;
  taste: number;
  white: number;
  noise: number;
  gap: number;
}

/** What `simulate` makes: the records, and the truth they were drawn from,
 *  every cook's own included. */
export interface Simulated {
  lines: Line[];
  truth: { truth: Truth; cooks: CookTruth[]; nudgeMax_s: number };
}

/** `cooks` cooks drawn from the population `t`, with the seed `seed`: the
 *  same records for the same three, on every machine. */
export function simulateCooks(cooks: number, seed: number, t: Truth): Simulated {
  const u = rng(seed);
  const lines: Line[] = [];
  const truths: CookTruth[] = [];
  const whiteNoisePerYolk = Z_YOLK / Z_WHITE;
  const logWhiteTarget = Math.log10(WHITE_DOSE_TARGET);
  for (let k = 0; k < cooks; k++) {
    const c: CookTruth = {
      uid: uuid(u),
      tier: u() < 0.4 ? 'attested' : 'open',
      z: t.muZ + t.tauZ * studentT4(u),
      taste: t.tauT * studentT4(u),
      white: t.lag + t.tauW * studentT4(u),
      noise: t.noiseMedian * Math.exp(t.noiseLogSd * normal(u)),
      gap: t.gapMedian * Math.exp(t.gapLogSd * normal(u)),
    };
    truths.push(c);
    const kitchen = kitchenOf(u);
    const probes = !restsInAir(kitchen.setup.cooling) && u() < 0.15;
    const alpha = ALPHA_DEFAULT * Math.exp(ALPHA_REL_SD * c.z);
    const eggs = 3 + Math.floor(u() * 8);
    // A quarter of the cooks answered their first two eggs on a build from
    // before the five yolk words: too soft, just right or
    // too firm. The rest name the yolk they got.
    const before = u() < 0.25 ? 2 : 0;
    for (let e = 0; e < eggs; e++) {
      const level = u() < 0.2 ? Math.min(1, Math.max(0, kitchen.level + (u() - 0.5) * 0.3)) : kitchen.level;
      const egg = eggFromMass(kitchen.mass_g / 1000);
      // Cooked at the literature's time for the level, nudged as a sharing
      // cook's is: the fit sees eggs either side of the surface.
      const solved = solveCookTime(egg, kitchen.setup, DEFAULT_PARAMS, donenessFromSlider(level));
      const nudge = nudgeSeconds(u());
      const time = solved.result.cookTime_s + nudge;
      const truly = simulate(egg, kitchen.setup, { alpha_m2s: alpha }, time);
      const target = logYolkTarget(level);
      const latent = Math.log10(truly.yolkDose_min) - (target + c.taste);
      const yp = [normalCdf((-FEEDBACK_BAND - latent) / c.noise), 0, normalCdf((latent - FEEDBACK_BAND) / c.noise)];
      yp[1] = Math.max(0, 1 - yp[0] - yp[2]);
      // The five words: the delivered dose less the taste, through the
      // filter's own probit (infer.ts, yolkWordBands).
      const wordP = yolkWordBands(Math.log10(truly.yolkDose_min) - c.taste, c.noise);
      const wl = Math.log10(truly.whiteDose_min) - (logWhiteTarget + c.white);
      const sw = c.noise * whiteNoisePerYolk;
      const wp = [normalCdf(-wl / sw), 0, normalCdf((wl - c.gap) / sw)];
      wp[1] = Math.max(0, 1 - wp[0] - wp[2]);
      const answer = (p: number[]): number => {
        if (u() < UNRELATED) return Math.floor(u() * p.length);
        const r = u();
        let acc = 0;
        for (let k = 0; k < p.length - 1; k++) {
          acc += p[k];
          if (r < acc) return k;
        }
        return p.length - 1;
      };
      const asked = u() < 0.9;
      const old = e < before;
      const yolk = asked && old ? (answer(yp) - 1) as OldYolk : null;
      const yolkWord = asked && !old ? YOLK_WORDS[answer(wordP)] : null;
      const white = u() < 0.8 ? WHITE_REPORTS[answer(wp)] : null;
      let probe: EggRecord['probe'] = null;
      if (probes && e === 0) {
        const h = -PROBE_HANDLING_MEAN_C * Math.log(Math.max(u(), 1e-12));
        const reading = u() < PROBE_UNRELATED
          ? truly.peakYolk_C - PROBE_UNRELATED_SPAN_C / 2 + PROBE_UNRELATED_SPAN_C * u()
          : truly.peakYolk_C + PROBE_INSTRUMENT_SD_C * normal(u) - h;
        probe = { centre_C: recordProbe_C(reading), after_s: coolingSecondsFor(solved.result) };
      }
      const record: EggRecord & { yolk: OldYolk | null } = {
        v: RECORD_VERSION, uid: c.uid, day: `2026-11-${String(1 + (e % 28)).padStart(2, '0')}`,
        app: c.tier === 'attested' ? 'ios' : 'web', appVersion: 'simulated', prior: LITERATURE_POPULATION.id,
        model: old ? '2026-10-e8' : MODEL_ID,
        egg: { mass_g: recordMass_g(egg.mass_kg), massFrom: kitchen.massFrom, sizeTable: kitchen.massFrom === 'class' ? 'eu' : null },
        setup: {
          startMode: kitchen.setup.startMode, eggStart_C: kitchen.setup.eggStart_C,
          eggFrom: kitchen.setup.eggStart_C < 10 ? 'fridge' : 'room', ambient_C: kitchen.setup.ambient_C,
          boiling_C: kitchen.setup.boiling_C, timeToBoil_s: kitchen.setup.timeToBoil_s,
          timeToBoilFrom: kitchen.setup.startMode === 'cold' ? 'measured' : 'remembered',
          cooling: kitchen.setup.cooling, afterBoil: kitchen.setup.afterBoil ?? 'hold',
          waterLitres: kitchen.setup.waterLitres, eggCount: kitchen.setup.eggCount,
        },
        level: level, recommended_s: solved.result.cookTime_s, nudge_s: nudge, pulled_s: time, pulledBy: 'cook',
        cooled_s: countsDown(kitchen.setup.cooling) ? countedCooling_s(solved.result, kitchen.setup.cooling) : 0,
        yolk: yolk, yolkWord: yolkWord, white: white,
        probe: probe && probe.centre_C <= kitchen.setup.boiling_C ? probe : null,
        forecast: null, lang: 'en', register: 'modern', units: 'metric',
      };
      if (readFitRecord(record) === null) throw new Error('a simulated record does not read');
      lines.push({ tier: c.tier, seq: e, record: record });
    }
  }
  return { lines: lines, truth: { truth: t, cooks: truths, nudgeMax_s: NUDGE_MAX_S } };
}

/* ---------------------------------------------------------------- emulate */

/** A particle for the likelihood checks: off-centre in every dimension. */
const CHECK_PARTICLE = { logDoseOffset: 0.05, noise: 0.23, whiteOffset: 0.1, whiteFirmGap: 0.9 };
const CHECK_Z = [-1.0, 0.0, 1.3];
const CHECKED_EGGS = 12;

/** One egg, wherever it came from: its place too, since two eggs alike in
 *  every field, cooked the same day, are two eggs. Sharing sends an egg's
 *  place in the log as `seq`, and import keeps it, so the same egg pulled and
 *  imported has the same. */
function eggKey(line: Line): string {
  return `${line.seq}|${sameEggKey(line.record)}`;
}

/** The emulated file `emulate` writes, and how many of the lines it kept. */
export interface Emulated {
  about: string;
  zGrid: number[];
  /** The core's likelihood the eggs were emulated for (record.ts's
   *  `LIKELIHOOD_ID`), and the model the records are read under: a fit
   *  reading a file made under another knows its columns are another's. */
  likelihood: string;
  model: string;
  constants: Record<string, unknown>;
  counts: { lines: number; eggs: number; refused: number; unanswered: number; twice: number };
  checks: unknown[];
  eggs: unknown[];
}

/** Every line's egg that teaches, emulated; `checked` of them carry the
 *  app's own likelihood beside, for fit/tests/test_likelihood.py. */
export function emulate(lines: Line[], checked = CHECKED_EGGS): Emulated {
  const eggs: unknown[] = [];
  // The app's own likelihood for a few eggs, at a few time-scales, so the
  // fit's can be held to it (fit/tests/test_likelihood.py).
  const checks: unknown[] = [];
  let refused = 0;
  let silent = 0;
  // A pull and an import of the same cook's results file, pooled, hold the
  // eggs that were shared twice: the first line of each is kept, so put the
  // pull first and its tier wins. It is from the owner's file, and trusted,
  // if any copy of it was.
  let twice = 0;
  const seen = new Set<string>();
  const exported = new Set<string>();
  const vouched = new Set<string>();
  for (const line of lines) {
    if (readFitRecord(line.record) === null) continue;
    if (line.source === 'export') exported.add(eggKey(line));
    if (line.trusted === true) vouched.add(eggKey(line));
  }
  const start = freshCalibration(1, 1);
  const alphaMin = ALPHA_DEFAULT * Math.exp(ALPHA_REL_SD * Z_GRID[0]);
  const alphaMax = ALPHA_DEFAULT * Math.exp(ALPHA_REL_SD * Z_GRID[Z_GRID.length - 1]);
  for (const line of lines) {
    const read = readFitRecord(line.record);
    if (read === null || read.record.uid === null) { refused += 1; continue; }
    const r = read.record;
    const key = eggKey(line);
    if (seen.has(key)) { twice += 1; continue; }
    seen.add(key);
    if (!recordTeaches(r) && read.yolk === null) { silent += 1; continue; }
    const t = recordCookTime_s(r);
    const q = gridRequestFor(start, r, () => ({
      alphaMin: alphaMin, alphaMax: alphaMax, alphaCount: Z_GRID.length, timeMin_s: t, timeMax_s: t + 1, timeCount: 2,
    }));
    const g = buildDoseGrid(q.egg, q.setup, q.spec);
    const column = (table: number[]): number[] => Z_GRID.map((_, i) => table[i * 2]);
    if (checks.length < checked) {
      const target = logYolkTarget(r.level);
      const reading = r.probe === null ? null : r.probe.centre_C;
      checks.push({
        egg: eggs.length,
        particle: CHECK_PARTICLE,
        at: CHECK_Z.map((z) => {
          const p: Particle = { ...CHECK_PARTICLE, alpha_m2s: ALPHA_DEFAULT * Math.exp(ALPHA_REL_SD * z) };
          return {
            z: z,
            yolk: yolkProbit(g, p, t, target).map(withUnrelated),
            yolkWord: yolkWordProbit(g, p, t).map(withUnrelatedWord),
            white: whiteProbit(g, p, t).map(withUnrelated),
            probe: reading === null ? null : probeLikelihood(g, p, t, reading),
          };
        }),
      });
    }
    eggs.push({
      uid: r.uid, tier: line.tier, trusted: vouched.has(key), ...(exported.has(key) ? { source: 'export' } : {}),
      seq: line.seq, day: r.day, app: r.app, model: read.model,
      cook_s: t, level: r.level, logYolkTarget: logYolkTarget(r.level),
      yolk: read.yolk, yolkWord: r.yolkWord === null ? null : yolkWordIndex(r.yolkWord),
      white: r.white === null ? null : WHITE_REPORTS.indexOf(r.white),
      probe: r.probe === null ? null : r.probe.centre_C,
      logYolk: column(g.logYolk), logWhite: column(g.logWhite), peak: column(g.peakYolk_C),
      forecast: r.forecast,
    });
  }
  return {
    about: 'Emulated eggs for the fit (tools/eggs.ts emulate): for each egg that teaches, its log10 yolk and white doses and peak yolk temperature at its scored cook time, on zGrid, where alpha = alphaDefault * exp(alphaRelSd * z). The fit interpolates these.',
    zGrid: Z_GRID,
    likelihood: LIKELIHOOD_ID,
    model: MODEL_ID,
    constants: {
      alphaDefault: ALPHA_DEFAULT, alphaRelSd: ALPHA_REL_SD, feedbackBand: FEEDBACK_BAND, unrelated: UNRELATED,
      yolkWordCuts: YOLK_WORD_CUTS,
      whiteNoisePerYolk: Z_YOLK / Z_WHITE, logWhiteTarget: Math.log10(WHITE_DOSE_TARGET),
      probeInstrumentSd_C: PROBE_INSTRUMENT_SD_C, probeHandlingMean_C: PROBE_HANDLING_MEAN_C,
      probeUnrelated: PROBE_UNRELATED, probeUnrelatedSpan_C: PROBE_UNRELATED_SPAN_C,
      literature: LITERATURE_POPULATION,
    },
    counts: { lines: lines.length, eggs: eggs.length, refused: refused, unanswered: silent, twice: twice },
    checks: checks,
    eggs: eggs,
  };
}

/** A truth read from a file (`simulate --truth`): the population's nine
 *  numbers, each finite, the spreads positive. Throws on anything else. */
export function parseTruth(raw: unknown): Truth {
  const t = (raw !== null && typeof raw === 'object' && 'truth' in raw ? (raw as { truth: unknown }).truth : raw) as
    Record<string, unknown> | null;
  if (t === null || typeof t !== 'object') throw new Error('a truth is an object of the population\'s nine numbers');
  const out: Record<string, number> = {};
  for (const k of Object.keys(SIMULATED_TRUTH) as (keyof Truth)[]) {
    const v = t[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`a truth needs ${k}, a finite number`);
    if (k !== 'muZ' && k !== 'lag' && !(v > 0)) throw new Error(`a truth's ${k} must be above 0`);
    out[k] = v;
  }
  return out as unknown as Truth;
}
