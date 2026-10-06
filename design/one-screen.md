# The one screen — a design for the owner (SHIP-0.5 C1)

`DECISIONS.md` 91: one screen for setting up and boiling, with changes
allowed after the start, and the egg in cross-section on it all the time.
`DECISIONS.md` 93: how sure I am, in words. This is a proposal, not a
record: each numbered point in §6 wants a yes, a no or a change, and nothing
in C2 or C3 is built until they have one. Proposed words are placeholders
for a named draft (`onescreen` for the screen, `certainty` for D1), to be
judged on a phone; none of them is final.

---

## 1. What the screen is today

Both apps share one layout (`UI.md` §3); the table is what each phase shows,
top to bottom. Web and iOS differ only where `UI.md` §9 says.

| Phase | Top | Readout | Middle | Bottom |
|---|---|---|---|---|
| Idle | Settings, Help | "Total time", the time, the method line, the direction and its (i), the white's line | the slider with its heading, bracket and texture note; the tappable sentence and its open panel | the slot, the hint, Start |
| Heating | (none) | "Heating", the total left (a guess), elapsed and the expected boil, the direction as at "Eggs in" | the egg in cross-section beside the frozen sentence and `cook.summary` | the hint with its (i), **Full rolling boil**, Cancel |
| Boil tapped | | the time jumps to the measured ramp's answer; the label becomes "Keep it boiling" | the egg replays from raw under the measured ramp | the button goes |
| Cooking | (none) | label, time to the pull, the method line, the direction | as Heating | the hint, Cancel |
| Pull | (none) | "Eggs out now", the grace | as Heating | the button naming the cooling, Cancel |
| Cooling | (none) | the countdown to the yolk's peak | the egg cools on | Cancel |
| Done | (none) | "Done" | as Heating | Start again; the yolk and white questions, the probe |

The web keeps its mute at the top in every phase; iOS puts its alarm status
line above Cancel. Sous-vide has no running phases at all.

**What changes at the start.** Settings and Help go. The slider goes with
its bracket and texture note, and the direction's (i) with it, since that is
about the slider. The sentence stops being tappable and moves up, gaining
`cook.summary` under it and the egg beside it. The slot loses its welcome
and its warning.

**What stays.** The time, and the line under it. The direction. The sentence,
in the same words. That is the owner's point in 91: the two screens already
say much the same thing, and the start throws away the one thing the cook
needed after it, the means to say "that's not what I did".

## 2. The one screen

One layout from setup to Done. Nothing moves to a different place at the
start; things only appear, fold or lock. The column, top to bottom:

1. **Settings and Help**, in every phase (§3 says what Settings may change
   mid-cook).
2. **The readout**: the phase label, the time, the line under it, as today.
3. **The certainty line** (`DECISIONS.md` 93), where the direction is today:
   one short line, the word itself the button that opens the interval in
   place under it (§6, points 12-15).
4. **The doneness**: open while idle (the slider, its heading, the bracket,
   the texture note), folded once the cook starts into one line, the
   doneness and the peak yolk (`cook.summary`'s words), which opens the
   slider in place again when pressed.
5. **The egg and the sentence**: the egg in cross-section to the left, the
   setup sentence beside it, the open clause's panel under both. Before the
   start the egg is a preview of what the settings aim for (§4); from the
   start it is raw and cooks along.
6. **The slot**: a refusal, a warning, the welcome, the advice link, as
   today, in every phase that has something to say.
7. **The hint and the action**: Start; Full rolling boil; the pull; Start
   again. Cancel under it while a cook runs.

Below are the phases, roughly as a 390-pt phone column. `[ ]` is a button,
underlined words are tappable clauses, `( )` is the egg.

**Idle.** As today, with the egg added beside the sentence and the certainty
line in the direction's place.

```
 Settings                                   Help
          Total time
            7:10
  about 8:00 to boil, from what I’ve timed before (i)
        A ballpark ›
 ─────────────────────────────────────────────
 Doneness                      peak yolk 65 °C
 ░░░░▒▒▒▒▓▓▓▓▓▓▓▓▓▓▓●▓▓▓▓▓▓▓▒▒▒▒▒░░░░░░░░░░░░
 Runny   Soft    Jammy     Fudgy        Hard
          └───────┴─────────┘
 white set, yolk jammy
 ─────────────────────────────────────────────
  ╭──╮   _68 g eggs_ _from the fridge_,
 │ ◉ │   _into cold water_, _then an ice bath_.
  ╰──╯
 ─────────────────────────────────────────────
 (slot)
             [   Start heating   ]
```

**Heating** (a cold start). The slider folds; the sentence stays tappable;
the egg goes back to raw.

```
 Settings                                   Help
          Heating
            6:58
   0:12 so far · about 8:00 to boil
        A ballpark ›
 ─────────────────────────────────────────────
 _Jammy · peak yolk 65 °C_ ›
 ─────────────────────────────────────────────
  ╭──╮   _68 g eggs_ _from the fridge_,
 │ ○ │   _into cold water_, _then an ice bath_.
  ╰──╯
 ─────────────────────────────────────────────
        wait for the whole surface to roll (i)
             [  Full rolling boil  ]
                    Cancel
```

**Boil tapped, then Cooking.** The same screen. The time moves to the
measured ramp's answer, as today, and the start clause locks (plain text):
the tap was the observation that the water started cold. On a hot start the
screen begins here, and the start clause stays open until the pull.

```
          Keep it boiling
            4:31
   …
 _Jammy · peak yolk 65 °C_ ›
  ╭──╮   _68 g eggs_ _from the fridge_,
 │ ◔ │   into cold water, _then an ice bath_.
  ╰──╯
                    Cancel
```

**Pull.** Everything locks but the cooling, which stays open until the cook
says the eggs are out, since until then nothing has cooled. The button names
the cooling, as today, and changes with it. The doneness line is plain text.

**Cooling and Done.** All plain text. The certainty line goes at the pull:
the time it was about has come, and the questions at Done ask the cook what
happened. The egg cools on and ends where the preview was (§4). The
questions at Done sit under the action, as today.

**Sous-vide** keeps its own idle screen and has no running phases; the egg
previews nothing there in 0.5 (§6, point 11).

## 3. Changes after the start

### Two kinds of change, and a third that is neither

- **A correction**: the cook set it wrong. "It went into cold water, not
  boiling." The past is reinterpreted: the whole cook is re-simulated from
  t = 0 under the corrected setup. The start time does not move; events
  the cook observed (a boil tap) are kept, where they still mean something.
  A correction is a pure function of the setup, so changing it back gives
  back the plan exactly: it is undoable, which matters at a hob.
- **A change now**: the cook does something new to the pot at time t. "I'm
  turning the heat off." The past stands and the schedule gains an event at
  t. Changing it back is not the same as never having done it.
- **A change of plan**: something not yet happened, the cooling and the
  yolk wanted. Nothing to reinterpret and no event: the future is solved
  again, exactly as at setup.

**The owner's case is a correction**, and so is almost everything a cook
would want to change: the start, the egg, where it rested, the pot, the
altitude are all facts of how the cook began. The only change now a pot
takes is the heat (turning it off, or back on). I propose 0.5 builds
corrections and changes of plan, and leaves the change now for later (§6,
point 1): it has no observed case yet, it needs a record field, and it is
the one change that cannot be undone by changing it back.

### Setting by setting

"Until" is the event after which the setting is plain text.

| Setting | Kind | Open until | What a change means |
|---|---|---|---|
| The start: cold water | correction | the pull | Boiling → cold, the owner's case. The egg has been in cold water since the start. The cook goes back to Heating, the time to boil is the remembered one for this water (or the slow hob's, if that is already past), and the countdown is a guess again until Full rolling boil. Always later than before. |
| The start: boiling water | correction | the boil tap | Cold → boiling. The ramp goes: the egg met boiling water at t = 0. Heating ends at once. Can put the pull in the past. After the tap, the tap itself says the water started cold. |
| The egg's mass | correction | the pull | A different egg from t = 0. Heavier is later, lighter is sooner and can be overdue. |
| Where it rested (fridge, room, custom) | correction | the pull | The egg's starting temperature from t = 0. Warmer is sooner. |
| Water | correction | the pull | The dip on a hot start, the heat-off pan's time constant, and before the boil tap the remembered time to boil (it is kept by volume). After the tap, the measured boil is remembered under the corrected volume. |
| Number of eggs | correction | the pull | The dip on a hot start. |
| Altitude | correction | the pull | The boiling point, from t = 0. |
| Heat after the boil | plan until the boil, then correction | the pull | Before the boil the two settings give the same water, so it is just a plan. After the boil (or on a hot start, from the start) it is a correction: the heat went off as the water boiled. Turning it off now is the change now, not built. |
| The lid | — | — | Not a setting, and should not become one. With the heat off the model already assumes the lid on; with the heat held the water stays at the boil either way. |
| The cooling | plan | the eggs are out | A plan for after the pull. The peak yolk moves by up to 20 °C with it, so the pull time moves too. In Pull it changes only the button and the cooling's countdown. |
| The yolk wanted | plan | the pull | The time is read off the pot's odds profile, as at setup. Levels whose time has already passed are striped as out of reach. The record keeps the level in force at the pull. |

### When a change makes the egg overdone

A correction or a change of plan can put the new pull in the past (a cold
start corrected to boiling after a long heat; a lighter egg; a softer yolk).
The cook cannot pull in the past. I propose: go straight to Pull and sound
the alarm now; the certainty line, for the moment of the pull, says what a
pull now gives ("Most likely: Fudgy"); and the cooling stays open, since an
ice bath is the one thing that still helps (§6, point 6).

A correction that leaves the white unset (a big egg, little water, heat off)
answers with the furthest the pan goes, as a mid-cook re-solve already does
(`resolveDuring`), and says so in the slot.

### What core must compute (this becomes C2)

A correction already works the way the boil tap does: both apps re-solve
from t = 0 with the ticket's setup patched (`retime` on the web, `Cook.
recordBoil` on iOS), and both replay the egg in cross-section from raw when
the ticket changes (`renderSection`, `SectionCache`). So `simulate`,
`answerAt`, `carriedSolution`, `createSection` and `advanceSection` suffice
for the physics. What is missing is the bookkeeping both apps would
otherwise write twice:

1. **`replan`** (new, pure, fixtured). Inputs: the corrected egg and setup;
   the calibration; the level in force; the lean and nudge carried from
   "Eggs in"; seconds since the start; the boil tap's time or null; the
   remembered time to boil for this water. Outputs: the time to boil to use
   (tapped, remembered, or the slow hob's; the slow-hob rule moves from both
   apps into core with it); whether the deadline is provisional; the cook
   time, never earlier than now; whether it is overdue; the cooling's
   length and whether it has a probe moment (`coolingSecondsFor`,
   `probeMomentFor`); the prediction at the time it gives (A7's certainty,
   at now when overdue). The apps then call `setDeadlines`/`startCold`-like
   transitions with it; `phaseAt` is unchanged.
2. **`openAfterStart`** (new, pure, fixtured): for a setting, the phase and
   whether the boil was tapped, whether it may change. The table above, so
   the two apps lock the same clauses at the same moment.
3. **A fresh decision on a corrected pot**: the corrected pot is a new pot,
   so its decision surface and odds profile are built as at setup, with the
   carried lean as the interim answer while they come, as idle does today.
   No new function: the existing ones with a lower bound of now on the time.
4. **For the change now, later**: `CookSetup` would gain an optional
   `heatOffAt_s`, and `bathTemperature` would let the water stand from the
   later of the boil and that time. Small in core, but it is in the record's
   setup, so a record format change and a migration (`DECISIONS.md` 81).

Nothing in `section.ts` or `protocol.ts` needs to change for corrections.

## 4. The egg in cross-section

**Before the start: the egg the settings aim for.** I propose the preview
shows the egg at the yolk's peak, which is the end of the counted cooling
(or the peak on the counter): the moment the cook reaches Done. Since a set
layer never unsets, that is the egg as it is eaten, and it is exactly the
running egg's last frame, so a cook on time watches the raw egg grow into
the picture they chose. The pull would show a yolk still climbing, less set
than what is eaten (§6, point 10).

It is the egg at the posterior mean, at the time on screen: the same egg
the countdown times and the running section draws. So where the time leans
firm (`DECISIONS.md` 80) the preview's yolk is firmer than the thumb, which
is the truth. It redraws when a solve lands, not per pixel of a drag.

**At the start** it goes back to raw and cooks along, as today. On a
correction it replays from raw under the corrected setup, so it jumps to
the egg that has actually been in that water; nothing narrates the jump.

**What core needs**: one convenience, `previewSection(egg, setup, params,
cookTime_s, whiteTarget_min)`, returning the `SectionView` at the peak, so
the two apps cannot pick different moments. It is `createSection`, then
`advanceSection` to the solve's `peakYolkTime_s` with `outAt_s` at the cook
time, then `sectionView`. About 1,600 steps of 0.5 s with 34 radii: a few
milliseconds, once per solve, not per frame.

## 5. Alarms, the Lock Screen, notifications

A re-plan, on both apps, does what the boil tap and the slow hob already do:
new deadlines from the same start, written down at once.

**iOS.**

- **Notifications.** `Alarm.schedule` cancels both and schedules the pull
  and the cooled alarm afresh; `readBackAlarms` re-reads what the system
  holds, so the status line above Cancel stays true. A pull now or in the
  past cannot be scheduled: the app is on screen (the cook just made the
  change), so `ringIfDue` rings it in the app, as it already does for any
  deadline no notification holds. The pull alarm names the cooling, so a
  change of cooling reschedules it too; so does a change of the probe
  moment.
- **The Live Activity.** The changing part (`ContentState`: stage, start,
  end, provisional) updates in place with `pushActivity(force: true)`,
  including a step back from Cooking to Heating in the owner's case. But
  the doneness, the peak yolk, the egg's mass and the cooling are
  `CookActivity`'s attributes, which ActivityKit fixes for the card's life.
  I propose moving them into `ContentState` (`ios/Shared/CookActivity.swift`,
  the widget with it), so a correction changes the card in place rather than
  ending it and starting another (§6, point 18). The card still carries no
  odds and no certainty (`DECISIONS.md` 32).
- **After the pull** nothing changes but the cooling, until the eggs are
  out; the cooled alarm is moved with it.

**The web.** No notifications: the page sounds its own alarm off the
machine's deadlines, so a re-plan is a new machine and a new ticket, both
persisted at once (`saveCook`), so a reload picks up the corrected cook.
`machine.ts` needs one new transition, a re-plan that may move Cooking back
to Heating (today only `recordBoil` and `reviseProvisional` move deadlines,
and only in Heating). The mute and `readout.restored` are unchanged.

**Both.** A correction also changes the settings, so the next cook's
sentence starts from what was done, not from the mistake. The ticket, not
the settings, is what the running cook reads, as now; a second tab's
settings still cannot touch a running cook.

**The record.** It holds the cook as corrected: the setup in force at the
pull, the level in force at the pull, and the forecast of the plan in force
at the pull, which is what the cook was last told. The fit replays the
physics from the setup, so it needs nothing more (§6, point 8).

## 6. Questions for the owner

Each has my recommendation first, then the alternative.

1. **Corrections now, changes made now later.** Every change after the
   start is a correction of how the cook began, or a change of plan for
   the cooling and the yolk. No "I'm turning the heat off now" in 0.5.
   *Or*: build it too (`heatOffAt_s`, a record field and a migration).
2. **Until when.** The table in §3: the start until the boil tap (cold) or
   the pull (boiling); the egg, the pot and the altitude until the pull;
   the cooling until the eggs are out; the yolk until the pull. *Or*:
   everything locks at the boil tap, or a minute into a hot start: simpler,
   and catches the owner's case, but not "it was a 58 g egg, not 68".
3. **The pot mid-cook.** Settings stays reachable during a cook, and its
   pot rows (water, eggs, altitude, heat) correct the running cook, under a
   line saying so (placeholder: "A change here changes the eggs cooking
   now."). *Or*: the pot locks at the start and only the sentence stays
   open.
4. **The slider folds** once a cook starts, into its summary line, which
   opens it in place; levels whose time has passed are striped. *Or*: the
   slider stays open throughout, which pushes the egg and the button about
   130 pt down at the hob.
5. **A change applies at once**, as at setup, with no confirmation: the time
   visibly moves, and changing it back undoes it. *Or*: confirm mid-cook
   changes ("Move the alarm to 7:42?").
6. **Overdue.** A change that puts the pull in the past goes to Pull and
   rings now, with the certainty line for a pull now; the cooling stays
   open. *Or*: refuse a change that would make the egg overdue.
7. **At Done**, the start and the egg are tappable once more, to correct the
   record only, with nothing re-timed, so the egg teaches the right thing.
   *Or*: nothing changes after the pull.
8. **The record** holds the cook as corrected, with the forecast of the
   plan in force at the pull, and no new field. *Or*: add a field saying it
   was corrected after the start (a format change, with a migration).
9. **The boil after a boiling → cold correction** is used for this cook,
   and remembered only if the correction came before the water could have
   boiled (the remembered time to boil), since a later tap may be late.
   *Or*: always remember it; or never.
10. **The preview shows the egg at the yolk's peak** (Done), at the
    posterior mean. *Or*: at the pull, which shows a yolk less set than the
    one eaten.
11. **The preview is one egg**, the most likely, whatever the certainty
    word; nothing in sous-vide. *Or*: draw the spread (a blurred yolk
    edge), which costs a second simulation and says what the bracket says.
12. **The certainty word sits under the time**, in the direction's place,
    and goes at the pull. *Or*: in the doneness heading, beside the peak
    yolk.
13. **Pressing the word opens the interval in place** under it, with a rule
    down its left like an (i), not an overlay (`UI.md` §4 has no popovers):
    placeholder "9 times in 10: Soft to Fudgy." and "Most likely: Jammy.",
    then the time range. The owner's "between Soft and Fudgy" puts the
    words inside running grammar, which `LANGUAGE.md` §3 rules out, hence
    the colon. The (i)'s three paragraphs ("How sure I am") move to Help,
    linked from the end of the opened line. *Or*: keep the (i) beside the
    word as well.
14. **One interval.** The bracket under the slider draws the same 90% the
    words say (5% to 95%); today it is 80% (10% to 90%), so the two would
    disagree on a phone. *Or*: the bracket goes, since the words say it;
    or it stays at 80%.
15. **The lean line retires.** When the most likely word is not the one
    asked, a second short line says so under the certainty word
    (placeholder "Most likely: Fudgy."); otherwise it is in the tap. The
    white's line stays as it is, since it is about the white. *Or*: the
    most likely word only ever in the tap.
16. **The 3/10 warning, in words.** A dotted level is one where the
    certainty is a wild guess, and the warning says so (placeholder "Soft:
    a wild guess, so far."); no dots and no warning before the first egg
    that taught something, as now. *Or*: keep the 3/10 threshold on the
    chance of the word asked, reworded only.
17. **The track's shading** is the chance of the word asked at each level,
    over the best level's: today's odds, scored on the five words rather
    than "just right". The stripes and the struck ticks are unchanged.
    *Or*: the chance of that word or a neighbour, which is flatter.
18. **The Live Activity** carries the egg, the yolk and the cooling in its
    changing state, so a correction updates the card in place. *Or*: end
    the card and start a new one on a correction.

## 7. What it costs

**Core (C2)**, TypeScript, fixtures and Swift twins, one commit each:
`replan` and `openAfterStart` (a new `src/core/replan.ts`, or in
`policy.ts`), with the slow-hob rule moved out of both apps;
`previewSection` in `section.ts`; A7's certainty, already planned; their
fixtures (`tools/fixtures/`), `fixtures/*.json`, and
`ios/EggTimerCore/Sources/EggTimerCore/` with conformance tests.

**The web (C3)**, on the modules B1 split `app.ts` into (`src/ui/app.ts`
lists them):

- `index.html`, `styles.css`: `#cookSetup` and `#setup` become one block,
  the egg beside the sentence in every phase; the slider's folded line; the
  certainty line where `#direction` is; Settings and Help kept mid-cook.
- `render.ts`: one render path instead of `renderIdle` and
  `renderRunning`, and the preview; `cook.ts` and `update.ts`: a re-plan
  on any change mid-cook.
- `machine.ts`: the re-plan transition. `ticket.ts`: a ticket from a
  corrected setup. `sentence.ts`: clauses that lock by `openAfterStart`.
  `slider.ts`: the folded state and the past levels. `eggSection.ts`: the
  preview. `phaseView.ts`, `store.ts`: little.

**iOS (C3)**:

- `ContentView.swift`: one branch instead of idle and running.
- `SetupSentence.swift` (with `CookSentence` folded into it),
  `DonenessControl.swift`, `EggSectionView.swift` (the preview),
  `ReadoutView.swift` (the certainty line), `PhaseActions.swift`,
  `SettingsView.swift` (pot rows mid-cook).
- `Cook.swift`: `replan`, on the pattern of `recordBoil`; `Planner*.swift`:
  solving against the running ticket, which today only idle does.
- `ios/Shared/CookActivity.swift`, `LiveActivity.swift`,
  `ios/Widget/CookLiveActivity.swift`: the attributes into the state.
- `Screenshots.swift`: launch arguments for a mid-cook correction.
- `npm run ios:build` for every step that touches the widget.

**Words**: the `onescreen` draft (the folded line's name to a screen reader,
the Settings line mid-cook, the overdue line) and the `certainty` draft
(D1), each with its 1750 twins and en-US entries, fitted to
`test/data/surfaces.json`. `UI.md` rewritten as built.

**The order.**

1. The owner's answers to §6.
2. C2 core: `replan`, `openAfterStart`, `previewSection`, with A7.
3. Merge `0.4.x`; B1 and B2.
4. The web: the one layout with the preview and no mid-cook changes yet,
   which is a change of looks only, driven and checked.
5. The web: changes after the start, setting by setting, the start first
   (the owner's case).
6. iOS: the same two steps, then the Live Activity's contract.
7. D1's words, then `onescreen`'s, on a phone.
8. `UI.md`, `PLAN.md`, `SHIP-0.5.md` ticked.
