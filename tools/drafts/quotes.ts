/**
 * The `quotes` draft: every string a reader sees is set with curly
 * apostrophes and quotes (’ ‘ “ ”), never straight ones (`DECISIONS.md` 56,
 * the owner, 3 October 2026), on `3e5f5f5`, both apps. Mechanical: an
 * apostrophe, or a quote that closes, is ’; a quote that opens (after a
 * space, a bracket or the start) is ‘ or “; nothing else in any row changes.
 * The source titles in Help lose their straight double quotes the same way.
 *
 * Beyond the rows: the 1750 twins and copy/en-US.json are set the same way
 * (each American entry's `base` with it, so it still matches the English);
 * the notes, which no cook reads, have their apostrophes curled to match the
 * owner's own edits, and keep their straight double quotes, which delimit
 * examples; and outside the catalogue, the web page's preview description
 * and the privacy page's text. `copy.test.ts` 3c keeps straight quotes out
 * of every catalogue and both pages from now on.
 */

import type { Draft, Drafted } from '../copyDraft.js';

const QUOTES_DRAFT: Drafted[] = [
  {
    key: "readout.sub.coldAssumes", row: "apostrophes",
    before: { text: "about {boil} to boil, from what I've timed before" },
    after: { text: "about {boil} to boil, from what I’ve timed before" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.sub.coldAssumes.more", row: "apostrophes",
    before: { text: "It's how long this much water has taken to boil before, timed from your taps. For an amount I haven't timed, I scale from the nearest one I have. Tap Full rolling boil today and I'll correct the time while the eggs cook." },
    after: { text: "It’s how long this much water has taken to boil before, timed from your taps. For an amount I haven’t timed, I scale from the nearest one I have. Tap Full rolling boil today and I’ll correct the time while the eggs cook." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "readout.alarm.failed", row: "apostrophes",
    before: { text: "I couldn't set the alarm, so keep the app open" },
    after: { text: "I couldn’t set the alarm, so keep the app open" },
    appsBefore: ["ios"], appsAfter: ["ios"],
  },
  {
    key: "readout.restored", row: "apostrophes",
    before: { text: "After the reload the times are still right, but I can't sound the alarm, so watch the clock." },
    after: { text: "After the reload the times are still right, but I can’t sound the alarm, so watch the clock." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: "refusal.tap", row: "apostrophes",
    before: { text: "A cold tap doesn't cool the egg fast enough to stop the yolk cooking. Softest possible: {limit}. For a slightly softer yolk, use an ice bath." },
    after: { text: "A cold tap doesn’t cool the egg fast enough to stop the yolk cooking. Softest possible: {limit}. For a slightly softer yolk, use an ice bath." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "action.pulled.ice", row: "apostrophes",
    before: { text: "They're in the ice bath" },
    after: { text: "They’re in the ice bath" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "action.pulled.tap", row: "apostrophes",
    before: { text: "They're under the tap" },
    after: { text: "They’re under the tap" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "action.pulled.counter", row: "apostrophes",
    before: { text: "They're out" },
    after: { text: "They’re out" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "action.hint.heating.more", row: "apostrophes",
    before: { text: "Tap Full rolling boil when the whole surface is bubbling hard and stirring doesn't calm it. The first bubbles are too soon. I time the rest of the cook from your tap, and tapping a minute early leaves the eggs underdone. Until you tap, the countdown is my guess." },
    after: { text: "Tap Full rolling boil when the whole surface is bubbling hard and stirring doesn’t calm it. The first bubbles are too soon. I time the rest of the cook from your tap, and tapping a minute early leaves the eggs underdone. Until you tap, the countdown is my guess." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.eggFrom.more", row: "apostrophes",
    before: { text: "Eggs from the fridge give the most reliable times, because a fridge stays at much the same temperature every day, and a room doesn't." },
    after: { text: "Eggs from the fridge give the most reliable times, because a fridge stays at much the same temperature every day, and a room doesn’t." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.start.more", row: "apostrophes",
    before: { text: "Boiling water: lower the eggs into water at a full boil. They peel more easily this way. Cold water: put the eggs in a cold pan, turn the heat on, and tap Full rolling boil when the water rolls. This is quicker overall. Sous-vide: I'll tell you how long the eggs need in the water. It's usually many hours, so plan ahead." },
    after: { text: "Boiling water: lower the eggs into water at a full boil. They peel more easily this way. Cold water: put the eggs in a cold pan, turn the heat on, and tap Full rolling boil when the water rolls. This is quicker overall. Sous-vide: I’ll tell you how long the eggs need in the water. It’s usually many hours, so plan ahead." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.afterTheBoil.more", row: "apostrophes",
    before: { text: "Keep boiling: keep the water at a full boil until the eggs come out. The amount of water hardly matters. Heat off, lid on: once the eggs are in, turn the heat off and the hot water continues to cook the eggs. This saves energy, but the time depends on how much water there is, so measure it. With too little water the eggs won't cook through." },
    after: { text: "Keep boiling: keep the water at a full boil until the eggs come out. The amount of water hardly matters. Heat off, lid on: once the eggs are in, turn the heat off and the hot water continues to cook the eggs. This saves energy, but the time depends on how much water there is, so measure it. With too little water the eggs won’t cook through." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.cooling.more", row: "apostrophes",
    before: { text: "The yolk keeps cooking for a few minutes after the eggs come out of the water. An ice bath stops it fastest, so it allows the softest yolks, and a cold tap is nearly as good. On the bench the egg cools so slowly that the softest yolks aren't possible, and the result varies more." },
    after: { text: "The yolk keeps cooking for a few minutes after the eggs come out of the water. An ice bath stops it fastest, so it allows the softest yolks, and a cold tap is nearly as good. On the bench the egg cools so slowly that the softest yolks aren’t possible, and the result varies more." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.water.more", row: "apostrophes",
    before: { text: "How much water is in the pan, not counting the eggs. It matters most with the heat off, because then the hot water alone cooks the eggs. With the heat on it matters less. I also remember how long each amount takes to boil, so it's worth measuring." },
    after: { text: "How much water is in the pan, not counting the eggs. It matters most with the heat off, because then the hot water alone cooks the eggs. With the heat on it matters less. I also remember how long each amount takes to boil, so it’s worth measuring." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.eggsInPan.more", row: "apostrophes",
    before: { text: "The more cold eggs you put in, the more they cool the water, so they take longer to cook. On a cold-water start I don't need this, because your tap at the boil already accounts for them." },
    after: { text: "The more cold eggs you put in, the more they cool the water, so they take longer to cook. On a cold-water start I don’t need this, because your tap at the boil already accounts for them." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.altitude.more", row: "apostrophes",
    before: { text: "The higher you are, the lower the temperature water boils at, so eggs take longer to cook, especially in the mountains. Tell me roughly how high you are and I'll use the boiling point shown." },
    after: { text: "The higher you are, the lower the temperature water boils at, so eggs take longer to cook, especially in the mountains. Tell me roughly how high you are and I’ll use the boiling point shown." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.learn.p1", row: "apostrophes",
    before: { text: "Your answers tell me how you like your yolk and how your eggs cook. When you tap Full rolling boil, I learn how long your water takes to boil. A probe reading, if you take one, tells me how fast heat gets into your eggs. You don't have to answer anything." },
    after: { text: "Your answers tell me how you like your yolk and how your eggs cook. When you tap Full rolling boil, I learn how long your water takes to boil. A probe reading, if you take one, tells me how fast heat gets into your eggs. You don’t have to answer anything." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.learn.aside", row: "apostrophes",
    before: { text: "I use [sequential Monte Carlo](https://en.wikipedia.org/wiki/Particle_filter) to learn about your eggs and your taste, with an [ordered probit](https://en.wikipedia.org/wiki/Ordered_probit) for too soft, just right and too firm. I keep a record of every egg, so when I'm updated, I relearn from all of them. [The design](https://github.com/danmackinlay/actual_egg_timer/blob/main/INFERENCE.md)." },
    after: { text: "I use [sequential Monte Carlo](https://en.wikipedia.org/wiki/Particle_filter) to learn about your eggs and your taste, with an [ordered probit](https://en.wikipedia.org/wiki/Ordered_probit) for too soft, just right and too firm. I keep a record of every egg, so when I’m updated, I relearn from all of them. [The design](https://github.com/danmackinlay/actual_egg_timer/blob/main/INFERENCE.md)." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.reliable.forYou", row: "apostrophes",
    before: { text: "For the eggs you've set up now" },
    after: { text: "For the eggs you’ve set up now" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.unsure.title", row: "apostrophes",
    before: { text: "Where I'm unsure" },
    after: { text: "Where I’m unsure" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.unsure.counter", row: "apostrophes",
    before: { text: "I'm least sure about cooling on the bench, because I couldn't find any published measurements of how fast an egg cools in still air." },
    after: { text: "I’m least sure about cooling on the bench, because I couldn’t find any published measurements of how fast an egg cools in still air." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.unsure.white", row: "apostrophes",
    before: { text: "When you say a white was runny, I can't tell whether it set late or whether you call a tender white runny." },
    after: { text: "When you say a white was runny, I can’t tell whether it set late or whether you call a tender white runny." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.unsure.sousVide", row: "apostrophes",
    before: { text: "Below {floor}, a sous-vide white stays liquid and moves around inside the shell. I don't account for that, so my times are unreliable there. At those temperatures I estimate the white takes hours or even days to set, if it sets at all." },
    after: { text: "Below {floor}, a sous-vide white stays liquid and moves around inside the shell. I don’t account for that, so my times are unreliable there. At those temperatures I estimate the white takes hours or even days to set, if it sets at all." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.source.williams", row: "source titles",
    before: { text: "C. D. H. Williams, \"The Science of Boiling an Egg\", University of Exeter (1998). newton.ex.ac.uk/teaching/CDHW/egg (the host is gone; the page is in the Internet Archive)" },
    after: { text: "C. D. H. Williams, “The Science of Boiling an Egg”, University of Exeter (1998). newton.ex.ac.uk/teaching/CDHW/egg (the host is gone; the page is in the Internet Archive)" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.source.buay", row: "source titles",
    before: { text: "D. Buay, S. K. Foong, D. Kiang, L. Kuppan and V. H. Liew, \"How long does it take to boil an egg? Revisited\", European Journal of Physics 27, 119-131 (2006). doi:10.1088/0143-0807/27/1/013" },
    after: { text: "D. Buay, S. K. Foong, D. Kiang, L. Kuppan and V. H. Liew, “How long does it take to boil an egg? Revisited”, European Journal of Physics 27, 119-131 (2006). doi:10.1088/0143-0807/27/1/013" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.source.abbasnezhad", row: "source titles",
    before: { text: "B. Abbasnezhad, N. Hamdami, J.-Y. Monteau and H. Vatankhah, \"Numerical modeling of heat transfer and pasteurizing value during thermal processing of intact egg\", Food Science & Nutrition 4, 42-49 (2016). doi:10.1002/fsn3.257" },
    after: { text: "B. Abbasnezhad, N. Hamdami, J.-Y. Monteau and H. Vatankhah, “Numerical modeling of heat transfer and pasteurizing value during thermal processing of intact egg”, Food Science & Nutrition 4, 42-49 (2016). doi:10.1002/fsn3.257" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.source.denys", row: "source titles",
    before: { text: "S. Denys, J. G. Pieters and K. Dewettinck, \"Computational fluid dynamics analysis of combined conductive and convective heat transfer in model eggs\", Journal of Food Engineering 63, 281-290 (2004). doi:10.1016/j.jfoodeng.2003.06.002" },
    after: { text: "S. Denys, J. G. Pieters and K. Dewettinck, “Computational fluid dynamics analysis of combined conductive and convective heat transfer in model eggs”, Journal of Food Engineering 63, 281-290 (2004). doi:10.1016/j.jfoodeng.2003.06.002" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.source.vega", row: "source titles",
    before: { text: "C. Vega and R. Mercadé-Prieto, \"Culinary Biophysics: on the Nature of the 6X °C Egg\", Food Biophysics 6, 152-159 (2011). doi:10.1007/s11483-010-9200-1" },
    after: { text: "C. Vega and R. Mercadé-Prieto, “Culinary Biophysics: on the Nature of the 6X °C Egg”, Food Biophysics 6, 152-159 (2011). doi:10.1007/s11483-010-9200-1" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.source.weijers", row: "source titles",
    before: { text: "M. Weijers, P. A. Barneveld, M. A. Cohen Stuart and R. W. Visschers, \"Heat-induced denaturation and aggregation of ovalbumin at neutral pH described by irreversible first-order kinetics\", Protein Science 12, 2693-2703 (2003). doi:10.1110/ps.03242803" },
    after: { text: "M. Weijers, P. A. Barneveld, M. A. Cohen Stuart and R. W. Visschers, “Heat-induced denaturation and aggregation of ovalbumin at neutral pH described by irreversible first-order kinetics”, Protein Science 12, 2693-2703 (2003). doi:10.1110/ps.03242803" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.source.hoyt", row: "source titles",
    before: { text: "D. F. Hoyt, \"Practical methods of estimating volume and fresh weight of bird eggs\", The Auk 96, 73-77 (1979)." },
    after: { text: "D. F. Hoyt, “Practical methods of estimating volume and fresh weight of bird eggs”, The Auk 96, 73-77 (1979)." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.source.usda", row: "source titles",
    before: { text: "USDA Food Safety and Inspection Service, \"High Altitude Cooking\"." },
    after: { text: "USDA Food Safety and Inspection Service, “High Altitude Cooking”." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.title", row: "apostrophes",
    before: { text: "What I've learned" },
    after: { text: "What I’ve learned" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.units.more", row: "apostrophes",
    before: { text: "I start with what's usual where your browser says you are." },
    after: { text: "I start with what’s usual where your browser says you are." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: "controls.units.more.ios", row: "apostrophes",
    before: { text: "I start with what's usual where your phone says you are." },
    after: { text: "I start with what’s usual where your phone says you are." },
    appsBefore: ["ios"], appsAfter: ["ios"],
  },
  {
    key: "controls.thermometer.more", row: "apostrophes",
    before: { text: "When the cooling countdown ends, the middle of the yolk is at its hottest, and I'll ask you for a reading. Push the tip right into the middle and tell me the highest number you see. Anywhere else, or any later, will read too low. The reading tells me how fast heat gets into your eggs. If you cool the eggs on the bench there's no countdown, so I won't ask." },
    after: { text: "When the cooling countdown ends, the middle of the yolk is at its hottest, and I’ll ask you for a reading. Push the tip right into the middle and tell me the highest number you see. Anywhere else, or any later, will read too low. The reading tells me how fast heat gets into your eggs. If you cool the eggs on the bench there’s no countdown, so I won’t ask." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "outcome.unsure", row: "apostrophes",
    before: { text: "It could come out too soft or too firm. I can't tell yet." },
    after: { text: "It could come out too soft or too firm. I can’t tell yet." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "outcome.bracket", row: "apostrophes",
    before: { text: "The bracket under the slider shows the range your yolk will probably fall in. If you'd rather not risk a soft yolk, slide right until the left end of the bracket is somewhere you'd be happy with. If you'd rather not risk a firm one, slide left until the right end is." },
    after: { text: "The bracket under the slider shows the range your yolk will probably fall in. If you’d rather not risk a soft yolk, slide right until the left end of the bracket is somewhere you’d be happy with. If you’d rather not risk a firm one, slide left until the right end is." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "outcome.why", row: "apostrophes",
    before: { text: "At first I don't know your taste, your eggs or your kitchen, so the bracket starts wide. It narrows with each egg you tell me about." },
    after: { text: "At first I don’t know your taste, your eggs or your kitchen, so the bracket starts wide. It narrows with each egg you tell me about." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "advice.ice", row: "apostrophes",
    before: { text: "Cool the eggs in an ice bath. On the bench it's hard to say how much more the yolk will cook." },
    after: { text: "Cool the eggs in an ice bath. On the bench it’s hard to say how much more the yolk will cook." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.literature", row: "apostrophes",
    before: { text: "I haven't learned anything yet. Tell me how each egg came out, and on a cold-water start, when the water reaches a full rolling boil." },
    after: { text: "I haven’t learned anything yet. Tell me how each egg came out, and on a cold-water start, when the water reaches a full rolling boil." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.forget.more", row: "apostrophes",
    before: { text: "I forget every egg you've told me about and every boil you've timed, and go back to the times for a typical egg. A wrong answer or two will wash out after a few more eggs, so you only need this for a new stove or a new kitchen." },
    after: { text: "I forget every egg you’ve told me about and every boil you’ve timed, and go back to the times for a typical egg. A wrong answer or two will wash out after a few more eggs, so you only need this for a new stove or a new kitchen." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.confirm.message", row: "apostrophes",
    before: { text: "I'll forget every egg and every boil, and go back to the times for a typical egg." },
    after: { text: "I’ll forget every egg and every boil, and go back to the times for a typical egg." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "feedback.thanks", row: "apostrophes",
    before: { text: "Thanks. I'll use that next time." },
    after: { text: "Thanks. I’ll use that next time." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "probe.refused", row: "apostrophes",
    before: { text: "That's not what I'd expect from the middle of this egg, which should read {low} to {high}. Is the tip in the yolk?" },
    after: { text: "That’s not what I’d expect from the middle of this egg, which should read {low} to {high}. Is the tip in the yolk?" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "sousvide.warn", row: "apostrophes",
    before: { text: "At {bath} the white takes most of a day to set, if it sets at all. My times aren't reliable below {floor}, so boil the eggs instead." },
    after: { text: "At {bath} the white takes most of a day to set, if it sets at all. My times aren’t reliable below {floor}, so boil the eggs instead." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "sousvide.hint", row: "apostrophes",
    before: { text: "nothing to start, and you're {duration} late" },
    after: { text: "nothing to start, and you’re {duration} late" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.language.more", row: "apostrophes",
    before: { text: "English (1750) is English as Samuel Johnson wrote it. I switch to it when you pick Imperial, and back when you pick Metric. Pick English to keep Imperial in today's English." },
    after: { text: "English (1750) is English as Samuel Johnson wrote it. I switch to it when you pick Imperial, and back when you pick Metric. Pick English to keep Imperial in today’s English." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
];

export const quotes: Draft = {
  base: '3e5f5f5',
  rows: QUOTES_DRAFT,
  exampleOnly: {
    "readout.sub.coolingPeak": "an apostrophe in the note, made curly",
    "readout.alarm.set": "an apostrophe in the note, made curly",
    "controls.doneness.value": "an apostrophe in the note, made curly",
    "controls.doneness.valueBath": "an apostrophe in the note, made curly",
    "controls.doneness.peak": "an apostrophe in the note, made curly",
    "controls.doneness.bath": "an apostrophe in the note, made curly",
    "controls.settings": "an apostrophe in the note, made curly",
    "help.motto": "an apostrophe in the note, made curly",
    "more.about": "an apostrophe in the note, made curly",
    "more.expanded": "an apostrophe in the note, made curly",
    "more.collapsed": "an apostrophe in the note, made curly",
    "setup.egg": "an apostrophe in the note, made curly",
    "setup.start.coldStanding": "an apostrophe in the note, made curly",
    "setup.start.hotStanding": "an apostrophe in the note, made curly",
    "setup.clause": "an apostrophe in the note, made curly",
    "outcome.learning": "an apostrophe in the note, made curly",
    "sousvide.subline": "an apostrophe in the note, made curly",
    "language.en": "an apostrophe in the note, made curly",
    "app.titlePage": "an apostrophe in the note, made curly",
    "alarm.pull.bodyIce": "an apostrophe in the note, made curly",
    "alarm.pull.bodyTap": "an apostrophe in the note, made curly",
    "activity.stage.pull": "an apostrophe in the note, made curly",
  },
};
