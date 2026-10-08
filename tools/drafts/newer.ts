/**
 * The `newer` draft: the line an older build shows when a newer one has run
 * on the device (9 October 2026, DECISIONS.md 100), on `c2a156f`, both
 * apps. One new key, none changed or retired.
 *
 * An older build can damage what a newer one stored, so the owner asked that
 * a build which finds a newer build's mark write nothing, say so in one
 * line, and run without learning or sharing until the newer build is back.
 * The line is at the top of every screen, the egg's and Settings' and
 * Help's, from launch (or, on the web, from the moment another tab of a
 * newer build runs) until the app is closed, so the cook sees it before
 * changing a setting that will not be kept.
 *
 * It says what happened, what to do and what it costs, in the cook's words:
 * no "version", "store" or "data". "Edition" is the plain word for a newer
 * printing of the same thing, and the 1750 colophon already says "Edition
 * {version}". "Update this one" is the fix in both apps: the App Store or
 * TestFlight on iOS, a reload on the web. "Won’t save or learn anything"
 * covers the settings, the results and the boiling times; sharing is
 * learning to the cook, and its switch is put out of reach with the
 * questions after an egg, which no longer show.
 *
 * No `copy/en-US.json` entry: American English says it the same way.
 *
 * The 1750 twin, new, rewritten in Johnson's voice, "this work" as his
 * Preface calls his Dictionary, and "any thing" as he spells it:
 *   newer.note: A later edition of this work has kept your results. Until
 *   you procure it, I shall time your eggs, but shall neither keep nor learn
 *   any thing. (143 of a body's 260)
 */

import type { Draft, Drafted } from '../copyDraft.js';

const NEWER_DRAFT: Drafted[] = [
  {
    key: 'newer.note', row: 'Every screen: top, when a newer version has run',
    before: null,
    after: { text: 'A newer edition of this app saved your results. Until you update this one, I’ll time your eggs but won’t save or learn anything.' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
];

export const newer: Draft = {
  base: 'c2a156f',
  rows: NEWER_DRAFT,
  exampleOnly: {},
};
