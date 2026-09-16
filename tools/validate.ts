/**
 * Validation harness: reproduces every number in PLAN.md's validation table
 * from the frozen core API, checks the model against published measurements,
 * and prints a markdown report.
 *
 * Run: npx tsc && node dist/tools/validate.js
 * Exits non-zero if any check fails, so it can gate a commit.
 *
 * Reference setup unless a row says otherwise: EU Large egg (43.5 mm minor
 * diameter, ~62 g), fridge-cold at 4 C, hot start into boiling water, ice
 * bath afterwards, jammy = slider 0.41.
 */

import { eggFromMinorDiameter, eggFromMass, Egg } from '../src/core/geometry.js';
import { seriesTheta, biotNumber } from '../src/core/sphere.js';
import { zFromActivationEnergy } from '../src/core/kinetics.js';
import { ALPHA_DEFAULT, H_EFF, Z_YOLK, Z_WHITE, TREF_YOLK_C } from '../src/core/constants.js';
import { boilingPointAtAltitude, boilingPointApprox, pressureAtAltitude } from '../src/core/thermo.js';
import { CookSetup, panTimeConstant } from '../src/core/protocol.js';
import {
  simulate, solveCookTime, donenessFromSlider, sliderFromYolkDose,
  DEFAULT_PARAMS, DONENESS_ANCHORS, YOLK_DOSE_HARD,
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

/** The doneness label nearest a slider position, for the report tables. */
function anchorNear(level: number): string {
  let best = DONENESS_ANCHORS[0];
  for (let i = 0; i < DONENESS_ANCHORS.length; i++) {
    if (Math.abs(DONENESS_ANCHORS[i].level - level) < Math.abs(best.level - level)) {
      best = DONENESS_ANCHORS[i];
    }
  }
  return best.label;
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
// room temperature: where it matters, and where it does not
//
// There is no input for this. The table is the argument for that decision.
// --------------------------------------------------------------------------

const roomRows: string[][] = [];
for (const room of [10, 20, 30]) {
  const hot = cookMinutes(EU_LARGE, setupOf({ ambient_C: room }), 0.41);
  const cold = cookMinutes(
    EU_LARGE, setupOf({ ambient_C: room, startMode: 'cold', timeToBoil_s: 480 }), 0.41,
  );
  const standing = solveCookTime(
    EU_LARGE,
    setupOf({ ambient_C: room, startMode: 'cold', afterBoil: 'off', timeToBoil_s: 480 }),
    DEFAULT_PARAMS, donenessFromSlider(0.41),
  );
  const counter = simulate(
    EU_LARGE, setupOf({ ambient_C: room, cooling: 'counter' }), DEFAULT_PARAMS, 7.4 * 60,
  );
  roomRows.push([
    `${room} °C`,
    hot.toFixed(2),
    cold.toFixed(2),
    ((standing.result.cookTime_s - 480) / 60).toFixed(2),
    counter.peakYolk_C.toFixed(2),
  ]);
}

// The default path does not care at all: the ramp is not simulated and an ice
// bath does not care what the room is doing.
check(
  'room temperature is inert on a hot start into an ice bath',
  cookMinutes(EU_LARGE, setupOf({ ambient_C: 30 }), 0.41)
  - cookMinutes(EU_LARGE, setupOf({ ambient_C: 10 }), 0.41),
  0.0, 0.001, 'min',
);

// --------------------------------------------------------------------------
// the standing method: boil, cover, heat off
// --------------------------------------------------------------------------

const standingRows: string[][] = [];

/** Cold start, heat killed at the boil, cooled under the tap - Williams'
 *  description of the method, as closely as this model can express it. */
function standingSetup(boil_s: number, litres: number): CookSetup {
  return setupOf({
    startMode: 'cold', afterBoil: 'off', timeToBoil_s: boil_s,
    waterLitres: litres, cooling: 'tap',
  });
}

// Williams: "put the eggs into a pan of cold water and bring it to the boil,
// then remove the heat and let the pan stand with its lid on for about
// seventeen minutes". With an 8-minute boil that lands just past this app's
// Hard - and the interesting part is that it does not matter much: the water is
// falling, so the dose saturates and 12 minutes of standing gives the same egg
// as 30. That is why a folk method can get away with "about".
const williams = simulate(EU_LARGE, standingSetup(480, 2), DEFAULT_PARAMS, 480 + 17 * 60);
check("Williams' standing method: 17 min, peak yolk", williams.peakYolk_C, 75.6, 1.0, 'C');
check(
  "Williams' standing method: 17 min reaches hard",
  williams.yolkDose_min >= YOLK_DOSE_HARD ? 1 : 0, 1, 0, '',
);

const standing20 = simulate(EU_LARGE, standingSetup(480, 2), DEFAULT_PARAMS, 480 + 20 * 60);
const standing30 = simulate(EU_LARGE, standingSetup(480, 2), DEFAULT_PARAMS, 480 + 30 * 60);
check(
  'standing dose saturates: 20 min vs 30 min',
  100 * (standing30.yolkDose_min / standing20.yolkDose_min - 1), 0.0, 1.0, '%',
);

// The pan is the whole story. A fast boil means a pan that could not hold much
// heat in the first place, and it runs out before the yolk is done.
for (const boil of [240, 360, 480, 600]) {
  const sol = solveCookTime(EU_LARGE, standingSetup(boil, 2), DEFAULT_PARAMS, donenessFromSlider(1.0));
  standingRows.push([
    `${boil / 60} min`,
    `${(panTimeConstant(boil) / 60).toFixed(1)} min`,
    sol.whiteSets ? anchorNear(sol.hardestLevel) : 'nothing',
    sol.reachable ? `${((sol.result.cookTime_s - boil) / 60).toFixed(1)} min`
      : sol.whiteSets ? 'cannot reach hard' : 'never sets the white',
  ]);
}
check(
  'a 4-minute boil cannot stand its way to hard',
  solveCookTime(EU_LARGE, standingSetup(240, 2), DEFAULT_PARAMS, donenessFromSlider(1.0))
    .hardestLevel < 1 ? 1 : 0,
  1, 0, '',
);


// --------------------------------------------------------------------------
// external validation: published measurements, not our own targets
//
// Everything above checks that the model still reproduces ITSELF. This section
// checks it against numbers somebody else measured and printed. See
// references.bib and README section 10.
// --------------------------------------------------------------------------

const externalRows: string[][] = [];

/** Fourier number at which the CENTRE of a sphere reaches a given
 *  theta = (Ts - T)/(Ts - T0), by bisection on the 40-term series. */
function fourierForCentre(theta: number): number {
  let lo = 1e-4;
  let hi = 2.0;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (seriesTheta(0.0, mid) > theta) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

// --- Williams (1998), the Exeter one-term formula -------------------------
// His stated properties, in his units: rho g/cm^3, c J/g/K, K W/cm/K. The
// prefactor he publishes is 0.451 min per g^(2/3); we reconstruct it, which is
// what pins the reading of his 0.76 (see README section 3).
const W_RHO = 1.038;
const W_C = 3.7;
const W_K = 5.4e-3;
const williamsPrefactor_s =
  W_C * Math.pow(W_RHO, 1 / 3) / (W_K * Math.PI * Math.PI * Math.pow(4 * Math.PI / 3, 2 / 3));

function williamsMinutes(mass_g: number, egg_C: number, water_C: number, yolk_C: number): number {
  return williamsPrefactor_s * Math.pow(mass_g, 2 / 3)
    * Math.log(0.76 * (egg_C - water_C) / (yolk_C - water_C)) / 60;
}

check('Williams prefactor from his rho, c, K', williamsPrefactor_s / 60, 0.451, 0.002, 'min/g^(2/3)');
check("Williams' worked example: 57 g, 4 C, yolk 63 C", williamsMinutes(57, 4, 100, 63), 4.5, 0.1, 'min');

// His 21 C example does NOT reproduce: he prints "three and a half minutes",
// his own formula gives 3.23. Reported, not checked - the discrepancy is his.
// His other three examples (47 g -> 4 min, 57 g -> 4.5, 67 g -> 5) all land.
externalRows.push([
  'Williams 1998', '57 g from 21 C, yolk 63 C',
  '~3.5 min (his text)', williamsMinutes(57, 21, 100, 63).toFixed(2) + ' min',
  'UNRESOLVED - see README 11.1',
]);
externalRows.push([
  'Williams 1998', '47 g and 67 g from 4 C',
  '4 and 5 min', williamsMinutes(47, 4, 100, 63).toFixed(2) + ' and ' + williamsMinutes(67, 4, 100, 63).toFixed(2) + ' min',
  'reproduced',
]);

// --- Buay et al. (2006), a real thermocouple trace ------------------------
// Their egg: prolate semi-axes a = 27.11 mm, b = 21.22 mm, uniform at 25.8 C,
// dropped into a stirred bath held at 100.5 C. Time for the CENTRE to reach
// 85 C - their experimentally determined hard-boiled criterion - was measured
// at 750 s. Their own eq. 18 predicted 745 s.
const BUAY_A = 0.02711;
const BUAY_B = 0.02122;
const BUAY_T0 = 25.8;
const BUAY_TB = 100.5;
const BUAY_TC = 85.0;
const BUAY_MEASURED_S = 750.0;
const BUAY_ALPHA = 1.6e-7;

// Their equivalent radius is the one that preserves the surface-to-volume
// ratio of the spheroid, r_e = 2ab/(b + beta*a), NOT the equal-volume radius.
const buayEcc = Math.sqrt(1 - (BUAY_B * BUAY_B) / (BUAY_A * BUAY_A));
const buayBeta = Math.asin(buayEcc) / buayEcc;
const buayRe_m = 2 * BUAY_A * BUAY_B / (BUAY_B + buayBeta * BUAY_A);
const buayEqualVolume_m = Math.cbrt(BUAY_A * BUAY_B * BUAY_B);

const buayFourier = fourierForCentre((BUAY_TB - BUAY_TC) / (BUAY_TB - BUAY_T0));
function buaySeconds(radius_m: number, alpha_m2s: number): number {
  return buayFourier * radius_m * radius_m / alpha_m2s;
}

// 1. Our series, their radius convention, their fitted alpha: should land on
//    their published prediction. This tests sphere.ts against somebody else's
//    independent implementation of the same physics.
check(
  'Buay 2006 fig 6 vs their published prediction',
  buaySeconds(buayRe_m, BUAY_ALPHA), 745.0, 10.0, 's',
);

// 2. The same trace against OUR defaults - equal-volume radius, calibrated
//    alpha. This is the honest external error bar on the whole conduction
//    model: no ramp, no dip, no carryover, just a cold egg into boiling water.
const buayOurs_s = buaySeconds(buayEqualVolume_m, ALPHA_DEFAULT);
check(
  'Buay 2006 measured 750 s vs our defaults',
  buayOurs_s, BUAY_MEASURED_S, 45.0, 's',
);
externalRows.push([
  'Buay et al. 2006', 'centre to 85 C, 100.5 C bath',
  '750 s measured', buayOurs_s.toFixed(0) + ' s',
  (100 * (buayOurs_s / BUAY_MEASURED_S - 1)).toFixed(1) + '% fast at ALPHA_DEFAULT',
]);
externalRows.push([
  'Buay et al. 2006', 'their fitted whole-egg alpha',
  '1.6e-7 (1.5-1.8e-7)', ALPHA_DEFAULT.toExponential(2),
  ALPHA_DEFAULT >= 1.5e-7 && ALPHA_DEFAULT <= 1.8e-7 ? 'inside their band' : 'OUTSIDE their band',
]);

// --- Vega & Mercade-Prieto (2011), absolute yolk gelation ------------------
// Their Arrhenius fit for isothermal yolk gelation, t_gel in minutes. (As
// printed the equation is typeset with the wrong sign; this is the form that
// reproduces their own figure 4.)
function vegaGelMinutes(temperature_C: number): number {
  return 8.85e-72 * Math.exp(469e3 / (8.314 * (temperature_C + 273.15)));
}

// Read at our own reference temperature this IS a dose in our units: the
// equivalent minutes at 63 C needed to gel a yolk. It should land on the
// slider somewhere between jammy and hard - a gelled yolk is set, not jammy.
const vegaGelDose_min = vegaGelMinutes(TREF_YOLK_C);
const vegaSlider = sliderFromYolkDose(vegaGelDose_min);
check('Vega 2011 yolk gel point as a slider position', vegaSlider, 0.68, 0.06, '');
externalRows.push([
  'Vega & Mercade-Prieto 2011', 'yolk gel point, min-eq @63 C',
  vegaGelDose_min.toFixed(0) + ' min-eq', 'slider ' + vegaSlider.toFixed(2),
  'between Jammy (0.41) and Hard (1.0)',
]);

// Their activation energies, pushed through our own z conversion.
check('Z_YOLK from Ea = 469 kJ/mol at 338 K', zFromActivationEnergy(469e3, 338.15), Z_YOLK, 0.15, 'K');
check('Z_WHITE from Ea = 480 kJ/mol at 353 K', zFromActivationEnergy(480e3, 353.15), Z_WHITE, 0.05, 'K');

// --- Denys et al. (2003/2004), the surface coefficient --------------------
// Measured h = 490 W/m^2K on the outer shell, plus a measured shell thickness
// of 0.35-0.5 mm at 2.25 W/mK. In series that is the effective coefficient our
// H_EFF is trying to be - and H_EFF is about twice it. Reported, not checked:
// this is an open problem, not a regression.
const DENYS_H = 490.0;
const DENYS_SHELL_M = 0.4e-3;
const DENYS_SHELL_K = 2.25;
const denysEffective = 1 / (1 / DENYS_H + DENYS_SHELL_M / DENYS_SHELL_K);
externalRows.push([
  'Denys et al. 2003', 'h at the shell, + shell in series',
  denysEffective.toFixed(0) + ' W/m^2K', H_EFF.toFixed(0) + ' W/m^2K',
  'Bi ' + biotNumber(denysEffective, EU_LARGE.radius_m).toFixed(0) +
  ' vs ' + biotNumber(H_EFF, EU_LARGE.radius_m).toFixed(0) + ' - see README 11.2',
]);


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
  'Room temperature - 10 C to 30 C, everything else fixed',
  ['room', 'hot start, jammy (min)', 'cold start, jammy (min)',
    'standing for jammy (min after boil)', 'counter-rested peak yolk (C)'],
  roomRows,
);

printTable(
  'Heat off at the boil - what the pan can still do',
  ['time to boil', 'pan time constant', 'hardest reachable', 'standing time for hard'],
  standingRows,
);

printTable(
  'External validation - published measurements, not our own targets',
  ['source', 'quantity', 'published', 'this model', 'note'],
  externalRows,
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
