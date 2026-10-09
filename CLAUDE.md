# CLAUDE.md — rules for whoever works in this repository

An egg timer from physics, in two apps: the web (`src/`, `index.html`) and iOS
(`ios/`), over one core (`src/core/`, twinned in `ios/EggTimerCore`). Where
things stand is `PLAN.md`; which document holds what is its last section.

## Working here

- **Stage files by name.** Another agent (the owner's QA agent) commits in
  this tree at the same time. Never `git add -A` or `git add .`; check
  `git log --oneline` before and after each commit.
- **Never push.** Pushing deploys the web app; it is the owner's call.
  Agents working in a worktree commit on their branch and do not merge;
  the session that sent them verifies and merges into its version line.
- **One gate: `npm run verify`** (the type checks, `npm test`, the Swift copy
  lint, fresh fixtures, `swift test`). Run it before every commit that
  touches code.
  CI also runs `npm run ios:build` (the app and widget for the simulator,
  unsigned; about a minute, so not in `verify`): run it too before a commit
  that touches `ios/App`, `ios/Shared`, `ios/Widget` or `project.yml`.
- **One logical change per commit.**
- **Branches are named for their version line** (`DECISIONS.md` 64, 102):
  `main` is what is live, today the 0.3 line; the next release is built on
  its own line, today `0.5.x`, kept up to date by merging `main` into it,
  and merged into `main` when it is released. `0.4.x` is retired: 0.4 never
  ships, and nothing more is committed there. A `0.3.x` is cut from the last
  0.3 tag only if 0.3 needs a fix before 0.5 ships. A working branch an agent
  makes is named for what it does and merged into one of these.
- **Versions and tags.** One version, `package.json`'s (`0.x.y-alpha.n`
  while alpha; no stability promised), held in step with iOS's
  `MARKETING_VERSION` (integers only, so without the `-alpha.n`) and the web's
  `APP_VERSION` by `test/version.test.ts`; `npm version <v>
  --no-git-tag-version` sets the first two. A push to `origin/main` is a
  release and the owner's call: bump the version in its own commit, tag that
  commit `git tag -a v<version> -m "<one line>"`, and push with
  `--follow-tags`. Never move or reuse a tag. Before wide deployment
  (`DECISIONS.md` 48) a storage format may change without a migration: bump
  its key.
- **`PLAN.md` is updated at merge, by the session that merges**
  (`DECISIONS.md` 104), not in each working commit: a working branch says
  what it did in its commits and `LOGBOOK.md`, and the merge brings `PLAN.md`
  up to date. Test and check counts appear only in its status line; history
  goes to `LOGBOOK.md`, which is a record and is appended to, never
  rewritten. An owner decision goes to `DECISIONS.md` with its number, date
  and commit.
- **Comments say what the code does and why**, in the code's terms
  (`DECISIONS.md` 105). A decision number appears in a comment only where
  the code would otherwise look wrong (z ≈ 4.65 K), never as a changelog:
  the history of a line is its commits, which cite `DECISIONS.md`, and
  `LOGBOOK.md`.
- **Support burden is not a constraint** (`DECISIONS.md` 14). The app is
  free: argue from the cook and the code, never from the questions a choice
  might generate.

## Both apps, TypeScript first

- Anything both apps must agree on lives in `src/core/` (above the physics,
  in `policy.ts`, `wording.ts`, `reach.ts`), lands in TypeScript first, is
  fixtured from it with `npm run fixtures`, and is held in Swift by
  `npm run conformance`. `ios/README.md` has the module-by-module map.
- **Fixtures are never hand-edited, and never regenerated to make Swift
  pass.** If a fixture is wrong, the TypeScript is wrong first.
- Apps call core only through what it exports. The screens above core are
  each app's own, checked by driving them.

## `src/core/` invariants

1. **Zero dependencies**, and no DOM, `Date`, I/O or `async`: pure numerics.
   `Intl` is allowed in `format.ts` only, given an explicit locale and UTC, so
   it is a pure function of its arguments; `fixtures/format.json` pins it.
   `tsconfig.core.json` compiles core without the DOM or Node's types.
2. **A Swift-portable subset**: plain interfaces and top-level functions, no
   classes or closures over mutable state, explicit `for` loops in hot paths.
   Absence is `null` (Swift's `nil`); a field that may be missing is optional
   in both; `undefined` is never a value core returns.
3. **SI units inside.** Convert only at the UI boundary (`units.ts`).
4. **Sum 40 series terms**, never one: one-term truncation is 8.4% low at
   realistic Fo.
5. **z ≈ 4.65 K for eggs**, never the food-engineering default of 33.1 K,
   which is seven times too shallow.
6. The boil button says **"Full rolling boil"**: tapping at first bubbles
   under-measures the boil by 15-25%.
7. **Never step the surface temperature discontinuously.** A truncated modal
   basis cannot represent a fresh discontinuity at the centre; an instant
   100 -> 2 C drop read the yolk centre as 12.5 C when it was 49.3 C. Every
   change of medium blends through `TAU_PLUNGE`.

## Words

- Every word either app shows is a key in `copy/en.json`, with a twin in
  `copy/en-x-1750.json`; no literal on an iOS screen is words
  (`npm run copy:literals`). `LANGUAGE.md` is the machinery.
- **A wording change is a named draft**: `tools/drafts/<name>.ts`, registered
  last in `tools/copyDraft.ts`, in both apps and with each 1750 twin
  rewritten, not transformed. A key `copy/en-US.json` overrides is rewritten
  there too, with its `base` (`LANGUAGE.md` §2). Prove it changed only what it lists:
  `node dist/tools/copyLiterals.js --since <base> <name>` and
  `node dist/tools/copySnapshot.js compare <before> <after> --draft <name>`.
  Fit each string to its surface's budget in `test/data/surfaces.json`;
  raising a small surface's budget is the owner's call. Then
  `npm run fixtures`.
- **The owner's rules** (`LANGUAGE.md` §3): plain words a cook uses, no term
  only this repository uses; the app is "I" and the cook "you", in the
  active voice; say what to do, and a caveat's consequence rather than its
  mechanism; never narrate what the interface visibly did; sous-vide is not
  "a bath"; "pan" only for the pot; an inserted word stands alone after a
  colon, never inside running grammar; an (i) is short enough to read at the
  hob, and the rest goes to Help. Say it as a person who cooks would, not
  as a model writes (`LANGUAGE.md` §3 lists the marks). Apostrophes and
  quotes are curly, ’ “ ”, never straight. What the owner
  approved was good enough for now (`DECISIONS.md` 54); change it in a
  named draft like any other.
- Wording is judged by the owner on a phone, not in a table.

## iOS gotchas

- **Run `cd ios && xcodegen` after adding or removing a file**, or after any
  change to `project.yml`. The project is generated and gitignored.
- **A debug build takes launch arguments** (`-uiScreen`, `-seedEggs`,
  `-noAlarmPrompt`, …) to reach a screen without taps; the header of
  `ios/App/Screenshots.swift` lists them.
- **SwiftUI's `Slider` ignores synthetic drags** from the simulator tools;
  write the value into the app's `UserDefaults` plist in the simulator
  container and relaunch instead. The doneness slider is a `UISlider`
  (`YolkSlider`), which does take the simulator's drags.
- **`xcrun simctl spawn <udid> defaults` is not the app's UserDefaults**: it
  writes a domain outside the app's container, which the app reads but cannot
  delete. Drive the app to make the state.
- More that cost an hour is in `LOGBOOK.md` ("Things that cost an hour to
  find out") and `ios/RELEASING.md`.
