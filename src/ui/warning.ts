/**
 * The warning line, in words, for the view (view.ts): the idle page's, and a
 * running cook's.
 */

import type { Cooling } from '../core/protocol.ts';
import { anchorNear } from '../core/slider.ts';
import type { LevelAnswer } from '../core/reach.ts';
import { warningKey } from '../core/wording.ts';
import { midSentence } from '../core/copy.ts';
import { activeLocale, t, tRef } from './copy.ts';
import { show } from './units.ts';

/** The warning line, in words: a refusal, or that the level is a wild guess. Which,
 *  and which words say it, are core's (`answerAt`, `warningKey`); the
 *  arguments are this app's, for `pot`: the settings', or a running cook's
 *  own choices. The warning names the level the slider rests on, a word
 *  standing alone before the colon. */
export function warningText(
  answer: LevelAnswer, pot: { cooling: Cooling; waterLitres: number },
): string {
  const v = answer.verdict;
  const ref = warningKey(v, answer.lowOdds, pot.cooling);
  if (ref === null) return '';
  return tRef(ref, {
    limit: midSentence(t(v.limit.key), activeLocale()), water: show('water', pot.waterLitres),
    doneness: t(anchorNear(answer.level).key),
  });
}
