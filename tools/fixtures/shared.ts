/**
 * What more than one fixture module uses: the particle rows every
 * posterior is written out as, and the English catalogue. The pot they start
 * from, `referenceSetup`, is tools/common.ts's, which the tests share.
 */

import { readFileSync } from 'node:fs';

import { parseCatalogue } from '../../src/core/copy.js';
import { createPrior } from '../../src/core/infer.js';

export type CatalogueJson = { locale: string; messages: Record<string, Record<string, unknown>> };

export const englishJson = JSON.parse(readFileSync('copy/en.json', 'utf8')) as CatalogueJson;
export const english = parseCatalogue(englishJson);

export function particleRows(post: ReturnType<typeof createPrior>) {
  return post.particles.map((p) => ({
    alpha_m2s: p.alpha_m2s,
    logDoseOffset: p.logDoseOffset,
    noise: p.noise,
    whiteOffset: p.whiteOffset,
    whiteFirmGap: p.whiteFirmGap,
  }));
}
