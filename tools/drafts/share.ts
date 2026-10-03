/**
 * The `share` draft: the words for sharing (E6; INFERENCE.md section 7,
 * COLLECTIVE.md section 1), new in both apps' Settings, on `c86f442`
 * (2 October 2026). Fourteen new keys, none changed or retired.
 *
 * `share.what` is the consent, always on screen beside the switch rather
 * than behind an (i), and it says the three things the cook is agreeing to:
 * what is sent (the eggs already logged too, DECISIONS.md 59), that nothing
 * names them, and that the time may move a few seconds (the nudge, which the
 * consent has to cover, INFERENCE.md section 7). Its first draft was
 * INFERENCE.md's, "to be argued over"; the owner reads this one on a phone.
 * `share.more` is the (i): why, exactly what goes - the boiling point named,
 * since it says roughly how high up the cook is - and the way back. The
 * privacy page is linked under the section with Help's own word,
 * `help.privacy`.
 *
 * The 1750 twins (copy/en-x-1750.json), new. "Delete" is "expunge",
 * Johnson's "to blot out; to rub out", which fits the button.
 *   share.title: The sharing of my eggs
 *   share.toggle: Send word how my eggs come out
 *   share.what: I shall send how every egg was boiled and how you found it, those I already know among them. No name nor place: a number drawn at random upon this device stands for you. While this is on, I shall now and then move a time some seconds, to learn the faster.
 *   share.more: One kitchen can teach me only of itself; many together shew me how eggs, pots, water and cooling truly differ, and the next version of the app begins every one from what they shewed. I send the egg's size, how it was boiled, the heat at which the water boils (which tells roughly how high you dwell), your answers, and what I expected. Moving a time some seconds teaches what the usual times cannot, and keeps within what you would call right. Leave off whenever you please; Expunge what I sent takes back every egg.
 *   share.none: Nothing yet sent.
 *   share.sent: I have sent {eggs} egg. / I have sent {eggs} eggs.
 *   share.waiting: {eggs} more shall go when the server can be reached. / {eggs} more shall go when the server can be reached.
 *   share.delete: Expunge what I sent
 *   share.confirm.title: Shall I expunge it?
 *   share.confirm.message: I shall bid the server expunge every egg this device has sent, and leave off sharing. What I have learned here remains.
 *   share.confirm.delete: Expunge it
 *   share.confirm.keep: Let it stand
 *   share.deleting: Expunging. If the server cannot now be reached, I shall ask again until it answers.
 *   share.deleted: Expunged: the server keeps nothing this device sent.
 *
 * What a draft is, and how the proofs read it: ../copyDraft.ts.
 */

import type { Draft, Drafted } from '../copyDraft.js';

const SHARE_DRAFT: Drafted[] = [
  {
    key: 'share.title', row: 'Settings: sharing',
    before: null, after: { text: "Share my eggs" },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'share.toggle', row: 'Settings: sharing',
    before: null, after: { text: "Send how my eggs come out" },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'share.what', row: 'Settings: sharing',
    before: null, after: { text: "I’ll send how each egg was cooked and how you said it came out, the eggs I already know included. No name or place: a random number made on this device stands in for you. While this is on, I’ll sometimes move a time a few seconds either way, to learn faster." },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'share.more', row: 'Settings: sharing',
    before: null, after: { text: "One kitchen teaches me only about itself. Many together show me how eggs, pots, water and cooling really differ, and the next version of the app starts everyone from what they showed. I send each egg’s size, how it was cooked, the water’s boiling point (which says roughly how high up you are), your answers, and what I expected. Moving a time a few seconds teaches me what the usual times can’t, and stays within just right. Turn this off whenever you like; Delete what I’ve sent takes back every egg." },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'share.none', row: 'Settings: sharing',
    before: null, after: { text: "Nothing sent yet." },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'share.sent', row: 'Settings: sharing',
    before: null, after: { one: "I’ve sent {eggs} egg.", other: "I've sent {eggs} eggs." },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'share.waiting', row: 'Settings: sharing',
    before: null, after: { one: "{eggs} more will go when I can reach the server.", other: "{eggs} more will go when I can reach the server." },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'share.delete', row: 'Settings: sharing',
    before: null, after: { text: "Delete what I’ve sent" },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'share.confirm.title', row: 'Settings: sharing',
    before: null, after: { text: "Delete what I’ve sent?" },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'share.confirm.message', row: 'Settings: sharing',
    before: null, after: { text: "I’ll ask the server to delete every egg this device has sent, and stop sharing. What I’ve learned here stays." },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'share.confirm.delete', row: 'Settings: sharing',
    before: null, after: { text: "Delete it" },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'share.confirm.keep', row: 'Settings: sharing',
    before: null, after: { text: "Keep it" },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'share.deleting', row: 'Settings: sharing',
    before: null, after: { text: "Deleting. If I can’t reach the server now, I’ll keep asking until it confirms." },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'share.deleted', row: 'Settings: sharing',
    before: null, after: { text: "Deleted: the server has nothing this device sent." },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
];

export const share: Draft = {
  base: 'c86f442',
  rows: SHARE_DRAFT,
  exampleOnly: {},
};
