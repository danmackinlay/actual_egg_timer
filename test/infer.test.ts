/**
 * The particle filter's two channels, and especially the white one.
 *
 * The white dose surface was computed for every grid cell and never read until
 * September 2026, and the claim made for reading it is specific: the white is
 * sampled at a different radius from the yolk, and it carries no per-user offset,
 * so it says something about `alpha` that the yolk channel cannot. That is a
 * claim, and claims in this repo get a test - these are the tests. The
 * conformance fixtures pin the arithmetic particle by particle; what is checked
 * here is the reasoning the arithmetic rests on.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FEEDBACK_BAND, WHITE_FEEDBACK_BAND, WHITE_ASK_MIN_P, Posterior, WhiteReport,
  createPrior, updateWhite, updatePosterior, whiteRunnyProbability, shouldAskAboutWhite,
  posteriorParams, posteriorMeanOffset,
} from '../src/core/infer.js';
import { DoseGrid, buildDoseGrid, lookupLogWhiteDose, lookupLogYolkDose } from '../src/core/doseGrid.js';
import {
  DEFAULT_PARAMS, WHITE_DOSE_TARGET, donenessFromSlider, solveCookTime,
} from '../src/core/solve.js';
import { eggFromMass } from '../src/core/geometry.js';
import { CookSetup } from '../src/core/protocol.js';
import { Z_WHITE, Z_YOLK } from '../src/core/constants.js';

// --------------------------------------------------------------------------
// shared fixtures
// --------------------------------------------------------------------------

const EGG = eggFromMass(0.068);

function setupOf(over: Partial<CookSetup>): CookSetup {
  const base: CookSetup = {
    startMode: 'hot', eggStart_C: 4, ambient_C: 20, boiling_C: 100,
    timeToBoil_s: 480, cooling: 'ice', waterLitres: 2, eggCount: 2,
  };
  return { ...base, ...over };
}

/** A cook at a slider level, and a surface around it. Deliberately coarser than
 *  the app's grid: this is about what the filter DOES with the surface, and a
 *  9 x 12 grid costs a fifth of a second. */
function cookAt(level: number, over: Partial<CookSetup> = {}): { grid: DoseGrid; cookTime_s: number; logNominalTarget: number } {
  const setup = setupOf(over);
  const sol = solveCookTime(EGG, setup, DEFAULT_PARAMS, donenessFromSlider(level));
  const t = sol.result.cookTime_s;
  const grid = buildDoseGrid(
    EGG, setup, 1.0,
    DEFAULT_PARAMS.alpha_m2s * 0.55, DEFAULT_PARAMS.alpha_m2s * 1.8, 9,
    Math.max(60, t * 0.35), t * 2.4, 12,
  );
  return {
    grid: grid,
    cookTime_s: t,
    logNominalTarget: Math.log10(donenessFromSlider(level).yolkDose_min),
  };
}

/** A posterior with exactly the particles asked for, at equal weight. Built by
 *  hand rather than drawn, so a test can place a particle on one side of the
 *  white's threshold, on the other, or inside the band. */
function posteriorOf(alphas: number[]): Posterior {
  return {
    particles: alphas.map((a) => ({ alpha_m2s: a, logDoseOffset: 0, tauAirScale: 1 })),
    weights: alphas.map(() => 1 / alphas.length),
    rng: 12345,
  };
}

/** The alpha at which this cook delivers a white dose `offset` decades from the
 *  target, found by bisection on the surface. Lets a test say "a particle that
 *  thinks the white came out well short" without hard-coding a diffusivity that
 *  a constant change would silently invalidate. */
function alphaForWhiteOffset(grid: DoseGrid, cookTime_s: number, offset: number): number {
  const wanted = Math.log10(WHITE_DOSE_TARGET) + offset;
  let lo = DEFAULT_PARAMS.alpha_m2s * 0.55;
  let hi = DEFAULT_PARAMS.alpha_m2s * 1.8;
  for (let i = 0; i < 60; i++) {
    const mid = Math.sqrt(lo * hi);
    if (lookupLogWhiteDose(grid, mid, cookTime_s) < wanted) lo = mid;
    else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

// --------------------------------------------------------------------------
// 1. The band
// --------------------------------------------------------------------------

test('1. the white band is the yolk band measured in degrees, not in decades', () => {
  // Both bands are half-widths in log10 dose, but the two criteria have
  // different z values, so equal decades would NOT be equal tastes. The white
  // band is set so the two are the same peak-temperature width - which is the
  // only sense in which "as fine a distinction as the yolk's" means anything.
  const yolk_C = FEEDBACK_BAND * Z_YOLK;
  const white_C = WHITE_FEEDBACK_BAND * Z_WHITE;
  assert.ok(
    Math.abs(yolk_C - white_C) < 0.02,
    `bands differ by ${(yolk_C - white_C).toFixed(3)} C: ${yolk_C} vs ${white_C}`,
  );
});

// --------------------------------------------------------------------------
// 2. The two channels are not redundant
// --------------------------------------------------------------------------

test('2. white and yolk dose respond differently to alpha, so the white is a second observable', () => {
  const c = cookAt(0.22);
  const lo = DEFAULT_PARAMS.alpha_m2s * 0.9;
  const hi = DEFAULT_PARAMS.alpha_m2s * 1.1;
  const dYolk = lookupLogYolkDose(c.grid, hi, c.cookTime_s) - lookupLogYolkDose(c.grid, lo, c.cookTime_s);
  const dWhite = lookupLogWhiteDose(c.grid, hi, c.cookTime_s) - lookupLogWhiteDose(c.grid, lo, c.cookTime_s);
  // Both rise with alpha - more diffusivity is more dose everywhere.
  assert.ok(dYolk > 0 && dWhite > 0, `doses should rise with alpha: ${dYolk}, ${dWhite}`);
  // But not by the same amount. The yolk centre is the last place the heat
  // reaches, so it is the more sensitive of the two; if these slopes were equal
  // the white would be a restatement of the yolk and could identify nothing.
  const ratio = dWhite / dYolk;
  assert.ok(
    ratio < 0.85,
    `the white responds ${(100 * ratio).toFixed(0)}% as strongly as the yolk, which is too close to redundant`,
  );
});

// --------------------------------------------------------------------------
// 3. Why it is safe to ask only sometimes
// --------------------------------------------------------------------------

test('3. a unanimous model learns nothing from either answer, which is what makes the question skippable', () => {
  // This is the argument behind `shouldAskAboutWhite`, executed rather than
  // asserted in a comment: when every particle predicts the same thing, every
  // weight is multiplied by the same factor and normalising restores the
  // posterior exactly. Nothing is lost by not asking.
  const c = cookAt(1.0);
  const unanimous = posteriorOf([1.3e-7, 1.7e-7, 2.4e-7]);
  assert.equal(whiteRunnyProbability(unanimous, c.grid, c.cookTime_s), 0);
  for (const answer of ['runny', 'set'] as WhiteReport[]) {
    const post = posteriorOf([1.3e-7, 1.7e-7, 2.4e-7]);
    updateWhite(post, c.grid, c.cookTime_s, answer);
    for (let i = 0; i < post.weights.length; i++) {
      assert.ok(
        Math.abs(post.weights[i] - unanimous.weights[i]) < 1e-12,
        `answering "${answer}" moved a weight the model had already decided`,
      );
    }
  }
});

test('3b. the second question is asked on a soft egg and not on a jammy one', () => {
  // The whole UX claim in one test: the default path stays one tap. A jammy egg
  // is far past the white's threshold at every plausible alpha, so there is
  // nothing to ask; a soft one sits on it.
  const prior = () => createPrior(400, 0x5eed1e);
  const soft = cookAt(0.1);
  const jammy = cookAt(0.41);
  assert.ok(
    shouldAskAboutWhite(prior(), soft.grid, soft.cookTime_s),
    `a soft egg should be asked about: p = ${whiteRunnyProbability(prior(), soft.grid, soft.cookTime_s)}`,
  );
  assert.ok(
    !shouldAskAboutWhite(prior(), jammy.grid, jammy.cookTime_s),
    `a jammy egg should not: p = ${whiteRunnyProbability(prior(), jammy.grid, jammy.cookTime_s)}`,
  );
});

test('3c. the ask threshold is exactly the stated doubt, symmetrically', () => {
  const c = cookAt(0.22);
  // Placed by construction: one particle well short of the threshold, one well
  // past it, with weights chosen to put the predictive probability either side
  // of WHITE_ASK_MIN_P.
  const runny = alphaForWhiteOffset(c.grid, c.cookTime_s, -0.6);
  const set = alphaForWhiteOffset(c.grid, c.cookTime_s, +0.6);
  for (const [w, expected] of [[0.5 * WHITE_ASK_MIN_P, false], [2 * WHITE_ASK_MIN_P, true]] as [number, boolean][]) {
    const low: Posterior = {
      particles: [runny, set].map((a) => ({ alpha_m2s: a, logDoseOffset: 0, tauAirScale: 1 })),
      weights: [w, 1 - w],
      rng: 1,
    };
    assert.equal(shouldAskAboutWhite(low, c.grid, c.cookTime_s), expected);
    // And the mirror image: doubt is doubt whichever answer is the likely one.
    const high: Posterior = { ...low, weights: [1 - w, w] };
    assert.equal(shouldAskAboutWhite(high, c.grid, c.cookTime_s), expected);
  }
});

// --------------------------------------------------------------------------
// 4. The likelihood itself
// --------------------------------------------------------------------------

test('4. a particle on the boundary scores exactly between right and wrong, so hedging cannot win', () => {
  const c = cookAt(0.22);
  const alphas = [
    alphaForWhiteOffset(c.grid, c.cookTime_s, -0.6),   // predicts runny
    alphaForWhiteOffset(c.grid, c.cookTime_s, 0.0),    // predicts neither
    alphaForWhiteOffset(c.grid, c.cookTime_s, +0.6),   // predicts set
  ];
  const post = posteriorOf(alphas);
  updateWhite(post, c.grid, c.cookTime_s, 'runny');
  // 0.65 / 0.5 / 0.35 normalised. The hedging particle must sit strictly
  // between the two, and the two extremes must be mirror images of each other.
  assert.ok(post.weights[0] > post.weights[1] && post.weights[1] > post.weights[2]);
  const total = 0.65 + 0.5 + 0.35;
  assert.ok(Math.abs(post.weights[0] - 0.65 / total) < 1e-12);
  assert.ok(Math.abs(post.weights[1] - 0.5 / total) < 1e-12);
  assert.ok(Math.abs(post.weights[2] - 0.35 / total) < 1e-12);
});

test('4b. one white answer is worth less than one yolk answer, deliberately', () => {
  // The white sits nearer the surface, so it is the channel more exposed to the
  // H_EFF error README 11.2 records as known-high. The discount is the only
  // protection against that, so it is pinned rather than left to a comment.
  const c = cookAt(0.22);
  const white = posteriorOf([
    alphaForWhiteOffset(c.grid, c.cookTime_s, -0.6),
    alphaForWhiteOffset(c.grid, c.cookTime_s, +0.6),
  ]);
  updateWhite(white, c.grid, c.cookTime_s, 'runny');
  const whiteRatio = white.weights[0] / white.weights[1];
  assert.ok(
    whiteRatio > 1.5 && whiteRatio < 2.5,
    `a white answer should be worth a likelihood ratio near 1.9, got ${whiteRatio}`,
  );
  // The yolk's own contrast, for comparison: 0.8 against 0.1.
  assert.ok(whiteRatio < 8.0 / 2.0, 'the white must not be as sharp as the yolk');
});

test('4c. a runny white pushes alpha down and a set one pushes it up', () => {
  // The direction is the entire point. A white that had not set means the heat
  // got in more slowly than the model thought, which is a smaller alpha.
  const c = cookAt(0.1);
  const before = posteriorParams(createPrior(400, 0x5eed1e)).alpha_m2s;
  const moved: Record<WhiteReport, number> = { runny: 0, set: 0 };
  for (const answer of ['runny', 'set'] as WhiteReport[]) {
    const post = createPrior(400, 0x5eed1e);
    updateWhite(post, c.grid, c.cookTime_s, answer);
    moved[answer] = posteriorParams(post).alpha_m2s;
  }
  assert.ok(moved.runny < before, `runny should lower alpha: ${moved.runny} vs ${before}`);
  assert.ok(moved.set > before, `set should raise alpha: ${moved.set} vs ${before}`);
});

// --------------------------------------------------------------------------
// 5. The identifiability claim
// --------------------------------------------------------------------------

test('5. the white moves alpha without moving the taste offset, which is why it can break the confound', () => {
  // `logDoseOffset` is defined on the yolk axis and does not enter the white
  // likelihood at all, so a white answer has nothing to absorb it. In the prior
  // the two are independent, so the offset should barely move while alpha does.
  const c = cookAt(0.1);
  const before = createPrior(600, 0x5eed1e);
  const after = createPrior(600, 0x5eed1e);
  updateWhite(after, c.grid, c.cookTime_s, 'runny');

  const dAlpha = Math.abs(
    posteriorParams(after).alpha_m2s - posteriorParams(before).alpha_m2s,
  ) / posteriorParams(before).alpha_m2s;
  const dOffset = Math.abs(posteriorMeanOffset(after) - posteriorMeanOffset(before));

  assert.ok(dAlpha > 0.005, `the white should actually move alpha, moved ${dAlpha}`);
  // The offset is in log10 dose units, where the "just right" band is 0.28 wide.
  // A hundredth of that is noise from the finite particle set, not learning.
  assert.ok(dOffset < 0.01, `the white should not move the taste offset, moved ${dOffset}`);
});

test('5b. the same egg told about both channels learns more than from the yolk alone', () => {
  // The owner's first real egg: aimed soft, white came out runny, answered "too
  // soft" honestly. Both answers agree that the heat got in slowly, so the
  // white should carry alpha further in the same direction rather than fight it.
  const c = cookAt(0.22);
  const yolkOnly = createPrior(600, 0x5eed1e);
  updatePosterior(yolkOnly, c.grid, c.cookTime_s, c.logNominalTarget, -1);
  const both = createPrior(600, 0x5eed1e);
  updatePosterior(both, c.grid, c.cookTime_s, c.logNominalTarget, -1);
  updateWhite(both, c.grid, c.cookTime_s, 'runny');

  const a1 = posteriorParams(yolkOnly).alpha_m2s;
  const a2 = posteriorParams(both).alpha_m2s;
  assert.ok(a2 < a1, `the white answer should push alpha further down: ${a2} vs ${a1}`);
  assert.ok(a1 < DEFAULT_PARAMS.alpha_m2s, 'the yolk answer alone should already lower alpha');
});
