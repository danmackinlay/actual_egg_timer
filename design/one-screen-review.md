# The one screen — a red-team review (SHIP-0.5 C2)

A review of `design/one-screen.md` §3 and §4 and of `src/core/running.ts` as
built at `35ca7f3`, before the web moves onto the running cook. It was asked
to press on five points: correcting the start time; an event a correction
makes meaningless; a correction that makes the egg overdue; each tab keeping
its own cook while sharing one stored key; and the 0.4 cook kept aside at the
upgrade.

The model holds: a cook is its start, its choices and its events, and the
plan is derived from them each time. The code does what the design says on
the cases the design names. What breaks is at the edges, where something the
cook never observed is stored as an event, or where a rule the web relies on
today goes with the refactor.

"Confirmed" means the case was run against core compiled from `35ca7f3`
(the appendix has the calls). The posterior is the tests' `knowing({
particles: 200, eggsLogged: 4, taste: 0.1 })`, the egg the tests' 2 l, two
eggs, class 2, fridge, jammy (0.41), with 480 s remembered for the pan.

---

## 1. Change the design before the web work

### 1.1 The owner's own case cannot be corrected once the grace runs out

Confirmed. A cook started as boiling that really went into cold water has
its pull due at 469 s. Corrected to cold 5 s before that, the cook goes back
to Heating, as it should. Corrected 30 s after the pull was due, it goes to
**Cooling**, with the egg still in cold water: `provisional` false, cook
time 469 s.

The cause is that the grace running out is stored as if it were an
observation. `eventsDue` writes `pulled` by `timeout` (`running.ts:633`),
and from then on the pull fixes the cook time (`running.ts:547`). But a
timeout is the clock's assumption, not something the cook saw. On iOS it is
written the moment the phone wakes from the notification, so a cook who
reaches the phone 30 s after the alarm can no longer correct. §7, 21 ("an
event's own time is not correctable") assumed every event was one the cook
saw.

**For the owner.** Keep a timeout pull open to correction until the cook
taps: a correction that would move the plan's pull later than now asks
"Still in the water?" (a placeholder). The case really is ambiguous: a cook
who pulled the egg at the notification without opening the app needs the
opposite answer, so the app has to ask rather than guess. Or keep it as
built, and have the screen say the pull is fixed once it has passed.

### 1.2 A boil tapped late overcooks the owner's case

Confirmed. When a boiling → cold correction comes after the water has
already boiled, the only way out of Heating is to tap Full rolling boil now,
which records a ramp that is too long. With the water really boiling at
480 s:

| Tap at | Pull at | Late by |
|---|---|---|
| 480 s | 676 s | 0 |
| 600 s | 738 s | 62 s |
| 720 s | 804 s | 128 s |

The egg is overcooked by about half the delay: a jammy egg by a minute for a
correction two minutes late. `coldSince_s` already keeps the late tap out of
the boil memory, but this cook still runs on it.

**For the owner.** When the water is already boiling at the correction, let
the tap carry a time ("boiling since 7:50", a placeholder), which reverses
§7, 21 for this one case. Or, when a tap comes after a correction to cold
made later than this water's remembered time to boil, plan on the remembered
time rather than the tap.

### 1.3 A cook left in Heating never ends

Confirmed. A cold start never tapped, planned 12 hours on:

- Still Heating. The time to boil is 43,252 s; the most the app otherwise
  accepts (`LIMITS.timeToBoil_s`) is 7,200 s.
- `slowHobAt_s` is always about 2 s ahead of now, so the app plans again
  every 10 s, for as long as the tab is open: about 280 ms a plan in Node on
  a Mac for this case.
- The deadline is 11 hours in the past, so a "time left" readout would be
  negative.

Today `RESTORE_WINDOW_MS` (an hour past the cook's end, `machine.ts:251`)
at least retires a stored cook. §4's order of work shrinks `machine.ts` to
`coolingStartsIn_s`, and `readRunningCook` has no age check.

**Fix.** Stop lengthening at `LIMITS.timeToBoil_s.hi`; past it, the cook is
abandoned. Give core the rule for when a cook is too old to pick back up, as
a pure function of the plan and the clock, so both apps drop it at the same
moment. 2.1 needs the same rule.

## 2. Correct before building

### 2.1 An egg can be sent before Start again

§4 says "Nothing is sent before Start again, so the server never sees an
uncorrected egg." But `finalEggs` (`update.ts:230`) holds back only the egg
on screen in this tab while its answers are live. Another tab, or this tab
after a reload (answers then `beforeReload`), counts the open egg as final
and sends it. A later correction then changes the local log and not what
the server has.

Nor does the design say when an egg left at Done becomes final if Start
again never comes, and closing the tab at Done is the usual ending.

**Fix.** An egg is final unless its id is the stored running cook's,
whichever tab asks. The open egg becomes final at Start again, or when the
cook is too old to pick back up (1.3).

### 2.2 A change undone can stop the boil time being remembered

Confirmed. Boil tapped at 500 s, then a stray cold → hot → cold at 600 s and
610 s: `boilToRemember` goes from 500 s to null. It drops a tap made
*before* the stray change, because `corrected` stamps `coldSince_s` afresh
on the way back (`running.ts:213`), and `test/running.test.ts` (3) asserts
that stamp ("told cold again only now"). It breaks "changing back gives back
exactly" for the boil memory. Slow hobs suffer most, since they are where a
cook flicks the start about, and where learning the time to boil matters
most.

**Fix.** Also keep the first moment after the start that the choices said
boiling, and remember any tap made before it.

### 2.3 A change after the pull rewrites what was not a mistake

- **The slider at Done.** Confirmed. Level 0.41 → 0.1 leaves the cook time
  at 469 s but rewrites the record's level, and the forecast's split around
  the target goes from [0.16, 0.67, 0.17] to [0.02, 0.02, 0.96]. After the
  pull the aimed-for egg is pinned to the time that ran, so dragging the
  slider at Done shows nothing new while it rewrites the score. Curiosity
  corrupts the record. **Fix:** after the pull, the slider only previews.
- **Counter → ice, ten minutes after the pull.** Confirmed. The record keeps
  `cool_s` 600 s, against 182 s for that plan's own countdown: ending a
  cooling "at the correction" (`running.ts:564`) records a ten-minute ice
  bath. **Fix:** a cooling corrected after its end would have passed
  takes the counted time and is Done at once.

### 2.4 Every step of a drag is a correction

§7, 5 has a change apply at once. Each step of a slider drag or a held − or
+ then:

- stamps `correctedAt_s`;
- plans again, at 25 to 55 ms a plan in Node on a Mac (measured), slower on
  a phone;
- reschedules the iOS alarms and pushes the Live Activity;
- writes the settings (§7, 22), which every other tab takes up.

A drag that passes through an overdue level rings the alarm mid-drag.

**Fix.** Commit on release, or after §5's 1.5-s settle for a tap. Show the
aimed-for egg while the finger is down, and decide overdue only on commit.

### 2.5 Each tab keeping its own cook (§7, 23)

- **Stale text.** §4's order of work, step 7, still says "`update.ts`'s
  `storedElsewhere` takes up a cook": the recommendation `DECISIONS.md` 97
  turned down. Delete it before the web work starts.
- **The settings cross between tabs.** A correction writes the settings
  (§7, 22). `takeUpSettings` then calls `applySettingsToDom()` in every
  other tab whatever its phase (`update.ts:144`). With the controls live
  mid-cook, tab B shows tab A's correction while running its own cook, and
  if the controls write the cook's choices (step 7), A's correction becomes
  B's. **Fix:** say that a running cook's controls read `cook.choices`, never
  the settings, and that a settings event mid-cook touches only what the
  cook does not hold (units, language, mute).
- **One id, two cooks.** Both tabs now write the stored cook on every
  correction and every `eventsDue`, so a reload is more likely to pick up the
  other tab's cook. Two tabs can then run the same id with different
  corrections. `logEgg` keeps the first record per id, which may be the
  uncorrected one.

### 2.6 The 0.4 cook at the upgrade

- **Nothing reads the old key.** With the key bumped, the web reads only
  `COOK_KEY` (`store.ts:23`) and iOS only `savedKey` (`Cook.swift:532`). As
  written nothing is kept aside, the 0.4 value sits in storage for good, and
  on iOS the alarms are not cancelled either. **Fix:** each app reads the 0.4
  key once, keeps it aside and deletes it, as `store.ts` already drops
  `aet.cook.v1`.
- **Cancelling the alarms is backwards for this cook.** iOS updates apps in
  the background, and the update kills the app. The pending notifications
  and the card's countdown survive it, and they are still right for the egg
  in the pot. Cancelling them at the next launch leaves the cook with no
  timer at all. **Fix:** for a cook kept aside from the 0.4 key, keep the
  notifications still ahead of now; cancel only for a damaged cook under the
  current key. The 0.4 path that logs a finished, unanswered egg
  (`cook.ts:231`) is lost as well, which costs at most one egg.

## 3. Minor

- **A surface landing can move a pull that has rung.** Across pots, the
  lean shown while a new pot's surface is built and the one decided when it
  lands differ by 5 to 21 s (48 pots: four masses, cold and hot, ice and
  counter, three levels). Near the pull, a landing can cut the grace short,
  or send Pull back to Cooking so the alarm rings twice. A plan the cook did
  not cause should not move a pull that is already due.
- **The start has no lower bound.** Confirmed: a start 1 s after 1970 is
  taken. The upper limit also counts a boil tap the choices no longer read:
  a cook who pressed Start as the pan went on, tapped the boil, put the
  eggs in then and corrects to boiling cannot move the start past that tap.
  The start's panel has to say why.
- **Stale wording.** The comment on `cookTime_s` (`running.ts:393`) still
  says "never before now"; the rule as built is the last correction or tap.

## 4. What holds

- A start corrected earlier with a tap: the measured ramp grows and the plan
  can go overdue, as intended.
- A tap the choices no longer read is kept, and read again when the setting
  changes back.
- A correction that makes the egg overdue rings at the correction, and a
  plan made again later (a reload, a surface landing) rings for the same
  pull.
- Overdue is never declared while still heating.
- The slow hob's lengthenings are bounded per plan.
- `eventsDue` after a phone has slept writes the pull that rang.

On the aimed-for egg (at the yolk's peak, or at the end of the cooling),
nothing here bears on the choice, except that after the pull the aimed-for
egg cannot show anything new (2.3).

---

## Appendix: the calls

Core compiled with `tsc --outDir <dir>` and run in Node, with the test's
harness (`test/running.test.ts`): `cookOf(over)` is `startCook(START_MS,
{ ...CHOICES, ...over }, 0, { '2.0': 480 }, 'metric', 'en')`, and
`planned(cook, now)` is `replan` with the pot's own surface (`gridFor`).
`S` is the start in seconds.

```ts
// 1.1 the grace runs out, then the correction to cold
const hot = cookOf({ startMode: 'hot' });
const p = planned(hot, S + 1), due = p.deadlines.cookEnd_s;          // S + 469
const late = { ...hot, events: eventsDue(hot, p, due + 21) };
phaseAt(planned(corrected(late, CHOICES, due + 30), due + 30).deadlines, due + 30);  // 'COOLING'
phaseAt(planned(corrected(hot, CHOICES, due - 5), due - 5).deadlines, due - 5);      // 'HEATING'

// 1.2 a late tap
for (const tap of [480, 540, 600, 720])
  replan(withBoil(cookOf(), S + tap), C, null, 0, S + tap).cookTime_s;  // 676, 707, 738, 804

// 1.3 a cold start never tapped, 12 h on
const q = replan(cookOf(), C, null, 0, S + 12 * 3600);
// phaseAt -> 'HEATING'; q.setup.timeToBoil_s 43252; q.slowHobAt_s - now 2; q.deadlines.cookEnd_s - now -39600

// 2.2 a tap, then cold -> hot -> cold
const t = withBoil(cookOf(), S + 500);
boilToRemember(t);                                                    // { litres: 2, seconds: 500 }
boilToRemember(corrected(corrected(t, { ...CHOICES, startMode: 'hot' }, S + 600), CHOICES, S + 610));  // null

// 2.3 the slider at Done: cookFactsFor before and after corrected(..., { level: 0.1 }) at due + 1010
// 2.3 counter -> ice: withOut at due + 5, corrected to ice at due + 605; planned(...).cool_s 600

// 3 the start corrected to the epoch
startCorrected(cookOf(), 1, S + 10);                                  // taken, not null
```
