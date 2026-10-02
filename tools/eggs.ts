/**
 * The fit's data (E7; INFERENCE.md section 9, COLLECTIVE.md section 1): the
 * shared eggs pulled down, simulated cooks with a known truth to check the
 * fit against, and the physics each egg needs, written out so the fit
 * (fit/, Python) never runs it.
 *
 *   npm run eggs -- pull <out.jsonl>
 *       every record in the live store, one per line: { tier, seq, record }.
 *       Needs NETLIFY_AUTH_TOKEN (a personal access token) and
 *       NETLIFY_SITE_ID. The output is people's eggs: it stays out of git
 *       (fit/data/ is ignored), and is deleted with the id when they ask.
 *   npm run eggs -- simulate <out.jsonl> <truth.json> [cooks] [seed]
 *       cooks drawn from a population whose answer is known, as records in
 *       the same shape, and the truth beside them.
 *   npm run eggs -- emulate <in.jsonl> <out.json>
 *       for every egg that teaches, its log yolk and white doses and its
 *       peak yolk temperature at the time it is scored at, on a grid of
 *       time-scales: the emulator the fit's likelihood interpolates.
 *
 * THE EMULATOR. A record's answers depend on the cook's time-scale through
 * the physics, and on everything else additively (INFERENCE.md section 3).
 * So for each egg one column is enough: the doses at its own cook time, at
 * 17 time-scales from -4 to +4 literature sds, `alpha = ALPHA_DEFAULT *
 * exp(ALPHA_REL_SD * z)`, which is uniform in log alpha, as the app's grids
 * are. Carryover and size scaling stay at the physics (INFERENCE.md section
 * 2): tauAirScale is 1, and the egg is the size the record says.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { ALPHA_DEFAULT, ALPHA_REL_SD, Z_WHITE, Z_YOLK } from '../src/core/constants.js';
import { buildDoseGrid } from '../src/core/doseGrid.js';
import { eggFromMass } from '../src/core/geometry.js';
import {
  FEEDBACK_BAND, Feedback, LITERATURE_POPULATION, PROBE_HANDLING_MEAN_C, PROBE_INSTRUMENT_SD_C,
  PROBE_UNRELATED, PROBE_UNRELATED_SPAN_C, Particle, UNRELATED, WhiteReport, probeLikelihood, whiteProbit,
  withUnrelated, yolkProbit,
} from '../src/core/infer.js';
import { CookSetup } from '../src/core/protocol.js';
import {
  EggRecord, MODEL_ID, RECORD_VERSION, gridRequestFor, freshCalibration, parseRecord, recordCookTime_s,
  recordMass_g, recordProbe_C, recordTeaches,
} from '../src/core/record.js';
import { DEFAULT_PARAMS, WHITE_DOSE_TARGET, donenessFromSlider, logYolkTarget, simulate, solveCookTime } from '../src/core/solve.js';
import { coolingSecondsFor } from '../src/core/policy.js';
import { normalCdf } from '../src/core/sphere.js';
import { NUDGE_MAX_S, nudgeSeconds } from '../src/core/decide.js';
import { appSetup, rng } from './common.js';

/** The time-scale axis of the emulator, in literature sds. */
const Z_GRID = Array.from({ length: 17 }, (_, i) => -4 + 0.5 * i);

/** A line of a records file: what the store holds, and where. */
interface Line {
  tier: 'attested' | 'open';
  seq: number;
  record: unknown;
}

function readLines(path: string): Line[] {
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Line);
}

function writeLines(path: string, lines: Line[]): void {
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
}

/* ------------------------------------------------------------------- pull */

async function pull(out: string): Promise<void> {
  const token = process.env['NETLIFY_AUTH_TOKEN'];
  const siteID = process.env['NETLIFY_SITE_ID'];
  if (token === undefined || siteID === undefined) {
    throw new Error('pull needs NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID');
  }
  const { getStore } = await import('@netlify/blobs');
  const store = getStore({ name: 'eggs', siteID: siteID, token: token, consistency: 'strong' });
  const { blobs } = await store.list({ prefix: 'records/' });
  const lines: Line[] = [];
  for (const b of blobs) {
    const m = /^records\/(attested|open)\/[^/]+\/(\d+)\.json$/.exec(b.key);
    if (m === null) continue;
    const text = await store.get(b.key, { type: 'text' });
    if (text === null) continue;
    lines.push({ tier: m[1] as Line['tier'], seq: Number(m[2]), record: JSON.parse(text) as unknown });
  }
  writeLines(out, lines);
  console.log(`${lines.length} records -> ${out}`);
}

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
  const cooling = pick(['ice', 'ice', 'tap', 'counter'] as const);
  const start = pick(['hot', 'hot', 'cold'] as const);
  const mass_g = pick([55, 62, 62, 68, 68, 75]);
  return {
    setup: appSetup({
      startMode: start, cooling: cooling, eggStart_C: u() < 0.8 ? 4 : 20,
      timeToBoil_s: start === 'cold' ? 420 + 120 * u() : 480,
      waterLitres: pick([1.5, 2, 2, 3]), eggCount: pick([1, 2, 2, 4]),
    }),
    mass_g: mass_g,
    massFrom: u() < 0.4 ? 'scale' : 'class',
    level: pick([0.22, 0.41, 0.41, 0.62, 0.8]),
  };
}

interface CookTruth {
  uid: string;
  tier: Line['tier'];
  z: number;
  taste: number;
  white: number;
  noise: number;
  gap: number;
}

function simulateCooks(out: string, truthOut: string, cooks: number, seed: number, t: Truth): void {
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
    const probes = kitchen.setup.cooling !== 'counter' && u() < 0.15;
    const alpha = ALPHA_DEFAULT * Math.exp(ALPHA_REL_SD * c.z);
    const eggs = 3 + Math.floor(u() * 8);
    for (let e = 0; e < eggs; e++) {
      const level = u() < 0.2 ? Math.min(1, Math.max(0, kitchen.level + (u() - 0.5) * 0.3)) : kitchen.level;
      const egg = eggFromMass(kitchen.mass_g / 1000);
      // Cooked at the literature's time for the level, nudged as a sharing
      // cook's is (E8): the fit sees eggs either side of the surface.
      const solved = solveCookTime(egg, kitchen.setup, DEFAULT_PARAMS, donenessFromSlider(level));
      const nudge = nudgeSeconds(u());
      const time = solved.result.cookTime_s + nudge;
      const truly = simulate(egg, kitchen.setup, { alpha_m2s: alpha, tauAirScale: 1 }, time);
      const target = logYolkTarget(level);
      const latent = Math.log10(truly.yolkDose_min) - (target + c.taste);
      const yp = [normalCdf((-FEEDBACK_BAND - latent) / c.noise), 0, normalCdf((latent - FEEDBACK_BAND) / c.noise)];
      yp[1] = Math.max(0, 1 - yp[0] - yp[2]);
      const wl = Math.log10(truly.whiteDose_min) - (logWhiteTarget + c.white);
      const sw = c.noise * whiteNoisePerYolk;
      const wp = [normalCdf(-wl / sw), 0, normalCdf((wl - c.gap) / sw)];
      wp[1] = Math.max(0, 1 - wp[0] - wp[2]);
      const answer = (p: number[]): number => {
        if (u() < UNRELATED) return Math.floor(u() * 3);
        const r = u();
        return r < p[0] ? 0 : r < p[0] + p[1] ? 1 : 2;
      };
      const yolk = u() < 0.9 ? (answer(yp) - 1) as Feedback : null;
      const white = u() < 0.8 ? (['runny', 'tender', 'firm'] as WhiteReport[])[answer(wp)] : null;
      let probe: EggRecord['probe'] = null;
      if (probes && e === 0) {
        const h = -PROBE_HANDLING_MEAN_C * Math.log(Math.max(u(), 1e-12));
        const reading = u() < PROBE_UNRELATED
          ? truly.peakYolk_C - PROBE_UNRELATED_SPAN_C / 2 + PROBE_UNRELATED_SPAN_C * u()
          : truly.peakYolk_C + PROBE_INSTRUMENT_SD_C * normal(u) - h;
        probe = { centre_C: recordProbe_C(reading), after_s: coolingSecondsFor(solved.result) };
      }
      const record: EggRecord = {
        v: RECORD_VERSION, uid: c.uid, day: `2026-11-${String(1 + (e % 28)).padStart(2, '0')}`,
        app: c.tier === 'attested' ? 'ios' : 'web', appVersion: 'simulated', prior: LITERATURE_POPULATION.id,
        model: MODEL_ID,
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
        cooled_s: kitchen.setup.cooling === 'counter' ? 0 : coolingSecondsFor(solved.result),
        yolk: yolk, white: white, probe: probe && probe.centre_C <= kitchen.setup.boiling_C ? probe : null,
        forecast: null, lang: 'en', register: 'modern', units: 'metric',
      };
      if (parseRecord(record) === null) throw new Error('a simulated record does not read');
      lines.push({ tier: c.tier, seq: e, record: record });
    }
  }
  writeLines(out, lines);
  writeFileSync(truthOut, JSON.stringify({ truth: t, cooks: truths, nudgeMax_s: NUDGE_MAX_S }, null, 2) + '\n');
  console.log(`${cooks} simulated cooks, ${lines.length} eggs -> ${out}; truth -> ${truthOut}`);
}

/* ---------------------------------------------------------------- emulate */

/** A particle for the likelihood checks: off-centre in every dimension. */
const CHECK_PARTICLE = { logDoseOffset: 0.05, tauAirScale: 1, noise: 0.23, whiteOffset: 0.1, whiteFirmGap: 0.9 };
const CHECK_Z = [-1.0, 0.0, 1.3];
const CHECKED_EGGS = 12;

function emulate(input: string, out: string): void {
  const lines = readLines(input);
  const eggs: unknown[] = [];
  // The app's own likelihood for a few eggs, at a few time-scales, so the
  // fit's can be held to it (fit/tests/test_likelihood.py).
  const checks: unknown[] = [];
  let refused = 0;
  let silent = 0;
  const start = freshCalibration(1, 1);
  const alphaMin = ALPHA_DEFAULT * Math.exp(ALPHA_REL_SD * Z_GRID[0]);
  const alphaMax = ALPHA_DEFAULT * Math.exp(ALPHA_REL_SD * Z_GRID[Z_GRID.length - 1]);
  for (const line of lines) {
    const r = parseRecord(line.record);
    if (r === null || r.uid === null) { refused += 1; continue; }
    if (!recordTeaches(r)) { silent += 1; continue; }
    const t = recordCookTime_s(r);
    const q = gridRequestFor(start, r, () => ({
      alphaMin: alphaMin, alphaMax: alphaMax, alphaCount: Z_GRID.length, timeMin_s: t, timeMax_s: t + 1, timeCount: 2,
    }));
    const g = buildDoseGrid(q.egg, q.setup, 1, q.spec);
    const column = (table: number[]): number[] => Z_GRID.map((_, i) => table[i * 2]);
    if (checks.length < CHECKED_EGGS) {
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
            white: whiteProbit(g, p, t).map(withUnrelated),
            probe: reading === null ? null : probeLikelihood(g, p, t, reading),
          };
        }),
      });
    }
    eggs.push({
      uid: r.uid, tier: line.tier, seq: line.seq, day: r.day, app: r.app, model: r.model,
      cook_s: t, level: r.level, logYolkTarget: logYolkTarget(r.level),
      yolk: r.yolk, white: r.white === null ? null : ['runny', 'tender', 'firm'].indexOf(r.white),
      probe: r.probe === null ? null : r.probe.centre_C,
      logYolk: column(g.logYolk), logWhite: column(g.logWhite), peak: column(g.peakYolk_C),
      forecast: r.forecast,
    });
  }
  const file = {
    about: 'Emulated eggs for the fit (tools/eggs.ts emulate): for each egg that teaches, its log10 yolk and white doses and peak yolk temperature at its scored cook time, on zGrid, where alpha = alphaDefault * exp(alphaRelSd * z). The fit interpolates these.',
    zGrid: Z_GRID,
    constants: {
      alphaDefault: ALPHA_DEFAULT, alphaRelSd: ALPHA_REL_SD, feedbackBand: FEEDBACK_BAND, unrelated: UNRELATED,
      whiteNoisePerYolk: Z_YOLK / Z_WHITE, logWhiteTarget: Math.log10(WHITE_DOSE_TARGET),
      probeInstrumentSd_C: PROBE_INSTRUMENT_SD_C, probeHandlingMean_C: PROBE_HANDLING_MEAN_C,
      probeUnrelated: PROBE_UNRELATED, probeUnrelatedSpan_C: PROBE_UNRELATED_SPAN_C,
      literature: LITERATURE_POPULATION,
    },
    counts: { lines: lines.length, eggs: eggs.length, refused: refused, unanswered: silent },
    checks: checks,
    eggs: eggs,
  };
  writeFileSync(out, JSON.stringify(file) + '\n');
  console.log(`${eggs.length} eggs emulated (${silent} unanswered, ${refused} refused) -> ${out}`);
}

/* ------------------------------------------------------------------- main */

const [, , command, a, b, c, d] = process.argv;
if (command === 'pull' && a !== undefined) {
  await pull(a);
} else if (command === 'simulate' && a !== undefined && b !== undefined) {
  simulateCooks(a, b, Number(c ?? 400), Number(d ?? 20261002), SIMULATED_TRUTH);
} else if (command === 'emulate' && a !== undefined && b !== undefined) {
  emulate(a, b);
} else {
  console.error('usage: npm run eggs -- pull <out.jsonl> | simulate <out.jsonl> <truth.json> [cooks] [seed] | emulate <in.jsonl> <out.json>');
  process.exit(2);
}
