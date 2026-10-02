# RELEASING.md — getting the app onto other people's phones

TestFlight, for a handful of family members. Signing for a development build is
`ios/README.md`'s **Signing** section and is not repeated here; this file starts
where that one stops, at the point where somebody other than you needs the app.

**Internal testing is the whole answer.** No review, over the air, and once it
is set up a new build reaches everyone without you opening App Store Connect
again. Everything below is either one-time setup or the four commands you repeat.

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

The upload succeeds first, so you find out at the end. `ios/README.md` already
records the tell — a profile named for the bundle ID rather than
`iOS Team Provisioning Profile: *`.

Automatic signing will create the identifiers for you on demand, but it will not
invent the **capability**: that is a server-side setting, and it is why
`ios/README.md`'s signing step 3 exists.

**This is currently unfixed on this machine, and a trial archive proves it.**
Running the step-3 archive today signs the two targets differently:

```
EggTimerWidget.appex   iOS Team Provisioning Profile: *
Actual Egg Timer.app   iOS Team Provisioning Profile: name.danmackinlay.actualeggtimer
```

The app has an explicit profile; the widget fell back to the wildcard, because
`name.danmackinlay.actualeggtimer.widget` has never been registered. Upload that
and TestFlight takes the build and then refuses to distribute it. Register the
widget identifier before the first upload and this goes away.

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

Two upload prerequisites are committed and verified in a built app, so they are
listed here only so nobody removes them as clutter:

- **`ios/App/PrivacyInfo.xcprivacy`** — `UserDefaults` is a required-reason API
  and this app uses it in `Store.swift`, `Calibration.swift`, `Cook.swift` and
  `LanguageChoice.swift` (and `Screenshots.swift`, in Debug builds only).
  Reason `CA92.1`, not `1C8F.1`, because there is no App Group. Apple states this
  as an upload requirement; in practice it has often arrived as an `ITMS-91053`
  email after the fact, which is a slow way to learn it.
- **`INFOPLIST_KEY_ITSAppUsesNonExemptEncryption: NO`** in `project.yml`. The
  app's one network call, sharing's, is HTTPS through `URLSession`, which is the
  operating system's encryption and exempt, so NO ("no non-exempt
  encryption") is still the true answer. Without this, every single build
  arrives as **Missing Compliance** and has to be answered by hand before anyone
  can install it.
- **The privacy manifest's collected data**: sharing's records (Other Data
  Types) and its random id (Device ID), neither linked to the user nor used for
  tracking, for App Functionality. They must match the App Privacy answers
  below.

### 6. For a public link: the privacy policy, and the privacy answers

Internal testing needs neither of these. A **public TestFlight link** is
external testing, and App Store Connect will not open one without a
**privacy policy URL** (the owner met this on 2 October 2026; it goes in the
TestFlight tab's **Test Information**, and the App Store asks for it again
under **App Privacy**):

    https://actualeggtimer.netlify.app/privacy

It is `privacy/index.html`, served by the web app's Netlify site, where the
opt-in collection's endpoint will live (`DECISIONS.md` 51). It is plain
English and outside the copy catalogue; every claim on it was checked against
the code, so a change to what either app keeps or sends changes that page
first.

The **App Privacy** questionnaire's answer changed with E6, sharing (the
answer was Data Not Collected until then). Apple counts data as collected
when it leaves the device for the developer to keep, and opt-in collection is
still collection: the exemption for optional data covers data the user
chooses to provide each time, and sharing sends every egg once it is on. So,
in App Store Connect, **App Privacy**:

- **Do you or your third-party partners collect data from this app?** Yes.
- **Other Data → Other Data Types**: collected; used for **App
  Functionality**; **not linked** to the user's identity; **not used for
  tracking**. (Each egg: how it was cooked and how the cook said it came out.)
- **Identifiers → Device ID**: collected; **App Functionality**; **not
  linked**; **not tracking**. (The random id made on the phone, which groups a
  cook's eggs and lets them be deleted. It is not the advertising identifier
  and not derived from anything.)
- Nothing else: no contact info, location, user content, usage data or
  diagnostics.

These are the owner's answers to give, and they match
`ios/App/PrivacyInfo.xcprivacy`, which Xcode's privacy report reads. Crash
reports and App Analytics that Apple passes on from people who opted in to
share them are Apple's to disclose, not the app's ("You are not responsible
for disclosing data collected by Apple", Apple's App Privacy Details page).

---

## Every release

### 1. Bump the build number

`CURRENT_PROJECT_VERSION` in `ios/project.yml`. A build string can be uploaded
exactly once; re-using one is rejected **after** the whole archive-and-upload
cycle, which is a slow way to discover a one-line edit.

Both targets read the project-level setting, so the app and the widget cannot
drift apart. Do not "simplify" those two lines out — an extension whose version
disagrees with its host app is rejected at upload.

### 2. Regenerate, and mean it

```sh
cd ios && xcodegen
```

**This is the step that bites.** The `.xcodeproj` is generated and gitignored, and
so are `Widget/Info.plist` and `App/Info.plist`. A new source file added since the last generation
simply is not in the target — which shows up as `cannot find X in scope` on a
tree that a moment ago compiled fine. It has already happened once in this repo's
history. Make it the first line of any release script.

### 3. Archive

```sh
xcodebuild -project ActualEggTimer.xcodeproj -scheme ActualEggTimer \
  -destination 'generic/platform=iOS' -configuration Release \
  -archivePath build/ActualEggTimer.xcarchive \
  -allowProvisioningUpdates archive
```

### 4. Export straight to App Store Connect

`ios/ExportOptions.plist`:

```xml
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>L4D3TWC3A4</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>uploadSymbols</key><true/>
</dict>
```

```sh
xcodebuild -exportArchive \
  -archivePath build/ActualEggTimer.xcarchive \
  -exportOptionsPlist ExportOptions.plist \
  -allowProvisioningUpdates
```

`manageAppVersionAndBuildNumber` **defaults to YES**, and that default is wrong
for this repo: Xcode silently rewrites the build number inside the archive, so
the number in `project.yml` and the number App Store Connect saw immediately
disagree — in a project regenerated from `project.yml`, with nowhere for the
rewritten value to live. Set it false and own the number yourself.

This needs an Apple Account in Xcode's Accounts pane, or an App Store Connect API
key via `-authenticationKeyPath` / `-authenticationKeyID` /
`-authenticationKeyIssuerID`. `notarytool` has nothing to do with any of this —
notarisation is a macOS Developer ID concept.

Uploading with Xcode's GUI works too, but its "Manage version and build number"
checkbox and its Signing & Capabilities editing both write into a project file
that the next `xcodegen` deletes. Script it instead.

### 5. Check the entitlement survived

```sh
codesign -d --entitlements - --xml \
  'build/ActualEggTimer.xcarchive/Products/Applications/Actual Egg Timer.app' \
  | grep time-sensitive
```

A build that merely succeeded proves nothing here. If the App ID does not grant
the capability, the entitlement is **dropped from the signature rather than
failing the build** — so the app installs, runs, and quietly loses the ability to
cut through a Focus mode. Which is the alarm. Which is the reason this is an app
and not a bookmark.

Run it against the **Release archive**, not a Debug device build.

### 6. Wait for the email

Processing takes minutes, occasionally an hour. With automatic distribution on,
the family's phones get it without you doing anything else.

---

## The 90-day cliff

A build is installable for **90 days**. After that App Store Connect shows it as
**Expired** and testers can no longer install it.

*What the tester sees is not documented by Apple and I could not confirm it.*
From experience the build shows as expired and an installed copy stops launching
— which, for an egg timer, is a failure that lands at breakfast. Treat that as
unverified, and do not let it happen: re-upload around **day 80**. Bump, archive,
export; automatic distribution does the rest.

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

- **Not running `xcodegen`.** See step 2. The error does not mention the project
  file.
- **`manageAppVersionAndBuildNumber` left at its default.** See step 4.
- **A wildcard provisioning profile.** The upload succeeds and the build is then
  unusable. Two round trips to discover a checkbox.
- **Re-using a build string.** Rejected at the end of the cycle, never the start.
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
