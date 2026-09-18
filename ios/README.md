# iOS port

`EggTimerCore` is the physics, transliterated from `src/core/` and held to the
same numbers by a conformance suite. It runs headless, and that is the point:
the core is finished in a terminal, and the app on top is a separate argument.

The app is now real rather than a slice. It carries every input the solver has,
schedules the alarm at absolute fire dates, and puts a countdown on the Lock
Screen and in the Dynamic Island.

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
| `doseGrid.ts` | `DoseGrid.swift` | every cell, interpolation, the clamp, the inverse |
| `infer.ts` | `Infer.swift` | every particle and weight, prior and 7 updates |

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

### The calibration, and why its fixtures are so much bigger

`infer.ts` is the one module with STATE and a random number generator, and it is
where a transliteration slip is least likely to announce itself. A wrong shift
does not crash or produce a NaN: it draws a different but entirely plausible
prior, and the two implementations quietly stop being the same model. Summary
statistics would not catch it either — any seed gives a sensible mean and
spread. So `fixtures/calibration.json` carries **every particle and every
weight**, before the first observation and after each of seven, and the Swift
compares all of them.

The RNG is xorshift32 written in terms of JavaScript's integer operators, where
`<<` and `^` coerce to a SIGNED 32-bit int and `>>>` is the unsigned right
shift. Doing the arithmetic in `UInt32` and reinterpreting the bits reproduces
it exactly; Swift's fixed-width shifts discard overflow rather than trapping,
so no masking is needed. The recorded state goes negative partway through the
fixture sequence on purpose — that is the case a port reaching for `UInt32` or
`Int` throughout would get wrong, and it is checked as an `Int32`.

Three of the seven updates drive the effective sample size below n/2 and
resample, which is the only part of the filter that touches the RNG after the
prior is drawn, and the only part where the ORDER of the particles matters.

One ordering subtlety that is not in the TypeScript because it does not have to
be: `predictCookTime` sorts particles by predicted time, and JavaScript's sort
is required to be stable while Swift's is not. The Swift sorts by time with the
original index as a tie-break, which is the same thing.

## Not ported yet

`sousvide.ts` is a joke and can wait forever.

## The app

```sh
cd ios && xcodegen        # regenerate ActualEggTimer.xcodeproj from project.yml
open ios/ActualEggTimer.xcodeproj
```

The project file is **generated, not committed**. `project.yml` is the source of
truth and fits on a screen; a pbxproj is three thousand lines of machine-written
XML that every branch conflicts on and nobody reviews. `ActualEggTimer.xcodeproj`
is gitignored — run `xcodegen` after cloning, and after any change to targets,
sources or settings. So is `Widget/Info.plist`, which xcodegen writes from the
same file (see **The Live Activity** below for why that one cannot be generated
by the build system instead).

The screen carries the whole model now:

- doneness, egg mass, fridge or room
- cold start (the default) or straight into boiling water
- ice bath, cold tap, or resting on the counter
- keep boiling, or the standing method — heat off at the boil, lid on
- water volume, eggs in the pan, altitude

The last five are folded behind **Pan, hob and altitude**, because the defaults
are right for most people most mornings and a first-time user should not have to
answer six questions to boil an egg.

Two behaviours are taken from `src/ui/machine.ts` rather than reinvented, and
both are the model refusing to lie:

- **The slider clamps to what is reachable.** Ask for a jammy yolk while resting
  the egg on the counter and it snaps to the softest that carryover actually
  allows, and says why in a sentence. Ask for anything at all with the heat off
  in too little water and the start button goes dead, because that pan never
  sets the white.
- **The method is always on screen.** Which cooking method a running timer is
  for is the one thing you cannot check once the controls are hidden, and a hob
  instruction like "keep it boiling" does not answer it. The readout says "Cold
  start - then ice bath", and the idle subline says what the clock is measured
  FROM rather than the ambiguous "from eggs in".
- **A cold start is provisional until you tap the boil.** The countdown says so.
  `t = 0` is the egg going into the cold pan — the same `t = 0` the physics core
  uses — so one deadline covers the ramp and the boil together, and tapping
  "Full rolling boil" re-solves the cook and moves it. The button names a full
  rolling boil because tapping at first bubbles under-measures by 15-25%. If the
  hob is slower than assumed, the estimate is pushed out rather than counting
  down to an alarm for an egg that has not started cooking.

The measured time to boil is remembered per water volume and blended with what
was already known, so one odd run — lid off, pan half empty — does not dominate.

### It asks how the egg was

After the cook the app asks one question, with three answers: too soft, just
right, too hard. That is not a poor interface for a rating — it is the whole
measurement. Ordinal feedback is worth one to two bits per egg, and asking for a
number out of ten would collect precision that is not there.

The answer goes into the particle filter. Building the dose surface for the cook
that was actually performed costs about a second of arithmetic, so it runs in a
detached task, once, after the egg has been eaten and never while anything is
being adjusted — which is the entire reason the surface is cached rather than
simulated per particle.

Before any feedback the filter's prior mean IS the literature value, so the app
is fully useful on day one and calibration is purely additive. Afterwards the
suggested time moves: a room-temperature 62 g egg rested on the counter at fudgy
goes 4:07 to 4:29 on the first "too soft", and the posterior's spread on alpha
is reported next to it. That spread plateaus near 3% rather than collapsing,
which is the honest answer — repeated agreement is consistent with a range.

There is a "Forget what it learned" button, which the web app still lacks
(README §11.5). The posterior recovers on its own after a few more eggs, so this
is for people who would rather not wait.

The taste offset the filter learns is deliberately NOT applied to the solve. It
is a nuisance parameter: it absorbs the difference between the user's palate and
the nominal doneness scale so that `alpha` does not have to, which keeps the
physics honest. Only `alpha` and `tauAirScale` feed back into the cook time.

It agrees with the web app on screen. 62.3 g, fridge, ice bath, jammy gives
**7:21** with a peak yolk of 65 °C and a peak white of 81 °C, against 441.28 s,
64.8 °C and 80.6 °C from `solveCookTime` in TypeScript. The same egg at 400 m
gives **7:31** and a 98.7 °C boiling point, against 450.9 s and 98.7 °C. A
room-temperature egg on a cold start gives **10:20**, against 620.45 s.

## The alarm

`Alarm.swift` is the reason this is a native app rather than a bookmark.

A home-screen web app's timers are suspended the moment the screen locks, and
WebKit has never shipped a way to schedule a local notification — so the web
version can only ring while you are looking at it, which is exactly when you do
not need it. Nothing of ours runs in the background either. The difference is
that a native app can hand the system **absolute fire dates** up front and let
it do the waiting.

Two are scheduled at "Eggs in": the pull, and the end of the cooling step
(skipped when the egg is resting on the counter, where there is nothing to time).
Cancelling removes both. A cold start reschedules them when the boil is tapped
and on every revision. The app shows the wall-clock time the alarm is set for,
and reads the pending count back from `UNUserNotificationCenter` rather than
assuming — an egg timer that claims an alarm it has not got is worse than one
with no alarm at all.

Both fire at **`.timeSensitive`** interruption level, which is what gets them
through a Focus mode. An egg is time-sensitive in the literal sense the name was
coined for: thirty seconds late is a different egg. That level needs the
`com.apple.developer.usernotifications.time-sensitive` entitlement, which needs
signing, which needs the Apple Developer Program — see **Signing** below.
Unsigned simulator builds carry no entitlement and fall back silently to the
default level, which is the right failure: quieter, never wrong.

`Cook.swift` holds the state, and holds it as **absolute dates**: every phase is
derived from `Date.now` rather than counted down, so a ticker that stops —
backgrounded, locked, or simply busy — cannot make the egg wrong. The ticker
exists only to redraw. This is the native form of the same discipline the web
app uses when it recomputes from timestamps on `visibilitychange`.

A cook in progress is written to `UserDefaults` and restored on launch. Without
that, a force-quit or a crash leaves the alarm with the system and the Live
Activity on the Lock Screen while the app itself reopens to an idle screen —
which teaches the user to distrust an alarm that was, in fact, perfectly
correct. Anything more than an hour past the end of its cooling step is dropped
instead of restored; that egg has been eaten.

## The Live Activity

`Widget/CookLiveActivity.swift` is the feature that makes a native egg timer
worth having rather than merely correct. The notification says *when*; the Live
Activity says *how long left* without unlocking anything, which is the question
you actually have while standing at the hob with wet hands.

Every countdown is `Text(timerInterval:)`, drawn and ticked by the system from
two absolute dates. Nothing in the widget runs once a second and nothing in the
app has to wake up to keep it honest — the same trick as scheduling the alarm at
an absolute date, applied to the display. The app pushes a new state only when
the **stage** changes.

Three things cost time here and are worth writing down:

- **`Activity` is a non-Sendable class whose methods run off the main actor.**
  Holding one in a `@MainActor` object and awaiting on it is a data race, and
  Swift 6 refuses to compile it. So nothing holds the handle: every call asks
  `Activity<CookActivity>.activities` what is running and acts on that. This is
  the same discipline the alarm uses when it reads its pending count back from
  the system instead of assuming, and it cleans up a card left behind by a
  force-quit for free.
- **A widget extension needs a real `Info.plist`.** `NSExtension` is a nested
  dictionary, and the `INFOPLIST_KEY_*` settings that generate a plist can only
  express flat values — the key is silently dropped and the result is an
  extension the system does not recognise as a widget at all. xcodegen writes
  `Widget/Info.plist` from `project.yml` instead.
- **The extension's version must match the host app's** or installation is
  refused, so both read `$(MARKETING_VERSION)` and `$(CURRENT_PROJECT_VERSION)`.

One layout note: a system timer view does not truncate when it is squeezed, it
draws dashes where the digits should be — a countdown that tells you nothing. On
the Lock Screen it therefore takes the width it needs first, and the description
wraps around it.

## Signing

The project is configured for the Apple Developer Program membership on this
machine:

```yaml
DEVELOPMENT_TEAM: L4D3TWC3A4
CODE_SIGN_STYLE: Automatic
```

Simulator builds stay unsigned — `CODE_SIGNING_ALLOWED[sdk=iphonesimulator*]: NO`
— because that is what keeps the build-run-screenshot loop at two seconds and no
identity is needed for it. Device builds sign normally.

This is **done** on this machine. The steps, once, for a new one:

1. Open the project in Xcode, sign in under **Settings > Accounts** with the
   account that holds the membership.
2. Select the **ActualEggTimer** target, **Signing & Capabilities**, and confirm
   automatic signing resolves the team. Check the same on **EggTimerWidget**.
3. Add the **Time Sensitive Notifications** capability to the **app** target
   only. The entitlements file already asks for it, but the App ID in the
   developer portal has to agree, and that registration is what this step does.

Note the Team ID is the certificate's `OU` field, not the ten characters in its
common name — that is the certificate id, and using it silently produces a
project that cannot sign. Read it off a profile instead:

```sh
security cms -D -i ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles/*.mobileprovision \
  | plutil -extract TeamIdentifier.0 raw -
```

To check the whole chain actually worked, build for a device and look at what
came out — a build that merely succeeds proves nothing, because an entitlement
the portal refused is dropped rather than fatal:

```sh
xcodebuild -project ActualEggTimer.xcodeproj -scheme ActualEggTimer \
  -destination 'generic/platform=iOS' -derivedDataPath build-device build
codesign -d --entitlements - --xml 'build-device/Build/Products/Debug-iphoneos/Actual Egg Timer.app' \
  | plutil -p - | grep time-sensitive
```

Two things say it worked. The entitlement is present in the signed binary, and
Xcode resolved a profile named for the bundle id rather than the wildcard
`iOS Team Provisioning Profile: *` — a wildcard profile cannot carry an
entitlement, so being given a specific one is the portal agreeing.

A different team means one line in `project.yml` and a new bundle identifier
prefix.

### Onto the phone

No Xcode needed once signing is set up. Find the device, build, install, launch:

```sh
xcrun devicectl list devices
cd ios && xcodebuild -project ActualEggTimer.xcodeproj -scheme ActualEggTimer \
  -destination 'platform=iOS,id=<UDID>' -derivedDataPath build-device \
  -allowProvisioningUpdates build
xcrun devicectl device install app --device <UDID> \
  'build-device/Build/Products/Debug-iphoneos/Actual Egg Timer.app'
xcrun devicectl device process launch --device <UDID> name.danmackinlay.actualeggtimer
```

The device must be **unlocked**, or the build fails with "needs to be unlocked
to enable development services" before it compiles anything. A state of
`connected (no DDI)` in the device list is not a problem: the developer disk
image mounts itself when the first build prepares the device.

### The Apple Watch

Nothing to do. A paired watch already rings for the alarm, because iOS forwards
notifications to the wrist whenever the phone is locked and the watch is on and
unlocked — which is exactly the situation this app is built for. The
`.timeSensitive` level carries across, so it breaks through a Focus on the watch
too.

The gap is the reverse case: with the phone unlocked and in your hand, the
notification stays on the phone. Closing that needs a real watchOS target, and
the honest cost is a second UI to keep in sync rather than the target itself —
`EggTimerCore` is pure Swift with no UIKit and already compiles for watchOS
unchanged. Worth it only if the wrist is meant to be the primary display.

## What Xcode is still needed for

Not much. `swift test` finishes the core in a terminal, and `xcodebuild` builds,
installs and runs the app from one too — this whole app was built and driven
without opening Xcode once.

Xcode earns its place for the parts of signing that are a conversation with
Apple's servers rather than a file: adding the Time Sensitive Notifications
capability to the App ID, and resolving a provisioning profile for a real
device. Both are once-per-machine.

The SwiftUI layer is a rewrite, not a port. `src/ui/` is 1,700 lines of DOM
wiring and web-specific workarounds — `clock.ts` in particular exists to fight
exactly the backgrounding problem that a local notification solves properly.
The behaviour came across; the mechanism did not.
