/**
 * fixtures/settings.json: the settings as both apps keep them
 * (src/core/settings.ts) - the defaults, and a stored copy read back against
 * either size table: nothing stored, not an object, every field as written,
 * and every field out of its bounds, of the wrong type, or absent.
 */

import { SIZE_CLASSES, US_SIZE_CLASSES } from '../../src/core/geometry.js';
import { DEFAULT_SETTINGS, readSettings } from '../../src/core/settings.js';

/** What a stored copy may hold. Each is read against both tables. */
const STORED: { about: string; stored: unknown }[] = [
  { about: 'nothing stored', stored: null },
  { about: 'not an object', stored: 'doneness' },
  { about: 'a list', stored: [0.5] },
  { about: 'empty', stored: {} },
  {
    about: 'every field as an app writes it',
    stored: {
      sizeIndex: 4, customMinor_mm: 47.5, measuredBy: 'girth', weighedMass_g: 71.25, startTempMode: 'custom',
      customStart_C: 18.5, altitude_m: 1200, startMode: 'hot', afterBoil: 'off', cooling: 'counter',
      waterLitres: 3.5, eggCount: 6, doneness: 0.73, muted: true, alarm: 'hen', unitsChosen: 'imperial',
      language: { chosen: 'en-x-1750' }, probe: true, room_C: 23.5,
    },
  },
  {
    about: 'every number past its bounds, low',
    stored: {
      sizeIndex: -7, customMinor_mm: 1, weighedMass_g: 3, customStart_C: -40, altitude_m: -9000, waterLitres: 0,
      eggCount: 0, doneness: -1, room_C: -20,
    },
  },
  {
    about: 'every number past its bounds, high',
    stored: {
      sizeIndex: 99, customMinor_mm: 900, weighedMass_g: 400, customStart_C: 99, altitude_m: 90000,
      waterLitres: 80, eggCount: 1000, doneness: 7, room_C: 300,
    },
  },
  {
    about: 'halves, which the two languages could round apart',
    stored: { sizeIndex: 2.5, eggCount: 2.5 },
  },
  {
    about: 'the -0.5 tie, and a measured egg',
    stored: { sizeIndex: -0.5, eggCount: 3.4999 },
  },
  { about: 'a weighed or measured egg', stored: { sizeIndex: -1 } },
  { about: 'a Jumbo, past the end of the EU table', stored: { sizeIndex: 4 } },
  {
    about: 'numbers as text, true and false, null: not numbers',
    stored: {
      sizeIndex: '1', customMinor_mm: '50', weighedMass_g: true, customStart_C: null, altitude_m: '100',
      waterLitres: false, eggCount: '4', doneness: '0.9', room_C: '20',
    },
  },
  {
    about: 'choices that are not one of theirs',
    stored: {
      measuredBy: 'class', startTempMode: 'Fridge', startMode: 'sous', afterBoil: true, cooling: 'bath',
      alarm: 'beeps', unitsChosen: 'Metric', language: { chosen: 'cs' }, muted: 'true', probe: 1,
    },
  },
  { about: 'a stored sous-vide, with the pan cold', stored: { startMode: 'sous' } },
  { about: 'the language not an object', stored: { language: 'en-x-1750' } },
  { about: 'a language retired', stored: { language: { chosen: null, flippedFrom: 'en' } } },
];

export const settingsFixture = {
  about: 'The settings as both apps keep them: the defaults, and a stored copy read back against either size table. src/core/settings.ts.',
  defaults: DEFAULT_SETTINGS,
  read: STORED.flatMap((c) => (['eu', 'us'] as const).map((table) => ({
    about: c.about,
    table: table,
    stored: c.stored,
    settings: readSettings(c.stored, table === 'eu' ? SIZE_CLASSES : US_SIZE_CLASSES),
  }))),
};
