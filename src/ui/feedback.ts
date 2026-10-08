/**
 * The questions at DONE - which yolk the cook got, in the slider's own five
 * words, and how the white next to it was (DECISIONS.md 92) - and under them
 * the probe reading: what has been said about the egg on screen, and writing
 * it down for the calibration to learn from.
 *
 * The model is calibrated against the literature, not against this kitchen.
 * Asking once per egg is what closes that gap.
 */

import { Phase, anchorNear, plausibleProbeRange_C } from '../core/policy.js';
import { CookPlan, RunningCook } from '../core/running.js';
import { midSentence } from '../core/copy.js';
import { WhiteReport, YOLK_WORDS, YolkWord } from '../core/infer.js';
import { ProbeReading, probeReadingFor, recordCookTime_s } from '../core/record.js';
import { nudgeFrom, parse, stepPast } from '../core/units.js';
import {
  Calibration, calibrationParams, eggLogged, learn, logEgg, recordSecondAnswer,
} from './calibration.js';
import { eggRecordFor } from './eggRecord.js';
import { activeLocale, t } from './copy.js';
import { page } from './dom.js';
import { disableSteppers, setStepRule } from './stepper.js';
import { KeptAnswers } from './store.js';
import { measure, show } from './units.js';

/**
 * What has been said about the egg on screen, and on which page:
 *
 * - `none`: nothing yet. `reloaded` is whether the cook was picked back up
 *   after a reload, which a running cook says on screen: its alarm died with
 *   the old page. It is read only before DONE, and nothing can be answered
 *   before DONE, so the other two states have no need of it.
 * - `live`: answered on this page - which of the two questions, whether a
 *   probe reading has been taken, and the egg's place in the log, which
 *   the first answer wrote it to. A later answer is folded into the same egg.
 * - `beforeReload`: answered on a page before this one. The egg is in the
 *   log, and the rest of the questions are not offered again, because the
 *   surface their answers would be folded against is gone (see
 *   `recordSecondAnswer`). An unanswered question stays a skip in the record.
 *
 * Persisted with the cook (`keptAnswers`), so a reload neither asks again nor
 * logs the egg a second time as unanswered.
 */
export type Answers =
  | { kind: 'none'; reloaded: boolean }
  | {
    kind: 'live';
    yolk: YolkWord | null; white: WhiteReport | null; probe: ProbeReading | null; index: number;
  }
  | { kind: 'beforeReload' };

let answers: Answers = { kind: 'none', reloaded: false };

/** What has been said about the egg on screen. */
export function answersNow(): Readonly<Answers> {
  return answers;
}

/** What to write down with the cook: whether the egg is in the log. An egg
 *  answered on this page is written as what a reload will make it. */
export function keptAnswers(): KeptAnswers {
  return answers.kind === 'none' ? 'none' : 'beforeReload';
}

/** A cook picked back up after a reload, with what was written down with it. */
export function resumeAnswers(kept: KeptAnswers): void {
  answers = kept === 'none' ? { kind: 'none', reloaded: true } : { kind: 'beforeReload' };
}

/** Whether the cook on screen was picked back up after a reload. */
export function pickedUpAfterReload(): boolean {
  return answers.kind === 'beforeReload' || (answers.kind === 'none' && answers.reloaded);
}

/** Nothing said, on a cook of this page's own, and both rows and the probe
 *  back to empty: for the next egg. */
export function forgetAnswers(): void {
  answers = { kind: 'none', reloaded: false };
  resetRows();
  resetProbe();
}

/** What the questions need of the cook on screen, read when they need it: a
 *  fold lands seconds later, when the cook may have moved on. */
export interface FeedbackHost {
  /** The running cook and its plan, null while idle. */
  cook(): RunningCook | null;
  plan(): CookPlan | null;
  /** The phase of the cook on screen now. */
  phase(): Phase;
  calib(): Calibration;
  /** Write the cook down (`persistCook`). */
  persist(): void;
  /** Redraw what has been learned, once a fold lands. */
  learned(): void;
  /** Redraw the cook's screen: the questions go when no more can be taken. */
  redraw(): void;
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

/** Both rows back to unanswered, for the next egg. */
function resetRows(): void {
  const buttons = page().feedback.querySelectorAll<HTMLButtonElement>('button.fb, button.wb');
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].disabled = false;
    buttons[i].removeAttribute('aria-pressed');
  }
}

/**
 * One answer, about the yolk or the white, in whichever order they come.
 *
 * The first answer writes the egg down - before anything is learned from it,
 * so a reload during the fold refolds it on load rather than losing it - and
 * folds it: a couple of seconds, for the dose surface, built in a worker. The
 * second is folded into the SAME egg, from the posterior as it stood before it
 * (`recordSecondAnswer`), so the order they were tapped in changes nothing.
 * The readout is left describing the egg that was eaten; the recalibrated model
 * shows up on the next "Start again".
 */
function onAnswer(yolk: YolkWord | null, white: WhiteReport | null, pressed: HTMLButtonElement): void {
  const a = answers;
  if (a.kind === 'live' && ((yolk !== null && a.yolk !== null) || (white !== null && a.white !== null))) return;
  if (host === null || host.cook() === null) return;
  settleRow(yolk !== null ? 'button.fb' : 'button.wb', pressed);
  foldAnswer(yolk, white, null);
}

/** Write the egg down with its first answer, or fold a later one into it -
 *  a yolk, a white or a probe reading, whichever came. */
function foldAnswer(yolk: YolkWord | null, white: WhiteReport | null, probe: ProbeReading | null): void {
  const h = host;
  const cooked = h === null ? null : h.cook();
  const plan = h === null ? null : h.plan();
  if (h === null || cooked === null || plan === null) return;
  page().calibNote.textContent = t('feedback.learning');
  const cookStarted = cooked.id_ms;
  const stillHere = (): boolean => h.phase() === 'DONE' && h.cook()?.id_ms === cookStarted;
  const thanks = (): void => {
    if (stillHere()) page().calibNote.textContent = t('feedback.thanks');
    h.learned();
  };

  // An answer that could not be kept is not thanked for: the questions go,
  // as they do after a reload, since no more could be kept either.
  const taken = (kept: boolean): void => {
    if (kept) {
      thanks();
      return;
    }
    if (stillHere()) {
      answers = { kind: 'beforeReload' };
      h.persist();
      h.redraw();
    }
    h.learned();
  };
  const second = yolk !== null ? { yolkWord: yolk } : white !== null ? { white: white }
    : probe !== null ? { probe: probe } : {};

  const a = answers;
  if (a.kind !== 'live') {
    const record = eggRecordFor(cooked, plan, yolk, white, probe);
    // Refused (`cookFactsFor`): nothing says yet what the app said for this
    // egg. The answer is not taken, and the row can be pressed again.
    if (record === null) {
      page().calibNote.textContent = '';
      resetRows();
      return;
    }
    // Another tab showing this cook may have written it down first: then
    // this is a later answer to that egg, not a second egg.
    const earlier = eggLogged(record.id ?? null);
    const index = earlier >= 0 ? earlier : logEgg(record);
    answers = { kind: 'live', yolk: yolk, white: white, probe: probe, index: index };
    // Written down with the log, not after the fold: a reload between the two
    // would otherwise offer the questions again, and log the egg twice.
    h.persist();
    if (earlier >= 0) {
      void recordSecondAnswer(index, second).then(taken);
      return;
    }
    // The surface is built in a worker, so the page stays live while it is -
    // which means the cook can have moved on by the time it lands.
    void learn(index).then(thanks);
    return;
  }
  if (yolk !== null) a.yolk = yolk;
  if (white !== null) a.white = white;
  if (probe !== null) a.probe = probe;
  void recordSecondAnswer(a.index, second).then(taken);
}

/** The cook on screen was answered about in another tab, which wrote its egg
 *  down: nothing is asked here any more, as after a reload, and "Start
 *  again" logs nothing more. Only before anything is said here. */
export function answeredElsewhere(): boolean {
  if (answers.kind !== 'none') return false;
  answers = { kind: 'beforeReload' };
  return true;
}

/* ------------------------------------------------------------ thermometer */

/** Whether this cook will ask for a probe reading when its cooling ends - the
 *  "have the probe ready" line and the spoken prompt: `probeOn` is the
 *  cook's setting. The field itself is there whatever the setting
 *  (`probeOffered`). */
export function probeWanted(probeOn: boolean, plan: CookPlan | null): boolean {
  return probeOn && plan !== null && plan.probeMoment;
}

/** Whether the probe is asked for NOW: the egg is done, and no reading yet. */
export function probePending(phase: Phase, wanted: boolean): boolean {
  const a = answers;
  return phase === 'DONE' && wanted && (a.kind === 'none' || (a.kind === 'live' && a.probe === null));
}

/** Whether the reading's field is under the questions: whenever the cook has
 *  a moment to probe, the cooling having ended at the yolk's peak, with the
 *  probe setting on or off (DECISIONS.md 92). It is optional, like them. */
function probeOffered(plan: CookPlan | null): boolean {
  return plan !== null && plan.probeMoment;
}

/** The reading's field at DONE, under the two questions, whenever this cook
 *  had a moment to probe; it shows what was given once it is. */
export function renderProbe(phase: Phase, plan: CookPlan | null): void {
  const visible = phase === 'DONE' && probeOffered(plan);
  page().probeEntry.hidden = !visible;
  // The − and + start from the peak of the cook that ran, shown greyed in
  // the empty field: a suggestion, never taken as a reading until stepped or
  // typed. Plain digits, as the field holds them.
  if (visible && plan !== null) {
    page().probeReading.placeholder = String(nudgeFrom(measure('probeTemp'), plan.solution.result.peakYolk_C));
  }
}

/** What the cook on screen was cooked for, over the yolk question, so the
 *  answer is graded against it: "You asked for: jammy, peak yolk 65 °C".
 *  From the plan - the level the cook ran at, and the peak of the time that
 *  ran - never the slider now. */
export function renderTarget(plan: CookPlan | null): void {
  page().feedbackTarget.hidden = plan === null;
  if (plan === null) return;
  page().feedbackTarget.textContent = t('feedback.target', {
    doneness: midSentence(t(anchorNear(plan.level).key), activeLocale()),
    yolk: show('temperature', plan.solution.result.peakYolk_C),
  });
}

/**
 * A reading typed at DONE, in the cook's units. Refused, with the range it
 * should be in, when no believable kitchen could have made it for this cook
 * (`plausibleProbeRange_C`); otherwise folded into the egg with whatever else
 * has been said about it, one fold per egg.
 */
function onProbeSave(): void {
  const cooked = host === null ? null : host.cook();
  const plan = host === null ? null : host.plan();
  if (host === null || cooked === null || plan === null || page().probeReading.disabled) return;
  if (answers.kind === 'live' && answers.probe !== null) return;
  const typed = page().probeReading.value.trim();
  if (typed === '') return;
  const reading_C = parse(measure('probeTemp'), Number(typed));
  const record = eggRecordFor(cooked, plan, null);
  // Refused (`cookFactsFor`): not scored until the egg can be recorded.
  if (record === null) return;
  const [low, high] = plausibleProbeRange_C(
    plan.egg, plan.setup, calibrationParams(host.calib()), recordCookTime_s(record),
  );
  if (reading_C === null || reading_C < low || reading_C > high) {
    page().probeNote.textContent = t('probe.refused', {
      low: show('probeTemp', low), high: show('probeTemp', high),
    });
    return;
  }
  // When it was asked for: the end of the counted cooling, from the moment
  // the record scores as the pull.
  const coolEnd = plan.deadlines.coolEnd_s;
  const probe = probeReadingFor(record, reading_C, coolEnd !== null ? coolEnd - cooked.startedAt_s : null);
  page().probeReading.disabled = true;
  disableSteppers(page().probeReading, true);
  page().probeSave.disabled = true;
  page().probeNote.textContent = show('probeTemp', reading_C);
  foldAnswer(null, null, probe);
}

/** Back to empty, for the next egg. */
function resetProbe(): void {
  page().probeReading.value = '';
  page().probeReading.disabled = false;
  disableSteppers(page().probeReading, false);
  page().probeSave.disabled = false;
  page().probeNote.textContent = '';
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
