/**
 * The questions at DONE - which yolk the cook got, in the slider's own five
 * words, and how the white next to it was (DECISIONS.md 92) - and under them
 * the probe reading. Each answer is a step of the cook (core `step`'s
 * `answered`, through cook.ts): the cook's log keeps what was said, and the
 * egg's record is made and learned from there.
 *
 * The model is calibrated against the literature, not against this kitchen.
 * Asking once per egg is what closes that gap.
 */

import {
  CookPlan, Phase, RunningCook, answered, answersOf, asRanShown,
} from '../core/running.js';
import { ModelParams } from '../core/solve.js';
import { WhiteReport, YOLK_WORDS, YolkWord } from '../core/infer.js';
import { ProbeReading } from '../core/record.js';
import { parse, stepPast } from '../core/units.js';
import { t } from './copy.js';
import { page } from './dom.js';
import type { Model } from './model.js';
import { state } from './state.js';
import { disableSteppers, setStepRule } from './stepper.js';
import { measure, show } from './units.js';

/** Whether the questions are on offer for the cook on screen, and something
 *  has been said on this page: they stay, settled, until it moves on. */
export function answeredHere(m: Model): boolean {
  return m.cook !== null && m.questions === 'open' && answered(m.cook);
}

/** Whether the cook on screen was picked back up after a reload, which a
 *  running cook says on screen: its alarm died with the old page. */
export function pickedUpAfterReload(m: Model): boolean {
  return m.questions === 'away' || (m.reloaded && !answeredHere(m));
}

/** What the questions need of the page: an answer stepped into the cook
 *  (cook.ts), and whether it was taken - not if the egg is final, or the
 *  question was answered already; and a probe reading, scored and stepped
 *  in by `update` (model.ts). */
export interface FeedbackHost {
  answer(yolk: YolkWord | null, white: WhiteReport | null, probe: ProbeReading | null): boolean;
  probe(reading_C: number | null): void;
}

let host: FeedbackHost | null = null;

/** Mark which answer of a row was given, and put the row out of reach. The
 *  pressed button stays legible - it is the record of what was said. */
function settleRow(selector: string, pressed: HTMLButtonElement): void {
  const buttons = page().feedback.querySelectorAll<HTMLButtonElement>(selector);
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].disabled = true;
    buttons[i].setAttribute('aria-pressed', buttons[i] === pressed ? 'true' : 'false');
  }
}

/** Both rows and the probe back to empty, for the next egg. */
export function resetFeedback(): void {
  const buttons = page().feedback.querySelectorAll<HTMLButtonElement>('button.fb, button.wb');
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].disabled = false;
    buttons[i].removeAttribute('aria-pressed');
  }
  page().probeReading.value = '';
  page().probeReading.disabled = false;
  disableSteppers(page().probeReading, false);
  page().probeSave.disabled = false;
  page().probeNote.textContent = '';
}

/**
 * One answer, about the yolk or the white, in whichever order they come: the
 * first writes the egg down and folds it, a later one folds it again with
 * both (calibration.ts, `keepRecord`), so the order they were tapped in
 * changes nothing. One given before the egg's record can be made waits in
 * the cook's log until it can. The readout is left describing the egg that
 * was eaten; the recalibrated model shows up on the next "Start again".
 */
function onAnswer(yolk: YolkWord | null, white: WhiteReport | null, pressed: HTMLButtonElement): void {
  const cook = state.cook;
  if (host === null || cook === null) return;
  const said = answersOf(cook);
  if ((yolk !== null && said.yolkWord !== null) || (white !== null && said.white !== null)) return;
  if (!host.answer(yolk, white, null)) return;
  settleRow(yolk !== null ? 'button.fb' : 'button.wb', pressed);
  page().calibNote.textContent = t('feedback.learning');
}

/* ------------------------------------------------------------ thermometer */

/**
 * What the screen shows of the cook it was cooked for (running-cook review
 * 2.4): the level, the peak yolk, whether the cooling ends at the peak (so a
 * probe reading is asked for), and the model's parameters the egg is drawn
 * with and a reading is bounded by. Once the egg is out, the plan as it ran
 * (`asRanShown`), kept with the cook, so neither a reload, a surface landing
 * nor this egg's own answer folded moves "You asked for"; until then, or
 * with no surface yet, the plan as it is, on the calibration as it stands
 * (`params` null).
 */
export interface CookShown {
  level: number;
  peakYolk_C: number;
  probeMoment: boolean;
  params: ModelParams | null;
}

export function cookShown(cook: RunningCook | null, plan: CookPlan | null): CookShown | null {
  if (cook === null || plan === null) return null;
  const ran = asRanShown(cook, plan);
  if (ran !== null) {
    return { level: ran.level, peakYolk_C: ran.peakYolk_C, probeMoment: ran.probeMoment, params: ran.params };
  }
  return { level: plan.answer.level, peakYolk_C: plan.solution.result.peakYolk_C, probeMoment: plan.probeMoment, params: null };
}

/** Whether this cook will ask for a probe reading when its cooling ends - the
 *  "have the probe ready" line and the spoken prompt: `probeOn` is the
 *  cook's setting. The field itself is there whatever the setting
 *  (`probeOffered`). */
export function probeWanted(probeOn: boolean, shown: CookShown | null): boolean {
  return probeOn && shown !== null && shown.probeMoment;
}

/** Whether the probe is asked for NOW: the egg is done, and no reading yet. */
export function probePending(m: Model, phase: Phase, wanted: boolean): boolean {
  const cook = m.cook;
  return phase === 'DONE' && wanted && m.questions === 'open' && (cook === null || answersOf(cook).probe === null);
}

/**
 * A reading typed at DONE, in the cook's units, handed to the cook: scored
 * and stepped in by `update` (model.ts), which says whether it was refused
 * (`probeRefused`) or taken (`probeTaken`). When the egg's record cannot be
 * made yet (no surface), the reading stays in its field and is read again
 * when a surface lands (`retryProbe`).
 */
function onProbeSave(): void {
  const cooked = state.cook;
  if (host === null || cooked === null || page().probeReading.disabled) return;
  if (answersOf(cooked).probe !== null) return;
  const typed = page().probeReading.value.trim();
  if (typed === '') return;
  host.probe(parse(measure('probeTemp'), Number(typed)));
}

/** A reading refused: the range it should be in, said under it. */
export function probeRefused(low_C: number, high_C: number): void {
  page().probeNote.textContent = t('probe.refused', { low: show('probeTemp', low_C), high: show('probeTemp', high_C) });
}

/** A reading taken: the field settles on it. */
export function probeTaken(reading_C: number): void {
  page().probeReading.disabled = true;
  disableSteppers(page().probeReading, true);
  page().probeSave.disabled = true;
  page().probeNote.textContent = show('probeTemp', reading_C);
  page().calibNote.textContent = t('feedback.learning');
}

/** A surface landed: a reading held for want of the egg's record is read
 *  again. */
export function retryProbe(): void {
  if (state.probeHeld) onProbeSave();
}

/** Wire both rows of answers and the probe's entry. Once, at boot. */
export function wireFeedback(h: FeedbackHost): void {
  host = h;
  // Whole degrees, in the units on screen when pressed.
  setStepRule(page().probeReading, (value, up) => stepPast(measure('probeTemp'), value, up));
  page().probeSave.addEventListener('click', onProbeSave);
  page().probeReading.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') onProbeSave();
  });

  const fbButtons = page().feedback.querySelectorAll<HTMLButtonElement>('button.fb');
  for (let i = 0; i < fbButtons.length; i++) {
    fbButtons[i].addEventListener('click', () => {
      const raw = fbButtons[i].dataset['yolk'];
      const word = YOLK_WORDS.find((w) => w === raw);
      if (word !== undefined) onAnswer(word, null, fbButtons[i]);
    });
  }

  const whiteButtons = page().feedback.querySelectorAll<HTMLButtonElement>('button.wb');
  for (let i = 0; i < whiteButtons.length; i++) {
    whiteButtons[i].addEventListener('click', () => {
      const raw = whiteButtons[i].dataset['white'];
      const white: WhiteReport = raw === 'runny' ? 'runny' : raw === 'tender' ? 'tender' : 'firm';
      onAnswer(null, white, whiteButtons[i]);
    });
  }
}
