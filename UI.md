# UI.md — fewer controls, room for sentences

A design, and a record of what was built from it: the web half (section 8,
27 September), iOS's two passes after it (sections 9 and 10, 28 September),
and a tighter egg in both apps (section 11, 28 September). Where a later
section changes an earlier one, the later one is what the code does. It
comes from the owner's steer of 27 September 2026:

1. Decorate brief controls and buttons with a longer (i) disclosure.
2. Keep few enough controls on screen that longer strings fit where they help,
   for clarity or for comedy.
3. Judge comprehension in place, on a phone, not in a table.

The third point changes how wording gets reviewed. Short strings stop being
approved row by row in LANGUAGE.md. They are shipped to a preview and edited
where they are read.

---

## 1. Where things stood, before the redesign (27 September)

The web app's idle screen shows about thirteen controls at once: doneness,
size, three measuring fields, where the egg comes from, the start, the heat
after the boil, the cooling, the probe, the water, the egg count, the altitude
and the units. It also shows mute and start. iOS shows about eight, with the
pan, hob and altitude folded away. Every label is squeezed to a word or two
because every one of them is on screen all the time. The two apps also lay
the controls out differently, which is where most of the remaining drift comes
from (LANGUAGE §3, "one wording per meaning": 46 keys differ only because the
layouts do).

## 2. Principles

- **One decision per screen.** Each phase shows what the cook must act on now,
  and no more.
- **Set once, cook many.** Most inputs are properties of the kitchen, not of
  the egg: units, altitude, water, egg count, the probe, and the language. They
  live on a separate Settings page and are visited rarely.
- **The setup is a sentence, not a form.** What varies from egg to egg is
  shown as one line of prose, and each clause of it is tappable:

  > *A **68 g egg** from the **fridge**, into **boiling water**, then an **ice
  > bath**.*

  Tapping "fridge" opens the egg-from choice in place, and the sentence
  rewrites itself around the answer. The sentence replaces five controls, and
  a person reads it in a second.
- **Terse control, longer (i).** A control's own label stays short. A key `K`
  may have a sibling `K.more`, a paragraph opened in place by an (i): no modal
  and no popover, the same pattern already built for the odds line. The `.more`
  surface gets a generous length budget, and it is where the intuition, and
  the jokes, go.
- **One place for longer text per phase.** Each phase screen has a single slot
  under the time for one or two sentences, such as why the counter keeps
  cooking or what the pan is doing now. This is where the funny and nuanced
  copy lives: refusals, sous-vide, the colophon, empty states.
- **Both apps, one layout.** The redesign is the chance to give web and iOS the
  same structure. Most of the 46 "different layout" keys then collapse into
  shared ones.

## 3. The screens

As designed. As built, the odds line became a sentence saying which way the
egg is likely to miss, the language picker arrived with F6, and a running
cook shows its setup sentence in place of a method line (sections 8-11).

**Idle.**
- The time, big, with the odds line and its (i).
- The doneness slider (odds-shaded).
- The setup sentence.
- One longer line when it matters: the refusal, the advice, or a first-egg
  welcome.
- The start button.
- A "Settings" link.

That is two controls and one sentence, against thirteen today.

**Settings** (web: a section below the fold, or its own view; iOS: a pushed
page).
- Units.
- Altitude, with the boiling point it gives.
- Water.
- Egg count.
- Heat after the boil.
- The probe.
- What I've learned, with Forget (confirmed on both apps).
- Language, once there is more than one.

Each item has its own (i).

**Heating** (cold start).
- The time.
- One line: "tap when the whole surface rolls" (i).
- The *Full rolling boil* button.
- Cancel.

**Cooking.**
- The time.
- One line, for the method: keep it boiling, or lid on and burner off.
- Cancel.
- The probe offer, once, if it has not been answered.

**Pull.**
- The big instruction.
- The pull button: *They're in the ice bath*, *They're out*.
- One line: what is happening to the yolk now.

**Cooling / Done.**
- The countdown to the peak.
- The probe prompt, if enabled.
- The two questions (yolk and white).
- One line of thanks, or of what I learned.

## 4. The (i) component

- **Keys.** `K.more` beside `K` in `copy/en.json`, with a new surface `more`
  whose budget is paragraph-sized. Translators get the same pairs.
- **Web.** A `<button aria-expanded>` with the (i) glyph and an accessible name
  ("About {label}"). The paragraph is inserted after the control. It is
  keyboard-operable, and the design system is the one the odds line already
  uses.
- **iOS.** The same, built as a `DisclosureGroup`-like inline expansion.
  VoiceOver reads "About {label}, collapsed/expanded".
- **Which controls get one.** Only where the intuition does not fit in the
  label. The first candidates are the ones this conversation has already found
  hard to say short:
  - the cooling choice (why the counter keeps cooking)
  - heat after the boil (why the water decides)
  - the probe (why the highest number, and why at that moment)
  - the odds (built)
  - Forget (what it clears, and why a few wrong answers wash out anyway)
  - "about 6:40 to boil, based on history" (what history)
  - egg-from (why the fridge is more predictable)

## 5. What this retires

The short-string approvals still open in LANGUAGE §3 are largely overtaken:

- The four over-budget rows can keep a short label and move their meaning
  into `.more`.
- The unification table shrinks, because a shared layout makes most pairs
  vanish.
- The two counter-rest notification lines stay short, being notifications,
  but the phase screen's one-line slot gets to say it properly.

## 6. How to review it

In place, per the owner:

1. The web app is built first, because it is the fastest to iterate.
2. It goes to a **deploy preview**, not to production, so the owner can use it
   on a phone and edit the words in context. That needs a branch pushed to
   the remote, which is the owner's call.
3. iOS follows the web layout once the owner is happy with it.

Still open on 28 September: nothing is pushed, so no deploy preview exists,
and iOS followed (sections 9-11) without waiting for it.

Wording then gets reviewed on the screen, and LANGUAGE.md records the result
rather than being the place of review.

---

## 7. Two tiers: the (i), and Help

The owner's steer of 27 September, after using the first web preview:

- **The (i) is for one control's meaning.** One component, one look and one
  behaviour everywhere: a circled *i* that opens a paragraph in place, under
  the line it sits on. No triangles, no chevrons, no second kind of
  disclosure. What it opens is short enough to read standing at the hob.
- **Help is for the whole story, opened on purpose.** A page of its own (on
  the web, `#help`), with a Back button: how I work, what I learn and from
  what, getting reliable eggs by method, how sure I am, where I'm unsure, and
  sources. Anything that depends on the setup, or is longer than one
  control's meaning, goes there. The low-odds line is a link into it
  ("How to make this more reliable →"), not a disclosure, and the changes
  that would help the setup on screen are listed at the top of its
  reliability section.
- **Never narrate what the interface just visibly did.** The cook can see
  controls go away and come back.

## 8. As built (web), 27 September 2026

`index.html`, `styles.css` and `src/ui/app.ts`; core unchanged. Every string
is in `copy/en.json`, and `tools/copyDraft.ts` lists each one the redesign
added, changed or took off the web (the `redesign` draft, on `80799d0`).

**Three views, one page.** The egg, `#settings` and `#help`, hash-routed
(`#kitchen`, the Settings page's first address, still opens it), so
the phone's back button leaves a page the way it came; the page's own Back
goes back along that history, or to the egg when the page was opened from
its address. A running cook is always the egg, whatever the address says.
Settings and Help are links at the top of the egg; Help is also at the top of
Settings. Mute sits top right in every phase.

**The egg.** The time with its line under it, which way the egg is likely
to miss with its (i) (the outcome summary, below); the doneness slider; the
setup sentence; one slot; Start at the bottom. The slot holds a refusal, or the sous-vide
warning, or a reloaded cook's warning; failing those, before anything is
learned, a first-egg welcome. The low-odds link to Help goes under whichever
is there: it is one short line, not a longer one.

**The sentence** is `setup.sentence`, "{egg} {from}, {start}, {cooling}.",
and each placeholder is a button. Each fragment carries its own preposition
and article ("from the fridge", "then an ice bath"), so the template is only
punctuation in English and a translation may reorder it freely. The egg is
"68 g eggs", in the plural, because English puts "a" or "an" before a number
by how it sounds ("an 80 g egg"), which a fragment cannot know. Sous-vide
says "{egg}, {start}.": where the egg comes from and how it cools change
nothing there. A clause opens its choice in a panel under the sentence, one
at a time, with its own (i) and a Done that returns the focus to the clause;
the sentence rewrites itself as the answer changes, keeping the focus where
it is. The egg's panel holds the size menu and the three measuring fields.
Each clause's name to a screen reader is "{label}: {value}, change" ("Egg:
68 g, change").

**Settings**: units, altitude with the boiling point it gives, water, eggs
in the pan, heat after the boil, the probe thermometer, and what I've
learned with Forget, which now asks first, in place, as iOS does (the
`learned.confirm.*` keys, now both apps'); then the colophon. Each has its
(i). In sous-vide the settings that change nothing there are put away, as
before.

**Phase screens**: the phase label (the instruction), the time, one line
under it, the slot, and the action bar. The stats row (peak yolk, after the
boil, water boils at) and the texture note are gone from the phases. What
was said under the time at "Eggs in" stays under it for the whole cook, as
it always has: the odds until the outcome summary, the direction since. The
boiling point moved to Settings, beside the altitude; the peak yolk is in
the doneness heading (section 11). Heating's
"wait for the whole surface to roll" has an (i) that says what a full
rolling boil looks like and why the tap matters. Everything else is as it
was: the phases, the alarm, the pull button, the probe offer and reading,
the two questions, mute, a reloaded cook.

**The action bar** (28 September) is opaque, fading in over its top 20 px, and stuck to the bottom of the page's column rather than fixed over it, so what scrolls under it is hidden, not read through the hint, and the last line always scrolls clear of it, however tall the bar.

**The outcome summary** (built the same day, on the hooks the redesign left;
the `outcome` draft in `tools/copyDraft.ts`). Under the time, in place of
"7/10 eggs hit the mark", a sentence says which way the egg is likely to
miss, with the odds' (i) at its end; under it, a line when a runny white is
a real risk; then "I'm still learning" and its (i), as before (since gone,
below). The numbers
are `predictOutcome` (INFERENCE.md §8), read at the decided time on the
decision's own surface, on the main thread beside the decision: about 2 ms
beside its 13-16, so it does not need the worker. `src/ui/outcome.ts` picks
the words:

| P(just right) | lean | sentence |
|---|---|---|
| ≥ 0.5 | balanced | Probably just right. |
| ≥ 0.5 | firm / soft | Probably just right. If not, more likely a little firm / soft. |
| < 0.5 | balanced | Could come out softer or firmer than you like — I can't call it yet. |
| < 0.5 | firm / soft | It could miss, and if it does, more likely firmer / softer than you like. |

"Probably" is more likely than not, so 0.5; the lean is core's, a miss one
way at least three times in five. On the reference pot a fresh install
reads 0.21-0.30 and balanced at every level ("I can't call it yet"), and one
egg just right gives 0.56-0.58 ("Probably just right"). "The white might
still be runny." shows from P(runny) 0.2, one egg in five, not the 0.15
first drafted: a fresh install at soft reads 0.17 on the reference pot, and
that is the prior's width, which is wide so the filter can learn and not
because anyone believes it. At 0.2 it speaks at the white-bound ends: the
softest levels on a fresh install (0.36 at runny), the counter's softest
(0.42-0.45), a cold start's soft on a fresh install (0.22), and 0.21 at
runny after three eggs just right.

The number went first into what the (i) opens ("About 8 in 10 eggs like
this come out just as you like them…"), and later the same day out of it
altogether (below): since then no screen shows it, in either app. The odds
survive as the track's shading, the low-odds link to Help and the
refusals at 3 in 10. (The ticket carried `oddsTenths` until 28 September,
never read; the egg's record never did.) The
direction and the white's line ride with the cook, as the odds did, and
come back after a reload.

`#donenessBracket` runs from `levelLow` to `levelHigh` under the track, with
a short mark at `levelMedian`, in the foreground colour at 70%: not the
accent, not the odds' yolk, and below the track, so it never covers the
shading; it reads in both schemes.

**The track is a yolk** (the owner's steer, 27 September): its hue runs
deep orange at runny, golden at jammy, pale yellow at hard (`--yolk-runny`,
`--yolk-jammy`, `--yolk-hard`, deeper in the light scheme), and the odds
stay its opacity, a mask over that hue, where they were a green. After three consistent eggs it is about
the thumb's width and peeks out either side; on a fresh install it runs
from soft to fudgy. The slider is described by it as well
(`aria-describedby="donenessRange"`): "Likely yolk: Soft to
Fudgy", each end the nearest doneness word, or "Likely yolk: Jammy" when
both ends are nearest the same one. The words stand alone after a colon, as
LANGUAGE.md §5 asks. The bracket is not drawn before the pot's surface
lands, where the white never sets, in sous-vide, or once a cook is running
(the slider is put away).

**Nothing jumps.** While idle the direction holds two lines, the most any
of its sentences takes at 390 px, and centres a one-line sentence in them,
so a drag that changes the sentence does not move the slider. While a new
pot's surface is on its way the readout keeps the height it last had, so
the choice open in the sentence does not move under the thumb that just
changed it. The white's line can still appear mid-drag near the soft end, which moves the slider down a line; a range
input takes its value from where the pointer is across the track, so the
drag should hold, but that is not checked on a phone.

Help's "How sure I am" (`help.odds.*`) now says which way an egg is likely
to miss, what the bracket is, and how the time leans; it gives no number.

**Playing safe** was built on 27 September (the `safe` draft, on `ff6c6e9`)
and taken off both apps on 28 September (section 11): a one-tap suggestion
under the direction to move the slider to a level that plays safe, from
core's `saferLevels` (INFERENCE.md §8), which was deleted the same day. The
LOGBOOK entries of those two days record how it behaved.

**The direction's one (i)**, named "How sure I am", now opens three
paragraphs:

- what the bracket is, and how to play safe with it: slide right until its
  left end is somewhere you'd still be happy, or left for the mirror;
- why it starts wide (`outcome.why`, the web's `odds.why` without the
  number);
- what I learn from, and what speeds it up (`outcome.learning`).

The number is gone from the (i). The (i) shows only while idle, because it is about the slider. Mid-cook, the
direction and the white's line still stay as they were at "Eggs in".

**"I'm still learning" is gone from the web** (owner). Beside "I can't call
it yet" it said the same thing twice. Its (i)'s content is the last of the
three paragraphs. The E5 computation stands; the ticket carried
`stillLearning`, never read, until 28 September. iOS followed in pass B (section 10), and
`odds.stillLearning`, `odds.info` and `odds.why` are retired.

**Departures from sections 3 and 4.**
- **Heat after the boil stayed on the Settings page**, not in the sentence. It
  is a habit of a kitchen rather than a property of an egg, it is tied to the
  water, which lives there, and a fifth clause would push the sentence onto
  a third line at 390 px. The idle line under the time says "with the lid
  on" when it is set, so the time is never read without it.
- **Mute is at the top of every screen**, and the Settings and Help links at
  the top of the egg rather than below it: they are rare visits and belong
  out of the thumb's way, which is where Start is.
- **The Settings page's title is `controls.settings`**, "Settings" in both
  apps: iOS's group title "Pan, hob and altitude" named the pan as a
  stand-in for the stove, which the owner ruled out.
- **One more (i) than listed**, for "about 6:40 to boil, based on history"
  (what history). "I'm still learning" had one too, until playing safe
  folded it into the direction's.
- **An (i)'s name is "About {label}"** where the label reads inside it, and a
  name of its own where it does not (`*.info` keys: "About this boil time").
- **The language picker** came with F6 (28 September): a Language row in the
  Settings, *English* / *English (1750)* (LANGUAGE.md §6).

**Keys iOS held that the web had replaced**, all retired by iOS pass A
(section 9): `controls.start.hintSousVide` (cut by the owner), `controls.probe` and
`controls.probe.hint` (the web's probe row is `controls.thermometer`, its
checkbox `controls.thermometer.ask`, its (i) `controls.thermometer.more`),
`learned.forgetExplain` (`learned.forget.more`), `controls.then`
(`controls.cooling`), `controls.afterBoil.explainHeatOff` and
`.explainHold` (`controls.afterTheBoil.more`), and the stat labels
`readout.stat.peakYolk`, `.afterBoil` and `.bath`.

## 9. As built (iOS, pass A), 28 September 2026

Layout only: the web's egg, Settings and Help on iOS, and the one (i).
`ios/App`: `ContentView.swift` (the egg), `SetupSentence.swift`,
`SettingsView.swift`, `HelpView.swift`, `Info.swift` (the (i)),
`Controls.swift`, `Palette.swift`; core unchanged. The copy is the `iosA`
draft in `tools/copyDraft.ts`, on `91d5fff`: 132 rows and no change of
wording. The web's keys gain `"ios"`, the iOS keys they replace are
retired, and there are three new iOS keys.

**Two pages, pushed.** The egg is the root of a `NavigationStack`. While
idle, Settings (`controls.settings`) sits at the top left of the bar and
Help (`help.link`) at the top right; both go while a cook runs, as on the
web. The system's Back button replaces `nav.back`.

**The egg**, top to bottom:
- The readout: "Total time", the time, and the web's line under it
  (`readout.sub.coldAssumes` with its (i), `coldGuesses`, `standing` or
  `hot`).
- **The direction's slot**, `direction(_:)` in `ContentView.swift`. In pass
  A it still held the iOS odds line; pass B put the direction there.
- The doneness slider. Its label is above it and the odds track under it,
  with the five doneness words at their levels. Then the reading
  (`controls.doneness.value`, "Jammy · peak yolk 65 °C", or `valueBath`;
  since section 11 in the heading instead), and the texture note (in
  sous-vide, the bath's note).
- The sentence, then the open clause's panel.
- The slot: the refusal, the sous-vide warning, or the first-egg welcome.
  Under low odds, "How to make this more reliable →" goes under any of
  them and pushes Help at its reliability section.
- The web's hint above the button, then Start. The button reads "Start
  heating" on a cold start and "Eggs in" otherwise. In sous-vide it is
  dead, with the bath's hint above it.

The stats row (peak yolk, peak white, after the boil, sous-vide at) is gone
from every phase, as on the web. So are the idle "Learned from N eggs" line
and the colophon, which now live in Settings.

**The sentence** is one `Text`, so it wraps as prose. Each clause is a link
to the `eggtimer-clause` scheme, and an `openURL` action on the sentence
catches it before the system does. Clauses are semibold and underlined in
the web's accent. An open clause has an accent wash behind it, not the
web's solid fill, because SwiftUI draws a link's text in the tint. The
template and the fragments are the web's (`clauseTexts`, word for word).
To VoiceOver, `accessibilityRepresentation` gives the sentence as text,
then one button per clause: "Egg: 68 g, change", expanded or collapsed.

**The panels** open one at a time under the sentence. Each has its title,
its (i) (`controls.egg.more`, `eggFrom.more`, `start.more`,
`cooling.more`) and Done. Their contents:
- **Egg:** the size menu, and the weight typed in the cook's units.
- **From:** Fridge, Room or Custom, and the web's hint with the presets'
  temperatures. Custom adds a stepper for the egg's temperature.
- **Start:** cold, boiling or sous-vide, in the web's order.
- **Cooling:** ice, tap or counter.

In sous-vide the sentence drops the "from" and "cooling" clauses, and an
open panel for either one closes with it.

**Settings** is a `Form` with these rows:
- **Units:** its (i) and a segmented control.
- **Altitude:** a stepper, then "water boils at".
- **Water**, then **Number of eggs:** one line each, the label, the (i),
  the value and a stepper.
- **After the boil:** its (i) and a segmented control.
- **Probe thermometer:** its (i), and the toggle "Ask for a reading after
  each egg".
- **What I've learned:** `learned.literature`, `.tuned`, `.pan` or
  `.both`, as on the web. Forget has its (i). It asks first, in place, with
  `learned.confirm.*`, where it was a confirmation dialog.
- **The colophon:** the web's, with its link.

In sous-vide only the units, what I've learned and the colophon stay.

**The (i)** is `InfoRow` in `Info.swift`. It holds a line, its circled *i*
(`info.circle`, filled while open), an optional control at the line's
end, and the paragraph it opens under the line. The paragraph has a rule
down its left, the web's `.disclosed`. VoiceOver reads "About {label}"
(`more.about`) or a name of its own (`readout.sub.coldAssumes.info`, `action.hint.heating.info`), and its
value is Expanded or Collapsed (`more.expanded`, `more.collapsed`, both
new). No `DisclosureGroup` is left in the app. Heating gained the web's
"wait for the whole surface to roll" line and its (i).

**Help** has the web's sections, keys and eight sources, with a contents
list that scrolls to each section.
- `[label](https://…)` in the copy becomes a link through `linked()`,
  the web's rule: only https is linked, and nothing else is parsed.
- Asides are footnote-sized and secondary.
- The top of "Getting reliable eggs" lists `Kitchen.advice`: the same
  `protocolAdvice` the web uses, which the Swift core already had.

**The track is a yolk.** It uses the web's stops for each scheme
(`Palette.yolkRunny`, `yolkJammy` and `yolkHard`, golden at 0.41), with
the odds' strength as the opacity.

**Departures from the web.**
- **The egg is weighed, not measured.** The web's girth and width fields
  (`controls.measure.girth`, `.minor`, `.legend`, `.hint`,
  `controls.size.measured`) stay web-only. Porting them would change what
  the record says the mass came from. The size menu keeps iOS's
  "Weighed · {mass}".
- **Units' (i) says "phone".** It is `controls.units.more.ios`, because
  the web's says "where your browser says you are".
- **No mute, and no reloaded-cook warning.** iOS has neither. Its alarm is
  the system's.
- **Phase screens keep the iOS words** in this pass; pass B moved them to
  the web's (section 10). Only the stats row went.

**Retired from iOS**:
- `readout.phase.totalLidOn`, `readout.sub.idleCold`, `.idleHot`
- `readout.stat.peakYolk`, `.peakWhite`, `.afterBoil`, `.bath`
- `action.eggsInHeatOn`
- `controls.eggFrom.fridgeAt`, `.roomAt`
- `controls.start.hintSousVide`, `controls.then`
- `controls.afterBoil.explainHeatOff`, `.explainHold`
- `controls.probe`, `controls.probe.hint`
- `pan.waterBoilsAt`, `pan.timeToBoil`, `.assumed`, `pan.measured`,
  `pan.unmeasured`
- `odds.shown`, `odds.hidden`
- `learned.forgetExplain`, `colophon.ios`

Each was iOS's alone, so each is deleted from the catalogue. The odds keys
went in pass B and with F6 (section 10).

**Debug screens.** A debug build takes launch arguments, so screenshots need
no taps; the header of `ios/App/Screenshots.swift` lists them.

## 10. As built (iOS, pass B), 28 September 2026

Prediction: the web's outcome summary (and playing safe, since removed) on
iOS, the phase screens in the web's words, and one track. `ios/App`: `Direction.swift`
(new, the web's `src/ui/outcome.ts`), `YolkSlider.swift` (new),
`ContentView.swift`, `Kitchen.swift`, `OddsTrack.swift`, `Cook.swift`;
core unchanged. The copy is the `iosB` draft in `tools/copyDraft.ts`, on
`44b0cb1`: 34 rows, no change of wording. The web's keys gain `"ios"`, and
the iOS keys they replace are retired.

**The direction** sits under the time, in the slot pass A left
(`direction(_:)`). It is the web's sentence, chosen by the web's rules
(`Direction.key`: "probably" from P(just right) 0.5, the lean from core),
with one (i), "How sure I am" (`outcome.info`). The (i) opens
`outcome.bracket`, `outcome.why` and `outcome.learning`, and shows only while
idle. Under it, from P(runny) 0.2 (core's `whiteRisk`), "The white might
still be runny." in the warning colour. While idle the sentence keeps two
lines' room and centres in it, so a drag that changes it does not move the
slider. "I'm still learning" and the odds line are gone, as on the web.
`oddsTenths` and `stillLearning` were on the ticket, never read, until 28
September (not in the egg's record, which never kept them).

The outcome is `predictOutcome`, read in `Kitchen.decided` at the decided
time on the decision's own surface, off the main actor beside the decision.
It rides on the ticket (core `Outcome`, Codable), so mid-cook the direction and
the white's line are what they were at "Eggs in", and they survive a
relaunch. A cook started before the decision landed carries none, as on
the web.

**The bracket** is `YolkBracket` (in `OddsTrack.swift`), under the track:
`levelLow` to `levelHigh`, cupping the track, with a mark at `levelMedian`.
It is drawn in the foreground at 70%, as on the web, and inset by the
thumb's half-width like the track. VoiceOver reads it as `outcome.range` /
`outcome.range.one`. It is hidden before the pot's decision lands, where
the white never sets, in sous-vide, and once a cook runs. Its room is kept
while it is hidden, so the words under it do not jump.

**Playing safe** was ported with the web's rules (`Kitchen.askForSafer`,
`Direction.playSafe`, a cache in `DecisionGrids`) and removed with it the
same day (section 11).

**One track.** `YolkSlider` wraps a `UISlider` with clear minimum and
maximum track images, laid over `OddsTrack`, so the yolk strip is the only
track:
- **Inset.** The slider reports its thumb's half-width after layout, and
  the strip, the bracket and the doneness words are inset by it. A level
  therefore sits exactly under the thumb that asks for it.
- **Kept from the system slider.** The system thumb stays, and so does
  VoiceOver's adjustable behaviour. Its label is `controls.doneness`, its
  value is the doneness word, and a swipe moves it a tenth of the range,
  on the 0.01 grid.
- **Haptics.** There is a selection tick each time a drag crosses into
  another doneness word. The system `Slider` had none, so this is new.
- **When there are no odds.** The strip is drawn bare before the first
  answer and in sous-vide.

**Phase screens in the web's words**:

| Phase | Label | Big number | Line under it | Over the buttons |
|---|---|---|---|---|
| Heating | `readout.phase.heating` | countdown | `readout.sub.heating` (elapsed, expected boil) | as before |
| Cooking | as before | countdown | `readout.sub.cookingCold` / `cookingHot` | `action.hint.cookingBoiling` / `cookingStanding`, then iOS's alarm line |
| Pull | as before | "+0:12", how late it runs | as before | `action.hint.pull`, except on the counter |
| Done | as before | the time in the water | `readout.sub.doneCold` / `doneHot` | as before |

The alarm line (`readout.alarm.*`) stays iOS's own, since the web's alarm
is the open tab. Its place moved from under the time to above Cancel.

**Retired from iOS**:
- `odds.info`, `odds.why`, `odds.stillLearning`
- `readout.phase.heatingTap`, `readout.sub.heatingEstimate`,
  `readout.sub.done`
- `readout.big.now`, `readout.big.eat`

**Kept, and why.**
- `odds.hitTheMark` stayed on the Lock Screen after this pass; the owner
  dropped the odds from the Lock Screen with F6 the same day, and the key is
  retired (LANGUAGE.md §6, As built (iOS)).
- `readout.phase.cooling` ("Cooling") stays for a counter rest. The web has
  no cooling phase there, and iOS never reaches one either, so it is
  effectively dead. It is left for the owner rather than deleted.
- `cook.method` and `cook.summary`, the note under a running cook, stay.
  The web has no such line. (Since section 11 the running cook shows its setup
  sentence over `cook.summary`, in both apps, and `cook.method` is retired.)

**Debug screens**: pass B added `-seedEggs` (a learned state without
cooking) and `-uiScreen direction-info`; the header of
`ios/App/Screenshots.swift` lists them all.

**What the cook sees** on the reference setup (68 g, fridge, cold start,
ice, jammy), in the simulator:

| Log | Direction | Bracket |
|---|---|---|
| Fresh install | "I can't call it yet" | Soft to Fudgy |
| After three eggs just right | "Probably just right." | about the thumb's width |
| After one egg too soft | "I can't call it yet" (the time rises to 12:09) | as shown |

## 11. As built (both apps), 28 September 2026: a tighter egg

The owner's three changes, after using the iOS app on a phone. Both apps,
the same wherever the platform allows. The copy is the `tighten` draft in
`tools/copyDraft.ts`, on `2c090c9` (LANGUAGE.md section 3).

**The doneness heading carries the peak yolk.** The slider said its word
twice: on the ticks and again in the reading under them ("Soft · peak yolk
59 °C"). The heading row now reads "Doneness" at its start and "peak yolk
59 °C" at its end (`controls.doneness.peak`), in the heading's size and a
little bolder, in the cook's units. The reading line is gone; the texture
line under the ticks stays. In sous-vide the end of the heading says
"water at 63 °C" (`controls.doneness.bath`): what the reading said there,
less the word. A screen reader still hears both, as the slider's value:
`controls.doneness.value`, "Soft, peak yolk 59 °C" (or `.valueBath`), now
an `a11y` string with a comma for the dot. The web's number in the heading
is `aria-hidden`, and iOS's `accessibilityHidden`, so it is not read twice.
In 1750 the heading reads "Degree of hardness" and "the yolk at most
59 °C", on one line at 402 pt.

**No play-safe suggestion.** The owner judged the line ("Rather not risk it
soft? Try: Jammy") visual noise that says in words what the slider and the
bracket already show. It is gone from both apps, with everything that
served it:
- the web: `#playSafeLine`, `playSafeNow`, `askForSafer`, `onPlaySafe`,
  the readout's held height while one was on its way, the worker's `safer`
  job and the `saferLevelsFor` cache, and `playSafe` / `SAFE_RISK` in
  `src/ui/outcome.ts`;
- iOS: `playSafeLine` and its hidden placeholder, `Kitchen.askForSafer`,
  `saferKey`, `playSafe`, `takePlaySafe`, `playSafeWasShown`, the slider's
  focus hand-off, `DecisionGrids`' safer cache, `PlaySafe` in
  `Direction.swift`, and the `-uiScreen take-safe` debug scene;
- the copy: `outcome.safe.firm`, `.soft`, `.firmer`, `.softer` are retired;
  `outcome.bracket` loses "Or tap the level I suggest…", and Help's
  `help.odds.p1` and `.aside` lose their sentences about it.

**Core's `saferLevels` went too** (owner, 28 September, D2), with
`test/safer.test.ts`, `fixtures/safer.json`, the Swift `Safer` suite and the
`safer` section of `npm run decide`. The direction sentence, its (i), the
bracket and the runny-white line stay as they were.

**The sentence stays on screen while a cook runs.** Under the time, where
the controls were, the setup sentence the cook was started with, so a
forgetful cook can see what they promised: "76 g eggs at room temperature,
into cold water and boiled, then an ice bath." Under it, one small
secondary line with what the sentence does not say: "soft · peak yolk
59 °C" (`cook.summary`, now both apps', without the mass the sentence
already has).
- **From the ticket**, never the controls: the egg (named as its size
  class's mass when it was a class), where it came from, the start, the
  heat after the boil and the cooling, in the units the cook was set up in.
  The web's ticket gains `peakYolk_C` and iOS's `startTemp`, both optional,
  so a cook saved before them still restores (the web then reads the
  running cook's solve; iOS reads where the egg came from off its
  temperature).
- **Nothing to tap**: plain text, no underlines, no hover, no links, one
  element to VoiceOver. The idle sentence's face: iOS `.title3` without the
  clauses' weight; the web a size down, 1.125rem.
- **Where.** iOS's summary sat under Cancel, below the probe offer, and at
  Done below the two questions, far down the page; the web has no such place,
  its action bar being stuck to the bottom. So both put it straight under
  the time card. On an iPhone 17 the heating screen still shows the
  sentence, the hint, Full rolling boil, Cancel and the probe offer without
  scrolling.
- It replaces iOS's method line and summary: `cook.method` and its five
  fragments are retired. Sous-vide never runs a cook, so it never shows
  this.

**Checked**: `npm test`, `npm run validate`, `npm run conformance`; the iOS
Debug build; screenshots on the iPhone 17 simulator, idle and heating, in
English and in 1750; the web at 375 px, idle, cooking and after a reload
mid-cook, with the slider's `aria-valuetext` read back ("Runny, peak yolk
56 °C").
