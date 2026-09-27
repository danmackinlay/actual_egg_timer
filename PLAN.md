# PLAN.md — build state for Actual Egg Timer

Resumable working notes. Updated **in the same commit** as the work it describes.
For the science, see `README.md`. For what was verified and what it cost to find
out, see `LOGBOOK.md`. For getting the app onto other people's phones, see
`ios/RELEASING.md`. For the design of what comes next - the inference as the
main part, and pooled across cooks - see `INFERENCE.md`; for languages, units
and the wording itself, `LANGUAGE.md`. This file is for whoever picks the build
back up.

**Status: both apps complete and learning. The PHYSICS is now the open part.**
142 TypeScript tests (141 pass, and one E3 check is reported as an open todo,
not a pass), 28/28 validation checks and 69 Swift conformance tests.
The web app and the iOS app carry the same model, the same refusals and the same
particle filter; the Swift port covers every module in `src/core/`. The
iOS app runs signed on a real phone, with a time-sensitive alarm and a Live
Activity, and has cooked a real egg. What is left is not code: it is the two
measurements in README §11.3 and a run of real eggs to calibrate against. As of
21 September there is also a designed next phase - E, below - that makes the
inference the main part. E1 the record is built (26 September), and E2 the
ordered probit with E3's white offset (27 September); the rest is not.

Counts in this paragraph are the only ones in the file. Three other lines used
to restate them and all three had gone stale, which is how a status line ends up
disagreeing with itself by six tests and twelve checks. If you want a number,
run `npm test`.

**The conformance line sits above the physics.** `src/core/policy.ts` and
`EggTimerCore/Policy.swift` carry what the apps DECIDE - snapping, the refusal
verdict, texture bands, the calibration grid's geometry, the phase timeline, the
bounds, the defaults and the size classes by region - held together by `fixtures/policy.json`. Anything both
apps have to agree on goes there, or it drifts: everything in it was
hand-duplicated until September 2026, and by then the two apps had different
defaults, different preset temperatures and a boil-memory lookup that could
answer differently on each.

---

## Goal

A static web app that computes egg cooking time from physics — transient conduction
in a sphere plus Arrhenius denaturation kinetics — times the boil itself, and counts
down. Zero runtime dependencies. The core is written for a near-mechanical Swift port.

## Phase checklist

### Phase A — core physics (solo) — DONE
- [x] scaffolding: `package.json`, `tsconfig.json`, `PLAN.md`
- [x] `src/core/constants.ts`
- [x] `src/core/thermo.ts`      — altitude/pressure → boiling point
- [x] `src/core/geometry.ts`    — egg dimensions → effective radius
- [x] `src/core/sphere.ts`      — modal/Duhamel solver (the heart)
- [x] `src/core/kinetics.ts`    — Arrhenius thermal dose
- [x] `src/core/protocol.ts`    — water temperature schedule
- [x] `src/core/solve.ts`       — cook time for a doneness target
- [x] freeze API into this file, commit

### Phase B — parallel (three subagents, no shared files) — DONE
- [x] `test/core.test.ts` + `tools/validate.ts` (counts in the status line above)
- [x] `index.html`, `styles.css`, `src/ui/*` (app, machine, clock, store, main)
- [x] `README.md` — the science write-up, 652 lines

### Phase C — calibration (solo) — DONE
- [x] `src/core/doseGrid.ts`  — cached log10 dose, bilinear interpolation
- [x] `src/core/infer.ts`     — particle filter, ordinal likelihood
- [x] `src/ui/calibration.ts` — posterior lifecycle, persistence, feedback wiring
- [x] integrate, full verification

Measured: grid build 1.76 s (21x36), interpolation error 1.7% in dose, posterior
update 0.1-1.6 ms. Injected alpha = 1.535e-7 with taste offset 0.20 recovered in
**3 eggs**; converged cook time 8.52 min vs true optimum 8.29 min (14 s error);
relative sd plateaus at 3.1%, the ordinal-feedback identifiability floor.
Recovered alpha is 4.5% off in isolation because alpha and the taste offset are
confounded at fixed protocol - the combination is identified, the parts are not.
That is the documented behaviour, not a defect.

Also added: early termination in `simulate()` once the egg is past peak and the
dose rate is 1e-6 of peak. Cut simulate 2.80 -> 1.87 ms with identical results.

### Phase D — the iOS app (solo) — DONE

- [x] `ios/EggTimerCore` — the physics in Swift, held to generated fixtures
- [x] `ios/App/Cook.swift` — the phase machine, absolute dates, survives relaunch
- [x] `ios/App/Alarm.swift` — local notifications, `.timeSensitive`, foreground
- [x] `ios/App/Kitchen.swift` — every input, the refusals, the boil memory
- [x] `ios/Widget/` — the Live Activity: Lock Screen and Dynamic Island
- [x] `ios/EggTimerCore/DoseGrid.swift`, `Infer.swift` — the calibration
- [x] `ios/App/Calibration.swift` — "how was it?", and the app learns
- [x] `ios/EggTimerCore/SousVide.swift`, `ios/App/SousVide.swift` — the third
      start mode, and the sentence it gets answered with

The SwiftUI layer takes the BEHAVIOUR of `src/ui/machine.ts` and leaves its
mechanism. `clock.ts` in particular exists to fight the backgrounding problem
that a local notification solves properly, and has no counterpart here.

### Phase E — the inference becomes the main part — E1, E2, E4, E5 DONE; E3 BUILT

The design and the reasons are in `INFERENCE.md`; this is only the list. Every
core change lands in TypeScript and Swift together, under new fixtures, like
everything since Phase D. E1-E5 need no network and are worth doing for one
cook. Nothing leaves a phone before E6.

- [x] **E1 the record.** Keep each egg as an observation (`INFERENCE.md` §4),
      on the device, beside the posterior. Record the ACTUAL pull time, where
      the mass came from, and the language, register and units the cook read. A model change becomes a replay of the log instead of
      a discarded posterior. Done when: a v3 posterior can be rebuilt from the
      log alone, bit-identically, on both apps.

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
- [x] **E2 ordered probit.** Replace the hard bands and the fixed 0.8 / 0.1 in
      `infer.ts` with cutpoints and a learned noise scale, plus the small
      "unrelated answer" component. White becomes three answers (runny /
      tender / firm), always offered and never required; the yolk stays at
      three. A skipped question is recorded as a skip. `shouldAskAboutWhite`
      and `WHITE_ASK_MIN_P` go. The pre-E1 base posterior is DROPPED here, not
      backfilled (owner, 26 September). The wording is drafted in LANGUAGE.md §3.
      iOS gains the web's pull button ("They're in the ice bath"), so its pulls
      are measured and not assumed, and E2 scores on `pulled_s`. Done when: the
      Phase C recovery experiment is repeated and is no worse, and the predictive
      P(answer) is calibrated on simulated cooks.

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
- [ ] **E3 the white offset.** A fourth particle dimension: an additive shift on
      the white log dose, prior sd 0.5 decades. On one phone it is lag and
      cutpoint together (§2). Done when: two "runny" answers at soft move the
      next soft recommendation later and leave a jammy one nearly alone.

      BUILT 27 September, with E2, and the done-when is HALF met. Two runny
      whites at soft move the next soft time later (+85 s with the white alone,
      +21 s with the yolk also "just right", and soft becomes bound by the
      white). But jammy moves as far (+94 s, +23 s). A runny white is also a
      slow time-scale, and `alpha`'s prior (11.9%, 0.70 decades of white dose)
      is wider than the white offset's 0.5, so the posterior blames the
      time-scale about 2:1; wider white-offset priors (0.8, 1.2) overshoot
      instead. `test/infer.test.ts` 5b holds the unmet half as a todo.
      Deciding what to do is the owner's: the candidates are E4 or E7 pinning
      the time-scale, E5 recommending from the posterior rather than its mean,
      or a different prior - INFERENCE.md §3 has the numbers.
- [x] **E4 the thermometer flow.** Optional. The app says when (the solver's
      `peakYolkTime_s`), the cook reports the lowest reading at the centre,
      Gaussian likelihood with a hot skew (§5). Done when: one simulated reading
      at +-1 C takes the time-scale sd to about 2.5%.

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
- [x] **Old item 4, the cooling countdown from `peakYolkTime_s`.** DONE
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
- [x] **E5 decide under uncertainty.** Settled 26 September (`INFERENCE.md`
      §11): loss ratio 3; odds always shown as "7/10 eggs hit the mark";
      "still learning" until the 80% interval is under about +-15 s, falling
      back to a fixed egg count if that is fiddly. Time by expected utility with a lopsided
      loss; the odds of "white set, yolk in band" on screen; protocol advice
      when soft is asked for. Ships `predictCookTime`'s successor, which closes
      item 7 below.

      DONE 28 September, except the protocol advice, which was not in this
      pass. `src/core/decide.ts`, held to `EggTimerCore/Decide.swift` by
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

      Both apps show "7/10 eggs hit the mark" and "Still learning your
      kitchen" under the time, frozen at "Eggs in" for the cook in flight,
      and the Live Activity carries the odds on the Lock Screen. `PRIOR_ID`
      is `2026-09-e5`. NOT verified: nothing on iOS was run or tapped - it
      builds for the simulator, and the core is held by `swift test`.
- [ ] **E6 opt-in collection.** Consent, random id, upload, delete-by-id; the
      privacy manifest, both READMEs and `ios/RELEASING.md` stop claiming no
      networking. A Netlify function, append-only blobs, the web tier
      down-weighted in the global fit. Unblocked 21 September (`INFERENCE.md`
      §11). Privacy contact: forgetmyeggs@danmackinlay.name, which exists.
      The app says it is still learning wherever it shows a time.
- [ ] **E7 the population fit.** Offline, Python, outside `src/core/`. An
      emulator for the likelihood, 2-4 global parameters, cook and kitchen
      effects with reliability. Publishes `fixtures/population.json`, which both
      apps read as their prior. Done when: held-out predictive calibration is
      the reported headline.
- [ ] **E8 the nudge.** +-10 s on the recommendation for consenting cooks. Last,
      because it is worthless before E7 exists to use it.

### Phase F — words, units and languages — STARTED

Design and reasons in `LANGUAGE.md`. Both apps, under conformance, as always.
F1 goes before E2 so that Phase E's new feedback copy is born in the catalogue.

- [x] **F1 the catalogue.** DONE 27 September 2026. `copy/en.json` holds all
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
      fixed at `en`; the picker arrives with F5, and sets those.
- [ ] **F2 the rewrite.** Inside the catalogue, one diff for the owner. Known
      offenders listed in `LANGUAGE.md` §3: "carryover", "calibration",
      "literature values", "the model", "standing method", a ±% of nothing,
      and every bare "°". Every inserted word (a doneness name, a limit)
      moves out of running grammar into a label or after a colon, so Czech
      never has to decline it. Runs alongside E2 and E5.
    - [x] **The feedback screens**, with E2, 27 September: LANGUAGE.md §3's
          draft, in both apps, approved on the owner's behalf while they were
          away. 19 keys changed, each listed in `tools/copyDraft.ts`; the
          proofs show nothing else did. Left for the rest of F2: the iOS
          alarm's and Live Activity's "carryover", `learned.forgetExplain`'s
          "posterior", and the heat-off explanation.
- [x] **F3 units.** DONE 27 September 2026. `src/core/units.ts` +
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
      system by the cook raises `aet:unitsflip` on the web and posts
      `.unitsFlipped` on iOS, the hook F6 needs; nothing listens yet. Every
      temperature carries its unit through `format.*` keys, the size menu
      shows ounces from the same mass, the Live Activity is handed its numbers
      rendered, and the record's `units` is the system the cook read at "Eggs
      in". Budgets raised for the unit: lockscreen 29 -> 33, body 251 -> 260,
      a11y 88 -> 101. Web driven in both systems under en-GB and en-US; iOS
      built and seen in both systems, but not tapped (see LOGBOOK).
    - [x] **Size classes by region**, done first, 26 September 2026. US carton
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
- [x] **F4 locale formatting.** DONE 27 September 2026. `src/core/format.ts`
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
- [ ] **F5 Czech**, reviewed by the owner's friend before it ships. Brings
      the in-app language picker in both apps (deferred from F1), and adds
      `cs` to `CFBundleLocalizations` in `ios/project.yml`. It tests
      all four CLDR plural categories (`many` is for fractions: 1,5 vejce),
      the decimal comma and seven cases. The case problem is why every
      inserted word stands alone in its dictionary form (`LANGUAGE.md` §5).
      Doneness words are matched by the reviewer, not translated.
- [ ] **F6 the English of 1750.** A language code, `<region>-x-1750`: strings
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

No owner decisions pending on Phase F.

---

## Frozen core API

`CookSetup.eggMass_kg` was removed in September 2026: it duplicated
`Egg.mass_kg`, and since every function that took a setup also took an egg,
callers had to keep the two in step by hand. `tools/validate.ts` had to remember
an override in its size sweep or it would silently have modelled four different
eggs against one fixed water dip. No physics number moved - the fixtures are
byte-identical apart from the missing field.

Import from `dist/src/core/*.js` (or `src/core/*.ts` in TS). **Do not write UI or
tests against anything not listed here.**

```ts
// geometry.ts
interface Egg { radius_m; minorDiameter_m; mass_kg; volume_m3 }
eggFromMinorDiameter(minorDiameter_m: number): Egg
eggFromMass(mass_kg: number): Egg
diffusionTime(egg: Egg, alpha_m2s: number): number
SIZE_CLASSES: { key: string; mass_kg: number }[]     // EU, and the default table
US_SIZE_CLASSES: { key: string; mass_kg: number }[]  // region US
sizeClassesFor(region: string | null | undefined): SizeClass[]
sizeTableFor(region): 'eu' | 'us'                         // the same choice, by name, for the record

// thermo.ts
pressureAtAltitude(altitude_m): number          // Pa
boilingPointAtPressure(pressure_Pa): number     // C
boilingPointAtAltitude(altitude_m): number      // C
boilingPointApprox(altitude_m): number          // C, the 100 - h/300 one-liner
saltBoilingElevation(gramsPerLitre): number     // C

// protocol.ts
type StartMode    = 'cold' | 'hot'
type Cooling      = 'ice' | 'tap' | 'counter'
type HeatAfterBoil = 'hold' | 'off'
interface CookSetup {
  startMode: StartMode; eggStart_C; ambient_C; boiling_C;
  timeToBoil_s;            // ramp length on a cold start, and nothing else; a hot start carries it for the record
  cooling: Cooling; waterLitres; eggCount;     // the POT. The egg's mass is on the Egg.
  afterBoil?: HeatAfterBoil;   // omitted means 'hold'
}
rampTemperature(t_s, timeToBoil_s, ambient_C, boiling_C): number
dipMagnitude(egg, setup): number                // C the water drops when eggs go in
panTimeConstant(waterLitres): number            // s, heat off and lid on: TAU_STANDING_REF_S * (V / 2 L)^(1/3)
standingTemperature(elapsedSinceOff_s, from_C, ambient_C, waterLitres): number
bathTemperature(egg, setup, t_s): number        // the in-water schedule, t = 0 at egg-in
coolingTemperature(setup, elapsedSincePull_s, waterAtPull_C, meanAtPull_C, tauAirScale): number
initialSurfaceTemperature(egg, setup): number

// solve.ts  <- the main entry points
interface ModelParams { alpha_m2s; tauAirScale }
DEFAULT_PARAMS: ModelParams
interface Doneness { level; yolkDose_min; whiteDose_min }
donenessFromSlider(level: number): Doneness     // level in [0,1]
sliderFromYolkDose(dose: number): number
DONENESS_ANCHORS: { key; level; approxPeakYolk_C }[]   // key into copy/en.json
interface CookResult {
  cookTime_s; peakYolk_C; peakYolkTime_s; yolkAtPull_C;
  yolkDose_min; whiteDose_min; peakWhite_C;
}
simulate(egg, setup, params, cookTime_s): CookResult
interface Solution {
  result: CookResult; reachable: boolean;
  minCookTime_s: number; softestLevel: number;
  hardestLevel: number;    // 1 while the water is held at the boil
  whiteSets: boolean;      // false only with the heat off, when the pan never sets the white
}
solveCookTime(egg, setup, params, doneness): Solution

// sousvide.ts
SOUS_VIDE_BATH_C
equilibrationTime(radius_m, alpha_m2s): number
sousVideEstimate(radius_m, alpha_m2s, bath_C, yolkDose_min, whiteDose_min): SousVideEstimate
longDuration(seconds): CopyRef             // the unit choice, as a key and its numbers
startPhrase(daysAgo): CopyRef              // the app adds {weekday}
weekdayKey(dayOfWeek): string              // 0 = Sunday; both apps name days from the catalogue

// units.ts  (Metric and Imperial; LANGUAGE.md §4. Core stays SI.)
type UnitSystem = 'metric' | 'imperial'
type Quantity = 'temperature' | 'eggTemp' | 'boilingPoint' | 'mass' | 'girth' | 'width' | 'altitude' | 'water'
measureFor(q, system, region): Measure      // unit, step, decimals, unitKey, formatKey, limit, bounds
display(m, si) / displayText(m, si)         // rounded to the step, held inside the bounds
parse(m, typed): number | null              // to SI, clamped by LIMITS in SI; null for no number
quantityText(m, si): { key; value: Fixed }  // render as t(key, { value }); grouped by locale
sizeClassLabel(c, system): { key; mass: QuantityText }
regionalUnits({ region, measurementSystem?, temperature? }): UnitSystem
effectiveUnits(chosen, regional) / chooseUnits(chosen, regional, next): { chosen; flip }

// copy.ts  (the words; LANGUAGE.md §2)
interface CopyRef { key; args: Record<string, number> }
type CopyArg = string | number | Fixed     // text as is; a count; a measurement to its decimals
parseCatalogue(json, fallback?): Catalogue
render(catalogue, key, args?, formatLocale?): string / renderRef(catalogue, ref, extra?, formatLocale?): string
pluralCategory(locale, n, fractionDigits?): 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'

// format.ts  (numbers and times of day, F4; LANGUAGE.md §2)
interface Fixed { value; decimals }
formatNumber(locale, value, decimals) / formatCount(locale, value): string   // Intl, rounded first
formatTimeOfDay(locale, secondsOfDay, withSeconds): string                    // the locale's time style
formattingLocale(uiLanguage, region, hourCycle): string                       // 'en-GB', 'en-AU-u-hc-h23'

// doseGrid.ts / infer.ts  (calibration; see Phase C)
buildDoseGrid(...) / lookupLogYolkDose / lookupLogWhiteDose / cookTimeForLogYolkDose
type Feedback = -1 | 0 | 1                 // the YOLK answer
type WhiteReport = 'runny' | 'tender' | 'firm' | 'set'   // 'set' is E1's, = tender or firm
createPrior(count, seed)                   // six numbers a particle (E2, E3)
updatePosterior(post, grid, cookTime_s, logTarget, yolk | null, white | null, probe_C?)  // one fold per egg; resamples through Liu and West's kernel (E5)
answerLikelihood(grid, particle, cookTime_s, logTarget, yolk, white)
yolkAnswerProbabilities / whiteAnswerProbabilities   // the predictive
posteriorParams / posteriorMeanOffset / posteriorMeanWhiteOffset / posteriorAlphaRelSd
predictCookTime                            // since E5 the later of the yolk's and the white's time
cookTimeForLogWhiteDose(grid, alpha, logDose)

// decide.ts  (E5 - INFERENCE.md §8)
RUNNY_WHITE_LOSS = 3 / STILL_LEARNING_HALF_WIDTH_S = 15 / LEAN_COST_PER_S / DECISION_WINDOW_S
interface DecisionInputs { egg; setup; params; whiteDose_min }   // one surface per pot; no level
decisionInputs(c, egg, setup) / decisionGridSpec(inputs) / decisionGridRequest(inputs)
expectedLoss(post, grid, t, logTarget) / hitOdds(post, grid, t, logTarget)
chooseCookTime(post, grid, logTarget, around_s)
interface Decision { cookTime_s; meanCookTime_s; chosen; loss; odds; oddsTenths; interval; stillLearning }
decide(c, grid, meanSolution, logTarget) / decideAt(post, eggsLogged, grid, mean_s, applies, logTarget)
decisionApplies(sol) / decidedSolution(...) / carriedSolution(egg, setup, params, sol, lean_s)
stillLearning(interval) / oddsInTenths(odds)

// record.ts  (E1 - the schema is INFERENCE.md §4)
interface EggRecord { v: 1; ... }          // one egg; RECORD_VERSION, PRIOR_ID
parseRecord(raw): EggRecord | null / parseLog(raw): EggRecord[] | null
interface Calibration { posterior; eggsLogged }
freshCalibration(count, seed) / copyCalibration(c) / calibrationParams(c)
gridRequestFor(c, record, gridPolicy) / buildRequestedGrid(request)
foldRecord(c, record, grid) / recordCookTime_s(record)   // the pull if measured
calibrationDoneness(c, level)              // the white target moved by E3
replay(start, records, gridPolicy = calibrationGrid): Calibration   // never moves start
recordMass_g(mass_kg)

// sphere.ts (mostly internal; exported for tests)
createSphere / stepSphere / temperatureAt / centreTemperature / meanTemperature
seriesTheta(x, Fo) / erfcTheta(x, Fo) / oneTermTheta(x, Fo) / biotNumber / erfc

// kinetics.ts
createDose(z_K, tref_C) / accumulateDose(d, T_C, dt_s) / holdTimeForDose
zFromActivationEnergy(ea_Jmol, T_K): number
```

**UI contract.** `solveCookTime` returns `reachable: false` when the requested
yolk doneness cannot be had. Two ways: too soft for the white (`softestLevel` is
the softest position that *is* achievable, and the UI stripes out everything
below it — this is what makes counter-resting refuse soft eggs rather than lie
about them), or, with the heat off, harder than the pan can manage
(`hardestLevel` is the ceiling, and the UI stripes out everything above it). If
`whiteSets` is false nothing on the slider is reachable at all. Every cook time
the solver returns is the *first* one known to meet its dose target, to within a
second — the search returns the upper end of its final bracket, never the
midpoint, so a dose compared against its own target at the answer always passes.

---

## Calibration constants and provenance

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

## Validation targets

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

## Invariants — do not break these

1. **`src/core/` has zero dependencies** and no DOM, `Date`, I/O or `async`. Pure numerics.
   `Intl` is allowed in `format.ts` only, given an explicit locale and UTC: it
   reads no clock, no time zone and no device locale, so it is a pure function
   of its arguments, and `fixtures/format.json` pins what it returns.
2. **Swift-portable subset**: plain interfaces + top-level functions; explicit `for` loops;
   no classes, closures over mutable state, `null`/`undefined`, or `map`/`reduce` in hot paths.
3. **SI units internally.** Convert only at the UI boundary.
4. **Sum 40 series terms**, never one — one-term truncation is 8.4% low at realistic Fo.
5. **z ≈ 4.65 K for eggs**, never the food-engineering default of 33.1 K (7× too shallow).
6. The boil button says **"Full rolling boil"** — tapping at first bubbles under-measures 15–25%.
7. **Never step the surface temperature discontinuously.** A truncated modal basis
   cannot represent a fresh discontinuity at the centre, where modes are weighted
   by `n`; an instantaneous 100 -> 2 C drop made the yolk centre read 12.5 C when
   the true value was 49.3 C. All medium changes blend through `TAU_PLUNGE`.


---

## Handoff — 17 September 2026

Where this stands, and what the next person (or the next context window) needs
that is not obvious from the code.

### Done and verified

- **The web app is live** at <https://actualeggtimer.netlify.app>. Netlify
  builds it from `netlify.toml` on push; nothing is configured in a web form.
  `og:` tags carry absolute URLs at that domain, so a domain change is a commit.
  `vercel.json` is also checked in and is NOT deployed - it is a second host's
  two settings, kept so the site can move without an archaeology session. README
  §10 explains why its Node pin differs. If it is ever deleted, delete that
  paragraph with it.
- **Every constant has been checked against the primary literature.** `Z_WHITE`
  was corrected; `H_EFF` is known high and recorded as an open problem (§11.2).
  `references.bib` has the sources with notes on what each is good for.
- **The Swift core is complete except the calibration** and conformant against
  the TypeScript: pure functions to 1e-12, 13 whole cooks to the same, measured
  disagreement 7e-15. `npm run conformance`.
- **The iOS app carries the whole model.** Every input the solver has, the
  reachability refusals, the cold start with its boil-timing step, and the
  standing method. Driven end to end in the simulator against the TypeScript's
  own numbers.
- **The alarm fires, at `.timeSensitive`,** and now presents even with the app
  in the foreground. The entitlement is signed and verified in a device build,
  not merely requested in a plist.
- **The Live Activity works** on the Lock Screen and in the Dynamic Island.

### Waiting on the owner, from the night of 26-27 September

Merged overnight into local `main` and not pushed: E1, F1, the carton classes,
the standing-method pan constant, F3, E2+E3, F4, E4 and E5. What came back
needing a decision:

1. **The E5 odds on a fresh install read "2/10 eggs hit the mark".** Before any
   egg, the model is honestly unsure of the cook's taste and eggs, so that
   figure is calibrated. It is also the first thing a new cook sees, and it
   reads as "this timer mostly fails". Options:
   - show the odds only after the first egg;
   - word the first-egg case differently;
   - keep it.
2. **White-bound levels lean long and read 0/10.** At the softest level a pan
   can reach, the white is the constraint. There the loss (a runny white costs
   3) leans the time 80-120 s long and reports 0/10, while the "Softest
   possible" refusal still comes from the mean solve. The app offers a level,
   then says it will almost never hit it. The fix is probably to take
   reachability from the odds rather than from the mean, which is a design
   call. See INFERENCE §8.
3. **E3's attribution.** A runny white alone is blamed about 2:1 on the
   time-scale rather than the white offset, so it moves jammy as much as soft.
   A yolk answer beside it fixes the split (soft +146 s, jammy +17 s). Pooling
   (E7) or a probe (E4) pins it properly, or the priors could change.
   INFERENCE §3 has the numbers, and test 5b is held as a todo.
4. **Wording:**
   - The E2 feedback draft is live, since that call was made overnight, and
     can still be revised.
   - The rest-of-F2 draft (LANGUAGE §3) is waiting to go into the catalogue.
   - E4 changed the probe wording from "lowest" to "highest" number, because
     at the moment the centre peaks it is the warmest point. That was a
     physics correction, and it stands unless the owner objects.
5. **Hot-start heat-off cooks never set the white** at 1-4 L with four fridge
   eggs. `TAU_STANDING_SCALE = 1.0` may be pessimistic with a lid on. One real
   cook would settle it.
6. ~~**F4's two platform splits** (LANGUAGE §8), before Czech ships.~~
   Answered and built 27 September; see F4.
7. **Protocol advice when soft is asked for** (INFERENCE §8) was not built.
   Nobody decided whether it should be.

### Answered by the owner, 27 September

- **Odds-shaded slider: yes, in both apps, threshold 3/10.** Reachability
  ("Softest possible") comes from the odds, not from the mean solve. Shading is
  relative to the best level, so a fresh install still shows where the pan
  works.
- **Fresh-install odds stay on screen, with an inline info disclosure (ⓘ)**
  explaining why they start low. It is a short-term problem that pooling (E7)
  shrinks.
- **Protocol advice: discoverable, not intrusive.** An inline expanding line
  under the odds when the chosen level's odds are low. No modal, no popover.
- **E3's attribution is left as it is** until a probe or pooling pins the
  time-scale.
- **Times of day never zero-pad the hour** ("9:05"), in either app. A Czech UI
  takes its decimal separator from the language, on both apps.
- **Wording:** the owner will hand-edit the rest-of-F2 table in LANGUAGE §3.
- **Push `main` after the owner has previewed the web app.** No real eggs for
  now; the owner is travelling.

### Order of work, from 26 September

This is the order for Phases E and F together, with the old list below folded
into it. Dependencies come first. After that, whatever makes each breakfast
count for more.

**Both apps, every time.** Anything the apps must agree on lands in TypeScript
first, as the reference. It is fixtured from TypeScript, and the Swift core is
held to it by `npm run conformance`. That is one phase for both apps, not one
moment: the web app deploys on push and iOS ships when a build does. So the
record schema and the stored posterior must tolerate the two running different
versions for a while. Above core, each app's screens are separate work, checked
by driving them.

Some work is on one side only:
- **Web only:** the dose grid off the main thread (E1), and the first network
  request (E6).
- **iOS only:** App Attest and the privacy manifest (E6), `Info.plist`
  localisations and the system temperature preference (F), and the small-surface
  length budgets (F6).
- **Neither app:** the Netlify function (E6) and the Python fit (E7).

**Now, in parallel**
1. **US carton size classes** (the correctness half of F3). An American on the
   default egg is overcooked by about 34 s today.
2. ~~**E1, the record.**~~ Done 26 September. From here on every egg survives
   model changes. It moved the web app's dose grid off the main thread (old
   item 3), because replaying a log builds one grid per egg, at about 2 s each.
3. **F1, the catalogue, with the wording unchanged.** It has to land before any
   new feedback copy exists.

**Then the filter, once**

4. **E2 and E3 together.** They are one likelihood revision, replayed from E1's
   log, not two resets.
5. **F2 for the feedback screens**, in the same pass, because E2 rewrites them
   anyway. It is one diff for the owner.
6. ~~**E5**: choosing the time by expected utility, the odds on screen, "still
   learning", and the interval (old item 7).~~ Done 28 September, but for the
   protocol advice; see the E5 entry.
7. **E4, the thermometer.** Its only prerequisite is E2, so pull it forward if
   a probe is to hand.

**Then the words**

8. **The rest of F2**, then **F3 (units)** and **F4 (formatting)**.
9. **F6 (1750)** and **F5 (Czech)**, in whichever order the reviewers are free.
   Both need F2's settled wording; F6 also needs F3. Hand the Czech reviewer
   wording that will not move again.

**Last, the collective part**

10. **E6, opt-in upload.** It needs a settled schema (E1, E2), "still learning"
    (E5). The privacy contact exists: forgetmyeggs@danmackinlay.name. The consent text has to exist
    in every language that has shipped.
11. **E7, the population fit**, once enough cooks have opted in.
12. **E8, the nudge**, which is worthless before E7.

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
(`readout.sub.standing`: "for 2 L of water with the lid on — measure the
water, it changes the time"), the white-never-sets refusal no longer advises
"a slower boil", and the iOS heat-off explanation drops "standing method".

**Deferred: a per-cook standing scale.** `TAU_STANDING_SCALE` stays 1.0, a
global multiplier. The lid, the pan's shape and material belong in a per-cook
scale learned only from that cook's standing eggs (`INFERENCE.md` §11, item 11),
which wants E2's likelihood and enough standing cooks to identify it apart from
`alpha`. Not built.

~~**Anywhere:** derive the cooling countdown from `peakYolkTime_s` (old item 4).~~
Done with E4, 27 September.
**Throughout:** cook real eggs (old item 1). After E1 each one counts
retroactively.

### Next, in order (superseded as an ORDER by the section above)

The entries below are kept for what they say, not for where they sit.

Nothing on this list is a missing feature. Both apps do everything the model can
do; what is missing is contact with reality.

1. **Cook real eggs and answer honestly.** The first real cook happened on
   18 September and found three interface bugs and zero physics problems, which
   is the expected ratio and the reason to keep going. The filter needs about
   three eggs to stop moving, and it needs you to VARY something — egg size or
   cooling method — or `alpha` and your taste stay confounded (README §11.5).
0. **Phase E, starting at E1** (above, and `INFERENCE.md`). Added 21 September.
   It reorders this list rather than replacing it: items 1 and 5 are what E1-E3
   make worth doing, item 7 is absorbed by E5, and item 2 is qualified below.
2. **The two measurements nobody appears to have made** (README §11.3).
   *Qualified 21 September by `npm run probe`:* a kitchen probe at the centre,
   at the yolk's peak, pins the time-scale to ~2.5% from one egg, so for THAT
   the thermocouple is no longer the only way. For `TAU_AIR` it still is - a
   spot reading moves 1.1 C per prior sd of it against 3.5 C for `alpha` - and
   a logged curve is what is wanted. The original entry follows.
   Now the highest-value item on this list rather than the most interesting one:
   `npm run identifiability` measures that `h` is 15x too weak to ever be learned
   from feedback, so a thermocouple is not a nicer way to get this answer, it is
   the only way. A road trip is packing one. A
   thermocouple through the blunt end and a datalogger settles `TAU_AIR` in an
   afternoon; a pot, a thermocouple and forty minutes settles `RAMP_R` and
   `TAU_STANDING_SCALE` together. Both would beat every published source found,
   and `TAU_AIR` drives the app's most opinionated behaviour — refusing soft
   eggs to anyone resting them on the counter.
3. ~~**The web app builds its dose grid on the main thread**~~, blocking ~2 s behind
   a `setTimeout(30)` so the "learning" note paints first. iOS runs it detached.
   *Done with E1:* a module Web Worker, with this thread as the fallback.
4. ~~**Derive the cooling countdown** from the solver's `peakYolkTime_s` instead of
   asserting three minutes (README §11.5).~~ *Done with E4, 27 September*: -46
   to +56 s against the flat 180 s (the E4 entry has the table). It still
   wants a real egg behind it.
5. **Judge the white channel against real eggs** (README §11.5, issue #1).
   *Superseded by E2 and E3:* the white is now always asked, three answers, with
   its own learned offset and noise; see the E3 entry above for what two runny
   whites do and do not do. The empirical question stands - it needs eggs.
7. ~~**Show `predictCookTime`'s interval** somewhere, or stop claiming in its
   docstring that it is what makes calibration legible (README §11.5).~~
   *Absorbed by E5:* the interval now takes the white as well, is computed with
   every decision, and is what "Still learning your kitchen" reads: it shows
   while the interval is wider than ±15 s. The number itself is not shown.

Checked on 18 September and NOT a problem, so nobody re-checks: the web app's
`reset()` already re-solves, and its solve is synchronous, so neither of that
day's iOS bugs has a twin there. The web app also already defaults to a cold
start — iOS was the outlier, and now matches.

Considered and NOT queued: a watchOS target. A paired watch already rings,
because iOS forwards notifications to the wrist whenever the phone is locked —
which is the situation this app is for. A real watch app would only add the
phone-unlocked case, and its cost is a second UI to keep in sync, not the
target. `EggTimerCore` already compiles for watchOS unchanged, so this stays
cheap to revisit.


---

## Where the rest went

Verification records, the debt passes, the things that cost an hour to find out,
and the RNG statistics are in `LOGBOOK.md`. This file is state; that one is
record. See its header for why.
