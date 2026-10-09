# Actual Egg Timer

*Time eggs, not minutes.*

A boiled-egg timer that computes the time from physics instead of reciting it: transient
heat conduction in a sphere, coupled to Arrhenius denaturation kinetics, with the pan
ramp and the cooling step treated as part of the cook.

**Alpha** (version `0.3.0-alpha.1`): no stability is promised. Anything may
change between versions, including what the app remembers of your cooks.

It is a static web app with zero runtime dependencies. All of the physics lives in
`src/core/`, which is pure numerics — no DOM, no I/O, no clock — so it can be tested
headlessly and ported to Swift more or less mechanically.

This document exists so that you can **check the model rather than trust it**. Every
number quoted below is either derived here or reproducible from the code, and the
places where the model is weak are named as such.

If you are extending this, start with **[§11 Open problems and what to read
next](#11-open-problems-and-what-to-read-next)** — the unresolved discrepancies, the
measurements that appear not to exist, and the sources worth checking at first hand.

By Dan MacKinlay (<https://danmackinlay.name>).

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
egg's heat content, which on the counter Newton's law at the shell draws down (§8).

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

and `tau_pan = m*c/(U*A)`: the heat the water holds over the rate the pan leaks it. The
heat held goes as the volume, and the surface it leaks through as `V^(2/3)` for pans of
the same shape, so

```
tau_pan(V) = TAU_STANDING_REF_S * (V / 2 L)^(1/3),   TAU_STANDING_REF_S = 480 / ln(1.5) = 1183.8 s
```

That is 15.7 min at 1 L, 19.7 min at 2 L, 22.6 min at 3 L and 24.9 min at 4 L. The
reference is pinned to Williams' seventeen-minute method (§7) with an 8-minute boil in
2 L, so that one case is exactly what it was before; the exponent is a judgement (§6).

It used to be read off the time to boil instead. The ramp's `tau` is the same quantity,
and `t_boil = tau * ln(r/(r-1))`, so a timed boil seemed to give it for free. It does
not, because `r` is the **hob** (burner power over losses), not the pan: a hob twice as
strong as assumed boils in `tau * ln(1.2)`, and the app read that as a pan cooling 2.2
times too fast; a weak one, 2.7 times too slow. A hot start never times the boil at all,
so it cooled at the rate of whatever pan was remembered. How fast a lidded pan cools with
the burner off depends on the water and the pan, so the hob is out of it now, and the
time to boil shapes the cold-start ramp and nothing else.

Two things fall out that are worth more than the feature itself:

- **The dose saturates.** The water is falling, so past about 12 minutes of standing
  nothing further happens: 20 minutes and 30 minutes give a yolk within 0.01% of the same
  dose. That is why a folk method can say "about seventeen minutes" and be right.
- **The pan decides, not the clock.** On a hob that boils 2 L in 8 minutes, 2 L reaches
  hard in 10 minutes of standing and 4 L in two and a half, while 1 L cannot get past
  fudgy. Four fridge eggs lowered into a litre at the boil, heat off, never set the white
  at all, at any doneness, because the water falls past what the white needs while the
  egg is still in it. The app refuses the settings it cannot deliver rather than printing
  a time that will not work (§7). Both refusals are new failure modes: held at the boil,
  the dose only grows, so the only way to miss was ever from the soft end.

`TAU_STANDING_SCALE` (1.0) holds open what the volume cannot see: the lid, the pan's
shape and material, and evaporation. See §6 and §11.3.

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
| cooling on the counter | `m*c/(h*A)` with `h = H_AIR = 15 W/m²K` (`airTimeConstant`) | 1864 s |

Still air is **~5.5x slower at removing heat than the egg's slowest internal mode is at
redistributing it**, so a rested egg evens out while it cools. Slower is not never,
though: by the time the yolk peaks, the counter has drawn the egg's mean temperature down
by 13 °C — 6.2 to free convection, 5.6 to radiation, and 1.2 to the water on the shell,
which flashes off in the first few seconds. Water is the opposite — an ice bath or a cold
tap is effectively Dirichlet, pulling the surface to the bath temperature immediately and
intercepting the carryover.

Here is the same cook — identical 7.4 minutes in the water, so the egg is in an identical
state at the pull, **48.5 °C at the yolk centre in all three cases** — diverging purely
on what happens afterwards:

| cooling | peak yolk (°C) | rise after the pull | peak reached |
|---|---|---|---|
| ice bath | 65.0 | +16.5 | ~3 min after pull |
| cold tap | 65.6 | +17.1 | ~3 min after pull |
| **counter (still air)** | **75.3** | **+26.8** | ~7 min after pull |
| insulated (the ceiling) | 83.9 | +35.4 | never quite |

The last row is a perfectly insulated egg, the true adiabatic limit, where the centre
simply reaches the mean temperature the egg left the water with. The counter takes 8.6 °C
of that and the ice bath 19. **Still air is slow cooling, not a lid**, and because it is
cooling, how fast it cools matters: the kitchen's multiplier at x0.70 or x1.42
(`tauAirScale`, §9; held at 1.0 by the app) moves this peak by 1.1-1.2 °C. So the counter is not guessed. It is
textbook heat transfer — free convection from a sphere and radiation from the shell
(`H_AIR`, §6), the latent heat of the water the egg carries out (`WET_SHELL_KG_M2`), and
Newton's law applied at the shell itself rather than at the egg's mean (§8). An
independent finite-volume solution with `h` worked out afresh from the shell's
temperature at every step agrees with it to 0.25 °C of peak yolk, from 48 to 76 g and
4.9 to 12 minutes (`LOGBOOK.md`, 3 October 2026).

### The consequence, stated plainly

**Soft doneness is unreachable if you rest the egg on the counter.** Even the shortest
cook that sets the white (4.9 min, with counter resting) carries the yolk to 64.9 °C.
There is no cook time that produces a soft yolk and a set white in that protocol. The
solver reports this honestly: `solveCookTime` returns `reachable: false` and a
`softestLevel` of 0.53 — between "jammy" and "fudgy" — and the UI stripes out everything
below it and snaps the slider there, rather than returning a time it cannot deliver.

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
| `H_EFF` | 850 | W/m²K | Natural convection on a sphere (~1100) in series with shell + membranes (~3200). Used for the Biot number. **Known high**: Denys et al. (2003) measured 490 W/m²K at the shell, ~450 effective with their measured shell in series — `Bi ~ 18`, not 34 (§11.2). It enters as a justification rather than a driver, which is the only reason it still stands. |
| `RAMP_R` | 3.0 | — | Hob overshoot ratio; `1/r` is the fraction of full power needed to hold a boil, which measured cooktop studies put near 1/3. Shapes the cold-start ramp and nothing else: it describes the hob, which is why the heat-off pan no longer goes through it (§2.4). **Medium-low.** |
| `TAU_STANDING_REF_S` | 1183.8 | s | The heat-off, lid-on pan's loss time constant at 2 L: `480 / ln(1.5)`, what the retired boil-time rule gave for an 8-minute boil. **Anchored, not measured** — pinned so Williams' seventeen-minute method (§7) is unchanged by construction. One folk recipe with an unstated pot. |
| `STANDING_VOLUME_EXPONENT` | 1/3 | — | `tau_pan ~ V^(1/3)`: heat held goes as the volume, the leaking surface as `V^(2/3)` for pans of the same shape. **Judgement.** Physics for the direction and rough size; the exponent is unvalidated, and a wide pan breaks the "same shape" part. `npm run validate` prints it at 1-4 L beside the old rule so the disagreement is on the page. |
| `TAU_STANDING_SCALE` | 1.0 | — | Multiplier on `TAU_STANDING_REF_S`, holding open what the volume cannot see: the lid, the pan's shape and material, and evaporation, which is not Newtonian near the boil. 1.0 keeps the Williams anchor. A per-cook scale learned from standing cooks is planned, not built. **Lowest confidence in the standing path** — see §11.3. |

### Physical properties

| constant | value | units | source / confidence |
|---|---|---|---|
| `K_EGG` | 0.60 | W/m·K | Egg contents at cooking temperature, albumen-dominated (Coimbra et al. 2006). Used only for the Biot number. **Medium-high.** |
| `C_EGG` | 3200 | J/kg·K | Whole egg (Coimbra et al. 2006). **Medium-high.** |
| `C_WATER` | 4186 | J/kg·K | Standard. **High.** |
| `RHO_EGG` | 1100 | kg/m³ | Whole egg including shell; specific gravity 1.07-1.10. **High.** |
| `H_AIR` | 15 | W/m²K | The shell of an egg resting in still room air: free convection from a sphere (Churchill 1983, `Nu = 2 + 0.589 Ra^(1/4) / [1 + (0.469/Pr)^(9/16)]^(4/9)`), 7.3-8.4 W/m²K for a 48 mm egg with the shell at 60-100 °C in a 20 °C room, plus radiation at emissivity 0.93, 6.5-7.9. The sum is 13.8-16.3; a constant 15 reproduces the temperature-dependent sum to 0.25 °C of peak yolk. Sets the counter's time constant `m*c/(h*A)` per egg (`airTimeConstant`, 1864 s for the reference egg), which the kitchen's `tauAirScale` (§9) multiplies. **High for still air** — textbook heat transfer, which needs no egg-specific measurement; a draught, an extractor fan or an egg cup is the kitchen, not the physics. |
| `WET_SHELL_KG_M2` | 0.015 | kg/m² | The water film an egg carries out of the pan, ~15 µm, 0.1 g on the reference egg: a Landau-Levich film at a spoon's pace, and Jeffreys' gravity drainage `sqrt(nu*x/(g*t))` after a second or two, both say 15-30 µm. It flashes off in under ten seconds and costs the reference egg 1.2 °C of mean temperature (`wetShellDrop_C`), 0.7 °C of peak yolk. **Medium** — film physics, not a weighing; 7-30 µm moves the reference peak by +0.4 to -0.7 °C. A scale reading to 0.01 g would settle it. |
| `LATENT_HEAT_WATER` | 2.27e6 | J/kg | Water at 90-100 °C, where the film evaporates. **High.** |

### Geometry

| constant | value | units | source / confidence |
|---|---|---|---|
| `EGG_VOLUME_COEFF` | 0.51 | — | `V = k_v * L * B^2` (Hoyt 1979). The ovoid taper removes ~2.5% from a prolate spheroid's `pi/6 = 0.5236`. **High.** |
| `EGG_LENGTH_RATIO` | 1.35 | — | `L/B`; shape index `100*B/L ~ 74`. **Medium** — varies by breed and bird age. |
| `YOLK_RADIUS_FRAC` | 0.693 | — | Yolk = 33% of egg volume, `(1/3)^(1/3)`. **High** — four independent routes agree (§3), including Abbasnezhad's meshed 1.6 cm yolk sphere. |
| `SIZE_CLASSES` | 48/58/68/76 | g | EU Regulation 589/2008 Art. 4. Every region except `US`. Labelled in grams deliberately: EU/UK "Large" (63-73 g) is a US "Extra Large", and a US "Large" (56.7-63.8 g) is mostly an EU "Medium". Using one table's names for both would systematically mis-time for one audience, so each region gets its own table (`sizeClassesFor`), labelled by name with the mass beside it. |
| `US_SIZE_CLASSES` | 46.1/53.2/60.2/67.3/74 | g | USDA carton classes, region `US` only. USDA sets a minimum net weight per dozen (18/21/24/27/30 oz), so a class runs from its own minimum to the next one's; the value is the midpoint, per egg. Jammy, from the fridge into boiling water, an EU Large cooks 34 s longer than a US Large, so this is not cosmetic. **High** for Small to Extra large; **low** for Jumbo, which has no ceiling. The table follows the region (`sizeClassesFor`), not the language or the units, and a stored class keeps its name when the region changes (`carrySizeIndex`). |

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

---

## 7. Validation

`npm run validate` runs these checks against the current code
(`tools/validate.ts`) and prints this table, then the cold-start, carryover,
slider, room, pan and altitude tables and the external comparisons below. The
reference egg is 43.5 mm across, about 62.3 g (not the app's 68 g EU Large),
fridge-cold at 4 °C, into boiling water, then an ice bath, jammy (slider 0.41),
unless a row says otherwise. As of 29 September 2026, all 28 pass:

| check | expected | computed | tolerance | status |
|---|---|---|---|---|
| jammy, fridge 4 C, sea level | 7.36 min | 7.37 min | ±0.3 min | PASS |
| jammy, room temp 21 C | 6.23 min | 6.23 min | ±0.3 min | PASS |
| jammy, fridge, 2000 m | 8.21 min | 8.21 min | ±0.3 min | PASS |
| jammy, 48 g egg | 6.23 min | 6.23 min | ±0.3 min | PASS |
| jammy, 58 g egg | 7.03 min | 7.03 min | ±0.3 min | PASS |
| jammy, 68 g egg | 7.78 min | 7.79 min | ±0.3 min | PASS |
| jammy, 76 g egg | 8.35 min | 8.36 min | ±0.3 min | PASS |
| cold start, 4 min ramp: after boiling | 4.90 min | 4.94 min | ±0.3 min | PASS |
| cold start, 8 min ramp: after boiling | 2.90 min | 2.89 min | ±0.3 min | PASS |
| cold start, 12 min ramp: after boiling | 1.00 min | 1.05 min | ±0.3 min | PASS |
| Denver 1609 m hard-boiled vs sea level | 12.00 % | 12.23 % | ±3 % | PASS |
| carryover peak yolk, 7.4 min cook, ice | 65.00 C | 65.04 C | ±0.5 C | PASS |
| carryover peak yolk, 7.4 min cook, tap | 65.60 C | 65.56 C | ±0.5 C | PASS |
| carryover peak yolk, 7.4 min cook, counter | 75.30 C | 75.28 C | ±0.5 C | PASS |
| insulated ceiling, 7.4 min cook (mean temperature at the pull) | 83.90 C | 83.90 C | ±0.5 C | PASS |
| T_b(h) vs 100 - h/300, 0-5000 m (worst case) | 0.00 C | 0.03 C | ±0.05 C | PASS |
| room temperature is inert on a hot start into an ice bath | 0.00 min | 0.00 min | ±0.001 min | PASS |
| Williams' standing method: 17 min, peak yolk | 75.60 C | 75.60 C | ±1 C | PASS |
| Williams' standing method: 17 min reaches hard | 1.00 | 1.00 | ±0 | PASS |
| standing dose saturates: 20 min vs 30 min | 0.00 % | 0.01 % | ±1 % | PASS |
| pan time constant at 2 L (1183.8 s) is the old rule's at an 8-minute boil | 1183.83 s | 1183.83 s | ±1e-9 s | PASS |
| a 1 L pan cannot stand its way to hard | 1.00 | 1.00 | ±0 | PASS |
| Williams prefactor from his rho, c, K | 0.45 min/g^(2/3) | 0.45 min/g^(2/3) | ±0.002 min/g^(2/3) | PASS |
| Williams' worked example: 57 g, 4 C, yolk 63 C | 4.50 min | 4.53 min | ±0.1 min | PASS |
| Buay 2006 fig 6 vs their published prediction | 745.00 s | 744.95 s | ±10 s | PASS |
| Buay 2006 measured 750 s vs our defaults | 750.00 s | 715.60 s | ±45 s | PASS |
| Vega 2011 yolk gel point as a slider position | 0.68 | 0.68 | ±0.06 | PASS |
| Z_YOLK from Ea = 469 kJ/mol at 338 K | 4.65 K | 4.67 K | ±0.15 K | PASS |
| Z_WHITE from Ea = 480 kJ/mol at 353 K | 4.97 K | 4.97 K | ±0.05 K | PASS |

### The standing method against Williams' own recipe

Williams describes hard-boiling as: cold water, bring to the boil, remove the heat, lid
on, stand about seventeen minutes, then cool. With an 8-minute boil in 2 L the model puts
that at a peak yolk of **75.6 °C** and a yolk dose just past this app's *Hard* — and flat:
the dose at 20 minutes and at 30 minutes agree to 0.01%. That case is the anchor for the
pan's time constant, so it holds by construction; what the check guards is everything
else in the path.

The pan's time constant comes from the water volume. The table sets it beside what the
old rule, which read it off the time to boil, gave on a hob that boils 2 L in 8 minutes.
For a fixed hob the boil time is proportional to the heat capacity, so the old rule grew
linearly with the water, where a pan's losses grow with its surface:

| water | pan time constant | typical hob boils it in | old rule gave | old / new | hardest reachable (cold start) | standing time for hard |
|---|---|---|---|---|---|---|
| 1 L | 15.7 min | 4 min | 9.9 min | 0.63x | Fudgy | cannot reach hard |
| 2 L | 19.7 min | 8 min | 19.7 min | 1.00x | Hard | 10.1 min |
| 3 L | 22.6 min | 12 min | 29.6 min | 1.31x | Hard | 4.6 min |
| 4 L | 24.9 min | 16 min | 39.5 min | 1.59x | Hard | 2.5 min |

Read that table before trusting the method: it is not forgiving in the pan, only in the
clock. It is also a single folk anchor with an unstated pot and a judged exponent, which
is exactly why `TAU_STANDING_SCALE` exists.

**What moved when the rule changed** (27 September 2026). Standing time after the boil,
cold start, the 62 g reference egg from the fridge, four eggs, ice bath; old → new:

| hob | doneness | 1 L | 2 L | 3 L | 4 L |
|---|---|---|---|---|---|
| boils 2 L in 8 min | jammy | white never set → 6:42 | 3:13, unchanged | 1:04 → 1:05 | pulled 0:42 before the boil, unchanged |
| boils 2 L in 8 min | hard | white never set → cannot reach (0.66) | 10:13, unchanged | 4:29 → 4:44 | 2:29 → 2:34 |
| boils 2 L in 4 min | jammy | white never sets, unchanged | white never set → 6:09 | 4:52 → 4:27 | 3:13 → 3:09 |
| boils 2 L in 4 min | hard | white never sets, unchanged | white never set → cannot reach (0.81) | cannot reach (0.76 → 0.999) | 10:13 → 7:52 |
| 8 min at every volume (an unmeasured pan) | hard | 10:13 → cannot reach (0.91) | 10:13, unchanged | 10:13 → 8:26 | 10:13 → 7:52 |

On a measured typical hob the move is small, because the two rules cross at the default
pan and the ramp does most of the work in a big one. The fast hob is where the old rule
was wrong: it read a strong burner as a small pan and refused cooks that work. The last
row is the app before any boil has been timed, when every volume was guessed at the same
8 minutes and the old rule therefore gave every pan the same cooling; now a bigger pan
holds its heat longer. On a hot start with four fridge eggs the white never sets at 1-4 L
under either rule, except that the old rule, on a measured typical hob, let 3 L and 4 L
through (4 L jammy in 9:13); the new one does not.

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

`LOGBOOK.md` (29 September 2026, the planning phase's targets) carries a correction
worth repeating: the planning estimate for
counter-resting was 85.3 °C, computed with a model that relaxed the surface from the
*water* temperature. A lumped egg in still air relaxes from its own *volume-average*
temperature. Corrected in `coolingTemperature`, the figure was 76.3 °C. On 3 October 2026
the counter was worked from first principles (§8): Newton's law at the shell rather than
at the mean, the time constant from each egg, and the latent heat of the wet shell. It
is now 75.3 °C. The effect is still decisive (jammy versus fully set) but smaller than
first computed.

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
yesterday, under a warning that at that temperature the white takes most of a day to
set, if it sets at all, and that the model is not to be trusted below 60 °C. Note which part of that answer is load-bearing: the HOLD times depend
only on the bath and the dose targets, so the convection above does not touch them,
while `equilibrate_s` is conduction-only and is too long by an unknown amount. Neither
app puts it on screen.

**The cooling phase on the counter has a boundary of its own.** In
still air `Bi = h*R/k ~ 0.6`: the shell is neither clamped at the room's temperature
(Dirichlet would be badly wrong) nor at the egg's mean (a lumped body). So the
counter solves for the shell temperature each step from Newton's law at the shell
itself, `-k dT/dr = h (Ts - Ta)`, written as the heat balance it implies on the whole
egg (`robinSurface` in `sphere.ts`): the egg's mean falls by exactly what the shell sends
out, and the shell starts where the water left it, hot while the outer white's heat is
still arriving. It needs no change of basis, and it reproduces the closed-form Robin
series to 0.02 °C (`test/core.test.ts` 17a). `h` is textbook: free convection from a
sphere plus radiation, 15 W/m²K over the shell temperatures that matter (§6). The water
on the shell evaporates in seconds, tens of times faster than convection takes heat, and
its latent heat is withdrawn over `TAU_PLUNGE`.

Until 3 October 2026 the counter drove the surface along a lumped exponential from the
egg's mean, with one fixed 2030 s time constant for every egg and a dry shell. Against
an independent finite-volume solution that was between 0.7 °C too cold and 0.8 °C too
hot in peak yolk, depending on the cook, before the wet shell's 0.5-0.8 °C; together, up
to 1.5 °C too hot. Now it is within 0.25 °C everywhere tried. What remains open is not
the physics but the kitchen, which `tauAirScale` would carry (the app holds it at 1.0,
§9): a draught of 0.3 m/s takes
0.6 °C off the reference peak and 1 m/s takes 1.7; a stone counter may conduct more
through the contact than wood, up to 0.8 °C at a generous estimate; an egg cup or a tea
towel slows it. The air cell (below), and the egg's own water leaving through the
shell (about 2% of the loss), are left out.

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
   alone (§1). It is only ever the length of a cold start's ramp: with the heat off, how
   fast the pan cools comes from the water volume, not from the boil (§2.4).
2. **Commit to a cooling protocol and actually do it** — worth **11 °C of peak yolk**,
   which is the difference between jammy and set (§5). This is not a garnish on the
   recipe. "Ice bath" means ice *and* water, in enough volume that it stays cold.
3. **Measure the egg** — worth **2.2 minutes** between a small and an extra-large. A
   kitchen scale beats a ruler on an ovoid. Failing that, a paper strip round the middle
   beats calipers: the web app takes weight, girth or width and derives the other two
   (the iOS app takes weight only). Size
   class is the fallback, and the classes differ between the EU and the US (which is why
   the app picks the table by region and shows the mass beside each name).
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
   from the beginning; held at the boil, volume acts only by making the boil take longer,
   which the app measures rather than computes.

   Two caveats in the other direction. `TAU_DIP_RECOVERY = 60 s` is a guess (**Low**
   confidence, §6), and it is the constant that turns those degrees into seconds — on a
   weak hob with eight eggs, recovery could take minutes and the cost would be several
   times larger. And if you kill the heat at the boil, water volume stops being a
   rounding error and becomes the whole cook: it is what sets how fast the pan cools
   (§2.4), so measure it.

### What the app deliberately does not ask

**Room temperature.** The model has an `ambient_C` and uses it properly — the pan starts
there, standing water decays toward it, a counter-rested egg cools toward it — but there
is no input for it, because across a 20 °C swing of kitchen it is worth almost nothing:

| room | hot start, jammy | cold start, jammy | standing for jammy | counter-rested peak yolk |
|---|---|---|---|---|
| 10 °C | 7.37 min | 11.23 min | 3.72 min | 74.77 °C |
| 20 °C | 7.37 min | 10.89 min | 3.21 min | 75.28 °C |
| 30 °C | 7.37 min | 10.53 min | 2.74 min | 75.85 °C |

On the default path — eggs into boiling water, straight into an ice bath — it is worth
*exactly* nothing, to three decimal places, and `tools/validate.ts` checks that it stays
that way. A cold start costs about two seconds per degree. Even counter-resting, where
the room is the thing the egg is cooling toward, moves the peak yolk by 0.05 °C per
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
differs by 10.

Keep those fixed and the same setting will give you the same egg. Change one and the
app will tell you what it costs.

### Calibrating against your own eggs

One physical parameter is learned, not asserted:

- `alpha_m2s` — absorbs everything about *how fast heat gets to the middle*: your eggs'
  composition, the shape error, the Dirichlet approximation, the yolk's extra
  insulation.

A second, `tauAirScale` — a multiplier on the counter's time constant
(`airTimeConstant`, from `H_AIR`), absorbing what still air on a counter does not
describe: a draught, an extractor fan, a stone counter, an egg cup — is **held at 1.0**
from 0.5 (`DECISIONS.md` 95). Only cooks rested on the counter could inform it, every
dose grid is built at one value of it, and their answers mostly teach `alpha` and the
taste offset, so learning it properly would cost a third grid axis for little. The tools
(`npm run probe`, `npm run rank`) still vary it to show what it would move.

To calibrate: cook eggs, and after each one record whether the result was softer or
harder than you asked for. Ordinal feedback is enough — you do not need a thermocouple,
and a judgement of "too soft" is far more reliable than a guess at a temperature. Vary
one thing at a time. The app does this for you: after every cook
it asks how the yolk was, and the answer goes into a particle filter
(`src/core/infer.ts`); from the first egg on, the next time is chosen over that whole
posterior, not its mean (`src/core/decide.ts`, INFERENCE.md §8). It asks about
the white too — runny, tender or firm — every time, and neither answer is required;
the white has its own learned offset, which moves the shortest cook that sets it
(INFERENCE.md §3). Both apps have a button that forgets everything
learned — and both discard a posterior learned under the old yolk-only model rather
than carrying it forward, because every observation in one was folded under a
likelihood that had nowhere to put the white. The manual equivalent, if you are working
from the core directly, is to nudge `alpha_m2s` down if your eggs come out
consistently underdone and up if they come out consistently overdone, by about 7% per
half-minute of error.

### Running it

```
npm install
npm run build      # tsc -b into dist/, incrementally: core without DOM or Node, the app without Node, the rest, the studies
npm test           # node --test
npm run verify     # the gate: build, test, validate, copy:literals, fixtures:check and swift test
npm run validate   # prints the validation table in §7; fails if a check does
npm run fixtures   # regenerates fixtures/ from the TypeScript core
npm run conformance      # fixtures unchanged, then the Swift core against them
npm run decide     # measures the choice of cook time (studies/decide.ts)
npm run identifiability  # is h separable from alpha? (§11.2)
npm run rank       # how many parameters can feedback move? (§11.5)
npm run probe      # is a probe thermometer worth an egg? (§11.3)
                   # (these four, and studies/shape-study, are in studies/, run only by hand; `npm run build` compiles the four)
npm run eggs -- pull|simulate|emulate   # the population fit's data (fit/README.md)
npm run population -- literature        # writes the literature's fixtures/population.json
npm run copy:literals    # no Swift literal is words
npm run copy:queue       # the words not yet approved, and stale or missing twins (LANGUAGE.md §3)
npm run copy:review      # the same, as copy-review.html, to read on a phone
npm run copy:approve -- <key…|--all>   # stamp today's English as approved
npm run copy:snapshot -- capture <out.json>   # the web app's strings, rendered (headless Chrome)
npm run copy:snapshot -- compare <before.json> <after.json>
npm run build:site # the deployable tree, in _site/
npm run serve:site # static server on :8080, _site/
npm run serve:dev  # _site/ and the sharing endpoint, on a store in memory, on :8888
npm run e2e        # the web app driven end to end in headless Chrome (below)
```

Every script that runs compiled code builds first, through `tools/build.mjs`:
`tsc -b` over three projects (`tsconfig.core.json`, `tsconfig.app.json`, and
`tsconfig.json` for the tests, tools and server), so `npm run verify`
compiles once and each later step finds the build up to date. A file added,
deleted or renamed, or a change to the installed packages, builds `dist/`
from scratch, since `tsc -b` alone would keep a deleted file's output and
not check again what imported it. `npm run build:site` ships the app's part
of the same build.

Node version is pinned in `.node-version`, which nvm, fnm and Netlify all read,
so a Netlify build compiles on the same Node the tests ran on. `engines.node` is
a range rather than a pin, a statement about the APIs this uses (`node:test`,
ES2022), not a tested claim: 26 is what runs here, and what
`.github/workflows/verify.yml` runs `npm run verify` on - the type checks, the
tests, fixtures identical to a fresh `npm run fixtures`, and the Swift core
against them.

There is nothing else to configure. `netlify.toml` carries the settings the host
needs, and the build is `tsc` plus a few `cp`s — no bundler, no environment
variables, no secrets. The one exception is the endpoint that receives shared
eggs (E6; `INFERENCE.md` §7), a Netlify function (`netlify/functions/eggs.mts`)
that Netlify bundles from source on deploy and backs with its Blobs store;
`@netlify/blobs` is its one runtime dependency, and the apps have none. Another
host would serve the site, but nothing there would answer `/api/eggs`, so
sharing would wait until the endpoint was ported; the apps keep the eggs and
retry. Because nothing is bundled, nothing is hashed: `dist/` and `copy/` keep
their filenames from one deploy to the next, so they are served to be
revalidated on every load rather than cached for a year, and a returning browser
never runs last month's scripts against this month's page. `netlify.toml` says
why. The built site also has a service worker: `tools/precache.mjs` writes
`sw.js`, listing every file with its SHA-256, and once a browser has it the app
opens with no signal, from one build kept whole. A new build takes over only
between cooks (`src/ui/offline.ts`), and deleting `sw.js` takes the worker out.

`src/core/` has zero dependencies, no DOM, no `Date`, no I/O and no `async`. It is plain
interfaces and top-level functions with explicit loops, which is deliberate: it is meant
to port to Swift essentially unchanged.

### Checking the web app end to end

`npm run e2e` builds the site, serves it with the sharing endpoint on a store
in memory (`tools/devServer.ts`), and drives it in headless Chrome over the
DevTools protocol, with nothing installed beyond Chrome itself
(`tools/e2e.ts`, its scenarios, over `tools/harness.ts` and
`tools/chrome.ts`, which finds Chrome where macOS and Linux put it; `CHROME`
names another binary). Each scenario runs in a browser context of its
own and asserts on the page and on what it stored: a cold cook at sixty
times speed, a hot start, Cancel, a reload at every phase, a tab woken past
the pull, two tabs on one cook, a cook too old, an egg made final, Done
after an answer and a reload, a slow hob, a cook and a log this build
cannot read dropped, the old keys swept at boot, and sharing sending only
final eggs; and the one screen's: its layout in
every phase, the egg's readings, corrections mid-cook (the owner's boiling
to cold, overdue and back, a drag that rings only on release, the start's
time and its limits, Settings' water, two tabs' own cooks), a correction at
Done and the slider there, and "still in the water?". `npm run e2e -- reload two-tabs` runs
those named; `node dist/tools/e2e.js --list` lists them; `E2E_DEBUG=1` prints
the page's text when one fails.

The harness reads the app through what it shows, what it stores, and a
test API, `window.aetTest` (`src/ui/dev/test.ts`): `snapshot()`, the page's
state as plain data, `whenIdle()`, `t(key)` and `timeOfDay(ms)`; never by
importing the app's modules, so the app can be reshaped under it, and a
build from another checkout can be driven by today's scenarios (`npm run
e2e -- --tree <dir>`, for a commit that has the test API; `tools/harness.ts`
says how). Beyond it the harness watches the platform: the sounds scheduled
on the audio clock, the writes to localStorage, and the requests, read off
DevTools' network events.

The copy capture runs on the same harness. Its scenarios
(`tools/copyScenarios.ts`) are e2e scenarios named `copy/…`: settings
planted, the app opened on the development clock stopped at 7:30 on a
Saturday in London (the time zone pinned), its one random draw seeded
(`?seed=`), and every word on screen, visible or not, captured after the
boot and after each step, once the page is idle. `npm run copy:snapshot --
capture <out.json>` writes those words, and `compare` proves two builds
render the same ones; `npm run e2e` runs them too, so a step that no longer
reaches its state fails there. The whole suite takes about
six minutes, so it is not in `npm run verify`; CI runs it as a job of its
own on Linux (`.github/workflows/verify.yml`, `e2e`), not yet failing the
workflow.

What makes it take seconds is the development clock (`src/ui/dev/clock.ts`).
Every read of the time in `src/ui/` goes through `src/ui/now.ts`, which is
`Date.now()` unless the development clock has put itself there. On a page
served from `localhost` or `127.0.0.1`, and nowhere else, `src/ui/main.ts`
loads the development tools (`src/ui/dev/`: the clock and the test API) by a
dynamic import before the app boots; `npm run build:site` leaves them out
of the site, so the site that ships does not carry them, and the harness's
server (`tools/devServer.ts`, as `npm run serve:dev` runs it) serves them
beside it from the build. There, `?clock=60` runs it sixty
times fast, `?clock=0` stops it, `?at=+7m40s` or `?at=-15m` sets it ahead or
behind and `?at=2026-10-08T07:30:00Z` to a moment, and `?clock=off` puts it
back; it is kept for the tab across a reload, a red mark in the corner shows
it, and `aetClock.shift('+20m')`, `aetClock.set(moment)` and
`aetClock.speed(x)` move it from the console. The pull's beeps, scheduled
ahead on the audio clock, follow it. While it is on, and in that browser
until Forget everything, sharing sends nothing, so no egg cooked on it
reaches a server. On the live site the clock is `Date.now()`
(`test/now.test.ts`), and the development tools are never asked for (the
`inert-off-localhost` scenario).

What makes it independent of the machine's speed is that the clock is
stopped. A scenario steps it to the moment it means, tells the page to look
again as a tab coming back does, and asserts, so a step 2 s past the pull
lands 2 s past the pull however long the page takes to get there; at sixty
times speed the pull's 20-s grace was a third of a real second, and a slow
machine could miss it. The alarm is checked by the beeps scheduled on the
audio clock and for when, never by waiting for them to play. One span is
run: the last second before the cold cook's pull, at the real clock's
speed, to see the beeps scheduled ahead sounding as the tick reaches the
pull; the grace is its margin for a slow machine. A person's timers (a
control's 1.5-s settle, a held key) stay real, and a scenario waits for the
page to say it is idle (`aetTest.whenIdle()`: the app sets those timers,
sends its worker jobs and makes its requests through `src/ui/idle.ts`, which
counts them, so no timer, worker or request is patched) rather than for a
fixed time; a wait for something that will come gives up after a minute,
which is failure detection, not a measure. Two scenarios run off the
stopped clock: the address check, and sharing, which sends nothing on
the development clock and is checked on the real one. `E2E_CPU_THROTTLE=6`
slows every page six times (DevTools' CPU throttling); with every core
busy as well, the suite passes as it does on a quiet machine.

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
- USDA AMS 56, United States Standards, Grades, and Weight Classes for Shell Eggs —
  the US carton classes, as minimum net weight per dozen.

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
   (`npm run identifiability`, `studies/identifiability.ts`):

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
   water**, under an ice bath, a cold tap, and resting on the counter. Not because the
   counter's physics needs one: free convection, radiation and Newton's law at the shell
   are textbook (§6, §8), and nobody would publish an egg-specific measurement of them.
   A curve would test the whole chain end to end,
   including the one estimate in it, the water on the shell (`WET_SHELL_KG_M2`), which a
   scale reading to 0.01 g checks on its own: weigh an egg straight from the pan and
   again a minute later. Two leads: Vega & Mercadé-Prieto instrumented yolks and plunged
   them into ice-water, recording the decrease but not publishing the curve; Sabliov et
   al. (2002) and Almonacid et al. (2007) both model shell-egg cooling, the first
   cryogenically. A thermocouple through the blunt end and a datalogger would still
   settle it in an afternoon.

   A kitchen probe thermometer is NOT a substitute for this one, and `npm run probe`
   says why: at the rested yolk's peak, one prior sd of `tauAirScale` moves the centre
   reading 1.3 °C, while one prior sd of `alpha` moves it 3.5 °C. A spot reading mostly
   re-measures the time-scale. What a probe IS good for is exactly that - the centre, at
   the moment the centre peaks, is flat in space and in time (3 mm off: 0.03 °C; 15 s
   late: 0.14 °C), and ±1 °C there is ±2.5% of time-scale from one egg, with no taste
   in it. The same probe at the pull is worth less than it looks: a miss, a delay and
   the stem all read hot (+1.3 °C at 3 mm, +2.2 °C at 15 s), and hot means "cook it
   shorter". At the white's radius the field falls 3.5 °C per millimetre and no
   handheld reading means anything. `INFERENCE.md` §5 has the flow this implies.

2. **Convective heat transfer coefficient at a rolling boil.** Denys et al. measured 490
   W/m²K under gentle forced circulation at 40-60 °C. Nobody appears to have measured it
   with bubble agitation at 100 °C, which is the only condition this app cares about.

3. **A logged temperature-vs-time curve for a domestic pot of water**, heating *and*
   cooling. `RAMP_R = 3.0` comes from cooktop *efficiency* studies ("about a third of
   full burner power holds a boil"), not from a measured heating curve. The standing
   path rests on less: `TAU_STANDING_REF_S` is pinned to one folk recipe with an unstated
   pot, `STANDING_VOLUME_EXPONENT = 1/3` is geometry for pans of the same shape, and
   `TAU_STANDING_SCALE = 1.0` assumes the lid does what Williams' lid did. Evaporation
   dominates the loss at the boil and stops being replenished once the lid is on, so the
   real standing constant may well be longer, and the app may refuse the standing method
   more often than it should. One thermocouple, one pot, forty minutes — heat it, log the
   boil time, kill the heat, keep logging — would settle `RAMP_R` and the 2 L constant at
   once and beat every source found; the same at 1 L and 4 L would test the exponent.

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
  feedback, so adding it as another calibrated parameter would add a dimension the data
  cannot move. The reason to do this is that Dirichlet under-predicts cook time and that
  bias currently sits inside `ALPHA_DEFAULT` — not that anyone will ever fit `h` from
  eating eggs. `studies/identifiability.ts` already carries working Robin eigenmodes,
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

- **The carryover is not learned.** `tauAirScale` is held at 1.0 (`DECISIONS.md` 95):
  the counter's cooling is the textbook's still air, and a draughty kitchen's eggs rested
  on the counter come out a little softer than the model thinks, with nothing in the app
  to learn it. Their answers go into the time-scale and the taste instead.
- **The white has its own offset, and a runny white still moves the time-scale.**
  Since E2 and E3 (`src/core/infer.ts`, INFERENCE.md §3) every answer goes through an
  ordered probit with a learned noise scale, and the white - runny, tender or firm,
  judged at `YOLK_RADIUS_FRAC` - has a learned offset on its cutpoint, which is the
  white's lag and the cook's idea of "runny" together. It replaced a fixed, deliberately
  weak white channel. What it does not yet do: a runny white is as well explained by a
  slow time-scale as by a late white, and `alpha`'s prior is the wider of the two, so two
  runny whites at soft move a jammy time about as far as a soft one (INFERENCE.md §3;
  the owner has left it so, `DECISIONS.md` 18).
  See [issue #1](https://github.com/danmackinlay/actual_egg_timer/issues/1).
- **`alpha` and the taste offset are confounded at a fixed protocol** in the yolk channel.
  The *combination* is identified — the suggested time converges — but the individual
  parameters are not. Varying egg size or cooling method separates them, and the white
  channel above is an attempt to separate them without asking anyone to vary anything.
- **Feedback can move two global parameters, and the model gives it one.**
  `npm run rank` takes ten things one might hope to learn - `alpha`, `tauAirScale`,
  both z-values, the white's threshold and the radius it is judged at, a size exponent,
  a yolk offset, and errors in the start and boil temperatures - scales each by its
  prior, and asks how many directions of the prediction they span over 182 reachable
  cooks. Answers needed to halve the prior sd along each direction: **~1** for a
  time-scale (`alpha`, with the two temperature errors folded into it), **~5** for a
  *white lag* (threshold and radius, mixed 0.75 / 0.57 and inseparable), then a sixfold
  gap: ~30 for carryover (and *never* without counter-rested cooks), ~110 for size
  scaling, ~280 for start temperature, and 450 to 250 000 for the rest, with both
  z-values at the bottom. Since E3 the particle carries the first two: the time-scale,
  and a white offset for the white lag. Both real eggs so far had a runny white at a soft
  target. The
  counts are Gaussian-latent and good to an order of magnitude; the gaps are the
  result. `INFERENCE.md` is the plan this leads to.
- **`predictCookTime`'s interval is not drawn, by choice.** `src/core/infer.ts` computes
  the posterior predictive cook time as a median and an 80% credible interval, which is
  the owner's "still learning" rule (`DECISIONS.md` 9). The owner chose a sentence saying
  which way a miss is likely to go instead (`DECISIONS.md` 27, UI.md §8), so no screen
  shows the interval, the decision does not compute it (`DECISIONS.md` 40), and the
  record does not keep it. The tests and `npm run decide -- learning` read it on demand;
  E8's nudge may need it back.
- **Little of either app is tested above the shared layer.** What both apps decide —
  snapping, refusals, texture bands, the calibration grid, the phase timeline — lives in
  `src/core/` (`slider.ts`, `texture.ts`, `record.ts`, `running.ts`) and is
  conformance-tested, which is where all three of the real-egg bugs in `LOGBOOK.md`
  ("Three things a real egg found that the simulator did not") would have been caught.
  Above it, the web's phase machine, store and formatting have tests
  (`test/machine.test.ts`, `test/store.test.ts`, `test/format.test.ts`), and iOS's
  decision to ring is `deadlineToRing` in EggTimerApp, under `swift test`. The rest is view code: DOM writes and SwiftUI bodies, tested by driving the
  apps. The iOS app project has no test target. Two things a cook sees are untested
  anywhere: the Lock Screen card ending as the cooling does, and the web's setup
  sentence while a cook runs.
- **The web can make an egg over 90 g, on purpose.** Both apps cap the mass at 90 g, a
  hen's egg, but the web's girth (90-200 mm) and width (30-60 mm) fields keep their own
  limits, so a typed measurement reaches about 160-195 g, and a stored 120 g egg reloads
  as 120 g. The owner accepted this (`DECISIONS.md` 34). The model is a hen's egg's, so
  those times are an extrapolation.
- **The Swift port is complete and held to this one** by `npm run conformance`; how
  closely, and how, is `ios/README.md`.

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
