/**
 * fixtures/texture.json: what the pan makes of the white and the yolk
 * (src/core/texture.ts) - every band boundary from both sides, and the keys
 * the texture note is said in.
 */

import { wordBandHigh } from '../../src/core/certainty.ts';
import { WHITE_FIRM_GAP_MEDIAN } from '../../src/core/infer.ts';
import { SLIDER_STEPS } from '../../src/core/slider.ts';
import { WHITE_DOSE_TARGET, donenessFromSlider } from '../../src/core/solve.ts';
import { textureFor, textureNoteKeys } from '../../src/core/texture.ts';

function doseAt(level: number): number {
  return donenessFromSlider(level).yolkDose_min;
}

/* The yolk's doses: every position the slider can rest on, the doses
 * between two positions either side of every edge between two words, and
 * doses past each end of the track. Never half a step, where the rounding
 * onto the grid turns on the last bit. */
const YOLK_DOSES_MIN: number[] = [1e-4];
for (let p = 0; p <= SLIDER_STEPS; p++) YOLK_DOSES_MIN.push(doseAt(p / SLIDER_STEPS));
for (let k = 0; k < 4; k++) {
  for (const side of [-0.004, 0.004]) YOLK_DOSES_MIN.push(doseAt(wordBandHigh(k) + side));
}
YOLK_DOSES_MIN.push(1e5);

/* The white's doses, as decades above its target: below it (a solve that
 * sets the white lands a hair either side), at it, either side of the firm
 * gap, and far past it. */
const WHITE_DOSES_MIN: number[] = [-0.01, 0, 0.5, WHITE_FIRM_GAP_MEDIAN - 0.01, WHITE_FIRM_GAP_MEDIAN + 0.01, 4]
  .map((decades) => WHITE_DOSE_TARGET * Math.pow(10, decades));

/* The yolk at a white that sets and is set; the white at every boundary,
 * with a jammy yolk; and a few that never set: a white the pan never sets is
 * runny whatever its dose, even one far enough past its target to read
 * "firm". */
const TEXTURE_CASES: [number, number, boolean][] = [];
for (const yolk of YOLK_DOSES_MIN) TEXTURE_CASES.push([yolk, WHITE_DOSES_MIN[2], true]);
for (const white of WHITE_DOSES_MIN) TEXTURE_CASES.push([doseAt(0.41), white, true]);
for (const [yolk, white] of [[1e-4, 1e-4], [doseAt(0.22), WHITE_DOSES_MIN[0]], [doseAt(0.41), WHITE_DOSES_MIN[2]], [doseAt(1), WHITE_DOSES_MIN[5]]]) {
  TEXTURE_CASES.push([yolk, white, false]);
}

export const textureFixture = {
  about: 'The texture bands: the yolk at every position of the slider, between two positions either side of every edge between its words, and past its ends; the white\'s dose at every boundary; a white that never sets; and the note\'s keys. src/core/texture.ts.',
  cases: TEXTURE_CASES.map(([yolk, white, whiteSets]) => {
    const t = textureFor(yolk, white, whiteSets);
    return { yolkDose_min: yolk, whiteDose_min: white, whiteSets: whiteSets, texture: t, note: textureNoteKeys(t) };
  }),
};
