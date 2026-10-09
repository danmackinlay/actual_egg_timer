/**
 * Independent check on `src/core/`.
 *
 * Expected numbers here were verified against a separate Python implementation
 * of the same physics. If one of these fails, the TypeScript implementation has
 * regressed — do NOT widen the tolerance to make it pass.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSphere, stepSphere, temperatureAt, centreTemperature, meanTemperature,
  seriesTheta, erfcTheta, oneTermTheta, biotNumber, erfc, robinSurface,
} from '../src/core/sphere.js';
import {
  boilingPointAtPressure, boilingPointAtAltitude, pressureAtAltitude, saltBoilingElevation,
} from '../src/core/thermo.js';
import { eggFromMass, eggFromMinorDiameter, diffusionTime } from '../src/core/geometry.js';
import {
  createDose, accumulateDose, holdTimeForDose,
} from '../src/core/kinetics.js';
import {
  CookSetup, bathTemperature, panTimeConstant, airTimeConstant, wetShellDrop_C,
} from '../src/core/protocol.js';
import {
  simulate, solveCookTime, donenessFromSlider, sliderFromYolkDose, DEFAULT_PARAMS,
} from '../src/core/solve.js';
import {
  H_EFF, Z_YOLK, TREF_YOLK_C, YOLK_RADIUS_FRAC, TAU_STANDING_REF_S, H_AIR, K_EGG, C_EGG,
  ALPHA_DEFAULT, DT_SIM,
} from '../src/core/constants.js';
import { referenceSetup } from '../tools/common.js';

// --------------------------------------------------------------------------
// shared fixtures
// --------------------------------------------------------------------------

/** The reference egg, 43.5 mm across and about 62.3 g (not the app's 68 g EU
 *  Large). The egg for every behavioural test below. */
const REFERENCE_EGG = eggFromMinorDiameter(0.0435);

function close(actual: number, expected: number, tol: number, what: string): void {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${what}: expected ${expected} +/- ${tol}, got ${actual} (delta ${actual - expected})`,
  );
}

// --------------------------------------------------------------------------
// 1. Series cross-validation
// --------------------------------------------------------------------------

test('1. eigenfunction and method-of-images series agree at Fo=0.0688', () => {
  // Two genuinely independent derivations of theta/theta0: the Dirichlet
  // eigenfunction expansion (slowest at small Fo) and the method of images
  // (fastest at small Fo). Agreement is a real check, not a tautology.
  const s = seriesTheta(0.69336, 0.0688);
  const e = erfcTheta(0.69336, 0.0688);
  close(s, 0.41094, 1e-4, 'seriesTheta(0.69336, 0.0688)');
  close(e, 0.41094, 1e-4, 'erfcTheta(0.69336, 0.0688)');
  // They should in fact agree far better than the stated tolerance.
  close(s, e, 1e-9, 'seriesTheta vs erfcTheta');
});

test('1b. erfc is a sane complementary error function', () => {
  close(erfc(0), 1.0, 1e-9, 'erfc(0)');
  close(erfc(-1), 2.0 - erfc(1), 1e-12, 'erfc(-x) = 2 - erfc(x)');
  assert.ok(erfc(3) > 0 && erfc(3) < 1e-4, 'erfc(3) is small and positive');
});

// --------------------------------------------------------------------------
// 2. One-term truncation error
// --------------------------------------------------------------------------

test('2. one-term truncation under-predicts the full series by 6-10%', () => {
  const one = oneTermTheta(0.69336, 0.0688);
  const full = seriesTheta(0.69336, 0.0688);
  close(one, 0.38231, 1e-4, 'oneTermTheta(0.69336, 0.0688)');
  const shortfall = 1.0 - one / full;
  assert.ok(
    shortfall > 0.06 && shortfall < 0.10,
    `one-term shortfall should be 6-10%, got ${(100 * shortfall).toFixed(2)}%`,
  );
  // This is exactly why Williams' closed form comes out ~8.4% low, and why
  // MODE_COUNT is 40 rather than 1 (CLAUDE.md invariant 4).
});

// --------------------------------------------------------------------------
// 3. Williams' 0.76
// --------------------------------------------------------------------------

test("3. Williams' 0.76 is the first-eigenmode amplitude at the yolk boundary", () => {
  // At Fo = 0 the one-term form collapses to its prefactor 2*sinc(pi*x).
  // At the model's yolk boundary (YOLK_RADIUS_FRAC, yolk = 33% of egg
  // volume) that is 0.7549 — which is the origin of Williams' famous 0.76. It
  // is an EIGENMODE AMPLITUDE evaluated at that radius, NOT a "yolk-white
  // ratio" (a common misreading) and not a property of the yolk centre.
  const prefactor = oneTermTheta(YOLK_RADIUS_FRAC, 0);
  close(prefactor, 0.7549, 1e-4, 'oneTermTheta(YOLK_RADIUS_FRAC, 0)');
  close(prefactor, 0.76, 0.01, "prefactor vs Williams' published 0.76");
});

// --------------------------------------------------------------------------
// 4. Centre coefficient
// --------------------------------------------------------------------------

test('4. the centre coefficient is exactly 2.0', () => {
  // sinc(0) = 1, so the first-mode prefactor at the centre is exactly 2. This
  // is what Williams' coefficient would have been had his criterion been the
  // YOLK CENTRE rather than the yolk boundary.
  assert.equal(oneTermTheta(0, 0), 2.0);
  // Note the full series is NOT 2 at Fo = 0: 2*sum(-1)^(n+1) is the classic
  // Abel-summable alternating series, whose truncation to an even number of
  // terms gives 0 and whose true limit at the centre is 1 (the initial
  // condition). Only the FIRST MODE has amplitude 2. Same artefact as
  // CLAUDE.md invariant 7, seen in the closed form.
  // Once Fo is large enough for the higher modes to have died (at Fo = 0.25
  // mode 2 is down by exp(-3*pi^2*Fo) ~ 6e-4 relative to mode 1), the full
  // series collapses onto the one-term form, whose centre prefactor is 2.0.
  const fo = 0.25;
  close(seriesTheta(0, fo) / oneTermTheta(0, fo), 1.0, 1e-3, 'centre series -> 2*exp(-pi^2*Fo)');
});

// --------------------------------------------------------------------------
// 5. Integrator vs closed form
// --------------------------------------------------------------------------

test('5. modal integrator reproduces the closed-form step response', () => {
  const R = 0.02383;
  const alpha = 1.70e-7;
  const T0 = 4;
  const Ts = 100;
  const dt = 0.5;
  // Surface held constant at 100 C, so this is a pure step response and the
  // closed form applies directly.
  const s = createSphere(R, alpha, T0, Ts);
  const checkpoints = [2, 30, 60, 120, 300, 600];
  let t = 0;
  let checked = 0;
  while (t < 600 - 1e-9) {
    stepSphere(s, dt, Ts);
    t = Math.round((t + dt) * 10) / 10;
    if (checkpoints.indexOf(t) >= 0) {
      // NOTE: deliberately no checkpoint at t = 0 or t < 2 s. A truncated modal
      // basis cannot represent a fresh discontinuity at the centre (modes are
      // weighted by n there) — CLAUDE.md invariant 7. The closed-form series has
      // precisely the same artefact, so the comparison would still "pass" while
      // both were wrong; excluding it keeps this an honest check.
      const fourier = alpha * t / (R * R);
      const expected = Ts + (T0 - Ts) * seriesTheta(0, fourier);
      close(centreTemperature(s), expected, 1e-6, `centre at t=${t}s`);
      checked++;
    }
  }
  assert.equal(checked, checkpoints.length, 'all checkpoints were reached');
});

test('5b. integrator matches the closed form off-centre too', () => {
  const R = 0.02383;
  const alpha = 1.70e-7;
  const s = createSphere(R, alpha, 4, 100);
  for (let i = 0; i < 1200; i++) stepSphere(s, 0.5, 100);
  const fourier = alpha * 600 / (R * R);
  close(
    temperatureAt(s, YOLK_RADIUS_FRAC),
    100 + (4 - 100) * seriesTheta(YOLK_RADIUS_FRAC, fourier),
    1e-6,
    'yolk-boundary temperature at t=600s',
  );
});

// --------------------------------------------------------------------------
// 6. Mean temperature bracketing
// --------------------------------------------------------------------------

test('6. mean temperature is strictly between centre and surface while heating', () => {
  const s = createSphere(0.02383, 1.70e-7, 4, 100);
  for (let i = 0; i < 1200; i++) {
    stepSphere(s, 0.5, 100);
    // Skip the first 2 s: a truncated modal basis rings at a fresh
    // discontinuity (the centre briefly reads 12.5 C instead of 4 C — the
    // exact artefact CLAUDE.md invariant 7 documents), so the bracket is
    // meaningless there. It holds for every step afterwards.
    if (i < 4) continue;
    const centre = centreTemperature(s);
    const mean = meanTemperature(s);
    assert.ok(
      mean > centre && mean < s.surface_C,
      `at step ${i}: expected centre < mean < surface, got ${centre} / ${mean} / ${s.surface_C}`,
    );
  }
});

// --------------------------------------------------------------------------
// 7. Thermo
// --------------------------------------------------------------------------

test('7. boiling point at sea-level pressure is 100 C', () => {
  close(boilingPointAtPressure(101325), 100.0, 0.02, 'boilingPointAtPressure(101325)');
  close(pressureAtAltitude(0), 101325, 1e-6, 'pressureAtAltitude(0)');
});

test('7b. the boiling point falls with altitude', () => {
  // That it stays within 0.05 C of the 100 - h/300 one-liner is a row of
  // npm run validate's table, beside the altitude table it reproduces.
  let previous = Number.POSITIVE_INFINITY;
  for (let h = 0; h <= 5000; h += 500) {
    const exact = boilingPointAtAltitude(h);
    assert.ok(exact < previous, `boiling point must fall with altitude (at ${h} m)`);
    previous = exact;
  }
});

test('7c. salt elevation is real but negligible', () => {
  const dT = saltBoilingElevation(15); // a generous tablespoon per litre
  assert.ok(dT > 0 && dT < 0.5, `salt elevation should be small and positive, got ${dT}`);
});

// --------------------------------------------------------------------------
// 8. Geometry round-trip
// --------------------------------------------------------------------------

test('8. mass -> minor diameter -> mass round-trips to 0.1%', () => {
  const byMass = eggFromMass(0.057);
  const byDiameter = eggFromMinorDiameter(byMass.minorDiameter_m);
  close(byDiameter.mass_kg, 0.057, 0.057 * 0.001, 'recovered mass');
  close(byDiameter.radius_m, byMass.radius_m, 1e-9, 'recovered radius');
  close(byDiameter.volume_m3, byMass.volume_m3, 1e-12, 'recovered volume');
});

test('8b. radius and diffusion time increase with mass', () => {
  let previousRadius = 0;
  let previousTau = 0;
  for (const grams of [40, 48, 58, 68, 76, 90]) {
    const egg = eggFromMass(grams / 1000);
    assert.ok(egg.radius_m > previousRadius, `radius must grow with mass (at ${grams} g)`);
    const tau = diffusionTime(egg, DEFAULT_PARAMS.alpha_m2s);
    assert.ok(tau > previousTau, `diffusion time must grow with mass (at ${grams} g)`);
    previousRadius = egg.radius_m;
    previousTau = tau;
  }
  // tau should scale as M^(2/3) — the exponent in Williams' formula.
  const a = eggFromMass(0.050);
  const b = eggFromMass(0.100);
  const ratio = diffusionTime(b, 1.7e-7) / diffusionTime(a, 1.7e-7);
  close(ratio, Math.pow(2, 2 / 3), 1e-9, 'tau scaling exponent');
});

// --------------------------------------------------------------------------
// 9. Kinetics
// --------------------------------------------------------------------------

test('9. dose is monotonic in time and in temperature', () => {
  const d = createDose(Z_YOLK, TREF_YOLK_C);
  let previous = -1;
  for (let i = 0; i < 100; i++) {
    accumulateDose(d, 65, 1.0);
    assert.ok(d.minutes > previous, 'dose must increase with every second held above 0 K');
    previous = d.minutes;
  }
  let previousRate = 0;
  for (const T of [40, 50, 60, 63, 70, 80]) {
    const one = createDose(Z_YOLK, TREF_YOLK_C);
    accumulateDose(one, T, 60.0);
    assert.ok(one.minutes > previousRate, `dose rate must increase with temperature (at ${T} C)`);
    previousRate = one.minutes;
  }
  // One minute held exactly at Tref is one equivalent minute, by definition.
  const atRef = createDose(Z_YOLK, TREF_YOLK_C);
  accumulateDose(atRef, TREF_YOLK_C, 60.0);
  close(atRef.minutes, 1.0, 1e-12, 'one minute at Tref = 1 equivalent minute');
});

test('9b. +4.65 C multiplies the dose rate by 10', () => {
  // Z_YOLK to within about 0.02 K of 4.65: what Vega & Mercade-Prieto's
  // activation energy gives (npm run validate derives it), NOT the
  // food-engineering default of 33.1 K, seven times too shallow for egg
  // protein.
  const lo = createDose(Z_YOLK, TREF_YOLK_C);
  const hi = createDose(Z_YOLK, TREF_YOLK_C);
  accumulateDose(lo, 60.0, 60.0);
  accumulateDose(hi, 60.0 + 4.65, 60.0);
  const factor = hi.minutes / lo.minutes;
  close(factor, 10.0, 0.1, 'dose-rate multiplier for +4.65 C');
  // The inverse statement: holding 4.65 C hotter takes a tenth of the time.
  const d = createDose(Z_YOLK, TREF_YOLK_C);
  const slow = holdTimeForDose(d, 1.0, 60.0);
  const fast = holdTimeForDose(d, 1.0, 64.65);
  close(slow / fast, 10.0, 0.1, 'hold-time ratio for +4.65 C');
});

// --------------------------------------------------------------------------
// 10. Dose monotonic in cook time — the precondition for bisection
// --------------------------------------------------------------------------

test('10. both doses increase monotonically with cook time', () => {
  const setup = referenceSetup({});
  let previousYolk = -1;
  let previousWhite = -1;
  for (let minutes = 1; minutes <= 15; minutes += 0.5) {
    const r = simulate(REFERENCE_EGG, setup, DEFAULT_PARAMS, minutes * 60);
    assert.ok(
      r.yolkDose_min > previousYolk,
      `yolk dose must increase with cook time (at ${minutes} min)`,
    );
    assert.ok(
      r.whiteDose_min > previousWhite,
      `white dose must increase with cook time (at ${minutes} min)`,
    );
    previousYolk = r.yolkDose_min;
    previousWhite = r.whiteDose_min;
  }
  // Monotonicity is exactly what makes the bisection in solveCookTime safe.
});

// --------------------------------------------------------------------------
// 11. Doneness slider round-trip
// --------------------------------------------------------------------------

test('11. slider -> dose -> slider round-trips', () => {
  for (let i = 0; i <= 20; i++) {
    const x = i / 20;
    close(sliderFromYolkDose(donenessFromSlider(x).yolkDose_min), x, 1e-12, `slider ${x}`);
  }
  // Clamping at both ends.
  assert.equal(donenessFromSlider(-0.5).level, 0);
  assert.equal(donenessFromSlider(1.5).level, 1);
});

// --------------------------------------------------------------------------
// 12. Reachability — the model's headline behavioural claim
// --------------------------------------------------------------------------

test('12. a soft yolk is unreachable on the counter but reachable from an ice bath', () => {
  const soft = donenessFromSlider(0.1);
  const counter = solveCookTime(REFERENCE_EGG, referenceSetup({ cooling: 'counter' }), DEFAULT_PARAMS, soft);
  assert.equal(counter.reachable, false, 'soft yolk must be unreachable with counter resting');
  assert.ok(
    counter.softestLevel > 0.4,
    `counter softestLevel should exceed 0.4, got ${counter.softestLevel}`,
  );
  assert.ok(counter.softestLevel <= 1.0, 'softestLevel is a slider position');

  const ice = solveCookTime(REFERENCE_EGG, referenceSetup({ cooling: 'ice' }), DEFAULT_PARAMS, soft);
  assert.equal(ice.reachable, true, 'the same target must be reachable with an ice bath');
  assert.ok(
    ice.softestLevel <= soft.level,
    `ice softestLevel (${ice.softestLevel}) must not exceed the requested level`,
  );
});

// --------------------------------------------------------------------------
// 13. Carryover ordering
// --------------------------------------------------------------------------

test('13. identical cook, different cooling: same pull state, ordered peaks', () => {
  const cookTime = 7.4 * 60;
  const ice = simulate(REFERENCE_EGG, referenceSetup({ cooling: 'ice' }), DEFAULT_PARAMS, cookTime);
  const tap = simulate(REFERENCE_EGG, referenceSetup({ cooling: 'tap' }), DEFAULT_PARAMS, cookTime);
  const counter = simulate(REFERENCE_EGG, referenceSetup({ cooling: 'counter' }), DEFAULT_PARAMS, cookTime);

  // Same cook => same state at the moment of pulling, whatever happens next.
  close(tap.yolkAtPull_C, ice.yolkAtPull_C, 0.1, 'yolk at pull: tap vs ice');
  close(counter.yolkAtPull_C, ice.yolkAtPull_C, 0.1, 'yolk at pull: counter vs ice');

  // Carryover then separates them.
  assert.ok(
    ice.peakYolk_C < tap.peakYolk_C,
    `ice peak (${ice.peakYolk_C}) must be below tap peak (${tap.peakYolk_C})`,
  );
  assert.ok(
    tap.peakYolk_C < counter.peakYolk_C,
    `tap peak (${tap.peakYolk_C}) must be below counter peak (${counter.peakYolk_C})`,
  );
  // Every peak must exceed the pull temperature: the egg keeps cooking.
  assert.ok(ice.peakYolk_C > ice.yolkAtPull_C, 'carryover raises the yolk even in ice water');
  // And no carryover can exceed the volume-average ceiling implied by boiling.
  assert.ok(counter.peakYolk_C < 100, 'carryover cannot exceed the water temperature');
});

// --------------------------------------------------------------------------
// 14. Biot number
// --------------------------------------------------------------------------

test('14. the Biot number in water justifies the Dirichlet treatment', () => {
  const bi = biotNumber(H_EFF, REFERENCE_EGG.radius_m);
  assert.ok(bi > 20, `Bi in water should exceed 20, got ${bi}`);
  // Sanity: Bi scales linearly in both arguments.
  close(biotNumber(2 * H_EFF, REFERENCE_EGG.radius_m), 2 * bi, 1e-9, 'Bi linear in h');
  close(biotNumber(H_EFF, 2 * REFERENCE_EGG.radius_m), 2 * bi, 1e-9, 'Bi linear in R');
});

// --------------------------------------------------------------------------
// 15. heat off at the boil
// --------------------------------------------------------------------------

test('15a. with the heat off the water falls, and the dose saturates', () => {
  const standing = referenceSetup({
    startMode: 'cold', afterBoil: 'off', timeToBoil_s: 480, cooling: 'tap',
  });
  const twenty = simulate(REFERENCE_EGG, standing, DEFAULT_PARAMS, 480 + 20 * 60);
  const forty = simulate(REFERENCE_EGG, standing, DEFAULT_PARAMS, 480 + 40 * 60);

  // Held at the boil, twice the time is orders of magnitude more dose. Here the
  // pan has nothing left to give, so the two cooks are the same egg. This is
  // why Williams can say "about seventeen minutes" and be right.
  close(forty.peakYolk_C, twenty.peakYolk_C, 0.1, 'peak yolk saturates');
  assert.ok(
    forty.yolkDose_min < twenty.yolkDose_min * 1.05,
    `dose should saturate: ${twenty.yolkDose_min} -> ${forty.yolkDose_min}`,
  );

  const held = simulate(
    REFERENCE_EGG, referenceSetup({ startMode: 'cold', timeToBoil_s: 480, cooling: 'tap' }),
    DEFAULT_PARAMS, 480 + 40 * 60,
  );
  assert.ok(
    held.yolkDose_min > forty.yolkDose_min * 100,
    'holding the boil must cook far harder than standing, for the same clock time',
  );
});

test('15b. a small pan cannot stand its way to hard', () => {
  const hard = donenessFromSlider(1.0);
  // Same hob, same eight-minute ramp: only the water differs. A litre holds
  // too little heat to finish the yolk once the burner is off; three do.
  const small = solveCookTime(
    REFERENCE_EGG,
    referenceSetup({ startMode: 'cold', afterBoil: 'off', timeToBoil_s: 480, waterLitres: 1, cooling: 'ice' }),
    DEFAULT_PARAMS, hard,
  );
  assert.equal(small.reachable, false, 'hard should be out of reach in a litre');
  assert.ok(small.hardestLevel < 1, `hardestLevel should be capped, got ${small.hardestLevel}`);

  const big = solveCookTime(
    REFERENCE_EGG,
    referenceSetup({ startMode: 'cold', afterBoil: 'off', timeToBoil_s: 480, waterLitres: 3, cooling: 'ice' }),
    DEFAULT_PARAMS, hard,
  );
  assert.equal(big.reachable, true, 'three litres have heat to spare');
  close(big.hardestLevel, 1, 1e-9, 'nothing is capped when the target is reachable');
});

test('15c. holding the boil is never capped at the hard end', () => {
  const sol = solveCookTime(
    REFERENCE_EGG, referenceSetup({}), DEFAULT_PARAMS, donenessFromSlider(1.0),
  );
  close(sol.hardestLevel, 1, 1e-9, 'a boiling pan can always cook harder');
});

test('15d. a pan with too little heat never sets the white at all', () => {
  // Four fridge-cold eggs into a litre at the boil, then the burner off: the
  // eggs take a bite out of the only heat there is, and the water is past the
  // white's own target within minutes. There is no cook time to offer here, at
  // any doneness.
  const sol = solveCookTime(
    REFERENCE_EGG,
    referenceSetup({ startMode: 'hot', afterBoil: 'off', waterLitres: 1, eggCount: 4 }),
    DEFAULT_PARAMS, donenessFromSlider(0.41),
  );
  assert.equal(sol.whiteSets, false, 'the white should never set');
  assert.equal(sol.reachable, false);
  // And the answer must still be a time a person could act on, not the hour-long
  // asymptote the dose curve creeps toward.
  assert.ok(
    sol.result.cookTime_s < 30 * 60,
    `expected the practical knee, got ${(sol.result.cookTime_s / 60).toFixed(1)} min`,
  );

  const generous = solveCookTime(
    REFERENCE_EGG,
    referenceSetup({ startMode: 'hot', afterBoil: 'off', waterLitres: 6, eggCount: 2 }),
    DEFAULT_PARAMS, donenessFromSlider(0.41),
  );
  assert.equal(generous.whiteSets, true, 'six litres and two eggs have heat to spare');
});

test('15e. with the heat off the pan cools at a rate set by the water, not the hob', () => {
  // Anchored so Williams' 8-minute boil in 2 L is exactly what the boil-time
  // rule gives, and scaled as the cube root of the volume.
  close(panTimeConstant(2), 480 / Math.log(1.5), 1e-9, 'the 2 L anchor');
  close(panTimeConstant(2), TAU_STANDING_REF_S, 1e-9, 'the anchor is the constant');
  close(panTimeConstant(16), 2 * panTimeConstant(2), 1e-9, 'eight times the water, twice the tau');

  // Cold start: once the heat is off, a fast hob and a slow one leave the same
  // pan cooling at the same rate. Ten minutes after the boil, same water.
  const fast = referenceSetup({ startMode: 'cold', afterBoil: 'off', timeToBoil_s: 240 });
  const slow = referenceSetup({ startMode: 'cold', afterBoil: 'off', timeToBoil_s: 720 });
  close(
    bathTemperature(REFERENCE_EGG, fast, 240 + 600), bathTemperature(REFERENCE_EGG, slow, 720 + 600),
    1e-9, 'the hob has dropped out of the cooling',
  );

  // Hot start: the boil is never timed, so a remembered one - possibly another
  // pan's - must not move the answer at all.
  const level = donenessFromSlider(0.41);
  const remembered = (boil_s: number) => solveCookTime(
    REFERENCE_EGG,
    referenceSetup({ startMode: 'hot', afterBoil: 'off', timeToBoil_s: boil_s, waterLitres: 6, eggCount: 2 }),
    DEFAULT_PARAMS, level,
  );
  const a = remembered(240);
  const b = remembered(1440);
  assert.equal(a.result.cookTime_s, b.result.cookTime_s, 'a hot start ignores the remembered boil');
  assert.equal(a.hardestLevel, b.hardestLevel);
});

// --------------------------------------------------------------------------
// 16. the invariant the two search strategies rest on
// --------------------------------------------------------------------------

/** Worst (most negative) change in a dose between adjacent cook times. */
function worstDoseStep(
  setup: CookSetup, pick: (r: { yolkDose_min: number; whiteDose_min: number }) => number,
): number {
  const start = setup.startMode === 'cold' ? setup.timeToBoil_s : 20;
  let worst = 0;
  let prev = Number.NEGATIVE_INFINITY;
  for (let t = start; t <= start + 1800; t += 20) {
    const dose = pick(simulate(REFERENCE_EGG, setup, DEFAULT_PARAMS, t));
    if (prev > Number.NEGATIVE_INFINITY && dose - prev < worst) worst = dose - prev;
    prev = dose;
  }
  return worst;
}

test('16a. held at the boil, both doses are monotonic in cook time', () => {
  // This is what licenses `bisect`. The trajectory before the pull does not
  // depend on when you pull, so the dose banked by then only grows; and while
  // the water is at or climbing to the boil the egg is always colder than it,
  // so a later pull also starts carryover from a HOTTER egg. Growing plus
  // growing. Nothing here may ever go backwards.
  const cases: CookSetup[] = [
    referenceSetup({}),
    referenceSetup({ cooling: 'tap' }),
    referenceSetup({ cooling: 'counter' }),
    referenceSetup({ startMode: 'cold', timeToBoil_s: 480 }),
    referenceSetup({ startMode: 'cold', timeToBoil_s: 480, cooling: 'counter' }),
    referenceSetup({ startMode: 'cold', timeToBoil_s: 720 }),
    referenceSetup({ eggCount: 8, waterLitres: 0.75 }),
    referenceSetup({ boiling_C: 83.3 }),
  ];
  for (const setup of cases) {
    assert.equal(worstDoseStep(setup, (r) => r.yolkDose_min), 0, 'yolk dose must not fall');
    assert.equal(worstDoseStep(setup, (r) => r.whiteDose_min), 0, 'white dose must not fall');
  }
});

test('16b. with the heat off they are not, which is why standing scans', () => {
  // Pulling later means pulling from cooler water, so the carryover that
  // follows is smaller. Past the crossover the total dose FALLS with a longer
  // cook, and a bisection on it lands anywhere. If this test ever goes green in
  // the other direction, solveStanding can go back to bisecting - and not
  // before.
  const standing = referenceSetup({
    startMode: 'cold', afterBoil: 'off', timeToBoil_s: 480, cooling: 'counter',
  });
  assert.ok(
    worstDoseStep(standing, (r) => r.yolkDose_min) < 0,
    'standing should be non-monotonic in the yolk dose',
  );
});

// --------------------------------------------------------------------------
// 17. on the counter: Newton's law at the shell
// --------------------------------------------------------------------------

/** Roots of 1 - mu*cot(mu) = Bi, one in each ((n-1)pi, n*pi). */
function robinRoots(bi: number, count: number): number[] {
  const roots: number[] = [];
  for (let n = 1; n <= count; n++) {
    let lo = (n - 1) * Math.PI + 1e-9;
    let hi = n * Math.PI - 1e-9;
    const f = (mu: number): number => 1 - mu / Math.tan(mu) - bi;
    for (let k = 0; k < 200; k++) {
      const mid = 0.5 * (lo + hi);
      if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
    }
    roots.push(0.5 * (lo + hi));
  }
  return roots;
}

test('17a. the counter closure reproduces the closed-form Robin series', () => {
  // A sphere at a uniform 80 C cooling into a 20 C room by Newton's law at its
  // surface, Bi ~ 0.6. The textbook series (Carslaw & Jaeger 9.4) and the
  // modal closure share nothing but the physics: one has Robin eigenvalues,
  // the other Dirichlet modes with the surface solved for each step.
  const r = 0.024;
  const tau = 1864;
  // tau = m*c/(h*A) = R^2/(3*alpha*Bi), with rho*c = k/alpha.
  const bi = r * r / (3 * ALPHA_DEFAULT * tau);
  const mus = robinRoots(bi, 60);
  const series = (fo: number): { centre: number; surface: number; mean: number } => {
    let centre = 0; let surface = 0; let mean = 0;
    for (const mu of mus) {
      const a = 4 * (Math.sin(mu) - mu * Math.cos(mu)) / (2 * mu - Math.sin(2 * mu));
      const e = Math.exp(-mu * mu * fo);
      centre += a * e;
      surface += a * e * Math.sin(mu) / mu;
      mean += a * e * 3 * (Math.sin(mu) - mu * Math.cos(mu)) / (mu * mu * mu);
    }
    return { centre: 20 + 60 * centre, surface: 20 + 60 * surface, mean: 20 + 60 * mean };
  };
  const s = createSphere(r, ALPHA_DEFAULT, 80, 80);
  let lost = 0;
  let t = 0;
  for (const at of [60, 300, 600, 1200]) {
    while (t < at) {
      const before = s.surface_C;
      const next = robinSurface(s, DT_SIM, 20, tau, 0);
      stepSphere(s, DT_SIM, next);
      lost += DT_SIM / tau * (0.5 * (before + next) - 20);
      t += DT_SIM;
    }
    const want = series(ALPHA_DEFAULT * t / (r * r));
    close(centreTemperature(s), want.centre, 0.02, `centre at ${t} s`);
    close(s.surface_C, want.surface, 0.01, `surface at ${t} s`);
    close(meanTemperature(s), want.mean, 0.01, `mean at ${t} s`);
    // Heat is conserved exactly: the mean falls by what the surface sent out.
    close(80 - meanTemperature(s), lost, 1e-9, `heat balance at ${t} s`);
  }
});

test("17b. the counter's time constant is the egg's own m*c/(h*A), and drying off costs ~1.2 C", () => {
  const egg = REFERENCE_EGG;
  const area = 4 * Math.PI * egg.radius_m * egg.radius_m;
  close(airTimeConstant(egg), egg.mass_kg * C_EGG / (H_AIR * area), 1e-9, 'm*c/(h*A)');
  close(airTimeConstant(egg), 1864, 1, 'reference egg, s');
  // It goes as the radius: a bigger egg holds its heat longer.
  const small = eggFromMass(0.048);
  const big = eggFromMass(0.076);
  close(airTimeConstant(big) / airTimeConstant(small), big.radius_m / small.radius_m, 1e-9, 'tau ~ R');
  // In still air the shell is neither clamped nor lumped.
  const bi = biotNumber(H_AIR, egg.radius_m);
  assert.ok(bi > 0.4 && bi < 0.8, `Bi in still air should be ~0.6, got ${bi}`);
  close(H_AIR * egg.radius_m / K_EGG, bi, 1e-12, 'Bi = hR/k');
  // 15 g of water per m^2 of shell, at 2.27 MJ/kg, over the egg's heat capacity.
  close(wetShellDrop_C(egg), 1.218, 0.001, 'drying off, reference egg');
  assert.ok(wetShellDrop_C(small) > wetShellDrop_C(big), 'more shell per gram on a small egg');
});

test('17c. the counter is slow cooling, not a lid', () => {
  // The reference cook of README section 5. An insulated egg would carry the
  // yolk to its mean at the pull, 83.9 C. The counter takes 8-9 C of that, the
  // ice bath 19. The 75.27 C is an independent explicit finite-volume
  // solution with h from Churchill's correlation and radiation as functions
  // of the shell's temperature, and the film evaporating by the heat-mass
  // analogy (LOGBOOK.md, 3 October 2026).
  const cookTime = 7.4 * 60;
  const ice = simulate(REFERENCE_EGG, referenceSetup({ cooling: 'ice' }), DEFAULT_PARAMS, cookTime);
  const counter = simulate(REFERENCE_EGG, referenceSetup({ cooling: 'counter' }), DEFAULT_PARAMS, cookTime);
  close(counter.peakYolk_C, 75.27, 0.15, 'counter peak yolk vs finite volumes');
  assert.ok(83.9 - counter.peakYolk_C > 7, 'the counter takes more than 7 C off the insulated ceiling');
  assert.ok(counter.peakYolk_C - ice.peakYolk_C > 9, 'and is still far above the ice bath');
});
