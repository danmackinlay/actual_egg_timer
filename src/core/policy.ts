/**
 * The decisions that turn a Solution into a cook.
 *
 * Everything here used to live twice - once in `src/ui/app.ts` and once in
 * `ios/App/Kitchen.swift` - transliterated by hand, with nothing holding the
 * copies together and no test on either. That is where every user-visible
 * divergence between the two apps came from, and it is why this module exists:
 * below the line the fixtures cover, two implementations cannot disagree
 * without `npm run conformance` saying so.
 *
 * The line is drawn at DECISIONS, not at WORDS. Which refusal applies, where
 * the slider must move to, which texture band a temperature falls in, how wide
 * the calibration grid is - all of that is policy, it is pure, and it changes
 * what the user gets, so it belongs here. The sentences a cook actually reads
 * stay in the apps: they are copy, they differ per platform, and a physics
 * package has no business holding a string table.
 *
 * Pure, like the rest of `src/core/`: no storage, no DOM, no clock.
 */

import { Egg, SIZE_CLASSES, SizeClass, US_SIZE_CLASSES } from './geometry.js';

import {
  CookResult, DonenessAnchor, DONENESS_ANCHORS, ModelParams, Solution, simulate,
} from './solve.js';
import { CookSetup, Cooling } from './protocol.js';
import { ALPHA_REL_SD, T_COLD_TAP_C, T_ICE_BATH_C, T_ROOM_C } from './constants.js';

/* ------------------------------------------------------------------ bounds */

/** Inclusive bounds on a number. */
export interface Limit {
  lo: number;
  hi: number;
}

/** Bounds on every number a user can type or drag, in one place. They go onto
 *  the input elements, onto what is typed, and onto what comes back out of
 *  storage, so the three cannot drift apart - and now they cannot drift
 *  between the two apps either. */
export const LIMITS = {
  mass_g: { lo: 25, hi: 120 },
  girth_mm: { lo: 90, hi: 200 },
  minor_mm: { lo: 30, hi: 60 },
  eggTemp_C: { lo: -2, hi: 40 },
  altitude_m: { lo: -400, hi: 5000 },
  waterLitres: { lo: 0.25, hi: 12 },
  eggCount: { lo: 1, hi: 24 },
  doneness: { lo: 0, hi: 1 },
  /** Across every table. The table in use is shorter than this outside the
   *  US, so a stored index also goes through `carrySizeIndex`. */
  sizeIndex: { lo: -1, hi: Math.max(SIZE_CLASSES.length, US_SIZE_CLASSES.length) - 1 },
  /** A tap under half a minute is a double tap, not a boil; over two hours is
   *  an app left open. */
  timeToBoil_s: { lo: 30, hi: 7200 },
};

/** Clamp a number that is already a number. The apps wrap this with their own
 *  parsing - a blank input field is "not yet typed", not zero - but the bounds
 *  themselves are decided here. */
export function clamp(value: number, limit: Limit): number {
  if (!Number.isFinite(value)) return limit.lo;
  if (value < limit.lo) return limit.lo;
  if (value > limit.hi) return limit.hi;
  return value;
}

export function isWithin(value: number, limit: Limit): boolean {
  return Number.isFinite(value) && value >= limit.lo && value <= limit.hi;
}

/* ----------------------------------------------------------------- defaults */

/** What the two named egg-temperature buttons mean, C. Their labels are
 *  rendered from this on both platforms, so a button cannot say one thing and
 *  the model another. */
export const START_TEMP_PRESETS_C: Record<'fridge' | 'room', number> = {
  fridge: 4,
  room: T_ROOM_C,
};

/** The room, as far as the model is concerned, given the egg's start.
 *
 * There is no separate input for it, and there should not be: on the default
 * path - eggs into boiling water, straight into an ice bath - the room is worth
 * nothing at all, and on a cold start about two seconds per degree. It earns
 * its keep resting on the counter and standing with the heat off, and in both
 * the user has usually already said: an egg that has been sitting out IS at
 * room temperature. A fridge egg says nothing about the room, so that case
 * keeps the default. */
export function ambientFor(eggStart_C: number): number {
  return eggStart_C >= 15 ? eggStart_C : T_ROOM_C;
}

/** Fallback when no pan has ever been measured, s. */
export const DEFAULT_TIME_TO_BOIL_S = 480;

/** The inputs a fresh install starts from. Both apps read these, because two
 *  apps that answer differently out of the box are two different answers to
 *  the same question. */
export const DEFAULTS = {
  /** Index into the region's size classes - 'Large' in both tables, 68 g in
   *  the EU one and 60.2 g on an American carton. */
  sizeIndex: 2,
  customMinor_mm: 44,
  customStart_C: 12,
  altitude_m: 0,
  waterLitres: 2,
  eggCount: 2,
  doneness: 0.41,
};

/** The reference egg, kg: an EU Large. It is what the tools model and what a
 *  fresh install cooks outside the US; the apps take theirs from the region's
 *  table, `sizeClassesFor(region)[DEFAULTS.sizeIndex]`. Derived rather than
 *  restated, so the size class and the number can never disagree. */
export const DEFAULT_EGG_MASS_KG = SIZE_CLASSES[DEFAULTS.sizeIndex].mass_kg;

/**
 * A stored size index, read against the table in use now.
 *
 * An index means something only inside one table, and the table can change
 * underneath a stored record: the phone's region is changed, the browser's
 * language is, or - the case that matters - a record saved before there were
 * two tables is read by an American. The rule is that the index keeps its
 * NAME. A cook who picked Large picked the word on their carton, and the
 * region says whose carton it is, so a Large stays a Large and cooks at the
 * new table's mass. Keeping the mass instead would leave every American who
 * never touched the control on the EU Large this table exists to replace.
 *
 * Both tables hold the same names at the same indices as far as the shorter
 * goes, so keeping the name is keeping the index. A Jumbo read outside the US
 * becomes the largest class there is, Extra large. A measured egg (-1) is
 * measured in any region. Nothing is stored about the region, so there is no
 * second record to disagree with the first.
 */
export function carrySizeIndex(stored: number, classes: SizeClass[]): number {
  if (!Number.isFinite(stored)) return DEFAULTS.sizeIndex;
  // Negatives first, so rounding never has to settle -0.5: the two languages
  // break that tie in different directions.
  if (stored < 0) return -1;
  return Math.min(Math.round(stored), classes.length - 1);
}

/* -------------------------------------------------------------- the slider */

/** Positions per unit of slider travel. The web input element's step is set
 *  from this, so a snapped level always lands where the thumb can sit. */
export const SLIDER_STEPS = 100;

/** Round a level onto the slider's grid, away from the unreachable side. The
 *  nudge keeps a level already on the grid from being pushed a whole step by
 *  floating-point noise. */
export function snapUp(level: number): number {
  return clamp(Math.ceil(level * SLIDER_STEPS - 1e-9) / SLIDER_STEPS, LIMITS.doneness);
}

export function snapDown(level: number): number {
  return clamp(Math.floor(level * SLIDER_STEPS + 1e-9) / SLIDER_STEPS, LIMITS.doneness);
}

/** The labelled position nearest a slider level. An exact tie goes to the
 *  softer anchor, because the table is walked in order and only a strictly
 *  smaller gap displaces the incumbent. Stated rather than left implicit: it
 *  decides which refusal sentence a cook reads, so both ports must agree. */
export function anchorNear(level: number): DonenessAnchor {
  let best = DONENESS_ANCHORS[0];
  let bestGap = Math.abs(best.level - level);
  for (let i = 1; i < DONENESS_ANCHORS.length; i++) {
    const gap = Math.abs(DONENESS_ANCHORS[i].level - level);
    if (gap < bestGap) {
      bestGap = gap;
      best = DONENESS_ANCHORS[i];
    }
  }
  return best;
}

/** Peak yolk temperature the slider is asking for, interpolated between the
 *  anchors. The dose scale is logarithmic precisely so that this is linear in
 *  temperature, so a straight interpolation is right - and it costs nothing,
 *  which lets the reading track the thumb while the real solve catches up. */
export function targetPeakYolk_C(level: number): number {
  const last = DONENESS_ANCHORS.length - 1;
  if (level <= DONENESS_ANCHORS[0].level) return DONENESS_ANCHORS[0].approxPeakYolk_C;
  for (let i = 0; i < last; i++) {
    const a = DONENESS_ANCHORS[i];
    const b = DONENESS_ANCHORS[i + 1];
    if (level <= b.level) {
      const span = b.level - a.level;
      if (!(span > 0)) return b.approxPeakYolk_C;
      const t = (level - a.level) / span;
      return a.approxPeakYolk_C + t * (b.approxPeakYolk_C - a.approxPeakYolk_C);
    }
  }
  return DONENESS_ANCHORS[last].approxPeakYolk_C;
}

/* -------------------------------------------------------------- the verdict */

/**
 * Why a requested doneness was refused, if it was.
 *
 *  - `tooSoftForWhite`      even the shortest cook that sets the white already
 *                           overshoots the yolk. Snap UP.
 *  - `harderThanPanReaches` the heat is off and the pan runs out before the
 *                           yolk gets there. Snap DOWN.
 *  - `whiteNeverSets`       the water falls past what the white needs while the
 *                           egg is still in it. Nothing on the slider is on
 *                           offer, so there is nowhere to snap to.
 *  - `unlikelySoft`         the pan can deliver it, but it would hit the mark
 *                           less than 3 times in 10 (`verdictWithOdds`,
 *                           reach.ts). Snap UP to the softest level that does.
 *  - `unlikelyHard`         the same at the firm end. Snap DOWN.
 */
export type RefusalKind =
  | 'none' | 'tooSoftForWhite' | 'harderThanPanReaches' | 'whiteNeverSets'
  | 'unlikelySoft' | 'unlikelyHard';

export interface Verdict {
  kind: RefusalKind;
  /** The anchor the user asked for. */
  wanted: DonenessAnchor;
  /** The nearest anchor this pan can actually deliver - the softest for
   *  `tooSoftForWhite`, the hardest for `harderThanPanReaches`. Equal to
   *  `wanted` when there is nothing to say. */
  limit: DonenessAnchor;
  /** Where the slider must move to, or null to leave it alone. */
  snapTo: number | null;
  /** False when the gap is real but too small to be worth a sentence: a sliver
   *  of unreachable track that rounds to the same label the user asked for.
   *  Only explain a refusal someone can actually taste. */
  worthSaying: boolean;
}

/** Read a Solution as a decision about the slider. Deliberately does NOT
 *  re-solve: the caller decides whether the snapped position is worth a second
 *  solve, because mid-cook it is not - the egg is already in the water. */
export function verdictFor(sol: Solution, level: number): Verdict {
  const wanted = anchorNear(level);

  if (sol.reachable) {
    return { kind: 'none', wanted: wanted, limit: wanted, snapTo: null, worthSaying: false };
  }

  if (!sol.whiteSets) {
    // Nothing to snap to: the slider has no reachable position at all. The
    // numbers shown are the furthest this pan goes, which is the only honest
    // thing left to put on screen - and it is always worth saying.
    return { kind: 'whiteNeverSets', wanted: wanted, limit: wanted, snapTo: null, worthSaying: true };
  }

  if (level > sol.hardestLevel) {
    const limit = anchorNear(sol.hardestLevel);
    const capped = snapDown(sol.hardestLevel);
    return {
      kind: 'harderThanPanReaches',
      wanted: wanted,
      limit: limit,
      snapTo: capped < level ? capped : null,
      worthSaying: limit.key !== wanted.key,
    };
  }

  const limit = anchorNear(sol.softestLevel);
  const snapped = snapUp(sol.softestLevel);
  return {
    kind: 'tooSoftForWhite',
    wanted: wanted,
    limit: limit,
    snapTo: snapped > level ? snapped : null,
    worthSaying: limit.key !== wanted.key,
  };
}

/* --------------------------------------------------------------- the texture */

/** What the white's peak temperature makes of it. */
export type WhiteBand = 'justSet' | 'set' | 'firm';
/** What the yolk's peak temperature makes of it. */
export type YolkBand = 'liquid' | 'soft' | 'jammy' | 'fudgy' | 'set';

export interface Texture {
  white: WhiteBand;
  yolk: YolkBand;
}

/** The texture note's thresholds, which are a reading of the model rather than
 *  a turn of phrase - so they are decided here and worded in the apps. Note
 *  these read PEAK TEMPERATURES, while the white's own criterion is a dose:
 *  the two disagree only when the pan never gets the white there at all, and
 *  then the dose is the one telling the truth. */
export function textureFor(peakYolk_C: number, peakWhite_C: number): Texture {
  const white: WhiteBand = peakWhite_C < 71 ? 'justSet' : peakWhite_C < 82 ? 'set' : 'firm';
  const yolk: YolkBand = peakYolk_C < 58 ? 'liquid'
    : peakYolk_C < 63 ? 'soft'
      : peakYolk_C < 68 ? 'jammy'
        : peakYolk_C < 73 ? 'fudgy'
          : 'set';
  return { white: white, yolk: yolk };
}

/* ----------------------------------------------------------- the calibration */

/** Particles in the filter, and the seed they start from. Both apps must agree
 *  or two identical kitchens learn two different things from the same egg. */
export const PARTICLE_COUNT = 1000;
export const CALIBRATION_SEED = 0x5eed1e;

/** The dose surface's extent and resolution. */
export interface GridSpec {
  alphaMin: number;
  alphaMax: number;
  alphaCount: number;
  timeMin_s: number;
  timeMax_s: number;
  timeCount: number;
}

/**
 * Where to build the dose surface for one logged outcome.
 *
 * This is the single most consequential thing in this file. The grid is handed
 * to `buildDoseGrid` by the CALLER, so its bounds decide what the particle
 * filter can see and therefore what the posterior becomes: two apps with
 * different grids learn different things from the same egg. It was duplicated
 * by hand in both apps, agreeing only by luck of maintenance.
 *
 * The bounds bracket the plausible answer rather than the whole domain: alpha
 * within a factor of ~2 of where the posterior currently sits, and cook times
 * from a third of what was cooked to a bit over double it.
 */
export function calibrationGrid(alphaCentre: number, cookTime_s: number): GridSpec {
  return {
    alphaMin: alphaCentre * 0.55,
    alphaMax: alphaCentre * 1.8,
    alphaCount: 21,
    timeMin_s: Math.max(60, cookTime_s * 0.35),
    timeMax_s: cookTime_s * 2.4,
    timeCount: 32,
  };
}

/* ------------------------------------------------------------- boil memory */

/** Remembered time to a rolling boil, seconds, keyed by water volume in litres
 *  to one decimal place. Same pan, same hob, same answer next time. Storage is
 *  the apps' business; how the numbers combine is this module's. */
export type BoilMemory = Record<string, number>;

export function volumeKey(litres: number): string {
  return litres.toFixed(1);
}

/** Blend a new measurement with what was already known for this volume, so one
 *  odd run does not dominate. Returns the memory unchanged when the
 *  measurement is not credible. */
export function rememberBoil(memory: BoilMemory, litres: number, seconds: number): BoilMemory {
  if (!isWithin(seconds, LIMITS.timeToBoil_s)) return memory;
  const key = volumeKey(litres);
  const previous = memory[key];
  const updated: BoilMemory = { ...memory };
  updated[key] = previous === undefined ? seconds : 0.5 * previous + 0.5 * seconds;
  return updated;
}

/**
 * Best guess at the time to a rolling boil for this volume: the exact
 * remembered value, else the nearest remembered volume scaled by litres
 * (energy is roughly proportional to mass), else the default.
 *
 * The nearest volume is found over SORTED keys, and ties go to the smaller
 * volume. That is not fussiness: the web iterated insertion order and Swift
 * iterated a Dictionary's arbitrary order, so two equidistant pans could give
 * the two apps different answers.
 */
export function estimateTimeToBoil(memory: BoilMemory, litres: number): number {
  const exact = memory[volumeKey(litres)];
  if (exact !== undefined) return exact;

  const keys = Object.keys(memory).sort((a, b) => Number(a) - Number(b));
  let bestLitres = 0;
  let bestSeconds = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < keys.length; i++) {
    const candidate = Number(keys[i]);
    const seconds = memory[keys[i]];
    if (!Number.isFinite(candidate) || !(candidate > 0)) continue;
    const distance = Math.abs(candidate - litres);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestLitres = candidate;
      bestSeconds = seconds;
    }
  }
  if (!(bestLitres > 0)) return DEFAULT_TIME_TO_BOIL_S;
  return clamp(bestSeconds * (litres / bestLitres), LIMITS.timeToBoil_s);
}

export function hasBoilMemory(memory: BoilMemory): boolean {
  return Object.keys(memory).length > 0;
}

/* --------------------------------------------------------- the phase rule */

/**
 * The phases of a cook, in order.
 *
 *   IDLE -> HEATING -> COOKING -> PULL -> COOLING -> DONE
 */
export type Phase = 'IDLE' | 'HEATING' | 'COOKING' | 'PULL' | 'COOLING' | 'DONE';

/** Counted-down cooling. Carryover is what ruins a soft egg, so this is a
 *  stage of the cook, not a suggestion appended to the end of it.
 *
 *  Since E4 this is the FALLBACK: the countdown runs to the moment the yolk's
 *  centre peaks (`coolingSecondsFor`), and this flat three minutes is only
 *  what a cook gets when there is no peak after the pull to run to - a
 *  heat-off pan that ran out while the egg was still in it - or when a cook
 *  stored before E4 is picked back up. */
export const COOLING_SECONDS = 180;

/** The shortest counted cooling, s. The model's peak never comes sooner than
 *  about a minute and a half after the pull for any egg the app will time
 *  (88 s, a 53 g egg at hard with the heat off); this is a floor under a
 *  rounding, not a rule anyone should meet. */
export const COOLING_MIN_SECONDS = 60;

/**
 * How long to count the cooling down, s from the pull: to the moment the
 * yolk's centre peaks, for this cook as the solver ran it (PLAN.md, old item
 * 4). Until E4 it was a flat three minutes, which for the default egg in ice
 * ended 3 s before the peak and for a small one 25 s after it; the thermometer
 * is read at the peak, so the countdown and the reading now end together.
 *
 * `result` is the solve the cook is running on, for its own cooling method -
 * the peak comes about 20 s later under a tap than in ice. On the counter
 * nothing is counted (`beginCooling`), and this is not asked.
 */
export function coolingSecondsFor(result: CookResult): number {
  const toPeak = result.peakYolkTime_s - result.cookTime_s;
  if (!(toPeak > 0.0)) return COOLING_SECONDS;
  const whole = Math.round(toPeak);
  return whole < COOLING_MIN_SECONDS ? COOLING_MIN_SECONDS : whole;
}

/**
 * Whether this cook has a moment to take a probe reading at (E4): a counted
 * cooling that ends when the yolk's centre peaks. Not on the counter, where
 * nothing is counted and the peak is nine minutes off with the carryover
 * constant in it (INFERENCE.md section 5), and not when the centre peaked
 * before the egg came out, where there is no peak after the pull to read.
 */
export function probeMomentFor(result: CookResult, cooling: Cooling): boolean {
  if (cooling === 'counter') return false;
  return result.peakYolkTime_s - result.cookTime_s >= COOLING_MIN_SECONDS;
}

/** How far past the peaks of the fastest and slowest kitchens believed in a
 *  reading may land and still be taken, C: three instrument sds. */
export const PROBE_MARGIN_C = 3.0;

/** How many prior sds of the time-scale either side of where the posterior
 *  stands a kitchen may be and still have its reading taken. Three is wider
 *  than any kitchen the prior believes in, and narrow enough that a reading
 *  with its digits swapped - 46 for 64 - lands outside. */
export const PROBE_ALPHA_SDS = 3.0;

/**
 * The centre readings the app will take for this cook, C, as [low, high].
 *
 * The peak for a time-scale PROBE_ALPHA_SDS prior sds either side of the
 * posterior mean, widened by PROBE_MARGIN_C, and never outside what is
 * possible at all: colder than the coldest thing the egg touched, or hotter
 * than the water boiled. A reading outside is refused at entry rather than
 * folded: it is a typo, the white, or another egg. For the default egg at
 * jammy in ice that is 47.6 to 81.7 C around a peak of 64.7. Two
 * simulations, so cheap enough to run on every keystroke.
 */
export function plausibleProbeRange_C(
  egg: Egg, setup: CookSetup, params: ModelParams, cookTime_s: number,
): [number, number] {
  const spread = Math.exp(PROBE_ALPHA_SDS * ALPHA_REL_SD);
  const slow = simulate(egg, setup, { alpha_m2s: params.alpha_m2s / spread, tauAirScale: params.tauAirScale }, cookTime_s);
  const fast = simulate(egg, setup, { alpha_m2s: params.alpha_m2s * spread, tauAirScale: params.tauAirScale }, cookTime_s);
  const bath = setup.cooling === 'ice' ? T_ICE_BATH_C : setup.cooling === 'tap' ? T_COLD_TAP_C : setup.ambient_C;
  const floor = Math.min(setup.eggStart_C, setup.ambient_C, bath);
  const lo = Math.min(slow.peakYolk_C, fast.peakYolk_C) - PROBE_MARGIN_C;
  const hi = Math.max(slow.peakYolk_C, fast.peakYolk_C) + PROBE_MARGIN_C;
  return [lo < floor ? floor : lo, hi > setup.boiling_C ? setup.boiling_C : hi];
}

/** If nobody confirms the transfer, assume it happened. A stalled timer at the
 *  hob is worse than a slightly optimistic one. */
export const PULL_GRACE_SECONDS = 20;

/** The deadlines a cook is made of, as epoch seconds. `coolEnd_s` is null when
 *  there is no cooling step to time - resting on the counter, where the
 *  carryover IS the point rather than something to wait out. */
export interface Deadlines {
  cookEnd_s: number;
  coolEnd_s: number | null;
  /** True on a cold start until the boil is tapped: the deadline is a guess. */
  provisional: boolean;
}

/**
 * Which phase a cook is in at a given instant.
 *
 * Pure, and it takes the clock rather than reading it, so one render sees one
 * time. This is the rule both apps derive from, and it exists here because
 * they did not agree on it: the iOS app checked for a cooling deadline BEFORE
 * checking the pull grace, so a counter rest - which has no cooling deadline -
 * fell straight from COOKING to DONE. "Out of the water, now" never appeared,
 * the 20 s grace never ran, and the phone still fired the pull notification at
 * a screen that already said Done. The web app always passed through PULL.
 *
 * PULL is therefore unconditional: every cook has a moment where the egg has
 * to come out, whatever happens to it next.
 */
export function phaseAt(d: Deadlines, now_s: number): Phase {
  if (d.provisional) return 'HEATING';
  if (now_s < d.cookEnd_s) return 'COOKING';
  if (now_s < d.cookEnd_s + PULL_GRACE_SECONDS) return 'PULL';
  if (d.coolEnd_s === null) return 'DONE';
  return now_s < d.coolEnd_s ? 'COOLING' : 'DONE';
}
