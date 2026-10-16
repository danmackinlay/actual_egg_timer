"""The fit recovers a population whose answer is known, and its sampler can be
believed doing it.

tests/recovery-sample.json is sixty cooks drawn from a known truth (`truth`,
tools/fixtures/fitRecovery.ts's RECOVERY_TRUTH: tools/eggsSimulate.ts's
SIMULATED_TRUTH with the time-scale's centre in the prior's tail) with a
fixed seed and emulated, written by `npm run fixtures`, so this runs without
node. NUTS on it, every egg at full weight (the open tier's discount
tempers the open eggs on purpose and is not a posterior),
must:

- find the nine globals' truth, together, no further from the posterior
  than a calibrated fit puts it nine times in ten (`joint_p`, below).
- narrow the prior on the globals the data identify (IDENTIFIED), so that a
  fit which lost its likelihood, and so returned the prior, fails here even
  where the prior happens to cover the truth.
- reach R-hat below 1.01 and a bulk ESS of 100 a chain on every global, with
  no divergent transition (eggfit/diagnostics.py says why those numbers).

Every global's truth is printed with its posterior quantile whether the test
passes or not, so a near miss shows in CI's log.

The sampler's settings are about the least that pass with room, tried over
several seeds (a GitHub runner's chains are another seed, in effect: its
floating point differs in the last bits). The spreads between cooks (tau_t,
sig_s, tau_z) mix slowly, at an ESS of one draw in five to ten, and R-hat
under 1.01 wants several hundred. At a target acceptance of 0.95 or 0.98,
about one transition in ten thousand diverged, where a cook's noise can be
small (log_s0 low, sig_s high) and its answers' probit sharp; at 0.99 none
did.

    uv run --project fit python -m pytest fit/tests
"""

import json
import pathlib

import numpy as np

from eggfit import data, diagnostics, model
from eggfit.__main__ import TRUTH_OF

SAMPLE = pathlib.Path(__file__).parent / "recovery-sample.json"

CHAINS, WARMUP, SAMPLES, TARGET_ACCEPT = 4, 500, 1500, 0.99
#: How often a calibrated fit may fail the joint test.
ALPHA = 0.10
#: The globals the eggs identify: the time-scale's centre and the white's lag
#: (model.py's two learned globals; INFERENCE.md section 9 recovers both on
#: simulated cooks). The spreads between cooks, the noise and the firm gap
#: trade against each other with three to ten eggs a cook (section 9, "Not
#: recovered"), so how far each narrows is not the data's to promise.
IDENTIFIED = ("mu_z", "lag")
#: Each identified global's posterior sd, at most, as a fraction of its
#: prior's. A fit that ignores the data keeps the prior's, 1 (0.995 and 1.005
#: with the likelihood's weights zeroed); these sixty cooks leave mu_z 0.06
#: and lag 0.14-0.15 over four seeds, so a half rejects the prior by a factor
#: of two and passes the weaker, lag, three times over. It is this sample's:
#: drawn instead with mu_z at +2, a kitchen that firms most whites, lag
#: narrowed only to 0.58.
NARROWED = 0.5


def joint_p(draws: dict, truth: dict, prior: dict) -> float:
    """The share of posterior draws at least as far from the posterior's
    mean as the truth is, by the Mahalanobis distance under the draws'
    covariance, all nine globals on the sampler's unconstrained scale (the
    spreads' logs). If the truth is distributed as a draw, this is uniform,
    so the check fails a calibrated fit ALPHA of the time.

    One test of the nine, not an interval each: Holm, as one pass or fail,
    is Bonferroni, failing on the worst global at ALPHA / 9 alone; Simes
    counts several near misses but not that globals are correlated, as the
    white's lag and firm gap are (-0.75), so two misses that are one in the
    posterior count twice. The distance takes the correlations whole.
    Referred to chi-square on nine degrees of freedom it would assume the
    posterior Gaussian, which even on the log scale it is not: the draws'
    own 90th percentile is 15.7 to 16.0 over four seeds, chi-square's 14.7,
    so a calibrated fit would fail 12% of the time, not 10%. Referred to the
    draws, it assumes nothing of the posterior's shape."""
    from numpyro.distributions import biject_to

    def free(name, x):
        return np.asarray(biject_to(prior[name].support).inv(np.asarray(x, dtype=float)))

    d = np.stack([free(n, draws[n]) for n in model.GLOBALS], axis=1)
    t = np.array([free(n, truth[n]) for n in model.GLOBALS])
    m, precision = d.mean(axis=0), np.linalg.inv(np.cov(d, rowvar=False))
    far = np.einsum("ij,jk,ik->i", d - m, precision, d - m)
    return float(np.mean(far >= (t - m) @ precision @ (t - m)))


def test_the_fit_recovers_a_known_population_and_mixes(capsys):
    raw = json.loads(SAMPLE.read_text())
    eggs = data.load(str(SAMPLE))
    eggs.tier[:] = 1
    draws = model.fit(eggs, warmup=WARMUP, samples=SAMPLES, chains=CHAINS, seed=0, target_accept=TARGET_ACCEPT)
    diag = diagnostics.check(draws["_chains"], int(draws["_divergences"]), model.GLOBALS)
    prior = model.prior(eggs.constants)
    truth = {}
    rows, failures = [], []
    for name, d in zip(model.GLOBALS, diag["rows"]):
        key, f = TRUTH_OF[name]
        truth[name] = f(raw["truth"][key]) if f else raw["truth"][key]
        x = draws[name]
        lo, hi = np.quantile(x, [0.05, 0.95])
        narrowed = float(np.std(x) / np.sqrt(prior[name].variance))
        rows.append(f"{name}: truth {truth[name]:.3f} at posterior quantile {np.mean(x < truth[name]):.3f}, "
                    f"90% {lo:.3f} to {hi:.3f}, sd {narrowed:.3f} of the prior's, "
                    f"R-hat {d['rhat']:.4f}, bulk ESS {d['ess_bulk']:.0f}")
        if name in IDENTIFIED and not narrowed < NARROWED:
            failures.append(f"{name}'s posterior sd is {narrowed:.3f} of its prior's, not below {NARROWED}: "
                            "the data did not narrow it")
    p = joint_p(draws, truth, prior)
    rows.append(f"all nine: {100 * p:.1f}% of the draws are at least as far from the posterior's mean as the truth")
    if not p >= ALPHA:
        failures.append(f"the truth is further from the posterior than all but {100 * p:.1f}% of its draws, "
                        f"under {100 * ALPHA:.0f}%")
    if not diag["ok"]:
        failures.append(f"the sampler failed: {'; '.join(diag['failures'])}")
    table = "\n".join(rows)
    with capsys.disabled():
        print(f"\nrecovery, {CHAINS} chains of {SAMPLES}:\n{table}")
    assert diag["chains"] == CHAINS
    assert not failures, f"{'; '.join(failures)}\n{table}"
