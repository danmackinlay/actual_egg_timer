/**
 * The model against its validation targets and published measurements:
 * every check in README section 7's table, from the core's exports. Each
 * check, and each row of the section's other tables, is logged as a `#` line
 * with the number computed, which is where README section 7's numbers come
 * from.
 *
 * Reference setup unless a check says otherwise: the reference egg (43.5 mm
 * minor diameter, ~62 g; not the app's 68 g EU Large), fridge-cold at 4 C,
 * hot start into boiling water, ice bath afterwards, jammy = slider 0.41.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { eggFromMinorDiameter, eggFromMass, type Egg } from '../src/core/geometry.ts';
import { parseCatalogue, render } from '../src/core/copy.ts';
import {
  seriesTheta, biotNumber, createSphere, stepSphere, meanTemperature,
} from '../src/core/sphere.ts';
import { zFromActivationEnergy } from '../src/core/kinetics.ts';
import {
  ALPHA_DEFAULT, H_EFF, Z_YOLK, Z_WHITE, TREF_YOLK_C, RAMP_R, TAU_STANDING_SCALE, TAU_STANDING_REF_S, DT_SIM,
} from '../src/core/constants.ts';
import { boilingPointAtAltitude, boilingPointApprox, pressureAtAltitude } from '../src/core/thermo.ts';
import {
  type CookSetup, panTimeConstant, bathTemperature, initialSurfaceTemperature,
} from '../src/core/protocol.ts';
import {
  simulate, solveCookTime, donenessFromSlider, sliderFromYolkDose,
  DEFAULT_PARAMS, DONENESS_ANCHORS, YOLK_DOSE_HARD,
} from '../src/core/solve.ts';
import { referenceSetup } from '../tools/common.ts';

/** The tables name the anchors in English, as the app does. */
const EN = parseCatalogue(JSON.parse(readFileSync('copy/en.json', 'utf8')));

/** Default tolerance on a cook time, minutes. */
const TOL_MIN = 0.3;

/** `actual` within `tolerance` of `expected`: a row of README section 7's
 *  table, logged with the number computed. */
function near(scenario: string, actual: number, expected: number, tolerance: number, unit: string): void {
  console.log(`# ${scenario}: ${actual.toFixed(2)} ${unit}, expected ${expected.toFixed(2)} ±${tolerance}`);
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${scenario}: ${actual} ${unit}, expected ${expected} ±${tolerance} ${unit}`);
}

/** A row of one of README section 7's other tables, logged. */
function row(table: string, cells: string[]): void {
  console.log(`# ${table}: ${cells.join(' | ')}`);
}

const REFERENCE_EGG: Egg = eggFromMinorDiameter(0.0435);

/** The doneness label nearest a slider position, for the tables. */
function anchorNear(level: number): string {
  let best = DONENESS_ANCHORS[0];
  for (let i = 0; i < DONENESS_ANCHORS.length; i++) {
    if (Math.abs(DONENESS_ANCHORS[i].level - level) < Math.abs(best.level - level)) {
      best = DONENESS_ANCHORS[i];
    }
  }
  return render(EN, best.key);
}

/** Cook time in minutes for a target doneness. */
function cookMinutes(egg: Egg, setup: CookSetup, level: number): number {
  return solveCookTime(egg, setup, DEFAULT_PARAMS, donenessFromSlider(level)).result.cookTime_s / 60;
}

// --------------------------------------------------------------------------
// the model against its own targets
// --------------------------------------------------------------------------

test('jammy from the fridge, from room temperature, at 2000 m, and by size', () => {
  near('jammy, fridge 4 C, sea level', cookMinutes(REFERENCE_EGG, referenceSetup({}), 0.41), 7.36, TOL_MIN, 'min');
  near(
    'jammy, room temp 21 C',
    cookMinutes(REFERENCE_EGG, referenceSetup({ eggStart_C: 21, ambient_C: 21 }), 0.41),
    6.23, TOL_MIN, 'min',
  );
  near(
    'jammy, fridge, 2000 m',
    cookMinutes(REFERENCE_EGG, referenceSetup({ boiling_C: boilingPointAtAltitude(2000) }), 0.41),
    8.21, TOL_MIN, 'min',
  );
  // tau scales as M^(2/3), so cook time is far from linear in mass.
  const sizes: [number, number][] = [[48, 6.23], [58, 7.03], [68, 7.78], [76, 8.35]];
  for (const [grams, expected] of sizes) {
    near(`jammy, ${grams} g egg`, cookMinutes(eggFromMass(grams / 1000), referenceSetup({}), 0.41), expected, TOL_MIN, 'min');
  }
  // The doneness slider's anchors, for the table.
  for (const level of [0, 0.22, 0.41, 0.62, 1.0]) {
    const solution = solveCookTime(REFERENCE_EGG, referenceSetup({}), DEFAULT_PARAMS, donenessFromSlider(level));
    row('slider', [
      level.toFixed(2),
      anchorNear(level),
      (solution.result.cookTime_s / 60).toFixed(2),
      solution.result.peakYolk_C.toFixed(1),
      solution.result.peakWhite_C.toFixed(1),
      solution.reachable ? 'yes' : 'no',
    ]);
  }
});

test('a cold start: a faster hob means more time after the boil', () => {
  // The answer is "minutes AFTER the water boils", which is what a cook can
  // act on. A faster hob means MORE time after boiling, because less cooking
  // happened during the ramp.
  const ramps: [number, number][] = [[4, 4.9], [8, 2.9], [12, 1.0]];
  for (const [ramp_min, expected] of ramps) {
    const setup = referenceSetup({ startMode: 'cold', timeToBoil_s: ramp_min * 60 });
    const total = cookMinutes(REFERENCE_EGG, setup, 0.41);
    near(`cold start, ${ramp_min} min ramp: after boiling`, total - ramp_min, expected, TOL_MIN, 'min');
    row('cold start', [`${ramp_min} min`, total.toFixed(2), (total - ramp_min).toFixed(2), expected.toFixed(2)]);
  }
});

test('altitude: Denver\'s hard-boiled penalty, and the boiling point\'s one-liner', () => {
  const hardSea = cookMinutes(REFERENCE_EGG, referenceSetup({}), 1.0);
  const hardDenver = cookMinutes(REFERENCE_EGG, referenceSetup({ boiling_C: boilingPointAtAltitude(1609) }), 1.0);
  near('Denver 1609 m hard-boiled vs sea level', 100 * (hardDenver / hardSea - 1), 12.0, 3.0, '%');

  // The 100 - h/300 one-liner holds over 0-5000 m.
  const jammySea = cookMinutes(REFERENCE_EGG, referenceSetup({}), 0.41);
  let worstApproxError = 0;
  for (let h = 0; h <= 5000; h += 500) {
    const boiling = boilingPointAtAltitude(h);
    const approx = boilingPointApprox(h);
    worstApproxError = Math.max(worstApproxError, Math.abs(boiling - approx));
    const minutes = cookMinutes(REFERENCE_EGG, referenceSetup({ boiling_C: boiling }), 0.41);
    row('altitude', [
      String(h),
      (pressureAtAltitude(h) / 1000).toFixed(2),
      boiling.toFixed(2),
      approx.toFixed(2),
      (boiling - approx).toFixed(3),
      minutes.toFixed(2),
      `+${(100 * (minutes / jammySea - 1)).toFixed(1)}%`,
    ]);
  }
  near('T_b(h) vs 100 - h/300, 0-5000 m (worst case)', worstApproxError, 0.0, 0.05, 'C');
});

test('carryover: the same 7.4 min cook under each cooling, against the insulated ceiling', () => {
  const carry: [CookSetup['cooling'], number][] = [['ice', 65.0], ['tap', 65.6], ['counter', 75.3], ['eggCup', 63.3]];
  let iceAtPull = 0;
  for (const [cooling, expected] of carry) {
    const r = simulate(REFERENCE_EGG, referenceSetup({ cooling: cooling }), DEFAULT_PARAMS, 7.4 * 60);
    near(`carryover peak yolk, 7.4 min cook, ${cooling}`, r.peakYolk_C, expected, 0.5, 'C');
    if (cooling === 'ice') iceAtPull = r.yolkAtPull_C;
    row('carryover', [
      cooling, r.yolkAtPull_C.toFixed(1), r.peakYolk_C.toFixed(1),
      (r.peakYolk_C - r.yolkAtPull_C).toFixed(1), (r.peakYolkTime_s / 60).toFixed(1),
    ]);
  }
  // The ceiling all three are measured against: an insulated egg carries the
  // yolk to the mean temperature it left the water with. README section 5
  // says how much of that the counter takes.
  const setup = referenceSetup({});
  const sphere = createSphere(
    REFERENCE_EGG.radius_m, DEFAULT_PARAMS.alpha_m2s, setup.eggStart_C,
    initialSurfaceTemperature(REFERENCE_EGG, setup),
  );
  for (let t = DT_SIM; t <= 7.4 * 60 + 1e-9; t += DT_SIM) {
    stepSphere(sphere, DT_SIM, bathTemperature(REFERENCE_EGG, setup, t));
  }
  const ceiling = meanTemperature(sphere);
  near('insulated ceiling, 7.4 min cook (mean temperature at the pull)', ceiling, 83.9, 0.5, 'C');
  row('carryover', ['insulated (the ceiling)', iceAtPull.toFixed(1), ceiling.toFixed(1), (ceiling - iceAtPull).toFixed(1), 'never']);
});

test('a bowl of still water, two eggs in 2 L at 20 C, is running water at 20 C to the second', () => {
  // It warms by under 3 C, so it is running water at 20 C to within a couple
  // of seconds of jammy (README.md section 2.4; studies/bowl.ts, from a loop of
  // its own).
  const bowl = cookMinutes(REFERENCE_EGG, referenceSetup({ eggCount: 2, cooling: 'bowl', bowlLitres: 2, coolingWater_C: 20 }), 0.41);
  const tap = cookMinutes(REFERENCE_EGG, referenceSetup({ eggCount: 2, cooling: 'tap', coolingWater_C: 20 }), 0.41);
  near('a 2 L bowl at 20 C against running water at 20 C, two eggs, jammy', 60 * (bowl - tap), 0.0, 2.0, 's');
});

test('room temperature is inert on a hot start into an ice bath', () => {
  // There is no input for it. The table is the argument for that decision:
  // the default path does not care at all, since the ramp is not simulated
  // and an ice bath does not care what the room is doing.
  near(
    'room temperature is inert on a hot start into an ice bath',
    cookMinutes(REFERENCE_EGG, referenceSetup({ ambient_C: 30 }), 0.41)
    - cookMinutes(REFERENCE_EGG, referenceSetup({ ambient_C: 10 }), 0.41),
    0.0, 0.001, 'min',
  );
  for (const room of [10, 20, 30]) {
    const hot = cookMinutes(REFERENCE_EGG, referenceSetup({ ambient_C: room }), 0.41);
    const cold = cookMinutes(REFERENCE_EGG, referenceSetup({ ambient_C: room, startMode: 'cold', timeToBoil_s: 480 }), 0.41);
    const standing = solveCookTime(
      REFERENCE_EGG, referenceSetup({ ambient_C: room, startMode: 'cold', afterBoil: 'off', timeToBoil_s: 480 }),
      DEFAULT_PARAMS, donenessFromSlider(0.41),
    );
    const counter = simulate(REFERENCE_EGG, referenceSetup({ ambient_C: room, cooling: 'counter' }), DEFAULT_PARAMS, 7.4 * 60);
    row('room', [
      `${room} °C`, hot.toFixed(2), cold.toFixed(2),
      ((standing.result.cookTime_s - 480) / 60).toFixed(2), counter.peakYolk_C.toFixed(2),
    ]);
  }
});

/** Cold start, heat killed at the boil, cooled under the tap - Williams'
 *  description of the standing method, as closely as this model can express
 *  it. */
function standingSetup(boil_s: number, litres: number): CookSetup {
  return referenceSetup({
    startMode: 'cold', afterBoil: 'off', timeToBoil_s: boil_s,
    waterLitres: litres, cooling: 'tap',
  });
}

test('the standing method: Williams\' seventeen minutes, a dose that saturates, and the pan\'s time constant', () => {
  // Williams: "put the eggs into a pan of cold water and bring it to the
  // boil, then remove the heat and let the pan stand with its lid on for
  // about seventeen minutes". With an 8-minute boil that lands just past this
  // app's Hard - and it does not matter much: the water is falling, so the
  // dose saturates and 12 minutes of standing gives the same egg as 30. That
  // is why a folk method can get away with "about".
  const williams = simulate(REFERENCE_EGG, standingSetup(480, 2), DEFAULT_PARAMS, 480 + 17 * 60);
  near("Williams' standing method: 17 min, peak yolk", williams.peakYolk_C, 75.6, 1.0, 'C');
  assert.ok(williams.yolkDose_min >= YOLK_DOSE_HARD, "Williams' standing method: 17 min reaches hard");
  const standing20 = simulate(REFERENCE_EGG, standingSetup(480, 2), DEFAULT_PARAMS, 480 + 20 * 60);
  const standing30 = simulate(REFERENCE_EGG, standingSetup(480, 2), DEFAULT_PARAMS, 480 + 30 * 60);
  near('standing dose saturates: 20 min vs 30 min', 100 * (standing30.yolkDose_min / standing20.yolkDose_min - 1), 0.0, 1.0, '%');

  // The pan's time constant comes from the water volume. The old rule read it
  // off the time to boil, which for a fixed hob grows LINEARLY with volume
  // (the boil time is proportional to the heat capacity), while a pan's
  // losses grow with its surface, so the new rule goes as the cube root. The
  // two agree at the anchor - 2 L on a hob that boils it in 8 minutes - and
  // nowhere else. Logged side by side so the disagreement is visible: the
  // exponent is a judgement, and this is the table that would show it wrong.
  const oldRuleTau = (boil_s: number): number => TAU_STANDING_SCALE * boil_s / Math.log(RAMP_R / (RAMP_R - 1.0));
  near(
    `pan time constant at 2 L (${TAU_STANDING_REF_S.toFixed(1)} s) is the old rule's at an 8-minute boil`,
    panTimeConstant(2), oldRuleTau(480), 1e-9, 's',
  );
  // A typical hob: 2 L to a rolling boil in 8 minutes, and in proportion.
  // That a litre cannot stand its way to hard, and three litres can, is
  // test/core.test.ts; the table shows it.
  for (const litres of [1, 2, 3, 4]) {
    const boil = 240 * litres;
    const tau = panTimeConstant(litres);
    const old = oldRuleTau(boil);
    const sol = solveCookTime(REFERENCE_EGG, standingSetup(boil, litres), DEFAULT_PARAMS, donenessFromSlider(1.0));
    row('pan', [
      `${litres} L`, `${(tau / 60).toFixed(1)} min`, `${boil / 60} min`, `${(old / 60).toFixed(1)} min`,
      `${(old / tau).toFixed(2)}x`,
      sol.whiteSets ? anchorNear(sol.hardestLevel) : 'nothing',
      sol.reachable ? `${((sol.result.cookTime_s - boil) / 60).toFixed(1)} min`
        : sol.whiteSets ? 'cannot reach hard' : 'never sets the white',
    ]);
  }
});

// --------------------------------------------------------------------------
// external validation: published measurements, not our own targets
//
// Everything above checks that the model still reproduces ITSELF. These check
// it against numbers somebody else measured and printed. See references.bib
// and README section 10.
// --------------------------------------------------------------------------

test('Williams (1998): his prefactor from his properties, and his worked examples', () => {
  // His stated properties, in his units: rho g/cm^3, c J/g/K, K W/cm/K. The
  // prefactor he publishes is 0.451 min per g^(2/3); we reconstruct it, which
  // is what pins the reading of his 0.76 (see README section 3).
  const rho = 1.038;
  const c = 3.7;
  const k = 5.4e-3;
  const prefactor_s = c * Math.pow(rho, 1 / 3) / (k * Math.PI * Math.PI * Math.pow(4 * Math.PI / 3, 2 / 3));
  const minutes = (mass_g: number, egg_C: number, water_C: number, yolk_C: number): number =>
    prefactor_s * Math.pow(mass_g, 2 / 3) * Math.log(0.76 * (egg_C - water_C) / (yolk_C - water_C)) / 60;
  near('Williams prefactor from his rho, c, K', prefactor_s / 60, 0.451, 0.002, 'min/g^(2/3)');
  near("Williams' worked example: 57 g, 4 C, yolk 63 C", minutes(57, 4, 100, 63), 4.5, 0.1, 'min');
  // His 21 C example does NOT reproduce: he prints "three and a half
  // minutes", his own formula gives 3.23. Logged, not checked - the
  // discrepancy is his. His other examples (47 g -> 4 min, 67 g -> 5) land.
  row('external', ['Williams 1998', '57 g from 21 C, yolk 63 C', '~3.5 min (his text)',
    `${minutes(57, 21, 100, 63).toFixed(2)} min`, 'UNRESOLVED - see README 11.1']);
  row('external', ['Williams 1998', '47 g and 67 g from 4 C', '4 and 5 min',
    `${minutes(47, 4, 100, 63).toFixed(2)} and ${minutes(67, 4, 100, 63).toFixed(2)} min`, 'reproduced']);
});

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

test('Buay et al. (2006): a real thermocouple trace, by their prediction and by our defaults', () => {
  // Their egg: prolate semi-axes a = 27.11 mm, b = 21.22 mm, uniform at
  // 25.8 C, dropped into a stirred bath held at 100.5 C. Time for the CENTRE
  // to reach 85 C - their experimentally determined hard-boiled criterion -
  // was measured at 750 s. Their own eq. 18 predicted 745 s.
  const a = 0.02711;
  const b = 0.02122;
  const measured_s = 750.0;
  const alpha = 1.6e-7;
  // Their equivalent radius is the one that preserves the surface-to-volume
  // ratio of the spheroid, r_e = 2ab/(b + beta*a), NOT the equal-volume radius.
  const ecc = Math.sqrt(1 - (b * b) / (a * a));
  const beta = Math.asin(ecc) / ecc;
  const re_m = 2 * a * b / (b + beta * a);
  const equalVolume_m = Math.cbrt(a * b * b);
  const fourier = fourierForCentre((100.5 - 85.0) / (100.5 - 25.8));
  const seconds = (radius_m: number, alpha_m2s: number): number => fourier * radius_m * radius_m / alpha_m2s;

  // Our series, their radius convention, their fitted alpha: should land on
  // their published prediction. This tests sphere.ts against somebody else's
  // independent implementation of the same physics.
  near('Buay 2006 fig 6 vs their published prediction', seconds(re_m, alpha), 745.0, 10.0, 's');
  // The same trace against OUR defaults - equal-volume radius, calibrated
  // alpha. This is the honest external error bar on the whole conduction
  // model: no ramp, no dip, no carryover, just a cold egg into boiling water.
  const ours_s = seconds(equalVolume_m, ALPHA_DEFAULT);
  near('Buay 2006 measured 750 s vs our defaults', ours_s, measured_s, 45.0, 's');
  row('external', ['Buay et al. 2006', 'centre to 85 C, 100.5 C bath', '750 s measured', `${ours_s.toFixed(0)} s`,
    `${(100 * (ours_s / measured_s - 1)).toFixed(1)}% fast at ALPHA_DEFAULT`]);
  row('external', ['Buay et al. 2006', 'their fitted whole-egg alpha', '1.6e-7 (1.5-1.8e-7)', ALPHA_DEFAULT.toExponential(2),
    ALPHA_DEFAULT >= 1.5e-7 && ALPHA_DEFAULT <= 1.8e-7 ? 'inside their band' : 'OUTSIDE their band']);
});

test('Vega & Mercade-Prieto (2011): the yolk\'s gel point on the slider, and z from their activation energies', () => {
  // Their Arrhenius fit for isothermal yolk gelation, t_gel in minutes. (As
  // printed the equation is typeset with the wrong sign; this is the form
  // that reproduces their own figure 4.) Read at our own reference
  // temperature this IS a dose in our units: the equivalent minutes at 63 C
  // needed to gel a yolk. It should land on the slider between jammy and
  // hard - a gelled yolk is set, not jammy.
  const gelDose_min = 8.85e-72 * Math.exp(469e3 / (8.314 * (TREF_YOLK_C + 273.15)));
  const slider = sliderFromYolkDose(gelDose_min);
  near('Vega 2011 yolk gel point as a slider position', slider, 0.68, 0.06, '');
  row('external', ['Vega & Mercade-Prieto 2011', 'yolk gel point, min-eq @63 C', `${gelDose_min.toFixed(0)} min-eq`,
    `slider ${slider.toFixed(2)}`, 'between Jammy (0.41) and Hard (1.0)']);
  near('Z_YOLK from Ea = 469 kJ/mol at 338 K', zFromActivationEnergy(469e3, 338.15), Z_YOLK, 0.15, 'K');
  near('Z_WHITE from Ea = 480 kJ/mol at 353 K', zFromActivationEnergy(480e3, 353.15), Z_WHITE, 0.05, 'K');
});

test('Denys et al. (2003): the surface coefficient, logged against H_EFF', () => {
  // Measured h = 490 W/m^2K on the outer shell, plus a measured shell
  // thickness of 0.35-0.5 mm at 2.25 W/mK. In series that is the effective
  // coefficient H_EFF is trying to be - and H_EFF is about twice it. Logged,
  // not checked: this is an open problem, not a regression.
  const effective = 1 / (1 / 490.0 + 0.4e-3 / 2.25);
  row('external', ['Denys et al. 2003', 'h at the shell, + shell in series', `${effective.toFixed(0)} W/m^2K`,
    `${H_EFF.toFixed(0)} W/m^2K`,
    `Bi ${biotNumber(effective, REFERENCE_EGG.radius_m).toFixed(0)} vs ${biotNumber(H_EFF, REFERENCE_EGG.radius_m).toFixed(0)} - see README 11.2`]);
});
