/**
 * fixtures/texture.json: what the pan makes of the white and the yolk
 * (src/core/texture.ts) - the bands' edges, every band boundary from both
 * sides, and the keys the texture note is said in.
 */

import { WHITE_BAND_BELOW_C, YOLK_BAND_BELOW_C, textureFor, textureNoteKeys } from '../../src/core/texture.js';

/* Every boundary with the white setting, and a few without: a white the pan
 * never sets is runny whatever its peak, even one hot enough to read "firm". */
const TEXTURE_CASES: [number, number, boolean][] = [];
for (const yolk of [50, 57.9, 58, 62.9, 63, 67.9, 68, 72.9, 73, 85]) {
  for (const white of [60, 70.9, 71, 81.9, 82, 95]) TEXTURE_CASES.push([yolk, white, true]);
}
for (const [yolk, white] of [[50, 60], [57.9, 70.9], [65, 71], [73, 95]]) {
  TEXTURE_CASES.push([yolk, white, false]);
}

export const textureFixture = {
  about: 'The texture bands: their edges, every boundary from both sides, a white that never sets, and the note\'s keys. src/core/texture.ts.',
  whiteBandBelow_C: WHITE_BAND_BELOW_C,
  yolkBandBelow_C: YOLK_BAND_BELOW_C,
  cases: TEXTURE_CASES.map(([yolk, white, whiteSets]) => {
    const t = textureFor(yolk, white, whiteSets);
    const note = textureNoteKeys(t);
    return {
      peakYolk_C: yolk, peakWhite_C: white, whiteSets: whiteSets, white: t.white, yolk: t.yolk,
      noteKey: note.key, noteWhite: note.parts['white'] ?? null, noteYolk: note.parts['yolk'] ?? null,
    };
  }),
};
