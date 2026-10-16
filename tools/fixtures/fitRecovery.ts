/**
 * fit/tests/recovery-sample.json: one population with a known truth, for the
 * fit's recovery check (fit/tests/test_recovery.py, run in CI's `fit` job,
 * which has no node). Sixty cooks drawn from tools/eggsSimulate.ts's
 * SIMULATED_TRUTH with a fixed seed and emulated, with the truth beside
 * them; NUTS on these must find every global's truth inside its interval,
 * mix and never diverge. No likelihood checks: emulated-sample.json has
 * those.
 */

import { SIMULATED_TRUTH, emulate, simulateCooks } from '../eggsSimulate.ts';

const COOKS = 60;
const SEED = 20261016;

const { about, ...emulated } = emulate(simulateCooks(COOKS, SEED, SIMULATED_TRUTH).lines, 0);

export const fitRecoveryFixture = {
  about: `${about} ${COOKS} cooks simulated from \`truth\` (tools/eggsSimulate.ts's SIMULATED_TRUTH), seed ${SEED}, for fit/tests/test_recovery.py.`,
  truth: SIMULATED_TRUTH,
  cooks: COOKS,
  seed: SEED,
  ...emulated,
};
