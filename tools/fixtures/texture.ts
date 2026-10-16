/**
 * fixtures/texture.json: what the pan makes of the white and the yolk
 * (src/core/texture.ts) - every band boundary from both sides, and the keys
 * the texture note is said in.
 */

import { textureFor, textureNoteKeys } from '../../src/core/texture.ts';

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
  about: 'The texture bands: every boundary from both sides, a white that never sets, and the note\'s keys. src/core/texture.ts.',
  cases: TEXTURE_CASES.map(([yolk, white, whiteSets]) => {
    const t = textureFor(yolk, white, whiteSets);
    return { peakYolk_C: yolk, peakWhite_C: white, whiteSets: whiteSets, texture: t, note: textureNoteKeys(t) };
  }),
};
