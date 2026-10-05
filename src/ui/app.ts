/**
 * The application: inputs -> solver -> readout, and the cook itself.
 *
 * The app is the timer. It measures the time to a rolling boil rather than
 * asking the user to stopwatch it elsewhere, which is the one measurement the
 * model cannot guess and the user cannot be bothered to take separately.
 *
 * While a cook is running the inputs are hidden (styles.css), so everything on
 * screen describes the cook that was started, not one the user is composing.
 * That is what lets the machine's deadlines and the solver's readout be
 * derived from the same settings without reconciling them mid-cook.
 */

import {
  Egg, eggFromMass, eggFromMinorDiameter, sizeClassesFor, sizeTableFor,
} from '../core/geometry.js';
import { boilingPointAtAltitude } from '../core/thermo.js';
import { Cooling, CookSetup, StartMode } from '../core/protocol.js';
import { SOUS_VIDE_BATH_C, SOUS_VIDE_MODEL_FLOOR_C, sousVideEstimate } from '../core/sousvide.js';
import {
  Measure, Quantity, UnitSystem, chooseUnits, displayText, nudgeFrom, parse, sizeClassLabel, stepPast,
} from '../core/units.js';
import { Solution, logYolkTarget } from '../core/solve.js';
import {
  BoilMemory, DEFAULTS, SLIDER_STEPS, SLOW_HOB_EVERY_S, SLOW_HOB_EXTRA_S, SLOW_HOB_WHEN_LEFT_S,
  ambientFor, anchorNear, coolingSecondsFor, probeMomentFor, roomInUse, startTempPreset_C, targetPeakYolk_C, textureFor,
  textureNoteKeys,
} from '../core/policy.js';
import {
  Decision, DecisionInputs, appliedNudge, carriedSolution, decide, decidedSolution, decisionApplies,
  decisionInputs, nudgeSeconds,
} from '../core/decide.js';
import {
  LevelAnswer, OddsProfile, adviceWanted, answerAt, envelopeBounds, pricedChanges, protocolAdvice,
} from '../core/reach.js';
import { MassFrom, forecastOf } from '../core/record.js';
import { Outcome, predictOutcome } from '../core/outcome.js';
import {
  APP_VERSION, Calibration, cachedDecisionGrid, cachedOddsProfile, calibrationDoneness, calibrationParams,
  clearCalibration, decisionGrid, decisionKey, eggRecordFor, eggsBehind, keepUnreadCook, keptState, learn,
  exportResults, loadCalibration, logEgg, oddsProfileFor, profileKey, calibrationStoredElsewhere,
} from './calibration.js';
import { forgetShare, loadShare, retryDeletes, sendFinal, shareState, shareStoredElsewhere } from './share.js';
import { renderShare, wireShare } from './shareView.js';
import {
  LIMITS, Limit, START_TEMP_PRESETS_C, Settings, UiStartMode, clampNumber,
  clearBoilMemory, clearCook, estimateTimeToBoil, hasBoilMemory, loadBoilMemory,
  loadCook, loadSettings, rememberTimeToBoil, saveCook, saveSettings, storedCookText,
} from './store.js';
import { sousVideCopy } from './sousvide.js';
import { directionKey, warningKey, whiteAtRisk } from '../core/wording.js';
import { activeLocale, applyCopy, loadCopy, t, tRef } from './copy.js';
import { midSentence } from '../core/copy.js';
import {
  REGION, REGIONAL_UNITS, measure, show, unitSystem,
  useUnits,
} from './units.js';
import { languageOf } from '../core/format.js';
import {
  LANGUAGES, LanguageState, effectiveLanguage, languageAfterFlip, languageAfterPick,
} from '../core/language.js';
import {
  Machine, advance, beginCooling, idleMachine, recordBoil, restoreMachine, staleMachine,
  reviseProvisional, secondsHeating, secondsToPull, startCold, startHot,
} from './machine.js';
import {
  Ticker, blip, keepScreenAwake, primeAudio, releaseScreen, ringAlarm, setMuted, startTicker,
  stopAlarm,
} from './clock.js';
import { bindDom, el, page, radioValue, selectRadio } from './dom.js';
import { labelInfoButtons, showInfo, wireInfoButtons } from './info.js';
import { labelSteppers, setStepRule, wireSteppers } from './stepper.js';
import { wireViews } from './views.js';
import { startOffline } from './offline.js';
import {
  buildClauses, liveSetupFacts, redrawSentence, renderCookSetup, renderSentence,
} from './sentence.js';
import {
  buildTicks, labelTicks, renderBracket, renderDonenessReading, renderDonenessScale,
} from './slider.js';
import { Ticket, restoreTicket, withTimeToBoil } from './ticket.js';
import { Learning, renderCalibNote, renderLearned, wireExport, wireForget } from './learned.js';
import {
  answersNow, forgetAnswers, keptAnswers, pickedUpAfterReload, probePending, probeWanted,
  renderProbe, renderTarget, resumeAnswers, wireFeedback,
} from './feedback.js';
import { phaseView } from './phaseView.js';
import { EggSection, advanceSection, createSection, sectionView } from '../core/section.js';
import { CARRYOVER_WINDOW } from '../core/constants.js';
import { buildEggSection, paintEggSection, readPalette, ringFills } from './eggSection.js';

/* ----------------------------------------------------------------- state */

/** The carton's size classes, by the browser's region (`REGION`, in units.ts)
 *  alone: not the language, and not the units - an American carton is an
 *  American carton in grams too. Fixed for the life of the page. A stored
 *  index is read against it, and keeps its name if the region has changed
 *  since it was saved. */
const sizeClasses = sizeClassesFor(REGION);
/** The same table by name, for the record: a Large is 68 g in one and 60.2 g in
 *  the other. */
const sizeTable = sizeTableFor(REGION);

// The four below are read from storage by `boot()`, not when this module is
// imported, so a test can import it.
let settings!: Settings;
let boilMemory!: BoilMemory;
/** Posterior over the model's uncertain constants, learned from how the user's
 *  own eggs actually turn out. Before any feedback this is the prior mean,
 *  i.e. the literature values. */
let calib!: Calibration;
let machine!: Machine;
let solution: Solution | null = null;
/** The choice behind the time on screen while idle: the odds, and how
 *  far it leaned from the mean solve. Null until the
 *  setup's decision surface has been built, and on the sous-vide screen. */
let decision: Decision | null = null;
/** What the egg at the chosen time will be like (src/core/outcome.ts): the
 *  direction sentence, the white's line and the bracket under the slider.
 *  Read at the decided time on the same surface, whenever `decision` is, and
 *  null whenever it is. */
let outcome: Outcome | null = null;
/** The readout's height, px, the last time it was drawn idle with a decision
 *  in: what it holds while the next one is on its way (`renderOdds`). */
let settledReadout_px = 0;
/** A decision surface waiting for the inputs to settle before it is asked for. */
let decisionHandle = 0;
/** The odds at every level for the pot on screen and the posterior as it
 *  stands (reach.ts): the track's shading, and the range the slider offers.
 *  Null until it has been worked out, which follows the pot's surface; until
 *  then the physical limits are the whole rule, as they were before. */
let profile: OddsProfile | null = null;
/** Profiles asked for and not yet in, by key, so each lands once. */
const profilesAsked = new Set<string>();
/** The warning line while idle: a refusal when the requested doneness had to
 *  be moved, or the level's low odds (`warningKey`); empty otherwise. */
let idleWarning = '';
/** What the running cook is, frozen at the moment it started (ticket.ts). */
let ticket: Ticket | null = null;
let ticker: Ticker | null = null;
let solveHandle = 0;
let saveHandle = 0;
let lastRevise_ms = 0;
let lastAnnounced = '';
/** The egg in cross-section under the running cook (src/core/section.ts),
 *  carried forward each tick, and the ticket it was started from: a new
 *  ticket - a start, a boil tapped, a slow hob, a reload - replays it from
 *  t = 0, since the water it has been in has changed. */
let section: EggSection | null = null;
let sectionTicket: Ticket | null = null;

/* --------------------------------------------------------------- physics */

function currentEgg(): Egg {
  if (settings.sizeIndex < 0 || settings.sizeIndex >= sizeClasses.length) {
    return eggFromMinorDiameter(settings.customMinor_mm / 1000);
  }
  return eggFromMass(sizeClasses[settings.sizeIndex].mass_kg);
}

/** Which input the egg on screen came from: the size class, or whichever of the
 *  three measurements was typed in last. They all end up as one diameter, so
 *  this is the only place the difference survives - and it is the egg-level
 *  noise the fit needs (a class is a 10 g bucket; a scale is a gram). */
function massFrom(): MassFrom {
  if (settings.sizeIndex >= 0 && settings.sizeIndex < sizeClasses.length) return 'class';
  return settings.measuredBy;
}

/** The three ways a person can measure an egg are one number in three units.
 *  The model egg's equator is a circle, so girth = pi * B exactly; mass goes
 *  through the same ovoid volume the solver uses (V = k_v * ratio * B^3), so
 *  nothing here is a second opinion about the geometry. */
function minorFromGirth_mm(girth_mm: number): number {
  return girth_mm / Math.PI;
}

function minorFromMass_mm(mass_g: number): number {
  return eggFromMass(mass_g / 1000).minorDiameter_m * 1000;
}

/** Rewrite whichever measurement boxes the user is not currently typing in, so
 *  filling in one fills in the rest without the field fighting the cursor.
 *  That exception is half of the round trip: the box being typed in keeps what
 *  was typed, and the others show the stored egg rounded to their step. */
function syncMeasurements(except: EventTarget | null): void {
  const egg = currentEgg();
  const minor_mm = egg.minorDiameter_m * 1000;
  if (except !== page().measureMass) page().measureMass.value = inputText('mass', egg.mass_kg * 1000);
  if (except !== page().measureGirth) page().measureGirth.value = inputText('girth', Math.PI * minor_mm);
  if (except !== page().measureMinor) page().measureMinor.value = inputText('width', minor_mm);
}

/* ------------------------------------------------------------------ units */

/** A stored SI value as an input's contents: the displayed number, without
 *  the trailing zeros a readout keeps ("2", not "2.00"). */
function inputText(q: Quantity, si: number): string {
  const text = displayText(measure(q), si);
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

/** What a field says, in SI and clamped, or `fallback` while it holds no
 *  number. Only ever called for the field the cook is editing: re-reading a
 *  field nobody touched would re-parse a rounded display back over the stored
 *  value, and that is the drift the round trip exists to prevent. */
function readField(input: HTMLInputElement, q: Quantity, fallback: number): number {
  if (input.value.trim() === '') return fallback;
  return parse(measure(q), Number(input.value)) ?? fallback;
}

/** An input's step and bounds, in the units on screen. The bounds are the SI
 *  limits rounded inward to the step, so every value the input allows is one
 *  the model does too. */
function applyMeasure(input: HTMLInputElement, label: HTMLElement, m: Measure): void {
  input.step = String(m.step);
  if (m.bounds !== null) {
    input.min = String(m.bounds.lo);
    input.max = String(m.bounds.hi);
  }
  label.textContent = t(m.unitKey);
}

/** The cook picks a system, stored as their choice. A cook's own switch
 *  from metric to Imperial, in modern English, is also a switch into the
 *  English of 1750 (LANGUAGE.md section 6); the switch back to metric
 *  leaves the language alone. `setLanguage` saves for both. */
function onUnits(next: UnitSystem): void {
  const choice = chooseUnits(settings.unitsChosen, REGIONAL_UNITS, next);
  settings.unitsChosen = choice.chosen;
  useUnits(settings.unitsChosen);
  if (choice.flip !== null) setLanguage(languageAfterFlip(settings.language, choice.flip));
  else saveNow();
  applyUnitsToDom();
  recompute();
}

/** The room as the cook measured it, while it counts, or null to assume one
 *  (`roomInUse`: only with the probe on). */
function room_C(): number | null {
  return roomInUse(settings.probe, settings.room_C);
}

function eggStart_C(): number {
  if (settings.startTempMode === 'custom') return settings.customStart_C;
  return startTempPreset_C(settings.startTempMode, room_C());
}

/** The room, as far as the model is concerned. The rule - a measured room is
 *  the room; otherwise an egg that has been sitting out IS the room, and a
 *  fridge egg says nothing - is core policy. */
function ambient_C(): number {
  return ambientFor(eggStart_C(), room_C());
}

function boilingPoint_C(): number {
  return boilingPointAtAltitude(settings.altitude_m);
}

/** What the solver is told. The Start control has three positions; the model
 *  has two. Sous-vide is answered by src/core/sousvide.ts instead, so as far as
 *  the cook solver is concerned it is an egg going into water already hot. */
function coreStartMode(): StartMode {
  return settings.startMode === 'cold' ? 'cold' : 'hot';
}

function isSousVide(): boolean {
  return settings.startMode === 'sous';
}

/** What the solver is told about the POT. The egg is a separate argument
 *  everywhere the core takes both, so there is no mass here to keep in step. */
function buildSetup(timeToBoil_s: number): CookSetup {
  return {
    startMode: coreStartMode(),
    afterBoil: settings.afterBoil,
    eggStart_C: eggStart_C(),
    ambient_C: ambient_C(),
    boiling_C: boilingPoint_C(),
    timeToBoil_s: timeToBoil_s,
    cooling: settings.cooling,
    waterLitres: settings.waterLitres,
    eggCount: settings.eggCount,
  };
}

/** Time to a rolling boil, s - the pan's one measured number, and the one
 *  thing the solver needs that the settings do not hold.
 *
 *  Before a cook it is remembered or guessed. Once a cold start is under way
 *  the machine carries it: the guess, then the revision if the hob is slow,
 *  then the measurement when the boil is tapped. It is the length of a cold
 *  start's ramp and nothing more. A hot start never times it and the physics
 *  never reads it there - with the heat off the pan's cooling comes from the
 *  water volume (see panTimeConstant) - but the setup still carries the
 *  remembered value, so the record can say which pan was assumed. */
function timeToBoil_s(): number {
  if (machine.phase !== 'IDLE' && startModeNow() === 'cold') return machine.assumedBoil_s;
  return estimateTimeToBoil(boilMemory, settings.waterLitres);
}

/** The pot of the cook under way: the ticket's, frozen at "Eggs in", and never
 *  the controls', which another tab may have changed since. Null while idle. */
function runningSetup(): CookSetup | null {
  return machine.phase !== 'IDLE' && ticket !== null ? ticket.setup : null;
}

/** How the cook on screen starts: the running cook's, or the controls'. */
function startModeNow(): UiStartMode {
  return runningSetup()?.startMode ?? settings.startMode;
}

/* ------------------------------------------------------------------ copy */

/** The warning line, in words: a refusal, or the level's low odds. Which,
 *  and which words say it, are core's (`answerAt`, `warningKey`); the
 *  arguments are this app's. The low odds name the level the slider rests
 *  on, a word standing alone before the colon. */
function warningText(answer: LevelAnswer): string {
  const v = answer.verdict;
  const ref = warningKey(v, answer.lowOdds, settings.cooling);
  if (ref === null) return '';
  return tRef(ref, {
    limit: midSentence(t(v.limit.key), activeLocale()), water: show('water', settings.waterLitres),
    doneness: t(anchorNear(answer.level).key),
  });
}

/* --------------------------------------------------------------- solving */

/** Solve for the given inputs (core `answerAt`). Pure apart from reading
 *  `settings`: it moves nothing and writes nothing. Deciding and acting are
 *  two steps, and only the idle path takes the second, so a slow hob cannot
 *  move the user's doneness mid-cook. */
function answerFor(timeToBoil_s: number, level: number, odds: OddsProfile | null): LevelAnswer {
  return answerAt(calib, currentEgg(), buildSetup(timeToBoil_s), level, odds, true);
}

/**
 * The time chosen for an answer (src/core/decide.ts), if this pot's
 * decision surface has been built - and if it has not, the mean solve's time,
 * with the surface asked for once the inputs settle.
 *
 * The surface does not depend on the slider, so a drag is answered from the one
 * already built, and the time never jumps between the mean solve's and the
 * chosen one mid-drag. It changes once, when a new pot's surface lands.
 *
 * Once the pot's odds profile is in too, the time is held by it, so a softer
 * level never gets a later time than a firmer one (`envelopeBounds`,
 * DECISIONS.md 84). Until then a level has its own choice, and the time can
 * move once more when the profile lands.
 */
function decided(
  answer: LevelAnswer, timeToBoil_s: number,
): { solution: Solution; decision: Decision | null; outcome: Outcome | null; nudge_s: number } {
  const egg = currentEgg();
  const setup = buildSetup(timeToBoil_s);
  const inputs = decisionInputs(calib, egg, setup);
  const grid = cachedDecisionGrid(inputs);
  if (grid === null) {
    askForDecision(inputs);
    return { solution: answer.solution, decision: null, outcome: null, nudge_s: 0 };
  }
  // The odds at every level follow the surface, in the worker.
  const odds = cachedOddsProfile(inputs, calib);
  if (odds === null) askForProfile(inputs);
  const logTarget = logYolkTarget(answer.level);
  const d = decide(calib, grid, answer.solution, logTarget, envelopeBounds(odds, answer.level));
  // The nudge moves the chosen time, where one is chosen, for a cook who is
  // sharing (E8); the time shown, the time started and the outcome under it
  // are all at the nudged time.
  const nudge = appliedNudge(answer.solution, nudgeNow());
  return {
    solution: decidedSolution(egg, setup, calibrationParams(calib), answer.solution, d, nudge),
    decision: d,
    // What that time will give, on the same surface: about 2 ms beside the
    // decision's 13-16, so it runs here with it rather than in the worker.
    outcome: predictOutcome(calib.posterior, grid, d.cookTime_s + nudge, logTarget),
    nudge_s: nudge,
  };
}

/* -------------------------------------------------------------- the nudge */

/** This page's nudge (E8, DECISIONS.md 61): a whole number of seconds from
 *  -10 to +10, drawn when the page loads and again after each cook, so the
 *  time on screen holds still while the cook looks at it. */
let nudgeDraw = nudgeSeconds(Math.random());

/** The nudge the time takes now: the draw while sharing is on, and none
 *  while it is off - the consent covers it, and nothing else does. */
function nudgeNow(): number {
  return shareState().on ? nudgeDraw : 0;
}

/** How long the inputs must sit still before a decision surface is asked for,
 *  ms, on top of the solve's own coalescing. A surface is a second of the
 *  worker's time; a pot typed digit by digit should not queue one per digit. */
const DECISION_SETTLE_MS = 300;

/** Ask the worker for this pot's surface once the inputs have settled, and
 *  re-solve when it lands if the pot on screen is still the one it was for. */
function askForDecision(inputs: DecisionInputs): void {
  if (decisionHandle !== 0) window.clearTimeout(decisionHandle);
  decisionHandle = window.setTimeout(() => {
    decisionHandle = 0;
    const key = decisionKey(inputs);
    decisionGrid(inputs).then(() => {
      if (machine.phase !== 'IDLE' || isSousVide()) return;
      const now = decisionKey(decisionInputs(calib, currentEgg(), buildSetup(timeToBoil_s())));
      if (now === key) recompute();
    }, (error: unknown) => console.warn('decision surface failed', error));
  }, DECISION_SETTLE_MS);
}

/** The pot on screen as a decision's inputs: what its surface and its odds
 *  profile are keyed by. */
function currentInputs(timeToBoil_s: number): DecisionInputs {
  return decisionInputs(calib, currentEgg(), buildSetup(timeToBoil_s));
}

/** The profiles the screen wants now: this pot's, and those of the changes
 *  the advice would price (`pricedChanges`). */
function wantedProfileKeys(): Set<string> {
  const inputs = currentInputs(timeToBoil_s());
  const keys = new Set<string>([profileKey(inputs, calib)]);
  for (const change of pricedChanges(inputs.setup)) {
    keys.add(profileKey(decisionInputs(calib, inputs.egg, change.setup), calib));
  }
  return keys;
}

/** Ask the worker for the odds at every level for these inputs - after their
 *  surface, which it builds first if need be - and take them up when they land,
 *  if the screen still wants them. */
function askForProfile(inputs: DecisionInputs): void {
  const key = profileKey(inputs, calib);
  if (profilesAsked.has(key)) return;
  profilesAsked.add(key);
  // The key is cleared whether the profile lands or fails, so a failed one
  // is asked for again the next time the screen wants it.
  oddsProfileFor(inputs, calib).then(() => {
    profilesAsked.delete(key);
    if (machine.phase !== 'IDLE' || isSousVide()) return;
    if (wantedProfileKeys().has(key)) recompute();
  }, (error: unknown) => {
    profilesAsked.delete(key);
    console.warn('odds profile failed', error);
  });
}

/** Take the answer up: show its warning, and move the slider if the answer
 *  says it must (only out of the stripes). Idle only - once the egg is in the water the controls are
 *  gone and there is nothing to snap, so a call mid-cook takes nothing up:
 *  it neither moves `settings.doneness` nor writes it. */
function applyAnswer(answer: LevelAnswer): Solution {
  if (machine.phase !== 'IDLE') return answer.solution;
  idleWarning = warningText(answer);
  const snapTo = answer.verdict.snapTo;
  if (snapTo !== null && snapTo !== settings.doneness) {
    settings.doneness = snapTo;
    page().doneness.value = String(snapTo);
    saveNow();
  }
  return answer.solution;
}

/* --------------------------------------------------------------- display */

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
let adviceShown = '';
function renderAdvice(): void {
  let keys: string[] = [];
  const wanted = machine.phase === 'IDLE' && !isSousVide() && decision !== null && solution !== null
    && solution.whiteSets && adviceWanted(decision.oddsTenths, profile);
  if (wanted && decision !== null) {
    const inputs = currentInputs(timeToBoil_s());
    const priced: { key: string; profile: OddsProfile }[] = [];
    for (const change of pricedChanges(inputs.setup)) {
      const changed = decisionInputs(calib, inputs.egg, change.setup);
      const p = cachedOddsProfile(changed, calib);
      if (p === null) askForProfile(changed);
      else priced.push({ key: change.key, profile: p });
    }
    keys = protocolAdvice(
      inputs.setup, { eggFromClass: massFrom() === 'class', startAssumed: settings.startTempMode === 'room' },
      settings.doneness, decision.odds, priced,
    );
  }
  page().advice.hidden = !wanted;
  page().forYou.hidden = keys.length === 0;
  const shown = keys.join(' ');
  if (shown === adviceShown) return;
  adviceShown = shown;
  page().adviceList.replaceChildren(...keys.map((key) => {
    const li = document.createElement('li');
    li.textContent = t(key);
    return li;
  }));
}

function renderMute(): void {
  page().mute.textContent = t(settings.muted ? 'readout.mute.off' : 'readout.mute.on');
  page().mute.setAttribute('aria-pressed', settings.muted ? 'true' : 'false');
}

/** Sound is a setting, not a phase: the toggle works mid-cook, and muting
 *  while the alarm is going stops it. */
function onToggleMute(): void {
  settings.muted = !settings.muted;
  setMuted(settings.muted);
  saveSettings(settings);
  renderMute();
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
  page().welcome.hidden = !(machine.phase === 'IDLE' && !isSousVide() && warning === ''
    && calib.eggsLogged === 0 && !hasBoilMemory(boilMemory));
}

/** Draw the screen: the controls and the answer they give while idle, and
 *  the cook under way otherwise. The 200 ms ticker only ever draws a cook
 *  under way, so it never repaints the controls, which are put away beneath
 *  it (styles.css) and drawn again when the cook ends. */
function render(now_ms: number): void {
  renderLearning();
  if (machine.phase === 'IDLE') renderIdle(now_ms);
  else renderRunning(now_ms);
}

/** The Learning mark (E8, DECISIONS.md 58): on the time while sharing is
 *  on, since the time may then be nudged - and never in sous-vide, which has
 *  no time to nudge. */
function renderLearning(): void {
  const on = shareState().on && !(machine.phase === 'IDLE' && isSousVide());
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
  renderSentence(liveSetupFacts(settings, sizeClasses, currentEgg()));
  renderCookSetup(null, machine.targetLevel, sizeClasses);
  if (isSousVide()) {
    renderSousVide(now_ms);
    return;
  }

  const sol = solution;
  if (sol === null) return;

  page().statBoil.textContent = show('boilingPoint', boilingPoint_C());
  page().note.textContent = textureNote(sol);
  // The warning line carries a refusal or the level's low odds while idle.
  // It is advice about the slider: popping "jammy isn't reachable" onto the
  // screen while the egg is already in the water would be advice about a
  // control the user cannot reach.
  const warning = idleWarning;
  renderDonenessReading(settings.doneness, { peakYolk_C: sol.result.peakYolk_C });
  renderDonenessScale(sol, sol.whiteSets ? profile : null, sol.whiteSets ? outcome : null);
  renderReadout(now_ms, sol, warning);
  // "Based on history" has an (i) that says what history.
  showInfo(page().sublineInfo, settings.startMode === 'cold' && hasBoilMemory(boilMemory));
  renderOdds();
  renderAdvice();
  renderWelcome(warning);
}

/** The cook under way, five times a second: the readout, and nothing of the
 *  controls. */
function renderRunning(now_ms: number): void {
  renderCookSetup(ticket, machine.targetLevel, sizeClasses);
  const sol = solution;
  if (sol === null) return;
  // The warning line carries a restored cook's warning while it runs - the
  // opposite of a refusal, it only exists mid-cook. Only while the cook is
  // still in flight: at DONE the egg is out and "keep this tab open" is
  // advice about a deadline that has already passed.
  const warning = pickedUpAfterReload() && machine.phase !== 'DONE' ? t('readout.restored') : '';
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
  const k = ticket;
  if (k === null) return;
  const params = calibrationParams(calib);
  if (section === null || sectionTicket !== k) {
    section = createSection(k.egg, k.setup, params);
    sectionTicket = k;
    buildEggSection(page().eggSection, section.outer);
  }
  const out_s = machine.outAt_ms > 0 ? (machine.outAt_ms - machine.startedAt_ms) / 1000 : null;
  const now_s = (now_ms - machine.startedAt_ms) / 1000;
  advanceSection(
    section, k.egg, k.setup, params,
    out_s === null ? now_s : Math.min(now_s, out_s + CARRYOVER_WINDOW), out_s,
  );
  const view = sectionView(section, calibrationDoneness(calib, machine.targetLevel).whiteDose_min);
  paintEggSection(page().eggSection, ringFills(view, readPalette(page().body)));
}

/** The readout, the buttons under it and the questions at DONE, idle or not,
 *  and the warning line with `warning` in it. */
function renderReadout(now_ms: number, sol: Solution, warning: string): void {
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
      timeToBoil_s: estimateTimeToBoil(boilMemory, settings.waterLitres),
    },
    boilKnown: hasBoilMemory(boilMemory),
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
  renderProbe(machine, ticket, !settings.probeAsked, pending);
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
  if (key !== lastAnnounced) {
    lastAnnounced = key;
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
  if (machine.phase === 'IDLE') {
    if (decision !== null && solution !== null && solution.whiteSets) o = outcome;
  } else if (ticket !== null) {
    o = ticket.outcome;
  }
  page().directionText.textContent = o === null ? '' : t(directionKey(o));
  page().whiteRisk.hidden = o === null || !whiteAtRisk(o);
  showInfo(page().oddsInfo, machine.phase === 'IDLE' && o !== null);

  // While a new pot's surface is on its way the lines above are blank, and
  // the readout would shrink and grow back a second later, moving the
  // sentence's open choice under the thumb that just tapped it. So it keeps
  // the height it had when the lines were last all there. Measured only
  // while idle: reading the height forces a layout, and a running cook, drawn
  // five times a second, has no choice to keep still.
  if (machine.phase !== 'IDLE') {
    page().readout.style.minHeight = '';
  } else if (decision === null) {
    page().readout.style.minHeight = settledReadout_px > 0 ? `${settledReadout_px}px` : '';
  } else {
    page().readout.style.minHeight = '';
    const height = page().readout.offsetHeight;
    if (height > 0) settledReadout_px = height;
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
  renderBracket(null);
  showInfo(page().oddsInfo, false);
  showInfo(page().sublineInfo, false);
  showInfo(page().hintInfo, false);
  renderAdvice();
  page().body.dataset['phase'] = machine.phase;
  page().body.dataset['start'] = settings.startMode;

  const egg = currentEgg();
  const doneness = calibrationDoneness(calib, settings.doneness);
  const est = sousVideEstimate(
    egg.radius_m, calibrationParams(calib).alpha_m2s, SOUS_VIDE_BATH_C,
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
  renderDonenessReading(settings.doneness, { bath_C: est.bath_C });
  page().note.textContent = copy.note;
  page().warn.textContent = copy.warn;
  page().warn.hidden = false;
  page().welcome.hidden = true;
  setPrimary('', copy.hint, false);
  page().secondary.hidden = true;
  page().feedback.hidden = true;

  const key = `SOUS|${copy.headline}`;
  if (key !== lastAnnounced) {
    lastAnnounced = key;
    page().announce.textContent = t('spoken.sousVide', {
      when: midSentence(copy.headline, activeLocale()), subline: copy.subline,
    });
  }
}

/* ------------------------------------------------------------ the record */

/** Assign the machine and write the cook down in one step, so there is no path
 *  that advances a cook without persisting it. */
function setMachine(next: Machine): void {
  machine = next;
  persistCook();
}

function persistCook(): void {
  if (machine.phase === 'IDLE') {
    clearCook();
    return;
  }
  saveCook(machine, ticket, keptAnswers());
}

/* -------------------------------------------------------------- recompute */

/** Solve for what is on screen and take the answer up. Idle only: mid-cook
 *  it only redraws, since the controls describe the next cook, not this one
 *  (a second tab may have changed them). Every mid-cook solve goes through
 *  `resolveDuring` instead, which keeps the ticket's pot and the target the
 *  cook was started at. */
function recompute(): void {
  if (machine.phase !== 'IDLE') {
    render(Date.now());
    return;
  }
  // No pan, no solve. The sous-vide answer comes from src/core/sousvide.ts and
  // needs none of this.
  if (isSousVide()) {
    idleWarning = '';
    decision = null;
    outcome = null;
    profile = null;
    render(Date.now());
    return;
  }
  const boil = timeToBoil_s();
  profile = cachedOddsProfile(currentInputs(boil), calib);
  const answer = answerFor(boil, settings.doneness, profile);
  applyAnswer(answer);
  const chosen = decided(answer, boil);
  solution = chosen.solution;
  decision = chosen.decision;
  outcome = chosen.outcome;
  render(Date.now());
}

/** Re-solve a cook already under way, for a corrected time to boil.
 *
 *  The doneness is whatever the cook was STARTED at, and nothing here moves it
 *  - not the slider, and not the answer. The egg is in the water and the
 *  controls are gone, so a snapped re-solve would describe a cook nobody is
 *  having; an unreachable target answers with the furthest this pan goes, which
 *  is the only cook on offer. The refusal is left alone for the same reason:
 *  it is advice about a control the user cannot reach. */
function resolveDuring(t: Ticket, timeToBoil_s: number): Solution {
  // The ticket's egg and pot, never the controls': a second tab may have
  // changed those since "Eggs in".
  const { egg, setup } = withTimeToBoil(t, timeToBoil_s);
  // Through `answerAt`, as every solve is, with no snap retry: the target is
  // frozen, so a retry would answer for an egg nobody is cooking. iOS's
  // `cookResult` asks the same.
  const mean = answerAt(calib, egg, setup, machine.targetLevel, null, false).solution;
  // Leaned as far as the choice leaned at "Eggs in": the new ramp is a new pot,
  // whose surface is a second away with the egg already in (`carriedSolution`).
  // The nudge is carried with it, so the egg comes out when the record says.
  return carriedSolution(egg, setup, calibrationParams(calib), mean, t.lean_s + t.nudge_s);
}

/** Take a new time to boil into the cook under way - the slow hob's guess, or
 *  the boil the cook tapped: re-solve it (`resolveDuring`), and patch the ramp
 *  into the frozen ticket rather than rebuilding it from the live controls,
 *  which another tab may have changed. Whether the cook has a moment to probe
 *  at moves with the solve. Returns the solve, for the machine's deadlines. */
function retime(k: Ticket, boil_s: number): Solution {
  const sol = resolveDuring(k, boil_s);
  const moved = withTimeToBoil(k, boil_s);
  solution = sol;
  // Where the new ramp leaves no time to choose, neither the lean nor the
  // nudge was carried (`carriedSolution`), and the record must not say it was.
  const carried = decisionApplies(sol) ? moved.nudge_s : 0;
  ticket = { ...moved, nudge_s: carried, probeMoment: probeMomentFor(sol.result, moved.setup.cooling) };
  return sol;
}

/** Coalesce solves: a solve is tens of milliseconds, which is too long to run
 *  on every pixel of a slider drag. */
function scheduleSolve(): void {
  if (solveHandle !== 0) return;
  solveHandle = window.setTimeout(() => {
    solveHandle = 0;
    recompute();
  }, 90);
}

/** Coalesce writes for the same reason. A drag fires `input` per pixel, and
 *  every one of those was a JSON.stringify and a localStorage write for a
 *  settings object nobody had finished changing. */
function scheduleSave(): void {
  if (saveHandle !== 0) return;
  saveHandle = window.setTimeout(() => {
    saveHandle = 0;
    saveSettings(settings);
  }, 250);
}

/** Write now, for the paths that must not lose the setting: starting a cook,
 *  and the snap that moves the slider out from under the user. */
function saveNow(): void {
  if (saveHandle !== 0) {
    window.clearTimeout(saveHandle);
    saveHandle = 0;
  }
  saveSettings(settings);
}

/* ------------------------------------------------------------ calibration */

/** What has been learned, as it stands now, for learned.ts to say. */
function learning(): Learning {
  return { eggs: calib.eggsLogged, boilMemory: boilMemory, waterLitres: settings.waterLitres };
}

/** Take it all back: the posterior and the pan. */
function forgetAll(): void {
  calib = clearCalibration();
  // The next egg is a new cook's, under a new id (share.ts).
  forgetShare();
  boilMemory = {};
  clearBoilMemory();
  renderCalibNote(learning());
  recompute();
}

/* ---------------------------------------------------------------- sharing */

/** How many of the log's eggs are final: all of them, unless the last is the
 *  egg on screen, whose answers may still come (share.ts). */
function finalEggs(): number {
  return keptState().log.length - (answersNow().kind === 'live' ? 1 : 0);
}

/** The Settings section, with how many final eggs are still to go. */
function drawShare(): void {
  renderShare(Math.max(0, finalEggs() - shareState().sent));
}

/**
 * Another tab wrote the log or the sharing state (the `storage` event): this
 * page takes it up at once rather than writing back what it loaded, which
 * would undo it. Eggs the other tab logged are folded here too, if it has
 * not folded them, and the time on screen moves with what was learned.
 */
function storedElsewhere(key: string | null): void {
  const calibration = calibrationStoredElsewhere(key);
  const sharing = shareStoredElsewhere(key);
  if (!calibration && !sharing) return;
  renderCalibNote(learning());
  drawShare();
  if (machine.phase === 'IDLE') recompute();
  if (calibration && eggsBehind() > 0) {
    void learn().then(() => {
      renderCalibNote(learning());
      if (machine.phase === 'IDLE') recompute();
    });
  }
}

/* ------------------------------------------------------------ thermometer */

/** The cook's answer to the offer. Either way it is not made again; the
 *  setting stays in the controls. */
function onProbeOffer(yes: boolean): void {
  settings.probeAsked = true;
  if (yes) settings.probe = true;
  page().probeSetting.checked = settings.probe;
  page().roomField.hidden = !settings.probe;
  saveNow();
  render(Date.now());
}

/* -------------------------------------------------------------- language */

/** The picker, and the line under the Imperial option that says the English
 *  of 1750 is there, which only an English page shows. */
function applyLanguageToDom(): void {
  selectRadio('language', activeLocale());
  page().unitsPeriod.hidden = languageOf(activeLocale()) !== 'en';
}

/** Which language changes went in last, so two quick changes land in order. */
let languageAsked = 0;

/**
 * Take up a new language state: store it, and if the catalogue on screen
 * changes, fetch the new one and redraw every word in place. Nothing about the
 * egg changes, and the units are never touched from here: that rule runs one
 * way (LANGUAGE.md section 6). Only reachable while idle, since Settings is.
 */
function setLanguage(next: LanguageState): void {
  const before = effectiveLanguage(settings.language);
  settings.language = next;
  saveNow();
  const tag = effectiveLanguage(next);
  if (tag === before && tag === activeLocale()) {
    applyLanguageToDom();
    return;
  }
  const asked = ++languageAsked;
  void loadCopy(tag).then(() => {
    if (asked === languageAsked) relabel();
  });
}

/** The last line of Settings, "Version 0.4.0-alpha.1": the words from the
 *  catalogue, the number in a span of its own, fixed-width, so that the 1750
 *  face never draws its 0 as an o. Selectable, like the random number. */
function renderVersion(): void {
  const mark = '\u0001';
  const [before = '', after = ''] = t('colophon.version', { version: mark }).split(mark);
  const number = document.createElement('span');
  number.className = 'colophon__number';
  number.translate = false;
  number.textContent = APP_VERSION;
  page().appVersion.replaceChildren(before, number, after);
}

/** Every word on the page again, in the catalogue now active: the marked-up
 *  ones (`applyCopy`), and each one the code drew. */
function relabel(): void {
  applyCopy(document);
  labelInfoButtons();
  labelSteppers();
  labelTicks();
  renderMute();
  renderVersion();
  applyUnitsToDom();
  applyLanguageToDom();
  // Drawn only when what they say changes, so they are told it has.
  adviceShown = '';
  lastAnnounced = '';
  renderCalibNote(learning());
  if (machine.phase === 'IDLE') recompute();
  else render(Date.now());
}

/* ------------------------------------------------------------------ input */

function readInputs(source: EventTarget | null): void {
  const sizeIndex = Number(page().size.value);
  settings.sizeIndex = Number.isFinite(sizeIndex) ? sizeIndex : DEFAULTS.sizeIndex;

  // Measuring the egg any of the three ways overrides the size class, because
  // a measured egg is better information than a box label. A box cleared, or
  // holding something that is not a number, measures nothing: the egg stays.
  let measured_mm = NaN;
  if (source === page().measureMass) {
    measured_mm = minorFromMass_mm(readField(page().measureMass, 'mass', NaN));
  } else if (source === page().measureGirth) {
    measured_mm = minorFromGirth_mm(readField(page().measureGirth, 'girth', NaN));
  } else if (source === page().measureMinor) {
    measured_mm = readField(page().measureMinor, 'width', NaN);
  }
  if (measured_mm > 0) {
    settings.measuredBy = source === page().measureMass ? 'scale'
      : source === page().measureGirth ? 'girth' : 'width';
    settings.customMinor_mm = clampNumber(measured_mm, LIMITS.minor_mm, settings.customMinor_mm);
    settings.sizeIndex = -1;
    page().size.value = '-1';
  }
  settings.startTempMode = radioValue('startTemp', 'fridge') as Settings['startTempMode'];
  // The three fields with a unit are read only when they are the one being
  // edited, like the measurements above: see `readField`.
  if (source === page().customTemp) {
    settings.customStart_C = readField(page().customTemp, 'eggTemp', settings.customStart_C);
  }
  if (source === page().altitude) {
    settings.altitude_m = readField(page().altitude, 'altitude', settings.altitude_m);
  }
  settings.startMode = radioValue('startMode', 'cold') as UiStartMode;
  settings.afterBoil = radioValue('afterBoil', 'hold') as Settings['afterBoil'];
  settings.cooling = radioValue('cooling', 'ice') as Cooling;
  if (source === page().litres) {
    settings.waterLitres = readField(page().litres, 'water', settings.waterLitres);
  }
  settings.eggCount = Math.round(clampNumber(page().eggCount.value, LIMITS.eggCount, settings.eggCount));
  settings.doneness = clampNumber(page().doneness.value, LIMITS.doneness, settings.doneness);
  // Ticking the box is saying so: the offer has its answer.
  if (page().probeSetting.checked !== settings.probe) settings.probeAsked = true;
  settings.probe = page().probeSetting.checked;
  // The room, measured: an emptied field is "not measured", and the room is
  // assumed again. Read only when it is the one being edited (`readField`).
  if (source === page().roomTemp) {
    settings.room_C = page().roomTemp.value.trim() === ''
      ? null : readField(page().roomTemp, 'roomTemp', settings.room_C ?? START_TEMP_PRESETS_C.room);
  }
  page().roomField.hidden = !settings.probe;
  labelStartTemps();

  page().customTempField.hidden = settings.startTempMode !== 'custom';
  syncMeasurements(source);
  labelMeasuredOption();
  scheduleSave();
}

function onInput(event: Event): void {
  // The units are a setting about the screen, not about the egg, and have
  // their own path.
  const target = event.target;
  if (target instanceof HTMLInputElement && target.name === 'units') {
    if (event.type === 'change') onUnits(target.value === 'imperial' ? 'imperial' : 'metric');
    return;
  }
  // So is the language, which changes every word and no number.
  if (target instanceof HTMLInputElement && target.name === 'language') {
    if (event.type === 'change' && LANGUAGES.includes(target.value)) {
      setLanguage(languageAfterPick(settings.language, target.value));
    }
    return;
  }
  readInputs(target);
  // Instant feedback on what the eye is on while dragging or choosing - the
  // reading under the slider, the sentence, the boiling point beside the
  // altitude; the full solve (tens of milliseconds) follows and corrects them.
  renderDonenessReading(settings.doneness, isSousVide() ? { bath_C: SOUS_VIDE_BATH_C } : { peakYolk_C: targetPeakYolk_C(settings.doneness) });
  page().statBoil.textContent = show('boilingPoint', boilingPoint_C());
  page().body.dataset['start'] = settings.startMode;
  renderSentence(liveSetupFacts(settings, sizeClasses, currentEgg()));
  scheduleSolve();
}

/* ------------------------------------------------------------------ cook */

function onTick(): void {
  const now = Date.now();

  if (machine.phase === 'HEATING' && ticket !== null && secondsToPull(machine, now) < SLOW_HOB_WHEN_LEFT_S
      && now - lastRevise_ms > SLOW_HOB_EVERY_S * 1000) {
    // The hob is slower than we assumed. Push the estimate out rather than
    // count down to an alarm for an egg that has not begun cooking.
    lastRevise_ms = now;
    const assumed = secondsHeating(machine, now) + SLOW_HOB_EXTRA_S;
    const sol = retime(ticket, assumed);
    setMachine(reviseProvisional(machine, sol.result.cookTime_s, assumed, coolingSecondsFor(sol.result)));
  }

  const step = advance(machine, now);
  if (step.machine !== machine) {
    setMachine(step.machine);
    if (step.event === 'pull') ringAlarm(true);
    if (step.event === 'done') finishCook();
  }
  render(now);
}

function startTicking(): void {
  if (ticker === null) ticker = startTicker(onTick);
}

function stopTicking(): void {
  if (ticker !== null) {
    ticker.stop();
    ticker = null;
  }
}

/** The egg is done: ring, then stop repainting and let the screen sleep. */
function finishCook(): void {
  ringAlarm(false);
  stopTicking();
  releaseScreen();
}

function reset(): void {
  stopAlarm();
  stopTicking();
  releaseScreen();
  // An egg finished and never answered about is still an egg: the cook, the
  // recommendation and the pull are data for the fit. It folds nothing.
  if (machine.phase === 'DONE' && answersNow().kind === 'none' && ticket !== null) {
    logEgg(eggRecordFor(ticket, machine, null));
    void learn();
  }
  forgetAnswers();
  ticket = null;
  machine = idleMachine(settings.cooling);
  clearCook();
  // A new cook, a new nudge.
  nudgeDraw = nudgeSeconds(Math.random());
  recompute();
  // The egg just finished is final now: no answer can be added to it.
  drawShare();
  void sendFinal();
}

function onPrimary(): void {
  const now = Date.now();
  stopAlarm();

  if (machine.phase === 'IDLE') {
    // The audio context must be created inside a user gesture or the alarm is
    // silently blocked later, when it matters.
    primeAudio();
    keepScreenAwake();
    const boil = timeToBoil_s();
    // Take the answer up one last time while the controls are still live: the
    // level this returns is the one the cook is run at, and it does not move
    // again until the cook is over.
    profile = cachedOddsProfile(currentInputs(boil), calib);
    const answer = answerFor(boil, settings.doneness, profile);
    applyAnswer(answer);
    // The time on screen is the one started: the chosen one if this pot's
    // surface is in, and the mean solve's if the cook was quicker than it.
    const chosen = decided(answer, boil);
    solution = chosen.solution;
    decision = chosen.decision;
    outcome = chosen.outcome;
    const target = settings.doneness;
    const cook = solution.result.cookTime_s;
    // A cook started here is this tab's own, whatever happened before it.
    forgetAnswers();
    ticket = {
      egg: currentEgg(),
      massFrom: massFrom(),
      sizeTable: massFrom() === 'class' ? sizeTable : null,
      boilRemembered: hasBoilMemory(boilMemory),
      eggFrom: settings.startTempMode,
      setup: buildSetup(boil),
      logNominalTarget: logYolkTarget(target),
      units: unitSystem(),
      lang: activeLocale(),
      lean_s: decision === null ? 0 : decision.cookTime_s - decision.meanCookTime_s,
      nudge_s: chosen.nudge_s,
      outcome: decision === null ? null : outcome,
      // What the app says now, as the record keeps it (DECISIONS.md 37).
      forecast: decision === null || outcome === null ? null : forecastOf(outcome, cook),
      peakYolk_C: solution.result.peakYolk_C,
      probeMoment: probeMomentFor(solution.result, settings.cooling),
    };
    // The cooling counts to the yolk's peak for this cook.
    const cool = coolingSecondsFor(solution.result);
    setMachine(settings.startMode === 'cold'
      ? startCold(now, cook, boil, settings.cooling, target, cool)
      : startHot(now, cook, settings.cooling, target, cool));
    lastRevise_ms = now;
    startTicking();
    blip();
    render(now);
    return;
  }

  if (machine.phase === 'HEATING' && ticket !== null) {
    const measured = secondsHeating(machine, now);
    boilMemory = rememberTimeToBoil(boilMemory, ticket.setup.waterLitres, measured);
    const sol = retime(ticket, measured);
    setMachine(recordBoil(machine, now, sol.result.cookTime_s, coolingSecondsFor(sol.result)));
    blip();
    onTick();
    return;
  }

  if (machine.phase === 'PULL') {
    const next = beginCooling(machine, now);
    setMachine(next);
    if (next.phase === 'DONE') finishCook();
    render(now);
    return;
  }

  if (machine.phase === 'DONE') reset();
}

/* ------------------------------------------------------------------ boot */

function buildSizeOptions(): void {
  for (let i = 0; i < sizeClasses.length; i += 1) {
    const option = document.createElement('option');
    option.value = String(i);
    page().size.append(option);
  }
  const custom = document.createElement('option');
  custom.value = '-1';
  page().size.append(custom);
}

/** The classes' names, with their masses in the units on screen, and the
 *  measured egg's. */
function labelSizeOptions(): void {
  for (let i = 0; i < sizeClasses.length; i += 1) {
    const label = sizeClassLabel(sizeClasses[i], unitSystem());
    page().size.options[i].textContent = t(label.key, { mass: t(label.mass.key, { value: label.mass.value }) });
  }
  labelMeasuredOption();
}

/** The measured egg's option carries its mass, as iOS's does, so choosing it
 *  says which egg comes back (D6). */
function labelMeasuredOption(): void {
  const measured = eggFromMinorDiameter(settings.customMinor_mm / 1000);
  page().size.options[sizeClasses.length].textContent = t('controls.size.measured', {
    mass: show('mass', measured.mass_kg * 1000),
  });
}

function applyLimit(input: HTMLInputElement, limit: Limit): void {
  input.min = String(limit.lo);
  input.max = String(limit.hi);
}

/** Everything the markup says about numbers comes from the same tables the
 *  model reads, so a bound or a preset changed in one place changes here too. */
function applyConstantsToDom(): void {
  applyLimit(page().eggCount, LIMITS.eggCount);
  applyLimit(page().doneness, LIMITS.doneness);
  page().doneness.step = String(1 / SLIDER_STEPS);
}

/** Everything on the form that has a unit: each input's step, bounds, unit
 *  and contents, the preset labels, and the size menu. Run at boot and again
 *  whenever the cook changes system, from the stored SI values - so switching
 *  back and forth never moves the egg. */
function applyUnitsToDom(): void {
  applyMeasure(page().measureMass, page().unitMass, measure('mass'));
  applyMeasure(page().measureGirth, page().unitGirth, measure('girth'));
  applyMeasure(page().measureMinor, page().unitMinor, measure('width'));
  applyMeasure(page().customTemp, page().unitTemp, measure('eggTemp'));
  applyMeasure(page().altitude, page().unitAltitude, measure('altitude'));
  applyMeasure(page().litres, page().unitLitres, measure('water'));
  applyMeasure(page().probeReading, page().unitProbe, measure('probeTemp'));
  applyMeasure(page().roomTemp, page().unitRoom, measure('roomTemp'));
  syncMeasurements(null);
  page().customTemp.value = inputText('eggTemp', settings.customStart_C);
  page().litres.value = inputText('water', settings.waterLitres);
  page().altitude.value = inputText('altitude', settings.altitude_m);
  // Empty until measured, showing the room assumed, greyed: the − and + start
  // there.
  page().roomTemp.value = settings.room_C === null ? '' : inputText('roomTemp', settings.room_C);
  page().roomTemp.placeholder = String(nudgeFrom(measure('roomTemp'), START_TEMP_PRESETS_C.room));
  page().moreRoom.textContent = t('controls.room.more', {
    room: show('temperature', START_TEMP_PRESETS_C.room),
  });
  selectRadio('units', unitSystem());
  labelSizeOptions();
  labelStartTemps();
  page().startSousLabel.textContent = t('controls.start.sousVide', {
    bath: show('temperature', SOUS_VIDE_BATH_C),
  });
  page().helpSousVide.textContent = t('help.unsure.sousVide', {
    floor: show('temperature', SOUS_VIDE_MODEL_FLOOR_C),
  });
  // The sentence's masses and temperatures are in the units too.
  redrawSentence();
  renderSentence(liveSetupFacts(settings, sizeClasses, currentEgg()));
}

/** The presets are assumptions, and are labelled as such rather than baked
 *  into the buttons: a room is not necessarily 20 C, and Custom is there for
 *  anyone who knows better. A measured room is what the Room button means. */
function labelStartTemps(): void {
  page().startTempHint.textContent = t('controls.eggFrom.hint', {
    fridge: show('temperature', startTempPreset_C('fridge', room_C())),
    room: show('temperature', startTempPreset_C('room', room_C())),
  });
}

function applySettingsToDom(): void {
  page().size.value = String(settings.sizeIndex);
  applyUnitsToDom();
  selectRadio('startTemp', settings.startTempMode);
  selectRadio('startMode', settings.startMode);
  selectRadio('afterBoil', settings.afterBoil);
  selectRadio('cooling', settings.cooling);
  page().eggCount.value = String(settings.eggCount);
  page().doneness.value = String(settings.doneness);
  page().customTempField.hidden = settings.startTempMode !== 'custom';
  page().probeSetting.checked = settings.probe;
  page().roomField.hidden = !settings.probe;
  applyLanguageToDom();
}

export function boot(): void {
  bindDom();
  settings = loadSettings(sizeClasses);
  useUnits(settings.unitsChosen);
  boilMemory = loadBoilMemory();
  calib = loadCalibration();
  machine = idleMachine(settings.cooling);

  buildSizeOptions();
  buildTicks();
  buildClauses();
  applyConstantsToDom();
  applySettingsToDom();

  // The egg's two controls and its sentence, and the Settings page's, are
  // read the same way: every input goes through readInputs.
  for (const id of ['controls', 'settingsForm']) {
    const form = el<HTMLFormElement>(id);
    form.addEventListener('input', onInput);
    form.addEventListener('change', onInput);
    form.addEventListener('submit', (event) => event.preventDefault());
  }

  page().primary.addEventListener('click', onPrimary);
  page().secondary.addEventListener('click', reset);
  page().mute.addEventListener('click', onToggleMute);
  wireForget(forgetAll);
  wireExport(() => exportResults(shareState().uid, Date.now()));
  // Every (i) opens in place. They are buttons, so the keyboard reaches and
  // works them, and aria-expanded says which way they stand.
  wireInfoButtons();
  wireSteppers();
  setStepRule(page().roomTemp, (value, up) => stepPast(measure('roomTemp'), value, up));
  wireViews();
  page().probeOfferYes.addEventListener('click', () => onProbeOffer(true));
  page().probeOfferNo.addEventListener('click', () => onProbeOffer(false));
  setMuted(settings.muted);
  renderMute();
  renderVersion();

  wireFeedback({
    machine: () => machine,
    ticket: () => ticket,
    calib: () => calib,
    persist: persistCook,
    learned: () => renderLearned(learning()),
  });

  renderCalibNote(learning());
  restoreCook();
  // Sharing, if the cook turned it on: every egg in the log is final but the
  // one on screen, whose answers may still come. A deletion not yet confirmed
  // is asked again first.
  // Turning sharing on or off moves the time by the nudge, so the egg page
  // is solved again with the section redrawn.
  wireShare(() => { drawShare(); recompute(); });
  loadShare({ log: () => keptState().log, finalCount: finalEggs, changed: drawShare });
  drawShare();
  void retryDeletes().then(sendFinal);
  window.addEventListener('online', () => { void retryDeletes().then(sendFinal); });
  window.addEventListener('storage', (event) => { storedElsewhere(event.key); });
  // A cook picked back up is described by its ticket, never by the
  // controls, which another tab may have changed since "Eggs in".
  if (machine.phase === 'IDLE') recompute();
  else if (ticket !== null) {
    solution = resolveDuring(ticket, ticket.setup.timeToBoil_s);
    render(Date.now());
  }
  // Eggs written down but not yet folded - a reload mid-fold, or a posterior
  // that had to be rebuilt from the log - are folded now, off the main thread.
  // The app runs on what it had until they land.
  if (eggsBehind() > 0) {
    void learn().then(() => {
      renderCalibNote(learning());
      if (machine.phase === 'IDLE') recompute();
    });
  }
  // The app opens with no signal, from the last build it kept; a newer one
  // takes over only between cooks (offline.ts).
  startOffline(() => machine.phase === 'IDLE');
}

/**
 * Pick a cook back up after a reload.
 *
 * The deadlines are absolute, so the countdown resumes at the right number
 * rather than restarting - which is the whole reason the machine was built this
 * way. What does NOT come back is the alarm: it lives in this tab's audio
 * context and died with the old page, so a restored cook says so rather than
 * letting someone walk away trusting a noise that will not happen.
 */
function restoreCook(): void {
  const text = storedCookText();
  const stored = loadCook();
  if (stored === null) {
    // Another build's cook, most likely: kept aside, as stored, and exported
    // with the results (DECISIONS.md 81). Its egg may be one nothing else holds.
    if (text !== null) keepUnreadCook(text);
    clearCook();
    return;
  }

  // A running cook is described by its ticket alone, so one that cannot be
  // read is dropped rather than shown against the controls - and kept aside.
  const now = Date.now();
  const backTicket = restoreTicket(stored.ticket);
  const back = restoreMachine(stored.machine, now);
  if (back === null || backTicket === null) {
    const stale = staleMachine(stored.machine, now);
    if (backTicket === null || stale === null) {
      if (text !== null) keepUnreadCook(text);
    } else if (stale.phase === 'DONE' && stored.answers === 'none') {
      // Too old to pick back up, but finished and never answered about: still
      // an egg, logged as "Start again" would have logged it.
      logEgg(eggRecordFor(backTicket, stale, null));
      void learn();
    }
    clearCook();
    return;
  }
  machine = back;
  ticket = backTicket;
  resumeAnswers(stored.answers);

  const step = advance(machine, now);
  machine = step.machine;
  persistCook();

  if (machine.phase !== 'DONE') {
    keepScreenAwake();
    startTicking();
  }
}
