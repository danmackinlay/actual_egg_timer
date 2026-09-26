# INFERENCE.md — making the inference the main part

A design, not a record and not a state. Nothing in here is built. The checklist
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

**Per kitchen (1).** A multiplier on the time-scale. Every kitchen-level
nuisance loads on direction 1, so one number is all a kitchen gets.

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
deviation (the cutpoint). Likewise a kitchen's time-scale and the global one.
That split is the whole statistical content of making this collective.

**Pooling also does the job the white channel was built for.** `alpha` and taste
are confounded for one cook. They are not confounded across cooks: the
time-scale is shared and taste is personal. And a kitchen effect moves yolk and
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

**A thermometer reading**, for cooks who own a probe (§5): Gaussian on the centre
temperature, sd about 1.5 C, with a small hot skew because every handling error
reads hot.

## 4. The record: keep the observation, not only the posterior

The largest change in principle, and it is worth doing for one user before any
server exists. Today an answer is folded into the particles and thrown away, so
when the likelihood changed in September the v1 posterior had to be discarded
rather than repaired. With the observations kept, a model change is a replay.

One record per egg, stored on the device; uploaded only under §7.

```json
{
  "v": 1,
  "uid": "random-uuid",
  "day": "2026-09-21",
  "app": "ios", "appVersion": "0.3.0", "prior": "2026-09",
  "egg": { "mass_g": 68, "massFrom": "scale" },
  "setup": {
    "startMode": "hot", "eggStart_C": 4, "eggFrom": "fridge", "boiling_C": 100,
    "timeToBoil_s": 480, "cooling": "ice", "afterBoil": "hold",
    "waterLitres": 1.5, "eggCount": 2
  },
  "level": 0.22,
  "recommended_s": 399, "nudge_s": -6, "pulled_s": 412, "cooled_s": 180,
  "yolk": -1, "white": null,
  "probe": null,
  "lang": "en", "register": "modern", "units": "metric"
}
```

- `yolk` and `white` are each an answer or `null`. `null` means the question was
  on screen and the cook moved on; a record with both `null` is still a record,
  because the cook, the recommendation and the actual pull time are data too.
- `lang`, `register` and `units` record what the cook READ, because an answer
  is a word and words differ: "soft" may not sit where *weich* does, and "Unset"
  in the English of 1750 may not be answered like "Runny". `LANGUAGE.md` §5-6.

- `massFrom` (scale / girth / width / class) sets the egg-level noise: a size
  class is a 10 g bucket, worth about +-24 s, which is twice the width of "just
  right".
- `pulled_s` is when the cook actually said the egg came out, not when the alarm
  went. The alarm being ignored for forty seconds is the commonest way a cook
  differs from the recommendation, and the app already knows both times.
- `recommended_s` and `prior` make the policy that produced the cook part of the
  record, so a later fit knows why the data lies where it does.
- A day, not a timestamp. A boiling point, not an altitude or a place.

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

- heavy-tailed (Student-t) cook and kitchen effects, so a biased cluster is
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

## 9. The fit

- **Offline, in Python** (NumPyro or Stan), outside `src/core/` and its
  no-dependency rule. HMC over the 2-4 global parameters and the hyperpriors,
  cook and kitchen effects marginalised or fitted by Laplace once there are too
  many to sample.
- **An emulator, not the solver**, in the likelihood: the dose grid is already
  one, in two dimensions. It needs the time-scale, size, start temperature,
  cooling and start mode, and gradients.
- **It publishes one small file**, `fixtures/population.json`: global posterior
  means and covariance, and the hyperpriors for cook and kitchen effects. Both
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
   E2 starts from the prior plus E1's log, and the base goes.
7. **The loss ratio is 3.** A runny white counts as three times as bad as a
   yolk one step too firm (§8). It is a constant for now, and a per-cook
   slider only if someone asks for one.
8. **The odds are always on screen, and brief**: *"7/10 eggs hit the mark"*.
   "Hit the mark" means the posterior predictive probability that the white is
   not runny AND the yolk would be answered "just right". It is rounded to
   tenths, because more precision than that is not there.
9. **"Still learning" goes when the 80% interval on the cook time narrows
   below about +-15 s**, which is about the width of "just right". If that
   proves fiddly to compute or to make stable, fall back to a fixed number of
   eggs. The owner's view is that cooks will barely notice the difference, so
   the threshold is preferred but not worth a fight.

