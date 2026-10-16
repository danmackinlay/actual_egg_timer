"""The calibration check's own parts (eggfit/sbc.py), without running it: it
needs node and takes minutes.

    uv run --project fit python -m pytest fit/tests
"""

import json
import pathlib

import jax
import jax.numpy as jnp
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


def test_padding_eggs_change_neither_the_likelihood_nor_its_gradient():
    # The sample has eggs answered the old way and one probe reading, so
    # every branch of the likelihood meets a padding egg.
    eggs = data.load(str(TESTS / "emulated-sample.json"))
    eggs.tier[:] = 1
    n_eggs, n_cooks, n_old, n_probed = sbc.shape_of(eggs)
    assert n_old > 0 and n_probed > 0
    plain = model.arrays(eggs, np.ones(n_eggs))
    pad = sbc.padded(eggs, n_eggs + 7, n_old + 3, n_probed + 2)
    rng = np.random.default_rng(1)
    v = {n: float(rng.uniform(0.1, 0.5)) for n in model.GLOBALS}
    v.update({e: jnp.asarray(rng.normal(size=n_cooks)) for e in ("ez", "et", "ew", "es", "eg")})

    def ll(d, v):
        return model.loglik(eggs.constants, d, model.cooks_of(v))

    assert abs(float(ll(pad, v)) - float(ll(plain, v))) < 1e-12 * abs(float(ll(plain, v)))
    g_plain, g_pad = jax.grad(ll, argnums=1)(plain, v), jax.grad(ll, argnums=1)(pad, v)
    for k in v:
        assert np.allclose(g_pad[k], g_plain[k], rtol=1e-12, atol=1e-12), k


def rows_of(ranks: dict, reps: int) -> list[dict]:
    return [{"rep": i, "draws": 99, "cooks": 20, "divergences": 0, "diagnostics_ok": True,
             "ranks": {q: int(ranks[q][i]) for q in sbc.QUANTITIES}} for i in range(reps)]


def test_uniform_ranks_pass_and_one_biased_or_overconfident_quantity_fails_the_verdict():
    rng = np.random.default_rng(0)
    ranks = {q: rng.integers(0, 100, size=200) for q in sbc.QUANTITIES}
    s = sbc.summary(rows_of(ranks, 200))
    assert s["verdict"]["calibrated"], s["verdict"]
    assert all(sum(p["counts"]) == 200 for p in s["parameters"].values())
    # The posterior below the truth, for one global.
    biased = {**ranks, "lag": np.minimum(99, ranks["lag"] + 20)}
    s = sbc.summary(rows_of(biased, 200))
    assert not s["verdict"]["calibrated"] and s["parameters"]["lag"]["p"] < 0.001
    # A posterior too narrow: ranks piled at both ends, a U.
    u = np.where(rng.random(200) < 0.5, rng.integers(0, 15, size=200), rng.integers(85, 100, size=200))
    assert not sbc.summary(rows_of({**ranks, "tau_t": u}, 200))["verdict"]["calibrated"]
    # Draws that explain the eggs worse than the truth: the log likelihood's
    # ranks at the top, the globals' uniform.
    top = {**ranks, "loglik": rng.integers(90, 100, size=200)}
    assert not sbc.summary(rows_of(top, 200))["verdict"]["calibrated"]


def test_the_band_test_holds_its_level_and_simes_combines():
    # The band test's p-value is uniform for uniform ranks: about 5% of
    # calibrated sets fall below 0.05.
    rng = np.random.default_rng(2)
    null = sbc.ecdf_null(100, 99)
    ps = [sbc.ecdf_p(rng.integers(0, 100, size=100), 99, null) for _ in range(400)]
    assert 0.02 < np.mean(np.array(ps) < 0.05) < 0.09
    assert sbc.simes([0.5, 0.5, 0.5]) == 0.5
    assert abs(sbc.simes([0.01, 0.9, 0.9]) - 0.03) < 1e-12
    assert abs(sbc.simes([0.02, 0.03, 0.9]) - 0.045) < 1e-12
