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

- **A quick synthetic tap does not flip a SwiftUI `Toggle` in the
  simulator; a held one (0.15 s) does.** Like the `Slider` that ignores
  synthetic drags, but with a cure. The screenshots also lag a tap by a
  frame or two, so look again before tapping twice.
- **JAX computes in single precision unless told** (`numpyro.enable_x64()`):
  the fit's likelihood missed the app's at the sixth digit until it was.
- **Apple's "Attestation Object Validation Guide" contradicts its own sample
  twice**: step 5's "expected public key hash" is not the hash of the key in
  credCert (the key id is), and the sample's bundle version is "1", not
  "1.0". The sample also carries authenticator-data extensions without the
  ED flag. Read the sample's bytes, not the prose, and fetch it as the page's
  JSON (developer.apple.com/tutorials/data/documentation/...json): retyping
  eight thousand base64 characters does not survive.
- **Netlify Blobs' strongly consistent reads need `uncachedEdgeURL`** in the
  environment the client reads; a hand-made context for the local server
  must carry it as well as `edgeURL`.
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
- **A service worker outlives the server it came from.** A browser that
  opened the built site on `localhost:8080` keeps that build for the
  address, and another worktree later served on the same port gets the old
  build instead of its own. Since 3 October the page drops the worker when
  `sw.js` answers 404 (`src/ui/offline.ts`), but a fresh build that has one
  takes over only between cooks and out of sight. When a page on localhost
  looks stale, unregister in the console
  (`(await navigator.serviceWorker.getRegistrations()).map((r) => r.unregister())`)
  or clear the site's data. On a simulator, Safari keeps it under
  `Containers/Data/Application/<Safari>/Library/WebKit/com.apple.mobilesafari/WebsiteData/Default/`,
  one folder per site with an `origin` file saying which, and a Home Screen
  web app keeps its own inside its `Library/WebClips/<id>.webclip`.

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

---

## Two lines that said something false (27 September 2026)

Both were found by the one-wording-per-meaning proposal above, read in the
code. No wording changed.

- **iOS said "white just set" for a white the pan never sets** (heat off, too
  little water: `whiteSets == false`, `refusal.whiteNeverSets`). It named the
  white from its peak temperature, and that scale has no word below "just
  set". The web switched to `texture.white.runny`, in `app.ts`. The decision
  is now core: `textureFor(peakYolk, peakWhite, whiteSets)` has a `runny`
  band, and `textureNoteKeys` says which keys the note is in, in both
  languages, so neither app decides anything. iOS's ticket carries no
  `whiteSets`; a cook starts only when the white sets, so its note passes
  `true`.
- **The web said "cooling starts on its own in {seconds} s" on a counter
  rest**, where the grace runs out into Done. `coolingStartsIn_s` in
  `machine.ts` answers it (null on a counter rest), and the hint is empty
  there. No line replaces it: the subline above already says "the yolk is
  still cooking", which is the true thing, and a second wording of it is
  what section 3 of LANGUAGE.md is trying to remove.

### Verified

- `npm test`: 200 tests, 199 pass, 0 fail, 1 todo (5b, as before).
  New: policy 4c and 4d (4d on a real solve: 68 g, 0.5 L, heat off, two
  eggs, peak white 51 C, whose peak alone reads "just set"), machine 2e.
- `npm run validate`: 28/28. `npm run conformance`: 96 Swift tests in 26
  suites; the texture fixture is 64 cases, four with a white that never
  sets, and the Swift suite fails if it has none.
- `copyLiterals --since cc0dc47 truths`: 274 keys unchanged, one changed as
  drafted (`texture.white.runny`, apps web -> web, ios).
- `xcodebuild` for a generic iOS Simulator destination: BUILD SUCCEEDED.
- The web, served from this worktree on its own port in its own tab: heat
  off with 0.5 L says "white stays runny"; a cook moved to PULL through
  localStorage shows no hint on the counter and "cooling starts on its own
  in 13 s" on ice.

### Not verified

- **Nothing on iOS was run.** The texture note is held by the core's
  conformance and the build; no screen showed "white stays runny".
- **iOS at the pull was read, not run.** It makes no "starts on its own"
  promise: no line under its button, "the yolk is still cooking" under the
  readout. But on a counter rest its Live Activity (`activity.note.pull`,
  "into the cooling, or the yolk keeps going") and pull notification
  (`alarm.pull.body`, "Straight into the cooling, or the yolk keeps
  cooking.") still speak of a cooling the cook did not choose. Not the same
  fault, and fixing it needs a wording, so it is left for the owner.

---

## iOS rings when notifications cannot (27 September 2026)

With notifications refused, unanswered or not taken, the iOS readout said
"keep the app open", and nothing then sounded. The owner's decision: make it
true. While the app is on screen it now rings each deadline no notification
holds - the pull, and the end of the counted cooling (the probe moment is the
same deadline). When a notification does hold it, the app adds nothing: the
foreground `willPresent` already plays its sound. Both strings are unchanged.

- **The decision** is `deadlineToRing` in a new package target,
  `EggTimerRing`: pure, clock passed in, like `phaseAt`. Its own target so
  `swift test` covers it and `EggTimerCore` stays a transliteration; the web
  has no notifications and rings at every deadline, so it has no counterpart.
  Ten tests drive a whole cook at quarter-second ticks: refused, unanswered
  and failed each ring the pull and the cooling once; a full schedule rings
  nothing; a partial one rings only the gap; a counter rest rings only the
  pull; the background rings nothing; a deadline that passed before the app
  came on screen is not rung.
- **Coverage is per deadline**, read back from the pending identifiers. A
  delivered notification is no longer pending but did its job, so a past
  deadline keeps its coverage; otherwise a re-read after the pull would have
  made the app ring for a notification that had already rung.
- **The sound** is the web's, generated in `AVAudioEngine` rather than shipped
  as a file: 880 Hz pairs every 1.6 s, a 1175 Hz third at the pull, triangle
  waves with ramped edges, and `kSystemSoundID_Vibrate` each burst. Up to
  40 s as on the web; any touch, the pull button, Cancel or leaving the app
  stops it sooner. `.playback` with `.duckOthers`, so it sounds through the
  silent switch, as the Clock app's timer does. The notification path is
  silenced by the switch, so the fallback is the louder one; that is the
  cost, and the reasoning is in `Ringer.swift`.

### Verified

- `npm test` (199 pass, the known todo), `npm run validate`,
  `npm run conformance` (96 Swift tests, fixtures regenerated after merging
  main at 4eeadd2 and unchanged), and a generic-simulator build.
- On a simulator of its own (created, used, deleted), with a cook seeded into
  `UserDefaults` 25 s from its pull and the permission prompt left
  unanswered: the log said `ringing for pull` 41 ms after the deadline,
  `ringing for cooled` 0.25 s after the cooling ended, and `ring stopped`
  40.5 s later. A second run sent the app to the background across the
  pull and brought it back: no ring for the pull, and the cooling rang.

### Not verified

- **Nothing was heard or felt.** The evidence is log lines; the tone was not
  listened to, and the simulator has no vibration motor.
- **The silent switch, media volume and a real speaker**: only a device can
  say whether `.playback` gets through the switch as intended, and a media
  volume at zero would still silence it.
- **Refused and failed** were not produced on the simulator (`simctl
  privacy` has no notifications service); only unanswered was. The rule is
  the same for all three and the tests cover each.
- **Touch to stop** was not tapped. Neither was the authorised path, where
  the app should ring nothing.

## The web redesign (27 September 2026)

UI.md's layout, web only: two controls and a sentence, a Kitchen page, a Help
page, one (i) component, and the owner's wording rules of the same day.
UI.md section 8 is the as-built; LANGUAGE.md section 3 lists the strings.
Core is unchanged.

### Verified

- `npm test` (200 tests: 199 pass, the known todo), `npm run validate`
  (28/28), `npm run conformance` (96 Swift tests, with `fixtures/copy.json`
  regenerated for the new keys; no other fixture moved).
- `copyLiterals.js --since 80799d0 redesign`: every key that changed is in
  the draft, and each app names what the draft says. `copySnapshot.js compare
  --draft redesign` against a capture of `80799d0` (171 states before, 172
  after): only the drafted strings changed.
- Driven in headless Chrome at 390 x 844 over DevTools, `Date.now` frozen and
  stepped: a fresh install; each clause of the sentence, including a weighed
  egg, a custom temperature, sous-vide and back; the Kitchen and back, by its
  own Back and by the browser's; Help, from its link, from the low-odds link
  (landing on its reliability section with the advice for the setup on
  top), and from its address; a cold-start cook through heating, the boil,
  the pull and the cooling to Done, with the probe offered, taken and read,
  and both questions answered; "based on history" and its (i) on the next
  egg; Forget, kept and then confirmed; light and dark; and a 1280 px desktop.
  No console errors or warnings, except Chrome's refusal to start the alarm's
  AudioContext for a scripted click, which is not a user gesture.

### Not verified

- **A phone.** The 390 px checks are an emulated viewport in desktop Chrome;
  Safari on iOS was not run, and nor was a real thumb on the sentence's
  buttons.
- **A screen reader.** The names and states were read from the DOM ("Egg:
  68 g, change", "About Water", `aria-expanded`), not heard.
- **The alarm's sound**, for the reason above.
- **The owner's review of every new text**, which is the point of the deploy
  preview.

---

## Which way a miss goes: the outcome summary (27 September 2026)

"7/10 eggs hit the mark" did not say whether the other three were too soft
or too firm. `predictOutcome` (`src/core/outcome.ts`,
`EggTimerCore/Outcome.swift`, `fixtures/outcome.json`) reads the decision's
own inputs at the chosen time and returns the three yolk answers, a runny
white, the 10/50/90% points of the delivered yolk doneness on the slider's
scale (noise in, taste offset out, clamped to [0, 1]), and a lean at a ratio
of 1.5. Core only: the web and iOS screens do not show it yet.

- **Calibration** (`npm run decide -- outcome`: 400 simulated cooks x 6
  eggs, 1000 particles, eggs at the time the app would choose). The
  delivered level is inside the 80% range for 81.1% of 2400 eggs, 8.2% under
  and 10.7% over; by egg 83.0, 79.5, 82.0, 83.3, 81.5 and 77.5%, as the
  range narrows from 0.54 of the slider to 0.20. Expected calibration error:
  too soft 1.3%, just right 1.5%, too firm 1.6%, runny 0.2%. The smaller run
  in `test/outcome.test.ts` (150 cooks, 250 particles): 79.9% inside, 12.0%
  under, 8.1% over, errors 1.2-4.4%.
- **The lean**, on a second egg 30 s either side of each chosen time, not
  folded: at every ratio from 1 to 3 a stated lean is right about as often
  as its probabilities say (1.5: given for 85% of misses, right 83.3%,
  predicted 84.0%; 3: given for 59%, right 92.2%, predicted 91.2%). So 1.5
  is a choice of when to say it: a miss one way three times in five at the
  least. At the chosen time 73% of eggs are balanced, 24% lean firm and 3%
  soft. The choice leans late because a runny white costs three.
- **Examples**, production surface and particle count, 68 g, boiling, ice.
  A fresh install at jammy: 464 s, 2/10; too soft 0.38, just right 0.21,
  too firm 0.41; range 0.14-0.72 with a median of 0.42; balanced. After
  three jammy eggs just right with a firm white: 463 s, 0.77 just right,
  0.11 soft, 0.12 firm; range 0.35-0.51, median 0.43; balanced. On
  `decide.json`'s posteriors, the cook who likes a firmer yolk has a jammy
  median at 0.45, above the slider's 0.41, and the white-bound soft level
  (a runny white at soft) leans firm, 0.21 against 0.13.
- **Cost**: about 2 ms in node (0.8 ms at hard, where the range clamps and
  needs no bisection), against 13-16 ms for a decision after an egg and 2
  ms before one. One pass over the particles for the answers, then 20
  bisections on the mixture's CDF for each of the three points.
- **Counts**, after merging main at 1a6fada: `npm test` 206 tests, 205 pass,
  0 fail, 1 todo (5b, as before). `npm run validate` 28/28. `npm run
  conformance` 99 Swift tests in 27 suites and 10 ring tests, all pass;
  Outcome's three agree to 1e-12. Every fixture other than outcome.json is
  byte for byte what it was.

### Things that cost time

- **`weightedQuantile` alone gives the wrong range.** It returns the
  particles' own delivered levels, which is the spread of what is not yet
  known, without the egg-to-egg noise. On the test's three-egg posterior
  (400 particles, jammy, 464 s) that is 0.36-0.49 against the mixture's
  0.35-0.51. The points are found by inverting the
  mixture's CDF instead; the test checks that with the noise taken to zero
  they fall back onto the particles' weighted quantiles.
- **0.3 / 0.2 is 1.4999999999999998** in floating point, so a fixture edge
  case written that way pinned 'balanced' by accident. The edge cases now
  use 0.375 and 0.25, which are exact.

### Not verified

- **The noise is two things.** The likelihood cannot separate the egg's
  scatter from the cook's judging, so the range is as wide as the answers
  make the egg look. The simulation draws eggs from the same model, so it
  cannot test that split. Only a thermometer can test it (§5).
- **Nothing is on a screen.** The UI agent wires `#direction`,
  `#whiteRisk` and `#donenessBracket` to these fields.

---

## The outcome summary on the web (27 September 2026)

The web's headline under the time is now which way the egg is likely to
miss, with the yolk's likely range drawn under the slider and the number
moved into the odds' (i). Web only: `src/ui/outcome.ts` (the words),
`src/ui/app.ts` (the outcome computed beside the decision and carried with
the cook), `index.html`, `styles.css`, the `outcome.*` keys and the
`outcome` draft. Core and iOS are unchanged. UI.md section 8 has the rules
and the thresholds; LANGUAGE.md section 3 the strings.

### Verified

- `npm test`: 210 tests, 209 pass, 0 fail, 1 todo (5b, as before); four
  are new, in `test/outcomeCopy.test.ts`: each sentence at its thresholds'
  edges, the white's line at one in five and not at 0.17, the range's words
  at the clamps, and an outcome read back after a reload whole or not at
  all. `npm run validate` 28/28. `npm run conformance`: 99 Swift tests in 27
  suites and 10 ring tests pass, with `fixtures/copy.json` regenerated for
  the new keys; no other fixture moved.
- `copyLiterals.js --since 7a40373 outcome`: 349 keys unchanged, 12 changed,
  each as drafted (ten new, `odds.hitTheMark` now iOS's alone,
  `help.odds.p2` saying "7 in 10"). `copySnapshot.js compare --draft
  outcome` against a capture of `7a40373` (172 states each side): new as
  drafted, "2/10 eggs hit the mark" gone as retired, nothing else.
- **Where the thresholds land**, on the production surface and particle
  count, at the decided time, across five pots, five posteriors and six
  levels (a scratch script over `decide`/`predictOutcome`). A fresh install
  reads P(just right) 0.21-0.30 and balanced everywhere; one jammy egg just
  right, 0.56-0.58; three, 0.77-0.79. P(runny) is 0.07 at jammy and 0.17 at
  soft on a fresh install, 0.36 at runny, 0.42-0.45 at the counter's
  softest; after three eggs just right it is 0.02 except at runny (0.11 hot,
  0.21 cold start) and the counter's softest (0.13-0.15). Hence 0.2 for the
  white's line rather than 0.15: at 0.15 a fresh install at soft would warn
  on the width of the prior alone.
- **Driven** in headless Chrome at 390 x 844 over DevTools, dark and light,
  on this worktree's `_site` served on its own port: a fresh install (cold
  start and boiling water at jammy: "Could come out softer or firmer than
  you like — I can't call it yet.", 2 in 10, the bracket 0.14-0.72, "Likely
  yolk: Soft to Fudgy"); three consistent jammy eggs seeded into the log
  ("Probably just right.", 8 in 10, the bracket 0.35-0.51 and "Likely yolk:
  Jammy", no "still learning"); the odds' (i) opened; the white a risk on a
  fresh install at runny and on the counter at its softest (the line shows;
  "Runny to Soft", "Jammy to Hard"); one egg at the soft end, snapped to
  0.02 ("It could miss, and if it does, more likely firmer than you
  like.", 3 in 10); sous-vide (no direction, no bracket, no reserved space);
  a cook under way, and the same cook after a reload (the direction and the
  number carried, the bracket gone with the slider); Help's "How sure I am".
  In the Browser pane: a pot change mid-idle holds the readout at its height
  (280 px before, during and after). No console errors; the only warnings
  are Chrome's refusal to start the alarm's AudioContext for a scripted
  click, as before.

### Things that cost time

- **The readout jumped twice.** Once when the surface landed, because the
  old reserved line held one short line and the direction is two; and again
  on every change to the sentence, because a new pot blanks the lines until
  its surface lands, which moved the open choice under the thumb. The
  direction now reserves its two lines while idle, and the readout keeps its
  last height while a surface is on its way.
- **"Probably just right" is about the yolk alone.** P(just right) is the
  yolk's answer; the odds in the (i) also need the white set, so they can
  read well under it, and do so when the white is the risk. The white's own
  line is what says that on screen, rather than the sentence's threshold
  quietly folding the white in.

### Not verified

- **A phone, a screen reader, and the owner's eye**, as for the redesign.
  "Likely yolk: Soft to Fudgy" was read from the DOM, not heard.
- **"It could miss" when a miss is nearly certain.** Where the yolk is just
  right one time in fifty and firm the rest (the white-bound levels after
  runny whites), the sentence understates. Those levels read 0 in 10, so
  the odds' reach should keep them off the slider once any level reaches 3
  in 10; the sweep read the mean solve's verdict without the reach, and no
  driven case showed one. A pot where no level reaches 3 in 10 and a lean
  is strong would. Not seen, not ruled out.
- **The median mark** sits under the thumb for a cook whose taste is the
  slider's; it shows only when the level and the slider part (a cook who
  likes a firmer yolk). No seeded case showed that on screen.

## The doneness track is a yolk (27 September 2026)

The owner, from a phone: the green slider was jarring; sweep it as a yolk
does, orange runny to yellow hard. The band under the thumb now has the
yolk's hue at each level (`--yolk-runny` / `--yolk-jammy` / `--yolk-hard`,
golden at jammy's anchor, 0.41), and `renderOddsBand` lays the odds on as a
mask of opacity rather than mixing `--ok` into each stop. Dark: `#ff7417`,
`#ffb31f`, `#ffe680`. Light: `#d9530a`, `#e89400`, `#e8c410`, deeper
because a pale yellow vanishes on the light track. Thumb, bracket, dots,
stripes and ticks unchanged. `--ok` still colours the DONE screen's time
and border, which is not the odds; iOS's `OddsTrack.swift` is still green.

### Verified

- `npm test`: 210 tests, 209 pass, 0 fail, 1 todo (5b, as before).
- Headless Chrome at 390 x 844, dark and light, on this worktree's `_site`
  on its own port, eggs seeded by cooking three jammy eggs through the app
  with `Date.now` stepped, as `tools/copy-snapshot.html` does: a fresh
  install (the band strong from soft up, stripes at the runny end, the
  bracket soft to fudgy); three just-right eggs (dots from 0.09 to 0.16 over
  a faded orange, the bracket 0.31-0.47); the counter rest asked for runny
  (refused to fudgy, stripes to 0.65, the dots at 0.66-0.70 under the
  thumb) and the same pot with the thumb moved to hard, so the dots show.
  The thumb reads against the band in both schemes by its ring in the
  background colour, even where the dark scheme's golden is its own amber.

### Not verified

- **A phone and the owner's eye.** The light scheme's hard end is a
  mustard, not a pale yellow, chosen because a pale yellow would sit at
  about the grey track's lightness; no paler stop was tried on screen.

---

## Playing safe (27 September 2026)

The owner wanted the uncertainty to be something a cook can act on. Under
the direction there is now a one-tap suggestion that moves the slider to a
level that plays safe. The direction's one (i) now explains the bracket and
how to act on it. "I'm still learning" is gone from the web as a line of its
own, and its (i) is folded into the direction's.

The change touches:

- **Core:** `saferLevels`, `outcomeAtLevel` and `offeredPositions` in
  `src/core/reach.ts` and `Reach.swift`, and `fixtures/safer.json`.
- **Web:** the worker job, `src/ui/outcome.ts` (`playSafe`),
  `src/ui/app.ts`, `index.html` and `styles.css`.
- **Copy:** the `safe` draft, and `idle.welcome` in the owner's words.

INFERENCE.md §8 has the definition, UI.md §8 the behaviour, and LANGUAGE.md
§3 the strings. iOS UI is unchanged.

### Verified

- **Tests:** `npm test` runs 218 tests: 217 pass, 0 fail and 1 todo (5b,
  as before). The new ones are `test/safer.test.ts` (6) and two in
  `test/outcomeCopy.test.ts`.
- **Validation:** `npm run validate` passes 28/28.
- **Conformance:** `npm run conformance` passes 100 Swift tests in 28
  suites and 10 ring tests. The new suite is `Safer`, with 5 cases, 15
  play-safe levels and 15 outcomes, matched to 1e-12. `fixtures/copy.json`
  was regenerated for the new keys. No other fixture moved.
- **Copy proof, catalogue:** `copyLiterals.js --since ff6c6e9 safe` finds
  357 keys unchanged and 15 changed, each as drafted.
- **Copy proof, rendered web:** `copySnapshot.js compare --draft safe`
  against a capture of `ff6c6e9` (172 states each side) finds only the
  drafted strings changed.
- **Monotonicity:** `npm run decide -- safer` reads every offered level on
  seven pots under four posteriors. `levelLow` and `levelHigh` rise with the
  level except for one step up from the counter's softest offered level
  (0.001-0.004, in 3 of 28). At every level tried, the bisection agrees with
  a full scan.
- **Cost:** 0.1-0.9 s per call in node, with a median of 0.5 s. That is
  about 40 ms per level read, and up to 16 reads.
- **Driven** in headless Chrome at 390 x 844 over DevTools, in dark and
  light, on this worktree's `_site` served on port 8397. Screenshots are in
  the session scratchpad's `safe/`.
  - **Fresh install at jammy:** "Could come out softer or firmer than you
    like — I can't call it yet.", then "Rather not risk it firm? Try:
    Soft", pointing to 0.13. Tapped, the slider goes to 0.13, the bracket
    runs Runny to Jammy, no second suggestion shows, and focus goes to the
    slider.
  - **Three consistent jammy eggs:** "Probably just right.", no suggestion,
    and "Likely yolk: Jammy".
  - **One egg answered too soft:** "Rather not risk it soft? Try: Fudgy",
    pointing to 0.56. Tapped, the bracket runs Jammy to Fudgy.
  - **A drag from jammy to fudgy** on a fresh install holds the readout at
    271 px throughout. The answer is then "Rather not risk it firm? Try:
    Jammy", pointing to 0.33.
  - **The (i)** opens its three paragraphs.
  - **Console:** no errors.

### Things that cost time

- **The ratchet.** At the level a tap reaches, the same rule measures the
  same risk against the new level. On a fresh install, jammy suggests
  fudgy, then fudgy suggests hard. A level reached by tapping now offers
  nothing until something changes.
- **The same word twice.** After a few eggs the move is a few hundredths,
  and the nearest word is the one on the slider already. "A little firmer"
  and "A little softer" fill that case.
- **The arrow.** Written into the string, a screen reader would say "right
  arrow". It is drawn in CSS, as the low-odds link's is.

### Not verified, and open

- **Is the soft-safe suggestion on a fresh install right?** On the prior,
  P(too firm) (0.41) edges P(too soft) (0.38), because the choice leans
  late for the white. So a new cook at jammy is offered Soft, at 0.13. At
  0.13 the white's line shows: "The white might still be runny." Playing
  safe on the yolk moves the risk to the white.
  - One fix: only offer a softer level whose P(runny) is under 0.2.
  - That is a rule for the owner to make. It is not built.
- **Help's "How sure I am"** was to be rewritten to cover the direction,
  the range, playing safe and then the number. It was left alone, because
  the owner has Help's rewrite in hand separately.
- **Not tried on a real device:** a phone, a screen reader, and the
  owner's eye. The accessible name was read from the DOM, not heard.
- **The copy snapshot harness** never waits long enough for the worker's
  play-safe answer, so the proof does not exercise the suggestion's two
  lines. They were checked in the driven runs above instead.
- **Slow first answer.** On first load the suggestion arrives after the
  surface, the profile and the search. That took several seconds in the
  headless runs, and the readout grows by a line when it lands.

---

## Playing safe never costs the white (28 September 2026)

The open question above is settled: a softer play-safe level must now keep
P(runny) under `WHITE_RISK` (0.2), which moved to `src/core/outcome.ts` and
is shared with the web's white line (`whiteRisk` in Swift). This is in
`saferLevels` in both languages; firmer is unchanged. A fresh install at
jammy no longer offers Soft (0.13, runny 0.34). It offers "Rather not risk
it soft? Try: Fudgy", to 0.67. See INFERENCE.md §8.

- **Tests:** `npm test` runs 219: 218 pass, 0 fail and 1 todo (5b, as
  before). Test 7 is new: firmer never raises P(runny).
- **Validation:** `npm run validate` passes 28/28.
- **Conformance:** `npm run conformance` passes 101 Swift tests in 28
  suites and 10 ring tests. `fixtures/safer.json` has a sixth case, the
  web's fresh install at jammy, and its prior case at jammy moved from
  softer 0.15 to null. No other fixture moved.
- **Copy proof:** `copyLiterals.js --since fd11498` finds 369 keys
  unchanged and 0 changed. Its 15 "failures" are the `safe` draft's keys,
  already applied at fd11498.
- **Driven** in the Browser pane on this worktree's `_site`, port 8413,
  fresh storage: the suggestion as above, pointing to 0.67. Tapped, the
  slider goes to 0.67, with no second suggestion and no white line. No
  console errors.

---

## iOS follows the web's layout, pass A (28 September 2026)

The iOS app now has the web redesign's layout (UI.md section 9):
- the egg: the time, the slider, the setup sentence, one slot and Start;
- Settings and Help, each a pushed page;
- one (i) component everywhere;
- the yolk-coloured doneness track.

The direction sentence, the bracket and playing safe are pass B. Their
slot, under the time, still holds the iOS odds line. Egg from gained
Custom, as on the web, stored under `startTemp` and `customStartC`, with
`fromFridge` kept in step for a downgrade. The egg's weight is now typed,
where it was a slider. The copy is the `iosA` draft: 132 rows and no
change of wording. Of those rows, 104 web keys gained `"ios"`, 25 iOS keys
were retired, and 3 iOS keys are new.

### Verified

- **Tests:** `npm test` runs 219: 218 pass, 0 fail and 1 todo (5b, as
  before). Test 6a (every key used by exactly the apps it lists) holds.
- **Validation:** `npm run validate` passes 28/28.
- **Conformance:** `npm run conformance` passes 101 Swift tests in 28
  suites. Only `fixtures/copy.json` moved, for the keys.
- **Copy proof:** `copyLiterals.js --since 91d5fff iosA` reports that only
  the drafted strings changed.
- **Build:** `xcodebuild` for `generic/platform=iOS Simulator` succeeds,
  with no warnings in `ios/App`.
- **Screenshots:** taken on a simulator made for this and deleted after
  (iPhone 17 Pro, iOS 26.5), light and dark, using the debug launch
  arguments. They show:
  - the idle screen of a fresh install: the welcome, "2/10 eggs hit the
    mark", the low-odds link, and the yolk track in the dark scheme once
    the pot's profile landed (about 30 s on a fresh install);
  - the Start clause and the Egg clause open;
  - Settings and Help;
  - Heating, with the new rolling-boil line and its (i).

### Things that cost time

- **An agent running under worktree isolation cannot run a shell script by
  a variable path.** The same goes for a `sed` whose range is computed.
  Each has to be a literal command, or a script file run by its literal
  path.
- **A fresh simulator needs about 30 s** before the odds profile lands and
  the track is coloured. The screenshot scripts wait 40 s.
- **Starting a cook on a fresh simulator asks for notifications.** The
  alert would be in the picture, so `-noAlarmPrompt YES` answers no without
  asking, in debug builds only.

### Not verified

- **Nothing was tapped.** Every screen was reached by a launch argument,
  not a tap. So these are unseen on a device:
  - the clause links' tap targets;
  - Done;
  - the (i)s opening;
  - the Forget confirmation;
  - the advice link opening Help at its reliability section;
  - typing a weight.
- **VoiceOver** was not run. The sentence's representation, the clause
  buttons' values and the (i)'s Expanded/Collapsed are as coded, not
  heard.
- **Focus does not go back to the clause after Done**, as it does on the
  web. SwiftUI has no simple way to put VoiceOver focus inside a Text's
  link.
- **The lower half of Settings, and Help's reliability section with
  advice in it,** were not photographed. Neither can be reached without a
  scroll.
- **The open clause's wash** stands in for the web's solid accent fill,
  because a link's text takes the tint. The owner has not seen it.

---

## The English of 1750, on the web (28 September 2026)

F6's web half, built overnight for the owner's review in the morning. An
English page switched from Metric to Imperial now reads in the manner of
Johnson's *Preface* of 1755. Switching back restores modern English, and
picking *English* in Settings leaves 1750 and keeps °F. As built, and every
place it departs from the guide, is in LANGUAGE.md §6.

- **The catalogue:** `copy/en-x-1750.json`, 307 keys: every key the web
  uses, plus the owner's approved alarm body, for iOS when it follows.
  The spelling table is `copy/en-x-1750.spelling.json`, 47 forms.
- **The rule:** `src/core/language.ts`, pure, for iOS to port. The web
  listens for F3's `aet:unitsflip` and redraws in place, with no reload.
- **The record:** `lang: "en-x-1750"`, `register: "1750"`.
- **Before the 1750, modern English:** Help's "How sure I am" was brought
  up to playing safe (the draft `oddsHelp`), at the coordinator's request,
  and then shadowed.
- **Tests:** `npm test` runs 239: 238 pass, 0 fail and 1 todo (5b, as
  before). `test/en1750.test.ts` is new, with 20 tests.
- **Validation:** `npm run validate` passes 28/28.
- **Conformance:** `npm run conformance` passes 101 Swift tests in 28
  suites, and 10 ring tests. `fixtures/copy.json` now renders the 1750
  catalogue too (918 rows, from 453), and the Swift renderer agrees.
- **Copy proof:** `copyLiterals.js --since 05d466b` finds the six new keys
  (the draft `period`) and nothing else.
- **Driven** in headless Chrome at 390 px, on port 8177 with fresh storage:
  a fresh install in English; Imperial, giving 1750 on the idle screen,
  Settings, Help and a cooking phase; then *English*, giving modern
  English with °F kept. A page switched in place matched the same page
  loaded fresh in 1750, word for word and label for label, once the
  screen reader's line was made to redraw. The 1750 phase labels, upper-
  cased in a book face, wrapped at 390 px and were shortened.
- **Not verified:** VoiceOver reading the title's `aria-label`; Safari;
  the 110-character alarm body on a Lock Screen; the owner's ear.

## The web's action bar hides what scrolls under it (28 September 2026)

- 28 September 2026: headless Chrome at 390x844 on port 8391, English and 1750, light and dark: the 1750 welcome no longer reads through the hint, and scrolled to the end the slot's last line sits clear above the bar; of about 930 boxes in `main` outside the bar (idle, heating, cooking, Kitchen, Help), none moved; `npm test` 238 pass, 1 todo. Not verified: Safari, and a phone's keyboard over the probe field now that the bar is sticky rather than fixed.

---

---

## iOS follows the web's prediction, pass B (28 September 2026)

Built overnight for the owner's review. The iOS egg now says what the web
says under the time: the direction sentence, its one (i), the white's line,
the bracket under the slider, and the play-safe suggestion. The phase
screens use the web's words wherever the moment is the same, and the
doneness slider has one track, the yolk's, where it had two. As built, and
what was kept and why, is in UI.md §10.

- **The copy:** the draft `iosB` in `tools/copyDraft.ts`, on `44b0cb1`,
  with 34 rows and no change of wording. iOS now shares 26 web keys: 17
  `outcome.*`, and 9 for the phases and hints. It retires 8 iOS keys:
  `odds.info`, `odds.why`, `odds.stillLearning`,
  `readout.phase.heatingTap`, `readout.sub.heatingEstimate`,
  `readout.sub.done`, `readout.big.now` and `readout.big.eat`.
  `odds.hitTheMark` stays, on the Lock Screen only, where the direction
  does not fit in 33 characters.
- **Copy proof:** `copyLiterals.js --since 44b0cb1 iosB` finds the 34 rows
  and nothing else. 319 keys are unchanged.
- **Tests:** `npm test` runs 239: 238 pass, 0 fail and 1 todo (5b, as
  before). No test is new: the logic iOS gained is the web's
  `src/ui/outcome.ts`, which is tested, ported line by line into
  `ios/App/Direction.swift`.
- **Validation:** `npm run validate` passes 28/28.
- **Conformance:** `npm run conformance` passes 101 Swift tests in 28
  suites, and 10 ring tests.
- **Build:** the app builds for the simulator (Debug) with no errors.

### Verified, in a simulator of my own

`iosB-shots`, an iPhone 17 Pro on iOS 26.5, was created and deleted for
this. Each shot was taken on a fresh install; the learned states come from
the new `-seedEggs` hook, which writes records through the app's own store
and folds them.
- **A fresh install** at jammy reads "Could come out softer or firmer than
  you like — I can't call it yet." It shows the bracket from Soft to Fudgy
  and "Rather not risk it soft? Try: Fudgy". The suggestion lands about 30
  s after launch, once the surface, the profile and the play-safe levels
  are built.
- **After three eggs just right** it reads "Probably just right.", with a
  bracket about the thumb's width and no suggestion.
- **After one egg too soft** it reads "I can't call it yet", the time rises
  to 12:09, and it offers "Try: Fudgy". Tapped (by the `take-safe` hook,
  which calls the same method as the button), the slider moves to Fudgy,
  the time reads 12:59, and no second suggestion follows.
- **The direction's (i)** opens its three paragraphs.
- **Heating** reads "HEATING" and "0:59 heating · I expect 8:00 until you
  tap".
- **Both schemes:** the bracket reads in light and dark, and the track is
  one yolk in both.

### Things that cost time

- **The worktree guard** refuses compound shell commands that it cannot
  prove stay inside the worktree, and a variable holding a simulator id
  counts as one. The fix was plain, separate commands and edit scripts in
  the scratchpad.
- **A network outage** cut the session off after the take-safe shot. The
  commits made before it were intact.

### Not verified

- **VoiceOver on a device:** the slider's adjustable swipe (a tenth of the
  range), the bracket's "Likely yolk: Soft to Fudgy", and focus moving to
  the slider after a tap.
- **The haptic tick** at each doneness word. The simulator has no Taptic
  Engine.
- **A real drag** on `YolkSlider`: the thumb, the grid snapping, and that
  the white's line appearing mid-drag does not lose the drag. Nothing drove
  a drag; the screenshots are at rest.
- **The cooking, pull and done screens** in their new words. They were
  built, and read in the diff, but not screenshotted: reaching them needs a
  cook of ten minutes or more.
- **The direction mid-cook.** It needs a cook started after the decision
  landed, and the `heating` hook starts one before.
- **The pending state:** that the suggestion's line holds its height while
  the next one is worked out.
- **Dynamic Type** at large sizes. The two-line room for the direction is
  measured in the text's own lines, so it should scale, but that was not
  checked.
- **The Live Activity**, unchanged, and not looked at.

## Sous-vide is never remembered (28 September 2026)

The owner opened the app on sous-vide, left there by the last session, and
was told he was 22 hours late: "a bad first choice". Both apps now refuse to
save sous-vide as the start method. It still works for as long as the page or
the app is open; what is written down in its place is the pan saved before
it, so a reload or a relaunch comes back to cold or boiling water, or to cold
if there never was a pan. Everything else in the setup saves as before.

- **Web** (`saveSettings` in `src/ui/store.ts`): a save made in sous-vide
  writes the start mode already stored, read as cold or hot, and cold for
  anything else. `loadSettings` reads only cold or hot, so a stored `sous`
  from an older build loads as cold. `test/store.test.ts` holds the four
  cases: a pan round-trips, sous-vide after a pan comes back as that pan
  (with the rest of the same save kept), sous-vide with no pan before it
  comes back cold, and a stored `sous` loads cold.
- **iOS** (`Settings` in `ios/App/Store.swift`): a save in sous-vide skips
  the `start` and `coldStart` keys and writes the rest, so they keep the last
  pan. A stored `sousVide` loads as cold, not as the `coldStart = false`
  written beside it, which was a placeholder and not a hot start anyone
  chose; and with no `start` and no `coldStart` at all it opens cold. The app
  has no test target, so this is not under test; it is the web's rule, and
  the build passes.

## The English of 1750 on iOS, written down (28 September 2026)

The iOS half of F6 (`01c621e`..`15cf890`) shipped without its docs. They are
now in `LANGUAGE.md` §6, *As built (iOS)*. F6 is ticked in `PLAN.md`, with the
owner's review of the wording still open. `UI.md` §10 records that the Lock
Screen no longer shows odds.

What the docs rest on, checked against the code and not the commit messages:

- **The switch** is `Language.swift` in the core, held to
  `fixtures/language.json` by four Swift tests (30 transitions, 19 stored
  reads, 17 tags). `LanguageChoice.swift` stores it under `languageState`.
- **The catalogue** has 343 keys against English's 344. Of the 40 iOS-only
  keys, 39 have a twin. The missing one is `app.name`, which
  `test/en1750.test.ts` 1b leaves to English by name.
- **The Lock Screen.** `odds.hitTheMark` appears nowhere in `copy/`, `src/`
  or `ios/`, and the activity's attributes carry no odds. Only
  `tools/copyDraft.ts` and the older, dated sections of the docs still name
  the key.
- **The tint.** `AccentColor` is #8A4B00 in light and #FFB020 in dark, in both
  asset catalogues. These are the web's `--accent`.
- **The colophon's new wording is shared copy**, so the web's changed too.
  The web section's note that *denaturation* and *kinetics* stay in the
  colophon is no longer true. The iOS section says so rather than rewriting
  the web's dated record.

### The Lock Screen, tried and not seen

The owner asked to see the Live Activity mid-cook, in English and in 1750.
It was tried in a simulator of my own (`aet-lock-shots`, an iPhone 17 Pro on
iOS 26.5), which was created for this and then deleted. The debug build was
started with `-uiScreen heating -noAlarmPrompt YES -uiLanguage en`, and the
cook started.
- **Locking.** `xcrun simctl` has no way to lock a device (its `ui`
  subcommand sets appearance and contrast only). The simulator control tool's
  Lock and Home buttons were not granted, so the Home screen was tried
  instead.
- **The Home screen**, reached by terminating the app: the Dynamic Island
  widened for the activity, but it drew nothing inside. An earlier probe of
  the Lock Screen, in another simulator, found the same thing: the card was
  there, with the stage's icon, and empty. The widget's log shows its batches
  succeeding.
- **Two retakes** a few seconds later, the second after relaunching and
  backgrounding the app, showed no island at all.

So the Live Activity has still not been seen with its words in it, in either
English. It needs a device, or a simulator a person locks by hand (Device >
Lock).

## The blank Live Activity is not the catalogue (28 September 2026)

The Lock Screen card from the last entry drew its flame and no words, and
the island looked empty. The suspect was the widget failing to find
`copy/*.json`, so that `tr()` handed it empty strings. It does not. Checked in
a simulator of my own (`aet-la-probe`, iPhone 17 Pro, iOS 26.5, created for
this and deleted afterwards), with the debug build started by
`-uiScreen heating -noAlarmPrompt YES`:

- **The catalogue is in the extension.** `EggTimerWidget.appex/copy/` holds
  `en.json` and `en-x-1750.json`, from the `../copy` folder that
  `project.yml` gives the widget target.
- **The widget reads it from its own bundle.** A throwaway debug log in the
  widget reported `…/EggTimerWidget.appex/copy/en.json keys=344
  stage=Heating`, and in 1750 `en-x-1750.json keys=343 stage=Upon the fire`.
  `Bundle.main` in an extension is the `.appex`, which is where the files are.
- **`tr()` cannot return an empty string.** A catalogue missing from the
  bundle is a `fatalError` in `Copy.load`, and a key missing from every
  catalogue renders as the key. Neither is blank.
- **The words reach the system.** The widget hands the system a snapshot of
  its views, which the simulator keeps under
  `data/Containers/Data/PluginKitPlugin/*/SystemData/com.apple.chrono/activities/*.activity-archive`.
  `strings` on it shows "Heating", "… yolk 65 °C" and "my guess until you tap
  Full rolling boil", and in 1750 "Upon the fire", "the yolk 65 °C" and "my
  conjecture, till you tap the boil". The words are there, and so is the
  cook's yolk temperature, which decoded without the removed odds.
- **The island draws text.** Five seconds after leaving the app,
  `simctl io screenshot --mask black` shows the flame and a ticking "11:10"
  in the compact island, in both Englishes. A throwaway widget with only
  literal text ("CL", "CT") showed the same. The earlier "empty island" was a
  capture one second after leaving the app, halfway through the animation.
  The default mask also leaves the island's black shape out of the picture.

So the blank card was never our words going missing. The countdown on the
card is `Text(timerInterval:)`, which the system draws and which never goes
through the catalogue, and it was blank too. Whatever emptied that card
happened after our process had done its part: in the system's renderer, or
in the moment the picture was taken. Nothing in the code was changed.

**Not seen:** the Lock Screen card and the expanded island. `simctl` cannot
lock a device or long-press, and the simulator control tool was not granted
this device. The archive shows what they are given to draw. They still need
a person to lock the simulator (Device > Lock) or a phone.

**In passing:** with `-noAlarmPrompt YES` the system still asked "Would Like
to Send You Notifications" as the cook started. `Alarm.authorize` returns
before asking in that case, so something else asks. Not looked into here.

## 28 September 2026: the Lock Screen card, on a phone

The previous entry was wrong about the cause. On the owner's phone the card
was empty (half a flame, half a snowflake) in every stage that counts down,
and drawn in full at "NOW" and "Eat", which do not. `.fixedSize()` on
`Text(timerInterval:)` claimed more width than the card had, and pushed the
words off one edge and the timer off the other. The countdown now takes the
width of the longest string it will show ("0:00", "00:00", "0:00:00"). The
owner's phone shows "COOLING", its line and "0:26" (5e38279).

The same phone showed why the track's colour, the bracket and the play-safe
line came and went: Xcode's Run is a Debug build, and EggTimerCore at
`-Onone` takes 20 s for an odds profile that takes 0.4 s optimised. The
package now builds EggTimerCore with `-O` in Debug too.

From the owner, on the same cook:
- the pull names the cooling chosen: "Straight into the ice bath" / "under
  the cold tap" / "onto the counter", in the alarm and, word for word, on the
  card, whose heading is now "Eggs out" beside the big NOW. In 1750, "Commit
  them at once to the ice" / "to the pump", the owner's clause kept.
- "The carryover is over" was jargon: "The yolk has stopped cooking."
- The card and the alarm said "Done" twice: the card now ends at once when
  the cooling does, and the alarm stays in Notification Centre.
- The alarm arrives on a locked phone with sound, with the ringer on silent.
- The notification showed the first icon (the rainbow egg). The app holds
  only the watercolour one; iOS caches a notification's icon. Deleting the
  app and reinstalling, or restarting the phone, refreshes it.

## 28 September 2026: a tighter egg, both apps

The owner, after using the iOS app on a phone, asked for three changes, made
in both apps (UI.md section 11; the `tighten` draft, LANGUAGE.md section 3):
the peak yolk moves into the doneness slider's heading and the reading line
that repeated the doneness word goes; the play-safe suggestion goes, with
the code that computed it (core's `saferLevels` stays, unused by any
screen); and the setup sentence stays on screen while a cook runs, from the
ticket and with nothing to tap, over "soft · peak yolk 59 °C", replacing
iOS's method line and summary.

**Verified**: `npm test` (243 pass, the one known todo), `npm run validate`
(28/28), `npm run conformance` (fixture regenerated; 105 Swift tests pass);
`copyLiterals.js --since 2c090c9 tighten` shows the 18 drafted keys and
nothing else. The iOS Debug build, and on the iPhone 17 simulator, idle and
heating, in English and in 1750: the heading fits on one line in both
("peak yolk 59 °C"; "the yolk at most 59 °C" beside "Degree of hardness"),
and the heating screen shows the sentence, its line, the hint, Full rolling
boil, Cancel and the probe offer without scrolling. The web at 375 px on a
private port: idle, cooking, and a reload mid-cook, which brought the
sentence and its line back from the stored ticket; the slider's
`aria-valuetext` read "Runny, peak yolk 56 °C".

**A decision of my own**: the sentence goes straight under the time card in
both apps, not where iOS's summary was (under Cancel). There the probe
offer came between it and the time, and at Done the two questions put it
far down the page (reasoned from the layout, not screenshotted); the web has no such place, its action bar being stuck to
the bottom.

**Not verified**: VoiceOver on a device reading the slider's new value; the
web's sentence at Done on a phone.

**In passing**: the simulator had a stale cold start from an earlier session
(26 minutes heating) that the app restored on launch; it was cancelled
before the screenshots.

## 28 September 2026: the plans reconciled with the code

Every checklist item, open question and "next" step in `PLAN.md`, `UI.md`,
`LANGUAGE.md`, `INFERENCE.md`, both READMEs and `ios/RELEASING.md` was read
against the code at `50aaa16` and the git log, ahead of an adversarial QA
pass. `PLAN.md` now opens with where things stand and what is next, and
lists the loose ends found. No code changed.

- **Run:** `npm test`, 244 tests: 243 pass, 1 todo (5b). `swift test` in
  `ios/EggTimerCore`, 105 tests in 29 suites, all pass. `origin/main` is
  `2f341b4` (19 September), 191 commits behind local `main`.
- **A claim that was never true:** four documents said `oddsTenths` and
  `stillLearning` are recorded with every egg. `EggRecord` in
  `src/core/record.ts` has no field for either; they live on the running
  cook's ticket, and nothing reads them there.
- **The 90 g cap has a hole on the web.** The girth and width limits were
  not narrowed with the mass, and the web stores its egg as a width, so a
  width or girth typed in, or a stored 120 g egg, gets past 90 g. Read in
  the code, not run.
- **Retired and still described:** playing safe, the odds line, "still
  learning" and the odds on the Lock Screen were written up as live in
  places; the pull alarm naming the cooling (`2c090c9`) had no entry in
  `LANGUAGE.md`; `ios/README.md`'s port table stopped at `sousvide.ts`.

## 28 September 2026: the loose ends, tied

The owner approved a pass of the easy loose ends in `PLAN.md` before the
adversarial QA. On `5d71a3c`.

- **The ticket's odds are gone.** `oddsTenths` and `stillLearning` came off
  both apps' tickets. A saved cook that still carries them restores: the
  web's `restoreTicket` reads only the fields it names, and iOS's
  synthesized decoder ignores keys it does not know. The `Decision` keeps
  both (the reach, the advice and `tools/decide.ts` read them).
- **The owner's decision 12** (`INFERENCE.md` §11): calibration is checked
  with proper scoring rules - the log score first, the ranked probability
  score reported, CRPS or log density for probe readings, reliability
  diagrams and randomised PIT histograms for display - and E6 stores each
  egg's full forecast at "Eggs in" and a model version. Written into §6, §7
  and §9 and pointed to from PLAN's E6 and E7. Nothing built.
- **The 90 g cap is soft, by the owner's word.** "The 90 g cap doesn't need
  to be hard; if the user gets to a weird place by dragging some slider,
  that's on them." So the girth and width limits stay wide. For the record,
  `0e0ec98`'s message ("A stored mass above the cap comes back as 90 g")
  overstates the web: a web egg entered by width or girth, or stored as a
  minor diameter (`customMinor_mm`), can exceed 90 g. Accepted.
  `tools/unitsFixture.ts` now round-trips 90 g, not 120; `fixtures/units.json`
  regenerated.
- **`-noAlarmPrompt YES` did not reproduce.** On the iPhone 17 simulator
  (`AEF03BE2`, iOS 27.0) the app was uninstalled and reinstalled - the
  simulator then had no notification settings for it - and launched with
  `-noAlarmPrompt YES -uiScreen heating`, and again with `-uiLanguage en`
  added, as the earlier entry had it. The cook started, `Activity.request`
  ran (`liveactivitiesd` logged the activity, with "Authorization options
  type: First Permission", and the Dynamic Island showed it), and no alert
  appeared: screenshots at 5 and 10 s, and after a terminate and relaunch
  that restored the cook. The only sign of asking was SpringBoard's own
  "Allow Live Activities from Actual Egg Timer?" in Notification Centre,
  which is not an alert. The earlier sighting was on a fresh iOS 26.5
  simulator; `Activity.request` there is still the likely asker, but that
  is untested, and no runtime but this one was used. No fix: skipping the
  Live Activity under the flag would hide the card the flag's screenshots
  are often for.
- **The pull line is tested.** `pullLineKey(cooling:)` moved from
  `CookActivity` into EggTimerCopy (`PullLine.swift`), called by `Alarm` and
  the widget; `PullLineTests` holds ice, tap, counter and nil to
  `alarm.pull.bodyIce`/`Tap`/`Counter`/`Ice`, and each key to both
  catalogues' own messages.
- **Dead code and words.** `Kitchen.cookTime` (no caller) went, its comment
  onto `cookResult`. `readout.phase.cooling` went: only a counter rest named
  it, and a counter rest has no cooling deadline. The card's done state:
  `LiveActivity.finish` now ends on the content last shown (`end(nil,
  .immediate)`) instead of pushing a done state it dismisses at once, so
  `activity.stage.done`, `activity.note.done` and `activity.eat` could go.
  **A decision of my own:** `CookActivity.Stage.done` stays, because a card
  an older build ended as done (with its old two-minute dismissal) could be
  drawn by the new widget across an update; it draws as the app's "Done"
  (`readout.phase.done`, the same words in both Englishes) with no note and
  no big word.
- **The units' (i)** now says switching "changes how I write the numbers,
  and may change my words too"; 1750, "and may alter my words besides". The
  old 1750 line, "and, from the imperial, the stile of my English", also
  said too much, since a 1750 chosen in the picker stays when the units go
  back to metric. The `loose` draft (base `5d71a3c`) lists these and the
  four retired keys; `copyLiterals.js --since 5d71a3c loose` shows the six
  and nothing else.
- **Stale comments** fixed in `Package.swift`, `CookActivity.swift`,
  `decide.ts`, `outcome.ts`, `reach.ts`, `Decide.swift`, the privacy
  manifest, and the "kept with every egg" notes in `app.ts` and
  `ContentView.swift`.

**Run:** `npm test`, 244 tests: 243 pass, 1 todo. `npm run validate` 28/28.
`npm run conformance` and `swift test`: 107 tests in 30 suites pass. The app
builds for the iPhone 17 simulator.

**Not verified:** nothing was tapped; the Lock Screen card was not looked at
after the done-state change, and an older build's done card was not tried.

## 28 September 2026: the worklist, stage 1 - bugs, the gate, dead code

WORKLIST.md sections 2, 7.1-7.3 and 4, on a branch from `048d18e`; each item
there is ticked with its commit.

- **Owner, 28 Sep: no post-19-Sep build shipped; all interim back-compat
  removed (D1).** The web cook moves to `aet.cook.v2` and drops the live
  site's `aet.cook.v1` on load; a stored ticket or machine is whole or
  refused. The web calibration deletes `aet.calibration.v3` unread beside v2
  and v1. Both cores lose E1's `'set'` white and the record's `whiteOffered`,
  which had been true on every record since E2 (the schema stays `v: 1`: no
  record had left the owner's devices). iOS: required ticket fields and a
  synthesized decoder, no settings downgrade writes or migrations, the
  calibration reads v4 alone, and the Live Activity has no done stage.
- **Owner, 28 Sep: `saferLevels` and everything serving it deleted (D2)**,
  in both cores, with its fixture, tests and `npm run decide -- safer`.
  `npm test` falls from about 35 s to 18 s.
- **Owner, 28 Sep: `Decision` drops `interval`, `stillLearning` and `loss`
  (D3).** The +-15 s rule is computed on demand from `predictCookTime` where
  it is still measured (test 5b, `npm run decide -- learning`).
- **Owner, 28 Sep: the Swift core drops the API no app calls (D4).** The
  scenarios' egg is now built from its mass on both sides; TypeScript keeps
  the lot, and `predictOutcome` calls the answer probabilities
  (`outcome.json` byte-identical).
- **Bugs:** iOS records Custom as custom, and Weighed goes back to the last
  weighed mass across a relaunch (D6); a web build that throws rejects and
  is forgotten; a running web cook reads its ticket, not live settings; a
  word set mid-sentence loses only its first capital (`midSentence`, both
  apps); copy-snapshot boots on `#donenessPeak` (172 states in 64 s); a
  cleared measurement box measures nothing; routing runs once; iOS Live
  Activity calls are serialised and a cancel is not undone.
- **The gate:** `npm run verify` (check, test, the Swift copy lint,
  `fixtures:check`, swift test), a macOS workflow that runs it, and
  `conformance` failing on stale fixtures. `tsconfig.core.json` keeps DOM and
  Node out of core; NodeNext and the free strictness flags are on.
- **Decisions of my own:** `whiteOffered` removed rather than required true;
  a restored web cook with an unreadable ticket is dropped, so a running cook
  always has one; `LiveActivity.finish` merged into `endAll`; the
  copyLiterals lint needed about a hundred non-word literals classified on
  `NOT_COPY` to pass, since nothing had run it. No copy key was retired or
  reworded, so no draft was added (`copyLiterals --since 048d18e` shows only
  the `units` draft's two rows, as before).

**Run:** `npm test`, 235 tests: 234 pass, 1 todo. `npm run validate` 28/28.
`npm run conformance` and `swift test`: 99 tests in 29 suites. `npm run
copy:literals` passes. The app builds for, and launches on, the iPhone 17
simulator; a cook starts. In the browser (port 8094): a restored cook keeps
its own pot after another tab's settings change, a cleared mass box leaves
the egg, one route per Back, and the Imperial switch still moves an English
page into 1750.

**Not verified:** Weighed's go-back on a phone; a Live Activity cancelled
mid-start; the macOS workflow, which has not run since nothing is pushed.

## 29 September 2026: the worklist, stage 2 - conformance, false comments and docs, structure, tests

WORKLIST.md sections 3, 5, 6, 7.4-7.13 and 8.2-8.3, on a branch from
`72f447c`: a lead and four helpers in parallel, merged in turn. Each item
there is ticked with its commit.

- **Conformance (section 3).** What both apps decide above the physics is
  core's and fixtured: the solve-refuse-snap rule (`answerAt`), which key
  each part of the screen says (`wording.ts`), the slow hob's constants, the
  pull, the texture edges and the shading threshold. iOS lost `Cook.Phase`,
  `Forecast` and `Direction.swift` to core's `Phase` and `Outcome`, and now
  checks the record's version, prior and kernel discount.
- **Structure (section 5).** The web's `app.ts` split into a dozen modules
  that import in node, with `render()` in two, one feedback state and one
  `retime`. iOS's ContentView and Kitchen split, the Kitchen became the
  Planner and `Settings` the SettingsStore, the idle screen stops redrawing
  every second, and EggTimerRing folded into the core. `tools/fixtures.ts`
  became one module per output, `tools/copyDraft.ts` one file per draft
  (with `draftFor` throwing), and `tools/common.ts` holds the helpers the
  tools and tests had copied. Both cores lost their copied helpers
  (`logYolkTarget`, `coolingMedium_C`, `normalCdf`, `withUnrelated`, one
  bisection, `isUS`), the grid request moved to `doseGrid`, and the
  sous-vide clock's units moved out of the physics into `wording`.
- **Owner, 28 Sep: "kitchen" is "settings" (D7).** The web page is
  `#settings`, and `#kitchen` still opens it. `controls.then.*` and
  `controls.afterBoil.*` are `controls.cooling.*` and
  `controls.afterTheBoil.*`, word for word, proved as the `settings` draft
  on `72f447c`.
- **Tests and fixtures (section 6).** The Swift fixture helpers throw, so a
  missing key fails one test, not the run, and an empty list fails. The
  fixtures fell from 70k lines to 45k: `copy.json` renders only keys with
  arguments, counts or a fallback, so a wording edit no longer rewrites it,
  each particle is one line, and a repeated particle set is a `sameAs`
  that `Fixtures.load` resolves.
- **Hygiene (section 7).** Security headers, clean builds, the missing
  scripts, per-scheme theme colours and a maskable icon, one version held
  by a test, the project's own `.gitignore`, and the surfaces and the 1750
  spelling table out of `copy/`, so they no longer ship.
- **Decisions of my own:** the web keeps its last pan start in memory, so
  another tab's change of it is no longer picked up (nothing else on the
  page reads another tab's settings); decide's white sum keeps its
  one-step arithmetic, since `withUnrelated` twice moved `reach.json` in the
  last digit; `#kitchen` is rewritten to `#settings` in place; section 6.5
  was moot and 7.13 (a formatter) is left for after the comment sweep.

**Run:** `npm run verify`: 255 tests, all pass; the Swift copy lint; the
fixtures unchanged; `swift test` 119 tests in 31 suites. `npm run
validate` 28/28. `copyLiterals --since 72f447c` shows the ten drafted rows
and nothing else. The app builds for, and launches on, the iPhone 17
simulator, and a cook starts. The built site on port 8096: idle, a started
cook, Settings at `#settings` and at `#kitchen` (which becomes
`#settings`), and Help, with no console errors.

**Not verified:** anything on a phone; the web in a second tab changing the
pan start mid-sous-vide.

### Moved from PLAN.md: the planning phase's constants and targets

Retired from PLAN (WORKLIST §8.3): README §6 owns the constants and
`npm run validate` the targets. Kept here as they stood; `TAU_REF` is not a
constant in the code, the 2000 m target became 8.21 min, and the hob table's
numbers are validate's older ones.

#### Calibration constants and provenance

| constant | value | units | source / confidence |
|---|---|---|---|
| `TAU_REF` | 3354 | s | R²/α for a 57 g egg. **The single calibration knob.** ∝ M^(2/3). Medium confidence — reproduces kitchen practice. |
| `ALPHA` | 1.70e−7 | m²/s | albumen at cooking temperature. Low-T literature values (1.36e−7) are inconsistent with reported α; water's k rises ~13% by 100 °C. |
| `YOLK_RADIUS_FRAC` | 0.693 | — | yolk = 33% of volume. High confidence: three independent routes agree. |
| `Z_YOLK` / `TREF_YOLK` | 4.65 / 63 | K / °C | from Eₐ ≈ 470 kJ/mol (Vega & Mercadé-Prieto 2011). Since checked at source: Eₐ = 469 ± 13 kJ/mol, measured 54-70 °C. |
| `Z_WHITE` / `TREF_WHITE` | ~~5.2~~ **4.97** / 80 | K / °C | ovalbumin. Planned with Eₐ ≈ 460 kJ/mol; Weijers et al. (2003) report ≈ 480, so the constant was corrected. |
| `H_EFF` | 850 | W/m²K | convection + shell + membranes in series. Estimated, not measured. |
| `RAMP_R` | 3.0 | — | hob overshoot ratio; 1/r = fraction of full power to hold a boil. |
| `TAU_AIR` | 2030 | s | lumped cooling time constant in still air. **Least-verified constant in the model.** |
| `TAU_PLUNGE` | 4 | s | surface equilibration on entering a cooling bath. Physical (finite Bi, finite handling time) *and* a necessary numerical regulariser — see below. |
| `WHITE_DOSE_TARGET` | 0.05 | min-eq @80C | calibrated so the shortest white-setting cook is ~5.9 min for a fridge-cold large egg, peak inner white ~75 C: set but tender. |
| `YOLK_DOSE_RUNNY` / `_HARD` | 0.05 / 2000 | min-eq @63C | slider endpoints. Log-interpolating dose is equivalent to linearly interpolating peak yolk temperature, so the slider spans ~56–77 C evenly. |

⚠️ **Superseded — kept as a record of the planning phase.** At planning time the
primary sources were not fetched, so these were re-derived and cross-validated rather
than transcribed. Three independent checks passed: Williams' published 0.451 prefactor,
his published 4.5-min worked example, and two independent series solutions agreeing to
5 decimal places.

The sources have since been read at first hand — most of them are freely available —
and the derivations held up, with one constant corrected (`Z_WHITE`) and one known to be
high (`H_EFF`). See `references.bib`, README §10 for what each source says, and §11 for
what is still open. The model is now also checked against two published measurements it
did not choose: see README §7.

#### Validation targets

The model must reproduce these (verified during planning, large egg unless stated):

| scenario | expected |
|---|---|
| 57 g, 4 °C, T_yolk 63 °C via Williams' closed form | 4.53 min (he published ~4.5) |
| fridge 4 °C, sea level, jammy, ice bath | 7.4 min |
| room 21 °C, sea level, jammy, ice bath | 6.3 min |
| fridge, 2000 m, jammy | 9.2 min |
| eigenfunction vs erfc series at Fo = 0.0688, x = 0.693 | both 0.41094 |
| one-term truncation error | under-predicts 8.4% |
| `T_b(h)` vs `100 − h/300`, 0–5000 m | within 0.03 °C |

Cold start, jammy, ice bath — **minutes after boiling depends on hob power**:

| time-to-boil | total | after boil |
|---|---|---|
| 4 min | 9.2 | 5.2 |
| 8 min | 11.2 | 3.2 |
| 12 min | 13.2 | 1.2 |

Carryover — identical 7.4-min cook, varying only the cooling step. Yolk centre is
48.5 °C at pull in all three cases (same cook ⇒ same state), and they diverge after:

| cooling | peak yolk | rise after pull |
|---|---|---|
| ice bath | 65.0 °C | +16.5 |
| cold tap | 65.6 °C | +17.0 |
| counter | 76.3 °C | +27.8 |

⇒ soft doneness is **unreachable** with counter cooling; the slider constrains to it.

⚠️ **Correction to the planning estimate.** Planning predicted 64.9 / 65.4 / 85.3 °C.
The counter figure was wrong: that model relaxed the surface from the *water*
temperature, when a lumped egg in air relaxes from its own *volume-average*
temperature. Corrected in `coolingTemperature`. The effect is real and still
decisive (jammy vs fully set) but smaller than first computed.


## 29 September 2026: the worklist's copy - the `tidy` draft

WORKLIST.md section 9 as one named draft, `tidy`, on `bfc070d`, in both
apps with each 1750 twin rewritten: 67 keys, one retired
(`controls.size.weighed` into `controls.size.measured`, "Measured —
{mass}", so the web's option now shows the egg's mass). LANGUAGE.md §3 has
the table; the owner reads it on a phone and says what to put back.

- **The false ones went first** (eb1fddf). Checked by running the model:
  at 58 °C the white sets after 22.25 h of hold (22.7 h in all), so the
  warning says "most of a day, if it sets at all". Help says "hours, even
  days", since just under 60 °C it is 9.7 h and at 55 °C 89 h. Whichever
  of yolk and white binds, the other has already passed its target, so
  `yolkBound`'s "white still not" was as false as `whiteBound`'s.
- **Found by looking, not by reading:** the iPhone 17 set the new
  `outcome.unsure` with "I" alone at a line's end; a no-break space holds
  "I can't" together. Nothing else wrapped badly on the main screen,
  Settings, Help or a running cook.
- **What the proofs cannot see:** `copySnapshot compare --draft` fails
  only on Help's two linked asides, whose words a link splits into pieces
  no template matches.

## 29 September 2026: the worklist, 8.1 - the comment sweep

WORKLIST.md section 8.1, on a branch from `bfc070d`. Comments only, in 94
files across both cores, both apps, the tests and the tools: the plan-phase
labels (E1-E8, F1-F6, "Phase C"), "this used to" stories, dated owner stamps
and the Kitchen.swift / app.ts history are gone. Where the old way is the
reason for the new one - a fixed resample jitter, the pan constant from the
time to boil, solving at the posterior mean - it stays, as a "why not" in
the present tense. Dates on measurements in the tests stay: they say when a
number was taken.

- **False comments fixed on the way.** Planner and ReadoutView said the
  decision still works out "still learning" (not since D3). decideOdds
  quoted the 3.8% calibration error from before the resample kernel;
  INFERENCE.md's 2.2% is the current one. Two fixture headers described a
  two-level "set" white neither sequence has. Units.swift waited for F4,
  which is done. Pointers to `src/ui/outcome.ts` (now only the restore),
  `startFrom_C`, `whiteNoise` and `setupOf` name what is there now.
- **The catalogue.** One note, on `controls.afterTheBoil.more`: it named
  `controls.afterBoil.hint` and iOS's `explainHeatOff` / `explainHold`,
  none of which exist. No text field touched.
- **Dead code.** Nine `NOT_COPY` entries in `tools/copyLiterals.ts`
  matched no Swift literal any more; they went, and the lint still passes.
- **Left alone:** names that carry history (`forecast`, `shownForecast`,
  test names quoting "the old band" and "7/10", the 'E3' / 'E5' sequence
  labels in decide.test.ts, fixture `why` strings, which are data), and
  `tools/drafts/`, which is a record of each draft by design.

**Run:** `npm run verify`: 255 tests, all pass; the Swift copy lint; the
fixtures unchanged; `swift test` 119 tests in 31 suites. The app builds for
the iPhone 17 simulator.

**Not verified:** nothing runs differently, so nothing was run on a device.

## 29 September 2026: the worklist, 8.4 - the documents restructured

WORKLIST.md section 8.4, on a branch from `632bdbd`. Each document now owns
one thing: `CLAUDE.md` the rules for whoever works here, `PLAN.md` the state
and what waits on whom, `DECISIONS.md` the owner's decisions, `UI.md` the
layout as built, `LANGUAGE.md` the words' machinery and rules, `INFERENCE.md`
the learning, `README.md` the science, `ios/README.md` the port, and this file
the record. What left the others is below, told once; the documents as they
stood before are in git at `632bdbd`, which is where an older entry's section
number points.

### Moved from UI.md

UI.md was a design followed by four "as built" sections, each correcting the
last. It is now one current spec. What it no longer carries:

- **The design as first drawn** (27 September): the idle screen was to keep
  the odds line ("7/10 eggs hit the mark") and its (i) under the time; the
  running phases a method line; the language picker "once there is more than
  one". As built, a sentence saying which way the egg is likely to miss took
  the odds line's place, the picker came with F6, and a running cook shows
  its setup sentence.
- **What it retired** (the old section 5): the short-string approvals then
  open in LANGUAGE.md section 3 - the four over-budget rows could keep a
  short label and move their meaning into `.more`, and the one-wording
  proposal shrank because a shared layout made most of its pairs vanish.
- **The passes, and their drafts:**

| pass | date | draft, on | code |
|---|---|---|---|
| web redesign | 27 Sep | `redesign`, `80799d0` | `index.html`, `styles.css`, `src/ui/app.ts` (since split under `src/ui/`) |
| web outcome summary | 27 Sep | `outcome`, `7a40373` | `src/ui/outcome.ts` (since core's `directionKey`) |
| web playing safe | 27 Sep | `safe`, `ff6c6e9` | removed 28 Sep |
| iOS pass A, layout | 28 Sep | `iosA`, `91d5fff` | `ContentView`, `SetupSentence`, `SettingsView`, `HelpView`, `Info`, `Controls`, `Palette` |
| iOS pass B, prediction | 28 Sep | `iosB`, `44b0cb1` | `Direction.swift` (gone 29 Sep for core's `Outcome`), `YolkSlider`, `OddsTrack`, `Cook` |
| a tighter egg, both | 28 Sep | `tighten`, `2c090c9` | heading, sentence while cooking, no play-safe line |

- **Keys retired by the passes** (each was one app's alone, so each was
  deleted from the catalogue):
  - from the web by the redesign: `controls.atTheBoil`, `controls.eggs`,
    `controls.start.hint`, `controls.afterBoil.hint`;
  - from iOS by pass A: `readout.phase.totalLidOn`, `readout.sub.idleCold`,
    `.idleHot`, `readout.stat.peakYolk`, `.peakWhite`, `.afterBoil`, `.bath`,
    `action.eggsInHeatOn`, `controls.eggFrom.fridgeAt`, `.roomAt`,
    `controls.start.hintSousVide`, `controls.then`,
    `controls.afterBoil.explainHeatOff`, `.explainHold`, `controls.probe`,
    `controls.probe.hint`, `pan.waterBoilsAt`, `pan.timeToBoil`, `.assumed`,
    `pan.measured`, `pan.unmeasured`, `odds.shown`, `odds.hidden`,
    `learned.forgetExplain`, `colophon.ios`;
  - from iOS by pass B: `odds.info`, `odds.why`, `odds.stillLearning`,
    `readout.phase.heatingTap`, `readout.sub.heatingEstimate`,
    `readout.sub.done`, `readout.big.now`, `readout.big.eat`;
  - by a tighter egg: `outcome.safe.firm`, `.soft`, `.firmer`, `.softer`,
    `cook.method` and its five fragments.
- **"Kept, and why"** listed `odds.hitTheMark` (retired with F6's Lock
  Screen), `readout.phase.cooling` (retired 28 September) and `cook.method`
  (retired by a tighter egg). Nothing on it survives.
- **Departures from the design, as built on the web**: heat after the boil
  stayed in Settings and not in the sentence; mute went to the top of every
  screen and the Settings and Help links to the top of the egg, out of the
  thumb's way; the page's title became "Settings", since "Pan, hob and
  altitude" named the pan as a stand-in for the stove; and one more (i)
  than listed, for the boil time under the readout.
- **Checked for a tighter egg**: `npm test`, `npm run validate`, `npm run
  conformance`, the iOS Debug build, iPhone 17 screenshots idle and heating
  in English and 1750 (the 1750 heading fits one line at 402 pt), and the web
  at 375 px idle, cooking and after a reload mid-cook, with the slider's
  `aria-valuetext` read back ("Runny, peak yolk 56 °C").

### Moved from LANGUAGE.md

LANGUAGE.md section 3 was every wording draft's table, one after another,
about 600 lines and 75 references to keys that no longer exist, followed by
"one wording per meaning", a proposal the redesign overtook. The drafts
themselves are `tools/drafts/*.ts`, each with its base commit, and every
row's before and after; section 3 is now the rules they were held to, and
the one draft under review. Section 8, the decisions, is in `DECISIONS.md`
(12-17, 22-23). What went, as an index:

| draft | base | keys | what |
|---|---|---|---|
| `feedback` | `cfe38e9` | 19 | E2's questions and answers, both apps alike; approved on the owner's behalf while they were away |
| `rest` | `e1f7068` | 37 | the rest of F2 and the first person, approved by the owner; five rows held back (four over budget, one untrue) |
| `reach` | `1667dcf` | 11 | the odds-shaded slider's refusals and advice |
| `redesign` | `80799d0` | 109 | the web's sentence, (i)s, Settings and Help, with the owner's wording rules |
| `outcome` | `7a40373` | 12 | which way a miss goes, in place of "7/10 eggs hit the mark" |
| `boil`, `counter`, `help`, `history` | `e29887c`, `4817303`, `9116d33`, `cc0dc47` | 49 | the start clause carries the boil; iOS's pull on a counter rest; Help as a gist then an aside; the remembered boil "based on history" |
| `safe`, `oddsHelp` | `ff6c6e9`, `91d5fff` | 17 | playing safe, and Help's "How sure I am" brought up to it |
| `period`, `period_ios` | `05d466b`, `394f74d` | 10 | F6's new modern English: the picker, the line under Imperial, the title's twin; the Lock Screen's odds retired |
| `iosA`, `iosB` | `91d5fff`, `44b0cb1` | 166 | which app says what; no wording changed |
| `pull`, `tighten` | `5e38279`, `2c090c9` | 25 | the pull names the cooling; the heading's peak yolk, the running sentence |
| `loose`, `units` | `5d71a3c`, `055bd4e` | 8 | the units' (i), and four dead strings |
| `settings` | `72f447c` | 2 | "kitchen" becomes "settings", word for word |
| `tidy` | `bfc070d` | 67 | WORKLIST section 9, under the owner's review |

Things section 3 said that are worth one line each:

- **The held-back rows** of `rest` all went in later: `alarm.cooled.body`
  once F6 raised the notification body's budget to 110,
  `readout.sub.coldAssumes` as "about {boil} to boil, based on history" in
  the redesign, and `feedback.thanks`, `learned.forget` and
  `learned.confirm.title` in `tidy`. The untrue one was untrue because
  `{boil}` is a blend of every boil at that volume, or another volume's
  scaled, never "last time".
- **The E4 probe offer's one departure** from the owner's draft: "lowest"
  became "highest", because at the moment the reading is taken the middle of
  the egg is its warmest point (`INFERENCE.md` §5).
- **No Skip button**: every answer folds when tapped, and an unanswered
  question is recorded as skipped when the next cook starts.
- **The one-wording guard test was never built.** It would have given each
  surface a platform in `test/data/surfaces.json` and made any key used by
  one app on a shared surface carry a `why`. The redesign merged most pairs,
  so what it would guard is small; `test/copy.test.ts` 6a still checks each
  key's `apps` against the code.

### The units' (i), 28 September (`31a1ee1`, which had no entry)

On the owner's word, the units' (i) (`controls.units.more`, `.more.ios`) now
says only where the first choice came from: "I start with what's usual where
your browser says you are" (or "your phone"). The `loose` draft had just made
it say that switching may change the words too, which was true on an English
page; the owner found both sentences over-explaining, since the cook sees
the numbers, and on an English page the words, change as they switch. Proved
as the `units` draft on `055bd4e`: two keys, their 1750 twins, and nothing
else.

### Moved from PLAN.md: what each phase measured

PLAN.md carried a checklist per phase, and under each ticked item what was
measured when it was done; some of those numbers were nowhere else, and
earlier entries here point to them ("measurements in `PLAN.md` (E5)"). They
are below, as PLAN had them, less the plan each item was ticked against
(the design is `INFERENCE.md` and `LANGUAGE.md`) and less the retirement
stories this file already tells: for the odds line, "7/10" and "still
learning" see 27 September ("Which way a miss goes" and "The outcome summary
on the web") and 28 September ("iOS follows the web's prediction, pass B",
"the loose ends, tied"); for playing safe, 27 and 28 September ("Playing
safe", "a tighter egg"). The frozen API listing went too, replaced by the
module table in `ios/README.md`; git has it at `632bdbd`. The phases' order
and state are now one table in PLAN.md.

#### Phase C, calibration (September 2026)

Measured: grid build 1.76 s (21x36), interpolation error 1.7% in dose, posterior
update 0.1-1.6 ms. Injected alpha = 1.535e-7 with taste offset 0.20 recovered in
**3 eggs**; converged cook time 8.52 min vs true optimum 8.29 min (14 s error);
relative sd plateaus at 3.1%, the ordinal-feedback identifiability floor.
Recovered alpha is 4.5% off in isolation because alpha and the taste offset are
confounded at fixed protocol - the combination is identified, the parts are not.
That is the documented behaviour, not a defect.

Also added: early termination in `simulate()` once the egg is past peak and the
dose rate is 1e-6 of peak. Cut simulate 2.80 -> 1.87 ms with identical results.

#### Phase D, the iOS app

The SwiftUI layer takes the BEHAVIOUR of `src/ui/machine.ts` and leaves its
mechanism. `clock.ts` in particular exists to fight the backgrounding problem
that a local notification solves properly, and has no counterpart here.

#### E1, the record (26 September)

Measured: rebuilt from base + log, **0 of 4000 numbers differ** from the
posterior built egg by egg - in `npm test` through the web app's own
storage with a reload between every egg, in `swift test` through
JSONEncoder, in Chromium, and in the iOS simulator after deleting the
stored posterior. A web fold now builds its surface in a Web Worker: the
page's longest stall during one was 11 ms, against 579 ms for the same
build on the main thread, and a twelve-egg replay (eight surfaces, 24 s)
never stalled it past 33 ms. The owner's v2 posterior migrates as a frozen
base and is dropped at E2 (§4 says why). The iOS app has no action out of
PULL, so every iOS pull is recorded as assumed until it grows a button.
E1 does not change the likelihood: it is still scored at the scheduled
time, and `pulled_s` waits for E2.

#### E2, the ordered probit (27 September)

DONE 27 September. Noise scale lognormal, median 0.20 decades (the probit
gives "just right" 0.81 at the band's centre and 0.093 one band-width out,
where the old likelihood gave 0.8 and 0.1), 5% unrelated answers,
tender | firm 1.08 decades above runny | tender. Measured
(`test/infer.test.ts`): **recovery** within 15 s from egg 2, settled
12.2 s short, against the old likelihood's egg 3 and 14.0 s long;
**calibration** of P(answer) on 200 simulated cooks, expected
calibration error 1.4% on the yolk and 1.8% on the white. Both apps
replay E1's log from the prior into a v4 store and drop the v2 base; in
Chromium a posterior deleted and rebuilt from a five-egg log came back
string-identical, with the answers given yolk-only, white-only and white
then yolk, and on the iOS simulator E1's log replayed to the same white
offset as the TypeScript to 5e-16, across a kill mid-fold. Both
questions are always on screen and neither is required; the second
answer folds the egg again from the posterior before it. The wording is
LANGUAGE.md §3's draft, and `copyLiterals.js --since cfe38e9` and
`copySnapshot.js compare --draft` show that nothing else changed. NOT
verified: nothing on iOS was tapped (no simulator permission), so the
pull button and the two questions there rest on the build and the code.

#### E3, the white offset (27 September)

BUILT 27 September, with E2, and the done-when is HALF met. Two runny
whites at soft move the next soft time later (+85 s with the white alone,
+21 s with the yolk also "just right", and soft becomes bound by the
white). But jammy moves as far (+94 s, +23 s). A runny white is also a
slow time-scale, and `alpha`'s prior (11.9%, 0.70 decades of white dose)
is wider than the white offset's 0.5, so the posterior blames the
time-scale about 2:1; wider white-offset priors (0.8, 1.2) overshoot
instead. `test/infer.test.ts` 5b holds the unmet half as it stands.
The candidates were E4 or E7 pinning the time-scale, E5 recommending
from the posterior rather than its mean, or a different prior -
INFERENCE.md §3 has the numbers. **The owner's answer (27 September):
leave it as it is** until a probe or pooling pins the time-scale. E4
and E5 are built since, and with a yolk answer beside the two runny
whites E5 gives the asked-for shape (soft +146 s, jammy +17 s); the
white alone still moves both. Left open on purpose; 5b pins the limit.

#### E4, the thermometer (27 September)

DONE 27 September, with two departures from the spec, both on the
physics. **The skew is COLD and the cook is asked for the HIGHEST
number.** At the moment the centre peaks it is the warmest point in the
egg, in space and in time (`npm run probe` now prints the field there:
58.8 C at the centre, 55.7 at 0.4 R; 58.2 C 30 s early, 58.3 C 30 s
late), so a probe off-centre, late, or still climbing reads LOW; "hot"
was true only at the pull. The likelihood is an exponentially modified
Gaussian: thermometer sd 1.0 C plus a one-sided handling error, mean
0.4 C, total sd 1.08 C, with 2% of readings unrelated (uniform over
60 C). **Measured** (`test/probe.test.ts`, default egg, jammy, ice,
1000 particles, the app's own grid): one reading at -1 / 0 / +1 C
takes the time-scale sd from the prior's 12.5% to 2.74 / 2.74 / 2.79%
in the weights, which meets the criterion; the filter then resamples,
and its fixed 2% jitter on alpha leaves 3.28 / 3.33 / 3.52% in the
stored posterior. That jitter is the floor on any one fold and is not
E4's to change. (E5 changed it: the resample now keeps the
posterior's spread, and the stored sd is 2.60 / 2.61 / 2.81%.) With the sketched 1.5 C Gaussian the weights would hold
about 3.7%. **Direction**: +1 C shortens the next jammy cook 464.0 ->
449.1 s, -1 C lengthens it to 469.2 s, and a kitchen 10% fast is found
at x1.10 (+-0.04) from one reading. The grid carries `peakYolk_C` per
cell in both cores (interpolated to 0.1 C); the record's `probe` is
`{ centre_C, after_s }`, rounded to 0.01 C; a reading colder than the
coldest thing the egg touched or hotter than the boil is refused by the
loader, and one outside three prior sds of the time-scale +-3 C
(`plausibleProbeRange_C`, 47.6-81.7 C for that egg) is refused at
entry. `fixtures/probe.json` holds Swift to it. **The flow**: "I have a
probe thermometer", off by default, offered once while a cook runs,
then a setting; the cooling alarm (iOS: its notification) asks for the
reading; entry in the cook's units. In Chromium, a cook was driven with
the setting taken from the offer, a reading of 46.7 C refused, 65.7 C
folded, then a yolk answer folded into the same egg, and a second cook
in Imperial with 147.2 F folded as 64 C; both times the stored
posterior was string-identical to `replay` of the log. NOT verified:
nothing on iOS was tapped (the screens were seeded and screenshotted),
and no real egg has been probed.

#### The cooling countdown from the yolk's peak (27 September, with E4)

**Old item 4, the cooling countdown from `peakYolkTime_s`.** DONE
27 September with E4: the countdown runs from the pull to the yolk's
peak for the cook as solved, re-solved at the boil
(`coolingSecondsFor`), floor 60 s, and the old flat 180 s where the
centre peaked before the pull (a heat-off pan that ran out). Measured
moves against 180 s, hot start, 1.5 L, two eggs: 68 g in ice 191 / 183 /
158 s at soft / jammy / hard (+11 / +3 / -22); 53 g in ice 162 / 155 /
134 (-18 / -25 / -46); 78 g under a tap 224 / 213 / 182 (+44 / +33 /
+2); a tap adds 8-13 s over ice for the same egg. Over sizes 53-78 g,
both coolings, hot and cold starts, -46 to +56 s. The
cooking time and the peak are unchanged; only when "Done" rings moves.

#### The odds-shaded slider, reachability and protocol advice (27 September)

**The odds-shaded slider, reachability from the odds, and two inline
disclosures**. DONE 27
September, in both apps. `src/core/reach.ts`, held to
`EggTimerCore/Reach.swift` by `fixtures/reach.json`.
- *The odds per level* are exactly the odds the app shows when the
  slider sits there: the mean solve at that level, decided on the pot's
  decision surface. Points at the two physical edges and every 0.05
  between (21 across a full track), plus a bisection on the slider's
  own 0.01 grid at each end of the range that reaches 3/10, so the end
  the slider snaps to was computed, not interpolated: 20-24 points on a
  boiling pot. Cost in node (`npm run decide -- reach`): 0.45-1.0 s a
  profile against a 0.4-0.8 s surface; 0.1-0.6 s with the heat off or
  on the counter. The web app computes it in the grid worker after the
  surface (in the desktop app's browser pane both ran about 4x slower,
  3.1 s and 4.0 s, still off the page); iOS in a detached task. Kept per
  pot AND posterior, a handful at a time.
- *Shading*: each level's odds over the best level's, as the opacity of
  a green band, so a fresh install at 2/10 everywhere is still shaded.
  Dots over levels the pan delivers but the odds do not offer; the old
  diagonal stripes over what the pan cannot deliver. Web: layers in the
  existing track. iOS: a strip under the SwiftUI slider (`OddsTrack`).
- *Reachability*: the softest and firmest levels at 3/10 or better.
  A physically impossible level keeps its physical sentence but snaps
  to the odds' end; a deliverable one outside the range is refused as
  `unlikelySoft` / `unlikelyHard`. **When no level reaches 3/10, and
  before the first egg, the physical limits stand** with no refusal
  from the odds, so a fresh install is never refused for being new.
  Measured: after one egg the soft end moves by 0.01-0.07 on boiling
  pots and 0.05 on the counter; after four eggs with one runny white,
  0.14 -> 0.19.
- *The (i)* beside the odds opens, in place, why they start low.
- *Protocol advice*: under 5/10, or 3 tenths or more under the best
  level, "How to make this more reliable" opens in place. The model
  prices two changes from their own pots' profiles and shows them only
  where they raise this level's odds by half a tenth: the counter to
  ice (after one egg, soft/jammy/fudgy/hard 0/0/3/6 -> 5/6/6/6), and
  twice the water with the heat off (0 -> 3-4/10 at 2 -> 4 L). Two it
  cannot price, because it takes their inputs as exact, are shown by
  rule: straight from the fridge when the egg is the room preset (17
  against 23 C is 28 s at jammy), and weighing when the egg is a size
  class (63 against 73 g is 39-49 s). A cold tap is never advised
  against: on the model it is ice, to the tenth.

#### E5, choosing the time (28 September)

DONE 28 September. The protocol advice was not in this pass; it came
with the odds-shaded slider, above. `src/core/decide.ts`, held to `EggTimerCore/Decide.swift` by
`fixtures/decide.json` (Swift chooses the same time as the TypeScript to
1e-12); the reasoning is INFERENCE.md §8. The time minimises P(too soft)
+ P(too firm) + 3 P(runny) over every particle, within 120 s of the mean
solve, plus a cost of 1e-4 egg per second of lean that only matters
where the loss is flat. The taste offset reaches the time for the first
time since Phase C. The refusals are the mean solve's, as before; the
choice is made at the level they leave. It also replaced E2's resample
jitter with Liu and West's kernel, in both cores (below). Measured
(`npm run decide`, `test/decide.test.ts`, `test/decideOdds.test.ts`):

- **Not before the first egg.** Under the prior alone the choice would
  move the reference egg 86 s later at soft, 42 s at jammy, 9 s at
  fudgy and 2 s at hard (74-106 s at soft and 37-46 s at jammy on a
  cold start, a tap, 50 g and 80 g; to the window's edge on the
  counter), and the first egg would come out a step firm: the prior's
  time-scale sd is about +-70 s of cook time, so no time gets the yolk
  right more than one egg in five and the white's tail steers. So
  before any egg the time is the literature's, exactly (a shift of
  0 s), and only the odds and "still learning" come from the prior.
  After ONE egg - jammy, just right, white firm - the choice leans +4
  to +9 s at every level on every boiling pot, and under 10 s with the
  white skipped.
- **The odds** on the reference egg: 2/10 on a fresh install at every
  level, 5-6/10 after one egg, 7/10 after three. **Calibration**, 400
  simulated cooks x 6 eggs, 1000 particles: expected calibration error
  2.2%, every egg within 1-3 points (21% -> 21%, 39% -> 37%, 51% ->
  51%, 58% -> 59%, 62% -> 64%, 65% -> 68%).
- **The resample.** Measuring the odds found them under-stating the
  hits by 4-6 points from the fourth egg (ECE 3.8%), and folding by
  plain reweighting closed the gap, so it was the filter: E2's resample
  moved every particle by a fixed 2% on alpha (0.015 decades, 3%)
  whatever the posterior, in every direction independently. That also
  held alpha above ~3% (E4's 3.3% after one reading) and pulled apart
  the time-scale-and-taste combination the answers pin, so the right
  cook time's spread climbed back after every resample: on a cook who
  never changed, +-8 s at jammy, then +-15 s, then +-8 s. It is now Liu
  and West's kernel (discount 0.98): shrink toward the weighted mean,
  move by a draw from the weighted covariance, in additive coordinates,
  so mean and covariance survive. Replayed through the log: Phase C's
  recovery is unchanged (egg 2, 12.2 s short, sd 3.0%), E2's answer
  calibration 1.3%, one probe reading kept at 2.60-2.81%, and E3's
  two-runny-whites numbers within 3 s.
- **Still learning: the owner's rule, the interval over +-15 s.** Under
  the old resample it came back after first going quiet for 66 of 150
  simulated cooks (44%), so the fallback - the first four eggs - was
  built first. With the kernel: quiet after a median of four eggs,
  back again for 10 of 150 (7%), never quiet in eight eggs for 8; on a
  consistent cook at jammy +-72, 22, 13, 11, 9, 8 s over the first
  five eggs. It is read at the level on screen.
- **Performance.** Only the time-scale needs the physics, so a decision
  needs one dose surface per pot over every slider level: 13 rows x
  10 s columns, 38-80 columns. In node on this machine it builds in
  0.44-0.72 s on boiling pots and 1.27 s with the heat off; a decision
  on it is 16-20 ms, beside a mean solve of 20-40 ms (150 ms with the
  heat off). Against a fine
  surface (29 rows, 4 s) the chosen time is within 0.18 s on boiling
  pots, 0.63 s on the counter and 3.3 s with the heat off, and the odds
  within 0.002; 21 rows x 5 s was three times the cost, 9 x 10 s less
  accurate. The web app shows the mean solve's time at once and asks
  the worker for the surface once the inputs have sat still for 300 ms,
  keeping six by pot; the slider is not in the key. In Chromium: a new
  pot's mean time was on screen in 138 ms and the chosen time and odds
  at 1.08 s, the page's longest stall 42 ms; after an egg, "Start
  again" moved 7:00 to 7:05 at 0.85 s; a one-second drag across the
  slider never blanked the odds and stalled the page 45 ms at most.
  iOS does the same off the main actor, with an actor for the cache. A
  cold start's boil tap carries the lean chosen at "Eggs in": 3.1 s
  from choosing again at soft on a 480 -> 600 s ramp, under 0.5 s at
  jammy and fudgy.
- **Two runny whites at soft** (LOGBOOK.md, 28 September): with the
  yolk also just right, the choice moves soft 146 s and jammy 17 s
  (the mean solve had moved it 20) - the shape E3's done-when asked
  for. With the white alone both move, 131-140 s. And
  cooked at E5's own times the second runny white comes two minutes
  later, so both levels run to the edge of the window at 0/10. Where
  the white binds, the choice leans a long way: the mean solve times a
  white at its median, a coin flip on runny, and a runny white costs
  three. The counter's softest level leans 81-99 s for the same reason.

`PRIOR_ID` is `2026-09-e5`. NOT verified: nothing on iOS was run or tapped - it
builds for the simulator, and the core is held by `swift test`.

#### F1, the catalogue (27 September)

**F1 the catalogue.** DONE 27 September 2026. `copy/en.json` holds all
235 strings of both apps, one entry per key (`group.name`, grouped by
screen), each with its surface, the apps that use it and example
arguments; `copy/surfaces.json` holds a length budget per surface,
recorded from today's English maxima. Rendered by `src/core/copy.ts` and
its Swift twin, the `EggTimerCopy` library (separate so the widget links
it without the physics), held together by `fixtures/copy.json` (331
renders, 90 plural-rule rows including Czech at 0, 1, 2, 4, 5, 1.5, 21
and 22, 31 probes). Core returns keys: the doneness anchors, both size
tables, `longDuration` and `startPhrase`. Measured: no wording moved -
108 web states, 8,275 strings, identical to `main` before the move
(`tools/copySnapshot.ts`), and every one of the 168 Swift literals that
were words is a catalogue template, placeholders only where there were
interpolations (`tools/copyLiterals.ts`). **The language picker is NOT
built**: a picker with one language in it is a control that does
nothing. The active locale is plumbing (`ACTIVE_LOCALE` in
`src/ui/copy.ts`, `Copy.activeLocale` in `ios/Shared/Copy.swift`),
fixed at `en`; the picker arrives with F5, and sets those. *It arrived
with F6 instead (28 September): English and English (1750).*

#### F2, the rewrite (27 September)

**F2 the rewrite.** DONE 27 September 2026, but for five rows held
back (below). Inside the catalogue, one diff for the owner. Known
offenders listed in `LANGUAGE.md` §3: "carryover", "calibration",
"literature values", "the model", "standing method", a ±% of nothing,
and every bare "°". Every inserted word (a doneness name, a limit)
moves out of running grammar into a label or after a colon, so Czech
never has to decline it. Runs alongside E2 and E5.
- **The feedback screens**, with E2, 27 September: LANGUAGE.md §3's
    draft, in both apps, approved on the owner's behalf while they were
    away. 19 keys changed, each listed in `tools/drafts/feedback.ts`; the
    proofs show nothing else did. Left for the rest of F2: the iOS
    alarm's and Live Activity's "carryover", `learned.forgetExplain`'s
    "posterior", and the heat-off explanation.
- **The rest of F2, and the first-person pass**, 27 September: both
    of LANGUAGE.md §3's owner-approved tables, in both apps. 37 keys
    changed, each listed in `tools/drafts/rest.ts` against `e1f7068`;
    `copyLiterals.js --since e1f7068` and `copySnapshot.js compare
    --draft` show nothing else did. Three pairs are now one key each
    (`controls.start.cold`, `controls.afterBoil.keepBoiling`,
    `readout.stat.afterBoil`); the refusals no longer take `{wanted}`.
    **Held back, for the owner:** `alarm.cooled.body` (59 characters,
    notification body budget 53), `feedback.thanks` (39, label 36),
    `learned.forget` (24, button 23) and `learned.confirm.title` (25,
    title 23) are over budget; and `readout.sub.coldAssumes` ("your pan
    took {boil} to boil last time") would be false, because `{boil}` is
    a blend of every boil at that volume, or another volume's scaled.
    Each needs a shorter wording or a raised budget, and a true line.
    *28 September:* two are settled - `alarm.cooled.body` went in once
    F6 raised the notification body's budget to 110, and
    `readout.sub.coldAssumes` became "about {boil} to boil, based on
    history" in the redesign. `feedback.thanks`, `learned.forget` and
    `learned.confirm.title` still say "it", for the owner.

#### F3, units, and size classes by region (26-27 September)

**F3 units.** DONE 27 September 2026. `src/core/units.ts` +
`Units.swift` + `fixtures/units.json`: conversions, a step and decimals
per quantity per system, input bounds rounded INWARD to the step, and
the round trip - store SI, show it rounded to the step and held inside
the bounds, re-read a field only when the cook edits it. Measured: all
1,038 grid values of every input, in both systems and both water units,
come back as typed (the generator refuses a fixture where one does not),
and mass and girth also survive the trip through the one diameter the
web stores them as. The setting is stored as the cook's CHOICE (`null` /
absent until made), apart from the regional default: Imperial only in
region US on the web; on iOS the temperature preference, then the
measurement system, then the region (`regionalUnits`). A change of
system by the cook raised `aet:unitsflip` on the web (a direct call
since 28 September) and posts `.unitsFlipped` on iOS, the hook F6
needs. Every
temperature carries its unit through `format.*` keys, the size menu
shows ounces from the same mass, the Live Activity is handed its numbers
rendered, and the record's `units` is the system the cook read at "Eggs
in". Budgets raised for the unit: lockscreen 29 -> 33, body 251 -> 260,
a11y 88 -> 101. Web driven in both systems under en-GB and en-US; iOS
built and seen in both systems, but not tapped (see LOGBOOK).
- **Size classes by region**, done first, 26 September 2026. US carton
    classes in region US, at the MIDPOINT of each USDA range (an EU
    Large had been overcooking an American Large by ~34 s).
    `US_SIZE_CLASSES` and `sizeClassesFor(region)` in `geometry.ts`,
    `carrySizeIndex` in `policy.ts`, both twinned and both tables in
    `fixtures/policy.json`. The web reads the region from
    `navigator.language`, iOS from `Locale.current.region`; region only.
    A stored index keeps its NAME across a region change (Large stays
    Large, at the new table's mass; Jumbo outside the US becomes Extra
    large), because the class is the word on the cook's carton. iOS
    gained the class menu the web already had, with the slider as the
    scale: an install from before it, still on the untouched 68 g, is
    read as a Large, so Americans on the default move to 60.2 g. Labels
    moved into the catalogue with F1 and show ounces under Imperial
    (`sizeClassLabel` in units.ts).

#### F4, locale formatting (27 September)

**F4 locale formatting.** DONE 27 September 2026. `src/core/format.ts`
+ `EggTimerCopy/Format.swift` + `fixtures/format.json`: numbers through
`Intl.NumberFormat` / `NumberFormatter`, times of day through each
locale's short and medium time style, rounded first by the units'
`floor(x + 0.5)`, no signed zero, every space in a time U+202F. The
formatting locale is the UI language in the device's region
(`formattingLocale`), plus iOS's own 12/24-hour setting as `-u-hc-`.
Pinned: en-US, en-GB, cs-CZ and six more measured to agree - 459 numbers
and times, 43 pseudo-Czech renders (`test/pseudo-cs.json`: Czech's
plural rule, no Czech words), the plural rule with visible decimals
("2,00 l" is `many`). Weekday names from the catalogue in both apps.
"1 seconds" is "1 second". The record's `lang` is the ticket's language.
Measured: against `main` at c466b93, 166 of 171 web states identical and
the other five differ only as intended (the en-US sous-vide clock, the
spoken "1 second"). Found and NOT settled: en-CZ prints "09:05" on the
web and "9:05" on iOS, and a Czech UI outside Czechia gets its decimal
separator from the language on the web and the region on iOS - both
F5's to decide (`LANGUAGE.md` §2). iOS built and seen in a spare
simulator; nothing tapped.
Both settled by the owner and built, 27 September: no time of day
zero-pads its hour, in either app (`unpadHour`: en-GB and en-CZ now
"9:05"), and numbers follow the UI's language, with the region only
where the language has no convention of its own (`OWN_CONVENTION`,
today `cs` -> `CZ`: a Czech UI in the US writes "1 234,5" on both;
en-DE still "2,4"). Pinned in `fixtures/format.json`, en-CZ included.

#### F6, the English of 1750 (28 September)

**F6 the English of 1750.** DONE 28 September 2026, in both apps; the
owner's review of the wording is the one open item below. A language code, `<region>-x-1750`: strings
from `copy/en-x-1750.json`, formats from the region (Intl and Foundation
both already strip the subtag - `LANGUAGE.md` §6). *English (1750)* in the
in-app picker; switching an English UI to Imperial selects it, back to
Metric restores the prior English, and picking English leaves it with °F
kept. One line under the Imperial option so Americans can find it. The
style guide is Johnson's *Preface* as first printed in 1755 (Lynch's
transcription; not Gutenberg 5430, which is the 1773 revision),
reviewed by the owner: no capitalised common nouns, none of eight
stage-play archaisms (tested), 1755 spellings as a modern->period table
(tested; *errour*, *publick*, *shew*), *rear* at the soft end of the
scale. Details and drafts in §6.
- **The web half**, 28 September, not yet reviewed by the owner:
  `copy/en-x-1750.json` (307 keys), the picker, the switch
  (`src/core/language.ts`), the title, the record's `register`, and
  `test/en1750.test.ts`. As built in `LANGUAGE.md` §6.
- **The iOS half**, 28 September (`01c621e`..`15cf890`): the switch
  ported and held to `fixtures/language.json`, the picker, the title
  with its accessibility label, the serif book face (the clock keeps
  its own), the web's accent as the tint, 1750 twins for the alarms
  and the Live Activity, no odds on the Lock Screen (`odds.hitTheMark`
  retired), and the colophon in plain words. As built in
  `LANGUAGE.md` §6.

#### The heat-off pan's constant from the water (27 September)

~~**Soon after E1 and F1 merge: the standing method's pan constant from the
water volume**~~ (`INFERENCE.md` §11, item 11). **Done 27 September**, except
the per-cook scale, which is deferred (below). `panTimeConstant` was the boil
time over `ln(r/(r-1))` with `RAMP_R = 3` fixed, so it measured the hob, not
the pan: a strong hob was read as a pan that cools about 2.2 times too fast. It
is now `TAU_STANDING_SCALE * TAU_STANDING_REF_S * (V / 2 L)^(1/3)`, with
`TAU_STANDING_REF_S = 480 / ln(1.5) = 1183.8 s`, so the Williams check still
reads 75.6 °C (75.6033 before and after). `STANDING_VOLUME_EXPONENT = 1/3` is
named as a judgement in `constants.ts`, and `tools/validate.ts` prints tau at
1-4 L beside what the old rule gave on a hob that boils 2 L in 8 minutes:
15.7 / 19.7 / 22.6 / 24.9 min against 9.9 / 19.7 / 29.6 / 39.5 (0.63x to
1.59x). Both cores take litres in `standingTemperature`, and the standing
scan's horizon no longer counts a hot start's remembered boil, so the
remembered boil time is now used for nothing but a cold start's first guess
(a hot start's setup still carries it, for E1's record).

Measured moves, standing time after the boil, cold start, four fridge eggs,
ice bath, at 1 / 2 / 3 / 4 L (README §7 has the full table):

- a hob that boils 2 L in 8 minutes, hard: white never set → cannot reach
  (0.66) / 10:13 unchanged / 4:29 → 4:44 / 2:29 → 2:34. Jammy: white never
  set → 6:42 / unchanged / +1 s / unchanged.
- a fast hob, 2 L in 4 minutes, jammy: never sets either way / white never
  set → 6:09 / 4:52 → 4:27 / 3:13 → 3:09. Hard: never sets / never set →
  cannot reach (0.81) / cannot reach (0.76 → 0.999) / 10:13 → 7:52.
- an unmeasured pan (8 minutes guessed at every volume), hard: 10:13 →
  cannot reach (0.91) / unchanged / 10:13 → 8:26 / 10:13 → 7:52.

The copy that said the boil time is how fast the pan cools is gone
(`readout.sub.standing` now names the water), the white-never-sets refusal
(`refusal.whiteNeverSets`) no longer advises a slower boil, and the iOS
heat-off explanation no longer names the method.

**Deferred: a per-cook standing scale.** `TAU_STANDING_SCALE` stays 1.0, a
global multiplier. The lid, the pan's shape and material belong in a per-cook
scale learned only from that cook's standing eggs (`INFERENCE.md` §11, item 11),
which wants E2's likelihood and enough standing cooks to identify it apart from
`alpha`. Not built.

#### Removed from the frozen API, September 2026

`CookSetup.eggMass_kg` was removed in September 2026: it duplicated
`Egg.mass_kg`, and since every function that took a setup also took an egg,
callers had to keep the two in step by hand. `tools/validate.ts` had to remember
an override in its size sweep or it would silently have modelled four different
eggs against one fixed water dip. No physics number moved - the fixtures are
byte-identical apart from the missing field.

#### Checked on 18 September and not a problem

Checked on 18 September and NOT a problem, so nobody re-checks: the web app's
`reset()` already re-solves, and its solve is synchronous, so neither of that
day's iOS bugs has a twin there. The web app also already defaults to a cold
start — iOS was the outlier, and now matches.

### Three retirements, told once

Each of these was told in five to eight places across the documents, each
telling a little different. This is the one to cite.

- **The odds as a number.** "7/10 eggs hit the mark" went under the time in
  both apps and on the Lock Screen with E5 (`e2b63db`; `DECISIONS.md` 8).
  It did not say which way the other three eggs miss, so on the web a
  sentence saying which way a miss is likely to go replaced it (`7b9059f`),
  with the number moved into the sentence's (i); then the number left the
  (i) too (`1c4143d`). iOS followed in pass B (`3f771c6`), and the owner took
  the odds off the Lock Screen (`05e92ae`), which retired `odds.hitTheMark`.
  No screen shows the number. The odds still shade the slider, set its reach
  at 3 in 10 and open the advice under 5 in 10.
- **"Still learning".** The owner's rule is the 80% interval of the right
  cook time wider than ±15 s (`DECISIONS.md` 9, built `3be2ff5`). It was a
  line under the time until the owner found it said what "I can't call it
  yet" says: gone from the web with `1c4143d`, from iOS with `3f771c6`
  (`odds.stillLearning` retired). The running cook's ticket carried
  `oddsTenths` and `stillLearning`, never read, until both apps dropped them
  (`9dbca9c`); the egg's record never kept either, and E6 will keep the full
  forecast instead (`DECISIONS.md` 37). `Decision` stopped computing the
  interval (`527e1a4`, D3); the tests and `npm run decide -- learning` read
  it on demand from `predictCookTime`.
- **Playing safe.** A one-tap suggestion under the direction, to the softest
  level at least as firm nine eggs in ten (or the mirror), built in core
  (`af0af98`), on the web (`1c4143d`) and on iOS (`3f771c6`), and held under
  `WHITE_RISK` so that a softer suggestion never bought the yolk with a runny
  white (`936dbe0`). The owner found it noise that says in words what the
  slider and the bracket already show, and it left both apps (`e04d72c`);
  `saferLevels`, its fixture, its tests and its section of `npm run decide`
  were deleted the same day (`23e6d3d`, D2). What it measured is in the
  entries of 27 and 28 September.

### Citations

Code comments that pointed into a document that changed now point at the
new place: the loss ratio, the ±15 s rule, the heat-off pan and E3's limit
at `DECISIONS.md` 7, 9, 11 and 18 (`decide.ts`, `Decide.swift`,
`constants.ts`, `test/decide.test.ts`, `test/infer.test.ts`,
`tools/decide.ts`); core's invariants at `CLAUDE.md` (`test/core.test.ts`,
`units.ts`); the validation table at README section 7 (`tools/validate.ts`);
the setup sentence at UI.md section 5 (`SetupSentence.swift`). The odds'
calibration (2.2%) lives only in INFERENCE.md section 8, which
`test/decideOdds.test.ts` and `tools/decide.ts` cite. UI.md and LANGUAGE.md
kept every section number code cites. INFERENCE.md lost its last two
sections: the order to PLAN.md, and the decisions to DECISIONS.md with their
numbers kept.

**Run:** `rm -rf dist/test && npm run verify`: 255 tests, all pass; the Swift
copy lint; the fixtures unchanged; `swift test` 119 tests in 31 suites.
Comments and documents only.

**Not verified:** nothing runs differently, so nothing was run on a device.

## 29 September 2026: FOLLOWUP, worked through

QA's worklist after WORKLIST (FOLLOWUP.md, verified at `cbd8d66`), on a
branch from `a04ccfc`, all but §0, which the owner settled on main
(`DECISIONS.md` 47). Each item is ticked there with its commit.

- **The storage formats are live** (677cb73): PLAN's standing facts say a
  change to `aet.settings.v1`, `aet.cook.v2`, `aet.calibration.v4`,
  `aet.boil.v1` or record v1 needs a migration or a bump.
- **A restored web cook is the ticket's, all the way** (be691d3). `boot()`
  solved a running cook from the live settings, and through `applyAnswer`
  could snap and save `settings.doneness` mid-cook. Checked in a browser:
  a cold cook started at a snapped doneness (0.04), then doneness 0 and
  3 L written to storage as another tab would, then a reload. This build
  leaves the stored settings byte for byte and counts down the ticket's
  cook; `a04ccfc`'s build rewrote doneness to 0.04. `recompute` only
  redraws outside IDLE now, and `applyAnswer` takes nothing up.
- **Smaller fixes.** `restoreTicket` requires `afterBoil` (087cd08). A
  live-site settings record with no `measuredBy` reads as the scale, not
  the width, since record v1's `massFrom` has no "unknown" (58fc86a). The
  web's mid-cook re-solve goes through `answerAt(snapRetry: false)`, as
  iOS's does (a0f1bfa). `dom` is `page()`, which throws before boot
  (eebc008). Four exports nothing imports are private (68a6fda). The
  catalogues' `about` lines name `test/data/` (fe8c607).
- **The gate.** CI builds the app and widget (`npm run ios:build`, 18 s
  locally with a warm cache; 4c35ef4), kept out of the local `verify`.
  `fixtures:check` fails on an untracked fixture (ea9723c); its first form,
  `git status --porcelain`, also failed on a fixture change staged for the
  commit, and `git ls-files --others` replaced it (9783d30). The Swift
  tests read fixtures only through `list` / `object` / `number(file,
  path)`, and a missing fixtures directory throws rather than traps
  (4917fdc). A test pins WORKLIST 2.3: a build that throws rejects and
  can be asked again (39b001f).
- **The setup sentence's comma** (46351e8). A clause button is an atomic
  inline, so a line could start with ", then under a cold tap". Each
  button now sits in a nowrap span with the punctuation after it. At
  every width from 150 to 520 px, with a room-temperature egg, a
  boiling-water start and a cold tap, no line starts with a comma or a
  stop; without the span, 115 line starts did. iOS sets the sentence as
  one `Text`, where a comma after a letter is never a break.
- **The `tidy2` draft** (a05752d): FOLLOWUP §5 with §4.2, 15 keys, both
  apps, 1750 twins rewritten. LANGUAGE.md §3 has the table and where it
  departs from FOLLOWUP: "I can't sound the alarm" rather than "the alarm
  is off", which reads as the Sound switch; "Forget it" under "Start
  learning again?" reads as "never mind", so it became "Start again"; and
  a screen with no button asks for "a full rolling boil" in lower case,
  not "when the water boils", which invites the early tap. Proved by
  `copyLiterals --since a04ccfc tidy2` and `copySnapshot compare --draft
  tidy2` (172 web states). `spoken.total` has the same fault as the three
  it fixes, and is left: the snapshot proof reads the label "Total time"
  as the template "Total {time}".

**Run:** `rm -rf dist/test && npm run verify`: 258 tests, all pass; the
Swift copy lint; the fixtures fresh; `swift test` 119 tests in 31 suites.
`npm run validate` 28/28. `npm run ios:build` builds.

**Not verified:** `tidy2` on either app on a phone (the owner's pass), and
on iOS at all; the setup sentence's wrap in Safari; `ios:build` on a CI
runner, which needs a push.

## 2 October 2026: the privacy page

`privacy/index.html`, served at /privacy, for App Store Connect's privacy
policy URL (DECISIONS 51), and a Privacy link in Help in both apps (the
`privacy` draft). Every claim was checked against the code: no networking
on iOS, a same-origin CSP on the web, and "Start learning again" clears the
rated eggs and boil times in both apps. The App Privacy label is "Data Not
Collected" until E6. The agent that built it stalled before its docs and
checks; the session finished them.

## 2 October 2026: the egg in cross-section, a prototype

On the branch `claude/egg-state-visualization-dd4490`, for the owner to
judge on a phone: whether a running cook should show the egg as how set
each layer is, or as how hot.

- **Core** (953c698). `src/core/section.ts` runs `simulate`'s loop a step
  at a time as the clock moves, with a dose at 34 radii: 17 across the
  yolk and 17 across the white, the yolk's edge sampled as both. Advanced
  past the carryover, the centre and the innermost white give `simulate`'s
  peaks exactly and its doses to 1e-4 (it runs the window out where
  `simulate` stops early). A tick at a time is bit-identical to one long
  advance. At t = 0 the 40-term series reads a hot start's centre as
  95.8 C: the shell's step is a fresh discontinuity (invariant 7). By
  0.5 s it reads 11.6 C, by 2 s 4.0 C, so the screen draws a uniform egg
  for the first second.
- **The drawing** (f312cc1, c79c35b). An ovoid at the model's 1.35, blunt
  end up, with a round yolk; across the white the outlines turn from
  circle to ovoid. Each ring is a closed polygon filled opaque, outermost
  first. A translucent fill would show the rings beneath it through, so
  the clear white is a colour of its own. "How set" is the yolk on the
  slider track's colours and the white from glassy to opaque, over the
  decade of dose below its target. "How hot" runs blue through a grey at
  40 C to red, two hues and a neutral, never a rainbow. A tap swaps
  them. First placed under the time, it cost the column 7.5 rem; at the
  owner's word it moved to the left of the setup sentence, where it costs
  none.
- **The lab** (`tools/egg-section.html`, the `egg-lab` launch
  configuration). A whole cook scrubbed or played at 30 times real time,
  both pictures side by side and eight moments in a strip. Five presets,
  a doneness, a mass and a late pull. On each preset the centre ends on
  the slider's colour for the level asked for (#e89400 at 0.41, light),
  except a counter rest. There 0.41 is out of reach, the solve answers
  its softest, 0.61, and the egg ends there.

**Seen**, in the web app on a 375 px viewport in both schemes, the clock
jumped through `Date.now`: heating, the boil tap's replay, cooking, a
late pull timing out into cooling, and done, with both pictures. A reload
restored mid-cook replays the egg from t = 0. The console stayed clean.

**Run:** `rm -rf dist/test && npm run verify`: 269 tests, all pass; the
copy lint; the fixtures fresh; `swift test` 119 tests in 31 suites.

**Not verified:** a real phone, Safari, and iOS at all (there is no Swift
yet). The tap reaches no keyboard, and the picture has no words.

## 2 October 2026: the egg in cross-section, chosen and in both apps

The owner chose "how set" (DECISIONS 52) and asked for a clearer raw white,
a touch blue.

- **Web** (458150a). The tap to the heat map went, with its colours; the
  lab keeps both pictures and now carries the heat map's colours itself.
  The raw white is `#19202b` on the dark page and `#e6edf6` on the light:
  the page's colour, a touch lighter and a touch blue. The picture says
  nothing the sentence and the time do not, so it stays wordless and
  hidden from a screen reader.
- **The Swift core** (5ff0874). `EggSection` in `Section.swift`, held by
  `fixtures/section.json`: three cooks tick by tick (hot start into ice; a
  cold start with the heat off, rested on the counter; one still in the
  water), with every ring's dose, temperature and set against the
  constant white target and a moved one. It agrees at 1e-12, like every
  other suite.
- **iOS.** `EggSectionView.swift`, beside `CookSentence` in an `HStack`, in
  its own one-second `TimelineView`. A small cache carries the section
  between ticks and replays it from t = 0 when the ticket changes. The
  outline is `ringPoints` from `eggSection.ts`, the same numbers, drawn on
  a `Canvas` outermost first. The colours are `Palette.yolk(at:in:)` and a
  new `Palette.white(at:in:)`, which share one RGB mix. The time out of
  the water is the cook's tap, or the pull plus `pullGraceSeconds` once
  the grace has run out, as the web's `outAt_ms` is.
  `-sectionAhead <s>` (debug) draws the egg that far on in the cook as
  planned.

**Seen** on the simulator (Shots 14 Plus, iOS 26.5): a cold start's raw
egg 1:29 in (light); +9 min, the white set and the yolk's outer ring paler
(light); about six minutes into the ice bath, a jammy yolk (dark). Each
matches the web's egg. `-uiScreen heating` did not start a cook when the
app was already running, so Start was tapped. The simulator was left
idle, in light appearance.

**Run:** `rm -rf dist/test && npm run verify`: 269 tests, all pass; the
copy lint; the fixtures fresh; `swift test` 121 tests in 32 suites. `npm
run ios:build` builds.

**Not verified:** either app on a real phone; Dynamic Type at large sizes
beside the egg; Safari.

## 2 October 2026: a browser from 19 September runs stale modules

The owner's browser loaded the 0.3.2 page and failed at boot: "The requested
module './geometry.js' does not provide an export named 'US_SIZE_CLASSES'".
The 19 September site served /dist/* as `max-age=31536000, immutable`, so a
browser that visited then keeps those modules for a year; the header was
fixed on 27 September, but only for files fetched since. The published site
now serves its scripts from /app/ (`tsconfig.site.json`,
`tools/sitePaths.mjs` rewriting index.html's one script tag), a path no
browser cached under the old header. Serving the repo root still uses
dist/. Checked: the built site boots from /app/, its worker too.

## 2 October 2026: the egg, bigger and egg-shaped

The owner: too small, and "a perfect oval instead of one where one end is
smaller". The first outline stretched an ellipse lengthwise at the blunt
end, which leaves the two ends the same width; it read as an oval. The
shell is now an ellipse whose width runs as 1 + 0.18 y along its length,
so the pointed end is narrower as well as tighter. A quarter of the way in
from each end, the blunt end is over 1.15 times the wider
(`test/eggSection.test.ts`), at the model's 1.35 length to width. 0.22 was
tried and read as a teardrop. The yolk sits 0.06 of the half-length toward
the blunt end. The drawing's bounds are now worked out from the outline.
Both apps draw it at 104 by 136 points, up from 80 by 104. That is taller
than the sentence beside it at 375 px (136 against 101), which the owner
asked for. Seen in the web app at 375 px and on the simulator; the
simulator was left idle.

## 2 October 2026: the egg, standing on its blunt end

The owner: point up, so it does not look balanced on its small end, and
about 15% bigger. The outline is turned over (the width runs as 1 - 0.18 y,
and the yolk sits below the middle, toward the blunt end), and both apps
draw it at 120 by 156 points. At 375 px the sentence beside it wraps to
four lines (127 px), so the row costs about 29 px more than the words.
Seen in the web app at 375 px and on the simulator, which was left idle.

## 2 October 2026: E6-E8, the collective part

Built from `COLLECTIVE.md`, which has every choice; the owner's answers are
`DECISIONS.md` 59-61. Nothing is deployed: the endpoint goes live with the
next push.

- **E6, collection.** Each record keeps what the app said at Eggs in
  (`forecast`, the six answer probabilities and the time they were for) and
  the code that said it (`model`); `Outcome` gained the white's tender and
  firm for it (3c32227, 67be30d). The endpoint, `server/eggs.ts` behind
  `netlify/functions/eggs.mts`, keeps an egg only if its key is new, after
  `parseRecord`, and deletes by id (00186b1). App Attest's verification was
  run against Apple's own sample attestation, which chains to Apple's real
  root, and against a synthetic one for this app whose key the tests sign
  assertions with; the function ran through the real Blobs client against
  its local server. Both apps' sharing (f7f9e90, 0f93576, f902240) was driven
  end to end against `npm run serve:dev`: turning it on sent the log so far
  (two eggs, open tier, from the browser and from the simulator), and
  Delete removed both on the server and said so. The `share` draft's proofs:
  `copyLiterals --since c86f442 share` and `copySnapshot compare --draft
  share` over 172 web states.
- **E8, the nudge.** Measured before it shipped (`npm run decide -- nudge`,
  300 simulated cooks x 6 eggs, the truth's own probit): eggs right fall from
  52.1% to 49.3% at +-10 s, 51.3% at +-5 s, 51.8% at +-3 s; by a cook's sixth
  egg 66.9% to 62.6% at +-10 s. INFERENCE.md had said "at no cost to the
  cook"; it was wrong, and says so now. The owner chose +-10 s (56). In both
  apps the time moved with sharing (11:17 to 11:21 in the browser, 11:35 to
  11:29 in the simulator) and the Learning mark showed with its (i). The
  `learning` draft's proofs as for `share`.
- **E7, the fit.** Both apps draw from `fixtures/population.json`, the
  literature's for now; with it every existing fixture stood still (fea97d5).
  The fit (3068cdb) on 400 simulated cooks: the time-scale recovered (0.597
  +- 0.037 for 0.600), the white's lag (0.229 +- 0.053 for 0.250), and on
  77 held-out cooks one step ahead a log score of -0.455 per yolk answer
  against the truth's -0.452 and the literature's -0.509; the noise's median
  and spread not recovered. INFERENCE.md section 9 has the table.

**Run:** `rm -rf dist/test && npm run verify`: 282 tests, all pass; the
Swift copy lint; the fixtures fresh; `swift test` 122 tests in 32 suites.
`npm run validate` 28/28. `npm run ios:build` builds. `fit/tests` 3 pass.

**Not verified:** the live endpoint (it is not deployed); App Attest's
attested path on a phone (the simulator cannot attest, and a development
build attests against Apple's sandbox); sharing in Safari, and on a real
phone's network; the `share` and `learning` words on a phone (the owner's
pass); a real fit (no shared egg exists).

## 3 October 2026: the motto

"Time eggs, not minutes" heads Help in both apps and leads the web page's
description; "Made by Dan MacKinlay" ends Help, linking https://danmackinlay.name,
as the privacy page's name and the README do (the `motto` draft, DECISIONS 53).

## 3 October 2026: the `plain` draft

The owner: much of the copy "reads very Claudish", and the strings approved
earlier were approved as good enough for now, not as final (`DECISIONS.md`
54). The model is the owner's rewrite of the Help line on cooling: "The
cooling time also counts as cooking time, since the egg is still warm
inside." The `plain` draft follows it across 71 keys of both apps
(`tools/drafts/plain.ts`, on `73ea0f8`). Eleven 1750 twins are rewritten
where the meaning moved; the rest stand, since the period's semicolons are
the joke. `LANGUAGE.md` §3 now lists the marks of machine prose among its
criteria, and `CLAUDE.md` points there.

- **Counted before the pass**, in `copy/en.json` less the sources: a dash
  as a pivot in 24 strings (8 of them size labels, which keep it), a colon
  meaning "because" in 11 (i) paragraphs, two clauses on a semicolon in 8,
  "predictable" 5 times, "teaches me" 4.
- **Left for the owner:** "counter", "cold tap" and "pan" wait on which
  English is the base. "Counter" is American (a Briton says worktop, an
  Australian bench), and "tap" also names the screen gesture in the same
  app ("Tap Full rolling boil", "They're under the tap"). A regional
  overlay is cheap here: `render` already falls back from one catalogue to
  the next, `copy.test.ts` reads every file in `copy/`, and iOS bundles the
  folder, so a `copy/en-US.json` holding only the keys that differ needs
  just a core function choosing the chain from the language tag, fixtured
  for both apps.
- **One gap in the proofs closed:** the snapshot harness collapses a
  no-break space to a space, so `compare --draft` now reads each template
  the same way (`outcome.unsure`). The two linked Help asides still fail
  it, as in `tidy`; their pieces are the drafted change, word for word.
- **Proved by** `copyLiterals --since 73ea0f8 plain` and `copySnapshot
  compare --draft plain` (172 web states), less those asides.

**Run:** `npm run verify`: 269 tests, all pass; the Swift copy lint; the
fixtures fresh; `swift test` 121 tests in 32 suites.

**Not verified:** either app on a phone. The iOS-only strings (the alarms,
the readout's alarm lines) are held only by their length budgets.

## 3 October 2026: the base English is Australian

The owner: "Australian base, with an en-US overlay" (`DECISIONS.md` 55).
The `bench` draft (`tools/drafts/bench.ts`, on `63d9094`) makes the one
change the base needed: the egg left out to cool is on the bench, in 11
keys of both apps. "Cold tap", "pan" and the spelling were Australian
already. The 1750 twins say "table" and stand. Proved by `copyLiterals
--since 63d9094 bench` and `copySnapshot compare --draft bench`, less the
linked Help aside on still air.

## 3 October 2026: the American overlay

`copy/en-US.json` holds the 20 keys an American kitchen says differently
from the Australian base: "counter" for the bench, "running water" for the
cold tap (which also stops "tap" meaning the screen and the water in one
app), "pot" for the pan, "saucepan" where a heavy pot is the contrast. Each
entry carries the base text it was written against.

- **`catalogueChain`** (`src/core/copy.ts`, `EggTimerCopy`, fixtured in
  `fixtures/copy.json`) names the catalogues that render a language. Both
  loaders already layered one catalogue over another, so each now builds
  the chain it names: the web from `navigator.language`'s region, iOS from
  the phone's first English in `Locale.preferredLanguages`, else its
  region. The language stays `en`, so the picker, the record and the units
  switch are untouched. In `EggTimerCopy`, not the core module, because the
  widget links only the words.
- **The fixture pins only an overlay's own keys**: the rest are English's,
  and pinning them would rewrite the fixture on every change of wording.
- **`copy.test.ts` 7a** fails when an overlay's `base` is not today's
  English, when it says what English says, or when a regional catalogue is
  not listed in `OVERLAYS`. **7b** is the chain and region table.
- **Seen working:** the snapshot harness's four en-US states, and only
  those, now read "Running water | Counter" and "eggs in the pot"; the
  other 168 are unchanged. On the iPhone 17 simulator, launched with
  `-AppleLanguages (en-US)` and `(en-AU)` on the cooling choice, the
  segments read "Ice bath | Running water | Counter" and "Ice bath | Cold
  tap | Bench".

**Run:** `npm run verify`: 271 tests, all pass; the Swift copy lint; the
fixtures fresh; `swift test` 122 tests in 32 suites. `npm run ios:build`
builds.

**Not verified:** the Lock Screen and the alarm in American English; Safari.

## 3 October 2026: curly apostrophes and quotes

The owner wants curly apostrophes everywhere (`DECISIONS.md` 56). The
`quotes` draft (`tools/drafts/quotes.ts`, on `3e5f5f5`) sets 47 English
strings, 9 1750 twins and the 8 American entries with ’, and the Help
sources' titles with “ ”; notes have their apostrophes curled and keep their
straight double quotes, which delimit examples. Outside the catalogue: the
web page's preview description (‘N minutes after the water boils’, the only
opening quote the pass made) and the privacy page's text. `copy.test.ts` 3c
fails on a straight quote in any catalogue, in the page's descriptions or in
the privacy page's text. The owner's own wording edits, made in the working
tree at the same time, were set aside and follow in the next draft.

- **Proved by** `copyLiterals --since 3e5f5f5 quotes` and `copySnapshot
  compare --draft quotes`, less 12 strings, each checked by script: the
  linked Help aside, and the American overlay's entries in the harness's
  four en-US states. **What the proofs cannot see:** a draft's rows
  describe `copy/en.json` only, so a change to `copy/en-US.json` shows in
  those four states as undrafted. `copy.test.ts` 7a holds the overlay to
  the English instead.
- **A capture that hung:** `copySnapshot capture` polled a harness page
  that had finished ("done" in its title) and never saw it, stuck on its
  DevTools socket. The result was read from the page over the same port
  and the capture stopped; not reproduced.

## 3 October 2026: the owner's own edits, and the cooling named for what it is

The owner edited copy/en.json by hand, then asked for it drafted. The
`owner` draft (`tools/drafts/owner.ts`, on `7fdd6b9`) carries 31 keys: the
owner's 17 wording edits (four with a one-word fix: a full stop, "weigh
one", "the heat", a comma), and what was agreed alongside (`DECISIONS.md`
57). The cooling methods are an ice bath, running water and the air, in
every English, so the American overlay keeps only "pot" for the pan: four
entries, down from 20. The buttons at the pull lost "They're". The Help line
on the odds says "below the time display", which the owner found clearer
than "under the time". 26 1750 twins moved with their meaning: the pump for
running water, as the 1750 alarm had it, and the open air for the air.

The owner's edits were set aside while `quotes` was committed and restored
from a copy; that their 17 keys, curled, were the only wording changes was
checked by script before anything was laid on top.

**Proved by** `copyLiterals --since 7fdd6b9 owner` and `copySnapshot compare
--draft owner`, less 11 strings each checked by script: the two linked Help
asides, and the American entries in the four en-US states.

**Not verified:** either app on a phone; the alarms and the Live Activity
in the new words, held only by their length budgets.

## 3 October 2026: the bracket is below the slider

The owner asked for "below" in the direction's (i) too, as Help has it: the
`below` draft (`tools/drafts/below.ts`, on `b0cb288`) changes
`outcome.bracket` and its 1750 twin, "The bracket below the slider".

## 3 October 2026: the owner's notes from reading every string

The owner read every string on the review page and had two notes; the rest
is fine. The `notes` draft (`tools/drafts/notes.ts`, on `b0ac5df`): the
sous-vide option no longer says it takes many hours, which is the point of
sous-vide (`controls.start.more`, its American entry and its 1750 twin);
and in 1750 a pump runs only while someone works it, so the label under
running water is "Cooling; keep working the pump".
Proved by `copyLiterals --since b0ac5df notes` and `copySnapshot compare
--draft notes`, less the American entry of the same key in the en-US
states.

## 3 October 2026: cooling on the counter, from first principles

The owner: an egg cooling on the bench in still air is standard convective
cooling, nobody would publish an egg-specific measurement of it, and the
model should be no weaker for the lack of one. Checked from first
principles against an independent explicit finite-volume sphere (120
shells; h, radiation and evaporation recomputed from the shell's
temperature every step; scratch code, not kept), with the cook up to the
pull taken from the app's own modal solver. Reference egg (62.3 g, R =
23.8 mm), fridge, 7.4 min at a rolling boil, a 20 °C room at 50% RH.

- **15 W/m²K is right for still air.** Free convection from a sphere,
  Churchill (1983), `Nu = 2 + 0.589 Ra^(1/4) / [1 + (0.469/Pr)^(9/16)]^(4/9)`,
  D = 2R = 47.7 mm, air at the film temperature (Sutherland's viscosity,
  `k = 0.0241 (T/273)^0.81`): with the shell at 100/80/60/40/30 °C, Ra
  5.1e5 to 1.1e5, Nu 14.1 to 10.2, h_conv 8.4/7.9/7.3/6.4/5.5. Radiation,
  `eps*sigma*(Ts^2 + Ta^2)(Ts + Ta)` at eps = 0.93: 7.9/7.2/6.5/5.9/5.6.
  Sum 16.3/15.1/13.8/12.3/11.1. Convection falls as Ra^(1/4), so slowly:
  until the yolk peaks the shell is at 65-95 °C. The old 2030 s implied
  13.8 for this egg. A constant 15 in a Robin boundary matches the
  temperature-dependent sum to 0.12 °C of peak yolk on a dry shell.
- **The wet shell was the real gap.** A film of 15 µm, 0.1 g on this egg:
  a Landau-Levich film at a spoon's pace gives 15-30 µm, and Jeffreys'
  drainage `sqrt(nu*x/(g*t))` (nu = 3.1e-7 m²/s, x 2-4 cm) 15-30 µm after
  a second or two. Evaporation by the heat-mass analogy (Churchill with Sc
  ~ 0.6 for Sh) and Spalding's `B = (Ys - Yinf)/(1 - Ys)`, needed with the
  vapour pressure near the atmosphere's: 113 kW/m² with the shell at 100
  °C, 31 at 95, 13 at 85, or 13-26 times convection and radiation together
  at 85-95 °C. The film is gone in under 10 s and takes 1.2 °C off the
  egg's mean temperature, 0.7 °C off its peak yolk. At 7/15/30 µm the
  reference peak is 75.66/75.29/74.60 °C. Leaving it out had assumed a dry
  egg. A scale reading to 0.01 g would check it.
- **The counter's contact is small.** Air-gap conduction around the
  contact, `4*pi*Rc*k_air*ln(r_max/r_min)` ~ 0.018 W/K, in series with
  spreading into the counter (`1/(4*k*a)`: 20 K/W on stone, 330 on wood),
  less the convection the sheltered patch would have carried anyway: net
  about +0.007 W/K on stone and -0.004 on wood, against hA = 0.107 W/K. The
  solid contact itself is ~0.001 W/K. A generous 0.01/0.03 W/K moves the
  peak -0.3/-0.8 °C. Left in `tauAirScale`, with draughts: 0.3 m/s
  (Whitaker's sphere, cube-summed with free convection) puts h at 18 and
  the peak 0.6 °C lower; 1 m/s at 25, 1.7 °C lower. The egg's own water
  leaving through the shell is about 2% of the loss, and left out.
- **The lumped drive was off by up to 0.8 °C, either way.** Driving the
  surface along `exp(-t/tau)` from the mean at the pull agreed with a Robin
  boundary at the same h to 0.03 °C on the reference cook, by luck: over
  48-76 g and 4.9-12 min it ran from 0.7 °C too cold (big egg, short cook,
  where the hot outer white dumps into a surface clamped at the mean) to
  0.8 °C too hot (small egg, long cook). And one 2030 s served every egg,
  though `m*c/(h*A)` goes as R: 1708 s at 48 g, 1991 s at 76 g. With the dry
  shell on top, the old counter was up to 1.47 °C too hot and never too
  cold.
- **A Robin boundary was cheap.** No new basis: each step solves for the
  surface temperature that makes the sphere's own mean fall by exactly
  `(Ts - Ta)/tau * dt` plus the drying (`robinSurface`), since the mean
  after a linear surface ramp is linear in where the ramp ends. 40 modes,
  g ~ 0.97, one exp per mode. It reproduces the closed-form Robin series
  (roots of `1 - mu*cot(mu) = Bi`) to 0.005 °C at the surface and mean and
  0.025 °C at the centre (test 17a), and the finite-volume solution to
  0.22 °C of peak yolk across the sweep (old: 1.47). The step that
  straddles the pull is split between water and counter by time, so peak
  and dose are smooth in the cook time; without the split, a pull on the
  grid read the yolk 0.6 °C low (test 13 caught it). At the pull the
  truncated basis reads the centre 2.3 °C low for one 0.5 s step, against
  4.3 °C for several seconds in the ice bath already; neither touches a
  peak or a dose.
- **The carryover conclusion survives; its framing did not.** Counter peak
  76.33 -> 75.28 °C on the reference cook, ~7 min after the pull (was
  ~8). The insulated ceiling was never 76.2 °C (README §5 since `4775ca1`,
  never computed): it is the mean at the pull, 83.9 °C. The counter takes
  8.6 °C of that and the ice bath 19. Up to the peak the egg's mean falls
  13 °C: 6.2 by convection, 5.6 by radiation, 1.2 by the film. Still air is
  slow cooling, not a lid, which is why h has to be right. Soft stays
  unreachable on the counter: the shortest white-setting cook is 4.94 min,
  peak 64.9 °C, `softestLevel` 0.61 -> 0.53 on the reference egg, still
  between jammy and fudgy. `npm run decide`: after one egg, counter to ice
  is now 0/0/5/6 -> 5/6/6/6 (was 0/0/3/6).
- **The prior on `tauAirScale` stays at 0.35, for a different reason.**
  Its comment said "least verified". Still air is now pinned to ~10%
  (Churchill ±10%, eps 0.90-0.96, the contact). What the width carries is
  the kitchen: a draught (-17% to -40% on tau), an egg cup or a towel (the
  other way), half or twice the film. One sd (x0.70 to x1.42) moves the
  reference peak 1.1-1.2 °C. `npm run rank`: carryover now takes ~30
  answers to halve its prior, not ~60, since under Robin the peak answers
  to tau more; `npm run probe`: one sd moves the rested reading 1.3 °C
  (was 1.1).
- **Code:** `TAU_AIR` is gone; `H_AIR`, `WET_SHELL_KG_M2` and
  `LATENT_HEAT_WATER` replace it; `airTimeConstant`, `wetShellDrop_C` and
  `robinSurface` are new; `coolingTemperature` takes the sphere and the
  egg, and `EggSection.meanAtPull_C` is gone, since nothing reads it. Swift
  twinned. Tests 17a-c; `validate` checks the insulated ceiling.

**For the owner.** `help.unsure.counter` still says I couldn't find a
measurement, which is no longer the reason; not edited, since the owner is
editing the wording by hand. Proposed, after `help.unsure.heatOff`: "On the
bench, I assume the egg sits in still air. In a draught the yolk comes out
a little softer, and in an egg cup a little firmer." (en-US: "On the
counter … In a draft …"; 1750: "The table. I suppose the air about it
still; a draught will leave the yolk softer than I reckoned, and an
egg-cup firmer.") Also the owner's: whether the prior narrows to ~0.2,
which would take the rank, probe and calibration numbers with it.

**Run:** `npm run verify`: 274 tests, all pass; the Swift copy lint; the
fixtures fresh; `swift test` 122 tests in 32 suites. `npm run validate`
29/29.

**Not verified:** either app on a phone; a real egg on a real counter.

## 3 October 2026: the web app opens with no signal

Asked whether the app needs work to live on a Home Screen: it was already
installable (the manifest, the icons, the safe area at the bottom, its own
Back where iOS gives a web app none). The gap was opening it offline, and
the owner said to do that work (`DECISIONS.md` 63).

- **A service worker that keeps one build whole.** `npm run build:site` now
  ends with `tools/precache.mjs`, which writes `_site/sw.js`: every file the
  page can ask for (56 files, 687 kB; the 512 px icons and the social card,
  775 kB the page never fetches, are left out), each with its SHA-256, the
  list's own hash naming the build. `src/ui/serviceWorker.ts` fetches them
  past the browser's cache and installs only if every file hashes to what
  the build wrote, so a deploy landing mid-install cannot leave a mixed
  copy. It then answers the page, the grid worker and the words from that
  one build, which also closes the gap `netlify.toml` worried about: a page
  kept open for days fetching this week's `gridWorker.js` or `copy/*.json`
  under last week's modules.
- **A new build takes over only between cooks** (`src/ui/offline.ts`). A
  reload mid-cook would lose the alarm (`restoreCook`), so with a cook
  running the new build waits. With none, it takes over at once on a page
  nobody has touched yet (a reload, an app just opened), and otherwise when
  the page goes out of sight; never while a second window is open. An app
  kept open looks for a new build when it comes back into view, hourly at
  most.
- **Taking it out is deleting `sw.js`.** A browser keeps a worker whose file
  is gone, so the page asks for `sw.js` itself, and on a 404 drops the
  worker and its builds and reloads from the network.
- **Only the built page has it**, named by `<meta name="service-worker">`,
  which `precache.mjs` adds; the repo root, served as is, registers nothing.
  It is a module worker; a browser that cannot start one runs online only,
  as before.
- **`test/offline.test.ts`**: which file answers which address, and
  `precache.mjs` run on a small site (what it lists, the hashes, the meta,
  the build's name changing with any file it lists and with none it
  leaves out).

**Seen working,** in the browser pane against `npm run build:site` on
localhost: the first visit installs 56 files; the next is answered by the
worker; with the server stopped, the page, Settings, `/privacy`, the 1750
words and the grid worker all load, and the social card fails as meant. A
second build, after one reload of an untouched page, took over 2 s later
and deleted the first; mid-cook it waited through a reload and a check;
on a touched, visible page it waited, and took over once the page was
hidden; with a second tab open it waited, and took over at the next reload
once the tab closed. With `sw.js` deleted, one reload left the page
uncontrolled, with no caches. The repo root registers nothing. On the
iPhone Air simulator (iOS 26.5): Safari registered the module worker and
fetched the build; added to the Home Screen as "Egg Timer" (the manifest's
`short_name`), opened as a web app; its first launch fetched everything
again (its storage is its own), and after the simulator was restarted with
the server down, it opened from the icon with the words, the odds and the
bracket drawn.

**Run:** `npm run verify`: 275 tests, all pass; the Swift copy lint; the
fixtures fresh; `swift test` 122 tests in 32 suites.

**Not verified:** a real phone; Netlify itself (whether it serves every
file byte for byte, which the install needs, and `/privacy` without a
redirect); Android; a visible page going hidden in a real tab (the pane was
hidden, so `visibilityState` was overridden by hand for that case).

## 3 October 2026: a deploy fetches only what it changed

As first built, every new build made each browser fetch all 56 files
again (687 kB), however little had changed. Now the worker copies a file
from the build before when its contents already hash to the new list's
SHA-256, and fetches the rest. Pages are always fetched: a page's
headers carry its CSP, which no file's hash covers, and a copied page
would keep the old ones. For the same reason `tools/precache.mjs` now
puts `netlify.toml` and `vercel.json` into the build's name, so a deploy
that changes only a header is still a new build; before, it changed
nothing the browser could see. `test/offline.test.ts` 3 holds that.

**Seen working,** in the browser pane, from the server's log: with
`styles.css` changed, the install fetched it, the two pages and the
worker's own two files, and copied the other 53; with only
`netlify.toml` changed, it fetched the two pages alone.

**Run:** `npm run verify`: 275 tests, all pass; the Swift copy lint; the
fixtures fresh; `swift test` 122 tests in 32 suites.


## 3 October 2026: the face of 1750, on the web

IM FELL English for the English of 1750 (`DECISIONS.md` 65, 66;
`LANGUAGE.md` §6, *The face*).

- **Chosen from the fonts' own tables** (fontTools on the Google Fonts
  files), then a specimen of catalogue strings at the app's sizes. Libre
  Caslon Text and Baskervville have no long s. Junicode has no `hist`,
  and its `hlig` is medieval. EB Garamond's `hist` is a plain
  substitution, so every final s goes long ("eggſ"). IM FELL's is
  chained: s becomes ſ before a letter.
- **`assets/fonts`**: the two TTFs from `google/fonts`
  (`ofl/imfellenglish`, commit `8d618a0`), compressed to woff2 by
  fontTools (`TTFont(path).flavor = 'woff2'`, nothing else), 93 and 97 KB,
  and the licence. The offline app precaches them with the rest. The face
  has no narrow no-break space, so the system face draws that blank.
- **`styles.css`**: `@font-face` with `font-display: swap`, and under
  `html[lang$="-x-1750"]` the family, `font-feature-settings: "liga",
  "dlig", "hist"`, no synthetic bold, and Help's `h3` in italic. The title
  page is set by longhands, since the `font` shorthand reset the features
  it inherits. The clock and the number fields keep the system face.
- **Seen in the preview pane** at 375 px, light and dark, and at 288 px
  (130% zoom): the egg page, the clause choices, Help, Settings and a
  running cook. Nothing clips. Modern English is untouched, since every
  new rule is under the 1750 `lang`.
- **Trap**: a service worker on `localhost:8080`, registered by another
  session's testing, serves its cached build to the preview pane. Use
  `127.0.0.1:8080`, a different origin.

**Not verified:** Safari, and a phone; the pane is Chromium.

## 3 October 2026: the face of 1750, on iOS

The web's face in the app (`DECISIONS.md` 65, 66): the same TTFs as
published in `ios/App/Fonts`, registered by `UIAppFonts` in `project.yml`.

- **`ios/App/PeriodFace.swift`.** `Font.custom` turns on only the common
  ligatures, so the face comes from a `UIFontDescriptor` naming `liga`,
  `dlig` and `hist` (`kCTFontOpenTypeFeatureTag`), at the size
  `UIFont.preferredFont` gives the text style for the view's Dynamic Type
  size, handed to SwiftUI as `Font(CTFont)` and cached. A DEBUG assert
  catches a wrong font name, which would otherwise fall back silently.
- **`appFont(.footnote)`** replaces each `.font(.footnote)`: the system's
  style in modern English, the face in 1750, small capitals as capitals a
  size down. The two `AttributedString` runs (the clauses, the colophon's
  name) take `Font.app(...)`. `periodFace()` at the root covers text with
  no style of its own, replacing `.fontDesign(.serif)` and the clocks'
  `.fontDesign(.rounded)` that undid it. `systemFigures()` keeps a stepped
  or typed number in the system face at the style around it. Help's
  subheads are italic in 1750, as on the web.
- **Left to the system**: the navigation bar, the segmented controls, the
  egg-size menu, the `InfoButton` symbol, the clock and the Live Activity.
- **Seen on the iPhone 17 simulator (iOS 26.5)** in 1750: the egg page,
  each clause's choices, Settings, Help and a running cook, at the default
  size, XXXL and AX-large. Nothing clips. Modern English looked as before.

**Not verified:** a device; VoiceOver, which reads the same text as before.

## 3 October 2026: results, not eggs (the `data` draft)

The owner's rule against metonyms, in 13 keys of both apps and their 1750 twins: what is kept, sent and deleted is a "result" (one cooked egg: how it was cooked and how it came out), the settings are the settings, and the rest of the cook is the rest of the cooking.
The controls lost their pronouns ("Share results", "Delete shared results"); the privacy page, swept separately, must name them as they now read.

## 3 October 2026: the random number in Settings (the `sharingid` draft)

The owner decided (`DECISIONS.md` 67) that both apps show the cook's random id, so that it can be quoted in an email asking for deletion, as the privacy page says. One new key, `share.id`, "Your random number" (1750: "Your number, drawn at random"), over the id in the sharing section, under the note of what has been sent; shown from the first time sharing is turned on until a deletion, so also while sharing is off with results still on the server.
The id is shown whole, never shortened: the email needs all of it. Fixed-width in the system face on both apps, since IM FELL's old-style 0 is an o; selectable (`user-select: all` on the web, one tap selects it whole; `.textSelection(.enabled)` on iOS). Proved with `copyLiterals --since 99572b7 sharingid` and `copySnapshot compare --draft sharingid`.

## 3 October 2026: the owner's privacy decisions (`DECISIONS.md` 67-72)

Built: the random number in Settings (above); the server files a development build's results in the open tier, as if unsigned, and the fit's pull reads every record's tier by the same rule (`countsAsGenuine`, `countedTier`), tested with a pair of synthetic attestations, development and production, under one made-up root; the privacy page names the renamed controls, says where the number is and that turning sharing off keeps what was sent; `ios/RELEASING.md` step 6 says App Attest needs no App Privacy answer of its own. Recorded, nothing built: no EU representative, the risk accepted.
Left for the owner: the retention rule, the local copy of the records after each fit, and Linked to You or Not Linked.

## 4 October 2026: iOS follows a held stepper and a drag

The owner found iOS slow to answer a change of number: the time could take
seconds to move. Measured before touching anything, on the iPhone 17
simulator (iOS 26.5, an M-series Mac), with `-perfProbe all` (debug builds,
`ios/App/Perf.swift`), which taps, holds and drags the inputs on a script and
prints when each answer reaches the screen, from a fresh install at 0 m,
1.5 L, a cold start.

**What each stage costs**, the same in both apps' cores: a solve
(`answerAt`) 13 ms in Swift and 20 ms in Node (40 and 73 ms with the heat
off); a pot's decision surface 280-340 ms in Swift and 510-600 ms in Node;
the odds profile 250-290 ms in Swift and 440-490 ms in Node. Swift's core is
the faster of the two, and it is `-O` in Debug too (`Package.swift`), so a
Release build measured the same as a Debug one to within noise, at every
step below. The physics was never the problem.

**What was slow was the coalesce.** Every change cancelled the solve in
flight and started the 90 ms wait again: a debounce, where the web's
`scheduleSolve` is a throttle. So:

| Input (scripted) | Before | After |
|---|---|---|
| a stepper tap: the time moves | 106-125 ms | 15-30 ms |
| a held stepper, a change every 100 ms for 2 s | nothing until 114-122 ms after release | every step, 17-31 ms after it |
| the slider dragged for 1.5 s | nothing until 116-130 ms after release | every ~90 ms through the drag |
| the time chosen on the new pot's surface | 770-840 ms after the last change | 650-700 ms |
| the odds shading and the advice | 1160-1260 ms | 940-1050 ms |

Debug and Release are within 5% of each other in every row, before and after.
The main actor's worst lateness was 10-20 ms in most runs, before and after,
with a lone tick of 67-204 ms in a few that did not repeat: nothing was
blocking the screen; it was waiting.

What changed (`Planner+Solve.swift`): one solve loop at a time, off the main
actor, the first solve of a burst at once and each after it at most every
90 ms. A change during a solve is taken up when it finishes, and the answer it
just got is shown meanwhile, a step behind, without the snap, which would
move the slider under a finger still moving it. The answer for where the
finger stops is applied in full, as before. The surface still waits for the
inputs to sit still for 300 ms, as on the web. While a new pot's surface and
odds are built, the shading, the direction, the bracket and the low-odds link
stay as they were (`Planner.held`) instead of going blank for that second;
what "Eggs in" starts and records still reads only this pot's own decision.

**Still there, as on the web:** a change of pot shows the mean solve's time
first and the time chosen on its surface 0.7 s later, a few seconds apart
(700 s, then 695 s, for a tap from 0 to 50 m). On a phone, slower than this Mac, that second
correction will take longer.

## 5 October 2026: the egg's shape, quantified

`tools/shape-study/RESULTS.md`, a finite-element solve on egg outlines checked
against the app's own series (0.000 s on 18 cases). The equal-volume sphere is
2-3% slow at every size and doneness (13.9 s for a 62 g jammy egg as an
ovoid), a constant fraction the fitted alpha absorbs; shape variation at a
fixed mass is about +-3-5 s; a ruler cannot recover it (+-9.5-19 s of its own
against the scale's +-2.2 s), so weighing is the most accurate input and no
shape correction is built. Side finding: the innermost white sets 70-120 s
sooner at the yolk's equator and 30-70 s later at its poles than one radius
says, which bears on the white floor, not on timing.

## 5 October 2026: back to metric keeps 1750; no "tap"; a random ID

Three owner fixes on the 0.4 line. Imperial to metric no longer takes an
English page out of the English of 1750 (`DECISIONS.md` 77; `9c9ea24`, the
`stay` draft): the language state is now only `chosen`, the `flippedFrom`
that remembered what the switch replaced is gone, and a state stored with it
still reads, so no storage key moved. Driven on the web: English, Imperial,
1750; metric, still 1750; the picker's English, modern English and metric;
an old stored state with `flippedFrom` reads as 1750 and stays there.

"Tap" as the screen gesture is out of every string (`ba30099`, the `press`
draft; `8117f9e` on the privacy page): "press" where a button needs a verb,
the button's name alone on the Lock Screen. The snapshot proof could not
read an en-US twin until now; a draft row can carry its overlay twins
(`Drafted.overlays`), so the US screens are proved too. And "Your random
number" is "Your random ID", a "cypher" in 1750, on the privacy page as
well (`8c1f397`, the `randomid` draft).

## 5 October 2026: "boil" is never a noun

The owner: "the boil", "a full boil" and "signal the boil" sound medical
(`DECISIONS.md` 78). The `boiling` draft (`89d5aa1`) rewrites eleven keys
in both apps, with the en-US twin of the Start (i) and every 1750 twin:
water "boiling hard" (1750: "boiling in earnest") for "a full boil", the
setting "Once it's boiling" for "After the boil", and "how long your water
took to boil" for "boil times", on the privacy page too (`7bf35a6`). The
1750 Lock Screen note is "my conjecture, till you tell me it boils", 40 of
its 41 characters. Kept, by the owner's call: the button's name, Full
rolling boil, and "brought to the boil" and "to the boil", which sound like
cooking. Proven with `copyLiterals --since 343fcff boiling` and the snapshot
compare over 172 states.

## 5 October 2026: the results log kept, exported, and trusted in the fit

An audit found the owner's log could be lost three ways: one record a
build could not read made both apps drop the whole log and write the store
over at once (switching a device between 0.3 and 0.4 builds could do it); a
model change never replayed the posterior; and a cook dropped on relaunch
took its egg with it. The owner decided: export, protect the log, and trust
the owner's own random IDs in the fit (`DECISIONS.md` 81, 82).

The log now loses nothing this build writes. A record that does not read is
set aside with its place among all the records (the store's `unread`) and
written back; the next build that can read it puts it back where it was,
and the posterior is replayed when the split changes. A store that does not
read at all, or whose log is not a list, is kept as stored under
`calibration.v4.unread` / `aet.calibration.v4.unread` (the newest three)
before anything is written over it; so is a cook in progress from another
build. The store keeps `MODEL_ID` as `m`, and a posterior folded under
another model, or none said, is replayed - so every existing store is
replayed once on this build. A 0.3 build still drops what it cannot read;
nothing here can reach it.

"Export my results" (the `export` draft) saves the store spliced in
character for character with whatever was kept aside: core's
`resultsFile`, twinned in Swift and pinned by `fixtures/record.json`.
Driven: on the iPhone 17 simulator, three seeded eggs exported through the
share sheet to Files as `actual-egg-timer-results-2026-10-05.json` (128 KB);
`npm run eggs -- import` refused it without an ID (sharing was never on) and
wrote 3 records with `--uid`. That store, with one record made unreadable
and a damaged copy aside, loaded on the web at port 8110: the bad record
kept in place, the other two replayed ("Learned from 2 results"), and the
web's export held the store verbatim, the unread record and the copy. On an
empty log both apps say "Nothing to export yet." The fit gives a trusted
ID's eggs full weight and never holds them out; the list is
`fit/trusted.local.txt`, gitignored. Tests: `test/record.test.ts` 1f,
3a-3a4, 3b's model change, 4d; `test/eggs.test.ts`, a round trip with no
fixture; `fit/tests/test_trusted.py`.

Left: the web still offers no question after a reload (its panel's rule);
iOS now resumes the questions when the egg is last in the log and not yet
shared, replaying the log for an egg already folded. `MODEL_ID` did not
change with the counter's physics on 3 October.
