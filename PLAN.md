# PLAN.md — what is next for Actual Egg Timer

Three lists: the next work, the owner's open decisions, and what nobody has
checked. The session that merges brings it up to date (`DECISIONS.md` 104).
It carries no dates and no version numbers (130). History is `git log`; the rules
and the map of the documents are `CLAUDE.md`.

## Next work

1. **The first real population fit**, once shared eggs arrive:
   `fit/README.md` has the loop, and publishing writes
   `fixtures/population.json` in a release. The owner's trusted ids count in
   full and lift the open tier's cap (`DECISIONS.md` 82). Expect to run longer
   chains than the recovery check's: publishing refuses a fit whose R-hat is
   1.01 or more (133).
2. **Czech (F5)**, when the owner's friend can review it. Add it to the
   picker in both apps, which becomes a menu, and `cs` to
   `CFBundleLocalizations` (`LANGUAGE.md` §5). Hand the reviewer wording that
   will not move again.
3. **Fold iOS's `PhaseActions` into the readout.** It keeps a layout per
   phase, though its words are already the readout's; the rest of `Cook` is
   core's `CookState`, stepped.
4. **Generate the Swift data layer only if the drift recurs** (the owner).
   Measured on 18 October: quicktype from the TypeScript's JSON Schema
   replaces only the plain declarations, never the null and presence rules,
   `CookEntry`'s cases or `parseRecord`'s checks, and its records are refused
   by `parseRecord`; it would have saved about 5% of the bowl's Swift. If
   drift recurs, a generator of the house's own beside `swiftConstants.ts`,
   written to the house's Codable rules. Never generate the whole core:
   TypeScript under JavaScriptCore loses the JIT, and a surface would take
   seconds.
5. **Read the time range against real eggs.** The range under the certainty
   word, `predictCookTime` at 5% and 95%, stays as built until then
   (`DECISIONS.md` 97; `INFERENCE.md` §8 has the alternatives).
6. **Learn the heat-off pan's per-cook scale** once enough heat-off cooks
   tell it from `alpha`; `TAU_STANDING_SCALE` is a global 1.0
   (`DECISIONS.md` 11).
7. **Decide the colder coolings' surface from the owner's probe readings**:
   whether ice and running water take free convection in place of a held
   surface (`DECISIONS.md` 115).
8. **Cook real eggs**, and take the measurements in README §11.3.
9. **Move the web e2e to Playwright Test** if `tools/chrome.ts` and
   `tools/harness.ts` keep drawing fixes of their own: its sharding,
   waiting, retries, traces and `page.clock` replace the DevTools client and
   most of the harness; the app's hooks (`__snap`, the oscillator capture)
   move across. `git log` on the two files says when.

10. **The fit's recovery check is sensitive to its sample.** Adding the
    egg cup's kitchens took three draws of the simulated sample before
    `test_recovery` mixed under its R-hat limit; the check should pass on
    any honest sample, so it wants longer chains or a sample it was not
    tuned on.
11. **A probe reading at the egg cup's opening**, the one measurement that
    would settle `EGG_CUP_OPENED_S`. Not asked for yet: at the opening the
    yolk's centre is still climbing and the coldest point, so a reading off
    centre or late reads hot, where `probeLikelihood` and the fit's
    `probe_density` take every handling error as reading cold, which holds
    only at the peak. It needs a likelihood whose handling errors can read
    hot (`infer.ts`, its twin, the fit), and then `probeMomentFor` true for
    the egg cup.
12. **iOS 26 the floor, and the alarms by AlarmKit** (`DECISIONS.md` 142).
    Alarms the Clock app's way, through silent mode and any Focus, for the
    pull and the cooling's end; the time-sensitive notifications, their
    entitlement and what schedules them go, with every `#available` or
    workaround kept for older iOS. With it: the Live Activity's countdown
    beside AlarmKit's own, the authorisation asked once, and the in-app
    ring (`Ringer.swift`) kept for the app on screen.
13. **INFERENCE.md §8's certainty table as `npm run decide -- certainty`
    prints it today**: its fresh-install rows and simulated-cook figures
    have drifted from the study (Fudgy is now a wild guess, its
    neighbours 0.89).
14. **The altitude from where the cook is**, offered in Settings beside the
    number, so a new install at height needn't know its altitude (unset,
    a cook at 1500 m starting at once is 39 s out). The phone's or
    browser's position may carry an altitude (iOS's `CLLocation.altitude`;
    the web's `coords.altitude`, often null off a phone); failing that, an
    elevation lookup sends the position to a service. Asked once, on a
    tap, never at launch; the number stays the cook's to change. The
    privacy page says neither app asks for your location, so it changes
    with this, and any lookup's service is named there.
15. **A cold pan starts at the tap's temperature** (approved; planned in
    `.claude/reports/PLAN-12-cold-pan.md`). One tap value, the one
    running water already keeps, shown in the start's panel for a cold
    start as in the cooling's for running water; blank means
    `T_COLD_TAP_C`, so every untouched cold start lengthens by about 10 s
    (13 s with the heat off). A new optional `panStart_C` in the record,
    so an egg already kept replays as it was cooked; the web deploys with
    or before the iOS build that writes it.

Not until the owner asks: dimming the time slightly while a newer answer is on
its way, never delaying the number instead; the egg lab
(`tools/egg-section.html`) as an About page; an iPad layout (`DECISIONS.md`
50); other birds' eggs, emu first, with their own shape, composition and
shell (34).

## The owner's open decisions

1. **The words not yet approved**: `npm run copy:review` lays them out to read on a phone.
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


6. **The App Store's captions** (`ios/appstore/captions.en-AU.json`); then,
   with the words approved, `npm run ios:shots` again and both sizes uploaded in App Store
   Connect. A Lock Screen shot of the Live Activity can only be taken by
   hand (Simulator, Device > Lock).

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
  setup sentence while a cook runs; on iOS, the start's, the cooling's and
  the egg's-origin panels with their moved rows (143) scrolled to and
  corrected by hand mid-cook, which the simulator's tools never did.
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
  Expanded and Collapsed, the slider's and the steppers' adjustable swipes,
  the bracket's words, and focus after a press. Both apps' names were read
  from the accessibility tree, not heard.
- **The 0.5.1 upgrade, on a phone**: sharing on and an egg sent under
  `v0.5.1-alpha.1`, then this build: sharing still on under the same ID,
  and "Delete shared results" reaching the eggs sent before (only the fake
  store has run it). And VoiceOver's swipe at a stepper's bound after the
  pull, which must not write a level only previewed.
- **The egg's two pictures**: its name, hint and activation heard with
  VoiceOver on a device; and, for the owner's eye, the heat map at idle,
  which shows the aimed egg as eaten, cold after ice, where the egg at the
  pull would say more.
- **The web on a phone, and Safari.** The web's checks run an emulated
  viewport in desktop Chromium: no real thumb, no Safari (locales with non-ASCII
  digits), no alarm heard, no Home Screen opening
  offline, no new build taken after a deploy.
- **The egg cup's countdown on a device**: the notification at the
  opening, and the Lock Screen and Dynamic Island card counting down under
  "Open them in".
- **The egg cup's opening** (`EGG_CUP_OPENED_S`, 120 s) is the model's
  guess: a probe in the yolk's centre as the egg is topped, with the
  seconds since the pull, says when cooks open it and whether a cup keeps
  more heat than still air. Each 30 s it is off moves soft's time by
  about 30 s.
- **Real eggs.** None cooked at a chosen time (the odds are calibrated
  against the model's own idea of cooks); none probed (the 1.0 C instrument
  sd and 0.4 C handling mean are the model's); no hot-start heat-off cook,
  which would say whether `TAU_STANDING_SCALE` 1.0 is pessimistic. Only a
  thermometer can split an egg's scatter from the cook's judging.
- **For the owner's eye**: the light scheme's mustard end, and iOS's accent
  wash on an open clause.
- **Locales measured but not pinned**: en-CA, en-IN/NZ/SG/HK/MY/PK, en-001,
  en-MX and en-BR print a time of day (en-BR also a number) differently in
  Node's `Intl` than in Apple's formatters. Safari and Foundation agree, so on
  an iPhone the two apps match; only the web in another browser may differ. A
  Czech UI's 24-hour clock abroad on iOS rests on a Foundation quirk
  (`LANGUAGE.md` §2).
