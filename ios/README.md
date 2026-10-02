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

## The core, module by module

Every module in `src/core/` has a Swift twin, held to it by a fixture. This
table is the map; each file's header comment is its documentation, and the
exports are its API. Apps call what is exported and nothing else, and
anything both apps must agree on lives here, not in either app.

| module | what it answers | main entry points | Swift | fixture |
|---|---|---|---|---|
| `constants.ts` | every physical and model constant (README §6) | - | `Constants.swift` | `core.json` |
| `thermo.ts` | altitude and pressure to a boiling point | `boilingPointAtAltitude` | `Thermo.swift` | `core.json` |
| `geometry.ts` | an egg from its mass; the size classes by region | `eggFromMass`, `sizeClassesFor` | `Geometry.swift` | `core.json` |
| `kinetics.ts` | the Arrhenius dose | `createDose`, `accumulateDose` | `Kinetics.swift` | `core.json` |
| `sphere.ts` | the modal/Duhamel solver | `createSphere`, `stepSphere` | `Sphere.swift` | `core.json` |
| `protocol.ts` | the water's schedule: ramp, dip, heat off, cooling | `bathTemperature`, `panTimeConstant` | `Protocol.swift` | via `scenarios.json` |
| `solve.ts` | the cook time for a doneness, and what is reachable | `solveCookTime`, `simulate`, `donenessFromSlider` | `Solve.swift` | `scenarios.json` |
| `section.ts` | the egg in cross-section, a tick at a time: each ring's temperature and how set | `createSection`, `advanceSection`, `sectionView` | `Section.swift` (`EggSection`) | `section.json` |
| `sousvide.ts` | the isothermal limit | `sousVideEstimate` | `SousVide.swift` | `sousvide.json` |
| `doseGrid.ts` | the cached dose surface and its lookups | `buildDoseGrid`, `buildRequestedGrid` | `DoseGrid.swift` | `calibration.json` |
| `infer.ts` | the particle filter: prior, likelihood, fold | `createPrior`, `updatePosterior`, `probeLikelihood` | `Infer.swift` | `calibration.json`, `probe.json` |
| `record.ts` | the egg log, and the posterior as its replay | `parseLog`, `foldRecord`, `replay` | `Record.swift` | `record.json` |
| `population.ts` | the population a prior is drawn from (E7), and its centre | `parsePopulation`, `priorStart` | `Population.swift` | `prior.json` |
| `decide.ts` | the chosen time and its odds, and the nudge (E8) | `decide`, `chooseCookTime`, `hitOdds`, `nudgeSeconds` | `Decide.swift` | `decide.json` |
| `outcome.ts` | which way a miss goes, and the likely level | `predictOutcome` | `Outcome.swift` | `outcome.json` |
| `reach.ts` | the odds at every level, the shading, the advice | `oddsProfile`, `answerAt`, `protocolAdvice` | `Reach.swift` | `reach.json` |
| `policy.ts` | what both apps decide: bounds, defaults, snapping, verdicts, texture, the phase timeline, the calibration grid | `verdictFor`, `phaseAt`, `calibrationGrid` | `Policy.swift` | `policy.json` |
| `wording.ts` | which catalogue key each part of the screen says | `phaseKeys`, `refusalKey`, `directionKey`, `clauseKeys` | `Wording.swift` | `wording.json`, `sousvideCopy.json` |
| `units.ts` | Metric and Imperial: steps, bounds, the round trip | `measureFor`, `display`, `parse`, `quantityText` | `Units.swift` | `units.json` |
| `language.ts` | the switch into and out of the English of 1750 | `languageAfterFlip`, `languageAfterPick` | `Language.swift` | `language.json` |
| `copy.ts`, `format.ts` | the catalogue's renderer; numbers and times by locale | `render`, `pluralCategory`, `formatNumber`, `formatTimeOfDay` | `EggTimerCopy`: `Copy.swift`, `Format.swift` | `copy.json`, `format.json` |

The Swift core leaves out what no app calls (`DECISIONS.md` 41): the
measure-by-width geometry, the science checks (`erfcTheta`, `oneTermTheta`,
`biotNumber`, `boilingPointApprox`, `saltBoilingElevation`,
`zFromActivationEnergy`) and the inference read-outs. The TypeScript keeps
them for `npm run validate`, the tests and the web's width input.

**The UI contract.** `solveCookTime` returns `reachable: false` when the
yolk asked for cannot be had: too soft for the white (`softestLevel` is the
softest level that is, and the slider stripes out everything below it, which
is what makes a counter rest refuse soft eggs rather than lie about them), or,
with the heat off, harder than the pan can manage (`hardestLevel`). If
`whiteSets` is false nothing on the slider is reachable. Every cook time the
solver returns is the first one known to meet its dose target, to within a
second: the search returns the upper end of its final bracket, never the
midpoint, so a dose compared against its own target at the answer passes.

The integrator is covered against both a **held** surface and a **moving** one.
The second matters: a step-only test cannot catch a sign error in the Duhamel
drive term, which is the mistake this transliteration was most likely to make.

One deliberate ugliness: `Sphere.complementaryError` is the Numerical Recipes
Chebyshev form rather than Foundation's `erfc`, which is more accurate.
Foundation's would be *better* and would diverge from the reference — quietly,
in the fourth decimal place. The port's job is to agree.

One real finding, from when the Swift core still had `erfcTheta` (it went on
28 September with the rest of the API no app calls, D4): at the centre it evaluates
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
here — the standing scenarios in the fixtures are the ones a bisection would
have got wrong.

### The calibration, and why its fixtures are so much bigger

`infer.ts` is the one module with STATE and a random number generator, and it is
where a transliteration slip is least likely to announce itself. A wrong shift
does not crash or produce a NaN: it draws a different but entirely plausible
prior, and the two implementations quietly stop being the same model. Summary
statistics would not catch it either — any seed gives a sensible mean and
spread. So `fixtures/calibration.json` carries **every particle and every
weight**, before the first observation and after each of eleven — and after each
white answer folded in between them — and the Swift compares all of them.

The RNG is xorshift32 written in terms of JavaScript's integer operators, where
`<<` and `^` coerce to a SIGNED 32-bit int and `>>>` is the unsigned right
shift. Doing the arithmetic in `UInt32` and reinterpreting the bits reproduces
it exactly; Swift's fixed-width shifts discard overflow rather than trapping,
so no masking is needed. The recorded state goes negative partway through the
fixture sequence on purpose — that is the case a port reaching for `UInt32` or
`Int` throughout would get wrong, and it is checked as an `Int32`.

Several of the eleven updates drive the effective sample size below n/2 and
resample, which is the only part of the filter that touches the RNG after the
prior is drawn, and the only part where the ORDER of the particles matters.

One ordering subtlety that is not in the TypeScript because it does not have to
be: `predictCookTime`, which only the tests and `npm run decide` call now (no
screen shows its interval), sorts particles by predicted time, and JavaScript's
sort is required to be stable while Swift's is not. The Swift sorts by time with the
original index as a tie-break, which is the same thing.

## The port is complete

`EggTimerCore` carries every module in `src/core/`, `sousvide.ts` included.
The pure functions agree to 1e-12 and 17 whole cooks - times, peak
temperatures, doses and the reachability verdicts - to the same, where the
measured disagreement is 7e-15. The calibration is pinned harder still: every
particle and every weight of an eleven-observation run, both channels, each
white answer folded straight after the yolk answer for the same egg, because
a wrong random number generator would otherwise produce a different but
entirely plausible posterior. The app on top carries every input README.md
describes, schedules its alarm at absolute fire dates with a time-sensitive
interruption level, shows the countdown on the Lock Screen and in the Dynamic
Island, and asks how the yolk and the white were after each egg, every time,
with neither answer required.

Sous-vide was once left unported as "a joke", which is why the owner went
looking for it on his phone and did not find it. It is the same dose
machinery with the surface temperature held constant, and its answer - a
start time in the past, for a 58 °C bath - is the model's real conclusion,
not the code declining to work.

## The app

```sh
cd ios && xcodegen        # regenerate ActualEggTimer.xcodeproj from project.yml
open ios/ActualEggTimer.xcodeproj
```

The project file is **generated, not committed**. `project.yml` is the source of
truth and fits on a screen; a pbxproj is three thousand lines of machine-written
XML that every branch conflicts on and nobody reviews. `ActualEggTimer.xcodeproj`
is gitignored — run `xcodegen` after cloning, and after any change to targets,
sources or settings. So are `Widget/Info.plist` and `App/Info.plist`, which
xcodegen writes from the same file (see **The Live Activity** below for why that one cannot be generated
by the build system instead).

The screen carries the whole model, laid out as the web's (UI.md):

- the doneness slider, with the peak yolk in its heading
- one tappable sentence for what changes from egg to egg: the egg (a size class
  or a weight), fridge, room or custom, cold start (the default), boiling water
  or a 58 °C bath, and ice bath, cold tap or the counter
- a pushed **Settings** page for the kitchen: units, language, altitude, water,
  the number of eggs, keep boiling or heat off with the lid on, the probe, and what
  it has learned; and a **Help** page

The kitchen's settings are a page away because the defaults are right for most
people most mornings, and a first-time user should not have to answer six
questions to boil an egg.

Three behaviours are taken from the web app rather than reinvented, and all
three are the model refusing to lie:

- **The slider clamps to what is reachable.** Ask for a jammy yolk while resting
  the egg on the counter and it snaps to the softest that carryover actually
  allows, and says why in a sentence. Ask for anything at all with the heat off
  in too little water and the start button goes dead, because that pan never
  sets the white.
- **The method is always on screen.** Which cooking method a running timer is
  for is the one thing you cannot check once the controls are hidden, and a hob
  instruction like "keep it boiling" does not answer it. While a cook runs, the
  setup sentence it was started with stays under the time, with nothing to tap,
  over the doneness and peak yolk. Beside it, `EggSectionView.swift` draws the
  egg in cross-section, how set each layer is as the clock moves
  (`EggSection` in core; `DECISIONS.md` 52), the web's egg drawn the same way.
  `-sectionAhead <s>` on a debug build draws it that far on, for a screenshot
  of a cook part done (`Screenshots.swift`).
- **A cold start is provisional until you tap the boil.** The countdown says so.
  `t = 0` is the egg going into the cold pan — the same `t = 0` the physics core
  uses — so one deadline covers the ramp and the boil together, and tapping
  "Full rolling boil" re-solves the cook and moves it. The button names a full
  rolling boil because tapping at first bubbles under-measures by 15-25%. If the
  hob is slower than assumed, the estimate is pushed out rather than counting
  down to an alarm for an egg that has not started cooking.

The measured time to boil is remembered per water volume and blended with what
was already known, so one odd run — lid off, pan half empty — does not dominate.

### The third start mode answers, and then says not to

The Start control has three positions and the solver has two. Sous-vide is not a
cook this pan solver can time at all, so it is answered by `sousVideEstimate`
instead — the isothermal limit, which needs no integration: the centre
equilibrates on the sphere's own timescale and everything after that accumulates
dose at one constant rate.

The branch is taken FIRST, before anything is solved for. That ordering is the
whole of the fix the review asked for on the web side, where the branch ran
*after* a full hot-start solve and after the stats row had been painted, so the
app paid for an answer it discarded and left half of it on screen. Here it means
`Planner.recompute` returns without starting a task, `solution` goes nil, and the
nil solution is already what disables the start button — so the dead action on
that screen needs no second rule.

What it says is the honest answer and nothing more:

- **Start time: Yesterday**, at the wall-clock time you would have had to begin.
  A 58 °C bath needs about 22 h 43 min for a 68 g egg, because the white's dose
  target lives at 80 °C.
- **"water at 58 °C"** at the end of the doneness slider's heading, where it
  otherwise says "peak yolk". In a bath held at 58 °C the yolk does end up at
  58 °C, which is the point, but the label still has to say which number it is.
- **The warning.** A 58 °C bath is below the temperature at which egg white
  sets, so the white stays loose however long you leave it. The screen says so.
- **`equilibrate_s` is deliberately not on screen.** It is the one output the
  module's own caveat disowns: the model is conduction-only, and below 60 °C the
  white is liquid and convecting, so that number is too long by an unknown
  amount. The hold times do not depend on any of that.

The words — "Yesterday", "Last Tuesday", "2 weeks ago" — are in the catalogue
(`copy/en.json`); the core's `longDuration` and `startPhrase` choose which, and
only the calendar arithmetic stays in `ios/App/SousVide.swift`. The core carries
the decision and the catalogue carries the sentence. `StartChoice` is an app type for the same reason, which is why
`StartMode` in the core is still a pair.

### It asks how the egg was

At PULL the app asks the cook to say when the eggs came out - "They're in the ice
bath", "They're under the tap", "They're out" - as the web app does, and the record
calls that tap a measured pull; with no tap the grace runs out and the pull is only
assumed. After the cook it asks how the YOLK was (too soft, just right, too firm) and
how the WHITE was (runny, tender, firm), both every time and neither required. That is
not a poor interface for a rating — it is the whole measurement. Ordinal feedback is
worth one to two bits per egg, and asking for a number out of ten would collect
precision that is not there. The likelihood is INFERENCE.md §3's ordered probit.

The answer goes into the particle filter. Building the dose surface for the cook
that was actually performed costs about a second of arithmetic, so it runs in a
detached task, once, after the egg has been eaten and never while anything is
being adjusted — which is the entire reason the surface is cached rather than
simulated per particle. (There is also one decision surface per pot, built off
the main actor once the inputs settle.)

Before any feedback the filter's prior mean IS the literature value, so the app
is fully useful on day one and calibration is purely additive. Afterwards the
suggested time moves: a room-temperature 62 g egg rested on the counter at fudgy
went 4:07 to 4:29 on the first "too soft", when the time was still solved at
the posterior mean (not re-measured since). The posterior's spread on alpha plateaus near 3%
rather than collapsing, which is the honest answer — repeated agreement is
consistent with a range. It is not shown; the sentence under the time says which
way a miss is likely to go.

Settings has Forget, in both apps, which asks first. The posterior recovers on its own after a few more eggs, so this is for people who
would rather not wait.

### It can share, if the cook says so

`Sharing.swift` is the web's `src/ui/share.ts`, rule for rule (E6;
INFERENCE.md §7, COLLECTIVE.md §1): off until the cook turns it on in
Settings, where the consent sits beside the switch; then every final egg in
the log, the ones from before included, goes to the endpoint on the web app's
site, in order, each copy carrying the cook's random id; and Delete what I've
sent deletes everything under every id this phone has used, asking again at
each launch until the server confirms. It is the app's only network call:
`URLSession`, HTTPS, to `actualeggtimer.netlify.app` (a debug build can point
it at `npm run serve:dev` with `-shareServer`).

What iOS has that the web cannot is App Attest (`DECISIONS.md` 55). The first
time an id sends, the phone makes a key in its Secure Enclave and has Apple
attest it, bound to the id (`clientDataHash = SHA256(uid)`); every egg then
carries an assertion over its body, and the server files it in the attested
tier, which outweighs the web in the fit (`DECISIONS.md` 2). No entitlement is
set: a development build uses Apple's sandbox, TestFlight and the App Store
use production, and the server takes both. The simulator cannot attest at
all, so its eggs go to the open tier; that path was checked end to end, and
the attested one has not yet run on a phone.

The taste offset absorbs the difference between the user's palate and the
nominal doneness scale so that `alpha` does not have to, which keeps the physics
honest. From the first egg on, the time is chosen over every particle - taste,
noise and white offset included - by expected loss (`Decide.swift`,
INFERENCE.md §8).

It agreed with the web app on screen, measured when the time was still solved
at the posterior mean and the peak white was still shown. 62.3 g, fridge, ice bath, jammy gave **7:21** with a peak yolk of
65 °C and a peak white of 81 °C, against 441.28 s, 64.8 °C and 80.6 °C from
`solveCookTime` in TypeScript. The same egg at 400 m
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

Two are scheduled at "Eggs in": the pull, which names the cooling chosen
("Straight into the ice bath…"), and the end of the cooling step, at the yolk's
modelled peak (skipped when the egg is resting on the counter, where there is
nothing to time). With the probe on, the second asks for the reading instead,
and tapping "They're in…" re-times it from the real pull.
Cancelling removes both. A cold start reschedules them when the boil is tapped
and on every revision. The app shows the wall-clock time the alarm is set for,
and reads the pending count back from `UNUserNotificationCenter` rather than
assuming — an egg timer that claims an alarm it has not got is worse than one
with no alarm at all.

A deadline no notification holds (refused, unanswered, or not taken) is rung by `Ringer.swift` while the app is on screen — the web's beeps plus a vibration, through the silent switch, up to 40 s or until a touch — which is what "keep the app open" promises; `deadlineToRing` in EggTimerCore decides, under `swift test`.

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
counts nothing down: it revises a slow hob's estimate, pushes the Live
Activity's stage changes, and rings for a deadline no notification holds; the
screen redraws from its own `TimelineView`. This is the native form of the same discipline the web
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

### Onto someone else's phone

TestFlight, and it is a different job from this one: an App Store Connect record,
two explicit App IDs, and a family who need no cable. **`RELEASING.md`** has the
whole of it, including the two upload prerequisites already committed here and
the three ways a first archive wastes a day.

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
`EggTimerCore` is pure Swift with no UIKit and compiled for watchOS unchanged
when this was written (not rebuilt since; `Package.swift` names only iOS and
macOS). Worth it only if the wrist is meant to be the primary display.

## What Xcode is still needed for

Not much. `swift test` finishes the core in a terminal, and `xcodebuild` builds,
installs and runs the app from one too — this whole app was built and driven
without opening Xcode once.

Xcode earns its place for the parts of signing that are a conversation with
Apple's servers rather than a file: adding the Time Sensitive Notifications
capability to the App ID, and resolving a provisioning profile for a real
device. Both are once-per-machine.

The SwiftUI layer is a rewrite, not a port. `src/ui/` is about 4,400 lines of DOM
wiring and web-specific workarounds — `clock.ts` in particular exists to fight
exactly the backgrounding problem that a local notification solves properly.
The behaviour came across; the mechanism did not.
