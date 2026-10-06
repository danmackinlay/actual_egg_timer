/**
 * Drawing the egg page from the state: the controls' answer while idle (the
 * readout, the direction, the slider's shading, the advice and the welcome),
 * the cook under way otherwise (the readout and the egg in cross-section),
 * the sous-vide screen, and the mute and the version.
 *
 * Nothing here solves or saves; the one thing it asks for is the odds of the
 * changes the advice prices, which land through answer.ts.
 */

import { SOUS_VIDE_BATH_C, sousVideEstimate } from '../core/sousvide.js';
import { Solution } from '../core/solve.js';
import { textureFor, textureNoteKeys } from '../core/policy.js';
import { decisionInputs } from '../core/decide.js';
import { OddsProfile, pricedChanges, protocolAdvice } from '../core/reach.js';
import { Outcome } from '../core/outcome.js';
import { directionKey, whiteAtRisk } from '../core/wording.js';
import { midSentence } from '../core/copy.js';
import { EggSection, advanceSection, createSection, sectionView } from '../core/section.js';
import { CARRYOVER_WINDOW } from '../core/constants.js';
import { askForProfile, currentInputs } from './answer.js';
import { calibrationDoneness, calibrationParams } from './calibration.js';
import { cachedOddsProfile } from './decisionGrids.js';
import { activeLocale, t } from './copy.js';
import { page } from './dom.js';
import { buildEggSection, paintEggSection, readPalette, ringFills } from './eggSection.js';
import {
  answersNow, pickedUpAfterReload, probePending, probeWanted, renderProbe, renderTarget,
} from './feedback.js';
import { showInfo } from './info.js';
import { renderCalibNote } from './learned.js';
import { phaseView } from './phaseView.js';
import { liveSetupFacts, renderCookSetup, renderSentence } from './sentence.js';
import { shareState } from './share.js';
import { renderBareScale, renderDonenessReading, renderDonenessScale } from './slider.js';
import { sousVideCopy } from './sousvide.js';
import {
  boilingPoint_C, currentEgg, isSousVide, learning, massFrom, sizeClasses, startModeNow, state, timeToBoil_s,
} from './state.js';
import { estimateTimeToBoil, hasBoilMemory } from './store.js';
import { Ticket } from './ticket.js';
import { show } from './units.js';
import { APP_VERSION } from './version.js';

/** What was last drawn, so the page draws only what changed. */
const drawn = {
  /** The readout's height, px, the last time it was drawn idle with a decision
   *  in: what it holds while the next one is on its way (`renderOdds`). */
  readout_px: 0,
  /** The live region's last announcement, by phase and minute. */
  announced: '',
  /** The advice's keys, as listed. */
  advice: '',
  /** The egg in cross-section under the running cook (src/core/section.ts),
   *  carried forward each tick, and the ticket it was started from: a new
   *  ticket - a start, a boil tapped, a slow hob, a reload - replays it from
   *  t = 0, since the water it has been in has changed. */
  section: null as EggSection | null,
  sectionTicket: null as Ticket | null,
};

/** The words drawn only when they change, to be drawn again: a new
 *  language (`relabel`). */
export function forgetDrawnWords(): void {
  drawn.advice = '';
  drawn.announced = '';
}

/** The texture note. Which band the egg falls in, and which keys say it, are
 *  core policy - including that a white the pan never sets is runny. */
function textureNote(sol: Solution): string {
  const note = textureNoteKeys(textureFor(sol.result.peakYolk_C, sol.result.peakWhite_C, sol.whiteSets));
  const parts: Record<string, string> = {};
  for (const [name, key] of Object.entries(note.parts)) parts[name] = t(key);
  return t(note.key, parts);
}

/** The way to Help under low odds (reach.ts): a link, shown while idle when
 *  the odds at the level on screen are under 5/10 or 3/10 short of the best
 *  level's. It opens Help at its reliability section, whose top lists the
 *  changes that would help this setup: the model prices a counter rest and
 *  the heat off from their own pots' profiles, asked for here and shown when
 *  they land; the fridge and the scale it cannot price. */
function renderAdvice(): void {
  const chosen = state.chosen;
  let keys: string[] = [];
  const wanted = state.machine.phase === 'IDLE' && !isSousVide() && chosen !== null && chosen.adviceWanted;
  if (wanted && chosen !== null) {
    const inputs = currentInputs(timeToBoil_s());
    const priced: { key: string; profile: OddsProfile }[] = [];
    for (const change of pricedChanges(inputs.setup)) {
      const changed = decisionInputs(state.calib, inputs.egg, change.setup);
      const p = cachedOddsProfile(changed, state.calib);
      if (p === null) askForProfile(changed);
      else priced.push({ key: change.key, profile: p });
    }
    keys = protocolAdvice(
      inputs.setup, { eggFromClass: massFrom() === 'class', startAssumed: state.settings.startTempMode === 'room' },
      chosen.level, chosen.decision.odds, priced,
    );
  }
  page().advice.hidden = !wanted;
  page().forYou.hidden = keys.length === 0;
  const shown = keys.join(' ');
  if (shown === drawn.advice) return;
  drawn.advice = shown;
  page().adviceList.replaceChildren(...keys.map((key) => {
    const li = document.createElement('li');
    li.textContent = t(key);
    return li;
  }));
}

export function renderMute(): void {
  page().mute.textContent = t(state.settings.muted ? 'readout.mute.off' : 'readout.mute.on');
  page().mute.setAttribute('aria-pressed', state.settings.muted ? 'true' : 'false');
}

function setPrimary(label: string, hint: string, visible: boolean): void {
  page().primary.textContent = label;
  page().primary.hidden = !visible;
  // Enabled unless the caller says otherwise, so a disabled Start cannot leak
  // into the next phase's button.
  page().primary.disabled = false;
  page().primaryHintText.textContent = hint;
}

/** The one longer line under the egg while idle (UI.md section 3): a refusal
 *  if there is one, and otherwise, before anything has been learned, a
 *  welcome. The way to Help under low odds is a short link, and goes under
 *  either. */
function renderWelcome(warning: string): void {
  page().welcome.hidden = !(state.machine.phase === 'IDLE' && !isSousVide() && warning === ''
    && state.calib.eggsLogged === 0 && !hasBoilMemory(state.boilMemory));
}

/** Draw the screen: the controls and the answer they give while idle, and
 *  the cook under way otherwise. The 200 ms ticker only ever draws a cook
 *  under way, so it never repaints the controls, which are put away beneath
 *  it (styles.css) and drawn again when the cook ends. */
export function render(now_ms: number): void {
  renderLearning();
  if (state.machine.phase === 'IDLE') renderIdle(now_ms);
  else renderRunning(now_ms);
}

/** The Learning mark (E8, DECISIONS.md 58): on the time while sharing is
 *  on, since the time may then be nudged - and never in sous-vide, which has
 *  no time to nudge. */
function renderLearning(): void {
  const on = shareState().on && !(state.machine.phase === 'IDLE' && isSousVide());
  page().learning.hidden = !on;
  showInfo(page().learningInfo, on);
}

/** The controls, and the answer they give. */
function renderIdle(now_ms: number): void {
  // Sous-vide is answered honestly and separately: no cook to run, no clock to
  // start, and a start time that has already been and gone. It goes FIRST,
  // before any of the pan readout is computed or painted, so it neither pays
  // for a hot-start solve it would discard nor leaves half of that answer on
  // screen beside its own.
  renderSentence(liveSetupFacts(state.settings, sizeClasses, currentEgg()));
  renderCookSetup(null, state.machine.targetLevel, sizeClasses);
  if (isSousVide()) {
    renderSousVide(now_ms);
    return;
  }

  const sol = state.solution;
  if (sol === null) return;

  page().statBoil.textContent = show('boilingPoint', boilingPoint_C());
  page().note.textContent = textureNote(sol);
  // The warning line carries a refusal or the level's low odds while idle.
  // It is advice about the slider: popping "jammy isn't reachable" onto the
  // screen while the egg is already in the water would be advice about a
  // control the user cannot reach.
  const warning = state.idleWarning;
  renderDonenessReading(state.settings.doneness, { peakYolk_C: sol.result.peakYolk_C });
  renderDonenessScale(sol, sol.whiteSets ? state.profile : null, sol.whiteSets ? state.outcome : null);
  renderReadout(now_ms, sol, warning);
  // "Based on history" has an (i) that says what history.
  showInfo(page().sublineInfo, state.settings.startMode === 'cold' && hasBoilMemory(state.boilMemory));
  renderOdds();
  renderAdvice();
  renderWelcome(warning);
}

/** The cook under way, five times a second: the readout, and nothing of the
 *  controls. */
function renderRunning(now_ms: number): void {
  renderCookSetup(state.ticket, state.machine.targetLevel, sizeClasses);
  const sol = state.solution;
  if (sol === null) return;
  // The warning line carries a restored cook's warning while it runs - the
  // opposite of a refusal, it only exists mid-cook. Only while the cook is
  // still in flight: at DONE the egg is out and "keep this tab open" is
  // advice about a deadline that has already passed.
  const warning = pickedUpAfterReload() && state.machine.phase !== 'DONE' ? t('readout.restored') : '';
  renderReadout(now_ms, sol, warning);
  renderSection(now_ms);
  showInfo(page().sublineInfo, false);
  renderOdds();
  renderAdvice();
  page().welcome.hidden = true;
}

/** The egg in cross-section, as it is now: carried forward to the clock, in
 *  the water until the cook said it was out (or the grace ran out), and on
 *  through the carryover after. At the posterior mean, the same egg the
 *  countdown times. */
function renderSection(now_ms: number): void {
  const k = state.ticket;
  if (k === null) return;
  const machine = state.machine;
  const params = calibrationParams(state.calib);
  if (drawn.section === null || drawn.sectionTicket !== k) {
    drawn.section = createSection(k.egg, k.setup, params);
    drawn.sectionTicket = k;
    buildEggSection(page().eggSection, drawn.section.outer);
  }
  const section = drawn.section;
  const out_s = machine.outAt_ms > 0 ? (machine.outAt_ms - machine.startedAt_ms) / 1000 : null;
  const now_s = (now_ms - machine.startedAt_ms) / 1000;
  advanceSection(
    section, k.egg, k.setup, params,
    out_s === null ? now_s : Math.min(now_s, out_s + CARRYOVER_WINDOW), out_s,
  );
  const view = sectionView(section, calibrationDoneness(state.calib, machine.targetLevel).whiteDose_min);
  paintEggSection(page().eggSection, ringFills(view, readPalette(page().body)));
}

/** The readout, the buttons under it and the questions at DONE, idle or not,
 *  and the warning line with `warning` in it. */
function renderReadout(now_ms: number, sol: Solution, warning: string): void {
  const { settings, machine, ticket } = state;
  page().body.dataset['phase'] = machine.phase;
  page().body.dataset['start'] = startModeNow();
  page().warn.textContent = warning;
  page().warn.hidden = warning === '';

  const wanted = probeWanted(settings.probe, ticket);
  const pending = probePending(machine, wanted);
  const view = phaseView(machine, ticket, now_ms, {
    cookTime_s: sol.result.cookTime_s,
    whiteSets: sol.whiteSets,
    controls: {
      startMode: settings.startMode, afterBoil: settings.afterBoil, cooling: settings.cooling,
      waterLitres: settings.waterLitres, boiling_C: boilingPoint_C(),
      timeToBoil_s: estimateTimeToBoil(state.boilMemory, settings.waterLitres),
    },
    boilKnown: hasBoilMemory(state.boilMemory),
    probeWanted: wanted,
    probePending: pending,
  });
  setPrimary(view.primary ?? '', view.hint, view.primary !== null);
  page().primary.disabled = view.primaryDisabled;
  page().secondary.hidden = !view.secondaryVisible;
  if (view.secondaryVisible) page().secondary.textContent = t('action.cancel');

  // The model is calibrated against the literature, not against this kitchen.
  // Asking once per egg is what closes that gap. Both questions stay on screen
  // until the cook moves on, answered or not; a reload after an answer puts
  // them away, since the second could no longer be folded.
  const said = answersNow().kind;
  page().feedback.hidden = machine.phase !== 'DONE' || said === 'beforeReload';
  if (!page().feedback.hidden && said !== 'live') renderCalibNote(learning());
  renderProbe(machine, ticket);
  if (!page().feedback.hidden) renderTarget(ticket, machine.targetLevel);

  page().phaseLabel.textContent = view.label;
  page().digits.textContent = view.digits;
  page().sublineText.textContent = view.subline;
  // The full rolling boil has an (i) that says what it looks like.
  showInfo(page().hintInfo, machine.phase === 'HEATING');

  // The live region carries a coarse announcement, not a per-second one: the
  // ticking digits are aria-hidden, so a screen reader hears the phase and the
  // minute rather than being flooded once a second.
  const announcement = t('spoken.announcement', { label: view.label, spoken: view.spoken });
  const minute = view.digits.split(':')[0];
  const key = `${machine.phase}|${minute}`;
  if (key !== drawn.announced) {
    drawn.announced = key;
    page().announce.textContent = announcement;
  }
}

/** Which way the egg is likely to miss, and the white's line, under the
 *  time, with one (i) that explains the bracket, how to play safe with it and
 *  what I learn from (src/core/wording.ts). While idle they are the choice on
 *  screen's, and blank until this pot's surface lands - the direction's line
 *  keeps its height, so nothing moves when they arrive. Once a cook is running
 *  the direction and the white's line are what they were at "Eggs in"; the
 *  (i), which is about the slider, goes with the slider. Never where the white
 *  never sets: there is no cook to say anything about.
 *
 *  There is no play-safe suggestion under the direction, and no "still
 *  learning" line: the slider and the bracket already show the one, and "I
 *  can't call it yet" already says the other. What I learn from and what
 *  speeds it up is the last paragraph of the (i). */
function renderOdds(): void {
  let o: Outcome | null = null;
  if (state.machine.phase === 'IDLE') {
    if (state.decision !== null && state.solution !== null && state.solution.whiteSets) o = state.outcome;
  } else if (state.ticket !== null) {
    o = state.ticket.outcome;
  }
  page().directionText.textContent = o === null ? '' : t(directionKey(o));
  page().whiteRisk.hidden = o === null || !whiteAtRisk(o);
  showInfo(page().oddsInfo, state.machine.phase === 'IDLE' && o !== null);

  // While a new pot's surface is on its way the lines above are blank, and
  // the readout would shrink and grow back a second later, moving the
  // sentence's open choice under the thumb that just tapped it. So it keeps
  // the height it had when the lines were last all there. Measured only
  // while idle: reading the height forces a layout, and a running cook, drawn
  // five times a second, has no choice to keep still.
  if (state.machine.phase !== 'IDLE') {
    page().readout.style.minHeight = '';
  } else if (state.decision === null) {
    page().readout.style.minHeight = drawn.readout_px > 0 ? `${drawn.readout_px}px` : '';
  } else {
    page().readout.style.minHeight = '';
    const height = page().readout.offsetHeight;
    if (height > 0) drawn.readout_px = height;
  }
}

/** The sous-vide readout: hold times from the isothermal limit, and the plain
 *  statement that you should have started yesterday. Idle only, after the
 *  sentence (`renderIdle`). */
function renderSousVide(now_ms: number): void {
  // No pan, no choice, and no odds: the bath's answer is not a guess about a
  // pan (the decision chooses pan times). So no direction, and no bracket
  // either.
  page().directionText.textContent = '';
  page().whiteRisk.hidden = true;
  page().readout.style.minHeight = '';
  renderBareScale();
  showInfo(page().oddsInfo, false);
  showInfo(page().sublineInfo, false);
  showInfo(page().hintInfo, false);
  renderAdvice();
  page().body.dataset['phase'] = state.machine.phase;
  page().body.dataset['start'] = state.settings.startMode;

  const egg = currentEgg();
  const doneness = calibrationDoneness(state.calib, state.settings.doneness);
  const est = sousVideEstimate(
    egg.radius_m, calibrationParams(state.calib).alpha_m2s, SOUS_VIDE_BATH_C,
    doneness.yolkDose_min, doneness.whiteDose_min,
  );
  const copy = sousVideCopy(est, now_ms);

  page().phaseLabel.textContent = t('readout.phase.startTime');
  page().digits.textContent = copy.headline;
  page().sublineText.textContent = copy.subline;
  page().statBoil.textContent = show('boilingPoint', boilingPoint_C());
  // The slider's reading is a pan number. There is no pan: the water's
  // temperature is not a peak yolk temperature, and the reading says which
  // number it is.
  renderDonenessReading(state.settings.doneness, { bath_C: est.bath_C });
  page().note.textContent = copy.note;
  page().warn.textContent = copy.warn;
  page().warn.hidden = false;
  page().welcome.hidden = true;
  setPrimary('', copy.hint, false);
  page().secondary.hidden = true;
  page().feedback.hidden = true;

  const key = `SOUS|${copy.headline}`;
  if (key !== drawn.announced) {
    drawn.announced = key;
    page().announce.textContent = t('spoken.sousVide', {
      when: midSentence(copy.headline, activeLocale()), subline: copy.subline,
    });
  }
}

/** The last line of Settings, "Version 0.4.0-alpha.1": the words from the
 *  catalogue, the number in a span of its own, fixed-width, so that the 1750
 *  face never draws its 0 as an o. Selectable, like the random number. */
export function renderVersion(): void {
  const mark = '\u0001';
  const [before = '', after = ''] = t('colophon.version', { version: mark }).split(mark);
  const number = document.createElement('span');
  number.className = 'colophon__number';
  number.translate = false;
  number.textContent = APP_VERSION;
  page().appVersion.replaceChildren(before, number, after);
}
