/**
 * Can the eggs be cooled in a bowl of still water, and how sure would the
 * app be?
 *
 * Run: node studies/bowl.ts
 *
 * Quoted by README.md sections 2.4 and 11.3.
 *
 * The request: the eggs come out of the pan into a bowl of water filled from
 * the tap and left alone, not running, not iced. The cook would say how much
 * water, how warm it is (defaulting to the room) and how many eggs. Unlike
 * ice or running water, the bowl warms as the eggs give up their heat, so
 * the egg's surface sees a water temperature that rises with time.
 *
 * Read-only. Nothing in src/ is touched, and nothing in src/ imports this.
 *
 * THE MODEL (all of it textbook; no egg-specific source is needed or used):
 *
 * - The bowl is a well-mixed lumped mass of water, with an optional bowl
 *   heat capacity at the water's temperature. It gains exactly what the eggs
 *   lose, from the eggs' own modal mean temperature (`meanTemperature`, times
 *   N m c), and exchanges with the room through UA. Its temperature is fed to
 *   the egg's surface each step, so it is a smooth curve, never a step.
 * - The other bound on mixing is a bowl that never warms where the eggs are:
 *   the eggs on the bottom, their plumes carrying the heat to the top (a
 *   "filling box"). That is the tap at the bowl's starting temperature. The
 *   truth is between the two, and the two are printed side by side.
 * - The surface is either clamped (Dirichlet, as the ice bath and the tap are
 *   in core, blended out of the boiling water over TAU_PLUNGE), or held by
 *   Newton's law at the shell (`robinSurface`) against the bowl with h from
 *   free convection about a sphere in water: Churchill (1983), as
 *   Incropera et al., Fundamentals of Heat and Mass Transfer, give it,
 *   Nu = 2 + 0.589 Ra^(1/4) / [1 + (0.469/Pr)^(9/16)]^(4/9), Pr >= 0.7,
 *   Ra <= 1e11, with water's properties at the film temperature (Incropera
 *   Table A.6, saturated liquid), D the equal-volume sphere's diameter, and
 *   the shell and membranes in series (3200 W/m^2K, the figure H_EFF in
 *   constants.ts is built on). The correlation is fitted in part to Amato &
 *   Tien (1972), heated spheres in water.
 * - Stirring is forced convection about a sphere, Whitaker's correlation
 *   (also in Incropera), Nu = 2 + (0.4 Re^(1/2) + 0.06 Re^(2/3)) Pr^0.4 (mu/mu_s)^(1/4).
 * - The room exchange: the bowl's free surface and wall, A ~ 5.6 V^(2/3)
 *   (a mixing bowl filled two-thirds: 0.09 m^2 at 2 L), at U ~ 15 W/m^2K
 *   (free convection off a warm upward face, Incropera's plate, ~4; the
 *   water's radiation, ~6; evaporation and the wall, the rest), so UA ~ 1.4
 *   W/K at 2 L: a time constant of 1.7 hours. It is swept 0 to 3x.
 *
 * Every egg is the same egg, so N eggs sharing a bowl is N times one egg's
 * heat; how they crowd each other's boundary layers is inside the range of h.
 *
 * Cross-checks before anything is believed: the loop here reproduces
 * `simulate` for ice, tap and air; `robinSurface` reproduces the closed-form
 * Robin series for a sphere at the Biot numbers the bowl has (10-30), not
 * only the counter's 0.6 that test/core.test.ts checks.
 *
 * What it prints, for a 68 g egg from the fridge into boiling water, held,
 * aiming at jammy (0.41): (1) h from the shell's temperature; (2) the bowl
 * beside ice, running water at 5-25 C and the air at -2..+2 sd of
 * tauAirScale; (3) the surface and the mixing; (4) each input alone; (5)
 * egg count against water volume: what the warming alone does, the softest
 * yolk, the time until the egg's mean is 40 C ("cool enough to handle"), the
 * water, and where the bowl settles; (6) what is left unknown once the
 * inputs are given, and what an input given wrong costs; (7) the same for
 * running water, the ice bath and the air; (8) what a probe in the yolk
 * would read, to tell the surfaces apart. "water@pk" is the bowl's mean at
 * the yolk's peak, which the still bound does not let the eggs see.
 */

import {
  ALPHA_DEFAULT, ALPHA_REL_SD, C_EGG, C_WATER, DT_SIM, K_EGG, TAU_PLUNGE, TREF_WHITE_C, TREF_YOLK_C,
  YOLK_RADIUS_FRAC, Z_WHITE, Z_YOLK,
} from '../src/core/constants.ts';
import { type Egg, eggFromMass } from '../src/core/geometry.ts';
import { DEFAULTS, DEFAULT_EGG_MASS_KG } from '../src/core/inputs.ts';
import {
  type CookSetup, airTimeConstant, bathTemperature, coolingTemperature, initialSurfaceTemperature,
  wetShellDrop_C,
} from '../src/core/protocol.ts';
import {
  type SphereState, centreTemperature, createSphere, meanTemperature, robinSurface, stepSphere,
  temperatureAt,
} from '../src/core/sphere.ts';
import { donenessFromSlider, simulate, sliderFromYolkDose } from '../src/core/solve.ts';

/* ------------------------------------------------------------- water */

/** Saturated liquid water, Incropera Table A.6 at 5 K steps: T (K),
 *  viscosity (1e-6 N s/m^2), conductivity (W/m K), Prandtl number,
 *  expansion coefficient (1e-6 /K), specific volume (1e-3 m^3/kg). */
const WATER: number[][] = [
  [275, 1652, 0.574, 12.22, -32.74, 1.000],
  [280, 1422, 0.582, 10.26, 46.04, 1.000],
  [285, 1225, 0.590, 8.81, 114.1, 1.000],
  [290, 1080, 0.598, 7.56, 174.0, 1.001],
  [295, 959, 0.606, 6.62, 227.5, 1.002],
  [300, 855, 0.613, 5.83, 276.1, 1.003],
  [305, 769, 0.620, 5.20, 320.6, 1.005],
  [310, 695, 0.628, 4.62, 361.9, 1.007],
  [315, 631, 0.634, 4.16, 400.4, 1.009],
  [320, 577, 0.640, 3.77, 436.7, 1.011],
  [325, 528, 0.645, 3.42, 471.2, 1.013],
  [330, 489, 0.650, 3.15, 504.0, 1.016],
  [335, 453, 0.656, 2.88, 535.5, 1.018],
  [340, 420, 0.660, 2.66, 566.0, 1.021],
  [345, 389, 0.664, 2.45, 595.4, 1.024],
  [350, 365, 0.668, 2.29, 624.2, 1.027],
  [355, 343, 0.671, 2.14, 652.3, 1.030],
  [360, 324, 0.674, 2.02, 697.9, 1.034],
  [365, 306, 0.677, 1.91, 707.1, 1.038],
  [370, 289, 0.679, 1.80, 728.7, 1.041],
];

interface WaterProps { nu: number; k: number; pr: number; beta: number; mu: number }

function water(t_C: number): WaterProps {
  const tk = Math.min(370, Math.max(275, t_C + 273.15));
  let i = 0;
  while (i < WATER.length - 2 && WATER[i + 1][0] < tk) i++;
  const a = WATER[i];
  const b = WATER[i + 1];
  const f = (tk - a[0]) / (b[0] - a[0]);
  const lerp = (j: number): number => a[j] + f * (b[j] - a[j]);
  const mu = lerp(1) * 1e-6;
  return { mu: mu, nu: mu * lerp(5) * 1e-3, k: lerp(2), pr: lerp(3), beta: lerp(4) * 1e-6 };
}

/** Shell and membranes in series with the water's film, W/m^2K. */
const H_SHELL = 3200;

/** Free convection about a sphere of diameter d in water, W/m^2K, the shell
 *  at `surface_C` and the water far off at `water_C` (Churchill 1983). */
function hFree(surface_C: number, water_C: number, d_m: number): number {
  const p = water(0.5 * (surface_C + water_C));
  const dT = Math.abs(surface_C - water_C);
  const alphaW = p.nu / p.pr;
  const ra = Math.max(0, 9.81 * p.beta * dT * d_m * d_m * d_m / (p.nu * alphaW));
  const nu = 2 + 0.589 * Math.pow(ra, 0.25) / Math.pow(1 + Math.pow(0.469 / p.pr, 9 / 16), 4 / 9);
  return nu * p.k / d_m;
}

/** Forced convection about a sphere in water at speed u (Whitaker). */
function hForced(surface_C: number, water_C: number, d_m: number, u_ms: number): number {
  const p = water(water_C);
  const ps = water(surface_C);
  const re = u_ms * d_m / p.nu;
  const nu = 2 + (0.4 * Math.sqrt(re) + 0.06 * Math.pow(re, 2 / 3)) * Math.pow(p.pr, 0.4)
    * Math.pow(p.mu / ps.mu, 0.25);
  return nu * p.k / d_m;
}

function inSeries(h: number): number {
  return 1 / (1 / h + 1 / H_SHELL);
}

/* --------------------------------------------------------------- the cook */

const KG_PER_LITRE = 0.998;

/** How the egg cools after the pull. */
type Method =
  | { kind: 'ice' }
  | { kind: 'tap'; water_C: number }
  | { kind: 'air'; tauScale: number }
  | { kind: 'bowl'; bowl: Bowl };

interface Bowl {
  litres: number;
  water_C: number;
  room_C: number;
  /** The bowl's own heat capacity, J/K, at the water's temperature. */
  vessel_JK: number;
  /** Multiplier on the room exchange UA (1 = 15 W/m^2K over 5.6 V^(2/3)). */
  roomScale: number;
  /** 'mixed': the eggs see the bowl's mean. 'still': they see the water as
   *  it started (the filling-box bound), which is the tap at that temperature. */
  mixing: 'mixed' | 'still';
  /** 'clamped': Dirichlet as ice and tap are. 'free': Churchill's h x hScale.
   *  'stirred': Whitaker's at stirSpeed. 'const': h fixed at hConst. */
  surface: 'clamped' | 'free' | 'stirred' | 'const';
  hScale: number;
  stirSpeed_ms: number;
  hConst: number;
}

const BASE_BOWL: Bowl = {
  litres: 2, water_C: 20, room_C: 20, vessel_JK: 0, roomScale: 1,
  mixing: 'mixed', surface: 'free', hScale: 1, stirSpeed_ms: 0.1, hConst: 500,
};

function bowl(over: Partial<Bowl>): Method {
  return { kind: 'bowl', bowl: { ...BASE_BOWL, ...over } };
}

interface Outcome {
  yolkDose: number;
  whiteDose: number;
  /** Yolk dose accrued after the pull, equivalent min at 63 C. */
  carryDose: number;
  peakYolk_C: number;
  /** From the pull to the yolk centre's peak, s: the app's counted cooling. */
  toPeak_s: number;
  /** From the pull until the egg's mean temperature is 40 C, s; NaN if not
   *  within the window. */
  toHandle_s: number;
  /** The water at the yolk's peak, C. */
  waterAtPeak_C: number;
  /** Mean h over the first two minutes, W/m^2K (surface free only). */
  hEarly: number;
}

const HANDLE_C = 40;

/** One cook, hot start, held at the boil, `cook_s` in the pan, then
 *  `method`. `long` runs an hour past the pull for the handling time;
 *  otherwise it stops as `simulate` does once the yolk dose is spent. */
function run(
  egg: Egg, setup: CookSetup, cook_s: number, method: Method, long: boolean,
  alpha: number = ALPHA_DEFAULT, trace: number[][] | null = null,
): Outcome {
  const sphere = createSphere(egg.radius_m, alpha, setup.eggStart_C, initialSurfaceTemperature(egg, setup));
  const d = 2 * egg.radius_m;
  const area = 4 * Math.PI * egg.radius_m * egg.radius_m;
  const eggC = egg.mass_kg * C_EGG;
  const b = method.kind === 'bowl' ? method.bowl : null;
  const waterC = b === null ? 0 : b.litres * KG_PER_LITRE * C_WATER + b.vessel_JK;
  const ua = b === null ? 0 : b.roomScale * 15 * 5.6 * Math.pow(b.litres / 1000, 2 / 3);

  let t = 0;
  let yolk = 0;
  let white = 0;
  let yolkAtPull = 0;
  let peak = setup.eggStart_C;
  let peakAt = 0;
  let waterAtPeak = Number.NaN;
  let pulled = false;
  let waterAtPull = sphere.surface_C;
  let meanAtPull = 0;
  let bowl_C = b === null ? Number.NaN : b.water_C;
  let toRoom_J = 0;
  let handle = Number.NaN;
  let hSum = 0;
  let hN = 0;
  let prevYolk = setup.eggStart_C;
  let peakRate = 0;
  const end = cook_s + (long ? 3600 : 900);

  while (t < end) {
    const tNext = t + DT_SIM;
    let next: number;
    if (tNext < cook_s) {
      next = bathTemperature(egg, setup, tNext);
    } else {
      if (!pulled) {
        pulled = true;
        waterAtPull = sphere.surface_C;
        meanAtPull = meanTemperature(sphere);
        yolkAtPull = yolk;
      }
      const after = tNext - cook_s;
      if (method.kind === 'ice') {
        next = coolingTemperature(sphere, egg, { ...setup, cooling: 'ice' }, after, DT_SIM, waterAtPull, meanAtPull);
      } else if (method.kind === 'tap') {
        next = method.water_C + (waterAtPull - method.water_C) * Math.exp(-after / TAU_PLUNGE);
      } else if (method.kind === 'air') {
        // coolingTemperature's counter branch, its time constant scaled.
        const before = after > DT_SIM ? after - DT_SIM : 0;
        const drying = wetShellDrop_C(egg) * (Math.exp(-before / TAU_PLUNGE) - Math.exp(-after / TAU_PLUNGE));
        const tau = airTimeConstant(egg) * method.tauScale;
        const out = after / DT_SIM;
        if (after >= DT_SIM) next = robinSurface(sphere, DT_SIM, setup.ambient_C, tau, drying);
        else if (!(out > 0)) next = waterAtPull;
        else next = waterAtPull + (robinSurface(sphere, DT_SIM, setup.ambient_C, tau, drying / out) - waterAtPull) * out;
      } else {
        const bw = method.bowl;
        // The bowl as it stands: what N eggs have given it since the pull,
        // less what it has given the room.
        const gained = setup.eggCount * eggC * (meanAtPull - meanTemperature(sphere));
        bowl_C = bw.water_C + (gained - toRoom_J) / waterC;
        toRoom_J += ua * (bowl_C - bw.room_C) * DT_SIM;
        const seen = bw.mixing === 'mixed' ? bowl_C : bw.water_C;
        // Out of the boiling water and into the bowl over TAU_PLUNGE: the
        // medium blends, so the surface never steps.
        const medium = seen + (waterAtPull - seen) * Math.exp(-after / TAU_PLUNGE);
        if (bw.surface === 'clamped') {
          next = medium;
        } else {
          const h = bw.surface === 'const' ? inSeries(bw.hConst)
            : bw.surface === 'stirred' ? inSeries(hForced(sphere.surface_C, seen, d, bw.stirSpeed_ms))
              : inSeries(hFree(sphere.surface_C, seen, d)) * bw.hScale;
          if (after <= 120) { hSum += h; hN++; }
          next = robinSurface(sphere, DT_SIM, medium, eggC / (h * area), 0);
        }
      }
    }
    stepSphere(sphere, DT_SIM, next);
    t = tNext;

    const c = centreTemperature(sphere);
    const rate = Math.pow(10, (c - TREF_YOLK_C) / Z_YOLK);
    yolk += rate * DT_SIM / 60;
    white += Math.pow(10, (temperatureAt(sphere, YOLK_RADIUS_FRAC) - TREF_WHITE_C) / Z_WHITE) * DT_SIM / 60;
    if (c > peak) { peak = c; peakAt = t; waterAtPeak = bowl_C; }
    if (pulled && Number.isNaN(handle) && meanTemperature(sphere) <= HANDLE_C) handle = t - cook_s;
    if (trace !== null && pulled && (t - cook_s) % 30 === 0) trace.push([t - cook_s, c, bowl_C]);
    if (rate > peakRate) peakRate = rate;
    if (!long && pulled && c < prevYolk && rate < 1e-6 * peakRate) break;
    if (long && trace === null && pulled && !Number.isNaN(handle) && c < prevYolk && rate < 1e-6 * peakRate) break;
    prevYolk = c;
  }
  return {
    yolkDose: yolk, whiteDose: white, carryDose: yolk - yolkAtPull, peakYolk_C: peak,
    toPeak_s: peakAt - cook_s, toHandle_s: handle, waterAtPeak_C: waterAtPeak,
    hEarly: hN > 0 ? hSum / hN : Number.NaN,
  };
}

/* ------------------------------------------------------------ the answer */

const LEVEL = DEFAULTS.doneness;
const TARGET = donenessFromSlider(LEVEL);

/** Shortest cook, s, on the 0.5 s grid, at which `metric` reaches `target`. */
function cookFor(egg: Egg, setup: CookSetup, method: Method, target: number, white: boolean): number {
  let lo = 60;
  let hi = 1800;
  while (hi - lo > 0.5) {
    const mid = Math.round((lo + hi)) / 2;
    const o = run(egg, setup, mid, method, false);
    if ((white ? o.whiteDose : o.yolkDose) < target) lo = mid; else hi = mid;
  }
  return hi;
}

interface Answer {
  /** The cook for the target yolk (jammy), s; NaN if the white cannot set
   *  without passing it. */
  cook_s: number;
  /** Softest yolk with the white set, as a slider level. */
  softest: number;
  at: Outcome;
}

function answer(egg: Egg, setup: CookSetup, method: Method): Answer {
  const minCook = cookFor(egg, setup, method, TARGET.whiteDose_min, true);
  const atMin = run(egg, setup, minCook, method, false);
  const softest = sliderFromYolkDose(atMin.yolkDose);
  const cook = atMin.yolkDose >= TARGET.yolkDose_min ? Number.NaN : cookFor(egg, setup, method, TARGET.yolkDose_min, false);
  const at = run(egg, setup, Number.isNaN(cook) ? minCook : cook, method, true);
  return { cook_s: cook, softest: softest, at: at };
}

function setupFor(eggCount: number): CookSetup {
  return {
    startMode: 'hot', eggStart_C: 4, ambient_C: 20, boiling_C: 100, timeToBoil_s: 480,
    cooling: 'ice', waterLitres: DEFAULTS.waterLitres, eggCount: eggCount,
  };
}

/* ---------------------------------------------------------------- output */

function f(x: number, digits: number, width: number): string {
  const s = Number.isNaN(x) ? '-' : x.toFixed(digits);
  return s.padStart(width);
}

function mmss(s: number): string {
  if (Number.isNaN(s)) return '  >60:00';
  const m = Math.floor(s / 60);
  const r = Math.round(s - 60 * m);
  return `${m}:${r < 10 ? '0' : ''}${r}`.padStart(8);
}

const HEAD = 'cook(s)  dcook  softest  peak(C)  topeak  handle  water@pk  h(0-2min)';

function row(label: string, a: Answer, ref: Answer | null): string {
  const dc = ref === null ? Number.NaN : a.cook_s - ref.cook_s;
  return `${label.padEnd(34)}${f(a.cook_s, 1, 7)}${f(dc, 1, 7)}${f(a.softest, 2, 9)}`
    + `${f(a.at.peakYolk_C, 2, 9)}${mmss(a.at.toPeak_s)}`
    + `${mmss(a.at.toHandle_s)}${f(a.at.waterAtPeak_C, 1, 10)}${f(a.at.hEarly, 0, 11)}`;
}

/* --------------------------------------------------------------- checks */

/** The loop against `simulate`, for the three methods core has. */
function checkAgainstCore(): void {
  const egg = eggFromMass(DEFAULT_EGG_MASS_KG);
  let worst = 0;
  const methods: [CookSetup['cooling'], Method][] = [
    ['ice', { kind: 'ice' }], ['tap', { kind: 'tap', water_C: 15 }], ['counter', { kind: 'air', tauScale: 1 }],
  ];
  for (const [cooling, m] of methods) {
    for (const cook of [300, 420, 600]) {
      const s = { ...setupFor(2), cooling: cooling };
      const core = simulate(egg, s, { alpha_m2s: ALPHA_DEFAULT }, cook);
      const mine = run(egg, s, cook, m, false);
      worst = Math.max(worst, Math.abs(core.peakYolk_C - mine.peakYolk_C),
        Math.abs(Math.log10(core.yolkDose_min) - Math.log10(mine.yolkDose)));
    }
  }
  console.log(`loop vs simulate, ice/tap/air at 300/420/600 s: worst |peak| or |log10 dose| difference ${worst.toExponential(2)}`);
}

/** The positive roots of 1 - mu cot(mu) = Bi, one in each ((n-1)pi, n pi). */
function robinRoots(bi: number, count: number): number[] {
  const out: number[] = [];
  const g = (mu: number): number => mu * Math.cos(mu) - (1 - bi) * Math.sin(mu);
  for (let n = 1; n <= count; n++) {
    let lo = (n - 1) * Math.PI + 1e-9;
    let hi = n * Math.PI - 1e-9;
    for (let i = 0; i < 200; i++) {
      const mid = 0.5 * (lo + hi);
      if (g(lo) * g(mid) <= 0) hi = mid; else lo = mid;
    }
    out.push(0.5 * (lo + hi));
  }
  return out;
}

/** robinSurface against the closed-form series, a sphere from 80 C into a
 *  medium at 20 C, at the bowl's Biot numbers. */
function checkRobin(): void {
  const egg = eggFromMass(DEFAULT_EGG_MASS_KG);
  const r = egg.radius_m;
  const lines: string[] = [];
  for (const bi of [10, 20, 30]) {
    const tau = r * r / (3 * ALPHA_DEFAULT * bi);
    const s: SphereState = createSphere(r, ALPHA_DEFAULT, 80, 80);
    const mus = robinRoots(bi, 200);
    let worst = 0;
    let t = 0;
    for (let k = 1; k <= 1600; k++) {
      // Into the medium over TAU_PLUNGE, as the bowl is entered, would blur
      // the comparison; the closed form is a step, so the check is a step.
      const next = robinSurface(s, DT_SIM, 20, tau, 0);
      stepSphere(s, DT_SIM, next);
      t += DT_SIM;
      if (k % 40 !== 0 || t < 60) continue;
      const fo = ALPHA_DEFAULT * t / (r * r);
      let centre = 0;
      let mean = 0;
      for (const mu of mus) {
        const cn = 4 * (Math.sin(mu) - mu * Math.cos(mu)) / (2 * mu - Math.sin(2 * mu));
        const e = Math.exp(-mu * mu * fo);
        centre += cn * e;
        mean += cn * 3 * (Math.sin(mu) - mu * Math.cos(mu)) / (mu * mu * mu) * e;
      }
      worst = Math.max(worst, Math.abs(centreTemperature(s) - (20 + 60 * centre)),
        Math.abs(meanTemperature(s) - (20 + 60 * mean)));
    }
    lines.push(`Bi ${bi}: ${worst.toFixed(3)} C`);
  }
  console.log(`robinSurface vs the Robin series, 80 -> 20 C, worst centre or mean after 1 min, to 13 min: ${lines.join(', ')}`);
}

/* ----------------------------------------------------------------- study */

function main(): void {
  const egg = eggFromMass(DEFAULT_EGG_MASS_KG);
  const base = setupFor(DEFAULTS.eggCount);
  console.log(`Bowl of still water: ${(egg.mass_kg * 1000).toFixed(0)} g egg (R ${(egg.radius_m * 1000).toFixed(1)} mm), `
    + `from the fridge into boiling water, held; target ${LEVEL} (jammy).`);
  console.log(`Biot number h R / k at h_eff 300/500/700 W/m^2K: `
    + [300, 500, 700].map((h) => (h * egg.radius_m / K_EGG).toFixed(1)).join('/'));
  checkAgainstCore();
  checkRobin();

  console.log('\n1. h about the egg in a 20 C bowl, from the shell temperature (W/m^2K, water side / with the shell in series)');
  const d = 2 * egg.radius_m;
  for (const ts of [90, 70, 50, 35, 25]) {
    const hf = hFree(ts, 20, d);
    console.log(`   shell ${ts} C: free ${hf.toFixed(0)} / ${inSeries(hf).toFixed(0)};`
      + `  stirred 0.05 m/s ${inSeries(hForced(ts, 20, d, 0.05)).toFixed(0)}, 0.1 m/s ${inSeries(hForced(ts, 20, d, 0.1)).toFixed(0)}, `
      + `0.2 m/s ${inSeries(hForced(ts, 20, d, 0.2)).toFixed(0)}`);
  }

  console.log(`\n2. The methods side by side, ${DEFAULTS.eggCount} eggs (dcook against ice; handle = egg's mean to ${HANDLE_C} C)`);
  console.log(''.padEnd(34) + HEAD);
  const ice = answer(egg, base, { kind: 'ice' });
  console.log(row('ice bath (core)', ice, ice));
  for (const tw of [5, 10, 15, 20, 25]) console.log(row(`running water at ${tw} C`, answer(egg, base, { kind: 'tap', water_C: tw }), ice));
  for (const sd of [-2, -1, 0, 1, 2]) {
    console.log(row(`air, tau x e^(${sd} x 0.35)`, answer(egg, base, { kind: 'air', tauScale: Math.exp(0.35 * sd) }), ice));
  }
  const bowlBase = answer(egg, base, bowl({}));
  console.log(row('bowl 2 L at 20 C (base)', bowlBase, ice));

  console.log('\n3. The surface and the mixing, base bowl (dcook against the base bowl)');
  console.log(''.padEnd(34) + HEAD);
  const variants: [string, Partial<Bowl>][] = [
    ['clamped, mixed', { surface: 'clamped' }],
    ['clamped, still (= tap at 20 C)', { surface: 'clamped', mixing: 'still' }],
    ['free h x 0.5, mixed', { hScale: 0.5 }],
    ['free h x 1, mixed (base)', {}],
    ['free h x 2, mixed', { hScale: 2 }],
    ['free h x 1, still', { mixing: 'still' }],
    ['free h x 0.5, still', { hScale: 0.5, mixing: 'still' }],
    ['h const 250', { surface: 'const', hConst: 250 }],
    ['h const 1000', { surface: 'const', hConst: 1000 }],
    ['stirred 0.1 m/s, mixed', { surface: 'stirred', stirSpeed_ms: 0.1 }],
    ['bowl vessel 1000 J/K', { vessel_JK: 1000 }],
    ['room exchange x 0', { roomScale: 0 }],
    ['room exchange x 3', { roomScale: 3 }],
  ];
  for (const [label, over] of variants) console.log(row(label, answer(egg, base, bowl(over)), bowlBase));

  console.log('\n   For scale, the ice bath under the same free-convection Robin boundary as the bowl');
  console.log('   (a 2 C bowl that never warms), against the ice bath clamped:');
  const iceRobin = answer(egg, base, bowl({ water_C: 2, mixing: 'still' }));
  console.log(''.padEnd(34) + HEAD);
  console.log(row('ice, free h, still', iceRobin, ice));
  console.log(row('ice, free h x 0.5, still', answer(egg, base, bowl({ water_C: 2, mixing: 'still', hScale: 0.5 })), ice));

  console.log('\n4. One input at a time. "clamped" is the surface as core holds it in ice and running water;');
  console.log('   "free" is Churchill\'s h. dcook is against the same surface\'s base bowl, or, for the egg count');
  console.log('   and size, against ice for the same pan and egg. handle and water@pk are the free surface\'s.');
  console.log('                                    clamped: cook  dcook   peak     free: cook  dcook   peak   handle  water@pk');
  const clampedBase = answer(egg, base, bowl({ surface: 'clamped' }));
  const one = (label: string, e: Egg, s: CookSetup, over: Partial<Bowl>, refC: Answer, refF: Answer): void => {
    const c = answer(e, s, bowl({ ...over, surface: 'clamped' }));
    const fr = answer(e, s, bowl(over));
    console.log(`   ${label.padEnd(30)}${f(c.cook_s, 1, 12)}${f(c.cook_s - refC.cook_s, 1, 7)}${f(c.at.peakYolk_C, 2, 7)}`
      + `${f(fr.cook_s, 1, 16)}${f(fr.cook_s - refF.cook_s, 1, 7)}${f(fr.at.peakYolk_C, 2, 7)}`
      + `${mmss(fr.at.toHandle_s)}${f(fr.at.waterAtPeak_C, 1, 10)}`);
  };
  one('base: 2 L at 20 C, 2 eggs', egg, base, {}, clampedBase, bowlBase);
  for (const v of [0.5, 1, 1.5, 3, 4]) one(`water ${v} L`, egg, base, { litres: v }, clampedBase, bowlBase);
  for (const tw of [8, 12, 15, 25]) one(`water at ${tw} C`, egg, base, { water_C: tw }, clampedBase, bowlBase);
  for (const room of [15, 30]) {
    one(`room ${room} C, water 20 C`, egg, { ...base, ambient_C: room }, { room_C: room }, clampedBase, bowlBase);
  }
  for (const n of [1, 2, 4, 6, 8, 12]) {
    const s = setupFor(n);
    const i = answer(egg, s, { kind: 'ice' });
    one(`${n} eggs (vs ice)`, egg, s, {}, i, i);
  }
  for (const m of [50, 60, 75]) {
    const e = eggFromMass(m / 1000);
    const i = answer(e, base, { kind: 'ice' });
    one(`${m} g eggs (vs ice)`, e, base, {}, i, i);
  }
  {
    const cold: CookSetup = { ...base, startMode: 'cold' };
    const i = answer(egg, cold, { kind: 'ice' });
    one('cold start, 8 min boil (vs ice)', egg, cold, {}, i, i);
  }

  console.log('\n5. Eggs against water, at 20 C. First what the warming alone does: the jammy cook in a bowl');
  console.log('   that warms (mixed) minus one that never does (still: the tap at 20 C), clamped surface, s');
  const counts = [1, 2, 3, 4, 6, 8, 12];
  const litres = [0.5, 0.75, 1, 1.5, 2, 3, 4];
  const header = '   L \\ eggs' + counts.map((n) => String(n).padStart(8)).join('');
  const lead = (v: number): string => `   ${v.toFixed(2).padStart(5)}    `;
  const handleRows: string[] = [];
  const handleClampedRows: string[] = [];
  const peakRows: string[] = [];
  const softRows: string[] = [];
  console.log(header);
  for (const v of litres) {
    let line = lead(v);
    let hline = lead(v);
    let hcline = lead(v);
    let pline = lead(v);
    let sline = lead(v);
    for (const n of counts) {
      const s = setupFor(n);
      const warm = answer(egg, s, bowl({ litres: v, surface: 'clamped' }));
      const still = answer(egg, s, bowl({ litres: v, surface: 'clamped', mixing: 'still' }));
      const free = answer(egg, s, bowl({ litres: v }));
      line += f(warm.cook_s - still.cook_s, 1, 8);
      hline += mmss(free.at.toHandle_s);
      hcline += mmss(warm.at.toHandle_s);
      pline += f(free.at.waterAtPeak_C, 1, 8);
      sline += f(warm.softest - still.softest, 3, 8);
    }
    console.log(line);
    handleRows.push(hline);
    handleClampedRows.push(hcline);
    peakRows.push(pline);
    softRows.push(sline);
  }
  console.log('   The same for the softest yolk the bowl allows, as slider levels');
  console.log(header);
  for (const l of softRows) console.log(l);
  console.log(`   Time from the pull until the egg's mean is ${HANDLE_C} C (m:ss), free surface`);
  console.log(header);
  for (const l of handleRows) console.log(l);
  console.log('   The same, clamped surface');
  console.log(header);
  for (const l of handleClampedRows) console.log(l);
  console.log('   The water at the yolk\'s peak (C), free surface');
  console.log(header);
  for (const l of peakRows) console.log(l);
  console.log('   Egg mass over water mass');
  console.log(header);
  for (const v of litres) {
    console.log(lead(v) + counts.map((n) => (n * egg.mass_kg / (v * KG_PER_LITRE)).toFixed(2).padStart(8)).join(''));
  }
  {
    const s0 = setupFor(2);
    const cook = clampedBase.cook_s;
    const sph = createSphere(egg.radius_m, ALPHA_DEFAULT, s0.eggStart_C, initialSurfaceTemperature(egg, s0));
    for (let t = 0; t < cook; t += DT_SIM) stepSphere(sph, DT_SIM, bathTemperature(egg, s0, t + DT_SIM));
    const mean = meanTemperature(sph);
    console.log(`   Where the bowl settles with no room exchange (C), from the egg's mean at the jammy pull, ${mean.toFixed(1)} C`);
    console.log(header);
    for (const v of litres) {
      console.log(lead(v) + counts.map((n) => {
        const ce = n * egg.mass_kg * C_EGG;
        const cw = v * KG_PER_LITRE * C_WATER;
        return ((ce * mean + cw * 20) / (ce + cw)).toFixed(1).padStart(8);
      }).join(''));
    }
  }

  console.log('\n6. What is left unknown once the cook has given volume, count and water temperature:');
  console.log('   the jammy cook time and the peak yolk at a fixed cook, as ranges');
  const cases: [string, number, Partial<Bowl>][] = [
    ['2 eggs, 2 L, 20 C', 2, {}],
    ['4 eggs, 1 L, 20 C', 4, { litres: 1 }],
    ['6 eggs, 1.5 L, 15 C', 6, { litres: 1.5, water_C: 15 }],
    ['6 eggs, 1 L, 25 C', 6, { litres: 1, water_C: 25 }],
  ];
  const unknowns: [string, Partial<Bowl>][] = [
    ['free h x 0.5', { hScale: 0.5 }], ['free h x 2', { hScale: 2 }],
    ['still (filling box)', { mixing: 'still' }], ['clamped', { surface: 'clamped' }],
    ['stirred 0.1 m/s', { surface: 'stirred' }], ['vessel 1000 J/K', { vessel_JK: 1000 }],
    ['room exchange x 0', { roomScale: 0 }], ['room exchange x 3', { roomScale: 3 }],
  ];
  const errors: [string, (b: Bowl) => Partial<Bowl>][] = [
    ['volume -25%', (b) => ({ litres: b.litres * 0.75 })], ['volume +25%', (b) => ({ litres: b.litres * 1.25 })],
    ['water -2 C', (b) => ({ water_C: b.water_C - 2 })], ['water +2 C', (b) => ({ water_C: b.water_C + 2 })],
    ['water -6 C (room assumed, cold tap)', (b) => ({ water_C: b.water_C - 6 })],
  ];
  /** What `m` does against `ref`: the cook for `target` moves by dcook; at
   *  ref's cook the peak moves by dpeak and the carryover dose by dcarry
   *  decades (one decade is 0.22 of the slider). */
  const versus = (e: Egg, s: CookSetup, ref: Method, m: Method, target: number): number[] => {
    const refCook = cookFor(e, s, ref, target, false);
    const r0 = run(e, s, refCook, ref, false);
    const r1 = run(e, s, refCook, m, false);
    return [cookFor(e, s, m, target, false) - refCook, r1.peakYolk_C - r0.peakYolk_C,
      Math.log10(r1.carryDose) - Math.log10(r0.carryDose)];
  };
  const spanLine = (name: string, v: number[]): string =>
    `      ${name.padEnd(38)} dcook ${f(v[0], 1, 6)} s   dpeak ${f(v[1], 2, 6)} C   dcarry ${f(v[2], 3, 7)}`;
  for (const [label, n, over] of cases) {
    const s = setupFor(n);
    const b0: Bowl = { ...BASE_BOWL, ...over };
    const m0: Method = { kind: 'bowl', bowl: b0 };
    const a0 = answer(egg, s, m0);
    console.log(`   ${label}: jammy at ${a0.cook_s.toFixed(1)} s, peak ${a0.at.peakYolk_C.toFixed(2)} C, softest ${a0.softest.toFixed(2)}`);
    const lo = [0, 0, 0];
    const hi = [0, 0, 0];
    for (const [name, u] of unknowns) {
      const v = versus(egg, s, m0, { kind: 'bowl', bowl: { ...b0, ...u } }, TARGET.yolkDose_min);
      for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], v[i]); hi[i] = Math.max(hi[i], v[i]); }
      console.log(spanLine(name, v));
    }
    console.log(`      the model's unknowns together span dcook ${lo[0].toFixed(1)}..${hi[0].toFixed(1)} s, `
      + `dpeak ${lo[1].toFixed(2)}..${hi[1].toFixed(2)} C, dcarry ${lo[2].toFixed(3)}..${hi[2].toFixed(3)}`);
    for (const [name, e] of errors) {
      console.log(spanLine(name, versus(egg, s, m0, { kind: 'bowl', bowl: { ...b0, ...e(b0) } }, TARGET.yolkDose_min)));
    }
  }

  console.log('\n7. The same spans for the methods the app has, 2 eggs');
  for (const tw of [5, 25]) {
    console.log(spanLine(`running water at ${tw} C, not 15`,
      versus(egg, base, { kind: 'tap', water_C: 15 }, { kind: 'tap', water_C: tw }, TARGET.yolkDose_min)));
  }
  console.log(spanLine('ice bath, free h, not clamped', versus(egg, base, { kind: 'ice' }, bowl({ water_C: 2, mixing: 'still' }), TARGET.yolkDose_min)));
  console.log(spanLine('ice bath, free h x 0.5, not clamped',
    versus(egg, base, { kind: 'ice' }, bowl({ water_C: 2, mixing: 'still', hScale: 0.5 }), TARGET.yolkDose_min)));
  const fudgy = donenessFromSlider(0.62).yolkDose_min;
  console.log('   air, at fudgy (0.62), since jammy is out of its reach:');
  for (const sd of [-2, -1, 1, 2]) {
    console.log(spanLine(`air, ${sd > 0 ? '+' : ''}${sd} sd of tauAirScale`,
      versus(egg, base, { kind: 'air', tauScale: 1 }, { kind: 'air', tauScale: Math.exp(0.35 * sd) }, fudgy)));
  }

  console.log('\n8. What one kitchen measurement would see: 2 eggs, 2 L at 20 C, the jammy cook (clamped),');
  console.log('   the yolk centre (C) and the bowl (C) from the pull, for the two surfaces and for alpha one');
  console.log('   prior sd either way. Where the columns part is what a probe can tell apart.');
  {
    const cook = clampedBase.cook_s;
    const cases8: [string, Method, number][] = [
      ['clamped', bowl({ surface: 'clamped' }), ALPHA_DEFAULT],
      ['free', bowl({}), ALPHA_DEFAULT],
      ['clamped, alpha -1 sd', bowl({ surface: 'clamped' }), ALPHA_DEFAULT * (1 - ALPHA_REL_SD)],
      ['clamped, alpha +1 sd', bowl({ surface: 'clamped' }), ALPHA_DEFAULT * (1 + ALPHA_REL_SD)],
      ['free, alpha +1 sd', bowl({}), ALPHA_DEFAULT * (1 + ALPHA_REL_SD)],
    ];
    const traces: number[][][] = [];
    const peaks: string[] = [];
    for (const [, m, a] of cases8) {
      const tr: number[][] = [];
      const o = run(egg, base, cook, m, true, a, tr);
      traces.push(tr);
      peaks.push(`${o.peakYolk_C.toFixed(1)} at ${mmss(o.toPeak_s).trim()}`);
    }
    console.log('   after   ' + cases8.map((c) => c[0].padStart(22)).join(''));
    for (let i = 0; i < traces[0].length; i++) {
      const at = traces[0][i][0];
      if (at % 60 !== 0 || at > 900) continue;
      let line = `   ${mmss(at).trim().padStart(5)}   `;
      for (const tr of traces) {
        const r = tr[i];
        line += r === undefined ? ''.padStart(22) : `${r[1].toFixed(1)} / ${r[2].toFixed(1)}`.padStart(22);
      }
      console.log(line);
    }
    console.log('   peak    ' + peaks.map((p) => p.padStart(22)).join(''));
  }
}

main();
