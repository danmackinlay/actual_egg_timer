/**
 * The `plain` draft: a style pass over both apps' words, applied as one draft
 * on `73ea0f8` (3 October 2026). The owner found that much of the copy read
 * as machine-written, and gave one rewrite as the model, `help.how.p2`:
 * "The cooling time also counts as cooking time, since the egg is still warm
 * inside." Every row follows it. The point is said once, literally, in plain
 * sentences. A reason comes with "because" or "since", not a colon. There is
 * no dash pivot, no pair of clauses joined by a semicolon, no "X, not Y" for
 * effect, no list of three for its rhythm, no wry closing line, and no pet
 * word repeated ("predictable", "teaches me", "soonest"). An aside that
 * another string already says is cut: `help.how.p2` drops the ice and the
 * counter, which the Cooling (i) has.
 *
 * The owner approved the strings LANGUAGE.md section 3 held as "good enough
 * for now", not as final (3 October), so they are read like the rest:
 * `idle.welcome` and `alarm.cooled.body` change; the `alarm.pull.*` bodies
 * and `activity.note.estimate` already say what to do plainly and stay.
 *
 * Left as they are, on purpose:
 * - the motto, the owner's own;
 * - "Full rolling boil" as the button's name, and the warning against the
 *   first bubbles (CLAUDE.md invariant 6), reworded but kept everywhere;
 * - a colon before an inserted word ("Softest possible: {limit}"), which is
 *   LANGUAGE.md section 5's rule and not a style;
 * - the dash in the size labels ("Large — 68 g"), a separator between a
 *   name and a mass, not a pivot in a sentence;
 * - "counter", "cold tap" and "pan", which wait on the owner's choice of
 *   base English (American, British or Australian), and on whether "tap"
 *   should keep meaning both the water and the screen;
 * - `spoken.total`, for tidy2's reason.
 *
 * Checked for truth against the code, where a row says more or less than it
 * did:
 * - `readout.sub.standing` is now an instruction, "measure out {water} of
 *   water, and keep the lid on": the heat-off time is computed for exactly
 *   that water, which is what "for {water} of water … measure it" meant.
 * - `action.hint.heating.more` gives the consequence of an early tap: the
 *   model takes the boil as earlier than it was, counts the eggs as longer at
 *   100 °C, and ends the cook early, so the eggs are underdone.
 * - `controls.eggsInPan.more` gives the consequence, longer to cook, in place
 *   of the water's return to the boil; with the heat off the water never
 *   returns, and the eggs still take longer.
 * - `controls.start.more` says sous-vide takes many hours, so plan ahead, in
 *   place of "usually a while ago": the start shown is for eating now, and
 *   `sousvide.warn` already says most of a day at 58 °C.
 * - `learned.pan` drops "based on history": it stands under "What I've
 *   learned".
 * - `colophon.tail` follows the link "The code and the science", so it reads
 *   "The code and the science are open for anyone to check."
 *
 * The 1750 twins (copy/en-x-1750.json) were each read again with their key.
 * Where only the modern style changed, the twin already says the same thing
 * in its own register and stands; its semicolons and its stately asides are
 * the joke, not the fault. Where the meaning moved, the twin is rewritten,
 * before -> after:
 *   help.how.p2: The cooling is likewise to be counted. An egg taken from the water continues some minutes to cook from within; iced water stops it soonest, and the table scarcely retards it.
 *     -> The time of cooling is to be reckoned as time of cooking, since the egg is yet warm within.
 *   idle.welcome: This is our first egg together. I begin by reasoning from eggs in general; but as you tell me how each one came out, I learn to reason from yours.
 *     -> I begin with the times of an ordinary egg; and as you tell me how each one came out, I fit them to your eggs, and to your taste.
 *   learned.pan: {water} of water is about {time} in boiling, as experience shews
 *     -> {water} of water is about {time} in boiling
 *   spoken.done: Now eat.
 *     -> The eggs are ready.
 *   controls.start.more: Boiling water: lower the eggs into water at a full boil; they peel more easily. Cold water: the eggs in a cold pan, the fire lit, and tap It boils in earnest when the water rolls; the waiting for the boil included, they are done sooner. Sous-vide: I shall tell you when you ought to have begun, which is commonly some while ago.
 *     -> Boiling water: lower the eggs into water at a full boil; they peel more easily. Cold water: the eggs in a cold pan, the fire lit, and tap It boils in earnest when the water rolls; the waiting for the boil included, they are done sooner. Sous-vide: I shall tell you how long the eggs require in the water. It is commonly many hours, so provide accordingly.
 *   controls.eggFrom.more: Eggs from the fridge are the most certain. A fridge is much the same from day to day and a room is not, and every degree moves the time a little.
 *     -> Eggs from the fridge give the most certain times, because a fridge is much the same from day to day, and a room is not.
 *   controls.eggsInPan.more: Cold eggs cool boiling water as they enter, and more eggs cool it more; so it is longer in returning to the boil, or, with the fire out, never returns. For eggs begun in cold water I have no need of it: your tap when the water boils already reckons them.
 *     -> The more cold eggs you put in, the more they cool the water, and the longer they are in cooking. For eggs begun in cold water I have no need of it, for your tap when the water boils already reckons them.
 *   controls.water.more: The quantity of water, the eggs not reckoned. It signifies most with the fire out, when the water's own heat cooks the eggs: more water stays hot longer. With the fire lit it signifies a little. I remember besides how long each quantity takes to boil; it is therefore worth measuring.
 *     -> The quantity of water, the eggs not reckoned. It signifies most with the fire out, for then the hot water alone cooks the eggs. With the fire lit it signifies less. I remember besides how long each quantity takes to boil; it is therefore worth measuring.
 *   action.hint.heating.more: Tap It boils in earnest when the whole surface heaves, and is not to be calmed by stirring; not at the first bubbles. I time the rest of the cook from your tap: a few seconds either way are of no moment, but a minute early is an errour. Until you tap, the countdown is but my conjecture.
 *     -> Tap It boils in earnest when the whole surface heaves, and is not to be calmed by stirring; not at the first bubbles. I time the rest of the cook from your tap, and a tap a minute too early will leave the eggs under-done. Until you tap, the countdown is but my conjecture.
 *   learned.forget.more: I forget every egg you have told me of and every boil you have timed, and begin again from eggs in general. A wrong answer or two a few eggs more will wash out; this is for a new stove, a new kitchen, or a new beginning.
 *     -> I forget every egg you have told me of and every boil you have timed, and begin again from eggs in general. A wrong answer or two a few eggs more will wash out; you need this only for a new stove, or a new kitchen.
 *   colophon.tail: — my errours included.
 *     -> are open to the inspection of any reader.
 */

import type { Draft, Drafted } from '../copyDraft.js';

const PLAIN_DRAFT: Drafted[] = [
  // First: readout.sub.coldAssumes's old wording, "about {boil} to boil,
  // based on history", also matches inside this one's, so the snapshot proof
  // must rewrite this one before it.
  {
    key: "learned.pan", row: "learned",
    before: { text: "{water} of water takes about {time} to boil, based on history" },
    after: { text: "{water} of water takes about {time} to boil" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.phase.cookingBoiling", row: "readout labels",
    before: { text: "Cooking — keep it boiling" },
    after: { text: "Keep it boiling" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.phase.cookingHeatOff", row: "readout labels",
    before: { text: "Cooking — heat off, lid on" },
    after: { text: "Heat off, lid on" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.phase.pull", row: "readout labels",
    before: { text: "Eggs out — now" },
    after: { text: "Eggs out now" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.phase.coolingIce", row: "readout labels",
    before: { text: "Cooling — leave in the ice" },
    after: { text: "Leave them in the ice" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.phase.coolingTap", row: "readout labels",
    before: { text: "Cooling — keep the water running" },
    after: { text: "Keep the water running" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.sub.coldAssumes", row: "readout lines",
    before: { text: "about {boil} to boil, based on history" },
    after: { text: "about {boil} to boil, from what I've timed before" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.sub.standing", row: "readout lines",
    before: { text: "for {water} of water, lid on — measure it" },
    after: { text: "measure out {water} of water, and keep the lid on" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.sub.coolingProbe", row: "readout lines",
    before: { text: "until the middle of the yolk stops warming — have the probe ready" },
    after: { text: "have the probe ready for when the middle of the yolk stops warming" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.alarm.denied", row: "readout lines",
    before: { text: "notifications are off — keep the app open" },
    after: { text: "notifications are off, so keep the app open" },
    appsBefore: ["ios"], appsAfter: ["ios"],
  },
  {
    key: "readout.alarm.failed", row: "readout lines",
    before: { text: "I couldn't set the alarm — keep the app open" },
    after: { text: "I couldn't set the alarm, so keep the app open" },
    appsBefore: ["ios"], appsAfter: ["ios"],
  },
  {
    key: "readout.restored", row: "readout lines",
    before: { text: "I picked this one back up after a reload. The times are right, but I can't sound the alarm, so watch the clock." },
    after: { text: "After the reload the times are still right, but I can't sound the alarm, so watch the clock." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: "refusal.harderThanPan", row: "refusals",
    before: { text: "With the heat off, this much water ({water}) cools before the yolk gets there. Firmest possible: {limit}. Add more water, or keep it boiling." },
    after: { text: "With the heat off, this much water ({water}) cools too soon to make the yolk any firmer. Firmest possible: {limit}. Add more water, or keep it boiling." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "refusal.counter", row: "refusals",
    before: { text: "Resting on the counter keeps cooking the yolk. Softest possible: {limit}. An ice bath would leave the egg softer." },
    after: { text: "On the counter the yolk keeps cooking after the egg comes out. Softest possible: {limit}. For a softer yolk, cool the eggs in an ice bath." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "refusal.tap", row: "refusals",
    before: { text: "A cold tap doesn't cool the egg fast enough to stop the yolk. Softest possible: {limit}. An ice bath would leave the egg a little softer." },
    after: { text: "A cold tap doesn't cool the egg fast enough to stop the yolk cooking. Softest possible: {limit}. For a slightly softer yolk, use an ice bath." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "action.hint.hotBoiling", row: "action hints",
    before: { text: "eggs into water at a full boil; keep it there for all {time}" },
    after: { text: "eggs into water at a full boil, and keep it boiling for all {time}" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "action.hint.heating.more", row: "action hints",
    before: { text: "Tap Full rolling boil when the whole surface is heaving and stirring doesn't calm it, not at the first bubbles. I time the rest of the cook from your tap: a few seconds either way is fine, a minute early isn't. Until you tap, the countdown is my guess." },
    after: { text: "Tap Full rolling boil when the whole surface is bubbling hard and stirring doesn't calm it. The first bubbles are too soon. I time the rest of the cook from your tap, and tapping a minute early leaves the eggs underdone. Until you tap, the countdown is my guess." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "spoken.done", row: "spoken",
    before: { text: "Eat." },
    after: { text: "Your eggs are ready." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: "controls.egg.more", row: "(i) paragraphs",
    before: { text: "A bigger egg takes longer: the heat has further to go. One size on the box covers quite different weights, so if you have kitchen scales, weigh an egg and give me its weight." },
    after: { text: "A bigger egg takes longer, because the heat has further to go. Eggs of one size on the box can weigh quite different amounts, so if you can, weigh an egg and give me its weight." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.measure.legend", row: "measure",
    before: { text: "Or measure the egg — fill in any one" },
    after: { text: "Or fill in any one measurement" },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: "controls.measure.hint", row: "measure",
    before: { text: "Kitchen scales are the most accurate. Without them, wrap a strip of paper round the fattest part and measure the strip." },
    after: { text: "Weighing is the most accurate. Otherwise, wrap a strip of paper around the fattest part and measure the strip." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: "controls.eggFrom.more", row: "(i) paragraphs",
    before: { text: "Fridge eggs are the most predictable. A fridge is much the same every day and a room isn't, and each degree moves the time a little." },
    after: { text: "Eggs from the fridge give the most reliable times, because a fridge stays at much the same temperature every day, and a room doesn't." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.start.more", row: "(i) paragraphs",
    before: { text: "Boiling water: lower the eggs into water at a full boil. They peel more easily. Cold water: eggs into a cold pan, heat on, and tap Full rolling boil when the water rolls. Counting the wait for the boil, they're done sooner. Sous-vide: I'll tell you when you should have started, usually a while ago." },
    after: { text: "Boiling water: lower the eggs into water at a full boil. They peel more easily this way. Cold water: put the eggs in a cold pan, turn the heat on, and tap Full rolling boil when the water rolls. This is quicker overall. Sous-vide: I'll tell you how long the eggs need in the water. It's usually many hours, so plan ahead." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.afterTheBoil.more", row: "(i) paragraphs",
    before: { text: "Keep boiling: the water stays at a full boil until the eggs come out, and how much water hardly matters. Heat off, lid on: once the eggs are in boiling water, the water finishes them as it cools. It saves energy, but the amount of water sets the time, and too little can't finish the job, so measure it." },
    after: { text: "Keep boiling: keep the water at a full boil until the eggs come out. The amount of water hardly matters. Heat off, lid on: once the eggs are in, turn the heat off and the hot water continues to cook the eggs. This saves energy, but the time depends on how much water there is, so measure it. With too little water the eggs won't cook through." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.cooling.more", row: "(i) paragraphs",
    before: { text: "Out of the water, the yolk keeps cooking for a few minutes. An ice bath stops that soonest, so I can offer the softest yolks; a cold tap is nearly as good. On the counter the egg barely cools, so the softest yolks are out, and how much more the yolk cooks is hard to predict." },
    after: { text: "The yolk keeps cooking for a few minutes after the eggs come out of the water. An ice bath stops it fastest, so it allows the softest yolks, and a cold tap is nearly as good. On the counter the egg cools so slowly that the softest yolks aren't possible, and the result varies more." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.water.more", row: "(i) paragraphs",
    before: { text: "How much water, not counting the eggs. It matters most with the heat off, when the water's own heat cooks the eggs: more water stays hot longer. With the heat on it matters a little. I also remember how long each amount takes to boil, so it's worth measuring." },
    after: { text: "How much water is in the pan, not counting the eggs. It matters most with the heat off, because then the hot water alone cooks the eggs. With the heat on it matters less. I also remember how long each amount takes to boil, so it's worth measuring." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.eggsInPan.more", row: "(i) paragraphs",
    before: { text: "Cold eggs cool boiling water as they go in, and more eggs cool it more, so it takes longer to come back to the boil, or with the heat off never does. On a cold-water start I don't need it: your tap when the water boils already counts them." },
    after: { text: "The more cold eggs you put in, the more they cool the water, so they take longer to cook. On a cold-water start I don't need this, because your tap at the boil already accounts for them." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.altitude.more", row: "(i) paragraphs",
    before: { text: "Higher up, water boils cooler, so eggs cook more slowly, noticeably so up a mountain. Tell me roughly how high you are and I'll use the boiling point shown." },
    after: { text: "The higher you are, the lower the temperature water boils at, so eggs take longer to cook, especially in the mountains. Tell me roughly how high you are and I'll use the boiling point shown." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.thermometer.more", row: "(i) paragraphs",
    before: { text: "When the cooling countdown ends, the middle of the yolk is at its hottest, and I'll ask for one reading. Push the tip to the very middle and tell me the highest number you see: anywhere else, or later, reads lower. That one reading teaches me how fast heat gets into your eggs. On the counter nothing is counted down, so I don't ask." },
    after: { text: "When the cooling countdown ends, the middle of the yolk is at its hottest, and I'll ask you for a reading. Push the tip right into the middle and tell me the highest number you see. Anywhere else, or any later, will read too low. The reading tells me how fast heat gets into your eggs. If you cool the eggs on the counter there's no countdown, so I won't ask." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.how.p1", row: "Help",
    before: { text: "I work out how heat soaks into your egg and how far the yolk and white set, then pick the time that leaves the yolk as you asked." },
    after: { text: "I calculate how heat gets into your egg and how far the yolk and white set, and pick the time that gives you the yolk you asked for." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.how.p2", row: "Help",
    before: { text: "The cooling counts too. An egg out of the water keeps cooking from the inside for a few minutes. An ice bath stops that soonest; the counter barely slows it." },
    after: { text: "The cooling time also counts as cooking time, since the egg is still warm inside." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.learn.p1", row: "Help",
    before: { text: "From your answers I learn how you like your yolk and how your eggs cook. From your taps at the boil, I learn how long your water takes to boil. One probe reading teaches me how fast heat gets into your eggs. Every question is optional." },
    after: { text: "Your answers tell me how you like your yolk and how your eggs cook. When you tap Full rolling boil, I learn how long your water takes to boil. A probe reading, if you take one, tells me how fast heat gets into your eggs. You don't have to answer anything." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.learn.aside", row: "Help",
    before: { text: "I use [sequential Monte Carlo](https://en.wikipedia.org/wiki/Particle_filter) to learn your eggs and your taste, with an [ordered probit](https://en.wikipedia.org/wiki/Ordered_probit) for too soft, just right and too firm. I keep every egg, so when I improve, I relearn from all of them. [The design](https://github.com/danmackinlay/actual_egg_timer/blob/main/INFERENCE.md)." },
    after: { text: "I use [sequential Monte Carlo](https://en.wikipedia.org/wiki/Particle_filter) to learn about your eggs and your taste, with an [ordered probit](https://en.wikipedia.org/wiki/Ordered_probit) for too soft, just right and too firm. I keep a record of every egg, so when I'm updated, I relearn from all of them. [The design](https://github.com/danmackinlay/actual_egg_timer/blob/main/INFERENCE.md)." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.reliable.every", row: "Help",
    before: { text: "Weigh the egg if you can: one size on the box covers eggs that need quite different times. Eggs straight from the fridge are more predictable than eggs at room temperature." },
    after: { text: "Weigh the egg if you can, because eggs of the same size on the box can need quite different times. Eggs straight from the fridge come out more consistently than eggs at room temperature." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.reliable.hot", row: "Help",
    before: { text: "The easiest to get right. Keep the water at a full rolling boil the whole time." },
    after: { text: "This is the easiest way to get right. Keep the water at a full rolling boil the whole time." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.reliable.cold", row: "Help",
    before: { text: "Tap Full rolling boil when the whole surface rolls, not at the first bubbles. That tap corrects my time while the eggs cook." },
    after: { text: "Wait until the whole surface is rolling before you tap Full rolling boil. The first bubbles are too soon. I correct the time from your tap while the eggs cook." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.reliable.cooling", row: "Help",
    before: { text: "An ice bath is the most predictable, and a cold tap nearly as good. On the counter the yolk keeps cooking, so for soft eggs use ice." },
    after: { text: "An ice bath gives the most reliable result, and a cold tap is nearly as good. On the counter the yolk keeps cooking, so use ice for soft eggs." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.odds.p1", row: "Help",
    before: { text: "Under the time, I say which way an egg is likely to miss. The bracket under the slider shows where the yolk will probably land, and it narrows as I learn." },
    after: { text: "Under the time, I say which way an egg is likely to miss. The bracket under the slider shows the range your yolk will probably fall in, and it gets narrower as I learn." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.odds.aside", row: "Help",
    before: { text: "The bracket covers eight eggs in ten. When I choose the time, a runny white counts three times as bad as a yolk a little too firm, so I lean slightly long. The slider's shading shows how often each doneness comes out right for you." },
    after: { text: "Eight eggs in ten fall inside the bracket. When I choose the time, I treat a runny white as three times worse than a yolk a little too firm, so I err slightly on the long side. The shading on the slider shows how often each doneness comes out right for you." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.unsure.counter", row: "Help",
    before: { text: "The counter. Nobody seems to have published how fast an egg cools in still air, so that is my weakest number." },
    after: { text: "I'm least sure about cooling on the counter, because I couldn't find any published measurements of how fast an egg cools in still air." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.unsure.heatOff", row: "Help",
    before: { text: "Heat off. I assume an ordinary pan with its lid on; a heavy pot or a loose lid will change the time." },
    after: { text: "With the heat off, I assume an ordinary pan with its lid on. A heavy pot or a loose lid will change the time." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.unsure.white", row: "Help",
    before: { text: "Whites. I can't tell a white that sets late from a cook who calls a tender white runny." },
    after: { text: "When you say a white was runny, I can't tell whether it set late or whether you call a tender white runny." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.unsure.sousVide", row: "Help",
    before: { text: "Sous-vide. Below {floor} the white stays liquid and moves inside the shell, which I leave out, so I'm not reliable there. I estimate the white takes hours, even days, to set that cool, if it sets at all." },
    after: { text: "Below {floor}, a sous-vide white stays liquid and moves around inside the shell. I don't account for that, so my times are unreliable there. At those temperatures I estimate the white takes hours or even days to set, if it sets at all." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.sources.intro", row: "Help",
    before: { text: "The main sources behind my numbers. The [README](https://github.com/danmackinlay/actual_egg_timer#10-references) lists them all, with what each one settled." },
    after: { text: "These are the main sources for my numbers. The [README](https://github.com/danmackinlay/actual_egg_timer#10-references) lists them all, with what I took from each." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "idle.welcome", row: "held, revisited",
    before: { text: "Our first egg together. I start off guessing from a generic egg, but as you give me feedback, I learn to specialise on you." },
    after: { text: "I start with times for a typical egg. As you tell me how each egg turns out, I adjust them to your eggs and your taste." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "outcome.likely.firm", row: "outcome",
    before: { text: "Probably just right; if not, a little firm." },
    after: { text: "Probably just right. If not, a little firm." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "outcome.likely.soft", row: "outcome",
    before: { text: "Probably just right; if not, a little soft." },
    after: { text: "Probably just right. If not, a little soft." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "outcome.unsure", row: "outcome",
    before: { text: "Could come out too soft or too firm; I can't tell yet." },
    after: { text: "It could come out too soft or too firm. I can't tell yet." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "outcome.miss.firm", row: "outcome",
    before: { text: "Might miss, more likely too firm." },
    after: { text: "It might miss, and if so, probably too firm." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "outcome.miss.soft", row: "outcome",
    before: { text: "Might miss, more likely too soft." },
    after: { text: "It might miss, and if so, probably too soft." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "outcome.bracket", row: "outcome",
    before: { text: "The bracket under the slider shows where your yolk will probably land. To be safe from a soft yolk, slide right until the bracket's left end is somewhere you'd be happy; to be safe from a firm one, slide left until its right end is." },
    after: { text: "The bracket under the slider shows the range your yolk will probably fall in. If you'd rather not risk a soft yolk, slide right until the left end of the bracket is somewhere you'd be happy with. If you'd rather not risk a firm one, slide left until the right end is." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "outcome.why", row: "outcome",
    before: { text: "Before your first egg I don't know your taste, your eggs or your kitchen, so the bracket starts wide. Each egg you tell me about narrows it." },
    after: { text: "At first I don't know your taste, your eggs or your kitchen, so the bracket starts wide. It narrows with each egg you tell me about." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "outcome.learning", row: "outcome",
    before: { text: "To help me learn faster, answer both questions after each egg, and on a cold-water start, tell me when the water is at a full rolling boil. If you have a probe thermometer, one reading teaches me most." },
    after: { text: "To help me learn faster, answer both questions after each egg, and on a cold-water start, tell me when the water is at a full rolling boil. If you have a probe thermometer, a single reading helps most." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "advice.fridge", row: "advice",
    before: { text: "Use eggs straight from the fridge: I know how cold a fridge is, but not your room." },
    after: { text: "Use eggs straight from the fridge, because I know how cold a fridge is but not how warm your room is." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "advice.weigh", row: "advice",
    before: { text: "Weigh the egg. One size on the box covers eggs that need quite different times." },
    after: { text: "Weigh the egg, because eggs of the same size on the box can need quite different times." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "advice.ice", row: "advice",
    before: { text: "Cool the eggs in an ice bath. On the counter, how much more the yolk cooks is hard to predict." },
    after: { text: "Cool the eggs in an ice bath. On the counter it's hard to say how much more the yolk will cook." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "advice.moreWater", row: "advice",
    before: { text: "Use more water. With the heat off, more water holds its heat for longer, so small differences in how fast it cools matter less." },
    after: { text: "Use more water. With the heat off, more water stays hot for longer, so the time is more reliable." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.forget.more", row: "learned",
    before: { text: "I forget every egg you've told me about and every boil you've timed, and start again from eggs in general. A wrong answer or two washes out after a few more eggs, so this is for a new stove, a new kitchen or a fresh start." },
    after: { text: "I forget every egg you've told me about and every boil you've timed, and go back to the times for a typical egg. A wrong answer or two will wash out after a few more eggs, so you only need this for a new stove or a new kitchen." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.confirm.message", row: "learned",
    before: { text: "I'll forget every egg and every boil, and the times go back to where they started." },
    after: { text: "I'll forget every egg and every boil, and go back to the times for a typical egg." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "feedback.invite", row: "feedback",
    before: { text: "Your answers teach me your taste and your eggs." },
    after: { text: "Your answers help me fit the times to your taste and your eggs." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "feedback.thanks", row: "feedback",
    before: { text: "Thanks — I'll use that next time." },
    after: { text: "Thanks. I'll use that next time." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "feedback.optional", row: "feedback",
    before: { text: "Answer either, both or neither." },
    after: { text: "Both questions are optional." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "probe.offer", row: "probe",
    before: { text: "Got a probe thermometer? When I say, push it to the middle of the egg and tell me the highest number you see." },
    after: { text: "Do you have a probe thermometer? If so, when I ask, push it into the middle of the egg and tell me the highest number you see." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "probe.refused", row: "probe",
    before: { text: "That doesn't look like the middle of this egg: expect {low} to {high}. Is the tip in the yolk?" },
    after: { text: "That's not what I'd expect from the middle of this egg, which should read {low} to {high}. Is the tip in the yolk?" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "sousvide.subline", row: "sous-vide",
    before: { text: "at {clock} — {duration} at {bath}, to eat now" },
    after: { text: "at {clock}, for {duration} at {bath}, to eat now" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "sousvide.warn", row: "sous-vide",
    before: { text: "At {bath} the white takes most of a day to set, if it sets at all. I'm built for boiling water, and I'm not reliable below {floor}. Use the pan." },
    after: { text: "At {bath} the white takes most of a day to set, if it sets at all. My times aren't reliable below {floor}, so boil the eggs instead." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "sousvide.hint", row: "sous-vide",
    before: { text: "nothing to start — you are {duration} late" },
    after: { text: "nothing to start, and you're {duration} late" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "alarm.pull.title", row: "alarms",
    before: { text: "Eggs out — now" },
    after: { text: "Eggs out now" },
    appsBefore: ["ios"], appsAfter: ["ios"],
  },
  {
    key: "alarm.cooled.body", row: "held, revisited",
    before: { text: "The yolk has stopped cooking. That is the egg you asked for." },
    after: { text: "The yolk has stopped cooking. Your eggs are ready." },
    appsBefore: ["ios"], appsAfter: ["ios"],
  },
  {
    key: "alarm.probe.body", row: "alarms",
    before: { text: "Middle of the egg: tell me the highest number." },
    after: { text: "Push the probe into the middle of the egg and tell me the highest number." },
    appsBefore: ["ios"], appsAfter: ["ios"],
  },
  {
    key: "colophon.tail", row: "colophon",
    before: { text: "— mistakes included." },
    after: { text: "are open for anyone to check." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
];

export const plain: Draft = {
  base: '73ea0f8',
  rows: PLAIN_DRAFT,
  exampleOnly: {},
};
