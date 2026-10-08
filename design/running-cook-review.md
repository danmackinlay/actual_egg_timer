# The running cook as built — a red-team review (SHIP-0.5 C2)

A review of the web's and iOS's move onto `src/core/running.ts`
(`2a43487..e9c4208`, with the previous review's fixes before it,
`fb782dc..2a43487`), before the one screen (step 6 onwards) goes on top of
it. What it is meant to do is `DECISIONS.md` 96 to 98, `design/one-screen.md`
§3 and §4, and `design/one-screen-review.md`. It was asked to press on:
reload and relaunch at every phase; the clock's events after a tab is
backgrounded or a phone sleeps; iOS's notifications and Live Activity when
a plan's deadlines move; two web tabs sharing one stored key; records and
learning; a surface landing late or for the wrong pot; the slow hob; the
upgrade; and parity.

Core holds. A stored cook rebuilds the same plan at every phase, on both
apps; a slow hob's plan made fresh is the one the app made step by step;
an old Live Activity decodes; late surfaces are guarded. What breaks is in
the apps around core, mostly where a stored cook is picked back up: an
alarm the web no longer rings, a second tab writing its stale copy over
what the first observed, an egg logged at a reload with no forecast, a
relaunch while heating that leaves the old notifications, the slow hob's
cost, a too-old cook that runs on (and its card with it), and an egg that
becomes final while its screen still takes answers.

"Confirmed" means the case was run: core compiled from `e9c4208` (`npx
tsc`) and called in Node, or in Swift (`ios/EggTimerCore`, a release
build); the web app built from it (`npm run build:site`, served by
`python3 -m http.server`) and driven in the in-app browser (Chromium); or
the iOS app, a Debug build, driven on an iPhone 17 simulator (iOS 26.5),
the stored cook staged by editing `cookInProgress.v2` in the app's plist.
Where the web's clock was shifted, `Date.now` was wrapped from the console
and the page told to look again (a `focus` event, as a tab coming back
does); 1.2 was run again on the real clock. The posterior in Node is the
tests' `knowing({ particles: 1000, eggsLogged: 4, taste: 0.1 })` (1,000
particles, as the apps have), the egg the tests' 2 l, two eggs, class 2,
fridge, jammy (0.41), with 480 s remembered for the pan.

---

## 1. Fix before the one screen

### 1.1 A tab that wakes after the grace never rings the pull (web)

Confirmed. A cold start, the boil tapped, 7:40 to the pull. The page's
clock then moved to 25 s after the pull, as a tab's does when it comes
back after being throttled or frozen: the screen went straight to "Leave
them in the ice bath", the stored cook had `rangAt_s` and a `timeout` pull
written, and **no oscillator was created**: the pull's alarm never rang.
The egg is still in the boiling water, and the screen says it is in the
ice. (Done, when its moment came, rang: 50 beeps.)

The cause is `notice` (`src/ui/cook.ts:119`): it rings only when the phase
it reads *is* Pull, and a tab that looks again after the grace reads
Cooling (or Done) straight from Cooking. 0.4's `advance`
(`2a43487:src/ui/machine.ts:209`) stepped one phase per tick, so the first
tick after the pull always rang it, however late, and the 20 s were
counted from then. Chrome wakes a tab hidden for five minutes about once a
minute (the egg is cooking for ten), so the 20-s Pull is missed about two
times in three; a phone's browser freezes a background tab outright, so it
is missed every time. The header of `src/ui/clock.ts` says the alarm "is
scheduled ahead on the AudioContext clock" for this reason, but
`ringAlarm` schedules from now, once the tick has seen Pull.

**Fix.** In `notice`, ring the pull (urgent) on any move from Heating or
Cooking to Cooling or Done that this tab did not ring, as 0.4 did. Better,
and what `clock.ts` already claims: schedule the pull's beeps ahead on the
audio clock whenever a plan sets the deadline, and cancel them on the next
plan, so a throttled desktop tab rings on time.

### 1.2 A second tab on the same cook writes over what the first observed (web)

Confirmed, on the real clock. Tab A started a cold cook. Tab B was opened
on the site a moment later and, as a reload does, took up the stored cook
(the same `id_ms`) and asked for its surface. A tapped Full rolling boil;
A's screen said "Keep it boiling, 7:34". B's surface then landed, B planned
its own copy of the cook, which has no tap, and wrote it: the stored cook
had `boilAt_s: null`. A reloaded: **Heating again**, "Full rolling boil"
on the button, the egg boiling unwatched. With the clock shifted, B's slow
hob's moment (B never saw the boil, so it lengthens its guess) writes the
untapped copy the same way, and from 15 minutes on it does so every 10 s
(2.1).

The cause is that a tab writes the whole cook on every plan, whatever
caused it: `takeUp` calls `persistCook` (`src/ui/cook.ts:87`) after a
surface landing (`replanCook`), the slow hob's moment and every
`eventsDue`, as well as after the cook's own taps. Nothing takes up another
tab's events for the same id: `storedElsewhere` (`src/ui/update.ts:278`)
reads the stored cook only to stop asking at Done. Two tabs on one id is
not rare: it is any second visit while a cook runs, and on a phone a tab
the browser discarded and reloaded.

By reading, the same overwrite loses the cook's tap out of the pull (B's
grace runs out and writes a `timeout` pull), and writes B's `answers:
'none'` over A's `beforeReload` when A was answered while B was not at
Done. A tab's Start again logs from its own copy (`endCook`), and `logEgg`
now keeps the *last* record for an id (review 2.5), so the record can
become the copy that missed the tap out: `out_s` null, the cooling counted
from the grace's end.

The design said a reload "restores whichever tab wrote it last" (§4); it
did not foresee a tab writing back a copy it did not change, and the
events are not corrections but what the cook saw in the one pan.

**Fix.** A tab writes the cook only when its own cook changed (a tap, an
event it wrote, a correction), never after a plan alone. Before writing,
it reads the stored cook, and when that has its id it takes up the events
it lacks: the boil tapped, a pull by the cook over one by `timeout`, the
cooling ended, and an answer kept (`beforeReload` never goes back to
`none`). The same on a `storage` event for its id, so B leaves Heating
when A taps.

### 1.3 An egg logged at a reload has no forecast (both apps)

Confirmed in core and in the simulator. iOS: a cook at Done, unanswered,
its forecast decided (`leanHint_s` 21.83); every time in the stored cook
moved back two hours, and the app relaunched. The cook was dropped as too
old and its egg logged, as Start again would: `{ recommended_s: 757.68,
pulledBy: 'cook', cooled_s: 218, yolkWord: null, forecast: null }`. In
core, a hot start dropped three hours on logs `forecast: null` on both the
iOS and the web path, for ice and for the counter; Start again at Done
would have logged `{ cook_s: 472.8, yolk: [0.118, 0.653, 0.229], … }`.

The cause is that both apps plan the stored cook with no surface
(`ios/App/Cook.swift:623`, `src/ui/cook.ts:293`, whose surface cache is in
memory and empty at boot), and a plan makes a forecast only on its pot's
surface (`running.ts:721`). 0.4 kept the forecast in the stored ticket.
The LOGBOOK's drive of the web logged such an egg ("dropped as too old,
its finished unanswered egg logged (`timeout`) and sent") without seeing
the forecast missing. By reading, the shorter path loses it too: a reload
or relaunch at Done, unanswered, then an answer or Start again before the
pot's surface lands (323 ms to build on a Mac in Swift, longer on a
phone). The forecast is what the record scores the model against; an egg
without one teaches the fit nothing about how sure the app was.

**Fix.** Never log from a plan with no surface: in the too-old path build
`plan.inputs`' surface and plan again before logging, and at Done wait for
it before making the record (an answer can be held for the second it
takes). Or keep the forecast in the stored cook as a cache, as
`leanHint_s` is.

Actioned, in core: a running cook keeps the plan as it ran (`asRan`: level, cook time, nudge, forecast, peak yolk, probe moment, the model's parameters) from the first plan on the pot's surface made once it is pulled (`keepAsRan`), and `cookFactsFor` takes the record's level, time, nudge and forecast from it, or from a plan on its surface, and otherwise refuses (`'noSurface'`, or `'stale'` after a correction) rather than write `forecast: null`; the call above, relaunched three hours on with no surface, logs the forecast kept (`test/running.test.ts` 26, `running.json`); the stored cook is `aet.cook.v4` and `cookInProgress.v3`, `64c74ad`. The apps' part (keep it on every plan, hold an answer until the surface lands, plan the too-old cook on its surface) is theirs.

### 1.4 A relaunch while heating keeps the old alarms (iOS)

Confirmed in core; the app's path read. `restoreIfNeeded` adopts the
restored plan with no plan before it (`ios/App/Cook.swift:657`), so
`adopt`'s "deadlines moved" branch (`:468`), the only thing that calls
`scheduleAlarms`, never runs, and the restore's own task authorizes and
reads the alarms back but schedules nothing (`:665`). 0.4 restored the
stored deadlines, which were the ones the notifications held. Now the slow
hob is a function of the clock, so the restored plan can be a different
one:

| | the pull | the cooling's end | next plan |
|---|---|---|---|
| planned at +60 s, then the app killed (the pending notifications) | +682 s | +883 s | |
| relaunched at +652 s | +796 s | +995 s | +751 s |
| relaunched at +802 s | +860 s | +1,056 s | +815 s |

Relaunched at 652 s, "take them out" fires at 682 s while the screen and
the card say Heating with two minutes to go; relaunched at 802 s, the
pull's notification has fired and nothing is pending for the new one until
the next lengthening moves a deadline.

**Fix.** In the restore's task, `if authorized { scheduleAlarms() }`, as
`start()` does (`:282`). It is idempotent, and a deadline already past is
skipped.

## 2. Correct before building on it

### 2.1 The slow hob replays every lengthening, every 10 s (core, both apps)

Confirmed. `replan` (`src/core/running.ts:627`, twinned in Swift) starts
the slow hob from the remembered time to boil on every plan and solves
again at each lengthening it passes. For a 2 l pan remembered at 8:00 that
has not boiled by 15 minutes, each plan makes 8 solves, and from then on
it creeps, so the app plans every 10 s:

| | Node, Mac | the web app | Swift, Mac (release) |
|---|---|---|---|
| an ordinary plan | 25 ms | | 13 to 19 ms |
| a creeping plan, 15 min to 2 h heated | 220 to 320 ms | 300 to 380 ms a tick | 112 to 143 ms |
| plans in 2 h never tapped | 634, 170 s of CPU | | 469 deadline moves, about 60 s of CPU |

0.4's tick made one solve every 10 s. On the web the plan runs on the main
thread, so the countdown stalls for a third of a second every 10 s on a
Mac, and for longer on a phone. iOS plans off the main actor, but each
plan that moves a deadline also cancels and re-adds the notifications,
reads them back and pushes the card; and a relaunch plans on the main
actor (`Cook.swift:626`), 110 to 140 ms for a lengthened cook on a Mac.
The 30-ms solves are not the cost; the replay is: `answerAt` at ramps 480,
692, 805, 867, 902, 922 and 933 s, then the creeping step.

**Fix.** Keep the rule and start the replay where the last plan got to:
`replan` takes the last plan's lengthening (the ramp and when it was
lengthened) as a hint, valid while the cook and calibration are the same,
and the result is the same plan (§4 checks a fresh plan against the
step-by-step one at 199 moments). Then one solve per plan, as 0.4.

Actioned, in core: `replan`'s optional `hint`, the last plan's `slowHob` (the last lengthening that did not creep, and the start, choices, remembered time, lean and nudge, and calibration parameters and white target it was made under), taken only when `slowHobHintFits` finds each the same to the bit and the clock past it. The plan is the same to the bit at all 199 moments and at each of the 634 plans of the two-hour cook; a creeping plan makes one solve instead of eight or nine, 320 ms to 85 ms a plan (Node, 1,000 particles), 202 s to 52 s of CPU for the two hours (`test/running.test.ts` 23, 24, `running.json`), `94c2f69`. The apps pass `plan.slowHob` to their next plan.

### 2.2 A cook too old runs on, and its card with it (both apps)

- **The web never ends it in the tab that runs it.** Confirmed. A cold
  start never tapped, the clock moved on: at 2 h 1 min and at 4 h the tab
  still shows **Heating, "240:04 so far · about 120:00 to boil"**, the
  button Full rolling boil, the screen kept awake, the cook stored.
  `cookTooOld` is asked only by `restoreCook` (`src/ui/cook.ts:294`) and
  `openEggId`; nothing in `onTick` asks it, so the cook the review (1.3)
  said is abandoned at two hours runs on. A boil tapped then is taken: the
  measured ramp is four hours.
- **iOS drops it at a relaunch and leaves its card.** Confirmed in the
  simulator: `-uiScreen heating` put a Heating card on the Lock Screen; the
  stored cook moved back three hours and the app relaunched: idle, no
  `cookInProgress.v2`, and the Dynamic Island still showing the flame and
  a 12:22 countdown. The too-old branch (`Cook.swift:632`) neither cancels
  the alarms nor ends the card; the damaged-store branch above it does.
  0.4's too-old path had the same gap; what is new is the abandoned
  two-hour heat, which now ends this way and leaves a card for up to the
  system's eight hours.

**Fix.** Both apps' ticks ask `cookTooOld` and end the cook as Cancel
would; iOS's too-old branch also calls `Alarm.shared.cancel()` and
`LiveActivity.endAll()` (it is always this build's own cook, never a 0.4
card kept aside).

Actioned, the core part: `cookTooOld(plan, now_s)` is the tick's call, of the plan the tick holds (its `tooOldAt_s` moves only when the cook tells the plan something), documented so; the call above is too old at 7,200 s from a plan made at the start as from a fresh one (`test/running.test.ts` 27), `81b590a`. The apps' ticks and iOS's too-old branch are theirs.

### 2.3 An egg becomes final while its screen still takes answers (both apps)

Confirmed on the web; iOS by reading. A cook at Done, the yolk answered
(logged, folded): sharing's final count was 0. With the clock three hours
on (an hour past the end is too old), `finalEggs` gave 1: the egg is final
and goes at the next send (a boot in any tab, or the `online` event a
laptop fires on waking). The tab still showed the white's row, and
**Tender was taken**: the log's record gained `white: "tender"`. The
server would keep the egg without it. On iOS the ticker stops at Done
(`Cook.swift:748`), `eggOpen(at:)` turns false after the hour
(`AppModel.swift:52`), the next foreground sends the egg
(`ContentView.swift:151`), and the Done screen still takes a white or a
probe reading (`AppModel.answer`, `secondAnswer`), rewriting the logged
record; a first answer given after the hour logs an egg already final.

On the web the same happens when another tab presses Start again on this
cook: it clears the stored cook (`clearCook`, same id), so the egg is
final, while this tab still asks. The LOGBOOK noted half of this ("a cook
left at Done becomes final an hour later, but nothing sends it until the
next send"); the answers still taken are the defect: §4's "the server
never sees an egg that can still be corrected" does not hold.

**Fix.** A screen whose cook is no longer open (`openEggId` null for it,
by the clock or because the stored cook is gone or another) ends it as
Start again does, or at least puts the questions away, as `beforeReload`
does, and logs nothing more for it. iOS checks on becoming active and
before any answer.

Actioned, the core part: `openEggId` needs the stored cook's plan; `cookStillOpen(cook, plan, storedId_ms, now_s)` asks it of the screen's own cook and plan, with the stored cook's id (null when none is stored): false once another tab's Start again cleared it, another cook is stored, or it is too old (`test/running.test.ts` 27, `running.json`), `81b590a`. Putting the questions away is the apps'.

### 2.4 Done after an answer shows the egg re-planned on that answer (both apps)

Confirmed in the simulator; known and left by both apps' LOGBOOK entries
for the one screen, and listed here because the one screen must not build
on it. A fresh install at Done (`-uiScreen done`): "You asked for: jammy,
peak yolk 65 °C". Runny answered, the app killed and relaunched: **"You
asked for: jammy, peak yolk 58 °C"**, the sentence's peak 58 °C, the egg
drawn redder, and the line under the time from "It could come out too
soft or too firm. I can’t tell yet." to "It might miss, and if so,
probably too soft. The white might still be runny." In core, the same
cook on the prior reads 64.72 °C as it ran and 57.73 °C after the fold of
"runny" (72.73 °C after "hard"). By reading, a surface or profile landing
at Done after the fold does the same with no relaunch (`Cook.swift:503`,
`replanSoon`), and the web's `renderTarget(plan)` (`src/ui/feedback.ts:248`)
reads the plan the same way. No record is made from such a plan (iOS
scores a later probe against the logged record; the web's questions are
put away after a reload), but §4 says "the screen at Done shows the cook
as it ran", and the cook grades the yolk against the line above it.

**Fix.** Once answered, Done is drawn from the record written at the first
answer (its level and cook time), or from the plan as it stood then, never
planned again; the peak shown is stored with the cook, beside
`leanHint_s`, so a relaunch shows the same.

Actioned, in core: the cook's `asRan` (1.3) is what Done draws from, `asRanShown(cook, plan)`: the plan as it ran, kept, whatever a later plan reads; null only before it is kept (no surface yet) or after a correction not yet planned on the calibration before this egg (`asRanCorrected(cook, before, surface, now_s)`, DECISIONS.md 98's rule, the apps supplying that calibration). The call above, answered runny and folded: the plan on the new posterior moves the peak, `asRanShown` and the record do not (`test/running.test.ts` 26b), `64c74ad`. Drawing Done from it is the apps'.

## 3. Minor, parity, and for C3

- **The question about a pull the clock assumed lets the cooling run out
  under it** (core, for C3). Confirmed: a hot cook whose grace ran out
  while the phone slept, corrected to cold on waking, asks
  (`askIfStillIn`); left unanswered past the counted cooling, `eventsDue`
  writes `cooledAt_s`, the plan reads Done, and `cookEnding` says the egg
  is finished, so Start again would log it and Done would ring, with the
  question still open. "Still in" then puts it back in Heating. While a
  plan asks, `eventsDue` should write nothing and the app should show
  nothing past the question. (Neither app calls `corrected`,
  `startCorrected`, `stillIn` or `pullStands` yet, so this cannot happen
  in this build.)
  Actioned: while a plan asks, `eventsDue` writes nothing, `cookEnding`
  is not finished, and the deadlines say `asking`, so `phaseAt` reads
  Cooling where it would read Done until the question is answered; the cook
  is too old an hour after the question at the earliest. The call above now
  stays in Cooling with nothing written, and one asked after Done holds Done
  back (`test/running.test.ts` 25, `running.json`, `policy.json`),
  `3ecc07c`.
- **The countdown reads 0:00 while still heating** once the slow hob
  creeps (from about 16 minutes for this cook): iOS's big clock
  (`ReadoutView.swift:175`), the heating card counting to an end already
  past, and the web's readout. The LOGBOOK saw it on the web; §4 says no
  time left may be shown from that plan. While `plan.lengthened`, show the
  time heated, counting up, on the screen and the card.
- **The upgrade is from 0.3, not 0.4.** `main` (0.3.4, live) writes the
  same keys, `aet.cook.v2` and `cookInProgress`, and the same alarm ids, so
  the cook kept aside will in practice be a 0.3 cook. It holds on iOS from
  `main` and from `0.4.x` (below). On the web 0.3 has no service worker, so
  the first reload after the deploy is 0.5, and a cook running then opens
  idle with no timer, as `DECISIONS.md` 97 chose; a 0.3 tab left open keeps
  writing `aet.cook.v2`, which the next 0.5 load keeps aside again.
- **The old card kept at the upgrade never ends** (iOS, by reading). §4
  keeps its notifications "and the card until it ends", but nothing ends
  it: it stays at its last stage, stale from its end plus 90 s, until the
  system's eight hours or the next Start. End each old activity at launch
  with a dismissal after its end, or say so in §4.
- **One slot for an unread cook** (`aet.cook.unread`, and iOS's
  `cookInProgress.unread`): `restoreCook` keeps the old key's cook and
  then, in the same boot, an unreadable current one in the same slot, so
  the first is lost; so is any earlier one at the next unreadable cook.
  At the upgrade the slot is empty in practice (0.3 dropped a damaged cook
  rather than keeping it), so this costs nothing yet; a list, as the
  calibration's unread copies are, would keep every one.
- **Parity.** A probe reading on the web is scored against the record made
  from the plan now (`src/ui/feedback.ts:271`), on iOS against the record
  logged (`00f3b51`); the cook time is pinned at the pull, so the reading
  is the same today, but the web should read the logged record as iOS
  does. iOS judges too old on a plan with no events written and records
  from the cook without them, the web writes the events first: the records
  differ by 1.2e-7 s. Everything else above is the same on both apps but
  1.1 and 1.2 (the web's alone) and 1.4 (iOS's alone).

## 4. What holds

- **A reload at every phase rebuilds the same plan.** A cold start, the
  boil tapped at 470 s, the cook's tap out 3 s into the pull, planned
  second by second as the web does; at each phase and at 300, 600, 700,
  750, 800, 1,000 and 1,250 s the stored cook was planned again with no
  surface (a reload), and again with it (the surface landing): the pull
  (677.2 s), the cooling's end (862.0 s), the phase and the lean were the
  same each time. For iOS, the plan with no surface and the stored lean
  equals the decided time to 4 decimal places on nine cooks (hot, nudged
  +4 and −7, cold tapped and untapped, levels 0.1 and 0.9, the heat off),
  so `eventsDue` on waking writes the pull the notification rang for. The
  lean carried excludes the nudge, and `carriedSolution` adds it once.
- **A slow hob's plan made fresh is the one the app made step by step**:
  199 moments over 23 minutes of heating, the time to boil and the pull
  equal to the bit. The guess stops at 7,200 s and `slowHobAt_s` goes null.
- **Surfaces.** One for another pot or an earlier generation is not read
  (`sameDecisionInputs`; iOS's `gen` and `plan?.inputs == inputs`), one
  landing after Cancel plans nothing, and a pull that has rung is held.
  A posterior reset elsewhere ("Forget everything" in another tab) moves an
  un-rung pull by at most 11 s (taste ±0.2), inside the grace.
- **Cancel and Start again** cancel the alarms and end the card; a damaged
  current store is kept aside with its alarms cancelled and its card ended;
  a relaunch writes no second ring (`deadlineToRing`'s on-screen check).
- **Records.** One egg per `id_ms` on the web; on iOS each record is made
  once, and a second answer after a relaunch writes into the logged record
  and replays it. The boil memory is written at Cancel, Start again and
  too old, on both.
- **The upgrade on iOS**, from `main` and from `0.4.x`: `cookInProgress`
  read once, kept aside raw and deleted; its notifications and card left
  alone; the screen idle. Its unanswered egg at Done is lost, as the design
  accepts.
- **An old Live Activity decodes.** `main`'s and 0.4's attributes
  (non-optional doneness, peak yolk and mass) decode into the new optional
  ones, an older card's without cooling or language too, and an old
  `ContentState` decodes with no cook, so the widget falls back to the
  attributes. Only a downgrade fails.

---

## Appendix: the calls

Core compiled with `npx tsc` and run in Node. `cookOf()` is `startCook(START_MS,
CHOICES, 0, { '2.0': 480 }, 'metric', 'en')` with the tests' choices, and
`planned(cook, now)` is `replan` with the pot's own surface (`gridFor`).

```ts
// 1.3 a hot start, relaunched 3 h on: the apps' too-old path
const d0 = planned(hot, S + 30), now = S + 3 * 3600;
const p = replan(hot, C, null, d0.lean_s, now);                // no surface, as both apps
cookTooOld(p, now);                                             // true; cookEnding(…).finished true
recordFor(cookFactsFor(hot, p, ctx, null, null, null)).forecast; // null (web path, events written: null)
// at Done with the surface: { cook_s: 472.8, yolk: [0.118, 0.653, 0.229], … }

// 1.4 cold, never tapped: planned at +60 s, then fresh at +652 s and +802 s
replan(cook, C, null, 5.5, S + 60).deadlines;    // pull +682, cooling's end +883
replan(cook, C, null, 5.5, S + 652).deadlines;   // pull +796, +995; slowHobAt +751
replan(cook, C, null, 5.5, S + 802).deadlines;   // pull +860, +1,056; slowHobAt +815

// 2.1 the slow hob: plan whenever now passes slowHobAt_s, for 2 h
let plan = replan(cook, C, null, 0, S + 1);
for (let now = S + 1; now <= S + 7300; now++)
  if (plan.slowHobAt_s !== null && now >= plan.slowHobAt_s) plan = replan(cook, C, null, 0, now);
// 634 plans, 170 s; from 874 s heated one every 10 s at 190 to 320 ms.
// Swift: the same cook in a scratch package on ios/EggTimerCore, `swift build -c release`.

// 2.4 the prior, the egg answered runny and folded, the cook planned again: peak 64.72 -> 57.73 C

// 3 the question left open through the cooling
const p = planned(hot, S + 1), due = p.deadlines.cookEnd_s;
hot = { ...hot, events: eventsDue(hot, p, due + 60) };               // timeout pull
let c = corrected(hot, CHOICES, due + 60), q = planned(c, due + 60);  // askIfStillIn true, COOLING
c = { ...c, events: eventsDue(c, q, q.deadlines.coolEnd_s + 5) };     // cooledAt written
// planned(c, …): DONE, askIfStillIn still true, cookEnding(…).finished true

// 4 a reload: the web's planFor/plannedWithEvents with no surface, then with it,
// against the live plan at each phase: equal deadlines and lean at every point.
```

In the browser: `Date.now = () => real() + off * 1000` and
`AudioContext.prototype.createOscillator` counted, from the console.

```js
// 1.1 the boil tapped, 7:40 to go; then
off = 485; // 25 s past the pull: 0 oscillators, "Leave them in the ice bath",
           // events { rangAt_s, pulled: { by: 'timeout' } }
off = 665; // past the cooling: 50 oscillators, Done

// 1.2 aet.boil.v1 = { "2.0": 30 }; Start in tab A; open tab B; Full rolling boil in A
// (A: "Keep it boiling 7:34"); B's surface lands: stored events.boilAt_s null;
// reload A: "Heating", "Full rolling boil". No clock shifted.

// 2.2 Start (cold), then off = 1800, 3600, 7100, 7300, 14400 and a focus event:
// ticks of 296, 347, 376, 374 ms; at 14400 "HEATING | 240:04 so far · about 120:00 to boil"

// 2.3 at Done, Jammy answered: finalEggs() 0; off += 3 h: finalEggs() 1;
// Tender clicked: the log's record { yolkWord: 'jammy', white: 'tender' }
```

On the simulator (a Debug build, its own simulator, deleted after):
`-uiScreen done -noAlarmPrompt YES` (2.4: Runny, `simctl terminate`,
relaunch); `-uiScreen done`, every time in `cookInProgress.v2` moved back
7,200 s, relaunch (1.3); `-uiScreen heating`, moved back 10,800 s,
relaunch (2.2).
