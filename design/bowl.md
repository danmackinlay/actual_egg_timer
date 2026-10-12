# Cooling in a bowl of still water — the study and a recommendation

The owner's brother asked for a fourth way to cool the eggs: out of the pan
into a bowl of water from the tap, and left there. Not running, not iced,
not the air. The owner asked whether the lowest-variance version of that
can be modelled acceptably: a bowl of water, the eggs put in and left, with
the egg count, the water's volume and the water's starting temperature as
inputs, the temperature defaulting to the room.

It can. The numbers are from `studies/bowl.ts` (run it with
`node tools/build.mjs studies && node dist/studies/bowl.js`; about ten
seconds). Every case is a 68 g egg (the EU Large, `DEFAULT_EGG_MASS_KG`) from
the fridge into boiling water at 100 °C, held, aiming at jammy (slider 0.41),
unless it says otherwise. A cold start was run too (§2.4), and it agrees.

---

## 1. The model

**The bowl** is a well-mixed lumped mass of water. It gains exactly what the
eggs lose: N times one egg's heat capacity times the fall in the egg's own
mean temperature since the pull, which the modal state already gives
(`meanTemperature`). Its temperature is fed to the egg's surface every step,
so the drive is a smooth curve and never steps (invariant 7): the egg goes
from the boiling water into the bowl over `TAU_PLUNGE`, as it goes into ice.
The bowl also exchanges heat with the room, through a free surface and a
wall of about 0.09 m² at 2 L and 15 W/m²K (a time constant of 1.7 hours),
and may add its own heat capacity (a ceramic bowl, up to 1000 J/K).

**The other bound on mixing.** The eggs sit on the bottom, and their plumes
carry the warmed water to the top, so the water around them may stay colder
than the bowl's mean for the first minutes (a "filling box"). The study runs
that bound too: eggs that only ever see the water as it started. That is
exactly the running-water model at the bowl's temperature. The truth lies
between the two, and §2.3 prints both.

**The surface.** Core clamps the egg's surface to the water for ice and
running water (Dirichlet, blended over `TAU_PLUNGE`). The study runs that,
and also Newton's law at the shell (`robinSurface`, the counter's boundary)
with h from free convection about a sphere in water: Churchill (1983), as
Incropera et al., *Fundamentals of Heat and Mass Transfer*, give it,
`Nu = 2 + 0.589 Ra^(1/4) / [1 + (0.469/Pr)^(9/16)]^(4/9)`, with water's
properties at the film temperature (Incropera Table A.6), the equal-volume
sphere's diameter, and the shell and membranes in series (3200 W/m²K, the
figure `H_EFF` is built on). Churchill's correlation is fitted in part to
Amato & Tien (1972), heated spheres in water. Stirring is Whitaker's forced
convection about a sphere, also in Incropera.

**Checks.** The study's loop reproduces `simulate` exactly for ice, running
water and the air. `robinSurface` reproduces the closed-form Robin series
(roots of `1 − μ cot μ = Bi`) for a sphere dropped from 80 °C into 20 °C to
0.03 °C at the centre and mean at Bi 10, 20 and 30, the bowl's range; test
17a checks it only at the counter's Bi 0.6.

---

## 2. What the study found

### 2.1 How fast heat leaves the egg

| shell | free convection, water side | with the shell in series | stirred at 0.1 m/s |
|---|---|---|---|
| 90 °C | 1047 W/m²K | 789 | 1085 |
| 70 °C | 894 | 698 | 1042 |
| 50 °C | 717 | 586 | 989 |
| 35 °C | 555 | 473 | 943 |
| 25 °C | 397 | 353 | 908 |

Over the first two minutes in a 20 °C bowl the mean is 481 W/m²K: a Biot
number near 20. That is close to the only measurement of h on intact eggs,
Denys et al. (2003), 490 W/m²K at the shell in a gently circulated bath.
So the surface is nearly clamped, but not quite.

The eggs' own plumes are what free convection is; they need no extra term.
Their crowding (eggs touching, stacked, on the bowl's floor) can only lower
h, and stirring raises it, so h is swept from half to twice Churchill's.

### 2.2 The bowl beside the methods the app has

Two eggs, 2 L of water at 20 °C:

| cooling | jammy cook | softest | peak yolk | to the peak | mean to 40 °C |
|---|---|---|---|---|---|
| ice bath (core, clamped) | 464.0 s | 0.00 | 64.72 °C | 3:03 | 1:47 |
| running water at 15 °C (core) | 455.5 s | 0.01 | 64.52 | 3:15 | 2:43 |
| running water at 20 °C | 451.5 s | 0.03 | 64.42 | 3:21 | 3:20 |
| **bowl, clamped** | **450.5 s** | **0.04** | 64.39 | 3:22 | 3:39 |
| bowl, free convection | 434.5 s | 0.09 | 64.21 | 3:44 | 5:00 |
| air (core) | unreachable | 0.52 | — | 8:29 | 34:20 |

"Softest" is the softest yolk with the white set, as a slider position;
"mean to 40 °C" is this study's "cool enough to handle", from the pull.

The bowl, modelled as core models ice and running water, is running water
at the bowl's temperature to within a second at this ratio. Soft (0.22)
stays within reach everywhere tried (§2.5).

### 2.3 The largest unknown is the surface, and the ice bath has it too

| base bowl, against itself | jammy cook | peak at a fixed cook | carryover dose |
|---|---|---|---|
| clamped, not free | +16.0 s | −1.22 °C | −0.30 decades |
| h × 0.5 | −11.0 s | +0.81 | +0.20 |
| h × 2 | +7.0 s | −0.51 | −0.13 |
| stirred at 0.1 m/s | +7.0 s | −0.50 | −0.13 |
| still (filling box), not mixed | +1.0 s | −0.04 | −0.02 |
| bowl's own heat capacity, 1000 J/K | 0.0 s | 0.00 | 0.00 |
| room exchange × 0 or × 3 | 0.0 s | 0.00 | 0.00 |

(A decade of yolk dose is 0.22 of the slider.)

The surface treatment is worth 16 s and 1.2 °C, and **the ice bath carries
the same unknown**: ice water is still water too, and run under the same
free-convection boundary it moves −17.0 s and +1.20 °C (h × 0.5: −27.5 s,
+1.92 °C). Core clamps the ice bath and running water; the time-scale
`alpha`, which each cook's answers move, has absorbed whatever that clamp
costs. So the bowl should be clamped the same way. Modelling the bowl alone
with a free surface would make it differ from running water at the same
temperature by 16 s for a reason that is not the bowl.

Whether core should move every water cooling to a free surface is a separate
question, which this note raises (§6) and does not answer.

Mixing, the bowl's own heat capacity and the room cost a second or less at
2 eggs in 2 L. Room exchange is negligible: over the few minutes that
matter, a 1.7-hour time constant moves the water by tenths of a degree.

### 2.4 One input at a time

Clamped surface; the cook for jammy against the base bowl (2 eggs, 2 L,
20 °C), or for the egg count and size against the ice bath with the same
pan and egg.

| input | jammy cook | peak at that cook |
|---|---|---|
| water 0.5 / 1 / 1.5 / 3 / 4 L | −3.0 / −1.0 / 0.0 / +0.5 / +0.5 s | 64.30–64.42 °C |
| water at 8 / 12 / 15 / 25 °C | +9.0 / +6.5 / +4.0 / −4.5 s | 64.61 / 64.56 / 64.48 / 64.29 |
| room at 15 or 30 °C, water at 20 °C | 0.0 s | unchanged |
| 1 / 2 / 4 / 6 / 8 / 12 eggs, against ice | −12.5 / −13.5 / −14.0 / −15.0 / −16.5 / −18.0 s | |
| 50 / 60 / 75 g eggs, against ice | −10.5 / −12.0 / −14.5 s | |
| cold start, 8-minute boil, against ice | −13.0 s | |

- **The water's temperature** moves the cook about 0.8 s per degree: 13.5 s
  from 8 to 25 °C. Running water's unknown mains temperature, 5 to 25 °C
  against the 15 °C core assumes, is −8.5 to +6.5 s.
- **The volume** hardly moves the cook at all at two eggs (3.5 s from 0.5
  to 4 L). It moves the time to handle (§2.5).
- **The egg count** adds 5.5 s from 1 to 12 eggs in 2 L, beyond what the
  pan's dip already costs.
- **The room** reaches the cook only as the water's default temperature.
  Through the bowl's exchange it is worth nothing (0.0 s, and 7 s of time to
  handle across 15–30 °C).
- **The egg's size** acts as it does in ice: the bowl's offset grows from
  10.5 s at 50 g to 14.5 s at 75 g, because a bigger egg carries more heat
  into the water.

### 2.5 Eggs against water: the ratio decides the handling, not the yolk

What the warming alone does to the jammy cook: a bowl that warms against
one that never does (running water at 20 °C), clamped, in seconds.

| L \ eggs | 1 | 2 | 3 | 4 | 6 | 8 | 12 |
|---|---|---|---|---|---|---|---|
| 0.50 | −2.0 | −4.0 | −6.5 | −8.5 | −13.0 | −18.5 | −31.0 |
| 0.75 | −1.5 | −2.5 | −4.5 | −5.5 | −8.5 | −11.5 | −18.5 |
| 1.00 | −1.0 | −2.0 | −3.5 | −4.5 | −6.0 | −8.5 | −13.0 |
| 1.50 | −0.5 | −1.0 | −2.0 | −3.0 | −4.0 | −5.5 | −8.5 |
| 2.00 | −0.5 | −1.0 | −1.5 | −2.0 | −3.0 | −4.0 | −6.0 |
| 3.00 | −0.5 | −0.5 | −1.0 | −1.5 | −2.0 | −2.5 | −4.0 |
| 4.00 | 0.0 | −0.5 | −1.0 | −1.0 | −1.5 | −2.0 | −3.0 |

The softest yolk moves up by 0.001 to 0.161 of the slider over the same
grid, from 0.04 at the base, so soft (0.22) is never lost as modelled.

The time from the pull until the egg's mean is 40 °C, free surface (the
physical one; clamped is about a minute shorter at low ratios):

| L \ eggs | 1 | 2 | 3 | 4 | 6 | 8 | 12 |
|---|---|---|---|---|---|---|---|
| 0.50 | 5:24 | 6:29 | 8:08 | 10:55 | 25:29 | 46:46 | over 60 min |
| 0.75 | 5:08 | 5:44 | 6:30 | 7:32 | 11:07 | 20:12 | 52:33 |
| 1.00 | 5:00 | 5:25 | 5:55 | 6:31 | 8:14 | 11:15 | 30:03 |
| 1.50 | 4:53 | 5:08 | 5:25 | 5:44 | 6:32 | 7:35 | 11:26 |
| 2.00 | 4:50 | 5:00 | 5:12 | 5:25 | 5:55 | 6:32 | 8:18 |
| 3.00 | 4:46 | 4:53 | 5:00 | 5:08 | 5:25 | 5:45 | 6:33 |
| 4.00 | 4:44 | 4:49 | 4:55 | 5:00 | 5:12 | 5:25 | 5:56 |

and where the bowl settles, from the egg's mean of 83.1 °C at the jammy
pull, as egg mass over water mass rises:

| egg mass / water mass | 0.14 | 0.27 | 0.41 | 0.55 | 0.82 | 1.09 | 1.64 |
|---|---|---|---|---|---|---|---|
| the bowl settles at | 26.0 °C | 30.9 | 35.0 | 38.6 | 44.3 | 48.7 | 55.1 |
| warming's own effect on the cook | −2.0 s | −4.0 to −4.5 | −6.0 to −6.5 | −8.5 | −13.0 | −18.5 | −31.0 |

So the eggs-to-water ratio dominates, and a small bowl with many eggs is the
hard case, but not for the yolk. Even 12 eggs in half a litre (more eggs than
water, which would not cover them) is 31 s from a bowl that never warms. What
the ratio decides is whether the eggs can be handled: past about 0.5 kg of egg
per kilogram of water the bowl settles near 40 °C, and the eggs are too hot
to peel for ten minutes or more; past about 0.8, never, until the water is
changed. Over 0.5 the warming's own effect (8.5 s and up) is also the size of
the mixing bound's, so the model's own unknown grows past running water's.

**A safe ratio: 0.5 kg of egg per kilogram of water**, about seven large
eggs a litre, three in half a litre, fourteen in a 2 L mixing bowl. Below it
the warming is worth under 9 s, the eggs are cool enough to handle within
about ten minutes, and the bowl stays below 39 °C.

### 2.6 Given the inputs, is the bowl as sure as the air?

Much surer, and about as sure as running water. What is left unknown once
the cook has said the volume, the count and the water's temperature, against
the same spans for the methods the app has:

| | jammy cook | peak yolk | carryover dose |
|---|---|---|---|
| **bowl**: mixing, its own heat capacity, the room, the volume ±25%, the water ±2 °C | −2.0 to +6.0 s | −0.31 to +0.14 °C | −0.11 to +0.04 decades |
| bowl: the water 6 °C colder than the room assumed | +4.5 to +6.5 s | −0.28 to −0.39 °C | −0.08 to −0.11 |
| bowl and ice bath alike: the surface, clamped against free | ≈16 s | ≈1.2 °C | ≈0.3 |
| running water: mains at 5 or 25 °C, not 15 | −8.5 to +6.5 s | −0.43 to +0.52 °C | −0.12 to +0.15 |
| **air**: one prior sd of `tauAirScale` | −22.0 to +24.5 s | ±1.4–1.5 °C | ±0.36–0.39 |
| air: two sd | −41.0 to +48.5 s | −3.10 to +2.71 °C | −0.78 to +0.67 |

(The bowl's rows span the four cases in `studies/bowl.ts` §6: 2 eggs in 2 L
at 20 °C, 4 in 1 L, 6 in 1.5 L at 15 °C, 6 in 1 L at 25 °C, each against
itself with a free surface. The air is measured at fudgy, since jammy is out
of its reach.)

The bowl's own unknowns, given its inputs, are under 7 s and 0.4 °C: smaller
than running water's own unknown, which the app does not ask about, and a
quarter of the air's one sd. The shared one, the surface, belongs to every
water cooling equally.

### 2.7 Which inputs earn a question

- **The egg count**, already an input: yes. With the volume it sets the
  ratio, which decides the warning and the handling time; it already sets
  the boiling water's dip.
- **The volume**: yes, but for the ratio, not for the cook. A default of
  2 L ("a mixing bowl") is right for one to six eggs to within 3 s.
- **The water's temperature**: worth asking only lightly. Defaulting it to
  the room when the bowl came from a cold tap 6 °C colder costs 5–6.5 s and
  0.3–0.4 °C, the same as running water's unknown mains. Keep it, as the owner
  chose, but optional, with the room as its default.
- **The room**: not for the bowl. It reaches the cook only as the water's
  default.

### 2.8 Validation

No published measurement of eggs, or of food-sized spheres, cooling in a
bowl of still water was found. What was found:

- Amato & Tien (1972), *Int. J. Heat Mass Transfer* 15, 327–339: heated
  spheres in water, steady free convection, the data under Churchill's
  correlation. It checks h, not the bowl.
- Denys et al. (2003), already in `references.bib`: h on intact eggs in a
  gently circulated bath at 40–60 °C, 490 W/m²K at the shell. It sits inside
  the study's range (§2.1).
- Laurindo et al. (2010), *J. Food Engineering*: h for a sphere at positions
  in an immersion-cooling tank, with and without agitation (the abstract says
  air injection raised it up to eight times). The still-water values were
  not readable here (ScienceDirect blocked the fetch), so nothing is quoted
  from it.
- Shi et al. (2024), *Poultry Science*, PMC11525136: soft-boiled eggs cooled
  six minutes in ice water at 3:1 water to egg by mass. A kitchen ratio, and
  no cooling curve.
- Erdogdu et al. (2007), *J. Food Engineering*: air-impingement cooling of
  boiled eggs, against water immersion as the traditional way. Only the
  abstract was reachable.

None of the sources in `README.md` §11.6 was used.

**The kitchen measurement that would check it**, with one probe thermometer.
Cook one egg for the bowl's jammy time, push the probe through the blunt end
to the middle of the yolk as it goes into 2 L of water at a known
temperature, and read it every minute for 15 minutes, without stirring. Then
stir the water and read it. The study's §8 prints what to expect:

| from the pull | clamped | free | clamped, `alpha` +1 sd | free, `alpha` +1 sd |
|---|---|---|---|---|
| the yolk's peak | 64.4 °C at 3:22 | 65.5 at 3:40 | 68.8 at 2:51 | 69.8 at 3:08 |
| 8 minutes | 48.1 | 52.1 | 46.3 | 50.8 |
| 10 minutes | 41.1 | 45.1 | 39.0 | 43.4 |
| the bowl, stirred, at 15 minutes | 22.7 | 22.6 | 22.8 | 22.7 |

The peak alone cannot tell the surface from the egg's time-scale: they
trade. The reading ten minutes after the pull, against the peak, can. With
peaks a degree apart (the last two columns), a free surface reads 4.4 °C
warmer at 10 minutes than a clamped one, four times a probe's error. The bowl's rise (2.7 °C for two
eggs in 2 L) checks the heat balance, the egg's heat capacity and mass. The
same measurement in an ice bath would settle the ice bath's clamp (§6).

---

## 3. Recommendation

**Build it, with one warning.** Model the bowl as core models ice and
running water: the surface clamped, blended over `TAU_PLUNGE`, onto a water
temperature that rises by the heat balance from the egg's own mean. Ask the
volume (default 2 L) and the water's temperature (optional, defaulting to
the room the model assumes). Above 0.5 kg of egg per kilogram of water,
warn that the eggs will take a long time to cool enough to peel, and
suggest more water. Do not refuse: the time is still within about 30 s of a
bowl that never warms, even at the extreme.

Leave out of core what the study found worth nothing: the room exchange, the
bowl's own heat capacity, stirring and stratification. A cook who stirs gets
a slightly softer yolk, and Help says so.

---

## 4. The smallest design

### 4.1 Core, TypeScript first

- **`protocol.ts`.** `Cooling` gains `'bowl'`. `CookSetup` gains two
  optional fields, present only for a bowl: `bowlLitres` and `bowlWater_C`
  (the water as it went in, the room's when the cook gave none). A new
  export:

  ```ts
  /** The bowl's water, C: what it started at, plus what N eggs have lost
   *  since the pull, over the water's heat capacity (1 kg per litre, as
   *  dipMagnitude has it). */
  export function bowlTemperature(egg: Egg, setup: CookSetup, meanAtPull_C: number, mean_C: number): number
  ```

  `coolingTemperature` gains `meanAtPull_C` and a branch for the bowl that
  is the ice bath's with a moving target:
  `target + (waterAtPull_C − target) * exp(−t/TAU_PLUNGE)`, the target being
  `bowlTemperature(egg, setup, meanAtPull_C, meanTemperature(sphere))`.
  `coolingMedium_C` returns `bowlWater_C` for a bowl (the medium at the
  pull, for the probe's lower bound). Its callers capture the egg's mean at
  the pull beside `waterAtPull_C`: `solve.ts` (`simulate`), `section.ts`
  (`EggSection` gets `meanAtPull_C` back, gone since 3 October because
  nothing read it), and `studies/perturbed.ts`.
- **`constants.ts`.** `BOWL_CROWDED_RATIO = 0.5`, egg mass over water
  mass, with this note's numbers in its comment. `DEFAULT_BOWL_LITRES`
  belongs in `inputs.ts`.
- **`inputs.ts`.** `LIMITS.bowlLitres` (0.5 to 8), `LIMITS.bowlWater_C`
  (1 to 40); `DEFAULTS.bowlLitres = 2`; `bowlCrowded(mass_kg, eggCount,
  bowlLitres)`.
- **`settings.ts`.** `bowlLitres`, and `bowlWater_C: number | null` (null
  for the room); `readSettings` takes `'bowl'`.
- **`running.ts`.** `CookChoices` gains both; the choices reader takes
  `'bowl'`; the pot's setup resolves the water's temperature to the room
  the model assumes (`ambientFor`) when the cook gave none. The counted
  cooling runs to the yolk's peak as in ice (3:22 at the base, against 3:03),
  and `probeMomentFor` needs nothing.
- **`record.ts`** and **`server/eggs.ts`.** The record's setup gains the
  two optional fields and the fourth cooling. An older build drops a record
  it cannot read, so the log's storage key is bumped (`CLAUDE.md`: a format
  may change without a migration before wide deployment).
- **`decide.ts`.** `inputsKey` appends the two numbers for a bowl, so other
  pots' keys and surfaces are unchanged.
- **`wording.ts`.** `refusalKey`, `pulledKey`, the cooling phase's label,
  the sentence's cooling clause, and a warning key for a crowded bowl.
- **`reach.ts`.** Nothing. Like running water, the bowl is within seconds
  of ice, so advising ice over it would be advice that does not help.
- **Swift.** The same in `Protocol.swift`, `Solve.swift`, `Section.swift`,
  `Running.swift`, `Record.swift`, `Settings.swift`, `Inputs.swift`,
  `Wording.swift`, and every `switch` over `Cooling` in `EggTimerApp`,
  `EggTimerCopy` and `EggTimerShared`.
- **Fixtures** (`npm run fixtures`, never by hand): `core.json` (bowl cooks
  at the base, a crowded bowl and a cold bowl, and `bowlTemperature`),
  `inputs.json`, `settings.json`, `record.json`, `decide.json` (the key),
  `wording.json`, and one bowl cook in `running.json` and `step.json`.
- **Tests.** The bowl gains exactly what the eggs lose; the surface never
  steps at the pull; a bowl of 10⁶ L is running water at its temperature to
  the second; `bowlCrowded` at its boundary. `tools/validate.ts`: two eggs in
  2 L at 20 °C within 2 s of running water at 20 °C.

### 4.2 The inputs, and where they appear

- **The sentence.** The cooling clause names the bowl and its water: "then
  into a bowl with 2 L of water", and "… of water at 12 °C" when the cook
  gave a temperature. The egg clause takes the count (§4.4).
- **The cooling panel** gains Bowl of water as a fourth choice. Under it,
  shown only for the bowl, two rows with a − and a +: Water in the bowl (the
  water unit's grid, as Water in Settings) and Water temperature (blank shows
  the room assumed, greyed, as Room temperature does). Both have an (i).
- **The warning** for a crowded bowl goes in the slot for longer text, as a
  refusal does.
- **Settings.** Nothing new. The bowl's water belongs to the cook, not the
  kitchen, so it is in the panel.

Four segments may not fit a 390 px phone at the segment's 17-character
budget ("Running water" and "Bowl of water" are 13 each). If they do not,
the cooling panel becomes a list, as the egg's size menu is. Either is the
owner's call, judged on a phone.

### 4.3 The words

New keys, drafted to `LANGUAGE.md` §3, each within its surface's budget. The
1750 twins lag (`DECISIONS.md` 103), and the queue lists them. No en-US
overlay is needed: none of these says "pan".

| key | surface | English |
|---|---|---|
| `controls.cooling.bowl` | segment | Bowl of water |
| `setup.cooling.bowl` | clause | then into a bowl with {water} of water |
| `setup.cooling.bowlAt` | clause | then into a bowl with {water} of water at {temp} |
| `controls.bowl` | label | Water in the bowl |
| `controls.bowl.more` | more | How much water is in the bowl before the eggs go in. Use enough to cover them. The eggs warm the water, so with more water they’re cool enough to peel sooner. |
| `controls.bowlWater` | label | Water temperature |
| `controls.bowlWater.more` | more | Optional. Leave it blank and I’ll assume the water is at room temperature, {room}. Water straight from a cold tap can be a few degrees colder, which changes the time by a few seconds. |
| `readout.phase.coolingBowl` | label | Leave them in the bowl |
| `action.pulled.bowl` | button | In the bowl of water |
| `alarm.pull.bodyBowl` | notification.body | Straight into the bowl of water, or the yolk keeps cooking. |
| `refusal.bowl` | body | A bowl of water doesn’t cool the egg fast enough to stop the yolk cooking. Softest possible: {limit}. For a slightly softer yolk, use an ice bath. |
| `warning.bowlCrowded` | body | Use more water for this many eggs. In {water} they’ll take a long time to cool enough to peel. |
| `help.unsure.bowl` | help | In a bowl, I assume the water is still and the eggs lie side by side on the bottom. If you stir the water the yolk comes out a little softer, and if you stack the eggs a little firmer. |

Keys rewritten, so they rejoin the queue:

| key | English |
|---|---|
| `controls.cooling.more` | The yolk keeps cooking for a few minutes after the eggs come out of the water. An ice bath stops it fastest, so it allows the softest yolks. Cold running water and a bowl of water are nearly as good. In the air the egg cools so slowly that the softest yolks aren’t possible. |
| `help.reliable.cooling.title` | Ice, running water, a bowl or air |
| `help.reliable.cooling` | An ice bath gives the most reliable result. Cold running water and a bowl of water are nearly as good. Air cooling is mediocre. |
| `controls.eggsInPan.more` | The more cold eggs you put in, the more they cool the water, so they take longer to cook. In a bowl of water, more eggs warm the bowl more. On a cold-water start I don’t need this for the cooking, because the time-to-boiling already accounts for it. |
| `setup.egg` (with a `count`) | one: “one {mass} egg”; other: “{count} × {mass} eggs” |

`refusal.bowl` is reached only at the runny end, below 0.04 to 0.20 of the
slider as the ratio rises (§2.5), as `refusal.tap` is below 0.01 to 0.05.

### 4.4 The egg count and the room, more prominent

- **The egg count** moves from Settings into the sentence and the egg's
  panel: "2 × 68 g eggs from the fridge, …", with a − and a + beside the
  size. The numbers back this: the count sets the boiling water's dip (with
  the volume, 22 s across 0.75–4 L and one to eight eggs, README §9) and now
  the bowl's ratio. And how many eggs
  go in is decided at each cook, not once per kitchen (`UI.md` §2).
- **The room** earns little from the bowl: it reaches the cook only as the
  water's default, at under a second a degree. The smallest change that
  still makes it more prominent: the bowl's water-temperature row shows the
  room assumed, greyed, as its default; and Settings shows Room temperature
  without the probe, since a cook with no probe can still read a room
  thermometer or know the kitchen is cold. `DECISIONS.md` 79 tied it to the
  probe, so that is the owner's call. On the numbers alone, I would leave
  the room where it is.

### 4.5 What both apps change

- **Web**: `src/ui/idle.ts` (the sentence, the cooling panel and its two
  rows, the egg clause with the count), `src/ui/model.ts` (choices to pot),
  the Settings page (the count row goes; the room row, if moved), the
  readout and pull button through the core's wording keys, and an e2e
  scenario with a bowl.
- **iOS**: `ios/App/SetupSentence.swift` (the same panel, rows and clause),
  `PhaseActions.swift` (the pull button), `HelpView.swift`, the Settings
  form, the Live Activity line and the pull alarm (`EggTimerShared`,
  `EggTimerCopy`), and a launch argument for a bowl in `Screenshots.swift`.
  Run `xcodegen` only if files are added; `npm run ios:build` either way.

---

## 5. Not done here

The study keeps the core's single egg for N identical eggs, and its clamp
and its free surface are both on the equal-volume sphere. Eggs of mixed
sizes in one bowl, a bowl topped up or changed partway, and ice added to a
bowl are not modelled; the last is the ice bath.

---

## 6. For the owner

1. **Build it, with the warning at 0.5 kg of egg per kilogram of water?**
   Or refuse past some ratio instead (nothing in the yolk's numbers asks
   for a refusal), or not at all.
2. **The water's temperature**: an optional row defaulting to the room, as
   chosen, or not asked, as running water's is not? The difference it makes
   is the same size as running water's unknown mains.
3. **The room in Settings without the probe** (§4.4), against
   `DECISIONS.md` 79.
4. **Four segments, or a list**, for the cooling panel, on a phone.
5. **The surface in all water cooling.** The ice bath, run under
   free convection, moves 17 s and 1.2 °C against its clamp, the same as
   the bowl. The time-scale learned from answers has absorbed it so far;
   the probe measurement in §2.8 would say whether core should move the ice
   bath, running water and the bowl together to Newton's law at the shell.
   A separate study, not part of this feature.
