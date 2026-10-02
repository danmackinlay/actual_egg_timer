/**
 * The sharing section of Settings (`#share`): the switch, the note under it,
 * and "Delete what I've sent", which asks first in place as Forget does
 * (learned.ts). What sharing does is share.ts; this only says it.
 */

import { t } from './copy.js';
import { page } from './dom.js';
import { deleteSent, setSharing, shareState } from './share.js';

/** Set once a deletion this page asked for has been confirmed, so the note
 *  can say so until the page goes. */
let deletedHere = false;

/**
 * Draw the section as sharing now stands. `waiting` is how many final eggs
 * have not gone yet: shown only when some have gone, since before the first
 * one "Nothing sent yet" says it.
 */
export function renderShare(waiting: number): void {
  const s = shareState();
  page().shareSetting.checked = s.on;
  let note = '';
  if (s.deleting.length > 0) {
    note = t('share.deleting');
  } else if (deletedHere && !s.on) {
    note = t('share.deleted');
  } else if (s.on) {
    note = s.sent === 0 ? t('share.none') : t('share.sent', { eggs: s.sent });
    if (s.sent > 0 && waiting > 0) note += ` ${t('share.waiting', { eggs: waiting })}`;
  }
  page().shareNote.textContent = note;
  // Not while the confirmation is up: it stands in the button's place.
  if (page().shareConfirm.hidden) page().shareDelete.hidden = s.uids.length === 0;
}

/** Wire the switch and the deletion. Once, at boot; `redraw` draws the
 *  section again with the app's count of what is waiting. */
export function wireShare(redraw: () => void): void {
  page().shareSetting.addEventListener('change', () => {
    deletedHere = false;
    void setSharing(page().shareSetting.checked).then(redraw);
    redraw();
  });
  page().shareDelete.addEventListener('click', () => {
    page().shareDelete.hidden = true;
    page().shareConfirm.hidden = false;
    page().shareDeleteNo.focus();
  });
  page().shareDeleteNo.addEventListener('click', () => {
    page().shareConfirm.hidden = true;
    redraw();
    page().shareDelete.focus();
  });
  page().shareDeleteYes.addEventListener('click', () => {
    page().shareConfirm.hidden = true;
    const done = deleteSent().then(() => {
      deletedHere = shareState().deleting.length === 0;
      redraw();
    });
    redraw();
    // The button has gone with what it deletes; the note that says so has
    // the focus.
    page().shareNote.focus();
    void done;
  });
}
