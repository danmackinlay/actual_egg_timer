# COLLECTIVE.md — E6-E8, the collective part, worked through

The build plan for what `INFERENCE.md` §6-§9 designed and `PLAN.md` lists as
not started: opt-in collection (E6), the population fit (E7) and the nudge
(E8). Begun 2 October 2026 on the branch `claude/collective-egg-inference-ce39cf`.
`INFERENCE.md` stays the design and says what was built once it is; this file
is the order of work, the choices made to build it, and what is ticked. Each
item is ticked in the same commit as the work; its hash is added by the next
commit that touches this file.

The owner's answers of 2 October are `DECISIONS.md` 59-60: a small "learning"
badge with an (i) is what says the app is learning (53), a cook who turns
sharing on sends the eggs already in the log too (54), and App Attest is built
now (55).

**State.** E6, E7 and E8 are built. E6 and E8 were checked in both apps
against a local endpoint; E7's fit was checked on simulated cooks, and both
apps draw from the published population, the literature's until real eggs
are fitted. Nothing is deployed: the live endpoint is a push.

---

## 1. Choices made to build it

Each is settled here unless §6 lists it as the owner's.

### The endpoint (E6)

- **One Netlify function**, `netlify/functions/eggs.mts`, on the site that
  already serves the web app. The logic is `server/`, TypeScript under the
  repo's `tsconfig.json`, so `npm test` drives it against an in-memory store;
  the function file only binds it to Netlify Blobs. It imports `parseRecord`
  from `src/core/record.ts`, so the server refuses exactly what both apps'
  loaders refuse.
- **Routes**:
  - `POST /api/eggs` - body `{ "seq": n, "record": {...} }`. The record must
    pass `parseRecord` and carry a cook id; `seq` is the cook's own upload
    count. Stored at `records/<tier>/<uid>/<seq, 6 digits>.json`, written
    only if new, so a retry is harmless and nothing is overwritten (append
    only). 201 stored, 200 already had it, 400 refused, 413 too big, 415
    not JSON, 429 rate-limited. What a sender makes of an answer is
    `shareReply` in `src/core/policy.ts`: it waits on no answer, and on an
    answer about the way to the server (403, 404, 408, 429, a 5xx) for at
    most five tries and three days (`shareGivesUp`); an answer about the
    request itself (400, 409, 413, 415, any other 4xx) skips the egg.
  - `DELETE /api/eggs/<uid>` - every record under the id in both tiers, and
    its key. 200 with the count, also when there was nothing.
  - `POST /api/attest` - `{ uid, keyId, attestation }` from iOS (below).
- **Tiers.** `attested`: the record came with an App Attest assertion that
  verified against the key attested for that id. `open`: everything else - the
  web app, and an iPhone that cannot attest (a simulator, an old phone, a
  failure). `INFERENCE.md` §6's "web tier" is the open tier.
- **Nothing about the sender is written.** No IP, no user agent, no time of
  arrival beyond what the store itself keeps; the function logs nothing about
  a request. Abuse is bounded by Netlify's per-IP rate limit, declared in the
  function's `config` (counted by Netlify, never stored by us), by the record
  validation, and by a cap on `seq`. Everything else is the fit's job (§6 of
  `INFERENCE.md`): per-cook reliability, Student-t cook effects, the tier cap.
- **The store** is the site-wide Blobs store `eggs`, in Netlify's default
  region (`us-east-2`), strongly consistent. The region is fixed once data
  exists, since a store opened in another region finds nothing.
- **`@netlify/blobs` is the one runtime dependency**, pinned exactly at
  11.1.1, a week old when chosen rather than the day-old latest. Its runtime
  entry imports only `@netlify/runtime-utils`; the rest of its tree (the
  local server the integration test uses) never reaches the function.
- **Same origin.** The web app posts to its own site, which its CSP already
  allows (`connect-src 'self'`); no CORS headers, so no other site's page can
  post from a browser.

### The record (E6)

Two fields are added within v1, which `INFERENCE.md` §4 allows: each says what
its absence means.

- `forecast`: what the app said at "Eggs in" (`DECISIONS.md` 37) -
  `{ "cook_s": t, "yolk": [soft, right, firm], "white": [runny, tender, firm] }`,
  the answer probabilities at the time the cook was started at, unrelated share
  included. `cook_s` is that time: on a cold start the boil tap re-solves the
  time afterwards, and the fit has to know the forecast was for the guess.
  Null (or absent) when the time was started before the odds were known, or
  when no time was chosen (the white never sets). `Outcome` gains the white's
  tender and firm so the ticket can carry all six.
- `model`: the code that made the forecast and chose the time, `MODEL_ID` in
  core, changed whenever the likelihood, the decision or the nudge changes.
  Null (or absent) on records written before E6.
- `prior` becomes the population the prior was drawn from, when E7 lands: the
  literature's id until a fit is published. It was the prior and the policy
  together; the policy is now `model`. No record has left the owner's devices
  (`DECISIONS.md` 38, 48), so this is still free to change.
- `uid` stays null on the device. The copy that is sent carries the cook's id;
  the log keeps no id, so forgetting the id never touches the log.

Two more since, under `DECISIONS.md` 92 (6 October 2026), the same way:
`yolkWord`, the yolk the cook got in the slider's five words (`runny` to
`hard`), which the apps write in place of `yolk`, and `forecast.yolkWord`,
the five words' probabilities. Both are null, or absent, on a record from
before; `yolk` is kept on those and scored as it was. The server takes them
through `parseRecord` like every other field, which refuses a record with
both yolk answers or a word that is not one of the five
(`test/server.test.ts` 7). `MODEL_ID` is `2026-10-e9` from then.

### The cook's id, consent and deletion (E6)

- **Off by default**, in Settings, with the consent text on screen beside the
  switch, not behind an (i), and the privacy page linked.
- **The id** is a random UUID made when sharing is first turned on. "Start
  learning again" (forget everything) makes a new one, as `INFERENCE.md` §7
  says. Every id this device has used is kept on the device, so "Delete what
  I've sent" can delete all of them - otherwise forgetting would strand what
  was sent under the old id.
- **What is sent** (`DECISIONS.md` 59): every egg in the log, the ones from
  before sharing was turned on included, then each egg once it is final. An
  egg is final when the cook has moved on from it (Start again, or a reload,
  after which no answer can be added to it). A cursor into the log says how
  many are sent; a damaged log that had to be dropped resets it.
- **Sending** is one record at a time, in order, at launch, when an egg
  becomes final, when sharing is turned on, and when the browser comes back
  online. A refused record (400) is skipped; anything else stops the run until
  the next trigger.
- **Delete what I've sent** asks first, as Forget does; it turns sharing off
  and sends a DELETE for every id this device has used. A delete that does not
  get through is kept and retried at every launch until the server answers.
- **Turning sharing off** stops sending. It deletes nothing; that is the other
  button.

### App Attest (E6, `DECISIONS.md` 60)

- **When sharing is turned on**, on a phone that supports it: make a key, attest
  it with `clientDataHash = SHA256(uid)`, and post the attestation. Binding the
  attestation to the id stands in for a server challenge: a captured
  attestation cannot be registered under another id, and nothing can make
  assertions without the phone's Secure Enclave.
- **Each upload** carries an assertion over `SHA256(body)` in a header. The
  server checks the signature, the app id and that the counter has gone up.
- **The server's verification** follows Apple's eleven steps, against Apple's
  App Attest root certificate, embedded. It is tested against Apple's own
  sample attestation from the "Attestation Object Validation Guide", at a
  date inside its leaf certificate's validity, and against a synthetic
  attestation for this app under a made-up root (`tools/attestTestData.ts`),
  whose key the tests sign assertions with. Apple's guide has two slips its
  sample contradicts: step 5's "expected public key hash" is not the hash of
  the key (the key id is), and the sample's bundle version is "1", not
  "1.0". Its sample also carries extensions without setting the ED flag, so
  the reader takes a map after the credential whatever the flag says.
- **No entitlement is added.** Without one, a development build uses the
  sandbox environment, and TestFlight and the App Store use production
  whatever it says. The server accepts both and records which, but **only
  production counts** (`DECISIONS.md` 68): a development build is the
  owner's own phone, so its eggs go to the open tier exactly as if they
  were unsigned (`countsAsGenuine` in `server/appAttest.ts`). The fit's pull
  reads each record's tier through the same rule (`countedTier`), so a
  record filed as attested under a development key counts as open.
- **A failure is never fatal**: the egg goes to the open tier.

### The nudge and the badge (E8, `DECISIONS.md` 58)

- **The nudge** is a whole number of seconds drawn uniformly from -10 to +10
  (`DECISIONS.md` 61: the owner's choice, with its cost measured), added to
  the chosen time, for a cook who is sharing and only where a time is
  chosen (`decisionApplies`). Core turns a uniform number into seconds
  (`nudgeSeconds`); the app supplies the randomness, as it supplies the clock.
- **Drawn before the time is shown**, at launch and after each cook, and
  applied to the time on screen, so the time shown, the time started and the
  odds under it all agree, and the time never jumps at "Eggs in". A boil tap's
  re-solve carries it, as it carries the lean.
- **The record** splits it: `recommended_s` is the scheduled time less the
  nudge, `nudge_s` the nudge. The likelihood already scores at the pull.
- **The badge**: a small "Learning" mark by the time, with an (i), shown to a
  cook who is sharing. The (i) says why the time may move.
- **Its cost** is measured before it ships: the expected loss at the chosen
  time against the chosen time +-10 s, over simulated cooks.

### The population and the fit (E7)

- **A population file**, `fixtures/population.json`, is what both apps draw
  their prior from: per-dimension medians and spreads for a new cook (the
  time-scale, taste, carryover, noise, the white offset and the firm gap), the
  global posterior's means and covariance for the record, and an id. Until a
  fit has real data it is the literature's prior, number for number, so every
  existing fixture and every stored posterior stays bit-identical.
- **Core reads it** (`parsePopulation`, `createPrior(count, seed, population)`),
  in TypeScript and Swift; the web app fetches it at boot beside the words,
  and iOS bundles it. A posterior remembers the population it was drawn from;
  when a release ships a new one, both apps replay the log from the new prior
  - "a model change is a replay" (`INFERENCE.md` §4).
- **The fit is offline, in Python** (`fit/`, NumPyro, run with `uv`), outside
  `src/core/` and its rules. It never runs the physics: `npm run eggs --
  emulate` writes, for each record, its log yolk and white doses and peak yolk
  temperature on a grid of time-scales at the time it is scored at, and the
  fit interpolates them. Two global parameters (the time-scale and the white
  lag) are learned; carryover and size scaling stay at the physics until data
  reach them (`INFERENCE.md` §2). Per cook: a time-scale multiplier, a taste
  offset, a white cutpoint, a firm gap and a noise scale, heavy-tailed.
- **The tiers**: open-tier results (the web, and anything unattested) are
  kept but get **no weight** in the fit for now (`DECISIONS.md` 85; the
  default `--open-power 0`). They cannot be tied to a person: an id is free
  to make, so one bad actor can be many ids. The machinery for a weight is
  kept: a likelihood raised to `--open-power`, capped at the attested tier's
  total (`DECISIONS.md` 2), with the per-id log score (37) as the screen.
- **The owner's trusted IDs** (`DECISIONS.md` 82): the owner vouches for
  their own random IDs, and every result under one that comes from the
  owner's own results file counts at the attested tier's full weight
  whatever tier it came in - a build from Xcode is open (68), and so is the
  web - and on the attested side of the cap. A result in the live store is
  never trusted for its ID alone: an ID is shown on screen, so anyone who
  learned one could post under it. The list
  is never committed, since it would tie the owner to their results: it is
  `fit/trusted.local.txt` (gitignored; `fit/trusted.example.txt` shows the
  shape) and `EGGFIT_TRUSTED`, pooled. `import` marks the lines, `emulate`
  trusts a pulled egg whose twin in the file is trusted, and the fit reads
  the list again, so either is enough. A trusted cook is
  never held out. The published population says how many eggs were trusted,
  never whose.
- **The owner's own results, from a device** (`DECISIONS.md` 81): Settings,
  "Export my results", saves the device's whole store to a file;
  `npm run eggs -- import <file> [<out.jsonl>] [--uid <id>]` writes its
  records as `pull` writes the store's, open and marked as from an export,
  under the file's random ID (or `--uid`, when sharing was never on). Pool it
  after a pull - `cat pulled.jsonl imported.jsonl` - and `emulate` keeps the
  pull's copy of any egg that was also shared.
- **Evaluation** is by proper scoring rules on held-out cooks, one step ahead
  (`DECISIONS.md` 37): the log score first, the ranked probability score,
  reliability diagrams and randomised PIT. Run on simulated cooks with a known
  truth now, since there are no real ones yet: recovery of the global
  parameters, and the held-out score of the fitted population against the
  literature's.
- **Pulling the data** is `npm run eggs -- pull`, with the owner's Netlify
  token; the records it writes are gitignored.

## 2. The work, in commits

E6 first, because the endpoint has to be live before anything is sent; E8
with it, because the consent text has to cover the nudge; E7 last, because it
needs data and nothing an app does waits on it.

### E6, collection

- [x] Plan, and `DECISIONS.md` 59-60 (`700b932`).
- [x] Core: `Outcome` carries the white's three answers (TS, Swift, fixtures)
      (`67be30d`).
- [x] iOS: the ticket's `Outcome` renamed `outcome`, freeing "forecast"
      (`84b5a25`; PLAN.md's open item).
- [x] Core: the record's `forecast` and `model`. `parseRecord` and
      `Record.swift`, `fixtures/record.json`; both apps write them from the
      ticket. (`prior` becomes the population's id with E7.) (`3c32227`)
- [x] Server: `server/` (records, deletion, tiers, CBOR, App Attest), the
      function, `netlify.toml`, `@netlify/blobs`; `test/server.test.ts`,
      `test/appAttest.test.ts`, and `test/serverBlobs.test.ts`, which runs
      the function through the real Blobs client against its local server
      (`00186b1`).
- [x] Copy: the `share` draft, both apps, with the 1750 twins. Proved by
      `copyLiterals --since c86f442 share` and `copySnapshot compare --draft
      share` (172 web states: only the drafted strings are new).
- [x] Web: `src/ui/share.ts` - the id, the cursor, sending, deletion;
      Forget makes a new id; `test/share.test.ts`. Wired to boot, Start
      again and Forget; off until the Settings section can turn it on
      (`f7f9e90`).
- [x] Web: the Settings section (with the `share` draft).
- [x] iOS: `Sharing.swift` - the same, with App Attest; wired to launch,
      Start again, Forget and the foreground; the privacy manifest's
      collected data (Other Data Types and Device ID, neither linked nor
      tracking, for the app's function). Off until Settings can turn it on
      (`0f93576`).
- [x] iOS: the Settings section (with the `share` draft). Both apps were
      checked end to end against `npm run serve:dev`: sharing turned on
      sends the log so far, and Delete removes it on the server
      (`f902240`).
- [x] The privacy page, before anything ships: what is sent (the record's
      fields, in words), where, for how long, the id, the nudge, App Attest,
      deletion, Netlify as processor. Both READMEs and `ios/RELEASING.md`
      (the App Privacy answers: Other Data Types and Device ID, neither
      linked nor tracking) stop saying no networking; INFERENCE.md §7 says
      what was built (`22f16cd`).

### E8, the nudge

- [x] Core: `NUDGE_MAX_S`, `nudgeSeconds`, `appliedNudge`, the nudged
      solution; both cores, `fixtures/decide.json` (`421ae8f`).
- [x] Its cost measured (`npm run decide -- nudge`): at +-10 s the share of
      eggs that come out right falls from 52.1% to 49.3%, and 66.9% to
      62.6% by a cook's sixth egg; +-5 s costs under a point. The owner chose
      +-10 s knowing it (`DECISIONS.md` 61).
- [x] Both apps: the nudge drawn at launch and after each cook, applied
      while sharing is on, shown, started, carried through a boil tap (and
      dropped from the record if the re-solve could not carry it), and split
      out in the record. `MODEL_ID` is `2026-10-e8`.
- [x] Copy: the `learning` draft - the Learning mark and its (i), both
      apps, over the time's panel; proved by `copyLiterals --since 421ae8f
      learning` and `copySnapshot compare --draft learning`.

### E7, the population fit

- [x] Core: `Population`, `parsePopulation`, `createPrior` from it, and the
      zero-egg start a calibration carries (`PriorStart`, so a cook who never
      answers is still timed at the population's centre);
      `fixtures/population.json` as the literature (`npm run population --
      literature`); Swift; `fixtures/prior.json`. With the literature every
      existing fixture is unchanged. A record's `prior` is the population's
      id; the policy is `model`'s.
- [x] Both apps: read it (the web fetches it beside the words, iOS bundles
      it), keep the population's id with the posterior, replay on a
      change (`fea97d5`).
- [x] `tools/eggs.ts`: `pull`, `emulate` (with the app's own likelihood for
      a few eggs, for the fit's tests), `simulate`.
- [x] `fit/`: the model, the fit, the scores, `population.json` out; the
      likelihood held to `infer.ts` to the digit (`fit/tests`).
- [x] Validated on 400 simulated cooks: the time-scale and the white's lag
      recovered, the held-out one-step-ahead log score the truth's own to
      the second decimal, the noise's spreads not recovered (INFERENCE.md
      §9 has the numbers).

### Shipping

- [ ] `INFERENCE.md`, `PLAN.md`, `UI.md`, `LOGBOOK.md` say what was built.
- [ ] Merged to local `main`; the version bumped and tagged; pushed on the
      owner's word. The push deploys the function, and sharing works from the
      first page load after it.
- [ ] Checked live: a record posted and deleted through the real endpoint.

## 3. What is not in this plan

- **A server-issued challenge for App Attest.** Binding to the id does the
  same job here; revisit if the attested tier ever matters more than an egg
  timer warrants.
- **Apple's fraud receipt** (`Assessing fraud risk`). Not stored; nothing
  would read it.
- **Carryover and size scaling in the fit**, until cooks vary them.
- **A per-cook loss** (`INFERENCE.md` §8), still not asked for.

## 4. Open for the owner

Filled in as the build raises them; `PLAN.md`'s queue holds the ones that
block.

- The consent text, the badge and the deletion words, on a phone (the `share`
  and `learning` drafts).
- The privacy page, which speaks in the owner's name.
- The open tier has no weight for now (`DECISIONS.md` 85); every open
  result is kept, so it can be given one later, screened per id.
  The owner's own results no longer wait on it: their trusted IDs count in
  full, and lift the cap for the rest (`DECISIONS.md` 82).
