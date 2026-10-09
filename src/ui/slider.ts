/**
 * The doneness slider: its reading, the track's stripes and shading, the
 * bracket under it, and the doneness words on its ticks.
 *
 * Everything here draws what it is given. Which odds and which outcome the
 * track shows - none once a cook is running - is the caller's to say.
 */

import { anchorNear, anchorReachable } from '../core/slider.js';
import { DONENESS_ANCHORS, Solution } from '../core/solve.js';
import { OddsProfile, shadingOf } from '../core/reach.js';
import { WordCertainty, wordBracket } from '../core/certainty.js';
import { rangeWords } from '../core/wording.js';
import { t } from './copy.js';
import { page } from './dom.js';
import { clampNumber } from './store.js';
import { show } from './units.js';

/** The slider's reading: at the end of its heading, the peak yolk the level
 *  asks for, and to a screen reader, as the slider's value, the doneness word
 *  with it. The word is not drawn again: it is on the ticks. In sous-vide there
 *  is no peak, and the water's temperature is said instead, so the reading
 *  says which number it is. The same shape whether the temperature is the
 *  solver's or the quick interpolation that tracks the thumb, so it does not
 *  flicker between two formats mid-drag. */
export function renderDonenessReading(
  level: number, reading: { peakYolk_C: number } | { bath_C: number },
): void {
  const doneness = t(anchorNear(level).key);
  if ('bath_C' in reading) {
    const bath = show('temperature', reading.bath_C);
    page().donenessPeak.textContent = t('controls.doneness.bath', { bath: bath });
    page().doneness.setAttribute('aria-valuetext', t('controls.doneness.valueBath', { doneness: doneness, bath: bath }));
    return;
  }
  const yolk = show('temperature', reading.peakYolk_C);
  page().donenessPeak.textContent = t('controls.doneness.peak', { yolk: yolk });
  page().doneness.setAttribute('aria-valuetext', t('controls.doneness.value', { doneness: doneness, yolk: yolk }));
}

/** Stripe out the parts of the track this setup cannot deliver: the soft end
 *  the white forbids, and - with the heat off - the hard end the pan cannot
 *  reach. If the white never sets there is nothing to offer, and the whole
 *  track says so.
 *
 *  `odds` shades the track and `bracket`, the certainty's words, draws
 *  their 90% interval under it; either is null when there is none to show
 *  (a cook under way, a white that never sets, or the odds not in yet). */
export function renderDonenessScale(
  sol: Solution, odds: OddsProfile | null, bracket: WordCertainty | null,
): void {
  const softest = sol.whiteSets ? sol.softestLevel : 1;
  const hardest = sol.whiteSets ? sol.hardestLevel : 0;
  page().donenessBlockedSoft.style.width = `${percent(softest)}%`;
  page().donenessBlockedHard.style.width = `${percent(1 - hardest)}%`;

  // The chance of the word asked at each level, relative to the best
  // level's, and dots over the levels the pan can deliver but that are a wild
  // guess so far, softer or firmer than every level that is not (reach.ts,
  // `lowOddsAt`). The slider rests on the dots, and says so; only the
  // stripes move it.
  renderOddsBand(odds);
  const warning = odds !== null && odds.softest !== null && odds.hardest !== null;
  placeBand(page().donenessUnlikelySoft, warning ? odds.physicalSoftest : 0, warning ? odds.softest ?? 0 : 0);
  placeBand(page().donenessUnlikelyHard, warning ? odds.hardest ?? 0 : 0, warning ? odds.physicalHardest : 0);
  renderBracket(bracket);

  // A word is struck through only where the pan cannot deliver any of it.
  const ticks = page().donenessTicks.children;
  for (let i = 0; i < ticks.length; i += 1) {
    if (DONENESS_ANCHORS[i] === undefined) continue;
    ticks[i].classList.toggle('blocked', !anchorReachable(i, softest, hardest));
  }
}

/** The bare track, as iOS draws it in sous-vide (`OddsTrack`): no stripes,
 *  no odds, no dots, no bracket and no word struck through. There is no pan,
 *  and the bath delivers every level; without this the last pan's scale
 *  stayed on the track under the bath's answer. */
export function renderBareScale(): void {
  page().donenessBlockedSoft.style.width = '0%';
  page().donenessBlockedHard.style.width = '0%';
  renderOddsBand(null);
  placeBand(page().donenessUnlikelySoft, 0, 0);
  placeBand(page().donenessUnlikelyHard, 0, 0);
  renderBracket(null);
  const ticks = page().donenessTicks.children;
  for (let i = 0; i < ticks.length; i += 1) ticks[i].classList.remove('blocked');
}

/** The bracket under the track: the certainty's 90% interval in words,
 *  drawn from the outer edge of its first word's band on the slider to the
 *  outer edge of its last's, with a mark at the most likely word
 *  (`wordBracket`); and the same words for a screen reader. Nothing without
 *  a reading: no decision yet, no white, sous-vide, or a cook under way. */
function renderBracket(w: WordCertainty | null): void {
  page().donenessBracket.hidden = w === null;
  if (w === null) {
    page().donenessRange.textContent = '';
    return;
  }
  const b = wordBracket(w);
  placeBand(page().donenessBracket, b.low, b.high);
  const span = b.high - b.low;
  const middle = span > 0 ? (b.mark - b.low) / span : 0.5;
  page().donenessMedian.style.left = `${clampNumber(middle * 100, { lo: 0, hi: 100 }, 50)}%`;
  const words = rangeWords(w);
  const args: Record<string, string> = {};
  for (const [name, key] of Object.entries(words.args)) args[name] = t(key);
  page().donenessRange.textContent = t(words.key, args);
}

/** A level as a percentage of the track, clamped. */
function percent(level: number): number {
  return clampNumber(level * 100, { lo: 0, hi: 100 }, 0);
}

/** Lay a band over the track from one level to another; nothing when the
 *  second is not past the first. */
function placeBand(band: HTMLElement, from: number, to: number): void {
  band.style.left = `${percent(from)}%`;
  band.style.width = `${to > from ? percent(to) - percent(from) : 0}%`;
}

/** Shade the track (`shadingOf`): the band's hue is the yolk's, runny to hard
 *  (styles.css), and this masks it to an opacity that is the chance of the
 *  word asked at the level over the best level's, stop by stop between the
 *  profile's points, and clear outside them, where the stripes are. */
function renderOddsBand(odds: OddsProfile | null): void {
  const shades = odds === null ? [] : shadingOf(odds);
  let mask = 'linear-gradient(transparent, transparent)';
  if (shades.length > 0) {
    const first = shades[0].level * 100;
    const last = shades[shades.length - 1].level * 100;
    const stops = shades.map((s) => (
      `rgb(0 0 0 / ${s.strength.toFixed(3)}) ${(s.level * 100).toFixed(2)}%`
    ));
    mask = `linear-gradient(to right, transparent ${first.toFixed(2)}%, `
      + `${stops.join(', ')}, transparent ${last.toFixed(2)}%)`;
  }
  page().donenessOdds.style.setProperty('-webkit-mask-image', mask);
  page().donenessOdds.style.setProperty('mask-image', mask);
}

/** One tick per doneness word, placed at its level. Once, at boot. */
export function buildTicks(): void {
  for (const anchor of DONENESS_ANCHORS) {
    const span = document.createElement('span');
    span.style.left = `${anchor.level * 100}%`;
    page().donenessTicks.append(span);
  }
  labelTicks();
}

/** The ticks' words, in the language on screen. Again whenever it changes. */
export function labelTicks(): void {
  const spans = page().donenessTicks.querySelectorAll<HTMLSpanElement>('span');
  DONENESS_ANCHORS.forEach((anchor, i) => {
    if (spans[i] !== undefined) spans[i].textContent = t(anchor.key);
  });
}
