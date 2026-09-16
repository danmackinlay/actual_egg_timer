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

import { SousVideEstimate } from '../core/sousvide.js';

export interface SousVideCopy {
  /** Big text, in place of the clock. */
  headline: string;
  subline: string;
  note: string;
  warn: string;
  hint: string;
}

/** "22 h 41 min", "3 days", "5 weeks". Minutes and seconds stop being a useful
 *  unit somewhere around the point this app stops being useful. */
export function formatLongDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 48) return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} days`;
  return `${Math.round(days / 7)} weeks`;
}

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

/** Whole days between two instants, by local midnight rather than by elapsed
 *  hours: 23:00 to 01:00 is yesterday, not "nearly today". */
function daysBefore(then_ms: number, now_ms: number): number {
  const then = new Date(then_ms);
  const now = new Date(now_ms);
  then.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((now.getTime() - then.getTime()) / 86400000);
}

function whenToStart(then_ms: number, now_ms: number): string {
  const days = daysBefore(then_ms, now_ms);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `Last ${WEEKDAYS[new Date(then_ms).getDay()]}`;
  if (days < 14) return 'Last week';
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
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

  const binding = est.whiteBound
    ? `${formatLongDuration(est.whiteHold_s)} of that is the white`
    : `${formatLongDuration(est.yolkHold_s)} of that is the yolk`;

  return {
    headline: whenToStart(start_ms, now_ms),
    subline: `at ${clockOf(start_ms)} — ${duration} at ${bath}°C, to eat now`,
    note: est.whiteBound ? 'white still not set, yolk creamy' : 'yolk set, white still not',
    warn: `A ${bath}°C bath is below where egg white sets: only ovotransferrin `
      + `denatures this low, so the white stays loose however long you wait. `
      + `${binding}, and it is a waiting time, not a cooking time. The model is `
      + `also conduction-only down here, which flatters it. Use the pan.`,
    hint: `nothing to start — you are ${duration} late`,
  };
}
