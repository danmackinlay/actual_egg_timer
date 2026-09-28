/**
 * The `redesign` draft: the web redesign of UI.md, with the owner's wording
 * rules of 27 September, on `80799d0`.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

/** The web redesign of UI.md, on `80799d0`: two controls and a sentence, a
 *  Kitchen page, the (i) on a `more` surface, and a Help page on a `help`
 *  surface. With it, the owner's wording rules of 27 September: no narrating
 *  what the screen visibly did (the sous-vide hint), no "bath" for sous-vide,
 *  "pan" only where it means the pot, and "I'm still learning". Web only:
 *  where iOS still names a key the web gave up, the key stays and loses
 *  "web" from its apps. Every text is new and unapproved; the owner reviews
 *  them on a deploy preview (UI.md section 6). */
const REDESIGN_DRAFT: Drafted[] = [
  {
    key: "readout.stat.peakYolk", row: "the layout: one key per meaning",
    before: {"text":"peak yolk"}, after: {"text":"peak yolk"},
    appsBefore: ["web","ios"], appsAfter: ["ios"],
  },
  {
    key: "readout.stat.afterBoil", row: "the layout: one key per meaning",
    before: {"text":"after the boil"}, after: {"text":"after the boil"},
    appsBefore: ["web","ios"], appsAfter: ["ios"],
  },
  {
    key: "readout.stat.bath", row: "the owner, 27 September: wording rules",
    before: {"text":"bath"}, after: {"text":"sous-vide at"},
    appsBefore: ["web","ios"], appsAfter: ["ios"],
  },
  {
    key: "action.hint.whiteNeverSets", row: "the owner, 27 September: wording rules",
    before: {"text":"nothing to start: this pan never sets the white"}, after: {"text":"nothing to start: with this much water the white never sets"},
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: "controls.doneness.valueBath", row: "the owner, 27 September: wording rules",
    before: {"text":"{doneness} · bath {bath}"}, after: {"text":"{doneness} · water at {bath}"},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.egg", row: "the layout: one key per meaning",
    before: {"text":"Egg"}, after: {"text":"Egg"},
    appsBefore: ["ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.start.hint", row: "the layout: one key per meaning",
    before: {"text":"Eggs into boiling water peel better. Eggs into cold water are done sooner, counting the wait for the water to boil."}, after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: "controls.start.hintSousVide", row: "the owner, 27 September: wording rules",
    before: {"text":"A bath needs no pan, so the pan controls are put away. Your settings are kept and come back when you pick a pan again."}, after: {"text":"A bath needs no pan, so the pan controls are put away. Your settings are kept and come back when you pick a pan again."},
    appsBefore: ["web","ios"], appsAfter: ["ios"],
  },
  {
    key: "controls.atTheBoil", row: "the layout: one key per meaning",
    before: {"text":"At the boil"}, after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: "controls.afterTheBoil", row: "the layout: one key per meaning",
    before: {"text":"After the boil"}, after: {"text":"After the boil"},
    appsBefore: ["ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.afterBoil.hint", row: "the layout: one key per meaning",
    before: {"text":"Heat off, lid on: the hot water continues to cook the eggs. More water holds more heat."}, after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: "controls.then", row: "the layout: one key per meaning",
    before: {"text":"Then"}, after: {"text":"Then"},
    appsBefore: ["web","ios"], appsAfter: ["ios"],
  },
  {
    key: "controls.eggs", row: "the layout: one key per meaning",
    before: {"text":"Eggs"}, after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: "controls.eggsInPan", row: "the layout: one key per meaning",
    before: {"text":"Eggs in the pan"}, after: {"text":"Eggs in the pan"},
    appsBefore: ["ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.pan", row: "the owner, 27 September: wording rules",
    before: {"text":"Pan, hob and altitude"}, after: {"text":"Kitchen"},
    appsBefore: ["ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.probe", row: "the layout: one key per meaning",
    before: {"text":"I have a probe thermometer"}, after: {"text":"I have a probe thermometer"},
    appsBefore: ["web","ios"], appsAfter: ["ios"],
  },
  {
    key: "controls.probe.hint", row: "the layout: one key per meaning",
    before: {"text":"When the cooling ends, I'll ask for one reading from the middle of the egg. From a single egg, that tells me how fast your eggs heat."}, after: {"text":"When the cooling ends, I'll ask for one reading from the middle of the egg. From a single egg, that tells me how fast your eggs heat."},
    appsBefore: ["web","ios"], appsAfter: ["ios"],
  },
  {
    key: "odds.why", row: "the owner, 27 September: wording rules",
    before: {"text":"Before your first egg I don't know your taste, your eggs or your pan, so I can't be sure, and this number starts low. Each egg you tell me about makes me surer, and the number goes up."}, after: {"text":"Before your first egg I don't know your taste, your eggs or your kitchen, so I can't be sure, and this number starts low. Each egg you tell me about makes me surer, and the number goes up."},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "advice.moreWater", row: "the owner, 27 September: wording rules",
    before: {"text":"Use more water. With the heat off, more water holds its heat for longer, so the time depends less on your pan."}, after: {"text":"Use more water. With the heat off, more water holds its heat for longer, so small differences in how fast it cools matter less."},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "odds.stillLearning", row: "the owner, 27 September: wording rules",
    before: {"text":"Still learning your kitchen"}, after: {"text":"I'm still learning"},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.literature", row: "the owner, 27 September: wording rules",
    before: {"text":"I haven't learned anything yet. I learn your pan when you time a boil, and your eggs when you tell me how one came out."}, after: {"text":"I haven't learned anything yet. I learn how fast your stove boils water when you tap the boil, and your eggs when you tell me how one came out."},
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: "learned.pan", row: "the owner, 27 September: wording rules",
    before: {"text":"your pan: about {time} to boil, based on history"}, after: {"text":"{water} of water takes about {time} to boil, based on history"},
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: "learned.confirm.title", row: "Kitchen: what I've learned, and Forget",
    before: {"text":"Forget what it learned?"}, after: {"text":"Forget what it learned?"},
    appsBefore: ["ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.confirm.forget", row: "Kitchen: what I've learned, and Forget",
    before: {"text":"Forget it"}, after: {"text":"Forget it"},
    appsBefore: ["ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.confirm.keep", row: "Kitchen: what I've learned, and Forget",
    before: {"text":"Keep it"}, after: {"text":"Keep it"},
    appsBefore: ["ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.confirm.message", row: "the owner, 27 September: wording rules",
    before: {"text":"Every egg and your pan's boil time are forgotten, and the times go back to where they started."}, after: {"text":"I forget every egg and how long your water takes to boil, and the times go back to where they started."},
    appsBefore: ["ios"], appsAfter: ["web","ios"],
  },
  {
    key: "feedback.invite", row: "the owner, 27 September: wording rules",
    before: {"text":"Your answers teach me your eggs and your pan."}, after: {"text":"Your answers teach me your eggs and your kitchen."},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "sousvide.subline", row: "the owner, 27 September: wording rules",
    before: {"text":"at {clock} — {duration} in the bath ({bath}), to eat now"}, after: {"text":"at {clock} — {duration} at {bath}, to eat now"},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "sousvide.warn", row: "the owner, 27 September: wording rules",
    before: {"text":"This bath ({bath}) is too cool to set the white, however long you leave it. I'm built for boiling water, and I'm not reliable below {floor}. Use the pan."}, after: {"text":"At {bath} the white won't set, however long you leave it. I'm built for boiling water, and I'm not reliable below {floor}. Use the pan."},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.sub.coldAssumes.info", row: "the (i)",
    before: null, after: {"text":"About this boil time"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "readout.sub.coldAssumes.more", row: "the (i)",
    before: null, after: {"text":"Each time you tap Full rolling boil on a cold-water start, I note how long the water took, and blend it half and half with what I had for that much water. I can't tell your pots apart, only how much water is in them. If I've never timed this much, I scale from the nearest amount I have. Tap the boil today and I'll correct the time while the eggs cook."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "action.hint.heating.info", row: "the (i)",
    before: null, after: {"text":"About the rolling boil"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "action.hint.heating.more", row: "the (i)",
    before: null, after: {"text":"A full rolling boil is when the whole surface is heaving and stirring doesn't calm it, not the first bubbles at the edge. The rest of the cook is timed from your tap, and it teaches me how fast your stove boils water, so a few seconds either way is fine, but a minute early isn't. Until you tap, the countdown is my guess."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.egg.more", row: "the (i)",
    before: null, after: {"text":"The heat has to reach the middle of the egg, and a bigger egg's middle is further from the water. A size from the box covers eggs of quite different weights, so if you have kitchen scales, weigh one and type the weight in, and I'll use that instead of the box."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.eggFrom.more", row: "the (i)",
    before: null, after: {"text":"A fridge keeps its eggs at much the same temperature every day, so I know where a fridge egg starts. A room can be a few degrees warmer or cooler than I assume, and every degree moves the time a little. If you know better, pick Custom and tell me. An egg that has been sitting out is at room temperature, so it also tells me how warm your kitchen is, which matters when the eggs rest on the counter or the heat goes off."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.start.more", row: "the (i)",
    before: null, after: {"text":"Boiling water: lower the eggs into water that's already at a full boil, and the clock starts as they go in. They peel more easily. Cold water: eggs in a cold pan, heat on, and you tap when it boils, which teaches me how fast your stove boils water. They're done sooner, counting the wait for the boil. Sous-vide: I'll tell you when you should have started. It's usually a while ago."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.afterTheBoil.more", row: "the (i)",
    before: null, after: {"text":"Keep boiling: the burner holds the water at a full boil until the eggs come out, and how much water there is hardly matters. Heat off, lid on: once the eggs are in boiling water, turn the burner off, put the lid on, and the hot water finishes the eggs as it cools. That saves energy, but the water is doing all the work, so how much there is decides the time, and with too little it can't finish the job. Measure it if you choose this."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.cooling", row: "the layout: one key per meaning",
    before: null, after: {"text":"Cooling"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.cooling.more", row: "the (i)",
    before: null, after: {"text":"When the eggs come out, the heat in the white keeps moving inward, and the yolk goes on cooking for a few minutes. Ice water takes the heat away fastest, so it stops that soonest and lets me offer the softest yolks; a cold tap is nearly as good. Still air barely takes heat away at all: to a hot egg on the counter it is less a way of cooling than a lid. I allow for that, but it rules out the softest yolks, and how much more the yolk cooks is hard to predict."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.water.more", row: "the (i)",
    before: null, after: {"text":"How much water goes in the pan, not counting the eggs. It matters most with the heat off, when the water's own heat does the cooking: more water holds its heat longer. It matters a little with the heat on, because cold eggs going into boiling water cool a little water more than a lot. And I remember how long it takes to boil each amount you use, so it's worth measuring."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.eggsInPan.more", row: "the (i)",
    before: null, after: {"text":"How many eggs go in together. Cold eggs take heat out of boiling water as they go in, and more eggs take more, so the water takes longer to recover, or with the heat off never does. For eggs that start in cold water it makes no difference to my sums: you tap when the water boils, and that already counts them."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.altitude.more", row: "the (i)",
    before: null, after: {"text":"Higher up, the air presses down less, so water boils cooler, and cooler water cooks more slowly. It adds up: a kitchen up a mountain needs noticeably longer than one by the sea. Tell me roughly how high you are, and I'll cook at the boiling point shown here."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.link", row: "Help",
    before: null, after: {"text":"Help"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.title", row: "Help",
    before: null, after: {"text":"Help"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.how.title", row: "Help",
    before: null, after: {"text":"How I work"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.how.p1", row: "Help",
    before: null, after: {"text":"I don't use a table of minutes. I work out how heat moves from the water into the egg, layer by layer, from the shell to the middle of the yolk, using the size you give me, where the egg starts, and how hot your water boils where you live."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.how.p2", row: "Help",
    before: null, after: {"text":"Egg proteins don't set at one temperature. They set with heat and time together: a yolk held a little cooler for a little longer ends up much like one held hotter for less. So I add up the heat and time the middle of the yolk gets, and stop when it has had what your doneness asks for, as long as the white has set too."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.how.p3", row: "Help",
    before: null, after: {"text":"The cooling is part of the cook. When the egg comes out, the heat already in the white keeps flowing inward, and the yolk goes on cooking for a few minutes. I count that in, which is why I ask how you cool your eggs, and why the countdown carries on after they're out: it ends when the middle of the yolk stops warming."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.learn.title", row: "Help",
    before: null, after: {"text":"What I learn, and from what"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.learn.p1", row: "Help",
    before: null, after: {"text":"At first I know only what's true of eggs in general. Each egg you tell me about teaches me about yours. I keep what I learn in this browser and nowhere else, so another browser, or clearing this site's data, starts me again from scratch."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.learn.p2", row: "Help",
    before: null, after: {"text":"\"How was the yolk?\" teaches me your taste: what you mean by just right. \"And the white?\" teaches me how your whites set, which the yolk alone can't. Either answer also tells me how fast heat gets into your eggs, a number that quietly covers a lot: the eggs themselves, how hard your water really boils, a fridge that runs warm."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.learn.p3", row: "Help",
    before: null, after: {"text":"A probe reading is the quickest teacher: one number from the middle of one yolk tells me how fast heat gets into your eggs. Tapping Full rolling boil on a cold-water start teaches me how long your water takes to boil, for that much water. And only eggs rested on the counter teach me how fast the counter cools them."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.learn.p4", row: "Help",
    before: null, after: {"text":"Every question is optional. An egg you say nothing about teaches me nothing, but it costs nothing either. If I've learned something wrong, a few more eggs wash it out; Forget, on the Kitchen page, starts me again."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.title", row: "Help",
    before: null, after: {"text":"Getting reliable eggs"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.intro", row: "Help",
    before: null, after: {"text":"The biggest lever is time: tell me how each egg came out, and my times close in on yours. The rest depends on how you cook."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.forYou", row: "Help",
    before: null, after: {"text":"For the eggs you've set up now"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.every.title", row: "Help",
    before: null, after: {"text":"Whichever way you cook"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.every", row: "Help",
    before: null, after: {"text":"Weigh the egg. A size from the box covers eggs that need quite different times, and size matters in every method. Use eggs straight from the fridge: I know how cold a fridge is, and I have to guess at a room."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.hot.title", row: "Help",
    before: null, after: {"text":"Into boiling water"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.hot", row: "Help",
    before: null, after: {"text":"The simplest to get right. Lower the eggs into water at a full rolling boil and keep it there. Cold eggs cool the water a little as they go in, and more water cools less, but with the heat on it soon recovers, so the amount hardly matters."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.cold.title", row: "Help",
    before: null, after: {"text":"Into cold water"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.cold", row: "Help",
    before: null, after: {"text":"Eggs in the pan, cold water, lid on, heat on, and tap Full rolling boil when the whole surface rolls. The first time, I guess how long that takes; after that I remember, for that much water. Tap when it truly rolls: the rest of the cook is timed from your tap."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.heatOff.title", row: "Help",
    before: null, after: {"text":"Heat off, lid on"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.heatOff", row: "Help",
    before: null, after: {"text":"The water does all the cooking, so how much of it there is matters more than anything else. Measure it, and use more rather than less: more water holds its heat longer, and small differences in how fast it cools matter less. With too little, I'll tell you I can't finish the job."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.cooling.title", row: "Help",
    before: null, after: {"text":"Ice, tap or counter"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.reliable.cooling", row: "Help",
    before: null, after: {"text":"This matters most for soft eggs. Ice water stops the yolk soonest and most predictably. A cold tap is nearly as good, as long as it keeps running. On the counter the yolk keeps cooking for longer than you'd think, by an amount that is hard to predict, so the softest yolks are out of reach there. For a hard egg, the counter is fine."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.odds.title", row: "Help",
    before: null, after: {"text":"How sure I am"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.odds.p1", row: "Help",
    before: null, after: {"text":"No egg timer can promise the egg you pictured, and neither can I. What I can tell you is which way it's likely to go wrong, if it does: softer or firmer than you like. The bracket under the doneness slider shows the range your yolk will probably land in. The narrower it is, the surer I am, and it narrows with every egg you tell me about."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.odds.p2", row: "Help",
    before: null, after: {"text":"Behind that is a number, such as 7/10: how often I expect an egg cooked this way to come out as you asked, with the white set and the yolk just right by your own answer. It starts low, around 2/10, because before your first egg I don't know your taste, your eggs or how hard your water really boils. The time I give is the one with the best odds, which isn't always my average guess."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.odds.p3", row: "Help",
    before: null, after: {"text":"The shading on the doneness slider follows the same odds: the stronger it is, the more often that doneness comes out right. Once I get any doneness right at least 3 times in 10, I stop offering the ones I'd get right less often."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.unsure.title", row: "Help",
    before: null, after: {"text":"Where I'm unsure"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.unsure.counter", row: "Help",
    before: null, after: {"text":"The counter. How fast an egg cools in still air is the least measured number I use: nobody seems to have published the middle of a hot egg after it leaves the water. I start from the physics, and I learn it only from eggs you rest on the counter."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.unsure.heatOff", row: "Help",
    before: null, after: {"text":"Heat off. I work out how fast the water cools from how much there is, assuming an ordinary pan with its lid on. A wide shallow pan, a heavy pot or a missing lid will cool differently, and I won't know until you tell me how the eggs came out."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.unsure.white", row: "Help",
    before: null, after: {"text":"Whites. A white that sets late and a cook who calls a tender white runny look the same to me, so I learn one number for both."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.unsure.sousVide", row: "Help",
    before: null, after: {"text":"Sous-vide. Below {floor} the white stays liquid and moves about inside the shell, which my sums leave out, so I'm not reliable there. The long answer is real, though: at those temperatures the white takes the better part of a day to set."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.sources.title", row: "Help",
    before: null, after: {"text":"Sources"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.sources.intro", row: "Help",
    before: null, after: {"text":"The main sources behind my sums. The project's README lists them all, with what each one settled."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.source.williams", row: "Help",
    before: null, after: {"text":"C. D. H. Williams, \"The Science of Boiling an Egg\", University of Exeter (1998). newton.ex.ac.uk/teaching/CDHW/egg (the host is gone; the page is in the Internet Archive)"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.source.buay", row: "Help",
    before: null, after: {"text":"D. Buay, S. K. Foong, D. Kiang, L. Kuppan and V. H. Liew, \"How long does it take to boil an egg? Revisited\", European Journal of Physics 27, 119-131 (2006). doi:10.1088/0143-0807/27/1/013"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.source.abbasnezhad", row: "Help",
    before: null, after: {"text":"B. Abbasnezhad, N. Hamdami, J.-Y. Monteau and H. Vatankhah, \"Numerical modeling of heat transfer and pasteurizing value during thermal processing of intact egg\", Food Science & Nutrition 4, 42-49 (2016). doi:10.1002/fsn3.257"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.source.denys", row: "Help",
    before: null, after: {"text":"S. Denys, J. G. Pieters and K. Dewettinck, \"Computational fluid dynamics analysis of combined conductive and convective heat transfer in model eggs\", Journal of Food Engineering 63, 281-290 (2004). doi:10.1016/j.jfoodeng.2003.06.002"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.source.vega", row: "Help",
    before: null, after: {"text":"C. Vega and R. Mercadé-Prieto, \"Culinary Biophysics: on the Nature of the 6X °C Egg\", Food Biophysics 6, 152-159 (2011). doi:10.1007/s11483-010-9200-1"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.source.weijers", row: "Help",
    before: null, after: {"text":"M. Weijers, P. A. Barneveld, M. A. Cohen Stuart and R. W. Visschers, \"Heat-induced denaturation and aggregation of ovalbumin at neutral pH described by irreversible first-order kinetics\", Protein Science 12, 2693-2703 (2003). doi:10.1110/ps.03242803"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.source.hoyt", row: "Help",
    before: null, after: {"text":"D. F. Hoyt, \"Practical methods of estimating volume and fresh weight of bird eggs\", The Auk 96, 73-77 (1979)."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "help.source.usda", row: "Help",
    before: null, after: {"text":"USDA Food Safety and Inspection Service, \"High Altitude Cooking\"."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "nav.back", row: "the layout: one key per meaning",
    before: null, after: {"text":"Back"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "learned.title", row: "Kitchen: what I've learned, and Forget",
    before: null, after: {"text":"What I've learned"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "more.about", row: "the (i)",
    before: null, after: {"text":"About {label}"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.sentence", row: "the setup sentence",
    before: null, after: {"text":"{egg} {from}, {start}, {cooling}."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.sentenceSousVide", row: "the setup sentence",
    before: null, after: {"text":"{egg}, {start}."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.egg", row: "the setup sentence",
    before: null, after: {"text":"{mass} eggs"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.from.fridge", row: "the setup sentence",
    before: null, after: {"text":"from the fridge"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.from.room", row: "the setup sentence",
    before: null, after: {"text":"at room temperature"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.from.custom", row: "the setup sentence",
    before: null, after: {"text":"at {temp}"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.start.cold", row: "the setup sentence",
    before: null, after: {"text":"into cold water"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.start.hot", row: "the setup sentence",
    before: null, after: {"text":"into boiling water"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.start.sous", row: "the setup sentence",
    before: null, after: {"text":"sous-vide at {bath}"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.cooling.ice", row: "the setup sentence",
    before: null, after: {"text":"then an ice bath"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.cooling.tap", row: "the setup sentence",
    before: null, after: {"text":"then under a cold tap"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.cooling.counter", row: "the setup sentence",
    before: null, after: {"text":"then onto the counter"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.clause", row: "the setup sentence",
    before: null, after: {"text":"{label}: {value}, change"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "setup.close", row: "the setup sentence",
    before: null, after: {"text":"Done"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "idle.welcome", row: "the slot: a first-egg welcome",
    before: null, after: {"text":"Our first egg together. Until you tell me how one comes out, I go by what's true of eggs in general, not yours. Afterwards, answer the two questions and I'll start learning your eggs and your kitchen."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.units.more", row: "the (i)",
    before: null, after: {"text":"Metric or Imperial, for every number I show and every number you type. I start with what's usual where your browser says you are. Switching changes only how I write the numbers: the egg and the times stay exactly the same, and the eggs don't mind which."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.thermometer", row: "the layout: one key per meaning",
    before: null, after: {"text":"Probe thermometer"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "controls.thermometer.more", row: "the (i)",
    before: null, after: {"text":"If you have a probe thermometer, I'll ask for one reading when the cooling countdown ends. That's the moment the middle of the yolk is at its warmest, so push the tip to the very middle and tell me the highest number you see: anywhere else, or any later, reads lower. From that single egg I learn how fast heat gets into your eggs. I don't ask when the eggs rest on the counter, because nothing is counted down."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "odds.stillLearning.info", row: "the (i)",
    before: null, after: {"text":"About what I'm learning"},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "odds.stillLearning.more", row: "the (i)",
    before: null, after: {"text":"My time for this egg could still be out by more than I'd like. I learn your taste in yolks from how you say they came out, how your whites set from the second question, how fast heat gets into your eggs from both, and how long your water takes to boil when you tap the boil. Answer both questions after each egg, and if you have a probe thermometer, give me a reading: that is the quickest teacher."},
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: "learned.forget.more", row: "the (i)",
    before: null, after: {"text":"This forgets every egg you've told me about and every boil you've timed, and I go back to what's true of eggs in general. You don't need it to undo a wrong answer or two: they wash out after a few more eggs. It's for a new stove, a new kitchen, or a fresh start."},
    appsBefore: [], appsAfter: ["web"],
  },
];

export const redesign: Draft = {
  base: '80799d0',
  rows: REDESIGN_DRAFT,
  exampleOnly: {
    'spoken.sousVide': 'its example quotes sousvide.subline, whose wording changed',
    'learned.both': 'its example quotes learned.pan, whose wording changed',
    'advice.toggle': 'its note: on the web it now links to Help instead of opening the advice in place',
  },
};
