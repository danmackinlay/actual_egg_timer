"""Whether NUTS can be believed: R-hat, effective sample size and divergences.

R-hat and the bulk ESS are Vehtari, Gelman, Simpson, Carpenter and Buerkner's
(2021, "Rank-normalization, folding, and localization"): every draw is
replaced by its rank across all chains, mapped to a normal score, and split
R-hat and ESS are computed on those, so a heavy tail cannot hide a chain that
has not mixed. R-hat is the larger of the bulk's and the folded draws'
(|x - median|), which catches chains that agree on the centre and not on the
spread. The ESS is numpyro's (Geyer's initial monotone sequence), on the
normal scores, and over the chains split in half.

THE THRESHOLDS, held by `python -m eggfit fit` before it publishes and by
tests/test_recovery.py:
- R-hat below 1.01 on every global parameter: Vehtari et al.'s threshold.
- Bulk ESS at least 100 per chain (400 with the fit's four), their
  recommendation for R-hat itself to be reliable. It also makes an
  interval's ends good enough to check a truth against: the Monte Carlo
  error of a 5% quantile, in probability, is sqrt(0.05 * 0.95 / ESS), 1.1%
  at 400, so the nominal 5% tail is somewhere in 4-6%.
- No divergent transition at all: one means the sampler met curvature it
  could not follow, and the draws near it are biased, however few.
"""

from __future__ import annotations

import numpy as np
from numpyro.diagnostics import effective_sample_size, split_gelman_rubin
from scipy.special import ndtri

RHAT_MAX = 1.01
ESS_PER_CHAIN = 100


def _normal_scores(x: np.ndarray) -> np.ndarray:
    """(chains, draws) as normal scores of their pooled ranks, ties averaged."""
    flat = x.reshape(-1)
    order = np.argsort(flat, kind="mergesort")
    ranks = np.empty(flat.size)
    ranks[order] = np.arange(1, flat.size + 1)
    # Average the ranks of tied draws (a parameter stuck at a value).
    _, inverse, counts = np.unique(flat, return_inverse=True, return_counts=True)
    if np.any(counts > 1):
        sums = np.bincount(inverse, weights=ranks)
        ranks = sums[inverse] / counts[inverse]
    return ndtri((ranks - 0.375) / (flat.size + 0.25)).reshape(x.shape)


def _split(x: np.ndarray) -> np.ndarray:
    """Each chain in halves, as two: a chain that drifts disagrees with itself."""
    half = x.shape[1] // 2
    return np.concatenate([x[:, :half], x[:, half:2 * half]], axis=0)


def rhat(x: np.ndarray) -> float:
    """Rank-normalised split R-hat, the bulk's or the folded draws', whichever
    is larger. `x` is (chains, draws)."""
    bulk = float(split_gelman_rubin(_normal_scores(x)))
    folded = float(split_gelman_rubin(_normal_scores(np.abs(x - np.median(x)))))
    return max(bulk, folded)


def bulk_ess(x: np.ndarray) -> float:
    """Rank-normalised bulk ESS of (chains, draws), over the split chains."""
    return float(effective_sample_size(_split(_normal_scores(x))))


def check(chains: dict[str, np.ndarray], divergences: int, names: list[str]) -> dict:
    """R-hat and bulk ESS of each of `names` in `chains` ((chains, draws)
    each), and whether all of them, and the divergences, pass."""
    rows = []
    for name in names:
        x = np.asarray(chains[name])
        n_chains = x.shape[0]
        r, e = rhat(x), bulk_ess(x)
        rows.append({"parameter": name, "rhat": r, "ess_bulk": e,
                     "ok": bool(r < RHAT_MAX and e >= ESS_PER_CHAIN * n_chains)})
    n_chains = int(np.asarray(chains[names[0]]).shape[0])
    failures = [f"{r['parameter']}: R-hat {r['rhat']:.3f}, bulk ESS {r['ess_bulk']:.0f}" for r in rows if not r["ok"]]
    if n_chains < 2:
        failures.append(f"{n_chains} chain: R-hat needs at least two")
    if divergences > 0:
        failures.append(f"{divergences} divergent transition{'' if divergences == 1 else 's'}")
    return {"rows": rows, "divergences": int(divergences), "chains": n_chains,
            "rhat_max": RHAT_MAX, "ess_min": ESS_PER_CHAIN * n_chains, "ok": not failures, "failures": failures}


def report_lines(d: dict) -> list[str]:
    """The diagnostics as report.md has them."""
    lines = ["## Whether the sampler can be believed", "",
             f"{d['chains']} chains, {d['divergences']} divergent transitions. Each global needs R-hat below "
             f"{d['rhat_max']} and a bulk ESS of at least {d['ess_min']} (eggfit/diagnostics.py).", "",
             "| parameter | R-hat | bulk ESS | passes |", "|---|---|---|---|"]
    for r in d["rows"]:
        lines.append(f"| {r['parameter']} | {r['rhat']:.4f} | {r['ess_bulk']:.0f} | {'yes' if r['ok'] else 'NO'} |")
    lines.append("")
    if d["ok"]:
        lines += ["All pass.", ""]
    else:
        lines += ["**Failed:** " + "; ".join(d["failures"]) + ".", ""]
    return lines
