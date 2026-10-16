# PLAN.md — what is next for Actual Egg Timer

Three lists: the next work, the owner's open decisions, and what nobody has
checked. The session that merges brings it up to date (`DECISIONS.md` 104).
It carries no dates and no version numbers (130). History is `git log`; the rules
and the map of the documents are `CLAUDE.md`.

## Next work

1. **Settle `Intl` inside `src/core/format.ts`.** Invariant 1 allows it there,
   so the web's output depends on the browser's ICU, while
   `fixtures/format.json` is pinned against Node's. Run the fixture's cases in
   Safari. If Apple's ICU differs, write the formatting out in core for the
   apps' locales, or say which cases differ and why they are harmless.
2. **The first real population fit (E7)**, once shared eggs arrive:
   `fit/README.md` has the loop, and publishing writes
   `fixtures/population.json` in a release. The owner's trusted ids count in
   full and lift the open tier's cap (`DECISIONS.md` 82). Expect to run longer
   chains than the recovery check's: publishing refuses a fit whose R-hat is
   1.01 or more (133).
3. **Czech (F5)**, when the owner's friend can review it. Add it to the
   picker in both apps, which becomes a menu, and `cs` to
   `CFBundleLocalizations` (`LANGUAGE.md` §5). Hand the reviewer wording that
   will not move again.
4. **Fold iOS's `PhaseActions` into the readout.** It keeps a layout per
   phase, though its words are already the readout's; the rest of `Cook` is
   core's `CookState`, stepped.
5. **Generate the Swift data layer only if the drift recurs** (the owner):
   the types, the defensive readers, `Codable` and `jsonObject`, from the
   TypeScript interfaces. The conformance fixtures catch drift meanwhile.
   Never generate the whole core: TypeScript under JavaScriptCore loses the
   JIT, and a surface would take seconds.
6. **Read the time range against real eggs.** The range under the certainty
   word, `predictCookTime` at 5% and 95%, stays as built until then
   (`DECISIONS.md` 97; `INFERENCE.md` §8 has the alternatives).
7. **Learn the heat-off pan's per-cook scale** once enough heat-off cooks
   tell it from `alpha`; `TAU_STANDING_SCALE` is a global 1.0
   (`DECISIONS.md` 11).
8. **Decide the colder coolings' surface from the owner's probe readings**:
   whether ice and running water take free convection in place of a held
   surface (`DECISIONS.md` 115).
9. **Cook real eggs**, and take the measurements in README §11.3.
10. **Left from the adversarial review of the drafting**, not yet decided;
    each is a cut, one branch each:
    - Swift doc comments repeat the TypeScript's in `Running.swift`,
      `AsRan.swift` and `Record.swift`: keep only what is
      about the port, and point at the TypeScript, as the rest of the twin
      does.
    - The web model's `sharing` repeats `share.state.on`: derive it.

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
