/**
 * What more than one fixture module uses: the default pot, the particle
 * rows every posterior is written out as, and the English catalogue.
 */

import { readFileSync } from 'node:fs';

import { parseCatalogue } from '../../src/core/copy.js';
import { createPrior } from '../../src/core/infer.js';
import { CookSetup } from '../../src/core/protocol.js';

export type CatalogueJson = { locale: string; messages: Record<string, Record<string, unknown>> };

export const englishJson = JSON.parse(readFileSync('copy/en.json', 'utf8')) as CatalogueJson;
export const english = parseCatalogue(englishJson);

/** The pot most fixtures start from: a hot start from the fridge into 2 L,
 *  four eggs, an ice bath. */
export function setupOf(over: Partial<CookSetup>): CookSetup {
  const base: CookSetup = {
    startMode: 'hot',
    eggStart_C: 4,
    ambient_C: 20,
    boiling_C: 100,
    timeToBoil_s: 0,
    cooling: 'ice',
    waterLitres: 2,
    eggCount: 4,
  };
  return { ...base, ...over };
}

export function particleRows(post: ReturnType<typeof createPrior>) {
  return post.particles.map((p) => ({
    alpha_m2s: p.alpha_m2s,
    logDoseOffset: p.logDoseOffset,
    tauAirScale: p.tauAirScale,
    noise: p.noise,
    whiteOffset: p.whiteOffset,
    whiteFirmGap: p.whiteFirmGap,
  }));
}
