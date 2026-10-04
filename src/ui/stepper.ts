/**
 * The − and + beside every number the cook sets (the `steppers` draft):
 * typing numbers on a phone is a chore.
 *
 * Each `<input type="number" data-stepper>` gets a button either side of it.
 * A press steps the number once; held, it repeats, and speeds up. The step,
 * the bounds and the grid are the input's own `step`, `min` and `max`, which
 * `applyMeasure` sets from src/core/units.ts in the units on screen (and
 * `applyLimit` for the count), so a step lands on the grid and inside the
 * limits: `stepUp` from an off-grid 58.3 g goes to 58.5, never 58.8. The
 * stepped number is written as the cook would have typed it and announced as
 * an `input` event, so it takes the one path every typed number takes
 * (`readInputs`). The field stays typeable, and its own arrow keys still step.
 * A field given a rule of its own (`setStepRule`: the probe reading and the
 * room, the `feedback2` draft) steps by that instead, from its placeholder
 * when it is empty.
 *
 * The glyphs are drawn in CSS, so the markup holds no words; each button's
 * name to a screen reader is "Less: {label}" or "More: {label}", with the
 * label its field shows.
 */

import { t } from './copy.js';

/** A held button's first repeat, then its pace, and the pace it speeds up
 *  to after `FAST_AFTER` repeats: 30 steps of altitude in about 2.5 s. */
const FIRST_REPEAT_MS = 400;
const REPEAT_MS = 100;
const FAST_REPEAT_MS = 50;
const FAST_AFTER = 10;

/** A field whose − and + do not step on its own `step`: the probe reading,
 *  typed to a tenth and stepped in whole degrees, and the room, which starts
 *  empty. The rule is one press from a number in the field's units
 *  (`stepPast` in src/core/units.ts). An empty field steps from its
 *  placeholder, the number it shows greyed; the browser's own `stepUp` would
 *  step an empty field from zero. */
type StepRule = (value: number, up: boolean) => number;
const rules = new WeakMap<HTMLInputElement, StepRule>();

/** Give a field's − and + a rule of their own (`StepRule`). Again whenever
 *  the units change. */
export function setStepRule(input: HTMLInputElement, rule: StepRule): void {
  rules.set(input, rule);
}

/** Step the input once, up or down. True if its value moved. */
function stepOnce(input: HTMLInputElement, up: boolean): boolean {
  const before = input.value;
  const rule = rules.get(input);
  if (rule !== undefined) {
    const typed = input.value.trim();
    const from = Number(typed === '' ? input.placeholder : typed);
    if (input.disabled || (typed === '' && input.placeholder === '') || !Number.isFinite(from)) return false;
    input.value = String(rule(from, up));
  } else {
    try {
      if (up) input.stepUp();
      else input.stepDown();
    } catch {
      // Not a number the browser can step from; leave it for the cook to type.
      return false;
    }
  }
  // As the field shows a stored number: to the step's decimals, without the
  // trailing zeros (`inputText`), so float noise never reaches the field.
  const decimals = (input.step.split('.')[1] ?? '').length;
  let text = Number(input.value).toFixed(decimals);
  if (text.includes('.')) text = text.replace(/\.?0+$/, '');
  input.value = text;
  if (input.value === before) return false;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

function stepButton(input: HTMLInputElement, up: boolean): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = up ? 'step step--more' : 'step step--less';
  button.dataset['for'] = input.id;
  button.dataset['up'] = up ? '1' : '0';

  let timer = 0;
  let repeats = 0;
  const stop = (): void => {
    if (timer !== 0) window.clearTimeout(timer);
    timer = 0;
  };
  const repeat = (delay: number): void => {
    timer = window.setTimeout(() => {
      repeats += 1;
      if (!stepOnce(input, up)) { stop(); return; }
      repeat(repeats >= FAST_AFTER ? FAST_REPEAT_MS : REPEAT_MS);
    }, delay);
  };

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    // No focus moved and no text selected; a field being typed in keeps its
    // keyboard.
    event.preventDefault();
    stop();
    repeats = 0;
    if (stepOnce(input, up)) repeat(FIRST_REPEAT_MS);
  });
  for (const end of ['pointerup', 'pointerleave', 'pointercancel']) button.addEventListener(end, stop);
  // A long press is a hold, not a menu.
  button.addEventListener('contextmenu', (event) => event.preventDefault());
  // Enter or Space: a click with no pointer behind it. A pointer's own click
  // was already taken at pointerdown.
  button.addEventListener('click', (event) => {
    if (event.detail === 0) stepOnce(input, up);
  });
  return button;
}

/** Put a − before and a + after every number marked `data-stepper`. */
export function wireSteppers(): void {
  for (const input of Array.from(document.querySelectorAll<HTMLInputElement>('input[data-stepper]'))) {
    input.before(stepButton(input, false));
    input.after(stepButton(input, true));
  }
  labelSteppers();
}

/** Put a field's − and + out of reach, or back: with the field, when it is
 *  done with (a probe reading once used). */
export function disableSteppers(input: HTMLInputElement, disabled: boolean): void {
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(`button.step[data-for="${input.id}"]`))) {
    button.disabled = disabled;
  }
}

/** Each button's name, in the language on screen: "Less: Altitude". Again
 *  whenever the language changes. */
export function labelSteppers(): void {
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('button.step'))) {
    const id = button.dataset['for'] ?? '';
    const labelKey = document.querySelector<HTMLElement>(`label[for="${id}"]`)?.dataset['copy'];
    if (labelKey === undefined) continue;
    const key = button.dataset['up'] === '1' ? 'controls.more' : 'controls.less';
    button.setAttribute('aria-label', t(key, { label: t(labelKey) }));
  }
}
