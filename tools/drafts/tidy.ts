/**
 * The `tidy` draft: WORKLIST section 9, the interface copy, applied as one
 * draft on `bfc070d` (the owner's D8, 28 September), both apps, each changed
 * key's 1750 twin rewritten with it. The owner reviews it in place on a phone
 * and says what to put back. The rows are tagged by the part of section 9
 * they answer: 9.1 the text was false against the code (committed first, so
 * they survive whatever is put back), 9.2 the same thing said twice on one
 * screen, 9.3 the (i) paragraphs and Help cut to what the cook needs, 9.4 the
 * app speaking as "I", 9.5 one wording per meaning. LANGUAGE.md section 3 has
 * the table.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

const TIDY_DRAFT: Drafted[] = [
  {
    key: "sousvide.warn", row: "9.1 factual",
    before: { text: "At {bath} the white won't set, however long you leave it. I'm built for boiling water, and I'm not reliable below {floor}. Use the pan." },
    after: { text: "At {bath} the white takes most of a day to set, if it sets at all. I'm built for boiling water, and I'm not reliable below {floor}. Use the pan." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.unsure.sousVide", row: "9.1 factual",
    before: { text: "Sous-vide. Below {floor} the white stays liquid and moves inside the shell, which I leave out, so I'm not reliable there. The very long times are real, though: that cool, the white takes most of a day to set." },
    after: { text: "Sous-vide. Below {floor} the white stays liquid and moves inside the shell, which I leave out, so I'm not reliable there. I estimate the white takes hours, even days, to set that cool, if it sets at all." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "sousvide.note.whiteBound", row: "9.1 factual",
    before: { text: "white still not set, yolk creamy" },
    after: { text: "white only just set, yolk firmer than you asked" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "sousvide.note.yolkBound", row: "9.1 factual",
    before: { text: "yolk set, white still not" },
    after: { text: "yolk as you asked, white set" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.learn.p1", row: "9.1 factual",
    before: { text: "Your answers teach me three things: how you like your yolk, how your eggs' whites behave, and how fast your stove boils water. A probe reading teaches me how fast heat gets into your eggs, all at once. Every question is optional." },
    after: { text: "From your answers I learn how you like your yolk and how your eggs cook. From your taps on Full rolling boil, I learn how long your water takes to boil. One probe reading teaches me how fast heat gets into your eggs. Every question is optional." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.restored", row: "9.1 factual",
    before: { text: "Picked this cook back up after a reload. The deadlines are right, but the alarm went with the old page — keep this tab open, or Cancel and start again." },
    after: { text: "I picked this cook back up after a reload. The times are right, but I can't ring for it: watch the clock." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: "help.odds.p1", row: "9.1 factual",
    before: { text: "Under the time, I say which way an egg is likely to miss. The bracket under the slider shows where the yolk will probably land. All of it narrows as I learn." },
    after: { text: "Under the time, I say which way an egg is likely to miss. The bracket under the slider shows where the yolk will probably land, and it narrows as I learn." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "feedback.invite", row: "9.1 factual",
    before: { text: "Your answers teach me your eggs and your kitchen." },
    after: { text: "Your answers teach me your taste and your eggs." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "action.hint.whiteNeverSets", row: "9.2 said twice",
    before: { text: "nothing to start: with this much water the white never sets" },
    after: { text: "nothing to start" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "refusal.whiteNeverSets", row: "9.2 said twice",
    before: { text: "With the heat off, the water cools before the white sets, so no setting works. Add more water, or keep it boiling." },
    after: { text: "With the heat off, the water cools before the white sets. Add more water, or keep it boiling." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "action.hint.cookingBoiling", row: "9.2 said twice (F2)",
    before: { text: "keep it at a full boil ({boiling}) until the eggs come out" },
    after: { text: "at {boiling} until the eggs come out" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "action.hint.cookingStanding", row: "9.2 said twice (F2)",
    before: { text: "lid on, burner off" },
    after: { text: "lid on until the eggs come out" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.eggFrom.more", row: "9.2 said twice",
    before: { text: "A fridge keeps its eggs at much the same temperature every day, so I know where a fridge egg starts. A room can be a few degrees warmer or cooler than I assume, and every degree moves the time a little. If you know better, pick Custom and tell me. An egg that has been sitting out is at room temperature, so it also tells me how warm your kitchen is, which matters when the eggs rest on the counter or the heat goes off." },
    after: { text: "Eggs from the fridge are the most predictable: a fridge is much the same every day, a room isn't, and every degree moves the time a little." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.measure.hint", row: "9.2 said twice",
    before: { text: "A kitchen scale is the accurate one. Otherwise wrap a strip of paper round the fattest part and measure the strip — easier than trying to caliper an egg. The other two boxes follow from whichever you fill in." },
    after: { text: "Kitchen scales are the most accurate. Without them, wrap a strip of paper round the fattest part and measure the strip." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: "controls.cooling.more", row: "9.3 shorter (i)",
    before: { text: "When the eggs come out, the heat in the white keeps moving inward, and the yolk goes on cooking for a few minutes. Ice water takes the heat away fastest, so it stops that soonest and lets me offer the softest yolks; a cold tap is nearly as good. Still air barely takes heat away at all: to a hot egg on the counter it is less a way of cooling than a lid. I allow for that, but it rules out the softest yolks, and how much more the yolk cooks is hard to predict." },
    after: { text: "Out of the water, the yolk keeps cooking for a few minutes. An ice bath stops that soonest, so I can offer the softest yolks; a cold tap is nearly as good. On the counter the egg barely cools, so the softest yolks are out, and how much more the yolk cooks is hard to predict." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.afterTheBoil.more", row: "9.3 shorter (i)",
    before: { text: "Keep boiling: the burner holds the water at a full boil until the eggs come out, and how much water there is hardly matters. Heat off, lid on: once the eggs are in boiling water, turn the burner off, put the lid on, and the hot water finishes the eggs as it cools. That saves energy, but the water is doing all the work, so how much there is decides the time, and with too little it can't finish the job. Measure it if you choose this." },
    after: { text: "Keep boiling: the water stays at a full boil until the eggs come out, and how much water hardly matters. Heat off, lid on: once the eggs are in boiling water, the water finishes them as it cools. It saves energy, but the amount of water sets the time, and too little can't finish the job, so measure it." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.thermometer.more", row: "9.3 shorter (i)",
    before: { text: "If you have a probe thermometer, I'll ask for one reading when the cooling countdown ends. That's the moment the middle of the yolk is at its warmest, so push the tip to the very middle and tell me the highest number you see: anywhere else, or any later, reads lower. From that single egg I learn how fast heat gets into your eggs. I don't ask when the eggs rest on the counter, because nothing is counted down." },
    after: { text: "When the cooling countdown ends, the middle of the yolk is at its hottest, and I'll ask for one reading. Push the tip to the very middle and tell me the highest number you see: anywhere else, or later, reads lower. That one reading teaches me how fast heat gets into your eggs. On the counter nothing is counted down, so I don't ask." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.sub.coldAssumes.more", row: "9.3 shorter (i)",
    before: { text: "Each time you tap Full rolling boil on a cold-water start, I note how long the water took, and blend it half and half with what I had for that much water. I can't tell your pots apart, only how much water is in them. If I've never timed this much, I scale from the nearest amount I have. Tap the boil today and I'll correct the time while the eggs cook." },
    after: { text: "It's how long this much water has taken to boil before, from your taps on Full rolling boil. For an amount I haven't timed, I scale from the nearest one I have. Tap Full rolling boil today and I'll correct the time while the eggs cook." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.start.more", row: "9.3 shorter (i)",
    before: { text: "Boiling water: lower the eggs into water that's already at a full boil, and the clock starts as they go in. They peel more easily. Cold water: eggs in a cold pan, heat on, and you tap when it boils, which teaches me how fast your stove boils water. They're done sooner, counting the wait for the boil. Sous-vide: I'll tell you when you should have started. It's usually a while ago." },
    after: { text: "Boiling water: lower the eggs into water at a full boil. They peel more easily. Cold water: eggs into a cold pan, heat on, and tap Full rolling boil when the water rolls. Counting the wait for the boil, they're done sooner. Sous-vide: I'll tell you when you should have started, usually a while ago." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.water.more", row: "9.3 shorter (i)",
    before: { text: "How much water goes in the pan, not counting the eggs. It matters most with the heat off, when the water's own heat does the cooking: more water holds its heat longer. It matters a little with the heat on, because cold eggs going into boiling water cool a little water more than a lot. And I remember how long it takes to boil each amount you use, so it's worth measuring." },
    after: { text: "How much water, not counting the eggs. It matters most with the heat off, when the water's own heat cooks the eggs: more water stays hot longer. With the heat on it matters a little. I also remember how long each amount takes to boil, so it's worth measuring." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "action.hint.heating.more", row: "9.3 shorter (i)",
    before: { text: "A full rolling boil is when the whole surface is heaving and stirring doesn't calm it, not the first bubbles at the edge. The rest of the cook is timed from your tap, and it teaches me how fast your stove boils water, so a few seconds either way is fine, but a minute early isn't. Until you tap, the countdown is my guess." },
    after: { text: "Tap Full rolling boil when the whole surface is heaving and stirring doesn't calm it, not at the first bubbles. I time the rest of the cook from your tap: a few seconds either way is fine, a minute early isn't. Until you tap, the countdown is my guess." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "outcome.learning", row: "9.3 shorter (i)",
    before: { text: "I learn your taste in yolks from how you say they came out, how your whites set from the second question, how fast heat gets into your eggs from both, and how long your water takes to boil when you tap the boil. Answer both questions after each egg, and if you have a probe thermometer, give me a reading: that is the quickest teacher." },
    after: { text: "To help me learn faster, answer both questions after each egg, and tap Full rolling boil when the water rolls. If you have a probe thermometer, one reading teaches me most." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.eggsInPan.more", row: "9.3 shorter (i)",
    before: { text: "How many eggs go in together. Cold eggs take heat out of boiling water as they go in, and more eggs take more, so the water takes longer to recover, or with the heat off never does. For eggs that start in cold water it makes no difference to my sums: you tap when the water boils, and that already counts them." },
    after: { text: "Cold eggs cool boiling water as they go in, and more eggs cool it more, so it takes longer to come back to the boil, or with the heat off never does. On a cold-water start I don't need it: your tap on Full rolling boil already counts them." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.forget.more", row: "9.3 shorter (i)",
    before: { text: "This forgets every egg you've told me about and every boil you've timed, and I go back to what's true of eggs in general. You don't need it to undo a wrong answer or two: they wash out after a few more eggs. It's for a new stove, a new kitchen, or a fresh start." },
    after: { text: "I forget every egg you've told me about and every boil you've timed, and start again from eggs in general. A wrong answer or two washes out after a few more eggs, so this is for a new stove, a new kitchen or a fresh start." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.egg.more", row: "9.3 shorter (i)",
    before: { text: "The heat has to reach the middle of the egg, and a bigger egg's middle is further from the water. A size from the box covers eggs of quite different weights, so if you have kitchen scales, weigh one and type the weight in, and I'll use that instead of the box." },
    after: { text: "A bigger egg takes longer: the heat has further to go. One size on the box covers quite different weights, so if you have kitchen scales, weigh an egg and give me its weight." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "outcome.bracket", row: "9.3 shorter (i)",
    before: { text: "The bracket under the doneness slider is where I expect your yolk to land. If a soft yolk would bother you more than a firm one, slide right until the bracket's left end is somewhere you'd still be happy; if a firm one would, slide left until its right end is." },
    after: { text: "The bracket under the slider shows where your yolk will probably land. To be safe from a soft yolk, slide right until the bracket's left end is somewhere you'd be happy; to be safe from a firm one, slide left until its right end is." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.altitude.more", row: "9.3 shorter (i)",
    before: { text: "Higher up, the air presses down less, so water boils cooler, and cooler water cooks more slowly. It adds up: a kitchen up a mountain needs noticeably longer than one by the sea. Tell me roughly how high you are, and I'll cook at the boiling point shown here." },
    after: { text: "Higher up, water boils cooler, so eggs cook more slowly, noticeably so up a mountain. Tell me roughly how high you are and I'll use the boiling point shown." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.language.more", row: "9.3 shorter (i)",
    before: { text: "English (1750) is English as Samuel Johnson wrote it in the preface to his Dictionary. I switch to it when you change from Metric to Imperial, and back when you change back. Pick English to leave it and keep your units." },
    after: { text: "English (1750) is English as Samuel Johnson wrote it. I switch to it when you pick Imperial, and back when you pick Metric. Pick English to keep Imperial in today's English." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.how.p1", row: "9.3 Help",
    before: { text: "I don't use a rule of thumb. I work out how heat soaks into your egg from the water, and how far the yolk and the white set on the way, then pick the time that stops the yolk where you asked." },
    after: { text: "I work out how heat soaks into your egg and how far the yolk and white set, then pick the time that leaves the yolk as you asked." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.how.aside", row: "9.3 Help",
    before: { text: "Technically: [heat conduction](https://en.wikipedia.org/wiki/Heat_equation) through a sphere the size of your egg, and protein setting as a dose of heat over time, from the [Arrhenius equation](https://en.wikipedia.org/wiki/Arrhenius_equation). Every constant, with its source, is in the [README](https://github.com/danmackinlay/actual_egg_timer#2-the-physical-model)." },
    after: { text: "I model [heat conduction](https://en.wikipedia.org/wiki/Heat_equation) through a sphere the size of your egg, and protein setting as a dose of heat over time, with the [Arrhenius equation](https://en.wikipedia.org/wiki/Arrhenius_equation). Every constant and its source is in the [README](https://github.com/danmackinlay/actual_egg_timer#2-the-physical-model)." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.how.p2", row: "9.5 ice bath",
    before: { text: "The cooling counts too. An egg out of the water keeps cooking from the inside for a few minutes. Ice water stops that soonest; the counter barely slows it." },
    after: { text: "The cooling counts too. An egg out of the water keeps cooking from the inside for a few minutes. An ice bath stops that soonest; the counter barely slows it." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.learn.title", row: "9.3 Help",
    before: { text: "What I learn, and from what" },
    after: { text: "What I learn" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.learn.aside", row: "9.3 Help",
    before: { text: "I keep a cloud of guesses about your eggs and your taste, and each answer reweights them: [sequential Monte Carlo](https://en.wikipedia.org/wiki/Particle_filter), with an [ordered probit](https://en.wikipedia.org/wiki/Ordered_probit) for too soft, just right or too firm. I keep every egg, so when I improve, I relearn from all of them. [The design](https://github.com/danmackinlay/actual_egg_timer/blob/main/INFERENCE.md)." },
    after: { text: "I use [sequential Monte Carlo](https://en.wikipedia.org/wiki/Particle_filter) to learn your eggs and your taste, with an [ordered probit](https://en.wikipedia.org/wiki/Ordered_probit) for too soft, just right and too firm. I keep every egg, so when I improve, I relearn from all of them. [The design](https://github.com/danmackinlay/actual_egg_timer/blob/main/INFERENCE.md)." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.reliable.cooling", row: "9.5 ice bath",
    before: { text: "Ice water is the most predictable, a cold tap is nearly as good, and the counter keeps cooking the yolk. For soft eggs, use ice." },
    after: { text: "An ice bath is the most predictable, and a cold tap nearly as good. On the counter the yolk keeps cooking, so for soft eggs use ice." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "feedback.thanks", row: "9.4 voice",
    before: { text: "Thanks. The next egg will use that." },
    after: { text: "Thanks — I'll use that next time." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.eggFrom.hint", row: "9.4 voice",
    before: { text: "Assumed temperatures — fridge: {fridge}, room: {room}. Pick Custom if yours differ." },
    after: { text: "I assume {fridge} for a fridge and {room} for a room. Pick Custom if yours differ." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.alarm.failed", row: "9.4 voice",
    before: { text: "the alarm did not take — keep the app open" },
    after: { text: "I couldn't set the alarm — keep the app open" },
    appsBefore: ["ios"], appsAfter: ["ios"],
  },
  {
    key: "readout.alarm.denied", row: "9.4 voice",
    before: { text: "no notification permission — keep the app open" },
    after: { text: "notifications are off — keep the app open" },
    appsBefore: ["ios"], appsAfter: ["ios"],
  },
  {
    key: "controls.units.period", row: "9.4 voice",
    before: { text: "Imperial units are also available in the English of their period." },
    after: { text: "I can also write Imperial units in the English of their day." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.forget", row: "9.4 voice (F2)",
    before: { text: "Forget what it learned" },
    after: { text: "Forget what's learned" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.confirm.title", row: "9.4 voice (F2)",
    before: { text: "Forget what it learned?" },
    after: { text: "Forget what's learned?" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.phase.pull", row: "9.5 one wording",
    before: { text: "Out of the water — now" },
    after: { text: "Eggs out — now" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "activity.target", row: "9.5 one wording",
    before: { text: "{doneness} · yolk {yolk}" },
    after: { text: "{doneness} · peak yolk {yolk}" },
    appsBefore: ["ios"], appsAfter: ["ios"],
  },
  {
    key: "readout.mute.off", row: "9.5 one wording",
    before: { text: "Muted" },
    after: { text: "Sound off" },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: "setup.start.hotStanding", row: "9.5 one wording",
    before: { text: "into boiling water and left to stand" },
    after: { text: "into boiling water, heat off and lid on" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "setup.start.coldStanding", row: "9.5 one wording",
    before: { text: "into cold water, brought to the boil and left to stand" },
    after: { text: "into cold water, brought to the boil, heat off and lid on" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "setup.start.cold", row: "9.5 one wording",
    before: { text: "into cold water and boiled" },
    after: { text: "into cold water, brought to the boil" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "action.hint.hotStanding", row: "9.5 one wording",
    before: { text: "eggs into boiling water, then lid on and heat off" },
    after: { text: "eggs into boiling water, then heat off, lid on" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "action.hint.heatingStanding", row: "9.5 one wording",
    before: { text: "wait for the whole surface to roll, then lid on and heat off" },
    after: { text: "wait for the whole surface to roll, then heat off, lid on" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "action.hint.hotBoiling", row: "9.5 one wording",
    before: { text: "water at a full rolling boil, and kept there for the whole {time}" },
    after: { text: "eggs into water at a full boil; keep it there for all {time}" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.sub.coldGuesses", row: "9.5 one wording",
    before: { text: "I'm guessing {boil} to boil — tap when it does" },
    after: { text: "about {boil} to boil, my guess" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.sub.heating", row: "9.5 one wording",
    before: { text: "{elapsed} heating · I expect {boil} until you tap" },
    after: { text: "{elapsed} so far · about {boil} to boil" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.literature", row: "9.5 one wording",
    before: { text: "I haven't learned anything yet. I learn how fast your stove boils water when you tap the boil, and your eggs when you tell me how one came out." },
    after: { text: "I haven't learned anything yet. Tap Full rolling boil on a cold-water start, and tell me how each egg came out." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.confirm.message", row: "9.5 one wording",
    before: { text: "I forget every egg and how long your water takes to boil, and the times go back to where they started." },
    after: { text: "I'll forget every egg and every boil, and the times go back to where they started." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.sub.standing", row: "shorter line",
    before: { text: "for this much water with the lid on ({water}) — measure the water, it changes the time" },
    after: { text: "for {water} of water, lid on — measure it" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.sub.cookingCold", row: "shorter line",
    before: { text: "boil took {boil} · {after} after the boil" },
    after: { text: "boiled in {boil} · then {after}" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "outcome.unsure", row: "shorter line",
    before: { text: "Could come out softer or firmer than you like — I can't call it yet." },
    after: { text: "Could come out too soft or too firm; I can't tell yet." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "outcome.miss.firm", row: "shorter line",
    before: { text: "It could miss, and if it does, more likely firmer than you like." },
    after: { text: "Might miss, more likely too firm." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "outcome.miss.soft", row: "shorter line",
    before: { text: "It could miss, and if it does, more likely softer than you like." },
    after: { text: "Might miss, more likely too soft." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "outcome.likely.firm", row: "shorter line",
    before: { text: "Probably just right. If not, more likely a little firm." },
    after: { text: "Probably just right, or else a little firm." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "outcome.likely.soft", row: "shorter line",
    before: { text: "Probably just right. If not, more likely a little soft." },
    after: { text: "Probably just right, or else a little soft." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "advice.fridge", row: "shorter line",
    before: { text: "Use eggs straight from the fridge. I know how cold a fridge is; a room can be a few degrees either way, and that moves the time." },
    after: { text: "Use eggs straight from the fridge: I know how cold a fridge is, but not your room." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "advice.ice", row: "9.5 ice bath",
    before: { text: "Put the eggs straight into ice water when they come out. On the counter the yolk keeps cooking, by an amount that is hard to predict." },
    after: { text: "Cool the eggs in an ice bath. On the counter, how much more the yolk cooks is hard to predict." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "advice.weigh", row: "shorter line",
    before: { text: "Weigh the egg instead of picking a size. One size on the box covers eggs that need quite different times." },
    after: { text: "Weigh the egg. One size on the box covers eggs that need quite different times." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "colophon.lede", row: "shorter line",
    before: { text: "I work out each time from how heat gets into an egg, not from a recipe." },
    after: { text: "I work out each time from how heat gets into an egg." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: 'controls.size.measured', row: '9.5 one wording (D6)',
    before: { text: "Measured below…" },
    after: { text: "Measured — {mass}" },
    appsBefore: ['web'], appsAfter: ['web', 'ios'],
  },
  {
    key: 'controls.size.weighed', row: '9.5 one wording (D6)',
    before: { text: "Weighed · {mass}" },
    after: null,
    appsBefore: ['ios'], appsAfter: [],
  },
];

export const tidy: Draft = {
  base: 'bfc070d',
  rows: TIDY_DRAFT,
  exampleOnly: {},
};
