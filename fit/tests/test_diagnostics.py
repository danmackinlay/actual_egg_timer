"""What the fit holds its sampler to before it publishes (eggfit/diagnostics.py),
on chains whose answer is known.

    uv run --project fit python -m pytest fit/tests
"""

import os

import numpy as np

from eggfit import __main__ as cli
from eggfit import diagnostics


def test_independent_chains_pass_and_bad_ones_do_not():
    rng = np.random.default_rng(0)
    good = {"a": rng.normal(size=(4, 1000)), "b": rng.standard_t(3, size=(4, 1000))}
    d = diagnostics.check(good, 0, ["a", "b"])
    assert d["ok"], d["failures"]
    assert all(abs(r["rhat"] - 1.0) < 0.01 and r["ess_bulk"] > 2000 for r in d["rows"])

    # One chain somewhere else: R-hat sees it.
    apart = {"a": good["a"] + np.array([0.0, 0.0, 0.0, 1.0])[:, None]}
    assert not diagnostics.check(apart, 0, ["a"])["ok"]
    # Chains that agree on the centre but not on the spread: the folded R-hat.
    spread = {"a": good["a"] * np.array([1.0, 1.0, 1.0, 3.0])[:, None]}
    assert diagnostics.check(spread, 0, ["a"])["rows"][0]["rhat"] > diagnostics.RHAT_MAX
    # A random walk: every draw like the last, so too few effective draws.
    walk = {"a": np.cumsum(rng.normal(size=(4, 1000)), axis=1)}
    assert diagnostics.check(walk, 0, ["a"])["rows"][0]["ess_bulk"] < diagnostics.ESS_PER_CHAIN * 4
    # One divergent transition fails, whatever the rest.
    one = diagnostics.check(good, 1, ["a", "b"])
    assert not one["ok"] and one["failures"] == ["1 divergent transition"]
    # One chain cannot say whether it mixed.
    assert not diagnostics.check({"a": good["a"][:1]}, 0, ["a"])["ok"]


def test_only_the_apps_population_file_is_publishing(tmp_path):
    assert cli.publishes(cli.PUBLISHED)
    assert cli.publishes(os.path.relpath(cli.PUBLISHED))
    assert not cli.publishes(str(tmp_path / "population.json"))
