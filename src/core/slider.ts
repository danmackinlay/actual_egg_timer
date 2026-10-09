/**
 * The doneness slider: its grid, the labelled position nearest a level,
 * which words can still be chosen, the yolk temperature a level asks for,
 * and the verdict on a level the pan cannot deliver - which refusal applies
 * and where the slider must move to. Which words a screen says about it is
 * `wording.ts`.
 *
 * Pure, like the rest of `src/core/`: no storage, no DOM, no clock.
 */

import { DonenessAnchor, DONENESS_ANCHORS, Solution } from './solve.js';
import { LIMITS, clamp } from './inputs.js';

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

/** Whether the word of the anchor at `index` names any position the slider
 *  can rest on between `softest` and `hardest`: the positions from
 *  `snapUp(softest)` to `snapDown(hardest)`, each read as `anchorNear` reads
 *  it. A word is struck through on the track only when it names none of
 *  them. Not `anchor.level < softest`: after a runny white the softest
 *  level is a little above 0, still Runny, and Runny can still be chosen. */
export function anchorReachable(index: number, softest: number, hardest: number): boolean {
  const key = DONENESS_ANCHORS[index].key;
  const lo = Math.round(snapUp(softest) * SLIDER_STEPS);
  const hi = Math.round(snapDown(hardest) * SLIDER_STEPS);
  for (let p = lo; p <= hi; p++) {
    if (anchorNear(p / SLIDER_STEPS).key === key) return true;
  }
  return false;
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
 *
 * A level the pan can deliver is never refused, however low its odds: those
 * are warned of instead (`lowOddsAt`, reach.ts; DECISIONS.md 83).
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
