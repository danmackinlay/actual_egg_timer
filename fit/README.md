# fit/ — the population fit

E7 (`INFERENCE.md` §9, `COLLECTIVE.md`): everyone's shared eggs in,
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

Read `report.md`. To publish, run the fit again with
`--out fixtures/population.json`, then `npm run fixtures` (which reads it into
`fixtures/prior.json`) and `npm run verify`, and commit: the next release of
both apps draws from it, and every phone and browser replays its eggs from the
new prior. `fit/data/` is gitignored: pulled records are people's eggs.

## Checking it on cooks whose answer is known

```
npm run eggs -- simulate fit/data/sim.jsonl fit/data/sim-truth.json 400
npm run eggs -- emulate fit/data/sim.jsonl fit/data/sim-emulated.json
uv run --project fit python -m eggfit fit fit/data/sim-emulated.json \
    --out fit/data/sim-population.json --report fit/data/sim-report.md \
    --truth fit/data/sim-truth.json --id sim
```

The report then has the recovery of every global parameter and the held-out
score of the truth's own population beside the fit's and the literature's.
`LOGBOOK.md` (2 October 2026) has what it showed.

## What is in it

- `eggfit/data.py` — the emulated eggs as arrays, and the held-out split (a
  fifth of the cooks, by a hash of the id).
- `eggfit/model.py` — the model: two learned globals (the time-scale and the
  white's lag), heavy-tailed cook effects, the app's own likelihood read off
  each egg's emulator column, and the tiers (`DECISIONS.md` 2). NUTS.
- `eggfit/population.py` — from the draws to the population file: a new cook's
  predictive, one spread per particle dimension.
- `eggfit/score.py` — held-out cooks, one step ahead: the log score, the
  ranked probability score, reliability and a randomised PIT
  (`DECISIONS.md` 37).
- `tests/` — the likelihood held to the app's to the digit, on a small sample
  `npm run eggs -- emulate` wrote:

  ```
  uv run --project fit python -m pytest fit/tests
  ```
