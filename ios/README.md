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
| `section.ts` | the egg in cross-section, a tick at a time: each ring's temperature and how set; the egg the settings aim for | `createSection`, `advanceSection`, `sectionView`, `previewSection` | `Section.swift` (`EggSection`) | `section.json` |
| `sousvide.ts` | the isothermal limit | `sousVideEstimate` | `SousVide.swift` | `sousvide.json` |
| `doseGrid.ts` | the cached dose surface and its lookups | `buildDoseGrid`, `buildRequestedGrid` | `DoseGrid.swift` | `calibration.json` |
| `infer.ts` | the particle filter: prior, likelihood, fold | `createPrior`, `updatePosterior`, `probeLikelihood` | `Infer.swift` | `calibration.json`, `probe.json` |
| `record.ts` | the egg log, and the posterior as its replay; the record both apps make of a cook; what a launch keeps of the store; the calibration grid, and the filter's size and seed | `recordFor`, `parseLog`, `foldRecord`, `replay`, `loadDecision`, `calibrationGrid` | `Record.swift` | `record.json` |
| `population.ts` | the population a prior is drawn from (E7), and its centre | `parsePopulation`, `priorStart` | `Population.swift` | `prior.json` |
| `decide.ts` | the chosen time and its odds, and the nudge (E8); the key of a decision surface, every number to the bit, which the plan and both apps' caches use | `decide`, `chooseCookTime`, `hitOdds`, `nudgeSeconds`, `inputsKey` | `Decide.swift` | `decide.json` |
| `outcome.ts` | which way a miss goes, and the likely level | `predictOutcome` | `Outcome.swift` | `outcome.json` |
| `certainty.ts` | how sure, in words: very certain, a ballpark or a wild guess; the 90% interval in words; a likely time range | `certaintyAt`, `wordCertainty`, `askedWord` | `Certainty.swift` | `certainty.json` |
| `reach.ts` | the odds at every level, the shading, the advice, and the answer on screen with its time decided | `oddsProfile`, `answerAt`, `decideAnswer`, `protocolAdvice` | `Reach.swift` | `reach.json` |
| `inputs.ts` | what a cook enters and a fresh install starts from: the bounds on every number, the defaults, the egg-temperature buttons, the room the model is told about, a stored size carried into the table in use | `LIMITS`, `DEFAULTS`, `clamp`, `roomInUse`, `ambientFor`, `carrySizeIndex` | `Inputs.swift` | `inputs.json` |
| `slider.ts` | the doneness slider: its grid, the nearest label, which words can be reached, the yolk temperature asked for, and the refusal verdict | `snapUp`, `anchorNear`, `anchorReachable`, `verdictFor` | `Slider.swift` | `slider.json` |
| `texture.ts` | the texture bands, and the keys the note is said in | `textureFor`, `textureNoteKeys` | `Texture.swift` | `texture.json` |
| `boil.ts` | boil memory: a boil remembered by volume, and the estimate for a volume | `rememberBoil`, `estimateTimeToBoil` | `Boil.swift` | `boil.json` |
| `sounds.ts` | the alarm sounds: their order, the default, a stored choice read, each sound's timing | `readAlarmSound`, `alarmPeriod_s`, `alarmRepeats` | `Sounds.swift` | `sounds.json` |
| `settings.ts` | the settings both apps keep, as one value, and a stored copy read back defensively | `Settings` (`AppSettings`), `DEFAULT_SETTINGS`, `readSettings` | `Settings.swift` | `settings.json` |
| `wording.ts` | which catalogue key each part of the screen says | `phaseKeys`, `refusalKey`, `directionKey`, `clauseKeys` | `Wording.swift` | `wording.json`, `sousvideCopy.json` |
| `units.ts` | Metric and Imperial: steps, bounds, the round trip | `measureFor`, `display`, `parse`, `quantityText` | `Units.swift` | `units.json` |
| `language.ts` | the switch into the English of 1750 | `languageAfterFlip`, `languageAfterPick` | `Language.swift` | `language.json` |
| `running.ts` | a running cook: its phases (`phaseAt` over its `Deadlines`, the pull's grace, the slow hob, the counted cooling and which probe readings are taken); its start and an append-only log of everything since, folded into the cook as it stands; the egg and pot from the choices; the plan derived from them (the ramp, the slow hob and its memo, the time decided, the deadlines, the cooling, how sure); the record's facts and the boil to remember; each move the cook makes, each a log entry; two copies of one cook taken up; a stored cook read defensively, its log folded again | `phaseAt`, `cookSetupOf`, `replan`, `eventsDue`, `writeEvents`, `startCook`, `withBoil`, `withOut`, `corrected`, `startCorrected`, `takeUpEvents`, `cookFactsFor`, `boilToRemember`, `readRunningCook` | `Running.swift` | `running.json` |
| `step.ts` | the running cook as one state machine: an event in, the cook, its plan, what it waits for and the effects out (persist, alarms, ring, log, forget, send) | `step` | `Step.swift` | `step.json` |
| `readout.ts` | what the readout says while a cook runs: keys and the numbers they take | `readoutAt` | `Readout.swift` | `step.json` |
| `share.ts` | sharing's kept state: an id, a stored copy read defensively, each step (on, off, forget, delete, an answer); what a sender makes of the endpoint's answer, and when it stops waiting | `shareReply`, `shareGivesUp`, `readShareState`, `turnedOn`, `answered`, `nextToSend`, `isUid` (the server's too) | `Share.swift` | `share.json` |
| `stores.ts` | every store either app keeps: its name, its key on each app, and the format written inside it; a stored value read only in its own format | `STORES`, `stamped`, `inFormat` | `StoreRegistry.swift` | `stores.json` |
| `newer.ts` | which build may write: versions ordered, and the verdict on the newest-version mark (`DECISIONS.md` 100) | `compareVersions`, `writerCheck` | `Newer.swift` | `newer.json` |
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

## The app's logic, file by file

Above the core, the package has two libraries of the app's own (REFACTOR-0.5
1.2), so that what the app does with the core is run by `swift test` as well,
on a Mac, with no simulator. `ios/App` keeps the screens and what only an
iPhone has.

| library | file | what it is |
|---|---|---|
| EggTimerShared | `Copy.swift` | the catalogue as loaded, `tr`; the widget links it too |
| EggTimerShared | `CookActivity.swift` | the Live Activity's contract; an `ActivityAttributes` on iOS |
| EggTimerApp | `Services.swift` | the protocols below, and where the app puts each at launch |
| EggTimerApp | `AppClock.swift` | cook time (`CookClock`); a Debug build's fast and stepped clock |
| EggTimerApp | `Store.swift` | `Stores`, the one door to the store (`KeyValueStore`), its guard, the settings and the pans |
| EggTimerApp | `Calibration.swift` | the posterior and the log, kept (`Calibrations`) |
| EggTimerApp | `DecisionGrids.swift` | the decision surfaces and odds profiles, built off the main actor and kept |
| EggTimerApp | `Planner.swift`, `SolveLoop.swift`, `Learning.swift` | the settings as one value and the choices made from them, the idle screen's solve, the learning from each egg |
| EggTimerApp | `Cook.swift` | the running cook as core's `step` runs it: its effects carried out (the store, alarms, ring, log), what it waits for built, the card |
| EggTimerApp | `AppModel.swift` | the three together: Eggs in, Start again, the buttons, a change in hand committed first |
| EggTimerApp | `Edits.swift` | corrections while a cook runs |
| EggTimerApp | `Presentation.swift`, `SousVide.swift` | words for a value, and the sous-vide start |
| EggTimerApp | `LanguageChoice.swift`, `AlarmSoundChoice.swift` | the language and the alarm's sound, kept |
| EggTimerApp | `Screenshots.swift`, `Perf.swift` | Debug only: launch arguments, the taps of `-uiDo`, the debug log |

What the logic reaches outside itself, it reaches through a protocol, so a
test can put a fake there: `Services.alarm` (`AlarmScheduling`; the app's
`Alarm`), `.ringer` (`AlarmRinging`; `Ringer`), `.sharing` (`ResultSharing`;
`Sharing`), `.card` (`LockScreenCard`; `LiveActivity`), `.announce`
(VoiceOver), and `.grids`, `.language` and `.alarmSound` (`DecisionSurfaces`,
`LanguageChoosing`, `AlarmSoundChoosing`), whose own are in the library;
`AppClock.source` (`CookClock`); and `Stores.store` (`KeyValueStore`), which
takes a write only with a `Stores.Pass` that only `Stores` can make.
`ActualEggTimerApp.init` fills them before anything runs.

Not moved, because each needs a framework only an iPhone has: `Alarm`
(UserNotifications), `Ringer` (AVFoundation, UIKit), `Sharing` (App Attest),
`LiveActivity` (ActivityKit), `ResultsExport` (the share sheet's
Transferable), and the views.

`Tests/EggTimerAppTests` drives them on a clock the test moves, with every
service a fake: a cook from Eggs in to Done through `Cook`, the pull rung in
the app with no notifications allowed, a relaunch picking up a stored cook
past its pull, Start again logging an unanswered egg before the stored cook
is cleared, nothing written under a newer build's mark, and every write of a
whole cook through `Stores` (the runtime twin of `test/iosStores.test.ts`).

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
- **One screen, open to correction.** Setting up and boiling are one layout
  (`UI.md` §3; `DECISIONS.md` 91, 96 to 98): the slider and the setup
  sentence stay on screen while the egg cooks, showing the cook's own
  choices, and every clause, the slider and Settings' pot rows correct it -
  "it was always like this", the cook planned again from its start, the
  alarms and the Lock Screen card following. `Edits.swift` decides when a
  change is committed (on release of a drag or a held − or +, after a 1.5-s
  settle of a tap). Beside the sentence, `EggSectionView.swift` draws the egg
  in cross-section (`EggSection` in core; `DECISIONS.md` 52): the egg aimed
  for while idle and while a change is in hand, the live egg while it cooks,
  and the egg as it ran at Done, the web's egg drawn the same way.
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
only the calendar arithmetic stays in the app's `SousVide.swift`. The core carries
the decision and the catalogue carries the sentence. `StartChoice` is an app type for the same reason, which is why
`StartMode` in the core is still a pair.

### It asks how the egg was

At PULL the app asks the cook to say when the eggs came out - "They're in the ice
bath", "They're under the tap", "They're out" - as the web app does, and the record
calls that tap a measured pull; with no tap the grace runs out and the pull is only
assumed. After the cook it asks which YOLK the cook got (runny, soft, jammy, fudgy,
hard) and how the WHITE was (runny, tender, firm), both every time and neither required. That is
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

`Sharing.swift` does what the web's `src/ui/share.ts` does, over the same
state in core (`Share.swift`, `src/core/share.ts`: what is kept, how each step
moves it, and how a damaged copy is read) (E6;
INFERENCE.md §7, COLLECTIVE.md §1): off until the cook turns it on in
Settings, where the consent sits beside the switch; then every final egg in
the log, the ones from before included, goes to the endpoint on the web app's
site, in order, each copy carrying the cook's random id; and Delete what I've
sent deletes everything under every id this phone has used, asking again at
each launch until the server confirms. It is the app's only network call:
`URLSession`, HTTPS, to `actualeggtimer.netlify.app` (a debug build can point
it at `npm run serve:dev` with `-shareServer`).

What iOS has that the web cannot is App Attest (`DECISIONS.md` 60). The first
time an id sends, the phone makes a key in its Secure Enclave and has Apple
attest it, bound to the id (`clientDataHash = SHA256(uid)`); every egg then
carries an assertion over its body, and the server files it in the attested
tier, which outweighs the web in the fit (`DECISIONS.md` 2). No entitlement is
set: a development build uses Apple's sandbox, TestFlight and the App Store
use production, and the server takes both, but files a development build's
eggs in the open tier, as if unsigned (`DECISIONS.md` 68): only a build
from TestFlight or the App Store counts as genuine. The simulator cannot attest at
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

A deadline no notification holds (refused, unanswered, or not taken) is rung by `Ringer.swift` while the app is on screen — the cook's alarm sound plus a vibration, through the silent switch, up to 40 s or until a touch — which is what "keep the app open" promises; `deadlineToRing` in EggTimerApp decides, under `swift test`.

The alarm sounds (`DECISIONS.md` 101) are files, `App/Sounds/alarm-<sound>-<moment>.caf`, one per sound and moment, which the notification plays once and `Ringer` loops. They are rendered from the web's `src/ui/alarmSounds.ts` by `npm run sounds` (macOS; `tools/sounds.ts`), never edited by hand: IMA4 at 22.05 kHz, whole periods of the pattern, under the 30 s past which iOS plays its default sound instead. Which sounds there are, their order, the default and their timing are `AlarmSound` and its functions in EggTimerCore, held to `src/core/sounds.ts` by `fixtures/sounds.json`; the cook's choice is `AlarmSoundChoice.swift`.

Both fire at **`.timeSensitive`** interruption level, which is what gets them
through a Focus mode. An egg is time-sensitive in the literal sense the name was
coined for: thirty seconds late is a different egg. That level needs the
`com.apple.developer.usernotifications.time-sensitive` entitlement, which needs
signing, which needs the Apple Developer Program — see **Signing** below.
Unsigned simulator builds carry no entitlement and fall back silently to the
default level, which is the right failure: quieter, never wrong.

`Cook.swift` runs the cook as core's state machine (`step`, `Step.swift`): it
holds a `CookState` (the `RunningCook`, its start and the log of what it was
told and observed, its plan and the lean), and feeds `step` each thing that
happens - a tap, a correction, a tick, a surface landing - one at a time, off
the main actor, each with its own moment. It carries out what the step asks
(write the cook down, hold the alarms the plan sets, ring where no
notification already rang, stop a ring, remember the boil, log the egg's
record, forget the cook, send what is final), builds what it waits for (its
pot's surface, the calibration before this egg and a surface on it, for a
correction after the pull), and keeps the Live Activity with the plan. The
readout and the buttons are core's `readoutAt` at the frame's moment. Every
phase is derived from the plan's deadlines and the clock (`phaseAt`) rather
than counted down, so a ticker that stops — backgrounded, locked, or simply
busy — cannot make the egg wrong. The ticker counts nothing down: it sends a
tick only when the clock has something to decide (the events it writes, the
slow hob's next lengthening, a cook too old), and pushes the card's changes
(at Done it goes on every 5 s, for the hour the egg stays open); the screen
redraws from its own `TimelineView`. A cook that ends before its record can
be made waits off the screen, stored, until it is logged and forgotten. This
is the native form of the same discipline the web app uses when it recomputes
from timestamps on `visibilitychange`.

A cook in progress is written to `UserDefaults` (`cookInProgress.v4`, through
JSONEncoder so every double comes back to the bit) and restored on launch. From
the pull it carries the plan as it ran (core's `asRan`), so the record and Done
are the cook as it ran whatever a later plan reads.
Without that, a force-quit or a crash leaves the alarm with the system and the
Live Activity on the Lock Screen while the app itself reopens to an idle screen —
which teaches the user to distrust an alarm that was, in fact, perfectly
correct. A restored cook's alarms are set again from its plan, since a slow hob
planned later pulls at another moment. A cook core calls too old (`cookTooOld`:
an hour past its end, or two hours still heating) is ended instead of
restored, as Start again ends it, its alarms cancelled and its card ended;
that egg has been eaten, and if it was cooked through it is logged. A
cook this build cannot read is dropped, its alarms cancelled and its card
ended. One an earlier build wrote (0.3's and 0.4's `cookInProgress`, an
earlier 0.5 build's `cookInProgress.v2`) is deleted at launch with every
other key the app no longer uses (`Stores.retiredKeys`), its notifications
left to ring and its card ended to go at its own end. A card is read in this
build's shape only (EggTimerShared's `CookActivity.swift`): one 0.3 began, with its
description in the attributes, is not read, and lasts as long as the system
lets any card.

## The Live Activity

`Widget/CookLiveActivity.swift` is the feature that makes a native egg timer
worth having rather than merely correct. The notification says *when*; the Live
Activity says *how long left* without unlocking anything, which is the question
you actually have while standing at the hob with wet hands.

Every countdown is `Text(timerInterval:)`, drawn and ticked by the system from
two absolute dates. Nothing in the widget runs once a second and nothing in the
app has to wake up to keep it honest — the same trick as scheduling the alarm at
an absolute date, applied to the display. The app pushes a new state only when
what the card shows changes: the **stage**, a deadline that moved, or the cook's
description, which is in the state so a plan made again updates the card in
place. While the slow hob has lengthened the guess, the heating card counts the
time heated up (`countsUp`) rather than down to a pull that keeps moving.

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

## The fast clock and the scripted checks

Every read of the time a cook depends on goes through `AppClock.swift`. A
Release build is the system's clock and nothing else. A Debug build takes
`-clockAt <epoch s>` (cook time at launch) and `-clockSpeed` (60 runs it sixty
times as fast; 0 freezes it). A clock so launched can be stepped while the app
runs: a line `<n> <at> <speed>` written to `Library/Caches/aet.clock` in the
app's container moves cook time to `at` and runs it on at `speed`, and the
debug log says `clock` with its `n` once it has. Under a running clock the
notifications fire at the scaled interval; under a frozen one, which reaches
no deadline by itself, a day later than that, so they stay pending and cover
their deadlines. The Lock Screen card, which the system counts on its own
clock, gets the real moments the deadlines come: it reaches zero with the app
but counts real seconds (8:00 to go reads 0:08 at ×60). Sharing sends
nothing, and a record made under it carries ` (debug clock)` after its
`appVersion` and is never sent, nor anything logged after it, until Forget
everything.

```sh
npm run ios:e2e                    # every scenario, about ten minutes
npm run ios:e2e -- relaunch-*      # some; --list names them
```

`tools/iosE2e.ts` (TypeScript, compiled with the other tools by
`tools/build.mjs`, which `npm run ios:e2e` runs first) builds Debug, makes a
simulator of its own, and for each
scenario installs afresh, drives the app by launch argument (`-uiScreen
heating`, `-uiDo boil@300,out@pull+3,again@cooled+5`; the taps of
`Screenshots.swift`, never screen coordinates, the one screen's among
them: `eggsIn@launch+1`, `set:size=3@30`, `drag:0.3/0.1@pull-60` and
`release`, `start:+3`, `stillIn`, `stillOut`, `open:settings`), terminates
and relaunches it, and asserts on the debug log (`Library/Caches/aet.log`,
one event a line, each a JSON object, `{"t":<cook time, epoch s>,"ev":"plan",
"pull":…}`, its fields typed as `Screenshots.Event` declares them: phases, plans, the stored cook, the egg log, alarms scheduled, read back and
delivered, rings, cards with their description, and `settled` when the cook
has nothing under way; for the one screen also where the slider, the
sentence and the egg sit, which egg is drawn, each change in hand and each
correction committed, what the readout and the slot say, each frame of the
readout with the moment it was drawn for, whether "Most likely" shows) and on
the prefs plist through plistlib. A scenario at the
largest text size passes UIKit's own `-UIPreferredContentSizeCategoryName
UICTContentSizeCategoryAccessibilityXXXL`. It deletes the device at the end. A tap's settle is
the host's 1.5 s, as a finger's would be; the cook's clock stays frozen
through it.

The clock is frozen at every moment a scenario checks, and stepped from one
to the next: launched 14 s into the pull's 20-s grace, the app is 14 s into
it however long the launch took. The script waits for the log to say what
happened, never for the host's seconds to pass, so a slow or loaded machine
takes longer and checks the same; a wait's timeout (`AET_E2E_WAIT`, 60 s)
only says when to give up. After every step it waits for `idle` with the
step's number (`Screenshots.idle(after:)`): the cook has ticked at the new
moment and after the last tap, `-uiDo` has nothing more due, nothing is under
way in the cook, the planner or a change in hand, and the page has been drawn
again at the moment. So a check that something did not happen (no ring, no
plan, nothing committed) is made once the app is done, not after a second of
the host's that a slow runner can spend before the app has begun; a step to
where the clock already stands (`tick`) is how a scenario waits for that
without moving it. What the screen says is read the same way, after a
`tick`. Moments the clock was stepped to are checked to a
millisecond, a deadline planned again at a relaunch to a second. Notifications
are checked as scheduled, for which cook time, and pending; one scenario
(`asleep`) leaves one to the system, at ×1 with the app killed, and gives it
15 s past its moment to be delivered. Not in `npm run verify` (it needs Xcode
and a simulator); CI runs it after the iOS build, `ios-e2e` in
`.github/workflows/verify.yml`, not yet blocking.

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
