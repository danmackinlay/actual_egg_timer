/**
 * The `help` draft: Help's sections as a short gist and a technical aside, on
 * `9116d33`.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

/** 27 September, the owner: Help had the right shape but belaboured,
 *  contrived text. Each section is now a short gist, then a smaller technical
 *  aside with links (Wikipedia for methods, the README and INFERENCE.md). */
const HELP_DRAFT: Drafted[] = [
  {
    key: 'help.how.aside', row: 'Help: gist first, then a technical aside',
    before: null, after: { text: "Technically: [heat conduction](https://en.wikipedia.org/wiki/Heat_equation) through a sphere the size of your egg, and protein setting as a dose of heat over time, from the [Arrhenius equation](https://en.wikipedia.org/wiki/Arrhenius_equation). Every constant, with its source, is in the [README](https://github.com/danmackinlay/actual_egg_timer#2-the-physical-model)." },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'help.how.aside2', row: 'Help: gist first, then a technical aside',
    before: null, after: { text: "On the counter, still air takes heat out so slowly that the yolk ends up within a fraction of a degree of where it would if the egg never cooled at all. [README §5](https://github.com/danmackinlay/actual_egg_timer#5-carryover-the-cooling-step-is-part-of-the-recipe)." },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'help.how.p1', row: 'Help: gist first, then a technical aside',
    before: { text: "I don't use a table of minutes. I work out how heat moves from the water into the egg, layer by layer, from the shell to the middle of the yolk, using the size you give me, where the egg starts, and how hot your water boils where you live." }, after: { text: "I don't use a rule of thumb. I work out how heat soaks into your egg from the water, and how far the yolk and the white set on the way, then pick the time that stops the yolk where you asked." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.how.p2', row: 'Help: gist first, then a technical aside',
    before: { text: "Egg proteins don't set at one temperature. They set with heat and time together: a yolk held a little cooler for a little longer ends up much like one held hotter for less. So I add up the heat and time the middle of the yolk gets, and stop when it has had what your doneness asks for, as long as the white has set too." }, after: { text: "The cooling counts too. An egg out of the water keeps cooking from the inside for a few minutes. Ice water stops that soonest; the counter barely slows it." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.how.p3', row: 'Help: gist first, then a technical aside',
    before: { text: "The cooling is part of the cook. When the egg comes out, the heat already in the white keeps flowing inward, and the yolk goes on cooking for a few minutes. I count that in, which is why I ask how you cool your eggs, and why the countdown carries on after they're out: it ends when the middle of the yolk stops warming." }, after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: 'help.learn.aside', row: 'Help: gist first, then a technical aside',
    before: null, after: { text: "I keep a cloud of guesses about your eggs and your taste, and each answer reweights them: [sequential Monte Carlo](https://en.wikipedia.org/wiki/Particle_filter), with an [ordered probit](https://en.wikipedia.org/wiki/Ordered_probit) for too soft, just right or too firm. I keep every egg, so when I improve, I relearn from all of them. [The design](https://github.com/danmackinlay/actual_egg_timer/blob/main/INFERENCE.md)." },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'help.learn.p1', row: 'Help: gist first, then a technical aside',
    before: { text: "At first I know only what's true of eggs in general. Each egg you tell me about teaches me about yours. I keep what I learn in this browser and nowhere else, so another browser, or clearing this site's data, starts me again from scratch." }, after: { text: "Your answers teach me three things: how you like your yolk, how your eggs' whites behave, and how fast your stove boils water. A probe reading teaches me how fast heat gets into your eggs, all at once. Every question is optional." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.learn.p2', row: 'Help: gist first, then a technical aside',
    before: { text: "\"How was the yolk?\" teaches me your taste: what you mean by just right. \"And the white?\" teaches me how your whites set, which the yolk alone can't. Either answer also tells me how fast heat gets into your eggs, a number that quietly covers a lot: the eggs themselves, how hard your water really boils, a fridge that runs warm." }, after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: 'help.learn.p3', row: 'Help: gist first, then a technical aside',
    before: { text: "A probe reading is the quickest teacher: one number from the middle of one yolk tells me how fast heat gets into your eggs. Tapping Full rolling boil on a cold-water start teaches me how long your water takes to boil, for that much water. And only eggs rested on the counter teach me how fast the counter cools them." }, after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: 'help.learn.p4', row: 'Help: gist first, then a technical aside',
    before: { text: "Every question is optional. An egg you say nothing about teaches me nothing, but it costs nothing either. If I've learned something wrong, a few more eggs wash it out; Forget, on the Kitchen page, starts me again." }, after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: 'help.odds.aside', row: 'Help: gist first, then a technical aside',
    before: null, after: { text: "The bracket covers eight eggs in ten. When I choose the time, a runny white counts three times as bad as a yolk a little too firm, so I lean slightly long. The slider's shading shows how often each doneness comes out right for you." },
    appsBefore: [], appsAfter: ["web"],
  },
  {
    key: 'help.odds.p1', row: 'Help: gist first, then a technical aside',
    before: { text: "No egg timer can promise the egg you pictured, and neither can I. What I can tell you is which way it's likely to go wrong, if it does: softer or firmer than you like. The bracket under the doneness slider shows the range your yolk will probably land in. The narrower it is, the surer I am, and it narrows with every egg you tell me about." }, after: { text: "I tell you which way an egg is likely to miss, and the bracket under the slider shows how firm the yolk will probably be. Both narrow as I learn." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.odds.p2', row: 'Help: gist first, then a technical aside',
    before: { text: "Behind that is a number, such as 7 in 10: how often I expect an egg cooked this way to come out as you asked, with the white set and the yolk just right by your own answer. It starts low, around 2 in 10, because before your first egg I don't know your taste, your eggs or how hard your water really boils. The time I give is the one with the best odds, which isn't always my average guess." }, after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: 'help.odds.p3', row: 'Help: gist first, then a technical aside',
    before: { text: "The shading on the doneness slider follows the same odds: the stronger it is, the more often that doneness comes out right. Once I get any doneness right at least 3 times in 10, I stop offering the ones I'd get right less often." }, after: null,
    appsBefore: ["web"], appsAfter: [],
  },
  {
    key: 'help.reliable.cold', row: 'Help: gist first, then a technical aside',
    before: { text: "Eggs in the pan, cold water, lid on, heat on, and tap Full rolling boil when the whole surface rolls. The first time, I guess how long that takes; after that I remember, for that much water. Tap when it truly rolls: the rest of the cook is timed from your tap." }, after: { text: "Tap Full rolling boil when the whole surface rolls, not at the first bubbles. That tap corrects my time while the eggs cook." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.reliable.cooling', row: 'Help: gist first, then a technical aside',
    before: { text: "This matters most for soft eggs. Ice water stops the yolk soonest and most predictably. A cold tap is nearly as good, as long as it keeps running. On the counter the yolk keeps cooking for longer than you'd think, by an amount that is hard to predict, so the softest yolks are out of reach there. For a hard egg, the counter is fine." }, after: { text: "Ice water is the most predictable, a cold tap is nearly as good, and the counter keeps cooking the yolk. For soft eggs, use ice." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.reliable.every', row: 'Help: gist first, then a technical aside',
    before: { text: "Weigh the egg. A size from the box covers eggs that need quite different times, and size matters in every method. Use eggs straight from the fridge: I know how cold a fridge is, and I have to guess at a room." }, after: { text: "Weigh the egg if you can: one size on the box covers eggs that need quite different times. Eggs straight from the fridge are more predictable than eggs at room temperature." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.reliable.heatOff', row: 'Help: gist first, then a technical aside',
    before: { text: "The water does all the cooking, so how much of it there is matters more than anything else. Measure it, and use more rather than less: more water holds its heat longer, and small differences in how fast it cools matter less. With too little, I'll tell you I can't finish the job." }, after: { text: "The water does all the cooking, so measure it, and use plenty. With too little, the white never sets." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.reliable.hot', row: 'Help: gist first, then a technical aside',
    before: { text: "The simplest to get right. Lower the eggs into water at a full rolling boil and keep it there. Cold eggs cool the water a little as they go in, and more water cools less, but with the heat on it soon recovers, so the amount hardly matters." }, after: { text: "The easiest to get right. Keep the water at a full rolling boil the whole time." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.reliable.intro', row: 'Help: gist first, then a technical aside',
    before: { text: "The biggest lever is time: tell me how each egg came out, and my times close in on yours. The rest depends on how you cook." }, after: { text: "The biggest help is telling me how each egg came out. After that, it depends on how you cook." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.sources.intro', row: 'Help: gist first, then a technical aside',
    before: { text: "The main sources behind my sums. The project's README lists them all, with what each one settled." }, after: { text: "The main sources behind my numbers. The [README](https://github.com/danmackinlay/actual_egg_timer#10-references) lists them all, with what each one settled." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.unsure.counter', row: 'Help: gist first, then a technical aside',
    before: { text: "The counter. How fast an egg cools in still air is the least measured number I use: nobody seems to have published the middle of a hot egg after it leaves the water. I start from the physics, and I learn it only from eggs you rest on the counter." }, after: { text: "The counter. Nobody seems to have published how fast an egg cools in still air, so that is my weakest number." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.unsure.heatOff', row: 'Help: gist first, then a technical aside',
    before: { text: "Heat off. I work out how fast the water cools from how much there is, assuming an ordinary pan with its lid on. A wide shallow pan, a heavy pot or a missing lid will cool differently, and I won't know until you tell me how the eggs came out." }, after: { text: "Heat off. I assume an ordinary pan with its lid on; a heavy pot or a loose lid will change the time." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.unsure.sousVide', row: 'Help: gist first, then a technical aside',
    before: { text: "Sous-vide. Below {floor} the white stays liquid and moves about inside the shell, which my sums leave out, so I'm not reliable there. The long answer is real, though: at those temperatures the white takes the better part of a day to set." }, after: { text: "Sous-vide. Below {floor} the white stays liquid and moves inside the shell, which I leave out, so I'm not reliable there. The very long times are real, though: that cool, the white takes most of a day to set." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
  {
    key: 'help.unsure.white', row: 'Help: gist first, then a technical aside',
    before: { text: "Whites. A white that sets late and a cook who calls a tender white runny look the same to me, so I learn one number for both." }, after: { text: "Whites. I can't tell a white that sets late from a cook who calls a tender white runny." },
    appsBefore: ["web"], appsAfter: ["web"],
  },
];

export const help: Draft = {
  base: '9116d33',
  rows: HELP_DRAFT,
  exampleOnly: {},
};
