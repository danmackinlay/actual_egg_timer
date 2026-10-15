# PLAN.md — where Actual Egg Timer stands

The state of the build, what is next, and what waits on whom. Brought up to
date by the session that merges, not by each working commit (`DECISIONS.md`
104). History is `git log` (`LOGBOOK.md`
is frozen, `DECISIONS.md` 117); the rules for working here are `CLAUDE.md`;
the last section says where everything else is.

**Where things stand, 14 October 2026: 0.5 is released and live**
(`v0.5.0-alpha.1`, pushed 10 October; `DECISIONS.md` 110). `main` is the 0.5
line and what Netlify serves at actualeggtimer.netlify.app; what merged
after the tag (the button's "Rolling boil", 112; the action under the time,
113; the bracket's band, 114; the bowl of still water, 115) went out with
later pushes of `main`, at the same version. Work is on short-lived branches
off `main`, and a release is a tag on it (120); `0.3.x` (0.3), `0.4.x` (never
shipped) and `0.5.x` are history. Both apps are complete for one cook
and for learning, and for many: opt-in sharing, the population a prior is
drawn from and the nudge (E6-E8, `INFERENCE.md` §7-§9) are in both. The web app
(`src/`) and the iOS app (`ios/`) carry the same model, refusals, particle
filter and choice of time, the same catalogue of words in two Englishes
(Phase F but for Czech), and the same layout (`UI.md`). CI runs `verify`'s
steps, `ios:build`, `e2e` and `ios:e2e` (`.github/workflows/verify.yml`).
The iOS app runs from Xcode on the owner's phone and has cooked real eggs;
TestFlight has had 0.3.1 (1) and 0.3.2 (2), for internal testing, and
`ios/project.yml` holds the next upload's build number (`ios/RELEASING.md`).
The words the owner has not yet read are the review queue (`npm run
copy:queue`).

## What is next

1. **The owner's reviews** (the queue below).
2. **The adversarial review of 14 October 2026**, worked in small rounds;
   the owner's answers to it are `DECISIONS.md` 116-118.
3. **F5, Czech**, when the owner's friend can review it (below).
4. **Left from the 0.5 refactor, not blocking**:
   - iOS's `PhaseActions` keeps a layout per phase, though its words are
     already the readout's; the rest of `Cook` is core's `CookState`,
     stepped, with its effects handed to `CookAlarms`, `CookCard`,
     `CookSurfaces` and `CookLog`.
   - Generating the Swift data layer (the types, the defensive readers,
     `Codable`, `jsonObject`) from the TypeScript interfaces, where the
     copies drifted, is deferred (the owner, 10 October 2026) unless the
     drift keeps recurring; the conformance fixtures catch it meanwhile.
     Never the whole core: TypeScript under JavaScriptCore loses the JIT,
     and a surface would take seconds.
   - The likely time range under the certainty word, the right cook
     time's 90% interval (`predictCookTime` at 5% and 95%), stays as built
     until real eggs say how it reads (`DECISIONS.md` 97; `INFERENCE.md`
     §8 has the alternatives).

Throughout: cook real eggs, and the two measurements in README §11.3.

## Waiting on the owner

The one queue. Nothing else in the documents waits on the owner.

1. **The review queue, on a phone** (`DECISIONS.md` 106): every word
   changed, added or retired since the owner last approved them. It is
   empty: the owner approved it whole on 10 October 2026 (`3758e7b`), and
   the words changed since, the last on 13 October (`f327258`).
   `npm run copy:queue` lists what has changed since; `npm run copy:review`
   writes the page to read them on beside the apps (`LANGUAGE.md` §3). Say
   what to put back; `npm run copy:approve` stamps the rest. Also open to
   revision: the E2 feedback wording, which
   went in on the owner's behalf, and the probe's "highest" (a physics
   correction of "lowest", which stands unless the owner objects;
   `INFERENCE.md` §5).
2. **The English of 1750, in both apps** (`DECISIONS.md` 17). `LANGUAGE.md`
   §6 lists the names to strike and where it departs from the guide. Its
   face, IM FELL English with the long s everywhere (§6, *The face*), is
   not yet seen on a phone.
3. **On a phone:** whether the iOS in-app ring (`Ringer.swift`, `.playback`)
   gets through the silent switch as intended, and whether the slider's
   haptic tick at each doneness word is wanted.
4. **`Intl` inside `src/core/format.ts`.** `CLAUDE.md` invariant 1 allows it
   in that one file, so the web's output depends on the browser's ICU while
   the fixtures are pinned against Node's. Safari has not been tried.
5. **A public TestFlight link** (`ios/RELEASING.md`, once, step 6). The
   privacy policy is live at <https://actualeggtimer.netlify.app/privacy>
   (`privacy/index.html`), with no `OWNER` mark left in it; App Privacy's
   answers are the ones step 6 lists (`DECISIONS.md` 72-76). Help links the
   page in both apps, and so does Settings, under sharing. The App Store
   subtitle: "Time eggs, not minutes" (`DECISIONS.md` 53). App Review may
   ask for a recording from a device (`ios/RELEASING.md`, the last section).
6. **The counter's Help line**, approved (`DECISIONS.md` 62), goes into
   `help.unsure.counter` with the owner's hand edit of the words, and its
   en-US overlay ("counter", "draft"). The catalogue still has the old line,
   which says no measurement was found.
7. **What was built since 4 October, on a phone**, in both apps; their
   words are approved (item 1), and what is left is seeing them work:
   - the − and + beside every number, stepping on the units grid and
     repeating while held;
   - the version at the foot of Settings: the web shows `APP_VERSION`, iOS
     the App Store version and its build ("0.5.0 (3)");
   - back to metric leaving the English of 1750 alone (77), and "boil"
     never a noun but for the water's "a full rolling boil" (78, 111);
   - the feedback saying what the cook asked for, the probe reading's − and
     +, and the room's temperature in Settings (79, 115);
   - "Export my results" (81; the log itself starts fresh in 0.5, 107);
   - a soft yolk that can be chosen again (83), and the time never
     falling as the doneness rises (84);
   - how sure I am, in words, and its time range (93, 97);
   - the one screen, from setup to Done, and its review (91, 96-99, 108);
   - an older build leaving a newer one's results alone (100);
   - the alarm sounds: Wind-up timer, Cuckoo clock and Hen (101);
   - the action under the time, in one row (113), the bracket's band
     (114) and the bowl of still water (115).
8. **In the Netlify dashboard.** Which plan the account is on: the
   credit-based Free plan is 300 credits a month, the legacy free tier
   (accounts from before 4 September 2025) 125,000 function invocations per
   site a month, and exhausting either pauses the whole site, the web app
   included. Whether the endpoint's limits are enough for a public link: 16
   KB a body, 5,000 eggs an id (`MAX_SEQ`), 120 requests a minute an
   address (`eggs.mts`). What Netlify's own request logs link to
   `/api/eggs/<uid>` (the privacy page already says they keep the address,
   the time and the path). And that the deploys built between `00186b1` and
   `2850f40`, which ran on the live store, are deleted (`DECISIONS.md` 89).

Waiting on someone else: the Czech review (F5), by the owner's friend.

## Open items

- **Dim the time while it is recalculated**, the owner's idea (5 October
  2026), not wanted yet: while a newer answer is on its way, the time and its
  subline dim slightly, back to full when the final answer (and the odds'
  correction) lands, in both apps; never delay the number instead.
- **The egg lab as an About page, someday** (the owner, 14 October 2026):
  `tools/egg-section.html`, which plays a whole cook in cross-section, how
  set and how hot, is to become a page cooks can see. Not in the app yet.
- **A runny white still moves the time-scale.** The white's learned offset
  is its lag and the cook's idea of "runny" together, but a runny white is
  as well explained by a slow time-scale as by a late white, and `alpha`'s
  prior is the wider, so two runny whites at soft move jammy about as far as
  soft; left so until a probe or pooling pins the time-scale (`DECISIONS.md`
  18; [issue #1](https://github.com/danmackinlay/actual_egg_timer/issues/1)).
  `test/infer.test.ts` 5b pins it, so a change that moves it is seen.
- **The carryover is not learned.** `tauAirScale` is held at 1.0
  (`DECISIONS.md` 95): the counter's cooling is the textbook's still air, so
  a draughty kitchen's counter-rested eggs come out a little softer than the
  model thinks, and their answers go into the time-scale and the taste.
- **The heat-off pan's per-cook scale** is deferred: `TAU_STANDING_SCALE` is a
  global 1.0 (`DECISIONS.md` 11). A per-cook scale wants enough heat-off cooks
  to tell it from `alpha`. One real hot-start heat-off cook with a lid on
  would say whether 1.0 is pessimistic.
- **Untested:** the Lock Screen card ending with the cooling, and the web's
  setup sentence while a cook runs. What both apps decide is core's, under
  the conformance fixtures; above it each app's store, formatting and
  decision to ring have tests, and the rest is view code, checked by driving
  the apps.
- **The web can make an egg over 90 g, on purpose** (`DECISIONS.md` 34). Both
  apps cap the mass at 90 g, but the web's girth (90-200 mm) and width
  (30-60 mm) keep their own limits, so a typed measurement reaches about
  160-195 g; the model is a hen's egg's, so those times are extrapolated.
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
| E6 | opt-in collection | built 2 Oct; live since 0.5 |
| E7 | the population fit | built 2 Oct, checked on simulated cooks; no real fit until eggs arrive |
| E8 | the nudge | built 2 Oct; live since 0.5 |
| F1 | one catalogue for both apps | done 27 Sep |
| F2 | the rewrite, in the first person | done 27 Sep |
| F3 | Metric and Imperial; US size classes | done 27 Sep |
| F4 | numbers, clocks and plurals by locale | done 27 Sep |
| F5 | Czech | waits for its reviewer |
| F6 | the English of 1750 | done 28 Sep; the owner's review open |

The design is `INFERENCE.md` (E) and `LANGUAGE.md` (F); what each phase
measured is `LOGBOOK.md`; the choices made to build E6-E8 are in
`INFERENCE.md` §7-§9 and the code. What is left:

- **E7, the first real fit**, once shared eggs have arrived: `fit/README.md`
  has the loop, and publishing is writing `fixtures/population.json` in a
  release. Settle the open tier's weight first, the owner's choice: open
  results get none for now (`DECISIONS.md` 85), and with no attested eggs
  `DECISIONS.md` 2 read literally caps them at zero anyway (`--open-cap`,
  `INFERENCE.md` §9). Every open result is kept, so it can be given a
  weight later, screened per id. The owner's own results do not wait on
  it: their trusted ids count in full and lift the cap for the rest (82).
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

What the e2e harnesses cannot reach: a real device, a real ear, a real egg.
Start the QA pass here.

- **Sharing, live.** A record posted and deleted through the deployed
  endpoint; App Attest's attested path on a phone (only the simulator's
  open tier has run); the web in Safari; an iPhone on a flaky network;
  Netlify's rate limit at work; a deletion asked offline and confirmed at a
  later launch.
- **The Lock Screen and the Dynamic Island**: the card ending as the cooling
  does, the 1750 alarms and their body on a real notification, the Live
  Activity in 1750, and "my guess until Rolling boil" against the island's
  width.
- **Sound and touch, on a device**: the in-app ring's tone, the silent switch
  and a media volume at zero, touch to stop, no ring on the authorised path,
  the refused and failed notification states, and the haptic tick.
- **Screen readers.** VoiceOver: the sentence and its clauses, the (i)'s
  Expanded and Collapsed, the slider's adjustable swipe, the bracket's words,
  and focus after a press. The web's names were read from the DOM, not
  heard.
- **Dynamic Type** at large sizes on iOS.
- **The web on a phone, and Safari.** The web's checks run an emulated
  viewport in desktop Chromium: no real thumb on the sentence, no Safari
  (Apple's ICU, and any locale with non-ASCII digits), no alarm heard. Not
  tried: the app on a phone's Home Screen opening offline, and taking a new
  build after a deploy.
- **Real eggs.** None cooked at a chosen time (the odds are calibrated
  against the model's own idea of cooks); none probed (the 1.0 C instrument
  sd and 0.4 C handling mean are the model's); no hot-start heat-off cook.
  The range under the slider cannot split an egg's scatter from the cook's
  judging; only a thermometer can.
- **For the owner's eye**: the light scheme's hard end, a mustard (no paler
  stop was tried), and iOS's accent wash on an open clause.
- **Locales measured but not pinned**: en-CA and en-IN/NZ/SG print a time of
  day differently in the two apps; a Czech UI's 24-hour clock abroad on iOS
  rests on a Foundation quirk (`LANGUAGE.md` §2).

## Standing facts

- **The web app is live** at <https://actualeggtimer.netlify.app>, built by
  Netlify from `netlify.toml` on push; it serves `origin/main`. `og:` tags
  carry absolute URLs at that domain, so a domain change is a commit.
  There is no second host: the Vercel config was deleted in 0.5 (the owner,
  7 October 2026, "we can add vercel later if needed"); git has it.
- **The web app opens with no signal** once a browser has visited, on a
  Home Screen too (`DECISIONS.md` 63): the built site's service worker
  keeps one build whole (`src/ui/serviceWorker.ts`, written into `sw.js` by
  `tools/precache.mjs`), and a new build takes over only between cooks
  (`src/ui/offline.ts`). Deleting `sw.js` takes it out.
- **Alpha: no stability promised, and no back-compat yet** (`DECISIONS.md`
  48, 107). The site is public but not in wide use, so the storage formats
  (core's table of stores, `src/core/stores.ts`) may change without a
  migration; bump the store's format so an old value is dropped rather than
  misread, and the boot sweep deletes any key the table does not list.
  Back-compat starts when the owner says the app is widely deployed, and
  not before. What has been SENT is another matter: the server's records
  are parsed by the same `parseRecord`, and a field reinterpreted there
  would misread every egg already kept.
- **Sharing's endpoint** is `netlify/functions/eggs.mts` on the same site,
  backed by the site's Blobs store `eggs` in Netlify's default region
  (`us-east-2`); `npm run serve:dev` runs it locally on a store in memory.
  Nothing is sent unless a cook turns sharing on.
- **Versions and tags** (`DECISIONS.md` 49, `CLAUDE.md`): the version is
  `package.json`'s, now `0.5.0-alpha.1`; iOS carries it without the
  pre-release tag. A release is a push the owner makes, tagged
  `v<version>`.
- **The newest version that has run is marked** (`DECISIONS.md` 100):
  `aet.newest` on the web, `newestVersion` on iOS, a version string whose
  format never changes. A build that finds a newer one there writes no
  store, logs and learns from no egg and sends nothing for the rest of the
  session, and says so at the top of the screen. Semantic versioning's
  order; each app's own (`src/ui/newer.ts`, `EggTimerApp/Newer.swift`),
  tested in each app's suite.
- **Every constant has been checked against the primary literature.**
  `Z_WHITE` was corrected; `H_EFF` is known high and open (README §11.2).
- **The alarm fires at `.timeSensitive`**, also in the foreground, with the
  entitlement signed and verified in a device build. **The Live Activity
  works** on the Lock Screen and in the Dynamic Island, seen on the owner's
  phone on 28 September.
- **The egg in cross-section** is drawn in both apps from core's
  `src/core/section.ts` (`Section.swift`, held by `fixtures/section.json`).
  `tools/egg-section.html` (`egg-lab` in `.claude/launch.json`) plays a
  whole cook, with the heat map the owner set aside beside it.

## Where things are

| file | holds |
|---|---|
| `CLAUDE.md` | the rules for working here: staging, the gate, both apps, core's invariants, the copy workflow, iOS gotchas |
| `PLAN.md` | this: the state, what is next, the owner's queue, open items, QA |
| `DECISIONS.md` | every owner decision, numbered and dated, with its commits |
| `README.md` | the science: the model, its constants, validation, open problems |
| `DEVELOPING.md` | building and checking: the npm scripts, reviewing the words, the web app end to end |
| `INFERENCE.md` | the learning: what is learned, the record, the probe, deciding, the fit |
| `LANGUAGE.md` | the words: the catalogue, copy rules, units, languages, 1750 |
| `UI.md` | the layout both apps share, as built |
| `ios/README.md` | the Swift port, module by module, and the iOS app |
| `ios/RELEASING.md` | getting the app onto other people's phones |
| `privacy/index.html` | the privacy page, at /privacy: what each app keeps and sends, checked against the code |
| `GOTCHAS.md` | things that cost an hour to find out, gathered |
| `LOGBOOK.md` | the record to 14 October 2026, frozen: what was verified, measured and learned, by date |
| `studies/` | one-off studies (identifiability, rank, probe, perturbed, decide, the shape study), outside the default build; each names the document that quotes it |
| `design/bowl.md` | the bowl of still water as a cooling (`DECISIONS.md` 115) |
| `fit/README.md` | the population fit (E7): pulling the eggs, fitting, scoring, publishing |
