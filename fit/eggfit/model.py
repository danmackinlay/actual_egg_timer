"""The population model (INFERENCE.md sections 2, 3 and 6), in NumPyro.

GLOBAL, learned: the time-scale's centre (`mu_z`, in literature sds of log
alpha, so 0 is the literature) and the white's lag (`lag`, decades of white
dose). The taste's centre is 0 by convention: ordinal answers cannot tell a
kitchen that runs fast from a population that likes its yolks firm, and the
thermometer owners are what test the convention (section 5).

PER COOK, heavy-tailed (Student-t, 4 degrees of freedom), so a cluster of
odd cooks is absorbed as outlying cooks rather than moving the centre: a
time-scale `z`, a taste offset, a white cutpoint (the lag plus what this cook
calls runny), and lognormal noise and firm gap - the app's particle, less
carryover, which stays at the physics until cooks vary their cooling enough
to reach it (section 2).

THE LIKELIHOOD is the app's own (src/core/infer.ts): the ordered probit for
the yolk and the white, each with the 5% unrelated share, and the probe's
exponentially modified Gaussian with its 2% floor, read off each egg's
emulator column. The yolk is the yolk the cook got, in the slider's five
words, cut where the slider's word changes (DECISIONS.md 92), or on an egg
answered before that, too soft / just right / too firm against the level
asked for, scored as it always was.

THE TIERS (DECISIONS.md 2): an attested egg counts once; an open one (the
web, an iPhone that could not attest) enters at a power below one - 0.5 to
start - and the open tier's total weight is capped at the attested tier's,
so no number of browser tabs can outvote the phones. The discount is only on
what open eggs teach the population; nothing here touches what they teach
their own cook's app. An egg under an ID on the owner's trusted list counts
once, as an attested one does, whatever its tier (DECISIONS.md 82; data.py).
"""

from __future__ import annotations

import math

import jax.numpy as jnp
import numpy as np
import numpyro
import numpyro.distributions as dist
from jax.scipy.special import erfc
from jax.scipy.stats import norm

from .data import Eggs

GLOBALS = ["mu_z", "tau_z", "lag", "tau_w", "tau_t", "log_s0", "sig_s", "log_g0", "sig_g"]


def interp(table, z, z0: float, dz: float):
    """Each egg's column at its cook's time-scale, linear in z - which is
    linear in log alpha, as the app's grids are - and clamped at the ends."""
    k = table.shape[1]
    x = jnp.clip((z - z0) / dz, 0.0, k - 1.0)
    i = jnp.clip(jnp.floor(x).astype(jnp.int32), 0, k - 2)
    f = x - i
    a = jnp.take_along_axis(table, i[:, None], axis=1)[:, 0]
    b = jnp.take_along_axis(table, (i + 1)[:, None], axis=1)[:, 0]
    return a * (1.0 - f) + b * f


def word_probs(c: dict, ly, taste, noise):
    """P(runny, soft, jammy, fudgy, hard), with the unrelated share spread
    over five: infer.ts's `yolkWordProbit` and `withUnrelatedWord`."""
    u = c["unrelated"]
    cuts = c["yolkWordCuts"]
    said = ly - taste
    upto = [norm.cdf((cut - said) / noise) for cut in cuts]
    probs = [upto[0]] + [jnp.clip(upto[k] - upto[k - 1], 0.0, 1.0) for k in range(1, 4)]
    probs.append(norm.cdf((said - cuts[3]) / noise))
    return (1.0 - u) * jnp.stack(probs, axis=-1) + u / 5.0


def answer_probs(c: dict, ly, lw, target, taste, white_offset, noise, gap):
    """P(too soft, just right, too firm) and P(runny, tender, firm), with the
    unrelated share: infer.ts's `yolkProbit`, `whiteProbit` and
    `withUnrelated`."""
    band = c["feedbackBand"]
    u = c["unrelated"]
    latent = ly - (target + taste)
    soft = norm.cdf((-band - latent) / noise)
    firm = norm.cdf((latent - band) / noise)
    right = jnp.clip(1.0 - soft - firm, 0.0, 1.0)
    yolk = (1.0 - u) * jnp.stack([soft, right, firm], axis=-1) + u / 3.0
    wl = lw - (c["logWhiteTarget"] + white_offset)
    sw = noise * c["whiteNoisePerYolk"]
    runny = norm.cdf(-wl / sw)
    wfirm = norm.cdf((wl - gap) / sw)
    tender = jnp.clip(1.0 - runny - wfirm, 0.0, 1.0)
    white = (1.0 - u) * jnp.stack([runny, tender, wfirm], axis=-1) + u / 3.0
    return yolk, white


def probe_density(c: dict, peak, reading):
    """infer.ts's `probeLikelihood`: the reading against the peak, an
    exponentially modified Gaussian, with the unrelated floor."""
    sigma = c["probeInstrumentSd_C"]
    rate = 1.0 / c["probeHandlingMean_C"]
    shortfall = peak - reading
    tail = erfc((rate * sigma * sigma - shortfall) / (math.sqrt(2.0) * sigma))
    dens = 0.5 * rate * jnp.exp(0.5 * rate * rate * sigma * sigma - rate * shortfall + jnp.log(jnp.maximum(tail, 1e-300)))
    dens = jnp.where(tail > 0.0, dens, 0.0)
    return (1.0 - c["probeUnrelated"]) * dens + c["probeUnrelated"] / c["probeUnrelatedSpan_C"]


def full_weight(eggs: Eggs) -> np.ndarray:
    """The eggs that count once: attested, or under an ID the owner vouches
    for (DECISIONS.md 82), whatever tier it came in."""
    return (eggs.tier == 1) | eggs.trusted


def tier_weights(eggs: Eggs, open_power: float, open_cap: float) -> np.ndarray:
    """Each egg's power in the likelihood: 1 attested or trusted; for the
    other open eggs `open_power`, lowered further if need be so their total
    weight is at most `open_cap` times the full-weight eggs' (DECISIONS.md
    2). A trusted egg counts as attested on both sides of the cap: the owner
    has vouched for it as Apple vouches for a phone."""
    full = full_weight(eggs)
    n_full = float(np.sum(full))
    n_open = float(np.sum(~full))
    w_open = open_power
    if n_open > 0:
        w_open = min(open_power, open_cap * n_full / n_open)
    return np.where(full, 1.0, w_open)


def egg_loglik(c: dict, d: dict, z, taste, white_offset, noise, gap):
    """The log likelihood of every egg's answers and reading."""
    z0 = float(d["z_grid"][0])
    dz = float(d["z_grid"][1] - d["z_grid"][0])
    ly = interp(d["log_yolk"], z, z0, dz)
    lw = interp(d["log_white"], z, z0, dz)
    yolk, white = answer_probs(c, ly, lw, d["target"], taste, white_offset, noise, gap)
    ll_y = jnp.where(d["yolk"] >= 0, jnp.log(jnp.take_along_axis(yolk, jnp.maximum(d["yolk"], 0)[:, None], axis=1)[:, 0]), 0.0)
    ll_w = jnp.where(d["white"] >= 0, jnp.log(jnp.take_along_axis(white, jnp.maximum(d["white"], 0)[:, None], axis=1)[:, 0]), 0.0)
    ll_yw = 0.0
    if "yolkWordCuts" in c:  # absent from a file emulated before the five words, which has none
        words = word_probs(c, ly, taste, noise)
        ll_yw = jnp.where(d["yolk_word"] >= 0,
                          jnp.log(jnp.take_along_axis(words, jnp.maximum(d["yolk_word"], 0)[:, None], axis=1)[:, 0]),
                          0.0)
    has_probe = ~jnp.isnan(d["probe"])
    pk = interp(d["peak"], z, z0, dz)
    ll_p = jnp.where(has_probe, jnp.log(probe_density(c, pk, jnp.where(has_probe, d["probe"], pk))), 0.0)
    return ll_y + ll_yw + ll_w + ll_p


def model(c: dict, d: dict, n_cooks: int):
    lit = c["literature"]
    mu_z = numpyro.sample("mu_z", dist.Normal(0.0, 1.0))
    tau_z = numpyro.sample("tau_z", dist.HalfNormal(0.7))
    lag = numpyro.sample("lag", dist.Normal(0.0, 0.5))
    tau_w = numpyro.sample("tau_w", dist.HalfNormal(0.5))
    tau_t = numpyro.sample("tau_t", dist.HalfNormal(0.3))
    log_s0 = numpyro.sample("log_s0", dist.Normal(math.log(lit["noise"]["median"]), 0.5))
    sig_s = numpyro.sample("sig_s", dist.HalfNormal(0.5))
    log_g0 = numpyro.sample("log_g0", dist.Normal(math.log(lit["whiteFirmGap"]["median"]), 0.4))
    sig_g = numpyro.sample("sig_g", dist.HalfNormal(0.4))
    with numpyro.plate("cooks", n_cooks):
        ez = numpyro.sample("ez", dist.StudentT(4.0, 0.0, 1.0))
        et = numpyro.sample("et", dist.StudentT(4.0, 0.0, 1.0))
        ew = numpyro.sample("ew", dist.StudentT(4.0, 0.0, 1.0))
        es = numpyro.sample("es", dist.Normal(0.0, 1.0))
        eg = numpyro.sample("eg", dist.Normal(0.0, 1.0))
    cook = d["cook"]
    ll = egg_loglik(
        c, d,
        z=(mu_z + tau_z * ez)[cook],
        taste=(tau_t * et)[cook],
        white_offset=(lag + tau_w * ew)[cook],
        noise=jnp.exp(log_s0 + sig_s * es)[cook],
        gap=jnp.exp(log_g0 + sig_g * eg)[cook],
    )
    numpyro.factor("eggs", jnp.sum(d["weight"] * ll))


def arrays(eggs: Eggs, weight: np.ndarray) -> dict:
    return {
        "cook": jnp.asarray(eggs.cook),
        "target": jnp.asarray(eggs.target),
        "yolk": jnp.asarray(eggs.yolk),
        "yolk_word": jnp.asarray(eggs.yolk_word),
        "white": jnp.asarray(eggs.white),
        "probe": jnp.asarray(eggs.probe),
        "log_yolk": jnp.asarray(eggs.log_yolk),
        "log_white": jnp.asarray(eggs.log_white),
        "peak": jnp.asarray(eggs.peak),
        "z_grid": np.asarray(eggs.z_grid),
        "weight": jnp.asarray(weight),
    }


def fit(eggs: Eggs, open_power: float = 0.0, open_cap: float = 1.0, warmup: int = 600,
        samples: int = 600, chains: int = 2, seed: int = 0) -> dict:
    """NUTS over the globals and every cook's effects. Returns the draws."""
    from jax import random
    from numpyro.infer import MCMC, NUTS

    weight = tier_weights(eggs, open_power, open_cap)
    mcmc = MCMC(NUTS(model, target_accept_prob=0.9), num_warmup=warmup, num_samples=samples,
                num_chains=chains, chain_method="sequential", progress_bar=False)
    mcmc.run(random.PRNGKey(seed), eggs.constants, arrays(eggs, weight), len(eggs.cooks))
    draws = {k: np.asarray(v) for k, v in mcmc.get_samples().items()}
    extra = mcmc.get_extra_fields()
    draws["_divergences"] = np.asarray(extra["diverging"]).sum()
    full = full_weight(eggs)
    draws["_weights"] = {"attested": float(np.sum(eggs.tier == 1)),
                         "trusted": float(np.sum(eggs.trusted & (eggs.tier == 0))),
                         "open": float(np.sum(~full)),
                         "open_weight": float(weight[~full][0]) if np.any(~full) else None}
    return draws
