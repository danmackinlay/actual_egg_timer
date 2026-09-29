/**
 * fixtures/reach.json: the odds at every level, the verdict with them, the
 * answer at a level, the shading, the advice.
 */

import { eggFromMass } from '../../src/core/geometry.js';
import { buildDoseGrid } from '../../src/core/doseGrid.js';
import { CookSetup } from '../../src/core/protocol.js';
import { Calibration, calibrationParams } from '../../src/core/record.js';
import { decisionGridSpec, decisionInputs } from '../../src/core/decide.js';
import {
  ADVICE_BELOW_TENTHS, ADVICE_GAIN, ADVICE_MARGIN_TENTHS, OddsProfile, PROFILE_STEP, REACH_ODDS,
  SHADE_BEST_MIN, adviceWanted, answerAt, oddsNear, oddsProfile, pricedChanges, protocolAdvice, shadingOf,
  unpricedAdvice, verdictWithOdds,
} from '../../src/core/reach.js';
import { Solution } from '../../src/core/solve.js';
import { GridSpec } from '../../src/core/policy.js';

import { setupOf } from './shared.js';
import { DECIDE_EGG, DECIDE_SETUP, decidePosteriors } from './decide.js';

/* The odds at every level, the range they allow, the verdict with that range,
 * the shading and the advice (src/core/reach.ts). A profile is a solve and a
 * decision per level, so both apps must walk the same levels in the same
 * order and land on the same ends. The surfaces are coarse, as decide.json's
 * is, and built per pot from the production spec; the posteriors are
 * decide.json's. */

function coarseDecisionGrid(c: Calibration, egg: ReturnType<typeof eggFromMass>, setup: CookSetup) {
  const full = decisionGridSpec(decisionInputs(c, egg, setup));
  const count = Math.ceil((full.timeMax_s - full.timeMin_s) / 20) + 1;
  const spec: GridSpec = { ...full, alphaCount: 7, timeMax_s: full.timeMin_s + 20 * (count - 1), timeCount: count };
  const tauAirScale = calibrationParams(c).tauAirScale;
  const grid = buildDoseGrid(
    egg, setup, tauAirScale, spec.alphaMin, spec.alphaMax, spec.alphaCount,
    spec.timeMin_s, spec.timeMax_s, spec.timeCount,
  );
  return { spec: spec, tauAirScale: tauAirScale, grid: grid };
}

const REACH_CASES: { posterior: string; setup: CookSetup }[] = [
  { posterior: 'prior', setup: DECIDE_SETUP },
  { posterior: 'learned', setup: DECIDE_SETUP },
  { posterior: 'learned', setup: setupOf({ timeToBoil_s: 480, eggCount: 2, cooling: 'counter' }) },
];

/* The answer at a level (`answerAt`): the solve, the verdict, and the retry
 * at the level it snaps to. Each profile's pot is asked at levels inside and
 * outside its range, with and without its odds, and with the retry on and off. */
const reachAnswers: unknown[] = [];

const reachProfiles = REACH_CASES.map((rc, index) => {
  const pz = decidePosteriors.find((x) => x.name === rc.posterior);
  if (pz === undefined) throw new Error(rc.posterior);
  const c: Calibration = { posterior: pz.post, eggsLogged: pz.eggsLogged };
  const g = coarseDecisionGrid(c, DECIDE_EGG, rc.setup);
  const profile = oddsProfile(c, DECIDE_EGG, rc.setup, g.grid);
  for (const withOdds of [false, true]) {
    for (const level of [0, 0.05, 0.41, 0.95, 1]) {
      for (const snapRetry of [true, false]) {
        const a = answerAt(c, DECIDE_EGG, rc.setup, level, withOdds ? profile : null, snapRetry);
        reachAnswers.push({
          profile: index, withOdds: withOdds, level: level, snapRetry: snapRetry,
          kind: a.verdict.kind, snapTo: a.verdict.snapTo, answeredLevel: a.level,
          reachable: a.solution.reachable, cookTime_s: a.solution.result.cookTime_s,
        });
      }
    }
  }
  return {
    posterior: rc.posterior,
    eggsLogged: pz.eggsLogged,
    egg: { mass_kg: DECIDE_EGG.mass_kg },
    setup: rc.setup,
    grid: { tauAirScale: g.tauAirScale, ...g.spec },
    profile: profile,
    shading: shadingOf(profile),
    near: [0, 0.13, 0.41, 0.625, 0.99, 1].map((level) => ({ level: level, odds: oddsNear(profile, level) })),
  };
});

const REACH_VERDICT_SOLUTIONS: { name: string; sol: Solution }[] = (() => {
  const result = {
    cookTime_s: 400, peakYolk_C: 65, peakYolkTime_s: 500, yolkAtPull_C: 60, yolkDose_min: 1,
    whiteDose_min: 1, peakWhite_C: 80,
  };
  const base = { result: result, minCookTime_s: 300, softestLevel: 0.1, hardestLevel: 0.9 };
  return [
    { name: 'reachable', sol: { ...base, reachable: true, whiteSets: true } },
    { name: 'tooSoft', sol: { ...base, reachable: false, whiteSets: true } },
    { name: 'never', sol: { ...base, reachable: false, whiteSets: false } },
  ];
})();
const REACH_RANGES: ({ softest: number | null; hardest: number | null } | null)[] = [
  null, { softest: null, hardest: null }, { softest: 0.3, hardest: 0.8 }, { softest: 0.1, hardest: 0.9 },
  { softest: 0.23, hardest: 0.63 },
];
const reachVerdicts: unknown[] = [];
for (const s of REACH_VERDICT_SOLUTIONS) {
  for (const range of REACH_RANGES) {
    for (const level of [0, 0.05, 0.2, 0.3, 0.5, 0.8, 0.85, 0.95, 1]) {
      const profile: OddsProfile | null = range === null ? null : {
        points: [], best: 0.6, physicalSoftest: 0.1, physicalHardest: 0.9,
        softest: range.softest, hardest: range.hardest,
      };
      const v = verdictWithOdds(s.sol, level, profile);
      reachVerdicts.push({
        solution: s.name, range: range, level: level,
        kind: v.kind, wanted: v.wanted.key, limit: v.limit.key, snapTo: v.snapTo, worthSaying: v.worthSaying,
      });
    }
  }
}

const ADVICE_SETUPS: { setup: CookSetup; eggFromClass: boolean; startAssumed: boolean }[] = [
  { setup: DECIDE_SETUP, eggFromClass: false, startAssumed: false },
  { setup: DECIDE_SETUP, eggFromClass: true, startAssumed: false },
  { setup: setupOf({ eggStart_C: 20, cooling: 'counter', afterBoil: 'off', waterLitres: 3 }), eggFromClass: true, startAssumed: true },
  { setup: setupOf({ eggStart_C: 20, cooling: 'tap' }), eggFromClass: false, startAssumed: false },
  { setup: setupOf({ eggStart_C: 5, afterBoil: 'off', waterLitres: 8 }), eggFromClass: false, startAssumed: true },
  { setup: setupOf({ afterBoil: 'off', waterLitres: 12 }), eggFromClass: false, startAssumed: true },
];
const ADVICE_PROFILE: OddsProfile = {
  points: [{ level: 0, odds: 0.5 }, { level: 0.5, odds: 0.7 }, { level: 1, odds: 0.3 }],
  best: 0.7, physicalSoftest: 0, physicalHardest: 1, softest: 0, hardest: 1,
};

export const reachFixture = {
  about: 'The odds at every level, the range they allow, the verdict with it, the shading and the advice. src/core/reach.ts.',
  constants: {
    reachOdds: REACH_ODDS,
    profileStep: PROFILE_STEP,
    adviceBelowTenths: ADVICE_BELOW_TENTHS,
    adviceMarginTenths: ADVICE_MARGIN_TENTHS,
    adviceGain: ADVICE_GAIN,
    shadeBestMin: SHADE_BEST_MIN,
  },
  profiles: reachProfiles,
  // The shading either side of SHADE_BEST_MIN: none below it.
  shading: [SHADE_BEST_MIN - 0.001, SHADE_BEST_MIN, 0.3].map((best) => {
    const profile: OddsProfile = {
      points: [{ level: 0, odds: best / 2 }, { level: 0.5, odds: best }, { level: 1, odds: 0 }],
      best: best, physicalSoftest: 0, physicalHardest: 1, softest: null, hardest: null,
    };
    return { profile: profile, shading: shadingOf(profile) };
  }),
  answers: reachAnswers,
  verdicts: reachVerdicts,
  adviceWanted: [0, 3, 4, 5, 6, 7, 8].flatMap((tenths) => [null, 0.62, 0.8, 0.84].map((best) => ({
    tenths: tenths, best: best,
    wanted: adviceWanted(tenths, best === null ? null : { ...ADVICE_PROFILE, best: best }),
  }))),
  advice: ADVICE_SETUPS.map((a) => {
    const facts = { eggFromClass: a.eggFromClass, startAssumed: a.startAssumed };
    const priced = pricedChanges(a.setup);
    return {
      setup: a.setup, ...facts,
      unpriced: unpricedAdvice(a.setup, facts),
      priced: priced,
      shown: [0.25, 0.9].map((level) => [0.2, 0.62].map((odds) => ({
        level: level, odds: odds,
        keys: protocolAdvice(a.setup, facts, level, odds, priced.map((c) => ({ key: c.key, profile: ADVICE_PROFILE }))),
      }))).flat(),
    };
  }),
  adviceProfile: ADVICE_PROFILE,
};
