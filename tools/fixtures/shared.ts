/**
 * What more than one fixture module uses: the particle rows every
 * posterior is written out as, and the cook the running and step fixtures
 * start from. The pot they start from, `referenceSetup`, is
 * tools/common.ts's, which the tests share. The English catalogue is
 * english.ts's, apart, so that a fixture that shows no words does not reach
 * them (tools/wordsOnly.ts). Importing this module computes nothing, so each
 * fixture can be made in a worker of its own (tools/fixtures.ts).
 */

import { SIZE_CLASSES } from '../../src/core/geometry.ts';
import { createPrior } from '../../src/core/infer.ts';
import type { CookChoices } from '../../src/core/running.ts';

export function particleRows(post: ReturnType<typeof createPrior>) {
  return post.particles.map((p) => ({
    alpha_m2s: p.alpha_m2s,
    logDoseOffset: p.logDoseOffset,
    noise: p.noise,
    whiteOffset: p.whiteOffset,
    whiteFirmGap: p.whiteFirmGap,
  }));
}

/** The cook of the running and step fixtures: a 68 g EU Large from the
 *  fridge into 2 L of cold water at sea level, the heat held, then ice,
 *  jammy. */
export const BASE_CHOICES: CookChoices = {
  mass_kg: SIZE_CLASSES[2].mass_kg, massFrom: 'class', sizeTable: 'eu', eggFrom: 'fridge', customStart_C: 12,
  room_C: null, startMode: 'cold', afterBoil: 'hold', cooling: 'ice', tapWater_C: null, bowlLitres: 2, bowlWater_C: null, waterLitres: 2, eggCount: 2,
  altitude_m: 0, level: 0.41,
};

/** 7 October 2026, 09:00 UTC, in ms: when the fixtures' cooks start. */
export const START_MS = 1791363600000;
export const START_S = START_MS / 1000;

export const MEMORY = { '2.0': 480, '3.0': 610 };
