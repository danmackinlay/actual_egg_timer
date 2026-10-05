"""The fit's likelihood is the app's (src/core/infer.ts), to the digit.

tests/emulated-sample.json is `npm run eggs -- emulate` of six simulated
cooks (`npm run eggs -- simulate <out> <truth> 6`, the default seed); its
`checks` are the TypeScript's own answer probabilities - the five yolk words
(DECISIONS.md 92), the old three-way yolk answer and the white - and probe
likelihoods for a dozen eggs, at three time-scales, under one particle. Both
the fit's model (JAX) and its scorer (NumPy) must give the same numbers from
the same emulator columns. Two of its cooks' eggs were answered the old way.

    uv run --project fit python -m pytest fit/tests
"""

import json
import math
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
            words = model.word_probs(c, ly, p["logDoseOffset"], p["noise"])
            np.testing.assert_allclose(np.asarray(words[0]), at["yolkWord"], rtol=1e-6, atol=1e-9)
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
            np.testing.assert_allclose(score.word_probs(c, ly, cloud)[0], at["yolkWord"], rtol=1e-9, atol=1e-12)
            if at["probe"] is not None:
                pk = score.column(np.array(e["peak"]), z, z_grid)
                np.testing.assert_allclose(score.probe_density(c, pk, e["probe"])[0], at["probe"], rtol=1e-9)


def test_each_egg_scores_the_yolk_answer_it_has():
    # An egg answered the old way is scored by the three-way probit and
    # nothing else, exactly as before the five words; one answered in words
    # by the five; never both.
    eggs = data.load(str(SAMPLE))
    assert np.any(eggs.yolk >= 0) and np.any(eggs.yolk_word >= 0)
    assert not np.any((eggs.yolk >= 0) & (eggs.yolk_word >= 0))
    c = eggs.constants
    d = model.arrays(eggs, np.ones(eggs.n))
    n = eggs.n
    z, taste, wo = jnp.zeros(n), jnp.full(n, 0.05), jnp.full(n, 0.1)
    noise, gap = jnp.full(n, 0.23), jnp.full(n, 0.9)
    ll = np.asarray(model.egg_loglik(c, d, z, taste, wo, noise, gap))
    z0, dz = float(eggs.z_grid[0]), float(eggs.z_grid[1] - eggs.z_grid[0])
    ly = model.interp(d["log_yolk"], z, z0, dz)
    lw = model.interp(d["log_white"], z, z0, dz)
    yolk, white = model.answer_probs(c, ly, lw, d["target"], taste, wo, noise, gap)
    words = model.word_probs(c, ly, taste, noise)
    for e in range(n):
        want = 0.0
        if eggs.yolk[e] >= 0:
            want += math.log(float(yolk[e, eggs.yolk[e]]))
        if eggs.yolk_word[e] >= 0:
            want += math.log(float(words[e, eggs.yolk_word[e]]))
        if eggs.white[e] >= 0:
            want += math.log(float(white[e, eggs.white[e]]))
        if np.isnan(eggs.probe[e]):
            np.testing.assert_allclose(ll[e], want, rtol=1e-6, atol=1e-9)


def test_an_older_emulated_file_still_loads_with_no_yolk_words(tmp_path):
    raw = json.loads(SAMPLE.read_text())
    for e in raw["eggs"]:
        e.pop("yolkWord", None)
    raw["constants"].pop("yolkWordCuts", None)
    path = tmp_path / "old.json"
    path.write_text(json.dumps(raw))
    eggs = data.load(str(path))
    assert np.all(eggs.yolk_word == -1)
    d = model.arrays(eggs, np.ones(eggs.n))
    n = eggs.n
    ll = model.egg_loglik(eggs.constants, d, jnp.zeros(n), jnp.zeros(n), jnp.zeros(n), jnp.full(n, 0.2), jnp.ones(n))
    assert np.all(np.isfinite(np.asarray(ll)))


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
