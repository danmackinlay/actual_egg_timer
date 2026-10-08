# INFERENCE.md — making the inference the main part

The design of the learning, and the facts of the model as built. Built: the
record (§4), the ordered probit and the white offset (§3), the thermometer
(§5), choosing the time under uncertainty, with the odds-shaded slider and
the outcome summary (§8), and opt-in collection (§7, E6). Being built, from
`COLLECTIVE.md`: the nudge (§8, E8) and the population fit (§9, E7). The owner's decisions are
numbered in `DECISIONS.md`; the two measurements the design rests on are in
`LOGBOOK.md` (21 September 2026) and re-run with `npm run rank` and
`npm run probe`.

---

## 1. The change of stance

Today the physics is the model and the inference is a three-number patch on it,
learned per phone, from nothing but that phone's eggs. This plan turns that
round:

- **The physics is a prior mean.** It is a good one - it carries the `R^2`
  scaling, altitude, start temperature and the carryover argument, none of which
  a cook's answers could ever teach from scratch - but it is not the thing being
  claimed.
- **The thing being claimed is a prediction**: given this egg, this pot and this
  time, what will the cook say about the yolk and about the white. The model is
  right when those predictions are calibrated, and wrong when they are not,
  whatever `alpha` turns out to be.
- **Evidence is pooled.** Most of what one kitchen cannot learn - because its
  cook never varies the egg size or the cooling - a population varies for free.

A consequence worth saying once: parameters that cannot be told apart stop being
a problem, as long as they cannot be told apart *over the cooks people actually
do*. README §11 spends a lot of effort on whether `alpha`, `h` and the taste
offset are separable. Under this stance the question is only whether the
prediction is right, and the confounded directions are simply not learned.

## 2. What is learned, and what is not

Ten global parameters were proposed and the objection was that most of them cash
out in the same predictive. `npm run rank` measures it: the Jacobian of the two
log doses against ten candidates, scaled by their priors, over 182 reachable
cooks at the times the app would recommend.

| direction | answers to halve its prior sd | what it is |
|---|---|---|
| 1 | ~1 | **time-scale** - `alpha`, with boil-temperature and start-temperature error folded in |
| 2 | ~5 | **white lag** - the white's threshold and the radius it is judged at, mixed 0.75 / 0.57 and not separable |
| 3 | ~30 | carryover (`tauAirScale`) - and **never**, from cooks that all go into water |
| 4 | ~110 | size scaling - needs a spread of egg sizes |
| 5 | ~280 | start-temperature bias |
| 6-10 | 450 to 250 000 | both z-values, threshold-versus-radius, boil bias on its own |

There is a sixfold gap after the second direction and the z-values are at the
very bottom. So:

**Global, always learned (2).** A *time-scale* and a *white lag*. They are named
for what they do to a prediction, not for a physical constant, because that is
all the data can vouch for: "time-scale" absorbs `alpha`, `h`, the Dirichlet
bias, a simmer mistaken for a boil and a warm fridge, and nobody will ever be
able to say in what proportion.

**Global, learned only where the data reaches (2).** *Carryover* (only
counter-rested cooks inform it) and *size scaling* (only a spread of sizes).
Where the data does not reach, they sit at the physics.

*Correction, 6 October 2026 (`DECISIONS.md` 95):* as built, carryover is
not learned at all. `tauAirScale` is a particle dimension, but every dose
grid is built at its posterior mean, so no particle's own value reaches the
likelihood; its mean drifts only with resampling, which the
simulation-based calibration shows (`npm run sbc`). Learning it would need a
third grid axis, or a simulation per particle, for counter-rested cooks
alone, and their yolk and white answers mostly teach alpha and the taste
offset. In 0.5 it leaves the particle and is fixed at 1.0.

**Pinned at the literature.** `Z_YOLK`, `Z_WHITE`, `YOLK_RADIUS_FRAC`, the start
and boil temperatures as entered. They keep their place in README §6 as the
prior's documentation.

**Per cook, for the place (1).** A multiplier on the time-scale. Every
kitchen-level nuisance loads on direction 1, so one number is all a kitchen
would get. It belongs to the COOK, and in practice to the phone, rather than to
a kitchen, because "kitchen" is not a unit anyone can maintain: pans and hobs
vary within one kitchen, and cooks move between them. Whatever varies from cook
to cook for one person shows up as that person's noise, which the reliability
term already models (§6). The owner ruled kitchens out on 26 September, and
nothing in the record or the UI names one.

**Per cook (2, plus a reliability).** A yolk *taste* offset, and a white
*cutpoint* - what this person means by "runny". And a noise scale, §6.

The present particle - `alpha`, taste offset, `tauAirScale` (until 0.5) - is
already most of this. The dimension it lacks is the white lag, which is the second-strongest
direction in the data and is held at a constant. Both real eggs in `LOGBOOK.md`
came out with a runny white at a soft target, which is what holding it wrong
looks like.

**On one phone, the white lag and the white cutpoint are the same number.** A
single cook cannot distinguish "whites set later than the model thinks" from "I
call a tender white runny". The phone therefore carries one white offset, and
the population fit is what splits it into a global mean (the lag) and a personal
deviation (the cutpoint). Likewise a cook's time-scale and the global one.
That split is the whole statistical content of making this collective.

**Pooling also does the job the white channel was built for.** `alpha` and taste
are confounded for one cook. They are not confounded across cooks: the
time-scale is shared and taste is personal. And a time-scale effect moves yolk and
white in the physics ratio (0.465, `npm run identifiability`) where a perception
effect moves one of them - the same geometry as the 19 degrees between `alpha`
and `h`, but with `alpha`-sized sensitivities behind it instead of a signal 15x
too weak.

## 3. What the cook is asked, and how it is scored

**An ordered-probit likelihood** replaces the hard bands and the fixed 0.8 / 0.1.
The latent is the delivered log dose minus the wanted one; the answer is which
side of two cutpoints it fell, through a Gaussian whose sd is learned. A
particle just outside the band is then a little wrong rather than exactly as
wrong as one a decade away, which is more information per answer and no
discontinuities for the filter to fall over.

**Three answers for the yolk, three for the white, and neither is required.**
Too soft / just right / too hard stays as it is: five levels were considered and
are too many at breakfast (`DECISIONS.md` 4). The white gets runny / tender / firm. The
comment in `infer.ts` declines a third level because it would need an unmeasured
ceiling; pooled, the ceiling is a learned cutpoint like any other.
**Changed by `DECISIONS.md` 92 (6 October 2026):** the cook names the yolk
they got in the slider's own five words, and the white question asks about
the white next to the yolk. The words are the ones the cook has just read
on the slider, so five is not too many after all, and three answers relative
to the target threw information away and had nothing to say when the yolk
wanted could not be chosen. The scoring is below, under "Built".

**The white is always OFFERED, and the model no longer decides whether to ask.**
The September gate measurement showed that suppressing the question discards
most of the evidence exactly when the model is confidently wrong. But offered is
not required: a cook may answer one question, both, or neither, and the egg is
still logged. That puts selection back on the table - now the cook's rather than
the model's - so **a skip is recorded as a skip**, not as an absent record. Who
skips, and after which eggs, is then something the fit can look at instead of
something it has to assume. The nudge (§8) and the thermometer panel (§5) are
the checks on it, since neither depends on who chose to answer.

**A robustness component.** With small probability an answer is unrelated to the
egg. This is what `UNRELATED` is already standing in for.

**Built (E2 and E3, 27 September).** `src/core/infer.ts`, held to
`EggTimerCore/Infer.swift` by `fixtures/calibration.json`. The particle has six
numbers: the time-scale (`alpha`), the yolk taste offset, `tauAirScale`, and
three new ones. (Five from 0.5: `tauAirScale` left it, held at 1.0, §2.)

- **The noise scale** is a particle dimension, lognormal, median **0.20
  decades** of yolk dose, log sd 0.5. Chosen where the old likelihood described
  a typical egg - a cook the model roughly knows, particles around the band:
  the probit gives "just right" 0.813 at the centre of the band (old 0.8) and
  0.093 one band-width out (old 0.1), a likelihood ratio of 8.7 against 8; 0.207
  would match both exactly. Where they differ is far from the band: a particle a
  decade off now scores 0.017, not 0.1, which is the point of the change. It
  means the very first answer from a fresh prior carries more - 0.96 bits
  against 0.63 on the default egg - and to match there instead the median would
  have to be about 0.48, which would halve what every later egg carries. The
  white's noise is the same scale in degrees: `noise * Z_YOLK / Z_WHITE`.
- **The unrelated share** is 5%, uniform over the three answers: no likelihood
  falls below 0.017.
- **The yolk's cutpoints** sit at -+`FEEDBACK_BAND` (0.28 decades), so the probit
  keeps the old band's meaning. Since `DECISIONS.md` 92 this is how a record
  from before scores, and only that, and how the decision scores a miss (§8).
- **The yolk the cook got, in five words** (`DECISIONS.md` 92;
  `yolkWordProbit`, `YOLK_WORD_CUTS`). The same latent, the delivered log
  yolk dose, now less only the particle's taste offset, since the answer no
  longer depends on what was asked for. It is cut into five bands, Runny,
  Soft, Jammy, Fudgy and Hard, at the four places the slider's word changes:
  the midpoint between adjacent anchors (`anchorNear`, `DONENESS_ANCHORS`),
  which on a scale linear in log dose is the midpoint of their log nominal
  doses. That is -0.795, 0.149, 1.069 and 2.427 decades (slider levels 0.11,
  0.315, 0.515, 0.81), so Soft and Jammy are each about 0.93 decades wide and
  Fudgy 1.36, against the 0.56 of the old "just right"; Runny and Hard run
  on to the ends. No new constant: the words, their places and the dose scale
  are the slider's own. The taste offset shifts every cut together, as it
  shifted the old band, so a cook who likes a firmer yolk calls a given yolk
  softer. The noise is the same particle's `noise`, and the unrelated share
  is the same 5%, spread evenly over the five answers rather than three, so
  the five still sum to one and no word scores below 0.01 (`withUnrelatedWord`).
  A record holds the old answer or the new, never both. **Old records keep
  their -1 / 0 / 1 and are scored exactly as before**: the old arithmetic is
  untouched: `test/record.test.ts` 2a2 holds `yolkProbit` and
  `answerLikelihood` to the numbers the code before the change gave
  (`test/data/old-answers-likelihood.json`), to rounding, and 2a3 holds the
  posterior a log answered the old way makes (`test/data/old-answers.json`)
  to the exact one, in distribution (below, "the seed"). The decision still scores a
  candidate time by the three-way miss around the asked-for level
  (`decide.ts`, `yolk[0] + yolk[2]`), and the odds and the lean read it too:
  the five words are for learning, and for the forecast a record keeps.
- **The white next to the yolk.** The white has always been scored at
  `YOLK_RADIUS_FRAC`, the innermost white, the last to set (`simulate`, the
  grid, `whiteProbit` and the runny-white cost all read it there). Since
  `DECISIONS.md` 92 the question names that place, "the white next to the
  yolk", so the cook is asked about the point the model scores, not about
  the white next to the shell, which is nearly always set.
- **The white offset** (E3) shifts the runny | tender cutpoint from
  `WHITE_DOSE_TARGET`; prior sd 0.5 decades.
- **The tender | firm cutpoint** is a gap above it, lognormal, median **1.08
  decades**, log sd 0.4. From README §4's anchors for the reference egg (68 g,
  fridge, boiling water, ice): the inner white's log dose is -0.51 at Soft (peak
  77.9 C) and +0.06 at Jammy (80.6 C); the midpoint, -0.22, is 1.08 decades above
  the runny cut at -1.30. So Soft whites sit in "tender" and Jammy and firmer in
  "firm". Over a 58 g egg, a cold start, a tap and a counter-warm egg the same
  midpoint lands 0.98 to 1.14 decades up.
- **One fold per egg.** The two answers are multiplied and folded together, so
  the order they were tapped in cannot matter; an app that hears the second
  answer after folding the first folds the egg again from the posterior before
  it, against the same surface. A replay is therefore still bit-identical.
- **The white target moves the recommendation.** The solver's white constraint
  is the runny | tender cutpoint, so the posterior mean white offset moves it
  (`calibrationDoneness`). The taste offset did not enter the
  recommendation, as before E2; since E5 it does, because the time is chosen
  from every particle (§8).
- **E1's two-level "set"** is gone (owner, 28 September: no build after 19
  September left the owner's devices). A record carrying it is refused.

Measured, in `test/infer.test.ts`:

- **Recovery (Phase C, repeated).** Injected `alpha` 1.535e-7 with taste +0.20,
  noise-free answers, 68 g at jammy: within 15 s of the true optimum from egg 2
  (old likelihood: egg 3), settled 12.2 s short (old: 14.0 s long), `alpha` sd
  about 3.3% (old 2.9%). No worse.
- **Calibration.** 200 cooks drawn from the prior, five eggs each at assorted
  levels, answers drawn from each cook's own probit: predicted P(answer) against
  observed, in ten bins, expected calibration error 1.4% (yolk) and 1.8%
  (white); 0.8% and 1.0% at 400 cooks.
- **Two runny whites at soft: half met.** The next soft time moves later, by 85 s
  with the white answered alone and by 21 s with the yolk also "just right", and
  soft becomes bound by the white. But a jammy time moves about as far - 94 s and
  23 s - so "leave jammy nearly alone" is NOT met. The reason is the prior, not
  the code: a runny white is explained by a slow time-scale as well as by a late
  white, and `alpha`'s prior sd (11.9%) is 0.70 decades of white dose against
  the white offset's 0.5, so the posterior blames the time-scale about 2:1. A
  wider white offset did not fix it either: at 0.8 and 1.2 decades the posterior
  mean runs past the cutpoint and makes jammy white-bound too. What pins the
  time-scale is other evidence - yolk answers, the thermometer (E4), other cooks
  (E7) - and a recommendation made from the posterior rather than its mean (E5).
  The owner's call (27 September): leave it as it is until a probe or pooling
  pins the time-scale. With E5, a yolk answer beside the two runny whites
  gives the asked-for shape (soft +146 s, jammy +17 s); the white alone still
  moves both. `test/infer.test.ts` 5b stays a todo.

**A thermometer reading**, for cooks who own a probe (§5). Sketched here as a
Gaussian, sd about 1.5 C, with a small hot skew; built (E4) as a Gaussian of
1.0 C with a COLD one-sided tail, because at the moment it is read every
handling error reads low. §5 has why and the numbers.

## 4. The record: keep the observation, not only the posterior

The largest change in principle, and it is worth doing for one user before any
server exists. Today an answer is folded into the particles and thrown away, so
when the likelihood changed in September the v1 posterior had to be discarded
rather than repaired. With the observations kept, a model change is a replay.

**Built (E1, 26 September).** One record per egg, stored on the device beside
the posterior; uploaded only under §7. The reference is `src/core/record.ts`,
held to `EggTimerCore/Record.swift` by `fixtures/record.json`. Both apps make
a record the same way, in core (`recordFor`, 6 October 2026): each gathers
the cook's facts - what was frozen at "Eggs in", the time that ran, when the
cook tapped out of PULL, the answers - and core assembles the record, so the
fit's training data cannot drift between the two.

```json
{
  "v": 1,
  "uid": null,
  "day": "2026-09-21",
  "app": "ios", "appVersion": "0.3.0", "prior": "2026-09-e5", "model": "2026-10-e6",
  "egg": { "mass_g": 68, "massFrom": "class", "sizeTable": "eu" },
  "setup": {
    "startMode": "hot", "eggStart_C": 4, "eggFrom": "fridge", "ambient_C": 20,
    "boiling_C": 100, "timeToBoil_s": 480, "timeToBoilFrom": "remembered",
    "cooling": "ice", "afterBoil": "hold", "waterLitres": 1.5, "eggCount": 2
  },
  "level": 0.22,
  "recommended_s": 399, "nudge_s": 0, "pulled_s": 412, "pulledBy": "cook",
  "cooled_s": 180,
  "yolk": null, "yolkWord": "runny", "white": null,
  "probe": null,
  "forecast": { "cook_s": 399, "yolk": [0.21, 0.55, 0.24], "white": [0.04, 0.31, 0.65],
                "yolkWord": [0.18, 0.52, 0.27, 0.02, 0.01] },
  "lang": "en", "register": "modern", "units": "metric"
}
```

- `yolk` and `white` are each an answer or `null`, and a record with both
  `null` is still a record, because the cook, the recommendation and the actual
  pull time are data too. An egg finished and never answered about is logged
  when the cook starts again.
- **`yolkWord`** (`DECISIONS.md` 92, 6 October 2026) is the yolk the cook got,
  `runny`, `soft`, `jammy`, `fudgy` or `hard` - the slider's words as keys,
  whatever the cook read them as - or `null`, a skip. Since then the apps
  write it and leave `yolk` null; `yolk`, -1 / 0 / 1 against `level`, is the
  answer from before, kept as it was and scored as it was. Absent reads as
  `null`, so every older record is read unchanged, and a record carrying both
  is refused. `forecast.yolkWord` is the five words' probabilities at "Eggs
  in", absent or `null` on a forecast from before them.
- **`id`** (6 October 2026) is the moment the cook started, in whole
  milliseconds since 1970 UTC: which cook the egg was. The web app writes it,
  so that two tabs showing one cook, or a cook written down twice, make one
  egg, and only the tab that wrote an egg down learns from it; the iPhone app
  runs one cook at a time and writes none. Absent reads as `null`. It stays
  on the device: sharing sends the record without it, and the server drops
  it from whatever it is sent (`sharedRecord`), because a start time to the
  millisecond says far more about a cook than `day` does.
- **The white is always asked** since E2, so `null` is a skip. E1 asked only
  sometimes and carried a `whiteOffered` flag to tell "not asked" from
  "skipped"; with nothing of E1's kept, the flag went on 28 September, and a
  record that still carries it has it ignored like any unknown field.
- **The white's answers are `runny`, `tender` and `firm`.** E1's two-level
  `set` went with the flag; a record carrying it is refused. Both were
  removed before any record left the owner's devices, so the schema stays
  `v: 1`.
- `pulled_s` is when the cook said the egg came out, not when the alarm went -
  the tap out of PULL ("they're in the ice bath", "they're out"). When nobody
  taps and the 20 s grace runs out, `pulledBy` is `timeout` and `pulled_s` is
  the SCHEDULED time: an assumption, marked as one, not a measurement. Since E2
  the iOS app has the web's button too, so its pulls are measured as well.
- `recommended_s` is what the solver said; `nudge_s` is what the app added on
  purpose (E8; zero until then). **Since E2 the likelihood is scored at
  `pulled_s` when `pulledBy` is `cook`, and at `recommended_s + nudge_s` when it
  is `timeout`** - at the measured pull where there is one, and at the schedule,
  which is the best guess, where there is not. E1 scored every egg at the
  schedule; the change was made once, by replay (`recordCookTime_s`).
  `recommended_s` and `prior` make the policy that produced the cook part of the
  record, so a later fit knows why the data lies where it does. `prior` is
  `2026-09` for E1's cooks, `2026-09-e2` for E2's, whose white offset also
  moved the recommendation, and `2026-09-e5` since, whose time is chosen from
  the whole posterior (§8).
- `massFrom` (`scale` / `girth` / `width` / `class`) sets the egg-level noise: a
  size class is a 10 g bucket, worth about +-24 s, which is twice the width of
  "just right". `sizeTable` (`eu` / `us`) says whose carton a class came off,
  because the same class is 68 g in one table and 60.2 g in the other; it is
  `null` for anything measured. On iOS the slider is a scale and the menu is a
  class.
- `timeToBoil_s` is the time to boil the solve used, and `timeToBoilFrom` says
  where it came from: `measured` (this cook's own boil tap - every finished cold
  start, since neither app leaves HEATING without it), `remembered` (the pan on
  file) or `default` (no pan ever measured). A hot start never times its pan,
  and with the heat off that number used to be the pan's whole cooling curve;
  since the standing method's pan constant was re-derived from the water volume
  (27 September), this is what says which cooks leaned on the old derivation.
- `ambient_C` is recorded rather than re-derived from the egg's start
  temperature, so a change to that rule cannot quietly change a replay.
- `lang`, `register` and `units` record what the cook READ, because an answer
  is a word and words differ: "soft" may not sit where *weich* does, and "Unset"
  in the English of 1750 may not be answered like "Runny". `LANGUAGE.md` §5-6.
  Constant (`en`, `modern`, `metric`) until F1 and F3 give them values.
  Since F6 (28 September), a cook read in the English of 1750 records
  `lang: "en-x-1750"` and `register: "1750"`, in both apps.
- A day, not a timestamp. A boiling point, not an altitude or a place:
  `boiling_C` is a one-to-one function of the altitude setting, so it carries
  everything the altitude would, and the altitude itself is not recorded.
- `uid` is `null` until E6 mints one. `mass_g` is rounded to 0.01 g.
- `forecast` (E6) is what the app actually said at "Eggs in" (§7;
  `DECISIONS.md` 37): each answer's probability, unrelated share included,
  as `predictOutcome` gives them, and `cook_s`, the time they were for. On a
  cold start the boil tap re-solves the cook afterwards, so `cook_s` can
  differ from `recommended_s`. Null when the cook was started before the
  odds were known. `model` (E6) is `MODEL_ID`, the code that made the
  forecast and chose the time - the likelihood, the decision and, from E8,
  the nudge - changed whenever they change. Both are null, or absent, on a
  record from before E6. A replay says what the current code would have
  forecast; only these say what the app said.
- `probe` (E4) is `null`, or `{ "centre_C": 64.2, "after_s": 183 }`: the
  highest number the cook saw with the probe at the middle, in C to 0.01
  whatever they typed it in, and when the app asked for it - the end of the
  counted cooling - in seconds after the moment the record scores as the pull
  (`null` if not known). The loader refuses a reading colder than the coldest
  thing the egg touched (the fridge, the room or the cooling water) or hotter
  than `boiling_C`. A record with only a reading still teaches. `cooled_s` is
  now the cook's own countdown to its peak, not a flat 180.

**The posterior is a function of the log.** Both apps fold an egg FROM ITS
RECORD - the egg rebuilt from `mass_g`, the pan from `setup`, the target from
`level` - through the same two calls `replay` makes, so a posterior rebuilt from
the log is bit-identical to the one built egg by egg, by construction. Each egg's
dose surface is centred on the posterior as it stood before that egg, on the
literature values while no egg has taught anything, exactly as `recordOutcome`
did. The stored posterior is a cache of that replay, written at full precision
(a cache that rounds is one a replay can never match) with a count of how many
records it has absorbed; an answer is written to the log BEFORE its surface is
built, so an app killed mid-fold folds it on the next launch instead of losing
it.

**The frozen base.** The owner's v2 posterior was learned from real eggs with no
log behind it. E1 kept it as the BASE, with the posterior `replay(base, log)`. A
base cannot be replayed, so it could not survive a change to the likelihood,
and **E2 dropped it** (27 September): both apps read E1's log out of its v3
store, drop the v3 posterior and the base, and replay the log from the prior
under the new likelihood, into v4. That was the price of the eggs before E1 not
having been kept, and it has been paid. A base survives only as what a damaged
log leaves behind (the `rebased` path above).

**Damage is refused, never read around.** A damaged posterior is rebuilt from
the base and the log. A damaged log - one bad record refuses the lot, because a
hole would change what every later egg is scored against - cannot be folded, but
what it taught is in the posterior, which is sound, so the posterior becomes the
new base and the log starts again empty. What a launch keeps of its store -
`fresh`, `rebuild`, `rebased` or `loaded` - is one decision in core for both
apps (`loadDecision`, 6 October 2026), each app reading its own store apart
and core deciding from the parts. "Forget everything" clears the log, the
base and the posterior together.

**Version skew.** The web app deploys on push and the iOS app ships when a build
does, so every record carries `appVersion` and a loader accepts any of them under
`v: 1`. Within v1, fields may be ADDED but never removed or reinterpreted: a
loader ignores fields it does not know, and the nullable fields (`uid`,
`egg.sizeTable`, `yolk`, `yolkWord`, `white`, `probe`, `forecast.yolkWord`)
may be absent and read as `null`. A new field must say what its absence
means. A different `v` is refused.

## 5. The thermometer

`npm run probe`, 68 g egg from the fridge, 400 s in boiling water:

| reading at the centre | C per 1% of time-scale | 3 mm off | 15 s late | 1 C is worth |
|---|---|---|---|---|
| at the pull | 0.60 | +1.33 | +2.21 | 1.7% |
| ice bath, at the yolk's peak (+195 s) | 0.40 | -0.03 | -0.14 | 2.5% |
| counter, at the yolk's peak (+458 s) | 0.29 | 0.00 | -0.02 | 3.4% |

- **Do not probe the white.** At `0.693 R` the field falls 3.5 C per millimetre.
- **Do not probe at the pull.** Every error has the same sign - a miss, a delay
  and the stem all read hot - and hot means "cook it shorter", which is the
  direction the app already errs in.
- **Probe the centre when the centre peaks.** The field is flat there in space
  and in time, and the model already computes the moment (`peakYolkTime_s`). One
  egg, still edible, pins a kitchen's time-scale to about 2.5% - the whole
  ordinal plateau is 3% - and with no taste in it.
- **It does not settle the carryover constant.** One prior sd of `tauAirScale`
  moves the rested reading 1.3 C; one prior sd of `alpha` moves it 3.5 C. README
  §11.3's afternoon with a datalogger is still the way to get that.

At scale the thermometer owners are the anchor. Ordinal answers can never tell
the global time-scale from the mean of everybody's taste; §2 fixes the latter by
convention. A few hundred readings make that convention a tested claim - does
"jammy" really sit at a 65 C peak - and they bound what an adversary can do (§6).

The flow, in the words a cook would see: *"Got a probe thermometer? When the
timer says, push it to the middle of the egg and tell us the lowest number you
see."* Seeking the minimum is self-centring, since the centre is the coldest
point.

**Built (E4, 27 September), and what settled.** `src/core/infer.ts`
(`probeLikelihood`), held to `Infer.swift` by `fixtures/probe.json`.

- **"Lowest" became "highest", and the skew went cold.** The centre is the
  coldest point while the egg COOKS. At the moment it peaks, after the pull,
  it is the warmest: `npm run probe` now prints the ice bath's field there -
  58.8 C at the centre, 58.6 at 0.2 R, 55.7 at 0.4 R; 56.3 C a minute early,
  56.8 C a minute late. So a probe off-centre, a reading late or early, a probe
  still climbing from room temperature, and a stem drawing heat out through a
  cold white all read LOW, and nothing reads high. Seeking the maximum is what
  is self-centring there, and self-settling. The offer now says *"...tell us
  the highest number you see."* - one word from the draft; the owner may want
  it back, and it is one catalogue entry (`probe.offer`).
- **The likelihood** is the density of `reading = peak + e - h`: `e` the
  thermometer, Gaussian, sd 1.0 C; `h` the handling, exponential, mean 0.4 C
  (the table above: a few millimetres and a quarter to half a minute). Total sd
  1.08 C, not 1.5: at the peak the handling error is measured and small, so
  the thermometer is what is left. 2% of readings are unrelated, uniform over
  60 C, so none scores a particle below 3.3e-4 per degree; the apps also refuse
  at entry anything outside three prior sds of the time-scale, +-3 C
  (47.6-81.7 C for the default egg at jammy).
- **The peak comes off the dose grid**, as the doses do: `peakYolk_C` per
  (alpha, cook time) cell, interpolated bilinearly, within 0.1 C of a direct
  simulation. The grid is built at one `tauAirScale` (1.0 since 0.5, §2), so on
  the counter a reading would load everything onto alpha; the counter is not
  offered the probe (below).
- **One fold per egg**: the reading is a third optional input beside the two
  answers, multiplied in, and an app that hears it before or after an answer
  folds the egg again from the posterior before it. In Chromium the stored
  posterior after a reading and then an answer was string-identical to a
  replay of the log.
- **Measured** (`test/probe.test.ts`, default egg, jammy, ice, the app's
  grid): one reading at -1 / 0 / +1 C of the truth takes the time-scale sd
  from 12.5% to 2.74 / 2.74 / 2.79% in the weights - the ~2.5% above, less a
  little for the tail - and the resample (§8) keeps 2.60 / 2.61 / 2.81%. With
  the sketched 1.5 C Gaussian the weights would hold about 3.7%. A kitchen
  10% fast is found at x1.10 from one reading. +1 C shortens the next jammy cook by 15 s,
  -1 C lengthens it by 5 s (the asymmetry is the cold tail: a reading at the
  peak already looks slightly hot).
- **When**: the counted cooling ends at `peakYolkTime_s` for the cook as
  solved, so the countdown's end, its alarm and the reading are
  one moment. The probe is offered only where that moment exists: an ice bath
  or a tap, with the peak after the pull. Not on the counter, where nothing is
  counted, the peak is seven or eight minutes out and `tauAirScale` is in it; not with
  the heat off when the pan ran out before the pull.
- **Not settled**: whether real cooks' readings sit where this says. No egg
  has been probed.

## 6. Unreliable answers, and hostile ones

**Model reliability; do not filter on it.** Each cook has a noise scale, drawn
from a population of them, plus the robustness component of §3. Someone who
answers at random ends up with a large scale, and their weight on the global
parameters falls off as its inverse square - nobody picks a threshold, and
nobody is thrown out for having unusual eggs. Hard rejection is kept for records
that fail the schema, are physically absurd, or arrive faster than eggs cook.

**A hostile population is a different problem**, and modelling does not solve
it: ids are free, so many plausible, consistently biased cooks can be minted.
What bounds the damage:

- heavy-tailed (Student-t) cook effects, so a biased cluster is
  absorbed as outlying cooks rather than moving the mean;
- App Attest on iOS, which proves a genuine copy of the app without saying whose.
  The web app has no equivalent, and it contributes anyway, at a lower weight
  (`DECISIONS.md` 2): its records enter the GLOBAL fit under a tempered likelihood (a power
  below one, 0.5 to start), and the web tier's total effective sample size is
  capped at the attested tier's, so no number of browser tabs can outvote the
  phones. The discount applies only to what a web cook teaches everybody else.
  What they teach their own browser is untouched, since nobody can poison their
  own breakfast but themselves;
- a cap on how far any global parameter may move per published prior;
- the thermometer panel and the physics prior as anchors.

**The screen for an unreliable or hostile contributor is a score, not a
threshold on answers** (`DECISIONS.md` 37): each cook's prequential log score - the log
predictive of each of their answers given their earlier ones, summed over their
eggs - taken relative to what the population model alone would have scored.
A cook the model predicts worse than the population does, egg after egg, is
the one to look at; a cook with unusual eggs that the model learns is not.

The worst case is modest: the prior's width limits a poisoned time-scale to
roughly half a minute, and each cook's own offsets correct for it within a few
eggs. An egg timer is not a high-value target. The realistic failure is
carelessness, which the first paragraph handles.

## 7. Collection: opt-in, anonymous, deletable

- **Opt-in, off by default.** "No networking, collects nothing" is currently a
  stated feature (`ios/App/PrivacyInfo.xcprivacy`), and the app stays complete
  without it. Cooks who never opt in still get the population's prior, because
  it ships inside ordinary releases rather than being fetched.
- **The id is the grouping factor, not an extra.** Without it there are no
  per-cook effects and no §6. It is a random UUID made on the device and derived
  from nothing. "Forget everything" makes a new one.
- **Deletion by id.** The device holds the only copy of the key, so "delete what
  you have from me" works without accounts, and is a button.
- **The consent covers the nudge** (§8), in plain words, or the nudge is off.
- **One Netlify function, beside the site it already hosts.** `POST` a record,
  `DELETE` by id, nothing else. Records are append-only blobs keyed
  `records/<tier>/<uid>/<n>.json`, so deletion is removing a prefix and the fit
  is a listing. No IP addresses or user agents are written, and the function
  logs neither. The controller is the owner, personally, and the privacy
  page's contact is **forgetmyeggs@danmackinlay.name** (created 26 September).
  It is named for the one thing it is for, deletion. It is data rather than
  copy, so it is never translated: it appears as-is in Czech and in 1750.
- **What changes in the repo:** the privacy manifest gains collected-data
  entries ("not linked to you"); the README, `ios/README.md` and the App Store
  answers in `ios/RELEASING.md` all stop saying the app has no networking; the
  web app gains its first request. (All done with E6, and the privacy page
  rewritten for it.)
- **Each egg carries what the app said** (`DECISIONS.md` 37). Every
  uploaded record - and, once E6 lands, every record kept on the device - holds
  the full forecast at "Eggs in": the yolk's three answer probabilities (too
  soft, just right, too firm) and the white's (runny, tender, firm), as
  `yolkAnswerProbabilities` and `whiteAnswerProbabilities` give them at the
  time started, unrelated share included - not the odds in tenths - and a
  model version. The model as shipped can then be scored after the code has
  changed. Replay (E1, §4) regenerates what the CURRENT code would have
  forecast; only the stored forecast says what the app actually said.
- **A selection effect to remember.** The people who opt in are the people who
  weigh their eggs. Kitchen and cook effects adapt, but the published egg-to-egg
  noise will flatter everyone else.

Draft of the ask, to be argued over: *"Help make this timer better? If you turn
this on, the app sends how each egg was cooked and how you said it turned out.
No name, no location, nothing about you - just the egg. The timer is still
learning, so sometimes it will try a time a few seconds either way to learn
faster. You can turn it off, and delete what you sent, whenever you like."*

**Built (E6, 2 October).** `COLLECTIVE.md` §1 has every choice; in short:

- **The endpoint** is `server/eggs.ts`, bound to Netlify Blobs by
  `netlify/functions/eggs.mts`: `POST /api/eggs` keeps an egg at
  `records/<tier>/<uid>/<seq>.json` only if that key is new, after
  `parseRecord` has read it; `DELETE /api/eggs/<uid>` removes everything under
  the id; `POST /api/attest` keeps an iPhone's attested key. Netlify's
  per-address rate limit is in the function's config. Nothing about the sender
  is written or logged.
- **The tiers**: `attested`, an egg whose App Attest assertion verifies against
  the key attested for its id, and `open`, everything else - the web, and any
  iPhone that cannot attest. The attestation is bound to the id
  (`clientDataHash = SHA256(uid)`) instead of a server challenge
  (`server/appAttest.ts`, tested on Apple's own sample).
- **The apps** (`src/ui/share.ts`, `ios/App/Sharing.swift`, over core's
  `src/core/share.ts`) keep the id, a
  cursor into the log and every id used, beside the log; the log itself keeps
  no id, and the copy sent carries it. On turning sharing on the log so far
  goes (`DECISIONS.md` 59), then each egg once it is final, in order. "Start
  learning again" makes a new id; Delete what I've sent deletes every id the
  device has used and asks again until the server confirms. The consent is
  the `share` draft, on screen beside the switch.
- **Each record carries its forecast and `model`** (§4).
- **Not yet**: the endpoint goes live with the next push; the attested path
  has not run on a phone.

## 8. Deciding, not just estimating

- **Choose the time by expected utility**, not by solving at the posterior mean.
  The loss is lopsided - a runny white is worse than a slightly firm yolk, by an
  amount that can be learned per cook - so under uncertainty the right time sits
  on the safe side of the window.
- **Say the odds.** The probability that the white sets and the yolk lands in
  the band is a number the posterior predictive already contains. Pooled data
  measures the irreducible part of it, which no amount of inference narrows.
- **Recommend the protocol, not only the time.** One knob cannot steer two
  outcomes. The soft-yolk, set-white window is about 50 s wide at best and may
  be empty for a strict idea of "set". What widens it is a steeper gradient:
  fridge-cold, weighed, straight into ice. The app should say so when asked for
  soft, as it already does for counter-resting.
- **Nudge the time.** The app chooses the time as a function of the inputs, so
  all its data lies on one surface and the slopes off that surface are never
  seen. Moving the recommendation by up to +-10 s - inside "just right" - fixes
  that at no cost to the cook, and gives an estimate free of selection. Consent
  in §7.
- **Say that it is learning.** The nudge is acceptable on one condition (`DECISIONS.md` 3):
  the app does not present itself as finished. A cook who has opted in sees, in
  plain words and wherever the time is shown, that the timer is still learning
  their kitchen - which is also simply true for anyone in their first few eggs,
  nudge or no nudge, and sets the right expectation for the odds on screen.
  *Settled, 2 October:* the "still learning" line had left both screens
  (below), and the owner chose a small "Learning" mark on the time, with an
  (i), shown while sharing is on (`DECISIONS.md` 58).

**Built (E5, 28 September).** `src/core/decide.ts`, held to
`EggTimerCore/Decide.swift` by `fixtures/decide.json`: given the same posterior
and the same pot, the two apps choose the same time to 1e-12. What settled:

- **The loss** is P(too soft) + P(too firm) + 3 P(runny), over every particle,
  each through the probit the filter learns with - time-scale, taste, noise,
  white offset and firm gap together. The 3 is the owner's (`DECISIONS.md` 7), a constant.
  The unrelated share is left out of the loss, where it adds a constant, and
  kept in the odds, which are about what a cook will say.
- **Where it looks.** Within 120 s of the mean solve's time, at the level the
  refusals leave: `verdictFor` still reads the mean solve, snaps a doneness the
  white forbids, and says why, and the choice leans from there. A cost of
  1e-4 egg per second of lean makes the choice defined where the loss is flat -
  on the counter's softest level, or after runny whites, every time past a
  point loses the same whole egg - and moves it a quarter of a second where
  the loss has a real minimum. Where there is no cook to choose for (the white
  never sets; an unreachable doneness that could not be snapped) the solver's
  answer stands.
- **Not before the first egg.** Under the prior alone the choice runs 86 s late
  at soft and 42 s at jammy on the reference egg, and the first egg comes out a
  step firm. The prior's time-scale sd is about +-70 s of cook time, so no time
  gets the yolk right more than one egg in five and the white's tail steers.
  The prior is wide so the filter can learn, not because anyone believes one
  kitchen in twenty makes a jammy white runny. So the time is the literature's
  until an egg has taught something - as `calibrationParams` has always had it -
  and after one egg the choice leans 4-9 s. This is the one place the design
  above is not followed to the letter.
- **The taste offset reaches the time**, for the first time since Phase C: a
  posterior that knows its cook likes a yolk a fifth of a decade firmer gets a
  later time at every level, where the mean solve gave the same one.
- **The odds** are P(white not runny AND yolk just right) at the chosen time,
  independent within a particle and correlated across particles, in tenths. On
  400 simulated cooks x 6 eggs, 1000 particles, the expected calibration error
  is **2.2%**, every egg within 1-3 points (21% -> 21%, 39% -> 37%, 51% -> 51%,
  58% -> 59%, 62% -> 64%, 65% -> 68%; `npm run decide -- odds`). A fresh
  install says 2/10; one egg, 5-6/10; three, 7/10. This is the one place the
  calibration numbers live; `test/decideOdds.test.ts` runs a smaller copy.
- **The surface.** Only the time-scale needs the physics - the offsets and the
  noise are additive in log dose - so a decision needs one dose grid per pot,
  with `tauAirScale` at 1.0 (§2), spanning every level the pot can
  deliver and 120 s beyond: 13 rows x 10 s, 0.4-0.7 s to build in node (1.3 s
  with the heat off), within 0.2 s of a fine grid's choice on boiling pots. The
  slider is not part of what it is built from, so a drag never waits for one.
  The apps show the mean solve's time at once and switch when the surface lands.
- **The resample** is Liu and West's kernel, discount 0.98, in both cores:
  each resampled particle is shrunk toward the weighted mean and moved by a
  draw from the weighted covariance, in coordinates where every dimension is
  additive, so the mean and the covariance survive it. A fixed jitter would
  not: it holds alpha's spread above its own size whatever the answers say,
  pulls apart the time-scale-and-taste combination the answers pin, and makes
  the right time's spread climb back at every resample, which showed as odds
  4-6 points low from the fourth egg (LOGBOOK.md, 28 September). With the
  kernel, Phase C's recovery is egg 2, 12.2 s short, sd 3.0%; the answers'
  calibration 1.3%; and one probe reading keeps the time-scale at 2.6-2.8%.
- **The seed.** The filter is random, and a last-bit difference in `exp`
  between two machines can send its resample down another path, so what is
  tested is the distribution it samples, never its particles
  (`tools/posterior.ts`). After the ten-egg logs of `npm run posterior --
  noise`, replayed as the app replays them, the jammy time chosen for a 58 g
  egg moves with the seed by an sd of 2.8 s at 1000 particles (4.9 s at 250,
  1.6 s at 4000), and the odds by 0.05 (0.11, 0.03): one seed shows 4/10
  where another shows 7/10. Against the exact posterior (importance sampling
  from the prior on the same surfaces, `npm run posterior -- reference`) the
  filter is right on average to 0.3 s and 1.7 points of odds, with its upper
  tails a little short. Simulation-based calibration (`npm run sbc`) finds
  the same: at 1000 particles 12-13.6% of true values fall in the posterior's
  outer tenth, where 10% should, because the seed's noise is counted as
  overconfidence; at 4000 it is 10-11.6% and uniform.
- **"Still learning"** is the 80% interval of the right cook time wider than
  +-15 s (`DECISIONS.md` 9), read at the level on screen; per particle the
  right time is the later of the yolk's centre and the white's cutpoint
  (`predictCookTime`). With the kernel it is quiet after a median of four
  eggs and comes back for 7% of simulated cooks; on a consistent cook at
  jammy it runs +-72, 22, 13, 11, 9, 8 s over the first five eggs. No screen
  shows it (`DECISIONS.md` 27), the decision does not compute it
  (`DECISIONS.md` 40), and the record does not keep it: `npm run decide --
  learning` and `test/decide.test.ts` read it on demand.
- **A cook under way** carries the lean chosen at "Eggs in" onto the boil tap's
  re-solve rather than waiting a second for the new pot's surface: 3 s from
  choosing again at soft, under 0.5 s at jammy.
- **Two runny whites at soft** (LOGBOOK.md, 28 September). With the yolk also
  "just right", the choice moves soft 146 s and jammy 17 s: the shape §3's E3
  asked for, which the mean solve alone did not give. With the white alone
  both move. And where the white binds the lean is long, up to the window: the
  mean solve times a white at its median, a coin flip on runny, and a runny
  white costs three. Whether that is the right trade, or the white offset's
  prior is too wide, is the owner's.

**Reachability from the odds (27 September).** The owner's answer to the
white-bound 0/10 above: the slider offers the levels whose odds are at least
3/10, not whatever the mean solve reaches. `src/core/reach.ts`, held to
`EggTimerCore/Reach.swift` by `fixtures/reach.json`:

- **The odds at every level** are the odds the app would show there - the
  mean solve at that level, decided on the pot's decision surface - so the
  profile and the line under the time are one computation and cannot
  disagree. Points at the physical edges and every 0.05 between, and a
  bisection on the slider's 0.01 grid at each end of the range, so the level
  the slider snaps to has computed odds of 3/10 or better. 0.45-1.0 s in node
  for a boiling pot, off the page in both apps.
- **Physical impossibility still wins.** The profile has points only where
  the pan delivers, so the odds narrow the range and never widen it. A level
  the pan cannot deliver keeps its physical sentence ("any shorter and the
  white is still raw") and snaps to the odds' end; a level it can deliver but
  the odds do not allow is refused as `unlikelySoft` / `unlikelyHard`. Dips
  under 3/10 inside the range are not refused; only the ends move.
  **Amended 5 October 2026** (`DECISIONS.md` 83): nothing the pan can deliver
  is refused any more. A level outside the range at 3/10 or better stays
  where it was asked and is warned of (`lowOddsAt`, `warn.lowOdds`); a level
  the pan cannot deliver snaps to the physical edge, not the odds' end, and
  is warned of there if that edge is under 3/10. The `unlikely*` verdicts are
  gone. The range is now where the warning starts, and the rest of this
  section reads with "warned of" for "refused".
- **When no level reaches 3/10, the physical limits stand**, with no refusal
  from the odds. That is the fresh install: under the prior every level reads
  about 2/10 (0.12-0.26 across the pots in `npm run decide -- reach`), and
  refusing on that would refuse a cook for being new. It is also a rule of
  its own - no odds-based refusal before the first egg that taught something -
  so no pot whose prior odds happen to cross 3/10 can refuse a new cook.
  There is a cliff in this: a best level at 0.29 refuses nothing, one at 0.31
  refuses everything under 0.3. After one egg the best is 6/10 on every
  boiling pot measured, so in practice the rule trims the softest few
  hundredths (0.01-0.07 after one egg; 0.05 on the counter).
- **The shading** is each level's odds over the best level's, so a fresh
  install at 2/10 everywhere still shows where the pan works best.

**Protocol advice (27 September).** Offered, closed, under odds below 5/10 or
3 tenths or more under the best level's. What it lists is the changes that
would help this setup. Two the model can price, from the changed pot's own
profile, and they are listed only where they raise this level's odds by half
a tenth: the counter to ice (after one egg, soft/jammy/fudgy/hard 0/0/5/6 to
5/6/6/6; no help at hard), and twice the water with the heat off (0 to 3-4/10
from 2 to 4 L). Two it cannot, because it takes their inputs as exact: a room
egg's temperature (17 against 23 C is 28 s at jammy) and a size class's mass
(63 against 73 g, 39-49 s). Those are listed by rule. A cold tap is not
advised against at all: on the model it is ice, to the tenth, at every level
(`npm run decide -- advice`). The honest statement of that: the model's odds
see the physics of a protocol, not the spread of its inputs; the per-cook
noise absorbs the latter, egg by egg.

**The outcome (27 September).** "7/10 eggs hit the mark" does not say which
way the other three miss, so the cook cannot act on it. `predictOutcome` in
`src/core/outcome.ts`, held to `EggTimerCore/Outcome.swift` by
`fixtures/outcome.json`, takes what the decision takes - the posterior, the
surface, the chosen time and the nominal target - and returns:

- **The answers**: P(too soft), P(just right), P(too firm) and P(runny), the
  posterior predictive the loss and the odds are already made of, unrelated
  share included, so they are about what the cook will say. On 400 simulated
  cooks x 6 eggs they are calibrated to 1.3-1.6% (yolk) and 0.2% (white).
- **The level**: the 10%, 50% and 90% points of the delivered yolk doneness
  on the slider's scale. Each particle delivers its time-scale's log dose,
  read off the surface, with a Gaussian of its own noise around it; the
  points are the weighted mixture's, found by bisection on its CDF. The
  delivered level falls inside the 80% range for 81.1% of simulated eggs
  (8.2% under, 10.7% over), 78-83% at every egg from the first. The range is
  0.14-0.72 on a fresh install at jammy and 0.35-0.51 after three jammy eggs
  just right. Since the `certainty` draft (8 October 2026) it is the 5%,
  50% and 95% points, the 90% the certainty's words state: on 900 simulated
  eggs (`test/outcome.test.ts`) 87.7% fell inside, 6.1% under and 6.2% over.
  The figures above are the 80% range's.
- **The lean**: 'soft' or 'firm' when one way of missing is more than 1.5
  times as likely as the other, 'balanced' between - a miss one way three
  times in five, the least that makes "if not, more likely a little firm"
  right clearly more often than wrong. The probabilities are calibrated at
  every ratio from 1 to 3, so this is when to speak, not a correction.

**The level leaves the taste offset out.** The taste offset is where this
cook's "just right" sits, not how hard the egg is. Leaving it out makes the
level a physical scale the cook can compare with the slider: a cook who likes
a firmer yolk is served a later time, and the range's median lands above the
slider's own position (0.45 at jammy on `decide.json`'s firmer posterior).
With the offset in, the level would be the egg as this cook's taste reads it,
which is what the three answers already say. The noise stays in: it is the
egg-to-egg scatter the likelihood sees every answer through. On one phone
that scatter and the cook's own judging are one number, so the range is as
wide as the answers make the egg look.

**Clamped to [0, 1].** A low end of 0 means at least one egg in ten is
softer than the runniest level the slider offers; a high end of 1 means at
least one in ten is at or past the hardest, which at hard is half the eggs.

It costs about 2 ms in node beside a decision's 13-16 ms, and is computed
once, at the time on screen.

**Playing safe** - a suggested level that errs the cook's preferred way - was
built and then deleted on the owner's word (`DECISIONS.md` 36, 39). The
bracket under the slider does the same job without a suggestion.
LOGBOOK.md, 27 and 28 September, has what it measured.

**Built (E8, 2 October): the nudge.** `nudgeSeconds` in `decide.ts` turns a
uniform draw into a whole number of seconds from -10 to +10, each equally
likely; `appliedNudge` takes it only where a time is chosen; both apps draw
it at launch and after each cook and apply it while sharing is on, so the
time shown, the time started and the outcome under it agree, and a boil
tap's re-solve carries it with the lean. The record keeps `recommended_s`
and `nudge_s` apart, and `MODEL_ID` names the policy (`2026-10-e8`; since
the five yolk words, `2026-10-e9`). The
Learning mark (the `learning` draft) says so while it is on.

What it costs was measured before it shipped, and "at no cost to the cook"
above was wrong: on 300 simulated cooks x 6 eggs (`npm run decide --
nudge`), with the truth's own probit, the share of eggs right - the yolk
just right and the white not runny - falls from 52.1% to 49.3% at +-10 s,
and from 66.9% to 62.6% by a cook's sixth egg, when the time is already
close. Near the best time the chance of a good egg is a hill, and any
symmetric spread about the top lowers it in proportion to the spread's
variance; so does what the spread teaches about the slope. +-5 s costs
under a point (51.3%) and teaches a quarter as much; +-3 s a third of a
point and a ninth. The owner chose +-10 s knowing it (`DECISIONS.md` 61),
and the Learning mark's (i) says an egg may come out a little softer or
firmer.

**Monotone in the level (5 October 2026, `DECISIONS.md` 84).** The loss is
relative to each level's own target, so nothing makes the chosen times keep
the levels' order. Where the white binds they do not: after one egg answered
soft with a runny white (58 g, fridge, boiling, ice), soft chose 500 s and
jammy 428 s, because at soft the yolk part of the loss is lost either way and
the white's 3x steers. The owner wants the time never to fall as the level
rises. `oddsProfile` (`src/core/reach.ts`) already decides every level, so it
decides them from the hard end and holds each point under the time of the
point above: a running minimum, which is the projection of the per-level
choices onto non-decreasing schedules - each level capped at the next firmer
level's time. A level between two points, as on a drag, is held between
their two times (`envelopeBounds`), so a drag costs its own decision and a
look-up, as before; the odds, the bracket and the direction are read at the
time held. The profile's step is 0.05, so a dip in the choices narrower than
that is missed: just firmer than the jump at 0.36 above, 0.36-0.39 are held
up to 0.40's 427 s from their own 422-426 s. Between two points the time is
held inside their bounds but not ordered: the review found 0.61 at 716.1 s
and 0.62 at 715.2 s, so the slider is monotone at the points and within about
a second of it between them, which the owner accepts (amending 84) rather
than four more solves a drag. Until the profile lands a level
keeps its own choice; before the first egg the literature's times already
rise with the level and nothing is held.

The deeper fix is a loss that knows the levels are ordered - a miss by one
band cheaper than a miss by two, so that being given jammy when soft was
asked costs less than a hard yolk - under which the choices could come out
monotone by themselves. Left for later.

Not built: any per-cook loss.

**How sure, in words (6 October 2026, `DECISIONS.md` 93; SHIP-0.5 A7).**
On both screens since the `certainty` draft (SHIP-0.5 D1, 8 October 2026),
where the odds profile also reads it at each level: the chance of the word
asked shades the track, and a wild guess at either end is dotted (reach.ts).
`certaintyAt` in `src/core/certainty.ts`, held to
`EggTimerCore/Certainty.swift` by `fixtures/certainty.json`, takes what the
outcome takes - the posterior, the surface, the time on screen - and the
level that time is for, and reads the five yolk words' posterior predictive
there (`yolkWordProbabilities`, the record's `forecast.yolkWord`, unrelated
share included). As built:

- **The word asked** is the slider's word: the anchor nearest the level
  (`anchorNear`), as the heading shows it. The anchors' midpoints are the
  cuts between the answers (`YOLK_WORD_CUTS`), so it is also the band the
  level's nominal dose falls in. An exact tie goes softer, as `anchorNear`
  has it: the slider's 0.11 reads Runny. Its 0.81 reads Hard, because its
  two gaps differ in the last bit.
- **The class.** *Very certain* when P(the word asked) is at least 0.9;
  *a ballpark* when it and its neighbours hold at least 0.9 (one neighbour
  at Runny and at Hard); *a wild guess* otherwise. The unrelated share caps
  a word at 0.96.
- **The 90% interval in words**: the narrowest run of adjacent words
  holding at least 0.9; among runs equally narrow, the one holding more; on
  an exact tie, the softer. It need not contain the word asked. **The most
  likely word**: the largest, the softer on a tie.
- **The likely time range**: the 90% credible interval of the right cook
  time for the level, `predictCookTime` read at 5% and 95% - per particle,
  the later of the time its yolk reaches the middle of the level (taste
  offset included) and the time its white reaches its runny | tender cut,
  as "still learning" reads it at 80%. It is how sure the timer is of the
  time itself, and it narrows as it learns, as the words do: 166 s wide on a
  fresh install at jammy (58 g), 56 s after one egg, 27 s after ten.
  **This is the owner's choice**, and it is one function and two constants
  (`likelyTimeRange`, `TIME_RANGE_LOW_Q`, `TIME_RANGE_HIGH_Q`). Not chosen:
  (a) the span of times over which the most likely word stays the word
  asked - it says how much slack the word has, not how sure the timer is,
  never narrows below the word's own width (about 45 s at jammy), can be
  empty where the word asked is never the most likely, and needs a scan of
  the predictive over the surface on every drag; (b) the times at which
  P(the word asked) stays within some share of its best - the same meaning
  and cost, with a share no one has chosen; (c) "still learning"'s own 80%
  interval - cheaper by nothing, and an 80% range beside "9 times in 10" in
  words; (d) the outcome's level range turned into times - that is the
  egg's spread at one time, which the words already say.

What a fresh install is told at each word (`npm run decide -- certainty`;
58 g from the fridge, boiling water, ice, 1000 particles, the time held by
the pot's profile as the apps hold it):

| word | time | class | P(asked) | with neighbours | 90% in words | time range |
|---|---|---|---|---|---|---|
| Runny | 336 s | wild guess | 0.64 | 0.88 | Runny to Jammy | 278-426 s |
| Soft | 379 s | wild guess | 0.33 | 0.87 | Runny to Fudgy | 308-458 s |
| Jammy | 419 s | wild guess | 0.32 | 0.85 | Runny to Fudgy | 341-507 s |
| Fudgy | 468 s | a ballpark | 0.46 | 0.9002 | Jammy to Hard | 381-566 s |
| Hard | 577 s | a ballpark | 0.78 | 0.96 | Fudgy to Hard | 470-698 s |

Very certain is never reachable on a fresh install. It is after eggs: one
egg called Jammy makes Hard very certain and every other word a ballpark;
three make Fudgy very certain too; ten make every word but Runny very
certain (0.92-0.96), Runny a ballpark at 0.88. On 300 simulated cooks x 8
eggs answering in words, spread over the five words: very certain 0% of
first eggs, 13% of second, 52% of eighth; wild guesses fall from 68% to
15-18% from the second egg on, and stay there. The classes keep their promise: of eggs called very certain, the
word asked came out 93%; of ballparks, it or a neighbour 97%. The 90%
interval held the word 93-96% at every egg (whole words make it a little
wide), and the time range held the cook's own right time 89-94%.

## 9. The fit

- **Offline, in Python** (NumPyro or Stan), outside `src/core/` and its
  no-dependency rule. HMC over the 2-4 global parameters and the hyperpriors,
  cook effects marginalised or fitted by Laplace once there are too
  many to sample.
- **An emulator, not the solver**, in the likelihood: the dose grid is already
  one, in two dimensions. It needs the time-scale, size, start temperature,
  cooling and start mode, and gradients.
- **It publishes one small file**, `fixtures/population.json`: global posterior
  means and covariance, and the hyperpriors for cook effects. Both
  apps read it as the prior, under the conformance suite like every other
  fixture.
- **Validation is by proper scoring rules** (`DECISIONS.md` 37), on
  held-out cooks and one step ahead, not by home-made quantile checks:
  - **The log score is primary.** For an answer it is the ordered-probit log
    likelihood of that answer one step ahead; summed over a cook's eggs it is
    the prequential log marginal likelihood, which the particle filter's
    incremental weights already compute. The unrelated share (epsilon = 0.05,
    §3) is a floor under every answer's probability, so the score stays finite.
  - **The ranked probability score** is the reported ordinal-aware, bounded
    score for the three-answer scales.
  - **Probe readings** (§5) are scored by CRPS or by their log predictive
    density.
  - **Calibration is displayed**, not tested by hand, as reliability diagrams
    and randomised PIT histograms: when the model says a white will be runny
    one time in five, it is.
  - The stored forecast (§7) scores the model as shipped; a replay under the
    current code scores the model as it now is. Both are worth having.
  - The on-screen direction sentence, the bracket under the slider and the
    "still learning" interval are display and decision heuristics. None is
    used for evaluation.
  README §7's table remains as the check on the prior.

**Built (E7, 2 October), and checked on cooks whose answer is known.** No
shared egg exists yet, so nothing real has been fitted; what exists is the
whole pipe, and its check on simulated cooks.

- **The population** (`src/core/population.ts`, `Population.swift`): one
  spread per particle dimension and an id. `createPrior` draws from it, and the
  literature's is the old prior number for number, so every fixture stood
  still. A calibration carries the population's centre (`PriorStart`) and
  solves there before any egg, so a cook who never answers is still timed
  where everyone's eggs put a new cook. `fixtures/population.json` is the
  literature's (`npm run population -- literature`) until a fit is published;
  the web fetches it, iOS bundles it, a stored posterior keeps the id it was
  drawn from, and a different one is replayed. The record's `prior` is that
  id.
- **The emulator** (`npm run eggs -- emulate`): for each egg, its log yolk and
  white doses and peak yolk temperature at its scored cook time on 17
  time-scales, -4 to +4 literature sds, uniform in log alpha as the app's
  grids are. The fit interpolates; it never runs the physics. Carryover and
  size are held at the physics (§2).
- **The fit** (`fit/`, NumPyro, NUTS, double precision): the globals - the
  time-scale `mu_z` in literature sds, and the white's lag - with
  heavy-tailed (Student-t, 4 df) cook effects for the time-scale, taste and
  white cutpoint, lognormal noise and firm gap, the app's own likelihood
  (`fit/tests` holds it to `infer.ts` to the digit), and the tiers: open
  eggs at a power of 0.5, the open tier's total weight capped at the
  attested tier's. It publishes a new cook's predictive as a population: per
  dimension the median and half the central 68%, which a Student-t's tails
  do not inflate. The taste's centre is 0 by convention.
- **Checked** on 400 simulated cooks (2,602 answered eggs, 40% attested),
  drawn from a known population - a kitchen 7% faster than the literature
  (`mu_z` 0.6), whites a quarter of a decade later - cooked at the
  literature's times with the nudge, fitted on four fifths and scored on the
  rest (`npm run eggs -- simulate`, `fit/README.md`). 1,200 draws, none
  divergent. The time-scale is recovered (0.597 +- 0.037 for 0.600) and the
  white's lag (0.229 +- 0.053 for 0.250), and every spread but one inside its
  90% interval. One step ahead on 77 held-out cooks, the fitted population
  scores -0.455 per yolk answer and -0.463 per white, the truth's own -0.452
  and -0.461, the literature's -0.509 and -0.478; on a cook's FIRST egg
  -0.539 against the literature's -0.843 and the truth's -0.536. Probe
  readings: -2.09 against -2.87 and -2.07. Reliability and PIT are in the
  report; at 500 answers their bins are as ragged as the truth's own.
- **Not recovered: the noise.** Its median comes out 0.207 for a true 0.18,
  and its spread between cooks 0.13 for 0.35, outside both intervals. With
  three to ten eggs a cook, a cook's noise, their taste and their time-scale
  trade against each other: the taste's spread comes out half the truth's
  and the time-scale's a sixth too wide. The predictive does not suffer -
  that is what the held-out scores say - but the spreads are not to be read
  as facts about cooks.
- **Checked again with the five yolk words** (6 October 2026, `DECISIONS.md`
  92): 400 simulated cooks, a quarter answering their first two eggs the
  old way and the rest in words; 2,578 answered eggs, 772 of them attested,
  the open tier at no weight. `mu_z` 0.663 +- 0.050 for 0.600 and the lag
  0.175 +- 0.067 for 0.250, every global inside its 90% interval but the
  white's spread between cooks (0.15 for 0.30). Held out, -0.581 per yolk
  word against the truth's -0.574 and the literature's -0.614, and -0.597
  per old answer against -0.598 and -0.804. The two yolk questions are
  scored apart, since a score over five answers and one over three are not
  on one scale.
- **The tiers with no attested eggs**: `DECISIONS.md` 2 read literally caps
  the open tier at zero, so the first fit, if every egg comes from the web,
  learns nothing. `--open-cap` changes it; the choice is the owner's
  (`COLLECTIVE.md` §4).
