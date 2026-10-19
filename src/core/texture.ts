/**
 * What the pan makes of the white and the yolk, and the catalogue keys the
 * texture note is said in. The bands are a reading of the model rather than a
 * turn of phrase, so they are decided here and worded by each app from the
 * catalogue.
 *
 * Pure, like the rest of `src/core/`: no storage, no DOM, no clock.
 */

import { askedWord } from './certainty.ts';
import type { CopyKey } from './copyKeys.ts';
import { YOLK_WORDS, type YolkWord } from './infer.ts';
import { SLIDER_STEPS } from './slider.ts';
import { sliderFromYolkDose } from './solve.ts';

/** What the pan makes of the white: `runny` when it never gets the white the
 *  dose that sets it, and otherwise what its peak temperature makes of it. */
type WhiteBand = 'runny' | 'justSet' | 'set' | 'firm';

interface Texture {
  white: WhiteBand;
  /** The slider's own word for the yolk. */
  yolk: YolkWord;
}

/** The texture note's bands, which are a reading of the model rather than a
 *  turn of phrase - so they are decided here and worded in the apps.
 *
 *  The yolk is the slider's word for its dose: the level that dose sits at
 *  (`sliderFromYolkDose`), on the slider's grid, named as the slider names it
 *  (`askedWord`). So the note can never name a yolk the slider would not,
 *  whatever the cooling. On the grid, because two of its positions (0.11 and
 *  0.81) are edges between two words, where the slider's word turns on the
 *  last bit and a solve lands a hair either side: a refused Runny snapped to
 *  0.11 reads Runny on the slider, and its egg must too. It
 *  is not read from the yolk's peak temperature: two yolks with one peak can
 *  have spent very different times near it, and an egg cup's, which stays near
 *  its peak until the egg is opened, read a Soft yolk's 64 C as "jammy".
 *
 *  The white's runny is its dose too (`Solution.whiteSets`): a white the pan
 *  never sets is runny, whatever its peak, and naming it from its peak would
 *  put it on a scale whose softest word is "white just set". Once it sets,
 *  its bands read its PEAK TEMPERATURE. */
export function textureFor(yolkDose_min: number, peakWhite_C: number, whiteSets: boolean): Texture {
  const w = WHITE_BAND_BELOW_C;
  const white: WhiteBand = !whiteSets ? 'runny'
    : peakWhite_C < w.justSet ? 'justSet' : peakWhite_C < w.set ? 'set' : 'firm';
  const level = Math.round(sliderFromYolkDose(yolkDose_min) * SLIDER_STEPS) / SLIDER_STEPS;
  return { white: white, yolk: YOLK_WORDS[askedWord(level)] };
}

/** The peak white temperature, C, below which the white is in each band; at or
 *  above the last it is firm. */
export const WHITE_BAND_BELOW_C = { justSet: 71, set: 82 } as const;

/** The texture note as the catalogue's keys: the line's own key, and the key
 *  of the fragment that fills each of its placeholders. The app renders the
 *  fragments and hands them in; it chooses nothing. */
interface TextureNote {
  key: CopyKey;
  parts: Readonly<Record<string, CopyKey>>;
}

/** Which words a texture is said in. A white that never sets is the whole
 *  note, "white stays runny" with no yolk after it, as the web has always said
 *  it; every other white is named with its yolk. The keys are written out
 *  whole so that the copy tests can find each one. */
export function textureNoteKeys(t: Texture): TextureNote {
  if (t.white === 'runny') return { key: 'texture.white.runny', parts: {} };
  const white = t.white === 'justSet' ? 'texture.white.justSet'
    : t.white === 'set' ? 'texture.white.set'
      : 'texture.white.firm';
  const yolk = t.yolk === 'runny' ? 'texture.yolk.liquid'
    : t.yolk === 'soft' ? 'texture.yolk.soft'
      : t.yolk === 'jammy' ? 'texture.yolk.jammy'
        : t.yolk === 'fudgy' ? 'texture.yolk.fudgy'
          : 'texture.yolk.set';
  return { key: 'texture.note', parts: { white: white, yolk: yolk } };
}
