# RELEASING.md — getting the app onto other people's phones

TestFlight, for a handful of family members. Signing for a development build is
`ios/README.md`'s **Signing** section and is not repeated here; this file starts
where that one stops, at the point where somebody other than you needs the app.

**Internal testing is the whole answer.** No review, over the air, and once it
is set up a new build reaches everyone without you opening App Store Connect
again. Everything below is either one-time setup or what you repeat per build.

Verified against Apple's documentation on 19 September 2026. Where a claim is
from experience rather than a page Apple publishes, it says so — this process
changes often, and a confidently wrong step here costs a wasted upload and a day
of waiting.

---

## Why internal, and what it costs the family

External testing exists for strangers: up to 10,000 of them, a public link, and
**TestFlight App Review on the first build of each version**. Internal testing is
for people with access to your App Store Connect account: no review at all, and
an **Enable automatic distribution** checkbox that pushes every later build
straight to their phones.

The obvious objection — "I have to give my family access to my developer
account?" — turns out not to bite, and specifically because this membership is an
**individual** enrolment rather than an organisation. Apple's own wording:

> These users only access App Store Connect—they're not part of your team and
> won't receive other membership benefits.

So a family member added as a user gets a login to App Store Connect and nothing
else: no certificates, no identifiers, no profiles, no ability to ship anything.
Give them the **Marketing** role with **Limited Access** to this app — it is on
the internal-tester-eligible list and is the least it is possible to grant.

The individual enrolment also caps you at **50** such users rather than the 100
the TestFlight docs quote. Not a constraint at family scale, but it is the real
number.

Two things that will stop a particular person testing, both worth checking before
you promise anything:

- A **work- or school-managed Apple Account cannot test builds.** They need a
  personal one.
- The deployment target is **iOS 17.0**. An older phone will not be offered the
  build at all.

---

## Once, before the first upload

### 1. Sign the agreement

App Store Connect → **Business**. You cannot create an app record until the
latest Paid/Free Apps agreement is signed, and nothing else on this page works
until you have. It is the least obvious prerequisite on the list.

### 2. Register both App IDs

developer.apple.com/account → **Identifiers** → **+** → App IDs → App →
**Explicit**:

| identifier | capability |
|---|---|
| `name.danmackinlay.actualeggtimer` | tick **Time Sensitive Notifications** |
| `name.danmackinlay.actualeggtimer.widget` | none |

**Explicit, not wildcard.** A wildcard profile cannot carry the entitlement, and
TestFlight refuses the build outright with a status that does not explain itself:

> **Not Available for Testing** — Your build can't be used with TestFlight
> because the provisioning profile is missing an application identifier.

The upload succeeds first, so you find out at the end. The tell, in an archive,
is each target's profile: one named for its own bundle ID is right,
`iOS Team Provisioning Profile: *` is the wildcard. The widget falls back to the
wildcard whenever its identifier is not registered, even with the app's right.

Automatic signing will create the identifiers for you on demand, but it will not
invent the **capability**: that is a server-side setting, and it is why
`ios/README.md`'s signing step 3 exists.

### 3. Create the app record

App Store Connect → **Apps** → **+** → **New App**. Platform iOS, bundle ID
picked from the menu, SKU anything private, Full Access.

The **name must be globally unique across the App Store**, even for an app that
will never be on it. If "Actual Egg Timer" is taken, the record can be called
something else — it does not have to match `INFOPLIST_KEY_CFBundleDisplayName`,
and the family will see the display name.

You never type a version number. The bundle ID and `MARKETING_VERSION` inside the
upload create the version record by themselves.

### 4. Add the family, and make a group

**Users and Access** → **People** → **+**: name, email, role **Marketing**,
Limited Access → this app only. Use the address that **is** their Apple Account —
Apple says the invite address need not be one, but that is about activating App
Store Connect, not about redeeming in TestFlight, and matching them costs
nothing.

**Invitations expire after three days.** Send them when people are holding their
phones, not on a Friday.

Then the app's **TestFlight** tab → **+** beside **Internal Testing** → name it
("Family") → tick **Enable automatic distribution** → add the users.

That checkbox is the whole point of this route. Without it you visit App Store
Connect for every build; with it you never do again.

Tell them in advance that they need the free **TestFlight** app from the App
Store first. That, not the invitation, is the step non-technical people stall on.

### 5. Already done in this repo

Committed, each with its reason in its file, and not clutter:
`ios/App/PrivacyInfo.xcprivacy` (the required reason for `UserDefaults`, and
the data collected, which must match step 6's answers) and
`INFOPLIST_KEY_ITSAppUsesNonExemptEncryption: NO` in `project.yml` (without
it every build arrives as **Missing Compliance**, to be answered by hand).

### 6. For a public link: the privacy policy, and the privacy answers

Internal testing needs neither of these. A **public TestFlight link** is
external testing, and App Store Connect will not open one without a
**privacy policy URL** (in the TestFlight tab's **Test Information**; the App
Store asks for it again under **App Privacy**):

    https://actualeggtimer.netlify.app/privacy

It is `privacy/index.html`, served by the web app's Netlify site, which also
hosts the endpoint sharing sends to (`DECISIONS.md` 51). It is plain English
and outside the copy catalogue: what sharing sends, what the server keeps (the
results; for the iPhone, App Attest's public key and counter per id), where
(Netlify Blobs, us-east-2), for how long, and the GDPR essentials, its legal
facts checked on 3 October 2026. Every claim on it was checked against the
code, so a change to what either app keeps or sends changes that page first.
This one URL is what every build links to (the 0.3 builds included, from
Help), so the page must stay true for the oldest build still installed: it
says that a version with no Sharing results sends nothing. **Upload a build
that changes what is sent only after `main` has deployed the page that
describes it**, since with internal automatic distribution an upload is a
release to the family.

Apple counts data as collected when it leaves the device for the developer to
keep, and opt-in collection is still collection: the exemption for optional
data covers data the user chooses to provide each time, and sharing sends
every result once it is on. So, in App Store Connect, **App Privacy**:

- **Do you or your third-party partners collect data from this app?** Yes.
- **Other Data → Other Data Types**: collected; used for **App
  Functionality**; **not linked** to the user's identity; **not used for
  tracking**. (Each result: how an egg was cooked and how the person said it
  came out.)
- **Identifiers → Device ID**: collected; **App Functionality**; **not
  linked**; **not tracking**. (The random id made on the phone, which groups a
  person's results and lets them be deleted. It is not the advertising
  identifier and not derived from anything.) Device ID ("other device-level
  ID") is the closer fit for an id made per install and replaced by Start
  learning again (the owner, `DECISIONS.md` 76); `PrivacyInfo.xcprivacy`
  says the same (`NSPrivacyCollectedDataTypeDeviceID`).
- **App Attest needs no answer of its own** (`DECISIONS.md` 72). What the
  server keeps for it, per id (the key's public half and name, a counter,
  how the app was installed and its build number), hangs off the same
  random id, declared above as Device ID, and is deleted with that id's
  results. Its use is App Functionality, which Apple defines as "such as to
  authenticate the user, enable features, prevent fraud, implement security
  measures, …" (Apple's App Privacy Details page): telling a genuine copy
  of the app from anything else is that.
- Nothing else: no contact info, location, user content, usage data or
  diagnostics.

**The owner's answers, and one still to weigh** (the research of 3 October
2026 against Apple's App Privacy Details page; the owner's answers are
`DECISIONS.md` 72-76):

- **Not linked** (the owner, `DECISIONS.md` 74). Apple asks whether data is
  linked to the user's *identity*. The id is random, made per install from
  nothing about the person, and replaced by Start learning again; there is
  no account, the endpoint stores no IP address, and nothing sent identifies
  the device or the person. There is no identity to link to. (A stricter
  reading treats any persistent id as linkage; the owner chose Not linked
  knowingly.)
- **Still to weigh: Other User Content** for the person's answers about each
  egg, as well as or instead of Other Data Types.
  `ios/App/PrivacyInfo.xcprivacy` changes with whatever is chosen, not
  before.

The answers above match `ios/App/PrivacyInfo.xcprivacy`, which Xcode's
privacy report reads. Crash reports and App Analytics that Apple passes on
from people who opted in to share them are Apple's to disclose, not the app's
("You are not responsible for disclosing data collected by Apple", Apple's
App Privacy Details page).

---

## Every release

```sh
npm run ios:release
```

That is `npm run ios:archive` and then `npm run ios:upload`; either runs
alone, to redo one step. Run it from a clean `ios/project.yml`: the archive
bumps the build number and commits that one line, and each script's header
says what it checks. With automatic distribution on, the family's phones get
the build once Apple has processed it, minutes to an hour later, and there is
nothing else to do.

### Screenshots

A version for the App Store needs its screenshots, in English (Australia):

```sh
npm run ios:shots
```

It builds the app for the simulator, makes an iPhone 17 Pro and an iPhone 17
Pro Max of its own, takes each shot by a UI test of its own
(`ios/UITests/Shots.swift`), deletes both, and sets each under its caption:
about five minutes with the build. The images land in `ios/appstore/shots/`,
gitignored and kept by every build: `6.3in-1206x2622/` for the required
6.3-inch display and `6.9in-1320x2868/` for the 6.9-inch one, each
`NN-what.png`, the device's own screens under `raw/`. The captions are
`ios/appstore/captions.en-AU.json`, each with its note; after a change to
them, `npm run ios:shots -- --no-capture` sets them again in seconds. The
tool's header (`tools/iosShots.ts`) says how each shot is reached, and why the
Lock Screen's Live Activity is not one of them.

Uploading is the owner's step: in App Store Connect, the version's iPhone
screenshots, the 6.9-inch and 6.3-inch displays, in their numbered order.

### When it fails

A failed archive puts the build number back, so fix the cause and run it
again.

- **"has uncommitted changes"**: commit or discard `ios/project.yml` first.
- **"the time-sensitive entitlement is missing"**: the App ID lacks Time
  Sensitive Notifications (once, step 2). Signing drops the entitlement
  rather than failing, so the app would install and lose the alarm's way
  through a Focus mode.
- **"population.json does not read"**: the bundled population fit does not
  vouch for itself; `fit/README.md` says how to publish one. A forced one
  only warns.
- **A signing or provisioning error**: both App IDs registered, explicit
  (once, step 2), and an Apple Account in Xcode's Accounts pane.
- **The upload opens Xcode's Organizer**: `xcodebuild` could not use an
  Apple Account. Distribute App → App Store Connect → Upload, and **untick
  "Manage version and build number"**, which would rewrite the build number
  (`ios/ExportOptions.plist` says why). Signing in again in Xcode's Accounts
  pane makes the script work next time.
- **"Copy failed"**: Homebrew's rsync is ahead of Apple's on the PATH; the
  distribution log
  (`$TMPDIR/ActualEggTimer_*.xcdistributionlogs/IDEDistributionPipeline.log`)
  shows `rsync: on remote machine: --extended-attributes: unknown option`.
  `brew unlink rsync`, and upload again. Met 2 October 2026.
- **"App Store Connect access … is required" while signed in**: Xcode's App
  Store Connect helper (`com.apple.dt.Xcode.ITunesSoftwareService`) is
  crashing (`~/Library/Logs/DiagnosticReports`), and Xcode reports it as no
  account. On 2 October 2026 it cleared after quitting Xcode, signing in
  again and uploading from a clean PATH; which of those fixed it is not
  known. A way round that needs no Xcode account: set `destination` to
  `export` in `ios/ExportOptions.plist`, which leaves an `.ipa` in
  `ios/build/export`, and deliver that with Apple's Transporter app.
- **The build string was used already**: App Store Connect refuses it only
  at the end of the upload. `npm run ios:archive` makes a new one.
- **"Not Available for Testing … missing an application identifier"**, after
  an upload that succeeded: a wildcard profile (once, step 2).
- **The output piped into `head`** kills the upload when the pipe closes.
  Send it to a file.

### Never roll back; roll forward

An older build writes what it stores whole, from the fields it knows, and
drops what a newer one added; a store in a format it does not know it reads
as nothing, and replaces at its next write, the results log among them. And
0.5's first launch deletes 0.3's results log (`DECISIONS.md` 107). So:

- **Never offer a 0.3 build again** on a device 0.5 has run on, on the web or
  on a phone.
- **A web deploy never goes back before 0.5, nor to an older version than one
  already served.** In every browser that ran the newer one, the older build
  drops what the newer one stored that it cannot read; and its service
  worker replaces the newer build. To
  undo a web release, revert on `main`, bump the version past the one being
  undone, tag, and deploy that. If a rollback has already gone out, the same
  new version clears it.
- **On iOS, going back to an earlier build** loses what the newer one stored
  that the older cannot read, as on the web.

---

## The 90-day cliff

A build is installable for **90 days**. After that App Store Connect shows it as
**Expired** and testers can no longer install it.

*What the tester sees is not documented by Apple and I could not confirm it.*
From experience the build shows as expired and an installed copy stops launching
— which, for an egg timer, is a failure that lands at breakfast. Treat that as
unverified, and do not let it happen: re-upload around **day 80**, with
`npm run ios:release`; automatic distribution does the rest.

The real cliff is the membership, not the 90 days. If the Developer Program
lapses, the distribution certificate goes with it.

---

## What this is instead of

**Free provisioning (a Personal Team) is not an option here**, and not merely
because profiles expire after 7 days and it is capped at 3 devices. A Personal
Team **cannot sign the Time Sensitive Notifications entitlement**. `project.yml`
already records the consequence: without it "the alarm cannot cut through a Focus
mode". Free provisioning silently deletes the feature the app exists for.

**Ad-hoc distribution works and is worse.** It needs every device's UDID
registered, and each registration permanently consumes one of your 100 iPhone
slots for the membership year — disabling a device later does not give the slot
back. Installing means a Mac, a cable, and Apple Configurator, per person, per
build. And development- and ad-hoc-signed apps must reach `ppq.apple.com` on
first launch or they may not start, which is an odd shape for an app whose whole
claim is that it works offline in a kitchen.

Its one advantage over external TestFlight — no review — internal TestFlight
already has.

---

## Things that cost an hour

- **The unsigned Business agreement.** Blocks creating the app record, which
  blocks everything.
- **A three-day invitation expiry.** The failure looks like a broken link rather
  than an expired one.
- **The age-rating questionnaire.** Apple required responses by 31 January 2026
  to avoid interruption "when submitting your app updates". *Whether an
  unanswered questionnaire blocks internal TestFlight specifically, I could not
  confirm.* It is a two-minute form under App Information; fill it in while
  creating the record rather than finding out.
- **Promising it to someone on iOS 16, or on a managed Apple Account.** Neither
  can install it, and neither failure explains itself.

## App Review's information request (October 2026)

Review may ask for a screen recording **from a physical device** (a simulator
recording is refused) plus written answers: purpose and audience, setup
instructions, external services, regional differences, regulated material.
What worked:

- Record with iOS's own Screen Recording (Control Center), starting before
  the app opens. Set Auto-Lock to Never first, or the phone sleeps mid-take.
  A boiling-water start at Soft needs no egg and runs about six minutes; a
  second clip for the alarm and the feedback is fine.
- **App Store Connect's upload refuses `.MOV` / `.MP4` in capitals**, the way
  the iPhone names them. Rename to a lowercase extension and it is accepted.
- Paste the written answers into the reply and into App Review Information →
  Notes, so they travel with later submissions. The external services answer
  names opt-in sharing to this site (Netlify) and Apple's App Attest.
