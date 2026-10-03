/**
 * The `bench` draft: Australian English is the base (`DECISIONS.md` 55, 3
 * October 2026), so the egg left out to cool sits on the bench, as an
 * Australian kitchen says, on `63d9094`, both apps. "Counter" moves to the
 * American overlay, copy/en-US.json, with the other words an American kitchen
 * says differently ("running water" for the cold tap, "pot" for the pan). A
 * Briton reads "bench" too: British English has no overlay, and "worktop"
 * waits until someone asks for one.
 *
 * Only the word changes; nothing else in these rows does. The keys keep
 * "counter" in their names, which no cook sees. The 1750 twins say "table"
 * and stand.
 */

import type { Draft, Drafted } from '../copyDraft.js';

const BENCH_DRAFT: Drafted[] = [
  {
    key: "refusal.counter", row: "bench for counter",
    before: { text: "On the counter the yolk keeps cooking after the egg comes out. Softest possible: {limit}. For a softer yolk, cool the eggs in an ice bath." },
    after: { text: "On the bench the yolk keeps cooking after the egg comes out. Softest possible: {limit}. For a softer yolk, cool the eggs in an ice bath." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.cooling.counter", row: "bench for counter",
    before: { text: "Counter" },
    after: { text: "Bench" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.cooling.more", row: "bench for counter",
    before: { text: "The yolk keeps cooking for a few minutes after the eggs come out of the water. An ice bath stops it fastest, so it allows the softest yolks, and a cold tap is nearly as good. On the counter the egg cools so slowly that the softest yolks aren't possible, and the result varies more." },
    after: { text: "The yolk keeps cooking for a few minutes after the eggs come out of the water. An ice bath stops it fastest, so it allows the softest yolks, and a cold tap is nearly as good. On the bench the egg cools so slowly that the softest yolks aren't possible, and the result varies more." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.how.aside2", row: "bench for counter",
    before: { text: "On the counter, still air takes heat out so slowly that the yolk ends up within a fraction of a degree of where it would if the egg never cooled at all. [README §5](https://github.com/danmackinlay/actual_egg_timer#5-carryover-the-cooling-step-is-part-of-the-recipe)." },
    after: { text: "On the bench, still air takes heat out so slowly that the yolk ends up within a fraction of a degree of where it would if the egg never cooled at all. [README §5](https://github.com/danmackinlay/actual_egg_timer#5-carryover-the-cooling-step-is-part-of-the-recipe)." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.reliable.cooling.title", row: "bench for counter",
    before: { text: "Ice, tap or counter" },
    after: { text: "Ice, tap or bench" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.reliable.cooling", row: "bench for counter",
    before: { text: "An ice bath gives the most reliable result, and a cold tap is nearly as good. On the counter the yolk keeps cooking, so use ice for soft eggs." },
    after: { text: "An ice bath gives the most reliable result, and a cold tap is nearly as good. On the bench the yolk keeps cooking, so use ice for soft eggs." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.unsure.counter", row: "bench for counter",
    before: { text: "I'm least sure about cooling on the counter, because I couldn't find any published measurements of how fast an egg cools in still air." },
    after: { text: "I'm least sure about cooling on the bench, because I couldn't find any published measurements of how fast an egg cools in still air." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "setup.cooling.counter", row: "bench for counter",
    before: { text: "then onto the counter" },
    after: { text: "then onto the bench" },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "controls.thermometer.more", row: "bench for counter",
    before: { text: "When the cooling countdown ends, the middle of the yolk is at its hottest, and I'll ask you for a reading. Push the tip right into the middle and tell me the highest number you see. Anywhere else, or any later, will read too low. The reading tells me how fast heat gets into your eggs. If you cool the eggs on the counter there's no countdown, so I won't ask." },
    after: { text: "When the cooling countdown ends, the middle of the yolk is at its hottest, and I'll ask you for a reading. Push the tip right into the middle and tell me the highest number you see. Anywhere else, or any later, will read too low. The reading tells me how fast heat gets into your eggs. If you cool the eggs on the bench there's no countdown, so I won't ask." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "advice.ice", row: "bench for counter",
    before: { text: "Cool the eggs in an ice bath. On the counter it's hard to say how much more the yolk will cook." },
    after: { text: "Cool the eggs in an ice bath. On the bench it's hard to say how much more the yolk will cook." },
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "alarm.pull.bodyCounter", row: "bench for counter",
    before: { text: "Out of the water and onto the counter." },
    after: { text: "Out of the water and onto the bench." },
    appsBefore: ["ios"], appsAfter: ["ios"],
  },
];

export const bench: Draft = {
  base: '63d9094',
  rows: BENCH_DRAFT,
  exampleOnly: {},
};
