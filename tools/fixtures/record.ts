/**
 * fixtures/record.json: the record (INFERENCE.md section 4): which records a
 * loader trusts, and a replayed log.
 */

import { eggFromMass } from '../../src/core/geometry.js';
import { CookSetup } from '../../src/core/protocol.js';
import {
  Calibration, EggRecord, PRIOR_ID, RECORD_VERSION, buildRequestedGrid, calibrationDoneness, copyCalibration,
  foldRecord, freshCalibration, gridRequestFor, parseRecord, recordCookTime_s, recordMass_g, recordProbe_C,
  recordTeaches, replay,
} from '../../src/core/record.js';
import { simulate, solveCookTime, donenessFromSlider, DEFAULT_PARAMS } from '../../src/core/solve.js';
import { COOLING_SECONDS, GridSpec, coolingSecondsFor, calibrationGrid } from '../../src/core/policy.js';

import { particleRows, setupOf } from './shared.js';

/* The record (INFERENCE.md section 4) and the replay built on it.
 *
 * Two things are pinned. First, which records a loader TRUSTS: a canonical
 * record, the variations version skew allows, and one breakage per rule, so a
 * port that forgets a check - or adds one - disagrees on a named case. Second,
 * the replay: a log of eight eggs from both apps - E1's, with their two-level
 * white, and E2's, answered either way or not at all - folded from a fresh prior
 * under E2's likelihood with every particle and weight written out after each
 * egg, and the tail of the same log folded again from the state after the second
 * egg, which is what a phone whose damaged log was dropped starts from.
 *
 * The grid is coarser than the app's: `calibrationGrid`'s BOUNDS, which are what
 * decide what the filter sees, at 7 x 9 instead of 21 x 32. The counts are
 * written out; a port rebuilds the same policy from them. The production grid's
 * geometry is pinned separately in policy.json. */

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
  yolk: EggRecord['yolk'];
  white: EggRecord['white'];
  /** A probe reading (E4), as degrees off the peak the literature values
   *  predict for this cook, so the fixture reads where a real one would. */
  probeOff_C?: number;
}

/* Realistic cooks: each recommended time is what the solver says for that egg
 * and pan at the literature values, so the surfaces sit where real ones would. */
function recordOf(e: EggSpec): EggRecord {
  const egg = eggFromMass(e.mass_g / 1000);
  const setup = setupOf(e.over);
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
    prior: PRIOR_ID,
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
    yolk: e.yolk,
    white: e.white,
    probe: probe,
    lang: 'en',
    register: 'modern',
    units: 'metric',
  };
}

const REPLAY_LOG: EggRecord[] = [
  // Soft, too soft, and the white was runny: both channels, from the prior.
  recordOf({
    app: 'web', mass_g: 62, massFrom: 'class', eggFrom: 'fridge', over: {},
    level: 0.3, pulledBy: 'cook', late_s: 7.25, yolk: -1, white: 'runny',
  }),
  // A cold start with a measured ramp; the white skipped.
  recordOf({
    app: 'ios', mass_g: 68.5, massFrom: 'scale', eggFrom: 'fridge',
    over: { startMode: 'cold', timeToBoil_s: 512.4 },
    level: 0.45, pulledBy: 'timeout', late_s: 0, yolk: 0, white: null,
  }),
  // Nobody answered. Still a record; it folds nothing and builds no surface.
  // Nor had anybody ever timed the pan.
  recordOf({
    app: 'web', mass_g: 58, massFrom: 'class', eggFrom: 'room', over: { eggStart_C: 20 },
    boilFrom: 'default',
    level: 0.5, pulledBy: 'timeout', late_s: 0, yolk: null, white: null,
  }),
  // Asked about the white, and skipped it.
  recordOf({
    app: 'web', mass_g: 55.3, massFrom: 'girth', eggFrom: 'custom',
    over: { eggStart_C: 8, cooling: 'tap' },
    level: 0.4, pulledBy: 'cook', late_s: 31.5, yolk: 1, white: null,
  }),
  // Rested on the counter, the only cook that reaches tauAirScale.
  recordOf({
    app: 'ios', mass_g: 67.3, massFrom: 'class', sizeTable: 'us', eggFrom: 'room',
    over: { eggStart_C: 20, cooling: 'counter' },
    level: 0.62, pulledBy: 'timeout', late_s: 0, yolk: 0, white: null,
  }),
  // The standing method, from a cold start, and a tender white.
  recordOf({
    app: 'web', mass_g: 60.2, massFrom: 'width', eggFrom: 'fridge',
    over: { startMode: 'cold', timeToBoil_s: 430, afterBoil: 'off', waterLitres: 1.5, eggCount: 2 },
    level: 0.5, pulledBy: 'cook', late_s: 2, yolk: -1, white: 'tender',
  }),
  // E2's: the white alone, tender, pulled late by the cook's own tap - scored
  // at the tap, 40 s after the alarm.
  recordOf({
    app: 'ios', mass_g: 68, massFrom: 'class', eggFrom: 'fridge', over: {},
    level: 0.22, pulledBy: 'cook', late_s: 40, yolk: null, white: 'tender',
  }),
  // Both, and a firm white at fudgy.
  recordOf({
    app: 'web', mass_g: 63, massFrom: 'scale', eggFrom: 'fridge', over: {},
    level: 0.62, pulledBy: 'cook', late_s: 5, yolk: 1, white: 'firm',
  }),
  // E4's: a probe reading a degree hot, with the yolk "just right".
  recordOf({
    app: 'ios', mass_g: 68, massFrom: 'scale', eggFrom: 'fridge', over: {},
    level: 0.41, pulledBy: 'cook', late_s: 3, yolk: 0, white: null, probeOff_C: 1.0,
  }),
  // And a reading alone, under a tap, cold - nothing else answered.
  recordOf({
    app: 'web', mass_g: 58, massFrom: 'class', eggFrom: 'fridge', over: { cooling: 'tap' },
    level: 0.3, pulledBy: 'timeout', late_s: 0, yolk: null, white: null, probeOff_C: -1.5,
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
 * each, the white target the next soft cook would be solved for (E3). */
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
      || b.tauAirScale !== a.tauAirScale || b.noise !== a.noise
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
  {
    why: 'nullable fields may be absent',
    mutate: (r) => { delete r['uid']; delete r['probe']; delete r['yolk']; delete r['white']; },
  },
  { why: 'a uid, once E6 mints one', mutate: (r) => { r['uid'] = '6f1c2a9e-2b1d-4c1e-9d6b-1a2b3c4d5e6f'; } },
  { why: 'an unanswered egg', mutate: (r) => { r['yolk'] = null; r['white'] = null; } },
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
  { why: 'a yolk answer out of range', mutate: (r) => { r['yolk'] = 2; } },
  { why: 'a yolk answer as a word', mutate: (r) => { r['yolk'] = 'soft'; } },
  { why: 'a white answer nobody offers', mutate: (r) => { r['white'] = 'rubbery'; } },
  { why: 'the two-level white E1 logged, gone with D1', mutate: (r) => { r['white'] = 'set'; } },
  { why: 'a probe reading (E4)', mutate: (r) => { r['probe'] = { centre_C: 61.3, after_s: 187 }; } },
  { why: 'a probe reading, when unknown', mutate: (r) => { r['probe'] = { centre_C: 61.3, after_s: null }; } },
  { why: 'a probe reading, when absent', mutate: (r) => { r['probe'] = { centre_C: 61.3 }; } },
  { why: 'a probe reading as cold as the ice', mutate: (r) => { r['probe'] = { centre_C: 2 }; } },
  { why: 'a probe reading at the boil', mutate: (r) => { r['probe'] = { centre_C: 100 }; } },
  { why: 'a probe reading colder than the ice', mutate: (r) => { r['probe'] = { centre_C: 1.9 }; } },
  { why: 'a probe reading past the boil', mutate: (r) => { r['probe'] = { centre_C: 100.01 }; } },
  { why: 'a bare number for a probe', mutate: (r) => { r['probe'] = 64.5; } },
  { why: 'a probe with no reading', mutate: (r) => { r['probe'] = {}; } },
  { why: 'a probe reading as a string', mutate: (r) => { r['probe'] = { centre_C: '61.3' }; } },
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
    yolk: parsed === null ? null : parsed.yolk,
    white: parsed === null ? null : parsed.white,
    probe: parsed === null ? null : parsed.probe,
  };
});
// A log is all or nothing: one bad record refuses the lot.
recordCases.push({
  why: 'not an object',
  record: [CANONICAL] as unknown as Record<string, unknown>,
  valid: parseRecord([CANONICAL]) !== null,
  yolk: null,
  white: null,
  probe: null,
});

export const recordFixture = {
  about: 'The record (INFERENCE.md section 4): which records a loader trusts, and a replayed log. src/core/record.ts.',
  version: RECORD_VERSION,
  prior: PRIOR_ID,
  cases: recordCases,
  massRounding: [0.048, 0.058, 0.068, 0.076, 0.0553017, 0.06849999, 0.0624449999].map((kg) => ({
    mass_kg: kg, mass_g: recordMass_g(kg),
  })),
  // A probe reading, typed in F and carried in C (E4).
  probeRounding: [147.2, 147.3, 150.1, 139.9, 180.5, 212].map((f) => (f - 32) * 5 / 9)
    .concat([64.005, 58.8849999, 61.3]).map((c) => ({ centre_C: c, record_C: recordProbe_C(c) })),
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
