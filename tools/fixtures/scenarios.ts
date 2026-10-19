/**
 * fixtures/scenarios.json: whole cooks, solved end to end.
 */

import { eggFromMass, eggFromMinorDiameter } from '../../src/core/geometry.ts';
import { boilingPointAtAltitude } from '../../src/core/thermo.ts';
import type { CookSetup } from '../../src/core/protocol.ts';
import { simulate, solveCookTime, donenessFromSlider, DEFAULT_PARAMS } from '../../src/core/solve.ts';
import { referenceSetup } from '../common.ts';



/** The reference egg of the validation and the scenarios: 43.5 mm across,
 *  about 62.3 g - not the app's 68 g EU Large. Built from its mass: the iOS
 *  core, which only weighs eggs, builds it the same way. */
const REFERENCE_EGG = eggFromMass(eggFromMinorDiameter(0.0435).mass_kg);

interface Scenario {
  name: string;
  setup: CookSetup;
  level: number;
}

const SCENARIOS: Scenario[] = [
  { name: 'jammy, fridge, sea level, ice', setup: referenceSetup({}), level: 0.41 },
  { name: 'jammy, room temp', setup: referenceSetup({ eggStart_C: 21, ambient_C: 21 }), level: 0.41 },
  { name: 'jammy, 2000 m', setup: referenceSetup({ boiling_C: boilingPointAtAltitude(2000) }), level: 0.41 },
  { name: 'runny', setup: referenceSetup({}), level: 0.0 },
  { name: 'hard', setup: referenceSetup({}), level: 1.0 },
  { name: 'cold start, 8 min ramp', setup: referenceSetup({ startMode: 'cold', timeToBoil_s: 480 }), level: 0.41 },
  { name: 'cold start, 12 min ramp', setup: referenceSetup({ startMode: 'cold', timeToBoil_s: 720 }), level: 0.41 },
  { name: 'cold start, 8 min ramp, from a 15 C tap', setup: referenceSetup({ startMode: 'cold', timeToBoil_s: 480, panStart_C: 15 }), level: 0.41 },
  { name: 'cold start, 12 min ramp, from a 6 C tap', setup: referenceSetup({ startMode: 'cold', timeToBoil_s: 720, panStart_C: 6 }), level: 0.41 },
  { name: 'hot start, a pan start it never reads', setup: referenceSetup({ panStart_C: 6 }), level: 0.41 },
  { name: 'counter rested', setup: referenceSetup({ cooling: 'counter' }), level: 0.41 },
  { name: 'in an egg cup, soft', setup: referenceSetup({ cooling: 'eggCup' }), level: 0.22 },
  { name: 'cold tap', setup: referenceSetup({ cooling: 'tap' }), level: 0.41 },
  { name: 'running water at 24 C', setup: referenceSetup({ cooling: 'tap', coolingWater_C: 24 }), level: 0.41 },
  { name: 'two eggs, a 2 L bowl at the room', setup: referenceSetup({ eggCount: 2, cooling: 'bowl', bowlLitres: 2 }), level: 0.41 },
  { name: 'eight eggs in a litre bowl at 12 C', setup: referenceSetup({ eggCount: 8, cooling: 'bowl', bowlLitres: 1, coolingWater_C: 12 }), level: 0.41 },
  { name: 'a bowl, soft', setup: referenceSetup({ cooling: 'bowl', bowlLitres: 1.5, coolingWater_C: 18 }), level: 0.22 },
  { name: 'a bowl, cold start, hard', setup: referenceSetup({ startMode: 'cold', timeToBoil_s: 480, cooling: 'bowl', bowlLitres: 3 }), level: 1.0 },
  { name: 'eight eggs in 0.75 L', setup: referenceSetup({ eggCount: 8, waterLitres: 0.75 }), level: 0.41 },
  { name: 'standing, 8 min boil', setup: referenceSetup({ startMode: 'cold', afterBoil: 'off', timeToBoil_s: 480 }), level: 0.41 },
  { name: 'standing, 8 min boil, from a 25 C tap', setup: referenceSetup({ startMode: 'cold', afterBoil: 'off', timeToBoil_s: 480, panStart_C: 25 }), level: 0.41 },
  { name: 'standing, 10 min boil, hard', setup: referenceSetup({ startMode: 'cold', afterBoil: 'off', timeToBoil_s: 600 }), level: 1.0 },
  { name: 'standing, 4 min boil: a fast hob is not a small pan', setup: referenceSetup({ startMode: 'cold', afterBoil: 'off', timeToBoil_s: 240 }), level: 0.41 },
  { name: 'standing, 1 L, hard (out of reach)', setup: referenceSetup({ startMode: 'cold', afterBoil: 'off', timeToBoil_s: 240, waterLitres: 1 }), level: 1.0 },
  { name: 'standing, 4 L, 16 min boil, hard', setup: referenceSetup({ startMode: 'cold', afterBoil: 'off', timeToBoil_s: 960, waterLitres: 4 }), level: 1.0 },
  { name: 'standing, hot start, 1 L (white never sets)', setup: referenceSetup({ afterBoil: 'off', timeToBoil_s: 480, waterLitres: 1 }), level: 0.41 },
  { name: 'standing, hot start, 6 L, two eggs', setup: referenceSetup({ afterBoil: 'off', timeToBoil_s: 480, waterLitres: 6, eggCount: 2 }), level: 0.41 },
];

export const scenariosFixture = {
  about: 'Whole cooks, solved end to end. src/core/solve.ts.',
  egg: REFERENCE_EGG,
  params: DEFAULT_PARAMS,
  cases: SCENARIOS.map((s) => {
    const sol = solveCookTime(REFERENCE_EGG, s.setup, DEFAULT_PARAMS, donenessFromSlider(s.level));
    const fixed = simulate(REFERENCE_EGG, s.setup, DEFAULT_PARAMS, 7.4 * 60);
    return {
      name: s.name,
      level: s.level,
      setup: s.setup,
      solution: sol,
      atFixed444s: fixed,
    };
  }),
};
