/**
 * fit/tests/emulated-sample.json: the fit's likelihood held to the app's
 * (fit/tests/test_likelihood.py). Six cooks simulated from the default truth
 * with the default seed and emulated (tools/eggsSimulate.ts), exactly what
 * `npm run eggs -- simulate <out> <truth> 6` and `emulate` write; its
 * `checks` are the core's own answer probabilities and probe likelihoods for
 * a dozen of its eggs (src/core/infer.ts), and `likelihood` the core's
 * `LIKELIHOOD_ID`. Made here, so a change to the likelihood changes the
 * sample, and fixtures:check says so, rather than leaving pytest checking
 * the numbers of the likelihood before.
 */

import { SIMULATED_TRUTH, emulate, simulateCooks } from '../eggsSimulate.ts';

const COOKS = 6;
const SEED = 20261002;

const emulated = emulate(simulateCooks(COOKS, SEED, SIMULATED_TRUTH).lines);

export const fitSampleFixture = {
  ...emulated,
  about: `${emulated.about} ${COOKS} cooks simulated from tools/eggsSimulate.ts's SIMULATED_TRUTH, seed ${SEED}; the checks are src/core/infer.ts's own likelihood, for fit/tests/test_likelihood.py.`,
};
