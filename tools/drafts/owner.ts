/**
 * The `owner` draft: the owner's own edits to copy/en.json, made by hand on
 * 3 October 2026, with the changes agreed with the owner the same day, on
 * `7fdd6b9`, both apps. Each row's `row` says whose it is:
 *
 * - "owner": the owner's wording as typed, with its apostrophes curled
 *   (`DECISIONS.md` 56). Seventeen keys.
 * - "owner+ (…)": the owner's wording with the one fix named: a missing full
 *   stop, "weigh on" for "weigh one", "the eat" for "the heat", a comma.
 * - "buttons without “They’re”": the three buttons at the pull answer the
 *   label above them, "Eggs out now", so they name only where the eggs are:
 *   "In the ice bath", "Under running water", "In the air". "They’re under
 *   the running water" was 31 characters on a 23-character button.
 * - "below the time display": the owner's term for the line under the
 *   countdown; "under the time" read as "in less time". `help.odds.p1` is
 *   rewritten around it to say what the line and the bracket tell the cook.
 * - "running water" and "in the air" (`DECISIONS.md` 57): the cooling
 *   methods are named for what they are, not for a kitchen fitting. The base
 *   no longer says "cold tap" ("tap" is also the screen gesture) or "bench"
 *   (an Australian word; an American says counter, a Briton worktop).
 *
 * `help.unsure.counter` only swaps the bench for the air: whether it should
 * say it is least sure about cooling in the air at all waits on the
 * first-principles check of the still-air model (a separate task).
 *
 * The American overlay, copy/en-US.json, loses the 16 entries for "counter"
 * and "running water", which the base now says for everyone, and keeps the
 * four for "pot" (the `controls.water.more` one rewritten against the owner's
 * new wording).
 *
 * The 1750 twins (copy/en-x-1750.json) whose meaning moved, before -> after.
 * The pump stands for running water, as the 1750 alarm already had it, and
 * the open air for the air. `readout.phase.coolingTap` is not a drafted key,
 * since its modern wording stands, but its twin said "tap":
 *   readout.sub.coldAssumes.more: It is how long this quantity of water has hitherto been in boiling, timed by your taps. For a quantity I have never timed, I reckon from the nearest I have. Tap It boils in earnest to-day, and I shall correct the time while the eggs are cooking.
 *     -> How long water is in coming to a full boil, upon the average, amended by your past timings. Tap It boils in earnest to-day, and I shall correct the time while the eggs are cooking.
 *   action.pulled.ice: They are in the ice
 *     -> In the ice
 *   action.pulled.tap: They are under the tap
 *     -> Under the pump
 *   action.pulled.counter: They are out
 *     -> In the open air
 *   action.hint.heating.more: Tap It boils in earnest when the whole surface heaves, and is not to be calmed by stirring; not at the first bubbles. I time the rest of the cook from your tap, and a tap a minute too early will leave the eggs under-done. Until you tap, the countdown is but my conjecture.
 *     -> Tap It boils in earnest when the whole surface begins to heave, and is not to be calmed by stirring. I time the rest of the cook from this tap; be sure of it.
 *   controls.egg.more: A bigger egg takes longer, for the heat has further to go. One size upon the box comprehends very different weights; if therefore you have kitchen scales, weigh an egg, and give me its weight.
 *     -> A bigger egg takes longer, for the heat has further to go. Eggs differ much; weigh one, therefore, if you can.
 *   controls.cooling.more: Out of the water, the yolk cooks on for some minutes. Iced water arrests it soonest, and so permits me to offer the softest yolks; a cold tap is nearly as good. Upon the table the egg scarcely cools; the softest yolks are therefore forbidden, and how much more the yolk will cook is not easily foretold.
 *     -> Out of the water, the yolk cooks on for some minutes. Iced water arrests it soonest, and so permits me to offer the softest yolks; the pump is nearly as good. In the open air the egg scarcely cools, and the softest yolks are therefore forbidden.
 *   controls.water.more: The quantity of water, the eggs not reckoned. It signifies most with the fire out, for then the hot water alone cooks the eggs. With the fire lit it signifies less. I remember besides how long each quantity takes to boil; it is therefore worth measuring.
 *     -> The quantity of water in the pan, the eggs not reckoned. It signifies chiefly if you put out the fire after the boil, and a little in reckoning how long the water is in boiling.
 *   controls.altitude.more: The higher you are, the cooler water boils, and the slower eggs cook; upon a mountain, sensibly so. Tell me nearly how high you are, and I shall use the boiling point here shewn.
 *     -> The higher you are, the cooler water boils, and the slower eggs cook; upon a mountain, sensibly so.
 *   help.reliable.cooling: Iced water is the most certain, and a cold tap nearly as good. Upon the table the yolk cooks on; for soft eggs, therefore, use ice.
 *     -> Iced water is the most certain, and the pump nearly as good. Cooling in the open air is but indifferent.
 *   help.reliable.cooling.title: Ice, tap or table
 *     -> Ice, pump or open air
 *   help.odds.p1: Under the time, I say which way an egg is likely to miss. The bracket under the slider shews where the yolk will probably fall, and grows narrower as I learn.
 *     -> I cannot promise every egg. Below the figures of the time, I tell you whether this one will probably come out as you desire, and if not, whether too soft or too firm. The bracket below the slider shews the yolks you are likely to have; and the more eggs you tell me of, the narrower it grows.
 *   help.odds.aside: The bracket comprehends eight eggs in ten. When I choose the time, a white left unset is reckoned three times worse than a yolk a little too firm; I therefore incline somewhat to the longer side. The shading of the slider shews how often each degree comes out right for you.
 *     -> Eight eggs in ten will come out within this bracket. I incline to the longer side, since a white left unset is commonly worse than a yolk too firm. The deeper the shading upon the slider, the surer I am of that degree coming out right.
 *   learned.forget.more: I forget every egg you have told me of and every boil you have timed, and begin again from eggs in general. A wrong answer or two a few eggs more will wash out; you need this only for a new stove, or a new kitchen.
 *     -> I forget all your measures, and return to the common estimates. A wrong answer or two a few eggs more will wash out; you need this only for some strange mischance.
 *   setup.cooling.tap: then held under a cold tap
 *     -> then held under the pump
 *   setup.cooling.counter: then laid upon the table
 *     -> then left to cool in the open air
 *   controls.cooling.tap: Cold tap
 *     -> The pump
 *   controls.cooling.counter: Table
 *     -> Open air
 *   refusal.tap: A cold tap cools the egg too slowly to arrest the yolk. Softest attainable: {limit}. In iced water it might be left a little softer.
 *     -> Water from the pump cools the egg too slowly to arrest the yolk. Softest attainable: {limit}. In iced water it might be left a little softer.
 *   refusal.counter: An egg left upon the table does not cease to cook because it has ceased to boil. Softest attainable: {limit}. In iced water it might be left softer.
 *     -> An egg left in the open air does not cease to cook because it has ceased to boil. Softest attainable: {limit}. In iced water it might be left softer.
 *   alarm.pull.bodyCounter: Take them from the water, and lay them upon the table.
 *     -> Take them from the water, and let them cool in the open air.
 *   help.how.aside2: Upon the table, still air draws off heat so slowly, that the yolk ends within a fraction of a degree of where it would, had the egg never cooled at all. [README §5](https://github.com/danmackinlay/actual_egg_timer#5-carryover-the-cooling-step-is-part-of-the-recipe).
 *     -> Still air draws off heat so slowly, that the yolk ends within a fraction of a degree of where it would, had the egg never cooled at all. [README §5](https://github.com/danmackinlay/actual_egg_timer#5-carryover-the-cooling-step-is-part-of-the-recipe).
 *   help.unsure.counter: The table. No one appears to have made publick how fast an egg cools in still air, and that is therefore the weakest of my numbers.
 *     -> The open air. No one appears to have made publick how fast an egg cools in still air, and that is therefore the weakest of my numbers.
 *   advice.ice: Cool the eggs in iced water. Upon the table, how much more the yolk will cook is not easily foretold.
 *     -> Cool the eggs in iced water. In the open air, how much more the yolk will cook is not easily foretold.
 *   controls.thermometer.more: When the counting-down of the cooling ends, the middle of the yolk is at its hottest, and I shall ask for one reading. Thrust the point to the very middle, and tell me the highest number you see: anywhere else, or any later, reads lower. That single reading teaches me how fast heat enters your eggs. Upon the table nothing is counted down, and I do not ask.
 *     -> When the counting-down of the cooling ends, the middle of the yolk is at its hottest, and I shall ask for one reading. Thrust the point to the very middle, and tell me the highest number you see: anywhere else, or any later, reads lower. That single reading teaches me how fast heat enters your eggs. In the open air nothing is counted down, and I do not ask.
 *   readout.phase.coolingTap: Cooling; keep the tap on
 *     -> Cooling; keep the pump going
 */

import type { Draft, Drafted } from '../copyDraft.js';

const OWNER_DRAFT: Drafted[] = [
  {
    key: "readout.phase.coolingIce", row: "owner",
    before: { text: "Leave them in the ice" },
    after: { text: "Leave them in the ice bath" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.sub.coldAssumes.more", row: "owner+ (full stop)",
    before: { text: "It’s how long this much water has taken to boil before, timed from your taps. For an amount I haven’t timed, I scale from the nearest one I have. Tap Full rolling boil today and I’ll correct the time while the eggs cook." },
    after: { text: "How long water takes to get to a full rolling boil on average, refined by your past timings. Tap Full rolling boil today and I’ll correct the time while the eggs cook." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "action.pulled.ice", row: "buttons without \"They’re\"",
    before: { text: "They’re in the ice bath" },
    after: { text: "In the ice bath" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "action.pulled.tap", row: "buttons without \"They’re\"",
    before: { text: "They’re under the tap" },
    after: { text: "Under running water" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "action.pulled.counter", row: "buttons without \"They’re\"",
    before: { text: "They’re out" },
    after: { text: "In the air" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "action.hint.heating.more", row: "owner",
    before: { text: "Tap Full rolling boil when the whole surface is bubbling hard and stirring doesn’t calm it. The first bubbles are too soon. I time the rest of the cook from your tap, and tapping a minute early leaves the eggs underdone. Until you tap, the countdown is my guess." },
    after: { text: "Tap Full rolling boil when the whole surface starts bubbling hard and stirring doesn’t calm it. I time the rest of the cook from your input here, so get this right!" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.egg.more", row: "owner+ (weigh one)",
    before: { text: "A bigger egg takes longer, because the heat has further to go. Eggs of one size on the box can weigh quite different amounts, so if you can, weigh an egg and give me its weight." },
    after: { text: "A bigger egg takes longer, because the heat has further to go. Eggs vary a lot, so weigh one if you can." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.eggFrom.more", row: "owner",
    before: { text: "Eggs from the fridge give the most reliable times, because a fridge stays at much the same temperature every day, and a room doesn’t." },
    after: { text: "Eggs from the fridge give the most reliable times, because a fridge temperature is consistent." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.cooling.more", row: "owner+ (running water, air)",
    before: { text: "The yolk keeps cooking for a few minutes after the eggs come out of the water. An ice bath stops it fastest, so it allows the softest yolks, and a cold tap is nearly as good. On the bench the egg cools so slowly that the softest yolks aren’t possible, and the result varies more." },
    after: { text: "The yolk keeps cooking for a few minutes after the eggs come out of the water. An ice bath stops it fastest, so it allows the softest yolks, and cold running water is nearly as good. In the air the egg cools so slowly that the softest yolks aren’t possible." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.water.more", row: "owner+ (heat)",
    before: { text: "How much water is in the pan, not counting the eggs. It matters most with the heat off, because then the hot water alone cooks the eggs. With the heat on it matters less. I also remember how long each amount takes to boil, so it’s worth measuring." },
    after: { text: "How much water is in the pan, not counting the eggs. Mostly matters if you turn off the heat after boiling, and a little bit to estimate boiling time." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.eggsInPan.more", row: "owner",
    before: { text: "The more cold eggs you put in, the more they cool the water, so they take longer to cook. On a cold-water start I don’t need this, because your tap at the boil already accounts for them." },
    after: { text: "The more cold eggs you put in, the more they cool the water, so they take longer to cook. On a cold-water start I don’t need this, because the time-to-boiling already accounts for it." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.altitude.more", row: "owner",
    before: { text: "The higher you are, the lower the temperature water boils at, so eggs take longer to cook, especially in the mountains. Tell me roughly how high you are and I’ll use the boiling point shown." },
    after: { text: "The higher you are, the lower the temperature water boils at, so eggs take longer to cook, especially in the mountains." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.how.p1", row: "owner",
    before: { text: "I calculate how heat gets into your egg and how far the yolk and white set, and pick the time that gives you the yolk you asked for." },
    after: { text: "I calculate how heat travels through an egg and how far the yolk and white set, and pick the time that gives you the yolk you asked for." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.reliable.every", row: "owner+ (comma)",
    before: { text: "Weigh the egg if you can, because eggs of the same size on the box can need quite different times. Eggs straight from the fridge come out more consistently than eggs at room temperature." },
    after: { text: "Weigh the egg if you can, because eggs vary a lot. Eggs straight from the fridge have a more consistent temperature, which helps." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.reliable.cooling", row: "owner",
    before: { text: "An ice bath gives the most reliable result, and a cold tap is nearly as good. On the bench the yolk keeps cooking, so use ice for soft eggs." },
    after: { text: "An ice bath gives the most reliable result, and cold running water is nearly as good. Air cooling is mediocre." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.odds.aside", row: "owner",
    before: { text: "Eight eggs in ten fall inside the bracket. When I choose the time, I treat a runny white as three times worse than a yolk a little too firm, so I err slightly on the long side. The shading on the slider shows how often each doneness comes out right for you." },
    after: { text: "Eight eggs out of ten will cook to a target inside this bracket. I try to err on the side of cooking too long, since a runny white is usually worse than an overfirm yolk. The stronger the shading on the slider, the surer I am of getting that doneness right." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "setup.cooling.tap", row: "owner",
    before: { text: "then under a cold tap" },
    after: { text: "then under cold running water" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.forget.more", row: "owner",
    before: { text: "I forget every egg you’ve told me about and every boil you’ve timed, and go back to the times for a typical egg. A wrong answer or two will wash out after a few more eggs, so you only need this for a new stove or a new kitchen." },
    after: { text: "I forget all your measurements and revert to the default “typical” estimates. A wrong answer or two will wash out after a few more eggs, so you only need this for weird problems." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "alarm.pull.bodyTap", row: "owner",
    before: { text: "Straight under the cold tap, or the yolk keeps cooking." },
    after: { text: "Straight under the cold running water, or the yolk keeps cooking." },
    appsBefore: ["ios"], appsAfter: ["ios"],
  },
  {
    key: "help.odds.p1", row: "below the time display",
    before: { text: "Under the time, I say which way an egg is likely to miss. The bracket under the slider shows the range your yolk will probably fall in, and it gets narrower as I learn." },
    after: { text: "I can’t promise every egg. Below the time display, I tell you whether this one will probably come out as you asked, and if not, whether too soft or too firm. The bracket below the Doneness slider shows the range of yolks you’re likely to get. The more eggs you tell me about, the narrower it gets." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.cooling.tap", row: "running water",
    before: { text: "Cold tap" },
    after: { text: "Running water" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "refusal.tap", row: "running water",
    before: { text: "A cold tap doesn’t cool the egg fast enough to stop the yolk cooking. Softest possible: {limit}. For a slightly softer yolk, use an ice bath." },
    after: { text: "Cold running water doesn’t cool the egg fast enough to stop the yolk cooking. Softest possible: {limit}. For a slightly softer yolk, use an ice bath." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.reliable.cooling.title", row: "running water, air",
    before: { text: "Ice, tap or bench" },
    after: { text: "Ice, running water or air" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.cooling.counter", row: "in the air",
    before: { text: "Bench" },
    after: { text: "Air" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "setup.cooling.counter", row: "in the air",
    before: { text: "then onto the bench" },
    after: { text: "then left to cool in the air" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "alarm.pull.bodyCounter", row: "in the air",
    before: { text: "Out of the water and onto the bench." },
    after: { text: "Take them out and let them cool in the air." },
    appsBefore: ["ios"], appsAfter: ["ios"],
  },
  {
    key: "refusal.counter", row: "in the air",
    before: { text: "On the bench the yolk keeps cooking after the egg comes out. Softest possible: {limit}. For a softer yolk, cool the eggs in an ice bath." },
    after: { text: "In the air the yolk keeps cooking after the egg comes out. Softest possible: {limit}. For a softer yolk, cool the eggs in an ice bath." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "advice.ice", row: "in the air",
    before: { text: "Cool the eggs in an ice bath. On the bench it’s hard to say how much more the yolk will cook." },
    after: { text: "Cool the eggs in an ice bath. In the air it’s hard to say how much more the yolk will cook." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.thermometer.more", row: "in the air",
    before: { text: "When the cooling countdown ends, the middle of the yolk is at its hottest, and I’ll ask you for a reading. Push the tip right into the middle and tell me the highest number you see. Anywhere else, or any later, will read too low. The reading tells me how fast heat gets into your eggs. If you cool the eggs on the bench there’s no countdown, so I won’t ask." },
    after: { text: "When the cooling countdown ends, the middle of the yolk is at its hottest, and I’ll ask you for a reading. Push the tip right into the middle and tell me the highest number you see. Anywhere else, or any later, will read too low. The reading tells me how fast heat gets into your eggs. If you cool the eggs in the air there’s no countdown, so I won’t ask." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.how.aside2", row: "in the air",
    before: { text: "On the bench, still air takes heat out so slowly that the yolk ends up within a fraction of a degree of where it would if the egg never cooled at all. [README §5](https://github.com/danmackinlay/actual_egg_timer#5-carryover-the-cooling-step-is-part-of-the-recipe)." },
    after: { text: "Still air takes heat out so slowly that the yolk ends up within a fraction of a degree of where it would if the egg never cooled at all. [README §5](https://github.com/danmackinlay/actual_egg_timer#5-carryover-the-cooling-step-is-part-of-the-recipe)." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.unsure.counter", row: "in the air",
    before: { text: "I’m least sure about cooling on the bench, because I couldn’t find any published measurements of how fast an egg cools in still air." },
    after: { text: "I’m least sure about cooling in the air, because I couldn’t find any published measurements of how fast an egg cools in still air." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
];

export const owner: Draft = {
  base: '7fdd6b9',
  rows: OWNER_DRAFT,
  exampleOnly: {},
};
