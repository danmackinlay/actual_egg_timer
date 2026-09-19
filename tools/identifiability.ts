/**
 * Is the surface transfer coefficient h identifiable, given a yolk answer AND a
 * white answer?
 *
 * Run: npm run identifiability
 *
 * This exists because README 11.2(2) used to assert an answer it had not
 * measured, and 11.4 queued a change on the strength of it. The numbers it
 * prints are quoted in both, so they can be re-derived rather than believed.
 *
 * README 11.2(2) says changing H_EFF "would simply be re-absorbed by
 * ALPHA_DEFAULT". That is true with ONE observable. The question here is whether
 * it is still true with two, because the yolk criterion sits at r = 0 and the
 * white criterion at r = 0.693 R, and a surface resistance is felt differently at
 * those two radii than a bulk diffusivity is.
 *
 * Read-only. Nothing in src/ is touched. The repo's solver is Dirichlet-only, so
 * the Robin eigenmodes are built here and cross-checked against the repo's own
 * Dirichlet series at large Bi before anything is believed.
 *
 * Method: the Jacobian of (log yolk dose, log white dose) with respect to
 * (log alpha, log h). If its two columns are parallel, the two parameters move
 * both observables in the same proportion and no amount of feedback separates
 * them. The angle between the columns is the answer.
 */

import { seriesTheta, biotNumber } from '../src/core/sphere.js';
import {
  ALPHA_DEFAULT, H_EFF, YOLK_RADIUS_FRAC,
  Z_YOLK, TREF_YOLK_C, Z_WHITE, TREF_WHITE_C, T_ICE_BATH_C,
} from '../src/core/constants.js';
import { eggFromMass } from '../src/core/geometry.js';
import { DEFAULT_EGG_MASS_KG } from '../src/core/policy.js';

/* ------------------------------------------------------- Robin eigenmodes */

/** Roots of 1 - mu*cot(mu) = Bi, one per interval ((n-1)pi, n*pi). Bisection:
 *  the function is monotonic within each interval and brackets a single root. */
function robinEigenvalues(bi: number, count: number): number[] {
  const f = (mu: number): number => 1 - mu / Math.tan(mu) - bi;
  const roots: number[] = [];
  for (let n = 1; n <= count; n++) {
    let lo = (n - 1) * Math.PI + 1e-10;
    let hi = n * Math.PI - 1e-10;
    let flo = f(lo);
    for (let i = 0; i < 200; i++) {
      const mid = 0.5 * (lo + hi);
      const fm = f(mid);
      if ((flo < 0) === (fm < 0)) { lo = mid; flo = fm; } else { hi = mid; }
    }
    roots.push(0.5 * (lo + hi));
  }
  return roots;
}

/** theta(x, Fo) for a step change, Robin boundary. x = r/R in [0, 1]. */
function robinTheta(mus: number[], x: number, fourier: number): number {
  let sum = 0;
  for (const mu of mus) {
    const c = 2 * (Math.sin(mu) - mu * Math.cos(mu)) / (mu - Math.sin(mu) * Math.cos(mu));
    const shape = x < 1e-12 ? 1 : Math.sin(mu * x) / (mu * x);
    sum += c * Math.exp(-mu * mu * fourier) * shape;
  }
  return sum;
}

/* ----------------------------------------------------- sanity: Dirichlet */

/* As Bi -> infinity the Robin eigenvalues go to n*pi and this must reproduce
 * the repo's own series. If it does not, nothing below means anything. */
function crossCheck(): { worst: number; firstRootsOverPi: number[] } {
  const bigBi = 1e7;
  const mus = robinEigenvalues(bigBi, 200);
  let worst = 0;
  for (const x of [0, 0.25, 0.5, 0.693, 0.9]) {
    for (const fo of [0.02, 0.05, 0.1, 0.3, 0.6]) {
      const mine = robinTheta(mus, x, fo);
      const theirs = seriesTheta(x, fo);
      worst = Math.max(worst, Math.abs(mine - theirs));
    }
  }
  const firstRoots = robinEigenvalues(bigBi, 3).map((m) => m / Math.PI);
  return { worst, firstRootsOverPi: firstRoots };
}

/* ------------------------------------------------------------ the cook */

const egg = eggFromMass(DEFAULT_EGG_MASS_KG);
const R = egg.radius_m;
const DT = 0.25;

/** Dose at the two criterion radii for one (alpha, h), hot start into boiling
 *  water, then an ice bath, both with the same surface coefficient.
 *
 *  Superposition: each phase is a step from the CURRENT profile toward the new
 *  bath. Approximating the second step as a fresh step from the volume-average
 *  is exactly what the repo does for carryover in air, and is good enough for a
 *  sensitivity ratio - what matters here is how the two radii respond, not the
 *  absolute dose. */
interface Doses { yolk: number; white: number }

function doses(
  alpha: number, h: number, cook_s: number, carry_s: number,
  bath_C: number, start_C: number, cool_C: number,
): Doses {
  const bi = biotNumber(h, R);
  const mus = robinEigenvalues(bi, 60);
  let yolk = 0;
  let white = 0;

  const tempAt = (x: number, t: number, from_C: number, to_C: number): number => {
    const fo = alpha * t / (R * R);
    return to_C + (from_C - to_C) * robinTheta(mus, x, fo);
  };

  for (let t = 0; t < cook_s; t += DT) {
    const ty = tempAt(0, t, start_C, bath_C);
    const tw = tempAt(YOLK_RADIUS_FRAC, t, start_C, bath_C);
    yolk += Math.pow(10, (ty - TREF_YOLK_C) / Z_YOLK) * DT / 60;
    white += Math.pow(10, (tw - TREF_WHITE_C) / Z_WHITE) * DT / 60;
  }

  // Carryover: the profile at pull, relaxing toward the cooling bath.
  const yolkAtPull = tempAt(0, cook_s, start_C, bath_C);
  const whiteAtPull = tempAt(YOLK_RADIUS_FRAC, cook_s, start_C, bath_C);
  for (let t = 0; t < carry_s; t += DT) {
    const ty = tempAt(0, t, yolkAtPull, cool_C);
    const tw = tempAt(YOLK_RADIUS_FRAC, t, whiteAtPull, cool_C);
    yolk += Math.pow(10, (ty - TREF_YOLK_C) / Z_YOLK) * DT / 60;
    white += Math.pow(10, (tw - TREF_WHITE_C) / Z_WHITE) * DT / 60;
  }
  return { yolk, white };
}

/* -------------------------------------------------------------- report */

const check = crossCheck();
console.log('Robin modes reproduce the repo Dirichlet series at Bi=1e7:');
console.log('  worst |theta| difference  ', check.worst.toExponential(2));
console.log('  first roots / pi          ', check.firstRootsOverPi.map((v: number) => v.toFixed(6)).join(', '));
console.log();

const COOK = 420;
const CARRY = 180;
console.log(`hot start, ${COOK}s in boiling water then ${CARRY}s in ice; ${(DEFAULT_EGG_MASS_KG * 1000).toFixed(0)} g egg`);
console.log(`alpha = ${ALPHA_DEFAULT.toExponential(3)}, h = ${H_EFF} W/m^2K, Bi = ${biotNumber(H_EFF, R).toFixed(1)}`);
console.log();

const EPS = 0.02;

function sensitivity(dAlpha: number, dH: number): Doses {
  const up = doses(ALPHA_DEFAULT * (1 + dAlpha), H_EFF * (1 + dH), COOK, CARRY, 100, 4, T_ICE_BATH_C);
  const dn = doses(ALPHA_DEFAULT * (1 - dAlpha), H_EFF * (1 - dH), COOK, CARRY, 100, 4, T_ICE_BATH_C);
  const step = 2 * (dAlpha + dH);
  return {
    yolk: (Math.log10(up.yolk) - Math.log10(dn.yolk)) / step,
    white: (Math.log10(up.white) - Math.log10(dn.white)) / step,
  };
}

function sweep(hValue: number): { bi: number; angle: number; strength: number } {
  const at = (dA: number, dH: number): Doses => {
    const up = doses(ALPHA_DEFAULT * (1 + dA), hValue * (1 + dH), COOK, CARRY, 100, 4, T_ICE_BATH_C);
    const dn = doses(ALPHA_DEFAULT * (1 - dA), hValue * (1 - dH), COOK, CARRY, 100, 4, T_ICE_BATH_C);
    const step = 2 * (dA + dH);
    return {
      yolk: (Math.log10(up.yolk) - Math.log10(dn.yolk)) / step,
      white: (Math.log10(up.white) - Math.log10(dn.white)) / step,
    };
  };
  const a = at(EPS, 0);
  const h = at(0, EPS);
  const na = Math.hypot(a.yolk, a.white);
  const nh = Math.hypot(h.yolk, h.white);
  const cos = (a.yolk * h.yolk + a.white * h.white) / (na * nh);
  return {
    bi: biotNumber(hValue, R),
    angle: Math.acos(Math.min(1, Math.max(-1, cos))) * 180 / Math.PI,
    strength: nh / na,
  };
}

console.log('how this varies with the surface coefficient itself:');
console.log('     h   |    Bi  |  angle  | |h|/|alpha|');
for (const hv of [1600, 850, 600, 450, 300, 200, 120, 60]) {
  const r = sweep(hv);
  const tag = hv === 850 ? '  <- H_EFF today' : (hv === 450 ? '  <- Denys, README 11.2' : '');
  console.log(`  ${String(hv).padStart(4)}  | ${r.bi.toFixed(1).padStart(5)}  | ${r.angle.toFixed(1).padStart(5)}d  |   ${r.strength.toFixed(3)}${tag}`);
}
console.log();

const byAlpha = sensitivity(EPS, 0);
const byH = sensitivity(0, EPS);

console.log('d log10(dose) / d log(parameter), decades per unit relative change:');
console.log('            yolk        white       white/yolk');
console.log(`  alpha   ${byAlpha.yolk.toFixed(4).padStart(8)}   ${byAlpha.white.toFixed(4).padStart(8)}   ${(byAlpha.white / byAlpha.yolk).toFixed(4)}`);
console.log(`  h       ${byH.yolk.toFixed(4).padStart(8)}   ${byH.white.toFixed(4).padStart(8)}   ${(byH.white / byH.yolk).toFixed(4)}`);
console.log();

// Angle between the two Jacobian columns, after normalising each to unit
// length: 0 degrees means perfectly confounded, 90 means orthogonal.
const na = Math.hypot(byAlpha.yolk, byAlpha.white);
const nh = Math.hypot(byH.yolk, byH.white);
const cos = (byAlpha.yolk * byH.yolk + byAlpha.white * byH.white) / (na * nh);
const angle = Math.acos(Math.min(1, Math.max(-1, cos))) * 180 / Math.PI;

console.log(`angle between the alpha and h directions: ${angle.toFixed(2)} degrees`);
console.log(`  (0 = the two are indistinguishable; 90 = fully separable)`);
console.log(`relative strength  |h| / |alpha| : ${(nh / na).toFixed(3)}`);
