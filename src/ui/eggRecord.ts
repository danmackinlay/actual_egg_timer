/**
 * The record of one egg (INFERENCE.md section 4), from the running cook and
 * its plan, as core's `step` makes it when it logs one (`cookFactsFor`,
 * `recordFor`), with what only the web knows - which build, which
 * population, the local day, the record's id. Asked for outside a step only
 * to score a probe reading before the egg is logged (feedback.ts).
 */

import { WhiteReport, YolkWord } from '../core/infer.js';
import { EggRecord, ProbeReading, recordFor } from '../core/record.js';
import { CookPlan, RunningCook, cookFactsFor } from '../core/running.js';
import { localDay } from './model.js';
import { activePopulation } from './population.js';
import { APP_VERSION } from './version.js';

/** The record of one egg (`recordFor`, in core), from the cook and its plan,
 *  with whichever answers have been given so far; null when core refuses the
 *  facts (`cookFactsFor`: no plan as it ran and no surface, or one a
 *  correction has made stale), so no record is ever made with no forecast.
 *  The id is the moment Start was pressed, never corrected, so a cook logged
 *  from two tabs is one egg. */
export function eggRecordFor(
  cook: RunningCook, plan: CookPlan, yolk: YolkWord | null, white: WhiteReport | null = null,
  probe: ProbeReading | null = null,
): EggRecord | null {
  const ctx = {
    app: 'web' as const, appVersion: APP_VERSION, prior: activePopulation().id,
    day: localDay(cook.startedAt_s * 1000), id: cook.id_ms,
  };
  const made = cookFactsFor(cook, plan, ctx, yolk, white, probe);
  return made.facts === null ? null : recordFor(made.facts);
}
