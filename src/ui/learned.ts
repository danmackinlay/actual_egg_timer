/**
 * What this kitchen has taught the app - eggs answered about, and the pan's
 * measured time to boil - and the way to take it back (Settings).
 */

import { BoilMemory } from '../core/policy.js';
import { t } from './copy.js';
import { page } from './dom.js';
import { showInfo } from './info.js';
import { estimateTimeToBoil, hasBoilMemory } from './store.js';
import { formatClock } from './countdown.js';
import { show } from './units.js';

/** What has been learned, as it stands. */
export interface Learning {
  /** Eggs folded into the posterior. */
  eggs: number;
  boilMemory: BoilMemory;
  /** The pot on the controls, whose remembered time to boil is the one said. */
  waterLitres: number;
}

/** The line over the questions at DONE, and the note in Settings. */
export function renderCalibNote(l: Learning): void {
  page().calibNote.textContent = l.eggs === 0
    ? t('feedback.invite')
    : t('learned.tuned', { eggs: l.eggs });
  renderLearned(l);
}

/** What this kitchen has taught the app, and the way to take it back. */
export function renderLearned(l: Learning): void {
  const eggs = l.eggs;
  const pan = hasBoilMemory(l.boilMemory);
  if (eggs === 0 && !pan) {
    page().learnedNote.textContent = t('learned.literature');
    showForget(false);
    return;
  }
  const tuned = eggs > 0 ? t('learned.tuned', { eggs: eggs }) : '';
  const measured = pan
    ? t('learned.pan', {
      water: show('water', l.waterLitres),
      time: formatClock(estimateTimeToBoil(l.boilMemory, l.waterLitres)),
    })
    : '';
  page().learnedNote.textContent = tuned !== '' && measured !== ''
    ? t('learned.both', { tuned: tuned, pan: measured })
    : tuned + measured;
  // Not while the confirmation is up: it stands in the button's place.
  if (page().forgetConfirm.hidden) showForget(true);
}

/** Forget and its (i) come and go together. */
function showForget(visible: boolean): void {
  page().forget.hidden = !visible;
  showInfo(page().forgetInfo, visible);
}

/** Forget asks first, in place, as iOS does: the button gives way to the
 *  question and its two answers, and the focus goes to the safe one. */
function onForgetAsked(): void {
  showForget(false);
  page().forgetConfirm.hidden = false;
  page().forgetNo.focus();
}

function onForgetKept(): void {
  page().forgetConfirm.hidden = true;
  showForget(true);
  page().forget.focus();
}

/** Wire Forget and its confirmation. `forget` takes it all back - the
 *  posterior and the pan - and redraws; a run of wrong answers about how the
 *  eggs were was otherwise undone only by clearing the site's storage - README
 *  11.5 listed that as a known gap from the day the iOS app got its own
 *  version of this button. */
export function wireForget(forget: () => void): void {
  page().forget.addEventListener('click', onForgetAsked);
  page().forgetYes.addEventListener('click', () => {
    page().forgetConfirm.hidden = true;
    forget();
    // The button has gone with what it forgot; the note that says so now has
    // the focus.
    page().learnedNote.focus();
  });
  page().forgetNo.addEventListener('click', onForgetKept);
}
