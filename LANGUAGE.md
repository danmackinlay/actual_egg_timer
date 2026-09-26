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
up as a failing test and not as a surprise in a German kitchen.

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
- **Size classes follow the region, not the unit.** "Large — 68 g" is an EU
  Large. An American Large is about 57 g, so relabelling it "Large — 2.4 oz"
  would put the wrong name on the wrong egg for exactly the cook who switched.
  In the US the classes become the ones printed on the carton (Medium 49.6 g,
  Large 56.7 g, Extra large 63.8 g, Jumbo 70.9 g, from the per-dozen minimums),
  and the rest of the world keeps the EU ones. README §6 already warns about
  this confusion. The app should take its own advice.
- **The record stays SI.** The record in `INFERENCE.md` §4 does not care what
  the cook saw. It gains `units` only so that the fit can check whether
  rounding at input shows up in the residuals.

## 5. Languages

**The first one.** Build the machinery with English. Then add one language
chosen to stress the machinery before any language is chosen for reach. German
is the recommendation:

- long compounds, which will test the length budget
- the decimal comma
- its own egg vocabulary: *wachsweich* is a word for jammy that English does not
  have

**Doneness words are not translated. They are matched.** *Weich*, *mollet*,
*jammy* and *soft* are culturally placed, not synonyms. Each language picks its
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

**Mechanically it is a locale.** Its tag is `en-x-1750`, a private-use subtag
of the kind BCP 47 provides for this. It is a full catalogue, under the same
placeholder, length and conformance tests as any other language.

**Trigger: the act of switching, not the default.** Units default from the
region (§4), so an American opening the app for the first time sees °F in plain
English. The register switches on when a cook whose UI language is English
flips the setting to Imperial themselves. It goes away when they flip back. An
explicit choice of units is stored separately from the regional default. That is
what makes the switching detectable, and it is also correct behaviour for units
in its own right.

This is a recommendation, and the owner decides it (§8). The alternative is to
default everyone to metric. Then every American who wants °F gets 1750 on the way
there, which is funnier once and a support burden permanently.

**Style guide**, so it reads as 1750 and not as a Renaissance fair:

- Capitalised Nouns, as in the period.
- *whilst*, *'tis*, *pray*, *forthwith*, *heretofore*.
- A *Receipt*, not a recipe. The *Fire*, not the hob. *Physick*, where the
  science is invoked.
- Sentences with subordinate clauses, and semicolons in them; the Reader
  addressed as *the Reader* (no thee and thou, which is a century too early).
- **No long s (ſ) in body text.** Screen readers announce it as "long s" and
  search does not match it. It may appear once, in the title, behind an
  accessibility label.

  > *The Actual Egg-Timer; or, a Philoſophical Enquiry into the Boiling of
  > Eggs*

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
4. **There is a way out that keeps °F.** It sits quietly at the bottom of
   settings and is written in the register: *"Should the Reader find this Style
   tiresome, the Modern Tongue may be restored without surrendering Fahrenheit's
   Scale."* A non-native English reader, or anyone who reads with difficulty,
   should not have to give up their units to understand their timer.

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
5. **F5, German**, reviewed by a native speaker.
6. **F6, 1750.** It comes last because it needs F1's catalogue, F3's setting and
   F2's settled modern wording to shadow.

E1's record gains `lang`, `register` and `units`. That is three short strings
with no privacy cost beyond what `app` already reveals. They should be added
while the schema is still unwritten.

## 8. Decisions that are the owner's

- **The trigger (§6).** The recommendation is the act of switching, with the
  default following the region. The alternative is metric for everyone.
- **The way out that keeps °F (§6, rule 4).** Recommended.
- **The first language after English.** German is recommended as the stress
  test. Choose differently if reach matters more than rigour.
- **Who reviews the German**, and who reviews the 1750. The second is a question
  of taste, and it is the owner's.
- **US carton size classes in the US (§4).** Recommended, because otherwise the
  unit switch mislabels the egg.
