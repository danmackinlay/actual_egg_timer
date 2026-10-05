# DECISIONS.md — what the owner decided

Every decision the owner has taken, numbered in the order it was taken, with
the date, the commit that recorded it and the commit that built it. Code and
the other documents cite these by number ("DECISIONS.md 7"). A number is never
reused: a decision the owner later changes stays here, with a line saying
which later decision changed it.

What waits on the owner is not here; it is `PLAN.md`'s owner queue.

---

## 21 September 2026 — the inference, pooled

Recorded in `7e142e0` and `b7a5e31`. The design they belong to is
`INFERENCE.md`.

1. **The endpoint is a Netlify function, and the controller is the owner, in
   their own name.** `INFERENCE.md` §7 has the shape. The contact address is
   forgetmyeggs@danmackinlay.name, chosen and created 26 September
   (`dc886ed`). Not built (E6).
2. **The web app contributes, at a lower weight**: a tempered likelihood in
   the global fit and a cap on the tier's effective sample size, with no
   discount on what a web cook's answers teach their own browser
   (`INFERENCE.md` §6). Not built (E7).
3. **The nudge is fine, provided the app says it is learning.** The point is
   to manage expectations, so the wording belongs on the screen with the
   time, not only in the consent (`INFERENCE.md` §8). Not built (E8). Whether
   the direction sentence meets this, now that no "still learning" line is
   shown (27), is in the owner queue.
4. **Three yolk answers, not five, and every answer is optional.** A skip is
   recorded as a skip. This decision has a statistical cost, and the cost is
   accepted rather than engineered away. Built with E2 (`e7035c3`,
   `4e8e619`).
5. **"Tender" stands, for now.** Slightly odd, not pathological, and no
   picture could do better. Revisit if real cooks stumble on it; the record
   will show whether the middle answer is used. Built with E2.

## 26 September 2026 — the record, the loss, the words

6. **Eggs from before E1 are dropped at E2, not backfilled.** E1 kept the
   pre-log posterior as a frozen base; the new likelihood could not replay
   it, so E2 started from the prior plus E1's log. Recorded `595eac2`; built
   `e7035c3`, `e95bdaa`.
7. **The loss ratio is 3.** A runny white counts as three times as bad as a
   yolk one step too firm (`RUNNY_WHITE_LOSS`, `INFERENCE.md` §8). A
   constant for now, and a per-cook setting only if someone asks for one.
   Recorded `595eac2`; built `31ebf05`.
8. **The odds are always on screen, and brief: "7/10 eggs hit the mark"** -
   the probability that the white is not runny and the yolk would be answered
   "just right", in tenths. Recorded `595eac2`; built `e2b63db`. Changed by
   27 and 32: no screen shows the number now. The odds still shade the
   slider (20) and set its reach.
9. **"Still learning" goes when the 80% interval on the cook time narrows
   below about ±15 s**, about the width of "just right"; a fixed number of
   eggs if that proves fiddly. The owner's view: cooks will barely notice the
   difference, so the threshold is preferred but not worth a fight. Recorded
   `595eac2`; built as the threshold `3be2ff5`, after the resample was fixed
   (`1f35699`). No longer shown (27), and no longer computed by the decision
   (40): `npm run decide -- learning` and `test/decide.test.ts` read it on
   demand from `predictCookTime`.
10. **No kitchens.** Pans and hobs vary within a kitchen and nobody maintains
    profiles, so the kitchen level folds into the cook (`INFERENCE.md` §2).
    Recorded `3f36421`.
11. **The heat-off pan's constant comes from the water volume, not the boil
    time.** Deriving it from the boil time with `RAMP_R` fixed reads the hob
    as the pan: a hob twice as strong as assumed made the pan look about 2.2
    times faster to cool. Anchored so Williams' 17-minute method (a 480 s
    boil, 2 L) is unchanged, and scaled as `V^(1/3)`. Lid and pan material
    become a per-cook scale learned only from heat-off cooks; nobody is asked
    to time an empty pan. Recorded `3f36421`; built `e7261d9`, but for the
    per-cook scale, which is deferred (`PLAN.md`).
12. **1750 is a language code**, `<region>-x-1750`, reached by the picker or
    by switching an English UI to Imperial, and left by picking English
    (`LANGUAGE.md` §6). Recorded `7aa6849`; built `0efc3d8` (web), `01c621e`
    and `05e92ae` (iOS).
13. **Americans should be able to find it**: a picker row and one line under
    the Imperial option, and nothing more insistent. Recorded `7aa6849`;
    built with 12.
14. **Support burden is not a design constraint.** The app is free, and
    feature requests come as pull requests. No choice is made or unmade on
    the grounds that it will generate questions. Recorded `7aa6849`.
15. **Czech is the first language after English**, reviewed by a friend of
    the owner (`LANGUAGE.md` §5). Recorded `dbfd1f1`. Not built (F5): it
    waits for the reviewer.
16. **US carton size classes in region US**, at the midpoint of each USDA
    range: an EU Large had been overcooking an American Large by about 34 s
    (`LANGUAGE.md` §4). Recorded `dbfd1f1`; built `e973786`.
17. **The owner reviews the 1750**, against Johnson's *Preface*
    (`LANGUAGE.md` §6). Recorded `b5895e5`. The review is in the owner queue.

## 27 September 2026 — the odds on screen, the redesign, the voice

18. **E3's attribution is left as it is**: two runny whites move jammy about
    as far as soft, and that stays until a probe or pooling pins the
    time-scale (`INFERENCE.md` §3). Recorded `69cff74`; `test/infer.test.ts`
    5b pins the limit (`031dfd3`).
19. **The protocol advice is discoverable, not intrusive**: offered in
    place under low odds, no modal and no popover. Recorded `69cff74`; built
    `3d11469`, `1f6f00b`. Since 26 it is a link into Help, not a disclosure.
20. **An odds-shaded slider in both apps, threshold 3/10.** Reachability
    ("softest possible") comes from the odds, not the mean solve, and the
    shading is relative to the best level, so a fresh install still shows
    where the pan works. Recorded `69cff74`; built `ade3223`, `3d11469`,
    `1f6f00b`. Amended by 83: under 3/10 is warned of, not refused.
21. **The fresh install's odds stay on screen, with an (i) saying why they
    start low.** Recorded `69cff74`; built `3d11469`. Changed by 27.
22. **No time of day zero-pads its hour**, in either app, in any locale:
    "9:05", never "09:05". The countdown is not a time of day. Built
    `550091f`.
23. **Numbers follow the UI's language**, and the region only where the
    language has no convention of its own: a Czech UI writes "1 234,5" in
    the US as in Czechia; English follows the region, so `en-DE` writes
    "2,4". Built `b74cc35`.
24. **Push `main` after previewing the web app.** No real eggs for now: the
    owner is travelling. Recorded `69cff74`. The push is in the owner queue.
25. **Fewer controls, room for sentences.** Brief controls get a longer (i);
    few enough controls are on screen that longer strings fit, for clarity or
    comedy; wording is judged in place on a phone, not approved row by row in
    tables (`UI.md`). Recorded `80799d0`; built on the web `1a6fada`, on iOS
    `9d60304`, `3f771c6`.
26. **Two tiers: the (i) is for one control's meaning, Help for the whole
    story.** One (i) component everywhere; Help is a page of its own, opened
    on purpose. **Never narrate what the interface visibly did.** Recorded
    `1a6fada`; built with 25.
27. **Say which way a miss goes, not the number.** "7/10 eggs hit the mark"
    does not say which way the other three miss, so a sentence saying which
    way the egg is likely to miss replaces it under the time, with a bracket
    under the slider for the yolk's likely range; then the number leaves the
    (i) too, and "I'm still learning" goes as a line of its own, since
    beside "I can't call it yet" it said the same thing twice. Built
    `7b9059f`, `1c4143d` (web), `3f771c6` (iOS).
28. **The app speaks in the first person singular, in the active voice.**
    The app is "I", the cook is "you", and a sentence has someone doing
    something; instructions stay imperative. Built `439dcd1`, `9675222`.
29. **The owner's wording rules**: sous-vide is not "a bath" ("ice bath"
    stays); "pan" only where it means the pot. Recorded `1a6fada`; applied in
    the redesign's draft.
30. **The rest of F2's wording is approved**, as the owner edited it, but for
    rows over budget or untrue, which were held back. Built `b1fddc9`; the
    held-back rows went in with later drafts, the last three in `tidy` (45).
31. **The doneness track is a yolk**: deep orange at runny to pale yellow at
    hard, the odds as its opacity. Built `b207188`.

## 28 September 2026 — after cooking on a phone, and the worklist

32. **No odds on the Lock Screen**: "I'd rather say nothing than waste space
    on useless odds". `odds.hitTheMark` is retired. Built `05e92ae`.
33. **The pull names the cooling chosen**, in the alarm and word for word on
    the Lock Screen card; the card ends at once when the cooling does; and
    "carryover" leaves the cooled alarm. Built `2c090c9`.
34. **The egg's mass tops out at 90 g**, a hen's egg; other birds' eggs, emu
    first, someday. Built `0e0ec98`. On the web a typed girth or width can
    still make a bigger egg, and that is accepted: "if the user gets to a
    weird place by dragging some slider, that's on them" (`055bd4e`).
35. **Sous-vide is never remembered** across a reload or relaunch. Built
    `d12a978`.
36. **The doneness heading carries the peak yolk; the play-safe suggestion
    goes from both apps; the setup sentence stays on screen while a cook
    runs.** Built `e04d72c`.
37. **Calibration is checked with proper scoring rules, not home-made
    quantile checks.** Each egg keeps the full forecast at "Eggs in" - the
    yolk's and the white's three answer probabilities, not the tenths - and a
    model version, so the model as shipped can be scored after the code
    changes. E7 evaluates by the log score first (the ordered-probit log
    likelihood one step ahead, whose sum over a cook's eggs the filter's
    incremental weights already compute; the 0.05 unrelated share keeps it
    finite), reports the ranked probability score, scores probe readings by
    CRPS or log predictive density, and shows calibration as reliability
    diagrams and randomised PIT histograms. The same per-cook prequential
    score, relative to the population model, screens unreliable or hostile
    contributors. The direction sentence, the bracket and the "still
    learning" interval are display and decision heuristics, not evaluation
    (`INFERENCE.md` §6, §7, §9). Recorded `2e9a67c`. Not built (E6, E7).

The worklist's questions (WORKLIST.md §1, D1-D8), answered the same day:

38. **No build newer than 19 September ran outside the owner's devices, so
    every piece of back-compat for one goes** ("kill em all", D1). Built
    `521c15d`, `de235e8`, `bbb1c99`, `232c414`, `86b0bf9`, `1c8c388`,
    `d5f52a9`.
39. **Delete `saferLevels` and everything that serves it** (D2). Built
    `23e6d3d`.
40. **`Decision` drops `interval`, `stillLearning` and `loss`** (D3). Built
    `527e1a4`.
41. **The Swift core drops what no app calls**: the science checks,
    measure-not-weigh and the inference read-outs. TypeScript keeps them
    (D4). Built `af0602f`.
42. **`sousvide.warn` was false**: the model sets the white after about
    22.7 h at 58 °C. Reworded (D5). Built `eb1fddf`.
43. **Choosing Weighed goes back to the last weighed mass**, as the web's
    measured option does (D6). Built `d767bff`.
44. **"Kitchen" is renamed "settings"**, and the key renames are finished
    (D7: "kitchen was a terrible name"). Built `6b060d9`, `7bdb816`.
45. **The copy review is applied as one named draft**, `tidy`, which the
    owner reads on a phone and trims back (D8). Built `eb1fddf`, `25a36f4`.
    The review is in the owner queue.

Decided by the owner, 29 September 2026:

46. **Push `main`** ("yes push"): the first push since 19 September,
    `2f341b4..5ff6940`, tagged `v0.2.0`. Recorded `cbd8d66`.
47. **Agents in worktrees commit on their branch and do not merge; the
    session that sent them verifies their work and merges it to local
    `main`.** Pushing stays the owner's call. This was already how the work
    ran before the rule said so (FOLLOWUP §0). Rule `5a9b290`.
48. **Alpha: no back-compat until the app is widely deployed**, and the owner
    says when that is ("actual widespread deployment is what makes storage
    formats permanent; I will tell you when that happens"). A public site
    with no users to speak of is still free to change a storage format:
    bump its key so an old value is dropped, and write no migration. This
    corrects the reading of 46 that the push alone made the formats
    permanent.
49. **Versions for both apps, with no promise of stability, and tags in
    git.** `0.3.0-alpha.1`: the owner asked for "something like 0.0.2alpha";
    it is 0.3.0 because the live site already reports 0.2.0 and versions only
    go up (TestFlight refuses a lower one too). iOS carries `0.3.0`, since
    Apple takes integers only. Each push to `origin/main` is a release:
    bump the version, tag the pushed commit `v<version>` (annotated), push
    the tag with it. CI checks a tag against `package.json`.

Decided by the owner, 2 October 2026:

50. **iPhone only, for now.** The app was universal and portrait-only, which
    Xcode warns of and App Store Connect refuses at upload (ITMS-90474:
    iPad multitasking wants every orientation). `TARGETED_DEVICE_FAMILY` is
    1 for the app and the widget; an iPad still runs it in iPhone
    compatibility mode. A real iPad layout is for someday.
51. **The privacy page lives on the Netlify site, at `/privacy`**, where the
    opt-in data collection endpoint (E6) will live too; App Store Connect's
    privacy policy URL points there. Plain English only, no 1750 twin.
    Built `a3930e1`, linked from Help in both apps `48eb443`.
52. **The running cook shows the egg in cross-section, as how set each
    layer is**, in both apps ("prioritise the 'how set' view"). The
    prototype offered how hot as well, a tap away. The heat map waits for
    a day it might be wanted ("we might put the heat view in one day"),
    and lives on in the lab page, `tools/egg-section.html`. The egg sits
    beside the setup sentence, not on a line of its own ("it burns
    vertical space for a nicety"). Its outline is an ovoid ("go ovoid"),
    though the model's egg is a sphere. Its raw white is clearer, with a
    touch of blue. Prototype `953c698`..`3ed187c`.

Decided by the owner, 3 October 2026:

53. **The motto is "Time eggs, not minutes"**, with a link to the owner's
    blog, https://danmackinlay.name, where the app is credited. Neither goes
    on the cooking screen: the motto heads Help in both apps and leads the
    web page's description; "Made by Dan MacKinlay" ends Help and links the
    blog, as the privacy page's name and the README do. It is also the App
    Store subtitle. The `motto` draft.
54. **The words read as a person who cooks would say them, not as a model
    writes.** Much of the copy "reads very Claudish". The model rewrite, of
    the Help line on cooling: "The cooling time also counts as cooking time,
    since the egg is still warm inside." The strings recorded as approved
    were approved as "good enough for now", not as final, and a style pass
    reads them like the rest. The `plain` draft; the rules are in
    `LANGUAGE.md` §3.
55. **The words are Australian English, with an American overlay.** The
    base catalogue says what an Australian kitchen says: the egg cools on
    the bench, under the cold tap, in a pan. An American reads
    `copy/en-US.json` over it, holding only the words an American kitchen
    says differently. The `bench` draft; the overlay is `LANGUAGE.md` §2.
56. **Curly apostrophes and quotes, never straight ones**, in every string
    a reader sees: ’ for an apostrophe, ‘ ’ and “ ” for quotation, in both
    apps, every catalogue, the web page's descriptions and the privacy
    page. `copy.test.ts` 3c holds it. The `quotes` draft.
57. **The cooling methods are named for what they are: an ice bath,
    running water, the air.** Not "cold tap" ("tap" is also the screen
    gesture) and not a surface the eggs sit on ("bench", "counter" and
    "worktop" are regional, and the method is the air, wherever the eggs
    are). So every English says the same, and the American overlay is down
    to "pot" for the pan. The line under the countdown is "below the time
    display": "under the time" read as "in less time". The buttons at the
    pull name only where the eggs are ("In the ice bath"), since the label
    above them says "Eggs out now". The `owner` draft, which also carries
    the owner's own edits of 3 October.

Decided by the owner, 2 October 2026, for E6-E8 (`COLLECTIVE.md`), numbered
after 57: `main` took 52-57 while E6-E8 were built on a branch:

58. **The nudge's "still learning" is a small badge with an (i)**, not a
    line: "A whole line saying still learning? How about a tiny badge over
    the UI with a disclosure (i)". It answers 3: a cook who is sharing sees
    a "Learning" mark by the time, and its (i) says why the time may move.
    Built with E8 (`82aff4b`).
59. **Turning sharing on sends the log so far**, not only the eggs after it:
    the per-cook effects and the per-cook log score (37) need each cook's
    whole sequence. The consent text says so. Built with E6 (`f7f9e90`,
    `0f93576`).
60. **App Attest is built now**, the iOS side and the server's verification
    together. An iPhone that cannot attest still sends, to the open tier.
    Built with E6 (`00186b1`, `0f93576`).
61. **The nudge is +-10 s, as designed, knowing what it costs.** Measured
    first (`npm run decide -- nudge`, 300 simulated cooks x 6 eggs): the
    share of eggs that come out right - the yolk just right and the white
    not runny - falls from 52.1% to 49.3% at +-10 s, and from 66.9% to 62.6%
    by a cook's sixth egg; +-5 s would cost under a point (51.3%) and teach a
    quarter as much per egg, +-3 s a third of a point and a ninth as much.
    The owner chose +-10 s. The Learning mark's (i) says the time may leave
    an egg a little softer or firmer. Built with E8 (`82aff4b`).

Decided by the owner, 3 October 2026, on the counter-physics branch, numbered
after 61 on `0.4.x`:

62. **Cooling on the bench is textbook physics, and the model treats it
    so.** Still air on a bench is "standard Newtonian/convective cooling";
    nobody would publish an egg-specific measurement of it, and the model
    should be no weaker, nor make odd choices, for the lack of one. Built
    `9d00f48`: convection and radiation from correlations, Newton's law at
    the shell, the wet shell's latent heat (`LOGBOOK.md`, 3 October 2026).
    The Help line that said no measurement was found becomes, approved as
    proposed: "On the bench, I assume the egg sits in still air. In a
    draught the yolk comes out a little softer, and in an egg cup a little
    firmer." (en-US: "counter", "draft".) It goes into the catalogue with
    the owner's hand edit of the words. The prior on `tauAirScale` stays
    at 0.35, "fine for now".

Decided by the owner, 3 October 2026, on the offline branch, numbered after
62 on `0.4.x`:

63. **The web app opens with no signal.** Asked whether the app needed
    work to sit on a Home Screen, the one gap was opening offline: "do the
    open-offline work". A service worker keeps one build of the site whole,
    and a new build takes over only between cooks, so an update never costs
    a running cook its alarm. Deleting `sw.js` takes it out. Built
    `6af878f`.

Decided by the owner, 3 October 2026:

64. **Branches are named for their version line**, not their contents:
    "the `e6-e8` convention is not legible". `main` stays what is live (it
    is what Netlify serves), the 0.4 work is `0.4.x`, and a `0.3.x` is cut
    only to fix 0.3 after 0.4 ships. `CLAUDE.md` says how.
65. **The English of 1750 is set in IM FELL English**, a period face "with
    not only serifs but aggressive ligatures", chosen from a specimen of
    the catalogue's strings over EB Garamond. Close is enough: "within a
    century and funny"; EB Garamond's 1592 would have been "acceptable
    for a joke". It draws ſs as ß, "not too bad a downside". The whole
    font as published, not a subset: "maintaining a cut down font is kind
    to the user but crueller to us". Served by the app, not a font
    service. `LANGUAGE.md` §6, *The face*.
66. **The long s everywhere in 1750**, drawn by the face's `hist`: "cannot
    the font handle it automatically everywhere? I'm fine with that". The
    catalogue still spells it only on the title.

Decided by the owner, 3 October 2026, on the privacy questions of
`SHIP-0.4.md` sections B and C, for 0.4. Recorded in `d5d9870`.

67. **Settings shows the random number**, in both apps, in the sharing
    section, so that a person can quote it in an email asking for their
    results to be deleted (the privacy page's "write to
    forgetmyeggs@danmackinlay.name with your random number"). Shown once
    sharing has been turned on, since there is none before; whole, never
    shortened, since the email needs all of it; and selectable, to copy.
    Built `546fda7` (the `sharingid` draft, "Your random number"); the
    privacy page says where it is (`8deebf5`).
68. **Results from the owner's own development builds do not count as from
    a genuine copy of the app**: asked whether they should, "ideally not".
    The server treats a key attested in App Attest's development
    environment (AAGUID `appattestdevelop`, a build installed from Xcode) as
    vouching for nothing: its results are kept in the open tier, exactly as
    if they were unsigned. Production attestations, which TestFlight and the
    App Store always make, count. The key is still verified and kept, so the
    whole path can be tried on a phone. The fit's pull reads each record's
    tier by the same rule. Built `d90e3cd`.
69. **Turning sharing off keeps what was sent**: "keep what was sent".
    It stops sending; consent for the results already sent is withdrawn by
    deleting them, with the button or by email, the answer to the GDPR
    Art. 17(1)(b) question `SHIP-0.4.md` B raised. The privacy page says so
    plainly (`8deebf5`).
70. **The privacy page says the owner lives in Australia.** Its `OWNER`
    mark is gone (`8deebf5`).
71. **No EU representative** (GDPR Art. 27): the owner chose to "accept
    the risk of having no EU representative", knowing the exemption for
    occasional processing likely does not apply. The privacy page says
    nothing about it.
72. **App Attest needs no answer of its own in App Store Connect's App
    Privacy.** What the server keeps for App Attest (the key's public half
    and name, a counter, how the app was installed and its build number)
    hangs off the same random id, which is declared as Device ID, and the
    use is App Functionality, whose definition includes "prevent fraud,
    implement security measures" (Apple's App Privacy Details page).
    `ios/RELEASING.md` step 6 says so (`fbaa94c`).
73. **No fixed retention period**: shared results are kept while the app
    works out starting guesses from them, until the person deletes them or
    the owner stops making the app ("this seems extremely non-personal
    information"). GDPR asks for a period *or the criteria*; the criteria
    are stated on the privacy page. No prune step is needed.
74. **Apple's App Privacy label says Not Linked to You** ("let's make sure
    it's not linked to the user"): the id is random and per install, with no
    account, no IP stored and nothing identifying sent. `ios/RELEASING.md`
    step 6 gives the reasoning; `PrivacyInfo.xcprivacy` already says not
    linked.
75. **The owner's local copy of the shared results is a snapshot, replaced
    at every pull**, not deleted after each run: the server keeps the
    records, so successive starting guesses are worked out from a fresh
    pull ("otherwise how do we update the successive posteriors?"). A
    deletion on the server reaches the local copy at the next pull. Like
    other citizen science, the records are kept for statistical purposes,
    pseudonymised (GDPR Art. 5(1)(e), 89(1)).
76. **The random id is a Device ID on Apple's App Privacy label** ("Device
    ID seems fine"), as `PrivacyInfo.xcprivacy` already declares: per
    install, no account behind it.

Decided by the owner, 5 October 2026, on the 0.4 line:

77. **Back to metric leaves the English of 1750 alone**: "switching to
    metric switched off English (1750). Switching *to* imperial should
    switch the English, but not the reverse." Metric to Imperial in modern
    English still goes into 1750; Imperial to metric changes nothing about
    the language, and the picker is the way out. The stored `flippedFrom`
    that made the switch back possible is gone and ignored when read, so no
    storage key changed. `LANGUAGE.md` §6; the `stay` draft drops the (i)'s
    "and back when you pick Metric". Built `9c9ea24`.
78. **"Boil" is never a noun** in anything a person reads: "the boil", "a
    full boil", "the rolling boil", "boil times" and "signal the boil"
    sound medical. "Boiling" is fine, and so is "boil" the verb ("water
    boils at", "how long your water takes to boil", "once it's boiling").
    Refined the same day: "brought to the boil" and "to the boil" stay,
    because they sound like cooking. The button keeps its name, **"Full
    rolling boil"** (CLAUDE.md invariant 6), and text that names it keeps
    the name exactly; its 1750 name, "It boils in earnest", is already a
    verb. The setting "After the boil" is **"Once it's boiling"** ("Once it
    boils" in 1750). Every English, en-US and 1750 included, and the
    privacy page; code identifiers and keys (`controls.afterTheBoil`) stay.
    The `boiling` draft, `89d5aa1`; the privacy page, `7bf35a6`.
79. **The feedback reminds the cook what they asked for, the probe reading
    steps, and a probe owner can give the room.** Three requests, in both
    apps: the probe's highest reading gets a − and + like every other
    number, in the cook's unit, starting from the peak yolk the app
    predicted for that cook (whole degrees; still typed to a tenth); the
    questions after a cook show the target from what was started ("You
    asked for: jammy, peak yolk 65 °C"); and with the probe on, Settings
    offers an optional room temperature, defaulting to the 20 °C assumed,
    which then feeds the model wherever the room was assumed: the air the
    eggs cool in, the water left to stand and a cold pan's start, and an
    egg left out at room temperature. Not a reversal of the old rule that
    the room needs no input of its own: without a measured room that rule
    stands. The record's `ambient_C` already holds the room, so no record
    format changed. The `feedback2` draft; built on the
    `probe-target-room` branch.
80. **The soft end of the slider stays as it is** ("this seems fine for
    now"): below about level 0.3, once a few results are learned, the time
    leans firmer to set the white (decision 7), so the bracket's median sits
    right of the thumb; the direction sentence says so. Not hatched or
    skipped, and the 3× runny-white cost is unchanged. 5 October 2026.
81. **The owner's results are kept, and can be exported**: "build an
    export function", and protect the log. Amends 48 for this one store:
    **the results log's storage key and its record format change only
    with a migration**, from now on (`calibration.v4` on iOS,
    `aet.calibration.v4` on the web; the record is schema v1,
    `INFERENCE.md` §4). Neither app writes over a log it cannot read: a
    record it cannot read is set aside in its place and written back, and
    a store it cannot read at all is kept as stored under a side key (the
    newest three) before anything replaces it; a cook in progress it cannot
    read is kept the same way. The posterior is replayed whenever the model
    it was folded under (`MODEL_ID`, kept beside it) is not this build's.
    "Export my results", in Settings under What I've learned, saves the
    store exactly as stored and every copy kept aside to a file - a
    download on the web, the share sheet on iOS, nothing sent - and
    `npm run eggs -- import` reads it back for the fit. "Start learning
    again" deletes what was kept aside with the rest. A cook too old to
    pick back up that finished unanswered is logged as unanswered, and on
    iOS a second answer after a relaunch is kept when the egg is the last
    in the log and not yet shared. The results file `8d1ab68`; the log
    kept, web `2e37357` and iOS `301668c`; dropped cooks and the second
    answer `5a24742`; the `export` draft `7596437`; import `6910cbd`; the
    privacy page `8354d8a`.
82. **The owner's own random IDs are trusted in the population fit**:
    "trust my random id explicitly". An egg under an ID the owner lists
    counts at the attested tier's full weight whatever tier it came in -
    a build from Xcode is open (68), and so is the web - and on the
    attested side of the open tier's cap; a trusted cook is never held out.
    The list is never committed, since it would tie the owner to their
    results: `fit/trusted.local.txt` (gitignored) and `EGGFIT_TRUSTED`.
    `npm run eggs -- pull` and `import` mark the lines, and the fit reads
    the list again. The published population counts trusted eggs and names
    no one. Built `6910cbd` (the tools) and `a9c5ac8` (the fit).
83. **Only what the pan cannot deliver refuses; low odds warn.** Testing
    0.4.0 on a phone (58 g from the fridge, into boiling water, an ice bath,
    little learned), the owner could not move the thumb left of jammy,
    though the dotted track looked draggable: "is a soft yolk just
    impossible?" It was not; it was under 3/10 so far. Amends 20: the
    stripes, the levels the pan cannot deliver, still move the slider out of
    them, but a dotted level, one the pan delivers and gets right fewer than
    3 times in 10 so far, can be chosen. The threshold stays at 3/10 and now
    drives the warning and the colour instead of a wall: the slider rests
    there, the time, the direction and the bracket are for that level, and
    the warning line says "Soft: I get this right fewer than 3 times in 10
    so far." The advice link stays. No warning and no dots before the first
    egg that taught something, as before. 5 October 2026; the `warn` draft.
    Built `36eb766` (core, Swift, the draft), web `fd6e2cc`, iOS
    `5adebf9`, on the `warn-low-odds` branch.
84. **The time never falls as the doneness rises** ("yes, I want it
    monotone"). Each level's time was chosen against that level's own
    target, so after a runny white soft's time leant past jammy's (58 g
    from the fridge, boiling water, ice, one egg soft with a runny white:
    soft 500 s, jammy 428 s), and asking for softer gave a firmer egg. Now
    a level is given the smallest of its own choice and every firmer
    level's - a running minimum from the hard end, built in the odds
    profile - so soft there takes 427 s, the time of the softest firmer
    level whose choice is sooner. Amends 80: the soft end still leans late
    to set the white, but never past a firmer level's time. The 3×
    runny-white cost is unchanged. Before the pot's profile lands, and
    before the first egg, nothing changes. 5 October 2026. Built `22eadb5`
    (core, Swift), web `ffba100`, iOS `2a3d7b7`, on the `monotone` branch.
85. **Web and other unattested results get no weight in the population fit,
    for now** ("If not, let's weight them 0 for now"). The owner would give
    them 0.25 if bad results could be pinned on particular bad actors. They
    can be only in part: results group by their random ID, and the per-ID
    log score (37) flags an ID that answers wildly, but an ID costs nothing
    to make and no address is kept, so one bad actor can be many IDs with a
    few results each. Every open result is kept, so a weight can be given
    later, and any ID removed, by re-running the fit. The fit's default is
    `--open-power 0`; trusted IDs (82) and attested results count in full.
    5 October 2026.
