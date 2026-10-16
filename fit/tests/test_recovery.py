"""The fit recovers a population whose answer is known, and its sampler can be
believed doing it.

tests/recovery-sample.json is sixty cooks drawn from a known truth (`truth`,
tools/eggsSimulate.ts's SIMULATED_TRUTH) with a fixed seed and emulated,
written by `npm run fixtures` (tools/fixtures/fitRecovery.ts), so this runs
without node. NUTS on it, every egg at full weight (the open tier's discount,
DECISIONS.md 2, tempers the open eggs on purpose and is not a posterior),
must:

- put every global's truth inside its central interval. The interval is
  1 - 0.10/9 wide, not 90%: nine 90% intervals all cover only about 40% of
  the time when the posterior is exactly right, so a check of each at 90%
  would fail most samples it could be given. At 98.9% each, all nine cover
  at least 90% of the time (Bonferroni). On the sample as first made, three truths lay
  just outside their 90% intervals - the white's lag and firm gap, which are
  correlated (-0.75), and the time-scale's centre - and inside these.
- reach R-hat below 1.01 and a bulk ESS of 100 a chain on every global, with
  no divergent transition (eggfit/diagnostics.py says why those numbers).

The sampler's settings are about the least that pass with room on this
sample, tried over several seeds (a GitHub runner's chains are another seed,
in effect: its floating point differs in the last bits). The spreads between
cooks (tau_t, sig_s, tau_z) mix slowly, at an ESS of one draw in eight or
ten, and R-hat under 1.01 wants several hundred; 6,000 draws gave R-hat at
most 1.007 and bulk ESS at least 600. At a target acceptance of 0.95 or
0.98, about one transition in ten thousand diverged, where a cook's noise
can be small (log_s0 low, sig_s high) and its answers' probit sharp; at
0.99 none did.

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


def test_the_fit_recovers_a_known_population_and_mixes():
    raw = json.loads(SAMPLE.read_text())
    eggs = data.load(str(SAMPLE))
    eggs.tier[:] = 1
    draws = model.fit(eggs, warmup=WARMUP, samples=SAMPLES, chains=CHAINS, seed=0, target_accept=TARGET_ACCEPT)
    diag = diagnostics.check(draws["_chains"], int(draws["_divergences"]), model.GLOBALS)
    lo_q, hi_q = (1.0 - LEVEL) / 2.0, 1.0 - (1.0 - LEVEL) / 2.0
    rows, missed = [], []
    for name, d in zip(model.GLOBALS, diag["rows"]):
        key, f = TRUTH_OF[name]
        truth = f(raw["truth"][key]) if f else raw["truth"][key]
        lo, hi = np.quantile(draws[name], [lo_q, hi_q])
        q05, q95 = np.quantile(draws[name], [0.05, 0.95])
        rows.append(f"{name}: truth {truth:.3f}, {100 * LEVEL:.1f}% {lo:.3f} to {hi:.3f} (90% {q05:.3f} to {q95:.3f}), "
                    f"R-hat {d['rhat']:.4f}, bulk ESS {d['ess_bulk']:.0f}")
        if not lo <= truth <= hi:
            missed.append(f"{name}'s truth {truth:.3f} outside {lo:.3f} to {hi:.3f}")
    table = "\n".join(rows)
    assert diag["chains"] == CHAINS
    assert diag["ok"], f"the sampler failed: {'; '.join(diag['failures'])}\n{table}"
    assert not missed, f"not recovered: {'; '.join(missed)}\n{table}"
