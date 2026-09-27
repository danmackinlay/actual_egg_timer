# UI.md — fewer controls, room for sentences

A design, not a record: none of it is built. It comes from the owner's steer
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
