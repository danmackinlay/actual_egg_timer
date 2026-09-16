/**
 * Validation harness: reproduces every number in PLAN.md's validation table
 * from the frozen core API and prints a markdown report.
 *
 * Run: npx tsc && node dist/tools/validate.js
 * Exits non-zero if any check fails, so it can gate a commit.
 *
 * Reference setup unless a row says otherwise: EU Large egg (43.5 mm minor
 * diameter, ~62 g), fridge-cold at 4 C, hot start into boiling water, ice
 * bath afterwards, jammy = slider 0.41.
 */

import { eggFromMinorDiameter, eggFromMass, Egg } from '../src/core/geometry.js';
import { boilingPointAtAltitude, boilingPointApprox, pressureAtAltitude } from '../src/core/thermo.js';
import { CookSetup } from '../src/core/protocol.js';
import {
  simulate, solveCookTime, donenessFromSlider, DEFAULT_PARAMS, DONENESS_ANCHORS,
} from '../src/core/solve.js';

// --------------------------------------------------------------------------
// harness
// --------------------------------------------------------------------------

interface Row {
  scenario: string;
  expected: string;
  actual: string;
  tolerance: string;
  status: string;
}

const rows: Row[] = [];
let failures = 0;

/** Default tolerance on a cook time, minutes. */
const TOL_MIN = 0.3;

function check(
  scenario: string, actual: number, expected: number, tolerance: number, unit: string,
): void {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (!ok) failures++;
  rows.push({
    scenario: scenario,
    expected: `${expected.toFixed(2)} ${unit}`,
    actual: `${actual.toFixed(2)} ${unit}`,
    tolerance: `±${tolerance} ${unit}`,
    status: ok ? 'PASS' : 'FAIL',
  });
}

function printTable(title: string, header: string[], body: string[][]): void {
  console.log(`\n## ${title}\n`);
  console.log(`| ${header.join(' | ')} |`);
  console.log(`|${header.map(() => '---').join('|')}|`);
  for (let i = 0; i < body.length; i++) {
    console.log(`| ${body[i].join(' | ')} |`);
  }
}

// --------------------------------------------------------------------------
// fixtures
// --------------------------------------------------------------------------

const EU_LARGE: Egg = eggFromMinorDiameter(0.0435);
const JAMMY = donenessFromSlider(0.41);

function setupOf(over: Partial<CookSetup>): CookSetup {
  const base: CookSetup = {
    startMode: 'hot',
    eggStart_C: 4,
    ambient_C: 20,
    boiling_C: 100,
    timeToBoil_s: 0,
    cooling: 'ice',
    waterLitres: 2,
    eggCount: 4,
    eggMass_kg: EU_LARGE.mass_kg,
  };
  return { ...base, ...over };
}

/** Cook time in minutes for a target doneness. */
function cookMinutes(egg: Egg, setup: CookSetup, level: number): number {
  return solveCookTime(egg, setup, DEFAULT_PARAMS, donenessFromSlider(level)).result.cookTime_s / 60;
}

// --------------------------------------------------------------------------
// headline scenarios
// --------------------------------------------------------------------------

check('jammy, fridge 4 C, sea level', cookMinutes(EU_LARGE, setupOf({}), 0.41), 7.36, TOL_MIN, 'min');

check(
  'jammy, room temp 21 C',
  cookMinutes(EU_LARGE, setupOf({ eggStart_C: 21, ambient_C: 21 }), 0.41),
  6.23, TOL_MIN, 'min',
);

check(
  'jammy, fridge, 2000 m',
  cookMinutes(EU_LARGE, setupOf({ boiling_C: boilingPointAtAltitude(2000) }), 0.41),
  8.21, TOL_MIN, 'min',
);

// Size sweep — tau scales as M^(2/3), so cook time is far from linear in mass.
const SIZE_GRAMS = [48, 58, 68, 76];
const SIZE_EXPECTED = [6.23, 7.03, 7.78, 8.35];
for (let i = 0; i < SIZE_GRAMS.length; i++) {
  const egg = eggFromMass(SIZE_GRAMS[i] / 1000);
  check(
    `jammy, ${SIZE_GRAMS[i]} g egg`,
    cookMinutes(egg, setupOf({ eggMass_kg: egg.mass_kg }), 0.41),
    SIZE_EXPECTED[i], TOL_MIN, 'min',
  );
}

// Cold start: the answer is "minutes AFTER the water boils", which is what a
// cook can actually act on. A faster hob means MORE time after boiling,
// because less cooking happened during the ramp.
const RAMP_MIN = [4, 8, 12];
const RAMP_AFTER_EXPECTED = [4.9, 2.9, 1.0];
const coldRows: string[][] = [];
for (let i = 0; i < RAMP_MIN.length; i++) {
  const setup = setupOf({ startMode: 'cold', timeToBoil_s: RAMP_MIN[i] * 60 });
  const total = cookMinutes(EU_LARGE, setup, 0.41);
  const after = total - RAMP_MIN[i];
  check(`cold start, ${RAMP_MIN[i]} min ramp: after boiling`, after, RAMP_AFTER_EXPECTED[i], TOL_MIN, 'min');
  coldRows.push([
    `${RAMP_MIN[i]} min`, total.toFixed(2), after.toFixed(2), RAMP_AFTER_EXPECTED[i].toFixed(2),
  ]);
}

// Altitude penalty at Denver (1609 m), hard-boiled.
const denverSetup = setupOf({ boiling_C: boilingPointAtAltitude(1609) });
const hardSea = cookMinutes(EU_LARGE, setupOf({}), 1.0);
const hardDenver = cookMinutes(EU_LARGE, denverSetup, 1.0);
check(
  'Denver 1609 m hard-boiled vs sea level',
  100 * (hardDenver / hardSea - 1), 12.0, 3.0, '%',
);

// Carryover: identical 7.4-minute cook, only the cooling step changes.
const CARRY_COOLING: CookSetup['cooling'][] = ['ice', 'tap', 'counter'];
const CARRY_EXPECTED = [65.0, 65.6, 76.3];
const carryRows: string[][] = [];
for (let i = 0; i < CARRY_COOLING.length; i++) {
  const r = simulate(EU_LARGE, setupOf({ cooling: CARRY_COOLING[i] }), DEFAULT_PARAMS, 7.4 * 60);
  check(`carryover peak yolk, 7.4 min cook, ${CARRY_COOLING[i]}`, r.peakYolk_C, CARRY_EXPECTED[i], 0.5, 'C');
  carryRows.push([
    CARRY_COOLING[i],
    r.yolkAtPull_C.toFixed(1),
    r.peakYolk_C.toFixed(1),
    (r.peakYolk_C - r.yolkAtPull_C).toFixed(1),
    (r.peakYolkTime_s / 60).toFixed(1),
  ]);
}

/** Sea-level jammy cook time, computed once and reused by the altitude table. */
let jammySeaLevelCache = -1;
function jammySeaLevel(): number {
  if (jammySeaLevelCache < 0) jammySeaLevelCache = cookMinutes(EU_LARGE, setupOf({}), 0.41);
  return jammySeaLevelCache;
}

// Altitude table. Also re-checks the 100 - h/300 one-liner, which PLAN.md
// claims holds to 0.03 C over 0-5000 m.
const altitudeRows: string[][] = [];
let worstApproxError = 0;
for (let h = 0; h <= 5000; h += 500) {
  const boiling = boilingPointAtAltitude(h);
  const approx = boilingPointApprox(h);
  const error = Math.abs(boiling - approx);
  if (error > worstApproxError) worstApproxError = error;
  const minutes = cookMinutes(EU_LARGE, setupOf({ boiling_C: boiling }), 0.41);
  altitudeRows.push([
    String(h),
    (pressureAtAltitude(h) / 1000).toFixed(2),
    boiling.toFixed(2),
    approx.toFixed(2),
    (boiling - approx).toFixed(3),
    minutes.toFixed(2),
    `+${(100 * (minutes / jammySeaLevel() - 1)).toFixed(1)}%`,
  ]);
}
check('T_b(h) vs 100 - h/300, 0-5000 m (worst case)', worstApproxError, 0.0, 0.05, 'C');

// --------------------------------------------------------------------------
// report
// --------------------------------------------------------------------------

console.log('# actual_egg_timer — validation report');
console.log(
  '\nReference egg: EU Large, 43.5 mm minor diameter, ' +
  `${(1000 * EU_LARGE.mass_kg).toFixed(1)} g, equal-volume radius ` +
  `${(1000 * EU_LARGE.radius_m).toFixed(2)} mm.` +
  '\nFridge-cold 4 C, hot start, ice bath, jammy = slider 0.41 ' +
  `(yolk dose target ${JAMMY.yolkDose_min.toFixed(2)} min-eq @63 C) unless a row says otherwise.`,
);

printTable(
  'Validation targets',
  ['scenario', 'expected', 'actual', 'tolerance', ''],
  rows.map((r) => [r.scenario, r.expected, r.actual, r.tolerance, r.status]),
);

printTable(
  'Cold start — where the cooking happens depends on the hob',
  ['time to boil', 'total (min)', 'after boiling (min)', 'expected after (min)'],
  coldRows,
);

printTable(
  'Carryover — identical 7.4 min cook, cooling varied',
  ['cooling', 'yolk at pull (C)', 'peak yolk (C)', 'rise after pull (C)', 'peak at (min)'],
  carryRows,
);

// Doneness slider sweep.
const sliderRows: string[][] = [];
for (const level of [0, 0.22, 0.41, 0.62, 1.0]) {
  const solution = solveCookTime(EU_LARGE, setupOf({}), DEFAULT_PARAMS, donenessFromSlider(level));
  let label = '';
  for (let i = 0; i < DONENESS_ANCHORS.length; i++) {
    if (Math.abs(DONENESS_ANCHORS[i].level - level) < 1e-9) label = DONENESS_ANCHORS[i].label;
  }
  sliderRows.push([
    level.toFixed(2),
    label,
    (solution.result.cookTime_s / 60).toFixed(2),
    solution.result.peakYolk_C.toFixed(1),
    solution.result.peakWhite_C.toFixed(1),
    solution.reachable ? 'yes' : 'no',
  ]);
}
printTable(
  'Doneness slider (EU Large, fridge, sea level, ice bath)',
  ['level', 'label', 'cook (min)', 'peak yolk (C)', 'peak white (C)', 'reachable'],
  sliderRows,
);

printTable(
  'Altitude (jammy, fridge, ice bath)',
  ['altitude (m)', 'pressure (kPa)', 'T_boil (C)', '100 - h/300', 'diff', 'cook (min)', 'vs sea level'],
  altitudeRows,
);

console.log(`\n**${rows.length - failures}/${rows.length} checks passed.**`);
if (failures > 0) {
  console.log(`\n${failures} FAILED — the model no longer reproduces its validation targets.`);
  process.exit(1);
}
console.log('\nAll validation targets reproduced.');
