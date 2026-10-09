/**
 * The sharing section of Settings (`#share`): the switch, the note under it,
 * the random number, and "Delete shared results", which asks first in place as Forget does
 * (learned.ts). What sharing does is share.ts; this only says it.
 */

import { ShareState } from '../core/share.js';
import { t } from './copy.js';
import { page } from './dom.js';
import { send } from './send.js';
import { storageReadOnly } from './store.js';

/**
 * Draw the section as sharing `s` stands. `waiting` is how many final eggs
 * have not gone yet: shown only when some have gone, since before the first
 * one "Nothing sent yet" says it. `deletedHere`: a deletion this page asked
 * for has been confirmed, said until sharing is turned on again.
 */
export function renderShare(s: Readonly<ShareState>, waiting: number, deletedHere: boolean): void {
  page().shareSetting.checked = s.on;
  // While a newer build's results are left alone (store.ts) nothing is sent
  // or deleted, so the switch cannot be moved.
  const frozen = storageReadOnly();
  page().shareSetting.disabled = frozen;
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
  // The random number, to quote by email: whole, and only
  // while there is one - from the first time sharing is turned on until a
  // deletion.
  page().shareId.hidden = s.uid === null;
  page().shareUid.textContent = s.uid ?? '';
  // Not while the confirmation is up: it stands in the button's place.
  if (page().shareConfirm.hidden) page().shareDelete.hidden = s.uids.length === 0 || frozen;
}

/** Wire the switch and the deletion. Once, at boot. */
export function wireShare(): void {
  page().shareSetting.addEventListener('change', () => send({ kind: 'shareOn', on: page().shareSetting.checked }));
  page().shareDelete.addEventListener('click', () => {
    page().shareDelete.hidden = true;
    page().shareConfirm.hidden = false;
    page().shareDeleteNo.focus();
  });
  page().shareDeleteNo.addEventListener('click', () => {
    page().shareConfirm.hidden = true;
    send({ kind: 'shared' });
    page().shareDelete.focus();
  });
  page().shareDeleteYes.addEventListener('click', () => {
    page().shareConfirm.hidden = true;
    send({ kind: 'shareDelete' });
    // The button has gone with what it deletes; the note that says so has
    // the focus.
    page().shareNote.focus();
  });
}
