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
U too narrow, a slope a bias. `sbc.md` in `--out` has each global's rank
histogram and a chi-square test of uniformity on the binned ranks.

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


def add_parser(sub) -> None:
    s = sub.add_parser("sbc", help="simulation-based calibration of the fit, by hand")
    s.add_argument("--reps", type=int, default=200, help="repetitions in all (a run resumes)")
    s.add_argument("--out", required=True, help="a directory for every repetition's files and the summary")
    s.add_argument("--cooks", type=int, default=40)
    s.add_argument("--draws", type=int, default=99, help="posterior draws each rank is out of")
    s.add_argument("--warmup", type=int, default=500)
    s.add_argument("--samples", type=int, default=1000, help="draws a chain, before thinning")
    s.add_argument("--chains", type=int, default=4)
    s.add_argument("--target-accept", type=float, default=0.99)
    s.add_argument("--shard", default="0/1",
                   help="i/k: run only the repetitions numbered i mod k, so k processes share --out")
    s.add_argument("--seed", type=int, default=20261016)
    s.add_argument("--bins", type=int, default=10, help="at most; fewer while a bin expects under five")
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


def one(rep: int, a, constants: dict, rng: np.random.Generator) -> dict:
    """One repetition: a truth from the prior, cooks from it, the fit, the ranks."""
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
    if not a.keep:
        for f in (sim, emulated):
            os.remove(f)
    return {"rep": rep, "truth": g, "ranks": ranks, "eggs": int(eggs.n), "draws": a.draws,
            "divergences": diag["divergences"], "rhat_max": max(r["rhat"] for r in diag["rows"]),
            "ess_min": min(r["ess_bulk"] for r in diag["rows"]), "diagnostics_ok": diag["ok"],
            "seconds_simulate": round(t1 - t0, 1), "seconds_fit": round(time.time() - t1, 1)}


def bins_for(reps: int, ranks: int, most: int) -> int:
    """The most bins, up to `most`, that divide the ranks evenly and expect at
    least five repetitions each (two at the least)."""
    for b in range(min(most, max(2, reps // 5)), 1, -1):
        if ranks % b == 0:
            return b
    return 2


def summary(rows: list[dict], most_bins: int) -> dict:
    from scipy.stats import chi2

    draws = rows[0]["draws"]
    b = bins_for(len(rows), draws + 1, most_bins)
    width = (draws + 1) // b
    out = {"reps": len(rows), "draws": draws, "bins": b, "parameters": {}}
    for name in model.GLOBALS:
        r = np.array([row["ranks"][name] for row in rows])
        counts = np.bincount(r // width, minlength=b)[:b]
        expected = len(r) / b
        stat = float(np.sum((counts - expected) ** 2 / expected))
        out["parameters"][name] = {"counts": counts.tolist(), "chi2": stat, "df": b - 1,
                                   "p": float(chi2.sf(stat, b - 1)), "mean_rank_fraction": float(np.mean(r) / draws)}
    out["divergent_reps"] = sum(1 for row in rows if row["divergences"] > 0)
    out["failed_diagnostics_reps"] = sum(1 for row in rows if not row["diagnostics_ok"])
    out["seconds_per_rep"] = float(np.mean([row["seconds_simulate"] + row["seconds_fit"] for row in rows]))
    return out


def summary_md(s: dict) -> str:
    lines = ["# Simulation-based calibration of the fit", "",
             f"{s['reps']} repetitions, each rank out of {s['draws']} draws, in {s['bins']} bins of "
             f"{(s['draws'] + 1) // s['bins']} ranks; {s['reps'] / s['bins']:.1f} repetitions a bin if uniform. "
             f"{s['divergent_reps']} repetitions had a divergent transition, {s['failed_diagnostics_reps']} failed "
             f"R-hat, the ESS or divergences (diagnostics.py). {s['seconds_per_rep']:.0f} s a repetition.", "",
             "A p-value is the chi-square test of the binned ranks against uniform; with nine globals, one below "
             "0.05 in nine tests is what chance gives about a third of the time. Mean rank near 0.5 is unbiased: "
             "above it, the posterior sits below the truth.", "",
             "| parameter | counts by bin | chi-square | p | mean rank |", "|---|---|---|---|---|"]
    for name, p in s["parameters"].items():
        lines.append(f"| {name} | {' '.join(str(c) for c in p['counts'])} | {p['chi2']:.1f} on {p['df']} | "
                     f"{p['p']:.3f} | {p['mean_rank_fraction']:.2f} |")
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
    s = summary(rows, a.bins)
    with open(os.path.join(a.out, "sbc.json"), "w") as fh:
        json.dump(s, fh, indent=2)
    md = summary_md(s)
    with open(os.path.join(a.out, "sbc.md"), "w") as fh:
        fh.write(md)
    print(md)
    return 0
