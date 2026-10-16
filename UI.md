# UI.md — fewer controls, room for sentences

The layout both apps share, and why it is so. Where the two apps differ, §9
says how and why. Every word is a key in `copy/en.json`, named here only
where the key is the point, because the wording moves faster than the layout
(`LANGUAGE.md` §3). Which key each phase says is core's (`phaseKeys`,
`certaintyKey`, `src/core/wording.ts`), so the two apps cannot disagree.

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
- **Every number has a − and a +** beside it, which steps it on its grid
  (`src/core/units.ts`) and repeats while held; the number stays typeable.
  The pair is as tall as the field, so no row grows.
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
to bottom, in every phase:

- Settings and Help at the top, in every phase. While a cook runs,
  Settings' pot rows correct it as the sentence does; what I have learned
  and sharing wait for it to end.
- **The readout**: the phase label (idle, the total time; while a cook runs,
  the instruction), the time, and one line under it (while idle, the method;
  with the heat off it says the lid is on, so the time is never read without
  it). The clock is the same size in every phase. While sharing is on, a
  small **Learning** mark sits in the panel's corner with its (i)
  (`DECISIONS.md` 58): the time may be nudged a few seconds. Never in
  sous-vide.
- **How sure I am**: a line of words the cook presses, and the runny-white
  line when it applies (§8). It keeps its room in every phase; it goes at
  the pull, when the time it was about has passed.
- The hint, then **the action**, directly under the time it runs
  (`DECISIONS.md` 125). The buttons are **one row**: while a cook runs,
  Cancel on the left, small and plainly secondary, the main button filling
  the rest, on the right where the thumb rests, with room between them for a
  wet thumb; no confirmation. The row is the main button's height in every
  phase, so nothing under it moves and nothing is left empty. Where the
  widest main button the cook can show and Cancel do not fit side by side,
  the row stacks, the main button over Cancel. The choice is made on those
  words, never the phase's own, so it is the same in every phase, and the
  stack keeps both buttons' room in every phase. The hint holds the room of
  the tallest hint. Only "still in the water?" and an opened hint's (i) go
  past the room and move what is below.
- **The doneness slider.** The heading names the doneness at its start and
  the peak yolk at its end (in sous-vide, the water), in the cook's units.
  The track is the yolk, shaded by how often each level gives the yolk it
  names, with the five doneness words at their levels and the bracket under
  it (§8). Then the texture note. While a cook runs they are its plan's,
  until the pull for the shading and the bracket.
- **The egg in cross-section and the setup sentence** (§5), the egg on the
  left so it costs the column no height of its own (`DECISIONS.md` 52), the
  sentence beside it; the open clause's panel under both. The egg is not
  drawn in sous-vide.
- **The slot**: a refusal, or a dotted level's wild guess (§8), or the
  sous-vide warning, or (web) a reloaded cook's warning; failing those,
  before anything is learned, the first-egg welcome. While a cook runs it
  says what its plan says of the level until the pull. While idle, under a
  wild guess that a change of setup would make surer, the advice link goes
  under whichever is there (§8).
- **The questions after an egg**, at Done, end the page (below).

**The egg in cross-section** (`DECISIONS.md` 52, 91, 97 and 98). An ovoid
with a round yolk, drawn ring by ring, showing how set each layer is: the
yolk in the slider track's colours, the white from a clear, faintly blue raw
white to opaque. A picture of what the sentence and the time already say,
it has no words and a screen reader passes over it. Idle, and while a
control is held during a cook and for a moment after, it is the egg the
settings aim for, as eaten at the end of the cooling; otherwise the egg in
the water now, through the cooling; at Done, the egg as it ran.

**Corrections** (`DECISIONS.md` 96 to 98). After Start every clause of the
sentence, the slider and Settings' pot rows stay open, showing the cook's
own choices, never the settings. A change is a correction, "it was always
like this": the cook is planned again from its start. It is committed once
the cook has let go of the control, or touched another; until then the
readout keeps its time, and the slider's heading and the egg show the
change. A correction that puts the pull in the past makes it now, and rings;
changed back within the grace, the pull is cancelled. After the pull the
slider only previews, and springs back to the level the egg ran at;
anything else corrects the record, planned on the calibration before this
egg. A correction also changes the settings for the next cook.

**The start's time.** The sentence never says when the eggs went in: the
countdown already does (`DECISIONS.md` 108). While a cook runs the start
clause's panel has "Eggs in at" with a − and a +, a minute at a time, and
says why when a press goes no further. Sous-vide is not offered in the
panel.

**"Are the eggs still in the water?"** When the alarm's grace ran out
unanswered I assume the eggs came out, and a correction since that would
cook them longer asks, in the phase label's place. "Yes, still in" times the
cook again as corrected, and a pull already past rings now; "No, they’re
out" keeps the pull and sends the correction to the record. Nothing past
the question is shown or rung until it is answered.

**Settings** holds the kitchen (§2), each row with its (i); the consent for
sharing is always on screen, never behind the (i). In sous-vide the settings
that change nothing there are put away; while a cook runs, what I've learned
and sharing are too.

**Help** is the whole story (§7), reachable in every phase.

**The phases.** A counter rest has no cooling phase: the pull runs out into
Done. The cooling counts down to the yolk's peak. While the slow hob has
lengthened the guess the clock counts the time heated up, still Heating.

**The questions after an egg** (`DECISIONS.md` 92), on one panel at Done,
none required: what the cook asked for; how the yolk was, with the slider's
own five words as the answers; and the white next to the yolk, Runny /
Tender / Firm. Each row of answers wraps rather than cut a word. Under
them, whenever the cooling ended at the yolk's peak, the probe reading,
with how to take it. The probe is not offered while the egg cooks.

## 4. The (i) component

- **Keys.** `K.more` beside `K` in `copy/en.json`; `K.info` is the (i)'s
  whole name where the label does not read inside "About {label}".
- **One look and one behaviour everywhere**: a circled *i* at the end of the
  line it belongs to, which opens a paragraph in place under that line, with
  a rule down its left. No modal, no popover, no triangles or chevrons. The
  *i* is filled while open. A screen reader hears it as a button named
  "About {label}", Expanded or Collapsed.
- **Which controls have one**: only where the meaning does not fit in the
  label. The certainty line under the time opens in place the same way, from
  its words rather than an (i) (§8).
- **Short enough to read standing at the hob.** What depends on the setup, or
  runs longer than one control's meaning, goes to Help.

## 5. The setup sentence

One sentence of clauses the cook can tap: the egg, where it came from, the
start and the cooling. In sous-vide, where the egg comes from and how it
cools change nothing, so the sentence leaves them out.

- **Each fragment carries its own preposition and article** ("from the
  fridge", "then an ice bath"), so the template is only punctuation in
  English and a translation may reorder it. The egg clause counts the eggs
  ("2 × 68 g eggs", "One 68 g egg"), so English never picks "a" or "an"
  before a number by its sound.
- **A clause opens its choice in a panel** under the sentence, one at a time,
  with its title, its (i) and Done. The sentence rewrites itself as the
  answer changes.
- **The cooling's four choices are a list**, one to a line, fastest first
  (`DECISIONS.md` 115). Four names of up to 13 letters fit no 390 px phone
  as segments, least of all at the accessibility text sizes, where a row of
  the list wraps its name instead. A bowl's water, and the water's
  temperature for running water or a bowl, are under the list; the
  temperature is optional, greyed at the one assumed. The sentence names
  the water's temperature only when the cook gave it.
- **To a screen reader** each clause is a button named for its label and
  value, expanded or collapsed.
- **While a cook runs** the sentence is the cook's own choices, and stays
  tappable: a choice corrects the cook (§3). The start clause says what it
  said at idle, never the time; its panel says when the eggs went in, and
  corrects it.
- **Heat after the boil is not a clause.** It is a habit of a kitchen, tied
  to the water, and a fifth clause pushes the sentence onto a third line at
  390 px. The readout's line says "lid on" when it is set.

## 6. How wording is reviewed

In place, on a phone (`DECISIONS.md` 25): a wording change goes into both
apps, the owner uses it and says what to put back. What he has yet to read,
the words changed since he last approved them, `npm run copy:review` lays
out as one page beside the apps (`LANGUAGE.md` §3, `DECISIONS.md` 106).

## 7. Two tiers: the (i), and Help

The owner's steer (`DECISIONS.md` 26):

- **The (i) is for one control's meaning** (§4).
- **Help is for the whole story, opened on purpose.** A page of its own, with
  a Back button. Anything that depends on the setup, or is longer than one
  control's meaning, goes there. The advice link (§8) is a link into it,
  not a disclosure.
- **Never narrate what the interface just visibly did.** The cook can see
  controls go away and come back.

## 8. The prediction under the time

**How sure I am** (`DECISIONS.md` 93 and 97). Below the time, one of three
words for the time on screen (`INFERENCE.md` §8, "How sure, in words"):
very certain (9 times in 10 the word asked), a ballpark (9 times in 10 that
word or a neighbour), or a wild guess. The words are a button that opens in
place under it, as an (i) does: the 90% interval in the slider's words, the
most likely word, the likely time range, and a link to Help. The most likely
word also shows under the line, unpressed, whenever it is not the word
asked. While a cook runs the line is the plan's, held while a new pot's
surface builds, until the pull. No odds are shown or spoken anywhere.

**The white's line** shows from one egg in five runny (`WHITE_RISK`). It is
not lower because a fresh install at soft reads 0.17 on the reference pot,
and that is the prior's width.

**The bracket** is the certainty line's 90% interval, drawn (`DECISIONS.md`
97: one interval for the words and the bracket). It runs over the bands of
the interval's words, so it always lies inside the track, whole words wide,
and moves a word at a time. Its bottom line is twice as thick over the most
likely word's band. A band, not a mark at the word's anchor, because the
thumb moves continuously and the anchor does not (`DECISIONS.md` 114): the
thumb sits inside the heavy stretch whenever the most likely word is the
word asked, and away from it, honestly, when it is not. In the foreground
colour, not the accent nor the yolk, and below the track, so it never covers
the shading. A screen reader hears the same words, and not the band. It is
not drawn before the pot's surface lands, where the white never sets, in
sous-vide, or once the egg is pulled; its room is kept, so nothing under it
moves. It is not clamped to what the pan delivers: on a counter rest its
soft end can lie over the stripes, since a cook can still call that egg
Soft.

**The slider never rests on the stripes**: asked for less than the pan can
deliver, it moves to the softest level the pan delivers. It does rest on the
dots (`DECISIONS.md` 83): there the time, the certainty line and the bracket
are for the level asked, and the slot says it is a wild guess so far. After
a runny white or a yolk too soft, the time at a dotted level leans late, but
never past a firmer level's (`DECISIONS.md` 84): the time never rises as the
thumb moves softer.

**The track is a yolk** (`DECISIONS.md` 31): deep orange at runny, golden at
jammy, pale yellow at hard. Its opacity is the chance of the word asked at
each level, over the best level's, so a fresh install, never very certain,
still shows where the pan works; it dips at the cuts between words, where a
level is half one word and half the next. Dots mark levels the pan delivers
but that are a wild guess so far, which can be chosen and are warned of;
stripes mark what the pan cannot deliver, which cannot. No dots before the
first egg that taught something, nor when every level is a wild guess. A
tick word is struck through only when every position it names is under the
stripes. The strip is bare before the first answer and in sous-vide.

**The advice** (`src/core/reach.ts`, "when to advise"). A link under the
slot while idle, when the word asked is a wild guess and a change of setup
the model can price makes it surer by enough. It opens Help at "Getting
reliable eggs", which lists those changes and, under any wild guess, the two
the model cannot price (the fridge, the scale), which never bring the link
on their own. A fresh install never gets it: its wild guesses are the
prior's width, which no setup narrows.

**Nothing jumps.** While idle the certainty line keeps the room of the word
and the most likely word, with the word at its top, so a drag that brings
the second line or takes it away moves neither the word nor the slider.
Where either wraps (iOS at the accessibility text sizes, more in 1750's
face), the room is the tallest the line can take there, laid out hidden;
at the largest that costs empty room under a lone word, and holds the slider
still. While a new pot's surface is on its way, the readout keeps its last
height. The white's line can still appear mid-drag near the soft end.

**The time's two lines sit close** (`DECISIONS.md` 99). Under the digits,
the boil line and then the certainty word, with no gap between them: the
word is never read as the boil time's, and its press target does not move
when the boil line wraps. The clock keeps its size at every text size, and a
folded word has no more empty room below it than it needs.

**The slider** is described by the bracket too, and the heading's number is
hidden from a screen reader so it is not read twice. A level sits exactly
under the thumb that asks for it.

## 9. Where the apps differ

- **Measuring the egg.** The web also takes girth or width; iOS is weighed
  only, so its record never says the mass came from a tape.
- **Mute, and the reloaded cook.** The web plays its own sound, so it has
  mute; it can lose a cook to a reload, so it says so when it does. iOS has
  neither: its alarm is the system's, with iOS's own status line above
  Cancel.
- **The units' (i)** says "phone" on iOS where the web says "browser".
- **The − and +.** The web draws its own pair; iOS uses the system's
  `Stepper`, one adjustable element to VoiceOver.
- **The open clause** has a solid accent fill on the web and an accent wash on
  iOS, where a link's text takes the tint. VoiceOver focus does not return to
  the clause after Done on iOS; the web's focus does.
- **The slider on iOS** keeps VoiceOver's adjustable behaviour and ticks a
  selection haptic each time a drag crosses into another doneness word. A
  snap that lands while the finger is down moves the thumb when the finger
  lifts; the web's thumb moves at once.
- **The one screen on iOS** is the web's, but:
  - *"Another control touched"* is what iOS can see: a finger down on the
    slider or on a − or +, a clause pressed, a button that moves the cook
    on, or a change landing from another control. A segmented choice or a
    menu reports no touch of its own, only its change, so a change in hand
    from another control is committed when that change lands, without it
    (the web commits it with it).
  - *While "still in the water?" is open* the Lock Screen card shows the
    pull, "now", with the pull's line naming the cooling, not a cooling's
    countdown that may not be running; no alarm is pending.
  - *At the accessibility text sizes* the egg is drawn smaller so the
    sentence keeps a column, and the slider's five words stop growing at the
    largest standard size, since each sits under its level.
  - *Settings* is the navigation bar's in every phase; the pull pops it, and
    Help, back to the egg's page.
- **The action's row** is chosen on the same words in both: the start's
  action, Rolling boil, the pull of the cooling chosen and Start again,
  from the cook's own choices. iOS lays them out hidden and takes the row
  where it fits; the web lets CSS lay them out in hidden sizers, so the row
  wraps in every phase or in none. In both the block is in the column,
  scrolled with it, never stuck to the screen.
- **The Lock Screen and Dynamic Island** are iOS's alone: the pull names the
  cooling, word for word as the alarm does, the card ends when the cooling
  does, and it carries no odds (`DECISIONS.md` 32, 33).

## 10. What the cook sees

On the reference setup (68 g, fridge, cold start, ice, jammy):

| Log | Certainty line | Bracket |
|---|---|---|
| Fresh install | A wild guess at runny to jammy, a ballpark at fudgy and hard; 9 times in 10: Runny to Fudgy | Runny to Fudgy |
| Four eggs called jammy | A ballpark figure at jammy; Very certain at fudgy and hard | about a word wide |
| One egg called hard (into boiling water) | A wild guess at soft, dotted, with the warning; Most likely: Jammy | wide |

What has not been seen on a phone is in `PLAN.md`'s QA list.
