# PLAN.md — build state for Actual Egg Timer

Resumable working notes. Updated **in the same commit** as the work it describes.
For the science, see `README.md`. This file is for whoever picks the build back up.

**Status: web app v1 complete; the iOS app now carries the whole model too.**
27/27 tests, 27/27 validation checks and 18 Swift conformance tests pass. The web
app was driven end to end in Chromium, including the DONE screen and the feedback
path; the iOS app was driven end to end in the simulator, including the Live
Activity (see the verification records). Remaining work is calibration against
real eggs (see "Calibrating against your own eggs" in README.md) and porting the
calibration to Swift.

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
- [x] `test/core.test.ts` (21 tests, all pass) + `tools/validate.ts` (15/15 checks)
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

### Phase D — the iOS app (solo) — DONE except calibration

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
  cooling: Cooling; waterLitres; eggCount; eggMass_kg;
  afterBoil?: HeatAfterBoil;   // omitted means 'hold'
}
rampTemperature(t_s, timeToBoil_s, ambient_C, boiling_C): number
dipMagnitude(setup): number                     // C the water drops when eggs go in
panTimeConstant(timeToBoil_s): number           // s, from the ramp shape
standingTemperature(elapsedSinceOff_s, from_C, ambient_C, timeToBoil_s): number
bathTemperature(setup, t_s): number             // the in-water schedule, t = 0 at egg-in
coolingTemperature(setup, elapsedSincePull_s, waterAtPull_C, meanAtPull_C, tauAirScale): number
initialSurfaceTemperature(setup): number

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

## Verification record (v1)

- `npm test` — 21/21 pass
- `npm run validate` — 15/15 checks pass, all targets reproduced
- Browser (Chromium, 390x844 phone viewport): no console or page errors; full
  cold-start flow IDLE -> HEATING -> COOKING verified; the boil button relabels
  to "Full rolling boil" in HEATING; `aria-live` announcements fire.

Calibration verified in-browser: feeding back "too soft" four times walks the
suggestion 7.73 -> 9.69 min (correct direction), posterior spread narrows
10.3% -> 6.0%, and the particle set round-trips through localStorage (~34 KB).

The DONE screen and the feedback path were confirmed in the browser by
overriding `Date.now` to run 30 minutes fast (the machine is a pure function of
it): COOKING -> PULL -> COOLING -> DONE within three ticks, the readout stays on
the eaten egg, "Too soft" moves the next suggestion 7:44 -> 8:21 and the posterior
round-trips through localStorage. The mute toggle (a persisted setting, in the
readout so it is reachable in every phase) was checked the same way: a whole
fast-forwarded cook created zero oscillator nodes.

Two things that look like bugs and are not:
1. **"Runny" is greyed out on a cold start.** Correct. The egg sits in the water
   through the whole ramp, so the white takes more dose and the softest reachable
   level is 0.030, not 0.000. A hot start does reach fully runny. This is the
   doneness constraint working.
2. **The action bar appears to overlap the start-mode selector in a full-page
   screenshot.** Artifact of `fullPage` compositing a `position: fixed` bar.
   `main` carries 148px bottom padding and the control clicks fine.

## Debt pass (September 2026)

What was cleaned up, so nobody re-introduces it:

- `protocol.ts` had one six-argument `surfaceTemperature` covering both the
  in-water and the cooling schedule, called with dummy values for the phase
  that did not apply. It is now `bathTemperature(setup, t)` and
  `coolingTemperature(setup, ...)`, and `simulate` picks one by phase.
- The standing solver ran up to three separate scans and reported a
  `hardestLevel` that was only a lower bound when the target was reachable. It
  now samples both doses once over the horizon and answers every question from
  that curve.
- The bisection returned the bracket midpoint, which sat a hair below the
  target about half the time, so a held boil reported `whiteSets: false` at
  random and the app showed the standing-method refusal text for a cold start.
- Feedback on a hot start with the heat off built the calibration grid with
  `timeToBoil_s = 0`, i.e. a pan that never cools. The app now has one
  `timeToBoil_s()` that the solver, the machine and the calibration all read.
- Input bounds lived in the markup, in `readInputs` and in `loadSettings`;
  they are one `LIMITS` table now, applied to the elements at boot. The 4 °C
  and 20 °C presets and the 58 °C bath are likewise rendered into their labels.
- Dead state removed: `boiledAt_ms`, `isRunning`, `clearCalibration`,
  `solvedBoil_s`, and the `recompute` branch for mid-cook input changes that
  the stylesheet makes impossible.

---

## Handoff — 17 September 2026

Where this stands, and what the next person (or the next context window) needs
that is not obvious from the code.

### Done and verified

- **The web app is live** at <https://actualeggtimer.netlify.app>. Netlify
  builds it from `netlify.toml` on push; nothing is configured in a web form.
  `og:` tags carry absolute URLs at that domain, so a domain change is a commit.
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

1. **Calibrate against real eggs.** Both apps now learn, and neither has been
   fed a single real egg. The standing thermocouple experiment in README §11.3
   would settle `TAU_AIR` and `RAMP_R` in an afternoon each and beat every
   published source found; failing that, cooking a dozen eggs and answering
   honestly is the cheapest experiment available and the one the app was built
   to make worthwhile.
2. **Run it on a real phone.** Signing is done and verified: the Time Sensitive
   Notifications capability is registered against the App ID, and a device build
   signs with the entitlement present in the binary (see `ios/README.md`
   §Signing for how to re-check). Nobody has yet cooked an actual egg with it.
3. **A calibration reset in the WEB app.** iOS has one now; the web app is the
   one still requiring you to clear site storage (README §11.5).
4. **The web app could stop shipping its own dose grid build on the main
   thread.** iOS runs it detached; the web version blocks for ~2 s behind a
   `setTimeout(30)` so the "learning" note paints first.

Considered and NOT queued: a watchOS target. A paired watch already rings,
because iOS forwards notifications to the wrist whenever the phone is locked —
which is the situation this app is for. A real watch app would only add the
phone-unlocked case, and its cost is a second UI to keep in sync, not the
target. `EggTimerCore` already compiles for watchOS unchanged, so this stays
cheap to revisit.

### Things that cost an hour to find out

- **The Xcode project is generated.** `cd ios && xcodegen`. It is gitignored,
  and so is `ios/Widget/Info.plist`. Do not look for either in the history.
  `ios/project.yml` is the source of truth and fits on a screen.
- **The Team ID is the certificate's `OU`, not the number in its name.**
  `Apple Development: someone@example.com (7RNTX96N3A)` shows the certificate
  ID in the parentheses; `DEVELOPMENT_TEAM` wants the `OU` field, which is a
  different ten-character string. Read it off a provisioning profile
  (`security cms -D -i x.mobileprovision`, then `TeamIdentifier`) rather than
  off the identity list, where it is not shown at all.
- **`INFOPLIST_KEY_*` build settings cannot express a nested dictionary.**
  `INFOPLIST_KEY_NSExtensionPointIdentifier` is accepted and then silently
  dropped, and the widget extension builds, embeds, and is simply never
  recognised as a widget. An extension needs a real `Info.plist`.
- **An app extension whose version does not match its host app is refused at
  install time.** Both read `$(MARKETING_VERSION)`.
- **ActivityKit's `Activity` is a non-Sendable class with off-actor methods**, so
  Swift 6 will not let a `@MainActor` object hold one and await on it. Ask the
  system what is running instead of keeping the handle.
- **`@Observable` creates no dependency on a property the view never reads.** A
  counter bumped by a ticker to force a redraw does nothing at all. Countdowns
  are `TimelineView`'s job. This bug sat on screen for a whole release because
  the only cook anyone had watched was watched from the Lock Screen.
- **A foreground notification shows nothing by default** — no banner, no sound,
  not even a Lock Screen entry. It needs
  `UNUserNotificationCenterDelegate.willPresent`.
- **Interleaving a settings load with a settings save clobbers the load.**
  Restoring one property fired a `didSet` that wrote the whole object back while
  the rest were still at their defaults, so every setting but the first reverted
  on the next launch. Suppress saving while loading.
- **SwiftUI `Slider` ignores synthetic drags** from the simulator control tools —
  `swipe` and a slow sampled `touch_path` both do nothing. Taps land fine
  (buttons, steppers, segmented controls, system alerts). To exercise a
  slider-dependent path, write the value into the app's `UserDefaults` plist in
  the simulator container and relaunch; an incremental build is two seconds.
- **`sudo xcode-select -s ...` was a red herring.** When the simulator
  integration reports "Xcode is installed but not selected" while
  `xcode-select -p` already prints the right path, the fix is restarting the
  desktop app, not the command.
- **More than one agent may be committing in this working tree.** Stage
  explicitly rather than `git add -A`, or you will sweep up someone else's
  half-finished edit and put your name on it.
- **Fixtures are generated from the TypeScript and never regenerated to make
  the Swift pass.** If that rule is broken once, the reference implementation
  silently becomes whatever the port happens to do, and the conformance suite
  becomes decoration.

---

## Verification record (iOS, September 2026)

Driven in the iPhone 17 simulator on iOS 27, against numbers computed from
`src/core/` in Node for the same inputs:

| scenario | app | TypeScript |
|---|---|---|
| 62.3 g, fridge, ice bath, jammy | 7:21, 65 / 81 °C | 441.3 s, 64.8 / 80.6 °C |
| same at 400 m | 7:31, boils at 98.7 °C | 450.9 s, 98.7 °C |
| room egg, cold start, 8 min boil | 10:20, 2:20 after boil | 620.45 s |
| room egg, counter cooling, jammy | refused, snaps to fudgy | `reachable: false`, softest 0.608 |
| heat off, 2 L | start button dead | `whiteSets: false` |

Also confirmed on screen: the heating phase and its "Full rolling boil" button;
the countdown ticking down to the pull; COOKING -> PULL -> DONE, with the
cooling step correctly skipped for a counter rest; the alarm's wall-clock time
matching the deadline, and its banner appearing with the app in the FOREGROUND;
the Live Activity in the Dynamic Island and on the Lock Screen; settings
surviving a relaunch; and a cook in progress surviving being killed and
reinstalled mid-cook.

Three bugs were found by watching rather than by reading, and all three were
invisible to the way the app had been checked before:

1. **The on-screen countdown never moved.** `@Observable` records no dependency
   on a property the view does not read, so the ticker's counter did nothing.
   The previous verification watched a backgrounded cook, where the only clock
   on screen was the system's.
2. **The alarm was silent with the app open.** iOS delivers a foreground
   notification to the app and shows nothing at all unless the delegate says
   otherwise. The previous verification had the app backgrounded.
3. **Every setting but the first reverted on relaunch**, because restoring one
   property fired a save of all of them while the rest were still at defaults.

### Calibration, verified against the reference

One real cook driven to the end in the simulator, then "Too soft", with the same
scenario computed independently in Node beforehand:

| | app | TypeScript |
|---|---|---|
| suggested, uncalibrated | 4:07 | 247.2 s |
| weighted mean alpha after one "too soft" | 1.567630e-7 | 1.5676e-7 |
| suggested, after | 4:29 | 269.1 s |
| reported spread | ±11% | 10.8% |

The posterior round-trips through `UserDefaults` at 39.8 kB for 1000 particles,
survives a reinstall, and "Forget what it learned" clears the key and returns
the suggestion to 4:07 - which is the literature value, exactly as it should be,
because the prior's mean IS the literature value.
