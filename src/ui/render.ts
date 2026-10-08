/**
 * Drawing the egg page from the state: the controls' answer while idle (the
 * readout, how sure I am, the slider's shading, the advice and the welcome),
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
import { CertaintyReading } from '../core/certainty.js';
import {
  WordsRef, certaintyKey, intervalWords, mostLikelyOpened, mostLikelyShown, mostLikelyWords, whiteAtRisk,
} from '../core/wording.js';
import { midSentence } from '../core/copy.js';
import { EggSection, advanceSection, createSection, sectionView } from '../core/section.js';
import { CARRYOVER_WINDOW } from '../core/constants.js';
import { askForProfile, currentInputs } from './answer.js';
import { calibrationDoneness, calibrationParams } from './calibration.js';
import { cachedOddsProfile } from './decisionGrids.js';
import { activeLocale, t } from './copy.js';
import { formatClock } from './countdown.js';
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
  boilingPoint_C, currentEgg, isSousVide, learning, massFrom, phaseNow, sizeClasses, startModeNow, state,
  timeToBoil_s,
} from './state.js';
import { estimateTimeToBoil, hasBoilMemory } from './store.js';
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
   *  carried forward each tick, and the cook, egg and pot it was started
   *  from: a new one - a start, a boil tapped, a slow hob, a reload - replays
   *  it from t = 0, since the water it has been in has changed. */
  section: null as EggSection | null,
  sectionFor: '',
  /** What the running cook's certainty line and white's line last said, and
   *  for which cook: held while a new pot's surface is on its way (the boil
   *  tapped), rather than blanking. */
  outcome: null as Outcome | null,
  certainty: null as CertaintyReading | null,
  outcomeFor: 0,
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

/** The way to Help (reach.ts, "when to advise"): a link, shown while idle
 *  when the word asked is a wild guess and a change the model can price
 *  makes it surer. It opens Help at its reliability section, whose top
 *  lists what would help this setup: the model prices a counter rest and
 *  the heat off from their own pots' profiles, asked for here and shown when
 *  they land, so the link comes when they do; the fridge and the scale it
 *  cannot price, and they are listed under a wild guess whether the link
 *  shows or not. */
function renderAdvice(): void {
  const chosen = state.chosen;
  let keys: string[] = [];
  let surer = false;
  const wanted = state.cook === null && !isSousVide() && chosen !== null && chosen.adviceWanted;
  if (wanted && chosen !== null) {
    const inputs = currentInputs(timeToBoil_s());
    const priced: { key: string; profile: OddsProfile }[] = [];
    for (const change of pricedChanges(inputs.setup)) {
      const changed = decisionInputs(state.calib, inputs.egg, change.setup);
      const p = cachedOddsProfile(changed, state.calib);
      if (p === null) askForProfile(changed);
      else priced.push({ key: change.key, profile: p });
    }
    const advice = protocolAdvice(
      inputs.setup, { eggFromClass: massFrom() === 'class', startAssumed: state.settings.startTempMode === 'room' },
      chosen.level, chosen.certainty.words.pAsked, priced,
    );
    keys = advice.keys;
    surer = advice.surer;
  }
  page().advice.hidden = !(wanted && surer);
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
 *  welcome. The way to Help under a wild guess is a short link, and goes
 *  under either. */
function renderWelcome(warning: string): void {
  page().welcome.hidden = !(state.cook === null && !isSousVide() && warning === ''
    && state.calib.eggsLogged === 0 && !hasBoilMemory(state.boilMemory));
}

/** Draw the screen: the controls and the answer they give while idle, and
 *  the cook under way otherwise. The 200 ms ticker only ever draws a cook
 *  under way, so it never repaints the controls, which are put away beneath
 *  it (styles.css) and drawn again when the cook ends. */
export function render(now_ms: number): void {
  renderLearning();
  if (state.cook === null) renderIdle(now_ms);
  else renderRunning(now_ms);
}

/** The Learning mark (E8, DECISIONS.md 58): on the time while sharing is
 *  on, since the time may then be nudged - and never in sous-vide, which has
 *  no time to nudge. */
function renderLearning(): void {
  const on = shareState().on && !(state.cook === null && isSousVide());
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
  renderCookSetup(null, null, sizeClasses);
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
  renderDonenessScale(sol, sol.whiteSets ? state.profile : null, sol.whiteSets ? state.chosen?.certainty.words ?? null : null);
  renderReadout(now_ms, sol, warning);
  // "Based on history" has an (i) that says what history.
  showInfo(page().sublineInfo, state.settings.startMode === 'cold' && hasBoilMemory(state.boilMemory));
  renderOdds(now_ms);
  renderAdvice();
  renderWelcome(warning);
}

/** The cook under way, five times a second: the readout, and nothing of the
 *  controls. */
function renderRunning(now_ms: number): void {
  const plan = state.plan;
  renderCookSetup(state.cook, plan, sizeClasses);
  if (plan === null) return;
  // The warning line carries a restored cook's warning while it runs - the
  // opposite of a refusal, it only exists mid-cook. Only while the cook is
  // still in flight: at DONE the egg is out and "keep this tab open" is
  // advice about a deadline that has already passed.
  const warning = pickedUpAfterReload() && phaseNow(now_ms) !== 'DONE' ? t('readout.restored') : '';
  renderReadout(now_ms, plan.solution, warning);
  renderSection(now_ms);
  showInfo(page().sublineInfo, false);
  renderOdds(now_ms);
  renderAdvice();
  page().welcome.hidden = true;
}

/** The egg in cross-section, as it is now: carried forward to the clock, in
 *  the water until the cook said it was out (or the grace ran out), and on
 *  through the carryover after. At the posterior mean, the same egg the
 *  countdown times, in the pot its plan has now. */
function renderSection(now_ms: number): void {
  const cook = state.cook;
  const plan = state.plan;
  if (cook === null || plan === null) return;
  const params = calibrationParams(state.calib);
  const key = JSON.stringify([cook.id_ms, cook.startedAt_s, plan.egg, plan.setup]);
  if (drawn.section === null || drawn.sectionFor !== key) {
    drawn.section = createSection(plan.egg, plan.setup, params);
    drawn.sectionFor = key;
    buildEggSection(page().eggSection, drawn.section.outer);
  }
  const section = drawn.section;
  const pulled = cook.events.pulled;
  const out_s = pulled === null ? null : pulled.out_s - cook.startedAt_s;
  const now_s = now_ms / 1000 - cook.startedAt_s;
  advanceSection(
    section, plan.egg, plan.setup, params,
    out_s === null ? now_s : Math.min(now_s, out_s + CARRYOVER_WINDOW), out_s,
  );
  const view = sectionView(section, calibrationDoneness(state.calib, plan.level).whiteDose_min);
  paintEggSection(page().eggSection, ringFills(view, readPalette(page().body)));
}

/** The readout, the buttons under it and the questions at DONE, idle or not,
 *  and the warning line with `warning` in it. */
function renderReadout(now_ms: number, sol: Solution, warning: string): void {
  const { settings, cook, plan } = state;
  const phase = phaseNow(now_ms);
  page().body.dataset['phase'] = phase;
  page().body.dataset['start'] = startModeNow();
  page().warn.textContent = warning;
  page().warn.hidden = warning === '';

  const wanted = probeWanted(settings.probe, plan);
  const pending = probePending(phase, wanted);
  const view = phaseView(cook, plan, now_ms, {
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
  page().feedback.hidden = phase !== 'DONE' || said === 'beforeReload';
  if (!page().feedback.hidden && said !== 'live') renderCalibNote(learning());
  renderProbe(phase, plan);
  if (!page().feedback.hidden) renderTarget(plan);

  page().phaseLabel.textContent = view.label;
  page().digits.textContent = view.digits;
  page().sublineText.textContent = view.subline;
  // The full rolling boil has an (i) that says what it looks like.
  showInfo(page().hintInfo, phase === 'HEATING');

  // The live region carries a coarse announcement, not a per-second one: the
  // ticking digits are aria-hidden, so a screen reader hears the phase and the
  // minute rather than being flooded once a second.
  const announcement = t('spoken.announcement', { label: view.label, spoken: view.spoken });
  const minute = view.digits.split(':')[0];
  const key = `${phase}|${minute}`;
  if (key !== drawn.announced) {
    drawn.announced = key;
    page().announce.textContent = announcement;
  }
}

/** A key with its counts and its doneness words, rendered. */
function words(ref: WordsRef): string {
  const args: Record<string, string | number> = { ...ref.args };
  for (const [name, key] of Object.entries(ref.words)) args[name] = t(key);
  return t(ref.key, args);
}

/** How sure I am of the time on screen, under it (src/core/wording.ts, "How
 *  sure, in words"; DECISIONS.md 93 and 97): the class as a line the cook
 *  presses, which opens in place the 90% interval in the slider's words, the
 *  most likely word, the likely time range and the way to Help. "Most
 *  likely" shows under the line unpressed when it is not the word asked, and
 *  is then not said again in what opens, nor after a one-word interval
 *  (`mostLikelyOpened`). Then the white's line.
 *
 *  While idle they are the choice on screen's, and blank until this pot's
 *  surface lands: the line keeps two lines' height, so nothing moves when
 *  they arrive. Once a cook is running they are its plan's, read on its
 *  pot's surface and held while a new pot's is on its way, until the pull,
 *  when the time they were about has passed (design/one-screen.md section 7,
 *  12); the white's line stays to the end, as before. The way to Help goes
 *  with the controls: Help is not reachable mid-cook. Never where the white
 *  never sets: there is no cook to say anything about. */
function renderOdds(now_ms: number): void {
  let o: Outcome | null = null;
  let sure: CertaintyReading | null = null;
  if (state.cook === null) {
    if (state.chosen !== null && state.solution !== null && state.solution.whiteSets) {
      o = state.outcome;
      sure = state.chosen.certainty;
    }
  } else if (state.plan !== null) {
    const id = state.cook.id_ms;
    const now = state.plan.decided === null ? null : state.plan.decided.outcome;
    if (now !== null || drawn.outcomeFor !== id) {
      drawn.outcome = now;
      drawn.certainty = state.plan.certainty;
      drawn.outcomeFor = id;
    }
    const before = phaseNow(now_ms);
    const pulled = before === 'PULL' || before === 'COOLING' || before === 'DONE';
    o = state.plan.solution.whiteSets ? drawn.outcome : null;
    sure = state.plan.solution.whiteSets && !pulled ? drawn.certainty : null;
  }
  renderCertainty(sure);
  page().whiteRisk.hidden = o === null || !whiteAtRisk(o);

  // While a new pot's surface is on its way the lines above are blank, and
  // the readout would shrink and grow back a second later, moving the
  // sentence's open choice under the thumb that just tapped it. So it keeps
  // the height it had when the lines were last all there. Measured only
  // while idle: reading the height forces a layout, and a running cook, drawn
  // five times a second, has no choice to keep still.
  if (state.cook !== null) {
    page().readout.style.minHeight = '';
  } else if (state.decision === null) {
    page().readout.style.minHeight = drawn.readout_px > 0 ? `${drawn.readout_px}px` : '';
  } else {
    page().readout.style.minHeight = '';
    const height = page().readout.offsetHeight;
    if (height > 0) drawn.readout_px = height;
  }
}

/** The certainty line and what it opens, from `sure`, or nothing. */
function renderCertainty(sure: CertaintyReading | null): void {
  const word = page().certaintyWord;
  word.hidden = sure === null;
  page().certaintyMore.hidden = sure === null || word.getAttribute('aria-expanded') !== 'true';
  if (sure === null) {
    page().mostLikely.hidden = true;
    return;
  }
  const w = sure.words;
  word.textContent = t(certaintyKey(w.certainty));
  const likely = words(mostLikelyWords(w));
  const under = mostLikelyShown(w);
  page().mostLikely.hidden = !under;
  page().mostLikely.textContent = under ? likely : '';
  page().certaintyInterval.textContent = words(intervalWords(w));
  const opened = mostLikelyOpened(w);
  page().certaintyLikely.hidden = !opened;
  page().certaintyLikely.textContent = opened ? likely : '';
  page().certaintyTime.textContent = t('certainty.time', {
    low: formatClock(sure.time.low_s), high: formatClock(sure.time.high_s),
  });
  page().certaintyHelp.hidden = state.cook !== null;
}

/** The sous-vide readout: hold times from the isothermal limit, and the plain
 *  statement that you should have started yesterday. Idle only, after the
 *  sentence (`renderIdle`). */
function renderSousVide(now_ms: number): void {
  // No pan, no choice, and no odds: the bath's answer is not a guess about a
  // pan (the decision chooses pan times). So no certainty line, and no
  // bracket either.
  renderCertainty(null);
  page().whiteRisk.hidden = true;
  page().readout.style.minHeight = '';
  renderBareScale();
  showInfo(page().sublineInfo, false);
  showInfo(page().hintInfo, false);
  renderAdvice();
  page().body.dataset['phase'] = 'IDLE';
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
