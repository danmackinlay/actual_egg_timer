# LOGBOOK.md — what was verified, and what it cost to find out

Companion to `PLAN.md`, which is the build STATE: what exists, what the frozen
API is, and what is next. This file is the RECORD: what was actually checked,
against what, and every lesson that was expensive enough to be worth writing
down.

They were one file until September 2026, and it was 537 lines of frozen API,
phase checklist, three verification records, a handoff and a table of RNG
z-scores. Nobody can keep a file like that true, and it was not true: its status
line said 27 tests while three other lines in the same file said 21, and the iOS
verification record claimed a phase transition that the iOS app had never
performed. State goes stale in a way you can check against the code; a record
goes stale in a way you cannot. Keeping them apart is the only way either one
stays honest.

**Nothing in this file is a plan.** If something here needs doing, it belongs in
`PLAN.md`.

---

## Verification record (v1)

- `npm test` — all pass
- `npm run validate` — all checks pass, all targets reproduced
- Browser (Chromium, 390x844 phone viewport): no console or page errors; full
  cold-start flow IDLE -> HEATING -> COOKING verified; the boil button relabels
  to "Full rolling boil" in HEATING; `aria-live` announcements fire.

Calibration verified in-browser: feeding back "too soft" four times walks the
suggestion 7.73 -> 9.69 min (correct direction), posterior spread narrows
10.3% -> 6.0%, and the particle set round-trips through localStorage (~34 KB).

The DONE screen and the feedback path were confirmed in the browser by
overriding `Date.now` to run 30 minutes fast (the machine is a pure function of
it): COOKING -> PULL -> COOLING -> DONE within three ticks, the readout stays on
the eaten egg, "Too soft" moves the next suggestion 7:44 -> 8:21 and the posterior
round-trips through localStorage. The mute toggle (a persisted setting, in the
readout so it is reachable in every phase) was checked the same way: a whole
fast-forwarded cook created zero oscillator nodes.

Two things that look like bugs and are not:
1. **"Runny" is greyed out on a cold start.** Correct. The egg sits in the water
   through the whole ramp, so the white takes more dose and the softest reachable
   level is 0.030, not 0.000. A hot start does reach fully runny. This is the
   doneness constraint working.
2. **The action bar appears to overlap the start-mode selector in a full-page
   screenshot.** Artifact of `fullPage` compositing a `position: fixed` bar.
   `main` carries 148px bottom padding and the control clicks fine.

## Debt pass (September 2026)

What was cleaned up, so nobody re-introduces it:

- `protocol.ts` had one six-argument `surfaceTemperature` covering both the
  in-water and the cooling schedule, called with dummy values for the phase
  that did not apply. It is now `bathTemperature(setup, t)` and
  `coolingTemperature(setup, ...)`, and `simulate` picks one by phase.
- The standing solver ran up to three separate scans and reported a
  `hardestLevel` that was only a lower bound when the target was reachable. It
  now samples both doses once over the horizon and answers every question from
  that curve.
- The bisection returned the bracket midpoint, which sat a hair below the
  target about half the time, so a held boil reported `whiteSets: false` at
  random and the app showed the standing-method refusal text for a cold start.
- Feedback on a hot start with the heat off built the calibration grid with
  `timeToBoil_s = 0`, i.e. a pan that never cools. The app now has one
  `timeToBoil_s()` that the solver, the machine and the calibration all read.
- Input bounds lived in the markup, in `readInputs` and in `loadSettings`;
  they are one `LIMITS` table now, applied to the elements at boot. The 4 °C
  and 20 °C presets and the 58 °C bath are likewise rendered into their labels.
- Dead state removed: `boiledAt_ms`, `isRunning`, `clearCalibration`,
  `solvedBoil_s`, and the `recompute` branch for mid-cook input changes that
  the stylesheet makes impossible.

---

## Things that cost an hour to find out

- **The Xcode project is generated.** `cd ios && xcodegen`. It is gitignored,
  and so is `ios/Widget/Info.plist`. Do not look for either in the history.
  `ios/project.yml` is the source of truth and fits on a screen.
- **The Team ID is the certificate's `OU`, not the number in its name.**
  `Apple Development: someone@example.com (7RNTX96N3A)` shows the certificate
  ID in the parentheses; `DEVELOPMENT_TEAM` wants the `OU` field, which is a
  different ten-character string. Read it off a provisioning profile
  (`security cms -D -i x.mobileprovision`, then `TeamIdentifier`) rather than
  off the identity list, where it is not shown at all.
- **`INFOPLIST_KEY_*` build settings cannot express a nested dictionary.**
  `INFOPLIST_KEY_NSExtensionPointIdentifier` is accepted and then silently
  dropped, and the widget extension builds, embeds, and is simply never
  recognised as a widget. An extension needs a real `Info.plist`.
- **An app extension whose version does not match its host app is refused at
  install time.** Both read `$(MARKETING_VERSION)`.
- **ActivityKit's `Activity` is a non-Sendable class with off-actor methods**, so
  Swift 6 will not let a `@MainActor` object hold one and await on it. Ask the
  system what is running instead of keeping the handle.
- **`@Observable` creates no dependency on a property the view never reads.** A
  counter bumped by a ticker to force a redraw does nothing at all. Countdowns
  are `TimelineView`'s job. This bug sat on screen for a whole release because
  the only cook anyone had watched was watched from the Lock Screen.
- **A foreground notification shows nothing by default** — no banner, no sound,
  not even a Lock Screen entry. It needs
  `UNUserNotificationCenterDelegate.willPresent`.
- **Interleaving a settings load with a settings save clobbers the load.**
  Restoring one property fired a `didSet` that wrote the whole object back while
  the rest were still at their defaults, so every setting but the first reverted
  on the next launch. Suppress saving while loading.
- **SwiftUI `Slider` ignores synthetic drags** from the simulator control tools —
  `swipe` and a slow sampled `touch_path` both do nothing. Taps land fine
  (buttons, steppers, segmented controls, system alerts). To exercise a
  slider-dependent path, write the value into the app's `UserDefaults` plist in
  the simulator container and relaunch; an incremental build is two seconds.
- **`sudo xcode-select -s ...` was a red herring.** When the simulator
  integration reports "Xcode is installed but not selected" while
  `xcode-select -p` already prints the right path, the fix is restarting the
  desktop app, not the command.
- **More than one agent may be committing in this working tree.** Stage
  explicitly rather than `git add -A`, or you will sweep up someone else's
  half-finished edit and put your name on it.
- **`xcrun simctl spawn <udid> defaults` is NOT the app's UserDefaults.** It
  reads and writes a domain outside the app's container. Seeding a value that
  way and then watching the app fail to delete it looks exactly like a broken
  reset - the app reads the outer value at launch, removes only its own, and the
  outer one reappears. `defaults read` also cannot see a value the app wrote
  itself, which is the tell. Drive the app to create the state, and check the
  result on screen after a terminate-and-relaunch.
- **Fixtures are generated from the TypeScript and never regenerated to make
  the Swift pass.** If that rule is broken once, the reference implementation
  silently becomes whatever the port happens to do, and the conformance suite
  becomes decoration.

---

## Verification record (iOS, September 2026)

Driven in the iPhone 17 simulator on iOS 27, against numbers computed from
`src/core/` in Node for the same inputs:

| scenario | app | TypeScript |
|---|---|---|
| 62.3 g, fridge, ice bath, jammy | 7:21, 65 / 81 °C | 441.3 s, 64.8 / 80.6 °C |
| same at 400 m | 7:31, boils at 98.7 °C | 450.9 s, 98.7 °C |
| room egg, cold start, 8 min boil | 10:20, 2:20 after boil | 620.45 s |
| room egg, counter cooling, jammy | refused, snaps to fudgy | `reachable: false`, softest 0.608 |
| heat off, 2 L | start button dead | `whiteSets: false` |

Also confirmed on screen: the heating phase and its "Full rolling boil" button;
the countdown ticking down to the pull; the alarm's wall-clock time
matching the deadline, and its banner appearing with the app in the FOREGROUND;
the Live Activity in the Dynamic Island and on the Lock Screen; settings
surviving a relaunch; and a cook in progress surviving being killed and
reinstalled mid-cook.

**One line of this record was wrong from the day it was written.** It claimed
"COOKING -> PULL -> DONE, with the cooling step correctly skipped for a counter
rest" had been confirmed on screen. That is the WEB app's behaviour. This app
checked for a cooling deadline before checking the pull grace, and a counter
rest has no cooling deadline, so it went COOKING -> DONE and never showed the
pull at all - while still firing the pull notification at a screen that already
said Done. Nobody had watched a counter rest; the line described what the other
app did, and a verification record that describes the wrong app is worse than no
record. See the September 2026 conformance pass below.

Three bugs were found by watching rather than by reading, and all three were
invisible to the way the app had been checked before:

1. **The on-screen countdown never moved.** `@Observable` records no dependency
   on a property the view does not read, so the ticker's counter did nothing.
   The previous verification watched a backgrounded cook, where the only clock
   on screen was the system's.
2. **The alarm was silent with the app open.** iOS delivers a foreground
   notification to the app and shows nothing at all unless the delegate says
   otherwise. The previous verification had the app backgrounded.
3. **Every setting but the first reverted on relaunch**, because restoring one
   property fired a save of all of them while the rest were still at defaults.

### Calibration, verified against the reference

One real cook driven to the end in the simulator, then "Too soft", with the same
scenario computed independently in Node beforehand:

| | app | TypeScript |
|---|---|---|
| suggested, uncalibrated | 4:07 | 247.2 s |
| weighted mean alpha after one "too soft" | 1.567630e-7 | 1.5676e-7 |
| suggested, after | 4:29 | 269.1 s |
| reported spread | ±11% | 10.8% |

The posterior round-trips through `UserDefaults` at 39.8 kB for 1000 particles,
survives a reinstall, and "Forget what it learned" clears the key and returns
the suggestion to 4:07 - which is the literature value, exactly as it should be,
because the prior's mean IS the literature value.

### Three things a real egg found that the simulator did not

Reported from an actual cook on a phone, 18 September:

1. **You could not tell which method the running timer was for.** The label said
   "Cooking - keep it boiling", which is an instruction to the HOB and says
   nothing about whether the egg went into cold water or boiling. The controls
   are hidden during a cook, so there was no way to check. Fixed by stating the
   method on screen - "Cold start - then ice bath" - and by making the idle
   subline say what the clock is measured FROM rather than the ambiguous "from
   eggs in".

2. **Cancel did not reset.** Two separate causes, both real:
   - `Kitchen.cookTime` writes its answer into `solution` as a side effect,
     which is what lets a cold start's boil tap correct the readout. Nothing
     re-solved on cancel, so the idle screen kept showing the abandoned cook's
     numbers - including an "after boil" of 0:00, because the stale total was
     computed against the MEASURED ramp while the stat used the remembered one.
     Cancel now re-solves.
   - Every `await` in `Cook` was holding values read BEFORE it. A cancel landing
     during `recordBoil`'s solve was overwritten the moment it returned:
     `setDeadlines` wrote `pullAt` back from a captured `startedAt`, and since
     `phase` keyed off `pullAt` alone, the app sprang back to a cook that had
     been stopped. Fixed with a generation counter checked after every await,
     and by making `phase` require a start, a deadline AND a ticket - so a
     half-written cook is unrepresentable rather than merely unlikely.

3. **The default is now a cold start**, which is the better way to boil an egg:
   the shell is never thermally shocked, and the app gets to MEASURE the ramp
   instead of assuming it.

Also fixed while in there: `Cook()` did its restore in `init`, and
`@State private var cook = Cook()` evaluates its initial value every time the
view struct is constructed. SwiftUI keeps the first and throws the rest away -
along with any ticker they started. Restoring is now something the view asks
for, after the solver is wired up.

### The random number generator, measured rather than argued about

`infer.ts` uses xorshift32 (shifts 13/17/5) because JavaScript's bitwise
operators are 32-bit, which rules out the 64-bit generators one would otherwise
reach for without dragging in BigInt. It is a pure LFSR over GF(2) and fails the
linearity tests in a full battery, so it is fair to ask whether it is good
enough here. Two details make the question sharper: `toUnit` keeps only the LOW
24 bits, which are an LFSR's weakest, and Box-Muller is fed two CONSECUTIVE
outputs, which is where a lattice would show.

Measured, in exactly the usage the app has:

| test | result | noise floor |
|---|---|---|
| uniformity, 1000 bins, 2e6 draws | z = −0.53 | ±1 |
| 2D chi-square, 64x64, on the Box-Muller pairs | z = +0.14 | ±1 |
| serial correlation, lags 1, 2, 3, 5, 17 | ≤ 4.8e−4 | 7.1e−4 |
| skew / kurtosis of the three prior normals | ≤ 0.003 / 3.010 | 0 / 3 |
| correlation between the three prior dimensions | ≤ 1.5e−4 | 1.4e−3 |

The cross-dimension correlations are an order of magnitude BELOW the sampling
noise of the test, so the six consecutive outputs behind each particle are not
detectably dependent. The known failures of xorshift32 need ~1e8 values and
probe GF(2) structure directly; a 1000-particle filter reading weighted means
and quantiles is not sensitive to them.

One real limit, harmless here: 24-bit uniforms truncate the Gaussian tail at
about ±5.8 sigma. The prior spans ±4.

Verdict: leave it. Replacing it would change the reference implementation, hence
every fixture, and would buy nothing measurable. If it is ever replaced, the
32-bit-portable upgrade is **xoshiro128\*\***, which keeps exact cross-language
reproducibility - and that is worth keeping, because bit-identical particles are
what make the conformance suite able to catch an error in the WEIGHTS or the
RESAMPLING, where a bug produces a plausible posterior rather than a wrong one.

---

## Conformance pass (18 September 2026)

A review of both apps found roughly thirty things. Almost all of them held, and
they had one cause: the physics was fixtured and held to the port particle by
particle, and the layer directly above it — the policy that turns a `Solution`
into a cook — was hand-duplicated in TypeScript and Swift with nothing holding
the copies together and no test on either side.

That layer is now `src/core/policy.ts`, `EggTimerCore/Policy.swift` and
`fixtures/policy.json`. What follows is what was actually checked.

### Divergences that were real, and user-visible

| | web | iOS |
|---|---|---|
| counter rest | COOKING → PULL → DONE | **COOKING → DONE**, pull screen never shown |
| feedback learns from | measured ramp, **live slider** | frozen target, **blended boil memory** |
| cook runs at | the requested target | the snapped target, **reported as requested** |
| white never sets | **Start offered** | Start disabled |
| "How was it?" | once | **twice, after a relaunch** |
| alarm line | n/a | **"alarm set" from permission alone** |
| solves per drag | one, coalesced | **one per step, none cancellable** |
| eggs in the pan | 2 | **4** |
| default egg | 68 g | **62.3 g** |

### Two that no amount of reading either file would have found

- **The boil memory could answer differently on each app.** The lookup scans for
  the nearest remembered volume; the web walked insertion order and Swift walked
  a `Dictionary`. Two equidistant pans — 1 L and 3 L, asked about 2 L — were free
  to give different answers on each. It sorts now, and ties go to the smaller
  volume, with the fixture remembering the same two pans in both orders.
- **`anchorNear`'s tie-break was incidental to a `<`.** 0.11 is exactly
  equidistant from Runny and Soft in binary floating point. Both ports happened
  to agree; neither said so.

### Verified by watching, not by reading

- iOS, in the simulator: a counter rest reaching **"OUT OF THE WATER — NOW"** —
  the screen that had never once appeared — then DONE after the grace; the
  refusal snapping runny to fudgy and wording itself from the verdict; the alarm
  line appearing only after the system confirmed the request.
- Web, with `Date.now` overridden to run fast: the standing method's subline
  admitting the pan constant is a guess on a hot start; Start disabled with an
  honest hint when the white never sets; the refusal vanishing the moment a cook
  begins; a reload mid-cook resuming at the right number and saying what it lost;
  feedback folding exactly one egg and not re-asking after a reload; Cancel and
  Forget clearing what they claim to clear.

### What the review got wrong

- **Sous-vide is not "a joke with a maintenance bill".** `src/core/sousvide.ts`
  is careful, caveated physics, and the feature is one settings value, one radio,
  two CSS rules and one render branch. The real defect was that the branch ran
  *after* a full hot-start solve and after the stats row had been painted, so it
  paid for an answer it discarded and left half of it on screen — and printed the
  bath temperature under a "peak yolk" label. Isolated, not cut.
- **`predictCookTime`'s unshipped promise is in its own docstring**, not the
  README, which never mentions it.
- **The "does not trust an unconfirmed alarm" claim is in `ios/README.md`**, not
  the root README. It is now true.

### The lesson, which is the same lesson as last time

Every bug in the table above lived in the layer with no conformance test, and so
did all three of the real-egg bugs recorded above. The fix was never thirty
patches; it was moving the line the fixtures are drawn at. A rule that both
implementations have to obey, and that nothing checks, is not a rule — it is a
coincidence with a comment on it.

---

## Follow-up pass (18 September 2026)

The conformance pass above was itself reviewed, and four things had not actually
landed. Worth recording because three of the four were comments that described a
fix rather than a fix — the exact failure this file exists to catch.

- **`Task { }` does not inherit cancellation.** The iOS solve was moved out of
  `Task.detached` into a plain `Task` under a comment saying that was what let
  cancellation reach the work. It is not: an unstructured task inherits priority
  and actor context and nothing else, so the `isCancelled` guard inside it was
  dead and superseded solves still ran to completion, exactly as before. Only
  the new 90 ms coalesce was doing anything. There is no inner task now — the
  function is `nonisolated async`, which is all that is needed to get off the
  main actor, and the caller's cancellation then applies.
- **`phase(at:)` was added and never called.** The pure form went in, the
  `TimelineView` closure went on discarding the date it is handed, and the view
  went on reading the clock-sampling `cook.phase` ten times per body. Two
  explicit reads now: one per timeline tick, one for the static parts.
- **The restore notice never cleared.** `restored` was set and never reset, so
  once a cook had been picked back up, every later cook in that tab was
  captioned with a reload that had nothing to do with it. A new bug, introduced
  by the fix for an old one.
- **The two Forget buttons diverged again.** The web clears the posterior and
  the pan together; iOS gained a `BoilMemories.reset` that nothing called. A
  fresh divergence in the layer that had just been unified, which is a fair
  indication that the unification is only as good as the next person's habit of
  checking both sides.

Also: the mid-cook re-solve really does keep the frozen target now. Both apps
still retried at the snapped position, so an unreachable target answered with a
cook at a doneness nobody had chosen. It was about a second on the clock and the
calibration was told the right thing, so it was a wrong comment rather than a
wrong cook — but a wrong comment is what the three items above are made of.

**The rule this pass earned:** a comment that says what the code now does is a
claim, and claims in this repo get a fixture or a test. Three of these four
would have been caught by anything that executed the sentence.

---

## Sous-vide on iOS (19 September 2026)

The feature existed only on the web. `grep -rin sous ios/` returned nothing and
`ios/README.md` said "`sousvide.ts` is a joke and can wait forever", so the owner
went looking for it on his phone and did not find it. Both halves of that line
were wrong, and the conformance pass above had already said so in writing
("Sous-vide is not 'a joke with a maintenance bill'") without anything in the
port changing. A note in a record is not a fix either.

### What the port is held to

`fixtures/sousvide.json`, 34 cases generated from `src/core/sousvide.ts`, is the
new file and `SousVideConformance` is the new suite. The Swift agreed at 1e-12 on
the first run, which is what a transliteration with no state and no RNG should
do — so the value of the fixtures here is the cases, not the tolerance:

- **Baths either side of 60 °C**, which is the temperature the module's own
  caveat is about. 50 °C at one end, where the white's target takes over a month,
  and 85 °C at the other, where both holds fall to seconds.
- **The slider swept at the shipped bath.** The white's hold does not move at all
  — its target is fixed — so this sweep is the yolk's hold climbing past it, and
  a hard yolk at 58 °C is the one case there where the YOLK binds. That flips
  `whiteBound`, and with it the sentence the app prints.
- **Five more yolk-bound cases in hot baths.** Without them every case in the
  file agrees that the white binds, and a port that returned `true` unconditionally
  would have passed.
- **The Fourier number on its own**, as `equilibrationTime(1, 1)`, with the
  R²/alpha scaling divided out. The bisection is the only iteration in the module,
  and a bracket a port narrowed would otherwise hide inside an egg-sized answer.

### Verified by driving the app, not by reading it

In the iPhone 17 simulator, against the same inputs computed from `src/core/` in
Node:

| on screen | app | TypeScript |
|---|---|---|
| 68 g jammy, 58 °C bath | Yesterday, at 14:34, 22 h 43 min | 81760.26 s |
| the same at Hard | 2 weeks ago, at 00:25, 2 weeks | 1428737.1 s |
| back to Cold start, Hard | 14:13, 77 / 88 °C, after boil 6:13 | 852.94 s, 77.26 / 88.03, 372.9 s |
| back to Cold start, Jammy | 11:17, 65 / 80 °C, after boil 3:17 | 677.27 s, 64.74 / 80.14, 197.3 s |

The Hard case was reached by writing `doneness` into the app's own UserDefaults
plist in the simulator container and relaunching, because SwiftUI's `Slider`
ignores synthetic drags — the method recorded above, and the container's plist
rather than `simctl spawn defaults`, which is a different domain entirely.

That relaunch paid for itself twice: it also confirmed the new three-valued
`start` key survives one, and that the app comes back to the bath rather than to
the default. The last two rows are the regression check that matters as much as
the feature — switching back to a pan leaves nothing of the bath behind, neither
the "· in a 58 °C bath" suffix on the doneness reading nor a stale readout.

### Two decisions worth writing down

- **`equilibrate_s` is computed and deliberately not shown.** It is the one
  output the module's own doc comment disowns: conduction only, and below 60 °C
  the white is liquid and convecting, so it is too long by an unknown amount. It
  was on screen as a second stat for about ten minutes during this work, which
  would have made the least trustworthy number in the estimate the most prominent
  one. The holds are what make the answer what it is, and they are in the subline
  as the total.
- **The bath estimate is computed, where the cook is solved on a task.** It needs
  no integration at all — a bisection on the Fourier number and two closed forms —
  so putting it through the 90 ms coalesce would have bought latency and a chance
  to be stale in exchange for nothing.

### The lesson

This one is about where a line gets drawn rather than about a bug. The reason
there was nothing to port badly is that `sousvide.ts` was already pure, already
ignorant of the DOM, and already ignorant of the clock — the start time in the
past is computed in `src/ui/sousvide.ts` from a `now_ms` the app hands it. So the
split fell out: the estimate went to `EggTimerCore`, the sentences went to
`ios/App/SousVide.swift`, and nothing had to be untangled to make that happen.
The modules that were expensive to port were the ones that had not been written
that way in the first place.
