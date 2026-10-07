# Shipping 0.5 — one screen, and how sure it is in words

The worklist for the 0.5 line: what the owner has sent to 0.5
(`DECISIONS.md` 90, 91, 93, 95), in the order it can be built. Begun
6 October 2026 on `claude/0-5-version-foundations-277a7b`, forked from
`0.4.x` at `8972a05`, which became `0.5.x` on 7 October (`DECISIONS.md`
97); version `0.5.0-alpha.1`. 0.4 ships without any of
it. Tick each item in the same commit as the work, with what was done; the
next commit that touches this file adds its hash.

**The order.** Foundations first. The logic both apps must agree on moves
into core, fixtured, before the one screen is built on top of it, so the
new screen is written once against core rather than twice against each
app's copy. The model change (95) lands early, because it moves the stored
posterior and with it most fixtures. The certainty word's arithmetic (93)
is core and needs no screen; its words and its place on the screen wait
for the screen's design (91), which waits for the owner.

**Living beside 0.4.** The QA agent still commits on `0.4.x`, and `0.4.x`
is not yet released. Merge `0.4.x` into the 0.5 line often, and always
before the split of `app.ts` and `calibration.ts` (B), which conflicts
with any 0.4 fix in those files. A fix made on 0.5 that 0.4 needs is made
on `0.4.x` and merged across, not the other way.

---

## A. Foundations: core and the model

Each is behaviour-preserving for the cook unless it says otherwise: the
moved logic is fixtured from TypeScript, and both apps call it through
core's exports.

- [x] **A1. The counter's carryover fixed at 1.0** (`DECISIONS.md` 95).
      `tauAirScale` leaves the particle and the population fit and is held
      at 1.0; `MODEL_ID` moves, so stored posteriors are replayed; the
      fixtures, the Swift twin, `fit/` and `npm run sbc` with it.
      `INFERENCE.md` §2 already says so. The one item here that changes
      what a cook is told.
      *Done:* five particle dimensions in both cores, five draws in the
      prior and the kernel; `MODEL_ID` `2026-10-e10`; the population file
      has five spreads (an older one with a carryover still reads); the
      store's `t` column is still written, at 1.0, and never read, so the
      key and its format stay (`DECISIONS.md` 81); the fit and its sample;
      `npm run sbc` ranks seven quantities. `LOGBOOK.md`, 6 October 2026.
- [x] **A2. One `decideAnswer`** (`DECISIONS.md` 90; `REVIEW-0.4.x.md`,
      Bloat 1). `decided()` is written twice (`src/ui/app.ts`,
      `ios/App/Planner+Solve.swift`); `DECISIONS.md` 84 had to land as two
      commits. One core function, fixtured.
      Done: `decideAnswer` in `reach.ts` and `Reach.swift` (the decision held
      by the envelope, the nudge, the solve and the outcome at the time
      given, the level, whether advice is wanted); both apps call it, and
      both price the advice at its level. `reach.json` pins it for each
      profile's pot, the owner's egg (83, 84) and a white that never sets;
      `test/reach.test.ts` 14. The differences between the two copies are
      in `LOGBOOK.md`, 6 October 2026.
- [x] **A3. One `recordFor`** (Bloat 2). Egg-record assembly
      (`src/ui/calibration.ts`, `ios/App/Cook.swift`) is the fit's
      training data, and is twinned by hand. One core function from the
      cook's facts, fixtured. Done: `recordFor(CookFacts)` and
      `probeReadingFor` in `src/core/record.ts` and `Record.swift`, 32
      cases and 8 probe whens in `record.json`; each app gathers its facts
      and calls them. Checked before the switch against each app's old
      copy: the same record, the web's to the character. `18b428a`.
- [x] **A4. The decode decision in core** (Bloat 4): fresh, rebuild,
      rebased or loaded, today in each app and untested in Swift. Done:
      `loadDecision(StoreRead)` in `src/core/record.ts` and `Record.swift`,
      25 cases in `record.json`; each app reads its store apart and keeps
      what core decides. Checked before the switch: the web's whole decode
      over 41479 stores, and iOS's decision over every one of 4320 reads. `f531e4d`.
- [x] **A5. The sharing state machine in core** (Bloat 3): `turnedOn`,
      `forgotten`, `deletionAsked`, `reconciled`, `advances`, into
      `src/core/share.ts` with fixtures; the server shares `isUid`.
      Done: `src/core/share.ts` and `Share.swift` hold the state, its
      defensive read, every transition (`answered` is "advances"),
      `nextToSend` and the deletion answer; `fixtures/share.json` has 374
      moves from 119 states. A new id and the time are passed in. Both apps
      and `server/eggs.ts` call it; `shareReply` and `shareGivesUp` stay in
      `policy.ts`, since an iPhone's attestation uses them too. Stored
      shapes unchanged: iOS still keeps `busySince` as a `Date` and
      converts at its storage.
- [x] **A6. `oddsProfile` without closures** (Bloat 6): core invariant 2,
      and its two copy-pasted bisections made one. The profile both apps
      ship is fixtured again, and must not move. Done: the points decided
      so far are a plain `ProfileWork` (three arrays in position order)
      handed to top-level `decidePoint`, `oddsAtPosition` and `reachEnd`,
      the one bisection, used for each end; `Reach.swift` the same, with
      `inout`. Every fixture byte-identical, and 375 profiles (31 with a
      hard-end bisection) identical with the same decision count.
- [x] **A7. The certainty word, in core** (`DECISIONS.md` 93). From the
      predicted spread of the five yolk words at the chosen time: *very
      certain* when 9 times in 10 it is the word asked for; *a ballpark*
      when 9 times in 10 it is that word or a neighbour; *a wild guess*
      when wider. With it, the 90% interval in words ("between Soft and
      Fudgy"), the most likely word, and a likely time range. Core and its
      fixtures only: no words on screen until D.
      *Built:* `certaintyAt` in `src/core/certainty.ts` and
      `Certainty.swift`, `fixtures/certainty.json`, `npm run decide --
      certainty`. The word asked is the slider's (`anchorNear`); the
      interval's tie-break is the most mass, then the softer. The time
      range is the right cook time's 90% interval (`predictCookTime` at 5%
      and 95%): **the owner's to confirm** (`INFERENCE.md` §8, "How sure,
      in words", has the alternatives). A fresh install is never very
      certain: a wild guess at Runny, Soft and Jammy, a ballpark at Fudgy
      and Hard (58 g, fridge, boiling, ice).
- [x] **A8. The fit's tests in CI** (Bloat 7): `uv run --project fit
      pytest -q fit/tests` in `.github/workflows/verify.yml`, since the
      fit writes `fixtures/population.json`, which both apps ship. A third
      job, `fit`, on Linux with `astral-sh/setup-uv@v10`; 9 tests, 22 s
      locally. Not yet seen run on GitHub: CI runs on a push.
- [x] **A9. Version `0.5.0-alpha.1`**, in `package.json`, `APP_VERSION`
      and `MARKETING_VERSION`, so a record made by a 0.5 build says so.

## B. The god files split (after A2-A5, and after merging `0.4.x`)

- [x] **B1. `src/ui/app.ts`** (about 1500 lines, some 20 module-level
      `let`s) into modules by what they hold. No behaviour change; checked
      by driving the web app.
      Done, a move: `state.ts` (the page's state in one object, and the
      egg, pot and time to boil it derives), `answer.ts` (the solve, the
      decided time, the nudge, the worker asked), `update.ts` (a change
      taken up: `recompute`, saving, language, other tabs, forgetting),
      `render.ts` (the egg page drawn), `controls.ts` and `input.ts` (the
      form written and read), `cook.ts` (the cook, its ticker, a reload);
      `app.ts` is `boot()`, 126 lines. Each module's own bookkeeping is one
      object at its top; no import cycles in `src/`, and the one call back
      up (a surface landed re-solves) is handed to `answer.ts` at boot.
      Every function compared against the old one with the state names
      mapped back. Not yet driven. `3dcb123`.
- [x] **B2. `src/ui/calibration.ts`**: `APP_VERSION`, the storage format
      and the grid caches apart (iOS already has `DecisionGrids`), with
      what A3 and A4 leave of record building.
      Done, a move: `version.ts` (`APP_VERSION`), `eggRecord.ts` (the
      cook's facts for `recordFor`), `calibrationStore.ts` (`Kept`, the v4
      format, `decodeKept`, the copies kept aside), `offThread.ts` (the
      worker and its fallback), `decisionGrids.ts` (the surface and profile
      caches); `calibration.ts` keeps the state that folds the log, its
      tabs and its export, 426 lines. No behaviour, fixture or store change.
      `5633510`.

## C. One screen for setting up and boiling (`DECISIONS.md` 91)

- [x] **C1. The design, for the owner**: what the one screen shows before
      the start and while the egg cooks; which settings stay open after
      the start, and until when; what "re-plan from what has happened"
      means for each (a correction of how the cook began, against a change
      made now); where the egg in cross-section sits, previewing the aim
      while setting up and going back to raw at the start. Owner's call
      before any of C2 is built.
      `design/one-screen.md`. `DECISIONS.md` 96 settled its core: every
      change after the start is a correction, re-planned from the start
      with the start time and observed events kept; everything stays open,
      after the pull too, when it corrects the record; the displays as
      alike as possible before and during; the egg live, and aimed-for
      while a control is touched; "heat off now" later, as an event. Its
      §4 is the state model that follows. `DECISIONS.md` 97 answered the
      rest of its §7: every recommendation, but each tab runs the cook it
      started, as today (23).
- [x] **C2. Core for it** (`design/one-screen.md` §4): a cook is its start,
      its setup and its observed events, and everything else is derived.
      In `src/core/running.ts` and its Swift twin, fixtured: the types
      (`CookChoices`, `CookEvents`, `RunningCook`, `CookPlan`);
      `cookSetupOf`, the one assembly of the solver's egg and pot (today
      `buildSetup` and `Planner.setup`); the transitions, with a corrected
      start refused after now or the first event; `replan` (the ramp from
      the tap, the memory or the slow hob's rule at `now`, the decided time
      on the pot's surface, the pull clamped to now, the cooling, the
      deadlines for `phaseAt`, the certainty and forecast); `eventsDue`;
      `cookFactsFor` and `boilToRemember`; `readRunningCook`; and
      `previewSection` in `section.ts`.
      *Done*, core only, no screen changed: `8eb9b3c`, `3618071`,
      `a05f5fd`, `1c2a557`. `fixtures/running.json` (28 setups, 20 moves,
      59 stored cooks, 41 plans with their records, 11 boils remembered)
      and five previews in `section.json`, held in Swift at 1e-12.
      `cookSetupOf` checked against both apps' assembly over 20000 settings
      each; `replan` with nothing corrected against the web's machine and
      ticket over 300 simulated cooks (`LOGBOOK.md`, 7 October 2026). Where
      the code asked for more than §4 said, it is written there ("As built
      (C2)"): the surface passed with its inputs, a lengthened guess asking
      no surface, the pull held at the last correction or tap
      (`correctedAt_s`) rather than at now, `coldSince_s` for the boil
      memory, no `cooledAt` on the counter.
- [x] **C2, the review applied** (`design/one-screen-review.md`,
      `DECISIONS.md` 98), core and design only, no screen or storage key
      changed: a timeout pull asks whether the egg is still in the water
      (`askIfStillIn`, `stillIn`, `pullStands`); a late boil tap after a
      late correction to cold runs on the remembered time; the slow hob
      stops at two hours and one rule says when a cook is too old
      (`tooOldAt_s`, `cookTooOld`), with the open egg (`openEggId`); a tap
      before a stray cold → hot → cold is remembered (`firstHotAt_s`);
      after the pull the level is kept and a cooling past its end is Done;
      a pull that rang is held (`rangAt_s`); the start's lower bound
      (`earliestStart_s`); the aimed-for egg at the end of the cooling;
      §4's design findings (2.4-2.6). `7900a83`, `feff7de`, `c10dbe2`,
      `0de8ba6`, `87d71e3`; each review heading says what was done.
- [ ] **C2, the apps on it**: each app on `running.ts`, state first with
      no visible change: `aet.cook.v3` and `cookInProgress.v2`, a 0.4 cook
      read once from the old key, kept aside and the key deleted, its iOS
      notifications kept (`DECISIONS.md` 81, review 2.6); a stored cook
      dropped by `cookTooOld`, and sharing holding back only `openEggId`.
- [ ] **C3. Both apps**, screen by screen, checked by driving them;
      `UI.md` rewritten as built.

## D. Certainty in words, on screen (`DECISIONS.md` 93, with C)

- [ ] **D1. The `certainty` draft**: the three words, the interval line on
      a tap ("9 times in 10: between Soft and Fudgy. Most likely Jammy."),
      the time range; the 3/10 warning, the lean line and the ticks'
      colours restated in these terms; "just right" odds retired. Both
      apps, en-US and 1750 twins, fitted to `test/data/surfaces.json`.
      The owner judges it on a phone.

## E. Tidy-ups sent to 0.5 without a choice made

`DECISIONS.md` 90 sends these to 0.5; each was asked as a choice the
answer did not make. Waiting on the owner.

- [x] `tools/shape-study/results-quick.json` beside `results.json`: delete
      the quick run, or minify both? Both deleted and ignored (the owner, 7
      October 2026: each is made again by the study, ~2.5 min and ~20 s);
      `RESULTS.md` keeps the tables they gave.
- [x] `vercel.json`: delete it, or keep it as the second host (its CSP is a
      hand copy of `netlify.toml`'s)? Deleted (the owner, 7 October 2026:
      "delete it we can add vercel later if needed"), with README §10's
      Vercel lines, `netlify.toml`'s note and `tools/precache.mjs`'s.
- [ ] `WORKLIST.md` and `FOLLOWUP.md`, closed records: move to `LOGBOOK.md`,
      or delete? Decided 7 October 2026: kept until the owner has reviewed
      `tidy2` (FOLLOWUP §5, §4.2), then deleted, with their citations
      fixed; `LOGBOOK.md` records what came of them.
- [x] Finished drafts compiled on every build: leave, or move out? Left
      (the owner, 7 October 2026): each imports only `copyDraft.ts`'s
      types, so they cost build time, and a change only if `Draft` does.
- [x] `CLAUDE.md`'s "`rm -rf dist/test` first if a test file was deleted"
      is stale (`npm test` starts with `rm -rf dist`): the owner's file.
      Deleted at the owner's word, 7 October 2026.
- [ ] Exports used only in their own file: trace and trim, with B.
      `src/ui/` done with B: eight values no other file imports are no
      longer exported (`resultsKept`, `shellPoint`, `SECTION_BOX`,
      `pathData`, `yolkAt`, `probeOffered`, `fetchTransport`,
      `renderBracket`). Kept: `heatAt` and `parseHex`, which
      `tools/egg-section.html` imports; `serve`, which `sw.js` calls; and
      the types that name an exported function's argument or result.
      `src/core/`, `tools/` and `server/` not traced.

## Open for the owner

**State, 7 October 2026.** A and B are built and merged on this line, and
both apps were driven after them (`LOGBOOK.md`); nothing failed. The
design (C1) is answered (`DECISIONS.md` 96, 97), so C2 can start.

1. **A7's time range** stays as built, the right cook time's 90%
   interval, until real eggs say how it reads (the owner: "will only have
   a good sense for this from empirical evidence").
2. **E**: `WORKLIST.md` and `FOLLOWUP.md` go after the owner's `tidy2`
   review.
