# DEVELOPING.md — building, checking and reviewing Actual Egg Timer

How to build the apps, run the checks, review the words and drive the web app
end to end. The rules for working here are `CLAUDE.md`; the model is
`README.md`; the iOS app's own build and signing are `ios/README.md`.

## Running it

```
npm install
npm run typecheck  # tsc, checking only: core without DOM or Node, the app without Node, the rest
npm test           # the key types and the Swift's constants written, the type check, then node --test
npm run verify     # the gate: typecheck, test, copy:keys, swift:constants, fixtures:check (each generated file committed) and swift test
npm run fixtures   # regenerates fixtures/ from the TypeScript core
npm run swift:constants  # the Swift core's constants, written from the TypeScript's; the app's colours, from styles.css
npm run conformance      # fixtures unchanged, then the Swift core against them
npm run decide     # measures the choice of cook time (studies/decide.ts)
npm run identifiability  # is h separable from alpha? (README §11.2)
npm run rank       # how many parameters can feedback move? (INFERENCE.md §2)
npm run probe      # is a probe thermometer worth an egg? (README §11.3)
                   # (these four are in studies/, run only by hand)
npm run eggs -- pull|simulate|emulate   # the population fit's data (fit/README.md)
npm run population -- literature        # writes the literature's fixtures/population.json
npm run copy:review      # the words changed since the approved commit, as _dev/copy-review.html
npm run copy:edit        # the owner's editor for the words, in his browser on 127.0.0.1 (below)
npm run copy:edit:e2e    # that editor driven in headless Chrome against a scratch clone
npm run copy:approve [-- <commit>]   # record HEAD's words (or <commit>'s) as approved (LANGUAGE.md §3)
npm run build:site # the deployable tree, in _site/
npm run serve:site # static server on :8080, _site/
npm run serve:dev  # _site/ and the sharing endpoint, on a store in memory, on :8888
npm run e2e        # the web app driven end to end in headless Chrome (below)
npm run ios:build  # the iOS app built, Debug and Release, and no literal in SwiftUI's text calls (tools/iosBuild.ts)
npm run ios:e2e    # the iOS app tapped by its UI tests on two simulators (ios/README.md)
```

Nothing is compiled to run: Node runs the tests, tools and studies from their
`.ts` sources, stripping the types itself, and every import names its source
(`./x.ts`). `tsc` only checks, over three configurations (`tsconfig.core.json`,
`tsconfig.app.json`, and `tsconfig.json` for the tests, tools, server and
studies); `npm test` runs it first. `npm run build:site` bundles the app with
esbuild from the same sources.

The tests of the apps, their core and the server are `test/*.test.ts`; the
tests of the developer tools (the words' editor and queue, the lints, the
fixtures' comparison, the fit's import, the one version) are
`test/tools/*.test.ts`. `npm test` runs both.

Node version is pinned in `.node-version`, which nvm, fnm and Netlify all read,
so a Netlify build runs on the same Node the tests ran on. `engines.node` is a
range rather than a pin, a statement about the APIs this uses (`node:test`,
ES2022, types stripped by default from 22.18), not a tested claim: 26 is what
runs here, and what `.github/workflows/verify.yml` runs `npm run verify` on - the type checks, the
tests, fixtures identical to a fresh `npm run fixtures`, and the Swift core
against them.

The web app is live at <https://actualeggtimer.netlify.app>. Netlify builds it
from `netlify.toml` on every push and serves `origin/main`. The `og:` tags in
`index.html` carry absolute URLs at that domain, so a domain change is a
commit. There is no second host: the Vercel config was deleted (the owner: "we
can add vercel later if needed"), and git has it. CI
(`.github/workflows/verify.yml`) runs `verify`'s steps and `swift test`
and `ios:build`, `ios:e2e` and `e2e`, each a job of its own (`ios:e2e`
only on `main` and on demand, `gh workflow run verify --ref <branch>`); the fit's
tests are off until shared eggs arrive. A push that changes only documents
(`*.md`, `.claude/`, `LICENSE`) runs nothing; otherwise `verify`'s steps
always run, the macOS jobs only when the branch changed what they build,
and `e2e` only when it changed what the web serves or tests (the `changes`
job lists both). A push to `main` runs them all; a tag's push always runs,
its own check alone.

There is nothing else to configure. `netlify.toml` carries the settings the host
needs, and the build is esbuild plus a few copies (`tools/buildSite.ts`), with
no environment variables and no secrets. The one exception is the endpoint that receives shared
eggs (`INFERENCE.md` §7), a Netlify function (`netlify/functions/eggs.mts`)
that Netlify bundles from source on deploy and backs with the site's Blobs
store `eggs`, in Netlify's default region (`us-east-2`);
`@netlify/blobs` and `cborg`, which reads App Attest's CBOR, are its only runtime
dependencies, and the apps have none. Another
host would serve the site, but nothing there would answer `/api/eggs`, so
sharing would wait until the endpoint was ported; the apps keep the eggs and
retry. esbuild bundles the page, the grid worker and the service worker into
a few files under `bundle/`, each named for its contents, so they are cached
for a year, and a returning browser never runs last month's scripts against
this month's page; `copy/` keeps its filenames, so it is revalidated on every
load. `netlify.toml` says why. The built site also has a service worker: `tools/precache.ts` writes
`sw.js`, listing every file with its SHA-256, and once a browser has it the app
opens with no signal, from one build kept whole. A new build takes over only
between cooks (`src/ui/offline.ts`), and deleting `sw.js` takes the worker out.

`tools/egg-section.html` (`egg-lab` in `.claude/launch.json`) plays a whole
cook in cross-section from core's `src/core/section.ts`, how set and how hot
side by side, in the app's own colours (`src/ui/eggSection.ts`, styles.css;
`DECISIONS.md` 52).

## Reviewing the words

Every word either app shows is a key in `copy/en.json`, and what the owner
has approved is one commit (`test/data/copy-approved.txt`), so the words
not yet read are a diff the tools make, not a list anybody keeps. The rules
the words are held to, and the machinery, are `LANGUAGE.md` §3.

1. **Read what is waiting.** `npm run copy:review` writes
   `_dev/copy-review.html`, one file
   with no script and no network: every key changed, added or retired
   since the approved commit, with the approved English against today's
   word by word, the US English, and the key's note, and at its foot these
   steps 3 and 4.
2. **Read it in place.** A string is judged where it appears, in the apps,
   not only on the page (`UI.md` §6).
3. **Change them.** The owner does it himself in `npm run copy:edit`
   (below), which checks and commits each save. By hand, or for whoever
   he names it to, the steps are `CLAUDE.md`'s "To change wording".
4. **Approve the rest**: the editor's Approve, which approves the commit
   its page shows and commits the record; or `npm run copy:approve --
   <commit>`, which records the commit the review page was made from, which
   it prints, so words committed since he read it are not approved with
   it; `npm run copy:approve` records HEAD, and refuses while `copy/` has
   uncommitted changes. Commit `test/data/copy-approved.txt`. Approval is
   the owner's word; no script or agent gives it.

**The editor**, `npm run copy:edit` (`tools/copyEdit/`), is the owner's
page for the words, at his desk. It serves on 127.0.0.1 only, behind a
token new each run, and opens the page in his browser; the Host must be
the address it printed, and a write is a JSON POST from the page itself.
On the left, the queue `copy:review` shows, in its order, or any key found
by search; on the right, the chosen key: its English against what he
approved, a field per form with its placeholders, the app's rendering,
the length budget, its US line (edited, added, removed, or marked right
after the English moved), the 1750 line read only, and the note. A draft
is checked as he types by `tools/copyRules.ts`, the rules `copy.test.ts`
holds, and kept in the browser until it is saved. Saving (⌘S):

- refuses off `main`, mid-merge, or with anyone else's changes in
  `copy/` or `fixtures/`;
- refuses, too, where main has moved since the page loaded the words:
  the page lays the drafts on the words it loads again, and asks which to
  keep where someone changed an edited key;
- lays each edit on that commit by its key; adds, retires and re-argues
  no key, so a save needs only the gate for words (`DECISIONS.md` 135);
- runs `fixtures:check` and `npm test` side by side (`fixtures:check`
  again, if the first run only wrote the fixtures the words moved), in a
  scratch worktree of that commit under the system's temporary directory,
  so no one's uncommitted work is tested with the words and a failure
  leaves the checkout as it was; failed tests run again without the edit,
  to say whether it is the edit. It takes about half a minute, and the
  page says what it checked and how long it took; the Swift tests and the
  end-to-end suites run in `verify` and CI before a release
  (`DECISIONS.md` 123);
- commits the catalogues and the fixtures the words moved in that
  worktree, as "<key> in the owner's words", and moves `main` on to the
  commit with `git merge --ff-only`: the tree committed is the tree
  tested, and nothing anyone else staged goes with it. If main moved while
  the checks ran, it commits nothing, and he saves again. It never
  pushes.

Approve is off when the editor was started from an agent's shell
(`CLAUDECODE` in its environment), and the page says so. `npm run
copy:edit:e2e` drives the page in headless Chrome against a scratch clone
under the temporary directory, the one place `--scratch` lets it approve:
an edit, a straight quote held and curled, a real save and an approval,
and this checkout left as it was. It runs the tests inside, so it is not
part of `npm test`; run it when `tools/copyEdit/` changes.

## Checking the web app end to end

`npm run e2e` builds the site, serves it with the sharing endpoint on a store
in memory (`tools/devServer.ts`), and drives it in headless Chrome over the
DevTools protocol, with nothing installed beyond Chrome itself
(`tools/e2e.ts`, which runs the scenarios in `tools/e2e/`, a file for each
area beside the helpers they share, on `tools/harness.ts` and
`tools/chrome.ts`, which finds Chrome where macOS and Linux put it; `CHROME`
names another binary). Each scenario runs in a browser context of its
own and asserts on the page and on what it stored: a cold cook at sixty
times speed, a hot start, Cancel, a reload at every phase, a tab woken past
the pull, a second tab that waits and the cook moved to it, a cook too old, an egg made final, Done
after an answer and a reload, a slow hob, a cook and a log this build
cannot read dropped, the old keys swept at boot, and sharing sending only
final eggs; and the one screen's: its layout in
every phase, the egg's readings, corrections mid-cook (the owner's boiling
to cold, overdue and back, a drag that rings only on release, the start's
time and its limits, the start's panel's heat and water, the room in its
panels, Settings' altitude), a correction at Done and the slider
there, and "still in the water?". `npm run e2e -- reload one-tab-takeover` runs
those named; `node tools/e2e.ts --list` lists them; `E2E_DEBUG=1` prints
the page's text when one fails.

The harness reads the app through what it shows, what it stores, and a
test API, `window.aetTest` (`src/ui/dev/test.ts`): `snapshot()`, the page's
state as plain data, `whenIdle()`, `t(key)` and `timeOfDay(ms)`; never by
importing the app's modules, so the app can be reshaped under it, and a
build from another checkout can be driven by today's scenarios (`npm run
e2e -- --tree <dir>`, for a commit that has the test API; `tools/harness.ts`
says how). Beyond it the harness watches the platform: the sounds scheduled
on the audio clock, the writes to localStorage, and the requests, read off
DevTools' network events.

The words on screen are not captured: which key each state shows is
core's and fixtured (`fixtures/wording.json`, `copy.json`, `format.json`),
and `npm test` fails a word written into `src/ui` rather than taken from
the catalogue (`test/uiLiterals.test.ts`). The whole suite takes about
three and a half minutes, so it is not in `npm run verify`; CI runs it as a
job of its own on Linux (`.github/workflows/verify.yml`, `e2e`), and a
failing scenario fails the run.

What makes it take seconds is the development clock (`src/ui/dev/clock.ts`).
Every read of the time in `src/ui/` goes through `src/ui/now.ts`, which is
`Date.now()` unless the development clock has put itself there. On a page
served from `localhost` or `127.0.0.1` by the harness's server
(`tools/devServer.ts`, as `npm run serve:dev` runs it), and nowhere else,
`src/ui/main.ts` loads the development tools (`src/ui/dev/`: the clock and
the test API) by a dynamic import before the app boots. `npm run build:site`
builds them as a file of their own, sharing the app's modules, and leaves it
out of the site, in `_dev/`, which that server serves over `_site/`. There, `?clock=60` runs it sixty
times fast, `?clock=0` stops it, `?at=+7m40s` or `?at=-15m` sets it ahead or
behind and `?at=2026-10-08T07:30:00Z` to a moment, and `?clock=off` puts it
back; it is kept for the tab across a reload, a red mark in the corner shows
it, and `aetClock.shift('+20m')`, `aetClock.set(moment)` and
`aetClock.speed(x)` move it from the console. The pull's beeps, scheduled
ahead on the audio clock, follow it. Sharing from such a page goes to that
server's store in memory, and the page's log is its origin's own, so no egg
cooked on it reaches the live store. On the live site the clock is `Date.now()`
(`test/now.test.ts`), and the development tools are never asked for (the
`inert-off-localhost` scenario).

What makes it independent of the machine's speed is that the clock is
stopped. A scenario steps it to the moment it means, tells the page to look
again as a tab coming back does, and asserts, so a step 2 s past the pull
lands 2 s past the pull however long the page takes to get there; at sixty
times speed the pull's 20-s grace was a third of a real second, and a slow
machine could miss it. The alarm is checked by the beeps scheduled on the
audio clock and for when, never by waiting for them to play. One span is
run: the last second before the cold cook's pull, at the real clock's
speed, to see the beeps scheduled ahead sounding as the tick reaches the
pull; the grace is its margin for a slow machine. A person's timers (a
control's 1.5-s settle, a held key) stay real, and a scenario waits for the
page to say it is idle (`aetTest.whenIdle()`: the app sets those timers,
sends its worker jobs and makes its requests through `src/ui/idle.ts`, which
counts them, so no timer, worker or request is patched) rather than for a
fixed time; a wait for something that will come gives up after a minute,
which is failure detection, not a measure. Two scenarios run off the
stopped clock: the address check, and sharing, which is checked on the
real one. `E2E_CPU_THROTTLE=6`
slows every page six times (DevTools' CPU throttling); with every core
busy as well, the suite passes as it does on a quiet machine.
