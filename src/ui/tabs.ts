/**
 * Two copies of one cook, as two tabs on the site hold it: what one copy
 * takes up of what the other saw in the pan (`takeUpEvents`), which copy a
 * reload restores (`correctedLater`), and whether the cook on a screen is
 * still the egg open to correction (`cookStillOpen`). Only the web runs one
 * cook in more than one place at once; iOS has one screen.
 */

import {
  CookAsRan, CookEvents, CookPlan, Pulled, RunningCook, cookTooOld, sameAsRan, sameChoices, sameEvents, samePulled,
  withAsRan, writeEvents,
} from '../core/running.js';

/** The earlier of two times, either of which may be missing. */
function earlier(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

/** The pull to keep of two: the cook's tap over the clock's assumption, and
 *  of two alike the earlier out, then the earlier due. */
function betterPull(a: Pulled | null, b: Pulled | null): Pulled | null {
  if (a === null) return b;
  if (b === null) return a;
  if (a.by !== b.by) return a.by === 'cook' ? a : b;
  if (a.out_s !== b.out_s) return a.out_s < b.out_s ? a : b;
  return a.due_s <= b.due_s ? a : b;
}

/** Whether two copies of one cook were told the same: the same start and
 *  choices, so the same plan, and what either's clock decided is the other's
 *  too. */
function sameCorrections(a: RunningCook, b: RunningCook): boolean {
  return a.startedAt_s === b.startedAt_s && sameChoices(a.choices, b.choices);
}

/**
 * `ours` with what another tab's copy of the same cook saw taken up: what it
 * saw in the one pan that this copy has not, logged. The two are one cook,
 * the same id, so neither copy corrects the other, and the events are each
 * the earliest seen: the boil tapped first; a pull by the cook over one the
 * clock assumed (`timeout`), and of two alike the earlier; the cooling's end
 * of the pull kept; the pull that rang, if it rang under the boil kept; and
 * the plan as it ran, if it is of the pull kept. `ours`, the same object,
 * when there is nothing to take up, and always for another cook: a tab never
 * takes up a cook another tab started. Taken up both ways, two copies end
 * with the same events.
 *
 * From a copy whose start or choices differ from ours, only the cook's own
 * observations: the boil tap and a pull the cook tapped, which are what was
 * seen in the pan whatever either copy was told. Never what that copy's clock
 * decided from a plan this one has been corrected away from - the pull
 * ringing, a pull it assumed when the grace ran out (`timeout`), the
 * cooling's end - which would end this cook on another's time.
 */
export function takeUpEvents(ours: RunningCook, theirs: RunningCook): RunningCook {
  if (theirs.id_ms !== ours.id_ms) return ours;
  const same = sameCorrections(ours, theirs);
  const a = ours.events;
  const b = theirs.events;
  const boil = earlier(a.boilAt_s, b.boilAt_s);
  const theirPull = same || (b.pulled !== null && b.pulled.by === 'cook') ? b.pulled : null;
  const pulled = betterPull(a.pulled, theirPull);
  const cooled = earlier(
    samePulled(pulled, a.pulled) ? a.cooledAt_s : null, same && samePulled(pulled, b.pulled) ? b.cooledAt_s : null,
  );
  const rang = earlier(a.boilAt_s === boil ? a.rangAt_s : null, same && b.boilAt_s === boil ? b.rangAt_s : null);
  const events: CookEvents = { boilAt_s: boil, pulled: pulled, cooledAt_s: cooled, rangAt_s: rang };
  // The plan as it ran is of one pull's cook time, and of the cook as last
  // corrected: ours if it still is, else theirs if it is.
  const ranFits = (r: CookAsRan | null): boolean => r !== null && pulled !== null
    && r.cook_s === pulled.due_s - ours.startedAt_s && r.correctedAt_s === ours.correctedAt_s;
  const asRan = ranFits(ours.asRan) ? ours.asRan : ranFits(theirs.asRan) ? theirs.asRan : null;
  if (sameEvents(events, a) && sameAsRan(asRan, ours.asRan)) return ours;
  return withAsRan(writeEvents(ours, events), asRan);
}

/** Whether copy `a` of a cook was corrected after copy `b` was: a reload
 *  should restore the latest correction, so `a` is not written over by `b`. */
export function correctedLater(a: RunningCook, b: RunningCook): boolean {
  return a.correctedAt_s !== null && (b.correctedAt_s === null || a.correctedAt_s > b.correctedAt_s);
}

/**
 * Whether the cook on a screen is still the egg open to correction at
 * `now_s`: the stored cook is this one - its id, `storedId_ms`, is this
 * cook's (null when nothing is stored) - and it is not too old by this
 * screen's plan. Core's `openEggId` asks the same of the stored cook and its
 * plan; this asks it of the screen's own, with no second plan. When it is
 * not - Start again or Cancel in another tab, another cook stored, or an
 * hour past the end - the egg is final: the screen ends it as Start again
 * does, or at least puts its questions away, and logs or rewrites nothing
 * more for it.
 */
export function cookStillOpen(cook: RunningCook, plan: CookPlan, storedId_ms: number | null, now_s: number): boolean {
  return storedId_ms === cook.id_ms && !cookTooOld(plan, now_s);
}
