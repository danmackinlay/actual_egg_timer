/**
 * The odds at every level the slider offers, and what follows from them:
 * which levels the app warns of, how the track is shaded, and when the app
 * says how to make an egg more reliable. Since the `certainty` draft
 * (DECISIONS.md 93 and 97) the warning and the shading read how sure the
 * app is in words (certainty.ts) at each level's time, and since its
 * follow-up (8 October 2026) the advice does too: the odds of "just right"
 * are left to the time chosen.
 *
 * THE PROFILE. `decide` computes the odds of the time: that is one level. The profile is the
 * same number for every level the pot can deliver, computed exactly as the app
 * computes it when the slider sits there: the mean solve at that level
 * (`solveCookTime`, with the white's target where the eggs have put it), then
 * the decision on this pot's decision surface (`decide`), held by the
 * envelope below, and its odds. So a profile point and the decision at that
 * level can never disagree - they are one computation.
 *
 * Which levels. The two physical edges on the slider's grid (the softest the
 * white allows, rounded up; the firmest the pan reaches, rounded down), every
 * PROFILE_STEP positions between them, and - once an egg has taught something
 * and some level is not a wild guess - a bisection on the slider's own grid
 * (1/SLIDER_STEPS) at each end of the range that is not, so the level where
 * the warning starts is one whose certainty was computed, not interpolated.
 * Between points the track's shading is interpolated linearly; the step is
 * under a degree of peak yolk.
 *
 * Each point also reads the five yolk words' spread at its time
 * (`yolkWordProbabilities`, one pass over the particles) against the word
 * asked there (`askedWord`): the chance of that word, which shades the
 * track, and `certaintyAt`'s class, which dots it. The word asked is a step
 * function of the level, so both jump where the slider's word changes; the
 * shading is interpolated across the jump like any other change.
 *
 * What it costs. One point is a mean solve (tens of milliseconds, several
 * times that with the heat off) and a decision (a few ms before the first egg,
 * about 18 ms after it, when the time is chosen). A profile is 21-30 points.
 * `npm run decide -- reach` measures it; the apps build it off the main
 * thread, after the pot's decision surface, and keep one per pot and
 * posterior, like the surface.
 *
 * THE ENVELOPE. Each level's time is chosen against that level's own
 * target, so the choices need not keep their order: after a runny white the
 * white's weight pushes the time chosen at soft past the one chosen at jammy
 * (500 s against 428 s, test/reach.test.ts 11), and asking for a softer egg
 * would give a firmer one. The owner wants the time monotone in the level
 * (DECISIONS.md 84). So the time a level is given is the smallest of its own
 * choice and every firmer level's: a running minimum from the hard end. That
 * is the projection of the per-level choices onto the time schedules that
 * never fall as the level rises - each level is capped at the next firmer
 * level's time, and nothing else moves. Where the cap binds, the level takes
 * the firmer level's time, and its odds, the bracket and the sentence are
 * read at that time.
 *
 * The profile is where the choices at other levels are already made, so the
 * envelope is built there and nowhere else: the points are decided from the
 * hard end to the soft, each held under the time of the point above it, and
 * each point keeps the time it was given (`cookTime_s`). A level between two
 * points, as the slider is on a drag, is held between those two points'
 * times (`envelopeBounds`). So the time is monotone at the points, and
 * within about a second of it between them: the choice can dip inside the
 * bounds, as 0.61's 716.1 s against 0.62's 715.2 s does
 * (archive/REVIEW-0.4.x.md, and DECISIONS.md 84, which accepts it). A drag
 * costs what it did: its own decision, and a look-up. What
 * the sampling misses is a dip in the choices narrower than the step between
 * points; the time it gives there is within one step's change of the
 * choice, a few seconds. A bisection point is held between its neighbours,
 * so it changes no time the profile already gave.
 *
 * Until the profile is built - the first moments with a new pot - a level
 * has its own choice, as it had before 5 October 2026, and the time can move
 * once when the profile lands. Before the first egg nothing is held: the time
 * is the literature's, which rises with the level already.
 *
 * The deeper fix is a loss that knows the levels are ordered - a miss by one
 * band cheaper than a miss by two - so that the choices come out monotone by
 * themselves. It is left for later (INFERENCE.md section 8).
 *
 * THE DECIDED ANSWER. What the screen shows for the slider's level, once
 * the pot's decision surface is built, is one function, `decideAnswer`, which
 * both apps call: the time decided at the level answered (`answerAt`), held
 * by the envelope where the profile is in, moved by the nudge where a time is
 * chosen, the solve re-read there, the outcome and the certainty there, and
 * whether the word asked is a wild guess there, so advice is looked for. Until 6 October 2026 each
 * app wrote it out for itself, and DECISIONS.md 84 had to land twice
 * (archive/REVIEW-0.4.x.md, "Bloat and factoring" 1).
 *
 * THE WARNING. A level that is a wild guess at its time (`certaintyAt`'s
 * class: the word asked and its neighbours together under 9 times in 10) is
 * not refused: the slider rests there, and the app says it is a wild guess
 * so far (`lowOddsAt`, whose name is older than the rule). The levels it
 * warns of are those softer than the softest level that is not a wild guess,
 * and firmer than the firmest - the dots on the track. Only what the pan
 * cannot deliver at all is refused (`verdictFor`, the stripes), and the
 * slider moves out of it. A wild guess inside the range is not warned of;
 * only the ends are, as only the ends are dotted. Until 5 October 2026 the
 * ends were a wall the slider snapped back to (DECISIONS.md 20, amended by
 * 83); until the `certainty` draft they were where the odds of "just right"
 * fell under 3/10 (DECISIONS.md 97, design/one-screen.md section 7, 16).
 *
 * WHEN EVERY LEVEL IS A WILD GUESS there is no warning at all, and no dots:
 * there is no surer level to point to. And there is none before the first
 * egg that taught something, whatever the classes say: a fresh install is a
 * ballpark at fudgy and hard and a wild guess softer (INFERENCE.md section 8),
 * and dotting the soft half would warn a cook for being new.
 *
 * Pure, like the rest of `src/core/`.
 */

import { Egg } from './geometry.js';
import { CookSetup } from './protocol.js';
import { Solution, logYolkTarget, solveCookTime } from './solve.js';
import { DoseGrid } from './doseGrid.js';
import {
  Decision, TimeBounds, appliedNudge, decide, decidedSolution,
} from './decide.js';
import { yolkWordProbabilities } from './infer.js';
import { Outcome, predictOutcome } from './outcome.js';
import { Certainty, CertaintyReading, askedWord, certaintyAt, wordCertainty } from './certainty.js';
import { Calibration, calibrationDoneness, calibrationParams } from './record.js';
import { LIMITS, START_TEMP_PRESETS_C } from './inputs.js';
import { SLIDER_STEPS, Verdict, snapDown, snapUp, verdictFor } from './slider.js';


/** Slider positions between profile points: 5, so a point every 0.05 of the
 *  track, 21 across the whole of it. */
export const PROFILE_STEP = 5;

/** One point of the profile: a slider level, the time the app gives there
 *  (after the envelope), the odds of that time, and how sure the app is
 *  there in words. */
export interface LevelOdds {
  level: number;
  cookTime_s: number;
  odds: number;
  /** P(the word asked at this level) at its time: what the shading reads. */
  pAsked: number;
  /** `certaintyAt`'s class at this level's time: a wild guess is dotted at
   *  the ends. */
  certainty: Certainty;
}

export interface OddsProfile {
  /** Sorted by level, from `physicalSoftest` to `physicalHardest`. Empty when
   *  the white never sets: there is no level to give odds on. */
  points: LevelOdds[];
  /** The best odds of any point. The advice was measured against it until
   *  8 October 2026; `npm run decide -- reach` still reports it. */
  best: number;
  /** The best `pAsked` of any point: what the shading is relative to. */
  bestAsked: number;
  /** The physical edges, on the slider's grid. */
  physicalSoftest: number;
  physicalHardest: number;
  /** The softest and firmest levels that are not a wild guess, or null when
   *  nothing is warned of: before the first egg, or when every level is a
   *  wild guess. Both null or both set. Outside them, and inside the physical
   *  edges, is what the track dots and the app warns of. */
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

/** How close a level must be to a point to be that point: the slider's
 *  levels are hundredths, which neither language holds exactly. */
const SAME_LEVEL = 1e-9;

/**
 * Where the envelope holds the time at `level`: no sooner than the time of
 * the nearest point at or below it, no later than the time of the nearest
 * point at or above it (the header, "the envelope"). At a point, both are
 * that point's time. Null with no profile, or one with no points: the level
 * keeps its own choice.
 */
export function envelopeBounds(profile: OddsProfile | null, level: number): TimeBounds | null {
  if (profile === null || profile.points.length === 0) return null;
  let lo = 0.0;
  let hi = Number.POSITIVE_INFINITY;
  for (const p of profile.points) {
    if (p.level <= level + SAME_LEVEL) lo = p.cookTime_s;
    if (p.level >= level - SAME_LEVEL && hi === Number.POSITIVE_INFINITY) hi = p.cookTime_s;
  }
  return { lo_s: lo, hi_s: hi };
}

/** The decision the app makes when the slider sits at `level` and the level is
 *  one the pan can deliver: the mean solve there, decided on `grid`, held
 *  within `bounds`. */
function decisionAtLevel(
  c: Calibration, egg: Egg, setup: CookSetup, grid: DoseGrid, level: number, bounds: TimeBounds | null,
): Decision {
  const sol = solveCookTime(egg, setup, calibrationParams(c), calibrationDoneness(c, level));
  return decide(c, grid, sol, logYolkTarget(level), bounds);
}

/** The odds the app shows when the slider sits at `level`, with `profile` - the
 *  pot's, or null before it is built - holding its time. */
export function oddsAtLevel(
  c: Calibration, egg: Egg, setup: CookSetup, grid: DoseGrid, level: number, profile: OddsProfile | null,
): number {
  return decisionAtLevel(c, egg, setup, grid, level, envelopeBounds(profile, level)).odds;
}

/**
 * A profile being built: the pot it is for, and the points decided on it so
 * far, as arrays kept in order of slider position. Plain data, handed to the
 * functions below rather than closed over, so that both languages build it
 * the same way (core invariant 2).
 */
interface ProfileWork {
  c: Calibration;
  egg: Egg;
  setup: CookSetup;
  grid: DoseGrid;
  positions: number[];
  times: number[];
  odds: number[];
  pAsked: number[];
  certainty: Certainty[];
}

/** Whether a class is surer than a wild guess: a level the track does not
 *  dot. */
function surerThanGuess(c: Certainty): boolean {
  return c !== 'wildGuess';
}

/** Decide the point at `position`, held within `bounds`; read how sure the
 *  app is at the time decided; keep both in `w`, in order; and return
 *  whether it is surer than a wild guess. */
function decidePoint(w: ProfileWork, position: number, bounds: TimeBounds): boolean {
  const level = levelOf(position);
  const d = decisionAtLevel(w.c, w.egg, w.setup, w.grid, level, bounds);
  const sure = wordCertainty(yolkWordProbabilities(w.c.posterior, w.grid, d.cookTime_s), askedWord(level));
  let i = w.positions.length;
  while (i > 0 && w.positions[i - 1] > position) i -= 1;
  w.positions.splice(i, 0, position);
  w.times.splice(i, 0, d.cookTime_s);
  w.odds.splice(i, 0, d.odds);
  w.pAsked.splice(i, 0, sure.pAsked);
  w.certainty.splice(i, 0, sure.certainty);
  return surerThanGuess(sure.certainty);
}

/** Whether `position` is surer than a wild guess: a point already decided,
 *  or one decided now, held between the nearest points known on either side,
 *  so that it moves no time the profile already gave. */
function surerAtPosition(w: ProfileWork, position: number): boolean {
  let i = 0;
  while (i < w.positions.length && w.positions[i] < position) i += 1;
  if (i < w.positions.length && w.positions[i] === position) return surerThanGuess(w.certainty[i]);
  const below = i > 0 ? w.times[i - 1] : 0.0;
  const over = i < w.positions.length ? w.times[i] : Number.POSITIVE_INFINITY;
  return decidePoint(w, position, { lo_s: below, hi_s: over });
}

/** One end of the range that is not a wild guess, by bisection on the
 *  slider's grid between `reaches`, a position surer than a wild guess, and
 *  `short`, a wild guess on either side: the surer position next to one
 *  that is not. */
function reachEnd(w: ProfileWork, reaches: number, short: number): number {
  let r = reaches;
  let s = short;
  while (Math.abs(s - r) > 1) {
    const mid = Math.floor((r + s) / 2);
    if (surerAtPosition(w, mid)) r = mid;
    else s = mid;
  }
  return r;
}

/**
 * The odds and the certainty at every level the pot can deliver, and the
 * range that is not a wild guess. See the header for which levels, and why.
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
      points: [], best: 0, bestAsked: 0, physicalSoftest: levelOf(lo), physicalHardest: levelOf(hi),
      softest: null, hardest: null,
    };
  }

  const positions: number[] = [lo];
  for (let k = (Math.floor(lo / PROFILE_STEP) + 1) * PROFILE_STEP; k < hi; k += PROFILE_STEP) {
    positions.push(k);
  }
  if (hi > lo) positions.push(hi);
  // The envelope: from the hard end, each point held under the one above it.
  const w: ProfileWork = {
    c: c, egg: egg, setup: setup, grid: grid, positions: [], times: [], odds: [], pAsked: [], certainty: [],
  };
  let above = Number.POSITIVE_INFINITY;
  for (let i = positions.length - 1; i >= 0; i--) {
    decidePoint(w, positions[i], { lo_s: 0.0, hi_s: above });
    above = w.times[0];
  }
  // Before any bisection, w holds exactly these positions, in this order.
  const gridSure: boolean[] = [];
  let anySure = false;
  for (let i = 0; i < w.certainty.length; i++) {
    gridSure.push(surerThanGuess(w.certainty[i]));
    if (gridSure[i]) anySure = true;
  }

  let softest: number | null = null;
  let hardest: number | null = null;
  if (c.eggsLogged > 0 && anySure) {
    let first = 0;
    while (!gridSure[first]) first += 1;
    let last = positions.length - 1;
    while (!gridSure[last]) last -= 1;
    // The softest first, then the firmest: a point the first bisection adds
    // holds the second's.
    const s = first > 0 ? reachEnd(w, positions[first], positions[first - 1]) : positions[first];
    const h = last < positions.length - 1 ? reachEnd(w, positions[last], positions[last + 1]) : positions[last];
    softest = levelOf(s);
    hardest = levelOf(h);
  }

  const points: LevelOdds[] = [];
  let best = 0;
  let bestAsked = 0;
  for (let i = 0; i < w.positions.length; i++) {
    points.push({
      level: levelOf(w.positions[i]), cookTime_s: w.times[i], odds: w.odds[i],
      pAsked: w.pAsked[i], certainty: w.certainty[i],
    });
    if (w.odds[i] > best) best = w.odds[i];
    if (w.pAsked[i] > bestAsked) bestAsked = w.pAsked[i];
  }
  return {
    points: points, best: best, bestAsked: bestAsked,
    physicalSoftest: levelOf(lo), physicalHardest: levelOf(hi),
    softest: softest, hardest: hardest,
  };
}

/* ------------------------------------------------------------ the warning */

/**
 * Whether the app warns that `level` is a wild guess so far - a dotted level:
 * true when the profile has a range that is not a wild guess and the level is
 * softer than its softest or firmer than its firmest. False with no profile,
 * or one that warns of nothing (the header, "when every level is a wild
 * guess"). It moves nothing: what the pan cannot deliver is `verdictFor`'s.
 * The name is older than the rule: until the `certainty` draft the dots were
 * the levels under 3/10.
 */
export function lowOddsAt(profile: OddsProfile | null, level: number): boolean {
  if (profile === null || profile.softest === null || profile.hardest === null) return false;
  // A level a hair off its end - 35 * 0.01 is not 35 / 100 - is that end.
  return level < profile.softest - SAME_LEVEL || level > profile.hardest + SAME_LEVEL;
}

/* ------------------------------------------------------------- the answer */

/** A solve, the verdict on it, the level it is for, and whether the odds
 *  there are warned of. */
export interface LevelAnswer {
  solution: Solution;
  verdict: Verdict;
  /** The level the solution is for: the one asked, or the one it snapped to. */
  level: number;
  /** `lowOddsAt` that level. */
  lowOdds: boolean;
}

/**
 * Solve for a level, judge it (`verdictFor`: only what the pan cannot deliver
 * moves the slider), and, when the verdict moves the slider, solve again at
 * the level it moves to - so the numbers on screen are for the egg on offer
 * rather than for one that was refused. The retry is kept only if it
 * reaches. Then whether the odds at the level answered are warned of.
 */
export function answerAt(
  c: Calibration, egg: Egg, setup: CookSetup, level: number, profile: OddsProfile | null,
): LevelAnswer {
  const params = calibrationParams(c);
  const solution = solveCookTime(egg, setup, params, calibrationDoneness(c, level));
  const verdict = verdictFor(solution, level);
  if (verdict.snapTo !== null) {
    const retry = solveCookTime(egg, setup, params, calibrationDoneness(c, verdict.snapTo));
    if (retry.reachable) {
      return { solution: retry, verdict: verdict, level: verdict.snapTo, lowOdds: lowOddsAt(profile, verdict.snapTo) };
    }
  }
  return { solution: solution, verdict: verdict, level: level, lowOdds: lowOddsAt(profile, level) };
}

/* ------------------------------------------------------------ the shading */

/** How strongly the track is shaded at a level: the chance of the word asked
 *  there, over the best level's (DECISIONS.md 97; design/one-screen.md
 *  section 7, 17), 0 to 1. Relative, so a fresh install, never very certain
 *  anywhere, still shows where this pan works best. Until the `certainty`
 *  draft it was the odds of "just right". */
export interface Shade {
  level: number;
  strength: number;
}

/** The best chance below which the track is not shaded at all: a chance
 *  nowhere worth a twentieth, so there is no "where it works best" to show.
 *  Five words share every egg, so on a real pot the best is never under a
 *  fifth; this is for a profile with nothing in it. */
export const SHADE_BEST_MIN = 0.05;

/** The shading's stops, one per profile point. Empty when there is nothing to
 *  shade: no points, or a best chance under SHADE_BEST_MIN. */
export function shadingOf(profile: OddsProfile): Shade[] {
  if (!(profile.bestAsked >= SHADE_BEST_MIN)) return [];
  return profile.points.map((p) => ({
    level: p.level,
    strength: Math.min(1, Math.max(0, p.pAsked / profile.bestAsked)),
  }));
}

/* ------------------------------------------------------------ the advice */

/**
 * WHEN TO ADVISE (DECISIONS.md 97; the `certainty` draft's follow-up, 8
 * October 2026). The way to Help's advice shows when the word asked is a
 * wild guess at the time on screen (`certaintyAt`'s class, `adviceWanted`)
 * and a change of setup the model can price makes it surer: its profile,
 * at the level on screen, gives the word asked a chance higher than the
 * one on screen by ADVICE_GAIN or more (`protocolAdvice`'s `surer`). The
 * chance, not the class: a profile's points carry both, but a class can
 * only be read at a point, while the chance can be read between two points
 * that ask the same word (`askedNear`), as the shading is. A change that
 * lifts the chance by a twentieth at a wild guess is one the cook can feel.
 *
 * Until then the link showed when the odds of "just right" at the level
 * were under 5/10 or 3/10 short of the best level's, and a change was
 * offered when it raised those odds: nothing on screen shows them any more.
 * The advice the model cannot price (the fridge, the scale) is listed with
 * the changes that help, but does not bring the link on its own: the model
 * cannot say it makes the egg surer.
 */

/** Whether the word asked is unsure enough to look for advice: a wild
 *  guess. The answer adds that the white sets (`DecidedAnswer`). */
export function adviceWanted(c: Certainty): boolean {
  return c === 'wildGuess';
}

/** How much a change must raise the chance of the word asked at this level
 *  to be worth saying: a twentieth, so it is a change a cook would notice
 *  and not the arithmetic's last digits. */
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
 * where its profile raises the chance of the word asked at the level on
 * screen by ADVICE_GAIN or more (`protocolAdvice`).
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

/** A profile's chance of the word asked at a level (`LevelOdds.pAsked`),
 *  interpolated between its nearest points either side that ask the same
 *  word, or the nearest such point where only one side has one; 0 outside
 *  the profile, where that pot cannot deliver the level at all. Every word's
 *  band between the profile's ends holds a point, so the chance is never
 *  read off another word's. */
export function askedNear(profile: OddsProfile, level: number): number {
  const pts = profile.points;
  if (pts.length === 0 || level < pts[0].level - SAME_LEVEL || level > pts[pts.length - 1].level + SAME_LEVEL) {
    return 0;
  }
  const word = askedWord(level);
  let below = -1;
  let above = -1;
  for (let i = 0; i < pts.length; i++) {
    if (askedWord(pts[i].level) !== word) continue;
    if (pts[i].level <= level + SAME_LEVEL) below = i;
    if (pts[i].level >= level - SAME_LEVEL && above < 0) above = i;
  }
  if (below < 0 && above < 0) return 0;
  if (below < 0) return pts[above].pAsked;
  if (above < 0) return pts[below].pAsked;
  const a = pts[below];
  const b = pts[above];
  const span = b.level - a.level;
  return span > 0 ? a.pAsked + (b.pAsked - a.pAsked) * ((level - a.level) / span) : a.pAsked;
}

/** What to say, and whether to show the way to it. */
export interface ProtocolAdvice {
  /** Catalogue keys in the order shown: the unpriced advice, then each
   *  priced change that makes the word asked surer. */
  keys: string[];
  /** Whether a priced change makes it surer: the link shows (with
   *  `adviceWanted`). */
  surer: boolean;
}

/**
 * What to say under a wild guess: the unpriced advice, then each priced
 * change whose profile raises the chance of the word asked at `level` by
 * ADVICE_GAIN or more over `pAsked`, the chance at the time on screen
 * (`certaintyAt`'s). A priced change whose profile is not in yet is left
 * out, and comes when it lands.
 */
export function protocolAdvice(
  setup: CookSetup, facts: AdviceFacts, level: number, pAsked: number,
  priced: { key: string; profile: OddsProfile }[],
): ProtocolAdvice {
  const keys = unpricedAdvice(setup, facts);
  let surer = false;
  for (const change of priced) {
    if (askedNear(change.profile, level) - pAsked >= ADVICE_GAIN) {
      keys.push(change.key);
      surer = true;
    }
  }
  return { keys: keys, surer: surer };
}

/* ------------------------------------------------------ the decided answer */

/** The answer at a level, with its time decided on the pot's surface: what
 *  the screen shows, and what a cook started now carries. */
export interface DecidedAnswer {
  /** The level decided for: the answer's (`LevelAnswer.level`), after any
   *  snap. The advice is priced here, against the chance of the word asked
   *  in `certainty`. */
  level: number;
  /** The mean solve, re-read at the decided time with the nudge in it
   *  (`decidedSolution`): its verdict and limits are the mean solve's. */
  solution: Solution;
  /** The time decided, before the nudge, and its odds. */
  decision: Decision;
  /** What the egg at the nudged time will be like, on the same surface. */
  outcome: Outcome;
  /** How sure the app is of the egg at the nudged time, in words, and the
   *  likely time range (`certaintyAt`): the line under the time. */
  certainty: CertaintyReading;
  /** The nudge the time took (`appliedNudge`): all of it where a time is
   *  chosen for, none where the solver's own answer stands. */
  nudge_s: number;
  /** Whether the word asked is a wild guess (`adviceWanted`) and the white
   *  sets, so there is a cook to advise on: the advice is looked for. The
   *  link shows when `protocolAdvice` also finds a change that helps. */
  adviceWanted: boolean;
}

/**
 * Decide an answer: the time for `sol`, the mean solve at `level` (an
 * `answerAt`'s solution and level), on `grid`, this pot's decision surface;
 * held within the envelope of `profile`, the pot's odds profile, or by
 * nothing while it is null (DECISIONS.md 84); then moved by `nudge_s`, the
 * nudge the app drew, where a time is chosen for (E8). The solve is re-read
 * at the time given and the outcome and the certainty read there, so the
 * time shown, the time started, the words under it and the bracket agree.
 *
 * A level the odds warn of is decided at that level like any other
 * (DECISIONS.md 83): the warning is `answerAt`'s, and moves nothing here.
 */
export function decideAnswer(
  c: Calibration, egg: Egg, setup: CookSetup, grid: DoseGrid, sol: Solution, level: number,
  profile: OddsProfile | null, nudge_s: number,
): DecidedAnswer {
  const target = logYolkTarget(level);
  const d = decide(c, grid, sol, target, envelopeBounds(profile, level));
  const nudge = appliedNudge(sol, nudge_s);
  const certainty = certaintyAt(c.posterior, grid, d.cookTime_s + nudge, level);
  return {
    level: level,
    solution: decidedSolution(egg, setup, calibrationParams(c), sol, d, nudge),
    decision: d,
    outcome: predictOutcome(c.posterior, grid, d.cookTime_s + nudge, target),
    certainty: certainty,
    nudge_s: nudge,
    adviceWanted: sol.whiteSets && adviceWanted(certainty.words.certainty),
  };
}
