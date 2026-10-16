"""Simulation-based calibration (Talts, Betancourt, Simpson, Vehtari and
Gelman 2018): whether the fit's posterior is what its prior and its
likelihood say it should be. Run by hand; never in CI.

    uv run --project fit python -m eggfit sbc --reps 200 --out fit/data/sbc

Each repetition draws the nine globals from the fit's own prior
(`model.prior`), simulates cooks from them with the app's own simulator
(`node tools/eggs.ts simulate --truth`, then `emulate`), fits them, and
counts how many of `--draws` posterior draws, thinned evenly from the
chains, fall below the truth. If the fit is calibrated, that rank is uniform
on 0..draws for every global; a hump in the middle is a posterior too wide, a
U too narrow, a slope a bias. The simulated eggs' log likelihood is ranked
the same way, at the truth (every cook's own, from the simulator) against
each draw: a fit that ignores its data has uniform ranks for every global,
but its draws explain the eggs worse than the truth does, so this rank piles
at the top (Modrák et al. 2023, "Simulation-based calibration checking for
Bayesian computation: the choice of test quantities shapes sensitivity").

`sbc.md` in `--out` has one verdict for all ten (`verdict`), each one's
p-value and histogram, and how many repetitions' own chains failed R-hat,
the ESS or divergences.

What is checked is the model, not the published fit: every egg counts once
(the open tier's discount, DECISIONS.md 2, deliberately tempers the open eggs
and is not a posterior), and nothing is held out. The simulator's cooks are
Student-t and lognormal as the model's are, and its answers go through the
app's own probits, so a failure is the inference's or the emulator's (its
grid ends at 4 literature sds, and a cook beyond is clamped), not a
difference of models. The ranks are only as good as the draws are
independent: thin to no more draws than the chains' ESS, or the histogram is
humped for that alone.

Each repetition is written as it ends (`ranks.jsonl`), and a run picks up
where one stopped: `--reps` is the total. `--shard i/k` runs every k-th, so
k processes (each with its chains on cores of its own) can share one
`--out`; any run summarises what is there.
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import time

import numpy as np

from . import data, diagnostics, model

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SAMPLE = os.path.join(ROOT, "fit", "tests", "emulated-sample.json")

#: Each global as tools/eggsSimulate.ts's `Truth` has it, and back.
TO_TRUTH = {"mu_z": ("muZ", None), "tau_z": ("tauZ", None), "lag": ("lag", None), "tau_w": ("tauW", None),
            "tau_t": ("tauT", None), "log_s0": ("noiseMedian", math.exp), "sig_s": ("noiseLogSd", None),
            "log_g0": ("gapMedian", math.exp), "sig_g": ("gapLogSd", None)}

#: What is ranked: the nine globals and the eggs' log likelihood.
QUANTITIES = model.GLOBALS + ["loglik"]

#: How often a calibrated fit may fail the verdict.
ALPHA = 0.05


def add_parser(sub) -> None:
    s = sub.add_parser("sbc", help="simulation-based calibration of the fit, by hand")
    s.add_argument("--reps", type=int, default=200, help="repetitions in all (a run resumes)")
    s.add_argument("--out", required=True, help="a directory for every repetition's files and the summary")
    s.add_argument("--cooks", type=int, default=40)
    s.add_argument("--draws", type=int, default=99, help="posterior draws each rank is out of")
    s.add_argument("--warmup", type=int, default=500)
    # The spreads between cooks mix slowly (tests/test_recovery.py), and a
    # truth from the prior can make them slower: on the first twenty
    # repetitions' truths, at 1,000 draws a chain 12 failed the diagnostics
    # (diagnostics.py; 9 of them R-hat), at 2,000 one did, at R-hat 1.0103.
    # A repetition whose chains fail is still ranked, but its ranks are less
    # to be believed.
    s.add_argument("--samples", type=int, default=3000, help="draws a chain, before thinning")
    s.add_argument("--chains", type=int, default=4)
    s.add_argument("--target-accept", type=float, default=0.99)
    s.add_argument("--shard", default="0/1",
                   help="i/k: run only the repetitions numbered i mod k, so k processes share --out")
    s.add_argument("--seed", type=int, default=20261016)
    s.add_argument("--keep", action="store_true", help="keep each repetition's records and emulated eggs")


def draw_truth(rng: np.random.Generator, constants: dict) -> dict:
    """The nine globals from the model's prior, by its own distributions."""
    from jax import random

    key = random.PRNGKey(int(rng.integers(0, 2**31 - 1)))
    out = {}
    for name, p in model.prior(constants).items():
        key, k = random.split(key)
        out[name] = float(p.sample(k))
    return out


def as_truth(g: dict) -> dict:
    """The globals as `simulate --truth` reads them."""
    return {TO_TRUTH[n][0]: (TO_TRUTH[n][1](v) if TO_TRUTH[n][1] else v) for n, v in g.items()}


def node(*args: str) -> None:
    subprocess.run(["node", "tools/eggs.ts", *args], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)


def cooks_truth(eggs: data.Eggs, path: str, n_cooks: int) -> np.ndarray:
    """Every cook's five as the simulator drew them (truth.json), in the
    fit's order of cooks, as `model.cooks_of` has them; a cook with no egg
    left after emulation pads the end, as the first cook (it has no eggs)."""
    with open(path) as fh:
        by_uid = {c["uid"]: c for c in json.load(fh)["cooks"]}
    rows = [[by_uid[u][k] for k in ("z", "taste", "white", "noise", "gap")] for u in eggs.cooks]
    rows += [rows[0]] * (n_cooks - len(rows))
    return np.array(rows)


def one(rep: int, a, constants: dict, rng: np.random.Generator) -> dict:
    """One repetition: a truth from the prior, cooks from it, the fit, the ranks."""
    import jax
    import jax.numpy as jnp

    t0 = time.time()
    g = draw_truth(rng, constants)
    d = os.path.join(os.path.abspath(a.out), f"rep-{rep:04d}")
    os.makedirs(d, exist_ok=True)
    truth_in = os.path.join(d, "truth-in.json")
    with open(truth_in, "w") as fh:
        json.dump(as_truth(g), fh)
    sim, emulated = os.path.join(d, "sim.jsonl"), os.path.join(d, "emulated.json")
    node("simulate", sim, os.path.join(d, "truth.json"), str(a.cooks), str(a.seed + rep), "--truth", truth_in)
    node("emulate", sim, emulated)
    t1 = time.time()
    eggs = data.load(emulated)
    # Every egg at full weight: the model's posterior, untempered.
    eggs.tier[:] = 1
    draws = model.fit(eggs, warmup=a.warmup, samples=a.samples, chains=a.chains, seed=rep,
                      target_accept=a.target_accept)
    diag = diagnostics.check(draws["_chains"], int(draws["_divergences"]), model.GLOBALS)
    n = len(draws["mu_z"])
    keep = np.linspace(0, n - 1, a.draws).round().astype(int)
    ranks = {name: int(np.sum(draws[name][keep] < g[name])) for name in model.GLOBALS}
    arrays = model.arrays(eggs, np.ones(eggs.n))
    ll = jax.vmap(lambda v: model.loglik(constants, arrays, model.cooks_of(v)))(
        {k: jnp.asarray(draws[k][keep]) for k in model.GLOBALS + ["ez", "et", "ew", "es", "eg"]})
    truth = cooks_truth(eggs, os.path.join(d, "truth.json"), len(eggs.cooks))
    ranks["loglik"] = int(np.sum(np.asarray(ll) < float(model.loglik(constants, arrays, jnp.asarray(truth)))))
    if not a.keep:
        for f in (sim, emulated):
            os.remove(f)
    return {"rep": rep, "truth": g, "ranks": ranks, "eggs": int(eggs.n), "draws": a.draws,
            "divergences": diag["divergences"], "rhat_max": max(r["rhat"] for r in diag["rows"]),
            "ess_min": min(r["ess_bulk"] for r in diag["rows"]), "diagnostics_ok": diag["ok"],
            "seconds_simulate": round(t1 - t0, 1), "seconds_fit": round(time.time() - t1, 1)}


def ecdf_gamma(ranks: np.ndarray, draws: int) -> np.ndarray:
    """Säilynoja, Bürkner and Vehtari's (2022, "Graphical test for discrete
    uniformity and its applications in goodness-of-fit evaluation and
    multiple sample comparison") statistic for each row of `ranks` (sets of
    ranks on 0..draws): over every point of the ranks' ECDF, the smallest
    two-sided binomial tail probability of its count, which is binomial
    under uniformity. A row's ECDF leaves the simultaneous band of a level
    when this is below the band's adjusted level."""
    from scipy.stats import binom

    ranks = np.atleast_2d(ranks)
    n = ranks.shape[1]
    k = np.arange(1, draws + 1)
    counts = np.stack([np.bincount(r, minlength=draws + 1) for r in ranks]).cumsum(axis=1)[:, :draws]
    z = k / (draws + 1)
    tail = np.minimum(binom.cdf(counts, n, z), binom.sf(counts - 1, n, z))
    return np.minimum(1.0, 2.0 * tail.min(axis=1))


def ecdf_null(n: int, draws: int, sims: int = 4000, seed: int = 0) -> np.ndarray:
    """`ecdf_gamma` of `sims` sets of `n` ranks drawn uniform on 0..draws,
    sorted: its distribution when the fit is calibrated."""
    rng = np.random.default_rng(seed)
    return np.sort(ecdf_gamma(rng.integers(0, draws + 1, size=(sims, n)), draws))


def ecdf_p(ranks: np.ndarray, draws: int, null: np.ndarray) -> float:
    """The chance a calibrated fit's ranks have an ECDF at least this far
    outside the band: the simultaneous band test's p-value."""
    g = float(ecdf_gamma(ranks, draws)[0])
    return (1 + int(np.searchsorted(null, g, side="right"))) / (len(null) + 1)


def simes(ps: list[float]) -> float:
    """Simes's (1986) p-value that every one of `ps` is from a calibrated
    quantity: the smallest of m p_(i) / i over the sorted p-values."""
    s = np.sort(ps)
    return float(min(1.0, np.min(len(s) * s / np.arange(1, len(s) + 1))))


def summary(rows: list[dict]) -> dict:
    draws = rows[0]["draws"]
    null = ecdf_null(len(rows), draws)
    out = {"reps": len(rows), "draws": draws, "parameters": {}}
    for q in QUANTITIES:
        r = np.array([row["ranks"][q] for row in rows])
        out["parameters"][q] = {"p": ecdf_p(r, draws, null), "mean_rank_fraction": float(np.mean(r) / draws),
                                "counts": np.bincount(r * 10 // (draws + 1), minlength=10)[:10].tolist()}
    out["verdict"] = verdict(out)
    out["divergent_reps"] = sum(1 for row in rows if row["divergences"] > 0)
    out["failed_diagnostics_reps"] = sum(1 for row in rows if not row["diagnostics_ok"])
    out["seconds_per_rep"] = float(np.mean([row["seconds_simulate"] + row["seconds_fit"] for row in rows]))
    return out


def verdict(s: dict) -> dict:
    """One test of all ten: each quantity's ECDF test, and Simes's test of
    the ten p-values (`simes`). Bonferroni or Holm, as one pass or fail,
    would fail on the smallest p-value alone, below ALPHA / 10; Simes fails
    whenever they do and also on several small ones together. It is exact
    for independent tests and holds its level under positive dependence
    (Sarkar 1998); the ten are ranked in the same repetitions, so they are
    not independent."""
    p = simes([s["parameters"][q]["p"] for q in QUANTITIES])
    return {"p": p, "alpha": ALPHA, "calibrated": bool(p >= ALPHA)}


def summary_md(s: dict) -> str:
    v = s["verdict"]
    lines = ["# Simulation-based calibration of the fit", "",
             f"{s['reps']} repetitions, each rank out of {s['draws']} draws. "
             f"{s['divergent_reps']} repetitions had a divergent transition, {s['failed_diagnostics_reps']} failed "
             f"R-hat, the ESS or divergences (diagnostics.py). {s['seconds_per_rep']:.0f} s a repetition.", "",
             f"**{'Calibrated' if v['calibrated'] else 'NOT calibrated'}**: Simes's p over the ten is {v['p']:.3f}, "
             f"{'at or above' if v['calibrated'] else 'below'} {v['alpha']}.", "",
             "Each p is the ranks' ECDF against the simultaneous band of uniform ranks (Säilynoja et al. 2022); "
             "the verdict is the one test of all ten, so no p is read on its own. Mean rank near 0.5 is unbiased: "
             "above it, the posterior sits below the truth. The log likelihood's piles at the top when the draws "
             "explain the eggs worse than the truth does.", "",
             "| quantity | p | mean rank | counts by tenth |", "|---|---|---|---|"]
    for name, p in s["parameters"].items():
        lines.append(f"| {name} | {p['p']:.3f} | {p['mean_rank_fraction']:.2f} | {' '.join(str(c) for c in p['counts'])} |")
    lines += ["", "## Histograms", ""]
    for name, p in s["parameters"].items():
        top = max(p["counts"]) or 1
        lines += [f"{name}:", "```"]
        lines += [f"{i:2d} {'#' * round(30 * c / top):30s} {c}" for i, c in enumerate(p["counts"])]
        lines += ["```", ""]
    return "\n".join(lines)


def read_rows(path: str) -> list[dict]:
    if not os.path.exists(path):
        return []
    with open(path) as fh:
        return [json.loads(line) for line in fh if line.strip()]


def run(a) -> int:
    os.makedirs(a.out, exist_ok=True)
    path = os.path.join(a.out, "ranks.jsonl")
    rows = read_rows(path)
    if rows and rows[0]["draws"] != a.draws:
        raise SystemExit(f"{path} has ranks out of {rows[0]['draws']} draws, not {a.draws}: another --out")
    constants = data.load(SAMPLE).constants
    done = {row["rep"] for row in rows}
    shard, shards = (int(x) for x in a.shard.split("/"))
    for rep in range(shard, a.reps, shards):
        # The repetition's own generator, so a resumed run draws what one
        # uninterrupted run would have.
        rng = np.random.default_rng([a.seed, rep])
        if rep in done:
            continue
        row = one(rep, a, constants, rng)
        rows.append(row)
        # One line, appended whole: shards sharing the file do not interleave.
        with open(path, "a") as fh:
            fh.write(json.dumps(row) + "\n")
        print(f"rep {rep + 1}/{a.reps}: {row['seconds_simulate'] + row['seconds_fit']:.0f} s, "
              f"R-hat at most {row['rhat_max']:.3f}, ESS at least {row['ess_min']:.0f}, "
              f"{row['divergences']} divergent", flush=True)
    # Every shard's, as the file has them now.
    rows = {row["rep"]: row for row in read_rows(path) if row["rep"] < a.reps}
    rows = [rows[k] for k in sorted(rows)]
    if not rows:
        return 0
    s = summary(rows)
    with open(os.path.join(a.out, "sbc.json"), "w") as fh:
        json.dump(s, fh, indent=2)
    md = summary_md(s)
    with open(os.path.join(a.out, "sbc.md"), "w") as fh:
        fh.write(md)
    print(md)
    return 0 if s["verdict"]["calibrated"] else 1
