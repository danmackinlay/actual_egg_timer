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
- [ ] **0.4 iOS drops an answer held at Start again**. `AppModel.startAgain`
      logs the unanswered egg with no yolk or white, then clears `held`; the
      web logs `heldAnswers()` (`cook.ts:504`). S.
- [ ] **0.5 iOS: one render reads the clock several times**. `ReadoutView`'s
      big time uses `cook.secondsToPull`, which reads `AppClock.now` itself,
      not the `TimelineView`'s `now`; `Cook` reads `AppClock.now` 24 times.
      Pass `now` in. S.
- [ ] **0.6 Web: two import cycles** ✔, though B1 says there are none:
      `render.ts:55` ↔ `update.ts:25`, and `edit.ts:43` ↔ `cook.ts:34`. Move
      `warningText` to a leaf; hand `correctCook` in. S.
- [ ] **0.7 Web: the hourly update check runs on the dev clock**
      (`src/ui/offline.ts:74`, `nowMs()`), against `now.ts`'s own rule. S.
- [ ] **0.8 The two apps accept different stored cooks.** TS refuses a cook
      with no `asRan` key (`running.ts:502`); Swift's Codable path turns it
      into nil, so `Running.swift:520`'s check cannot be reached. Comes free
      with 3.4. S.

## 1. Gates: make the code safe to change

0.3 and 0.4 are the end-of-cook logic drifting between the apps, and no
gate could catch it.

- [ ] **1.1 The e2e suites can't fail anything** ✔. Both CI jobs are
      `continue-on-error: true` (`.github/workflows/verify.yml:80, 109`);
      neither is in `npm run verify`; CI runs only on a push. 56% of `src/ui`
      (cook, render, feedback, edit, clock, update) and all of the iOS app
      logic are checked by nothing else. Make both jobs blocking, and add
      `npm run e2e` / `npm run ios:e2e` to the CLAUDE.md rule for commits
      touching `src/ui` or `ios/App`. S.
- [ ] **1.2 An iOS app test target.** `project.yml` has `testTargets: []`.
      Cook, AppModel, Planner, Store, DecisionGrids and AppClock import only
      Foundation, Observation and core, so they can move into an
      `EggTimerApp` target in `ios/EggTimerCore/Package.swift` and be tested
      by the `swift test` already in `verify`. Protocols for the six
      singletons, `AppClock` and `UserDefaults`. L, the base for 3.x.
- [ ] **1.3 A cycle check**: a node test over `import … from './x.js'`
      that fails on any cycle in `src/`. S.
- [ ] **1.4 Fixtures checkable on Linux**: round floats when written (e.g.
      12 significant digits) so `fixtures:check` isn't arm64-only and the
      diffs can be read. Swift already compares at 1e-12. S-M.
- [ ] **1.5 One compile per `verify`.** It runs `tsc` six times, from
      `rm -rf dist`. Project references (`tsc -b`: core, app, tools, tests)
      and run each step from that build. M.
- [ ] **1.6 `npm run validate`**: in `verify`, or stop citing "29/29" in
      PLAN as if it were a gate. S.
- [ ] **1.7 The e2e only through a test-facing `snapshot()`.** `tools/e2e.ts`
      imports live app modules 25 times and reads `state` directly, so the
      refactor it should protect breaks it. Load the dev clock (`now.ts`,
      `window.aetClock`) by a dynamic import on localhost only, not in every
      build. S-M.
- [ ] **1.8 iOS e2e: the ~12 fixed sleeps that assert that nothing
      happened** (`iosE2e.mjs:684, 692, 824, …`) pass vacuously on a slow
      runner: step, wait for settled, then assert. Emit the debug log as
      JSON lines, not free text matched by 106 regexes. Convert the file to
      TS. M.
- [ ] **1.9 One web harness, and an app that says when it is idle.** The
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
      build. M.

## 2. Delete

### Copy

- [ ] **2.1 The applied drafts** ✔. `tools/drafts/` is 50 files, 6,675
      lines, all compiled on every build; nothing replays them (each proof
      reads one draft against its own base commit). Keep only the drafts not
      yet approved; git and LOGBOOK keep the rest. Point
      `test/copyDraft.test.ts` at a synthetic draft. Rule: a draft is deleted
      when the owner approves it. S.
- [ ] **2.2 OWNER: retire drafts for the usual i18n workflow.** Every word
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

- [ ] **2.5 Formats that only ever existed on unreleased builds**: `aet.cook.v3`
      / iOS `cookInProgress.v2`; the single-string unread-cook readers
      (`calibrationStore.ts:408, 427`, `Calibration.swift:480`);
      `aet.calibration.v3`; `Attest.madeAt` optional; AppClock's
      `-clockOffset`/`-clockEpoch` older form; the e2e `upgrade` scenario. S.
- [ ] **2.6 Old cooks kept aside that nothing reads.** `takeOldCooks`,
      `keepUnreadCook`, iOS `oldKeys` / `unreadCookKey`: `eggsImport.ts:152`
      passes them over. Delete; keep only iOS ending old Live Activity cards.
      Cost: a 0.3 user mid-cook at the deploy loses one unanswered egg.
      OWNER (amends 81/97). S.
- [ ] **2.7 `CookActivity`'s legacy fields** (`doneness`, `peakYolk`,
      `eggMass`, `cooling`, optional `countsUp`/`cook`/`lang`): a Live Activity
      lives 8-12 hours. S.
- [ ] **2.8 The second guard.** D81's in-place unread records, `overlay` /
      `Kept.stored`, `moved` and the positional re-merge (written three
      times: TS, Swift, `eggsImport.ts`) defend against an older build
      writing a newer one's records, which the guard (D100) now prevents in
      every build that has them. Replace with: an unreadable record keeps
      the store text aside once and rebuilds. Close the guard's gap first:
      iOS marks with `MARKETING_VERSION` only, so two TestFlight builds of
      0.5.0 are equal to it. OWNER (amends 81). M.
- [ ] **2.9 Stop writing the `t` column.** It buys nothing: 0.3 rewrites
      the log from the fields it knows either way. OWNER (81). S.
- [ ] **2.10 `tauAirScale`** (D95 holds it at 1.0): 27 occurrences in TS
      core, 25 in Swift, compared bit-for-bit, stored in the running cook's
      `asRan`. A constant, out of `ModelParams` and `asRan`; bump the cook key.
      M.
- [ ] **2.11 One sweep of old keys at boot**, after the guard says this
      build may write: delete any `aet.*` key not on the current list (iOS: a
      retired-keys list, including the orphaned `probeAsked`). It replaces
      the per-store deletions, and `loadCook()` removing `aet.cook.v1` on
      every read across 15 call sites. S.

### Dead code and parameters

- [ ] **2.12 `snapRetry`** ✔ is `true` in every production call (web, iOS,
      both running cooks); only `tools/fixtures/reach.ts` passes `false`, and
      the doc at `reach.ts:395` says otherwise. Remove it and its fixture
      rows. S.
- [ ] **2.13 Exports used only in their own file or only by tests**:
      `NO_EVENTS`, `eggStartOf`, `likelyTimeRange`, `oddsAtLevel`,
      `slowHobHintFits`, `posteriorAlphaRelSd`, `posteriorMeanOffset`,
      `LITERATURE_START`, `volumeKey`, `jsonString`, the unit constants,
      `yolkWordIndex`, `yolkWordBands`, `templatesOf`; web `controlsChoices`;
      `machine.ts` (23 lines) into `phaseView.ts`. Finishes SHIP-0.5 E's
      last item. S.
- [ ] **2.14 The three-way yolk answer** (−1/0/1): never written now, still a
      branch in `answerLikelihood` with ~115 fixture rows. Kept by D81 for
      the owner's log; it goes only with a one-off rewrite of that log.
      OWNER. S.

### Repo, docs, branches

- [ ] **2.15 Closed documents to `archive/`** (or delete; git keeps them):
      WORKLIST (795, "every item is done"), FOLLOWUP (0 open), REVIEW-0.4.x,
      SHIP-0.4 once 0.4 ships, and the three design reviews with
      near-identical names (`one-screen-review.md`, `onescreen-review.md`,
      `running-cook-review.md`). Fix PLAN's map (it omits three files) and
      PLAN.md:40 ("on this branch, `0.4.x`"). Already decided for
      WORKLIST/FOLLOWUP after `tidy2` (SHIP-0.5 E). S.
- [ ] **2.16 Studies out of `tools/`**: identifiability, rank, probe +
      perturbed, decide (INFERENCE §8's numbers), shape-study, into
      `studies/` with their own tsconfig, out of the default build, each
      with a line saying which document quotes it. S.
- [x] **2.17 38 worktrees, 45 branches, 42 of them merged.** Pruned by the
      owner, 9 October 2026: 30 merged, clean worktrees and their branches;
      13 worktrees and 25 branches left.
- [ ] **2.18 Web build**: `build:site`'s 11-step one-liner into
      `tools/buildSite.mjs`; point `index.html` at `app/` everywhere so
      `sitePaths.mjs` can go; fix netlify.toml's stale comments. S.

## 3. Restructure

### The running cook as one state machine, in core

This is the biggest single source of drift. Core gives the apps pieces
(`replan`, `eventsDue`, `keepAsRan`, `asRanCorrected`, `cookEnding`) and
each app strings them together in its own order. The after-pull correction
is written three times (`cook.ts:342`, `AppModel.swift:366`,
`Cook.swift:308`). 0.3 and 0.4 above are that drift.

- [ ] **3.1 `step(cook, event, env) → {cook, plan, need, effects}`** in
      core. Events: start, boil, correct, correctStart, out, stillIn,
      pullStands, tick, surfaceLanded, answered, startAgain. Effects:
      persist, askSurface, arm/cancel alarms, ring, log record, forget,
      send final. `eventsDue`, `keepAsRan` and the second plan go inside;
      the end-of-cook steps (log, remake, retry, held answers) are in it
      too. The fixtures become event traces; today's 83 `plans` rows check
      that behaviour hasn't changed. L.
- [ ] **3.2 `RunningCook` as start + choices + an append-only event log.**
      Today it has 13 fields, four of them partial correction history
      (`coldSince_s`, `firstHotAt_s`, `correctedAt_s`, `boilRemembered`)
      decoded by hand. "Changing a setting back gives back the old plan
      exactly" then holds by construction. M, with 3.1.
- [ ] **3.3 The readout in core**: `readoutAt(cook, plan, now) → {keys,
      digits, sign, args}`. The web has it pure and tested (`phaseView.ts`);
      iOS spreads it over `ReadoutView`, `PhaseActions` and `AppModel.keys`
      (47 phase branches in views). M.
- [ ] **3.4 One `inputsKey()` in core** with explicit number formatting,
      used by `replan` and both caches, in place of 17-field `===` checks,
      `JSON.stringify(inputs)` with field order that matters, and iOS's
      three representations of a cook. Then one of Codable or
      `readRunningCook` goes. M.
- [ ] **3.5 The slow-hob hint becomes an opaque memo** the apps never read
      (`SlowHobHint`, `slowHobHintFits`, ~130 lines each side), or goes
      inside 3.1's state. M.
- [ ] **3.6 `CookPlan` without its duplicates**: `level`,
      `provisional`, `askIfStillIn` and `lengthened` repeat other fields. S.

### Each app as an effect runner over it

- [ ] **3.7 Web: one `Model`, `update(model, msg, now) → [model, effects]`,
      `view(model, now)`** as pure structs (extending `phaseView`) plus a
      DOM writer once per animation frame. It ends: `state` written from
      five modules; `controls` that *is* `settings` while idle (an alias
      `readInputs` relies on); `render()` that starts worker jobs and steps a
      simulation; 10 direct `render` and 13 `recompute` calls; ~10 boot-time
      callback registrations; `now.ts` booting on import. About 2.5k lines
      reshaped. L, after 1.1 and 3.1.
- [ ] **3.8 Web: one `syncedKey<T>`** for cross-tab sync, written five
      times today (settings, boil, calibration, share, cook) with its own
      "seen" copy each; `takeUpEvents` (domain logic in `store.ts`) into
      core. M.
- [ ] **3.9 iOS: `Cook` as a value `CookState` and a pure step**, with a
      thin `@Observable` shell running effects. It ends the god object
      (state, restore, plan loop, alarms, ringing, Live Activity, debug clock,
      record making), the four closures AppModel wires in backwards, `generation`
      tokens (24 in Cook, 21 in Sharing), and `stillOpen` decoding
      UserDefaults on every tick. L, after 1.2 and 3.1.
- [ ] **3.10 iOS: Planner as `choices: CookChoices`**, not 13 controls
      mapped by hand six times; `SolveLoop` and `Learning` as types in place
      of extensions that need ~15 bookkeeping vars left internal. M.
- [ ] **3.11 Settings as one value read by a core `readSettings`**, fixtured,
      in place of 14 literal keys written 2-3 times on iOS and
      `readSettings` clamping on the web. Free under D48. M.
- [ ] **3.12 iOS: time as Double seconds** in app logic, `Date` only at
      SwiftUI and the system (58 conversions, 30 in Cook; `Attest` stored as
      seconds since 2001, unlike every other time). One `localDay`. S-M.

### Storage and model ids

- [ ] **3.13 One registry of stores in core**: name and format number,
      fixtured to Swift, with the version inside the payload, not the key
      (except the frozen calibration store). Today `aet.cook.v4` and
      `cookInProgress.v3` hold the same `RunningCook` and must be bumped
      together by hand. Not one envelope for everything: that would rewrite
      the 200 KB posterior on each slider move and break per-key cross-tab
      sync. M.
- [ ] **3.14 Split `MODEL_ID`**: provenance (D37) and a likelihood id (the
      store's `m`, which forces a replay). A decision-only change (82aff4b,
      the nudge) replayed every posterior. Pin a digest of a fixed-log
      replay in a test, so a likelihood change fails until the id moves.
      S-M.

### Core, smaller

- [ ] **3.15 `policy.ts` by subject**: `phaseAt`, `Deadlines` and the
      slow-hob/grace constants to the running module; `shareReply` /
      `shareGivesUp` to `share.ts`; alarm sounds apart. Policy.swift is the
      most-churned Swift file. S-M.
- [ ] **3.16 One time unit**: `startCook(now_ms)` and `share.answered(now)`
      take ms, everything else seconds. S.
- [ ] **3.17 Core only what the apps must agree on.** `deadlineToRing` is
      iOS-only logic in EggTimerCore with no twin; one-liners
      (`effectiveUnits`, `languageOf`) don't earn a twin. S.
- [ ] **3.18 Generate the Swift data layer** (types, defensive readers,
      Codable, `jsonObject`) from the TS interfaces: that is where the copies
      drifted (Running 967 Swift code lines against 727 TS; Share 162
      against 91). Not the whole core: running TS in JavaScriptCore loses
      the JIT, and a surface would take seconds. M-L.
- [ ] **3.19 Fixtures as one row per line**, and event traces (3.1) in
      place of whole plans per row: 2.6 MB, and since 1 October 11× the
      churn of the code they pin. M.

## 4. Process

- [ ] **4.1 PLAN updated at merge, by the merging session**, not in each
      working commit: it is touched by 25% of commits and is a merge hotspot
      across worktrees and the QA agent. `DECISIONS.md` 104; in CLAUDE.md at
      `f7b8a34`.
- [ ] **4.2 LOGBOOK frozen per version** (`LOGBOOK-0.4.md`); its "Things that
      cost an hour" (twice, at :78 and :6059, and inline three more times)
      into one edited `GOTCHAS.md`. S.
- [ ] **4.3 Fewer version lines.** 0.4 hasn't shipped and 0.5 forked from
      it, so `0.4.x` and `0.5.x` are one line in practice, and each fix is
      built per line (`0.4.x-newer-version-guard`, `0.5.x-…`). `DECISIONS.md` 102:
      ship 0.5 as the next release and retire `0.4.x`. The branch rule
      is in CLAUDE.md (`f7b8a34`). The owner moves the main checkout and the
      QA agent to `0.5.x` once the QA items on `0.4.x` are done, merges
      `0.4.x` into `0.5.x` and deletes it. 0.4 never ships
      (the owner, 9 October 2026: 0.3 is still in Apple's review and 0.5
      will be done first), so the only formats on users' devices are 0.3's.
- [ ] **4.4 Counts out of comments**: verify.yml says 16 iOS scenarios
      (40), PLAN says web 37 (35). S.
- [ ] **4.5 The guard's sharp edges in RELEASING**: a Netlify rollback to
      an older *0.5* alpha freezes every browser that ran the newer one;
      `devServer`'s fixed port shares one localStorage across worktrees. S.
- [ ] **4.6 The 1750 English may lag**: `DECISIONS.md` 103. Today
      no key is missing (370 of 371; `app.name` is the same in both), and
      core's catalogue already falls back to `en` for a missing key
      (`src/core/copy.ts:137`). What changes is the rule and its test: a
      wording change may ship without its 1750 twin, and the twins are
      written in batches.

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
