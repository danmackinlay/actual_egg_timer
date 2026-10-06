# Does the egg's shape matter? A numerical study

The app conducts heat through an equal-volume **sphere** (radius 0.5477 B for
L/B = 1.35). Real eggs are ovoid. This study solves the same physics in the
real shape and asks what the sphere costs, in seconds of cook time. It
changes nothing in the app.

**Short answer: the owner's suspicion holds — the sphere is fine.** Its error
is a near-constant 2–3% that the calibrated `ALPHA_DEFAULT` already absorbs.
What weighing cannot see, egg-to-egg shape, costs about ±2 s per egg (1 sd),
and a ruler cannot recover it. Weighing is the most accurate input by a factor
of 4–8.

## The answers

All seconds are for a 62 g egg cooked jammy (437 s, 7:17, from the fridge),
hot start, ice bath, unless the row says otherwise. Every row of the tables
below holds for 50 g and 75 g as well, in proportion. Near jammy, one second
of cook time is roughly 0.1 °C of peak yolk.

**(a) The equal-volume sphere's systematic error.** It is **slow**: the
real-shaped egg reaches the same yolk dose sooner.

| real egg, L/B 1.35, same mass | cook time vs the app's sphere |
|---|---|
| prolate spheroid (symmetric; k_v = π/6) | −8.7 s (−2.0%) |
| ovoid at the app's own k_v = 0.51 (one end blunter) | −13.9 s (−3.2%) |

The same shift holds at 50, 62 and 75 g, from 4 or 20 °C, and for soft or hard
(−1.9 to −3.4% throughout). It is a near-constant fraction of the time, which
is exactly what `alpha` absorbs, since only R²/α is identifiable. It takes a
2–3% higher effective α. The time for the centre to reach a set temperature
(a pure clamp, no carryover) is more shape-sensitive, at −3.3% (spheroid) and
−5.0% (ovoid): the app's dose time includes carryover, which dilutes the effect.

**It explains none of the 4.6% gap to Buay's thermocouple trace. It runs the
other way.** Buay's egg as the prolate spheroid he describes, at
`ALPHA_DEFAULT`, reaches 85 °C in **699.9 s**, against the sphere's 715.6 s and
the 750 s he measured. With the shape corrected, the model is 6.7% fast, not
4.6%. The α that fits his trace falls from 1.622e-7 (sphere) to **1.586e-7**
(spheroid). The sphere's shape error makes the model slow; the Dirichlet
clamp makes it fast. Whatever makes it fast against Buay, it is not shape.
Buay's own radius convention (3V/A, surface-to-volume) reproduces the
spheroid to 0.2% (701.1 s), so his fitted 1.6e-7 is already shape-correct.
The app's 1.70e-7 is 6% above it, and shape, far from explaining that, is
worth 2.3% in the other direction.

**(b) Egg-to-egg error at fixed mass (what weighing cannot see).**

| what varies at fixed mass | effect on the cook |
|---|---|
| L/B 1.25 → 1.45 (shape index 80 → 69) | 8–9 s end to end: −10.3 → −18.4 s (ovoid), −4.7 → −13.6 s (spheroid). About 41–44 s per unit of L/B |
| the same, as a spread | **±2.0–2.2 s (1 sd)**, taking the owner's 69–80 shape-index range as ±2 sd (sd of L/B ≈ 0.05) |
| fullness and asymmetry (k_v 0.500 → 0.520 at L/B 1.35) | 3.9 s per 0.01 of k_v. The population spread of k_v is not known here; ±0.005–0.01 would add ±2–4 s |
| the yolk off the egg's centroid along the axis, 2.4 / 4.8 / 7.1 mm | always **shorter**, by 1–3 / 5–10 / 10–22 s. The centroid is the slowest point, to within 0.03–0.07 R_eq |

All told, shape gives each egg about ±3–5 s (1 sd), or about 1% of the cook
and 0.3–0.5 °C of peak yolk. For scale, the α prior's 11.9% sd is about ±50 s
of this cook, ten times as much. The yolk's position is the largest shape term,
and no measurement a cook can make sees it.

**(c) Would mass plus width help?** Only with calipers, and only partly. With
the mass known, B gives L/B = V/(k_v B³), so δ(L/B) = 3·(L/B)·δB/B:

| B read to | L/B known to | compare: population sd of L/B |
|---|---|---|
| ±1 mm (ruler) | ±0.093 | 0.05 |
| ±0.5 mm (careful ruler) | ±0.047 | 0.05 |
| ±0.1 mm (calipers) | ±0.009 | 0.05 |

A ruler measures L/B no better than the population already spreads it, so a
correction built on it would add as much error (±2–4 s) as it removed.
Calipers would remove the L/B term, about 2 s sd, and leave the k_v and yolk
terms, so the total falls from about ±3–5 s to about ±3–4 s. That is not worth
a second measurement.

**(d) Measurement error, propagated (62 g, jammy, from 4 °C).**

| input | reading error | cook-time error | plus shape, unseen by that input |
|---|---|---|---|
| kitchen scale | ±0.5 g | **±2.2 s** | ±2 s (L/B at fixed mass) |
| ruler on B (the app's minor-diameter path) | ±0.5 mm | ±9.5 s | ±8 s (L/B at fixed B: 32 s end to end) |
| ruler on B | ±1 mm | **±19 s** | ±8 s |

The ruler path's shape term is four times the scale path's. At a fixed B the
egg's mass still varies by ±8% across L/B 1.25–1.45 (57–68 g at B = 43.4 mm),
and the path has to guess it.

**(e) Recommendation.**

- **Build no shape correction.** The systematic part (−2 to −3%) is a constant
  fraction that `alpha` already carries. Moving it into the geometry would only
  shift α by the same amount, a wash, and it does not close the Buay gap but
  widens it. The egg-to-egg part (±3–5 s) is ten times smaller than α's own
  uncertainty, below what a cook can taste, and its largest piece (the yolk's
  position) cannot be measured in a kitchen.
- **"Weighing is most accurate" is true**, by 4–8× in seconds: ±2.2 s from the
  scale plus about ±2 s of unseen shape, against ±9.5–19 s from a ruler plus
  about ±8 s of unseen shape.
- If α is ever refit against a thermocouple trace (with the Robin boundary of
  README §11.4), use Buay's 3V/A radius or the true shape for that one fit, so
  the fitted α is a material property. The cook-time model can keep the
  equal-volume sphere and let α absorb the 2–3%, as it does now.
- One side finding, for the white rather than the yolk: the app reads the
  innermost white at one radius (0.693 R). In a real egg that layer is
  thinnest at the yolk's equator and thickest at its poles. The white there
  sets 70–120 s sooner at the equator and 30–70 s later at the poles than the
  sphere says, and the spread across L/B (blunt pole: +38 → +68 s) is larger
  than the yolk's. `WHITE_DOSE_TARGET` was calibrated on the sphere, so this is
  not a timing error as it stands. It does mean the white floor, and with it
  "the softest this egg can be", is the shape-sensitive end of the model.

## Method

- **Physics, as the app has it.** Constant α = `ALPHA_DEFAULT`; the surface
  clamped at the water temperature (Dirichlet). `sphere.ts` never reads
  `H_EFF`, so a Robin boundary would be a different model, not this app's. The
  yolk dose is taken at the yolk centre with `Z_YOLK` and `TREF_YOLK_C`; the
  white's at the yolk boundary with `Z_WHITE` and `TREF_WHITE_C`. Every
  constant is read from `src/core` at run time.
- **Shapes.** Hügelschäffer's ovoid, y = (B/2)·√((L² − 4x²)/(L² + 8wx + 4w²))
  (as used by Narushin et al.), renormalised so that B is the maximum
  breadth. Its asymmetry w is chosen to give the app's
  k_v = V/(L B²) = 0.51 (w/L = 0.178). The prolate spheroid is the w = 0,
  k_v = π/6 = 0.524 case, so the two bracket the asymmetry. L/B runs
  1.25–1.45 (shape index 80–69), with k_v 0.500–0.520 at L/B 1.35 as a
  sensitivity. The yolk sits at the egg's centroid. A displaced yolk is the
  off-centre table.
- **Solver.** Linear finite elements in the axisymmetric (z, r) half-plane,
  weighted by r, with exact element integrals. The mesh is polar about the
  centroid and fitted to the outline: 120 radial × 144 angular cells, 17,401
  nodes, with boundary nodes on the curve. Time stepping is Crank–Nicolson at
  ΔFo = 1e-4 (about 0.3 s), after four backward-Euler half-steps to damp the
  step's high modes. Each shape is solved once, for the unit step response at
  an equal-volume radius of 1. The problem is linear and the boundary a clamp,
  so every size is the same response on a stretched clock (t = Fo·R_eq²/α),
  and every surface schedule is a Duhamel convolution of it.
- **The cook.** As `solveCookTime` runs it, sample for sample: a hot start at
  100 °C; the water's dip for 2 eggs in 2 L (the app's defaults), recovering
  over `TAU_DIP_RECOVERY`; the pull blended into a 2 °C ice bath over
  `TAU_PLUNGE`; 900 s of carryover; the yolk dose summed every `DT_SIM`. The
  pull time is bisected to 0.01 s for the study, and to the app's 1 s
  (returning the upper end) for the check against the app.
- **Comparators.** The app's equal-volume sphere, evaluated with its own
  40-mode series; a sphere of radius B/2; and a sphere of radius 3V/A (Buay's
  surface-to-volume radius).
- **Checks** (tables below). The FE sphere's centre response against the exact
  series agrees to 6e-5, or 0.01% in time. The FE sphere's cook times against
  the series sphere's agree to 0.16 s. This script's protocol, dose and
  bisection, fed the app's series, reproduce the app's own `solveCookTime` to
  0.000 s in all 18 cases and their white floors. Halving the mesh moves no
  shape difference by more than 0.4 s.
- **Not done.** No Robin boundary (the app has none), no separate yolk and
  white diffusivities, no air cell, and no yolk displaced off the axis. Each
  would move the absolute times. The comparison is like for like, so none of
  them is expected to change the 2–3% offset by more than a fraction of itself.

## Running it

```
npm run build                      # only for the check against the app
python3 tools/shape-study/shape_study.py --app-core dist/src/core   # ~2.5 min
python3 tools/shape-study/shape_study.py --quick                    # coarse mesh, ~20 s
python3 tools/shape-study/report.py      # prints the tables below
```

It needs numpy and scipy, and no npm packages. It writes `results.json`
(`results-quick.json` with `--quick`). `report.py` reads both; the quick run
feeds the mesh-convergence line. Neither is committed (the owner, 7 October
2026): each is made again by the commands above, and the tables below are
what they gave.

## Tables

Produced by `report.py`. Signs are the true shape minus the app's sphere
unless a header says otherwise; negative means the real egg needs less time.

### Verification

| check | value |
|---|---|
| FE mesh (radial x angular), nodes | 120 x 144, 17401 nodes, dFo = 0.0001 |
| centre step response, max abs error vs exact (images) series | 5.9e-05 (of a 0-1 response) |
| yolk boundary x = 0.693, max abs error vs 400-term series (Fo > 0.005) | 3.5e-04 |
| Fo for the centre to go 0.50 of the way: exact / FE | 0.13879 / 0.13878 (-0.004%) |
| Fo for the centre to go 0.75 of the way: exact / FE | 0.21049 / 0.21048 (-0.008%) |
| Fo for the centre to go 0.90 of the way: exact / FE | 0.30352 / 0.30349 (-0.009%) |
| app 40-mode series vs exact, Fo > 0.01 | 4e-16 |

This script's protocol, dose and bisection, fed the app's own 40-mode series, against the app's `solveCookTime` (compiled `src/core`, `app_reference.mjs`): 18 cases (50/62/75 g, 4/20 C, soft/jammy/hard, plus the white floor), worst difference 0.000 s.

| g | start C | level | app cook s | this script s | app white floor s | this script s |
|---|---|---|---|---|---|---|
| 62 | 4 | 0.22 | 394.96 | 394.96 | 346.01 | 346.01 |
| 62 | 4 | 0.41 | 437.78 | 437.78 | 346.01 | 346.01 |
| 62 | 4 | 1 | 602.10 | 602.10 | 346.01 | 346.01 |
| 62 | 20 | 0.22 | 332.03 | 332.03 | 290.07 | 290.07 |
| 62 | 20 | 0.41 | 374.85 | 374.85 | 290.07 | 290.07 |
| 62 | 20 | 1 | 540.04 | 540.04 | 290.07 | 290.07 |

The FE sphere through the same pipeline against the series sphere: worst cook-time difference 0.16 s over 18 cases.

Mesh convergence: halving the mesh (60 x 72, dFo 0.0002) moves no shape difference in the fixed-mass table by more than 0.38 s.

### Shapes

| shape | L/B | SI | k_v = V/(L B^2) | w/L | centroid from mid-length, %L | R_eq/B | (3V/A)/B | slowest axis point, R_eq |
|---|---|---|---|---|---|---|---|---|
| ovoid | 1.250 | 80.0 | 0.5100 | 0.178 | -7.1 | 0.5339 | 0.5220 | -0.034 |
| ovoid | 1.300 | 76.9 | 0.5100 | 0.178 | -7.1 | 0.5409 | 0.5273 | -0.043 |
| ovoid | 1.350 | 74.1 | 0.5100 | 0.178 | -7.1 | 0.5478 | 0.5322 | -0.053 |
| ovoid | 1.400 | 71.4 | 0.5100 | 0.178 | -7.1 | 0.5545 | 0.5368 | -0.054 |
| ovoid | 1.450 | 69.0 | 0.5100 | 0.178 | -7.1 | 0.5610 | 0.5411 | -0.065 |
| spheroid | 1.250 | 80.0 | 0.5236 | 0.000 | +0.0 | 0.5386 | 0.5340 | +0.000 |
| spheroid | 1.300 | 76.9 | 0.5236 | 0.000 | +0.0 | 0.5457 | 0.5394 | +0.000 |
| spheroid | 1.350 | 74.1 | 0.5236 | 0.000 | -0.0 | 0.5526 | 0.5443 | +0.000 |
| spheroid | 1.400 | 71.4 | 0.5236 | 0.000 | +0.0 | 0.5593 | 0.5489 | +0.000 |
| spheroid | 1.450 | 69.0 | 0.5236 | 0.000 | +0.0 | 0.5659 | 0.5531 | +0.000 |
| ovoid | 1.350 | 74.1 | 0.5000 | 0.233 | -9.1 | 0.5442 | 0.5233 | -0.059 |
| ovoid | 1.350 | 74.1 | 0.5150 | 0.142 | -5.7 | 0.5496 | 0.5367 | -0.045 |
| ovoid | 1.350 | 74.1 | 0.5200 | 0.092 | -3.7 | 0.5513 | 0.5411 | -0.028 |
| spheroid | 1.278 | 78.3 | 0.5236 | 0.000 | +0.0 | 0.5425 | 0.5370 | +0.000 |
| ovoid | 1.278 | 78.3 | 0.5100 | 0.178 | -7.1 | 0.5378 | 0.5250 | -0.043 |

### Fixed mass: cook time, true shape minus the app's equal-volume sphere

**62 g, from 4 C**

| egg | soft | jammy | hard |
|---|---|---|---|
| app sphere | 394.9 s (6:35) | 436.9 s (7:17) | 601.5 s (10:01) |
| ovoid L/B 1.25 | -9.1 s (-2.3%) | -10.3 s (-2.3%) | -15.1 s (-2.5%) |
| ovoid L/B 1.30 | -10.6 s (-2.7%) | -11.9 s (-2.7%) | -17.5 s (-2.9%) |
| ovoid L/B 1.35 | -12.3 s (-3.1%) | -13.9 s (-3.2%) | -20.3 s (-3.4%) |
| ovoid L/B 1.40 | -14.2 s (-3.6%) | -16.0 s (-3.7%) | -23.3 s (-3.9%) |
| ovoid L/B 1.45 | -16.4 s (-4.1%) | -18.4 s (-4.2%) | -26.7 s (-4.4%) |
| spheroid L/B 1.25 | -4.2 s (-1.1%) | -4.7 s (-1.1%) | -7.1 s (-1.2%) |
| spheroid L/B 1.30 | -5.8 s (-1.5%) | -6.6 s (-1.5%) | -9.8 s (-1.6%) |
| spheroid L/B 1.35 | -7.7 s (-1.9%) | -8.7 s (-2.0%) | -12.8 s (-2.1%) |
| spheroid L/B 1.40 | -9.8 s (-2.5%) | -11.0 s (-2.5%) | -16.2 s (-2.7%) |
| spheroid L/B 1.45 | -12.1 s (-3.1%) | -13.6 s (-3.1%) | -19.8 s (-3.3%) |
| ovoid L/B 1.35, k_v 0.500 | -15.9 s (-4.0%) | -17.9 s (-4.1%) | -26.0 s (-4.3%) |
| ovoid L/B 1.35, k_v 0.515 | -10.6 s (-2.7%) | -11.9 s (-2.7%) | -17.5 s (-2.9%) |
| ovoid L/B 1.35, k_v 0.520 | -8.9 s (-2.2%) | -10.0 s (-2.3%) | -14.7 s (-2.5%) |

**62 g, from 20 C**

| egg | soft | jammy | hard |
|---|---|---|---|
| app sphere | 331.6 s (5:32) | 374.1 s (6:14) | 539.6 s (8:59) |
| ovoid L/B 1.25 | -7.3 s (-2.2%) | -8.4 s (-2.2%) | -13.0 s (-2.4%) |
| ovoid L/B 1.30 | -8.5 s (-2.6%) | -9.8 s (-2.6%) | -15.2 s (-2.8%) |
| ovoid L/B 1.35 | -9.9 s (-3.0%) | -11.4 s (-3.0%) | -17.6 s (-3.3%) |
| ovoid L/B 1.40 | -11.5 s (-3.5%) | -13.2 s (-3.5%) | -20.3 s (-3.8%) |
| ovoid L/B 1.45 | -13.3 s (-4.0%) | -15.3 s (-4.1%) | -23.3 s (-4.3%) |
| spheroid L/B 1.25 | -3.3 s (-1.0%) | -3.8 s (-1.0%) | -6.1 s (-1.1%) |
| spheroid L/B 1.30 | -4.7 s (-1.4%) | -5.4 s (-1.4%) | -8.4 s (-1.6%) |
| spheroid L/B 1.35 | -6.2 s (-1.9%) | -7.1 s (-1.9%) | -11.1 s (-2.1%) |
| spheroid L/B 1.40 | -7.9 s (-2.4%) | -9.1 s (-2.4%) | -14.1 s (-2.6%) |
| spheroid L/B 1.45 | -9.8 s (-3.0%) | -11.3 s (-3.0%) | -17.2 s (-3.2%) |
| ovoid L/B 1.35, k_v 0.500 | -12.8 s (-3.9%) | -14.7 s (-3.9%) | -22.6 s (-4.2%) |
| ovoid L/B 1.35, k_v 0.515 | -8.5 s (-2.6%) | -9.8 s (-2.6%) | -15.2 s (-2.8%) |
| ovoid L/B 1.35, k_v 0.520 | -7.2 s (-2.2%) | -8.2 s (-2.2%) | -12.8 s (-2.4%) |

**Jammy, every mass and start**

| egg | app sphere s | ovoid 1.35 | ovoid 1.25 to 1.45 | spheroid 1.35 | spheroid 1.25 to 1.45 |
|---|---|---|---|---|---|
| 50 g, 4 C | 380.7 | -12.1 (-3.2%) | -9.0 to -16.1 | -7.6 (-2.0%) | -4.1 to -11.8 |
| 50 g, 20 C | 326.3 | -10.0 (-3.1%) | -7.3 to -13.4 | -6.2 (-1.9%) | -3.4 to -9.9 |
| 62 g, 4 C | 436.9 | -13.9 (-3.2%) | -10.3 to -18.4 | -8.7 (-2.0%) | -4.7 to -13.6 |
| 62 g, 20 C | 374.1 | -11.4 (-3.0%) | -8.4 to -15.3 | -7.1 (-1.9%) | -3.8 to -11.3 |
| 75 g, 4 C | 493.6 | -15.6 (-3.2%) | -11.6 to -20.7 | -9.8 (-2.0%) | -5.3 to -15.3 |
| 75 g, 20 C | 422.3 | -12.8 (-3.0%) | -9.4 to -17.2 | -8.0 (-1.9%) | -4.3 to -12.7 |

### Comparator spheres, 62 g from 4 C, jammy

| egg | true cook s | equal-volume sphere minus true | radius B/2 minus true | radius 3V/A minus true |
|---|---|---|---|---|
| ovoid 1.25 | 426.7 | +10.3 | -41.0 | -8.1 |
| ovoid 1.35 | 423.1 | +13.9 | -55.7 | -9.4 |
| ovoid 1.45 | 418.5 | +18.4 | -67.4 | -10.6 |
| spheroid 1.25 | 432.2 | +4.7 | -52.9 | -2.3 |
| spheroid 1.35 | 428.3 | +8.7 | -67.0 | -3.7 |
| spheroid 1.45 | 423.4 | +13.6 | -78.1 | -5.0 |

### Centre time to temperature, pure clamp at 100 C (no dip, no pull), true shape vs equal-volume sphere

| 62 g | sphere s | ovoid 1.25 | ovoid 1.30 | ovoid 1.35 | ovoid 1.40 | ovoid 1.45 | spheroid 1.35 |
|---|---|---|---|---|---|---|---|
| 4 C -> 63 C | 552.7 | -3.6% | -4.3% | -5.0% | -5.8% | -6.7% | -3.4% |
| 4 C -> 70 C | 624.6 | -3.6% | -4.2% | -4.9% | -5.7% | -6.5% | -3.3% |
| 4 C -> 85 C | 859.5 | -3.5% | -4.1% | -4.8% | -5.5% | -6.2% | -3.2% |
| 20 C -> 63 C | 489.4 | -3.7% | -4.4% | -5.2% | -6.0% | -6.9% | -3.6% |
| 20 C -> 70 C | 562.2 | -3.6% | -4.3% | -5.0% | -5.8% | -6.6% | -3.4% |
| 20 C -> 85 C | 797.9 | -3.5% | -4.1% | -4.8% | -5.5% | -6.3% | -3.2% |

### Fixed minor diameter (the ruler path, R = 0.5477 B)

**B = 43.4 mm, from 4 C, jammy; the app asks for 436.5 s**

| egg | its mass g | true cook s | true minus app | its equal-volume sphere minus app |
|---|---|---|---|---|
| ovoid 1.25 | 57.3 | 405.8 | -30.8 s (-7.0%) | -21.0 s (-4.8%) |
| ovoid 1.30 | 59.6 | 414.5 | -22.1 s (-5.1%) | -10.4 s (-2.4%) |
| ovoid 1.35 | 61.9 | 422.7 | -13.8 s (-3.2%) | +0.0 s (+0.0%) |
| ovoid 1.40 | 64.2 | 430.4 | -6.1 s (-1.4%) | +10.3 s (+2.4%) |
| ovoid 1.45 | 66.5 | 437.8 | +1.2 s (+0.3%) | +20.4 s (+4.7%) |
| spheroid 1.25 | 58.9 | 418.0 | -18.5 s (-4.2%) | -13.9 s (-3.2%) |
| spheroid 1.30 | 61.2 | 426.8 | -9.7 s (-2.2%) | -3.2 s (-0.7%) |
| spheroid 1.35 | 63.6 | 435.1 | -1.4 s (-0.3%) | +7.4 s (+1.7%) |
| spheroid 1.40 | 65.9 | 443.0 | +6.4 s (+1.5%) | +17.9 s (+4.1%) |
| spheroid 1.45 | 68.3 | 450.3 | +13.8 s (+3.2%) | +28.2 s (+6.5%) |

**B = 43.4 mm, from 20 C, jammy; the app asks for 373.8 s**

| egg | its mass g | true cook s | true minus app | its equal-volume sphere minus app |
|---|---|---|---|---|
| ovoid 1.25 | 57.3 | 347.9 | -25.9 s (-6.9%) | -17.9 s (-4.8%) |
| ovoid 1.30 | 59.6 | 355.4 | -18.4 s (-4.9%) | -8.9 s (-2.4%) |
| ovoid 1.35 | 61.9 | 362.4 | -11.4 s (-3.1%) | +0.0 s (+0.0%) |
| ovoid 1.40 | 64.2 | 369.0 | -4.8 s (-1.3%) | +8.7 s (+2.3%) |
| ovoid 1.45 | 66.5 | 375.2 | +1.4 s (+0.4%) | +17.4 s (+4.6%) |
| spheroid 1.25 | 58.9 | 358.3 | -15.6 s (-4.2%) | -11.9 s (-3.2%) |
| spheroid 1.30 | 61.2 | 365.8 | -8.0 s (-2.1%) | -2.7 s (-0.7%) |
| spheroid 1.35 | 63.6 | 372.9 | -0.9 s (-0.3%) | +6.3 s (+1.7%) |
| spheroid 1.40 | 65.9 | 379.5 | +5.7 s (+1.5%) | +15.2 s (+4.1%) |
| spheroid 1.45 | 68.3 | 385.8 | +12.0 s (+3.2%) | +24.0 s (+6.4%) |

### Measurement error on the app's sphere

| jammy | cook s | mass -/+0.5 g | B -/+0.5 mm | B -/+1 mm |
|---|---|---|---|---|
| 50 g (B 40.4 mm), 4 C | 380.7 | -2.4 / +2.4 | -8.9 / +9.0 | -17.7 / +18.1 |
| 50 g (B 40.4 mm), 20 C | 326.3 | -2.1 / +2.1 | -7.6 / +7.7 | -15.1 / +15.4 |
| 62 g (B 43.4 mm), 4 C | 436.9 | -2.2 / +2.2 | -9.5 / +9.6 | -18.9 / +19.3 |
| 62 g (B 43.4 mm), 20 C | 374.1 | -1.9 / +1.9 | -8.1 / +8.2 | -16.1 / +16.4 |
| 75 g (B 46.3 mm), 4 C | 493.6 | -2.1 / +2.1 | -10.1 / +10.2 | -20.1 / +20.5 |
| 75 g (B 46.3 mm), 20 C | 422.3 | -1.8 / +1.8 | -8.5 / +8.6 | -17.0 / +17.3 |

### Yolk off the centroid (62 g ovoid, 4 C, jammy)

| L/B | centroid cook s | -7.1 mm | -4.8 mm | -2.4 mm | +0.0 mm | +2.4 mm | +4.8 mm | +7.1 mm |
|---|---|---|---|---|---|---|---|---|
| 1.25 | 426.7 | -10.4 | -5.4 | -1.9 | +0.0 | -1.1 | -6.7 | -18.1 |
| 1.35 | 423.1 | -12.3 | -6.2 | -1.8 | +0.0 | -1.8 | -8.2 | -20.1 |
| 1.45 | 418.5 | -12.8 | -6.0 | -1.5 | +0.0 | -2.5 | -9.6 | -21.8 |

### White floor (shortest cook that sets the innermost white), 62 g

**from 4 C; the app's white floor 345.2 s**

| egg | at the yolk's equator | blunt-end pole | pointed-end pole |
|---|---|---|---|
| ovoid 1.25 | -68.5 | +38.2 | +31.4 |
| ovoid 1.35 | -95.2 | +57.6 | +32.0 |
| ovoid 1.45 | -122.3 | +67.7 | +31.1 |
| spheroid 1.25 | -55.9 | +47.2 | +47.0 |
| spheroid 1.35 | -81.7 | +52.0 | +51.8 |
| spheroid 1.45 | -107.8 | +53.4 | +53.3 |

**from 20 C; the app's white floor 289.4 s**

| egg | at the yolk's equator | blunt-end pole | pointed-end pole |
|---|---|---|---|
| ovoid 1.25 | -63.9 | +38.0 | +35.4 |
| ovoid 1.35 | -88.0 | +58.1 | +37.0 |
| ovoid 1.45 | -111.7 | +68.9 | +37.1 |
| spheroid 1.25 | -52.8 | +48.0 | +47.9 |
| spheroid 1.35 | -76.1 | +53.7 | +53.5 |
| spheroid 1.45 | -99.0 | +56.1 | +55.9 |

### Buay et al. (2006)

| model, alpha = 1.70e-07 | centre to 85 C | vs measured 750 s | alpha to hit 750 s |
|---|---|---|---|
| equal-volume sphere (the app) | 715.6 s | -4.6% | 1.622e-07 |
| prolate spheroid, their semi-axes | 699.9 s | -6.7% | 1.586e-07 |
| ovoid k_v 0.51, same L and B | 676.2 s | -9.8% | 1.533e-07 |

### Derived

- ovoid: d(cook)/d(L/B) at fixed mass = -40.6 s per unit L/B; sd for sd(L/B) = 0.05: 2.0 s
- spheroid: d(cook)/d(L/B) at fixed mass = -44.3 s per unit L/B; sd for sd(L/B) = 0.05: 2.2 s
- ovoid L/B 1.35: d(cook)/d(k_v) = 3.9 s per 0.01 of k_v
- B read to +-0.1 mm on a 43.4 mm egg, with mass known: L/B to +-0.009
- B read to +-0.5 mm on a 43.4 mm egg, with mass known: L/B to +-0.047
- B read to +-1.0 mm on a 43.4 mm egg, with mass known: L/B to +-0.093
