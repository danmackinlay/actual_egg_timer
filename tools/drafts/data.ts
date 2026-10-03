/**
 * The `data` draft: metonyms swept out (3 October 2026), on `13a5e05`, both
 * apps. The owner: an object must not stand in for the data about it. "I’ve
 * sent 3 eggs", "Delete what I’ve sent", "the eggs I already know" baffle a
 * stranger, since what is sent is a record, not an egg. The data word is now
 * "result": one cooked egg, how it was cooked and how it came out, which
 * share.what defines where the cook first meets it. "Egg" stays only for the
 * physical egg ("how each egg was cooked", "each egg’s size", "a typical
 * egg"). Likewise:
 *
 * - `help.reliable.forYou`: "the eggs you’ve set up" stood for the settings.
 * - `action.hint.heating.more`: "the rest of the cook" read as a person; it
 *   is the rest of the cooking.
 * - `share.more`: "one kitchen teaches me" stood a kitchen in for its results.
 * - `share.toggle` and `share.delete` lose their pronouns: a control says
 *   what it does and does not speak as the cook ("Share results", "Delete
 *   shared results"); `share.title` heads the section as "Sharing results".
 *   "Delete your shared results?" is 27 characters on a 23-character title,
 *   so the dialog is "Delete shared results?".
 *
 * Left alone on purpose: "your eggs" where it means the eggs this cook buys
 * (`idle.welcome`, `help.learn.p1`, `feedback.invite`), "each egg you tell
 * me about" (`outcome.why`, `help.odds.p1`), and the entry notes, which
 * render nothing. No key is renamed; the `{eggs}` placeholder keeps its name.
 * No copy/en-US.json entry is reached.
 *
 * The 1750 twins, rewritten in their own manner, before -> after.
 * `help.learn.aside` is not a drafted key, since its modern wording ("I keep
 * a record of every egg") stands, but its twin said "I keep every egg":
 *   action.hint.heating.more: Tap It boils in earnest when the whole surface begins to heave, and is not to be calmed by stirring. I time the rest of the cook from this tap; be sure of it.
 *     -> Tap It boils in earnest when the whole surface begins to heave, and is not to be calmed by stirring. I time the rest of the cooking from this tap; be sure of it.
 *   help.learn.aside: I use [sequential Monte Carlo](https://en.wikipedia.org/wiki/Particle_filter) to learn your eggs and your taste, with an [ordered probit](https://en.wikipedia.org/wiki/Ordered_probit) for too rear, as was desired, and too hard. I keep every egg; so that when I am improved, I learn again from all of them. [The design](https://github.com/danmackinlay/actual_egg_timer/blob/main/INFERENCE.md).
 *     -> I use [sequential Monte Carlo](https://en.wikipedia.org/wiki/Particle_filter) to learn your eggs and your taste, with an [ordered probit](https://en.wikipedia.org/wiki/Ordered_probit) for too rear, as was desired, and too hard. I keep a record of every egg; so that when I am improved, I learn again from all of them. [The design](https://github.com/danmackinlay/actual_egg_timer/blob/main/INFERENCE.md).
 *   help.reliable.forYou: For the eggs as now set out
 *     -> For the settings as they now stand
 *   learned.tuned (one): Instructed by {eggs} egg
 *     -> Instructed by {eggs} result
 *   learned.tuned (other): Instructed by {eggs} eggs
 *     -> Instructed by {eggs} results
 *   learned.confirm.message: I shall forget every egg and every boil, and the times return to where they began.
 *     -> I shall forget all your results, and how long your water was in boiling, and the times return to where they began.
 *   learning.badge.more: You share your eggs, and so I am yet learning from them. Now and then I move the time some seconds either way, ten at most, to learn what passes just beside the time I would choose. It may leave an egg a little softer or firmer than I would otherwise aim at. Leave off sharing in the settings, and the time stays where I would put it.
 *     -> You share your results, and so I am yet learning from them. Now and then I move the time some seconds either way, ten at most, to learn what passes just beside the time I would choose. It may leave an egg a little softer or firmer than I would otherwise aim at. Leave off sharing in the settings, and the time stays where I would put it.
 *   share.title: The sharing of my eggs
 *     -> The sharing of results
 *   share.toggle: Send word how my eggs come out
 *     -> Impart the results
 *   share.what: I shall send how every egg was boiled and how you found it, those I already know among them. No name nor place: a number drawn at random upon this device stands for you. While this is on, I shall now and then move a time some seconds, to learn the faster.
 *     -> I shall send your results, the past too: how every egg was boiled, and how you found it. No name nor place: a number drawn at random upon this device stands for you. While this is on, I shall now and then move a time some seconds, to learn the faster.
 *   share.more: One kitchen can teach me only of itself; many together shew me how eggs, pots, water and cooling truly differ, and the next version of the app begins every one from what they shewed. I send the egg’s size, how it was boiled, the heat at which the water boils (which tells roughly how high you dwell), your answers, and what I expected. Moving a time some seconds teaches what the usual times cannot, and keeps within what you would call right. Leave off whenever you please; Expunge what I sent takes back every egg.
 *     -> The results of one kitchen can teach me only of that kitchen; those of many together shew me how eggs, pots, water and cooling truly differ, and the next version of the app begins every one from what they shew. I send the egg’s size, how it was boiled, the heat at which the water boils (which tells roughly how high you dwell), your answers, and what I expected. Moving a time some seconds teaches what the usual times cannot, and keeps within what you would call right. Leave off whenever you please; Expunge the results takes every one from the server.
 *   share.sent (one): I have sent {eggs} egg.
 *     -> I have sent {eggs} result.
 *   share.sent (other): I have sent {eggs} eggs.
 *     -> I have sent {eggs} results.
 *   share.delete: Expunge what I sent
 *     -> Expunge the results
 *   share.confirm.title: Shall I expunge it?
 *     -> Expunge the results?
 *   share.confirm.message: I shall bid the server expunge every egg this device has sent, and leave off sharing. What I have learned here remains.
 *     -> I shall bid the server expunge every result this device has sent, and leave off sharing. What I have learned here remains.
 */

import type { Draft, Drafted } from '../copyDraft.js';

const DATA_DRAFT: Drafted[] = [
  {
    key: "share.title", row: "sharing heading",
    before: {"text":"Share my eggs"},
    after: {"text":"Sharing results"},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "share.toggle", row: "sharing switch",
    before: {"text":"Send how my eggs come out"},
    after: {"text":"Share results"},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "share.what", row: "sharing consent",
    before: {"text":"I’ll send how each egg was cooked and how you said it came out, the eggs I already know included. No name or place: a random number made on this device stands in for you. While this is on, I’ll sometimes move a time a few seconds either way, to learn faster."},
    after: {"text":"I’ll send your results, including past ones: how each egg was cooked and how you said it came out. No name or place: a random number made on this device stands in for you. While this is on, I’ll sometimes move a time a few seconds either way, to learn faster."},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "share.more", row: "sharing (i)",
    before: {"text":"One kitchen teaches me only about itself. Many together show me how eggs, pots, water and cooling really differ, and the next version of the app starts everyone from what they showed. I send each egg’s size, how it was cooked, the water’s boiling point (which says roughly how high up you are), your answers, and what I expected. Moving a time a few seconds teaches me what the usual times can’t, and stays within just right. Turn this off whenever you like; Delete what I’ve sent takes back every egg."},
    after: {"text":"Results from one kitchen tell me only about that kitchen. Results from many show me how eggs, pots, water and cooling really differ, and the next version of the app starts everyone from what they show. I send each egg’s size, how it was cooked, the water’s boiling point (which says roughly how high up you are), your answers, and what I expected. Moving a time a few seconds teaches me what the usual times can’t, and stays within just right. Turn this off whenever you like, and tap Delete shared results to remove every one from the server."},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "share.sent", row: "sharing note",
    before: {"one":"I’ve sent {eggs} egg.","other":"I’ve sent {eggs} eggs."},
    after: {"one":"I’ve sent {eggs} result.","other":"I’ve sent {eggs} results."},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "share.delete", row: "sharing delete",
    before: {"text":"Delete what I’ve sent"},
    after: {"text":"Delete shared results"},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "share.confirm.title", row: "sharing delete",
    before: {"text":"Delete what I’ve sent?"},
    after: {"text":"Delete shared results?"},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "share.confirm.message", row: "sharing delete",
    before: {"text":"I’ll ask the server to delete every egg this device has sent, and stop sharing. What I’ve learned here stays."},
    after: {"text":"I’ll ask the server to delete every result this device has sent, and stop sharing. What I’ve learned here stays."},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learning.badge.more", row: "learning badge (i)",
    before: {"text":"You’re sharing your eggs, so I’m still learning from them. Now and then I move the time a few seconds either way, up to ten, to learn what happens just off the time I’d pick. It can leave an egg a little softer or firmer than I’d otherwise aim for. Turn sharing off in Settings and the time stays where I’d put it."},
    after: {"text":"You’re sharing your results, so I’m still learning from them. Now and then I move the time a few seconds either way, up to ten, to learn what happens just off the time I’d pick. It can leave an egg a little softer or firmer than I’d otherwise aim for. Turn sharing off in Settings and the time stays where I’d put it."},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.tuned", row: "what I’ve learned",
    before: {"one":"Learned from {eggs} egg","other":"Learned from {eggs} eggs"},
    after: {"one":"Learned from {eggs} result","other":"Learned from {eggs} results"},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "learned.confirm.message", row: "what I’ve learned",
    before: {"text":"I’ll forget every egg and every boil, and go back to the times for a typical egg."},
    after: {"text":"I’ll forget all your results and boil times, and go back to the times for a typical egg."},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "help.reliable.forYou", row: "help",
    before: {"text":"For the eggs you’ve set up now"},
    after: {"text":"For your current settings"},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
  {
    key: "action.hint.heating.more", row: "heating (i)",
    before: {"text":"Tap Full rolling boil when the whole surface starts bubbling hard and stirring doesn’t calm it. I time the rest of the cook from your input here, so get this right!"},
    after: {"text":"Tap Full rolling boil when the whole surface starts bubbling hard and stirring doesn’t calm it. I time the rest of the cooking from your input here, so get this right!"},
    appsBefore: ["web","ios"], appsAfter: ["web","ios"],
  },
];

export const data: Draft = {
  base: '13a5e05',
  rows: DATA_DRAFT,
  exampleOnly: {
    'learned.both': 'its example’s {tuned} follows learned.tuned: "Learned from 3 results"',
  },
};
