/**
 * The warning line, in words: drawn by render.ts for a running cook and
 * taken up by update.ts for the idle page. It imports neither, so neither
 * imports the other for it.
 */

import { Cooling } from '../core/protocol.js';
import { anchorNear } from '../core/slider.js';
import { LevelAnswer } from '../core/reach.js';
import { warningKey } from '../core/wording.js';
import { midSentence } from '../core/copy.js';
import { activeLocale, t, tRef } from './copy.js';
import { state } from './state.js';
import { show } from './units.js';

/** The warning line, in words: a refusal, or that the level is a wild guess. Which,
 *  and which words say it, are core's (`answerAt`, `warningKey`); the
 *  arguments are this app's, for `pot`: the settings', or a running cook's
 *  own choices. The warning names the level the slider rests on, a word
 *  standing alone before the colon. */
export function warningText(
  answer: LevelAnswer, pot: { cooling: Cooling; waterLitres: number } = state.settings,
): string {
  const v = answer.verdict;
  const ref = warningKey(v, answer.lowOdds, pot.cooling);
  if (ref === null) return '';
  return tRef(ref, {
    limit: midSentence(t(v.limit.key), activeLocale()), water: show('water', pot.waterLitres),
    doneness: t(anchorNear(answer.level).key),
  });
}
