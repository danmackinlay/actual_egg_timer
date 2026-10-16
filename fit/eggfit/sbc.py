"""Simulation-based calibration (Talts, Betancourt, Simpson, Vehtari and
Gelman 2018): whether the fit's posterior is what its prior and its
likelihood say it should be. Run by hand; never in CI.

    uv run --project fit python -m eggfit sbc --out fit/data/sbc

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
(the open tier's discount deliberately tempers the open eggs
and is not a posterior), and nothing is held out. The simulator's cooks are
Student-t and lognormal as the model's are, and its answers go through the
app's own probits, so a failure is the inference's or the emulator's (its
grid ends at 4 literature sds, and a cook beyond is clamped), not a
difference of models. The ranks are only as good as the draws are
independent: thin to no more draws than the chains' ESS, or the histogram is
a U for that alone, as for a posterior too narrow, since draws that move
together fall on the same side of the truth together.

HOW IT RUNS. `--cores` workers each take a repetition, simulate it, and fit
it on a CPU device of their own, its chains one after another (`sampler`),
so no repetition waits for another's. The sampler is NUTS as model.fit runs
it, compiled once a device for each shape of data: every dataset is padded
with eggs at weight zero (`padded`) to one of a few shapes. Vectorising the
fit over repetitions instead was more than four times slower, at four
chains a core: a vectorised NUTS steps every dataset until the longest
trajectory among them ends, and one repetition's trajectories can be six
times another's. Each repetition is written as it ends (`ranks.jsonl`), and
a run picks up where one stopped: `--reps` is the total.
"""

from __future__ import annotations

import json
import math
import os
import queue
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

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

#: Padding rounds a dataset's eggs up to a multiple of this, and its old
#: answers and probe readings to a multiple of PAD_INDICES: few shapes, so
#: few compilations, and little likelihood spent on padding.
PAD_EGGS, PAD_INDICES = 32, 8


def add_parser(sub) -> None:
    s = sub.add_parser("sbc", help="simulation-based calibration of the fit, by hand")
    s.add_argument("--reps", type=int, default=200, help="repetitions in all (a run resumes)")
    s.add_argument("--out", required=True, help="a directory for every repetition's files and the summary")
    # Few cooks, so a repetition simulates and fits quickly: the log
    # likelihood's rank keeps the check's power over the data.
    s.add_argument("--cooks", type=int, default=20)
    s.add_argument("--draws", type=int, default=99, help="posterior draws each rank is out of")
    s.add_argument("--warmup", type=int, default=500)
    # Two chains of 1,000 left every global a bulk ESS of at least the 99
    # draws ranked in 198 repetitions of 200; R-hat needs two chains.
    s.add_argument("--samples", type=int, default=1000, help="draws a chain, before thinning")
    s.add_argument("--chains", type=int, default=2)
    s.add_argument("--cores", type=int, default=8, help="repetitions simulated and fitted at once")
    s.add_argument("--target-accept", type=float, default=0.99)
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


def rep_dir(a, rep: int) -> str:
    return os.path.join(os.path.abspath(a.out), f"rep-{rep:04d}")


def simulate(rep: int, a, constants: dict) -> dict:
    """A repetition's truth from the prior and its cooks, simulated and
    emulated into its directory: the truth."""
    # The repetition's own generator, so a resumed run draws what one
    # uninterrupted run would have.
    g = draw_truth(np.random.default_rng([a.seed, rep]), constants)
    d = rep_dir(a, rep)
    os.makedirs(d, exist_ok=True)
    truth_in = os.path.join(d, "truth-in.json")
    with open(truth_in, "w") as fh:
        json.dump(as_truth(g), fh)
    sim = os.path.join(d, "sim.jsonl")
    node("simulate", sim, os.path.join(d, "truth.json"), str(a.cooks), str(a.seed + rep), "--truth", truth_in)
    node("emulate", sim, os.path.join(d, "emulated.json"))
    return g


def cooks_truth(eggs: data.Eggs, path: str, n_cooks: int) -> np.ndarray:
    """Every cook's five as the simulator drew them (truth.json), in the
    fit's order of cooks, as `model.cooks_of` has them; a cook with no egg
    left after emulation pads the end, as the first cook (it has no eggs)."""
    with open(path) as fh:
        by_uid = {c["uid"]: c for c in json.load(fh)["cooks"]}
    rows = [[by_uid[u][k] for k in ("z", "taste", "white", "noise", "gap")] for u in eggs.cooks]
    rows += [rows[0]] * (n_cooks - len(rows))
    return np.array(rows)


def shape_of(eggs: data.Eggs) -> tuple[int, int, int, int]:
    """Eggs, cooks, eggs answered the old way, eggs with a probe reading."""
    return eggs.n, len(eggs.cooks), int(np.sum(eggs.yolk >= 0)), int(np.sum(~np.isnan(eggs.probe)))


def padded(eggs: data.Eggs, n_eggs: int, n_old: int, n_probed: int) -> dict:
    """`model.arrays` at full weight, padded to `n_eggs` eggs with copies of
    the first at weight zero, and the old answers' and probes' indices to
    `n_old` and `n_probed` with the first padding egg's. A padding egg's
    every term is finite, so its weight of zero takes it out of the
    likelihood and its gradient alike; it gives the yolk word and the white
    an answer and the old yolk none, and its probe reading is its own peak."""
    pad = n_eggs - eggs.n
    assert pad >= 1, "at least one padding egg, for the indices to point at"

    def more(x, fill=None):
        extra = np.repeat(x[:1], pad, axis=0) if fill is None else np.full((pad,) + x.shape[1:], fill, dtype=x.dtype)
        return np.concatenate([x, extra])

    p = data.Eggs(uid=eggs.uid + [eggs.uid[0]] * pad, cook=more(eggs.cook, 0), cooks=eggs.cooks, tier=more(eggs.tier, 1),
                  trusted=more(eggs.trusted, False), seq=more(eggs.seq), target=more(eggs.target),
                  yolk=more(eggs.yolk, -1), yolk_word=more(eggs.yolk_word, 2), white=more(eggs.white, 1),
                  probe=more(eggs.probe, np.nan), log_yolk=more(eggs.log_yolk), log_white=more(eggs.log_white),
                  peak=more(eggs.peak), z_grid=eggs.z_grid, constants=eggs.constants)
    weight = np.concatenate([np.ones(eggs.n), np.zeros(pad)])
    d = model.arrays(p, weight)
    first = eggs.n
    d["old"] = np.concatenate([d["old"], np.full(n_old - len(d["old"]), first)]).astype(np.int32)
    d["probed"] = np.concatenate([d["probed"], np.full(n_probed - len(d["probed"]), first)]).astype(np.int32)
    d["probe"] = np.where(np.arange(n_eggs) >= first, p.peak[:, p.peak.shape[1] // 2], p.probe)
    return d


def padded_up(eggs: data.Eggs) -> dict:
    """`padded` to the next multiples of PAD_EGGS and PAD_INDICES."""
    n, _, old, probed = shape_of(eggs)
    up = lambda x, q: q * (x // q + 1)  # noqa: E731
    return padded(eggs, up(n, PAD_EGGS), up(old, PAD_INDICES), up(probed, PAD_INDICES))


def sampler(c: dict, z_grid: np.ndarray, n_cooks: int, a):
    """NUTS as model.fit runs it - the same model, kernel and adaptation,
    every chain its own - for any dataset `padded` alike, compiled once for
    each shape and device. Returns fit(d, seed, device): `a.chains` chains,
    one after another on `device`, and by chain each global's draws, the
    eggs' log likelihood at each draw, and the divergent transitions."""
    import jax
    from jax import lax, random
    from numpyro.distributions import biject_to
    from numpyro.infer.hmc import hmc
    from numpyro.infer.util import initialize_model

    example = padded_up(data.load(SAMPLE))
    info = initialize_model(random.PRNGKey(0), model.model, model_args=(c, example, n_cooks), dynamic_args=True)
    potential_gen = info.potential_fn
    init_kernel, sample_kernel = hmc(potential_fn_gen=lambda d: potential_gen(c, {**d, "z_grid": z_grid}, n_cooks),
                                     algo="NUTS")
    support = {n: biject_to(p.support) for n, p in model.prior(c).items()}
    shapes = sorted((k, v.shape) for k, v in info.param_info.z.items())

    @jax.jit
    def chain(key, d):
        k_init, k_run = random.split(key)
        # Uniform on (-2, 2), unconstrained: numpyro's init_to_uniform.
        z0 = {k: random.uniform(kk, s, minval=-2.0, maxval=2.0)
              for kk, (k, s) in zip(random.split(k_init, len(shapes)), shapes)}
        state = init_kernel(z0, a.warmup, target_accept_prob=a.target_accept, model_args=(d,), rng_key=k_run)
        state = lax.fori_loop(0, a.warmup, lambda i, s: sample_kernel(s, model_args=(d,)), state)

        def step(s, _):
            s = sample_kernel(s, model_args=(d,))
            v = {k: support[k](x) if k in support else x for k, x in s.z.items()}
            ll = model.loglik(c, {**d, "z_grid": z_grid}, model.cooks_of(v))
            return s, ({k: v[k] for k in model.GLOBALS}, ll, s.diverging)

        return lax.scan(step, state, None, length=a.samples)[1]

    # Compiled ahead, one shape and device at a time: numpyro's handlers keep
    # one stack for the process, so two threads tracing the model at once
    # would push onto each other's.
    lock, compiled = threading.Lock(), {}

    def fit(d: dict, seed: int, device) -> dict:
        assert np.array_equal(d["z_grid"], z_grid), "every dataset on the emulator's one grid"
        on = jax.device_put({k: v for k, v in d.items() if k != "z_grid"}, device)
        keys = [jax.device_put(random.fold_in(random.PRNGKey(seed), k), device) for k in range(a.chains)]
        sig = (device.id,) + tuple((k, v.shape) for k, v in sorted(on.items()))
        with lock:
            if sig not in compiled:
                compiled[sig] = chain.lower(keys[0], on).compile()
        runs = [compiled[sig](key, on) for key in keys]
        return {"globals": {k: np.stack([np.asarray(r[0][k]) for r in runs]) for k in model.GLOBALS},
                "loglik": np.stack([np.asarray(r[1]) for r in runs]),
                "divergences": int(sum(np.asarray(r[2]).sum() for r in runs))}

    return fit


def ranks_of(chains: dict, ll: np.ndarray, truth: dict, ll_truth: float, draws: int) -> dict:
    """How many of `draws` posterior draws, thinned evenly from the pooled
    chains ((chains, samples) each), fall below the truth: each global's, and
    the eggs' log likelihood's."""
    pooled = {k: np.asarray(v).reshape(-1) for k, v in chains.items()}
    pooled["loglik"] = np.asarray(ll).reshape(-1)
    n = len(pooled["loglik"])
    keep = np.linspace(0, n - 1, draws).round().astype(int)
    at = {**truth, "loglik": ll_truth}
    return {q: int(np.sum(pooled[q][keep] < at[q])) for q in QUANTITIES}


def one(rep: int, a, constants: dict, fit, devices: queue.Queue) -> dict:
    """One repetition: a truth from the prior, cooks from it, the fit, the ranks."""
    import jax.numpy as jnp

    t0 = time.time()
    truth = simulate(rep, a, constants)
    t1 = time.time()
    d = rep_dir(a, rep)
    eggs = data.load(os.path.join(d, "emulated.json"))
    assert len(eggs.cooks) <= a.cooks
    # Every egg at full weight: the model's posterior, untempered.
    eggs.tier[:] = 1
    arrays = padded_up(eggs)
    device = devices.get()
    try:
        out = fit(arrays, a.seed + rep, device)
    finally:
        devices.put(device)
    diag = diagnostics.check(out["globals"], out["divergences"], model.GLOBALS)
    cooks = cooks_truth(eggs, os.path.join(d, "truth.json"), a.cooks)
    ll_truth = float(model.loglik(constants, arrays, jnp.asarray(cooks)))
    if not a.keep:
        for f in ("sim.jsonl", "emulated.json"):
            os.remove(os.path.join(d, f))
    return {"rep": rep, "truth": truth, "ranks": ranks_of(out["globals"], out["loglik"], truth, ll_truth, a.draws),
            "eggs": int(eggs.n), "cooks": a.cooks, "draws": a.draws,
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
    rows, n = ranks.shape
    # Every row's count of each rank at once, and the ECDF's counts from them.
    flat = (ranks + (draws + 1) * np.arange(rows)[:, None]).ravel()
    counts = np.bincount(flat, minlength=rows * (draws + 1)).reshape(rows, draws + 1).cumsum(axis=1)[:, :draws]
    # A count is 0..n, so each point's tail is looked up in a table of every
    # count's, made once: each point of a large null costs a lookup, not two
    # binomial tails.
    z = (np.arange(1, draws + 1) / (draws + 1))[:, None]
    c = np.arange(n + 1)[None, :]
    table = np.minimum(binom.cdf(c, n, z), binom.sf(c - 1, n, z))
    tail = table[np.arange(draws)[None, :], counts]
    return np.minimum(1.0, 2.0 * tail.min(axis=1))


#: How many calibrated sets of ranks `ecdf_null` draws. The verdict fails on
#: one p of the ten below ALPHA / 10 (`simes`), the null's 0.5% point, which
#: 4,000 sets put at their 20th-smallest value, with about 22% Monte Carlo
#: error: at the one seed drawn, a calibrated fit failed about 6% of the
#: time, not 5%. 200,000 put it at their 1,000th, about 3%, and the false
#: alarms near 4.9%, for under a second of drawing. It also sets the least p
#: a quantity can have, 1 / (NULL_SIMS + 1), and so Simes's, ten times that.
NULL_SIMS = 200_000


def ecdf_null(n: int, draws: int, sims: int = NULL_SIMS, seed: int = 0) -> np.ndarray:
    """`ecdf_gamma` of `sims` sets of `n` ranks drawn uniform on 0..draws,
    sorted: its distribution when the fit is calibrated. Drawn in blocks, so
    that no more than 10,000 sets are held at once."""
    rng = np.random.default_rng(seed)
    blocks = [ecdf_gamma(rng.integers(0, draws + 1, size=(min(10_000, sims - i), n)), draws)
              for i in range(0, sims, 10_000)]
    return np.sort(np.concatenate(blocks))


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
    out = {"reps": len(rows), "draws": draws, "cooks": rows[0]["cooks"], "parameters": {}}
    for q in QUANTITIES:
        r = np.array([row["ranks"][q] for row in rows])
        out["parameters"][q] = {"p": ecdf_p(r, draws, null), "mean_rank_fraction": float(np.mean(r) / draws),
                                "counts": np.bincount(r * 10 // (draws + 1), minlength=10)[:10].tolist()}
    out["verdict"] = verdict(out)
    out["divergent_reps"] = sum(1 for row in rows if row["divergences"] > 0)
    out["failed_diagnostics_reps"] = sum(1 for row in rows if not row["diagnostics_ok"])
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


def summary_md(s: dict, settings: str) -> str:
    v = s["verdict"]
    lines = ["# Simulation-based calibration of the fit", "",
             f"{s['reps']} repetitions of {s['cooks']} cooks, each rank out of {s['draws']} draws ({settings}). "
             f"{s['divergent_reps']} repetitions had a divergent transition, {s['failed_diagnostics_reps']} failed "
             f"R-hat, the ESS or divergences (diagnostics.py).", "",
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
    import jax

    os.makedirs(a.out, exist_ok=True)
    path = os.path.join(a.out, "ranks.jsonl")
    rows = read_rows(path)
    if rows and (rows[0]["draws"], rows[0]["cooks"]) != (a.draws, a.cooks):
        raise SystemExit(f"{path} has ranks out of {rows[0]['draws']} draws of {rows[0]['cooks']} cooks, "
                         f"not {a.draws} of {a.cooks}: another --out")
    sample = data.load(SAMPLE)
    constants = sample.constants
    done = {row["rep"] for row in rows}
    todo = [rep for rep in range(a.reps) if rep not in done]
    t0 = time.time()
    devices: queue.Queue = queue.Queue()
    for device in jax.local_devices()[:a.cores]:
        devices.put(device)
    fit = sampler(constants, sample.z_grid, a.cooks, a)
    with ThreadPoolExecutor(max_workers=a.cores) as pool:
        for f in as_completed([pool.submit(one, rep, a, constants, fit, devices) for rep in todo]):
            row = f.result()
            rows.append(row)
            with open(path, "a") as fh:
                fh.write(json.dumps(row) + "\n")
            print(f"rep {row['rep'] + 1} ({len(rows)}/{a.reps}): {row['seconds_simulate']:.0f} s simulating, "
                  f"{row['seconds_fit']:.0f} s fitting, R-hat at most {row['rhat_max']:.3f}, "
                  f"ESS at least {row['ess_min']:.0f}, {row['divergences']} divergent", flush=True)
    rows = {row["rep"]: row for row in read_rows(path) if row["rep"] < a.reps}
    rows = [rows[k] for k in sorted(rows)]
    if not rows:
        return 0
    s = summary(rows)
    settings = f"{a.chains} chains of {a.samples} draws after {a.warmup} of warmup"
    if todo:
        s["seconds"] = round(time.time() - t0)
        settings += f"; {len(todo)} in {s['seconds']} s on {a.cores} cores"
    with open(os.path.join(a.out, "sbc.json"), "w") as fh:
        json.dump(s, fh, indent=2)
    md = summary_md(s, settings)
    with open(os.path.join(a.out, "sbc.md"), "w") as fh:
        fh.write(md)
    print(md)
    return 0 if s["verdict"]["calibrated"] else 1
