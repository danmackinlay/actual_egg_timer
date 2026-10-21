# LANGUAGE.md — words, units, and languages

How both apps get their words, units and languages, and the rules the words
are held to. Czech (F5) waits for its reviewer. The owner's decisions are in
`DECISIONS.md`, cited where they apply; what he has yet to read is the
words changed since he last approved them (§3).

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
review page and the twins' lag are §3.

**Plurals.** A small hand-written rule function chooses the category for
each shipped language. On the web this could be `Intl.PluralRules`, but
Swift has no public equivalent outside `.stringsdict` and `.xcstrings`, so
both cores carry the same few lines of rules, under conformance, as for
everything else (§5 says when a new language needs one).

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
  English it was written against, and `copy.test.ts` fails when the two
  part, so a wording change to an overlaid key rewrites the overlay too.
- A British overlay ("worktop") waits until someone asks for one.

**Conformance.** `fixtures/copy.json` pins the renderer on catalogues of
its own, every kind of placeholder, plural form, fallback and malformed
brace, so a wording change never rewrites it; both apps must render it
byte for byte. The shipped catalogues are held by each app's tests
(`copy.test.ts`, `CopyConformance`), every catalogue in `copy/` by the same
checks, which a third, `test/pseudo-cs.json`, proves with a plant each:

- **Placeholder parity.** Every translation has only the English's keys, and
  uses exactly the same placeholders as the English. A dropped `{limit}` is a
  sentence that lies about the egg.
- **Its own language's plural forms**, by a rule core has that agrees with
  CLDR's: none its language lacks, and every one a whole count reaches
  where the English's message varies.
- **The English's links.** Help cites the same sources in every language.
- **Numbers from the region.** No template writes a number itself: it comes
  through a placeholder, in the formatting locale, which a register such as
  1750 never changes.
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

**Where the formatters disagree**, measured on 27 September with Node
26.8.1 (ICU 78.3, CLDR 48) against Foundation on macOS 26.6.2, and on
17 October in Safari 27 on the iOS Simulator, after the normalisation above:

| formatting locale | Node's `Intl` | Safari's `Intl` | Foundation | what the apps do |
|---|---|---|---|---|
| en-US, en-AU, en, any 12-hour English | "3:05 PM" with U+0020 | as Node | "3:05 PM" with U+202F | normalised to U+202F, pinned |
| en-CZ (an English UI in Czechia) | "09:05" | as Node | "9:05" | no hour is zero-padded, both "9:05"; pinned |
| en-CA | "3:05 p.m." | "3:05 PM" | "3:05 PM" | not pinned |
| en-IN, en-NZ, en-SG, en-HK, en-MY, en-PK, en-001 | "3:05 pm" | "3:05 PM" | "3:05 PM" | not pinned |
| en-MX | "3:05 PM" | "3:05 p.m." | "3:05 p.m." | not pinned |
| en-BR | "3:05 PM" and "1,234.5" | "15:05" and "1.234,5" | "15:05" and "1.234,5" | not pinned |
| cs-US, cs-GB (a Czech UI abroad) | "1 234,5" (by language) | not measured | "1,234.5" (by region); cs-US also a 12-hour clock | never formatted in: a Czech UI's tag is `cs-CZ` in any region, "1 234,5" and "15:05" on both; pinned |
| cs-CZ-u-hc-h12 | "3:05 odp." | "3:05 odp." | "15:05" (`DateFormatter` ignores `hc` for cs) | not pinned; only iOS asks for it |

Pinned, and agreeing: en-US, en-GB and cs-CZ, which are the supported set,
and en, en-AU, en-DE, en-CZ, cs, en-US-u-hc-h23 and en-GB-u-hc-h12, with the
tag each app derives from a language, a region and an hour cycle followed
through to the text (`derived`). Safari matches every pinned case: all 1205
cases in `fixtures/format.json`, run through the web's core in Safari, print
what the fixture says. Measured to agree in all three but not pinned:
en-150, en-CH ("1'234.5"), en-ES, en-FR ("1 234,5" with U+202F), en-IE,
en-IT, en-JP, en-NL, en-PL, en-SE, en-ZA, en-AT, en-BE, en-DK, en-FI, en-NG,
en-NO, en-PH, en-SI, en-AE, en-IL, en-AU-u-hc-h23, en-CA-u-hc-h23,
en-IN-u-hc-h23, en-GB-u-hc-h11 and en-US-u-hc-h24; and cs-SK in Node and
Foundation, though Safari was not given it. Czech groups with U+00A0 on both
platforms, so no choice was needed there.

en-CZ matters, because until there is a Czech catalogue it is what the
owner's Czech friend reads. A Czech UI abroad would get a different decimal
separator from each app, since `Intl` has no cs-US data and falls back to the
language where Apple lets the region win; with the tag `cs-CZ` everywhere,
neither is asked. Its clock is Czech too, 24-hour, even in the US: the
phone's 12-hour setting still rides along on iOS as `-u-hc-h12`, which
`DateFormatter` ignores for Czech (the last row), so both apps print "15:05".

Safari runs Apple's ICU, not V8's, and where it differs from Node it prints
what Foundation prints. So on an iPhone the web and the iOS app print the
same thing in every row above. The last row is the one place Safari sides
with Node, and the web never asks for that tag, since a browser gives it no
hour cycle. The unpinned rows are where the web, in a browser other than
Safari, may print what Node prints instead.

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
  (`DECISIONS.md` 56; `copy.test.ts`).
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
- Wording is judged in place, in the apps, not approved row by row in a
  table (`DECISIONS.md` 25, 106; `UI.md` §1).

**How a wording change is made, read and approved.** Every word is in
`copy/*.json`. Literal words are kept out of the Swift calls that put text
on a screen by the compiler (the app's helpers take `Words`, which only
`tr` makes) and by `npm run ios:build` (a literal in SwiftUI's own calls;
one made a `String` around them, by `Text(verbatim:)` or in UIKit's, is
read by no tool, and would be plain in a diff), and out of the web's by
`npm test` (`test/uiLiterals.test.ts`; one passed through a name is not
read), so what a change does to the words is the catalogue's diff.

- **Made** by `CLAUDE.md`'s "To change wording", or by the owner in
  `npm run copy:edit` (`DEVELOPING.md`, "Reviewing the words"), which
  holds a draft to the same rules as he types, from the same code
  (`tools/copyRules.ts`), and changes no key and no argument.
  What holds it: placeholder parity, curly quotes, the small surfaces'
  budgets, the overlays' `base`, keys and arguments checked by both
  compilers, each Swift `tr` given exactly its key's arguments, which
  `npm test` reads (`tools/copyArgs.ts`) and a debug build stops on (for
  the keys the core computes, `WordsSweepTests.swift`), and no raw key on
  screen (`copy.test.ts`).
- **Approval is one commit.** `test/data/copy-approved.txt` holds the hash
  of the last commit whose words the owner approved. What he has yet to
  read is `copy/` at that commit against the working tree, key by key:
  changed (the English or an overlay), added or retired. It is generated,
  never typed, and never fails a build.
- **Read and approved** as `DEVELOPING.md`'s "Reviewing the words" says:
  on `npm run copy:review`'s page, and in place in the apps (`UI.md` §6);
  approved on the owner's word, never on an agent's judgement, and of the
  whole catalogue, never key by key.

A string the owner has approved (the `alarm.pull.*` bodies,
`alarm.cooled.body`, `idle.welcome`, `activity.note.estimate`) was approved
as good enough for now, not as final (`DECISIONS.md` 54): a style pass reads
it like the rest, and a change puts it back on the review page.

**The twins may lag the English** (`DECISIONS.md` 116). A translation's
twin need not be rewritten in the commit that changes its English; the
twins are written in batches. A key with no twin shows the English
(`src/core/copy.ts`), and `git log -- copy/en-x-1750.json` shows how old
the twins are. Neither fails a build. A regional overlay may not lag: it
keeps its own `base`, held by `copy.test.ts` (§2).

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

**Adding a language takes a row and a catalogue.** The row is in
`LANGUAGES` (`src/core/copy.ts`): its tag, and the key of its name in the
picker. Both pickers, each app's reading of a stored choice and the words'
editor read the table, and `npm test` writes iOS's copy of it
(`npm run swift:constants`). The catalogue is `copy/<tag>.json`, which both
apps ship whole, and which the checks in §2 hold as they hold every other.
The tests then ask for what the row names:

- the name's key in `copy/en.json`, with its note;
- the language's subtag in `CFBundleLocalizations` (`ios/project.yml`, then
  `cd ios && xcodegen`), which `test/languages.test.ts` holds to the table;
- a language core has no plural rule for needs one, in `pluralCategory`
  and its Swift twin with rows in `fixtures/copy.json` (§2), and one that
  writes numbers one way wherever it is read, its region in
  `OWN_CONVENTION` (`src/core/format.ts`). Czech has both.

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
someone who speaks the language, and cooks, has read it on the screen.

**Not localised.** The README, PLAN, the other documents and code comments
stay in English. The App Store description and screenshots are localised,
and the steps belong in `ios/RELEASING.md`.

## 6. The easter egg: Imperial units in the English of 1750

The prose of the eighteenth century is a language of its own (`DECISIONS.md`
12), with Fahrenheit's scale of 1724 to justify it.

**The tag.** The cook's own English locale with a private-use subtag:
`en-US-x-1750`, `en-GB-x-1750`, `en-AU-x-1750`. Strings come from the
subtag, formats from the rest: the catalogue is `copy/en-x-1750.json`, and
numbers, clocks and the measurement system come from the region, so an
American in 1750 keeps "3:00 PM" and a Briton "15:00". A key the catalogue
lacks falls back to `en`, English's plural rule with it; the twins may lag
the English (`DECISIONS.md` 116).

**In and out.** The picker in Settings has a row, *English (1750)*, under
English; choosing *English* leaves it, and keeps °F. A cook reading
English who flips Metric to Imperial goes into 1750 too; flipping back
changes nothing about the language (`DECISIONS.md` 77), and changing the
language never touches the units. In an English UI one line under the
Imperial option (`controls.units.period`) says so, for Americans, whose
region starts them in °F (`DECISIONS.md` 13). No prompt: the joke is better
found than delivered.

**The register.** Samuel Johnson's *Preface to a Dictionary of the English
Language* as first printed in 1755, which the owner chose and reviews the
catalogue against (`DECISIONS.md` 17). Four rules keep it from costing
anyone a breakfast:

1. **Substance is not exempt.** Every string says what its modern twin
   says; no instruction is lost to the flourish.
2. **The small surfaces get two or three words of flavour**, not a
   paragraph: the alarm's title, the Lock Screen and the Dynamic Island,
   whose compact *NOW* has room for none. Their budgets are the English's
   (§2), but the alarm's body, at 110 characters, holds the 1750 the owner
   approved.
3. **The answers keep their meaning.** They are data, and the record carries
   the register (`INFERENCE.md` §4). The yolk is answered in the slider's
   words, *Rear · Soft · Thick · Firm · Hard*; the white in *Unset · Tender ·
   Firm*. *Rear* is Johnson's "raw; half roasted; half sodden"; *Thick* and
   *Firm* are matched to *jammy* and *fudgy*, not translated.
4. **Leaving is one tap and keeps °F**, so nobody gives up their units to
   understand their timer.

**For whoever writes a twin.** Work from Jack Lynch's transcription of the
1755 first edition (jacklynch.net/Texts/preface.html), not Project
Gutenberg 5430, which is the revised Preface of 1773 and modernises it. Use
his spellings: *errour*, *publick*, *shew*, *expence*, *surprize*, *fewel*,
and *-our* where modern English has *-or*. Avoid the stage-play archaisms,
which the Preface never uses: *'tis*, *pray*, *forthwith*, *whilst*,
*thee*, *thou*, *hath*, *doth*; his connectives are *hitherto*, *likewise*,
*therefore* and *perhaps*. Write common nouns in lower case. Put the long s
in the text only on the title (`app.titlePage`), which reads as the English
title with every ſ an s; the face sets it everywhere else. A word in doubt
goes to his Dictionary (johnsonsdictionaryonline.com).

**Where it departs from the guide, for the owner to strike.** Settings is
*Particulars*, Help *Preface*, Sources *Authorities*, Units *Measures*,
Metric *Metrick*; the fridge is *the ice chest*; *Cancel* is *Leave off*;
*Rolling boil* is *It boils in earnest*; *Heat off, lid on* is *Fire out,
lid on*; *Custom* is *Your own*; the sizes are Small, *Middling*, Large,
*Very large*, *Largest*. The alarm's titles are *Out with them* and
*Cooling ended*; the reset dialog *Shall I learn anew?*; Help's motto *Time
the egg, and not the minute*. Sous-vide, probe thermometer and Help's
citations keep their modern words.

**The face** (`DECISIONS.md` 65, 66) is IM FELL English, roman and italic,
served by the app. Every ligature is on, and its `hist` sets the long s
before another letter, so the catalogue keeps a plain s for screen readers,
search and the length budgets. One weight, and old-style figures, except in
a number the cook types or steps. On iOS what UIKit draws, and the Live
Activity, keep the system face; `ios/App/PeriodFace.swift` has the rest.
