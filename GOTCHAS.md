# GOTCHAS.md — things that cost an hour to find out

Each was found the slow way. Gathered from `LOGBOOK.md`, where each first
appears under its date; a new one is added here. The two met most often,
the simulator's `Slider` and `simctl … defaults`, are in `CLAUDE.md`;
releasing has its own in `ios/RELEASING.md`.

## The simulator and the iOS tools

- **A new simulator's notification centre stops answering when every core
  is busy.** With a CPU hog per core, `requestAuthorization` and
  `pendingNotificationRequests` never return, relaunch or not; half the
  cores busy is fine. Unloaded, a new device's first request comes back
  "not authorized" after about 20 s. Warm a new device up with a cook until
  its alarms are pending (`tools/iosE2e.ts` does).
- **A quick synthetic tap does not flip a SwiftUI `Toggle`; a held one
  (0.15 s) does.** Screenshots lag a tap by a frame or two, so look again
  before tapping twice.
- **A simulated tap while a scroll is still coasting stops the scroll and
  taps nothing.** Wait after a swipe.
- **A `UISlider` sends `.valueChanged` again while the finger rests, and
  once more as it lifts**, with the finger's value, not one the code set
  meanwhile.
- **The simulator's `UserDefaults` plist takes a key with a dot only
  escaped**: `plutil -insert 'sharing\.v1'`, since plutil reads the dot as
  a path.
- **`sudo xcode-select -s …` is a red herring** when the simulator
  integration says "Xcode is installed but not selected" while
  `xcode-select -p` already prints the right path: restart the desktop app.

## iOS: the build and the frameworks

- **The Xcode project is generated** (`cd ios && xcodegen`) and gitignored,
  as is `ios/Widget/Info.plist`; don't look for either in the history.
  `ios/project.yml` is the source.
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

- **A service worker outlives the server it came from.** A browser that
  opened one build on `localhost:8080` keeps it for that address, and
  another worktree served on the same port gets the old build. The page
  drops the worker when `sw.js` answers 404, but a new build takes over only
  between cooks. When localhost looks stale, unregister in the console
  (`(await navigator.serviceWorker.getRegistrations()).map((r) => r.unregister())`)
  or clear the site's data. On a simulator, Safari keeps it under
  `Containers/Data/Application/<Safari>/Library/WebKit/com.apple.mobilesafari/WebsiteData/Default/`,
  and a Home Screen web app inside its `Library/WebClips/<id>.webclip`.
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
