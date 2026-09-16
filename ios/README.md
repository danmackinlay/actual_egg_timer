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
| `protocol.ts` | `Protocol.swift` | every scenario's schedule, via the cooks below |
| `solve.ts` | `Solve.swift` | 13 whole cooks: times, peaks, doses, verdicts |

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

### How closely they agree

Tighter than expected. Probing the whole-cook suite at 1e-15 puts the worst
disagreement at **7e-15 relative**, on an accumulated dose after roughly 20,000
calls each to `exp()` and `pow()` — where two libm implementations are entitled
to differ in the last bit every single time. Cook times, peak temperatures and
the boolean verdicts (`reachable`, `whiteSets`) agree at 1e-15 outright, which
is to say exactly.

The suite runs at 1e-12: three orders of headroom over that noise floor, and
still ten orders tighter than anything that could change an answer.

The whole-cook suite takes about 14 seconds, nearly all of it the standing
scans. That is the price of not assuming monotonicity, and it is worth paying
here — the two standing scenarios in the fixtures are the ones a bisection would
have got wrong.

## Not ported yet

`infer.ts` and `doseGrid.ts` — the Bayesian calibration. The app works without
them; they are what lets it learn your kitchen. Version 2.

`sousvide.ts` is a joke and can wait forever.

## The app

```sh
cd ios && xcodegen        # regenerate ActualEggTimer.xcodeproj from project.yml
open ios/ActualEggTimer.xcodeproj
```

The project file is **generated, not committed**. `project.yml` is twenty lines
and fits on a screen; a pbxproj is three thousand lines of machine-written XML
that every branch conflicts on and nobody reviews. `ActualEggTimer.xcodeproj` is
gitignored — run `xcodegen` after cloning, and after any change to targets,
sources or settings.

The first screen is deliberately a vertical slice rather than a port of the web
UI: a doneness slider, egg mass, where the egg came from, what happens after the
pull, and the cook time the ported physics says it needs. It exists to prove the
chain from the Swift package to a screen, and to be the thing notifications and
a Live Activity get bolted onto.

It agrees with the web app on screen: 62.3 g, fridge, ice bath, jammy gives
**7:21** with a peak yolk of 65 °C and a peak white of 81 °C, which is what
`solveCookTime` returns in TypeScript for the same inputs (441.28 s, 64.8 °C,
80.6 °C).

Signing is off (`CODE_SIGNING_ALLOWED: NO`) because this is simulator-only so
far. A device build turns it back on and adds a team.

## What Xcode is still needed for

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
