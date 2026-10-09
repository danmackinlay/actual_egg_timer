/**
 * The `alarm` draft: the alarm's sound, chosen in Settings (9 October 2026,
 * DECISIONS.md 101), on `e6da9e1`, both apps. The owner heard eight candidates
 * and chose three: the wind-up timer, the default, which is what anyone
 * expects an egg timer to sound like; the cuckoo clock; and the hen, two
 * recordings from Freesound, credited in the (i) though CC0 asks for none.
 * The names are the owner's own ("the recorded hens, the cuckoo clock and
 * the wind-up timer"), the hen in the singular.
 *
 * No `copy/en-US.json` entry: American English says them the same way.
 *
 * The 1750 twins, new:
 *   controls.alarm: Sound of the alarm
 *   controls.alarm.more: What you shall hear when the eggs must come out,
 *     and again when they are cool. Choose one, and you shall hear it. …
 *     who give them freely at Freesound.
 *   controls.alarm.timer: Clockwork bell (there was no wind-up kitchen
 *     timer in 1750; there were clockwork bells, in clocks and alarums)
 *   controls.alarm.cuckoo: Cuckoo clock (the Black Forest made them from
 *     the 1730s)
 *   controls.alarm.hen: The hen
 */

import type { Draft, Drafted } from '../copyDraft.js';

const ALARM_DRAFT: Drafted[] = [
  {
    key: 'controls.alarm', row: 'Settings: alarm sound',
    before: null,
    after: { text: 'Alarm sound' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'controls.alarm.more', row: 'Settings: alarm sound, the (i)',
    before: null,
    after: { text: 'What you hear when it’s time to take the eggs out, and when they’ve cooled. Choose one to hear it. The hen’s calls were recorded by Jofae and Rudmer Rotteveel, who share them on Freesound.' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'controls.alarm.timer', row: 'Settings: alarm sound, the default',
    before: null,
    after: { text: 'Wind-up timer' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'controls.alarm.cuckoo', row: 'Settings: alarm sound',
    before: null,
    after: { text: 'Cuckoo clock' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
  {
    key: 'controls.alarm.hen', row: 'Settings: alarm sound',
    before: null,
    after: { text: 'Hen' },
    appsBefore: [], appsAfter: ['web', 'ios'],
  },
];

export const alarm: Draft = {
  base: 'e6da9e1',
  rows: ALARM_DRAFT,
  exampleOnly: {},
};
