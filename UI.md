# UI.md — fewer controls, room for sentences

The layout both apps share. Where the two apps differ, §9 says how and why.
Every word is a key in `copy/en.json`, named here rather than quoted,
because the wording moves faster than the layout (`LANGUAGE.md` §3).

## 1. Where it comes from

The owner's steer (`DECISIONS.md` 25):

1. Decorate brief controls and buttons with a longer (i) disclosure.
2. Keep few enough controls on screen that longer strings fit where they help,
   for clarity or for comedy.
3. Judge comprehension in place, on a phone, not in a table.

## 2. Principles

- **One decision per screen.** Each phase shows what the cook must act on now,
  and no more.
- **Set once, cook many.** Most inputs belong to the kitchen, not the egg:
  units, altitude, water, heat after the boil, the probe, the room and the
  language. They live on a Settings page, visited rarely. How many eggs go
  in is decided at each cook, so it is in the sentence and the egg's panel
  (`DECISIONS.md` 115).
- **The setup is a sentence, not a form.** What varies from egg to egg is one
  line of prose, and each clause of it is tappable (§5).
- **Every number has a − and a +** beside it: the egg's weight and size, its
  temperature when it is Custom, the altitude, the water, the number of
  eggs, the room, and a bowl's water and its temperature. A press steps it
  on its grid (`src/core/units.ts`: 0.5 g, 0.1 oz, 50 m, 100 ft, 0.25 L, …),
  held it repeats, and the number stays typeable. The pair is as tall as the
  field, so no row grows (§9 has how each app draws it).
- **Terse control, longer (i).** A control's label stays short. What it means
  goes in a paragraph opened in place by an (i) (§4).
- **One place for longer text per phase.** Each screen has a single slot for
  one or two sentences: a refusal, the sous-vide warning, a first-egg welcome.
  This is where the nuanced and the funny copy lives.
- **Both apps, one layout.** Web and iOS have the same structure, so a key
  that says the same thing is one key.

## 3. The screens

**The one screen** (`DECISIONS.md` 91, 96 to 98). Setting up and boiling
are one layout, from idle to Done: at the start nothing moves and nothing
goes, and only the readout's words, its colours and the buttons change. Top
to bottom, in every phase (the 1750 title page, when it is shown, above it
all):

- Settings and Help at the top (web: links; iOS: the navigation bar, left and
  right), in every phase. The web's mute is at the top right. While a cook
  runs, Settings' pot rows correct it as the sentence does; what I have
  learned and sharing wait for it to end.
- **The readout**: the phase label (idle, "Total time"; while a cook runs,
  the instruction), the time, and one line under it (the method while idle:
  `readout.sub.coldAssumes` with its (i), `coldGuesses`, `standing` or
  `hot`; with the heat off it says the lid is on, so the time is never read
  without it). The clock is the same size in every phase. While sharing is
  on, a small **Learning** mark sits in the panel's top corner with its (i)
  (`learning.badge`, `DECISIONS.md` 58): the time may be nudged a few
  seconds, and the (i), which opens under the phase label, says so. Never
  in sous-vide.
- **How sure I am**: a line of words the cook presses, and the runny-white
  line when it applies (§8). It keeps its room in every phase; it goes at
  the pull, when the time it was about has passed.
- The hint, then **the action**, directly under the time it runs
  (`DECISIONS.md` 125): "Start heating" on a cold start, "Eggs in"
  otherwise, Rolling boil, the pull, Start again (the table below). In
  sous-vide it is dead, with the bath's hint above. The buttons are **one
  row**: while a cook runs, Cancel on the left, small and plainly secondary
  at its own width (iOS's grey pill, the web's outlined button), the main
  button filling the rest, on the right where the thumb rests, with room
  between them for a wet thumb (20 pt, 24 px); no confirmation. A main
  button alone fills the row (Start heating, Start again); Cancel alone
  (Cooking, Cooling) leaves the rest empty. The row is the main button's
  height in every phase, so nothing under it moves and nothing is left
  empty. Where the widest main button the cook can show (the start's,
  Rolling boil, the pull of the cooling chosen, Start again) and Cancel do
  not fit side by side, the row stacks, the main button over Cancel: on iOS
  at the accessibility text sizes and in 1750's longer words, on the web on
  a narrow screen (at 320 px with running water or the bowl). The choice is
  made on those words, never the phase's own, so it is the same in every
  phase (a change of cooling may change it), and the stack keeps both
  buttons' room in every phase. The hint holds the room of the tallest
  hint, at its foot (§9). Only "still in the water?", with its two answers
  and Cancel, and the hint's (i) opened go past the room and move what is
  below.
- **The doneness slider.** The heading reads `controls.doneness` at its start
  and the peak yolk at its end (`controls.doneness.peak`; in sous-vide the
  water, `controls.doneness.bath`), in the cook's units. The track is the
  yolk, shaded by how often each level gives the yolk it names, with the five
  doneness words at their levels and the bracket under it (§8). Then the
  texture note. While a cook runs they are its plan's, until the pull for
  the shading and the bracket.
- **The egg in cross-section and the setup sentence** (§5), the egg on the
  left so it costs the column no height of its own (`DECISIONS.md` 52), the
  sentence beside it, from the top; the open clause's panel under both.
  The egg is not drawn in sous-vide.
- **The slot**: a refusal, or a dotted level's wild guess (`warn.wildGuess`,
  §8), or the sous-vide warning, or (web) a reloaded cook's warning;
  failing those, before anything is learned, the first-egg welcome
  (`idle.welcome`). While a cook runs it says what its plan says of the
  level until the pull, a refusal first (a correction that leaves the
  white unset gets the longest time the pan can give), then a reloaded
  cook's warning. While idle, under a wild guess that a change of setup
  would make surer, the advice link goes under whichever is there (§8).
- **The questions after an egg**, at Done, end the page (below).

**The egg in cross-section** (`DECISIONS.md` 52, 91, 97 and 98). An ovoid
with a round yolk, drawn ring by ring, showing how set each layer is: the
yolk in the slider track's colours, the white from a clear, faintly blue raw
white to opaque. A picture of what the sentence and the time already say,
it has no words and a screen reader passes over it. Its readings, which the
checks read by name (the web's `data-egg`, iOS's debug log `egg aim|live|ran`):

- **the egg aimed for** (`aim`): the egg the settings on screen aim for, as
  eaten at the end of the cooling, so the yolk reads the level asked. Idle,
  always; during a cook, while a control is held and for about 1.5 s after
  the last change.
- **the live egg** (`live`): the egg in the water now, from raw at the
  start, carried forward a tick at a time and replayed from raw when the
  cook is corrected, through the cooling. At Done, **the egg as it ran**
  (`ran`), eaten, with the parameters it ran under.

**Corrections** (`DECISIONS.md` 96 to 98). After Start every clause of the
sentence, the slider and Settings' pot rows stay open, showing the cook's
own choices, never the settings. A change is a correction, "it was always
like this": the cook is planned again from its start. It is committed on release of the slider or of a − or
+ held long enough to repeat, after a 1.5-s settle for anything else (a
choice, a tap, a number typed), and at once when another control is
touched; until then the readout keeps its time, and the slider's heading
and the egg show the change. A correction that puts the pull in the past
makes it now, and rings; changed back within the 20-s grace, the pull is
cancelled. After the pull the slider only previews, and springs back to the
level the egg ran at; anything else corrects the record, planned on the
calibration before this egg. A correction also changes the settings for the
next cook.

**The start's time.** The sentence never says when the eggs went in: the
countdown already does (`DECISIONS.md` 108). While a cook runs the start
clause's panel has "Eggs in at" (`controls.startedAt`) with a − and a +, a
minute at a time, no later than now, the press of Rolling boil or the
pull, no earlier than two hours before Start. When a press goes no further
the line under it says why (`controls.startedAt.latestNow`, `.latestBoil`,
`.latestPull`, `.earliest`). Sous-vide is not offered in the panel.

**"Are the eggs still in the water?"** When the alarm's grace ran out
unanswered I assume the eggs came out, and a correction since that would
cook them longer asks (`ask.stillIn`, in the phase label's place; the time
since they were due out; `readout.sub.stillIn`). The primary button is
"Yes, still in" (`ask.stillIn.yes`): the cook is timed again as corrected,
and a pull already past rings now. Under it "No, they’re out"
(`ask.stillIn.no`): the pull stands and the correction goes to the record.
Nothing past the question is shown or rung until it is answered.

**Settings** (web `#settings`; iOS a pushed `Form`). Each row has its (i):

- Units, Metric or Imperial, and one line under Imperial in an English UI
  (`controls.units.period`).
- Altitude, with the boiling point it gives.
- Water, and the number of eggs.
- Heat after the boil: keep boiling, or heat off and lid on.
- The probe thermometer: "ask for a reading after each egg".
- Language: English or English (1750) (`LANGUAGE.md` §6).
- Alarm sound: Wind-up timer, the default, Cuckoo clock or Hen
  (`DECISIONS.md` 101). Choosing one plays it once, as it rings when the
  cooling is done; its (i) credits the hen's two recordings.
- What I've learned (`learned.literature`, `.tuned`, `.pan` or `.both`), and
  Forget, which asks first, in place (`learned.confirm.*`).
- Sharing results, with its (i): the consent always on screen
  (`share.what`), never behind the (i); the switch, off until the cook turns
  it on; how many results have gone and how many wait; the random number
  (`share.id`), whole, fixed-width and selectable, from sharing's first
  turning on until a deletion, to quote by email; Delete shared results,
  which asks first in place as Forget does; and the privacy page.
- The colophon, with its link.

In sous-vide the settings that change nothing there are put away; while a
cook runs, what I've learned and sharing are too.

**Help** (web `#help`, iOS a pushed page) is the whole story (§7), with a
contents list. `[label](https://…)` in the copy is a link; nothing else is
parsed. Reachable in every phase.

**The phases**: the phase label (the instruction), the time, one line
under it, and the action. Which key each part says is core's `phaseKeys`
(`src/core/wording.ts`, held by `fixtures/wording.json`), so the two apps
cannot disagree:

| Phase | Label | Line under the time | Hint | Action |
|---|---|---|---|---|
| Idle | `readout.phase.total` | `readout.sub.coldAssumes` / `coldGuesses` / `standing` / `hot` | `action.hint.cold` / `hotStanding` / `hotBoiling` / `whiteNeverSets` | `action.startHeating` / `eggsIn` |
| Heating | `readout.phase.heating` | `readout.sub.heating` (elapsed, expected boil) | `action.hint.heating` (with its (i)) / `heatingStanding` | `action.fullBoil` |
| Cooking | `readout.phase.cookingBoiling` / `cookingHeatOff` | `readout.sub.cookingCold` / `cookingHot` | `action.hint.cookingBoiling` / `cookingStanding` | none |
| Pull | `readout.phase.pull` | `readout.sub.pull` | `action.hint.pull`, none on the counter | the pull button, naming the cooling (`pulledKey`) |
| Cooling (ice, tap, bowl) | `readout.phase.coolingIce` / `coolingTap` / `coolingBowl` | `readout.sub.coolingPeak` / `coolingProbe` | none | none |
| Done | `readout.phase.done` | `readout.sub.doneCold` / `doneHot` | none | `action.startAgain`; the two questions, and under them the probe reading |
| Still in? | `ask.stillIn` | `readout.sub.stillIn` | none | `ask.stillIn.yes`, and `ask.stillIn.no` under it |

Cancel is under every running phase. A counter rest has no cooling phase:
the pull runs out into Done. The cooling counts down to the yolk's peak.
While the slow hob has lengthened the guess the clock counts the time
heated up, still Heating.

**The questions after an egg** (`DECISIONS.md` 92), on one panel at Done,
none required: what the cook asked for (`feedback.target`); "How was the
yolk?" with the slider's own five words as the answers, side by side
(`doneness.runny` to `doneness.hard`: one row on a phone at the default
text size, three over two at larger text, fewer a row at the largest,
never a word cut); "And the white next to the yolk?" with Runny / Tender /
Firm, breaking the same way; each row a group named by its question for a
screen reader; and under them, whenever the cooling ended at the yolk's
peak, "Do you have a probe thermometer?" with how to take the reading and
the field, a reading no kitchen could have made refused with the range it
should be in (`probe.refused`). The probe is not offered while the egg
cooks; the setting in Settings still has the alarm and the line under the
cooling countdown ask for the reading. The room temperature is in Settings
with or without it, and beside "at room temperature" (§5).

## 4. The (i) component

- **Keys.** `K.more` beside `K` in `copy/en.json`, on the surface `more`,
  whose budget is paragraph-sized. Where the label does not read inside "About
  {label}", `K.info` is the (i)'s whole name (`readout.sub.coldAssumes.info`,
  `action.hint.heating.info`, `outcome.info`).
- **One look and one behaviour everywhere**: a circled *i* at the end of the
  line it belongs to, which opens a paragraph in place under that line, with
  a rule down its left. No modal, no popover, no triangles or chevrons. The
  *i* is filled while open. A screen reader hears it as a button named
  "About {label}" (`more.about`), Expanded or Collapsed (`more.expanded`,
  `more.collapsed`).
- **Which controls have one**: only where the meaning does not fit in the
  label; the `.more` keys in `copy/en.json` are the list. The certainty line
  under the time opens in place the same way, from its words rather than an
  (i) (§8).
- **Short enough to read standing at the hob.** What depends on the setup, or
  runs longer than one control's meaning, goes to Help.

## 5. The setup sentence

`setup.sentence`, "{egg} {from}, {start}, {cooling}.", where each placeholder
is a clause the cook can tap; sous-vide is `setup.sentenceSousVide`, "{egg},
{start}.", because where the egg comes from and how it cools change nothing
there.

- **Each fragment carries its own preposition and article** ("from the
  fridge", "then an ice bath"), so the template is only punctuation in
  English and a translation may reorder it. The egg clause counts the eggs
  ("2 × 68 g eggs", "One 68 g egg"), so English never picks "a" or "an"
  before a number by its sound.
- **A clause opens its choice in a panel** under the sentence, one at a time,
  with its title, its (i) and Done (`setup.close`). The sentence rewrites
  itself as the answer changes. The panels: the egg (the size menu, and the
  mass - the web also takes girth or width - and the number of eggs), where
  it came from (fridge, room or custom, with the presets' temperatures, and
  with Room the room temperature, optional and greyed at the 20 °C assumed),
  the start (cold water, boiling water or sous-vide), and the cooling.
- **The cooling's four choices are a list**, one to a line, fastest first:
  Ice bath, Running water, Bowl of water, Air (`DECISIONS.md` 115). Four
  names of up to 13 letters fit no 390 px phone as segments, least of all
  at the accessibility text sizes, where a row of the list wraps its name
  instead. Under the list, with its own choice: a bowl's Water in the bowl
  (2 L to start), and for running water or a bowl the Water temperature,
  optional, greyed at the one assumed (mains water's 15 °C, the room's for
  a bowl), each with its (i). The sentence names the bowl and its water,
  and the water's temperature only when the cook gave it.
- **To a screen reader** each clause is a button named "{label}: {value},
  change" (`setup.clause`), expanded or collapsed. The web returns focus to
  the clause after Done. On the web a clause is a span that is a button
  (`role`, `tabindex`, Enter and Space), since a `<button>` is drawn as an
  inline block, and beside the egg a clause that wrapped would push the
  comma after it to the end of its last line.
- **While a cook runs** the sentence is the cook's own choices, and stays
  tappable: a choice corrects the cook (§3). The start clause says what it
  said at idle ("into cold water, brought to the boil"), never the time;
  its panel says when the eggs went in, and corrects it.
- **Heat after the boil is not a clause.** It is a habit of a kitchen, tied
  to the water, and a fifth clause pushes the sentence onto a third line at
  390 px. The readout's line says "lid on" when it is set.

## 6. How wording is reviewed

In place, on a phone (`DECISIONS.md` 25): a wording change goes into both
apps, the owner uses it and says what to put back. What he has yet to read
is the review queue, which `npm run copy:review` lays out as one page beside
the apps (`LANGUAGE.md` §3, `DECISIONS.md` 106).

## 7. Two tiers: the (i), and Help

The owner's steer (`DECISIONS.md` 26):

- **The (i) is for one control's meaning** (§4).
- **Help is for the whole story, opened on purpose.** A page of its own, with
  a Back button: under its title the motto ("Time eggs, not minutes."),
  then how I work, what I learn and from what, getting reliable eggs
  by method, how sure I am, where I'm unsure, and sources; last, a link to
  the privacy page (`privacy/index.html`, which the iOS app opens in
  Safari), and under it "Made by Dan MacKinlay", the name linking the
  owner's blog. Anything that depends on the setup, or is longer than one
  control's meaning, goes there. The advice link (§8) is a link into it,
  not a disclosure.
- **Never narrate what the interface just visibly did.** The cook can see
  controls go away and come back.

## 8. The prediction under the time

**How sure I am** (`DECISIONS.md` 93 and 97). Below the time display, one
of three words from core's `certaintyAt` at the time on screen
(`src/core/certainty.ts`, `INFERENCE.md` §8, "How sure, in words"), carried
by `decideAnswer` while idle and by the running cook's plan after:
`certaintyKey` (`src/core/wording.ts`, `fixtures/wording.json`).

| class | when | key | words |
|---|---|---|---|
| very certain | 9 times in 10 the word asked | `certainty.veryCertain` | Very certain |
| a ballpark | 9 times in 10 that word or a neighbour | `certainty.ballpark` | A ballpark figure |
| a wild guess | less sure | `certainty.wildGuess` | A wild guess |

The words are a button, underlined in the accent (dotted closed, solid
open), that opens in place under it, as an (i) does: the 90% interval
in the slider's words (`certainty.interval`, `.interval.one`: "9 times in 10:
Runny to Fudgy."), "Most likely: Jammy." (`certainty.mostLikely`) unless it
is already under the line or the interval is that one word
(`mostLikelyOpened`), the likely time range (`certainty.time`, m:ss as the
clock shows it) and a link to Help's "How sure I am" (`certainty.help`).
"Most likely" also shows under the line, unpressed, whenever it is not the
word asked (`mostLikelyShown`). A screen reader hears the line as a button,
Expanded or Collapsed. While a cook runs the line is the plan's, held while
a new pot's surface builds, until the pull: then the time it was about has
passed. No odds are shown or spoken anywhere.

**The white's line**, `outcome.whiteRunny`, in the warning colour, shows from
P(runny) 0.2 (`WHITE_RISK`), one egg in five. That is where it speaks at the
white-bound ends: the softest levels on a fresh install, the counter's
softest, a cold start's soft. It is not lower because a fresh install at
soft reads 0.17 on the reference pot, and that is the prior's width.

**The bracket** is the certainty line's 90% interval, drawn (core's
`wordBracket`; `DECISIONS.md` 97: one interval for the words and
the bracket). Each of the five words has a band on the slider, the levels
whose nearest word it is, between the midpoints with its neighbours (0,
0.11, 0.315, 0.515, 0.81, 1), where the slider's own word changes. The
bracket runs from the outer edge of the interval's first word's band to
the outer edge of its last's, so it always lies inside the track. Its
bottom line is twice as thick over the most likely word's whole band
(`wordBandLow`, `wordBandHigh`), always one of the interval's words, so the
heavy stretch never runs past the bracket's ends: "9 times in 10: Runny to
Fudgy." is drawn from 0 to 0.81, heavy from 0.315 to 0.515 where Jammy is
the most likely; "9 times in 10: Fudgy." from 0.515 to 0.81, heavy
throughout. A band, not a mark at the word's anchor, because the thumb
moves continuously and the anchor does not (`DECISIONS.md` 114): the thumb
sits inside the heavy stretch whenever the most likely word is the word
asked, and away from it, honestly, when it is not ("Most likely" then
shows under the certainty line). It is whole words wide, and moves a word
at a time. In the foreground colour at 70%: not the accent, not the yolk,
and below the track, so it never covers the shading. A screen reader hears
the same words, "Likely yolk: Runny to Fudgy" (`outcome.range`,
`.range.one`; the words stand alone after a colon, `LANGUAGE.md` §5), and
not the band: the certainty line's press says "Most likely". It is not
drawn before the pot's surface lands, where the white never sets, in
sous-vide, or once the egg is pulled; its room is kept, so nothing under it
moves. While a cook runs it is its plan's, held as the line is. It is not
clamped to what the pan delivers: on a counter rest its soft end can lie
over the stripes, since a cook can still call that egg Soft.

The slider never rests on the stripes: asked for less than the pan can
deliver, it moves to the softest level the pan delivers, which the time and
the bracket are for (`test/reachAnswer.test.ts` 10). It does rest on the dots
(`DECISIONS.md` 83): there the time, the certainty line and the bracket are
for the level asked, and the warning line says `warn.wildGuess`, "Soft: a
wild guess so far." (the word is the thumb's level). A refusal worth saying
takes the line instead, as the slider moves out of the stripes; the next
answer there carries the warning, the advice link under it. After a runny
white or a yolk too soft, the time at a dotted level leans late, but never
past a firmer level's (`DECISIONS.md` 84): the time never rises as the
thumb moves softer, and where the white binds the soft end takes the time
of the first firmer level whose own choice is sooner
(`test/reachAnswer.test.ts` 11). "Most likely" and the bracket say where that puts the yolk.

**The track is a yolk** (`DECISIONS.md` 31): deep orange at runny, golden at
jammy, pale yellow at hard, deeper in the light scheme. Its opacity is the
chance of the word asked at each level, over the best level's
(`shadingOf`), so a fresh install, never very certain, still shows where
the pan works. The word asked changes at the cuts between words, and a
level on a cut is half one word and half the next, so the shading dips
there and is strongest at each word's middle. Colour alone is a level
surer than a wild guess; dots mark levels the pan delivers but that are a
wild guess so far, softer or firmer than every level that is not
(`lowOddsAt`), which can be chosen and are warned of; stripes mark what the
pan cannot deliver, which cannot. No dots before the first egg that taught
something, nor when every level is a wild guess. A tick word is struck
through, in both apps, only when every position it names is under the
stripes (`anchorReachable`): after a runny white the floor moves to about
0.05-0.09, which is still Runny, so Runny stays. The strip is bare before
the first answer and in sous-vide.

**The advice** (`src/core/reach.ts`, "when to advise"). "How to make this
more reliable →" (`advice.toggle`) shows under the warning slot while idle
when the word asked is a wild guess at the time on screen and a change of
setup the model can price makes it surer: ice for a counter rest, twice the
water with the heat off, each priced on its own pot's odds profile, and
kept when it raises the chance of the word asked at the level by a
twentieth (`ADVICE_GAIN`) or more. The link waits for those profiles, so it
can come a moment after the time. It opens Help at "Getting reliable eggs",
whose "For your current settings" lists those changes and, under any wild
guess, the two the model cannot price (the fridge, the scale), which never
bring the link on their own. A fresh install never gets it: its wild
guesses are the prior's width, which no setup narrows. One egg called
runny on a counter rest does: ice raises the word asked from 0.10 to 0.38
at the soft end (`test/reach.test.ts` 9).

**Nothing jumps.** While idle the certainty line keeps two lines' room, the
word and "Most likely", with the word at its top, so a drag that brings
"Most likely" or takes it away moves neither the word nor the slider. On
iOS at the accessibility text sizes either wraps (more in 1750's face), so
from idle to the pull the room is also the tallest the line can take there:
the tallest of the three words over the tallest of the five "Most
likely"s, laid out hidden at the line's width and text size. At the default
size that is no more than two lines; at the largest it costs empty room
under a lone word, and holds the slider still (`npm run ios:e2e`'s
`likely-still` and `likely-still-largest`). While a new pot's surface is on
its way, the readout keeps its last height. The time can move once more
when the pot's odds profile lands after the surface, where it holds a soft
level's time under a firmer one's. The white's line can still appear
mid-drag near the soft end.

**The time's two lines sit close** (`DECISIONS.md` 99). Under the digits,
the boil line ("about 8:00 to boil", or the running phase's line) and then
the certainty word are two lines, so the word is never read as the boil
time's and its press target does not move when the boil line wraps, but
with no gap between them. The clock gives back the room under its
baseline, which digits never use, so the boil line starts about 10 px (10
pt) under the digits' baseline, the word's press target directly under the
boil line. The clock keeps its size at every text size.

**The folded word sits an x-height closer to the panel's foot.** The
certainty line's second line of room hangs the word's x-height (about 8 px,
8 pt, fixed at every text size, as the panel's padding is) into the
readout's bottom padding, so a folded word has no more empty room below it
than it needs; what the word opens, and the white's line, take it back, so
the open readout keeps its height. "Most likely" still fits in the room.

**The slider** is described by the bracket too (web
`aria-describedby="donenessRange"`). Its value to a screen reader is
`controls.doneness.value` (or `.valueBath`), and the heading's number is
hidden from it so it is not read twice. A level sits exactly under the
thumb that asks for it. On iOS it keeps VoiceOver's adjustable behaviour (a
swipe moves a tenth of the range, on the 0.01 grid) and ticks a selection
haptic each time a drag crosses into another doneness word. A snap that
lands while the finger is down moves the thumb when the finger lifts; the
web's thumb moves at once.

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
- **The − and +.** The web draws its own pair; iOS uses the system's
  `Stepper`, one adjustable element to VoiceOver.
- **The open clause** has a solid accent fill on the web and an accent wash on
  iOS, where a link's text takes the tint. VoiceOver focus does not return to
  the clause after Done on iOS.
- **The one screen on iOS** is the web's, but:
  - *"Another control touched"* is what iOS can see: a finger down on the
    slider or on a − or +, a clause pressed, a button that moves the cook
    on, or a change landing from another control. A segmented choice or a
    menu reports no touch of its own, only its change, so a change in hand
    from another control is committed when that change lands, without it
    (the web commits it with it).
  - *The controls are the planner's own*, set to the cook's choices at a
    relaunch; a correction writes only the settings it changed, as the web
    does, and nothing else can write them while a cook runs.
  - *While "still in the water?" is open* the Lock Screen card shows the
    pull, "now", with the pull's line naming the cooling, not a cooling's
    countdown that may not be running; no alarm is pending. VoiceOver reads
    the question, the time and the line as shown: iOS speaks no `spoken.*`
    key, so `spoken.stillIn` stays the web's.
  - *At the accessibility text sizes* the egg is drawn smaller (84 by 109 pt)
    so the sentence keeps a column, and the slider's five words stop
    growing at the largest standard size, since each sits under its level.
  - *Settings* is the navigation bar's in every phase; the pull pops it, and
    Help, back to the egg's page.
- **The action's row** is chosen on the same words in both: the start's
  action, Rolling boil, the pull of the cooling chosen and Start again,
  from the cook's own choices. iOS lays the row and the stack out hidden at
  those words, and takes the row where it fits (`mainShape`). The web
  writes them from its view (`sizerWords`) into hidden sizers that CSS
  lays out: the main button's cell holds them at no height, so the row
  wraps in every phase or in none, and a hidden row holds the stack's
  height. The web's hint room is two lines or the (i), so a longer hint
  (at a large browser text size) grows it; iOS lays the tallest hints out
  hidden (idle's with the widest time, Heating's with its (i), Cooking's
  with the alarm's line, which the web has not). In both the block is in
  the column, scrolled with it, never stuck to the screen.
- **The Lock Screen and Dynamic Island** are iOS's alone: the pull names the
  cooling, word for word as the alarm does, the card ends when the cooling
  does, and it carries no odds (`DECISIONS.md` 32, 33).

## 10. Screenshots and checks

A debug iOS build takes launch arguments (`-uiScreen`, `-uiDo`,
`-noAlarmPrompt` and others), so screens can be reached without a tap; the
header of `ios/EggTimerCore/Sources/EggTimerApp/Screenshots.swift` lists
them. The web's states are driven by `npm run copy:snapshot`
(`tools/copySnapshot.ts`).

What the cook sees on the reference setup (68 g, fridge, cold start, ice,
jammy):

| Log | Certainty line | Bracket |
|---|---|---|
| Fresh install | A wild guess at runny to jammy, a ballpark at fudgy and hard; 9 times in 10: Runny to Fudgy | Runny to Fudgy |
| Four eggs called jammy | A ballpark figure at jammy; Very certain at fudgy and hard | about a word wide |
| One egg called hard (into boiling water) | A wild guess at soft, dotted, with the warning; Most likely: Jammy | wide |

What has not been seen on a phone is in `PLAN.md`'s QA list.
