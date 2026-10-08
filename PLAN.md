# PLAN.md — where Actual Egg Timer stands

The state of the build, what is next, and what waits on whom. Updated in the
same commit as the work it describes. History is `LOGBOOK.md`; the rules for
working here are `CLAUDE.md`; the last section says where everything else is.

**Where things stand, 8 October 2026, on `0.5.x`** (forked from
`0.4.x` at `8972a05`; its worklist is `SHIP-0.5.md`). Both apps are complete for one
cook and learning, and now for many: opt-in sharing, the nudge and the
population a prior is drawn from (E6-E8, `COLLECTIVE.md`) are built in
both, on this branch, not on `main` and not deployed. The web app (`src/`) and the iOS app (`ios/`) carry
the same model, refusals, particle filter and choice of time, the same
catalogue of words in two Englishes (Phase F but for Czech), and the same
layout (`UI.md`). `npm test` runs 381 tests, all passing (5b pins E3's known
limit). `npm run validate` passes 29/29, `swift test` passes 155 tests
in 38 suites, and the fit's pytest 9. **Pushed on 29 September** at `5ff6940`, the owner's
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
   list below. The owner's review of the 0.4 line, `REVIEW-0.4.x.md`, is
   actioned item by item; what is left there
   is marked OWNER, the owner's questions.
3. **F5, Czech**, when the owner's friend can review it.
4. **E6-E8**, the collective part: built, on this branch, `0.4.x`
   (`COLLECTIVE.md`; the owner's answers are `DECISIONS.md` 58-61), kept up
   to date with `main` and not released. The owner reviews it first: the
   `share` and `learning` drafts on a phone, the privacy page (rewritten for
   0.4; two `OWNER` marks left to answer, `SHIP-0.4.md` B), and the
   endpoint (`netlify/functions/eggs.mts`, Netlify Blobs).
   It is version 0.4.0-alpha.1 here; `main` releases small things meanwhile.

5. **0.5**, on this line: `SHIP-0.5.md`. The foundations are built (A,
   B): the counter's carryover held at 1.0 (`DECISIONS.md` 95), the
   review's refactors into core (90), the certainty word's arithmetic
   (93), the web's god files split; both apps driven after them. The one
   screen's design is answered (`DECISIONS.md` 96, 97; `design/one-
   screen.md`), and its core, the running cook, is built (C2,
   `src/core/running.ts`), with the red-team review of it applied
   (`design/one-screen-review.md`, `DECISIONS.md` 98). Both apps' state is
   on it (`aet.cook.v4`, `cookInProgress.v3`; `design/one-screen.md` §4),
   and red-teamed as built (`design/running-cook-review.md`): core's, the
   web's and iOS's findings fixed, before the one screen; certainty in words is the `certainty` draft (93, D1),
   for the owner on a phone: next is the one screen in both (C3). `0.4.x` is
   merged in as it moves.

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
   (`DECISIONS.md` 67): "Your random ID" over the id, whole and
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
10. **The version at the foot of Settings, on a phone** (5 October 2026):
   the **`version`** draft, "Version {version}" (1750: "Edition
   {version}"), under the colophon in both apps, the number fixed-width and
   selectable like the random number. The web shows `APP_VERSION`
   ("0.4.0-alpha.1"); iOS the App Store version and its build ("0.4.0
   (2)"), since the App Store version holds only integers.

11. **The owner's fixes of 5 October 2026, on a phone.** Back to metric
    leaves the English of 1750 alone (`DECISIONS.md` 77), in both apps;
    the **`stay`** draft drops "and back when you pick Metric" from the
    Language (i). The **`press`** draft takes "tap" for the screen gesture
    out of eight strings, en-US and 1750 twins with them: "then press Start
    heating", "press Full rolling boil", and on the Lock Screen "my guess
    until Full rolling boil". The **`randomid`** draft calls the random
    number a "random ID" (1750: a "cypher"), in Settings, the consent
    and the privacy page. The **`boiling`** draft takes "boil" as a noun out
    of eleven strings (`DECISIONS.md` 78), en-US and 1750 twins with them:
    the setting "Once it’s boiling" (1750: "Once it boils"), water "boiling
    hard" for "a full boil", and in 1750 on the Lock Screen "my conjecture,
    till you tell me it boils". The button stays "Full rolling boil", and
    "brought to the boil" stays.

12. **The feedback and the room, on a phone** (5 October 2026,
    `DECISIONS.md` 79), the **`feedback2`** draft in both apps. After a
    cook, "You asked for: jammy, peak yolk 65 °C" over the yolk question
    (1750: "You desired: thick, the yolk rising to …"); the probe reading
    has a − and +, in whole degrees from the peak the cook was started at,
    which the empty field shows greyed; and with the probe on, Settings
    has an optional Room temperature, empty until set, with an (i). A
    measured room is the room the model cools toward and the Room egg's
    start (`roomInUse`, `src/core/policy.ts`), recorded in each result's
    `ambient_C` as before.
13. **Your results, kept and exported** (5 October 2026, `DECISIONS.md` 81
    and 82). The **`export`** draft, on a phone: "Export my results" under
    What I’ve learned in Settings (1750: "Copy out my results"), a
    download on the web and the share sheet on iOS, and "Nothing to export
    yet." on an empty log. The log is never written over now: a record a
    build cannot read is set aside and kept, a store it cannot read is
    kept aside before anything replaces it, and the log is replayed when
    the model changes. `npm run eggs -- import` reads an exported file for
    the fit, and the fit gives your own random IDs full weight once they
    are in `fit/trusted.local.txt` (`fit/README.md` says how).
14. **A soft yolk can be chosen again, on a phone** (5 October 2026,
    `DECISIONS.md` 83), the **`warn`** draft in both apps. With your setup
    (58 g from the fridge, boiling water, an ice bath, a little learned),
    the thumb goes left of jammy onto the dots, and the time, the sentence
    under it and the bracket follow; the line under the setup says "Soft: I
    get this right fewer than 3 times in 10 so far." (1750: "Soft: in this
    I have hitherto succeeded fewer than 3 times in 10."), with the
    reliability link under it. Only the stripes still push the thumb back.
    The old line, "The softest I get right at least 3 times in 10, so far:
    jammy.", is gone. Worth a look while you are there: on the simulator,
    after one egg answered too soft at jammy, soft came out only 10-12 s
    shorter than jammy, with the bracket from soft to fudgy and "probably
    too firm", because the time leans late to set the white (decision 80);
    the warning now says why. Since item 15 it is never later than jammy.
15. **The time never rises as the thumb moves softer, on a phone** (5
    October 2026, `DECISIONS.md` 84), both apps, no new words. With your
    setup and one egg answered soft with a runny white, soft was 500 s and
    jammy 428 s; now everything from soft to just under jammy shows the
    same time, about jammy's (7:02 on the simulator and the web), with
    "probably too firm" and the warning, and the time rises from there.
    Drag from hard to the left edge and watch the time only fall or hold.
    The time can step once, a second or so after a new pot, when its odds
    arrive.
16. **The `certainty` draft, on a phone** (8 October 2026, `DECISIONS.md`
    93 and 97; `SHIP-0.5.md` D1), both apps and both Englishes: the line
    below the time ("Very certain", "A ballpark figure", "A wild guess"),
    what pressing it opens, "Most likely" under it, the warning on a
    dotted level, and Help's "How sure I am". `LANGUAGE.md` §3 has the
    table, `tools/drafts/certainty.ts` the 1750 twins. Three things to
    judge with it: the shading now dips between the words, since a level
    on a cut is half one word; your soft egg of 5 October is a ballpark
    now and no longer dotted ("Most likely: Jammy." says where it lands);
    and the time range's wording, "I think the right time is between …",
    for A7's range, which is yours to confirm. Since its follow-up (same
    day) the bracket under the slider is the words' own interval, whole
    words wide, and "How to make this more reliable" shows only at a wild
    guess a change of setup makes surer: on the model a fresh install
    never gets it (`UI.md` §8).

Waiting on someone else: the Czech review (F5), by the owner's friend.

## Open items

- **What keeping the log cannot reach** (`DECISIONS.md` 81). A 0.3 build
  (`main`) still drops a log it cannot read whole and writes over it, so
  switching a device back to 0.3 can lose what 0.4 kept; export first.
  `MODEL_ID` was not changed when the counter's physics was (`9d00f48`), so
  records from 3 October say `2026-10-e8` under two counters; every stored
  posterior is replayed once on this build regardless, since none says its
  model yet. The web still offers no question after a reload: its panel's
  rule (`src/ui/feedback.ts`, "beforeReload"); iOS now does when the egg is
  the last in the log and not yet shared.

- **The after-egg questions name the yolk** (`DECISIONS.md` 92), for 0.4:
  the cook says which yolk they got (Runny to Hard), the white is asked
  about next to the yolk, and the probe reading moves below the two
  answers. Built on the branch `after-egg` (`LOGBOOK.md`, 6 October): the
  five-word probit and the record's `yolkWord` in both cores, the server,
  the fit, both apps' panels and the `afteregg` draft, and the ticks struck
  through only when no position of their word can be reached. Waiting on the
  owner, on a phone: the five words and the probe field's two lines, and
  whether the field should show when the probe setting is off (it does
  now, whenever the cooling ends at the peak).

- **0.5** (`SHIP-0.5.md`): the counter's carryover fixed at 1.0
  (`DECISIONS.md` 95); the review's refactors into core (90); certainty in
  words, "very certain", "ballpark" or "wild guess", with the 90% interval
  on a tap (93); one screen for setting up and boiling, the egg in
  cross-section always on it (91), which needs interface design first.

- **Dim the time while it is recalculated**, the owner's idea (5 October
  2026), not wanted yet: while a newer answer is on its way, the time and its
  subline dim slightly, back to full when the final answer (and the odds'
  correction) lands, in both apps; never delay the number instead. Not
  noticeable today, since Settings takes as long to leave.

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
  With Czech the language choice becomes a menu (the owner, 5 October 2026):
  first "System (Čeština)" and so on, following the phone's or browser's
  language; then every language in its own name, with the English of 1750
  under English. A `<select>` on the web; on iOS a menu-style `Picker` that
  follows iOS's own per-app language setting, which appears once the app
  declares several localizations.

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
  refold, and the five yolk words, typing a probe reading and its refusal
  (tapped in the simulator on 6 October, `-uiScreen done`); the "Probe it
  now" notification; the clause links, Done, the (i)s opening, the Forget
  confirmation, the advice link into Help, setting a weight, and Weighed
  going back to the last weighed mass; a drag on `YolkSlider` by a finger
  on a phone (the simulator's synthetic drag reaches it, being a
  `UISlider`, and drove the thumb to the far left and back on 5 October;
  the haptic and the white's line mid-drag are still unfelt); the cooking,
  pull and done screens in their words, and the direction mid-cook; the
  lower half of Settings and Help's reliability section with advice in it;
  a Live Activity cancelled mid-start.
- **The low-odds warning at the firm end** (`warn.lowOdds` with "Hard")
  has not been seen on a screen; the soft end was, in both apps, on 5
  October. The unlikelySoft/Hard sentences it replaced are retired. The
  copy-snapshot harness drives fresh installs only, so it never shows the
  warning.
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
  bracket's median mark parting from the thumb for a cook who likes a firmer
  yolk (it has been seen parting at the soft end, where the white leans the
  time, on the web: `UI.md` §8).
- **For the owner's eye**: the light scheme's hard end, a mustard (no paler
  stop was tried), and iOS's accent wash on an open clause.
- **Locales measured but not pinned**: en-CA and en-IN/NZ/SG print a time of
  day differently in the two apps; a Czech UI's 24-hour clock abroad on iOS
  rests on a Foundation quirk (`LANGUAGE.md` §2).

## Standing facts

- **The web app is live** at <https://actualeggtimer.netlify.app>, built by
  Netlify from `netlify.toml` on push; it serves `origin/main`. `og:` tags
  carry absolute URLs at that domain, so a domain change is a commit.
  There is no second host: `vercel.json` was deleted in 0.5 (the owner,
  7 October 2026, "we can add vercel later if needed"); git has it.
- **The web app opens with no signal** once a browser has visited, on a
  Home Screen too (`DECISIONS.md` 63): the built site's service worker
  keeps one build whole (`src/ui/serviceWorker.ts`, written into `sw.js` by
  `tools/precache.mjs`), and a new build takes over only between cooks
  (`src/ui/offline.ts`). Deleting `sw.js` takes it out. Seen in Chromium and
  the iOS simulator, not yet on a phone or on Netlify.
- **Alpha: no stability promised, and no back-compat yet** (`DECISIONS.md`
  48). The site is public but not in wide use, so the storage formats
  (`aet.settings.v1`, `aet.cook.v4`, `aet.calibration.v4`, `aet.boil.v1`,
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
  `package.json`'s, now `0.5.0-alpha.1`; iOS carries it without the
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
| `SHIP-0.5.md` | the 0.5 line's worklist: foundations in core, the one screen, certainty in words, ticked as it lands |
| `design/one-screen.md` | C1: the one screen's design as `DECISIONS.md` 96 settled it, the state model behind it (§4), and the owner's open questions (§7) |
| `design/running-cook-review.md` | C2: the red-team review of both apps on the running cook as built, `e9c4208` |
| `COLLECTIVE.md` | E6-E8, the collective part: the choices made to build `INFERENCE.md` §6-§9, and the work, ticked as it lands |
| `fit/README.md` | the population fit (E7): pulling the eggs, fitting, scoring, publishing |
