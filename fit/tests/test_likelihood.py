"""The fit's likelihood is the app's (src/core/infer.ts), to the digit.

tests/emulated-sample.json is `npm run eggs -- emulate` of six simulated
cooks; its `checks` are the TypeScript's own answer probabilities and probe
likelihoods for a dozen eggs, at three time-scales, under one particle. Both
the fit's model (JAX) and its scorer (NumPy) must give the same numbers from
the same emulator columns.

    uv run --project fit python -m pytest fit/tests
"""

import json
import pathlib

import jax.numpy as jnp
import numpy as np

from eggfit import data, model, score

SAMPLE = pathlib.Path(__file__).parent / "emulated-sample.json"


def checks():
    raw = json.loads(SAMPLE.read_text())
    eggs = sorted(raw["eggs"], key=lambda e: (e["uid"], e["seq"]))
    # The checks index the file's own order; the loader sorts by cook.
    return raw, raw["eggs"], raw["checks"]


def test_model_likelihood_is_the_apps():
    raw, eggs, cs = checks()
    c = raw["constants"]
    z_grid = np.array(raw["zGrid"])
    z0, dz = float(z_grid[0]), float(z_grid[1] - z_grid[0])
    for chk in cs:
        e = eggs[chk["egg"]]
        p = chk["particle"]
        for at in chk["at"]:
            z = jnp.array([at["z"]])
            ly = model.interp(jnp.array([e["logYolk"]]), z, z0, dz)
            lw = model.interp(jnp.array([e["logWhite"]]), z, z0, dz)
            yolk, white = model.answer_probs(c, ly, lw, jnp.array([e["logYolkTarget"]]), p["logDoseOffset"],
                                             p["whiteOffset"], p["noise"], p["whiteFirmGap"])
            np.testing.assert_allclose(np.asarray(yolk[0]), at["yolk"], rtol=1e-6, atol=1e-9)
            np.testing.assert_allclose(np.asarray(white[0]), at["white"], rtol=1e-6, atol=1e-9)
            if at["probe"] is not None:
                pk = model.interp(jnp.array([e["peak"]]), z, z0, dz)
                dens = model.probe_density(c, pk, jnp.array([e["probe"]]))
                np.testing.assert_allclose(float(dens[0]), at["probe"], rtol=1e-6)


def test_scorer_likelihood_is_the_apps():
    raw, eggs, cs = checks()
    c = raw["constants"]
    z_grid = np.array(raw["zGrid"])
    for chk in cs:
        e = eggs[chk["egg"]]
        p = chk["particle"]
        for at in chk["at"]:
            z = np.array([at["z"]])
            cloud = {"z": z, "taste": np.array([p["logDoseOffset"]]), "white": np.array([p["whiteOffset"]]),
                     "noise": np.array([p["noise"]]), "gap": np.array([p["whiteFirmGap"]])}
            ly = score.column(np.array(e["logYolk"]), z, z_grid)
            lw = score.column(np.array(e["logWhite"]), z, z_grid)
            yolk, white = score.probs(c, ly, lw, e["logYolkTarget"], cloud)
            np.testing.assert_allclose(yolk[0], at["yolk"], rtol=1e-9, atol=1e-12)
            np.testing.assert_allclose(white[0], at["white"], rtol=1e-9, atol=1e-12)
            if at["probe"] is not None:
                pk = score.column(np.array(e["peak"]), z, z_grid)
                np.testing.assert_allclose(score.probe_density(c, pk, e["probe"])[0], at["probe"], rtol=1e-9)


def test_tier_weights_cap_the_open_tier():
    eggs = data.load(str(SAMPLE))
    eggs.tier[:] = 0
    eggs.tier[:3] = 1
    w = model.tier_weights(eggs, open_power=0.5, open_cap=1.0)
    n_open = int(np.sum(eggs.tier == 0))
    assert np.all(w[eggs.tier == 1] == 1.0)
    # Three attested eggs: the open tier's whole weight is capped at three.
    assert abs(np.sum(w[eggs.tier == 0]) - 3.0) < 1e-9 or np.all(w[eggs.tier == 0] == 0.5)
    assert np.all(w[eggs.tier == 0] <= 0.5)
    assert n_open * w[eggs.tier == 0][0] <= 3.0 + 1e-9
