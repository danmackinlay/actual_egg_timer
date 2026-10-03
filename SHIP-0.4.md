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
- [ ] **The open tier's weight** (`COLLECTIVE.md` §4): with no attested eggs,
      web eggs get no weight in the fit at all. Floor, or as built?

## B. Privacy — the page, the law, the stores' questionnaires

The page (`privacy/index.html`) changes first; everything else follows it.

- [ ] **Check every claim on the page against the 0.4 code**, as was done for
      0.3: each field a record sends (`src/core/record.ts`), what the
      endpoint stores (`server/eggs.ts`), what it does *not* store (the IP
      address: the endpoint reads no address, but Netlify's function logs
      may see one — say so), what App Attest keeps server-side (a public key
      and a counter per id), what deletion removes, and how long anything is
      kept. "Until you delete them, or until I do" needs a concrete rule.
- [ ] **Who and why, in GDPR terms** (EU users, including your family):
      - who is responsible (you, by name, and the contact address);
      - the legal basis: consent, given by the switch, withdrawn by turning
        it off;
      - your rights and how to use them: deletion in the app; access and
        anything else by email, quoting the random id (decide whether the app
        should show the id so a cook can quote it);
      - the transfer to the US: Netlify Blobs, us-east-2 (**verify** that
        Netlify's Data Processing Addendum covers this and accept it in the
        Netlify account; the EU–US Data Privacy Framework or standard
        contractual clauses);
      - not directed at children.
- [ ] **Australia** (**verify**): a person with turnover under $3M is
      generally outside the Privacy Act's APPs; worth one line of your own
      judgement, not a policy.
- [ ] **What the offline web app keeps**: the service worker stores a copy of
      the site's own files on the device. Not personal data, but the page
      says what is stored where, so add one line.
- [ ] **The font is self-hosted** (no Google Fonts request): one line under
      "What I don't do" if you want it.
- [ ] **The changes list and the date** at the top of the page.
- [ ] **App Store Connect → App Privacy** (`ios/RELEASING.md` step 6): from
      Data Not Collected to Other Data Types and Device ID, both App
      Functionality, not linked, not tracking. **Decide: Device ID or User
      ID** for the random id — Apple's Device ID is "a device-level ID";
      User ID includes "an assigned user ID". The id is made per install and
      replaced by Start learning again; it identifies a cook's eggs, not the
      hardware. Whichever is chosen, `PrivacyInfo.xcprivacy` (now
      `NSPrivacyCollectedDataTypeDeviceID`) says the same.
- [ ] **Export compliance**: the app now uses HTTPS. That is exempt
      encryption, so `ITSAppUsesNonExemptEncryption: NO` should still be the
      honest answer (**verify** against Apple's export compliance page), but
      `project.yml`'s comment and RELEASING.md both say "no networking of any
      kind" and need rewriting.
- [ ] **TestFlight → Test Information**: the beta description mentions
      sharing; the review notes say what the endpoint is, that sharing is off
      by default, and what App Attest is for.

## C. iOS

- [ ] **App Attest on the App ID**: tick the **App Attest** capability on
      `name.danmackinlay.actualeggtimer` (developer.apple.com → Identifiers).
- [ ] **The App Attest environment**: `ActualEggTimer.entitlements` has no
      `com.apple.developer.devicecheck.appattest-environment`, which
      (**verify**) means every build, TestFlight included, attests against
      the development environment. Add it with `production` for Release
      builds. The server accepts both AAGUIDs; decide whether a development
      attestation should count as attested in the fit.
- [ ] **On a real phone** (the simulator cannot attest): turn sharing on, cook
      or seed an egg, see it arrive attested, delete it, see it gone.
- [ ] **The 1750 face on a phone**: the bundled TTFs load (`UIAppFonts`), the
      widget and Live Activity look right in 1750.
- [ ] **Version and build**: 0.4.0, the next unused build number (2; only
      0.3.1 (1) has been uploaded).
- [ ] **Archive, check the entitlements** (time-sensitive and, now, App
      Attest), **upload** from your terminal, update App Privacy *before*
      submitting for external review, then submit 0.4.0 to TestFlight review.

## D. Web

- [ ] **Previews write to the live store** (**verify**): the function opens
      the site-wide Blobs store, so a Netlify deploy preview would read and
      write the same eggs as production. Either give non-production contexts
      their own store name, or never post from a preview.
- [ ] **Abuse**: the endpoint caps a body's size (413) but has no rate limit.
      Decide a per-id and per-request cap before the link is public, and
      check the Netlify plan's function and Blobs quotas.
- [ ] **The offline web app on a real phone**: Safari on iOS from the Home
      Screen — first load, offline open, and an update arriving between
      cooks. My browser pane could not register the worker; the offline
      branch's own check was on an iOS simulator.
- [ ] **CSP** already allows the font and the endpoint (`font-src 'self'`,
      `connect-src 'self'`); recheck after any change.

## E. Release

- [ ] `INFERENCE.md`, `PLAN.md`, `UI.md` and `LOGBOOK.md` say what was built
      (`COLLECTIVE.md`'s shipping list).
- [ ] Merge `main` into `0.4.x` once more, then `0.4.x` into `main`; version
      `0.4.0-alpha.1` (already on the branch); tag `v0.4.0-alpha.1`; push on
      your word.
- [ ] **Live**: a record posted and deleted through the real endpoint; the
      privacy page live and current; the app and the worker load with no
      console errors in Chromium and Safari.
- [ ] Then the iOS upload (section C) and the TestFlight review.
- [ ] Afterwards: `0.3.x` is cut from `v0.3.4-alpha.1` only if 0.3 needs a fix.
