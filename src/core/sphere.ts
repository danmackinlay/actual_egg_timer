/**
 * Transient heat conduction in a sphere, solved in the eigenmode basis.
 *
 * Rather than finite differences we keep the sphere's eigenmodes as state and
 * drive them with the surface temperature. Writing
 *
 *   T(r,t) = Ts(t) + (1/r) * sum_n b_n(t) * sin(n*pi*r/R)
 *
 * each mode obeys a decoupled scalar ODE driven by the RATE OF CHANGE of the
 * surface temperature (Duhamel):
 *
 *   b_n'(t) = -lambda_n * b_n(t) - c_n * Ts'(t)
 *   lambda_n = alpha * (n*pi/R)^2
 *   c_n      = 2R(-1)^(n+1)/(n*pi)
 *
 * For piecewise-linear Ts each mode advances EXACTLY:
 *
 *   b_n(t+dt) = b_n*exp(-lambda*dt) - c_n*s*(1 - exp(-lambda*dt))/lambda
 *
 * Why this and not a grid: unconditionally stable, exact for any piecewise-
 * linear surface drive, no CFL condition, ~40 floats of state, and it handles
 * the pan ramp, the boil, and the cooling phase in one loop. It is also just
 * arithmetic on two fixed-size arrays, so it ports to Swift unchanged.
 *
 * BOUNDARY CONDITION. These are Dirichlet eigenmodes: the surface is taken to
 * be at Ts(t). In water that is nearly exact (Bi = h*R/k ~ 33, see biotNumber),
 * costing a few percent which calibration absorbs. In air the egg is nearly
 * lumped (Bi ~ 0.4) and Dirichlet would be badly wrong, so the cooling phase
 * instead drives Ts along the egg's own lumped decay - see protocol.ts. That
 * approximation is the least-verified part of the model and is calibratable.
 */

import { MODE_COUNT, K_EGG } from './constants.js';

export interface SphereState {
  radius_m: number;
  /** Decay rate of each mode, 1/s. */
  lambda: number[];
  /** Duhamel coupling coefficient of each mode to the surface drive. */
  coef: number[];
  /** Mode amplitudes, the actual state. */
  amp: number[];
  /** Current surface temperature, C. */
  surface_C: number;
}

/** Create a sphere at uniform temperature `initial_C` whose surface is held at
 *  `surface_C`. */
export function createSphere(
  radius_m: number,
  alpha_m2s: number,
  initial_C: number,
  surface_C: number,
): SphereState {
  const lambda: number[] = new Array<number>(MODE_COUNT);
  const coef: number[] = new Array<number>(MODE_COUNT);
  const amp: number[] = new Array<number>(MODE_COUNT);
  for (let i = 0; i < MODE_COUNT; i++) {
    const n = i + 1;
    const k = n * Math.PI / radius_m;
    lambda[i] = alpha_m2s * k * k;
    coef[i] = 2.0 * radius_m * (n % 2 === 1 ? 1.0 : -1.0) / (n * Math.PI);
    amp[i] = coef[i] * (initial_C - surface_C);
  }
  return { radius_m: radius_m, lambda: lambda, coef: coef, amp: amp, surface_C: surface_C };
}

/** Advance by dt seconds, ramping the surface linearly to `nextSurface_C`.
 *  Exact for a linear surface ramp over the step. Mutates `s`. */
export function stepSphere(s: SphereState, dt_s: number, nextSurface_C: number): void {
  const slope = (nextSurface_C - s.surface_C) / dt_s;
  for (let i = 0; i < MODE_COUNT; i++) {
    const decay = Math.exp(-s.lambda[i] * dt_s);
    s.amp[i] = s.amp[i] * decay - s.coef[i] * slope * (1.0 - decay) / s.lambda[i];
  }
  s.surface_C = nextSurface_C;
}

/** Temperature at normalised radius x = r/R, in [0, 1]. */
export function temperatureAt(s: SphereState, x: number): number {
  if (x < 1e-9) return centreTemperature(s);
  const r = x * s.radius_m;
  let sum = 0.0;
  for (let i = 0; i < MODE_COUNT; i++) {
    sum += s.amp[i] * Math.sin((i + 1) * Math.PI * r / s.radius_m);
  }
  return s.surface_C + sum / r;
}

/** Temperature at the centre. The sin(n*pi*r/R)/r factor tends to n*pi/R. */
export function centreTemperature(s: SphereState): number {
  let sum = 0.0;
  for (let i = 0; i < MODE_COUNT; i++) {
    sum += (i + 1) * s.amp[i];
  }
  return s.surface_C + Math.PI * sum / s.radius_m;
}

/**
 * Closed-form solution for a step change in surface temperature, used to
 * validate the integrator. Returns theta/theta0 = (T - Ts)/(T0 - Ts).
 *
 *   theta/theta0 = 2 * sum (-1)^(n+1) * sinc(n*pi*x) * exp(-n^2*pi^2*Fo)
 *
 * Converges like exp(-n^2*pi^2*Fo), so it is slowest at small Fo - exactly
 * where egg boiling sits (Fo ~ 0.07-0.22). Hence 40 terms, not one.
 */
export function seriesTheta(x: number, fourier: number): number {
  let sum = 0.0;
  for (let n = 1; n <= MODE_COUNT; n++) {
    const sign = n % 2 === 1 ? 1.0 : -1.0;
    const u = n * Math.PI * x;
    const sinc = u < 1e-12 ? 1.0 : Math.sin(u) / u;
    sum += sign * sinc * Math.exp(-n * n * Math.PI * Math.PI * fourier);
  }
  return 2.0 * sum;
}

/**
 * The same quantity via the method of images, which converges FASTEST exactly
 * where the eigenfunction series is slowest. Independent derivation, so
 * agreement between the two is a real check rather than a tautology.
 */
export function erfcTheta(x: number, fourier: number): number {
  if (x < 1e-9) x = 1e-9;
  const s = Math.sqrt(fourier);
  let total = 0.0;
  for (let n = 0; n <= MODE_COUNT; n++) {
    const a = (2 * n + 1) - x;
    const b = (2 * n + 1) + x;
    total += erfc(a / (2.0 * s)) - erfc(b / (2.0 * s));
  }
  return 1.0 - total / x;
}

/** Williams' one-term closed form, kept to document its error rather than to
 *  use it. The coefficient 2*sinc(pi*x) evaluates to 0.754 at the yolk
 *  boundary x = 0.693 - this is the origin of his famous 0.76. */
export function oneTermTheta(x: number, fourier: number): number {
  const u = Math.PI * x;
  const sinc = u < 1e-12 ? 1.0 : Math.sin(u) / u;
  return 2.0 * sinc * Math.exp(-Math.PI * Math.PI * fourier);
}

/** Biot number hR/k. Large means the surface really is clamped at the fluid
 *  temperature and Dirichlet is justified. */
export function biotNumber(h_Wm2K: number, radius_m: number): number {
  return h_Wm2K * radius_m / K_EGG;
}

/** Complementary error function, Chebyshev form (Numerical Recipes).
 *  Fractional error < 1.2e-7. JavaScript has no erf in the standard library. */
export function erfc(x: number): number {
  const cof = [
    -1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2,
    -9.561514786808631e-3, -9.46595344482036e-4, 3.66839497852761e-4,
    4.2523324806907e-5, -2.0278578112534e-5, -1.624290004647e-6,
    1.303655835580e-6, 1.5626441722e-8, -8.5238095915e-8,
    6.529054439e-9, 5.059343495e-9, -9.91364156e-10,
    -2.27365122e-10, 9.6467911e-11, 2.394038e-12,
    -6.886027e-12, 8.94487e-13, 3.13092e-13,
    -1.12708e-13, 3.81e-16, 7.106e-15,
  ];
  const z = Math.abs(x);
  const t = 2.0 / (2.0 + z);
  const ty = 4.0 * t - 2.0;
  let d = 0.0;
  let dd = 0.0;
  for (let j = cof.length - 1; j > 0; j--) {
    const tmp = d;
    d = ty * d - dd + cof[j];
    dd = tmp;
  }
  const ans = t * Math.exp(-z * z + 0.5 * (cof[0] + ty * d) - dd);
  return x >= 0.0 ? ans : 2.0 - ans;
}
