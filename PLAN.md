# PLAN.md — where Actual Egg Timer stands

The state of the build, what is next, and what waits on whom. Updated in the
same commit as the work it describes. History is `LOGBOOK.md`; the rules for
working here are `CLAUDE.md`; the last section says where everything else is.

**Where things stand, 29 September 2026.** Both apps are complete for one
cook and learning. The web app (`src/`) and the iOS app (`ios/`) carry the
same model, refusals, particle filter and choice of time (Phase E up to E5),
the same catalogue of words in two Englishes (Phase F but for Czech), and the
same layout (`UI.md`). `npm test` runs 274 tests, all passing (5b pins E3's
known limit). `npm run validate` passes 29/29, and `swift test` passes 122
tests in 32 suites. **Pushed on 29 September** at `5ff6940`, the owner's
call: Netlify serves it at actualeggtimer.netlify.app, and the first run of
`.github/workflows/verify.yml` passed. The iOS app runs from Xcode on the owner's
phone and has cooked real eggs; the first TestFlight build, 0.3.1 (1), was
uploaded on 2 October 2026 from `v0.3.1-alpha.1`. The next upload needs build 2
(`ios/RELEASING.md`). The owner is reviewing the `tidy`, `tidy2` and
`plain` copy drafts.

These counts are the only ones in the documents. If you want a number, run
`npm test`.

## What is next

1. **The owner's reviews** (the queue below).
2. **An adversarial QA pass** against this baseline, starting from the QA
   list below.
3. **F5, Czech**, when the owner's friend can review it.
4. **E6-E8**, the collective part: built, on the branch `e6-e8` (on top of
   0.3.4), not on `main` and not released. The owner reviews it first: the
   `share` and `learning` drafts on a phone, the privacy page's sharing
   section, and the endpoint (`netlify/functions/eggs.mts`, Netlify Blobs).
   It is version 0.4.0-alpha.1 there; `main` releases small things meanwhile.

Throughout: cook real eggs, and the two measurements in README §11.3.

## Waiting on the owner

The one queue. Nothing else in the documents waits on the owner.

1. **The `tidy` copy draft, on a phone** (`DECISIONS.md` 45): all of
   WORKLIST §9, live in both apps, to be trimmed back where the owner says.
   `LANGUAGE.md` §3 has the table. Also open to revision there: the E2
   feedback wording, which went in on the owner's behalf, and the probe's
   "highest" (a physics correction of the draft's "lowest", which stands
   unless the owner objects; `INFERENCE.md` §5).
   With it, **`tidy2`**: FOLLOWUP §5 and §4.2, 15 keys the first tidy left
   clunky (the Forget button and dialog, "or else", the restored cook's
   line, "Full rolling boil" mid-sentence, the screen reader's phase said
   twice). `LANGUAGE.md` §3 has its table, and where it departs from
   FOLLOWUP.
   Then **`plain`** (`DECISIONS.md` 54): a style pass over 71 keys of
   both apps, after the owner's rewrite of the Help line on cooling,
   including the strings approved as good enough for now.
   `tools/drafts/plain.ts` has every row and what it left alone. With
   it, **`bench`** (`DECISIONS.md` 55): the base English is Australian,
   so the egg cools on the bench; and `copy/en-US.json`, the American
   overlay, 20 keys that an American phone or browser reads over it
   ("counter", "running water", "pot").
2. **The English of 1750, in both apps** (`DECISIONS.md` 17). `LANGUAGE.md`
   §6 lists the names to strike and where it departs from the guide.
3. **The push of `main`**: done 29 September (`5ff6940`); CI passed. Each
   later push is still the owner's call.
4. **On a phone:** whether the iOS in-app ring (`Ringer.swift`, `.playback`)
   gets through the silent switch as intended, and whether the slider's
   haptic tick at each doneness word is wanted.
5. **`Intl` inside `src/core/format.ts`.** `CLAUDE.md` invariant 1 allows it
   in that one file, so the web's output depends on the browser's ICU while
   the fixtures are pinned against Node's. Safari has not been tried.
6. **Before E8:** whether the direction sentence meets the "still learning"
   condition for the nudge (`DECISIONS.md` 3), now that no screen shows that
   line.
7. **A public TestFlight link** (`ios/RELEASING.md`, once, step 6). The
   privacy policy URL is <https://actualeggtimer.netlify.app/privacy>
   (`privacy/index.html`), live since 0.3.1-alpha.1; App
   Privacy's answer is Data Not Collected. Read the page first: it speaks
   in your name. Help links it in both apps, as "Privacy" ("Of Privacy" in
   1750; the `privacy` draft).
   The App Store subtitle: "Time eggs, not minutes" (22 of 30 characters;
   `DECISIONS.md` 53).
8. **The counter's Help line**, approved (`DECISIONS.md` 56), goes into
   `help.unsure.counter` with the owner's hand edit of the words, with its
   en-US and 1750 twins (`LOGBOOK.md`, 3 October 2026, has a 1750
   suggestion).

Waiting on someone else: the Czech review (F5), by the owner's friend.

## Open items

- **E3's known limit.** Two runny whites at soft move jammy about as far as
  soft; left so until a probe or pooling pins the time-scale (`DECISIONS.md`
  18). `test/infer.test.ts` 5b pins it, so a change that moves it is seen.
- **The heat-off pan's per-cook scale** is deferred: `TAU_STANDING_SCALE` is a
  global 1.0 (`DECISIONS.md` 11). A per-cook scale wants enough heat-off cooks
  to tell it from `alpha`. Meanwhile hot-start heat-off cooks never set the
  white at 1-4 L with four fridge eggs; 1.0 may be pessimistic with a lid
  on, and one real cook would settle it.
- **The egg in cross-section**, merged on 2 October (`DECISIONS.md` 52),
  not yet released: the yolk and
  white drawn ring by ring as the cook runs, as how set each layer is.
  `src/core/section.ts` carries the cook forward a tick at a time with a
  dose at every ring, and agrees with `simulate`. The web's cooking screen
  draws it beside the setup sentence (`src/ui/eggSection.ts`, `UI.md` §3).
  `tools/egg-section.html` (`egg-lab` in `.claude/launch.json`) plays a
  whole cook, with the heat map the owner set aside beside it. Its Swift
  twin is `EggSection` (`Section.swift`), held by `fixtures/section.json`;
  iOS draws it beside `CookSentence` (`EggSectionView.swift`). Not yet seen
  on a phone in either app.
- **A rename:** `Ticket.forecast` / `shownForecast` hold core's `Outcome`, and
  should say so (`outcome`, `shownOutcome`). Small; both apps.
- **Untested:** the Lock Screen card ending with the cooling, and the web's
  setup sentence while a cook runs (README §11.5).
- **Someday:** an iPad app (`DECISIONS.md` 50). iOS is iPhone only; an iPad
  layout needs every orientation and Split View, checked by screenshots.
- **Someday:** other birds' eggs, emu first (`DECISIONS.md` 34). The model's
  geometry, yolk and white are a hen's; an emu egg (about 600 g, a thick
  dark shell) wants its own shape, composition and shell, and probably a
  bird picker rather than a longer slider.
- **Not queued: a watchOS target.** A paired watch already rings, because iOS
  forwards notifications to the wrist while the phone is locked, which is
  when this app is used. A watch app would add only the unlocked case, at
  the cost of a second UI. `Package.swift` names only iOS and macOS.

## The phases

| phase | what | state |
|---|---|---|
| A | the core physics: sphere, kinetics, protocol, solve | done |
| B | the web app, the tests and `validate`, README's science | done |
| C | calibration: the dose grid and the particle filter | done |
| D | the iOS app, with the alarm and the Live Activity | done |
| E1 | the record: each egg kept, the posterior its replay | done 26 Sep |
| E2 | the ordered probit, three white answers, all optional | done 27 Sep |
| E3 | the white offset | built 27 Sep; its done-when half met (above) |
| E4 | the thermometer | done 27 Sep |
| E5 | choosing the time under uncertainty; the odds, reach and advice | done 28 Sep |
| E6 | opt-in collection | not started |
| E7 | the population fit | not started |
| E8 | the nudge | not started |
| F1 | one catalogue for both apps | done 27 Sep |
| F2 | the rewrite, in the first person | done 27 Sep |
| F3 | Metric and Imperial; US size classes | done 27 Sep |
| F4 | numbers, clocks and plurals by locale | done 27 Sep |
| F5 | Czech | waits for its reviewer |
| F6 | the English of 1750 | done 28 Sep; the owner's review open |

The design is `INFERENCE.md` (E) and `LANGUAGE.md` (F); what each phase
measured is `LOGBOOK.md`. What is left:

- **E6, opt-in collection.** Consent, a random id, upload, delete by id; a
  Netlify function writing append-only blobs, the web tier down-weighted in
  the global fit (`DECISIONS.md` 1, 2; `INFERENCE.md` §6-7). Each egg keeps
  its full forecast at "Eggs in" and a model version (`DECISIONS.md` 37). The
  privacy manifest, both READMEs and `ios/RELEASING.md` stop claiming no
  networking. Web only: its first network request. iOS only: App Attest and
  the privacy manifest's collected-data entries. The consent text has to
  exist in every language that has shipped. Privacy contact:
  forgetmyeggs@danmackinlay.name, which exists.
- **E7, the population fit.** Offline, Python, outside `src/core/`: an
  emulator for the likelihood, 2-4 global parameters, cook effects with
  reliability. It publishes `fixtures/population.json`, which both apps read
  as their prior. Done when held-out predictive calibration is the headline,
  by proper scoring rules (`DECISIONS.md` 37, `INFERENCE.md` §9).
- **E8, the nudge.** ±10 s on the recommendation for consenting cooks. Last,
  because it is worthless before E7.
- **F5, Czech.** Adds Czech to the picker in both apps and `cs` to
  `CFBundleLocalizations` in `ios/project.yml`. It tests all four CLDR plural
  categories, the decimal comma and seven cases (`LANGUAGE.md` §5); doneness
  words are matched by the reviewer, not translated. Hand the reviewer
  wording that will not move again.

## QA: what nobody has checked

Gathered from every "Not verified" in `LOGBOOK.md`, less what has since been
checked, fixed or deleted. Start the QA pass here.

- **iOS, by hand.** Nothing in these was tapped, in a simulator or on a
  phone: the units menu, the steppers in displayed units and a typed value's
  round trip; the pull button, both questions and the second answer's
  refold; the probe offer, typing a reading, its refusal and the "Probe it
  now" notification; the clause links, Done, the (i)s opening, the Forget
  confirmation, the advice link into Help, setting a weight, and Weighed
  going back to the last weighed mass; a real drag on `YolkSlider` (the
  thumb, the grid, and the white's line appearing mid-drag); the cooking,
  pull and done screens in their words, and the direction mid-cook; the
  lower half of Settings and Help's reliability section with advice in it;
  a Live Activity cancelled mid-start.
- **The unlikelySoft and unlikelyHard sentences** have not been seen on a
  screen in either app.
- **The Lock Screen and the Dynamic Island**: the card ending as the cooling
  does, the 1750 alarms and their 110-character body on a real notification,
  the Live Activity in 1750, and "my guess until you tap Full rolling boil"
  (40 characters against the island's 41).
- **Sound and touch, on a device**: the in-app ring's tone, the silent switch
  and a media volume at zero, touch to stop, no ring on the authorised path,
  the refused and failed notification states, and the haptic tick.
- **Screen readers.** VoiceOver: the sentence and its clauses, the (i)'s
  Expanded and Collapsed, the slider's adjustable swipe, the bracket's words,
  and focus after a tap. The web's names ("Egg: 68 g, change", "Likely yolk:
  Soft to Fudgy") were read from the DOM, not heard.
- **Dynamic Type** at large sizes on iOS.
- **The web on a phone, and Safari.** Every web check was an emulated
  viewport in desktop Chromium: no real thumb on the sentence, no Safari
  (Apple's ICU, and any locale with non-ASCII digits), no alarm heard. Not
  tried: a second tab changing the pan start mid-sous-vide.
- **Real eggs.** None cooked at a chosen time (the odds are calibrated
  against the model's own idea of cooks); none probed (the 1.0 C instrument
  sd and 0.4 C handling mean are the model's); no hot-start heat-off cook.
  The range under the slider cannot split an egg's scatter from the cook's
  judging; only a thermometer can.
- **Cases no run has shown**: "It could miss" where a miss is nearly
  certain (a pot where no level reaches 3/10 and the lean is strong); the
  bracket's median mark parting from the thumb (a cook who likes a firmer
  yolk).
- **For the owner's eye**: the light scheme's hard end, a mustard (no paler
  stop was tried), and iOS's accent wash on an open clause.
- **Locales measured but not pinned**: en-CA and en-IN/NZ/SG print a time of
  day differently in the two apps; a Czech UI's 24-hour clock abroad on iOS
  rests on a Foundation quirk (`LANGUAGE.md` §2).

## Standing facts

- **The web app is live** at <https://actualeggtimer.netlify.app>, built by
  Netlify from `netlify.toml` on push; it serves `origin/main`. `og:` tags
  carry absolute URLs at that domain, so a domain change is a commit.
  `vercel.json` is checked in and NOT deployed: a second host's settings,
  kept so the site can move (README §10 says why its Node pin differs).
- **Alpha: no stability promised, and no back-compat yet** (`DECISIONS.md`
  48). The site is public but not in wide use, so the storage formats
  (`aet.settings.v1`, `aet.cook.v2`, `aet.calibration.v4`, `aet.boil.v1`,
  record v1) may change without a migration; bump the key's version so an
  old value is dropped rather than misread. Back-compat starts when the
  owner says the app is widely deployed, and not before.
- **Versions and tags** (`DECISIONS.md` 49, `CLAUDE.md`): the version is
  `package.json`'s, now `0.3.0-alpha.1`; iOS carries it without the
  pre-release tag. Each push the owner makes is a release, tagged
  `v<version>`.
- **Every constant has been checked against the primary literature.**
  `Z_WHITE` was corrected; `H_EFF` is known high and open (README §11.2).
- **The alarm fires at `.timeSensitive`**, also in the foreground, with the
  entitlement signed and verified in a device build. **The Live Activity
  works** on the Lock Screen and in the Dynamic Island, seen on the owner's
  phone on 28 September.

## Where things are

| file | holds |
|---|---|
| `CLAUDE.md` | the rules for working here: staging, the gate, both apps, core's invariants, the copy workflow, iOS gotchas |
| `PLAN.md` | this: the state, what is next, the owner's queue, open items, QA |
| `DECISIONS.md` | every owner decision, numbered and dated, with its commits |
| `README.md` | the science: the model, its constants, validation, open problems |
| `INFERENCE.md` | the learning: what is learned, the record, the probe, deciding, the fit |
| `LANGUAGE.md` | the words: the catalogue, copy rules, units, languages, 1750 |
| `UI.md` | the layout both apps share, as built |
| `ios/README.md` | the Swift port, module by module, and the iOS app |
| `ios/RELEASING.md` | getting the app onto other people's phones |
| `privacy/index.html` | the privacy page, at /privacy: what each app keeps and sends, checked against the code |
| `LOGBOOK.md` | the record: what was verified, measured and learned, by date |
| `WORKLIST.md` | the review of 28 September 2026, worked through |
| `FOLLOWUP.md` | QA's worklist after it, 29 September 2026, worked through; `tidy2` waits on the owner |
