# LANGUAGE.md — words, units, and languages

How both apps get their words, units and languages, and the rules the words
are held to. Czech (F5) waits for its reviewer. The owner's decisions are in
`DECISIONS.md`, cited where they apply; what he has yet to read is the
review queue (§3).

---

## 1. Why one catalogue

Two apps that type their sentences separately are held together by nothing
but care. That is the failure core's shared decisions (`src/core/inputs.ts`,
`slider.ts` and the rest) end for numbers, and the catalogue ends it for
words. For the same reason core returns no English and writes no English
grammar: an `egg${n === 1 ? '' : 's'}`, a hand-made 24-hour clock and seven
English weekday names survive no second language, and the 24-hour clock
does not survive an American.

## 2. One catalogue, both apps

**The format.** `copy/<locale>.json` holds one message per key. A message is
`text`, a template with named placeholders (`{limit}`), or a `count`, naming
the argument that picks the form, and one template per CLDR plural category
(`one`, `few`, `many`, `other`). A missing form falls back to `other`, so
English writes `one` only where it can be reached. A key missing from a
language falls back to English, with English's plural rule. There is no full
ICU MessageFormat, for two reasons: nothing here needs `select` beyond
plurals, and the repo carries no runtime dependencies. The renderer is
`src/core/copy.ts`, and its Swift twin `EggTimerCopy`. Core keeps its
invariants, no I/O and no dependencies: the catalogue is data the UI layer
hands in.

**What a message says about itself** is beside the catalogue, never in it
(`DECISIONS.md` 122): a catalogue holds templates, `count` and an overlay's
`base`. `copy/en.notes.json`, which no app loads, gives each English key its
`surface`, its `example` arguments and, where a reader needs one, a `note`.
Which app shows a key is read from the sources (`tools/copyNotes.ts`).

**Changing the words.** The steps are `CLAUDE.md`'s "To change wording";
reading and approving them is `DEVELOPING.md`'s "Reviewing the words"; the
review queue and the twins' lag are §3.

**Plurals.** A small hand-written rule function chooses the category for
each shipped language. On the web this could be `Intl.PluralRules`, but
Swift has no public equivalent outside `.stringsdict` and `.xcstrings`, so
both cores carry the same few lines of rules, under conformance, as for
everything else. A new language adds its rule and a fixture row.

- **The rule sees the decimals a number is shown with**, as CLDR's `v`
  operand does: "2,00 l" is Czech `many`, not `few`, and "1.0" is English
  `other`. A count is rounded as it is written before its form is chosen.
- **Every spelled-out count is a plural message**, so a screen reader never
  hears "1 seconds". A message has one count, so "{minutes} minutes
  {seconds} seconds" is two plural messages joined (`spoken.minutes`,
  `spoken.seconds`, `spoken.minutesSeconds`).
- **Unit symbols are not plural messages** (s, min, h, °C, g, L, oz): they
  do not inflect in English or Czech. A translator who wants a word can make
  any `format.*` key a plural message on `{value}`, and the renderer will
  choose its form.

**Why not Xcode String Catalogs.** They are the native tool, and giving them
up costs Xcode's translation workflow. Keeping them would mean the iOS copy
is rendered by Apple's code and the web copy by ours. Nothing would hold the
two together except hope, and the whole reason for the catalogue is to
remove that. `Info.plist` declares `CFBundleLocalizations`, so the App Store
still lists the languages.

**Core speaks no English.** Core returns keys and numbers, never sentences:
a `CopyRef`, `{ key, args }`. A key is a `CopyKey`, made from
`copy/en.json` by `npm run copy:keys`, which `npm test` runs first
(`DECISIONS.md` 127): a key the catalogue lacks, or a web `t()` call with a
missing or extra argument, does not compile.

- The doneness anchors carry a `key`, not a label.
- A size class's label takes its grams from the mass, as an argument, so a
  label cannot disagree with the egg it cooks. Which classes there are
  depends on the region (§4).
- `startPhrase` returns a bucket's key, and the app supplies `{weekday}`
  from the catalogue's `weekday.*` (`weekdayKey`, 0 is Sunday), in both
  apps, never from a platform formatter. The translator sees the names, and
  a platform's name is the nominative: Czech "Last {weekday}" wants the
  accusative (*minulou středu*, not *středa*), and a name from the
  catalogue can be the form the sentence needs, or the sentence can be
  rewritten around it, which is F5's call.
- A count goes in as a number, and a measurement as a `Fixed`, its value
  and the decimals its unit shows; both come out in the formatting locale.
- An inserted word is lower-cased in code where a template sets it
  mid-sentence: `midSentence` lower-cases only the first letter, in the
  catalogue's language, so "Last Wednesday" reads "last Wednesday". Wording
  that stands every inserted word alone (§5) would need none of it.

**Outside the catalogue.**

- **The web page's `<head>`.** Below it, `index.html` holds no words: each
  element names its key with `data-copy`. The `<head>` keeps its English,
  because crawlers and link previews do not run scripts; localising it
  needs a page per language, which is F5's problem.
- **The privacy page** (`privacy/index.html`): plain English only, no 1750
  twin and no translation, because it is a statement that must mean exactly
  one thing, and its speaker is the owner, not the app (`DECISIONS.md` 51).
  Only the Help link to it, `help.privacy`, is copy.
- **Help's sources** (`help-sources.json`): each citation and the address
  it links to, as `README.md` section 10 gives them. They are the same in
  every language, so they are data both apps read (the web bundles the
  file, iOS has it as a resource), not words to review or translate.

**Regional overlays** (`DECISIONS.md` 55). English is one language with one
catalogue, `copy/en.json`, and it is Australian. A region whose kitchen says
some things differently gets an overlay holding only those keys:
`copy/en-US.json` says "pot" for the pan, among a few. Where a neutral word
serves every English, the base uses it and needs no overlay: the eggs cool
in running water or in the air, not under a cold tap or on a bench
(`DECISIONS.md` 57).

- **Which catalogues render a language** is `catalogueChain`, in core and
  fixtured: modern English gains the overlay for the region of the device's
  own English, the first English tag in the phone's preferred languages or
  else its region (the web's one tag, `navigator.language`). So English
  (Australia) on an American phone reads Australian.
- **The language stays `en`.** The picker, `<html lang>`, the record's
  `lang` and the units switch never see an overlay's tag; only the words
  move. The English of 1750 has no overlay, and may lag the English (§3).
- **An overlay cannot go stale unseen.** Each entry carries `base`, the
  English it was written against, and `copy.test.ts` 7a fails when the two
  part, so a wording change to an overlaid key rewrites the overlay too.
- A British overlay ("worktop") waits until someone asks for one.

**Conformance.** `fixtures/copy.json` pins the renderer on catalogues of
its own, every kind of placeholder, plural form, fallback and malformed
brace, so a wording change never rewrites it; both apps must render it
byte for byte. The shipped catalogues are held by each app's tests
(`copy.test.ts`, `CopyConformance`):

- **Placeholder parity.** Every translation uses exactly the same placeholders
  as the English. A dropped `{limit}` is a sentence that lies about the egg.
- **Length budget, on the small surfaces.** A tick, a segment, a button, a
  label, a title, the alarm, the Lock Screen and the Dynamic Island each
  have a maximum rendered width, one per surface in `test/data/surfaces.json`,
  not per key: a per-key budget set from the English would fail every
  language that runs longer than English, which is all of them. Prose that
  wraps freely (a body, an (i)'s paragraph, Help) and what is only read
  aloud have none.

**Numbers and times of day** go through the platform's formatters, with an
explicit locale: `Intl` on the web, `NumberFormatter` and `DateFormatter` on
iOS. `fixtures/format.json` pins the result for each locale, so a formatter
disagreement shows up as a failing test and not as a surprise in a Czech
kitchen. `src/core/format.ts` and its Swift twin say how the two give the
same bytes (the rounding is ours, zero has no sign, a time of day is the
locale's time style and spaces with U+202F). The choices:

- **The formatting locale is the UI's language in the device's region**
  (`formattingLocale`, one function in both cores). An English UI in Britain
  formats as `en-GB`; in Germany as `en-DE`, which is a real CLDR locale with
  English words and "2,4". **A language with one convention of its own
  ignores the region** (the owner, 27 September): a Czech UI formats as
  `cs-CZ` everywhere, so cs in the US writes "1 234,5", because the words
  around the number are Czech. English is not such a language, because CLDR
  has English writing numbers a dozen ways by region. A private-use subtag
  (`x-1750`) is dropped, since it is a register and not a format.
- **The phone's own 12/24-hour setting** rides along on iOS as `-u-hc-h23`
  (or `h12`) when it differs from the region's, so an Australian iPhone set
  to 24-hour time reads "15:05" and not "3:05 pm". A browser does not
  expose that setting, so the web uses the region's.
- **No time of day zero-pads its hour** (the owner, 27 September): "9:05"
  and "0:05", never "09:05", in every locale, and the minutes and seconds
  keep two digits (`unpadHour`).

**Where `Intl` and Foundation disagree**, measured on 27 September with Node
26.8.1 (ICU 78.3, CLDR 48) against Foundation on macOS 26.6.2, after the
normalisation above:

| formatting locale | `Intl` | Foundation | what the apps do |
|---|---|---|---|
| en-US, en-AU, en, any 12-hour English | "3:05 PM" with U+0020 | "3:05 PM" with U+202F | normalised to U+202F, pinned |
| en-CZ (an English UI in Czechia) | "09:05" | "9:05" | no hour is zero-padded, both "9:05"; pinned |
| en-CA | "3:05 p.m." | "3:05 PM" | not pinned |
| en-IN, en-NZ, en-SG | "3:05 pm" | "3:05 PM" | not pinned |
| cs-US, cs-GB (a Czech UI abroad) | "1 234,5" (by language) | "1,234.5" (by region); cs-US also a 12-hour clock | never formatted in: a Czech UI's tag is `cs-CZ` in any region, "1 234,5" and "15:05" on both; pinned |
| cs-CZ-u-hc-h12 | "3:05 odp." | "15:05" (`DateFormatter` ignores `hc` for cs) | not pinned |

Pinned, and agreeing: en-US, en-GB and cs-CZ, which are the supported set,
and en, en-AU, en-DE, en-CZ, cs, en-US-u-hc-h23 and en-GB-u-hc-h12, with the
tag each app derives from a language, a region and an hour cycle followed
through to the text (`derived`). Measured to
agree but not pinned: en-150, en-CH ("1'234.5"), en-ES, en-FR ("1 234,5" with
U+202F), en-IE, en-IT, en-JP, en-NL, en-PL, en-SE, en-ZA and cs-SK. Czech
groups with U+00A0 on both platforms, so no choice was needed there.

en-CZ matters, because until there is a Czech catalogue it is what the
owner's Czech friend reads. A Czech UI abroad would get a different decimal
separator from each app, since `Intl` has no cs-US data and falls back to the
language where Apple lets the region win; with the tag `cs-CZ` everywhere,
neither is asked. Its clock is Czech too, 24-hour, even in the US: the
phone's 12-hour setting still rides along on iOS as `-u-hc-h12`, which
`DateFormatter` ignores for Czech (the last row), so both apps print "15:05".
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
  "running water", "a bowl of water" and "the air" (in 1750, "iced water",
  "the pump", "a basin" and "the open air").

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
- "Boil" is never a metonym for cooking an egg (`DECISIONS.md` 111):
  not "the boil", "boil times" or "signal the boil". The state of the
  water is "a full rolling boil", the standard phrase, as the button's name
  says; "brought to the boil", "to the boil" and "Once it’s boiling" stay.
- The (i) is short enough to read standing at the hob; the whole story goes to
  Help (`UI.md` §7).
- Wording is judged in place on a phone, not approved row by row in a table
  (`UI.md` §6).

**How a wording change is made, read and approved.** Every word is in
`copy/*.json`, and `npm run copy:literals` keeps words out of the places
Swift puts text on a screen, so what a change does to the words is the
catalogue's diff.

- **Made**: an edit to `copy/en.json`, in both apps, with each
  `copy/en-US.json` entry it reaches and that entry's `base` (§2), then
  `npm test` and `npm run fixtures:check` (`CLAUDE.md` has the gate).
  What holds it: placeholder parity, curly quotes, the small surfaces'
  budgets, the overlays' `base`, keys and arguments checked by both
  compilers, and no raw key on screen (`copy.test.ts`, `copy:literals`).
- **Approval is one commit.** `test/data/copy-approved.txt` holds the hash
  of the last commit whose words the owner approved. The review queue is
  `copy/` at that commit against the working tree, key by key: changed (the
  English or an overlay), added or retired. It is generated, never typed;
  `npm run copy:queue` prints it, and it never fails a build.
- **Read** on a phone: `npm run copy:review` writes
  `_dev/copy-review.html`, one file with no script and no network, light
  or dark. For each key: the approved English against today's, word by
  word; the 1750 twin, and whether it is stale; the en-US words; a small
  surface's budget against the longest rendering; which apps say it; and
  its note. The words are still judged in place, in the apps (`UI.md` §6).
- **Approved** on the owner's word, never on an agent's judgement, and of
  the whole catalogue: he says what to put back, and once that is
  committed, `npm run copy:approve` records HEAD (it refuses while `copy/`
  has uncommitted changes), or `-- <commit>` the commit the page was made
  from, which the page prints. Nothing is approved key by key.

A string the owner has approved (the `alarm.pull.*` bodies,
`alarm.cooled.body`, `idle.welcome`, `activity.note.estimate`) was approved
as good enough for now, not as final (`DECISIONS.md` 54): a style pass reads
it like the rest, and a change puts it back in the queue.

**The twins may lag the English** (`DECISIONS.md` 116). A translation's
twin need not be rewritten in the commit that changes its English; the
twins are written in batches. A twin is stale when the English at the
commit that last wrote its line (`git blame`; a catalogue has one key per
line) is not today's English; a key with no twin shows the English
(`src/core/copy.ts`). The queue and the page list both, and neither fails
a build. That reads history, so it is local tooling, not CI's, whose clone
is shallow. A stale twin stops being stale when it is rewritten. A regional
overlay may not lag: it keeps its own `base`, held by `copy.test.ts` 7a
(§2).

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

## 4. Units

**One setting: Metric or Imperial.** Its default comes from the platform:

- iOS reads three signals, and core decides between them
  (`regionalUnits`): the temperature preference a cook can set in Settings
  on iOS 16 and later, then `Locale.current.measurementSystem`, where only
  `us` is Imperial (the UK system is miles on the road and grams in the
  kitchen), then the region. An American who set Celsius starts in metric;
  an Australian who set Fahrenheit starts in Imperial.
- Web: the region in `navigator.language`. The only default region that gets
  Imperial is `US`.

After that, the setting is the cook's, kept as a choice even when it equals
the default.

**Core stays in SI.** This is `CLAUDE.md` invariant 3: "convert only at the UI
boundary". The work is making both UIs convert *identically*, so
`src/core/units.ts`, fixtured like the rest of core, owns the conversions,
each quantity's display precision and input step in each system, and the
round trip.

The round trip matters. A cook who types 2.4 oz must see 2.4 oz again, not
2.39, however that value was clamped in SI underneath. The rule is to store SI
and display the value rounded to the unit's step. A field is re-parsed only when
the cook edits it. A typed number is not snapped: the model cooks what was
typed, and the display rounds it.

The table is the spec for Imperial; the metric steps, and why, are in
`units.ts`.

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
- **Size classes and the water's unit follow the region, not the unit or the
  language** (`DECISIONS.md` 16). Region `US` gets the classes printed on an
  American carton, and everywhere else keeps the EU ones. The difference is
  large. USDA defines each class by a minimum weight per dozen (Small 18 oz,
  Medium 21, Large 24, Extra large 27, Jumbo 30), and a class runs from its
  own minimum up to the next one, so the app uses the midpoint of that
  range, not the minimum. Cook times below are for jammy, fridge-cold, into
  boiling water, then an ice bath:

  | class | US range, g per egg | US midpoint | EU mass in the app | jammy, US | jammy, EU | gap |
  |---|---|---|---|---|---|---|
  | Small | 42.5-49.6 | 46.1 | 48 | 6:02 | 6:12 | 10 s |
  | Medium | 49.6-56.7 | 53.2 | 58 | 6:38 | 7:01 | 23 s |
  | Large | 56.7-63.8 | 60.2 | 68 | 7:11 | 7:45 | 34 s |
  | Extra large | 63.8-70.9 | 67.3 | 76 | 7:42 | 8:19 | 37 s |
  | Jumbo | 70.9 and up | ~74 | - | 8:13 | - | - |

  Near 60 g, a gram is worth 4.4 s. An American Large is therefore half a
  minute from an EU Large, which is three times the width of "just right":
  an American who has not weighed an egg would be overcooked by about 34 s
  by the EU classes, in metric or Imperial alike. That makes this a
  correctness fix, not a nicety. Jumbo has no upper limit, so its 74 g is a
  guess, and the US has no class between Extra large and Jumbo that the EU
  would call XL. `README.md` §6 (`US_SIZE_CLASSES`) has the provenance.
- **The record stays SI.** The record in `INFERENCE.md` §4 does not care what
  the cook saw. It carries `units` only so that the fit can check whether
  rounding at input shows up in the residuals.

## 5. Languages

**The first one is Czech** (`DECISIONS.md` 15). A friend of the owner will
review it. Czech is a harder test of the machinery than German would have been,
in three ways:

- **It has four plural categories, one of them for fractions.** `Intl` gives
  `one` for 1, `few` for 2-4, `other` for 0, 5, 21 and 22, and `many` for 1.5.
  So "1 vejce", "3 vejce", "5 vajec", and a fourth form for a fractional count.
  A catalogue that only knows *one* and *other* fails on the first egg count.
  `fixtures/format.json` renders a pseudo-Czech catalogue
  (`test/pseudo-cs.json`), Czech's plural rule with no Czech words, through
  every category, fractional counts among them.
- **It has seven cases, and this matters most.** A message of the form
  "{wanted} isn't reachable … Softest here is {limit}" inserts a doneness word
  into the middle of a sentence. In Czech that word would need declining to fit
  its slot, and a placeholder cannot do that. Declension tables per placeholder
  would work, but they would be a machine built for one language. So there is a
  **rule for every language**: **an inserted word always stands alone, in its
  dictionary form**, after a colon or as a label, never inside running grammar.
  "Nejměkčí možné: {limit}" works in every language. The refusals have that
  shape, in English too.
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

**With a second language the choice becomes a menu** (the owner). It lists
first "System (Čeština)" and the like, following the phone's or browser's
language, then every language in its own name, with the English of 1750
under English. The web uses a `<select>`. iOS uses a menu-style `Picker`
that follows iOS's own per-app language setting, which appears once the app
declares several localizations (`cs` in `CFBundleLocalizations`,
`ios/project.yml`).

**Quality bar.** A translation can be drafted by machine. It does not ship until
someone who speaks the language, and cooks, has read it on the screen. An
unreviewed language stays behind a build flag.

**Not localised.** The README, PLAN, the other documents and code comments
stay in English. The App Store description and screenshots are localised,
and the steps belong in `ios/RELEASING.md`.

## 6. The easter egg: Imperial units in the English of 1750

When an English-language UI is switched to Imperial, every string also switches
to the pompous prose of the eighteenth century. Fahrenheit published his scale
in 1724, so the period is justified.

**It is a language, with a language code of its own** (`DECISIONS.md` 12).
The tag is the cook's own English locale with a private-use subtag, as BCP 47
provides: `en-US-x-1750`, `en-GB-x-1750`, `en-AU-x-1750`. Everything
maintainable about the joke follows from that:

- **Strings come from the subtag, formats from the rest.** The catalogue is
  `copy/en-x-1750.json`, and a missing key falls back to `en`. Numbers, clocks
  and the measurement system come from the region, and both platforms do this
  with no special-casing: `Intl` in Node and `Locale` in Foundation give the
  same answers for every tag, so `en-US-x-1750` formats as en-US ("3:00 PM",
  US system) and `en-GB-x-1750` as en-GB ("15:00", UK system). An American in
  1750 English keeps their clock, and a Briton keeps theirs.
- **It is one row in the language picker**, a Language row under Units in
  Settings in both apps. iOS's own per-app language setting would not list a
  private-use tag anyway. The picker shows it as *English (1750)*, which is
  the discoverable way in, and choosing *English* is the way out; the two
  are named alike in both catalogues, so either can be found from the other.
  A cook who wants °F in modern English picks English and keeps Fahrenheit.
- **It is under the same tests as any other language**: placeholder parity,
  the small surfaces' budgets, and loading in both apps (§2). Its own rules,
  below, are `test/en1750.test.ts`.

**Two ways in.**

1. **The picker**, for anyone.
2. **The switch.** When a cook whose UI is in English flips units from Metric to
   Imperial, the app also sets the language to 1750. Flipping back to Metric
   changes nothing about the language: the cook leaves 1750 with the picker
   (`DECISIONS.md` 77). Changing the language never touches the units, so this
   runs in one direction only.

**Discoverable for Americans, reluctantly** (`DECISIONS.md` 13). Units
default from the region (§4), so an American starts in °F and modern English
and never makes the switch. Two small things find them: the picker row
above, and, in an English UI, 1750 included, a single line under the
Imperial option (`controls.units.period`).

Nothing is pushed, and there is no first-run prompt. The joke is better found
than delivered.

**The style guide is Samuel Johnson**, specifically the *Preface to a
Dictionary of the English Language* **as first printed in 1755**. The owner chose
it and reviews the catalogue against it (`DECISIONS.md` 17). There are three
texts, and which one is used matters:

- **The authority is the 1755 folio**, volume 1, scanned at archive.org as
  `bub_gb_nCJWAAAAcAAJ`. Its OCR cannot be used as text: it reads every long s
  as *f* (*thofe*, *difmifs*), and Google's OCR also nudges archaic spellings
  toward modern ones.
- **The working text is Jack Lynch's transcription** (jacklynch.net/Texts/
  preface.html). It is taken from the first edition, keeps the spelling, and
  drops the long s, which is exactly the form this catalogue wants. Link to it;
  do not vendor it, because the notes and paragraph numbers are his.
- **Not Project Gutenberg ebook 5430.** It follows Johnson's revised Preface
  of 1773 (*explanation* for *explication*, *surely* for *freely*, "the paths
  through which" for "the paths of"). It modernises some spellings
  (*recompense*, *registered*), misreads *fewel* (fuel) as *jewel*, and
  inserts editorial translations and a footnote.

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
  word earns its place: **rear**, adjective, "Raw; half roasted; half
  sodden". That is exactly the soft end of the doneness scale, and it is the
  word the 1750 catalogue uses there. *Jammy* and *fudgy* are anachronisms
  and are matched the same way as for Czech (§5), not translated.
- **No long s (ſ) in body text.** Screen readers announce it and search does not
  match it. It appears once, on the title, echoing the Dictionary's own title
  page ("in which the words are deduced from their originals"), behind an
  accessibility label that reads without it:

  > *The Actual Egg-Timer: in which the times of boiling are deduced from their
  > cauſes, and illuſtrated in their different degrees of hardneſs.*

  The title heads the egg's page while idle, in 1750 only.

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
   not a paragraph: at most eight words on an alarm's title, the Dynamic
   Island and the Lock Screen (`test/en1750.test.ts` 1b2), and the compact
   island's *NOW* has no room for any.
3. **The feedback answers keep their meaning.** They are data, so the record in
   `INFERENCE.md` §4 carries the register alongside the language. The fit can
   then tell whether "Unset" in 1750 is answered differently from "Runny" in
   2026. It probably is. That would be the funniest result this project could
   produce.
4. **Leaving is one tap and keeps °F.** Choosing *English* in the picker is
   enough, so that a non-native reader, or anyone who reads with difficulty,
   never has to give up their units to understand their timer. The picker's
   (i), `controls.language.more`, says so in the register.

**Where it departs from the guide, or chose where the guide was silent.**

- **The alarm.** The owner approved a 1750 body longer than the 53
  characters `notification.body` allowed, so that surface's budget is 110;
  not yet seen on a device. The titles are *Out with them* and *Cooling
  ended*: there the register gets three words or two.
- **The reset dialog** is *Shall I learn anew?*; **the yolk question**, *In
  what condition was the yolk?*
- **The yolk is answered with the doneness words**, as in modern English
  (`DECISIONS.md` 92): *Rear · Soft · Thick · Firm · Hard*, five letters at
  most for the ticks. *Thick* and *Firm* stand where *jammy* and *fudgy* do,
  matched and not translated; the texture lines say *yolk thick*, *yolk
  firm*. The white's answers are *Unset · Tender · Firm*, *Unset* after
  rule 3's own example; *Firm* is the white's third answer as *firm* is in
  modern English.
- **Names that change**, for the owner to strike: Settings is
  *Particulars*; Help is *Preface* (its page *The Preface*); Sources are
  *Authorities*, as in the Dictionary; Units are *Measures*, and Metric is
  *Metrick* (the metre is forty years off, and Johnson's *metrick* is of
  verse, which is the joke); the fridge is *the ice chest*; *Cancel* is
  *Leave off*; *Rolling boil* is *It boils in earnest*; *Heat off, lid on*
  is *Fire out, lid on*; *Custom* is *Your own*; the sizes are Small,
  *Middling*, Large, *Very large*, *Largest*. The cooling methods are §3's
  house terms. Words with no period form stay: sous-vide, probe
  thermometer.
- **Words the period lacks**, kept for substance (rule 1): *protein* is
  gone ("the setting of white and yolk"), and every citation in Help is
  printed as published, *denaturation* and all.
- **One maxim per page, at most.** Help's is its motto, *Time the egg, and
  not the minute*.

**The face** (`DECISIONS.md` 65, 66). The register is
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
  the clock does, so a value is one line in any face.
- **On iOS, the segmented controls are in the face too**, at UIKit's own
  13 pt, which does not grow with Dynamic Type for any face; they change
  face with the language, in place. So are the navigation bar's title, at
  the bar's own 17 pt, and the egg size's menu, its button and its list:
  in 1750 these are views of the app's own in place of UIKit's, the list a
  popover drawn as the system's menu is (`barTitle`, `MenuChoice`); in
  modern English they are UIKit's. **What else UIKit draws keeps the
  system face**: the menu the bar's buttons fold into at the largest text
  sizes, the share sheet, and the system's alerts (the app raises none of
  its own). So does the Live Activity, read at a glance across a kitchen
  beside the system's clock; the widget bundles no font.
  `ios/App/PeriodFace.swift` has the rest.

## 7. Order

Czech (F5) waits for its reviewer, and wants English that will not move
again. A new language adds its catalogue, its plural rule and a fixture row
(§2) and an `OWN_CONVENTION` entry if it writes numbers one way everywhere
(§2), and stays behind a build flag until it is read (§5).
