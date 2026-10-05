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

1. **✔ A second web tab silently deletes eggs and undoes privacy actions.**
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
2. **✔ An old 0.3 build damages a 0.4 store.** Both branches use the same key,
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
3. **✔ Anyone with a cook's ID can bury their attested results**
   (`server/eggs.ts:180-183`). An open copy at `(uid, seq)` blocks the
   attested one, and DECISIONS 85 gives open results zero weight. The ID is
   shown on screen and cooks are asked to email it.
   - Fix: an attested record always wins; write it and delete the open one.
4. **✔ The owner's trusted list trusts the ID, not the record**
   (`tools/eggsImport.ts:68-79`). Anyone who learns one of your IDs can post
   open records that get full weight in the fit. Trust only lines from your
   own export file.
5. **iOS sends a whole backlog unsigned after a brief attestation failure**
   (`ios/App/Sharing.swift:238-242, 296-301`). `attestedFor` is set even when
   attestation failed for a passing reason (offline, 429, Apple unavailable),
   and `assertion()` swallows errors with `try?`. Finding 3 then keeps those
   eggs open for good.
   - Fix: while attestation is still pending, stop the run and retry later.
6. **✔ iOS can show the low-odds warning on the last good level.**
   `ios/App/YolkSlider.swift:73` computes `k*0.01`, which is one ulp above
   `k/100` for k = 35, 41, 47, 57, 69, 70, 82, 83, 94, 95. `lowOddsAt`
   compares strictly, so a thumb dragged onto `hardest` warns. The off-grid
   value is saved, so the warning comes back after relaunch, and no fixture
   covers it because the web never produces these values.
   - Fix: `(v*100).rounded()/100`, and give `lowOddsAt` the `sameLevel` slack.

## Security, the rest

- **✔ Knowing the ID is enough to DELETE** (`server/eggs.ts:188`). Guessing
  isn't a risk (122 bits), but the ID is displayed and emailed. Either add a
  separate delete secret that is never shown, or record the risk in
  DECISIONS.
- **✔ No content-type check.** A `text/plain` POST is a "simple" cross-origin
  request, so any web page can make its visitors' browsers post junk, getting
  round the per-address rate limit. Return 415 for anything that isn't JSON.
- **Storage and cost can be filled:** IDs cost nothing to make, and
  `appVersion`, `prior`, `model`, `lang` and `register` have no length cap, so
  a blob can be about 16 KB. Cap the stored JSON at about 2 KB and each string
  field.
- **Smaller ones:**
  - A missing `Content-Length` lets the body be read whole before the size
    check (✔ `server/eggs.ts:106`).
  - The attestation error text echoes Node/OpenSSL messages to the client.
  - On iOS, a phone restored from backup loses its Secure Enclave key,
    swallows `invalidKey`, and is refused a new key (409), so it stays
    open-tier for good.
  - An attestation posted more than 3 days late fails against the leaf
    certificate's validity and is marked failed permanently.
  - `tools/devServer.ts` listens on every interface and crashes on a bad `%`
    in a URL.
- **Needs checking in the Netlify dashboard, not the repo:**
  - Deploys built between commits `00186b1` and `2850f40` used the site-wide
    store. Their permalinks still run that code and can write to the live
    store. Delete those deploys, or open the live store only when
    `context.deploy.published` is true.
  - `aggregateBy: ['ip','domain']` gives every permalink domain its own
    rate-limit bucket. Aggregate by `ip` only.
  - Whether deploy previews build for fork PRs, since the repo is public.
  - What Netlify's own logs keep: they probably link IP and User-Agent to
    `/api/eggs/<uid>`.

## Privacy page against the code

Verified as written: off by default, nothing is sent on a fresh install in
either app, the field list matches the record one for one, and the server
keeps no address. These don't hold up:

- **"Deletes every result"** in the summary: it reaches only the IDs this
  device holds. Settings shows only the current ID, so a cook can't email for
  the older ones in `uids`/`deleting`.
- **Web results are now zero-weight** (DECISIONS 85), yet web cooks are still
  asked to share "to learn faster" and still get the ±10 s nudge. Either the
  wording or the collection should change.
- **"They leave my computer too":** `emulate` output and the documented
  `cat pulled imported > all.jsonl` keep `uid`, `day` and `seq` after a pull
  removes them.
- **iOS can still send an attestation after sharing is turned off,** because
  there is no generation check after Apple returns
  (`ios/App/Sharing.swift:285-305`). A delete running alongside can also be
  undone by it writing the attest record back.
- **Small inaccuracies:**
  - "sometimes moves the time": it moves 20 times in 21.
  - The App Attest key goes when you delete, not "when its last result does".
  - The hourly `HEAD sw.js` checks are a periodic contact the page doesn't
    mention.
  - iPhone backups survive "delete the app".
  - The page's list of what stays on the phone omits `sharing.attest.v1`.

## Decision logic

- **The time is not strictly monotone between profile points.** The reviewer
  reproduced it: 0.61 → 716.1 s, then 0.62 → 715.2 s, falling at most about
  1 s. The header in `src/core/reach.ts:47-51` and INFERENCE §8 claim it is
  monotone. Either fix it (a running minimum per slider position) or correct
  the claim; test 12 covers only four cases.
- **The apps price the advice at different levels:** web at
  `settings.doneness` (`src/ui/app.ts:501`), iOS at `answer.level`. After a
  snap the web's ticket target can disagree with its own solution.
- **On iOS, after a pot change, the old pot's dots stay** under the thumb with
  no warning until the new profile arrives.
- **Checked by running and found sound:** the profile endpoints, empty and
  one-point profiles, warning against odds (no disagreements in 150 runs),
  fresh install, the nudge, the core invariants, and the Swift twin of
  reach/decide.

## Parity

- **Web "+" on an emptied field jumps to the minimum.** Clear the weight,
  press +, and the egg is 25 g, which counts as a measured egg. Only the probe
  and room fields have a `StepRule` (`src/ui/stepper.ts:56`). This rests on
  the HTML spec; it wasn't driven in a browser.
- **iOS "+" after a typed off-grid weight skips a step** (58.3 → 59.0, where
  the web goes to 58.5).
- **iOS keeps the "You asked for" line** in the language and units from when
  the cook started.
- **iOS records `appVersion` "0.4.0"** with no build number, so the fit can't
  tell builds apart.
- **iOS decodes `sharing.v1` all or nothing,** so a damaged store loses the
  pending deletions. The web salvages each readable ID.

## Bloat and factoring

The main problem: logic both apps must agree on sits outside core,
unfixtured and hand-twinned. Several of the bugs above came from that. Ranked
by payoff:

1. **✔ `decided()` is written twice:** `src/ui/app.ts:353` and
   `ios/App/Planner+Solve.swift:165`. DECISIONS 84 had to land as two
   commits, and the advice-level split above crept in here. Make it one core
   `decideAnswer(...)` and fixture it.
2. **Egg-record assembly** (`src/ui/calibration.ts:171-237` against
   `ios/App/Cook.swift:280-341`) is your training data, and is already
   drifting (`pulledBy` against `outAt`). Move it to a core `recordFor(facts)`.
3. **The sharing state machine** (`turnedOn`, `forgotten`, `deletionAsked`,
   `reconciled`, `advances`) is pure and has no fixtures, and the iOS decode
   difference above is the first drift. Move it to `src/core/share.ts`; the
   server can then share `isUid`.
4. **The decode decision** (fresh / rebuild / rebased / loaded) lives in each
   app, and the Swift copy has no tests.
5. **God files:**
   - `src/ui/app.ts` is 1483 lines with about 20 module-level `let`s.
   - `src/ui/calibration.ts` (933 lines) mixes `APP_VERSION`, record
     building, the storage format and the grid caches. iOS already splits the
     caches out as `DecisionGrids`.
6. **`oddsProfile`** (`src/core/reach.ts:189-292`) uses closures over mutable
   maps, which breaks core invariant 2. Its two bisections are copy-pasted.
7. **Smaller:**
   - `tools/shape-study/results*.json`: about 5.4k lines committed twice; keep
     one, minified.
   - The `fit/` pytest suite runs nowhere, though the fit writes
     `fixtures/population.json`, which both apps ship.
   - `vercel.json` hand-duplicates the CSP and isn't deployed.
   - `WORKLIST.md` and `FOLLOWUP.md` are closed records.
   - `test/decide.test.ts` re-implements `answerAt`.
   - 43 drafts are compiled on every build.
   - The CLAUDE.md advice "`rm -rf dist/test` first if a test file was
     deleted" is stale: `npm test` already runs `rm -rf dist`.
   - A handful of exports are used only in their own file.

**Found fine:** the CBOR and DER parsing, the attestation checks, preview
stores kept separate from production's, no import cycles, every copy key
used, every tool reachable from a script or doc. The duplicated fonts are the
same face in each platform's format, so not duplication. The only uncommitted
change at review time, in the widget bundle, was a trailing blank line.

## Where to start

The two multi-tab fixes and the raw-JSON write-back: they're the ones that
lose a cook's data.
