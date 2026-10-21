# CLAUDE.md — rules for whoever works in this repository

An egg timer from physics, in two apps: the web (`src/`, `index.html`) and iOS
(`ios/`), over one core (`src/core/`, twinned in `ios/EggTimerCore`). What is
next is `PLAN.md`; the last section here says which document holds what.

## Working here

- **Stage files by name**, never `git add -A` or `git add .`: the owner's QA
  agent commits in this tree too. Check `git log --oneline` around a commit.
- **Never push what deploys** (`DECISIONS.md` 124): pushing `main` or a
  release tag deploys the web app, and is the owner's call. An agent may
  push its own branch for CI. An agent in a worktree commits on its branch;
  the session that sent it verifies and merges. It cannot write the main
  checkout, so it returns its report as text, and the session that sent it
  keeps it in `.claude/reports/`.
- **Short-lived branches off `main`, named for what they do** (`DECISIONS.md`
  120); `0.3.x`, `0.4.x` and `0.5.x` are history. **One logical change per
  commit.**
- **No style passes** (`DECISIONS.md` NNN): an agent rewrites no comment,
  test name or assertion message it has no other reason to touch.
- **The gate is what the change touched** (`DECISIONS.md` 123):

  | changed | before a merge |
  |---|---|
  | documents, comments | nothing |
  | tests, tools | `npm test` |
  | core, fixture generators | `npm test`, `fixtures:check`; `swift test` if the Swift twin moves |
  | Swift outside the twin | `swift test`, `ios:build` |
  | words in `copy/` that add no key and change no arguments | `npm test`, `fixtures:check`, which a save from `copy:edit` runs itself |
  | the web's screens (`src/ui`, `index.html`, `styles.css`), or a key or its arguments in `copy/` | the rows above that apply, and `npm run e2e` |
  | the iOS app (`ios/App`, `EggTimerApp`, `ios/Widget`) | the rows above that apply, and `npm run ios:e2e` |

  Any merge that touched code runs the full `npm run verify` once; any
  push runs the full gate in CI, and `verify` runs before a release. A slow
  suite runs once, on the branch's final code, here or in CI on the pushed
  branch; a later commit to documents alone needs no rerun.
- **One version**, `package.json`'s (`0.x.y-alpha.n`), held in step with
  iOS's `MARKETING_VERSION` (without `-alpha.n`) and the web's `APP_VERSION`
  by `test/tools/version.test.ts`; `npm version <v> --no-git-tag-version` sets the
  first two. A release is a tagged commit on `main`, pushed by the owner: it
  bumps the version in its own commit, tags it `git tag -a v<version> -m
  "<one line>"` and pushes `--follow-tags`. Never move or reuse a tag.
- **A storage format may change without a migration** until wide deployment
  (`DECISIONS.md` 107): bump its key, so an old value is dropped rather than
  misread. Each app's table of stores (`src/ui/stores.ts`,
  `StoreRegistry.swift`) lists every key, and the boot sweep deletes any key
  it does not list. Back-compat starts when the owner says the app is widely
  deployed. What has been sent is another matter: the server parses its
  records with the same `parseRecord`, so a field reinterpreted there would
  misread every egg already kept.
- **The documents.** The session that merges brings `PLAN.md` up to date
  (`DECISIONS.md` 104); it holds only the next work, the owner's open
  decisions and one QA list, with no counts, dates or versions (130). A
  closed document is deleted once its live facts have moved to `PLAN.md`,
  the code or the model's documents (119). An owner decision goes to
  `DECISIONS.md` with its date, no commit or branch, and a superseded chain
  is stated as its current rule (131). On a branch a new decision is
  `DECISIONS.md NNN`; the session that merges to `main` gives it the next
  number and fixes its citations.
- **Comments say what the code does and why**, in the code's terms
  (`DECISIONS.md` 105). A decision number only where the code would otherwise
  look wrong (z ≈ 4.65 K), never as a changelog.
- **Support burden is not a constraint** (`DECISIONS.md` 14): argue from the
  cook and the code.
- **Numbers agree in distribution, not in bits** (`DECISIONS.md` 109).
  Fixtures and the Swift twin are held to 1e-12, relative above 1 and
  absolute below. Last-bit drift between processors, libms or languages is
  not a finding, not a reason to tighten a check or test another platform,
  and not a question for the owner. The filter is tested as a distribution
  (`npm run sbc`), never by matching draws.

## Both apps, TypeScript first

- What both apps must agree on lives in `src/core/`: the physics, the
  inference and the decisions; the record's wire schema (`parseRecord`);
  the cook's `step` machine, and the cooks an app holds (`cooks.ts`,
  `DECISIONS.md` 153); when a correction in hand is committed
  (`hand.ts`: its groups, which touches are another control, which moments
  are leaving; each app maps its own gestures onto it, `DECISIONS.md` 139);
  which words say what (`wording.ts`); the alarms' timing; the server's
  contract for sharing. It lands in TypeScript
  first, is fixtured by `npm run fixtures`, and is held in Swift by
  `npm run conformance`; its named constants are written into Swift by
  `npm run swift:constants`, which `npm test` runs (`DECISIONS.md` 138). `ios/README.md` maps the modules. Each app's
  plumbing (its stores, settings, share queue) is its
  own, tested in its own suite (`DECISIONS.md` 126).
- **Fixtures are never hand-edited, and never regenerated to make Swift
  pass.** If a fixture is wrong, the TypeScript is wrong first.
- Apps call core only through its exports. Each app's screens are its own,
  checked by driving them.

## `src/core/` invariants

1. **Zero dependencies**, and no DOM, `Date`, I/O or `async`: pure numerics.
   `Intl` only in `format.ts`, given an explicit locale and UTC
   (`fixtures/format.json` pins it). `tsconfig.core.json` compiles core
   without the DOM or Node's types.
2. **A Swift-portable subset**: plain interfaces and top-level functions, no
   classes or closures over mutable state, explicit `for` loops in hot paths.
   Absence is `null` (Swift's `nil`); a field that may be missing is optional
   in both; core never returns `undefined`.
3. **SI units inside.** Convert only at the UI boundary (`units.ts`).
4. **Sum 40 series terms**, never one: one term is 8.4% low at realistic Fo.
5. **z ≈ 4.65 K for eggs**, never the food-engineering 33.1 K, which is seven
   times too shallow.
6. **Never step the surface temperature discontinuously.** A truncated modal
   basis cannot represent it: an instant 100 -> 2 C drop read the yolk
   centre as 12.5 C when it was 49.3 C. Every change of medium blends
   through `TAU_PLUNGE`.

## Words

- **Every word either app shows is a key in `copy/en.json`**
  (`DECISIONS.md` 135). In Swift a word is a `Words`, which only `tr`
  makes; `Text(verbatim:)`, `String(format:)` and UIKit's text, which no
  tool reads, carry none. On the web no literal in `src/ui` is words
  (`test/uiLiterals.test.ts`). `LANGUAGE.md` §3 has what holds it; read it
  before writing one. A key is a `CopyKey`, which `npm test` makes from the
  catalogue and both compilers check (`DECISIONS.md` 127); `npm test`
  holds each Swift `tr` to its key's arguments (`tools/copyArgs.ts`). A
  key's note and surface are in `copy/en.notes.json`.
- **To change wording**: edit `copy/en.json`, and any `copy/en-US.json`
  override with its `base`; run `npm test` and `npm run fixtures:check`,
  which writes any fixture the words moved; commit them with the
  catalogue. The owner does it himself in `npm run copy:edit`, which checks
  and commits; its Approve is his button alone. A test reads the words
  from the catalogue, never quotes them (`english()` in
  `tools/copyNotes.ts`), so a change of wording moves none. A small surface has a length budget (`test/data/surfaces.json`;
  raising one is the owner's call). The 1750 twin may lag (`DECISIONS.md`
  116): a key without one falls back to English, and `git log --
  copy/en-x-1750.json` shows its age; a twin rewritten never transforms the
  English.
- **Approving English is the owner's word, never an agent's call.** He reads
  `npm run copy:review`, and the words in place in the apps, and says what
  to put back, or puts it back in `npm run copy:edit`; once that is
  committed, the editor's Approve or `npm run copy:approve` records the
  commit. What he approved was
  good enough for now (`DECISIONS.md` 54), and changes like anything else.
- The boil button says **"Rolling boil"** (`action.fullBoil`), under the
  hint "wait for the whole surface to roll": tapping at first bubbles
  under-measures the time to boil by 15-25% (`DECISIONS.md` 112).
- **The owner's rules** (`LANGUAGE.md` §3 has them whole):
  - plain words a cook uses, never a term only this repository uses;
  - the app is "I" and the cook "you", in the active voice;
  - say what to do, and a caveat's consequence, not its mechanism;
  - never narrate what the interface visibly did;
  - sous-vide is not "a bath"; "pan" only for the pot;
  - an inserted word stands alone after a colon, never inside running
    grammar;
  - an (i) is short enough to read at the hob; the rest goes to Help;
  - say it as a person who cooks would, not as a model writes;
  - curly ’ “ ”, never straight.

## iOS gotchas

- **Run `cd ios && xcodegen` after adding or removing a file**, or changing
  `project.yml`. The project is generated and gitignored.
- **A debug build takes launch arguments** (`-uiScreen`,
  `-noAlarmPrompt`, …) to reach a screen without taps; the header of
  `ios/EggTimerCore/Sources/EggTimerApp/DebugLog.swift` lists them.
- **`npm run ios:e2e` taps the app as a finger would** (XCUITest,
  `ios/UITests`), finding each control by its accessibility identifier:
  a control a scenario presses needs one, on the control itself, not on a
  container (`ios/README.md`).
- **SwiftUI's `Slider` ignores synthetic drags** from the simulator tools:
  write the value into the plist of the app's stores, its suite
  (`Library/Preferences/<bundle id>.stores.plist`, `Stores.suite`), in the
  simulator container and relaunch. The doneness slider is a `UISlider` (`YolkSlider`),
  which takes them.
- **`xcrun simctl spawn <udid> defaults` is not the app's UserDefaults**: it
  writes a domain the app reads but cannot delete. Drive the app to make the
  state.
- More that cost an hour: `GOTCHAS.md`, and `ios/RELEASING.md` for
  releasing.

## Where things are

| file | holds |
|---|---|
| `CLAUDE.md` | the rules for working here: staging, the gate, both apps, core's invariants, the copy workflow, iOS gotchas; this map |
| `PLAN.md` | the next work, the owner's open decisions, and what nobody has checked |
| `DECISIONS.md` | every owner decision, numbered and dated, each superseded chain stated as its current rule |
| `README.md` | the science: the model, its constants, validation, open problems |
| `DEVELOPING.md` | building, checking and deploying: the npm scripts, the host, reviewing the words, the web app end to end |
| `INFERENCE.md` | the learning: what is learned, the record, the probe, deciding, the fit |
| `LANGUAGE.md` | the words: the catalogue, copy rules, units, languages, 1750 |
| `UI.md` | the layout both apps share, as built |
| `ios/README.md` | the Swift port, module by module, and the iOS app |
| `ios/RELEASING.md` | getting the app onto other people's phones |
| `privacy/index.html` | the privacy page, at /privacy: what each app keeps and sends, checked against the code |
| `GOTCHAS.md` | things that cost an hour to find out, gathered |
| `studies/` | one-off studies (identifiability, rank, probe, perturbed, decide, bowl), run by hand and type-checked with the tools; each names the document that quotes it. `npm run decide` takes about nine minutes, eleven sections of Monte Carlo one after another; `npm run decide -- odds` runs one |
| `fit/README.md` | the population fit: pulling the eggs, fitting, scoring, publishing |
