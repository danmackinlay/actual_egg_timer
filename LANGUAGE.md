# LANGUAGE.md — words, units, and languages

How both apps get their words, units and languages, and the rules the words
are held to. Built: the catalogue (F1), units (F3), locale formatting (F4)
and the English of 1750 (F6), in both apps. Not built: Czech (F5), which waits
for its reviewer. The owner's decisions on all of it are in `DECISIONS.md`
(12-17, 22-23, 28-30). What changed the wording, and why, is in the
history and in the `LOGBOOK.md` entry of its day; what the owner has yet to
read is the review queue (§3).

---

## 1. Why one catalogue

Until 27 September 2026 the two apps typed their sentences separately, and
nothing but care kept them together: the five refusals were in the web's UI
code and again in the iOS planner. That is the failure `src/core/policy.ts`
was created to end for numbers. Core also returned English in three places
(the doneness anchors, the size-class labels and the sous-vide durations),
and English grammar was written into the code (`egg${n === 1 ? '' : 's'}`, a
hand-made 24-hour clock, seven English weekday names). None of that survives
a second language, and the 24-hour clock does not survive an American.

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
  `test/data/surfaces.json` holds one budget per surface, not per key: a per-key
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
- **The privacy page (`privacy/index.html`) is outside the catalogue**: plain
  English only, no 1750 twin and no translation, because it is a statement
  that must mean exactly one thing, and its speaker is the owner, not the
  app (`DECISIONS.md` 51). Only the Help link to it, `help.privacy`, is copy.
- **The language picker** came with F6, not F1: a picker with one row in it
  is a control that does nothing. The active locale is plumbing
  (`ACTIVE_LOCALE` in `src/ui/copy.ts`, `Copy.activeLocale` in
  `ios/EggTimerCore/Sources/EggTimerShared/Copy.swift`) that the picker sets.
- **Inserted words are still lower-cased in code**, because some templates
  insert a doneness word or a headline mid-sentence. `midSentence` (the core
  copy module, both apps) lower-cases only the first letter, in the
  catalogue's language, so "Last Wednesday" reads "last Wednesday". A
  rewrite that stands every inserted word alone (§5) would remove the need.

**Regional overlays** (3 October 2026, `DECISIONS.md` 55). English is one
language with one catalogue, `copy/en.json`, and it is Australian. A region
whose kitchen says some things differently gets an overlay holding only those
keys: `copy/en-US.json` has four, "pot" for the pan. Where a neutral word
serves every English, the base uses it and needs no overlay: the eggs cool in
running water or in the air, not under a cold tap or on a bench
(`DECISIONS.md` 57).

- **Which catalogues render a language** is `catalogueChain`, in core for
  both apps and fixtured: modern English gains the overlay for the region of
  the device's own English. That is the first English tag in the phone's
  preferred languages (`Locale.preferredLanguages`), or else its region; the
  web has one tag, `navigator.language`, and follows its region. So English
  (Australia) on an American phone reads Australian, and English (US)
  anywhere reads American.
- **The language stays `en`.** The picker, `<html lang>`, the record's
  `lang` and the units switch never see an overlay's tag; only the words
  move. The English of 1750 has no overlay, and may lag the English (§3).
- **An overlay cannot go stale unseen.** Each entry carries `base`, the
  English it was written against, and `copy.test.ts` 7a fails when the two
  part, so a wording change to an overlaid key rewrites the overlay too.
- A British overlay ("worktop") waits until someone asks for one.

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
  `navigator.language`, iOS from `Locale.current`. `forceFormatLocale` pins
  the whole tag for a test.
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


## 3. Copy rules

**The criteria**, which every string is held to:

- Say what to do.
- When a caveat cannot be put plainly, say its consequence, not its mechanism.
- Use no term that only this repository uses ("carryover", "calibration",
  "literature values", "the model", "standing method" all failed this).
- Every temperature carries its unit (§4), and every inserted word stands
  alone, after a colon or as a label, never inside running grammar (§5).
- Say it as a person who cooks would (`DECISIONS.md` 54): the point once,
  literally, in plain sentences, with "because" or "since" for a reason.
  None of the marks of machine prose: a dash as a pivot, two clauses
  hinged on a semicolon, "X, not Y" for effect, a list of three for its
  rhythm, a wry last line, a pet word repeated ("predictable", "teaches
  me"). An aside another string already says is cut. The 1750 register is
  exempt: its semicolons and its stately asides are the joke.
- Curly apostrophes and quotes, never straight ones: ’ ‘ ’ “ ”
  (`DECISIONS.md` 56; `copy.test.ts` 3c).
- Name what a cook sees by what it tells them, not only by where it sits,
  and use the house terms (`DECISIONS.md` 57): the line under the countdown
  is "below the time display"; the cooling methods are "an ice bath",
  "running water" and "the air".

**The app speaks in the first person singular, in the active voice**
(`DECISIONS.md` 28): "Tap the boil … and I'll remember for next time", not
"it's remembered". The app is "I", the cook is "you", and a sentence has
someone doing something. Instructions stay imperative. It matches the 1750
register, since Johnson's *Preface* is in the first person (§6), and it has a
cost in Czech (§5).

**The owner's wording rules** (`DECISIONS.md` 26, 29):

- Never narrate what the interface visibly did.
- Sous-vide is not "a bath". "Ice bath" stays.
- "Pan" only where it means the pot. The boil-time memory is keyed by water
  volume, so it is "how long your water takes to boil", not "your pan".
- "Boil" is never a noun (`DECISIONS.md` 78): water is "boiling hard", not
  "at a full boil", and the setting is "Once it’s boiling". "Brought to
  the boil" and "to the boil" stay, and so does the button's name, "Full
  rolling boil", wherever text names it.
- The (i) is short enough to read standing at the hob; the whole story goes to
  Help (`UI.md` §7).
- Wording is judged in place on a phone, not approved row by row in a table
  (`UI.md` §6).

**How a wording change is made, read and approved** (`DECISIONS.md` 106).
Every word is in `copy/*.json`, and `npm run copy:literals` keeps words out
of the Swift code, so what a change does to the words is the catalogue's
diff. `CLAUDE.md` has the steps.

- **Made**: an edit to `copy/en.json`, in both apps, with each
  `copy/en-US.json` entry it reaches and that entry's `base` (§2), each
  string within its surface's budget (`test/data/surfaces.json`); then
  `npm run fixtures`.
- **Approval is stored.** `test/data/copy-review/approved.json` holds, per
  key, the English the owner approved and its hash. It began from the
  English of `e3a81cb` (the `notes` draft, 3 October 2026), the last time he
  read every string.
  Every key whose English hashes otherwise (changed), that has no approval
  (added), or that has one and is gone from the English (removed) is the
  review queue: generated, never typed. `npm run copy:queue` prints it, each
  key with its approved and current English and its apps. The queue never
  fails a build; a malformed `approved.json` does (`test/copyQueue.test.ts`).
- **Read** on a phone: `npm run copy:review` writes `copy-review.html`
  (gitignored), one file with no script and no network, light or dark. For
  each key: the approved English against today's, word by word; the 1750
  twin, and whether it is stale or missing; the en-US words; the surface's
  budget against the longest rendering, as `copy.test.ts` 5a measures it;
  which apps say it; and its note. The words are still judged in place, in
  the apps (`UI.md` §6); the page says what to look at.
- **Approved** on the owner's word, never on an agent's judgement:
  `npm run copy:approve -- <key…|--all>` stamps today's English for those
  keys. A removed key named, or `--all`, drops its approval. `--at <ref>`
  stamps a commit's English instead, which is how the file began
  (`--all --at e3a81cb`).

A string the owner has approved (the `alarm.pull.*` bodies,
`alarm.cooled.body`, `idle.welcome`, `activity.note.estimate`) was approved
as good enough for now, not as final (`DECISIONS.md` 54): a style pass reads
it like the rest, and a change puts it back in the queue.

**The twins may lag the English** (`DECISIONS.md` 103). A translation's
twin need not be rewritten in the commit that changes its English; the
twins are written in batches. Each translation has a sidecar,
`<tag>.base.json` beside the approvals (today
`test/data/copy-review/en-x-1750.base.json`): per key with a twin, the hash
of the English it was written against (`base`); per key left to English on
purpose, the hash of the English it was judged at (`english`, today only
`app.name`). A twin whose English has moved since is stale, and keeps
showing. A key with no twin that is not left to English is missing, and
renders in English (`src/core/copy.ts`). The queue and the page list both,
and neither fails a build. Once a twin is rewritten,
`npm run copy:approve -- --translation <tag> <key…|--all>` stamps it; a key
named that has no twin is stamped as left to English. No app reads the
sidecars or the approvals, so they are kept out of `copy/`, which holds
only catalogues (`en1750.test.ts` 1a): the site and the iOS bundle ship
that folder whole. Czech (F5) gets the same by adding its catalogue and
stamping it. A regional overlay may not lag: it keeps its own `base`, held
by `copy.test.ts` 7a (§2).

**Rules the drafts settled, which stand:**

- **No "tap" for the screen gesture** (5 October 2026, the owner's: "not
  global English", and "then tap" read as tapping the eggs). A button is
  pressed, or named alone where there is no room for a verb. "Tap" for the
  kitchen fitting went earlier (`DECISIONS.md` 57).
- **An object never stands in for the data about it** (3 October 2026, the
  owner's): what the app keeps and sends is a **result** (one cooked egg:
  how it was cooked and how it came out), and "egg" is only the physical
  egg. The settings, a kitchen and a cooking session are named as
  themselves.

**History.** Until 9 October 2026 each wording change was a named draft,
`tools/drafts/<name>.ts`: every key it changed, before and after, with its
1750 twin, proved by `copyLiterals --since` and `copySnapshot compare
--draft` to have changed only what it listed, and this section held a table
for each draft under review. The fifty drafts, `feedback` to `alarm`, are in
git (`git show bfd11fa^:tools/drafts/<name>.ts`), and each one's reasoning is
in the `LOGBOOK.md` entry of its day. Those after `notes`, `data` to
`alarm`, are what the review queue began with.

## 4. Units

**One setting: Metric or Imperial.** Its default comes from the platform:

- iOS: `Locale.current.measurementSystem`, and the temperature preference users
  can set in Settings on iOS 16 and later.
- Web: the region in `navigator.language`. The only default region that gets
  Imperial is `US`.

After that, the setting is the cook's.

**Core stays in SI.** This is `CLAUDE.md` invariant 3: "convert only at the UI
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
  and the altitude stepper from 100 m to 50 m. **Since 4 October 2026 the
  egg's mass steps in half grams again**, the owner's step for the − and +
  beside every number, and shows only the decimals it needs ("58 g",
  "58.5 g"; `trim`, metric mass only). A size class is still named to the
  whole gram ("Extra large — 67 g").
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
  system is a flip, `metricToImperial` or `imperialToMetric`: on the web
  `onUnits` hands it straight to the language (an event, `aet:unitsflip`,
  until 28 September), and iOS posts `.unitsFlipped`. That is all F6 gets
  from F3.
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
  in any case, because the catalogue is ours and not Apple's. iOS's own
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
   changes nothing about the language: the cook leaves 1750 with the picker
   (`DECISIONS.md` 77, 5 October 2026; until then it restored the English
   they had before). Changing the language never touches the units, so this
   runs in one direction only.

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
  `test/data/en-x-1750.spelling.json` maps the modern form, American or British, to
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
   no instruction is lost to the flourish. The owner's review of the modern
   wording covers this catalogue too.
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

**As built (web), 28 September 2026.** Built while the owner slept; the
whole catalogue is for their review (`DECISIONS.md` 17).

- **The catalogue** is `copy/en-x-1750.json`: at first every key the web
  used, the six new F6 keys, and three of iOS's alarm keys (below); now every
  key but `app.name`. It falls back to `en` for the rest. Placeholder parity and the budgets come from
  `test/copy.test.ts`, which reads every catalogue; the conformance fixture
  (`fixtures/copy.json`) now renders it too, so the Swift renderer is held
  to it byte for byte. Both needed their file filter to take a digit in a
  tag and skip a file with a second dot, which is the spelling table.
- **Its rules are `test/en1750.test.ts`**: the eight archaisms as whole
  words, straight or curly apostrophe; `test/data/en-x-1750.spelling.json` (47
  modern forms, seeded from the table above) as whole words, ignoring case;
  the long s only in `app.titlePage`; the owner's alarm word for word; Help's
  links the same URLs in the same markdown; the switch; the record.
- **The switch is `src/core/language.ts`**, pure and tested, for iOS to
  port. The state is `chosen`, null for the default. Metric to Imperial in
  modern English goes in; Imperial to metric changes nothing; a pick in the
  picker is the only way out, and choosing English keeps °F. Until 5
  October 2026 (`DECISIONS.md` 77) the state also kept `flippedFrom`, what
  the switch replaced, so that Imperial to metric could restore it; a
  stored state that still has it reads as its `chosen`, so no storage key
  changed. The web's `onUnits` calls `languageAfterFlip` itself. Nothing
  here touches the units.
- **The web** stores the state in its settings, loads the catalogue the
  cook last read before painting, and redraws every word in place when it
  changes (`relabel` in `src/ui/update.ts`); a page switched in place and the same
  page loaded fresh were compared word for word and label for label.
  `<html lang>` is `en-x-1750`. The record's `lang` is the catalogue tag,
  `en-x-1750`, and its `register` is `1750` (`registerOf`).
- **The picker** is a Language row under Units in Settings: *English* and
  *English (1750)*, named alike in both catalogues so either can be found
  from the other, with an (i). The 1750 (i) is the footnote above, in lower
  case and with *stile*. The line under Imperial shows on any English page,
  1750 included, in its own twin.
- **The title** heads the egg's page while idle, in 1750 only, as an `h1`
  whose `aria-label` is the same text with every long s an s (`applyCopy`
  does this for any text with a long s, and the test allows only one).
  The colophon's name is *The Actual Egg-Timer.* The `<head>` keeps the
  modern name, as for every language (§2).
- **A period face**, since 3 October: *The face*, below.

**Where it departs from the guide, or chose where the guide was silent.**

- **The alarm's budget.** The approved body is 109 characters, and
  `notification.body` allowed 53. The budget is now 110, on the grounds
  that the owner approved that line for that surface; not yet seen on a
  device. `alarm.pull.title` is *Out with them*, not the draft's *Out with
  them; delay is ruin* (28, against 14). The draft's second alarm, *The
  cooling is ended*, is *Cooling ended*, for the same reason.
- **The reset dialog** is *Shall it all be forgot?*, not the draft's *Shall
  all that has hitherto been learned be forgotten?* (54, against the title
  budget of 23). **The yolk question** is the draft's, *In what condition
  was the yolk?*
- **The yolk answers** are the draft's, *Too rear · As was desired · Too
  hard*, although modern English has since settled on *Too firm*: *hard*
  is Johnson's word and means the same. The white's are *Unset · Tender ·
  Firm*, *Unset* after rule 3's own example.
- **The doneness words** are *Rear · Soft · Thick · Firm · Hard*, five
  letters at most for the ticks. *Thick* and *Firm* stand where *jammy* and
  *fudgy* do, matched and not translated; the texture lines say *yolk
  thick*, *yolk firm*. *Firm* is also the white's third answer, as *firm* is
  in modern English.
- **Names that change**, for the owner to strike: Settings is
  *Particulars*; Help is *Preface* (its page *The Preface*); Sources are
  *Authorities*, as in the Dictionary; Units are *Measures*, and Metric is
  *Metrick* (the metre is forty years off, and Johnson's *metrick* is of
  verse, which is the joke); the counter is *the table*; *Cancel* is *Leave
  off*; *Full rolling boil* is *It boils in earnest*; *Heat off, lid on* is
  *Fire out, lid on*; *Custom* is *Your own*; a recipe is a *receipt*; the
  sizes are Small, *Middling*, Large, *Very large*, *Largest*. Words with
  no period form stay: fridge, sous-vide, probe thermometer, tap.
- **Words the period lacks**, kept for substance (rule 1): *protein* is
  gone ("the setting of white and yolk"), *energy* became *fewel*, *physics*
  *natural philosophy*; *denaturation* and *kinetics* stay in the colophon,
  as does every citation in Help, printed as published.
- **One maxim per page, at most**: "To leave the fire is not to leave the
  heat" (Help, the cooling); "knowledge is, in great part, only errour
  diminished" (Help, certainty); "rule of thumb, which is only the
  experience of others imperfectly remembered". The draft's *still
  learning* line is not used: that key is retired.

**As built (iOS), 28 September 2026.** Commits `01c621e` to `15cf890`,
drafted as `period_ios` (§3, History). Like the web half, it is for
the owner's review.

- **The switch is ported, not rewritten.** `src/core/language.ts` is
  `ios/EggTimerCore/Sources/EggTimerCore/Language.swift`, held to it by
  `fixtures/language.json` (`LanguageConformance.swift`): the constants, which
  tags are 1750 and which register each gets, every move from every reachable
  state (30 transitions), and 19 stored states read defensively. The app side
  is `ios/EggTimerCore/Sources/EggTimerApp/LanguageChoice.swift`, which only stores and applies. It keeps
  the state as the same JSON the web stores, under `languageState` rather
  than `language`, because a launch argument of that name would shadow it
  (UserDefaults' argument domain). It reads the state in the app's `init`,
  so the first frame is already in the cook's language. It listens for
  `.unitsFlipped`, which `Planner.chooseUnits` posts when the cook changes
  the units and never for a default. Nothing in it touches the units. The
  language is observed, so a pick or a units flip redraws every word in
  place.
- **The picker** is a Language section under Units in Settings, as on the
  web: a segmented *English* / *English (1750)*, with an (i) that opens
  `controls.language.more`. The line under the units, `controls.units.period`,
  shows on any English page, 1750 included. The six F6 keys that were the
  web's alone are now marked for both apps.
- **The title** heads the egg's page while idle, in 1750 only: `app.titlePage`,
  in italic, centred. It is the one place the long s is drawn. VoiceOver reads
  it as a header, through an accessibility label with every long s an s
  (`withoutLongS`, the Swift twin of what `applyCopy` does on the web).
- **A period face**, since 3 October: *The face*, below. Before it, New
  York broke a stepper's value between its number and its unit, so the
  value is one line in any face.
- **The tint is the web's accent.** Before, it was the system default. `AccentColor`,
  in both the app's and the widget's asset catalogues, is `--accent` from
  `styles.css`: #8A4B00 in light, #FFB020 in dark. It is the global accent
  in `ios/project.yml`. A prominent button's label is `--accent-fg`, through
  `onAccent()`: white on the light brown, and near-black (#1A1200) on the
  dark amber, where the system's white would be unreadable. A disabled
  button keeps the system's grey.
- **The iOS-only keys have 1750 entries.** Every key in English has a 1750
  twin but `app.name`, which stays English because it is a name
  (`test/en1750.test.ts` holds this). The twins cover:
  - the alarms: `alarm.pull.*`, `alarm.cooled.*` and `alarm.probe.*`;
  - the alarm's status lines, `readout.alarm.*` ("the alarm is set for
    {time}");
  - the cook's summary (`cook.summary`);
  - the Live Activity and the Dynamic Island (`activity.*`), for example
    *Upon the fire*, *Out with them*, *It is done*, and *my conjecture, till
    you tap the boil*;
  - a few controls: `more.*` and `controls.units.more.ios`.

  `test/en1750.test.ts` 1b then asked for a twin for every key either app
  uses, not only the web's, so the archaisms, the spellings and the long s
  bind the alarms and the Lock Screen too. Since `DECISIONS.md` 103 a twin
  may lag: every twin there is binds them, and the queue lists one missing
  (§3). 1b2 holds the small surfaces (an
  alarm's title, the Dynamic Island, the Lock Screen) to eight words at
  most. That is rule 2, and it is tested. The compact island's *NOW* and
  *Eat* have no room for flavour and stay as they are. The widget cannot
  read the app's settings, so the Live Activity carries the language the
  cook was started in (`CookActivity.lang`), as it carries its units. An
  activity begun by an older build decodes as English. The record's
  `register` follows the ticket's language (`registerOf`), as on the web.
- **No odds on the Lock Screen.** The Live Activity used to show "7/10 eggs
  hit the mark" under the summary. It is gone, from the Lock Screen and from
  the activity's attributes, on the owner's word: "I'd rather say nothing
  than waste space on useless odds". Mid-cook, nothing there can change what
  the cook does. `odds.hitTheMark` is retired from `copy/en.json`, and it
  never had a 1750 twin. The odds stayed on the ticket (`oddsTenths`) until
  28 September, when they were dropped as never read; the egg's record never
  kept them.
- **The colophon in plain words, in both Englishes.** This is the owner's
  wording.
  - Modern: "I work out each time from how heat gets into an egg, not from
    a recipe." The link is "The code and the science", and the tail is
    "— mistakes included."
  - 1750: "I reckon each time from how heat enters an egg, not from a
    receipt." The link is "The source, and the reasoning", and the tail is
    "— my errours included."

  *Denaturation* and *kinetics* are therefore no longer in the colophon in
  either English (compare *Words the period lacks*, above). It is shared
  copy, so the web's colophon changed with it.

**Not verified on iOS.** The 1750 alarms on a device, and so the 110-character
body on a real notification. Also the Live Activity and the Dynamic Island in
1750 on screen: see LOGBOOK.md for what the simulator would and would not
show.

**The face, 3 October 2026** (`DECISIONS.md` 65, 66). The register is
set in **IM FELL English**, roman and italic: the types Bishop John Fell
gave the Oxford press in the 1670s and 80s, Dutch in cut, as Igino
Marini digitised them, the ink's spread and all. Google Fonts' files,
whole and as published (the web's compressed to woff2), with the licence
beside them; served by the app, never by a font service, which would see
every visitor.

- **Every ligature on**: fi, ff, fl, ffi, ffl, ct, and the long s's own,
  ſi, ſl, ſh, ſt, ſſ; ſs is drawn as ß.
- **The long s everywhere, by the face.** Its `hist` sets ſ for an s
  before another letter, so the last s of a word stays round, as a
  printer set it: "ſet", "paſſes", "hardneß". The catalogue is not
  changed, so a screen reader, a search and the length tests read a plain
  s, and the rule above (one long s, on the title) holds for the text.
- **One weight**, as type had in 1750: nothing is made bold. Help's
  smallest heads are in italic instead.
- **Old-style figures only**, whose 0 is an o: right in a sentence, wrong
  in a field. A number the cook types or steps keeps the system face, as
  the clock does.
- **On iOS, the segmented controls are in the face too** (since 9
  October), at UIKit's own 13 pt, which does not grow with Dynamic Type
  for any face; they change face with the language, in place. So, since 9
  October too, are the navigation bar's title, at the bar's own 17 pt, and
  the egg size's menu, its button and its list: in 1750 these are views of
  the app's own in place of UIKit's, the list a popover drawn as the
  system's menu is (`barTitle`, `MenuChoice`); in modern English they are
  UIKit's, as before. **What else UIKit draws keeps the system face**: the
  menu the bar's buttons fold into at the largest text sizes, the share
  sheet, and the system's alerts (the app raises none of its own). So does
  the Live Activity, read at a glance across a kitchen beside the system's
  clock; the widget bundles no font.
  `ios/App/PeriodFace.swift` has the rest.

## 7. Order

F1, the catalogue, came first, before E2, so that Phase E's new feedback copy
was born in it. F2, the rewrite, ran alongside E2 and E5. F3 (units) and F4
(locale formatting) followed, then F6 (1750), which needed F1's catalogue,
F3's setting and F2's settled modern wording to shadow. F5, Czech, waits for
its reviewer, and wants wording that will not move again. The record gained
`lang`, `register` and `units` while its schema was still unwritten
(`INFERENCE.md` §4).
