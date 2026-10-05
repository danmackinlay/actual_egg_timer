# Shipping 0.4 — web and iOS

The worklist for releasing `0.4.x` (opt-in sharing, the nudge and the
population fit, E6–E8; the counter from first principles; the offline web
app; the English of 1750 in IM FELL) as `0.4.0-alpha.1`. Written
3 October 2026 against `0.4.x` at `2323bb2`. Tick items here as they land,
with the commit. **(verify)** marks a claim not yet checked against Apple's,
Netlify's or the law's own words.

The order matters: the privacy work and the owner's reviews come before
anything is pushed to `main`, because the push deploys the endpoint and
turns on a page that says what it collects.

## A. The owner's reviews (on a phone, before anything else)

- [ ] **The sharing words** — the `share` and `learning` drafts: the switch
      and its consent text, "Delete what I've sent" and its confirmation,
      the Learning mark and its (i). English, en-US and 1750.
- [ ] **The copy passes now on `main`** — `plain`, `bench`, `quotes`,
      `owner`, `below`, `notes`, and the en-US overlay.
- [ ] **The English of 1750 in IM FELL English**, both apps (`DECISIONS.md`
      65, 66).
- [ ] **The privacy page**, which speaks in your name (section B rewrites it).
- [x] (DECISIONS.md 85: no weight for now, kept for later) **The open tier's weight** (`COLLECTIVE.md` §4): with no attested eggs,
      web eggs get no weight in the fit at all. Floor, or as built?

## B. Privacy — the page, the law, the stores' questionnaires

The page (`privacy/index.html`) changes first; everything else follows it.

**The owner's items left in B** (after `DECISIONS.md` 67-74, 4 October
2026): confirming **Device ID** (not User ID) for the random id on Apple's
label. Retention is decided (73: no fixed period, criteria on the page) and
so is the label's **Not Linked** (74).

- [x] **Check every claim on the page against the 0.4 code**, as was done for
      0.3: each field a record sends (`src/core/record.ts`), what the
      endpoint stores (`server/eggs.ts`), what it does *not* store (the IP
      address: the endpoint reads no address, but Netlify's function logs
      may see one — say so), what App Attest keeps server-side (a public key
      and a counter per id), what deletion removes, and how long anything is
      kept. "Until you delete them, or until I do" needs a concrete rule.
      The page is rewritten (`2223bf9`): the two modes first, every field,
      what the server keeps (with App Attest's key name, how the app was
      installed and its build number, which `StoredKey` also keeps), where,
      who can see it, Netlify's logs (a DELETE's path carries the id). The
      retention rule is a proposal marked `OWNER` in the page: until
      deleted, at most five years from the day the egg was cooked.
- [x] **The page's `OWNER:` marks** (comments in `privacy/index.html`):
      none left (retention, 73; the local copy is a snapshot replaced at
      every pull, 75). Was:
      deleting the copy of the
      records on your own computer (`npm run eggs -- pull`) each time you
      have worked out new starting guesses. Answered and removed
      (`8deebf5`): saying you live in Australia (`DECISIONS.md` 70, it
      stays), the id (next item) and withdrawal (below).
- [x] **Not needed** (`DECISIONS.md` 73, no fixed period). Was: **The retention rule, enforced**: whatever period the owner picks
      needs a step that applies it, e.g. `npm run eggs -- prune`, deleting
      records whose `day` is older and any App Attest key left with no
      records, run before each time you work out new starting guesses. The
      server keeps no time of arrival, so the rule has to go by the day the
      egg was cooked.
- [x] **Show the random id** so a person can quote it by email
      (`DECISIONS.md` 67): "Your random ID" (was "Your random number") over the id, whole,
      fixed-width and selectable, in both apps' sharing section from the
      first time sharing is turned on until a deletion; the `sharingid`
      draft (`546fda7`). The page says where to find it (`8deebf5`).
- [x] **Who and why, in GDPR terms** (EU users, including your family), in
      plain words on the page (`2223bf9`, `5a85757`), checked by the
      research of 3 October 2026 against the sources: GDPR Art. 13's list
      (who, contact, purpose, consent as the basis, recipients, the
      transfer, retention, every right, withdrawal without undoing what came
      before, complaint, that sharing is optional, no decisions about the
      person). The household exemption does not apply to a public app (CJEU
      Lindqvist C-101/01). Netlify's Data Processing Addendum is part of its
      terms, free plans included: nothing to accept. The transfer rests on
      the EU–US Data Privacy Framework (adequacy decision (EU) 2023/1795;
      Netlify, Inc. active, with the UK Extension and Swiss–US), with the
      standard contractual clauses (Module Two) in the DPA as a fallback.
      Netlify's request logs keep the IP address, searchable 24 hours on
      Free and Personal plans and 7 days on Pro.
- [x] **Withdrawal**: under Art. 17(1)(b), data held on consent
      must be erased once consent is withdrawn, unless another basis
      applies. The owner: "keep what was sent" (`DECISIONS.md` 69).
      Turning sharing off stops sending and keeps what was sent; consent
      for the results already sent is withdrawn by deleting them, and the
      page says so plainly (`8deebf5`).
- [x] **An EU representative** (GDPR Art. 27): a controller outside
      the EU collecting from people in it on a standing basis arguably needs
      one, since the exemption for occasional processing likely does not
      apply. The owner chose to "accept the risk of having no EU
      representative" (`DECISIONS.md` 71). The page says nothing about
      it.
- [x] **Australia**: the APPs very likely don't apply (the small business
      exemption, turnover of A$3M or less, which the 2024 amendments left
      alone); the statutory tort for serious invasions of privacy (since
      10 June 2025) applies regardless. The page keeps one line
      (`5a85757`).
- [x] **What the offline web app keeps**: the service worker stores a copy of
      the site's own files on the device. Not personal data, but the page
      says what is stored where, so add one line (`2223bf9`).
- [x] **The font is self-hosted** (no Google Fonts request): one line under
      "What I don't do" if you want it (`2223bf9`).
- [x] **The changes list and the date** at the top of the page: 3 October
      2026, "version 0.4: sharing added, …" (`2223bf9`).
- [ ] **App Store Connect → App Privacy** (`ios/RELEASING.md` step 6). Left
      for the owner: confirming **Device ID** for the random id. Answered:
      **Not Linked** (`DECISIONS.md` 74), the id as Device ID (`DECISIONS.md` 76), and App Attest needs no answer of its own, since what the
      server keeps for it hangs off that id and is App Functionality
      ("prevent fraud, implement security measures"; `DECISIONS.md` 72,
      `fbaa94c`). Step 6 still notes Other User Content for the answers,
      to weigh when filling it in. The history: from
      Data Not Collected to Other Data Types and Device ID, both App
      Functionality, not linked, not tracking. **Decide: Device ID or User
      ID** for the random id — Apple's Device ID is "a device-level ID";
      User ID includes "an assigned user ID". The id is made per install and
      replaced by Start learning again; it identifies a cook's eggs, not the
      hardware. Whichever is chosen, `PrivacyInfo.xcprivacy` (now
      `NSPrivacyCollectedDataTypeDeviceID`) says the same. Step 6 now
      records the choice as pending and what App Attest keeps (`acddcb7`).
      The research (Apple's App Privacy Details page): opt-in collection
      must be disclosed. Device ID ("other device-level ID") is the closer
      fit for a per-install id, and an assigned User ID is defensible.
      **Not linked is doubtful**: Apple's de-identification means stripping
      direct identifiers such as a user ID, and records keyed by a
      persistent id that drives deletion are arguably Linked to You, the
      safer reading. The person's answers about each egg may be **Other
      User Content**.
      Whether App Attest's key needs its own answer is open. These are your
      choices; `PrivacyInfo.xcprivacy` follows them, unchanged until then
      (step 6 lists them, `e5d362f`).
- [x] **Export compliance**: `ITSAppUsesNonExemptEncryption: NO` is right:
      HTTPS through `URLSession` and SHA-256 for App Attest are exempt
      (Apple's "Complying with encryption export regulations"). The "no
      networking" comments in `project.yml` and RELEASING.md are rewritten
      (`acddcb7`, `e5d362f`).
- [ ] **TestFlight → Test Information**: the beta description mentions
      sharing; the review notes say what the endpoint is, that sharing is off
      by default, and what App Attest is for.

- [x] **One privacy page for every version, no fork.** Every build links to
      `/privacy`, the 0.3.1 TestFlight build included, so the page covers
      both; it now says sharing came with 0.4 and a version without
      *Sharing results* sends nothing.

## C. iOS

- [ ] **App Attest on the App ID**: App Attest is listed as a capability on
      `name.danmackinlay.actualeggtimer` (developer.apple.com →
      Identifiers). It is needed only if the entitlement is in the binary;
      ticking it anyway is harmless, but invalidates the existing
      provisioning profiles.
- [x] **The App Attest environment**: TestFlight and App Store builds always
      attest against production and ignore the entitlement; only builds
      installed from Xcode without it use the sandbox (Apple's
      `appattest-environment` entitlement and "Preparing to use the App
      Attest service"). So nothing needs adding. The decision left: when you
      work out new starting guesses, do results sent from your own
      development phones count as coming from a genuine copy of the app?
      The owner: "ideally not" (`DECISIONS.md` 68). The server still
      verifies and keeps a development key, but files its results in the
      open tier, exactly as if unsigned, and the fit's pull reads every
      record's tier by the same rule (`d90e3cd`). So the real-phone check
      below needs a TestFlight build to see a result arrive attested; a
      build from Xcode sees it arrive open.
- [ ] **On a real phone** (the simulator cannot attest): turn sharing on, cook
      or seed an egg, see its result arrive attested (from TestFlight; from
      Xcode it arrives open, `DECISIONS.md` 68), delete it, see it gone.
- [ ] **The 1750 face on a phone**: the bundled TTFs load (`UIAppFonts`), the
      widget and Live Activity look right in 1750.
- [ ] **Version and build**: 0.4.0, the next unused build number (2; only
      0.3.1 (1) has been uploaded).
- [ ] **Archive, check the entitlements** (time-sensitive and, now, App
      Attest), **upload** from your terminal, update App Privacy *before*
      submitting for external review, then submit 0.4.0 to TestFlight review.

## D. Web

- [x] (fixed: production alone opens the site-wide store; a preview or branch deploy gets a store of its own, `getDeployStore`; `test/serverBlobs.test.ts` holds it) **Previews write to the live store**: confirmed. A `getStore` store is
      shared across all deploys, so deploy previews and branch deploys read,
      write and can delete the live records (Netlify Blobs docs). Either give
      non-production contexts their own store name, or never post from a
      preview.
- [ ] **Abuse**: the endpoint caps a body's size (413, 16 KB; Netlify's own
      cap is 6 MB), the results one id can send (`MAX_SEQ`, 5000) and
      requests per address
      (Netlify's rate limit, 120 a minute, in `eggs.mts`). Decide whether
      that is enough before the link is public. **Check which plan the
      account is on**: the credit-based Free plan is 300 credits a month, a
      hard limit; the legacy free tier (accounts from before 4 September
      2025) is 125,000 function invocations per site a month. Exhausting
      either pauses the whole site, the web app included, not just the
      endpoint.
- [ ] **The offline web app on a real phone**: Safari on iOS from the Home
      Screen — first load, offline open, and an update arriving between
      cooks. My browser pane could not register the worker; the offline
      branch's own check was on an iOS simulator.
- [ ] **CSP** already allows the font and the endpoint (`font-src 'self'`,
      `connect-src 'self'`); recheck after any change.

## E. Release

- [x] **The version in Settings**, so a person writing in can say which
      they have: "Version 0.4.0-alpha.1" on the web, "Version 0.4.0 (2)" on
      iOS (the build in brackets), the last line under the colophon, the
      number selectable; the `version` draft.
- [ ] `INFERENCE.md`, `PLAN.md`, `UI.md` and `LOGBOOK.md` say what was built
      (`COLLECTIVE.md`'s shipping list).
- [ ] Merge `main` into `0.4.x` once more, then `0.4.x` into `main`; version
      `0.4.0-alpha.1` (already on the branch); tag `v0.4.0-alpha.1`; push on
      your word.
- [ ] **Live**: a record posted and deleted through the real endpoint; the
      privacy page live and current; the app and the worker load with no
      console errors in Chromium and Safari.
- [ ] **Set the privacy page's date and Changes line to the release day**
      (it says 3 October 2026 now; the 0.3 page is in force until 0.4
      deploys).
- [ ] **Gate:** no 0.4.0 build is uploaded until https://actualeggtimer.netlify.app/privacy
      live shows the 0.4 page. With internal automatic distribution, an
      upload is already a release to the family.
- [ ] Then the iOS upload (section C) and the TestFlight review.
- [ ] **Never roll the Netlify site back below 0.4** once results are
      stored: the 0.3 page says nothing leaves the device. Fix forward.
- [ ] Afterwards: `0.3.x` is cut from `v0.3.4-alpha.1` only if 0.3 needs a fix.

## Handover: what is left, in order (5 October 2026)

Kept here so a new session can pick up without this conversation.

1. [x] (done 47f098c; its OWNER questions remain, see 1b) **Action `REVIEW-0.4.x.md`** (the owner's adversarial review, committed
       on this branch): first "Fix before 0.4 ships" (multi-tab writes, the
       raw-JSON write-back, the ID that is also the password), then security,
       the privacy page against the code, data safety, decision logic,
       parity, bloat. Tick each item in that file with its commit.
1b. [x] (6 October) **The review's OWNER items answered**: DECISIONS
       82 amended, 84 amended (reworded), 85 amended (web sharing stays, as
       a quality signal), 86-90. Left for the owner in the Netlify
       dashboard: delete the deploys built between `00186b1` and
       `2850f40`; fork-PR previews need approval (done: the sensitive variable policy is "Require approval"); after the
       next deploy, find the rate-limit rule accepted in the deploy log's
       post-processing stage; what Netlify's own logs keep (review, item
       "What Netlify's own logs keep").
1c. [x] (built, merged 7f3ce89; the owner judges it on a phone with item 3) **The after-egg questions** (DECISIONS 92): the yolk
       named (Runny-Hard) in core, the fit, the server, the privacy page
       and both apps; the white next to the yolk; the probe below them.
       Runny was not offered because builds 2 and 3 predate DECISIONS 83
       and the phone had learned from an egg; the Runny tick is now struck
       through only when none of it can be reached (bb1cc9d). Open for the
       owner: show the probe field even when the probe setting is off (it
       does now)?
1d. [ ] **The QA agent's second pass** (REVIEW-0.4.x.md, "Second pass"),
       on three branches merged by the session that sent them: `qa2-tabs`
       (the two-tab write loop, a start-time ID per record, boil memory
       across tabs, a timeout on the send, the rollback claim),
       `qa2-attest` (iOS waits only on no reply, 429 and 5xx, and gives up
       after a bound), `qa2-words` (frozen word cuts, screen-reader groups,
       large text, sous-vide ticks, `-seedEggs`, `tools/eggs.ts`). OWNER:
       should the shown odds describe the asked-for word instead of "just
       right"?
2. [x] **Optional server polish** (0ab1eee): a refused attestation echoes library
       error text ("PEM routines::…"); return a generic message.
3. [ ] **The owner's phone session** (section A above, PLAN.md items 7-15)
       on a fresh `npm run ios:archive` build, or the web on the deploy
       preview, https://deploy-preview-2--actualeggtimer.netlify.app (draft
       PR danmackinlay/actual_egg_timer#2: keep it open, never merge it).
4. [ ] **App Store paperwork** (section B): App Privacy (Other Data Types +
       Device ID, App Functionality, Not Linked, not tracking); TestFlight
       Test Information; review notes for 0.4 (external services: opt-in
       sharing to this site on Netlify, Apple App Attest). Optionally tick
       App Attest on the App ID.
5. [ ] **Release, on the owner's word** (section E): docs, the privacy
       page's date, merge `main` into `0.4.x` then `0.4.x` into `main`, tag
       `v0.4.0-alpha.1`, push with `--follow-tags`, a live POST and DELETE
       through the real endpoint, then the iOS upload (`npm run ios:archive`;
       upload from Xcode's Organizer if `-exportArchive` cannot use the
       account), then TestFlight review.

Known state: the endpoint was exercised on the deploy preview on 5 October
(every check passed, rate limit included); unattested results have weight 0
(DECISIONS.md 85); the owner's trusted ids go in `fit/trusted.local.txt`.
