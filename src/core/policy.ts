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

import { SIZE_CLASSES } from './geometry.js';

import { DonenessAnchor, DONENESS_ANCHORS, Solution } from './solve.js';
import { T_ROOM_C } from './constants.js';

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
  sizeIndex: { lo: -1, hi: SIZE_CLASSES.length - 1 },
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
  /** Index into SIZE_CLASSES - 'Large', 68 g. */
  sizeIndex: 2,
  customMinor_mm: 44,
  customStart_C: 12,
  altitude_m: 0,
  waterLitres: 2,
  eggCount: 2,
  doneness: 0.41,
};

/** The mass a fresh install cooks, kg. Derived rather than restated, so the
 *  size class and the number can never disagree. */
export const DEFAULT_EGG_MASS_KG = SIZE_CLASSES[DEFAULTS.sizeIndex].mass_kg;

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
 */
export type RefusalKind = 'none' | 'tooSoftForWhite' | 'harderThanPanReaches' | 'whiteNeverSets';

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
      worthSaying: limit.label !== wanted.label,
    };
  }

  const limit = anchorNear(sol.softestLevel);
  const snapped = snapUp(sol.softestLevel);
  return {
    kind: 'tooSoftForWhite',
    wanted: wanted,
    limit: limit,
    snapTo: snapped > level ? snapped : null,
    worthSaying: limit.label !== wanted.label,
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
 *  stage of the cook, not a suggestion appended to the end of it. */
export const COOLING_SECONDS = 180;

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
