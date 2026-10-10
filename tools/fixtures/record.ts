/**
 * fixtures/record.json: the record (INFERENCE.md section 4): which records a
 * loader trusts, and a replayed log; and the calibration grid's geometry and
 * the filter's size and seed.
 */

import { eggFromMass } from '../../src/core/geometry.js';
import { CookSetup } from '../../src/core/protocol.js';
import { GridSpec, buildRequestedGrid } from '../../src/core/doseGrid.js';
import {
  CALIBRATION_ALPHA_HIGH, CALIBRATION_ALPHA_LOW, CALIBRATION_SEED, Calibration, CookFacts, EggRecord, LIKELIHOOD_ID,
  MODEL_ID, PARTICLE_COUNT, RECORD_VERSION, RESULTS_FILE_VERSION, ResultsMeta, StoreRead, calibrationDoneness,
  calibrationGrid, copyCalibration, foldRecord, freshCalibration, gridRequestFor, loadDecision, parseRecord,
  probeReadingFor, recordCookTime_s, recordFor, recordMass_g, recordProbe_C, recordTeaches, replay, resultsFile,
  resultsFileName,
} from '../../src/core/record.js';
import { LITERATURE_POPULATION } from '../../src/core/infer.js';
import { simulate, solveCookTime, donenessFromSlider, DEFAULT_PARAMS } from '../../src/core/solve.js';
import { COOLING_SECONDS, coolingSecondsFor } from '../../src/core/running.js';

import { particleRows } from './shared.js';
import { referenceSetup } from '../common.js';

/* The record (INFERENCE.md section 4) and the replay built on it.
 *
 * Two things are pinned. First, which records a loader TRUSTS: a canonical
 * record, the variations today's shape allows, and one breakage per rule, so a
 * port that forgets a check - or adds one - disagrees on a named case. Second,
 * the replay: a log of fifteen eggs from both apps - answered or not, pulled by
 * the cook or by the clock, some with a probe reading, the yolk in the five
 * words - folded from a fresh prior with every particle and
 * weight written out after each egg, and the tail of the same log folded again
 * from the state after the second egg, which is what a phone whose damaged log
 * was dropped starts from.
 *
 * The grid is coarser than the app's: `calibrationGrid`'s BOUNDS, which are what
 * decide what the filter sees, at 7 x 9 instead of 21 x 32. The counts are
 * written out; a port rebuilds the same policy from them. The production grid's
 * geometry is pinned on its own, as `calibrationGrid` below. */

const REPLAY_GRID_ALPHA = 7;
const REPLAY_GRID_TIME = 9;
function replayGrid(alphaCentre: number, cookTime_s: number): GridSpec {
  const g = calibrationGrid(alphaCentre, cookTime_s);
  return { ...g, alphaCount: REPLAY_GRID_ALPHA, timeCount: REPLAY_GRID_TIME };
}

const REPLAY_PARTICLES = 64;
const REPLAY_SEED = 20260926;

interface EggSpec {
  app: 'web' | 'ios';
  mass_g: number;
  massFrom: EggRecord['egg']['massFrom'];
  sizeTable?: EggRecord['egg']['sizeTable'];
  boilFrom?: EggRecord['setup']['timeToBoilFrom'];
  eggFrom: EggRecord['setup']['eggFrom'];
  over: Partial<CookSetup>;
  level: number;
  pulledBy: EggRecord['pulledBy'];
  late_s: number;
  /** The yolk the cook got, in five words. */
  yolkWord: EggRecord['yolkWord'];
  white: EggRecord['white'];
  /** A probe reading, as degrees off the peak the literature values
   *  predict for this cook, so the fixture reads where a real one would. */
  probeOff_C?: number;
  /** What the app said at "Eggs in", as answer probabilities; none if absent. */
  forecast?: { yolk: number[]; white: number[]; yolkWord?: number[] };
}

/* Realistic cooks: each recommended time is what the solver says for that egg
 * and pan at the literature values, so the surfaces sit where real ones would. */
function recordOf(e: EggSpec): EggRecord {
  const egg = eggFromMass(e.mass_g / 1000);
  const setup = referenceSetup(e.over);
  const solved = solveCookTime(egg, setup, DEFAULT_PARAMS, donenessFromSlider(e.level)).result;
  const recommended = solved.cookTime_s;
  const probe = e.probeOff_C === undefined ? null : {
    centre_C: simulate(egg, setup, DEFAULT_PARAMS, recommended + e.late_s).peakYolk_C + e.probeOff_C,
    after_s: coolingSecondsFor(solved),
  };
  return {
    v: 1,
    uid: null,
    day: '2026-09-26',
    app: e.app,
    appVersion: '0.2.0',
    prior: LITERATURE_POPULATION.id,
    model: MODEL_ID,
    egg: {
      mass_g: recordMass_g(egg.mass_kg), massFrom: e.massFrom,
      sizeTable: e.massFrom === 'class' ? e.sizeTable ?? 'eu' : null,
    },
    setup: {
      startMode: setup.startMode,
      eggStart_C: setup.eggStart_C,
      eggFrom: e.eggFrom,
      ambient_C: setup.ambient_C,
      boiling_C: setup.boiling_C,
      timeToBoil_s: setup.timeToBoil_s,
      timeToBoilFrom: setup.startMode === 'cold' ? 'measured' : e.boilFrom ?? 'remembered',
      cooling: setup.cooling,
      afterBoil: setup.afterBoil ?? 'hold',
      waterLitres: setup.waterLitres,
      eggCount: setup.eggCount,
    },
    level: e.level,
    recommended_s: recommended,
    nudge_s: 0,
    pulled_s: recommended + e.late_s,
    pulledBy: e.pulledBy,
    cooled_s: setup.cooling === 'counter' ? 0 : probe !== null ? coolingSecondsFor(solved) : COOLING_SECONDS,
    yolkWord: e.yolkWord,
    white: e.white,
    probe: probe,
    forecast: e.forecast === undefined ? null : {
      cook_s: recommended, yolk: e.forecast.yolk, white: e.forecast.white, yolkWord: e.forecast.yolkWord ?? null,
    },
    lang: 'en',
    register: 'modern',
    units: 'metric',
  };
}

const REPLAY_LOG: EggRecord[] = [
  // Soft-ish, soft got, and the white was runny: both channels, from the prior.
  recordOf({
    app: 'web', mass_g: 62, massFrom: 'class', eggFrom: 'fridge', over: {},
    level: 0.3, pulledBy: 'cook', late_s: 7.25, yolkWord: 'soft', white: 'runny',
    forecast: { yolk: [0.25, 0.5, 0.25], white: [0.375, 0.5, 0.125] },
  }),
  // A cold start with a measured ramp; the white skipped.
  recordOf({
    app: 'ios', mass_g: 68.5, massFrom: 'scale', eggFrom: 'fridge',
    over: { startMode: 'cold', timeToBoil_s: 512.4 },
    level: 0.45, pulledBy: 'timeout', late_s: 0, yolkWord: 'jammy', white: null,
  }),
  // Nobody answered. Still a record; it folds nothing and builds no surface.
  // Nor had anybody ever timed the pan.
  recordOf({
    app: 'web', mass_g: 58, massFrom: 'class', eggFrom: 'room', over: { eggStart_C: 20 },
    boilFrom: 'default',
    level: 0.5, pulledBy: 'timeout', late_s: 0, yolkWord: null, white: null,
  }),
  // Firmer than asked, the white skipped.
  recordOf({
    app: 'web', mass_g: 55.3, massFrom: 'girth', eggFrom: 'custom',
    over: { eggStart_C: 8, cooling: 'tap' },
    level: 0.4, pulledBy: 'cook', late_s: 31.5, yolkWord: 'fudgy', white: null,
  }),
  // Rested on the counter, the only cook that reaches the carryover.
  recordOf({
    app: 'ios', mass_g: 67.3, massFrom: 'class', sizeTable: 'us', eggFrom: 'room',
    over: { eggStart_C: 20, cooling: 'counter' },
    level: 0.62, pulledBy: 'timeout', late_s: 0, yolkWord: 'fudgy', white: null,
  }),
  // The standing method, from a cold start, and a tender white.
  recordOf({
    app: 'web', mass_g: 60.2, massFrom: 'width', eggFrom: 'fridge',
    over: { startMode: 'cold', timeToBoil_s: 430, afterBoil: 'off', waterLitres: 1.5, eggCount: 2 },
    level: 0.5, pulledBy: 'cook', late_s: 2, yolkWord: 'soft', white: 'tender',
  }),
  // The white alone, tender, pulled late by the cook's own tap - scored
  // at the tap, 40 s after the alarm.
  recordOf({
    app: 'ios', mass_g: 68, massFrom: 'class', eggFrom: 'fridge', over: {},
    level: 0.22, pulledBy: 'cook', late_s: 40, yolkWord: null, white: 'tender',
  }),
  // Hard at fudgy, and a firm white.
  recordOf({
    app: 'web', mass_g: 63, massFrom: 'scale', eggFrom: 'fridge', over: {},
    level: 0.62, pulledBy: 'cook', late_s: 5, yolkWord: 'hard', white: 'firm',
  }),
  // A probe reading a degree hot, with the yolk jammy as asked.
  recordOf({
    app: 'ios', mass_g: 68, massFrom: 'scale', eggFrom: 'fridge', over: {},
    level: 0.41, pulledBy: 'cook', late_s: 3, yolkWord: 'jammy', white: null, probeOff_C: 1.0,
  }),
  // And a reading alone, under a tap, cold - nothing else answered.
  recordOf({
    app: 'web', mass_g: 58, massFrom: 'class', eggFrom: 'fridge', over: { cooling: 'tap' },
    level: 0.3, pulledBy: 'timeout', late_s: 0, yolkWord: null, white: null, probeOff_C: -1.5,
  }),
  // Soft asked for, runny got, a runny white: the owner's egg.
  recordOf({
    app: 'ios', mass_g: 58, massFrom: 'class', eggFrom: 'fridge', over: {},
    level: 0.22, pulledBy: 'cook', late_s: -12, yolkWord: 'runny', white: 'runny',
    forecast: { yolk: [0.25, 0.5, 0.25], white: [0.375, 0.5, 0.125], yolkWord: [0.125, 0.5, 0.25, 0.0625, 0.0625] },
  }),
  // Jammy asked for and got, with a probe reading.
  recordOf({
    app: 'web', mass_g: 66, massFrom: 'scale', eggFrom: 'fridge', over: {},
    level: 0.41, pulledBy: 'cook', late_s: 2, yolkWord: 'jammy', white: 'firm', probeOff_C: 0.5,
  }),
  // Fudgy asked for, hard got, a cold start; the white skipped.
  recordOf({
    app: 'web', mass_g: 63, massFrom: 'scale', eggFrom: 'fridge', over: { startMode: 'cold', timeToBoil_s: 450 },
    level: 0.62, pulledBy: 'timeout', late_s: 0, yolkWord: 'hard', white: null,
  }),
  // The yolk alone, soft, at hard: the far end of the scale.
  recordOf({
    app: 'ios', mass_g: 70, massFrom: 'scale', eggFrom: 'fridge', over: {},
    level: 1.0, pulledBy: 'cook', late_s: 0, yolkWord: 'soft', white: null,
  }),
  // And fudgy, at jammy.
  recordOf({
    app: 'web', mass_g: 62, massFrom: 'class', eggFrom: 'fridge', over: {},
    level: 0.41, pulledBy: 'cook', late_s: 20, yolkWord: 'fudgy', white: 'tender',
  }),
];

function calibrationRows(c: Calibration) {
  return {
    eggsLogged: c.eggsLogged,
    rng: c.posterior.rng,
    weights: c.posterior.weights.slice(),
    particles: particleRows(c.posterior),
  };
}

/* Egg by egg, the way an app folds them: a surface, then both answers. After
 * each, the white target the next soft cook would be solved for. */
const replayStart = freshCalibration(REPLAY_PARTICLES, REPLAY_SEED);
const replayState = copyCalibration(replayStart);
const replaySnapshots: Calibration[] = [];
const replaySteps = REPLAY_LOG.map((r) => {
  let spec: GridSpec | null = null;
  if (recordTeaches(r)) {
    const q = gridRequestFor(replayState, r, replayGrid);
    spec = q.spec;
    foldRecord(replayState, r, buildRequestedGrid(q));
  }
  replaySnapshots.push(copyCalibration(replayState));
  return {
    spec: spec,
    cookTime_s: recordCookTime_s(r),
    whiteDoseAtSoft: calibrationDoneness(replayState, 0.22).whiteDose_min,
    after: calibrationRows(replayState),
  };
});
const REPLAY_BASE_AFTER = 2;
const replayBase = replaySnapshots[REPLAY_BASE_AFTER - 1];
const replayed = replay(replayStart, REPLAY_LOG, replayGrid);
const fromBase = replay(replayBase, REPLAY_LOG.slice(REPLAY_BASE_AFTER), replayGrid);
// The fixture is only worth writing if the loop above IS the replay.
for (let i = 0; i < replayState.posterior.weights.length; i++) {
  const a = replayState.posterior.particles[i];
  for (const other of [replayed, fromBase]) {
    const b = other.posterior.particles[i];
    if (other.posterior.weights[i] !== replayState.posterior.weights[i]
      || b.alpha_m2s !== a.alpha_m2s || b.logDoseOffset !== a.logDoseOffset
      || b.noise !== a.noise
      || b.whiteOffset !== a.whiteOffset || b.whiteFirmGap !== a.whiteFirmGap
      || other.posterior.rng !== replayState.posterior.rng) {
      throw new Error('replay disagrees with the egg-by-egg fold');
    }
  }
}

/* One breakage per rule, each a mutation of the first record. */
const CANONICAL = REPLAY_LOG[0];
type Mutation = (r: Record<string, unknown>) => void;
function mutated(fn: Mutation): Record<string, unknown> {
  const r = JSON.parse(JSON.stringify(CANONICAL)) as Record<string, unknown>;
  fn(r);
  return r;
}
const eggPart = (r: Record<string, unknown>) => r['egg'] as Record<string, unknown>;
const setupPart = (r: Record<string, unknown>) => r['setup'] as Record<string, unknown>;

const RECORD_CASES: { why: string; mutate: Mutation }[] = [
  { why: 'canonical', mutate: () => {} },
  { why: 'an older app version, same schema', mutate: (r) => { r['appVersion'] = '0.1.0'; } },
  { why: 'from iOS, read in imperial', mutate: (r) => { r['app'] = 'ios'; r['units'] = 'imperial'; } },
  {
    why: 'fields from a later v1 are ignored',
    mutate: (r) => { r['futureField'] = 3; eggPart(r)['shell'] = 'brown'; },
  },
  { why: 'no uid field', mutate: (r) => { delete r['uid']; } },
  { why: 'no model field', mutate: (r) => { delete r['model']; } },
  { why: 'no yolk word field', mutate: (r) => { delete r['yolkWord']; } },
  { why: 'no white field', mutate: (r) => { delete r['white']; } },
  { why: 'no probe field', mutate: (r) => { delete r['probe']; } },
  { why: 'no forecast field', mutate: (r) => { delete r['forecast']; } },
  { why: 'no carton field on a weighed egg', mutate: (r) => { eggPart(r)['massFrom'] = 'scale'; delete eggPart(r)['sizeTable']; } },
  { why: 'a uid, as an uploaded copy carries one', mutate: (r) => { r['uid'] = '6f1c2a9e-2b1d-4c1e-9d6b-1a2b3c4d5e6f'; } },
  { why: 'a model of null', mutate: (r) => { r['model'] = null; } },
  { why: 'no forecast kept', mutate: (r) => { r['forecast'] = null; } },
  {
    why: 'a forecast whose answers sum to one in floating point',
    mutate: (r) => { r['forecast'] = { cook_s: 400.5, yolk: [0.1, 0.2, 0.7], white: [0.3, 0.6, 0.1], yolkWord: null }; },
  },
  { why: 'an empty model', mutate: (r) => { r['model'] = ''; } },
  { why: 'a model as a number', mutate: (r) => { r['model'] = 6; } },
  {
    why: 'a forecast that does not sum to one',
    mutate: (r) => { r['forecast'] = { cook_s: 400, yolk: [0.2, 0.5, 0.2], white: [0.3, 0.5, 0.2], yolkWord: null }; },
  },
  {
    why: 'a forecast with two answers',
    mutate: (r) => { r['forecast'] = { cook_s: 400, yolk: [0.5, 0.5], white: [0.3, 0.5, 0.2], yolkWord: null }; },
  },
  {
    why: 'a forecast with a probability past one',
    mutate: (r) => { r['forecast'] = { cook_s: 400, yolk: [1.5, -0.25, -0.25], white: [0.3, 0.5, 0.2], yolkWord: null }; },
  },
  {
    why: 'a forecast for no time',
    mutate: (r) => { r['forecast'] = { cook_s: 0, yolk: [0.2, 0.6, 0.2], white: [0.3, 0.5, 0.2], yolkWord: null }; },
  },
  { why: 'a forecast with no white', mutate: (r) => { r['forecast'] = { cook_s: 400, yolk: [0.2, 0.6, 0.2], yolkWord: null }; } },
  {
    why: 'a forecast with no yolk word field',
    mutate: (r) => { r['forecast'] = { cook_s: 400, yolk: [0.2, 0.6, 0.2], white: [0.3, 0.5, 0.2] }; },
  },
  { why: 'a forecast as a string', mutate: (r) => { r['forecast'] = '7/10'; } },
  { why: 'an unanswered egg', mutate: (r) => { r['yolkWord'] = null; r['white'] = null; } },
  { why: 'the white offered and skipped', mutate: (r) => { r['white'] = null; } },
  { why: 'a tender white (E2)', mutate: (r) => { r['white'] = 'tender'; } },
  { why: 'a firm white (E2)', mutate: (r) => { r['white'] = 'firm'; } },
  {
    why: 'a weighed egg names no carton',
    mutate: (r) => { eggPart(r)['massFrom'] = 'scale'; eggPart(r)['sizeTable'] = null; },
  },
  { why: 'an American Large', mutate: (r) => { eggPart(r)['mass_g'] = 60.2; eggPart(r)['sizeTable'] = 'us'; } },
  { why: 'a nudge that leaves a cook', mutate: (r) => { r['nudge_s'] = -10; } },
  { why: 'another schema version', mutate: (r) => { r['v'] = 2; } },
  { why: 'no schema version', mutate: (r) => { delete r['v']; } },
  { why: 'an empty uid', mutate: (r) => { r['uid'] = ''; } },
  { why: 'an id: the moment the cook started', mutate: (r) => { r['id'] = 1759700000123; } },
  { why: 'an id of null', mutate: (r) => { r['id'] = null; } },
  { why: 'an id as a string', mutate: (r) => { r['id'] = '1759700000123'; } },
  { why: 'an id of zero', mutate: (r) => { r['id'] = 0; } },
  { why: 'a negative id', mutate: (r) => { r['id'] = -1759700000123; } },
  { why: 'an id in fractions of a millisecond', mutate: (r) => { r['id'] = 1759700000123.5; } },
  { why: 'a day that is not YYYY-MM-DD', mutate: (r) => { r['day'] = '2026-9-26'; } },
  { why: 'a timestamp, not a day', mutate: (r) => { r['day'] = '2026-09-26T07:30'; } },
  { why: 'a pan nobody timed', mutate: (r) => { setupPart(r)['timeToBoilFrom'] = 'default'; } },
  { why: 'an unknown boil source', mutate: (r) => { setupPart(r)['timeToBoilFrom'] = 'guessed'; } },
  { why: 'no boil source', mutate: (r) => { delete setupPart(r)['timeToBoilFrom']; } },
  { why: 'an unknown app', mutate: (r) => { r['app'] = 'android'; } },
  { why: 'an empty app version', mutate: (r) => { r['appVersion'] = ''; } },
  { why: 'no prior', mutate: (r) => { delete r['prior']; } },
  { why: 'a massless egg', mutate: (r) => { eggPart(r)['mass_g'] = 0; } },
  { why: 'a mass as a string', mutate: (r) => { eggPart(r)['mass_g'] = '62'; } },
  { why: 'a mass as null', mutate: (r) => { eggPart(r)['mass_g'] = null; } },
  { why: 'an unknown mass source', mutate: (r) => { eggPart(r)['massFrom'] = 'guess'; } },
  { why: 'a class with no carton', mutate: (r) => { delete eggPart(r)['sizeTable']; } },
  { why: 'a carton nobody has', mutate: (r) => { eggPart(r)['sizeTable'] = 'uk'; } },
  {
    why: 'a carton on a weighed egg',
    mutate: (r) => { eggPart(r)['massFrom'] = 'scale'; eggPart(r)['sizeTable'] = 'eu'; },
  },
  { why: 'no setup', mutate: (r) => { delete r['setup']; } },
  { why: 'an unknown start', mutate: (r) => { setupPart(r)['startMode'] = 'warm'; } },
  { why: 'an unknown egg source', mutate: (r) => { setupPart(r)['eggFrom'] = 'freezer'; } },
  { why: 'no ambient', mutate: (r) => { delete setupPart(r)['ambient_C']; } },
  { why: 'a boiling point of zero', mutate: (r) => { setupPart(r)['boiling_C'] = 0; } },
  { why: 'a negative time to boil', mutate: (r) => { setupPart(r)['timeToBoil_s'] = -1; } },
  { why: 'no water', mutate: (r) => { setupPart(r)['waterLitres'] = 0; } },
  { why: 'no eggs in the pan', mutate: (r) => { setupPart(r)['eggCount'] = 0; } },
  { why: 'an unknown cooling', mutate: (r) => { setupPart(r)['cooling'] = 'snow'; } },
  { why: 'an unknown burner', mutate: (r) => { setupPart(r)['afterBoil'] = 'simmer'; } },
  { why: 'a level past hard', mutate: (r) => { r['level'] = 1.5; } },
  { why: 'a level as a boolean', mutate: (r) => { r['level'] = true; } },
  { why: 'no recommendation', mutate: (r) => { r['recommended_s'] = 0; } },
  {
    why: 'a nudge that cancels the cook',
    mutate: (r) => { r['nudge_s'] = -(r['recommended_s'] as number); },
  },
  { why: 'a pull at zero', mutate: (r) => { r['pulled_s'] = 0; } },
  { why: 'an unknown puller', mutate: (r) => { r['pulledBy'] = 'alarm'; } },
  { why: 'negative cooling', mutate: (r) => { r['cooled_s'] = -1; } },
  { why: 'the yolk the cook got: runny', mutate: (r) => { r['yolkWord'] = 'runny'; } },
  { why: 'each of the five yolk words, hard', mutate: (r) => { r['yolkWord'] = 'hard'; } },
  { why: 'a fudgy yolk', mutate: (r) => { r['yolkWord'] = 'fudgy'; } },
  { why: 'the yolk word skipped', mutate: (r) => { r['yolkWord'] = null; } },
  { why: 'a yolk word nobody offers', mutate: (r) => { r['yolkWord'] = 'medium'; } },
  { why: 'a yolk word as a number', mutate: (r) => { r['yolkWord'] = 2; } },
  { why: 'a yolk word in capitals', mutate: (r) => { r['yolkWord'] = 'Jammy'; } },
  {
    why: 'a forecast of the five yolk words',
    mutate: (r) => {
      r['forecast'] = {
        cook_s: 400, yolk: [0.2, 0.6, 0.2], white: [0.3, 0.5, 0.2], yolkWord: [0.0625, 0.25, 0.5, 0.125, 0.0625],
      };
    },
  },
  {
    why: 'a forecast of the yolk words as null',
    mutate: (r) => { r['forecast'] = { cook_s: 400, yolk: [0.2, 0.6, 0.2], white: [0.3, 0.5, 0.2], yolkWord: null }; },
  },
  {
    why: 'a forecast of four yolk words',
    mutate: (r) => {
      r['forecast'] = { cook_s: 400, yolk: [0.2, 0.6, 0.2], white: [0.3, 0.5, 0.2], yolkWord: [0.25, 0.25, 0.25, 0.25] };
    },
  },
  {
    why: 'a forecast of yolk words that does not sum to one',
    mutate: (r) => {
      r['forecast'] = { cook_s: 400, yolk: [0.2, 0.6, 0.2], white: [0.3, 0.5, 0.2], yolkWord: [0.2, 0.2, 0.2, 0.2, 0.1] };
    },
  },
  { why: 'a white answer nobody offers', mutate: (r) => { r['white'] = 'rubbery'; } },
  { why: 'the two-level white E1 logged, gone with D1', mutate: (r) => { r['white'] = 'set'; } },
  { why: 'a probe reading (E4)', mutate: (r) => { r['probe'] = { centre_C: 61.3, after_s: 187 }; } },
  { why: 'a probe reading, when unknown', mutate: (r) => { r['probe'] = { centre_C: 61.3, after_s: null }; } },
  { why: 'a probe reading with no when field', mutate: (r) => { r['probe'] = { centre_C: 61.3 }; } },
  { why: 'a probe reading as cold as the ice', mutate: (r) => { r['probe'] = { centre_C: 2, after_s: null }; } },
  { why: 'a probe reading at the boil', mutate: (r) => { r['probe'] = { centre_C: 100, after_s: null }; } },
  { why: 'a probe reading colder than the ice', mutate: (r) => { r['probe'] = { centre_C: 1.9, after_s: null }; } },
  { why: 'a probe reading past the boil', mutate: (r) => { r['probe'] = { centre_C: 100.01, after_s: null }; } },
  { why: 'a bare number for a probe', mutate: (r) => { r['probe'] = 64.5; } },
  { why: 'a probe with no reading', mutate: (r) => { r['probe'] = { after_s: null }; } },
  { why: 'a probe reading as a string', mutate: (r) => { r['probe'] = { centre_C: '61.3', after_s: null }; } },
  { why: 'a probe asked for before the pull', mutate: (r) => { r['probe'] = { centre_C: 61.3, after_s: -1 }; } },
  { why: 'no language', mutate: (r) => { r['lang'] = ''; } },
  { why: 'an unknown unit system', mutate: (r) => { r['units'] = 'kelvin'; } },
];

const recordCases = RECORD_CASES.map((c) => {
  const record = mutated(c.mutate);
  const parsed = parseRecord(record);
  return {
    why: c.why,
    record: record,
    valid: parsed !== null,
    id: parsed === null ? null : parsed.id ?? null,
    yolkWord: parsed === null ? null : parsed.yolkWord,
    white: parsed === null ? null : parsed.white,
    probe: parsed === null ? null : parsed.probe,
    model: parsed === null ? null : parsed.model,
    forecast: parsed === null ? null : parsed.forecast,
  };
});
// A log is all or nothing: one bad record refuses the lot.
recordCases.push({
  why: 'not an object',
  record: [CANONICAL] as unknown as Record<string, unknown>,
  valid: parseRecord([CANONICAL]) !== null,
  id: null,
  yolkWord: null,
  white: null,
  probe: null,
  model: null,
  forecast: null,
});

/* The results file: the same store makes the same file in
 * both apps, character for character. A store spliced in as it is, a missing
 * store, damaged and bare stores kept as strings, and every character the
 * escaping treats specially. */
const STORE_TEXT = JSON.stringify({ v: 4, p: LITERATURE_POPULATION.id, m: LIKELIHOOD_ID, folded: 1, log: [REPLAY_LOG[0]] });
const RESULTS_CASES: { meta: ResultsMeta; stored: string | null }[] = [
  {
    meta: { app: 'web', appVersion: '0.4.0-alpha.1', exported: '2026-10-05T09:41:07.250Z', population: LITERATURE_POPULATION.id, uid: null },
    stored: STORE_TEXT,
  },
  {
    meta: { app: 'ios', appVersion: '0.4.0', exported: '2026-10-05T09:41:07Z', population: '2026-11', uid: '0f8fad5b-d9cb-469f-a165-70867728950e' },
    stored: null,
  },
  {
    meta: { app: 'web', appVersion: 'a"b\\c/d\n\r\t\b\f\u0000\u007f’', exported: 'x', population: 'p', uid: 'u' },
    stored: '[1,2.5,-0.0001,1e+21]',
  },
  { meta: { app: 'ios', appVersion: '0.5.0', exported: 'x', population: 'p', uid: null }, stored: '{not json' },
  { meta: { app: 'ios', appVersion: '0.5.0', exported: 'x', population: 'p', uid: null }, stored: '{"v":5,"log":[{"a/b":"‘café’"}]}' },
  { meta: { app: 'web', appVersion: '0.5.0', exported: 'x', population: 'p', uid: null }, stored: '17' },
  { meta: { app: 'web', appVersion: '0.5.0', exported: 'x', population: 'p', uid: null }, stored: '' },
  {
    meta: { app: 'web', appVersion: '0.5.0', exported: 'x', population: 'p', uid: null },
    stored: 'tab\there "quoted" back\\slash \u0001\u001f',
  },
];

/* The record made from a cook's facts (`recordFor`): what both apps write
 * down, for every branch - the boil tapped or not, a pull tapped late, on
 * time, early or not at all, each cooling, a probe reading or none, the
 * answers given or not, a measured room, the web's `id`
 * and iOS's none. Sous-vide runs no cook in either app, so it makes no
 * record. Each case is a change to one base cook. */
const FACTS_BASE: CookFacts = {
  app: 'web', appVersion: '0.5.0-alpha.1', prior: LITERATURE_POPULATION.id, day: '2026-10-06',
  id: 1759737600123, mass_kg: 0.0624449999, massFrom: 'scale', sizeTable: null,
  setup: referenceSetup({ timeToBoil_s: 480, afterBoil: 'hold' }), eggFrom: 'fridge', boilRemembered: true, level: 0.41,
  cook_s: 402.75, nudge_s: 0, out_s: 409.517, cool_s: 187.25,
  yolkWord: null, white: null, probe: null, forecast: null, lang: 'en', units: 'metric',
};
const FORECAST_FIVE = {
  cook_s: 402.75, yolk: [0.25, 0.5, 0.25], white: [0.125, 0.375, 0.5], yolkWord: [0.0625, 0.25, 0.5, 0.125, 0.0625],
};
/** The pot with no word of what the burner did, as an older ticket has it. */
function noBurner(): CookSetup {
  const s = referenceSetup({});
  delete s.afterBoil;
  return s;
}
const FACTS_CASES: { why: string; over: Partial<CookFacts> }[] = [
  { why: 'a hot start on a remembered pan, tapped out late, from the web', over: {} },
  { why: 'from iOS, which keeps no id', over: { app: 'ios', appVersion: '0.5.0+1', id: null } },
  { why: 'a hot start on a pan nobody timed', over: { boilRemembered: false } },
  {
    why: 'a cold start tapped after a late correction to cold: the remembered pan',
    over: { setup: referenceSetup({ startMode: 'cold', timeToBoil_s: 480 }), boilTapped: false, cook_s: 912.5 },
  },
  {
    why: 'a cold start, its boil tapped: measured whatever was remembered',
    over: { setup: referenceSetup({ startMode: 'cold', timeToBoil_s: 512.4 }), boilRemembered: false, cook_s: 912.5 },
  },
  {
    why: 'a cold start with the heat off',
    over: {
      setup: referenceSetup({ startMode: 'cold', timeToBoil_s: 431.5, afterBoil: 'off', waterLitres: 1.5 }),
      cook_s: 870.25, out_s: 871,
    },
  },
  { why: 'a pot that does not say what the burner did: held', over: { setup: noBurner() } },
  { why: 'pulled when the alarm went: tapped on time', over: { out_s: 402.75 } },
  { why: 'tapped before the schedule', over: { out_s: 395.5 } },
  { why: 'nobody tapped: the grace ran out', over: { out_s: null } },
  { why: 'a tap at egg-in measures nothing', over: { out_s: 0 } },
  { why: 'under the tap', over: { setup: referenceSetup({ cooling: 'tap' }), cool_s: 240.5 } },
  { why: 'rested on the counter: no counted cooling', over: { setup: referenceSetup({ cooling: 'counter' }), out_s: null } },
  { why: 'rested on the counter, tapped out', over: { setup: referenceSetup({ cooling: 'counter' }) } },
  { why: 'nudged later', over: { nudge_s: 10, cook_s: 412.75 } },
  { why: 'nudged sooner, and nobody tapped', over: { nudge_s: -7, cook_s: 395.75, out_s: null } },
  { why: 'the yolk the cook got and the white', over: { yolkWord: 'jammy', white: 'firm' } },
  { why: 'the yolk alone', over: { yolkWord: 'runny' } },
  { why: 'the white alone', over: { white: 'tender' } },
  { why: 'a probe reading alone', over: { probe: { centre_C: 64.13, after_s: 11.983 } } },
  { why: 'a probe reading with no when', over: { probe: { centre_C: 63.99, after_s: null }, yolkWord: 'soft' } },
  { why: 'what the app said at Eggs in', over: { forecast: FORECAST_FIVE, yolkWord: 'fudgy', white: 'runny' } },
  {
    why: 'a forecast from before the five yolk words',
    over: { forecast: { cook_s: 402.75, yolk: [0.25, 0.5, 0.25], white: [0.125, 0.375, 0.5], yolkWord: null } },
  },
  { why: 'a European class', over: { massFrom: 'class', sizeTable: 'eu', mass_kg: 0.068 } },
  { why: 'an American class', over: { massFrom: 'class', sizeTable: 'us', mass_kg: 0.0602 } },
  { why: 'a class with no carton named: the European', over: { massFrom: 'class', sizeTable: null, mass_kg: 0.058 } },
  { why: 'weighed, with a carton on file: none named', over: { massFrom: 'scale', sizeTable: 'us' } },
  { why: 'measured round the middle', over: { massFrom: 'girth', mass_kg: 0.0553017 } },
  { why: 'measured across', over: { massFrom: 'width', mass_kg: 0.06849999 } },
  {
    why: 'a measured room, and an egg left out in it',
    over: { setup: referenceSetup({ eggStart_C: 23.5, ambient_C: 23.5 }), eggFrom: 'room' },
  },
  { why: 'a typed egg temperature', over: { setup: referenceSetup({ eggStart_C: 8 }), eggFrom: 'custom' } },
  { why: 'read in the English of 1750, in Imperial', over: { lang: 'en-x-1750', units: 'imperial' } },
  { why: 'the far end of the slider', over: { level: 1, out_s: null } },
];
const factsCases = FACTS_CASES.map((c) => {
  const facts: CookFacts = { ...FACTS_BASE, ...c.over };
  const record = recordFor(facts);
  if (parseRecord(JSON.parse(JSON.stringify(record))) === null) {
    throw new Error(`recordFor made a record no loader reads: ${c.why}`);
  }
  return { why: c.why, facts: facts, record: record };
});

/* A probe reading's "when" (`probeReadingFor`), against a measured pull and
 * an assumed one: after the moment scored as the pull, at it, before it,
 * and with no counted cooling. A reading typed in F. */
const PROBE_F_IN_C = (147.3 - 32) * 5 / 9;
const probeWhen = [recordFor(FACTS_BASE), recordFor({ ...FACTS_BASE, out_s: null })].flatMap(
  (r) => [null, 600.5, recordCookTime_s(r), 405].map((coolEnd_s) => ({
    record: r, centre_C: PROBE_F_IN_C, coolEnd_s: coolEnd_s, probe: probeReadingFor(r, PROBE_F_IN_C, coolEnd_s),
  })),
);

/* What a launch makes of the store it read (`loadDecision`): every path, and
 * which wins where two apply. The build's own population and likelihood are
 * named here, not taken from the code, so a new `LIKELIHOOD_ID` does not move
 * these. Each case is a change to a sound store of three records, two folded. */
const LOAD_POPULATION = 'this-population';
const LOAD_LIKELIHOOD = 'this-likelihood';
const SOUND_STORE: StoreRead = {
  readable: true, base: null, posterior: true, folded: 2, records: 3, population: LOAD_POPULATION, likelihood: LOAD_LIKELIHOOD,
};
const NOT_A_STORE: Partial<StoreRead> = {
  readable: false, base: null, posterior: false, folded: null, records: null, population: null, likelihood: null,
};
const LOAD_CASES: { why: string; over: Partial<StoreRead> }[] = [
  { why: 'nothing stored, or nothing of this format: dropped', over: { ...NOT_A_STORE } },
  { why: 'loaded, two of three folded', over: {} },
  { why: 'loaded, every record folded', over: { folded: 3 } },
  { why: 'loaded, an empty log', over: { folded: 0, records: 0 } },
  { why: 'loaded on a base', over: { base: 'sound' } },
  { why: 'the log unreadable: the posterior becomes the base', over: { records: null } },
  { why: 'the log unreadable on a base: the posterior still', over: { records: null, base: 'sound' } },
  { why: 'the log unreadable, the posterior damaged: the base', over: { records: null, posterior: false, base: 'sound' } },
  { why: 'the log unreadable, nothing sound: the prior', over: { records: null, posterior: false, base: 'damaged' } },
  { why: 'the log unreadable, another likelihood: still rebased', over: { records: null, likelihood: 'another-likelihood' } },
  { why: 'the posterior damaged: the log again from the prior', over: { posterior: false } },
  { why: 'the posterior damaged on a base: the log again from the base', over: { posterior: false, base: 'sound' } },
  { why: 'the base damaged: dropped, and the log again from the prior', over: { base: 'damaged' } },
  { why: 'the count damaged', over: { folded: null } },
  { why: 'drawn from another population', over: { population: 'another-population' } },
  { why: 'folded under another likelihood', over: { likelihood: 'another-likelihood' } },
  { why: 'no likelihood named', over: { likelihood: null } },
  { why: 'no population named', over: { population: null } },
  { why: 'another likelihood, on a base: the base stays', over: { likelihood: 'another-likelihood', base: 'sound' } },
  { why: 'a posterior ahead of its log: rebased on it', over: { folded: 4 } },
  { why: 'ahead of an empty log', over: { folded: 1, records: 0 } },
  { why: 'ahead, on a base: the posterior becomes the base', over: { folded: 4, base: 'sound' } },
  { why: 'ahead, and another likelihood: replayed first', over: { folded: 4, likelihood: 'another-likelihood' } },
];
const loadCases = LOAD_CASES.map((c) => {
  const read: StoreRead = { ...SOUND_STORE, ...c.over };
  return { why: c.why, read: read, decision: loadDecision(read, LOAD_POPULATION, LOAD_LIKELIHOOD) };
});

export const recordFixture = {
  about: 'The record (INFERENCE.md section 4): which records a loader trusts, and a replayed log. src/core/record.ts.',
  version: RECORD_VERSION,
  prior: LITERATURE_POPULATION.id,
  model: MODEL_ID,
  likelihood: LIKELIHOOD_ID,
  cases: recordCases,
  massRounding: [0.048, 0.058, 0.068, 0.076, 0.0553017, 0.06849999, 0.0624449999].map((kg) => ({
    mass_kg: kg, mass_g: recordMass_g(kg),
  })),
  // A probe reading, typed in F and carried in C.
  probeRounding: [147.2, 147.3, 150.1, 139.9, 180.5, 212].map((f) => (f - 32) * 5 / 9)
    .concat([64.005, 58.8849999, 61.3]).map((c) => ({ centre_C: c, record_C: recordProbe_C(c) })),
  // What both apps write down for a cook (`recordFor`), and a probe
  // reading's when (`probeReadingFor`).
  made: factsCases,
  probeWhen: probeWhen,
  // What a launch makes of the store it read (`loadDecision`), for a build
  // of this population and likelihood.
  load: { population: LOAD_POPULATION, likelihood: LOAD_LIKELIHOOD, cases: loadCases },
  resultsFile: {
    version: RESULTS_FILE_VERSION,
    names: ['2026-10-05', '2027-01-31'].map((day) => ({ day: day, name: resultsFileName(day) })),
    cases: RESULTS_CASES.map((c) => ({ ...c, file: resultsFile(c.meta, c.stored) })),
  },
  // The grid one logged outcome is learned on in the apps, with its alpha
  // factors by name, and the filter's size and seed: both apps must agree,
  // or two identical kitchens learn two things from the same egg.
  calibrationGrid: {
    alphaLow: CALIBRATION_ALPHA_LOW,
    alphaHigh: CALIBRATION_ALPHA_HIGH,
    cases: [
      { alphaCentre: 1.4e-7, cookTime_s: 441 },
      { alphaCentre: 1.4e-7, cookTime_s: 60 },
      { alphaCentre: 1.4e-7, cookTime_s: 120 },
      { alphaCentre: 2.0e-7, cookTime_s: 800 },
    ].map((c) => {
      const g = calibrationGrid(c.alphaCentre, c.cookTime_s);
      return {
        alphaCentre: c.alphaCentre,
        cookTime_s: c.cookTime_s,
        alphaMin: g.alphaMin,
        alphaMax: g.alphaMax,
        alphaCount: g.alphaCount,
        timeMin_s: g.timeMin_s,
        timeMax_s: g.timeMax_s,
        timeCount: g.timeCount,
      };
    }),
  },
  calibration: { particles: PARTICLE_COUNT, seed: CALIBRATION_SEED },
  replay: {
    grid: { alphaCount: REPLAY_GRID_ALPHA, timeCount: REPLAY_GRID_TIME },
    start: { count: REPLAY_PARTICLES, seed: REPLAY_SEED },
    log: REPLAY_LOG,
    steps: replaySteps,
    // The tail of the log folded again from the state after egg 2, standing in
    // for a migrated phone's frozen base.
    fromBase: {
      after: REPLAY_BASE_AFTER,
      base: calibrationRows(replayBase),
      final: calibrationRows(fromBase),
    },
  },
};
