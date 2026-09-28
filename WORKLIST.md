# Actual Egg Timer — cleanup worklist (review of main @ 055bd4e, 28 Sep 2026)

This comes from seven parallel read-only reviews:

- web core and tools
- web UI
- the iOS app
- Swift parity, tests and fixtures
- docs
- build and hygiene
- interface copy

Every "dead" claim was checked by grep across `src/ test/ tools/ ios/`. Items marked ✔ were also re-checked by hand.

Baseline, all green:

- `npm test`: 244 tests, 243 pass, 1 todo (infer 5b).
- `validate`: 28/28.
- `swift test`: 107 + 10 tests.
- Committed fixtures are byte-identical to a fresh `npm run fixtures`.

## 0. Ground rules for the implementing agent

- **Stage files by name.** Another agent (the QA agent) commits in this tree at the same time. Never `git add -A`. Check `git log --oneline` before and after each commit.
- **Both apps, every time.** A core change lands in TS first. Regenerate fixtures with `npm run fixtures`, and never hand-edit them to make Swift pass. Then port to Swift and run `npm run conformance`.
- **Do not push.** Pushing is the owner's call.
- **Update PLAN.md in the same commit as the work** (its own rule). History goes to LOGBOOK.md, not PLAN.
- **Every owner decision in §1 is answered.** Work in the suggested order at the end.
- **Copy (§9): apply it all as ONE named draft** (owner, 28 Sep), then hand it to the owner to review on a phone. See §9 for how.
- **One logical change per commit.** After each: `npm test`, `npm run check`, and `npm run conformance` if core or fixtures changed.

---

## 1. Owner decisions (all answered 28 Sep; nothing is gated)

| # | Question | Unblocks |
|---|---|---|
| D1 | **ANSWERED 28 Sep: no build newer than 19 Sep ran outside the owner's devices. "Kill em all."** §4.1 is unblocked in full. | §4.1 |
| D2 | **ANSWERED 28 Sep: delete `saferLevels` and everything that serves it.** | §4.2 |
| D3 | **ANSWERED 28 Sep: drop `interval`, `stillLearning` and `loss` from `Decision`.** | §4.3 |
| D4 | **ANSWERED 28 Sep: drop all three groups from Swift** (science checks, measure-not-weigh, old readouts). TypeScript keeps them. | §4.6 |
| D5 | **ANSWERED 28 Sep (checked by running the model): `sousvide.warn` is false.** The model sets the white after about 22.7 h at 58 °C (white-bound; the dose grows without limit). The Help text overclaims "real": 58 °C is a 22 K extrapolation, and kitchen sources say about 57 °C leaves the white milky. Rewrites are in §9.1. | §9.1 |
| D6 | **ANSWERED 28 Sep: "go back".** Choosing Weighed restores the last weighed mass, as the web's "Measured below…" does. | §2.2 |
| D7 | **ANSWERED 28 Sep: yes, rename "kitchen" to "settings" and finish the key renames** ("kitchen was a terrible name"). | §5.9 |
| D8 | **ANSWERED 28 Sep: apply all of §9 as one named draft; the owner reviews on a phone and says what to put back.** | §9 |

---

## 2. P0 — bugs

**DONE: 2.1 ✔ iOS records a Custom egg temperature as "room".**
- Where: `ios/App/Cook.swift:318-323`, `eggFrom: ticket.setup.eggStartC == StartTempPresets.fridgeC ? .fridge : .room`. The comment ("Fridge or room are the only two") went stale when Custom was added. `Kitchen.swift:891` (debug seed) repeats it.
- Fix: use `ticket.startTemp`. Then delete the app's `StartTemp` enum (`Kitchen.swift:28-30`), which duplicates core `EggFrom`, and use `EggFrom` throughout.
- Done when: a Custom cook's record says `custom`, and the web (`app.ts:869`) and iOS agree.

**DONE: 2.2 ✔ iOS "Weighed · {mass}" shows one mass and selects another.** Owner, 28 Sep: **go back** to the last weighed mass.
- Where: `SetupSentence.swift:346` labels the item with `weighedMassG`, but `Kitchen.chooseSize(-1)` (`Kitchen.swift:64-67`) first overwrites `weighedMassG = eggMassG`.
- Example: weigh 62 g, pick Large, then pick "Weighed · 62 g", and you get 68 g.
- It is also lost across a relaunch: `Store.save` persists `eggMassG`, not `weighedMassG` (`Store.swift:105`).
- Fix:
  - Delete the overwrite in `chooseSize`, so choosing Weighed restores `weighedMassG`.
  - Persist `weighedMassG` under its own UserDefaults key, and restore it on launch. No migration is needed (D1). If the key is absent, fall back to the default mass.
  - Keep saving `eggMassG` only if something still reads it; the downgrade write goes with D1.
  - Fix `chooseSize`'s doc comment ("moves nothing"), which is now false.
  - Moving the slider still switches to Weighed and updates `weighedMassG`.
- Done when:
  - weigh 62 g → pick Large → pick "Weighed · 62 g" gives 62 g;
  - it still gives 62 g after a relaunch;
  - the label always equals the mass selected.

**DONE: 2.3 ✔ Web: a grid or profile build that throws on the main thread never settles.**
- Where: `src/ui/calibration.ts:620-624`. `onThisThread` resolves inside `setTimeout`. If `buildHere` throws, the promise hangs, `decisionBuilds` / `profileBuilds` keep the key, and `app.ts` `profilesAsked` never clears it, so that pot never gets a direction.
- Fix: share one `runJob(job)` module between `gridWorker.ts:50-61` and `buildHere`. Reject on throw, and clean up the maps in `.finally`.

**DONE: 2.4 Web: while a cook runs, the display and re-solve read live `settings`, not the cook's ticket.**
- Where: `render` (`app.ts:1146,1175-1270`) reads `settings.startMode/afterBoil/cooling`. `timeToBoil_s` / `rampSeconds` (`app.ts:437-446`) and `resolveDuring` (`app.ts:1447-1453`) also use live `currentEgg()` / `buildSetup()`.
- How it breaks: a second tab changes settings, then the first tab reloads mid-cook. The labels and the boil-tap re-solve now describe a different pot than the ticket and machine.
- Fix: when not IDLE, take every value from `ticket.setup`, `ticket.egg` and `machine`. Change the signature to `resolveDuring(ticket, boil_s)`.

**DONE: 2.5 ✔ Web: lower-casing catalogue text breaks words.**
- Where: `app.ts:1390`. `spoken.sousVide` lower-cases the headline, so "Last Wednesday" is announced as "last wednesday". `app.ts:460` and `986` do the same for `{limit}` and `{doneness}`, iOS mirrors it (`Kitchen.swift:1027`, `SetupSentence.swift:250`, `CookLiveActivity.swift:36,89`), and `toLowerCase()` ignores locale.
- Fix: reword the templates so the inserted word can keep its capital, or add `*.inline` lower-case keys. At minimum use `toLocaleLowerCase(activeLocale())`.
- LANGUAGE.md:105-107 calls this debt.

**DONE: 2.6 ✔ `tools/copy-snapshot.html:75` waits for `#donenessValue`, which no longer exists.**
- Effect: every `openApp` burns its full 5 s timeout, so the web half of the copy proof "boots" by timeout.
- Fix: wait on `#donenessPeak`, and drop the E1-era `#whiteFeedback` / `#whiteNote` probes (lines 124-151).

**DONE: 2.7 Clearing a measurement box on the web switches to a hard-coded egg.**
- Where: `readInputs` falls back to literal 62 g and 137 mm (`app.ts:1762,1764`). The width box (1766) keeps the current egg instead.
- Fix: fall back to the current egg (as width does), or ignore a blank field.

**DONE: 2.8 Web routing runs twice on back/forward.**
- Where: `app.ts:1087-1088` listens to both `popstate` and `hashchange`.
- Fix: keep one, or make the second return early when the view hasn't changed.

**DONE: 2.9 Minor iOS: `LiveActivity` operations are fire-and-forget and unordered.**
- Where: unstructured `Task`s at `Cook.swift:460,744-750`. The restore task (`Cook.swift:604-617`) and the `pulledOut` read-back (`:450-452`) don't check `generation`, so a cancel during them can be undone. For example, `alarmAuthorized` gets set again after a reset.
- Fix: route all activity calls through one actor or serial stream, and guard with `gen == generation`.

---

## 3. P1 — conformance gaps (logic both apps must agree on, living outside core)

`policy.ts` says that anything both apps must agree on belongs in core with a fixture. These items don't follow that rule yet.

**3.1 The solve → refusal → snap-and-retry rule is written three times.**
- Where: `app.ts:503-523` (`answerFor`), `Kitchen.swift:565-594` (`solve`), and `tools/decide.ts:70-79` (`meanSolve`, which also skips the odds profile).
- Fix: add a core `answerAt(c, egg, setup, level, profile, snapRetry) → {solution, verdict, level}`, pin it in `reach.json`, and have all three call it.

**3.2 Which refusal and phase text to show is chosen separately in each app.**
- Duplicated key selection:
  - `refusalText`: `Kitchen.swift:1025-1063` vs `app.ts:458-480`
  - `Direction.key` and `whiteAtRisk`: `Direction.swift:37-58` vs `src/ui/outcome.ts:42-58` ("word for word", unfixtured)
  - phase label, subline and idle hint: `ContentView.swift:320-393,1022-1028` vs `app.ts:1170-1200`
  - `pulledKey`: `ContentView.swift:714-720` vs `app.ts:1239`
  - `clauseTexts`: `SetupSentence.swift:189-222` vs `app.ts` `clauseTexts`
- Fix: move each into core as a pure `…Key(…) → CopyRef` and fixture it. The precedents already exist: `pullLineKey`, `textureNoteKeys`, `sousvideCopy.json`.
- Why it matters most here: the iOS app has **no test target** (`project.yml testTargets: []`), so this is the only way its choices get tested.

**3.3 The slow-hob revision constants are literals in both apps.**
- Where: `app.ts:1832-1834` and `Cook.swift:226-228` (45 s, 60 s, 10 s).
- Fix: move them to `policy.ts`, its Swift twin and `policy.json`.

**3.4 `Cook.Phase` duplicates core `Phase`.**
- Where: `Cook.swift:32-43`, with two hand mappings at `:265-281` and `:645-652`. The tap-out override also lives outside core.
- Fix: use `EggTimerCore.Phase`, add `outAtS` to `Deadlines` / `phaseAt`, and fixture it in `policy.json`.

**3.5 `Forecast` (`Direction.swift:14-35`) is a field-by-field Codable copy of core `Outcome`, with `lean` stored as a String.**
- Fix: make `Outcome` and `Lean` Codable/Equatable in core, then delete `Forecast`.

**3.6 Swift never checks the record's identity constants.**
- `priorID` and `recordVersion` (`Record.swift:22,28`), which are stamped into every iOS record, are never compared with `record.json`'s `prior` / `version`.
- `kernelDiscount` is not in `calibration.json.likelihood`.
- Fix: add the `#expect`s, and add `KERNEL_DISCOUNT` to the fixture (keep it exported in TS).

**3.7 App-used Swift paths that no fixture covers.**
- `decidedSolution` and `carriedSolution` (`Decide.swift:281,289`) are not fixtured, and `decidedSolution` has no TS test either.
- Fix: add a `decided` row per `decide.json` case, plus one `carriedSolution` row with `lean_s ≠ 0`.

**3.8 The `shadingOf` threshold `0.05` is unnamed and never exercised.**
- Where: `reach.ts:258`, `Reach.swift:216`. No fixture profile has a best below 0.05.
- Fix: name the constant, put it in `reach.json`, and add a case below it.

**3.9 Numbers both apps agree on that have no name.**
- `textureFor`'s 71/82 and 58/63/68/73 (`policy.ts:302-307`).
- `ambientFor`'s 15 (`policy.ts:94`).
- `calibrationGrid`'s factors, which `tools/decide.ts:211,402` repeat as `ALPHA_DEFAULT * 0.55` / `* 1.8`.
- Fix: name all of them.

---

## 4. P1 — dead code and back-compat to remove

**4.1 Back-compat for formats that never left the dev devices.** UNBLOCKED: the owner said "kill em all" (D1).

The live site, `2f341b4` of 19 Sep, IS in the wild. Its storage formats are the one exception:
- `aet.calibration.v2`
- the 19-Sep settings keys
- the 19-Sep cook key

Keep only what makes a browser that last ran the live site start cleanly: delete or ignore those keys, never crash, never mis-read. Anything written only by a build after 19 Sep can go without a trace.

The owner's own phone and browsers may hold E1-era data (a log with `'set'` white answers, a v3 store, old ticket fields). The owner has accepted losing it. Even so, decoding must fail safe: skip unreadable records, or start from the prior. It must never crash or refuse to launch.

Put one LOGBOOK line on the decision: "owner, 28 Sep: no post-19-Sep build shipped; all interim back-compat removed".
- Web ticket and machine:
  - Bump `COOK_KEY` to `aet.cook.v2` (`store.ts:27`). Also update `tools/copy-snapshot.html:109`, which reads the key by name.
  - Make the ticket fields required.
  - Delete the fallbacks at `app.ts:2222-2248`, `app.ts:984`, `machine.ts:275-285`, and `Ticket.peakYolk_C: number | null`.
- Web calibration:
  - Drop the v3 ("E1") replay path: `E1_KEY`, the `'replayed'` branch of `decodeKept`, `calibration.ts:54-66,354-365,421-423`, and tests 3b and :245 in `record.test.ts`.
  - Add `aet.calibration.v3` to `SUPERSEDED_KEYS`.
  - **Keep the v2 path**: the live site writes v2.
- The E1 `'set'` white answer and `whiteOffered: false` records: `infer.ts:85,381-385`, `record.ts:160-170,313,317`, `Infer.swift:47`, and `fixtures.ts:1116-1117`.
  - Decide before the first push. `record.ts:259-260` freezes v1 fields forever once shipped.
- iOS:
  - The optional ticket fields and their "saved before…" fallbacks: `Cook.swift:73-113,302-308,357`, the hand-written `Saved.init(from:)` (`Cook.swift:517-552`), and `SetupSentence.swift:164-170`.
  - Settings downgrade writes and migrations: `Store.swift:54-58,68-78,84-97,112-113,122-123`.
  - Calibration v1–v3 migrations: `Calibration.swift:41-51,133-137,206-210,217-220,248-249`.
- `CookActivity.Stage.done`:
  - It is never sent: `Cook.swift:733-734` builds it only to branch on it.
  - Have `activityState` return nil at done, and have `pushActivity` check `phase(at:) == .done`.
  - Delete the case and its branches: `CookActivity.swift:57,66-70,80,84-85` and `CookLiveActivity.swift:154-156,167-168,179`.

**4.2 Delete `saferLevels` and friends.** UNBLOCKED: owner, 28 Sep. About 165 lines in each core, plus fixture, tests and tool.
- Code: `reach.ts:381-544`, `Reach.swift:344+`, `SaferConformance.swift`, `test/safer.test.ts`, `fixtures/safer.json`, `fixtures.ts:1571-1652`, and the `safer` section of `tools/decide.ts:529-596`.
- It is also 23 s of `npm test`'s critical path (tests 3 and 7).
- Delete, don't keep:
  - the whole list above;
  - its PLAN.md "Frozen core API" entries, and the "core's `saferLevels` stays" lines (PLAN:926-928, `Direction.swift:7-9,54-56`, `src/ui/outcome.ts:31-35`);
  - `outcomeAtLevel` and `offeredPositions`, if nothing else calls them (grep after removal).
- Drop §6.5 (the safer test split); it becomes moot.
- LOGBOOK: one line on the decision.

**4.3 Drop `Decision.interval`, `stillLearning`, `loss`.** UNBLOCKED: owner, 28 Sep.
- Remove them from `decideAt` (`decide.ts:364-382`), along with `stillLearning()` and `STILL_LEARNING_HALF_WIDTH_S`.
- Mirror the change in `Decide.swift`, `decide.json`, `DecideConformance`, `test/decide.test.ts` and `tools/decide.ts` (`learning`).
- Fix the comments that describe "still learning" as on screen: `decide.ts:36,70-81`, `infer.ts:672`, `app.ts:200-202`.
- Keep `predictCookTime` and `expectedLoss`, since `chooseCookTime` uses the latter. Only the unconditional per-decision calls go.
- Before deleting `STILL_LEARNING_HALF_WIDTH_S`, grep it. If the E6/E8 "still learning" condition in INFERENCE.md cites it, leave a note there that it is to be computed on demand from `predictCookTime`.
- Done when: `decide.json` has no interval, stillLearning or loss fields, and `npm run conformance` is green.

**4.4 iOS dead code.**
- `Cook.Ticket.peakWhiteC` and `logNominalTarget` are written and never read (`Cook.swift:52,56-59`). `Kitchen.logNominalTarget` (`:379-382`) exists only to fill them.
- Derive `eggGrams`, `coldStart` and `cooling` from `egg` / `setup` instead of storing them.
- `LanguageChoice.current` (`:56-57`) has no callers.
- `LiveActivity.finish()` and `endAll()` have identical bodies (`LiveActivity.swift:48-61`). Keep one.
- `Calibrations.params` is a pure alias for `calibrationParams`. Delete it.
- `Cook.coolingSeconds` and `pullGraceSeconds` (`Cook.swift:220-221`) alias core constants. Use the core names.

**4.5 Web dead code.**
- `UNITS_FLIP_EVENT`, `UnitsFlipDetail` and `announceFlip` form a round-trip within one file, so a units change saves, relabels and recomputes twice (`app.ts:382,2112`, `units.ts:56`, whose comment is false).
  - Fix: call `setLanguage(languageAfterFlip(...))` directly from `onUnits`.
- `copy.ts`: `ACTIVE_LOCALE`; `switchCopy` (an alias of `loadCopy`); `timeOfDay`'s unused `withSeconds` parameter; the `languageOf` re-export (line 26).
- `store.ts:22-24` re-exports nothing uses.
- Unused exported types: `LoadPath`, `Decoded`, `MachineEvent`, `SousVideCopy`, `StartTempMode`, `StoredCook`.
- `learn()` returns an `Outcome` no caller reads, and its name clashes with core `Outcome`. Make it `Promise<void>` and rename the interface (e.g. `LiveFold`).
- `index.html`:
  - Dead ids: `adviceLink`, `afterBoilField`, `donenessLabel`, `unitsField`, `languageField`, `titlePage`.
  - Dead classes: `field`, `field--slider`, `direction__line`.
- `styles.css`:
  - `.prow:first-child` (502) matches nothing.
  - `.slider__bracket[hidden]` (381) duplicates the global `[hidden]` rule.
  - `.foryou h3 … !important` (695): use `#help .foryou h3` instead.
  - Two different disabled opacities (99 vs 856): pick one.
  - `#help p.aside a` (669) is subsumed by `#help p[data-copy-links] a`.
- `clock.ts`:
  - Delete the `WakeLock*Like` shims (40-54); `lib.dom` has them.
  - Delete the `webkitAudioContext` fallback (122-127).
  - `try { void held.release() }` cannot catch a rejection. Use `.catch(() => {})`.
  - `scheduleBeep` pushes every oscillator onto `ringing`, which only empties on stop.

**4.6 Drop Swift API with no app caller.** UNBLOCKED: owner, 28 Sep.

How to do it:
- Delete each function from Swift, along with its Swift tests and the fixture sections only Swift reads (`core.json`'s `erfcTheta`, `oneTermTheta`, `biotNumber`, `boilingPointApprox`, `saltBoilingElevation`, `zFromActivationEnergy`, `diffusionTime`, the egg-from-diameter rows, and `calibration.json`'s `yolkProbs`/`whiteProbs`/`predictive` where only Swift reads them). Stop `tools/fixtures.ts` generating those sections.
- TypeScript keeps them all: `tools/validate.ts`, `core.test.ts` and the web's measure-by-width input use them.
- `ScenarioTests.swift` builds eggs from `minorDiameter_m`. Switch the scenarios to mass (emit `mass_kg` in `scenarios.json`), then delete `eggFromMinorDiameter` too. If that proves awkward, keep it `internal` and say why in a comment.
- In TS, have `predictOutcome` call `yolk/whiteAnswerProbabilities` instead of repeating the arithmetic inline.
- Done when: `grep` for each name under `ios/EggTimerCore/Sources` finds nothing (or only the one internal survivor), and `npm run conformance` is green.

The candidates:
- Measurement API (iOS only weighs eggs): `Geometry.eggFromMinorDiameter`, `eggVolumeFromMinorDiameter`, `diffusionTime`, `Defaults.customMinorMM`, `Limits.girthMM` / `minorMM`, `Quantity.girth` / `.width`.
- Science-validation API: `Sphere.erfcTheta`, `oneTermTheta`, `biotNumber`, `boilingPointApprox`, `saltBoilingElevation`, `zFromActivationEnergy`.
- Inference helpers: `yolkAnswerProbabilities`, `whiteAnswerProbabilities`, `posteriorMeanOffset`, `posteriorAlphaRelSd`.
- Copy: `Message.templates` and `placeholders(_:)` (`EggTimerCopy/Copy.swift:68,289`). Delete these two regardless of D4.
- In TS, `predictOutcome` computes the same numbers as `yolk/whiteAnswerProbabilities` inline (`outcome.ts:12-14`). Have it call them, or delete them.

**4.7 Over-exported symbols (tidy only).**
- TS: drop `export` from
  - `solutionAt`
  - `rampTemperature`, `dipMagnitude`, `standingTemperature`
  - `probePossible`, `recordEggOf`, `recordSetupOf`, `recordLogTarget`, `GridPolicy`
  - `INCH_MM`, `FOOT_M`, `imperialWaterUnit`
  - `COUNT_MAX_DECIMALS`, `TIME_SPACE`, `OWN_CONVENTION`
  - `LOG_WHITE_TARGET`
  - `WEEKDAY_KEYS`
- Swift: drop `public` from the intra-module helpers listed in the parity review:
  - `Protocols.*Temperature`
  - `imperialWaterUnit`, `isWithin`, `volumeKey`
  - `cookTimeForLogWhiteDose`, `sliderFromYolkDose`, `oddsAtLevel`
  - `decisionGridRequest`, `decisionApplies`, `solutionAt`
  - `probePossible`, `recordEgg`, `recordCookSetup`, `recordLogTarget`
  - `countMaxDecimals`, `timeSpace`, `ownConvention`, `weekdayKeys`

**4.8 `tools/copyLiterals.ts` base-ref mode.**
- Steps 2–3 (lines 420-486, `RESTRUCTURED`) are dead by the header's own account (lines 10-11).
- Remove them. Keep step 4 ("no Swift literal is copy") as a standing lint, with an npm script (see §7.6).

---

## 5. P2 — structure

**5.1 Split `src/ui/app.ts` (2263 lines).**
- The problem: it builds `dom` and reads storage at import time (`app.ts:79-197`), so no test can import it.
- Move `dom` construction and loading into `boot()`.
- Extract these modules, following its own section banners:
  - `info.ts`: the (i) component, 776-823
  - `views.ts`: routing, 1019-1090
  - `sentence.ts`: Clause, SetupFacts, `clauseTexts`, `renderSentence`, 825-1017
  - `slider.ts`: 635-737 and 2005-2019
  - `ticket.ts`: Ticket, `withTimeToBoil`, `restoreTicket`, 255-299 and 2194-2263 (pure)
  - `learned.ts`: 1489-1552
  - `feedback.ts`: 1554-1700
  - a pure `phaseView(machine, ticket, now) → {label, digits, subline, spoken, primary, hint, secondaryVisible}`, lifted out of `render()`
- Add tests for the now-importable pure pieces.

**5.2 Split `render()` into `renderIdle` and `renderRunning`.**
- The 200 ms ticker currently re-renders the hidden idle UI five times a second: the sentence, the setup, the scale's `mask-image`, and `renderOdds`, which forces layout via `offsetHeight` (`app.ts:1339-1341`).
- `renderSousVide` also re-runs `renderSentence` (`app.ts:1131,1360`).

**5.3 Collapse three flags into one feedback state.**
- `feedbackGiven`, `answered` and `restored` (`app.ts:236-253`, derived again at 1276 and 1634).
- Replace them with one persisted `answers: 'none' | 'live' | 'beforeReload'`.

**5.4 Small web consolidations.**
- One `retime(boil_s)` in place of the copy-pasted pair at `app.ts:1846-1847` / `1961-1962`.
- Keep `lastPanStart` in memory instead of `saveSettings` re-parsing storage on every save (`store.ts:210-214`).

**5.5 Split `ios/App/ContentView.swift` (1033 lines).**
- `ReadoutView`
- `PhaseActions`
- `FeedbackPanel`
- `DonenessControl`
- Move ticket construction (`:427-466`) into `Cook.Ticket.init(kitchen:solution:)`.
- Move the Cook↔Kitchen wiring in `onAppear` (`:123-138`) into a small `AppModel`.
- Expose `Kitchen.shownForecast` and `Kitchen.adviceWanted` rather than re-deriving them three times (`:312-318,455,923-926,1014-1019`).

**5.6 Split `ios/App/Kitchen.swift` (1121 lines).**
- `DecisionGrids.swift` (918-1014)
- `Kitchen+Learning.swift`
- `Kitchen+Solve.swift`
- `Presentation.swift` (refusalText, units, clock, region)
- Factor out the input snapshot shared by `recompute` / `currentSolution` and the duplicate apply-and-ask tails (`:445-453` vs `:459-467`).
- Move the class doc comment (`:6-25`), which is currently attached to `enum StartTemp`.

**5.7 iOS: throttle the idle `TimelineView`s.**
- Both tick every second when idle (`ContentView.swift:63,75`).
- In sous-vide, `kitchen.sousVide` (a bisection) runs about three times per tick (`:194,475,955,986`).
- Fix: use a coarser idle schedule and compute the copy once per tick.

**5.8 Split `tools/fixtures.ts` (1963 lines, 16 outputs) into `tools/fixtures/<name>.ts` plus a shared helpers module.** While there:
- Move `mkdirSync('fixtures')` (line 1658) before the first write (1235).
- Delete the identity function `round()` (137-141, 94 calls).
- Call `calibrationParams` / `calibrationDoneness` instead of hand-coding them with a literal `0.05` (1322-1324, 1422-1424).
- Dedupe `DECIDE_GRID_SPEC` against `coarseDecisionGrid`.
- `probeFixture.ts` copies the calibration egg, grid and lookup cases from `fixtures.ts`. Share them.
- Use one metadata convention (`about`) instead of mixing `$comment`, `generator` and `about`.

**5.9 Rename the internal "kitchen" to "settings".** UNBLOCKED: owner, 28 Sep.
- **Careful on iOS.** The Swift `Kitchen` class (`Kitchen.swift`) is not the settings page. It is the app's model: every input, the solve, and the learning. `Settings` is already taken there (`Store.swift`'s `Settings.save`, `SettingsView`), so don't rename it to Settings. Rename it as part of the §5.6 split, to something like `Planner`, and rename `kitchen.` call sites to match.
- **Optional, for clarity:** rename iOS `Settings` (the UserDefaults load/save helper in `Store.swift`) to `SettingsStore`.
- **The catalogue.** Its notes also say "kitchen" (`en.json` 175, 216, 217, 228, 230, 243), and so do UI.md and LANGUAGE.md. User-facing strings that mean the cook's real kitchen, e.g. "a new kitchen" in `learned.forget.more`, are correct and stay.
- Rename the hash, ids, `View` and CSS section. Keep `#kitchen` as an alias.
- Finish the key renames (`controls.cooling.*`, `controls.afterTheBoil.*`).
- Fix the `controls.thermometer` note (`en.json:243`), which names the wrong key.

**5.10 One `tools/common.ts`, or `test/support.ts` imported by tools too.**
- `setupOf`: 10 copies, and `fixtures.ts` vs `tools/decide.ts` have **different defaults** under the same name.
- `rng` / `draw`: 4 copies of the xorshift from `infer.ts`.
- `recordOf` / `recordAt`, `knowing`, `gridFor`, `logTarget`.

**5.11 Core helpers to deduplicate.**
- `logYolkTarget(level)`: `Math.log10(donenessFromSlider(level).yolkDose_min)` appears 17 times in 13 files.
- `decisionAtLevel`, shared by `oddsAtLevel` / `outcomeAtLevel` (`reach.ts:108-114,459-466`).
- `coolingMedium_C(cooling, ambient)`: `policy.ts:519`, `record.ts:233`, `protocol.ts:165-175`.
- One exported `normalCdf` (`infer.ts:325`, `outcome.ts:113`), plus a `withUnrelated(p)` helper (11 hand-written copies).
- One private bisection in `doseGrid.ts:119-145`.
- `isUS(region)` (3 sites).
- Cache `Intl.NumberFormat` / `DateTimeFormat` per (locale, decimals) (`format.ts:95-104,130`).

**5.12 Move the grid-request types into `doseGrid.ts`.**
- `GridRequest`, `GridPolicy` and `buildRequestedGrid` live in `record.ts:491-520`.
- `buildDoseGrid` takes nine positional arguments. Make it take a `GridSpec`.

**5.13 Separate wording from physics.**
- `sousvide.ts:87-157` (`longDuration`, `startPhrase`, `weekdayKey`): move to a copy-facing module so the physics file doesn't import `copy.ts`.
- `copy.ts` `Message`: use a discriminated union instead of nullable `text` / `count` / `forms`, which removes the casts at 131, 144, 156 and 220.

**5.14 Merge EggTimerRing into EggTimerCore.**
- It is one enum and one function. Move `deadlineToRing` and `RingDeadline` into `Policy.swift` beside `phaseAt`, and move `RingTests` over.
- Delete the product, both targets, and the `project.yml:62-63` dependency.

**5.15 Swift naming drift from TS**, which breaks grep-based parity checks.
- Renames: `gridRequest`→`gridRequestFor`, `recordEgg`→`recordEggOf`, `recordCookSetup`→`recordSetupOf`, `holdTime`→`holdTimeForDose`.
- Also `languageOf`'s home module.

**5.16 Split `tools/copyDraft.ts` (2985 lines, 20 drafts).**
- Separate the mechanism (~100 lines) from the data (`tools/drafts/<name>.ts`), and drop drafts nobody will re-prove.
- **Bug:** `draftFor` (2940-2946) silently falls back to the latest draft when a name is mistyped. Make it throw.

**5.17 Stringly-typed cooling and a duplicated parser (iOS).**
- `Alarm.schedule(cooling: String?)` has unused defaults. Pass `Cooling`.
- Decimal-comma parsing is duplicated (`ContentView.swift:696-697`, `Controls.swift:104-105`). Extract a `parseTyped(_:)`.

---

## 6. P2 — tests and fixtures

**6.1 Shrink fixture churn.** Fixtures total about 90k lines.
- `copy.json`: 499 of 830 rows are no-argument keys that restate `en.json`, so every wording edit rewrites the fixture (34 commits so far). In `copyRows` (`fixtures.ts:1706-1742`), emit only rows with arguments, plurals or fallback.
- `units.json` `display[].rendered`: 409 English renders. Drop them, and the render at `UnitsConformance.swift:109`.
- Particles: write one line per particle, emit a set only when it changed, and point to duplicate states by step index. Several states are exact duplicates: `calibration.json` prior equals `updates[0]`; `record.json` `fromBase.final` equals `steps[9]`, and so on. Update `RecordConformance.swift:260-274` and `CalibrationTests.swift:248-291` to match.
- `decide.json`: emit the prior as `{count, seed}`, as `safer.json` does, instead of 200 literal particles.

**6.2 Replace the permanent todo `infer.test.ts:442` (5b).**
- It prints as a failure with a stack trace on every run.
- Replace it with a characterisation test asserting the known limit (e.g. `jammyMove > 0.6*softMove`), with a LOGBOOK reference.
- The owner already decided to leave the behaviour as it is (PLAN:176-183).

**6.3 `Fixtures.swift`.**
- Every missing key calls `fatalError`, which kills the whole run. Make the helpers `throws` and use `try #require`.
- `list()` should reject empty arrays: 129 loops have only 20 guards, so they can pass vacuously.
- Fix the "35 kB" comment.
- Drop the per-file wrappers.
- Move the duplicated helpers into it:
  - `expectClose` (12 copies)
  - a CookSetup parser (7 copies, all silently `?? .hold`; make it fail on unknown)
  - a posterior parser (5 copies)
  - `profileOf` (2 copies)

**6.4 Tests named after phases.**
- Rename by behaviour: "E1's 'set'", "Phase C recovery", "stored before E4", and so on.
- Renumber `policy.test.ts`, where 6c and 6d come after 6h.

**6.5 Rebalance `npm test` wall time.**
- It is bound by `safer.test.ts`, 31 s.
- Moot: §4.2 deletes `safer.test.ts`, which takes the critical path to about 17 s, set by `decide`.

**6.6 Remove index-hardcoded "slow in debug" tests.**
- `ReachConformance.swift:90-92` and `SaferConformance.swift:85-93` hard-code `[0,1,2]` and `count == 3`.
- The package builds `-O` now, so iterate over the fixture instead.

---

## 7. P1 — build, CI, hygiene

**7.1 Add one gate.**
- Add `"fixtures:check": "npm run fixtures && git diff --exit-code -- fixtures/"`.
- Add `"verify": "npm run check && npm test && npm run fixtures:check && cd ios/EggTimerCore && swift test"`.
- Change `conformance` to fail on stale fixtures.
- Add a macOS GitHub Actions workflow (`npm ci && npm run verify`, Node from `.node-version`), or a pre-push hook until pushing resumes.
- Fix README.md:849's "what CI would run".

**7.2 Enforce purity with tsconfig.**
- Add `tsconfig.core.json` (`src/core/**`, `lib: ["ES2022"]`, `types: []`, `noEmit`) and run it in `check`. Today `DOM` is visible to core.
- Add `"types": []` to `tsconfig.site.json` so Node globals can't reach the browser build. Both are checked to pass with 0 errors today.

**7.3 tsconfig.**
- Switch to `"module"/"moduleResolution": "NodeNext"`; it has 0 errors today. `bundler` accepts extensionless imports that then 404 in the browser.
- Turn on the free flags: `noFallthroughCasesInSwitch`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `allowUnreachableCode: false`, `allowUnusedLabels: false`.
- Fix `store.ts:23` (`export type`) and `copySnapshot.ts:70`, then add `isolatedModules` and `erasableSyntaxOnly`.
- Drop `declaration: true`.
- Leave `noUncheckedIndexedAccess` off: 711 hits, mostly false positives.

**7.4 Add `netlify.toml` security headers.**
- Headers: a strict CSP (`default-src 'self'` …, `frame-ancestors 'none'`, `object-src 'none'`), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- The page has no inline script or style, so a strict CSP costs nothing. Verified: one module script, one same-origin worker, same-origin `copy/` fetches.
- Mirror them in `vercel.json`, or note there that it has none.

**7.5 Clean builds.**
- `build:site` should start with `rm -rf _site`.
- `test` should start with `rm -rf dist`; otherwise a deleted test keeps running from `dist/`.
- `.claude/launch.json` should build before serving `_site`.

**7.6 Missing npm scripts.**
- Add `copy:literals` and `copy:snapshot`. They are cited about 30 times in the docs and currently depend on a prior `tsc`.
- Complete README "Running it", which is missing `check`, `fixtures`, `conformance`, `decide`, `serve:site` and the copy proofs.

**7.7 Move test data out of `copy/` so it stops shipping.**
- Move `copy/surfaces.json` and `copy/en-x-1750.spelling.json` to `test/data/`. Both currently ship to the web and both iOS bundles.
- Update the 5 references, and drop the "not a catalogue" filters (`fixtures.ts:1724-1728`, `copy.test.ts:31`, `en1750.test.ts:61-63`).

**7.8 Head and manifest.**
- `theme-color` `#111214` matches neither theme. Use two `media`-scoped metas: `#0c0d0f` for dark, `#f7f7f8` for light. Match the manifest.
- The square 1200² `og:image` is used with `summary_large_image`, so it gets cropped. Switch to `summary`, or generate a 1200×630 image in `build-icons.sh`.
- Add a manifest `id` and a maskable icon.
- Unify the three descriptions (wording in §9.6).

**7.9 Version drift.**
- `package-lock.json` says `0.1.0` while `package.json` says `0.2.0`. Run `npm install --package-lock-only`.
- Add a test asserting `project.yml` `MARKETING_VERSION === pkg.version`.
- Cross-reference the team ID between `ExportOptions.plist:21` and `project.yml:28`.
- Bump `@types/node` (22 vs runtime 26).

**7.10 `.gitignore`.**
- Replace lines 1-62, GitHub's Xcode template (CocoaPods, Carthage, fastlane).
- Add `.DS_Store` and `.swiftpm/`, which are currently ignored only by the owner's global ignore.
- Remove the duplicate `.build/`.

**7.11 Minor build items.**
- `design/build-icons.sh`: add `cd "$(dirname "$0")/.."`.
- Optional: an `oxipng` pass (`icon-512.png` is 310 KB).
- Local only: `ios/build/` holds 588 MB of stale output from 18 Sep.

**7.12 `Package.swift:31` `-O` unsafe flag.**
- Keep it.
- Extend the comment: it is only acceptable because the package is a local path dependency, and it gives up core debugging and unoptimised test coverage.
- Fix the header's "the physics, and nothing else".

**7.13 Optional: Swift formatting.**
- Add `.editorconfig`, plus `.swift-format` with `swift format lint -r ios/` in `verify`.
- Skip ESLint; tsc covers it once §7.2–7.3 land.

---

## 8. P2 — comments and docs

**8.1 Comments that narrate history instead of describing the code.**
- About 170 references to plan-phase labels (E1, F2…), plus "used to…", "owner, 28 September" and "before E4" stories.
- Heaviest in:
  - `src/ui/calibration.ts` (26)
  - `src/core/record.ts` (18)
  - `ios/App/Calibration.swift` (17)
  - `app.ts`, `infer.ts`, `Kitchen.swift`, `Cook.swift`, `Record.swift`
- Rule: keep the invariant and the why, and move the story to LOGBOOK.
- Full site lists are in the review notes. For iOS:
  - Kitchen.swift 14-20, 275-281, 550-560, 599-609, 639-646
  - Cook.swift 16-22, 65-70, 97-99, 177-183, 207-219, 241-253
  - ContentView.swift 269-276, 395-401, 416-426
- For the web:
  - app.ts 284-287, 484-491, 625-627, 967, 1125-1130, 1196-1197, 1312-1320, 1466-1468, 1539-1541, 1958-1960
  - store.ts 7-11, 258-263
  - machine.ts 26-29, 192-194
  - calibration.ts 9-21, 54-65, 250-254, 565, 656
  - outcome.ts 31-35
  - gridWorker.ts 4-8
- Do this after §4, since many of these comments die with the code they describe.

**8.2 Comments that are now false (fix now).**

| Where | What's wrong |
|---|---|
| `Kitchen.swift:1099-1104` | Says ".unitsFlipped: nothing observes it"; `LanguageChoice.swift:42` does |
| `SousVide.swift:14-18` | Says the copy lives in the app; it is in core now |
| `CookActivity.swift:6-8` | Says it imports only ActivityKit |
| `store.ts:267` | Names `isStaleCook`, which doesn't exist |
| `record.ts:503` | Names `recordOutcome`, which doesn't exist |
| `copy.ts:231-234` | Its example is the old "±{spread}%" string |
| `doseGrid.ts:46`, `fixtures.ts:345` | Say "21 x 36"; it is 21×32 |
| `fixtures.ts:12-40,300,509` | Header says "Two files" (there are 16), and a scenarios note is stale |
| `copyDraft.ts:4-44` | Draft list is missing 5 |
| `Calibration.swift:149-155` | Duplicated doc comment |
| `EU_LARGE` (`fixtures.ts:257`, `validate.ts:9-10,77,482`, README:570) | It is a 62.3 g reference egg, not the app's 68 g EU Large. Rename it |
| `SCAN_STEP_S` | Means 30 s in `solve.ts` and 4 s in `decide.ts`. Rename one |
| `format.ts:57,162` | Invisible U+202F / U+00A0 literals, and a `c === TIME_SPACE` branch that maps a char to itself. Use `\u` escapes |

**8.3 Docs that contradict the code (fix values).**

| Where | Fix |
|---|---|
| README.md:520-542 | The §7 table isn't what `validate` prints, and the "altitude row does not reproduce / 9.2" paragraph is false (the target is 8.21 and it passes). Replace with validate's real rows |
| PLAN.md:734-799 | Superseded constants and targets (`TAU_REF` doesn't exist; the hob table contradicts validate). Move to LOGBOOK, and delete README.md:510-514 |
| PLAN.md:807-808 | Invariant 2 ("no null") is false; core uses `null` throughout. Restate the rule actually followed |
| PLAN.md:15-17 | Swift count omits the Ring target (117 / 31) |
| PLAN.md:834 | "README §10" should be §9 |
| PLAN.md:1009-1011, 1055-1056 | Quote superseded copy. Name keys instead |
| UI.md:340-342 et al. | "Kitchen" / `controls.pan` should be "Settings" / `controls.settings` |
| UI.md:438 | `odds.info` is retired |
| UI.md:487-489 | `-noAlarmPrompt` "not traced" contradicts PLAN's "not reproduced". Replace both debug lists with a pointer to the `Screenshots.swift` header |
| UI.md:288 | `aria-describedby="donenessValue …"` is stale |
| LANGUAGE.md:1300-1309 | Key counts are wrong (331 / 330). State the invariant instead |
| INFERENCE.md:130-131 | `P_DISAGREE` should be `UNRELATED` |
| INFERENCE.md:287-291 | "iOS still records modern" is already fixed |
| README.md:1188 | Points to real-egg bugs "in PLAN.md"; they are in LOGBOOK:195 |
| README.md:743 | "weight, girth or width": iOS takes weight only |
| ios/README.md:149-157, 296-297 | "eggs in the pan", "Two behaviours" followed by three, and "ticker only redraws" (false) |

**8.4 Restructure the doc set.** Target ownership:

| File | Owns |
|---|---|
| **CLAUDE.md** (new, ~80 lines) | The agent rules now scattered through the docs: stage explicitly; never push; both apps and TS first; fixtures never hand-edited; `src/core` invariants; PLAN in the same commit and counts only in PLAN's status line; the copy workflow (named draft in copyDraft, `copyLiterals`/`copySnapshot` proofs, `surfaces.json` budgets, 1750 twin); the owner's copy rules; "support burden is not a constraint"; iOS gotchas (`xcodegen` after adding a file, debug launch args, the Slider ignores synthetic drags, `simctl defaults` isn't the app's) |
| **PLAN.md** (≤ ~200 lines) | Status line, next steps, the **single** owner queue (today it is in 5 places), open items, and one QA list gathering LOGBOOK's 19 "Not verified" blocks. Move the Phase E/C "Measured" blocks (some numbers exist only there), the standing-method narrative (a 4th copy of README §7), the Frozen API dump (missing all of `policy.ts`; replace it with a module → Swift twin → fixture table in `ios/README.md`), and the answered-decision lists. |
| **DECISIONS.md** (or INFERENCE §11 extended) | Every owner decision, numbered, dated, with its commit. Merges PLAN:896-933, LANGUAGE §8 and INFERENCE §11. |
| **UI.md** (~250 lines) | One current spec for both apps. §1, §3–§6, the per-pass narratives, "Kept, and why" (every item in it is retired) and the retired-key lists go to LOGBOOK. |
| **LANGUAGE.md** (about half) | Keep §2 architecture, a short "Copy rules" section (from §3's criteria, first person, owner's rules), §4 units, §5 languages and §6 1750. Delete §3's draft tables and the "one wording per meaning" proposal (~600 lines; about 75 references to keys that no longer exist); `copyDraft.ts` and git hold them. Collapse §1 and §7. |
| **INFERENCE.md** | Design plus as-built model facts. Collapse the §8 "Playing safe" section (~75 lines, partly in the present tense about deleted code) to 3 sentences. |
| **README.md** | Science and validation. §11.5: move "Swift port is complete" to ios/README; reword the `predictCookTime` item (it's a choice now); add the real gaps (untested card ending and running sentence, the web's accepted 90 g hole). |
| **LOGBOOK.md** | Takes everything moved above, telling each retirement story **once**. Today "oddsTenths/stillLearning", play-safe and the odds line are each told 5–8 times. Add the missing entry for `31a1ee1`. |

---

## 9. Interface copy: apply as one draft, then the owner reviews on a phone

The owner decided on 28 Sep: apply everything in §9.1–9.6 as one draft, then the owner reviews it in place and says what to put back.

How:
- **One named draft** in `tools/copyDraft.ts`, e.g. `plain`, following the existing workflow.
- **Both apps**, plus the **1750 twins** trimmed in proportion.
- **Surface budgets:** check each string against `copy/surfaces.json` and make the drafts fit.
- **Prove it** with `copyLiterals --since <base> plain` and `copySnapshot compare --draft plain`.
- **Regenerate fixtures.**
- **Commit the §9.1 factual fixes separately, first**, so they survive whatever the owner reverts from the rest.
- **Keep what the owner has already approved.** Rows marked owner-approved in LANGUAGE.md (e.g. `idle.welcome`, the `alarm.pull.*` bodies, `alarm.cooled.body`, `activity.note.estimate`) stay unless §9 flags a clear problem. For the two owner-approved cooking hints in §9.2, trim rather than delete, and list them for the owner.
- **Hand over a before/after list** of every changed key, grouped by screen, so the owner knows where to look on the phone.
- The full proposed wording is in **Appendix A** at the end of this file. Where this review drafted wording, treat it as a starting point: re-check each string against what the code does. The review misread `help.odds.aside` once already.

The main problems:

- **(i) paragraphs have become essays.** 13 of 16 are over 40 words, averaging about 65, against UI.md §7's "short enough to read standing at the hob".
- **They explain the mechanism instead of what it means for the cook.**
- **Habitual "not X, but Y".** About 11 strings.
- **The same thing said twice on one screen.** 5 cases.
- **Slips out of the "I" voice.** 7 strings.
- **About 10 concepts have several wordings.**
- **Several strings are false against the code** (§9.1).

Present each change to the owner in place on a phone. The review holds full before/after tables, with word counts.

### 9.1 Factual fixes: the text is wrong against the code

| Key | Problem | Proposed |
|---|---|---|
| `sousvide.warn` | Says the white "won't set, however long you leave it". The model sets it after about 22.7 h, which is what the headline shows. | "At {bath} the white takes most of a day to set, if it sets at all. I'm built for boiling water, and I'm not reliable below {floor}. Use the pan." |
| `help.unsure.sousVide` | "The very long times are real" overclaims a 22 K extrapolation. | Keep the first sentence, then: "I estimate the white takes most of a day to set that cool, if it sets at all." |
| `sousvide.note.whiteBound` | "white still not set, yolk creamy" sits under an eat-now headline, so it reads as the finished egg. | Describe the egg at the time given, e.g. "yolk creamy, white only just set". Check `yolkBound`'s "yolk set, white still not" the same way. |
| ✔ `help.learn.p1` | Says your *answers* teach how fast your stove boils. That comes from the Full rolling boil tap. | "From your answers I learn how you like your yolk and how your eggs cook; from your tap on Full rolling boil, how long your water takes to boil. A probe reading teaches me fastest. Every question is optional." |
| ✔ `readout.restored` | "keep this tab open" doesn't bring back an alarm that died with the page; "deadlines" is in-house jargon. | "I picked this cook back up after a reload. The times are right, but I can't ring for it: watch the clock." |
| `help.odds.p1` | "All of it narrows"; only the bracket does. | "The bracket narrows as I learn." |
| `feedback.invite` | "teach me your kitchen"; LANGUAGE.md itself dropped "kitchen" because the app doesn't learn a kitchen. | "…your taste and your eggs." |

Also for the sous-vide rows:
- Mirror them in `copy/en-x-1750.json` (lines 197 and 296). Suggested 1750 text: "At {bath} the white takes the better part of a day to set, if it sets at all. I was made for boiling water, and below {floor} I am not to be trusted. Use the pan." For the help: "By my reckoning, so cool, the white takes the better part of a day to set, if it sets at all."
- Fix `README.md:666-669` and `LANGUAGE.md:524`, which quote the old warning.
- Regenerate `fixtures/copy.json`.

Keep `help.odds.aside` as it is (owner, 28 Sep). "Three times as bad as a yolk a little too firm" is true, since the loss is P(soft) + P(firm) + 3·P(runny white). Naming "firm" is deliberate: leaning long trades a firmer yolk against a runny white.

### 9.2 Duplicates on one screen

- `action.hint.cookingBoiling` and `action.hint.cookingStanding` repeat their phase labels in both apps. These two are owner-approved (F2), so ask before cutting them.
- `action.hint.whiteNeverSets` sits beside `refusal.whiteNeverSets`. Proposed: hint → "nothing to start".
- `controls.eggFrom.hint` and `.more` both say "pick Custom".
- `controls.measure.legend` and `.hint` repeat each other.

### 9.3 Worst (i)s, to trim first

| Key | Words now → proposed |
|---|---|
| `controls.cooling.more` | 96 → 55 |
| `afterTheBoil.more` | 87 → 58 |
| `eggFrom.more` | 85 → 25 |
| `thermometer.more` | 79 → 58 |
| `readout.sub.coldAssumes.more` | 72 → 52 |
| `start.more` | 72 → 51 |
| `water.more` | 72 → 42 |
| `heating.more` | 64 → 46 |
| `outcome.learning` | 65 → 26 |
| `eggsInPan.more` | 62 → 49 |
| `learned.forget.more` | 55 → 43 |
| `egg.more` | 52 → 32 |
| `outcome.bracket` | 51 → 37 |
| `altitude.more` | 49 → 29 |
| `language.more` | 41 → 27 |

- Help:
  - `help.how.p1`: drop "I don't use a rule of thumb".
  - `help.how.aside`: drop "Technically:".
  - `help.learn.aside`: drop "cloud of guesses"; use the owner's "I use [SMC](…)" pattern.
  - `help.learn.title`: "What I learn".
- Keep the 1750 twins proportionate: cut their added end-morals in `help.how.p1`, `help.how.p2`, `help.learn.p1` and `help.odds.p1`, and trim them wherever the modern text is trimmed.

### 9.4 Voice

- `learned.forget` / `learned.confirm.title`: "Forget what it learned" should become "Forget what's learned". It is held in F2; ask the owner.
- `feedback.thanks`: "Thanks — I'll use that next time." The owner approved that direction; check it fits the 36-character budget.
- `controls.eggFrom.hint`: "I assume {fridge} for a fridge and {room} for a room. Pick Custom if yours differ."
- `readout.alarm.failed`: "I couldn't set the alarm — keep the app open".
- `readout.alarm.denied`: "notifications are off — keep the app open".
- `controls.units.period`: "I can also write Imperial in the English of its day."

### 9.5 One wording per meaning

| Concept | Use | Instead of |
|---|---|---|
| The boil tap | "tap Full rolling boil" | "tap the boil", "tap when it does"… |
| Boil memory | "how long your water takes to boil" | "how fast your stove boils water", which implies a stove model that doesn't exist |
| Heat-off method | "heat off, lid on", always in that order | "burner" and "left to stand", which is README jargon; this includes the `setup.start.*Standing` clauses |
| Ice cooling | "ice bath" | "ice water" |
| Pull moment | "Eggs out — now" | `readout.phase.pull` "Out of the water — now" |
| Yolk target | "peak yolk" on labels; `activity.target` → "peak yolk {yolk}"; "hottest", not "warmest" | — |
| Spelling | "kitchen scales" everywhere | — |
| Mute pair | "Sound on / Sound off" | — |

### 9.6 Head and manifest descriptions (outside the catalogue)

- The three current descriptions all differ. They use jargon ("denaturation kinetics") and "not from a recipe".
- Proposed meta, twitter and manifest description: "A boiled-egg timer that works out the time from how heat gets into your egg, counts the cooling, and learns how you like your yolk."
- Proposed og description: "Recipes say 'N minutes after the water boils'. This works the time out from your egg, your water and how you cool it, and says how sure it is."

---

## Suggested order

1. §2 bugs.
2. §7.1–7.3: the gate and tsconfig, so everything after is checked.
3. §4.
4. §3.
5. §8.2–8.3.
6. §5 and §6.
7. §8.1 comment sweep.
8. §8.4 doc restructure.
9. §9: the §9.1 factual fixes can go any time; the rest as one draft, handed to the owner for phone review.

---

## Appendix A — proposed wording for §9, by key

These are drafts from the copy review. Check each against what the code does before applying.

### (i) disclosures

| Key | Proposed |
|---|---|
| `controls.cooling.more` | Out of the water, the yolk keeps cooking for a few minutes. An ice bath stops that soonest, so it allows the softest yolks; a cold tap is nearly as good. On the counter the egg barely cools, so the softest yolks are out, and how much more the yolk cooks is hard to predict. |
| `controls.afterTheBoil.more` | Keep boiling: the water stays at a full boil until the eggs come out, and the amount of water hardly matters. Heat off, lid on: once the eggs are in, the water finishes them as it cools. It saves energy, but the amount of water sets the time, and too little won't finish the job, so measure it. |
| `controls.eggFrom.more` | Fridge eggs are the most predictable: a fridge is much the same every day, a room isn't, and every degree moves the time a little. |
| `controls.thermometer.more` | When the cooling countdown ends, the middle of the yolk is at its hottest, and I'll ask for one reading. Push the tip to the very middle and tell me the highest number you see: anywhere else, or later, reads lower. That one reading teaches me how fast your eggs heat. I don't ask when the eggs go on the counter. |
| `readout.sub.coldAssumes.more` | It's how long this much water has taken to boil before, from your taps on Full rolling boil. I go by the amount of water, not the pot; for an amount I haven't timed, I estimate from the nearest. Tap it again today and I'll correct the time while the eggs cook. |
| `controls.start.more` | Boiling water: lower the eggs into water at a full boil. They peel more easily. Cold water: eggs in a cold pan, heat on, and tap Full rolling boil when it boils. Counting the wait, they're done sooner. Sous-vide: I'll tell you when you should have started, usually a while ago. |
| `controls.water.more` | Not counting the eggs. It matters most with the heat off, when the water's own heat cooks the eggs: more water stays hot longer. With the heat on it matters a little. I also remember how long each amount takes to boil. |
| `action.hint.heating.more` | Tap when the whole surface is heaving and stirring doesn't calm it, not at the first bubbles. I time the rest of the cook from your tap: a few seconds either way is fine, a minute early isn't. Until you tap, the countdown is a guess. |
| `outcome.learning` | Answer both questions after each egg, and tap Full rolling boil when the water rolls. A probe reading, if you have a probe, teaches me fastest. |
| `controls.eggsInPan.more` | Cold eggs cool boiling water as they go in, and more eggs cool it more, so it takes longer to come back to the boil, or with the heat off never does. On a cold-water start it makes no difference: your tap on Full rolling boil already counts them. |
| `learned.forget.more` | I forget every egg you've told me about and every boil you've timed, and start again from eggs in general. A wrong answer or two washes out after a few more eggs, so this is for a new stove or a new kitchen. |
| `controls.egg.more` | A bigger egg takes longer: the heat has further to go. One size on the box covers quite different weights, so if you can, weigh an egg and type in its weight. |
| `outcome.bracket` | The bracket under the slider shows where your yolk will probably land. To play safe against a soft yolk, slide right until the bracket's left end is somewhere you'd be happy; against a firm one, slide left. |
| `controls.altitude.more` | Higher up, water boils cooler, so eggs cook more slowly, noticeably so up a mountain. Tell me roughly how high you are and I'll use the boiling point shown. |
| `controls.language.more` | English as Samuel Johnson wrote it. Switching to Imperial turns it on and switching back turns it off; pick English here to keep Imperial in today's English. (Check this against the actual flip rule in `languageAfterFlip`.) |

### Help

| Key | Proposed |
|---|---|
| `help.learn.p1` | From your answers I learn how you like your yolk and how your eggs cook; from your tap on Full rolling boil, how long your water takes to boil. A probe reading teaches me fastest. Every question is optional. |
| `help.odds.p1` | Replace "All of it narrows as I learn." with "The bracket narrows as I learn." |
| `help.how.p1` | I work out how heat soaks into your egg and how far the yolk and white set, then pick the time that leaves the yolk as you asked. |
| `help.how.aside` | I model [heat conduction](…) through a sphere the size of your egg, and protein setting with the [Arrhenius equation](…). Every constant and its source is in the [README](…). Keep the existing URLs. |
| `help.learn.aside` | I use [sequential Monte Carlo](…), with an [ordered probit](…) for too soft, just right and too firm. I keep every egg, so after an update I relearn from all of them. [The design](…). Keep the existing URLs. |
| `help.learn.title` | What I learn |
| `help.reliable.forYou` | For these eggs |
| `help.reliable.cooling` | An ice bath is the most predictable, and a cold tap nearly as good. On the counter the yolk keeps cooking, so for soft eggs use ice. |
| `help.how.p2` | "Ice water stops that soonest" becomes "An ice bath stops that soonest". |

### Sentences, sublines and hints

| Key | Proposed |
|---|---|
| `readout.restored` | I picked this cook back up after a reload. The times are right, but I can't ring for it: watch the clock. |
| `action.hint.cookingBoiling` | Owner-approved; trim, don't delete: "at {boiling} until the eggs come out". |
| `action.hint.cookingStanding` | Owner-approved; trim, don't delete: "heat off, lid on". |
| `action.hint.whiteNeverSets` | nothing to start |
| `refusal.whiteNeverSets` | Owner-approved: With the heat off, the water cools before the white sets. Add more water, or keep it boiling. |
| `readout.sub.heating` | Owner-approved: {elapsed} so far · about {boil} to boil |
| `readout.sub.coldGuesses` | Owner-approved: about {boil} to boil, my guess |
| `readout.sub.standing` | for {water} of water, lid on — measure it |
| `readout.sub.cookingCold` | boiled in {boil} · then {after} |
| `action.hint.hotBoiling` | keep it at a full boil for all {time} |
| `action.hint.hotStanding` / `.heatingStanding` | End with "…then heat off, lid on". |
| `controls.measure.hint` | Weighing is most accurate. No scales? Wrap a strip of paper round the fattest part and measure the strip. |
| `controls.eggFrom.hint` | I assume {fridge} for a fridge and {room} for a room. Pick Custom if yours differ. |
| `learned.literature` | I haven't learned anything yet. Tap Full rolling boil on a cold-water start, and tell me how each egg came out. |
| `learned.confirm.message` | I'll forget every egg and every boil, and the times go back to where they started. |
| `feedback.invite` | Your answers teach me your taste and your eggs. |
| `outcome.unsure` | Could come out too soft or too firm; I can't tell yet. |
| `outcome.miss.firm` / `.soft` | Might miss, more likely too firm. / Might miss, more likely too soft. |
| `outcome.likely.firm` / `.soft` | Probably just right, or else a little firm. / …soft. |
| `advice.fridge` | Use eggs straight from the fridge: I know how cold a fridge is, but not your room. |
| `advice.ice` | Cool the eggs in an ice bath. On the counter, how much more the yolk cooks is hard to predict. |
| `advice.weigh` | Weigh the egg. One size on the box covers eggs that need quite different times. |
| `readout.alarm.denied` | notifications are off — keep the app open |
| `readout.alarm.failed` | I couldn't set the alarm — keep the app open |
| `colophon.lede` | I work out each time from how heat gets into an egg. |
| `controls.units.period` | I can also write Imperial in the English of its day. |
| `idle.welcome` | Owner's own words; leave it. |

### Buttons, labels and setup clauses (check `surfaces.json` budgets)

| Key | Proposed |
|---|---|
| `learned.forget` | Forget what's learned |
| `learned.confirm.title` | Forget what's learned? |
| `feedback.thanks` | Thanks — I'll use that next time. |
| `readout.phase.pull` | Eggs out — now |
| `activity.target` | {doneness} · peak yolk {yolk} |
| `controls.size.measured` (web) / `controls.size.weighed` (iOS) | One wording for both, e.g. "Measured — {mass}", where {mass} is the remembered measured/weighed egg (D6: go back). The web label may then need to show the remembered mass too. |
| `setup.start.hotStanding` | into boiling water, heat off and lid on |
| `setup.start.coldStanding` | into cold water, brought to the boil, then heat off |
| `setup.start.cold` | into cold water, brought to the boil |
| `readout.mute.on` / `.off` | Sound on / Sound off |

### 1750 catalogue

- Trim each twin in proportion to its modern key.
- Cut the added end-morals:
  - `help.how.p1`: "which is only the experience of others imperfectly remembered"
  - `help.how.p2`: "To leave the fire is not to leave the heat."
  - `help.learn.p1`: "but every answer is instruction"
  - `help.odds.p1`: "…only errour diminished"
