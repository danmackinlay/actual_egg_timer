# DECISIONS.md — what the owner decided

Every decision the owner has taken, numbered in the order it was taken, with
the date. Code and the other documents cite these by number ("DECISIONS.md
7"). A number is never reused. A decision the owner later replaces stays
here as its title and "Superseded by N", and the latest decision in the
chain states the whole current rule. A decision changed only in part says
the current rule in its own entry, citing the later one.

What waits on the owner is not here; it is `PLAN.md`'s open decisions.

---

## 21 September 2026 — the inference, pooled

The design they belong to is `INFERENCE.md`.

1. **The endpoint is a Netlify function, and the controller is the owner, in
   their own name.** `INFERENCE.md` §7 has the shape. The contact address is
   forgetmyeggs@danmackinlay.name, chosen and created 26 September.
2. **The web app contributes, at a lower weight**: a tempered likelihood in
   the global fit and a cap on the tier's effective sample size, with no
   discount on what a web cook's answers teach their own browser
   (`INFERENCE.md` §6).
3. **The nudge is fine, provided the app says it is learning.** The point is
   to manage expectations, so the wording belongs on the screen with the
   time, not only in the consent (`INFERENCE.md` §8). 58 says how: a
   Learning mark by the time, with an (i).
4. **Three yolk answers, not five, and every answer is optional.**
   Superseded by 92.
5. **"Tender" stands, for now.** Slightly odd, not pathological, and no
   picture could do better. Revisit if real cooks stumble on it; the record
   will show whether the middle answer is used.

## 26 September 2026 — the record, the loss, the words

6. **Eggs from before the per-egg record are dropped with the new
   likelihood, not backfilled.** The record kept the pre-log posterior as a
   frozen base; the new likelihood could not replay it, so it started from
   the prior plus the record's log.
7. **The loss ratio is 3.** A runny white counts as three times as bad as a
   yolk one step too firm (`RUNNY_WHITE_LOSS`, `INFERENCE.md` §8). A
   constant for now, and a per-cook setting only if someone asks for one.
   Confirmed by the owner on 17 October 2026, after `npm run decide --
   versus` showed the chosen time giving up eggs right for fewer runny
   whites against the posterior-mean time, and winning in this loss: the
   decision layer stays.
8. **The odds are always on screen, and brief: "7/10 eggs hit the mark".**
   Superseded by 32 and 93.
9. **"Still learning" goes when the 80% interval on the cook time narrows
   below about ±15 s.** Superseded by 40.
10. **No kitchens.** Pans and hobs vary within a kitchen and nobody maintains
    profiles, so the kitchen level folds into the cook (`INFERENCE.md` §2).
11. **The heat-off pan's constant comes from the water volume, not the boil
    time.** Deriving it from the boil time with `RAMP_R` fixed reads the hob
    as the pan: a hob twice as strong as assumed made the pan look about 2.2
    times faster to cool. Anchored so Williams' 17-minute method (a 480 s
    boil, 2 L) is unchanged, and scaled as `V^(1/3)`. Lid and pan material
    become a per-cook scale learned only from heat-off cooks; nobody is asked
    to time an empty pan. The per-cook scale is deferred (`PLAN.md`).
12. **1750 is a language code**, `<region>-x-1750`, reached by the picker or
    by switching an English UI to Imperial, and left by picking English
    (`LANGUAGE.md` §6).
13. **Americans should be able to find it**: a picker row and one line under
    the Imperial option, and nothing more insistent.
14. **Support burden is not a design constraint.** The app is free, and
    feature requests come as pull requests. No choice is made or unmade on
    the grounds that it will generate questions.
15. **Czech is the first language after English**, reviewed by a friend of
    the owner (`LANGUAGE.md` §5). It waits for the reviewer.
16. **US carton size classes in region US**, at the midpoint of each USDA
    range: an EU Large had been overcooking an American Large by about 34 s
    (`LANGUAGE.md` §4).
17. **The owner reviews the 1750**, against Johnson's *Preface*
    (`LANGUAGE.md` §6). The review waits on the owner (`PLAN.md`).

## 27 September 2026 — the odds on screen, the redesign, the voice

18. **The white offset's attribution is left as it is**: two runny whites move jammy about
    as far as soft, and that stays until a probe or pooling pins the
    time-scale (`INFERENCE.md` §3). `test/infer.test.ts` pins the limit.
19. **The protocol advice is discoverable, not intrusive**: offered in
    place under low odds, no modal and no popover. Since 26 it is a link into Help, not a disclosure.
20. **An odds-shaded slider in both apps, threshold 3/10.** Superseded by
    83.
21. **The fresh install's odds stay on screen, with an (i) saying why they
    start low.** Superseded by 93.
22. **No time of day zero-pads its hour**, in either app, in any locale:
    "9:05", never "09:05". The countdown is not a time of day.
23. **Numbers follow the UI's language**, and the region only where the
    language has no convention of its own: a Czech UI writes "1 234,5" in
    the US as in Czechia; English follows the region, so `en-DE` writes
    "2,4".
24. **Push `main` after previewing the web app.** No real eggs for now: the
    owner is travelling.
25. **Fewer controls, room for sentences.** Brief controls get a longer (i);
    few enough controls are on screen that longer strings fit, for clarity or
    comedy; wording is judged in place on a phone, not approved row by row in
    tables (`UI.md`).
26. **Two tiers: the (i) is for one control's meaning, Help for the whole
    story.** One (i) component everywhere; Help is a page of its own, opened
    on purpose. **Never narrate what the interface visibly did.**
27. **Say which way a miss goes, not the number.** Superseded by 93.
28. **The app speaks in the first person singular, in the active voice.**
    The app is "I", the cook is "you", and a sentence has someone doing
    something; instructions stay imperative.
29. **The owner's wording rules**: sous-vide is not "a bath" ("ice bath"
    stays); "pan" only where it means the pot.
30. **The rest of F2's wording is approved**, as the owner edited it, but for
    rows over budget or untrue, which were held back; those went in later.
31. **The doneness track is a yolk**: deep orange at runny to pale yellow at
    hard, the odds as its opacity.

## 28 September 2026 — after cooking on a phone, and the worklist

32. **No odds on the Lock Screen**: "I'd rather say nothing than waste space
    on useless odds". `odds.hitTheMark` is retired.
33. **The pull names the cooling chosen**, in the alarm and word for word on
    the Lock Screen card; the card ends at once when the cooling does; and
    "carryover" leaves the cooled alarm.
34. **The egg's mass tops out at 90 g**, a hen's egg; other birds' eggs, emu
    first, someday. On the web a typed girth or width can still make a
    bigger egg, and that is accepted: "if the user gets to a weird place by
    dragging some slider, that's on them".
35. **Sous-vide is never remembered** across a reload or relaunch.
36. **The doneness heading carries the peak yolk; the play-safe suggestion
    goes from both apps; the setup sentence stays on screen while a cook
    runs.**
37. **Calibration is checked with proper scoring rules, not home-made
    quantile checks.** Each egg keeps the full forecast at "Eggs in" - the
    yolk's and the white's three answer probabilities, not the tenths - and a
    model version, so the model as shipped can be scored after the code
    changes. The population fit evaluates by the log score first (the ordered-probit log
    likelihood one step ahead, whose sum over a cook's eggs the filter's
    incremental weights already compute; the 0.05 unrelated share keeps it
    finite), reports the ranked probability score, scores probe readings by
    CRPS or log predictive density, and shows calibration as reliability
    diagrams and randomised PIT histograms. The same per-cook prequential
    score, relative to the population model, screens unreliable or hostile
    contributors. The direction sentence, the bracket and the "still
    learning" interval are display and decision heuristics, not evaluation
    (`INFERENCE.md` §6, §7, §9).

The worklist's questions, answered the same day:

38. **No build newer than 19 September ran outside the owner's devices, so
    every piece of back-compat for one goes** ("kill em all").
39. **Delete `saferLevels` and everything that serves it.**
40. **`Decision` drops `interval`, `stillLearning` and `loss`.** No screen
    shows "still learning" (93). Where the interval is studied, the owner's
    threshold (26 September 2026) stands: the 80% interval on the cook time
    narrowing below about ±15 s.
41. **The Swift core drops what no app calls**; TypeScript keeps it.
42. **`sousvide.warn` was false**: it says what the model does, which sets
    the white after about 22.7 h at 58 °C.
43. **Choosing Weighed goes back to the last weighed mass**, on both apps.
44. **"Kitchen" is renamed "settings"** ("kitchen was a terrible name").
45. **The copy review is applied as one named draft.** Superseded by 106.

Decided by the owner, 29 September 2026:

46. **Push `main`** ("yes push"): the first push since 19 September,
    tagged `v0.2.0`.
47. **Agents in worktrees commit on their branch and do not merge; the
    session that sent them verifies their work and merges it to local
    `main`.** Pushing stays the owner's call. This was already how the work
    ran before the rule said so. An agent may push its own branch (124).
48. **Alpha: no back-compat until the app is widely deployed.** Superseded
    by 107.
49. **Versions for both apps, with no promise of stability, and tags in
    git.** `0.3.0-alpha.1`: the owner asked for "something like 0.0.2alpha";
    it is 0.3.0 because the live site already reports 0.2.0 and versions only
    go up (TestFlight refuses a lower one too). iOS carries `0.3.0`, since
    Apple takes integers only. A release bumps the version, tags its commit
    on `main` `v<version>` (annotated) and pushes the tag with it (120). CI
    checks a tag against `package.json`.

Decided by the owner, 2 October 2026:

50. **iPhone only, for now.** The app was universal and portrait-only, which
    Xcode warns of and App Store Connect refuses at upload (ITMS-90474:
    iPad multitasking wants every orientation). `TARGETED_DEVICE_FAMILY` is
    1 for the app and the widget; an iPad still runs it in iPhone
    compatibility mode. A real iPad layout is for someday.
51. **The privacy page lives on the Netlify site, at `/privacy`**, where the
    opt-in data collection endpoint lives too; App Store Connect's
    privacy policy URL points there. Plain English only, no 1750 twin.
    Help links it in both apps.
52. **The running cook shows the egg in cross-section, as how set each
    layer is**, in both apps ("prioritise the 'how set' view"). The
    prototype offered how hot as well, a tap away. A tap on the egg
    toggles between how set and how hot, the heat map, and back, wherever
    the egg is shown; the choice is remembered between cooks, and the heat
    map is in the lab page's palette, light and dark (the owner, 18
    October 2026). The egg sits
    beside the setup sentence, not on a line of its own ("it burns
    vertical space for a nicety"). Its outline is an ovoid ("go ovoid"),
    though the model's egg is a sphere. Its raw white is clearer, with a
    touch of blue.

Decided by the owner, 3 October 2026:

53. **The motto is "Time eggs, not minutes"**, with a link to the owner's
    blog, https://danmackinlay.name, where the app is credited. Neither goes
    on the cooking screen: the motto heads Help in both apps and leads the
    web page's description; "Made by Dan MacKinlay" ends Help and links the
    blog, as the privacy page's name and the README do. It is also the App
    Store subtitle.
54. **The words read as a person who cooks would say them, not as a model
    writes.** Much of the copy "reads very Claudish". The model rewrite, of
    the Help line on cooling: "The cooling time also counts as cooking time,
    since the egg is still warm inside." The strings recorded as approved
    were approved as "good enough for now", not as final, and a style pass
    reads them like the rest. The rules are in `LANGUAGE.md` §3.
55. **The words are Australian English, with an American overlay.** The
    base catalogue says what an Australian kitchen says: the egg cools on
    the bench, under the cold tap, in a pan. An American reads
    `copy/en-US.json` over it, holding only the words an American kitchen
    says differently. The overlay is `LANGUAGE.md` §2.
56. **Curly apostrophes and quotes, never straight ones**, in every string
    a reader sees: ’ for an apostrophe, ‘ ’ and “ ” for quotation, in both
    apps, every catalogue, the web page's descriptions and the privacy
    page. `copy.test.ts` holds it.
57. **The cooling methods are named for what they are: an ice bath,
    running water, the air.** Not "cold tap" ("tap" is also the screen
    gesture) and not a surface the eggs sit on ("bench", "counter" and
    "worktop" are regional, and the method is the air, wherever the eggs
    are). So every English says the same, and the American overlay is down
    to "pot" for the pan. The line under the countdown is "below the time
    display": "under the time" read as "in less time". The buttons at the
    pull name only where the eggs are ("In the ice bath"), since the label
    above them says "Eggs out now".

Decided by the owner, 2 October 2026, for sharing, the population fit and
the nudge, numbered after 57, which
were merged first:

58. **The nudge's "still learning" is a small badge with an (i)**, not a
    line: "A whole line saying still learning? How about a tiny badge over
    the UI with a disclosure (i)". It answers 3: a cook who is sharing sees
    a "Learning" mark by the time, and its (i) says why the time may move.
59. **Turning sharing on sends the log so far**, not only the eggs after it:
    the per-cook effects and the per-cook log score (37) need each cook's
    whole sequence. The consent text says so.
60. **App Attest is built now**, the iOS side and the server's verification
    together. An iPhone that cannot attest still sends, to the open tier.
61. **The nudge is +-10 s, as designed, knowing what it costs.** Measured
    first (`npm run decide -- nudge`, 300 simulated cooks x 6 eggs): the
    share of eggs that come out right - the yolk just right and the white
    not runny - falls from 52.1% to 49.3% at +-10 s, and from 66.9% to 62.6%
    by a cook's sixth egg; +-5 s would cost under a point (51.3%) and teach a
    quarter as much per egg, +-3 s a third of a point and a ninth as much.
    The owner chose +-10 s. The Learning mark's (i) says the time may leave
    an egg a little softer or firmer.

Decided by the owner, 3 October 2026, on the counter's physics:

62. **Cooling on the bench is textbook physics, and the model treats it
    so.** Still air on a bench is "standard Newtonian/convective cooling";
    nobody would publish an egg-specific measurement of it, and the model
    should be no weaker, nor make odd choices, for the lack of one. The
    model takes convection and radiation from correlations, Newton's law at
    the shell, the wet shell's latent heat.
    The Help line that said no measurement was found becomes, approved as
    proposed: "On the bench, I assume the egg sits in still air. In a
    draught the yolk comes out a little softer, and in an egg cup a little
    firmer." (en-US: "counter", "draft".) It goes into the catalogue with
    the owner's hand edit of the words. The prior on `tauAirScale` stays
    at 0.35, "fine for now".

Decided by the owner, 3 October 2026, on opening offline:

63. **The web app opens with no signal.** Asked whether the app needed
    work to sit on a Home Screen, the one gap was opening offline: "do the
    open-offline work". A service worker keeps one build of the site whole,
    and a new build takes over only between cooks, so an update never costs
    a running cook its alarm. Deleting `sw.js` takes it out.

Decided by the owner, 3 October 2026:

64. **Branches are named for their version line.** Superseded by 120.
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

Decided by the owner, 3 October 2026, on the privacy questions for 0.4:

67. **Settings shows the random number**, in both apps, in the sharing
    section, so that a person can quote it in an email asking for their
    results to be deleted (the privacy page's "write to
    forgetmyeggs@danmackinlay.name with your random number"). Shown once
    sharing has been turned on, since there is none before; whole, never
    shortened, since the email needs all of it; and selectable, to copy.
    The privacy page says where it is.
68. **Results from the owner's own development builds do not count as from
    a genuine copy of the app**: asked whether they should, "ideally not".
    The server treats a key attested in App Attest's development
    environment (AAGUID `appattestdevelop`, a build installed from Xcode) as
    vouching for nothing: its results are kept in the open tier, exactly as
    if they were unsigned. Production attestations, which TestFlight and the
    App Store always make, count. The key is still verified and kept, so the
    whole path can be tried on a phone. The fit's pull reads each record's
    tier by the same rule.
69. **Turning sharing off keeps what was sent**: "keep what was sent".
    It stops sending; consent for the results already sent is withdrawn by
    deleting them, with the button or by email, which answers GDPR
    Art. 17(1)(b). The privacy page says so plainly.
70. **The privacy page says the owner lives in Australia.** Its `OWNER`
    mark is gone.
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
    `ios/RELEASING.md` step 6 says so.
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
    storage key changed, and the (i) no longer says "and back when you pick
    Metric" (`LANGUAGE.md` §6).
78. **"Boil" is never a noun** in anything a person reads. Superseded by
    111.
79. **The feedback reminds the cook what they asked for, the probe reading
    steps, and the cook can give the room.** Three requests, in both apps:
    the probe's highest reading gets a − and + like every other number, in
    the cook's unit, starting from the peak yolk the app predicted for that
    cook (whole degrees; still typed to a tenth); the questions after a cook
    show the target from what was started ("You asked for: jammy, peak yolk
    65 °C"); and an optional room temperature, defaulting to the 20 °C
    assumed, feeds the model wherever the room was assumed: the air the eggs
    cool in, the water left to stand, and an egg left out at room
    temperature. A cold pan starts at the cold tap's temperature, not the
    room's (144). The room is shown with or without the probe, in
    the setup sentence's panels where it changes the answer (143). Without a
    measured room, the old rule stands that the room needs no input of its
    own. The record's `ambient_C` already holds the room, so no record
    format changed.
80. **The soft end of the slider stays as it is.** Superseded by 84 and
    97.
81. **The owner's results are kept, and can be exported.** Superseded by
    107.
82. **The owner's own random IDs are trusted in the population fit**:
    "trust my random id explicitly". An egg under an ID the owner lists
    counts at the attested tier's full weight whatever tier it came in -
    a build from Xcode is open (68), and so is the web - and on the
    attested side of the open tier's cap; a trusted cook is never held out.
    The list is never committed, since it would tie the owner to their
    results: `fit/trusted.local.txt` (gitignored) and `EGGFIT_TRUSTED`.
    `npm run eggs -- pull` and `import` mark the lines, and the fit reads
    the list again. The published population counts trusted eggs and names
    no one.
    Amended 6 October 2026: an ID on the list
    is not enough, since anyone who learns it could post at full weight
    under it. A result counts in full only if it is in a results file the
    owner exported and imported, or is the pulled twin of one that is.
83. **An odds-shaded slider in both apps; only what the pan cannot deliver
    refuses, and low odds warn.** Reachability ("softest possible") comes
    from the odds, not the mean solve, and the shading is relative to the
    best level, so a fresh install still shows where the pan works (27
    September 2026). Testing 0.4.0 on a phone (58 g from the fridge, into
    boiling water, an ice bath, little learned), the owner could not move
    the thumb left of jammy, though the dotted track looked draggable: "is a
    soft yolk just impossible?" It was not; it was under 3/10 so far. So the
    stripes, the levels the pan cannot deliver, still move the slider out of
    them, but a dotted level, one the pan delivers and gets right fewer than
    3 times in 10 so far, can be chosen. The threshold stays at 3/10 and
    drives the warning and the colour instead of a wall: the slider rests
    there, the time, the certainty word and the bracket are for that level,
    and the warning line says that level is a wild guess so far (97). The
    advice link stays. No warning and no dots before the first egg that
    taught something. 5 October 2026.
84. **The time never falls as the doneness rises** ("yes, I want it
    monotone"). Each level's time was chosen against that level's own
    target, so after a runny white soft's time leant past jammy's (58 g
    from the fridge, boiling water, ice, one egg soft with a runny white:
    soft 500 s, jammy 428 s), and asking for softer gave a firmer egg. Now
    a level is given the smallest of its own choice and every firmer
    level's - a running minimum from the hard end, built in the odds
    profile - so soft there takes 427 s, the time of the softest firmer
    level whose choice is sooner. The soft end still leans late to set the
    white (7): below about level 0.3, once a few results are learned, the
    bracket's median sits right of the thumb, and the level is not hatched
    or skipped ("this seems fine for now"). It never leans past a firmer
    level's time. The 3× runny-white cost is unchanged. Before the pot's
    profile lands, and before the first egg, nothing changes. 5 October
    2026.
    Amended 6 October 2026 ("agreed"): monotone at the
    profile's points, and within about a second of it between them, where
    the choice can dip inside its bounds (0.61 at 716.1 s, 0.62 at 715.2 s).
    Exact would cost up to four more solves a drag; not worth it.
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
    Amended 6 October 2026: the web keeps asking to share, and keeps its
    nudge ("that would give us no signal of the quality of the web
    sharing data"). Web results are collected now as a measure of their
    own quality - how well they agree with attested ones, ID by ID - and
    may be given weight later, once that is known.
86. **Knowing a random ID is enough to delete its results** ("agreed").
    A separate delete secret, kept on the device and never shown, would
    stop an emailed request or a lost device from deleting anything. The
    risk is that someone who learns an ID can delete that person's
    results; IDs are 122 random bits, shown only in that person's own
    Settings, and deleting is that person's right in any case.
    6 October 2026.
87. **A phone restored from a backup sends unverified** ("Accepted"). The
    App Attest key does not survive a restore, and the server refuses a
    second key for an ID. The phone keeps its random ID and sends without
    App Attest from then on, explicitly, so its results
    weigh as the web's do (85). A new ID would split one person in two for
    the fit; a second key per ID could be claimed by anyone with an iPhone
    and someone else's ID. 6 October 2026.
88. **Settings shows only the current random ID** ("an open and shut
    privacy non-problem"). A device can hold older IDs it has stopped
    using; "Delete shared results" deletes under every one of them, and an
    ID nobody can see cannot be tied back to anyone. 6 October 2026.
89. **Netlify: per-address rate limit as it is; old deploys deleted;
    previews kept.** The function keeps `aggregateBy: ['ip', 'domain']`,
    the only grouping Netlify's free plan offers; the owner checks the
    deploy log's post-processing stage for the rule after the next deploy.
    A deploy's own address cannot reach the live store, so a separate
    count per address costs nothing there. The owner deletes
    the deploys built between `00186b1` and `2850f40` in the dashboard.
    Deploy previews stay on for branches of this repository (the owner's
    own testing, e.g. PR #2). A pull request from someone else's fork of
    this public repository would build a preview running their code,
    which could open the site-wide store; the project's sensitive
    variable policy is set to "Require approval" (Project configuration,
    Environment variables, Project policies), so such a build waits for
    the owner to accept or reject it. Read its changes to
    `netlify/functions/` and `server/` before accepting. 6 October 2026.
90. **The review's refactors go to 0.5** ("you want to do this in 0.5 or
    later?" - yes): the time decision, record assembly, the sharing state
    machine and the decode decision moved into core with fixtures; `app.ts`
    and `calibration.ts` split; `oddsProfile` without closures; and the
    tidy-ups (the shape study's quick results, the Vercel config, the
    closed worklists, finished drafts, the fit's tests in CI). 6 October
    2026.
91. **One screen for setting up and boiling, with changes allowed after
    the start: 0.5** (testing 0.4 on a phone after a reinstall, the owner
    started an egg set to "into boiling water" when it had gone into cold
    water, and had no way to say so). The setup and the timer screens show
    much the same: the sentence and the time. Early in a cook, the start
    (cold or boiling water), the egg and the pot can still change, since
    nothing yet commits the egg to either; the timer should take the
    change and re-plan from what has already happened. It needed real
    interface design, so it went to 0.5. 6 October 2026.
    Added the same day: the egg in cross-section (52) stays on that
    screen all the time. While the settings are chosen it previews the
    yolk and white they aim for; when the timer starts it goes back to
    raw and cooks along with it.
92. **The yolk question names the yolk; the white question asks about the
    white next to the yolk; the probe sits below them; every answer is
    optional** (the owner, testing 0.4). "Too soft / Just right / Too firm"
    throws bits away and fails when the yolk wanted could not be chosen: the
    owner wanted runny, a new install would not offer it, the yolk came out
    runny, and no answer said so. The cook names the yolk they got, in the
    slider's words (Runny, Soft, Jammy, Fudgy, Hard), whatever was asked
    for. The white next to the shell is nearly always set, so the white
    question asks about the white next to the yolk. The thermometer reading
    is not offered as a question; it is a field below the yolk and white
    answers. Every answer is optional, and a skip is recorded as a skip; its
    statistical cost is accepted rather than engineered away (the owner, 21
    September 2026). Proposed for 0.4, so shared results start in this
    form; older answers are kept and fitted as they were. 6 October 2026.
93. **0.5 says how sure it is in words; the numbers are a tap away**
    ("two-sided interval communication under uncertainty... switch our
    communication to 'Very certain, ballpark, wild guess'... if they tap
    that word, we can overlay it with the... 90% interval"). Since 92 the
    cook answers with a yolk word, while the screen still showed the chance
    of "just right", a narrower event (0.21 against 0.32 for Jammy, a fresh
    jammy egg): the two no longer talked about the same thing. The main
    line under the time is a certainty word read from the predicted spread
    of the five yolk words at the chosen time: very certain when 9 times in
    10 it is the word asked for; a ballpark when 9 times in 10 it is that
    word or a neighbour, with the word asked inside that interval (the
    owner, 19 October 2026); a wild guess otherwise. A tap shows the interval
    in the cook's words ("9 times in 10: between Soft and Fudgy. Most likely
    Jammy."), and a likely time range. The bracket under the slider shows
    the same interval (97). No screen shows the odds as a number, the Lock
    Screen shows none (32), and "I'm still learning" is no line of its own
    (a cook who shares sees 58's badge). The odds shade the slider and set
    its reach (83). The 3/10 warning, the lean line and the ticks' colours
    are restated in these terms. 6 October 2026.
94. **The apps keep 1000 particles** ("let's not raise the particle count
    for the users. That is costly. we can raise it in testing if that is
    reassuring"). At 1000 the chosen time moves 2-3 s with the seed and
    the shown odds about 0.05, and the filter is mildly overconfident; at
    4000 the simulation-based calibration is uniform, which shows the
    filter samples the right posterior and the rest is Monte Carlo error.
    Tests and `npm run sbc` may run at any count. 6 October 2026.
95. **The counter's carryover is fixed at 1.0, not learned: 0.5** ("fix
    it at 1.0 in 0.5"). `tauAirScale` scales `H_AIR` on the counter. It
    is a particle dimension, but every dose grid is built at its posterior
    mean, so the answers never inform it; its mean only drifts with
    resampling, the worst-calibrated quantity in `npm run sbc`. Learning it
    properly costs a third grid axis or a simulation per particle for
    counter-rested cooks only, and their answers mostly teach alpha and the
    taste offset. In 0.5 it leaves the particle and the population fit and
    is held at 1.0; that changes the stored posterior, so `MODEL_ID` moves
    and stored posteriors are replayed. 6 October 2026.
96. **Every change after the start is a correction; everything stays
    open** (the owner, on the one screen's design: "they should be
    able to change everything in principle", "leave the displays as
    similar as possible between pre-cooking and cooking"; of the
    correction, "we want this one"; "agreed"). Every setting can still be
    changed once a cook has started, and every change says "it was always
    like this": the whole cook is re-planned from its start under the new
    setup, keeping the start time and what the cook observed (the boil
    tap, the pull). Changing it back gives back the old plan exactly. A
    setting not yet in force (the yolk wanted, the cooling) only
    re-plans the future; after the pull a change corrects the record, but
    for the yolk asked for, which the slider then only previews (98). So
    a cook is its start, its setup and its observed events, and the plan
    is derived from them each time rather than frozen at "Eggs in"; the
    setting-by-setting table of when each locks is dropped. The egg in
    cross-section shows the live egg, and while the cook's finger is on a
    control, the egg those settings aim for. Turning the heat off at a
    moment ("heat off now") is not a correction and is not in 0.5; it may
    come later as an event, a button like Full rolling boil, not a
    setting. 7 October 2026.
97. **The one screen's remaining questions: the recommendations** ("Your
    recommendations all look fine. I would like you to accept them all
    except where one accrues substantially more maintenance burden than the
    alternative"). As recommended: a change applies at once, unconfirmed;
    one that makes the egg overdue goes to the pull and rings, and changing
    it back within the grace cancels that; the record's forecast is the
    corrected cook's, with no new field; the boil memory learns at the end,
    and not from a tap after a boiling-to-cold correction; the aimed-for egg
    is one egg (98 sets it at the end of the cooling), shown at idle and
    while a control is held mid-cook; the certainty word under the time, its
    interval in place on a press, one 90% interval for the words and the
    bracket, the lean line retired, the 3/10 warning restated as a wild
    guess, the shading the chance of the word asked; the start time
    correctable (108 puts it in the start's panel); an event's own time not
    correctable in 0.5; a correction updates the settings for the next
    cook; a 0.4 cook running at the upgrade kept aside, not converted
    ("choose what is least burdensome"). Also answered: the protocol advice
    priced at the level the odds are for ("seems fine"); the likely time
    range stays as built until real eggs show how it reads. Tabs are 128's.
    7 October 2026.
98. **The one screen's red-team review: its choices, under 97's rule**
    (97: "accept them all except where one accrues substantially more
    maintenance burden than the alternative").
    A pull the clock assumed (the grace ran out) is not an observation: it
    stays correctable, and a correction that would move it later asks
    whether the egg is still in the water (the alternative left the
    owner's own case uncorrectable once the alarm had rung). A
    boil tapped after a boiling-to-cold correction made later than the
    pot's remembered time to boil is planned on the remembered time, and
    on the tap only when nothing is remembered (a tap that carries its own
    time is the more burdensome alternative, and would reverse 97's answer
    on the boil memory). After the pull the slider only previews: the yolk
    asked for was not a mistake, so it is not corrected (this narrows 96
    for that one setting). The aimed-for egg is the egg at the end of the
    cooling, the egg as eaten, not at the yolk's peak, where a jammy yolk
    (0.41) reads 0.34 (97's aimed-for egg, answered again on what was
    measured). The review's other findings are fixes, not choices.
    7 October 2026.
99. **The boil time says no certainty of its own, and the time's two
    lines sit closer** (the owner, 9 October 2026, on the one screen: "I
    don't think we need a certainty word in the boil time estimate as well
    as the certainty word"; "the learning about both is correlated"; two
    lines, closer: "yes"). Under the time, the boil line says only "about
    8:00 to boil", whether the time to boil is a guess or remembered (it
    was "…, my guess" and "…, from what I've timed before"); the
    certainty word below speaks for both. The two lines stay separate, so
    the word is not read as the boil time's and its press target does not
    move when the line wraps (1750, large text), but the space under the
    digits and between the lines is tightened, in both apps.
100. **An older build leaves a newer one's stores alone.** Superseded by
    136.
101. **The alarm's sound is chosen in Settings: the wind-up timer, the
    cuckoo clock or the hen** ("I like the recorded hens, the cuckoo clock
    and the wind-up timer. Let's give the user a selector to choose from
    the 3 on the settings page"; the default, "Wind-up timer"). Chosen from eight sounds made in the browser and heard on an
    auditions page, and two CC0 recordings the owner found on Freesound:
    the hen's egg song (Jofae) when the eggs have cooled, and her alarm
    call (Rudmer Rotteveel) at the pull; credited in the (i), though CC0
    asks for none. The beeps are retired, kept only as the web's alarm
    while the hen's recordings have not loaded. One implementation of the
    sounds (`src/ui/alarmSounds.ts`), which the web plays and `npm run
    sounds` renders into the files iOS ships, rather than a Swift copy of
    each synth made on the phone; so an iOS notification now rings in the
    cook's sound for up to 30 s, not iOS's short default. Each is as loud
    as the beeps were at the same moment. 9 October 2026.
102. **0.4 does not ship; 0.5 is the next release, and `0.4.x` retires.**
    Superseded by 120.
103. **The English of 1750 may lag the English.** Superseded by 116.
104. **`PLAN.md` is updated at merge, by the session that merges**, not in
    each working commit (confirmed): it was touched by a
    quarter of all commits and was the commonest merge conflict across
    worktrees. A CLAUDE.md change.
105. **Comments say what the code does and why** (confirmed). A decision number appears in a comment only where the code
    would otherwise look wrong (z ≈ 4.65 K), never as a changelog.
106. **The copy drafts give way to a review page** (confirmed: "Yes,
    including CLAUDE.md"; amended 16 and 20 October 2026: of reading it on a
    phone, "I never said that"). What the owner approved
    is recorded as one commit (135); every key changed, added or retired
    since it is generated, never typed, and laid out as one page (`copy:review`), read
    wherever the owner likes, while the words are still judged in place in
    the apps (25); `copy:approve` records the new commit.
    `tools/drafts/` and the draft proofs go; the no-literals lint and the
    small surfaces' budgets stay. 9 October 2026.
107. **No back-compat until the app is widely deployed, the results log
    included** (the owner, 29 September 2026: "actual widespread deployment
    is what makes storage formats permanent; I will tell you when that
    happens"; 9 October 2026, of the log: "The data is not so important
    that we should be excessively complicated in order to maintain it", and
    "yeah, let's be simple"). The owner says when the app is widely
    deployed. Until then a public site with no users to speak of is free to
    change a storage format: bump its key so an old value is dropped, and
    write no migration. The push of 46 did not make the formats permanent.
    The results log is ordinary data under this rule. 0.5 writes it under a
    new key (`calibration.v5` on iOS, `aet.calibration.v5` on the web)
    holding only today's record shape, and never reads 0.3's `v4`; a cook on
    0.3 starts learning again from the population prior, once. A store or
    cook that cannot be read is dropped, and the boot sweep deletes `v4`
    with the rest ("Yes, sweep v4 too"). On iOS the stores are in a suite
    of their own (17 October 2026), which the sweep clears of every key the
    table does not list; what 0.5 and earlier kept in the standard domain,
    `v4` among it, is left there unread, but sharing's two keys and the
    learning log (`calibration.v5`), carried into the suite once at launch
    so that what was sent stays deletable and the cook's learning survives
    the upgrade (the owner, 19 October 2026). What stays: "Export
    my results", in Settings under What I've learned, which saves the store
    to a file as data, by each app's own JSON encoder, a damaged store as
    its text (a download on the web, the share sheet on iOS, nothing sent); `npm run eggs -- import`, which reads the owner's
    files back for the fit, older ones included; replaying the posterior
    whenever the model it was folded under (`MODEL_ID`, kept beside it) is
    not this build's. A cook too old to
    pick back up that finished unanswered is logged as unanswered, and on
    iOS a second answer after a relaunch is kept when the egg is the last
    in the log and not yet shared. Export from a current build before
    installing 0.5 to keep your own eggs.
108. **The start time leaves the setup sentence; it stays correctable in
    the start's panel** (the owner, 9 October 2026, of "set in cold water
    at 19:42": "I think it wastes screen real estate with useless
    information that is already conveyed by the relative countdown
    timer"; of keeping the correction in the panel: "Sounds perfect").
    The sentence says "into cold water, brought to the boil" before and
    during a cook; pressing the start clause opens its panel, where "Eggs
    in at 19:42" with − and + still corrects the start (97's start-time
    correction, moved). The four "…at {time}" start clauses go.
109. **Numbers agree in distribution, not in bits** (the owner, 7 October
    2026: "we almost never care about bitwise accuracy for posterior
    sampling, just stochastic indistinguishability"; 10 October 2026, of
    holding the fixtures to 1e-13 on x86 and arm64 Linux: scope creep,
    "an excessively broad selection of platforms to test relatively simple
    functionality on"). The fixtures, and the Swift twin against them, are
    held to 1e-12, relative above 1 and absolute below (`conformanceTolerance`,
    `tools/fixtureCompare.ts`): a real change moves a number far past it.
    Last-bit drift between processors, libms or the two languages is not a
    finding, not a reason to tighten a check or test another platform, and
    not a question for the owner; where its cause is understood, loosen and
    say so in the commit. The filter is tested as a distribution
    (`record.test.ts`, `npm run sbc`), never by matching draws.
110. **0.5 is released: `main` is the 0.5 line, and 0.3 a historical
    branch.** Superseded by 120.
111. **"Boil" is never a noun for cooking; "a full rolling boil" is the
    state of the water** (the owner, 5 October 2026: "the boil", "a full
    boil", "the rolling boil", "boil times" and "signal the boil" sound
    medical; 10 October 2026, reading the review queue: "'A full rolling
    boil' is an acceptable description of the state of the pan. 'boil' is
    not acceptable as a metonym for cooking an egg"). Out: "the boil",
    "boil times", "signal the boil". In: "boiling"; "boil" the verb ("water
    boils at", "how long your water takes to boil", "once it's boiling");
    "brought to the boil" and "to the boil", which sound like cooking; and
    "a full rolling boil" for the water. Text that names the button keeps
    its name exactly (112); its 1750 name, "It boils in earnest", is
    already a verb. The setting "After the boil" is **"Once it's boiling"**
    ("Once it boils" in 1750). This holds in every English, en-US and 1750
    included, and on the privacy page; code identifiers and keys
    (`controls.afterTheBoil`) stay. In the same reading, the English of 1750
    says "ice chest" for "fridge", and the owner rewrote `help.odds.p1`,
    `help.odds.aside` and `help.learn.aside` ("the yolk you got" read
    oddly).
112. **The button says "Rolling boil"** (the owner, 12 October 2026: "we
    could abbreviate 'Full rolling boil' to 'Rolling boil' on the button
    text to save some space and lose very little information"; "yes, go
    ahead"). With the action under the time, the button shares a row with
    Cancel (125), and the hint directly above it, "wait for the whole surface to
    roll", now carries what "Full" was for: a press at first bubbles
    under-measures the time to boil by 15-25%. Every string that names the
    button follows it; the water's state is still "a full rolling boil"
    (111); the 1750 button stays "It boils in earnest". Amends CLAUDE.md's
    "Words", which names the button.
113. **The action sits under the time, in one row.** Superseded by 125.
114. **The bracket marks the most likely word's band, not a point** (the
    owner, 12 October 2026: "yes this seems good"). The mark at the most
    likely word's anchor sat away from the thumb at about a third of the
    slider's positions though the word was the one asked, because anchors
    are points and the thumb moves freely; the band holds the thumb
    whenever the most likely word is the one asked, and sits beside it,
    honestly, when it is not. Core's `wordBandLow`/`wordBandHigh`; no core
    change.
115. **A bowl of still water is a fourth cooling** (the owner, 12 October
    2026, from his brother's request; "We should ship the feature then I'll
    gather it in my own beta testing"). The eggs go into a bowl and are
    left; the bowl warms by exactly the heat they give up, and the egg's
    surface follows it, blended over `TAU_PLUNGE`, as the ice bath and
    running water are held (README section 2.4, `studies/bowl.ts`): once
    volume, count and water temperature are given, about -2 to +6 s at
    jammy, surer than the air and about as sure as running water. The
    bowl's volume is asked (2 L by default); the water's temperature is
    optional, the room's by default, and so is running water's, 15 °C by
    default ("optional with default"). No warning for a crowded bowl ("low
    leverage"). The cooling choices are a list, fastest first. The egg
    count moves into the setup sentence and the egg's panel. The room is
    shown without the probe (79 says so now), in the panels where it changes
    the answer (143), on the two tests the owner set: its
    leverage (-4.8 s a degree for eggs left out, about a size class across
    a kitchen's range) and a natural place. Whether ice and running water should take free convection
    in place of a held surface waits on the owner's probe readings.
116. **The 1750 twin lags by default** (the owner, 9 October 2026, and 14
    October 2026 on the adversarial review; amended 16 October 2026). An
    English change does not rewrite its 1750 twin; the twins are rewritten
    in batches, and a twin is never a transform of the English. A missing
    key falls back to the English (`src/core/copy.ts`), so a twin identical
    to its English is deleted. A twin written against older English is
    still shown, never a failed build, and no tool lists it:
    `git log -- copy/en-x-1750.json` shows the twins' age. Czech (F5) gets
    the same rule.
    CLAUDE.md's wording steps follow it.
117. **`LOGBOOK.md` is deleted; its history is in git** (the owner, 14
    October 2026, on the same review; amended 16 October 2026). The commit
    messages are the log (`git log`). A comment that rests on a measured
    number states the number.
118. **The iOS e2e shrinks to the checks only a device can make** (the
    owner, 14 October 2026, on the same review). The logic scenarios
    `npm run ios:e2e` drives through the simulator move into
    `EggTimerAppTests`, under `swift test`; the e2e keeps what needs the
    app on a device.
119. **Closed documents are deleted, not kept** (the owner, 14 October
    2026, answering the adversarial review). The archive, the ship lists,
    the collection design and the one-screen design go; git keeps them. A
    document's live facts move first: to `PLAN.md` if someone waits on
    them, otherwise to the code, `INFERENCE.md` or `README.md`.
120. **No branch per version line** (the owner, 14 October 2026, on the
    same review). Work happens on short-lived branches off `main`, named for
    what they do. A release is a tagged commit on `main`, which is what
    Netlify serves. The old line branches stay as history: `0.3.x` keeps
    0.3 at `v0.3.4-alpha.1`; `0.4.x` never shipped, since 0.5 forked from it
    before it did and every fix was built twice (9 October 2026); `0.5.x`
    became `main` when 0.5 was released (10 October 2026). In effect from
    the commit that records it, which amends CLAUDE.md.
121. **The full gate runs at merge.** Superseded by 123.
122. **The catalogue's notes live beside it, not in it** (the owner, 14
    October 2026, on the same review). A message's `note`, `surface` and
    `example` move to a sidecar the apps never load, and its `apps` is
    derived from the sources, not typed. The catalogues keep only what the
    renderers read.
123. **The gate is what the change touched** (the owner, 14 October 2026,
    on the same review, and of the reruns of every suite at the smallest
    change: "tanking our velocity"). A branch commit runs `npm test` and the
    checks for what it touches. Before a merge: nothing for documents and
    comments alone; `npm test` for tests and tools; `fixtures:check`, and
    `swift test` where the Swift twin moves, for core and the fixture
    generators; `npm run e2e` for the web's screens and for a key or its
    arguments in `copy/`; `ios:build` and `ios:e2e` for the iOS app. Other
    wording (135) needs `npm test` and `fixtures:check`, which a save from
    `npm run copy:edit` runs itself in a scratch worktree of the commit it
    makes, in about half a minute. Any push runs the full gate
    in CI, and `npm run verify` runs before a release. The full `verify`
    runs before any merge that touched code. Each slow suite runs once, on
    the branch's final code; a later commit to documents alone needs no
    rerun. The reviewer reruns `verify` and its own checks, and takes the
    e2e suites from the agent's run or CI's. In effect from the commit that
    records it. Amended 20 October 2026, the owner choosing "Words-only
    check" for the editor's save, and amended again on 21 October, with the
    fixtures made small: a save runs `npm test` and `fixtures:check` whole,
    the words-only check goes, and the full gate still runs in `verify` and
    CI before anything deploys.
124. **Never push what deploys without the owner** (the owner, 14 October
    2026: "my intent was 'never push to the main public-facing deploy site
    without my approval'", which had become "never push"). Pushing `main`,
    or a release tag, deploys and is the owner's call. An agent may push
    its own branch, so that CI runs the slow suites there; CI's run on the
    branch's final code counts as that suite's gate. This holds while
    Netlify deploys only `main`. In effect from the commit that records it.
125. **The action sits under the time, in one row, sized alike in both
    apps** (the owner, 12 October 2026, from 0.5 on his phone: the button
    "should be directly below the timer, and all other settings below
    that"; of the room first kept for Cancel, "the space might otherwise
    signal to the user that there is nothing below there to scroll to";
    "rework it as one row"; 14 October 2026: "yes, make the web match
    iOS"). In every phase and both apps the order is the time, the hint,
    the action, the doneness slider, the setup sentence. The action is one
    row: Cancel, or a phase's second button, small on the left, the main
    button filling the rest; one button alone fills the row. The row is one
    button high in every phase, so nothing below it moves and nothing is
    left empty. It stacks, with the room of both, only where it cannot fit:
    at the largest iOS text sizes, or on a narrow web page. Whether it
    stacks is decided on the start's action, Rolling boil, Start again and
    the chosen cooling's pull, not on every pull. On GitHub's Linux fonts an
    ice-bath cook stays one row at 390 px; with Apple's fonts the ice bath
    and the air fit one row at 320 px. A change of cooling, at idle or as a
    correction mid-cook (96), may restack the row, in both apps.
126. **App plumbing leaves `src/core/`** (the owner, 14 October 2026, on
    the adversarial review). Core keeps what both apps must agree on: the
    physics, the inference and the decisions; the record's wire schema
    (`parseRecord`), which the server ingests from both; the cook's `step`
    machine; which words say what (`wording.ts`); the alarms' timing, which
    the iOS sounds are rendered from; and the server's contract for
    sharing (`isUid`, `shareReply`, `deletionDone`, and that a seq is never
    reused under one id). What only stores, reads back or merges - the
    settings, the stored cook, the share queue, the table of stores,
    another tab's copy of a cook - is each app's own: the web's in
    `src/ui`, tested by `test/*.test.ts`; iOS's in
    `EggTimerApp`, tested by `EggTimerAppTests`. It is no longer ported to
    Swift or fixtured. The cooks an app holds are core's (`cooks.ts`,
    `Cooks.swift`, held by `fixtures/cooks.json`): the one on screen and
    those ended waiting on their records, whose cook each effect is, and
    which eggs are still open; storing them, stepping them and carrying out
    their effects stay each app's. Amended 21 October 2026 (153).
127. **The compilers check the catalogue's keys** (the owner, 14 October
    2026, on the adversarial review: generate the key type from the
    catalogue). `npm run copy:keys` writes, from `copy/en.json`, the
    TypeScript `CopyKey` with each key's argument names
    (`src/core/copyKeys.ts`) and Swift's `enum CopyKey: String`
    (`EggTimerCopy/CopyKeys.swift`), each case spelled as its key. Both are
    committed, since Xcode and SwiftPM run no node, and `copy:keys --check`
    holds them to the catalogue in verify and CI. A key the catalogue lacks
    fails `tsc` or `swift build`, and so does a `t()` call with a missing or
    extra argument; Swift's `tr()` checks argument names in a debug build.
128. **One tab owns the web app** (the owner, 14 October 2026, on the
    adversarial review; "let's KISS", 15 October). It replaces each tab
    running the cook it started (the owner, 7 October 2026). The
    first tab runs the app under an exclusive Web Lock; any other tab says
    the app is open in another tab, with a button that moves the app, its
    cook and alarm, to it, and writes and sounds nothing until pressed. Given up:
    two cooks at once in two tabs, two pans started at different times.
    Every tab shares one storage, so independent tabs needed the cross-tab
    merges, which go; keeping them apart would have meant a store per tab
    for the cook beside a shared one for the learning. Without Web Locks
    (an insecure context) every tab runs as before. A new build no longer
    waits for the site's one window: a
    waiting tab reloads into it.
129. **esbuild bundles the site; Node runs the TypeScript** (the owner, 14
    October 2026, on the adversarial review). The site is built by esbuild,
    a dev dependency, into a few content-hashed files; the tests and tools
    run from their `.ts` sources, Node stripping the types, and `tsc` only
    type-checks. `tools/build.mjs` and `dist/` go. Core still has no runtime
    dependency (`CLAUDE.md` invariant 1).

Decided by the owner, 16 October 2026, on the adversarial review of 15
October:

130. **`PLAN.md` holds only the next work, the owner's open decisions and one
    QA list.** Each item of next work says the action to take. An open
    decision is one that waits on the owner's choice; work an agent can do is
    next work. Its prose carries no dates and no version numbers. Facts that
    are not work move to their homes: the model to `README.md`, building and
    deploying to `DEVELOPING.md`, the rules and the map of the documents to
    `CLAUDE.md`.
131. **`DECISIONS.md` carries no commit hashes or branch names, and states
    each superseded chain as its current rule.** A decision keeps its date.
    A replaced decision shrinks to its title and "Superseded by N", and the
    latest in its chain states the whole rule; numbers are never reused,
    since code cites them. Decisions are numbered only when merged to
    `main`: on a branch a new decision is written as `DECISIONS.md NNN`, and
    the session that merges gives it the next number and fixes its
    citations.
132. **CI runs once per commit, and the web e2e in shards.** A newer push
    to a branch cancels its older run; on `main` the newer waits. A release
    tag's own run checks only that it names `package.json`'s version and
    that its commit is on `main`, whose run is the tag's. A pull request
    runs the gate only from a fork. The web e2e runs in four parallel jobs
    (`tools/e2e/shards.ts`); `npm run e2e` still runs every scenario.
133. **The population fit's inference is checked three ways.** Its
    likelihood is the core's, at fixed points, on a sample `npm run
    fixtures` writes. In CI, NUTS recovers a simulated population with a
    known truth, one of them in the prior's tail: the identified globals'
    posteriors narrow to under half the prior's spread, so a fit that lost
    its data fails; the nine globals' truth together is no further from the
    posterior, by its Mahalanobis distance on the spreads' log scale
    referred to the draws' own, than a calibrated fit puts it nine times in
    ten, one test in place of a Bonferroni interval each (the owner, 16
    October 2026: "more modern than that");
    R-hat below 1.01, a bulk ESS of 100 a chain, no divergent transition.
    By hand, simulation-based calibration (`python -m eggfit sbc`): the
    nine globals' ranks and the data's log likelihood's, one verdict over
    the ten by their ECDF bands and Simes. It runs every repetition and
    never stops early (the owner, 17 October 2026): early stopping was
    asked for when a run took an hour and a half, and a run of minutes
    would save almost nothing by it. A fit
    whose diagnostics fail is written nowhere unless forced; the published
    `fixtures/population.json` carries its diagnostics, a forced one is
    named by its id, and both cores refuse a file that does not vouch for
    itself (`fit/README.md`).
134. **No live file cites `LOGBOOK.md`.** Folded into 117.
135. **Changing a word costs what changing a line of code costs**
    (amended 16 October 2026). The owner's approval is one recorded commit
    (`test/data/copy-approved.txt`), and the review page is the catalogue's
    diff since it. The 1750 twin's hash sidecar goes, and no tool tracks a
    stale twin (116). No literal in Swift's text calls is words, held with
    no allow-list of literals by the `Words` type, which only `tr` makes,
    and `npm run ios:build`, which refuses one in SwiftUI's own calls; no
    tool reads a literal made a `String` around them. Amended 21 October
    2026 (the owner: "yes, delete copy:literals"). `npm test` makes the key
    types. Only small surfaces keep a length budget. Help's sources are a
    data file both apps read, not words. A wording change that adds no key and
    changes no arguments needs `npm test` and `fixtures:check`, not the web
    e2e (123).
136. **No newer-build guard, in either app**; supersedes 100. With one tab
    owning the web app (128), an older build meets a newer one's stores only
    after a rollback or a downgrade, the loss a format bump already accepts
    (107). The old marks are keys no store lists: the web's boot sweep
    deletes them, and on iOS they are left unread in the standard domain. The
    web's development clock no longer marks the stores either: it runs only
    on this machine, whose `/api` is the development server's.
137. **The correction in hand stays in each app.** Superseded by 139.
138. **The Swift core's constants are made from the TypeScript, and its
    conformance compares whole values.** `npm run swift:constants` (run by
    `npm test`, checked by verify) writes `Constants.generated.swift` from
    `src/core/`; no fixture carries a constant and no test compares one.
    The Swift results are Codable with the TypeScript's field names and are
    compared whole with the fixtures, to 1e-12 (109). No fixture pins a
    cache key's bits: each app's key is tested in its own suite.
139. **The correction in hand moves into core, its groups and moments with
    it** (the owner, 16 October 2026, on the review of the cycle: "let's make
    this sane"). Supersedes 137, and narrows 126: each app still reads its
    own gestures and lifecycle, but the rules are core's. A reducer beside
    `step` takes a change to a setting's group, a finger down and up, the
    page or app left, a move to another control, and the settle, hold and
    preview timers firing, each with its time. It returns the next state,
    what to commit, and the timers to set or cancel. Core names the groups
    (the settings' `FIELDS`), which touches count as another control, and
    which moments count as leaving; each app maps its events onto those and
    runs the timers. It is `src/core/hand.ts`, fixtured as event sequences
    (`fixtures/hand.json`) and held in Swift by conformance (`Hand.swift`);
    the web maps its gestures in `src/ui/edit.ts`, iOS in `InHand.swift`.
    Leaving is the last word an app is sure to have before it may be
    stopped: the web's page hidden or gone, iOS's scene no longer active.

Decided by the owner, 18 October 2026:

140. **A fifth cooling: eaten warm, in an egg cup.** The egg rests whole on
    the counter, as `counter` does, until it is opened a fixed time after the
    pull, when its doses stop; `counter` stays the egg left whole until cool.
    Soft is in reach of a cook who eats the egg warm, as it is not on the
    counter. The opening time is a constant of the model until a probe
    reading says otherwise.

Decided by the owner, 19 October 2026:

141. **The egg cup counts down to its opening**, as a cooling counts down to
    its end. From the pull the apps count to `EGG_CUP_OPENED_S` after it,
    ring there, and come to Done; the record's `cooled_s` is the time
    counted. The counter stays as it is: Done at the pull, nothing counted.
    The physics' question, whether the egg rests in the air, is
    `restsInAir`; whether the cook waits for an end is `countsDown`.
142. **0.6 requires iOS 26, and its alarms are AlarmKit's** (the owner, 19
    October 2026: "this is a toy app and we prioritise low maintenance
    burden"). AlarmKit schedules an alarm as the Clock app does, through
    silent mode and any Focus, with a full-screen alert. With iOS 26 the
    floor there is no fallback: the time-sensitive notifications and what
    keeps them go. Until 0.6 the alarms stay time-sensitive notifications,
    which reach the cook through a Focus only where its Time Sensitive
    Notifications are allowed.

Decided by the owner, 20 October 2026:

143. **What changes from one cook to the next is set in the sentence;
    Settings holds what changes rarely.** The owner, 20 October 2026: "things that
    are likely to change rarely (language, measurement system, altitude)
    should be in settings, but things that should change per cook should be
    accessed by tapping the relevant parameter in the sentence describing
    the cooking process", and of the heat after the boil, "That feels like
    a cooking method to me not a setting." Settings keeps the units, the
    language, the alarm's sound, the altitude, the probe, what I've learned
    and sharing; while a cook runs only the altitude there corrects it, as
    the sentence's rows do. The heat after the boil goes into the start's
    panel, under the three starts, whose clause already says "heat off and
    lid on", so there is still no fifth clause. The water in the pan goes
    under it, shown for every pan start: with the heat kept on it is a few
    seconds (a litre against two, 3.5 s at two eggs and 7 s at six), and
    it is the volume the time to boil is remembered under. The room leaves
    Settings and is shown only in the panels where it changes the answer,
    one value in one store, each row editing it: beside "at room
    temperature" (an egg left out, 4.8 s a degree), under the heat off,
    lid on (the pan cools toward it: half a second a degree on a cold
    start, whose pan starts at the tap (144), 12 s on a boiling one), and under the air (the egg cools toward it). Not under
    a bowl, whose water's temperature is asked there itself and assumed at
    the room, so a room row beside it would ask the same thing less
    directly and do nothing once the water's is given; not under an egg
    cup, opened too soon for the room to move the yolk by a tenth of a
    second; not under a cold start kept boiling, where the room changes
    nothing, since the pan starts at the cold tap's temperature (144). The
    room feeds every path 79 lists. No store, key or correction group
    changes: a correction's group is the choice it makes, wherever its
    control sits (139).
144. **A cold pan starts at the cold tap's temperature, one number with
    running water's.** The owner, 20 October 2026: "so we could add a row
    for this near the room temperature? approved". A cold pan is filled
    from the cold tap, which is usually colder than the room, so its ramp
    starts at the tap's temperature, not the room's, and a kitchen at 25 °C
    no longer makes a cold start's answer worse. It is the one number
    running water's temperature already was (`tapWater_C`): its row is in
    the start's panel under Cold water, after the water, and under running
    water in the cooling's, each editing it and each correcting a running
    cook through its group (139). Left blank, it is 15 °C, mains water's
    (`T_COLD_TAP_C`), as for running water; so every untouched cold start
    lengthens, by about 10 s kept boiling and 13 s with the heat off on the
    default pot (68 g, 2 L, an eight-minute boil, jammy), 6 to 17 s across
    four- to twelve-minute boils. With the heat off the pan still cools
    toward the room. The record carries it as `setup.panStart_C`, written
    on every cold start whether given or assumed and refused on a hot one,
    so no record leans on the default; a record without it replays as it
    was cooked, with the pan at its own `ambient_C`, and `v: 1` stands.
    `MODEL_ID` moves to `2026-10-e11`; `LIKELIHOOD_ID` does not, since no
    stored log replays differently. The learned time to boil is untouched:
    what a kitchen's tap usually is is already in its seconds, and the
    boil's press replaces the forecast. The sentence's start clause does not
    name the temperature. The web, and with it the server, deploys with or
    before the iOS build that writes the field: a server from before it
    keeps a record without it, and that egg would replay with its pan at the
    room.
145. **iOS says nothing of a set alarm** (the owner: "alarm set for
    18:55:33" — "we should drop this. no timer tells us the clock time
    too"). The time counting down is the alarm. "setting the alarm…",
    which only flashed before the answer, goes with it. A line shows above
    Cancel only when there is no alarm: notifications off, or one not set,
    with what to do. The hint holds room for that line only on a cook that
    shows it.
146. **On a phone, the panels under the sentence come into view.** iOS
    keeps the web's spacing around the time at a phone's width, so what is
    under the sentence sits as high as there; opening a clause by a tap
    scrolls just far enough to show its panel, in both apps (the owner's
    choice, "Scroll into view"). The room the hint and the certainty line
    hold stays, so nothing jumps (the owner: "Keep both").
147. **A developer tool may take a dependency, and the owner's tools are
    desktop tools.** "We can use external libraries under limited
    circumstances, e.g. when it is a net maintenance burden reduction, and
    especially for developer backend tools." Core keeps its zero
    dependencies (`CLAUDE.md`, core's invariant 1). A tool the owner works
    in, such as `npm run copy:edit`, is laid out for his desk, a large
    screen and a keyboard, and served on this machine only: "Why would I
    want to edit strings on an iPhone UI when I have a great 30″ monitor
    and keyboard on my desk".
148. **The core stays twinned in Swift, by hand.** Running part of it from
    the TypeScript under JavaScriptCore was weighed and declined (the
    owner, 20 October 2026: "I tend to 'no' because it works fine now").
    What can be derived is derived (the enums, the decision cache's key,
    the constants), so less of the twin is written by hand.
149. **App Attest stays.** The owner, 20 October 2026: "yes, this is how we
    scale big". The attested tier is what lets shared eggs from strangers
    count in the fit (85).
150. **The 1750 English stays, and the languages become generic before a
    third.** The owner, 20 October 2026: "it is hilarious and great";
    "we will add other langauges"; "we shoudl make the tranlsation infra
    generic". One table of languages drives both apps' pickers and what
    they store; every catalogue in `copy/` is checked by the same tests;
    only what is 1750's own (Imperial into 1750, a cook recorded in it,
    77) is tested as 1750's.
151. **The copy capture goes, and a lint that the web's code writes no
    words of its own replaces it.** The owner, 20 October 2026:
    "approved", to deleting `copy:snapshot` and its scenarios: they
    captured from the screen strings the catalogue already holds, and
    which key each state shows is core's and fixtured. A few states whose
    check is their own stay as ordinary e2e scenarios.
152. **On iOS, VoiceOver reads the sentence's clauses as links where they
    are drawn, and again as buttons.** The owner, 21 October 2026, choosing
    "Links and buttons": the sentence's accessibility leads with the
    styled text, so each clause is a link at its own place, which is where
    XCUITest taps it; the clause buttons keep their "Egg: 68 g, change"
    labels and their open or closed value. Nothing drawn changes.
153. **The cooks an app holds go to core; the share queue stays each
    app's.** The owner, 21 October 2026, choosing "the ending-cook queue
    into core and the share queue staying put": each app's own queue of
    cooks ending and still open had drifted three ways (iOS could write an
    ending cook over a newer cook's stored copy and lose it on relaunch; an
    answer or correction to an egg already too old was taken; the web's
    sharing missed an ending cook's egg), so it is core's, fixtured, and
    126 says so. The share queue's moves agreed in both apps and stay each
    app's, with their stored forms.
154. **No unprompted style passes.** Approved by the owner on 20 October
    2026 with the cleanup tranche, whose line was: an agent rewrites no
    comment, test name or assertion message that it has no other reason to
    touch. `CLAUDE.md` says so under "Working here".
