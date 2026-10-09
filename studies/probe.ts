/**
 * Is a kitchen probe thermometer worth an egg, and where should it go?
 *
 * Run: npm run probe
 *
 * Quoted by INFERENCE.md (the probe's section) and README 11.3.
 *
 * Some cooks own a meat thermometer with a probe on the end. The obvious way to
 * use it - push it to a known depth the moment the egg comes out - turns out to
 * be the worst of the three available, and this tool exists to say so with
 * numbers rather than with an opinion.
 *
 * Read-only. Nothing in src/ is touched.
 *
 * What makes a reading useful is not the thermometer's accuracy, which is about
 * a degree for anything worth owning. It is how much the reading moves when the
 * cook's hand does: a probe that lands 3 mm off, or goes in 15 s late. So for
 * each candidate protocol this prints the signal (degrees per 1% of time-scale)
 * next to the two handling errors, and the protocol to use is the one where the
 * errors vanish - the centre, at the moment the centre peaks, where the field is
 * flat in space AND in time. The model already reports that moment as
 * `peakYolkTime_s`, so the app can simply say when.
 *
 * Every handling error at the pull has the same sign: a miss reads hot, a late
 * reading reads hot, and heat conducted down the stem reads hot. A hot reading
 * says the egg heats fast, which shortens the next cook - and short is the
 * direction both real eggs in LOGBOOK.md already went wrong in.
 */

import { CookSetup, Cooling } from '../src/core/protocol.js';
import { eggFromMass } from '../src/core/geometry.js';
import { simulate } from '../src/core/solve.js';
import { ALPHA_DEFAULT, ALPHA_REL_SD, YOLK_RADIUS_FRAC } from '../src/core/constants.js';
import { DEFAULT_EGG_MASS_KG } from '../src/core/inputs.js';
import { Theta, THETA0, runPerturbed } from './perturbed.js';

const MASS = DEFAULT_EGG_MASS_KG;
const COOK_S = 400;
const R_MM = eggFromMass(MASS).radius_m * 1000;

function setupFor(cooling: Cooling): CookSetup {
  return {
    startMode: 'hot', eggStart_C: 4, ambient_C: 20, boiling_C: 100, timeToBoil_s: 480,
    cooling, waterLitres: 1.5, eggCount: 1,
  };
}

function reading(cooling: Cooling, th: Theta, x: number, after_s: number): number {
  return runPerturbed(MASS, setupFor(cooling), th, COOK_S, { x, after_s }).probe_C;
}

function withAlpha(factor: number): Theta {
  return { ...THETA0, logAlpha: THETA0.logAlpha + Math.log(factor) };
}

/** Degrees per +1% of alpha, central difference. */
function signal(cooling: Cooling, x: number, after_s: number): number {
  return (reading(cooling, withAlpha(1.01), x, after_s) - reading(cooling, withAlpha(0.99), x, after_s)) / 2;
}

console.log(`${(MASS * 1000).toFixed(0)} g egg from the fridge, into boiling water for ${COOK_S} s; R = ${R_MM.toFixed(1)} mm`);
console.log();

/* ---------------------------------------------- the gradient, at the pull */

console.log('the field at the moment of the pull:');
console.log('    r/R   |   T (C)  |  gradient (C/mm)');
for (const x of [0, 0.1, 0.2, 0.4, YOLK_RADIUS_FRAC]) {
  const lo = Math.max(0, x - 0.02);
  const hi = x + 0.02;
  const g = (reading('ice', THETA0, hi, 0) - reading('ice', THETA0, lo, 0)) / ((hi - lo) * R_MM);
  const tag = x === YOLK_RADIUS_FRAC ? '  <- where the white is judged' : '';
  console.log(`   ${x.toFixed(3)}  |  ${reading('ice', THETA0, x, 0).toFixed(1).padStart(5)}   |  ${g.toFixed(2).padStart(5)}${tag}`);
}
console.log();

/* ------------------------------------------------- the three protocols */

interface Protocol { label: string; cooling: Cooling; after_s: number; lateCooling: Cooling }

// "At the pull" is read in air whatever the cook does next: the egg is in
// somebody's hand with a probe in it, not in the ice.
const peakIce = simulate(eggFromMass(MASS), setupFor('ice'), { alpha_m2s: ALPHA_DEFAULT }, COOK_S);
const peakCounter = simulate(eggFromMass(MASS), setupFor('counter'), { alpha_m2s: ALPHA_DEFAULT }, COOK_S);
const protocols: Protocol[] = [
  { label: 'at the pull', cooling: 'counter', after_s: 0, lateCooling: 'counter' },
  { label: `ice bath, at its peak (+${(peakIce.peakYolkTime_s - COOK_S).toFixed(0)} s)`, cooling: 'ice', after_s: peakIce.peakYolkTime_s - COOK_S, lateCooling: 'ice' },
  { label: `counter, at its peak (+${(peakCounter.peakYolkTime_s - COOK_S).toFixed(0)} s)`, cooling: 'counter', after_s: peakCounter.peakYolkTime_s - COOK_S, lateCooling: 'counter' },
];

console.log('a reading at the CENTRE, three ways:');
console.log('                                   |  T (C) | C per 1% | 3 mm off | 15 s late | 1 C is worth');
for (const p of protocols) {
  const t0 = reading(p.cooling, THETA0, 0, p.after_s);
  const sig = signal(p.cooling, 0, p.after_s);
  const miss = reading(p.cooling, THETA0, 3 / R_MM, p.after_s) - t0;
  const late = reading(p.lateCooling, THETA0, 0, p.after_s + 15) - t0;
  const signed = (v: number): string => ((v >= 0 ? '+' : '') + v.toFixed(2)).padStart(6);
  console.log(
    `  ${p.label.padEnd(33)}|  ${t0.toFixed(1).padStart(5)} |  ${sig.toFixed(3)}   |  ${signed(miss)}  |  ${signed(late)}   |  ${(1 / sig).toFixed(1)}% of time-scale`,
  );
}
console.log();

/* --------------------------------- which way the errors go, at the peak */

// At the pull the centre is the COLDEST point and every error reads hot. At the
// centre's peak it is the WARMEST, in space and in time, so every error reads
// cold - which is the direction the likelihood's skew has to go (infer.ts),
// and why the cook is asked for the HIGHEST number, not the lowest.
const iceAfter = peakIce.peakYolkTime_s - COOK_S;
const radial = [0, 0.1, 0.2, 0.3, 0.4, 0.5].map((x) => reading('ice', THETA0, x, iceAfter).toFixed(1));
const timely = [-60, -30, -15, 0, 15, 30, 60].map((d) => reading('ice', THETA0, 0, iceAfter + d).toFixed(2));
console.log('the ice bath at its peak:');
console.log(`  r/R 0, 0.1 ... 0.5:        ${radial.join('  ')} C`);
console.log(`  centre, -60 s ... +60 s:   ${timely.join('  ')} C`);
console.log('  Off-centre, early or late all read low: the centre is the maximum.');
console.log();

/* ------------------------------------ what it cannot see: the carryover */

const peakAfter = peakCounter.peakYolkTime_s - COOK_S;
const TAU_SD = 0.35; // the carryover's prior until DECISIONS.md 95 held it at 1.0
const slow = reading('counter', { ...THETA0, logTauAir: TAU_SD }, 0, peakAfter);
const fast = reading('counter', { ...THETA0, logTauAir: -TAU_SD }, 0, peakAfter);
const byTau = (slow - fast) / 2;
const byAlpha = signal('counter', 0, peakAfter) * 100 * ALPHA_REL_SD;
console.log('what moves the counter reading, per prior sd:');
console.log(`  the carryover constant                 ${byTau.toFixed(2)} C`);
console.log(`  the time-scale (alpha)                 ${byAlpha.toFixed(2)} C`);
console.log('  So one rested egg mostly re-measures the time-scale. The carryover constant wants');
console.log('  an ice-bath reading first to pin that, and even then a degree of thermometer');
console.log('  against a degree of signal. A logged curve would settle it; a spot reading will not.');
