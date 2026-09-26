/**
 * What the app says when you ask it for a sous-vide egg.
 *
 * The numbers are not a joke: they come from src/core/sousvide.ts, which is
 * the same dose machinery as every other answer in this app with the surface
 * temperature held constant. Below 60 C the white's dose target — which is
 * pinned at 80 C, because that is where ovalbumin goes — takes the better part
 * of a day to accumulate, so the honest answer to "when do I start?" is a time
 * in the past. All this module does is say so out loud.
 */

import {
  SOUS_VIDE_MODEL_FLOOR_C, SousVideEstimate, longDuration, startPhrase, weekdayKey,
} from '../core/sousvide.js';
import { t, tRef, timeOfDay } from './copy.js';
import { show } from './units.js';

export interface SousVideCopy {
  /** Big text, in place of the clock. */
  headline: string;
  subline: string;
  note: string;
  warn: string;
  hint: string;
}

/** Whole days between two instants, by local midnight rather than by elapsed
 *  hours: 23:00 to 01:00 is yesterday, not "nearly today". The bucketing of
 *  that count into words is `startPhrase` in the core; this is the part only a
 *  platform can answer. */
function daysBefore(then_ms: number, now_ms: number): number {
  const then = new Date(then_ms);
  const now = new Date(now_ms);
  then.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((now.getTime() - then.getTime()) / 86400000);
}

export function sousVideCopy(est: SousVideEstimate, now_ms: number): SousVideCopy {
  const start_ms = now_ms - est.total_s * 1000;
  const duration = tRef(longDuration(est.total_s));
  const bath = show('temperature', est.bath_C);

  return {
    headline: tRef(startPhrase(daysBefore(start_ms, now_ms)), {
      weekday: t(weekdayKey(new Date(start_ms).getDay())),
    }),
    subline: t('sousvide.subline', { clock: timeOfDay(start_ms), duration: duration, bath: bath }),
    note: t(est.whiteBound ? 'sousvide.note.whiteBound' : 'sousvide.note.yolkBound'),
    warn: t('sousvide.warn', { bath: bath, floor: show('temperature', SOUS_VIDE_MODEL_FLOOR_C) }),
    hint: t('sousvide.hint', { duration: duration }),
  };
}
