# actual_egg_timer

A boiled-egg timer that computes the time from physics instead of reciting it: transient
heat conduction in a sphere, coupled to Arrhenius denaturation kinetics, with the pan
ramp and the cooling step treated as part of the cook.

It is a static web app with zero runtime dependencies. All of the physics lives in
`src/core/`, which is pure numerics — no DOM, no I/O, no clock — so it can be tested
headlessly and ported to Swift more or less mechanically.

This document exists so that you can **check the model rather than trust it**. Every
number quoted below is either derived here or reproducible from the code, and the
places where the model is weak are named as such.

If you are extending this, start with **[§11 Open problems and what to read
next](#11-open-problems-and-what-to-read-next)** — the unresolved discrepancies, the
measurements that appear not to exist, and the sources worth checking at first hand.

---

## 1. What it does, and why "N minutes" is not enough

Every recipe is of the form *"N minutes after the water boils"*. That instruction is
incomplete. It silently fixes five things it never mentions:

| hidden assumption | how much it moves the answer |
|---|---|
| the boiling point | 100 °C at sea level, 93.4 °C at 2000 m — about +0.8 min |
| the egg's size | cook time scales roughly as M^(2/3); 48 g vs 76 g is 6.2 vs 8.4 min, ~34% |
| the egg's starting temperature | fridge (4 °C) vs counter (21 °C) is ~1.2 min |
| the hob's power | see below — this one is the killer |
| what you do after the pull | up to 11 °C of peak yolk temperature |

The hob is the clearest demonstration. Take one fixed goal — a jammy yolk, eggs
started in cold water, straight into an ice bath — and change nothing except how long
the pan takes to reach a rolling boil:

| time to boil | total cook (min) | **minutes after boiling** |
|---|---|---|
| 4 min | 8.9 | **4.9** |
| 8 min | 10.9 | **2.9** |
| 12 min | 13.0 | **1.0** |

The correct "minutes after boiling" varies by nearly a factor of five with hob power
alone, for exactly the same egg and exactly the same result. The reason is not subtle:
an egg sitting in water that is climbing from 20 °C to 100 °C is already cooking. A
slow pan does most of the work before the recipe's clock even starts.

So this app asks for the things the recipe assumed, times the boil itself rather than
asking you to guess it, and gives you a total time from when the egg goes in.

**Reference scenario.** Unless stated otherwise, every number in this document is for a
62 g egg (43.5 mm minor diameter, equal-volume radius 23.8 mm), fridge-cold at 4 °C,
at sea level, cooked to "jammy" (slider 0.41), four eggs into 2 litres of water, then
straight into an ice bath.

---

## 2. The physical model

### 2.1 Transient conduction in a sphere

The egg is treated as a homogeneous sphere of equal volume, with thermal diffusivity
`alpha`, whose surface follows the water temperature. For a *step* change of the
surface to `Ts` from a uniform initial `T0`, the classical solution is an
eigenfunction series in the Fourier number `Fo = alpha*t/R^2`, with `x = r/R`:

```
theta/theta0 = (T(x,t) - Ts)/(T0 - Ts)
             = 2 * sum_{n=1..inf} (-1)^(n+1) * sinc(n*pi*x) * exp(-n^2*pi^2*Fo)

where sinc(u) = sin(u)/u
```

At the centre `sinc -> 1`, so the centre coefficient of the first mode is exactly 2.0.
The series converges like `exp(-n^2*pi^2*Fo)`, i.e. **slowly at small Fo**, which is
exactly where egg boiling lives (`Fo ~ 0.07-0.18`). See §3 for why that matters.

The same quantity can be derived independently by the method of images, which converges
*fastest* where the eigenfunction series is slowest:

```
theta/theta0 = 1 - (1/x) * sum_{n=0..inf} [ erfc(((2n+1) - x)/(2*sqrt(Fo)))
                                          - erfc(((2n+1) + x)/(2*sqrt(Fo))) ]
```

Both are implemented (`seriesTheta`, `erfcTheta` in `src/core/sphere.ts`) and agree to
five decimal places, which is a real check rather than a tautology since neither is
derived from the other.

### 2.2 What is actually integrated: modal / Duhamel

A real cook is not a step. The surface temperature ramps with the pan, dips when cold
eggs go in, sits at the boil, then falls when the egg is pulled. So the solver keeps the
sphere's eigenmodes as state and drives them with the surface temperature. Writing

```
T(r,t) = Ts(t) + (1/r) * sum_n b_n(t) * sin(n*pi*r/R)
```

each mode obeys a decoupled scalar ODE driven by the *rate of change* of the surface
temperature (Duhamel's principle):

```
b_n'(t) = -lambda_n * b_n(t) - c_n * Ts'(t)

lambda_n = alpha * (n*pi/R)^2          (mode decay rate, 1/s)
c_n      = 2*R*(-1)^(n+1)/(n*pi)       (coupling to the surface drive)
```

Over a step in which `Ts` moves linearly at slope `s`, each mode advances **exactly**:

```
b_n(t+dt) = b_n(t)*exp(-lambda_n*dt) - c_n*s*(1 - exp(-lambda_n*dt))/lambda_n
```

Useful quantities fall straight out of the modal state:

```
centre:         T(0)  = Ts + (pi/R) * sum_n n * b_n
radius x:       T(x)  = Ts + (1/(x*R)) * sum_n b_n * sin(n*pi*x)
volume average: Tavg  = Ts + (3/(2*R^2)) * sum_n b_n * c_n
```

The volume average is not decoration — it is the ceiling on carryover (§5) and the
temperature a lumped egg in still air relaxes *from*.

### 2.3 Why modes and not finite differences

- **Unconditionally stable.** Each mode is advanced by its own exact exponential. There
  is no CFL condition and no explicit/implicit tradeoff.
- **Exact for a piecewise-linear surface drive**, which is all the protocol ever
  produces. The timestep (`DT_SIM = 0.5 s`) has to resolve the *drive*, not stability,
  so the discretisation error is in the schedule, not in the diffusion.
- **No grid.** 40 modes is ~40 floats of state per egg. A whole 15-minute cook is a few
  thousand multiply-adds.
- **Ports unchanged.** Two fixed-size arrays and a `for` loop. No sparse solvers, no
  matrix library, no allocation in the inner loop.

The one thing modes handle badly is a fresh *discontinuity* in the surface temperature:
a truncated basis cannot represent one, and the centre — where modes are weighted by
`n` — rings badly. An instantaneous 100 -> 2 °C drop at the pull made the yolk centre
read 12.5 °C when the true value was 49.3 °C. Hence `TAU_PLUNGE = 4 s`: every change of
medium is blended continuously. That is physically honest anyway (finite Biot number,
and it takes a few seconds to move an egg), but it is also a necessary numerical
regulariser. **Never step the surface discontinuously.**

### 2.4 The surface schedule

`src/core/protocol.ts` builds the temperature the egg's surface actually sees.

**Pan ramp (cold start).** Constant power into a lumped water mass with Newtonian loss
gives an exponential approach to a steady state that boiling clamps before it arrives:

```
T(t) = Tamb + r*(Tboil - Tamb)*(1 - exp(-t/tau)),   tau = t_boil / ln(r/(r-1))
```

`r = P/(U*dT_boil)` is the hob overshoot ratio, and `1/r` has a directly observable
meaning: the fraction of full burner power needed to *hold* a rolling boil, which
measured cooktop studies put near 1/3. So `r = 3`. One user measurement (time to boil)
plus that one shape constant fixes the whole curve. A linear ramp is the `r -> inf`
limit; at `r = 3` the two differ by ~4 °C at the midpoint, worth about 30 s of cook time
on a 10-minute ramp.

**Dip (hot start).** Cold eggs into boiling water drop the water temperature by a plain
energy balance: four 62 g fridge eggs into 2 L drops it 8.3 °C; into 1 L, 15.4 °C. This
is why the same recipe fails in a small pan. Recovery is exponential with
`TAU_DIP_RECOVERY = 60 s`.

**Boiling point.** ISA barometric formula for pressure against altitude, then the
Antoine equation (Stull 1947) inverted for temperature. The engineering one-liner
`T_b = 100 - h/300` is kept as a cross-check and agrees to within 0.031 °C from 0 to
5000 m. (The widely repeated "1 °C per 285 m" rule is about 5% too steep.) Salt is
computed and then ignored: a full tablespoon per litre is +0.28 °C, far inside the
day-to-day weather variation.

---

## 3. Where Williams' 0.76 comes from

C.D.H. Williams' one-term formula is the standard physicist's answer to this problem:

```
t = (M^(2/3) * c * rho^(1/3)) / (K * pi^2 * (4*pi/3)^(2/3))
      * ln( 0.76 * (Tw - T0) / (Tw - Ty) )
```

The popular explanation of the 0.76 is wrong, including on Omnicalculator and in
ScienceAlert, both of which call it a "yolk-to-white ratio". It is not.

**0.76 is `2*sinc(pi*x)` evaluated at the yolk boundary.** It is the amplitude of the
first eigenmode at `x = r_yolk/R`. The yolk is about 33% of the egg's volume, so

```
x = (1/3)^(1/3) = 0.693
2*sinc(pi*0.693) = 0.7549
```

Three independent routes agree on that radius: (a) the forward calculation above;
(b) inverting `2*sinc(pi*x) = 0.76` gives `x = 0.691`, i.e. 33.0% of the volume;
(c) published composition data (yolk ~31% by mass, and it is the denser phase) gives
`r_y/R = 0.693`. It is also **not** the yolk *centre* — the centre coefficient of the
first mode is exactly 2.0, not 0.76.

So the formula asks: when does the *outer boundary of the yolk* reach the target
temperature. That is a defensible criterion, and it is the same radius at which this
model evaluates the innermost white (§4).

**Two checks that the reading is right.** Reconstructing Williams' prefactor from his
stated properties (rho = 1.038 g/cm^3, c = 3.7 J/g/K, K = 5.4e-3 W/cm/K) gives
27.05 s/g^(2/3) = **0.451 min**, which is the prefactor he publishes. Feeding his own
worked example through it — 57 g egg, 4 °C to a 63 °C yolk boundary in 100 °C water —
gives **4.53 min** against his published ~4.5 min. Both are reproduced in
`tools/validate.ts`.

### Why we do not use it

One-term truncation is only valid for `Fo > 0.2`. Soft-boiling is nowhere near that.
Solving for the Fourier number at which `theta/theta0 = (100-63)/(100-4) = 0.3854` at
`x = 0.693`:

| method | Fo at the target |
|---|---|
| full series (40 terms) | 0.07434 |
| one term | 0.06811 |

The one-term form reaches the criterion **8.4% early**, so it under-predicts cook time
by 8.4% — roughly 40 seconds on a 7.4-minute egg, which is the difference between jammy
and runny. For a whole realistic cook `Fo` runs about 0.07 to 0.18, still below the
0.2 threshold throughout.

We therefore sum **40 terms** (`MODE_COUNT`), which is exact to machine precision here
and costs nothing. At `Fo = 0.0688, x = 0.693` the eigenfunction series and the
method-of-images series both return **0.41142**; the one-term value is 0.38281.

---

## 4. Doneness is a thermal dose, not a peak temperature

Protein denaturation is an irreversible, roughly first-order process with a very large
activation energy — `Ea ~ 470 kJ/mol` for yolk gelation (Vega & Mercadé-Prieto 2011).
Converted to a decimal-reduction slope,

```
z = ln(10) * R_gas * T^2 / Ea
```

At `T = 338 K` with `Ea = 470 kJ/mol` this gives **z = 4.65 K**: an extra 4.7 °C makes
the reaction **ten times faster**. Egg white (ovalbumin, `Ea ~ 460 kJ/mol` at 353 K)
gives `z = 5.2 K`.

Because cooking is not isothermal — and because the egg keeps cooking after it leaves
the water — the honest criterion is the integral, not the peak:

```
Phi(t) = integral_0^t 10^((T(tau) - Tref)/z) dtau
```

read as **equivalent minutes at Tref**. The app tracks two doses:

| dose | z (K) | Tref (°C) | evaluated at |
|---|---|---|---|
| yolk gelation | 4.65 | 63 | the yolk centre (`x = 0`) |
| white setting | 5.2 | 80 | the yolk boundary (`x = 0.693`) |

The white is evaluated at the yolk boundary because the *innermost* white is the last to
set — which is precisely the radius Williams' 0.76 encodes.

> ### Warning: do not use z = 33.1 K
>
> The standard food-engineering "cook value" `C100` uses `z = 33.1 K`. That is about
> **7x too shallow for egg protein** and will give badly wrong answers — it implies a
> 33 °C rise for a tenfold rate change, where the real figure is under 5 °C. If you are
> comparing this model against a pasteurisation calculator, check its z-value first.

### Why the slider is perceptually even

The slider maps `[0,1]` onto a yolk dose target from 0.05 to 2000 equivalent minutes at
63 °C, **interpolated logarithmically**. Because dose goes as `10^(T/z)`, moving
linearly in `log10(dose)` is equivalent to moving linearly in peak yolk temperature.
The model confirms this — the cook times are not evenly spaced, but the temperatures
are:

| slider | dose target (min-eq @63 °C) | cook time (min) | peak yolk (°C) |
|---|---|---|---|
| 0.00 | 5.0e-2 | 5.91 | 55.9 |
| 0.25 | 7.1e-1 | 6.76 | 61.4 |
| 0.50 | 1.0e+1 | 7.71 | 66.7 |
| 0.75 | 1.4e+2 | 8.80 | 72.0 |
| 1.00 | 2.0e+3 | 10.12 | 77.4 |

Peak yolk rises by 5.4, 5.3, 5.3, 5.4 °C across the four intervals. That is the design
intent: one physical scale, one perceptual scale, no tuning table.

The labelled anchors, for the reference scenario:

| label | slider | cook (min) | peak yolk (°C) | peak inner white (°C) |
|---|---|---|---|---|
| Runny | 0.00 | 5.91 | 55.9 | 74.7 |
| Soft | 0.22 | 6.65 | 60.7 | 77.9 |
| Jammy | 0.41 | 7.36 | 64.8 | 80.6 |
| Fudgy | 0.62 | 8.22 | 69.3 | 83.4 |
| Hard | 1.00 | 10.12 | 77.4 | 88.2 |

The white has its own floor: the shortest cook that still sets the white is 5.76 min
here, giving a peak inner-white temperature near 75 °C. That is genuinely set but
tender — ovotransferrin (62 °C) and lysozyme (~70 °C) have denatured, ovalbumin (80 °C)
has not. Demanding a full ovalbumin set instead would forbid the classic soft-boiled
egg, which plainly exists.

---

## 5. Carryover: the cooling step is part of the recipe

An egg pulled from boiling water has a steep internal gradient — the outside is near
100 °C and the centre is nowhere near its final temperature. That heat is still in the
egg, and it keeps going inward. Two time constants decide what happens next:

| process | time constant | for the reference egg |
|---|---|---|
| internal equilibration | `R^2/(pi^2 * alpha)` — the slowest internal mode | ~340 s (the centre closes 93% of its gap to the volume average within 300 s, because the faster modes go first) |
| cooling in still air | `m*c/(h*A)`, `TAU_AIR` | 2030 s |

Still air is **~6x slower at removing heat than the egg's slowest internal mode is at
redistributing it**, and slower still relative to the effective gap closure. A
rested egg therefore carries over almost *adiabatically*: it equilibrates toward its own
volume-average temperature before the room has taken much heat out at all. Water is the
opposite — an ice bath or a cold tap is effectively Dirichlet, pulling the surface to the
bath temperature immediately and intercepting the carryover.

Here is the same cook — identical 7.4 minutes in the water, so the egg is in an identical
state at the pull, **48.5 °C at the yolk centre in all three cases** — diverging purely
on what happens afterwards:

| cooling | peak yolk (°C) | rise after the pull | peak reached |
|---|---|---|---|
| ice bath | 65.0 | +16.5 | ~3 min after pull |
| cold tap | 65.6 | +17.1 | ~3 min after pull |
| **counter (still air)** | **76.3** | **+27.8** | ~8 min after pull |

For comparison, a perfectly insulated egg — the true adiabatic limit, where the centre
simply reaches the volume average — peaks at 76.2 °C. Counter-resting is within a few
tenths of a degree of that limit. **Still air is not cooling; it is a lid.**

### The consequence, stated plainly

**Soft doneness is unreachable if you rest the egg on the counter.** Even the shortest
cook that sets the white (4.9 min, with counter resting) carries the yolk to 65.6 °C.
There is no cook time that produces a soft yolk and a set white in that protocol. The
solver reports this honestly: `solveCookTime` returns `reachable: false` and a
`softestLevel` of 0.58 — between "jammy" and "fudgy" — and the UI greys out everything
below it rather than returning a time it cannot deliver.

This is, most likely, why soft-boiled eggs are the least reproducible thing in the
kitchen. It is not the timing. It is the step after the timing, the one no recipe
specifies, whose effect is larger than a full minute of boiling.

---

## 6. Every constant, with provenance

Values are in `src/core/constants.ts` (and the dose targets in `src/core/solve.ts`).
Confidence is our own honest assessment, not a formal uncertainty.

### Calibratable — these carry the model error

| constant | value | units | source / confidence |
|---|---|---|---|
| `ALPHA_DEFAULT` | 1.70e-7 | m²/s | Albumen at cooking temperature. **The calibration knob.** Only the group `tau = R^2/alpha` is identifiable, so radius and diffusivity cannot be fitted separately: geometry is fixed honestly and `alpha` absorbs the model error. Room-temperature literature values (~1.36e-7) are inconsistent with reported `alpha`; water's conductivity rises ~13% by 100 °C, which resolves it in favour of the higher value. For the reference egg `tau = R^2/alpha = 3340 s`. **Medium** — reproduces kitchen practice. |
| `ALPHA_REL_SD` | 0.119 | — | Prior width for calibration, chosen so `tau` has sd ~400 s at the reference radius. **Judgement.** |
| `TAU_AIR` | 2030 | s | Lumped `m*c/(h*A)` with `h ~ 15 W/m²K` in still air. **Lowest confidence in the model** — no published egg-centre measurements after removal from water were found. Carries a wide calibration prior (`tauAirScale`). |
| `H_EFF` | 850 | W/m²K | Natural convection on a sphere (~1100) in series with shell + membranes (~3200). Estimated, not measured. Used for the Biot number. **Low**, but it only enters as a justification, not as a driver (see §8). |
| `RAMP_R` | 3.0 | — | Hob overshoot ratio; `1/r` is the fraction of full power needed to hold a boil, which measured cooktop studies put near 1/3. **Medium-low.** |

### Physical properties

| constant | value | units | source / confidence |
|---|---|---|---|
| `K_EGG` | 0.60 | W/m·K | Egg contents at cooking temperature, albumen-dominated (Coimbra et al. 2006). Used only for the Biot number. **Medium-high.** |
| `C_EGG` | 3200 | J/kg·K | Whole egg (Coimbra et al. 2006). **Medium-high.** |
| `C_WATER` | 4186 | J/kg·K | Standard. **High.** |
| `RHO_EGG` | 1100 | kg/m³ | Whole egg including shell; specific gravity 1.07-1.10. **High.** |

### Geometry

| constant | value | units | source / confidence |
|---|---|---|---|
| `EGG_VOLUME_COEFF` | 0.51 | — | `V = k_v * L * B^2` (Hoyt 1979). The ovoid taper removes ~2.5% from a prolate spheroid's `pi/6 = 0.5236`. **High.** |
| `EGG_LENGTH_RATIO` | 1.35 | — | `L/B`; shape index `100*B/L ~ 74`. **Medium** — varies by breed and bird age. |
| `YOLK_RADIUS_FRAC` | 0.693 | — | Yolk = 33% of egg volume, `(1/3)^(1/3)`. **High** — three independent routes agree (§3). |
| `SIZE_CLASSES` | 48/58/68/76 | g | EU Regulation 589/2008 Art. 4. Labelled in grams deliberately: EU/UK "Large" (63-73 g) is a US "Extra Large", and a US "Large" (57 g) is an EU "Medium". Using names would systematically mis-time for one audience. |

### Kinetics

| constant | value | units | source / confidence |
|---|---|---|---|
| `Z_YOLK` | 4.65 | K | From `Ea ~ 470 kJ/mol` (Vega & Mercadé-Prieto 2011) at 338 K. Recomputed: 4.653. **Medium-high** for the slope, **medium** for `Ea` itself. |
| `TREF_YOLK_C` | 63 | °C | Reference for the yolk dose integral. Definitional. |
| `Z_WHITE` | 5.2 | K | Ovalbumin, `Ea ~ 460 kJ/mol` at 353 K (Weijers et al. 2003). Recomputed: 5.186. **Medium.** |
| `TREF_WHITE_C` | 80 | °C | Definitional. |
| `WHITE_DOSE_TARGET` | 0.05 | min-eq @80 °C | Calibrated so the shortest white-setting cook is ~5.8 min for a fridge-cold reference egg into boiling water, peak inner white ~75 °C. **Calibrated to kitchen practice, not measured.** |
| `YOLK_DOSE_RUNNY` | 0.05 | min-eq @63 °C | Slider floor (~56 °C peak yolk). **Definitional.** |
| `YOLK_DOSE_HARD` | 2000 | min-eq @63 °C | Slider ceiling (~77 °C peak yolk). **Definitional.** |

### Protocol and numerics

| constant | value | units | source / confidence |
|---|---|---|---|
| `T_ICE_BATH_C` | 2 | °C | Ice water. **High.** |
| `T_COLD_TAP_C` | 15 | °C | Varies by season and country; this is a middling mains temperature. **Low, and it matters little** (§5). |
| `T_ROOM_C` | 20 | °C | Default room. |
| `TAU_PLUNGE` | 4 | s | Surface equilibration on changing medium. Physical (finite Bi, finite handling time) *and* a required numerical regulariser (§2.3). **Low as physics, mandatory as numerics.** |
| `TAU_DIP_RECOVERY` | 60 | s | Burner recovery after cold eggs enter. **Low.** |
| `MODE_COUNT` | 40 | — | Eigenmodes retained. Exact to machine precision at these Fourier numbers. **Numerical.** |
| `DT_SIM` | 0.5 | s | The integrator is exact for a piecewise-linear drive, so this resolves the schedule, not stability. **Numerical.** |
| `CARRYOVER_WINDOW` | 900 | s | How long to keep integrating after the pull. Carryover peaks 3-8 min in; 15 min captures it fully. **Numerical.** |

> **Note on `TAU_REF`.** `PLAN.md` records `TAU_REF = 3354 s` as "`R^2/alpha` for a 57 g
> egg". Recomputing, a 57 g egg gives `tau = 3146 s`; 3354 s corresponds to a ~63 g egg.
> The value is right for the reference egg used throughout the validation tables (62.3 g,
> `tau = 3340 s`); the "57 g" label appears to be a slip. `TAU_REF` is not itself a
> constant in the code — `ALPHA_DEFAULT` and the geometry determine it.

---

## 7. Validation

`npm run validate` rebuilds and regenerates this table from the current code
(`tools/validate.ts`). The "target" column is the expectation recorded in `PLAN.md`
during the design phase; "computed" is what the implementation actually returns today.

| check | target | computed | status |
|---|---|---|---|
| Williams' published prefactor, reconstructed from his stated properties | 0.451 min | 0.451 min | pass |
| Williams' worked example (57 g, 4 °C, yolk boundary to 63 °C) | ~4.5 min | 4.53 min | pass |
| eigenfunction vs method-of-images series at `Fo = 0.0688, x = 0.693` | agree | 0.41142 vs 0.41142 | pass |
| one-term truncation error at the soft-boil criterion | -8.4% | -8.4% (Fo 0.06811 vs 0.07434) | pass |
| `T_b(h)` vs `100 - h/300`, 0-5000 m | within 0.03 °C | max 0.031 °C | pass |
| fridge 4 °C, sea level, jammy, ice bath | 7.4 min | 7.4 min | pass |
| room 21 °C, sea level, jammy, ice bath | 6.3 min | 6.2 min | within rounding |
| fridge 4 °C, 2000 m, jammy, ice bath | 9.2 min | 8.2 min | **disagrees — see below** |
| carryover: same 7.4 min cook, ice / tap / counter | 65.0 / 65.6 / 76.3 °C | 65.0 / 65.6 / 76.3 °C | pass |
| counter resting cannot reach soft | unreachable | `reachable: false`, `softestLevel` 0.58 | pass |

**The altitude row does not reproduce.** The current model gives 8.2 min for a jammy
fridge egg at 2000 m (boiling point 93.4 °C); `PLAN.md` records a planning-phase
expectation of 9.2 min, which corresponds to roughly 3700 m in the present code. The
planning figure predates the implemented ramp and dose machinery and appears to be the
stale one, but it has not been chased down. Treat altitude predictions as carrying that
1-minute question mark until it is resolved.

`PLAN.md` also carries a correction worth repeating: the planning estimate for
counter-resting was 85.3 °C, computed with a model that relaxed the surface from the
*water* temperature. A lumped egg in still air relaxes from its own *volume-average*
temperature. Corrected in `coolingTemperature`, the figure is 76.3 °C. The effect is
still decisive (jammy versus fully set) but smaller than first computed.

---

## 8. Assumptions and limitations

Read this section before trusting a number to better than half a minute.

**The sources could not be fetched.** During development the network egress proxy
blocked direct retrieval of the primary literature. **Every constant here is re-derived
and cross-validated rather than transcribed from the source.** Three independent checks
passed and are worth the weight they carry: Williams' published 0.451 prefactor was
reconstructed from his stated properties; his published 4.5-minute worked example
reproduces at 4.53 min; and two independently derived series solutions (eigenfunction
and method of images) agree to five decimal places. Those checks constrain the
*conduction* half of the model well. They say nothing about the target temperatures.
**If you are going to verify one thing, verify Williams' stated target temperatures
against the original paper** — §8's dominant uncertainty is exactly there.

**Homogeneous sphere, one diffusivity.** There is no separate yolk domain. The yolk has
a higher solids content and is genuinely more insulating than albumen, so expect the
homogeneous model to **under-predict** the time for the yolk centre. Calibration partly
absorbs this into `alpha`, but it absorbs it as an average across the whole cook, not as
a structural correction. An egg is also not a sphere: the equal-volume sphere is a good
approximation for the centre and a worse one near the surface.

**Dirichlet surface in the water.** The model clamps the surface to the water
temperature. With `H_EFF = 850 W/m²K` the Biot number is `h*R/k ~ 34`, so this is good
to a few percent; pure Dirichlet under-predicts cook time by roughly 5%, which
calibration of `alpha` absorbs. This is a real approximation, but a well-bounded one.

**The cooling phase is different, and weaker.** In still air `Bi ~ 0.6` and Dirichlet
would be badly wrong, so the cooling phase instead drives the surface along the egg's
own *lumped* decay from its volume-average temperature. That is a different
approximation from the one used during the cook, and it is the **least verified part of
the model**. No published measurements of egg-centre temperature after removal from
water were found. The qualitative conclusion (counter-resting is nearly adiabatic) is
robust because it depends only on the ratio of two time constants that differ by ~7x,
but the specific 76.3 °C is soft.

**The air cell is unmodelled.** A real egg contains a gas pocket at the blunt end,
typically 2-5% of the volume and growing with age. It is an insulator and it displaces
egg. Expect a small systematic bias that grows with how long the eggs have sat.

**Target temperatures disagree in the literature, and that dominates everything.**
Published "correct" yolk temperatures for a given doneness differ by 3-6 °C between
sources. Because `z ~ 4.65 K`, **a 5 °C disagreement is roughly a tenfold change in
thermal dose.** No amount of care in the conduction model compensates for that. This is
the single largest source of uncertainty in the app, larger than the diffusivity,
larger than the cooling model, larger than the egg geometry. The doneness anchors should
be read as *this model's internally consistent scale*, calibrated against kitchen
practice, not as transcribed literature values.

**Numerical caveats.** The modal basis is truncated, so quantities read out at the
instant of a medium change carry a small Gibbs-type oscillation; `TAU_PLUNGE` exists to
suppress it. The reported yolk-at-pull temperature is the most exposed output in this
respect. The peaks — which are what the app actually reports — are read several minutes
later and are stable.

**Not modelled at all:** shell cracking and leakage; egg age (pH rise, which changes
both peel quality and albumen behaviour); stirring or rolling boil agitation; stacked
eggs shading each other; salt or vinegar in the water beyond the boiling-point
elevation; pressure cooking; the periodic-cooking protocol of Di Lorenzo et al. (2025).

**Open problems are listed separately.** §11 collects the discrepancies that could not
be resolved, the measurements that do not appear to exist, and the modelling work
deliberately left undone. Read it before extending anything here.

**Food safety is not the objective here.** The doses computed are gelation doses, not
pasteurisation doses. If you need a *Salmonella* log-reduction guarantee, use a
pasteurisation calculator built for it — and check what z-value it uses.

---

## 9. Using it reproducibly

The model can only be as good as what you tell it. In descending order of how much each
one matters:

1. **Measure the egg.** A kitchen scale beats a ruler on an ovoid; enter mass if you
   have it. Size class is a fallback, and the labels differ between the EU and the US
   (which is why the app labels them in grams).
2. **Say where the egg came from.** Fridge (4 °C) versus counter (20 °C) is over a
   minute.
3. **Time the boil honestly.** Press the boil button at a **full rolling boil**, not at
   first bubbles. First bubbles are nucleation on the pan base at maybe 85-95 °C;
   tapping there under-measures the ramp by 15-25% and the model will under-cook.
4. **Use enough water and note how much.** Four cold eggs into 1 L drops the water by
   15 °C; into 2 L, by 8 °C.
5. **Commit to a cooling protocol and actually do it.** This is not a garnish on the
   recipe; it is 11 °C of peak yolk temperature (§5). "Ice bath" means ice *and* water,
   in enough volume that it stays cold.
6. **Set altitude once.** The app derives the boiling point; you do not need to guess a
   rule of thumb.

Keep those fixed and the same setting will give you the same egg. Change one and the
app will tell you what it costs.

### Calibrating against your own eggs

Two parameters are meant to be learned, not asserted:

- `alpha_m2s` — absorbs everything about *how fast heat gets to the middle*: your eggs'
  composition, the shape error, the Dirichlet approximation, the yolk's extra
  insulation.
- `tauAirScale` — a multiplier on `TAU_AIR`, absorbing your kitchen's draughtiness. It
  is **only identifiable if you actually vary the cooling protocol**; cook every egg in
  an ice bath and there is nothing in your data to learn it from.

To calibrate: cook eggs, and after each one record whether the result was softer or
harder than you asked for. Ordinal feedback is enough — you do not need a thermocouple,
and a judgement of "too soft" is far more reliable than a guess at a temperature. Vary
one thing at a time, and include at least a few cooks with a *different* cooling step if
you want `tauAirScale` to mean anything. The inference machinery for this
(`src/core/infer.ts`) is Phase C and is not built yet; until it lands, the manual
version is to nudge `alpha_m2s` down if your eggs come out consistently underdone and up
if they come out consistently overdone, by about 7% per half-minute of error.

### Running it

```
npm install
npm run build      # tsc
npm test           # node --test
npm run validate   # regenerates the validation table in §7
npm run serve      # static server on :8080
```

`src/core/` has zero dependencies, no DOM, no `Date`, no I/O and no `async`. It is plain
interfaces and top-level functions with explicit loops, which is deliberate: it is meant
to port to Swift essentially unchanged.

---

## 10. References

Sources marked **(not fetched)** could not be retrieved directly during development —
the egress proxy blocked them — so the values attributed to them were re-derived and
cross-checked rather than transcribed. See §8.

**Heat transfer in eggs**

- C.D.H. Williams, "The Science of Boiling an Egg", University of Exeter.
  <https://newton.ex.ac.uk/teaching/CDHW/egg/> (PDF:
  <https://newton.ex.ac.uk/teaching/CDHW/egg/CW061201-1.pdf>). Originally *New
  Scientist*, "The Last Word", 4 April 1998. **(not fetched)** — source of the 0.76
  coefficient and the one-term formula; prefactor and worked example independently
  reproduced (§3).
- Roura, Fort, Saurina, "How long does it take to boil an egg? A simple approach to the
  energy transfer equation", *Eur. J. Phys.*
  <https://copernic.udg.edu/QuimFort/EJP_00.pdf> **(not fetched)**
- Buay, Foong, Kiang, Kuppan, Liew, "How long does it take to boil an egg? Revisited",
  *Eur. J. Phys.* **27**:119 (2006).
  <https://iopscience.iop.org/article/10.1088/0143-0807/27/1/013> **(not fetched)**
- Abbasnezhad et al., "Numerical modeling of heat transfer and pasteurizing value during
  thermal processing of intact egg", *Food Sci. Nutr.* **4**(1) (2016).
  <https://onlinelibrary.wiley.com/doi/full/10.1002/fsn3.257> **(not fetched)**
- Di Lorenzo et al., "Periodic cooking of eggs", *Communications Engineering* **4**
  (2025). <https://www.nature.com/articles/s44172-024-00334-w> **(not fetched)** — not
  implemented; a different protocol entirely.

**Denaturation kinetics**

- Vega & Mercadé-Prieto, "Culinary Biophysics: on the Nature of the 6X °C Egg", *Food
  Biophysics* **6**:152-159 (2011).
  <https://link.springer.com/article/10.1007/s11483-010-9200-1> **(not fetched)** —
  source of `Ea ~ 470 kJ/mol` for yolk, hence `z = 4.65 K`.
- Weijers et al., "Heat-induced denaturation and aggregation of ovalbumin at neutral pH
  described by irreversible first-order kinetics", *Protein Science*
  **12**:2693-2703 (2003).
  <https://onlinelibrary.wiley.com/doi/full/10.1110/ps.03242803> **(not fetched)** —
  source of `Ea ~ 460 kJ/mol` for ovalbumin.

**Physical properties**

- Coimbra et al., "Density, heat capacity and thermal conductivity of liquid egg
  products", *J. Food Eng.* **74**(2):186-190 (2006).
  doi:10.1016/j.jfoodeng.2005.01.043 **(not fetched)**
- Stull, D.R., *Ind. Eng. Chem.* **39**(4):517-540 (1947) — Antoine coefficients for
  water. **(not fetched)**
- Hoyt, "Practical methods of estimating volume and fresh weight of bird eggs" (1979) —
  the `k_v = 0.51` shape coefficient. **(not fetched)**

**Practice, for sanity-checking the outputs**

- Douglas Baldwin, "A Practical Guide to Sous Vide Cooking".
  <https://douglasbaldwin.com/sous-vide.html>
- ChefSteps Egg Calculator. <https://www.chefsteps.com/activities/the-egg-calculator>
- J. Kenji López-Alt, Serious Eats Food Lab, on boiled eggs and peelability.
  <https://www.splendidtable.org/story/2022/11/22/j-kenji-lopezalts-perfect-hard-boiled-eggs>
- Martin Lersch, Khymos, "Towards the perfect soft boiled egg".
  <https://khymos.org/2009/04/09/towards-the-perfect-soft-boiled-egg/>

**Standards**

- USDA FSIS, High Altitude Cooking.
  <https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/high-altitude-cooking>
- EU Regulation 589/2008 Art. 4 — egg size classes.

---

## 11. Open problems and what to read next

Everything in this section is a known gap, not a hidden one. It is written so that
whoever picks this up next does not have to rediscover it.

### 11.1 Discrepancies found and not resolved

These surfaced during development and could not be settled without the primary sources.
Each one is a concrete, checkable question.

1. **Williams' room-temperature example does not match his own formula.** He is quoted
   as giving ~3.5 min for a 57 g egg from 21 °C; reconstructing his formula with his
   stated constants gives **3.23 min**. His 4 °C example reproduces exactly (4.53 vs
   "four and a half minutes"), so the constants are right and something else differs —
   rounding, a different assumed mass, or a misquote downstream. Unexplained.

2. **Williams' hard-boiled target temperature is unconfirmed.** Derivative calculators
   variously state 77 °C and 80 °C for the yolk boundary. Neither could be traced to his
   own text. The soft-boiled 63 °C is well attested; the hard figure is not.

3. **Albumen thermal conductivity and diffusivity are mutually inconsistent in the
   literature.** `k = 0.52 W/m·K` with albumen's density and specific heat gives
   `alpha = 1.36e-7 m²/s`, but the widely quoted albumen `alpha` is `1.7e-7`, which
   requires `k ~ 0.65`. The likely resolution is temperature: Coimbra et al. measured at
   or below 38 °C, and water's conductivity rises ~13% by 100 °C. This model uses
   `1.70e-7` on that reasoning, but it is an inference, not a measurement, and it is the
   single most load-bearing constant here.

4. **A quoted albumen conductivity of 0.026 W/m·K is physically impossible** and appears
   somewhere in the citation chain around Abbasnezhad et al. (2016). That is
   approximately the conductivity of *air*; a 90%-water gel must be near 0.55-0.6. The
   shell value taken from the same paper (`2.25 W/m·K`) looks plausible and is used only
   for a series-resistance estimate, but both should be checked at source before either
   is relied on.

5. **Lysozyme denaturation temperature is reported anywhere from 67 to 77.5 °C.** It is
   genuinely pH- and ionic-strength dependent, and egg white pH rises from ~7.6 to ~9.2
   as an egg ages, so some of the spread is real rather than error. Not used directly,
   but it bears on where "the white is set" should sit.

6. **The two-domain paper's geometry looks wrong, or its summary does.** Lorig,
   arXiv:2606.22156, is reported as using egg radius 2.2 cm with yolk radius 1.1 cm. A
   1.1 cm yolk radius implies a yolk volume of ~5.6 cm³, roughly **three times too
   small** — a real yolk is ~17 cm³, radius ~1.6 cm, which is what this model's
   `YOLK_RADIUS_FRAC = 0.693` encodes. Verify before adopting any parameter from it.

7. **One summary of Di Lorenzo et al. (2025) reversed the albumen and yolk targets**
   (65/84 °C instead of 85/65 °C). The correct assignment is almost certainly albumen
   ~85 °C, yolk ~65 °C. Worth confirming at source, since that paper is otherwise the
   best modern reference for thermal parameters.

### 11.2 Measurements that do not appear to exist

Searching did not turn these up. If you want to improve the model, these are the
highest-value experiments, and none of them is hard.

1. **Egg-centre temperature after removal from the water**, under an ice bath, a cold
   tap, and resting on the counter. Nothing published was found. This is the weakest
   constant in the model (`TAU_AIR`) and it drives the app's most opinionated behaviour —
   refusing soft doneness when the egg will be rested. A thermocouple through the blunt
   end and a datalogger would settle it in an afternoon.

2. **Convective heat transfer coefficient for a food body in agitated boiling water.**
   `H_EFF = 850 W/m·K` is a series estimate — a natural-convection correlation for a
   sphere, combined with shell and membrane resistance. Not a measurement. Bubble
   agitation at a rolling boil could plausibly double it, which is worth a few percent
   of cook time.

3. **A logged temperature-vs-time curve for a domestic pot of water.** `RAMP_R = 3.0`
   comes from cooktop *efficiency* studies ("about a third of full burner power holds a
   boil"), not from a measured heating curve. Twenty minutes with a thermocouple would
   beat every source found, and the app already measures your time-to-boil, so the shape
   parameter is the only thing left guessed.

### 11.3 Modelling work deliberately not done

- **Two concentric domains** with distinct yolk and albumen diffusivities. This is the
  known structural bias (§8) and the most principled fix. Lorig's Laplace-transform
  solution is the closest published approach — subject to 11.1(6).
- **A proper Robin boundary condition** during cooling, with eigenvalues from
  `1 - mu·cot(mu) = Bi`, instead of the current lumped approximation. This requires
  re-projecting the modal state onto a new basis when the medium changes, which is why
  it was not attempted for v1.
- **Ovoid geometry** rather than an equal-volume sphere.
- **The air cell**, as a lateral insulating cap that grows with egg age.
- **Egg age** generally — it shifts albumen pH, peel quality and air-cell size together,
  and would be a single useful input.

### 11.4 Known software gaps

- **The finished-egg screen has not been visually confirmed in a browser.** Reaching
  `DONE` requires sitting through a full seven-minute cook. The calibration path behind
  it *is* verified end to end (feedback moves the posterior in the right direction and
  survives a reload), and the element's visibility is a single condition, but the
  rendered screen itself is unverified.
- **`tauAirScale` is only identifiable if you vary the cooling method.** Cook every egg
  with an ice bath and it will sit at its prior forever — which is correct behaviour, not
  a bug, but it means the carryover model never improves unless you deliberately mix.
- **`alpha` and the taste offset are confounded at a fixed protocol.** The *combination*
  is identified — the suggested time converges — but the individual parameters are not.
  Varying egg size or cooling method separates them.
- **No Swift port.** `src/core/` is written in a restricted subset to make it a
  near-mechanical transliteration, but the port has not been attempted or compile-tested.

### 11.5 Sources that returned fabricated citations

During research several AI-generated content farms returned confident, specific, and
entirely false citations — including a non-existent FDA study quoted with a sample size
and an effect size ("reduces thermal stress-induced cracking by 68%, FDA Bacteriological
Analytical Manual, 2022 thermal fracture trials, n = 1,240 eggs"). No such study exists.
The domains observed doing this were `lifetips.alibaba.com`, `thelivinglook.com`,
`cooknestdaily.org` and `biennialsandeducation.org`. Nothing from them is used here, and
they are named so that nobody re-ingests them while extending this work.

---

## License

MIT. See [LICENSE](LICENSE).
