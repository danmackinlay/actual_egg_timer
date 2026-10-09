/**
 * Drawing the egg page from the state, one layout in every phase
 * (design/one-screen.md section 2): the readout, how sure I am, the slider
 * with its shading and bracket, the sentence with the egg in cross-section
 * beside it, the slot and the buttons. While idle they are the controls'
 * answer, with the advice and the welcome; while a cook runs, its plan's,
 * from its own choices. Then the sous-vide screen, the mute and the version.
 *
 * Nothing here solves or saves; the one thing it asks for is the odds of the
 * changes the advice prices, which land through answer.ts.
 */

import { SOUS_VIDE_BATH_C, sousVideEstimate } from '../core/sousvide.js';
import { ModelParams, Solution } from '../core/solve.js';
import { textureFor, textureNoteKeys } from '../core/policy.js';
import { decisionInputs } from '../core/decide.js';
import { OddsProfile, pricedChanges, protocolAdvice } from '../core/reach.js';
import { Outcome } from '../core/outcome.js';
import { CertaintyReading } from '../core/certainty.js';
import {
  WordsRef, certaintyKey, forecastWhiteAtRisk, intervalWords, mostLikelyOpened, mostLikelyShown, mostLikelyWords,
  refusalKey, timeRangeWords, whiteAtRisk,
} from '../core/wording.js';
import { CookPlan, RunningCook, asRanShown, asksIfStillIn, solutionAsRan } from '../core/running.js';
import { midSentence } from '../core/copy.js';
import { EggSection, SectionView, advanceSection, createSection, previewSection, sectionView } from '../core/section.js';
import { Egg } from '../core/geometry.js';
import { CookSetup } from '../core/protocol.js';
import { CARRYOVER_WINDOW } from '../core/constants.js';
import { askForProfile, currentInputs, surfaceFor } from './answer.js';
import { calibrationDoneness, calibrationParams } from './calibration.js';
import { cachedOddsProfile } from './decisionGrids.js';
import { activeLocale, t, timeOfDay } from './copy.js';
import { formatClock } from './countdown.js';
import { page } from './dom.js';
import { buildEggSection, paintEggSection, readPalette, ringFills } from './eggSection.js';
import {
  answersNow, cookShown, pickedUpAfterReload, probePending, probeWanted, renderProbe, renderTarget,
} from './feedback.js';
import { showInfo } from './info.js';
import { renderCalibNote } from './learned.js';
import { phaseView } from './phaseView.js';
import { liveSetupFacts, renderSentence } from './sentence.js';
import { shareState } from './share.js';
import { renderBareScale, renderDonenessReading, renderDonenessScale } from './slider.js';
import { sousVideCopy } from './sousvide.js';
import {
  boilingPoint_C, currentEgg, idlePot, isSousVide, learning, massFrom, phaseNow, sizeClasses, startModeNow, state,
  timeToBoil_s,
} from './state.js';
import { estimateTimeToBoil, hasBoilMemory, storageReadOnly } from './store.js';
import { show } from './units.js';
import { APP_VERSION } from './version.js';
import { nowMs } from './now.js';
import { warningText } from './warning.js';

/** What was last drawn, so the page draws only what changed. */
const drawn = {
  /** The readout's height, px, the last time it was drawn idle with a decision
   *  in: what it holds while the next one is on its way (`renderOdds`). */
  readout_px: 0,
  /** The live region's last announcement, by phase and minute. */
  announced: '',
  /** The advice's keys, as listed. */
  advice: '',
  /** What the running cook's certainty line and white's line last said, and
   *  for which cook: held while a new pot's surface is on its way (the boil
   *  tapped), rather than blanking. */
  outcome: null as Outcome | null,
  certainty: null as CertaintyReading | null,
  profile: null as OddsProfile | null,
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

/** The solve the texture note reads while a cook runs: once the egg is out,
 *  the cook as it ran (`solutionAsRan`, onescreen review 2.2), like the peak
 *  and the white's line, so a plan made since on a posterior that has folded
 *  this egg's own answer never moves it; until then, the plan's. Worked out
 *  once for each. */
const ranSolution = { key: '', solution: null as Solution | null };

function solutionShown(cook: RunningCook, plan: CookPlan): Solution {
  const ran = asRanShown(cook, plan);
  if (ran === null) return plan.solution;
  const key = JSON.stringify([plan.egg, plan.setup, plan.cookTime_s, plan.inputs?.params ?? null, ran.params, ran.cook_s]);
  if (ranSolution.key !== key || ranSolution.solution === null) {
    ranSolution.solution = solutionAsRan(plan, ran);
    ranSolution.key = key;
  }
  return ranSolution.solution;
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

/** Draw the screen, one layout in every phase: the controls and the answer
 *  they give while idle, and the cook under way otherwise, its controls
 *  showing its own choices. The 200 ms ticker draws only a cook under way. */
export function render(now_ms: number): void {
  renderLearning();
  // The sentence, in every phase: the controls' (the settings, or the
  // running cook's own choices).
  renderSentence(liveSetupFacts(state.controls, sizeClasses, currentEgg()));
  // When the eggs went in, in the start's panel, while a cook runs: the
  // sentence never says it.
  const start = state.cook === null ? null : state.controlsStart_s;
  page().startedAtField.hidden = start === null;
  if (start !== null) page().startedAt.textContent = timeOfDay(start * 1000);
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
  renderIdleSection(sol);
}

/** The cook under way, five times a second, on the same layout as idle: the
 *  readout, the slider's reading, shading and bracket from its plan, and the
 *  egg in cross-section as it is now. */
function renderRunning(now_ms: number): void {
  const cook = state.cook;
  const plan = state.plan;
  if (cook === null || plan === null) return;
  const sol = plan.solution;
  const shown = cookShown(cook, plan);
  const reading = runningReading(now_ms);
  page().statBoil.textContent = show('boilingPoint', boilingPoint_C());
  // A correction in hand (edit.ts) has the slider's reading of its own,
  // from a plan of the cook as it would be.
  const aim = state.aim;
  page().note.textContent = textureNote(aim?.solution ?? solutionShown(cook, plan));
  if (aim !== null) renderDonenessReading(aim.level, { peakYolk_C: aim.peakYolk_C });
  else renderDonenessReading(shown?.level ?? plan.answer.level, { peakYolk_C: shown?.peakYolk_C ?? sol.result.peakYolk_C });
  renderDonenessScale(sol, sol.whiteSets ? reading.profile : null, sol.whiteSets ? reading.sure?.words ?? null : null);
  // The warning line while a cook runs, until the pull: what the plan says
  // of the level, as the idle screen says it (design/one-screen.md section
  // 3: a correction that leaves the white unset gets the longest time this
  // pan can give, and the slot says so), a refusal first. Then a restored
  // cook's warning, the opposite of a refusal, which only exists mid-cook,
  // and only while the cook is still in flight: at DONE the egg is out and
  // "keep this tab open" is advice about a deadline that has already passed.
  const phase = phaseNow(now_ms);
  const before = phase === 'HEATING' || phase === 'COOKING';
  const said = before ? warningText(plan.answer, cook.choices) : '';
  const refusal = before && refusalKey(plan.answer.verdict, cook.choices.cooling) !== null;
  const restored = pickedUpAfterReload() && phase !== 'DONE' ? t('readout.restored') : '';
  const warning = refusal || restored === '' ? said : restored;
  renderReadout(now_ms, sol, warning);
  renderSection(now_ms);
  showInfo(page().sublineInfo, false);
  renderOdds(now_ms, reading);
  renderAdvice();
  page().welcome.hidden = true;
}

/* -------------------------------------------- the egg in cross-section */

/**
 * The egg in cross-section has two readings (design/one-screen.md section 5;
 * DECISIONS.md 97, 19, and 98), named on the drawing as `data-egg`:
 *
 * - `aim`: the egg the settings on screen aim for, at the end of the cooling,
 *   the egg as eaten (`previewSection`): at idle, the controls' egg at the time
 *   on screen; during a cook, while a control is held and for a moment after
 *   (`heldAim`, edit.ts), the egg the correction in hand would cook.
 * - `live`: the egg in the water now, carried forward a tick at a time
 *   (`advanceSection`) and replayed from raw when the cook's pot or start
 *   changes, on through the cooling.
 * - `ran`: at Done, the egg as it ran, eaten: the time that ran, to the egg
 *   out, with the model's parameters it ran under.
 *
 * A preview is one solve's worth of steps, so each is worked out only when
 * what it is of changes.
 */
const egg = {
  /** The rings the drawing has, as built (`buildEggSection`). */
  built: '',
  /** The live egg, and what it was started from. */
  live: null as EggSection | null,
  liveFor: '',
  /** The last preview worked out, and what it was of. */
  preview: null as SectionView | null,
  previewFor: '',
  /** What is painted now, so a tick paints only what moved. */
  painted: '',
  /** A preview another module holds on the drawing: the egg a correction in
   *  hand aims for, while a control is held (edit.ts). */
  held: null as SectionView | null,
};

/** Paint `view` on the drawing as `reading`. */
function paintSection(view: SectionView, reading: 'aim' | 'live' | 'ran'): void {
  const svg = page().eggSection;
  const rings = JSON.stringify(view.outer);
  if (rings !== egg.built) {
    buildEggSection(svg, view.outer);
    egg.built = rings;
  }
  paintEggSection(svg, ringFills(view, readPalette(page().body)));
  svg.dataset['egg'] = reading;
}

/** The egg as eaten for a pot, a time in the water and a level
 *  (`previewSection`), worked out once for each. */
export function aimedEgg(
  e: Egg, setup: CookSetup, params: ModelParams, cookTime_s: number, level: number,
): SectionView {
  const white = calibrationDoneness(state.calib, level).whiteDose_min;
  const key = JSON.stringify([e, setup, params, cookTime_s, white]);
  if (egg.preview === null || egg.previewFor !== key) {
    egg.preview = previewSection(e, setup, params, cookTime_s, white);
    egg.previewFor = key;
  }
  return egg.preview;
}

/** Hold a preview on the drawing (a control held mid-cook), or let it go
 *  back to its own reading (null); drawn at once. */
export function holdAim(view: SectionView | null): void {
  egg.held = view;
  egg.painted = '';
  if (view !== null) paintSection(view, 'aim');
  else render(nowMs());
}

/** The egg in cross-section while a cook runs: a preview held, or the egg
 *  as it ran at Done, or the live egg. At the posterior mean, the same egg
 *  the countdown times, in the pot its plan has now; once the egg is out,
 *  with the model's parameters it ran under, so a fold of this egg's own
 *  answer does not redraw it (review 2.4). */
function renderSection(now_ms: number): void {
  const cook = state.cook;
  const plan = state.plan;
  if (cook === null || plan === null) return;
  if (egg.held !== null) return;
  const shown = cookShown(cook, plan);
  const params = shown?.params ?? calibrationParams(state.calib);
  const level = shown?.level ?? plan.answer.level;
  const pulled = cook.events.pulled;
  const out_s = pulled === null ? null : pulled.out_s - cook.startedAt_s;
  if (out_s !== null && phaseNow(now_ms) === 'DONE') {
    const ran = aimedEgg(plan.egg, plan.setup, params, out_s, level);
    const key = `ran|${egg.previewFor}`;
    if (egg.painted !== key) {
      paintSection(ran, 'ran');
      egg.painted = key;
    }
    return;
  }
  const key = JSON.stringify([cook.id_ms, cook.startedAt_s, plan.egg, plan.setup, params]);
  if (egg.live === null || egg.liveFor !== key) {
    egg.live = createSection(plan.egg, plan.setup, params);
    egg.liveFor = key;
  }
  const now_s = now_ms / 1000 - cook.startedAt_s;
  advanceSection(
    egg.live, plan.egg, plan.setup, params,
    out_s === null ? now_s : Math.min(now_s, out_s + CARRYOVER_WINDOW), out_s,
  );
  egg.painted = 'live';
  paintSection(sectionView(egg.live, calibrationDoneness(state.calib, level).whiteDose_min), 'live');
}

/** The egg in cross-section while idle: the egg the controls aim for, at
 *  the time on screen, as eaten (DECISIONS.md 91, 97 and 98). */
function renderIdleSection(sol: Solution): void {
  if (egg.held !== null) return;
  const pot = idlePot(timeToBoil_s());
  const level = state.chosen?.level ?? state.settings.doneness;
  const view = aimedEgg(pot.egg, pot.setup, calibrationParams(state.calib), sol.result.cookTime_s, level);
  const key = `aim|${egg.previewFor}`;
  if (egg.painted === key) return;
  paintSection(view, 'aim');
  egg.painted = key;
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

  const shown = cookShown(cook, plan);
  const wanted = probeWanted(settings.probe, shown);
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
  // "Still in the water?": the primary says yes, and this says no.
  page().stillOut.hidden = !view.asking;

  // The model is calibrated against the literature, not against this kitchen.
  // Asking once per egg is what closes that gap. Both questions stay on screen
  // until the cook moves on, answered or not; a reload after an answer puts
  // them away, since the second could no longer be folded.
  const said = answersNow().kind;
  // Nor while a newer build's results are left alone (store.ts): no answer
  // could be kept.
  page().feedback.hidden = phase !== 'DONE' || said === 'beforeReload' || view.asking || storageReadOnly();
  if (!page().feedback.hidden && said !== 'live') renderCalibNote(learning());
  renderProbe(phase, shown);
  if (!page().feedback.hidden) renderTarget(shown);

  page().phaseLabel.textContent = view.label;
  page().digits.textContent = view.digits;
  page().sublineText.textContent = view.subline;
  // The full rolling boil has an (i) that says what it looks like.
  showInfo(page().hintInfo, phase === 'HEATING');

  // The live region carries a coarse announcement, not a per-second one: the
  // ticking digits are aria-hidden, so a screen reader hears the phase and the
  // minute rather than being flooded once a second.
  // The question is its own announcement: it says what it asks.
  const announcement = view.asking ? view.spoken : t('spoken.announcement', { label: view.label, spoken: view.spoken });
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

/** What a running cook's plan says of how sure, as drawn: its certainty
 *  reading and outcome, and its pot's odds profile for the track's shading,
 *  read on its pot's surface and held while a new pot's is on its way (the
 *  boil tapped, a correction) rather than blanking, until the pull, when the
 *  time they were about has passed (design/one-screen.md section 7, 12).
 *  The white's line stays to the end; once the egg is out it is the cook's
 *  as it ran, not a plan made since, which may know how the egg came out
 *  (review 2.4). */
interface RunningReading {
  outcome: Outcome | null;
  sure: CertaintyReading | null;
  profile: OddsProfile | null;
  ranWhite: boolean | null;
}

function runningReading(now_ms: number): RunningReading {
  const cook = state.cook;
  const plan = state.plan;
  if (cook === null || plan === null) return { outcome: null, sure: null, profile: null, ranWhite: null };
  const id = cook.id_ms;
  const now = plan.decided === null ? null : plan.decided.outcome;
  if (now !== null || drawn.outcomeFor !== id) {
    drawn.outcome = now;
    drawn.certainty = plan.certainty;
    drawn.profile = surfaceFor(plan.inputs)?.profile ?? null;
    drawn.outcomeFor = id;
  }
  // The profile lands after the surface: taken up when it does.
  if (now !== null && drawn.profile === null) drawn.profile = surfaceFor(plan.inputs)?.profile ?? null;
  const phase = phaseNow(now_ms);
  const pulled = phase === 'PULL' || phase === 'COOLING' || phase === 'DONE';
  const whiteSets = plan.solution.whiteSets;
  const ran = pulled ? asRanShown(cook, plan) : null;
  return {
    outcome: whiteSets ? drawn.outcome : null,
    sure: whiteSets && !pulled ? drawn.certainty : null,
    profile: whiteSets && !pulled ? drawn.profile : null,
    ranWhite: ran !== null ? whiteSets && forecastWhiteAtRisk(ran.forecast) : null,
  };
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
 *  they arrive. Once a cook is running they are its plan's (`reading`). The
 *  way to Help is there in every phase, as Help is. Never
 *  where the white never sets: there is no cook to say anything about. */
function renderOdds(now_ms: number, reading: RunningReading | null = null): void {
  let o: Outcome | null = null;
  let sure: CertaintyReading | null = null;
  let ranWhite: boolean | null = null;
  if (state.cook === null) {
    if (state.chosen !== null && state.solution !== null && state.solution.whiteSets) {
      o = state.outcome;
      sure = state.chosen.certainty;
    }
  } else {
    const r = reading ?? runningReading(now_ms);
    o = r.outcome;
    sure = r.sure;
    ranWhite = r.ranWhite;
  }
  const cook = state.cook;
  const plan = state.plan;
  renderCertainty(sure, cook === null || plan === null ? null : { startedAt_s: cook.startedAt_s, cookTime_s: plan.cookTime_s });
  // Nothing past "still in the water?": not a caveat about the pull it
  // doubts (onescreen review 3).
  const asking = state.cook !== null && state.plan !== null && asksIfStillIn(state.plan);
  page().whiteRisk.hidden = asking || (ranWhite !== null ? !ranWhite : o === null || !whiteAtRisk(o));

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

/** The certainty line and what it opens, from `sure`, or nothing. While a
 *  cook runs (`running`, its start and its plan's time now) the likely time
 *  range is when to take the eggs out, as times of day, not whole times
 *  under a clock counting down (core `timeRangeWords`, onescreen review 2.3). */
function renderCertainty(
  sure: CertaintyReading | null, running: { startedAt_s: number; cookTime_s: number } | null = null,
): void {
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
  const range = timeRangeWords(sure, running);
  const said = (s: number): string => (range.ofDay ? timeOfDay(s * 1000) : formatClock(s));
  page().certaintyTime.textContent = t(range.key, { low: said(range.low_s), high: said(range.high_s) });
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
