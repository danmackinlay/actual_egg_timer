/**
 * fixtures/probe.json: the thermometer (E4), for the Swift port.
 *
 * Kept out of calibration.json so that E4's additions and E5's can land in
 * either order without one regenerating the other's cases. The surface is
 * calibration.json's - same egg, same pot, same grid - so the peak cells here
 * sit beside the dose cells there.
 *
 * What is pinned: the peak on the grid and its interpolation, the error
 * model's density across both tails (the far hot one is where a careless
 * exp(big) * erfc(tiny) turns into NaN), one particle's likelihood, a fold
 * sequence with readings alone, with answers, and wildly off, through a
 * resample; and the policy - how long the cooling counts, whether a probe is
 * asked for, and which readings are taken at entry.
 */

import { CookResult, DEFAULT_PARAMS, donenessFromSlider, simulate, solveCookTime } from '../../src/core/solve.js';
import { eggFromMass } from '../../src/core/geometry.js';
import { CookSetup } from '../../src/core/protocol.js';
import { lookupPeakYolk_C } from '../../src/core/doseGrid.js';
import {
  Feedback, PROBE_HANDLING_MEAN_C, PROBE_INSTRUMENT_SD_C, PROBE_UNRELATED, PROBE_UNRELATED_SPAN_C,
  Posterior, WhiteReport, answerLikelihood, createPrior, effectiveSampleSize,
  posteriorParams, probeLikelihood, probeShortfallDensity, updatePosterior,
} from '../../src/core/infer.js';
import {
  COOLING_MIN_SECONDS, COOLING_SECONDS, PROBE_ALPHA_SDS, PROBE_MARGIN_C, coolingSecondsFor,
  plausibleProbeRange_C, probeMomentFor,
} from '../../src/core/policy.js';

import {
  CALIB_EGG, CALIB_GRID, CALIB_GRID_SPEC, CALIB_SETUP, LOOKUP_CASES, NOMINAL_TARGET, PARTICLE_COUNT, PRIOR_SEED,
} from './calibration.js';
import { particleRows } from './shared.js';

function readout(post: Posterior) {
  return {
    rng: post.rng,
    ess: effectiveSampleSize(post),
    alpha_m2s: posteriorParams(post).alpha_m2s,
    weights: post.weights.slice(),
    particles: particleRows(post),
  };
}

/** A CookResult with only the two times the cooling reads. */
function timed(cookTime_s: number, toPeak_s: number): CookResult {
  return {
    cookTime_s: cookTime_s, peakYolk_C: 60, peakYolkTime_s: cookTime_s + toPeak_s,
    yolkAtPull_C: 40, yolkDose_min: 1, whiteDose_min: 1, peakWhite_C: 80,
  };
}

export function probeFixture(): Record<string, unknown> {
  const grid = CALIB_GRID;
  const peakAt = (cook_s: number): number => simulate(CALIB_EGG, CALIB_SETUP, DEFAULT_PARAMS, cook_s).peakYolk_C;

  const lookups = LOOKUP_CASES.map((c) => ({ ...c, peakYolk_C: lookupPeakYolk_C(grid, c.alpha_m2s, c.cookTime_s) }));

  const density = [-300, -80, -10, -3, -1, -0.4, 0, 0.2, 0.4, 1, 2.5, 6, 30, 200]
    .map((d) => ({ shortfall_C: d, density: probeShortfallDensity(d) }));

  const first = createPrior(PARTICLE_COUNT, PRIOR_SEED).particles[0];
  const likelihood = [-20, 40, 58, 62, 66, 90, 1000].map((reading) => ({
    cookTime_s: 360, reading_C: reading, likelihood: probeLikelihood(grid, first, 360, reading),
  }));

  // A reading alone, hot; answers and a reading together; a reading far off,
  // which only the unrelated share survives; then answers alone, as before E4.
  const steps: { cookTime_s: number; yolk: Feedback | null; white: WhiteReport | null; probe_C: number | null }[] = [
    { cookTime_s: 360, yolk: null, white: null, probe_C: peakAt(360) + 0.8 },
    { cookTime_s: 420, yolk: 0, white: 'firm', probe_C: peakAt(420) - 0.5 },
    { cookTime_s: 380, yolk: null, white: null, probe_C: peakAt(380) + 7 },
    { cookTime_s: 400, yolk: -1, white: null, probe_C: null },
    { cookTime_s: 350, yolk: null, white: 'tender', probe_C: peakAt(350) - 1.5 },
  ];
  const post = createPrior(PARTICLE_COUNT, PRIOR_SEED);
  const updates = steps.map((s) => {
    const firstLikelihood = answerLikelihood(
      grid, post.particles[0], s.cookTime_s, NOMINAL_TARGET, s.yolk, s.white, s.probe_C,
    );
    updatePosterior(post, grid, s.cookTime_s, NOMINAL_TARGET, s.yolk, s.white, s.probe_C);
    return { ...s, logNominalTarget: NOMINAL_TARGET, firstLikelihood: firstLikelihood, after: readout(post) };
  });

  const cooling = [
    timed(400, 183.2), timed(400, 212.5), timed(400, 60.4), timed(400, 59.6), timed(400, 20),
    timed(400, 0), timed(400, -250), timed(987.25, 164.75),
  ].map((r) => ({
    cookTime_s: r.cookTime_s, peakYolkTime_s: r.peakYolkTime_s,
    coolingSeconds: coolingSecondsFor(r),
    moment: { ice: probeMomentFor(r, 'ice'), tap: probeMomentFor(r, 'tap'), counter: probeMomentFor(r, 'counter') },
  }));

  // Solved cooks, both coolings that count, a small and a large egg, a cold
  // start, the heat off, and an altitude - each with its countdown and the
  // readings its entry takes, at the literature values and at a posterior
  // that has moved.
  const solved: Record<string, unknown>[] = [];
  const setups: { mass_kg: number; over: Partial<CookSetup> }[] = [
    { mass_kg: 0.068, over: {} },
    { mass_kg: 0.053, over: { cooling: 'tap' } },
    { mass_kg: 0.078, over: { startMode: 'cold', timeToBoil_s: 480 } },
    { mass_kg: 0.062, over: { startMode: 'cold', timeToBoil_s: 430, afterBoil: 'off', waterLitres: 1.5, eggCount: 2 } },
    { mass_kg: 0.068, over: { boiling_C: 93.2, eggStart_C: 20 } },
  ];
  for (const s of setups) {
    for (const level of [0.22, 0.41, 1.0]) {
      const egg = eggFromMass(s.mass_kg);
      const setup: CookSetup = { ...CALIB_SETUP, afterBoil: 'hold', ...s.over };
      const r = solveCookTime(egg, setup, DEFAULT_PARAMS, donenessFromSlider(level)).result;
      const moved = { alpha_m2s: DEFAULT_PARAMS.alpha_m2s * 1.07, tauAirScale: 0.9 };
      solved.push({
        mass_kg: s.mass_kg, setup: setup, level: level,
        cookTime_s: r.cookTime_s, peakYolkTime_s: r.peakYolkTime_s, peakYolk_C: r.peakYolk_C,
        coolingSeconds: coolingSecondsFor(r),
        moment: probeMomentFor(r, setup.cooling),
        range: plausibleProbeRange_C(egg, setup, DEFAULT_PARAMS, r.cookTime_s),
        rangeMoved: plausibleProbeRange_C(egg, setup, moved, r.cookTime_s),
        moved: moved,
      });
    }
  }

  return {
    $comment: 'Generated by tools/fixtures.ts (tools/probeFixture.ts) from src/core/. Do not hand-edit.',
    generator: 'npm run fixtures',
    constants: {
      instrumentSd_C: PROBE_INSTRUMENT_SD_C,
      handlingMean_C: PROBE_HANDLING_MEAN_C,
      unrelated: PROBE_UNRELATED,
      unrelatedSpan_C: PROBE_UNRELATED_SPAN_C,
      alphaSds: PROBE_ALPHA_SDS,
      margin_C: PROBE_MARGIN_C,
      coolingSeconds: COOLING_SECONDS,
      coolingMinSeconds: COOLING_MIN_SECONDS,
    },
    egg: { mass_kg: CALIB_EGG.mass_kg },
    setup: CALIB_SETUP,
    grid: { ...CALIB_GRID_SPEC, tauAirScale: 1.0, peakYolk_C: grid.peakYolk_C },
    lookups: lookups,
    density: density,
    likelihood: likelihood,
    prior: { count: PARTICLE_COUNT, seed: PRIOR_SEED },
    updates: updates,
    cooling: cooling,
    solved: solved,
  };
}
