/**
 * fixtures/population.json: the population both apps draw a new cook's prior
 * from (src/core/population.ts, INFERENCE.md section 9).
 *
 *   node tools/population.ts literature
 *
 * writes the literature's: the prior every cook drew from before the
 * population fit, number for number. The fit (fit/, `eggfit fit --out
 * fixtures/population.json`) writes a fitted one in the same shape - `id`,
 * and the five spreads under `prior` - with whether its sampler passed its
 * checks or was forced (`diagnostics`), which the apps hold it to
 * (parsePopulation), and its own record of what it was fitted from, which
 * they ignore. The literature's was never sampled, so its `diagnostics` is
 * null, which the apps accept from the literature's numbers alone. Nothing
 * else writes this file, and `npm run fixtures` never touches it: it is the
 * fit's output, not the TypeScript's.
 */

import { writeFileSync } from 'node:fs';
import { LITERATURE_POPULATION } from '../src/core/infer.ts';
import { parsePopulation } from '../src/core/population.ts';

const OUT = 'fixtures/population.json';

if (process.argv[2] !== 'literature') {
  console.error('usage: node tools/population.ts literature');
  process.exit(2);
}

const p = LITERATURE_POPULATION;
const file = {
  about: 'The population a new cook\'s prior is drawn from (src/core/population.ts, INFERENCE.md section 9): an id, and one spread per particle dimension under "prior" - lognormal (median, logSd) or normal (mean, sd). This one is the literature\'s, README section 6\'s numbers, written by tools/population.ts until a fit of shared eggs publishes another (fit/); it was never sampled, so it has no diagnostics. Both apps read it: the web fetches it, iOS bundles it. Not hand-edited.',
  id: p.id,
  fitted: null,
  diagnostics: null,
  prior: {
    alpha_m2s: p.alpha_m2s,
    logDoseOffset: p.logDoseOffset,
    noise: p.noise,
    whiteOffset: p.whiteOffset,
    whiteFirmGap: p.whiteFirmGap,
  },
};
if (parsePopulation(file) === null) throw new Error('the literature does not read back as a population');
writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n');
console.log(`${OUT}: the literature's population, id ${p.id}`);
