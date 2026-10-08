# The one screen as built — a red-team review (SHIP-0.5 C3)

A review of the one screen in both apps (`b314a4c..cf0d175`: the web's
`onescreen-web` merge, `356d6fe`, and iOS's C3, `cf0d175`, with the
`certainty` draft as it shows there), before it goes on the owner's phone.
What it is meant to do is `DECISIONS.md` 91, 93 and 96 to 98,
`design/one-screen.md` (its "As built" notes for both apps), `UI.md` and
`SHIP-0.5.md` C and D. It was asked to press on corrections in every phase
and of every setting, commit on release, the record and learning, the alarms,
two web tabs, the egg's readings and the certainty line, accessibility and
words, and parity. The two earlier reviews (`design/one-screen-review.md`,
`design/running-cook-review.md`) are not re-reported: nothing they found has
come back.

The corrections hold where the suites drive them: every setting, every
phase, back gives back to the bit, overdue rings once and is undone within
the grace, the question holds the clock. What breaks is at the edges of a
cook's life. A second tab undoes the owner's own correction. A correction at
Done, then Start again, leaves the logged egg uncorrected and sends it. Done
can go back to Cooling after an answer. Two lines on screen read a plan that
has already learned this egg's answer, or one that has gone stale.

"Confirmed" means the case was run on this build (`cf0d175`): the web
through `npm run e2e`'s harness (headless Chrome, a stopped development
clock), or iOS through `npm run ios:e2e`'s (a Debug build on a simulator of
its own, a frozen clock, `-uiDo` taps, the debug log). Each throwaway
scenario is in the appendix. The harnesses have no expected-to-fail mode, so
none is committed. Both suites passed as they stand first: web 28 of 28,
iOS 31 of 31.

---

## 1. Fix before release

### 1.1 A second tab undoes the owner's correction (web)

Confirmed. Tab A starts a boiling-water cook. Tab B is opened on the site and
takes up the stored cook, as a second visit does, so both run the same id.
A minute in, A corrects the start to cold water, the owner's case. A is back
in Heating with its pull 213 s later. B, which never takes a correction
(`DECISIONS.md` 97), reaches its own uncorrected pull, and its grace runs
out. B writes `rangAt_s` and a `timeout` pull. A takes both up from storage,
goes straight to **Cooling, "Leave them in the ice bath"**, and rings the
pull (75 beeps), while its eggs sit in water that has not yet boiled. Its
choices still say cold.

The cause is `takeUpEvents` (`src/ui/store.ts:475`). For one id it takes the
other tab's `rangAt_s` and a `timeout` pull, whatever corrections each copy
holds. Those two are not observations. They are the clock's reading of one
plan, and B's plan is the cook A corrected away from. The cook's own taps
(the boil, the egg out) are what was seen in the one pan, and taking them up
is right.

**Fix.** Take up `rangAt_s`, a `timeout` pull and its `cooledAt_s` only from
a copy with the same start and choices (the same `correctedAt_s`, or
`sameChoices` and the same `startedAt_s`). Keep taking the boil tap and the
cook's pull from any copy. A test in `test/store.test.ts`, both ways round.

### 1.2 A correction at Done, then Start again, leaves the record uncorrected and sends it (both apps)

Confirmed on both. At Done, answered Jammy (logged and folded), the egg is
corrected to size 3 (76 g) and Start again is pressed once the correction is
committed. On the web, the log's egg stays `mass_g: 68` while the settings
say size 3. On iOS the record keeps 68 g: Start again came at line 14, and
"as ran corrected" never came. Start again commits a change still settling
before it acts (`onPrimary`, `AppModel.startAgain`), so the natural sequence
of tapping a clause and then Start again loses the correction every time.
The egg is final once the stored cook is cleared, so sharing sends the
uncorrected record.

The cause is that the record is made again asynchronously (`refreshAsRan`:
the calibration before this egg, a grid and odds in the worker or off the
main actor). It is dropped when the cook has ended before it lands
(`src/ui/cook.ts:302`, `ios/App/AppModel.swift:301`). For an *answered* egg,
ending does not wait for it: the web's `endCook` returns at once when
`answered` (`src/ui/cook.ts:472`), and iOS's `startAgain` makes nothing for
an answered egg. An unanswered egg is safe: `logFinished` and
`Cook.unansweredRecord` both plan a stale one on the calibration before it.

**Fix.** When a cook ends with its plan as it ran stale
(`!asRanCurrent(cook)`) and its egg logged, make the corrected record first
(`correctedAsRan` / `refreshAsRan`), replace the logged egg, then forget the
cook and send. That is the path `logFinished` already takes for an
unanswered egg. The web's too-old path at a reload (`restoreCook` calls
`endCook` before `refreshAsRan`) needs the same.

## 2. Correct before building on it

### 2.1 Done goes back to Cooling after an answer (both apps)

Confirmed on both. With the cooling on the counter, the egg comes out and
Done comes at once. Jammy is answered at Done, then the cooling is corrected
to an ice bath a minute later. Both apps go back to **Cooling, "Leave them in
the ice bath"**, with about 146 s to run. The web hides the answered
questions and rings Done again (50 beeps). iOS schedules the cooling's
notification again and pushes a Cooling card after it had ended the card.
The record becomes `cooled_s` 0 → 214, and the shown peak yolk drops from
65 °C to 49 °C (the ice takes the carryover away).

The design says that after Done "only the record changes" (§3). The cause is
that the counter never writes `cooledAt_s` (core, as designed for C2), so a
correction to ice counts the cooling from the out and finds its end ahead.

**Fix.** A correction made once the cook has read Done keeps Done. In
`corrected`, a pulled counter cook past its pull's end gets `cooledAt_s` (the
counted end, capped at the correction), as a cooling whose end has passed
already does. Fixture it in `running.json`.

### 2.2 Done's texture note reads a plan that knows this egg's answer (both apps)

Confirmed on both. The web: at Done, Runny answered, then the page reloaded.
The heading says "peak yolk 65 °C" and "You asked for: jammy" (the cook as
it ran), but the note under the slider says **"white set, yolk liquid"**
(before the reload: "yolk jammy"). iOS: relaunched after Runny, the heading
is 64.72 °C while the plan the note reads peaks at 57.72 °C (`shown peak
64.72 … planned peak 57.72`). The cause is `textureNote(aim?.solution ??
sol)` with `sol = plan.solution` (`src/ui/render.ts:227`) and `noteSolution
= plan.solution` (`ios/App/DonenessControl.swift:193`). Review 2.4 moved the
heading, the sentence and the egg onto `asRanShown`, but not this line.

**Fix.** Once the egg is out, the note reads the plan as it ran. Keep its
peak white in `CookAsRan` beside `peakYolk_C`, or solve the as-ran level at
the as-ran cook time on its parameters.

### 2.3 The certainty line's time range contradicts the clock mid-cook (both apps)

Confirmed on the web; iOS by reading (`ReadoutView.swift:151`, the same held
reading). Five minutes into a boiling cook, the clock says 2:44 to go while
the opened line still says "I think the right time is between 6:24 and
9:21": a range of total time, under a countdown of time left. Corrected to
cold and left heating (the owner's case), it goes stale. At 16:00 heated,
"about 16:53 to boil", it still says "between 10:02 and 12:49" with "A wild
guess", held from the first plan, because a lengthened guess asks for no
surface and the reading is kept until a decided plan replaces it
(`src/ui/render.ts:464`). While `plan.lengthened`, drop the line. Mid-cook,
say the range as clock times ("between 7:48 and 7:51"), or leave it out
after the start (the owner's to choose, A7).

## 3. Minor and parity

- **A change in hand is lost to a reload or a kill within the settle.**
  Confirmed on both. A size picked, then the page reloaded or the app killed
  inside 1.5 s, comes back uncorrected, and the settings are unwritten. There
  is no commit on `pagehide`, `visibilitychange` or `scenePhase` leaving
  `.active`. Commit there.
- **Two changes, two commits (parity).** Confirmed. On iOS a second
  control's change commits the first without it and lets the second settle
  (`edit committed mass`, then `edit committed water`). On the web, with no
  pointer (the keyboard), the first commit already includes the second
  (`src/ui/edit.ts:145`), so the second skips its settle. Nothing is lost
  or doubled on either.
- **A correction in the grace restarts the grace.** Confirmed on both. A
  lighter egg 15 s into the Pull makes the pull "now" again, so the grace
  runs to +35 s. iOS rings again; the web does not, and its beeps end at
  about +20 s, leaving "Eggs out now" silent for 15 s.
- **The question shows the white's line.** Confirmed on both: "The white
  might still be runny." under "Are the eggs still in the water?", a caveat
  about a pull the question doubts. The web's notes say "nothing past it is
  shown".
- **iOS's start limit is silent to VoiceOver** (by reading,
  `SetupSentence.swift:304`). The web's line is `aria-live`, but iOS posts no
  announcement, and at the limit a press changes no value. iOS reads none of
  the web's `spoken.*` keys, `spoken.stillIn` among them. That was so
  before C3.
- **Largest Dynamic Type (iOS, screenshot).** The question, its time and
  its line fit. The slider's heading breaks to "Done-" beside "peak", which
  at that size reads as the phase.
- **Words.** "into cold water at {time}, to the boil, heat off, lid on"
  beside "into boiling water at {time}, heat off and lid on": the two
  standing clauses differ in form for one fact, and the first is a clipped
  list of the kind `LANGUAGE.md` §3 strikes. 1750 twins are present for
  every new key.

## 4. What holds

- **Every setting, in every phase.** Egg, start, water, eggs and altitude
  (Settings), heat after the boil, cooling, start time and yolk wanted are
  each corrected, re-planned and, changed back, give the old pull back to
  the bit (both suites). A correction while the surface is still building,
  and a second one before it lands, settles to the plan a reload makes
  (`847.0` both).
- **Overdue and the grace.** A correction that makes the egg overdue rings
  once, on commit, never mid-drag. Changed back within the grace it writes
  nothing and rings again at its time.
- **"Still in the water?"** Asked after a correction past an assumed pull.
  Two corrections in a row before answering keep it (heavier, then back to
  boiling with the heavier egg, then cold again). Yes re-plans both. The
  alarms and the card follow the answer (iOS: pull rescheduled, card
  Heating).
- **iOS's commit-except.** A second control's change lands without
  applying twice, and both settings are written.
- **The record after the pull** is planned on the calibration before the
  egg, and changed back it is the first record to the bit. The slider after
  the pull changes no record.

---

## Appendix: the scenarios

Web: a copy of `tools/e2e.ts` with these added to `SCENARIOS` (helpers as
there; `clause(tab, panel)` clicks a sentence clause), run as `node
dist/tools/e2eProbe.js <name>`. iOS: `tools/iosE2e.mjs`'s helpers with these
scenarios, run as `node tools/iosE2eProbe.mjs --no-build <name>` (a simulator
it created and deleted).

```ts
// 1.1 web
a = open(STOPPED); start(a,'hot'); b = open(`${STOPPED}&at=${iso(a.now())}`)  // B: same id_ms
a.shift(60); b.shift(60); clause(a,'panelStart'); a.click('#startCold')     // A: HEATING, pull +213 s
b.shiftTo(pull0 + 25); a.shiftTo(pull0 + 25)
// B COOLING, pulled timeout; A COOLING "Leave them in the ice bath", events from B, startMode cold, +75 osc

// 1.2 web: hot, out at pull+2, Done, Jammy folded; pick('#size','3'); corrected(); click('#primary')
// log 1, egg {"mass_g":68} -> {"mass_g":68}; settings sizeIndex 3
```
```js
// 1.2 iOS: -uiDo out@pull+2,answer:jammy@cooled+5,set:size=3@cooled+10,again@cooled+12
//   "as ran corrected" index -1, again 14; egg 68 g -> 68 g
```
```ts
// 2.1 web: click('#coolCounter'); hot; out at pull+2 -> DONE; +60 s Jammy; +5 s click('#coolIce')
//   COOLING "Leave them in the ice bath", questions hidden, end 149 s ahead; then DONE, +50 osc;
//   record cooled_s 0 -> 214
```
```js
// 2.1 iOS: -cooling counter -uiDo out@pull+2,answer:jammy@pull+60,set:cooling=ice@pull+70
//   phases ["COOLING"], scheduled cook.cool, card update cooling (after "activity end done"),
//   shown peak 64.89 -> 49.13; then DONE
```
```ts
// 2.2 web: Done, read #note; Runny; reload: "white set, yolk jammy" -> "white set, yolk liquid",
//   #donenessPeak "peak yolk 65 °C" throughout
```
```js
// 2.2 iOS: -uiDo out@pull+2,answer:runny@cooled+5; relaunch at cooled+60:
//   "shown peak 64.72 level 0.410 planned peak 57.72"
```
```ts
// 2.3 web: hot, +300 s: digits 2:44, "between 6:24 and 9:21";
//   cold, never tapped, +16 min (lengthened): "16:00 so far · about 16:53 to boil",
//   "A wild guess", "between 10:02 and 12:49"

// 3 web: pick('#size','3'); reload -> mass 0.068, correctedAt null, settings sizeIndex 2
//   size change then #coolTap change with no pointer: one commit, both in it
//   lighter egg at pull+15: PULL, pull +15.0 s, 0 new osc; +40 COOLING, timeout due pull0+15
//   still in the water? asked: whiteRisk "The white might still be runny."
```
```js
// 3 iOS: set:size=3@30, terminate inside the settle, relaunch: mass 0.068, sizeIndex unset
//   set:size=3@30,set:water=1@30: two commits (mass, then water), both stored and saved
//   set:size=1@pull+15: pull +15.0 s, one more ring; +40 COOLING, timeout due pull0+15
//   -UIPreferredContentSizeCategoryName UICTContentSizeCategoryAccessibilityXXXL: screenshots
```
