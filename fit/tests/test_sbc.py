"""The calibration check's own parts (eggfit/sbc.py), without running it: it
needs node and takes hours.

    uv run --project fit python -m pytest fit/tests
"""

import json
import pathlib

import numpy as np

from eggfit import data, model, sbc

TESTS = pathlib.Path(__file__).parent


def test_a_truth_from_the_prior_is_one_the_simulator_reads():
    # The simulator's Truth, as the recovery sample has it: the same nine
    # names, and the spreads positive (tools/eggsSimulate.ts parseTruth).
    want = json.loads((TESTS / "recovery-sample.json").read_text())["truth"]
    constants = data.load(str(TESTS / "emulated-sample.json")).constants
    rng = np.random.default_rng(0)
    for _ in range(20):
        g = sbc.draw_truth(rng, constants)
        assert list(g) == model.GLOBALS
        t = sbc.as_truth(g)
        assert sorted(t) == sorted(want)
        assert all(t[k] > 0 for k in t if k not in ("muZ", "lag"))
        assert abs(np.log(t["noiseMedian"]) - g["log_s0"]) < 1e-12


def test_uniform_ranks_pass_and_a_biased_posterior_does_not():
    rng = np.random.default_rng(0)
    rows = [{"rep": i, "draws": 99, "divergences": 0, "diagnostics_ok": True, "seconds_simulate": 1.0,
             "seconds_fit": 1.0, "ranks": {n: int(rng.integers(0, 100)) for n in model.GLOBALS}} for i in range(200)]
    s = sbc.summary(rows, 10)
    assert s["bins"] == 10 and all(sum(p["counts"]) == 200 for p in s["parameters"].values())
    assert min(p["p"] for p in s["parameters"].values()) > 0.001
    for row in rows:
        row["ranks"]["lag"] = min(99, row["ranks"]["lag"] + 30)  # the posterior below the truth
    assert sbc.summary(rows, 10)["parameters"]["lag"]["p"] < 1e-6
    # Few repetitions, few bins: at least five expected in each.
    assert sbc.bins_for(20, 100, 10) == 4 and sbc.bins_for(7, 100, 10) == 2
