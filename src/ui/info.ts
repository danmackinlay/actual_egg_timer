/**
 * The (i): every disclosure on the page, one component (UI.md section 4).
 */

import { t } from './copy.js';

/** The paragraph an (i) opens: the element its aria-controls names. */
function infoPanel(button: HTMLButtonElement): HTMLElement | null {
  const id = button.getAttribute('aria-controls');
  return id === null ? null : document.getElementById(id);
}

/** Open or close an (i)'s paragraph in place. */
function toggleDisclosure(button: HTMLButtonElement): void {
  const panel = infoPanel(button);
  if (panel === null) return;
  const open = button.getAttribute('aria-expanded') !== 'true';
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
  panel.hidden = !open;
}

/** Show or hide an (i) with what it describes. Its paragraph follows it:
 *  hidden with it, and shown again only if it was left open. */
export function showInfo(button: HTMLButtonElement, visible: boolean): void {
  button.hidden = !visible;
  const panel = infoPanel(button);
  if (panel !== null) panel.hidden = !visible || button.getAttribute('aria-expanded') !== 'true';
}

/**
 * Every (i) on the page, one component (UI.md section 4). Its name to a
 * screen reader is "About {label}", with the label its control shows
 * (`data-label`), or a whole name of its own (`data-name`) where a label will
 * not read inside that. Its paragraph is filled by `applyCopy` from the
 * `data-copy` on the element it controls.
 */
export function wireInfoButtons(): void {
  labelInfoButtons();
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('button.info'))) {
    button.addEventListener('click', () => toggleDisclosure(button));
  }
}

/** Each (i)'s name, in the language on screen. Again whenever it changes. */
export function labelInfoButtons(): void {
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('button.info'))) {
    const name = button.dataset['name'];
    const label = button.dataset['label'];
    if (name !== undefined) button.setAttribute('aria-label', t(name));
    else if (label !== undefined) button.setAttribute('aria-label', t('more.about', { label: t(label) }));
  }
}
