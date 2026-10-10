# CLAUDE.md — rules for whoever works in this repository

An egg timer from physics, in two apps: the web (`src/`, `index.html`) and iOS
(`ios/`), over one core (`src/core/`, twinned in `ios/EggTimerCore`). Where
things stand is `PLAN.md`; its last section says which document holds what.

## Working here

- **Stage files by name**, never `git add -A` or `git add .`: the owner's QA
  agent commits in this tree too. Check `git log --oneline` before and after
  each commit.
- **Never push.** A push deploys the web app; it is the owner's call. An agent
  in a worktree commits on its branch; the session that sent it verifies and
  merges.
- **The gates.** `npm run verify` before every commit that touches code.
  `npm run ios:build` too for anything under `ios/` outside the core twin
  (`verify` builds the package for macOS only). Before merging a change to
  either app's screens or the logic under them, `npm run e2e` and
  `npm run ios:e2e`; CI fails on both. A merge whose tree the branch has
  already been tested at needs no rerun, and a slow suite may wait for the
  next change if it runs before anything is pushed.
- **One logical change per commit.**
- **Branches are named for their version line** (`DECISIONS.md` 64, 102).
  `main` is live (0.3); the next release is built on `0.5.x`, which merges
  `main` in and is merged into `main` on release. `0.4.x` is retired. A
  `0.3.x` is cut from the last 0.3 tag only for a 0.3 fix. An agent's branch
  is named for what it does.
- **One version**, `package.json`'s (`0.x.y-alpha.n`), held in step with
  iOS's `MARKETING_VERSION` (without `-alpha.n`) and the web's `APP_VERSION`
  by `test/version.test.ts`; `npm version <v> --no-git-tag-version` sets the
  first two. A release (a push to `origin/main`, the owner's call) bumps it in its own commit, tags
  that commit `git tag -a v<version> -m "<one line>"` and pushes
  `--follow-tags`. Never move or reuse a tag.
- **A storage format may change without a migration** until wide deployment
  (`DECISIONS.md` 48): bump its key.
- **The documents.** The session that merges brings `PLAN.md` up to date, not
  each working commit (`DECISIONS.md` 104); counts appear only in its status
  line. `LOGBOOK.md` is appended to, never rewritten. An owner decision goes
  to `DECISIONS.md` with its number, date and commit.
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

- What both apps must agree on lives in `src/core/`, lands in TypeScript
  first, is fixtured by `npm run fixtures`, and is held in Swift by
  `npm run conformance`. `ios/README.md` maps the modules.
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
6. The boil button says **"Full rolling boil"**: tapping at first bubbles
   under-measures the boil by 15-25%.
7. **Never step the surface temperature discontinuously.** A truncated modal
   basis cannot represent it: an instant 100 -> 2 C drop read the yolk
   centre as 12.5 C when it was 49.3 C. Every change of medium blends
   through `TAU_PLUNGE`.

## Words

- **Every word either app shows is a key in `copy/en.json`**; no literal on
  an iOS screen is words (`npm run copy:literals`). Read `LANGUAGE.md` §3
  before writing one.
- **To change wording** (`DECISIONS.md` 106): edit `copy/en.json`, and any
  `copy/en-US.json` override with its `base`; fit the string to its
  surface's budget (`test/data/surfaces.json`; raising a small surface's
  budget is the owner's call); rewrite the 1750 twin, never transform it, and stamp it with
  `npm run copy:approve -- --translation en-x-1750 <key…>`, or leave it to
  lag (`DECISIONS.md` 103); then `npm run fixtures`.
- **Approving English is the owner's word, never an agent's call**
  (`npm run copy:approve -- <key…>`). He reads `npm run copy:review` on a
  phone, not in a table. What he approved was good enough for now
  (`DECISIONS.md` 54), and changes like anything else.
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
- **A debug build takes launch arguments** (`-uiScreen`, `-seedEggs`,
  `-noAlarmPrompt`, …) to reach a screen without taps; the header of
  `ios/EggTimerCore/Sources/EggTimerApp/Screenshots.swift` lists them.
- **SwiftUI's `Slider` ignores synthetic drags** from the simulator tools:
  write the value into the app's `UserDefaults` plist in the simulator
  container and relaunch. The doneness slider is a `UISlider` (`YolkSlider`),
  which takes them.
- **`xcrun simctl spawn <udid> defaults` is not the app's UserDefaults**: it
  writes a domain the app reads but cannot delete. Drive the app to make the
  state.
- More that cost an hour: `GOTCHAS.md`, and `ios/RELEASING.md` for
  releasing.
