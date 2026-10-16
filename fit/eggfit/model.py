"""The population model (INFERENCE.md sections 2, 3 and 6), in NumPyro.

GLOBAL, learned: the time-scale's centre (`mu_z`, in literature sds of log
alpha, so 0 is the literature) and the white's lag (`lag`, decades of white
dose). The taste's centre is 0 by convention: ordinal answers cannot tell a
kitchen that runs fast from a population that likes its yolks firm, and the
thermometer owners are what test the convention (section 5).

PER COOK, heavy-tailed (Student-t, 4 degrees of freedom), so a cluster of
odd cooks is absorbed as outlying cooks rather than moving the centre: a
time-scale `z`, a taste offset, a white cutpoint (the lag plus what this cook
calls runny), and lognormal noise and firm gap - the app's particle, which
since 0.5 has no carryover: the apps hold it at the physics (DECISIONS.md 95,
section 2).

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
    """The log likelihood of every egg's answers and reading, as the app's
    probits put it, every answer's probability and then the one given: the
    form the tests hold to infer.ts. NUTS runs `fast_loglik`."""
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


#: Beyond any cut, in sds: an open end of an ordered probit, finite so that
#: no gradient meets an infinity. In sds, not in doses: a cook drawn with a
#: large noise must still find the end categories open.
OPEN_END = 1e3


def _ends(k, last: int, a, b):
    """The standardised bounds of answer `k` of 0..last: `a` below and `b`
    above, open at the two ends."""
    return jnp.where(k == 0, -OPEN_END, a), jnp.where(k == last, OPEN_END, b)


def _between(a, b):
    """Phi(b) - Phi(a), for a <= b, from whichever tail is the smaller, so a
    category far up the scale keeps its digits as one far down does."""
    sign = jnp.where(a + b > 0.0, -1.0, 1.0)
    return jnp.maximum(sign * (norm.cdf(sign * b) - norm.cdf(sign * a)), 0.0)


def fast_loglik(c: dict, d: dict, z, taste, white_offset, noise, gap):
    """`egg_loglik`, as NUTS evaluates it: the same numbers
    (tests/test_likelihood.py holds the two together), computed for each
    egg's own answer only - two normal cdfs an answer, not one for every cut
    - and the old yolk answer and the probe only on the eggs that have them.
    The sampler spends nearly all its time here."""
    z0 = float(d["z_grid"][0])
    dz = float(d["z_grid"][1] - d["z_grid"][0])
    k = d["log_yolk"].shape[1]
    x = jnp.clip((z - z0) / dz, 0.0, k - 1.0)
    i = jnp.clip(jnp.floor(x).astype(jnp.int32), 0, k - 2)
    f = x - i
    rows = jnp.arange(z.shape[0])
    ly = d["log_yolk"][rows, i] * (1.0 - f) + d["log_yolk"][rows, i + 1] * f
    lw = d["log_white"][rows, i] * (1.0 - f) + d["log_white"][rows, i + 1] * f
    u = c["unrelated"]
    ll = jnp.zeros_like(z)

    if "yolkWordCuts" in c:  # absent from a file emulated before the five words, which has none
        said = ly - taste
        p = _between(*_ends(d["yolk_word"], 4, (d["word_lo"] - said) / noise, (d["word_hi"] - said) / noise))
        ll = ll + jnp.where(d["yolk_word"] >= 0, jnp.log((1.0 - u) * p + u / 5.0), 0.0)

    wl = lw - (c["logWhiteTarget"] + white_offset)
    sw = noise * c["whiteNoisePerYolk"]
    w = d["white"]
    lo = jnp.where(w == 2, gap, 0.0)
    hi = jnp.where(w == 0, 0.0, gap)
    p = _between(*_ends(w, 2, (lo - wl) / sw, (hi - wl) / sw))
    ll = ll + jnp.where(w >= 0, jnp.log((1.0 - u) * p + u / 3.0), 0.0)

    old = d["old"]
    if old.size > 0:
        band = c["feedbackBand"]
        latent = ly[old] - (d["target"][old] + taste[old])
        y = d["yolk"][old]
        lo = jnp.where(y == 2, band, -band)
        hi = jnp.where(y == 0, -band, band)
        n = noise[old]
        p = _between(*_ends(y, 2, (lo - latent) / n, (hi - latent) / n))
        ll = ll.at[old].add(jnp.log((1.0 - u) * p + u / 3.0))

    probed = d["probed"]
    if probed.size > 0:
        fp, ip = f[probed], i[probed]
        pk = d["peak"][probed, ip] * (1.0 - fp) + d["peak"][probed, ip + 1] * fp
        ll = ll.at[probed].add(jnp.log(probe_density(c, pk, d["probe"][probed])))
    return ll


def prior(c: dict) -> dict:
    """The globals' prior, by name, in GLOBALS' order: the model samples from
    it, and so does the calibration check (sbc.py), so the two cannot drift."""
    lit = c["literature"]
    return {
        "mu_z": dist.Normal(0.0, 1.0),
        "tau_z": dist.HalfNormal(0.7),
        "lag": dist.Normal(0.0, 0.5),
        "tau_w": dist.HalfNormal(0.5),
        "tau_t": dist.HalfNormal(0.3),
        "log_s0": dist.Normal(math.log(lit["noise"]["median"]), 0.5),
        "sig_s": dist.HalfNormal(0.5),
        "log_g0": dist.Normal(math.log(lit["whiteFirmGap"]["median"]), 0.4),
        "sig_g": dist.HalfNormal(0.4),
    }


def cooks_of(v: dict):
    """Every cook's time-scale, taste, white offset, noise and firm gap, from
    the globals and the cooks' standardised effects in `v`."""
    return jnp.stack([v["mu_z"] + v["tau_z"] * v["ez"], v["tau_t"] * v["et"], v["lag"] + v["tau_w"] * v["ew"],
                      jnp.exp(v["log_s0"] + v["sig_s"] * v["es"]), jnp.exp(v["log_g0"] + v["sig_g"] * v["eg"])],
                     axis=-1)


def loglik(c: dict, d: dict, cooks):
    """The eggs' log likelihood, each at its weight, given every cook's five
    (`cooks_of`, cooks by five): each cook's to its eggs in one gather."""
    each = cooks[d["cook"]]
    ll = fast_loglik(c, d, z=each[:, 0], taste=each[:, 1], white_offset=each[:, 2], noise=each[:, 3], gap=each[:, 4])
    return jnp.sum(d["weight"] * ll)


def model(c: dict, d: dict, n_cooks: int):
    v = {name: numpyro.sample(name, p) for name, p in prior(c).items()}
    with numpyro.plate("cooks", n_cooks):
        v["ez"] = numpyro.sample("ez", dist.StudentT(4.0, 0.0, 1.0))
        v["et"] = numpyro.sample("et", dist.StudentT(4.0, 0.0, 1.0))
        v["ew"] = numpyro.sample("ew", dist.StudentT(4.0, 0.0, 1.0))
        v["es"] = numpyro.sample("es", dist.Normal(0.0, 1.0))
        v["eg"] = numpyro.sample("eg", dist.Normal(0.0, 1.0))
    numpyro.factor("eggs", loglik(c, d, cooks_of(v)))


def arrays(eggs: Eggs, weight: np.ndarray) -> dict:
    # Each word answer's cuts, below and above; the ends are opened in
    # `fast_loglik`.
    cuts = np.concatenate([[0.0], eggs.constants.get("yolkWordCuts", [0.0] * 4), [0.0]])
    word = np.maximum(eggs.yolk_word, 0)
    return {
        "word_lo": jnp.asarray(cuts[word]),
        "word_hi": jnp.asarray(cuts[word + 1]),
        # The eggs answered the old way, and those with a probe reading.
        "old": np.flatnonzero(eggs.yolk >= 0),
        "probed": np.flatnonzero(~np.isnan(eggs.probe)),
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


def use_cores(chains: int) -> None:
    """One CPU device a chain, so `fit` runs them in parallel. Only before
    JAX first computes anything: call it first thing."""
    import os

    numpyro.set_host_device_count(min(chains, os.cpu_count() or 1))


def fit(eggs: Eggs, open_power: float = 0.0, open_cap: float = 1.0, warmup: int = 600,
        samples: int = 600, chains: int = 2, seed: int = 0, target_accept: float = 0.99) -> dict:
    """NUTS over the globals and every cook's effects. Returns the draws,
    pooled over the chains, and the globals' chain by chain in `_chains`."""
    import jax
    from jax import random
    from numpyro.infer import MCMC, NUTS

    weight = tier_weights(eggs, open_power, open_cap)
    # The chains side by side where there is a device for each (`use_cores`):
    # it is one compilation, not one a chain, and the chains run at once.
    method = "parallel" if jax.local_device_count() >= chains else "sequential"
    mcmc = MCMC(NUTS(model, target_accept_prob=target_accept), num_warmup=warmup, num_samples=samples,
                num_chains=chains, chain_method=method, progress_bar=False)
    mcmc.run(random.PRNGKey(seed), eggs.constants, arrays(eggs, weight), len(eggs.cooks))
    draws = {k: np.asarray(v) for k, v in mcmc.get_samples().items()}
    # The globals chain by chain, for R-hat and the ESS (diagnostics.py).
    by_chain = mcmc.get_samples(group_by_chain=True)
    draws["_chains"] = {k: np.asarray(by_chain[k]) for k in GLOBALS}
    extra = mcmc.get_extra_fields()
    draws["_divergences"] = np.asarray(extra["diverging"]).sum()
    full = full_weight(eggs)
    draws["_weights"] = {"attested": float(np.sum(eggs.tier == 1)),
                         "trusted": float(np.sum(eggs.trusted & (eggs.tier == 0))),
                         "open": float(np.sum(~full)),
                         "open_weight": float(weight[~full][0]) if np.any(~full) else None}
    return draws
