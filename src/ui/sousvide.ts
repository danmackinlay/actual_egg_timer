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

import { SousVideEstimate, formatLongDuration, startPhrase } from '../core/sousvide.js';

export interface SousVideCopy {
  /** Big text, in place of the clock. */
  headline: string;
  subline: string;
  note: string;
  warn: string;
  hint: string;
}

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

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

function clockOf(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
}

export function sousVideCopy(est: SousVideEstimate, now_ms: number): SousVideCopy {
  const start_ms = now_ms - est.total_s * 1000;
  const duration = formatLongDuration(est.total_s);
  const bath = est.bath_C.toFixed(0);

  return {
    headline: startPhrase(daysBefore(start_ms, now_ms), WEEKDAYS[new Date(start_ms).getDay()]),
    subline: `at ${clockOf(start_ms)} — ${duration} at ${bath}°C, to eat now`,
    note: est.whiteBound ? 'white still not set, yolk creamy' : 'yolk set, white still not',
    warn: `A ${bath}°C bath is below the temperature at which egg white sets — `
      + `only one of its proteins reacts down here — so the white stays loose `
      + `however long you leave it. This app was built for boiling water and is `
      + `out of its depth below 60°C anyway. Use the pan.`,
    hint: `nothing to start — you are ${duration} late`,
  };
}
