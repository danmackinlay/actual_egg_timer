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

`pull` overwrites its file with a fresh copy of the store, so a result a cook
has deleted leaves this machine at the next pull, and it deletes
`all.jsonl` and `emulated.json` beside it, which were built from the last
one: emulate again after every pull. `population.json` and `report.md` hold
no one's results, only counts.

Read `report.md`. To publish, run the fit again with
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
(Settings, What I've learned) and `import` (`DECISIONS.md` 81):

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
- `tests/` — the likelihood held to the app's to the digit, on a small sample
  `npm run eggs -- emulate` wrote:

  ```
  uv run --project fit python -m pytest fit/tests
  ```
