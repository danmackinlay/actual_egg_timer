# DEVELOPING.md — building, checking and reviewing Actual Egg Timer

How to build the apps, run the checks, review the words and drive the web app
end to end. The rules for working here are `CLAUDE.md`; the model is
`README.md`; the iOS app's own build and signing are `ios/README.md`.

## Running it

```
npm install
npm run typecheck  # tsc, checking only: core without DOM or Node, the app without Node, the rest
npm test           # the type check, then node --test
npm run verify     # the gate: typecheck, test, validate, copy:literals, copy:keys, fixtures:check and swift test
npm run validate   # prints the validation table in README §7; fails if a check does
npm run fixtures   # regenerates fixtures/ from the TypeScript core
npm run conformance      # fixtures unchanged, then the Swift core against them
npm run decide     # measures the choice of cook time (studies/decide.ts)
npm run identifiability  # is h separable from alpha? (README §11.2)
npm run rank       # how many parameters can feedback move? (INFERENCE.md §2)
npm run probe      # is a probe thermometer worth an egg? (README §11.3)
                   # (these four, and studies/shape-study, are in studies/, run only by hand)
npm run eggs -- pull|simulate|emulate   # the population fit's data (fit/README.md)
npm run population -- literature        # writes the literature's fixtures/population.json
npm run copy:literals    # no Swift literal is words
npm run copy:queue       # the words not yet approved, and stale or missing twins (LANGUAGE.md §3)
npm run copy:review      # the same, as copy-review.html, to read on a phone
npm run copy:approve -- <key…|--all>   # stamp today's English as approved
npm run copy:snapshot -- capture <out.json>   # the web app's strings, rendered (headless Chrome)
npm run copy:snapshot -- compare <before.json> <after.json>
npm run build:site # the deployable tree, in _site/
npm run serve:site # static server on :8080, _site/
npm run serve:dev  # _site/ and the sharing endpoint, on a store in memory, on :8888
npm run e2e        # the web app driven end to end in headless Chrome (below)
```

Nothing is compiled to run: Node runs the tests, tools and studies from their
`.ts` sources, stripping the types itself, and every import names its source
(`./x.ts`). `tsc` only checks, over three configurations (`tsconfig.core.json`,
`tsconfig.app.json`, and `tsconfig.json` for the tests, tools, server and
studies); `npm test` runs it first. `npm run build:site` bundles the app with
esbuild from the same sources.

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
(`.github/workflows/verify.yml`) runs `verify`'s steps and `npm run
test:slow`, `swift test` and `ios:build`, `ios:e2e`, the fit's tests and `e2e`,
each a job of its own.

There is nothing else to configure. `netlify.toml` carries the settings the host
needs, and the build is esbuild plus a few copies (`tools/buildSite.mjs`), with
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
load. `netlify.toml` says why. The built site also has a service worker: `tools/precache.mjs` writes
`sw.js`, listing every file with its SHA-256, and once a browser has it the app
opens with no signal, from one build kept whole. A new build takes over only
between cooks (`src/ui/offline.ts`), and deleting `sw.js` takes the worker out.

`tools/egg-section.html` (`egg-lab` in `.claude/launch.json`) plays a whole
cook in cross-section from core's `src/core/section.ts`, how set and how hot,
with the heat map the owner set aside beside it (`DECISIONS.md` 52).

`src/core/` has zero dependencies, no DOM, no `Date`, no I/O and no `async`. It is plain
interfaces and top-level functions with explicit loops, which is deliberate: it is meant
to port to Swift essentially unchanged.

## Reviewing the words

Every word either app shows is a key in `copy/en.json`, and what the owner
has approved is recorded per key (`test/data/copy-review/approved.json`), so
the words not yet read are a list the tools make, not one anybody keeps.
The rules the words are held to, and the machinery, are `LANGUAGE.md` §3.

1. **See what is waiting.** `npm run copy:queue` prints every key changed,
   added or removed since it was approved, with both Englishes and the apps
   that show it, and the 1750 twins that are stale or missing.
2. **Read it on a phone.** `npm run copy:review` writes `copy-review.html`,
   one file with no script and no network: for each key, the approved
   English against today's word by word, the 1750 twin, the US English, the
   surface's length budget against the longest rendering, and which apps
   say it. Send it to the phone (AirDrop, or open it from a synced folder).
3. **Read it in place.** A string is judged where it appears, in the apps,
   not only in the table (`UI.md` §6). `npm run copy:snapshot -- capture
   <out.json>` renders every web screen the copy scenarios reach, for a
   read of every string rather than only the queue's.
4. **Change what is wrong** in `copy/en.json` (and its 1750 twin, or leave
   the twin to lag), then `npm run fixtures`.
5. **Approve what is right**: `npm run copy:approve -- <key…>`, or `--all`
   for the whole queue, and commit `test/data/copy-review/`. A 1750 twin is
   stamped with `--translation en-x-1750 <key…>`. Approval is the owner's
   word; no script or agent gives it.

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
time and its limits, Settings' water), a correction at Done and the slider
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

The copy capture runs on the same harness. Its scenarios
(`tools/copyScenarios.ts`) are e2e scenarios named `copy/…`: settings
planted, the app opened on the development clock stopped at 7:30 on a
Saturday in London (the time zone pinned), its one random draw seeded
(`?seed=`), and every word on screen, visible or not, captured after the
boot and after each step, once the page is idle. `npm run copy:snapshot --
capture <out.json>` writes those words, and `compare` proves two builds
render the same ones; `npm run e2e` runs them too, so a step that no longer
reaches its state fails there. The whole suite takes about
six minutes, so it is not in `npm run verify`; CI runs it as a job of its
own on Linux (`.github/workflows/verify.yml`, `e2e`), and a failing scenario
fails the run.

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
ahead on the audio clock, follow it. While it is on, and in that browser
until Forget everything, sharing sends nothing, so no egg cooked on it
reaches a server. On the live site the clock is `Date.now()`
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
stopped clock: the address check, and sharing, which sends nothing on
the development clock and is checked on the real one. `E2E_CPU_THROTTLE=6`
slows every page six times (DevTools' CPU throttling); with every core
busy as well, the suite passes as it does on a quiet machine.
