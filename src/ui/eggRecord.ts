/**
 * The record of one egg (INFERENCE.md section 4), from the running cook and
 * its plan. What a record holds is core's (`recordFor`, src/core/record.ts,
 * iOS's too), and so are its facts (`cookFactsFor`, src/core/running.ts): the
 * cook as last corrected, at the time that ran. This adds what only the web
 * knows - which build, which population, the local day, the record's id.
 */

import { WhiteReport, YolkWord } from '../core/infer.js';
import { EggRecord, ProbeReading, recordFor } from '../core/record.js';
import { CookPlan, RecordContext, RunningCook, cookFactsFor } from '../core/running.js';
import { activePopulation } from './population.js';
import { APP_VERSION } from './version.js';

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** The LOCAL date a cook started on. A day, not a timestamp. */
export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** What the web adds to a cook's facts: this build, the population the
 *  prior came from, the local day the egg went in, and the record's id, the
 *  moment Start was pressed (`id_ms`), never corrected, so a cook logged from
 *  two tabs is one egg. */
function contextOf(cook: RunningCook): RecordContext {
  return {
    app: 'web',
    appVersion: APP_VERSION,
    prior: activePopulation().id,
    day: localDay(cook.startedAt_s * 1000),
    id: cook.id_ms,
  };
}

/** The record of one egg (`recordFor`, in core), from the cook and its plan,
 *  with whichever answers have been given so far, and the probe reading if
 *  there is one. */
export function eggRecordFor(
  cook: RunningCook, plan: CookPlan, yolk: YolkWord | null, white: WhiteReport | null = null,
  probe: ProbeReading | null = null,
): EggRecord {
  return recordFor(cookFactsFor(cook, plan, contextOf(cook), yolk, white, probe));
}
