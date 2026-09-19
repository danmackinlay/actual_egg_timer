# Actual Egg Timer

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

**Heat off at the boil (the standing method).** "Bring to the boil, cover, take it off
the heat, wait" is a real recipe — it is Williams' own hard-boiling method — and the
modal solver takes it for free, because it is driven by an arbitrary piecewise-linear
surface temperature. A pan losing heat to the room is Newtonian:

```
T(t) = Tamb + (Tboil - Tamb) * exp(-t/tau_pan)
```

and `tau_pan = m*c/(U*A)` is **the same time constant that shapes the ramp**, so the
user's one measurement already contains it:

```
t_boil = tau_pan * ln(r/(r-1))   =>   tau_pan = t_boil / 0.405   (at r = 3)
```

An 8-minute boil implies `tau_pan = 19.7 min`. No new measurement is needed, and the
dependence on water volume comes along for free: more water takes longer to boil, which
*is* the statement that it holds more heat.

Two things fall out that are worth more than the feature itself:

- **The dose saturates.** The water is falling, so past about 12 minutes of standing
  nothing further happens: 20 minutes and 30 minutes give a yolk within 0.01% of the same
  dose. That is why a folk method can say "about seventeen minutes" and be right.
- **The pan decides, not the clock.** A 10-minute boil reaches hard in 6 minutes of
  standing; a 6-minute boil cannot get past fudgy; and a 4-minute boil — a small pan on a
  strong burner, storing almost nothing — never sets the white at all, at any doneness,
  because the water falls past what the white needs while the egg is still in it. The app
  refuses the settings it cannot deliver rather than printing a time that will not work
  (§7). Both refusals are new failure modes: held at the boil, the dose only grows, so the
  only way to miss was ever from the soft end.

`TAU_STANDING_SCALE` holds open the one real question: whether the pan's loss constant is
really the same with the burner off and a lid on. See §6 and §11.3.

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

The popular explanation of the 0.76 is wrong. Omnicalculator's egg page writes the
formula with the coefficient named `ywr` and glossed as the ratio of white to yolk;
other derivative calculators repeat the same story. It is not that.

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
`tools/validate.ts`. So are his other two examples (47 g -> 4 min, 67 g -> 5 min).

**A third check, from the primary literature.** Buay et al. (2006) set both formulas
side by side — their eq. (11) carrying the centre coefficient 2, Williams' eq. (12)
carrying the 0.76 — and say outright why they differ: Williams' criterion is the
*boundary* of the yolk, theirs is the *centre* of the yolk. The eigenmode reading is
not an inference from the number; it is what the physics lineage states.

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
activation energy. Vega & Mercadé-Prieto (2011) fit **`Ea = 469 ± 13 kJ/mol`** (95% CI)
to isothermal yolk gelation times measured between 54 and 70 °C, and `483 ± 37 kJ/mol`
independently to the viscosity-rise slope. Converted to a decimal-reduction slope,

```
z = ln(10) * R_gas * T^2 / Ea
```

At `T = 338 K` — mid-range for their data, not an extrapolation — this gives
**z = 4.65 K**: an extra 4.7 °C makes the reaction **ten times faster**. Their
confidence interval maps to `z = 4.54-4.80 K`, so the model's 4.65 sits inside it.

Egg white is ovalbumin, and Weijers et al. (2003) report `Ea ~ 480 kJ/mol` (430-490
across techniques), which at 353 K gives **`z = 4.97 K`**. An earlier draft of this
model used 460 kJ/mol and `z = 5.2`; that was wrong and has been corrected. Nothing in
the validation table moves, because the white dose only binds at the reachability
edge.

Because cooking is not isothermal — and because the egg keeps cooking after it leaves
the water — the honest criterion is the integral, not the peak:

```
Phi(t) = integral_0^t 10^((T(tau) - Tref)/z) dtau
```

read as **equivalent minutes at Tref**. The app tracks two doses:

| dose | z (K) | Tref (°C) | evaluated at |
|---|---|---|---|
| yolk gelation | 4.65 | 63 | the yolk centre (`x = 0`) |
| white setting | 4.97 | 80 | the yolk boundary (`x = 0.693`) |

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

### An absolute anchor for the dose scale

Vega & Mercadé-Prieto also publish the Arrhenius fit itself, which converts directly
into this model's units. Read at 63 °C, their isothermal gelation time **is** a dose in
equivalent minutes at 63 °C:

| yolk held at | time to gel |
|---|---|
| 60 °C | 305 min |
| 63 °C | **67 min** |
| 65 °C | 25 min |
| 70 °C | 2.2 min |

So a *gelled* yolk — tan δ = 1 in a rheometer, i.e. properly set — is about
**67 min-eq @ 63 °C**, which lands at slider **0.68**: past Jammy (0.41), short of Hard
(1.00). That is the right place for it, and it is the first number on the doneness scale
that comes from a measurement rather than from kitchen practice. (Their printed equation
is typeset with the exponent sign transposed; the form above is the one that reproduces
their own figure 4. `tools/validate.ts` carries the check.)

The same paper is worth reading for what it refuses to give you: its conclusion is that
there is no such thing as a 63 °C egg or a 65 °C egg, because texture is set by time
*and* temperature together. That is the entire argument for §4 in one sentence, from
people who measured it.

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
Confidence is our own honest assessment, not a formal uncertainty. Constants that have
been checked against the primary source say so; the ones that have not are the ones to
distrust.

### Calibratable — these carry the model error

| constant | value | units | source / confidence |
|---|---|---|---|
| `ALPHA_DEFAULT` | 1.70e-7 | m²/s | Albumen at cooking temperature. **The calibration knob.** Only the group `tau = R^2/alpha` is identifiable, so radius and diffusivity cannot be fitted separately: geometry is fixed honestly and `alpha` absorbs the model error. Abbasnezhad's measured correlations give albumen `alpha` rising 1.36e-7 (20 °C) → 1.69e-7 (100 °C), and Buay's whole-egg fit to a real thermocouple trace gives 1.6e-7 (1.5-1.8e-7); 1.70e-7 is inside that band, at the fast end. For the reference egg `tau = R^2/alpha = 3340 s`. **Medium-high** — measured band plus kitchen practice, but 4.6% fast against Buay's trace (§7). |
| `ALPHA_REL_SD` | 0.119 | — | Prior width for calibration, chosen so `tau` has sd ~400 s at the reference radius. **Judgement.** |
| `TAU_AIR` | 2030 | s | Lumped `m*c/(h*A)` with `h ~ 15 W/m²K` in still air. **Lowest confidence in the model** — no published carryover curve has been found (§11.3). Carries a wide calibration prior (`tauAirScale`). |
| `H_EFF` | 850 | W/m²K | Natural convection on a sphere (~1100) in series with shell + membranes (~3200). Used for the Biot number. **Known high**: Denys et al. (2003) measured 490 W/m²K at the shell, ~450 effective with their measured shell in series — `Bi ~ 18`, not 34 (§11.2). It enters as a justification rather than a driver, which is the only reason it still stands. |
| `RAMP_R` | 3.0 | — | Hob overshoot ratio; `1/r` is the fraction of full power needed to hold a boil, which measured cooktop studies put near 1/3. **Medium-low.** |
| `TAU_STANDING_SCALE` | 1.0 | — | Multiplier on the pan's loss time constant once the heat is off and the lid is on. The ramp already identifies `tau = m*c/(U*A)`, so this only asks whether it is the *same* constant with the burner off: a lid argues for more than 1, evaporation inflating the ramp's own `tau` argues for less. 1.0 is a refusal to guess, and it reproduces Williams' seventeen-minute method (§7). **Lowest confidence in the standing path** — see §11.3. |

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
| `YOLK_RADIUS_FRAC` | 0.693 | — | Yolk = 33% of egg volume, `(1/3)^(1/3)`. **High** — four independent routes agree (§3), including Abbasnezhad's meshed 1.6 cm yolk sphere. |
| `SIZE_CLASSES` | 48/58/68/76 | g | EU Regulation 589/2008 Art. 4. Labelled in grams deliberately: EU/UK "Large" (63-73 g) is a US "Extra Large", and a US "Large" (57 g) is an EU "Medium". Using names would systematically mis-time for one audience. |

### Kinetics

| constant | value | units | source / confidence |
|---|---|---|---|
| `Z_YOLK` | 4.65 | K | From `Ea = 469 ± 13 kJ/mol` (Vega & Mercadé-Prieto 2011, measured 54-70 °C) at 338 K. Their CI maps to 4.54-4.80 K. **High** — measured, with 338 K inside the data range. |
| `TREF_YOLK_C` | 63 | °C | Reference for the yolk dose integral. Definitional. |
| `Z_WHITE` | 4.97 | K | Ovalbumin, `Ea ~ 480 kJ/mol` at 353 K (Weijers et al. 2003; 430-490 across techniques). **Corrected** from 5.2, which assumed 460. **Medium-high.** |
| `TREF_WHITE_C` | 80 | °C | Definitional. |
| `WHITE_DOSE_TARGET` | 0.05 | min-eq @80 °C | Calibrated so the shortest white-setting cook is ~5.8 min for a fridge-cold reference egg into boiling water, peak inner white ~75 °C. **Calibrated to kitchen practice, not measured.** Powrie & Nakai's ranges (opaque from ~60 °C, soft curd 75 °C, ovalbumin 79-84 °C) bracket it. |
| `YOLK_DOSE_RUNNY` | 0.05 | min-eq @63 °C | Slider floor (~56 °C peak yolk). **Definitional.** |
| `YOLK_DOSE_HARD` | 2000 | min-eq @63 °C | Slider ceiling (~77 °C peak yolk). **Definitional.** For scale, Vega's measured yolk gel point is 67 min-eq @63 °C, i.e. slider 0.68 (§4). |

### Protocol and numerics

| constant | value | units | source / confidence |
|---|---|---|---|
| `T_ICE_BATH_C` | 2 | °C | Ice water. **High.** |
| `T_COLD_TAP_C` | 15 | °C | Varies by season and country; this is a middling mains temperature. Deliberately *not* tied to room temperature: mains water arrives at something nearer ground temperature, usually below the room, though a long run of pipe in a hot summer can beat it. **Low, and it matters little** (§5). |
| `T_ROOM_C` | 20 | °C | **Default** room, not *the* room. Every path that cools toward the room takes `CookSetup.ambient_C`; this is only where that field starts. There is deliberately no input for it — see §9. |
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

### The standing method against Williams' own recipe

Williams describes hard-boiling as: cold water, bring to the boil, remove the heat, lid
on, stand about seventeen minutes, then cool. With `TAU_STANDING_SCALE = 1.0` and an
8-minute boil the model puts that at a peak yolk of **75.6 °C** and a yolk dose just past
this app's *Hard* — and flat: the dose at 20 minutes and at 30 minutes agree to 0.01%.

| time to boil | pan time constant | hardest reachable | standing time for hard |
|---|---|---|---|
| 4 min | 9.9 min | nothing | never sets the white |
| 6 min | 14.8 min | Fudgy | cannot reach hard |
| 8 min | 19.7 min | Hard | 10.1 min |
| 10 min | 24.7 min | Hard | 5.9 min |

Read that table before trusting the method: it is not forgiving in the pan, only in the
clock. It is also a single folk anchor with an unstated pot, which is exactly why
`TAU_STANDING_SCALE` exists.

### Against somebody else's measurements

Everything above checks that the model still reproduces *itself*. These rows check it
against published numbers that nobody here chose. They are regenerated by the same
`npm run validate`.

| source | quantity | published | this model |
|---|---|---|---|
| Buay et al. 2006 | centre of a 27.11 × 21.22 mm egg to 85 °C, 100.5 °C bath | **750 s measured** | 716 s (4.6% fast) |
| Buay et al. 2006 | their own eq. 18 prediction, using their radius convention and `α = 1.6e-7` | 745 s | **745.0 s** |
| Buay et al. 2006 | whole-egg `α` fitted to that trace | 1.6e-7 (1.5-1.8e-7) | 1.70e-7, inside the band |
| Vega & Mercadé-Prieto 2011 | yolk gel point | 67 min-eq @63 °C | slider 0.68 |
| Vega & Mercadé-Prieto 2011 | `Ea` yolk → `z` at 338 K | 469 ± 13 kJ/mol → 4.54-4.80 K | `Z_YOLK` 4.65 |
| Weijers et al. 2003 | `Ea` ovalbumin → `z` at 353 K | ~480 kJ/mol → 4.97 K | `Z_WHITE` 4.97 |
| Denys et al. 2003 | surface coefficient + measured shell in series | 451 W/m²K (Bi 18) | `H_EFF` 850 (Bi 34) |

The Buay row is the single most useful line in this document: a thermocouple in a real
egg, no ramp, no dip, no carryover, straight into boiling water. Reproducing his
published prediction to 0.1 s with our own series solver says `sphere.ts` is right.
Missing his *measured* 750 s by 4.6% says `ALPHA_DEFAULT` is a little fast — which is
expected, since it is also absorbing the Dirichlet and shape errors, but it is the
first honest external error bar the model has. The `H_EFF` row is an open problem, not
a pass: see §11.2.

`PLAN.md` also carries a correction worth repeating: the planning estimate for
counter-resting was 85.3 °C, computed with a model that relaxed the surface from the
*water* temperature. A lumped egg in still air relaxes from its own *volume-average*
temperature. Corrected in `coolingTemperature`, the figure is 76.3 °C. The effect is
still decisive (jammy versus fully set) but smaller than first computed.

---

## 8. Assumptions and limitations

Read this section before trusting a number to better than half a minute.

**The constants were re-derived first, and checked at source afterwards.** During the
initial build the primary literature was not retrieved, and every constant here was
re-derived and cross-validated rather than transcribed. That work stands — the
derivations are in §3 and §4 — but the sources have since been read at first hand, and
the earlier claim that they *could not* be fetched was wrong: most are freely available
(§10 records where). Where a source changed a constant, the constant changed: `Z_WHITE`
is now 4.97, not 5.2. Where a source confirmed an inference, it is now cited as a
measurement rather than an argument: `ALPHA_DEFAULT`, `YOLK_RADIUS_FRAC`, and the
reading of Williams' 0.76 are all now backed by published data (§7).

**Homogeneous sphere, one diffusivity.** There is no separate yolk domain. The yolk has
a higher solids content and is genuinely more insulating than albumen, so expect the
homogeneous model to **under-predict** the time for the yolk centre. Calibration partly
absorbs this into `alpha`, but it absorbs it as an average across the whole cook, not as
a structural correction. An egg is also not a sphere: the equal-volume sphere is a good
approximation for the centre and a worse one near the surface.

**Dirichlet surface in the water, on a Biot number that is probably too high.** The
model clamps the surface to the water temperature. With `H_EFF = 850 W/m²K` the Biot
number is `h*R/k ~ 34` and pure Dirichlet under-predicts cook time by roughly 5%, which
calibration of `alpha` absorbs. But Denys et al. (2003) *measured* the surface
coefficient on intact eggs at 490 W/m²K, and with their measured shell (0.35-0.5 mm at
2.25 W/m·K) in series that is an effective ~450 — `Bi ~ 18`, half of what this model
assumes, and roughly double the Dirichlet error. Their bath was 40-60 °C with gentle
forced circulation, so a rolling boil should be higher; but `H_EFF` is about twice the
only published measurement, and the approximation is less well-bounded than this
section used to claim.

**Convection inside the white is real, and the model has none.** Denys et al. (2004)
found buoyancy-driven flow in liquid albumen (Ra 10⁶-10⁷) strong enough to move the
cold spot off-centre and speed heating noticeably, while the yolk — layered, and
effectively immobilised — stays conduction-only. Vega & Mercadé-Prieto report the same
thing from the other direction: fitting a conduction-only model to a 6X °C cook needs
`α > 2e-7`, well above any measured value, because the white is still liquid and
circulating. In boiling water the white sets within a minute and conduction-only is
sound, which is why the model works. The exposure is **the ramp**: a cold-start cook
spends several minutes below 60 °C with a liquid, convecting white, so the effective
diffusivity early in a cold start is higher than `ALPHA_DEFAULT`. That is also the
phase §1 argues matters most. Do not use this model for sous-vide.
`src/core/sousvide.ts` and `EggTimerCore/SousVide.swift` compute the isothermal limit
regardless, for exactly one purpose: to answer the question in the model's own units,
and let the answer speak for itself. The white's dose target lives at 80 °C, so a 58 °C
bath needs 22 h 43 min of it for a 68 g egg — which both apps report as a start time
yesterday, under a warning saying the white will not set at that temperature whatever
the clock says. Note which part of that answer is load-bearing: the HOLD times depend
only on the bath and the dose targets, so the convection above does not touch them,
while `equilibrate_s` is conduction-only and is too long by an unknown amount. Neither
app puts it on screen.

**The cooling phase is different, and weaker.** In still air `Bi ~ 0.6` and Dirichlet
would be badly wrong, so the cooling phase instead drives the surface along the egg's
own *lumped* decay from its volume-average temperature. That is a different
approximation from the one used during the cook, and it is the **least verified part of
the model**. No published *carryover curve* has been found — egg-centre temperature
against time after removal from the water — though the measurement clearly exists:
Vega & Mercadé-Prieto plunged instrumented eggs into ice-water and recorded the
decrease, without plotting it, and Almonacid et al. (2007) and Sabliov et al. (2002)
both model shell-egg cooling. The qualitative conclusion (counter-resting is nearly adiabatic) is
robust because it depends only on the ratio of two time constants that differ by ~7x,
but the specific 76.3 °C is soft.

**The air cell is unmodelled.** A real egg contains a gas pocket at the blunt end,
typically 2-5% of the volume and growing with age. It is an insulator and it displaces
egg. Expect a small systematic bias that grows with how long the eggs have sat.

**Target temperatures disagree in the literature, and that dominates everything.**
Published "correct" yolk temperatures for a given doneness differ by 3-6 °C between
sources, and the spread survives first-hand checking: Williams uses 63 °C at the yolk
boundary for soft; Omnicalculator uses 65 °C and caps hard at 77 °C; Buay et al.
determined 85 °C at the yolk *centre* for hard by cutting eggs open; Roura et al. found
70 °C by cooking egg in a test tube; Di Lorenzo et al. and Lorig take 65 °C yolk and
85 °C albumen. Some of that is genuine disagreement and some of it is different
criteria at different radii being quoted as though they were the same number. Because
`z ~ 4.65 K`, **a 5 °C disagreement is roughly a tenfold change in
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

1. **Time the boil honestly** — worth up to **4 minutes**. Press the boil button at a
   **full rolling boil**, not at first bubbles. First bubbles are nucleation on the pan
   base at maybe 85-95 °C; tapping there under-measures the ramp by 15-25% and the model
   will under-cook. This is the single most valuable thing you can tell the app, because
   the correct "minutes after boiling" varies by nearly a factor of five with hob power
   alone (§1) — and with the heat off at the boil it is also the *only* measurement of
   your pan's heat capacity (§2.4).
2. **Commit to a cooling protocol and actually do it** — worth **11 °C of peak yolk**,
   which is the difference between jammy and set (§5). This is not a garnish on the
   recipe. "Ice bath" means ice *and* water, in enough volume that it stays cold.
3. **Measure the egg** — worth **2.2 minutes** between a small and an extra-large. A
   kitchen scale beats a ruler on an ovoid. Failing that, a paper strip round the middle
   beats calipers: the app takes weight, girth or width and derives the other two. Size
   class is the fallback, and the labels differ between the EU and the US (which is why
   the app labels them in grams).
4. **Say where the egg came from** — worth **1.2 minutes**. Fridge (4 °C) versus counter
   (20 °C).
5. **Set altitude once** — worth **0.85 minutes** at 2000 m. The app derives the boiling
   point; you do not need to guess a rule of thumb.
6. **Water volume and egg count** — worth **seconds**, unless you turn the heat off.
   Cold eggs entering boiling water cool it, by a straight energy balance over both: four
   62 g fridge eggs into 1 L drops the water 15 °C, into 2 L, 8 °C. Those numbers sound
   alarming and are nearly free, because `TAU_DIP_RECOVERY` puts the water back inside a
   minute and the dose that matters accrues at the end of the cook, not the start. Across
   the whole realistic range — 0.75 to 4 L, one to eight eggs — the cook time moves **22
   seconds**, and the worst corner (eight eggs into 0.75 L) costs 17 s against the
   reference. On a *cold* start there is no dip at all, since the eggs are in the pan
   from the beginning; volume acts only by making the boil take longer, which the app
   measures rather than computes.

   Two caveats in the other direction. `TAU_DIP_RECOVERY = 60 s` is a guess (**Low**
   confidence, §6), and it is the constant that turns those degrees into seconds — on a
   weak hob with eight eggs, recovery could take minutes and the cost would be several
   times larger. And if you kill the heat at the boil, water volume stops being a
   rounding error and becomes the whole cook (§2.4).

### What the app deliberately does not ask

**Room temperature.** The model has an `ambient_C` and uses it properly — the pan starts
there, standing water decays toward it, a counter-rested egg cools toward it — but there
is no input for it, because across a 20 °C swing of kitchen it is worth almost nothing:

| room | hot start, jammy | cold start, jammy | standing for jammy | counter-rested peak yolk |
|---|---|---|---|---|
| 10 °C | 7.36 min | 11.22 min | 3.72 min | 75.94 °C |
| 20 °C | 7.36 min | 10.89 min | 3.20 min | 76.33 °C |
| 30 °C | 7.36 min | 10.52 min | 2.73 min | 76.78 °C |

On the default path — eggs into boiling water, straight into an ice bath — it is worth
*exactly* nothing, to three decimal places, and `tools/validate.ts` checks that it stays
that way. A cold start costs about two seconds per degree. Even counter-resting, where
the room is the thing the egg is cooling toward, moves the peak yolk by 0.04 °C per
degree of room, because the carryover peak happens in the first few minutes while the egg
is still far above the room whatever the room is doing.

Only the standing method is properly sensitive (about three seconds of standing per
degree, and it moves what is reachable at all), and there the app already has the
information: it takes the room from **Egg from** when the user has said the egg was
sitting out, since an egg that has been on the counter *is* at room temperature. A fridge
egg says nothing about the room, so that case keeps the 20 °C default.

**Tap water temperature.** Tempting to tie to the room, and wrong: mains water arrives at
something closer to ground temperature. It keeps its own constant (§6), and §5 shows why
it barely matters anyway — ice and tap differ by 0.6 °C of peak yolk, while the counter
differs by 11.

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
you want `tauAirScale` to mean anything. The app does this for you: after every cook
it asks how the yolk was, and the answer goes into a particle filter
(`src/core/infer.ts`) whose posterior mean is what the next solve uses. On a soft egg it
asks a second question — whether the white was still runny — and only then, because on
anything firmer the model already knows the answer and would learn nothing from it. The
white is the more informative of the two answers about *your eggs* rather than your
taste, because it is scored against a fixed target with no personal offset in front of
it; §11.5 records what that costs. Both apps have a button that forgets everything
learned — and both discard a posterior learned under the old yolk-only model rather
than carrying it forward, because every observation in one was folded under a
likelihood that had nowhere to put the white. The manual equivalent, if you are working
from the core directly, is to nudge `alpha_m2s` down if your eggs come out
consistently underdone and up if they come out consistently overdone, by about 7% per
half-minute of error.

### Running it

```
npm install
npm run build      # tsc
npm test           # node --test
npm run validate   # regenerates the validation table in §7
npm run serve      # static server on :8080
npm run build:site # the deployable tree, in _site/
```

Node version is pinned in `.node-version`, which nvm, fnm and Netlify all read,
so a Netlify build compiles on the same Node the tests ran on. Vercel offers only
20.x, 22.x and 24.x — it does not carry a 26 — so `engines.node` is a range
rather than a pin, and Vercel takes its newest. The range is a statement about
the APIs this uses (`node:test`, ES2022), not a tested claim: 26 is what runs
here and what CI would run.

There is nothing else to configure. `netlify.toml` and `vercel.json` each carry
the two settings their host needs, and the build is `tsc` plus two `cp`s — no
bundler, no runtime dependencies, no environment variables, no secrets.

`src/core/` has zero dependencies, no DOM, no `Date`, no I/O and no `async`. It is plain
interfaces and top-level functions with explicit loops, which is deliberate: it is meant
to port to Swift essentially unchanged.

---

## 10. References

Every source below has now been read at first hand except where marked. `references.bib`
carries the full BibTeX, including the items that turned out to matter but were never
cited in the first draft. The access notes are there because the first build of this
model recorded these as unreachable; they are not.

**Heat transfer in eggs**

- C.D.H. Williams, "The Science of Boiling an Egg", University of Exeter.
  <https://newton.ex.ac.uk/teaching/CDHW/egg/>. Originally *New Scientist*, "The Last
  Word", 4 April 1998. Source of the 0.76 coefficient and of `T_yolk ~ 63 °C` for soft.
  *The host is dead — the page is readable in the Internet Archive.* He gives **no**
  hard-boiled target; the ~70 °C on that page is the greening threshold, not a
  doneness criterion.
- D. Buay, S.K. Foong, D. Kiang, L. Kuppan, V.H. Liew, "How long does it take to boil an
  egg? Revisited", *Eur. J. Phys.* **27**(1):119-131 (2006).
  doi:10.1088/0143-0807/27/1/013. **The most useful source here.** Thermocouple in a
  real egg in a stirred 100.5 °C bath; fitted whole-egg `α = 1.6e-7 m²/s` (1.5-1.8e-7);
  hard-boiled determined experimentally as **85 °C at the yolk centre**; and an explicit
  statement that Williams' 0.76 is the yolk *boundary* criterion against their own
  yolk-*centre* criterion. Validated against in §7.
- P. Roura, J. Fort, J. Saurina, "How long does it take to boil an egg? A simple approach
  to the energy transfer equation", *Eur. J. Phys.* **21**(1):95-100 (2000).
  <https://copernic.udg.edu/QuimFort/EJP_00.pdf> — free. Scaling argument rather than a
  solution; reports their own measurement of `α_white = 1.5 α_water` and
  `α_yolk = 1.1 α_water` (i.e. 2.3e-7 and 1.7e-7), which is *higher* than everyone
  else's and is not used here. Takes 70 °C as the cooking temperature.
- B. Abbasnezhad, N. Hamdami, J.-Y. Monteau, H. Vatankhah, "Numerical modeling of heat
  transfer and pasteurizing value during thermal processing of intact egg",
  *Food Sci. Nutr.* **4**(1):42-49 (2016). doi:10.1002/fsn3.257 — free at PMC4708634.
  Source of the albumen and yolk property correlations used to settle the diffusivity
  question (§11.1), and of the yolk geometry: a **1.6 cm** yolk sphere in a 6 × 4.5 cm
  egg.
- S. Denys, J.G. Pieters, K. Dewettinck, "Computational fluid dynamics analysis of
  combined conductive and convective heat transfer in model eggs", *J. Food Eng.*
  **63**(3):281-290 (2004). Natural convection in liquid albumen; the yolk is
  conduction-only. Shell `k = 2.25 W/m·K`, measured shell thickness 0.35-0.5 mm, yolk
  properties from Romanoff & Romanoff (1949).
- S. Denys, J.G. Pieters, K. Dewettinck, "Combined CFD and experimental approach for
  determination of the surface heat transfer coefficient during thermal processing of
  eggs", *J. Food Sci.* **68**(3):943-951 (2003). **(not read directly)** — the source
  of the measured `h = 490 W/m²K`, quoted via the 2004 paper. Worth getting: `H_EFF`
  turns on it.
- E. Di Lorenzo et al., "Periodic cooking of eggs", *Communications Engineering* **4**
  (2025). <https://www.nature.com/articles/s44172-024-00334-w> — free. Not implemented;
  a different protocol entirely. Source of the "85 °C albumen, 65 °C yolk" pairing.
- M. Lorig, "How to Cook a Soft-Boiled Egg Optimally: A Laplace-Transform Solution of a
  Two-Domain Heat Equation", arXiv:2606.22156 (2026). The closest published two-domain
  treatment — but **check every parameter before adopting any of it**: its Table 1 gives
  a 1.1 cm yolk radius credited to Abbasnezhad (who says 1.6 cm), and `κ_Y = 0.34` and
  `α_W = 1.7e-7` credited to Coimbra (the first is Romanoff's value via Denys; the
  second is not Coimbra's). The method is sound; the sourcing is not.
- A.L. Romanoff, A.J. Romanoff, *The Avian Egg*, Wiley (1949). **(not read directly)** —
  the origin of most egg thermal properties in the food-engineering literature,
  including `k_yolk = 0.337`, `c_p = 3560`, `ρ = 1035`.

**Denaturation kinetics**

- C. Vega, R. Mercadé-Prieto, "Culinary Biophysics: on the Nature of the 6X °C Egg",
  *Food Biophysics* **6**:152-159 (2011). doi:10.1007/s11483-010-9200-1. `Ea = 469 ± 13
  kJ/mol` for yolk gelation over 54-70 °C, hence `z = 4.65 K`; an absolute gelation-time
  Arrhenius fit (§4); and the conclusion that no single "correct" yolk temperature
  exists.
- M. Weijers, P.A. Barneveld, M.A. Cohen Stuart, R.W. Visschers, "Heat-induced
  denaturation and aggregation of ovalbumin at neutral pH described by irreversible
  first-order kinetics", *Protein Science* **12**:2693-2703 (2003). doi:10.1110/ps.03242803
  — free at PMC2366979. `Ea ~ 480 kJ/mol` (430-490), hence `z = 4.97 K`. **This
  corrected a constant.**
- W.D. Powrie, S. Nakai, "Characteristics of edible fluids of animal origin: eggs", in
  *Food Chemistry* 2nd edn (1985). **(not read directly)** — the denaturation
  temperature ranges quoted by Buay et al.: opaque white from ~60 °C, soft curd at
  75 °C, toughening to 87 °C, ovalbumin 79-84 °C.

**Physical properties**

- J.S.R. Coimbra, A.L. Gabas, L.A. Minim, E.E. Garcia Rojas, V.R.N. Telis,
  J. Telis-Romero, "Density, heat capacity and thermal conductivity of liquid egg
  products", *J. Food Eng.* **74**(2):186-190 (2006).
  doi:10.1016/j.jfoodeng.2005.01.043. **(abstract only)** — ρ 1023-1143 kg/m³,
  c_p 2.6-3.7 J/g·K, k 0.4-0.6 W/m·K, measured at or below 38 °C. Widely mis-cited; see
  the Lorig note above.
- D.R. Stull, "Vapor Pressure of Pure Substances", *Ind. Eng. Chem.* **39**(4):517-540
  (1947) — Antoine coefficients for water, as served by the NIST WebBook.
- D.F. Hoyt, "Practical methods of estimating volume and fresh weight of bird eggs",
  *The Auk* **96**(1):73-77 (1979) — free. `V = 0.51·L·B²`, accurate to 2%: the source of
  `EGG_VOLUME_COEFF`.
- T.C. Carter, "The hen's egg: estimation of shell superficial area and egg volume from
  four shell measurements", *Br. Poult. Sci.* **15**:507-511 (1974). **(not read
  directly)** — gives surface *area* as well as volume, which is what a Biot estimate
  actually needs.

**Cooling**

- S. Almonacid, R. Simpson, A. Teixeira, "Heat transfer models for predicting
  *Salmonella enteritidis* in shell eggs through supply chain distribution",
  *J. Food Sci.* **72**(9):E508-E517 (2007). **(not read directly)** — cited by Vega as
  reporting high effective `α` when eggs are cooled.
- C.M. Sabliov, B.E. Farkas, K.M. Keener, P.A. Curtis, "Cooling of shell eggs with
  cryogenic carbon dioxide: a finite element analysis of heat transfer", *LWT* **35**:
  568-574 (2002). **(not read directly)** — the closest published thing to the carryover
  problem, albeit with the wrong coolant.

**Practice, for sanity-checking the outputs**

- Douglas Baldwin, "A Practical Guide to Sous Vide Cooking".
  <https://douglasbaldwin.com/sous-vide.html>
- ChefSteps Egg Calculator. <https://www.chefsteps.com/activities/the-egg-calculator>
- J. Kenji López-Alt, Serious Eats Food Lab, on boiled eggs and peelability.
  <https://www.splendidtable.org/story/2022/11/22/j-kenji-lopezalts-perfect-hard-boiled-eggs>
- Martin Lersch, Khymos, "Towards the perfect soft boiled egg".
  <https://khymos.org/2009/04/09/towards-the-perfect-soft-boiled-egg/>
- Omnicalculator, Ideal Egg Boiling Calculator.
  <https://www.omnicalculator.com/food/egg-boiling> — cited as an example of the
  mis-reading of Williams' 0.76 (§3), not as a source.

**Standards**

- USDA FSIS, High Altitude Cooking.
  <https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/high-altitude-cooking>
- EU Regulation 589/2008 Art. 4 — egg size classes.

---

## 11. Open problems and what to read next

Everything in this section is a known gap, not a hidden one. It is written so that
whoever picks this up next does not have to rediscover it.

### 11.1 Resolved at source

These were open questions in the first draft. The primary literature settled them; the
answers are recorded here rather than deleted, because each one was a plausible error.

1. **Williams' hard-boiled target: there isn't one.** His page gives no hard-boiled
   criterion at all. The 77 °C and 80 °C quoted by derivative calculators trace to
   neither him nor anyone else in the lineage. The published figure is Buay's **85 °C at
   the yolk centre**, determined by cooking eggs to centre temperatures between 77 and
   87 °C and cutting them open. Williams' soft-boiled 63 °C at the yolk boundary stands.

2. **The albumen conductivity/diffusivity inconsistency: temperature, as suspected.**
   Abbasnezhad et al. give albumen `k = 0.0013·T + 0.5125` with a measured `ρ(T)` and
   `c_p = 3800`, i.e. `α` rising from **1.36e-7 at 20 °C to 1.69e-7 at 100 °C**. The
   inference the model was built on turns out to be a measurement. Buay's independent
   whole-egg fit of 1.6e-7 (1.5-1.8e-7) agrees.

3. **The impossible 0.026 W/m·K albumen conductivity is not in Abbasnezhad.** That paper
   gives 0.51-0.64 W/m·K for white and 0.40-0.48 for yolk. The 0.026 came from somewhere
   in the secondary-source layer and can be discarded. The shell's 2.25 W/m·K *is* in
   the paper, credited to Denys et al.

4. **The two-domain paper's geometry is wrong, not its summary.** Lorig's Table 1 really
   does use a 1.1 cm yolk radius in a 2.2 cm egg — 12.5% of the volume — and really does
   credit it to Abbasnezhad, who meshes a **1.6 cm** yolk sphere (17 cm³, ~33% of
   volume, matching `YOLK_RADIUS_FRAC = 0.693`). Two more of his Table 1 entries are
   credited to Coimbra but are not Coimbra's.

5. **Di Lorenzo's targets are 85 °C albumen / 65 °C yolk**, as the model assumed. The
   reversed summary was the summary's error.

### 11.2 Still open

1. **Williams' room-temperature example does not match his own formula.** He prints
   ~3.5 min for a 57 g egg from 21 °C; his stated constants give **3.23 min**. His other
   three examples reproduce exactly (4 °C → 4.53 vs "four and a half"; 47 g → 3.99 vs
   "four"; 67 g → 5.05 vs "five"). So the constants are right and one example is not.
   This is on his own page, in his own words — not a misquote downstream, as previously
   guessed. Unexplained.

2. **`H_EFF = 850 W/m²K` is about twice the only published measurement.** Denys et al.
   (2003) measured 490 W/m²K at the shell surface; in series with their measured shell
   that is ~450 effective, giving `Bi ~ 18` rather than 34. Their conditions were gentler
   than a rolling boil, so the truth is somewhere between, but the Dirichlet error is
   larger than §8 used to claim. The honest fix is a Robin boundary condition (§11.4).

   Two things about this were assertions until September 2026 and are now measured
   (`npm run identifiability`, `tools/identifiability.ts`):

   - **`H_EFF` is not in the simulation path at all.** `sphere.ts` imports `MODE_COUNT`
     and `K_EGG` and nothing else; the surface is clamped. The constant appears only in
     `biotNumber`, one test, one validation diagnostic, and comments justifying that
     clamp. **Changing the number moves no cook time.** That is worth stating plainly
     because "H_EFF is known high" reads like a calibration that is merely wrong, rather
     than a figure the model never consults.
   - **"Simply re-absorbed by `ALPHA_DEFAULT`" is not quite true, and the correction
     does not help.** With one observable it is exactly true. With two — the yolk
     criterion at `r = 0` and the white at `0.693 R` — the parameters separate, because
     `α` hits the centre much harder than the near-surface while `h` delays both about
     equally:

     | ∂log₁₀(dose)/∂log(·) | yolk | white | white/yolk |
     |---|---|---|---|
     | `α` | 12.704 | 5.903 | 0.465 |
     | `h` | 0.665 | 0.642 | 0.965 |

     The two directions sit **19° apart**, not 0. But `h`'s signal is **15× weaker**
     (`\|h\| / \|α\| = 0.066`), and ordinal feedback carries 1–2 bits per egg, so this
     is not learnable from "how was it?" in any realistic number of breakfasts. Worse,
     the effect is self-defeating: lowering `h` toward the Denys value raises its
     influence only to 0.119 and the angle to 20.3°. **`h` becomes learnable only in a
     regime the egg is not in** — at `Bi` between 18 and 35 the surface really is nearly
     clamped, which is exactly why Dirichlet was defensible. §11.3's thermocouple is
     worth more here than a hundred eggs, and it is not close.

3. **Yolk diffusivity varies by 1.7× across the literature.** Romanoff & Romanoff (via
   Denys) imply `α_yolk = 9.1e-8`; Vega quotes 1.22e-7; Abbasnezhad's correlation gives
   1.28-1.52e-7. The model uses a single `α` for the whole egg, so this feeds directly
   into §8's homogeneous-sphere bias — and the bias may be bigger than "calibration
   partly absorbs this" suggests.

4. **Lysozyme denaturation is reported anywhere from 67 to 77.5 °C.** Genuinely pH- and
   ionic-strength dependent, and egg white pH rises from ~7.6 to ~9.2 with age, so some
   of the spread is real. Not used directly, but it bears on where "the white is set"
   should sit.

### 11.3 Measurements that still appear not to exist

1. **A carryover curve: egg-centre temperature against time *after* removal from the
   water**, under an ice bath, a cold tap, and resting on the counter. This remains the
   weakest constant in the model (`TAU_AIR`) and it drives the app's most opinionated
   behaviour — refusing soft doneness when the egg will be rested. Two leads: Vega &
   Mercadé-Prieto instrumented yolks and plunged them into ice-water, recording the
   decrease but not publishing the curve; Sabliov et al. (2002) and Almonacid et al.
   (2007) both model shell-egg cooling, the first cryogenically. A thermocouple through
   the blunt end and a datalogger would still settle it in an afternoon.

2. **Convective heat transfer coefficient at a rolling boil.** Denys et al. measured 490
   W/m²K under gentle forced circulation at 40-60 °C. Nobody appears to have measured it
   with bubble agitation at 100 °C, which is the only condition this app cares about.

3. **A logged temperature-vs-time curve for a domestic pot of water**, heating *and*
   cooling. `RAMP_R = 3.0` comes from cooktop *efficiency* studies ("about a third of
   full burner power holds a boil"), not from a measured heating curve, and
   `TAU_STANDING_SCALE = 1.0` asserts without evidence that a covered pan with the burner
   off loses heat on the same time constant as one being heated. The second is the
   weaker claim of the two: evaporation dominates the loss at the boil and stops being
   replenished once the lid is on, so the real standing constant is probably longer, and
   the app probably refuses the standing method more often than it should. One
   thermocouple, one pot, forty minutes — heat it, log the boil time, kill the heat, keep
   logging — would settle both constants at once and beat every source found.

### 11.4 Modelling work deliberately not done

- **Two concentric domains** with distinct yolk and albumen diffusivities. This is the
  known structural bias (§8) and the most principled fix; §11.2(3) makes it more urgent
  than it looked. Lorig's Laplace-transform solution is the closest published approach —
  the method, not the parameters (§11.1(4)).
- **A proper Robin boundary condition** during cooking, with eigenvalues from
  `1 - mu·cot(mu) = Bi`, instead of clamping the surface. At `Bi ~ 18` rather than 34
  this matters more than first thought. It requires re-projecting the modal state onto a
  new basis when the medium changes, which is why it was not attempted for v1.

  Queued as a **correctness** fix and not as an instrument. §11.2(2) now measures what
  it would buy: `h` is separable from `α` in principle but 15× too weak to learn from
  feedback, so adding it as a fourth calibrated parameter would add a dimension the data
  cannot move. The reason to do this is that Dirichlet under-predicts cook time and that
  bias currently sits inside `ALPHA_DEFAULT` — not that anyone will ever fit `h` from
  eating eggs. `tools/identifiability.ts` already carries working Robin eigenmodes,
  cross-checked against `seriesTheta` to 3e-7, so the hard part of the maths is done.
- **Convection in the liquid white during the ramp** (§8). Not tractable in this
  architecture; the practical mitigation is to keep `ALPHA_DEFAULT` calibrated against
  whole cooks rather than against steady-state property data.
- **Ovoid geometry** rather than an equal-volume sphere. Note that Buay's equivalent
  radius `2ab/(b + βa)` preserves surface-to-volume rather than volume, and is 1% smaller
  than ours for the same egg.
- **The air cell**, as a lateral insulating cap that grows with egg age.
- **Egg age** generally — it shifts albumen pH, peel quality and air-cell size together,
  and would be a single useful input.

### 11.5 Known software gaps

- **`tauAirScale` is only identifiable if you vary the cooling method.** Cook every egg
  with an ice bath and it will sit at its prior forever — which is correct behaviour, not
  a bug, but it means the carryover model never improves unless you deliberately mix.
- **The white channel is new, and its weight is a judgement rather than a measurement.**
  Feedback used to be attributed entirely to the yolk: `predictedFeedback` compared only
  the delivered *yolk* dose against the yolk target, so an egg whose **white** came out
  runny, reported honestly as "too soft", shifted `alpha` and the taste offset along the
  wrong axis. It now has two channels (`src/core/infer.ts`): the yolk answer against the
  yolk target, and a "runny / set" answer about the white against the fixed
  `WHITE_DOSE_TARGET`, sampled at `YOLK_RADIUS_FRAC` rather than at the centre. Because
  the taste offset lives on the yolk axis only, the white has no free parameter to absorb
  it and therefore constrains `alpha` directly — which is the hope for the confound in
  the next bullet. **Caveat, and it is the reason the channel is deliberately weak:** the
  white sits nearer the surface, so it is the more sensitive of the two to the `H_EFF`
  error in §11.2, and a white answer partly measures that error and blames `alpha`. One
  white answer is therefore worth a likelihood ratio of 1.9 against the yolk's 8 — about
  a third of the evidence. That discount, and the 0.26-decade band around the white's
  threshold, are the two numbers here most likely to want revisiting once real eggs have
  gone through both channels. Whether the channel actually breaks the confound is an
  empirical question that has not been answered yet.
  See [issue #1](https://github.com/danmackinlay/actual_egg_timer/issues/1).
- **`alpha` and the taste offset are confounded at a fixed protocol** in the yolk channel.
  The *combination* is identified — the suggested time converges — but the individual
  parameters are not. Varying egg size or cooling method separates them, and the white
  channel above is an attempt to separate them without asking anyone to vary anything.
- **The cooling step is a flat three minutes** on both apps, regardless of egg size,
  cooling medium or how long the cook was. It happens to match the model's own
  `peakYolkTime_s` for an ice bath and a cold tap, which is why it has never looked
  wrong, but the solver already reports that number and the countdown could be derived
  from it rather than asserted.
- **`predictCookTime` ships nowhere.** `src/core/infer.ts` computes the posterior
  predictive cook time as a median and an 80% credible interval, and its own docstring
  says the interval is what makes calibration legible without a settings screen. Both
  apps show a single ±% spread instead. The function is fixtured and conformance-tested,
  so it works; nothing calls it.
- **Neither app has tests of its own above the shared layer.** What both apps decide —
  snapping, refusals, texture bands, the calibration grid, the phase timeline — now lives
  in `src/core/policy.ts` and is conformance-tested, which is where all three of the
  real-egg bugs in `PLAN.md` would have been caught. What remains above it is view code:
  DOM writes and SwiftUI bodies, tested by driving the apps.

- **The Swift port is complete.** `ios/EggTimerCore` carries every module in `src/core/`,
  `sousvide.ts` included, and is held to this implementation by a
  conformance suite over generated fixtures (`npm run conformance`). The pure functions
  agree to 1e-12 and 13 whole cooks — times, peak temperatures, doses and the
  reachability verdicts — to the same, where the measured disagreement is 7e-15. The
  calibration is pinned harder still: the fixtures carry every particle and every weight
  of an eleven-observation run — both channels, each white answer folded straight after the
  yolk answer for the same egg — because a wrong random number generator would otherwise
  produce a different but entirely plausible posterior. The iOS app carries every input
  this document describes, schedules its alarm at absolute fire dates with a
  time-sensitive interruption level, shows the countdown on the Lock Screen and in the
  Dynamic Island, and asks how the yolk was after each egg — and how the white was when
  that answer would move something. See `ios/README.md`.

### 11.6 Sources that returned fabricated citations

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
