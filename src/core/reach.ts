/**
 * The odds at every level the slider offers, and what follows from them:
 * which levels are offered at all, how the track is shaded, and when the app
 * says how to make a cook more reliable (the owner, 27 September; PLAN.md).
 *
 * THE PROFILE. E5 computed the odds of the time (`decide`; once on screen as
 * "7/10 eggs hit the mark", no longer). That is one level. The profile is the
 * same number for every level the pot can deliver, computed exactly as the app
 * computes it when the slider sits there: the mean solve at that level
 * (`solveCookTime`, with the white's target where the eggs have put it), then
 * the decision on this pot's decision surface (`decide`), and its odds. So a
 * profile point and the decision at that level can never disagree - they are
 * one computation.
 *
 * Which levels. The two physical edges on the slider's grid (the softest the
 * white allows, rounded up; the firmest the pan reaches, rounded down), every
 * PROFILE_STEP positions between them, and - once an egg has taught something
 * and some level reaches REACH_ODDS - a bisection on the slider's own grid
 * (1/SLIDER_STEPS) at each end of the reachable range, so the edge the slider
 * snaps to is a level whose odds were computed, not interpolated. Between
 * points the track's shading is interpolated linearly; the odds are smooth in
 * the level, and the step is under a degree of peak yolk.
 *
 * What it costs. One point is a mean solve (tens of milliseconds, several
 * times that with the heat off) and a decision (a few ms before the first egg,
 * about 18 ms after it, when the time is chosen). A profile is 21-30 points.
 * `npm run decide -- reach` measures it; the apps build it off the main
 * thread, after the pot's decision surface, and keep one per pot and
 * posterior, like the surface.
 *
 * REACHABILITY. The softest and firmest levels offered are the softest and
 * firmest whose odds are at least REACH_ODDS (3/10, the owner's number) -
 * not, as before, whatever the mean solve could reach. That removes the case
 * the E5 build left: the app offering a level, then reporting 0/10 for it.
 * Physical impossibility still wins: the profile only has points the pan can
 * deliver, so the odds can narrow the range and never widen it. Levels inside
 * the range whose odds dip below the threshold are not refused; only the ends
 * move.
 *
 * WHEN NOTHING REACHES 3/10 the physical limits stand, with no refusal from
 * the odds at all. That is the fresh install: before any egg the prior is
 * honestly unsure, every level reads about 2/10, and refusing on that would
 * refuse a cook for being new. It is also written as a rule of its own - no
 * odds-based refusal before the first egg that taught something - so that no
 * pot whose prior odds happen to cross 3/10 somewhere can refuse a new cook
 * either. Physical limits are the whole rule until then, exactly as before.
 *
 * Pure, like the rest of `src/core/`.
 */

import { Egg } from './geometry.js';
import { CookSetup } from './protocol.js';
import { donenessFromSlider, solveCookTime, Solution } from './solve.js';
import { DoseGrid } from './doseGrid.js';
import { decide, oddsInTenths } from './decide.js';
import { Outcome, WHITE_RISK, predictOutcome } from './outcome.js';
import { Calibration, calibrationDoneness, calibrationParams } from './record.js';
import {
  LIMITS, SLIDER_STEPS, START_TEMP_PRESETS_C, Verdict, anchorNear, snapDown, snapUp, verdictFor,
} from './policy.js';

/** The odds a level must reach to be offered: 3/10 (owner, 27 September). */
export const REACH_ODDS = 0.3;

/** Slider positions between profile points: 5, so a point every 0.05 of the
 *  track, 21 across the whole of it. */
export const PROFILE_STEP = 5;

/** One point of the profile: a slider level and the odds the app would show
 *  there. */
export interface LevelOdds {
  level: number;
  odds: number;
}

export interface OddsProfile {
  /** Sorted by level, from `physicalSoftest` to `physicalHardest`. Empty when
   *  the white never sets: there is no level to give odds on. */
  points: LevelOdds[];
  /** The best odds of any point: what the shading is relative to. */
  best: number;
  /** The physical edges, on the slider's grid. */
  physicalSoftest: number;
  physicalHardest: number;
  /** The softest and firmest levels with odds of at least REACH_ODDS, or null
   *  when the odds refuse nothing: before the first egg, or when no level
   *  reaches it. Both null or both set. */
  softest: number | null;
  hardest: number | null;
}

/** A slider position (an integer, 0 to SLIDER_STEPS) as a level. Positions are
 *  integers so both languages walk exactly the same levels. */
function levelOf(position: number): number {
  return position / SLIDER_STEPS;
}

function positionUp(level: number): number {
  return Math.round(snapUp(level) * SLIDER_STEPS);
}

function positionDown(level: number): number {
  return Math.round(snapDown(level) * SLIDER_STEPS);
}

/** The odds the app shows when the slider sits at `level` and the level is one
 *  the pan can deliver: the mean solve there, decided on `grid`. */
export function oddsAtLevel(
  c: Calibration, egg: Egg, setup: CookSetup, grid: DoseGrid, level: number,
): number {
  const sol = solveCookTime(egg, setup, calibrationParams(c), calibrationDoneness(c, level));
  const logTarget = Math.log10(donenessFromSlider(level).yolkDose_min);
  return decide(c, grid, sol, logTarget).odds;
}

/**
 * The odds at every level the pot can deliver, and the range they allow. See
 * the header for which levels, and why.
 *
 * `grid` is this pot's decision surface (`decisionGridRequest`), built for
 * the same calibration, egg and setup.
 */
export function oddsProfile(c: Calibration, egg: Egg, setup: CookSetup, grid: DoseGrid): OddsProfile {
  const edge = solveCookTime(egg, setup, calibrationParams(c), calibrationDoneness(c, 1.0));
  const lo = positionUp(edge.softestLevel);
  const hi = positionDown(edge.hardestLevel);
  if (!edge.whiteSets || hi < lo) {
    return {
      points: [], best: 0, physicalSoftest: levelOf(lo), physicalHardest: levelOf(hi),
      softest: null, hardest: null,
    };
  }

  const odds = new Map<number, number>();
  const at = (position: number): number => {
    const known = odds.get(position);
    if (known !== undefined) return known;
    const p = oddsAtLevel(c, egg, setup, grid, levelOf(position));
    odds.set(position, p);
    return p;
  };

  const positions: number[] = [lo];
  for (let k = (Math.floor(lo / PROFILE_STEP) + 1) * PROFILE_STEP; k < hi; k += PROFILE_STEP) {
    positions.push(k);
  }
  if (hi > lo) positions.push(hi);
  let best = 0;
  for (const k of positions) {
    const p = at(k);
    if (p > best) best = p;
  }

  let softest: number | null = null;
  let hardest: number | null = null;
  if (c.eggsLogged > 0 && best >= REACH_ODDS) {
    let first = 0;
    while (at(positions[first]) < REACH_ODDS) first += 1;
    let last = positions.length - 1;
    while (at(positions[last]) < REACH_ODDS) last -= 1;

    // The softest: the first position at or over the threshold, found by
    // bisection between the last point under it and the first point over.
    let s = positions[first];
    if (first > 0) {
      let under = positions[first - 1];
      while (s - under > 1) {
        const mid = Math.floor((under + s) / 2);
        if (at(mid) >= REACH_ODDS) s = mid;
        else under = mid;
      }
    }
    // The firmest, the same way from the other end.
    let h = positions[last];
    if (last < positions.length - 1) {
      let over = positions[last + 1];
      while (over - h > 1) {
        const mid = Math.floor((h + over) / 2);
        if (at(mid) >= REACH_ODDS) h = mid;
        else over = mid;
      }
    }
    softest = levelOf(s);
    hardest = levelOf(h);
  }

  const keys = Array.from(odds.keys()).sort((a, b) => a - b);
  const points: LevelOdds[] = keys.map((k) => ({ level: levelOf(k), odds: odds.get(k) as number }));
  for (const point of points) {
    if (point.odds > best) best = point.odds;
  }
  return {
    points: points, best: best, physicalSoftest: levelOf(lo), physicalHardest: levelOf(hi),
    softest: softest, hardest: hardest,
  };
}

/* ------------------------------------------------------------ the verdict */

/**
 * `verdictFor`, with the range the odds allow.
 *
 * A level the pan cannot deliver is refused for the physical reason, as it
 * always was, and that sentence stands - it says what to change - but the
 * slider goes to the nearer end of the range the odds allow, and the sentence
 * names that end. A level the pan can deliver but the odds do not allow is
 * refused as `unlikelySoft` or `unlikelyHard`. With no profile, or one that
 * refuses nothing, this is `verdictFor`.
 */
export function verdictWithOdds(sol: Solution, level: number, profile: OddsProfile | null): Verdict {
  const v = verdictFor(sol, level);
  if (profile === null || profile.softest === null || profile.hardest === null) return v;
  const softest = profile.softest;
  const hardest = profile.hardest;
  const wanted = v.wanted;

  if (v.kind === 'whiteNeverSets') return v;
  if (v.kind === 'tooSoftForWhite') {
    const to = Math.max(v.snapTo ?? level, softest);
    const limit = anchorNear(to);
    return { ...v, limit: limit, snapTo: to > level ? to : null, worthSaying: limit.key !== wanted.key };
  }
  if (v.kind === 'harderThanPanReaches') {
    const to = Math.min(v.snapTo ?? level, hardest);
    const limit = anchorNear(to);
    return { ...v, limit: limit, snapTo: to < level ? to : null, worthSaying: limit.key !== wanted.key };
  }
  if (level < softest) {
    const limit = anchorNear(softest);
    return {
      kind: 'unlikelySoft', wanted: wanted, limit: limit, snapTo: softest,
      worthSaying: limit.key !== wanted.key,
    };
  }
  if (level > hardest) {
    const limit = anchorNear(hardest);
    return {
      kind: 'unlikelyHard', wanted: wanted, limit: limit, snapTo: hardest,
      worthSaying: limit.key !== wanted.key,
    };
  }
  return v;
}

/* ------------------------------------------------------------ the shading */

/** How strongly the track is shaded at a level: its odds over the best
 *  level's, 0 to 1. Relative, so a fresh install at 2/10 everywhere still
 *  shows where this pan works best (owner, 27 September). */
export interface Shade {
  level: number;
  strength: number;
}

/** The shading's stops, one per profile point. Empty when there is nothing to
 *  shade: no points, or no odds anywhere worth a tenth. */
export function shadingOf(profile: OddsProfile): Shade[] {
  if (!(profile.best >= 0.05)) return [];
  return profile.points.map((p) => ({
    level: p.level,
    strength: Math.min(1, Math.max(0, p.odds / profile.best)),
  }));
}

/* ------------------------------------------------------------ the advice */

/** Below this many tenths, the chosen level's odds are low. */
export const ADVICE_BELOW_TENTHS = 5;
/** And this many tenths under the best level is a clear margin. */
export const ADVICE_MARGIN_TENTHS = 3;

/** Whether the odds at the chosen level are low enough to offer advice: under
 *  5/10, or 3/10 or more under the best level's. */
export function adviceWanted(oddsTenths: number, profile: OddsProfile | null): boolean {
  if (oddsTenths < ADVICE_BELOW_TENTHS) return true;
  if (profile === null) return false;
  return oddsInTenths(profile.best) - oddsTenths >= ADVICE_MARGIN_TENTHS;
}

/** How much a change must raise this level's odds to be worth saying: half a
 *  tenth, so it shows on screen and is not the arithmetic's last digits. */
export const ADVICE_GAIN = 0.05;

/** How far over the fridge preset an egg must start before "straight from the
 *  fridge" is advice rather than what the cook already does, C. */
const FRIDGE_MARGIN_C = 1;

/** What the setup alone does not say about the egg: whether its size is a
 *  class off the carton, and whether its start temperature is a preset's
 *  assumption rather than the fridge or a number the cook typed. */
export interface AdviceFacts {
  eggFromClass: boolean;
  startAssumed: boolean;
}

/** A change of protocol the model can price: the same pot with one thing
 *  changed. Its odds come from its own profile, built as the pot's own is. */
export interface PricedChange {
  key: string;
  setup: CookSetup;
}

/**
 * The changes the model can price, for this setup, in the order they are
 * shown: into ice water instead of resting on the counter, and with the heat
 * off, twice the water (up to the most the controls take). Each is kept only
 * where its profile says it raises the odds at the level on screen
 * (`protocolAdvice`).
 *
 * A cold tap is not here. On the model it does what ice does, to the tenth,
 * at every level and after any number of eggs (`npm run decide -- advice`):
 * advising ice over the tap would be advice that does not help.
 */
export function pricedChanges(setup: CookSetup): PricedChange[] {
  const out: PricedChange[] = [];
  if (setup.cooling === 'counter') out.push({ key: 'advice.ice', setup: { ...setup, cooling: 'ice' } });
  if (setup.afterBoil === 'off' && setup.waterLitres < LIMITS.waterLitres.hi) {
    out.push({
      key: 'advice.moreWater',
      setup: { ...setup, waterLitres: Math.min(LIMITS.waterLitres.hi, 2 * setup.waterLitres) },
    });
  }
  return out;
}

/**
 * The advice the model cannot price, because it is about the inputs it takes
 * as exact:
 *
 *  - `advice.fridge`  the egg is assumed to be at room temperature. A room is
 *    not 20 C: an egg at 17 C instead of 23 C needs 28 s longer at jammy,
 *    about the whole width of "just right". A fridge is 3-5 C, 7 s.
 *  - `advice.weigh`   the egg is a size class. A class spans eggs about 10 g
 *    apart, and 63 g against 73 g is 39-49 s at soft to fudgy.
 *
 * Both are true of every level, and the model shows neither in its odds: it
 * sees them only as a noisier cook, egg by egg.
 */
export function unpricedAdvice(setup: CookSetup, facts: AdviceFacts): string[] {
  const keys: string[] = [];
  if (facts.startAssumed && setup.eggStart_C > START_TEMP_PRESETS_C.fridge + FRIDGE_MARGIN_C) {
    keys.push('advice.fridge');
  }
  if (facts.eggFromClass) keys.push('advice.weigh');
  return keys;
}

/** A profile's odds at a level, interpolated between its points; 0 outside
 *  them, where that pot cannot deliver the level at all. */
export function oddsNear(profile: OddsProfile, level: number): number {
  const pts = profile.points;
  if (pts.length === 0 || level < pts[0].level || level > pts[pts.length - 1].level) return 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (level <= b.level) {
      const span = b.level - a.level;
      return span > 0 ? a.odds + (b.odds - a.odds) * ((level - a.level) / span) : b.odds;
    }
  }
  return pts[0].odds;
}

/**
 * What to say under low odds, as catalogue keys in the order shown: the
 * unpriced advice, then each priced change whose profile raises the odds at
 * `level` by ADVICE_GAIN or more over `odds`, the odds on screen. A priced
 * change whose profile is not in yet is left out, and comes when it lands.
 */
export function protocolAdvice(
  setup: CookSetup, facts: AdviceFacts, level: number, odds: number,
  priced: { key: string; profile: OddsProfile }[],
): string[] {
  const keys = unpricedAdvice(setup, facts);
  for (const change of priced) {
    if (oddsNear(change.profile, level) - odds >= ADVICE_GAIN) keys.push(change.key);
  }
  return keys;
}

/* ------------------------------------------------------------ playing safe */

/**
 * PLAYING SAFE (INFERENCE.md section 8, "Playing safe"). The outcome's range
 * says where the yolk will probably land, and the direction which way a miss
 * leans, but neither says what to do about it. A cook who would rather not
 * risk a soft yolk wants the level to ask for so that the egg is at least as
 * firm as the one they pictured nearly every time; and the mirror of that.
 *
 * For the cook's level T, on this pot:
 *
 *  - `firmerLevel` is the softest level L >= T the slider offers at which, at
 *    L's decided time, the 10% point of the delivered doneness (`levelLow`)
 *    is at least T: nine eggs in ten at least as firm as T.
 *  - `softerLevel` is the firmest level L <= T the slider offers whose 90%
 *    point (`levelHigh`) is at most T - nine in ten at most as firm as T -
 *    AND whose P(runny white) at L's decided time is under WHITE_RISK
 *    (outcome.ts), the web's line for the white.
 *
 * THE WHITE. Softer is a shorter time, so a softer level can trade a yolk a
 * little too firm for a runny white, which the decision weighs three times a
 * yolk miss: that is never playing safe. On a fresh install at jammy the yolk
 * alone pointed to 0.13, where P(runny) is 0.34 and the white's line shows;
 * the white clears one in five only from 0.24, and 0.24's 90% point is past
 * jammy, so there is no softer level. Firmer is a longer time, so a firmer
 * level never raises the white's risk, and needs no such test. P(runny)
 * falls as the level rises, the mirror of the range, so the firmest level
 * that passes the yolk's test is the only one the white's test need read: if
 * the white is a risk there, it is a risk at every softer level too. It
 * costs nothing - that level has been read already.
 *
 * Each is null when T itself already does it - no move is needed - or when
 * no level the slider offers does (for `softerLevel`, both tests). "Offers" is the slider's own rule: the
 * physical limits, narrowed by the odds' reach once it applies
 * (`oddsProfile`'s `softest`/`hardest`), so a suggestion is never a level the
 * slider would refuse. The level is on the slider's scale without the taste
 * offset (outcome.ts), so a cook whose taste is firmer than the slider's may
 * find T already firm enough.
 *
 * THE SEARCH. Each level L is read exactly as the app reads it when the
 * slider sits there: the mean solve at L, the decision on the pot's surface,
 * and the outcome at the decided time (`outcomeAtLevel`) - the profile's
 * machinery, with the outcome read where the profile reads the odds. The
 * levels are the slider's 0.01 grid, walked as integer positions so both
 * languages walk the same ones, and searched by bisection: that needs
 * `levelLow` (and `levelHigh`) to rise with L. They do, because the decided
 * time rises with the level and the delivered dose with the time - except at
 * the counter's softest offered level, where the white binds the choice and
 * the next level up is delivered a hair softer: 0.001-0.004 of the slider,
 * one step, in 3 of 28 pots and posteriors (`npm run decide -- safer`, which
 * reads every offered level). Where that happens the bisection still returns
 * a level that passes next to one that fails - a safe level, at worst a step
 * firmer than the softest safe one. Against a full scan it agreed at every
 * level tried; test/safer.test.ts holds it to one.
 *
 * WHAT IT COSTS. A reading is a solve (about 20 ms in node), a decision (18
 * ms once the time is chosen) and an outcome (2 ms). Two readings per side
 * settle whether a move is needed and possible, and a bisection over the
 * rest of the range takes about log2 of it: up to about 16 in all, and
 * 0.1-0.9 s in node, a median of half a second, across seven pots and four
 * posteriors (`npm run decide -- safer`). That is a profile's cost again, so
 * it is never on the drag: the web computes it in the worker once the
 * slider has settled, and keeps the answer per pot, posterior and level.
 */

export interface SaferLevels {
  /** The softest level at least as firm as T that gives an egg at least as
   *  firm as T nine times in ten, or null: see above. */
  firmerLevel: number | null;
  /** The firmest level at most as firm as T that gives an egg at most as firm
   *  as T nine times in ten, with a white that is not a risk (P(runny) under
   *  WHITE_RISK), or null. */
  softerLevel: number | null;
}

/** The outcome the app shows when the slider sits at `level`, a level the pan
 *  can deliver: the mean solve there, decided on `grid`, and read at the
 *  decided time. */
export function outcomeAtLevel(
  c: Calibration, egg: Egg, setup: CookSetup, grid: DoseGrid, level: number,
): Outcome {
  const sol = solveCookTime(egg, setup, calibrationParams(c), calibrationDoneness(c, level));
  const logTarget = Math.log10(donenessFromSlider(level).yolkDose_min);
  const d = decide(c, grid, sol, logTarget);
  return predictOutcome(c.posterior, grid, d.cookTime_s, logTarget);
}

/** The levels the slider offers on this pot, as positions on its grid: the
 *  odds' range where it applies, the physical one where it does not. Null
 *  when it offers none. */
export function offeredPositions(profile: OddsProfile): { lo: number; hi: number } | null {
  if (profile.points.length === 0) return null;
  const lo = Math.round((profile.softest ?? profile.physicalSoftest) * SLIDER_STEPS);
  const hi = Math.round((profile.hardest ?? profile.physicalHardest) * SLIDER_STEPS);
  return hi >= lo ? { lo: lo, hi: hi } : null;
}

/**
 * The play-safe levels for the cook's level `level` on this pot. `grid` is the
 * pot's decision surface and `profile` its odds profile, both for the same
 * calibration, egg and setup.
 */
export function saferLevels(
  c: Calibration, egg: Egg, setup: CookSetup, grid: DoseGrid, profile: OddsProfile, level: number,
): SaferLevels {
  const range = offeredPositions(profile);
  if (range === null) return { firmerLevel: null, softerLevel: null };
  const seen = new Map<number, Outcome>();
  const at = (position: number): Outcome => {
    const known = seen.get(position);
    if (known !== undefined) return known;
    const o = outcomeAtLevel(c, egg, setup, grid, levelOf(position));
    seen.set(position, o);
    return o;
  };
  // The cook's own position, when the level is on the grid; a level off it
  // (no slider gives one) is never "no move needed".
  const own = Math.round(level * SLIDER_STEPS);
  const onGrid = Math.abs(own - level * SLIDER_STEPS) < 1e-6;

  // Firmer: the softest position in [from, hi] whose 10% point reaches the
  // level, by bisection between one that does not and one that does.
  let firmerLevel: number | null = null;
  const from = Math.max(positionUp(level), range.lo);
  const firm = (position: number): boolean => at(position).levelLow >= level;
  if (from <= range.hi) {
    if (firm(from)) {
      if (!(onGrid && from === own)) firmerLevel = levelOf(from);
    } else if (firm(range.hi)) {
      let under = from;
      let over = range.hi;
      while (over - under > 1) {
        const mid = Math.floor((under + over) / 2);
        if (firm(mid)) over = mid;
        else under = mid;
      }
      firmerLevel = levelOf(over);
    }
  }

  // Softer: the firmest position in [lo, to] whose 90% point stays at or
  // under the level, the same way from the other side - and then only if its
  // white is not a risk. P(runny) falls as the level rises, so where the
  // white is a risk at that position it is at every softer one: none passes.
  let softer: number | null = null;
  const to = Math.min(positionDown(level), range.hi);
  const soft = (position: number): boolean => at(position).levelHigh <= level;
  if (to >= range.lo) {
    if (soft(to)) {
      if (!(onGrid && to === own)) softer = to;
    } else if (soft(range.lo)) {
      let under = range.lo;
      let over = to;
      while (over - under > 1) {
        const mid = Math.floor((under + over) / 2);
        if (soft(mid)) under = mid;
        else over = mid;
      }
      softer = under;
    }
  }
  const softerLevel = softer !== null && at(softer).pWhiteRunny < WHITE_RISK ? levelOf(softer) : null;
  return { firmerLevel: firmerLevel, softerLevel: softerLevel };
}
