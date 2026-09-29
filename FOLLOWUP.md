# Follow-up worklist, after WORKLIST.md (verified at cbd8d66, 29 Sep 2026)

WORKLIST.md was verified against the code at HEAD `cbd8d66`, not against its ticks. The checks were:

- `npm run verify` on a clean checkout: 255/255 TS tests, fresh fixtures, the copy lint, and 119 Swift tests.
- `xcodebuild` of the app and widget for the simulator: builds cleanly.
- The web app driven in a browser:
  - the live site's 19 Sep storage migrates cleanly;
  - a cook starts and survives a reload;
  - a settings change in another tab no longer reaches the running cook's display.
- Three read-only reviews of the fixes.

Everything below is what was left over. It is all small. Follow CLAUDE.md throughout: stage by name, run the gate, one change per commit, PLAN/LOGBOOK/DECISIONS as it says.

**`main` is pushed now.** The storage formats as of `cbd8d66` are live in other people's browsers: `aet.settings.v1`, `aet.cook.v2`, `aet.calibration.v4`, `aet.boil.v1`, and record v1. From here on, a change to any of them needs a migration or a version bump. The "no back-compat" decision (DECISIONS, D1) covered the interim formats only. Say this in PLAN.md's standing facts, if it isn't already there.

## 0. For the owner (do not act on this without the owner)

- **Commit `5a9b290` changed a CLAUDE.md rule about how agents themselves may work.** Before, agents did not merge. Now, "the session that sent them verifies and merges to local `main`". Pushing is still forbidden. The change is sensible, but agents had been merging (`632bdbd` and others) before the rule allowed it, and DECISIONS.md records no owner decision for it.
  - If the owner approves: add a DECISIONS.md entry citing `5a9b290`.
  - If not: revert that paragraph.

## 1. Correctness

**1.1 Web: `boot()` re-solves from live settings during a restored cook.** This is WORKLIST 2.4, done except for one call.
- Where: `src/ui/app.ts:1238`. After `restoreCook()`, `recompute()` runs unconditionally. Mid-cook, after another tab changed settings, it solves the other tab's pot and overwrites `solution`, `decision` and `outcome`. Through `applyAnswer` (`app.ts:400-411`) it can also snap `settings.doneness` and `saveNow()` in the middle of a cook, although `applyAnswer`'s comment says "only ever called while idle".
- Fix: `if (machine.phase === 'IDLE') recompute();`, as line 1245 already does. Also grep the other `recompute()` call sites (219, 784, 822, 1020, 360, 394) for any that can run outside IDLE, and make `applyAnswer`'s claim true by construction. For example, assert or early-return when not IDLE.
- Test: a `phaseView`/`app` test, or a documented browser check. Restore a cook, change stored settings, reload. Then `settings.doneness` must be unchanged in storage, and the display must follow the ticket. (The display part was checked by hand on 29 Sep and passes.)

**1.2 `restoreTicket` accepts a missing `afterBoil`.**
- Where: `src/ui/ticket.ts:87`. `st['afterBoil'] !== undefined && …` lets `undefined` through, which contradicts its own comment "Every field is required".
- Fix: require it (`'hold' | 'off'`), and add a case to `test/ticket.test.ts`. This is safe, because every `aet.cook.v2` ticket this build writes carries it. Check that by grepping the writer.

**1.3 Scale-weighed eggs from live-site settings are recorded as measured by width.**
- Where: `store.ts:81` defaults `measuredBy: 'width'`. A 19-Sep settings record has no `measuredBy`, so a cook whose last measurement was a weight is recorded as `'width'` in the record's provenance until they measure again.
- Fix: infer it once on load, when the field is absent. For example, fall back to `'scale'`, the web's first measurement box and the common case, or to "unknown" if the record schema allows it. Record v1 fields are frozen, so check `record.ts` before adding a value.
- Low stakes: this only affects provenance, not the cook time.

**1.4 Two paths re-solve a running cook.**
- Where: the web calls `solveCookTime` directly (`app.ts:759`), while iOS goes through `answerAt(snapRetry: false)` (`Planner+Solve.swift:232`). The result is the same today, but it is exactly the kind of fork `answerAt` exists to prevent.
- Fix: route the web through `answerAt(..., snapRetry: false)`, as iOS does.

## 2. Gate and tests

**2.1 Build the iOS app in CI.**
- Why: `verify` runs only the core package's `swift test`. The Planner/ContentView split was verified by hand with `xcodebuild`, and nothing stops a future break.
- Fix: add a step to `.github/workflows/verify.yml` (macOS runner):
  - `brew install xcodegen`
  - `cd ios && xcodegen`
  - `xcodebuild -project ActualEggTimer.xcodeproj -scheme ActualEggTimer -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`
- Keep it out of local `npm run verify` if it is slow (~1-2 min). Mention it in CLAUDE.md's gate line, e.g. an `npm run ios:build` script that CI calls.

**2.2 `fixtures:check` misses a new untracked fixture.**
- Where: `package.json:22`. `git diff --exit-code -- fixtures/` ignores untracked files.
- Fix: `npm run fixtures && git diff --exit-code -- fixtures/ && test -z "$(git status --porcelain -- fixtures/)"`.

**2.3 `Fixtures.swift` leftovers (WORKLIST 6.3).**
- The per-file wrappers the worklist said to drop are still there: `policyCases`, `sousVideCases`, `sousVideCopyCases`, `constant` and others (`Fixtures.swift:119-142`, about 69 call sites). Replace them with the generic `list(file, path)` / `object(file, path)`.
- The repo-root lookup still calls `fatalError` (`Fixtures.swift:32`). Make it throw, like the rest, so a missing fixtures directory fails the tests rather than killing the run.

**2.4 No test covers the build-rejection path (WORKLIST 2.3).**
- Add one: a job whose `buildHere` throws must reject, clear `decisionBuilds`/`profileBuilds`, and let the same pot be asked again.

## 3. Code hygiene

**3.1 `src/ui/dom.ts:103`: `export let dom: Dom = undefined as unknown as Dom;` is a lying cast.**
- It came with moving `dom` into `boot()`.
- Fix, either:
  - `let dom: Dom | null`, with a `page()` accessor that throws if it is called before `boot()`; or
  - pass `dom` explicitly to the modules that need it.

**3.2 The catalogue `about` lines name old paths.**
- `copy/en.json:3` says `copy/surfaces.json`, and `copy/en-x-1750.json:3` names `….spelling.json` under `copy/`. Both moved to `test/data/`.
- Updating an `about` field is not a wording change, so no draft is needed. Regenerate fixtures anyway, in case `about` is carried into them.

**3.3 Exports used nowhere else.** `localDay`, `withoutLongS`, `eggVolumeFromMinorDiameter`, and `pulledKey` on the TS side. These predate the worklist. Un-export them where TS has no importer.

## 4. Web polish (older than the worklist, found in the browser)

**4.1 The setup sentence can break before a comma.**
- The clauses are inline `<button>`s, and the ", " / "." between them are bare text nodes, so a line can start with ", then under a cold tap". It was seen at phone width with a room-temperature egg, a boiling-water start and a cold tap.
- Fix: in `sentence.ts`, wrap each clause button with its trailing punctuation in `<span class="clause-wrap">` and give it `white-space: nowrap`. Check iOS's `SetupSentence` for the same break.

**4.2 The screen reader hears the phase twice.**
- It hears "Cooking — keep it boiling. Cooking. 9 minutes 28 seconds left".
- Why: `spoken.announcement` = "{label}. {spoken}", the label is the phase label, and `spoken.cooking` / `spoken.heating` / `spoken.cooling` start with the phase word again.
- Fix: drop the phase word from `spoken.cooking`/`heating`/`cooling` (e.g. "{time} left"). Check first that `spoken.*` is never read without the label, since the ticker may announce the time alone. This is a wording change, so it goes in a draft (§5).

## 5. Copy: one small draft for the owner's phone pass

Put these in a named draft (e.g. `tools/drafts/tidy2.ts`), in both apps and the 1750 twins, following CLAUDE.md "Words". Then give the owner a before/after list. The owner judges on a phone and reverts what they dislike. These came out clunky from the first tidy draft (several were prescribed by WORKLIST §9 itself):

| Key | Now | Problem | Proposed |
|---|---|---|---|
| `learned.forget` / `learned.confirm.title` | Forget what's learned / …? | clunky passive | "Start learning again" / "Start learning again?" (check the 23-character budget) |
| `outcome.likely.firm` / `.soft` | Probably just right, or else a little firm. | "or else" reads as a threat | "Probably just right; if not, a little firm." / "…a little soft." |
| `readout.restored` | I picked this one back up after a reload. The times are right, but I can't ring for it: watch the clock. | colon reveal; "ring for it" is odd | "I picked this one back up after a reload. The times are right, but the alarm is off, so watch the clock." |
| `controls.eggFrom.more` | …the most predictable: a fridge is much the same every day, a room isn't, and… | colon reveal and comma splice | "Fridge eggs are the most predictable. A fridge is much the same every day and a room isn't, and each degree moves the time a little." |
| "Full rolling boil" mid-sentence | 10 occurrences | heavy when it isn't naming the button | Keep it where the cook is told to tap the button, e.g. "tap Full rolling boil". Elsewhere say "when the water boils" or "your boil" (e.g. `outcome.learning`, `learned.literature`, `learned.forget.more`, `readout.sub.coldAssumes.more`). |
| `spoken.cooking` / `heating` / `cooling` | Cooking. {time} left | repeats the label (§4.2) | "{time} left", subject to §4.2's check |

Leave `sousvide.warn`'s "Use the pan." as it is. There, "pan" means the pot, which is what the rule allows.

## Suggested order

1. §0: ask the owner.
2. §1.1.
3. §1.2.
4. §2.1–2.2.
5. The rest of §1–§3.
6. §4.1.
7. §5 with §4.2, as one draft, then hand it to the owner.
