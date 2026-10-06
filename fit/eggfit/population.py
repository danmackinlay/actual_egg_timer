"""From the fit's draws to the population both apps draw a new cook's prior
from (fixtures/population.json; src/core/population.ts).

A NEW COOK is a draw of the globals from the posterior and of a cook's
effects from them: the population predictive. The app's prior is one
lognormal or normal per particle dimension (infer.ts `createPrior`), so each
dimension is summarised by its median and a robust spread - half the width
of its central 68% - which matches a Gaussian's sd and is not inflated by the
Student-t tails the fit gives cooks. The taste's centre is 0, by the fit's
convention. The counter's carryover is not a particle dimension
(DECISIONS.md 95): the apps hold it at 1.0, and the file has no spread for it.
"""

from __future__ import annotations

import datetime
import math

import numpy as np

from .model import GLOBALS


def robust_sd(x: np.ndarray) -> float:
    lo, hi = np.quantile(x, [0.158655, 0.841345])
    return float(0.5 * (hi - lo))


def new_cooks(draws: dict, per_draw: int = 40, seed: int = 1) -> dict:
    """Effects for new cooks, `per_draw` for each posterior draw."""
    rng = np.random.default_rng(seed)
    n = len(draws["mu_z"])
    rep = lambda k: np.repeat(draws[k], per_draw)
    t4 = lambda: rng.standard_t(4.0, size=n * per_draw)
    gauss = lambda: rng.standard_normal(size=n * per_draw)
    return {
        "z": rep("mu_z") + rep("tau_z") * t4(),
        "taste": rep("tau_t") * t4(),
        "white": rep("lag") + rep("tau_w") * t4(),
        "log_noise": rep("log_s0") + rep("sig_s") * gauss(),
        "log_gap": rep("log_g0") + rep("sig_g") * gauss(),
    }


def population(draws: dict, constants: dict, pid: str, source: dict, settings: dict) -> dict:
    a0 = constants["alphaDefault"]
    sz = constants["alphaRelSd"]
    new = new_cooks(draws)
    prior = {
        "alpha_m2s": {"median": a0 * math.exp(sz * float(np.median(new["z"]))), "logSd": sz * robust_sd(new["z"])},
        "logDoseOffset": {"mean": 0.0, "sd": robust_sd(new["taste"])},
        "noise": {"median": math.exp(float(np.median(new["log_noise"]))), "logSd": robust_sd(new["log_noise"])},
        "whiteOffset": {"mean": float(np.median(new["white"])), "sd": robust_sd(new["white"])},
        "whiteFirmGap": {"median": math.exp(float(np.median(new["log_gap"]))), "logSd": robust_sd(new["log_gap"])},
    }
    g = np.stack([draws[k] for k in GLOBALS], axis=1)
    return {
        "about": "The population a new cook's prior is drawn from (src/core/population.ts, INFERENCE.md section 9), as fitted by fit/ (eggfit) from shared eggs: an id, and one spread per particle dimension under \"prior\". \"global\" is the fit's posterior over its global parameters, for the record; the apps read only id and prior. Not hand-edited.",
        "id": pid,
        "fitted": datetime.date.today().isoformat(),
        "source": source,
        "settings": settings,
        "prior": prior,
        "global": {
            "names": GLOBALS,
            "mean": [float(x) for x in g.mean(axis=0)],
            "covariance": [[float(x) for x in row] for row in np.cov(g, rowvar=False)],
        },
    }
