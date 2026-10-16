/**
 * fit/tests/recovery-sample.json: one population with a known truth, for the
 * fit's recovery check (fit/tests/test_recovery.py, run in CI's `fit` job,
 * which has no node). Sixty cooks drawn from RECOVERY_TRUTH with a fixed
 * seed and emulated, with the truth beside them; NUTS on these must find
 * every global's truth inside its interval, narrow the prior where the data
 * identify a global, mix and never diverge. No likelihood checks:
 * emulated-sample.json has those.
 *
 * The truth is tools/eggsSimulate.ts's SIMULATED_TRUTH but for the
 * time-scale's centre, which is put in the prior's tail: -2 literature sds
 * (alpha 21% below the literature's), at the prior's 2.3rd percentile, so
 * the recovery spans the prior rather than sitting at its middle. It is
 * still inside the test's 1 - 0.10/9 interval of the prior, so a fit that
 * lost its likelihood and returned the prior would cover it: only the
 * narrowing check catches that.
 */

import { SIMULATED_TRUTH, emulate, simulateCooks, type Truth } from '../eggsSimulate.ts';

const COOKS = 60;
const SEED = 20261016;
const RECOVERY_TRUTH: Truth = { ...SIMULATED_TRUTH, muZ: -2.0 };

const { about, ...emulated } = emulate(simulateCooks(COOKS, SEED, RECOVERY_TRUTH).lines, 0);

export const fitRecoveryFixture = {
  about: `${about} ${COOKS} cooks simulated from \`truth\` (tools/eggsSimulate.ts's SIMULATED_TRUTH with muZ -2, in the prior's tail), seed ${SEED}, for fit/tests/test_recovery.py.`,
  truth: RECOVERY_TRUTH,
  cooks: COOKS,
  seed: SEED,
  ...emulated,
};
