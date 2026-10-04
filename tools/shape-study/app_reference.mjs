// The app's own answers for the cases shape_study.py checks its pipeline on:
// solveCookTime from compiled core, equal-volume sphere, hot start into a
// held boil at 100 C, 2 eggs in 2 L, ice bath. Prints JSON.
//
//   node tools/shape-study/app_reference.mjs [path/to/compiled/src/core]
//
// The default path is dist/src/core, which `npm run build` writes.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const core = path.resolve(process.argv[2] ?? 'dist/src/core');
const load = (m) => import(pathToFileURL(path.join(core, m)).href);
const { eggFromMass } = await load('geometry.js');
const { solveCookTime, donenessFromSlider, DEFAULT_PARAMS } = await load('solve.js');

const out = [];
for (const mass_g of [50, 62, 75]) {
  for (const start_C of [4, 20]) {
    for (const level of [0.22, 0.41, 1.0]) {
      const egg = eggFromMass(mass_g / 1000);
      const setup = {
        startMode: 'hot', eggStart_C: start_C, ambient_C: 20, boiling_C: 100,
        timeToBoil_s: 600, cooling: 'ice', waterLitres: 2, afterBoil: 'hold', eggCount: 2,
      };
      const sol = solveCookTime(egg, setup, DEFAULT_PARAMS, donenessFromSlider(level));
      out.push({
        mass_g, start_C, level,
        cook_s: sol.result.cookTime_s, minCook_s: sol.minCookTime_s, reachable: sol.reachable,
      });
    }
  }
}
console.log(JSON.stringify(out));
