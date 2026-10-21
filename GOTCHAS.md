# GOTCHAS.md — things that cost an hour to find out

Each was found the slow way; a new one is added here. The two met most often,
the simulator's `Slider` and `simctl … defaults`, are in `CLAUDE.md`;
releasing has its own in `ios/RELEASING.md`.

## The simulator and the iOS tools

- **Silent mode mutes every notification's sound, time-sensitive or
  not.** Only Critical Alerts (an entitlement Apple rarely grants) and
  AlarmKit's alarms sound through it; an audio session in `.playback`
  plays through it while the app runs. An app on screen that leaves its
  alarm to the foreground notification's `.sound` is silent on a phone
  set to silent, and a simulator, which has no silent switch, never shows
  it. A debug build's `-alarmTest <s>` rings both paths in seconds
  (`ios/README.md`).

- **A new simulator's notification centre stops answering when every core
  is busy.** With a CPU hog per core, `requestAuthorization` and
  `pendingNotificationRequests` never return, relaunch or not; half the
  cores busy is fine. Unloaded, a new device's first request comes back
  "not authorized" after about 20 s.
- **An app's first install on a new simulator never has its notifications
  authorized**: every request fails "Source is not authorized", though the
  settings say provisional, however long it waits or relaunches. Once that
  install has asked, the next install's work at once. `npm run ios:e2e`
  installs the app, launches it asking, and uninstalls it, before the tests
  install it again (`primeNotifications`, tools/iosHarness.ts); the tests
  check the alarms once, before the first (`warmUp`,
  ios/UITests/Harness.swift).
- **A quick synthetic tap does not flip a SwiftUI `Toggle`; a held one
  (0.15 s) does.** Screenshots lag a tap by a frame or two, so look again
  before tapping twice.
- **A simulated tap while a scroll is still coasting stops the scroll and
  taps nothing.** Wait after a swipe. The UI tests drag the page instead,
  and hold at the end, so it never coasts (`Run.reveal`).

## XCUITest

- **A failed UI test spends minutes on a sysdiagnose of the simulator**
  before `xcodebuild` returns, unless it is given
  `-collect-test-diagnostics never`; the result bundle and the app's log say
  what failed.
- **XCUITest cannot uninstall the app**, so a test cannot start from a fresh
  install, and an uninstall and an `xcodebuild` a test cost 50-70 s each on
  CI's runner. A debug build's `-resetState` empties the stores, removes the
  notifications and ends the card instead, at each test's first launch, and
  the suite is one `xcodebuild` (tools/iosE2e.ts).
- **A simulator's app and its UI tests share the Mac's files**: neither is
  held to its container, so a directory on the Mac (`-debugDir`) carries the
  clock's steps one way and the debug log the other, and the tests read and
  edit the stores' plist in the app's container (whose path the app logs).
- **An accessibility identifier on a container replaces its children's**,
  and an `accessibilityRepresentation`'s elements are laid out where the
  representation puts them, not where the view draws: a clause button sat
  under the sentence, so a tap on it hit something else. The sentence's
  representation leads with the sentence as drawn, whose links sit on the
  clauses. A group made with `.accessibilityElement(children: .contain)`
  keeps its children's identifiers, and its frame is that of what it shows,
  not its own.
- **`waitForExistence` costs a second even when the element is there**;
  `exists` first.
- **A `UISlider` sends `.valueChanged` again while the finger rests, and
  once more as it lifts**, with the finger's value, not one the code set
  meanwhile.
- **The plist of the app's stores in the simulator
  (`<bundle id>.stores.plist`) takes a key with a dot only escaped**: `plutil -insert 'sharing\.v1'`, since plutil reads the dot as
  a path.
- **`sudo xcode-select -s …` is a red herring** when the simulator
  integration says "Xcode is installed but not selected" while
  `xcode-select -p` already prints the right path: restart the desktop app.

## iOS: the build and the frameworks

- **The Xcode project is generated** and gitignored, as is
  `ios/Widget/Info.plist`; don't look for either in the history.
  `ios/project.yml` is the source (`ios/README.md`, "The app").
- **`INFOPLIST_KEY_*` build settings cannot express a nested dictionary.**
  `INFOPLIST_KEY_NSExtensionPointIdentifier` is accepted, silently dropped,
  and the widget builds, embeds and is never recognised. An extension needs
  a real `Info.plist`.
- **An app extension whose version does not match its host is refused at
  install.** Both read `$(MARKETING_VERSION)`.
- **The Team ID is the certificate's `OU`, not the ID in its name.** Read
  it off a provisioning profile (`security cms -D -i x.mobileprovision`,
  `TeamIdentifier`).
- **ActivityKit's `Activity` is a non-Sendable class with off-actor
  methods**, so a `@MainActor` object cannot hold one and await on it under
  Swift 6. Ask the system what is running instead of keeping the handle.
- **`@Observable` creates no dependency on a property the view never
  reads.** A counter bumped to force a redraw does nothing; countdowns are
  `TimelineView`'s job.
- **A foreground notification shows nothing by default**: no banner, no
  sound. It needs `UNUserNotificationCenterDelegate.willPresent`.
- **A notification's sound cannot be an mp3 or m4a.** Linear PCM, IMA4,
  µ-law or a-law, in aiff, wav or caf, under 30 s, or iOS plays its
  default. IMA4 at 22.05 kHz is about 330 KB for 28.6 s.
- **Interleaving a settings load with a save clobbers the load**: a
  `didSet` fired while restoring wrote the whole object back with the rest
  still at defaults. Don't save while loading.
- **A bordered SwiftUI button pads its label about 12 pt a side**, so
  `ViewThatFits` wraps sooner than the text suggests.

## The web

- **`npm run build:site` rebuilds the checkout it runs in**: its `_site/`
  and `_dev/bundle/` (the rest of `_dev/`, `copy-review.html` with it, it
  leaves), and `npm run e2e` and `verify` run it. A preview configuration
  or an e2e run aimed at the main checkout from an agent's worktree builds,
  serves and tests the main checkout's code, not the worktree's; build and
  test in the worktree.

- **A service worker outlives the server it came from.** A browser that
  opened one build on `localhost:8080` keeps it for that address, and
  another worktree served on the same port gets the old build. The page
  drops the worker when `sw.js` answers 404, but a new build takes over only
  between cooks. When localhost looks stale, unregister in the console
  (`(await navigator.serviceWorker.getRegistrations()).map((r) => r.unregister())`)
  or clear the site's data. On a simulator, Safari keeps it under
  `Containers/Data/Application/<Safari>/Library/WebKit/com.apple.mobilesafari/WebsiteData/Default/`,
  and a Home Screen web app inside its `Library/WebClips/<id>.webclip`.
- **Every worktree served on one port shares one localStorage**: `npm run
  serve:dev` is :8888 and `serve:site` :8080 in any worktree. Serve a
  branch that has bumped a store's format, then an older build, and the
  older one reads that store as nothing stored and writes over it, and
  deletes at boot any key it does not keep: the eggs and settings you made
  on the branch are gone. The e2e harness is immune (a fresh profile each
  run). Give each worktree its own port
  (`PORT=8890 npm run serve:dev`; `python3 -m http.server 8090 --directory
  _site`), or clear the site's data before switching.
- **CSS order decides a tie**: `.pair--five > button` lost to `button.fb`'s
  font size on order alone; the rule needed the class.

## The harnesses

- **On a stopped clock, two corrections at one moment share
  `correctedAt_s`**, so the second was taken as already made. The harness
  steps a few seconds between a person's taps (`later`), and `corrected`
  refuses two at one moment.
- **A patched `fetch` counts per document, not per tab.** A request sent
  just before a reload was counted against the next page; the harness
  counts a request against the document that made it.
- **A step that snaps after a fixed sleep snaps whatever the app still has
  in hand**: the decision's surface lands about a second after a cook
  starts. The harnesses wait until the app says it is idle.
- **Overlapping sounds need their start to the fraction of a sample**:
  rounded to the nearest sample, the timer's strikes came out up to 7% off
  in loudness, as their modes added or cancelled.

- **GitHub's Chrome and simulators are in en-US**, so both apps there
  default to Imperial units, US egg sizes and a 12-hour clock: a scenario
  written on a metric machine fails only in CI. Each tab is given a locale
  (`DEFAULT_LOCALE` in `tools/harness.ts`), and each iOS launch one
  (`localeArgs` in `ios/UITests/Harness.swift`); `AET_LOCALE=en-US npm run e2e --
  <names>`, or `ios:e2e`, reproduces a runner's. `--lang` does not reach the
  page on macOS. On iOS, `simctl create` copies the host's locale and its
  unit and clock preferences into the device, and those preferences win
  over `-AppleLocale` alone: under `-AppleLocale en_US` a device made on a
  metric Mac stays in Celsius. The launch gives
  `-AppleTemperatureUnit`, `-AppleMeasurementUnits`, `-AppleMetricUnits` and
  the two `-AppleICUForce…HourTime` too.

## Elsewhere

- **JAX computes in single precision unless told**
  (`numpyro.enable_x64()`): the fit's likelihood missed the app's at the
  sixth digit until it was.
- **Apple's Attestation Object Validation Guide contradicts its own sample
  twice**: step 5's "expected public key hash" is the key id, and the
  sample's bundle version is "1", not "1.0"; the sample also carries
  authenticator-data extensions without the ED flag. Read the sample's
  bytes, fetched as the page's JSON
  (developer.apple.com/tutorials/data/documentation/…json), not the prose.
- **Netlify Blobs' strongly consistent reads need `uncachedEdgeURL`** in the
  client's environment; a hand-made context for the local server must carry
  it as well as `edgeURL`.
- **The fit's pytest suite runs with**
  `uv run --project fit pytest -q fit/tests`.
