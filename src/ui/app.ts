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
  Egg, SizeTable, eggFromMass, eggFromMinorDiameter, sizeClassesFor, sizeTableFor,
} from '../core/geometry.js';
import { boilingPointAtAltitude } from '../core/thermo.js';
import { Cooling, CookSetup, StartMode } from '../core/protocol.js';
import { SOUS_VIDE_BATH_C, sousVideEstimate } from '../core/sousvide.js';
import {
  Measure, Quantity, UnitSystem, chooseUnits, displayText, parse, sizeClassLabel,
} from '../core/units.js';
import {
  DONENESS_ANCHORS, Solution, donenessFromSlider, solveCookTime,
} from '../core/solve.js';
import {
  DEFAULTS, SLIDER_STEPS, Verdict, ambientFor, anchorNear, coolingSecondsFor,
  plausibleProbeRange_C, probeMomentFor, targetPeakYolk_C, textureFor, verdictFor,
} from '../core/policy.js';
import { Feedback, WhiteReport } from '../core/infer.js';
import { EggFrom, MassFrom, ProbeReading, recordCookTime_s, recordProbe_C } from '../core/record.js';
import {
  Calibration, calibrationDoneness, calibrationParams, clearCalibration, eggRecordFor, eggsBehind,
  learn, loadCalibration, logEgg, recordSecondAnswer,
} from './calibration.js';
import {
  LIMITS, Limit, START_TEMP_PRESETS_C, Settings, UiStartMode, clampNumber,
  clearBoilMemory, clearCook, estimateTimeToBoil, hasBoilMemory, loadBoilMemory,
  loadCook, loadSettings, rememberTimeToBoil, saveCook, saveSettings,
} from './store.js';
import { sousVideCopy } from './sousvide.js';
import { activeLocale, t } from './copy.js';
import { formatClock, spokenClock } from './countdown.js';
import {
  REGION, REGIONAL_UNITS, announceFlip, measure, show, unitSystem, useUnits,
} from './units.js';
import {
  Machine, advance, beginCooling, idleMachine, recordBoil, restoreMachine,
  reviseProvisional, secondsAfterBoil, secondsHeating, secondsToCool, secondsToPull,
  startCold, startHot, PULL_GRACE_SECONDS,
} from './machine.js';
import {
  Ticker, blip, keepScreenAwake, primeAudio, releaseScreen, ringAlarm, setMuted, startTicker,
  stopAlarm,
} from './clock.js';

/* ------------------------------------------------------------------- DOM */

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`missing element #${id}`);
  return node as T;
}

const dom = {
  body: document.body,
  phaseLabel: el<HTMLParagraphElement>('phaseLabel'),
  digits: el<HTMLSpanElement>('digits'),
  announce: el<HTMLSpanElement>('announce'),
  subline: el<HTMLParagraphElement>('subline'),
  statYolk: el<HTMLElement>('statYolk'),
  statYolkLabel: el<HTMLElement>('statYolkLabel'),
  startHint: el<HTMLParagraphElement>('startHint'),
  statAfter: el<HTMLElement>('statAfter'),
  statBoil: el<HTMLElement>('statBoil'),
  note: el<HTMLParagraphElement>('note'),
  warn: el<HTMLParagraphElement>('warn'),
  mute: el<HTMLButtonElement>('mute'),
  doneness: el<HTMLInputElement>('doneness'),
  donenessBlockedSoft: el<HTMLDivElement>('donenessBlockedSoft'),
  donenessBlockedHard: el<HTMLDivElement>('donenessBlockedHard'),
  donenessTicks: el<HTMLDivElement>('donenessTicks'),
  donenessValue: el<HTMLParagraphElement>('donenessValue'),
  size: el<HTMLSelectElement>('size'),
  measureMass: el<HTMLInputElement>('measureMass'),
  measureGirth: el<HTMLInputElement>('measureGirth'),
  measureMinor: el<HTMLInputElement>('measureMinor'),
  unitMass: el<HTMLSpanElement>('unitMass'),
  unitGirth: el<HTMLSpanElement>('unitGirth'),
  unitMinor: el<HTMLSpanElement>('unitMinor'),
  unitTemp: el<HTMLSpanElement>('unitTemp'),
  unitLitres: el<HTMLSpanElement>('unitLitres'),
  unitAltitude: el<HTMLSpanElement>('unitAltitude'),
  startTempHint: el<HTMLParagraphElement>('startTempHint'),
  startSousLabel: el<HTMLLabelElement>('startSousLabel'),
  customTempField: el<HTMLDivElement>('customTempField'),
  customTemp: el<HTMLInputElement>('customTemp'),
  litres: el<HTMLInputElement>('litres'),
  eggCount: el<HTMLInputElement>('eggCount'),
  altitude: el<HTMLInputElement>('altitude'),
  primary: el<HTMLButtonElement>('primary'),
  primaryHint: el<HTMLParagraphElement>('primaryHint'),
  secondary: el<HTMLButtonElement>('secondary'),
  feedback: el<HTMLDivElement>('feedback'),
  calibNote: el<HTMLParagraphElement>('calibNote'),
  learnedNote: el<HTMLParagraphElement>('learnedNote'),
  forget: el<HTMLButtonElement>('forget'),
  probeSetting: el<HTMLInputElement>('probeSetting'),
  probeOffer: el<HTMLDivElement>('probeOffer'),
  probeOfferYes: el<HTMLButtonElement>('probeOfferYes'),
  probeOfferNo: el<HTMLButtonElement>('probeOfferNo'),
  probeEntry: el<HTMLDivElement>('probeEntry'),
  probeReading: el<HTMLInputElement>('probeReading'),
  unitProbe: el<HTMLSpanElement>('unitProbe'),
  probeSave: el<HTMLButtonElement>('probeSave'),
  probeNote: el<HTMLParagraphElement>('probeNote'),
};

function radios(name: string): HTMLInputElement[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`),
  );
}

function selectRadio(name: string, value: string): void {
  for (const input of radios(name)) input.checked = input.value === value;
}

function radioValue(name: string, fallback: string): string {
  for (const input of radios(name)) {
    if (input.checked) return input.value;
  }
  return fallback;
}

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

let settings: Settings = loadSettings(sizeClasses);
useUnits(settings.unitsChosen);
let boilMemory = loadBoilMemory();
/** Posterior over the model's uncertain constants, learned from how the user's
 *  own eggs actually turn out. Before any feedback this is the prior mean,
 *  i.e. the literature values. */
let calib: Calibration = loadCalibration();
let machine: Machine = idleMachine(settings.cooling);
let solution: Solution | null = null;
/** Set when the requested doneness had to be clamped; empty otherwise. */
let refusal = '';
/** What the running cook is, frozen at the moment it started.
 *
 *  The calibration must learn from the egg that was actually cooked, not from
 *  whatever the controls happen to say when the user gets round to answering
 *  how the egg was - which may be after a reload, and is certainly after the
 *  measured time to boil has replaced the guess. Everything the posterior
 *  update needs is captured here and nowhere else. */
let ticket: Ticket | null = null;
let ticker: Ticker | null = null;
let solveHandle = 0;
let saveHandle = 0;
let lastRevise_ms = 0;
let lastAnnounced = '';
/** True while the cook on screen is one that was picked back up after a reload.
 *  Cleared when that cook ends or is cancelled: it is a fact about a particular
 *  cook, not about the tab, and left set it would caption every later cook with
 *  a reload that had nothing to do with it. */
let restored = false;
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

/** The same cook, against a time to boil that is now known rather than
 *  guessed. Everything else about it is frozen. */
function withTimeToBoil(t: Ticket, timeToBoil_s: number): Ticket {
  return { ...t, setup: { ...t.setup, timeToBoil_s: timeToBoil_s } };
}

/** The cook that was started: the only thing the calibration is allowed to
 *  learn from. */
interface Ticket {
  egg: Egg;
  /** Which input the egg came from, whose carton if it was a class, and where
   *  its temperature came from. */
  massFrom: MassFrom;
  sizeTable: SizeTable | null;
  eggFrom: EggFrom;
  /** Whether the pan's time to boil was on file at "Eggs in": what a hot start,
   *  which never times its own pan, cooked on. */
  boilRemembered: boolean;
  setup: CookSetup;
  /** log10 of the yolk dose this cook was RUN at. Frozen with everything else,
   *  so a slider left somewhere else afterwards cannot rewrite history. */
  logNominalTarget: number;
  /** The system the cook was reading when they set this egg up, for the
   *  record. Everything above is SI whatever it says. */
  units: UnitSystem;
  /** The language they were reading it in, for the record. */
  lang: string;
  /** Whether this cook has a moment to probe at (E4): a counted cooling that
   *  ends when the yolk's centre peaks. Frozen with the cook, and moved only
   *  by the re-solve at the boil. */
  probeMoment: boolean;
}

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
  if (except !== dom.measureMass) dom.measureMass.value = inputText('mass', egg.mass_kg * 1000);
  if (except !== dom.measureGirth) dom.measureGirth.value = inputText('girth', Math.PI * minor_mm);
  if (except !== dom.measureMinor) dom.measureMinor.value = inputText('width', minor_mm);
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

/** The cook picks a system. Stored as their choice, and announced if it
 *  changes what is on screen - see `UNITS_FLIP_EVENT`. */
function onUnits(next: UnitSystem): void {
  const choice = chooseUnits(settings.unitsChosen, REGIONAL_UNITS, next);
  settings.unitsChosen = choice.chosen;
  useUnits(settings.unitsChosen);
  saveNow();
  applyUnitsToDom();
  recompute();
  if (choice.flip !== null) announceFlip(choice.flip);
}

function eggStart_C(): number {
  if (settings.startTempMode === 'custom') return settings.customStart_C;
  return START_TEMP_PRESETS_C[settings.startTempMode];
}

/** The room, as far as the model is concerned. The rule - an egg that has been
 *  sitting out IS the room, a fridge egg says nothing - is core policy. */
function ambient_C(): number {
  return ambientFor(eggStart_C());
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
  if (machine.phase !== 'IDLE' && settings.startMode === 'cold') return machine.assumedBoil_s;
  return estimateTimeToBoil(boilMemory, settings.waterLitres);
}

/** How much of the clock the ramp takes: all of the time to boil on a cold
 *  start, none of it otherwise. */
function rampSeconds(): number {
  return settings.startMode === 'cold' ? timeToBoil_s() : 0;
}

/** Why the form is shorter in sous-vide. The controls are hidden because the
 *  answer does not read them (see `.pan-only` in styles.css); saying so stops
 *  that reading as a bug or as lost settings. */
function renderStartHint(): void {
  dom.startHint.textContent = t(isSousVide() ? 'controls.start.hintSousVide' : 'controls.start.hint');
}

/* ------------------------------------------------------------------ copy */

/** The refusal, in words.
 *
 * The DECISION - which refusal applies, where the slider must move to, and
 * whether the gap is big enough to be worth a sentence at all - is
 * `verdictFor` in the core, so that this app and the iOS app cannot refuse
 * differently. What is left here is the sentence, which is this app's own: the
 * point is to teach the constraint, not merely to block the control.
 */
function refusalText(v: Verdict): string {
  if (!v.worthSaying) return '';
  const wanted = t(v.wanted.key).toLowerCase();
  const limit = t(v.limit.key).toLowerCase();

  if (v.kind === 'whiteNeverSets') return t('refusal.whiteNeverSets');

  if (v.kind === 'harderThanPanReaches') {
    return t('refusal.harderThanPan', {
      wanted: wanted, water: show('water', settings.waterLitres), limit: limit,
    });
  }

  if (settings.cooling === 'counter') return t('refusal.counter', { wanted: wanted, limit: limit });
  if (settings.cooling === 'tap') return t('refusal.tap', { wanted: wanted, limit: limit });
  return t('refusal.ice', { wanted: wanted, limit: limit });
}

/* --------------------------------------------------------------- solving */

/** A solve and what it implies, with nothing done about it yet.
 *
 * Splitting this out is the point: `solve()` used to solve, write a
 * module-level refusal string, move the slider, write the DOM and save to
 * localStorage, all from one function that the ticker and the boil tap both
 * called - so a slow hob could silently move the user's doneness mid-cook.
 * Deciding and acting are now two steps, and only the idle path takes the
 * second one. */
interface Answer {
  solution: Solution;
  verdict: Verdict;
}

/** Solve for the given inputs. Pure apart from reading `settings`: it moves
 *  nothing and writes nothing.
 *
 *  `snapRetry` is false for a cook already under way: the target is frozen, so
 *  re-solving at a snapped position would answer for an egg nobody is cooking. */
function answerFor(timeToBoil_s: number, level: number, snapRetry = true): Answer {
  const egg = currentEgg();
  const setup = buildSetup(timeToBoil_s);
  const params = calibrationParams(calib);
  const result = solveCookTime(egg, setup, params, calibrationDoneness(calib, level));
  const verdict = verdictFor(result, level);

  // Re-solve at the position the user is actually being offered, so the
  // numbers on screen are the numbers for that cook rather than for one that
  // was refused. Only worth it when the slider is going to move.
  if (snapRetry && verdict.snapTo !== null) {
    const retry = solveCookTime(egg, setup, params, calibrationDoneness(calib, verdict.snapTo));
    if (retry.reachable) return { solution: retry, verdict: verdict };
  }
  return { solution: result, verdict: verdict };
}

/** Take the answer up: show the refusal, and move the slider if the answer
 *  says it must. Only ever called while idle - once the egg is in the water
 *  the controls are gone and there is nothing to snap. */
function applyAnswer(answer: Answer): Solution {
  refusal = refusalText(answer.verdict);
  const snapTo = answer.verdict.snapTo;
  if (snapTo !== null && snapTo !== settings.doneness) {
    settings.doneness = snapTo;
    dom.doneness.value = String(snapTo);
    saveNow();
  }
  return answer.solution;
}

/* --------------------------------------------------------------- display */

/** The texture note. Which band a temperature falls in is core policy; what
 *  the band is called is this app's copy. */
function textureNote(peakYolk_C: number, peakWhite_C: number): string {
  const band = textureFor(peakYolk_C, peakWhite_C);
  const white = band.white === 'justSet' ? 'texture.white.justSet'
    : band.white === 'set' ? 'texture.white.set'
      : 'texture.white.firm';
  const yolk = band.yolk === 'liquid' ? 'texture.yolk.liquid'
    : band.yolk === 'soft' ? 'texture.yolk.soft'
      : band.yolk === 'jammy' ? 'texture.yolk.jammy'
        : band.yolk === 'fudgy' ? 'texture.yolk.fudgy'
          : 'texture.yolk.set';
  return t('texture.note', { white: t(white), yolk: t(yolk) });
}

/** The reading under the slider. The same shape whether the temperature is
 *  the solver's or the quick interpolation that tracks the thumb, so it does
 *  not flicker between two formats mid-drag. */
function donenessValueText(peakYolk_C: number): string {
  return t('controls.doneness.value', {
    doneness: t(anchorNear(settings.doneness).key), yolk: show('temperature', peakYolk_C),
  });
}

/** Stripe out the parts of the track this setup cannot deliver: the soft end
 *  the white forbids, and - with the heat off - the hard end the pan cannot
 *  reach. If the white never sets there is nothing to offer, and the whole
 *  track says so. */
function renderDonenessScale(sol: Solution): void {
  const softest = sol.whiteSets ? sol.softestLevel : 1;
  const hardest = sol.whiteSets ? sol.hardestLevel : 0;
  dom.donenessBlockedSoft.style.width = `${clampNumber(softest * 100, { lo: 0, hi: 100 }, 0)}%`;
  dom.donenessBlockedHard.style.width = `${clampNumber((1 - hardest) * 100, { lo: 0, hi: 100 }, 0)}%`;
  dom.doneness.setAttribute('aria-valuetext', t(anchorNear(settings.doneness).key));
  const ticks = dom.donenessTicks.children;
  for (let i = 0; i < ticks.length; i += 1) {
    const anchor = DONENESS_ANCHORS[i];
    if (anchor === undefined) continue;
    const blocked = anchor.level < softest - 0.005 || anchor.level > hardest + 0.005;
    ticks[i].classList.toggle('blocked', blocked);
  }
}

function renderMute(): void {
  dom.mute.textContent = t(settings.muted ? 'readout.mute.off' : 'readout.mute.on');
  dom.mute.setAttribute('aria-pressed', settings.muted ? 'true' : 'false');
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
  dom.primary.textContent = label;
  dom.primary.hidden = !visible;
  // Enabled unless the caller says otherwise, so a disabled Start cannot leak
  // into the next phase's button.
  dom.primary.disabled = false;
  dom.primaryHint.textContent = hint;
}

function render(now_ms: number): void {
  // Sous-vide is answered honestly and separately: no cook to run, no clock to
  // start, and a start time that has already been and gone. It goes FIRST,
  // before any of the pan readout is computed or painted - it used to run
  // after a full hot-start solve and after the stats row had already been
  // written, so it both paid for an answer it discarded and left half of that
  // answer on screen beside its own.
  renderStartHint();
  if (isSousVide() && machine.phase === 'IDLE') {
    renderSousVide(now_ms);
    return;
  }

  const sol = solution;
  if (sol === null) return;

  dom.statYolkLabel.textContent = t('readout.stat.peakYolk');

  dom.body.dataset['phase'] = machine.phase;
  dom.body.dataset['start'] = settings.startMode;

  const cookTime_s = machine.phase === 'IDLE' ? sol.result.cookTime_s : machine.cookTime_s;
  const boil_s = rampSeconds();
  const standing = settings.afterBoil === 'off';

  dom.statYolk.textContent = show('temperature', sol.result.peakYolk_C);
  dom.statAfter.textContent = formatClock(cookTime_s - boil_s);
  dom.statBoil.textContent = show('boilingPoint', boilingPoint_C());
  // The texture note reads peak temperatures; the white's own criterion is a
  // dose. They disagree only when the pan never gets the white there at all,
  // and then the dose is the one telling the truth.
  dom.note.textContent = sol.whiteSets
    ? textureNote(sol.result.peakYolk_C, sol.result.peakWhite_C)
    : t('texture.white.runny');
  // The warning line carries one of two things. A refusal is advice about the
  // slider, so it is idle-only: popping "jammy isn't reachable" onto the screen
  // while the egg is already in the water is advice about a control the user
  // cannot reach. A restored cook is the opposite - it only exists mid-cook.
  let warning = '';
  // Only while the cook is still in flight. At DONE the egg is out and "keep
  // this tab open" is advice about a deadline that has already passed.
  if (restored && machine.phase !== 'IDLE' && machine.phase !== 'DONE') {
    warning = t('readout.restored');
  } else if (machine.phase === 'IDLE' && refusal !== '') {
    warning = refusal;
  }
  dom.warn.textContent = warning;
  dom.warn.hidden = warning === '';
  dom.donenessValue.textContent = donenessValueText(sol.result.peakYolk_C);
  renderDonenessScale(sol);

  let label = '';
  let digits = '';
  let subline = '';
  let spoken = '';

  if (machine.phase === 'IDLE') {
    label = t('readout.phase.total');
    digits = formatClock(cookTime_s);
    subline = settings.startMode === 'cold'
      ? t(hasBoilMemory(boilMemory) ? 'readout.sub.coldAssumes' : 'readout.sub.coldGuesses',
        { boil: formatClock(boil_s) })
      : standing
        // With the heat off, how fast the pan cools is set by the water in it,
        // and that is the most load-bearing number in the cook. The time to
        // boil plays no part on a hot start, so it is not mentioned.
        ? t('readout.sub.standing', { water: show('water', settings.waterLitres) })
        : t('readout.sub.hot');
    spoken = t('spoken.total', { time: spokenClock(cookTime_s) });
    setPrimary(
      t(settings.startMode === 'cold' ? 'action.startHeating' : 'action.eggsIn'),
      sol.whiteSets
        ? settings.startMode === 'cold'
          ? t('action.hint.cold')
          : standing
            ? t('action.hint.hotStanding')
            : t('action.hint.hotBoiling', { time: formatClock(cookTime_s) })
        : t('action.hint.whiteNeverSets'),
      true,
    );
    // There is no cook on offer at all, so there is nothing to start. iOS has
    // always disabled this; the web offered a button that led nowhere.
    dom.primary.disabled = !sol.whiteSets;
    dom.secondary.hidden = true;
  } else if (machine.phase === 'HEATING') {
    label = t('readout.phase.heating');
    digits = formatClock(secondsToPull(machine, now_ms));
    subline = t('readout.sub.heating', {
      elapsed: formatClock(secondsHeating(machine, now_ms)), boil: formatClock(machine.assumedBoil_s),
    });
    spoken = t('spoken.heating', { time: spokenClock(secondsToPull(machine, now_ms)) });
    setPrimary(
      t('action.fullBoil'),
      t(standing ? 'action.hint.heatingStanding' : 'action.hint.heating'),
      true,
    );
    dom.secondary.hidden = false;
    dom.secondary.textContent = t('action.cancel');
  } else if (machine.phase === 'COOKING') {
    // The one instruction the user has to act on goes in the phase label, where
    // it sits next to the clock. The model holds the water at its boiling point
    // for the whole cook - or, with the heat off, assumes it cools on its own -
    // so this is not a style note: a pan taken off the heat when the model
    // expected a boil under-cooks by minutes, and vice versa.
    label = t(standing ? 'readout.phase.cookingHeatOff' : 'readout.phase.cookingBoiling');
    digits = formatClock(secondsToPull(machine, now_ms));
    subline = settings.startMode === 'cold'
      ? t('readout.sub.cookingCold', {
        boil: formatClock(machine.assumedBoil_s), after: formatClock(secondsAfterBoil(machine)),
      })
      : t('readout.sub.cookingHot');
    spoken = t('spoken.cooking', { time: spokenClock(secondsToPull(machine, now_ms)) });
    setPrimary('', t(standing ? 'action.hint.cookingStanding' : 'action.hint.cookingBoiling', {
      boiling: show('temperature', boilingPoint_C()),
    }), false);
    dom.secondary.hidden = false;
    dom.secondary.textContent = t('action.cancel');
  } else if (machine.phase === 'PULL') {
    const late = (now_ms - machine.pulledAt_ms) / 1000;
    label = t('readout.phase.pull');
    digits = `+${formatClock(late)}`;
    subline = t('readout.sub.pull');
    spoken = t('spoken.pull');
    const into = settings.cooling === 'ice' ? 'action.pulled.ice'
      : settings.cooling === 'tap' ? 'action.pulled.tap'
        : 'action.pulled.counter';
    setPrimary(
      t(into),
      t('action.hint.pull', { seconds: Math.max(0, Math.ceil(PULL_GRACE_SECONDS - late)) }),
      true,
    );
    // Reachable here too: a reload can land in this phase, and a cook you have
    // picked back up must always be one you can put down.
    dom.secondary.hidden = false;
    dom.secondary.textContent = t('action.cancel');
  } else if (machine.phase === 'COOLING') {
    label = t(settings.cooling === 'ice' ? 'readout.phase.coolingIce' : 'readout.phase.coolingTap');
    digits = formatClock(secondsToCool(machine, now_ms));
    // The countdown ends when the middle of the yolk peaks (E4), which is
    // also when a probe reading is asked for.
    subline = t(probeWanted() ? 'readout.sub.coolingProbe' : 'readout.sub.coolingPeak');
    spoken = t('spoken.cooling', { time: spokenClock(secondsToCool(machine, now_ms)) });
    setPrimary('', '', false);
    dom.secondary.hidden = false;
    dom.secondary.textContent = t('action.cancel');
  } else {
    label = t('readout.phase.done');
    digits = formatClock(cookTime_s);
    subline = settings.startMode === 'cold'
      ? t('readout.sub.doneCold', { boil: formatClock(boil_s), cooking: formatClock(cookTime_s - boil_s) })
      : t('readout.sub.doneHot');
    spoken = t(probePending() ? 'spoken.probe' : 'spoken.done');
    setPrimary(t('action.startAgain'), '', true);
    dom.secondary.hidden = true;
  }

  // The model is calibrated against the literature, not against this kitchen.
  // Asking once per egg is what closes that gap. Both questions stay on screen
  // until the cook moves on, answered or not; a reload after an answer puts
  // them away, since the second could no longer be folded.
  dom.feedback.hidden = machine.phase !== 'DONE' || (feedbackGiven && answered === null);
  if (!dom.feedback.hidden && answered === null) renderCalibNote();
  renderProbe();

  dom.phaseLabel.textContent = label;
  dom.digits.textContent = digits;
  dom.subline.textContent = subline;

  // The live region carries a coarse announcement, not a per-second one: the
  // ticking digits are aria-hidden, so a screen reader hears the phase and the
  // minute rather than being flooded once a second.
  const announcement = t('spoken.announcement', { label: label, spoken: spoken });
  const minute = digits.split(':')[0];
  const key = `${machine.phase}|${minute}`;
  if (key !== lastAnnounced) {
    lastAnnounced = key;
    dom.announce.textContent = announcement;
  }
}

/** The sous-vide readout: hold times from the isothermal limit, and the plain
 *  statement that you should have started yesterday. */
function renderSousVide(now_ms: number): void {
  dom.body.dataset['phase'] = machine.phase;
  dom.body.dataset['start'] = settings.startMode;
  renderStartHint();

  const egg = currentEgg();
  const doneness = calibrationDoneness(calib, settings.doneness);
  const est = sousVideEstimate(
    egg.radius_m, calibrationParams(calib).alpha_m2s, SOUS_VIDE_BATH_C,
    doneness.yolkDose_min, doneness.whiteDose_min,
  );
  const copy = sousVideCopy(est, now_ms);

  dom.phaseLabel.textContent = t('readout.phase.startTime');
  dom.digits.textContent = copy.headline;
  dom.subline.textContent = copy.subline;
  // The bath temperature is not a peak yolk temperature, and printing it under
  // that label said something false about the egg. In a bath held at 63 °C the
  // yolk ends up at 63 °C, which is the whole point, but the label has to say
  // which number it is.
  dom.statYolkLabel.textContent = t('readout.stat.bath');
  dom.statYolk.textContent = show('temperature', est.bath_C);
  dom.statBoil.textContent = show('boilingPoint', boilingPoint_C());
  // The slider reading is a pan number. There is no pan.
  dom.donenessValue.textContent = t('controls.doneness.valueBath', {
    doneness: t(anchorNear(settings.doneness).key), bath: show('temperature', est.bath_C),
  });
  dom.note.textContent = copy.note;
  dom.warn.textContent = copy.warn;
  dom.warn.hidden = false;
  setPrimary('', copy.hint, false);
  dom.secondary.hidden = true;
  dom.feedback.hidden = true;

  const key = `SOUS|${copy.headline}`;
  if (key !== lastAnnounced) {
    lastAnnounced = key;
    dom.announce.textContent = t('spoken.sousVide', {
      when: copy.headline.toLowerCase(), subline: copy.subline,
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
  saveCook(machine, ticket, feedbackGiven);
}

/* -------------------------------------------------------------- recompute */

/** Solve for what is on screen and take the answer up. Idle only in practice:
 *  every mid-cook path goes through `resolveDuring` instead, which keeps the
 *  target the cook was started at. */
function recompute(): void {
  // No pan, no solve. The sous-vide answer comes from src/core/sousvide.ts and
  // needs none of this.
  if (isSousVide() && machine.phase === 'IDLE') {
    refusal = '';
    renderSousVide(Date.now());
    return;
  }
  solution = applyAnswer(answerFor(timeToBoil_s(), settings.doneness));
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
function resolveDuring(timeToBoil_s: number): Solution {
  return answerFor(timeToBoil_s, machine.targetLevel, false).solution;
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

function renderCalibNote(): void {
  dom.calibNote.textContent = calib.eggsLogged === 0
    ? t('feedback.invite')
    : t('learned.tuned', { eggs: calib.eggsLogged });
  renderLearned();
}

/** What this kitchen has taught the app, and the way to take it back. */
function renderLearned(): void {
  const eggs = calib.eggsLogged;
  const pan = hasBoilMemory(boilMemory);
  if (eggs === 0 && !pan) {
    dom.learnedNote.textContent = t('learned.literature');
    dom.forget.hidden = true;
    return;
  }
  const tuned = eggs > 0 ? t('learned.tuned', { eggs: eggs }) : '';
  const measured = pan
    ? t('learned.pan', { time: formatClock(estimateTimeToBoil(boilMemory, settings.waterLitres)) })
    : '';
  dom.learnedNote.textContent = tuned !== '' && measured !== ''
    ? t('learned.both', { tuned: tuned, pan: measured })
    : tuned + measured;
  dom.forget.hidden = false;
}

/** Take it all back. A run of wrong answers about how the eggs were was otherwise
 *  undone only by clearing the site's storage - README 11.5 listed that as a
 *  known gap from the day the iOS app got its own version of this button. */
function onForget(): void {
  calib = clearCalibration();
  boilMemory = {};
  clearBoilMemory();
  renderCalibNote();
  recompute();
}

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
  if (ticket === null) return;
  settleRow(yolk !== null ? 'button.fb' : 'button.wb', pressed);
  foldAnswer(yolk, white, null);
}

/** Write the egg down with its first answer, or fold a later one into it -
 *  a yolk, a white or a probe reading, whichever came. */
function foldAnswer(yolk: Feedback | null, white: WhiteReport | null, probe: ProbeReading | null): void {
  const cooked = ticket;
  if (cooked === null) return;
  dom.calibNote.textContent = t('feedback.learning');
  const cookStarted = machine.startedAt_ms;
  const stillHere = (): boolean => machine.phase === 'DONE' && machine.startedAt_ms === cookStarted;
  const thanks = (): void => {
    if (stillHere()) dom.calibNote.textContent = t('feedback.thanks');
    renderLearned();
  };

  if (answered === null) {
    const index = logEgg(eggRecordFor(cooked, machine, yolk, white, probe));
    answered = { yolk: yolk, white: white, probe: probe, index: index };
    feedbackGiven = true;
    // Written down with the log, not after the fold: a reload between the two
    // would otherwise offer the questions again, and log the egg twice.
    persistCook();
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

/** Whether this cook will ask for a probe reading when its cooling ends. */
function probeWanted(): boolean {
  return settings.probe && ticket !== null && ticket.probeMoment;
}

/** Whether the probe is asked for NOW: the egg is done, and no reading yet. */
function probePending(): boolean {
  return machine.phase === 'DONE' && probeWanted() && !(feedbackGiven && answered === null)
    && (answered === null || answered.probe === null);
}

/** The once-only offer during a cook, and the reading at DONE. */
function renderProbe(): void {
  const running = machine.phase === 'HEATING' || machine.phase === 'COOKING'
    || machine.phase === 'PULL' || machine.phase === 'COOLING';
  dom.probeOffer.hidden = !(running && !settings.probeAsked && ticket !== null && ticket.probeMoment);
  // Asked for until it is given, and left showing what was given.
  const visible = probePending() || (machine.phase === 'DONE' && dom.probeReading.disabled);
  dom.probeEntry.hidden = !visible;
}

/** The cook's answer to the offer. Either way it is not made again; the
 *  setting stays in the controls. */
function onProbeOffer(yes: boolean): void {
  settings.probeAsked = true;
  if (yes) settings.probe = true;
  dom.probeSetting.checked = settings.probe;
  saveNow();
  render(Date.now());
}

/**
 * A reading typed at DONE, in the cook's units. Refused, with the range it
 * should be in, when no believable kitchen could have made it for this cook
 * (`plausibleProbeRange_C`); otherwise folded into the egg with whatever else
 * has been said about it, one fold per egg.
 */
function onProbeSave(): void {
  const cooked = ticket;
  if (cooked === null || dom.probeReading.disabled) return;
  if (answered !== null && answered.probe !== null) return;
  const typed = dom.probeReading.value.trim();
  if (typed === '') return;
  const reading_C = parse(measure('probeTemp'), Number(typed));
  const scoredAt_s = recordCookTime_s(eggRecordFor(cooked, machine, null));
  const [low, high] = plausibleProbeRange_C(
    cooked.egg, cooked.setup, calibrationParams(calib), scoredAt_s,
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

/* ------------------------------------------------------------------ input */

function readInputs(source: EventTarget | null): void {
  const sizeIndex = Number(dom.size.value);
  settings.sizeIndex = Number.isFinite(sizeIndex) ? sizeIndex : DEFAULTS.sizeIndex;

  // Measuring the egg any of the three ways overrides the size class, because
  // a measured egg is better information than a box label.
  let measured_mm = -1;
  if (source === dom.measureMass) {
    measured_mm = minorFromMass_mm(readField(dom.measureMass, 'mass', 62));
  } else if (source === dom.measureGirth) {
    measured_mm = minorFromGirth_mm(readField(dom.measureGirth, 'girth', 137));
  } else if (source === dom.measureMinor) {
    measured_mm = readField(dom.measureMinor, 'width', settings.customMinor_mm);
  }
  if (measured_mm > 0) {
    settings.measuredBy = source === dom.measureMass ? 'scale'
      : source === dom.measureGirth ? 'girth' : 'width';
    settings.customMinor_mm = clampNumber(measured_mm, LIMITS.minor_mm, settings.customMinor_mm);
    settings.sizeIndex = -1;
    dom.size.value = '-1';
  }
  settings.startTempMode = radioValue('startTemp', 'fridge') as Settings['startTempMode'];
  // The three fields with a unit are read only when they are the one being
  // edited, like the measurements above: see `readField`.
  if (source === dom.customTemp) {
    settings.customStart_C = readField(dom.customTemp, 'eggTemp', settings.customStart_C);
  }
  if (source === dom.altitude) {
    settings.altitude_m = readField(dom.altitude, 'altitude', settings.altitude_m);
  }
  settings.startMode = radioValue('startMode', 'cold') as UiStartMode;
  settings.afterBoil = radioValue('afterBoil', 'hold') as Settings['afterBoil'];
  settings.cooling = radioValue('cooling', 'ice') as Cooling;
  if (source === dom.litres) {
    settings.waterLitres = readField(dom.litres, 'water', settings.waterLitres);
  }
  settings.eggCount = Math.round(clampNumber(dom.eggCount.value, LIMITS.eggCount, settings.eggCount));
  settings.doneness = clampNumber(dom.doneness.value, LIMITS.doneness, settings.doneness);
  // Ticking the box is saying so: the offer has its answer.
  if (dom.probeSetting.checked !== settings.probe) settings.probeAsked = true;
  settings.probe = dom.probeSetting.checked;

  dom.customTempField.hidden = settings.startTempMode !== 'custom';
  syncMeasurements(source);
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
  readInputs(target);
  // Instant feedback on the two readings the eye is on while dragging; the
  // full solve (tens of milliseconds) follows and corrects them.
  dom.donenessValue.textContent = donenessValueText(targetPeakYolk_C(settings.doneness));
  dom.statYolk.textContent = show('temperature', targetPeakYolk_C(settings.doneness));
  dom.statBoil.textContent = show('boilingPoint', boilingPoint_C());
  dom.body.dataset['start'] = settings.startMode;
  scheduleSolve();
}

/* ------------------------------------------------------------------ cook */

/** A slow hob: when this little of the provisional countdown is left and the
 *  water has still not boiled, push the estimate out by REVISE_EXTRA_S, at
 *  most once per REVISE_INTERVAL_MS. */
const REVISE_WHEN_LEFT_S = 45;
const REVISE_EXTRA_S = 60;
const REVISE_INTERVAL_MS = 10000;

function onTick(): void {
  const now = Date.now();

  if (machine.phase === 'HEATING' && secondsToPull(machine, now) < REVISE_WHEN_LEFT_S
      && now - lastRevise_ms > REVISE_INTERVAL_MS) {
    // The hob is slower than we assumed. Push the estimate out rather than
    // count down to an alarm for an egg that has not begun cooking.
    lastRevise_ms = now;
    const assumed = secondsHeating(machine, now) + REVISE_EXTRA_S;
    solution = resolveDuring(assumed);
    if (ticket !== null) ticket = withTimeToBoil(ticket, assumed);
    if (ticket !== null) ticket = { ...ticket, probeMoment: probeMomentFor(solution.result, ticket.setup.cooling) };
    setMachine(reviseProvisional(
      machine, solution.result.cookTime_s, assumed, coolingSecondsFor(solution.result),
    ));
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
  if (machine.phase === 'DONE' && !feedbackGiven && ticket !== null) {
    logEgg(eggRecordFor(ticket, machine, null));
    void learn();
  }
  feedbackGiven = false;
  answered = null;
  resetRows();
  resetProbe();
  restored = false;
  ticket = null;
  machine = idleMachine(settings.cooling);
  clearCook();
  recompute();
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
    solution = applyAnswer(answerFor(boil, settings.doneness));
    const target = settings.doneness;
    const cook = solution.result.cookTime_s;
    // A cook started here is this tab's own, whatever happened before it.
    restored = false;
    ticket = {
      egg: currentEgg(),
      massFrom: massFrom(),
      sizeTable: massFrom() === 'class' ? sizeTable : null,
      boilRemembered: hasBoilMemory(boilMemory),
      eggFrom: settings.startTempMode,
      setup: buildSetup(boil),
      logNominalTarget: Math.log10(donenessFromSlider(target).yolkDose_min),
      units: unitSystem(),
      lang: activeLocale(),
      probeMoment: probeMomentFor(solution.result, settings.cooling),
    };
    // The cooling counts to the yolk's peak for this cook (E4).
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

  if (machine.phase === 'HEATING') {
    const measured = secondsHeating(machine, now);
    boilMemory = rememberTimeToBoil(boilMemory, settings.waterLitres, measured);
    solution = resolveDuring(measured);
    // Patch the measured ramp into the frozen setup rather than rebuilding it
    // from the live controls. They cannot change mid-cook today, which is what
    // made rebuilding harmless rather than correct.
    if (ticket !== null) ticket = withTimeToBoil(ticket, measured);
    if (ticket !== null) ticket = { ...ticket, probeMoment: probeMomentFor(solution.result, ticket.setup.cooling) };
    setMachine(recordBoil(
      machine, now, solution.result.cookTime_s, coolingSecondsFor(solution.result),
    ));
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
    dom.size.append(option);
  }
  const custom = document.createElement('option');
  custom.value = '-1';
  custom.textContent = t('controls.size.measured');
  dom.size.append(custom);
}

/** The classes' names, with their masses in the units on screen. */
function labelSizeOptions(): void {
  for (let i = 0; i < sizeClasses.length; i += 1) {
    const label = sizeClassLabel(sizeClasses[i], unitSystem());
    dom.size.options[i].textContent = t(label.key, { mass: t(label.mass.key, { value: label.mass.value }) });
  }
}

function buildTicks(): void {
  for (const anchor of DONENESS_ANCHORS) {
    const span = document.createElement('span');
    span.textContent = t(anchor.key);
    span.style.left = `${anchor.level * 100}%`;
    dom.donenessTicks.append(span);
  }
}

function applyLimit(input: HTMLInputElement, limit: Limit): void {
  input.min = String(limit.lo);
  input.max = String(limit.hi);
}

/** Everything the markup says about numbers comes from the same tables the
 *  model reads, so a bound or a preset changed in one place changes here too. */
function applyConstantsToDom(): void {
  applyLimit(dom.eggCount, LIMITS.eggCount);
  applyLimit(dom.doneness, LIMITS.doneness);
  dom.doneness.step = String(1 / SLIDER_STEPS);
}

/** Everything on the form that has a unit: each input's step, bounds, unit
 *  and contents, the preset labels, and the size menu. Run at boot and again
 *  whenever the cook changes system, from the stored SI values - so switching
 *  back and forth never moves the egg. */
function applyUnitsToDom(): void {
  applyMeasure(dom.measureMass, dom.unitMass, measure('mass'));
  applyMeasure(dom.measureGirth, dom.unitGirth, measure('girth'));
  applyMeasure(dom.measureMinor, dom.unitMinor, measure('width'));
  applyMeasure(dom.customTemp, dom.unitTemp, measure('eggTemp'));
  applyMeasure(dom.altitude, dom.unitAltitude, measure('altitude'));
  applyMeasure(dom.litres, dom.unitLitres, measure('water'));
  applyMeasure(dom.probeReading, dom.unitProbe, measure('probeTemp'));
  syncMeasurements(null);
  dom.customTemp.value = inputText('eggTemp', settings.customStart_C);
  dom.litres.value = inputText('water', settings.waterLitres);
  dom.altitude.value = inputText('altitude', settings.altitude_m);
  selectRadio('units', unitSystem());
  labelSizeOptions();
  // The presets are assumptions, and are labelled as such rather than baked
  // into the buttons: a room is not necessarily 20 C, and Custom is there for
  // anyone who knows better.
  dom.startTempHint.textContent = t('controls.eggFrom.hint', {
    fridge: show('temperature', START_TEMP_PRESETS_C.fridge),
    room: show('temperature', START_TEMP_PRESETS_C.room),
  });
  dom.startSousLabel.textContent = t('controls.start.sousVide', {
    bath: show('temperature', SOUS_VIDE_BATH_C),
  });
}

function applySettingsToDom(): void {
  dom.size.value = String(settings.sizeIndex);
  applyUnitsToDom();
  selectRadio('startTemp', settings.startTempMode);
  selectRadio('startMode', settings.startMode);
  selectRadio('afterBoil', settings.afterBoil);
  selectRadio('cooling', settings.cooling);
  dom.eggCount.value = String(settings.eggCount);
  dom.doneness.value = String(settings.doneness);
  dom.customTempField.hidden = settings.startTempMode !== 'custom';
  dom.probeSetting.checked = settings.probe;
}

export function boot(): void {
  buildSizeOptions();
  buildTicks();
  applyConstantsToDom();
  applySettingsToDom();

  const form = el<HTMLFormElement>('controls');
  form.addEventListener('input', onInput);
  form.addEventListener('change', onInput);
  form.addEventListener('submit', (event) => event.preventDefault());

  dom.primary.addEventListener('click', onPrimary);
  dom.secondary.addEventListener('click', reset);
  dom.mute.addEventListener('click', onToggleMute);
  dom.forget.addEventListener('click', onForget);
  dom.probeOfferYes.addEventListener('click', () => onProbeOffer(true));
  dom.probeOfferNo.addEventListener('click', () => onProbeOffer(false));
  dom.probeSave.addEventListener('click', onProbeSave);
  dom.probeReading.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') onProbeSave();
  });
  setMuted(settings.muted);
  renderMute();

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

  renderCalibNote();
  restoreCook();
  recompute();
  // Eggs written down but not yet folded - a reload mid-fold, or a posterior
  // that had to be rebuilt from the log - are folded now, off the main thread.
  // The app runs on what it had until they land.
  if (eggsBehind() > 0) {
    void learn().then(() => {
      renderCalibNote();
      if (machine.phase === 'IDLE') recompute();
    });
  }
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
  const stored = loadCook();
  if (stored === null) return;

  const now = Date.now();
  const back = restoreMachine(stored.machine, now);
  if (back === null) {
    clearCook();
    return;
  }

  machine = back;
  ticket = restoreTicket(stored.ticket);
  feedbackGiven = stored.feedbackGiven;
  restored = true;

  // Without a ticket there is nothing to learn from, so do not offer to learn.
  if (ticket === null) feedbackGiven = true;

  const step = advance(machine, now);
  machine = step.machine;
  persistCook();

  if (machine.phase !== 'DONE') {
    keepScreenAwake();
    startTicking();
  }
}

/** A stored ticket, or null if it cannot be trusted. Partial is not good
 *  enough: this is what the posterior learns from. */
function restoreTicket(raw: unknown): Ticket | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const target = r['logNominalTarget'];
  if (typeof target !== 'number' || !Number.isFinite(target)) return null;

  const egg = positiveFields(r['egg'], ['radius_m', 'minorDiameter_m', 'mass_kg', 'volume_m3']);
  if (egg === null) return null;

  const setup = r['setup'];
  if (setup === null || typeof setup !== 'object') return null;
  const st = setup as Record<string, unknown>;
  // Every number the solver will read. A partial setup does not throw - it
  // produces a plausible wrong answer, and then teaches it to the posterior.
  if (positiveFields(setup, ['boiling_C', 'waterLitres', 'eggCount']) === null) return null;
  for (const key of ['eggStart_C', 'ambient_C', 'timeToBoil_s']) {
    const value = st[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  }
  if (st['startMode'] !== 'cold' && st['startMode'] !== 'hot') return null;
  if (st['cooling'] !== 'ice' && st['cooling'] !== 'tap' && st['cooling'] !== 'counter') return null;
  if (st['afterBoil'] !== undefined && st['afterBoil'] !== 'hold' && st['afterBoil'] !== 'off') {
    return null;
  }

  // A ticket written before E1 does not say where the egg came from. The
  // controls cannot change while a cook is on screen, so the settings still
  // say what they said at "Eggs in".
  const mf = r['massFrom'];
  const ef = r['eggFrom'];
  const from = mf === 'scale' || mf === 'girth' || mf === 'width' || mf === 'class' ? mf : massFrom();
  return {
    egg: egg as Egg,
    massFrom: from,
    sizeTable: from === 'class' ? sizeTable : null,
    boilRemembered: r['boilRemembered'] === true
      || (r['boilRemembered'] === undefined && hasBoilMemory(boilMemory)),
    eggFrom: ef === 'fridge' || ef === 'room' || ef === 'custom' ? ef : settings.startTempMode,
    setup: setup as CookSetup,
    logNominalTarget: target,
    // A ticket written before F3 was written by a metric-only app.
    units: r['units'] === 'imperial' ? 'imperial' : 'metric',
    // And one written before F4 by an app that spoke only English.
    lang: typeof r['lang'] === 'string' && r['lang'] !== '' ? r['lang'] : 'en',
    // And one written before E4 counted a flat three minutes, not to a peak.
    probeMoment: r['probeMoment'] === true,
  };
}

/** The object, if every named field on it is a finite number above zero.
 *  Returns null rather than narrowing by assertion, so the cast at the end of
 *  `restoreTicket` is the last step rather than the only check. */
function positiveFields(raw: unknown, keys: string[]): object | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  for (const key of keys) {
    const value = r[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || !(value > 0)) return null;
  }
  return raw as object;
}
