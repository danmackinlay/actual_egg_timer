/**
 * fixtures/population.json: the population both apps draw a new cook's prior
 * from (E7; src/core/population.ts, INFERENCE.md section 9).
 *
 *   npm run build && node dist/tools/population.js literature
 *
 * writes the literature's: the prior every cook drew from before E7, number
 * for number. The fit (fit/, `eggfit publish`) writes a fitted one in the
 * same shape - `id`, and the six spreads under `prior` - with its own record
 * of what it was fitted from beside them, which the apps ignore. Nothing else
 * writes this file, and `npm run fixtures` never touches it: it is the fit's
 * output, not the TypeScript's.
 */

import { writeFileSync } from 'node:fs';
import { LITERATURE_POPULATION } from '../src/core/infer.js';
import { parsePopulation } from '../src/core/population.js';

const OUT = 'fixtures/population.json';

if (process.argv[2] !== 'literature') {
  console.error('usage: node dist/tools/population.js literature');
  process.exit(2);
}

const p = LITERATURE_POPULATION;
const file = {
  about: 'The population a new cook\'s prior is drawn from (src/core/population.ts, INFERENCE.md section 9): an id, and one spread per particle dimension under "prior" - lognormal (median, logSd) or normal (mean, sd). This one is the literature\'s, README section 6\'s numbers, written by tools/population.ts until a fit of shared eggs publishes another (fit/). Both apps read it: the web fetches it, iOS bundles it. Not hand-edited.',
  id: p.id,
  fitted: null,
  prior: {
    alpha_m2s: p.alpha_m2s,
    logDoseOffset: p.logDoseOffset,
    tauAirScale: p.tauAirScale,
    noise: p.noise,
    whiteOffset: p.whiteOffset,
    whiteFirmGap: p.whiteFirmGap,
  },
};
if (parsePopulation(file) === null) throw new Error('the literature does not read back as a population');
writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n');
console.log(`${OUT}: the literature's population, id ${p.id}`);
