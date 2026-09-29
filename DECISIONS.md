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
    `1f6f00b`.
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
