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

Every module in `src/core/` has a Swift twin of the same name in
`EggTimerCore`, held to it by a fixture; each conformance test names the
fixture it reads. Each file's header comment is its documentation, and the
exports are its API. These are otherwise:
the named constants, which `npm run swift:constants` writes into
`Constants.generated.swift` (and `EggTimerCopy`'s); the alarm sounds'
timing (`sounds.ts`), which is those constants and a division, with no
fixture; the catalogue's renderer
and the locale formats (`copy.ts`, `format.ts`), which are `EggTimerCopy`,
so the widget links the words without the physics; and the catalogue's keys,
which `npm run copy:keys` writes into `EggTimerCopy`'s `CopyKeys.swift`.

Apps call what is exported and nothing else, and anything both apps must
agree on lives here, not in either app. The cooks an app holds are core's
(`cooks.ts`, `Cooks.swift`, over `step.ts`): the one on screen, those ended
waiting on their records, whose cook each effect is, and which eggs are
still open. What an app only stores, reads back
or merges is its own (`DECISIONS.md` 126): the web's in `src/ui`, tested by
`test/*.test.ts`; this app's in `EggTimerApp`, tested by `EggTimerAppTests`.
The share queue is `src/ui/shareState.ts` and `ShareQueue.swift`; the stored
cook `src/ui/storedCook.ts` and `StoredCook.swift`; the settings
`src/ui/settings.ts` and `Settings.swift`; the table of stores
`src/ui/stores.ts` and `StoreRegistry.swift`; and the web's alone, which of
its tabs runs the app, `src/ui/owner.ts`.
Each app maps its own gestures onto the correction in hand's events
(`hand.ts`): the web in `src/ui/edit.ts`, this app in `InHand.swift`.

The Swift core leaves out what no app calls: the
measure-by-width geometry, the science checks (`erfcTheta`, `oneTermTheta`,
`biotNumber`, `boilingPointApprox`, `saltBoilingElevation`,
`zFromActivationEnergy`) and the inference read-outs. The TypeScript keeps
them for the tests and the web's width input.

Where a transliteration was most likely to go wrong, the code says why it is
as it is. The integrator is tested against a moving surface as well as a held
one, since a step-only test cannot catch a sign error in the Duhamel term
(`ConformanceTests.swift`). `Sphere.complementaryError` is the Numerical
Recipes form, not Foundation's more accurate `erfc`, because the port's job is
to agree (`Sphere.swift`). The calibration's fixtures carry the prior's every
particle and weight, and each posterior after a fold in a summary a particle
drawn otherwise moves, since a wrong random number generator draws a
different but entirely plausible prior (`CalibrationTests.swift`); xorshift32 in `UInt32`
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

The web's colours where the app draws the same ones (`App/Palette.swift`) are
`App/Palette.generated.swift`, and the app's and the widget's tint their
AccentColor: both committed, and written from `styles.css` by
`npm run swift:constants`, which `npm test` runs.

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
its header says what it sends and when. It is in EggTimerApp, and reaches
the server and App Attest through `ShareTransport`, so `swift test` runs its
sends and its fallbacks against a fake. The app's `ShareNetwork.swift` makes
its only network call: `URLSession`, HTTPS, to the web app's site (a debug
build can point it at `npm run serve:dev` with `-shareServer`).

What iOS adds is App Attest. No entitlement is set: a development build uses
Apple's sandbox, TestFlight and the App Store use production, and the server
takes both, but files a development build's eggs in the open tier, as if
unsigned (`DECISIONS.md` 68). The simulator cannot attest at all, so its eggs
go to the open tier too.

## The alarm

`Alarm.swift` is the reason this is a native app rather than a bookmark. A
home-screen web app's timers are suspended the moment the screen locks, and
WebKit has never shipped a way to schedule an alarm, so the web version can
only ring while you are looking at it. A native app hands the system
**absolute fire dates** up front and lets it do the waiting. The app reads its
alarms back from the system rather than assuming: an egg timer that claims an
alarm it has not got is worse than one with no alarm at all.

The alarms are **AlarmKit's** (`DECISIONS.md` NNN): they sound as the Clock
app's do, through silent mode and any Focus, with a full-screen alert on the
Lock Screen, a banner over whatever is open, the app included, and the alert
on a paired watch. Each is a one-off alarm at a fixed date, with the cook's
sound and its title alone, under which the system puts Stop (iOS 26.1). There
is no AlarmKit countdown: the Live Activity below is the countdown, and one of
AlarmKit's would be a second card for the same egg, drawn by a widget of its
own. AlarmKit asks the cook once, the first time a cook starts, with the
system's own words about what alarms may do and the catalogue's
`alarm.permission` under them (`NSAlarmKitUsageDescription`, written into
`project.yml` by `npm run swift:constants`). No entitlement or App ID
capability: the usage string is all it needs.

An alarm sounds until the cook stops it. The plan drops a moment once it has
come, and cancelling an AlarmKit alarm that sounds stops it, so re-setting the
alarms leaves one whose moment has come, sounding or about to (the app's tick
can beat the system to it); taking the eggs out in the app stops the pull's,
and the cook leaving the screen, by Cancel or Start again, stops both.

`Ringer.swift` rings in the app only a deadline that comes while it is on
screen and that no alarm of the system's holds, read back at the deadline
(`deadlineToRing`): with alarms refused, or one not set, the line above Cancel
says "keep the app open", and this is what makes it true. A deadline the
system holds, its alarm rings, over the app too.

The alarm sounds, `App/Sounds/alarm-<sound>-<moment>.caf`, are rendered from
the web's sounds by `npm run sounds` (macOS; `tools/sounds.ts` says how), never
edited by hand. `npm run ios:build` holds each file an alarm can name to
being in the built app's bundle, under 30 s, in a format a notification
plays, as `afinfo` reads it: Apple documents no limits for AlarmKit's named
sounds, so these are the ones a notification's sound had.

### Hearing the alarms in seconds

A debug build takes `-alarmTest <s>`: once the app is on screen and the
alarms question answered, the cook's two alarms are set through
`Alarm.schedule`, the pull's `s` from now and the cooling's end `2s` from now;
with the alarms refused, the app rings each itself at its moment if it is on
screen, as a cook's deadline does. `-alarmSound timer|cuckoo|hen` rings with
that sound for the launch, nothing stored. Start from the idle screen: the
test's alarms replace a running cook's. The app's ring lasts up to 40 s; a
touch stops it, and the second replaces the first.

- **On the phone**: in Xcode, Product > Scheme > Edit Scheme > Run >
  Arguments. `-alarmTest 10`, `-alarmTest 30` and the three `-alarmSound`
  are listed under Arguments Passed On Launch, unticked (`project.yml`); tick
  one `-alarmTest` and one `-alarmSound`, and run on the phone. Only a run from
  Xcode passes them, and `xcodegen` unticks them again. `-alarmTest 30` leaves
  time to lock the phone or leave the app before the pull.
- **Not on a simulator.** An iOS 26 simulator asks and sets the alarms, but
  its SpringBoard crashes the moment one sounds; an iOS 27 one never asks
  (`GOTCHAS.md`). A simulator shows the question and the alarms read back,
  never an alarm sounding.

What each way should do, and what the debug log (`Library/Caches/aet.log`)
says of it:

| the alarms | the app | the pull and the cooling's end | the log |
|---|---|---|---|
| allowed | anywhere, silent mode on or off, in a Focus or not | the system's alarm, the chosen sound, until Stop; over the app if it is open | `alarmAuthorization` `authorized`, `scheduled` with the `sound` it names and `bundled` true, `pending` with each `scheduled`, then `alerting`; `ringSkipped` with "the system's alarm rings it" |
| refused | on screen | the app's ring, looped up to 40 s, vibrating | `alarmAuthorization` `denied`, `ring`, `ringing` with `playing` true and the media `volume` |
| refused | in the background, or the phone locked | nothing: the line above Cancel said to keep the app open | `ringSkipped` |

The system's alarm plays at the ringer's volume, the app's ring at the media
volume.

`Cook.swift` runs the cooks as core's state machine (`Cooks.swift`), and derives every phase
from the plan's deadlines and the clock rather than counting down, so a ticker
that stops — backgrounded, locked, or simply busy — cannot make the egg wrong.
A cook in progress is stored and picked up at launch, because a force-quit
leaves the alarm with the system and the card on the Lock Screen, and an app
that reopened to an idle screen would teach the cook to distrust an alarm that
was, in fact, correct.

## The Live Activity

`Widget/CookLiveActivity.swift` puts the countdown on the Lock Screen and in
the Dynamic Island: the alarm says *when*, the card says *how long left*
without unlocking anything. Every countdown is `Text(timerInterval:)`,
ticked by the system from two absolute dates, so nothing has to wake up to keep
it honest. It has worked on the owner's phone, on the Lock Screen and in the
Dynamic Island. Three things that cost time here — `Activity` is not Sendable, a
widget extension needs a real `Info.plist`, and its version must match the
app's — are in `GOTCHAS.md`.

## The fast clock and the scripted checks

`npm run ios:e2e` checks on a simulator what only a device can, in six
scenarios: a cook relaunched in each phase over the system's alarms and Live
Activity (`relaunch`), the alarms as the system holds them (`alarms`), a
cook with the alarms refused that the app slept through (`asleep`), the
app leaving the screen with a change in hand (`change-kept-on-hide`), and the
layout at the largest text size (`one-layout-largest`, `idle-largest`). What
the app's logic decides is `swift test`'s (`EggTimerAppTests`); what its
bundle holds, `npm run ios:build`'s.

The scenarios are UI tests (`ios/UITests`, the `EggTimerUITests` target):
XCUITest taps the app's buttons, the sentence's clauses and the steppers as a
finger would, finding each by its accessibility identifier, while the test
freezes the app's clock at each moment it checks and steps it from one to the
next, and reads what happened from the app's debug log. The clock's steps and
the log go through a directory on the Mac (`-debugDir`), which a simulator's
app and its tests both reach. A control a scenario presses needs an
identifier, on the control itself or on a group that keeps its children's
(`GOTCHAS.md`, "XCUITest"); a stepper of a group of the cook's choices has
`<group>.stepper` (`testID`, `Controls.swift`).

All of them run in one `xcodebuild` on one simulator: XCUITest cannot
uninstall the app, so each scenario's first launch resets it to what a fresh
install has (`-resetState`), and the device is warmed up once, before the
first, its alarms allowed at the system's question (`GOTCHAS.md`). The
device is an iOS 26 simulator: an iOS 27 one never asks. No alarm of the
system's comes in a test: a simulator's SpringBoard crashes when one sounds,
and under the tests' frozen clock each is a day off.

The headers say the rest: `tools/iosE2e.ts` (the scenarios, how to run some),
`tools/iosHarness.ts` (the device and the run of the tests),
`ios/UITests/Harness.swift` (a scenario's run of the app), and in
`ios/EggTimerCore/Sources/EggTimerApp`, `AppClock.swift` (the clock it steps)
and `DebugLog.swift` (the launch arguments and the debug log). `npm run
ios:shots` reaches its screens by UI tests too (`ios/UITests/Shots.swift`).
Not in `npm run verify`; CI runs it beside the iOS build, on `main` and on
demand (`DECISIONS.md` 158).

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

Note the Team ID is the certificate's `OU` field, not the ten characters in its
common name — that is the certificate id, and using it silently produces a
project that cannot sign. Read it off a profile instead:

```sh
security cms -D -i ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles/*.mobileprovision \
  | plutil -extract TeamIdentifier.0 raw -
```

The app carries no entitlement: AlarmKit needs only its usage string in the
Info.plist, which `npm run ios:archive` checks. What says signing worked is
that Xcode resolved a profile named for the bundle id rather than the wildcard
`iOS Team Provisioning Profile: *`, which TestFlight refuses
(`RELEASING.md`).

A different team means one line in `project.yml` and a new bundle identifier
prefix.

### Onto someone else's phone

TestFlight, and it is a different job from this one: an App Store Connect record,
two explicit App IDs, and a family who need no cable. **`RELEASING.md`** has the
whole of it.

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

Nothing to do. AlarmKit forwards a sounding alarm's alert to a paired watch
(Apple's "Scheduling an alarm with AlarmKit"), which is exactly the situation
this app is built for: the phone across the kitchen, the watch on the wrist.
Not yet seen on a watch.

What a watch does not have is the countdown. Closing that needs a real watchOS
target, and
the honest cost is a second UI to keep in sync rather than the target itself —
`EggTimerCore` is pure Swift with no UIKit and compiled for watchOS unchanged
when this was written (not rebuilt since; `Package.swift` names only iOS and
macOS). Worth it only if the wrist is meant to be the primary display.

## What Xcode is still needed for

Not much. `swift test` finishes the core in a terminal, and `xcodebuild` builds,
installs and runs the app from one too — this whole app was built and driven
without opening Xcode once.

Xcode earns its place for the part of signing that is a conversation with
Apple's servers rather than a file: resolving a provisioning profile for a
real device, once per machine.

The SwiftUI layer is a rewrite, not a port. `src/ui/` is about 9,800 lines of DOM
wiring and web-specific workarounds — `clock.ts` in particular exists to fight
exactly the backgrounding problem that a system alarm solves properly.
The behaviour came across; the mechanism did not.
