/**
 * The questions at DONE - how was the yolk, how was the white - and the probe
 * reading (E4): what has been said about the egg on screen, and writing it
 * down for the calibration to learn from.
 *
 * The model is calibrated against the literature, not against this kitchen.
 * Asking once per egg is what closes that gap.
 */

import { plausibleProbeRange_C } from '../core/policy.js';
import { Feedback, WhiteReport } from '../core/infer.js';
import { ProbeReading, recordCookTime_s, recordProbe_C } from '../core/record.js';
import { parse } from '../core/units.js';
import {
  Calibration, calibrationParams, eggRecordFor, learn, logEgg, recordSecondAnswer,
} from './calibration.js';
import { t } from './copy.js';
import { dom } from './dom.js';
import { Machine } from './machine.js';
import { Ticket } from './ticket.js';
import { measure, show } from './units.js';

/** Whether this egg has been written down with an answer. Persisted with the
 *  cook, so a reload neither asks again nor logs the egg a second time as
 *  unanswered. */
let feedbackGiven = false;
/** Which of the two questions have been answered on screen, whether a probe
 *  reading has been taken (E4), and the egg's place in the log once the first
 *  of them has written it down. Not persisted: after a reload the rest are not
 *  offered again, because the surface their answers would be folded against is
 *  gone (see `recordSecondAnswer`). An unanswered question stays a skip in the
 *  record. */
let answered: {
  yolk: Feedback | null; white: WhiteReport | null; probe: ProbeReading | null; index: number;
} | null = null;

/** Whether the egg on screen has been written down with an answer. */
export function eggWrittenDown(): boolean {
  return feedbackGiven;
}

/** Whether it was answered about on a page before this one: the questions are
 *  put away, since a second answer could no longer be folded. */
export function answeredBeforeReload(): boolean {
  return feedbackGiven && answered === null;
}

/** Whether anything has been answered on this page. */
export function answeredHere(): boolean {
  return answered !== null;
}

/** A cook picked back up after a reload: whether it had been written down. */
export function resumeAnswers(given: boolean): void {
  feedbackGiven = given;
  answered = null;
}

/** Nothing said, and both rows and the probe back to empty, for the next
 *  egg. */
export function forgetAnswers(): void {
  feedbackGiven = false;
  answered = null;
  resetRows();
  resetProbe();
}

/** What the questions need of the cook on screen, read when they need it: a
 *  fold lands seconds later, when the cook may have moved on. */
export interface FeedbackHost {
  machine(): Machine;
  ticket(): Ticket | null;
  calib(): Calibration;
  /** Write the cook down (`persistCook`). */
  persist(): void;
  /** Redraw what has been learned, once a fold lands. */
  learned(): void;
}

let host: FeedbackHost | null = null;

/** Mark which answer of a row was given, and put the row out of reach. The
 *  pressed button stays legible - it is the record of what was said. */
function settleRow(selector: string, pressed: HTMLButtonElement): void {
  const buttons = dom.feedback.querySelectorAll<HTMLButtonElement>(selector);
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].disabled = true;
    buttons[i].setAttribute('aria-pressed', buttons[i] === pressed ? 'true' : 'false');
  }
}

/** Both rows back to unanswered, for the next egg. */
function resetRows(): void {
  const buttons = dom.feedback.querySelectorAll<HTMLButtonElement>('button.fb, button.wb');
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
function onAnswer(yolk: Feedback | null, white: WhiteReport | null, pressed: HTMLButtonElement): void {
  if (answered !== null && ((yolk !== null && answered.yolk !== null)
    || (white !== null && answered.white !== null))) return;
  if (host === null || host.ticket() === null) return;
  settleRow(yolk !== null ? 'button.fb' : 'button.wb', pressed);
  foldAnswer(yolk, white, null);
}

/** Write the egg down with its first answer, or fold a later one into it -
 *  a yolk, a white or a probe reading, whichever came. */
function foldAnswer(yolk: Feedback | null, white: WhiteReport | null, probe: ProbeReading | null): void {
  const h = host;
  const cooked = h === null ? null : h.ticket();
  if (h === null || cooked === null) return;
  dom.calibNote.textContent = t('feedback.learning');
  const machine = h.machine();
  const cookStarted = machine.startedAt_ms;
  const stillHere = (): boolean => {
    const now = h.machine();
    return now.phase === 'DONE' && now.startedAt_ms === cookStarted;
  };
  const thanks = (): void => {
    if (stillHere()) dom.calibNote.textContent = t('feedback.thanks');
    h.learned();
  };

  if (answered === null) {
    const index = logEgg(eggRecordFor(cooked, machine, yolk, white, probe));
    answered = { yolk: yolk, white: white, probe: probe, index: index };
    feedbackGiven = true;
    // Written down with the log, not after the fold: a reload between the two
    // would otherwise offer the questions again, and log the egg twice.
    h.persist();
    // The surface is built in a worker, so the page stays live while it is -
    // which means the cook can have moved on by the time it lands.
    void learn(index).then(thanks);
    return;
  }
  if (yolk !== null) answered.yolk = yolk;
  if (white !== null) answered.white = white;
  if (probe !== null) answered.probe = probe;
  const second = yolk !== null ? { yolk: yolk } : white !== null ? { white: white }
    : probe !== null ? { probe: probe } : {};
  void recordSecondAnswer(answered.index, second).then(thanks);
}

/* ------------------------------------------------------------ thermometer */

/** Whether this cook will ask for a probe reading when its cooling ends:
 *  `probeOn` is the cook's setting. */
export function probeWanted(probeOn: boolean, ticket: Ticket | null): boolean {
  return probeOn && ticket !== null && ticket.probeMoment;
}

/** Whether the probe is asked for NOW: the egg is done, and no reading yet. */
export function probePending(machine: Machine, wanted: boolean): boolean {
  return machine.phase === 'DONE' && wanted && !answeredBeforeReload()
    && (answered === null || answered.probe === null);
}

/** The once-only offer during a cook, and the reading at DONE. `offerOpen`
 *  is whether the offer has yet to be answered. */
export function renderProbe(
  machine: Machine, ticket: Ticket | null, offerOpen: boolean, pending: boolean,
): void {
  const running = machine.phase === 'HEATING' || machine.phase === 'COOKING'
    || machine.phase === 'PULL' || machine.phase === 'COOLING';
  dom.probeOffer.hidden = !(running && offerOpen && ticket !== null && ticket.probeMoment);
  // Asked for until it is given, and left showing what was given.
  const visible = pending || (machine.phase === 'DONE' && dom.probeReading.disabled);
  dom.probeEntry.hidden = !visible;
}

/**
 * A reading typed at DONE, in the cook's units. Refused, with the range it
 * should be in, when no believable kitchen could have made it for this cook
 * (`plausibleProbeRange_C`); otherwise folded into the egg with whatever else
 * has been said about it, one fold per egg.
 */
function onProbeSave(): void {
  const cooked = host === null ? null : host.ticket();
  if (host === null || cooked === null || dom.probeReading.disabled) return;
  if (answered !== null && answered.probe !== null) return;
  const typed = dom.probeReading.value.trim();
  if (typed === '') return;
  const machine = host.machine();
  const reading_C = parse(measure('probeTemp'), Number(typed));
  const scoredAt_s = recordCookTime_s(eggRecordFor(cooked, machine, null));
  const [low, high] = plausibleProbeRange_C(
    cooked.egg, cooked.setup, calibrationParams(host.calib()), scoredAt_s,
  );
  if (reading_C === null || reading_C < low || reading_C > high) {
    dom.probeNote.textContent = t('probe.refused', {
      low: show('probeTemp', low), high: show('probeTemp', high),
    });
    return;
  }
  // When it was asked for: the end of the counted cooling, from the moment
  // the record scores as the pull.
  const asked_s = (machine.coolEnd_ms - machine.startedAt_ms) / 1000 - scoredAt_s;
  const probe: ProbeReading = {
    centre_C: recordProbe_C(reading_C),
    after_s: machine.coolEnd_ms > 0 && asked_s >= 0 ? asked_s : null,
  };
  dom.probeReading.disabled = true;
  dom.probeSave.disabled = true;
  dom.probeNote.textContent = show('probeTemp', reading_C);
  foldAnswer(null, null, probe);
}

/** Back to empty, for the next egg. */
function resetProbe(): void {
  dom.probeReading.value = '';
  dom.probeReading.disabled = false;
  dom.probeSave.disabled = false;
  dom.probeNote.textContent = '';
}

/** Wire both rows of answers and the probe's entry. Once, at boot. */
export function wireFeedback(h: FeedbackHost): void {
  host = h;
  dom.probeSave.addEventListener('click', onProbeSave);
  dom.probeReading.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') onProbeSave();
  });

  const fbButtons = dom.feedback.querySelectorAll<HTMLButtonElement>('button.fb');
  for (let i = 0; i < fbButtons.length; i++) {
    fbButtons[i].addEventListener('click', () => {
      const raw = Number(fbButtons[i].dataset['fb']);
      onAnswer((raw === -1 ? -1 : raw === 1 ? 1 : 0) as Feedback, null, fbButtons[i]);
    });
  }

  const whiteButtons = dom.feedback.querySelectorAll<HTMLButtonElement>('button.wb');
  for (let i = 0; i < whiteButtons.length; i++) {
    whiteButtons[i].addEventListener('click', () => {
      const raw = whiteButtons[i].dataset['white'];
      const white: WhiteReport = raw === 'runny' ? 'runny' : raw === 'tender' ? 'tender' : 'firm';
      onAnswer(null, white, whiteButtons[i]);
    });
  }
}
