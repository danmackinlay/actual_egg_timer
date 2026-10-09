/**
 * fixtures/boil.json: boil memory (src/core/boil.ts) - a measurement blended
 * with what was known, one refused, and the estimate for volumes measured
 * and not.
 */

import { BoilMemory, DEFAULT_TIME_TO_BOIL_S, estimateTimeToBoil, rememberBoil } from '../../src/core/boil.js';

/* Two pans remembered in both orders, so a port that iterates an unordered map
 * is caught rather than merely lucky. */
const BOIL_MEMORY_FORWARD: BoilMemory = rememberBoil(rememberBoil({}, 1, 300), 3, 900);
const BOIL_MEMORY_BACKWARD: BoilMemory = rememberBoil(rememberBoil({}, 3, 900), 1, 300);
const BOIL_QUERY_LITRES = [0.5, 1, 1.5, 2, 2.5, 3, 4, 12];

export const boilFixture = {
  about: 'Boil memory: a measurement blended, one refused, the estimate for every volume from two pans remembered in both orders, and the fallback. src/core/boil.ts.',
  blend: [
    { previous: null, measured: 480, result: estimateTimeToBoil(rememberBoil({}, 2, 480), 2) },
    {
      previous: 480, measured: 600,
      result: estimateTimeToBoil(rememberBoil(rememberBoil({}, 2, 480), 2, 600), 2),
    },
  ],
  refused: [3, 99999].map((seconds) => ({
    seconds: seconds,
    remembered: Object.keys(rememberBoil({}, 2, seconds)).length > 0,
  })),
  estimate: BOIL_QUERY_LITRES.map((litres) => ({
    litres: litres,
    forward: estimateTimeToBoil(BOIL_MEMORY_FORWARD, litres),
    backward: estimateTimeToBoil(BOIL_MEMORY_BACKWARD, litres),
  })),
  defaultSeconds: DEFAULT_TIME_TO_BOIL_S,
};
