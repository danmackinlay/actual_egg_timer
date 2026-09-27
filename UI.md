# UI.md — fewer controls, room for sentences

A design, and since 27 September a record of the web half (section 8). It comes from the owner's steer
of 27 September 2026:

1. Decorate brief controls and buttons with a longer (i) disclosure.
2. Keep few enough controls on screen that longer strings fit where they help,
   for clarity or for comedy.
3. Judge comprehension in place, on a phone, not in a table.

The third point changes how wording gets reviewed. Short strings stop being
approved row by row in LANGUAGE.md. They are shipped to a preview and edited
where they are read.

---

## 1. Where things stand

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
  live on a separate Kitchen page and are visited rarely.
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

**Idle.**
- The time, big, with the odds line and its (i).
- The doneness slider (odds-shaded).
- The setup sentence.
- One longer line when it matters: the refusal, the advice, or a first-egg
  welcome.
- The start button.
- A "Kitchen" link.

That is two controls and one sentence, against thirteen today.

**Kitchen** (web: a section below the fold, or its own view; iOS: a pushed
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

**Three views, one page.** The egg, `#kitchen` and `#help`, hash-routed, so
the phone's back button leaves a page the way it came; the page's own Back
goes back along that history, or to the egg when the page was opened from
its address. A running cook is always the egg, whatever the address says.
Kitchen and Help are links at the top of the egg; Help is also at the top of
the Kitchen. Mute sits top right in every phase.

**The egg.** The time with its line under it, which way the egg is likely
to miss and "I'm still learning", each with its (i) (the outcome summary,
below); the doneness slider; the setup sentence; one slot; Start at the
bottom. The slot holds a refusal, or the sous-vide
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

**The Kitchen**: units, altitude with the boiling point it gives, water, eggs
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
boiling point moved to the Kitchen, beside the altitude; the peak yolk is in the slider's reading. Heating's
"wait for the whole surface to roll" has an (i) that says what a full
rolling boil looks like and why the tap matters. Everything else is as it
was: the phases, the alarm, the pull button, the probe offer and reading,
the two questions, mute, a reloaded cook.

**The outcome summary** (built the same day, on the hooks the redesign left;
the `outcome` draft in `tools/copyDraft.ts`). Under the time, in place of
"7/10 eggs hit the mark", a sentence says which way the egg is likely to
miss, with the odds' (i) at its end; under it, a line when a runny white is
a real risk; then "I'm still learning" and its (i), as before. The numbers
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

The number is in what the odds' (i) opens: "About 8 in 10 eggs like this
come out just as you like them, with the white set.", then `odds.why`. The
(i) keeps its name, "About these odds". `oddsTenths` is still recorded with
every egg. The direction, the white's line and the number ride with the
cook, as the odds did, and come back after a reload.

`#donenessBracket` runs from `levelLow` to `levelHigh` under the track, with
a short mark at `levelMedian`, in the foreground colour at 70%: not the
accent, not the odds' green, and below the track, so it never covers the
shading; it reads in both schemes. After three consistent eggs it is about
the thumb's width and peeks out either side; on a fresh install it runs
from soft to fudgy. The slider is described by it as well
(`aria-describedby="donenessValue donenessRange"`): "Likely yolk: Soft to
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
changed it. The white's line and "I'm still learning" can still appear
mid-drag near the soft end, which moves the slider down a line; a range
input takes its value from where the pointer is across the track, so the
drag should hold, but that is not checked on a phone.

Help's "How sure I am" was already written for a direction plus a range;
its second paragraph now says "7 in 10" and "2 in 10", as the (i) does.

**Departures from sections 3 and 4.**
- **Heat after the boil stayed on the Kitchen page**, not in the sentence. It
  is a habit of a kitchen rather than a property of an egg, it is tied to the
  water, which lives there, and a fifth clause would push the sentence onto
  a third line at 390 px. The idle line under the time says "with the lid
  on" when it is set, so the time is never read without it.
- **Mute is at the top of every screen**, and the Kitchen and Help links at
  the top of the egg rather than below it: they are rare visits and belong
  out of the thumb's way, which is where Start is.
- **The Kitchen's title reuses `controls.pan`**, reworded "Kitchen" for both
  apps: iOS's group title "Pan, hob and altitude" named the pan as a
  stand-in for the stove, which the owner ruled out.
- **Two more (i)s than listed**, for "about 6:40 to boil, based on history"
  (what history) and "I'm still learning" (what, and what speeds it up).
- **An (i)'s name is "About {label}"** where the label reads inside it, and a
  name of its own where it does not (`*.info` keys: "About this boil time").
- **The language picker** is not there, as §3 foresaw, because there is one
  language.

**Keys iOS still holds that the web has replaced.** When iOS follows, these
go: `controls.start.hintSousVide` (cut by the owner), `controls.probe` and
`controls.probe.hint` (the web's probe row is `controls.thermometer`, its
checkbox `probe.offer.yes`, its (i) `controls.thermometer.more`),
`learned.forgetExplain` (`learned.forget.more`), `controls.then`
(`controls.cooling`), `controls.afterBoil.explainHeatOff` and
`.explainHold` (`controls.afterTheBoil.more`), and the stat labels
`readout.stat.peakYolk`, `.afterBoil` and `.bath`.
