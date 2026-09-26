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
| iOS, heat-off explanation | "The standing method: the pan coasts down…" | "standing method" is the README's name for it, not a cook's |
| both, presets | "Fridge 4°", "Sous-vide 63°" | there is no unit, and °F is coming (§4) |

**Strings that are about to change anyway.** Phase E rewrites the feedback copy:
three white answers, every answer optional, "still learning" beside the time, and
a thermometer prompt. Those strings should go straight into the catalogue, which
is why F1 comes before E2 (§7).

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
- **It is one row in the language picker.** Both apps get an in-app picker in
  F1 in any case, because the catalogue is ours and not Apple's. iOS's own
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
Dictionary of the English Language* (1755). The owner chose it on 26 September,
and it is on Project Gutenberg as ebook 5430. The owner reviews the catalogue
against it. The rules below come from reading the whole text: 9,648 words,
counted by script, not recalled. **Two of them contradict the guide this
section used to give, and the text wins.**

- **No capitalised common nouns.** The text prints nouns in lower case and
  capitalises only proper names and deliberate personifications ("Learning and
  Genius"). The older habit of capitalising every noun had gone from Johnson's
  printed prose. A capital therefore marks a personification, and the
  personifications are few: Time, perhaps, or Heat.
- **No stage-play archaisms.** *'tis*, *pray*, *forthwith*, *whilst*, *thee*,
  *thou*, *hath* and *doth* occur **zero** times in the Preface. They make an
  imitation of the period, not the period. Johnson's own connectives are
  *hitherto* (7), *likewise* (8), *therefore* (17) and *perhaps* (17). A test
  fails the catalogue if any of the eight appears.
- **His spellings, used as a fixed table.** The text has *publick*,
  *domestick*, *academick* (and ten other *-ick* words); *authour*,
  *superiour*, *labour*, *honour*; *enquire*, *enterprize*, *surprize*;
  *chace*, *persue*; *shew* beside *show*. `copy/en-x-1750.spelling.json` maps
  modern to period form, and a test fails if the catalogue uses the modern one.
  That is the maintainable part: a contributor does not need to know that
  *public* wants a *k*.
- **The figures that carry the voice.**
  - Antithesis in balanced pairs: "to search was not always to find, and to find
    was not always to be informed".
  - Triads.
  - Latinate abstraction.
  - The general maxim drawn from a particular case.
  - A melancholy, self-deprecating first person, the lexicographer as "the
    slave of science".
  - Semicolon chains: 0.9 semicolons per sentence.
- **Two lengths, because the text has two.** Its median sentence is 39 words
  and its 90th percentile is 77. That suits a hint or an explanation, and it is
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
| alarm body | Straight into the cooling, or the yolk keeps cooking. | Commit them at once to the cold; for heat, though withdrawn from the fire, is not yet withdrawn from the egg. |
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

Nothing in this file is waiting on a decision.
