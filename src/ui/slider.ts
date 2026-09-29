/**
 * The doneness slider: its reading, the track's stripes and shading, the
 * bracket under it, and the doneness words on its ticks.
 *
 * Everything here draws what it is given. Which odds and which outcome the
 * track shows - none once a cook is running - is the caller's to say.
 */

import { anchorNear } from '../core/policy.js';
import { DONENESS_ANCHORS, Solution } from '../core/solve.js';
import { OddsProfile, shadingOf } from '../core/reach.js';
import { Outcome } from '../core/outcome.js';
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
 *  `odds` shades the track and `bracket` draws the likely range under it;
 *  either is null when there is none to show (a cook under way, a white that
 *  never sets, or the odds not in yet). */
export function renderDonenessScale(
  sol: Solution, odds: OddsProfile | null, bracket: Outcome | null,
): void {
  const softest = sol.whiteSets ? sol.softestLevel : 1;
  const hardest = sol.whiteSets ? sol.hardestLevel : 0;
  page().donenessBlockedSoft.style.width = `${percent(softest)}%`;
  page().donenessBlockedHard.style.width = `${percent(1 - hardest)}%`;

  // The odds at each level, relative to the best level's, and the levels the
  // pan can deliver but the odds do not offer yet (reach.ts).
  renderOddsBand(odds);
  const offeredSoft = odds !== null && odds.softest !== null ? odds.softest : softest;
  const offeredHard = odds !== null && odds.hardest !== null ? odds.hardest : hardest;
  const refusing = odds !== null && odds.softest !== null && odds.hardest !== null;
  placeBand(page().donenessUnlikelySoft, refusing ? odds.physicalSoftest : 0, refusing ? offeredSoft : 0);
  placeBand(page().donenessUnlikelyHard, refusing ? offeredHard : 0, refusing ? odds.physicalHardest : 0);
  renderBracket(bracket);

  const ticks = page().donenessTicks.children;
  for (let i = 0; i < ticks.length; i += 1) {
    const anchor = DONENESS_ANCHORS[i];
    if (anchor === undefined) continue;
    const blocked = anchor.level < Math.max(softest, offeredSoft) - 0.005
      || anchor.level > Math.min(hardest, offeredHard) + 0.005;
    ticks[i].classList.toggle('blocked', blocked);
  }
}

/** The likely range of the yolk under the track, from the outcome's 10% to
 *  its 90% point, with a mark at its middle; and the same in words for a
 *  screen reader, each end as the nearest doneness word. Nothing without an
 *  outcome: no decision yet, no white, sous-vide, or a cook under way. */
export function renderBracket(o: Outcome | null): void {
  page().donenessBracket.hidden = o === null;
  if (o === null) {
    page().donenessRange.textContent = '';
    return;
  }
  placeBand(page().donenessBracket, o.levelLow, o.levelHigh);
  const span = o.levelHigh - o.levelLow;
  const middle = span > 0 ? (o.levelMedian - o.levelLow) / span : 0.5;
  page().donenessMedian.style.left = `${clampNumber(middle * 100, { lo: 0, hi: 100 }, 50)}%`;
  const words = rangeWords(o);
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

/** Shade the track by the odds (`shadingOf`): the band's hue is the yolk's,
 *  runny to hard (styles.css), and this masks it to an opacity that is the
 *  level's odds over the best level's, stop by stop between the profile's
 *  points, and clear outside them, where the stripes are. */
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
