# Red team of the 0.5 line: the worklist

Read-only review of `claude/0-5-version-foundations-277a7b` at `7c85ef4`
(9 October 2026), rechecked at `37ba148` (the copy snapshot's settle fix), by five reviewers: core and its Swift twin, the web app,
the iOS app, storage and back-compat, and tooling, process and docs. ✔ marks
a claim checked by hand against the code; the rest are as the reviewers
reported them, with file and line.

## Why 74k lines

| | lines | of which code |
|---|---:|---:|
| core, TypeScript | 9.3k | 4.6k |
| core, Swift twin | 8.1k | 5.2k |
| web UI + `index.html`/`styles.css` | 10.5k | 7.1k |
| iOS app, widget, shared | 10.5k | 6.9k |
| server | 1.0k | 0.7k |
| tests (TS 9.5k, Swift conformance 4.3k) | 13.8k | |
| fixture generators | 4.4k | |
| copy drafts + copy tooling | 8.1k | |
| e2e drivers | 3.7k | |
| research tools, `fit/` | 6.2k | |
| *not counted:* markdown 17.5k, fixtures 3 MB | | |

The physics, inference and cook logic, counted once, is about 10k lines.
The rest is the logic written twice, the UI written twice, comments (43% of
core) and scaffolding. The worklist below is ordered so that each step makes
the next one safer: fix what is wrong, put gates in front of the code, delete,
then restructure.

---

## 0. Wrong now (fix first)

- [x] **0.1 The newer-build guard is not on `0.4.x`** ✔. `DECISIONS.md` 100
      says every release from 0.4 carries it; `0.4.x-newer-version-guard`
      (5 commits on `8972a05`) was never merged. *Done:* `0.4.x`
      fast-forwarded to `774c459` (9 October 2026); `verify` and `ios:build`
      passed; no 0.5 commit fixed the guard itself, so nothing came across.
- [x] **0.2 iOS: the alarm sound bypasses the guard** ✔.
      `ios/App/AlarmSoundChoice.swift:30` writes `UserDefaults` directly;
      `Store.swift` says every write goes through `Stores.set`. Route it, and
      add a lint that `UserDefaults.standard.set|removeObject` appears only in
      `Store.swift`. S. *Done:* through `Stores.set`; `test/iosStores.test.ts`
      fails on any write to UserDefaults outside `Store.swift`.
- [x] **0.3 iOS forgets a corrected cook whose record could not be remade** ✔.
      `AppModel.remakeThenEnd` (`AppModel.swift:215`) forgets the stored cook
      and sends it final in a `defer`, so it runs when `correctedAsRan`
      returns nil. The web retries and leaves the cook stored
      (`src/ui/cook.ts:549`). S. *Done:* tried three times more, then left
      stored for the next launch and held back from sharing;
      `ios:e2e again-not-remade`.
- [x] **0.4 iOS drops an answer held at Start again**. `AppModel.startAgain`
      logs the unanswered egg with no yolk or white, then clears `held`; the
      web logs `heldAnswers()` (`cook.ts:504`). S. *Done:* the egg logged with
      the held answers and folded; `ios:e2e again-held`.
- [x] **0.5 iOS: one render reads the clock several times**. `ReadoutView`'s
      big time uses `cook.secondsToPull`, which reads `AppClock.now` itself,
      not the `TimelineView`'s `now`; `Cook` reads `AppClock.now` 24 times.
      Pass `now` in. S. *Done:* the time left takes the frame's moment
      (`secondsToPull(at:)`, `secondsToCoolDone(at:)`), as does the alarm
      line's fallback; in `Cook` a tick, a plan taken and the card after a
      restore each read the clock once and hand that moment on (`tick`
      returns its phase for the ticker's pace; `pushActivity(at:)`,
      `ringIfDue(at:)`). What is left reads it where something happens: a
      tap, a start, a plan made, a launch, and `phase` and the defaults
      `AppModel` calls at an event. `one-moment` in `npm run ios:e2e` checks
      each frame's time and time heated against the moment it logs, frozen
      either side of a second and at ×60; at ×60 it failed 13 frames of 20
      with the old read.
- [x] **0.6 Web: two import cycles** ✔, though B1 says there are none:
      `render.ts:55` ↔ `update.ts:25`, and `edit.ts:43` ↔ `cook.ts:34`. Move
      `warningText` to a leaf; hand `correctCook` in. S. *Done:*
      `warningText` to `src/ui/warning.ts` (`9fc60ad`); `correctCook` handed
      in by the boot, `wireEdits(correctCook)` (`f11b388`). No other cycle
      (1.3).
- [x] **0.7 Web: the hourly update check runs on the dev clock**
      (`src/ui/offline.ts:74`, `nowMs()`), against `now.ts`'s own rule. S.
      *Done* (`3d20a8c`): `now.ts` gains `realMs()`, which `offline.ts`
      reads; `test/offline.test.ts` 5.
- [ ] **0.8 The two apps accept different stored cooks.** TS refuses a cook
      with no `asRan` key (`running.ts:502`); Swift's Codable path turns it
      into nil, so `Running.swift:520`'s check cannot be reached. Comes free
      with 3.4. S.

## 1. Gates: make the code safe to change

0.3 and 0.4 are the end-of-cook logic drifting between the apps, and no
gate could catch it.

- [x] **1.1 The e2e suites can't fail anything** ✔. Both CI jobs are
      `continue-on-error: true` (`.github/workflows/verify.yml:80, 109`);
      neither is in `npm run verify`; CI runs only on a push. 56% of `src/ui`
      (cook, render, feedback, edit, clock, update) and all of the iOS app
      logic are checked by nothing else. Make both jobs blocking, and add
      `npm run e2e` / `npm run ios:e2e` to the CLAUDE.md rule for commits
      touching `src/ui` or `ios/App`. S.
      *Done* (`06e6b63`, merged with 5.1): both jobs gate the run;
      CLAUDE.md's rule has both suites (`edbe190`). Unproven until a push:
      the hosted runners' Chrome audio, simulator runtimes and timings, and
      `ubuntu-latest` moving to Ubuntu 26 on 19 October 2026.
- [x] **1.2 An iOS app test target.** `project.yml` has `testTargets: []`.
      Cook, AppModel, Planner, Store, DecisionGrids and AppClock import only
      Foundation, Observation and core, so they can move into an
      `EggTimerApp` target in `ios/EggTimerCore/Package.swift` and be tested
      by the `swift test` already in `verify`. Protocols for the six
      singletons, `AppClock` and `UserDefaults`. L, the base for 3.x.
      *Done* (`55e690b`, `4344ba9`): those six and Calibration, Edits,
      Presentation, SousVide, LanguageChoice, AlarmSoundChoice, Screenshots
      and Perf are `EggTimerApp`, which the app links; `Copy` and
      `CookActivity` are `EggTimerShared`, which the widget links too. What
      they reach outside is a protocol the app fills at launch
      (`Services`, `CookClock`, `KeyValueStore` with a `Stores.Pass` only
      `Stores` makes); Alarm, Ringer, Sharing, LiveActivity, ResultsExport
      and the views stay, each on a framework only an iPhone has.
      `EggTimerAppTests` drives a cook to Done, a relaunch, the guard, Start
      again's unanswered egg and every write through `Stores`, on a clock
      the test moves. Everything there is `public`; narrowing it is 3.9's.
- [x] **1.3 A cycle check**: a node test over `import … from './x.js'`
      that fails on any cycle in `src/`. S. *Done* (`38894b0`,
      `test/cycles.test.ts`): every static import, bare import and
      re-export is an edge, type-used or not; only `import type` /
      `export type` and `import()` are not.
- [x] **1.4 Fixtures checkable on Linux**: round floats when written (e.g.
      12 significant digits) so `fixtures:check` isn't arm64-only and the
      diffs can be read. Swift already compares at 1e-12. S-M. *Done* (`85eb483`),
      not by rounding: the fixtures carry inputs that must reach Swift
      exactly (a half-way °F, an id in fractions of a millisecond), and a
      rounding boundary still splits two platforms' values. `fixtures:check`
      (`tools/fixturesCheck.ts`) holds numbers to Swift's 1e-12 and all
      else exactly, lists what differs by path, and runs in CI's Linux
      `web` job; x86 and arm64 Linux pass against the macOS fixtures.
- [x] **1.5 One compile per `verify`.** It runs `tsc` six times, from
      `rm -rf dist`. Project references (`tsc -b`: core, app, tools, tests)
      and run each step from that build. M. *Done:* three projects
      (`tsconfig.core.json`, `tsconfig.app.json`, `tsconfig.json` for the
      tests, tools and server), built by `tools/build.mjs`, which every
      script calls; it builds from scratch when a file is added, deleted or
      renamed or the packages change, which `tsc -b` alone gets wrong.
      `build:site` copies the app's part of that build (`sitePaths.mjs`),
      byte for byte what `tsconfig.site.json` emitted, which is gone.
- [x] **1.6 `npm run validate`**: in `verify`, or stop citing "29/29" in
      PLAN as if it were a gate. S. *Done:* in `verify` and CI's web job;
      it takes about 4 s.
- [x] **1.7 The e2e only through a test-facing `snapshot()`.** `tools/e2e.ts`
      imports live app modules 25 times and reads `state` directly, so the
      refactor it should protect breaks it. Load the dev clock (`now.ts`,
      `window.aetClock`) by a dynamic import on localhost only, not in every
      build. S-M. *Done:* `window.aetTest` (`src/ui/dev/test.ts`:
      `snapshot()`, `whenIdle()`, `t()`, `timeOfDay()`); the harness imports
      no app module. The development clock is `src/ui/dev/clock.ts`, which
      `main.ts` imports on localhost only; `build:site` leaves `src/ui/dev/`
      out, and `devServer.ts` serves it beside the site from `dist/`.
      `now.ts` keeps `nowMs()` and a hook for the clock.
- [x] **1.8 iOS e2e: the ~12 fixed sleeps that assert that nothing
      happened** (`iosE2e.mjs:684, 692, 824, …`) pass vacuously on a slow
      runner: step, wait for settled, then assert. Emit the debug log as
      JSON lines, not free text matched by 106 regexes. Convert the file to
      TS. M. *Done* (`630f5e0`, `599fdb4`, `2e0bf86`, `79e31da`, `55a45f5`,
      `b439636`): `Screenshots.Event`, one JSON object a line; every step
      waits for the app's `idle` (cook, planner, change in hand, taps, a
      redraw), and the nine sleeps and the quiet-second reads became steps
      and ticks; the plist read after the app says it wrote; `tools/iosE2e.ts`.
      Under load it found two checks that had passed by luck (LOGBOOK, 10
      October 2026).
- [x] **1.9 One web harness, and an app that says when it is idle.** The
      copy snapshot (`tools/copy-snapshot.html`) is a third harness with its
      own scenarios, its own frozen clock, and since `8da5b76` its own copy
      of the e2e's settle wait (`__busy`, timers ≤ 2 s; `tools/e2e.ts`'s
      `__pending`, ≤ 5 s), both by monkey-patching `setTimeout`, `Worker`
      and `fetch`. Its fixed sleeps meant the draft proofs had missed the
      certainty lines in nearly every capture: settled, 152 of 172 states
      differ from an old capture of the same build (LOGBOOK, 9 October
      2026). The harness is served from the tree it captures, so no commit
      before `8da5b76` can be captured settled. Give the app a test-build
      `whenIdle()` and an injected clock and random source (the nudge draws
      `Math.random()`, `answer.ts:93`), run the copy capture as e2e
      scenarios, and serve the harness from HEAD against any commit's
      build. M. *Done:* the app sets a person's timers, sends its worker
      jobs and makes its requests through `src/ui/idle.ts`, and
      `aetTest.whenIdle()` waits on its counts; the nudge draws from
      `now.ts`'s `random()`, seeded by `?seed=`; the clock is the
      development clock, stopped. `tools/copy-snapshot.html` is gone: its
      39 scenarios are `copy/…` in `npm run e2e` (`tools/copyScenarios.ts`),
      and `copySnapshot.js capture` writes their 172 states in the same
      format. `--tree <dir>` serves another checkout's build to today's
      harness, for any commit from this one on; a commit before it has no
      test API and no counts, and would need the patching back.

## 2. Delete

### Copy

- [x] **2.1 The applied drafts** ✔. `tools/drafts/` is 50 files, 6,675
      lines, all compiled on every build; nothing replays them (each proof
      reads one draft against its own base commit). Keep only the drafts not
      yet approved; git and LOGBOOK keep the rest. Point
      `test/copyDraft.test.ts` at a synthetic draft. Rule: a draft is deleted
      when the owner approves it. S.
- [x] **2.2 OWNER: retire drafts for the usual i18n workflow.** Every word
      is in `copy/*.json` and `copy:literals` keeps words out of the code,
      so what changed is the catalogue's diff. What multi-platform projects
      do, mapped here:
      - *Approval as state, not a hand list.* `copy/approved.json` holds,
        per key, a hash of the English the owner approved. The review queue
        is every key whose text no longer matches: generated, never typed.
        A script stamps the hashes when the owner approves.
      - *Translations know their source* (gettext's fuzzy, XLIFF's
        needs-review, a TMS's "source changed"). The American overlay
        already does it: each entry carries `base` and `copy.test.ts` 7a
        fails when it parts from the English (`LANGUAGE.md` §2). Give the
        1750 twins, and Czech (F5), the same `base`. A stale twin is
        listed, and falls back or fails by policy (4.6), so a wording change
        no longer needs every twin rewritten in the same commit. Without
        this, every draft would need Czech rewritten too once F5 lands.
      - *Context for the reviewer*: a generated review page of the queue,
        old and new, the twins, the surface's budget and the states it
        shows in (the copy snapshot already maps strings to states).
      - *"Nothing else changed"*: per-state text snapshots taken by the e2e
        suites (1.9), diffed in review, in place of a third harness.
      Goes: `tools/drafts/` (6.7k), `copyDraft.ts`, `--since` and
      `compare --draft`. Stays: the no-literals lint, the budgets. A TMS
      (Weblate is git-native and free for open projects) only if Czech's
      reviewer wants a UI. M. *`DECISIONS.md` 106; being built by the 0.5
      session (`copy-review-queue`), baseline `e3a81cb`.*

### Comments (owner-approved)

- [x] **2.3 The rule, in CLAUDE.md** (`DECISIONS.md` 105; in CLAUDE.md at
      `f7b8a34`): a comment says what the code does and
      why, in terms of the code. A decision number only where the code
      would look wrong without it (z ≈ 4.65 K), never as a changelog.
      History is in the commit message, which cites `DECISIONS.md`; the
      narrative goes to `LOGBOOK.md`. The 0.4 sweep (WORKLIST §8.1) kept the
      citations, and 0.5 added 279 lines of them back.
- [ ] **2.4 The sweep**, the 0.5 files first: `src/core/running.ts` (33
      citations), `ios/App/Cook.swift` (26), `src/ui/cook.ts` (19),
      `src/core/record.ts` (17), `render.ts`, `reach.ts`, `Record.swift`,
      `Running.swift`. "review N.N", dated "until 5 October" and "older than
      the rule" go; the reason stays, in the code's terms. Test names that
      carry history ids ("1c2.", "5b") go too. M.

### Back-compat (DECISIONS 48 allows all of it, unless marked)

Only one old format is on real users' devices: 0.3's `calibration.v4`, the
eggs they have logged. It stays (`DECISIONS.md` 81). The rest:

- [x] **2.5 Formats that only ever existed on unreleased builds**: `aet.cook.v3`
      / iOS `cookInProgress.v2`; the single-string unread-cook readers
      (`calibrationStore.ts:408, 427`, `Calibration.swift:480`);
      `aet.calibration.v3`; `Attest.madeAt` optional; AppClock's
      `-clockOffset`/`-clockEpoch` older form; the e2e `upgrade` scenario. S.
      *The readers, keys and scenario went with 107's sweep (their keys stay
      on its list); left were `madeAt`'s old-record default and the older
      clock arguments, gone in the commit that ticks this.*
- [x] **2.6 Old cooks kept aside that nothing reads.** `takeOldCooks`,
      `keepUnreadCook`, iOS `oldKeys` / `unreadCookKey`: `eggsImport.ts:152`
      passes them over. Delete; keep only iOS ending old Live Activity cards.
      Cost: a 0.3 user mid-cook at the deploy loses one unanswered egg.
      OWNER (amends 81/97). S.
- [x] **2.7 `CookActivity`'s legacy fields** (`doneness`, `peakYolk`,
      `eggMass`, `cooling`, optional `countsUp`/`cook`/`lang`): a Live Activity
      lives 8-12 hours. S. *A card 0.3 began is no longer read
      (`ios/README.md`).*
- [x] **2.8 The second guard.** D81's in-place unread records, `overlay` /
      `Kept.stored`, `moved` and the positional re-merge (written three
      times: TS, Swift, `eggsImport.ts`) defend against an older build
      writing a newer one's records, which the guard (D100) now prevents in
      every build that has them. Replace with: an unreadable record keeps
      the store text aside once and rebuilds. Close the guard's gap first:
      iOS marks with `MARKETING_VERSION` only, so two TestFlight builds of
      0.5.0 are equal to it. OWNER (amends 81). M.
- [x] **2.9 Stop writing the `t` column.** It buys nothing: 0.3 rewrites
      the log from the fields it knows either way. OWNER (81). S.
- [x] **2.10 `tauAirScale`** (D95 holds it at 1.0): 27 occurrences in TS
      core, 25 in Swift, compared bit-for-bit, stored in the running cook's
      `asRan`. A constant, out of `ModelParams` and `asRan`; bump the cook key.
      M. *Done (`f4898be`):* out of `ModelParams`, `GridRequest`,
      `buildDoseGrid`, `coolingTemperature` and `asRan`, both apps; every
      fixture number bit for bit as before. The cook key is not bumped: a
      stored cook with the field still reads, so a cook running at the
      upgrade is kept. `npm run probe` and `rank` vary it through
      `studies/perturbed.ts`, unchanged in what they print.
- [x] **2.11 One sweep of old keys at boot**, after the guard says this
      build may write: delete any `aet.*` key not on the current list (iOS: a
      retired-keys list, including the orphaned `probeAsked`). It replaces
      the per-store deletions, and `loadCook()` removing `aet.cook.v1` on
      every read across 15 call sites. S.

### Dead code and parameters

- [x] **2.12 `snapRetry`** ✔ is `true` in every production call (web, iOS,
      both running cooks); only `tools/fixtures/reach.ts` passes `false`, and
      the doc at `reach.ts:395` says otherwise. Remove it and its fixture
      rows. S.
- [x] **2.13 Exports used only in their own file or only by tests**:
      `NO_EVENTS`, `eggStartOf`, `likelyTimeRange`, `oddsAtLevel`,
      `slowHobHintFits`, `posteriorAlphaRelSd`, `posteriorMeanOffset`,
      `LITERATURE_START`, `volumeKey`, `jsonString`, the unit constants,
      `yolkWordIndex`, `yolkWordBands`, `templatesOf`; web `controlsChoices`;
      `machine.ts` (23 lines) into `phaseView.ts`. Finishes SHIP-0.5 E's
      last item. S. *Kept exported: what a tool imports (`posteriorMeanOffset`,
      `yolkWord*`, `templatesOf`), what a test checks as a unit of its own
      (`oddsAtLevel`, `slowHobHintFits`, `posteriorAlphaRelSd`, `volumeKey`,
      `jsonString`, and the like in `server/` and `src/ui/now.ts`), every type
      an exported function names, and `tools/fixtures/` (another branch's).*
- [x] **2.14 The three-way yolk answer** (−1/0/1): never written now, still a
      branch in `answerLikelihood` with ~115 fixture rows. Kept by D81 for
      the owner's log; it goes only with a one-off rewrite of that log.
      OWNER. S.

### Repo, docs, branches

- [x] **2.15 Closed documents to `archive/`** (or delete; git keeps them):
      WORKLIST (795, "every item is done"), FOLLOWUP (0 open), REVIEW-0.4.x,
      SHIP-0.4 once 0.4 ships, and the three design reviews with
      near-identical names (`one-screen-review.md`, `onescreen-review.md`,
      `running-cook-review.md`). Fix PLAN's map (it omits three files) and
      PLAN.md:40 ("on this branch, `0.4.x`"). Already decided for
      WORKLIST/FOLLOWUP after `tidy2` (SHIP-0.5 E). S. *WORKLIST and
      FOLLOWUP deleted (in git at `14603cd`); REVIEW-0.4.x and the three
      reviews in `archive/`. SHIP-0.4 stays: its open release items (the
      privacy page's OWNER marks, App Privacy, App Attest) are 0.5's now.
      PLAN's map is the merging session's (DECISIONS 104).*
- [x] **2.16 Studies out of `tools/`**: identifiability, rank, probe +
      perturbed, decide (INFERENCE §8's numbers), shape-study, into
      `studies/` with their own tsconfig, out of the default build, each
      with a line saying which document quotes it. S. *`studies/tsconfig.json`
      references the root project, since `decide.ts` uses `tools/common.ts`;
      `posterior.ts`, which the tests import, stays in `tools/`.*
- [x] **2.17 38 worktrees, 45 branches, 42 of them merged.** Pruned by the
      owner, 9 October 2026: 30 merged, clean worktrees and their branches;
      13 worktrees and 25 branches left.
- [x] **2.18 Web build**: `build:site`'s 11-step one-liner into
      `tools/buildSite.mjs`; point `index.html` at `app/` everywhere so
      `sitePaths.mjs` can go; fix netlify.toml's stale comments. S.
      *Done in part:* the script, `_site/` byte for byte as the one-liner
      made it, `sw.js` included. Left: `index.html` at `app/` (the repo
      root, served as it is, loads `dist/`) and netlify.toml's comments,
      which change the site's bytes (`precache.mjs` hashes netlify.toml
      into the build's name), so each is its own change. *Both done:*
      `index.html` asks for `app/` and `sitePaths.mjs` is folded into
      `buildSite.mjs` (`b2496bc`; `npm run serve`, the repo root, goes,
      since the page no longer loads there); netlify.toml's comments (`2345aee`).

## 3. Restructure

### The running cook as one state machine, in core

This is the biggest single source of drift. Core gives the apps pieces
(`replan`, `eventsDue`, `keepAsRan`, `asRanCorrected`, `cookEnding`) and
each app strings them together in its own order. The after-pull correction
is written three times (`cook.ts:342`, `AppModel.swift:366`,
`Cook.swift:308`). 0.3 and 0.4 above are that drift.

- [x] **3.1 `step(cook, event, env) → {cook, plan, need, effects}`** in
      core. Events: start, boil, correct, correctStart, out, stillIn,
      pullStands, tick, surfaceLanded, answered, startAgain. Effects:
      persist, askSurface, arm/cancel alarms, ring, log record, forget,
      send final. `eventsDue`, `keepAsRan` and the second plan go inside;
      the end-of-cook steps (log, remake, retry, held answers) are in it
      too. The fixtures become event traces; today's 83 `plans` rows check
      that behaviour hasn't changed. L.
      *Done* (10 October 2026, `core-step-0.5`): `step(state, event, env)`
      in `src/core/step.ts` (`Step.swift`), the state the cook, its plan
      and the lean; `need` is `askSurface` (the pot's surface, the
      calibration before this egg and its surface) and the next moment to
      wake; effects `persist`, `alarms`, `ring`, `silence`, `rememberBoil`,
      `log`, `forget`, `sendFinal`. 31 traces of 223 steps
      (`fixtures/step.json`), each e2e scenario and review finding that is
      the cook's named in it; the 85 `plans` rows unchanged. The apps still
      call the pieces (the transitions are now `step`'s parts, not wrappers
      of it): 3.7 and 3.9.
      *Open until 3.9 lands* (the red team of `4ecc06a`): nothing on iOS
      calls `step`, and `Cook.swift` still strings the pieces together
      itself, a second orchestration nothing holds to the first. *Closed* by
      3.9 (`ea2aab9`).
- [x] **3.2 `RunningCook` as start + choices + an append-only event log.**
      Today it has 13 fields, four of them partial correction history
      (`coldSince_s`, `firstHotAt_s`, `correctedAt_s`, `boilRemembered`)
      decoded by hand. "Changing a setting back gives back the old plan
      exactly" then holds by construction. M, with 3.1.
      *Done:* `start` and `log` (`CookEntry`), folded by `appendEntry`;
      `coldSince_s`, `firstHotAt_s` and `boilRemembered` are functions of
      the log. Stored as `aet.cook.v5` and `cookInProgress.v4`, the earlier
      keys swept. `takeUpEvents` and `correctedLater` moved into core from
      the web's store (two copies of one cook, `running.json` `takeUps`).
- [x] **3.3 The readout in core**: `readoutAt(cook, plan, now) → {keys,
      digits, sign, args}`. The web has it pure and tested (`phaseView.ts`);
      iOS spreads it over `ReadoutView`, `PhaseActions` and `AppModel.keys`
      (47 phase branches in views). M.
      *Done* in core (`readoutAt`, `readout.ts`, `Readout.swift`), held
      for every trace step; the web's `phaseView` renders it. iOS's views
      move onto it in 3.9. The spoken line is which line to say, since iOS
      speaks none of the web's `spoken.*` keys. iOS's readout and buttons are
      `readoutAt` since 3.9 (`ea2aab9`).
- [x] **3.4 One `inputsKey()` in core** with explicit number formatting,
      used by `replan` and both caches, in place of 17-field `===` checks,
      `JSON.stringify(inputs)` with field order that matters, and iOS's
      three representations of a cook. Then one of Codable or
      `readRunningCook` goes. M.
      *Done:* `inputsKey` (each number its 64 bits in hex) in `replan` and
      both apps' caches; the typed Codable of the cook went: a stored cook
      is read by `readRunningCook` alone, through an exact JSON value.
- [x] **3.5 The slow-hob hint becomes an opaque memo** the apps never read
      (`SlowHobHint`, `slowHobHintFits`, ~130 lines each side), or goes
      inside 3.1's state. M.
      *Done:* `plan.memo` (`SlowHobMemo`, opaque in Swift), keyed by what
      the rule read; `slowHobMemoFits`.
- [x] **3.6 `CookPlan` without its duplicates**: `level`,
      `provisional`, `askIfStillIn` and `lengthened` repeat other fields. S.
      *Done:* `answer.level`, `deadlines.provisional`, `asksIfStillIn`,
      `guessLengthened`.

### Each app as an effect runner over it

- [x] **3.7 Web: one `Model`, `update(model, msg, now) → [model, effects]`,
      `view(model, now)`** as pure structs (extending `phaseView`) plus a
      DOM writer once per animation frame. It ends: `state` written from
      five modules; `controls` that *is* `settings` while idle (an alias
      `readInputs` relies on); `render()` that starts worker jobs and steps a
      simulation; 10 direct `render` and 13 `recompute` calls; ~10 boot-time
      callback registrations; `now.ts` booting on import. About 2.5k lines
      reshaped. L, after 1.1 and 3.1.
      *Done for the running cook* (10 October 2026, `83ba983`): `Model`
      (`src/ui/model.ts`) extends core's `CookState`; `update` is pure and
      steps core's `step`; cook.ts runs its effects and builds its `need`
      (the wake at Done included, e2e `done-wakes`); `takeUpStored`,
      `endCook`, `refreshAsRan`, the held answers, the web's plan loop and
      record making went. *The page* (`60c9982`, `909b553`): every change
      to it is a message (the controls, the units, the language, the mute,
      the sound, another tab's settings, the pans, eggs folded, everything
      forgotten, the probe reading); the idle solve is pure (`solveIdle`,
      the surfaces and profiles in the model) and its asks are effects;
      `controls` is a copy of the settings while idle; `view(model, now)`
      (view.ts) as plain data, written by render.ts once an animation
      frame; the held certainty and the live egg in the model, the
      previews and what is drawn in caches handed in; `render` asks for
      nothing and steps nothing; the probe scored on core's record (e2e
      `probe-reading`); the modules under the runner send through send.ts.
      *The rest* (`136a32c`..`d584880`): the correction in hand and its
      gesture in the model (`Edit`), through `update`; the stores as
      objects opened at boot and held by the runner (`openLearner`,
      `openSharing`, `openSettings`, `openPans`, `openCooks`); `written`,
      `works` and `before` set by `update`; the boot-time callbacks
      messages; the development clock's hook set at boot; the model kept
      by the runner alone (`state` gone), its views of caches and stores
      handed to `update` (`Seen`); the controls, units, notes, learned and
      share sections drawn from the view (`Sections`). What stays, on
      purpose: the newest-build mark is store.ts's module state (the
      browser's storage is one per page); the test API and the start's −
      and + read the model through the runner (`pageModel`).
- [x] **3.8 Web: one `syncedKey<T>`** for cross-tab sync, written five
      times today (settings, boil, calibration, share, cook) with its own
      "seen" copy each; `takeUpEvents` (domain logic in `store.ts`) into
      core. M. *Done:* `syncedKey` in `store.ts`, each store on it with
      its own policy; e2e `two-tabs-settings`, `-pans`, `-log`,
      `-sharing`, `-cook`. `takeUpEvents` is still in `store.ts`, to go
      into core with the running cook's rework.
- [ ] **3.9 iOS: `Cook` as a value `CookState` and a pure step**, with a
      thin `@Observable` shell running effects. It ends the god object
      (state, restore, plan loop, alarms, ringing, Live Activity, debug clock,
      record making), the four closures AppModel wires in backwards, `generation`
      tokens (24 in Cook, 21 in Sharing), and `stillOpen` decoding
      UserDefaults on every tick. L, after 1.2 and 3.1.
      *Done for the running cook* (10 October 2026, `ea2aab9`, `ef043f4`):
      `Cook` holds core's `CookState` and steps it, one event at a time off
      the main actor; it runs the effects, builds what `need` asks for, and
      the readout and buttons are `readoutAt`. Its plan loop, record making
      and own too-old handling, AppModel's four closures, remake and held
      answers, Cook's `generation` tokens and `stillOpen`'s read of the store
      went; whether a tick has anything to decide is core's `tickDue`.
      *Not done:* Sharing's 21 `generation` tokens; `Cook` is ~990 lines,
      not thin: it still runs the alarms, the ring and the Live Activity
      itself (as effects) and writes the debug log; PhaseActions keeps a
      layout per phase (its words are the readout's).
- [x] **3.10 iOS: Planner as `choices: CookChoices`**, not 13 controls
      mapped by hand six times; `SolveLoop` and `Learning` as types in place
      of extensions that need ~15 bookkeeping vars left internal. M.
      *Done* (`58f236a`): `Planner.settings` (core's `AppSettings`), choices
      made from it and back (`adopt`), `Controls` gone (`AppSettings.same`,
      `take`); `SolveLoop` and `Learning` with their bookkeeping private.
- [x] **3.11 Settings as one value read by a core `readSettings`**, fixtured,
      in place of 14 literal keys written 2-3 times on iOS and
      `readSettings` clamping on the web. Free under D48. M.
      *Done* (`9cc0f26`, `09ef6ae`): `src/core/settings.ts` and
      `Settings.swift` (`AppSettings`), `fixtures/settings.json`; the web's
      store reads with it; iOS keeps one value, `settings.v1`, the fourteen
      keys swept.
- [x] **3.12 iOS: time as Double seconds** in app logic, `Date` only at
      SwiftUI and the system (58 conversions, 30 in Cook; `Attest` stored as
      seconds since 2001, unlike every other time). One `localDay`. S-M.
      *Done but one* (`6537cad`, `bbfb216`): the
      alarms and the ring's on-screen time in cook seconds, `Date` made in
      Alarm, Ringer and the views; `Attest`'s times epoch seconds under
      `sharing.attest.v2`; one `localDay`. *Not done:* `sharing.v1` still
      keeps the share state's `busySince` as seconds since 2001 (Sharing.swift
      `stored`/`read`): a new key would drop the share id and a deletion not
      yet confirmed. *Closed as it stands:* that is the conversion at the
      store's edge, where this item puts `Date`; the app's logic has the
      time in seconds, and the stored format need not change.

### Storage and model ids

- [ ] **3.13 One registry of stores in core**: name and format number,
      fixtured to Swift, with the version inside the payload, not the key
      (except the frozen calibration store). Today `aet.cook.v4` and
      `cookInProgress.v3` hold the same `RunningCook` and must be bumped
      together by hand. Not one envelope for everything: that would rewrite
      the 200 KB posterior on each slider move and break per-key cross-tab
      sync. M.
- [x] **3.14 Split `MODEL_ID`**: provenance (D37) and a likelihood id (the
      store's `m`, which forces a replay). A decision-only change (82aff4b,
      the nudge) replayed every posterior. Pin a digest of a fixed-log
      replay in a test, so a likelihood change fails until the id moves.
      S-M.
      *Done* (10 October 2026): `MODEL_ID` is the record's `model` only;
      `LIKELIHOOD_ID` (the same value today) is the store's `m` and what
      `loadDecision` compares, in both apps. `test/record.test.ts` 2e pins
      a six-egg replay at the apps' prior, count and grid to it at 1e-9.

### Core, smaller

- [x] **3.15 `policy.ts` by subject**: `phaseAt`, `Deadlines` and the
      slow-hob/grace constants to the running module; `shareReply` /
      `shareGivesUp` to `share.ts`; alarm sounds apart. Policy.swift is the
      most-churned Swift file. S-M.
      *Done:* `inputs`, `slider`, `texture`, `boil` and `sounds`, each a
      module, a Swift twin and a fixture; the phases to `running`, the
      replies to `share`, the calibration grid to `record`. Every fixture
      value moved unchanged.
- [ ] **3.16 One time unit**: `startCook(now_ms)` and `share.answered(now)`
      take ms, everything else seconds. S.
      *Half done:* the running cook's API is seconds (`startCook(now_s)`;
      the record's id stays ms). `share.answered` still takes ms: its
      stored `busySince` is ms, a format change of its own.
- [x] **3.17 Core only what the apps must agree on.** `deadlineToRing` is
      iOS-only logic in EggTimerCore with no twin; one-liners
      (`effectiveUnits`, `languageOf`) don't earn a twin. S.
      *Done:* `deadlineToRing` to EggTimerApp, the notification sound's
      length to `src/ui/alarmSounds.ts`. `effectiveUnits` and `languageOf`
      stay: core calls both itself (`chooseUnits`; `copy`, `format`,
      `language`), and neither has a fixture of its own.
- [ ] **3.18 Generate the Swift data layer** (types, defensive readers,
      Codable, `jsonObject`) from the TS interfaces: that is where the copies
      drifted (Running 967 Swift code lines against 727 TS; Share 162
      against 91). Not the whole core: running TS in JavaScriptCore loses
      the JIT, and a surface would take seconds. M-L.
- [x] **3.19 Fixtures as one row per line**, and event traces (3.1) in
      place of whole plans per row: 2.6 MB, and since 1 October 11× the
      churn of the code they pin. M.
      *Done* (10 October 2026): still JSON, a row a line (`fixtureLayout`;
      `step.json` a step a line), every value as it was; 3.83 MB in
      145,507 lines to 2.46 MB in 8,483. `running.json`'s 85 `plans` rows
      stay while the apps call the pieces (3.7, 3.9).

## 4. Process

- [x] **4.1 PLAN updated at merge, by the merging session**, not in each
      working commit: it is touched by 25% of commits and is a merge hotspot
      across worktrees and the QA agent. `DECISIONS.md` 104; in CLAUDE.md at
      `f7b8a34`.
- [ ] **4.2 LOGBOOK frozen per version** (`LOGBOOK-0.4.md`); its "Things that
      cost an hour" (twice, at :78 and :6059, and inline three more times)
      into one edited `GOTCHAS.md`. S.
- [x] **4.3 Fewer version lines.** 0.4 hasn't shipped and 0.5 forked from
      it, so `0.4.x` and `0.5.x` are one line in practice, and each fix is
      built per line (`0.4.x-newer-version-guard`, `0.5.x-…`). `DECISIONS.md` 102:
      ship 0.5 as the next release and retire `0.4.x`. The branch rule
      is in CLAUDE.md (`f7b8a34`). The owner moves the main checkout and the
      QA agent to `0.5.x` once the QA items on `0.4.x` are done, merges
      `0.4.x` into `0.5.x` and deletes it. 0.4 never ships
      (the owner, 9 October 2026: 0.3 is still in Apple's review and 0.5
      will be done first), so the only formats on users' devices are 0.3's.
- [x] **4.4 Counts out of comments**: verify.yml says 16 iOS scenarios
      (40), PLAN says web 37 (35). S. *Done:* verify.yml and README's e2e
      count (`e0f4de2`); no other comment counts scenarios or tests. PLAN's status
      line is the merging session's.
- [x] **4.5 The guard's sharp edges in RELEASING**: a Netlify rollback to
      an older *0.5* alpha freezes every browser that ran the newer one;
      `devServer`'s fixed port shares one localStorage across worktrees. S.
      *Done (`46be264`):* `ios/RELEASING.md`, Rolling back: roll forward instead, and a
      port per worktree.
- [x] **4.6 The 1750 English may lag**: `DECISIONS.md` 103. Today
      no key is missing (370 of 371; `app.name` is the same in both), and
      core's catalogue already falls back to `en` for a missing key
      (`src/core/copy.ts:137`). What changes is the rule and its test: a
      wording change may ship without its 1750 twin, and the twins are
      written in batches.

## 5. The red team of `4ecc06a` (10 October 2026)

Of `6eeff78..4ecc06a`, 121 commits. The equivalence discipline in core,
107, the deletions, the review queue, the harnesses and 1.2 held up. What
it found, in its order, with where each is being done:

- [x] **5.1 Gates before more restructure.** 1.1 was not done, yet 3.7
      and 1.2 went in behind it. And "85 of 85" overstated the web
      e2e: the 39 copy states assert nothing. Do 1.1 now, and either make
      the copy states assert or stop counting them as checks. The rest of
      3.7 and 3.9 merge only after it. *Done* (`917aa8e`): every copy
      state checked as it is captured, the certainty line by the page's
      own state, and a scenario that asserts nothing is not counted; the
      six sous-vide copy states had been capturing the cold idle screen
      since `d12a978` (`1e0fd3e`).
- [x] **5.2 iOS is not on `step`/`readoutAt`** (3.1, 3.3 reopened): 3.9
      deletes `Cook.swift`'s own orchestration, about 24 calls.
- [x] **5.3 ~~The fixture check is too loose for TS against TS** (1.4): the
      bound divides by max(|x|, 1), so 116 nonzero values under 1e-12 may
      change freely, sign included. A pure relative bound (about 1e-13,
      against a measured spread of 7.3e-15) with a denormal floor; Swift's
      slack stays in conformance only.~~ *Not done* (the owner, 10
      October 2026: the platforms measured for it are "an excessively broad
      selection"). The check asks whether the TypeScript changed the
      numbers, and a real change moves them far past 1e-12; 1e-13 made the
      last bits of one processor's arithmetic a matter for the gate.
      Built (`03e4f9c`) and reverted.
- [x] **5.4 CLAUDE.md's `ios:build` rule** named `ios/Shared`, which is
      gone, and not the package's `EggTimerApp`/`EggTimerShared`, which
      `verify` builds for macOS only. It now covers all of `ios/` but the
      core twin, the e2e rule is in it, and the stale paths are fixed.
- [x] **5.5 iOS 0.3 and 0.4 tested, not only driven**: Swift tests for
      both; `remakeThenEnd` retries once, not four times on the same
      inputs; and whether a relaunch within the hour brings back a cook
      dismissed with Start again (the web keeps it off screen). *Done*
      (`7e9baf4`): through the real `AppModel` with fakes; a failed remake
      is tried once; the relaunch case tested.
- [x] **5.6 One logical change per commit.** *The scenario:* e2e
      `later-answer-refolds` (`452069f`). `83ba983`, `60c9982` and
      `d231a5b` put behaviour changes inside refactor commits. That can't be
      undone, but "a later answer re-folds the log" gets a named
      scenario, and from now on a behaviour change is its own commit.
- [x] **5.7 The web's pure core unit-tested**: one `update` test per
      message kind (about 12 of 27 are sent today), and `view` per
      section, with 3.7. *Done* (`fa86090`, `38c57bd`): test/update.test.ts,
      every kind of message; view.test.ts 6, the sections.
- [x] **5.8 3.7 half old, half new**: `update.ts` is an effect helper
      (to `effects.ts`); `cook.ts` writes the model outside `update`; the
      settings, units, notes, learned and share sections are still DOM
      effects; `state` is read in 8 modules; the module `let`s moved, not
      reduced (49 → 50). *Done* (`070117e`, `38c57bd`, `a9a339a`): the
      runner keeps the model and nothing else reads it but through
      `pageModel` (2 modules); `^let ` in src/ui 51 → 35.
- [x] **5.9 `PLAN.md` stale across 11 merges** (against 104), and
      CLAUDE.md's `policy.ts`, 106's `copy/approved.json`, and 102-108
      without commits: brought up to date.
- [ ] **5.10 D105 in new code**: 24 lines in `src/ui` cite decisions or
      reviews, "REFACTOR-0.5 N.N" in `Package.swift`, `ios/README` and
      e2e descriptions, 29 "review N.N" labels in `tools/fixtures/step.ts`.
      Each working branch cleans what it touches; 2.4 sweeps the rest.
      *src/ui and tools/e2e.ts done* (`33fc8c1`).
- [ ] **5.11 Smaller**: exports reachable only from tests and fixtures
      (`coldHistory`, `slowHobMemoFits`, `sameAsRan`,
      `sameDecisionInputs`); stale comments (`decide.ts:113`,
      `Running.swift:384`); `step` compares cooks with `===` in TS and
      `==` in Swift; `readProbe` returns `undefined` as a third state; the
      folded legacy fields written and never read (`running.ts` 191-229);
      3.16's `share.answered` in ms (a key bump, 48); `nonisolated(unsafe)`
      6 → 12 and 417 declarations made public wholesale; `#if DEBUG` 75 →
      89; 2.11's sweep a fixed list, not "any `aet.*` not current"; the
      `studies/` build outside `verify`. *Done:* the studies type-checked
      (`297e3aa`); `sameCook` alike in both (`7de8775`); `Running.swift`'s
      comment. The rest after the refactor, with 5.12's deletions.
- [ ] **5.12 The tests sit where the code is already safe** (the red
      team's audit of the suite at `4ecc06a`). Core is 98% covered (400 of
      408 functions); `src/ui` 253 of 479, with `cook.ts` 0/33, `edit.ts`
      0/19, `update.ts` 0/12, `controls.ts` 0/12, `input.ts` 0/7,
      `clock.ts` 1/26 and `render.ts` 1/10, and `test/views.test.ts`
      importing every module and asserting nothing else. Conformance holds
      the two cores alike, not the two apps; review findings got a core pin
      or a scenario that could not fail, not a test where the bug was.
      Each test is named by its behaviour. The holes, and when:
  - [x] *Hole 1, in 3.9* (`7e9baf4`): iOS's end of cook through the real `AppModel`
        in `EggTimerAppTests`: an answer held at Start again is logged
        with it (today only `yolkWord == nil`); a failed remake leaves the
        cook stored, not final; a correction at Done, then Start again,
        logs the corrected egg.
  - [x] *Hole 2, in 3.7* (`01ff934`, `86977ef`): the web's effect runner (`cook.ts`) against a
        fake store: the log written before the cook is forgotten; a failed
        remake keeps the cook stored; send-final only after logging; no
        surface asked twice.
  - [ ] *Hole 3, with 0.8:* one table of raw stored blobs through each
        app's real load path, the web's store and iOS's `Stored`
        (`Cook.swift`) then `readRunningCook`, both accepting or refusing
        the same rows.
  - [x] *Holes 4-6, after the gates (1.1):* 6 done (`917aa8e`); 4 and 5 done (`fa86090`,
        `b6a0be3`, `1cf2c41`); `test/views.test.ts`'s import of every
        module is test/modulesLoad.test.ts (`3fd8aaa`). `edit.ts` and `update.ts` (a
        preview never commits; a settle commits once; forget-all in
        another tab is not undone; the open egg is the stored one); the
        web's ticker and ring (`clock.ts`: one ring per deadline, none in
        the background, none for a deadline passed before the page was
        shown; iOS has `RingTests`); the copy states asserting (no raw key
        on screen, the certainty line where expected). 4 and 5 are with
        the 3.7 agent and 6 with the gates agent, so each merges once the
        gates are in.
  - [ ] *The deletions and renames, after 3.7 and 3.9 merge* (about 350
        lines, some 40% of `npm test`'s time): `test/machine.test.ts` for
        one step-driven tick trace in `step.test.ts` (the counter rest
        rings PULL then DONE; a cold start stays HEATING);
        `running.test.ts` 23, 24 and 29 for one seeded property over 0-2 h
        and 29's boundaries; four tautologies (`YOLK_RADIUS_FRAC`,
        `LEAN_RATIO`, `YOLK_WORD_CUTS.length`, `PullLineTests.keys`); one
        copy each of the tests `core.test.ts` and `validate.ts` share (7b,
        9, 15b); the 20 titles citing review or decision numbers renamed
        by behaviour, and the drifted ordinals (record 4b4/4b5, copy's two
        1e).

**Size.** Outside the fixtures and the drafts the repo grew about 7.9k
lines; shipped code 39.4k → 42.2k (core +15%, the Swift core +12%, the
iOS app and its package +6.6%). Section 3 is measured from here by the
lines it removes from the apps, not the lines it adds to core.

## The owner's decisions in this list

2.2 (lighter drafts), 2.6, 2.8, 2.9 and 2.14 (each amends `DECISIONS.md`
81), 2.17 (worktrees), 4.1 (CLAUDE.md), 4.3 (retire `0.4.x`), 4.6 (1750
fallback). Decided 9 October 2026: 2.2 (106), 2.3 (105), 4.1 (104), 4.3 (102),
4.6 (103). And 107 (`cd0c260`): the log starts fresh in 0.5 and 81's protection
goes, so 2.6, 2.8, 2.9, 2.11 and 2.14 are one change, merged to `0.5.x`
(`11fc3ef`; the boot sweep deletes v4 too, `6eeff78`) and being built by
the 0.5 session. 108 is taken; new entries from 109.

## Suggested order

0.x → 1.1, 1.3, 1.7, 1.9 → 2.1, 2.3-2.5, 2.12-2.13, 2.15-2.16 (deletions with
no decision needed) → 1.2 → 3.1-3.4 (core) → 3.7-3.11 (apps) → the rest.
Of the size: 2.1 and 2.15-2.16 alone take ~9k lines out of the build and
the root; the comment sweep and back-compat a few thousand more; 3.x mostly
reshapes rather than shrinks, but ends the drift that makes every change cost
two ports and a review.
