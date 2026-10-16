"""The fit recovers a population whose answer is known, and its sampler can be
believed doing it.

tests/recovery-sample.json is sixty cooks drawn from a known truth (`truth`,
tools/fixtures/fitRecovery.ts's RECOVERY_TRUTH: tools/eggsSimulate.ts's
SIMULATED_TRUTH with the time-scale's centre in the prior's tail) with a
fixed seed and emulated, written by `npm run fixtures`, so this runs without
node. NUTS on it, every egg at full weight (the open tier's discount,
DECISIONS.md 2, tempers the open eggs on purpose and is not a posterior),
must:

- put every global's truth inside its central interval. The interval is
  1 - 0.10/9 wide, not 90%: nine 90% intervals all cover only about 40% of
  the time when the posterior is exactly right, so a check of each at 90%
  would fail most samples it could be given. At 98.9% each, all nine cover
  at least 90% of the time (Bonferroni). On the first sample, drawn from
  SIMULATED_TRUTH itself, three truths lay just outside their 90% intervals -
  the white's lag and firm gap, which are correlated (-0.75), and the
  time-scale's centre - and inside these.
- narrow the prior on the globals the data identify (IDENTIFIED), so that a
  fit which lost its likelihood, and so returned the prior, fails here even
  where the prior happens to cover the truth.
- reach R-hat below 1.01 and a bulk ESS of 100 a chain on every global, with
  no divergent transition (eggfit/diagnostics.py says why those numbers).

Every global's truth is printed with its posterior quantile whether the test
passes or not, so a near miss shows in CI's log.

The sampler's settings are about the least that pass with room, tried over
several seeds (a GitHub runner's chains are another seed, in effect: its
floating point differs in the last bits). The spreads between cooks (tau_t,
sig_s, tau_z) mix slowly, at an ESS of one draw in five to ten, and R-hat
under 1.01 wants several hundred. At a target acceptance of 0.95 or 0.98,
about one transition in ten thousand diverged, where a cook's noise can be
small (log_s0 low, sig_s high) and its answers' probit sharp; at 0.99 none
did.

    uv run --project fit python -m pytest fit/tests
"""

import json
import pathlib

import numpy as np

from eggfit import data, diagnostics, model
from eggfit.__main__ import TRUTH_OF

SAMPLE = pathlib.Path(__file__).parent / "recovery-sample.json"

CHAINS, WARMUP, SAMPLES, TARGET_ACCEPT = 4, 500, 1500, 0.99
#: Each global's interval, so that all nine cover the truth together at 90%.
LEVEL = 1.0 - 0.10 / len(model.GLOBALS)
#: The globals the eggs identify: the time-scale's centre and the white's lag
#: (model.py's two learned globals; INFERENCE.md section 9 recovers both on
#: simulated cooks). The spreads between cooks, the noise and the firm gap
#: trade against each other with three to ten eggs a cook (section 9, "Not
#: recovered"), so how far each narrows is not the data's to promise.
IDENTIFIED = ("mu_z", "lag")
#: Each identified global's posterior sd, at most, as a fraction of its
#: prior's. A fit that ignores the data keeps the prior's, 1 (0.995 and 1.005
#: with the likelihood's weights zeroed); these sixty cooks leave mu_z 0.06
#: and lag 0.14-0.15 over four seeds, so a half rejects the prior by a factor
#: of two and passes the weaker, lag, three times over. It is this sample's:
#: drawn instead with mu_z at +2, a kitchen that firms most whites, lag
#: narrowed only to 0.58.
NARROWED = 0.5


def test_the_fit_recovers_a_known_population_and_mixes(capsys):
    raw = json.loads(SAMPLE.read_text())
    eggs = data.load(str(SAMPLE))
    eggs.tier[:] = 1
    draws = model.fit(eggs, warmup=WARMUP, samples=SAMPLES, chains=CHAINS, seed=0, target_accept=TARGET_ACCEPT)
    diag = diagnostics.check(draws["_chains"], int(draws["_divergences"]), model.GLOBALS)
    prior = model.prior(eggs.constants)
    lo_q, hi_q = (1.0 - LEVEL) / 2.0, 1.0 - (1.0 - LEVEL) / 2.0
    rows, failures = [], []
    for name, d in zip(model.GLOBALS, diag["rows"]):
        key, f = TRUTH_OF[name]
        truth = f(raw["truth"][key]) if f else raw["truth"][key]
        x = draws[name]
        lo, hi = np.quantile(x, [lo_q, hi_q])
        narrowed = float(np.std(x) / np.sqrt(prior[name].variance))
        rows.append(f"{name}: truth {truth:.3f} at posterior quantile {np.mean(x < truth):.3f}, "
                    f"{100 * LEVEL:.1f}% {lo:.3f} to {hi:.3f}, sd {narrowed:.3f} of the prior's, "
                    f"R-hat {d['rhat']:.4f}, bulk ESS {d['ess_bulk']:.0f}")
        if not lo <= truth <= hi:
            failures.append(f"{name}'s truth {truth:.3f} outside {lo:.3f} to {hi:.3f}")
        if name in IDENTIFIED and not narrowed < NARROWED:
            failures.append(f"{name}'s posterior sd is {narrowed:.3f} of its prior's, not below {NARROWED}: "
                            "the data did not narrow it")
    if not diag["ok"]:
        failures.append(f"the sampler failed: {'; '.join(diag['failures'])}")
    table = "\n".join(rows)
    with capsys.disabled():
        print(f"\nrecovery, {CHAINS} chains of {SAMPLES}:\n{table}")
    assert diag["chains"] == CHAINS
    assert not failures, f"{'; '.join(failures)}\n{table}"
