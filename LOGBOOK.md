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
---

## The white gets a voice (19 September 2026, issue #1)

Feedback used to be attributed entirely to the yolk. The white dose surface was
computed for every grid cell, stored, and never read. The first real egg cooked
on the phone is what made it urgent: aimed at soft, the WHITE came out runny, and
"too soft" - the honest answer - moved `alpha` and the taste offset along the
yolk axis, which is the wrong axis.

### What the numbers say about the channel, measured rather than assumed

The claim the change rests on is that the white is a second observable and not a
restatement of the yolk. Measured on a 68 g egg, hot start, ice bath, soft:

| | |
|---|---|
| d log(yolk dose) over ±10% alpha | 1.633 decades |
| d log(white dose), same | 1.054 decades |
| ratio | **0.65** |

The white responds two thirds as strongly, at a different radius, so the two
likelihood ridges are not parallel and the pair says something neither says
alone. `test/infer.test.ts` holds that ratio under 0.85.

Where the second question actually appears, over slider positions (68 g from the
fridge, into boiling water, ice bath, against the prior):

| level | 0.00 | 0.10 | 0.22 | 0.30 | 0.41 | 0.62 | 1.00 |
|---|---|---|---|---|---|---|---|
| P(white runny) | 0.45 | 0.28 | 0.13 | 0.07 | 0.02 | 0.00 | 0.00 |
| asked? | yes | yes | yes | no | no | no | no |

So the default path - jammy - stays one tap, and the question appears exactly in
the regime where the owner's real egg went wrong. That is not a tuned threshold:
when every particle predicts the same answer, every weight is multiplied by the
same factor and normalising restores the posterior unchanged, so a unanimous
model would learn nothing from either answer. The test executes that sentence
rather than asserting it.

### Verified by driving, not by reading

- **Web**, with `Date.now` overridden to run fast: a soft cook (hot start, ice,
  level 0.10, 6:33) driven COOKING → PULL → DONE; "Too soft" folded, the second
  question appeared, "Still runny" moved the weighted mean alpha 1.56896e-7 →
  1.54191e-7 - down, which is the correct direction for a white that had not set -
  while `eggsLogged` stayed at 1, because the white is a second observation and
  not a second egg. A second cook at the default jammy position was one tap: no
  white question, spread 10% → 6%. No console errors.
- **iOS**, a real cook driven end to end in the iPhone 17 simulator — 40 g, room
  temperature, into boiling water, ice bath, runny — against numbers computed in
  Node beforehand. It also survived being rebuilt and reinstalled mid-cook, which
  is how the second question got fixed without restarting the egg.

| | app | TypeScript |
|---|---|---|
| suggested | 3:42, 57 / 75 °C | 221.9 s, 57.30 / 75.05 °C |
| was the white asked about? | yes | P(runny) = 0.792, ask = true |
| mean alpha after "too soft" then "still runny" | 1.547846e-7 | 1.5478456e-7 |
| reported spread | ±10% | 9.73% |
| eggs logged | 1 | — |

  Two answers, one egg: the count does not move for the white, and the stored
  record is `calibration.v2` with 1000 particles.

- **A stored v1 posterior is dropped, on both apps.** Seeded by hand into
  localStorage and into the simulator's `UserDefaults`; both loaders removed it
  and fell back to the literature values, which is what the fresh prior's mean is.

### Two judgement calls, stated because nobody else settled them

1. **The channel is deliberately weak**: 0.65 / 0.35 against the yolk's
   0.8 / 0.1, a likelihood ratio of 1.9 against 8. The white sits nearer the
   surface, so it is the more sensitive of the two to the `H_EFF` error README
   §11.2 records as known-high, and a white answer partly measures that error and
   blames `alpha`. The discount bounds how fast that can happen. It is a
   judgement, not a measurement.
2. **The band is 0.26 decades**, which is `FEEDBACK_BAND` converted from Z_YOLK
   to Z_WHITE - the same 1.3 °C of peak temperature rather than the same number
   of decades. "Runny or set" is a sharper distinction than a yolk gradation,
   which argues narrower; `WHITE_DOSE_TARGET` is calibrated rather than measured,
   which argues wider. They were left to cancel rather than tuned to a taste.

Both numbers want real eggs, and until then they are the softest part of the
change. Whether the channel actually breaks the `alpha`/taste confound is
likewise unanswered: it is the reason for the channel, not a result.

### One branch that could not be reached honestly

`updateWhite` resamples when the particle set degenerates, like every other fold -
but the channel is too weak to degenerate a healthy set on its own: the largest
fall in effective sample size one binary 0.65 / 0.35 answer can cause is about 6%,
and 64 particles never reach the n/2 threshold from a uniform start. No sequence
of white answers would have executed that branch, so `fixtures/calibration.json`
carries a `whiteResample` case whose INPUT posterior is synthetic - the real
particles from the end of the replay, with their weights sharpened until the
effective sample size sits just above the threshold. Written out in full so the
port reads the same starting point rather than reproducing the sharpening. The
alternative was shipping the branch in two languages and executing it in neither,
which is the failure this file exists to catch.

---

## Two real eggs, and what they could not teach (19 September 2026)

A second real egg came out with an underdone white, aimed at soft, same as the
first. That is two for two, and it prompted the obvious question: update `H_EFF`,
or instrument it so the eggs can.

The answer to the first half is that **`H_EFF` is not in the simulation path.**
`sphere.ts` imports `MODE_COUNT` and `K_EGG`; the surface is clamped to the water
temperature and nothing consults a heat transfer coefficient. The constant lives
in `biotNumber`, one test, one line of validation output, and the comments
justifying the clamp. Changing 850 to 450 moves one printed Biot number and not
one cook time.

That deserved saying out loud. "`H_EFF` is known high" had been sitting in
§11.2 for months reading like a miscalibration, when it is really a figure the
model never reads.

### The measurement

`tools/identifiability.ts`, `npm run identifiability`. Robin eigenmodes — roots
of `1 - mu*cot(mu) = Bi` — built fresh, because the repo's solver has only
Dirichlet ones, and cross-checked against `seriesTheta` at `Bi = 1e7` before
anything else was believed: worst difference 3.2e-7, roots landing on exactly
`n*pi`. Then the Jacobian of (log yolk dose, log white dose) against
(log alpha, log h).

| ∂log₁₀(dose)/∂log(·) | yolk | white | white/yolk |
|---|---|---|---|
| `alpha` | 12.704 | 5.903 | 0.465 |
| `h` | 0.665 | 0.642 | 0.965 |

README §11.2 claimed changing `H_EFF` "would simply be re-absorbed by
`ALPHA_DEFAULT`". With one observable that is exactly right. With two it is not:
`alpha` hits the centre far harder than the near-surface, `h` delays both about
equally, and the two directions sit **19 degrees apart**. So the white channel
does break the confound — geometrically.

It does not break it usefully. `h`'s signal is **15x weaker** than `alpha`'s, and
ordinal feedback is worth 1-2 bits an egg. And the effect is nearly
self-defeating:

```
   h   |   Bi  | angle | |h|/|alpha|
  850  |  34.7 | 19.0d |   0.066   <- today
  450  |  18.4 | 20.3d |   0.119   <- Denys, README 11.2
  120  |   4.9 | 22.8d |   0.328
```

**`h` only becomes learnable in a regime the egg is not in.** At `Bi` between 18
and 35 the surface really is nearly clamped — which is precisely why Dirichlet
was a defensible choice. The lower the true `h`, the more it would matter, and
the further it is from where the model actually sits.

### What that changed

- Instrumenting `h` as a fourth particle dimension is **off the list**. It would
  add a parameter the data cannot move.
- The Robin boundary condition **stays** on the list, reframed: a correctness fix
  for a Dirichlet bias currently hiding inside `ALPHA_DEFAULT`, not an instrument
  for fitting `h`. The eigenmode work is already done and cross-checked in
  `tools/identifiability.ts`.
- §11.3's thermocouple went from "would be nice" to **the only way this gets
  answered**. An afternoon of it beats a hundred breakfasts, and now there is a
  number saying why rather than an intuition.

### A separate finding, from chasing the same egg

The egg that prompted all this was cooked on a build that predated the white
channel, so the app never asked — mystery solved, and not interesting.

Chasing it was, though. The ask gate fires only when the model puts
`P(runny)` between 0.1 and 0.9, justified on the grounds that a unanimous
posterior cannot learn from either answer. That argument is exactly true at
`P = 0` and `P = 1` and not before. Measured on a fresh prior, folding a "runny"
report the gate would have suppressed:

```
level 0.22 | P(runny) 0.130 | alpha 1.7109e-7 -> 1.6819e-7 | -1.70%
level 0.41 | P(runny) 0.023 | alpha 1.7109e-7 -> 1.7033e-7 | -0.45%
```

A suppressed answer at jammy still moves `alpha` a quarter as far as an asked one
at soft. **The gate discards usable evidence, and it discards most of it exactly
when the model is confidently wrong** — which is the case a cook notices and
reports. `WHITE_ASK_MIN_P = 0.1` is recorded as a judgement, not a measurement;
this is the measurement, and it says the threshold is too high. Left alone
pending a decision, because it changes what the filter learns from every future
egg and that is not a call to make in passing.

### The lesson

Two of the three things above were claims sitting in the README, phrased with
enough confidence that nobody re-derived them. One was wrong in an interesting
way and one was wrong in a way that had quietly foreclosed a design option. The
cost of checking was an afternoon and a 170-line script that now runs from
`package.json`.

A constant with a comment explaining why it is wrong is not documentation. It is
an unrun experiment.

---

## Two more unrun experiments, run (21 September 2026)

A question about redesigning the app around pooled inference produced two claims
in conversation, and the previous entry's lesson is that a claim is not a
result. Both are now scripts.

### How many parameters can "how was it?" move - `npm run rank`

The proposal was ten global parameters; the objection was that most of them cash
out in the same predictive. `tools/rank.ts` takes the Jacobian of the two log
doses against ten candidates, each column scaled by its prior sd, over 174
reachable cooks (4 sizes x 2 start temperatures x 3 coolings x hot/cold x 5
levels, each at the time the app would recommend). `simulate` cannot move
`Z_YOLK`, `Z_WHITE` or `YOLK_RADIUS_FRAC`, so `tools/perturbed.ts` restates its
loop with them as arguments; it agrees with `simulate` to 2.0e-7 in log10 dose.
The eigenvalues were first computed with numpy and the dependency-free Jacobi
solver in the tool reproduces them to the digit.

| direction | answers to halve the prior sd | loads on |
|---|---|---|
| 1 | 0.7 | `alpha` 0.92, boil bias 0.24, yolk offset 0.20 |
| 2 | 5.1 | white threshold 0.75, white radius 0.59 |
| 3 | 61 | `tauAir` 0.96 - and *never*, from water-cooled cooks alone |
| 4 | 111 | size exponent 0.99 |
| 5 | 269 | start-temperature bias 0.92 |
| 6-10 | 508 to 248 928 | the z-values, and the leftovers of the above |

The objection was right. Two directions, a tenfold gap, two more that exist only
where the protocol reaches, and nothing else. What was not expected: the present
three-number particle is nearly the right parametrisation already. What it lacks
is direction 2, which it holds at `WHITE_DOSE_TARGET` - and direction 2 is where
both real eggs went wrong.

N is a Gaussian-latent count with 0.4 decades of noise per answer and a uniform
scenario mix. It is an order of magnitude and should be quoted as one.

### Is a probe thermometer worth an egg - `npm run probe`

| reading at the centre | C per 1% time-scale | 3 mm off | 15 s late |
|---|---|---|---|
| at the pull | 0.601 | +1.33 | +2.21 |
| ice bath, yolk's peak (+195 s) | 0.400 | -0.03 | -0.14 |
| counter, yolk's peak (+548 s) | 0.296 | +0.00 | -0.01 |

The obvious protocol is the bad one. At the pull every handling error reads hot,
and hot shortens the next cook. At the peak the field is flat in space and time,
the app already knows when that is, and +-1 C is +-2.5% of time-scale - the whole
ordinal plateau, from one egg that can still be eaten, with no taste in it. At
the white's radius the gradient is 3.5 C/mm and nothing handheld means anything.

**A number said in conversation was wrong, and the script caught it.** The first
pass put one prior sd of `tauAirScale` at 0.6 C on the rested reading, from a
perturbation of x1.35 / x0.74 read at a fixed +480 s. At the actual prior sd
(x1.42 / x0.70) and the actual peak it is **1.06 C**, against 3.53 C for one prior
sd of `alpha`. The conclusion survives - a spot reading mostly re-measures the
time-scale and the carryover constant still wants a logged curve - but "barely
moves it" was overstated by nearly half, and PLAN.md's "the only way" needed
qualifying in the other direction: for the time-scale, a probe is now a way.

### What it changed

`INFERENCE.md` is the design; Phase E in `PLAN.md` is the list. Nothing in `src/`
moved.


## The record, and a replay that has to be exact (26 September 2026, E1)

Each egg is now kept as a record beside the posterior, in both apps, and the
posterior is what a replay of the log makes of it. `INFERENCE.md` §4 has the
schema and the rules; this is what was checked.

### Verified

- `npm test` 102 pass, `npm run validate` 27/27, `npm run conformance` 57 Swift
  tests pass. `fixtures/record.json` pins 57 loader cases and a six-egg replay
  from both apps, one egg unanswered, particle by particle after every egg, and
  the tail of the same log again from a non-prior start.
- **Bit-identical, four ways.** A posterior rebuilt from base + log against the
  one built egg by egg, compared with `Object.is` / `bitPattern`, not a
  tolerance: in `npm test`, through the web app's own storage with a reload
  between every egg and a real 21 x 32 surface; in `swift test`, through
  JSONEncoder between every egg; in Chromium, 0 of 4000 numbers differ after
  three eggs; in the iOS simulator, 0 of 4000 after deleting the stored
  posterior and letting the app refold the log on launch. The last two are the
  apps' own replay paths, not the test's.
- **Chromium (the pane), web app built from this tree.** A seeded v2 posterior
  migrates on load: the v2 key is gone, v3 holds it as the base, the label says
  "tuned on 3 eggs" and the jammy time moves 11:17 -> 11:32. Driven with
  `Date.now` run fast: a tap 11 s after the alarm is recorded as
  `pulledBy: cook`, `pulled_s` 491.7 against 480.6 scheduled; a cook left to
  the grace is `timeout` at the scheduled time; an egg nobody answered is
  logged with `yolk: null` and folds nothing; the white question, when shown, is
  written as offered in the same save as the fold, and the answer lands on the
  same record. A posterior damaged in storage is rebuilt from the log on the next
  load. "Forget everything" leaves only the settings key.
- **The worker.** One fold's surface built in the worker left the page's
  longest timer gap at 11 ms; the same build on the main thread takes 579 ms. A
  twelve-egg log (eight surfaces) replayed through the app's own path in 24.4 s
  with the longest gap 33 ms. `gridWorker.js` ships in `_site/` with no change to
  the build: `tsc` already compiles everything under `src/`.
- **iOS simulator (iPhone 17 Pro, iOS 27), debug build.** Builds clean under
  Swift 6 with no new warnings. The seeded v2 posterior migrates the same way
  (11:32, "tuned on 3 eggs"). A restored cook answered "too soft" writes a
  record with `pulledBy: timeout`, `massFrom: class`, `sizeTable: eu`,
  `timeToBoilFrom: default` (no pan on file) and folds to "tuned on 4 eggs"; a
  finished cook left unanswered through Start again logs `yolk: null`; the
  refold after deleting the posterior is bit-identical; Forget removes the
  calibration key and leaves the settings. Not run on a device.

### Things that cost time

1. **The preview configuration serves the main checkout**, not a worktree:
   `.claude/launch.json` runs `http.server --directory _site` from wherever the
   tool starts it, which was the other tree. The worker 404'd, which is how it
   showed. Served the worktree's `_site` on another port instead.
2. **The long-task API reported nothing** in the pane's Chromium, not even for a
   deliberate 120 ms busy loop, so "no long tasks" from it proves nothing.
   Responsiveness was measured with a 10 ms interval and its longest gap.
3. **A surface's cost depends on the posterior.** 0.58 s centred on the
   literature alpha, 2-2.5 s centred on a posterior leaning slow, because every
   simulation in it runs longer. "About two seconds each" is the slow end.
4. **A rounded cache can never be matched.** Both apps stored the posterior to
   five or seven figures, each rounding differently. A replay reproduces the
   unrounded arithmetic, so the v3 posterior is stored at full precision - about
   120 KB on the web with three eggs of log - and the v2 base keeps the rounding
   it came with, which is harmless because it is where replays START.
5. **Swift's synthesized `Decodable` ignores property defaults.**
   `var feedbackGiven: Bool = false` still throws `keyNotFound` on a record
   without the key, contrary to the comment on `Cook.Saved`, which says a cook
   saved before the field existed restores as unanswered. Checked with a
   six-line script. The fields E1 adds to `Cook.Ticket` are optionals for this
   reason.
6. **iOS: "Eggs in" straight after changing the start mode** started a hot cook
   with the previous cold start's time: the 90 ms coalesce and the solve had not
   landed, and the button reads `kitchen.solution` as it stands. Seen once,
   while tapping faster than a person would. Not changed here.

## The catalogue, with no word moved (27 September 2026, F1)

Every string both apps show now comes from `copy/en.json` - 235 keys - through
one renderer in each core. `LANGUAGE.md` §2 has the format as built; this is
what was checked.

### Verified

- `npm test` 120 pass, `npm run validate` 27/27 with a report byte-identical to
  the one before the move, `npm run conformance` 62 Swift tests pass.
  `fixtures/copy.json`: 331 renders of every key at its example arguments and
  every plural message at twelve counts, 90 plural-rule rows (English, 1750,
  Czech at 0, 1, 2, 4, 5, 1.5, 21 and 22, and a language with no rule), and 31
  probes of a catalogue that exists only in the fixture: one form per Czech
  category, the fallback to English, a missing argument, and nine malformed
  braces. The hand-written rules are also checked against `Intl.PluralRules`.
- **The web, rendered, before and after.** `tools/copy-snapshot.html` drives
  the unmodified app through 108 states with `Date.now` frozen and stepped:
  every phase on each start and cooling, every refusal kind, sous-vide at four
  donenesses (Yesterday, Last Thursday, Last Sunday, 2 weeks ago), both
  cartons, the feedback and white questions, reloads mid-cook, Forget.
  `node dist/tools/copySnapshot.js` runs it in headless Chrome. Against `main`
  at dc2ec28 (E1 merged, catalogue not): innerText, 8,275 text nodes and
  attributes (331 distinct), `<html lang>` and the title all identical. It was
  identical against 942623d before the E1 merge too. No state shows a key name
  or a `{placeholder}`.
- **iOS, on the source.** `node dist/tools/copyLiterals.js 942623d` lexes every
  Swift string literal in the app, widget, shared code and core. All 168 that
  were words are a template of a key the iOS side now uses, with placeholders
  only where the literal had an interpolation or a number; each of the 157
  templates matches something said before; no word is left as a literal. It
  fails on a doubled space in one entry, which was tried.
- **The fixtures are the old words.** `sousvideCopy.json` renders its new keys
  back to the same 37 strings, and `policy.json`'s 192 anchor and size labels
  render back to the old ones with every other field unchanged.
- **The builds.** `npm run build:site` ships `_site/copy/`; served from there
  in the Browser pane the page renders with no console errors. The iOS app
  builds for the simulator under Swift 6, bundles `copy/` in the app and in the
  widget extension, and its Info.plist has `CFBundleLocalizations = [en]`.
  Driven in the simulator (iPhone 17 Pro): idle, sous-vide and a hot cook's
  COOKING screen read as before. The Live Activity and the notifications were
  not seen - the simulator had no notification permission and the Lock Screen
  showed no card - so those strings rest on the literal check alone.

### Things that cost time

1. **Headless Chrome's `--virtual-time-budget` never finished** the harness
   (the app's 200 ms ticker keeps virtual time busy). Driving it over the
   DevTools protocol with real time takes two minutes and works.
2. **E1 landed mid-move**, and its grid worker changed when "learning…" shows,
   so the snapshot against 942623d no longer matches `main` after the merge -
   the comparison that means something is against `main` at the merge base,
   and that one is identical.
3. **Words that were grammar.** Four things were English written as code, not
   strings: `egg${n === 1 ? '' : 's'}`, `minute(s)`, a list joined by " · ",
   and "assumes"/"guesses" spliced into two sentences. Each is now a message,
   and the checks above are what show the output did not move.

## The heat-off pan, from the water (27 September 2026, INFERENCE §11 item 11)

The standing method's loss time constant was the time to boil over
`ln(r/(r-1))`, which reads the hob as the pan. It is now
`TAU_STANDING_REF_S * (V / 2 L)^(1/3)`, with `TAU_STANDING_REF_S = 480 / ln(1.5)
= 1183.8 s`. What was checked:

- **The anchor holds exactly.** Williams' case (cold start, 480 s boil, 2 L,
  17 minutes standing, tap) gives peak yolk 75.6033 °C and yolk dose 2661.6534
  min-eq under both rules. The standing fixture for an 8-minute boil did not
  move; every other standing fixture did, and the E1 record fixture moved with
  its one logged standing cook (1.5 L).
- **The counts.** `npm test` 121/121 (120 before; 15b and 15d now vary the
  water, 15e is new). `npm run validate` 28/28 (27 before: the 4-minute-boil
  check became a 1 L check, and an anchor check was added). `npm run
  conformance` 62 Swift tests in 21 suites, all passing, with three new
  constants compared.
- **The moves**, by running the same solve against the core at 83d60c3 and
  after the change: README §7 has the table, PLAN.md the summary. The fast hob
  (2 L in 4 minutes) is where the old rule was wrong - it refused a jammy
  standing cook at 2 L that now takes 6:09.
- **The web app**, built with `npm run build:site` and served from this
  worktree's `_site`: hot start, heat off, at 1, 2, 4 and 6 L, and a cold
  start at 1-4 L through HEATING and COOKING. The hot-start line reads "for
  2 L of water with the lid on — measure the water, it changes the time" and
  follows the water field; the cold start still says what boil it guesses. No
  console errors.
- **iOS** builds for the simulator. It was not driven: another agent may be
  using the booted simulators, and installing this build would replace theirs.
  The new heat-off explanation rests on the catalogue's tests.

### Things that cost time

1. **The copy knew the old physics too.** Driving the app found the
   white-never-sets refusal advising "a slower boil", which only ever helped
   because a slow boil was read as a big pan. No test could have caught that;
   reading the screen did.
2. **Hot-start standing with four fridge eggs never sets the white** at 1-4 L,
   under either rule. That is not new, but it is now plainer, since the old
   rule on a measured hob let 3 and 4 L through. It is the model's claim, not a
   measurement, and worth one real cook before anyone trusts it either way.

## Metric and Imperial (27 September 2026, F3)

`src/core/units.ts` and its Swift twin, the setting in both apps, and a unit
on every temperature. `LANGUAGE.md` §4 has what settled differently from the
design; this is what was checked.

### Verified

- **The counts.** `npm test` 138/138 (121 on `main` at a679075; 17 new in
  `test/units.test.ts`). `npm run validate` 28/28. `npm run conformance` 69
  Swift tests in 22 suites, all passing; the new suite has 7.
  `fixtures/units.json`: every conversion both ways at 11 units, 18 measures
  (each quantity in each system, water in and out of the US) with their
  bounds, displays at grid points, between them, on exact halves, at and past
  every limit and at NaN, and the round trip of **every grid value of every
  input, 1,038 of them**, each typed, stored in SI and shown again. The
  generator throws rather than write one that drifts. `test/units.test.ts`
  also takes mass and girth through the one diameter the web stores them as.
- **The web, built with `npm run build:site` and served from this worktree.**
  The regional default was checked with two copies of the page that pin
  `navigator.language` before the app loads: en-GB starts metric with EU
  classes and nothing stored; en-US starts Imperial, quarts, US classes
  ("Large — 2.1 oz"), and still nothing stored, because a default is not a
  choice. Switched to Imperial under en-GB: every readout, the preset hint,
  the sous-vide label, the size menu and all six inputs' units, steps and
  bounds changed (mass 0.9-4.2 oz by 0.1, width 1.2-2.36 in by 0.02, water
  0.5-21 pt, altitude -1300-16400 ft, egg 29-104 °F), and the flip event fired
  once. Typed 2.3 oz, 4.25 pt, 1500 ft and 50 °F: after a reload all four read
  back as typed. Moving the doneness slider left every stored SI value
  bit-identical, which it did not do before (every input event used to
  re-read every field). Metric and back again: 2.3 oz, 4.25 pt, 1500 ft,
  50 °F. A stored Imperial choice made under en-US survived a visit as
  en-GB, in pints and on the EU carton. Sous-vide, the heat-off subline and
  refusal, and a hot cook's COOKING hint all read in °F and pints, and the
  cook's ticket recorded `imperial`. No console errors.
- **iOS** builds for the simulator. On a spare simulator (iPhone 17e, shut
  down afterwards; the booted iPhone 17 Pro belonged to someone else and was
  left alone) the app launched metric in the simulator's own locale; with
  `-AppleLocale en_US` it took the US carton but stayed metric, because the
  simulator's global `AppleTemperatureUnit` is Celsius and the temperature
  preference wins, which is the rule; with `-AppleTemperatureUnit Fahrenheit`
  as well it opened in Imperial ("149 °F", "Large — 2.1 oz", "Fridge 39 °F",
  "Sous-vide 136 °F"); and with `unitsChosen = metric` stored it opened metric
  under the same arguments.

### Not verified

- **Nothing on iOS was tapped.** The simulator control needed a permission
  nobody was there to grant, so the Units menu row, the weight slider and
  the two steppers in displayed units, the `.unitsFlipped` post and the
  typed-value round trip on iOS rest on the conformance suite and on reading
  the code, not on a screen.
- **The Live Activity and the cook summary** were not seen in either system.
- **A real phone's Temperature setting** was only imitated with a launch
  argument; that `Locale.current` carries it on a device is Apple's
  documented behaviour, not something seen here.

### Things that cost time

1. **Re-reading every field on every input event** was harmless while the
   fields held SI. In another unit it is drift: a displayed 54 °F re-parsed
   as 12.2 °C over a stored 12 °C every time the slider moved. The web now
   reads a field with a unit only when it is the one being edited, as the
   measurement boxes already did.
2. **`Math.round` and Swift's `rounded()` disagree about -0.5**, and
   `toFixed` prints -0 as "0" where `%.0f` prints "-0". Both are sidestepped
   by writing `floor(x + 0.5)` out and normalising zero; a fixture row at a
   negative half pins it.
3. **The standing subline landed on `main` mid-task** quoting "{litres} L",
   and was converted in the merge.

---

## The ordered probit, the white offset, and the feedback wording (27 September 2026, E2 + E3 + F2's first rewrite)

One likelihood revision, replayed from E1's log, as PLAN's order of work asked:
the hard bands and the fixed 0.8 / 0.1 became an ordered probit with a learned
noise scale and a 5% unrelated share; the white gained a learned offset (E3), a
third answer and a learned tender | firm cutpoint; every egg is scored at the
cook's own pull when they tapped one. The numbers and why are INFERENCE.md §3.

### Measured

- **The noise prior.** Matching mutual information at a FRESH prior would have
  needed a median of 0.48 decades: there the old likelihood carries 0.63 bits
  per yolk answer and the probit at 0.20 carries 0.96, because most particles
  are far from the band and the probit's floor (0.017) is lower than the old
  0.1. Matching where the old likelihood described a known cook - P(just right)
  0.80 at the band's centre, 0.10 one band-width out - needs 0.207. The median
  is 0.20, and the recovery experiment below is the check that the sharper
  first egg does no harm.
- **Recovery (Phase C repeated), no worse.** Injected `alpha` 1.535e-7, taste
  +0.20, noise-free answers, 68 g at jammy. Old likelihood, rebuilt from `main`
  in a scratch copy: within 15 s of the optimum from egg 3, settled 14.0 s long,
  sd 2.9% - the Phase C numbers again. New: from egg 2, settled 12.2 s short,
  sd about 3.3%. With the white answered too: old 9.6 s long, new 11.4 s short;
  at soft, 62 g, both settle within 2 s.
- **Calibration.** 200 cooks from the prior, 5 eggs each: expected calibration
  error 1.4% (yolk) and 1.8% (white); at 400 cooks 0.8% and 1.0%.
- **Two runny whites at soft: half met.** Soft later by 85 s (white alone) or
  21 s (yolk also "just right"); jammy later by 94 s and 23 s. `alpha`'s prior
  is 0.70 decades of white dose against the white offset's 0.5, so the
  posterior blames the time-scale about 2:1. Tried and rejected: a white-offset
  sd of 0.8 (soft +73, jammy +60) and 1.2 (both white-bound at +107 and +62);
  and white noise 2, 3 and 5 times the yolk's (the split does not change, only
  the size). Even after three "just right, firm" eggs at jammy, two runny whites
  at soft move soft +12 s and jammy +15 s. Not fixed; the owner's call.
- **Web, driven in Chromium** on this branch's `_site` (port 8793, stopped
  after): an E1 store with a two-egg log and a v2 key loaded as v4, both old
  keys gone, the base dropped, the log replayed from the prior. Three cooks,
  hot start at soft, time moved with an overridden `Date.now`: the pull button
  recorded `pulledBy: cook`, 10.7 s after the alarm; the yolk alone; the white
  alone; the white, then "Too soft" tapped while the first fold was still
  building its surface. After each, the stored posterior was deleted and the
  page reloaded: the posterior rebuilt from the log was string-identical every
  time. After the runny white the soft slider snapped 0.22 -> 0.24 and the time
  went 7:36 -> 7:49: the white offset moving the recommendation. No console
  errors.
- **iOS** builds for the simulator. On a spare simulator (iPhone 17e, booted
  and shut down here; the booted iPhone 17 Pro was someone else's) an E1 store
  written into the app's own preferences migrated to v4 with the base dropped,
  was killed mid-fold, and on relaunch finished: posterior mean white offset
  0.42625160931576(26), against the TypeScript's replay of the same log at
  ...(31).
- **The wording.** `copyLiterals.js --since cfe38e9`: 234 keys unchanged, 19
  changed, each as `tools/copyDraft.ts` lists. `copySnapshot.js compare
  --draft`: 181 rendered web strings before, 183 after; new as drafted
  "Tender", "Firm", "Answer either, both or neither.", "Thanks. The next egg
  will use that."; gone as retired "Set right through" and the old white hint;
  nothing else.
- `npm test` 142 (141 pass, 1 todo: E3's unmet half), `npm run validate`
  28/28, `swift test` 69.

### Not verified

- **Nothing on iOS was tapped.** The simulator control needed a permission
  nobody was there to grant. The pull button, the two questions, their
  selected state and the second-answer refold on iOS rest on the build, on the
  core's conformance tests and on reading the code.
- **The Live Activity after a pull tap** (its cooling stage now starts at the
  tap) was not seen.

### Things that cost time

1. **Consecutive seeds are not a sample.** The calibration test first drew
   each simulated cook's truth as the first particle of `createPrior(1, seed)`
   for seeds 9000, 9001, ... and the first egg came out miscalibrated (23%
   predicted, 39% observed). xorshift's first outputs from nearby seeds are
   correlated. Drawing the truths from one long prior fixed it.
2. **`simctl spawn ... defaults write` does not reach the app.** It writes the
   simulator's global domain, not the app container's preferences; the seed has
   to go into `Library/Preferences/<bundle>.plist` in the data container.
3. **The shared scratchpad is shared.** Another session was building its own
   "old" copy of the core in the same directory at the same time; work moved to
   a subdirectory of its own.

## Numbers, clocks and plurals by locale (27 September 2026, F4)

Every number and time of day either app writes now goes through the
platform's formatter in one formatting locale - the UI's language in the
device's region - and the two platforms are held to the same bytes by
`fixtures/format.json`. `LANGUAGE.md` §2 has the choices; this is what was
checked.

### Verified

- **The counts**, after merging `main` at c466b93 (E2 and E3). `npm test`
  154 pass, 0 fail, 1 todo (main's `5b`, a known NOT MET), of 155; 13 are new
  in `test/format.test.ts`. `npm run validate` 28/28. `npm run conformance`
  77 Swift tests in 23 suites, all passing; `FormatConformance` is new with
  7, and the sous-vide copy suite gained the weekday.
- **`fixtures/format.json`**: numbers at 24 values and counts at 14, and times
  at 13 instants with and without seconds, in en-US, en-GB and cs-CZ and in
  en, en-AU, en-DE, cs, en-US-u-hc-h23 and en-GB-u-hc-h12 (459 rows); the
  rounding and the decimals a count shows; the time-space normalisation; the
  formatting locale for 7 languages x 9 regions x 3 hour cycles; the plural
  rule with visible decimals; every quantity a cook reads, in both systems,
  in the three supported locales; and a pseudo-Czech catalogue rendered in
  cs-CZ (43 cases: every form of each plural, "1,50 l" as `many`, "1 250 m"
  with U+00A0, a count of 1,234 days, fallback keys with Czech numbers).
  `test/format.test.ts` checks the rules against `Intl.PluralRules` with
  `minimumFractionDigits`, and forces cs-CZ through the web's own `show`,
  `spokenClock` and `sousVideCopy` with that catalogue.
- **English, rendered, before and after.** `tools/copy-snapshot.html` gained
  seven states that reach what F4 changes (an en-US sous-vide, twice, and the
  spoken countdown at 61, 60 and 1 s). With that harness, `main` at c466b93
  and this branch each captured 171 states: 166 identical, and the five that
  differ show exactly the intended changes and nothing else:
  - en-US sous-vide "at 08:49" -> "at 8:49 AM", and "at 18:39" -> "at
    6:39 PM" (U+202F before the AM/PM);
  - "Cooking. 1 minute 1 seconds left" -> "1 minute 1 second left", twice;
  - "Cooking. 1 seconds left" -> "1 second left".
  en-GB, which is most of the harness, did not move: its clock was already
  24-hour with a leading zero, which is what the en-GB time style prints.
- **Intended English changes the harness cannot reach**, from the fixtures:
  iOS "alarm set for 07:41:12" -> "7:41:12 AM" under en-US; numbers of four
  digits or more are grouped ("1,500 m", "16,400 ft", seen only on iOS's
  altitude stepper, since the web shows altitude in an input, which stays
  plain); an iPhone whose 24-hour setting differs from its region's gets that
  setting.
- **The web, built with `npm run build:site` and served from this worktree**,
  with pages that pin `navigator.language`: en-US sous-vide "at 2:23 AM"
  (U+202F checked), "212.0 °F"; en-GB "at 02:21", "95.0 °C" at 1500 m, the
  altitude input still "1500"; en-CZ (an English page in Czechia)
  "95,0 °C" and "02:22".
- **iOS** builds for the simulator. On a spare iPhone Air, booted for this
  and shut down afterwards (the two booted simulators were left alone), with
  launch arguments for the settings: `-AppleLocale en_US` took the US carton
  and printed the sous-vide start as "at 02:33", because the simulator's
  global `AppleICUForce24HourTime` is on and the phone's own setting wins;
  with that forced off, "at 2:34 AM". Under en_GB with a hot start: "65 °C",
  "Large — 68 g", "Fridge 4 °C", unchanged.

### Not verified

- **Nothing on iOS was tapped**, again: the altitude stepper's grouping, the
  alarm line (it needs a cook and notification permission), the egg-count
  stepper and a "Last {weekday}" headline on iOS rest on the conformance
  suite and on reading the code.
- **Safari was not tried.** It uses Apple's ICU rather than V8's; the one
  difference known in advance (the space before PM) is normalised.
- **en-CZ, en-CA, en-IN/NZ/SG and a Czech UI outside Czechia differ between
  the apps** (`LANGUAGE.md` §2). They are measured and written down, not
  fixed.

### Things that cost time

1. **Skeletons are not styles.** Asking both platforms for "hour and minute"
   gives en-GB "9:05" from `Intl` and "09:05" from Foundation. The locale's
   own time style gives "09:05" from both.
2. **V8 is not CLDR about AM and PM.** Chrome prints U+0020 before "PM"
   where CLDR and Foundation print U+202F, so the web normalises.
3. **The harness never showed what F4 changes.** Before the seven states
   above were added, all 164 states were identical to main: the harness runs
   in en-GB, whose clock did not move, and never stopped the countdown at a
   1.
4. **`src/ui/clock.ts` already existed** (the ticker and the alarm), was
   overwritten by a new file of the same name, and was restored before
   anything was committed; the spoken countdown lives in `countdown.ts`.

## The thermometer (27 September 2026, E4)

A probe reading at the middle of the egg, taken when the model has the centre
peaking, folded as a third observation beside the yolk and the white; and the
cooling countdown, which now ends at that peak.

### Measured

- **Where the centre is at its peak** (`npm run probe`, 68 g, 400 s, ice,
  +195 s): 58.8 C at r = 0, 58.6 at 0.2 R, 57.8 at 0.3 R, 55.7 at 0.4 R; in
  time 56.3 / 58.2 / 58.7 / 58.85 / 58.7 / 58.3 / 56.8 C at -60 / -30 / -15 /
  0 / +15 / +30 / +60 s. The centre is the maximum both ways, so handling
  errors read cold there, and the likelihood's tail and the offer's wording
  ("highest") follow from that. The spec said hot, and "lowest".
- **One reading** (`test/probe.test.ts`, 1000 particles, production grid):
  time-scale sd 12.5% -> 2.74% (reading at truth -1 C), 2.74% (at truth),
  2.79% (+1 C) in the weights; 3.28 / 3.33 / 3.52% after the resample. A
  prototype outside the filter, with each particle's peak simulated exactly
  rather than read off the grid, gave 2.43% for a 1.0 C Gaussian with no
  unrelated share, 2.55-2.63% with the handling tail, 3.63% for 1.5 C. The
  2% unrelated share costs about 0.15 points; 5% over 40 C cost 0.45.
- **Direction**: +1 C: next jammy cook 464.0 -> 449.1 s; -1 C: 469.2 s.
- **The countdown**: 183 s for the default egg at jammy in ice (180 before);
  -46 to +56 s across 53-78 g, soft to hard, ice and tap. PLAN.md has the
  table.
- **Suites**: `npm test` 169 tests, 168 pass, 1 todo (E3's 5b, unchanged);
  `npm run validate` 28/28; `npm run conformance` 85 Swift tests pass, with
  `fixtures/probe.json` new and `calibration.json` untouched.

### Verified in Chromium

The built site on its own port, own tab, 430 px wide, `Date.now` overridden
to skip the waits. A hot-start jammy cook: the offer appeared in COOKING under
Cancel, "I have one" stored `probe` and `probeAsked` and put the offer away;
COOLING counted 3:03 with "have the probe ready"; DONE announced "Now push the
probe to the middle of the egg" and showed the field in C. 46.7 C was refused
("expect 48.4 °C to 82.5 °C") and nothing was logged; 65.7 C was logged
(`after_s` 183, `pulledBy` cook) and folded in the worker; "Just right" then
refolded the same egg, and `replay` of the log matched the stored posterior
string for string. The next cook read 7:42. Switched to Imperial: no offer,
the field in F, a stray "1147247.2" refused with the range in F, 147.2 F
logged as 63.99999999999999 C - which is why the record now rounds to 0.01 C -
with `after_s` 203 (the grace ran out: 20 s + 183). The replay matched again;
two readings left the time-scale sd at 2.0%.

### iOS

Built for the simulator. On a simulator of its own (created, used and
deleted; the two already booted were not touched), launched without taps: the
toggle renders under the cooling picker, off. With a cook written into its
UserDefaults, DONE shows the reading field in C at the top of the feedback
(the placeholder was truncated at 110 pt; widened), and COOLING shows the
countdown with "have the probe ready". The system's notification prompt sat
over both and was left alone.

### Not verified

- **Nothing on iOS was tapped**: the offer's buttons, typing a reading, the
  refusal, the fold, and the probe notification ("Probe it now") firing at the
  end of the cooling rest on the build, the shared core and reading the code.
- **No real egg has been probed.** The 1.0 C instrument sd and the 0.4 C
  handling mean are the model's numbers, not a kitchen's.
- **The counter is not offered the probe**, and a heat-off pan that runs out
  before the pull is not either; neither was needed for the criterion.
- Safari was not tried.

### Things that cost time

1. **"Every handling error reads hot" is true at the pull and false at the
   peak.** The probe table already had the signs (-0.03 for 3 mm, -0.14 for
   15 s); nobody had read them as a direction.
2. **The filter's jitter is the floor.** A reading that leaves 2.7% in the
   weights leaves 3.3% in the posterior, because every resample widens alpha
   by 2% whatever the posterior.
3. **The robust floor matters more than it looks.** A 5% share over 40 C cost
   half a point of sd: prior particles 5 C away carry little weight each, but
   variance is weighted by distance squared.
4. **`.field { display: flex }` beats `[hidden]`.** The new blocks carry no
   display of their own, so `hidden` works; `#customTempField`, on main, is
   shown when it should not be (a separate fix).

## Choosing the time, the odds, and "still learning" (28 September 2026, E5)

Design and reasons in `INFERENCE.md` §8, measurements in `PLAN.md` (E5). What
follows is the record: what was checked, against what, and what it cost. Every
number here can be re-run with `npm run decide` (sections `cost`, `accuracy`,
`lean`, `odds`, `learning`, `runny`).

### What was run

- `npm test`: 186 tests, 185 pass, 1 todo (E3's 5b, which E5 does not claim to
  fix). `npm run validate`: 28/28. `npm run conformance`: fixtures regenerated,
  `swift test` 90 tests in 25 suites. `fixtures/decide.json` pins five pots'
  decision surfaces, a surface, and fourteen decisions from three posteriors;
  Swift chooses the same time as the TypeScript to 1e-12, including the scan and
  the golden section's comparisons.
- Chromium, driven through the app's own buttons with `Date.now` run fast. A
  fresh install: 2/10 and "Still learning your kitchen" under the time. Four
  cold starts, each answered "just right" and "firm": 5/10 and still learning after one,
  7/10 and not after two, 8/10 after three and four. A reload mid-cook kept
  the odds from "Eggs in"; heat off with 2 L (the white never sets) and the
  sous-vide screen showed none; "Forget what it learned" brought back 2/10 and
  still learning; at 375 px the line wraps to two.
- Responsiveness, in the same tab: a new egg size put the mean solve's time on
  screen in 138 ms and the chosen one with its odds at 1.08 s, the page's
  longest stall 42 ms; a one-second drag across the slider, 66 input events,
  never blanked the odds and stalled the page 45 ms at most.
- iOS: built for the simulator, after the merge with E4 and again at the end.

### Two runny whites at soft

INFERENCE §3's E3 test, as the choice sees it. The reference egg (68 g, fridge,
boiling water, ice), two eggs at soft with the white runny, on the app's own
surfaces. "E3" cooks each egg at the time the mean solve recommended then, as
`test/infer.test.ts` 5 does; "E5" cooks the second at the time E5 chose after
the first. Before any egg, soft is 419 s and jammy 464 s.

| eggs | cooked at | soft: mean solve, chosen | jammy: mean solve, chosen |
|---|---|---|---|
| E3, white only | 419, 469 s | 503, **559** (2/10) | 558, **595** (2/10) |
| E3, yolk just right too | 419, 434 s | 445, **565** (0/10) | 484, **481** (5/10) |
| E5, white only | 419, 538 s | 507, **627** (0/10) | 555, **675** (0/10) |
| E5, yolk just right too | 419, 552 s | 548, **668** (0/10) | 569, **689** (0/10) |

- With the yolk also just right, the choice does what E3's done-when asked:
  soft +146 s, jammy +17 s. The mean solve alone had soft +26 and jammy +20.
- With the white alone both move, 131-140 s: the time-scale is still blamed
  about 2:1 (INFERENCE §3). E5 does not fix that and does not try.
- At E5's own times the second runny white comes two minutes later than E3's,
  so the posterior concludes the whites are very late, and both levels lean to
  the edge of the 120 s window with odds of 0/10: the model's way of saying a
  soft yolk with a set white is not on offer to this cook. The refusal does not
  say so, because it reads the mean solve, which times the white at its median.

### Things that cost time

1. **The expected-utility time before the first egg was not close to the
   literature.** The brief expected a small shift; the prior gives 86 s at soft
   and 42 s at jammy, because its time-scale sd (11.9%, about +-70 s) makes the
   yolk's 0-1 loss nearly flat and leaves the white's tail to steer. One answer
   of any kind fixes it. So the time before any egg is the literature's, by
   rule, and that is written down as a departure from INFERENCE §8.
2. **The odds found a bug in E2's filter.** Calibrated for three eggs, then 4-6
   points low. Folding by plain reweighting (4000 particles) was calibrated at
   every egg, which pointed at the resample: a FIXED 2% jitter on alpha, in
   every direction independently, whatever the posterior. It is also why E4's
   reading left 3.3% where its weights said 2.7%, and why "still learning" came
   back after going for 44% of simulated cooks: the right time's spread was a
   sawtooth, +-8 s at jammy, +-15 s after the next resample, on a cook who never
   changed. Liu and West's kernel keeps the posterior's mean and covariance
   through the resample; after it, the odds are within 1-3 points at every egg
   (ECE 2.2%), E4's reading is kept at 2.6%, and "still learning" comes back for
   7%, so the owner's threshold replaced the four-egg fallback that had been
   built first. The floor E4 measured had been expected to hold the interval
   above +-15 s for good; that was true at the hard end (+-15-22 s) and not at
   jammy, where the combination the answers pin is narrower than alpha alone.
   The damage was the sawtooth, not the floor.
3. **Where the loss is flat, the minimum is noise.** On the counter's softest
   level every time past a point loses the same whole egg, and two surfaces
   that agree to 0.2 s everywhere else chose times 17 s apart, both near the
   window's edge. A cost of 1e-4 egg per second of lean makes the choice the
   earliest time that is as good as any.

### Not verified

- **Nothing on iOS was run or tapped.** Two simulators were already booted and
  in use, and driving one would have needed a permission prompt. The screens,
  the Live Activity's odds line and the cache rest on the build, `swift test`
  and reading the code.
- **The protocol advice** (INFERENCE §8, "recommend the protocol") was not
  built.
- **No real egg** has been cooked at a chosen time. The odds are calibrated
  against cooks drawn from the prior, which is the model's own idea of cooks.
- Safari was not tried.

## Unpadded hours, and Czech numbers anywhere (27 September 2026, F4 follow-up)

The owner's two answers of 27 September, built in both cores and pinned in
`fixtures/format.json`. `LANGUAGE.md` §2 has the rules; this is what was
checked.

- **No time of day zero-pads its hour.** `unpadHour`, in `format.ts` and
  `Format.swift`, drops a leading zero from the first run of digits after the
  platform has formatted: en-GB "09:05" -> "9:05", "00:05" -> "0:05", and
  en-CZ, where `Intl` wrote "09:05" and Foundation "9:05", now agrees. The
  countdown's m:ss is not touched.
- **Numbers follow the UI's language, the region only where the language has
  no convention of its own.** `OWN_CONVENTION` (`ownConvention` in Swift) is
  `cs` -> `CZ`: a Czech UI formats as `cs-CZ` in any region, so cs in the US
  writes "1 234,5" on both apps where iOS wrote "1,234.5". English is not on
  the list, so en-DE still writes "2,4".

### Verified

- **The counts.** `npm test` 188 tests, 187 pass, 0 fail, 1 todo (the known
  NOT MET in `infer.test.ts` 5b); `test/format.test.ts` gained 2d and 4b.
  `npm run validate` 28/28. `npm run conformance` 91 Swift tests in 25
  suites, all passing; `FormatConformance` gained `derived`.
- **`fixtures/format.json`**: times in ten locales now (en-CZ added), 130
  rows, none with a padded hour; the unpadding itself on 15 strings (a
  day period before the hour, "0:05" left alone, Arabic-Indic digits left
  alone); the formatting-locale grid, where every Czech row is now `cs-CZ`;
  and `derived`, 12 cases from a UI language, a region and an hour cycle
  through to "1 234,5", "2,4", "9:05", "0:05", "15:05" and "9:05:09". 510
  formatted numbers and times in all.
- **Foundation, measured** on macOS 26.6.2 before the change: en-GB `HH:mm`
  "09:05", en-CZ `H:mm` "9:05", cs-US `h:mm a` "9:05 dop." with "1,234.5",
  cs-GB "1,234.5"; `Intl` (Node 26.8.1, ICU 78.3) en-GB and en-CZ "09:05",
  cs-US and cs-GB "1 234,5" and 24-hour.
- **The web**, built with `npm run build:site` and served from this worktree
  on its own port, with a page pinning `navigator.language` to en-GB, in
  Chrome 152: `timeOfDay` "9:05", "9:05:09" and "0:05", and in that browser
  `formattingLocale('cs', 'US')` is `cs-CZ` and writes "1 234,5". The
  sous-vide line read "at 11:06", which could not show the change at that
  hour of the morning.
- **iOS** builds for the simulator (`xcodebuild`, generic destination, no
  install; the booted simulators were left alone).

### Not verified

- **Nothing on iOS was run or tapped.** The alarm line and the sous-vide
  start rest on `swift test` and the build.
- **A Czech UI's clock abroad.** Its tag is `cs-CZ`, so it is 24-hour on the
  web. On iOS a US phone adds `-u-hc-h12`, which `DateFormatter` ignores for
  Czech, so it is 24-hour there too and the apps agree; but that rests on a
  Foundation quirk (the last row of LANGUAGE §2's table), not on a choice.
  The owner decided the decimal separator, not the clock.
- **Safari** was not tried, and neither was any locale with non-ASCII
  digits, which `unpadHour` leaves as the platform wrote them.

## The rest of F2, and the app as "I" (27 September 2026, F2 finished)

Both of `LANGUAGE.md` §3's owner-approved tables, the rest-of-F2 draft and
the first-person pass, moved into `copy/en.json` and both apps' call sites.
§3's "As built" has the merges and the five rows held back; this is what was
checked.

### Verified

- **The rows, against the tables.** A script read each row's key and final
  column out of `LANGUAGE.md` and compared it to the catalogue: every row
  matches, except the three keys merged away and the five held back.
- **Only those strings changed.** `copyLiterals.js --since e1f7068`: 230 keys
  unchanged, 37 changed, each as `tools/copyDraft.ts` lists (before, after,
  and which apps name it), and neither app names a key the draft does not
  say it should. `copySnapshot.js compare --draft`, the web app captured at
  `e1f7068` and after, 171 states each: 202 distinct strings each side once
  the draft is applied to the old one; all 18 web-side rewrites were on
  screen in some state; "Cold pan", "Keep it boiling" and "after boiling"
  gone as retired, "Cold water", "Keep boiling" and "after the boil" new as
  drafted; nothing else.
- **The counts.** `npm test` 188 tests, 187 pass, 0 fail, 1 todo (the known
  NOT MET in `infer.test.ts` 5b), budgets included. `npm run validate` 28/28.
  `npm run conformance` 91 Swift tests in 25 suites, all passing, on
  regenerated fixtures (`fixtures/copy.json` changes only in the strings).
- **Both apps build.** iOS for the simulator (`xcodegen`, then `xcodebuild`,
  generic destination, no install; no simulator was booted or touched). The
  web with `npm run build:site`, and the snapshot harness drove the built app
  in its own headless Chrome on its own port.

### Things that cost time

- **Four rows do not fit their surfaces.** The budgets in
  `copy/surfaces.json` were recorded from the old English, and "I've" and
  "I'll" are longer than "it": "Forget what I've learned" is one character
  over a button. They stay at their live wording for the owner, with the
  lengths in §3.
- **"your pan took {boil} to boil last time" is not what `{boil}` is.** The
  boil memory blends each new boil half-and-half into the old, and a volume
  with no memory borrows the nearest one's time, scaled by litres, so the
  number on screen is often a time the pan never took. Held back.
- **"after boil" matched inside "after boiling"** when the snapshot proof
  rewrote the old build's strings, because an unanchored template matched
  anywhere. It now matches only at word boundaries.

### Not verified

- **Nothing on iOS was run or tapped.** The refusals, the Live Activity's
  estimate and cooling notes, and the pan lines rest on the build, the
  catalogue proof and `swift test`'s render fixture, not on a screen.
- **Whether the new lines fit on a phone** beyond the character budgets:
  "my guess until you tap Full rolling boil" is 40 against the Dynamic
  Island's 41, and was not seen in one.

## The odds at every level, and the slider they shade (27 September 2026)

The owner's answers of 27 September: an odds-shaded slider in both apps,
reachability from the odds at 3/10, an (i) on the odds line, and protocol
advice inline. `src/core/reach.ts` and `EggTimerCore/Reach.swift`.

- **A profile point is the odds the app shows at that level**, by
  construction: the mean solve there, decided on the pot's surface. Test 1 in
  `test/reach.test.ts` checks every point against the app's own path,
  exactly. Levels: the physical edges, every 0.05 between, and a bisection
  on the 0.01 grid at each end of the 3/10 range - 20-24 points on a boiling
  pot, 9-13 on the counter.
- **Cost** (`npm run decide -- reach`, node): 0.45-0.6 s a profile before the
  first egg, 0.75-1.0 s after (the choice is what costs, about 18 ms a
  level), against 0.4-0.8 s for the surface; 0.1-0.6 s on the counter or
  with the heat off. In the desktop app's browser pane both ran about 4x
  slower (surface 3.1 s, profile 4.0 s, cold start, four eggs), in the worker,
  so the page never waited: the odds came 3.8 s after load and the shading
  8.8 s. iOS builds it in a detached task after the surface.
- **Fresh install**: every level 0.12-0.26 across seven pots, so nothing
  reaches 3/10 and nothing is refused. The rule "no odds refusal before the
  first egg that taught something" stands beside it for any pot whose prior
  crosses 3/10 somewhere.
- **After eggs**: one egg moves the soft end 0.01-0.07 on boiling pots and
  0.57 -> 0.62 on the counter. In the browser, four constructed eggs (three
  jammy just right, one runny white at soft) on a cold start with ice: 7/10
  at jammy, stripes to 0.14, dots 0.14-0.19, soft asked for lands on 0.19 at
  3/10 with the white's sentence.
- **Counter rest, soft asked for** (browser, same four eggs): refused with
  "Resting on the counter keeps cooking the yolk", snapped past the physical
  0.69 to the odds' 0.73, 4/10; the advice listed weighing and ice.
- **The advice, measured on the model** (`npm run decide -- advice`): the
  counter to ice raises soft/jammy/fudgy from 0/0/3 to 5/6/6 after one egg
  and does nothing at hard; 2 -> 4 L with the heat off raises 0 to 3-4/10.
  A cold tap and a room egg change nothing, to the tenth. So the tap is never
  advised against, and the fridge and the scale are advised by rule, for
  what the model cannot see: a room at 17 against 23 C is 28 s at jammy; a
  size class spanning 63-73 g is 39-49 s.
- **Both disclosures** were opened and closed by click and by keyboard
  (Enter on the (i), Tab to the advice line, Space on it), with
  `aria-expanded` following; light and dark; no console messages.
- **Counts**: `npm test` 197 tests, 196 pass, 0 fail, 1 todo (the known 5b).
  `npm run validate` 28/28. `npm run conformance` 95 Swift tests in 26
  suites, all pass; the three profiles run as one parameterised test, about
  20 s in a debug build, beside the replay's 34 s.

### Things that cost time

- **A profile is slow in a Swift debug build**: 48 s for three in one test,
  a solve being several hundred ms unoptimised. Split into three arguments
  of one test, they run side by side.
- **A JSON key made in a console had its fields in another order**, and so
  never matched the app's cached profile: `decisionKey` is
  `JSON.stringify` of the inputs, order and all. The app always builds them
  the same way; a console must too.
- **The browser pane's background tab stopped painting** after a scroll. The
  page itself was fine; hiding the readout brought the slider into the first
  screen instead.

### Not verified

- **Nothing on iOS was tapped.** The build ran in a simulator of its own
  (created, used, deleted), which showed the fresh install's strip, the (i)
  and the advice line in light and dark. Neither disclosure was opened, no
  egg was fed back, the counter was not tried, and VoiceOver was not run:
  the (i)'s "Showing"/"Hidden" value and the DisclosureGroup's own state are
  as written, not as heard.
- **The unlikelySoft/Hard sentences were not seen on a screen** in either
  app: in every state tried, the level asked for and the odds' end had the
  same doneness word, where no sentence is due. They are rendered by the
  copy fixture and chosen by the verdict tests.
- **The strip's inset on iOS** is 14 pt a side, the old thumb's radius;
  iOS 27's wider thumb makes levels under it a few points off.

---

## One wording per meaning: a proposal (27 September 2026)

`LANGUAGE.md` §3, "Proposed: one wording per meaning", is a proposal for the
owner. Nothing in the catalogue or either app changed. It sorts all 125
single-app keys, each read at its call site: 15 pairs (29 keys, one NEW
wording), 40 platform-only, 46 in layouts that differ, and 10 orphaned, one
of them dead (`readout.phase.cooling`). It also describes a guard test
without building it. Found on the way, and not yet fixed: iOS says "white
just set" for a white the pan never sets. This was read in the code; no
screen was run.
