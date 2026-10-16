# iOS port

`EggTimerCore` is the physics, transliterated from `src/core/` and held to the
same numbers by a conformance suite. It runs headless, and that is the point:
the core is finished in a terminal, and the app on top is a separate argument.

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

Tolerance is 1e-12, relative above 1 and absolute below — a few ulps of a
double, which is all that differing libm implementations of `exp`, `sin` and
`log10` can cost. An algebraic mistake is never that small.

## The core, module by module

Every module in `src/core/` has a Swift twin, held to it by a fixture. This
table is the map; each file's header comment is its documentation, and the
exports are its API. Apps call what is exported and nothing else, and
anything both apps must agree on lives here, not in either app. What an app
only stores, reads back or merges is its own (`DECISIONS.md` 126): the web's
in `src/ui`, tested by `test/*.test.ts`; this app's in `EggTimerApp`, tested
by `EggTimerAppTests`. The share queue is `src/ui/shareState.ts` and
`ShareQueue.swift`; the stored cook `src/ui/storedCook.ts` and
`StoredCook.swift`; the settings `src/ui/settings.ts` and `Settings.swift`;
the table of stores `src/ui/stores.ts` and `StoreRegistry.swift`; and the
web's alone, which of its tabs runs the app, `src/ui/owner.ts`.

| module | what it answers | main entry points | Swift | fixture |
|---|---|---|---|---|
| `constants.ts`, and every module's named constants | every physical and model constant (README §6), and each module's own | - | `Constants.generated.swift` (and `EggTimerCopy`'s), made by `npm run swift:constants` | none: `swift:constants --check` |
| `thermo.ts` | altitude and pressure to a boiling point | `boilingPointAtAltitude` | `Thermo.swift` | `core.json` |
| `geometry.ts` | an egg from its mass; the size classes by region | `eggFromMass`, `sizeClassesFor` | `Geometry.swift` | `core.json` |
| `kinetics.ts` | the Arrhenius dose | `createDose`, `accumulateDose` | `Kinetics.swift` | `core.json` |
| `sphere.ts` | the modal/Duhamel solver | `createSphere`, `stepSphere` | `Sphere.swift` | `core.json` |
| `protocol.ts` | the water's schedule: ramp, dip, heat off, cooling | `bathTemperature`, `panTimeConstant` | `Protocol.swift` | via `scenarios.json` |
| `solve.ts` | the cook time for a doneness, and what is reachable | `solveCookTime`, `simulate`, `donenessFromSlider` | `Solve.swift` | `scenarios.json` |
| `section.ts` | the egg in cross-section, a tick at a time: each ring's temperature and how set; the egg the settings aim for | `createSection`, `advanceSection`, `sectionView`, `previewSection` | `Section.swift` (`EggSection`) | `section.json` |
| `sousvide.ts` | the isothermal limit | `sousVideEstimate` | `SousVide.swift` | `sousvide.json` |
| `doseGrid.ts` | the cached dose surface and its lookups | `buildDoseGrid`, `buildRequestedGrid` | `DoseGrid.swift` | `calibration.json` |
| `infer.ts` | the particle filter: prior, likelihood, fold | `createPrior`, `updatePosterior`, `probeLikelihood` | `Infer.swift` | `calibration.json`, `probe.json` |
| `record.ts` | the egg log, and the posterior as its replay; the record both apps make of a cook; what a launch keeps of the store; the calibration grid, and the filter's size and seed | `recordFor`, `parseLog`, `foldRecord`, `replay`, `loadDecision`, `calibrationGrid` | `Record.swift` | `record.json` |
| `population.ts` | the population a prior is drawn from (E7), and its centre | `parsePopulation`, `priorStart` | `Population.swift` | `prior.json` |
| `decide.ts` | the chosen time and its odds, and the nudge (E8); the key of a decision surface, every number to the bit, which the plan and each app's own caches use | `decide`, `chooseCookTime`, `hitOdds`, `nudgeSeconds`, `inputsKey` | `Decide.swift` | `decide.json` |
| `outcome.ts` | which way a miss goes, and the likely level | `predictOutcome` | `Outcome.swift` | `outcome.json` |
| `certainty.ts` | how sure, in words: very certain, a ballpark or a wild guess; the 90% interval in words; a likely time range | `certaintyAt`, `wordCertainty`, `askedWord` | `Certainty.swift` | `certainty.json` |
| `reach.ts` | the odds at every level, the shading, the advice, and the answer on screen with its time decided | `oddsProfile`, `answerAt`, `decideAnswer`, `protocolAdvice` | `Reach.swift` | `reach.json` |
| `inputs.ts` | what a cook enters and a fresh install starts from: the bounds on every number, the defaults, the egg-temperature buttons, the room the model is told about | `LIMITS`, `DEFAULTS`, `clamp`, `roomInUse`, `ambientFor` | `Inputs.swift` | `inputs.json` |
| `slider.ts` | the doneness slider: its grid, the nearest label, which words can be reached, the yolk temperature asked for, and the refusal verdict | `snapUp`, `anchorNear`, `anchorReachable`, `verdictFor` | `Slider.swift` | `slider.json` |
| `texture.ts` | the texture bands, and the keys the note is said in | `textureFor`, `textureNoteKeys` | `Texture.swift` | `texture.json` |
| `boil.ts` | boil memory: a boil remembered by volume, and the estimate for a volume | `rememberBoil`, `estimateTimeToBoil` | `Boil.swift` | `boil.json` |
| `sounds.ts` | the alarm sounds and each sound's timing, as data `swift:constants` writes into Swift | `ALARM_PERIOD_S`, `alarmRepeats` | `Sounds.swift` | none |
| `wording.ts` | which catalogue key each part of the screen says | `phaseKeys`, `refusalKey`, `directionKey`, `clauseKeys` | `Wording.swift` | `wording.json`, `sousvideCopy.json` |
| `units.ts` | Metric and Imperial: steps, bounds, the round trip | `measureFor`, `display`, `parse`, `quantityText` | `Units.swift` | `units.json` |
| `running.ts` | a running cook: its phases over its deadlines, its start and the log of everything since, folded, the plan derived from them, each move the cook makes | `phaseAt`, `cookSetupOf`, `replan`, `eventsDue`, `writeEvents`, `startCook`, `foldCook`, `withBoil`, `withOut`, `corrected`, `startCorrected`, `boilToRemember` | `Running.swift` | `running.json` |
| `asRan.ts` | the cook as it ran: the plan kept from the pull on, what Done shows, the record's facts, what a cook leaves when it ends | `keepAsRan`, `asRanShown`, `asRanCorrected`, `cookFactsFor`, `cookEnding` | `AsRan.swift` | `running.json`, `step.json` |
| `step.ts` | the running cook as one state machine: an event in, the cook, its plan, what it waits for and the effects out (persist, alarms, ring, log, forget, send) | `step` | `Step.swift` | `step.json` |
| `readout.ts` | what the readout says while a cook runs: keys and the numbers they take | `readoutAt` | `Readout.swift` | `step.json` |
| `share.ts` | sharing's contract with the server: an id, the number each egg is filed under, what a sender makes of the endpoint's answer, when a deletion is done | `isUid` (the server's too), `nextSeq`, `shareReply`, `deletionDone` | `Share.swift` | `share.json` |
| `copy.ts`, `format.ts` | the catalogue's renderer; numbers and times by locale | `render`, `pluralCategory`, `formatNumber`, `formatTimeOfDay` | `EggTimerCopy`: `Copy.swift`, `Format.swift` | `copy.json`, `format.json` |
| `copyKeys.ts`, made by `npm run copy:keys` | the catalogue's keys, and each key's arguments | `CopyKey`, `CopyKeyArgs` | `EggTimerCopy`: `CopyKeys.swift`, made with it | none: `copy:keys --check` |

The Swift core leaves out what no app calls: the
measure-by-width geometry, the science checks (`erfcTheta`, `oneTermTheta`,
`biotNumber`, `boilingPointApprox`, `saltBoilingElevation`,
`zFromActivationEnergy`) and the inference read-outs. The TypeScript keeps
them for `npm run validate`, the tests and the web's width input.

Where a transliteration was most likely to go wrong, the code says why it is
as it is. The integrator is tested against a moving surface as well as a held
one, since a step-only test cannot catch a sign error in the Duhamel term
(`ConformanceTests.swift`). `Sphere.complementaryError` is the Numerical
Recipes form, not Foundation's more accurate `erfc`, because the port's job is
to agree (`Sphere.swift`). The calibration's fixtures carry every particle and
every weight, since a wrong random number generator draws a different but
entirely plausible prior (`CalibrationTests.swift`); xorshift32 in `UInt32`
reproduces JavaScript's signed shifts, and a sort by predicted time takes the
original index as its tie-break, because Swift's sort is not stable
(`Infer.swift`).

### How closely they agree

Tighter than expected. Probing the whole-cook suite at 1e-15 put the worst
disagreement at **7e-15 relative**, on a dose accumulated over some 20,000
calls each to `exp()` and `pow()`; cook times, peak temperatures and the
verdicts (`reachable`, `whiteSets`) agreed exactly. The suite runs at 1e-12:
three orders of headroom over that noise floor, and still ten orders tighter
than anything that could change an answer.

The whole-cook suite takes about 14 seconds, nearly all of it the standing
scans. That is the price of not assuming monotonicity, and it is worth paying
here — the standing scenarios in the fixtures are the ones a bisection would
have got wrong.

## The app

```sh
cd ios && xcodegen        # regenerate ActualEggTimer.xcodeproj from project.yml
open ios/ActualEggTimer.xcodeproj
```

The project file is **generated, not committed**. `project.yml` is the source of
truth and fits on a screen; a pbxproj is three thousand lines of machine-written
XML that every branch conflicts on and nobody reviews. `ActualEggTimer.xcodeproj`
is gitignored — run `xcodegen` after cloning, after adding or removing a file,
and after any change to `project.yml`. So are `Widget/Info.plist` and `App/Info.plist`, which
xcodegen writes from the same file (`GOTCHAS.md` says why the widget's cannot be
generated by the build system instead).

The screen is the web's, one screen for setting up, boiling and correcting a
cook, and `UI.md` describes it, with what differs on iOS. The kitchen's
settings are a page away because the defaults are right for most people most
mornings, and a first-time user should not have to answer six questions to
boil an egg.

Two behaviours are taken from the web app rather than reinvented, and both are
the model refusing to lie:

- **The slider clamps to what is reachable.** Ask for a jammy yolk while resting
  the egg on the counter and it snaps to the softest that carryover actually
  allows, and says why in a sentence. Ask for anything at all with the heat off
  in too little water and the start button goes dead, because that pan never
  sets the white.
- **A cold start is provisional until you tap the boil.** `t = 0` is the egg
  going into the cold pan, the same `t = 0` the physics core uses, so one
  deadline covers the ramp and the boil together, and tapping "Rolling boil"
  plans the cook again. If the hob is slower than assumed, the estimate is
  pushed out rather than counting down to an alarm for an egg that has not
  started cooking.

The measured time to boil is remembered per water volume and blended with what
was already known, so one odd run — lid off, pan half empty — does not
dominate.

### Sous-vide answers, and then says not to

The Start control has three positions and the solver has two. Sous-vide is
answered by `sousVideEstimate` instead, and its answer, a start time in the
past for a 58 °C bath, is the model's real conclusion, not the code declining
to work (`SousVide.swift`, `src/core/sousvide.ts`). `equilibrate_s` is
deliberately not on screen: it is the one output the module's own caveat
disowns, since below 60 °C the white convects and the conduction-only model
makes that number too long by an unknown amount.

### It asks how the egg was

After the cook it asks which yolk the cook got and how the white was, both
every time and neither required. That is not a poor interface for a rating — it
is the whole measurement. Ordinal feedback is worth one to two bits per egg,
and asking for a number out of ten would collect precision that is not there.
The likelihood is `INFERENCE.md` §3's ordered probit, and the time is chosen
from the posterior by expected loss (§8).

The dose surface for the cook actually performed costs about a second of
arithmetic, so it is built once, off the main actor, after the egg has been
eaten and never while anything is being adjusted — which is the entire reason
the surface is cached rather than simulated per particle.

### It can share, if the cook says so

`Sharing.swift` is the web's `src/ui/share.ts` over the same state, kept
alike (`ShareQueue.swift`, `src/ui/shareState.ts`; `INFERENCE.md` §7), and
its header says what it sends and when. It is the
app's only network call: `URLSession`, HTTPS, to the web app's site (a debug
build can point it at `npm run serve:dev` with `-shareServer`).

What iOS adds is App Attest. No entitlement is set: a development build uses
Apple's sandbox, TestFlight and the App Store use production, and the server
takes both, but files a development build's eggs in the open tier, as if
unsigned (`DECISIONS.md` 68). The simulator cannot attest at all, so its eggs
go to the open tier too.

## The alarm

`Alarm.swift` is the reason this is a native app rather than a bookmark. A
home-screen web app's timers are suspended the moment the screen locks, and
WebKit has never shipped a way to schedule a local notification, so the web
version can only ring while you are looking at it. A native app hands the
system **absolute fire dates** up front and lets it do the waiting. The app
reads the pending count back from the system rather than assuming: an egg
timer that claims an alarm it has not got is worse than one with no alarm at
all. Where no notification holds a deadline, `Ringer.swift` rings in the app
while it is on screen.

Both fire at **`.timeSensitive`** interruption level, which is what gets them
through a Focus mode. That level needs the
`com.apple.developer.usernotifications.time-sensitive` entitlement, which needs
signing, which needs the Apple Developer Program — see **Signing** below.
Unsigned simulator builds carry no entitlement and fall back silently to the
default level, which is the right failure: quieter, never wrong. A device
build carries the entitlement, signed and verified, and the alarm fires at
`.timeSensitive` in the foreground too.

The alarm sounds, `App/Sounds/alarm-<sound>-<moment>.caf`, are rendered from
the web's sounds by `npm run sounds` (macOS; `tools/sounds.ts` says how), never
edited by hand.

`Cook.swift` runs the cook as core's state machine, and derives every phase
from the plan's deadlines and the clock rather than counting down, so a ticker
that stops — backgrounded, locked, or simply busy — cannot make the egg wrong.
A cook in progress is stored and picked up at launch, because a force-quit
leaves the alarm with the system and the card on the Lock Screen, and an app
that reopened to an idle screen would teach the cook to distrust an alarm that
was, in fact, correct.

## The Live Activity

`Widget/CookLiveActivity.swift` puts the countdown on the Lock Screen and in
the Dynamic Island: the notification says *when*, the card says *how long
left* without unlocking anything. Every countdown is `Text(timerInterval:)`,
ticked by the system from two absolute dates, so nothing has to wake up to keep
it honest. It has worked on the owner's phone, on the Lock Screen and in the
Dynamic Island. Three things that cost time here — `Activity` is not Sendable, a
widget extension needs a real `Info.plist`, and its version must match the
app's — are in `GOTCHAS.md`.

## The fast clock and the scripted checks

`npm run ios:e2e` (about four minutes) checks on a simulator what only a
device can: the layout, relaunches over the system's notifications and Live
Activity, a notification delivered while the app is gone, the app leaving the
screen, the keys an earlier build left. What the app's logic decides is `swift test`'s
(`EggTimerAppTests`). The headers say the rest: `tools/iosE2e.ts` (the
scenarios, how to run some), `tools/iosHarness.ts` (the simulator driver), and
in `ios/EggTimerCore/Sources/EggTimerApp`, `AppClock.swift` (the clock it
steps) and `Screenshots.swift` (the launch arguments and the debug log). Not
in `npm run verify`; CI runs it after the iOS build.

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
