"""Scoring a population on cooks the fit never saw (DECISIONS.md 37,
INFERENCE.md section 9): one step ahead, by proper scoring rules.

For each held-out cook, a cloud of particles is drawn from the population -
what the app would draw on a fresh install - and the cook's eggs are taken in
order. Before each egg the cloud predicts every answer; the answer the cook
gave is scored; then the cloud is weighted by it, as the app's filter is.
Summed over a cook's eggs the log score is the prequential log marginal
likelihood.

- The LOG SCORE is primary: the log of the probability given to the answer.
  The 5% unrelated share keeps it finite.
- The RANKED PROBABILITY SCORE, for the three ordered answers.
- RELIABILITY: the predicted chance of each answer against how often it was
  given, in ten bins.
- A RANDOMISED PIT for each ordinal answer, which is uniform when the
  predictive is calibrated.

Probe readings are scored by their log predictive density.
"""

from __future__ import annotations

import math

import numpy as np
from scipy.special import erfc
from scipy.stats import norm

from .data import Eggs


def particles(pop: dict, constants: dict, m: int, seed: int) -> dict:
    """A cloud drawn from a population file's `prior`, as `createPrior`
    draws one, in the fit's coordinates."""
    rng = np.random.default_rng(seed)
    p = pop["prior"]
    a0 = constants["alphaDefault"]
    sz = constants["alphaRelSd"]
    g = lambda: rng.standard_normal(m)
    log_alpha = math.log(p["alpha_m2s"]["median"]) + p["alpha_m2s"]["logSd"] * g()
    return {
        "z": (log_alpha - math.log(a0)) / sz,
        "taste": p["logDoseOffset"]["mean"] + p["logDoseOffset"]["sd"] * g(),
        "white": p["whiteOffset"]["mean"] + p["whiteOffset"]["sd"] * g(),
        "noise": p["noise"]["median"] * np.exp(p["noise"]["logSd"] * g()),
        "gap": p["whiteFirmGap"]["median"] * np.exp(p["whiteFirmGap"]["logSd"] * g()),
    }


def column(table_row: np.ndarray, z: np.ndarray, z_grid: np.ndarray) -> np.ndarray:
    return np.interp(z, z_grid, table_row)


def probs(c: dict, ly, lw, target, cloud):
    band = c["feedbackBand"]
    u = c["unrelated"]
    latent = ly - (target + cloud["taste"])
    soft = norm.cdf((-band - latent) / cloud["noise"])
    firm = norm.cdf((latent - band) / cloud["noise"])
    right = np.clip(1 - soft - firm, 0, 1)
    yolk = (1 - u) * np.stack([soft, right, firm], -1) + u / 3
    wl = lw - (c["logWhiteTarget"] + cloud["white"])
    sw = cloud["noise"] * c["whiteNoisePerYolk"]
    runny = norm.cdf(-wl / sw)
    wfirm = norm.cdf((wl - cloud["gap"]) / sw)
    tender = np.clip(1 - runny - wfirm, 0, 1)
    white = (1 - u) * np.stack([runny, tender, wfirm], -1) + u / 3
    return yolk, white


def probe_density(c: dict, peak, reading):
    sigma = c["probeInstrumentSd_C"]
    rate = 1.0 / c["probeHandlingMean_C"]
    shortfall = peak - reading
    tail = erfc((rate * sigma * sigma - shortfall) / (math.sqrt(2) * sigma))
    with np.errstate(divide="ignore"):
        dens = np.where(tail > 0, 0.5 * rate * np.exp(0.5 * rate ** 2 * sigma ** 2 - rate * shortfall + np.log(np.maximum(tail, 1e-300))), 0.0)
    return (1 - c["probeUnrelated"]) * dens + c["probeUnrelated"] / c["probeUnrelatedSpan_C"]


def rps(p: np.ndarray, k: int) -> float:
    """The ranked probability score of answer k under p (three ordered
    answers): the squared distance between the cumulative distributions."""
    cp = np.cumsum(p)[:-1]
    co = np.array([1.0 if k <= j else 0.0 for j in range(len(p) - 1)])
    return float(np.sum((cp - co) ** 2) / (len(p) - 1))


def score(eggs: Eggs, pop: dict, m: int = 4000, seed: int = 7) -> dict:
    c = eggs.constants
    rng = np.random.default_rng(seed + 1)
    out = {"yolk": [], "white": [], "probe": [], "rps_yolk": [], "rps_white": [],
           "pit_yolk": [], "pit_white": [], "rel_right": [], "rel_runny": [], "by_egg": {}}
    for ci in range(len(eggs.cooks)):
        idx = np.where(eggs.cook == ci)[0]
        idx = idx[np.argsort(eggs.seq[idx])]
        cloud = particles(pop, c, m, seed + ci)
        logw = np.zeros(m)
        for n, e in enumerate(idx):
            w = np.exp(logw - logw.max())
            w /= w.sum()
            ly = column(eggs.log_yolk[e], cloud["z"], eggs.z_grid)
            lw = column(eggs.log_white[e], cloud["z"], eggs.z_grid)
            yolk, white = probs(c, ly, lw, eggs.target[e], cloud)
            py = w @ yolk
            pw = w @ white
            like = np.ones(m)
            if eggs.yolk[e] >= 0:
                k = int(eggs.yolk[e])
                out["yolk"].append(math.log(py[k]))
                out["rps_yolk"].append(rps(py, k))
                out["pit_yolk"].append(float(np.sum(py[:k]) + rng.uniform() * py[k]))
                out["rel_right"].append((float(py[1]), 1.0 if k == 1 else 0.0))
                out["by_egg"].setdefault(n, []).append(math.log(py[k]))
                like *= yolk[:, k]
            if eggs.white[e] >= 0:
                k = int(eggs.white[e])
                out["white"].append(math.log(pw[k]))
                out["rps_white"].append(rps(pw, k))
                out["pit_white"].append(float(np.sum(pw[:k]) + rng.uniform() * pw[k]))
                out["rel_runny"].append((float(pw[0]), 1.0 if k == 0 else 0.0))
                like *= white[:, k]
            if not math.isnan(eggs.probe[e]):
                pk = column(eggs.peak[e], cloud["z"], eggs.z_grid)
                dens = probe_density(c, pk, eggs.probe[e])
                out["probe"].append(math.log(float(w @ dens)))
                like *= dens
            logw = logw + np.log(np.maximum(like, 1e-300))
    return summarise(out)


def reliability(pairs: list[tuple[float, float]], bins: int = 10) -> list[dict]:
    rows = []
    if not pairs:
        return rows
    p = np.array([x for x, _ in pairs])
    o = np.array([y for _, y in pairs])
    for b in range(bins):
        sel = (p >= b / bins) & (p < (b + 1) / bins if b < bins - 1 else p <= 1.0)
        if sel.sum() == 0:
            continue
        rows.append({"bin": f"{b / bins:.1f}-{(b + 1) / bins:.1f}", "n": int(sel.sum()),
                     "predicted": float(p[sel].mean()), "observed": float(o[sel].mean())})
    return rows


def ece(rows: list[dict]) -> float:
    n = sum(r["n"] for r in rows)
    return sum(r["n"] * abs(r["predicted"] - r["observed"]) for r in rows) / n if n else float("nan")


def summarise(out: dict) -> dict:
    mean = lambda xs: float(np.mean(xs)) if xs else float("nan")
    rel_right = reliability(out["rel_right"])
    rel_runny = reliability(out["rel_runny"])
    pit = lambda xs: np.histogram(xs, bins=10, range=(0, 1))[0].tolist() if xs else []
    return {
        "answers": {"yolk": len(out["yolk"]), "white": len(out["white"]), "probe": len(out["probe"])},
        "log_score": {"yolk": mean(out["yolk"]), "white": mean(out["white"]), "probe": mean(out["probe"]),
                      "all_answers": mean(out["yolk"] + out["white"])},
        "rps": {"yolk": mean(out["rps_yolk"]), "white": mean(out["rps_white"])},
        "by_egg_yolk_log_score": {str(k): mean(v) for k, v in sorted(out["by_egg"].items())},
        "reliability": {"just_right": rel_right, "runny": rel_runny,
                        "ece_just_right": ece(rel_right), "ece_runny": ece(rel_runny)},
        "pit": {"yolk": pit(out["pit_yolk"]), "white": pit(out["pit_white"])},
    }
