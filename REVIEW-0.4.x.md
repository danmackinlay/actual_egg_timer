# Code review: 0.4.x against main (2026-10-05)

Six reviewers covered the branch in parallel: the sharing server's security,
privacy claims against the code, data safety, the decision logic, iOS–web
parity, and bloat and factoring. Nothing was edited. Items marked ✔ were
checked against the code (or run) by the reviewing session itself; the rest
are the reviewers' findings, with line references, not re-traced.

The structure is mostly sound and the App Attest checks hold up. The serious
problems are in the write paths: several tabs, version skew, and an ID that
is also the password.

## Fix before 0.4 ships

1. DONE fcd622e: **✔ A second web tab silently deletes eggs and undoes privacy actions.**
   Neither `src/ui/calibration.ts:517` nor `share.ts` `save()` re-reads
   storage before writing; each writes back whatever that tab loaded at boot.
   Nothing listens for `storage` events. Two consequences:
   - A tab left open since yesterday overwrites an egg answered in another tab.
   - A stale tab still has sharing on, so it POSTs again under an ID another
     tab just deleted, and wipes the pending-delete list. That breaks the
     privacy page's "turn it off and nothing more is sent" and "keeps asking
     until the server confirms".
   - Fix: re-read and merge before each write, and add a `storage` listener;
     `navigator.locks` around the read-modify-write would make it airtight.
2. DONE 70ea0d3 (both apps keep each record's stored JSON and lay what they know over it; the rollback warning is in `ios/RELEASING.md`): **✔ An old 0.3 build damages a 0.4 store.** Both branches use the same key,
   `aet.calibration.v4`. 0.3's `parseRecord` returns "exactly the known
   fields" (`src/core/record.ts:335`), so on its first save 0.3 rewrites every
   record without `model` or `forecast`, contradicting the record's own
   "fields may be ADDED within v1" promise. 0.3 also has no keep-aside, so a
   record it can't parse costs the whole log. 0.4 does the same to anything
   later versions add.
   - Fix: keep each record's raw JSON and write that back.
   - 0.3 can't be patched, so a rollback (Netlify, or an old TestFlight
     build) is unsafe once 0.4 has written; that belongs in
     `ios/RELEASING.md`.
3. DONE dd4aeeb: **✔ Anyone with a cook's ID can bury their attested results**
   (`server/eggs.ts:180-183`). An open copy at `(uid, seq)` blocks the
   attested one, and DECISIONS 85 gives open results zero weight. The ID is
   shown on screen and cooks are asked to email it.
   - Fix: an attested record always wins; write it and delete the open one.
4. DONE f11ddf6 (only an imported results file's lines, or a pulled egg whose twin in the file is, are trusted; ANSWERED: DECISIONS 82 amended to match. Was OWNER: `DECISIONS.md` 82 says an egg under a listed ID counts in full whatever tier it came in, and now that holds only for your own results file: amend 82, or decide otherwise?): **✔ The owner's trusted list trusts the ID, not the record**
   (`tools/eggsImport.ts:68-79`). Anyone who learns one of your IDs can post
   open records that get full weight in the fit. Trust only lines from your
   own export file.
5. DONE a4a5cf1: **iOS sends a whole backlog unsigned after a brief attestation failure**
   (`ios/App/Sharing.swift:238-242, 296-301`). `attestedFor` is set even when
   attestation failed for a passing reason (offline, 429, Apple unavailable),
   and `assertion()` swallows errors with `try?`. Finding 3 then keeps those
   eggs open for good.
   - Fix: while attestation is still pending, stop the run and retry later.
6. DONE 1584d4e: **✔ iOS can show the low-odds warning on the last good level.**
   `ios/App/YolkSlider.swift:73` computes `k*0.01`, which is one ulp above
   `k/100` for k = 35, 41, 47, 57, 69, 70, 82, 83, 94, 95. `lowOddsAt`
   compares strictly, so a thumb dragged onto `hardest` warns. The off-grid
   value is saved, so the warning comes back after relaunch, and no fixture
   covers it because the web never produces these values.
   - Fix: `(v*100).rounded()/100`, and give `lowOddsAt` the `sameLevel` slack.

## Security, the rest

- ANSWERED DECISIONS 86 (the ID stays the only key; the risk recorded). Was OWNER: (a separate delete secret, kept on the device and never shown, means an emailed request can no longer be checked against anything but the ID, and a lost device can no longer delete; or keep the ID as the only key and record the risk in DECISIONS. Which?) **✔ Knowing the ID is enough to DELETE** (`server/eggs.ts:188`). Guessing
  isn't a risk (122 bits), but the ID is displayed and emailed. Either add a
  separate delete secret that is never shown, or record the risk in
  DECISIONS.
- DONE 0ab1eee: **✔ No content-type check.** A `text/plain` POST is a "simple" cross-origin
  request, so any web page can make its visitors' browsers post junk, getting
  round the per-address rate limit. Return 415 for anything that isn't JSON.
- DONE 0ab1eee (2 KB, and 64 characters a string; a record is about 750 bytes): **Storage and cost can be filled:** IDs cost nothing to make, and
  `appVersion`, `prior`, `model`, `lang` and `register` have no length cap, so
  a blob can be about 16 KB. Cap the stored JSON at about 2 KB and each string
  field.
- **Smaller ones:**
  - DONE 0ab1eee: A missing `Content-Length` lets the body be read whole before the size
    check (✔ `server/eggs.ts:106`).
  - DONE 0ab1eee: The attestation error text echoes Node/OpenSSL messages to the client.
  - ANSWERED DECISIONS 87 (accepted: a restored phone sends unverified). Was OWNER: (a4a5cf1 now gives up on the key explicitly, so the phone sends open rather than failing silently. To stay attested it needs either a new random ID when the key is lost, which splits one cook in two for the fit, or the server letting an ID take a second key, which lets anyone with a genuine iPhone and someone else's ID post attested results under it. Which, if either?) On iOS, a phone restored from backup loses its Secure Enclave key,
    swallows `invalidKey`, and is refused a new key (409), so it stays
    open-tier for good.
  - DONE 99d23a1 (a refused attestation more than a day old is made again with a new key, once per refusal): An attestation posted more than 3 days late fails against the leaf
    certificate's validity and is marked failed permanently.
  - DONE 71b2525: `tools/devServer.ts` listens on every interface and crashes on a bad `%`
    in a URL.
- **Needs checking in the Netlify dashboard, not the repo:**
  - DONE 0ab1eee for future deploys (a production deploy that Netlify says is not the published one opens its own store); ANSWERED DECISIONS 89 (the owner deletes them in the dashboard). Was OWNER: (the deploys already built between those commits run their own code: delete them in the dashboard?) Deploys built between commits `00186b1` and `2850f40` used the site-wide
    store. Their permalinks still run that code and can write to the live
    store. Delete those deploys, or open the live store only when
    `context.deploy.published` is true.
  - ANSWERED DECISIONS 89 (kept as is: `['ip','domain']` is the only grouping the free plan offers, and a deploy's own address no longer reaches the live store). Was OWNER: (Netlify's rate-limiting page lists only "per domain and IP" for every plan and "per domain" as Enterprise, though its Functions API reference allows `['ip']`; whether `['ip']` alone is accepted on this plan needs a deploy and a look at the deploy log. Try it?) `aggregateBy: ['ip','domain']` gives every permalink domain its own
    rate-limit bucket. Aggregate by `ip` only.
  - ANSWERED DECISIONS 89 (previews stay for this repository's branches; fork PRs off or approval-only, in the dashboard). Was OWNER: (dashboard) Whether deploy previews build for fork PRs, since the repo is public.
  - OWNER: (dashboard; the privacy page already says Netlify's request logs keep the address, the time and the path, which names the ID on a delete) What Netlify's own logs keep: they probably link IP and User-Agent to
    `/api/eggs/<uid>`.

## Privacy page against the code

Verified as written: off by default, nothing is sent on a fresh install in
either app, the field list matches the record one for one, and the server
keeps no address. These don't hold up:

- DONE a4cc834 (the summary now says every result that device or browser sent); ANSWERED DECISIONS 88 (no). Was OWNER: (should Settings list the older IDs in `uids` and `deleting`, so a cook can email for them too? That is a wording draft in both apps.) **"Deletes every result"** in the summary: it reaches only the IDs this
  device holds. Settings shows only the current ID, so a cook can't email for
  the older ones in `uids`/`deleting`.
- ANSWERED DECISIONS 85, amended (keep web sharing and its nudge; web results are collected as a measure of their own quality). Was OWNER: (ask web cooks to share at all while their results count for nothing, and nudge their time? Either the `share` wording changes in a draft, or web sharing and its nudge go until web results count.) **Web results are now zero-weight** (DECISIONS 85), yet web cooks are still
  asked to share "to learn faster" and still get the ±10 s nudge. Either the
  wording or the collection should change.
- DONE ca8f334 (a pull deletes `all.jsonl` and `emulated.json` beside it; `fit/README.md` says to emulate again): **"They leave my computer too":** `emulate` output and the documented
  `cat pulled imported > all.jsonl` keep `uid`, `day` and `seq` after a pull
  removes them.
- DONE a4a5cf1: **iOS can still send an attestation after sharing is turned off,** because
  there is no generation check after Apple returns
  (`ios/App/Sharing.swift:285-305`). A delete running alongside can also be
  undone by it writing the attest record back.
- **Small inaccuracies:**
  - DONE a4cc834: "sometimes moves the time": it moves 20 times in 21.
  - DONE a4cc834: The App Attest key goes when you delete, not "when its last result does".
  - DONE a4cc834 (it looks when the page comes back into view, at most once an hour, so "at most once an hour"): The hourly `HEAD sw.js` checks are a periodic contact the page doesn't
    mention.
  - DONE a4cc834: iPhone backups survive "delete the app".
  - DONE a4cc834: The page's list of what stays on the phone omits `sharing.attest.v1`.

## Decision logic

- DONE (reworded: DECISIONS 84 amended, the `reach.ts` and `Reach.swift` headers, INFERENCE §8). Was OWNER: (DECISIONS 84 says the time is monotone in the level. Make it so between points too, with a running maximum over the hundredths since the point below, at up to four more solves per slider move in both apps; or reword DECISIONS 84, the `reach.ts` header and INFERENCE §8 to "monotone at the profile points, and within about a second between them"? Not re-run here.) **The time is not strictly monotone between profile points.** The reviewer
  reproduced it: 0.61 → 716.1 s, then 0.62 → 715.2 s, falling at most about
  1 s. The header in `src/core/reach.ts:47-51` and INFERENCE §8 claim it is
  monotone. Either fix it (a running minimum per slider position) or correct
  the claim; test 12 covers only four cases.
- NOT A BUG (on the web, `recompute` runs `applyAnswer` before anything is drawn, which sets `settings.doneness` to the answer's level whenever it snapped, and `answerAt` answers at the level it was given otherwise, so on the idle screen, the only one `renderAdvice` prices, `settings.doneness` is `answer.level`; the ticket is made from the same): **The apps price the advice at different levels:** web at
  `settings.doneness` (`src/ui/app.ts:501`), iOS at `answer.level`. After a
  snap the web's ticket target can disagree with its own solution.
- NOT A BUG (deliberate: `Planner.Held` keeps the last shading for the second a new pot's surface takes, so a stepper tap does not blank it and bring it back; the web blanks instead. OWNER only if the two should match): **On iOS, after a pot change, the old pot's dots stay** under the thumb with
  no warning until the new profile arrives.
- **Checked by running and found sound:** the profile endpoints, empty and
  one-point profiles, warning against odds (no disagreements in 150 runs),
  fresh install, the nudge, the core invariants, and the Swift twin of
  reach/decide.

## Parity

- DONE 07d1a12 (checked in a browser): **Web "+" on an emptied field jumps to the minimum.** Clear the weight,
  press +, and the egg is 25 g, which counts as a measured egg. Only the probe
  and room fields have a `StepRule` (`src/ui/stepper.ts:56`). This rests on
  the HTML spec; it wasn't driven in a browser.
- DONE 86ce71d (checked on the simulator): **iOS "+" after a typed off-grid weight skips a step** (58.3 → 59.0, where
  the web goes to 58.5).
- DONE 6829df2: **iOS keeps the "You asked for" line** in the language and units from when
  the cook started.
- DONE 80150cb ("0.4.0+3"): **iOS records `appVersion` "0.4.0"** with no build number, so the fit can't
  tell builds apart.
- DONE 80150cb (checked on the simulator: a damaged store still deleted its pending ID): **iOS decodes `sharing.v1` all or nothing,** so a damaged store loses the
  pending deletions. The web salvages each readable ID.

## Bloat and factoring

The main problem: logic both apps must agree on sits outside core,
unfixtured and hand-twinned. Several of the bugs above came from that. Ranked
by payoff:

1. ANSWERED DECISIONS 90 (0.5 or later). Was OWNER: (not low-risk before 0.4 ships: moving the choice into core touches both apps' main solve path and needs new fixtures. After 0.4?) **✔ `decided()` is written twice:** `src/ui/app.ts:353` and
   `ios/App/Planner+Solve.swift:165`. DECISIONS 84 had to land as two
   commits, and the advice-level split above crept in here. Make it one core
   `decideAnswer(...)` and fixture it.
2. ANSWERED DECISIONS 90 (0.5 or later). Was OWNER: (after 0.4, as 1. The `pulledBy` against `outAt` difference is not a drift in behaviour: iOS sets `outAt` only at the cook's tap, so both record a measured pull exactly when the cook tapped after the start.) **Egg-record assembly** (`src/ui/calibration.ts:171-237` against
   `ios/App/Cook.swift:280-341`) is your training data, and is already
   drifting (`pulledBy` against `outAt`). Move it to a core `recordFor(facts)`.
3. ANSWERED DECISIONS 90 (0.5 or later). Was OWNER: (after 0.4, as 1; the decode difference is fixed in 80150cb.) **The sharing state machine** (`turnedOn`, `forgotten`, `deletionAsked`,
   `reconciled`, `advances`) is pure and has no fixtures, and the iOS decode
   difference above is the first drift. Move it to `src/core/share.ts`; the
   server can then share `isUid`.
4. ANSWERED DECISIONS 90 (0.5 or later). Was OWNER: (after 0.4, as 1.) **The decode decision** (fresh / rebuild / rebased / loaded) lives in each
   app, and the Swift copy has no tests.
5. ANSWERED DECISIONS 90 (0.5 or later). Was OWNER: (after 0.4; a split of `app.ts` and `calibration.ts` is not low-risk now.) **God files:**
   - `src/ui/app.ts` is 1483 lines with about 20 module-level `let`s.
   - `src/ui/calibration.ts` (933 lines) mixes `APP_VERSION`, record
     building, the storage format and the grid caches. iOS already splits the
     caches out as `DecisionGrids`.
6. ANSWERED DECISIONS 90 (0.5 or later). Was OWNER: (after 0.4: rewriting it without closures means new fixtures for the profile both apps ship.) **`oddsProfile`** (`src/core/reach.ts:189-292`) uses closures over mutable
   maps, which breaks core invariant 2. Its two bisections are copy-pasted.
7. **Smaller:**
   - ANSWERED DECISIONS 90 (0.5 or later). Was OWNER: (they are `results.json` and `results-quick.json`, a full run and a quick one, not one file twice: delete the quick one, or minify both?) `tools/shape-study/results*.json`: about 5.4k lines committed twice; keep
     one, minified.
   - ANSWERED DECISIONS 90 (0.5 or later). Was OWNER: (it passes, 7 tests, with `uv run --project fit pytest -q fit/tests`; adding it to CI puts uv, JAX and NumPyro in the workflow. Add it?) The `fit/` pytest suite runs nowhere, though the fit writes
     `fixtures/population.json`, which both apps ship.
   - ANSWERED DECISIONS 90 (0.5 or later). Was OWNER: (delete it, or keep it as the second host?) `vercel.json` hand-duplicates the CSP and isn't deployed.
   - ANSWERED DECISIONS 90 (0.5 or later). Was OWNER: (move them to LOGBOOK.md, or delete them?) `WORKLIST.md` and `FOLLOWUP.md` are closed records.
   - DONE eac10c9: `test/decide.test.ts` re-implements `answerAt`.
   - ANSWERED DECISIONS 90 (0.5 or later). Was OWNER: (`tools/copyDraft.ts` registers them, so they compile with everything else; build time only. Leave, or move finished drafts out of the build?) 43 drafts are compiled on every build.
   - ANSWERED DECISIONS 90 (0.5 or later). Was OWNER: (true: `npm test` starts with `rm -rf dist`. CLAUDE.md is yours to change; this session did not.) The CLAUDE.md advice "`rm -rf dist/test` first if a test file was
     deleted" is stale: `npm test` already runs `rm -rf dist`.
   - ANSWERED DECISIONS 90 (0.5 or later). Was OWNER: (not named in the review, so not traced here; for the factoring after 0.4?) A handful of exports are used only in their own file.

**Found fine:** the CBOR and DER parsing, the attestation checks, preview
stores kept separate from production's, no import cycles, every copy key
used, every tool reachable from a script or doc. The duplicated fonts are the
same face in each platform's format, so not duplication. The only uncommitted
change at review time, in the widget bundle, was a trailing blank line.

## Where to start

The two multi-tab fixes and the raw-JSON write-back: they're the ones that
lose a cook's data.

## Second pass (the owner's QA agent, 6 October 2026)

Verdicts on the first pass: 2, 3, 4, 6, the server hardening and the small
fixes hold; the two NOT A BUG calls hold; 1 and 5 hold only in part.

### Fix before 0.4 ships

- **Two builds in two tabs rewrite each other's store forever**
  (`src/ui/calibration.ts:591`). Taking up another tab's store writes back
  unless it decoded cleanly; a tab on an older `MODEL_ID` decodes the newer
  store as "rebuild" and writes its own, and the other answers in kind
  (reproduced: `m` alternating e9/e10, `folded` stuck at 0, `learn()` each
  round). The service worker keeps old windows on old builds, so any
  `MODEL_ID` bump with two tabs open triggers it. Fix: never write while
  taking up another tab's store; write only on this tab's own next change.
- DONE 37ab0be, 3ab60bf, 78d4e36 (both apps; wait on no answer, 408, 429 and 5xx, for five busy answers and three days, then skip the egg, or send open): **iOS waits forever on most errors** (`ios/App/Sharing.swift:351`): every
  reply but 200, 201, 400 or 409, and every signing error but a lost key,
  waits for the next run with no limit, so a 403/404/413/415 stops all iOS
  sharing silently, open results included. Fix: wait only on no reply, 429
  and 5xx; give up after an age or a number of runs.

### Next

- **A second answer can be dropped silently:** if the other tab learns from
  the egg first, `recordSecondAnswer` returns false and the cook is thanked
  anyway. Leave learning from an egg to the tab that logged it.
- **A logged egg can count twice:** records carry no ID or start time to
  dedupe on, and nothing listens for the cook-in-progress key. Give each
  record the start time as an ID (fixes this and the one above).
- **Boil memory and settings** are not covered: "Forget everything" is
  still undone by another tab's next measured boil.
- **The lock is held across a `fetch` with no timeout:** a stalled POST
  blocks deletions in every tab.
- **Rollback claim:** top-level store fields are still dropped by an older
  build, so `ios/RELEASING.md`'s "rolling 0.5 back to 0.4 is safe" says too
  much.

### The yolk words (DECISIONS 92)

- **Freeze the word cuts:** they are derived from `DONENESS_ANCHORS` at run
  time (`src/core/infer.ts:173`), so moving an anchor would rescore every
  stored word. Literals, with a test tying them to today's anchors.
- **The odds no cook answers for any more:** the odds and outcome wording
  describe "just right"; the word's band is about twice as wide, so the fit
  cannot check the shown odds against answers. OWNER.
- **Two buttons read "Runny" to a screen reader;** neither row is grouped
  with its question (`index.html:543`, iOS `FeedbackPanel`). `role="group"`
  with `aria-labelledby`; a container label on iOS.
- Smaller: iOS's five words may clip at the largest text sizes; the web
  leaves struck-through ticks in sous-vide; `-seedEggs` seeds only old-style
  answers; `tools/eggs.ts` re-implements the word probit it imports.
