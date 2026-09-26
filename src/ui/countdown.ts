/**
 * The countdown, on screen and to a screen reader.
 *
 * On screen it is m:ss - a timer, not a time of day, and the same in every
 * language - so it is built here and not by a locale's clock. To a screen
 * reader it is words, and the words are counts: "1 minute 1 second", never
 * "1 seconds". Each count is its own plural message, so that each language
 * picks the form each number needs.
 */

import { t } from './copy.js';

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function spokenClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const spokenSeconds = t('spoken.seconds', { seconds: s });
  if (m === 0) return spokenSeconds;
  return t('spoken.minutesSeconds', { minutes: t('spoken.minutes', { minutes: m }), seconds: spokenSeconds });
}
