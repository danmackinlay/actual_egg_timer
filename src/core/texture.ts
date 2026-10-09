/**
 * What the pan makes of the white and the yolk, as bands read from their peak
 * temperatures, and the catalogue keys the texture note is said in. The
 * thresholds are a reading of the model rather than a turn of phrase, so they
 * are decided here and worded by each app from the catalogue.
 *
 * Pure, like the rest of `src/core/`: no storage, no DOM, no clock.
 */

/** What the pan makes of the white: `runny` when it never gets the white the
 *  dose that sets it, and otherwise what its peak temperature makes of it. */
export type WhiteBand = 'runny' | 'justSet' | 'set' | 'firm';
/** What the yolk's peak temperature makes of it. */
export type YolkBand = 'liquid' | 'soft' | 'jammy' | 'fudgy' | 'set';

export interface Texture {
  white: WhiteBand;
  yolk: YolkBand;
}

/** The texture note's thresholds, which are a reading of the model rather than
 *  a turn of phrase - so they are decided here and worded in the apps.
 *
 *  The bands read PEAK TEMPERATURES, while the white's own criterion is a dose
 *  (`Solution.whiteSets`). The two disagree only when the pan never gets the
 *  white there at all, and then the dose is the one telling the truth: the
 *  white is runny, whatever its peak, and naming it from its peak would put it
 *  on a scale whose softest word is "white just set". */
export function textureFor(peakYolk_C: number, peakWhite_C: number, whiteSets: boolean): Texture {
  const w = WHITE_BAND_BELOW_C;
  const y = YOLK_BAND_BELOW_C;
  const white: WhiteBand = !whiteSets ? 'runny'
    : peakWhite_C < w.justSet ? 'justSet' : peakWhite_C < w.set ? 'set' : 'firm';
  const yolk: YolkBand = peakYolk_C < y.liquid ? 'liquid'
    : peakYolk_C < y.soft ? 'soft'
      : peakYolk_C < y.jammy ? 'jammy'
        : peakYolk_C < y.fudgy ? 'fudgy'
          : 'set';
  return { white: white, yolk: yolk };
}

/** The peak white temperature, C, below which the white is in each band; at or
 *  above the last it is firm. */
export const WHITE_BAND_BELOW_C = { justSet: 71, set: 82 } as const;

/** The peak yolk temperature, C, below which the yolk is in each band; at or
 *  above the last it is set. */
export const YOLK_BAND_BELOW_C = { liquid: 58, soft: 63, jammy: 68, fudgy: 73 } as const;

/** The texture note as the catalogue's keys: the line's own key, and the key
 *  of the fragment that fills each of its placeholders. The app renders the
 *  fragments and hands them in; it chooses nothing. */
export interface TextureNote {
  key: string;
  parts: Readonly<Record<string, string>>;
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
  const yolk = t.yolk === 'liquid' ? 'texture.yolk.liquid'
    : t.yolk === 'soft' ? 'texture.yolk.soft'
      : t.yolk === 'jammy' ? 'texture.yolk.jammy'
        : t.yolk === 'fudgy' ? 'texture.yolk.fudgy'
          : 'texture.yolk.set';
  return { key: 'texture.note', parts: { white: white, yolk: yolk } };
}
