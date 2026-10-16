# PLAN.md — what is next for Actual Egg Timer

Three lists: the next work, the owner's open decisions, and what nobody has
checked. The session that merges brings it up to date (`DECISIONS.md` 104).
It carries no dates and no version numbers (130). History is `git log`; the rules
and the map of the documents are `CLAUDE.md`.

## Next work

1. **Put the counter's approved Help line into the catalogue**
   (`DECISIONS.md` 62). `help.unsure.counter` in `copy/en.json` still says no
   measurement was found. Write in the approved line, with its overlay in
   `copy/en-US.json` ("counter", "draft"); the owner makes his hand edit in
   the queue.
2. **Settle `Intl` inside `src/core/format.ts`.** Invariant 1 allows it there,
   so the web's output depends on the browser's ICU, while
   `fixtures/format.json` is pinned against Node's. Run the fixture's cases in
   Safari. If Apple's ICU differs, write the formatting out in core for the
   apps' locales, or say which cases differ and why they are harmless.
3. **The first real population fit (E7)**, once shared eggs arrive:
   `fit/README.md` has the loop, and publishing writes
   `fixtures/population.json` in a release. The owner's trusted ids count in
   full and lift the open tier's cap (`DECISIONS.md` 82). Expect to run longer
   chains than the recovery check's: in a 20-repetition SBC trial, 12 fits
   had R-hat between 1.01 and 1.022 at 4 × 1000 draws, and publishing refuses
   a fit above 1.01 (133). Run a full SBC (`python -m eggfit sbc --reps 200`)
   before the first publish.
4. **Czech (F5)**, when the owner's friend can review it. Add it to the
   picker in both apps, which becomes a menu, and `cs` to
   `CFBundleLocalizations` (`LANGUAGE.md` §5). Hand the reviewer wording that
   will not move again.
5. **Fold iOS's `PhaseActions` into the readout.** It keeps a layout per
   phase, though its words are already the readout's; the rest of `Cook` is
   core's `CookState`, stepped.
6. **Generate the Swift data layer only if the drift recurs** (the owner):
   the types, the defensive readers, `Codable` and `jsonObject`, from the
   TypeScript interfaces. The conformance fixtures catch drift meanwhile.
   Never generate the whole core: TypeScript under JavaScriptCore loses the
   JIT, and a surface would take seconds.
7. **Read the time range against real eggs.** The range under the certainty
   word, `predictCookTime` at 5% and 95%, stays as built until then
   (`DECISIONS.md` 97; `INFERENCE.md` §8 has the alternatives).
8. **Learn the heat-off pan's per-cook scale** once enough heat-off cooks
   tell it from `alpha`; `TAU_STANDING_SCALE` is a global 1.0
   (`DECISIONS.md` 11).
9. **Decide the colder coolings' surface from the owner's probe readings**:
   whether ice and running water take free convection in place of a held
   surface (`DECISIONS.md` 115).
10. **Cook real eggs**, and take the two measurements in README §11.3.

Not until the owner asks: dimming the time slightly while a newer answer is on
its way, never delaying the number instead; the egg lab
(`tools/egg-section.html`) as an About page; an iPad layout (`DECISIONS.md`
50); other birds' eggs, emu first, with their own shape, composition and
shell (34).

## The owner's open decisions

1. **The words not yet approved**: `npm run copy:queue` lists them.
2. **The English of 1750, in both apps** (`DECISIONS.md` 17). `LANGUAGE.md`
   §6 lists the names to strike and where it departs from the guide.
3. **A public TestFlight link** (`ios/RELEASING.md`, once, step 6). The
   privacy page is live at <https://actualeggtimer.netlify.app/privacy>, and
   both apps link it. Step 6 lists App Privacy's answers (`DECISIONS.md`
   72-76).
4. **The Netlify plan and its limits.** Exhausting either free tier pauses
   the whole site: the credit-based Free plan gives 300 credits a month, the
   legacy tier 125,000 function invocations per site a month. Say whether
   the endpoint's limits suit a public link: 16 KB a body, 5,000 eggs an id
   (`MAX_SEQ`), 120 requests a minute an address (`eggs.mts`). Check what
   Netlify's request logs link to `/api/eggs/<uid>`. Delete the deploys built
   between `00186b1` and `2850f40`, which ran on the live store
   (`DECISIONS.md` 89).
5. **The open tier's weight in the population fit.** Open results get none
   for now (`DECISIONS.md` 85), and with no attested eggs 2's cap is zero
   anyway (`--open-cap`, `INFERENCE.md` §9). Every open result is kept, so a
   weight can come later, screened per id.
6. **Where the correction in hand lives** (`DECISIONS.md` 137). 137 keeps
   it in each app (`src/ui/model.ts`, `EggTimerApp/Edits.swift`) yet says
   both "commit at the same moments"; CLAUDE.md puts what both apps must
   agree on in core. Against that, 126: what reads an app's own gestures is
   the app's, and the gestures differ (pointer events and `pagehide`;
   SwiftUI controls and `scenePhase`). The settle, hold and preview timings
   are written twice, the after-the-pull level rule in each app's preview
   and commit and in `step`'s `correct`. Where the apps disagree
   today (a commit replans, moves the alarms and can ring overdue):
   - *A long press on a radio.* Tap Room, then hold Custom: the web commits
     Room on the lift (`fingerUp` reads a hold) and Custom after the settle;
     iOS's picker reports no finger, and commits Custom once.
   - *A size, then a weight.* Pick Large, type 70 g: the web groups by page
     element (`edit.ts` `GROUPS`), so the field commits Large first; iOS
     groups by setting (`.mass`) and commits once. Room temperature too,
     from `#roomTempFrom` then `#roomTemp`.
   - *Control Centre in the settle.* Tap +, pull down Control Centre, tap +:
     iOS commits at `.inactive` (`ContentView`'s `scenePhase`), then again;
     the web commits only when the page is hidden, so once.
   - *The thermometer.* Tap +, then touch the probe reading or a Settings
     switch: the web commits at the touch (`.unit`, `.check`); iOS after the
     settle, so a reading saved inside it is scored without the change.
   **Or core:** a reducer beside `step`, `editStep(state, event)`. In:
   `change(group)`, `down(group, slider)`, `up`, `leave`, `moveOn` and the
   settle, preview and release timers firing, each with its time; groups
   are opaque ids. Out: the next state, what to commit (nothing, the hand,
   or the hand up to the change before this one) and timer commands (set
   at, cancel). Plain data and one top-level function, no clock, closure or
   I/O, as `step` is; fixtured as event sequences, held in Swift by
   conformance. That ends the first drift and the rules written twice. The
   other three are each app's mapping onto those events, and stay unless
   core also names the groups (the settings `FIELDS` already lists) and
   which touches and moments are `moveOn` and `leave`.
   **Or keep 137** and fix the four in each app: a hold commits only a
   change made during it; the web groups by `FIELDS`; one rule for leaving
   (hidden or inactive, the same in both); one list of other controls. Each
   is a test in each app's suite; the next drift is found by review again.

Waiting on someone else: the Czech review, by the owner's friend.

## QA: what nobody has checked

What the e2e harnesses cannot reach: a real device, a real ear, a real egg.
Start the QA pass here.

- **On a phone, in both apps**: the − and + beside every number, repeating
  while held; the version at the foot of Settings; back to metric leaving
  1750 alone (`DECISIONS.md` 77); "boil" never a noun but for the water's
  "a full rolling boil" (111); the feedback's target, the probe's − and +
  and the room (79); "Export my results" (107); a soft yolk chosen again (83)
  and the time never falling as the doneness rises (84); the certainty word
  and its range (93, 97); the one screen from setup to Done (96-99, 108); the
  alarm sounds (101); the
  action's row (125), the bracket's band (114), the bowl (115); the web's
  setup sentence while a cook runs.
- **Sharing, live.** A record posted and deleted through the deployed
  endpoint; App Attest's attested path on a phone (only the simulator's open
  tier has run); the web in Safari; an iPhone on a flaky network; Netlify's
  rate limit at work; a deletion asked offline and confirmed later.
- **The Lock Screen and the Dynamic Island**: the card ending as the cooling
  does, the 1750 alarms on a real notification, the Live Activity in 1750,
  and "my guess until Rolling boil" against the island's width.
- **Sound and touch, on a device**: the in-app ring (`Ringer.swift`,
  `.playback`) through the silent switch and at zero media volume, touch to
  stop, no ring on the authorised path, the refused and failed notification
  states, and the slider's haptic tick, and whether the owner wants it.
- **Screen readers.** VoiceOver: the sentence and its clauses, the (i)'s
  Expanded and Collapsed, the slider's adjustable swipe, the bracket's words,
  and focus after a press. The web's names were read from the DOM, not heard.
- **Dynamic Type** at large sizes on iOS.
- **The web on a phone, and Safari.** The web's checks run an emulated
  viewport in desktop Chromium: no real thumb, no Safari (Apple's ICU, and
  locales with non-ASCII digits), no alarm heard, no Home Screen opening
  offline, no new build taken after a deploy.
- **Real eggs.** None cooked at a chosen time (the odds are calibrated
  against the model's own idea of cooks); none probed (the 1.0 C instrument
  sd and 0.4 C handling mean are the model's); no hot-start heat-off cook,
  which would say whether `TAU_STANDING_SCALE` 1.0 is pessimistic. Only a
  thermometer can split an egg's scatter from the cook's judging.
- **For the owner's eye**: the 1750 face (IM FELL English, the long s;
  `LANGUAGE.md` §6) on a phone, the light scheme's mustard end, and iOS's
  accent wash on an open clause.
- **Locales measured but not pinned**: en-CA and en-IN/NZ/SG print a time of
  day differently in the two apps; a Czech UI's 24-hour clock abroad on iOS
  rests on a Foundation quirk (`LANGUAGE.md` §2).
