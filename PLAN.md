# PLAN.md — where Actual Egg Timer stands

The state of the build, what is next, and what waits on whom. Updated in the
same commit as the work it describes. History is `LOGBOOK.md`; the rules for
working here are `CLAUDE.md`; the last section says where everything else is.

**Where things stand, 3 October 2026, on the `0.4.x` branch.** Both apps are complete for one
cook and learning, and now for many: opt-in sharing, the nudge and the
population a prior is drawn from (E6-E8, `COLLECTIVE.md`) are built in
both, on this branch, not on `main` and not deployed. The web app (`src/`) and the iOS app (`ios/`) carry
the same model, refusals, particle filter and choice of time, the same
catalogue of words in two Englishes (Phase F but for Czech), and the same
layout (`UI.md`). `npm test` runs 306 tests, all passing (5b pins E3's known
limit). `npm run validate` passes 29/29, and `swift test` passes 125 tests
in 33 suites. **Pushed on 29 September** at `5ff6940`, the owner's
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
4. **E6-E8**, the collective part: built, on this branch, `0.4.x`
   (`COLLECTIVE.md`; the owner's answers are `DECISIONS.md` 58-61), kept up
   to date with `main` and not released. The owner reviews it first: the
   `share` and `learning` drafts on a phone, the privacy page (rewritten for
   0.4; two `OWNER` marks left to answer, `SHIP-0.4.md` B), and the
   endpoint (`netlify/functions/eggs.mts`, Netlify Blobs).
   It is version 0.4.0-alpha.1 here; `main` releases small things meanwhile.

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
   ("counter", "running water", "pot"); **`quotes`** (`DECISIONS.md`
   56), curly apostrophes and quotes everywhere; and **`owner`**
   (`DECISIONS.md` 57), the owner's own edits with "running water", "in
   the air" and "below the time display", which cut the American overlay
   to four "pot" strings; **`below`**, the bracket "below the slider"
   in the direction's (i) too; and **`notes`**, the owner's notes from
   reading every string, who found the rest fine.
2. **The English of 1750, in both apps** (`DECISIONS.md` 17). `LANGUAGE.md`
   §6 lists the names to strike and where it departs from the guide. Its
   face, IM FELL English with the long s everywhere (§6, *The face*), is
   not yet seen on a phone.
3. **The push of `main`**: done 29 September (`5ff6940`); CI passed. Each
   later push is still the owner's call.
4. **On a phone:** whether the iOS in-app ring (`Ringer.swift`, `.playback`)
   gets through the silent switch as intended, and whether the slider's
   haptic tick at each doneness word is wanted.
5. **`Intl` inside `src/core/format.ts`.** `CLAUDE.md` invariant 1 allows it
   in that one file, so the web's output depends on the browser's ICU while
   the fixtures are pinned against Node's. Safari has not been tried.
6. **A public TestFlight link** (`ios/RELEASING.md`, once, step 6). The
   privacy policy URL is <https://actualeggtimer.netlify.app/privacy>
   (`privacy/index.html`), which is live only after the next push. App
   Privacy's answers changed with sharing (E6): Other Data Types and Device
   ID, not tracking, and App Attest needs no answer of its own
   (`DECISIONS.md` 72), as `ios/RELEASING.md` step 6 lists them.
   Read the page first: it speaks in your name, says what sharing sends
   and keeps, and carries `OWNER` marks for you (`SHIP-0.4.md` B). Help links it in both apps, as "Privacy" ("Of Privacy" in 1750;
   the `privacy` draft), and so does Settings, under sharing.
   **The owner's privacy items left**, after `DECISIONS.md` 67-72, and
   only these: the retention rule (a five-year cap from the day cooked, or
   criteria); whether you delete the local copy of the records after each
   fit; and Linked to You or Not Linked on Apple's label.
   The App Store subtitle: "Time eggs, not minutes" (22 of 30 characters;
   `DECISIONS.md` 53).
7. **The `share` and `learning` drafts, on a phone** (E6, E8): the consent
   beside the switch, the deletion's words, and the Learning mark and its
   (i). `tools/drafts/share.ts` and `learning.ts` have every key and its
   1750 twin. With them, **`data`**: what is kept and sent is a "result",
   never "eggs" (13 keys; `LANGUAGE.md` §3 has the table). The privacy
   page names the controls as they now read: "Sharing results",
   "Share results" and "Delete shared results". And **`sharingid`**
   (`DECISIONS.md` 67): "Your random number" over the id, whole and
   selectable, in both apps' sharing section once sharing has been on.
8. **The counter's Help line**, approved (`DECISIONS.md` 62), goes into
   `help.unsure.counter` with the owner's hand edit of the words, with its
   en-US and 1750 twins (`LOGBOOK.md`, 3 October 2026, has a 1750
   suggestion).

9. **The − and + beside every number, on a phone** (4 October 2026): in
   both apps, stepping on the units grid (the egg's mass now in half grams,
   shown "58 g" and "58.5 g"), repeating while held. The web's two
   screen-reader names are the **`steppers`** draft ("Less: {label}",
   "More: {label}"; in 1750, "Diminish:" and "Augment:").

10. **The owner's fixes of 5 October 2026, on a phone.** Back to metric
    leaves the English of 1750 alone (`DECISIONS.md` 77), in both apps;
    the **`stay`** draft drops "and back when you pick Metric" from the
    Language (i).

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
- **iOS answers a change as the web does** (4 October, `LOGBOOK.md`): the
  solve is throttled, not debounced, so a held stepper and a drag are
  followed; the time moves 15-30 ms after a tap on the simulator. A new pot
  still shows the mean solve's time and then, 0.7 s later, the time chosen
  on its surface, a few seconds apart, in both apps. Not yet felt on a phone.
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
| E6 | opt-in collection | built 2 Oct; live with the next push |
| E7 | the population fit | built 2 Oct, checked on simulated cooks; no real fit until eggs arrive |
| E8 | the nudge | built 2 Oct; live with the next push |
| F1 | one catalogue for both apps | done 27 Sep |
| F2 | the rewrite, in the first person | done 27 Sep |
| F3 | Metric and Imperial; US size classes | done 27 Sep |
| F4 | numbers, clocks and plurals by locale | done 27 Sep |
| F5 | Czech | waits for its reviewer |
| F6 | the English of 1750 | done 28 Sep; the owner's review open |

The design is `INFERENCE.md` (E) and `LANGUAGE.md` (F); what each phase
measured is `LOGBOOK.md`. E6-E8 were built from `COLLECTIVE.md`, which has
every choice made to build them. What is left:

- **E6-E8, after the push.** The endpoint goes live with it; then check a
  record posted and deleted through the real one, and App Attest's attested
  path on a phone (only the simulator's open tier has run).
- **E7, the first real fit**, once shared eggs have arrived: `fit/README.md`
  has the loop, and publishing is writing `fixtures/population.json` in a
  release. Read the open tier's cap first (`COLLECTIVE.md` §4): with no
  attested eggs, `DECISIONS.md` 2 read literally gives the web no weight.
- **F5, Czech.** Adds Czech to the picker in both apps and `cs` to
  `CFBundleLocalizations` in `ios/project.yml`. It tests all four CLDR plural
  categories, the decimal comma and seven cases (`LANGUAGE.md` §5); doneness
  words are matched by the reviewer, not translated. Hand the reviewer
  wording that will not move again.

## QA: what nobody has checked

Gathered from every "Not verified" in `LOGBOOK.md`, less what has since been
checked, fixed or deleted. Start the QA pass here.

- **Sharing, live.** The endpoint has run only locally (`npm run
  serve:dev`): a record posted and deleted through the deployed one; App
  Attest's attested path on a phone; the web in Safari; an iPhone on a
  flaky network; Netlify's rate limit at work; a deletion asked offline and
  confirmed at a later launch, outside the tests.

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
  tried: a second tab changing the pan start mid-sous-vide; the app on a
  phone's Home Screen opening offline, and taking a new build after a
  deploy (both seen only on localhost and in the simulator).
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
- **The web app opens with no signal** once a browser has visited, on a
  Home Screen too (`DECISIONS.md` 63): the built site's service worker
  keeps one build whole (`src/ui/serviceWorker.ts`, written into `sw.js` by
  `tools/precache.mjs`), and a new build takes over only between cooks
  (`src/ui/offline.ts`). Deleting `sw.js` takes it out. Seen in Chromium and
  the iOS simulator, not yet on a phone or on Netlify.
- **Alpha: no stability promised, and no back-compat yet** (`DECISIONS.md`
  48). The site is public but not in wide use, so the storage formats
  (`aet.settings.v1`, `aet.cook.v2`, `aet.calibration.v4`, `aet.boil.v1`,
  `aet.share.v1`; iOS's `sharing.v1` and `sharing.attest.v1`; record v1) may
  change without a migration; bump the key's version so an old value is
  dropped rather than misread. Back-compat starts when the owner says the app
  is widely deployed, and not before. What has been SENT is another matter:
  the server's records are parsed by the same `parseRecord`, and a field
  reinterpreted there would misread every egg already kept.
- **Sharing's endpoint** is `netlify/functions/eggs.mts` on the same site,
  backed by the site's Blobs store `eggs` in Netlify's default region
  (`us-east-2`); `npm run serve:dev` runs it locally on a store in memory.
  Nothing is sent unless a cook turns sharing on.
- **Versions and tags** (`DECISIONS.md` 49, `CLAUDE.md`): the version is
  `package.json`'s, now `0.4.0-alpha.1`; iOS carries it without the
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
| `COLLECTIVE.md` | E6-E8, the collective part: the choices made to build `INFERENCE.md` §6-§9, and the work, ticked as it lands |
| `fit/README.md` | the population fit (E7): pulling the eggs, fitting, scoring, publishing |
