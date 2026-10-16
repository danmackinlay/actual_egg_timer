# fit/ — the population fit

The population fit (`INFERENCE.md` §9): everyone's shared eggs in,
`fixtures/population.json` out, which both apps draw a new cook's prior from.
Python, outside `src/core/` and its rules; run with [uv](https://docs.astral.sh/uv/).
Nothing here runs in the apps or in `npm run verify`.

## The loop

```
npm run eggs -- pull fit/data/records.jsonl          # needs NETLIFY_AUTH_TOKEN, NETLIFY_SITE_ID
npm run eggs -- emulate fit/data/records.jsonl fit/data/emulated.json
uv run --project fit python -m eggfit fit fit/data/emulated.json \
    --out fit/data/population.json --report fit/data/report.md
```

`pull` overwrites its file with a fresh copy of the store, so a result a cook
has deleted leaves this machine at the next pull, and it deletes
`all.jsonl` and `emulated.json` beside it, which were built from the last
one: emulate again after every pull. `population.json` and `report.md` hold
no one's results, only counts.

Read `report.md`. The fit writes no population, wherever `--out` points,
unless the sampler passes its checks (below); `--force` writes it all the
same, with `"forced": true` in its `diagnostics` and `-forced` at the end of
its id, so every record cooked from it says so. Both apps, `build:site` and
`ios:archive` refuse a fitted file without `diagnostics`, and a forced one
whose id does not say so (`src/core/population.ts`); only the literature's,
never sampled, has none. To publish, run the fit again with
`--out fixtures/population.json`, then `npm run fixtures` (which reads it into
`fixtures/prior.json`) and `npm run verify`, and commit: the next release of
both apps draws from it, and every phone and browser replays its eggs from the
new prior. `fit/data/` is gitignored: pulled records are people's eggs.

## The owner's own results, and the trusted list

The owner vouches for their own random IDs (`DECISIONS.md` 82): every egg
under one that comes from the owner's own results file (`import`, below)
counts at the attested tier's full weight, whatever tier it came in, and a
trusted cook is never held out. An egg pulled from the live store is not
trusted for its ID alone - an ID is shown on screen, so anyone who learned one
could post under it - unless its twin from the file is. The list never goes into git - it would
tie the owner to their results - so it lives in `fit/trusted.local.txt`
(gitignored), one ID per line, `#` for comments, and in `EGGFIT_TRUSTED`
(commas or spaces); the two are pooled. To set it up:

```
cp fit/trusted.example.txt fit/trusted.local.txt
# then add each of your IDs on its own line (Settings > Sharing results >
# Your random ID, on each device that has shared)
```

A device's whole log, shared or not, comes in through "Export my results"
(Settings, What I've learned) and `import` (`DECISIONS.md` 107):

```
npm run eggs -- import ~/Downloads/actual-egg-timer-results-2026-10-05.json fit/data/imported.jsonl
cat fit/data/records.jsonl fit/data/imported.jsonl > fit/data/all.jsonl   # the pull first
npm run eggs -- emulate fit/data/all.jsonl fit/data/emulated.json
```

`import` files the records under the ID in the file, which is the device's
sharing ID; a device that never shared has none, so give it one with
`--uid <id>` and put that ID on the list. It says whether the ID is trusted.
`emulate` keeps the first copy of an egg that is in both files, trusted if
the file's copy is. `fit` reads
the list again (`--trusted <path>` for another file), so an emulated file made
before an ID was added is trusted all the same.

A file exported before 0.5 still imports, older records and the yolk
answered too soft, just right or too firm included (`readFitRecord`), and
the fit scores those answers as it always did. A device keeps no such
record once 0.5 has run on it, which deletes its earlier log at first
launch (`DECISIONS.md` 107): export from the build before.

## Whether the fit can be believed

Three checks, each guarding a different way the fit could be wrong.

**The likelihood is the app's.** `tests/test_likelihood.py` holds the fit's
likelihood (the JAX model's and the NumPy scorer's) to `src/core/infer.ts`'s
own numbers, to the digit, on `tests/emulated-sample.json`. `npm run
fixtures` writes that sample (`tools/fixtures/fitSample.ts`) with the core's
`LIKELIHOOD_ID` in it, so a change to the core's likelihood changes the
sample, `npm run fixtures:check` fails until it is committed, and pytest then
fails until the fit follows. A constant the emulated file carries (the
unrelated share, the cuts, the probe's) the fit reads from the file, and
follows by itself.

**The sampler recovers a known population, and mixes.**
`tests/test_recovery.py` fits `tests/recovery-sample.json`, sixty cooks from
a known truth, also written by `npm run fixtures`, with four chains side by
side (under a minute). The truth's time-scale is in the prior's tail, at its
2.3rd percentile. The test fails on a divergent transition, an R-hat of
1.01 or more, a bulk ESS under 100 a chain, a truth further from the
posterior than a calibrated fit puts it nine times in ten, or a time-scale
or white's lag whose posterior sd is not below half its prior's. The
distance is one test of all nine globals together: the truth's Mahalanobis
distance under the draws' covariance, the spreads on their log scale,
against the draws' own distances (the test says why not Bonferroni, Holm,
Simes or chi-square). Taken with the other eight, the tail truth is no
further from the prior than most of the prior's draws, so a fit that lost
its likelihood and returned the prior passes the distance (82% of its draws
further out) and fails on the narrowing (sd 0.995 and 1.005 of the prior's).
It prints every truth's posterior quantile and the distance, pass or fail.
CI's `fit` job runs it with the rest of `fit/tests`, without node. The same
R-hat, ESS and divergence checks are in every `report.md`
(`eggfit/diagnostics.py`), and `fit` writes no population when they fail,
unless forced.

**The posterior is calibrated.** Simulation-based calibration, by hand, not
in CI: each repetition draws the globals from the fit's own prior, simulates
cooks from them with the app's simulator (`node tools/eggs.ts simulate
--truth`, so node is needed), emulates and fits them, and ranks the truth
among the posterior draws, and the eggs' log likelihood at the truth among
its values at the draws. The ranks of a calibrated fit are uniform; `sbc.md`
gives one verdict for all ten (each rank's ECDF against its simultaneous
band, then Simes's test of the ten), each one's histogram, and how many
repetitions' own chains failed R-hat, the ESS or divergences. `sbc` exits 1
when the verdict fails. A worker a core simulates and fits a repetition at
a time; any run of the same `--out` resumes it and summarises it:

```
uv run --project fit python -m eggfit sbc --out fit/data/sbc
```

**What it showed** (16 October 2026, `sbc.py`'s defaults: 200 repetitions of
20 cooks, two chains of 1,000 draws after 500 of warmup, each rank out of 99
draws; 20 minutes on eight cores of an 18-core Mac that other work shared,
at a load of about 12). Calibrated: Simes's p over the ten is 0.29.

| quantity | p | mean rank |
|---|---|---|
| `mu_z` | 0.41 | 0.48 |
| `tau_z` | 0.41 | 0.53 |
| `lag` | 0.48 | 0.51 |
| `tau_w` | 0.38 | 0.53 |
| `tau_t` | 0.78 | 0.49 |
| `log_s0` | 0.90 | 0.51 |
| `sig_s` | 0.03 | 0.48 |
| `log_g0` | 0.99 | 0.51 |
| `sig_g` | 0.86 | 0.48 |
| log likelihood | 0.32 | 0.48 |

`sig_s`'s ranks lean a little low (29 of 200 in the bottom tenth), as they
did at 40 cooks and four chains of 3,000, an hour and a half on sixteen
cores; one p of ten as low is what chance gives. 56 repetitions had an R-hat
of 1.01 or more (at most 1.033: two chains make R-hat noisy), 19 an ESS
under 100 a chain, three a divergent transition. The check fails what it
should, on 40 repetitions each: a fit that ignored its eggs (the
likelihood's weights zeroed) had every log-likelihood rank in the top tenth
and the globals' uniform; truths drawn with the white's spread `tau_w` from a
half-normal of scale 1 where the fit's prior has 0.5 put 21 of 40 of its
ranks in the top tenth. Both failed at Simes's p 0.0025, the least 4,000
simulations of the band can give.

The run does not stop early on a clear verdict (Gandy and Scott, [Unit
testing for MCMC and other Monte Carlo
methods](https://arxiv.org/abs/2001.06465)): a failure like those above is
plain in the first tens of `ranks.jsonl`, and a pass needs every repetition.
With real eggs, [SBC checking conditional on
data](https://arxiv.org/abs/2502.03279). Set aside: [discriminative
calibration](https://arxiv.org/abs/2305.14593), more machinery than this
model needs.

A bigger simulation, with the held-out scores (`simulate --truth <file>` for a population other than the default):

```
npm run eggs -- simulate fit/data/sim.jsonl fit/data/sim-truth.json 400
npm run eggs -- emulate fit/data/sim.jsonl fit/data/sim-emulated.json
uv run --project fit python -m eggfit fit fit/data/sim-emulated.json \
    --out fit/data/sim-population.json --report fit/data/sim-report.md \
    --truth fit/data/sim-truth.json --id sim
```

The report then has the recovery of every global parameter and the held-out
score of the truth's own population beside the fit's and the literature's.
`INFERENCE.md` section 9 has what it showed.

## What is in it

- `eggfit/data.py` — the emulated eggs as arrays, the held-out split (a
  fifth of the cooks, by a hash of the id), and the trusted list.
- `eggfit/model.py` — the model: two learned globals (the time-scale and the
  white's lag), heavy-tailed cook effects, the app's own likelihood read off
  each egg's emulator column, and the tiers (`DECISIONS.md` 2). NUTS.
- `eggfit/population.py` — from the draws to the population file: a new cook's
  predictive, one spread per particle dimension.
- `eggfit/score.py` — held-out cooks, one step ahead: the log score, the
  ranked probability score, reliability and a randomised PIT
  (`DECISIONS.md` 37).
- `eggfit/diagnostics.py` — R-hat, the bulk ESS and divergences, and the
  thresholds the fit publishes by.
- `eggfit/sbc.py` — simulation-based calibration.
- `tests/` — the likelihood held to the app's, the diagnostics, and the
  recovery check, on the samples `npm run fixtures` wrote:

  ```
  uv run --project fit python -m pytest fit/tests
  ```
