# PLAN.md — build state for `actual_egg_timer`

Resumable working notes. Updated **in the same commit** as the work it describes.
For the science, see `README.md`. This file is for whoever picks the build back up.

**Next step:** Phase A — implement `src/core/`.

---

## Goal

A static web app that computes egg cooking time from physics — transient conduction
in a sphere plus Arrhenius denaturation kinetics — times the boil itself, and counts
down. Zero runtime dependencies. The core is written for a near-mechanical Swift port.

## Phase checklist

### Phase A — core physics (solo)
- [x] scaffolding: `package.json`, `tsconfig.json`, `PLAN.md`
- [ ] `src/core/constants.ts`
- [ ] `src/core/thermo.ts`      — altitude/pressure → boiling point
- [ ] `src/core/geometry.ts`    — egg dimensions → effective radius
- [ ] `src/core/sphere.ts`      — modal/Duhamel solver (the heart)
- [ ] `src/core/kinetics.ts`    — Arrhenius thermal dose
- [ ] `src/core/protocol.ts`    — water temperature schedule
- [ ] `src/core/solve.ts`       — cook time for a doneness target
- [ ] freeze API into this file, commit

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

_(filled in at the end of Phase A — do not write UI or tests against anything else)_

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
| `T_AIR_TAU` | 2030 | s | lumped cooling time constant in still air. **Least-verified constant in the model.** |

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

Carryover — identical 7.4-min cook, varying only the cooling step:

| cooling | peak yolk |
|---|---|
| ice bath | 64.9 °C |
| cold tap | 65.4 °C |
| counter | 85.3 °C (hard-boiled) |

⇒ soft doneness is **unreachable** with counter cooling; the slider must constrain to it.

## Invariants — do not break these

1. **`src/core/` has zero dependencies** and no DOM, `Date`, I/O or `async`. Pure numerics.
2. **Swift-portable subset**: plain interfaces + top-level functions; explicit `for` loops;
   no classes, closures over mutable state, `null`/`undefined`, or `map`/`reduce` in hot paths.
3. **SI units internally.** Convert only at the UI boundary.
4. **Sum 40 series terms**, never one — one-term truncation is 8.4% low at realistic Fo.
5. **z ≈ 4.65 K for eggs**, never the food-engineering default of 33.1 K (7× too shallow).
6. The boil button says **"Full rolling boil"** — tapping at first bubbles under-measures 15–25%.
