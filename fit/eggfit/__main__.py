"""The population fit (E7; INFERENCE.md section 9).

    uv run --project fit python -m eggfit fit fit/data/emulated.json \\
        --out fit/data/population.json --report fit/data/report.md

fits the population to every cook but a held-out fifth, writes the
population a new cook's prior would be drawn from, and scores it on the
held-out cooks one step ahead against the literature's - and, given the
truth a simulation was drawn from (--truth), against the truth's and with
the recovery of every global parameter. It never writes
fixtures/population.json unless told to (--out), which is publishing: the
next release of both apps then draws from it, and every posterior is replayed
from it. Nor then unless the sampler can be believed - every global's R-hat
and bulk ESS, and no divergent transition (diagnostics.py) - or `--force`
says to publish all the same; report.md says which failed either way.

    uv run --project fit python -m eggfit sbc --reps 200 --out fit/data/sbc

checks the fit's calibration by simulation (sbc.py).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys

import numpy as np

from . import data, diagnostics, model, population, score

PUBLISHED = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                         "fixtures", "population.json")


def publishes(out: str) -> bool:
    """Whether writing `out` is publishing: it is the apps' fixtures/population.json."""
    return os.path.realpath(out) == os.path.realpath(PUBLISHED)


def literature_file(constants: dict) -> dict:
    lit = constants["literature"]
    return {"id": lit["id"], "prior": {k: v for k, v in lit.items() if k != "id"}}


def truth_population(truth: dict, constants: dict) -> dict:
    """The population the simulation drew its cooks from, summarised as the
    fit summarises its own: what a perfect fit would publish."""
    t = truth["truth"]
    n = 200000
    draws = {"mu_z": np.full(1, t["muZ"]), "tau_z": np.full(1, t["tauZ"]), "lag": np.full(1, t["lag"]),
             "tau_w": np.full(1, t["tauW"]), "tau_t": np.full(1, t["tauT"]),
             "log_s0": np.full(1, math.log(t["noiseMedian"])), "sig_s": np.full(1, t["noiseLogSd"]),
             "log_g0": np.full(1, math.log(t["gapMedian"])), "sig_g": np.full(1, t["gapLogSd"])}
    new = population.new_cooks(draws, per_draw=n)
    a0, sz = constants["alphaDefault"], constants["alphaRelSd"]
    return {"id": "truth", "prior": {
        "alpha_m2s": {"median": a0 * math.exp(sz * float(np.median(new["z"]))), "logSd": sz * population.robust_sd(new["z"])},
        "logDoseOffset": {"mean": 0.0, "sd": population.robust_sd(new["taste"])},
        "noise": {"median": math.exp(float(np.median(new["log_noise"]))), "logSd": population.robust_sd(new["log_noise"])},
        "whiteOffset": {"mean": float(np.median(new["white"])), "sd": population.robust_sd(new["white"])},
        "whiteFirmGap": {"median": math.exp(float(np.median(new["log_gap"]))), "logSd": population.robust_sd(new["log_gap"])},
    }}


TRUTH_OF = {"mu_z": ("muZ", None), "tau_z": ("tauZ", None), "lag": ("lag", None), "tau_w": ("tauW", None),
            "tau_t": ("tauT", None), "log_s0": ("noiseMedian", math.log), "sig_s": ("noiseLogSd", None),
            "log_g0": ("gapMedian", math.log), "sig_g": ("gapLogSd", None)}


def recovery(draws: dict, truth: dict) -> list[dict]:
    rows = []
    for name in model.GLOBALS:
        key, f = TRUTH_OF[name]
        true = truth["truth"][key]
        true = f(true) if f else true
        x = draws[name]
        lo, hi = np.quantile(x, [0.05, 0.95])
        rows.append({"parameter": name, "truth": true, "mean": float(x.mean()), "sd": float(x.std()),
                     "q05": float(lo), "q95": float(hi), "covered": bool(lo <= true <= hi)})
    return rows


def report_md(r: dict) -> str:
    lines = ["# The population fit", "",
             f"Fitted on {r['fitting_cooks']} cooks ({r['fitting_eggs']} eggs: {r['weights']['attested']:.0f} attested, "
             f"{r['weights']['trusted']:.0f} open but trusted, at full weight, "
             f"{r['weights']['open']:.0f} open at weight {r['weights']['open_weight']}); scored on {r['held_out_cooks']} held-out cooks "
             f"({r['held_out_eggs']} eggs). NUTS: {r['samples']} draws, {r['divergences']} divergent.", ""]
    if r.get("refused"):
        lines += [f"**Not published:** {r['refused']}", ""]
    lines += diagnostics.report_lines(r["diagnostics"])
    if r.get("recovery"):
        lines += ["## Recovery of the globals", "", "| parameter | truth | posterior mean | sd | 90% interval | covered |",
                  "|---|---|---|---|---|---|"]
        for row in r["recovery"]:
            lines.append(f"| {row['parameter']} | {row['truth']:.3f} | {row['mean']:.3f} | {row['sd']:.3f} | "
                         f"{row['q05']:.3f} to {row['q95']:.3f} | {'yes' if row['covered'] else 'NO'} |")
        lines.append("")
    lines += ["## Held-out cooks, one step ahead", "",
              "| prior drawn from | log score, yolk word | log score, yolk (old) | log score, white | log score, probe | "
              "RPS yolk word | RPS yolk (old) | RPS white | ECE just right | ECE runny |",
              "|---|---|---|---|---|---|---|---|---|---|"]
    for name, s in r["scores"].items():
        ls, rp, rel = s["log_score"], s["rps"], s["reliability"]
        lines.append(f"| {name} | {ls['yolk_word']:.4f} | {ls['yolk']:.4f} | {ls['white']:.4f} | {ls['probe']:.3f} | "
                     f"{rp['yolk_word']:.4f} | {rp['yolk']:.4f} | "
                     f"{rp['white']:.4f} | {100 * rel['ece_just_right']:.1f}% | {100 * rel['ece_runny']:.1f}% |")
    lines += ["", "Higher log scores are better; lower RPS and ECE are better.", ""]
    fitted = r["scores"].get("fitted")
    if fitted:
        lines += ["## Reliability of the fitted population: P(just right)", "", "| predicted | n | mean predicted | observed |", "|---|---|---|---|"]
        for row in fitted["reliability"]["just_right"]:
            lines.append(f"| {row['bin']} | {row['n']} | {row['predicted']:.3f} | {row['observed']:.3f} |")
        lines += ["", "## Randomised PIT, fitted (ten bins; flat when calibrated)", "",
                  f"- yolk word: {fitted['pit']['yolk_word']}", f"- yolk (old): {fitted['pit']['yolk']}",
                  f"- white: {fitted['pit']['white']}", ""]
        lines += ["## Log score by egg, yolk (the first egg is the population's alone)", ""]
        for name, s in r["scores"].items():
            lines.append(f"- {name}: " + ", ".join(f"{int(k) + 1}: {v:.3f}" for k, v in s["by_egg_yolk_log_score"].items()))
        lines += ["", "## Log score by egg, yolk word", ""]
        for name, s in r["scores"].items():
            lines.append(f"- {name}: "
                         + ", ".join(f"{int(k) + 1}: {v:.3f}" for k, v in s["by_egg_yolk_word_log_score"].items()))
        lines.append("")
    lines += ["## The population published", "", "```json", json.dumps(r["population"]["prior"], indent=2), "```", ""]
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(prog="eggfit")
    sub = ap.add_subparsers(dest="command", required=True)
    f = sub.add_parser("fit", help="fit, score on held-out cooks, write the population")
    from . import sbc
    sbc.add_parser(sub)
    f.add_argument("emulated")
    f.add_argument("--out", required=True, help="where the population goes (fixtures/population.json publishes it)")
    f.add_argument("--report", required=True)
    f.add_argument("--truth", help="the simulation's truth, for recovery and the oracle's score")
    f.add_argument("--id", help="the population's id; fit-<date> by default")
    f.add_argument("--holdout", type=float, default=0.2)
    f.add_argument("--open-power", type=float, default=0.0)
    f.add_argument("--open-cap", type=float, default=1.0)
    f.add_argument("--warmup", type=int, default=500)
    f.add_argument("--samples", type=int, default=1500)
    f.add_argument("--chains", type=int, default=4)
    f.add_argument("--target-accept", type=float, default=0.99)
    f.add_argument("--force", action="store_true",
                   help="publish to fixtures/population.json even if R-hat, the ESS or divergences fail")
    f.add_argument("--trusted", default=data.TRUSTED_FILE,
                   help="the owner's trusted IDs, one per line (DECISIONS.md 82); "
                        "fit/trusted.local.txt by default, pooled with $EGGFIT_TRUSTED")
    a = ap.parse_args()
    model.use_cores(a.chains)
    if a.command == "sbc":
        sys.exit(sbc.run(a))

    eggs = data.load(a.emulated, data.read_trusted(a.trusted))
    fitting, held = data.split(eggs, a.holdout)
    # A trusted cook is never held out: its eggs are there to be fitted.
    vouched = {u for u, t in zip(eggs.uid, eggs.trusted) if t}
    fitting, held = fitting | vouched, held - vouched
    train = eggs.subset(fitting)
    test = eggs.subset(held)
    draws = model.fit(train, open_power=a.open_power, open_cap=a.open_cap,
                      warmup=a.warmup, samples=a.samples, chains=a.chains, target_accept=a.target_accept)
    diag = diagnostics.check(draws["_chains"], int(draws["_divergences"]), model.GLOBALS)
    import datetime
    pid = a.id or f"fit-{datetime.date.today().isoformat()}"
    settings = {"openPower": a.open_power, "openCap": a.open_cap, "holdout": a.holdout,
                "warmup": a.warmup, "samples": a.samples, "chains": a.chains, "targetAccept": a.target_accept}
    # Counts only: the trusted IDs themselves never leave the owner's machine.
    source = {"cooks": len(train.cooks), "eggs": train.n, "attested": int(np.sum(train.tier == 1)),
              "open": int(np.sum(train.tier == 0)), "trusted": int(np.sum(train.trusted))}
    pop = population.population(draws, eggs.constants, pid, source, settings)
    refused = None
    if publishes(a.out) and not diag["ok"]:
        if a.force:
            print(f"publishing all the same (--force): {'; '.join(diag['failures'])}", file=sys.stderr)
        else:
            refused = (f"the sampler failed its checks ({'; '.join(diag['failures'])}), so {a.out} is "
                       "unchanged. Run longer (--warmup, --samples, --chains), or publish all the same with --force.")
    elif not diag["ok"]:
        print(f"the sampler failed its checks: {'; '.join(diag['failures'])}", file=sys.stderr)
    if refused is None:
        with open(a.out, "w") as fh:
            json.dump(pop, fh, indent=2)
            fh.write("\n")

    scores = {"literature": score.score(test, literature_file(eggs.constants)), "fitted": score.score(test, pop)}
    report = {"fitting_cooks": len(train.cooks), "fitting_eggs": train.n, "held_out_cooks": len(test.cooks),
              "held_out_eggs": test.n, "weights": draws["_weights"], "divergences": int(draws["_divergences"]),
              "samples": int(len(draws["mu_z"])), "population": pop, "scores": scores,
              "diagnostics": diag, "refused": refused}
    if a.truth:
        with open(a.truth) as fh:
            truth = json.load(fh)
        scores["truth"] = score.score(test, truth_population(truth, eggs.constants))
        report["recovery"] = recovery(draws, truth)
    with open(a.report, "w") as fh:
        fh.write(report_md(report))
    with open(a.report.rsplit(".", 1)[0] + ".json", "w") as fh:
        json.dump(report, fh, indent=2, default=float)
    print(report_md(report))
    if refused is not None:
        print(f"not published: {refused}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
