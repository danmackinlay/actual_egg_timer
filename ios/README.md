# iOS port

`EggTimerCore` is the physics, transliterated from `src/core/` and held to the
same numbers by a conformance suite. No SwiftUI, no app target yet — this half
runs headless, which is the point.

## The loop

```sh
npm run fixtures                      # regenerate goldens from the TypeScript
cd ios/EggTimerCore && swift test     # hold the Swift to them
```

or, from the repository root, `npm run conformance` for both.

**The fixtures are generated only from `src/core/`, and the port never
regenerates them to make itself pass.** That is the entire discipline. If a
number in `fixtures/` is wrong, it is wrong in the TypeScript first, and
`npm test` is what should catch it. Regenerating fixtures to turn a red test
green converts the reference implementation into whatever the port happens to
do, which is the one failure mode this arrangement exists to prevent.

Tolerance is 1e-12 relative — a few ulps of a double, which is all that
differing libm implementations of `exp`, `sin` and `log10` can cost. An
algebraic mistake is never that small.

## Ported

| module | Swift | conformance |
|---|---|---|
| `constants.ts` | `Constants.swift` | every value |
| `thermo.ts` | `Thermo.swift` | 9 altitudes, 6 pressures, salt |
| `geometry.ts` | `Geometry.swift` | 8 masses, 6 diameters, tau |
| `kinetics.ts` | `Kinetics.swift` | z-values, hold times, 20-step accumulation |
| `sphere.ts` | `Sphere.swift` | 42 series points, 40-step integration, 30-step ramp |

The integrator is covered against both a **held** surface and a **moving** one.
The second matters: a step-only test cannot catch a sign error in the Duhamel
drive term, which is the mistake this transliteration was most likely to make.

One deliberate ugliness: `Sphere.complementaryError` is the Numerical Recipes
Chebyshev form rather than Foundation's `erfc`, which is more accurate.
Foundation's would be *better* and would diverge from the reference — quietly,
in the fourth decimal place. The port's job is to agree.

One real finding, recorded in the test: `erfcTheta` at the centre evaluates
`1 - total/x` with `x` clamped to 1e-9, so a one-ulp difference in `erfc` is
amplified by 1e9. The two implementations differ by ~1e-8 there and by nothing
anywhere else. That is the expression, not either implementation, and the model
reads the quantity to five decimal places.

## Not ported yet

`protocol.ts` (the surface schedule) and `solve.ts` (simulate, the bisection,
the standing scan) — in that order, since solve depends on protocol.
`fixtures/scenarios.json` is already generated and waiting for them: 13 whole
cooks with cook times, peak temperatures and doses, including the standing cases
and the pan that never sets the white.

`infer.ts` and `doseGrid.ts` (the Bayesian calibration) can wait for a version 2.
`sousvide.ts` is a joke and can wait forever.

## When you need Xcode

Not yet. Everything above is `swift test` in a terminal, and that is the right
place to finish the core: fast, headless, no simulator.

Xcode earns its place at the app target, because these are things a Swift
package cannot express:

- an app target with an `Info.plist`, bundle identifier and signing
- `UNUserNotificationRequest` — the alarm, scheduled at *absolute* fire dates
  when the cook starts, because nothing of ours runs in the background
- **ActivityKit** — a Live Activity is what makes a cooking timer worth having
  natively: countdown on the Lock Screen and in the Dynamic Island
- `isIdleTimerDisabled`, audio session category, and the capabilities editor

The SwiftUI layer is a rewrite, not a port. `src/ui/` is 1,700 lines of DOM
wiring and web-specific workarounds — `clock.ts` in particular exists to fight
exactly the backgrounding problem that a local notification solves properly.
Take the *behaviour* from it (the phase machine is sound) and leave the
mechanism.
