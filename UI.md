# UI.md — fewer controls, room for sentences

The layout both apps share, as the code has it now. Where the two apps differ,
§9 says how and why. Every word is a key in `copy/en.json`, named here rather
than quoted, because the wording moves faster than the layout (`LANGUAGE.md`
§3). How each part was built, and what it replaced, is in `LOGBOOK.md` (27 and
28 September 2026); the pass-by-pass notes this file used to carry are in git
at `632bdbd`.

---

## 1. Where it comes from

The owner's steer of 27 September 2026 (`DECISIONS.md` 25):

1. Decorate brief controls and buttons with a longer (i) disclosure.
2. Keep few enough controls on screen that longer strings fit where they help,
   for clarity or for comedy.
3. Judge comprehension in place, on a phone, not in a table.

Before it, the web's idle screen showed about thirteen controls at once and
iOS about eight, each label squeezed to a word or two, and the two apps laid
them out differently.

## 2. Principles

- **One decision per screen.** Each phase shows what the cook must act on now,
  and no more.
- **Set once, cook many.** Most inputs belong to the kitchen, not the egg:
  units, altitude, water, egg count, heat after the boil, the probe and the
  language. They live on a Settings page, visited rarely.
- **The setup is a sentence, not a form.** What varies from egg to egg is one
  line of prose, and each clause of it is tappable (§5).
- **Terse control, longer (i).** A control's label stays short. What it means
  goes in a paragraph opened in place by an (i) (§4).
- **One place for longer text per phase.** Each screen has a single slot for
  one or two sentences: a refusal, the sous-vide warning, a first-egg welcome.
  This is where the nuanced and the funny copy lives.
- **Both apps, one layout.** Web and iOS have the same structure, so a key
  that says the same thing is one key.

## 3. The screens

**The egg, idle**, top to bottom:

- Settings and Help at the top (web: links; iOS: the navigation bar, left and
  right). The web's mute is at the top right, in every phase.
- **The readout**: the total time, and one line under it for the method
  (`readout.sub.coldAssumes` with its (i), `coldGuesses`, `standing` or
  `hot`). With the heat off it says the lid is on, so the time is never read
  without it. While sharing is on, a small **Learning** mark sits in the
  panel's top corner with its (i) (`learning.badge`, E8, `DECISIONS.md` 53):
  the time may be nudged a few seconds, and the (i), which opens under the
  phase label, says so. Never in sous-vide.
- **The direction**: which way the egg is likely to miss, with its (i), and
  the runny-white line when it applies (§8).
- **The doneness slider.** The heading reads `controls.doneness` at its start
  and the peak yolk at its end (`controls.doneness.peak`; in sous-vide the
  water, `controls.doneness.bath`), in the cook's units. The track is the
  yolk, shaded by the odds, with the five doneness words at their levels and
  the bracket under it (§8). Then the texture note.
- **The setup sentence** (§5), and the open clause's panel under it.
- **The slot**: a refusal, or the sous-vide warning, or (web) a reloaded
  cook's warning; failing those, before anything is learned, the first-egg
  welcome (`idle.welcome`). Under low odds the link "How to make this more
  reliable →" goes under whichever is there and opens Help at its
  reliability section, which lists the changes that would help this setup
  (`advice.*`).
- The hint for the start, then **Start**: "Start heating" on a cold start,
  "Eggs in" otherwise. In sous-vide it is dead, with the bath's hint above.

That is two controls and one sentence.

**Settings** (web `#settings`, which `#kitchen` still opens; iOS a pushed
`Form`). Each row has its (i):

- Units, Metric or Imperial, and one line under Imperial in an English UI
  (`controls.units.period`).
- Altitude, with the boiling point it gives.
- Water, and the number of eggs.
- Heat after the boil: keep boiling, or heat off and lid on.
- The probe thermometer: "ask for a reading after each egg".
- Language: English or English (1750) (`LANGUAGE.md` §6).
- What I've learned (`learned.literature`, `.tuned`, `.pan` or `.both`), and
  Forget, which asks first, in place (`learned.confirm.*`).
- Share my eggs (E6, the `share` draft), with its (i): the consent always on
  screen (`share.what`), never behind the (i); the switch, off until the cook
  turns it on; under it how many eggs have gone and how many wait; Delete
  what I've sent, which asks first in place as Forget does; and the privacy
  page.
- The colophon, with its link.

In sous-vide the settings that change nothing there are put away.

**Help** (web `#help`, iOS a pushed page) is the whole story (§7), with a
contents list. `[label](https://…)` in the copy is a link; nothing else is
parsed.

**Phase screens**: the phase label (the instruction), the time, one line
under it, the slot, and the action bar. Which key each part says is core's
`phaseKeys` (`src/core/wording.ts`, held by `fixtures/wording.json`), so the
two apps cannot disagree:

| Phase | Label | Line under the time | Hint | Action |
|---|---|---|---|---|
| Idle | `readout.phase.total` | `readout.sub.coldAssumes` / `coldGuesses` / `standing` / `hot` | `action.hint.cold` / `hotStanding` / `hotBoiling` / `whiteNeverSets` | `action.startHeating` / `eggsIn` |
| Heating | `readout.phase.heating` | `readout.sub.heating` (elapsed, expected boil) | `action.hint.heating` (with its (i)) / `heatingStanding` | `action.fullBoil` |
| Cooking | `readout.phase.cookingBoiling` / `cookingHeatOff` | `readout.sub.cookingCold` / `cookingHot` | `action.hint.cookingBoiling` / `cookingStanding` | none; the probe offer, once |
| Pull | `readout.phase.pull` | `readout.sub.pull` | `action.hint.pull`, none on the counter | the pull button, naming the cooling (`pulledKey`) |
| Cooling (ice, tap) | `readout.phase.coolingIce` / `coolingTap` | `readout.sub.coolingPeak` / `coolingProbe` | none | none |
| Done | `readout.phase.done` | `readout.sub.doneCold` / `doneHot` | none | `action.startAgain`; the probe reading if asked for, and the two questions |

Cancel is under every running phase. A counter rest has no cooling phase:
the pull runs out into Done. The cooling counts down to the yolk's peak.

**While a cook runs**, straight under the time: the setup sentence the cook
was started with, as plain text with nothing to tap, and under it one small
line with what the sentence does not say (`cook.summary`: the doneness and
the peak yolk). Both come from the ticket, never from the controls, in the
units the cook was set up in. What was said under the time at "Eggs in"
stays for the whole cook and comes back after a reload or relaunch. Settings,
Help and the slider are put away.

To the left of the sentence, so it costs the column no height of its own,
**the egg in cross-section** (`DECISIONS.md` 52; web `src/ui/eggSection.ts`,
iOS `EggSectionView.swift`). It is an ovoid with a round yolk, drawn ring by ring as it
cooks, and shows how set each layer is: the yolk in the slider track's
colours, the white from a clear, faintly blue raw white to opaque. It is a
picture of what the sentence and the time already say, so it has no words
and a screen reader passes over it.

## 4. The (i) component

- **Keys.** `K.more` beside `K` in `copy/en.json`, on the surface `more`,
  whose budget is paragraph-sized. Where the label does not read inside "About
  {label}", `K.info` is the (i)'s whole name (`readout.sub.coldAssumes.info`,
  `action.hint.heating.info`, `outcome.info`).
- **One look and one behaviour everywhere**: a circled *i* at the end of the
  line it belongs to, which opens a paragraph in place under that line, with
  a rule down its left. No modal, no popover, no triangles or chevrons.
- **Web**: `info.ts`, a `<button aria-expanded>` named "About {label}"
  (`more.about`).
- **iOS**: `InfoRow` in `Info.swift`, holding a line, the *i* (filled while
  open), an optional control at the line's end, and the paragraph.
  VoiceOver reads the name and Expanded or Collapsed (`more.expanded`,
  `more.collapsed`).
- **Which controls have one**: only where the meaning does not fit in the
  label. Today: the egg, where it comes from, the start, the cooling, units,
  altitude, water, the number of eggs, heat after the boil, the probe,
  language, Forget, the boil time under the readout, the heating hint, and the
  direction.
- **Short enough to read standing at the hob.** What depends on the setup, or
  runs longer than one control's meaning, goes to Help.

## 5. The setup sentence

`setup.sentence`, "{egg} {from}, {start}, {cooling}.", where each placeholder
is a clause the cook can tap; sous-vide is `setup.sentenceSousVide`, "{egg},
{start}.", because where the egg comes from and how it cools change nothing
there.

- **Each fragment carries its own preposition and article** ("from the
  fridge", "then an ice bath"), so the template is only punctuation in
  English and a translation may reorder it. The egg is in the plural ("68 g
  eggs"), because English picks "a" or "an" before a number by its sound.
- **A clause opens its choice in a panel** under the sentence, one at a time,
  with its title, its (i) and Done (`setup.close`). The sentence rewrites
  itself as the answer changes. The panels: the egg (the size menu, and the
  mass - the web also takes girth or width), where it came from (fridge, room
  or custom, with the presets' temperatures), the start (cold water, boiling
  water or sous-vide), and the cooling (ice, tap or counter).
- **To a screen reader** each clause is a button named "{label}: {value},
  change" (`setup.clause`), expanded or collapsed. The web returns focus to
  the clause after Done.
- **Heat after the boil is not a clause.** It is a habit of a kitchen, tied
  to the water, and a fifth clause pushes the sentence onto a third line at
  390 px. The readout's line says "lid on" when it is set.

## 6. How wording is reviewed

In place, on a phone (`DECISIONS.md` 25): a named draft goes into both apps,
the owner uses it and says what to put back. The draft under review is
`tidy` (`LANGUAGE.md` §3). The web was meant to be judged on a deploy preview
first; that needs a pushed branch, which is the owner's call, so iOS followed
without waiting.

## 7. Two tiers: the (i), and Help

The owner's steer of 27 September, after using the first web preview
(`DECISIONS.md` 26):

- **The (i) is for one control's meaning** (§4).
- **Help is for the whole story, opened on purpose.** A page of its own, with
  a Back button: how I work, what I learn and from what, getting reliable eggs
  by method, how sure I am, where I'm unsure, and sources; last, a link to
  the privacy page (`privacy/index.html`, which the iOS app opens in
  Safari). Anything that
  depends on the setup, or is longer than one control's meaning, goes there.
  The low-odds line is a link into it, not a disclosure.
- **Never narrate what the interface just visibly did.** The cook can see
  controls go away and come back.

## 8. The prediction under the time

**The direction.** A sentence under the time says which way the egg is likely
to miss (`DECISIONS.md` 27). It comes from core: `predictOutcome` at the
decided time on the decision's own surface (`INFERENCE.md` §8), and
`directionKey` for the words (`src/core/wording.ts`, `fixtures/wording.json`).

| P(just right) | lean | key |
|---|---|---|
| ≥ 0.5 | balanced | `outcome.likely` |
| ≥ 0.5 | firm / soft | `outcome.likely.firm` / `.soft` |
| < 0.5 | balanced | `outcome.unsure` |
| < 0.5 | firm / soft | `outcome.miss.firm` / `.soft` |

"Probably" is more likely than not, so 0.5 (`DIRECTION_LIKELY`); the lean is
core's, a miss one way at least three times in five (`LEAN_RATIO`). A fresh
install reads 0.21-0.30 and balanced at every level on the reference pot; one
egg just right gives 0.56-0.58.

**The white's line**, `outcome.whiteRunny`, in the warning colour, shows from
P(runny) 0.2 (`WHITE_RISK`), one egg in five. That is where it speaks at the
white-bound ends: the softest levels on a fresh install, the counter's
softest, a cold start's soft. It is not lower because a fresh install at
soft reads 0.17 on the reference pot, and that is the prior's width.

**The direction's (i)**, "How sure I am" (`outcome.info`), shows only while
idle, because it is about the slider. It opens three paragraphs: what the
bracket is and how to play safe with it (`outcome.bracket`), why it starts
wide (`outcome.why`), and what I learn from and what speeds it up
(`outcome.learning`). No screen shows the odds as a number.

**The bracket** runs under the track from `levelLow` to `levelHigh`, with a
short mark at `levelMedian`, in the foreground colour at 70%: not the accent,
not the yolk, and below the track, so it never covers the shading. A screen
reader hears "Likely yolk: Soft to Fudgy" (`outcome.range`, `.range.one` when
both ends are nearest one word; the words stand alone after a colon,
`LANGUAGE.md` §5). It is not drawn before the pot's surface lands, where the
white never sets, in sous-vide, or once a cook runs; its room is kept, so
nothing under it moves. On a fresh install it runs from soft to fudgy; after
three consistent eggs it is about the thumb's width.

**The track is a yolk** (`DECISIONS.md` 31): deep orange at runny, golden at
jammy, pale yellow at hard (web `--yolk-runny`, `--yolk-jammy`,
`--yolk-hard`; iOS `Palette.yolkRunny`, `yolkJammy`, `yolkHard`), deeper in
the light scheme. The odds are its opacity: each level's odds over the best
level's, so a fresh install at 2/10 everywhere still shows where the pan
works. Dots mark levels the pan delivers but the odds do not offer; stripes
mark what the pan cannot deliver. The strip is bare before the first answer
and in sous-vide.

**Nothing jumps.** While idle the direction keeps two lines' room and centres
a one-line sentence in it, so a drag that changes the sentence does not move
the slider. While a new pot's surface is on its way, the readout keeps its
last height. The white's line can still appear mid-drag near the soft end.

**The slider** is described by the bracket too (web
`aria-describedby="donenessRange"`). Its value to a screen reader is
`controls.doneness.value` (or `.valueBath`), and the heading's number is
hidden from it so it is not read twice. On iOS it is `YolkSlider`, a
`UISlider` with clear tracks over `OddsTrack`, inset by the thumb's
half-width so a level sits exactly under the thumb that asks for it; it
keeps VoiceOver's adjustable behaviour (a swipe moves a tenth of the range,
on the 0.01 grid) and ticks a selection haptic each time a drag crosses
into another doneness word.

## 9. Where the apps differ

- **Measuring the egg.** The web also takes girth or width
  (`controls.measure.*`); iOS is weighed only, so its record never says the
  mass came from a tape.
- **Mute, and the reloaded cook.** The web plays its own sound, so it has
  mute; it can lose a cook to a reload, so it has `readout.restored`. iOS has
  neither: its alarm is the system's, with iOS's own status line
  (`readout.alarm.*`) above Cancel.
- **The units' (i)** says "phone" on iOS (`controls.units.more.ios`) where the
  web says "browser".
- **The open clause** has a solid accent fill on the web and an accent wash on
  iOS, where a link's text takes the tint. VoiceOver focus does not return to
  the clause after Done on iOS.
- **The action bar** on the web is opaque, fading in over its top 20 px, and
  stuck to the bottom of the page's column rather than fixed over it, so what
  scrolls under it is hidden and the last line always scrolls clear.
- **The Lock Screen and Dynamic Island** are iOS's alone: the pull names the
  cooling, word for word as the alarm does, the card ends when the cooling
  does, and it carries no odds (`DECISIONS.md` 32, 33).

## 10. Screenshots and checks

A debug iOS build takes launch arguments (`-uiScreen`, `-seedEggs`,
`-noAlarmPrompt` and others), so screens can be reached without a tap; the
header of `ios/App/Screenshots.swift` lists them. The web's states are driven
by `npm run copy:snapshot` (`tools/copySnapshot.ts`).

What the cook sees on the reference setup (68 g, fridge, cold start, ice,
jammy):

| Log | Direction | Bracket |
|---|---|---|
| Fresh install | `outcome.unsure` | Soft to Fudgy |
| Three eggs just right | `outcome.likely` | about the thumb's width |
| One egg too soft | `outcome.unsure`, and the time rises | wide |

What has not been seen on a phone is in `PLAN.md`'s QA list.
