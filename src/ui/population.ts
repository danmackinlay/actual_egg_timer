/**
 * The population this page draws a new cook's prior from (E7; core's
 * population.ts): `fixtures/population.json`, fetched at boot beside the
 * words, from the same deploy as the scripts. The literature's until a fit of
 * everyone's shared eggs publishes another.
 *
 * A file that cannot be fetched or read leaves the literature's in its
 * place. The posterior remembers which population it was drawn from
 * (calibrationStore.ts), so a page that fell back replays its eggs from the
 * literature, and the next page that reads the file replays them back: both
 * correct, and each a few seconds of the worker's time per egg.
 */

import { LITERATURE_POPULATION, Population } from '../core/infer.js';
import { parsePopulation } from '../core/population.js';

let active: Population = LITERATURE_POPULATION;

export function activePopulation(): Population {
  return active;
}

/** Fetch and read the published population. Never throws: whatever goes
 *  wrong, the literature's stands. */
export async function loadPopulation(): Promise<Population> {
  try {
    const response = await fetch('fixtures/population.json');
    if (response.ok) {
      const parsed = parsePopulation(await response.json());
      if (parsed !== null) active = parsed;
    }
  } catch {
    /* offline, or no such file: the literature's. */
  }
  return active;
}
