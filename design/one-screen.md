# The one screen — the design (SHIP-0.5 C1)

`DECISIONS.md` 91 asks for one screen for setting up and boiling, with
changes allowed after the start and the egg in cross-section on it all the
time. `DECISIONS.md` 93 asks for how sure I am, in words. The owner answered
the first draft of this file in `DECISIONS.md` 96:

- Every change after the start is a **correction**: "it was always like
  this". The whole cook is re-planned from its start under the new setup.
  The start time and what the cook observed are kept, and changing a
  setting back gives back the old plan exactly.
- **Everything stays open**, including after the pull, when a change
  corrects the record. A setting not yet in force (the yolk wanted, the
  cooling) only re-plans the future.
- The displays stay **as similar as possible** before and during the cook.
- The egg in cross-section shows **the live egg**, and while the cook's
  finger is on a control, **the egg those settings aim for**.
- "Heat off now" is not in 0.5. It may come later as an event, a button
  like Full rolling boil, not as a setting.

So a cook is its start, its setup and its observed events, and everything
else is derived from them each time. §3 is that model, §4 is the state that
carries it in both apps, and §7 holds the questions still open. The
red-team review of §3 and §4 (`design/one-screen-review.md`) is applied
here and in core as `DECISIONS.md` 98 settled it (marked "review" and its
finding's number where it changed the text). Proposed
words are placeholders for a named draft (`onescreen` for the screen,
`certainty` for D1), to be judged on a phone.

---

## 1. What the screen is today

Both apps share one layout (`UI.md` §3).

| Phase | Readout | Middle | Bottom |
|---|---|---|---|
| Idle (Settings, Help at top) | "Total time", the time, the method line, the direction with its (i), the white's line | the slider with its heading, bracket and texture note; the tappable sentence and its panel | the slot, the hint, Start |
| Heating | "Heating", the total left (a guess), elapsed and the expected boil, the direction as at "Eggs in" | the egg in cross-section beside the frozen sentence and `cook.summary` | the hint with its (i), **Full rolling boil**, Cancel |
| Cooking | "Keep it boiling" (or the heat-off label), time to the pull | as Heating | the hint, Cancel |
| Pull | "Eggs out now", the grace | as Heating | the button naming the cooling, Cancel |
| Cooling | the countdown to the yolk's peak | as Heating | Cancel |
| Done | "Done" | as Heating | Start again; the questions and the probe |

At the start, Settings, Help, the slider and the slot's welcome all go. The
sentence stops being tappable and the egg appears beside it. What stays is
what 91 noticed: the time, the line under it, the direction, the sentence.

## 2. The one screen

One layout from setup to Done. At the start nothing moves and nothing goes;
only the readout's words and the button change, as they do between phases
today. The column, top to bottom, in every phase:

1. **Settings and Help.** Settings' pot rows (water, eggs, altitude, heat
   after the boil) correct the running cook like the sentence does.
2. **The readout**: the phase label, the time, the line under it.
3. **The certainty line** (93), where the direction is today. The word is
   the button that opens the interval in place under it (§7, 12-15).
4. **The slider**, as at setup: its heading with the peak yolk, the track,
   the bracket, the texture note. Moving it mid-cook changes the yolk
   wanted, a plan for what has not happened yet.
5. **The egg and the sentence**: the egg in cross-section on the left, the
   sentence beside it, the open clause's panel under both. While a cook
   runs, the start clause also says when the egg went in, so that time can
   be corrected too (§7, 20).
6. **The slot**: a refusal, a warning, the welcome, the advice link.
7. **The hint and the action**: Start, Full rolling boil, the pull, Start
   again. Cancel under it while a cook runs.

Heating, as a 390-pt column. `_x_` is a tappable clause and `( )` is the egg.

```
 Settings                                   Help
          Heating
            6:58
   0:12 so far · about 8:00 to boil
        A ballpark ›
 Doneness                      peak yolk 65 °C
 ░░░░▒▒▒▒▓▓▓▓▓▓▓▓▓▓▓●▓▓▓▓▓▓▓▒▒▒▒▒░░░░░░░░░░░░
 Runny   Soft    Jammy     Fudgy        Hard
          └───────┴─────────┘
 white set, yolk jammy
  ╭──╮   _68 g eggs_ _from the fridge_,
 │ ○ │   _into cold water at 7:42_,
  ╰──╯   _then an ice bath_.
        wait for the whole surface to roll (i)
             [  Full rolling boil  ]
                    Cancel
```

Idle is the same without "at 7:42", without Cancel, with "Total time" and
Start. Cooking is the same without the boil button. In Pull, the button
names the cooling and changes with it. In Cooling and Done everything stays
tappable. A change there corrects the record (and, while the egg cools, the
cooling's end); the time does not move, because the pull has happened.

**The certainty line after the pull.** The time it was about has passed,
and Done asks the cook what they got. I propose it goes at the pull
(§7, 12).

**Sous-vide** keeps its own idle screen, starts no cook, and previews no
egg in 0.5.

## 3. The cook model

### A cook is its start, its setup and its events

- **The start**: when the egg went in, as a clock time. The cook can correct
  it ("I put them in two minutes ago").
- **The setup**: everything the sentence, the slider and Settings' pot rows
  say. It is the same value the idle screen edits.
- **The events**: what the cook observed or the clock decided. The boil
  tapped (Full rolling boil). The pull, meaning when it was due and when the
  egg came out, by the cook's tap or by the grace running out. The cooling
  ended. Each is a clock time and none is ever re-derived.

The plan is derived from these each time: the time to boil in force, the
pull, the cooling's end, the solve, the decided time, the certainty, the
record. A **correction** replaces the setup or the start. The plan is
worked out again from t = 0, and the egg in cross-section replays from raw
(both apps already replay it when the ticket changes). Since the plan is a
function of the three, changing a setting back gives back the old plan
exactly, as long as no new event happened in between.

### Settings not yet in force

The yolk wanted and the cooling are part of the setup like the rest. They
touch nothing in the past, so a correction to either moves only the future:
the pull time before the pull; the cooling's end while the egg cools; only
the record after Done. No separate kind of change is needed. "Only
re-plans the future" falls out of the replay.

### Events a correction makes meaningless

An event is kept even when the corrected setup cannot read it, so changing
back restores it.

- **A boil tap, corrected to a hot start.** A hot start has no ramp, so the
  plan does not read the tap, and the boil memory does not learn from it.
  Back to cold, and the tap is the measured ramp again.
- **A start corrected to after an event.** The start must stay before the
  first event and not later than now. A later start than that is refused
  in the start's panel, with its limit shown, as a typed mass is clamped
  (`LIMITS`). An event the setup no longer reads still counts, and the
  panel has to say why: a cook who pressed Start as the pan went on,
  tapped Full rolling boil, put the eggs in then and corrects to boiling
  cannot move the start past that tap, because changing back to cold would
  read a boil before the egg went in. The start can go to the tap itself,
  no further; the panel names the tap as the limit, so the cook does not
  read the refusal as a fault.
- **A start corrected too early.** Nor can the start go more than two
  hours (`LIMITS.timeToBoil_s.hi`) before Start was pressed: no egg boils
  that long, a cold start that has heated that long is abandoned, and it
  keeps a slip (a start in 1970, which the first build took) out of the
  plan. The limit is fixed at the press, so it does not move with the
  clock (review 3).
- **A start corrected earlier, with a boil tap.** The measured ramp is the
  tap minus the start, so it grows. That is the point of the correction.

### Corrections over time

- **Before the boil tap, cold.** The ramp is the remembered time to boil
  for the corrected water (the boil memory as it was at the start). If the
  heat has run so long that the pull would come within 45 s, the slow hob's
  rule lengthens it. That rule moves from both apps into core as a function
  of the time heating so far (`SLOW_HOB_*`).
- **Boiling → cold (the owner's case).** The cook is back in Heating. The
  countdown is a guess again until Full rolling boil, and always later than
  before. When the correction comes later than this water's remembered
  time to boil, the water may already have boiled, and a tap then would
  record a ramp too long by the delay (a jammy egg a minute over for a
  correction two minutes late). That cook is planned on the remembered
  time to boil, and on the tap only when nothing is remembered; the tap is
  not remembered either way (`DECISIONS.md` 98).
- **Cold → boiling, before the tap.** Heating ends at once, and the pull
  can already be due.
- **After the pull.** The pull's event fixes the cook time; corrections
  change only what that time did to the egg. While the egg cools, the
  cooling's end can move; one corrected after its counted end would have
  passed takes the counted time and is Done at once. After Done, only the
  record changes. The yolk wanted is not corrected after the pull: it was
  not a mistake, so the slider only previews and the record keeps the
  level the egg was pulled at (`DECISIONS.md` 98).
- **A pull the clock assumed.** When the grace runs out, the pull is the
  clock's assumption, not something the cook saw (on iOS it is written
  when the phone wakes). It stays open: a correction since it that would
  pull later, or heat again (the owner's case after the alarm), leaves
  the pull standing and asks whether the egg is still in the water. Still
  in: the pull is dropped and the cook re-planned, as before the pull. Out:
  the pull stands and the correction applies to the record. A cook's own
  tap is never asked about (`DECISIONS.md` 98).
- **After Start again.** The egg is final: logged, and sent if sharing is
  on. Nothing changes it any more. The cook can correct anything until
  then. A cook left at Done with no Start again (the tab closed, the phone
  put down) becomes final when it is too old to pick back up, an hour past
  its end (§4, review 2.1).

### When a correction makes the egg overdue

A correction can put the plan's pull in the past: a lighter egg, a warmer
start, cold corrected to boiling after a long heat, a softer yolk wanted.
Nobody can pull an egg in the past. The plan's pull is then **now**: the
screen goes to Pull and the alarm rings. The certainty line reads for a
pull now ("Most likely: Fudgy", a placeholder). The pull becomes an event
only when the cook presses out or the 20-s grace runs out. Until then,
changing the setting back cancels the pull, because nothing was observed
(§7, 6).

A correction that leaves the white unset (a big egg, little water, the heat
off) gets the longest time this pan can give, as a mid-cook re-solve does
today, and the slot says so.

### "Heat off now", later

It is an event, like the boil tap: `heatOffAt` in the events, read by
`bathTemperature` as the water standing from the later of the boil and that
time. It needs `CookSetup` to carry the time and the record to keep it, so
it brings a record format change with a migration (`DECISIONS.md` 81).
Not in 0.5. The types below leave room for it.

## 4. The state model

### What it replaces

| Today | Holds | Becomes |
|---|---|---|
| web `Ticket` (`src/ui/ticket.ts`), iOS `Cook.Ticket` | the egg, the setup and the target frozen at "Eggs in"; the lean and nudge; the outcome and forecast; peak yolk; probe moment | the cook's **setup** (correctable), the **nudge** drawn at the start, and a derived **plan** |
| web `Machine` (`src/ui/machine.ts`), iOS `Cook`'s dates | absolute deadlines, `assumedBoil_s`, `provisional`, `outAt`, `pulledBy`, `cool_s`, `targetLevel` | the **start** and the **events**; deadlines derived by `replan`, phases by `phaseAt` as now |
| web `buildSetup`/`currentEgg` (`src/ui/state.ts`), iOS `Planner.setup`/`egg` | the setup assembled from the controls, twice | core `cookSetupOf` |
| web `resolveDuring`/`retime` (`src/ui/answer.ts`), iOS `resolveCookTime` | the mid-cook re-solve with the lean carried | `replan` |
| the slow hob, in `cook.ts`'s `onTick` and `Cook.reviseIfHobIsSlow` | a stateful revision every 10 s | a function of time in `replan` |
| web `cookFactsOf` (`src/ui/eggRecord.ts`), iOS `Cook.eggRecord` | the facts for `recordFor`, off ticket and machine | core `cookFactsFor(cook, plan)` |
| iOS `CookActivity`'s attributes | the doneness, peak yolk, mass and cooling, fixed for the card's life | moved into `ContentState` |

### The types (core, `src/core/running.ts`; Swift `Running.swift`)

Plain interfaces, absence as `null`, times as epoch seconds (numbers, not
`Date`), the way `Deadlines` already has them.

```ts
/** The cook as chosen: what the sentence, the slider and Settings' pot rows
 *  say, in SI. The idle screen edits one (from the settings); a running cook
 *  holds its own, and a correction replaces it. */
export interface CookChoices {
  mass_kg: number;
  massFrom: MassFrom;           // 'class' | 'scale' | 'girth' | 'width'
  sizeTable: SizeTable | null;  // the carton, for a class
  eggFrom: EggFrom;             // 'fridge' | 'room' | 'custom'
  customStart_C: number;        // read only when eggFrom is 'custom'
  room_C: number | null;        // the room as measured (probe on), or null
  startMode: StartMode;         // 'cold' | 'hot': sous-vide starts no cook
  afterBoil: HeatAfterBoil;
  cooling: Cooling;
  waterLitres: number;
  eggCount: number;
  altitude_m: number;
  level: number;                // the yolk wanted, [0, 1]
}

/** The pull: when it was due (the alarm), and when the egg came out. */
export interface Pulled {
  due_s: number; out_s: number; by: PulledBy;
  confirmed: boolean;           // a timeout pull the cook said stands; a
                                // cook's tap always (review 1.1)
}

/** What was observed, as clock times. Never re-derived; kept when a
 *  correction makes one unread. */
export interface CookEvents {
  boilAt_s: number | null;      // Full rolling boil
  pulled: Pulled | null;
  cooledAt_s: number | null;    // the counted cooling ended; never written
                                // on the counter (C2: see below)
  rangAt_s: number | null;      // the pull rang, the egg still in: held
                                // until the cook says something new (review 3)
}

export interface RunningCook {
  /** When Start was pressed: the record's id on the web, never corrected. */
  id_ms: number;
  /** When the egg went in: correctable, never after now or the first event. */
  startedAt_s: number;
  choices: CookChoices;
  events: CookEvents;
  /** The nudge this cook drew (E8), 0 when sharing was off at the start. */
  nudge_s: number;
  /** The pans as remembered at the start, so a corrected water reads the
   *  same memory every time. */
  boilMemory: BoilMemory;
  /** What the cook was reading at the start, for the record. */
  units: Units;
  lang: string;
  boilRemembered: boolean;
  /** Since when the choices have said a cold start: the start, or the
   *  moment of a correction to cold; null while they say boiling (C2). */
  coldSince_s: number | null;
  /** The first moment the choices said boiling: the start for a cook
   *  begun hot, else the first correction to hot; null if never (review
   *  2.2). */
  firstHotAt_s: number | null;
  /** When the choices or the start were last corrected; null until they
   *  are. The plan never puts the pull before it (C2). */
  correctedAt_s: number | null;
}

/** Everything derived. Never stored as truth. */
export interface CookPlan {
  egg: Egg;
  setup: CookSetup;              // with the ramp in force
  provisional: boolean;          // the ramp is a guess
  lengthened: boolean;           // the guess, lengthened by the slow hob (C2)
  inputs: DecisionInputs | null; // the surface this plan wants (C2)
  answer: LevelAnswer;           // the mean solve, its verdict (C2)
  level: number;                 // after a snap out of the stripes
  solution: Solution;            // read at cookTime_s
  decided: DecidedAnswer | null; // null until this pot's surface is in
  lean_s: number;                // the lean and nudge in the time (C2)
  nudge_s: number;
  cookTime_s: number;            // pulled.due if pulled, or the pull that
                                 // rang; else the plan's, never before the
                                 // last correction or tap
  overdue: boolean;              // it was, so the pull is then (C2)
  askIfStillIn: boolean;         // a timeout pull a correction would move
                                 // later: ask (review 1.1)
  cool_s: number;                // cooledAt - out once cooled
  probeMoment: boolean;
  deadlines: Deadlines;          // for phaseAt, unchanged
  slowHobAt_s: number | null;    // when to plan again while heating (C2)
  tooOldAt_s: number;            // too old to pick back up (review 1.3)
  certainty: CertaintyReading | null;
  forecast: Forecast | null;
}
```

The functions, all pure and fixtured:

- `cookSetupOf(choices, timeToBoil_s): { egg, setup }`: the one assembly
  of the solver's egg and pot, replacing `buildSetup` and `Planner.setup`.
  Before the switch, both apps are checked against it, as A3 did.
- `replan(cook, c, grid, profile, leanHint_s, now_s): CookPlan`. The ramp
  is the tap if there is one on a cold start; otherwise the remembered one,
  lengthened by the slow hob's rule at `now_s`. Then `answerAt`, with
  `decideAnswer` on `grid` when it is this pot's (`grid` and `profile` are
  built off the main thread by the app, as now). While they are not in, the
  mean solve leaned by `leanHint_s` (`carriedSolution`) is used, which is
  today's interim. After that come the pull (the event, or the plan's time
  clamped to now), the cooling (`coolingSecondsFor`, `probeMomentFor`),
  `Deadlines`, and `certaintyAt` and `forecastOf` at the cook time.

  *As built (C2)*, where the code asked for more than the paragraph above:
  - **The surface comes with its inputs**: `replan(cook, c, surface,
    leanHint_s, now_s)`, `surface` a `CookSurface` (`inputs`, `grid`,
    `profile`) or null. Core reads it only when its inputs are this pot's
    (`sameDecisionInputs`), and the plan's `inputs` say which surface it
    wants, so the app asks for that one and plans again when it lands. An
    app cannot know the pot before planning, since the slow hob's ramp is
    found by solving.
  - **The slow hob's rule** is today's tick made a function of the time
    heated: whenever the carried time would pull within 45 s, and 10 s after
    the last lengthening (the start counting as one), the guess becomes the
    time heated plus 60 s. `slowHobAt_s` says when it next fires, and the app
    plans again then. Where it would fire again at once (the egg is done
    before the water boils), the guess creeps in 10-s steps without a solve
    per step; at most 100 lengthenings a plan. A lengthened guess moves with
    the clock, so its pot asks for no surface (`inputs` null) and its time is
    the carried one: building a surface a few minutes for a guess, which
    would then move the hint and the guess with it, buys nothing.
  - **The slow hob stops at two hours** (review 1.3): the guess is never
    lengthened past `LIMITS.timeToBoil_s.hi` (7,200 s, the most the app takes
    for a time to boil), and then `slowHobAt_s` is null. A cook still
    heating at two hours is abandoned: the first build lengthened it for
    ever, planning every 10 s (a 12-hour-old cook took 280 ms a plan).
  - **When a cook is too old to pick back up** is one rule in core, from
    the plan and the clock: `tooOldAt_s` (a plan field) and
    `cookTooOld(plan, now_s)`. An hour (`RESTORE_WINDOW_S`, today's web
    `RESTORE_WINDOW_MS` and iOS's bound) past the cook's end, the cooling's
    or, on the counter, the out's; or, still heating, two hours after the
    start. `readRunningCook`'s callers plan the stored cook and drop it when
    it is too old, so both apps drop it at the same moment, and an egg left
    at Done becomes final then (2.1, below). In the creeping regime the
    plan's own pull can be behind the clock while still heating, as today's
    tick's was; `phaseAt` reads Heating, and a "time left" must not be shown
    from it.
  - **The pull is never before the last thing the cook told the plan**, the
    last correction (`correctedAt_s`, a new field) or the boil tap, rather
    than never before `now_s`: a plan made again in the grace (a reload, a
    surface landing) must ring for the same pull, and one made after an
    ordinary pull's grace ran out (a phone asleep) must find it where it
    was. A tap that comes after the plan's pull pulls the egg at the tap,
    with its grace; today's machine dated that pull in the past and went
    straight through to Done.
  - **A pull already due is held** (review 3): `eventsDue` writes
    `rangAt_s` when the clock first passes the pull, and a plan holds it
    there, so a surface landing (5 to 21 s apart from the interim, across
    pots) or an egg folded in another tab never cuts the grace short or
    rings twice. Anything the cook tells the plan after it (a correction,
    the start, the answer below) clears it.
  - **A pull the clock assumed asks** (review 1.1, `DECISIONS.md` 98):
    the pull `eventsDue` writes when the grace runs out is `confirmed:
    false`. A correction made since its out that would, without it, pull
    later (or heat again) sets the plan's `askIfStillIn`, and the pull
    stands until the app has an answer: `stillIn(cook, now_s)` drops the
    pull and its cooling and re-plans as told now (a pull already past is
    now, and rings); `pullStands(cook)` confirms it, and the plan does not
    ask again. No words are in core: the app shows the question.
  - **After the pull** (review 2.3): `corrected` keeps the level in force
    at the pull, and a cooling whose counted end has passed by the
    correction is Done at once with the counted time, where the first
    build ended it at the correction (a counter corrected to ice ten
    minutes on recorded a ten-minute ice bath).
  - **The level snaps** out of the stripes, as at setup (`answerAt` with the
    retry), where today's mid-cook re-solve kept the target frozen and
    answered an unreachable one with the shortest cook that sets the white,
    carrying no lean. With the slider on screen mid-cook, the plan is the
    one setup would make for this pot.
  - **How sure, and the forecast**, are read at the cook time on this pot's
    surface, and null until it is in. After the boil tap that is the measured
    pot's, so the record's forecast is the one for the cook that ran
    (DECISIONS.md 97, 8), not the one at the start as today.
- `eventsDue(cook, plan, now_s): CookEvents`: the events the clock alone
  decides, namely the pull ringing (`rangAt_s`), the grace run out
  (`pulled`, by `timeout`, unconfirmed) and the cooling ended. The app writes them down the first time it sees them past. A
  phone asleep through the pull writes them on waking, from the same plan
  that rang.
- `startCook`, `withBoil`, `withOut`, `corrected(cook, choices, now_s)`,
  `startCorrected(cook, startedAt_s, now_s)`: the transitions. The last
  refuses a start after now or after the first event (`latestStart_s`, the
  limit the start's panel shows), an unread one included: changing back
  would read it. After the review it also refuses one more than two hours
  before Start was pressed (`earliestStart_s`, §3), and `stillIn` and
  `pullStands` answer a plan that asks (above).

  *As built (C2).* A correction takes the time it was made, for one thing
  only: `coldSince_s`, since when the choices have said cold, which is how
  `boilToRemember` tells a tap the cook was watching for from one after a
  boiling-to-cold correction made too late (DECISIONS.md 97). On the
  counter nothing is counted, so `cooledAt_s` is never written there:
  `phaseAt` already reads the pull's end as Done, and a cooling corrected
  from the counter to ice after the pull then counts from the out, rather
  than reading the out as a cooling of no length.
- `cookFactsFor(cook, plan, …): CookFacts`, for `recordFor`, with the
  level, setup and cook time as last corrected.
- `boilToRemember(cook): { litres, seconds } | null`: written to the boil
  memory when the cook ends, not at the tap, so it is the cook as last
  corrected (§7, 9).

  *As built (C2).* Both are in `running.ts`, beside the plan they read,
  rather than in `record.ts`, which `running.ts` imports. `cookFactsFor`
  takes a `RecordContext` (app, build, prior, the local day of the start as
  corrected, and the id: `id_ms` on the web, none on iOS) and the answers.
  `boilToRemember` refuses a tap the cook was told to watch for only after
  this water's remembered time to boil: corrected from boiling to cold that
  late (`coldSince_s`), or with the start corrected that much earlier, since
  the water may have boiled unseen in both. After the review (2.2) it also
  keeps `firstHotAt_s`, the first moment the choices said boiling: a tap
  made before it was made in the cold the cook began with, watched from
  the press of Start (`id_ms`), so a stray cold → hot → cold after the tap
  no longer drops it, and changing back gives back the boil memory too. The
  same test, a tap after a correction to cold made too late, has `replan`
  run that cook on the remembered time (1.2, above). `cookEnding(cook, plan, now_s)`
  is what Cancel and Start again leave: the boil to remember, and whether the
  cook was Done, so an egg to log if no answer has logged it.
- `readRunningCook(raw): RunningCook | null`: the defensive read, whole or
  nothing, as `restoreTicket` is now. It has no age check of its own: its
  caller plans the cook and asks `cookTooOld` (review 1.3).
- `previewSection(egg, setup, params, cookTime_s, whiteTarget_min)` in
  `section.ts` (§5).

  *As built (C2), then after the review:* C2 built `previewSection(egg,
  setup, params, cookTime_s, peakYolkTime_s, whiteTarget_min)`, the egg at
  the yolk's peak, and found that the yolk's dose is not all in there (the
  slider's level counts the whole carryover): a jammy (0.41) yolk read 0.34
  on the slider's scale, a fudgy (0.62) one about 0.55. `DECISIONS.md` 98
  moved it to the end of the cooling, the egg as eaten: `previewSection(egg,
  setup, params, cookTime_s, whiteTarget_min)` carries it through the whole
  carryover (`CARRYOVER_WINDOW`, 900 s past the pull), as `simulate` counts
  it, so the yolk reads the level asked (jammy 0.41 reads 0.41: 0.412 for
  the tests' 68 g egg, against the 0.34 at the peak). It is no longer the
  live egg's last frame at Done, which is the peak: a live egg carried on
  that far is the same egg (`test/section.test.ts` 7). About 2,700 steps
  for a soft-boiled egg, once per solve.

`phaseAt`, `answerAt`, `decideAnswer`, `carriedSolution`, `certaintyAt`,
`recordFor`, `createSection` and `advanceSection` are used as they are.

**What makes "back gives back exactly" true.** The plan reads the
calibration as it stands. That moves mid-cook only if another tab folds an
egg, which moves the plan by seconds; I accept that rather than store a
posterior per cook. While a pot's surface is being built, the time is the
interim one (the lean hint), and it settles when the surface lands, as it
does at setup today.

### What is stored, and under which keys

| | Key | Holds |
|---|---|---|
| web | `aet.cook.v3` (was `aet.cook.v2`) | `{ cook: RunningCook, answers: KeptAnswers, leanHint_s }` |
| iOS | `cookInProgress.v2` (was `cookInProgress`) | `{ cook, feedbackGiven, leanHint_s }` |

`leanHint_s` is the last decided lean, used only as the interim while a
surface is rebuilt after a reload. It is a cache and never truth. The
settings keys do not change: `CookChoices` is read from them
(`choicesOf(settings, region)`), and a correction writes back to them (§7,
22). The record's format does not change (`DECISIONS.md` 81).

**A 0.4 cook running at the upgrade** is a store this build cannot read, so
it goes where `DECISIONS.md` 81 already sends one: kept aside as stored
(`keepUnreadCook`, `Calibrations.keepUnreadCook`), exported with the
results, and the screen opens idle. It is not converted (§7, 24): this is
alpha (48), and the window is one cook long.

With the key bumped, nothing would read the old key (review 2.6): the web
reads only `COOK_KEY` (`store.ts`) and iOS only `savedKey` (`Cook.swift`),
so the 0.4 value would sit in storage for good. So each app reads the 0.4
key (`aet.cook.v2`, `cookInProgress`) once at launch, keeps what it finds
aside and deletes the key, as `store.ts` already drops `aet.cook.v1`.

The alarms differ by why the cook is unread. iOS updates apps in the
background, and the update kills the app, but the pending notifications
and the card's countdown survive it and are still right for the egg in the
pot. So for a cook kept aside from the 0.4 key, iOS keeps the
notifications still ahead of now (and the card until it ends): cancelling
them would leave that cook with no timer at all. Only a damaged cook under
the current key has its pending alarms cancelled and its card ended, since
nothing then knows what they ring for. The 0.4 path that logs a finished,
unanswered egg (`cook.ts`, `restoreCook`) goes with the old key, which
costs at most one egg.

### How an edit is followed

- **Every edit**, on either app, is one step: replace the cook (setup,
  start or an event), store it, `replan`, redraw. Nothing else is held.
- **When an edit is committed** (review 2.4). Not at every step of a drag:
  each would stamp `correctedAt_s`, plan again (25 to 55 ms in Node, more
  on a phone), reschedule the iOS alarms, push the Live Activity and write
  the settings, and a drag that passed through an overdue level would ring
  mid-drag. A slider or a held − or + commits on release; a tap that is
  not held commits after §5's 1.5-s settle, or at once when another
  control is touched. While the finger is down the screen shows the
  aimed-for egg (§5) from a plan of the settings under the finger, which
  stores nothing and rings nothing. Overdue is decided only on commit, by
  the plan of the committed cook.
- **A reload mid-cook (web).** Read `aet.cook.v3`, `replan` with the hint,
  drop it if `cookTooOld`, else write any `eventsDue`, and ask for the
  surface. The alarm cannot sound until a gesture, as now
  (`readout.restored`).
- **The web's second tab** (§7, 23, answered: as today). A tab runs the
  cook it started and does not take up a cook another tab started or
  edited; it re-reads only an answer at Done. The stored cook is the one
  key, so a reload restores whichever tab wrote it last, as now; the
  record's id is `id_ms`, never corrected, so a cook logged from two tabs
  is still one egg.

  Three consequences (review 2.5). *The controls read the cook.* While a
  cook runs, a tab's controls show and write `cook.choices`, never the
  settings. A correction still writes the settings for the next cook (§7,
  22), and another tab takes that up, but a settings event that arrives
  mid-cook touches only what the cook does not hold, the units, the
  language and the mute; today's `takeUpSettings` calls
  `applySettingsToDom()` whatever the phase, which would show tab A's
  correction in tab B and, with the controls writing the cook, make it B's.
  *One id, two cooks.* Both tabs write the stored cook on every correction
  and every `eventsDue`, so a reload can pick up the other tab's cook, and
  two tabs can then run the same id with different corrections. `logEgg`
  keeps the first record for an id today, which may be the uncorrected one:
  it should keep the last-corrected record for an id instead, replacing
  the one logged (the refold of §4's record section). *Which eggs are
  final* is the stored cook's id, not the tab's (below).
- **iOS notifications.** On any plan whose deadlines moved,
  `Alarm.schedule` cancels and re-adds the pull and cooled alarms (the
  pull's line names the cooling, so a change of cooling moves it too), and
  `readBackAlarms` keeps the status line true. A deadline already past is
  not scheduled. The app is on screen when the cook edits, so `ringIfDue`
  rings it there, as it does for any deadline no notification holds.
- **The Live Activity.** `pushActivity(force: true)` after each edit. With
  the description in `ContentState` (§4's table), a correction updates the
  card in place, including the owner's case, Cooking back to Heating. The
  card still carries no odds or certainty (`DECISIONS.md` 32).
- **Async solves.** Both apps already guard a solve that lands after a
  cancel (iOS's `generation`, the web's key checks). A surface or profile
  that lands mid-cook now re-plans the running cook when it is for the
  cook's pot. Today one that lands mid-cook is dropped.

### The record and the learning

The record is `recordFor(cookFactsFor(cook, plan))`, made when the cook is
answered or ends, from the cook as last corrected. A correction at Done
after an answer was given replaces the egg's record in the log and refolds
it from the posterior before it, when that is still possible: the same
conditions as `recordSecondAnswer` (no egg logged since, this page made the
fold), with a new surface for the new setup. Otherwise the log is replayed
from the prior, the path a model change already takes (`loadDecision`'s
rebuild).

**Which eggs are final** (review 2.1). An egg is final unless its id is the
stored running cook's, whichever tab asks: `openEggId(cook, plan, now_s)`
is that id, or null, and sharing sends only the others. The open egg
becomes final at Start again, which stores another cook, or when the cook
is too old to pick back up (`cookTooOld`, an hour past its end), which
covers the usual ending, the tab closed at Done. Today's `finalEggs`
(`update.ts`) held back only the egg on screen in the tab whose answers
were live, so another tab, or this one after a reload, sent the open egg,
and a later correction changed the local log but not what the server had.
On iOS, which keeps no record id, the same rule reads as: the egg of the
stored cook is not sent until it is too old or Start again. So the server
never sees an egg that can still be corrected.

### The refactor, in order

**C2, core** (TypeScript, then fixtures, then Swift and conformance; one
commit each):

1. `src/core/running.ts`: the types, `cookSetupOf`, the transitions,
   `readRunningCook`. Fixtures `tools/fixtures/running.ts` →
   `fixtures/running.json`, `test/running.test.ts`;
   `ios/EggTimerCore/Sources/EggTimerCore/Running.swift`,
   `RunningConformance.swift`.
2. `replan` and `eventsDue`, with the slow hob's rule. Fixtured cases: the
   owner's boiling → cold; cold → boiling before the tap and with a tap; an
   earlier start with a tap; overdue; a correction while cooling; one after
   Done; a heat-off pot whose white never sets.
3. `cookFactsFor` and `boilToRemember` (built in `running.ts`,
   `Running.swift`, beside the plan they read).
4. `previewSection` (`section.ts`, `Section.swift`).

**The web**, each step driven before the next:

5. The state, with no visible change and no edits mid-cook yet:
   - `state.ts`: `ticket` and `machine` become `cook` and `plan`, and
     `buildSetup`/`currentEgg` become `cookSetupOf(choicesOf(…))`.
   - `store.ts`: `aet.cook.v3`; `aet.cook.v2` read once, kept aside and
     deleted.
   - `cook.ts`: `onPrimary`, `onTick` and `restoreCook` written as events
     and `eventsDue`.
   - `machine.ts` shrinks to what `phaseAt` does not cover
     (`coolingStartsIn_s`), and `ticket.ts` goes. `RESTORE_WINDOW_MS` goes
     with it, for core's `cookTooOld`; `update.ts`'s `finalEggs` reads
     `openEggId`.
   - `answer.ts` loses `resolveDuring`/`retime`. `eggRecord.ts` calls
     `cookFactsFor`. `feedback.ts` and `phaseView.ts` read the cook and
     plan.
   - The tests `machine`, `ticket`, `store` and `phaseView` are rewritten
     to match.
6. One layout: `index.html` (`#cookSetup` folded into `#setup`), `styles.css`
   (no phase hides the controls), `render.ts` (one render path),
   `eggSection.ts` (the two readings).
7. Edits mid-cook: `input.ts`, `controls.ts`, `sentence.ts` and `slider.ts`
   write the cook's choices, committed on release or after the settle; the
   start's time panel; Settings mid-cook; `update.ts`'s `takeUpSettings`
   touches only units, language and mute while a cook runs;
   `calibration.ts` refolds a corrected egg, and `logEgg` keeps the
   last-corrected record for an id.

**iOS**, the same order:

8. `Cook.swift`: `Ticket` and `Saved` become `RunningCook` and
   `cookInProgress.v2`; `recordBoil`, `pulledOut` and `reviseIfHobIsSlow`
   become events and `replan`. `Planner.swift` gets its setup from core.
   `Planner+Solve.swift` solves for the running cook, in place of
   `resolveCookTime`. Also `AppModel.swift` (`eggsIn`), `Calibration.swift`
   (the 0.4 key read once, kept aside and deleted, its notifications still
   ahead of now kept; a damaged cook under `cookInProgress.v2` also cancels
   alarms and the card), `EggSectionView.swift`
   (its cache keyed on the cook, not the ticket) and `FeedbackPanel.swift`.
9. `ios/Shared/CookActivity.swift`, `LiveActivity.swift`,
   `ios/Widget/CookLiveActivity.swift`: the description into the state.
   `npm run ios:build`.
10. One layout and edits: `ContentView.swift` (one branch),
    `SetupSentence.swift` (with `CookSentence` folded in, and the start's
    time), `DonenessControl.swift`, `ReadoutView.swift`, `PhaseActions.swift`,
    `SettingsView.swift`; `Screenshots.swift` launch arguments for a
    correction mid-cook.

**Then the words.** D1's `certainty` and the `onescreen` draft, both apps,
1750 and en-US twins, fitted to `test/data/surfaces.json`; `UI.md`
rewritten as built.

## 5. The egg in cross-section: two readings

- **The live egg.** While a cook runs, the egg in the water now, carried
  forward a tick at a time (`advanceSection`) and replayed from raw after a
  correction, as now.
- **The aimed-for egg.** While the cook's finger is on a control (dragging
  the slider, holding a − or +), and for a moment after the last change,
  the egg the settings on screen aim for. For a tap that is not held (a
  choice in a clause's panel), that moment is all there is, so I propose
  about 1.5 s, then back to the live egg (§7, 19). The aimed-for egg is
  `previewSection` at the plan's time for the settings under the finger:
  `createSection`, then `advanceSection` through the whole carryover with
  the egg out at the cook time, then `sectionView`. That is about 2,700
  steps, a few milliseconds, once per solve rather than per frame.
- **Which moment it shows.** The end of the cooling, the egg as eaten,
  with the whole carryover in, so the yolk reads the level asked
  (`DECISIONS.md` 98). I first proposed the yolk's peak, which is Done and
  the live egg's last frame, but the dose is not all in there: a jammy
  yolk read 0.34 at its peak. A cook on time sees the live egg grow toward
  the picture they aimed for, and the last few hundredths come in on the
  plate.
- **At idle** there is no live egg. I propose it shows the aimed-for egg at
  rest, as 91 asked, and goes back to raw at the start (§7, 19).
- **It has no words**, as now. The certainty line and the sentence say what
  it shows.

## 6. Certainty on the screen

The certainty line sits under the time, in the direction's place. The word
opens, in place and not as an overlay (`UI.md` §4 has no popovers): "9
times in 10: Soft to Fudgy." and "Most likely: Jammy." (placeholders), then
the time range (A7's, the owner's to confirm). The owner's "between Soft and
Fudgy" puts inserted words inside running grammar, which `LANGUAGE.md` §3
rules out, hence the colon. The bracket, the lean line, the 3/10 warning
and the track's shading are restated in the same terms (§7, 13-17).

## 7. Questions for the owner

**Answered, 7 October 2026 (`DECISIONS.md` 96 and 97).** The owner took
every recommendation below but 23, where today's behaviour stays: each tab
runs what it started. What follows is kept as asked, for the record.

Each has my recommendation first, and the alternative after "Or".

1. ~~Corrections only~~ **Answered by 96**: every change is a correction,
   and "heat off now" may come later as an event.
2. ~~Until when~~ **Answered by 96**: everything stays open; no lock table.
3. ~~The pot mid-cook~~ **Answered by 96** ("change everything"):
   Settings stays reachable, and its pot rows correct the running cook.
4. ~~The slider folds~~ **Answered by 96** ("as similar as possible"): the
   slider stays as it is.
5. **A change applies at once**, as at setup, with no confirmation. The time
   visibly moves, and changing it back undoes it. Or confirm changes
   mid-cook ("Move the alarm to 7:42?").
6. **Overdue.** A correction that puts the pull in the past goes to Pull and
   rings now. Changing it back within the grace cancels the pull. Or refuse
   a correction that would make the egg overdue.
7. ~~At Done~~ **Answered by 96**: after the pull a change corrects the
   record. Corrections end at Start again, when the egg is final.
8. **The record's forecast** is the one for the cook as last corrected, at
   the time that ran, so the score measures the model, not the typing. Or
   the last forecast shown before the pull. Either way there is no new
   field: or add one saying it was corrected, which is a format change.
9. **The boil memory** learns at the cook's end, from the cook as last
   corrected. A tap on a cook corrected boiling → cold after its remembered
   time to boil is used for this cook but not remembered, since the water
   may have boiled before the cook noticed. Or always remember it.
10. **The aimed-for egg is the egg at the yolk's peak**, at the posterior
    mean. Or at the pull, which shows a yolk less set than the one eaten.
11. **One egg**, the most likely, whatever the certainty word. Or draw the
    spread (a blurred yolk edge), which costs a second simulation.
12. **The certainty word sits under the time** and goes at the pull. Or it
    stays to Done.
13. **Pressing the word opens the interval in place**, with the time range
    under it, and the direction's (i) paragraphs move to Help, linked from
    there. Or keep an (i) beside the word as well.
14. **One interval.** The bracket draws the 90% the words say (5% to 95%,
    against 10% to 90% today), so the two agree. Or the bracket goes; or it
    stays at 80%.
15. **The lean line retires.** "Most likely: Fudgy." shows under the word
    only when it is not the word asked; otherwise it is in the tap. The
    white's line stays. Or the most likely word only in the tap.
16. **The 3/10 warning in words.** A dotted level is a wild guess, and the
    warning says so ("Soft: a wild guess, so far.", a placeholder). No dots
    before the first egg that taught something, as now. Or keep 3/10 on the
    chance of the word asked, only reworded.
17. **The track's shading** is the chance of the word asked, over the best
    level's. The stripes and the struck ticks are unchanged. Or the chance
    of that word or a neighbour.
18. ~~The Live Activity~~ Not the owner's: the description moves into
    `ContentState` (§4).
19. **The egg's two readings.** At idle it shows the aimed-for egg at rest
    (91); during a cook, the live egg at rest, and the aim while a control
    is held and for about 1.5 s after a tap. Or at idle the raw egg, which
    is 96 read literally.
20. **The start time is corrected through the start clause**, which during
    a cook reads "into cold water at 7:42" (a placeholder), with − and + a
    minute at a time, as every number has. Or a line of its own under the
    time.
21. **An event's own time is not correctable in 0.5.** For example, a boil
    pressed late: the tap is what the cook saw. Or offer it the same way as
    the start ("boiling since 7:50").
22. **A correction also changes the settings**, so the next cook starts from
    what was done, not from the mistake. Or leave the settings as they were.
23. *(Answered the other way: each tab runs what it started.)* **One cook per browser.** A tab takes up a cook started or changed in
    another. Or keep today's: each tab runs what it started.
24. **A 0.4 cook running at the upgrade is kept aside, not converted**
    (alpha, 48). Or convert it, which the stored ticket mostly allows,
    though it keeps the boiling point and not the altitude.
