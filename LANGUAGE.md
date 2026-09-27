# LANGUAGE.md — words, units, and languages

This is a design. It is not a record and it is not a statement of state, and none
of it is built yet. The checklist that tracks it is Phase F in `PLAN.md`. It
covers three requests made on 26 September 2026: localise both apps, revisit the
wording of the copy they have now, and offer Imperial units. The third comes with
an easter egg.

It lives in its own file, beside `INFERENCE.md`, because it cuts across both apps
the same way the policy layer did. That layer exists because text that both apps
have to agree on, and that is copied between them by hand, drifts.

---

## 1. Where the words are today

- **They are hand-copied between the two apps.** The five refusal messages
  appear in `src/ui/app.ts` and again in `ios/App/Kitchen.swift`. Nothing holds
  the two copies together. This is the failure `src/core/policy.ts` was created
  to end for numbers, and nobody has done the same for words.
- **Some of the English is in core.** Core returns English in three places:
  - `DONENESS_ANCHORS` (`Runny`, `Soft`, `Jammy`, …)
  - the size-class labels in `geometry.ts`
  - `formatLongDuration` and `startPhrase` in `sousvide.ts`

  `fixtures/sousvideCopy.json` already holds that English under conformance.
  That fixture is the precedent this plan generalises.
- **English grammar is written into the code.** Examples:
  - `egg${eggs === 1 ? '' : 's'}`
  - `minute${m === 1 ? '' : 's'}`
  - an array of seven English weekday names
  - a 24-hour clock built by hand on the web, and `"HH:mm:ss"` on iOS

  None of these survive contact with a second language, and the 24-hour clock
  does not survive contact with an American.
- **The copy is SI only, and it sometimes leaves the unit off.** "Fridge 4°" and
  "Sous-vide 63°" are unambiguous today. Once °F exists they are not, because
  63 °F is a cold kitchen.
- **The scale is small.** There are about 46 text nodes in `index.html`, about
  35 strings in the web UI code, and about 80 in the Swift app, widget and alarm.
  All of it can be read in one sitting, so the review in §3 is a real review
  rather than a sample.

## 2. One catalogue, both apps

**Source of truth.** `copy/<locale>.json` holds one message per key. Each
message is a template with named placeholders and plural variants. There is no
full ICU MessageFormat, for two reasons: nothing here needs `select` beyond
plurals, and the repo carries no runtime dependencies.

**Plurals.** Each message carries CLDR categories (`one`, `few`, `many`,
`other`), and a small hand-written rule function chooses between them for each
shipped language.

- On the web this could be `Intl.PluralRules`. Swift has no public equivalent
  outside `.stringsdict` and `.xcstrings`.
- So both cores carry the same few lines of rules, under conformance, as for
  everything else.
- A new language means adding its rule and a fixture row.

**Why not Xcode String Catalogs.** They are the native tool, and giving them up
costs Xcode's translation workflow. Keeping them would mean the iOS copy is
rendered by Apple's code and the web copy by ours. Nothing would hold the two
together except hope, and the whole reason for the catalogue is to remove that.
`Info.plist` declares `CFBundleLocalizations`, so the App Store still lists the
languages.

**Core stops speaking English.** Core returns keys and numbers, never sentences.

- `DONENESS_ANCHORS` gains a `key` in place of `label`.
- `startPhrase` returns a bucket and a weekday index.
- The size classes return a mass, plus a region-dependent key (§4).

**As built, in F1 (27 September).** Where the format settled differently:

- **One file per language, plus one for the surfaces.** `copy/en.json` is the
  schema as well as the English: each entry carries `surface`, `apps` (`web`,
  `ios` or both) and `example` arguments, which translations do not repeat.
  `copy/surfaces.json` holds one budget per surface, not per key: a per-key
  budget set from the English would fail every language that runs longer than
  English, which is all of them.
- **A message is `text`, or a `count` and plural forms.** The `count` names
  the argument that picks the form. A missing form falls back to `other`, so
  English writes `one` only where it can be reached. A key missing from a
  language falls back to English, with English's plural rule.
- **Core returns a `CopyRef`, `{ key, args }`.** `startPhrase` returns the key
  alone for the weekday bucket, and each app supplies `{weekday}`: the web from
  `weekday.*` in the catalogue, iOS from a locale-aware formatter, as before.
  F4 makes them agree. (It did: both from the catalogue, below.)
- **The size classes' grams come from the mass**, as an argument, so a label
  cannot disagree with the egg it cooks.
- **Numbers are still formatted by the apps** and passed as strings, so F1
  changed no digit. Only a plural count goes in as a number. F4 moves the rest
  to the platform formatters above. (It did, below.)
- **The Swift renderer is its own library, `EggTimerCopy`**, beside
  `EggTimerCore` in the same package, so that the widget extension can link
  the words without the physics.
- **The web's `index.html` holds no words below `<head>`.** Each element names
  its key with `data-copy`. The `<head>` keeps its English, because crawlers
  and link previews do not run scripts; localising it needs a page per
  language, which is F5's problem.
- **The language picker waits for Czech.** F1 built the active locale as
  plumbing, fixed at `en`; a picker with one row in it is a control that does
  nothing.
- **Inserted doneness words are still lower-cased in code** (`toLowerCase`,
  `lowercased()`), because the F1 wording inserts them mid-sentence. F2's
  rewrite, which stands every inserted word alone (§5), removes the need.

`src/core/` keeps its invariants: no I/O and no dependencies. The catalogue is
data that the UI layer passes in.

**Conformance.** `fixtures/copy.json` renders every key, with representative
arguments, in every shipped locale. Both apps must produce it byte for byte.
Two tests run against that fixture:

- **Placeholder parity.** Every translation uses exactly the same placeholders
  as the English. A dropped `{limit}` is a sentence that lies about the egg.
- **Length budget.** Each key carries a maximum rendered width for the surface
  it appears on: Dynamic Island compact, Lock Screen, notification title,
  button, or body text.

Numbers, times and dates go through the platform's formatters:
`Intl.NumberFormat` and `Intl.DateTimeFormat` on the web, `FormatStyle` on iOS.
The fixture pins the result for each locale, so a formatter disagreement shows
up as a failing test and not as a surprise in a Czech kitchen.

**As built, in F4 (27 September).** `src/core/format.ts` and its Swift twin
`EggTimerCopy/Format.swift`, pinned by `fixtures/format.json`.

- **The formatting locale is the UI's language in the device's region**:
  `formattingLocale(uiLanguage, region, hourCycle)`, one function in both
  cores. An English UI in Britain formats as `en-GB`; in Germany as `en-DE`,
  which is a real CLDR locale with English words and "2,4". **A language
  with one convention of its own ignores the region** (the owner, 27
  September): a Czech UI formats as `cs-CZ` everywhere, so cs in the US
  writes "1 234,5", because the words around the number are Czech. The list
  is `OWN_CONVENTION` (`ownConvention` in Swift), today only `cs` → `CZ`;
  English is not on it, because CLDR has English writing numbers a dozen
  ways by region, and a language joins it when its catalogue ships. A private-use
  subtag (`x-1750`) is dropped, since it is a register and not a format. iOS
  adds the phone's own 12/24-hour setting as `-u-hc-h23` (or `h12`) when it
  differs from the region's, so an Australian iPhone set to 24-hour time
  reads "15:05" and not "3:05 pm"; a browser does not expose that setting,
  so the web uses the region's. The web reads the region from
  `navigator.language`, iOS from `Locale.current`. There is no picker yet
  (F5), so the language is `en`, and `forceFormatLocale` pins the whole tag
  for a test.
- **Numbers go through `Intl.NumberFormat` and `NumberFormatter`**, with an
  explicit locale. **The rounding is ours**, done first by the units'
  `floor(x + 0.5)`: `Intl` rounds halves away from zero and `NumberFormatter`
  to even, both on the shortest decimal of the double, and a number already
  on its grid gives them nothing to decide. **Zero has no sign**: both print
  -0 as "-0". A measurement goes to the renderer as a `Fixed`, its value and
  F3's decimals for that quantity, and is written to exactly those decimals;
  a count goes as a number, and is written with the decimals it has, up to
  three. Grouping is the locale's, so English now groups from four digits:
  "1,500 m", "16,400 ft". `displayText` stays plain digits with a point,
  because a web `<input type="number">` holds machine text in every locale.
- **Times of day use the locale's time STYLES** (`timeStyle: 'short'` and
  `'medium'`; `DateFormatter.timeStyle` `.short` and `.medium`), given
  seconds after midnight and formatted in UTC, so core reads no clock and no
  zone. Not skeletons of hour and minute fields: the skeleton `jmm` gives
  "9:05" in `Intl` and "09:05" in Foundation for en-GB, where the style is
  CLDR's own pattern and both print "09:05". The countdown's m:ss is a
  duration, not a time of day, and is built by hand as before.
- **No time of day zero-pads its hour** (the owner, 27 September): "9:05"
  and "0:05", never "09:05", in every locale, and the minutes and seconds
  keep two digits. `unpadHour` in both cores drops the leading zero from the
  first run of digits after the platform has formatted. It changes en-GB
  ("09:05" was CLDR's pattern), 24-hour English anywhere, and the `-u-hc-h23`
  override; Czech and 12-hour clocks never padded.
- **Every space in a time of day is U+202F**, the narrow no-break space.
  Foundation prints it before "PM", as CLDR says; V8 prints U+0020 instead,
  a patch for web pages that parse their own output. The web normalises to
  Foundation's. It also stops a line breaking between "3:05" and "PM".
- **Weekday names come from the catalogue in both apps** (`weekdayKey`, 0 is
  Sunday), not from a platform formatter. The translator sees them, and a
  platform's name is the nominative: Czech "Last {weekday}" wants the
  accusative (*minulou středu*, not *středa*), and a name from the catalogue
  can be the form the sentence needs, or the sentence can be rewritten around
  it, which is F5's call. Before F4, iOS used `DateFormatter`'s "EEEE", so a
  French phone said "Last mardi".
- **Every spelled-out count is a plural message.** "{seconds} seconds" had
  no `one`, so a screen reader heard "1 seconds"; it has one now, and
  "{minutes} minute(s) {seconds} seconds" is two plural messages joined
  (`spoken.minutes`, `spoken.seconds`, `spoken.minutesSeconds`), because a
  message has one count and the seconds were stuck in the minutes' form.
  Unit SYMBOLS - s, min, h, °C, g, L, oz - are not plural messages: they do
  not inflect in English or Czech. A translator who wants a word can make any
  `format.*` key a plural message on `{value}`, and the renderer will choose
  its form.
- **The plural rule sees the decimals a number is shown with**, as CLDR's `v`
  operand does: "2,00 l" is Czech `many`, not `few`, and "1.0" is English
  `other`. A count is rounded as it is written before its form is chosen.
- **The record's `lang`** is the catalogue the cook read at "Eggs in",
  carried on the ticket like `units`, and `en` for a cook saved before F4.

**Where `Intl` and Foundation disagree**, measured on 27 September with Node
26.8.1 (ICU 78.3, CLDR 48) against Foundation on macOS 26.6.2, after the
normalisation above:

| formatting locale | `Intl` | Foundation | what F4 did |
|---|---|---|---|
| en-US, en-AU, en, any 12-hour English | "3:05 PM" with U+0020 | "3:05 PM" with U+202F | normalised to U+202F, pinned |
| en-CZ (an English UI in Czechia) | "09:05" | "9:05" | **resolved 27 September**: no hour is zero-padded, both "9:05"; pinned |
| en-CA | "3:05 p.m." | "3:05 PM" | not pinned |
| en-IN, en-NZ, en-SG | "3:05 pm" | "3:05 PM" | not pinned |
| cs-US, cs-GB (a Czech UI abroad) | "1 234,5" (by language) | "1,234.5" (by region); cs-US also a 12-hour clock | **resolved 27 September**: never formatted in; a Czech UI's tag is `cs-CZ` in any region, "1 234,5" and "15:05" on both; pinned |
| cs-CZ-u-hc-h12 | "3:05 odp." | "15:05" (`DateFormatter` ignores `hc` for cs) | not pinned |

Pinned, and agreeing: en-US, en-GB and cs-CZ, which are the supported set,
and en, en-AU, en-DE, en-CZ, cs, en-US-u-hc-h23 and en-GB-u-hc-h12, with the
tag each app derives from a language, a region and an hour cycle followed
through to the text (`derived`). Measured to
agree but not pinned: en-150, en-CH ("1'234.5"), en-ES, en-FR ("1 234,5" with
U+202F), en-IE, en-IT, en-JP, en-NL, en-PL, en-SE, en-ZA and cs-SK. Czech
groups with U+00A0 on both platforms, so no choice was needed there.

Two of those mattered before F5 ships, and the owner settled both on 27
September. **en-CZ is the owner's friend** until there is a Czech catalogue:
the web printed "09:05" and iOS "9:05", and now both print "9:05", because no
time of day pads its hour. And a Czech UI outside Czechia got a different
decimal separator from each app, because `Intl` has no cs-US data and falls
back to the language, where Apple lets the region win; now the tag is
`cs-CZ` wherever the phone is, so neither platform is asked. Its clock is
Czech too, 24-hour, even in the US; on iOS the phone's own 12-hour setting
still rides along as `-u-hc-h12`, which `DateFormatter` ignores for Czech,
as in the last row of the table, so both apps print "15:05".
Safari was not measured: it runs Apple's ICU, not V8's, and the U+202F
normalisation covers the one difference known in advance.

## 3. The wording, reviewed

The catalogue is the natural moment to review the wording, because it puts every
string in one file for the first time. **The move and the rewrite are two
separate steps.**

1. Extract every string with no change in wording. This is proved by rendering
   both apps before and after and getting byte-identical output, the way the
   `CookSetup.eggMass_kg` removal was proved.
2. Rewrite inside the catalogue, as one diff the owner reads and approves.

**Criteria.** These are the rule the copy has been held to since the sous-vide
warning was cut down, written down here for the first time:

- Say what to do.
- When a caveat cannot be put plainly, say its consequence, not its mechanism.
- Use no term that only this repository uses.

**Strings that already fail those criteria.**

| where | string | problem |
|---|---|---|
| iOS alarm, second notification | "The carryover is over. That is the egg you asked for." | "carryover" is a README word |
| iOS, reset dialog | "Forget the calibration?" … "goes back to the literature values it shipped with" | "calibration", "literature values" |
| iOS, after feedback | "Telling it tunes the model to your eggs and your pan." | "the model" |
| web, learned note | "tuned on 3 eggs · ±4%" | ±4% of what? The honest answer is a range of times, which is E5's job (`INFERENCE.md` §8) |
| iOS, heat-off explanation | "The standing method: the pan coasts down…" | "standing method" is the README's name for it, not a cook's. Reworded 27 September, when the pan's cooling moved to the water volume: "Lid on and burner off: the water's own heat finishes the eggs…" |
| both, presets | "Fridge 4°", "Sous-vide 63°" | there is no unit, and °F is coming (§4) |

**Draft for E2's feedback screens - IMPLEMENTED 27 September 2026**, in
`copy/en.json` and both apps, except the two "E5, preview" rows, which belonged
to E5 and went in with it on 28 September. The owner has not formally approved it; it went in on their behalf while
they were away, and it lives in the catalogue so that revising it is an edit to
one file. `tools/copyDraft.ts` lists every key it changed, and
`copyLiterals.js --since cfe38e9` and `copySnapshot.js compare --draft` show
that nothing else did. This is modern English only; 1750 and Czech shadow it
once it is settled. Both apps get the same wording. That is new: until E2 the
web app said *Too firm* where iOS said *Too hard*.

| where | now | draft | why |
|---|---|---|---|
| yolk question | How was the yolk? | How was the yolk? | unchanged |
| yolk answers | Too soft · Just right · Too firm (web) / Too hard (iOS) | Too soft · Just right · Too firm | one word in both apps; *firm* matches the white's scale |
| white question | And the white — was it runny? (asked only sometimes) | And the white? | always shown now (E2), so it no longer presumes the answer |
| white answers | Still runny · Set right through | Runny · Tender · Firm | three levels, decided 21 September |
| optional hint | The white sets from the outside in, so this says something about your eggs that the yolk cannot. | Answer either, both or neither. | the old line explains the mechanism; the cook needs to know they may skip |
| after an answer | Thanks — it has adjusted. | Thanks. The next egg will use that. | says the consequence |
| while updating | learning… | learning… | unchanged; it matches "still learning" (E5) |
| before any egg | Telling it tunes the model to your eggs and your pan. | Your answers adjust the times to your eggs and your pan. | drops "the model" |
| what it has learned | tuned on 3 eggs · ±4% | Learned from 3 eggs | the ±% is of nothing a cook knows; E5 replaces it with "still learning" and the odds |
| nothing learned yet | Running on the literature values. It learns your pan when you time a boil, and your taste when you say how an egg was. | Nothing learned yet. It learns your pan when you time a boil, and your eggs when you say how one came out. | drops "literature values"; "your eggs", because the white answers are about the egg, not taste |
| forget button | Forget what it learned | Forget what it learned | unchanged |
| forget dialog, iOS | Forget the calibration? — The model goes back to the literature values it shipped with, and the time to boil goes back to a guess. | Forget what it learned? — Every egg and your pan's boil time are forgotten, and the times go back to where they started. | checked against both apps: the button clears the eggs AND the boil memory |
| pull screen, web | Out of the water — now · carryover is running | Out of the water — now · the yolk is still cooking | "carryover" is a README word; this says what is happening |
| pull button, iOS | (none: iOS has no action out of the pull) | They're in the ice bath · They're under the tap · They're out | the web's existing button, so iOS records a MEASURED pull as the web does (E1 records every iOS pull as assumed today) |
| **E5 — IMPLEMENTED 28 September** | — | 7/10 eggs hit the mark | the owner's wording. `odds.hitTheMark`, `{hits}/{of}`, both numbers through the renderer (F4 formats them); under the time in both apps, and on the Lock Screen |
| **E5 — IMPLEMENTED 28 September** | — | Still learning your kitchen | `odds.stillLearning`, beside the odds while the 80% interval on the cook time is wider than ±15 s; "Learned from N eggs" stays where it was |

There is **no Skip button.** Every answer folds the moment it is tapped, and an
unanswered question is recorded as skipped when the next cook starts (E1's
offered-or-skipped field). A button would be one more thing to press that
teaches nothing.

**E4's strings - IMPLEMENTED 27 September 2026**, in `copy/en.json` and both
apps, not yet approved by the owner. One is INFERENCE.md §5's draft with one
word changed; the rest are new. `readout.sub.cooling` ("3 minutes, or the yolk
keeps cooking") is retired, because the countdown is no longer three minutes.

| key | where | text |
|---|---|---|
| `probe.offer` | once, during a cook (both) | Got a probe thermometer? When the timer says, push it to the middle of the egg and tell us the **highest** number you see. |
| `probe.offer.yes` / `.no` | its buttons | I have one · No thanks |
| `controls.probe` | the setting | I have a probe thermometer |
| `controls.probe.hint` | under it | When the cooling ends it asks for one reading from the middle of the egg. That tells it how fast your eggs heat, from a single egg. |
| `readout.sub.coolingPeak` | cooling subline | until the middle of the yolk stops warming |
| `readout.sub.coolingProbe` | the same, probe on | until the middle of the yolk stops warming — have the probe ready |
| `probe.now` / `probe.hint` | at Done | Push the probe to the middle · Tell us the highest number you see. |
| `probe.entry` / `probe.save` | the field, the button | Highest reading · Use this reading |
| `probe.refused` | a reading refused | That doesn't look like the middle of this egg: expect {low} to {high}. Is the tip in the yolk? |
| `alarm.probe.title` / `.body` | iOS notification | Probe it now · Middle of the egg: tell us the highest number. (12 and 46 of 14 and 53) |
| `spoken.probe` | web, screen reader at Done | Now push the probe to the middle of the egg. |

**"Lowest" became "highest"** because at the moment the reading is taken the
middle of the egg is its warmest point, not its coldest (INFERENCE.md §5): the
highest number is the middle, and a probe that is off-centre, late, or not yet
settled reads lower. It is the one departure from the owner's draft.

The reading is typed in the cook's units: a new quantity, `probeTemp`, to a
tenth of a degree in C or F, and never clamped - a reading the egg could not
have made is refused with the range it should be in, not silently moved to
the edge of it (§4).

**Draft for the rest of F2 (everything but the feedback screens) -
IMPLEMENTED 27 September 2026**, in `copy/en.json` and both apps, but for the
rows held back below. Approved by the owner on 27 September. Drafted on 27
September while the owner slept, from F1's list of strings that fail the
criteria above. The E2 draft above covers the feedback screens, the pull line
and the forget dialog. F3 and F4 already fixed the bare "°" and "1 seconds".

The refusals drop `{wanted}` altogether. The slider already shows it right
above them, and removing an inserted word is simpler than making it stand
alone. `{limit}` moves after a colon, so no language has to decline it.

| key | now | draft |
|---|---|---|
| `refusal.counter` | Resting on the counter keeps cooking the yolk — {wanted} isn't reachable. Softest here is {limit}. Use an ice bath. | Resting on the counter keeps cooking the yolk. Softest possible: {limit}. An ice bath would leave the egg softer. |
| `refusal.tap` | A cold tap doesn't pull the heat out fast enough — {wanted} isn't reachable. Softest here is {limit}. Ice water gets you further. | A cold tap doesn't cool the egg fast enough to stop the yolk. Softest possible: {limit}. An ice bath would leave the egg a little softer. |
| `refusal.ice` | Any shorter and the white is still raw — {wanted} isn't reachable for this egg. Softest here is {limit}. | Any shorter and the white is still raw. Softest possible for this egg: {limit}. |
| `refusal.harderThanPan` | With the heat off, the water runs out before the yolk gets there — {wanted} isn't reachable with this much water ({water}). Hardest here is {limit}. More water, or keep it boiling. | With the heat off, this much water ({water}) cools before the yolk gets there. Firmest possible: {limit}. Add more water, or keep it boiling. |
| `refusal.whiteNeverSets` | With the heat off this pan never sets the white: the water falls below what the white needs while the egg is still in it. Nothing on the slider is reachable. More water, or keep it boiling. | With the heat off, the water cools before the white sets, so no setting works. Add more water, or keep it boiling. |
| `alarm.cooled.body` | The carryover is over. That is the egg you asked for. | The yolk has stopped cooking. That's the egg you asked for. |
| `activity.note.cooling` | carryover still running | yolk still cooking |
| `colophon.ios` | Times computed from heat conduction and denaturation kinetics, not from a recipe. The cooling step is part of the recipe: carryover is what ruins a soft egg. | I work out times from the physics and chemistry of eggs. Both heating and cooling matter for cooking the middle. |
| `readout.sub.idleCold` | from eggs into COLD water, heat on, to eggs out | from eggs into cold water, heat on, to eggs out |
| `readout.sub.idleHot` | from eggs into BOILING water to eggs out | from eggs into boiling water to eggs out |
| `readout.sub.coldAssumes` | assumes {boil} to a rolling boil | your pan took {boil} to boil last time |
| `readout.sub.coldGuesses` | guesses {boil} to a rolling boil | I'm guessing {boil} to boil — tap when it does |
| `readout.sub.heating` | {elapsed} heating · provisional, assumes {boil} to boil | {elapsed} heating · I expect {boil} until you tap |
| `readout.sub.heatingEstimate`, `activity.note.estimate` | estimate — the clock corrects itself when you tap the boil / estimate until the boil is tapped | my guess until you tap Full rolling boil |
| `controls.start.coldPan` (web), `controls.start.cold` (iOS), `cook.method.cold` | Cold pan / Cold start / Cold start | Cold water (all three) |
| `cook.method.hot` | Into boiling water | Boiling water (matches `controls.start.hot`) |
| `controls.start.hint` | Hot start peels far better; cold start needs no timing of the drop-in. | Eggs into boiling water peel better. Eggs into cold water are done sooner, counting the wait for the water to boil. |
| `controls.afterBoil.keepItBoiling` (web), `keepBoiling` (iOS) | Keep it boiling / Keep boiling | Keep boiling (both) |
| `readout.stat.afterBoiling` (web), `afterBoil` (iOS) | after boiling / after boil | after the boil (both) |
| `controls.afterBoil.hint` | Standing in cooling water is a real method, but it lives or dies on the pan: the water has to carry the whole cook. More water holds more heat. | Heat off, lid on: the hot water continues to cook the eggs. More water holds more heat. |
| `action.hint.cookingStanding` | lid on, burner off — the timing assumes the water cools on its own from the boil ({boiling}) | lid on, burner off |
| `action.hint.cookingBoiling` | keep it boiling — the timing assumes a full boil ({boiling}) right up to the pull | keep it at a full boil ({boiling}) until the eggs come out |
| `pan.measured` | Measured on this pan at this volume. It is re-measured every cold start. | From your earlier boils with this much water. I update it each time you tap the boil on a cold-water start. |
| `pan.unmeasured` | Never measured. Run one cold start and tap the boil, and this becomes your pan rather than a guess. | Tap the boil on a cold-water start and I'll remember for next time. |
| `learned.forgetExplain` | Clears both what it learned from your eggs and the time it measured for your pan. The posterior is honest about its own spread, so a few wrong answers wash out after a few more eggs anyway - this is for when you would rather not wait. | Clears what I've learned from your answers and your boil times. A few wrong answers wash out after a few more eggs anyway; this is for when you'd rather not wait. |
| `sousvide.warn` | This bath ({bath}) is below the temperature at which egg white sets — only one of its proteins reacts down here — so the white stays loose however long you leave it. This app was built for boiling water and is out of its depth below {floor} anyway. Use the pan. | This bath ({bath}) is too cool to set the white, however long you leave it. I'm built for boiling water, and I'm not reliable below {floor}. Use the pan. |

Owner-edited on 27 September, then proof-read against what the app does. The
proof-read corrected the verb missing from `refusal.whiteNeverSets`, the
"log" in the estimate line (the button says *Full rolling boil*), and a
"sooner" that read as false beside the two totals on screen. It also made
`pan.measured` truthful: the memory is keyed by water volume, not by pan, and
it blends each boil in rather than re-timing. The sous-vide warning was never
owner-edited; an earlier line here said it was, and that was wrong.

**The app speaks in the first person singular, in the active voice.** Owner,
27 September: "Tap the boil … and I'll remember for next time", not "it's
remembered". The app is "I", the cook is "you", and a sentence has someone
doing something. Instructions stay imperative. This also matches the 1750
register, since Johnson's *Preface* is written in the first person (§6), and
it has a cost in Czech (§5).

These strings are already live and need the same pass. **IMPLEMENTED 27
September 2026**, with the table above, but for the rows held back below:

| key | live | first person |
|---|---|---|
| `feedback.invite` | Your answers adjust the times to your eggs and your pan. | Your answers teach me your eggs and your pan. |
| `feedback.thanks` | Thanks. The next egg will use that. | Thanks. I'll use that for the next egg. |
| `learned.literature` | Nothing learned yet. It learns your pan when you time a boil, and your eggs when you say how one came out. | I haven't learned anything yet. I learn your pan when you time a boil, and your eggs when you tell me how one came out. |
| `learned.forget` | Forget what it learned | Forget what I've learned |
| `learned.confirm.title` | Forget what it learned? | Forget what I've learned? |
| `controls.probe.hint` | When the cooling ends it asks for one reading from the middle of the egg. That tells it how fast your eggs heat, from a single egg. | When the cooling ends, I'll ask for one reading from the middle of the egg. From a single egg, that tells me how fast your eggs heat. |
| `controls.afterBoil.explainHeatOff` | Lid on and burner off: the water's own heat finishes the eggs. The time is worked out for the water below, so measure it — more or less water changes the time, or whether it works at all. | Lid on and burner off: the water's own heat finishes the eggs. I work out the time from the water below, so measure it — more or less water changes the time, or whether it works at all. |
| `probe.offer` | Got a probe thermometer? When the timer says, push it to the middle of the egg and tell us the highest number you see. | Got a probe thermometer? When I say, push it to the middle of the egg and tell me the highest number you see. |
| `probe.hint` | Tell us the highest number you see. | Tell me the highest number you see. |
| `alarm.probe.body` | Middle of the egg: tell us the highest number. | Middle of the egg: tell me the highest number. |
| `colophon.tail` | — including what it gets wrong. | — including what I get wrong. |

Left as they are: "Still learning your kitchen" (the "I" is implied), "keep
the app open" (the app is the object there, not the speaker), and "Learned
from N eggs".

**As built, 27 September.** `tools/copyDraft.ts` lists the 37 keys the two
tables changed, against `e1f7068`; `copyLiterals.js --since e1f7068` and
`copySnapshot.js compare --draft` show that nothing else did.

- **One key where two apps now say the same thing.** `controls.start.coldPan`
  (web) went into `controls.start.cold`, `controls.afterBoil.keepItBoiling`
  (web) into `controls.afterBoil.keepBoiling`, and `readout.stat.afterBoiling`
  (web) into `readout.stat.afterBoil`; each survivor now names both apps.
  `cook.method.cold` and `.hot` say "Cold water" and "Boiling water" too, but
  stay keys of their own: they are fragments inside "{start} · then
  {after}", on another surface, where a translation may need another form.
  The two iOS estimate lines (`readout.sub.heatingEstimate`,
  `activity.note.estimate`) are likewise one wording on two surfaces.
- **The refusals take `{limit}` alone**, and `action.hint.cookingStanding`
  takes nothing; both apps' call sites changed to match. `{limit}` is still
  lower-cased by the app, which reads correctly after a colon.
- **Held back: five rows, at their live wording.** Four are longer than their
  surface's budget in `copy/surfaces.json`, which is not raised for a small
  surface without the owner; each needs a shorter wording or a raised budget.

  | key | draft | length | budget |
  |---|---|---|---|
  | `alarm.cooled.body` | The yolk has stopped cooking. That's the egg you asked for. | 59 | notification body, 53 |
  | `feedback.thanks` | Thanks. I'll use that for the next egg. | 39 | label, 36 |
  | `learned.forget` | Forget what I've learned | 24 | button, 23 |
  | `learned.confirm.title` | Forget what I've learned? | 25 | title, 23 |

  The fifth would be false. `readout.sub.coldAssumes`, "your pan took {boil}
  to boil last time", is shown whenever any boil is remembered, and `{boil}`
  is `estimateTimeToBoil`: the remembered time for this volume, which is
  every boil there blended half-and-half and not the last one, or, when this
  volume has none, the nearest remembered volume's time scaled by litres,
  which the pan never took. The live "assumes {boil} to a rolling boil"
  stays until the owner rewords it.
- **`pan.measured` is not quite true either, but no less than before.** "From
  your earlier boils with this much water" is shown whenever any boil is
  remembered, including when the time on screen was scaled from another
  volume. The line it replaced ("Measured on this pan at this volume") had
  the same fault, so it went in, and the case is noted here.

**Strings that are about to change anyway.** Phase E rewrites the feedback copy:
three white answers, every answer optional, "still learning" beside the time, and
a thermometer prompt. Those strings should go straight into the catalogue, which
is why F1 comes before E2 (§7).

### Proposed: one wording per meaning (for the owner)

**A proposal, 27 September 2026. Nothing here is implemented**: `copy/en.json`
and both apps are unchanged. The principle is the owner's: one short string
per meaning, everywhere. A key used by one app is allowed only where the
surface exists on one platform, or where the two apps' layouts differ in
structure, not just in wording.

At `1667dcf` the catalogue has 139 shared keys and 125 used by one app (61 web,
64 iOS). Every one of the 125 was read at its call site, with the other app's
screen at the same moment, and sorted like this:

| | keys |
|---|---|
| paired: the other app says the same thing at the same moment (15 pairs) | 29 |
| platform-only: the surface, or the feature, exists on one platform | 40 |
| different layout: the screens are built differently | 46 |
| orphaned: nothing in the other app answers to it (1 dead, 9 live) | 10 |

**The pairs.** In screen order. The proposed wording is one of the two
existing strings, the shorter one where it works in both apps. Only one row
needed a new wording, and it is marked **NEW**. Each proposal was checked
against what both apps do, and fits the tighter of the two surfaces' budgets.
Merging a pair means one key, and both apps' call sites changing to it.

| key(s) | web now | iOS now | proposed | why |
|---|---|---|---|---|
| `readout.phase.totalLidOn` (iOS), against the shared `readout.phase.total` | Total time | Total time, lid on | Total time | The lid is for the heating, not a property of the total. The web says it under the button: "eggs in the pan, lid on, then tap". Cost: on a cold start with Keep boiling, iOS then says "lid on" nowhere. |
| `readout.sub.hot`, `readout.sub.idleHot`, `readout.sub.idleCold` | from eggs in to eggs out (hot start, Keep boiling) | from eggs into boiling water to eggs out · from eggs into cold water, heat on, to eggs out | from eggs in to eggs out | Shortest, and true for both starts, since a cold start's eggs go in before the heat. The Start choice just below says which water. |
| `action.startHeating`, `action.eggsInHeatOn` | Start heating | Eggs in, heat on | Eggs in, heat on | Says what to do, and pairs with "Eggs in" on a hot start. iOS has no line under the button to say "eggs in the pan". |
| `readout.phase.heating`, `readout.phase.heatingTap` | Heating | Heating — tap when it boils | Heating | The button right below names the moment (Full rolling boil), and the next row says to tap it. "When it boils" invites a tap at the first bubbles, which under-measures the boil (PLAN.md, invariant 6). The Dynamic Island already says "Heating". |
| `readout.sub.heating`, `readout.sub.heatingEstimate` | {elapsed} heating · I expect {boil} until you tap | my guess until you tap Full rolling boil | my guess until you tap Full rolling boil | This is already the Live Activity's wording (`activity.note.estimate`). It is shorter, and "I expect {boil} until you tap" does not parse. Cost: the web stops showing the heating time so far and the boil time it expects. |
| `readout.stat.waterBoilsAt`, `pan.waterBoilsAt` | water boils at | Water boils at | Water boils at | The same words. The web's stats are upper-cased by CSS, so the capital never shows there. |
| `texture.white.runny` (web), against iOS's texture note | white stays runny | white just set, {yolk} | white stays runny | **iOS is wrong today.** When the pan never sets the white, iOS still names the white from its peak temperature, on a scale whose lowest word is "white just set". The web switches to this line when the white's dose falls short, and iOS should do the same. |
| `controls.size`, `controls.egg` | Egg size | Egg | Egg size | Names the choice. If the Eggs row below goes in, iOS would otherwise have "Egg" and "Eggs" on one screen. |
| `controls.size.measured`, `controls.size.weighed` | Measured below… | Weighed · {mass} | **NEW:** Measured — {mass} | iOS's mass slider shows no number, so the menu has to carry the mass. "Weighed" is false on the web when the girth was typed in instead of the weight. The dash matches "Large — {mass}". The web would render the mass it measured. |
| `controls.eggFrom.fridge`, `controls.eggFrom.fridgeAt` | Fridge (the temperature is in the hint below) | Fridge {temp} | Fridge {temp} | Puts the assumption where the choice is made. iOS has no hint line to carry it. "Fridge 39 °F" is 12 of a segment's 17. |
| `controls.eggFrom.room`, `controls.eggFrom.roomAt` | Room | Room {temp} | Room {temp} | As above. |
| `controls.atTheBoil`, `controls.afterTheBoil` | At the boil | After the boil | At the boil | Shorter, and "after the boil" already names a duration, the stat `readout.stat.afterBoil`. |
| `controls.afterBoil.hint`, `controls.afterBoil.explainHeatOff` | Heat off, lid on: the hot water continues to cook the eggs. More water holds more heat. | Lid on and burner off: the water's own heat finishes the eggs. I work out the time from the water below, so measure it — more or less water changes the time, or whether it works at all. | the web's | Half the length, and it is the owner's own F2 edit. Cost: iOS stops telling the cook to measure the water. The web says so in `readout.sub.standing`, but iOS says it nowhere else. |
| `controls.eggs`, `controls.eggsInPan` | Eggs | Eggs in the pan | Eggs | Shorter. It sits beside Water on the web and inside the pan's fold on iOS, so "in the pan" goes without saying. |
| `colophon.lede`, `colophon.ios` | Times computed from heat conduction and denaturation kinetics, not from a recipe. | I work out times from the physics and chemistry of eggs. Both heating and cooling matter for cooking the middle. | iOS's | The web's is the wording F2 retired from iOS: "denaturation kinetics" is jargon, and the sentence has no speaker. iOS's runs on into the web's link: "…the middle. Source, and the physics it rests on — including what I get wrong." |

**Leftovers: platform-only (40).** The first 33 need nothing, because their
surface exists on one platform:

- iOS notification (6): `alarm.pull.*`, `alarm.cooled.*`, `alarm.probe.*`.
- iOS Dynamic Island (14): `activity.stage.*` (5), `activity.now`,
  `activity.eat`, `activity.target`, `activity.note.*` (6).
- iOS Lock Screen (1): `activity.summary`.
- Web screen reader (12): `spoken.*`.

The other 7 are on surfaces both apps have, but the feature exists on one
platform:

- `readout.alarm.setting`, `.denied`, `.failed`, `.set` (iOS): the web
  schedules no alarm, so it has none to report.
- `readout.mute.on`, `.off` (web): the web plays its own sound. The iOS alarm
  is a notification, and the phone decides its sound.
- `readout.restored` (web): only the web's alarm is lost on a reload.

**Leftovers: different layout (46).** The first line of each group says how
the two screens differ:

- *The big readout at the pull and at Done holds a word on iOS (NOW, Eat) and
  digits on the web (the overrun, then the total), so the lines under it say
  different things.* `readout.big.now`, `readout.big.eat` and
  `readout.sub.done` (iOS); `readout.sub.doneCold` and `readout.sub.doneHot` (web).
- *The web gives the boil it assumes under the total. iOS gives it as a row
  in the pan's fold.* `readout.sub.coldAssumes` and `readout.sub.coldGuesses` (web);
  `pan.timeToBoil` and `pan.timeToBoil.assumed` (iOS).
- *The web says what it has learned about the pan in one sentence under the
  controls. iOS says it in a note under that row.* `learned.literature`, `learned.pan`
  and `learned.both` (web); `pan.measured` and `pan.unmeasured` (iOS).
- *Only iOS folds the pan's controls away.* `controls.pan` (iOS).
- *The web gives the water for a heat-off hot start under the total. iOS gives
  it beside the Water stepper.* `readout.sub.standing` (web).
- *While cooking, iOS's subline reports the alarm.* `readout.sub.cookingCold` and
  `readout.sub.cookingHot` (web).
- *The stats differ. iOS shows peak yolk, peak white and after the boil; the
  web shows peak yolk, after the boil and water boils at, and iOS shows the
  last of those in its fold.* `readout.stat.peakWhite` (iOS).
- *iOS has no line under its main button.* `action.hint.cold`,
  `.hotStanding`, `.hotBoiling`, `.whiteNeverSets`, `.heating`,
  `.heatingStanding`, `.cookingStanding`, `.cookingBoiling` and `.pull` (web).
- *The web's reading under the doneness slider follows the thumb with a
  temperature. iOS shows the bare word in the label's row.*
  `controls.doneness.value` (web).
- *The web measures the egg in three fields. iOS uses a mass slider.*
  `controls.measure.legend`, `.weight`, `.girth`, `.minor` and `.hint` (web).
- *Only the web offers a custom egg temperature.* `controls.eggFrom.custom`,
  `controls.eggTemp` and `controls.eggFrom.hint` (web). If the Fridge and Room rows
  go in, the hint no longer needs the temperatures, and can be cut to "Pick
  Custom if yours differ." That also drops "Assumed temperatures", which has
  no speaker.
- *iOS changes the line under the after-boil choice with the choice. The web
  shows one line for both.* `controls.afterBoil.explainHold` (iOS).
- *iOS asks before it forgets. The web forgets on one tap.*
  `learned.confirm.title`, `.forget`, `.keep` and `.message` (iOS). **For the
  owner:** should the web ask too? If it should, these become shared.
- *iOS shows the name as the navigation title. On the web it is a run-in
  bold heading, so it ends in a full stop.* `app.name` (iOS), `colophon.name`
  (web).
- *Only the web's colophon links to the source.* `colophon.link` and
  `colophon.tail` (web).

**Leftovers: orphaned (10).** Nothing in the other app answers to these keys.

- `readout.phase.cooling` (iOS), "Cooling", is **dead**. It is drawn only
  while a counter rest is cooling, but a counter cook never cools. `Cook.swift`
  sets no cooling deadline for it, so it goes from the pull straight to Done,
  as the web's machine does. Delete it.
- `controls.start.hint` (web) is live. iOS shows a line under Start only in
  sous-vide (`controls.start.hintSousVide`). It could show this one in the
  same place, and the key would then be shared.
- `learned.forgetExplain` (iOS) is live. The web's Forget button has no
  explanation beside it, and it could carry this one.
- `cook.summary`, `cook.method`, `cook.method.cold`, `.hot`, `.ice`, `.tap`
  and `.counter` (iOS) are live. Mid-cook, iOS replaces its hidden controls
  with what is in the pan. The web hides its controls too (`styles.css`)
  and puts nothing in their place, so it has the gap that iOS closed.

**Also not quite true, found on the way.** These are not pairs, but they are
worth a line each:

- `readout.alarm.denied` and `.failed` (iOS) end "— keep the app open". The
  app makes no sound of its own and does not keep the screen awake, so
  keeping it open helps only if the cook is watching it.
- `learned.pan` (web), "your pan takes {time} to boil", has the same fault as
  the held-back `readout.sub.coldAssumes`. `{time}` is `estimateTimeToBoil`:
  a blend of past boils, or the nearest volume's time scaled by litres.
- `action.hint.pull` (web), "cooling starts on its own in {seconds} s", is
  also shown for a counter rest. There nothing starts: the cook goes to Done.

**A guard, described only.** A new test in `test/copy.test.ts`, beside 6a,
which already checks that each key's `apps` matches the code:

- `copy/surfaces.json` gains `"platform": "ios"` on `notification.title`,
  `notification.body`, `lockscreen`, `island.expanded` and `island.compact`,
  and `"platform": "web"` on `a11y`.
- An entry whose `apps` names one app passes if its surface's `platform` is
  that app. Otherwise it must carry a `why`: a non-empty string that says
  what the other app does instead. The test fails on anything else, and also
  on a key whose surface belongs to one platform but which names the other
  app.
- Keys that would need a `why` once the pairs above are merged: the 7
  platform-only features, the 46 layout keys and the 9 live orphans, 62 in
  all. The first line of each group above is a draft of its `why`.
  `readout.phase.cooling` is deleted, not excused. Any pair the owner
  declines adds both its keys to the list.

## 4. Units

**One setting: Metric or Imperial.** Its default comes from the platform:

- iOS: `Locale.current.measurementSystem`, and the temperature preference users
  can set in Settings on iOS 16 and later.
- Web: the region in `navigator.language`. The only default region that gets
  Imperial is `US`.

After that, the setting is the cook's.

**Core stays in SI.** This is invariant 3 already: "convert only at the UI
boundary". The new work is making both UIs convert *identically*. That means a
`units.ts` in core, fixtured like `policy.ts`, which owns three things:

- the conversions
- the display precision and input step for each quantity in each system
- the round trip

The round trip matters. A cook who types 2.4 oz must see 2.4 oz again, not
2.39, however that value was clamped in SI underneath. The rule is to store SI
and display the value rounded to the unit's step. A field is re-parsed only when
the cook edits it, which is the trick the web's measurement fields already use.

| quantity | metric | Imperial | step |
|---|---|---|---|
| egg start, bath, peak yolk, boiling point | °C | °F | 1 °F; boiling point to 0.1 |
| egg mass | g | oz | 0.1 oz |
| girth | mm | in | 0.1 in |
| width | mm | in | 0.02 in |
| altitude | m | ft | 100 ft |
| water | L | US quarts in the US, imperial pints elsewhere | 0.25 |

- **Every temperature on screen carries its unit.** A bare "°" goes, including
  in the preset labels.
- **Size classes follow the region, not the unit or the language.** Decided 26
  September: region `US` gets the classes printed on an American carton, and
  everywhere else keeps the EU ones. The difference is large. USDA defines each
  class by a minimum weight per dozen (Small 18 oz, Medium 21, Large 24, Extra
  large 27, Jumbo 30), and a class runs from its own minimum up to the next one.
  The app should use the midpoint of that range, not the minimum. Cook times
  below are for jammy, fridge-cold, into boiling water, then an ice bath:

  | class | US range, g per egg | US midpoint | EU mass in the app | jammy, US | jammy, EU | gap |
  |---|---|---|---|---|---|---|
  | Small | 42.5-49.6 | 46.1 | 48 | 6:02 | 6:12 | 10 s |
  | Medium | 49.6-56.7 | 53.2 | 58 | 6:38 | 7:01 | 23 s |
  | Large | 56.7-63.8 | 60.2 | 68 | 7:11 | 7:45 | 34 s |
  | Extra large | 63.8-70.9 | 67.3 | 76 | 7:42 | 8:19 | 37 s |
  | Jumbo | 70.9 and up | ~74 | - | 8:13 | - | - |

  Near 60 g, a gram is worth 4.4 s. An American Large is therefore half a
  minute from an EU Large, which is three times the width of "just right". The
  app's default egg is an EU Large, so **every American who has not weighed an
  egg is being overcooked by about 34 s today**, in metric or Imperial alike.
  That makes this a correctness fix that happens to sit in the localisation
  phase. It is not a nicety.

  Two details:

  - Jumbo has no upper limit, so its 74 g is a guess. The US has no class
    between Extra large and Jumbo that the EU would call XL.
  - README §6 already warns about exactly this confusion, and the app should
    take its own advice.
- **The record stays SI.** The record in `INFERENCE.md` §4 does not care what
  the cook saw. It gains `units` only so that the fit can check whether
  rounding at input shows up in the residuals.

**As built, in F3 (27 September).** Where it settled differently, or more
precisely than the table above:

- **Metric steps are the web's old inputs**, rounded to what they showed:
  1 °C, boiling point 0.1 °C, 1 g, girth 1 mm, width 0.5 mm, 50 m, 0.25 L. Two
  iOS controls moved to the table: the weight slider from half grams to 1 g,
  and the altitude stepper from 100 m to 50 m.
- **Water under Imperial is the US quart in region US and the imperial pint
  elsewhere**, from the region alone, like the size classes.
- **Bounds round inward, and the display stays inside them.** A value clamped
  to the SI floor can round to a point just outside the input's bounds (25 g is
  0.88 oz, the input's floor is 0.9); it shows as the bound, so an input never
  holds a value it calls invalid.
- **A typed number is not snapped.** The model cooks what was typed; the
  display rounds it. 2.43 oz cooks as 2.43 and reads 2.4 after a reload.
- **The iOS default reads three signals** and core decides between them: the
  temperature preference first (it reaches `Locale` as the `mu` keyword, so
  `UnitTemperature(forLocale:)` sees it), then the measurement system, where
  only `us` is Imperial - the UK system is miles on the road and grams in the
  kitchen - then the region. An American who set Celsius starts in metric; an
  Australian who set Fahrenheit starts in Imperial.
- **The explicit choice is stored as a choice**, `null` until the cook makes
  one, and stays a choice when it equals the default. A cook's own change of
  system raises `aet:unitsflip` on the web and posts `.unitsFlipped` on iOS,
  with `metricToImperial` or `imperialToMetric`. That is all F6 gets from F3.
- **Numbers are plain digits with a point in both apps**, from core's
  `displayText`. iOS used the device locale for two readouts (the boiling
  point and the weighed mass); those now print the same digits as the web
  until F4 moves every number to the platform formatters. (F4 did: §2.
  `displayText` stays plain for the web's inputs; what a cook reads is
  `quantityText`, in the formatting locale.)
- **Every inserted value stands alone** where a sentence was touched: "peak
  yolk 65 °C", "bath 58 °C", "Assumed temperatures — fridge: 4 °C, room:
  20 °C", "a full boil (100 °C)", "This bath (58 °C)", "with this much water
  (2.00 L)". The sous-vide warning's 60 °C is a constant now, so it converts.
- **Three length budgets rose for the unit**, because °F is a digit longer
  and "65 °C" a space longer than "65°C": the Lock Screen line 29 -> 33, body
  251 -> 260 (the sous-vide warning), and a11y 88 -> 101 (its announcement).

## 5. Languages

**The first one is Czech**, decided on 26 September. A friend of the owner will
review it. Czech is a harder test of the machinery than German would have been,
in three ways:

- **It has four plural categories, one of them for fractions.** `Intl` gives
  `one` for 1, `few` for 2-4, `other` for 0, 5, 21 and 22, and `many` for 1.5.
  So "1 vejce", "3 vejce", "5 vajec", and a fourth form for a fractional count.
  A catalogue that only knows *one* and *other* fails on the first egg count.
  The fixture should include 1.5 litres and 2.5 minutes.
- **It has seven cases, and this matters most.** A message of the form
  "{wanted} isn't reachable … Softest here is {limit}" inserts a doneness word
  into the middle of a sentence. In Czech that word would need declining to fit
  its slot, and a placeholder cannot do that. Declension tables per placeholder
  would work, but they would be a machine built for one language. So there is a
  **rule for every language**: **an inserted word always stands alone, in its
  dictionary form**, after a colon or as a label, never inside running grammar.
  "Nejměkčí možné: {limit}" works in every language. F2 rewrites the five
  refusal messages to that shape, in English too.
- **It uses the decimal comma, a space as the thousands separator, and a
  24-hour clock.** `Intl` gives "1 234,5" and "15:05", and Foundation must
  agree, which the fixture pins.

**The app's "I" has a gender in the Czech past tense.** "I remembered" is
*zapamatoval jsem* (masculine) or *zapamatovala jsem* (feminine). Because the
app speaks in the first person (§3), a Czech translation must either pick a
gender for it or avoid first-person past forms. The present and future,
*zapamatuji si*, carry no gender. This is the reviewer's call; the
recommendation is to avoid the past.

**Its egg vocabulary is its own.** *Na měkko*, *na hniličku* and *natvrdo* are
phrases, not adjectives, and *na hniličku* ("slightly soft-set") is a Czech place
on the scale that English has no word for. The reviewer places them. Neither
the machine drafting the Czech nor this file does.

**Doneness words are not translated. They are matched.** *Na hniličku*,
*mollet*, *jammy* and *soft* are culturally placed, not synonyms. Each language picks its
own words for the five anchors, and the anchors stay at the same dose. The
per-cook taste offset absorbs the remaining difference for each cook. Pooled
data can then show whether "soft" in one language sits somewhere else on the
dose scale than in another (§6).

**Quality bar.** A translation can be drafted by machine. It does not ship until
someone who speaks the language, and cooks, has read it on the screen. An
unreviewed language stays behind a build flag.

**Not localised.** The README, LOGBOOK, PLAN and code comments stay in English.
The App Store description and screenshots are localised, and the steps belong in
`ios/RELEASING.md`.

## 6. The easter egg: Imperial units in the English of 1750

When an English-language UI is switched to Imperial, every string also switches
to the pompous prose of the eighteenth century. Fahrenheit published his scale
in 1724, so the period is justified.

**It is a language, with a language code of its own.** Decided 26 September.
The tag is the cook's own English locale with a private-use subtag, as BCP 47
provides: `en-US-x-1750`, `en-GB-x-1750`, `en-AU-x-1750`. Everything
maintainable about the joke follows from that:

- **Strings come from the subtag, formats from the rest.** The catalogue is
  `copy/en-x-1750.json`, and a missing key falls back to `en`. Numbers, clocks
  and the measurement system come from the region, and **both platforms already
  do this with no special-casing**. Measured on 26 September, `Intl` in Node and
  `Locale` in Foundation give the same answers for every tag: `en-US-x-1750`
  formats as en-US ("3:00 PM", US system) and `en-GB-x-1750` as en-GB ("15:00",
  UK system). An American in 1750 English keeps their clock, and a Briton keeps
  theirs.
- **It is one row in the language picker.** Both apps get an in-app picker
  (with F5, not F1: see §2) in any case, because the catalogue is ours and not Apple's. iOS's own
  per-app language setting would not list a private-use tag anyway. The picker
  shows it as *English (1750)*, which is the discoverable way in, and choosing
  *English* is the way out. That replaces the escape hatch this section used to
  need: a cook who wants °F in modern English picks English and keeps
  Fahrenheit.
- **It is under the same tests as any other language**: placeholder parity, the
  length budget, and the conformance fixture.

**Two ways in.**

1. **The picker**, for anyone.
2. **The switch.** When a cook whose UI is in English flips units from Metric to
   Imperial, the app also sets the language to 1750. Flipping back to Metric
   restores the English they had before. Changing the language never touches the
   units, so this runs in one direction only.

**Discoverable for Americans, reluctantly.** Units default from the region
(§4), so an American starts in °F and modern English and never makes the switch.
Two small things find them:

- the picker row above;
- in an English UI, a single line under the Imperial option: *"Imperial units
  are also available in the English of their period."*

Nothing is pushed, and there is no first-run prompt. The joke is better found
than delivered.

**The style guide is Samuel Johnson**, specifically the *Preface to a
Dictionary of the English Language* **as first printed in 1755**. The owner chose
it on 26 September and reviews the catalogue against it. There are three
texts, and which one is used matters:

- **The authority is the 1755 folio**, volume 1, scanned at archive.org as
  `bub_gb_nCJWAAAAcAAJ`. Its OCR cannot be used as text: it reads every long s
  as *f* (*thofe*, *difmifs*), and Google's OCR also nudges archaic spellings
  toward modern ones.
- **The working text is Jack Lynch's transcription** (jacklynch.net/Texts/
  preface.html). It is taken from the first edition, keeps the spelling, and
  drops the long s, which is exactly the form this catalogue wants. Link to it;
  do not vendor it, because the notes and paragraph numbers are his.
- **Not Project Gutenberg ebook 5430**, which this section first used. It
  follows Johnson's revised Preface of 1773 (*explanation* for *explication*,
  *surely* for *freely*, "the paths through which" for "the paths of"). It
  modernises some spellings (*recompense*, *registered*), misreads *fewel*
  (fuel) as *jewel*, and inserts editorial translations and a footnote.

The rules below come from Lynch's text, counted by script (9,335 words). The
page images were spot-checked where it mattered. The capitals and archaisms
findings are the same in both editions.

- **No capitalised common nouns.** The text prints nouns in lower case. It
  capitalises proper names, deliberate personifications ("Learning and Genius"),
  and now and then the subject under discussion (*Orthography*, *Etymology*).
  A capital therefore marks a personification or a topic, and there are few of
  either: Time, perhaps, or Heat.
- **No stage-play archaisms.** *'tis*, *pray*, *forthwith*, *whilst*, *thee*,
  *thou*, *hath* and *doth* occur **zero** times. They make an imitation of the
  period, not the period itself. Johnson's own connectives are *hitherto* (7),
  *likewise* (8), *therefore* (17) and *perhaps* (17). A test fails the
  catalogue if any of the eight appears.
- **His spellings, as a fixed table, and not completist.**
  `copy/en-x-1750.spelling.json` maps the modern form, American or British, to
  the 1755 one, and a test fails if the catalogue uses a modern form. The table
  starts with what the 1755 text attests and grows when a string needs a word
  it lacks:

  | pattern | 1755, as printed |
  |---|---|
  | *-our* where modern English has *-or*, even in British spelling | *errour*, *authour*, *superiour*, *tenour*, *translatour* |
  | *-our* where American English has *-or* | *labour*, *honour*, *favourite*, *colouring*, *endeavour*, *rigour*, *ardour* |
  | *-ick* for *-ic* | *publick*, *criticks*, *domestick*, *academick*, *exotick*, *fabrick*, *characteristicks* |
  | *-ce* for *-se* | *expence*, *recompence*, *licence* |
  | *-ize* for *-ise* | *surprize*, *enterprize* |
  | single words | *shew*, *shewn*; *enquire*, *enquiry*; *croud*; *stile*; *chace*; *persue*; *recal*; *registred*; *intire* beside *entire*; *oeconomy*; *fewel* |

  *Errour* is the one the cook will meet most often. *Fewel* is the one an egg
  timer could actually use: it is what the fire burns.
- **The figures that carry the voice.**
  - Antithesis in balanced pairs: "to search was not always to find, and to find
    was not always to be informed".
  - Triads.
  - Latinate abstraction.
  - The general maxim drawn from a particular case.
  - A melancholy, self-deprecating first person, the lexicographer as "the
    slave of science".
  - Semicolon chains: 0.93 semicolons per sentence.
- **Two lengths, because the text has two.** Its median sentence is 43 words
  and its 90th percentile is 79. That suits a hint or an explanation, and it is
  impossible on a Lock Screen. On the small surfaces the voice comes from the
  aphorism rather than the period, which is a mode Johnson also writes in: "To
  have attempted much is always laudable." Antithesis survives compression.
  Length does not.
- **The lexicon is his Dictionary.** When a word's period sense is in doubt,
  check the Dictionary, which is searchable at johnsonsdictionaryonline.com. One
  word already earns its place: **rear**, adjective, "Raw; half roasted; half
  sodden". That is exactly the soft end of the doneness scale, and it is the
  word the 1750 catalogue should use there. *Jammy* and *fudgy* are anachronisms
  and are matched the same way as for Czech (§5), not translated.
- **No long s (ſ) in body text.** Screen readers announce it and search does not
  match it. It appears once, on the title, echoing the Dictionary's own title
  page ("in which the words are deduced from their originals"), behind an
  accessibility label that reads without it:

  > *The Actual Egg-Timer: in which the times of boiling are deduced from their
  > cauſes, and illuſtrated in their different degrees of hardneſs.*

**Drafts, for the owner to strike through.** They are here to show what the
rules produce, not to be shipped. Where F2 will rewrite the modern string, the
modern column shows the proposed rewrite, which is what the 1750 shadows.

| surface | modern | 1750 draft |
|---|---|---|
| alarm title | Eggs out — now | Out with them; delay is ruin |
| alarm body | Straight into the cooling, or the yolk keeps cooking. | Commit them at once to the cold; for heat, though withdrawn from the fire, is not yet withdrawn from the egg. **Approved by the owner, 26 September.** |
| second alarm | Cooling done | The cooling is ended |
| refusal, counter rest | Resting on the counter keeps cooking the yolk. Softest possible: {limit} | An egg left upon the table does not cease to cook because it has ceased to boil. Softest attainable: {limit} |
| still learning | (new, E2) | It is yet learning your kitchen; to search is not always to find. |
| reset dialog | Forget everything it has learned? | Shall all that has hitherto been learned be forgotten? |
| yolk question | How was the yolk? | In what condition was the yolk? |
| yolk answers | Too soft · Just right · Too hard | Too rear · As was desired · Too hard |

The answer buttons change least, on purpose. They are data (rule 3 below), and
every word of flourish on a button is a way for the fit to read taste where
there is only style.

**Four rules keep the joke from costing anyone a breakfast:**

1. **Substance is not exempt.** Every string says what its modern twin says, and
   no instruction is lost to the flourish. The owner's review of the rewrite in
   §3 covers this catalogue too.
2. **The length budget binds hardest here.** "Eggs out — now" has to fit the
   Dynamic Island, and "Pray remove the Eggs from the Water forthwith" does not.
   On the small surfaces the register gets two or three words of period flavour,
   not a paragraph.
3. **The feedback answers keep their meaning.** They are data, so the record in
   `INFERENCE.md` §4 carries the register alongside the language. The fit can
   then tell whether "Unset" in 1750 is answered differently from "Runny" in
   2026. It probably is. That would be the funniest result this project could
   produce.
4. **Leaving is one tap and keeps °F.** Choosing *English* in the picker is
   enough, so that a non-native reader, or anyone who reads with difficulty,
   never has to give up their units to understand their timer. In the register,
   the picker's footnote may say: *"Should the Reader find this Style tiresome,
   the Modern Tongue may be restored without surrendering Fahrenheit's Scale."*

## 7. Order, and how it fits with Phase E

1. **F1, the catalogue.** Extract every string with the wording unchanged, and
   prove it byte-identical. Core stops returning English. Do this before E2,
   because E2 is the next phase to write feedback copy, and its new strings
   should be born in the catalogue rather than migrated into it later.
2. **F2, the rewrite**, inside the catalogue. The owner approves one diff. This
   runs alongside E2 and E5, which rewrite the feedback and learned-note copy
   anyway.
3. **F3, units.** `units.ts`, the setting and the regional default, size classes
   by region, and a unit on every temperature.
4. **F4, locale formatting.** Numbers, plurals, the 12- or 24-hour clock, and
   weekday names.
5. **F5, Czech**, reviewed by the owner's friend.
6. **F6, 1750.** It comes last because it needs F1's catalogue, F3's setting and
   F2's settled modern wording to shadow.

E1's record gains `lang`, `register` and `units`. That is three short strings
with no privacy cost beyond what `app` already reveals. They should be added
while the schema is still unwritten.

## 8. Decisions

Taken by the owner, 26 September 2026:

- **1750 is a language code**, `<region>-x-1750`, reached by the picker or by
  switching an English UI to Imperial, and left by picking English (§6).
- **Americans should be able to find it**: a picker row and one line under the
  Imperial option, and nothing more insistent.
- **Support burden is not a design constraint.** The app is free. Feature
  requests come as pull requests. No choice in this file is made or unmade on
  the grounds that it will generate questions.

- **Czech is the first language after English**, and a friend of the owner
  reviews it (§5).
- **US carton classes in region `US`** (§4). Measured, the gap is 34 s at
  Large, so this is a correctness fix for Americans in either unit system.

- **The owner reviews the 1750**, against Johnson's *Preface* (§6).

Taken by the owner, 27 September 2026, and built the same day (§2):

- **No time of day zero-pads its hour**, in either app, in any locale:
  "9:05", never "09:05". The countdown is not a time of day. This settled
  en-CZ, where the web wrote "09:05" and iOS "9:05".
- **Numbers follow the UI's language**, and the region only where the
  language has no convention of its own: a Czech UI writes "1 234,5" in the
  US as in Czechia, on both apps. English keeps following the region, so
  `en-DE` still writes "2,4".

Waiting on the owner, from 27 September:

- **The two drafts in §3.** The E2 feedback draft is implemented, since the call
  was made while the owner slept, and remains open to revision. The draft for
  the rest of F2 is not in the catalogue yet.
- **`Intl` inside `src/core/format.ts`.** F4 relaxed invariant 1 for this one
  file. The web's output therefore depends on the browser's ICU, while the
  fixtures are pinned against Node's. Safari has not been tried.
