# PLAN.md — build state for Actual Egg Timer

Resumable working notes. Updated **in the same commit** as the work it describes.
For the science, see `README.md`. For what was verified and what it cost to find
out, see `LOGBOOK.md`. This file is for whoever picks the build back up.

**Status: both apps complete and learning. The PHYSICS is now the open part.**
70 TypeScript tests, 27/27 validation checks and 39 Swift conformance tests pass.
The web app and the iOS app carry the same model, the same refusals and the same
particle filter; the Swift port is complete apart from the sous-vide joke. The
iOS app runs signed on a real phone, with a time-sensitive alarm and a Live
Activity, and has cooked a real egg. What is left is not code: it is the two
measurements in README §11.3 and a run of real eggs to calibrate against.

Counts in this paragraph are the only ones in the file. Three other lines used
to restate them and all three had gone stale, which is how a status line ends up
disagreeing with itself by six tests and twelve checks. If you want a number,
run `npm test`.

**The conformance line sits above the physics.** `src/core/policy.ts` and
`EggTimerCore/Policy.swift` carry what the apps DECIDE - snapping, the refusal
verdict, texture bands, the calibration grid's geometry, the phase timeline, the
bounds and the defaults - held together by `fixtures/policy.json`. Anything both
apps have to agree on goes there, or it drifts: everything in it was
hand-duplicated until September 2026, and by then the two apps had different
defaults, different preset temperatures and a boil-memory lookup that could
answer differently on each.

---

## Goal

A static web app that computes egg cooking time from physics — transient conduction
in a sphere plus Arrhenius denaturation kinetics — times the boil itself, and counts
down. Zero runtime dependencies. The core is written for a near-mechanical Swift port.

## Phase checklist

### Phase A — core physics (solo) — DONE
- [x] scaffolding: `package.json`, `tsconfig.json`, `PLAN.md`
- [x] `src/core/constants.ts`
- [x] `src/core/thermo.ts`      — altitude/pressure → boiling point
- [x] `src/core/geometry.ts`    — egg dimensions → effective radius
- [x] `src/core/sphere.ts`      — modal/Duhamel solver (the heart)
- [x] `src/core/kinetics.ts`    — Arrhenius thermal dose
- [x] `src/core/protocol.ts`    — water temperature schedule
- [x] `src/core/solve.ts`       — cook time for a doneness target
- [x] freeze API into this file, commit

### Phase B — parallel (three subagents, no shared files) — DONE
- [x] `test/core.test.ts` + `tools/validate.ts` (counts in the status line above)
- [x] `index.html`, `styles.css`, `src/ui/*` (app, machine, clock, store, main)
- [x] `README.md` — the science write-up, 652 lines

### Phase C — calibration (solo) — DONE
- [x] `src/core/doseGrid.ts`  — cached log10 dose, bilinear interpolation
- [x] `src/core/infer.ts`     — particle filter, ordinal likelihood
- [x] `src/ui/calibration.ts` — posterior lifecycle, persistence, feedback wiring
- [x] integrate, full verification

Measured: grid build 1.76 s (21x36), interpolation error 1.7% in dose, posterior
update 0.1-1.6 ms. Injected alpha = 1.535e-7 with taste offset 0.20 recovered in
**3 eggs**; converged cook time 8.52 min vs true optimum 8.29 min (14 s error);
relative sd plateaus at 3.1%, the ordinal-feedback identifiability floor.
Recovered alpha is 4.5% off in isolation because alpha and the taste offset are
confounded at fixed protocol - the combination is identified, the parts are not.
That is the documented behaviour, not a defect.

Also added: early termination in `simulate()` once the egg is past peak and the
dose rate is 1e-6 of peak. Cut simulate 2.80 -> 1.87 ms with identical results.

### Phase D — the iOS app (solo) — DONE

- [x] `ios/EggTimerCore` — the physics in Swift, held to generated fixtures
- [x] `ios/App/Cook.swift` — the phase machine, absolute dates, survives relaunch
- [x] `ios/App/Alarm.swift` — local notifications, `.timeSensitive`, foreground
- [x] `ios/App/Kitchen.swift` — every input, the refusals, the boil memory
- [x] `ios/Widget/` — the Live Activity: Lock Screen and Dynamic Island
- [x] `ios/EggTimerCore/DoseGrid.swift`, `Infer.swift` — the calibration
- [x] `ios/App/Calibration.swift` — "how was it?", and the app learns

The SwiftUI layer takes the BEHAVIOUR of `src/ui/machine.ts` and leaves its
mechanism. `clock.ts` in particular exists to fight the backgrounding problem
that a local notification solves properly, and has no counterpart here.

---

## Frozen core API

`CookSetup.eggMass_kg` was removed in September 2026: it duplicated
`Egg.mass_kg`, and since every function that took a setup also took an egg,
callers had to keep the two in step by hand. `tools/validate.ts` had to remember
an override in its size sweep or it would silently have modelled four different
eggs against one fixed water dip. No physics number moved - the fixtures are
byte-identical apart from the missing field.

Import from `dist/src/core/*.js` (or `src/core/*.ts` in TS). **Do not write UI or
tests against anything not listed here.**

```ts
// geometry.ts
interface Egg { radius_m; minorDiameter_m; mass_kg; volume_m3 }
eggFromMinorDiameter(minorDiameter_m: number): Egg
eggFromMass(mass_kg: number): Egg
diffusionTime(egg: Egg, alpha_m2s: number): number
SIZE_CLASSES: { label: string; mass_kg: number }[]

// thermo.ts
pressureAtAltitude(altitude_m): number          // Pa
boilingPointAtPressure(pressure_Pa): number     // C
boilingPointAtAltitude(altitude_m): number      // C
boilingPointApprox(altitude_m): number          // C, the 100 - h/300 one-liner
saltBoilingElevation(gramsPerLitre): number     // C

// protocol.ts
type StartMode    = 'cold' | 'hot'
type Cooling      = 'ice' | 'tap' | 'counter'
type HeatAfterBoil = 'hold' | 'off'
interface CookSetup {
  startMode: StartMode; eggStart_C; ambient_C; boiling_C;
  timeToBoil_s;            // ramp length on a cold start; pan time constant with the heat off, on either start
  cooling: Cooling; waterLitres; eggCount;     // the POT. The egg's mass is on the Egg.
  afterBoil?: HeatAfterBoil;   // omitted means 'hold'
}
rampTemperature(t_s, timeToBoil_s, ambient_C, boiling_C): number
dipMagnitude(egg, setup): number                // C the water drops when eggs go in
panTimeConstant(timeToBoil_s): number           // s, from the ramp shape
standingTemperature(elapsedSinceOff_s, from_C, ambient_C, timeToBoil_s): number
bathTemperature(egg, setup, t_s): number        // the in-water schedule, t = 0 at egg-in
coolingTemperature(setup, elapsedSincePull_s, waterAtPull_C, meanAtPull_C, tauAirScale): number
initialSurfaceTemperature(egg, setup): number

// solve.ts  <- the main entry points
interface ModelParams { alpha_m2s; tauAirScale }
DEFAULT_PARAMS: ModelParams
interface Doneness { level; yolkDose_min; whiteDose_min }
donenessFromSlider(level: number): Doneness     // level in [0,1]
sliderFromYolkDose(dose: number): number
DONENESS_ANCHORS: { label; level; approxPeakYolk_C }[]
interface CookResult {
  cookTime_s; peakYolk_C; peakYolkTime_s; yolkAtPull_C;
  yolkDose_min; whiteDose_min; peakWhite_C;
}
simulate(egg, setup, params, cookTime_s): CookResult
interface Solution {
  result: CookResult; reachable: boolean;
  minCookTime_s: number; softestLevel: number;
  hardestLevel: number;    // 1 while the water is held at the boil
  whiteSets: boolean;      // false only with the heat off, when the pan never sets the white
}
solveCookTime(egg, setup, params, doneness): Solution

// sousvide.ts
SOUS_VIDE_BATH_C
equilibrationTime(radius_m, alpha_m2s): number
sousVideEstimate(radius_m, alpha_m2s, bath_C, yolkDose_min, whiteDose_min): SousVideEstimate

// doseGrid.ts / infer.ts  (calibration; see Phase C)
buildDoseGrid(...) / lookupLogYolkDose / lookupLogWhiteDose / cookTimeForLogYolkDose
type Feedback = -1 | 0 | 1
createPrior(count, seed) / updatePosterior(post, grid, cookTime_s, logTarget, feedback)
posteriorParams / posteriorMeanOffset / posteriorAlphaRelSd / predictCookTime

// sphere.ts (mostly internal; exported for tests)
createSphere / stepSphere / temperatureAt / centreTemperature / meanTemperature
seriesTheta(x, Fo) / erfcTheta(x, Fo) / oneTermTheta(x, Fo) / biotNumber / erfc

// kinetics.ts
createDose(z_K, tref_C) / accumulateDose(d, T_C, dt_s) / holdTimeForDose
zFromActivationEnergy(ea_Jmol, T_K): number
```

**UI contract.** `solveCookTime` returns `reachable: false` when the requested
yolk doneness cannot be had. Two ways: too soft for the white (`softestLevel` is
the softest position that *is* achievable, and the UI stripes out everything
below it — this is what makes counter-resting refuse soft eggs rather than lie
about them), or, with the heat off, harder than the pan can manage
(`hardestLevel` is the ceiling, and the UI stripes out everything above it). If
`whiteSets` is false nothing on the slider is reachable at all. Every cook time
the solver returns is the *first* one known to meet its dose target, to within a
second — the search returns the upper end of its final bracket, never the
midpoint, so a dose compared against its own target at the answer always passes.

---

## Calibration constants and provenance

| constant | value | units | source / confidence |
|---|---|---|---|
| `TAU_REF` | 3354 | s | R²/α for a 57 g egg. **The single calibration knob.** ∝ M^(2/3). Medium confidence — reproduces kitchen practice. |
| `ALPHA` | 1.70e−7 | m²/s | albumen at cooking temperature. Low-T literature values (1.36e−7) are inconsistent with reported α; water's k rises ~13% by 100 °C. |
| `YOLK_RADIUS_FRAC` | 0.693 | — | yolk = 33% of volume. High confidence: three independent routes agree. |
| `Z_YOLK` / `TREF_YOLK` | 4.65 / 63 | K / °C | from Eₐ ≈ 470 kJ/mol (Vega & Mercadé-Prieto 2011). Since checked at source: Eₐ = 469 ± 13 kJ/mol, measured 54-70 °C. |
| `Z_WHITE` / `TREF_WHITE` | ~~5.2~~ **4.97** / 80 | K / °C | ovalbumin. Planned with Eₐ ≈ 460 kJ/mol; Weijers et al. (2003) report ≈ 480, so the constant was corrected. |
| `H_EFF` | 850 | W/m²K | convection + shell + membranes in series. Estimated, not measured. |
| `RAMP_R` | 3.0 | — | hob overshoot ratio; 1/r = fraction of full power to hold a boil. |
| `TAU_AIR` | 2030 | s | lumped cooling time constant in still air. **Least-verified constant in the model.** |
| `TAU_PLUNGE` | 4 | s | surface equilibration on entering a cooling bath. Physical (finite Bi, finite handling time) *and* a necessary numerical regulariser — see below. |
| `WHITE_DOSE_TARGET` | 0.05 | min-eq @80C | calibrated so the shortest white-setting cook is ~5.9 min for a fridge-cold large egg, peak inner white ~75 C: set but tender. |
| `YOLK_DOSE_RUNNY` / `_HARD` | 0.05 / 2000 | min-eq @63C | slider endpoints. Log-interpolating dose is equivalent to linearly interpolating peak yolk temperature, so the slider spans ~56–77 C evenly. |

⚠️ **Superseded — kept as a record of the planning phase.** At planning time the
primary sources were not fetched, so these were re-derived and cross-validated rather
than transcribed. Three independent checks passed: Williams' published 0.451 prefactor,
his published 4.5-min worked example, and two independent series solutions agreeing to
5 decimal places.

The sources have since been read at first hand — most of them are freely available —
and the derivations held up, with one constant corrected (`Z_WHITE`) and one known to be
high (`H_EFF`). See `references.bib`, README §10 for what each source says, and §11 for
what is still open. The model is now also checked against two published measurements it
did not choose: see README §7.

## Validation targets

The model must reproduce these (verified during planning, large egg unless stated):

| scenario | expected |
|---|---|
| 57 g, 4 °C, T_yolk 63 °C via Williams' closed form | 4.53 min (he published ~4.5) |
| fridge 4 °C, sea level, jammy, ice bath | 7.4 min |
| room 21 °C, sea level, jammy, ice bath | 6.3 min |
| fridge, 2000 m, jammy | 9.2 min |
| eigenfunction vs erfc series at Fo = 0.0688, x = 0.693 | both 0.41094 |
| one-term truncation error | under-predicts 8.4% |
| `T_b(h)` vs `100 − h/300`, 0–5000 m | within 0.03 °C |

Cold start, jammy, ice bath — **minutes after boiling depends on hob power**:

| time-to-boil | total | after boil |
|---|---|---|
| 4 min | 9.2 | 5.2 |
| 8 min | 11.2 | 3.2 |
| 12 min | 13.2 | 1.2 |

Carryover — identical 7.4-min cook, varying only the cooling step. Yolk centre is
48.5 °C at pull in all three cases (same cook ⇒ same state), and they diverge after:

| cooling | peak yolk | rise after pull |
|---|---|---|
| ice bath | 65.0 °C | +16.5 |
| cold tap | 65.6 °C | +17.0 |
| counter | 76.3 °C | +27.8 |

⇒ soft doneness is **unreachable** with counter cooling; the slider constrains to it.

⚠️ **Correction to the planning estimate.** Planning predicted 64.9 / 65.4 / 85.3 °C.
The counter figure was wrong: that model relaxed the surface from the *water*
temperature, when a lumped egg in air relaxes from its own *volume-average*
temperature. Corrected in `coolingTemperature`. The effect is real and still
decisive (jammy vs fully set) but smaller than first computed.

## Invariants — do not break these

1. **`src/core/` has zero dependencies** and no DOM, `Date`, I/O or `async`. Pure numerics.
2. **Swift-portable subset**: plain interfaces + top-level functions; explicit `for` loops;
   no classes, closures over mutable state, `null`/`undefined`, or `map`/`reduce` in hot paths.
3. **SI units internally.** Convert only at the UI boundary.
4. **Sum 40 series terms**, never one — one-term truncation is 8.4% low at realistic Fo.
5. **z ≈ 4.65 K for eggs**, never the food-engineering default of 33.1 K (7× too shallow).
6. The boil button says **"Full rolling boil"** — tapping at first bubbles under-measures 15–25%.
7. **Never step the surface temperature discontinuously.** A truncated modal basis
   cannot represent a fresh discontinuity at the centre, where modes are weighted
   by `n`; an instantaneous 100 -> 2 C drop made the yolk centre read 12.5 C when
   the true value was 49.3 C. All medium changes blend through `TAU_PLUNGE`.


---

## Handoff — 17 September 2026

Where this stands, and what the next person (or the next context window) needs
that is not obvious from the code.

### Done and verified

- **The web app is live** at <https://actualeggtimer.netlify.app>. Netlify
  builds it from `netlify.toml` on push; nothing is configured in a web form.
  `og:` tags carry absolute URLs at that domain, so a domain change is a commit.
  `vercel.json` is also checked in and is NOT deployed - it is a second host's
  two settings, kept so the site can move without an archaeology session. README
  §10 explains why its Node pin differs. If it is ever deleted, delete that
  paragraph with it.
- **Every constant has been checked against the primary literature.** `Z_WHITE`
  was corrected; `H_EFF` is known high and recorded as an open problem (§11.2).
  `references.bib` has the sources with notes on what each is good for.
- **The Swift core is complete except the calibration** and conformant against
  the TypeScript: pure functions to 1e-12, 13 whole cooks to the same, measured
  disagreement 7e-15. `npm run conformance`.
- **The iOS app carries the whole model.** Every input the solver has, the
  reachability refusals, the cold start with its boil-timing step, and the
  standing method. Driven end to end in the simulator against the TypeScript's
  own numbers.
- **The alarm fires, at `.timeSensitive`,** and now presents even with the app
  in the foreground. The entitlement is signed and verified in a device build,
  not merely requested in a plist.
- **The Live Activity works** on the Lock Screen and in the Dynamic Island.

### Next, in order

Nothing on this list is a missing feature. Both apps do everything the model can
do; what is missing is contact with reality.

1. **Cook real eggs and answer honestly.** The first real cook happened on
   18 September and found three interface bugs and zero physics problems, which
   is the expected ratio and the reason to keep going. The filter needs about
   three eggs to stop moving, and it needs you to VARY something — egg size or
   cooling method — or `alpha` and your taste stay confounded (README §11.5).
2. **The two measurements nobody appears to have made** (README §11.3). A
   thermocouple through the blunt end and a datalogger settles `TAU_AIR` in an
   afternoon; a pot, a thermocouple and forty minutes settles `RAMP_R` and
   `TAU_STANDING_SCALE` together. Both would beat every published source found,
   and `TAU_AIR` drives the app's most opinionated behaviour — refusing soft
   eggs to anyone resting them on the counter.
3. **The web app builds its dose grid on the main thread**, blocking ~2 s behind
   a `setTimeout(30)` so the "learning" note paints first. iOS runs it detached.
4. **Derive the cooling countdown** from the solver's `peakYolkTime_s` instead of
   asserting three minutes (README §11.5). It changes times on screen, so it
   wants a real egg behind it rather than a refactor.
5. **Decide whether the white gets its own question** (README §11.5, issue #1).
   Not a refactor: it changes what the filter learns, and it may break the
   `alpha`/taste confound from a single protocol. The white surface is already
   built and discarded, so the modelling work is smaller than it looks; the open
   part is the UX — always ask, or ask only when the white is near its boundary.
6. **Show `predictCookTime`'s interval** somewhere, or stop claiming in its
   docstring that it is what makes calibration legible (README §11.5). The grid
   is already built and in hand immediately after a feedback fold, so the
   cheapest honest version costs nothing.

Checked on 18 September and NOT a problem, so nobody re-checks: the web app's
`reset()` already re-solves, and its solve is synchronous, so neither of that
day's iOS bugs has a twin there. The web app also already defaults to a cold
start — iOS was the outlier, and now matches.

Considered and NOT queued: a watchOS target. A paired watch already rings,
because iOS forwards notifications to the wrist whenever the phone is locked —
which is the situation this app is for. A real watch app would only add the
phone-unlocked case, and its cost is a second UI to keep in sync, not the
target. `EggTimerCore` already compiles for watchOS unchanged, so this stays
cheap to revisit.


---

## Where the rest went

Verification records, the debt passes, the things that cost an hour to find out,
and the RNG statistics are in `LOGBOOK.md`. This file is state; that one is
record. See its header for why.
