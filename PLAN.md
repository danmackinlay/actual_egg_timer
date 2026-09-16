# PLAN.md — build state for `actual_egg_timer`

Resumable working notes. Updated **in the same commit** as the work it describes.
For the science, see `README.md`. This file is for whoever picks the build back up.

**Next step:** Phase B — tests, UI, README (three parallel agents against the frozen API below).

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

### Phase B — parallel (three subagents, no shared files)
- [ ] `test/core.test.ts` + `tools/validate.ts`
- [ ] `index.html` + `src/ui/*` (state machine, clock, store)
- [ ] `README.md` — the science write-up

### Phase C — calibration (solo)
- [ ] `src/core/doseGrid.ts`  — cached log10 dose, bilinear interpolation
- [ ] `src/core/infer.ts`     — particle filter, ordinal likelihood
- [ ] integrate, full verification, push

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
type StartMode = 'cold' | 'hot'
type Cooling   = 'ice' | 'tap' | 'counter'
interface CookSetup {
  startMode: StartMode; eggStart_C; ambient_C; boiling_C;
  timeToBoil_s;            // cold start only
  cooling: Cooling; waterLitres; eggCount; eggMass_kg;
}
rampTemperature(t_s, timeToBoil_s, ambient_C, boiling_C): number
dipMagnitude(setup): number                     // C the water drops when eggs go in

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
}
solveCookTime(egg, setup, params, doneness): Solution

// sphere.ts (mostly internal; exported for tests)
createSphere / stepSphere / temperatureAt / centreTemperature / meanTemperature
seriesTheta(x, Fo) / erfcTheta(x, Fo) / oneTermTheta(x, Fo) / biotNumber / erfc

// kinetics.ts
createDose(z_K, tref_C) / accumulateDose(d, T_C, dt_s) / holdTimeForDose
zFromActivationEnergy(ea_Jmol, T_K): number
```

**UI contract.** `solveCookTime` returns `reachable: false` when the requested
yolk doneness cannot be had without leaving the white raw. In that case
`softestLevel` is the softest slider position that *is* achievable — the UI
greys out everything below it. This is what makes counter-resting refuse soft
eggs rather than lie about them.

---

## Calibration constants and provenance

| constant | value | units | source / confidence |
|---|---|---|---|
| `TAU_REF` | 3354 | s | R²/α for a 57 g egg. **The single calibration knob.** ∝ M^(2/3). Medium confidence — reproduces kitchen practice. |
| `ALPHA` | 1.70e−7 | m²/s | albumen at cooking temperature. Low-T literature values (1.36e−7) are inconsistent with reported α; water's k rises ~13% by 100 °C. |
| `YOLK_RADIUS_FRAC` | 0.693 | — | yolk = 33% of volume. High confidence: three independent routes agree. |
| `Z_YOLK` / `TREF_YOLK` | 4.65 / 63 | K / °C | from Eₐ ≈ 470 kJ/mol (Vega & Mercadé-Prieto 2011). |
| `Z_WHITE` / `TREF_WHITE` | 5.2 / 80 | K / °C | ovalbumin, Eₐ ≈ 460 kJ/mol. |
| `H_EFF` | 850 | W/m²K | convection + shell + membranes in series. Estimated, not measured. |
| `RAMP_R` | 3.0 | — | hob overshoot ratio; 1/r = fraction of full power to hold a boil. |
| `TAU_AIR` | 2030 | s | lumped cooling time constant in still air. **Least-verified constant in the model.** |
| `TAU_PLUNGE` | 4 | s | surface equilibration on entering a cooling bath. Physical (finite Bi, finite handling time) *and* a necessary numerical regulariser — see below. |
| `WHITE_DOSE_TARGET` | 0.05 | min-eq @80C | calibrated so the shortest white-setting cook is ~5.9 min for a fridge-cold large egg, peak inner white ~75 C: set but tender. |
| `YOLK_DOSE_RUNNY` / `_HARD` | 0.05 / 2000 | min-eq @63C | slider endpoints. Log-interpolating dose is equivalent to linearly interpolating peak yolk temperature, so the slider spans ~56–77 C evenly. |

⚠️ The egress proxy blocked direct fetches of primary sources, so these are re-derived
and cross-validated rather than transcribed. Three independent checks passed:
Williams' published 0.451 prefactor, his published 4.5-min worked example, and two
independent series solutions agreeing to 5 decimal places.

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
