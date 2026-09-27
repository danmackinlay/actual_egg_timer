# INFERENCE.md — making the inference the main part

A design, not a record and not a state. Three parts are built: the record in
§4 (E1, 26 September 2026), whose schema below is now the one the code writes,
the ordered probit and the white offset of §3 (E2 and E3, 27 September),
whose numbers are in §3's "Built" paragraph, the thermometer of §5 (E4,
27 September), whose numbers are in §5's, and deciding under uncertainty, §8
(E5, 28 September). Nothing else is. The checklist
that tracks it is Phase E in `PLAN.md`; the two measurements it rests on are in
`LOGBOOK.md` (21 September 2026) and can be re-run with `npm run rank` and
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
log doses against ten candidates, scaled by their priors, over 174 reachable
cooks at the times the app would recommend.

| direction | answers to halve its prior sd | what it is |
|---|---|---|
| 1 | ~1 | **time-scale** - `alpha`, with boil-temperature and start-temperature error folded in |
| 2 | ~5 | **white lag** - the white's threshold and the radius it is judged at, mixed 0.75 / 0.60 and not separable |
| 3 | ~60 | carryover (`tauAirScale`) - and **never**, from cooks that all go into water |
| 4 | ~110 | size scaling - needs a spread of egg sizes |
| 5 | ~270 | start-temperature bias |
| 6-10 | 500 to 250 000 | both z-values, threshold-versus-radius, boil bias on its own |

There is a tenfold gap after the second direction and the z-values are at the
very bottom. So:

**Global, always learned (2).** A *time-scale* and a *white lag*. They are named
for what they do to a prediction, not for a physical constant, because that is
all the data can vouch for: "time-scale" absorbs `alpha`, `h`, the Dirichlet
bias, a simmer mistaken for a boil and a warm fridge, and nobody will ever be
able to say in what proportion.

**Global, learned only where the data reaches (2).** *Carryover* (only
counter-rested cooks inform it) and *size scaling* (only a spread of sizes).
Where the data does not reach, they sit at the physics.

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

The present particle - `alpha`, taste offset, `tauAirScale` - is already most of
this. The dimension it lacks is the white lag, which is the second-strongest
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
are too many at breakfast (§11). The white gets runny / tender / firm. The
comment in `infer.ts` declines a third level because it would need an unmeasured
ceiling; pooled, the ceiling is a learned cutpoint like any other.

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
egg. This is what `P_DISAGREE` is already standing in for.

**Built (E2 and E3, 27 September).** `src/core/infer.ts`, held to
`EggTimerCore/Infer.swift` by `fixtures/calibration.json`. The particle has six
numbers: the time-scale (`alpha`), the yolk taste offset, `tauAirScale`, and
three new ones.

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
  keeps the old band's meaning.
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
- **E1's two-level "set"** still loads and is scored as tender-or-firm.

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
held to `EggTimerCore/Record.swift` by `fixtures/record.json`.

```json
{
  "v": 1,
  "uid": null,
  "day": "2026-09-21",
  "app": "ios", "appVersion": "0.3.0", "prior": "2026-09",
  "egg": { "mass_g": 68, "massFrom": "class", "sizeTable": "eu" },
  "setup": {
    "startMode": "hot", "eggStart_C": 4, "eggFrom": "fridge", "ambient_C": 20,
    "boiling_C": 100, "timeToBoil_s": 480, "timeToBoilFrom": "remembered",
    "cooling": "ice", "afterBoil": "hold", "waterLitres": 1.5, "eggCount": 2
  },
  "level": 0.22,
  "recommended_s": 399, "nudge_s": 0, "pulled_s": 412, "pulledBy": "cook",
  "cooled_s": 180,
  "yolk": -1, "white": null, "whiteOffered": true,
  "probe": null,
  "lang": "en", "register": "modern", "units": "metric"
}
```

- `yolk` and `white` are each an answer or `null`, and a record with both
  `null` is still a record, because the cook, the recommendation and the actual
  pull time are data too. An egg finished and never answered about is logged
  when the cook starts again.
- **The white has three states, not two.** Until E2 the model decided whether
  to ask (`shouldAskAboutWhite`), so `null` alone would not tell "not asked"
  from "asked and skipped". `whiteOffered` says which: `false`/`null` is not
  asked, `true`/`null` is skipped, `true` with an answer is answered. An answer
  with `whiteOffered: false` is refused by the loader. Since E2 the white is
  always offered and every new record says `true`; the field stays, so old
  records read the same.
- **The white's answers are `runny`, `tender` and `firm`** since E2. E1 logged a
  two-level `set`; it still loads, and is scored as tender-or-firm. The change
  was additive: the schema stays `v: 1`.
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
- A day, not a timestamp. A boiling point, not an altitude or a place:
  `boiling_C` is a one-to-one function of the altitude setting, so it carries
  everything the altitude would, and the altitude itself is not recorded.
- `uid` is `null` until E6 mints one. `mass_g` is rounded to 0.01 g.
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
new base and the log starts again empty. "Forget everything" clears the log, the
base and the posterior together.

**Version skew.** The web app deploys on push and the iOS app ships when a build
does, so every record carries `appVersion` and a loader accepts any of them under
`v: 1`. Within v1, fields may be ADDED but never removed or reinterpreted: a
loader ignores fields it does not know, and the nullable fields (`uid`,
`egg.sizeTable`, `yolk`, `white`, `probe`) may be absent and read as `null`. A
new field must say what its absence means. A different `v` is refused.

## 5. The thermometer

`npm run probe`, 68 g egg from the fridge, 400 s in boiling water:

| reading at the centre | C per 1% of time-scale | 3 mm off | 15 s late | 1 C is worth |
|---|---|---|---|---|
| at the pull | 0.60 | +1.33 | +2.21 | 1.7% |
| ice bath, at the yolk's peak (+195 s) | 0.40 | -0.03 | -0.14 | 2.5% |
| counter, at the yolk's peak (+548 s) | 0.30 | 0.00 | -0.01 | 3.4% |

- **Do not probe the white.** At `0.693 R` the field falls 3.5 C per millimetre.
- **Do not probe at the pull.** Every error has the same sign - a miss, a delay
  and the stem all read hot - and hot means "cook it shorter", which is the
  direction the app already errs in.
- **Probe the centre when the centre peaks.** The field is flat there in space
  and in time, and the model already computes the moment (`peakYolkTime_s`). One
  egg, still edible, pins a kitchen's time-scale to about 2.5% - the whole
  ordinal plateau is 3% - and with no taste in it.
- **It does not settle the carryover constant.** One prior sd of `tauAirScale`
  moves the rested reading 1.1 C; one prior sd of `alpha` moves it 3.5 C. README
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
  simulation. The grid is built at the posterior's mean `tauAirScale`, so on
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
  little for the tail - and to 3.28 / 3.33 / 3.52% once the filter has
  resampled, because its jitter was a fixed 2% on alpha. Since E5's resample
  kernel (§8) the filter keeps 2.60 / 2.61 / 2.81%. A kitchen 10% fast is
  found at x1.10 from one reading. +1 C shortens the next jammy cook by 15 s,
  -1 C lengthens it by 5 s (the asymmetry is the cold tail: a reading at the
  peak already looks slightly hot).
- **When**: the counted cooling now ends at `peakYolkTime_s` for the cook as
  solved (old item 4), so the countdown's end, its alarm and the reading are
  one moment. The probe is offered only where that moment exists: an ice bath
  or a tap, with the peak after the pull. Not on the counter, where nothing is
  counted, the peak is nine minutes out and `tauAirScale` is in it; not with
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
  (§11): its records enter the GLOBAL fit under a tempered likelihood (a power
  below one, 0.5 to start), and the web tier's total effective sample size is
  capped at the attested tier's, so no number of browser tabs can outvote the
  phones. The discount applies only to what a web cook teaches everybody else.
  What they teach their own browser is untouched, since nobody can poison their
  own breakfast but themselves;
- a cap on how far any global parameter may move per published prior;
- the thermometer panel and the physics prior as anchors.

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
  web app gains its first request.
- **A selection effect to remember.** The people who opt in are the people who
  weigh their eggs. Kitchen and cook effects adapt, but the published egg-to-egg
  noise will flatter everyone else.

Draft of the ask, to be argued over: *"Help make this timer better? If you turn
this on, the app sends how each egg was cooked and how you said it turned out.
No name, no location, nothing about you - just the egg. The timer is still
learning, so sometimes it will try a time a few seconds either way to learn
faster. You can turn it off, and delete what you sent, whenever you like."*

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
- **Say that it is learning.** The nudge is acceptable on one condition (§11):
  the app does not present itself as finished. A cook who has opted in sees, in
  plain words and wherever the time is shown, that the timer is still learning
  their kitchen - which is also simply true for anyone in their first few eggs,
  nudge or no nudge, and sets the right expectation for the odds on screen.

**Built (E5, 28 September).** `src/core/decide.ts`, held to
`EggTimerCore/Decide.swift` by `fixtures/decide.json`: given the same posterior
and the same pot, the two apps choose the same time to 1e-12. What settled:

- **The loss** is P(too soft) + P(too firm) + 3 P(runny), over every particle,
  each through the probit the filter learns with - time-scale, taste, noise,
  white offset and firm gap together. The 3 is the owner's (§11, 7), a constant.
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
  400 simulated cooks x 6 eggs the expected calibration error is 2.2%, every egg
  within 1-3 points. A fresh install says 2/10; one egg, 5-6/10; three, 7/10.
- **The surface.** Only the time-scale needs the physics - the offsets and the
  noise are additive in log dose - so a decision needs one dose grid per pot,
  with `tauAirScale` at its posterior mean, spanning every level the pot can
  deliver and 120 s beyond: 13 rows x 10 s, 0.4-0.7 s to build in node (1.3 s
  with the heat off), within 0.2 s of a fine grid's choice on boiling pots. The
  slider is not part of what it is built from, so a drag never waits for one.
  The apps show the mean solve's time at once and switch when the surface lands.
- **The resample.** Calibrating the odds found them 4-6 points low from the
  fourth egg, and plain reweighting did not, so it was the filter: E2's
  resample moved every particle a fixed 2% on alpha (and 0.015 decades, 3%)
  whatever the posterior, independently in every direction. That held alpha
  over ~3%, pulled apart the time-scale-and-taste combination that the answers
  pin, and made the right time's spread climb back at every resample. It is
  now Liu and West's kernel: each resampled particle shrunk toward the weighted
  mean and moved by a draw from the weighted covariance, in coordinates where
  every dimension is additive, discount 0.98, so the mean and the covariance
  survive. Replayed, Phase C's recovery is unchanged and one probe reading is
  kept at 2.6-2.8%, not 3.3-3.5%.
- **"Still learning"** shows while the 80% interval of the right cook time is
  wider than +-15 s (§11, 9), read at the level on screen. Per particle the
  right time is the later of the yolk's centre and the white's cutpoint
  (`predictCookTime`). Under the old resample the rule came back after going
  for 44% of simulated cooks, and a fixed count of four eggs was built as the
  fallback; with the kernel it comes back for 7%, and the owner's rule stands.
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

Not built: the protocol advice when soft is asked for, the nudge (E8), and any
per-cook loss.

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
- **Validation is predictive calibration on held-out cooks**: when the model says
  a white will be runny one time in five, it is. That becomes the headline check;
  README §7's table remains as the check on the prior.

## 10. Order, and why

1. **The record and the ordered probit** (E1, E2). Both pay off for one cook
   with no server, and everything later reads the record.
2. **The white offset on the device** (E3). The missing direction, justified by
   the rank measurement and by two real eggs.
3. **The thermometer flow** (E4). One egg for a kitchen's time-scale.
4. **Expected utility and the odds on screen** (E5). Needs E2's predictive.
5. **Opt-in upload, the endpoint, deletion** (E6). Only now does anything leave
   the phone.
6. **The population fit and the published prior** (E7), then the nudge (E8),
   which is worthless before there is a fit to use it.

## 11. Decided by the owner, 21 September 2026

1. **The endpoint is a Netlify function, and the controller is the owner, in their
   own name.** §7 has the shape. The contact address is
   forgetmyeggs@danmackinlay.name, chosen and created 26 September.
2. **The web app contributes, at a lower weight.** §6 says how: a tempered
   likelihood in the global fit and a cap on the tier's effective sample size,
   with no discount on what a web cook's answers teach their own browser.
3. **The nudge is fine, provided the app advertises that it is learning.** §8.
   The point is to manage expectations, so the wording belongs on the screen
   with the time, not only in the consent.
4. **Three yolk answers, not five - and every answer is optional.** §3 and §4:
   a skip is recorded as a skip. This is the decision with a statistical cost,
   and the cost is accepted rather than engineered away.
5. **"Tender" stands, for now.** Slightly odd, not pathological, and no picture
   could do better. Revisit if real cooks stumble on it; the record will show
   whether the middle answer is being used.

### Decided by the owner, 26 September 2026

6. **Eggs from before E1 are dropped at E2, not backfilled.** E1 keeps the
   pre-log posterior as a frozen base. The new likelihood cannot replay it, so
   E2 starts from the prior plus E1's log, and the base goes. *Done 27
   September.*
7. **The loss ratio is 3.** A runny white counts as three times as bad as a
   yolk one step too firm (§8). It is a constant for now, and a per-cook
   slider only if someone asks for one. *Built 28 September* (`RUNNY_WHITE_LOSS`).
8. **The odds are always on screen, and brief**: *"7/10 eggs hit the mark"*.
   "Hit the mark" means the posterior predictive probability that the white is
   not runny AND the yolk would be answered "just right". It is rounded to
   tenths, because more precision than that is not there. *Built 28
   September*, under the time in both apps and on the Lock Screen.
9. **"Still learning" goes when the 80% interval on the cook time narrows
   below about +-15 s**, which is about the width of "just right". If that
   proves fiddly to compute or to make stable, fall back to a fixed number of
   eggs. The owner's view is that cooks will barely notice the difference, so
   the threshold is preferred but not worth a fight. *Built 28 September as
   the threshold*, after the resample was fixed; the fallback was built and
   measured first (§8).
10. **No kitchens.** Pans and hobs vary within a kitchen, and nobody maintains
    profiles, so the kitchen level folds into the cook (§2).
11. **The standing method's pan constant comes from the water volume, not
    the boil time.** Deriving it from the boil time, with `RAMP_R` fixed, reads
    the HOB as the pan. A hob twice as strong as assumed makes the app believe
    the pan cools about 2.2 times faster than it does, and a weak one about 2.7
    times slower. The replacement is anchored so that Williams' 17-minute
    method (a 480 s boil, 2 L) is unchanged, and scaled by volume. Lid and pan
    material become a per-cook scale, learned only from standing cooks.
    Nobody is asked to time an empty pan: the only timed boil left is a cold
    start's, where the eggs are already in.
    **Done 27 September**, except the per-cook scale: `TAU_STANDING_REF_S =
    480 / ln(1.5) = 1183.8 s` at 2 L, scaled as `V^(1/3)`, with
    `TAU_STANDING_SCALE` still a global 1.0. The learned per-cook scale is
    deferred (`PLAN.md`). Logged standing cooks replay under the new rule
    without change to the record: it keeps the water volume, and
    `timeToBoilFrom` still says which of them had leaned on a remembered pan.

