/**
 * fixtures/reach.json: the odds and the certainty at every level, the
 * warning they give, the answer at a level and with its time decided, the
 * shading, the advice.
 */

import { CookSetup } from '../../src/core/protocol.js';
import { Egg, eggFromMass } from '../../src/core/geometry.js';
import { createPrior, updatePosterior } from '../../src/core/infer.js';
import { Calibration, calibrationDoneness, calibrationParams } from '../../src/core/record.js';
import { decide, decisionInputs } from '../../src/core/decide.js';
import { DoseGrid } from '../../src/core/doseGrid.js';
import { logYolkTarget, solveCookTime } from '../../src/core/solve.js';
import {
  ADVICE_GAIN, LevelOdds, OddsProfile, PROFILE_STEP,
  SHADE_BEST_MIN, adviceWanted, answerAt, askedNear, decideAnswer, envelopeBounds, lowOddsAt, oddsProfile,
  pricedChanges, protocolAdvice, shadingOf, unpricedAdvice,
} from '../../src/core/reach.js';


import {
  DECIDE_EGG, DECIDE_PARTICLES, DECIDE_SEED, DECIDE_SETUP, coarseDecisionGrid, decidePosteriors,
} from './decide.js';
import { particleRows } from './shared.js';
import { referenceSetup } from '../common.js';

/* The odds and the certainty at every level, the range that is not a wild
 * guess, the warning outside it, the shading and the advice
 * (src/core/reach.ts). A profile is a solve and a
 * decision per level, so both apps must walk the same levels in the same
 * order and land on the same ends. The surfaces are coarse, as decide.json's
 * is, and built per pot from the production spec; the posteriors are
 * decide.json's. */

const REACH_CASES: { posterior: string; setup: CookSetup }[] = [
  { posterior: 'prior', setup: DECIDE_SETUP },
  { posterior: 'learned', setup: DECIDE_SETUP },
  { posterior: 'learned', setup: referenceSetup({ timeToBoil_s: 480, eggCount: 2, cooling: 'counter' }) },
];

/* The answer at a level (`answerAt`): the solve, the verdict, the retry at
 * the level it snaps to, and the warning there. Each profile's pot is asked at levels inside and
 * outside its range, with and without its odds, and with the retry on and off. */
const reachAnswers: unknown[] = [];

/* The answer with its time decided (`decideAnswer`), as both apps show it:
 * at levels across each pot, without the profile and with it, and nudged
 * where the profile is in. Each row is the answer at the level asked
 * (`answerAt`, snapping on), then the decision on it. */
const DECIDED_LEVELS = [0, 0.05, 0.13, 0.22, 0.41, 0.62, 0.95, 1];
const DECIDED_VARIANTS = [
  { withOdds: false, nudge_s: 0 }, { withOdds: true, nudge_s: 0 }, { withOdds: true, nudge_s: -7 },
];

function decidedRow(
  c: Calibration, egg: Egg, setup: CookSetup, grid: DoseGrid, profile: OddsProfile, level: number,
  withOdds: boolean, nudge_s: number,
) {
  const odds = withOdds ? profile : null;
  const a = answerAt(c, egg, setup, level, odds, true);
  const d = decideAnswer(c, egg, setup, grid, a.solution, a.level, odds, nudge_s);
  return {
    withOdds: withOdds, asked: level, drawn_s: nudge_s,
    answeredLevel: a.level, lowOdds: a.lowOdds,
    // The level's own choice, held by nothing: where the envelope binds, the
    // time decided differs from it.
    own_s: decide(c, grid, a.solution, logYolkTarget(a.level)).cookTime_s,
    level: d.level,
    solution: {
      reachable: d.solution.reachable, whiteSets: d.solution.whiteSets,
      cookTime_s: d.solution.result.cookTime_s, peakYolk_C: d.solution.result.peakYolk_C,
    },
    decision: d.decision,
    outcome: d.outcome,
    certainty: d.certainty,
    nudge_s: d.nudge_s,
    adviceWanted: d.adviceWanted,
  };
}

const reachProfiles = REACH_CASES.map((rc, index) => {
  const pz = decidePosteriors.find((x) => x.name === rc.posterior);
  if (pz === undefined) throw new Error(rc.posterior);
  const c: Calibration = { posterior: pz.post, eggsLogged: pz.eggsLogged };
  const g = coarseDecisionGrid(decisionInputs(c, DECIDE_EGG, rc.setup));
  const profile = oddsProfile(c, DECIDE_EGG, rc.setup, g.grid);
  const decided = DECIDED_LEVELS.flatMap((level) => DECIDED_VARIANTS.map((v) => decidedRow(
    c, DECIDE_EGG, rc.setup, g.grid, profile, level, v.withOdds, v.nudge_s,
  )));
  for (const withOdds of [false, true]) {
    for (const level of [0, 0.05, 0.41, 0.95, 1]) {
      for (const snapRetry of [true, false]) {
        const a = answerAt(c, DECIDE_EGG, rc.setup, level, withOdds ? profile : null, snapRetry);
        reachAnswers.push({
          profile: index, withOdds: withOdds, level: level, snapRetry: snapRetry,
          kind: a.verdict.kind, snapTo: a.verdict.snapTo, answeredLevel: a.level, lowOdds: a.lowOdds,
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
    // The chance of the word asked between points: either side of each cut
    // between words, at a point, between two, and outside the profile.
    near: [0, 0.1, 0.12, 0.13, 0.3, 0.33, 0.41, 0.5, 0.53, 0.625, 0.8, 0.82, 0.99, 1].map((level) => ({
      level: level, pAsked: askedNear(profile, level),
    })),
    // The envelope (DECISIONS.md 84): the bounds at a level - at a point,
    // between two, outside them all, a hundredth not held exactly - and the
    // time the app gives there, its answer decided within them. No bound
    // above is null: JSON has no infinity.
    envelope: [0, 0.05, 0.13, 0.22, 0.29 + 1e-12, 0.41, 0.625, 0.99, 1].map((level) => {
      const bounds = envelopeBounds(profile, level);
      const a = answerAt(c, DECIDE_EGG, rc.setup, level, profile, true);
      return {
        level: level,
        bounds: bounds === null ? null
          : { lo_s: bounds.lo_s, hi_s: Number.isFinite(bounds.hi_s) ? bounds.hi_s : null },
        held_s: decide(c, g.grid, a.solution, logYolkTarget(a.level), envelopeBounds(profile, a.level)).cookTime_s,
      };
    }),
    decided: decided,
  };
});

/* The owner's egg (DECISIONS.md 83 and 84; test/reach.test.ts 11): 58 g
 * from the fridge into boiling water and an ice bath, after one egg asked
 * soft that came out soft with a runny white. Soft was under 3/10 and
 * is chosen anyway, the slider resting there (83), a ballpark since the
 * `certainty` draft; its own choice is later than jammy's, and the time
 * decided there is no later than jammy's (84).
 * Every slider position from the softest the white allows to fudgy, so the
 * time is seen never to fall as the level rises. */
const OWNER_EGG = eggFromMass(0.058);
const ownerDecided = (() => {
  const post = createPrior(DECIDE_PARTICLES, DECIDE_SEED);
  const first: Calibration = { posterior: post, eggsLogged: 0 };
  const firstGrid = coarseDecisionGrid(decisionInputs(first, OWNER_EGG, DECIDE_SETUP)).grid;
  const asked = solveCookTime(OWNER_EGG, DECIDE_SETUP, calibrationParams(first), calibrationDoneness(first, 0.22));
  updatePosterior(post, firstGrid, asked.result.cookTime_s, 'soft', 'runny');
  const c: Calibration = { posterior: post, eggsLogged: 1 };
  const g = coarseDecisionGrid(decisionInputs(c, OWNER_EGG, DECIDE_SETUP));
  const profile = oddsProfile(c, OWNER_EGG, DECIDE_SETUP, g.grid);
  const levels: number[] = [];
  for (let k = Math.round(profile.physicalSoftest * 100); k <= 62; k++) levels.push(k / 100);
  return {
    eggsLogged: c.eggsLogged,
    posterior: { name: 'owner', weights: post.weights, particles: particleRows(post) },
    egg: { mass_kg: OWNER_EGG.mass_kg },
    setup: DECIDE_SETUP,
    grid: { tauAirScale: g.tauAirScale, ...g.spec },
    profile: profile,
    decided: levels.map((level) => decidedRow(c, OWNER_EGG, DECIDE_SETUP, g.grid, profile, level, true, 0)),
  };
})();

/* A pot whose white never sets - the heat off under a third of a litre and
 * twelve eggs - after eggs that taught something: no cook to choose for, so
 * the mean solve's time stands, the nudge is not taken, and there is no
 * advice to give. */
const NEVER_SETS_SETUP = referenceSetup({ timeToBoil_s: 480, eggCount: 12, afterBoil: 'off', waterLitres: 0.3 });
const neverSets = (() => {
  const pz = decidePosteriors[1];
  const c: Calibration = { posterior: pz.post, eggsLogged: pz.eggsLogged };
  const g = coarseDecisionGrid(decisionInputs(c, DECIDE_EGG, NEVER_SETS_SETUP));
  const profile = oddsProfile(c, DECIDE_EGG, NEVER_SETS_SETUP, g.grid);
  return {
    posterior: pz.name,
    eggsLogged: pz.eggsLogged,
    egg: { mass_kg: DECIDE_EGG.mass_kg },
    setup: NEVER_SETS_SETUP,
    grid: { tauAirScale: g.tauAirScale, ...g.spec },
    profile: profile,
    decided: [0, 0.41, 1].flatMap((level) => DECIDED_VARIANTS.map((v) => decidedRow(
      c, DECIDE_EGG, NEVER_SETS_SETUP, g.grid, profile, level, v.withOdds, v.nudge_s,
    ))),
  };
})();

const REACH_RANGES: ({ softest: number | null; hardest: number | null } | null)[] = [
  null, { softest: null, hardest: null }, { softest: 0.3, hardest: 0.8 }, { softest: 0.1, hardest: 0.9 },
  { softest: 0.23, hardest: 0.63 }, { softest: 0.35, hardest: 0.7 },
];
const reachLowOdds: unknown[] = [];
for (const range of REACH_RANGES) {
  // 35 * 0.01 and 70 * 0.01 are each a hair past 0.35 and 0.7, as a slider
  // that steps by multiplying puts them: still the end, not past it.
  for (const level of [0, 0.05, 0.2, 0.23, 0.3, 35 * 0.01, 0.5, 0.63, 70 * 0.01, 0.8, 0.85, 0.95, 1]) {
    const profile: OddsProfile | null = range === null ? null : {
      points: [], best: 0.6, bestAsked: 0.6, physicalSoftest: 0.1, physicalHardest: 0.9,
      softest: range.softest, hardest: range.hardest,
    };
    reachLowOdds.push({ range: range, level: level, lowOdds: lowOddsAt(profile, level) });
  }
}

const ADVICE_SETUPS: { setup: CookSetup; eggFromClass: boolean; startAssumed: boolean }[] = [
  { setup: DECIDE_SETUP, eggFromClass: false, startAssumed: false },
  { setup: DECIDE_SETUP, eggFromClass: true, startAssumed: false },
  { setup: referenceSetup({ eggStart_C: 20, cooling: 'counter', afterBoil: 'off', waterLitres: 3 }), eggFromClass: true, startAssumed: true },
  { setup: referenceSetup({ eggStart_C: 20, cooling: 'tap' }), eggFromClass: false, startAssumed: false },
  { setup: referenceSetup({ eggStart_C: 5, afterBoil: 'off', waterLitres: 8 }), eggFromClass: false, startAssumed: true },
  { setup: referenceSetup({ afterBoil: 'off', waterLitres: 12 }), eggFromClass: false, startAssumed: true },
];
/** A point made by hand: the chance of the word asked, which the advice
 *  reads, and odds and a class it does not. */
function handPoint(level: number, cookTime_s: number, odds: number, pAsked: number): LevelOdds {
  return { level: level, cookTime_s: cookTime_s, odds: odds, pAsked: pAsked, certainty: 'ballpark' };
}

/** A point in every word's band, and two in Soft's, so the advice is read
 *  between points that ask one word, beside one alone, and outside. */
const ADVICE_PROFILE: OddsProfile = {
  points: [
    handPoint(0.05, 300, 0.5, 0.3), handPoint(0.15, 320, 0.5, 0.4), handPoint(0.3, 360, 0.7, 0.6),
    handPoint(0.4, 400, 0.7, 0.9), handPoint(0.6, 450, 0.6, 0.7), handPoint(0.95, 500, 0.3, 0.5),
  ],
  best: 0.7, bestAsked: 0.9, physicalSoftest: 0.05, physicalHardest: 0.95, softest: 0.05, hardest: 0.95,
};

export const reachFixture = {
  about: 'The odds and the certainty at every level, the range that is not a wild guess, the warning outside it, the answer with its time decided, the shading and the advice. src/core/reach.ts.',
  constants: {
    profileStep: PROFILE_STEP,
    adviceGain: ADVICE_GAIN,
    shadeBestMin: SHADE_BEST_MIN,
  },
  profiles: reachProfiles,
  owner: ownerDecided,
  neverSets: neverSets,
  // The shading either side of SHADE_BEST_MIN: none below it. The odds run
  // against the chance of the word asked, so a shading read off the odds
  // shows.
  shading: [SHADE_BEST_MIN - 0.001, SHADE_BEST_MIN, 0.3].map((best) => {
    const profile: OddsProfile = {
      points: [handPoint(0, 300, 0.2, best / 2), handPoint(0.5, 400, 0, best), handPoint(1, 500, 0.4, 0)],
      best: 0.4, bestAsked: best, physicalSoftest: 0, physicalHardest: 1, softest: null, hardest: null,
    };
    return { profile: profile, shading: shadingOf(profile) };
  }),
  answers: reachAnswers,
  lowOdds: reachLowOdds,
  adviceWanted: (['veryCertain', 'ballpark', 'wildGuess'] as const).map((c) => ({ certainty: c, wanted: adviceWanted(c) })),
  advice: ADVICE_SETUPS.map((a) => {
    const facts = { eggFromClass: a.eggFromClass, startAssumed: a.startAssumed };
    const priced = pricedChanges(a.setup);
    return {
      setup: a.setup, ...facts,
      unpriced: unpricedAdvice(a.setup, facts),
      priced: priced,
      shown: [0.02, 0.1, 0.25, 0.9].map((level) => [0.2, 0.47, 0.5].map((pAsked) => ({
        level: level, pAsked: pAsked,
        advice: protocolAdvice(a.setup, facts, level, pAsked, priced.map((c) => ({ key: c.key, profile: ADVICE_PROFILE }))),
      }))).flat(),
    };
  }),
  adviceProfile: ADVICE_PROFILE,
};
