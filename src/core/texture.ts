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
import { WHITE_FIRM_GAP_MEDIAN, YOLK_WORDS, type YolkWord } from './infer.ts';
import { SLIDER_STEPS } from './slider.ts';
import { WHITE_DOSE_TARGET, sliderFromYolkDose } from './solve.ts';

/** What the pan makes of the white, by its dose: `runny` when it never gets
 *  the dose that sets it, `firm` past where a cook calls it firm, and `set`
 *  between. */
type WhiteBand = 'runny' | 'set' | 'firm';

interface Texture {
  white: WhiteBand;
  /** The slider's own word for the yolk. */
  yolk: YolkWord;
}

/** The texture note's bands. Each is read from a dose, never a peak
 *  temperature: two eggs with one peak can have spent very different times
 *  near it (an egg cup's yolk stays near its peak until the egg is opened).
 *
 *  The yolk is the slider's word for its dose: the level that dose sits at
 *  (`sliderFromYolkDose`), on the slider's grid, named as the slider names it
 *  (`askedWord`), so the note never names a yolk the slider would not. On the
 *  grid, because two of its positions (0.11 and 0.81) are edges between two
 *  words, where the slider's word turns on the last bit and a solve lands a
 *  hair either side: a refused Runny snapped to 0.11 reads Runny on the
 *  slider, and its egg must too.
 *
 *  The white is its dose on the scale a cook's white answer is scored on
 *  (`whiteProbit`): runny where the solver says the pan never sets it
 *  (`Solution.whiteSets`), whatever its peak; firm more than the prior's
 *  median tender | firm gap (`WHITE_FIRM_GAP_MEDIAN`) above the white's
 *  target, where the forecast has a fresh cook most likely to call it firm;
 *  set between. */
export function textureFor(yolkDose_min: number, whiteDose_min: number, whiteSets: boolean): Texture {
  const white: WhiteBand = !whiteSets ? 'runny'
    : Math.log10(whiteDose_min / WHITE_DOSE_TARGET) > WHITE_FIRM_GAP_MEDIAN ? 'firm' : 'set';
  const level = Math.round(sliderFromYolkDose(yolkDose_min) * SLIDER_STEPS) / SLIDER_STEPS;
  return { white: white, yolk: YOLK_WORDS[askedWord(level)] };
}

/** The texture note as the catalogue's keys: the line's own key, and the key
 *  of the fragment that fills each of its placeholders. The app renders the
 *  fragments and hands them in; it chooses nothing. */
interface TextureNote {
  key: CopyKey;
  parts: Readonly<Record<string, CopyKey>>;
}

/** Which words a texture is said in. A white that never sets is the whole
 *  note, "white stays runny" with no yolk after it; every other white is
 *  named with its yolk. The keys are written out
 *  whole so that the copy tests can find each one. */
export function textureNoteKeys(t: Texture): TextureNote {
  if (t.white === 'runny') return { key: 'texture.white.runny', parts: {} };
  const white = t.white === 'set' ? 'texture.white.set' : 'texture.white.firm';
  const yolk = t.yolk === 'runny' ? 'texture.yolk.liquid'
    : t.yolk === 'soft' ? 'texture.yolk.soft'
      : t.yolk === 'jammy' ? 'texture.yolk.jammy'
        : t.yolk === 'fudgy' ? 'texture.yolk.fudgy'
          : 'texture.yolk.set';
  return { key: 'texture.note', parts: { white: white, yolk: yolk } };
}
