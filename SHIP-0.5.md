# Shipping 0.5 — one screen, and how sure it is in words

The worklist for the 0.5 line: what the owner has sent to 0.5
(`DECISIONS.md` 90, 91, 93, 95), in the order it can be built. Begun
6 October 2026 on `claude/0-5-version-foundations-277a7b`, forked from
`0.4.x` at `8972a05`; version `0.5.0-alpha.1`. 0.4 ships without any of
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

- [ ] **A1. The counter's carryover fixed at 1.0** (`DECISIONS.md` 95).
      `tauAirScale` leaves the particle and the population fit and is held
      at 1.0; `MODEL_ID` moves, so stored posteriors are replayed; the
      fixtures, the Swift twin, `fit/` and `npm run sbc` with it.
      `INFERENCE.md` §2 already says so. The one item here that changes
      what a cook is told.
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
- [ ] **A6. `oddsProfile` without closures** (Bloat 6): core invariant 2,
      and its two copy-pasted bisections made one. The profile both apps
      ship is fixtured again, and must not move.
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

- [ ] **B1. `src/ui/app.ts`** (about 1500 lines, some 20 module-level
      `let`s) into modules by what they hold. No behaviour change; checked
      by driving the web app.
- [ ] **B2. `src/ui/calibration.ts`**: `APP_VERSION`, the storage format
      and the grid caches apart (iOS already has `DecisionGrids`), with
      what A3 and A4 leave of record building.

## C. One screen for setting up and boiling (`DECISIONS.md` 91)

- [ ] **C1. The design, for the owner**: what the one screen shows before
      the start and while the egg cooks; which settings stay open after
      the start, and until when; what "re-plan from what has happened"
      means for each (a correction of how the cook began, against a change
      made now); where the egg in cross-section sits, previewing the aim
      while setting up and going back to raw at the start. Owner's call
      before any of C2 is built.
      Drafted for the owner: `design/one-screen.md`, its §6 the questions.
- [ ] **C2. Core for it**, as C1 settles: the re-plan of a running cook
      from its observed events and a changed setup; the cross-section's
      preview of the aimed-for egg. TypeScript, fixtures, Swift.
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

- [ ] `tools/shape-study/results-quick.json` beside `results.json`: delete
      the quick run, or minify both?
- [ ] `vercel.json`: delete it, or keep it as the second host (its CSP is a
      hand copy of `netlify.toml`'s)?
- [ ] `WORKLIST.md` and `FOLLOWUP.md`, closed records: move to `LOGBOOK.md`,
      or delete?
- [ ] Finished drafts compiled on every build: leave, or move out?
- [ ] `CLAUDE.md`'s "`rm -rf dist/test` first if a test file was deleted"
      is stale (`npm test` starts with `rm -rf dist`): the owner's file.
- [ ] Exports used only in their own file: trace and trim, with B.

## Open for the owner

1. **C1**, the one screen's design.
2. **E**, the tidy-ups' choices.
3. **The branch.** By `DECISIONS.md` 64 the 0.5 line is `0.5.x`. This
   working branch can become it, once the owner says so.
